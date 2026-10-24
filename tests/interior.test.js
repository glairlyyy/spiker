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

test('interior: every place with a building has its interior — stations for every card order, one action each, inside, apart', () => {
  const g = load(1),
    I = g.INTERIOR,
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'In', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    F = g.MapModel.facilities(run);
  for (const id of Object.keys(g.SPOTS)) if (F[id]) assert(I[id], `${id} (${F[id].fac}) has an INTERIOR`);
  g.CITY.hq.forEach((_, i) => assert(I[`hq${i}`] && I[`hq${i}`].hall, `hq${i}: a hall`));
  const kinds = new Set();
  for (const [id, P] of Object.entries(I)) {
    kinds.add(P.kind);
    const ids = P.stations.map(s => s.id),
      S = g.SPOTS[id];
    eq(new Set(ids).size, ids.length, `${id}: station ids unique`);
    assert(P.stations.length > 0, `${id}: a station`);
    for (const s of P.stations) {
      eq(['order', 'card', 'sleep', 'act', 'buy'].filter(k => s[k]).length, 1, `${id}.${s.id}: one action`);
      if (s.sleep) eq(S && S.act, 'rest', `${id}: a bed only where you sleep`);
      if (s.buy) eq(S && S.act, 'ride', `${id}: bikes for sale only at the market`);
      if (s.act) assert(S && S.act, `${id}: its own Go`);
      const H = !s.out && P.hall,
        lot = F[id] || { w: P.w, d: P.d };
      for (const [x, z] of [s.at, ...(s.slots || [])])
        if (H) assert(Math.abs(x - H.x) < H.w / 2 && Math.abs(z - H.z) < H.d / 2, `${id}.${s.id} inside its hall`);
        else assert(Math.abs(x) < lot.w / 2 && Math.abs(z) < lot.d / 2, `${id}.${s.id} on its lot`);
      for (const t of P.stations)
        if (t !== s) assert(Math.hypot(t.at[0] - s.at[0], t.at[1] - s.at[1]) >= 2, `${id}: ${s.id} / ${t.id} apart`);
    }
    if (S)
      for (const o of g.City.orders(id))
        assert(
          P.stations.some(s => s.order === o),
          `${id}: the card's ${o} has a station`
        );
    for (const s of P.stations) if (s.order) assert(g.City.orders(id).includes(s.order), `${id}: ${s.order} is its order`);
  }
  for (const k of [
    'gym',
    'dojo',
    'shed',
    'hq',
    'home',
    'room',
    'bar',
    'arcade',
    'nook',
    'bath',
    'library',
    'study',
    'hall',
    'open',
    'arena',
    'court'
  ])
    assert(kinds.has(k), `kind ${k}`);
  assert(I.home.stations[0].sleep && I.market.stations.some(s => s.buy === 'scooter'), 'home: the bed first; the market sells');
  assert(
    I['venue:arena'].stations.every(s => s.card),
    'the arena (no day orders): its court opens the card'
  );
  // the prototype's gym keeps its hand layout
  eq(I.weiPower.stations.map(s => s.id).join(), 'bench,rack,mats,mirror,desk', 'the Strength Center as judged');
});

