// Map furniture for the 3D island: an HTML overlay projected onto the terrain every frame (the war borders are map3d's war layer,
// spec §4.34). No pins (spec §4.40, T-351): the places are their buildings — the town layer picks and lights them; this overlay keeps
//   - the hover tag over the facility under the pointer (`.mtag`: its name, the 1–3 body glyphs it trains best, the trip there),
//   - an invisible anchor over the selected place (`.manchor`: the place popup stands beside it, career-map.js spotPlace),
//   - the picked-point flag, the story figures' names over their heads,
//   - the region names, only far out (zoomed to the whole island: NAMES_AT), where a place is too small to hover.
// Reads only MapModel fields; reports nothing (map3d turns facility clicks into pick(id)).
//   createFurniture(scene, heightAt, where) → { layer, sync(model, on), select(id), hover(id), pulse(t), tick(cam, w, h, dist), dispose() }
//   where(id) → the world point { x, y, z } over a facility's roof, or null (then its model point on the ground).
import * as THREE from 'three';
import { MAP_M, smooth, esc } from './geo3d.mjs';

const NAMES_AT = [700, 1100], // camera distance (m): the region names fade in between these (far out only)
  TAG_UP = 1.2; // the tag and the anchor float this far above a facility's roof (m)

/** The walk there, in words (the tag; hours since spec §4.41). */
const tripText = n => (n > 0 ? `${n} h walk` : 'Here');

export function createFurniture(scene, heightAt, where = () => null) {
  const layer = document.createElement('div');
  layer.className = 'maplay';
  const P = { key: {}, items: [], ver: 0 }; // items: { el, x, y, z, label? } world points to project; ver bumps on change
  const V = new THREE.Vector3(), // reused by tick (no per-frame allocation)
    V2 = new THREE.Vector3(),
    lastCam = new THREE.Matrix4();
  let lastVer = -1,
    lastW = 0,
    lastH = 0,
    lastDist = -1,
    pins = new Map(), // id → model pin (name, glyphs, trip, at)
    anchor = null,
    tag = null;

  const world = ([mx, my], up) => {
    const x = mx * MAP_M,
      z = my * MAP_M;
    return { x, z, y: heightAt(x, z) + up };
  };
  /** Where a place's overlay sits: over its facility's roof, else over its point. */
  const over = id => {
    const w = where(id);
    if (w) return { x: w.x, y: w.y + TAG_UP, z: w.z, r: w.r || 0 };
    const p = pins.get(id);
    return p ? world(p.at, 3) : null;
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
  /** Move a single overlay item (the anchor, the tag) to world point w (null hides it). */
  const place = (it, w) => {
    if (!w) {
      it.off = true;
      it.el.style.display = 'none';
      it.vis = false;
    } else Object.assign(it, w, { off: false });
    P.ver++;
  };

  return {
    layer,
    /** Bring the overlay up to date with a model; each part is rebuilt only if its data changed. */
    sync(m) {
      pins = new Map((m.pins || []).map(p => [p.id, p]));
      if (changed('labels', [m.land.labels, m.figures])) {
        drop('mlab');
        for (const l of m.land.labels) {
          const e = document.createElement('div');
          e.className = `mlab ${l.big ? 'big' : ''}`;
          e.style.setProperty('--tc', l.color);
          e.textContent = l.text;
          add(e, l.at, 3, { label: 'far' });
        }
        for (const f of m.figures || []) {
          const g = document.createElement('div'); // a named person's name over their head (the guide, the rival, the aces)
          g.className = 'mlab fig';
          g.style.setProperty('--tc', f.color);
          g.textContent = f.tag ? `${f.name} · ${f.tag}` : f.name;
          add(g, f.at, 7.5, { label: 'near' });
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
      if (!anchor) {
        const e = document.createElement('div');
        e.className = 'manchor';
        e.setAttribute('aria-hidden', 'true');
        layer.append(e);
        anchor = { el: e, x: 0, y: 0, z: 0, vis: null, off: true };
        P.items.push(anchor);
        const t = document.createElement('div');
        t.className = 'mtag';
        t.setAttribute('role', 'tooltip');
        layer.append(t);
        tag = { el: t, x: 0, y: 0, z: 0, vis: null, off: true, id: null };
        P.items.push(tag);
      }
      this.select(m.sel);
      if (tag.id) this.hover(tag.id, true);
    },
    /** (The battle tile's pulse went with the hex tiles — T-317: the hot border pulses in map3d's war layer.) */
    pulse() {},
    /** The selected place: the anchor (the popup's) over its building. */
    select(id) {
      if (!anchor) return;
      anchor.el.dataset.spot = id || '';
      place(anchor, id && !String(id).startsWith('pt:') ? over(id) : null);
      if (tag && tag.id && tag.id === id) place(tag, null); // its popup is open: the tag goes
    },
    /** The facility under the pointer (null: none): its tag — name, glyphs, the trip there. */
    hover(id, again = false) {
      if (!tag || (id === tag.id && !again)) return;
      tag.id = id;
      const p = id && pins.get(id);
      if (!p) return place(tag, null);
      tag.el.dataset.spot = id;
      tag.el.innerHTML = `<b>${esc(p.name || p.title)}</b>${p.glyphs && p.glyphs.length ? `<em class="mgl">${esc(p.glyphs.join(''))}</em>` : ''}<span>${esc(tripText(p.trip || 0))}</span>`;
      tag.el.classList.toggle('shut', !!(p.flags && p.flags.shut));
      const o = over(id);
      place(tag, o && { ...o, r: 0 }); // (the tag keeps its own size; only the anchor spans the building)
    },
    /** Place every overlay element at its projected point (call after the frame is rendered). */
    tick(cam, w, h, dist) {
      // nothing moved (camera, canvas size, items): the overlay is already in place
      cam.updateMatrixWorld();
      if (P.ver === lastVer && w === lastW && h === lastH && dist === lastDist && lastCam.equals(cam.matrixWorld)) return;
      lastVer = P.ver;
      lastDist = dist;
      lastW = w;
      lastH = h;
      lastCam.copy(cam.matrixWorld);
      const far = smooth(NAMES_AT[0], NAMES_AT[1], dist),
        rx = cam.matrixWorld.elements[0], // the camera's right (world): a facility's half width on screen
        rz = cam.matrixWorld.elements[2],
        near = smooth(30, 70, dist), // the figures' names: gone right down near the ground (as before)
        v = V;
      for (const it of P.items) {
        if (it.off) continue;
        const fade = it.label === 'far' ? far : it.label === 'near' ? near : 1;
        v.set(it.x, it.y, it.z).project(cam);
        const show = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15 && fade > 0.02;
        if (show !== it.vis) {
          it.el.style.display = show ? '' : 'none';
          it.vis = show;
        }
        if (!show) continue;
        const sx = (v.x * 0.5 + 0.5) * w;
        if (it.r) {
          // the anchor spans the building's width on screen (the popup stands clear of it)
          const e = V2.set(it.x + rx * it.r, it.y, it.z + rz * it.r).project(cam),
            hw = Math.max(1, Math.abs((e.x * 0.5 + 0.5) * w - sx));
          it.el.style.width = `${(2 * hw).toFixed(0)}px`;
        }
        it.el.style.transform = `translate(${sx.toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h + (it.dy || 0)).toFixed(1)}px) translate(-50%, -50%)`;
        if (it.label) it.el.style.opacity = fade.toFixed(2);
      }
    },
    dispose() {
      layer.remove();
    }
  };
}
