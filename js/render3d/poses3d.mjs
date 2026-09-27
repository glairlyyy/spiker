// Pose library: turns a player's display state (A.disp[id], driven by the engine beats) plus the measured 3D motion
// into a pose. Character space: +z forward, +y up, +x = the player's left. Arms: [upper, fore, hand, twistUpper,
// twistFore] as torso-space directions (crouched poses are written in character space and converted with C()).
// `ar` (right arm) defaults to the mirror of `al`. The right arm is the hitting arm.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const leg = (a, k, f = 0, s = 0.1) => ({ a, k, f, s });
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = t => t * t * (3 - 2 * t);
const mixN = (a, b, t) => (a ?? 0) + ((b ?? 0) - (a ?? 0)) * t;
const mixV = (a, b, t) => a.clone().lerp(b, t).normalize();
const mirror = arm => arm.map((v, i) => (i < 3 ? new THREE.Vector3(-v.x, v.y, v.z) : -(v || 0)));
const mixArm = (a, b, t) => [
  mixV(a[0], b[0], t),
  mixV(a[1], b[1], t),
  mixV(a[2] || a[1], b[2] || b[1], t),
  mixN(a[3], b[3], t),
  mixN(a[4], b[4], t)
];
const mixLeg = (a, b, t) => ({ a: mixN(a.a, b.a, t), k: mixN(a.k, b.k, t), f: mixN(a.f, b.f, t), s: mixN(a.s ?? 0.1, b.s ?? 0.1, t) });
const NUMS = ['hp', 'sp', 'cp', 'tw', 'hd', 'hy', 'hyaw', 'hroll', 'shrug', 'curl', 'curlL', 'curlR', 'sroll', 'lift'];
/** Blend two poses (numbers, legs and arm directions). */
export function mix(A, B, t) {
  const o = { ...A, ...B };
  for (const k of NUMS) if (A[k] != null || B[k] != null) o[k] = mixN(A[k], B[k], t);
  o.L = mixLeg(A.L, B.L, t);
  o.R = mixLeg(A.R, B.R, t);
  o.al = mixArm(A.al, B.al, t);
  o.ar = mixArm(A.ar || mirror(A.al), B.ar || mirror(B.al), t);
  return o;
}
const P = (base, over) => ({ ...base, ...over });
const EU = new THREE.Euler();
/** Arms written in character space (where the player faces, whatever the lean) → torso space, using the pose's own torso angles. */
export function C(p) {
  const q = new THREE.Quaternion().setFromEuler(EU.set(p.hp || 0, p.hyaw || 0, p.hroll || 0));
  q.multiply(new THREE.Quaternion().setFromEuler(EU.set(p.sp || 0, (p.tw || 0) * 0.4, (p.sroll || 0) * 0.5)));
  q.multiply(new THREE.Quaternion().setFromEuler(EU.set(p.cp || 0, (p.tw || 0) * 0.6, (p.sroll || 0) * 0.5)));
  q.invert();
  const conv = a => a.map((v, i) => (i < 3 && v ? v.clone().applyQuaternion(q).normalize() : v));
  return { ...p, al: conv(p.al), ar: conv(p.ar || mirror(p.al)) };
}
/** Keyframe track over 0..1: [[t, value], …] with smoothstep between keys; mixF blends two values. */
function track(keys, t, mixF) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++)
    if (t <= keys[i][0]) {
      const [t0, a] = keys[i - 1],
        [t1, b] = keys[i];
      return mixF(a, b, sm((t - t0) / (t1 - t0)));
    }
  return keys[keys.length - 1][1];
}
/** Cyclic Catmull-Rom through N evenly spaced keys over one cycle (phase in radians). */
function cyc(keys, ph) {
  const N = keys.length,
    x = ((((ph / (Math.PI * 2)) % 1) + 1) % 1) * N,
    i = Math.floor(x),
    t = x - i,
    p0 = keys[(i - 1 + N) % N],
    p1 = keys[i % N],
    p2 = keys[(i + 1) % N],
    p3 = keys[(i + 2) % N];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

// ---------- base poses ----------
const DOWN_ARM = [V(0.22, -1, 0.05), V(0.16, -1, 0.3), V(0.1, -1, 0.35)];
export const STAND = { hp: 0.04, sp: 0.02, L: leg(0.1, 0.16), R: leg(0.02, 0.1), al: DOWN_ARM, curl: 0.4 };
// receive-ready: low, weight forward, arms out in front, hands close together
export const READY = C({
  hp: 0.62,
  sp: 0.16,
  cp: 0.05,
  hd: -0.55,
  L: leg(1.05, 1.5, 0, 0.24),
  R: leg(0.9, 1.4, 0, 0.24),
  al: [V(0.28, -0.55, 0.78), V(-0.25, -0.3, 0.92), V(-0.25, -0.2, 0.95), 0, -0.9],
  curl: 0.45
});
const PLATFORM = C({
  hp: 0.68,
  sp: 0.12,
  cp: 0.05,
  hd: -0.55,
  L: leg(1.15, 1.6, 0, 0.3),
  R: leg(1.0, 1.55, 0, 0.3),
  al: [V(-0.3, -0.62, 0.72), V(-0.3, -0.62, 0.72), V(-0.3, -0.58, 0.76), 0, -2.2],
  curl: 0.95
});
const PLATFORM_UP = C({
  ...PLATFORM,
  hp: 0.3,
  hd: -0.45,
  L: leg(0.6, 0.9, 0, 0.26),
  R: leg(0.5, 0.8, 0, 0.26),
  al: [V(-0.28, -0.22, 0.93), V(-0.28, -0.2, 0.94), V(-0.28, -0.16, 0.95), 0, -2.2],
  ar: undefined
});
const WINDOW = {
  hp: 0.14,
  sp: 0,
  cp: -0.05,
  hd: -0.3,
  L: leg(0.5, 0.85),
  R: leg(0.3, 0.7),
  al: [V(0.75, 0.25, 0.6), V(-0.3, 0.85, 0.4), V(-0.35, 0.6, -0.72), 0, 0.6],
  curl: 0.15
};
const PUSH = {
  front: { al: [V(0.25, 0.9, 0.35), V(0.08, 0.9, 0.42), V(0.02, 0.6, 0.8), 0, 0.6], sp: 0.02, cp: 0, hd: -0.35 },
  quick: { al: [V(0.2, 0.97, 0.1), V(0.04, 1, 0.06), V(0, 0.9, 0.4), 0, 0.6], sp: 0, cp: 0, hd: -0.55 },
  back: { al: [V(0.2, 0.9, -0.3), V(0.06, 0.85, -0.5), V(0, 0.5, -0.86), 0, 0.6], sp: -0.3, cp: -0.22, hd: -0.6 }
};
const PUNCH_R = [V(-0.22, 0.35, 0.91), V(-0.15, 0.3, 0.94), V(-0.1, 0.4, 0.91)];
const COCK_SERVE = [V(-0.55, 0.72, -0.42), V(-0.08, 0.99, 0.08), V(-0.05, 0.45, -0.89)];
const PULL_L = [V(0.5, -0.75, 0.3), V(0.35, -0.8, 0.45), V(0.2, -0.8, 0.5)];
const TOSS_L = [V(0.1, 0.95, 0.3), V(0.05, 1, 0.2), V(0, 1, 0.12)];
const BLOCK_PREP = [V(0.35, 0.2, 0.9), V(0.12, 0.95, 0.28), V(0.08, 0.9, 0.42)];
const BLOCK_UP = [V(0.3, 0.84, 0.45), V(0.28, 0.78, 0.56), V(0.28, 0.72, 0.64)];

// ---------- locomotion ----------
// One gait cycle = two steps; phase 0 = left heel strike. Keys at 0, ¼, ½, ¾ of the left leg's cycle:
// contact, mid-stance, push-off, swing. a = thigh forward angle, k = knee bend, f = foot pitch (+ toes down).
const WALK = { a: [0.36, 0.02, -0.3, 0.14], k: [0.05, 0.16, 0.12, 0.78], f: [-0.25, 0, 0.35, 0.05] };
const RUN = { a: [0.5, 0.05, -0.45, 0.62], k: [0.32, 0.55, 0.2, 1.8], f: [-0.1, 0.05, 0.6, 0.25] };
function gaitLeg(ph, r, stride, knee = 0) {
  const b = key => cyc(WALK[key], ph) * (1 - r) + cyc(RUN[key], ph) * r;
  return leg(b('a') * stride, b('k') * (0.75 + 0.25 * stride) + knee, b('f'), 0.07);
}
/**
 * Locomotion from measured motion `m` = { speed (m/s), fwd, lat (m/s along facing / to the player's left), phase }.
 * Forward: walk → run blend with arm pump and counter-twist; backwards: backpedal; sideways: shuffle.
 */
export function locoPose(m) {
  const sp = m.speed,
    ph = m.phase;
  if (Math.abs(m.lat) > Math.abs(m.fwd) * 1.1 && sp < 6) {
    // side shuffle: low, feet slide apart and together with a small hop, arms ready
    const o = 0.5 + 0.5 * Math.sin(ph * 2),
      lead = Math.sign(m.lat);
    return {
      ...READY,
      hp: 0.5,
      L: leg(0.85, 1.3, 0, 0.14 + (lead > 0 ? 0.24 : 0.1) * o),
      R: leg(0.8, 1.25, 0, 0.14 + (lead < 0 ? 0.24 : 0.1) * o),
      lift: 0.05 * Math.abs(Math.sin(ph * 2)),
      hroll: 0.06 * lead * o
    };
  }
  if (m.fwd < -0.3) {
    // backpedal: short quick steps, sitting back, arms in front
    const L = gaitLeg(-ph, 0.2, 0.55, 0.35),
      R = gaitLeg(-ph + Math.PI, 0.2, 0.55, 0.35);
    return { ...READY, hp: 0.35, sp: 0.08, hd: -0.35, L, R };
  }
  const r = cl((sp - 1.2) / 2.3, 0, 1),
    stride = 0.7 + 0.3 * Math.min(1, sp / 3);
  const L = gaitLeg(ph, r, stride),
    R = gaitLeg(ph + Math.PI, r, stride);
  // arms swing opposite to the legs: left arm forward when the left leg is back
  const amp = 0.3 + 0.55 * r,
    bend = 0.25 + 1.25 * r,
    arm = s => {
      const a = s * amp - 0.05 + 0.1 * r;
      return [
        V(0.16, -Math.cos(a), Math.sin(a)),
        V(0.1, -Math.cos(a + bend), Math.sin(a + bend)),
        V(0.06, -Math.cos(a + bend + 0.2), Math.sin(a + bend + 0.2))
      ];
    };
  const swL = -Math.cos(ph);
  return C({
    hp: 0.06 + 0.2 * r,
    sp: 0.04 + 0.06 * r,
    hd: -(0.06 + 0.2 * r) * 0.7,
    tw: 0.14 * (0.4 + r) * Math.cos(ph),
    hyaw: -0.1 * (0.4 + r) * Math.cos(ph),
    L,
    R,
    al: arm(swL),
    ar: mirror(arm(-swL)),
    curl: 0.35 + 0.35 * r,
    lift: r * 0.06 * Math.max(0, Math.cos(2 * ph + 0.7))
  });
}
const moving = m => m && m.speed > 0.35;
const moveMix = m => (m ? cl((m.speed - 0.35) / 1.1, 0, 1) : 0);

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
    a = Math.acos(cl(p0.dot(want), -1, 1));
  return TV.crossVectors(p0, want).dot(dir) < 0 ? -a : a;
}
/** Right-arm key: [upper, fore, hand, twistUpper, twistFore] with the palm facing `palm` (torso space). */
const RA = (u, f, h, palm) => {
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

function spikePose(d, m) {
  const air = d.jy > 8,
    J = d.jmode,
    pk = (J && J.peak) || 60,
    u = air ? cl(d.jy / pk, 0, 1) : 0,
    sw = d.spk,
    sty = d.spkStyle || 'normal',
    arch = sty === 'power' ? 1.4 : sty === 'quick' ? 0.6 : 1;
  const face = { angry: 0.85 };
  // 3. landing: soft on both feet, knees bent to absorb; the hitting arm finishes across the body
  if (!air && sw != null) {
    const lm = d.landMs != null ? d.landMs : d.jy > 0 ? 0 : sw - 300, // ms since touchdown
      lt = cl((lm - 200) / 420, 0, 1),
      absorb = sm(cl(lm / 140, 0, 1));
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
  if (!air) {
    // approach, timed off the jump: run → big penultimate step (arms swing back high) → plant, get low → take-off
    const pp = J && J.mode === 'up' && d.jt != null ? cl(d.jt / Math.max(0.05, J.t0), 0, 1) : m && moving(m) ? 0.3 : 0;
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
    if (pp < 0.55) out = mix(run, C({ ...run, al: armsBackRun, ar: undefined }), sm(cl(pp / 0.55, 0, 1)));
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
  const bowT = { ...BOW_T, sp: BOW_T.sp * arch, cp: BOW_T.cp * arch, tw: BOW_T.tw * Math.min(1.1, arch) };
  if (sw == null) {
    // 1. rising: both arms swing up, then the bow: non-hitting arm points at the ball, hitting elbow drawn back high
    const takeK = cl(u * 3, 0, 1),
      draw = sty === 'quick' ? cl(u * 2.2, 0, 1) : sm(cl((u - 0.15) / 0.55, 0, 1));
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
  const tor = track([[0, bowT], ...TORSO.slice(1)], e, mixT),
    rA = track(keys, e, mixArm),
    lA = track(LKEYS, e, mixArm);
  const legK = sm(cl((e - 0.1) / 0.35, 0, 1)),
    down = e > CE ? sm(cl(1 - u / 0.5, 0, 1)) : 0;
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
    contact: cl(1 - Math.abs(e - CE) / 0.13, 0, 1)
  };
}

const FLOAT_HIT = RA(V(-0.15, 0.93, 0.33), V(-0.1, 0.9, 0.42), V(-0.05, 0.85, 0.52), V(0, -0.1, 1)); // firm open palm
/** Standing float serve: toss, cock, short punch through the ball. */
function servePose(d) {
  const sw = d.spk,
    pt = d.pt || 0,
    base = { hp: 0.1, sp: 0.02, L: leg(0.35, 0.3, 0, 0.12), R: leg(-0.25, 0.25, 0, 0.12), hd: -0.35, curlR: 0, face: { angry: 0.35 } };
  if (sw == null) {
    const t1 = sm(cl(pt / 260, 0, 1)),
      kk = sm(cl((pt - 120) / 300, 0, 1));
    return {
      ...base,
      al: mixArm([V(0.2, -0.3, 0.93), V(0.1, -0.1, 1), V(0.1, 0, 1)], TOSS_L, t1),
      ar: mixArm(mirror(DOWN_ARM), COCK_SERVE, kk),
      tw: -0.5 * kk,
      hd: -0.35 - 0.3 * t1
    };
  }
  const pre = swingLead(d) || 70,
    e = sw < pre ? (0.42 * sw) / pre : Math.min(1, 0.42 + (0.58 * (sw - pre)) / 110);
  return {
    ...base,
    al: mixArm(TOSS_L, PULL_L, cl(e * 1.4, 0, 1)),
    ar: e < 0.42 ? mixArm(COCK_SERVE, FLOAT_HIT, sm(e / 0.42)) : mixArm(FLOAT_HIT, PUNCH_R, (e - 0.42) / 0.58),
    tw: e < 0.42 ? mixN(-0.5, 0, e / 0.42) : 0.2,
    sp: e < 0.42 ? -0.1 : 0.12,
    contact: cl(1 - Math.abs(e - 0.42) / 0.2, 0, 1)
  };
}

// ---------- dive ----------
// Arms authored in character space with a palm direction → torso space + palm twist (dive: the body goes horizontal).
function armsC(p, R, palmR, L, palmL) {
  const q = new THREE.Quaternion().setFromEuler(EU.set(p.hp || 0, p.hyaw || 0, p.hroll || 0));
  q.multiply(new THREE.Quaternion().setFromEuler(EU.set(p.sp || 0, (p.tw || 0) * 0.4, (p.sroll || 0) * 0.5)));
  q.multiply(new THREE.Quaternion().setFromEuler(EU.set(p.cp || 0, (p.tw || 0) * 0.6, (p.sroll || 0) * 0.5)));
  q.invert();
  const cv = v => v.clone().applyQuaternion(q).normalize(),
    mv = v => new THREE.Vector3(-v.x, v.y, v.z);
  const ar = RA(cv(R[0]), cv(R[1]), cv(R[2]), cv(palmR)),
    al = mirror(RA(cv(mv(L[0])), cv(mv(L[1])), cv(mv(L[2])), cv(mv(palmL))));
  return { ...p, ar, al };
}
const DN = V(0, -1, 0.05),
  FW = V(0, 0, 1);
// Dive keys over f = time / beat time (the ball arrives at f = 1):
//  run-in → LOW base (hips drop, lunge on the dominant leg) → DRIVE forward and low, not up → reaching hand under the
//  ball (pancake: flat on the floor; else a one-hand fist pop) → land on chest/upper stomach, chin up, back arched
//  (swan), the other hand cushions like a push-up → slide on the momentum, legs slightly bent → push back up → ready.
const DIVE_KEYS = [
  [
    0.4,
    {
      hp: 0.45,
      sp: 0.12,
      hd: -0.5,
      L: leg(0.75, 1.2, -0.1, 0.16),
      R: leg(0.65, 1.1, -0.1, 0.16),
      lift: 0,
      slide: 0,
      R_: [V(-0.2, -0.7, 0.68), V(-0.1, -0.5, 0.86), V(-0.05, -0.5, 0.86)],
      L_: [V(0.2, -0.7, 0.68), V(0.1, -0.5, 0.86), V(0.05, -0.5, 0.86)]
    }
  ],
  [
    0.6,
    {
      hp: 0.95,
      sp: 0.18,
      hd: -0.8,
      L: leg(-0.35, 0.45, 0.45, 0.14),
      R: leg(1.3, 1.95, -0.15, 0.14),
      lift: 0,
      slide: -0.2,
      R_: [V(-0.15, -0.45, 0.88), V(-0.08, -0.35, 0.93), V(-0.04, -0.3, 0.95)],
      L_: [V(0.2, -0.45, 0.87), V(0.12, -0.4, 0.91), V(0.06, -0.35, 0.94)]
    }
  ],
  [
    0.82,
    {
      hp: 1.3,
      sp: -0.05,
      cp: -0.05,
      hd: -1.05,
      L: leg(-1.3, 0.35, 0.7, 0.12),
      R: leg(-1.05, 0.15, 0.7, 0.12),
      lift: 0.2,
      slide: -0.75,
      R_: [V(-0.1, -0.2, 0.97), V(-0.06, -0.2, 0.98), V(-0.03, -0.25, 0.97)],
      L_: [V(0.3, -0.5, 0.81), V(0.18, -0.7, 0.69), V(0.1, -0.8, 0.59)]
    }
  ],
  [
    1.0,
    {
      hp: 1.47,
      sp: -0.18,
      cp: -0.12,
      hd: -1.15,
      L: leg(-1.45, 0.45, 0.7, 0.14),
      R: leg(-1.35, 0.35, 0.7, 0.14),
      lift: 0.02,
      slide: -0.9,
      R_: [V(-0.08, -0.12, 0.99), V(-0.05, -0.12, 0.99), V(-0.02, -0.1, 1)],
      L_: [V(0.35, -0.5, -0.79), V(0.12, -0.96, 0.25), V(0.05, -0.15, 0.99)]
    }
  ],
  [
    1.5,
    {
      hp: 1.5,
      sp: -0.28,
      cp: -0.18,
      hd: -1.15,
      L: leg(-1.4, 0.65, 0.6, 0.16),
      R: leg(-1.3, 0.8, 0.6, 0.16),
      lift: 0,
      slide: -0.35,
      R_: [V(-0.12, -0.25, 0.96), V(-0.06, -0.3, 0.95), V(-0.02, -0.12, 0.99)],
      L_: [V(0.35, -0.45, -0.82), V(0.12, -0.96, 0.25), V(0.05, -0.15, 0.99)]
    }
  ],
  [
    1.85,
    {
      hp: 1.0,
      sp: 0.1,
      cp: 0.05,
      hd: -0.6,
      L: leg(1.35, 2.2, -0.3, 0.2),
      R: leg(1.25, 2.1, -0.3, 0.2),
      lift: 0,
      slide: -0.15,
      R_: [V(-0.3, -0.92, 0.25), V(-0.12, -0.98, 0.12), V(-0.05, -0.15, 0.99)],
      L_: [V(0.3, -0.92, 0.25), V(0.12, -0.98, 0.12), V(0.05, -0.15, 0.99)]
    }
  ]
];
const mixDive = (a, b, t) => {
  const o = mix({ ...a, al: a.L_, ar: a.R_ }, { ...b, al: b.L_, ar: b.R_ }, t);
  return { ...o, R_: o.ar, L_: o.al, slide: mixN(a.slide, b.slide, t) };
};
/** Dive / pancake (f = dive time / beat time; the ball arrives at f = 1). */
function divePose(d, f) {
  if (f >= 2.3) return { ...READY, contact: 0 };
  const k = track(DIVE_KEYS, f, mixDive);
  if (f > 1.85) {
    // back on the feet: squat → ready
    const t = sm((f - 1.85) / 0.45),
      sq = armsC(k, k.R_, DN, k.L_, DN);
    return { ...mix(sq, { ...READY, lift: 0 }, t), slide: mixN(k.slide, 0, t), lying: t < 0.4, contact: 0, face: { angry: 0.3 } };
  }
  const pc = d.pc;
  // palms: pancake flat on the floor; otherwise the reaching hand is a fist popping the ball up
  const out = armsC(k, k.R_, f > 0.7 ? DN : FW, k.L_, f > 0.85 ? DN : FW);
  const reach = sm(cl((f - 0.66) / 0.28, 0, 1)) * (1 - sm(cl((f - 1.15) / 0.25, 0, 1)));
  return {
    ...out,
    lying: f > 0.7,
    reach,
    contact: reach,
    curlR: pc ? 0 : f > 0.7 ? 1 : 0.3,
    curlL: f > 0.85 ? 0 : 0.3,
    face: { surprised: 0.4, angry: 0.35 }
  };
}

/**
 * Pose for one player. `mood` −1 rattled … +1 fired up; `m` = measured motion (see locoPose). Returns a pose plus
 * `contact` (0..1: how strongly the arms aim at the ball), `lying`, `slide` (metres forward), `lift`, `face`.
 */
/** The play is over for this player (landed, back up, follow-through done): moving now is just running. */
export function poseDone(d) {
  if (d.jy > 1) return false;
  if (d.pose !== 'ready' && d.pose !== 'huddle' && (d.pAge || 0) > 1600) return true; // stale: nothing new since
  switch (d.pose) {
    case 'dive':
      return !!d.dv && d.dv.t > d.dv.dur * 2.3;
    case 'bump':
    case 'set':
      return d.swing != null && d.swing > 800;
    case 'spike':
    case 'serve':
      return d.spk != null && d.spk > 700 && (d.landMs == null || d.landMs > 450);
    case 'block':
      return !d.jmode && (d.landMs == null || d.landMs > 250);
    case 'roar':
      return true;
  }
  return false;
}
export function playerPose(d, mood, m) {
  const air = d.jy > 8,
    pose = poseDone(d) && moving(m) ? 'walk' : d.pose,
    mk = moveMix(m);
  let out;
  if (pose === 'dive') {
    const f = d.dv ? d.dv.t / Math.max(1, d.dv.dur) : 3;
    out = divePose(d, f);
    // run-in: real running strides until the low base
    const k = mk * (1 - sm(cl((f - 0.38) / 0.18, 0, 1)));
    if (k > 0.01) {
      const lp = locoPose(m);
      out = { ...out, L: mixLeg(out.L, lp.L, k), R: mixLeg(out.R, lp.R, k), lift: (lp.lift || 0) * k };
    }
  } else if (pose === 'spike') out = spikePose(d, m);
  else if (pose === 'serve') out = servePose(d);
  else if (pose === 'bump' && !air) {
    const u = d.swing == null ? 0 : cl(d.swing / 170, 0, 1),
      rel = d.swing != null && d.swing > 520;
    if (rel) out = mix(PLATFORM_UP, READY, cl((d.swing - 520) / 400, 0, 1));
    else {
      out = mix(PLATFORM, PLATFORM_UP, u);
      if (mk > 0 && d.swing == null) {
        // running to the ball: a real run while far, settling into the platform as the player arrives
        const run = cl((m.speed - 2) / 1.5, 0, 1);
        const lp = locoPose(run > 0 ? m : { ...m, lat: m.lat || 0.01, fwd: 0 });
        out =
          run > 0
            ? { ...mix(out, lp, run * 0.85), contact: 1 }
            : { ...out, L: mixLeg(out.L, lp.L, mk), R: mixLeg(out.R, lp.R, mk), lift: lp.lift };
      }
    }
    out.contact = d.swing == null ? 1 : 1 - u;
    out.face = { surprised: 0.25 };
  } else if (pose === 'set') {
    const sm2 = setMotion(d),
      push = PUSH[d.setDir || 'front'],
      extend = P(WINDOW, { hp: 0.02, L: leg(0.08, 0.1, air ? 0.5 : 0.25), R: leg(0.02, 0.06, air ? 0.5 : 0.25), ...push });
    out = mix(WINDOW, extend, sm2.k);
    if (mk > 0 && sm2.k < 0.05) {
      // running under the ball with the hands already up
      const lp = locoPose(m);
      out = { ...out, L: mixLeg(out.L, lp.L, mk), R: mixLeg(out.R, lp.R, mk), hp: mixN(out.hp, lp.hp, mk * 0.6), lift: lp.lift };
    }
    out.contact = 1 - sm2.k;
    out.face = { relaxed: 0.3 };
  } else if (pose === 'block') {
    const pr = Math.min(1, d.jy / 40),
      prep = { hp: 0.12, sp: 0.02, hd: -0.2, L: leg(0.4, 0.75, 0, 0.16), R: leg(0.4, 0.75, 0, 0.16), al: BLOCK_PREP, curl: 0.05 },
      up = { hp: 0.05, sp: 0.08, hd: -0.1, L: leg(0.05, 0.1, 0.7, 0.14), R: leg(0.05, 0.1, 0.7, 0.14), al: BLOCK_UP, curl: 0.02 };
    out = mix(prep, up, pr);
    if (mk > 0 && pr < 0.1) {
      const lp = locoPose({ ...m, lat: m.lat || 0.01, fwd: 0 });
      out = { ...out, L: mixLeg(out.L, lp.L, mk), R: mixLeg(out.R, lp.R, mk), lift: lp.lift };
    }
    out.contact = pr;
    out.face = A.cele ? { happy: 1 } : { angry: 0.7 };
  } else if (pose === 'roar')
    out = {
      hp: -0.05,
      sp: -0.25,
      cp: -0.15,
      hd: -0.4,
      L: leg(0.3, 0.3, 0, 0.2),
      R: leg(-0.1, 0.2, 0, 0.2),
      al: [V(0.6, 0.75, 0.1), V(0.2, 0.95, -0.1)],
      curl: 1,
      face: { angry: 0.6, aa: 0.8 }
    };
  else if (pose === 'slump')
    out = {
      hp: 0.35,
      sp: 0.2,
      cp: 0.1,
      hd: 0.55,
      shrug: -0.1,
      L: leg(0.2, 0.3),
      R: leg(0.05, 0.2),
      al: DOWN_ARM,
      curl: 0.3,
      face: { sad: 0.9 }
    };
  else if (pose === 'huddle')
    out = {
      hp: 0.35,
      sp: 0.15,
      hd: 0.2,
      L: leg(0.3, 0.45, 0, 0.2),
      R: leg(0.2, 0.4, 0, 0.2),
      al: [V(0.55, -0.15, 0.82), V(-0.3, -0.1, 0.95), V(-0.4, -0.2, 0.9)],
      curl: 0.3,
      face: { relaxed: 0.5 }
    };
  else if (air) out = { hp: 0, sp: 0, L: leg(0.4, 0.9, 0.5), R: leg(0.1, 1.1, 0.5), al: [V(0.6, 0.2, 0.3), V(0.5, 0.3, 0.5)], curl: 0.4 };
  else {
    const stance =
      pose === 'ready' ? P(READY, { hp: READY.hp + Math.abs(Math.sin(performance.now() * 0.007 + d.p.num * 0.9)) * 0.06 }) : STAND;
    out = mk > 0 ? mix(stance, locoPose(m), mk) : stance;
  }
  // get back up after a dive
  if (pose !== 'dive' && d.gu && d.gu.t < 260 && d.gu.s.f < 2.3) out = mix(divePose(d, d.gu.s.f), out, sm(d.gu.t / 260));
  const f = out.face || {};
  if (!out.face || Object.keys(f).length === 0 || pose === 'ready' || pose === 'set' || mk > 0.5) {
    // mood face (fired up / confident / steady / nervous / rattled), unless the move sets its own
    const mf =
      mood >= 0.6
        ? { angry: 0.35, happy: 0.35 }
        : mood >= 0.2
          ? { happy: 0.55 }
          : mood > -0.2
            ? {}
            : mood > -0.6
              ? { sad: 0.45 }
              : { surprised: 0.55, sad: 0.35 };
    out = { ...out, face: { ...mf, ...f } };
  }
  if (d.call) out.face = { ...out.face, aa: 0.7 * Math.min(1, d.call.life * 3) };
  return out;
}

/** Coaches on the sideline: standing with a clipboard, cheering, despairing or talking. */
export function coachPose(c, t) {
  const base = { hp: 0.02, L: leg(0.08, 0.1, 0, 0.12), R: leg(-0.02, 0.08, 0, 0.12), curl: 0.5 };
  if (c.type === 'yay') return { ...base, al: [V(0.45, 0.85, 0.1), V(0.2, 0.97, 0)], curl: 1, face: { happy: 1 } };
  if (c.type === 'ugh') return { ...base, hp: 0.25, sp: 0.2, hd: 0.3, al: [V(0.7, 0.5, 0.5), V(-0.5, 0.3, -0.8)], face: { sad: 0.8 } };
  if (c.type === 'talk') {
    const w = Math.sin(t * 0.01) * 0.3;
    return {
      ...base,
      al: [V(0.3, -0.6, 0.7), V(-0.4, 0.2, 0.9)],
      ar: [V(-0.3, -0.2 + w, 0.93), V(-0.25, 0.1 + w, 0.96)],
      face: { aa: 0.4 + 0.3 * Math.abs(w) }
    };
  }
  return {
    ...base,
    al: [V(0.3, -0.85, 0.4), V(-0.5, -0.1, 0.85), V(-0.6, 0, 0.8)],
    ar: [V(-0.3, -0.85, 0.4), V(0.5, -0.1, 0.85), V(0.6, 0, 0.8)],
    face: {}
  };
}
