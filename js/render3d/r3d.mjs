// Spite & Spike 3D renderer. It draws the match state that render/playback.js simulates (A.disp, A.ball, A.cam,
// A.zoom…) with VRM anime players in a three.js arena; engine, beats, timing, UI and sound are untouched.
// While a match is bound, P() (court → screen) projects through this camera, so every screen-space effect, label
// and camera push-in the playback layer creates lines up with the 3D scene; those are drawn on the transparent 2D
// canvas on top. The world (renderer, arena, 10 dressed VRMs) is built once and re-dressed for every match.
//   units3d  court units → metres, textures      arena3d   court, net, stands, crowd, ball
//   camera3d game camera, scene shots, P3D       actors3d  posing players and coaches, trails, auras, rings
//   players3d VRM load / dress / pose apply      poses3d   pose library      fx3d / trails3d  effects
import * as THREE from 'three';
import { loadBase, makeVRM, modelStats, updateVrm, MODEL_URL, MAIN_URL, BUNDLED } from './players3d.mjs';
import { createFx } from './fx3d.mjs';
import { makeTrail } from './trails3d.mjs';
import { W, lowEnd } from './units3d.mjs';
import { buildArena, dressArena, updateBall, updateBallShadow, updateNet, updatePointFlash, ballDir } from './arena3d.mjs';
import { buildVenues, dressVenue, updateVenue } from './venue3d.mjs';
import {
  base,
  cam,
  updateBase,
  viewCamera,
  P3D,
  setCameraWorld,
  setCamMode,
  getCamMode,
  setBirdSide,
  birdW,
  setFollow,
  getFollow,
  povHidden,
  getPovStats,
  setDebugCam,
  setAspect
} from './camera3d.mjs';
import { posePlayer, poseCoach, dressActors, swapActor, setPovHidden, setKeepColors } from './actors3d.mjs';

const TAG_DROP = 30; // bird's-eye: how far (figure units) the tags come down toward the figure (seen from 45°, a body looks shorter)
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
  const buf = await loadBase(MODEL_URL, f => prog(f * 0.3, 'Downloading players'));
  const people = [],
    coaches = [];
  for (let i = 0; i < N_PLAYERS + N_COACHES; i++) {
    const pl = await makeVRM(buf, 1.8);
    scene.add(pl.root);
    prog(0.5 + (0.5 * (i + 1)) / (N_PLAYERS + N_COACHES), 'Getting players ready');
    await new Promise(r => setTimeout(r, 0));
    if (i === 0) DBG.log('info', `Model base: ${modelStats(pl)}`);
    if (i < N_PLAYERS) people.push(kitOut(pl, scene, arena));
    else coaches.push(pl);
  }
  // your own player in career matches: Main_v2 (one figure, kept as modelled; a failed load just leaves the base model)
  try {
    const mb = await loadBase(MAIN_URL, f => prog(0.3 + f * 0.2, 'Downloading players')),
      pl = await makeVRM(mb, 1.8);
    pl.model = 'main';
    DBG.log('info', `Model main: ${modelStats(pl)}`);
    pl.own = true;
    pl.root.visible = false;
    scene.add(pl.root);
    people.push(kitOut(pl, scene, arena));
  } catch (e) {
    DBG.log('warn', 'Main model could not be loaded', e);
  }
  const w = { renderer, gl, scene, fx, people, coaches, ...arena, ballTrail: makeTrail(scene, 40) }; // ballTrail: VFX ball style ribbon / ink
  buildVenues(scene, w); // venue sets, cut-out crowd, officials, big screen, confetti (spec §9.11)
  return w;
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
const EXTRA_FIGS = 8;
/**
 * Add another player model (a .vrm the player loaded from their own disk — never uploaded): EXTRA_FIGS figures of it
 * join the pool (enough for every player on court), and dressActors spreads players evenly over all models at random
 * (stable per player). Re-dresses a match on screen.
 */
async function addModel(buf, name, n = EXTRA_FIGS) {
  const w = world || (building && (await building, world));
  if (!w) throw new Error('3D not ready');
  const figs = [];
  for (let i = 0; i < n; i++) {
    const pl = await makeVRM(buf, 1.8);
    pl.model = name;
    if (!i) DBG.log('info', `Model ${name}: ${modelStats(pl)}`);
    pl.root.visible = false;
    w.scene.add(pl.root);
    figs.push(kitOut(pl, w.scene, w));
    await new Promise(r => setTimeout(r, 0));
  }
  w.people.push(...figs);
  w.models = [...(w.models || []), name];
  if (bound && A && bound === A) dressActors(w); // a match on screen now: re-dress it (from the menu there is none)
  return name;
}

