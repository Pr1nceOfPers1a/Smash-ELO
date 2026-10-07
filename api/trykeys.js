const { adminOk } = require('./_lib');
const K = require('./_trykeys');
const PK = require('./_premkeys');
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = req.body || {};
    if (b.action === 'check') {
      if (K.blocked(req)) return res.status(429).json({ error: 'Too many wrong tries. Wait a few minutes.' });
      const k = await K.check(b.key);
      if (!k) { K.fail(req); return res.status(401).json({ error: 'That key is wrong, used up or expired.' }); }
      return res.status(200).json({ ok: true, left: k.left, exp: k.exp });
    }
    if (!adminOk(b.admin)) return res.status(401).json({ error: 'Wrong Master Passkey' });
    if (b.action === 'pk_list') return res.status(200).json({ keys: await PK.list() });
    if (b.action === 'pk_create') {
      const days = b.days === 0 ? 0 : b.days;
      if (!Number.isInteger(days) || days < 0 || days > 365) return res.status(400).json({ error: 'Bad key settings' });
      const k = await PK.create(days);
      return k ? res.status(200).json({ key: k }) : res.status(502).json({ error: 'Could not save the key' });
    }
    if (b.action === 'pk_delete') { await PK.remove(b.key); return res.status(200).json({ ok: true }); }
    if (b.action === 'list') return res.status(200).json({ keys: await K.list() });
    if (b.action === 'create') {
      const uses = b.uses, hours = b.hours;
      if (!Number.isInteger(uses) || uses < 1 || uses > 20 || !Number.isInteger(hours) || hours < 1 || hours > 24 * 30) return res.status(400).json({ error: 'Bad key settings' });
      const k = await K.create(uses, hours);
      return k ? res.status(200).json({ key: k }) : res.status(502).json({ error: 'Could not save the key' });
    }
    if (b.action === 'delete') { await K.remove(b.key); return res.status(200).json({ ok: true }); }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) { res.status(503).json({ error: 'Something went wrong. Try again in a moment.' }); }
};
