// Who runs where before the touch (display only — the engine already decided the play): far diggers read the attack
// and start early, hitters run their approach (run-up point → take-off), sprint speed caps, dig chases, cut squeaks,
// air momentum after a running take-off and bodies pushing apart (no overlaps).

/** Share of the beat before a far dig at which the digger reads the attack and starts running. */
const PREDIG_AT = 0.5;
/**
 * Reading the attack: if the next beat is a dig the player can't reach in its time, they start running for it
 * already in this beat (as the hitter swings), so less of the far-dig slow motion is needed. Display only.
 */
function preDigLook(b) {
  A.preDig = null;
  const nb = A.beats && A.beats[A.bi + 1];
  if (!nb || nb.scene || b.scene) return;
  const a = nb.acts.find(x => x.k === 'ball' && x.to && x.to.p && (x.to.c === 'bump' || x.to.c === 'dive') && x.when !== 'end'),
    mvA = a && nb.acts.find(x => x.k === 'slide' && x.p === a.to.p);
  if (mvA) A.preDig = { p: a.to.p, x: mvA.x, z: mvA.z, dur: nb.dur };
}
function preDigGo() {
  const g = A.preDig,
    d = A.disp[g.p];
  g.go = true;
  if (!d || d.pose === 'spike' || d.pose === 'set' || d.jy > 2) return; // busy with their own play
  const need = (Math.hypot((g.x - d.x) * MX, (g.z - d.z) * MZ) / sprintOf(d)) * 1000;
  if (need <= g.dur * 0.85) return; // they'll make it in time anyway
  d.sx = d.x;
  d.sz = d.z;
  d.tx = g.x;
  d.tz = g.z;
  d.carry = true; // straight there at a sprint (the dig beat's own move picks up from wherever they've got to)
}
/** Spike approach (display only): the run-up point sits this far behind the contact spot, away from the net (m). */
const RUNUP_M = 3;
/** The take-off point sits this far before the contact spot (m): the broad jump carries the hitter onto the ball. */
const TAKEOFF_M = 0.9;
/** Share of the beat before the set at which the hitter starts for the run-up point. */
const PREAPP_AT = 0.35;
/**
 * The spike approach a beat asks for: null, or { p, cx, cz, rx, rz, ox, oz, t0 } — the hitter, contact spot, run-up
 * point (rx/rz null when the slide has its own `via` run-up) and take-off point. Quick attacks (t0 < 0.3) and
 * cut / scene beats have none. Derived from the set beat's acts only.
 */
function approachOf(b) {
  if (!b || b.scene) return null;
  const ba = b.acts.find(x => x.k === 'ball' && x.to && x.to.p && x.to.c === 'spike' && x.when !== 'end'),
    sl = ba && b.acts.find(x => x.k === 'slide' && x.p === ba.to.p),
    jp = ba && b.acts.find(x => x.k === 'jump' && x.p === ba.to.p && x.mode === 'up');
  if (!sl || !jp || (jp.t0 || 0) < 0.3) return null;
  if (b.acts.some(x => x.k === 'spkstyle' && x.p === ba.to.p && x.st === 'serve')) return null; // a jump serve has its own routine
  const dir = Math.sign(sl.x - NETX) || 1,
    run = !sl.via;
  return {
    p: ba.to.p,
    back: b.acts.some(x => x.k === 'spkstyle' && x.p === ba.to.p && x.st === 'pipe'), // back-row attack (pipe / long back)
    deep: run ? clamp(sl.x + (dir * RUNUP_M) / MX, 20, 980) : sl.via.x, // the run-up depth: run-up point, or the end line
    cx: sl.x,
    cz: sl.z,
    rx: run ? clamp(sl.x + (dir * RUNUP_M) / MX, 20, 980) : null,
    rz: run ? sl.z : null,
    ox: sl.x + (dir * TAKEOFF_M) / MX,
    oz: sl.z,
    t0: jp.t0 || 0
  };
}
/** Reading the set: the hitter of the next beat starts for their run-up point already in this beat. */
function preApproachLook(b) {
  A.preApp = null;
  const nb = A.beats && A.beats[A.bi + 1],
    ap = nb && !b.scene ? approachOf(nb) : null;
  if (!ap || (ap.rx == null && !ap.back)) return;
  A.preApp = {
    p: ap.p,
    rx: ap.rx,
    rz: ap.rz,
    ap,
    ms: (1 - PREAPP_AT) * b.dur + ap.t0 * nb.dur, // from the go to the take-off (world ms)
    touch: b.acts.some(x => x.k === 'ball' && x.to && x.to.p === ap.p && x.when !== 'end')
  };
}
function preApproachGo() {
  const g = A.preApp,
    d = A.disp[g.p];
  g.go = true;
  if (g.touch || !d || d.jy > 2 || diving(d)) return; // busy with their own play
  if (g.ap.back && (d.curve = backCurve(d, g.ap, g.ms))) {
    d.sx = d.x;
    d.sz = d.z;
    d.tx = g.ap.ox; // the move ends at the take-off point (so the beat's end doesn't settle them anywhere else)
    d.tz = g.ap.oz;
    d.carry = false;
    return;
  }
  if (g.rx == null) return;
  d.sx = d.x;
  d.sz = d.z;
  d.tx = g.rx;
  d.tz = g.rz;
  d.carry = true; // straight to the run-up point at a sprint (the set beat's own move picks up from there)
}
/**
 * The hitter's move in the set beat: A) to the run-up point, B) an accelerating run to the take-off point, C) in the
 * air a broad jump onto the contact spot, arriving at t = 1. Returns false to leave the move to the generic code
 * (a `via` back attack before its take-off).
 */
