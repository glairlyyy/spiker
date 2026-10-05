// Attack poses (split from poses3d.mjs): the spike swing and the running jump serve, the landing after a swing, and the
// float serve; RA (right-arm keys with a palm direction, also used by the dive in poses3d.mjs). Same conventions as poses3d.mjs.
// Import cycle with poses3d.mjs: this module is evaluated first, so its top level may only use its own names, THREE,
// mirror and clamp (hence its own V and leg); everything imported from poses3d.mjs is used inside functions only.
import * as THREE from 'three';
import { mirror } from './players3d.mjs';
import { clamp } from '../map3d/geo3d.mjs';
import {
  P,
  sm,
  mixN,
  mixArm,
  mixLeg,
  mix,
  C,
  track,
  STAND,
  DOWN_ARM,
  TOSS_L,
  PULL_L,
  COCK_SERVE,
  PUNCH_R,
  locoPose,
  moving,
  moveMix
} from './poses3d.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const leg = (a, k, f = 0, s = 0.1) => ({ a, k, f, s });

// ---------- spike (and the running jump serve) ----------
// Right arm keys carry the palm direction; palmTwist turns the forearm/hand so the palm really faces it
// (VRM rest: arm along -x, palm down).
const REST_R = new THREE.Vector3(-1, 0, 0),
  PALM0 = new THREE.Vector3(0, -1, 0),
  QT = new THREE.Quaternion(),
  TV = new THREE.Vector3();
