// Single-elimination bracket for 8 teams: 4 quarterfinals → 2 semifinals → final.
// A schedule is an array of { round, a, b, w } entries (team indices; w = winner or null).

function newBracket(order) {
  return [0, 1, 2, 3].map(k => ({ round: 'Quarterfinal', a: order[k * 2], b: order[k * 2 + 1], w: null }));
}
/** Next unplayed entry, adding the next round once the current one is done. null when the final is played. */
function advanceBracket(sched) {
  const m = sched.find(x => x.w === null);
  if (m) return m;
  const n = sched.length;
  if (n === 4) {
    const w = sched.map(x => x.w);
    sched.push({ round: 'Semifinal', a: w[0], b: w[1], w: null }, { round: 'Semifinal', a: w[2], b: w[3], w: null });
    return sched[4];
  }
  if (n === 6) {
    sched.push({ round: 'Final', a: sched[4].w, b: sched[5].w, w: null });
    return sched[6];
  }
  return null;
}
const bracketChampion = sched => (sched.length === 7 && sched[6].w !== null ? sched[6].w : null);
