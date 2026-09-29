// MapView (SVG + panzoom): draws a MapModel and reports picks. The renderer contract — a three.js map implements the
// same four calls and nothing else in the game changes:
//   MapView.mount(el, model, { pick(id), point([x, y]) })  draw into el (replacing its content), wire input
//   MapView.select(id)                                      highlight the selected pin (null: none)
//   MapView.dispose()                                       release listeners / GPU objects
// pick(id): a pin was clicked; point(p): empty map clicked at p in map units. The view (pan / zoom) is the
// renderer's own business and survives re-mounts.

const MapView = {
  pz: null, // the panzoom instance
  view: null, // { x, y, s, fit } kept across re-mounts
  panEnd: 0,
  el: null,
  model: null,
  on: null,
  /** Map can be dragged this far (px) past the screen edge, so edge labels clear the HUD. */
  PAD: 90,
  /** Furthest zoom-out: the whole map fits in this share of the screen. */
  ZOOM_OUT: 0.8,
  mount(el, model, on) {
    MapView.dispose();
    MapView.el = el;
    MapView.model = model;
    MapView.on = on;
    el.innerHTML = `<div class="mapinner">${MapView.svg(model)}</div>`;
    MapView.zoom();
    const inner = el.querySelector('.mapinner'),
      hit = e => e.target.closest && e.target.closest('[data-spot]');
    inner.addEventListener('click', e => {
      if (Date.now() - MapView.panEnd <= 200) return; // the end of a drag
      const g = hit(e);
      if (g) return on.pick(g.dataset.spot);
      const m = inner.querySelector('svg').getScreenCTM();
      if (!m) return;
      const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      on.point([Math.round(q.x), Math.round(q.y)]);
    });
    inner.addEventListener('keydown', e => {
      const g = hit(e);
      if (g && e.key === 'Enter') on.pick(g.dataset.spot);
    });
  },
  select(id) {
    if (!MapView.el) return;
    for (const g of MapView.el.querySelectorAll('.city .pin')) g.classList.toggle('sel', g.dataset.spot === id);
  },
  dispose() {
    if (MapView.pz) MapView.pz.dispose();
    MapView.pz = null;
    MapView.el = null;
  },
  /** Pan / zoom: from the whole island (with a margin) to 2.5× of "cover"; a fresh view centres on model.focus. */
  zoom() {
    const wrap = MapView.el,
      inner = wrap && wrap.querySelector('.mapinner'),
      M = MapView.model;
    if (!inner || typeof panzoom !== 'function') return;
    const size = () => [wrap.clientWidth, wrap.clientHeight],
      [cw, ch] = size(),
      fit = Math.max(cw / M.w, ch / M.h),
      all = Math.min(cw / M.w, ch / M.h) * MapView.ZOOM_OUT,
      pz = panzoom(inner, { minZoom: Math.min(all, fit), maxZoom: fit * 2.5, zoomDoubleClickSpeed: 1, onTouch: () => false }),
      PAD = MapView.PAD;
    const keepIn = () => {
      const t = pz.getTransform(),
        [cw, ch] = size(),
        w = M.w * t.scale,
        h = M.h * t.scale;
      t.x = w <= cw ? (cw - w) / 2 : clamp(t.x, cw - w - PAD, PAD);
      t.y = h <= ch ? (ch - h) / 2 : clamp(t.y, ch - h - PAD, PAD);
    };
    pz.on('pan', keepIn);
    pz.on('zoom', keepIn);
    pz.on('panend', () => (MapView.panEnd = Date.now()));
    pz.on('transform', () => {
      const t = pz.getTransform();
      MapView.view = { x: t.x, y: t.y, s: t.scale, fit };
    });
    const v = MapView.view && MapView.view.fit === fit ? MapView.view : null;
    if (v) {
      pz.zoomAbs(0, 0, v.s);
      pz.moveTo(v.x, v.y);
    } else {
      const [hx, hy] = M.focus;
      pz.zoomAbs(0, 0, fit);
      pz.moveTo(cw / 2 - hx * fit, ch / 2 - hy * fit);
    }
    MapView.pz = pz;
  },
  /** The model as SVG markup (styles: css/career.css, .city …). */
  svg(M) {
    const pts = poly => poly.map(p => p.join(',')).join(' '),
      path = poly => 'M' + poly.map(p => p.join(',')).join('L') + 'Z',
      L = M.land,
      FLAGCLS = {
        off: 'off',
        far: 'faraway',
        turf: 'turf',
        gem: 'gem',
        overhyped: 'overhyped',
        hq: 'hq',
        can: 'can',
        mine: 'mine',
        clash: 'clash'
      },
      pin = P => {
        const cls = Object.keys(P.flags || {})
          .filter(k => P.flags[k])
          .map(k => FLAGCLS[k])
          .join(' ');
        return `<g class="pin ${cls} ${M.sel === P.id ? 'sel' : ''}" transform="translate(${P.at.join(',')})" data-spot="${P.id}" role="button" tabindex="0" aria-label="${esc(P.title)}"><title>${esc(P.title)}</title>
        <circle r="22"${P.color ? ` style="--tc:${P.color}"` : ''}/><text class="ic" y="7">${P.icon}</text>${
          P.badge ? `<g class="bd" transform="translate(17,-17)"><circle r="10"/><text y="4">${P.badge}</text></g>` : ''
        }</g>`;
      };
    const regs = L.regions
      .map(r => `<polygon class="reg ${r.mine ? 'mine' : ''}" style="--tc:${r.color}" points="${pts(r.poly)}"/>`)
      .join('');
    const land = `
    <defs><clipPath id="isl"><path d="${path(L.coast)}"/></clipPath></defs>
    <path class="island" d="${path(L.coast)}"/>
    <polyline class="beach" clip-path="url(#isl)" points="${pts(L.beach)}"/>
    ${regs}
    ${L.mountains.map(([x, y]) => `<path class="mtn" d="M${x - 22},${y + 12} L${x},${y - 16} L${x + 22},${y + 12}Z"/>`).join('')}
    <polyline class="contest" points="${pts(L.contest.line)}"><title>${esc(L.contest.title)}</title></polyline>
    ${L.minors
      .map(
        e =>
          `<ellipse class="minor ${e.mine ? 'mine' : ''}" style="--tc:${e.color}" cx="${e.x}" cy="${e.y}" rx="${e.rx}" ry="${e.ry}" transform="rotate(${e.rot} ${e.x} ${e.y})"/>`
      )
      .join('')}
    <circle class="park" cx="${L.park.x}" cy="${L.park.y}" r="${L.park.r}"><title>${esc(L.park.title)}</title></circle>
    ${L.labels.map(l => `<text class="rl ${l.big ? 'big' : ''}" x="${l.at[0]}" y="${l.at[1]}" style="--tc:${l.color}">${esc(l.text)}</text>`).join('')}
    <g class="airport" transform="translate(${L.airport.join(',')})"><text class="ic" y="6">✈</text><text class="ap" y="30">Airport</text></g>`;
    const seized = M.seized
      .map(
        s =>
          `<circle class="seized" cx="${s.at[0]}" cy="${s.at[1]}" r="${s.r}" style="--tc:${s.color}"><title>${esc(s.title)}</title></circle>`
      )
      .join('');
    // the dark: everything but the explored circles (soft edges)
    const big = `x="-200" y="-200" width="${M.w + 400}" height="${M.h + 400}"`,
      fog = `<defs><filter id="fogb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
    <mask id="fogm"><rect ${big} fill="#fff"/><g filter="url(#fogb)">${M.fog.points
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${M.fog.r}" fill="#000"/>`)
      .join('')}</g></mask></defs><rect class="fog" ${big} mask="url(#fogm)"/>`;
    const you = `<g class="here" transform="translate(${M.you.at.join(',')})"><circle r="30"/><text y="5">YOU</text><title>${esc(M.you.title)}</title></g>`,
      flag = M.flag ? `<g class="flag" transform="translate(${M.flag.join(',')})"><circle r="9"/><text y="-14">⚑</text></g>` : '',
      order = { hq: 0, spot: 1, clash: 2 },
      pins = [...M.pins]
        .sort((a, b) => order[a.kind] - order[b.kind])
        .map(pin)
        .join('');
    return `<svg class="city" width="${M.w}" height="${M.h}" viewBox="0 0 ${M.w} ${M.h}" role="img" aria-label="Island map">
    ${land}${seized}${fog}${you}${pins}${flag}</svg>`;
  }
};
window.addEventListener('resize', () => {
  if (MapView.el && MapView.el.isConnected) MapView.mount(MapView.el, MapView.model, MapView.on);
});
