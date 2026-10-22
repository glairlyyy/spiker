// Attack poses (split from poses3d.mjs): the spike swing and the running jump serve, the landing after a swing, and the
// float serve; RA (right-arm keys with a palm direction, also used by the dive in poses3d.mjs). Same conventions as poses3d.mjs.
// Import cycle with poses3d.mjs: this module is evaluated first, so its top level may only use its own names, THREE,
// mirror and clamp (hence its own V and leg); everything imported from poses3d.mjs is used inside functions only.
import * as THREE from 'three';
import { mirror } from './players3d.mjs';
import { clamp } from './m3d.mjs';
import {
  P,
  sm,
  mixN,
  mixArm,
  mixLeg,
  mix,
  C,
  deepen,
  squatK,
  STAND,
  DOWN_ARM,
  TOSS_L,
  PULL_L,
  PUNCH_R,
  locoPose,
  moving,
  moveMix,
  playerPose
} from './poses3d.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const leg = (a, k, f = 0, s = 0.1) => ({ a, k, f, s });

// ---------- blending (2026-10-23 animation pass) ----------
// mixArm lerps directions (nlerp): between two keys far apart (arms back → arms up, hand at the hip → bow) it crawls at the
// ends and races through the middle — a one-frame flick of 50–80°. mixArmS turns at an even rate (slerp); its twists are
// mixArm's, read at the matching nlerp point (same plane, same direction), so the palms still take the shortest roll.
const slerpV = (a, b, t) => {
  const th = a.angleTo(b);
  if (th < 1e-4) return a.clone();
  const s = Math.sin(th);
  if (s < 1e-3) return a.clone().lerp(b, t).normalize(); // (opposite: no plane — never in the keys)
  return a
    .clone()
    .multiplyScalar(Math.sin((1 - t) * th) / s)
    .addScaledVector(b, Math.sin(t * th) / s)
    .normalize();
};
/** The nlerp parameter that points where slerp(t) points. */
const sParam = (a, b, t) => {
  const th = a.angleTo(b),
    p = t * th;
  return th < 1e-3 || th > 3.1 ? t : Math.sin(p) / (Math.sin(p) + Math.sin(th - p));
};
const mixArmS = (a, b, t, side = 1) => {
  const ha = a[2] || a[1],
    hb = b[2] || b[1];
  return [
    slerpV(a[0], b[0], t),
    slerpV(a[1], b[1], t),
    slerpV(ha, hb, t),
    mixArm(a, b, sParam(a[0], b[0], t), side)[3],
    mixArm(a, b, sParam(ha, hb, t), side)[4]
  ];
};
const mixArmSR = (a, b, t) => mixArmS(a, b, t, -1);
/** mix() with the arms turning at an even rate. */
const mixS = (A, B, t) => ({
  ...mix(A, B, t),
  al: mixArmS(A.al, B.al, t),
  ar: mixArmS(A.ar || mirror(A.al), B.ar || mirror(B.al), t, -1)
});
/**
 * Arms swung from one key to a far one through `mid` (arm directions): two keys ~150° apart have no good straight path —
 * forward-up to back-down went out sideways — so the swing passes the hip like a pendulum.
 */
const viaArm = (a, mid, b, t, side = 1) => (t < 0.5 ? mixArmS(a, mid, t * 2, side) : mixArmS(mid, b, t * 2 - 1, side));
const mixVia = (A, mid, B, t) => ({
  ...mix(A, B, t),
  al: viaArm(A.al, mid, B.al, t),
  ar: viaArm(A.ar || mirror(A.al), mirror(mid), B.ar || mirror(B.al), t, -1)
});
/** The pose this player goes to when the move is done (poses3d poseDone → the ready stance, with its run blend): the end key
 * of a landing / the float serve, so the hand-over is seamless. */
const readyNow = (d, m) => playerPose({ ...d, pose: 'ready', spk: null, landMs: null, jy: 0, jmode: null, pAge: 0, cele: null }, 0, m);
/**
 * Keyframe track like poses3d's track(), but without a stop at every key: it eases out of the first key and into the last
 * only, and passes the keys in between at speed (a whip is fastest at contact — track() stood the hand still on the ball).
 */
