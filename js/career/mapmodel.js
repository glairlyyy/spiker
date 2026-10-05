// The island map as plain data: what a renderer draws, with no drawing in it (DOM-free, tested headless).
// MapModel.build(run, sel) → { w, h, land, hexes, pins, you, fog, flag, focus, sel, life }. Map units: CITY.w × CITY.h,
// y down. A renderer (MapView: js/ui/map-view.js → js/map3d/map3d.mjs) draws a model and reports two things
// back: a pin picked (its id) and a map point clicked ([x, y] in map units). All game rules stay in City / Front.

const MapModel = {
  /** What you know of: explored places, your home, your club's HQ, this week's battle. */
  known: (run, id, p) => id === 'home' || id === `hq${run.team}` || id === 'clash' || City.seen(run, p),
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
    for (const m of MapModel.landmarks(run)) put(m.at, 30, { c: m.at, r: 30 });
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
          if (o.c) return Math.hypot(p[0] - o.c[0], p[1] - o.c[1]) < o.r;
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
    for (const [a, b, kind] of ROADS.edges) {
      if (kind !== 'main') continue;
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
                  ? forest.length && forest[Math.floor(hstr(id) * forest.length)].at
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
      roads: ROADS.edges.map(([a, b, kind]) => ({ kind, pts: [ROADS.nodes[a].slice(), ROADS.nodes[b].slice()] })),
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
  /** Every place and club HQ with its landmark kind (LANDMARK): [{ id, at, kind, region }]. Your home sits where your housing is. */
  landmarks: run => [
    ...Object.keys(SPOTS).map(id => ({ id, at: City.at(run, id), kind: LANDMARK[id], region: City.region(run, id) })),
    ...CITY.hq.map((at, i) => ({ id: `hq${i}`, at, kind: LANDMARK.hq, region: FACTIONS[i].region })),
    ...Object.entries(VENUES).map(([id, v]) => ({ id: `venue:${id}`, at: v.at, kind: v.kind, region: v.region })),
    { id: 'ritual', at: CITY.ritual, kind: 'ritual', region: 'open' }, // the old ritual ground: no pin, no label
    { id: 'airport', at: CITY.airport, kind: 'airport', region: 'wu', rot: AIRPORT.yaw } // on a fixed heading (spec §4.18d)
  ],
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
        places.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= MapModel.placeClear) &&
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
          kind: d.kinds[Math.floor(hstr(`${id}|k`) * d.kinds.length)],
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
    outer: for (const [ua, ub, kind] of ROADS.edges) {
      if (kind === 'path' || kind === 'overpass' || kind === 'boardwalk') continue;
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
  /** Lots stay this far (map units) from a place or HQ: a landmark is up to ~38 units wide (a court), so ~20 clears its footprint. */
  placeClear: 20,
  /** Most settlement lots on the island. */
  maxLots: 1400,
  /** Every district's and road row's density × this (owner, 2026-10-03: a thinner town). */
  thin: 0.65,
  /** Extra thinning for the majors' land on the scaled island (MAP_SCALE): their towns gained room, the count stays ~the same. */
  thinMajor: 0.8,
  /**
   * Pins: places, club HQs and this week's battle. flags: off (no time left for it), far (2+ day trip), turf,
   * hq, can (a club you can sign with), mine (your club), clash, today (a venue where your match is this week; venues are always known).
   */
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
        icon: s.icon,
        badge: mates || '',
        title: `${s.name}${s.train ? ` — ${TRAININGS[s.train].name} training` : ''}`,
        flags: {
          off: !!City.noTime(run, City.cost(run, id)),
          far: City.trip(run, at) >= 2,
          turf: !!(s.train && City.turf(run, id))
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
        icon: '⚔',
        badge: '',
        title: `Street battle: ${REGIONS[c.a].name} vs ${REGIONS[c.b].name}`,
        flags: { clash: true }
      });
    return out;
  },
  /**
   * Who is where this week (display only: no randoms, positions come from hashes of ids + place, so the same run state gives
   * the same model). mates: your floor mates at the explored place of their training key nearest home. crews: each known
   * faction club's drilling squad at its HQ (n figures by pool size; known = scouted or yours, else grey silhouettes; walk = its
   * region's explored places). battle: this week's open street battle. patrols: MapModel.patrols.
   */
  life(run) {
    const home = City.at(run, 'home'),
      dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
      mineColor = Run.myTeam(run).color,
      people = Run.mates(run),
      mates = [];
    for (const [key, ids] of Object.entries(run.floor || {})) {
      const spots = City.spotsFor(key)
        .filter(id => MapModel.known(run, id, City.at(run, id)))
        .sort((a, b) => dist(City.at(run, a), home) - dist(City.at(run, b), home));
      if (!spots.length) continue;
      for (const id of ids) {
        const p = people.find(q => q.id === id),
          c = City.at(run, spots[0]),
          ang = hstr(`${id}|${spots[0]}|a`) * Math.PI * 2,
          rad = 14 + hstr(`${id}|${spots[0]}|r`) * 14;
        mates.push({
          id,
          name: p ? p.name : String(id),
          at: [c[0] + Math.cos(ang) * rad, c[1] + Math.sin(ang) * rad],
          color: mineColor,
          spot: spots[0]
        });
      }
    }
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
      mates,
      crews,
      battle: c ? { at: c.at, a: c.a, b: c.b, colors: [REGIONS[c.a].color, REGIONS[c.b].color] } : null,
      patrols: MapModel.patrols(run),
      traffic: MapModel.traffic()
    };
  },
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
  /**
   * The hex territory (spec §4.27, Hex): { size, tiles: [{ id, at, own, major, color, kind, frontier, p, by, cost, text }], target }
   * — every land tile with its holder (major: held by one of MAJORS); frontier = touches another major's tile; p / by / cost / text only on tiles under
   * pressure; target = this week's battle tile { id, color (raider), text 'Wu 0/2' }. Display only.
   */
  hexes(run) {
    const H = Hex.state(run),
      c = Fight.clashSite(run),
      major = r => MAJORS.includes(r),
      short = r => REGIONS[r].name.split(' ')[0],
      k = c ? Front.stakes(run, c.a, c.b) : null;
    return {
      size: HEX.size,
      target: c ? { id: c.tile, color: REGIONS[c.a].color, text: `${short(c.a)} ${k.tile === c.tile ? k.meter - 1 : 0}/${k.cost}` } : null,
      tiles: Hex.grid().tiles.map(t => {
        const own = Hex.owner(run, t.id),
          p = H.p[t.id] || 0;
        return {
          id: t.id,
          at: t.at,
          own,
          major: major(own),
          color: REGIONS[own].color,
          kind: t.kind,
          frontier: major(own) && Hex.near(t.id).some(n => major(Hex.owner(run, n.id)) && Hex.owner(run, n.id) !== own),
          ...(p
            ? {
                p,
                by: H.by[t.id],
                cost: Hex.cost(run, t.id, H.by[t.id]),
                text: `${short(H.by[t.id])} ${p}/${Hex.cost(run, t.id, H.by[t.id])}`
              }
            : {})
        };
      })
    };
  },
  /**
   * Patrols on the hot hex frontier (spec §4.27): this week's battle tile and every tile under pressure (at most 3 fronts:
   * the battle first, then most pressure, then a hash). The holder guards the tile (2), the pusher stands on its own frontier
   * tile next to it, thicker with pressure (2–4). Figures [{ id, tile, at, face, color }]: at = on the tile's side facing the
   * other tile (hash jitter), face = the other tile's centre. Display only, no randoms.
   */
  patrols(run) {
    const H = Hex.state(run),
      c = Fight.clashSite(run),
      hot = Object.keys(H.p)
        .filter(id => H.p[id] > 0 && H.by[id])
        .map(id => ({ id, by: H.by[id], p: H.p[id] }));
    if (c && !hot.some(h => h.id === c.tile)) hot.push({ id: c.tile, by: c.a, p: 0 });
    const first = h => (c && h.id === c.tile ? 0 : 1);
    hot.sort((x, y) => first(x) - first(y) || y.p - x.p || hstr(x.id) - hstr(y.id));
    const out = [],
      seen = new Set(),
      add = (t, r, n, face) => {
        for (let i = 0; i < n; i++) {
          const id = `${t.id}|${r}|${i}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const a = hstr(`${id}|a`) * Math.PI * 2,
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
    for (const h of hot.slice(0, 3)) {
      if (!Hex.frontier(run, h.id)) continue;
      const t = Hex.tile(h.id),
        from = Hex.near(h.id).find(n => Hex.owner(run, n.id) === h.by && Hex.frontier(run, n.id)),
        n = 2 + Math.min(2, Math.floor((2 * h.p) / Hex.cost(run, h.id, h.by)));
      add(t, Hex.owner(run, h.id), 2, from ? from.at : t.at);
      if (from) add(from, h.by, n, t.at);
    }
    return out;
  },
  build(run, sel = null) {
    return {
      w: CITY.w,
      h: CITY.h,
      land: MapModel.land(run),
      hexes: MapModel.hexes(run),
      pins: MapModel.pins(run),
      you: { at: City.pos(run), title: `You are in ${REGIONS[City.loc(run)].name}` },
      // the dark map lifts only round you and your home (owner, 2026-10-03); what you've explored stays known (pins) but dark
      fog: { points: [City.pos(run), City.at(run, 'home')], r: REVEAL_R },
      flag: MapModel.ptOf(sel),
      focus: City.at(run, 'home'), // where a fresh view centres
      sel,
      life: MapModel.life(run),
      figures: MapModel.figures(run),
      fence: City.fence(run) ? { at: [CITY.park.x, CITY.park.y], r: 170 } : null // Story week 1: the camera keeps to the campus
    };
  },
  /**
   * People drawn as full models on the map (spec §10.10a, §4.29): Kaede by the student flat's door (Story mode), and every named
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
