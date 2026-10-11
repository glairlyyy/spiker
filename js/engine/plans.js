// Team plans (spec §2.26): every side plays one attack plan and one defence plan (PLANS, js/data/tactics.js), picked before
// the match and changed only at a timeout. The AI coach picks from its playstyle and what it can see of the other side
// (no draws), and at its timeout answers the tags the coach panel shows (Coach.tags) — as soon as its coach IQ notices them.

/** Side i's plans: { atk, def }. */
const planOf = (m, i) => (m.plan && m.plan[i]) || { atk: 'straight', def: 'read' };
/** The plan's numbers (PLANS.atk / PLANS.def entry). */
const atkPlan = (m, i) => PLANS.atk[planOf(m, i).atk] || PLANS.atk.straight;
const defPlan = (m, i) => PLANS.def[planOf(m, i).def] || PLANS.def.read;
/** A side's weakest passer on court (Defense + 0.3 × Speed; never the setter while there is anyone else). */
function weakPasser(T) {
  const L = T.P.filter(p => p !== T.s);
  return (L.length ? L : T.P).reduce((a, p) => (effD(p) + p.speed * 0.3 < effD(a) + a.speed * 0.3 ? p : a));
}
/** A side's ace: the best hitter on court (Power 0.6 + Jump 0.4; not the setter). */
function aceOf(T) {
  const L = T.P.filter(p => p.role !== 'S');
  return (L.length ? L : T.P).reduce((a, p) => (p.power * 0.6 + p.jump * 0.4 > a.power * 0.6 + a.jump * 0.4 ? p : a));
}
/**
 * The AI coach's plans before the match (no draws): the playstyle's default; a sharp coach (coach IQ ≥ PLAN_AI.iq) looks at
 * the other side — a standout ace → Wall their ace; a clearly weak passer → Hunt the passer.
 */
function planPick(T, O) {
  const [atk, def] = PLAN_STYLE[T.sk] || ['straight', 'read'],
    p = { atk, def };
  if ((T.coachIQ ?? 0.6) < PLAN_AI.iq) return p;
  const hit = O.P.filter(q => q.role !== 'S').map(q => q.power * 0.6 + q.jump * 0.4),
    ace = Math.max(...hit),
    rest = hit.length > 1 ? (hit.reduce((s, v) => s + v, 0) - ace) / (hit.length - 1) : ace;
  if (ace - rest >= PLAN_AI.aceGap) p.def = 'wall';
  const pas = O.P.filter(q => q !== O.s).map(q => effD(q) + q.speed * 0.3),
    lo = Math.min(...pas),
    avg = pas.reduce((s, v) => s + v, 0) / pas.length;
  if (avg - lo >= PLAN_AI.passGap) p.atk = 'hunt';
  return p;
}
/** Set side i's plans (who: 'ai' | 'you'); logged for the result card and the coach panel. */
function planSet(m, i, plan, who) {
  const cur = planOf(m, i);
  const next = { atk: PLANS.atk[plan.atk] ? plan.atk : cur.atk, def: PLANS.def[plan.def] ? plan.def : cur.def },
    L = m.planLog || (m.planLog = []),
    at = [...m.pts],
    same = L.findLast(e => e.side === i && e.at[0] === at[0] && e.at[1] === at[1]); // a change at the same score replaces it
  m.plan[i] = next;
  if (who === 'you') (m.planBy || (m.planBy = ['ai', 'ai']))[i] = 'you';
  if (same) Object.assign(same, { atk: next.atk, def: next.def, by: who });
  else L.push({ side: i, at, atk: next.atk, def: next.def, by: who });
}
/** How many cases a coach needs before a tag registers: 4 (sharp) … 8 (slow). */
const noticeAt = T => Math.round(lerp(8, 4, clamp(((T.coachIQ ?? 0.6) - 0.4) / 0.6, 0, 1)));
/**
 * The AI coach's answer at its timeout (spec §2.26): the tags it has noticed (Coach.tags, n ≥ noticeAt) → a counter plan.
 * Their hitter keeps going one way / their ace scores → Wall their ace; they serve at our weak passer → Cover the weak link;
 * our block keeps getting fooled → Dig deep; their block reads us → Power through; our serves find their weak passer → Hunt.
 * Returns the new plan (or null: nothing noticed).
 */
function planCounter(m, i) {
  const T = m.t[i],
    o = 1 - i,
    need = noticeAt(T),
    theirs = Coach.tags(m, o).filter(g => g.n >= need),
    ours = Coach.tags(m, i).filter(g => g.n >= need),
    cur = planOf(m, i),
    p = { ...cur };
  const ace = aceOf(m.t[o]);
  if (theirs.some(g => g.kind === 'serve')) p.def = 'cover';
  else if (theirs.some(g => g.kind === 'lane' && g.p === ace)) p.def = 'wall';
  if (ours.some(g => g.kind === 'fooled')) p.def = 'deep';
  // their block reads our hitters right (their tag 'read'): stop giving them a channel
  if (theirs.some(g => g.kind === 'read')) p.atk = 'power';
  else if (ours.some(g => g.kind === 'serve')) p.atk = 'hunt';
  return p.atk !== cur.atk || p.def !== cur.def ? p : null;
}
