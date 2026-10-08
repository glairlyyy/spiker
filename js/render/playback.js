// Beat playback: turns the engine's beats (timed act lists) into display state (A.disp, A.ball, effects) every frame.
// This file: the court → screen projection, contact points, the acts (startBeat / instant / applyBeat / endBeat) and
// step(). Loaded right after it: clock.js (world clock, frame loop, watchdog), ball.js (flight, bounces, trail),
// camera.js (push-ins) and scenes.js (staged-scene banner, lines, skip); effects.js spawns and ages effects.
// Nothing here runs at load time, so qa_poses.html can load this file on its own for swingLead() / ease().

/* ---------- projection and shared geometry ---------- */

// Legacy 2.5D projection (P() until the 3D view provides P3D): floor line Y, court depth on screen, skew per unit z.
const FY = 505,
  DEPTH = 175,
  SK = -45;
/** The overlay's logical half-height: the view is 1000 wide and 2·VH tall (220 = the classic 1000:440; fit() sets it, spec §9.9). */
let VH = 220;
const VT = 80, // logical y of the top of the view (the overlay's origin)
  FIG = 1.12; // figure scale: tag and swirl sizes per projected px of height
/** Court z (0..1 across) → x-comparable units, for on-screen distances (squeaks, gait, dust). */
const Z_TO_X = Z_UNITS;
let VCS = 1; // visual court scale of the match on screen
/** 3D view (Monster 3D): the renderer module, and its court → screen projection that replaces P() while it is on. */
let R3D = null,
  P3D = null;
/**
 * Court → logical screen { X, Y, s }. On a bigger court the floor keeps its size on screen and everything with height
 * (players, ball, net, jumps) shrinks by the court scale — a zoomed-out camera.
 */
function P(x, z, h) {
  if (P3D) return P3D(x, z, h);
  const s = (1 - 0.3 * z) / VCS;
  return { X: 522 + (x - 500) * s * VCS + SK * z, Y: FY - DEPTH * z - h * s, s };
}
/** Ease in-out (quadratic), 0..1 → 0..1. */
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** Height (court h units, 150 = 2.43 m net) of the ball's centre `k` × body height up — 1.15 = on a straight arm overhead. */
const reachH = (d, k) => (k * 1.8 * ((d.p && d.p.look && d.p.look.hgt) || 1)) / UNIT_M.h;
/**
 * Swing timing shared with the 3D poses: ms from swing start to ball contact. A jumping hitter starts the swing this long
 * before the ball arrives (and holds the contact pose until the hit beat); otherwise the ball waits at
 * the contact point this long at the start of the hit beat, so the hand really meets it.
 */
const swingLead = d => (d.pose === 'serve' ? 70 : d.pose === 'spike' ? 150 : 0);
/** Metres per court unit (3D scale): MX along the long axis (x/1000 of it), MZ across (z 0..1). */
const MX = UNIT_M.x,
  MZ = UNIT_M.z;
/** Metres a player still has to run to their move target. */
const moveM = d => Math.hypot((d.tx - d.x) * MX, (d.tz - d.z) * MZ);
/** Contact height per touch (court h units); spikes, serves and blocks add the jump in resolve(). */
const CONTACT_H = { bump: 48, set: 122 };
/** Where the ball meets the body, in front of the player (court x units at scale 1). */
const CONTACT_OFF = { bump: 24, dive: 20, set: 8, spike: 6, serve: 7, block: 12 };

/**
 * Ball target of a `ball` act: a court point ({ x, z, h }) or a contact on player `to.p` with touch `to.c`
 * (bump, dive, set, spike, serve, block), at that player's hands. Falls back to the ball's spot if the player is gone.
 */
