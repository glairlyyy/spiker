// VFX lab (dev, T-238): every 3D effect of fx3d.mjs on an empty floor — fire one, repeat it, slow time, stress it and read
// the cost (frame ms, draw calls, live particles). Its own renderer and loop, like the title backdrop; it stops by itself
// when its element leaves the page. mountLab(el) / unmountLab() / labPlay(name, o) / labSet(o) / labStats().
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createFx } from './fx3d.mjs';
import { makeTrail } from './trails3d.mjs';

let L = null; // { renderer, scene, camera, ctl, fx, el, raf, last, o, acc, auto, stress, ms, frames, fps, t0, ball }

/** A dark tiled floor (the lab's stage): canvas checker, in memory. */
function floorTex() {
  const c = document.createElement('canvas'),
    n = 512,
    g = c.getContext('2d');
  c.width = c.height = n;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#1c2233' : '#4a5470';
      g.fillRect(x * 64, y * 64, 64, 64);
    }
  g.strokeStyle = 'rgba(0,0,0,.35)';
  for (let i = 0; i <= 8; i++) {
    g.beginPath();
    g.moveTo(i * 64, 0);
    g.lineTo(i * 64, n);
    g.moveTo(0, i * 64);
    g.lineTo(n, i * 64);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Mount the lab canvas into `el`. */
export function mountLab(el) {
  unmountLab();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    DBG.log('warn', 'VFX lab: WebGL is not available', e);
    return false;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene(),
    bg = '#0e1424';
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 14, 40);
  scene.add(new THREE.HemisphereLight('#9fb4ff', '#1a1420', 1.1));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(4, 10, 6);
  scene.add(sun);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 48),
    new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.35, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  // a stand-in ball for the trail effects
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 20, 14),
    new THREE.MeshStandardMaterial({ color: '#ffe680', emissive: '#553300' })
  );
  ball.visible = false;
  scene.add(ball);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 3.2, 9);
  const ctl = new OrbitControls(camera, renderer.domElement);
  ctl.target.set(0, 1.4, 0);
  ctl.enableDamping = true;
  ctl.update();
  const cv = renderer.domElement;
  cv.className = 'vlab3d';
  el.appendChild(cv);
  L = {
    renderer,
    scene,
    camera,
    ctl,
    el,
    ball,
    fx: createFx(scene),
    hand: makeTrail(scene, 48),
    ballTrail: makeTrail(scene, 40),
    swing: null, // a weapon sweep in flight: { t }
    raf: 0,
    last: performance.now(),
    o: { name: 'blast', pow: 110, el: 'fire', speed: 1, auto: false, stress: 0 },
    acc: 0,
    autoT: 0,
    run: null, // a trail in flight: { t, dur, a, b, el, pow }
    ms: 0,
    fxMs: 0,
    frames: 0,
    fps: 0,
    t0: performance.now(),
    info: {}
  };
  const size = () => {
    const r = el.getBoundingClientRect(),
      w = Math.max(1, r.width),
      h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  size();
  L.ro = new ResizeObserver(size);
  L.ro.observe(el);
  const draw = now => {
    if (!L) return;
    if (!L.el.isConnected) return unmountLab(); // the lab screen went away
    const t0 = performance.now(),
      real = Math.min(0.05, (now - L.last) / 1000),
      dt = real * L.o.speed;
    L.last = now;
    // repeat and stress: re-fire on a timer (time-scaled, so a slow-motion repeat waits for the slow effect)
    if (L.o.auto && (L.autoT += dt) > 1.6) {
      L.autoT = 0;
      play(L.o.name);
    }
    if (L.o.stress) {
      L.acc += dt * L.o.stress;
      for (; L.acc >= 1; L.acc--) play(L.o.name, true);
    }
    if (L.run) flyBall(dt);
    ballTrail(dt);
    sweep(dt);
    ctl.update();
    const f0 = performance.now();
    L.fx.update(dt, camera, renderer.domElement.height, camera.fov);
    L.fxMs += performance.now() - f0;
    renderer.render(scene, camera);
    L.info = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    L.ms += performance.now() - t0;
    L.frames++;
    L.raf = requestAnimationFrame(draw);
  };
  L.raf = requestAnimationFrame(draw);
  return true;
}