function palmTwist(dir, palm) {
  QT.setFromUnitVectors(REST_R, dir);
  const p0 = PALM0.clone().applyQuaternion(QT).projectOnPlane(dir).normalize(),
    want = palm.clone().projectOnPlane(dir).normalize(),
    a = Math.acos(clamp(p0.dot(want), -1, 1));
  return TV.crossVectors(p0, want).dot(dir) < 0 ? -a : a;
}
/** Right-arm key: [upper, fore, hand, twistUpper, twistFore] with the palm facing `palm` (torso space). */
export const RA = (u, f, h, palm) => {
  const t = palmTwist(h, palm);
  return [u, f, h, t * 0.5, t];
};
// Swing progress e (0..1) with ball contact at CE. Before contact the swing takes swingLead(d) ms (the playback starts
// it that long before the ball arrives); after it, POST ms of snap and follow-through.
const CE = 0.3;
const POST = { quick: 200, tip: 240, power: 300, cut: 250, serve: 270 };
function swingE(d) {
  const pre = swingLead(d) || 150,
    post = POST[d.spkStyle] || 270,
    sw = d.spk;
  return sw < pre ? (CE * sw) / pre : Math.min(1, CE + ((1 - CE) * (sw - pre)) / post);
}
// 1. Bow and arrow: hitting elbow drawn back high above the shoulder, thumb back, big open hand behind the head
const BOW_R = RA(V(-0.8, 0.52, -0.3), V(0.18, 0.97, 0.05), V(0.08, 0.82, -0.56), V(0.8, 0.1, 0.6));
const QUICK_R = RA(V(-0.6, 0.72, -0.2), V(0.02, 0.97, -0.2), V(0, 0.75, -0.66), V(0.5, 0.1, 0.85));
// whip: the elbow leads forward and up while the forearm still lies back
const WHIP_R = RA(V(-0.45, 0.85, 0.22), V(-0.12, 0.5, -0.86), V(-0.08, 0.3, -0.95), V(0, 0.9, 0.4));
// 2. Contact: arm fully straight directly above the hitting shoulder, open palm on the ball
const HIT_R = RA(V(-0.06, 0.98, 0.14), V(-0.05, 0.97, 0.2), V(-0.03, 0.92, 0.38), V(0, -0.15, 1));
// wrist snap over the top of the ball (topspin)
const SNAP_R = RA(V(-0.05, 0.8, 0.6), V(-0.02, 0.62, 0.78), V(0.05, -0.15, 0.99), V(0, -1, 0.15));
// 3. Follow-through: the arm swings down across the body toward the opposite hip
const ACROSS_R = RA(V(0.28, -0.2, 0.94), V(0.62, -0.5, 0.6), V(0.7, -0.6, 0.38), V(0.2, 0.2, -1));
const HIP_R = RA(V(0.22, -0.8, 0.56), V(0.58, -0.74, 0.34), V(0.58, -0.8, 0.15), V(0.3, 0, -1));
// cut shot: the palm turns out and the arm finishes on the hitting side
const CUT_R = RA(V(-0.4, 0.3, 0.87), V(-0.6, -0.1, 0.8), V(-0.7, -0.25, 0.67), V(0.6, -0.5, 0.3));
const CUT_END = RA(V(-0.5, -0.45, 0.74), V(-0.62, -0.55, 0.56), V(-0.66, -0.6, 0.45), V(0.3, 0, -1));
// tip: straight arm, fingertips push the ball over
const TIP_R = RA(V(-0.08, 0.97, 0.2), V(-0.06, 0.96, 0.26), V(-0.03, 0.98, 0.2), V(0, 0.1, 1));
const TIP_OVER = RA(V(-0.06, 0.85, 0.52), V(-0.04, 0.8, 0.6), V(0, 0.45, 0.9), V(0, -0.6, 0.8));
const SWING = {
  normal: [
    [0, BOW_R],
    [0.16, WHIP_R],
    [CE, HIT_R],
    [0.42, SNAP_R],
    [0.7, ACROSS_R],
    [1, HIP_R]
  ],
  cut: [
    [0, BOW_R],
    [0.16, WHIP_R],
    [CE, HIT_R],
    [0.45, CUT_R],
    [1, CUT_END]
  ],
  tip: [
    [0, BOW_R],
    [0.18, RA(V(-0.3, 0.9, 0.3), V(-0.1, 0.95, 0.1), V(-0.05, 0.9, -0.1), V(0, 0.3, 1))],
    [CE, TIP_R],
    [0.55, TIP_OVER],
    [1, RA(V(0.1, 0.2, 0.97), V(0.2, 0, 0.98), V(0.2, -0.2, 0.96), V(0, -0.5, -0.8))]
  ],
  quick: [
    [0, QUICK_R],
    [CE, HIT_R],
    [0.42, SNAP_R],
    [0.7, ACROSS_R],
    [1, HIP_R]
  ]
};
// non-hitting arm: points straight up at the ball → pulls down hard to close the shoulders → tucks in
const UP_L = [V(0.12, 0.95, 0.28), V(0.08, 0.96, 0.26), V(0.06, 0.92, 0.38)];
const LKEYS = [
  [0, UP_L],
  [0.14, [V(0.3, 0.55, 0.78), V(0.1, 0.6, 0.8), V(0.05, 0.5, 0.86)]],
  [CE, [V(0.32, -0.5, 0.8), V(-0.25, -0.15, 0.96), V(-0.3, -0.1, 0.95)]],
  [1, [V(0.22, -0.88, 0.42), V(-0.35, -0.45, 0.82), V(-0.4, -0.5, 0.77)]]
];
// torso: chest opened to the hitting side, upper back arched → uncoils square to the net at contact → pikes over
const BOW_T = { hp: 0, sp: -0.12, cp: -0.12, tw: -0.78, hd: -0.5 };
const TORSO = [
  [0, BOW_T],
  [0.16, { hp: 0.02, sp: -0.06, cp: -0.06, tw: -0.4, hd: -0.45 }],
  [CE, { hp: 0.03, sp: 0.02, cp: 0, tw: 0.02, hd: -0.35 }],
  [0.42, { hp: 0.22, sp: 0.24, cp: 0.12, tw: 0.24, hd: -0.2 }],
  [0.7, { hp: 0.3, sp: 0.32, cp: 0.16, tw: 0.4, hd: -0.12 }],
  [1, { hp: 0.26, sp: 0.26, cp: 0.12, tw: 0.3, hd: -0.1 }]
];
const mixT = (a, b, t) => ({
  hp: mixN(a.hp, b.hp, t),
  sp: mixN(a.sp, b.sp, t),
  cp: mixN(a.cp, b.cp, t),
  tw: mixN(a.tw, b.tw, t),
  hd: mixN(a.hd, b.hd, t)
});
const ARMS_UP = [V(0.2, 0.92, 0.35), V(0.14, 0.97, 0.2), V(0.1, 1, 0.1)];
const ARMS_LOW = [V(0.15, -0.3, 0.94), V(0.1, -0.1, 1), V(0.1, 0.1, 1)];

