// Single-elimination bracket for 8 or 16 slots (byes allowed): [Round of 16 →] quarterfinals → semifinals → final.
// A schedule is an array of { round, a, b, w, res?, bye? } entries (team indices; a / b null = a bye; w = winner or
// null while unplayed). Rounds are appended in order as the previous one finishes.

/** Round name by the number of entrants still in it. */
const BRACKET_ROUNDS = { 16: 'Round of 16', 8: 'Quarterfinal', 4: 'Semifinal', 2: 'Final' };
/** The round that follows each round. */
const BRACKET_NEXT = { 'Round of 16': 'Quarterfinal', Quarterfinal: 'Semifinal', Semifinal: 'Final' };

/** order: 8 or 16 entries (team indices, null = bye) in bracket positions; first round = adjacent pairs. */
function newBracket(order) {
  const round = BRACKET_ROUNDS[order.length];
  if (!round || order.length < 4) throw new Error('bracket size must be 8 or 16');
  return Array.from({ length: order.length / 2 }, (_, k) => ({ round, a: order[k * 2], b: order[k * 2 + 1], w: null }));
}
/**
 * Next unplayed entry, resolving byes on the way (a lone entrant advances with res null; an empty slot is marked
 * `bye` and skipped) and adding the next round once the current one is done. null when the final is played.
 */
function advanceBracket(sched) {
  for (;;) {
    for (const x of sched)
      if (x.w === null && !x.bye && (x.a === null || x.b === null)) {
        if (x.a === null && x.b === null) x.bye = true;
        else {
          x.w = x.a === null ? x.b : x.a;
          x.res = null;
        }
      }
    const m = sched.find(x => x.w === null && !x.bye);
    if (m) return m;
    const last = sched[sched.length - 1];
    if (last.round === 'Final') return null;
    const cur = sched.filter(x => x.round === last.round);
    for (let i = 0; i < cur.length; i += 2) sched.push({ round: BRACKET_NEXT[last.round], a: cur[i].w, b: cur[i + 1].w, w: null });
  }
}
/** The winner of the Final (a team index), null until it is played. */
const bracketChampion = sched => {
  const f = sched.find(x => x.round === 'Final');
  return f ? f.w : null;
};
/** Standard seeding: the seed (1 = best) at each bracket position, so seed 1 meets n, 2 meets n − 1 … (n = 8 or 16). */
function seedOrder(n) {
  if (n === 8) return [1, 8, 4, 5, 2, 7, 3, 6];
  if (n === 16) return [1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 2, 15];
  throw new Error('seedOrder: n must be 8 or 16');
}
