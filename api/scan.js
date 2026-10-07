// Best-effort rate limit (per server instance): 30 scans per hour.
const { auth } = require('./_lib');
const { bump } = require('./_counter');
const TK = require('./_trykeys');
const { runScan } = require('./_scanner');
let hits = [];
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    // A visitor with a temporary try-scan key may scan without a group. Nothing from a trial is saved or counted.
    const trial = typeof b.tryKey === 'string' && b.tryKey ? b.tryKey : '';
    if (trial) {
      if (TK.blocked(req)) return res.status(429).json({ error: 'Too many wrong tries. Wait a few minutes.' });
      let used = false;
      try { used = await TK.consume(trial); } catch (e) { return res.status(503).json({ error: 'Something went wrong. Try again in a moment.' }); }
      if (!used) { TK.fail(req); return res.status(401).json({ error: 'That key is wrong, used up or expired.' }); }
    } else if (!(await auth(req))) return res.status(401).json({ error: 'Not signed in to a group' });
    const giveBack = async () => { if (trial) await TK.refund(trial).catch(() => {}); }; // a failed scan does not use up a try
    if (!process.env.ANTHROPIC_API_KEY) { await giveBack(); return res.status(503).json({ error: 'Scanning is not set up' }); }
    const now = Date.now();
    hits = hits.filter((t) => now - t < 3600e3);
    if (hits.length >= 30) { await giveBack(); return res.status(429).json({ error: 'Scan limit reached, try again later' }); }
    hits.push(now);
    let out;
    try { out = await runScan(b); } catch (e) { await giveBack(); throw e; }
    if (out.players.length < 2) await giveBack(); // nothing readable: the try is not used up
    if (!trial) await bump(); // counts every scan that reached the model, saved or not (trials are not counted)
    res.status(200).json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Scan failed: unexpected server error' });
  }
};
