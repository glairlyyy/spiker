// The dive timeline: one shape over time, shared by the playback (movement, poses) and the 3D dive pose.

/** After the dig contact the dive runs on fixed time, however short the beat was: on the floor, then back up. */
const DIVE_POST_MS = 700;
/** Dive phase f: 0..1 = run-in to contact over the beat, then 1 per DIVE_POST_MS (floor ≈ 1.15–1.85, up by 2.3). */
const diveF = dv => (dv.t <= dv.dur ? dv.t / Math.max(1, dv.dur) : 1 + (dv.t - dv.dur) / DIVE_POST_MS);
/** Still diving: not back on the feet yet. */
const diving = d => d.pose === 'dive' && !!d.dv && diveF(d.dv) < 2.3;
/**
 * Dive timeline (see diveF): run-in, launch, belly slide, then push back up.
 * Returns the body angle, hip height/offset, how flat the body is and how far the arms reach.
 */
function diveShape(d) {
  const dv = d.dv || { t: 1e9, dur: 1 },
    f = diveF(dv),
    L = clamp((f - 0.3) / 0.45, 0, 1), // launch → touchdown
    el = ease(L),
    slide = clamp((f - 0.75) / 0.6, 0, 1), // skid after touchdown
    up = clamp((f - 2.1) / 0.5, 0, 1), // get back up
    flat = el * (1 - up),
    hop = Math.sin(Math.PI * L) * 16;
  return {
    f, // dive time / beat time (the 3D dive is keyed on this)
    ang: lerp(0.32, 1.42, el) * (1 - up) + 0.1 * up,
    hipH: lerp(33, 6, flat) + hop * (1 - up),
    hipX: -34 * flat + 22 * (1 - Math.pow(1 - slide, 2)) * (1 - up),
    flat,
    reach: clamp(L * 1.6, 0, 1) * (1 - up),
    rise: up
  };
}

/**
 * Knockdown (spec §2.28): pose 'fall' — the ball arrives at ko.dur; knocked back and down, on the floor until ko.up (the
 * engine's get-up act — at least KO_MIN_MS after the contact — or KO_MAX_MS as a safety), on the feet KO_UP_MS later.
 */
const KO_MIN_MS = 1200,
  KO_MAX_MS = 7000,
  KO_UP_MS = 800;
/** Still knocked down: not back on the feet yet. */
const downed = d => d.pose === 'fall' && !!d.ko && !(d.ko.up != null && d.ko.t >= d.ko.up + KO_UP_MS);
/** The engine says they're up (getup act): they start getting up now, or once they've been down KO_MIN_MS. */
function koUp(d) {
  if (d && d.ko && d.ko.up == null) d.ko.up = Math.max(d.ko.t, d.ko.dur + KO_MIN_MS);
}
