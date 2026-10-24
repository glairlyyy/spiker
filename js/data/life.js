// The living island (spec §4.37 1–2): the named people on the map and the day clock. Data only. Read by MapModel
// (js/career/mapmodel.js: lifePeople, clock), passed through the model to the 3D map (js/map3d/: life3d draws the people,
// map3d the sun and the night lights — the renderer never reads these globals), and by the map's hover tip (js/ui/map-view.js).

/** Named figures (T-331): every known person where their week's plan puts them. */
const LIFE = {
  max: 120, // named figures at most: your circle first, then your teammates, then by bond
  low: 40, // … with the Fast graphics setting
  spotR: [10, 24], // a hashed ring round their place (map units)
  homeR: [26, 60], // … round their home anchor (their club's HQ, their pool's region, the student quarter)
  court: { wu: 'sand' }, // where a hustle happens, by home region …
  courtElse: 'street', // … else the Overpass Court
  gym: { academy: 'acaGym' }, // where training happens when their region has no place for the stat
  size: { circle: 1.9, mate: 1.6, other: 1.4, grey: 1.4 }, // figure scale (× the 1.45 m crowd figure)
  pickPx: 16, // hover radius round a figure (screen px)
  /** What they are doing, for the hover tip (registrar: terse). */
  act: { train: 'drilling', hard: 'training hard', wit: 'studying', hustle: 'hustling', rest: 'resting', out: 'injured' },
  home: 'at home'
};

/**
 * The day clock (T-332; the real hour since spec §4.41 — run.clock, City.wt): time of day 0–1 (0 = midnight, 0.25 = 06:00,
 * 0.5 = noon). Display constants for the map: when people walk out and home, how fast the shown clock catches up.
 */
const CLOCK = {
  // the running clock (spec §4.43): on the map time runs — a game hour takes `scale` real seconds at ×1; Space pauses, `speeds`
  scale: 90,
  speeds: [1, 2, 4],
  ff: 1.5, // a session or a sleep fast-forwards: game hours a real second (× the speed)
  min: 1 / 12, // the rules' smallest step: a walk rounds to 5 game minutes (a step inside a gym takes its few minutes)
  warn: 1, // hours before the time to leave for a match you are made to play: the quiet chip
  save: 0.5, // game hours between saves while the clock runs on its own
  out: [0.2, 0.3], // people leave home (each at a hashed moment inside) …
  home: [0.76, 0.88], // … and walk back
  step: 0.05, // how long that walk takes (days)
  rate: { walk: 2.5, order: 0.07, idle: 0.35 }, // the map's clock runs toward the phase's time at most this fast (days / s)
  /**
   * Light by time of day (map3d interpolates, wrapping): sun = its colour and intensity (the moon at night), sky / ground /
   * hemi = the hemisphere light, bg = the sky behind the island, lit = how far the night lights are on (0–1).
   */
  keys: [
    { t: 0, sun: '#9fb4ff', sunI: 0.7, sky: '#5a6ca8', ground: '#262c3a', hemi: 1.1, bg: '#050a14', lit: 1 },
    { t: 0.2, sun: '#9fb4ff', sunI: 0.65, sky: '#5e6ca4', ground: '#2a2c38', hemi: 1.05, bg: '#0c1428', lit: 1 },
    { t: 0.27, sun: '#ffb07a', sunI: 1.35, sky: '#f0c8b0', ground: '#4a4438', hemi: 0.85, bg: '#2a3150', lit: 0.3 },
    { t: 0.36, sun: '#ffe8c8', sunI: 1.95, sky: '#d4e6ff', ground: '#4a5a3a', hemi: 0.88, bg: '#0d2032', lit: 0 },
    { t: 0.5, sun: '#fff0d8', sunI: 2.1, sky: '#cfe6ff', ground: '#4a5a3a', hemi: 0.9, bg: '#0b1d2c', lit: 0 },
    { t: 0.68, sun: '#ffe4bc', sunI: 1.95, sky: '#d6e2f8', ground: '#4a5a3a', hemi: 0.86, bg: '#0c1c2c', lit: 0 },
    { t: 0.78, sun: '#ff9058', sunI: 1.2, sky: '#e2a890', ground: '#3e3630', hemi: 0.85, bg: '#2a2240', lit: 0.45 },
    { t: 0.86, sun: '#8a9ae0', sunI: 0.7, sky: '#56609a', ground: '#262632', hemi: 1.0, bg: '#0a1022', lit: 0.95 },
    { t: 0.92, sun: '#9fb4ff', sunI: 0.7, sky: '#5a6ca8', ground: '#262c3a', hemi: 1.1, bg: '#050a14', lit: 1 }
  ]
};
