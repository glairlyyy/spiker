// Plays engine beats: 2.5D projection, beat timeline, per-frame simulation of visuals.

const FY = 505,
  DEPTH = 175,
  SK = -45,
  VT = 80,
  FIG = 1.12;
/** Court → screen. On a bigger court the floor keeps its size on screen and everything with height
 * (players, ball, net, jumps) shrinks by the court scale — a zoomed-out camera. */
function P(x, z, h) {
  if (P3D) return P3D(x, z, h);
  const s = (1 - 0.3 * z) / VCS;
  return { X: 522 + (x - 500) * s * VCS + SK * z, Y: FY - DEPTH * z - h * s, s };
}
let VCS = 1; // visual court scale of the match on screen
/** 3D view (Monster 3D): the renderer module, and its court → screen projection that replaces P() while it is on. */
let R3D = null,
  P3D = null;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** Height (court h units, 150 = 2.43 m net) of the ball's centre `k` × body height up — 1.15 = on a straight arm overhead. */
const reachH = (d, k) => (k * 1.8 * ((d.p && d.p.look && d.p.look.hgt) || 1) * 150) / 2.43;
// Swing timing shared with the 3D poses: ms from swing start to ball contact. A jumping hitter starts the swing
// this long before the ball arrives (and holds the contact pose through cut-ins until the hit beat); otherwise the
// ball waits at the contact point this long at the start of the hit beat, so the hand really meets it.
const swingLead = d => (d.pose === 'serve' ? 70 : d.pose === 'spike' ? 150 : 0);
// metres per court unit (3D scale): x/1000 of the long axis, z across
const MX = (1.5 * 2.43) / 150,
  MZ = 12;
const moveM = d => Math.hypot((d.tx - d.x) * MX, (d.tz - d.z) * MZ);
function resolve(to) {
  if (to.x != null) return { x: to.x, z: to.z, h: to.h };
  const d = A.disp[to.p],
    dir = DIR(d.side),
    pk = d.jmode && (d.jmode.mode === 'up' || d.jmode.mode === 'reup') ? d.jmode.peak : d.jy,
    dx = to.dx || 0,
    dh = to.dh || 0;
  // dive: the ball meets the outstretched hands just off the floor, well ahead of the hips
  // spikes and serves meet the ball on a straight arm at the top of the jump (hitter's height + jump stat)
  const c = (to.c === 'bump' || to.c === 'dive') && (d.pose === 'bump' || d.pose === 'dive') ? d.pose : to.c;
  const H = { bump: 48, dive: d.pc ? 6 : 10, set: 122, spike: reachH(d, 1.15) + pk, serve: reachH(d, 1.13) + pk, block: reachH(d, 1.1) + pk }[c] || 60;
  const off = ({ bump: 24, dive: 20, set: 8, spike: 6, serve: 7, block: 12 }[c] || 0) / VCS; // body-relative
  if (c === 'dive' && d.dv && Math.hypot(d.dv.dx * MX, d.dv.dz * MZ) > 0.4) {
    // just past the reaching hand, along the dive
    const L = Math.hypot(d.dv.dx * MX, d.dv.dz * MZ),
      m = off * MX;
    return { x: d.tx + ((d.dv.dx * MX) / L) * (m / MX) + dx, z: d.tz + ((d.dv.dz * MZ) / L) * (m / MZ), h: H + dh };
  }
  return { x: d.tx + dir * off + dx, z: d.tz, h: H + dh };
}
/**
 * Net clearance: a ball that the engine sends across the net (a legal serve / attack / free ball) must pass over the
 * tape with room to spare — ball radius plus a margin — instead of cutting through the mesh. Errors never cross:
 * the engine ends those at the net or out, decided by chance and the player's skill (engine/formulas.js).
 */
