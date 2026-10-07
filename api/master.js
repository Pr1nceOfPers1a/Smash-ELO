// Master sign-in: Master Passkey, then (when set up) a 6-digit code emailed to MASTER_EMAIL.
const crypto = require('crypto');
const { same, adminOk, signMaster, makeChallenge, chalOk, twoFaOn } = require('./_lib');
const bad = new Map();
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'x').split(',')[0].trim();
const blocked = (req) => { const now = Date.now(), a = (bad.get(ipOf(req)) || []).filter((t) => now - t < 600e3); bad.set(ipOf(req), a); return a.length >= 8; };
const fail = (req) => { const a = bad.get(ipOf(req)) || []; a.push(Date.now()); bad.set(ipOf(req), a); };
const mask = (e) => { const [u, d] = String(e).split('@'); return u ? u[0] + '***@' + (d || '') : ''; };
async function sendCode(code) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Smash ELO <onboarding@resend.dev>',
      to: [process.env.MASTER_EMAIL],
      subject: `Smash ELO Master code: ${code}`,
      text: `Your Smash ELO Master sign-in code is ${code}. It expires in 10 minutes. If this wasn't you, change the Master Passkey.`,
    }),
  });
  return r.ok;
}
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    if (!process.env.ADMIN_PASSCODE) return res.status(503).json({ error: 'The Master Passkey is not set up on the server.' });
    if (b.action === 'check') return res.status(200).json({ ok: adminOk(b.token), twofa: twoFaOn() });
    if (blocked(req)) return res.status(429).json({ error: 'Too many wrong tries. Wait a few minutes.' });
    if (b.action === 'login') {
      if (typeof b.passkey !== 'string' || !same(b.passkey, process.env.ADMIN_PASSCODE)) { fail(req); return res.status(401).json({ error: 'Wrong Master Passkey.' }); }
      if (!twoFaOn()) return res.status(200).json({ step: 'done', token: signMaster(), twofa: false });
      const code = String(crypto.randomInt(100000, 1000000));
      if (!(await sendCode(code).catch(() => false))) return res.status(502).json({ error: "Couldn't send the code. Try again in a moment." });
      return res.status(200).json({ step: 'code', challenge: makeChallenge(code), email: mask(process.env.MASTER_EMAIL) });
    }
    if (b.action === 'verify') {
      if (!chalOk(b.challenge, String(b.code || '').trim())) { fail(req); return res.status(401).json({ error: 'Wrong or expired code.' }); }
      return res.status(200).json({ step: 'done', token: signMaster(), twofa: true });
    }
    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
};