function trackC(keys, t, mixF) {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  for (let i = 1; i < n; i++)
    if (t <= keys[i][0]) {
      const [t0, a] = keys[i - 1],
        [t1, b] = keys[i],
        s = (t - t0) / (t1 - t0),
        m0 = i > 1 ? 1 : 0,
        m1 = i < n - 1 ? 1 : 0; // (Hermite: the tangents 0 at the ends, 1 = straight through the inner keys)
      return mixF(a, b, (s * s * s - 2 * s * s + s) * m0 + (3 * s * s - 2 * s * s * s) + (s * s * s - s * s) * m1);
    }
  return keys[n - 1][1];
}

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
  let t = palmTwist(h, palm);
  if (t < -Math.PI / 2) t += 2 * Math.PI; // one branch for every key (−π/2..3π/2): the upper-arm half-twist then agrees between keys
  return [u, f, h, t * 0.5, t];
};
// Swing progress e (0..1) with ball contact at CE. Before contact the swing takes swingLead(d) ms (the playback starts
// it that long before the ball arrives); after it, POST ms of snap and follow-through.
const CE = 0.3;
const POST = { quick: 150, tip: 240, power: 300, cut: 250, serve: 270 };
function swingE(d) {
  const pre = swingLead(d) || 150,
    post = POST[d.spkStyle] || 270,
    sw = d.spk;
  return sw < pre ? (CE * sw) / pre : Math.min(1, CE + ((1 - CE) * (sw - pre)) / post);
}
// 1. Bow and arrow: hitting elbow drawn back high above the shoulder, thumb back, big open hand behind the head
// (owner, 2026-10-20: the hitting arm was a goalpost — elbow at the side, forearm straight up — and then folded back for the
// whip: now the elbow is drawn high and back, the forearm already laid back behind the head, palm to the net)
const BOW_R = RA(V(-0.6, 0.62, -0.5), V(0.55, 0.65, -0.52), V(0.5, 0.55, -0.67), V(0.2, 0.4, 0.9));
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
// (2026-10-23: the pull starts with the swing and the arm is down, elbow in, by contact — it led the trunk's turn; it was
// still up beside the head through the whip, a "hands up" Y, and only reached the chest at contact)
const UP_L = [V(0.12, 0.47, 0.87), V(0.08, 0.49, 0.86), V(0.06, 0.38, 0.92)]; // (owner, 2026-10-06: 45° lower — pointing at the ball, not the sky)
const LKEYS = [
  [0, UP_L],
  [0.12, [V(0.28, 0.2, 0.94), V(0.12, 0.25, 0.96), V(0.06, 0.2, 0.98)]],
  [CE, [V(0.3, -0.72, 0.62), V(-0.3, -0.25, 0.92), V(-0.38, -0.2, 0.9)]],
  [1, [V(0.22, -0.88, 0.42), V(-0.35, -0.45, 0.82), V(-0.4, -0.5, 0.77)]]
];
/** The spike's back bend (0–1 of the deepest arch): the owner's pick, the power-50 look. */
const BEND = 0.15;
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
// the take-off's arms: swinging up through shoulder height in front (2026-10-23: were forward-down, then flicked straight up
// on the first air frame)
// …swinging forward past the hips on the way (from the crouch's arms back)
const ARMS_PAST = [V(0.15, -0.9, 0.4), V(0.12, -0.85, 0.5), V(0.1, -0.8, 0.58)];
const ARMS_LOW = [V(0.2, 0.5, 0.84), V(0.14, 0.62, 0.77), V(0.1, 0.7, 0.71)];

/** Landing after a swing (spike, jump serve, jump float): soft on both feet, knees bent to absorb; the hitting arm finishes across the body. */
// (2026-10-23: it rose to the upright STAND and then, when the move was done at ~450 ms, snapped into the crouched ready
// stance — a 70° jump of the arms and legs; now the absorb settles straight into the ready stance by then. The arms reach forward-down
// for balance instead of straight out, and at touchdown the free arm is where the swing left it, tucked)
let LAND = null; // (built on first use: C comes from poses3d.mjs — the import cycle)
const landKey = () =>
  LAND ||
  (LAND = C({
    hp: 0.55,
    sp: 0.22,
    hd: -0.3,
    L: leg(1.05, 1.6, -0.05, 0.2),
    R: leg(0.95, 1.55, -0.05, 0.2),
    al: [V(0.5, -0.65, 0.57), V(0.35, -0.6, 0.72), V(0.3, -0.6, 0.74)],
    ar: mirror([V(0.45, -0.7, 0.55), V(0.3, -0.65, 0.7), V(0.25, -0.65, 0.72)]),
    curl: 0.3
  }));
