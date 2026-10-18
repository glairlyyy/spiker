#!/usr/bin/env node
// Career balance tool (owner, 2026-10-16): plays whole Story runs (two seasons) with a player policy that uses the week's
// days like a person would — train at a place it can reach, rest when tired, relax when low, join the best club that takes
// it — and reports what a run looks like: your rating against the league and the rival, money, mood, Drive & Pain,
// evaluations, both Cups and your squad's odds against hers, the rematch and the ending.
// npm run career -- [runs=12] [policy=good|casual|both]
const { load } = require('./harness');
const [N = 12, POL = 'both'] = process.argv.slice(2).map((v, i) => (i === 0 ? +v : v));

/** One day's drill (spec §4.33): the place and order that train body stat `stat` best per day (main gain, else the Academy's
 * All-round at a discount), as [id, order] or null. */
function placeFor(g, run, stat) {
  let best = null,
    bv = -1;
  for (const id of Object.keys(g.SPOTS)) {
    if (!g.SPOTS[id].kit) continue;
    for (const oid of g.City.orders(id)) {
      const O = g.DAY_ORDERS[oid];
      if (O.kind !== 'drill' || (O.main[0] !== stat && oid !== 'allRound') || !g.City.can(run, id, oid).ok) continue;
      const v = ((oid === 'allRound' ? 0.45 : 1) * g.City.mul(run, id) * g.Training.mul(run, oid, false, 1, id)) / g.City.cost(run, id);
      if (v > bv) [bv, best] = [v, [id, oid]];
    }
  }
  return best;
}
/** What to train (body stats, spec §4.33): casual = the key stat's body stat; good = the weakest of the four (the key one
 * counts 8 lower), wit when it lags. */
function statFor(g, run, pol) {
  const you = g.Run.you(run),
    B = you.body,
    key = g.BODY.of[g.KEYSTAT[you.role]];
  if (pol === 'casual') return B[key] < g.Training.cap(run) ? key : g.STATK.map(k => g.BODY.of[k]).find(k => B[k] < g.Training.cap(run)) || 'wit'; // (the old court order's trainings)
  const open = g.BODY.keys.filter(k => B[k] < g.Training.cap(run));
  if (you.wit * 50 < Math.min(...open.map(k => B[k])) - 5 || !open.length) return 'wit';
  return open.reduce((a, k) => (B[k] - (k === key ? 8 : 0) < B[a] - (a === key ? 8 : 0) ? k : a), open[0]);
}
/** A training week: spend the days. */
function week(g, run, pol, M) {
  for (let guard = 0; guard < 20 && g.City.days(run) > 0; guard++) {
    if (run.event) {
      const pre = run.event.pre;
      g.Run.log(run, g.Events.choose(run, 0));
      if (!pre) return;
      continue;
    }
    let id = null,
      hard = false,
      opt;
    const y2 = pol === 'good' && g.Season.year(run) > 1 && g.Secret ? secretFor(g, run, M) : null;
    if (y2) [id, opt] = y2;
    else if (run.sta < (pol === 'good' ? 45 : 35)) id = g.City.can(run, 'home').ok ? 'home' : null;
    else if (pol === 'good' && run.mood <= 1 && g.City.can(run, 'park').ok) id = 'park';
    else {
      const st = statFor(g, run, pol),
        pf = placeFor(g, run, st);
      if (pf) [id, opt] = pf;
      hard = pol === 'good' && run.sta > 85;
    }
    if (!id) break;
    const line = g.City.day(run, id, hard, opt);
    if (!line) break;
    if (y2) M.secret[id] = (M.secret[id] || 0) + 1;
    if (/failed/.test(line)) M.fails++;
  }
}
/** Year 2 (good policy): the secret places when they pay — a letter, the tapes until her file is read, the hermit's trial when
 * the bar is reached, the lighthouse to let Pain go before a Scar, the onsen when worn out, a night game when Drive is low. */
