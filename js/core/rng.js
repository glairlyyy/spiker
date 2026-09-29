// Random helpers and small math utilities. Everything random goes through R().

/**
 * Single random source for the whole game. Defaults to Math.random.
 * RNG.seed(n) switches to a deterministic generator (reproducible runs, roguelike seeds, tests);
 * RNG.unseed() goes back to Math.random.
 */
const RNG = {
  next: () => Math.random(),
  seed(n) {
    let a = n >>> 0;
    this.next = () => {
      // mulberry32
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  unseed() {
    this.next = () => Math.random();
  }
};
const R = () => RNG.next();
const rnd = (a, b) => a + R() * (b - a);
const pick = a => a[Math.floor(R() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Is point p inside polygon poly ([[x, y], …])? (even–odd rule) */
function inPoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const sig = x => 1 / (1 + Math.exp(-x));
const lerp = (a, b, t) => a + (b - a) * t;
function wpick(arr, wf) {
  let t = 0;
  const w = arr.map(x => {
    const v = Math.max(0.01, wf(x));
    t += v;
    return v;
  });
  let r = R() * t;
  for (let i = 0; i < arr.length; i++) {
    r -= w[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}
