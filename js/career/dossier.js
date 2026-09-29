// Faction dossier: everything the player can know about one faction, as plain data (no DOM, no randoms, no changes
// to the run). The faction window (ui/career-dossier.js) only renders this.

const Dossier = {
  /** The dossier of region r (wei, wu, shu, outlaws, gloria); ratings and elements are hidden until scouted or joined. */
  build(run, r) {
    const R0 = REGIONS[r],
      major = R0.kind === 'major',
      lost = Front.lostIds(run, r),
      took = Front.takenIds(run, r),
      clubs = FACTIONS.map((f, ti) => ({ f, ti })).filter(x => x.f.region === r),
      scouted = clubs.some(x => City.scouted(run, x.ti)),
      member = run.team != null && !!FACTIONS[run.team] && FACTIONS[run.team].region === r,
      state = !major
        ? 'minor'
        : Front.weak(run, r)
          ? 'weakened'
          : lost.length === 1
            ? 'pressed'
            : took.length > lost.length
              ? 'rising'
              : 'stable',
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
      fronts: major ? MAJORS.filter(m => m !== r).map(vs => ({ vs, meter: Front.meter(run, r, vs) })) : [],
      took,
      lost,
      priceMul: Front.priceMul(run, r),
      qMul: Front.qMul(run, r),
      places,
      clubs: clubs.map(({ f, ti }) => ({
        ti,
        name: run.teams[ti].name,
        color: run.teams[ti].color,
        ovr: run.teams[ti].ovr,
        join: World.joinText(ti, run),
        can: World.canJoin(run, ti)
      })),
      scouted,
      member,
      roster: Pool.players(run, r).map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        squad: reserve.includes(p) ? 'Reserve' : p.team.name,
        ovr: seeRatings ? ovr(p) : null,
        el: seeRatings && p.elOn ? p.el : null
      }))
    };
  }
};
