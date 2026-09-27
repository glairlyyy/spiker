// Effective stats during a match: wit, mood, momentum and stamina modifiers; derived numbers.

/** The match being played: set by playRally(), read by the effective-stat helpers below. */
let CM = null;
const sideOf = p => (CM.t[0] === p.team ? 0 : 1);
/** Captain's buff on a player this match: level 1–3 (0 = none). */
const buffLv = p => (CM && CM.buff && CM.buff[p.id] ? CM.buff[p.id].lv : 0);
const W = p => (CM && CM.mood ? clamp(p.wit * (1 + 0.12 * (CM.mood[p.id] || 0)) + 0.08 * buffLv(p), 0.1, 2) : p.wit);
const staOf = p => (CM && CM.sta && CM.sta[p.id] != null ? CM.sta[p.id] : 1);
const boost = p =>
  CM && CM.mood ? (1 + 0.06 * CM.mom[sideOf(p)] + 0.05 * (CM.mood[p.id] || 0)) * (0.85 + 0.15 * staOf(p)) * (1 + 0.05 * buffLv(p)) : 1;
const witMul = w => 0.75 + 0.25 * w;
const effP = p => p.power * witMul(W(p)) * boost(p);
const effD = p => p.def * witMul(W(p)) * boost(p);
const jumpPx = p => (20 + p.jump * 0.9 * p.team.S.jump) * (0.85 + 0.15 * staOf(p));
const jumpCm = p => Math.round(45 + p.jump * 0.55 * p.team.S.jump);
const kmh = pow => Math.round(40 + pow * 0.85);
/** Serve style a player uses (jump serve needs a strong enough serve roll). */
const serveType = (p, sq) => (p.role === 'WS' && sq > 55 ? 'jump' : p.speed >= 60 || p.jump >= 65 ? 'jumpfloat' : 'float');
/** Run-up distance in metres for a running serve: faster/stronger players take a longer approach. */
const runUpM = (p, type) =>
  +(type === 'jump' ? 2.4 + p.speed * 0.014 + p.power * 0.006 : type === 'jumpfloat' ? 1.1 + p.speed * 0.008 : 0).toFixed(1);
const UNITS_PER_M = 420 / 9; // half court = 9 m
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
  return passF * (2.2 - tech) * tired * nerves;
}
/** Setter dump/feint multiplier from wit and jump (0.15–2.2). */
const dumpThreat = (p, wit = p.wit) => clamp(0.25 + (wit - 1) * 0.6 + (p.jump - 50) / 60, 0.15, 2.2);
/** Drain stamina (skills, defense and speed soften it; floor 0.05). */
function dr(m, p, v) {
  m.sta[p.id] = clamp(
    (m.sta[p.id] == null ? 1 : m.sta[p.id]) - v * 1.3 * skillMod(p, 'stamina') * (1.3 - (p.def + p.speed) / 400),
    0.05,
    1
  );
}
/** Shift mood by v (clamped to −1..1). */
function md(m, p, v) {
  m.mood[p.id] = clamp((m.mood[p.id] || 0) + v, -1, 1);
}
