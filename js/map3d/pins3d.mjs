// Map furniture for the 3D island: an HTML overlay (pins, region labels, the picked-point flag) projected onto the
// terrain every frame, and terrain decals: the hex territory (spec §4.27: tile fills, holder edges, the battle tile) with
// pressure labels. Reads only MapModel fields;
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
  let target = null; // this week's battle tile outline (pulsed)
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

  /**
   * The hex territory (spec §4.27): one translucent fill for every tile in its holder's colour (the only faction colour on the ground) (vertex colours,
   * draped on the terrain), an inset ribbon along every edge where holders differ (each side in its own colour), and a
   * faint grid line between a territory's own tiles, and a pulsing outline on this week's battle tile. Returns
   * [fill, edges, grid, target|null].
   */
  const hexMeshes = H => {
    const S = H.size,
      own = new Map(H.tiles.map(t => [`${Math.round(t.at[0])},${Math.round(t.at[1])}`, t])),
      corner = (t, i, k) => [t.at[0] + S * k * Math.cos((i * Math.PI) / 3), t.at[1] + S * k * Math.sin((i * Math.PI) / 3)],
      lift = ([mx, my], up) => {
        const w = world([mx, my], up);
        return [w.x, w.y, w.z];
      },
      fp = [],
      fc = [],
      ep = [],
      ec = [],
      gp = [],
      SUB = 8; // fan triangles split 8 × 8: ~3 m facets, close to the terrain grid, so steep ground (mountains) stays covered
    for (const t of H.tiles) {
      const c = new THREE.Color(t.color),
        major = t.major;
      for (let i = 0; i < 6; i++) {
        // a fan triangle (centre, corner i, corner i+1), split SUB×SUB so it follows the ground
        const A = t.at,
          B = corner(t, i, 1),
          C = corner(t, i + 1, 1),
          P = (u, v) => [A[0] + (B[0] - A[0]) * u + (C[0] - A[0]) * v, A[1] + (B[1] - A[1]) * u + (C[1] - A[1]) * v];
        for (let a = 0; a < SUB; a++)
          for (let b = 0; a + b < SUB; b++) {
            const tri = [
              [a, b],
              [a + 1, b],
              [a, b + 1]
            ];
            const tris =
              a + b + 1 < SUB
                ? [
                    tri,
                    [
                      [a + 1, b],
                      [a + 1, b + 1],
                      [a, b + 1]
                    ]
                  ]
                : [tri];
            for (const q of tris)
              for (const [u, v] of q) {
                fp.push(...lift(P(u / SUB, v / SUB), 0.6));
                fc.push(c.r, c.g, c.b);
              }
          }
      }
      for (let i = 0; i < 6; i++) {
        const ang = ((i + 0.5) * Math.PI) / 3,
          n = own.get(
            `${Math.round(t.at[0] + Math.sqrt(3) * S * Math.cos(ang))},${Math.round(t.at[1] + Math.sqrt(3) * S * Math.sin(ang))}`
          );
        if (n && n.own === t.own && major && i < 3) {
          // the grid inside a territory: a faint line (each shared edge once)
          for (let k = 0; k < 4; k++) {
            const L = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
            gp.push(
              ...lift(L(corner(t, i, 1), corner(t, i + 1, 1), k / 4), 0.45),
              ...lift(L(corner(t, i, 1), corner(t, i + 1, 1), (k + 1) / 4), 0.45)
            );
          }
        }
        if (!n || n.own === t.own || !(major || n.major)) continue;
        for (let k = 0; k < 4; k++) {
          const o0 = corner(t, i, 0.96),
            o1 = corner(t, i + 1, 0.96),
            i0 = corner(t, i, 0.86),
            i1 = corner(t, i + 1, 0.86),
            L = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u],
            a0 = lift(L(o0, o1, k / 4), 0.5),
            a1 = lift(L(o0, o1, (k + 1) / 4), 0.5),
            b0 = lift(L(i0, i1, k / 4), 0.5),
            b1 = lift(L(i0, i1, (k + 1) / 4), 0.5);
          ep.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
          for (let j = 0; j < 6; j++) ec.push(c.r, c.g, c.b);
        }
      }
    }
    const mesh = (pos, col, opacity) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true, // drawn over the ground it hugs (no z-fighting where a facet dips into a slope)
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4
        })
      );
      m.userData.hex = true;
      return m;
    };
    let target = null;
    const tt = H.target && H.tiles.find(t => t.id === H.target.id);
    if (tt) {
      const c = new THREE.Color(H.target.color),
        tp = [],
        tc = [];
      for (let i = 0; i < 6; i++)
        for (let k = 0; k < 4; k++) {
          const L = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u],
            o0 = corner(tt, i, 1.02),
            o1 = corner(tt, i + 1, 1.02),
            i0 = corner(tt, i, 0.9),
            i1 = corner(tt, i + 1, 0.9),
            a0 = lift(L(o0, o1, k / 4), 0.7),
            a1 = lift(L(o0, o1, (k + 1) / 4), 0.7),
            b0 = lift(L(i0, i1, k / 4), 0.7),
            b1 = lift(L(i0, i1, (k + 1) / 4), 0.7);
          tp.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
          for (let j = 0; j < 6; j++) tc.push(c.r, c.g, c.b);
        }
      target = mesh(tp, tc, 0.9);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    const grid = new THREE.LineSegments(
      gg,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, depthWrite: false })
    );
    return [mesh(fp, fc, 0.3), mesh(ep, ec, 0.75), grid, target];
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
      if (changed('hexes', m.hexes)) {
        clearGroup(decals);
        drop('mbord');
        target = null;
        if (m.hexes) {
          const [fill, edges, grid, tg] = hexMeshes(m.hexes);
          decals.add(fill, edges, grid);
          if (tg) decals.add((target = tg));
          for (const t of m.hexes.tiles.filter(x => x.text || (m.hexes.target && x.id === m.hexes.target.id))) {
            const tgt = m.hexes.target && t.id === m.hexes.target.id,
              e = document.createElement('div');
            e.className = `mbord lead ${tgt ? 'brink' : ''}`;
            e.style.setProperty('--tc', tgt ? m.hexes.target.color : t.color);
            e.textContent = tgt ? m.hexes.target.text : t.text;
            add(e, t.at, 1.5, { label: true, dy: tgt ? 34 : 0 }); // the battle tile's label sits under its ⚔ pin
          }
        }
      }
      this.select(m.sel);
    },
    /** Pulse this week's battle tile outline. */
    pulse(t) {
      if (target) target.material.opacity = 0.45 + 0.5 * (0.5 + 0.5 * Math.sin(t * 4));
    },
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