/** A trail run: the stand-in ball flies an arc and the element trail follows it. */
function flyBall(dt) {
  const r = L.run;
  r.t += dt;
  const u = Math.min(1, r.t / r.dur),
    p = new THREE.Vector3().lerpVectors(r.a, r.b, u);
  p.y += Math.sin(u * Math.PI) * r.h;
  const dir = p.clone().sub(L.ball.position);
  L.ball.position.copy(p);
  L.ball.visible = true;
  if (r.el && dir.lengthSq() > 1e-8) L.fx.trail(r.el, p, dir.normalize(), r.pow, dt);
  if (u >= 1) {
    L.ball.visible = false;
    L.run = null;
    if (r.land) {
      L.fx.elemImpact(r.el, p, r.pow);
      if (r.pow >= 100) L.fx.blast(p, r.pow, (typeof ECOL !== 'undefined' && ECOL[r.el]) || '#ff7a2e');
    }
  }
}

/**
 * The ball's ribbon (VFX ball style): Ribbon or Ink as in a match; Streak (the match's 2D line) shows as a plain ribbon here.
 */
function ballTrail(dt) {
  const V = typeof VFX !== 'undefined' ? VFX.ball : { style: 'ribbon', min: 0, width: 1, life: 1, ink: '#ff1630' },
    r = L.run;
  if (V.style === 'off' || (r && r.pow < V.min)) return L.ballTrail.update(L.ball.position, 1e-4, L.camera, { width: 0 });
  // landed: the ribbon stays where the ball stopped and fades out (it dims when its point is still)
  if (!r) return L.btO && L.ballTrail.update(L.ball.position, Math.max(dt, 1e-4), L.camera, L.btO);
  const ink = V.style === 'ink',
    col = r.el ? ECOL[r.el] : ink ? V.ink : r.pow >= 100 ? '#ff3d7f' : r.pow >= 80 ? '#ffb13d' : '#9fe8ff';
  L.ballTrail.update(
    L.ball.position,
    Math.max(dt, 1e-4),
    L.camera,
    (L.btO = {
      width: (0.06 + r.pow / 900) * (ink ? 1.5 : 1) * V.width,
      life: (0.12 + r.pow / 1000) * V.life,
      alpha: 0.9,
      color: col,
      style: ink ? 'ink' : '',
      jump: 6
    })
  );
}

/** The hand of a weapon sweep: a wide slash, a beat, the back-swing (0.95 s); the hand trail follows it, then fades. */
const SWEEP = { r: 1.7, c: new THREE.Vector3(0, 1.3, 0), dur: 0.95 };
function sweep(dt) {
  const s = L.swing,
    ease = u => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
  let p;
  if (s) {
    s.t += dt;
    const t = s.t,
      a = t < 0.35 ? -2.4 + 3.6 * ease(t / 0.35) : t < 0.5 ? 1.2 : 1.2 - 3.2 * ease((t - 0.5) / 0.3),
      tilt = t < 0.5 ? 0.35 : -0.25;
    p = new THREE.Vector3(Math.cos(a) * SWEEP.r, Math.sin(a) * SWEEP.r * tilt, Math.sin(a) * SWEEP.r * 0.6).add(SWEEP.c);
    L.handAt = p;
    if (t > SWEEP.dur) L.swing = null;
  } else p = L.handAt || SWEEP.c;
  const H = typeof VFX !== 'undefined' ? VFX.hand : { style: 'ink', width: 1, life: 1, ink: '#ff1630' },
    ink = H.style === 'ink',
    col = ink ? H.ink : (typeof ECOL !== 'undefined' && ECOL[L.o.el]) || '#ffffff';
  L.hand.update(p, Math.max(dt, 1e-4), L.camera, {
    width: 0.12 * (ink ? 1.7 : 1) * Math.max(0.5, L.o.pow / 100) * H.width,
    life: 0.34 * (ink ? 1.4 : 1) * H.life,
    alpha: 0.85,
    color: col,
    style: ink ? 'ink' : ''
  });
}

