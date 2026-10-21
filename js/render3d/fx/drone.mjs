// The Ref drone (spec §4.38, lore §4): a small low-poly drone that hovers over the net and follows the ball at every venue
// but the Academy Hall. On a call (A.call, set by render/acts.js refCall: net touch, foot fault, double contact, a close in /
// out) it drops to the spot, flashes the hologram word and traces the line. Display only: Math.random never, the engine's
// R() never; it rides the frame clock and never holds up play.
import * as THREE from 'three';
import { W, canvasTex } from '../units3d.mjs';
import { TEX_GLOW } from './kit.mjs';

/** A theme token (css/theme.css), read once. */
const tok = (n, d) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
  } catch (e) {
    return d;
  }
};
/** The words the drone projects (and the referee signals: venues/referee.mjs), by call kind; `ok`: an IN (good), else bad news. */
export const CALLS = {
  net: { word: 'NET TOUCH' },
  foot: { word: 'FOOT FAULT' },
  double: { word: 'DOUBLE CONTACT' },
  in: { word: 'IN', ok: 1 },
  out: { word: 'OUT' }
};
/** Timing (s) of a call: fly in, the word on, the line drawn, held, then back to the net. */
const T = { fly: 0.4, word: 0.25, draw: [0.3, 0.75], hold: 1.9, out: 0.35 };
/** Heights (m): hovering over the net, at a call, the word. */
const H = { hover: 4.4, call: 1.9, net: 3.2, word: 1.15 };
const TAPE = 150; // the net tape in engine height units (court.js: 2.43 m)

const COL = {};
const cols = () =>
  COL.cyan
    ? COL
    : Object.assign(COL, {
        cyan: tok('--cyan', '#4cc9f0'),
        good: tok('--good', '#4ade80'),
        bad: tok('--bad', '#ff2e4d'),
        ink: tok('--ink', '#eef0f3')
      });
