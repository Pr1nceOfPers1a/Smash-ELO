const { sb, auth, adminOk, groupAdminOk } = require('./_lib');
const { getJson, putJson } = require('./_store');
const SKEY = (id) => `status/${id}.json`;
const UUID = /^[0-9a-f-]{36}$/i;
const nameOk = (s) => typeof s === 'string' && s.trim().length > 0 && s.length <= 24;
function valid(rs) {
  if (!Array.isArray(rs) || rs.length < 2 || rs.length > 8) return false;
  const seen = new Set();
  for (const x of rs) {
    if (!nameOk(x.name)) return false;
    if (!Number.isInteger(x.place) || x.place < 1 || x.place > 8) return false;
    if (x.char !== undefined && (typeof x.char !== 'string' || x.char.length > 30)) return false;
    if (x.rnd !== undefined && typeof x.rnd !== 'boolean') return false;
    for (const k of ['kills', 'deaths', 'sds', 'dmg']) {
      if (x[k] !== undefined && !(Number.isFinite(x[k]) && x[k] >= 0 && x[k] <= (k === 'dmg' ? 100000 : 999))) return false;
    }
    const k = x.name.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}
async function merge(b, res, g) {
  if (!groupAdminOk(g, b.gkey, b.admin)) return res.status(401).json({ error: 'Wrong admin password' });
  if (!nameOk(b.from) || !nameOk(b.to)) return res.status(400).json({ error: 'Bad names' });
  const from = b.from.trim(), to = b.to.trim();
  const fl = from.toLowerCase(), tl = to.toLowerCase();
  const r = await sb(`matches?select=id,results&group_id=eq.${g.id}&limit=5000`);
  const all = await r.json();
  const hit = all.filter((m) => m.results.some((x) => x.name.toLowerCase() === fl));
  // If a match has both players, merging would put one person in it twice.
  if (fl !== tl && hit.some((m) => m.results.some((x) => x.name.toLowerCase() === tl))) {
    return res.status(409).json({ error: 'Some matches include both players. Delete or fix them first.' });
  }
  for (const m of hit) {
    const results = m.results.map((x) => (x.name.toLowerCase() === fl ? { ...x, name: to } : x));
    const u = await sb(`matches?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ results }) });
    if (!u.ok) return res.status(500).json({ error: 'Merge stopped partway. Re-run it to finish.' });
  }
  return res.status(200).json({ ok: true, changed: hit.length });
}
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const b = req.body || {};
    let g = await auth(req);
    // Admin tools can act on any group by id (used by Merge players' group selector).
    if (req.method === 'POST' && (b.action === 'merge' || b.action === 'adminlist') && adminOk(b.admin) && UUID.test(b.group || '')) {
      const gr = await sb(`groups?id=eq.${b.group}&select=*&limit=1`);
      const row = gr.ok ? (await gr.json())[0] : null;
      g = row ? { id: row.id, name: row.name, tier: row.tier === 'free' ? 'free' : 'premier', adminKey: row.admin_key || '' } : null;
      if (!g) return res.status(404).json({ error: 'Group not found' });
    }
    if (!g) return res.status(401).json({ error: 'Not signed in to a group' });
    res.setHeader('x-tier', g.tier || 'premier'); // lets the app notice when a group is upgraded
    if (req.method === 'GET') {
      const r = await sb(`matches?select=id,ts,results&group_id=eq.${g.id}&order=ts.asc&limit=5000`);
      return res.status(200).json(await r.json());
    }
    if (req.method === 'POST') {
      if (b.action === 'adminlist') {
        if (!adminOk(b.admin)) return res.status(401).json({ error: 'Wrong Master Passkey' });
        const r = await sb(`matches?select=id,ts,results&group_id=eq.${g.id}&order=ts.asc&limit=5000`);
        return res.status(200).json(await r.json());
      }
      if (b.action === 'statuses') return res.status(200).json({ statuses: (await getJson(SKEY(g.id))) || {} });
      if (b.action === 'status') {
        // Anyone in the group can set anyone's status bubble (empty text clears it).
        if (!nameOk(b.name)) return res.status(400).json({ error: 'Bad name' });
        const text = String(b.text == null ? '' : b.text).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
        const all = (await getJson(SKEY(g.id))) || {};
        const key = b.name.trim().toLowerCase();
        if (text) { if (!all[key] && Object.keys(all).length >= 400) return res.status(400).json({ error: 'Too many statuses' }); all[key] = text; } else delete all[key];
        if (!(await putJson(SKEY(g.id), all))) return res.status(500).json({ error: 'Could not save status' });
        return res.status(200).json({ ok: true, statuses: all });
      }
      if (b.action === 'merge') return await merge(b, res, g);
      if (!valid(b.results)) return res.status(400).json({ error: 'Invalid match' });
      const free = g.tier === 'free'; // free groups: names and placements only, characters and combat stats are Premier
      const results = b.results.map((x) => {
        const rn = x.rnd === true || (typeof x.char === 'string' && /^random$/i.test(x.char.trim())); // "went random" is kept on every tier
        const ch = rn ? 'Random' : (x.char && x.char.trim()) || '';
        return { name: x.name.trim(), place: x.place, ...(rn ? { rnd: true } : {}), ...(!free && ch ? { char: ch } : {}), ...Object.fromEntries((free ? [] : ['kills', 'deaths', 'sds', 'dmg']).filter((k) => x[k] !== undefined).map((k) => [k, x[k]])) };
      });
      const r = await sb('matches', { method: 'POST', body: JSON.stringify({ results, group_id: g.id }) });
      if (!r.ok) return res.status(500).json({ error: 'Database error' });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      if (!groupAdminOk(g, b.gkey, b.admin)) return res.status(401).json({ error: 'Wrong admin password' });
      if (!UUID.test(b.id || '')) return res.status(400).json({ error: 'Bad id' });
      await sb(`matches?id=eq.${b.id}&group_id=eq.${g.id}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
};
