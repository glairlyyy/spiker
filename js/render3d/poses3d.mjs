// Pose library: turns a player's display state (A.disp[id], driven by the engine beats) plus the measured 3D motion
// into a pose. Character space: +z forward, +y up, +x = the player's left. Arms: [upper, fore, hand, twistUpper,
// twistFore] as torso-space directions (crouched poses are written in character space and converted with C()).
// `ar` (right arm) defaults to the mirror of `al`. The right arm is the hitting arm.
import * as THREE from 'three';
import { mirror } from './players3d.mjs';
import { clamp } from '../map3d/geo3d.mjs'; // a module (map3d's tests load this file): not the classic global
import { RA, spikePose, servePose } from './poses3d-attack.mjs'; // spike / swing / serve poses

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const leg = (a, k, f = 0, s = 0.1) => ({ a, k, f, s });
export const sm = t => t * t * (3 - 2 * t);
/**
 * The crouch before a jump goes deeper the higher the player jumps (owner 2026-10-08): × 1 up to Jump 40, × 1.5 at Jump 99.
 * `deepen(pose, k)` scales the hip drop and both legs' hip / knee bend of a load pose (knees capped at 2.3 rad).
 */
export const squatK = d => 1 + 0.5 * clamp((((d.p && d.p.jump) || 50) - 40) / 59, 0, 1);
const deepLeg = (l, k) => (l ? { ...l, a: l.a * k, k: Math.min(2.3, l.k * k) } : l);
// (the joint angles take a share of k: hip drop and bent knees compound, and the body should end up ~k × as low, not more)
export const deepen = (p, k) => {
  if (k === 1) return p;
  const j = 1 + (k - 1) * SQUAT_JOINT;
  return { ...p, hp: p.hp * k, L: deepLeg(p.L, j), R: deepLeg(p.R, j) };
};
const SQUAT_JOINT = 0.3;
export const mixN = (a, b, t) => (a ?? 0) + ((b ?? 0) - (a ?? 0)) * t;
const mixV = (a, b, t) => a.clone().lerp(b, t).normalize();
export const mixArm = (a, b, t) => [
  mixV(a[0], b[0], t),
  mixV(a[1], b[1], t),
  mixV(a[2] || a[1], b[2] || b[1], t),
  mixN(a[3], b[3], t),
  mixN(a[4], b[4], t)
];
export const mixLeg = (a, b, t) => ({
  a: mixN(a.a, b.a, t),
  k: mixN(a.k, b.k, t),
  f: mixN(a.f, b.f, t),
  s: mixN(a.s ?? 0.1, b.s ?? 0.1, t)
});
const NUMS = ['hp', 'sp', 'cp', 'tw', 'hd', 'hy', 'hyaw', 'hroll', 'shrug', 'curl', 'curlL', 'curlR', 'sroll', 'lift'];
/** Setter release motion by set direction: k = release progress 0..1, lean = body angle, arms = end pose. */
function setMotion(d) {
  const dirn = d.setDir || 'front',
    dur = dirn === 'quick' ? 110 : 190,
    u = d.swing == null ? 0 : clamp(d.swing / dur, 0, 1),
    k = u * u * (3 - 2 * u),
    E = { front: [-1.25, -1.35, -0.9], quick: [-1.5, -1.55, -1.35], back: [-1.95, -2.25, -2.55] }[dirn],
    L = { front: 0.07, quick: 0, back: -0.42 }[dirn];
  return { k, lean: L * k, arms: E };
}

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
export const P = (base, over) => ({ ...base, ...over });
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
export function track(keys, t, mixF) {
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
export const DOWN_ARM = [V(0.22, -1, 0.05), V(0.16, -1, 0.3), V(0.1, -1, 0.35)];
export const STAND = { hp: 0.04, sp: 0.02, L: leg(0.1, 0.16), R: leg(0.02, 0.1), al: DOWN_ARM, curl: 0.4 };
// receive-ready: low, weight forward, arms long and low in front already in the passing grip — one hand laid in the
// other, the fingers of the bottom hand wrapped over it, thumbs side by side (curlR wraps, curlL lies flat)
export const READY = C({
  hp: 0.62,
  sp: 0.16,
  cp: 0.05,
  hd: -0.55,
  L: leg(1.05, 1.5, 0, 0.24),
  R: leg(0.9, 1.4, 0, 0.24),
  al: [V(-0.1, -0.72, 0.68), V(-0.3, -0.6, 0.74), V(-0.3, -0.52, 0.8), 0, -2.2],
  curlL: 0.2,
  curlR: 0.6,
  fsplit: 0.45
});
const PLATFORM = C({
  hp: 0.68,
  sp: 0.12,
  cp: 0.05,
  hd: -0.55,
  L: leg(1.15, 1.6, 0, 0.3),
  R: leg(1.0, 1.55, 0, 0.3),
  al: [V(-0.3, -0.62, 0.72), V(-0.3, -0.62, 0.72), V(-0.3, -0.58, 0.76), 0, -2.2],
  curlL: 0.2, // the passing grip: one hand in the other, thumbs together
  curlR: 0.6,
  fsplit: 0.45
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
export const PUNCH_R = [V(-0.22, 0.35, 0.91), V(-0.15, 0.3, 0.94), V(-0.1, 0.4, 0.91)];
export const COCK_SERVE = [V(-0.55, 0.72, -0.42), V(-0.08, 0.99, 0.08), V(-0.05, 0.45, -0.89)];
export const PULL_L = [V(0.5, -0.75, 0.3), V(0.35, -0.8, 0.45), V(0.2, -0.8, 0.5)];
export const TOSS_L = [V(0.1, 0.95, 0.3), V(0.05, 1, 0.2), V(0, 1, 0.12)];
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
  const r = clamp((sp - 1.2) / 2.3, 0, 1),
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
export const moving = m => m && m.speed > 0.35;
export const moveMix = m => (m ? clamp((m.speed - 0.35) / 1.1, 0, 1) : 0);

// ---------- before the serve ----------
// The server's routine (phases from preServe in render/ball.js via d.psvB). `hand` tells the 3D layer which hand(s)
// reach for the ball (contact): the right hand bounces it, both hands hold / spin it, the left holds it out to aim.
const PUSH_R = [V(-0.15, -0.8, 0.55), V(-0.1, -0.85, 0.5), V(-0.05, -0.95, 0.3)];
const BOUNCE_ST = {
  hp: 0.3,
  sp: 0.15,
  cp: 0.05,
  hd: 0.45,
  L: leg(0.35, 0.55, 0, 0.14),
  R: leg(0.05, 0.45, 0, 0.14),
  al: DOWN_ARM,
  ar: PUSH_R,
  curl: 0.25
};
const CHEST_ST = { hp: 0.06, sp: 0.02, hd: -0.08, L: leg(0.22, 0.2, 0, 0.12), R: leg(-0.12, 0.15, 0, 0.12), al: DOWN_ARM, curl: 0.2 };
const AIM_ST = {
  hp: 0.08,
  sp: 0.02,
  tw: -0.25,
  hd: -0.12,
  L: leg(0.35, 0.3, 0, 0.12),
  R: leg(-0.25, 0.25, 0, 0.12),
  al: [V(0.1, 0.1, 1), V(0.05, 0.15, 1), V(0.05, 0.2, 1)],
  ar: mixArm(mirror(DOWN_ARM), COCK_SERVE, 0.35),
  curl: 0.15
};
function preservePose(d, m) {
  const b = d.psvB || { ph: 'carry', k: 1 },
    mk = moveMix(m);
  if (b.ph === 'carry' || mk > 0.05) {
    // walking to where they serve from (no ball yet)
    return mk > 0 ? mix(STAND, locoPose(m), mk) : STAND;
  }
  const k = b.k ?? 1;
  switch (b.ph) {
    case 'bounce':
      return { ...BOUNCE_ST, hand: 'right', contact: 1, face: { relaxed: 0.3 } };
    case 'chest':
      return { ...mix(BOUNCE_ST, CHEST_ST, k), hand: k > 0.3 ? 'both' : 'right', contact: 1, face: { angry: 0.25 * k } };
    case 'spin':
      return { ...mix(STAND, { ...CHEST_ST, hd: 0.3 }, k), hand: 'both', contact: 1, face: { relaxed: 0.3 } };
    default:
      // aim: the ball held out in the left hand toward the other court, the right arm half cocked
      return { ...mix({ ...CHEST_ST, hd: 0.3 }, AIM_ST, k), hand: k > 0.4 ? 'left' : 'both', contact: 1, face: { angry: 0.35 * k } };
  }
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
  const reach = sm(clamp((f - 0.66) / 0.28, 0, 1)) * (1 - sm(clamp((f - 1.15) / 0.25, 0, 1)));
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
      return !!d.dv && diveF(d.dv) > 2.3;
    case 'bump':
      return d.swing != null && d.swing > 800;
    case 'set':
      return d.swing != null && d.swing > 600 && d.jy <= 1; // hands down once the set is away and the feet are down
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
/** Poses that stay as they are when done (celebrations, the huddle, the stance itself, the serve routine). */
const HELD = new Set(['ready', 'roar', 'slump', 'huddle', 'preserve']);
export function playerPose(d, mood, m) {
  const air = d.jy > 8,
    done = poseDone(d),
    // a finished move doesn't freeze in its last frame (a setter's hands still up after the set): walk if moving,
    // otherwise settle back into the ready stance. Celebrations and the huddle are held on purpose.
    pose = done && moving(m) ? 'walk' : done && !HELD.has(d.pose) ? 'ready' : d.pose,
    mk = moveMix(m);
  let out;
  if (pose === 'dive') {
    const f = d.dv ? diveF(d.dv) : 3;
    out = divePose(d, f);
    // run-in: real running strides until the low base
    const k = mk * (1 - sm(clamp((f - 0.38) / 0.18, 0, 1)));
    if (k > 0.01) {
      const lp = locoPose(m);
      out = { ...out, L: mixLeg(out.L, lp.L, k), R: mixLeg(out.R, lp.R, k), lift: (lp.lift || 0) * k };
    }
  } else if (pose === 'preserve') out = preservePose(d, m);
  else if (pose === 'spike') out = spikePose(d, m);
  else if (pose === 'serve') out = servePose(d, m);
  else if (pose === 'bump' && !air) {
    const u = d.swing == null ? 0 : clamp(d.swing / 170, 0, 1),
      rel = d.swing != null && d.swing > 520;
    if (rel) out = mix(PLATFORM_UP, READY, clamp((d.swing - 520) / 400, 0, 1));
    else {
      out = mix(PLATFORM, PLATFORM_UP, u);
      if (mk > 0 && d.swing == null) {
        // running to the ball: a real run while far, settling into the platform as the player arrives
        const run = clamp((m.speed - 2) / 1.5, 0, 1);
        const lp = locoPose(run > 0 ? m : { ...m, lat: m.lat || 0.01, fwd: 0 });
        out =
          run > 0
            ? { ...mix(out, lp, run * 0.85), contact: 1 }
            : { ...out, L: mixLeg(out.L, lp.L, mk), R: mixLeg(out.R, lp.R, mk), lift: lp.lift };
      }
    }
    out.contact = d.swing == null ? 1 : 1 - u;
    out.face = { surprised: 0.25 };
  } else if (pose === 'setprep') {
    // the ball is on its way: hands come up above the forehead, elbows out, fingers spread (the set-ready triangle),
    // eyes on the ball, knees soft — held until the set itself starts
    const k = sm(clamp((d.pAge || 0) / 300, 0, 1));
    out = mix(READY, { ...WINDOW, hd: -0.55, sp: 0.03 }, k);
    if (mk > 0) {
      const lp = locoPose(m); // still moving under the ball: real strides, hands already rising
      out = { ...out, L: mixLeg(out.L, lp.L, mk), R: mixLeg(out.R, lp.R, mk), hp: mixN(out.hp, lp.hp, mk * 0.6), lift: lp.lift };
    }
    out.contact = 1;
    out.face = { relaxed: 0.3 };
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
      prep = deepen(
        { hp: 0.12, sp: 0.02, hd: -0.2, L: leg(0.4, 0.75, 0, 0.16), R: leg(0.4, 0.75, 0, 0.16), al: BLOCK_PREP, curl: 0.05 },
        squatK(d)
      ),
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
