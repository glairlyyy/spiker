// Court geometry in engine units: x 0..1000 along the court (net at 500), z 0..1 across.

const NETX = 500;
/** Scale: the court's z 0..1 (across) is as long as Z_UNITS x units (distances and ball flights). */
const Z_UNITS = 420;
/** Metres per unit for the 3D view: heights `h` (net tape 150 units = 2.43 m), along x `x` (the big court), across z `z`. */
const UNIT_M = { h: 2.43 / 150, x: (1.5 * 2.43) / 150, z: 12 };
/** Ball flight speed: units per ms per km/h — attacks and digs (BALL_K), serves (SERVE_K). */
const BALL_K = 0.012,
  SERVE_K = 0.011;
/** Standing contact height of a hitter's hand (height units: the net tape is at 150); the jump is added on top. */
const REACH_H = 118;
/** Base positions by slot for side 0 ([x, z]); sx() mirrors them for side 1. */
const HOME = { S: [445, 0.62], MB: [472, 0.4], W0: [315, 0.24], W1: [235, 0.76] };
/** Serve-time spots by rotation index (0 = the server); RECV0 replaces index 0 for the receiving side. */
const RSPOT = [
    [40, 0.72],
    [470, 0.3],
    [440, 0.7],
    [250, 0.42]
  ],
  RECV0 = [225, 0.8];
/** Rotation order of the slots. */
const ROT = ['S', 'W0', 'MB', 'W1'];
/** Mirror an x coordinate for a side (side 0 plays on the low-x half). */
const sx = (side, x) => (side === 0 ? x : 1000 - x);
/** Direction toward the net for a side: +1 or −1 along x. */
const DIR = s => (s === 0 ? 1 : -1);
/** A player's base position [x, z] for their side. */
const home = (p, side) => [sx(side, HOME[p.slot][0]), HOME[p.slot][1]];
/** Court size multiplier for the match being played (RULES.court). */
const courtScale = () => (CM && CM.court) || RULES.court;
/** Distance in court units, scaled by court size: on a bigger court everyone has further to run. */
const dist = (a, x, z) => Math.hypot((a.x - x) / Z_UNITS, a.z - z) * courtScale();
