// The war map's geometry (spec §4.34; the tiles of §4.27): flat-top hex tiles, axial (q, r), built once from CITY (pure,
// deterministic). Tiles never change hands: each starts in one war unit (`t.unit`, WAR.units) and the units' borders are
// computed from the tile edges; who holds a tile now is War.unitAt (a destroyed unit's land goes to its destroyer).
// The player's travel never reads tiles. DOM-free, no randoms.

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
   * unit: the war unit it starts in (Hex.unitOf), null for the minors and the Academy.
   * terrain: city (Wei downtown / old town) · beach (sand) · highland (on the Peak or the Spine: reliefAt > HIGHLAND_M) · plain.
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
            : reliefAt(t.at) > HIGHLAND_M // the Peak and the Spine (spec §4.19b)
              ? 'highland'
              : 'plain';
      t.kind =
        t.region === 'open' ? 'academy' : !MAJORS.includes(t.region) ? 'minor' : t.hq.length ? 'hq' : t.spots.length ? 'place' : 'land';
    }
    const foes = r => tiles.filter(o => MAJORS.includes(o.region) && o.region !== r);
    for (const t of tiles) t.unit = Hex.unitOf(t, foes(t.region));
    return (Hex.cache = { tiles, byId });
  },
  /**
   * The war unit a tile starts in (spec §4.34): its region's only unit; Wei's rings — Gold (`inner`) at least WAR.ring steps
   * from every other major's tile, Iron outside it; else the unit whose first club's HQ is nearest (Wu: Harbor east, Fort south).
   */
  unitOf(t, foes) {
    const us = Object.keys(WAR.units).filter(u => WAR.units[u].region === t.region);
    if (us.length < 2) return us[0] || null;
    const inner = us.find(u => WAR.units[u].inner);
    if (inner) return Math.min(...foes.map(o => Hex.dist(t.id, o.id))) >= WAR.ring ? inner : WAR.units[inner].inner;
    const d = u => {
      const h = CITY.hq[WAR.units[u].clubs[0]];
      return Math.hypot(h[0] - t.at[0], h[1] - t.at[1]);
    };
    return us.reduce((a, b) => (d(b) < d(a) ? b : a));
  },
  tile: id => Hex.grid().byId.get(id),
  /** The tile a place (SPOTS id) stands on. */
  ofSpot: sid => Hex.grid().tiles.find(t => t.spots.includes(sid)) || null,
  /** A border tile: a war unit's tile touching another major's war territory (spec §4.34; War.unitAt). */
  frontier(run, id) {
    const u = War.unitAt(run, id),
      r = u && WAR.units[u].region;
    return !!r && Hex.near(id).some(n => {
      const v = War.unitAt(run, n.id);
      return !!v && WAR.units[v].region !== r;
    });
  },
  /** The tile's six neighbours that are land. */
  near: id => {
    const t = Hex.tile(id);
    return t ? Hex.DIRS.map(([dq, dr]) => Hex.tile(`${t.q + dq},${t.r + dr}`)).filter(Boolean) : [];
  },
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
};
