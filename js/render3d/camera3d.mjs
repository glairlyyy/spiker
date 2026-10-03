// Cameras and projection: the game camera (broadcast / courtside, following the ball), staged scene shots (face,
// over-the-shoulder, wall, spike, ball close-ups with hard cuts), the court → screen projection P3D that the 2D
// overlay uses, and the 2D view transform (shake / push-in / zoom) applied to the render projection.
import * as THREE from 'three';
import { KH, KX, KZ } from './units3d.mjs';

const CAM = { pos: [-2.59, 14.011, 33.007], look: [-0.059, 3.294, 0.012], fov: 20.357 }; // fitted to the classic framing
export const ASPECT = 1000 / 440;
let world = null; // the built world (players, ball) for scene shots
export const setCameraWorld = w => (world = w);

export const base = new THREE.PerspectiveCamera(CAM.fov, ASPECT, 0.5, 200),
  cam = base.clone(),
  fwd = new THREE.Vector3();
let focal = 220 / Math.tan((CAM.fov * Math.PI) / 360); // logical px per unit at distance 1
let camMode = (() => {
  try {
    return localStorage.getItem('sc.cam3d') || 'courtside';
  } catch (e) {
    return 'courtside';
  }
})();
const camState = { x: 0, w: { broadcast: 0, courtside: 0, follow: 0, pov: 0 }, eff: '' };
if (!['broadcast', 'courtside', 'follow', 'pov'].includes(camMode)) camMode = 'courtside';
camState.w[camMode === 'follow' || camMode === 'pov' ? 'courtside' : camMode] = 1; // Follow / POV start from Courtside until a player is picked
let followId = null;
/** The player the Follow camera tracks (a player id; null → Courtside). */
export const setFollow = id => (followId = id == null ? null : id);
export const getFollow = () => followId;
const FOL = { back: 4.5, up: 2.6, ahead: 3, fov: 55, tau: 0.25, ball: [0.35, 0.6] },
  fol = { id: null, pos: new THREE.Vector3(), look: new THREE.Vector3() },
  fv = new THREE.Vector3(),
  fh = new THREE.Vector3();
/**
 * POV: the followed player's eyes (head bone + 0.08 m forward), looking at the ball while it is within 100° of their
 * facing, else straight ahead (a hitter on the approach / in the air always leans toward the ball: the set). Horizontal position follows the head exactly, height is smoothed within ±5 cm, the look point
 * ~0.12 s. In the air (> 0.6 m), in a dive, or while the view turns faster than 220°/s the pose blends (~0.25 s) to the
 * Follow pose and back 0.3 s after it calms (`pov.fb` 0..1; `povStats.switches` counts the changes).
 */
const POV = {
    fwd: 0.08,
    eye: 0.07,
    fov: 70,
    tau: 0.12,
    yTau: 0.1,
    bob: 0.05,
    turn: 220,
    air: 0.6,
    hold: 0.3,
    near: 0.1,
    cone: Math.cos((100 * Math.PI) / 180),
    far: Math.cos((140 * Math.PI) / 180)
  },
  pov = {
    id: null,
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, 1),
    y: 0,
    fb: 0,
    hold: 0,
    on: false,
    hide: false
  },
  povStats = { switches: 0, log: [] },
  pf = new THREE.Vector3(),
  ph = new THREE.Vector3(),
  pd = new THREE.Vector3(),
  pt = new THREE.Vector3();
