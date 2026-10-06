// Global game state (settings, current screen) and small shared helpers.

const G = { view: 'menu', cutMini: store.get(KEYS.cutins) === 'mini', camFixed: store.get(KEYS.camera) === 'fixed' };
/** A saved option name, if it is one of `table`'s own keys (a stray value like "constructor" falls back to `def`). */
const savedOption = (key, table, def) => {
  const v = store.get(key);
  return Object.hasOwn(table, v) ? v : def;
};
/**
 * Graphics quality: how many pixels the 3D view may render (px3d) and how far the automatic resolution may drop
 * when frames run slow (floor; 1 = never). The labels layer always stays at full sharpness.
 */
const GFX = {
  high: { name: 'High', px3d: 9e6, floor: 1 },
  auto: { name: 'Auto', px3d: 3.7e6, floor: 0.75 },
  fast: { name: 'Fast', px3d: 2e6, floor: 0.55 }
};
G.gfx = savedOption(KEYS.gfx, GFX, 'auto');
/** Hype: staged shonen scenes. max = the highest scene level shown (engine/hype.js: 1 = big moments, 2 = extra). */
const HYPE = {
  off: { name: 'Off', max: 0 },
  normal: { name: 'Normal', max: 1 },
  max: { name: 'Max', max: 2 }
};
G.hype = savedOption(KEYS.hype, HYPE, 'normal');
/** Calls (spec §2.13): when a played career match asks you at your decision points. */
const CALL_MODES = { key: 'Key moments', all: 'All', off: 'Off' };
G.calls = savedOption(KEYS.calls, CALL_MODES, 'key');
/** Hand trails of stars and OP players: Light (their hair colour) or Ink (black brush stroke, crimson inside — owner 2026-10-06). */
const TRAIL_STYLES = { light: 'Light', ink: 'Ink' };
G.trail = savedOption(KEYS.trail, TRAIL_STYLES, 'light');
/** Screen registry: each screen registers its entry function; navigate() switches between them. */
const Screens = {};
/**
 * Switch to screen `name`, passing `args` to its entry function.
 * @param {string} name a key of Screens
 * @returns whatever the screen's entry function returns
 */
function navigate(name, ...args) {
  if (!Screens[name]) throw new Error('Unknown screen ' + name);
  // leaving a match that is still running: every lineup goes back to how it started (substitutions are per match)
  if (name !== 'match' && typeof A !== 'undefined' && A && A.m && !A.m.over) restoreLineups(A.m);
  // a screen change passes through the veil (spec §9.12); hub → match shows the round title first
  if (G.view && G.view !== name && typeof Motion !== 'undefined')
    Motion.veil(name === 'match' && args[0] && args[0].round ? args[0].round : '');
  G.view = name;
  if (name !== 'menu' && typeof titleBgOff === 'function') titleBgOff(); // no GPU work for the title backdrop off the title (T-177)
  const out = Screens[name](...args);
  if (name === 'match') bgmStart();
  else bgmStop();
  return out;
}
/** Find a player by id in the match being shown. */
const byId = id => {
  const T = typeof A !== 'undefined' && A && A.m ? A.m.t : [];
  for (const t of T) for (const p of squadOf(t)) if (p.id === id) return p; // court and bench (a subbed-out player is still findable)
};
/** Add one match's stat line `s` into the running totals `dst` (top speed keeps the maximum; `mp` is counted by the caller). */
const addStats = (dst, s) => {
  for (const k in dst) if (k !== 'mp') dst[k] = k === 'top' ? Math.max(dst[k], s[k]) : dst[k] + s[k];
};