function resolve(to) {
  if (to.x != null) return { x: to.x, z: to.z, h: to.h };
  const d = A.disp[to.p];
  if (!d) return { x: A.ball.x, z: A.ball.z, h: A.ball.h };
  const dir = DIR(d.side),
    pk = d.jmode && (d.jmode.mode === 'up' || d.jmode.mode === 'reup') ? d.jmode.peak : d.jy,
    dx = to.dx || 0,
    dh = to.dh || 0;
  // dig/receive: the pose the player is actually in (run-and-bump or dive) decides the contact
  const c = (to.c === 'bump' || to.c === 'dive') && (d.pose === 'bump' || d.pose === 'dive') ? d.pose : to.c;
  // dive: the ball meets the outstretched hands just off the floor, well ahead of the hips;
  // spikes and serves meet the ball on a straight arm at the top of the jump (hitter's height + jump stat)
  const H =
    c === 'dive'
      ? d.pc
        ? 6
        : 10
      : c === 'spike'
        ? reachH(d, 1.15) + pk
        : c === 'serve'
          ? reachH(d, 1.13) + pk
          : c === 'block'
            ? reachH(d, 1.1) + pk
            : CONTACT_H[c] || 60;
  const off = (CONTACT_OFF[c] || 0) / VCS; // body-relative
  if (c === 'dive' && d.dv) {
    const L = Math.hypot(d.dv.dx * MX, d.dv.dz * MZ); // dive heading length, metres
    if (L > 0.4) {
      // just past the reaching hand, along the dive: unit heading (metres) × reach (metres), back to court units
      const m = off * MX;
      return { x: d.tx + (((d.dv.dx * MX) / L) * m) / MX + dx, z: d.tz + (((d.dv.dz * MZ) / L) * m) / MZ, h: H + dh };
    }
  }
  return { x: d.tx + dir * off + dx, z: d.tz, h: H + dh };
}

/* ---------- acts ---------- */