export const getPovStats = () => povStats;
/** The player whose head should be hidden (the camera is at their eyes), else null. */
export const povHidden = () => (pov.hide ? followId : null);
/** The player whose POV camera is (blending) in, for fading figures that come close to it (T-070), else null. */
export const povFadeId = () => (camMode === 'pov' && camState.w.pov > 0.1 && shot.k < 0.3 ? followId : null);
function povPose(pl, dt, pos, look) {
  const yaw = pl.root.rotation.y,
    bp = lookBall();
  pf.set(Math.sin(yaw), 0, Math.cos(yaw));
  pl.bone('head').getWorldPosition(ph);
  const tx = ph.x + pf.x * POV.fwd,
    tz = ph.z + pf.z * POV.fwd,
    ty = ph.y + POV.eye,
    fresh = pov.id !== followId;
  pov.y = fresh ? ty : pov.y + (ty - pov.y) * (1 - Math.exp(-dt / POV.yTau));
  pov.y = clamp(pov.y, ty - POV.bob, ty + POV.bob);
  pov.pos.set(tx, pov.y, tz);
  pt.copy(bp).sub(pov.pos).setY(0);
  // the ball is looked at up to 100° off the facing, and fades out to straight ahead by 140° (no flip at the edge)
  const cs = pt.lengthSq() > 1e-4 ? pt.normalize().dot(pf) : -1,
    // a hitter on the approach / in the air (pose 'spike') looks for the set: the ball pulls the view whatever the angle (faceOpponent clamps it)
    kb = (pl.d && pl.d.pose === 'spike' ? 1 : clamp((cs - POV.far) / (POV.cone - POV.far), 0, 1)) * bw.v;
  pt.copy(pov.pos).addScaledVector(pf, 3).setY(pov.pos.y);
  pd.copy(pt).lerp(bp, kb);
  faceOpponent(pov.pos, pd, pl.d.side, 55);
  if (fresh) pov.look.copy(pd);
  else pov.look.lerp(pd, 1 - Math.exp(-dt / POV.tau));
  pt.copy(pov.look).sub(pov.pos).normalize();
  const rate = fresh || dt < 1e-3 ? 0 : (pt.angleTo(pov.dir) * 180) / Math.PI / dt;
  pov.dir.copy(pt);
  const wild = pl.root.position.y > POV.air || (pl.d && pl.d.pose === 'dive') || rate > POV.turn;
  if (fresh) {
    pov.fb = 0;
    pov.hold = 0;
  }
  pov.hold = wild ? POV.hold : Math.max(0, pov.hold - dt);
  const on = pov.hold > 0;
  if (on !== pov.on && !fresh) {
    povStats.switches++;
    if (povStats.log.length < 400) povStats.log.push([+pl.root.position.y.toFixed(2), +rate.toFixed(0), on ? 'follow' : 'pov']);
  }
  pov.on = on;
  pov.fb += ((on ? 1 : 0) - pov.fb) * (1 - Math.exp(-dt * 12));
  pov.id = followId;
  povStats.fb = pov.fb;
  pos.copy(pov.pos);
  look.copy(pov.look);
}
/**
 * The point the Follow / POV cameras look toward: the ball clamped to the playable box (a ball far out of the map must not
 * drag the view around), weighted by `bw.v` — 1 while the ball is in play and drawn, eased to 0 (~0.25 s) when it is hidden or
 * parked, so the view returns to straight ahead instead of snapping to a stale far position.
 */
const BALL_BOX = [16, 9, 9], // |x|, |z|, y max (m)
  bw = { v: 1, p: new THREE.Vector3() };
function lookBall() {
  const q = world.ball.position;
  return bw.p.set(clamp(q.x, -BALL_BOX[0], BALL_BOX[0]), clamp(q.y, 0, BALL_BOX[2]), clamp(q.z, -BALL_BOX[1], BALL_BOX[1]));
}
/** faceOpponent: from fade[0] to fade[1] rad off the axis the clamped look eases back to straight ahead (continuous behind the camera). */
const FACE = { fade: [1.75, Math.PI] },
  ZO = { max: 12, out: 14, back: 3 }, // back-off limit (m), speed backing off / returning (m/s)
  zo = { k: 0, d: 0, v: new THREE.Vector3() }; // auto zoom-out when the ball leaves the frame
/**
 * Keep a look point within `deg` of the opponent's side (the court axis toward the net) as seen from `pos`: the camera never
 * turns away from the other team, the ball only pulls the view sideways up to that limit (the auto zoom-out covers the rest).
 */
