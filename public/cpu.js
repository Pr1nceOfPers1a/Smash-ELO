// Personal training rating against CPUs. Separate from the group ladder: each CPU level is a fixed (adjustable) anchor rating.
(function (root) {
  const DEF = [600, 700, 800, 900, 1000, 1100, 1250, 1400, 1550]; // level 1..9
  const START = 1000, NEW_N = 10, K_NEW = 48, K_OLD = 32;
  // stocks = winner's stocks left (1-3). A 3-stock win scores 1.0, a 1-stock win .67, a loss where the CPU kept 1 stock .33, and so on.
  const score = (g) => 0.5 + (g.win ? 1 : -1) * (Math.min(3, Math.max(1, g.stocks || 3)) / 6);
  function step(r, n, anchor, s) {
    const e = 1 / (1 + 10 ** ((anchor - r) / 400));
    return r + (n < NEW_N ? K_NEW : K_OLD) * (s - e);
  }
  function rate(games, anchors, name) {
    const A = Array.isArray(anchors) && anchors.length === 9 ? anchors : DEF, key = String(name).toLowerCase();
    const mine = (games || []).filter((g) => String(g.name).toLowerCase() === key).sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const out = { r: START, g: 0, w: 0, l: 0, h: [], ch: {}, lv: {}, games: mine };
    for (const g of mine) {
      const a = A[Math.min(9, Math.max(1, g.level)) - 1], s = score(g);
      out.r = step(out.r, out.g, a, s); out.g++; g.win ? out.w++ : out.l++;
      out.h.push({ ts: g.ts, r: out.r });
      const L = (out.lv[g.level] ??= { w: 0, l: 0 }); g.win ? L.w++ : L.l++;
      if (g.char) { const c = (out.ch[g.char] ??= { r: START, g: 0 }); c.r = step(c.r, c.g, a, s); c.g++; }
    }
    return out;
  }
  // Self-tuning: fit how tough each CPU level really is from everyone's logged games.
  // Each player's skill is allowed to drift (a fresh value every 20 games), so an improving player is not mistaken for easier CPUs.
  // Only the gaps between levels are learned; the average level you face stays on the default scale. Starts at the defaults and moves as evidence comes in.
  const C = Math.LN10 / 400, PRIOR = C * C * 0.25 * 6, SMOOTH = C * C * 0.25 * 5, BLOCK = 20;
  function tune(games, base) {
    const B = Array.isArray(base) && base.length === 9 ? base : DEF, key = (g) => String(g.name).toLowerCase();
    const by = {};
    for (const g of games || []) (by[key(g)] ??= []).push(g);
    const rows = [];
    for (const k of Object.keys(by)) {
      by[k].sort((a, b) => new Date(a.ts) - new Date(b.ts));
      by[k].forEach((g, i) => rows.push({ k, b: Math.floor(i / BLOCK), l: Math.min(9, Math.max(1, g.level)) - 1, s: g.win ? 1 : 0 })); // fit on win or loss; stocks only shape the rating chain
    }
    const used = new Set(rows.map((r) => r.l));
    if (rows.length < 12 || used.size < 2) return B.slice();
    const th = {}; for (const k of Object.keys(by)) th[k] = new Array(Math.floor((by[k].length - 1) / BLOCK) + 1).fill(START);
    const d = new Array(9).fill(0), cnt = new Array(9).fill(0); rows.forEach((r) => cnt[r.l]++);
    const P = (r) => 1 / (1 + Math.exp(-C * (th[r.k][r.b] - (B[r.l] + d[r.l]))));
    for (let it = 0; it < 80; it++) {
      for (const k of Object.keys(th)) th[k].forEach((_, b) => { // newton step on each skill block
        let g = 0, h = 0;
        for (const r of rows) if (r.k === k && r.b === b) { const p = P(r); g += C * (r.s - p); h += C * C * p * (1 - p); }
        if (b > 0) { g -= SMOOTH * (th[k][b] - th[k][b - 1]); h += SMOOTH; }
        if (b < th[k].length - 1) { g -= SMOOTH * (th[k][b] - th[k][b + 1]); h += SMOOTH; }
        if (h > 0) th[k][b] = Math.min(2600, Math.max(100, th[k][b] + g / (h + 1e-9)));
      });
      for (let l = 0; l < 9; l++) { // newton step on each level, pulled back toward the default
        if (!cnt[l]) continue;
        let g = 0, h = 0;
        for (const r of rows) if (r.l === l) { const p = P(r); g += C * (p - r.s); h += C * C * p * (1 - p); }
        g -= PRIOR * d[l]; h += PRIOR;
        d[l] = Math.min(400, Math.max(-400, d[l] + g / h));
      }
      const m = d.reduce((a, x, l) => a + x * cnt[l], 0) / rows.length; // keep the average difficulty on the default scale
      for (let l = 0; l < 9; l++) if (cnt[l]) d[l] -= m;
    }
    const out = B.map((a, l) => a + d[l]);
    for (let l = 1; l < 9; l++) if (out[l] < out[l - 1] + 20) out[l] = out[l - 1] + 20; // a higher level is never easier
    return out.map((x) => Math.round(x));
  }
  root.CPU = { DEF, rate, score, tune };
  if (typeof module !== 'undefined') module.exports = { DEF, rate, score, tune };
})(typeof window !== 'undefined' ? window : globalThis);
