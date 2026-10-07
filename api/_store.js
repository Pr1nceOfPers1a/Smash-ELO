// Tiny JSON files in the private "scans" Storage bucket (created on first write).
const BUCKET = 'scans';
const U = () => process.env.SUPABASE_URL, K = () => process.env.SUPABASE_SERVICE_KEY;
const st = (p, o = {}) => fetch(`${U()}/storage/v1/${p}`, { ...o, headers: { apikey: K(), Authorization: `Bearer ${K()}`, ...o.headers } });
// null = the file does not exist yet. Any other failure THROWS, so callers never overwrite real data after a hiccup.
async function getJson(path) {
  const r = await st(`object/authenticated/${BUCKET}/${path}`);
  if (r.ok) return await r.json();
  const t = await r.text().catch(() => '');
  if (r.status === 404 || /not.?found|bucket/i.test(t)) return null;
  throw new Error('storage read failed');
}
async function putJson(path, obj) {
  const go = () => st(`object/${BUCKET}/${path}`, { method: 'POST', body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' } });
  let r = await go();
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if (/bucket/i.test(t)) {
      const c = await st('bucket', { method: 'POST', body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), headers: { 'Content-Type': 'application/json' } });
      if (c.ok || c.status === 409) r = await go();
    }
  }
  return r.ok;
}
module.exports = { getJson, putJson };
