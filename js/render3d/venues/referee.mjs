// The Academy's referee (spec §4.38, lore §4): the one court where a human on the stand calls the play. A figure with two
// arms on the wooden stand (venues/props.mjs) blows the whistle and gives the hand signal for each call (A.call, set by
// render/acts.js refCall). Display only: no randoms, rides the frame clock, never holds up play. The whistle's sound is sfx's.
import * as THREE from 'three';
import { TEX_GLOW } from '../fx/kit.mjs';

/** Arm poses (shoulder pitch x, roll z; rest = hanging down). `s` = toward the side the call is for (±1 along world x). */
const SIGNALS = {
  net: s => ({ [s > 0 ? 'R' : 'L']: { x: -1.25, z: s * 0.35 } }), // the hand to the tape on the side that touched it
  foot: s => ({ [s > 0 ? 'R' : 'L']: { x: 0, z: s * 1.05 } }), // points down at the end line the server stepped on
  double: s => ({ [s > 0 ? 'R' : 'L']: { x: -0.2, z: s * 2.7 } }), // an arm up, two fingers raised
  in: s => ({ [s > 0 ? 'R' : 'L']: { x: -0.35, z: s * 0.7 } }), // points at the floor on that side
  out: () => ({ L: { x: -0.3, z: -2.9 }, R: { x: -0.3, z: 2.9 } }) // both arms up
};
const WHISTLE = { arm: { x: -2.1, z: -0.45 }, t: 0.28 }, // the right hand at the mouth
  HOLD = 1.9;
/** The referee figure: body, head, a whistle, two arms pivoting at the shoulder; userData = its arms and whistle puff. */
export function makeReferee(color = '#1d1f26') {
  const g = new THREE.Group(),
    kit = new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
    skin = new THREE.MeshStandardMaterial({ color: '#e2bb94', roughness: 0.7 }),
    body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 3, 8), kit),
    head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin);
  body.position.y = 0.8;
  head.position.y = 1.6;
  body.castShadow = true;
  g.add(body, head);
  const arms = {};
  for (const [k, sx] of [
    ['L', -1],
    ['R', 1]
  ]) {
    const sh = new THREE.Group(),
      arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 2, 6), kit),
      hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), skin);
    sh.position.set(sx * 0.29, 1.32, 0);
    arm.position.y = -0.3;
    hand.position.y = -0.62;
    sh.add(arm, hand);
    g.add(sh);
    arms[k] = sh;
  }
  const puff = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: TEX_GLOW,
      color: '#ffffff',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0
    })
  );
  puff.position.set(0.05, 1.55, 0.2);
  puff.scale.set(0.3, 0.3, 1);
  g.add(puff);
  g.userData = { arms, puff, call: null, seen: 0, t: 0 };
  return g;
}
const ease = (a, b, k) => a + (b - a) * k;
/** Per frame: start a new call (`call` = A.call, new when its n changes), whistle, signal, back to rest. dt in seconds. */
export function updateReferee(ref, call, dt) {
  const u = ref.userData;
  if (call && call.n !== u.seen) {
    u.seen = call.n;
    u.call = call;
    u.t = 0;
  }
  if (u.call) u.t += dt;
  if (u.call && u.t > HOLD) u.call = null;
  const c = u.call,
    s = c ? (c.at.x < 500 ? -1 : 1) : 1, // world x < 0: side 0's half (as W maps it)
    pose = !c ? {} : u.t < WHISTLE.t ? { R: WHISTLE.arm } : (SIGNALS[c.k] || SIGNALS.out)(s),
    k = 1 - Math.exp(-dt * 14);
  for (const id of ['L', 'R']) {
    const a = u.arms[id],
      p = pose[id] || { x: 0, z: 0 };
    a.rotation.x = ease(a.rotation.x, p.x, k);
    a.rotation.z = ease(a.rotation.z, p.z, k);
  }
  const w = c && u.t < WHISTLE.t + 0.2 ? Math.sin(Math.min(1, u.t / (WHISTLE.t + 0.2)) * Math.PI) : 0;
  u.puff.material.opacity = 0.8 * w;
  u.puff.scale.setScalar(0.18 + 0.35 * w);
}