function secretFor(g, run, M) {
  const S = g.Secret.of(run),
    you = g.Run.you(run),
    best = Math.max(...g.STATK.map(k => you[k])),
    bar = g.SECRET.hermit.bars[S.trials || 0],
    ok = (id, o) => g.City.can(run, id, o).ok;
  if (ok('roof')) return ['roof'];
  if (g.Secret.habits(run).length > (run.habits || []).length && ok('tapes')) return ['tapes'];
  if (bar != null && best >= bar && ok('hermit')) return ['hermit'];
  if (g.Feel.of(run).pain >= 70 && ok('light', 'let')) return ['light', 'let'];
  if ((run.sta < 35 || run.injury) && ok('onsen')) return ['onsen'];
  if (g.Feel.of(run).drive < 30 && !M.night && ok('midnight')) {
    M.night = true;
    return ['midnight'];
  }
  return null;
}
function joinBest(g, run) {
  if (!g.World.isFree(run)) return;
  const open = run.teams.filter(t => g.World.canJoin(run, t.i).ok).sort((a, b) => b.ovr - a.ovr);
  if (open.length) g.World.join(run, open[0].i);
}
/** Your Cup squad against the rival's, on a seeded stream (the run's own is untouched): wins in n. */
function cupOdds(g, run, n = 20) {
  const riv = g.Stars.get(run, 'rival');
  if (!run.cup || run.cup.me < 0 || !riv) return null;
  const ri = run.cup.entrants.findIndex(e => e.ids.includes(riv.id));
  if (ri < 0 || ri === run.cup.me) return null;
  const A = g.Cup.team(run, run.cup.me),
    B = g.Cup.team(run, ri);
  return g.Secret.isolated(4242 + run.week, () => {
    let w = 0;
    for (let i = 0; i < n; i++) if (g.simMatch(A, B).winner === 0) w++;
    return w / n;
  });
}
function play(seed, pol) {
  const g = load(seed),
    role = ['WS', 'MB', 'S'][seed % 3],
    run = g.Run.create(g.Run.draft(), { role, name: 'Bot', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    you = g.Run.you(run),
    M = {
      curve: {},
      pts: { train: 0, match: 0, other: 0 },
      secret: {},
      fails: 0,
      fired: 0,
      minMoney: Infinity,
      evicted: 0,
      mood: [],
      evals: [[], []],
      y: [{}, {}],
      joined: null
    };
  g.Story.skip(run);
  const add = g.Feel.add;
  g.Feel.add = (r, k, v) => {
    const was = r.fired;
    const out = add(r, k, v);
    if (k === 'drive' && r.fired && r.fired !== was) M.fired++;
    return out;
  };
  const addXp = g.Training.addXp;
  g.Training.addXp = (r, stat, xp, src = 'train') => {
    const was = stat === 'wit' ? 0 : g.Training.level(you, stat),
      out = addXp(r, stat, xp, src);
    if (stat !== 'wit') M.pts[src] += g.Training.level(you, stat) - was;
    return out;
  };
  const endWeek = g.Run.endWeek;
  g.Run.endWeek = r => {
    const w = (g.Season.year(r) - 1) * 28 + r.week,
      before = g.STATK.reduce((a, k) => a + you[k], 0);
    endWeek(r);
    if (w % 4 === 0) M.curve[w] = [g.ovr(you), g.Season.mean(r), g.ovr(g.Stars.get(r, 'rival') || you)];
    M.pts.other += g.STATK.reduce((a, k) => a + you[k], 0) - before;
  };
  const cupStart = g.Cup.start;
  g.Cup.start = (r, def) => {
    cupStart(r, def);
    const Y = M.y[g.Season.year(r) - 1];
    Y.odds = cupOdds(g, r);
    Y.you = g.ovr(you);
    Y.league = g.Season.mean(r);
    Y.rival = g.ovr(g.Stars.get(r, 'rival'));
    Y.money = r.money;
    Y.stats = g.STATK.map(k => you[k]).concat(Math.round(you.wit * 50));
    Y.body = g.BODY.keys.map(k => you.body[k]);
    Y.short = g.Body.swing(you.body) < 1;
    Y.fans = r.fans;
  };
  for (let guard = 0; guard < 800 && !run.result; guard++) {
    // the hub's scenes (and the first hub after a match) play and are read at once: their flags apply (Fern's goodbye …)
    for (const on of ['result', 'hub']) if (g.Story.on(run) && g.Story.fire(run, on)) g.Story.skip(run);
    if (run.story.res) run.story.res = null;
    run.story.at = null;
    run.story.cur = null;
    if (run.event) {
      const pre = run.event.pre;
      g.Run.log(run, g.Events.choose(run, 0));
      if (!pre && g.Run.canEndWeek(run)) g.Run.endWeek(run);
      continue;
    }
    joinBest(g, run);
    if (M.joined == null && !g.World.isFree(run)) M.joined = (g.Season.year(run) - 1) * 28 + run.week;
    M.minMoney = Math.min(M.minMoney, run.money);
    if (run.housing === 'homeless') M.evicted++;
    M.mood.push(run.mood);
    const wt = g.Run.weekType(run);
    if (wt === 'eval' || wt === 'cup') {
      if (wt === 'eval' && run.eval && run.eval.kind === 'faction' && !run.eval.mine) {
        g.Eval.bench(run);
        g.Run.endWeek(run);
        continue;
      }
      if (wt === 'cup') {
        run.focus = g.FOCUS[role][0][0];
        run.talk = 'fire';
      }
      const fx = g.Cup.fixture(run, wt),
        m = g.newMatch(fx.a, fx.b, false);
      if (fx.setup) fx.setup(m);
      while (!m.over) g.playRally(m);
      if (wt === 'eval') M.evals[g.Season.year(run) - 1].push(m.winner === 0);
      fx.onFinish(m);
      continue;
    }
    week(g, run, pol, M);
    if (g.Run.canEndWeek(run)) g.Run.endWeek(run);
  }
  const F = run.story.flags;
  return {
    pol,
    role,
    y: M.y,
    cups: run.cups.map(c => c.place),
    evals: M.evals.map(e => (e.length ? e.filter(Boolean).length / e.length : null)),
    rematch: F.rematchWon ? 1 : F.rematchLost ? 0 : null,
    beat1: !!F.beatRival,
    ending: run.result && run.result.ending,
    rank: run.result && run.result.rank,
    fired: M.fired,
    scars: (run.scars || []).length,
    minMoney: M.minMoney,
    evicted: M.evicted,
    mood: M.mood.reduce((a, b) => a + b, 0) / Math.max(1, M.mood.length),
    joined: M.joined,
    fails: M.fails,
    secret: M.secret,
    fans: run.fans,
    curve: M.curve,
    pts: M.pts,
    cupW: [1, 2].map(y => run.mlog.filter(e => e.kind === 'cup' && e.y === y).map(e => e.win))
  };
}
const avg = A => {
  const B = A.filter(v => v != null && Number.isFinite(v));
  return B.length ? B.reduce((a, b) => a + b, 0) / B.length : NaN;
};
const f1 = v => (Number.isFinite(v) ? v.toFixed(1) : '—'),
  pc = v => (Number.isFinite(v) ? `${Math.round(100 * v)} %` : '—');
const g0 = load(1);
for (const pol of POL === 'both' ? ['casual', 'good'] : [POL]) {
  const R = [];
  for (let i = 0; i < N; i++) R.push(play(3000 + i, pol));
  const Y = k => [0, 1].map(y => avg(R.map(r => r.y[y][k])));
  const cnt = (f, k) => R.filter(r => f(r[k])).length;
  console.log(`\n${pol} · ${N} runs`);
  console.log(
    `  you at the Cup        Y1 ${f1(Y('you')[0])}  Y2 ${f1(Y('you')[1])}   (league ${f1(Y('league')[0])} / ${f1(Y('league')[1])}, rival ${f1(Y('rival')[0])} / ${f1(Y('rival')[1])})`
  );
  const ws = [...new Set(R.flatMap(r => Object.keys(r.curve).map(Number)))].sort((a, b) => a - b);
  console.log(`  week            ${ws.map(w => String(w).padStart(4)).join('')}`);
  for (const [i, lab] of ['you', 'league', 'rival'].entries())
    console.log(`  ${lab.padEnd(16)}${ws.map(w => f1(avg(R.map(r => r.curve[w] && r.curve[w][i]))).padStart(4)).join('')}`);
  for (const y of [0, 1])
    console.log(
      `  stats at Cup Y${y + 1}  ${g0.STATK.concat('wit')
        .map((k, i) => `${k} ${f1(avg(R.map(r => r.y[y].stats && r.y[y].stats[i])))}`)
        .join(' · ')}`
    );
  for (const y of [0, 1])
    console.log(
      `  body at Cup Y${y + 1}   ${g0.BODY.keys.map((k, i) => `${k} ${f1(avg(R.map(r => r.y[y].body && r.y[y].body[i])))}`).join(' · ')} · swing short ${R.filter(r => r.y[y].short).length} / ${R.length}`
    );
  console.log(`  body points from  ${['train', 'match', 'other'].map(k => `${k} ${f1(avg(R.map(r => r.pts[k])))}`).join(' · ')}`);
  console.log(
    `  vs her squad (odds)   Y1 ${pc(Y('odds')[0])}  Y2 ${pc(Y('odds')[1])}   (met in the bracket: ${R.filter(r => r.y[0].odds != null).length} / ${R.filter(r => r.y[1].odds != null).length})`
  );
  console.log(
    `  evaluations won       Y1 ${pc(avg(R.map(r => r.evals[0])))}  Y2 ${pc(avg(R.map(r => r.evals[1])))}   · rematch won ${cnt(v => v === 1, 'rematch')} / ${cnt(v => v != null, 'rematch')} · Y1 beat her ${cnt(v => v, 'beat1')}`
  );
  console.log(`  Cups                  ${R.map(r => r.cups.join('/')).join(' · ')}`);
  console.log(
    `  Cup match wins        Y1 ${pc(avg(R.flatMap(r => r.cupW[0].map(Number))))}  Y2 ${pc(avg(R.flatMap(r => r.cupW[1].map(Number))))} (${R.reduce((a, r) => a + r.cupW[1].length, 0)} matches)`
  );
  console.log(
    `  endings               true ${cnt(v => v === 'true', 'ending')} · spite ${cnt(v => v === 'spite', 'ending')} · ranks ${R.map(r => r.rank).join('')}`
  );
  console.log(
    `  joined a club (week)  ${f1(avg(R.map(r => r.joined)))} (never: ${cnt(v => v == null, 'joined')}) · money at the Cups ${f1(Y('money')[0])} / ${f1(Y('money')[1])} (Y1 under $600: ${R.filter(r => r.y[0].money < 600).length} / ${R.length}) · lowest ${f1(avg(R.map(r => r.minMoney)))} · evicted weeks ${f1(avg(R.map(r => r.evicted)))}`
  );
  console.log(
    `  final fans ${f1(avg(R.map(r => r.fans)))} (min ${Math.min(...R.map(r => r.fans))}, max ${Math.max(...R.map(r => r.fans))}) · secret visits ${JSON.stringify(
      R.reduce((o, r) => {
        for (const k in r.secret) o[k] = (o[k] || 0) + r.secret[k];
        return o;
      }, {})
    )}`
  );
  console.log(
    `  mood avg ${f1(avg(R.map(r => r.mood)))} · Fired up ${f1(avg(R.map(r => r.fired)))} a run · Scars ${f1(avg(R.map(r => r.scars)))} · failed sessions ${f1(avg(R.map(r => r.fails)))} · fans ${f1(Y('fans')[0])} / ${f1(Y('fans')[1])}`
  );
}
