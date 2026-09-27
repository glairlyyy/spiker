// World clock and main loop: slow motion / hit-stop (timeScale → A.ts), the requestAnimationFrame loop that steps and
// draws the match, and the stall watchdog that reports to the debug log (DBG).

/** Match pace: game ms per real ms at 1× speed. */
const PACE = 0.8;
/** Slow-motion factors of A.ts: default slow beat, the build-up after a staged scene, hit-stop, staged scene. */
const TS_SLOW = 0.3,
  TS_BUILD = 0.35,
  TS_FREEZE = 0.04,
  TS_SCENE = 0.03;
/** Below this A.ts the mix is muffled and the stage desaturated (sfx.slowmo, .slowmo class). */
const TS_SLOWFX = 0.75;
/**
 * World time scale A.ts (1 = normal). A slow beat (slow: 1 → ×0.3, or a factor; optional window slowAt: [t0, t1] of the
 * beat) eases down over ~0.1 s and back up over ~0.16 s, so it reads as a camera effect rather than a hitch. Hit-stop
 * (freeze) and staged scenes (scene) drop to a near-stop at once. Also drives the audio muffle and the vignette.
 * @param {object|undefined} cb the current beat
 * @param {number} raw real (speed-scaled) ms this frame
 */
function timeScale(cb, raw) {
  const hype = HYPE[G.hype].max,
    on = !!(cb && cb._s),
    t = on ? Math.min(1, (A.el || 0) / Math.max(1, cb.dur)) : 0,
    win = !on || !cb.slowAt || (t >= cb.slowAt[0] && t <= cb.slowAt[1]),
    build = on && cb.sceneSlow && cb.sceneSlow <= hype && t < 0.55; // after a scene: slow build-up, fast hit
  // hypeSlow: scramble drama, off with Hype
  A.slowOn = !!((on && cb.slow && win && (!cb.hypeSlow || hype >= cb.hypeSlow)) || build);
  A.freezeOn = !!(on && cb.freeze);
  A.sceneOn = !!(on && cb.scene);
  A.slowK = A.slowOn ? (build ? TS_BUILD : cb.slow < 1 ? cb.slow : TS_SLOW) : 1;
  const tgt = A.freezeOn ? TS_FREEZE : A.sceneOn ? TS_SCENE : A.slowK;
  if (!Number.isFinite(A.ts)) A.ts = 1; // first frame (or a bad value): normal speed
  if (tgt < 0.1)
    A.ts = Math.min(A.ts, tgt); // hit-stop / scene: instant
  else A.ts += (tgt - A.ts) * (1 - Math.exp(-raw / (tgt < A.ts ? 90 : 160)));
  if (Math.abs(A.ts - tgt) < 0.004) A.ts = tgt;
  const slow = A.ts < TS_SLOWFX;
  if (slow !== !!A._slowFx) {
    A._slowFx = slow;
    sfx.slowmo(slow);
    const st = document.getElementById('stage');
    if (st) st.classList.toggle('slowmo', slow);
  }
}
/**
 * Time for things that play at (near) real speed whatever the match speed — cut-ins, staged scenes, the ghost arrow:
 * the speed-scaled `ms` undone, then at most 1.5× faster.
 */
function playDt(ms) {
  const sp = A.speed > 0 ? A.speed : 1;
  return (ms / sp) * Math.min(sp, 1.5);
}
/** The main loop (started once by main.js): steps and draws the match while its canvas is on screen. */
function frame(ts) {
  requestAnimationFrame(frame); // first: an error below must never stop the loop (that froze the game)
  const dt = clamp(ts - (last || ts), 0, 50) || 0;
  last = ts;
  if (!A || !cv || !document.body.contains(cv)) return;
  try {
    if (!A.paused && !A.hold) step(dt * A.speed * PACE);
    frame.err = 0;
  } catch (e) {
    DBG.log('error', e, matchState());
    // the same beat keeps failing: skip it so the match goes on
    if (++frame.err >= 20 && A && A.beats) {
      DBG.log('recover', `Skipped beat ${A.bi} after repeated errors`, A.beats[A.bi] && A.beats[A.bi].acts.map(a => a.k).join(','));
      A.bi++;
      A.el = 0;
      frame.err = 0;
    }
  }
  if (!A) return; // the step finished the match and left the screen
  try {
    draw();
  } catch (e) {
    DBG.log('error', e, 'while drawing');
  }
  watchdog(ts);
}
frame.err = 0;
/** What the match is doing right now (for the debug log). */
function matchState() {
  if (!A) return { view: G.view };
  const b = A.beats && A.beats[A.bi];
  return {
    view: G.view,
    score: A.m && A.m.pts,
    beat: `${A.bi}/${A.beats ? A.beats.length : 0}`,
    dur: b && b.dur,
    el: Math.round(A.el || 0),
    acts: b ? b.acts.map(a => a.k).join(',') : null,
    hold: !!A.hold,
    paused: !!A.paused,
    done: !!A.done,
    speed: A.speed,
    r3d: !!R3D,
    res: R3D ? R3D.res : null, // 3D dynamic resolution
    px: cv ? `${cv.width}x${cv.height}` : null,
    cut: !!(b && b.cut),
    mini: !!G.cutMini
  };
}
/** Stall thresholds (ms): no progress at all, no progress while the 3D players load, one beat playing. */
const STALL_MS = 6000,
  STALL_HOLD_MS = 25000,
  STALL_BEAT_MS = 20000;
/** Stall detector: play should always move and no beat should last forever; if not, record why. */
function watchdog(ts) {
  const w = watchdog;
  if (A.done || A.paused) {
    w.since = w.beatT = ts;
    return;
  }
  const beat = `${A.bi}|${A.beats ? A.beats.length : 0}`,
    key = `${beat}|${A.el || 0}`;
  if (key !== w.key) {
    w.key = key;
    w.since = ts;
    w.told = false;
  }
  if (beat !== w.beat) {
    w.beat = beat;
    w.beatT = ts;
    w.toldB = false;
  }
  if (!w.told && ts - w.since > (A.hold ? STALL_HOLD_MS : STALL_MS)) {
    w.told = true;
    DBG.log('stall', A.hold ? 'Match waiting on the 3D players for 25 s' : 'Match stopped moving for 6 s', matchState());
  }
  if (!w.toldB && ts - w.beatT > STALL_BEAT_MS && !A.hold) {
    w.toldB = true;
    DBG.log('stall', 'One beat has been playing for 20 s', matchState());
  }
}
