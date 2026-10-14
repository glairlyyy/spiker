// Match rules. Change here to alter scoring for every mode.

const RULES = {
  pointsToWin: 15, // one set
  court: 1.5, // court size vs the original layout: longer runs, wider net — speed and wing spikers matter more
  winBy: 2,
  timeoutsPerTeam: 1,
  // Match stamina (1 = fresh): `drain` scales every touch's cost (a hero who does everything tires first); a tired player
  // loses up to `hit` of power/defense and `jumpHit` of jump height at stamina 0. Between points a court player gets back
  // `court`, a bench player `bench` (spec §2.30: the bench rests — a tired starter is worth resting).
  stamina: { drain: 2.5, hit: 0.5, jumpHit: 0.3, court: 0.01, bench: 0.05 }
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
/**
 * Skill and mistakes (owner, 2026-10-04: as close to the real game as possible; per action, from the stats that do it — no
 * overall level). An action's level = its stats weighted by `use`; the mistake factor = e^((mid − level) / k), at most `max`
 * (×1.4 at 99, ×2.3 at ~63, ×3 at 40, ×4 for a beginner). Serve errors (serve), hitting errors (spike) and double contacts
 * (set) are × it; a passer's receive score − `pass` × (factor − 1) (pass); a blocker's stuff chance × clamp((level − blk[0]) /
 * blk[1], blk[2], blk[3]) (block). Wit stays where it was (inside each base chance).
 * Targets (share of points, real game): elite ~ kills 50 · errors 32 · blocks 11 · aces 6; amateur ~ kills 28 · errors 55 · blocks 5 · aces 12.
 */
const SKILL = {
  use: {
    serve: { power: 1 },
    spike: { power: 0.6, jump: 0.4 },
    set: { speed: 1 },
    pass: { def: 0.7, speed: 0.3 },
    block: { jump: 0.55, def: 0.45 }
  },
  mid: 125,
  k: 75,
  max: 4,
  blk: [30, 60, 0.2, 1],
  pass: 4
};
const SUB = {
  max: 4,
  sta: 0.6,
  fresh: 0.9,
  errs: 3,
  back: 0.85,
  iq: [0.35, 0.9],
  you: 0.9,
  worth: [0.85, 1.05],
  // the targeted passer (owner, 2026-10-12): they serve at one of ours (`share` of their serves, at least noticeAt(T) of them)
  // and it hurts (aces + loose passes + knockdowns ≥ `hurt` of those serves) → a bench player who passes at least `pass` ×
  // as well comes in — their hunt has to start over; a passer taken off for this does not come straight back
  hunt: { share: 0.5, hurt: 0.4, pass: 0.97 }
};
/**
 * The second ball (spec §2.1): on a bad pass (quality 1) a free teammate sets instead of the setter only when the setter's time
 * to the set point (distance ÷ (0.5 + speed / 100), as `nearest`) is more than `beat` × that teammate's. No randoms in the choice.
 */
const SETTER = { beat: 1.6 };
const rulesText = () => `First to ${RULES.pointsToWin}, win by ${RULES.winBy}`;
/**
 * Relationships on court (T-066, spec §4.23 E; career matches only: every effect is gated on `m.rel`, so Monster / sims / the golden
 * matches are untouched). trust / freeze: the setter's weight for an ally / a resent-or-enemy hitter once either side has `clutch`
 * points; cover: added to an ally's save chance (block cover, pop-up); buff: the captain's buff weighs allies ×this; rival: the form an NPC rival starts with (fired up = proud / reckless, else rattled). No raw stat bonuses.
 */
const REL_E = {
  trust: 0.15,
  freeze: 0.15,
  clutch: 12,
  cover: 0.12,
  buff: 2,
  rival: { fired: 0.3, rattled: -0.2 }
};
