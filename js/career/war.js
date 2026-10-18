// The faction war (spec §4.34): war units (WAR.units) with Strength 0–100, worn down by street battles on their border and
// rallying when left alone; their stage (WAR_STAGES) debuffs every squad of the unit in a match. Territory never moves
// tile by tile: each hex tile starts in one unit (Hex.grid t.unit) and only a destroyed unit's land changes hands (to its
// destroyer: War.holder). Run state: run.war = { str: { unit: n }, fallen: { unit: { by, week } }, last: { unit: week of
// its last street battle }, ot: { unit: week of its last overthrow match } }. DOM-free, no randoms.

const War = {
  ids: () => Object.keys(WAR.units),
  /** The unit club ti plays for (null for the minors). */
  ofClub: ti => War.ids().find(u => WAR.units[u].clubs.includes(ti)) || null,
  /** Region r's units (start order). */
  ofRegion: r => War.ids().filter(u => WAR.units[u].region === r),
  fresh: () => ({ str: Object.fromEntries(War.ids().map(u => [u, WAR.start])), fallen: {}, last: {}, ot: {} }),
  state(run) {
    const W = run.war || (run.war = War.fresh());
    for (const k of ['str', 'fallen', 'last', 'ot']) if (!W[k] || typeof W[k] !== 'object') W[k] = k === 'str' ? War.fresh().str : {};
    return W;
  },
  str: (run, u) => {
    const s = War.state(run).str[u];
    return Number.isFinite(s) ? s : WAR.start;
  },
  fallen: (run, u) => !!War.state(run).fallen[u],
  alive: (run, u) => !!WAR.units[u] && !War.fallen(run, u),
  /** Stage index (WAR_STAGES: 0 Steady … 3 Broken) for a Strength. */
  level: s => WAR_STAGES.reduce((k, S, i) => (s < S.below ? i : k), 0),
  /** A unit's own stage (what the cards and the border show). */
  stage: (run, u) => (War.alive(run, u) ? War.level(War.str(run, u)) : 0),
  /**
   * The stage a unit's squads play with (spec §4.34): its own, `late` stages late (Shu); an inner ring also takes its outer
   * ring's stage one step lighter while that stands (Iron Shaken → Gold Strained).
   */
  weak(run, u) {
    if (!War.alive(run, u)) return 0;
    const D = WAR.units[u];
    let k = War.stage(run, u) - (D.late || 0);
    if (D.inner && War.alive(run, D.inner)) k = Math.max(k, War.weak(run, D.inner) - 1);
    return Math.max(0, k);
  },
  /**
   * The war stage a squad plays with (spec §4.34): its club's unit, a street crew's unit (T.wu), a region's drawn squad (T.wr:
   * its least-hit standing unit); 0 for the Academy, the minors and hired crews.
   */
  weakOf(run, T) {
    if (!T) return 0;
    if (T.wu) return War.weak(run, T.wu);
    const u = War.ofClub(T.i);
    if (u) return War.weak(run, u);
    const us = T.wr ? War.ofRegion(T.wr).filter(x => War.alive(run, x)) : [];
    return us.length ? Math.min(...us.map(x => War.weak(run, x))) : 0;
  },
  /** A career fixture's setup: both sides' war stages into the match (weakSet: morale start, HP heal, card slots). */
  match(run, m) {
    weakSet(m, [War.weakOf(run, m.t[0]), War.weakOf(run, m.t[1])]);
  },
  /** The unit holding what u started with: u itself, or (destroyed) its destroyer's holder. */
  holder(run, u) {
    const F = War.state(run).fallen;
    for (let i = 0; i < 8 && F[u]; i++) u = F[u].by;
    return u;
  },
  /** The unit holding tile id now (null: the minors and the Academy). */
  unitAt(run, id) {
    const t = Hex.tile(id);
    return t && t.unit ? War.holder(run, t.unit) : null;
  },
  /** The region holding tile id now (its holder unit's, else its own). */
  regionAt(run, id) {
    const u = War.unitAt(run, id);
    return u ? WAR.units[u].region : Hex.tile(id).region;
  },
  /**
   * The border edges between two units' land: [{ tile (b's), from (a's) }], both tiles' centres on land, a hash order
   * (stable). Different regions only: Gold and Iron are one faction.
   */
  edges(run, a, b) {
    const out = [];
    if (!War.alive(run, a) || !War.alive(run, b) || WAR.units[a].region === WAR.units[b].region) return out;
    for (const t of Hex.grid().tiles) {
      if (War.unitAt(run, t.id) !== b || !City.onLand(t.at)) continue;
      for (const n of Hex.near(t.id)) if (War.unitAt(run, n.id) === a && City.onLand(n.at)) out.push({ tile: t.id, from: n.id });
    }
    return out.sort((x, y) => hstr(`${x.tile}|${x.from}`) - hstr(`${y.tile}|${y.from}`));
  },
  /** The unit pairs [ua (region att), ud (region def)] whose land touches. */
  pairs(run, att, def) {
    const out = [];
    for (const ua of War.ofRegion(att)) for (const ud of War.ofRegion(def)) if (War.edges(run, ua, ud).length) out.push([ua, ud]);
    return out;
  },
  /** Region r's Strength for its economy: the mean of its standing units (100 when none stands). */
  regionStr(run, r) {
    const us = War.ofRegion(r).filter(u => War.alive(run, u));
    return us.length ? us.reduce((s, u) => s + War.str(run, u), 0) / us.length : WAR.start;
  },
  /**
   * A street-battle result for unit u: won → +WAR.win × k, lost → −WAR.lose × k × its soak (Shu × 0.5); Strength stays in
   * 0–100 and the unit counts as fought this week. k = 2 for your Raid (T-318). A new stage makes the news. Returns the change.
   */
  hit(run, u, win, k = 1) {
    if (!War.alive(run, u)) return 0;
    const W = War.state(run),
      s0 = War.str(run, u),
      d = win ? WAR.win * k : -WAR.lose * k * (WAR.units[u].soak || 1);
    W.str[u] = clamp(Math.round(s0 + d), 0, 100);
    W.last[u] = run.week;
    const a = War.level(s0),
      b = War.level(W.str[u]);
    if (b > a) Run.news(run, `${WAR.units[u].name} is ${WAR_STAGES[b].name.toLowerCase()} — Strength ${W.str[u]}.`);
    return W.str[u] - s0;
  },
  /** Week end: a standing unit nobody fought for WAR.idle weeks rallies +WAR.regen. */
  week(run) {
    const W = War.state(run);
    for (const u of War.ids())
      if (War.alive(run, u) && run.week - (W.last[u] || 0) >= WAR.idle) W.str[u] = Math.min(100, War.str(run, u) + WAR.regen);
  },
  /** run.own = { placeId: holder region } for every place whose tile's holder is not the place's own region (Front.owner reads it). */
  sync(run) {
    const own = {};
    for (const t of Hex.grid().tiles)
      for (const id of t.spots) {
        const r = War.regionAt(run, t.id);
        if (!id.startsWith('venue:') && r !== SPOTS[id].region) own[id] = r;
      }
    run.own = own;
  }
};
