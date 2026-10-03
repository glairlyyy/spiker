// Persistent settings/save data. Every localStorage access goes through here (it can throw in private mode).

const store = {
  /** Raw string value for `key`, or `fallback` when missing or storage is unavailable. */
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  },
  /** Store `value` as a string; silently does nothing when storage is unavailable. */
  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (e) {
      /* private mode / quota: settings just don't persist */
    }
  },
  /** Parsed JSON value for `key`; `fallback` when missing, unreadable or corrupt. */
  getJSON(key, fallback = null) {
    const v = this.get(key);
    if (v === null) return fallback;
    try {
      return JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  /** Store `value` as JSON. */
  setJSON(key, value) {
    this.set(key, JSON.stringify(value));
  },
  /** Delete `key`. */
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* storage blocked: nothing to remove */
    }
  }
};
/** Storage keys in one place so save formats are easy to find and version. */
const KEYS = {
  sound: 'skyline_sound',
  cutins: 'skyline_cutins',
  camera: 'skyline_camera',
  gfx: 'skyline_gfx',
  hype: 'skyline_hype',
  volume: 'skyline_volume',
  rail: 'sns_rail_mini', // the hub's week rail folded to its strip ('1') or open (T-136)
  career: 'sns_run_v1' // Spite & Spike run (older Skyline Cup careers are not carried over)
};
