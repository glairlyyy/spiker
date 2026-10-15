// The bars (spec §2.31): HP (rally damage, partial heal, collapse = the knockdown) and per-player morale (today's fire rules
// for each player, shaped by a morale trait). The team's fire (`m.mom`) is the on-court average morale, the captain counting
// double — stages, HUD and director read it as before. No randoms: traits come from a hash of the player.

/** A player's morale trait id (MTRAITS) or null; `p.mtrait` overrides (null = none). Never your career player for now. */
function mtraitOf(p) {
  if (p.mtrait !== undefined) return p.mtrait;
  if (p.you) return null;
  const key = `${p.name}|${p.role}`,
    c = MT_CACHE.get(p);
  if (c && c[0] === key) return c[1];
  const h = hu(p, 'mtrait');
  let a = 0,
    t = null;
  for (const k in MTRAITS)
    if (h < (a += MTRAITS[k].share)) {
      t = k;
      break;
    }
  MT_CACHE.set(p, [key, t]);
  return t;
}
/** mtraitOf's cache (the hash is the slow part): player → [name|role, trait]. */
const MT_CACHE = new WeakMap();
/** In this match (m.noTraits: the tests' plain match). */
const mtr = (m, p) => (m && m.noTraits ? null : mtraitOf(p));

/** HP 0–1 (1 before the first hit). */
const hpOf = (m, p) => (m && m.hp && m.hp[p.id] != null ? m.hp[p.id] : 1);
/**
 * A ball kept up (serve receive or dig): HP damage by how hard it is for this receiver — r = ball power / Defense as played;
 * HP.base at a typical ball (r = HP.r0), × (r / r0)^HP.exp (spec §2.31: an average player goes down on the 2nd or 3rd hit
 * of a rally, on the 1st when the gap is big). Returns true when the player collapses (HP 0). No randoms.
 */
function hpHit(m, p, pow) {
  const r = pow / Math.max(1, effD(p)),
    dmg = Math.min(HP.max, HP.base * Math.pow(r / HP.r0, HP.exp));
  if (m.hpLog) ((m.hpLog.n += 1), (m.hpLog.dmg += dmg));
  m.hp[p.id] = Math.max(0, hpOf(m, p) - dmg);
  return m.hp[p.id] <= 0;
}
/** Between rallies: court players heal HP.heal, the bench all of it. */
function hpHeal(m) {
  for (const t of m.t)
    for (const p of squadOf(t)) m.hp[p.id] = t.P.includes(p) ? Math.min(1, Math.max(hpOf(m, p) + HP.heal, m.down[p.id] ? HP.up : 0)) : 1;
}

/** A player's morale (−1..1). */
const morOf = (m, p) => (m.mor && m.mor[p.id]) || 0;
/** Side i's fire: the on-court players' average morale, the captain counting double. */
function fireOf(m, i) {
  const T = m.t[i];
  let s = 0,
    n = 0;
  for (const p of T.P) {
    const k = p === T.cap ? 2 : 1;
    s += k * morOf(m, p);
    n += k;
  }
  return n ? clamp(s / n, -1, 1) : 0;
}
/** Shift every squad player of side i by v (a team-wide push: element spikes, the zone breaker, timeouts). */
function morAdd(m, i, v) {
  for (const p of squadOf(m.t[i])) m.mor[p.id] = clamp(morOf(m, p) + v, -1, 1);
  m.mom[i] = fireOf(m, i);
}
/** Move side i's fire to v by shifting everyone alike (the old `m.mom[i] = v`). */
const fireTo = (m, i, v) => morAdd(m, i, v - m.mom[i]);

/**
 * After a point won by w (spec §2.31): every squad player's morale by the old fire rules (gain on a won point, the heat of a
 * lost one, the shakes), shaped by their trait; then each side's fire from it. fade(i) = Fever's full rate or the slower one.
 */
function morPoint(m, w, fade, LD) {
  const L = 1 - w,
    K = MOM_LOSS,
    shake = momShaken(m, L),
    gain = (0.1 + (m.streak[w] >= 3 ? 0.07 : 0) + m.big * 0.1) * (1 + LD(w) * 0.6),
    killer = m.lastK,
    stuffed = m.lastPlay === 'killblock' && m.ctx0 && m.ctx0.spiker ? m.ctx0.spiker.id : null;
  for (const p of squadOf(m.t[w])) {
    const T = MTRAITS[mtr(m, p)] || {},
      own = killer === p.id;
    let g = gain;
    if (killer && !own && T.mates) g *= T.mates;
    if (own && T.kill) g += T.kill;
    m.mor[p.id] = clamp(morOf(m, p) * (1 - 0.15 * fade(w)) + g, -1, 1);
  }
  let low = null;
  for (const p of squadOf(m.t[L])) {
    const T = MTRAITS[mtr(m, p)] || {},
      mo = morOf(m, p),
      heat = clamp(K.heat + K.hot * mo, K.min, K.max);
    let loss = (0.09 + m.big * 0.05) * fade(L) * heat;
    if (T.lost) loss *= T.lost;
    loss += shake * (T.shake || 1);
    if (T.up && (m.errBy === p.id || stuffed === p.id)) loss = -T.up; // Spiteful: their own error / being stuffed fires them up
    m.mor[p.id] = clamp(mo * (1 - 0.15 * fade(L)) - loss, -1, 1);
    if (m.t[L].P.includes(p) && (!low || morOf(m, p) < morOf(m, low))) low = p;
  }
  for (const p of m.t[L].P) {
    const T = MTRAITS[mtr(m, p)];
    if (T && T.lift && low && low !== p) m.mor[low.id] = clamp(morOf(m, low) + T.lift, -1, 1);
  }
  m.mom[w] = fireOf(m, w);
  m.mom[L] = fireOf(m, L);
}
