// MapView: the island map renderer the game talks to — the three.js map (js/map3d/map3d.mjs), lazy-loaded once.
//   MapView.mount(el, model, { pick(id), point([x, y]) })   MapView.update(model)   MapView.select(id)   MapView.dispose()
// The 3D renderer keeps ONE canvas across re-mounts (renderCareer re-creates #mapwrap) and releases itself when the
// career screen is gone. Without WebGL the map area shows a notice (no 2D fallback).

const MapView = {
  m3: null, // the live 3D renderer
  loading: false,
  failed: null, // the load error text, if the module or WebGL failed
  el: null,
  model: null,
  on: null,
  mount(el, model, on) {
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
        MapView.m3 = mod.create(MapView.el, () => MapView.drop3D());
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
  },
  update(model) {
    MapView.model = model;
    if (MapView.m3) MapView.m3.update(model);
  },
  select(id) {
    if (MapView.m3) MapView.m3.select(id);
  },
  dispose: () => MapView.drop3D()
};
