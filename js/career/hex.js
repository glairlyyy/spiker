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
    return (
      !!r &&
      Hex.near(id).some(n => {
        const v = War.unitAt(run, n.id);
        return !!v && WAR.units[v].region !== r;
      })
    );
  },
  /** The tile's six neighbours that are land. */
  near: id => {
    const t = Hex.tile(id);
    return t ? Hex.DIRS.map(([dq, dr]) => Hex.tile(`${t.q + dq},${t.r + dr}`)).filter(Boolean) : [];
  },
  /** The tile across edge i of tile t (edge i joins corners i and i + 1), or null (water / off the grid). */
  across(t, i) {
    const a = ((i + 0.5) * Math.PI) / 3,
      d = HEX.size * Math.sqrt(3);
    return Hex.tile(Hex.idAt([t.at[0] + d * Math.cos(a), t.at[1] + d * Math.sin(a)])) || null;
  },
  /**
   * The outline of a set of tiles (ids, a Set): closed loops of corner points [[x, y]…], longest first. Every boundary edge
   * (to a tile outside the set, or to no tile) is walked corner to corner; a tile's edges run the same way round, so the
   * loops close.
   */
  outline(ids) {
    const key = p => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`,
      next = new Map();
    for (const id of ids) {
      const t = Hex.tile(id),
        C = Hex.corners(Hex.centre(t.q, t.r)); // (the exact centre: neighbours' corners meet)
      for (let i = 0; i < 6; i++) {
        const n = Hex.across(t, i);
        if (n && ids.has(n.id)) continue;
        const a = C[i],
          b = C[(i + 1) % 6],
          k = key(a);
        if (!next.has(k)) next.set(k, []);
        next.get(k).push([a, b]);
      }
    }
    const loops = [];
    for (const [k0, list] of next)
      while (list.length) {
        const loop = [];
        let [a, b] = list.pop(),
          guard = 0;
        loop.push(a);
        while (key(b) !== k0 && guard++ < 4000) {
          loop.push(b);
          const L = next.get(key(b));
          if (!L || !L.length) break;
          [, b] = L.pop();
        }
        if (loop.length > 2) loops.push(loop.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]));
      }
    const len = L => L.reduce((s, p, i) => s + Math.hypot(p[0] - L[(i + 1) % L.length][0], p[1] - L[(i + 1) % L.length][1]), 0);
    return loops.sort((x, y) => len(y) - len(x));
  },
  /**
   * Straighten a polyline (owner, 2026-10-21: borders not curvy): Ramer–Douglas–Peucker — drop every corner within `tol` map units
   * of the straight line through its neighbours, so the hex zigzag becomes a few long straight runs. closed = a loop.
   */
  straight(pts, tol = HEX.size * 0.9, closed = true) {
    if (pts.length < 3) return pts.slice();
    const off = (p, a, b) => {
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          L = Math.hypot(dx, dy) || 1;
        return Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / L;
      },
      rdp = P => {
        let k = -1,
          d = 0;
        for (let i = 1; i < P.length - 1; i++) {
          const e = off(P[i], P[0], P[P.length - 1]);
          if (e > d) [d, k] = [e, i];
        }
        return d > tol
          ? rdp(P.slice(0, k + 1))
              .slice(0, -1)
              .concat(rdp(P.slice(k)))
          : [P[0], P[P.length - 1]];
      };
    if (!closed) return rdp(pts);
    // a loop: split at the point farthest from the first, straighten both halves
    let far = 1;
    for (let i = 1; i < pts.length; i++)
      if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i;
    const A = rdp(pts.slice(0, far + 1)),
      B = rdp(pts.slice(far).concat([pts[0]]));
    return A.slice(0, -1).concat(B.slice(0, -1));
  },
  /** Points every ≤ `step` map units along a polyline (its corners kept): a straight run still drapes over the terrain and spaces banners. */
  dense(pts, step = HEX.size / 4, closed = true) {
    const out = [],
      n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i],
        b = pts[(i + 1) % pts.length],
        k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    }
    if (!closed && pts.length) out.push(pts[pts.length - 1].slice());
    return out;
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
  }
};
