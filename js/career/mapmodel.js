// The island map as plain data: what a renderer draws, with no drawing in it (DOM-free, tested headless).
// MapModel.build(run, sel) → { w, h, land, borders, pins, you, fog, flag, focus, sel, life }. Map units: CITY.w × CITY.h,
// y down. A renderer (MapView: js/ui/map-view.js → js/map3d/map3d.mjs) draws a model and reports two things
// back: a pin picked (its id) and a map point clicked ([x, y] in map units). All game rules stay in City / Front.

const MapModel = {
  /** What you know of: explored places, your home, your club's HQ, this week's battle. */
  known: (run, id, p) =>
    !(SPOTS[id] && SPOTS[id].secret && !Secret.known(run, id)) &&
    (id === 'home' || id === `hq${run.team}` || id === 'clash' || City.seen(run, p)),
  /** A picked map point, as the selection id 'pt:x,y' ↔ [x, y]. */
  /**
   * Nature on the island (spec §4.19c, NATURE): trees, rocks, bushes and grass as plain data — [{ k, at, s (size ×), r (yaw), c
   * (shade) }]. A jittered grid (string hashes, no randoms); each point's biome (region, sand, ground kind, Shu's height and
   * villages) decides the chance and the kind. Never on roads, lots, places, venues, level pads, the airport or water / fields.
   * Cached with the lots (they move with your home).
   */
  nature(run) {
    const lots = MapModel.lots(run);
    if (MapModel.natCache && MapModel.natCache.lots === lots) return MapModel.natCache.items;
    const N = NATURE,
      C = N.cell,
      BK = 40, // bucket size (map units) for the keep-out tests
      buckets = new Map(),
      put = (p, rad, kind) => {
        const x0 = Math.floor((p[0] - rad) / BK),
          x1 = Math.floor((p[0] + rad) / BK),
          y0 = Math.floor((p[1] - rad) / BK),
          y1 = Math.floor((p[1] + rad) / BK);
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++) {
            const k = `${x},${y}`;
            if (!buckets.has(k)) buckets.set(k, []);
            buckets.get(k).push(kind);
          }
      },
      RN = ROADS.nodes;
    for (const l of lots) put(l.at, l.size * 0.75 + 3, { c: l.at, r: l.size * 0.75 + 3 });
    for (const m of MapModel.landmarks(run)) {
      const r = m.w ? Math.hypot(m.w, m.d) / 2 / MAP_UNIT_M + 4 : 30; // a facility's lot (spec §4.40), else ~a landmark
      put(m.at, r, { c: m.at, r });
    }
    for (const v of Object.values(VENUES)) put(v.at, v.clear + 10, { c: v.at, r: v.clear + 10 });
    for (const q of MapModel.pads()) put(q.at, q.r + 4, { c: q.at, r: q.r + 4 });
    for (const [a, b, kind] of ROADS.edges) {
      const A = RN[a],
        B = RN[b],
        w = kind === 'main' || kind === 'overpass' ? 9 : kind === 'path' ? 4 : 7,
        L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      for (let s = 0; s <= L; s += BK / 2) put([A[0] + ((B[0] - A[0]) * s) / L, A[1] + ((B[1] - A[1]) * s) / L], w, { a: A, b: B, r: w });
    }
    const blocked = p =>
        (buckets.get(`${Math.floor(p[0] / BK)},${Math.floor(p[1] / BK)}`) || []).some(o => {
          if (o.c) return Math.hypot(p[0] - o.c[0], p[1] - o.c[1]) < o.r + 0.5; // (+ the rounding of the saved point)
          const dx = o.b[0] - o.a[0],
            dy = o.b[1] - o.a[1],
            t = clamp(((p[0] - o.a[0]) * dx + (p[1] - o.a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
          return Math.hypot(p[0] - o.a[0] - t * dx, p[1] - o.a[1] - t * dy) < o.r;
        }) || MapModel.inAirport(p),
      groundAt = p =>
        GROUND.find(q => {
          const d = Math.hypot(p[0] - q.poly.x, p[1] - q.poly.y);
          return d <= q.poly.r && !(q.poly.r0 && d < q.poly.r0);
        }),
      village = DISTRICTS.filter(d => d.region === 'shu' && d.poly && d.poly.r),
      biome = p => {
        const g = groundAt(p);
        if (g) return g.kind === 'park' ? N.park : g.kind === 'terrace' ? N.tea : g.kind === 'quarry' ? N.quarry : null;
        const reg = City.regionAt(p);
        if (reg === 'shu') {
          if (village.some(d => Math.hypot(p[0] - d.poly.x, p[1] - d.poly.y) < d.poly.r * 1.15)) return N.village;
          return reliefAt(p) > N.treeline ? N.scree : N.shu;
        }
        if (reg === 'wu') return MapModel.onSand(p) ? N.sand : N.wu;
        return N[reg] || null; // wei, open (the minors: none)
      },
      pick = (kinds, u) => {
        const tot = kinds.reduce((a, k) => a + k[1], 0);
        let x = u * tot;
        for (const [k, w] of kinds) if ((x -= w) < 0) return k;
        return kinds[kinds.length - 1][0];
      },
      out = [],
      add = (k, p, id) =>
        out.push({
          k,
          at: [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10],
          s: Math.round((0.75 + 0.6 * hstr(`${id}|s`)) * 100) / 100,
          r: Math.round(hstr(`${id}|r`) * 628) / 100,
          c: Math.round((0.86 + 0.28 * hstr(`${id}|c`)) * 100) / 100
        });
    for (let y = C / 2; y < CITY.h; y += C)
      for (let x = C / 2; x < CITY.w; x += C) {
        const id = `n${x}|${y}`,
          p = [x + (hstr(`${id}|x`) - 0.5) * C * 0.8, y + (hstr(`${id}|y`) - 0.5) * C * 0.8];
        if (!City.onLand(p)) continue;
        const B = biome(p);
        if (!B || hstr(`${id}|p`) >= B.p || blocked(p)) continue;
        add(pick(B.kinds, hstr(`${id}|k`)), p, id);
      }
    // street trees along Wei's main roads
    for (const [a, b, kind, gen] of ROADS.edges) {
      if (kind !== 'main' || gen) continue; // (a 'via' chain retraces a main road: its trees stand once)
      const A = RN[a],
        B = RN[b],
        L = Math.hypot(B[0] - A[0], B[1] - A[1]),
        nx = -(B[1] - A[1]) / L,
        ny = (B[0] - A[0]) / L;
      for (let s = N.street.every / 2; s < L; s += N.street.every)
        for (const side of [-1, 1]) {
          const p = [A[0] + ((B[0] - A[0]) * s) / L + nx * N.street.off * side, A[1] + ((B[1] - A[1]) * s) / L + ny * N.street.off * side],
            id = `st${a}|${b}|${s}|${side}`;
          if (City.regionAt(p) !== 'wei' || groundAt(p)) continue;
          const lot = (buckets.get(`${Math.floor(p[0] / BK)},${Math.floor(p[1] / BK)}`) || []).some(
            o => o.c && Math.hypot(p[0] - o.c[0], p[1] - o.c[1]) < o.r
          );
          if (!lot && !MapModel.inAirport(p)) add(N.street.kind, p, id);
        }
    }
    // border rows (spec §4.19d, T-224; BORDERS kinds, NATURE.rows spacing): a tree line on the Shu side of the Shu–Wei line, reeds
    // along both river banks, dune grass on the inland side of the dune line, a hedge round the Academy, fence and scrap round the
    // Outlaws' patch. Same keep-outs as the scatter; a fence panel turns along its line (r).
    const RW = N.rows,
      walk = (pts, step, f) => {
        for (let i = 0; i + 1 < pts.length; i++) {
          const A = pts[i],
            B = pts[i + 1],
            L = Math.hypot(B[0] - A[0], B[1] - A[1]);
          for (let s = step / 2; s < L; s += step)
            f(
              [A[0] + ((B[0] - A[0]) * s) / L, A[1] + ((B[1] - A[1]) * s) / L],
              (B[0] - A[0]) / L,
              (B[1] - A[1]) / L,
              `${i}|${Math.round(s)}`
            );
        }
      },
      ring = (e, n) =>
        Array.from({ length: n + 1 }, (_, i) => {
          const t = (i / n) * Math.PI * 2,
            a = ((e.rot || 0) * Math.PI) / 180,
            u = Math.cos(t) * e.rx,
            v = Math.sin(t) * e.ry;
          return [e.x + u * Math.cos(a) - v * Math.sin(a), e.y + u * Math.sin(a) + v * Math.cos(a)];
        }),
      put2 = (k, p, id, r) => {
        if (!City.onLand(p) || blocked(p) || hstr(`${id}|gap`) < RW.gap) return;
        add(k, p, id);
        if (r != null) out[out.length - 1].r = Math.round(r * 100) / 100;
      };
    for (const b of MapModel.borders()) {
      if (b.row === 'treeline')
        walk(b.pts, RW.tree, (p, tx, ty, id) => {
          const side = City.regionAt([p[0] - ty * 10, p[1] + tx * 10]) === 'shu' ? 1 : -1;
          for (let j = 0; j < 2; j++) {
            const q = [p[0] - ty * side * (8 + 9 * j), p[1] + tx * side * (8 + 9 * j)];
            if (City.regionAt(q) === 'shu' && reliefAt(q) <= N.treeline) put2('pine', q, `bt${id}|${j}`);
          }
        });
      if (b.row === 'reeds')
        walk(b.pts, RW.reed, (p, tx, ty, id) => {
          for (const side of [-1, 1]) {
            const o = b.w * 0.3 + 3,
              q = [p[0] - ty * side * o, p[1] + tx * side * o];
            if (reliefAt(q) <= N.treeline) put2('reed', q, `br${id}|${side}`);
          }
        });
      if (b.row === 'dunegrass')
        walk(b.pts, RW.dune, (p, tx, ty, id) => {
          const side = MapModel.onSand([p[0] - ty * 6, p[1] + tx * 6]) ? -1 : 1,
            q = [p[0] - ty * side * 5, p[1] + tx * side * 5];
          if (City.regionAt(q) === 'wu' && !MapModel.onSand(q)) put2('dune', q, `bd${id}`);
        });
    }
    const aR = HEX.size * BIOME.academyR * RW.hedgeAt;
    walk(ring({ x: CITY.park.x, y: CITY.park.y, rx: aR, ry: aR }, Math.round((2 * Math.PI * aR) / RW.hedge)), RW.hedge, (p, tx, ty, id) =>
      put2('hedge', p, `bh${id}`)
    );
    if (CITY.minors.outlaws)
      walk(ring(CITY.minors.outlaws, 48), RW.fence, (p, tx, ty, id) =>
        hstr(`bf${id}|s`) < RW.scrap ? put2('scrap', p, `bf${id}`) : put2('fence', p, `bf${id}`, Math.atan2(-ty, tx))
      );
    MapModel.natCache = { lots, items: out };
    return out;
  },
  /**
   * The island's animals (spec §4.19c, NATURE.life): [{ k, at (loop centre), r (loop radius, map units), up (m), ph, sp }] — birds
   * circling the Peak, gulls over the harbor, a heron on the river, deer at the Shu forest edge, village dogs, an Old Town cat.
   */
  wild(run) {
    const nat = MapModel.nature(run),
      dist = id => {
        const d = DISTRICTS.find(x => x.id === id);
        return d && d.poly && d.poly.x != null ? [d.poly.x, d.poly.y] : null;
      },
      R = CITY.relief,
      forest = nat.filter(o => o.k === 'pine' && reliefAt(o.at) < 30),
      villages = ['shu-village-north', 'shu-village-south', 'wu-village'].map(dist).filter(Boolean),
      out = [];
    for (const L of NATURE.life)
      for (let i = 0; i < L.n; i++) {
        const id = `${L.kind}|${i}`,
          at =
            L.at === 'peak'
              ? R.peak.at
              : L.at === 'river'
                ? R.river.line[1]
                : L.at === 'forest'
                  ? forest.length && hitem(forest, id).at
                  : L.at === 'villages'
                    ? villages[i % villages.length]
                    : dist(L.at);
        if (!at) continue;
        out.push({
          k: L.kind,
          at: at.slice(),
          r: Math.round(L.r[0] + (L.r[1] - L.r[0]) * hstr(`${id}|r`)),
          up: L.up,
          ph: Math.round(hstr(`${id}|p`) * 628) / 100,
          sp: Math.round((0.7 + 0.6 * hstr(`${id}|v`)) * 100) / 100
        });
      }
    return out;
  },
  /**
   * Level ground in the highlands (owner, 2026-10-05; spec §4.19b): every Shu place, HQ, venue, home and village stands on a
   * flat pad (`at`, radius `r`, then `blend` to the slope) — the 3D terrain levels it to the height at its centre. Data only.
   */
  pads() {
    const shu = p => City.regionAt(p) === 'shu',
      out = [];
    for (const id of Object.keys(SPOTS)) if (SPOTS[id].at && shu(SPOTS[id].at)) out.push({ at: SPOTS[id].at, r: 22, blend: 14 });
    CITY.hq.forEach(at => shu(at) && out.push({ at, r: 26, blend: 14 }));
    for (const v of Object.values(VENUES)) if (shu(v.at)) out.push({ at: v.at, r: (v.clear || 20) + 8, blend: 16 });
    for (const at of Object.values(HOME_AT)) if (shu(at)) out.push({ at, r: 16, blend: 12 });
    for (const d of DISTRICTS)
      if (d.region === 'shu' && d.poly && !Array.isArray(d.poly) && d.poly.r)
        out.push({ at: [d.poly.x, d.poly.y], r: d.poly.r * 0.8, blend: 18 });
    return out;
  },
  ptId: p => `pt:${Math.round(p[0])},${Math.round(p[1])}`,
  ptOf: sel => (sel && sel.startsWith('pt:') ? sel.slice(3).split(',').map(Number) : null),
  /** Land: the island, the majors' territories, minors' patches, Central Academy, labels, landmarks. */
  land(run) {
    const mine = City.myRegion(run),
      reg = id => ({ id, color: REGIONS[id].color, mine: mine === id });
    return {
      coast: CITY.coast,
      beach: CITY.beach,
      regions: ['wu', 'shu', 'wei'].map(id => Object.assign(reg(id), { poly: CITY[id] })),
      minors: Object.entries(CITY.minors).map(([id, e]) => Object.assign(reg(id), e)),
      park: Object.assign(reg('open'), CITY.park, { title: REGIONS.open.desc }),
      relief: CITY.relief,
      pads: MapModel.pads(),
      labels: ['wei', 'shu', 'wu', 'outlaws', 'gloria', 'open'].map(id => ({
        id,
        at: CITY.label[id],
        color: REGIONS[id].color,
        big: MAJORS.includes(id),
        text: `${REGIONS[id].name}${id === mine ? ' · home turf' : ''}`
      })),
      airport: CITY.airport,
      roads: ROADS.edges
        .filter(e => e[3] !== 'via')
        .map(([a, b, kind]) => ({ kind, pts: [ROADS.nodes[a].slice(), ROADS.nodes[b].slice()] })), // (a 'via' chain retraces an edge: drawn once)
      dunes: CITY.dunes,
      districts: DISTRICTS.map(d => ({ id: d.id, region: d.region, style: d.style, poly: MapModel.districtPoly(d) })),
      ground: GROUND.map(q => ({
        id: q.id,
        kind: q.kind,
        poly: MapModel.districtPoly(q),
        hole: q.poly.r0 ? MapModel.districtPoly({ poly: { ...q.poly, r: q.poly.r0 } }) : null
      })),
      lots: MapModel.lots(run),
      landmarks: MapModel.landmarks(run),
      nature: MapModel.nature(run),
      wild: MapModel.wild(run),
      biomes: MapModel.biomes(),
      bioPal: BIOME,
      borders: MapModel.borders()
    };
  },
  /**
   * Biome ground (spec §4.19d): region → its BIOME palette and shape — the majors' polygons, the minors' ellipses and the
   * Academy's lawn (a disc round the park). The renderer cross-fades between them; no faction colour.
   */
  biomes: () => [
    ...MAJORS.map(id => ({ id, poly: CITY[id], pal: BIOME[id] })),
    { id: 'open', x: CITY.park.x, y: CITY.park.y, rx: HEX.size * BIOME.academyR, ry: HEX.size * BIOME.academyR, rot: 0, pal: BIOME.open },
    ...Object.entries(CITY.minors)
      .filter(([id]) => BIOME[id])
      .map(([id, e]) => ({ id, x: e.x, y: e.y, rx: e.rx, ry: e.ry, rot: e.rot || 0, pal: BIOME[id] }))
  ],
  /**
   * The region lines as polylines (spec §4.19d; BORDERS kinds): the Shu–Wei line (the points the two polygons share, in
   * Shu's order), the dune line and the river. The Academy's and the Outlaws' rings are their biome shapes.
   */
  borders: () =>
    [
      { kind: 'shuWei', pts: CITY.shu.filter(p => CITY.wei.some(q => q[0] === p[0] && q[1] === p[1])) },
      { kind: 'dunes', pts: CITY.dunes },
      ...(CITY.relief && CITY.relief.river ? [{ kind: 'river', pts: CITY.relief.river.line, w: CITY.relief.river.w }] : [])
    ].map(b => ({ ...b, ...BORDERS[b.kind] })),
  /**
   * What a kit place trains best (spec §4.33, T-310): body stats (or wit) by their best gain in any of its orders (Stretch aside;
   * wit × 100 to compare), the top one and any within 60 % of it, at most 3; [] for a place without a kit.
   */
  trains(id) {
    const s = SPOTS[id],
      sum = {};
    if (!s || !s.kit) return [];
    for (const oid of City.orders(id)) {
      const O = DAY_ORDERS[oid];
      if (O.kind === 'stretch') continue;
      for (const [k, v] of [O.main, O.side, ...(O.more || [])]) sum[k] = Math.max(sum[k] || 0, k === 'wit' ? v * 100 : v);
    }
    const ks = Object.keys(sum).sort((a, b) => sum[b] - sum[a] || BODY.keys.indexOf(a) - BODY.keys.indexOf(b));
    return ks.filter(k => sum[k] >= 0.6 * sum[ks[0]]).slice(0, 3);
  },
  /**
   * Every place and club HQ with its landmark kind (LANDMARK) and its facility (spec §4.40): [{ id, at, kind, region, kit?, fac, node,
   * rot, w, d, h }] — `at` = the facility lot's centre (MapModel.facilities), `node` = the place's own point (where you stand: its
   * door), `rot` = its yaw (the door toward the node), w / d / h its lot (m). kit: the place's KITS tags, drawn on the lot. Your
   * home sits where your housing is.
   */
  landmarks(run) {
    const F = MapModel.facilities(run),
      lot = (id, node) => {
        const f = F[id];
        return f ? { at: f.at, node, fac: f.fac, rot: f.rot, w: f.w, d: f.d, h: f.h } : { at: node, node };
      };
    return [
      ...Object.keys(SPOTS).map(id => ({
        id,
        kind: LANDMARK[id],
        region: City.region(run, id),
        kit: SPOTS[id].kit || [],
        ...lot(id, City.at(run, id)),
        ...(id !== 'home' && MapModel.known(run, id, City.at(run, id)) ? { name: SPOTS[id].name } : {}) // its name board (a known place)
      })),
      ...CITY.hq.map((at, i) => ({
        id: `hq${i}`,
        kind: LANDMARK.hq,
        region: FACTIONS[i].region,
        ...lot(`hq${i}`, at),
        ...(run.teams[i] && MapModel.known(run, `hq${i}`, at) ? { name: run.teams[i].name } : {})
      })),
      ...MapModel.landmarksFixed().map(L => (L.id.startsWith('venue:') ? { ...L, name: VENUES[L.id.slice(6)].name } : L))
    ];
  },
  /**
   * Where you stand at an outdoor facility (spec §4.40, arriving inside): its kit, as fractions of the lot (w, d; door on +z).
   * A building with an interior stands you at its station (INTERIOR); any other building keeps you at its door (its node).
   */
  FAC_IN: {
    sprintlab: [-0.04, 0.38], // the track's start line
    sandcourts: [-0.26, 0], // the first sand court
    dunesprint: [0, 0.33], // the sprint lane
    harboryard: [-0.33, 0.36], // the racks under the lean-to
    trailhead: [0, 0.2], // through the gate, on the trail
    steps: [0, 0.47], // the foot of the steps
    cage: [-0.1, -0.05], // between the racks and the bench
    overcourt: [0, 0.15],
    nightcourt: [0, 0.15],
    hermit: [0.125, 0.125], // the old court
    campus: [0, 0.28], // the lawn pitch
    club: [0.33, 0.22], // the mats pavilion
    acagym: [0.38, 0.22], // the mats outside
    bonfire: [0.18, 0.18] // by the fire
  },
  /**
   * Arriving inside (owner, 2026-10-24; every place since T-362): at rules point p — a place's own point (its door) — the walk on from
   * the door to where you stand in it: [door outside, door inside, (the hall's door out, in — a hall behind the lot's front), spot]
   * (map units), or null (not a place's point, or nowhere to go in). The spot: the INTERIOR's first station (its lead order, the bed,
   * the counter, the club board …), else MapModel.FAC_IN on the lot. Display only: the rules keep you at p (trip costs, what a place
   * does, the fog).
   */
  inside(run, p) {
    if (!p) return null;
    const L = MapModel.landmarks(run).find(l => l.node && l.w && Math.hypot(l.node[0] - p[0], l.node[1] - p[1]) < 1); // (within 1: City.moveTo rounds)
    if (!L) return null;
    const I = typeof INTERIOR !== 'undefined' && INTERIOR[L.id],
      f = MapModel.FAC_IN[L.fac],
      st = I && I.stations[0],
      H = I && I.hall,
      spot = st ? st.at : f ? [f[0] * L.w, f[1] * L.d] : null;
    if (!spot) return null;
    const c = Math.cos(L.rot || 0),
      s = Math.sin(L.rot || 0),
      w = ([lx, lz]) => [
        Math.round((L.at[0] + (lx * c + lz * s) / MAP_UNIT_M) * 100) / 100,
        Math.round((L.at[1] + (-lx * s + lz * c) / MAP_UNIT_M) * 100) / 100
      ], // local m (door on +z) → map units (the interiors' frame: makeRotationY by the lot's yaw)
      front = H && !st.out ? H.z + H.d / 2 : null, // the hall's door wall (z), when you stand in the hall
      via = front != null && front < L.d / 2 - 2 ? [w([H.x, front + 1]), w([H.x, front - 1])] : []; // a hall behind the lot's front: through its door
    return [w([0, L.d / 2 + 1]), w([0, L.d / 2 - 1.5]), ...via, w(spot)];
  },
  /** The landmarks that stand where they are drawn (centred on their point): the venues, the ritual ground, the airport. */
  landmarksFixed: () => [
    ...Object.entries(VENUES).map(([id, v]) => ({ id: `venue:${id}`, at: v.at, node: v.at, kind: v.kind, region: v.region })),
    { id: 'ritual', at: CITY.ritual, kind: 'ritual', region: 'open' }, // the old ritual ground: no pin, no label
    { id: 'airport', at: CITY.airport, kind: 'airport', region: 'wu', rot: AIRPORT.yaw } // on a fixed heading (spec §4.18d)
  ],
  /**
   * The facility lots (spec §4.40, T-351): id → { at (centre), rot, w, d, h (m), fac, node } for every place and club HQ with a
   * FACILITY design. Each lot stands beside its place's road node, its door (+z) toward it, MapModel.facGap from it: of 24 headings the
   * one (at two distances) that crosses the fewest roads, other lots, places, venues, the airport and the sea (ties: away from the node's roads). Pure
   * (fixed data, no randoms); cached per home spot.
   */
  facilities(run) {
    const key = City.at(run, 'home').join(',');
    if (MapModel.facCache && MapModel.facCache.key === key) return MapModel.facCache.out;
    const U = 1 / MAP_UNIT_M,
      N = ROADS.nodes,
      segs = ROADS.edges.filter(e => e[2] !== 'overpass').map(([a, b, k]) => [N[a], N[b], k]),
      nodeOf = id => (id === 'home' ? `home:${run.housing || 'studio'}` : id),
      ids = [...Object.keys(SPOTS), ...CITY.hq.map((_, i) => `hq${i}`)],
      points = ids.map(id => (id.startsWith('hq') ? CITY.hq[+id.slice(2)] : City.at(run, id))),
      placed = [],
      out = {},
      // a lot { c, cs, sn, hw, hd } holds map point p (+ m units)?
      holds = (f, p, m = 0) => {
        const dx = p[0] - f.c[0],
          dy = p[1] - f.c[1];
        return Math.abs(dx * f.cs - dy * f.sn) <= f.hw + m && Math.abs(dx * f.sn + dy * f.cs) <= f.hd + m;
      },
      corners = f =>
        [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1]
        ].map(([a, b]) => [f.c[0] + a * f.hw * f.cs + b * f.hd * f.sn, f.c[1] - a * f.hw * f.sn + b * f.hd * f.cs]);
    ids.forEach((id, n) => {
      const fac = id.startsWith('hq') ? FACILITY_OF.hq[+id.slice(2)] : FACILITY_OF[id],
        S = FACILITY[fac];
      if (!S) return;
      const p = points[n],
        nid = nodeOf(id),
        hw = (S.w / 2) * U,
        hd = (S.d / 2) * U,
        far = Math.hypot(hw, hd * 2) + MapModel.facGap + 12,
        near = segs.filter(([a, b]) => MapModel.segDist(p, a, b) < far),
        dirs = ROADS.edges
          .filter(e => e[0] === nid || e[1] === nid)
          .map(e => N[e[0] === nid ? e[1] : e[0]])
          .map(q => Math.atan2(q[1] - p[1], q[0] - p[0])),
        others = points.filter((q, j) => j !== n);
      let best = null;
      for (let k = 0; k < 48; k++) {
        const t = ((k % 24) / 24) * Math.PI * 2,
          ux = Math.cos(t),
          uy = Math.sin(t),
          off = hd + MapModel.facGap + (k >= 24 ? 14 : 0), // (a second ring a little further back: a busy junction)
          // the door (+z) faces the node: yaw = atan2(−ux, −uy) (the landmarkYaw convention); cs / sn of it
          yaw = Math.atan2(-ux, -uy),
          f = { c: [p[0] + ux * off, p[1] + uy * off], cs: Math.cos(yaw), sn: Math.sin(yaw), hw, hd };
        let bad = 0;
        for (const [a, b, kind] of near) {
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]),
            m = kind === 'main' ? 5 : kind === 'path' ? 2 : 4;
          for (let s = 0; s <= L; s += 4) if (holds(f, [a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L], m)) bad++;
        }
        for (const g of placed)
          if (corners(g).some(q => holds(f, q, 4)) || corners(f).some(q => holds(g, q, 4)) || holds(f, g.c)) bad += 400;
        for (const q of others) if (holds(f, q, 6)) bad += 200;
        for (const v of Object.values(VENUES))
          if (corners(f).some(q => Math.hypot(q[0] - v.at[0], q[1] - v.at[1]) < v.clear + 6)) bad += 300;
        for (const q of [...corners(f), f.c]) if (!City.onLand(q) || MapModel.inAirport(q)) bad += 150;
        const away = dirs.length ? Math.min(...dirs.map(a => Math.abs(Math.atan2(Math.sin(a - t), Math.cos(a - t))))) : Math.PI,
          score = bad * 10 - away + (k >= 24 ? 4 : 0);
        if (!best || score < best.score) best = { score, f, yaw };
      }
      placed.push(best.f);
      const r = v => Math.round(v * 10) / 10;
      out[id] = { at: best.f.c.map(r), rot: Math.round(best.yaw * 1000) / 1000, w: S.w, d: S.d, h: S.h, fac, node: p.slice() };
    });
    MapModel.facCache = { key, out };
    return out;
  },
  /** Facility lots stand this far (map units) from their node (the door's apron, clear of the road). */
  facGap: 7,
  /** Distance from map point p to the segment a–b. */
  segDist(p, a, b) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  },
  /** Is map point p on a facility lot (+ m map units)? → that lot's id, or null. */
  onFacility(run, p, m = 0) {
    for (const [id, f] of Object.entries(MapModel.facilities(run))) {
      const cs = Math.cos(f.rot),
        sn = Math.sin(f.rot),
        dx = p[0] - f.at[0],
        dy = p[1] - f.at[1];
      if (
        Math.abs(dx * cs - dy * sn) <= (f.w / 2) * (1 / MAP_UNIT_M) + m &&
        Math.abs(dx * sn + dy * cs) <= (f.d / 2) * (1 / MAP_UNIT_M) + m
      )
        return id;
    }
    return null;
  },
  /** Map point p on ground no building stands on (GROUND_KEEP: fields, terraces, parks, water, the quarry)? */
  kept: p =>
    GROUND.some(q => {
      if (!GROUND_KEEP.includes(q.kind)) return false;
      const d = Math.hypot(p[0] - q.poly.x, p[1] - q.poly.y);
      return d <= q.poly.r && !(q.poly.r0 && d < q.poly.r0);
    }),
  /** Map point p on the airport's footprint (AIRPORT.box: u along the shore, v seaward, from the terminal)? */
  inAirport(p) {
    const [u0, v0, u1, v1] = AIRPORT.box,
      dx = p[0] - CITY.airport[0],
      dy = p[1] - CITY.airport[1],
      c = Math.cos(AIRPORT.yaw),
      sn = Math.sin(AIRPORT.yaw),
      u = dx * c - dy * sn,
      v = dx * sn + dy * c;
    return u >= u0 && u <= u1 && v >= v0 && v <= v1;
  },
  /** The sand: Wu land between the dune line and the coast (the old Wu polygon, with the old coast, is the dry side). */
  onSand(p) {
    const dry = [...CITY.dunes, ...CITY.strip, ...CITY.weiWu.slice().reverse()];
    return inPoly(p, CITY.wu) && !inPoly(p, dry);
  },
  /** A district's polygon: `{ x, y, r }` → a 24-gon, 'beach' → the sand ring (dunes + coast), 'wei' → Wei's land, else the points. */
  districtPoly(d) {
    const q = d.poly;
    if (q === 'beach') return [...CITY.dunes, ...CITY.beach.slice().reverse()];
    if (q === 'wei') return CITY.wei;
    if (Array.isArray(q)) return q;
    return Array.from({ length: 24 }, (_, i) => [
      q.x + q.r * Math.cos((i / 24) * Math.PI * 2),
      q.y + q.r * Math.sin((i / 24) * Math.PI * 2)
    ]);
  },
  /** A lot's wealth 0–1 (spec §4.19, WEALTH): Wei falls off smoothly from the downtown core; other regions a base ± a hash spread. */
  wealth(region, p, id, district) {
    const W = WEALTH,
      j = (hstr(`${id}|w`) - 0.5) * 2;
    if (region === 'wei') {
      const d = Math.hypot(p[0] - W.weiCore[0], p[1] - W.weiCore[1]),
        t = clamp(d / W.weiEdge, 0, 1),
        w = W.weiFloor + (1 - W.weiFloor) * (1 - t * t * (3 - 2 * t)) + j * W.jitter;
      return clamp(district === 'wei-oldtown' ? Math.min(w, W.oldtown) : w, 0, 1);
    }
    if (region === 'gloria') return clamp(W.gloria + j * 0.03, 0, 1);
    if (region === 'open') return clamp(W.academy + j * 0.03, 0, 1);
    if (region === 'outlaws') return clamp(W.outlaws + j * 0.03, 0, 1);
    return clamp((W[region] === undefined ? W.wu : W[region]) + j * W.spread, 0, 1);
  },
  /**
   * Settlement lots (spec §4.18, §4.19): [{ at, rot, size, style, kind, wealth, h, district }]. Each DISTRICT is filled with a grid of lots
   * (spacing `gap`, rotated to the road nearest its middle, a hash of the slot vs `density`), earlier districts first. A lot never
   * stands in the water, in another region, on the sand (beach districts: only on it), within a lot's width of a road (the overpass is
   * elevated: lots may stand under it), within `placeClear` of a place, on the airport (inAirport), on kept ground (kept), or on another lot. Outside the districts a road-side row
   * (every SETTLE gap, both sides) is built at 0.4 × density. `wealth` (0–1, MapModel.wealth) scales a lot's side (× 0.7–1.3)
   * and thins the grid (rich = sparser); `h` (0–1) is the height factor: = wealth in downtown, wealth × 0.4 elsewhere.
   * Deterministic: fixed data + string hashes (hstr), no randoms. Cached per home spot (the only run-dependent input).
   */
  lots(run) {
    const home = City.at(run, 'home'),
      key = home.join(',');
    if (MapModel.lotCache && MapModel.lotCache.key === key) return MapModel.lotCache.lots;
    const N = ROADS.nodes,
      places = [...Object.keys(SPOTS).map(id => City.at(run, id)), ...CITY.hq, CITY.ritual],
      venues = Object.values(VENUES),
      facs = Object.values(MapModel.facilities(run)).map(f => ({
        c: f.at,
        cs: Math.cos(f.rot),
        sn: Math.sin(f.rot),
        hw: f.w / 2 / MAP_UNIT_M,
        hd: f.d / 2 / MAP_UNIT_M
      })),
      onFac = (p, m) =>
        facs.some(f => {
          const dx = p[0] - f.c[0],
            dy = p[1] - f.c[1];
          return Math.abs(dx * f.cs - dy * f.sn) <= f.hw + m && Math.abs(dx * f.sn + dy * f.cs) <= f.hd + m;
        }),
      segD = (p, a, b) => {
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
        return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
      },
      flat = ROADS.edges.filter(([, , k]) => k !== 'overpass').map(([a, b]) => [N[a], N[b]]),
      near = p => flat.reduce((m, [a, b]) => Math.min(m, segD(p, a, b)), Infinity),
      polys = DISTRICTS.map(d => MapModel.districtPoly(d)),
      inDistrict = p =>
        DISTRICTS.some((d, i) => d.region === City.regionAt(p) && inPoly(p, polys[i]) && !!MapModel.onSand(p) === !!d.beach),
      lots = [],
      free = (p, size, reg) =>
        City.onLand(p) &&
        City.regionAt(p) === reg &&
        near(p) >= size * 0.5 + 4 &&
        near(p) - size * 0.5 <= LANES.reach && // (every building fronts a road: a lane reaches the rest, MapModel.laneData)
        places.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= MapModel.placeClear) &&
        !onFac(p, size * 0.5 + 3) &&
        venues.every(v => Math.hypot(v.at[0] - p[0], v.at[1] - p[1]) >= v.clear) &&
        !MapModel.inAirport(p) &&
        !MapModel.kept(p) &&
        lots.every(l => Math.hypot(l.at[0] - p[0], l.at[1] - p[1]) >= (l.size + size) * 0.55),
      add = (p, rot, size, d, id, w) => {
        lots.push({
          at: [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10],
          rot: Math.round(rot * 1000) / 1000,
          size: Math.round(size * 10) / 10,
          style: d.style,
          kind: hitem(d.kinds, `${id}|k`),
          wealth: Math.round(w * 100) / 100,
          h: Math.round((d.tall ? w : w * 0.4) * 100) / 100,
          district: d.district || d.id
        });
      };
    DISTRICTS.forEach((d, i) => {
      const poly = polys[i],
        xs = poly.map(q => q[0]),
        ys = poly.map(q => q[1]),
        c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2],
        R = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2,
        // the grid follows the road nearest the middle
        [a, b] = flat.reduce((m, e) => (segD(c, e[0], e[1]) < segD(c, m[0], m[1]) ? e : m), flat[0]),
        th = Math.atan2(b[1] - a[1], b[0] - a[0]),
        ux = Math.cos(th),
        uy = Math.sin(th),
        n = Math.ceil(R / d.gap) + 1;
      for (let gi = -n; gi <= n; gi++)
        for (let gj = -n; gj <= n; gj++) {
          if (lots.length >= MapModel.maxLots) return;
          const p = [c[0] + ux * gi * d.gap - uy * gj * d.gap, c[1] + uy * gi * d.gap + ux * gj * d.gap],
            id = `${d.id}|${gi}|${gj}`;
          if (!inPoly(p, poly) || !!MapModel.onSand(p) !== !!d.beach) continue;
          const w = MapModel.wealth(d.region, p, id, d.id);
          if (hstr(id) >= d.density * MapModel.thin * (MAJORS.includes(d.region) ? MapModel.thinMajor : 1) * (1.15 - 0.45 * w)) continue;
          const size = d.size * (0.85 + 0.3 * hstr(`${id}|s`)) * (0.7 + 0.6 * w);
          if (!free(p, size, d.region)) continue;
          add(p, th, size, d, id, w);
        }
    });
    outer: for (const [ua, ub, kind, gen] of ROADS.edges) {
      if (kind === 'path' || kind === 'overpass' || kind === 'boardwalk' || gen) continue; // (the road-side rows: the island's own roads)
      const a = N[ua],
        b = N[ub],
        L = Math.hypot(b[0] - a[0], b[1] - a[1]),
        ux = (b[0] - a[0]) / L,
        uy = (b[1] - a[1]) / L;
      let at = 0;
      while (at < L) {
        const c = [a[0] + ux * at, a[1] + uy * at],
          reg = City.regionAt(c),
          cfg = SETTLE[reg] || SETTLE.open;
        at += cfg.gap;
        for (const side of [1, -1]) {
          const id = `${ua}|${ub}|${Math.round(at)}|${side}`;
          if (hstr(id) >= (cfg.density * MapModel.thin * (MAJORS.includes(reg) ? MapModel.thinMajor : 1) * 0.4) / MAP_SCALE) continue; // longer roads, the same count
          const p = [c[0] - uy * side * cfg.setback, c[1] + ux * side * cfg.setback],
            w = MapModel.wealth(reg, p, id, 'country'),
            size = cfg.size * (0.85 + 0.3 * hstr(`${id}|s`)) * (0.7 + 0.6 * w);
          if (MapModel.onSand(p) || inDistrict(p) || !free(p, size, reg)) continue;
          if (lots.length >= MapModel.maxLots) break outer;
          add(p, Math.atan2(uy, ux), size, { style: cfg.style, kinds: cfg.kinds, district: 'country' }, id, w);
        }
      }
    }
    MapModel.lotCache = { key, lots };
    return lots;
  },
  /** Lots stay this far (map units) from a place's or HQ's point (its door's apron); its facility lot is kept clear too (MapModel.facilities). */
  placeClear: 20,
  /** Most settlement lots on the island. */
  maxLots: 2400,
  /** Every district's and road row's density × this (owner, 2026-10-03: a thinner town). */
  thin: 0.65,
  /** Extra thinning for the majors' land on the scaled island (MAP_SCALE): their towns gained room, the count stays ~the same. */
  thinMajor: 0.8,
  /**
   * Pins: places, club HQs and this week's battle. flags: off (no time left for it), far (2+ day trip), turf,
   * hq, can (a club you can sign with), mine (your club), clash, today (a venue where your match is this week; venues are always known).
   */
  /** A place closed to you now (spec §4.40: its rim greyed): held by another faction (run.own), or its owner won't let you in. */
  shut: (run, id) => !!(run.own && run.own[id] && run.own[id] !== SPOTS[id].region) || !City.access(run, id).ok,
  /**
   * The always-on rims (spec §4.40): { id: [colour, strength] } — your club's HQ in its colour, your home, this week's match venue in
   * its region's colour (quiet), a known place closed to you greyed. The renderer adds the hover on top.
   */
  rims(run) {
    const out = {},
      mine = run.team != null && run.teams[run.team];
    if (mine) out[`hq${run.team}`] = [mine.color, 0.5];
    out.home = [mine ? mine.color : '#eef0f3', 0.4];
    const v = City.venue(run);
    if (v && VENUES[v]) out[`venue:${v}`] = [REGIONS[VENUES[v].region].color, 0.5];
    for (const id of Object.keys(SPOTS))
      if (SPOTS[id].at && MapModel.known(run, id, SPOTS[id].at) && MapModel.shut(run, id)) out[id] = ['#7a7d84', 0.6];
    return out;
  },
  pins(run) {
    const floor = run.floor || {},
      out = [];
    for (const [id, s] of Object.entries(SPOTS)) {
      const at = City.at(run, id);
      if (!MapModel.known(run, id, at)) continue;
      const mates = s.train ? (floor[s.train] || []).length : 0;
      out.push({
        id,
        kind: 'spot',
        at,
        name: s.name,
        trip: City.trip(run, at),
        icon: s.icon,
        badge: mates || '',
        glyphs: MapModel.trains(id).map(k => Body.glyph(k)), // what it trains best (spec §4.33)
        title: `${s.name}${s.kit ? ` — ${s.kit.map(t => KITS[t].name).join(', ')}` : ''}`,
        flags: {
          off: !!City.noTime(run, City.cost(run, id), at),
          far: City.trip(run, at) >= 4,
          turf: !!(s.train && City.turf(run, id)),
          shut: MapModel.shut(run, id)
        }
      });
    }
    run.teams.forEach((t, i) => {
      if (!MapModel.known(run, `hq${i}`, CITY.hq[i])) return;
      const can = World.isFree(run) && World.canJoin(run, i).ok;
      out.push({
        id: `hq${i}`,
        kind: 'hq',
        at: CITY.hq[i],
        name: `${t.name} HQ`,
        trip: City.trip(run, CITY.hq[i]),
        icon: '🛡',
        color: t.color,
        badge: can ? '✓' : City.scouted(run, i) ? '👁' : '',
        title: `${t.name} HQ`,
        flags: { hq: true, can, mine: i === run.team }
      });
    });
    const today = City.venue(run);
    for (const [id, v] of Object.entries(VENUES))
      out.push({
        id: `venue:${id}`,
        kind: 'venue',
        at: v.at,
        name: v.name,
        trip: City.trip(run, v.at),
        icon: '🏟',
        color: REGIONS[v.region].color,
        badge: '',
        title: v.name,
        flags: { today: id === today }
      });
    const c = Fight.clashSite(run);
    if (c)
      out.push({
        id: 'clash',
        kind: 'clash',
        at: c.at,
        name: `Street battle: ${REGIONS[c.a].name} vs ${REGIONS[c.b].name}`,
        trip: City.trip(run, c.at),
        icon: '⚔',
        badge: '',
        title: `Street battle: ${REGIONS[c.a].name} vs ${REGIONS[c.b].name}`,
        flags: { clash: true }
      });
    return out;
  },
  /**
   * Who is where this week (display only: no randoms, positions come from hashes of ids + place, so the same run state gives
   * the same model). people: MapModel.lifePeople (the named figures). crews: each known
   * faction club's drilling squad at its HQ (n figures by pool size; known = scouted or yours, else grey silhouettes; walk = its
   * region's explored places). battle: this week's open street battle. patrols: MapModel.patrols.
   */
  life(run) {
    const crews = [];
    run.teams.forEach((t, i) => {
      const f = FACTIONS[i];
      if (!f || !MapModel.known(run, `hq${i}`, CITY.hq[i])) return;
      const known = i === run.team || City.scouted(run, i),
        walk = known
          ? Object.keys(SPOTS)
              .filter(id => SPOTS[id].region === f.region && SPOTS[id].train && MapModel.known(run, id, City.at(run, id)))
              .map(id => City.at(run, id))
          : [];
      crews.push({
        region: f.region,
        team: i,
        at: CITY.hq[i],
        color: t.color,
        n: clamp(Math.round(Pool.size(run, f.region) / SQUAD), 2, 6),
        known,
        walk
      });
    });
    const c = Fight.clashSite(run);
    return {
      people: MapModel.lifePeople(run),
      look: { size: LIFE.size, pick: LIFE.pickPx, low: LIFE.low }, // the renderer's figure scales, hover radius (px), Fast-setting cap
      crews,
      battle: c ? { at: c.at, a: c.a, b: c.b, colors: [REGIONS[c.a].color, REGIONS[c.b].color] } : null,
      patrols: MapModel.patrols(run),
      traffic: MapModel.traffic()
    };
  },
  /**
   * The named people on the map (spec §4.37 1, T-331 — also what the encounters read): every NPC whose place today is
   * explored, where their week's plan puts them (People.plan: train / hard / wit at its place, hustle at a court — LIFE.court,
   * rest / out at home); a teammate on this week's training floor stands at the explored place of the floor's key nearest your
   * home instead (where you meet them; its pin counts them). [{ id, at, home, act, spot (SPOTS id or null), g, color }]: at = a
   * hashed point round the place, home = one round their home anchor (MapModel.homeAt), map units; g = 'circle' | 'mate' |
   * 'other' | 'grey' (a club you haven't scouted); color = their club's (your club's for teammates). At most `max`: your circle
   * first, then teammates, then by bond, then id. No randoms: plans and offsets are string hashes.
   */
  lifePeople(run, max = LIFE.max) {
    const homes = People.homes(run),
      you = City.at(run, 'home'),
      dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
      ring = (c, id, [r0, r1]) => {
        const a = hstr(`${id}|a`) * Math.PI * 2,
          r = r0 + hstr(`${id}|r`) * (r1 - r0);
        return [Math.round((c[0] + Math.cos(a) * r) * 10) / 10, Math.round((c[1] + Math.sin(a) * r) * 10) / 10];
      },
      circle = new Set(Circle.of(run).map(String)),
      mates = new Set(Run.mates(run).map(m => String(m.id))),
      mine = Run.myTeam(run),
      floorAt = {}, // a floor mate's place: their key's explored place nearest home
      rank = { circle: 0, mate: 1, other: 2, grey: 2 },
      out = [];
    for (const [key, ids] of Object.entries(run.floor || {})) {
      const s = City.spotsFor(key)
        .filter(id => MapModel.known(run, id, City.at(run, id)))
        .sort((a, b) => dist(City.at(run, a), you) - dist(City.at(run, b), you))[0];
      if (s) for (const id of ids) floorAt[id] = s;
    }
    for (const [id, e] of homes) {
      if (!run.people || !run.people[id]) continue;
      const plan = People.plan(run, e.p, e.home, Math.min(WEEK_DAYS, City.clock(run).day)), // today's plan (spec §4.41)
        sid = String(id),
        spot =
          floorAt[id] ||
          (plan.act === 'hustle' ? LIFE.court[e.home] || LIFE.courtElse : plan.at || (plan.stat ? LIFE.gym[e.home] : null) || null),
        hq = run.teams.indexOf(e.t),
        anchor = MapModel.homeAt(run, e),
        c = spot ? City.at(run, spot) : anchor;
      if (spot ? !MapModel.known(run, spot, c) : !City.seen(run, c)) continue; // fog: only what you've explored
      const g = circle.has(sid)
        ? 'circle'
        : mates.has(sid)
          ? 'mate'
          : hq >= 0 && hq !== run.team && !City.scouted(run, hq)
            ? 'grey'
            : 'other';
      out.push({
        id,
        at: ring(c, `${id}|${spot || 'home'}`, spot ? LIFE.spotR : LIFE.homeR),
        home: ring(anchor, `${id}|home`, LIFE.homeR),
        act: floorAt[id] ? 'train' : plan.act,
        spot: spot || null,
        g,
        color: g === 'mate' ? mine.color : (e.t && e.t.color) || REGIONS[e.home === 'academy' ? 'open' : e.home].color,
        k: [rank[g], g === 'grey' ? 0 : -Rel.bondOf(run, id)]
      });
    }
    return out
      .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || (String(a.id) < String(b.id) ? -1 : 1))
      .slice(0, max)
      .map(({ k, ...p }) => p);
  },
  /** Where an NPC lives (their home anchor, map units): their club's HQ, their pool's region anchor, the student quarter. */
  homeAt(run, e) {
    const i = run.teams.indexOf(e.t);
    if (i >= 0 && CITY.hq[i]) return CITY.hq[i];
    return e.home === 'academy' ? HOME_AT.studio : (REGIONS[e.home] || REGIONS.open).at;
  },
  /**
   * The day clock (spec §4.37 2; the real clock since §4.41) as week time in days: the days before today + the hour ÷ 24
   * (City.wt). phase 'walk' / 'order' with k 0–1 is the last action playing out (City.clock(run).last): its walk, then its block.
   */
  weekTime(run, phase = 'idle', k = 0) {
    const L = City.clock(run).last || {},
      u = clamp(k, 0, 1),
      at = A => A[0] + (A[1] - A[0]) * u;
    if (phase === 'walk' && L.walk) return at(L.walk);
    if (phase === 'order' && L.act) return at(L.act);
    return City.wt(run);
  },
  /** Time of day 0–1 (0 = midnight, 0.5 = noon): what the encounters read (see weekTime for the phases). */
  clock: (run, phase = 'idle', k = 0) => {
    const w = MapModel.weekTime(run, phase, k);
    return Math.round((w - Math.floor(w)) * 1e4) / 1e4;
  },
  /**
   * The map's time for the renderer (map3d: sun, sky, night lights, people walking out and home): { idle, walk: [a, b],
   * order: [a, b] } as week time (weekTime), plus CLOCK's display constants. The renderer runs its clock toward the phase the
   * UI reports (MapView.phase) and never back. A last action without a walk keeps walk = [its start, its start].
   * The running clock (spec §4.43): `scale` = real seconds a game hour takes at ×1 — a walk / a ride plays in real time (its hours ×
   * scale ÷ the speed); between actions the UI's clock (MapView.now) leads.
   */
  time(run) {
    const L = City.clock(run).last || {},
      now = City.wt(run),
      w = L.walk || (L.act ? [L.act[0], L.act[0]] : [now, now]),
      o = L.act || [w[1], w[1]];
    return {
      day: Math.min(WEEK_DAYS, City.clock(run).day) - 1,
      hour: City.hour(run),
      idle: now,
      walk: w.slice(),
      order: o.slice(),
      week: WEEK_DAYS,
      out: CLOCK.out,
      home: CLOCK.home,
      step: CLOCK.step,
      rate: CLOCK.rate,
      scale: CLOCK.scale,
      ff: CLOCK.ff,
      keys: CLOCK.keys
    };
  },
  /** Court floodlights (T-332): the explored courts and every venue, as map points. */
  floods: run => [
    ...MapModel.landmarks(run)
      .filter(l => (l.kind === 'court' && MapModel.known(run, l.id, l.at)) || String(l.id).startsWith('venue:'))
      .map(l => l.at)
  ],
  /**
   * City life (spec §4.19a, TRAFFIC; static): lines as closed loops out and back, pts [x, y, over] (over = 1 where the leg to the next
   * point is the overpass); boats { id, at, r, n }; the plane's take-off { from, lift, to, every } (map points on the runway's line).
   */
  traffic() {
    if (MapModel.trafficCache) return MapModel.trafficCache;
    const N = ROADS.nodes,
      kind = (a, b) => (ROADS.edges.find(([u, v]) => (u === a && v === b) || (u === b && v === a)) || [])[2],
      A = CITY.airport,
      R = AIRPORT.runway,
      on = u => {
        const c = Math.cos(AIRPORT.yaw),
          sn = Math.sin(AIRPORT.yaw);
        return [Math.round((A[0] + u * c + R.v * sn) * 10) / 10, Math.round((A[1] - u * sn + R.v * c) * 10) / 10];
      };
    return (MapModel.trafficCache = {
      lines: TRAFFIC.lines.map(l => {
        const ids = [...l.nodes, ...l.nodes.slice(0, -1).reverse()];
        return {
          id: l.id,
          kind: l.kind,
          n: l.n,
          speed: l.speed,
          pts: ids.map((id, i) => [...N[id], i + 1 < ids.length && kind(id, ids[i + 1]) === 'overpass' ? 1 : 0])
        };
      }),
      boats: TRAFFIC.boats.map(b => ({ id: b.id, at: [b.x, b.y], r: b.r, n: b.n })),
      plane: { from: on(R.from), lift: on(R.lift), to: on(R.to), every: TRAFFIC.plane.every }
    });
  },
  /** The last action's ride (City.rideTo: { k, legs [{ m, pts, w, a, b }] } in week time) while you still stand at its end, else null. */
  ride(run) {
    const L = City.clock(run).last,
      R0 = L && L.ride,
      end = R0 && R0.legs.length && R0.legs[R0.legs.length - 1].pts.slice(-1)[0],
      at = City.pos(run);
    return end && Math.hypot(end[0] - at[0], end[1] - at[1]) < 2 ? R0 : null;
  },
  /**
   * Transport on the map (spec §4.42; display only, static): `bus` = { first, last, every, lines [{ id, pts [[x, y, over, c]] (c = the
   * travel cost along the line), hours (end to end), stops [{ id, at, name, c }] }] } — a bus leaves each end of a line at every
   * departure (first … last, every h) and takes `hours` to the other end; `ferry` = { first, last, every, pts [[x, y, c]] (the sea
   * line), hours, piers [{ id, at (its road node), dock (on the sea line), name, c }] } — a boat leaves each end at every departure.
   * Positions in map units; times in hours of the day (the renderer reads them off the map's clock).
   */
  transit() {
    if (MapModel.transitCache) return MapModel.transitCache;
    const N = ROADS.nodes,
      B = TRANSPORT.bus,
      F = TRANSPORT.ferry,
      kinds = City.edgeKinds(),
      S = City.seaLine(),
      r1 = v => Math.round(v * 10) / 10;
    return (MapModel.transitCache = {
      bus: {
        first: B.first,
        last: B.last,
        every: B.every,
        lines: City.busLines().map(L => ({
          id: L.id,
          name: L.name,
          pts: L.nodes.map((id, i) => [
            ...N[id].map(r1),
            i + 1 < L.nodes.length && kinds[`${id}|${L.nodes[i + 1]}`] === 'overpass' ? 1 : 0,
            r1(L.cum[i])
          ]),
          hours: Math.round((L.cum[L.cum.length - 1] / (WALK_PACE * B.pace)) * 1000) / 1000,
          stops: L.stops.map(id => ({ id, at: N[id].map(r1), name: City.stopName(id), c: r1(L.cum[L.nodes.indexOf(id)]) }))
        }))
      },
      ferry: {
        first: F.first,
        last: F.last,
        every: F.every,
        pts: S.pts.map((q, i) => [r1(q[0]), r1(q[1]), r1(S.cum[i])]),
        hours: Math.round((S.cum[S.cum.length - 1] / (WALK_PACE * F.pace)) * 1000) / 1000,
        piers: F.piers.map(P => ({ id: P.node, at: N[P.node].map(r1), dock: S.pts[P.i].map(r1), name: P.name, c: r1(S.cum[P.i]) }))
      }
    });
  },
  /**
   * The war on the map (spec §4.34; hex tiles are never drawn): lines — each standing unit's land border (straight runs, War.borders) { unit,
   * color (its lead club's colour), runs: [{ pts, closed }] }; hot — this week's battle stretch { units, colors, lines (open polylines), site };
   * banners along it [{ at, face, color }] (each side's, facing across); fall — the latest destroyed unit { key, at (its HQ),
   * pin } (the map pans there once). Display only, no randoms.
   */
  warMap(run) {
    const col = u => run.teams[WAR.units[u].clubs[0]].color,
      F = War.state(run).fallen,
      last = Object.keys(F).sort((a, b) => F[b].week - F[a].week || (a < b ? -1 : 1))[0],
      hq = last && WAR.units[last].clubs[0],
      U = Front.clash(run),
      hot =
        U && War.alive(run, U.ua) && War.alive(run, U.ub)
          ? { units: [U.ua, U.ub], colors: [col(U.ua), col(U.ub)], lines: War.meet(run, U.ua, U.ub), site: run.clash.at || null }
          : null,
      banners = [];
    if (hot)
      for (const L of hot.lines)
        for (let i = 1; i + 1 < L.length; i += MapModel.bannerStep) {
          const [x, y] = L[i],
            dx = L[i + 1][0] - L[i - 1][0],
            dy = L[i + 1][1] - L[i - 1][1],
            n = Math.hypot(dx, dy) || 1,
            nx = dy / n,
            ny = -dx / n; // right of the line: b's side (a's edges run round a's land)
          [
            [-1, hot.colors[0]],
            [1, hot.colors[1]]
          ].forEach(([k, color]) =>
            banners.push({ at: [x + nx * k * 9, y + ny * k * 9], face: [x - nx * k * 30, y - ny * k * 30], color })
          );
        }
    return {
      lines: War.ids()
        .filter(u => War.alive(run, u))
        .map(u => ({ unit: u, color: col(u), runs: War.outline(run, u) })),
      hot,
      banners,
      fall: last ? { key: `${last}|${F[last].week}`, at: CITY.hq[hq].slice(), pin: `hq${hq}` } : null
    };
  },
  /** Every this-many points of a hot stretch (Hex.dense: HEX.size / 4 apart), a pair of banners. */
  bannerStep: 10,
  /**
   * Patrols on this week's hot border (spec §4.34): the battle's two tiles — the defender guards its tile (2), the raider
   * stands on its own tile across the border (3). Figures [{ id, tile, at, face, color }]: at = on the tile's side facing the
   * other tile (hash jitter), face = the other tile's centre. Display only, no randoms.
   */
  patrols(run) {
    const c = Fight.clashSite(run),
      out = [];
    if (!c || !run.clash.from || !Hex.tile(run.clash.from)) return out;
    const add = (t, r, n, face) => {
      for (let i = 0; i < n; i++) {
        const id = `${t.id}|${r}|${i}`,
          a = hstr(`${id}|a`) * Math.PI * 2,
          d = HEX.size * (0.08 + hstr(`${id}|r`) * 0.14);
        out.push({
          id,
          tile: t.id,
          at: [t.at[0] + (face[0] - t.at[0]) * 0.3 + Math.cos(a) * d, t.at[1] + (face[1] - t.at[1]) * 0.3 + Math.sin(a) * d],
          face: face.slice(),
          color: REGIONS[r].color
        });
      }
    };
    const t = Hex.tile(c.tile),
      f = Hex.tile(run.clash.from);
    add(t, c.b, 2, f.at);
    add(f, c.a, 3, t.at);
    return out;
  },
  build(run, sel = null) {
    return {
      w: CITY.w,
      h: CITY.h,
      land: MapModel.land(run),
      borders: MapModel.warMap(run),
      pins: MapModel.pins(run),
      you: {
        at: City.pos(run),
        inside: MapModel.inside(run, City.pos(run)), // the walk in from the door (display)
        ride: MapModel.ride(run), // the last trip's legs when it was a ride (spec §4.42): the renderer plays them
        rides: Object.keys(run.ride || {}).filter(k => run.ride[k]), // what you own (the bike / scooter you ride)
        title: `You are in ${REGIONS[City.loc(run)].name}`
      },
      transit: MapModel.transit(),
      // the dark map lifts only round you and your home (owner, 2026-10-03); what you've explored stays known (pins) but dark
      fog: { points: [City.pos(run), City.at(run, 'home')], r: REVEAL_R },
      flag: MapModel.ptOf(sel),
      focus: City.at(run, 'home'), // where a fresh view centres
      sel,
      life: MapModel.life(run),
      time: MapModel.time(run),
      floods: MapModel.floods(run),
      figures: MapModel.figures(run),
      rims: MapModel.rims(run),
      fence: City.fence(run) ? { at: [CITY.park.x, CITY.park.y], r: (170 * MAP_SCALE) / MAP_BASE } : null // Story week 1: the camera keeps to the campus
    };
  },
  /**
   * People drawn as full models on the map (spec §10.10a, §4.29): Fern by the student flat's door (Story mode), and every named
   * player (the rival, the cohort, the first aces) by their club's HQ. [{ id, at, face, name, tag, color, kit }]; plain data.
   */
  figures(run) {
    const out = [];
    if (Story.on(run) && !run.story.flags.guideGone) {
      const h = HOME_AT.studio;
      out.push({
        id: GUIDE.id,
        at: [h[0] + 9, h[1] + 7],
        face: h,
        name: GUIDE.short,
        tag: '',
        color: REGIONS.open.color,
        kit: { shirt: GUIDE.team.color, hair: GUIDE.hair, skin: GUIDE.look.skin }
      });
    }
    for (const p of Stars.all(run)) {
      const hq = CITY.hq[p.team.i];
      if (!hq) continue;
      const a = hstr(`fig|${p.id}`) * Math.PI * 2,
        r = 16 + 6 * hstr(`figr|${p.id}`);
      out.push({
        id: p.id,
        at: [Math.round((hq[0] + Math.cos(a) * r) * 10) / 10, Math.round((hq[1] + Math.sin(a) * r) * 10) / 10],
        face: hq,
        name: p.name,
        tag: p.named === 'rival' ? 'Rival' : p.named === 'cohort' ? 'Next ace' : 'Ace',
        color: p.team.color,
        kit: { shirt: p.team.color, hair: p.hair, skin: p.look.skin }
      });
    }
    return out;
  }
};
/**
 * Access lanes (owner, 2026-10-26: "building placement should be alongside the road, or if a building is isolated, build a road to it").
 * Run-independent, no randoms: for each district, the lot grid's candidates (MapModel.lots' grid — frame, density hash, size — before
 * the run's places and facilities) farther than LANES.reach from every road get a lane: a street along their grid row (every
 * LANES.every-th row is a lane in place of lots, so each lot row borders one; runs of lots up to LANES.join cells apart share it), cut
 * where it would pass a place, an HQ, a home, a venue, the sea, the airport or kept ground; joined where it crosses a road and, when it
 * crosses none, by a connector from its nearer end to the nearest road or lane built so far (stopping at the first road it meets).
 * Returns { nodes: { id: [x, y] }, edges: [[a, b, kind, 'lane' | 'via']] }: 'lane' = the new streets and connectors; 'via' = an existing
 * edge re-chained through the junctions on it (the original edge stays — the bus lines and traffic name it; MapModel.build doesn't draw
 * the 'via' chain twice). Pure; ROADS takes them the first time anything reads it (addLanes below).
 */
