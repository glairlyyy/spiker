// Frame-budget jobs (js/map3d/jobs3d.mjs, Pacing A 2026-10-27) and the detail ring built across frames.
const { test, assert, eq } = require('./harness');

/** A job of n slices, each advancing the fake clock by ms; log gets id:i per slice. */
const slices = (clock, log, id, n, ms) =>
  (function* () {
    for (let i = 0; i < n; i++) {
      clock.t += ms;
      log.push(`${id}:${i}`);
      yield;
    }
  })();

test('map jobs: slices within the frame budget, the first always; priorities first, then the older; cancel and restart', () => {
  const { createJobs } = require('../js/map3d/jobs3d.mjs'),
    clock = { t: 0 },
    J = createJobs({ now: () => clock.t }),
    log = [];
  J.add('a', slices(clock, log, 'a', 10, 1), 5);
  J.run(2.5);
  eq(log.join(), 'a:0,a:1,a:2', 'slices until the budget is used (1 ms each, 2.5 ms budget: 3)');
  log.length = 0;
  J.add('big', slices(clock, log, 'big', 2, 10), 5);
  J.add('near', slices(clock, log, 'near', 2, 0.5), 1);
  J.run(2.5);
  assert(log[0] === 'near:0' && log[1] === 'near:1', `the lower priority number first (${log})`);
  eq(log[2], 'a:3', '… then the older of equal priority');
  // a slice longer than the budget: one a frame (progress at any budget), nothing else that frame
  log.length = 0;
  J.cancel('a');
  assert(!J.has('a') && J.has('big'), 'cancelled');
  J.run(2.5);
  eq(log.join(), 'big:0', 'a 10 ms slice runs alone');
  J.run(2.5);
  J.run(2.5);
  assert(!J.has('big'), 'done after its last slice');
  // the same id again replaces the running one (a new target): the old one's finally runs, the new starts at 0
  let closed = 0;
  J.add(
    'ring',
    (function* () {
      try {
        for (;;) ((clock.t += 0.3), yield);
      } finally {
        closed++;
      }
    })(),
    1
  );
  J.run(1);
  log.length = 0;
  J.add('ring', slices(clock, log, 'ring2', 3, 0.1), 1);
  eq(closed, 1, 'the old job closed');
  J.drain('ring');
  eq(log.join(), 'ring2:0,ring2:1,ring2:2', 'the new one ran to its end');
  eq(J.info().jobs.length, 0, 'nothing waits');
  eq(J.run(2.5), 0, 'an idle frame costs nothing');
});

test('map jobs: the detail ring built across frames ends identical to the full build, the old ring shown until then', () => {
  const THREE = require('three'),
    { load } = require('./harness'),
    g = load(5),
    m = g.MapModel.build(g.Run.create(g.Run.draft(), { role: 'WS', name: 'Kit' }), null),
    { createTown, RING } = require('../js/map3d/town3d.mjs'),
    { createJobs } = require('../js/map3d/jobs3d.mjs'),
    flat = () => 1,
    g0 = m.land.landmarks.find(l => l.id === 'weiPower').at,
    cx = g0[0] * 0.5,
    cz = g0[1] * 0.5;
  // a digest per array: its length and an order-weighted sum of its values (exact equality would read the same, slower)
  const dig = a => {
    let h = 0;
    for (let i = 0; i < a.length; i++) h = (h * 31 + a[i] * 1000) % 1e12;
    return `${a.length}:${h.toFixed(3)}`;
  };
  const ringOf = sc => {
    const out = {};
    sc.traverse(o => {
      if (!o.userData.ring || !o.visible) return;
      const n = Math.min(o.geometry.drawRange.count, o.geometry.attributes.position.count); // (pooled buffers: the drawn part)
      out[o.userData.ring] = Object.fromEntries(
        Object.entries(o.geometry.attributes).map(([k, a]) => [k, dig(a.array.subarray(0, n * a.itemSize))])
      );
    });
    return out;
  };
  const baseOf = sc => {
    const out = [];
    sc.traverse(o => o.isMesh && o.userData.town && out.push(dig(o.geometry.attributes.position.array)));
    return out;
  };
  // across frames (vs the full build at once below)
  const clock = { t: 0 },
    J = createJobs({ now: () => (clock.t += 0.01) }),
    B = new THREE.Scene(),
    tB = createTown(B, flat, { fast: () => false, jobs: J });
  tB.sync(m);
  tB.ring(cx, cz, 1, true);
  assert(tB.ringInfo().pending && tB.ringInfo().builds === 0, 'the ring builds later, not in this call');
  let frames = 0;
  while (J.has('ring') && frames < 1e5) (J.run(0.05), frames++, tB.ring(cx, cz, 1, true));
  eq(tB.ringInfo().builds, 1, 'built once');
  assert(frames > 10, `over many frames (${frames})`);
  const first = JSON.stringify(ringOf(B)),
    objs = [];
  B.traverse(o => o.userData.ring && objs.push(o));
  // a step away: the old ring stays drawn while the new one builds
  tB.ring(cx + RING.step + 5, cz, 1, true);
  J.run(0.05);
  eq(JSON.stringify(ringOf(B)), first, 'the old ring still shown mid-build');
  // the camera moves on again before it is done: the job restarts on the new target (no stale ring)
  const c0 = J.info().cancels;
  tB.ring(cx + 2 * RING.step + 10, cz, 1, true);
  eq(J.info().cancels, c0 + 1, 'a step past the job’s target: restarted');
  tB.ring(cx + 2 * RING.step + 20, cz, 1, true);
  eq(J.info().cancels, c0 + 1, 'within a step of the job’s target: no restart');
  while (J.has('ring')) (J.run(0.05), tB.ring(cx + 2 * RING.step + 20, cz, 1, true));
  // compare with the other town built in one go round the restarted target
  const C = new THREE.Scene(),
    tC = createTown(C, flat, { fast: () => false });
  tC.sync(m);
  tC.ring(cx + 2 * RING.step + 10, cz, 1, true);
  eq(JSON.stringify(ringOf(B)), JSON.stringify(ringOf(C)), 'the ring across frames = the full build (every attribute)');
  eq(JSON.stringify(baseOf(B)), JSON.stringify(baseOf(C)), 'the map look collapsed the same lots');
  {
    const now = [];
    B.traverse(o => o.userData.ring && now.push(o));
    assert(now.length === objs.length && now.every((o, i) => o === objs[i]), 'the same pooled ring objects after rebuilds (no new meshes)');
  }
  assert(Object.keys(ringOf(C)).length >= 4, 'the reference has the ring parts');
  // hidden while building: the job stops
  tB.ring(cx + 4 * RING.step, cz, 1, true);
  assert(J.has('ring'), 'a new build waits');
  tB.ring(cx + 4 * RING.step, cz, 0, true);
  assert(!J.has('ring') && !tB.ringInfo().on, 'off at the map: the build cancelled');
});