/** Figures per bundled model: 6 models × 4 cover the 8 players on court (dressActors falls back to another bundled model). */
const BUNDLED_FIGS = 4;
let bundledP = null;
/**
 * The owner's models (players3d BUNDLED): downloaded and added once, on the first Monster game (onProgress 0..1). Every
 * Monster player then picks one of them at random (dressActors). A model that fails to load is skipped (logged).
 */
function loadBundled(onProgress) {
  if (!bundledP)
    bundledP = (async () => {
      const w = world || (building && (await building, world));
      if (!w) throw new Error('3D not ready');
      w.bundled = w.bundled || [];
      for (let k = 0; k < BUNDLED.length; k++) {
        const { name, url } = BUNDLED[k];
        try {
          const buf = await loadBase(url, f => onProgress && onProgress((k + f * 0.7) / BUNDLED.length, 'Downloading players'));
          onProgress && onProgress((k + 0.7) / BUNDLED.length, 'Getting players ready');
          await addModel(buf, name, BUNDLED_FIGS);
          w.bundled.push(name);
        } catch (e) {
          DBG.log('warn', `Model ${name} could not be loaded`, e);
        }
      }
      onProgress && onProgress(1, 'Ready');
      return w.bundled;
    })().catch(e => {
      bundledP = null;
      throw e;
    });
  return bundledP;
}

/**
 * Benchmark each model on its own (menu only, no match on screen): up to 8 figures of it in a row, a fixed camera, `frames`
 * timed renders (shadow pass included, GPU-synced) and spring-bone updates, minus an empty-arena baseline. Logs one line per
 * model to the debug log and returns the rows: draws / triangles added, render ms and spring-bone update ms per frame.
 */
