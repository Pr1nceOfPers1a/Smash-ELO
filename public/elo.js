// Rating tracks: all (every match), one (1v1 only), ffa (3+ players only), plus a per (player, character) track.
(function (root) {
  const START = 1000, NEW_N = 10, K_NEW = 48, K_OLD = 32, UPSET_GAP = 50;
  function compute(ms) {
    const P = {}, C = {}, out = [];
    const get = (n) => (P[n] ??= {
      name: n, r: { all: START, one: START, ffa: START }, g: { all: 0, one: 0, ffa: 0 },
      w: 0, l: 0, wm: { one: { w: 0, l: 0 }, ffa: { w: 0, l: 0 } }, ffa: { n: 0, place: 0, size: 0 },
      streak: 0, h: { all: [], one: [], ffa: [] }, h2h: {}, h2c: {}, cvc: {}, cm: {}, nchar: 0, ups: [], cs: { one: { k: 0, d: 0, n: 0, sd: 0, dmg: 0 }, ffa: { k: 0, d: 0, n: 0, sd: 0, dmg: 0 } },
    });
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
          if (t === 'all' && s !== 0.5) { // upset: lower-rated player beat a higher-rated one (overall ratings before the match)
            const [wi, lo] = s === 1 ? [a, b] : [b, a], pw = P[wi.name], pl = P[lo.name], gap = pl.r.all - pw.r.all;
            if (gap >= UPSET_GAP) {
              const pr = 1 / (1 + 10 ** (gap / 400)); // winner's win chance going in
              pw.ups.push({ ts: m.ts, opp: lo.name, oc: lo.char || '', gap, pr, won: true });
              pl.ups.push({ ts: m.ts, opp: wi.name, oc: wi.char || '', gap, pr, won: false });
            }
          }
        }
        for (const x of res) { const p = P[x.name]; p.r[t] += d[x.name]; p.g[t]++; p.h[t].push({ ts: m.ts, r: p.r[t] }); }
        dl[t === 'all' ? 'all' : 'mode'] = d;
      }
      for (const x of res) {
        const p = P[x.name], win = x.place === 1;
        if (win) { p.w++; p.streak = p.streak > 0 ? p.streak + 1 : 1; } else { p.l++; p.streak = p.streak < 0 ? p.streak - 1 : -1; }
        p.wm[mode][win ? 'w' : 'l']++;
        const cs = p.cs[mode]; // combat stats, only from matches where they were recorded
        if (Number.isFinite(x.kills) && Number.isFinite(x.deaths)) { cs.k += x.kills; cs.d += x.deaths; cs.n++; }
        if (Number.isFinite(x.sds)) cs.sd += x.sds;
        if (Number.isFinite(x.dmg)) cs.dmg += x.dmg;
        if (mode === 'ffa') { p.ffa.n++; p.ffa.place += x.place; p.ffa.size += n; }
        if (x.char) { const c = (p.cm[x.char] ??= { n: 0, w: 0 }); c.n++; if (win) c.w++; p.nchar++; }
        for (const y of res) if (y !== x) {
          const k = x.place < y.place ? 'w' : x.place > y.place ? 'l' : 't';
          (p.h2h[y.name] ??= { w: 0, l: 0, t: 0 })[k]++;
          if (x.char && y.char) { // character vs character
            (p.h2c[x.char + '\n' + y.name + '\n' + y.char] ??= { my: x.char, opp: y.name, oc: y.char, w: 0, l: 0, t: 0 })[k]++;
            (p.cvc[x.char + '\n' + y.char] ??= { my: x.char, oc: y.char, w: 0, l: 0, t: 0 })[k]++;
          }
        }
      }
      const cr = res.filter((x) => x.char);
      if (cr.length >= 2) {
        const ents = cr.map((x) => (C[x.name + '\n' + x.char] ??= { name: x.name, char: x.char, r: START, g: 0, w: 0, l: 0 }));
        const d = ents.map(() => 0), k = cr.length - 1;
        for (let i = 0; i < cr.length; i++) for (let j = i + 1; j < cr.length; j++) {
          const a = ents[i], b = ents[j];
          const e = 1 / (1 + 10 ** ((b.r - a.r) / 400));
          const s = cr[i].place < cr[j].place ? 1 : cr[i].place > cr[j].place ? 0 : 0.5;
          d[i] += ((a.g < NEW_N ? K_NEW : K_OLD) / k) * (s - e);
          d[j] -= ((b.g < NEW_N ? K_NEW : K_OLD) / k) * (s - e);
        }
        ents.forEach((en, i) => { en.r += d[i]; en.g++; cr[i].place === 1 ? en.w++ : en.l++; });
      }
      out.push({ ...m, mode, d: dl });
    }
    return { players: P, chars: C, matches: out };
  }
  root.ELO = { compute };
  if (typeof module !== 'undefined') module.exports = { compute };
})(typeof window !== 'undefined' ? window : globalThis);
