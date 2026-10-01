// One-shot beat acts, by concern: `instant(a)` (playback.js) looks the act kind up in ACTS and calls it with the act,
// its player's display entry `d` (or null) and the ball's screen point `bs`. Every act kind the engine emits needs an
// entry here or a tween in startBeat (a test checks).

/** Flash tint colours (r,g,b) for the full-screen flash. */
const FLASH_WHITE = '255,255,255',
  FLASH_BOLT = '200,235,255',
  FLASH_GLASS = '220,240,255';
/** Effects, labels, camera and sound over the scene. */
const ACTS_FX = {
  burst(a, d, bs) {
    burst(a.pow, a.color);
    sfx.hit(a.pow);
    if (a.el) elemBurst(a.el, a.pow);
    if (a.op) {
      zap(a.pow);
      sfx.zap();
    }
  },
  impact(a, d, bs) {
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
  },
  label(a, d, bs) {
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
  },
  shake(a, d, bs) {
    if (!RM) A.shake = Math.max(A.shake, a.amt);
  },
  lines(a, d, bs) {
    if (!RM) A.lines = { x: bs.X, y: bs.Y, life: 1, pow: a.pow };
  },
  flash(a, d, bs) {
    flashScreen(a.a, FLASH_WHITE);
  },
  real(a, d, bs) {
    const t = resolve(a.to);
    A.real = { f: { X: bs.X, Y: bs.Y }, t: P(t.x, t.z, t.h), life: 1 };
  },
  plabel(a, d, bs) {
    if (!d) return;
    const q = P(d.x, d.z, d.jy + 150);
    A.labels.push({ t: a.t, x: q.X, y: q.Y, life: 1, big: 1, set: 0, pow: 120 });
    if (/^BUFF Lv(\d)/.test(a.t)) sfx.buff(+a.t.slice(7));
  },
  cam(a, d, bs) {
    camTo(a);
  },
  drill(a, d, bs) {
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
  },
  zoom(a, d, bs) {
    if (!RM) {
      A.zoom = Math.max(A.zoom || 0, a.amt);
      A.zc = { X: bs.X, Y: bs.Y };
    }
  },
  squash(a, d, bs) {
    A.squash = 1;
  },
  netshake(a, d, bs) {
    A.netShake = 1;
    sfx.net();
  },
  wall(a, d, bs) {
    if (d) A.wallFx = { z: d.z, top: 138 + d.jy + 10, el: a.el || null, life: 1 };
  },
  efx(a, d, bs) {
    if (a.el) elemBurst(a.el, a.pow);
  },
  ghost(a, d, bs) {
    sfx.swish();
    A.ghost = { f: { X: bs.X, Y: bs.Y }, t: P(a.to.x, a.to.z, a.to.h), life: 1 };
  },
  shot(a, d, bs) {
    // staged scene camera (r3d frames it; null = back to the game camera)
    if (a.hype && a.hype > HYPE[G.hype].max) return; // an optional close-up (Hype off)
    A.shot = a.kind ? { kind: a.kind, p: a.p, p2: a.p2, el: a.el || null } : null;
    if (a.kind) {
      camRelease();
      sfx.cutShot();
    }
  },
  heart(a, d, bs) {
    sfx.heart(a.v || 1);
  },
  zbreak(a, d, bs) {
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
  },
  zone(a, d, bs) {
    sfx.zone();
    A.ptFlash = { side: a.side, life: 1 };
  },
  link(a, d, bs) {
    A.link = { p1: a.p1, p2: a.p2, life: 1, c: a.color };
  }
};
/** Match-screen UI: cut-ins, banners, calls, the log, the scoreboard, coaches. */
const ACTS_UI = {
  tech(a, d, bs) {
    // technique name pops over the player who used it
    if (!d) return;
    const q = P(d.x, d.z, d.jy + 175);
    A.labels.push({ t: `✦ ${a.t}`, x: q.X, y: q.Y - (a.dy || 0), life: 1, big: 1, set: 1, pow: 100 });
    logLine(`✦ ${d.p.name} — ${a.t}`, 'set');
    if (G.cutMini) toast(d.p, null, a.t, 'Technique');
    const def = Object.values(SKILLS).find(s => s.name === a.t);
    sfx.tech(def && def.tech);
  },
  tac(a, d, bs) {
    showTac(a.side);
  },
  tobanner(a, d, bs) {
    A.toBanner = { side: a.side, life: 1, manual: a.manual };
    sfx.whistle();
    setTimeout(() => sfx.whistle(), 220);
    updTO();
  },
  coachtalk(a, d, bs) {
    const c = A.coaches[a.side];
    c.type = 'talk';
    c.react = 1;
    c.talkT = 2400;
    c.bubble = a.text;
    A.coaches[1 - a.side].type = null;
  },
  call(a, d, bs) {
    // speech bubble over a player calling for the ball
    if (a.sc) {
      showSay(a); // scene line: a subtitle box under the close-up
      if (d) sfx.voice(d.p.num, true);
      return;
    }
    if (d) {
      d.call = { t: a.t, life: 1, soft: !!a.soft };
      sfx.voice(d.p.num, !a.soft && !!(A.zoneShown && A.zoneShown[d.side]));
    }
  },
  banner(a, d, bs) {
    showBanner(a);
  },
  cut(a, d, bs) {
    if (G.cutMini) toast(byId(a.p), null, a.title, a.sub, a.el);
    else showCut(a);
    if (a.el) sfx.zone();
    sfx.whoosh();
    if (!G.cutMini) sfx.stinger();
  },
  log(a, d, bs) {
    logLine(a.t, a.c);
  },
  score(a, d, bs) {
    board(a.snap);
    boxScore();
  },
  rot(a, d, bs) {
    board(a.snap);
    A.srvId = a.snap.rot[a.snap.serve][0];
  },
  point(a, d, bs) {
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
  },
  combo(a, d, bs) {
    if (G.cutMini) toast(byId(a.p1), byId(a.p2), a.title, a.sub, a.el);
    else showCombo(a);
    sfx.whoosh();
    sfx.stinger();
    sfx.zone();
  }
};
/** Players on court: substitutions and display state (poses, spike style, set direction). */
const ACTS_ROSTER = {
  sub(a, d, bs) {
    // the incoming player takes the outgoing one's place at once (no walk-on); the outgoing entry goes to the bench
    const o = A.disp[a.out],
      i = A.bench && A.bench[a.in];
    if (!o || !i) {
      DBG.log('warn', `Sub ${a.out} → ${a.in}: player missing from the display — skipped`);
      return;
    }
    A.disp[a.in] = { p: i.p, side: o.side, x: o.x, z: o.z, sx: o.x, sz: o.z, tx: o.x, tz: o.z, jy: 0, jmode: null, pose: 'ready' };
    A.bench[a.out] = o;
    delete A.disp[a.out];
    delete A.bench[a.in];
    if (A.lastP === a.out) A.lastP = a.in;
    if (R3D && R3D.swapActor) R3D.swapActor(a.out, A.disp[a.in]);
  },
  pose(a, d, bs) {
    // a pose change at the end of a beat (no swing / dive set-up)
    if (d && diving(d) && DIVE_KEEP.has(a.pose)) d.afterDive = a.pose;
    else if (d) {
      d.pose = a.pose;
      if (a.pose !== 'dive' && d.dv) {
        d.gu = { t: 0, s: diveShape(d) };
        d.dv = null;
      }
    }
  },
  spkstyle(a, d, bs) {
    if (d) d.spkStyle = a.st;
  },
  setdir(a, d, bs) {
    if (d) d.setDir = a.dir;
  }
};
const ACTS = { ...ACTS_FX, ...ACTS_UI, ...ACTS_ROSTER };