function approachMove(d, t) {
  const g = d.app,
    dm = g.t0 > g.at ? g.t0 - g.at : 0.01;
  if (d.curve && t < g.t0) {
    curveMove(d);
    return true;
  }
  d.curve = null;
  if (t >= g.t0) {
    if (g.fx == null) {
      g.fx = d.x;
      g.fz = d.z;
    }
    const u = clamp((t - g.t0) / Math.max(0.01, 1 - g.t0), 0, 1);
    d.x = lerp(g.fx, g.cx, u);
    d.z = lerp(g.fz, g.cz, u);
    return true;
  }
  if (g.direct) {
    const k = ease(t / g.t0);
    capMove(d, lerp(d.sx, g.ox, k), lerp(d.sz, g.oz, k));
    return true;
  }
  if (g.rx == null) {
    // a `via` back attack: the generic code runs the first leg; the second ends at the take-off point at t0
    const v = d.via;
    if (!v || t < v.at || v.at >= g.t0) return false;
    const k = (t - v.at) / (g.t0 - v.at);
    capMove(d, lerp(v.x, g.ox, k * k), lerp(v.z, g.oz, k * k));
    return true;
  }
  if (t < g.at) {
    if (d.p && d.p.id === A.digHero) {
      capMove(d, g.rx, g.rz); // a hitter on their own clock (A.digHero): to the run-up point at a real sprint while the world slows
      return true;
    }
    const k = ease(t / g.at);
    capMove(d, lerp(d.sx, g.rx, k), lerp(d.sz, g.rz, k));
    return true;
  }
  const k = clamp((t - g.at) / dm, 0, 1),
    x0 = g.at > 0 ? g.rx : d.sx,
    z0 = g.at > 0 ? g.rz : d.sz;
  capMove(d, lerp(x0, g.ox, k * k), lerp(z0, g.oz, k * k));
  return true;
}
/** Back-row curve (owner, 2026-10-08): how far out to the hitter's side and back from the start it swings (m). */
const CURVE = { side: 1.2, back: 1.5, inSide: 0.5 };
/**
 * A back-row attack (pipe, long back attack) by a hitter in front of the run-up depth: instead of backpedalling straight
 * back and running straight in, a curved sprint — out and back on their side, round behind the run-up point, and in
 * toward the net — so they take off with momentum. A cubic Bezier from where they stand to the take-off point, followed
 * by arc length over `ms` (accelerating). null when already at / behind the depth, or when the curve can't be run in time.
 */
