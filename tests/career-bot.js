#!/usr/bin/env node
// Career balance tool (owner, 2026-10-16): plays whole Story runs (two seasons) with a player policy that uses the week's
// days like a person would — train at a place it can reach, rest when tired, relax when low, join the best club that takes
// it — and reports what a run looks like: your rating against the league and the rival, money, mood, Drive & Pain,
// evaluations, both Cups and your squad's odds against hers, the rematch and the ending.
// npm run career -- [runs=12] [policy=good|casual|both]
// as one extra line. The others never press and never stop on the road (encounters are the map's; the baseline is without effort).
const { load } = require('./harness');
const [N = 12, POL = 'both'] = process.argv.slice(2).map((v, i) => (i === 0 ? +v : v));

/** The place and order of `kind` ('drill' | 'work') that train body stat `stat` best per day (any stat: null), as [id, order]
 * or null — gain × the place's multiplier ÷ the days it takes (spec §4.33). */
function placeFor(g, run, stat, kind = 'drill', mainOnly = false) {
  let best = null,
    bv = -1;
  for (const id of Object.keys(g.SPOTS)) {
    if (!g.SPOTS[id].kit) continue;
    for (const oid of g.City.orders(id)) {
      const O = g.DAY_ORDERS[oid];
      if (O.kind !== kind || !g.City.can(run, id, oid).ok) continue;
      const amt = stat ? (O.main[0] === stat ? O.main[1] : !mainOnly && O.side[0] === stat ? O.side[1] : 0) : O.main[1] + O.side[1];
      if (!amt) continue;
      const v = (amt * g.City.mul(run, id) * g.Training.mul(run, oid, false, 1, id) + (O.pay || 0) / 10) / g.City.cost(run, id);
      if (v > bv) [bv, best] = [v, [id, oid]];
    }
  }
  return best;
}
/** What to train (body stats, spec §4.33): casual = the body stat its key court skill leans on, then the weakest — never Flexibility
 * on purpose (T-312); good = Flexibility
 * while the swing is short, else the weakest of the four (the key one counts 8 lower), wit when it lags. */
function statFor(g, run, pol) {
  const you = g.Run.you(run),
    B = you.body,
    cap = g.Training.cap(run),
    key = g.Body.lead(g.KEYSTAT[you.role]);
  if (pol === 'casual') {
    // its key stat's drill, then the next weakest drill — never Flexibility on purpose (it never stretches)
    if (B[key] < cap) return key;
    const open = g.BODY.keys.filter(k => k !== 'flex' && B[k] < cap);
    return open.length ? open.reduce((a, k) => (B[k] < B[a] ? k : a)) : key;
  }
  if (B.flex < cap && B.flex < g.BODY.swing * B.str + 3) return 'flex'; // keep the swing full
  const open = g.BODY.keys.filter(k => B[k] < cap);
  if (you.wit * 50 < Math.min(...open.map(k => B[k])) - 5 || !open.length) return 'wit';
  return open.reduce((a, k) => (B[k] - (k === key ? 8 : 0) < B[a] - (a === key ? 8 : 0) ? k : a), open[0]);
}
/** A training week: spend the days (good: Work when money is short, Stretch when a drill can't be paid, Run the trips). */
function week(g, run, pol, M) {
  for (let guard = 0; guard < 20 && g.City.days(run) > 0; guard++) {
    obs(run, M);
    if (pol !== 'casual' && !run.event && warMoves(g, run, M)) continue;
    if (run.event) {
      const pre = run.event.pre;
      g.Run.log(run, g.Events.choose(run, 0));
      if (!pre) return;
      continue;
    }
    let id = null,
      hard = false,
      opt;
    const good = pol !== 'casual',
      y2 = good && g.Season.year(run) > 1 && g.Secret ? secretFor(g, run, M) : null;
    if (y2) [id, opt] = y2;
    else if (run.sta < (good ? 45 : 35)) id = g.City.can(run, 'home').ok ? 'home' : null;
    else if (good && run.mood <= 1 && g.City.can(run, 'park').ok) id = 'park';
    else {
      const st = statFor(g, run, pol),
        pf = good && run.money < M.workBelow ? placeFor(g, run, null, 'work') : placeFor(g, run, st, 'drill', !good); // casual drills by the main gain only
      if (pf) [id, opt] = pf;
      else if (good && g.City.can(run, 'home', 'stretch').ok) [id, opt] = ['home', 'stretch']; // broke: stretch for free
      hard = good && run.sta > 85;
    }
    if (!id) break;
    // good: run the trip there when the legs and the stamina allow (the same days; the ground trains)
    const at = g.City.at(run, id),
      plan = good && g.City.trip(run, at) > 0 && !g.City.noRun(run, at) ? g.City.runPlan(run, at) : null;
    if (plan && run.sta - plan.sta > 60 && g.City.travelTo(run, at, 'run')) {
      M.runs++;
      M.runSta += plan.sta;
    }
    obs(run, M);
    const m0 = run.money,
      line = g.City.day(run, id, hard, opt),
      ok = opt && g.DAY_ORDERS[opt] ? g.DAY_ORDERS[opt].kind : 'place';
    M.cash[ok] = (M.cash[ok] || 0) + (run.money - m0);
    obs(run, M);
    if (!line) break;
    if (y2) M.secret[id] = (M.secret[id] || 0) + 1;
    if (opt && g.DAY_ORDERS[opt]) M.orders[g.DAY_ORDERS[opt].kind] = (M.orders[g.DAY_ORDERS[opt].kind] || 0) + 1;
    if (/failed/.test(line)) M.fails++;
  }
}
/** Money seen between two looks: income and spending (measurement). */
function obs(run, M) {
  const d = run.money - M.lastMoney;
  if (d > 0) M.cashIn += d;
  else M.cashOut -= d;
  M.lastMoney = run.money;
}
/** Good policy in the war (measurement, 2026-10-19): a Raid once a week when it may (stamina > 60); an overthrow of a Broken
 * unit across its border when it may (stamina > 60). True when it spent the day. */
