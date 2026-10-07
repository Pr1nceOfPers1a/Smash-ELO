// Temporary "try scan" keys: a few scans each, expire on their own. Stored in the private bucket, no SQL needed.
const crypto = require('crypto');
const { getJson, putJson } = require('./_store');
const PATH = 'trykeys.json';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
const show = (c) => c.slice(0, 4) + '-' + c.slice(4);
const live = (k, now) => k && k.left > 0 && Date.parse(k.exp) > now;
async function load() { const j = await getJson(PATH); // throws on a failed read, so a hiccup never wipes the keys
  return j && j.keys && typeof j.keys === 'object' ? j : { keys: {} }; }
async function save(d, now) {
  for (const c of Object.keys(d.keys)) if (Date.parse(d.keys[c].exp) < now - 7 * 864e5) delete d.keys[c]; // tidy keys expired over a week ago
  return putJson(PATH, d);
}
async function create(uses, hours) {
  const d = await load(), now = Date.now();
  let c = ''; do { c = Array.from({ length: 8 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join(''); } while (d.keys[c]);
  d.keys[c] = { uses, left: uses, made: new Date(now).toISOString(), exp: new Date(now + hours * 3600e3).toISOString() };
  return (await save(d, now)) ? { code: show(c), ...d.keys[c] } : null;
}
async function list() {
  const d = await load(), now = Date.now();
  return Object.entries(d.keys).map(([c, k]) => ({ code: show(c), ...k, active: live(k, now) })).sort((a, b) => b.made.localeCompare(a.made));
}
async function remove(code) { const d = await load(), c = norm(code); if (!d.keys[c]) return false; delete d.keys[c]; return save(d, Date.now()); }
async function check(code) { const k = (await load()).keys[norm(code)]; return live(k, Date.now()) ? { left: k.left, exp: k.exp } : null; }
async function consume(code) {
  const d = await load(), c = norm(code), k = d.keys[c];
  if (!live(k, Date.now())) return false;
  k.left -= 1;
  return save(d, Date.now());
}
async function refund(code) { const d = await load(), k = d.keys[norm(code)]; if (k && k.left < k.uses) { k.left += 1; await save(d, Date.now()); } }
// Wrong-key throttle per IP (best effort, per server instance).
const bad = new Map();
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'x').split(',')[0].trim();
const blocked = (req) => { const now = Date.now(), a = (bad.get(ipOf(req)) || []).filter((t) => now - t < 600e3); return a.length >= 15; };
const fail = (req) => { const ip = ipOf(req), now = Date.now(); bad.set(ip, [...(bad.get(ip) || []).filter((t) => now - t < 600e3), now]); };
module.exports = { create, list, remove, check, consume, refund, blocked, fail, norm };
