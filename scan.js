// Best-effort rate limit (per server instance): 30 scans per hour.
let hits = [];
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    if (b.passcode !== process.env.GROUP_PASSCODE) return res.status(401).json({ error: 'Wrong passcode' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Scanning is not set up' });
    const now = Date.now();
    hits = hits.filter((t) => now - t < 3600e3);
    if (hits.length >= 30) return res.status(429).json({ error: 'Scan limit reached, try again later' });
    hits.push(now);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b.image } },
          { type: 'text', text: 'This is a Super Smash Bros. results screen. Reply with ONLY JSON: {"players":[{"name":"<player name tag shown>","place":<1-based placement; tied players share a number>}]}. Use only the player name tags; ignore characters. If unreadable, reply {"players":[]}.' },
        ] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Scan failed' });
    const m = (j.content?.[0]?.text || '').match(/\{[\s\S]*\}/);
    const players = (m ? JSON.parse(m[0]).players : []) || [];
    res.status(200).json({ players });
  } catch (e) {
    res.status(500).json({ error: 'Scan failed' });
  }
};
