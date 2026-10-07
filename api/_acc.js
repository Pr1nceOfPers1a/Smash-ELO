// Scan accuracy: accepted = a scanned match saved with no edits; missed = typed by hand, edited after scanning, or re-scanned.
const { getJson, putJson } = require('./_store');
const PATH = 'accuracy.json';
const n = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
async function read() { const j = (await getJson(PATH)) || {}; return { accepted: n(j.accepted), missed: n(j.missed) }; } // throws on a failed read
async function bumpAcc(kind) {
  if (kind !== 'accepted' && kind !== 'missed') return false;
  try { const c = await read(); c[kind] += 1; return await putJson(PATH, c); } catch (e) { return false; }
}
module.exports = { read, bumpAcc };
