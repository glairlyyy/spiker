// Global game state (settings, current screen) and small shared helpers.

const G = { view: 'menu', cutMini: false };
G.cutMini = store.get(KEYS.cutins) === 'mini';
G.camFixed = store.get(KEYS.camera) === 'fixed';
/**
 * Graphics quality: how many pixels the 3D view may render (px3d) and how far the automatic resolution may drop
 * when frames run slow (floor; 1 = never). The labels layer always stays at full sharpness.
 */
const GFX = {
  high: { name: 'High', px3d: 9e6, floor: 1 },
  auto: { name: 'Auto', px3d: 3.7e6, floor: 0.75 },
  fast: { name: 'Fast', px3d: 2e6, floor: 0.55 }
};
G.gfx = GFX[store.get(KEYS.gfx)] ? store.get(KEYS.gfx) : 'auto';
/** Hype: staged shonen scenes. max = the highest scene level shown (engine/hype.js: 1 = big moments, 2 = extra). */
const HYPE = {
  off: { name: 'Off', max: 0 },
  normal: { name: 'Normal', max: 1 },
  max: { name: 'Max', max: 2 }
};
G.hype = HYPE[store.get(KEYS.hype)] ? store.get(KEYS.hype) : 'normal';
/** Screen registry: each screen registers its entry function; navigate() switches between them. */
const Screens = {};
function navigate(name, ...args) {
  if (!Screens[name]) throw new Error('Unknown screen ' + name);
  G.view = name;
  return Screens[name](...args);
}
/** Find a player by id in the match being shown. */
const byId = id => {
  const T = typeof A !== 'undefined' && A && A.m ? A.m.t : [];
  for (const t of T) for (const p of t.P) if (p.id === id) return p;
};
const addStats = (dst, s) => {
  for (const k in dst) if (k !== 'mp') dst[k] = k === 'top' ? Math.max(dst[k], s[k]) : dst[k] + s[k];
};