test("interior: the prompt's action is the place card's (an order, the bed, the market, a place's Go, else the card)", () => {
  const g = load(2),
    src = fs.readFileSync(path.join(__dirname, '../js/ui/career-map.js'), 'utf8'),
    ctx = vm.createContext({ SPOTS: g.SPOTS, City: g.City, VENUES: g.VENUES, DAY: g.DAY });
  vm.runInContext(`${src.match(/function stationAct\(st\) \{[\s\S]*?\n\}/)[0]};this.stationAct=stationAct;`, ctx);
  const seen = {};
  for (const [place, P] of Object.entries(g.INTERIOR))
    for (const s of P.stations) {
      const a = ctx.stationAct({ place, ...s }),
        k = `${a.fn}:${a.args.join(',')}`;
      if (s.order) {
        eq(k, `mapGo:${place},${s.order}`, `${place}.${s.id}: the card's button`);
        eq(g.City.orderOf(place, s.order), s.order, `${s.id}: mapGo runs that order`);
      } else if (s.sleep) eq(k, `mapGo:${place},,8`, `${place}: Sleep 8 h`);
      else if (s.buy) eq(k, `mapGo:${place},${s.buy}`, `${place}: buy the ${s.buy}`);
      else if (s.act) eq(k, `mapGo:${place}`, `${place}: its own Go`);
      else eq(k, `mapPick:${place}`, `${place}.${s.id}: the card`);
      seen[a.fn] = 1;
    }
  eq(Object.keys(seen).sort().join(), 'mapGo,mapPick', 'both kinds');
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

test('interior: shown at street level only; only the hall you are near is built (the budget); the station you stand at; fade; the cut', () => {
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
    eq(L.info().built.length, 0, 'nothing built');
    r = L.tick(0.016, { cam, you: [gx, gz], street: 1 });
    assert(r.shown && r.flip, 'street level: shown (flipped)');
    eq(L.info().built.join(), 'weiPower', 'the gym you stand in is built (the arena is far)');
    eq(r.near && r.near.id, 'bench', 'at the gym centre: the bench (the lead order)');
    eq(r.near.order, 'heavy', '… Heavy sets');
    eq(L.info().cut, 1, 'the cut is on');
    const B = cuts[cuts.length - 1][0],
      inB = (x, z) => Math.abs((x - B.cx) * B.c - (z - B.cz) * B.s) <= B.hw && Math.abs((x - B.cx) * B.s + (z - B.cz) * B.c) <= B.hd;
    assert(B && inB(gx + 1, gz - 1) && inB(gx + 6, gz + 4), 'the gym footprint inside the box');
    assert(!inB(gx + 18, gz) && !inB(gx, gz + 18), 'outside it: kept'); // (the Strength Center's hall: 24 × 16 m, T-351)
    assert(B.y1 > 7 && B.y1 < 12, 'up to its roof, not the sky');
    eq(L.info().alpha, M.CUT.min, 'you inside: the roof fades to CUT.min');
    cam.position.set(gx + 60, 10, gz + 30);
    r = L.tick(0.016, { cam, you: [gx + 60, gz], street: 1 });
    eq(L.info().built.length, 0, 'you and the camera far: dropped');
    eq(cuts[cuts.length - 1], null, '… and the landmark restored');
    eq(r.near, null, 'no station near');
    const st = L.stations().find(s => s.id === 'mats');
    r = L.tick(0.016, { cam, you: [st.p[0] + 2.4, st.p[2]], street: 1 });
    eq(r.near && r.near.id, 'mats', 'within 2.5 m of the mats');
    r = L.tick(0.016, { cam, you: [st.p[0] + 2.6, st.p[2] + 3], street: 1 });
    assert(!r.near || r.near.id !== 'mats', 'beyond 2.5 m: not the mats');
    const arena = L.stations().find(s => s.place === 'venue:arena');
    eq(L.tick(0.016, { cam, you: [arena.p[0], arena.p[2]], street: 1 }).near.id, 'court', 'the arena court');
    eq(L.info().built.join(), 'venue:arena', 'the arena bowl built, the gym dropped');
    L.tick(0.016, { cam, you: [gx, gz], street: 1 });
    L.tick(0.016, { cam, you: [gx, gz], street: 0.3 });
    eq(cuts[cuts.length - 1], null, 'off street level: the cut restored (null)');
    L.tick(0.016, { cam, you: [gx, gz], street: 1 });
    L.dispose();
    eq(cuts[cuts.length - 1], null, 'dispose restores the landmark');
  }
});

test('interior: every place built on its own — a hall per kind from the shared pieces, a few draw calls, never more than CUT.max at once', () => {
  const g = load(6),
    THREE = require('three'),
    M = mod(g),
    run = g.Run.create(g.Run.draft(), { role: 'WS', name: 'In', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 }),
    Ls = g.MapModel.landmarks(run).filter(L => g.INTERIOR[L.id]),
    scene = new THREE.Scene(),
    L = M.createInteriors(scene, () => 0),
    cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 2000);
  L.sync({ land: { landmarks: Ls, roads: [], regions: [] } });
  let most = 0,
    hall = 0;
  for (const P of Ls) {
    const s = L.stations().find(q => q.place === P.id);
    cam.position.set(s.p[0], 3, s.p[2] + 6);
    const r = L.tick(0.016, { cam, you: [s.p[0], s.p[2]], street: 1 }),
      i = L.info();
    most = Math.max(most, i.built.length);
    if (g.INTERIOR[P.id].hall && !g.INTERIOR[P.id].stations[0].out) {
      hall++;
      assert(i.built.includes(P.id), `${P.id}: its hall built when you arrive`);
      let meshes = 0;
      scene.traverse(o => o.isMesh && o.visible && meshes++);
      assert(meshes <= 6 * M.CUT.max + 2, `${P.id}: ${meshes} meshes`);
      assert(i.tris > 50 && i.tris < 40000, `${P.id}: ${i.tris} triangles`);
    }
    eq(r.near && r.near.place, P.id, `${P.id}: you stand at its first station`);
  }
  assert(most <= M.CUT.max, `at most ${M.CUT.max} built (${most})`);
  assert(hall >= 25, `halls built: ${hall}`);
  L.dispose();
  eq(scene.children.length, 0, 'dispose leaves nothing');
});

test("interior: today's people for the gym stand at its stations (deterministic, only while it is built)", () => {
  const g = load(5),
    THREE = require('three'),
    M = mod(g),
    L = M.createInteriors(new THREE.Scene(), () => 0),
    people = ['b', 'a', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => ({ id, spot: 'weiPower', at: [0, 0], act: 'hard' }));
  people.push({ id: 'z', spot: 'sand', at: [1, 1], act: 'train' });
  const m = model(g, people);
  L.sync(m);
  assert(L.people(m) === m, 'not shown: the model itself');
  L.tick(0.016, { you: [g.SPOTS.weiPower.at[0] * 0.5, g.SPOTS.weiPower.at[1] * 0.5], street: 1 }); // (built: you are in it)
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
