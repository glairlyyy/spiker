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
