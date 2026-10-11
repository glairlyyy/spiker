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
  on: 1.32,
  off: 0.4,
  offDbl: 0.65,
  handK: 0.008,
  shade: 0.85,
  crossMin: 0.3
};

/**
 * Coach panel (spec §2.25): a pattern becomes a tag once it is clear — at least `min` cases and `share` of them one way
 * (a hitter's channel), `serve` of a side's serves at one receiver, `read` of the block's reads right or wrong.
 */
const COACH = { min: 5, share: 0.7, serve: 0.5, read: 0.65 };

/**
 * Team plans (spec §2.26): one attack plan and one defence plan per side, picked at match prep (the captain or the coach;
 * hidden from the other side) and changed only at a timeout. Each tilts points — none decides one. `cost` is shown with the
 * effect (§9.1: cost → result). Numbers: see the engine hooks (serve.js serveAim / serveContact, lanes.js, rally.js
 * spikePower / hittingError, rally-defense.js block / digSetup).
 */
const PLANS = {
  atk: {
    straight: {
      name: 'Play it straight',
      short: 'Straight',
      desc: 'Every hitter plays their own game.',
      cost: 'Nothing to read, nothing extra.'
    },
    hunt: {
      name: 'Hunt the passer',
      short: 'Hunt',
      desc: 'Serves and spikes go at their weakest passer, wherever they stand.',
      cost: 'Predictable: their block reads you faster. A few more serve errors.',
      readK: 1.5,
      serveErr: 1.1,
      huntK: 0.45,
      press: 8
    },
    beat: {
      name: 'Beat the block',
      short: 'Beat',
      desc: 'Hitters watch the block and go where it is not, at the weaker hand.',
      cost: 'More cut shots and finesse: a few more hitting errors.',
      see: 2.2,
      cutK: 0.12,
      cov: 0.88,
      seam: 1.3,
      err: 1.08
    },
    power: {
      name: 'Power through',
      short: 'Power',
      desc: 'Ignore the block and swing hardest.',
      cost: 'More balls into the net and out.',
      see: 0,
      pow: 1.15,
      err: 1.1
    }
  },
  def: {
    read: { name: 'Read & react', short: 'Read', desc: 'The block reads what it has seen.', cost: 'Nothing extra.' },
    cover: {
      name: 'Cover the weak link',
      short: 'Cover',
      desc: 'The back row shades to protect your weakest passer.',
      cost: 'The rest of the floor is a little more open.',
      weakRs: 14,
      weakDd: 0.75,
      otherRs: -5,
      otherDd: 1.12
    },
    wall: {
      name: 'Wall their ace',
      short: 'Wall',
      desc: 'Their best hitter meets the full block and a sharper read.',
      cost: 'Everyone else faces a thinner block.',
      aceRead: 1.6,
      aceCov: 1.35,
      otherCov: 0.85
    },
    deep: {
      name: 'Dig deep',
      short: 'Deep',
      desc: 'The block takes the line; the back row plays deep against power.',
      cost: 'Fewer stuffs, and tips drop in.',
      stuff: 0.85,
      hardKill: 0.75,
      powFrom: 70,
      tipKill: 1.25
    }
  }
};
/** A team's own plans from its playstyle (the coach's default before scouting the opponent). */
const PLAN_STYLE = {
  power: ['power', 'read'],
  wall: ['straight', 'wall'],
  tempo: ['beat', 'read'],
  counter: ['straight', 'deep'],
  sky: ['power', 'read'],
  bombers: ['hunt', 'read'],
  mind: ['beat', 'cover'],
  balanced: ['straight', 'read']
};
/** The AI coach and plans (spec §2.26): coach IQ from which it scouts before the match; the ace / weak-passer gaps it acts on. */
const PLAN_AI = { iq: 0.7, aceGap: 8, passGap: 10 };
/** The AI coach's huddle line when it changes plan (spec §2.26): that there is a new plan, never what it is. */
const PLAN_LINES = ['New plan. Listen up.', 'We change it. Now.', "They've shown us enough. Here's what we do.", 'Forget the old plan.'];