const WORD_TEX = {};
/** The hologram word: a framed, scan-lined panel in the verdict colour. */
function wordTex(k) {
  if (WORD_TEX[k]) return WORD_TEX[k];
  const c = cols(),
    C = CALLS[k],
    col = C.ok ? c.good : c.bad;
  WORD_TEX[k] = canvasTex(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(8,14,24,0.55)';
    g.fillRect(24, 40, w - 48, h - 80);
    g.strokeStyle = c.cyan;
    g.lineWidth = 6;
    g.strokeRect(24, 40, w - 48, h - 80);
    g.fillStyle = c.cyan;
    for (const [x, y] of [
      [24, 40],
      [w - 24, 40],
      [24, h - 40],
      [w - 24, h - 40]
    ])
      g.fillRect(x - 14, y - 14, 28, 28); // corner brackets
    g.font = `800 ${C.word.length > 10 ? 118 : 136}px "Rajdhani","Inter",sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = col;
    g.shadowBlur = 28;
    g.fillStyle = col;
    g.fillText(C.word, w / 2, h / 2 + 6);
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 44; y < h - 40; y += 6) g.fillRect(26, y, w - 52, 2); // scan lines
  });
  return WORD_TEX[k];
}
const glow = (color, op) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

/** Build the drone (hidden until updateDrone shows it) with its hologram, projection cone and line trace; added to `scene`. */
export function makeDrone(scene) {
  const c = cols(),
    root = new THREE.Group(),
    shell = new THREE.MeshStandardMaterial({ color: '#1b2130', roughness: 0.45, metalness: 0.6, flatShading: true });
  // body: a flat octagon with a low dome and a lit band
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 8), shell);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), shell);
  dome.position.y = 0.04;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 4, 16), glow(c.cyan, 0.9));
  band.rotation.x = Math.PI / 2;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), glow(c.cyan, 1));
  eye.position.y = -0.05;
  root.add(body, dome, band, eye);
  // four arms with motors and spinning rotor discs
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2,
      arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.04), shell);
    arm.position.set(Math.cos(a) * 0.2, 0.01, Math.sin(a) * 0.2);
    arm.rotation.y = -a;
    const mot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 6), shell);
    mot.position.set(Math.cos(a) * 0.36, 0.03, Math.sin(a) * 0.36);
    const rot = new THREE.Mesh(
      new THREE.CircleGeometry(0.13, 12),
      new THREE.MeshBasicMaterial({ color: c.ink, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    rot.rotation.x = -Math.PI / 2;
    rot.position.set(mot.position.x, 0.065, mot.position.z);
    root.add(arm, mot, rot);
    rotors.push(rot);
  }
  root.scale.setScalar(1.5); // (~1.1 m across: readable from the broadcast camera)
  root.visible = false;
  scene.add(root);
  // the eye's halo, the projection cone down to the spot, the word, the line trace and the spot ring
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: TEX_GLOW,
      color: c.cyan,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.6
    })
  );
  halo.scale.set(0.5, 0.5, 1);
  root.add(halo);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1, 20, 1, true), glow(c.cyan, 0));
  cone.material.side = THREE.DoubleSide;
  cone.renderOrder = 4;
  const word = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: wordTex('in'), transparent: true, depthWrite: false, depthTest: false, opacity: 0 })
  );
  word.renderOrder = 6;
  const trace = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glow(c.cyan, 0));
  trace.rotation.x = -Math.PI / 2;
  trace.renderOrder = 3;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 32), glow(c.cyan, 0));
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 3;
  for (const o of [cone, word, trace, ring]) {
    o.visible = false;
    scene.add(o);
  }
  return {
    root,
    rotors,
    halo,
    cone,
    word,
    trace,
    ring,
    call: null,
    seen: 0,
    t: 0,
    pos: new THREE.Vector3(0, H.hover, 0),
    vel: new THREE.Vector3()
  };
}

const tgt = new THREE.Vector3(),
  spot = new THREE.Vector3(),
  prev = new THREE.Vector3(),
  base = new THREE.Vector3(),
  axis = new THREE.Vector3(),
  UP = new THREE.Vector3(0, 1, 0);
/** Where a call happens in the world (m): the spot on the floor (the tape for a net touch). */
function callSpot(call, out) {
  const h = call.k === 'net' ? TAPE : 0;
  return out.copy(W(call.at.x, call.at.z, h));
}
/** The line trace of a call: along the end line (foot), the tape (net), the line it landed by (in / out); a ring for a double. */
function placeTrace(d, call, s) {
  const tr = d.trace;
  tr.position.copy(s);
  tr.position.y = call.k === 'net' ? s.y + 0.02 : 0.03; // (over the court mesh)
  tr.rotation.set(-Math.PI / 2, 0, 0);
  const alongZ = call.k === 'foot' || call.k === 'net' || (call.line && call.line.axis === 'x'); // a line of constant x runs along world z
  if (call.line) {
    const p = call.line.axis === 'x' ? W(call.line.v, call.at.z) : W(call.at.x, call.line.v);
    tr.position.x = p.x;
    tr.position.z = p.z;
  }
  tr.rotation.z = alongZ ? Math.PI / 2 : 0;
  d.ring.position.set(s.x, 0.032, s.z);
}
/**
 * Per frame: hover over the net following the ball (`ball`, world position), or play the current call (`call` = A.call,
 * a new one when its n changes). `on`: the venue flies a drone (every one but the Academy Hall). dt in seconds.
 */
export function updateDrone(d, call, ball, dt, now, on) {
  const parts = [d.root, d.cone, d.word, d.trace, d.ring];
  if (!on) {
    for (const o of parts) o.visible = false;
    d.call = null;
    if (call) d.seen = call.n;
    return;
  }
  d.root.visible = true;
  if (call && call.n !== d.seen) {
    d.seen = call.n;
    d.call = call;
    d.t = 0;
    d.word.material.map = wordTex(CALLS[call.k] ? call.k : 'out');
    const C = CALLS[call.k] || CALLS.out;
    d.word.scale.set(C.word.length > 10 ? 2.6 : 1.9, C.word.length > 10 ? 0.65 : 0.48, 1);
    const col = C.ok ? cols().good : cols().bad;
    d.trace.material.color.set(col);
    d.ring.material.color.set(col);
    callSpot(call, spot);
    placeTrace(d, call, spot);
    d.spot = spot.clone();
  }
  const cl = d.call;
  if (cl) d.t += dt;
  const live = cl && d.t < T.hold + T.out;
  if (cl && !live) d.call = null;
  // where to fly: over the net following the ball (kept near the net, inside the court), or down to the call
  if (live)
    tgt.set(
      d.spot.x,
      cl.k === 'net' ? H.net : H.call,
      d.spot.z + (cl.k === 'foot' ? (d.spot.z > 0 ? -1 : 1) * 1.1 : 0) // (a foot fault: beside the server, not on top of them)
    );
  else
    tgt.set(
      THREE.MathUtils.clamp((ball ? ball.x : 0) * 0.12, -1.2, 1.2),
      H.hover + Math.sin(now * 0.0017) * 0.12,
      THREE.MathUtils.clamp(ball ? ball.z : 0, -4.6, 4.6)
    );
  prev.copy(d.pos);
  const k = 1 - Math.exp(-dt * (live ? 9 : 2.6));
  d.pos.lerp(tgt, k);
  d.vel.subVectors(d.pos, prev).divideScalar(Math.max(dt, 1e-3));
  d.root.position.copy(d.pos);
  d.root.position.y += Math.sin(now * 0.006) * 0.02; // the rotor bob
  // lean into the motion
  d.root.rotation.set(THREE.MathUtils.clamp(d.vel.z * 0.05, -0.35, 0.35), 0, THREE.MathUtils.clamp(-d.vel.x * 0.05, -0.35, 0.35));
  for (let i = 0; i < d.rotors.length; i++) d.rotors[i].rotation.z += dt * (i % 2 ? 40 : -40);
  // the call: the word over the spot, the cone from the eye down to it, the line drawn
  const fadeIn = x => THREE.MathUtils.clamp(x, 0, 1),
    fade = live ? fadeIn((d.t - T.word) / 0.15) * fadeIn((T.hold + T.out - d.t) / T.out) : 0,
    draw = live ? fadeIn((d.t - T.draw[0]) / (T.draw[1] - T.draw[0])) : 0;
  d.word.visible = d.cone.visible = d.trace.visible = d.ring.visible = fade > 0.01;
  d.halo.material.opacity = 0.5 + 0.5 * fade;
  if (!d.word.visible) return;
  const s = d.spot;
  d.word.position.set(s.x, (cl.k === 'net' ? s.y : 0) + H.word + 0.03 * Math.sin(now * 0.01), s.z);
  d.word.material.opacity = fade * (0.85 + 0.15 * Math.sin(now * 0.05)); // hologram flicker
  // the cone: apex at the drone's eye, base on the spot (tilted when the drone hangs beside it)
  base.set(s.x, cl.k === 'net' ? s.y : 0, s.z);
  axis.subVectors(d.root.position, base);
  const hgt = Math.max(0.2, axis.length());
  d.cone.position.copy(base).addScaledVector(axis, 0.5);
  d.cone.quaternion.setFromUnitVectors(UP, axis.normalize());
  d.cone.scale.set(1, hgt, 1);
  d.cone.material.opacity = 0.12 * fade;
  const len = cl.k === 'double' ? 0 : 2.6;
  d.trace.scale.set(Math.max(0.001, len * draw), 0.1, 1);
  d.trace.material.opacity = 0.95 * fade;
  d.ring.scale.setScalar(0.6 + 0.6 * draw);
  d.ring.material.opacity = 0.9 * fade;
}
