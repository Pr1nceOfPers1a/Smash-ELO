// Niche, data-driven player badges. Every badge is computed from the player's real match history,
// and only shows up when the data backs it. Phrasing is picked deterministically per player.
(function (root) {
  const DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const H12 = (h) => (h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : h - 12 + ' PM');
  // Character families: s = singular noun, p = plural noun.
  const FAM = {
    reptile: { s: 'reptile', p: 'reptiles', c: 'Bowser,Bowser Jr.,Yoshi,King K. Rool,Ridley,Greninja' },
    bird: { s: 'bird', p: 'birds', c: 'Falco,Pit,Dark Pit,Duck Hunt,Banjo & Kazooie' },
    plumber: { s: 'plumber', p: 'plumbers', c: 'Mario,Luigi,Dr. Mario' },
    royal: { s: 'royal', p: 'royalty', c: 'Peach,Daisy,Zelda,Rosalina & Luma,Palutena' },
    swordfighter: { s: 'swordfighter', p: 'swordfighters', c: 'Marth,Lucina,Roy,Chrom,Ike,Link,Young Link,Toon Link,Cloud,Sephiroth,Corrin,Byleth,Hero,Shulk,Meta Knight,Mii Swordfighter,Robin,Pyra/Mythra,Sora' },
    clone: { s: 'clone', p: 'clones', c: 'Dark Samus,Dark Pit,Lucina,Daisy,Pichu,Ken,Richter,Chrom,Wolf' },
    pokemon: { s: 'Pokémon', p: 'Pokémon', c: 'Pikachu,Jigglypuff,Pichu,Mewtwo,Lucario,Greninja,Incineroar,Pokémon Trainer' },
    heavy: { s: 'heavyweight', p: 'heavyweights', c: 'Bowser,Donkey Kong,Ganondorf,King Dedede,King K. Rool,Wario,Incineroar,Snake' },
    animal: { s: 'animal', p: 'animals', c: 'Fox,Falco,Wolf,Donkey Kong,Diddy Kong,Sonic,Yoshi,Jigglypuff,Pikachu,Incineroar,Villager,Isabelle' },
    robot: { s: 'robot', p: 'robots', c: 'R.O.B.,Mega Man,Mr. Game & Watch,Dark Samus' },
    guest: { s: 'guest star', p: 'guest stars', c: 'Sonic,Pac-Man,Mega Man,Cloud,Snake,Ryu,Ken,Bayonetta,Joker,Hero,Banjo & Kazooie,Terry,Steve,Sephiroth,Kazuya,Sora,Min Min' },
    zoner: { s: 'projectile spammer', p: 'projectile spammers', c: 'Samus,Dark Samus,Snake,Mega Man,Villager,Duck Hunt,Mii Gunner,R.O.B.,Pac-Man,Inkling,Min Min,Olimar,Bowser Jr.' },
    fighter: { s: 'martial artist', p: 'martial artists', c: 'Ryu,Ken,Little Mac,Terry,Kazuya,Captain Falcon,Mii Brawler,Wii Fit Trainer,Zero Suit Samus,Sheik' },
    kirby: { s: 'puffball', p: 'puffballs', c: 'Kirby,Meta Knight,King Dedede,Jigglypuff' },
  };
  const FAMS = Object.keys(FAM).map((k) => ({ k, ...FAM[k], list: FAM[k].c.split(',') }));

  // Phrasing tables. Each entry is a list of functions of the variables v.
  const PH = {
    fam: [(v) => `Most likely to play a ${v.f.s}`, (v) => `Suspiciously into ${v.f.p}`, (v) => `Has a type, and the type is ${v.f.p}`, (v) => `${v.pct}% ${v.f.p}. Coincidence?`],
    topchar: [(v) => `${v.pct}% ${v.C}. Has heard other characters exist`, (v) => `${v.C} or nothing (${v.pct}%)`, (v) => `Plays ${v.C} the way other people breathe`, (v) => `Married to ${v.C}`],
    haunted: [(v) => `Cannot beat ${v.C}`, (v) => `${v.C} haunts them (${v.w}–${v.l})`, (v) => `Has lost to ${v.C} ${v.l} times and keeps queueing`, (v) => `Scared of ${v.C}`],
    dayNever: [(v) => `Never wins on ${v.d}s`, (v) => `${v.d}s are cursed`, (v) => `Has not won a single ${v.d}`],
    dayBest: [(v) => `Unbeatable on ${v.d}s`, (v) => `${v.d} warrior (${v.pct}%)`, (v) => `Wins ${v.pct}% of ${v.d} games`],
    lateUp: [() => 'Comes alive after dark', (v) => `Wins ${v.pct}% after 11 PM`, () => 'Plays better when everyone else is asleep'],
    lateDn: [() => 'Falls apart after midnight', () => 'Cannot be trusted after 11 PM', () => 'Should stop playing after dark'],
    dayUp: [() => 'Daylight warrior', (v) => `Wins ${v.pct}% during business hours`, () => "Plays like they're on the clock"],
    hourBest: [(v) => `Peaks at ${H12(v.h)}`, (v) => `Unstoppable at ${H12(v.h)}`, (v) => `Their ${H12(v.h)} self is a different player`],
    hourWorst: [(v) => `Should not play at ${H12(v.h)}`, (v) => `${H12(v.h)} is not their hour`, (v) => `Collapses around ${H12(v.h)}`],
    rage: [(v) => `Switches characters after ${v.pct}% of losses`, (v) => `Blames the character ${v.pct}% of the time`, (v) => `Rage-switcher (${v.pct}%)`],
    loyal: [() => 'Never switches after a loss', (v) => `Loyal to a fault (${v.pct}% switch)`, () => 'Loses with conviction'],
    revenge: [(v) => `Back within 10 minutes after ${v.pct}% of losses`, (v) => `Cannot accept a loss. Rematches ${v.pct}% of the time`, () => 'Revenge queue specialist'],
    third: [() => 'Third game is the charm', () => 'Gets better as the night goes on', () => 'Needs two games to wake up'],
    fast: [() => 'Fast starter, fades by game three', () => 'Peaks in game one', () => 'Only cares about the first game of the night'],
    sdWin: [(v) => `Self-destructs mostly when winning (${v.a} of ${v.b})`, () => 'Wins first, falls off the stage later', () => "Can't hold a lead without a little chaos"],
    onlyOne: [(v) => `Only ${v.Y} can beat them (${v.k} of ${v.L} losses)`, (v) => `${v.Y} is their kryptonite`, (v) => `Every loss has ${v.Y}'s name on it`],
    owns: [(v) => `Perfect against ${v.Y} on ${v.d}s`, (v) => `${v.Y} cannot win on a ${v.d}`, (v) => `Owns ${v.Y} on ${v.d}s`],
    unbeaten: [(v) => `Unbeaten against ${v.Y} (${v.n}–0)`, (v) => `${v.Y} has never beaten them`, (v) => `${v.Y}'s nightmare`],
    odd: [(v) => `Wins ${v.pct}% of odd-numbered games`, (v) => `Odd games only (${v.pct}%)`, () => 'Better at odd numbers than even ones'],
    even: [(v) => `Wins ${v.pct}% of even-numbered games`, (v) => `Even games only (${v.pct}%)`, () => 'Better at even numbers than odd ones'],
    closer: [() => 'Always still playing at the end of the night', () => 'Last one in the room', (v) => `Closes out the night (${v.pct}%)`],
    since: [(v) => `Hasn't lost to ${v.Y} since ${v.M}`, (v) => `Last lost to ${v.Y} in ${v.M}`, (v) => `${v.Y}'s last win against them was in ${v.M}`],
    size: [(v) => `Plays best in ${v.k}-player games`, (v) => `The ${v.k}-player specialist`, (v) => `Wants exactly ${v.k} players in the room`],
    neverLast: [() => 'Has never finished last in a free-for-all', () => 'Allergic to last place', () => 'Always has a seat above last'],
    rndWin: [() => 'Only plays Random after a win', () => 'Random is a victory lap', () => "Saves Random for when they're feeling good"],
    charDay: [(v) => `Only plays ${v.C} on ${v.d}s`, (v) => `${v.C} on ${v.d}s, something else the rest of the week`, (v) => `${v.d} is ${v.C} day`],
    onlyWith: [(v) => `Only beats ${v.Y} with ${v.C}`, (v) => `Needs ${v.C} to beat ${v.Y}`, (v) => `Beats ${v.Y} as ${v.C}. Not as anything else`],
    owl: [(v) => `${v.pct}% of their games are after 1 AM`, () => 'Nocturnal', () => 'Sleep is optional'],
    noWeekend: [() => 'Has never played on a weekend', () => 'Weekends off', () => 'Weekday-only'],
    weekendOnly: [() => 'Only ever plays on weekends', () => 'Weekend warrior', () => 'Only plays on Saturday and Sunday'],
    leaveWin: [() => 'Always leaves on a win', () => 'Never ends a night on a loss', () => 'Knows when to log off'],
    warm: [() => 'Warms up by losing', () => 'The first game of the night is a donation', (v) => `Starts the night with a loss ${v.pct}% of the time`],
    variety: [(v) => `Has played ${v.k} different characters`, (v) => `Commitment issues (${v.k} characters)`, () => 'A different character every week'],
  };

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  const say = (key, v, name) => { const L = PH[key]; return L[hash(name + '|' + key + '|' + (v.d ?? v.C ?? v.Y ?? v.h ?? '')) % L.length](v); };
  const wr = (a) => (a.length ? a.filter((x) => x.win).length / a.length : 0);
  const pc = (x) => Math.round(100 * x);

  function build(M, name) {
    const info = [], cnt = {};
    let sid = -1, prev = 0;
    M.forEach((m, i) => { const t = Date.parse(m.ts); if (i === 0 || t - prev > 45 * 6e4) sid++; prev = t; info.push({ t, sid }); cnt[sid] = (cnt[sid] || 0) + 1; });
    const posIn = {};
    info.forEach((x) => { x.pos = posIn[x.sid] = (posIn[x.sid] || 0) + 1; x.last = x.pos === cnt[x.sid]; });
    const G = [];
    M.forEach((m, i) => {
      const me = m.results.find((r) => r.name === name); if (!me) return;
      const d = new Date(info[i].t), n = m.results.length, ok = (c) => (c && c !== 'Random' ? c : '');
      G.push({
        i, t: info[i].t, dow: d.getDay(), h: d.getHours(), mon: d.getMonth(), win: me.place === 1, place: me.place, n, one: n === 2,
        char: ok(me.char), rnd: !!(me.rnd || me.char === 'Random'), sds: Number.isFinite(me.sds) ? me.sds : null,
        opps: m.results.filter((r) => r !== me).map((r) => ({ name: r.name, char: ok(r.char), beat: me.place < r.place ? 1 : me.place > r.place ? -1 : 0 })),
        pos: info[i].pos, sid: info[i].sid, last: info[i].last, cnt: cnt[info[i].sid],
      });
    });
    return G;
  }

  function badges(M, name) {
    const G = build(M, name), out = [];
    if (G.length < 8) return out;
    const ow = wr(G), push = (key, pri, eff, v) => out.push({ key, s: pri + eff, t: say(key, v, name) });
    const WK = (g) => g.dow >= 1 && g.dow <= 5;

    // character families and mains
    const cg = G.filter((g) => g.char);
    if (cg.length >= 8) {
      let best = null;
      for (const f of FAMS) { const k = cg.filter((g) => f.list.includes(g.char)).length; if (k >= 5 && (!best || k > best.k)) best = { f, k }; }
      if (best && best.k / cg.length >= 0.45) push('fam', 3, best.k / cg.length, { f: best.f, pct: pc(best.k / cg.length) });
      const byc = {}; cg.forEach((g) => (byc[g.char] = (byc[g.char] || 0) + 1));
      const top = Object.entries(byc).sort((a, b) => b[1] - a[1])[0];
      if (cg.length >= 10 && top[1] / cg.length >= 0.7) push('topchar', 2, top[1] / cg.length, { C: top[0], pct: pc(top[1] / cg.length) });
      const kinds = Object.keys(byc).length;
      if (G.length >= 15 && kinds >= 8) push('variety', 1.5, kinds / 20, { k: kinds });
    }
    // opposing character that haunts them
    const vsC = {};
    G.forEach((g) => g.opps.forEach((o) => { if (!o.char || o.beat === 0) return; const r = (vsC[o.char] ??= { w: 0, l: 0 }); o.beat > 0 ? r.w++ : r.l++; }));
    const hc = Object.entries(vsC).filter(([, r]) => r.w + r.l >= 5 && r.l / (r.w + r.l) >= 0.75).sort((a, b) => b[1].l - a[1].l)[0];
    if (hc) push('haunted', 3, hc[1].l / (hc[1].w + hc[1].l), { C: hc[0], w: hc[1].w, l: hc[1].l });
    // weekdays
    for (let d = 0; d < 7; d++) {
      const a = G.filter((g) => g.dow === d);
      if (a.length >= 5 && !a.some((g) => g.win)) push('dayNever', 3, 1, { d: DAYN[d] });
      else if (a.length >= 5 && wr(a) >= 0.85 && wr(a) - ow >= 0.25) push('dayBest', 2.5, wr(a) - ow, { d: DAYN[d], pct: pc(wr(a)) });
    }
    // time of day
    const late = G.filter((g) => g.h >= 23 || g.h < 5), day = G.filter((g) => g.h >= 9 && g.h < 17);
    if (late.length >= 6 && wr(late) - ow >= 0.2) push('lateUp', 2.5, wr(late) - ow, { pct: pc(wr(late)) });
    else if (late.length >= 6 && ow - wr(late) >= 0.2) push('lateDn', 2.5, ow - wr(late), {});
    if (day.length >= 6 && wr(day) - ow >= 0.2) push('dayUp', 2, wr(day) - ow, { pct: pc(wr(day)) });
    let hb = null, hw = null;
    for (let h = 0; h < 24; h++) { const a = G.filter((g) => g.h === h); if (a.length < 6) continue; const d = wr(a) - ow; if (d >= 0.2 && (!hb || d > hb.d)) hb = { h, d }; if (d <= -0.25 && (!hw || d < hw.d)) hw = { h, d }; }
    if (hb) push('hourBest', 2.5, hb.d, { h: hb.h });
    if (hw) push('hourWorst', 2.5, -hw.d, { h: hw.h });
    const owl = G.filter((g) => g.h >= 1 && g.h < 5);
    if (owl.length >= 6 && owl.length / G.length >= 0.35) push('owl', 2, owl.length / G.length, { pct: pc(owl.length / G.length) });
    const we = G.filter((g) => !WK(g));
    if (G.length >= 15 && !we.length) push('noWeekend', 2, 0.6, {});
    if (G.length >= 15 && we.length === G.length) push('weekendOnly', 2, 0.6, {});
    // after a loss: switching characters and rematches
    let sw = 0, sn = 0, rv = 0, rn = 0;
    for (let k = 0; k < G.length - 1; k++) {
      const a = G[k], b = G[k + 1]; if (a.win) continue;
      if (a.char && b.char && b.t - a.t <= 45 * 6e4) { sn++; if (a.char !== b.char) sw++; }
      rn++; if (b.t - a.t <= 10 * 6e4) rv++;
    }
    if (sn >= 6 && sw / sn >= 0.6) push('rage', 2.5, sw / sn, { pct: pc(sw / sn) });
    else if (sn >= 8 && sw / sn <= 0.1) push('loyal', 2, 1 - sw / sn, { pct: pc(sw / sn) });
    if (rn >= 5 && rv / rn >= 0.7) push('revenge', 2.5, rv / rn, { pct: pc(rv / rn) });
    // position in the night
    const p1 = G.filter((g) => g.pos === 1), p3 = G.filter((g) => g.pos >= 3);
    if (p1.length >= 6 && p3.length >= 6) {
      if (wr(p3) - wr(p1) >= 0.2) push('third', 2.5, wr(p3) - wr(p1), {});
      else if (wr(p1) - wr(p3) >= 0.2) push('fast', 2.5, wr(p1) - wr(p3), {});
    }
    // sessions: closing, leaving on a win, warming up with a loss
    const S = {}; G.forEach((g) => (S[g.sid] ??= []).push(g));
    const ses = Object.values(S).filter((a) => a[0].cnt >= 3);
    const lastIn = ses.filter((a) => a.some((g) => g.last));
    if (ses.length >= 5 && lastIn.length / ses.length >= 0.6) push('closer', 2, lastIn.length / ses.length, { pct: pc(lastIn.length / ses.length) });
    if (lastIn.length >= 6 && lastIn.filter((a) => a.find((g) => g.last).win).length / lastIn.length >= 0.8) push('leaveWin', 2.5, 0.8, {});
    const firsts = ses.map((a) => a.find((g) => g.pos === 1)).filter(Boolean);
    if (firsts.length >= 6 && firsts.filter((g) => !g.win).length / firsts.length >= 0.7) push('warm', 2, 0.7, { pct: pc(firsts.filter((g) => !g.win).length / firsts.length) });
    // self-destructs
    const sg = G.filter((g) => g.sds !== null && g.sds > 0), sT = sg.reduce((a, g) => a + g.sds, 0), sW = sg.filter((g) => g.win).reduce((a, g) => a + g.sds, 0);
    if (sT >= 3 && sW / sT >= 0.7) push('sdWin', 2, sW / sT, { a: sW, b: sT });
    // who beats them
    const l1 = G.filter((g) => g.one && !g.win);
    if (l1.length >= 6) {
      const c = {}; l1.forEach((g) => (c[g.opps[0].name] = (c[g.opps[0].name] || 0) + 1));
      const t = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
      if (t[1] / l1.length >= 0.8) push('onlyOne', 3, t[1] / l1.length, { Y: t[0], k: t[1], L: l1.length });
    }
    // head to head
    const H = {};
    G.forEach((g) => g.opps.forEach((o) => { if (o.beat) (H[o.name] ??= []).push({ ...o, t: g.t, dow: g.dow, mon: g.mon, c: g.char }); }));
    for (const [Y, a] of Object.entries(H)) {
      const w = a.filter((x) => x.beat > 0).length;
      if (a.length >= 6 && w === a.length) push('unbeaten', 3, a.length / 20, { Y, n: a.length });
      const ls = a.filter((x) => x.beat < 0);
      if (a.length >= 6 && ls.length && w / a.length < 1 && a.slice(-4).every((x) => x.beat > 0)) { const lt = new Date(ls[ls.length - 1].t); push('since', 2.5, 0.5, { Y, M: MONN[lt.getMonth()] }); }
      for (let d = 0; d < 7; d++) { const x = a.filter((q) => q.dow === d); if (x.length >= 4 && x.every((q) => q.beat > 0) && w / a.length < 0.8) push('owns', 3, x.length / 10, { Y, d: DAYN[d] }); }
      if (w >= 4) { const wc = {}; a.filter((x) => x.beat > 0 && x.c).forEach((x) => (wc[x.c] = (wc[x.c] || 0) + 1)); const tc = Object.entries(wc).sort((x, y) => y[1] - x[1])[0]; if (tc && tc[1] === a.filter((x) => x.beat > 0).length && a.filter((x) => x.c && x.c !== tc[0] && x.beat < 0).length >= 3 && !a.some((x) => x.c !== tc[0] && x.beat > 0)) push('onlyWith', 3, 0.7, { Y, C: tc[0] }); }
    }
    // one character on one day
    const top = (a) => { const c = {}; a.forEach((g) => g.char && (c[g.char] = (c[g.char] || 0) + 1)); const t = Object.entries(c).sort((x, y) => y[1] - x[1])[0]; return t && t[1] >= 5 ? t[0] : null; };
    for (let d = 0; d < 7; d++) {
      const a = G.filter((g) => g.dow === d && g.char); if (a.length < 5) continue;
      const c = {}; a.forEach((g) => (c[g.char] = (c[g.char] || 0) + 1));
      const t = Object.entries(c).sort((x, y) => y[1] - x[1])[0];
      if (t[1] / a.length >= 0.6 && G.filter((g) => g.char === t[0]).length / (cg.length || 1) <= 0.35) push('charDay', 2.5, t[1] / a.length, { C: t[0], d: DAYN[d] });
    }
    // parity of their own game count
    const od = G.filter((_, k) => k % 2 === 0), ev = G.filter((_, k) => k % 2 === 1);
    if (od.length >= 8 && ev.length >= 8) { if (wr(od) - wr(ev) >= 0.25) push('odd', 2, wr(od) - wr(ev), { pct: pc(wr(od)) }); else if (wr(ev) - wr(od) >= 0.25) push('even', 2, wr(ev) - wr(od), { pct: pc(wr(ev)) }); }
    // number of players
    for (const k of [3, 4]) { const a = G.filter((g) => g.n === k); const b = G.filter((g) => g.n !== k && g.n > 2); if (a.length >= 6 && b.length >= 6 && wr(a) - wr(b) >= 0.2) push('size', 2, wr(a) - wr(b), { k }); }
    const ff = G.filter((g) => !g.one);
    if (ff.length >= 6 && ff.every((g) => g.place < g.n)) push('neverLast', 2, 0.6, {});
    // Random after a win
    const rr = G.map((g, k) => ({ g, p: G[k - 1] })).filter((x) => x.g.rnd && x.p);
    if (rr.length >= 3 && rr.every((x) => x.p.win)) push('rndWin', 2.5, 0.7, {});
    return out;
  }

  // Best two badges, one per kind, in a stable order.
  function pick(M, name, n) {
    const seen = new Set(), res = [];
    for (const b of badges(M, name).sort((a, c) => c.s - a.s || hash(name + a.key) - hash(name + c.key))) { if (seen.has(b.key)) continue; seen.add(b.key); res.push(b); if (res.length >= (n || 2)) break; }
    return res;
  }

  // Every phrase the generator can produce for the given roster, for printing.
  function enumerate(fighters) {
    const L = [], add = (key, v) => PH[key].forEach((f) => L.push(f(v))), PCT = 70;
    for (const f of FAMS) add('fam', { f, pct: 60 });
    for (const C of fighters) { add('topchar', { C, pct: 75 }); add('haunted', { C, w: 1, l: 6 }); }
    for (let d = 0; d < 7; d++) { add('dayNever', { d: DAYN[d] }); add('dayBest', { d: DAYN[d], pct: 88 }); }
    for (let h = 0; h < 24; h++) { add('hourBest', { h }); add('hourWorst', { h }); }
    ['lateUp', 'lateDn', 'dayUp', 'rage', 'loyal', 'revenge', 'third', 'fast', 'closer', 'leaveWin', 'warm', 'owl', 'noWeekend', 'weekendOnly', 'neverLast', 'rndWin', 'sdWin', 'odd', 'even'].forEach((k) => add(k, { pct: PCT, a: 4, b: 5 }));
    for (const C of fighters) for (let d = 0; d < 7; d++) add('charDay', { C, d: DAYN[d] });
    for (const C of fighters) add('onlyWith', { C, Y: '[Player]' });
    for (let d = 0; d < 7; d++) add('owns', { Y: '[Player]', d: DAYN[d] });
    for (const M of MONN) add('since', { Y: '[Player]', M });
    add('onlyOne', { Y: '[Player]', k: 7, L: 8 }); add('unbeaten', { Y: '[Player]', n: 9 });
    [3, 4].forEach((k) => add('size', { k }));
    for (let k = 8; k <= 40; k++) add('variety', { k });
    return L;
  }

  root.BADGES = { badges, pick, enumerate, FAMS, PH };
  if (typeof module !== 'undefined') module.exports = root.BADGES;
})(typeof window !== 'undefined' ? window : globalThis);
