// Animation lab, 3D side (owner, 2026-10-09; dev only): while A.animLab is on, every frame of every player is kept for the
// last ANIM.sec seconds — the exact bone rotations, the root, the pose values that made them and the display state — and the
// ball. Freeze: the game pauses and the recording plays back instead of the live posing (scrub, play at ¼–1×, step frames),
// seen through a free orbit camera around the selected player, with optional foot marks (where each foot was every frame:
// a sliding foot leaves a smear). An edited pose (A.animLab.over) replaces the selected player's recorded frame, applied
// straight (no smoothing), so a value change shows at once. The panel is js/ui/anim-lab.js.
import * as THREE from 'three';
import { applyPose, groundSnap, updateVrm, DRIVEN } from './players3d.mjs';
import { setDebugCam } from './camera3d.mjs';

/** sec: seconds kept; fov: the orbit camera's field of view. */
const ANIM = { sec: 8, fov: 35 };
const rec = { frames: [], t: 0 };
/** The orbit camera around the selected player (yaw / pitch in radians, dist in metres). */
const orbit = { yaw: 0.9, pitch: 0.25, dist: 4.2, look: new THREE.Vector3(0, 1, 0) };
let marks = null;

/** A deep copy of a pose (its arm vectors, leg and face objects). */
function clonePose(p) {
  const o = {};
  for (const k in p) {
    const v = p[k];
    if (v && v.isVector3) o[k] = v.clone();
    else if (Array.isArray(v)) o[k] = v.map(x => (x && x.isVector3 ? x.clone() : x));
    else if (v && typeof v === 'object') o[k] = { ...v };
    else o[k] = v;
  }
  return o;
}
const INFO = ['pose', 'spk', 'spkStyle', 'jy', 'landMs', 'swing', 'pAge', 'bb'];
/** Once per frame after posing (r3d draw): keep this frame (world dt in s). */
export function animCapture(w, dt) {
  const L = A.animLab;
  if (!L || L.replay || A.paused || dt <= 1e-4) return; // (paused: nothing moves, nothing to keep)
  if (rec.owner !== L) {
    animClear(); // a new lab game
    rec.owner = L;
  }
  rec.t += dt * 1000;
  const f = { t: rec.t, ball: w.ball.visible ? w.ball.position.toArray() : null, pl: new Map() };
  for (const pl of w.people) {
    const d = pl.d;
    if (!d || !pl.root.visible) continue;
    const q = new Float32Array(DRIVEN.length * 4);
    DRIVEN.forEach((n, i) => {
      const b = pl.bone(n);
      if (b) b.quaternion.toArray(q, i * 4);
    });
    const feet = ['leftFoot', 'rightFoot'].map(n => pl.bone(n).getWorldPosition(new THREE.Vector3()).toArray());
    f.pl.set(d.p.id, {
      q,
      root: pl.root.position.toArray(),
      ry: pl.root.rotation.y,
      pose: pl.lastPose ? clonePose(pl.lastPose) : null,
      lift: pl.lastLift || 0,
      info: Object.fromEntries(INFO.map(k => [k, d[k]])),
      feet
    });
  }
  rec.frames.push(f);
  while (rec.frames.length && (rec.t - rec.frames[0].t > ANIM.sec * 1000 || rec.frames.length > ANIM.sec * 144)) rec.frames.shift();
}
/** The frame at index i (clamped). */
const frameAt = i => rec.frames[Math.max(0, Math.min(rec.frames.length - 1, i | 0))];