function warMoves(g, run, M) {
  if (process.env.CAREER_WAR === '0' || run.sta <= 60) return false; // CAREER_WAR=0: the good policy stays out of the war
  if (g.Fight.raidWhy(run) === '') {
    const n = run.mlog.length,
      line = g.Fight.raid(run);
    if (line && run.mlog.length > n) {
      M.raids.push(!!run.mlog[run.mlog.length - 1].win);
      return true;
    }
  }
  for (const u of g.War.ids()) {
    const S = g.War.side(run, u);
    if (!S || !g.War.can(run, u, S.by).ok) continue;
    const fx = g.War.overthrow(run, u);
    if (!fx) continue;
    const m = g.newMatch(fx.a, fx.b, false);
    fx.setup(m);
    while (!m.over) g.playRally(m);
    M.otWho = 'you';
    fx.onFinish(m);
    M.otWho = 'ai';
    return true;
  }
  return false;
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
      runs: 0,
      orders: {},
      workBelow: 60, // good works a day when money is under this
      fired: 0,
      minMoney: Infinity,
      evicted: 0,
      mood: [],
      evals: [[], []],
      y: [{}, {}],
      joined: null,
      // the war (measurement, 2026-10-19)
      runSta: 0,
      cash: {},
      cashIn: 0,
      cashOut: 0,
      lastMoney: 0,
      raids: [],
      otWho: 'ai',
      ot: [],
      fell: [],
      lo: {},
      stw: {}
    };
  M.lastMoney = run.money;
  const absW = r => (g.Season.year(r) - 1) * 28 + r.week;
  const destroy = g.War.destroy,
    rally = g.War.rally;
  g.War.destroy = (r, u, by) => {
    M.ot.push({ u, by, w: absW(r), who: M.otWho, win: true });
    M.fell.push({ u, by, w: absW(r), who: M.otWho });
    return destroy(r, u, by);
  };
  g.War.rally = (r, u) => {
    M.ot.push({ u, w: absW(r), who: M.otWho, win: false });
    return rally(r, u);
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
    for (const u of g.War.ids()) {
      const st = (M.stw[u] = M.stw[u] || [0, 0, 0, 0, 0]);
      if (g.War.fallen(r, u)) st[4]++;
      else {
        st[g.War.stage(r, u)]++;
        M.lo[u] = Math.min(M.lo[u] ?? 100, g.War.str(r, u));
      }
    }
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
    Y.swing = g.Body.swing(you.body);
    Y.war = Object.fromEntries(g.War.ids().map(u => [u, g.War.fallen(r, u) ? -1 : g.War.str(r, u)]));
    // CAREER_SAMPLE (the dev "Year-2 Cup sample" match, js/data/cup-sample.js): every squad of the year-2 Cup as drawn
    if (process.env.CAREER_SAMPLE && g.Season.year(r) === 2) {
      const riv = g.Stars.get(r, 'rival');
      SAMPLE.push({
        seed,
        pol,
        squads: r.cup.entrants.map((e, i) => {
          const T = g.Cup.team(r, i),
            o = g.teamToJSON(T);
          o.P = o.P.map(slim);
          o.bench = (o.bench || []).map(slim);
          return { ...o, you: T.P.concat(T.bench || []).some(p => p.you), rival: !!riv && squadIds(T).includes(riv.id), wr: T.wr || null };
        })
      });
    }
    Y.sq = {};
    for (const e of r.cup.entrants) if (e.region) Y.sq[e.region] = (Y.sq[e.region] || 0) + 1;
    const riv = g.Stars.get(r, 'rival'),
      ri = riv ? r.cup.entrants.findIndex(e => e.ids.includes(riv.id)) : -1,
      ovrs = r.cup.entrants.map((e, i) => g.Cup.team(r, i).ovr);
    Y.riv = riv ? (g.FACTIONS[riv.team.i] && g.FACTIONS[riv.team.i].region) || riv.team.region || '?' : '-';
    Y.walk = r.war && r.war.walk ? r.war.walk.to : null;
    Y.rivSq = ri >= 0 ? ovrs[ri] : null;
    Y.rivWeak = ri >= 0 ? g.War.weakOf(r, g.Cup.team(r, ri)) : null;
    Y.sqMean = ovrs.reduce((a, b) => a + b, 0) / ovrs.length;
    Y.sqTop = Math.max(...ovrs.filter((v, i) => i !== ri));
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
    obs(run, M);
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
    runs: M.runs,
    orders: M.orders,
    secret: M.secret,
    fans: run.fans,
    curve: M.curve,
    pts: M.pts,
    war: { lo: M.lo, stw: M.stw, ot: M.ot, fell: M.fell },
    raids: M.raids,
    cash: M.cash,
    cashIn: M.cashIn,
    cashOut: M.cashOut,
    runSta: M.runSta,
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
const SAMPLE = [];
const squadIds = T => T.P.concat(T.bench || []).map(p => p.id);
/** A player as the dev sample keeps it: what a match and its 3D figures read (no career state). */
const SLIM_DROP = ['log', 'mem', 'xp', 'plan', 'hist', 'want', 'traitsNpc', 'seen', 'memo'];
function slim(p) {
  const q = {};
  for (const k in p) if (!SLIM_DROP.includes(k) && typeof p[k] !== 'function') q[k] = p[k];
  return q;
}
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
    `  day orders a run       ${['drill', 'work', 'stretch'].map(k => `${k} ${f1(avg(R.map(r => r.orders[k] || 0)))}`).join(' · ')} · runs ${f1(avg(R.map(r => r.runs)))}`
  );
  console.log(
    `  mood avg ${f1(avg(R.map(r => r.mood)))} · Fired up ${f1(avg(R.map(r => r.fired)))} a run · Scars ${f1(avg(R.map(r => r.scars)))} · failed sessions ${f1(avg(R.map(r => r.fails)))} · fans ${f1(Y('fans')[0])} / ${f1(Y('fans')[1])}`
  );
  // ---- the war (measurement, 2026-10-19) ----
  const U = g0.War.ids();
  console.log(`  war (per run avg; weeks of 56)   lowest (min)   Steady/Strained/Shaken/Broken/fallen wks   Str at Cup Y1 / Y2   fell`);
  for (const u of U) {
    const st = k => f1(avg(R.map(r => (r.war.stw[u] || [])[k] || 0))),
      fell = R.filter(r => r.war.fell.some(f => f.u === u));
    console.log(
      `    ${u.padEnd(7)} ${f1(avg(R.map(r => r.war.lo[u] ?? 0))).padStart(5)} (${String(Math.min(...R.map(r => r.war.lo[u] ?? 0))).padStart(3)})   ${[0, 1, 2, 3, 4].map(st).join(' / ').padEnd(30)}   ${[
        0, 1
      ]
        .map(y => f1(avg(R.map(r => (r.y[y].war && r.y[y].war[u] >= 0 ? r.y[y].war[u] : null)))))
        .join(' / ')
        .padEnd(
          12
        )}   ${fell.length} / ${R.length}${fell.length ? ` (wk ${fell.map(r => r.war.fell.find(f => f.u === u).w).join(',')}; by ${fell.map(r => r.war.fell.find(f => f.u === u).by + (r.war.fell.find(f => f.u === u).who === 'you' ? '*' : '')).join(',')})` : ''}`
    );
  }
  const OT = R.flatMap(r => r.war.ot);
  for (const who of ['ai', 'you'])
    console.log(
      `  overthrows by ${who.padEnd(3)}  ${OT.filter(o => o.who === who).length} in ${R.length} runs, won ${OT.filter(o => o.who === who && o.win).length} · runs with any: ${R.filter(r => r.war.ot.some(o => o.who === who)).length} · targets ${JSON.stringify(OT.filter(o => o.who === who).reduce((o, x) => ((o[x.u] = (o[x.u] || 0) + 1), o), {}))}`
    );
  console.log(
    `  falls a run ${f1(avg(R.map(r => r.war.fell.length)))} · runs with ≥1 fall ${R.filter(r => r.war.fell.length).length} / ${R.length} · Gold fell ${R.filter(r => r.war.fell.some(f => f.u === 'gold')).length} (Haewon to: ${
      R.filter(r => r.y[1].walk)
        .map(r => r.y[1].walk)
        .join(',') || '—'
    })`
  );
  for (const y of [0, 1]) {
    const regs = [...new Set(R.flatMap(r => Object.keys(r.y[y].sq || {})))].sort();
    console.log(
      `  Cup Y${y + 1} squads/faction ${regs.map(k => `${k} ${f1(avg(R.map(r => (r.y[y].sq || {})[k] || 0)))} [${Math.min(...R.map(r => (r.y[y].sq || {})[k] || 0))}–${Math.max(...R.map(r => (r.y[y].sq || {})[k] || 0))}]`).join(' · ')}`
    );
    console.log(
      `  her squad Y${y + 1}  ovr ${f1(avg(R.map(r => r.y[y].rivSq)))} (all squads ${f1(avg(R.map(r => r.y[y].sqMean)))}, best other ${f1(avg(R.map(r => r.y[y].sqTop)))}) · her stage ${f1(avg(R.map(r => r.y[y].rivWeak)))} · she plays for ${JSON.stringify(R.reduce((o, r) => ((o[r.y[y].riv] = (o[r.y[y].riv] || 0) + 1), o), {}))} · swing ${f1(avg(R.map(r => r.y[y].swing)))}`
    );
  }
  const RD = R.flatMap(r => r.raids);
  console.log(
    `  raids ${f1(avg(R.map(r => r.raids.length)))} a run (runs with any ${R.filter(r => r.raids.length).length}), won ${pc(RD.length ? RD.filter(Boolean).length / RD.length : NaN)} of ${RD.length}`
  );
  const kinds = [...new Set(R.flatMap(r => Object.keys(r.cash)))].sort();
  console.log(
    `  money a run  in ${f1(avg(R.map(r => r.cashIn)))} · out ${f1(avg(R.map(r => r.cashOut)))} · by day order ${kinds.map(k => `${k} ${f1(avg(R.map(r => r.cash[k] || 0)))}`).join(' · ')}`
  );
  console.log(`  run trips ${f1(avg(R.map(r => r.runs)))} a run · stamina spent on them ${f1(avg(R.map(r => r.runSta)))}`);
  if (process.env.CAREER_SAMPLE && pol === (POL === 'both' ? 'good' : POL))
    require('fs').writeFileSync(
      process.env.CAREER_SAMPLE,
      '// Generated by `CAREER_SAMPLE=js/data/cup-sample.js npm run career -- <runs> good` (tests/career-bot.js): every squad of the\n' +
        '// year-2 U21 Cup from real auto-played Story runs, for the dev "Year-2 Cup" match (menu › Dev). Loaded on demand (js/ui/dev.js).\n' +
        `const CUP_SAMPLE = ${JSON.stringify(SAMPLE)};\n`
    );
  if (process.env.CAREER_JSON) require('fs').writeFileSync(`${process.env.CAREER_JSON}.${pol}.json`, JSON.stringify(R));
}