function backCurve(d, ap, ms) {
  const dir = Math.sign(ap.cx - NETX) || 1;
  if (dir * (d.x - ap.deep) > -0.5 / MX) return null; // already at the run-up depth: straight in
  const side = Math.sign(d.z - ap.oz) || (ap.oz < 0.5 ? 1 : -1),
    cx = x => clamp(x, 20, 980),
    cz = z => clamp(z, 0.02, 0.98),
    pts = [
      { x: d.x, z: d.z },
      { x: cx(d.x + (dir * CURVE.back) / MX), z: cz(d.z + (side * CURVE.side) / MZ) },
      { x: cx(ap.deep + (ap.deep - ap.ox) * 0.8), z: cz(ap.oz + (side * CURVE.inSide) / MZ) },
      { x: ap.ox, z: ap.oz }
    ],
    at = u => {
      const v = 1 - u,
        a = v * v * v,
        b = 3 * v * v * u,
        c = 3 * v * u * u,
        e = u * u * u;
      return { x: a * pts[0].x + b * pts[1].x + c * pts[2].x + e * pts[3].x, z: a * pts[0].z + b * pts[1].z + c * pts[2].z + e * pts[3].z };
    },
    lut = [{ u: 0, s: 0, ...pts[0] }];
  for (let i = 1; i <= 32; i++) {
    const p = at(i / 32),
      q = lut[i - 1];
    lut.push({ u: i / 32, s: q.s + Math.hypot((p.x - q.x) * MX, (p.z - q.z) * MZ), ...p });
  }
  const len = lut[32].s,
    fit = (sprintOf(d) * ms) / 1000 / Math.max(0.1, len); // sprint distance in the time ÷ the loop's length
  if (fit < 1.05) return null; // no time for the loop: the straight run
  return { lut, len, ms: Math.max(1, ms), t: 0, e: Math.min(2, fit), s: 0 }; // accelerating, never past a sprint at the end
}
/** One frame along the back-row curve: progress accelerates (s = τ^e, e ≤ 2: building momentum) toward the take-off. */
function curveMove(d) {
  const c = d.curve;
  c.t += A.fdt || 16;
  const s = (c.s = Math.pow(clamp(c.t / c.ms, 0, 1), c.e) * c.len),
    L = c.lut;
  let i = 1;
  while (i < L.length - 1 && L[i].s < s) i++;
  const a = L[i - 1],
    b = L[i],
    k = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1);
  capMove(d, lerp(a.x, b.x, k), lerp(a.z, b.z, k));
}
/** Top running speed in m/s (a dive launches ×1.35 faster). */
const sprintOf = d => (6.5 + 3.5 * (((d.p && d.p.speed) || 60) / 100)) * (d.pose === 'dive' ? 1.35 : 1);
/**
 * A dig or receive the player can't run to in the beat's time: the world (ball, everyone else) slows just enough
 * for them to get there at a real sprint, while the digger moves and dives at normal speed (A.digHero runs on
 * real time — see step, capMove and the 3D posing).
 */
function digChase(b) {
  A.digHero = null;
  const a = b.acts.find(x => x.k === 'ball' && x.to && x.to.p && (x.to.c === 'bump' || x.to.c === 'dive') && x.when !== 'end'),
    d = a && A.disp[a.to.p];
  if (!d || d.via || b.scene) return;
  b._rcv = a.to.p; // who takes this ball (a scramble's slow motion ends once they are set: clock.js)
  // ms needed: still in the air (a blocker coming down) → the fall and the landing first, then the sprint
  const air = d.jy > 2 ? Math.sqrt((2 * d.jy * UNIT_M.h) / FALL_G) * 1000 + 60 : 0,
    need = air + (Math.hypot((d.tx - d.x) * MX, (d.tz - d.z) * MZ) / sprintOf(d)) * 1000,
    k = clamp((b.dur * 0.85) / Math.max(1, need), DIG_SLOW_MIN, 1);
  if (k > 0.92) return; // reachable at normal speed
  b._dig = k;
  A.digHero = a.to.p;
  if (d.dv) d.dv.dur /= k; // the dive plays out over the stretched beat, on the digger's own (real) clock
}
/**
 * A slow-motion scramble beat (hypeSlow) that ends with the ball on the floor (a kill): could the diving defender get there?
 * Sets b._miss = 'near' (they reach the spot in the beat's time — it just beats them: a short, light slow motion) or 'clear'
 * (they can't get there: no slow motion), owner 2026-10-08 (clock.js). Display only.
 */
