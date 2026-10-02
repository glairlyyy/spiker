// Faction dynamics between the three majors: street battles push a pressure meter on each border; enough net wins
// seize one of the loser's border places (FRONT.borders) — it becomes the winner's (price, turf, map colour). Losing
// places weakens a faction: dearer, poorer facilities, easier to join. Who starts a fight: FRONT.aggro (+ revenge).
// DOM-free.

const MAJORS = ['wei', 'wu', 'shu'];
const Front = {
  /** The FRONT.borders key of a pair (either order). */
  key: (a, b) => (FRONT.borders[`${a}-${b}`] ? `${a}-${b}` : `${b}-${a}`),
  /** Who holds a place now (seized places differ from their home region). */
  owner: (run, id) => (run.own && run.own[id]) || SPOTS[id].region,
  seized: (run, id) => !!(SPOTS[id] && SPOTS[id].region && Front.owner(run, id) !== SPOTS[id].region),
  /** Places a region lost / took. */
  lostIds: (run, r) => Object.keys(run.own || {}).filter(id => SPOTS[id].region === r && run.own[id] !== r),
  takenIds: (run, r) => Object.keys(run.own || {}).filter(id => run.own[id] === r && SPOTS[id].region !== r),
  lost: (run, r) => Front.lostIds(run, r).length,
  gained: (run, r) => Front.takenIds(run, r).length,
  weak: (run, r) => Front.lost(run, r) >= FRONT.weakAt,
  /** Economy: prices × (fewer facilities for the same money), facility quality × (money follows the winner). */
  priceMul: (run, r) => 1 + FRONT.price * Front.lost(run, r),
  qMul: (run, r) => 1 + FRONT.q * (Front.gained(run, r) - Front.lost(run, r)),
  /** Pressure on the a–b border from a's side (−seize … +seize). */
  meter(run, a, b) {
    const k = Front.key(a, b),
      v = (run.front && run.front[k]) || 0;
    return k.startsWith(a + '-') ? v : -v;
  },
  /** Street strength for battles nobody decides for them. */
  strength: (run, r) => 50 + 10 * (Front.gained(run, r) - Front.lost(run, r)),
  /** A battle nobody joined (att = the raider, who has the initiative). */
  sim(run, a, b, att) {
    const s = r => Front.strength(run, r) + (r === att ? FRONT.initiative : 0);
    return R() < clamp(0.5 + (s(a) - s(b)) / 100, 0.2, 0.8) ? a : b;
  },
  /** w beat l on their border: push the meter; at FRONT.seize a place changes hands. Returns the news line ('' if none). */
  result(run, w, l) {
    const k = Front.key(w, l),
      F = run.front || (run.front = {});
    F[k] = (F[k] || 0) + (k.startsWith(w + '-') ? 1 : -1);
    run.lastLoser = l;
    if (Math.abs(F[k]) < FRONT.seize) return '';
    F[k] = 0;
    return Front.seize(run, w, l, k);
  },
  /** Preview of "w beats l" (nothing changes): the meter from w's side, whether it seizes, and which place (null if none). */
  stakes(run, w, l) {
    const m = Front.meter(run, w, l) + 1,
      seize = m >= FRONT.seize,
      B = FRONT.borders[Front.key(w, l)];
    return {
      meter: seize ? FRONT.seize : m,
      seize,
      place: seize ? B[w].find(i => Front.owner(run, i) === l) || B[l].find(i => Front.owner(run, i) === l) || null : null
    };
  },
  /** w takes a border place from l: its own lost places first, then l's next one. */
  seize(run, w, l, k) {
    const B = FRONT.borders[k],
      own = run.own || (run.own = {});
    let id = B[w].find(i => Front.owner(run, i) === l);
    const back = !!id;
    if (!id) id = B[l].find(i => Front.owner(run, i) === l);
    if (!id) return '';
    if (back) delete own[id];
    else own[id] = w;
    const s = `${REGIONS[w].name} ${back ? 'retook' : 'seized'} the ${SPOTS[id].name} from ${REGIONS[l].name}${
      Front.weak(run, l) ? ` — ${REGIONS[l].name} weakened` : ''
    }`;
    Run.news(run, s + '.');
    return s;
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
