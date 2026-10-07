// Training-data store: confirmed scans (image + correct labels) go into a private Supabase Storage bucket.
const { auth, adminOk } = require('./_lib');
const { ensure } = require('./_counter');
const BUCKET = 'scans';
const U = () => process.env.SUPABASE_URL, K = () => process.env.SUPABASE_SERVICE_KEY;
const st = (p, o = {}) => fetch(`${U()}/storage/v1/${p}`, { ...o, headers: { apikey: K(), Authorization: `Bearer ${K()}`, ...o.headers } });
const ID = /^\d{10,}-[0-9a-f]{6}$/;
let hits = [];
const int = (v, hi) => (Number.isInteger(v) && v >= 0 && v <= hi ? v : null);
const num = (v, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= hi ? v : null);
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
function players(a, strict) {
  if (!Array.isArray(a) || a.length < 2 || a.length > 8) return null;
  const out = a.map((p) => ({ name: str(p?.name, 24), place: int(p?.place, 8), character: str(p?.character, 30), kills: num(p?.kills, 999), deaths: num(p?.deaths, 999), sds: num(p?.sds, 999), damage: num(p?.damage, 100000) }));
  if (out.some((p) => !p.name || (strict && !p.place))) return null;
  return out;
}
async function putObject(path, body, type) {
  const go = () => st(`object/${BUCKET}/${path}`, { method: 'POST', body, headers: { 'Content-Type': type } });
  let r = await go();
  if (!r.ok && (r.status === 404 || r.status === 400)) { // first use: make the private bucket, then retry once
    const t = await r.text().catch(() => '');
    if (/bucket/i.test(t)) {
      const c = await st('bucket', { method: 'POST', body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), headers: { 'Content-Type': 'application/json' } });
      if (c.ok || c.status === 409) r = await go();
    }
  }
  return r.ok;
}
async function ids() {
  const out = [];
  for (let off = 0; off < 20000; off += 1000) {
    const r = await st(`object/list/${BUCKET}`, { method: 'POST', body: JSON.stringify({ prefix: '', limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } }), headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) { if (off === 0) return []; break; } // no bucket yet = no scans yet
    const page = await r.json();
    for (const o of page) if (o.name.endsWith('.json') && ID.test(o.name.slice(0, -5))) out.push(o.name.slice(0, -5));
    if (page.length < 1000) break;
  }
  return out;
}
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    if (b.action === 'list' || b.action === 'get' || b.action === 'count' || b.action === 'verify') {
      if (!adminOk(b.admin)) return res.status(401).json({ error: 'Wrong admin passcode' });
      if (b.action === 'verify') return res.status(200).json({ ok: true });
      if (b.action === 'count') {
        const c = await ensure();
        return res.status(200).json({ saved: (await ids()).length, total: c.total, start: c.start });
      }
      if (b.action === 'list') return res.status(200).json({ ids: await ids() });
      if (!ID.test(b.id || '')) return res.status(400).json({ error: 'Bad id' });
      const [im, js] = await Promise.all([st(`object/authenticated/${BUCKET}/${b.id}.jpg`), st(`object/authenticated/${BUCKET}/${b.id}.json`)]);
      if (!im.ok || !js.ok) return res.status(404).json({ error: 'Scan not found' });
      const meta = await js.json();
      return res.status(200).json({ id: b.id, image: Buffer.from(await im.arrayBuffer()).toString('base64'), labels: meta.labels, scanned: meta.scanned });
    }
    if (!(await auth(req))) return res.status(401).json({ error: 'Not signed in to a group' });
    const now = Date.now();
    hits = hits.filter((t) => now - t < 3600e3);
    if (hits.length >= 120) return res.status(429).json({ error: 'Too many saves, try again later' });
    hits.push(now);
    const labels = players(b.labels, true);
    if (!labels) return res.status(400).json({ error: 'Invalid labels' });
    const scanned = players(b.scanned, false) || [];
    if (typeof b.image !== 'string' || b.image.length < 100 || b.image.length > 3_000_000 || !/^[A-Za-z0-9+/]+=*$/.test(b.image)) return res.status(400).json({ error: 'Invalid image' });
    const id = `${now}-${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
    if (!(await putObject(`${id}.jpg`, Buffer.from(b.image, 'base64'), 'image/jpeg'))) return res.status(502).json({ error: 'Could not store the scan image' });
    if (!(await putObject(`${id}.json`, JSON.stringify({ labels, scanned, ts: new Date(now).toISOString() }), 'application/json'))) {
      await st(`object/${BUCKET}`, { method: 'DELETE', body: JSON.stringify({ prefixes: [`${id}.jpg`] }), headers: { 'Content-Type': 'application/json' } }).catch(() => {});
      return res.status(502).json({ error: 'Could not store the scan labels' });
    }
    return res.status(200).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
};
