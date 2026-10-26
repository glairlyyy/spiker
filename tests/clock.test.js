// Tests: the running clock (spec §4.43, T-365) — time runs on the map (MapView.tick), Space pauses, the speeds; idle hours, the
// 02:00 nod and the match hold (City.idle); a walk counts its minutes; a session fast-forwards and an interrupt keeps the hours so
// far (City.cutDay); a bus is caught only at the stop at its time.
const fs = require('fs'),
  path = require('path');
const { load, test, assert, eq } = require('./harness');

/** A fresh Endless run in a training week, at home at 07:00, rested, with money (as day.test.js). */
function clockRun(seed = 43) {
  const g = load(seed),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Clock', mode: { story: false } });
  run.event = null;
  run.week = 2;
  run.clock = g.City.freshClock();
  run.money = 1000;
  run.housing = 'studio';
  run.pos = g.City.at(run, 'home').map(Math.round);
  run.sta = run.staMax;
  return [g, run];
}
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

/** js/ui/map-view.js's MapView on the game's rules with the page stubbed: env.t = the clock (ms), env.k = the stored speed, env.ff = the fast-forward hours handed on. */
function mapView(g, run) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/ui/map-view.js'), 'utf8'),
    env = {
      t: 1000,
      k: '1',
      ff: 0,
      renders: 0,
      CW: { lock: null, sheet: null, fig: null, gear: false },
      RUN: run,
      A: null,
      document: { querySelector: s => (s === '.career.hub' ? {} : null) },
      store: { get: () => env.k, set: (_, v) => (env.k = v) },
      KEYS: { walk: 'sns_walk' },
      ffStep: h => (env.ff += h),
      renderCareer: () => env.renders++,
      clockShow: () => {},
      clockRefresh: () => {}
    };
  env.performance = { now: () => env.t };
  const scope = new Proxy(env, {
    has: () => true,
    get: (o, k) => (k in o ? o[k] : k === Symbol.unscopables ? undefined : k in g ? g[k] : globalThis[k])
  });
  const MV = new Function('scope', `with (scope) { ${src}\n; return MapView; }`)(scope);
  return [MV, env];
}

test('clock: time runs on the map — a game hour = CLOCK.scale s at ×1, ×4 four times as fast; Space pauses; a sheet stops it (T-365)', () => {
  const [g, run] = clockRun(),
    [MV, env] = mapView(g, run),
    step = ms => ((env.t += ms), MV.tick());
  MV.tick(); // (the first tick only starts the clock)
  const h0 = g.City.hour(run);
  for (let i = 0; i < 10; i++) step(100);
  assert(near(g.City.hour(run), h0 + 1 / g.CLOCK.scale, 1e-9), `1 s at ×1 = 1 / ${g.CLOCK.scale} h (${g.City.hour(run) - h0})`);
  eq(run.clock.log.length, 0, 'idle time leaves no block on the strip');
  MV.pause(true);
  const h1 = g.City.hour(run);
  for (let i = 0; i < 10; i++) step(100);
  eq(g.City.hour(run), h1, 'paused: the clock stands');
  MV.pause(false);
  MV.setWalk(4);
  for (let i = 0; i < 10; i++) step(100);
  assert(near(g.City.hour(run), h1 + 4 / g.CLOCK.scale, 1e-9), '×4: four times as fast');
  env.CW.sheet = 'me';
  const h2 = g.City.hour(run);
  step(100);
  eq(g.City.hour(run), h2, 'a sheet over the map: it waits');
  env.CW.sheet = null;
  env.CW.lock = { phase: 'walk' };
  step(100);
  eq(g.City.hour(run), h2, 'a walk: its hours were counted when it began');
  env.CW.lock = { phase: 'ff', ff: { done: 0 } };
  step(100);
  eq(g.City.hour(run), h2, 'a fast-forward: the rules wait for its end…');
  assert(near(env.ff, 0.1 * 4 * g.CLOCK.ff, 1e-9), `…its hours run at CLOCK.ff × the speed (${env.ff})`);
});

