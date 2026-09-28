// Spite & Spike 3D renderer. It draws the match state that render/playback.js simulates (A.disp, A.ball, A.cam,
// A.zoom…) with VRM anime players in a three.js arena; engine, beats, timing, UI and sound are untouched.
// While a match is bound, P() (court → screen) projects through this camera, so every screen-space effect, label
// and camera push-in the playback layer creates lines up with the 3D scene; those are drawn on the transparent 2D
// canvas on top. The world (renderer, arena, 10 dressed VRMs) is built once and re-dressed for every match.
//   units3d  court units → metres, textures      arena3d   court, net, stands, crowd, ball
//   camera3d game camera, scene shots, P3D       actors3d  posing players and coaches, trails, auras, rings
//   players3d VRM load / dress / pose apply      poses3d   pose library      fx3d / trails3d  effects
import * as THREE from 'three';
import { loadBase, makeVRM } from './players3d.mjs';
import { createFx } from './fx3d.mjs';
import { makeTrail } from './trails3d.mjs';
import { W, lowEnd } from './units3d.mjs';
import { buildArena, dressArena, updateBall, updateCrowd, updateNet, updatePointFlash, ballDir } from './arena3d.mjs';
import { base, cam, updateBase, viewCamera, P3D, setCameraWorld, setCamMode, getCamMode, setDebugCam } from './camera3d.mjs';
import { posePlayer, poseCoach, dressActors } from './actors3d.mjs';

const MODEL_URL = new URL('../../assets/vrm/base.glb.txt', import.meta.url).href;
const N_PLAYERS = 8,
  N_COACHES = 2;

let world = null,
  building = null;
/** Build the world once (download + parse the model, arena, players). onProgress(0..1, text). */
export function init(onProgress = () => {}) {
  if (world) return Promise.resolve(api);
  if (!building)
    building = build(onProgress).then(w => {
      world = w;
      setCameraWorld(w);
      return api;
    });
  else building.progress = onProgress;
  return building;
}

async function build(onProgress) {
  const gl = document.createElement('canvas');
  gl.id = 'cv3';
  gl.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('WebGL is not available');
  }
  const prog = (f, t) => (building && building.progress ? building.progress(f, t) : onProgress(f, t));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lowEnd ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1030');
  scene.fog = new THREE.Fog('#0b1030', 45, 90);

  const arena = buildArena(scene);
  const fx = createFx(scene);

  // players and coaches: one base model, parsed once per figure, dressed per match
  prog(0, 'Downloading players');
  const buf = await loadBase(MODEL_URL, f => prog(f * 0.5, 'Downloading players'));
  const people = [],
    coaches = [];
  for (let i = 0; i < N_PLAYERS + N_COACHES; i++) {
    const pl = await makeVRM(buf, 1.8);
    scene.add(pl.root);
    prog(0.5 + (0.5 * (i + 1)) / (N_PLAYERS + N_COACHES), 'Getting players ready');
    await new Promise(r => setTimeout(r, 0));
    if (i < N_PLAYERS) people.push(kitOut(pl, scene, arena));
    else coaches.push(pl);
  }
  return { renderer, gl, scene, fx, people, coaches, ...arena };
}

/** A player figure's extras: aura, zone / buff floor rings, hand and eye light trails, eyes on the ball. */
function kitOut(pl, scene, arena) {
  pl.aura = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: arena.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })
  );
  pl.aura.scale.set(2.2, 2.6, 1);
  scene.add(pl.aura);
  pl.zone = arena.flatRing(arena.ringTex, 1.5);
  pl.buff = arena.flatRing(arena.dashTex, 1.7);
  pl.buff.material.color.set('#ffd84d');
  pl.trails = [makeTrail(scene), makeTrail(scene)]; // left / right hand light trails (stars and OP players)
  pl.eyeTrails = [makeTrail(scene, 44), makeTrail(scene, 44)]; // Kuroko-style eye streaks (in the zone / captain's buff)
  pl.vrm.lookAt && (pl.vrm.lookAt.target = arena.ball);
  return pl;
}
/** Figures per extra model (a match can show up to this many players with it). */
const EXTRA_FIGS = 4;
/**
 * Add another player model (a .vrm the player loaded from their own disk — never uploaded): EXTRA_FIGS figures of it
 * join the pool, and dressActors gives it to some players at random (stable per player). Re-dresses a bound match.
 */
