// Coach tactics: how the setter distributes the ball.
// quick = multiplier on the quick-attack chance (quickCap caps it), w = weight multiplier by role
// when picking the spiker, read = block/fake-read bonus the defense gets when the focused role attacks.

const TACTICS = {
  auto: { name: "Setter's call", short: 'Setter', quick: 1, quickCap: 0.7, w: {}, focus: null, read: 0 },
  ws: { name: 'WS focus', short: 'WS', quick: 0.35, quickCap: 0.7, w: { WS: 1.7, MB: 0.6 }, focus: 'WS', read: 0.08 },
  mb: { name: 'MB focus', short: 'MB', quick: 1.9, quickCap: 0.85, w: { MB: 2.2, WS: 0.8 }, focus: 'MB', read: 0.08 }
};

/** Defence settings (per side, like TACTICS): how the two front-row defenders start and read the attack. */
const DEFSETS = {
  read: { name: 'Read', short: 'Read', desc: 'Wait for the set. Late on quicks.' },
  commit: { name: 'Commit', short: 'Commit', desc: 'Middle jumps with the quick. Open to decoys and high balls outside.' },
  bunch: { name: 'Bunch', short: 'Bunch', desc: 'Both start in the middle. Pins open.' }
};
/** A team's own defence setting: from its playstyle (Wall bunches, Tempo commits, the rest read). */
const defOf = t => (t && t.S && t.S.dset) || 'read';
/**
 * Block formation numbers (engine/rally-block.js formBlock). laneL / laneR: net position (0–1) where the pin lanes start;
 * lateCov / splitCov: coverage × when the blocker arrives late / hands split (poor read); swingReach / swingCov: the far
 * blocker swinging across after the middle bit; commitQuick / commitMiss / commitReach: Commit's middle on a quick (coverage ×,
 * reach ×: already up) / on anything else (coverage ×);
 * bunchMid / bunchPin: Bunch's coverage in the middle / on the pins; bunchStartZ: where both start in Bunch.
 */
const BLOCK = {
  laneL: 0.38,
  laneR: 0.62,
  lateCov: 0.8,
  splitCov: 0.85,
  swingReach: 0.8,
  swingCov: 0.75,
  commitQuick: 1.6,
  commitReach: 3.5,
  commitMiss: 0.6,
  bunchMid: 1.25,
  bunchStartZ: [0.42, 0.58],
  bunchPin: 0.65
};

/**
 * Laning (spec §2.24): the hitter aims at a channel — `line` (down their own side) or `cross` (to the far side) — and the
 * block reads one before the hit. habit: a hitter's line share [min, max] (a hash of the player; power hitters lean cross by
 * powerCross per power point). readK: how far a blocker trusts what they've seen this match (× their read quality, readQ).
 * see0 / seeK / seeMax: how much the hitter reacts to the block's shade (wit vs the blocker's wit); away: the hitter's line share
 * when they react fully (away from a line read; 1 − away from a cross read). weakK: a double block — the
 * lean toward the weaker blocker's hand, per point of block strength. on / off / offDbl: the block's coverage × when the shot
 * goes into the read channel / the other one (a single block, a double). handK: the hand that meets the ball, its strength
 * against the pair's average (± per point). shade: the dig distance × when the shot goes where the block was not (the back row
 * covers it). crossMin: the cross target is at least this far across (a middle attack angles to a corner).
 */
const LANE = {
  habit: [0.3, 0.7],
  powerCross: 0.002,
  readK: 2.2,
  see0: 0,
  seeK: 0.5,
  seeMax: 0.6,
  away: 0.25,
  weakK: 0.012,
  on: 1.25,
  off: 0.4,
  offDbl: 0.65,
  handK: 0.008,
  shade: 0.85,
  crossMin: 0.3
};
