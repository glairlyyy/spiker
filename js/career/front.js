// Faction dynamics between the three majors on the hex map (spec §4.27, js/career/hex.js): a street battle is fought on a
// tile and pushes its pressure; at the tile's cost it changes hands, with any places on it (price, turf, map colour). Losing
// places weakens a faction: dearer, poorer facilities, easier to join. Who starts a fight: FRONT.aggro (+ revenge).
// DOM-free.

const MAJORS = ['wei', 'wu', 'shu'];
const Front = {
  /** Who holds a place now (seized places differ from their home region). */
  owner: (run, id) => (run.own && run.own[id]) || SPOTS[id].region,
  seized: (run, id) => !!(SPOTS[id] && SPOTS[id].region && Front.owner(run, id) !== SPOTS[id].region),
  /** Places a region lost / took. */
  lostIds: (run, r) => Object.keys(run.own || {}).filter(id => SPOTS[id].region === r && run.own[id] !== r),
  takenIds: (run, r) => Object.keys(run.own || {}).filter(id => run.own[id] === r && SPOTS[id].region !== r),
  lost: (run, r) => Front.lostIds(run, r).length,
  gained: (run, r) => Front.takenIds(run, r).length,
  /** Economy from tile value (spec §4.27, HEX_ECON): e = value held − value at the start (0 for minors and the Academy). */
  econ: (run, r) => (MAJORS.includes(r) ? Hex.worth(run, r) - Hex.worth0(r) : 0),
  /** Steps down: one per HEX_ECON.step value points lost (club joins get easier). */
  down: (run, r) => Math.floor(Math.max(0, -Front.econ(run, r)) / HEX_ECON.step),
  weak: (run, r) => Front.econ(run, r) <= -HEX_ECON.weakAt,
  /** Prices × (fewer facilities for the same money), facility quality × (money follows the land). */
  priceMul: (run, r) => 1 + HEX_ECON.price * Math.max(0, -Front.econ(run, r)),
  qMul: (run, r) => clamp(1 + HEX_ECON.q * Front.econ(run, r), HEX_ECON.qClamp[0], HEX_ECON.qClamp[1]),
  /** a's strongest push on b: the highest pressure a has built on any of b's tiles (spec §4.27). */
  push(run, a, b) {
    const H = Hex.state(run);
    return Math.max(
      0,
      ...Object.keys(H.p)
        .filter(id => H.by[id] === a && Hex.owner(run, id) === b)
        .map(id => H.p[id])
    );
  },
  /** Pressure between a and b from a's side: a's push on b minus b's push on a. */
  meter: (run, a, b) => Front.push(run, a, b) - Front.push(run, b, a),
  /**
   * The tile a win for w over l is fought on: this week's battle tile if l holds it (the raider won), the tile the raid came
   * from if w held the battle tile (the defender won: its counter-push), else w's next target on l.
   */
  battleTile(run, w, l) {
    const c = run.clash;
    if (c && c.tile && [c.att, c.def].includes(w) && [c.att, c.def].includes(l)) {
      if (Hex.owner(run, c.tile) === l) return c.tile;
      if (c.from && Hex.owner(run, c.from) === l && Hex.takeable(Hex.tile(c.from))) return c.from;
    }
    const t = Hex.target(run, w, l);
    return t ? t.id : null;
  },
  /** Street strength for battles nobody decides for them. */
  strength: (run, r) => 50 + HEX_ECON.str * Front.econ(run, r),
  /** A battle nobody joined (att = the raider, who has the initiative). */
  sim(run, a, b, att) {
    const s = r => Front.strength(run, r) + (r === att ? FRONT.initiative : 0);
    return R() < clamp(0.5 + (s(a) - s(b)) / 100, 0.2, 0.8) ? a : b;
  },
  /**
   * w beat l: +1 pressure for w on the battle tile (Front.battleTile); a defender's win also clears the raid's pressure on
   * its own tile. At the tile's cost (Hex.cost) it flips to w. Returns the news line ('' if nothing changed hands).
   */
  result(run, w, l) {
    const H = Hex.state(run),
      c = run.clash;
    run.lastLoser = l;
    if (c && c.tile && Hex.owner(run, c.tile) === w && H.by[c.tile] === l) {
      delete H.p[c.tile];
      delete H.by[c.tile];
    }
    const id = Front.battleTile(run, w, l);
    if (!id) return '';
    if (H.by[id] !== w) H.p[id] = 0;
    H.p[id] = (H.p[id] || 0) + 1;
    H.by[id] = w;
    H.t[id] = run.week;
    if (H.p[id] < Hex.cost(run, id, w)) return '';
    const back = Hex.tile(id).region === w,
      name = Hex.name(id);
    Hex.flip(run, id, w);
    const s = `${REGIONS[w].name} ${back ? 'retook' : 'seized'} ${Hex.tile(id).spots.some(x => !x.startsWith('venue:')) ? 'the ' : ''}${name} from ${REGIONS[l].name}${
      Front.weak(run, l) ? ` — ${REGIONS[l].name} weakened` : ''
    }`;
    Run.news(run, s + '.');
    return s;
  },
  /** Preview of "w beats l" (nothing changes): { tile, name, meter (pressure after the win), cost, seize, place (a place that falls, or null) }. */
  stakes(run, w, l) {
    const id = Front.battleTile(run, w, l);
    if (!id) return { tile: null, name: '', meter: 0, cost: 0, seize: false, place: null };
    const H = Hex.state(run),
      m = (H.by[id] === w ? H.p[id] || 0 : 0) + 1,
      cost = Hex.cost(run, id, w),
      seize = m >= cost;
    return {
      tile: id,
      name: Hex.name(id),
      meter: Math.min(m, cost),
      cost,
      seize,
      place: seize ? Hex.tile(id).spots.find(x => !x.startsWith('venue:')) || null : null
    };
  },
  /** This week's aggressor and target: FRONT.aggro (+ revenge for last week's loser), aiming at the border it is winning. */
  pick(run) {
    const w = MAJORS.map(r => FRONT.aggro[r] + (run.lastLoser === r ? FRONT.revenge : 0)),
      sum = w.reduce((a, b) => a + b, 0);
    let x = R() * sum,
      i = 0;
    while (i < MAJORS.length - 1 && (x -= w[i]) >= 0) i++;
    const att = MAJORS[i],
      [o1, o2] = MAJORS.filter(r => r !== att),
      m1 = Front.meter(run, att, o1),
      m2 = Front.meter(run, att, o2);
    return { att, def: m1 > m2 ? o1 : m2 > m1 ? o2 : R() < 0.5 ? o1 : o2 };
  }
};