async function addModel(buf, name) {
  const w = world || (building && (await building, world));
  if (!w) throw new Error('3D not ready');
  const figs = [];
  for (let i = 0; i < EXTRA_FIGS; i++) {
    const pl = await makeVRM(buf, 1.8);
    pl.model = name;
    pl.root.visible = false;
    w.scene.add(pl.root);
    figs.push(kitOut(pl, w.scene, w));
    await new Promise(r => setTimeout(r, 0));
  }
  w.people.push(...figs);
  w.models = [...(w.models || []), name];
  if (bound) dressActors(w);
  return name;
}

// ---------- per match ----------
let bound = null,
  lastT = performance.now();
/** Attach the world to the current match screen (#stage / #cv) and dress it for A's teams. */
function bind() {
  const w = world,
    stage = document.getElementById('stage'),
    cv2 = document.getElementById('cv');
  stage.insertBefore(w.gl, cv2);
  dressArena(w, A.m.t[0].color, A.m.t[1].color);
  dressActors(w);
  bound = A;
  lastT = performance.now();
}
function unbind() {
  if (world && world.gl.parentNode) world.gl.remove();
  bound = null;
}

// ---------- per frame ----------
/**
 * 3D resolution = the court canvas size, capped to the quality's pixel budget (GFX[G.gfx].px3d), × a dynamic factor
 * `res`: under ~45 fps it steps down (never below the quality's floor); with headroom it steps back up to 1.
 */
const dyn = { res: 1, ema: 16.7, t: 0 };
function adaptRes(ms) {
  const Q = GFX[G.gfx] || GFX.auto;
  dyn.ema += (Math.min(100, ms) - dyn.ema) * 0.05;
  dyn.t += ms;
  if (dyn.res < Q.floor) dyn.res = Q.floor;
  if (dyn.t < 1000) return;
  dyn.t = 0;
  if (dyn.ema > 22 && dyn.res > Q.floor) dyn.res = Math.max(Q.floor, +(dyn.res - 0.05).toFixed(2));
  else if (dyn.ema < 15 && dyn.res < 1) dyn.res = Math.min(1, +(dyn.res + 0.05).toFixed(2));
}
function syncSize() {
  // the WebGL canvas sits exactly under the 2D canvas, at its pixel size × the dynamic resolution
  const gl = world.gl,
    w = cv.width,
    h = cv.height,
    Q = GFX[G.gfx] || GFX.auto,
    scale = Math.min(1, Math.sqrt(Q.px3d / Math.max(1, w * h))) * dyn.res;
  if (gl.width !== Math.round(w * scale) || gl.height !== Math.round(h * scale))
    world.renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
  const s = gl.style;
  s.left = cv.offsetLeft + 'px';
  s.top = cv.offsetTop + 'px';
  s.width = cv.offsetWidth + 'px';
  s.height = cv.offsetHeight + 'px';
}

function draw() {
  if (!world || !A) return;
  if (bound !== A || !world.gl.isConnected) bind();
  const now = performance.now(),
    dt = Math.min(0.05, (now - lastT) / 1000) * (A.paused ? 0 : 1) || 1e-4;
  if (!document.hidden) adaptRes(now - lastT);
  lastT = now;
  syncSize();
  updateBase(dt || 0.016);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (A.ball.follow) followBall(); // also shows the ball once the server starts the routine
  const V = applyView(); // same shake / push-in / zoom as the playback layer; also sets the overlay transform
  viewCamera(V);
  const w = world,
    B = A.ball;
  updateBall(w, now);
  handTouch(w, now);
  // bodies, hair springs and trails run on the world clock (A.ts): in slow motion everything slows together
  const wdt = dt * Math.max(0.02, Math.min(1, A.ts ?? 1));
  if (!A.qaFreeze) for (const pl of w.people) if (pl.d) posePlayer(pl, pl.d.p.id === A.digHero ? dt : wdt, w.ball.position, w.fx); // qaFreeze: test hook; a digger chasing a far ball poses at normal speed
  for (const pl of w.coaches) if (pl.c) poseCoach(pl, dt, now);
  updateCrowd(w, now);
  updateNet(w, now);
  updatePointFlash(w);
  // effects run on the world clock, except in a scene close-up: there they fade out at full speed so a frozen world
  // doesn't pile lightning and sparks in front of the camera
  w.fx.update(A.shot ? dt * 1.5 : dt * Math.max(A.freezeOn ? 0.15 : 0.02, Math.min(1, A.ts ?? 1)), cam, w.gl.height, base.fov);
  w.renderer.render(w.scene, cam);
  // overlay: the playback layer's screen-space pieces, now projected through this camera
  drawChant(now);
  drawFloorFx();
  if (B.vis && !A.trailEl) drawTrail(ballScreen());
  for (const pl of w.people) {
    const d = pl.d;
    if (!d) continue;
    const pr = P(d.x, d.z, d.jy);
    if (!A.shot) drawTags(d, pr, Math.min(1.7, pr.s * FIG * (d.p.look ? d.p.look.hgt : 1)), (A.staShown || {})[d.p.id]); // capped: close-up shots
  }
  for (const pl of w.coaches) {
    if (!pl.c) continue;
    const pr = P(sx(pl.c.side, 115), -0.035, 0);
    drawCoachTags(pl.c, pr, pr.s * FIG * 1.02);
  }
  drawFx(now);
}

