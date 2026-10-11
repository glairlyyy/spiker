// Dev tools load on demand (spec §2.22): the VFX panel, the VFX lab and the Animation lab are classic scripts that the game
// fetches only when one opens. A new dev tool = its file(s) + one DEV_TOOLS entry; open it with devOpen(name, fn).

/** Each tool's scripts, in load order (shared files load once). */
const DEV_TOOLS = {
  vfx: ['js/ui/vfx-panel.js'], // live VFX tuning beside a running match (Monster / Average games, the Cut-scene lab)
  lab: ['js/ui/vfx-panel.js', 'js/ui/vfx-lab.js'], // the VFX lab screen
  anim: ['js/ui/vfx-panel.js', 'js/ui/anim-lab.js'] // the Animation lab
};
const DEV_LOADED = {};
/** Load one script once (a promise; classic script → its top-level names become globals). */
function devScript(src) {
  return (DEV_LOADED[src] =
    DEV_LOADED[src] ||
    new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => fail(new Error(`dev tool script failed: ${src}`));
      document.head.appendChild(s);
    }));
}
/** Load a tool's scripts in order. */
async function devLoad(name) {
  for (const src of DEV_TOOLS[name] || []) await devScript(src);
}
/** Load tool `name`, then run `fn` (errors go to the Debug log). */
function devOpen(name, fn) {
  devLoad(name)
    .then(() => fn && fn())
    .catch(e => DBG.log('error', e.message));
}
