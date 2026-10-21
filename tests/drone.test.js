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
    coaches: [{}, {}],
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