/** Act kinds that need their player in A.disp (a missing one is skipped and logged, not a crash every frame). */
const PLAYER_ACTS = new Set(['slide', 'pose', 'jump']);
/** Start of a beat: set up the tweened acts (slide, jump, ball…) and fire the one-shot ones (instant()). */
function startBeat(b) {
  Dir.beat(b); // the director (spec §2.15): stages this beat's effects, queues lines
  for (const a of b.acts) {
    if (a.when === 'end') continue;
    if (a.k === 'ball' || a.k === 'hold' || a.k === 'reset') A.bounce = null; // a new touch takes the ball back
    const d = a.p ? A.disp[a.p] : null;
    if (!d && PLAYER_ACTS.has(a.k)) {
      DBG.log('warn', `Act '${a.k}' for a player not on court (${a.p}) — skipped`);
      continue;
    }
    switch (a.k) {
      case 'reset':
        camRelease();
        A.rallyN = 0;
        comboEnd(true);
        for (const id in A.disp) {
          const q = A.disp[id];
          q.pose = 'ready';
          q.jy = 0;
          q.jmode = null;
          q.fallMs = null;
        }
        A.ball.vis = false;
        A.trailPow = 0;
        A.trail = [];
        break;
      case 'slide':
        d.slideN = (d.slideN || 0) + 1; // a new move order (landing from a jump keeps it, see stepPlayerTimers)
        maybeSqueak(d, a);
        d.sx = d.x;
        d.sz = d.z;
        d.tx = a.x;
        d.tz = a.z;
        d.carry = false;
        d.via = a.via || null; // run through a waypoint first (long back attack: back to the end line)
        // still in the air: no running until the feet are down (a broad jump's flight is fine)
        d.waitLand = !a.air && d.jy > 2 && moveM(d) > 1.5;
        d.landT = null;
        break;
      case 'hold':
        A.ball.follow = a.p;
        A.ball.vis = false; // appears in the server's hands once they're at their spot (followBall)
        A.dribble = true;
        // the server's routine before the serve (see preServe in ball.js): bounce it, or spin it and aim
        d.pose = 'preserve';
        d.pAge = 0;
        d.psv = { t: 0, kind: ((A.m.pts ? A.m.pts[0] + A.m.pts[1] : 0) + d.p.num) % 3 === 2 ? 'aim' : 'bounce' };
        break;
      case 'pose':
        startPose(d, a.pose, !!a.pc, b.dur);
        break;
      case 'jump':
        if (a.prompt === 'block' && (d.ownJ || (A.ask && A.ask.q.kind === 'block'))) {
          a._skip = true; // yours: you jump on your press (blockJump), not on the beat
          break;
        }
        if (d.ownJ) {
          if (a.mode !== 'down') {
            a._skip = true;
            break;
          }
          d.ownJ = null; // your block jump: the landing act takes it from here
        }
        d.jt = 0;
        d.jmode = { mode: a.mode, t0: a.t0 || 0, t1: a.t1 || 1, peak: a.peak || d.jy, start: d.jy };
        d.fallMs = null;
        d.landMs = null;
        if (a.mode === 'down' && (d.pose === 'spike' || d.pose === 'serve')) {
          if (d.spkHold) {
            d.spkHold = false; // swing already met the ball at the top of the jump
            d.spk = swingLead(d);
          } else d.spkPend = a.t0 || 0;
        }
        break;
      case 'ball':
        startBall(a);
        break;
      default:
        instant(a);
    }
  }
  if (A.airPend) airFlush(b); // a spike's air impact, along the flight just set up
  // the pass is on its way to the setter: they raise their hands early, ready for the ball (display only)
  for (const a of b.acts) {
    const sd = a.k === 'ball' && a.when !== 'end' && a.to && a.to.c === 'set' && a.to.p ? A.disp[a.to.p] : null;
    if (sd && sd.pose === 'ready' && sd.jy <= 2 && !diving(sd) && !sd.afterDive) startPose(sd, 'setprep', false, b.dur);
  }
  digChase(b);
  missCheck(b);
  preDigLook(b);
  preApproachLook(b);
  const ap = approachOf(b),
    hd = ap && A.disp[ap.p];
  if (hd) {
    const dir = Math.sign(ap.cx - NETX) || 1;
    ap.at = ap.rx == null || Math.hypot((hd.x - ap.rx) * MX, (hd.z - ap.rz) * MZ) <= 0.5 || dir * (hd.x - ap.rx) > 0 ? 0 : ap.t0 * 0.45;
    // too far from the run-up point to run up AND take off in time (a hitter coming off the block): straight to the take-off point
    ap.direct =
      ap.at > 0 &&
      ((Math.hypot((hd.x - ap.rx) * MX, (hd.z - ap.rz) * MZ) + Math.hypot((ap.rx - ap.ox) * MX, (ap.rz - ap.oz) * MZ)) / sprintOf(hd)) *
        1000 >
        ap.t0 * b.dur * 0.8;
    hd.app = ap;
  }
}
/** Gravity for players coming down from a jump (m/s²): 1.6× real, so landings feel snappy, not floaty. */
const FALL_G = 9.81 * 1.6;
/** Poses that wait for a dive to finish (anything else — a new dive, a set, a spike — takes over at once). */
const DIVE_KEEP = new Set(['ready', 'bump', 'huddle']);
/** A new pose at the start of a beat of `dur` ms (dig/receive: the engine already chose run-and-bump vs dive). */
function startPose(d, pose, pc, dur) {
  if (pose !== 'preserve') d.psv = null;
  // a player still on the floor from a dive finishes it (lie, push back up) before a passive pose takes over
  if (diving(d) && DIVE_KEEP.has(pose)) {
    d.afterDive = pose;
    return;
  }
  d.afterDive = null;
  if (d.pose !== pose || pose === 'bump' || pose === 'dive') d.swing = null;
  if (d.pose !== pose || pose === 'spike' || pose === 'serve') {
    d.spk = null;
    d.spkPend = null;
    d.spkHold = false;
    d.pt = 0;
  }
  if (d.pose !== pose && pose !== 'spike' && pose !== 'serve') d.spkStyle = null;
  d.pc = pc;
  if (d.dv && pose !== 'dive') d.gu = { t: 0, s: diveShape(d) };
  // dive heading: where the player is going, fixed at take-off
  d.dv = pose === 'dive' ? { t: 0, dur, dx: d.tx - d.x, dz: d.tz - d.z } : null;
  if (pose !== 'set') d.setDir = null;
  d.pose = pose;
  d.pAge = 0;
  if (d.jy <= 0) d.landMs = null;
}
/** Strongest speed-up of a hard hit along its flight (u − acc·u·(1−u): must stay < 1 to keep the ball moving forward). */
const BALL_ACC_MAX = 0.7;
/** A `ball` act: the ball leaves the last toucher (or the hand holding it) for resolve(a.to); sets up the tween. */
function startBall(a) {
  A.dribble = false;
  // the rally counter: one per touch — the server's toss leaves their own hand (the ball is held), so it isn't one
  if (!A.ball.follow) comboTouch((A.rallyN = (A.rallyN || 0) + 1));
  panAt(ballScreen().X);
  if (A.ball.follow) {
    followBall();
    sfx.toss();
  } else {
    const lc = A.lastC,
      lp = A.lastP && A.disp[A.lastP];
    if ((lc === 'bump' || lc === 'dive' || lc === 'set') && lp) {
      lp.swing = 0;
      touchFx(lc, A.ball.h < 40); // every player's touch pop; dug off the floor: a save spark (VFX.found)
    }
    const hd = (lc === 'spike' || lc === 'serve') && lp;
    if (hd) a._lag = Math.max(0, swingLead(hd) - (hd.spk || 0));
    // a hard hit leaves the hand and keeps accelerating (topspin + gravity): the harder, the stronger
    if (hd && a.trail) a._acc = clamp((a.trail - 30) / 100, 0, BALL_ACC_MAX);
    if (lc === 'bump' || lc === 'dive') sfx.bump();
    else if (lc === 'set') sfx.set();
    else if (lc === 'block') sfx.block();
  }
  // a ball sent into a block, or to a hitter's / server's hand: the 3D layer puts it right at the real hand(s)
  // (see handTouch in r3d)
  const bt =
    a.to.p && (a.to.c === 'block' || a.to.c === 'spike' || a.to.c === 'serve')
      ? { p: a.to.p, c: a.to.c, b: A.beats && A.beats[A.bi] } // b: the beat of this flight (its progress drives the pull)
      : null;
  if (!bt && A.handTouch) {
    A.handLast = A.handTouch;
    A.handRel = performance.now();
  }
  A.handTouch = bt;
  A.lastC = a.to.c || null;
  A.lastP = a.to.p || null;
  A.ball.follow = null;
  A.ball.vis = true;
  a._f = { x: A.ball.x, z: A.ball.z, h: A.ball.h };
  a._t = resolve(a.to);
  clearNet(a);
  A.trailPow = a.trail || 0;
  A.wob = !!a.wob;
  A.trailOp = !!a.op;
  A.trailEl = a.el || null;
  if (!a.trail) A.trail = [];
}
/**
 * One-shot act: effects, labels, sounds, UI. Called at a beat's start, at its end for `when: 'end'` acts, and by the
 * match screen (coach talk). The handlers live in ACTS (acts.js), by concern.
 */