const NET_CLEAR = 150 + 18; // tape (2.43 m) + ~0.29 m: the ball's radius and a margin, in court h units
function clearNet(a) {
  const f = a._f,
    t = a._t;
  if ((f.x - NETX) * (t.x - NETX) >= 0) return; // doesn't cross
  const u = (NETX - f.x) / (t.x - f.x),
    k = 4 * u * (1 - u),
    at = lerp(f.h, t.h, u) + (a.h || 0) * k,
    need = NET_CLEAR + (a.wob ? 6 : 0); // a floater's wobble needs a little more room
  if (at < need && k > 0.05) a.h = (a.h || 0) + (need - at) / k; // lift the arc (topspin loop) just enough
}
function ballScreen() {
  return P(A.ball.x, A.ball.z, A.ball.h);
}
function followBall() {
  const f = A.disp[A.ball.follow];
  A.ball.x = f.x + (DIR(f.side) * 16) / VCS;
  A.ball.z = f.z;
  if (A.dribble && f.pose !== 'serve') {
    const c = Math.abs(Math.cos(performance.now() * 0.0075));
    A.ball.h = 6 + 58 * c;
    if (c < 0.08 && !A.bnc) {
      A.bnc = 1;
      sfx.bounce();
    } else if (c > 0.3) A.bnc = 0;
  } else A.ball.h = 72 + f.jy;
}
function startBeat(b) {
  for (const a of b.acts) {
    if (a.when === 'end') continue;
    if (a.k === 'ball' || a.k === 'hold' || a.k === 'reset') A.bounce = null; // a new touch takes the ball back
    const d = a.p ? A.disp[a.p] : null;
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
      case 'slide': {
        const far = Math.hypot(a.x - d.x, (a.z - d.z) * 420);
        if (far > 80 && performance.now() - (A.sqT || 0) > 180 && Math.random() < 0.45) {
          A.sqT = performance.now();
          const X = P(d.x, d.z, 0).X;
          setTimeout(() => {
            panAt(X);
            sfx.squeak();
          }, 40 + Math.random() * 160);
        }
      }
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
        A.ball.vis = true;
        A.dribble = true;
        break;
      case 'pose': {
        const pose = a.pose; // dig/receive: the engine already chose run-and-bump vs dive by reachability
        if (d.pose !== pose || pose === 'bump' || pose === 'dive') d.swing = null;
        if (d.pose !== pose || pose === 'spike' || pose === 'serve') {
          d.spk = null;
          d.spkPend = null;
          d.spkHold = false;
          d.pt = 0;
        }
        if (d.pose !== pose && pose !== 'spike' && pose !== 'serve') d.spkStyle = null;
        d.pc = !!a.pc;
        if (d.dv && pose !== 'dive') d.gu = { t: 0, s: diveShape(d) };
        // dive heading: where the player is going, fixed at take-off
        d.dv = pose === 'dive' ? { t: 0, dur: b.dur, dx: d.tx - d.x, dz: d.tz - d.z } : null;
        if (pose !== 'set') d.setDir = null;
        d.pose = pose;
        d.pAge = 0;
        if (d.jy <= 0) d.landMs = null;
        break;
      }
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
      case 'ball': {
        A.dribble = false;
        A.rallyN = (A.rallyN || 0) + 1;
        panAt(ballScreen().X);
        if (A.ball.follow) {
          followBall();
          sfx.toss();
        } else {
          const lc = A.lastC;
          if ((lc === 'bump' || lc === 'dive' || lc === 'set') && A.lastP && A.disp[A.lastP]) A.disp[A.lastP].swing = 0;
          const hd = (lc === 'spike' || lc === 'serve') && A.lastP && A.disp[A.lastP];
          if (hd) a._lag = Math.max(0, swingLead(hd) - (hd.spk || 0));
          // a hard hit leaves the hand and keeps accelerating (topspin + gravity): the harder, the stronger
          if (hd && a.trail) a._acc = clamp((a.trail - 40) / 150, 0, 0.35);
          if (lc === 'bump' || lc === 'dive') sfx.bump();
          else if (lc === 'set') sfx.set();
          else if (lc === 'block') sfx.block();
        }
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
        break;
      }
      default:
        instant(a);
    }
  }
}
function instant(a) {
  const bs = ballScreen();
  panAt(a.p && A.disp[a.p] ? P(A.disp[a.p].x, A.disp[a.p].z, 0).X : bs.X);
  switch (a.k) {
    case 'burst':
      burst(bs.X, bs.Y, a.pow, a.color);
      sfx.hit(a.pow);
      if (a.el) elemBurst(a.el, bs.X, bs.Y, a.pow);
      if (a.op) {
        zap(bs.X, bs.Y, a.pow);
        sfx.zap();
      }
      break;
    case 'impact': {
      const g = P(A.ball.x, A.ball.z, 0);
      // ball keeps its travel direction and bounces away, losing energy each hop
      const v = A.bv || { x: 0, z: 0, h: 0 };
      A.bounce = {
        vx: clamp(v.x * 0.42, -0.5, 0.5),
        vz: clamp(v.z * 0.42, -0.0012, 0.0012),
        vh: clamp(Math.abs(v.h) * 0.42, 0.12, 0.42),
        t: 0
      };
      impact(g.X, g.Y, a.pow, g.s);
      if (a.kill) sfx.boom(a.pow, a.blk);
      else sfx.floor(a.pow);
      if (a.el) elemImpact(a.el, g.X, g.Y, a.pow, g.s);
      if (a.op) {
        bolt(g.X, g.Y, 1.4);
        zap(g.X, g.Y, a.pow);
        sfx.thunder();
        if (!RM) {
          A.flash = 0.45;
          A.flashC = '200,235,255';
        }
      }
      break;
    }
    case 'label':
      // crowd reacts: gasp on great defense, groan on errors
      if (/dig|COVER|Pancake/i.test(a.t)) setTimeout(() => sfx.ooh(), 120);
      else if (/^(Out|Net|Long|Into the net|Double contact|Bad set)/.test(a.t)) setTimeout(() => sfx.aww(), 150);
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
      if (!RM) {
        A.flash = a.a;
        A.flashC = '255,255,255';
      }
      break;
    case 'real': {
      const t = resolve(a.to),
        q = P(t.x, t.z, t.h);
      A.real = { f: { X: bs.X, Y: bs.Y }, t: q, life: 1 };
      break;
    }
    case 'tech': {
      // technique name pops over the player who used it
      const d = A.disp[a.p];
      if (!d) break;
      const q = P(d.x, d.z, d.jy + 175);
      A.labels.push({ t: `✦ ${a.t}`, x: q.X, y: q.Y - (a.dy || 0), life: 1, big: 1, set: 1, pow: 100 });
      logLine(`✦ ${d.p.name} — ${a.t}`, 'set');
      if (G.cutMini) toast(d.p, null, a.t, 'Technique');
      const def = Object.values(SKILLS).find(s => s.name === a.t);
      sfx.tech(def && def.tech);
      if (a.t === 'Desperation Save' || a.t === 'Rolling Receive') setTimeout(() => sfx.ooh(), 150);
      break;
    }
    case 'tac':
      showTac(a.side);
      break;
    case 'plabel': {
      const d = A.disp[a.p],
        q = P(d.x, d.z, d.jy + 150);
      A.labels.push({ t: a.t, x: q.X, y: q.Y, life: 1, big: 1, set: 0, pow: 120 });
      if (/^BUFF Lv(\d)/.test(a.t)) sfx.buff(+a.t.slice(7));
      break;
    }
    case 'cam':
      camTo(a);
      break;
    case 'drill': {
      // block break: the spinning ball grinds into an energy wall at the blocker's hands, cracks spread, then it shatters
      const lines = [];
      for (let i = 0; i < 8; i++) {
        let an = (i / 8) * Math.PI * 2 + rnd(-0.25, 0.25),
          x = 0,
          y = 0;
        const l = [[0, 0]];
        for (let k = 0; k < 4; k++) {
          an += rnd(-0.45, 0.45);
          const st = rnd(16, 28);
          x += Math.cos(an) * st;
          y += Math.sin(an) * st;
          l.push([x, y]);
        }
        lines.push(l);
      }
      A.drill = { X: bs.X, Y: bs.Y, s: P(A.ball.x, A.ball.z, 0).s, t: 0, dur: 560, col: a.color, el: a.el || null, lines, away: A.disp[a.p] ? -DIR(A.disp[a.p].side) : 0 };
      sfx.drill(0.56 / Math.max(0.5, A.speed * PACE));
      break;
    }
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
    case 'wall': {
      const d = A.disp[a.p];
      A.wallFx = { z: d.z, top: 138 + d.jy + 10, el: a.el || null, life: 1 };
      break;
    }
    case 'pose':
      if (A.disp[a.p]) {
        A.disp[a.p].pose = a.pose;
        const q = A.disp[a.p];
        if (a.pose !== 'dive' && q.dv) {
          q.gu = { t: 0, s: diveShape(q) };
          q.dv = null;
        }
      }
      break;
    case 'spkstyle':
      if (A.disp[a.p]) A.disp[a.p].spkStyle = a.st;
      break;
    case 'setdir':
      if (A.disp[a.p]) A.disp[a.p].setDir = a.dir;
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
      if (a.el) elemBurst(a.el, bs.X, bs.Y, a.pow);
      break;
    case 'call': // speech bubble over a player calling for the ball
      if (a.sc) {
        showSay(a); // scene line: a subtitle box under the close-up
        if (A.disp[a.p]) sfx.voice(A.disp[a.p].p.num, true);
        break;
      }
      if (A.disp[a.p]) {
        A.disp[a.p].call = { t: a.t, life: 1, soft: !!a.soft };
        sfx.voice(A.disp[a.p].p.num, !a.soft && !!(A.zoneShown && A.zoneShown[A.disp[a.p].side]));
      }
      break;
    case 'ghost': {
      sfx.swish();
      const t = P(a.to.x, a.to.z, a.to.h);
      A.ghost = { f: { X: bs.X, Y: bs.Y }, t, life: 1 };
      break;
    }
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
      for (let i = 0; i < 70; i++) {
        const an = R() * Math.PI * 2,
          v = rnd(0.08, 0.45);
        A.parts.push({
          kind: 'shard',
          x: c.X + rnd(-40, 40),
          y: c.Y + rnd(-30, 30),
          vx: Math.cos(an) * v,
          vy: Math.sin(an) * v - 0.1,
          g: 0.0009,
          rot: R() * 6,
          vr: rnd(-0.02, 0.02),
          s: rnd(5, 13),
          life: 1,
          dec: rnd(0.0008, 0.0014),
          c: pick(['#e6f7ff', '#9fe8ff', '#ffffff', A.m.t[a.side].color])
        });
      }
      const lines = [];
      for (let i = 0; i < 9; i++) {
        let an = (i / 9) * Math.PI * 2 + rnd(-0.2, 0.2),
          x = 0,
          y = 0;
        const l = [[0, 0]];
        for (let k = 0; k < 5; k++) {
          an += rnd(-0.4, 0.4);
          const st = rnd(25, 55);
          x += Math.cos(an) * st;
          y += Math.sin(an) * st * 0.7;
          l.push([x, y]);
        }
        lines.push(l);
      }
      A.crack = { x: c.X, y: c.Y, lines, life: 1 };
      if (!RM) {
        A.flash = 0.5;
        A.flashC = '220,240,255';
        A.shake = Math.max(A.shake, 10);
      }
      sfx.shatter();
      break;
    }
    case 'zone':
      sfx.zone();
      sfx.cheer(1);
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
      if (A.speed < 4 || a.big) sfx.cheer(a.big ? 1 : 0.35);
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
      if (a.streak >= 3 && !A.chant) {
        A.chant = { side: a.side, life: 1, text: `${A.m.t[a.side].short}!  ${A.m.t[a.side].short}!` };
        sfx.chant();
      }
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
function applyBeat(b, t) {
  for (const a of b.acts) {
    if (a.when === 'end') continue;
    const d = a.p ? A.disp[a.p] : null;
    if (a.k === 'ball') {
      let u = a._lag ? clamp((t * b.dur - a._lag) / Math.max(1, b.dur - a._lag), 0, 1) : t; // hand still on its way
      if (a._acc) u -= a._acc * u * (1 - u); // slower off the hand, faster into the floor
      A.ball.x = lerp(a._f.x, a._t.x, u);
      A.ball.z = lerp(a._f.z, a._t.z, u);
      A.ball.h = lerp(a._f.h, a._t.h, u) + a.h * 4 * u * (1 - u);
      if (a.wob) {
        A.ball.z += Math.sin(u * Math.PI * 4) * 0.022;
        A.ball.h += Math.sin(u * Math.PI * 6) * 5 * (1 - u);
      }
    }
    if (a.k === 'jump') {
      const J = d.jmode || { t0: 0, t1: 1, peak: 0, start: 0 }, // null once a free fall has landed
        l = clamp((t - J.t0) / (J.t1 - J.t0), 0, 1);
      if (d.spkPend != null && t >= d.spkPend) {
        d.spk = 0;
        d.spkPend = null;
        if (A.disp[a.p] === d && d !== undefined) sfx.swish();
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
      else if (a.mode === 'reup') {
        d.jy =
          t < 0.4
            ? J.start * (1 - Math.pow(t / 0.4, 2))
            : J.peak * (1 - Math.pow(1 - l, 2)) * (t >= J.t0 ? 1 : 0);
      } else if (a.mode === 'down') {
        if (d.jmode && d.fallMs == null && d.landMs == null && t >= d.jmode.t0 && d.jy > 0) {
          d.fallMs = 0; // free fall (step)
          d.fallH = d.jmode.start;
        }
      }
      else d.jy = a.peak * Math.sin(Math.PI * l);
    }
  }
  const e = ease(t);
  for (const id in A.disp) {
    const d = A.disp[id];
    if (d.tx !== d.sx || d.tz !== d.sz) {
      let u = e;
      if (d.carry && !d.waitLand) {
        capMove(d, d.tx, d.tz); // catching up from the last beat: straight there at a sprint
        continue;
      }
      if (d.via && !d.waitLand) {
        const v = d.via,
          k = t < v.at ? ease(t / v.at) : ease((t - v.at) / (1 - v.at));
        capMove(d, t < v.at ? lerp(d.sx, v.x, k) : lerp(v.x, d.tx, k), t < v.at ? lerp(d.sz, v.z, k) : lerp(v.z, d.tz, k));
        continue;
      }
      if (d.waitLand) {
        if (d.landT == null && d.jy <= 1 && (d.landMs == null || d.landMs > 150)) d.landT = t; // feet down, knees absorb, go
        u = d.landT == null ? 0 : ease(clamp((t - d.landT) / Math.max(0.05, 1 - d.landT), 0, 1));
      }
      capMove(d, lerp(d.sx, d.tx, u), lerp(d.sz, d.tz, u));
    }
  }
}
/** Move toward (x, z) no faster than a real sprint: a move the beat is too short for carries into the next beat. */
function capMove(d, x, z) {
  const dm = Math.hypot((x - d.x) * MX, (z - d.z) * MZ),
    vmax = (6.5 + 3.5 * (((d.p && d.p.speed) || 60) / 100)) * (d.pose === 'dive' ? 1.35 : 1), // m/s
    lim = (vmax * (A.fdt || 16)) / 1000;
  const k = dm > lim ? lim / dm : 1;
  d.x += (x - d.x) * k;
  d.z += (z - d.z) * k;
}
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
    if (a.k === 'jump' && a.mode !== 'up' && a.mode !== 'reup' && !(a.mode === 'down' && A.disp[a.p].fallMs != null)) {
      A.disp[a.p].jy = 0;
      A.disp[a.p].jmode = null;
    }
    if (a.when === 'end') instant(a);
  }
}
/**
 * World time scale A.ts (1 = normal). A slow beat (slow: 1 → ×0.3, or a factor; optional window slowAt: [t0, t1] of the
 * beat) eases down over ~0.1 s and back up over ~0.16 s, so it reads as a camera effect rather than a hitch. Hit-stop
 * (freeze) and staged scenes (scene) drop to a near-stop at once. Also drives the audio muffle and the vignette.
 */
