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
  /** Street level's camera keys (spec §4.44 Tilt), printed wherever its controls are listed (the F3 overlay at street level). */
  STREET_KEYS:
    'Drag to turn / tilt · <kbd>Q</kbd> / <kbd>E</kbd> turn · <kbd>Z</kbd> / <kbd>X</kbd> (<kbd>PgUp</kbd> / <kbd>PgDn</kbd>) look up / down',
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
      if (!click && same && pos) return; // (a WASD stop within a step of the rules' point: you stay where you stopped)
      return click ? !same && MapView.on0 && MapView.on0.point(p) : MapView.home();
    }
    if (!click) MapView.free = p.slice();
    if (click) mapTravel(p[0], p[1]);
    else mapRoam(p[0], p[1]); // (WASD: no walk to play, the hub redraws once you rest)
    const now = City.pos(RUN),
      moved = now[0] !== pos[0] || now[1] !== pos[1];
    MapView.roamDone(moved); // (spec §4.43: the walk you made counts once — the travel's hours, or idle when refused)
    if (!moved) {
      MapView.free = null;
      if (click && MapView.on0) MapView.on0.point(p);
      else MapView.home();
    }
  },
  /**
   * Street level's streaming (spec §4.37 6, T-364): an automated action (a session, a sleep) is still preparing the blocks round
   * you after STREAM.wait s — a small "Loading…" over the map (on = false: gone). Walking never waits.
   */
  streamWait(on) {
    const el = MapView.el;
    let p = el && el.querySelector('.mapload');
    if (!on) return p && p.remove();
    if (!el || p) return;
    p = document.createElement('div');
    p.className = 'mapload';
    p.setAttribute('role', 'status');
    p.textContent = 'Loading…';
    el.append(p);
  },
  /** Your avatar walks back to where the rules have you (a WASD walk that didn't become a travel) — by the road (City.route). */
  home() {
    const m3 = MapView.m3;
    if (!m3 || !m3.home) return;
    const w = m3.youPos ? m3.youPos() : null,
      at = RUN && City.pos(RUN);
    m3.home(w && at ? City.route([w[0] / MAP_UNIT_M, w[2] / MAP_UNIT_M], at) : null);
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
      canWalk: MapView.canWalk,
      loading: MapView.streamWait
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
    if (box.dataset.k !== `${id}|${t.doing}`) ((box.innerHTML = html), (box.dataset.k = `${id}|${t.doing}`), (box._wh = null));
    if (box.style.display !== 'block') ((box.style.whiteSpace = 'normal'), (box.style.display = 'block'), (box._wh = null));
    if (!box._wh) {
      const b = box.getBoundingClientRect(); // (measured once per content: the pointer's moves only write — no layout per move)
      box._wh = [b.width, b.height];
    }
    box.style.left = `${clamp(x + 14, 8, innerWidth - box._wh[0] - 8)}px`;
    box.style.top = `${Math.max(8, y - box._wh[1] - 12)}px`;
  },
  /** A click / right-click on a named figure: the figure menu (not for someone of a club you haven't scouted; no menu → their card). */
  person(id) {
    const f = MapView.who(id);
    MapView.hover(null);
    if (!f || f.g === 'grey') return;
    figOpen(id);
  },
  /** A named figure's point on the page (client px), or null when it isn't on screen (hidden at home, off the canvas); r: the canvas's box if known (no layout read). */
  figureAt(id, r = null) {
    const s = MapView.m3 && MapView.m3.figureAt ? MapView.m3.figureAt(id) : null,
      c = s && !r && MapView.el && MapView.el.querySelector('canvas');
    if (!s || (!r && !c)) return null;
    r = r || c.getBoundingClientRect();
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
    if (typeof PerfHUD !== 'undefined' && PerfHUD.probe) return 'probe'; // (the perf overlay measures: the clock holds)
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
    if (K.saveAt === null || w < K.saveAt || w - K.saveAt >= CLOCK.save / 24) ((K.saveAt = w), MapView.saveSoon());
    if (K.at === null || w < K.at || Math.floor((w * 24) / CLOCK.save) !== Math.floor((K.at * 24) / CLOCK.save)) {
      K.at = w;
      if (typeof clockRefresh === 'function') clockRefresh();
    }
  },
  /** The running clock's own save (every CLOCK.save game hours): off the frame, when the page is idle (within 1 s; performance). */
  saveSoon() {
    const K = MapView.CLK;
    if (K.saving) return;
    K.saving = true;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0,
      go = d => {
        // (an idle slice too short for the save's usual time: wait for a longer one, within the 1 s)
        if (d && d.timeRemaining && !d.didTimeout && d.timeRemaining() < (K.saveMs || 2) && performance.now() - t0 < 1000)
          return void requestIdleCallback(go, { timeout: Math.max(1, 1000 - (performance.now() - t0)) });
        K.saving = false;
        if (!RUN) return;
        const a = typeof performance !== 'undefined' ? performance.now() : 0;
        Run.save(RUN);
        if (a) K.saveMs = (K.saveMs || 0) * 0.7 + (performance.now() - a) * 0.3;
      };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 1000 });
    else setTimeout(go, 0);
  },
  /** A WASD stop was counted: the roam's hours are the walk's now (refused: tick lets them pass as idle). */
  roamDone(counted) {
    if (counted) MapView.CLK.roam = 0;
  }
};