function missCheck(b) {
  if (!b.hypeSlow || !b.slow) return;
  const a = b.acts.find(x => x.k === 'ball' && x.to && x.to.p == null && x.to.h === 0 && x.when !== 'end'),
    kill = b.acts.some(x => x.k === 'impact' && x.kill);
  if (!a || !kill) return;
  const need = d => (Math.hypot((d.tx - d.x) * MX, (d.tz - d.z) * MZ) / sprintOf(d)) * 1000 + (d.jy > 2 ? 300 : 0),
    divers = b.acts
      .filter(x => x.k === 'pose' && (x.pose === 'dive' || x.pose === 'bump'))
      .map(x => A.disp[x.p])
      .filter(Boolean);
  b._miss = divers.some(d => need(d) <= b.dur * 0.9) ? 'near' : 'clear';
}
/** A dig's player (default: the far-dig chaser A.digHero) has got there: on their feet, not mid-dive, within DIG_SET_M of the spot. */
const DIG_SET_M = 0.35;
function digArrived(id = A.digHero) {
  const d = id && A.disp[id];
  if (!d) return true;
  return !diving(d) && d.jy <= 1 && Math.hypot((d.tx - d.x) * MX, (d.tz - d.z) * MZ) <= DIG_SET_M;
}
/** A long, hard cut sometimes squeaks (throttled, a little delayed). Math.random: sound only, never the game RNG. */
function maybeSqueak(d, a) {
  const far = Math.hypot(a.x - d.x, (a.z - d.z) * Z_TO_X),
    t = performance.now();
  if (far > 80 && t - (A.sqT || 0) > 180 && Math.random() < 0.45) {
    A.sqT = t;
    const X = P(d.x, d.z, 0).X;
    setTimeout(
      () => {
        if (!A) return; // left the match meanwhile
        panAt(X);
        sfx.squeak();
      },
      40 + Math.random() * 160
    );
  }
}
/** Share of the ground speed a jump keeps in the air, and the cap (m/s): a running take-off carries on a little. */
const AIR_KEEP = 0.35,
  AIR_MAX = 2.5;
/**
 * Jump physics (display only): on the ground each player's velocity is measured; at take-off a share of it becomes
 * their air velocity (d.airV, court units per ms), which carries them while they fall back down (so a running
 * spiker lands past the take-off spot instead of dropping straight down in place). Never through the net.
 */
function airMomentum() {
  const dt = A.fdt || 16;
  for (const id in A.disp) {
    const d = A.disp[id];
    if (d.jy <= 1) {
      if (d.pvx != null && dt > 0) {
        d.gvx = (d.x - d.pvx) / dt;
        d.gvz = (d.z - d.pvz) / dt;
      }
      d.airV = null;
    } else if (!d.airV) {
      let vx = (d.gvx || 0) * AIR_KEEP,
        vz = (d.gvz || 0) * AIR_KEEP;
      const ms = Math.hypot(vx * MX, vz * MZ) * 1000; // m/s
      if (ms > AIR_MAX) {
        vx *= AIR_MAX / ms;
        vz *= AIR_MAX / ms;
      }
      d.airV = { vx, vz, sn: d.slideN || 0 };
    }
    d.pvx = d.x;
    d.pvz = d.z;
  }
}
/** Closest two players' feet may come (metres): bodies push apart instead of overlapping. */
const BODY_GAP = 0.6;
/**
 * Collision: teammates closer than BODY_GAP are pushed apart along the line between them (half each; a player
 * lying after a dive doesn't budge). Display only — engine positions and targets are unchanged.
 */
function separate() {
  const ds = Object.values(A.disp);
  for (let i = 0; i < ds.length; i++)
    for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i],
        b = ds[j];
      if (a.side !== b.side) continue; // the net is between them
      let dx = (b.x - a.x) * MX,
        dz = (b.z - a.z) * MZ;
      const dm = Math.hypot(dx, dz);
      if (dm >= BODY_GAP) continue;
      if (dm < 1e-4) {
        dx = 0;
        dz = 1e-4; // same spot: split along the net
      }
      const n = Math.max(dm, 1e-4),
        push = BODY_GAP - dm,
        la = diving(a) ? 0 : diving(b) ? 1 : 0.5,
        lb = 1 - la;
      a.x -= ((dx / n) * push * la) / MX;
      a.z -= ((dz / n) * push * la) / MZ;
      b.x += ((dx / n) * push * lb) / MX;
      b.z += ((dz / n) * push * lb) / MZ;
    }
}