/** While frozen (r3d draw, in place of the live posing): put every player and the ball where the frame had them. */
export function animReplay(w, rdt) {
  const L = A.animLab;
  if (L.playing && rec.frames.length > 1) {
    // play the recording at its own pace × the lab speed, looping
    L.ms = (L.ms ?? frameAt(L.i).t) + rdt * 1000 * (L.speed || 1);
    const end = rec.frames[rec.frames.length - 1].t;
    if (L.ms > end) L.ms = rec.frames[0].t;
    let i = L.i;
    while (i < rec.frames.length - 1 && rec.frames[i + 1].t <= L.ms) i++;
    if (rec.frames[i].t > L.ms) i = 0;
    if (i !== L.i) {
      L.i = i;
      L.onFrame && L.onFrame();
    }
  }
  const f = frameAt(L.i);
  if (!f) return;
  for (const pl of w.people) {
    const r = pl.d && f.pl.get(pl.d.p.id);
    if (!r) continue;
    pl.root.position.fromArray(r.root);
    pl.root.rotation.set(0, r.ry, 0);
    if (L.over && pl.d.p.id === L.sel) {
      applyPose(pl, L.over); // the edited values, straight (no smoothing)
      groundSnap(pl, r.lift, L.over.lying); // feet back on the floor at the recorded jump height
    } else
      DRIVEN.forEach((n, i) => {
        const b = pl.bone(n);
        if (b) b.quaternion.fromArray(r.q, i * 4);
      });
    updateVrm(pl, 1 / 120);
  }
  w.ball.visible = !!f.ball;
  if (f.ball) w.ball.position.fromArray(f.ball);
  w.ballShadow.visible = false;
  // the orbit camera, aimed at the selected player's hips
  const sel = w.people.find(pl => pl.d && pl.d.p.id === L.sel);
  if (sel) sel.bone('hips').getWorldPosition(orbit.look);
  const cp = Math.cos(orbit.pitch),
    pos = orbit.look
      .clone()
      .add(new THREE.Vector3(Math.sin(orbit.yaw) * cp, Math.sin(orbit.pitch), Math.cos(orbit.yaw) * cp).multiplyScalar(orbit.dist));
  setDebugCam({ pos: pos.toArray(), look: orbit.look.toArray(), fov: ANIM.fov });
  showMarks(w, L);
}
/** Foot marks: every recorded foot position of the selected player (left blue, right pink); a sliding foot smears. */
function showMarks(w, L) {
  if (!L.marks) {
    if (marks) marks.visible = false;
    return;
  }
  if (!marks) {
    marks = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ size: 0.035, vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 })
    );
    marks.renderOrder = 999;
    w.scene.add(marks);
  }
  const pos = [],
    col = [];
  for (const f of rec.frames) {
    const r = f.pl.get(L.sel);
    if (!r) continue;
    r.feet.forEach((p, i) => {
      pos.push(...p);
      col.push(...(i ? [1, 0.35, 0.6] : [0.3, 0.7, 1]));
    });
  }
  marks.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  marks.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  marks.visible = true;
}
/** Freeze (start playback at the newest frame) or go back to the live game. */
export function animFreeze(on) {
  const L = A.animLab;
  L.replay = !!on;
  L.playing = false;
  L.over = null;
  L.i = rec.frames.length - 1;
  L.ms = null;
  const cv = document.getElementById('cv');
  if (cv) cv.style.visibility = on ? 'hidden' : ''; // the 2D overlay (tags, labels) is drawn for the game camera: hidden while frozen
  if (!on) {
    setDebugCam(null);
    if (marks) marks.visible = false;
  }
}
/** Drag on the court to orbit, wheel to zoom (only while frozen). */
export function animOrbit(dx, dy, dz) {
  orbit.yaw -= dx * 0.008;
  orbit.pitch = Math.max(-0.2, Math.min(1.4, orbit.pitch + dy * 0.006));
  orbit.dist = Math.max(1.2, Math.min(14, orbit.dist * (1 + dz * 0.001)));
}
/** The recording: how many frames, and frame i's time (ms from the first), selected player's pose and display state. */
export function animInfo(i) {
  const f = frameAt(i),
    r = f && f.pl.get(A.animLab.sel);
  return {
    n: rec.frames.length,
    ms: f ? Math.round(f.t - rec.frames[0].t) : 0,
    pose: r && r.pose ? clonePose(r.pose) : null,
    info: r ? r.info : null
  };
}
/** Forget the recording (a new lab game). */
export function animClear() {
  rec.frames.length = 0;
  rec.t = 0;
}
