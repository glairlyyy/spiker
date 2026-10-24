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
// Street level (spec §4.37 6, T-336a; every district since T-361): MapView adds `street` to the model ({ all: true }: street
// level anywhere on land) and walk(p) / canWalk() to the callbacks. At street level a click on the ground
// is a travel there (mapTravel — the same rules as the point card's Walk; refused → the point card says why); WASD walks you freely
// and walk(p) resolves where you stopped the same way (only if it changed point; refused → your avatar walks back).
// The running clock (spec §4.43, T-365 — its own section at the end): MapView drives the rules' clock in real time (`tick`, from the
// page's frame loop): a game hour = CLOCK.scale s at ×1, Space pauses (`pause`), ×1 / ×2 / ×4 (`setWalk`, the old walk speeds); it
// runs only while the map is up and nothing modal is open (`stopped`). Idle hours pass by City.idle; a walk / a ride plays in real time
// (its hours were counted when it began); a session's fast-forward (the 'ff' lock, career-map.js ffStep) runs on it; now() = the week
// time the map shows (map3d setNow). While WASD moves you the rules wait (the stop counts the walk) and now() runs on (`roam`).

const MapView = {
  m3: null, // the live 3D renderer
  loading: false,
  failed: null, // the load error text, if the module or WebGL failed
  el: null,
  model: null,
  on: null,
  on0: null, // the callbacks as the UI gave them (pick, point)
  last: null, // the you.at last passed on (the road a trip follows starts there)
  lastIn: null, // that model's you.inside (the walk in from its door, display: you walk back out of it on the next trip)
  free: null, // a WASD stop being resolved: the travel goes straight there (you already stand on it)
  /** Where street level opens: every district (spec §4.37 6 Phase 3, T-361) — all the land (mapcam3d zoneOf). */
  ZONE: Object.freeze({ all: true }),
  zone: () => MapView.ZONE,
  /**
   * The model with you.route = the road path from the last shown position to you.at when that changed (the renderer reads only the
   * model); you.exit = the walk out of the place you stood inside (its door, MapModel.inside), when you did.
   */
  routed(model) {
    model = model.street ? model : { ...model, street: MapView.zone() };
    const at = model.you && model.you.at;
    if (!at) return model;
    const from = MapView.last,
      out = MapView.lastIn, // the place you leave: walk out of its door first (arriving inside, spec §4.40)
      free = MapView.free;
    MapView.last = at.slice();
    MapView.lastIn = model.you.inside || null;
    MapView.free = null;
    if (!from || (from[0] === at[0] && from[1] === at[1])) return model;
    if (free && free[0] === at[0] && free[1] === at[1]) return { ...model, you: { ...model.you, route: [from, at] } }; // (WASD: you are there)
    const exit = out ? out.slice(0, -1).reverse() : null; // out of the door(s) you stood inside: back from the spot to the door outside
    return { ...model, you: { ...model.you, route: City.route(from, at), exit } };
  },
  /** How far down the camera is (0 = the map, 1 = street level). */
  street: () => (MapView.m3 && MapView.m3.street ? MapView.m3.street() : 0),
  /** You may walk at street level now: no lock, event, open figure menu, sheet or match (the hub's input rules). */
  canWalk() {
    if (!RUN || RUN.event || A) return false;
    if (CW.lock || CW.fig || CW.sheet) return false;
    return !document.querySelector('.hubmodal');
  },
  /**
   * A travel from street level to map point p: a click (click = true; refused → the point card, which says why) or a WASD stop
   * (refused or the same point → your avatar walks back to where the rules have you).
   */
  walk(p, click = false) {
    const pos = RUN ? City.pos(RUN) : null,
      same = pos && Math.hypot(p[0] - pos[0], p[1] - pos[1]) < 3;
    if (!pos || same || !MapView.canWalk()) {
      MapView.roamDone(false);
      return click ? !same && MapView.on0 && MapView.on0.point(p) : MapView.home();
    }
    if (!click) MapView.free = p.slice();
    mapTravel(p[0], p[1]);
    const now = City.pos(RUN),
      moved = now[0] !== pos[0] || now[1] !== pos[1];
    MapView.roamDone(moved); // (spec §4.43: the walk you made counts once — the travel's hours, or idle when refused)
    if (!moved) {
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
        if (MapView.m3.setWalk) MapView.m3.setWalk(MapView.CLK.on);
        MapView.prep(MapView.m3);
        MapView.m3.mount(MapView.el, MapView.model, MapView.on);
        // street level survives a release (a screen over the map for a while, e.g. a day's scene): the camera comes back down
        const K = MapView.kept;
        MapView.kept = null;
        if (K && K.street > 0 && Date.now() - K.t < 120000 && MapView.m3.restore) MapView.m3.restore(K);
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
    if (m3.setNow) m3.setNow(MapView.now);
    if (m3.setLow) m3.setLow(G.gfx === 'fast');
  },
  /** The part of the day the UI is playing (see the header): 'idle' | 'walk' | 'order'. */
  phase() {
    const L = CW.lock;
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
    const t = id !== null && id !== undefined && RUN ? MapView.tipOf(RUN, id, going) : null;
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
    box.style.left = `${clamp(x + 14, 8, innerWidth - b.width - 8)}px`;
    box.style.top = `${Math.max(8, y - b.height - 12)}px`;
  },
  /** A click / right-click on a named figure: the figure menu (not for someone of a club you haven't scouted; no menu → their card). */
  person(id) {
    const f = MapView.who(id);
    MapView.hover(null);
    if (!f || f.g === 'grey') return;
    figOpen(id);
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
    if (MapView.m3 && MapView.m3.viewState) MapView.kept = { ...MapView.m3.viewState(), t: Date.now() };
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
  /** The time speed on the map (spec §4.43; the old walk speeds, T-214): ×1 / ×2 / ×4, remembered per browser. */
  WALKS: CLOCK.speeds,
  walkK: () => (MapView.WALKS.includes(+store.get(KEYS.walk)) ? +store.get(KEYS.walk) : 1),
  setWalk(k) {
    store.set(KEYS.walk, String(k));
    MapView.CLK.paused = false;
    MapView.tick(true);
  },
  /** Fly the camera to your player (◎ / key C). */
  centre() {
    if (MapView.m3) MapView.m3.centre();
  },
  dispose: () => MapView.drop3D(),

  // ---- the running clock (spec §4.43, T-365) ------------------------------------------------------------------------------
  /** t: the last tick (ms); on: the speed the map runs at now (0 = stopped); paused: Space; roam: hours walked by WASD not yet counted; at: the rules' hour at the last refresh / save. */
  CLK: { t: 0, on: 0, paused: false, roam: 0, at: null, saveAt: null, hold: false }, // hold: dev / QA — idle hours don't pass (walks and fast-forwards still play)
  /** Why the clock stands still ('' = it runs): paused, no run / map, a match, an event, a sheet, a menu, a scene, a card over the map, the week spent. */
  stopped() {
    const L = CW.lock;
    if (MapView.CLK.paused) return 'paused';
    if (!RUN || A || typeof document === 'undefined' || !document.querySelector('.career.hub')) return 'off';
    if (RUN.event || CW.sheet || CW.fig || CW.gear || Story.step(RUN) || document.querySelector('.hubmodal')) return 'modal';
    if (L && L.phase !== 'walk' && L.phase !== 'ff') return 'modal'; // (a greeting, an encounter's card, a result: it waits for you)
    if (City.night(RUN)) return 'night';
    return '';
  },
  /** Space: pause / run the clock. */
  pause(v = !MapView.CLK.paused) {
    MapView.CLK.paused = !!v;
    MapView.tick(true);
    if (typeof clockShow === 'function') clockShow();
  },
  /** The week time the map shows now (days): the rules' clock + a fast-forward's hours so far + WASD hours not yet counted. */
  now() {
    if (!RUN) return null;
    const L = CW.lock,
      ff = L && L.phase === 'ff' && L.ff ? L.ff.done : 0;
    return City.wt(RUN) + (ff + MapView.CLK.roam) / 24;
  },
  /** WASD moves your figure (map3d: driving) — the rules wait for the stop. */
  roaming: () => !!(MapView.m3 && MapView.m3.driving && MapView.m3.driving()),
  /**
   * One step of the running clock (the page's frame loop; `now` = only re-read the speed): real seconds × the speed ÷ CLOCK.scale
   * game hours — a fast-forward's (ffStep, × CLOCK.ff × scale), WASD's (roam), else idle (City.idle: the 02:00 nod and the match hold
   * are the rules'). Saves every CLOCK.save game hours; refreshes the rail and the open card every CLOCK.save (clockRefresh).
   */
  tick(now = false) {
    const K = MapView.CLK,
      t = typeof performance !== 'undefined' ? performance.now() : Date.now(),
      dt = K.t ? Math.min(0.25, (t - K.t) / 1000) : 0,
      why = MapView.stopped(),
      k = why ? 0 : MapView.walkK();
    K.t = t;
    if (k !== K.on || now) {
      K.on = k;
      if (MapView.m3 && MapView.m3.setWalk) MapView.m3.setWalk(k);
    }
    if (now || !k || !dt || !RUN) return;
    const L = CW.lock;
    let h = (dt * k) / CLOCK.scale;
    if (L && L.phase === 'ff') return ffStep(dt * k * CLOCK.ff);
    if (L) return; // (a walk / a ride: its hours were counted when it began; the map plays them)
    if (K.hold) return void (K.roam = 0);
    if (MapView.roaming()) return void (K.roam += h);
    if (K.roam) ((h += K.roam), (K.roam = 0)); // (a WASD walk no stop counted: its time passes as idle)
    const r = City.idle(RUN, h);
    if (r.line) {
      Run.log(RUN, r.line);
      Run.save(RUN);
      K.at = K.saveAt = City.wt(RUN);
      return renderCareer();
    }
    const w = City.wt(RUN);
    if (K.saveAt === null || w < K.saveAt || w - K.saveAt >= CLOCK.save / 24) ((K.saveAt = w), Run.save(RUN));
    if (K.at === null || w < K.at || Math.floor((w * 24) / CLOCK.save) !== Math.floor((K.at * 24) / CLOCK.save)) {
      K.at = w;
      if (typeof clockRefresh === 'function') clockRefresh();
    }
  },
  /** A WASD stop was counted: the roam's hours are the walk's now (refused: tick lets them pass as idle). */
  roamDone(counted) {
    if (counted) MapView.CLK.roam = 0;
  }
};
