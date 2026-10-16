// Effective stats during a match: wit, mood, stamina and the momentum stage's buffs (stageBuff, js/engine/fire.js); derived numbers.

/** The match being played: set by playRally(), read by the effective-stat helpers below. */
let CM = null;
const sideOf = p => (CM.t[0] === p.team ? 0 : 1);
/** Captain's buff on a player this match: level 1–3 (0 = none). */
const buffLv = p => (CM && CM.buff && CM.buff[p.id] ? CM.buff[p.id].lv : 0);
const W = p => (CM && CM.mood ? clamp(p.wit * (1 + 0.12 * (CM.mood[p.id] || 0)) + 0.08 * buffLv(p), 0.1, 2) : p.wit);
const staOf = p => (CM && CM.sta && CM.sta[p.id] != null ? CM.sta[p.id] : 1);
const boost = p =>
  CM && CM.mood
    ? (1 + 0.05 * (CM.mood[p.id] || 0)) * (1 - RULES.stamina.hit * (1 - staOf(p))) * (1 + 0.05 * buffLv(p)) // (the stage buffs: stageBuff)
    : 1;
const witMul = w => 0.75 + 0.25 * w;
/** Wit's share of power / defense: a negative wit counts as a plain 1 — it never lowers the body. */
const witBody = p => witMul(p.wit < 0 ? 1 : W(p));
const effP = p => p.power * witBody(p) * boost(p);
const effD = p => p.def * witBody(p) * boost(p) * stageBuff(p, 'def');
const jumpPx = p => (20 + p.jump * 0.9 * p.team.S.jump) * (1 - RULES.stamina.jumpHit * (1 - staOf(p))) * stageBuff(p, 'jump');
const kmh = pow => Math.round(40 + pow * 0.85);
/**
 * The power p's ball shows on screen (speed label, flight time, top-speed stat): the card edge shows (owner, 2026-10-16: a
 * tactic you can see), never above POW_VIS_MAX (300 km/h — it had shown 540). k: the stat the edge reads (kept for callers).
 */
const POW_VIS_MAX = (300 - 40) / 0.85;
const powVis = (p, pow) => Math.min(pow, POW_VIS_MAX);
/**
 * How high p jumps on screen: a card edge for them shows (owner, 2026-10-16: 3–4 m jumps look anime), and an edge against
 * them never shrinks the jump. No hard cap (owner, 2026-10-16): up to JUMP_SOFT.knee metres the height is as raw; above it,
 * each extra metre counts exponentially less, approaching JUMP_SOFT.max (`jumpSoft`; the slope is continuous at the knee).
 */
const JUMP_SOFT = { knee: 1.8, max: 3.2 };
const jumpSoft = m => {
  const { knee: k, max: a } = JUMP_SOFT;
  return m <= k ? m : k + (a - k) * (1 - Math.exp(-(m - k) / (a - k)));
};
const jumpVis = p => jumpSoft(Math.max(jumpPx(p), jumpPx(p) / edgeK(p, 'jump')) * UNIT_M.h) / UNIT_M.h;
/** The spike's "↑ cm" label: the height the body rises on screen (it was a realistic vertical that did not match the jump). */
const jumpCm = p => Math.round(jumpVis(p) * UNIT_M.h * 100);
/** Serve style a player uses (jump serve needs a strong enough serve roll). */
const serveType = (p, sq) => (p.role === 'WS' && sq > 55 ? 'jump' : p.speed >= 60 || p.jump >= 65 ? 'jumpfloat' : 'float');
/** Run-up distance in metres for a running serve: faster/stronger players take a longer approach. */
const runUpM = (p, type) =>
  +(type === 'jump' ? 2.4 + p.speed * 0.014 + p.power * 0.006 : type === 'jumpfloat' ? 1.1 + p.speed * 0.008 : 0).toFixed(1);
const UNITS_PER_M = Z_UNITS / 9; // half court = 9 m
/**
 * Chance a hand set is called for a double contact. Driven by:
 * pass quality (scrambled balls are hard to set cleanly), setting technique (wit; non-setters much worse),
 * tired hands (stamina) and nerves (negative mood). Clean pass + good fresh setter ≈ 0.3%.
 */
function doubleContactP(setter, qual, w) {
  const tech = clamp(setter.role === 'S' ? w : w * 0.6, 0.3, 2);
  const passF = [0, 0.06, 0.03, 0.005][qual];
  const tired = 1 + (1 - staOf(setter)) * 1.5;
  const nerves = 1 + Math.max(0, -((CM && CM.mood[setter.id]) || 0)) * 0.8;
  return Formula.bySkill(setter, 'set', passF * (2.2 - tech) * tired * nerves); // (a weak setter's hands are worse: SKILL)
}
/** Setter dump/feint multiplier from wit and jump (0.15–2.2). */
const dumpThreat = (p, wit = p.wit) => clamp(0.25 + (wit - 1) * 0.6 + (p.jump - 50) / 60, 0.15, 2.2);
/** Drain stamina (skills, defense and speed soften it; floor 0.05). */
function dr(m, p, v) {
  m.sta[p.id] = clamp(
    (m.sta[p.id] == null ? 1 : m.sta[p.id]) -
      v * RULES.stamina.drain * skillMod(p, 'stamina') * (1.3 - (p.def + p.speed) / 400) * (1 + HP.drain * (1 - hpOf(m, p))), // low HP drains more (spec §2.31)
    0.05,
    1
  );
}
/** Shift mood by v (clamped to −1..1). */
function md(m, p, v) {
  m.mood[p.id] = clamp((m.mood[p.id] || 0) + v, -1, 1);
}
