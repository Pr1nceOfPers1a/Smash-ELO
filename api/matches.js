const { sb } = require('./_lib');
const UUID = /^[0-9a-f-]{36}$/i;
const nameOk = (s) => typeof s === 'string' && s.trim().length > 0 && s.length <= 24;
function valid(rs) {
  if (!Array.isArray(rs) || rs.length < 2 || rs.length > 8) return false;
  const seen = new Set();
  for (const x of rs) {
    if (!nameOk(x.name)) return false;
    if (!Number.isInteger(x.place) || x.place < 1 || x.place > 8) return false;
    if (x.char !== undefined && (typeof x.char !== 'string' || x.char.length > 30)) return false;
    for (const k of ['kills', 'deaths', 'sds', 'dmg']) {
      if (x[k] !== undefined && !(Number.isFinite(x[k]) && x[k] >= 0 && x[k] <= (k === 'dmg' ? 100000 : 999))) return false;
    }
    const k = x.name.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}
async function merge(b, res) {
  if (b.admin !== process.env.ADMIN_PASSCODE) return res.status(401).json({ error: 'Wrong admin passcode' });
  if (!nameOk(b.from) || !nameOk(b.to)) return res.status(400).json({ error: 'Bad names' });
  const from = b.from.trim(), to = b.to.trim();
  const fl = from.toLowerCase(), tl = to.toLowerCase();
  const r = await sb('matches?select=id,results&limit=5000');
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
    if (req.method === 'GET') {
      const r = await sb('matches?select=id,ts,results&order=ts.asc&limit=5000');
      return res.status(200).json(await r.json());
    }
    if (req.method === 'POST') {
      if (b.action === 'merge') return await merge(b, res);
      if (b.passcode !== process.env.GROUP_PASSCODE) return res.status(401).json({ error: 'Wrong passcode' });
      if (!valid(b.results)) return res.status(400).json({ error: 'Invalid match' });
      const results = b.results.map((x) => ({ name: x.name.trim(), place: x.place, ...(x.char && x.char.trim() ? { char: x.char.trim() } : {}), ...Object.fromEntries(['kills', 'deaths', 'sds', 'dmg'].filter((k) => x[k] !== undefined).map((k) => [k, x[k]])) }));
      const r = await sb('matches', { method: 'POST', body: JSON.stringify({ results }) });
      if (!r.ok) return res.status(500).json({ error: 'Database error' });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      if (b.admin !== process.env.ADMIN_PASSCODE) return res.status(401).json({ error: 'Wrong admin passcode' });
      if (!UUID.test(b.id || '')) return res.status(400).json({ error: 'Bad id' });
      await sb(`matches?id=eq.${b.id}`, { method: 'DELETE' });
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
};
