const { sb } = require('./_lib');
const UUID = /^[0-9a-f-]{36}$/i;
function valid(rs) {
  if (!Array.isArray(rs) || rs.length < 2 || rs.length > 8) return false;
  const seen = new Set();
  for (const x of rs) {
    if (typeof x.name !== 'string' || !x.name.trim() || x.name.length > 24) return false;
    if (!Number.isInteger(x.place) || x.place < 1 || x.place > 8) return false;
    const k = x.name.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
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
      if (b.passcode !== process.env.GROUP_PASSCODE) return res.status(401).json({ error: 'Wrong passcode' });
      if (!valid(b.results)) return res.status(400).json({ error: 'Invalid match' });
      const results = b.results.map((x) => ({ name: x.name.trim(), place: x.place }));
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
