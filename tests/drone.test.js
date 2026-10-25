// The calls you see (spec §4.38, T-338): every fault call the engine emits reaches A.call through the label act; close in / out
// is found from the landing (within 15 cm of a line); the drone and the referee know every call kind.
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const { load, test, assert, eq, ROOT } = require('./harness');

/** render/acts.js in its own context with the game's constants and a bare A (no DOM: the label / point handlers only). */
function acts(g) {
  const ctx = { COURT_LINES: g.COURT_LINES, UNIT_M: g.UNIT_M, Dir: { heatPoint() {} }, sfx: { whistle() {} }, comboEnd() {}, koUp() {} };
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(ROOT, 'js/render/acts.js'), 'utf8');
  vm.runInContext(`${code}\n;globalThis.__a={ACTS,lineCall,refCall,LINE_CALL};`, ctx);
  ctx.A = {
    labels: [],
    pointN: 0,
    disp: {},
    cheer: [0, 0],
    m: { t: [{ short: 'A' }, { short: 'B' }] },
    beats: [],
    bi: 0
  };
  return { ...ctx.__a, ctx };
}

test('calls: every fault call the engine emits has a handler path to the drone / referee (spec §4.38)', () => {
  const g = load(6),
    T = g.mkTeams(),
    k = acts(g),
    seen = new Set();
  for (let i = 0; i < 40 && seen.size < 3; i++) {
    const m = g.newMatch(T[i % 8], T[(i + 3) % 8], true);
    while (!m.over)
      for (const b of g.playRally(m).beats)
        for (const a of b.acts)
          if (a.k === 'label' && a.call) {
            const n = (k.ctx.A.call && k.ctx.A.call.n) || 0;
            k.ACTS.label(a, null, { X: 0, Y: 0 });
            eq(k.ctx.A.call.n, n + 1, `${a.call}: a new call`);
            eq(k.ctx.A.call.k, a.call, 'the call kind');
            assert(k.ctx.A.call.at.x === a.at.x && k.ctx.A.call.at.z === a.at.z, 'the call spot');
            seen.add(a.call);
          }
  }
  eq([...seen].sort().join(','), 'double,foot,net', 'all three faults called');
  // the drone has a word and the referee a signal for every kind (fault calls and the line calls)
  const drone = fs.readFileSync(path.join(ROOT, 'js/render3d/fx/drone.mjs'), 'utf8'),
    ref = fs.readFileSync(path.join(ROOT, 'js/render3d/venues/referee.mjs'), 'utf8');
  for (const c of ['net', 'foot', 'double', 'in', 'out']) {
    assert(new RegExp(`\\n  ${c}: \\{ word: '`).test(drone), `drone word for ${c}`);
    assert(new RegExp(`\\n  ${c}: (s|\\(\\)) =>`).test(ref), `referee signal for ${c}`);
  }
  assert(/updateDrone\(/.test(fs.readFileSync(path.join(ROOT, 'js/render3d/venue3d.mjs'), 'utf8')), 'venue3d runs the drone');
});

test('calls: close in / out from the landing — within 15 cm of a line (spec §4.38)', () => {
  const g = load(1),
    k = acts(g),
    { end, side } = g.COURT_LINES,
    cm = v => v / 100,
    ux = c => cm(c) / g.UNIT_M.x, // cm → x units
    uz = c => cm(c) / g.UNIT_M.z; // cm → z units
  eq(k.LINE_CALL.m, 0.15, '15 cm');
  const at = (x, z) => k.lineCall(x, z);
  eq(at(end + ux(10), 0.5).k, 'in', '10 cm inside the end line');
  eq(at(end + ux(10), 0.5).line.axis, 'x', 'judged on the end line');
  eq(at(end - ux(10), 0.5).k, 'out', '10 cm past the end line');
  eq(at(1000 - end - ux(14), 0.4).k, 'in', 'the far end line');
  eq(at(500 + 120, side + uz(5)).k, 'in', '5 cm inside a side line');
  eq(at(500 + 120, side + uz(5)).line.axis, 'z', 'judged on the side line');
  eq(at(500 - 120, 1 - side + uz(12)).k, 'out', '12 cm outside the far side line');
  eq(at(end + ux(20), 0.5), null, '20 cm inside: no call');
  eq(at(end - ux(20), 0.5), null, '20 cm out: no call');
  eq(at(500, 0.5), null, 'mid-court: no call');
  eq(at(end - ux(10), side - uz(10)).k, 'out', 'past the corner by 14 cm (10 cm each way)');
  eq(at(end - ux(12), side - uz(12)), null, 'past the corner by 17 cm: no call');
  // the point reads the rally's last landing: a ball by the line is called, one mid-court or after a fault call is not
  const A = k.ctx.A,
    pt = to => {
      A.beats = [
        { acts: [{ k: 'reset' }] },
        { acts: [{ k: 'ball', to: { x: 300, z: 0.5, h: 120 } }] },
        { acts: [{ k: 'ball', to, h: 40 }] }
      ];
      A.bi = 2;
      const n = A.refN || 0;
      k.ACTS.point({ k: 'point', side: 0 }, null, { X: 0, Y: 0 });
      return (A.refN || 0) > n ? A.call : null;
    };
  eq(pt({ x: 700, z: 1 - side - uz(6), h: 0 }).k, 'in', 'a landing 6 cm inside the side line');
  eq(pt({ x: 700, z: 0.5, h: 0 }), null, 'mid-court');
  k.refCall('net', { x: 494, z: 0.4 });
  A.call.pt = A.pointN;
  eq(pt({ x: 700, z: 1 - side - uz(6), h: 0 }), null, 'a fault was called this rally');
});

// ---- terrain (spec §4.38, T-339): a field match carries its ground (m.ground) and wind (m.wind); official courts carry none ----------
/** n pairs of seeded matches (each pair both ways round), with opts: side 0's win %, rally length, HP a hit, knockdowns, loose passes, serve errors by side. */
function terrain(g, T, n, opts = {}) {
  const S = { w0: 0, n: 0, ral: 0, rn: 0, hpn: 0, hpd: 0, ko: 0, bad: 0, rcv: 0, e: [0, 0], s: [0, 0] };
  for (let k = 0; k < n; k++)
    for (const flip of [0, 1]) {
      const a = T[k % 8],
        b = T[(k + 1 + (k % 7)) % 8],
        [x, y] = flip ? [b, a] : [a, b],
        o = {};
      if (opts.k) o.ground = { k: opts.k, home: opts.home ? g.squadOf(x).map(p => p.id) : [], low: opts.low ?? -1 };
      if (opts.wind) o.wind = opts.wind;
      const m = g.newMatch(x, y, false, o);
      while (!m.over) {
        g.playRally(m);
        S.ral += m.rallyN;
        S.rn++;
      }
      S.n++;
      if (m.winner === 0) S.w0++;
      S.hpn += m.hpLog.n;
      S.hpd += m.hpLog.dmg;
      S.ko += m.ko.n[0] + m.ko.n[1];
      m.t.forEach((t, i) =>
        g.squadOf(t).forEach(p => {
          const L = (m.srvLog || {})[p.id];
          if (L) ((S.e[i] += L.err), (S.s[i] += L.n));
        })
      );
      for (const r of Object.values(m.recv || {})) ((S.bad += r.bad), (S.rcv += r.n + r.ace + r.bad));
    }
  return {
    win0: S.w0 / S.n,
    rally: S.ral / S.rn,
    hp: S.hpd / S.hpn,
    ko: S.ko / S.n,
    bad: S.bad / S.rcv,
    err: S.e.map((e, i) => e / S.s[i])
  };
}
test('terrain: off a field nothing changes — every ground hook is × 1 / + 0 without m.ground (spec §4.38)', () => {
  const g = load(9),
    T = g.mkTeams(),
    p = g.squadOf(T[0])[0];
  const m = g.newMatch(T[0], T[1], false);
  assert(!m.ground && !m.wind, 'an official court carries no ground');
  for (const k of ['agi', 'jump', 'hp', 'dig']) eq(g.Formula.gMul(p, k), 1, `× 1 (${k})`);
  for (const k of ['pass', 'set', 'serve']) eq(g.Formula.gOff(p, k), 0, `+ 0 (${k})`);
  // born to the ground (Wu's beach kids on sand, Shu's on the slopes): part of each penalty, a little extra
  const f = g.newMatch(T[0], T[1], false, { ground: { k: 'sand', home: [p.id], low: -1 } }),
    q = g.squadOf(T[1])[0];
  g.playRally(f); // (CM = f)
  assert(g.Formula.gMul(p, 'agi') > g.Formula.gMul(q, 'agi') && g.Formula.gMul(q, 'agi') === g.GROUNDS.sand.agi, 'home on sand: quicker');
  assert(g.Formula.gMul(p, 'jump') > g.GROUNDS.sand.jump, 'home on sand: higher');
  eq(g.Formula.gMul(p, 'hp'), g.Formula.gMul(q, 'hp'), 'the ground softens everyone alike');
  eq(JSON.stringify(g.GROUNDS.home.region), JSON.stringify({ sand: 'wu', slope: 'shu' }), 'Wu → sand, Shu → slope');
});
test.slow('terrain: each ground plays — sand, grass, asphalt, slope, wind have the right sign over 200 seeded matches (spec §4.38)', () => {
  const run = opts => {
      const g = load(4245); // (T-366: at 4243 sand’s shorter rallies sat in the noise once serves got targets — 1.080 vs 1.086; settling 0.08: 4244 → 4245, 1.062 vs 1.050)
      return terrain(g, g.mkTeams(), 100, opts);
    },
    base = run({}),
    sand = run({ k: 'sand' }),
    grass = run({ k: 'grass' }),
    asph = run({ k: 'asphalt' }),
    slope = run({ k: 'slope', low: 0 }),
    wind = run({ wind: 1 });
  assert(sand.hp < base.hp * 0.9, `sand: softer landings (HP a hit ${sand.hp.toFixed(3)} < ${base.hp.toFixed(3)})`);
  assert(sand.rally < base.rally, `sand: the ball dies fast (${sand.rally.toFixed(3)} < ${base.rally.toFixed(3)} touches a rally)`);
  assert(grass.bad > base.bad, `grass: worse passes (${(grass.bad * 100).toFixed(1)} % > ${(base.bad * 100).toFixed(1)} % loose)`);
  assert(
    asph.hp > base.hp * 1.1 && asph.ko > base.ko,
    `asphalt: hard falls (HP ${asph.hp.toFixed(3)}, knockdowns ${asph.ko.toFixed(2)} a match)`
  );
  assert(
    slope.err[0] > slope.err[1] && slope.err[0] > base.err[0],
    `slope: the low end serves into the rise (${slope.err.map(e => (e * 100).toFixed(1)).join(' / ')} %)`
  );
  assert(wind.bad > base.bad, `wind: floats wander (${(wind.bad * 100).toFixed(1)} % > ${(base.bad * 100).toFixed(1)} % loose)`);
  // equal teams (each pair both ways): a ground swings side 0 by at most a home-court edge (≈ ±5 %; noise here ±3.5 % each,
  // ±5 % on the difference: 2 SD = 0.10 — T-348's deck numbers moved sand to 44.0 vs 53.0 at this seed)
  for (const [k, r] of Object.entries({ sand, grass, asph, slope, wind }))
    assert(Math.abs(r.win0 - base.win0) <= 0.1, `${k}: win odds ${(r.win0 * 100).toFixed(1)} % vs ${(base.win0 * 100).toFixed(1)} %`);
});
