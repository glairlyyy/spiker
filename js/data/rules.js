// Match rules. Change here to alter scoring for every mode.

const RULES = {
  pointsToWin: 15, // one set
  court: 1.5, // court size vs the original layout: longer runs, wider net — speed and wing spikers matter more
  winBy: 2,
  timeoutsPerTeam: 1,
  // Match stamina (1 = fresh): `drain` scales every touch's cost (a hero who does everything tires first); a tired player
  // loses up to `hit` of power/defense and `jumpHit` of jump height at stamina 0.
  stamina: { drain: 1.7, hit: 0.4, jumpHit: 0.3 }
};
/**
 * Substitutions: at most `max` per team per set. A coach takes a player off when their match stamina is under `sta`, or
 * after `errs` errors this set (more than their kills); a bench player must have stamina ≥ `fresh` to come on; a
 * subbed-out starter with stamina ≥ `back` may return for whoever replaced them. With a candidate, the coach acts with
 * a chance between iq[0] and iq[1] (coachIQ 0 → 1) at each dead ball.
 */
const SUB = { max: 2, sta: 0.6, fresh: 0.9, errs: 3, back: 0.85, iq: [0.35, 0.9] };
/**
 * The second ball (spec §2.1): on a bad pass (quality 1) a free teammate sets instead of the setter only when the setter's time
 * to the set point (distance ÷ (0.5 + speed / 100), as `nearest`) is more than `beat` × that teammate's. No randoms in the choice.
 */
const SETTER = { beat: 1.6 };
const rulesText = () => `First to ${RULES.pointsToWin}, win by ${RULES.winBy}`;
