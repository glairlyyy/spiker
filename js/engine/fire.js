// Team fire, stages and temperament (spec §2.14) and the captain's calls (§2.17, T-260). Fire is `m.mom` (−1..1, its rises and
// falls in pointMomentum); the stage (`m.stage[side]`, STAGE_IDS) follows it after every point, shaped by the team's
// temperament (`m.temper[side]`, TEMPERS). `m.zone` stays an alias of Fever (elements, hype, the Element Trial). No randoms.

/** A squad's temperament: its personalities, the captain counting double; ties → steady. */
function temperOf(t) {
  const n = {};
  for (const p of squadOf(t)) {
    const k = TEMPER_OF[persOf(p)];
    n[k] = (n[k] || 0) + (p === t.cap ? 2 : 1);
  }
  const top = Math.max(...Object.values(n));
  const best = Object.keys(n).filter(k => n[k] === top);
  return best.length === 1 ? best[0] : 'steady';
}
/** The stage a side's fire alone gives (no Fever: that needs a trigger), within its temperament. */
function fireStage(m, side) {
  const T = TEMPERS[m.temper[side]] || {},
    f = m.mom[side],
    played = m.pts[0] + m.pts[1],
    loose = T.loose === false ? -9 : (T.loose ?? STAGES.composed.from),
    focused = T.focused ?? STAGES.focused.from;
  if (f < loose && !(T.looseAfter && played < T.looseAfter)) return 'loose';
  return f < focused ? 'composed' : 'focused';
}
/** Can side i catch Fever now (fire high enough, not Ice)? */
const feverReady = (m, i) => {
  const T = TEMPERS[m.temper[i]] || {};
  return T.fever !== false && m.mom[i] >= (T.fever ?? STAGES.fever.from);
};
/** How long a Fever lasts for side i (its temperament, minus the Ice opponent's cut). */
const feverLen = (m, i) => (TEMPERS[m.temper[i]].feverLen ?? FIRE.feverLen) - (TEMPERS[m.temper[1 - i]].oppFever || 0);
/** Move side i to stage `to` (why: the reason shown); returns the change or null. Keeps `m.zone` as the Fever alias. */
function stageSet(m, i, to, why) {
  const from = m.stage[i];
  m.zone[i] = to === 'fever' ? 1 : 0;
  if (to === 'fever') {
    m.zoneHit[i] = 1;
    if (from !== 'fever') m.fever[i] = feverLen(m, i);
  }
  if (from === to) return null;
  m.stage[i] = to;
  return { k: 'stage', side: i, from, to, why };
}
/**
 * After a point won by w (pointMomentum has moved the fire): the zone breaker, Fever's end (its points run out, an error, a
 * fake against it), Fever's start (fire + a trigger: a long rally, a streak, a kill at set point) and every other stage from
 * the fire. Returns { zoneIn, breaker, changes } (changes = stage acts).
 */
function pointStage(m, w, oppWasInZone) {
  const O = 1 - w,
    out = [],
    put = (i, to, why) => {
      const c = stageSet(m, i, to, why);
      if (c) out.push(c);
    };
  let breaker = false;
  // Zone breaker: a kill block (or a fake set) that scores against a team in Fever: they drop to Composed, the scorers catch fire
  if (oppWasInZone && (m.lastPlay === 'killblock' || m.lastPlay === 'fake')) {
    breaker = m.lastPlay === 'killblock';
    if (m.mom[O] > -0.2) fireTo(m, O, -0.2);
    m.streak[O] = 0;
    put(O, breaker ? 'composed' : 'focused', breaker ? 'breaker' : 'stuff');
    if (breaker) {
      if (m.mom[w] < 0.9) fireTo(m, w, 0.9);
      for (const q of m.t[w].P) md(m, q, 0.25);
      for (const q of m.t[O].P) md(m, q, -0.2);
      if (TEMPERS[m.temper[w]].fever !== false) put(w, 'fever', 'breaker');
    }
  }
  // Fever's clock and its other ends
  for (const i of [0, 1]) {
    if (m.stage[i] !== 'fever' || (breaker && i === w)) continue;
    const err = i === O && m.errBy && squadOf(m.t[i]).some(q => q.id === m.errBy);
    if (err) put(i, 'focused', 'error');
    else if (--m.fever[i] <= 0) put(i, fireStage(m, i) === 'loose' ? 'composed' : 'focused', 'fire');
  }
  // Fever's start: the scorers, fire high enough, and a trigger
  const pw = m.pts[w] - 1,
    setPt = Math.max(pw, m.pts[O]) >= RULES.pointsToWin - 1,
    why = (m.rallyN || 0) >= FIRE.rally ? 'rally' : m.streak[w] === FIRE.streak ? 'streak' : setPt && m.lastK ? 'setpoint' : null,
    ended = out.some(c => c.side === w && c.from === 'fever'); // (not back into Fever on the point it ended)
  const zoneIn = m.stage[w] !== 'fever' && !ended && !!why && feverReady(m, w);
  if (zoneIn) put(w, 'fever', why);
  // every other stage from the fire
  for (const i of [0, 1]) if (m.stage[i] !== 'fever') put(i, fireStage(m, i), i === w ? 'fire' : 'fire');
  return { zoneIn, breaker, changes: out };
}
/** A timeout (spec §2.14): the calling side out of Loose at once; the other side's Fever cools to Focused. */
function stageTimeout(m, L) {
  const out = [];
  if (m.stage[L] === 'loose') out.push(stageSet(m, L, 'composed', 'timeout'));
  if (m.stage[1 - L] === 'fever' && m.mom[1 - L] < 0.5) out.push(stageSet(m, 1 - L, 'focused', 'timeout'));
  return out.filter(Boolean);
}
/** A side's stage buff for one stat (spec §2.14): atk (power in play), def, spd, jump, serve → a multiplier. */
const stageBuff = (p, k) => {
  const S = CM && CM.stage && STAGES[p.traits ? trStage(p, CM.stage[sideOf(p)]) : CM.stage[sideOf(p)]]; // (Dead Calm: never Loose)
  const W = CM && CM.weak && WAR_STAGES[CM.weak[sideOf(p)]]; // × the war stage's cut (spec §4.34: a Strained … Broken side plays weaker)
  return (S && S.buff[k] ? 1 + S.buff[k] / 100 : 1) * cardBuff(p, k) * (p.traits ? trBuff(p, k) : 1) * (W && W.cut ? 1 - W.cut / 100 : 1); // × the tactic cards (spec §2.33), the Sparks / Scars (§4.30)
};

/** Points until the side's captain can call again (0 = ready). */
function capReady(m, side) {
  return m && side >= 0 ? 0 : 0;
}
/**
 * The captain's between-point call: kind 'fire' (Fire up) | 'settle' (Settle). Applies it and returns the beats that show
 * it (empty when not ready or in a simulation).
 */
function capCall(m, side, kind) {
  return m && side >= 0 && kind ? [] : [];
}
