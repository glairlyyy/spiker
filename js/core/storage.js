// Persistent settings/save data. Every localStorage access goes through here (it can throw in private mode).

const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (e) {}
  },
  getJSON(key, fallback = null) {
    const v = this.get(key);
    if (v === null) return fallback;
    try {
      return JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  setJSON(key, value) {
    this.set(key, JSON.stringify(value));
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
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
  career: 'skyline_career_v1',
  legacy: 'skyline_legacy_v1'
};
