// Gloom lines (owner, 2026-10-20): the anime "tate-sen" over a debuffed player — purple vertical lines hanging from above
// the head, fading out toward the chest. Shown on a player whose side plays a war stage (Strained / Shaken / Broken, spec
// §4.34: m.weak), whose own morale has sunk (spec §2.31: m.mor), or whose HP is nearly gone (m.hp); the stronger of the
// three sets how dark. Straight or curvy lines (VFX.gloom.curvy). Display only: reads the match, writes nothing, draws no
// game randoms (the line pattern is drawn once from a fixed hash).
import * as THREE from 'three';
import { canvasTex } from '../units3d.mjs';
import { vx } from './kit.mjs';

const TEX = {};
/** A fixed pseudo-random in 0–1 for line i, salt s (no Math.random: the pattern is the same on every load). */
const h = (i, s) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** The line pattern: ~34 lines from the top edge, each fading to nothing at its own length; `curvy` sways them. */
function gloomTex(curvy) {
  const k = curvy ? 'c' : 's';
  if (TEX[k]) return TEX[k];
  TEX[k] = canvasTex(256, 512, (g, w, H) => {
    for (let i = 0; i < 34; i++) {
      const x = h(i, 1) * w,
        len = H * (0.35 + 0.65 * h(i, 2)),
        lw = 4 + 9 * h(i, 3) * h(i, 3), // thick enough to read at court distance (the sprite is ~60 px wide there)
        gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, `rgba(255,255,255,${0.55 + 0.45 * h(i, 4)})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = gr;
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(x, 0);
      if (curvy) {
        const amp = 4 + 10 * h(i, 5),
          ph = h(i, 6) * Math.PI * 2;
        for (let y = 8; y <= len; y += 8) g.lineTo(x + Math.sin(ph + y / 55) * amp * (y / len), y);
      } else g.lineTo(x, len);
      g.stroke();
    }
  });
  return TEX[k];
}
/** The gloom sprite for one player figure (added to the scene, invisible until a player is debuffed). */
export function makeGloom(scene) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: gloomTex(false), transparent: true, depthWrite: false, depthTest: false, opacity: 0, color: '#9a5cff' })
  );
  s.renderOrder = 5; // over the body it hangs on
  s.scale.set(1.3, 1.7, 1);
  s.visible = false;
  scene.add(s);
  return s;
}
/** How gloomy player p is in match m (0–1): the war stage of its side, its morale under `mor`, its HP under `hp`. */
export function gloomOf(m, p, side) {
  if (!m || !p) return 0;
  const W = vx('gloom', 'war', 0.7),
    st = m.weak ? m.weak[side] || 0 : 0,
    war = st ? W * (0.6 + 0.2 * st) : 0, // Strained · Shaken · Broken: 0.8 · 1.0 · 1.2 × war
    mo = m.mor && m.mor[p.id] != null ? m.mor[p.id] : 0,
    M = vx('gloom', 'mor', -0.35),
    mor = mo < M ? Math.min(1, (M - mo) / (1 + M)) : 0,
    hp = m.hp && m.hp[p.id] != null ? m.hp[p.id] : 1,
    HP = vx('gloom', 'hp', 0.3),
    low = hp < HP ? (HP - hp) / HP : 0;
  return Math.min(1, Math.max(war, mor, low));
}
const tmp = new THREE.Vector3();
/** Each frame: place player pl's gloom over its head and ease it toward how gloomy it is (`k`, gloomOf). */
export function gloomUpdate(pl, k, dt, t) {
  const g = pl.gloom;
  if (!g) return;
  const on = vx('gloom', 'on', 1) && k > 0;
  g.material.map = gloomTex(!!vx('gloom', 'curvy', 0));
  g.material.color.set(vx('gloom', 'col', '#9a5cff'));
  const targ = on ? k * vx('gloom', 'op', 1) * (0.85 + 0.15 * Math.sin(t * 2.2 + pl.root.id)) : 0;
  g.material.opacity += (targ - g.material.opacity) * (1 - Math.exp(-dt * 4));
  g.visible = pl.root.visible && g.material.opacity > 0.01;
  if (!g.visible) return;
  const head = pl.bone('head');
  (head ? head.getWorldPosition(tmp) : tmp.copy(pl.root.position).setY(1.6)).y += 0.25 + 0.04 * Math.sin(t * 0.9 + pl.root.id); // a slow sag
  g.position.set(tmp.x, tmp.y - 0.35, tmp.z);
  const s = vx('gloom', 'size', 1);
  g.scale.set(1.3 * s, 1.7 * s, 1);
}