/** Landing after a swing (spike, jump serve, jump float): soft on both feet, knees bent to absorb; the hitting arm finishes across the body. */
function landPose(d, sw) {
  const lm = d.landMs != null ? d.landMs : d.jy > 0 ? 0 : sw - 300, // ms since touchdown
    lt = clamp((lm - 200) / 420, 0, 1),
    absorb = sm(clamp(lm / 140, 0, 1));
  const LAND = C({
    hp: 0.55,
    sp: 0.22,
    hd: -0.3,
    L: leg(1.05, 1.6, -0.05, 0.2),
    R: leg(0.95, 1.55, -0.05, 0.2),
    al: [V(0.7, -0.35, 0.62), V(0.5, -0.4, 0.77), V(0.4, -0.4, 0.82)],
    ar: mirror([V(0.55, -0.55, 0.62), V(0.35, -0.6, 0.72), V(0.3, -0.6, 0.74)]),
    curl: 0.3
  });
  const TOUCH = { ...LAND, hp: 0.3, sp: 0.2, L: leg(0.45, 0.6, 0, 0.2), R: leg(0.4, 0.55, 0, 0.2), ar: HIP_R };
  return { ...mix(mix(TOUCH, LAND, absorb), STAND, lt), face: { angry: 0.4 * (1 - lt) } };
}
export function spikePose(d, m) {
  const air = d.jy > 8,
    J = d.jmode,
    pk = (J && J.peak) || 60,
    u = air ? clamp(d.jy / pk, 0, 1) : 0,
    sw = d.spk,
    sty = d.spkStyle || 'normal',
    // the harder the hit, the deeper the bow (owner, 2026-10-06): spike power (d.spkPow, read ahead of the hit by playback)
    // 60 → ×0.85 … 100 → ×1.35 … 140 → ×1.85, on top of the style's own arch
    powK = d.spkPow ? clamp(0.85 + (d.spkPow - 60) / 80, 0.85, 1.85) : 1,
    arch = (sty === 'power' ? 1.4 : sty === 'quick' ? 0.6 : 1) * (sty === 'tip' ? 1 : powK);
  const face = { angry: 0.85 };
  // 3. landing: soft on both feet, knees bent to absorb; the hitting arm finishes across the body
  if (!air && sw != null) return landPose(d, sw);
  if (!air) {
    // approach, timed off the jump: run → big penultimate step (arms swing back high) → plant, get low → take-off
    const pp = J && J.mode === 'up' && d.jt != null ? clamp(d.jt / Math.max(0.05, J.t0), 0, 1) : m && moving(m) ? 0.3 : 0;
    const serve = sty === 'serve';
    const run = moving(m) ? locoPose({ ...m, lat: 0, fwd: Math.abs(m.fwd) + 0.5 }) : P(STAND, { hp: 0.2 });
    const armsBackRun = [V(0.15, -0.5, -0.85), V(0.15, -0.35, -0.94), V(0.1, -0.2, -0.98)];
    const PEN = C({
      hp: 0.45,
      sp: 0.15,
      hd: -0.6,
      L: leg(0.75, 0.35, -0.2, 0.1),
      R: leg(-0.55, 0.45, 0.45, 0.1),
      al: [V(0.15, 0.35, -0.92), V(0.12, 0.45, -0.88), V(0.1, 0.5, -0.86)],
      curl: 0.2
    });
    const LOAD = C({
      hp: 0.62,
      sp: 0.28,
      cp: 0.08,
      hd: -0.8,
      L: leg(1.1, 1.65, -0.1, 0.14),
      R: leg(1.0, 1.6, -0.1, 0.14),
      al: [V(0.15, -0.6, -0.78), V(0.12, -0.55, -0.83), V(0.1, -0.4, -0.9)],
      curl: 0.2
    });
    const TAKE = C({
      hp: 0.25,
      sp: 0.1,
      hd: -0.7,
      L: leg(0.5, 0.8, 0.5, 0.12),
      R: leg(0.45, 0.75, 0.5, 0.12),
      al: [V(0.2, -0.3, 0.93), V(0.15, -0.1, 0.99), V(0.1, 0.1, 0.99)],
      curl: 0.2
    });
    let out;
    if (pp < 0.55) out = mix(run, C({ ...run, al: armsBackRun, ar: undefined }), sm(clamp(pp / 0.55, 0, 1)));
    else if (pp < 0.82) out = mix(C({ ...run, al: armsBackRun, ar: undefined }), PEN, sm((pp - 0.55) / 0.27));
    else if (pp < 0.97) out = mix(PEN, LOAD, sm((pp - 0.82) / 0.15));
    else out = mix(LOAD, TAKE, (pp - 0.97) / 0.03);
    if (serve) out = { ...out, al: TOSS_L, hd: -0.8 }; // running jump serve: toss arm stays up
    return { ...out, face };
  }
  const keys = SWING[sty] || SWING.normal;
  const legsUp = { L: leg(0.1, 0.12, 0.7, 0.1), R: leg(0.04, 0.08, 0.7, 0.1) },
    // knees bent slightly behind: the loaded spring
    legsBow = { L: leg(0.12, 1.05, 0.8, 0.12), R: leg(-0.06, 1.25, 0.85, 0.12) },
    legsPike =
      sty === 'pipe'
        ? { L: leg(0.75, 0.5, 0.6, 0.1), R: leg(-0.5, 0.4, 0.6, 0.1) }
        : { L: leg(0.6, 0.85, 0.5, 0.12), R: leg(0.48, 0.75, 0.5, 0.12) },
    legsDown = { L: leg(0.3, 0.4, 0.25, 0.16), R: leg(0.24, 0.35, 0.25, 0.16) };
  const bowT = {
    ...BOW_T,
    sp: BOW_T.sp * arch,
    cp: BOW_T.cp * arch,
    hd: BOW_T.hd * Math.min(1.3, arch),
    tw: BOW_T.tw * Math.min(1.25, arch)
  };
  if (sw == null) {
    // 1. rising: both arms swing up, then the bow: non-hitting arm points at the ball, hitting elbow drawn back high
    const takeK = clamp(u * 3, 0, 1),
      draw = sty === 'quick' ? clamp(u * 2.2, 0, 1) : sm(clamp((u - 0.15) / 0.55, 0, 1));
    const rA = draw > 0 ? mixArm(mirror(ARMS_UP), keys[0][1], draw) : mixArm(mirror(ARMS_LOW), mirror(ARMS_UP), takeK),
      lA = draw > 0 ? mixArm(ARMS_UP, UP_L, draw) : mixArm(ARMS_LOW, ARMS_UP, takeK);
    const body = mixT({ hp: -0.05, sp: 0.05, cp: 0, tw: 0, hd: -0.6 }, bowT, draw);
    return {
      ...body,
      L: mixLeg(legsUp.L, legsBow.L, draw),
      R: mixLeg(legsUp.R, legsBow.R, draw),
      al: lA,
      ar: rA,
      curlL: 0.05,
      curlR: 0,
      face,
      aimL: draw * 0.85
    };
  }
  // 2. the swing: uncoil → contact on a straight arm → wrist snap → follow-through; legs pike, then reach for the floor
  const e = swingE(d);
  const tor0 = track([[0, bowT], ...TORSO.slice(1)], e, mixT),
    // …and the harder it is, the more the body jack-knifes over after contact
    pike = e > CE && sty !== 'tip' ? 1 + (powK - 1) * 0.7 * sm(clamp((e - CE) / 0.2, 0, 1)) : 1,
    tor = pike === 1 ? tor0 : { ...tor0, hp: tor0.hp * pike, sp: tor0.sp * pike, cp: tor0.cp * pike },
    rA = track(keys, e, mixArm),
    lA = track(LKEYS, e, mixArm);
  const legK = sm(clamp((e - 0.1) / 0.35, 0, 1)),
    down = e > CE ? sm(clamp(1 - u / 0.5, 0, 1)) : 0;
  const legs = k => mixLeg(mixLeg(legsBow[k], legsPike[k], legK), legsDown[k], down);
  return {
    ...tor,
    L: legs('L'),
    R: legs('R'),
    al: lA,
    ar: rA,
    curlL: 0.3,
    curlR: e < 0.5 ? (sty === 'tip' ? 0.3 : 0) : 0.2,
    face,
    aimL: e < 0.1 ? 0.85 * (1 - e / 0.1) : 0,
    contact: clamp(1 - Math.abs(e - CE) / 0.13, 0, 1)
  };
}

