// The island map as plain data: what a renderer draws, with no drawing in it (DOM-free, tested headless).
// MapModel.build(run, sel) → { w, h, land, seized, pins, you, fog, flag, focus, sel }. Map units: CITY.w × CITY.h,
// y down. A renderer (MapView: js/ui/map-svg.js today; a three.js one later) draws a model and reports two things
// back: a pin picked (its id) and a map point clicked ([x, y] in map units). All game rules stay in City / Front.

const MapModel = {
  /** What you know of: explored places, your home, your club's HQ, this week's battle. */
  known: (run, id, p) => id === 'home' || id === `hq${run.team}` || id === 'clash' || City.seen(run, p),
  /** A picked map point, as the selection id 'pt:x,y' ↔ [x, y]. */
  ptId: p => `pt:${Math.round(p[0])},${Math.round(p[1])}`,
  ptOf: sel => (sel && sel.startsWith('pt:') ? sel.slice(3).split(',').map(Number) : null),
  /** Land: the island, the majors' territories, minors' patches, the shrine park, labels, landmarks. */
  land(run) {
    const mine = City.myRegion(run),
      reg = id => ({ id, color: REGIONS[id].color, mine: mine === id });
    return {
      coast: CITY.coast,
      beach: CITY.beach,
      regions: ['wu', 'shu', 'wei'].map(id => Object.assign(reg(id), { poly: CITY[id] })),
      contest: { line: CITY.contest, title: 'Contested Wei–Wu border' },
      minors: Object.entries(CITY.minors).map(([id, e]) => Object.assign(reg(id), e)),
      park: Object.assign(reg('open'), CITY.park, { title: REGIONS.open.desc }),
      mountains: CITY.mountains,
      labels: ['wei', 'shu', 'wu', 'outlaws', 'gloria', 'open'].map(id => ({
        id,
        at: CITY.label[id],
        color: REGIONS[id].color,
        big: MAJORS.includes(id),
        text: `${REGIONS[id].name}${id === mine ? ' · home turf' : ''}`
      })),
      airport: CITY.airport
    };
  },
  /**
   * Pins: places, club HQs and this week's battle. flags: off (no time left for it), far (2+ day trip), turf,
   * gem / overhyped (known quality), hq, can (a club you can sign with), mine (your club), clash.
   */
  pins(run) {
    const floor = run.floor || {},
      out = [];
    for (const [id, s] of Object.entries(SPOTS)) {
      const at = City.at(run, id);
      if (!MapModel.known(run, id, at)) continue;
      const Q = s.train ? City.quality(run, id) : null,
        mates = s.train ? (floor[s.train] || []).length : 0;
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
          turf: !!(s.train && City.turf(run, id)),
          gem: !!(Q && Q.known && Q.tag === 'gem'),
          overhyped: !!(Q && Q.known && Q.tag === 'overhyped')
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
    const c = City.clashSite(run);
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
  /** Seized border places you've seen: a patch in the holder's colour. */
  seized: run =>
    Object.keys(SPOTS)
      .filter(id => Front.seized(run, id) && City.seen(run, City.at(run, id)))
      .map(id => {
        const r = Front.owner(run, id);
        return {
          id,
          at: City.at(run, id),
          r: 46,
          color: REGIONS[r].color,
          title: `Seized by ${REGIONS[r].name} from ${REGIONS[SPOTS[id].region].name}`
        };
      }),
  build(run, sel = null) {
    return {
      w: CITY.w,
      h: CITY.h,
      land: MapModel.land(run),
      seized: MapModel.seized(run),
      pins: MapModel.pins(run),
      you: { at: City.pos(run), title: `You are in ${REGIONS[City.loc(run)].name}` },
      fog: { points: run.fog || [], r: REVEAL_R },
      flag: MapModel.ptOf(sel),
      focus: City.at(run, 'home'), // where a fresh view centres
      sel
    };
  }
};