const RAND = s => (Math.random() * 2 - 1) * s;
/** Fire one effect. `stray`: at a random spot (stress), else at the centre. */
function play(name, stray) {
  const o = L.o,
    fx = L.fx,
    col = (typeof ECOL !== 'undefined' && ECOL[o.el]) || '#ff7a2e',
    at = (y = 0) => new THREE.Vector3(stray ? RAND(5) : 0, y, stray ? RAND(3) : 0),
    shot = new THREE.Vector3(-1, -0.45, 0).normalize();
  switch (name) {
    case 'blast':
      return fx.blast(at(), o.pow, col);
    case 'airImpact':
      return fx.airImpact(at(2.8), shot, o.pow, col);
    case 'airRev':
      return fx.airImpact(at(2.8), shot, o.pow, col, true); // classic
    case 'burst':
      return fx.burst(at(2.2), o.pow, col);
    case 'elemBurst':
      return fx.elemBurst(o.el, at(2.2), o.pow, shot);
    case 'impact':
      return fx.impact(at(), o.pow);
    case 'elemImpact':
      return fx.elemImpact(o.el, at(), o.pow);
    case 'trail':
    case 'ballPlain':
    case 'spike': {
      const a = at(name === 'spike' ? 3 : 1),
        b = a.clone().add(new THREE.Vector3(name === 'spike' ? -5.5 : -7, name === 'spike' ? -3 : 0, 0));
      a.x += 3;
      b.x += 3;
      if (name === 'spike') fx.airImpact(a, b.clone().sub(a).normalize(), o.pow, col);
      L.run = {
        t: 0,
        dur: name === 'spike' ? 0.45 : 1.2,
        a,
        b,
        h: name === 'spike' ? 0 : 1.5,
        el: name === 'ballPlain' ? null : o.el,
        pow: o.pow,
        land: name === 'spike'
      };
      return;
    }
    case 'sweep':
      L.swing = { t: 0 };
      return;
    case 'found': {
      // every player's foundation set, left to right: landing dust, a dive skid, a bump, a set, a save, a tired breath
      const F = typeof VFX !== 'undefined' ? VFX.found : { jump: 1, dive: 1, breath: 1 };
      fx.dust(new THREE.Vector3(-4, 0, 0), 1.1 * F.jump);
      for (let i = 0; i < 8; i++) fx.skid(new THREE.Vector3(-2.6 + i * 0.12, 0, 0.4), new THREE.Vector3(1, 0, 0), F.dive);
      fx.touch('bump', new THREE.Vector3(-0.8, 1, 0), false);
      fx.touch('set', new THREE.Vector3(0.8, 2.6, 0), false);
      fx.touch('dive', new THREE.Vector3(2.4, 0.3, 0), true);
      fx.breath(new THREE.Vector3(4, 1.6, 0), new THREE.Vector3(-1, 0, 0), F.breath);
      return;
    }
    case 'zap':
      return fx.zap(at(2), o.pow);
    case 'skyBolt':
      return fx.skyBolt(at());
  }
}

/** Advance the effects by `sec` of game time in 1/60 s steps (QA: exact timing on a slow GPU). */
export function labAdvance(sec) {
  if (!L) return;
  for (let t = 0; t < sec; t += 1 / 60) {
    if (L.run) flyBall(1 / 60);
    ballTrail(1 / 60);
    sweep(1 / 60);
    L.fx.update(1 / 60, L.camera, L.renderer.domElement.height, L.camera.fov);
  }
}
/** Fire an effect now (and remember it for repeat / stress). */
export function labPlay(name) {
  if (!L) return;
  L.o.name = name;
  play(name);
}
/** Change the lab's options: { pow, el, speed, auto, stress, trail }. */
export function labSet(o) {
  if (L) Object.assign(L.o, o);
}
/** The readout since the last call: fps, frame and fx ms, draw calls, triangles, live particles. */
export function labStats() {
  if (!L) return null;
  const now = performance.now(),
    s = (now - L.t0) / 1000,
    n = Math.max(1, L.frames),
    out = { fps: L.frames / Math.max(0.001, s), ms: L.ms / n, fxMs: L.fxMs / n, ...L.info, ...L.fx.stats() };
  L.t0 = now;
  L.frames = 0;
  L.ms = L.fxMs = 0;
  return out;
}

/** Stop the loop and free the GPU. */
export function unmountLab() {
  if (!L) return;
  cancelAnimationFrame(L.raf);
  L.ro.disconnect();
  L.ctl.dispose();
  L.scene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
      m.dispose();
    }
  });
  L.renderer.dispose();
  L.renderer.forceContextLoss();
  L.renderer.domElement.remove();
  L = null;
}