function timeScale(cb, raw) {
  const on = cb && cb._s,
    t = on ? Math.min(1, (A.el || 0) / Math.max(1, cb.dur)) : 0,
    win = !on || !cb.slowAt || (t >= cb.slowAt[0] && t <= cb.slowAt[1]),
    build = on && cb.sceneSlow && cb.sceneSlow <= HYPE[G.hype].max && t < 0.55; // after a scene: slow build-up, fast hit
  A.slowOn = !!((on && cb.slow && win && (!cb.hypeSlow || HYPE[G.hype].max >= cb.hypeSlow)) || build); // hypeSlow: scramble drama, off with Hype
  A.freezeOn = !!(on && cb.freeze);
  A.sceneOn = !!(on && cb.scene);
  A.slowK = A.slowOn ? (build ? 0.35 : cb.slow < 1 ? cb.slow : 0.3) : 1;
  const tgt = A.freezeOn ? 0.04 : A.sceneOn ? 0.03 : A.slowK;
  if (A.ts == null) A.ts = 1;
  if (tgt < 0.1) A.ts = Math.min(A.ts, tgt); // hit-stop / scene: instant
  else A.ts += (tgt - A.ts) * (1 - Math.exp(-raw / (tgt < A.ts ? 90 : 160)));
  if (Math.abs(A.ts - tgt) < 0.004) A.ts = tgt;
  const slow = A.ts < 0.75;
  if (slow !== !!A._slowFx) {
    A._slowFx = slow;
    sfx.slowmo(slow);
    const st = document.getElementById('stage');
    if (st) st.classList.toggle('slowmo', slow);
  }
}
function step(dt) {
  const cb = A.beats && A.beats[A.bi],
    raw = dt; // real (speed-scaled) time: the camera, the drill effect and freeze beats run on this
  timeScale(cb, raw);
  dt *= A.ts; // one clock for the whole world: ball, players, poses, hair, trails and particles (r3d reads A.ts)
  A.fdt = dt; // this frame's game time (sprint cap in capMove)
  drillStep(raw);
  for (const id in A.disp) {
    const d = A.disp[id];
    if (d.swing != null) d.swing += dt;
    if (d.spk != null) d.spk = d.spkHold ? Math.min(d.spk + dt, swingLead(d)) : d.spk + dt;
    d.pt = (d.pt || 0) + dt;
    d.pAge = (d.pAge || 0) + dt;
    if (d.fallMs != null) {
      // real gravity: h = h0 − ½·g·t² (court h units: 150 = 2.43 m)
      d.fallMs += dt;
      d.jy = Math.max(0, d.fallH - (0.5 * 9.81 * Math.pow(d.fallMs / 1000, 2) * 150) / 2.43); // fallH: jmode can be cleared mid-fall
      if (d.jy <= 0) {
        d.fallMs = null;
        d.jmode = null;
        d.landMs = 0; // touchdown
      }
    }
    if (d.landMs != null) d.landMs += dt;
    if (d.dv) {
      d.dv.t += dt;
      if (!d.dv.hit && d.dv.t >= d.dv.dur * 0.75) {
        d.dv.hit = 1; // chest hits the floor
        panAt(P(d.x, d.z, 0).X);
        sfx.slide();
      }
    }
    if (d.jy > 20) d._air = Math.max(d._air || 0, d.jy);
    else if (d._air && d.jy < 3) {
      panAt(P(d.x, d.z, 0).X);
      sfx.land(d._air);
      d._air = 0;
    }
    if (d.gu) d.gu.t += dt;
    if (d.call && (d.call.life -= dt / 1300) <= 0) d.call = null;
  }
  if (A.real) {
    A.real.life -= dt / 750;
    if (A.real.life <= 0) A.real = null;
  }
  for (const p of A.parts) {
    if (p.kind === 'wind') {
      p.an += p.w * dt;
      p.r += p.dr * dt;
      p.x = p.cx + Math.cos(p.an) * p.r;
      p.y = p.cy + Math.sin(p.an) * p.r * 0.55;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.g) p.vy += p.g * dt;
    }
    if (p.grow) p.s += p.grow * dt;
    if (p.rot != null) p.rot += p.vr * dt;
    p.life -= p.dec * dt;
  }
  A.parts = A.parts.filter(p => p.life > 0);
  if (A.parts.length > 900) A.parts.splice(0, A.parts.length - 900);
  if (A.decals) {
    for (const d of A.decals) d.life -= dt / 1600;
    A.decals = A.decals.filter(d => d.life > 0);
  }
  if (A.trailEl && A.trailPow && A.ball.vis) {
    const q = ballScreen();
    elemTrail(A.trailEl, q.X, q.Y, A.trailPow, dt);
  }
  for (const r of A.rings) {
    r.life -= dt / 420;
    r.r = lerp(r.r, r.max, 0.12);
  }
  A.rings = A.rings.filter(r => r.life > 0);
  for (const l of A.labels) {
    l.life -= dt / (l.big ? 1300 : 1000);
    l.y -= dt * 0.02;
  }
  A.labels = A.labels.filter(l => l.life > 0);
  if (A.lines) {
    A.lines.life -= dt / 380;
    if (A.lines.life <= 0) A.lines = null;
  }
  if (A.bolts) {
    for (const b of A.bolts) b.life -= dt / 260;
    A.bolts = A.bolts.filter(b => b.life > 0);
  }
  A.zoom = (A.zoom || 0) * Math.pow(0.993, dt);
  camStep(raw);
  // crowd bed: louder the longer the rally goes, with momentum and the zone
  A.crT = (A.crT || 0) - raw;
  if (A.crT <= 0) {
    A.crT = 300;
    const z = A.zoneShown ? Math.max(A.zoneShown[0] || 0, A.zoneShown[1] || 0) : 0;
    crowdLevel(clamp(0.15 + (A.rallyN || 0) * 0.07 + Math.abs(A.m.mom[0] - A.m.mom[1]) * 0.2 + z * 0.2, 0, 1));
  }
  if (A.squash) A.squash = Math.max(0, A.squash - dt / 300);
  if (A.netShake) A.netShake = Math.max(0, A.netShake - dt / 700);
  if (A.wallFx) {
    A.wallFx.life -= dt / 650;
    if (A.wallFx.life <= 0) A.wallFx = null;
  }
  A.spin = (A.spin || 0) + dt * (0.006 + (A.trailPow || 0) / 2500) * (A.wob ? 0.12 : 1);
  if (A.ghost) {
    A.ghost.life -= ((dt / A.speed) * Math.min(A.speed, 1.5)) / 1000;
    if (A.ghost.life <= 0) A.ghost = null;
  }
  A.shake *= Math.pow(0.992, dt);
  A.flash *= Math.pow(0.99, dt);
  if (A.ptFlash) {
    A.ptFlash.life -= dt / 900;
    if (A.ptFlash.life <= 0) A.ptFlash = null;
  }
  A.cheer = A.cheer.map(v => Math.max(0, v - dt / 1400));
  A.cheerAll = Math.max(0, A.cheerAll - dt / 1400);
  if (A.wave) {
    A.wave.x += dt * 0.75;
    if (A.wave.x > 1150) A.wave = null;
  }
  if (A.chant) {
    A.chant.life -= dt / 2400;
    if (A.chant.life <= 0) A.chant = null;
  }
  if (A.link) {
    A.link.life -= dt / 1100;
    if (A.link.life <= 0) A.link = null;
  }
  for (const c of A.coaches) {
    if (c.talkT > 0) {
      c.talkT -= dt;
      if (c.talkT <= 0) {
        c.type = null;
        c.bubble = null;
        c.react = 0;
      }
      continue;
    }
    c.react = Math.max(0, c.react - dt / 1500);
    if (!c.react) c.type = null;
  }
  if (A.crack) {
    A.crack.life -= dt / 2600;
    if (A.crack.life <= 0) A.crack = null;
  }
  if (A.toBanner) {
    A.toBanner.life -= dt / 2600;
    if (A.toBanner.life <= 0) A.toBanner = null;
  }
  if (A.done) {
    if (A.cele) {
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
        A.parts.push({
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
  A.el += b.cut || b.scene ? (raw / A.speed) * Math.min(A.speed, 1.5) : b.freeze ? raw : dt;
  if (!(b.dur > 0)) {
    DBG.log('warn', `Beat ${A.bi} has no valid duration (${b.dur}) — skipped`, b.acts.map(a => a.k).join(','));
    b.dur = 1;
  }
  const t = Math.min(1, A.el / b.dur);
  applyBeat(b, t);
  ballPhysics(dt);
  if (A.trailPow) {
    const q = ballScreen();
    A.trail.push({ x: q.X, y: q.Y });
    while (A.trail.length > Math.round(8 + (A.trailPow || 0) / 5)) A.trail.shift();
  } else if (A.trail.length) A.trail.shift();
  for (const id in A.disp) {
    const d = A.disp[id];
    const dx = d.x - (d._px == null ? d.x : d._px),
      dz = (d.z - (d._pz == null ? d.z : d._pz)) * 420,
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
      A.parts.push({
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
      A.parts.push({
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
  if (t >= 1) {
    endBeat(b);
    A.bi++;
  }
}
/** Ball velocity from the tween (for bounces) and free bounces after the ball hits the floor. */
function ballPhysics(dt) {
  const B = A.ball,
    q = A.bounce;
  if (q && B.vis) {
    q.t += dt;
    B.x = clamp(B.x + q.vx * dt, -90, 1090);
    B.z = clamp(B.z + q.vz * dt, -0.4, 1.4);
    q.vh -= 0.0011 * dt;
    B.h += q.vh * dt;
    if (B.h <= 0) {
      B.h = 0;
      if (q.vh < -0.05) {
        q.vh = -q.vh * 0.5;
        q.vx *= 0.65;
        q.vz *= 0.65;
        sfx.bounce();
      } else {
        q.vh = 0;
        q.vx *= 0.9;
        q.vz *= 0.9;
      }
    }
    if (q.t > 1600) A.bounce = null;
  }
  const p = A.bp;
  if (p && dt > 0) A.bv = { x: (B.x - p.x) / dt, z: (B.z - p.z) / dt, h: (B.h - p.h) / dt };
  A.bp = { x: B.x, z: B.z, h: B.h };
}
/*
 * Motion-sickness-friendly camera: slow eased push-ins only — no rotation, no whip pans.
 * The zoom starts centred on its target (so it never slides sideways into place), eases in over
 * ~0.4 s and back out over ~0.7 s, and is capped at 1.95× (block break). Off with reduced motion or the Camera toggle.
 */
const camOn = () => !RM && !G.camFixed;
/** Advance the block-break drill: spin the ball hard, throw sparks, then shatter the wall. */
function drillStep(dt) {
  const D = A.drill;
  if (!D) return;
  D.t += dt;
  A.spin = (A.spin || 0) + dt * 0.05;
  const u = D.t / D.dur;
  if (!RM && R() < dt / 14) {
    const an = R() * Math.PI * 2,
      v = rnd(0.15, 0.4);
    A.parts.push({
      kind: 'shard',
      x: D.X + Math.cos(an) * 10,
      y: D.Y + Math.sin(an) * 10,
      vx: Math.cos(an) * v,
      vy: Math.sin(an) * v,
      rot: R() * 6,
      vr: 0.02,
      s: rnd(2, 4),
      life: 1,
      dec: 0.004,
      c: pick(['#fff27a', '#ffffff', '#ffb13d'])
    });
  }
  if (u >= 1) {
    for (let i = 0; i < 46; i++) {
      const an = R() * Math.PI * 2,
        v = rnd(0.1, 0.5);
      A.parts.push({
        kind: 'shard',
        x: D.X + rnd(-24, 24) * D.s * VCS,
        y: D.Y + rnd(-24, 24) * D.s * VCS,
        vx: Math.cos(an) * v + D.away * 0.12, // shards fly out the back of the block
        vy: Math.sin(an) * v - 0.08,
        g: 0.0009,
        rot: R() * 6,
        vr: rnd(-0.02, 0.02),
        s: rnd(4, 10),
        life: 1,
        dec: rnd(0.0009, 0.0015),
        c: pick(['#e6f7ff', '#9fe8ff', '#ffffff', D.col])
      });
    }
    sfx.shatter();
    A.drill = null;
  }
}
function camTo(a) {
  if (!camOn()) return;
  const c = A.cam || (A.cam = { z: 0, tz: 0, x: 500, y: 300, tx: 500, ty: 300, hold: 0, delay: 0 }),
    q = P(a.x, a.z, a.h);
  if (a.amt < c.tz && c.hold > 0) return; // a bigger push-in is already running
  c.tz = a.amt;
  c.tx = q.X;
  c.ty = q.Y;
  c.hold = a.hold || 800;
  c.delay = a.t0 ? a.t0 * 600 : 0;
  if (c.z < 0.02) {
    c.x = c.tx;
    c.y = c.ty;
  }
}
function camRelease() {
  if (A.cam) A.cam.hold = 0;
}
function camStep(dt) {
  const c = A.cam;
  if (!c) return;
  if (c.delay > 0) {
    c.delay -= dt;
    return;
  }
  c.hold -= dt;
  const target = c.hold > 0 ? c.tz : 0,
    k = 1 - Math.exp(-dt / (target > c.z ? 170 : 300)),
    kc = 1 - Math.exp(-dt / 260);
  c.z += (target - c.z) * k;
  c.x += (c.tx - c.x) * kc;
  c.y += (c.ty - c.y) * kc;
  if (c.hold <= 0) c.tz = 0;
  if (c.z < 0.001 && target === 0) c.z = 0;
}
const PACE = 0.8;
function frame(ts) {
  requestAnimationFrame(frame); // first: an error below must never stop the loop (that froze the game)
  const dt = Math.min(50, ts - (last || ts));
  last = ts;
  if (A && cv && document.body.contains(cv)) {
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
    try {
      draw();
    } catch (e) {
      DBG.log('error', e, 'while drawing');
    }
    watchdog(ts);
    SND.crowdOff = 0;
  } else if (SND.crowd && !SND.crowdOff) {
    crowdLevel(0); // left the match: arena goes quiet
    SND.crowdOff = 1;
  }
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
/** Stall detector: play should always move and no beat should last forever; if not, record why. */
function watchdog(ts) {
  const w = watchdog;
  if (A.done || A.paused) {
    w.since = w.beatT = ts;
    return;
  }
  const key = `${A.bi}|${A.beats ? A.beats.length : 0}|${A.el || 0}`,
    beat = `${A.bi}|${A.beats ? A.beats.length : 0}`;
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
  if (!w.told && ts - w.since > (A.hold ? 25000 : 6000)) {
    w.told = true;
    DBG.log('stall', A.hold ? 'Match waiting on the 3D players for 25 s' : 'Match stopped moving for 6 s', matchState());
  }
  if (!w.toldB && ts - w.beatT > 20000 && !A.hold) {
    w.toldB = true;
    DBG.log('stall', 'One beat has been playing for 20 s', matchState());
  }
}

// ---- staged scenes (engine/hype.js): banner, lines, skip ----
function showBanner(a) {
  const el = document.getElementById('hbanner');
  if (!el) return;
  el.textContent = a.t;
  el.style.setProperty('--c', a.c || '#ff3b4e');
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  sfx.stinger();
}
function showSay(a) {
  const el = document.getElementById('hsay'),
    p = byId(a.p);
  if (!el || !p) return;
  el.style.setProperty('--c', p.team.color);
  el.innerHTML = `<b>${esc(p.name)}</b><span>${esc(a.t)}</span>`;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}
/** Leave a scene: game camera back, lines away. */
function endScene() {
  if (A.shot) A.shot = null;
  const say = document.getElementById('hsay');
  if (say && say.classList.contains('on')) say.classList.remove('on');
}
/** Tap / click the court during a scene to skip the rest of it. */
function skipScene() {
  if (!A || !A.beats) return false;
  let i = A.bi,
    hit = false;
  for (; i < A.beats.length && A.beats[i].scene; i++) {
    const b = A.beats[i];
    if (b.freeze) break; // the contact hit-stop stays
    b.dur = 1;
    b.acts = b._s ? b.acts : [];
    hit = true;
  }
  if (hit) {
    A.el = 1e9;
    endScene();
  }
  return hit;
}
