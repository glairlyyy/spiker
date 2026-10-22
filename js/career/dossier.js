// Faction dossier: everything the player can know about one faction, as plain data (no DOM, no randoms, no changes
// to the run). The faction window (ui/career-dossier.js) only renders this.

const Dossier = {
  /** What a scouted club does, from its data (no match history): quick share, favoured wing, pipe, defence setting. */
  habits(t) {
    const mbs = t.P.filter(p => p.role === 'MB').length,
      ws = t.P.filter(p => p.role === 'WS'),
      quick = mbs ? Math.min(0.7, t.S.quick * (mbs > 1 ? 1.4 : 1)) : 0,
      wing = ws.length > 1 && ws[0].power !== ws[1].power ? (ws[0].power > ws[1].power ? 'left' : 'right') : null,
      setter = t.P.find(p => p.role === 'S');
    return { quick: Math.round(quick * 100), wing, pipe: !!setter && hasTech(setter, 'pipecombo'), def: defOf(t) };
  },
  /** One line of habits: "Quicks ~30 % · favours the left · pipe · Defence: Bunch". */
  habitText(h) {
    return [`Quicks ~${h.quick} %`, h.wing && `favours the ${h.wing}`, h.pipe && 'pipe', `Defence: ${DEFSETS[h.def].name}`]
      .filter(Boolean)
      .join(' · ');
  },
  /** Standing label for a standing value (−100…100). */
  standingLabel: v => (v >= 30 ? 'Trusted' : v > 0 ? 'Friendly' : v <= -30 ? 'Hostile' : v < 0 ? 'Wary' : 'Neutral'),
  /** The short form for the World sheet's Factions tab: standing, war units (Strength, stage), places taken / lost, economy. */
  summary(run, r) {
    const R0 = REGIONS[r],
      F = Dossier.front(run, r),
      major = F.major,
      lost = major ? F.lost : [],
      took = major ? F.took : [],
      c = Fight.clashSite(run),
      v = City.rep(run, r);
    return {
      id: r,
      name: R0.name,
      kind: R0.kind,
      desc: R0.desc,
      standing: v,
      label: Dossier.standingLabel(v),
      weak: major && Front.weak(run, r),
      fronts: F.fronts,
      took: took.map(id => ({ id, name: SPOTS[id].name, from: SPOTS[id].region })),
      lost: lost.map(id => ({ id, name: SPOTS[id].name, to: run.own[id] })),
      econ: major && War.regionStr(run, r) < WAR.start ? { priceMul: F.priceMul, qMul: F.qMul } : null,
      clubs: run.teams.filter(t => FACTIONS[t.i].region === r).map(t => t.i),
      foe: c ? (c.a === r ? c.b : c.b === r ? c.a : null) : null
    };
  },
  /**
   * The war block shared by summary and build: places taken and lost; fronts = the region's war units (spec §4.34) — { unit,
   * name, str, stage (WAR_STAGES id), plays (the stage its squads play with), fallen, by (destroyer), vs (the units across its
   * border), clubs, joinCut / feeCut (what its clubs ask less) }.
   */
  front(run, r) {
    const major = MAJORS.includes(r),
      W = War.state(run);
    return {
      major,
      lost: Front.lostIds(run, r),
      took: Front.takenIds(run, r),
      fronts: War.ofRegion(r).map(u => {
        const n = War.stage(run, u);
        return {
          unit: u,
          name: WAR.units[u].name,
          str: War.str(run, u),
          stage: WAR_STAGES[n].id,
          plays: WAR_STAGES[War.weak(run, u)].id,
          fallen: War.fallen(run, u),
          by: W.fallen[u] ? W.fallen[u].by : null,
          vs: War.ids().filter(o => War.edges(run, u, o).length),
          clubs: WAR.units[u].clubs,
          joinCut: FRONT.join * n,
          feeCut: Math.round(FRONT.fee * n * 100)
        };
      }),
      priceMul: Front.priceMul(run, r),
      qMul: Front.qMul(run, r)
    };
  },
  /** The dossier of region r (wei, wu, shu, outlaws, gloria); ratings and elements are hidden until scouted or joined. */
  build(run, r) {
    const R0 = REGIONS[r],
      F = Dossier.front(run, r),
      { major, lost, took } = F,
      clubs = FACTIONS.map((f, ti) => ({ f, ti })).filter(x => x.f.region === r),
      scouted = clubs.some(x => City.scouted(run, x.ti)),
      member = run.team != null && !!FACTIONS[run.team] && FACTIONS[run.team].region === r,
      worst = Math.max(0, ...F.fronts.filter(f => !f.fallen).map(f => War.stage(run, f.unit))),
      state = !major ? 'minor' : !Front.standing(run, r) ? 'fallen' : worst >= 2 ? 'weakened' : worst === 1 ? 'pressed' : 'stable',
      reserve = (run.reserve && run.reserve[r] && run.reserve[r].P) || [];
    const places = Object.keys(SPOTS)
      .filter(id => id !== 'home' && City.region(run, id) === r)
      .map(id => {
        const s = SPOTS[id],
          Q = City.quality(run, id),
          seized = Front.seized(run, id);
        return {
          id,
          name: s.name,
          train: s.train || null,
          price: City.price(run, id),
          q: Q.known ? Q.q : R0.q,
          known: !!Q.known,
          level: s.train ? Training.facility(run, s.train) + 1 : null,
          seized,
          from: seized ? s.region : null,
          access: City.access(run, id)
        };
      });
    const seeRatings = scouted || member;
    return {
      id: r,
      name: R0.name,
      color: R0.color,
      kind: R0.kind,
      desc: R0.desc,
      standing: City.rep(run, r),
      state,
      fronts: F.fronts,
      took,
      lost,
      priceMul: F.priceMul,
      qMul: F.qMul,
      places,
      clubs: clubs.map(({ ti }) => ({
        ti,
        name: run.teams[ti].name,
        color: run.teams[ti].color,
        ovr: run.teams[ti].ovr,
        join: World.joinText(ti, run),
        can: World.canJoin(run, ti),
        habits: City.scouted(run, ti) || member ? Dossier.habits(run.teams[ti]) : null
      })),
      scouted,
      member,
      roster: Pool.players(run, r).map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        squad: reserve.includes(p) ? 'Reserve' : p.team.bench && p.team.bench.includes(p) ? `${p.team.name} · bench` : p.team.name,
        ovr: seeRatings ? ovr(p) : null,
        el: seeRatings && p.elOn ? p.el : null,
        techs: seeRatings ? Skills.techs(p) : null
      }))
    };
  }
};