function instant(a) {
  const bs = ballScreen(),
    d = a.p ? A.disp[a.p] : null;
  panAt(d ? P(d.x, d.z, 0).X : bs.X);
  const f = ACTS[a.k];
  if (f) f(a, d, bs);
}
/** Full-screen flash of `alpha` in colour `rgb` ('r,g,b'); off with reduced motion. Returns whether it flashed. */
function flashScreen(alpha, rgb) {
  if (RM) return false;
  A.flash = alpha;
  A.flashC = rgb;
  return true;
}
/** Jump arc used once a free fall has landed (d.jmode cleared). */
const NO_JUMP = { t0: 0, t1: 1, peak: 0, start: 0 };
/** Tween the beat's acts to progress t (0..1): ball flight, jump arcs, swing timing, and every player's move. */
function applyBeat(b, t) {
  for (const a of b.acts) {
    if (a.when === 'end') continue;
    if (a.k === 'ball') tweenBall(a, b, t);
    else if (a.k === 'jump') {
      const d = A.disp[a.p];
      if (d && !a._skip) tweenJump(d, a, b, t);
    }
  }
  if (A.preDig && !A.preDig.go && t >= PREDIG_AT) preDigGo();
  if (A.preApp && !A.preApp.go && t >= PREAPP_AT) preApproachGo();
  const e = ease(t);
  for (const id in A.disp) {
    const d = A.disp[id];
    if (d.fallMs != null && d.airV) continue; // coming down from a jump: momentum carries them (stepPlayerTimers)
    if (diving(d) && d.dv.t > d.dv.dur) continue; // on the floor: runs on only once back up (endBeat carries the move)
    if (d.app && !d.waitLand && approachMove(d, t)) continue; // spike approach: run-up, take-off, broad jump
    if (d.tx === d.sx && d.tz === d.sz) continue;
    if (id === A.digHero && d.waitLand && d.jy <= 1 && (d.landMs == null || d.landMs > 60)) d.waitLand = false; // feet down: go
    if ((d.carry || id === A.digHero) && !d.waitLand) {
      capMove(d, d.tx, d.tz); // catching up from the last beat, or chasing a far dig: straight there at a sprint
      continue;
    }
    if (d.via && !d.waitLand) {
      const v = d.via,
        first = t < v.at,
        k = first ? ease(t / v.at) : ease((t - v.at) / (1 - v.at));
      capMove(d, first ? lerp(d.sx, v.x, k) : lerp(v.x, d.tx, k), first ? lerp(d.sz, v.z, k) : lerp(v.z, d.tz, k));
      continue;
    }
    let u = e;
    if (d.waitLand) {
      if (d.landT == null && d.jy <= 1 && (d.landMs == null || d.landMs > 150)) d.landT = t; // feet down, knees absorb, go
      u = d.landT == null ? 0 : ease(clamp((t - d.landT) / Math.max(0.05, 1 - d.landT), 0, 1));
    }
    capMove(d, lerp(d.sx, d.tx, u), lerp(d.sz, d.tz, u));
  }
  separate();
  airMomentum();
}
/** Ball along its arc (lift a.h at the middle), late off a hand still swinging, accelerating after a hard hit. */
function tweenBall(a, b, t) {
  let u = a._lag ? clamp((t * b.dur - a._lag) / Math.max(1, b.dur - a._lag), 0, 1) : t; // hand still on its way
  if (a._acc) u -= a._acc * u * (1 - u); // slower off the hand, faster into the floor
  A.ball.x = lerp(a._f.x, a._t.x, u);
  A.ball.z = lerp(a._f.z, a._t.z, u);
  A.ball.h = lerp(a._f.h, a._t.h, u) + (a.h || 0) * 4 * u * (1 - u);
  if (a.wob) {
    // floater: drifts sideways and dips
    A.ball.z += Math.sin(u * Math.PI * 4) * 0.022;
    A.ball.h += Math.sin(u * Math.PI * 6) * 5 * (1 - u);
  }
}
/** Jump modes: up (rise to the peak), reup (land, then up again), down (free fall from here), other = a hop. */
function tweenJump(d, a, b, t) {
  const J = d.jmode || NO_JUMP,
    span = J.t1 - J.t0,
    l = span > 0 ? clamp((t - J.t0) / span, 0, 1) : t >= J.t0 ? 1 : 0;
  if (d.spkPend != null && t >= d.spkPend) {
    d.spk = 0;
    d.spkPend = null;
    sfx.swish();
  }
  d.jt = t;
  if (a.mode === 'up' && (d.pose === 'spike' || d.pose === 'serve') && (d.spk == null || d.spkHold)) {
    // start the arm swing so the hand meets the ball exactly as it arrives at the top of the jump
    const lead = swingLead(d),
      left = (1 - t) * b.dur;
    if (left < lead) {
      if (d.spk == null) sfx.swish();
      d.spk = lead - left;
      d.spkHold = true;
    }
  }
  if (a.mode === 'up') d.jy = J.peak * (1 - Math.pow(1 - l, 2));
  else if (a.mode === 'reup')
    d.jy = t < 0.4 ? J.start * (1 - Math.pow(t / 0.4, 2)) : J.peak * (1 - Math.pow(1 - l, 2)) * (t >= J.t0 ? 1 : 0);
  else if (a.mode === 'down') {
    if (d.jmode && d.fallMs == null && d.landMs == null && t >= d.jmode.t0 && d.jy > 0) {
      d.fallMs = 0; // free fall (see stepPlayerTimers)
      d.fallH = d.jmode.start;
    }
  } else d.jy = (a.peak || 0) * Math.sin(Math.PI * l);
}
/** Move toward (x, z) no faster than a real sprint: a move the beat is too short for carries into the next beat. */
function capMove(d, x, z) {
  const dm = Math.hypot((x - d.x) * MX, (z - d.z) * MZ),
    lim = (sprintOf(d) * ((d.p && d.p.id === A.digHero ? A.rdt : A.fdt) || 16)) / 1000; // the digger runs on real time
  const k = dm > lim ? lim / dm : 1;
  d.x += (x - d.x) * k;
  d.z += (z - d.z) * k;
}
/** End of a beat: settle or carry unfinished moves, end jumps, hide cut-ins, fire `when: 'end'` acts. */
function endBeat(b) {
  for (const id in A.disp) {
    const d = A.disp[id];
    d.app = null;
    // not there yet (landed late, or the move was longer than a sprint allows): keep running in the next beat
    if (moveM(d) > 0.05) {
      d.sx = d.x;
      d.sz = d.z;
      d.waitLand = d.jy > 1 || (d.landMs != null && d.landMs < 150); // still coming down
      d.landT = null;
      d.carry = true;
      d.via = null;
      continue;
    }
    d.carry = false;
    d.waitLand = false;
    d.via = null;
    d.x = d.sx = d.tx;
    d.z = d.sz = d.tz;
  }
  for (const a of b.acts) {
    const d = a.k === 'jump' ? A.disp[a.p] : null;
    if (d && a.mode !== 'up' && a.mode !== 'reup' && !(a.mode === 'down' && d.fallMs != null)) {
      d.jy = 0;
      d.jmode = null;
    }
    if (a.when === 'end') instant(a);
  }
}