const FLOAT_HIT = RA(V(-0.15, 0.93, 0.33), V(-0.1, 0.9, 0.42), V(-0.05, 0.85, 0.52), V(0, -0.1, 1)); // firm open palm
// Jump float, in the air: knees bent behind the body, feet together (not the standing stride), then reaching for the floor.
const FLOAT_AIR = { L: leg(0.12, 1.0, 0.75, 0.1), R: leg(0.02, 1.15, 0.8, 0.1) },
  FLOAT_DOWN = { L: leg(0.3, 0.4, 0.25, 0.16), R: leg(0.24, 0.35, 0.25, 0.16) };
/** Float serve (standing, or with a jump): toss, cock, short punch through the ball; then the landing / a small dip. */
export function servePose(d, m) {
  const sw = d.spk,
    pt = d.pt || 0,
    air = d.jy > 8,
    jumpy = d.spkStyle === 'jumpfloat',
    base = { hp: 0.1, sp: 0.02, L: leg(0.35, 0.3, 0, 0.12), R: leg(-0.25, 0.25, 0, 0.12), hd: -0.35, curlR: 0, face: { angry: 0.35 } };
  if (jumpy && !air && sw != null) return landPose(d, sw); // touching down: crouch to absorb, like the jump serve
  // legs: airborne → tucked behind (never the standing stride); running up → real strides
  let legs = null;
  if (jumpy && air) {
    const pk = (d.jmode && d.jmode.peak) || 60,
      u = clamp(d.jy / pk, 0, 1),
      down = sw != null ? sm(clamp(1 - u / 0.5, 0, 1)) : 0;
    legs = { L: mixLeg(FLOAT_AIR.L, FLOAT_DOWN.L, down), R: mixLeg(FLOAT_AIR.R, FLOAT_DOWN.R, down) };
  } else if (jumpy && m && moving(m)) {
    const lp = locoPose(m),
      k = moveMix(m);
    legs = { L: mixLeg(base.L, lp.L, k), R: mixLeg(base.R, lp.R, k), lift: (lp.lift || 0) * k };
  }
  const fin = o => (legs ? { ...o, ...legs } : o);
  if (sw == null) {
    const t1 = sm(clamp(pt / 260, 0, 1)),
      kk = sm(clamp((pt - 120) / 300, 0, 1));
    return fin({
      ...base,
      al: mixArm([V(0.2, -0.3, 0.93), V(0.1, -0.1, 1), V(0.1, 0, 1)], TOSS_L, t1),
      ar: mixArm(mirror(DOWN_ARM), COCK_SERVE, kk),
      tw: -0.5 * kk,
      hd: -0.35 - 0.3 * t1
    });
  }
  const pre = swingLead(d) || 70,
    e = sw < pre ? (0.42 * sw) / pre : Math.min(1, 0.42 + (0.58 * (sw - pre)) / 110),
    // a standing serve: the body follows the punch with a small dip and settles back (some impact, no jump)
    dip = jumpy ? 0 : sm(clamp((sw - pre) / 90, 0, 1)) * (1 - sm(clamp((sw - pre - 110) / 260, 0, 1)));
  return fin({
    ...base,
    hp: base.hp + 0.22 * dip,
    L: mixLeg(base.L, leg(0.5, 0.75, 0, 0.12), dip),
    R: mixLeg(base.R, leg(0.05, 0.6, 0, 0.12), dip),
    al: mixArm(TOSS_L, PULL_L, clamp(e * 1.4, 0, 1)),
    ar: e < 0.42 ? mixArm(COCK_SERVE, FLOAT_HIT, sm(e / 0.42)) : mixArm(FLOAT_HIT, PUNCH_R, (e - 0.42) / 0.58),
    tw: e < 0.42 ? mixN(-0.5, 0, e / 0.42) : 0.2,
    sp: (e < 0.42 ? -0.1 : 0.12) + 0.08 * dip,
    contact: clamp(1 - Math.abs(e - 0.42) / 0.2, 0, 1)
  });
}