/**
 * The perf overlay (owner, 2026-10-25; spec §4.39 Performance): F3 on the map and in a match, ⚙ › Perf overlay, the title's Dev tab;
 * off by default, remembered per browser. map3d / r3d call frame(kind, p) each frame while it is on (p = { fps, ms, update, draw,
 * labels, calls, tris, res, scale, px, vrm, blocks, look, ao, shadow, auto? (Auto's ladder step), raw?, secs?, ev?, src? }); the page's rules step (career-map
 * spotFollow) adds rule(ms). Redrawn 4 times a second: the averages, and the worst frame of the last 2 s (a hitch: a save, a rebuild).
 * Measure (owner, 2026-10-26; Shift+F3, Esc cancels): `p.src` = the renderer's probe ({ kind, gl(), items(), start(drv), stop(),
 * ctx() }) — each layer / look feature switched off in turn (probeRun), a report to paste (probeReport). The spike log: a frame
 * > 2× the median or > 50 ms keeps what the frame before it did (p.ev, its JS split) and what ran between (renderCareer,
 * MapModel.build, Run.save: wrapped while the overlay is on). Display only: no rules, no randoms.
 */
const PerfHUD = {
  on: store.get(KEYS.perf) === '1',
  el: null,
  t: 0,
  rules: 0,
  peak: 0, // the worst frame interval (ms) in this window …
  peakR: 0, // … and of rules
  win: 0,
  shown: [0, 0],
  ivs: [], // the last 120 frame intervals (the spike median)
  med: 16.7,
  medN: 0,
  prev: null, // the frame before: { raw, ev }
  evs: [], // the page's work since the last frame (hook)
  spikes: [], // the last SPIKES.keep spikes, newest last
  src: null, // the probe of the renderer drawing now
  kind: 'map',
  probe: null, // the running probe { drv, src, dog }
  status: '',
  text: '', // the last report
  hooked: false,
  opt: null, // dev / QA: { warm, frames, only: [item ids] } for Measure (the UI smoke's short probe)
  restored: null, // the last probe: { ok, off: [what differs from before] }
  SPIKES: { keep: 20, k: 2, abs: 50, n: 120 },
  /** Frame pacing (owner 2026-10-27: "60 fps steady but it stutters"): the last `win` ms of frame intervals (≤ n); a hitch = a frame
   * over k × the median and over abs ms. */
  PACE: { win: 60000, n: 7200, k: 1.5, abs: 25 },
  pq: null, // the pacing ring { a, h, n, sum }
  pc: null, // the last pace() of the ring (1 Hz)
  pt: 0,
  ruleMs: 0, // the page's rules step of the last frame (ms)
  lo: null, // the Long Animation Frames observer ('n/a': none in this browser)
  loaf: [], // the last LoAF summaries (loafOf), newest last
  loafN: 0,
  rows: null, // the overlay's rows { shape, box, b: value cells, v: their last html }
  measured: false, // H.text is a Measure's report (Copy keeps it once; later copies are fresh pacing reports)
  toggle(v = !PerfHUD.on) {
    const H = PerfHUD;
    H.on = !!v;
    store.set(KEYS.perf, H.on ? '1' : '0');
    H.pq = H.pc = null;
    if (!H.on) H.cancel();
    if (!H.on && H.el) (H.el.remove(), (H.el = null));
    H.loafWatch(H.on);
  },
  /** The page's rules step this frame (the running clock, the popups' placement): ms. */
  rule(ms) {
    PerfHUD.rules += (ms - PerfHUD.rules) * 0.1;
    PerfHUD.peakR = Math.max(PerfHUD.peakR, ms);
    PerfHUD.ruleMs = ms;
  },
  /** One frame interval into the pacing ring (no allocation per frame). */
  paceAdd(iv) {
    const H = PerfHUD,
      C = H.PACE,
      P = H.pq || (H.pq = { a: new Float64Array(C.n), h: 0, n: 0, sum: 0 });
    if (!(iv > 0)) return;
    if (P.n === C.n) P.sum -= P.a[P.h];
    else P.n++;
    P.a[P.h] = iv;
    P.sum += iv;
    P.h = (P.h + 1) % C.n;
    while (P.sum > C.win && P.n > 1) ((P.sum -= P.a[(P.h - P.n + C.n) % C.n]), P.n--);
  },
  /** The ring's intervals, oldest first. */
  paceVals() {
    const P = PerfHUD.pq,
      C = PerfHUD.PACE;
    if (!P) return [];
    const o = new Array(P.n);
    for (let i = 0; i < P.n; i++) o[i] = P.a[(P.h - P.n + i + C.n) % C.n];
    return o;
  },
  /**
   * Pacing of frame intervals ivs (ms; pure): nearest-rank p50 / p95 / p99, max, the 1 % low (fps of the mean of the worst 1 % of
   * frames — CapFrameX's "1 % low average"), the frame-time spread (sd), hitches (> k × the median and > abs ms) and their rate a
   * minute of frames. null for no frames.
   */
  pace(ivs, k = PerfHUD.PACE.k, abs = PerfHUD.PACE.abs) {
    const n = ivs.length;
    if (!n) return null;
    const s = Float64Array.from(ivs).sort(),
      q = p => s[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))],
      med = q(0.5),
      w = Math.max(1, Math.ceil(n * 0.01));
    let tot = 0,
      sq = 0,
      worst = 0,
      hit = 0;
    for (const v of ivs) ((tot += v), (sq += v * v), v > k * med && v > abs && hit++);
    for (let i = n - w; i < n; i++) worst += s[i];
    const mean = tot / n;
    return {
      n,
      ms: tot,
      fps: 1000 / mean,
      p50: med,
      p95: q(0.95),
      p99: q(0.99),
      max: s[n - 1],
      low1: 1000 / (worst / w),
      sd: Math.sqrt(Math.max(0, sq / n - mean * mean)),
      hitches: hit,
      perMin: (hit * 60000) / tot
    };
  },
  /** The pacing line (overlay and report). */
  paceText(c, long = false) {
    if (!c) return long ? 'no frames yet' : '–';
    const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
    return long
      ? `${f(c.ms / 1000, 0)} s · ${c.n} frames · ${f(c.fps, 0)} fps · frame ms p50 ${f(c.p50)} / p95 ${f(c.p95)} / p99 ${f(c.p99)} / max ${f(c.max)} · sd ${f(c.sd)} · 1% low ${f(c.low1, 0)} fps · hitches ${c.hitches} (${f(c.perMin)}/min; > ${PerfHUD.PACE.k}× median and > ${PerfHUD.PACE.abs} ms)`
      : `${f(c.p50)} / ${f(c.p95)} / ${f(c.p99)} / ${f(c.max, 0)}`;
  },
  /** Long Animation Frames (Chrome 123+; frames over 50 ms): what ran in them — script, function, style & layout, forced layout. */
  loafWatch(on) {
    const H = PerfHUD;
    if (!on) return void (H.lo && H.lo !== 'n/a' && (H.lo.disconnect(), (H.lo = null)));
    if (H.lo || typeof PerformanceObserver === 'undefined') return;
    try {
      if (!(PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame')) return void (H.lo = 'n/a');
      H.lo = new PerformanceObserver(l => H.loafs(l.getEntries()));
      H.lo.observe({ type: 'long-animation-frame', buffered: false });
    } catch (e) {
      H.lo = 'n/a';
    }
  },
  /** A LoAF entry → { t0, t1, ms, block, style (style + layout ms at the frame's end), forced (scripts' forced style + layout ms), js, top }. */
  loafOf(e) {
    const t1 = e.startTime + e.duration,
      sc = [...(e.scripts || [])].sort((a, b) => b.duration - a.duration);
    let forced = 0,
      js = 0;
    for (const x of sc) ((forced += x.forcedStyleAndLayoutDuration || 0), (js += x.duration || 0));
    return {
      t0: e.startTime,
      t1,
      ms: e.duration,
      block: e.blockingDuration || 0,
      style: e.styleAndLayoutStart ? Math.max(0, t1 - e.styleAndLayoutStart) : 0,
      forced,
      js,
      top: sc.slice(0, 2).map(x => {
        const u = String(x.sourceURL || '')
          .split('/')
          .pop()
          .split('?')[0];
        return `${x.sourceFunctionName || x.invoker || '?'}${u ? ` (${u})` : ''} ${(x.duration || 0).toFixed(0)}${x.forcedStyleAndLayoutDuration > 0.5 ? ` forced ${x.forcedStyleAndLayoutDuration.toFixed(1)}` : ''}`;
      })
    };
  },
  loafText: L =>
    `LoAF ${L.ms.toFixed(0)} ms: JS ${L.js.toFixed(1)} · style+layout ${L.style.toFixed(1)}${L.forced > 0.05 ? ` · forced ${L.forced.toFixed(1)}` : ''}${L.top.length ? ` · ${L.top.join(', ')}` : ''}`,
  /** New LoAF entries: kept (last 20) and given to the spike whose frame they overlap. */
  loafs(es) {
    const H = PerfHUD;
    for (const e of es) {
      const L = H.loafOf(e);
      H.loafN++;
      H.loaf.push(L);
      if (H.loaf.length > 20) H.loaf.shift();
      for (let i = H.spikes.length - 1; i >= Math.max(0, H.spikes.length - 4); i--) {
        const s = H.spikes[i];
        if (!s.lf && s.at && L.t0 < s.at[1] && L.t1 > s.at[0]) s.lf = H.loafText(L);
      }
    }
  },
  /** Something the page did between two frames (a render, a save): kept for the next frame's spike record. */
  note(s) {
    if (PerfHUD.evs.length < 30) PerfHUD.evs.push(s);
  },
  /** While the overlay is on, the page's big steps note their time (wrapped once; the wrapper passes through when off). */
  hook() {
    const H = PerfHUD,
      g = typeof globalThis !== 'undefined' ? globalThis : null;
    if (H.hooked || !g) return;
    H.hooked = true;
    const wrap = (o, k, tag) => {
      const f = o && o[k];
      if (typeof f !== 'function' || f.__perf) return;
      const w = function (...a) {
        if (!H.on) return f.apply(this, a);
        const t0 = performance.now();
        try {
          return f.apply(this, a);
        } finally {
          H.note(`${tag} ${(performance.now() - t0).toFixed(1)} ms`);
        }
      };
      w.__perf = true;
      o[k] = w;
    };
    try {
      wrap(g, 'renderCareer', 'renderCareer');
      if (typeof MapModel !== 'undefined') wrap(MapModel, 'build', 'MapModel.build');
      if (typeof Run !== 'undefined') wrap(Run, 'save', 'save');
    } catch (e) {
      /* (a read-only binding: no hook) */
    }
  },
  /** Spikes (always while the overlay is on): a frame interval > k × the median or > abs ms; the frame before it is the cause. */
  spike(kind, p) {
    const H = PerfHUD,
      S = H.SPIKES,
      iv = p.last || 0;
    if (iv > 0) {
      H.ivs.push(iv);
      if (H.ivs.length > S.n) H.ivs.shift();
      if (++H.medN >= 30 || H.ivs.length < 30) ((H.medN = 0), (H.med = PerfHUD.median(H.ivs)));
    }
    const was = H.prev,
      now = performance.now();
    H.prev = { raw: p.raw || null, ev: p.ev || [], ui: H.ruleMs };
    if (!was || H.probe || H.ivs.length < 10 || !(iv > S.abs || iv > S.k * H.med)) return void (H.evs = []);
    const r = was.raw,
      js = r ? r.update + r.draw + (r.labels || 0) + (was.ui || 0) : null,
      ev = [...was.ev, ...H.evs];
    if (!ev.length && js !== null && js < iv * 0.3) ev.push('gap: little JS in the frame (GC / browser / GPU stall)');
    H.evs = [];
    const sp = { t: now / 1000, kind, ms: iv, med: H.med, js: r && { ...r, ui: was.ui || 0 }, ev, at: [now - iv - 4, now] },
      L = H.loaf.find(x => x.t0 < sp.at[1] && x.t1 > sp.at[0]);
    if (L) sp.lf = H.loafText(L);
    H.spikes.push(sp);
    if (H.spikes.length > S.keep) H.spikes.shift();
  },
  frame(kind, p) {
    const now = performance.now(),
      H = PerfHUD;
    H.peak = Math.max(H.peak, p.last || 0);
    H.kind = kind;
    if (p.src) H.src = p.src;
    if (!H.hooked) H.hook();
    if (!H.lo) H.loafWatch(true);
    H.spike(kind, p);
    if (!H.probe) H.paceAdd(p.last || 0);
    if (now - H.pt >= 1000) ((H.pt = now), (H.pc = H.pace(H.paceVals())));
    if (now - H.t < 250) return;
    H.t = now;
    H.last = { kind, p, rules: H.rules };
    if (now - H.win > 2000) ((H.win = now), (H.shown = [H.peak, H.peakR]), (H.peak = H.peakR = 0));
    let el = H.el;
    if (!el || !el.isConnected) {
      el = H.el = document.createElement('div');
      el.className = 'perfhud';
      el.innerHTML = `<div class="phs" aria-hidden="true"></div><div class="phx">
        <div class="phb"><button class="btn" data-a="m" onclick="PerfHUD.measure()">Measure <kbd>⇧F3</kbd></button><button class="btn" data-a="c" onclick="PerfHUD.copy()" disabled>Copy report</button></div>
        <div class="phst small"></div><textarea class="phr" readonly hidden spellcheck="false" aria-label="Perf report"></textarea></div>`;
      document.body.append(el);
      H.rows = null;
      H.paint();
    }
    const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–'),
      k = v => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v | 0)),
      slow = p.fps < 30 ? 'bad' : p.fps < 50 ? 'warn' : '',
      js = (kind === 'map' ? H.rules : 0) + p.update + p.draw + (p.labels || 0),
      c = H.pc,
      R = [
        ['', `${kind === 'map' ? 'Map' : 'Match'} · ${esc(String(p.look || G.gfx))} <kbd>F3</kbd>`],
        ['fps', `<i class="${slow}">${f(p.fps, 0)}</i> · ${f(p.ms)} ms · worst ${f(H.shown[0], 0)}`],
        ['p50/95/99/max', `${H.paceText(c)} ms`],
        [
          '1% low',
          c ? `<i class="${c.perMin >= 6 ? 'bad' : c.perMin > 0 ? 'warn' : ''}">${f(c.low1, 0)} fps · ${f(c.perMin)} hitches/min</i>` : '–'
        ],
        [
          'JS ms',
          `${f(js)} = ${kind === 'map' ? `rules ${f(H.rules, 2)} · ` : ''}${kind === 'map' ? 'map' : 'update'} ${f(p.update)} · draw ${f(p.draw)}${kind === 'map' ? ` · tags ${f(p.labels, 2)}` : ''}`
        ],
        kind === 'map' ? ['rules worst', `${f(H.shown[1])} ms`] : null,
        ['draws', `${p.calls} · ${k(p.tris)} tris`],
        [
          'scale',
          `${f(p.scale, 2)} · ${p.px ? p.px.join('×') : '–'}${p.ao !== undefined ? ` · AO ${p.ao ? 'on' : 'off'}` : ''}${p.shadow ? ` · sh ${p.shadow}` : ''}`
        ],
        p.auto ? ['Auto', esc(String(p.auto))] : null,
        ['VRMs', `${p.vrm}${p.blocks !== null && p.blocks !== undefined ? ` · blocks ${p.blocks}` : ''}`],
        ['spikes', `${H.spikes.length} · median ${f(H.med)} ms${H.lo === 'n/a' ? '' : ` · LoAF ${H.loafN}`}`],
        kind === 'map' && MapView.street() > 0.5 ? ['camera', MapView.STREET_KEYS] : null // (street level's camera keys, spec §4.44 Tilt)
      ].filter(Boolean),
      shape = R.map(r => r[0]).join('|');
    // (the rows are built once per shape; each 4 Hz redraw only rewrites the values that changed: no layout of the rest)
    if (!H.rows || H.rows.shape !== shape || !H.rows.box.isConnected) {
      el.firstChild.innerHTML = R.map(([a], i) => (i ? `<div><span>${a}</span><b></b></div>` : '<div class="ph"></div>')).join('');
      H.rows = { shape, box: el.firstChild, b: [...el.firstChild.children].map((d, i) => (i ? d.lastChild : d)), v: [] };
    }
    R.forEach(([, v], i) => H.rows.v[i] !== v && ((H.rows.b[i].innerHTML = v), (H.rows.v[i] = v)));
    if (H.probe) H.paint();
  },
  /** The Measure panel's state: the status line, the buttons, the report. */
  paint() {
    const el = PerfHUD.el,
      H = PerfHUD;
    if (!el) return;
    const st = el.querySelector('.phst'),
      ta = el.querySelector('.phr'),
      m = el.querySelector('[data-a="m"]'),
      c = el.querySelector('[data-a="c"]');
    if (st) st.textContent = H.status;
    if (m) m.disabled = !!H.probe;
    if (c) c.disabled = !!H.probe;
    if (ta && ta.value !== H.text) ((ta.value = H.text), (ta.hidden = !H.text));
  },
  /** Run the probe on the renderer drawing now (o: { warm, frames } for tests). */
  measure(o = {}) {
    const H = PerfHUD;
    if (!H.on) H.toggle(true);
    if (H.probe) return false;
    const src = H.src;
    if (!src || !src.items) return ((H.status = 'Nothing to measure: open the map or a match first.'), H.paint(), false);
    let items;
    try {
      items = src.items();
      if (H.opt && H.opt.only) items = items.filter(it => H.opt.only.includes(it.id)); // (QA: a subset)
    } catch (e) {
      return ((H.status = `Measure failed: ${e.message}`), H.paint(), false);
    }
    const gl = src.gl && src.gl(),
      gpu = PerfHUD.gpuTimer(gl),
      ctx0 = H.ctx(src),
      s0 = src.state ? src.state() : null,
      js0 = H.last ? { ...H.last } : null;
    const drv = PerfHUD.probeRun(items, {
      warm: o.warm ?? (H.opt && H.opt.warm) ?? 6,
      frames: o.frames ?? (H.opt && H.opt.frames) ?? 24,
      gpu,
      step: (i, n, label, base) => ((H.status = `Measuring ${i} / ${n}: ${base ? label : `${label} off`} · Esc cancels`), void 0),
      done: D => {
        const P = H.probe;
        H.probe = null;
        if (P) (clearInterval(P.dog), src.stop());
        const s1 = src.state ? src.state() : null,
          off = s0 && s1 ? Object.keys(s0).filter(k => s0[k] !== s1[k]) : [];
        H.restored = { ok: !off.length, off };
        const rs = off.length ? `NOT restored: ${off.join(', ')}` : 'everything restored';
        if (D.aborted) H.status = `Measure cancelled${D.why ? ` (${D.why})` : ''}; ${rs}.`;
        else {
          H.text = PerfHUD.probeReport({
            ctx: ctx0,
            gpu: gpu && gpu.name,
            res: PerfHUD.probeResult(D),
            js: js0,
            spikes: H.spikes,
            restored: rs,
            pace: H.pc,
            loaf: H.loafSum()
          });
          H.measured = true;
          H.status = `Done; ${rs}. Copy the report and paste it.`;
        }
        H.paint();
      }
    });
    H.probe = { drv, src, seen: performance.now(), n: 0 };
    drv.watch = () => (H.probe && (H.probe.seen = performance.now()), void 0);
    // (no frame for 3 s — the map left, the match ended: give up and restore)
    H.probe.dog = setInterval(() => {
      if (H.probe && performance.now() - H.probe.seen > 3000) H.cancel('no frames');
    }, 500);
    H.status = 'Measuring… Esc cancels';
    src.start(drv);
    H.paint();
    return true;
  },
  cancel(why) {
    const P = PerfHUD.probe;
    if (P) P.drv.abort(why);
  },
  /** Copy the report; the clipboard may be blocked (the artifact host): then the text is selected for Ctrl+C. */
  copy() {
    const H = PerfHUD,
      ta = H.el && H.el.querySelector('.phr');
    if (!H.text || !H.measured) H.text = H.report(); // (no Measure yet: the pacing, the spikes and the context)
    H.measured = false;
    H.paint();
    if (!H.text) return;
    const sel = () => ta && (ta.focus(), ta.select(), (H.status = 'Selected: press Ctrl+C to copy.'), H.paint());
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText(H.text);
      if (!p) return sel();
      p.then(() => ((H.status = 'Copied to the clipboard.'), H.paint()), sel);
    } catch (e) {
      sel();
    }
  },
  /** The report without a Measure (Copy any time): context, pacing, LoAF, JS split, spikes. */
  report() {
    const H = PerfHUD;
    return PerfHUD.probeReport({
      ctx: H.src ? H.ctx(H.src) : { kind: H.kind },
      res: null,
      js: H.last ? { ...H.last } : null,
      spikes: H.spikes,
      pace: H.pc || H.pace(H.paceVals()),
      loaf: H.loafSum()
    });
  },
  /** The kept LoAF entries summed: { n (since on), kept, ms, style, forced, top: [[script, ms]] } — or 'n/a'. */
  loafSum() {
    const H = PerfHUD;
    if (H.lo === 'n/a' || !H.lo) return H.lo === 'n/a' ? 'n/a' : null;
    const top = {},
      S = { n: H.loafN, kept: H.loaf.length, ms: 0, style: 0, forced: 0, top: [] };
    for (const L of H.loaf) {
      S.ms += L.ms;
      S.style += L.style;
      S.forced += L.forced;
      for (const t of L.top) {
        const m = /^(.*) (\d+)(?: forced [\d.]+)?$/.exec(t);
        if (m) top[m[1]] = (top[m[1]] || 0) + +m[2];
      }
    }
    S.top = Object.entries(top)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return S;
  },
  /** The report's context: device, canvas, look, view, place, time of day (the renderer's ctx() + the page's). */
  ctx(src) {
    const c = { kind: src.kind };
    try {
      Object.assign(c, src.ctx ? src.ctx() : {});
    } catch (e) {
      /* (a partial context) */
    }
    const gl = src.gl && src.gl();
    try {
      const x = gl && gl.getExtension('WEBGL_debug_renderer_info');
      c.gpu = gl ? String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '–';
    } catch (e) {
      c.gpu = '–';
    }
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '',
      b = ua.match(/(Firefox|Edg|OPR|Chrome|Version)\/(\d+)/);
    c.browser = b ? `${{ Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[b[1]] || b[1]} ${b[2]}` : ua.slice(0, 40);
    c.os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
    c.dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
    c.gfx = typeof G !== 'undefined' && G ? G.gfx : '';
    return c;
  },
  median(a) {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y),
      m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  },
  /** EXT_disjoint_timer_query_webgl2 (null without it): begin() / end() round the draw, read(q) → ms | undefined (not yet) | null (lost). */
  gpuTimer(gl) {
    let x = null;
    try {
      x =
        gl &&
        typeof WebGL2RenderingContext !== 'undefined' &&
        gl instanceof WebGL2RenderingContext &&
        gl.getExtension('EXT_disjoint_timer_query_webgl2');
    } catch (e) {
      x = null;
    }
    if (!x) return null;
    let open = null;
    return {
      name: 'GPU timer queries',
      begin() {
        if (open) return null;
        open = gl.createQuery();
        gl.beginQuery(x.TIME_ELAPSED_EXT, open);
        return open;
      },
      end() {
        if (!open) return;
        gl.endQuery(x.TIME_ELAPSED_EXT);
        open = null;
      },
      read(q) {
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return undefined;
        const lost = gl.getParameter(x.GPU_DISJOINT_EXT),
          ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
        gl.deleteQuery(q);
        return lost ? null : ns / 1e6;
      },
      drop: q => gl.deleteQuery(q)
    };
  },
  /**
   * The probe's sequencer (pure; the renderer calls it round its draw): items = [{ id, label, group ('layer' | 'look'), can?() → true
   * | a reason it is n/a, mask?() → undo (switched off for one draw, undone right after it), hold?() → undo (switched off for the
   * whole configuration: a resolution, a shadow map) }]. Configurations: everything on, each item off in turn, everything on again;
   * each `warm` frames dropped, then `frames` samples ({ draw, js, calls, tris }). Per frame: pre() before the draw, mid() right after
   * it (the masks undone, the GPU query closed), post(sample). abort() undoes whatever is on; done(D) once, D.aborted when cut.
   */
  probeRun(items, o = {}) {
    const warm = o.warm ?? 6,
      frames = Math.max(1, o.frames ?? 24),
      gpu = o.gpu || null,
      na = [],
      cfg = [{ id: 'base', label: 'everything on', s: [], g: [] }];
    for (const it of items) {
      let ok = true;
      try {
        ok = it.can ? it.can() : true;
      } catch (e) {
        ok = e.message;
      }
      if (ok === true) cfg.push({ id: it.id, label: it.label, group: it.group, item: it, s: [], g: [] });
      else na.push({ id: it.id, label: it.label, group: it.group, why: typeof ok === 'string' ? ok : 'not drawn now' });
    }
    cfg.push({ id: 'base2', label: 'everything on (again)', s: [], g: [] });
    let ci = 0,
      n = 0,
      holdU = null,
      q = null,
      drain = 0;
    const frameU = [],
      pending = [];
    const undoFrame = () => {
      while (frameU.length) frameU.pop()();
    };
    const undoHold = () => {
      const u = holdU;
      holdU = null;
      if (u) u();
    };
    const D = {
      cfg,
      na,
      warm,
      frames,
      done: false,
      aborted: false,
      why: '',
      watch: null,
      /** Before the draw: this configuration's item off. */
      pre() {
        if (D.done || ci >= cfg.length) return;
        const c = cfg[ci];
        if (n === 0 && o.step) o.step(ci + 1, cfg.length, c.label, !c.item);
        if (n === 0 && c.item && c.item.hold && !holdU) holdU = c.item.hold() || null;
        if (c.item && c.item.mask) {
          const u = c.item.mask();
          if (u) frameU.push(u);
        }
        if (gpu && n >= warm) q = gpu.begin();
      },
      /** Right after the draw (before the GPU sync read): the masks undone, the query closed. */
      mid() {
        if (q) (gpu.end(), pending.push([q, ci]), (q = null));
        undoFrame();
      },
      /** The frame's numbers: { draw (ms, the draw and a GPU sync), js (ms before the draw), calls, tris }. */
      post(s) {
        if (D.watch) D.watch();
        if (D.done) return;
        if (gpu)
          for (let i = pending.length - 1; i >= 0; i--) {
            const v = gpu.read(pending[i][0]);
            if (v === undefined) continue;
            if (v !== null) cfg[pending[i][1]].g.push(v);
            pending.splice(i, 1);
          }
        if (ci >= cfg.length) {
          if (!pending.length || ++drain > 30) finish(false);
          return;
        }
        if (n >= warm && s) cfg[ci].s.push(s);
        if (++n >= warm + frames) (undoHold(), ci++, (n = 0));
        if (ci >= cfg.length && !pending.length) finish(false);
      },
      abort(why) {
        if (D.done) return;
        if (q) (gpu.end(), (q = null));
        undoFrame();
        undoHold();
        D.why = why || '';
        finish(true);
      },
      get at() {
        return ci;
      }
    };
    const finish = cut => {
      if (D.done) return;
      D.done = true;
      D.aborted = !!cut;
      undoFrame();
      undoHold();
      if (gpu) for (const [p] of pending.splice(0)) gpu.drop(p);
      if (o.done) o.done(D);
    };
    return D;
  },
  /** The probe's numbers: the baseline (both everything-on runs), each item's saving (ms, % of the frame, calls, tris), ranked. */
  probeResult(D) {
    const M = PerfHUD.median,
      stat = c => ({
        draw: M(c.s.map(s => s.draw)),
        js: M(c.s.map(s => s.js)),
        calls: M(c.s.map(s => s.calls)),
        tris: M(c.s.map(s => s.tris)),
        gpu: c.g.length ? M(c.g) : NaN,
        n: c.s.length
      }),
      b1 = D.cfg.find(c => c.id === 'base'),
      b2 = D.cfg.find(c => c.id === 'base2'),
      both = { s: [...b1.s, ...b2.s], g: [...b1.g, ...b2.g] },
      base = stat(both),
      rows = D.cfg.filter(c => c.item).map(c => ({ id: c.id, label: c.label, group: c.group, ...stat(c) })),
      useG = Number.isFinite(base.gpu) && rows.every(r => Number.isFinite(r.gpu)),
      key = useG ? 'gpu' : 'draw',
      frame = base.js + base.draw;
    for (const r of rows) {
      r.save = base[key] - r[key];
      r.pct = frame > 0 ? (100 * r.save) / frame : 0;
      r.dCalls = base.calls - r.calls;
      r.dTris = base.tris - r.tris;
    }
    rows.sort((a, b) => b.save - a.save);
    return { key, base, b1: stat(b1), b2: stat(b2), frame, rows, na: D.na, warm: D.warm, frames: D.frames };
  },
  /** The plain-text report to paste (compact; one line per item). */
  probeReport({ ctx = {}, gpu = null, res = null, js = null, spikes = [], restored = '', at = new Date(), pace = null, loaf = null }) {
    const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–'),
      k = v =>
        !Number.isFinite(v)
          ? '–'
          : Math.abs(v) >= 1e6
            ? `${(v / 1e6).toFixed(2)}M`
            : Math.abs(v) >= 1e3
              ? `${(v / 1e3).toFixed(1)}k`
              : String(Math.round(v)),
      sg = (v, s) => (v > 0 ? `-${s(v)}` : v < 0 ? `+${s(-v)}` : '0'),
      pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length)),
      lpad = (s, n) => (s.length >= n ? s : ' '.repeat(n - s.length) + s),
      B = res && res.base,
      L = [],
      C = ctx;
    const stamp = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    L.push(`Spite & Spike perf report · ${stamp} · ${C.kind === 'match' ? 'match' : 'map'}`);
    L.push(`device   ${C.gpu || '–'} · ${C.browser || '–'}${C.os ? ` · ${C.os}` : ''}`);
    L.push(
      `canvas   ${C.css ? C.css.join('×') : '–'} css · ${C.px ? C.px.join('×') : '–'} px · dpr ${f(C.dpr, 2)} · scale ${f(C.scale, 2)}${C.res !== undefined ? ` (dyn ${f(C.res, 2)})` : ''} · ${C.look || C.gfx || '–'}${C.auto ? ` · ${C.auto}` : ''}`
    );
    L.push(`view     ${C.view || '–'}${C.place ? ` · ${C.place}` : ''}${C.time ? ` · ${C.time}` : ''}${C.extra ? ` · ${C.extra}` : ''}`);
    L.push(`pacing   ${PerfHUD.paceText(pace, true)}`);
    if (loaf)
      L.push(
        loaf === 'n/a'
          ? 'LoAF     n/a (no Long Animation Frames API in this browser)'
          : `LoAF     ${loaf.n} frames > 50 ms since on · last ${loaf.kept}: ${f(loaf.ms, 0)} ms, style+layout ${f(loaf.style)} ms, forced ${f(loaf.forced)} ms${loaf.top.length ? ` · top ${loaf.top.map(([k2, v]) => `${k2} ${v}`).join(' · ')}` : ''}`
      );
    if (res) {
      L.push(
        `probe    ${res.rows.length + 2} configs × ${res.frames} frames (first ${res.warm} dropped) · ${res.key === 'gpu' ? `GPU ms (${gpu})` : 'draw + GPU sync ms (no GPU timer)'}${restored ? ` · ${restored}` : ''}`
      );
      const drift = res.b1.draw > 0 ? (100 * (res.b2.draw - res.b1.draw)) / res.b1.draw : 0;
      L.push(
        `base     frame ${f(res.frame)} ms = JS ${f(B.js)} + draw ${f(B.draw)}${Number.isFinite(B.gpu) ? ` (GPU ${f(B.gpu)})` : ''} · ${k(B.calls)} calls · ${k(B.tris)} tris · re-run drift ${drift >= 0 ? '+' : ''}${f(drift, 0)}%`
      );
      L.push('costs    (what switching it off saves, ms and % of the frame, ranked; + = off costs more; calls / tris − = fewer)');
      res.rows.forEach((r, i) =>
        L.push(
          ` ${lpad(String(i + 1), 2)} ${pad(r.label, 34)} ${lpad(`${r.save >= 0 ? '' : '+'}${f(Math.abs(r.save), 2)} ms`, 9)} ${lpad(`${r.save >= 0 ? '' : '+'}${f(Math.abs(r.pct), 0)}%`, 5)} ${lpad(sg(r.dCalls, k), 6)} calls ${lpad(sg(r.dTris, k), 7)} tris`
        )
      );
      if (res.na.length) L.push(`n/a      ${res.na.map(r => `${r.label} (${r.why})`).join(' · ')}`);
    }
    if (js && js.p) {
      const p = js.p;
      L.push(
        `JS/frame ${js.kind === 'map' ? `rules ${f(js.rules, 2)} · map ${f(p.update, 2)}` : `update ${f(p.update, 2)}`} · draw ${f(p.draw, 2)}${js.kind === 'map' ? ` · tags ${f(p.labels, 2)}` : ''} (ms, average)`
      );
      if (p.secs) {
        const top = Object.entries(p.secs)
          .filter(([, v]) => v >= 0.01)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8);
        if (top.length) L.push(`hot JS   ${top.map(([n, v]) => `${n} ${f(v, 2)}`).join(' · ')}`);
      }
    }
    L.push(
      `spikes   ${spikes.length ? `last ${spikes.length} (newest first): s · frame ms / median · what ran` : 'none recorded (a frame > 2× the median or > 50 ms)'}`
    );
    for (const s of [...spikes].reverse())
      L.push(
        ` ${lpad(f(s.t, 1), 7)}s ${lpad(f(s.ms, 0), 4)} / ${f(s.med, 0)}${s.kind === 'match' ? ' match' : ''}${s.js ? ` · JS ${f(s.js.update + s.js.draw + (s.js.labels || 0))}${s.js.ui > 0.5 ? ` (ui ${f(s.js.ui)})` : ''}` : ''} · ${s.ev.length ? s.ev.join(' · ') : '–'}${s.lf ? ` · ${s.lf}` : ''}`
      );
    return L.join('\n');
  }
};
if (typeof addEventListener === 'function')
  addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && PerfHUD.probe) return void (e.preventDefault(), e.stopPropagation(), PerfHUD.cancel('Esc'));
      if (e.key !== 'F3' || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); // (the browser's find-next)
      if (e.shiftKey) return void PerfHUD.measure();
      PerfHUD.toggle();
      if (typeof renderCareer === 'function' && CW && CW.gear) renderCareer();
    },
    true
  );
