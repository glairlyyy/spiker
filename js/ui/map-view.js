// MapView: the island map renderer the game talks to — the three.js map (js/map3d/map3d.mjs), lazy-loaded once.
//   MapView.mount(el, model, { pick(id), point([x, y]) })   MapView.update(model) (adds you.route on a move)   MapView.select(id)   MapView.dispose()
// The 3D renderer keeps ONE canvas across re-mounts (renderCareer re-creates #mapwrap) and releases itself when the
// career screen is gone. Without WebGL the map area shows a notice (no 2D fallback).
// The living island (spec §4.37): MapView adds hover(id, x, y, going) / person(id) to the callbacks (a named figure's tip —
// face, name, club, what they do — and a click opening their People card) and tells the map the phase of the day:
// MapView.phase() → 'idle' | 'walk' | 'order', read by map3d each frame (setPhase) from the action lock (CW.lock: walk /
// greet = 'walk', spin / done / res = 'order', any other lock phase — an encounter's stop — = 'walk'; none = 'idle').
// The figure menu (spec §4.37 7, T-340): a click or right-click on a figure opens it (figOpen, career-map.js); figureAt(id) = the
// figure's client point (the menu follows it), mark(id) = the ring under their feet while it is open.
// Street level (spec §4.37 6, T-336a): MapView adds `street` to the model (the prototype district: a capsule round the Dynasty
// Strength Center and the League Arena, map units) and walk(p) / canWalk() to the callbacks. At street level a click on the ground
// is a travel there (mapTravel — the same rules as the point card's Walk; refused → the point card says why); WASD walks you freely
// and walk(p) resolves where you stopped the same way (only if it changed point; refused → your avatar walks back).

