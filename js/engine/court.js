// Court geometry in engine units: x 0..1000 along the court (net at 500), z 0..1 across.

const NETX = 500;
const HOME = { S: [445, 0.62], MB: [472, 0.4], W0: [315, 0.24], W1: [235, 0.76] };
const RSPOT = [
    [40, 0.72],
    [470, 0.3],
    [440, 0.7],
    [250, 0.42]
  ],
  RECV0 = [225, 0.8];
const ROT = ['S', 'W0', 'MB', 'W1'];
const sx = (side, x) => (side === 0 ? x : 1000 - x);
const DIR = s => (s === 0 ? 1 : -1);
const home = (p, side) => [sx(side, HOME[p.slot][0]), HOME[p.slot][1]];
/** Court size multiplier for the match being played (RULES.court). */
const courtScale = () => (CM && CM.court) || RULES.court;
/** Distance in court units, scaled by court size: on a bigger court everyone has further to run. */
const dist = (a, x, z) => Math.hypot((a.x - x) / 420, a.z - z) * courtScale();