const hL = new THREE.Vector3(),
  hR = new THREE.Vector3();
/** Fade (ms) of the ball leaving a hand back onto its own flight path. */
const HAND_REL_MS = 140;
/**
 * A ball sent to a player's hands (A.handTouch { p, c }, set by playback): as it arrives it is drawn right against
 * the real hand(s) — a block between both palms, a spike or serve at the hitting (right) hand, a little in front of
 * it toward the net — so contacts visibly meet the hand. Uses last frame's pose.
 */
function handTouch(w, now) {
  const rel = !A.handTouch && A.handLast ? 1 - (now - (A.handRel || 0)) / HAND_REL_MS : 1,
    t = A.handTouch || (rel > 0 ? A.handLast : null);
  if (!t || !w.ball.visible) return;
  const pl = w.people.find(q => q.d && q.d.p.id === t.p);
  if (!pl) return;
  const fw = pl.d.side === 0 ? 1 : -1;
  if (t.c === 'block') {
    pl.bone('leftHand').getWorldPosition(hL);
    pl.bone('rightHand').getWorldPosition(hR);
    hL.add(hR).multiplyScalar(0.5);
    hL.x += fw * 0.2; // in front of the palms, toward the hitter
    hL.y += 0.05;
  } else {
    pl.bone('rightHand').getWorldPosition(hL);
    hL.x += fw * 0.12; // against the palm, on the net side
    hL.y += 0.06;
  }
  // pulled in over the last 35% of its flight, fully at the contact and while it rests there (a stuff's pause)
  const cur = A.beats && A.beats[A.bi],
    fl = A.handTouch && t.b === cur && cur ? Math.min(1, (A.el || 0) / Math.max(1, cur.dur)) : 1,
    u = Math.max(0, Math.min(1, (fl - 0.65) / 0.35)) * Math.max(0, rel),
    k = u * u * (3 - 2 * u);
  if (k <= 0) return;
  w.ball.position.lerp(hL, k);
  w.ballGlow.position.copy(w.ball.position);
  w.ballLight.position.copy(w.ball.position);
}
/** Effect entry points for render/effects.js: anchored at the ball (or the floor under it). */
const ballW = () => (A && A.ball ? W(A.ball.x, A.ball.z, Math.max(10, A.ball.h)) : new THREE.Vector3());
const fxApi = {
  burst: (pow, color) => world && world.fx.burst(ballW(), pow, color),
  elemBurst: (el, pow) => world && world.fx.elemBurst(el, ballW(), pow, A.ball.h > 60 ? ballDir.clone() : null),
  impact: pow => world && world.fx.impact(ballW(), pow),
  elemImpact: (el, pow) => world && world.fx.elemImpact(el, ballW(), pow),
  trail: (el, pow, dt) => world && world.fx.trail(el, ballW(), ballDir.clone(), pow, dt),
  zap: pow => world && world.fx.zap(ballW(), pow),
  skyBolt: w => world && world.fx.skyBolt(W(A.ball.x, A.ball.z, 0), w)
};
export const api = {
  draw,
  fx: fxApi,
  P3D,
  bind,
  unbind,
  setCamMode,
  camMode: getCamMode,
  debugCam: setDebugCam,
  fxAge: dt => world && world.fx.update(dt, cam, world.gl.height, base.fov), // test hook: age effects while fast-forwarding
  get res() {
    return world ? +(world.gl.width / Math.max(1, cv.width)).toFixed(2) : null; // 3D render scale vs the court canvas (debug)
  },
  addModel,
  models: () => (world && world.models) || [],
  poseAll: dt => world && world.people.forEach(pl => pl.d && posePlayer(pl, dt, W(A.ball.x, A.ball.z, A.ball.h), world.fx)), // test hook: fast-forward posing
  get ballPos() {
    return world ? world.ball.position : null; // the drawn ball (test hook)
  },
  get people() {
    return world ? world.people : [];
  }
};
