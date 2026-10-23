// Street-level interiors (spec §4.37 6, T-336b): INTERIOR stations, the prompt's action = the place card's, the cutaway.
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const { load, test, assert, eq } = require('./harness');

/** The interiors module with the game's INTERIOR (the module reads it as a global, like the browser's classic scripts). */
function mod(g) {
  globalThis.INTERIOR = g.INTERIOR;
  globalThis.INTERIOR_NEAR = g.INTERIOR_NEAR;
  return require('../js/map3d/interior3d.mjs');
}
/** A model with the two places' landmarks (no roads: the door faces +z), flat ground. */
const model = (g, people = []) => ({
  land: {
    landmarks: [
      { id: 'weiPower', at: g.SPOTS.weiPower.at, kind: 'gym', region: 'wei' },
      { id: 'venue:arena', at: g.VENUES.arena.at, kind: 'arena', region: 'wei' }
    ],
    roads: [],
    regions: []
  },
  life: { people }
});

test('interior: stations per place — every order of the place card has a station, all inside the footprint', () => {
  const g = load(1),
    I = g.INTERIOR;
  eq(Object.keys(I).sort().join(','), 'venue:arena,weiPower', 'the gym and the arena only');
  for (const [id, P] of Object.entries(I)) {
    const ids = P.stations.map(s => s.id);
    eq(new Set(ids).size, ids.length, `${id}: station ids unique`);
    for (const s of P.stations) {
      assert(!!s.order !== !!s.card, `${id}.${s.id}: an order or the card`);
      for (const [x, z] of [s.at, ...(s.slots || [])]) assert(Math.abs(x) < P.w / 2 && Math.abs(z) < P.d / 2, `${id}.${s.id} inside`);
    }
  }
  const orders = g.City.orders('weiPower');
  for (const s of I.weiPower.stations) if (s.order) assert(orders.includes(s.order), `${s.order} is a weiPower order`);
  for (const o of orders)
    assert(
      I.weiPower.stations.some(s => s.order === o),
      `the card's ${o} has a station`
    );
  assert(
    I['venue:arena'].stations.every(s => s.card),
    'the arena (no day orders): its court opens the card'
  );
});

test("interior: the prompt's action is the place card's (mapGo(place, order) → the same order; the desk / court → the card)", () => {
  const g = load(2),
    src = fs.readFileSync(path.join(__dirname, '../js/ui/career-map.js'), 'utf8'),
    ctx = vm.createContext({ SPOTS: g.SPOTS, City: g.City, VENUES: g.VENUES });
  vm.runInContext(`${src.match(/function stationAct\(st\) \{[\s\S]*?\n\}/)[0]};this.stationAct=stationAct;`, ctx);
  for (const [place, P] of Object.entries(g.INTERIOR))
    for (const s of P.stations) {
      const a = ctx.stationAct({ place, order: s.order || null, card: !!s.card });
      if (s.order) {
        eq(`${a.fn}:${a.args.join(',')}`, `mapGo:${place},${s.order}`, `${s.id}: the card's button`);
        eq(g.City.orderOf(place, s.order), s.order, `${s.id}: mapGo runs that order`);
      } else eq(`${a.fn}:${a.args.join(',')}`, `mapPick:${place}`, `${s.id}: the card`);
    }
  eq(ctx.stationAct(null), null, 'no station, no action');
});

test('interior: cutaway opacity by distance (min inside, 1 from CUT.near, never down as you leave)', () => {
  const g = load(3),
    { cutAlpha, CUT } = mod(g);
  eq(cutAlpha(0), CUT.min, 'inside');
  eq(cutAlpha(-1), CUT.min, 'clamped');
  eq(cutAlpha(CUT.near), 1, 'at the reach');
  eq(cutAlpha(CUT.near * 3), 1, 'far');
  let prev = 0;
  for (let d = 0; d <= CUT.near; d += 0.25) {
    const a = cutAlpha(d);
    assert(a >= prev, `monotonic at ${d}`);
    prev = a;
  }
});