function landPose(d, sw, m) {
  const lm = d.landMs != null ? d.landMs : d.jy > 0 ? 0 : sw - 300, // ms since touchdown
    lt = sm(clamp((lm - 170) / 270, 0, 1)),
    absorb = sm(clamp(lm / 140, 0, 1));
  // touchdown: knees already giving (≈35°), the arms as the swing finished
  const LD = landKey(),
    TOUCH = { ...LD, hp: 0.3, sp: 0.2, L: leg(0.45, 0.6, 0, 0.2), R: leg(0.4, 0.55, 0, 0.2), al: LKEYS[LKEYS.length - 1][1], ar: HIP_R };
  const land = mixS(TOUCH, LD, absorb);
  return { ...(lt > 0 ? mixS(land, readyNow(d, m), lt) : land), face: { angry: 0.4 * (1 - lt) } };
}
/**
 * Coming down after the swing (owner, 2026-10-10: the landing pose snapped in at a height): over the last LAND_FROM jump units
 * the air pose (as at that height) blends into the landing pose, so the legs reach for the floor instead of switching.
 */
const LAND_FROM = 18;
function landBlend(d, m, poseFn) {
  if (d.spk == null || d._lb || d.jy >= LAND_FROM) return null;
  const k = d.jy > 0 ? sm(clamp((LAND_FROM - d.jy) / (LAND_FROM - 2), 0, 1)) : 1;
  if (k >= 1) return null;
  const airP = poseFn({ ...d, jy: Math.max(9, d.jy), _lb: 1 }, m),
    landP = poseFn({ ...d, jy: 0, landMs: d.landMs ?? 0, _lb: 1 }, m); // (not down yet: the touchdown frame)
  return { ...mixS(airP, landP, k), face: landP.face };
}
/**
 * The approach, timed off the jump: run → big penultimate step (arms swing back high) → plant, get low → take-off.
 * (2026-10-23, from the spike-jump studies: the leg drive from the deepest crouch to the take-off is ~150 ms — it was ~60 ms,
 * a snap; at the take-off the knees are nearly straight and the arms are swinging up past the shoulders — they were
 * knees half bent, arms forward-down, and the first air frame flicked both. A quick, whose take-off comes within a
 * few frames of the beat, goes straight to the crouch and up.)
 */