/** Your block jump (blockJump): rise over `up` ms of game time, then free fall from the top (stepPlayerTimers lands you). */
function ownJumps(dt) {
  for (const id in A.disp) {
    const d = A.disp[id],
      J = d.ownJ;
    if (!J) continue;
    J.t += dt;
    const l = Math.min(1, J.t / J.up);
    d.jy = J.peak * (1 - Math.pow(1 - l, 2));
    if (l >= 1) {
      d.ownJ = null;
      d.fallMs = 0;
      d.fallH = d.jy;
    }
  }
}

/* ---------- the rally source ---------- */

/**
 * Get beats to play (spec §2.16, T-256). A match without a human player plays each rally whole (playRally). A match you play
 * (career, or the Monster game's Play as) runs the pausable rally: at your decision points of a prompt kind (promptWanted)
 * the prompt opens (A.ask) and the beats already queued keep playing — the window; the rest are answered with the AI's play
 * at once. `pick` (the press or null) resumes it when the window's beats ran out. Playback keeps its own shallow copies of
 * the beats; a resumed rally only adds beats after the ones already copied (the engine never inserts before a decision point).
 */
function rallyPull(pick) {
  const m = A.m;
  if (!m.human) {
    const r = playRally(m);
    A.beats = r.beats.map(b => ({ ...b }));
    A.bi = 0;
    return;
  }
  let r;
  if (!A.gen) {
    A.gen = playRallyGen(m);
    A.beats = [];
    A.bi = 0;
    r = A.gen.next();
  } else r = A.gen.next(pick);
  while (!r.done && !promptWanted(r.value)) r = A.gen.next(r.value.ai);
  if (r.done) A.gen = null;
  else promptOpen(r.value);
  const src = m.beats || [];
  for (let i = A.beats.length; i < src.length; i++) A.beats.push({ ...src[i] });
}
/** Play out a suspended rally at once with the AI's choices (skip to the result, leaving): the engine never stays half-way. */
function rallyFlush() {
  if (!A || !A.gen) return;
  let r = A.gen.next(A.ask ? A.ask.q.ai : undefined);
  while (!r.done) r = A.gen.next(r.value.ai);
  A.gen = null;
  promptClose();
}

