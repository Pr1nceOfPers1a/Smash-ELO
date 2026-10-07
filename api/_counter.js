// Site-wide count of every scan run (saved or not), kept as one small file in the private "scans" bucket.
const BUCKET = 'scans', PATH = 'counter.json';
const U = () => process.env.SUPABASE_URL, K = () => process.env.SUPABASE_SERVICE_KEY;
const st = (p, o = {}) => fetch(`${U()}/storage/v1/${p}`, { ...o, headers: { apikey: K(), Authorization: `Bearer ${K()}`, ...o.headers } });
async function total() {
  try {
    const r = await st(`object/authenticated/${BUCKET}/${PATH}`);
    if (!r.ok) return 0;
    const n = (await r.json()).total;
    return Number.isInteger(n) && n >= 0 ? n : 0;
  } catch (e) { return 0; }
}
async function put(n) {
  const go = () => st(`object/${BUCKET}/${PATH}`, { method: 'POST', body: JSON.stringify({ total: n }), headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' } });
  let r = await go();
  if (!r.ok) { // first use: make the private bucket, then retry once
    const t = await r.text().catch(() => '');
    if (/bucket/i.test(t)) {
      const c = await st('bucket', { method: 'POST', body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), headers: { 'Content-Type': 'application/json' } });
      if (c.ok || c.status === 409) r = await go();
    }
  }
  return r.ok;
}
// Best effort: two scans at the same instant can count as one. Never throws.
async function bump() { try { await put((await total()) + 1); } catch (e) {} }
module.exports = { total, bump };
