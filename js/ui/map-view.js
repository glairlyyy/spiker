// MapView: the island map renderer the game talks to — the three.js map (js/map3d/map3d.mjs), lazy-loaded once.
//   MapView.mount(el, model, { pick(id), point([x, y]) })   MapView.update(model) (adds you.route on a move)   MapView.select(id)   MapView.dispose()
// The 3D renderer keeps ONE canvas across re-mounts (renderCareer re-creates #mapwrap) and releases itself when the
// career screen is gone. Without WebGL the map area shows a notice (no 2D fallback).

const MapView = {
  m3: null, // the live 3D renderer
  loading: false,
  failed: null, // the load error text, if the module or WebGL failed
  el: null,
  model: null,
  on: null,
  last: null, // the you.at last passed on (the road a trip follows starts there)
  /** The model with you.route = the road path from the last shown position to you.at when that changed (the renderer reads only the model). */
  routed(model) {
    const at = model.you && model.you.at;
    if (!at) return model;
    const from = MapView.last;
    MapView.last = at.slice();
    if (!from || (from[0] === at[0] && from[1] === at[1])) return model;
    return { ...model, you: { ...model.you, route: City.route(from, at) } };
  },
  mount(el, model, on) {
    model = MapView.routed(model);
    MapView.el = el;
    MapView.model = model;
    MapView.on = on;
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
  /** Release the 3D renderer (leaving the career screen). */
  drop3D() {
    if (MapView.m3) MapView.m3.dispose();
    MapView.m3 = null;
    MapView.failed = null; // a later mount tries again (a load error may have been transient)
    MapView.el = MapView.model = MapView.on = null; // don't hold the detached screen
  },
  update(model) {
    model = MapView.routed(model);
    MapView.model = model;
    if (MapView.m3) MapView.m3.update(model);
  },
  select(id) {
    if (MapView.m3) MapView.m3.select(id);
  },
  /** Fly the camera to your player (◎ / key C). */
  centre() {
    if (MapView.m3) MapView.m3.centre();
  },
  dispose: () => MapView.drop3D()
};