/* ---------- per frame ---------- */

/** Advance playback by dt ms of (speed-scaled) real time: timers, effects, the current beat, then the next. */
function step(dt) {
  const cb = A.beats && A.beats[A.bi],
    raw = dt > 0 ? dt : 0; // real (speed-scaled) time: the camera, the drill effect and freeze beats run on this
  timeScale(cb, raw);
  dt = raw * A.ts; // one clock for the whole world: ball, players, poses, hair, trails and particles (r3d reads A.ts)
  A.fdt = dt; // this frame's game time (sprint cap in capMove)
  A.rdt = raw; // real time: the digger chasing a far ball (A.digHero) runs on it
  drillStep(raw);
  stepPlayerTimers(dt, raw);
  ownJumps(dt);
  stepEffects(dt);
  camStep(raw);
  Dir.step(raw);
  if (A.done) {
    if (A.cele) stepCelebration(dt);
    return;
  }
  if (A.m.human != null) promptStep(); // your prompts (spec §2.16): under your feet, the setter's markers
  if (!A.beats || A.bi >= A.beats.length) {
    if (A.ask) return rallyPull(promptClose()); // the window ended: the press (or null) resumes the rally
    if (Dir.busy()) return; // a between-point exchange (spec §2.18) holds the next rally
    if (A.m.over) {
      finishMatch();
      return;
    }
    if (A.m.human != null && !A.gen) promptCaptain(); // between points: the captain's Fire up / Settle (spec §2.17)
    rallyPull();
    return;
  }
  const b = A.beats[A.bi];
  if (!b._s) {
    b._s = 1;
    A.el = 0;
    if (b.scene && b.scene > HYPE[G.hype].max) {
      b.dur = 1; // Hype setting: this staged scene is skipped
      b.acts = [];
    }
    if (!b.scene) endScene();
    startBeat(b);
  }
  A.el += b.scene ? playDt(raw) : b.freeze ? raw : dt;
  if (!(b.dur > 0)) {
    DBG.log('warn', `Beat ${A.bi} has no valid duration (${b.dur}) — skipped`, b.acts.map(a => a.k).join(','));
    b.dur = 1;
  }
  const t = Math.min(1, A.el / b.dur);
  if (A.ask) blockAuto(b, t); // your block: no press by the AI's take-off → the AI jumps you (spec §2.16)
  applyBeat(b, t);
  ballPhysics(dt);
  stepTrail();
  stepGait(dt);
  if (t >= 1) {
    endBeat(b);
    A.bi++;
  }
}