const MapView = {
  m3: null, // the live 3D renderer
  loading: false,
  failed: null, // the load error text, if the module or WebGL failed
  el: null,
  model: null,
  on: null,
  on0: null, // the callbacks as the UI gave them (pick, point)
  last: null, // the you.at last passed on (the road a trip follows starts there)
  free: null, // a WASD stop being resolved: the travel goes straight there (you already stand on it)
  /** The street-level district (map units): the capsule from the Dynasty Strength Center to the League Arena, STREET_R round it. */
  STREET_R: 200,
  zone() {
    const a = typeof SPOTS !== 'undefined' && SPOTS.weiPower && SPOTS.weiPower.at,
      b = typeof VENUES !== 'undefined' && VENUES.arena && VENUES.arena.at;
    return a && b ? { a: a.slice(), b: b.slice(), r: MapView.STREET_R } : null;
  },
  /** The model with you.route = the road path from the last shown position to you.at when that changed (the renderer reads only the model). */
  routed(model) {
    model = model.street ? model : { ...model, street: MapView.zone() };
    const at = model.you && model.you.at;
    if (!at) return model;
    const from = MapView.last,
      free = MapView.free;
    MapView.last = at.slice();
    MapView.free = null;
    if (!from || (from[0] === at[0] && from[1] === at[1])) return model;
    if (free && free[0] === at[0] && free[1] === at[1]) return { ...model, you: { ...model.you, route: [from, at] } }; // (WASD: you are there)
    return { ...model, you: { ...model.you, route: City.route(from, at) } };
  },
  /** How far down the camera is (0 = the map, 1 = street level). */
  street: () => (MapView.m3 && MapView.m3.street ? MapView.m3.street() : 0),
  /** You may walk at street level now: no lock, event, open figure menu, sheet or match (the hub's input rules). */
  canWalk() {
    if (typeof RUN === 'undefined' || !RUN || RUN.event || (typeof A !== 'undefined' && A)) return false;
    if (typeof CW === 'undefined' || CW.lock || CW.fig || CW.sheet) return false;
    return !document.querySelector('.hubmodal');
  },
  /**
   * A travel from street level to map point p: a click (click = true; refused → the point card, which says why) or a WASD stop
   * (refused or the same point → your avatar walks back to where the rules have you).
   */
  walk(p, click = false) {
    const pos = typeof RUN !== 'undefined' && RUN ? City.pos(RUN) : null,
      same = pos && Math.hypot(p[0] - pos[0], p[1] - pos[1]) < 3;
    if (!pos || same || !MapView.canWalk()) return click ? !same && MapView.on0 && MapView.on0.point(p) : MapView.home();
    if (!click) MapView.free = p.slice();
    if (typeof mapTravel === 'function') mapTravel(p[0], p[1]);
    const now = City.pos(RUN);
    if (now[0] === pos[0] && now[1] === pos[1]) {
      MapView.free = null;
      if (click && MapView.on0) MapView.on0.point(p);
      else MapView.home();
    }
  },
  /** Your avatar walks back to where the rules have you (a WASD walk that didn't become a travel). */
  home() {
    if (MapView.m3 && MapView.m3.home) MapView.m3.home();
  },
  mount(el, model, on) {
    model = MapView.routed(model);
    MapView.on0 = on;
    on = {
      ...on,
      hover: MapView.hover,
      person: MapView.person,
      point: p => (MapView.street() > 0.5 ? MapView.walk(p, true) : MapView.on0.point(p)),
      walk: p => MapView.walk(p),
      canWalk: MapView.canWalk
    };
    MapView.el = el;
    MapView.model = model;
    MapView.on = on;
    if (MapView.m3) MapView.prep(MapView.m3);
    if (MapView.m3) return MapView.m3.mount(el, model, on);
    if (MapView.failed) return MapView.notice(el, MapView.failed);
    MapView.notice(el, 'Loading the island…');
    if (MapView.loading) return;
    MapView.loading = true;
    import(new URL('js/map3d/map3d.mjs', document.baseURI).href)
      .then(mod => {
        MapView.loading = false;
        if (!MapView.el || !MapView.el.isConnected) return; // the screen changed meanwhile: the next mount loads it
        MapView.m3 = mod.create(() => MapView.drop3D());
        if (MapView.m3.setWalk) MapView.m3.setWalk(MapView.walkK());
        MapView.prep(MapView.m3);
        MapView.m3.mount(MapView.el, MapView.model, MapView.on);
      })
      .catch(e => {
        MapView.loading = false;
        MapView.m3 = null;
        MapView.failed = `The 3D map can't run here (${e && e.message ? e.message : e}). This device or browser needs WebGL.`;
        DBG.log('error', MapView.failed);
        if (MapView.el && MapView.el.isConnected) MapView.notice(MapView.el, MapView.failed);
      });
  },
  notice: (el, text) => (el.innerHTML = `<p class="mapnote" role="status">${esc(text)}</p>`),
  /** The renderer's settings from the UI: the phase source and the Fast graphics setting (fewer figures and lights). */
  prep(m3) {
    if (m3.setPhase) m3.setPhase(MapView.phase);
    if (m3.setLow) m3.setLow(typeof G !== 'undefined' && G.gfx === 'fast');
  },
  /** The part of the day the UI is playing (see the header): 'idle' | 'walk' | 'order'. */
  phase() {
    const L = typeof CW !== 'undefined' && CW ? CW.lock : null;
    return !L ? 'idle' : ['spin', 'done', 'res'].includes(L.phase) ? 'order' : 'walk';
  },
  /** A named figure's entry in the shown model (life.people), or null. */
  who: id => ((MapView.model && MapView.model.life && MapView.model.life.people) || []).find(p => p.id === id) || null,
  /** The hover tip's text for a named figure: { face, name, club, doing } (grey = a club you haven't scouted: no name or face). */
  tipOf(run, id, going) {
    const f = MapView.who(id),
      p = f && People.find(run, id);
    if (!f || !p) return null;
    const club = p.team ? p.team.name : 'No club',
      place = f.spot && SPOTS[f.spot] ? SPOTS[f.spot].name : null,
      doing =
        going === 'home'
          ? 'heading home'
          : going === 'out'
            ? `heading to ${place || 'the street'}`
            : place
              ? `${LIFE.act[f.act] || 'out'} at ${place}`
              : `${LIFE.act[f.act] || 'out'} · ${LIFE.home}`;
    return f.g === 'grey' ? { face: '', name: 'Not scouted', club, doing } : { face: faceSVG(p, 0, 40), name: p.name, club, doing };
  },
  /** Show / move / hide the tip for the named figure under the pointer (clientX / Y), on the design system's tooltip. */
  hover(id, x, y, going) {
    let box = MapView.tipEl;
    const t = id !== null && id !== undefined && typeof RUN !== 'undefined' && RUN ? MapView.tipOf(RUN, id, going) : null;
    if (!t) return box && (box.style.display = 'none');
    if (!box) {
      box = MapView.tipEl = document.createElement('div');
      box.className = 'tipbox maptip';
      box.setAttribute('role', 'tooltip');
    }
    if (box.parentNode !== document.body) document.body.appendChild(box);
    const html = `<div style="display:flex;gap:10px;align-items:center">${t.face}<div><b>${esc(t.name)}</b><br>${esc(t.club)}<br>${esc(t.doing)}</div></div>`;
    if (box.dataset.k !== `${id}|${t.doing}`) ((box.innerHTML = html), (box.dataset.k = `${id}|${t.doing}`));
    box.style.whiteSpace = 'normal';
    box.style.display = 'block';
    const b = box.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.min(innerWidth - b.width - 8, x + 14))}px`;
    box.style.top = `${Math.max(8, y - b.height - 12)}px`;
  },
  /** A click / right-click on a named figure: the figure menu (not for someone of a club you haven't scouted; no menu → their card). */
  person(id) {
    const f = MapView.who(id);
    MapView.hover(null);
    if (!f || f.g === 'grey') return;
    if (typeof figOpen === 'function') figOpen(id);
    else if (typeof openPerson === 'function') openPerson(id);
  },
  /** A named figure's point on the page (client px), or null when it isn't on screen (hidden at home, off the canvas). */
  figureAt(id) {
    const s = MapView.m3 && MapView.m3.figureAt ? MapView.m3.figureAt(id) : null,
      c = s && MapView.el && MapView.el.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return s[0] < 0 || s[1] < 0 || s[0] > r.width || s[1] > r.height ? null : [r.left + s[0], r.top + s[1]];
  },
  /** The ring under a figure's feet (the menu's person), or none (null). */
  mark(id) {
    if (MapView.m3 && MapView.m3.mark) MapView.m3.mark(id);
  },
  /** Release the 3D renderer (leaving the career screen). */
  drop3D() {
    MapView.hover(null);
    if (MapView.m3) MapView.m3.dispose();
    MapView.m3 = null;
    MapView.failed = null; // a later mount tries again (a load error may have been transient)
    MapView.el = MapView.model = MapView.on = MapView.on0 = null; // don't hold the detached screen
  },
  update(model) {
    model = MapView.routed(model);
    MapView.model = model;
    if (MapView.m3) MapView.m3.update(model);
  },
  select(id) {
    if (MapView.m3) MapView.m3.select(id);
  },
  /** True while your player walks on the map (actions wait for the arrival). */
  busy: () => !!(MapView.m3 && MapView.m3.busy && MapView.m3.busy()),
  /** Fly the camera out over the whole island (a story scene lifting the week-1 fence). */
  overview() {
    if (MapView.m3 && MapView.m3.overview) MapView.m3.overview();
  },
  /** Your walking speed on the map (the speed selector, T-214): ×1 / ×2 / ×4, remembered per browser. */
  WALKS: [1, 2, 4],
  walkK: () => (MapView.WALKS.includes(+store.get(KEYS.walk)) ? +store.get(KEYS.walk) : 1),
  setWalk(k) {
    store.set(KEYS.walk, String(k));
    if (MapView.m3 && MapView.m3.setWalk) MapView.m3.setWalk(k);
  },
  /** Fly the camera to your player (◎ / key C). */
  centre() {
    if (MapView.m3) MapView.m3.centre();
  },
  dispose: () => MapView.drop3D()
};