async function bench(frames = 40) {
  const w = world || (building && (await building, world));
  if (!w) throw new Error('3D not ready');
  if (bound) throw new Error('leave the match first');
  const r = w.renderer,
    gl = r.getContext(),
    cam2 = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100),
    all = [...w.people, ...w.coaches],
    saved = all.map(pl => [pl.root.visible, pl.root.position.clone()]),
    groups = new Map();
  cam2.position.set(0, 1.6, 9);
  cam2.lookAt(0, 1, 0);
  for (const pl of w.people) {
    const k = pl.model || 'base';
    if (!groups.has(k)) groups.set(k, []);
    if (groups.get(k).length < 8) groups.get(k).push(pl);
  }
  const run = (figs, n) => {
    all.forEach(pl => (pl.root.visible = false));
    figs.forEach((pl, i) => {
      pl.root.visible = true;
      pl.root.position.set((i - (figs.length - 1) / 2) * 1.2, 0, 0);
      pl.root.updateMatrixWorld(true);
    });
    let upd = 0,
      ren = 0,
      calls = 0,
      tris = 0;
    for (let f = 0; f < n; f++) {
      const t0 = performance.now();
      figs.forEach(pl => updateVrm(pl, 0.016));
      const t1 = performance.now();
      r.info.reset();
      r.render(w.scene, cam2);
      gl.finish();
      const t2 = performance.now();
      upd += t1 - t0;
      ren += t2 - t1;
      calls = r.info.render.calls;
      tris = r.info.render.triangles;
    }
    return { upd: upd / n, ren: ren / n, calls, tris };
  };
  const rows = [];
  try {
    run([], 3);
    const b0 = run([], frames);
    for (const [model, figs] of groups) {
      run(figs, 3); // warm-up: shader compile, first upload
      const s = run(figs, frames),
        row = {
          model,
          figs: figs.length,
          draws: s.calls - b0.calls,
          tris: s.tris - b0.tris,
          renderMs: +Math.max(0, s.ren - b0.ren).toFixed(2),
          springMs: +s.upd.toFixed(2)
        };
      rows.push(row);
      DBG.log(
        'info',
        `Bench ${model} ×${row.figs}: +${row.draws} draws, +${row.tris} tris, render +${row.renderMs} ms, springs ${row.springMs} ms per frame (${(
          (row.renderMs + row.springMs) /
          row.figs
        ).toFixed(2)} ms per figure)`
      );
    }
  } finally {
    all.forEach((pl, i) => {
      pl.root.visible = saved[i][0];
      pl.root.position.copy(saved[i][1]);
    });
  }
  return rows;
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
  dressVenue(w, A.venue || 'arena', A.stakes ?? 0.9, A.m.t[0].color, A.m.t[1].color);
  dressActors(w);
  bound = A;
  lastT = performance.now();
}
function unbind() {
  if (world) setPovHidden(world, null); // no head stays hidden after a POV match
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
  setAspect(w / Math.max(1, h)); // the full-court screen (spec §9.9): the camera follows the canvas's shape
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
  const hideTop = birdW() > 0.3; // bird's-eye: the roof trusses would cross the court
  if (world.hideTop !== hideTop) {
    world.hideTop = hideTop;
    world.scene.traverse(o => o.userData.overhead && (o.visible = !hideTop));
  }
  updateBase(dt || 0.016);
  setPovHidden(world, povHidden()); // POV: your own head is hidden while the camera is at your eyes
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (A.ball.follow) followBall(); // also shows the ball once the server starts the routine
  const V = Overlay.applyView(); // same shake / push-in / zoom as the playback layer; also sets the overlay transform
  viewCamera(V);
  const w = world,
    B = A.ball;
  updateBall(w, now);
  handTouch(w, now);
  updateBallShadow(w); // after handTouch: it moves the ball
  // bodies, hair springs and trails run on the world clock (A.ts): in slow motion everything slows together
  const wdt = dt * Math.max(0.02, Math.min(1, A.ts ?? 1));
  if (!A.qaFreeze) for (const pl of w.people) if (pl.d) posePlayer(pl, pl.d.p.id === A.digHero ? dt : wdt, w.ball.position, w.fx); // qaFreeze: test hook; a digger chasing a far ball poses at normal speed
  for (const pl of w.coaches) if (pl.c) poseCoach(pl, dt, now);
  ballRibbon(w, wdt);
  updateVenue(w, now, dt * 1000, cam);
  updateNet(w, now);
  updatePointFlash(w);
  // effects run on the world clock, except in a scene close-up: there they fade out at full speed so a frozen world
  // doesn't pile lightning and sparks in front of the camera
  w.fx.update(A.shot ? dt * 1.5 : dt * Math.max(A.freezeOn ? 0.15 : 0.02, Math.min(1, A.ts ?? 1)), cam, w.gl.height, base.fov);
  w.renderer.render(w.scene, cam);
  // overlay: the playback layer's screen-space pieces, now projected through this camera
  Overlay.drawChant(now);
  if (B.vis && !A.trailEl) Overlay.drawTrail(ballScreen());
  for (const pl of w.people) {
    const d = pl.d;
    if (!d) continue;
    const pr = P(d.x, d.z, d.jy),
      k = Math.min(1.7, pr.s * FIG);
    pr.Y += TAG_DROP * k * birdW(); // bird's-eye: a figure seen from above looks shorter, so its tag comes down to just over its head
    if (!A.shot) drawTags(d, pr, k, (A.staShown || {})[d.p.id]); // capped: close-up shots
  }
  for (const pl of w.coaches) {
    if (!pl.c) continue;
    const pr = P(sx(pl.c.side, 115), -0.035, 0);
    pr.Y += TAG_DROP * pr.s * FIG * 1.02 * birdW();
    drawCoachTags(pl.c, pr, pr.s * FIG * 1.02);
  }
  Overlay.drawFx(now);
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
    if (t.hz) {
      // the engine's pick (hz: the court-z side the ball crosses on): the hand on that side; world z = (0.5 − z) × KZ
      if ((hR.z - hL.z) * -t.hz > 0) hL.copy(hR);
      hL.x += fw * 0.14; // against that palm, toward the hitter
    } else {
      hL.add(hR).multiplyScalar(0.5);
      hL.x += fw * 0.2; // in front of the palms, toward the hitter
    }
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
/**
 * The ball's 3D trail (VFX ball style Ribbon or Ink; Streak is the 2D overlay line): a ribbon behind a powered ball in the
 * overlay's colours (OP yellow, the element's, pink 100+, orange 80+, cyan), Ink = the black stroke burning that colour
 * (VFX.ball.ink with no element). Width and length scale with power and the VFX sliders.
 */
function ballRibbon(w, dt) {
  const V = VFX.ball,
    st = Dir.ballStyle(), // the director's style for the play (spec §2.15)
    on = (st === 'ribbon' || st === 'ink') && A.ball.vis && A.trailPow >= Math.max(1, V.min) && (A.mv ?? 1) > 0.05;
  if (!on) return w.ballTrail.update(w.ball.position, dt, cam, { width: 0 });
  const Pw = A.trailPow,
    ink = st === 'ink',
    col = A.trailOp ? '#fff27a' : A.trailEl ? ECOL[A.trailEl] : ink ? V.ink : Pw >= 100 ? '#ff3d7f' : Pw >= 80 ? '#ffb13d' : '#9fe8ff';
  w.ballTrail.update(w.ball.position, dt, cam, {
    width: (0.06 + Pw / 900) * (ink ? 1.5 : 1) * V.width,
    life: (0.12 + Pw / 1000) * V.life,
    alpha: 0.9,
    color: col,
    style: ink ? 'ink' : '',
    jump: 6
  });
}
/** Effect entry points for render/effects.js: anchored at the ball (or the floor under it). */
const ballW = () => (A && A.ball ? W(A.ball.x, A.ball.z, Math.max(10, A.ball.h)) : new THREE.Vector3());
const fxApi = {
  burst: (pow, color) => world && world.fx.burst(ballW(), pow, color),
  /**
   * path: the ball's flight { f, t (court points), sec, lag (s) } — the rings follow it from the hitter's hand, each appearing
   * as the ball passes; or ±1 (court x): just down into the far court.
   */
  airImpact: (pow, color, path) => {
    if (!world) return;
    if (typeof path === 'number') return world.fx.airImpact(ballW(), new THREE.Vector3(path, -0.55, 0).normalize(), pow, color);
    const f0 = W(path.f.x, path.f.z, Math.max(10, path.f.h)),
      from = world.ball.visible && world.ball.position.distanceTo(f0) < 1.5 ? world.ball.position.clone() : f0, // at the hand when drawn there
      d = W(path.t.x, path.t.z, path.t.h).sub(from),
      len = d.length();
    if (len < 1e-3) return world.fx.airImpact(from, new THREE.Vector3(1, -0.55, 0).normalize(), pow, color);
    const follow = typeof VFX !== 'undefined' ? VFX.air.follow : 0.5; // share of the flight the rings spread over (0: fixed reach)
    world.fx.airImpact(from, d.normalize(), pow, color, false, {
      speed: len / Math.max(0.05, path.sec),
      lag: path.lag,
      span: follow > 0 ? len * follow : 0
    });
  },
  elemBurst: (el, pow) => world && world.fx.elemBurst(el, ballW(), pow, A.ball.h > 60 ? ballDir.clone() : null),
  impact: pow => world && world.fx.impact(ballW(), pow),
  touch: (kind, save) => world && world.fx.touch(kind, ballW(), save),
  blast: (pow, color) => world && world.fx.blast(W(A.ball.x, A.ball.z, 0), pow, color || undefined),
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
  setBirdSide,
  camMode: getCamMode,
  setFollow,
  follow: getFollow,
  povStats: getPovStats,
  syncPov: () => world && setPovHidden(world, povHidden()), // test hook: apply the POV head hiding without a draw
  povHidden: () => povHidden(),
  debugCam: setDebugCam,
  fxAge: dt => world && world.fx.update(dt, cam, world.gl.height, base.fov), // test hook: age effects while fast-forwarding
  get res() {
    return world ? +(world.gl.width / Math.max(1, cv.width)).toFixed(2) : null; // 3D render scale vs the court canvas (debug)
  },
  addModel,
  loadBundled,
  bench,
  fxStats: () => world && world.fx.stats(), // live particle / mesh counts (director QA)
  /** Loaded models keep their own colours (re-dresses a match on screen). */
  keepColors: on => {
    setKeepColors(on);
    if (world && bound && A && bound === A) dressActors(world);
  },
  swapActor: (outId, d) => world && swapActor(world, outId, d), // a substitution: the figure of the player going off plays the incoming one
  models: () => (world && world.models) || [],
  poseAll: dt => world && world.people.forEach(pl => pl.d && posePlayer(pl, dt, W(A.ball.x, A.ball.z, A.ball.h), world.fx)), // test hook: fast-forward posing
  get ballPos() {
    return world ? world.ball.position : null; // the drawn ball (test hook)
  },
  get people() {
    return world ? world.people : [];
  }
};
