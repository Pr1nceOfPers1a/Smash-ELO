// Site-wide count of every scan run (saved or not), kept as one small file in the private "scans" bucket.
const { sb } = require('./_lib');
const BUCKET = 'scans', PATH = 'counter.json';
const U = () => process.env.SUPABASE_URL, K = () => process.env.SUPABASE_SERVICE_KEY;
const st = (p, o = {}) => fetch(`${U()}/storage/v1/${p}`, { ...o, headers: { apikey: K(), Authorization: `Bearer ${K()}`, ...o.headers } });
// {total, start} or null when counting has not begun yet.
async function read() {
  try {
    const r = await st(`object/authenticated/${BUCKET}/${PATH}`);
    if (!r.ok) return null;
    const j = await r.json();
    return Number.isInteger(j.total) && j.total >= 0 ? { total: j.total, start: Number.isInteger(j.start) && j.start >= 0 ? j.start : 0 } : null;
  } catch (e) { return null; }
}
async function total() { return (await read())?.total ?? 0; }
async function put(n, start) {
  const go = () => st(`object/${BUCKET}/${PATH}`, { method: 'POST', body: JSON.stringify({ total: n, start }), headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' } });
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
async function matchCount() {
  try { const r = await sb('matches?select=id&limit=100000'); return r.ok ? (await r.json()).length : 0; } catch (e) { return 0; }
}
async function bump() {
  try {
    const c = await read();
    if (c) await put(c.total + 1, c.start);
    else { const n = await matchCount(); await put(n + 1, n); } // first ever: start from the matches already logged
  } catch (e) {}
}
// Admin: first look starts the count at an estimate of past scans (one per match already logged); later, set an exact number.
async function ensure() {
  let c = await read();
  if (!c) { const n = await matchCount(); await put(n, n); c = (await read()) || { total: n, start: n }; }
  return c;
}
module.exports = { total, bump, ensure };
