// Team fire, stages, temperament and the captain's calls (spec §2.14, §2.17). Stubs until T-259 / T-260 fill them: the
// HUD (Agent A) and the director (Agent C) build against this interface. Draws no randoms unless a task says so.

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