function faceOpponent(pos, look, side, deg) {
  const dx = look.x - pos.x,
    dz = look.z - pos.z,
    len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  const ax = side === 0 ? 0 : Math.PI,
    rel = Math.atan2(Math.sin(Math.atan2(dz, dx) - ax), Math.cos(Math.atan2(dz, dx) - ax)),
    lim = (deg * Math.PI) / 180,
    t = clamp((Math.abs(rel) - FACE.fade[0]) / (FACE.fade[1] - FACE.fade[0]), 0, 1),
    // a target almost straight behind (|rel| → 180°) would flip the clamp from +lim to −lim in one frame: fade the pull to 0 there
    fade = 1 - t * t * (3 - 2 * t),
    c = clamp(rel, -lim, lim) * fade;
  if (c === rel) return;
  look.x = pos.x + Math.cos(ax + c) * len;
  look.z = pos.z + Math.sin(ax + c) * len;
}
/** The figure on court for the followed player (null: off court / not drawn). */
const followFig = () => (world && followId != null ? world.people.find(pl => pl.d && pl.root.visible && pl.d.p.id === followId) : null);
/** Follow pose target: behind the player along their side's court axis, above, looking ahead and toward the ball. */
function followPose(pl, pos, look) {
  const side = pl.d.side,
    dir = side === 0 ? 1 : -1, // toward the net
    hips = pl.root.position,
    bp = lookBall(),
    mine = Math.sign(bp.x) === -dir, // ball on your side of the net
    lean = clamp((bp.z - hips.z) * 0.15, -1, 1) * bw.v;
  pos.set(hips.x - dir * FOL.back, Math.max(1.2, hips.y + FOL.up), hips.z + lean);
  pos.x = dir > 0 ? Math.min(pos.x, -0.5) : Math.max(pos.x, 0.5); // never inside the net plane
  fh.set(hips.x + dir * FOL.ahead, hips.y + 1.5, hips.z);
  look.copy(fh).lerp(bp, FOL.ball[mine ? 1 : 0] * bw.v);
  faceOpponent(pos, look, side, 40);
}
/** Broadcast = the classic full-court framing; courtside = closer and lower, following the ball along the court; follow = behind your player. */
export function updateBase(dt) {
  const fig = followFig(), // tracked in every mode, so a mode switch fades from / to a live pose
    eff = (camMode === 'follow' || camMode === 'pov') && !fig ? 'courtside' : camMode;
  camState.eff = eff;
  bw.v += ((A && A.ball.vis ? 1 : 0) - bw.v) * (1 - Math.exp(-dt / 0.25));
  const kw = 1 - Math.exp(-dt * 5); // ~0.6 s ease between modes
  for (const m in camState.w) camState.w[m] += ((m === eff ? 1 : 0) - camState.w[m]) * kw;
  const bx = A && A.ball.vis ? clamp((A.ball.x - 500) * KX * 0.75, -6.5, 6.5) : 0;
  camState.x += (bx - camState.x) * (1 - Math.exp(-dt * 1.6));
  const W3 = camState.w,
    pos = new THREE.Vector3(...CAM.pos).multiplyScalar(W3.broadcast),
    look = new THREE.Vector3(...CAM.look).multiplyScalar(W3.broadcast);
  pos.addScaledVector(fv.set(camState.x * 0.85, 3.3, 14.5), W3.courtside);
  look.addScaledVector(fv.set(camState.x, 1.55, -0.8), W3.courtside);
  let fov = CAM.fov * W3.broadcast + 31 * W3.courtside + FOL.fov * W3.follow + POV.fov * W3.pov;
  if (fig && world) {
    const tp = new THREE.Vector3(),
      tl = new THREE.Vector3();
    followPose(fig, tp, tl);
    if (fol.id !== followId) {
      fol.pos.copy(tp); // first frame (or a new player): start on target
      fol.look.copy(tl);
      fol.id = followId;
    } else {
      const k = 1 - Math.exp(-dt / FOL.tau);
      fol.pos.lerp(tp, k);
      fol.look.lerp(tl, k);
    }
  }
  if (fol.id != null && fol.id === followId) {
    pos.addScaledVector(fol.pos, W3.follow); // (the last pose while the player is off court: it only fades out)
    look.addScaledVector(fol.look, W3.follow);
  } else {
    pos.addScaledVector(fv.set(camState.x * 0.85, 3.3, 14.5), W3.follow);
    look.addScaledVector(fv.set(camState.x, 1.55, -0.8), W3.follow);
  }
  // POV (tracked while its figure is on court, so it blends in and out of a live pose); its fallback is the Follow pose
  if (fig && world) {
    const pp = new THREE.Vector3(),
      pl2 = new THREE.Vector3();
    povPose(fig, dt, pp, pl2);
    pov.pp = (pov.pp || new THREE.Vector3()).copy(pp.lerp(fol.pos, pov.fb));
    pov.pl = (pov.pl || new THREE.Vector3()).copy(pl2.lerp(fol.look, pov.fb));
    pov.fov = POV.fov + (FOL.fov - POV.fov) * pov.fb;
  }
  if (pov.pp && pov.id === followId) {
    pos.addScaledVector(pov.pp, W3.pov);
    look.addScaledVector(pov.pl, W3.pov);
    fov += (pov.fov - POV.fov) * W3.pov;
  } else {
    pos.addScaledVector(fv.set(camState.x * 0.85, 3.3, 14.5), W3.pov);
    look.addScaledVector(fv.set(camState.x, 1.55, -0.8), W3.pov);
    fov += (31 - POV.fov) * W3.pov;
  }
  // ball out of frame (judged on last frame's camera): widen the view until it is back, then ease in again; not in scene shots
  const bv = zo.v.copy(world ? world.ball.position : zo.v.set(0, 0, 0)).project(base),
    out = !!(A && A.ball.vis && !A.shot && (Math.abs(bv.x) > 0.85 || Math.abs(bv.y) > 0.85 || bv.z > 1));
  zo.k += ((out ? 1 : 0) - zo.k) * (1 - Math.exp(-dt / (out ? 0.3 : 0.8)));
  fov += (W3.follow * 28 + W3.pov * 20 + W3.courtside * 10) * zo.k;
  // Follow: the ball out of view is usually behind the camera, so keep backing the camera away from the net (and up) until the
  // ball is in view, then ease back in only once it is well inside the frame
  const vis = bv.z < 1 && Math.abs(bv.x) < 0.6 && Math.abs(bv.y) < 0.6;
  zo.d = clamp(zo.d + (out ? ZO.out : vis ? -ZO.back : 0) * dt, 0, ZO.max);
  if (zo.d > 0.001) {
    const k = W3.follow * zo.d,
      away = fig && fig.d.side === 1 ? 1 : -1; // away from the net on the followed player's side
    pos.x = clamp(pos.x + away * k, -19, 19);
    pos.y += k * 0.3;
  }
  // staged scene shot (A.shot from playback): hard cuts between shots, a quick ease in and out of the game camera
  const want = A && A.shot && world ? A.shot : null,
    key = want ? `${want.kind}|${want.p}|${want.p2 || ''}` : '';
  if (key && (key !== shot.key || shot.age < 0.2)) {
    // (re)frame: on a new shot, and for its first moments while the players settle into their poses
    const sp = shotPose(want);
    if (sp) {
      if (key !== shot.key) {
        if (shot.k > 0.5) shot.k = 1; // cut
        shot.age = 0;
      }
      Object.assign(shot, sp, { key });
    }
  }
  shot.age = (shot.age || 0) + dt;
  if (!key) shot.key = '';
  shot.k += ((shot.key ? 1 : 0) - shot.k) * (1 - Math.exp(-dt * (shot.key ? 16 : 5)));
  if (shot.k > 0.001) {
    const e = shot.k * shot.k * (3 - 2 * shot.k);
    // turn the view through the shortest arc at an even rate (lerping the look points snaps the view when the two shots differ a lot)
    const dg = sv1.copy(look).sub(pos),
      ds = sv2.copy(shot.look).sub(shot.pos),
      lg = dg.length(),
      ls = ds.length();
    sq.setFromUnitVectors(dg.normalize(), ds.normalize());
    sq0.identity().slerp(sq, e);
    pos.lerp(shot.pos, e);
    look.copy(pos).addScaledVector(dg.applyQuaternion(sq0), lg + (ls - lg) * e);
    fov += (shot.fov - fov) * e;
  }
  pov.hide = camMode === 'pov' && W3.pov * (1 - pov.fb) > 0.5 && shot.k < 0.3;
  base.near = W3.pov > 0.02 ? POV.near : 0.5; // eyes are close to the hands and the ball
  base.position.copy(pos);
  base.lookAt(look);
  base.fov = fov;
  base.updateMatrixWorld(true);
  base.updateProjectionMatrix();
  base.getWorldDirection(fwd);
  focal = 220 / Math.tan((base.fov * Math.PI) / 360);
  cam.position.copy(base.position);
  cam.quaternion.copy(base.quaternion);
  cam.updateMatrixWorld(true);
}
const sv1 = new THREE.Vector3(),
  sv2 = new THREE.Vector3(),
  sq = new THREE.Quaternion(),
  sq0 = new THREE.Quaternion();
