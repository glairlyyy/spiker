// Hex territory (spec §4.27): the war map as flat-top hex tiles. Each tile has an owner and a takeover condition (HEX_COST);
// street battles are fought on a tile and push its pressure until it flips. The player's travel never reads tiles.
// Grid: axial (q, r), built once from CITY (pure, deterministic). Run state: run.hex = { own, p, by, t } (changed owners,
// pressure and who pushes it, last week fought). Places follow their tile: Hex.sync rebuilds run.own (the place-owner cache Front reads).
// DOM-free, no randoms.

const Hex = {
  DIRS: [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1]
  ],
  /** Centre of tile (q, r) in map units. */
  centre: (q, r) => [HEX.size * 1.5 * q, HEX.size * Math.sqrt(3) * (r + q / 2)],
  /** Steps between two tiles (ids 'q,r'). */
  dist(a, b) {
    const [q1, r1] = a.split(',').map(Number),
      [q2, r2] = b.split(',').map(Number);
    return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
  },
  /** The tile id holding map point p (nearest centre: axial rounding). */
  idAt([x, y]) {
    const q = ((2 / 3) * x) / HEX.size,
      r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / HEX.size,
      s = -q - r;
    let rq = Math.round(q),
      rr = Math.round(r);
    const rs = Math.round(s),
      dq = Math.abs(rq - q),
      dr = Math.abs(rr - r),
      ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    return `${rq},${rr}`;
  },
  /** The six corners of a tile (map units), for drawing. */
  corners: ([x, y]) =>
    Array.from({ length: 6 }, (_, i) => [x + HEX.size * Math.cos((i * Math.PI) / 3), y + HEX.size * Math.sin((i * Math.PI) / 3)]),
  /**
   * The grid (cached): { tiles: [{ id, q, r, at, region, kind, terrain, spots, hq }], byId }. A tile is land if its centre or a corner is.
   * region: the start owner (a place's or HQ's region wins over the polygon). kind: hq · academy · minor · place · land.
   * terrain: city (Wei downtown / old town) · beach (sand) · highland (near a mountain) · plain.
   */
  grid() {
    if (Hex.cache) return Hex.cache;
    const S = HEX.size,
      tiles = [],
      byId = new Map(),
      qMax = Math.ceil(CITY.w / (S * 1.5)) + 1;
    for (let q = -1; q <= qMax; q++)
      for (let r = -Math.ceil(qMax / 2) - 1; r <= Math.ceil(CITY.h / (S * Math.sqrt(3))) + 1; r++) {
        const at = Hex.centre(q, r);
        if (at[0] < -S || at[1] < -S || at[0] > CITY.w + S || at[1] > CITY.h + S) continue;
        // a tile is land if its centre or any corner is (the coast is fully tiled); its region from the centre, or a land corner
        const land = City.onLand(at) ? at : Hex.corners(at).find(p => City.onLand(p));
        if (!land) continue;
        const t = { id: `${q},${r}`, q, r, at: at.map(v => Math.round(v * 10) / 10), region: City.regionAt(land), spots: [], hq: [] };
        tiles.push(t);
        byId.set(t.id, t);
      }
    const into = p =>
        byId.get(Hex.idAt(p)) ||
        tiles.reduce((m, t) => (Math.hypot(t.at[0] - p[0], t.at[1] - p[1]) < Math.hypot(m.at[0] - p[0], m.at[1] - p[1]) ? t : m)), // a place on the water's edge → the nearest land tile
      cities = DISTRICTS.filter(d => d.id === 'wei-downtown' || d.id === 'wei-oldtown').map(d => MapModel.districtPoly(d));
    for (const [id, s] of Object.entries(SPOTS)) if (s.at && s.region) (into(s.at) || {}).spots?.push(id);
    for (const [id, v] of Object.entries(VENUES)) (into(v.at) || {}).spots?.push(`venue:${id}`);
    CITY.hq.forEach((at, i) => (into(at) || {}).hq?.push(i));
    for (const t of tiles) {
      const hqR = t.hq.length ? FACTIONS[t.hq[0]].region : null,
        spotR = t.spots.map(id => (id.startsWith('venue:') ? null : SPOTS[id].region)).find(Boolean);
      t.region = hqR || spotR || t.region;
      t.terrain =
        t.region === 'wei' && cities.some(poly => inPoly(t.at, poly))
          ? 'city'
          : MapModel.onSand(t.at)
            ? 'beach'
            : CITY.mountains.some(m => Math.hypot(m[0] - t.at[0], m[1] - t.at[1]) < S * 1.2)
              ? 'highland'
              : 'plain';
      t.kind =
        t.region === 'open' ? 'academy' : !MAJORS.includes(t.region) ? 'minor' : t.hq.length ? 'hq' : t.spots.length ? 'place' : 'land';
    }
    return (Hex.cache = { tiles, byId });
  },
  tile: id => Hex.grid().byId.get(id),
  /** The tile a place (SPOTS id) stands on. */
  ofSpot: sid => Hex.grid().tiles.find(t => t.spots.includes(sid)) || null,
  /** A border tile: in the war and touching another major's tile. */
  frontier(run, id) {
    const t = Hex.tile(id),
      own = Hex.owner(run, id);
    return !!t && Hex.takeable(t) && Hex.near(id).some(n => MAJORS.includes(Hex.owner(run, n.id)) && Hex.owner(run, n.id) !== own);
  },
  /** The tile's six neighbours that are land. */
  near: id => {
    const t = Hex.tile(id);
    return t ? Hex.DIRS.map(([dq, dr]) => Hex.tile(`${t.q + dq},${t.r + dr}`)).filter(Boolean) : [];
  },
  state: run => run.hex || (run.hex = { own: {}, p: {}, by: {}, t: {} }),
  owner: (run, id) => Hex.state(run).own[id] || Hex.tile(id).region,
  pressure: (run, id) => Hex.state(run).p[id] || 0,
  /** In the war at all: a major's tile that is not an HQ (minors, the Academy and capitals never change hands). */
  takeable: t => MAJORS.includes(t.region) && t.kind !== 'hq',
  /** Tiles of region r connected to one of its HQs through its own tiles (its supply line). */
  supply(run, r) {
    const seen = new Set(),
      todo = Hex.grid().tiles.filter(t => t.kind === 'hq' && Hex.owner(run, t.id) === r);
    for (const t of todo) seen.add(t.id);
    while (todo.length) {
      const t = todo.pop();
      for (const n of Hex.near(t.id))
        if (!seen.has(n.id) && Hex.owner(run, n.id) === r) {
          seen.add(n.id);
          todo.push(n);
        }
    }
    return seen;
  },
  /** Net wins `att` needs to take tile id (HEX_COST): kind / terrain, home terrain, retake, cut off. */
  cost(run, id, att, sup) {
    const t = Hex.tile(id),
      own = Hex.owner(run, id),
      C = HEX_COST;
    let c = t.kind === 'place' ? C.place : C[t.terrain];
    if (HEX_HOME[own] === t.terrain) c += C.home;
    if (t.region === att) c += C.retake;
    if (!(sup || Hex.supply(run, own)).has(id)) c += C.cut;
    return Math.max(C.min, c);
  },
  /**
   * Tiles `att` can attack on `def`: def's takeable tiles touching an `att` tile on att's supply line, each with its cost and
   * the attacking tile it is pushed from. Sorted cheapest first, then nearest to an att HQ, then by a hash (spec §4.27).
   */
  targets(run, att, def) {
    const supA = Hex.supply(run, att),
      supD = Hex.supply(run, def),
      hqs = Hex.grid().tiles.filter(t => t.kind === 'hq' && Hex.owner(run, t.id) === att),
      dHq = t => Math.min(...hqs.map(h => Math.hypot(h.at[0] - t.at[0], h.at[1] - t.at[1]))),
      out = [];
    for (const t of Hex.grid().tiles) {
      if (!Hex.takeable(t) || Hex.owner(run, t.id) !== def) continue;
      const from = Hex.near(t.id).find(n => supA.has(n.id));
      if (from) out.push({ id: t.id, from: from.id, cost: Hex.cost(run, t.id, att, supD), d: dHq(t) });
    }
    return out.sort((a, b) => a.cost - b.cost || a.d - b.d || hstr(a.id) - hstr(b.id));
  },
  /** The tile `att` fights `def` on next (null when it can reach none). */
  target: (run, att, def) => Hex.targets(run, att, def)[0] || null,
  /** A tile's name for the diary and cards: its place, else "{region} ground near {nearest place}". */
  name(id) {
    const t = Hex.tile(id),
      sp = t.spots.find(s => !s.startsWith('venue:'));
    if (sp) return SPOTS[sp].name;
    const near = Object.entries(SPOTS)
      .filter(([, s]) => s.at)
      .sort((a, b) => Math.hypot(a[1].at[0] - t.at[0], a[1].at[1] - t.at[1]) - Math.hypot(b[1].at[0] - t.at[0], b[1].at[1] - t.at[1]))[0];
    return `${t.terrain === 'plain' ? 'open ground' : t.terrain} near ${near ? near[1].name : 'the Academy'}`;
  },
  /** What a tile is worth (HEX_VALUE): HQ, place, else its terrain. */
  value: t => (t.kind === 'hq' ? HEX_VALUE.hq : t.kind === 'place' ? HEX_VALUE.place : HEX_VALUE[t.terrain] || 0),
  /** Value region r holds now / held at the start. */
  worth: (run, r) => Hex.grid().tiles.reduce((s, t) => s + (Hex.owner(run, t.id) === r ? Hex.value(t) : 0), 0),
  worth0: r => Hex.grid().tiles.reduce((s, t) => s + (t.region === r ? Hex.value(t) : 0), 0),
  /** Move a tile to region r (its start region → no entry) and rebuild the place-owner cache run.own. */
  flip(run, id, r) {
    const H = Hex.state(run);
    if (Hex.tile(id).region === r) delete H.own[id];
    else H.own[id] = r;
    delete H.p[id];
    delete H.by[id];
    Hex.sync(run);
  },
  /** run.own = { placeId: holder } for every place whose tile is held by someone other than the place's region. */
  sync(run) {
    const own = {};
    for (const t of Hex.grid().tiles)
      for (const id of t.spots) if (!id.startsWith('venue:') && Hex.owner(run, t.id) !== SPOTS[id].region) own[id] = Hex.owner(run, t.id);
    run.own = own;
  },
  /** Week end: a tile nobody fought over for HEX.decay weeks loses 1 pressure. */
  decay(run) {
    const H = Hex.state(run);
    for (const id of Object.keys(H.p))
      if (run.week - (H.t[id] || 0) >= HEX.decay) {
        H.p[id] -= 1;
        H.t[id] = run.week;
        if (H.p[id] <= 0) {
          delete H.p[id];
          delete H.by[id];
        }
      }
  }
};