MapModel.laneData = function (N = ROADS.nodes, E = ROADS.edges) {
  const L = LANES,
    nodes = {},
    edges = [],
    at = id => nodes[id] || N[id],
    r1 = v => Math.round(v * 10) / 10,
    segD = (p, a, b) => MapModel.segDist(p, a, b),
    // the roads the lanes join: every drawn road but the overpass; the lanes join this list as they are built
    roads = [],
    BK = 64, // a bucket grid of the roads (map units)
    bucket = new Map(),
    key = (i, j) => i * 100003 + j,
    index = r => {
      roads.push(r);
      const A = at(r.u),
        B = at(r.v),
        n = Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / (BK / 2)) + 1;
      for (let i = 0; i <= n; i++) {
        const k = key(Math.floor((A[0] + ((B[0] - A[0]) * i) / n) / BK), Math.floor((A[1] + ((B[1] - A[1]) * i) / n) / BK));
        if (!bucket.has(k)) bucket.set(k, new Set());
        bucket.get(k).add(r);
      }
    },
    /** The roads in the buckets within m cells of p. */
    around = (p, m, out = new Set()) => {
      const cx = Math.floor(p[0] / BK),
        cy = Math.floor(p[1] / BK);
      for (let i = cx - m; i <= cx + m; i++) for (let j = cy - m; j <= cy + m; j++) for (const q of bucket.get(key(i, j)) || []) out.add(q);
      return out;
    },
    /** Is a road within r of p? */
    near = (p, r) => {
      for (const q of around(p, Math.ceil(r / BK))) if (segD(p, at(q.u), at(q.v)) <= r) return true;
      return false;
    },
    /** The roads near segment a-b (its buckets and their neighbours). */
    along = (a, b) => {
      const out = new Set(),
        n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (BK / 2)) + 1;
      for (let i = 0; i <= n; i++) around([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n], 1, out);
      return out;
    },
    // places, HQs, homes: a lane keeps clear of the facility lot each may stand on (any heading: its far corner from the node)
    clearOf = fac => {
      const S = FACILITY[fac];
      return S ? Math.max(L.clear, (S.d + Math.hypot(S.w / 2, S.d / 2)) / MAP_UNIT_M + MapModel.facGap + 14 + 6) : L.clear;
    },
    places = [
      ...Object.entries(SPOTS)
        .filter(([, s]) => s.at)
        .map(([id, s]) => ({ at: s.at, r: clearOf(FACILITY_OF[id]) })),
      ...Object.values(HOME_AT).map(at => ({ at, r: clearOf(FACILITY_OF.home) })),
      ...CITY.hq.map((at, i) => ({ at, r: clearOf(FACILITY_OF.hq[i]) })),
      { at: CITY.ritual, r: L.clear },
      { at: CITY.airport, r: L.clear }
    ],
    venues = Object.values(VENUES),
    ok = p =>
      City.onLand(p) &&
      !MapModel.inAirport(p) &&
      !MapModel.kept(p) &&
      places.every(q => Math.hypot(q.at[0] - p[0], q.at[1] - p[1]) >= q.r) &&
      venues.every(v => Math.hypot(v.at[0] - p[0], v.at[1] - p[1]) >= v.clear + L.clear * 0.5),
    /** Segments a-b and c-d: the parameters (s along a-b, t along c-d) of their crossing, or null. */
    cross = (a, b, c, d) => {
      const rx = b[0] - a[0],
        ry = b[1] - a[1],
        sx = d[0] - c[0],
        sy = d[1] - c[1],
        den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-9) return null;
      const s = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den,
        t = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
      return s > 1e-6 && s < 1 - 1e-6 && t > 1e-6 && t < 1 - 1e-6 ? [s, t] : null;
    };
  for (const [u, v, kind] of E) if (kind !== 'overpass') index({ u, v, kind, base: true, cuts: [] });
  const far = (a, b) => a !== b && Math.hypot(at(a)[0] - at(b)[0], at(a)[1] - at(b)[1]) > 0.5; // (no zero-length edges)
  let n = 0;
  const node = p => {
    const id = `ln${n++}`;
    nodes[id] = [r1(p[0]), r1(p[1])];
    return id;
  };
  /** A junction at fraction t on road r (its end node near an end). */
  const cut = (r, t, p) => {
    const len = Math.hypot(at(r.v)[0] - at(r.u)[0], at(r.v)[1] - at(r.u)[1]);
    if (t * len < 2) return r.u;
    if ((1 - t) * len < 2) return r.v;
    const hit = r.cuts.find(c => Math.abs(c.t - t) * len < 2);
    if (hit) return hit.id;
    const id = node(p);
    r.cuts.push({ t, id });
    return id;
  };
  /** Build one lane through pts (a straight row, ≥ 3 points). */
  const lane = (pts, kind) => {
    const A = pts[0],
      B = pts[pts.length - 1],
      hits = []; // [s along the lane, junction id]
    for (const r of along(A, B)) {
      const x = cross(A, B, at(r.u), at(r.v));
      if (x) hits.push([x[0], cut(r, x[1], [A[0] + (B[0] - A[0]) * x[0], A[1] + (B[1] - A[1]) * x[0]])]);
    }
    let link = null;
    if (!hits.length) {
      // a connector from the nearer end to the nearest road / lane point (the buckets ring by ring)
      let best = null;
      for (let m = 1; m <= Math.ceil(L.reachMax / BK) + 1; m++) {
        for (const e of [A, B])
          for (const r of around(e, m)) {
            const U = at(r.u),
              V = at(r.v),
              dx = V[0] - U[0],
              dy = V[1] - U[1],
              t = clamp(((e[0] - U[0]) * dx + (e[1] - U[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1),
              q = [U[0] + t * dx, U[1] + t * dy],
              dd = Math.hypot(e[0] - q[0], e[1] - q[1]);
            if (!best || dd < best.dd - 1e-9) best = { dd, r, t, q, e };
          }
        if (best && best.dd <= (m - 1) * BK) break; // (nothing in a further ring can be nearer)
      }
      if (!best || best.dd > L.reachMax) return false;
      let stop = { s: 1, r: best.r, t: best.t };
      for (const r of along(best.e, best.q)) {
        if (r === best.r) continue;
        const x = cross(best.e, best.q, at(r.u), at(r.v));
        if (x && x[0] < stop.s) stop = { s: x[0], r, t: x[1] };
      }
      link = { e: best.e, q: [best.e[0] + (best.q[0] - best.e[0]) * stop.s, best.e[1] + (best.q[1] - best.e[1]) * stop.s], stop };
    }
    const ia = node(A),
      ib = node(B),
      chain = [[0, ia], ...hits.sort((p, q) => p[0] - q[0]), [1, ib]];
    if (link) {
      const j = cut(link.stop.r, link.stop.t, link.q),
        from = link.e === A ? ia : ib;
      if (far(from, j)) {
        edges.push([from, j, kind, 'lane']);
        index({ u: from, v: j, kind, base: false, cuts: [] });
      } else chain[from === ia ? 0 : chain.length - 1][1] = j; // (the end stands on that road: it is the junction)
    }
    // points within half a unit are one node (a lane end on a junction: the junction)
    const ids = [];
    for (const [, id] of chain) {
      const last = ids[ids.length - 1];
      if (last === undefined || far(last, id)) ids.push(id);
      else if (last === ia || last === ib) ids[ids.length - 1] = id;
    }
    for (const id of [ia, ib]) if (!ids.includes(id) && !edges.some(e => e[0] === id || e[1] === id)) delete nodes[id];
    for (let i = 1; i < ids.length; i++) {
      edges.push([ids[i - 1], ids[i], kind, 'lane']);
      index({ u: ids[i - 1], v: ids[i], kind, base: false, cuts: [] });
    }
    return true;
  };
  DISTRICTS.forEach(d => {
    const poly = MapModel.districtPoly(d),
      xs = poly.map(q => q[0]),
      ys = poly.map(q => q[1]),
      box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      c = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2],
      R = Math.max(box[2] - box[0], box[3] - box[1]) / 2,
      // the lot grid's frame (as MapModel.lots: along the road nearest the middle)
      base = roads.filter(r => r.base),
      nr = base.reduce((m, r) => (segD(c, at(r.u), at(r.v)) < segD(c, at(m.u), at(m.v)) ? r : m), base[0]),
      th = Math.atan2(at(nr.v)[1] - at(nr.u)[1], at(nr.v)[0] - at(nr.u)[0]),
      ux = Math.cos(th),
      uy = Math.sin(th),
      g = d.gap,
      k = Math.ceil(R / g) + 1,
      P = (gi, gj) => [c[0] + ux * gi * g - uy * gj * g, c[1] + uy * gi * g + ux * gj * g],
      kind = L.kind[d.beach ? 'beach' : d.region] || 'street',
      thin = d.density * MapModel.thin * (MAJORS.includes(d.region) ? MapModel.thinMajor : 1),
      big = (d.size * 1.15 * 1.3) / 2,
      rows = new Map(); // lane row → the grid columns of the isolated lots beside it
    for (let gj = -k; gj <= k; gj++)
      for (let gi = -k; gi <= k; gi++) {
        const p = P(gi, gj);
        if (p[0] < box[0] || p[0] > box[2] || p[1] < box[1] || p[1] > box[3] || near(p, L.reach + big)) continue;
        if (!inPoly(p, poly) || !!MapModel.onSand(p) !== !!d.beach) continue;
        const id = `${d.id}|${gi}|${gj}`,
          w = MapModel.wealth(d.region, p, id, d.id);
        if (hstr(id) >= thin * (1.15 - 0.45 * w)) continue;
        if (City.regionAt(p) !== d.region || !City.onLand(p) || MapModel.kept(p) || MapModel.inAirport(p)) continue;
        const m = ((gj % L.every) + L.every) % L.every,
          row = m === 0 ? gj : m <= L.every / 2 ? gj - m : gj + (L.every - m);
        if (!rows.has(row)) rows.set(row, []);
        rows.get(row).push(gi);
      }
    for (const [row, cols] of [...rows.entries()].sort((p, q) => p[0] - q[0])) {
      cols.sort((p, q) => p - q);
      const runs = [];
      for (const gi of cols) {
        const last = runs[runs.length - 1];
        if (last && gi - last[1] <= L.join) last[1] = gi;
        else runs.push([gi, gi]);
      }
      for (const [g0, g1] of runs) {
        let piece = [];
        const flush = () => {
          if (piece.length >= 3) lane(piece, kind);
          piece = [];
        };
        for (let s = g0 - 0.5; s <= g1 + 0.5 + 1e-9; s += 0.5) {
          const p = P(s, row);
          if (ok(p) && inPoly(p, poly) && City.regionAt(p) === d.region) piece.push(p);
          else flush();
        }
        flush();
      }
    }
  });
  // the junctions cut into roads: a base edge re-chained through them ('via'); a lane cut later is replaced by its pieces
  for (const r of roads) {
    if (!r.cuts.length) continue;
    const ids = [r.u, ...r.cuts.sort((p, q) => p.t - q.t).map(c => c.id), r.v];
    if (!r.base) {
      const i0 = edges.findIndex(e => e[3] === 'lane' && ((e[0] === r.u && e[1] === r.v) || (e[0] === r.v && e[1] === r.u)));
      if (i0 >= 0) edges.splice(i0, 1);
    }
    for (let i = 1; i < ids.length; i++) if (far(ids[i - 1], ids[i])) edges.push([ids[i - 1], ids[i], r.kind, r.base ? 'via' : 'lane']);
  }
  return { nodes, edges };
};
/**
 * ROADS takes the lanes the first time anything reads it (run-independent, built once; nothing reads ROADS while the scripts load):
 * `nodes` / `edges` become getters over the same objects, so every reader — City's routes, MapModel's land, lots, nature — sees them.
 */
(function addLanes() {
  const N0 = ROADS.nodes,
    E0 = ROADS.edges;
  let done = false;
  const fill = () => {
    if (done) return;
    done = true;
    const L = MapModel.laneData(N0, E0);
    Object.assign(N0, L.nodes);
    E0.push(...L.edges);
  };
  Object.defineProperty(ROADS, 'nodes', { get: () => (fill(), N0), enumerable: true });
  Object.defineProperty(ROADS, 'edges', { get: () => (fill(), E0), enumerable: true });
})();
