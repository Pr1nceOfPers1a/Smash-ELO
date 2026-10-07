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
const adminOk = (a) => !!process.env.ADMIN_PASSCODE && typeof a === 'string' && same(a, process.env.ADMIN_PASSCODE);
// Every group request carries the group id and passkey in headers. Returns {id,name} when they match, otherwise null.
async function auth(req) {
  const id = String(req.headers['x-group'] || ''), key = String(req.headers['x-key'] || '');
  if (!UUID.test(id) || !key || key.length > 80) return null;
  const r = await sb(`groups?id=eq.${id}&select=id,name,passkey&limit=1`);
  if (!r.ok) return null;
  const g = (await r.json())[0];
  return g && same(g.passkey, key) ? { id: g.id, name: g.name } : null;
}
module.exports = { sb, auth, same, adminOk, UUID };