function approachPose(d, m, ppAt) {
  const J = d.jmode,
    pp = ppAt != null ? ppAt : J && J.mode === 'up' && d.jt != null ? clamp(d.jt / Math.max(0.05, J.t0), 0, 1) : m && moving(m) ? 0.3 : 0,
    serve = d.spkStyle === 'serve',
    short = J && J.dur > 0 && J.t0 * J.dur < 260; // (ms to the take-off: a quick)
  const run = moving(m) ? locoPose({ ...m, lat: 0, fwd: Math.abs(m.fwd) + 0.5, gw: { side: 0, back: 0 } }) : P(STAND, { hp: 0.2 });
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
  // (deeper for higher jumpers: squatK)
  const LOAD = C(
    deepen(
      {
        hp: 0.62,
        sp: 0.28,
        cp: 0.08,
        hd: -0.8,
        L: leg(1.1, 1.65, -0.1, 0.14),
        R: leg(1.0, 1.6, -0.1, 0.14),
        al: [V(0.15, -0.6, -0.78), V(0.12, -0.55, -0.83), V(0.1, -0.4, -0.9)],
        curl: 0.2
      },
      squatK(d)
    )
  );
  // the last frame on the floor: legs extended onto the toes, arms swinging up in front (= the air pose's start)
  const TAKE = C({
    hp: 0.08,
    sp: 0.06,
    hd: -0.65,
    L: leg(0.22, 0.32, 0.6, 0.11),
    R: leg(0.16, 0.26, 0.6, 0.11),
    al: ARMS_LOW,
    curl: 0.2
  });
  let out;
  if (short) out = pp < 0.45 ? mixS(run, LOAD, sm(pp / 0.45)) : mixVia(LOAD, ARMS_PAST, TAKE, sm((pp - 0.45) / 0.55));
  // (the plant comes early: both feet are down and loaded well before the take-off — no scissor in the air)
  else if (pp < 0.42) out = mixVia(run, DOWN_ARM, C({ ...run, al: armsBackRun, ar: undefined }), sm(pp / 0.42));
  else if (pp < 0.58) out = mixS(C({ ...run, al: armsBackRun, ar: undefined }), PEN, sm((pp - 0.42) / 0.16));
  else if (pp < 0.72) out = mixS(PEN, LOAD, sm((pp - 0.58) / 0.14));
  else out = mixVia(LOAD, ARMS_PAST, TAKE, sm((pp - 0.72) / 0.28));
  if (serve) {
    // running jump serve: the toss arm up through the toss, then it joins the approach's arm swing (2026-10-23: it stayed
    // up to the take-off, pointing ahead through the crouch)
    const k = sm(clamp((pp - 0.38) / 0.24, 0, 1));
    out = { ...out, al: k > 0 ? mixArmS(TOSS_L, out.al, k) : TOSS_L, hd: mixN(-0.8, out.hd, k * 0.5) };
  }
  return out;
}
export function spikePose(d, m) {
  const lb = landBlend(d, m, spikePose);
  if (lb) return lb;
  const air = d.jy > 8,
    J = d.jmode,
    pk = (J && J.peak) || 60,
    u = air ? clamp(d.jy / pk, 0, 1) : 0,
    sw = d.spk,
    sty = d.spkStyle || 'normal',
    arch = sty === 'power' ? 1.4 : sty === 'quick' ? 0.6 : 1,
    // one bend for every spike (owner, 2026-10-06: the power-50 pose — deeper ones were taken out): the back arches and stays
    // bent through the whip until the hit, head back; then a small jack-knife
    bend = sty === 'tip' ? 0 : BEND;
  const face = { angry: 0.85 };
  // 3. landing: soft on both feet, knees bent to absorb; the hitting arm finishes across the body
  if (!air && sw != null) return landPose(d, sw, m);
  if (!air) return { ...approachPose(d, m), face };
  const keys = SWING[sty] || SWING.normal;
  const legsUp = { L: leg(0.1, 0.12, 0.7, 0.1), R: leg(0.04, 0.08, 0.7, 0.1) },
    // knees bent slightly behind: the loaded spring
    legsBow = { L: leg(0.12, 1.05, 0.8, 0.12), R: leg(-0.06, 1.25, 0.85, 0.12) },
    // a pipe (back-row attack): a two-foot broad jump, both knees tucked under with a slight stagger — not a one-legged scissor (owner, 2026-10-12)
    legsPike =
      sty === 'pipe'
        ? { L: leg(0.55, 0.95, 0.6, 0.12), R: leg(0.32, 1.05, 0.6, 0.12) }
        : { L: leg(0.6, 0.85, 0.5, 0.12), R: leg(0.48, 0.75, 0.5, 0.12) },
    legsDown = { L: leg(0.3, 0.4, 0.25, 0.16), R: leg(0.24, 0.35, 0.25, 0.16) };
  const bowT = {
    hp: BOW_T.hp - 0.22 * bend,
    sp: BOW_T.sp * arch - 0.45 * bend,
    cp: BOW_T.cp * arch - 0.42 * bend,
    hd: BOW_T.hd - 0.35 * bend,
    tw: BOW_T.tw * Math.min(1.1, arch) * (1 + 0.35 * bend)
  };
  if (sw == null) {
    // 1. rising: both arms swing up, then the bow: non-hitting arm points at the ball, hitting elbow drawn back high
    const takeK = clamp(u * 3, 0, 1),
      qw = quickWind(d), // a quick: arms up with the take-off, the hitting arm drawn back only just before the snap (playback SWING_FAST)
      draw = qw != null ? qw : sty === 'quick' ? clamp(u * 2.2, 0, 1) : sm(clamp((u - 0.15) / 0.55, 0, 1));
    const rA = draw > 0 ? mixArmS(mirror(ARMS_UP), keys[0][1], draw, -1) : mixArmS(mirror(ARMS_LOW), mirror(ARMS_UP), takeK, -1),
      lA = draw > 0 ? mixArmS(ARMS_UP, UP_L, draw) : mixArmS(ARMS_LOW, ARMS_UP, takeK);
    const body = mixT({ hp: -0.05, sp: 0.05, cp: 0, tw: 0, hd: -0.6 }, bowT, draw);
    const rise = {
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
    // just off the floor: still the take-off frame, handing over to the air pose (2026-10-23: it switched at once — a
    // one-frame flick of the arms and knees as the feet left)
    const lift = sm(clamp((d.jy - 8) / (0.22 * pk), 0, 1));
    return lift < 1 ? { ...mixS(approachPose(d, m, 1), rise, lift), face, aimL: rise.aimL * lift } : rise;
  }
  // 2. the swing: uncoil → contact on a straight arm → wrist snap → follow-through; legs pike, then reach for the floor
  const e = swingE(d);
  const tor0 = trackC([[0, { ...bowT, hp: BOW_T.hp, sp: BOW_T.sp * arch, cp: BOW_T.cp * arch, hd: BOW_T.hd }], ...TORSO.slice(1)], e, mixT),
    // …and the harder it is, the more the body jack-knifes over after contact
    pike = e > CE ? bend * sm(clamp((e - CE) / 0.2, 0, 1)) : 0,
    // the back stays bent through the whip until the hit (the bow lets go only at contact), then the jack-knife
    held = e < CE ? bend * (1 - sm(e / CE)) : 0,
    tor = {
      ...tor0,
      hp: tor0.hp - 0.22 * held + 0.3 * pike,
      sp: tor0.sp - 0.45 * held + 0.34 * pike,
      cp: tor0.cp - 0.42 * held + 0.24 * pike,
      hd: tor0.hd - 0.35 * held
    },
    rA = trackC(keys, e, mixArmSR),
    lA = trackC(LKEYS, e, mixArmS);
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
// The float's cock (2026-10-23): bow and arrow like the spike's, smaller — elbow high and back, the hand up by the ear, palm
// to the net. (It used poses3d's COCK_SERVE: the goalpost — elbow at the side, forearm straight up — taken out of the spike on
// 2026-10-20; and the arm got there through the hip: the lerp from hanging down to up-and-back passed behind the body.)
const CK_MID = RA(V(-0.88, 0.2, -0.42), V(-0.5, 0.78, -0.36), V(-0.45, 0.8, -0.4), V(0, 0.25, 0.97)); // (the elbow lifts out to the side first)
const FLOAT_COCK = RA(V(-0.66, 0.5, -0.56), V(0.32, 0.9, -0.28), V(0.28, 0.88, -0.38), V(0.1, 0.2, 0.97));
// Jump float, in the air: knees bent behind the body, feet together (not the standing stride), then reaching for the floor.
const FLOAT_AIR = { L: leg(0.12, 1.0, 0.75, 0.1), R: leg(0.02, 1.15, 0.8, 0.1) },
  FLOAT_DOWN = { L: leg(0.3, 0.4, 0.25, 0.16), R: leg(0.24, 0.35, 0.25, 0.16) };
/** Ease into the key at speed (in), out of it at speed (out): Hermite with one end tangent 1. */
const easeIn = s => 2 * s * s - s * s * s,
  easeOut = s => s + s * s - s * s * s;
/** Float serve (standing, or with a jump): toss, cock, short punch through the ball; then the landing / a small dip. */
export function servePose(d, m) {
  const lb = d.spkStyle === 'jumpfloat' ? landBlend(d, m, servePose) : null;
  if (lb) return lb;
  const sw = d.spk,
    pt = d.pt || 0,
    air = d.jy > 8,
    jumpy = d.spkStyle === 'jumpfloat',
    base = { hp: 0.1, sp: 0.02, L: leg(0.35, 0.3, 0, 0.12), R: leg(-0.25, 0.25, 0, 0.12), hd: -0.35, curlR: 0, face: { angry: 0.35 } };
  if (jumpy && !air && sw != null) return landPose(d, sw, m); // touching down: crouch to absorb, like the jump serve
  // legs: airborne → tucked behind (never the standing stride); running up → real strides, and a light plant before the hop
  let legs = null;
  const J = d.jmode;
  if (jumpy && air) {
    const pk = (J && J.peak) || 60,
      u = clamp(d.jy / pk, 0, 1),
      down = sw != null ? sm(clamp(1 - u / 0.5, 0, 1)) : 0,
      lift = sw != null ? 1 : sm(clamp((d.jy - 8) / (0.35 * pk), 0, 1)), // (2026-10-23: the stride switched to the tuck at once)
      tk = lift < 1 ? approachPose(d, m, 1) : null;
    legs = { L: mixLeg(FLOAT_AIR.L, FLOAT_DOWN.L, down), R: mixLeg(FLOAT_AIR.R, FLOAT_DOWN.R, down) };
    if (tk) legs = { L: mixLeg(tk.L, legs.L, lift), R: mixLeg(tk.R, legs.R, lift) };
  } else if (jumpy && sw == null && J && J.mode === 'up' && d.jt != null) {
    // the approach's plant and take-off, half as deep (a hop, not a spike jump)
    const ap = approachPose(d, m),
      lp = m && moving(m) ? locoPose(m) : base,
      k = sm(clamp((d.jt / Math.max(0.05, J.t0) - 0.5) / 0.25, 0, 1));
    legs = {
      L: mixLeg(lp.L, mixLeg(ap.L, lp.L, 0.4), k),
      R: mixLeg(lp.R, mixLeg(ap.R, lp.R, 0.4), k),
      lift: (lp.lift || 0) * (1 - k),
      hp: mixN(base.hp, ap.hp * 0.6, k)
    };
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
      al: mixArmS([V(0.2, -0.3, 0.93), V(0.1, -0.1, 1), V(0.1, 0, 1)], TOSS_L, t1),
      ar: viaArm(mirror(DOWN_ARM), CK_MID, FLOAT_COCK, kk, -1),
      tw: -0.5 * kk,
      hd: -0.35 - 0.3 * t1
    });
  }
  const pre = swingLead(d) || 70,
    e = sw < pre ? (0.42 * sw) / pre : Math.min(1, 0.42 + (0.58 * (sw - pre)) / 110),
    // a standing serve: the body follows the punch with a small dip and settles back (some impact, no jump)
    dip = jumpy ? 0 : sm(clamp((sw - pre) / 90, 0, 1)) * (1 - sm(clamp((sw - pre - 110) / 260, 0, 1))),
    // …then, the punch held a moment, the arm comes down and the server settles into the ready stance by the time the move
    // is done (2026-10-23: the arm stayed out straight, then snapped to the ready stance)
    rel = jumpy ? 0 : sm(clamp((sw - pre - 230) / 380, 0, 1));
  const out = fin({
    ...base,
    hp: base.hp + 0.22 * dip,
    L: mixLeg(base.L, leg(0.5, 0.75, 0, 0.12), dip),
    R: mixLeg(base.R, leg(0.05, 0.6, 0, 0.12), dip),
    al: mixArmS(TOSS_L, PULL_L, clamp(e * 1.4, 0, 1)),
    // (the hand meets the ball at speed — it used to ease to a stop on it — and the punch stops short after)
    ar: e < 0.42 ? mixArmS(FLOAT_COCK, FLOAT_HIT, easeIn(e / 0.42), -1) : mixArmS(FLOAT_HIT, PUNCH_R, easeOut((e - 0.42) / 0.58), -1),
    tw: e < 0.42 ? mixN(-0.5, 0, e / 0.42) : 0.2,
    sp: (e < 0.42 ? -0.1 : 0.12) + 0.08 * dip,
    contact: clamp(1 - Math.abs(e - 0.42) / 0.2, 0, 1)
  });
  return rel > 0 ? { ...mixS(out, readyNow(d, m), rel), face: out.face, contact: 0 } : out;
}
