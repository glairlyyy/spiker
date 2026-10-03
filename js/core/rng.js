// Random helpers. Everything random goes through R(). (Non-random maths: core/math.js.)

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
/**
 * Presentation-only randomness (particles, confetti, trail flicker, coach looks): never the game stream, so what the
 * screen draws — and how often, which depends on frame rate — can't move the engine's draws. `isolate(fn)` runs code
 * that calls R()/pick() internally (e.g. mkLook) on this source instead.
 */
const FXR = {
  r: () => Math.random(),
  rnd: (a, b) => a + Math.random() * (b - a),
  pick: a => a[Math.floor(Math.random() * a.length)],
  isolate(fn) {
    const next = RNG.next;
    RNG.next = () => Math.random();
    try {
      return fn();
    } finally {
      RNG.next = next;
    }
  }
};
const rnd = (a, b) => a + R() * (b - a);
const pick = a => a[Math.floor(R() * a.length)];
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
