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
const VT = 80, // logical y of the top of the view (the overlay's origin)
  FIG = 1.12; // figure scale: tag and swirl sizes per projected px of height
/** Court z (0..1 across) → x-comparable units, for on-screen distances (squeaks, gait, dust). */
const Z_TO_X = 420;
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
const reachH = (d, k) => (k * 1.8 * ((d.p && d.p.look && d.p.look.hgt) || 1) * 150) / 2.43;
/**
 * Swing timing shared with the 3D poses: ms from swing start to ball contact. A jumping hitter starts the swing this long
 * before the ball arrives (and holds the contact pose through cut-ins until the hit beat); otherwise the ball waits at
 * the contact point this long at the start of the hit beat, so the hand really meets it.
 */
const swingLead = d => (d.pose === 'serve' ? 70 : d.pose === 'spike' ? 150 : 0);
/** Metres per court unit (3D scale): MX along the long axis (x/1000 of it), MZ across (z 0..1). */
const MX = (1.5 * 2.43) / 150,
  MZ = 12;
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
  digChase(b);
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
  if (!d || d.via || b.cut || b.scene) return;
  // ms needed: still in the air (a blocker coming down) → the fall and the landing first, then the sprint
  const air = d.jy > 2 ? Math.sqrt((2 * d.jy * (2.43 / 150)) / 9.81) * 1000 + 60 : 0,
    need = air + (Math.hypot((d.tx - d.x) * MX, (d.tz - d.z) * MZ) / sprintOf(d)) * 1000,
    k = clamp((b.dur * 0.85) / Math.max(1, need), DIG_SLOW_MIN, 1);
  if (k > 0.92) return; // reachable at normal speed
  b._dig = k;
  A.digHero = a.to.p;
  if (d.dv) d.dv.dur /= k; // the dive plays out over the stretched beat, on the digger's own (real) clock
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
  A.rallyN = (A.rallyN || 0) + 1;
  panAt(ballScreen().X);
  if (A.ball.follow) {
    followBall();
    sfx.toss();
  } else {
    const lc = A.lastC,
      lp = A.lastP && A.disp[A.lastP];
    if ((lc === 'bump' || lc === 'dive' || lc === 'set') && lp) lp.swing = 0;
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
/** Flash tint colours (r,g,b) for the full-screen flash. */
const FLASH_WHITE = '255,255,255',
  FLASH_BOLT = '200,235,255',
  FLASH_GLASS = '220,240,255';
/**
 * One-shot act: effects, labels, sounds, UI. Called at a beat's start, at its end for `when: 'end'` acts, and by the
 * match screen (coach talk). Every act kind the engine emits needs a `case` here or in startBeat (a test checks).
 */
function instant(a) {
  const bs = ballScreen(),
    d = a.p ? A.disp[a.p] : null;
  panAt(d ? P(d.x, d.z, 0).X : bs.X);
  switch (a.k) {
    case 'burst':
      burst(a.pow, a.color);
      sfx.hit(a.pow);
      if (a.el) elemBurst(a.el, a.pow);
      if (a.op) {
        zap(a.pow);
        sfx.zap();
      }
      break;
    case 'impact': {
      // ball keeps its travel direction and bounces away, losing energy each hop
      const v = A.bv || { x: 0, z: 0, h: 0 };
      A.bounce = {
        vx: clamp(v.x * 0.42, -0.5, 0.5),
        vz: clamp(v.z * 0.42, -0.0012, 0.0012),
        vh: clamp(Math.abs(v.h) * 0.42, 0.12, 0.42),
        t: 0
      };
      impact(a.pow);
      if (a.kill) sfx.boom(a.pow, a.blk);
      else sfx.floor(a.pow);
      if (a.el) elemImpact(a.el, a.pow);
      if (a.op) {
        bolt(1.4);
        zap(a.pow);
        sfx.thunder();
        flashScreen(0.45, FLASH_BOLT);
      }
      break;
    }
    case 'label':
      A.labels.push({
        t: a.t,
        x: bs.X,
        y: bs.Y - 20 - (a.dy || 0),
        life: 1,
        big: a.big,
        small: a.small,
        pow: a.pow || 0,
        set: a.set,
        stamp: a.stamp
      });
      break;
    case 'shake':
      if (!RM) A.shake = Math.max(A.shake, a.amt);
      break;
    case 'lines':
      if (!RM) A.lines = { x: bs.X, y: bs.Y, life: 1, pow: a.pow };
      break;
    case 'flash':
      flashScreen(a.a, FLASH_WHITE);
      break;
    case 'real': {
      const t = resolve(a.to);
      A.real = { f: { X: bs.X, Y: bs.Y }, t: P(t.x, t.z, t.h), life: 1 };
      break;
    }
    case 'tech': {
      // technique name pops over the player who used it
      if (!d) break;
      const q = P(d.x, d.z, d.jy + 175);
      A.labels.push({ t: `✦ ${a.t}`, x: q.X, y: q.Y - (a.dy || 0), life: 1, big: 1, set: 1, pow: 100 });
      logLine(`✦ ${d.p.name} — ${a.t}`, 'set');
      if (G.cutMini) toast(d.p, null, a.t, 'Technique');
      const def = Object.values(SKILLS).find(s => s.name === a.t);
      sfx.tech(def && def.tech);
      break;
    }
    case 'tac':
      showTac(a.side);
      break;
    case 'plabel': {
      if (!d) break;
      const q = P(d.x, d.z, d.jy + 150);
      A.labels.push({ t: a.t, x: q.X, y: q.Y, life: 1, big: 1, set: 0, pow: 120 });
      if (/^BUFF Lv(\d)/.test(a.t)) sfx.buff(+a.t.slice(7));
      break;
    }
    case 'cam':
      camTo(a);
      break;
    case 'drill':
      // block break: the spinning ball grinds into an energy wall at the blocker's hands, cracks spread, then it shatters
      A.drill = {
        X: bs.X,
        Y: bs.Y,
        s: P(A.ball.x, A.ball.z, 0).s,
        t: 0,
        dur: DRILL_MS,
        col: a.color,
        el: a.el || null,
        lines: crackLines(8, 0.25, 4, 0.45, 16, 28, 1),
        away: d ? -DIR(d.side) : 0
      };
      sfx.drill(DRILL_MS / 1000 / Math.max(0.5, A.speed * PACE));
      break;
    case 'zoom':
      if (!RM) {
        A.zoom = Math.max(A.zoom || 0, a.amt);
        A.zc = { X: bs.X, Y: bs.Y };
      }
      break;
    case 'squash':
      A.squash = 1;
      break;
    case 'netshake':
      A.netShake = 1;
      sfx.net();
      break;
    case 'wall':
      if (d) A.wallFx = { z: d.z, top: 138 + d.jy + 10, el: a.el || null, life: 1 };
      break;
    case 'pose': // a pose change at the end of a beat (no swing / dive set-up)
      if (d && diving(d) && DIVE_KEEP.has(a.pose)) d.afterDive = a.pose;
      else if (d) {
        d.pose = a.pose;
        if (a.pose !== 'dive' && d.dv) {
          d.gu = { t: 0, s: diveShape(d) };
          d.dv = null;
        }
      }
      break;
    case 'spkstyle':
      if (d) d.spkStyle = a.st;
      break;
    case 'setdir':
      if (d) d.setDir = a.dir;
      break;
    case 'tobanner':
      A.toBanner = { side: a.side, life: 1, manual: a.manual };
      sfx.whistle();
      setTimeout(() => sfx.whistle(), 220);
      updTO();
      break;
    case 'coachtalk': {
      const c = A.coaches[a.side];
      c.type = 'talk';
      c.react = 1;
      c.talkT = 2400;
      c.bubble = a.text;
      A.coaches[1 - a.side].type = null;
      break;
    }
    case 'efx':
      if (a.el) elemBurst(a.el, a.pow);
      break;
    case 'call': // speech bubble over a player calling for the ball
      if (a.sc) {
        showSay(a); // scene line: a subtitle box under the close-up
        if (d) sfx.voice(d.p.num, true);
        break;
      }
      if (d) {
        d.call = { t: a.t, life: 1, soft: !!a.soft };
        sfx.voice(d.p.num, !a.soft && !!(A.zoneShown && A.zoneShown[d.side]));
      }
      break;
    case 'ghost':
      sfx.swish();
      A.ghost = { f: { X: bs.X, Y: bs.Y }, t: P(a.to.x, a.to.z, a.to.h), life: 1 };
      break;
    case 'shot': // staged scene camera (r3d frames it; null = back to the game camera)
      if (a.hype && a.hype > HYPE[G.hype].max) break; // an optional close-up (Hype off)
      A.shot = a.kind ? { kind: a.kind, p: a.p, p2: a.p2, el: a.el || null } : null;
      if (a.kind) {
        camRelease();
        sfx.cutShot();
      }
      break;
    case 'heart':
      sfx.heart(a.v || 1);
      break;
    case 'banner':
      showBanner(a);
      break;
    case 'cut':
      if (G.cutMini) toast(byId(a.p), null, a.title, a.sub, a.el);
      else showCut(a);
      if (a.el) sfx.zone();
      sfx.whoosh();
      if (!G.cutMini) sfx.stinger();
      break;
    case 'zbreak': {
      // glass-shatter over the side that lost its zone
      const c = P(sx(a.side, 290), 0.5, 90);
      spawnShards(70, {
        x: c.X,
        y: c.Y,
        rx: 40,
        ry: 30,
        v: [0.08, 0.45],
        lift: 0.1,
        s: [5, 13],
        dec: [0.0008, 0.0014],
        cols: ['#e6f7ff', '#9fe8ff', '#ffffff', A.m.t[a.side].color]
      });
      A.crack = { x: c.X, y: c.Y, lines: crackLines(9, 0.2, 5, 0.4, 25, 55, 0.7), life: 1 };
      if (flashScreen(0.5, FLASH_GLASS)) A.shake = Math.max(A.shake, 10);
      sfx.shatter();
      break;
    }
    case 'zone':
      sfx.zone();
      A.ptFlash = { side: a.side, life: 1 };
      break;
    case 'log':
      logLine(a.t, a.c);
      break;
    case 'score':
      board(a.snap);
      boxScore();
      break;
    case 'rot':
      board(a.snap);
      A.srvId = a.snap.rot[a.snap.serve][0];
      break;
    case 'point': {
      A.ptFlash = { side: a.side, life: 1 };
      sfx.whistle();
      A.cheer[a.side] = 1;
      if (a.big) A.cheerAll = 1;
      A.pointN++;
      const cw = A.coaches[a.side],
        cl = A.coaches[1 - a.side];
      cw.react = 1;
      cw.type = 'yay';
      if (a.big || a.streak >= 2) {
        cl.react = 1;
        cl.type = 'ugh';
      }
      if (a.streak >= 3 && !A.chant) A.chant = { side: a.side, life: 1, text: `${A.m.t[a.side].short}!  ${A.m.t[a.side].short}!` };
      if ((a.zone || A.pointN % 11 === 0) && !A.wave) A.wave = { x: -120 };
      break;
    }
    case 'combo':
      if (G.cutMini) toast(byId(a.p1), byId(a.p2), a.title, a.sub, a.el);
      else showCombo(a);
      sfx.whoosh();
      sfx.stinger();
      sfx.zone();
      break;
    case 'link':
      A.link = { p1: a.p1, p2: a.p2, life: 1, c: a.color };
      break;
  }
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
      if (d) tweenJump(d, a, b, t);
    }
  }
  const e = ease(t);
  for (const id in A.disp) {
    const d = A.disp[id];
    if (d.fallMs != null && d.airV) continue; // coming down from a jump: momentum carries them (stepPlayerTimers)
    if (d.tx === d.sx && d.tz === d.sz) continue;
    if (diving(d) && d.dv.t > d.dv.dur) continue; // on the floor: runs on only once back up (endBeat carries the move)
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
      d.airV = { vx, vz };
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
    if (a.k === 'cut' || a.k === 'combo') hideCut();
    const d = a.k === 'jump' ? A.disp[a.p] : null;
    if (d && a.mode !== 'up' && a.mode !== 'reup' && !(a.mode === 'down' && d.fallMs != null)) {
      d.jy = 0;
      d.jmode = null;
    }
    if (a.when === 'end') instant(a);
  }
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
  stepEffects(dt);
  camStep(raw);
  if (A.done) {
    if (A.cele) stepCelebration(dt);
    return;
  }
  if (!A.beats || A.bi >= A.beats.length) {
    if (A.m.over) {
      finishMatch();
      return;
    }
    const r = playRally(A.m);
    A.beats = r.beats;
    A.bi = 0;
    return;
  }
  const b = A.beats[A.bi];
  if (!b._s) {
    b._s = 1;
    A.el = 0;
    if (b.cut && G.cutMini) b.dur = 1; // mini cut-ins don't hold up play
    if (b.scene && b.scene > HYPE[G.hype].max) {
      b.dur = 1; // Hype setting: this staged scene is skipped
      b.acts = [];
    }
    if (!b.scene) endScene();
    startBeat(b);
  }
  A.el += b.cut || b.scene ? playDt(raw) : b.freeze ? raw : dt;
  if (!(b.dur > 0)) {
    DBG.log('warn', `Beat ${A.bi} has no valid duration (${b.dur}) — skipped`, b.acts.map(a => a.k).join(','));
    b.dur = 1;
  }
  const t = Math.min(1, A.el / b.dur);
  applyBeat(b, t);
  ballPhysics(dt);
  stepTrail();
  stepGait(dt);
  if (t >= 1) {
    endBeat(b);
    A.bi++;
  }
}
/** Per-player timers on the world clock: swings, pose age, free fall under gravity, landing, dive, call bubbles. */
function stepPlayerTimers(wdt, raw) {
  for (const id in A.disp) {
    const d = A.disp[id],
      dt = id === A.digHero ? raw : wdt; // the digger chasing a far ball moves at normal speed while the world slows
    if (d.swing != null) d.swing += dt;
    if (d.spk != null) d.spk = d.spkHold ? Math.min(d.spk + dt, swingLead(d)) : d.spk + dt;
    d.pt = (d.pt || 0) + dt;
    d.pAge = (d.pAge || 0) + dt;
    if (d.fallMs != null) {
      // real gravity: h = h0 − ½·g·t² (court h units: 150 = 2.43 m); fallH because jmode can be cleared mid-fall
      d.fallMs += dt;
      if (d.airV) {
        // momentum from the take-off carries on until touchdown (never over the net)
        d.x = d.side === 0 ? Math.min(NETX - 8, d.x + d.airV.vx * dt) : Math.max(NETX + 8, d.x + d.airV.vx * dt);
        d.z = clamp(d.z + d.airV.vz * dt, -0.3, 1.3);
      }
      d.jy = Math.max(0, d.fallH - (0.5 * 9.81 * Math.pow(d.fallMs / 1000, 2) * 150) / 2.43);
      if (d.jy <= 0) {
        d.fallMs = null;
        d.jmode = null;
        d.landMs = 0; // touchdown
      }
    }
    if (d.landMs != null) d.landMs += dt;
    if (d.psv && d.pose === 'preserve' && moveM(d) < 0.15) d.psv.t += dt; // the routine starts once at the service spot
    if (d.dv) {
      d.dv.t += dt;
      if (!d.dv.hit && d.dv.t >= d.dv.dur * 0.75) {
        d.dv.hit = 1; // chest hits the floor
        panAt(P(d.x, d.z, 0).X);
        sfx.slide();
      }
      if (d.afterDive && !diving(d)) {
        d.pose = d.afterDive === 'bump' ? 'ready' : d.afterDive; // the pass is long gone: back to ready
        d.afterDive = null;
        d.dv = null;
        d.pAge = 0;
      }
    }
    // landing thud after a real jump (peak height remembered in _air)
    if (d.jy > 20) d._air = Math.max(d._air || 0, d.jy);
    else if (d._air && d.jy < 3) {
      panAt(P(d.x, d.z, 0).X);
      sfx.land(d._air);
      d._air = 0;
    }
    if (d.gu) d.gu.t += dt;
    if (d.call && (d.call.life -= dt / 1300) <= 0) d.call = null;
  }
}
/** Measured motion for the 3D poses (speed mv, lateral share lat, facing fwd, gait phase) and running dust. */
function stepGait(dt) {
  for (const id in A.disp) {
    const d = A.disp[id];
    const dx = d.x - (d._px == null ? d.x : d._px),
      dz = (d.z - (d._pz == null ? d.z : d._pz)) * Z_TO_X,
      dist = Math.hypot(dx, dz),
      spd = dist / Math.max(dt, 1);
    d.mv = lerp(d.mv || 0, spd, 0.35);
    if (dist > 0.01) {
      d.lat = lerp(d.lat || 0, Math.abs(dz) / dist, 0.3);
      d.fwd = Math.sign(dx * DIR(d.side)) || d.fwd || 0;
    }
    d.gait = (d.gait || 0) + dist * 0.11;
    d._px = d.x;
    d._pz = d.z;
    if (d.mv > 0.14 && d.jy < 2 && R() < dt / 70) {
      const q = P(d.x, d.z, 0);
      addPart({
        x: q.X + rnd(-6, 6),
        y: q.Y,
        vx: rnd(-0.03, 0.03) - DIR(d.side) * (d.fwd || 0) * 0.04,
        vy: -rnd(0.01, 0.04),
        grow: 0.02,
        s: 3,
        life: 1,
        dec: 0.003,
        kind: 'dust'
      });
    }
    if (d.pose === 'dive' && d.mv > 0.08 && R() < dt / 30) {
      const q = P(d.x, d.z, 0);
      addPart({
        x: q.X + rnd(-10, 10),
        y: q.Y,
        vx: rnd(-0.05, 0.05),
        vy: -rnd(0.02, 0.06),
        grow: 0.03,
        s: 4,
        life: 1,
        dec: 0.0025,
        kind: 'dust'
      });
    }
  }
}
/** Match over: winners bounce, losers slump, coaches react, confetti in the winners' colours for 7 s. */
function stepCelebration(dt) {
  const C = A.cele;
  C.t += dt;
  for (const id in A.disp) {
    const d = A.disp[id];
    if (d.side === C.w) {
      d.pose = 'block';
      d.jy = Math.abs(Math.sin(C.t * 0.008 + d.x * 0.05)) * 38;
    } else {
      d.pose = 'slump';
      d.jy = 0;
    }
  }
  A.coaches[C.w].react = 1;
  A.coaches[C.w].type = 'yay';
  A.coaches[1 - C.w].react = 1;
  A.coaches[1 - C.w].type = 'ugh';
  if (C.t < 7000 && R() < dt / 18) {
    const col = pick([A.m.t[C.w].color, '#ffffff', '#ffd84d', A.m.t[C.w].color]);
    addPart({
      kind: 'conf',
      x: rnd(-20, 1020),
      y: VT - 10,
      vx: rnd(-0.03, 0.03),
      vy: rnd(0.05, 0.11),
      rot: R() * 6,
      vr: rnd(-0.012, 0.012),
      s: rnd(4, 7),
      life: 1,
      dec: 0.00022,
      c: col
    });
  }
}
