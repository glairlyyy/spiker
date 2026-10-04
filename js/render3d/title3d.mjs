// Title screen backdrop (spec §10.7a, T-177): the empty match arena slowly orbiting behind the menu. Its own small renderer
// and loop — no players, no ball, no VRM, never the match renderer. mountTitle3D(el) / unmountTitle3D(); a WebGL error
// leaves no canvas (the CSS glows stay). Reduced motion: one still frame.
import * as THREE from 'three';
import { buildArena, dressArena } from './arena3d.mjs';

/** Orbit: one turn per this many seconds round the net centre; radius and height in metres; where the court sits on screen. */
const ORBIT = { period: 90, r: 27, y: 11, look: new THREE.Vector3(0, 0.6, 0), shift: 0.22, fov: 40, dpr: 1.5 };
let T = null; // { renderer, scene, camera, raf, el, ro, t0, frames, ms }

const token = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

/** Mount the backdrop canvas into `el` (fades in once the first frame is drawn). Safe to call again: remounts. */
export function mountTitle3D(el) {
  unmountTitle3D();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) {
    DBG.log('warn', 'Title backdrop: WebGL is not available', e);
    return false;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, ORBIT.dpr));
  const scene = new THREE.Scene(),
    bg = token('--bg', '#07080b');
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 30, 70);
  const w = buildArena(scene);
  for (const o of [w.ball, w.ballGlow, w.ballShadow]) if (o) o.visible = false;
  if (w.ballLight) w.ballLight.intensity = 0;
  dressArena(w, token('--hot', '#ff3b4e'), token('--cyan', '#4cc9f0'));
  const camera = new THREE.PerspectiveCamera(ORBIT.fov, 1, 0.5, 200),
    cv = renderer.domElement;
  cv.className = 'tbg3d';
  cv.setAttribute('aria-hidden', 'true');
  el.appendChild(cv);
  T = { renderer, scene, camera, el, raf: 0, t0: performance.now(), frames: 0, ms: 0 };
  const size = () => {
    const r = el.getBoundingClientRect(),
      wd = Math.max(1, r.width),
      ht = Math.max(1, r.height);
    renderer.setSize(wd, ht, false);
    camera.aspect = wd / ht;
    // the court in the right 60 % of the screen: shift the view's centre left of the canvas centre
    camera.setViewOffset(wd, ht, -wd * ORBIT.shift, 0, wd, ht);
    camera.updateProjectionMatrix();
  };
  size();
  T.ro = new ResizeObserver(size);
  T.ro.observe(el);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw = now => {
    if (!T) return;
    if (!T.el.isConnected) return unmountTitle3D(); // the title went away without navigate(): stop anyway
    const t0 = performance.now(),
      a = Math.PI * 0.25 + (still ? 0 : (((now - T.t0) / 1000) * 2 * Math.PI) / ORBIT.period);
    camera.position.set(Math.cos(a) * ORBIT.r, ORBIT.y, Math.sin(a) * ORBIT.r);
    camera.lookAt(ORBIT.look);
    renderer.render(scene, camera);
    if (!T.frames++) cv.classList.add('on'); // fade in after the first frame
    T.ms += performance.now() - t0;
    if (T.frames === 120 && /[?&]dev\b/.test(location.search)) DBG.log('info', `Title backdrop: ${(T.ms / 120).toFixed(1)} ms per frame`);
    if (!still) T.raf = requestAnimationFrame(draw);
  };
  T.raf = requestAnimationFrame(draw);
  return true;
}

/** Stop the loop and free the GPU: called whenever the title screen is left (and before a remount). */
export function unmountTitle3D() {
  if (!T) return;
  cancelAnimationFrame(T.raf);
  T.ro.disconnect();
  T.scene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose();
      m.dispose();
    }
  });
  T.renderer.dispose();
  T.renderer.forceContextLoss();
  T.renderer.domElement.remove();
  T = null;
}

/** Is a backdrop mounted? (tests / QA) */
export const title3DOn = () => !!T;