test('clock: idle hours — at 02:00 you nod off where you stand; a match week holds the clock at the hour you must leave (T-365)', () => {
  const [g, run] = clockRun();
  run.clock.hour = 25.5;
  const r = g.City.idle(run, 1);
  assert(near(r.h, 0.5) && /nodded off/.test(r.line), `02:00: nodded off (${r.line})`);
  eq(run.clock.day, 2, 'the next day');
  const [g2, r2] = clockRun();
  g2.Run.weekType = () => 'eval';
  const by = g2.City.leaveBy(r2);
  assert(by !== null && by <= g2.DAY.match, `a match week: leave by ${g2.City.hhmm(by)}`);
  g2.City.idle(r2, 30);
  assert(near(g2.City.hour(r2), by), `the clock waits at ${g2.City.hhmm(by)} (${g2.City.hhmm(g2.City.hour(r2))})`);
  eq(g2.City.idle(r2, 1).h, 0, 'and holds there');
});

test('clock: the walk counts its minutes — no 1 h minimum, the hours are the route ÷ pace as before (T-365)', () => {
  const [g, run] = clockRun(),
    p = [run.pos[0] + 60, run.pos[1]],
    w = g.City.trip(run, p),
    h0 = g.City.hour(run);
  assert(w > 0 && w < 1, `a short walk: minutes (${g.City.hrs(w)})`);
  assert(g.City.travelTo(run, p), 'walked');
  assert(near(g.City.hour(run), h0 + w), 'the clock moved by the walk');
  eq(g.City.hrs(1 + 20 / 60), '1 h 20', 'printed: 1 h 20');
  eq(g.City.hrs(0.25), '15 min', 'printed: 15 min');
});

test('clock: a session cut short keeps its whole hours so far; a sleep every minute; the rest is lost (T-365)', () => {
  const [g, run] = clockRun(),
    at = 'acaGym';
  run.pos = g.City.at(run, at).slice();
  const xp0 = JSON.stringify(run.xp || {}),
    h0 = g.City.hour(run),
    line = g.City.cutDay(run, at, false, 'allRound', 2.6);
  assert(/stopped after 2 h 36/.test(line), `the diary says so (${line})`);
  assert(near(g.City.hour(run), h0 + 2.6, 1e-9), 'the time so far passed (2.6 h)');
  eq(
    run.clock.log
      .filter(b => b.k === 'train')
      .map(b => b.h)
      .join(),
    '2',
    'a 2 h session counted'
  );
  assert(JSON.stringify(run.xp || {}) !== xp0 || run.sp > 0, 'it trained');
  const [g2, r2] = clockRun();
  r2.pos = g2.City.at(r2, at).slice();
  const h2 = g2.City.hour(r2),
    l2 = g2.City.cutDay(r2, at, false, 'allRound', 0.5);
  assert(/nothing done/.test(l2) && near(g2.City.hour(r2), h2 + 0.5), `under an hour: nothing done, the time passed (${l2})`);
  const [g3, r3] = clockRun();
  r3.clock.hour = 22;
  r3.sta = 20;
  const miss = r3.staMax - r3.sta,
    l3 = g3.City.cutDay(r3, 'home', false, undefined, 5);
  assert(/Slept 5 h/.test(l3), `a sleep cut at 5 h (${l3})`);
  eq(r3.sta, 20 + Math.round(miss * g3.City.sleepK(5) * g3.World.restMul(r3)), 'stamina back by the hours slept');
  assert(g3.City.sleepK(5) > g3.DAY.sleep[4] && g3.City.sleepK(5) < g3.DAY.sleep[6], 'between 4 h and 6 h');
  eq(r3.clock.day, 2, 'you woke on the next day');
  assert(near(g3.City.hour(r3), 3), 'at 03:00');
});

test('clock: a bus is caught only if you are at the stop at its time — a minute late, the next one (T-365)', () => {
  const [g] = clockRun(),
    B = g.TRANSPORT.bus,
    L = B.lines[0],
    o = g.ROADS.nodes[L.stops[0]],
    p = g.ROADS.nodes[L.stops[L.stops.length - 1]],
    h = B.first + 2 * B.every,
    on = g.City.busTrip(o, p, h),
    late = g.City.busTrip(o, p, h + 1 / 60),
    wait = T => T.legs.find(l => l.m === 'bus').wait;
  eq(wait(on), 0, 'at the stop at its time: aboard');
  eq(g.City.depart(B, h).at, h, 'its departure');
  assert(near(g.City.depart(B, h + 1 / 60).at, h + B.every), 'a minute late: the next one');
  assert(
    late.raw + 1 / 60 > on.raw + 0.1,
    `missing it costs more than the minute (${g.City.hrs(on.raw)} vs ${g.City.hrs(late.raw + 1 / 60)})`
  );
});

