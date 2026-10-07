// One-time "Premier group maker" keys: the Master hands one out, it lets one person create one Premier group, then it is spent.
const crypto = require('crypto');
const { getJson, putJson } = require('./_store');
const PATH = 'premkeys.json';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
const show = (c) => c.slice(0, 4) + '-' + c.slice(4);
const live = (k, now) => !!k && !k.used && (!k.exp || Date.parse(k.exp) > now);
async function load() { const j = await getJson(PATH); return j && j.keys && typeof j.keys === 'object' ? j : { keys: {} }; } // throws on a failed read
async function save(d) { return putJson(PATH, d); }
async function create(days) {
  const d = await load(), now = Date.now();
  let c = ''; do { c = Array.from({ length: 8 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join(''); } while (d.keys[c]);
  d.keys[c] = { made: new Date(now).toISOString(), exp: days ? new Date(now + days * 864e5).toISOString() : null, used: false };
  return (await save(d)) ? { code: show(c), ...d.keys[c] } : null;
}
async function list() {
  const d = await load(), now = Date.now();
  return Object.entries(d.keys).map(([c, k]) => ({ code: show(c), ...k, active: live(k, now) })).sort((a, b) => b.made.localeCompare(a.made));
}
async function remove(code) { const d = await load(), c = norm(code); if (!d.keys[c]) return false; delete d.keys[c]; return save(d); }
// Spends the key. Returns true only if it was valid and is now used.
async function spend(code) { const d = await load(), k = d.keys[norm(code)]; if (!live(k, Date.now())) return false; k.used = true; k.usedAt = new Date().toISOString(); return save(d); }
async function unspend(code) { const d = await load(), k = d.keys[norm(code)]; if (k && k.used) { k.used = false; delete k.usedAt; await save(d); } }
const bad = new Map();
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'x').split(',')[0].trim();
const blocked = (req) => { const now = Date.now(), a = (bad.get(ipOf(req)) || []).filter((t) => now - t < 600e3); bad.set(ipOf(req), a); return a.length >= 10; };
const fail = (req) => { const a = bad.get(ipOf(req)) || []; a.push(Date.now()); bad.set(ipOf(req), a); };
module.exports = { create, list, remove, spend, unspend, blocked, fail, norm };
