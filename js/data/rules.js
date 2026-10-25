// Match rules. Change here to alter scoring for every mode.

const RULES = {
  pointsToWin: 15, // one set
  court: 1.5, // court size vs the original layout: longer runs, wider net — speed and wing spikers matter more
  winBy: 2,
  timeoutsPerTeam: 1,
  // Match stamina (1 = fresh): `drain` scales every touch's cost (a hero who does everything tires first); a tired player
  // loses up to `hit` of power/defense and `jumpHit` of jump height at stamina 0. Between points a court player gets back
  // `court`, a bench player `bench` (spec §2.30: the bench rests — a tired starter is worth resting).
  stamina: { drain: 2.5, hit: 0.5, jumpHit: 0.3, court: 0.01, bench: 0.05 },
  // Settling (spec §2.39): a passer served at again and again settles in — their receive score × (1 + step × n), n = the
  // serves in a row at them so far (at most cap); each serve at a teammate takes `fade` off their count
  settle: { step: 0.08, cap: 0.3, fade: 1 },
  // The hesitation moment (spec §2.39, T-367): a duel (serve target, spike fight / avoid, block read / commit) whose AI pick and
  // runner-up score within `margin` (that duel's score points; × late[1] once either side has late[0] points) hesitates — at
  // most `cap` a side a set, one a possession. Yours on screen: the world at `slow` for `ms` real ms; the odds from `n` replays
  // of the rally (fresh dice from the hesitation, seeds from `seed`)
  hes: { margin: { srv: 0.5, atk: 2, blk: 3 }, late: [11, 1.6], cap: 3, ms: 8000, slow: 0.1, n: 32, seed: 9100 }
};
/**
 * Substitutions: at most `max` per team per set. The captain takes a player off when their match stamina is under `sta`, or
 * after `errs` errors this set (more than their kills); a bench player must have stamina ≥ `fresh` to come on; a
 * subbed-out starter with stamina ≥ `back` may return for whoever replaced them. With a candidate, the captain acts with
 * a chance between iq[0] and iq[1] (the captain's read capIQ 0 → 1) at each dead ball. A tired / erring sub must also pay off: the bench player's ovr has to be at
 * least `worth` × the starter's current worth (ovr × (1 − RULES.stamina.hit × (1 − stamina))); the factor runs from worth[0] (read 0) to
 * worth[1] (read 1) — a dull captain subs almost anyone in, a sharp one only when it helps. `you`: the captain's sub-out roll for your career
 * player is × this (the captain trusts you). A player flagged `noSub` (engine-only: an injured you) is never brought on.
 */
/**
 * Skill and mistakes (owner, 2026-10-04: as close to the real game as possible; per action, from the stats that do it — no
 * overall level). An action's level = its stats weighted by `use`; the mistake factor = e^((mid − level) / k), at most `max`
 * (mid 105, T-359: ×1.08 at 99, ×1.75 at ~63, ×2.4 at 40, ×4 for a beginner). Serve errors (serve), hitting errors (spike) and double contacts
 * (set) are × it; a passer's receive score − `pass` × (factor − 1) (pass); a blocker's stuff chance × clamp((level − blk[0]) /
 * blk[1], blk[2], blk[3]) (block). Wit stays where it was (inside each base chance).
 * Targets (share of points, real game): elite ~ kills 50 · errors 32 · blocks 11 · aces 6; amateur ~ kills 28 · errors 55 · blocks 5 · aces 12.
 * Buffs you can feel (spec §2.38, T-359): `edge` — the share of a hitter's attack buff (stageBuff 'atk': cards, stage, traits)
 * that counts in their spike level (level × (1 + edge × (buff − 1))); `feed` — the setter's weight on a hitter × buff^feed.
 */
