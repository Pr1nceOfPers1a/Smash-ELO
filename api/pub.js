// Public, read-only: how many matches have been logged across all groups. A single number, no names or groups.
const { sb } = require('./_lib');
const acc = require('./_acc');
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    const r = await sb('matches?select=id&limit=100000');
    let pct = null;
    try { const a = await acc.read(), n = a.accepted + a.missed; if (n >= 10) pct = Math.round(100 * a.accepted / n); } catch (e) {}
    return res.status(200).json({ matches: r.ok ? (await r.json()).length : 0, acc: pct });
  } catch (e) { res.status(200).json({ matches: 0 }); }
};
