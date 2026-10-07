const crypto = require('crypto');
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_KEY;
const sb = (path, opt = {}) =>
  fetch(`${U}/rest/v1/${path}`, {
    ...opt,
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...opt.headers },
  });
const UUID = /^[0-9a-f-]{36}$/i;
// Constant-time string compare.
const same = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
// ---- Master access. The Master Passkey (env ADMIN_PASSCODE) is only ever used to sign in; after that (and the emailed
// code, when 2FA is on) the browser holds a signed, expiring token. adminOk() accepts only such a token, never the raw passkey.
const secret = () => crypto.createHash('sha256').update('master|' + String(process.env.ADMIN_PASSCODE || '') + '|' + String(process.env.SUPABASE_SERVICE_KEY || '')).digest();
const mac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('hex');
const MASTER_TTL = 12 * 3600e3;
const signMaster = (ttl = MASTER_TTL) => { const exp = Date.now() + ttl; return `m1.${exp}.${mac('master|' + exp)}`; };
const adminOk = (tok) => {
  if (!process.env.ADMIN_PASSCODE || typeof tok !== 'string') return false;
  const m = /^m1\.(\d{10,15})\.([0-9a-f]{64})$/.exec(tok);
  return !!m && +m[1] > Date.now() && same(m[2], mac('master|' + m[1]));
};
// Emailed-code challenge: stateless. The code is only recoverable from the email; the server stores nothing.
const chalMac = (exp, nonce, code) => mac(`chal|${exp}|${nonce}|${code}`);
const makeChallenge = (code, ttl = 10 * 60e3) => { const exp = Date.now() + ttl, nonce = crypto.randomBytes(8).toString('hex'); return `c1.${exp}.${nonce}.${chalMac(exp, nonce, code)}`; };
const chalOk = (ch, code) => {
  const m = /^c1\.(\d{10,15})\.([0-9a-f]{16})\.([0-9a-f]{64})$/.exec(String(ch || ''));
  return !!m && +m[1] > Date.now() && /^\d{6}$/.test(String(code)) && same(m[3], chalMac(m[1], m[2], String(code)));
};
const twoFaOn = () => !!(process.env.RESEND_API_KEY && process.env.MASTER_EMAIL);
// Group admin password check (per-group). Master may also act, via a token.
const groupAdminOk = (g, key, tok) => adminOk(tok) || (!!g && !!g.adminKey && typeof key === 'string' && key.length > 0 && same(key, g.adminKey));
// Every group request carries the group id and passkey in headers. Returns {id,name} when they match, otherwise null.
async function auth(req) {
  const id = String(req.headers['x-group'] || ''), key = String(req.headers['x-key'] || '');
  if (!UUID.test(id) || !key || key.length > 80) return null;
  const r = await sb(`groups?id=eq.${id}&select=*&limit=1`); // * so this still works before the tiers SQL has been run
  if (!r.ok) return null;
  const g = (await r.json())[0];
  return g && same(g.passkey, key) ? { id: g.id, name: g.name, tier: g.tier === 'free' ? 'free' : 'premier', adminKey: g.admin_key || '' } : null;
}
module.exports = { sb, auth, same, adminOk, signMaster, makeChallenge, chalOk, twoFaOn, groupAdminOk, UUID };