const shot = { k: 0, key: '', pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 30 };
/** Camera for a scene shot: face close-up, over the setter's shoulder at the hitter, or from behind the block. */
function shotPose(s) {
  const find = id => world.people.find(pl => pl.d && pl.d.p.id === id),
    a = find(s.p);
  if (!a) return null;
  const up = new THREE.Vector3(0, 1, 0),
    H = a.bone('head').getWorldPosition(new THREE.Vector3());
  if (s.kind === 'face') {
    const f = new THREE.Vector3(Math.sin(a.root.rotation.y), 0, Math.cos(a.root.rotation.y)),
      r = new THREE.Vector3().crossVectors(f, up).normalize();
    return {
      pos: H.clone()
        .addScaledVector(f, 1.2)
        .addScaledVector(r, 0.3)
        .add(new THREE.Vector3(0, 0.05, 0)),
      look: H.clone().add(new THREE.Vector3(0, -0.07, 0)),
      fov: 30
    };
  }
  const b = s.p2 && find(s.p2),
    T = b ? b.bone('head').getWorldPosition(new THREE.Vector3()) : H.clone().add(new THREE.Vector3(0, 0, 1)),
    d = T.clone().sub(H).setY(0).normalize(),
    r = new THREE.Vector3().crossVectors(d, up).normalize();
  if (s.kind === 'spike') {
    // low and to the side of the hitter in the air, looking up past the arm at the ball
    const f = new THREE.Vector3(Math.sin(a.root.rotation.y), 0, Math.cos(a.root.rotation.y)),
      rr = new THREE.Vector3().crossVectors(f, up).normalize();
    return {
      pos: H.clone()
        .addScaledVector(rr, 2.1)
        .addScaledVector(f, 0.5)
        .add(new THREE.Vector3(0, -0.6, 0)),
      look: H.clone()
        .addScaledVector(f, 0.2)
        .add(new THREE.Vector3(0, 0.15, 0)),
      fov: 40
    };
  }
  if (s.kind === 'ball') {
    // at the ball against the blocker's hands, from the hitter's side
    const bp = world.ball.position.clone(),
      toA = (b ? T.clone() : bp.clone().add(new THREE.Vector3(1, 0, 0))).sub(bp).setY(0).normalize(),
      rr = new THREE.Vector3().crossVectors(toA, up).normalize();
    return {
      pos: bp
        .clone()
        .addScaledVector(toA, 1.9)
        .addScaledVector(rr, 0.7)
        .add(new THREE.Vector3(0, 0.3, 0)),
      look: bp.clone().addScaledVector(toA, -0.15),
      fov: 38
    };
  }
  if (s.kind === 'ots')
    return {
      pos: H.clone()
        .addScaledVector(d, -1)
        .addScaledVector(r, 0.45)
        .add(new THREE.Vector3(0, 0.22, 0)),
      look: T,
      fov: 38
    };
  return {
    pos: H.clone()
      .addScaledVector(d, -1.6)
      .addScaledVector(r, -0.4)
      .add(new THREE.Vector3(0, 0.5, 0)),
    look: T.clone().lerp(H, 0.25),
    fov: 44
  };
}
updateBase(1);
const pv = new THREE.Vector3(),
  pw = new THREE.Vector3();