test('clock pacing (owner 2026-10-27): 60 s on the map at ×4 — no renderCareer while you walk or stand; the rail refreshes every ½ game h, not per frame', () => {
  const [g, run] = clockRun(),
    [MV, env] = mapView(g, run);
  let refresh = 0;
  env.clockRefresh = () => refresh++;
  MV.setWalk(4);
  MV.tick();
  const h0 = g.City.hour(run),
    frames = 60 * 60;
  for (let i = 0; i < frames; i++) ((env.t += 1000 / 60), MV.tick());
  const hrs = g.City.hour(run) - h0;
  assert(near(hrs, (60 * 4) / g.CLOCK.scale, 1e-6), `60 s at ×4 = ${(60 * 4) / g.CLOCK.scale} h (${hrs})`);
  eq(env.renders, 0, 'standing: no renderCareer');
  assert(
    refresh >= Math.floor(hrs / g.CLOCK.save) && refresh <= Math.ceil(hrs / g.CLOCK.save) + 1,
    `${refresh} rail refreshes in ${hrs.toFixed(2)} h`
  );
  env.CW.lock = { phase: 'walk' };
  refresh = 0;
  for (let i = 0; i < frames; i++) ((env.t += 1000 / 60), MV.tick());
  eq(env.renders, 0, 'walking: no renderCareer');
  eq(refresh, 0, 'walking: the walk counted its hours as it began — nothing to refresh');
});

/** js/ui/career-map.js's WASD catch-up (roamRender / roamDue / roamLight) with the hub's builders stubbed: env.renders / env.light count. */
function roamHub(g, run) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/ui/career-map.js'), 'utf8'),
    body = src.slice(src.indexOf('const ROAM_IDLE'), src.indexOf('function mapEndWeek')),
    env = {
      renders: 0,
      light: 0,
      CW: { lock: null, sheet: null, fig: null, spot: null, briefWeek: 'k', endArm: 0 },
      RUN: run,
      document: { querySelector: s => (s === '.career.hub' ? {} : null) },
      setTimeout: f => f(),
      clearTimeout: () => {},
      requestIdleCallback: undefined,
      MapView: { m3: null, update: () => env.light++ },
      MapModel: { build: () => ({}) },
      briefKey: () => 'k',
      ownChanges: () => [],
      renderCareer: () => env.renders++,
      topBar: () => '',
      railStrip: () => '',
      weekRail: () => '',
      roadSync: () => {},
      figRender: () => {}
    };
  const scope = new Proxy(env, {
    has: () => true,
    get: (o, k) => (k in o ? o[k] : k === Symbol.unscopables ? undefined : k in g ? g[k] : globalThis[k])
  });
  const roam = new Function('scope', `with (scope) { ${body}\n; return roamRender; }`)(scope);
  return [roam, env];
}

test('WASD stop catch-up (pacing follow-up 2026-10-27): nothing due → no renderCareer (patches + MapView.update); a story scene due → renderCareer', () => {
  const g = load(44),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'Roam', mode: { story: true } });
  run.event = null;
  run.clock = g.City.freshClock();
  const S = run.story;
  for (const id of Object.keys(g.SCENES)) S.seen[id] = true;
  for (const p of g.People.all(run)) S.seen[`presence:${p.id}`] = true;
  delete S.meet;
  delete S.res;
  S.cur = null;
  S.at = g.Story.clock(run);
  const [roam, env] = roamHub(g, run);
  eq(g.City.night(run), false, 'daytime');
  roam();
  eq(env.renders, 0, 'nothing due: no renderCareer');
  eq(env.light, 1, 'nothing due: the light patch (the map model updated)');
  eq(roam.why, '', 'why: none');
  S.cur = { id: Object.keys(g.SCENES)[0], i: 0, mode: {}, log: [] };
  roam();
  eq(env.renders, 1, 'a story scene due: the full render');
  eq(roam.why, 'story', 'why: the story');
  S.cur = null;
  run.event = { id: 'x' };
  roam();
  eq(env.renders, 2, 'an event: the full render');
  run.event = null;
  run.week = 2;
  S.seen.explore = false; // (week 2's hub lesson)
  assert(g.Story.due(run, 'hub') === 'explore', 'the lesson is due');
  S.at = null;
  roam();
  eq(env.renders, 3, 'a lesson due: the full render');
  eq(roam.why, 'lesson', 'why: the lesson');
});
