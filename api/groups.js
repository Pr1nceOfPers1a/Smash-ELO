const { sb, auth, same, adminOk, groupAdminOk, UUID } = require('./_lib');
let fails = [], signups = [];
const nameOk = (n) => typeof n === 'string' && n.trim().length >= 2 && n.trim().length <= 24;
const keyOk = (k) => typeof k === 'string' && k.length >= 4 && k.length <= 40 && k === k.trim();
const SETUP = 'Groups are not set up yet. Run the groups SQL in Supabase first.';
const TIERS = 'Group tiers are not set up yet. Run schema_tiers.sql in Supabase first.';
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'x').split(',')[0].trim();
const count = async (filter) => {
  const r = await sb(`matches?select=id&${filter}&limit=1`, { headers: { Prefer: 'count=exact' } });
  const m = (r.headers.get('content-range') || '').match(/\/(\d+)$/);
  return m ? +m[1] : 0;
};
const clash = async (r) => {
  const e = await r.json().catch(() => ({}));
  if (e.code === '42P01' || e.code === 'PGRST205') return [500, SETUP];
  if (e.code === '42703' || e.code === 'PGRST204') return [500, TIERS];
  if (e.code === '23505') return [409, /passkey/i.test(JSON.stringify(e)) ? 'That passkey is already used by another group.' : 'A group with that name already exists.'];
  return [500, 'Database error'];
};
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    if (b.action === 'join') {
      const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim(), now = Date.now();
      fails = fails.filter((f) => now - f.t < 600e3);
      if (fails.filter((f) => f.ip === ip).length >= 15) return res.status(429).json({ error: 'Too many wrong tries. Wait a few minutes.' });
      const nm = String(b.name || '').trim();
      if (!nm || nm.length > 24 || typeof b.passkey !== 'string' || !b.passkey || b.passkey.length > 80) return res.status(400).json({ error: 'Enter the group name and passkey.' });
      const r = await sb('groups?select=*&limit=500');
      if (!r.ok) return res.status(500).json({ error: SETUP });
      const g = (await r.json()).find((x) => x.name.toLowerCase() === nm.toLowerCase() && same(x.passkey, b.passkey));
      if (!g) { fails.push({ ip, t: now }); return res.status(401).json({ error: 'Wrong group name or passkey.' }); }
      return res.status(200).json({ id: g.id, name: g.name, tier: g.tier === 'free' ? 'free' : 'premier' });
    }
    // Anyone can start a FREE group. Premier groups are made by the Master below.
    if (b.action === 'signup') {
      const ip = ipOf(req), now = Date.now();
      signups = signups.filter((s) => now - s.t < 3600e3);
      if (signups.filter((s) => s.ip === ip).length >= 5) return res.status(429).json({ error: 'Too many groups created from here. Try again later.' });
      if (!nameOk(b.name)) return res.status(400).json({ error: 'Group name must be 2 to 24 characters.' });
      if (!keyOk(b.passkey)) return res.status(400).json({ error: 'Group password must be 4 to 40 characters, with no spaces at the ends.' });
      if (!keyOk(b.adminKey)) return res.status(400).json({ error: 'Admin password must be 4 to 40 characters, with no spaces at the ends.' });
      if (b.adminKey === b.passkey) return res.status(400).json({ error: 'The admin password must be different from the group password.' });
      const r = await sb('groups', { method: 'POST', body: JSON.stringify({ name: b.name.trim(), passkey: b.passkey, admin_key: b.adminKey, tier: 'free' }) });
      if (!r.ok) { const [c, m] = await clash(r); return res.status(c).json({ error: m }); }
      signups.push({ ip, t: now });
      const g = (await r.json())[0];
      return res.status(200).json({ ok: true, id: g.id, name: g.name, tier: 'free' });
    }
    // A group's admin proves the admin password here (the browser then keeps it for delete / merge).
    if (b.action === 'gadmin') {
      const g = await auth(req);
      if (!g) return res.status(401).json({ error: 'Not signed in to a group' });
      const ip = ipOf(req), now = Date.now();
      fails = fails.filter((f) => now - f.t < 600e3);
      if (fails.filter((f) => f.ip === ip).length >= 15) return res.status(429).json({ error: 'Too many wrong tries. Wait a few minutes.' });
      if (!groupAdminOk(g, b.gkey)) { fails.push({ ip, t: now }); return res.status(401).json({ error: 'Wrong admin password.' }); }
      return res.status(200).json({ ok: true });
    }
    if (!adminOk(b.admin)) return res.status(401).json({ error: 'Wrong Master Passkey' });
    if (b.action === 'list') {
      const r = await sb('groups?select=*&order=created_at.asc&limit=500');
      if (!r.ok) { const [c, m] = await clash(r); return res.status(c).json({ error: m }); }
      const groups = await r.json();
      const counts = await Promise.all(groups.map((g) => count(`group_id=eq.${g.id}`)));
      return res.status(200).json({ groups: groups.map((g, i) => ({ id: g.id, name: g.name, passkey: g.passkey, created_at: g.created_at, tier: g.tier === 'free' ? 'free' : 'premier', hasAdminKey: !!g.admin_key, matches: counts[i] })), orphans: await count('group_id=is.null') });
    }
    if (b.action === 'create') {
      if (!nameOk(b.name)) return res.status(400).json({ error: 'Group name must be 2 to 24 characters.' });
      if (!keyOk(b.passkey)) return res.status(400).json({ error: 'Passkey must be 4 to 40 characters, with no spaces at the ends.' });
      const tier = b.tier === 'free' ? 'free' : 'premier';
      if (b.adminKey !== undefined && b.adminKey !== '' && !keyOk(b.adminKey)) return res.status(400).json({ error: 'Admin password must be 4 to 40 characters, with no spaces at the ends.' });
      const r = await sb('groups', { method: 'POST', body: JSON.stringify({ name: b.name.trim(), passkey: b.passkey, tier, ...(b.adminKey ? { admin_key: b.adminKey } : {}) }) });
      if (!r.ok) { const [c, m] = await clash(r); return res.status(c).json({ error: m }); }
      const g = (await r.json())[0];
      let adopted = 0;
      if (b.adopt) {
        const u = await sb('matches?group_id=is.null', { method: 'PATCH', body: JSON.stringify({ group_id: g.id }) });
        adopted = u.ok ? (await u.json()).length : 0;
      }
      return res.status(200).json({ ok: true, id: g.id, tier, adopted });
    }
    if (b.action === 'update') {
      if (!UUID.test(b.id || '')) return res.status(400).json({ error: 'Bad id' });
      const patch = {};
      if (b.name !== undefined) { if (!nameOk(b.name)) return res.status(400).json({ error: 'Group name must be 2 to 24 characters.' }); patch.name = b.name.trim(); }
      if (b.passkey !== undefined) { if (!keyOk(b.passkey)) return res.status(400).json({ error: 'Passkey must be 4 to 40 characters, with no spaces at the ends.' }); patch.passkey = b.passkey; }
      if (b.tier !== undefined) { if (b.tier !== 'free' && b.tier !== 'premier') return res.status(400).json({ error: 'Bad tier' }); patch.tier = b.tier; }
      if (b.adminKey !== undefined) { if (!keyOk(b.adminKey)) return res.status(400).json({ error: 'Admin password must be 4 to 40 characters, with no spaces at the ends.' }); patch.admin_key = b.adminKey; }
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to change' });
      const r = await sb(`groups?id=eq.${b.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      if (!r.ok) { const [c, m] = await clash(r); return res.status(c).json({ error: m }); }
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
};
