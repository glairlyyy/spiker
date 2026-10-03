// Map furniture for the 3D island: an HTML overlay (pins, region labels, the picked-point flag) projected onto the
// terrain every frame, and terrain decals (seized patches, the three major borders with their pressure labels). Reads only MapModel fields;
// reports only pick(id). Emoji icons, badges and the flag classes (off, far, turf, gem, overhyped, hq, can, mine, clash)
// are plain CSS on the overlay elements (css/career.css, .mpin …).
//   createFurniture(scene, heightAt) → { layer, sync(model, on), select(id), pulse(t), tick(cam, w, h, dist), dispose() }
import * as THREE from 'three';
import { MAP_M, smooth } from './geo3d.mjs';
import { landmarkHeight } from './kit3d.mjs';

const FLAGCLS = {
    off: 'off',
    far: 'faraway',
    turf: 'turf',
    gem: 'gem',
    overhyped: 'overhyped',
    hq: 'hq',
    can: 'can',
    mine: 'mine',
    clash: 'clash',
    today: 'today'
  },
  KIND_Z = { hq: 1, spot: 2, clash: 3 },
  LABEL_FADE = [30, 70], // camera distance (m): labels vanish at the first, are fully shown at the second
  BORDER_W = 1.4, // border ribbon width (m)
  PIN_UP = 2.2, // pins float this far above their landmark's roof, or the ground (m)
  esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createFurniture(scene, heightAt) {
  const layer = document.createElement('div');
  layer.className = 'maplay';
  const decals = new THREE.Group();
  let lines = []; // the border ribbons: { line: THREE.Mesh, pressure, brink } (pulsed by pressure)
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

  /** A flat patch hugging the terrain: filled disc + outline (map-unit radius). */
  const patch = (at, r, color) => {
    const c = new THREE.Color(color),
      { x, z } = world(at, 0),
      R = r * MAP_M,
      seg = 48,
      rings = 4,
      pos = [],
      idx = [];
    const y = (px, pz) => heightAt(px, pz) + 0.3;
    pos.push(x, y(x, z), z);
    for (let k = 1; k <= rings; k++)
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2,
          px = x + Math.cos(a) * R * (k / rings),
          pz = z + Math.sin(a) * R * (k / rings);
        pos.push(px, y(px, pz), pz);
      }
    for (let i = 0; i < seg; i++) idx.push(0, 1 + i, 1 + ((i + 1) % seg));
    for (let k = 1; k < rings; k++)
      for (let i = 0; i < seg; i++) {
        const a = 1 + (k - 1) * seg + i,
          b = 1 + (k - 1) * seg + ((i + 1) % seg),
          d = a + seg,
          e = b + seg;
        idx.push(a, d, b, b, d, e);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const fill = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })
    );
    const ring = pos.slice(-seg * 3),
      lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    return [fill, new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ color: c }))];
  };
  /** A border as a dashed ribbon (BORDER_W m wide) just above the ground, in the leading side's colour (grey when even). */
  const border = (line, color) => {
    const pos = [],
      dash = (a, b) => {
        // one dash: a quad from a to b, its ends lifted to the terrain
        const dx = b.x - a.x,
          dz = b.z - a.z,
          n = Math.hypot(dx, dz) || 1,
          ox = (-dz / n) * (BORDER_W / 2),
          oz = (dx / n) * (BORDER_W / 2),
          q = [
            [a.x + ox, a.z + oz],
            [a.x - ox, a.z - oz],
            [b.x - ox, b.z - oz],
            [b.x + ox, b.z + oz]
          ].map(([x, z]) => [x, heightAt(x, z) + 0.5, z]);
        pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
      };
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, ay] = line[i],
        [bx, by] = line[i + 1],
        n = Math.max(1, Math.ceil((Math.hypot(bx - ax, by - ay) * MAP_M) / 3.5));
      for (let k = 0; k < n; k += 2) {
        const p = t => world([ax + (bx - ax) * t, ay + (by - ay) * t], 0);
        dash(p(k / n), p(Math.min(1, (k + 1) / n)));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: color || 0x9aa0aa,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    mesh.userData.border = true;
    return mesh;
  };

  /** The point halfway along a polyline (map units). */
  const midOf = line => {
    const seg = line.slice(1).map((p, i) => Math.hypot(p[0] - line[i][0], p[1] - line[i][1]));
    let rest = seg.reduce((s, d) => s + d, 0) / 2;
    for (let i = 0; i < seg.length; i++) {
      if (rest <= seg[i]) {
        const u = rest / (seg[i] || 1);
        return [line[i][0] + (line[i + 1][0] - line[i][0]) * u, line[i][1] + (line[i + 1][1] - line[i][1]) * u];
      }
      rest -= seg[i];
    }
    return line[line.length - 1];
  };

  return {
    layer,
    /** Bring the overlay and decals up to date with a model; each part is rebuilt only if its data changed. */
    sync(m, on) {
      if (changed('labels', [m.land.labels, m.land.airport])) {
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
          e.innerHTML = `<i>${p.icon}</i>${p.badge ? `<b>${esc(p.badge)}</b>` : ''}`;
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
      if (changed('seized', m.seized)) {
        clearGroup(decals, o => !o.userData.border); // the patches only: the borders have their own key
        for (const s of m.seized) decals.add(...patch(s.at, s.r, s.color));
      }
      if (changed('border', m.land.borders)) {
        clearGroup(decals, o => o.userData.border);
        drop('mbord');
        lines = (m.land.borders || []).map(b => {
          const l = border(b.line, b.color);
          decals.add(l);
          const e = document.createElement('div');
          e.className = `mbord ${b.lead ? 'lead' : ''} ${b.brink ? 'brink' : ''}`;
          if (b.color) e.style.setProperty('--tc', b.color);
          e.title = b.title;
          e.textContent = b.text;
          add(e, midOf(b.line), 1.5, { label: true });
          return { line: l, pressure: b.pressure, brink: b.brink };
        });
      }
      this.select(m.sel);
    },
    /** Pulse every border by its own pressure: 0 (even: steady) … 1 (at the brink of a seizure: fast, bright). */
    pulse(t) {
      for (const L of lines) L.line.material.opacity = L.pressure ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * (2 + 4 * L.pressure))) : 0.6;
    },
    /** Highlight the selected pin. */
    select(id) {
      for (const e of layer.querySelectorAll('.mpin')) e.classList.toggle('sel', e.dataset.spot === id);
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