const SKILL = {
  use: {
    serve: { power: 1 },
    spike: { power: 0.6, jump: 0.4 },
    set: { speed: 1 },
    pass: { def: 0.7, speed: 0.3 },
    block: { jump: 0.55, def: 0.45 }
  },
  mid: 105,
  k: 75,
  edge: 1,
  feed: 2,
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
  hunt: { share: 0.5, hurt: 0.4, pass: 0.97 },
  // a starter you rested (the board's Rest order, spec §2.30) comes back only with `rested` more stamina than they went off with
  rested: 0.1
};
/**
 * The second ball (spec §2.1): on a bad pass (quality 1) a free teammate sets instead of the setter only when the setter's time
 * to the set point (distance ÷ (0.5 + speed / 100), as `nearest`) is more than `beat` × that teammate's. No randoms in the choice.
 */
const SETTER = { beat: 1.6 };
/** The painted lines in engine units (as venues/floor.mjs draws them): end lines at x = end and 1000 − end, side lines at z = side and 1 − side. */
const COURT_LINES = { end: 80, side: 0.08 };
/**
 * Net touch and foot fault (spec §4.38), beside double contact. Net touch: one draw on every attack (rally-block.js
 * blockCoverage), read after the block when the block did not end it (netTouch), for the bodies at the tape — a front-row hitter (`hit`; a tip `tip` — soft, no follow-through: 0) and each blocker
 * (`read`; a middle on Commit is up early and lunges: `commit`). Each body: net[kind] × (1 + tired × (1 − stamina)) ×
 * (1 + agi × how far its speed (the engine's Agility) is under agiFrom, ÷ agiFrom) × (`reckless` for a Hothead). Foot fault:
 * every serve gets one draw (serve.js playRally): foot[serve type] × (1 + tired × (1 − stamina)).
 * Rate test (200 seeded matches): ≈ 1 net touch and ≈ 0.5 foot faults a match.
 */
const FAULTS = {
  net: { hit: 0.024, tip: 0, read: 0.017, commit: 0.027, tired: 1.5, agi: 1, agiFrom: 60, reckless: 1.6 },
  foot: { jump: 0.026, jumpfloat: 0.013, float: 0.005, tired: 1 }
};
/**
 * Terrain (spec §4.38, T-339): a field match carries its ground (`m.ground = { k, home: [ids], low: side }`) and its wind (`m.wind`
 * 0–1); official courts carry none and play exactly as before (every hook below is × 1 / + 0 without them, and draws only with them).
 * Multipliers on a player's Agility (`agi`: the speed term of receive / dig, how far they reach before diving) and jump (`jump`: spike
 * and block); `hp` × the HP a kept-up ball takes (spec §2.31); `dig` × every dig score (sand: the ball dies fast); `pass` off every
 * receive score; `bounce` = the chance a dig takes a bad bounce (one draw a dig, grass only), `bad` off that dig; `set` off every set's
 * success; `serve` added to the low side's serve error chance (`m.ground.low` serves into the rise); `ko` = your injury chance a knockdown (career side,
 * by hash: asphalt). wind: off a float's receive score × m.wind × a draw in 0.5–1.5 (jump floats `jumpfloat`, jump serves none).
 * home: a player born to the ground (`m.ground.home`; `region` → their pool's region) keeps `keep` of each penalty and gets `plus` on
 * agi / jump. Sized so equal teams stay within ≈ ±5 % win odds (tests/drone.test.js measures it).
 */
const GROUNDS = {
  sand: { name: 'Sand', agi: 0.9, jump: 0.9, hp: 0.8, dig: 0.94 },
  grass: { name: 'Grass', pass: 5, bounce: 0.08, bad: 22, jump: 0.95 },
  asphalt: { name: 'Asphalt', hp: 1.3, ko: 0.05 },
  slope: { name: 'Slope', agi: 0.96, set: 0.03, serve: 0.03 },
  wind: { float: 9, jumpfloat: 5 },
  home: { keep: 0.4, plus: 0.01, region: { sand: 'wu', slope: 'shu' } }
};
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
