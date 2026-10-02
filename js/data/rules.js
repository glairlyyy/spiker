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
 * a chance between iq[0] and iq[1] (coachIQ 0 → 1) at each dead ball. A tired / erring sub must also pay off: the bench player's ovr has to be at
 * least `worth` × the starter's current worth (ovr × (1 − RULES.stamina.hit × (1 − stamina))); the factor runs from worth[0] (coachIQ 0) to
 * worth[1] (coachIQ 1) — a dull coach subs almost anyone in, a sharp one only when it helps. `you`: the coach's sub-out roll for your career
 * player is × this (the coach trusts you). A player flagged `noSub` (engine-only: an injured you) is never brought on.
 */
const SUB = { max: 2, sta: 0.6, fresh: 0.9, errs: 3, back: 0.85, iq: [0.35, 0.9], you: 0.9, worth: [0.85, 1.05] };
/**
 * The second ball (spec §2.1): on a bad pass (quality 1) a free teammate sets instead of the setter only when the setter's time
 * to the set point (distance ÷ (0.5 + speed / 100), as `nearest`) is more than `beat` × that teammate's. No randoms in the choice.
 */
const SETTER = { beat: 1.6 };
const rulesText = () => `First to ${RULES.pointsToWin}, win by ${RULES.winBy}`;
/**
 * Relationships on court (T-066, spec §4.23 E; career matches only: every effect is gated on `m.rel`, so Monster / sims / the golden
 * matches are untouched). trust / freeze: the setter's weight for an ally / a resent-or-enemy hitter once either side has `clutch`
 * points; cover: added to an ally's save chance (block cover, pop-up); buff: the captain's buff weighs allies ×this; ego: the steal
 * chance ×ally / ×rival; rival: the form an NPC rival starts with (fired up = proud / reckless, else rattled). No raw stat bonuses.
 */
const REL_E = {
  trust: 0.15,
  freeze: 0.15,
  clutch: 12,
  cover: 0.12,
  buff: 2,
  ego: { ally: 0.5, rival: 1.5 },
  rival: { fired: 0.3, rattled: -0.2 }
};
/**
 * Ego (spec §2.12, T-068): every player has `ego` 0–1; a low-wit player acts on it. Per opportunity the chance of an ego act is
 * `base[act] × ego × (1 − maturity) × (1 − captain maturity × captain)` (maturity(p) = clamp((wit − 0.5) / 1.5, 0, 1); the
 * captain on court calls it off). steal: a teammate who is up to `reach` × the nearest player's time to the ball still goes for
 * it; they collide with chance `collide × (1 − the pair's mean maturity)`, a crash multiplies the touch's score by `crash`
 * (else the thief just takes the touch). call: a hitter demands the set — the setter gives in with chance (1 − setter maturity).
 * solo: the ego blocker ignores the defence setting and blocks alone: coverage × (1 + `solo.gain` × read − `solo.loss` ×
 * (1 − maturity)); the other front-row defender also commits with chance `solo.collide` × (1 − their maturity) — a block collision: no block
 * touch this attack, and in `solo.net` of collisions a net fault (point to the attackers, T-069). swing: on a bad set the ego hitter swings full power (set penalty × `swing.pow` instead of the bad-set 0.72, no
 * tip), errors × (1 + `swing.err` × (1 − maturity)). serve: the ego server goes for a jump serve (power × `serve.sq`, +`serve.err`
 * × (1 − maturity) service-error chance).
 */
const EGO = {
  base: { steal: 0.14, call: 0.11, solo: 0.1, swing: 0.4, serve: 0.1 },
  captain: 0.7,
  reach: 1.6,
  collide: 0.5,
  crash: 0.55,
  solo: { gain: 0.5, loss: 0.35, collide: 0.25, net: 0.3 },
  swing: { pow: 0.95, err: 0.6 },
  serve: { sq: 1.06, err: 0.06 },
  mood: 0.1, // an ego act that works lifts the player's mood by this, one that fails lowers it …
  mom: 0.04 // … and costs the team this much momentum
};