/** Court → logical screen (the P() contract): X 0..1000, Y from VT, s = screen px per height unit. */
export function P3D(x, z, h) {
  pw.set((x - 500) * KX, h * KH, (0.5 - z) * KZ);
  pv.copy(pw).project(base);
  const depth = Math.max(1, pw.sub(base.position).dot(fwd));
  return { X: (pv.x + 1) * 500, Y: VT + (1 - pv.y) * 220, s: (focal * KH) / depth };
}
/** Apply the 2D view transform (screen = f·p + o in logical units: shake, push-in, zoom) to the render projection. */
const M = new THREE.Matrix4();
let dbg = null;
/** Test hook: a free camera ({ pos, look, fov }) or null. */
export const setDebugCam = c => (dbg = c);
export function viewCamera(V) {
  if (dbg) {
    // test hook: free camera (the overlay no longer lines up)
    cam.position.set(...dbg.pos);
    cam.lookAt(...dbg.look);
    cam.updateMatrixWorld(true);
    const pc = new THREE.PerspectiveCamera(dbg.fov || 30, ASPECT, 0.05, 200);
    cam.projectionMatrix.copy(pc.projectionMatrix);
    cam.projectionMatrixInverse.copy(pc.projectionMatrixInverse);
    return;
  }
  const f = V.f,
    bx = f - 1 + V.ox / 500,
    by = 1 - f - (VT * (f - 1) + V.oy) / 220;
  M.set(f, 0, 0, bx, 0, f, 0, by, 0, 0, 1, 0, 0, 0, 0, 1);
  cam.projectionMatrix.copy(base.projectionMatrix).premultiply(M);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}
export function setCamMode(m) {
  camMode = m;
  try {
    localStorage.setItem('sc.cam3d', m);
  } catch (e) {
    // storage blocked (private mode / sandboxed frame): the choice just isn't remembered
  }
}
export const getCamMode = () => camMode;
