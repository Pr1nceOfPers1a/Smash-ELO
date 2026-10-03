// Three independent rating tracks: all (every match), one (1v1 only), ffa (3+ players only).
(function (root) {
  const START = 1000, NEW_N = 10, K_NEW = 48, K_OLD = 32;
  function compute(ms) {
    const P = {};
    const get = (n) => (P[n] ??= { name: n, r: { all: START, one: START, ffa: START }, g: { all: 0, one: 0, ffa: 0 }, w: 0, l: 0, streak: 0, hist: [], h2h: {} });
    const out = [];
    for (const m of ms) {
      const res = m.results, n = res.length, mode = n === 2 ? 'one' : 'ffa';
      res.forEach((x) => get(x.name));
      const dl = { all: {}, mode: {} };
      for (const t of ['all', mode]) {
        const d = {};
        res.forEach((x) => (d[x.name] = 0));
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const a = res[i], b = res[j], pa = P[a.name], pb = P[b.name];
          const e = 1 / (1 + 10 ** ((pb.r[t] - pa.r[t]) / 400));
          const s = a.place < b.place ? 1 : a.place > b.place ? 0 : 0.5;
          d[a.name] += ((pa.g[t] < NEW_N ? K_NEW : K_OLD) / (n - 1)) * (s - e);
          d[b.name] -= ((pb.g[t] < NEW_N ? K_NEW : K_OLD) / (n - 1)) * (s - e);
        }
        for (const x of res) { P[x.name].r[t] += d[x.name]; P[x.name].g[t]++; }
        dl[t === 'all' ? 'all' : 'mode'] = d;
      }
      for (const x of res) {
        const p = P[x.name];
        if (x.place === 1) { p.w++; p.streak = p.streak > 0 ? p.streak + 1 : 1; }
        else { p.l++; p.streak = p.streak < 0 ? p.streak - 1 : -1; }
        p.hist.push({ ts: m.ts, r: p.r.all });
        for (const y of res) if (y !== x) {
          const h = (p.h2h[y.name] ??= { w: 0, l: 0, t: 0 });
          x.place < y.place ? h.w++ : x.place > y.place ? h.l++ : h.t++;
        }
      }
      out.push({ ...m, mode, d: dl });
    }
    return { players: P, matches: out };
  }
  root.ELO = { compute };
  if (typeof module !== 'undefined') module.exports = { compute };
})(typeof window !== 'undefined' ? window : globalThis);