test('interior: shown at street level only; the station you stand at; the roof and near walls fade; the gym landmark is cut (town.cut)', () => {
  const g = load(4),
    THREE = require('three'),
    M = mod(g),
    scene = new THREE.Scene(),
    gx = g.SPOTS.weiPower.at[0] * 0.5,
    gz = g.SPOTS.weiPower.at[1] * 0.5,
    cuts = [];
  {
    const L = M.createInteriors(scene, () => 0, { cut: b => cuts.push(b) }),
      cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 2000);
    L.sync(model(g));
    eq(L.info().places.join(','), 'weiPower,venue:arena', 'both places');
    eq(cuts.length, 0, 'not shown: no cut asked for');
    cam.position.set(gx, 40, gz + 30);
    let r = L.tick(0.016, { cam, you: [gx, gz], street: 0.3 });
    assert(!r.shown && !r.near, 'not at street level: nothing');
    eq(L.info().cut, 0, 'no cut');
    r = L.tick(0.016, { cam, you: [gx, gz], street: 1 });
    assert(r.shown && r.flip, 'street level: shown (flipped)');
    eq(r.near && r.near.id, 'bench', 'at the gym centre: the bench (the lead order)');
    eq(r.near.order, 'heavy', '… Heavy sets');
    eq(L.info().cut, 1, 'the cut is on');
    const B = cuts[cuts.length - 1],
      inB = (x, z) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
    assert(B && inB(gx + 1, gz - 1) && inB(gx + 6, gz + 4), 'the gym footprint inside the box');
    assert(!inB(gx + 18, gz) && !inB(gx, gz + 18), 'outside it: kept'); // (the Strength Center's hall: 24 × 16 m, T-351)
    eq(L.info().alpha, M.CUT.min, 'you inside: the roof fades to CUT.min');
    r = L.tick(0.016, { cam, you: [gx + 60, gz], street: 1 });
    cam.position.set(gx + 60, 10, gz + 30);
    r = L.tick(0.016, { cam, you: [gx + 60, gz], street: 1 });
    eq(L.info().alpha, 1, 'you and the camera far: opaque');
    eq(r.near, null, 'no station near');
    const st = L.stations().find(s => s.id === 'mats');
    r = L.tick(0.016, { cam, you: [st.p[0] + 2.4, st.p[2]], street: 1 });
    eq(r.near && r.near.id, 'mats', 'within 2.5 m of the mats');
    r = L.tick(0.016, { cam, you: [st.p[0] + 2.6, st.p[2] + 3], street: 1 });
    assert(!r.near || r.near.id !== 'mats', 'beyond 2.5 m: not the mats');
    const arena = L.stations().find(s => s.place === 'venue:arena');
    eq(L.tick(0.016, { cam, you: [arena.p[0], arena.p[2]], street: 1 }).near.id, 'court', 'the arena court');
    L.tick(0.016, { cam, you: [gx, gz], street: 0.3 });
    eq(cuts[cuts.length - 1], null, 'off street level: the cut restored (null)');
    L.tick(0.016, { cam, you: [gx, gz], street: 1 });
    L.dispose();
    eq(cuts[cuts.length - 1], null, 'dispose restores the landmark');
  }
});

test("interior: today's people for the gym stand at its stations (deterministic, only while shown)", () => {
  const g = load(5),
    THREE = require('three'),
    M = mod(g),
    L = M.createInteriors(new THREE.Scene(), () => 0),
    people = ['b', 'a', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => ({ id, spot: 'weiPower', at: [0, 0], act: 'hard' }));
  people.push({ id: 'z', spot: 'sand', at: [1, 1], act: 'train' });
  const m = model(g, people);
  L.sync(m);
  assert(L.people(m) === m, 'not shown: the model itself');
  L.tick(0.016, { you: [0, 0], street: 1 });
  const a = L.people(m),
    b = L.people(m);
  eq(JSON.stringify(a.life.people), JSON.stringify(b.life.people), 'the same twice');
  const F = M.frameOf(m.land.landmarks[0], [], () => 0, g.INTERIOR.weiPower),
    moved = a.life.people.filter(p => p.spot === 'weiPower');
  eq(moved.length, 8, 'all eight');
  for (const p of moved) {
    eq(p.act, 'train', `${p.id} training`);
    eq(M.boxDist(F, p.at[0] * 0.5, p.at[1] * 0.5), 0, `${p.id} inside the gym`);
  }
  const slot0 = g.INTERIOR.weiPower.stations.flatMap(s => s.slots)[0],
    [x0, z0] = M.toW(F, slot0[0], slot0[1]),
    pa = moved.find(p => p.id === 'a');
  assert(Math.hypot(pa.at[0] * 0.5 - x0, pa.at[1] * 0.5 - z0) < 0.05, 'the first by id at the first slot');
  eq(JSON.stringify(a.life.people.find(p => p.id === 'z')), JSON.stringify(people.find(p => p.id === 'z')), 'others untouched');
  L.dispose();
});
