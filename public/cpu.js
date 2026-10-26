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
  root.CPU = { DEF, rate, score };
  if (typeof module !== 'undefined') module.exports = { DEF, rate, score };
})(typeof window !== 'undefined' ? window : globalThis);
