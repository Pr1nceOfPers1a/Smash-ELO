const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_KEY;
const sb = (path, opt = {}) =>
  fetch(`${U}/rest/v1/${path}`, {
    ...opt,
    headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...opt.headers },
  });
module.exports = { sb };
