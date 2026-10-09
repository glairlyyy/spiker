// Point celebrations (owner, 2026-10-09): the scorer's moment after a kill / ace / kill block, and the teammates joining in.
// Each is a short keyframed move, not a held pose: fist pump "Yes!", the jump-spin-stomp (big points), the sky roar, the
// finger to the sky, the taunt (finger to the lips / hand to the ear), the shy hop; teammates clap or high-five.
// Presentation only: picked by personality and the size of the moment through a hash (never R()); goldens untouched.
// The engine's 'roar' pose act becomes a pending celebration (acts.js) that starts once the player has landed (actors3d).
import * as THREE from 'three';
import { mirror } from './players3d.mjs';
import { clamp } from '../map3d/geo3d.mjs';
import { mixArm } from './poses3d.mjs'; // (import cycle: used inside functions only — twists blend by the real roll)

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const leg = (a, k, f = 0, s = 0.12) => ({ a, k, f, s });
const sm = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const lg = (a, b, t) => ({
  a: lerp(a.a, b.a, t),
  k: lerp(a.k, b.k, t),
  f: lerp(a.f || 0, b.f || 0, t),
  s: lerp(a.s ?? 0.12, b.s ?? 0.12, t)
});
const NUM = ['hp', 'sp', 'cp', 'hd', 'hy', 'hroll', 'tw', 'shrug', 'curl', 'curlL', 'curlR', 'lift', 'yaw'];
/** Blend two key poses (numbers, legs, arms; `ar` falls back to the mirror of `al`). */
function mixK(A, B, t) {
  const o = {};
  for (const k of NUM) o[k] = lerp(A[k] ?? 0, B[k] ?? 0, t);
  o.L = lg(A.L, B.L, t);
  o.R = lg(A.R, B.R, t);
  o.al = mixArm(A.al, B.al, t);
  o.ar = mixArm(A.ar || mirror(A.al), B.ar || mirror(B.al), t, -1);
  o.face = t < 0.5 ? A.face : B.face;
  return o;
}
/** Keyframes [[t (0..1), pose], …] → the pose at t (smoothstep between keys). */
function play(keys, t) {
  if (t <= keys[0][0]) return mixK(keys[0][1], keys[0][1], 0);
  for (let i = 1; i < keys.length; i++)
    if (t <= keys[i][0]) return mixK(keys[i - 1][1], keys[i][1], sm((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  const last = keys[keys.length - 1][1];
  return mixK(last, last, 0);
}

// ---------- arm and leg shapes (left arm, torso space: +x out to the left, +y up, +z forward) ----------
const DOWN = [V(0.22, -1, 0.05), V(0.16, -1, 0.3), V(0.1, -1, 0.35)];
const LOOSE = [V(0.35, -0.93, 0.1), V(0.3, -0.85, 0.42), V(0.25, -0.8, 0.5)];
const AT_HEAD = [V(0.92, 0.3, 0.25), V(-0.35, 0.9, 0.25), V(-0.35, 0.9, 0.25)]; // fist cocked beside the head
const PUMP = [V(0.3, -0.92, 0.25), V(0.05, 0.55, 0.83), V(0.05, 0.6, 0.8)]; // elbow driven down to the ribs, fist in front of the chest
const UP_V = [V(0.6, 0.78, 0.12), V(0.35, 0.93, 0.05), V(0.3, 0.95, 0)]; // both fists to the sky
const UP_HIGH = [V(0.4, 0.9, 0.15), V(0.2, 0.98, 0.05), V(0.2, 0.98, 0.05)];
const FLING = [V(0.78, -0.55, -0.2), V(0.82, -0.5, -0.25), V(0.85, -0.45, -0.25)]; // arms flung down and out, palms open
const TUCK = [V(0.35, -0.5, 0.8), V(-0.2, 0.3, 0.93), V(-0.25, 0.4, 0.9)];
const POINT_UP = [V(0.12, 0.99, 0.05), V(0.08, 1, 0.08), V(0.05, 1, 0.1)];
const CHEST = [V(0.25, -0.9, 0.3), V(-0.45, 0.45, 0.77), V(-0.45, 0.55, 0.7)]; // fists tucked at the chest
const LIPS = [V(0.25, -0.55, 0.8), V(-0.35, 0.88, 0.3), V(-0.4, 0.9, 0.2)]; // a finger to the lips
const EAR = [V(0.95, 0.15, 0.1), V(-0.15, 0.98, -0.05), V(-0.2, 0.95, -0.1)]; // a hand cupped to the ear
const CLAP_OPEN = [V(0.35, -0.45, 0.82), V(0.25, 0.15, 0.95), V(0.2, 0.2, 0.95)];
const CLAP_SHUT = [V(0.3, -0.45, 0.84), V(-0.5, 0.15, 0.85), V(-0.55, 0.2, 0.8)];
const FIVE_UP = [V(0.25, 0.75, 0.6), V(0.12, 0.9, 0.42), V(0.1, 0.95, 0.3)];
const FIVE_HIT = [V(0.25, 0.65, 0.72), V(0.05, 0.55, 0.83), V(0.05, 0.5, 0.86)];
const R = a => mirror(a); // a left-arm shape on the right arm

const stand = { hp: 0.04, sp: 0.02, L: leg(0.1, 0.16), R: leg(0.02, 0.1), al: LOOSE, curl: 0.5, face: { happy: 0.8 } };
const dip = (o = {}) => ({ ...stand, hp: 0.3, L: leg(0.45, 0.75, 0, 0.18), R: leg(0.35, 0.65, 0, 0.18), ...o });
const P = o => ({ ...stand, ...o });

// ---------- the moves ----------
/** kind → { ms: length, keys(d) → keyframes } (keys may differ per player by a hash bit: which arm, which taunt). */
const MOVES = {
  // "Yes!": the fist cocks by the head, pulls down hard with a knee dip and a shout, a second smaller pump
  fist: {
    ms: 1150,
    keys: () => [
      [0, P({ al: LOOSE, ar: R(LOOSE) })],
      [0.16, P({ sp: -0.12, hd: -0.2, ar: R(AT_HEAD), curlR: 1, face: { angry: 0.4, happy: 0.5 } })],
      [0.32, dip({ sp: 0.28, cp: 0.12, hd: 0.05, ar: R(PUMP), al: LOOSE, curl: 1, face: { angry: 0.7, aa: 1 } })],
      [0.5, P({ sp: 0.05, ar: R(AT_HEAD), curlR: 1, face: { happy: 0.9, aa: 0.4 } })],
      [0.64, dip({ hp: 0.2, sp: 0.22, ar: R(PUMP), curl: 1, face: { angry: 0.5, aa: 0.9 } })],
      [0.86, P({ sp: 0.08, ar: R(PUMP), curl: 1, face: { happy: 1 } })],
      [1, P({ face: { happy: 0.8 } })]
    ]
  },
  // the jump, spin and stomp (big points only): two bouncing steps, a half spin in the air, a wide landing, arms flung down
  siu: {
    ms: 1600,
    keys: () => [
      [0, P({})],
      [0.07, P({ lift: 0.05, L: leg(0.5, 0.6), R: leg(-0.2, 0.2), al: TUCK, ar: R(LOOSE) })],
      [0.14, P({ lift: 0.06, L: leg(-0.2, 0.2), R: leg(0.5, 0.6), al: LOOSE, ar: R(TUCK) })],
      [0.2, dip({ hp: 0.45, sp: 0.3, L: leg(0.7, 1.2, 0, 0.16), R: leg(0.7, 1.2, 0, 0.16), al: DOWN, curl: 0.6 })],
      [
        0.32,
        P({
          lift: 0.55,
          yaw: Math.PI * 0.55,
          L: leg(0.3, 0.9, 0.4),
          R: leg(0.2, 1.0, 0.4),
          al: UP_HIGH,
          sp: -0.1,
          face: { happy: 0.6, aa: 0.6 }
        })
      ],
      [0.44, P({ lift: 0.25, yaw: Math.PI, L: leg(0.15, 0.4, 0.2, 0.3), R: leg(0.15, 0.4, 0.2, 0.3), al: TUCK, face: { aa: 0.8 } })],
      [
        0.5,
        P({
          hp: 0.4,
          sp: -0.2,
          cp: -0.25,
          hd: -0.35,
          yaw: Math.PI,
          L: leg(0.55, 1.0, 0, 0.5),
          R: leg(0.55, 1.0, 0, 0.5),
          al: FLING,
          curl: 0,
          face: { angry: 0.5, aa: 1 }
        })
      ],
      [
        0.82,
        P({
          hp: 0.3,
          sp: -0.25,
          cp: -0.3,
          hd: -0.45,
          yaw: Math.PI,
          L: leg(0.45, 0.8, 0, 0.5),
          R: leg(0.45, 0.8, 0, 0.5),
          al: FLING,
          curl: 0,
          face: { angry: 0.4, aa: 1 }
        })
      ],
      [1, P({ yaw: Math.PI * 2, face: { happy: 1 } })]
    ]
  },
  // the sky roar, with a move: crouch, explode up off the floor, both fists to the sky, shaking, then down
  sky: {
    ms: 1300,
    keys: () => [
      [0, P({})],
      [
        0.16,
        dip({
          hp: 0.5,
          sp: 0.4,
          cp: 0.2,
          hd: 0.3,
          L: leg(0.8, 1.3, 0, 0.2),
          R: leg(0.8, 1.3, 0, 0.2),
          al: CHEST,
          curl: 1,
          face: { angry: 0.6 }
        })
      ],
      [
        0.34,
        P({
          lift: 0.32,
          sp: -0.25,
          cp: -0.15,
          hd: -0.45,
          L: leg(0.1, 0.3, 0.5),
          R: leg(0.1, 0.3, 0.5),
          al: UP_V,
          curl: 1,
          face: { angry: 0.6, aa: 1 }
        })
      ],
      [
        0.46,
        P({
          hp: 0.15,
          sp: -0.25,
          hd: -0.45,
          L: leg(0.3, 0.5, 0, 0.22),
          R: leg(0.2, 0.45, 0, 0.22),
          al: UP_V,
          curl: 1,
          face: { angry: 0.6, aa: 1 }
        })
      ],
      [
        0.6,
        P({
          sp: -0.3,
          hd: -0.5,
          shrug: 0.15,
          L: leg(0.3, 0.4, 0, 0.22),
          R: leg(0.1, 0.3, 0, 0.22),
          al: UP_HIGH,
          curl: 1,
          face: { angry: 0.7, aa: 1 }
        })
      ],
      [
        0.74,
        P({
          sp: -0.22,
          hd: -0.4,
          L: leg(0.3, 0.45, 0, 0.22),
          R: leg(0.15, 0.35, 0, 0.22),
          al: UP_V,
          curl: 1,
          face: { angry: 0.5, aa: 0.8 }
        })
      ],
      [0.88, P({ sp: -0.28, hd: -0.45, shrug: 0.12, al: UP_HIGH, curl: 1, face: { happy: 0.7, aa: 0.6 } })],
      [1, P({ face: { happy: 0.9 } })]
    ]
  },
  // the cool one: a calm finger to the sky, a little turn, a nod, arm down
  point: {
    ms: 1300,
    keys: () => [
      [0, P({ face: { relaxed: 0.6 } })],
      [0.25, P({ yaw: 0.35, sp: -0.05, hd: -0.3, ar: R(POINT_UP), curlR: 0.85, face: { happy: 0.4, relaxed: 0.5 } })],
      [0.55, P({ yaw: 0.45, sp: -0.1, hd: -0.45, ar: R(POINT_UP), curlR: 0.85, face: { happy: 0.5 } })],
      [0.7, P({ yaw: 0.4, hd: 0.2, ar: R(POINT_UP), curlR: 0.85, face: { happy: 0.5 } })],
      [0.8, P({ yaw: 0.35, hd: -0.15, ar: R(POINT_UP), curlR: 0.85, face: { happy: 0.6 } })],
      [1, P({ yaw: 0, face: { relaxed: 0.6 } })]
    ]
  },
  // the taunt: lean at the other side with a finger to the lips — or a hand cupped to the ear, turned to the crowd, bouncing
  taunt: {
    ms: 1400,
    keys: d =>
      d.cele.alt
        ? [
            [0, P({})],
            [0.2, P({ yaw: -0.9, sp: -0.1, hroll: 0.25, ar: R(EAR), curlR: 0.2, face: { happy: 0.5 } })],
            [0.35, P({ yaw: -0.9, lift: 0.1, hroll: 0.3, ar: R(EAR), al: UP_V, curlR: 0.2, curlL: 1, face: { happy: 0.8, aa: 0.5 } })],
            [0.5, P({ yaw: -0.9, hroll: 0.3, ar: R(EAR), al: LOOSE, curlR: 0.2, face: { happy: 0.8 } })],
            [0.65, P({ yaw: -0.9, lift: 0.1, hroll: 0.3, ar: R(EAR), al: UP_V, curlR: 0.2, curlL: 1, face: { happy: 0.9, aa: 0.5 } })],
            [0.82, P({ yaw: -0.8, hroll: 0.25, ar: R(EAR), curlR: 0.2, face: { happy: 0.8 } })],
            [1, P({ yaw: 0 })]
          ]
        : [
            [0, P({})],
            [
              0.2,
              P({
                sp: 0.25,
                cp: 0.1,
                hd: -0.15,
                L: leg(0.5, 0.4, 0, 0.16),
                R: leg(-0.1, 0.15),
                ar: R(LIPS),
                curlR: 0.8,
                face: { happy: 0.5 }
              })
            ],
            [
              0.4,
              P({
                sp: 0.3,
                cp: 0.12,
                hd: -0.2,
                hy: 0.15,
                L: leg(0.5, 0.4, 0, 0.16),
                R: leg(-0.1, 0.15),
                ar: R(LIPS),
                curlR: 0.8,
                face: { happy: 0.6 }
              })
            ],
            [
              0.6,
              P({
                sp: 0.3,
                cp: 0.12,
                hd: -0.2,
                hy: -0.15,
                L: leg(0.5, 0.4, 0, 0.16),
                R: leg(-0.1, 0.15),
                ar: R(LIPS),
                curlR: 0.8,
                face: { happy: 0.6 }
              })
            ],
            [0.8, P({ sp: 0.2, hd: -0.1, ar: R(LIPS), curlR: 0.8, face: { happy: 0.8 } })],
            [1, P({})]
          ]
  },
  // the shy one: two little hops with the fists tucked at the chest, shoulders up, a big smile
  hop: {
    ms: 1100,
    keys: () => [
      [0, P({ al: CHEST, curl: 1, face: { happy: 0.7 } })],
      [0.12, dip({ hp: 0.2, al: CHEST, curl: 1, shrug: 0.15, face: { happy: 0.9 } })],
      [0.25, P({ lift: 0.16, L: leg(0.2, 0.6, 0.4), R: leg(0.2, 0.6, 0.4), al: CHEST, curl: 1, shrug: 0.2, face: { happy: 1, aa: 0.4 } })],
      [0.38, dip({ hp: 0.2, al: CHEST, curl: 1, shrug: 0.15, face: { happy: 1 } })],
      [0.52, P({ lift: 0.14, L: leg(0.2, 0.6, 0.4), R: leg(0.2, 0.6, 0.4), al: CHEST, curl: 1, shrug: 0.2, face: { happy: 1, aa: 0.4 } })],
      [0.66, dip({ hp: 0.15, al: CHEST, curl: 1, shrug: 0.1, face: { happy: 1 } })],
      [0.85, P({ al: CHEST, curl: 1, shrug: 0.12, face: { happy: 0.9 } })],
      [1, P({ face: { happy: 0.8 } })]
    ]
  },
  // a teammate: three claps with a bounce
  clap: {
    ms: 1000,
    keys: () => {
      const o = P({ al: CLAP_OPEN, curl: 0.1, face: { happy: 0.9 } }),
        s = P({ al: CLAP_SHUT, curl: 0.1, lift: 0.04, face: { happy: 1, aa: 0.4 } });
      return [
        [0, P({})],
        [0.15, o],
        [0.27, s],
        [0.39, o],
        [0.51, s],
        [0.63, o],
        [0.75, s],
        [1, P({})]
      ];
    }
  },
  // the nearest teammate: turns to the scorer, hand up, a slap, down
  five: {
    ms: 1000,
    keys: () => [
      [0, P({})],
      [0.3, P({ sp: -0.05, ar: R(FIVE_UP), curlR: 0, face: { happy: 0.9 } })],
      [0.42, P({ sp: 0.1, lift: 0.05, ar: R(FIVE_HIT), curlR: 0, face: { happy: 1, aa: 0.6 } })],
      [0.7, P({ ar: R(FIVE_UP), curlR: 0.3, face: { happy: 1 } })],
      [1, P({})]
    ]
  }
};
export const CELE_KINDS = Object.keys(MOVES);
export const celeMs = kind => (MOVES[kind] || MOVES.fist).ms;
/**
 * The celebration pose of d at its time (d.cele = { kind, t ms, yaw0 }); sets d.celeYaw (the body turn: a spin, a turn to
 * the crowd or the scorer). null when it is over.
 */
export function celePose(d) {
  const c = d.cele,
    M = c && MOVES[c.kind];
  if (!M || c.t == null || c.t < 0) return null;
  const t = clamp(c.t / M.ms, 0, 1);
  if (c.t >= M.ms) {
    d.celeYaw = 0;
    return null;
  }
  const o = play(c.keysC || (c.keysC = M.keys(d)), t);
  d.celeYaw = (o.yaw || 0) * (c.mir || 1) + (c.yaw0 || 0) * Math.min(1, t * 4) * Math.min(1, (1 - t) * 4);
  return o;
}
