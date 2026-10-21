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
    if (what === 'talk' && E.id != null) return Encounter.talk(run, E.id);
    if (what === 'invite' && E.id != null) return Encounter.invite(run, E.id);
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
    if (what === 'here' && E.kind === 'crew') return Encounter.spotChallenge(run, E); // on the spot, with the drone (spec §4.38)
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
  },

  // ---- the figure menu (spec §4.37 7, T-340): anyone you see — Talk · Invite · Spar · Challenge · Card, each with its lock -------
  // State in `run.enc` (this week's, lazily): talk / ask = { id: the day (Encounter.today) }, inv = the id joining your next order.
  /** Today: the week and the day of it (Talk and Invite are once a day per person). */
  today: run => `${Season.wk(run)}|${WEEK_DAYS - City.days(run)}`,
  /** Why the menu can't open now ('' if it can): an event open, a cup / evaluation week. */
  menuOff(run) {
    const o = Encounter.off(run);
    return o === 'event' ? 'answer the event first' : o ? 'not in a match week' : '';
  },
  /** A named person on the map: { id, p (the NPC), t (their squad), home, at, act, spot, g } — null if not shown (fog) or gone. */
  who(run, id) {
    const f = Encounter.people(run).find(q => String(q.id) === String(id)),
      e = f && f.g !== 'grey' && People.homes(run).get(f.id);
    return e && !e.p.gone ? { ...f, id: f.id, p: e.p, t: e.t, home: e.home } : null;
  },
  /** Their headline behaviour, as the line tables key it ('other' when none). */
  beh(run, id) {
    const b = Team.beh(run, id);
    return b && ENC_HI[b] ? b : 'other';
  },
  /** A line from table L (by behaviour) for id, picked by a hash of `salt` and today. */
  say: (run, L, id, salt) => {
    const A = L[Encounter.beh(run, id)] || L.other;
    return A[Math.floor(hstr(`${salt}|${id}|${Encounter.today(run)}`) * A.length)];
  },
  /** Why you can't walk over to map point p now ('' if you can): the trip days, the week-1 fence. */
  walkWhy: (run, p) => (City.outside(run, p) ? City.fence(run) : City.noTime(run, City.trip(run, p))),
  /** Their chance to say yes to an Invite (0–1): by behaviour (ENC.invite.p), more with bond. */
  inviteP(run, id) {
    const I = ENC.invite;
    return clamp((I.p[Encounter.beh(run, id)] || I.p.other) + (Rel.bondOf(run, id) - I.bond) * I.perBond, 0, I.max);
  },
  /** The courts you know (explored court landmarks and the venues): [{ id, at, name }]. */
  courts: run =>
    MapModel.landmarks(run)
      .filter(l => (l.kind === 'court' && MapModel.known(run, l.id, l.at)) || String(l.id).startsWith('venue:'))
      .map(l => ({
        id: l.id,
        at: l.at,
        name: SPOTS[l.id] ? SPOTS[l.id].name : VENUES[String(l.id).slice(6)] ? VENUES[String(l.id).slice(6)].name : 'the court'
      })),
  /** The court nearest map point p within ENC.spar.r, or null (with the drone a field will do: Encounter.fieldNear). */
  court(run, p) {
    let best = null;
    for (const c of Encounter.courts(run)) {
      const d = Math.hypot(c.at[0] - p[0], c.at[1] - p[1]);
      if (d <= ENC.spar.r && (!best || d < best.d)) best = { ...c, d };
    }
    return best;
  },
  /** Their club's index in run.teams (a faction club), else -1 (the Academy squad, a street or reserve crew). */
  club: (run, W) => (W && W.t ? run.teams.indexOf(W.t) : -1),
  /**
   * The menu for person id: [{ k, days, why ('' = open), … }] in order talk · invite · spar · challenge · card — Invite adds p and
   * verdict, Spar its court, Challenge ti / stake / verdict / accepts' why. `road`: you are already beside them (a road stop: no walk).
   * Pure, no draws. Null when they aren't on the map.
   */
  menu(run, id, road = false, stake = 0) {
    const W = Encounter.who(run, id);
    if (!W) return null;
    const S = Encounter.of(run),
      now = Encounter.today(run),
      off = Encounter.menuOff(run),
      walk = road ? 0 : City.trip(run, W.at),
      wwhy = off || (road ? '' : Encounter.walkWhy(run, W.at)),
      bond = Rel.bondOf(run, id),
      first = Team.first(W.p),
      key = String(id);
    const talk = { k: 'talk', days: walk, why: wwhy || ((S.talk || {})[key] === now ? 'talked today' : '') };
    const P = Encounter.inviteP(run, id),
      invite = {
        k: 'invite',
        days: walk,
        p: P,
        verdict: P >= ENC.invite.likely ? 'likely' : P >= ENC.invite.doubt ? 'doubtful' : 'unlikely',
        why:
          off ||
          (W.act === 'out' || (run.people[id] && run.people[id].inj > 0) ? 'injured — out this week' : '') ||
          (bond < ENC.invite.bond ? `won’t train with you — bond ${bond}, needs ${ENC.invite.bond}` : '') ||
          (S.inv != null && String(S.inv) === key ? `${first} joins your next order` : '') ||
          (S.inv != null ? 'someone else joins your next order' : '') ||
          ((S.ask || {})[key] === now ? 'asked today' : '') ||
          wwhy
      };
    const side = Fight.challengeSide(run),
      C = Encounter.court(run, W.at) || (City.drone(run) ? Encounter.fieldNear(run, W.at) : null), // a court, else the drone's field (§4.38)
      mineT = side.T,
      spar = {
        k: 'spar',
        court: C && !C.why ? C : null,
        days: C && !C.why ? City.trip(run, C.at) + 1 : 0,
        sta: ENC.spar.sta,
        why:
          off ||
          Fight.ban(run) ||
          (!W.t || squadOf(W.t).length < 4 ? 'no crew to play' : '') ||
          (mineT && W.t === mineT ? 'your own squad — invite them' : '') ||
          (!C ? 'needs a court nearby or the drone' : '') ||
          (C.why ? `no open ground near them — ${C.why}` : '') ||
          (C.g ? Encounter.refuses(run, id, C.g.k) : '') ||
          (City.outside(run, C.at) ? City.fence(run) : '') ||
          City.noTime(run, City.trip(run, C.at) + 1) ||
          (run.sta < ENC.spar.sta ? `too tired (needs ${ENC.spar.sta} stamina)` : '')
      };
    const ti = Encounter.club(run, W),
      Wt = ti >= 0 && ti !== run.team ? Fight.worth(run, ti, stake) : null,
      challenge = {
        k: 'challenge',
        ti,
        days: ti >= 0 ? City.scoutCost(run, ti) : 0,
        verdict: Wt ? Wt.verdict : 'refuses',
        said: Wt ? Wt.why : '',
        why:
          off ||
          (ti < 0 ? 'no club to challenge' : '') ||
          (ti === run.team ? 'your own club' : '') ||
          (!Wt ? 'takes no challenges' : '') ||
          (!MapModel.known(run, `hq${ti}`, CITY.hq[ti]) ? 'their HQ isn’t on your map' : '') ||
          Fight.ban(run) ||
          City.noTime(run, City.scoutCost(run, ti)) ||
          (run.money < side.cost ? `needs $${side.cost} for a crew` : '')
      };
    return [talk, invite, spar, challenge, { k: 'card', days: 0, why: '' }];
  },
  /** One row of the menu (or null). */
  row: (run, id, k, road, stake) => (Encounter.menu(run, id, road, stake) || []).find(r => r.k === k) || null,
  /** Talk (once a day per person): `met_road` (+2, Friendly × 1.5) — their line (behaviour), the diary line. { hi, line, bond }. */
  talk(run, id) {
    const S = Encounter.of(run);
    (S.talk || (S.talk = {}))[String(id)] = Encounter.today(run);
    const hi = Encounter.say(run, ENC_HI, id, 'hi'),
      bond = Rel.add(run, id, 'met_road'),
      line = Rel.text(run, id, { k: 'met_road', w: run.week });
    Run.log(run, `${line}${bond ? ` (${fmtDelta(bond)} bond)` : ''}`);
    return { hi, line, bond };
  },
  /**
   * Invite (once a day per person): yes by hash under Encounter.inviteP → they join your next day order this week (the floor
   * bonus, §4.33: City.orderDay). { yes, hi (their answer), line (the diary) }.
   */
  invite(run, id) {
    const S = Encounter.of(run),
      now = Encounter.today(run),
      yes = hstr(`inv|${run.pseed}|${now}|${id}`) < Encounter.inviteP(run, id),
      n = Team.first(People.find(run, id));
    (S.ask || (S.ask = {}))[String(id)] = now;
    if (yes) S.inv = id;
    const hi = Encounter.say(run, yes ? ENC_INVITE.yes : ENC_INVITE.no, id, 'inv'),
      line = yes ? `Asked ${n} to train with me. Yes. Next order, together.` : `Asked ${n} to train with me. No. Their loss.`;
    Run.log(run, line);
    return { yes, hi, line };
  },
  /** Who joins your next day order (an Invite said yes this week), or null. */
  invited: run => (run.enc && run.enc.w === Season.wk(run) && run.enc.inv != null ? run.enc.inv : null),
  /**
   * Spar person id's crew (no stake): your challenge side (club squad / Academy squad / a street crew, lent for free) against their
   * squad at the court nearest them — a real match, no injury roll, no standing. Null if the menu's Spar row is locked.
   */
  spar(run, id) {
    const R0 = Encounter.row(run, id, 'spar');
    return !R0 || R0.why ? null : Encounter.sparFx(run, id, R0.court);
  },
  /**
   * The spar / pickup match against person id's crew at C: a court ({ id, at, name }) or a field ({ at, name, g: City.groundAt }) —
   * then the field venue with its ground: `m.ground` (who was born to it: GROUNDS.home) and `m.wind`, set in the fixture's setup.
   */
  sparFx(run, id, C) {
    const W = Encounter.who(run, id),
      side = Fight.challengeSide(run),
      mine = side.kind === 'hired' ? Fight.hired(run) : side.T,
      opp = W.t;
    if (side.kind === 'hired') Eval.lend(run, mine);
    Cup.prepare(run, opp, 'court', mine);
    Run.lineup(run, mine, City.myRegion(run), false, true);
    Run.lineup(run, opp, null);
    const rel = Rel.matchFlags(run, mine, opp),
      G = C.g ? Encounter.matchGround(run, C, [mine, opp]) : null;
    return {
      a: mine,
      b: opp,
      round: `${C.g ? 'Pickup' : 'Spar'}: ${mine.name} vs ${opp.name} · ${C.name}`,
      back: 'Continue',
      rel,
      ...(G ? { venue: 'field', ground: { k: G.k, wind: C.g.wind } } : {}),
      setup: m => {
        m.rel = rel;
        if (G) Encounter.groundOn(m, G, C.g.wind);
      },
      onFinish: m => {
        Eval.restore();
        return Encounter.sparResult(run, m, id, C);
      },
      onLeave: () => Eval.restore()
    };
  },
  /** After a spar: the trip + a day at the court, − stamina, ENC.spar.xp of the match XP, `sparred` either way. Returns the diary line. */
  sparResult(run, m, id, C) {
    const you = Run.you(run),
      win = m.winner === 0,
      s = m.stat[you.id] || blank(),
      sc = m.setScores[0],
      k = ENC.spar.xp,
      half = Object.fromEntries(Object.entries(s).map(([u, v]) => [u, typeof v === 'number' ? v * k : v])),
      what = C.g ? 'Pickup' : 'Spar',
      trip = (Cup.record(run, m, 'court', { round: what }), City.go(run, C.at, { k: 'battle', label: what, at: C.name })),
      bond = Rel.add(run, id, 'sparred'),
      n = Team.first(People.find(run, id)),
      out = [Growth.matchXp(run, { ...m, stat: { ...m.stat, [you.id]: half } }), Run.bump(run, 'sta', -ENC.spar.sta)];
    if (bond) out.push(`${fmtDelta(bond)} bond with ${n}`);
    if (C.g) out.push(...Encounter.fieldAfter(run, m, id, C));
    run.focus = null;
    const line = `${trip}${C.g ? 'Pickup game with' : 'Sparred'} ${n}’s crew at ${C.name} — ${win ? 'won' : 'lost'} ${sc[0]}-${sc[1]} · ${out.filter(Boolean).join(', ')}`;
    Run.log(run, line);
    Run.save(run);
    return line;
  },

  // ---- the Ref drone (spec §4.38, T-339): a pickup game on open ground where you stand; who agrees to play off a flat floor -----
  /** A field at map point p ({ at, name, g } — City.groundAt's ground; { why } where nobody can play). */
  field(run, p) {
    const g = City.groundAt(run, p);
    if (g.why) return { why: g.why };
    return { at: [Math.round(p[0]), Math.round(p[1])], g, name: `the ${g.name.toLowerCase()} in ${REGIONS[City.regionAt(p)].name}` };
  },
  /** The first open ground at or round p (ENC.pickup.near rings × dirs, in a fixed order): a field, or { why } of p itself. */
  fieldNear(run, p) {
    const P = ENC.pickup,
      first = Encounter.field(run, p);
    if (!first.why) return first;
    for (const r of P.near.slice(1))
      for (let i = 0; i < P.dirs; i++) {
        const a = (i / P.dirs) * Math.PI * 2,
          F = Encounter.field(run, [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]);
        if (!F.why) return F;
      }
    return first;
  },
  /** Will person id play on ground k? '' if so, else the gap (by headline behaviour, ENC.pickup.flat: a flat floor — asphalt at best). */
  refuses(run, id, k) {
    if (!k || ENC.pickup.ok.includes(k)) return '';
    const b = Encounter.beh(run, id);
    if (!ENC.pickup.flat.includes(b)) return '';
    return `${Team.first(People.find(run, id))} won’t play on ${GROUNDS[k].name.toLowerCase()} — a flat floor only (${TRAITS[b].beh})`;
  },
  /** Their words when they refuse (their behaviour's voice). */
  noLine: (run, id) => Encounter.say(run, ENC_GROUND.no, id, 'gno'),
  /** The engine's ground for a field C: { k, home (the squads' players born to it: GROUNDS.home.region), low (the side on the low end) }. */
  matchGround(run, C, teams) {
    const reg = GROUNDS.home.region[C.g.k],
      H = People.homes(run),
      home = reg
        ? teams
            .flatMap(t => squadOf(t))
            .filter(p => (H.get(p.id) || {}).home === reg)
            .map(p => p.id)
        : [];
    return { k: C.g.k, home, low: C.g.k === 'slope' ? (hstr(`low|${run.pseed}|${Season.wk(run)}|${C.at}`) < 0.5 ? 0 : 1) : -1 };
  },
  /** Put a field's ground on match m (the fixture's setup; the engine reads m.ground / m.wind). */
  groundOn(m, G, wind) {
    m.ground = G;
    if (wind) m.wind = wind;
  },
  /**
   * After a field match (spar or pickup): a rented drone goes back; on asphalt each time you were knocked down risks a light injury
   * (GROUNDS.asphalt.ko, by hash) and the soft (Endurance under ENC.pickup.soft) take Pain. Returns the diary bits (no bad memory for a loss — owner, 2026-10-21).
   */
  fieldAfter(run, m, id, C) {
    const out = [],
      you = Run.you(run),
      P = ENC.pickup,
      n = (m.grd && m.grd.ko[you.id]) || 0;
    City.droneUsed(run);
    if (C.g.k === 'asphalt' && n) {
      if (hstr(`asph|${run.pseed}|${Season.wk(run)}|${run.days}|${n}`) < 1 - Math.pow(1 - GROUNDS.asphalt.ko, n)) {
        run.injury = { weeks: Math.max(P.injWeeks, run.injury ? run.injury.weeks : 0) };
        out.push(`hurt on the asphalt — ${P.injWeeks} week of light training`);
      }
      if (!(you.body && you.body.end >= P.soft)) Feel.add(run, 'pain', Math.min(P.painMax, P.pain * n));
    }
    return out;
  },
  /**
   * A pickup game at map point p (the point card): where you stand must be open ground (City.groundAt), you need the drone (yours or
   * rented), and the people around (Encounter.people within ENC.pickup.r, nearest first, one per crew) — the first who agrees to the
   * ground plays with their crew; who refused says why. { at, g, field, foe (id), refused: [{ id, why }], days, sta, why ('' = open) }.
   * Pure, no draws.
   */
  pickup(run, p) {
    const field = Encounter.field(run, p),
      mineT = Fight.challengeSide(run).T,
      seen = new Set(),
      refused = [];
    let foe = null;
    if (!field.why)
      for (const q of Encounter.people(run)
        .map(q => ({ ...q, d: Math.hypot(q.at[0] - p[0], q.at[1] - p[1]) }))
        .filter(q => q.d <= ENC.pickup.r)
        .sort((a, b) => a.d - b.d || (String(a.id) < String(b.id) ? -1 : 1))) {
        const W = Encounter.who(run, q.id);
        if (!W || !W.t || seen.has(W.t) || W.t === mineT || squadOf(W.t).length < 4 || W.act === 'out') continue;
        seen.add(W.t);
        const why = Encounter.refuses(run, q.id, field.g.k);
        if (!why) {
          foe = q.id;
          break;
        }
        refused.push({ id: q.id, why });
      }
    const days = City.trip(run, p) + 1,
      why =
        Encounter.menuOff(run) ||
        (!City.drone(run) ? `needs the drone — $${DRONE.buy} at the Cargo Shed, or rent one at a court ($${DRONE.rent})` : '') ||
        (field.why ? `no pickup here — ${field.why}` : '') ||
        Fight.ban(run) ||
        (foe == null ? (refused.length ? refused[0].why : 'nobody around to play') : '') ||
        (City.outside(run, p) ? City.fence(run) : '') ||
        City.noTime(run, days) ||
        (run.sta < ENC.spar.sta ? `too tired (needs ${ENC.spar.sta} stamina)` : '');
    return { at: p, g: field.g || null, field, foe, refused, days, sta: ENC.spar.sta, why };
  },
  /** The pickup match at p (null when Encounter.pickup is locked): like a spar, on the field where you stand. */
  pickupFx(run, p) {
    const P = Encounter.pickup(run, p);
    return P.why ? null : Encounter.sparFx(run, P.foe, P.field);
  },
  /**
   * A road stop's crew, challenged on the spot (spec §4.38): with the drone, on open ground at the stop, if their captain agrees to the
   * ground. { field, cap (their captain's id), why ('' = open) }.
   */
  spot(run, E) {
    const t = E.kind === 'crew' ? run.teams[E.ti] : null,
      field = t && E.stop ? Encounter.fieldNear(run, E.stop) : { why: 'not here' },
      cap = t && t.cap ? t.cap.id : null,
      why =
        (!t ? 'no crew' : '') ||
        (!City.drone(run) ? 'needs the drone' : '') ||
        (field.why ? `no open ground — ${field.why}` : '') ||
        (cap != null && People.find(run, cap) ? Encounter.refuses(run, cap, field.g.k) : '') ||
        Fight.ban(run) ||
        (run.money < Fight.challengeSide(run).cost ? `needs $${Fight.challengeSide(run).cost} for a crew` : '');
    return { field, cap, why };
  },
  /**
   * Challenge a road stop's crew on the spot: Fight.offer at no stake ({ line } when they refuse), else Fight.challenge played on the
   * field at the stop — its trip and day there (City.playAt), the field venue and its ground. { fx } | { line } | null.
   */
  spotChallenge(run, E) {
    const S = Encounter.spot(run, E);
    if (S.why) return null;
    const r = City.playAt(S.field.at, () => Fight.offer(run, E.ti, 0, S.field.at)); // (a refusal spends the day at the stop, not at their HQ)
    if (!r) return null;
    if (!r.accepted) {
      Run.log(run, r.line);
      return { line: r.line };
    }
    const fx = Fight.challenge(run, E.ti, r.stake, false, S.field.at); // (on the spot: the trip to the stop, not to their HQ)
    if (!fx) return null;
    const C = S.field,
      G = Encounter.matchGround(run, C, [fx.a, fx.b]),
      set0 = fx.setup,
      fin0 = fx.onFinish;
    return {
      fx: {
        ...fx,
        round: `${fx.round} · ${C.name}`,
        venue: 'field',
        ground: { k: G.k, wind: C.g.wind },
        setup: m => {
          if (set0) set0(m);
          Encounter.groundOn(m, G, C.g.wind);
        },
        onFinish: m =>
          City.playAt(C.at, () => {
            const line = fin0(m),
              bits = Encounter.fieldAfter(run, m, S.cap, C);
            if (bits.filter(Boolean).length) Run.log(run, bits.filter(Boolean).join(', '));
            return line;
          })
      }
    };
  }
};
