// Encounters on the road (spec §4.37 3, T-333) and the second route (§4.37 4, T-335). DOM-free; no R() — every roll is a hash of
// the run seed, the week and the day. A trip (City.last: from, to, the day it began) that passes near someone who matters stops
// once: the person of an open arc beat, a circle member, the week's street battle, a rival club's crew (ENC.rank). The setting
// (Encounter.pref: friends · everything · never) says which kinds may stop you; a short cut you picked (City.alt) stops for what it
// passes even under "friends". State: `run.enc` = { w (Season.wk), n (stops this week), met: { key: w } }, made lazily.
// Who stands where comes from MapModel.lifePeople (Agent L, T-331) when it exists, else today's floor, your circle's plans,
// the clubs' HQs and the battle site.

const Encounter = {
  /** A candidate key that always stops you, on any road (the UI smoke and QA only; null in play). */
  force: null,
  /** The road-stop setting: 'friends' (default) · 'all' · 'never'. */
  pref: () => (ENC.stops[store.get(KEYS.enc)] ? store.get(KEYS.enc) : 'friends'),
  setPref: v => ENC.stops[v] && store.set(KEYS.enc, v),
  /** The focus press (§4.37 4) on unless switched off. */
  focusOn: () => store.get(KEYS.focus) !== 'off',
  setFocus: on => store.set(KEYS.focus, on ? 'on' : 'off'),
  /** This week's state (reset when the week changes). */
  of(run) {
    const w = Season.wk(run);
    if (!run.enc || run.enc.w !== w) run.enc = { w, n: 0, met: {} };
    return run.enc;
  },
  /** The hash of a stop: run seed + week + the trip's day + who. */
  roll: (run, day, key) => hstr(`enc|${run.pseed}|${Season.wk(run)}|${day}|${key}`),
  /** People on the map today: [{ id, at, act, spot }] — MapModel.lifePeople (T-331) or the fallback (the floor, your circle's plans). */
  people(run) {
    if (typeof MapModel.lifePeople === 'function') return MapModel.lifePeople(run);
    const out = MapModel.life(run).mates.map(m => ({ id: m.id, at: m.at, act: 'train', spot: m.spot })),
      have = new Set(out.map(m => m.id));
    for (const id of [...Circle.of(run), ...Team.open(run).map(A => A.id)]) {
      const me = run.people && run.people[id],
        P = me && me.plan,
        at = P && P.at && SPOTS[P.at] ? City.at(run, P.at) : null;
      if (have.has(id) || !at || !MapModel.known(run, P.at, at)) continue;
      have.add(id);
      const a = hstr(`${id}|${P.at}|a`) * Math.PI * 2,
        r = 14 + hstr(`${id}|${P.at}|r`) * 14;
      out.push({ id, at: [at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r], act: P.act, spot: P.at });
    }
    return out;
  },
  /**
   * Everyone who could stop you today: [{ kind, key, at, id?, ti?, act?, spot? }] — arc (an open beat's person), circle, battle
   * (the open street battle), crew (each known rival club's squad at its HQ). A person with an open beat is an arc, not a circle.
   */
  near(run) {
    const out = [],
      arcs = new Set(Team.open(run).map(A => String(A.id))),
      circle = new Set(Circle.of(run).map(String));
    for (const p of Encounter.people(run)) {
      const id = String(p.id),
        kind = arcs.has(id) ? 'arc' : circle.has(id) ? 'circle' : null;
      if (kind && People.find(run, p.id)) out.push({ kind, key: `${kind}:${id}`, id: p.id, at: p.at, act: p.act, spot: p.spot });
    }
    const c = Fight.clashSite(run);
    if (c) out.push({ kind: 'battle', key: 'battle', at: c.at, a: c.a, b: c.b, name: c.name });
    run.teams.forEach((t, i) => {
      if (i === run.team || !FACTIONS[i] || !MapModel.known(run, `hq${i}`, CITY.hq[i]) || !Fight.worth(run, i)) return;
      out.push({ kind: 'crew', key: `crew:${i}`, ti: i, at: CITY.hq[i], region: FACTIONS[i].region });
    });
    return out;
  },
  /** Closest point of polyline pts to p: { d, s (path length to it), at, len (the whole path) }. */
  dist(pts, p) {
    let best = { d: Infinity, s: 0, at: pts[0] },
      acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1],
        [bx, by] = pts[i],
        dx = bx - ax,
        dy = by - ay,
        L2 = dx * dx + dy * dy,
        L = Math.sqrt(L2),
        t = L2 ? clamp(((p[0] - ax) * dx + (p[1] - ay) * dy) / L2, 0, 1) : 0,
        q = [ax + dx * t, ay + dy * t],
        d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < best.d) best = { d, s: acc + L * t, at: q };
      acc += L;
    }
    best.len = acc;
    return best;
  },
  /** Why no stop can happen now ('' if one can): an event open, a cup or match week. */
  off(run) {
    if (run.event) return 'event';
    if (Run.cupDef(run) || Run.weekType(run) === 'cup' || Run.weekType(run) === 'eval') return 'match week';
    return '';
  },
  /**
   * The stop on this trip, or null (pure: nothing is written — Encounter.open marks it). trip = { from, to, day, pts? } (City.last;
   * pts default the road City.route walks); opts.stop = the setting (default Encounter.pref()), opts.via = the key the short cut
   * passes (it may stop you under any setting but never; chance ENC.alt.p). At most one: the first kind by ENC.rank whose hash passes.
   * Returns { kind, key, at (where they stand), stop (the road point the walk halts at), s, id?, ti?, a?, b?, act?, spot? }.
   */
  on(run, trip, opts = {}) {
    if (!trip || Encounter.off(run)) return null;
    const stop = opts.stop || Encounter.pref(),
      kinds = ENC.stops[stop] || ENC.stops.friends,
      S = Encounter.of(run),
      pts = trip.pts || City.route(trip.from, trip.to),
      len = Encounter.dist(pts, pts[0]).len;
    if (stop === 'never' || S.n >= ENC.week || len < 2 * ENC.min) return null;
    const hits = [];
    for (const c of Encounter.near(run)) {
      const via = opts.via && c.key === opts.via,
        forced = Encounter.force && c.key === Encounter.force;
      if (!forced && ((!via && !kinds.includes(c.kind)) || S.met[c.key] === S.w)) continue;
      let D = Encounter.dist(pts, c.at);
      if (forced && (D.d > ENC.r || D.s < ENC.min || D.s > len - ENC.min)) D = { ...Encounter.along(pts, len / 2), d: 0 };
      if (D.d > ENC.r || D.s < ENC.min || D.s > len - ENC.min) continue;
      if (!forced && Encounter.roll(run, trip.day, c.key) >= (via ? ENC.alt.p : ENC.p[c.kind])) continue;
      hits.push({ ...c, stop: D.at.map(v => Math.round(v * 10) / 10), s: D.s, via: !!via });
    }
    hits.sort((a, b) => ENC.rank.indexOf(a.kind) - ENC.rank.indexOf(b.kind) || a.s - b.s);
    return hits[0] || null;
  },
  /** The point s along polyline pts: { s, at }. */
  along(pts, s) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + L >= s) {
        const t = L ? (s - acc) / L : 0;
        return { s, at: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t] };
      }
      acc += L;
    }
    return { s: acc, at: pts[pts.length - 1].slice() };
  },
  /** The stop is shown: it counts (once a week per person / crew / battle; ENC.week a week). */
  open(run, E) {
    const S = Encounter.of(run);
    S.n++;
    S.met[E.key] = S.w;
  },
  /** Who it is, for the card: the person (null for a crew or the battle). */
  person: (run, E) => (E.id != null ? People.find(run, E.id) : null),
  /**
   * Answer a stop. what: 'talk' (a circle member or an arc's person: `met_road` → { line, bond }), 'walk' (nothing: walking on costs
   * nothing → {}), 'challenge' (a crew: Fight.offer at no stake → { fx } to play, or { line } when they refuse — that spends the trip
   * there and a day, as at their HQ), 'join' (the battle, side = a region: { fx } = Fight.clash, null when you can't), 'help' / 'refuse'
   * (an arc's open beat: Team.answer). Returns null when the answer doesn't apply.
   */
  answer(run, E, what, side) {
    if (what === 'walk') return {};
    if (what === 'talk' && E.id != null) {
      const bond = Rel.add(run, E.id, 'met_road'),
        line = Rel.text(run, E.id, { k: 'met_road', w: run.week });
      Run.log(run, `${line}${bond ? ` (${fmtDelta(bond)} bond)` : ''}`);
      return { line, bond };
    }
    if (what === 'challenge' && E.kind === 'crew') {
      const r = Fight.offer(run, E.ti, 0);
      if (!r) return null;
      if (!r.accepted) {
        Run.log(run, r.line);
        return { line: r.line };
      }
      const fx = Fight.challenge(run, E.ti, r.stake);
      return fx ? { fx } : null;
    }
    if (what === 'join' && E.kind === 'battle') {
      const fx = Fight.clash(run, side);
      return fx ? { fx } : null;
    }
    if ((what === 'help' || what === 'refuse') && E.kind === 'arc') return Team.answer(run, String(E.id), what === 'help');
    return null;
  },
  /**
   * Places a short cut may pass (City.alt): the open street battle (the hot border; not while you can't fight) and your circle's
   * places today. [{ kind: 'battle' | 'circle', key, at, id? }]. None under the "never" setting.
   */
  vias(run) {
    if (Encounter.pref() === 'never' || Encounter.off(run)) return [];
    return Encounter.near(run).filter(c => (c.kind === 'battle' && !Fight.ban(run)) || c.kind === 'circle');
  }
};
