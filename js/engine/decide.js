// Decision points (spec §2.13, T-232): where a played match asks you instead of the AI. The engine computes the AI's pick
// first (the same draws as the sim flow), then `yield* decide(m, q)`: for `m.human`'s own player the rally suspends with
// q = { kind, p, options, ai } and resumes with the pick (null → the AI's); for everyone else, and whenever `m.human` is
// unset (sim, headless, NPCs, the Monster game), it returns q.ai at once without suspending. No draws here.

/** Ask the picker: yields only for m.human's player. Returns the pick (an option id). */
function* decide(m, q) {
  if (!m.human || !q.p || q.p.id !== m.human) return q.ai;
  m.askAt = m.beats ? m.beats.length : 0; // what the player may have seen played: later inserts land after it
  const pick = yield q;
  CM = m; // the effective-stat helpers read the match being played (something else may have run while suspended)
  return pick == null ? q.ai : pick;
}
