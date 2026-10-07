// Public, read-only: how many matches have been logged across all groups. A single number, no names or groups.
const { sb } = require('./_lib');
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    const r = await sb('matches?select=id&limit=100000');
    return res.status(200).json({ matches: r.ok ? (await r.json()).length : 0 });
  } catch (e) { res.status(200).json({ matches: 0 }); }
};
