// Map furniture for the 3D island: an HTML overlay (pins, region labels, the picked-point flag) projected onto the
// terrain every frame (the war borders are map3d's war layer, spec §4.34). Reads only MapModel fields;
// reports only pick(id). Emoji icons, badges and the flag classes (off, far, turf, hq, can, mine, clash)
// are plain CSS on the overlay elements (css/map.css, .mpin …).
//   createFurniture(scene, heightAt) → { layer, sync(model, on), select(id), pulse(t), tick(cam, w, h, dist), dispose() }
import * as THREE from 'three';
import { MAP_M, smooth, esc } from './geo3d.mjs';
import { landmarkHeight } from './kit3d.mjs';

const FLAGCLS = {
    off: 'off',
    far: 'faraway',
    turf: 'turf',
    hq: 'hq',
    can: 'can',
    mine: 'mine',
    clash: 'clash',
    today: 'today'
  },
  KIND_Z = { hq: 1, spot: 2, clash: 3 },
  LABEL_FADE = [30, 70], // camera distance (m): labels vanish at the first, are fully shown at the second
  PIN_UP = 2.2; // pins float this far above their landmark's roof, or the ground (m)

export function createFurniture(scene, heightAt) {
  const layer = document.createElement('div');
  layer.className = 'maplay';
  const decals = new THREE.Group();
  let lastSel; // the last selected pin (undefined until the first select: a fresh layer never rings)
  scene.add(decals);
  const P = { key: {}, items: [], ver: 0 }; // items: { el, x, y, z, label? } world points to project; ver bumps on change
  const V = new THREE.Vector3(), // reused by tick (no per-frame allocation)
    lastCam = new THREE.Matrix4();
  let lastVer = -1,
    lastW = 0,
    lastH = 0,
    lastDist = -1;

  const world = ([mx, my], up) => {
    const x = mx * MAP_M,
      z = my * MAP_M;
    return { x, z, y: heightAt(x, z) + up };
  };
  const changed = (name, value) => {
    const k = JSON.stringify(value);
    if (P.key[name] === k) return false;
    P.key[name] = k;
    return true;
  };
  const drop = cls => {
    layer.querySelectorAll('.' + cls).forEach(e => e.remove());
    P.items = P.items.filter(i => !i.el.classList.contains(cls));
    P.ver++;
  };
  const add = (el, at, up, extra = {}) => {
    layer.append(el);
    P.items.push({ el, ...world(at, up), vis: null, ...extra });
    P.ver++;
  };
  const clearGroup = (g, which = () => true) => {
    for (const o of g.children.filter(which)) {
      g.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
  };

  return {
    layer,
    /** Bring the overlay and decals up to date with a model; each part is rebuilt only if its data changed. */
    sync(m, on) {
      if (changed('labels', [m.land.labels, m.land.airport, m.figures])) {
        drop('mlab');
        for (const l of m.land.labels) {
          const e = document.createElement('div');
          e.className = `mlab ${l.big ? 'big' : ''}`;
          e.style.setProperty('--tc', l.color);
          e.textContent = l.text;
          add(e, l.at, 3, { label: true });
        }
        const ap = document.createElement('div');
        ap.className = 'mlab ap';
        ap.innerHTML = '<i>✈</i>Airport';
        add(ap, m.land.airport, 2, { label: true, dy: 30 }); // below the spot where you arrive
        for (const f of m.figures || []) {
          const g = document.createElement('div'); // a named person's name over their head (the guide, the rival, the aces)
          g.className = 'mlab fig';
          g.style.setProperty('--tc', f.color);
          g.textContent = f.tag ? `${f.name} · ${f.tag}` : f.name;
          add(g, f.at, 7.5, { label: true });
        }
      }
      if (changed('pins', [m.pins, m.land.landmarks])) {
        drop('mpin');
        const lmk = new Map(m.land.landmarks.map(l => [l.id, l.kind]));
        for (const p of m.pins) {
          const e = document.createElement('button'),
            cls = Object.keys(p.flags || {})
              .filter(k => p.flags[k])
              .map(k => FLAGCLS[k])
              .join(' ');
          e.type = 'button';
          e.className = `mpin ${cls}`;
          e.dataset.spot = p.id;
          e.title = p.title;
          e.setAttribute('aria-label', p.title);
          if (p.color) e.style.setProperty('--tc', p.color);
          e.style.zIndex = KIND_Z[p.kind] || 2;
          e.innerHTML = `<i>${p.icon}</i>${p.badge ? `<b>${esc(p.badge)}</b>` : ''}${p.glyphs && p.glyphs.length ? `<em class="mgl">${esc(p.glyphs.join(''))}</em>` : ''}`; // what it trains best (spec §4.33)
          e.addEventListener('click', () => on.pick(p.id));
          add(e, p.at, PIN_UP + (lmk.has(p.id) ? landmarkHeight(lmk.get(p.id)) : 0));
        }
      }
      if (changed('flag', m.flag)) {
        drop('mflag');
        if (m.flag) {
          const e = document.createElement('div');
          e.className = 'mflag';
          e.textContent = '⚑';
          add(e, m.flag, 0.5);
        }
      }
      this.select(m.sel);
    },
    /** (The battle tile's pulse went with the hex tiles — T-317: the hot border pulses in map3d's war layer.) */
    pulse() {},
    /** Highlight the selected pin. */
    select(id) {
      for (const e of layer.querySelectorAll('.mpin')) {
        const on = e.dataset.spot === id;
        if (on && lastSel !== undefined && !e.classList.contains('sel') && id !== lastSel) {
          e.classList.remove('pulse'); // a newly selected pin rings once (spec §9.12; css/theme.css)
          void e.offsetWidth;
          e.classList.add('pulse');
          setTimeout(() => e.classList.remove('pulse'), 400);
        }
        e.classList.toggle('sel', on);
      }
      lastSel = id;
    },
    /** Place every overlay element at its projected ground point (call after the frame is rendered). */
    tick(cam, w, h, dist) {
      // nothing moved (camera, canvas size, items): the overlay is already in place
      cam.updateMatrixWorld();
      if (P.ver === lastVer && w === lastW && h === lastH && dist === lastDist && lastCam.equals(cam.matrixWorld)) return;
      lastVer = P.ver;
      lastDist = dist;
      lastW = w;
      lastH = h;
      lastCam.copy(cam.matrixWorld);
      const fade = smooth(LABEL_FADE[0], LABEL_FADE[1], dist),
        v = V;
      for (const it of P.items) {
        v.set(it.x, it.y, it.z).project(cam);
        const show = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15 && (!it.label || fade > 0.02);
        if (show !== it.vis) {
          it.el.style.display = show ? '' : 'none';
          it.vis = show;
        }
        if (!show) continue;
        it.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h + (it.dy || 0)).toFixed(1)}px) translate(-50%, -50%)`;
        if (it.label) it.el.style.opacity = fade.toFixed(2);
      }
    },
    dispose() {
      clearGroup(decals);
      scene.remove(decals);
      layer.remove();
    }
  };
}
