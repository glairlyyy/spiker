// Transient effects. Contact, impact and element effects are handed to the 3D renderer (R3D.fx, js/render3d/fx3d.mjs),
// anchored at the ball. The screen-space pieces the overlay draws (particles, labels, cracks, speed lines, banners…) are
// spawned by the playback and aged here every frame (stepEffects, drillStep); overlay.js draws them.

/** Screen-space particle budget: beyond it the oldest go first. */
const MAX_PARTS = 900;
/** Block-break drill: how long the ball grinds into the wall before it shatters (ms, real time). */
const DRILL_MS = 560;

/* ---------- who shows the special effects (spec §4.30) ---------- */

/**
 * May player p (or a player id) show special effect `kind` ('air' impact spike, 'warp' jump, 'eyes' light trails, 'burst' the
 * explosive contact burst, 'ink' style)? 0 = no; 1 = yes, as the director stages it (an OP player, your player while Fired up —
 * `A.m.fired`; anyone in the dev labs); 2 = always (its Spark: MC_TRAITS[id].fx). Display only.
 */
function specialFx(p, kind) {
  if (p && typeof p !== 'object') p = A && A.disp && A.disp[p] ? A.disp[p].p : null;
  if (p && p.traits && p.traits.some(id => MC_TRAITS[id] && MC_TRAITS[id].fx && MC_TRAITS[id].fx.includes(kind))) return 2;
  if (A && (A.animLab || A.cineForce)) return 1;
  return p && (p.op || (A && A.m && A.m.fired === p.id)) ? 1 : 0;
}

/* ---------- 3D effect hand-off ---------- */

/** The 3D effects API, or null while the 3D view is not up (there is nothing to draw effects on then). */
const fx3 = () => (R3D && R3D.fx) || null;
/** Lightning from the sky onto the floor under the ball; `w` = width. */
function bolt(w) {
  const f = fx3();
  if (f) f.skyBolt(w);
}
/** Electric crackle at the ball (OP players). */
function zap(pow) {
  const f = fx3();
  if (f) f.zap(pow);
}
/** Contact burst at the ball (spike, serve, block) in `color`. */
function burst(pow, color) {
  const f = fx3();
  if (f) f.burst(pow, color);
}
/**
 * A spike splits the air (spec §2.3a): pressure rings, wind lines, a dome on a heavy hit — and on an ult hit (VFX.frame.min,
 * power 100+) an impact frame: the court in negative, in slow motion (VFX.frame.slow), for VFX.frame.ms (owner, 2026-10-06: a
 * full second), then normal speed. `path` = the ball's flight { f, t, sec, lag } (court points; fx seconds), or ±1 = just the
 * attack's side. Live values: js/data/vfx.js.
 */
function airImpact(pow, color, path) {
  const f = fx3();
  if (f && f.airImpact) f.airImpact(pow, color, path);
  if (!RM && HYPE[G.hype].max >= 1 && Dir.frameOk(pow)) {
    Dir.tally('frame'); // the director's floor and once-per-N-points (spec §2.15)
    const st = document.getElementById('stage');
    if (st) {
      st.classList.add('impactf');
      clearTimeout(airImpact.t);
      airImpact.t = setTimeout(() => st.classList.remove('impactf'), VFX.frame.ms);
      A.impactUntil = performance.now() + VFX.frame.ms; // slow motion for as long as it lasts (clock.js), then normal speed
    }
  }
}
/**
 * The spike beat's air impact, once its ball flight is set up (startBeat): the rings line up along the ball's real path and
 * appear as the ball passes them (owner 2026-10-07: the air impact follows the ball).
 */
function airFlush(b) {
  const p = A.airPend;
  A.airPend = null;
  const ba = b.acts.find(x => x.k === 'ball' && x._t && x.when !== 'end');
  if (!ba) return airImpact(p.pow, p.color, A.ball.x < 500 ? 1 : -1);
  const k = 1000 * (A.speed || 1) * PACE; // beat ms → seconds on the effects clock
  airImpact(p.pow, p.color, { f: ba._f, t: ba._t, sec: Math.max(1, b.dur - (ba._lag || 0)) / k, lag: (ba._lag || 0) / k });
}
/** A kill on the floor (VFX.blast: off by default): the ground blast — sparks, embers, smoke, debris — in the element's colour. */
function groundBlast(pow, el) {
  const f = fx3();
  if (f && f.blast && Dir.blastOn() && pow >= VFX.blast.min) {
    Dir.tally('blast');
    f.blast(pow, el && ECOL[el]);
  }
}
/** A touch on the ball by anyone (bump / dive / set): a small pop; `save`: dug off the floor. Foundation VFX (VFX.found). */
function touchFx(kind, save) {
  const f = fx3();
  if (f && f.touch) f.touch(kind, save);
}
/**
 * A receive takes the ball (owner, 2026-10-12; display only — VFX.recv): by how hard it hits (recvK; a knockdown = full) the
 * receiver is knocked back along the ball (d.kb, stepped in actors.js), plays the firm / hard recoil (d.rcv, poses3d), and the
 * contact gets shockwave rings, skid dust, and on a hard one a hit-stop and a camera shake. `pow`: the incoming ball's power.
 */
function recvHit(d, pow) {
  const R = VFX.recv;
  if (!R.on || !d) return;
  const ko = d.pose === 'fall',
    k = ko ? 1 : recvK(d, pow);
  if (k < R.firm) return;
  d.rcv = { k, t: 0, ko };
  if (ko && d.ko && d.ko.c == null) d.ko.c = d.ko.t; // the ball is here: the knockdown starts now
  // knocked back along the incoming ball (metres), leaning away from the net
  const f = A.inFrom,
    away = d.side === 0 ? -1 : 1;
  let ux = f ? (d.x - f.x) * MX : away,
    uz = f ? (d.z - f.z) * MZ : 0;
  const L = Math.hypot(ux, uz) || 1;
  ux = (ux / L) * 0.5 + away * 0.5;
  uz = (uz / L) * 0.5;
  const L2 = Math.hypot(ux, uz) || 1;
  // a knockdown blows them off their feet: a flight back and a slide on the back (KO_FLY in poses3d)
  d.kb = { ux: ux / L2, uz: uz / L2, D: R.slide * k * (ko ? 2.4 : 1), t: 0, dur: ko ? 760 : 220 + 260 * k, s: 0 };
  const f3 = fx3();
  if (f3 && f3.recv) f3.recv(k, ko);
  if (ko || k >= R.hard) {
    A.hitStopUntil = performance.now() + R.stop * k;
    A.shake = Math.max(A.shake || 0, R.shake * k);
  }
}
/**
 * Ball squash (owner, 2026-10-23; VFX.squash, display only): how hard a contact hits the ball, 0..1. `kind` the contact
 * ('spike' | 'serve' | 'block' | 'bump' | 'dive' | 'set'), `out` the new flight's power (a.trail), `inc` the incoming ball's.
 */
function hitShare(kind, out, inc, S = VFX.squash) {
  const k = p => clamp(((p || 0) - S.p0) / Math.max(1, S.p1 - S.p0), 0, 1);
  if (kind === 'spike' || kind === 'serve') return k(out);
  if (kind === 'block') return S.block * k(inc);
  if (kind === 'bump' || kind === 'dive') return S.dig * k(inc);
  return kind === 'set' ? S.set : 0;
}
/**
 * The ball's shape `ms` (world) after a contact of share `k`: { ax, cr } — the scale along the hit / flight (ax) and across it
 * (cr). Contact: flattened to 1 − flat·k, snapping back (a damped cosine, first zero at z = 0.27·S.ms, one overshoot, round by
 * S.ms; cr = 1/√ax keeps the volume). A hard hit (k > strFrom) then smears along its flight — the anime smear frame (owner
 * 2026-10-23): up to 1 + smear·share^curve long (2.6× at full, ~1.4× a medium hit), cr = ax^−thin thick, held to S.hold ms,
 * easing round over S.out; both capped by the flight's length `fl` (ms) so it is round before the next touch.
 */
function ballSquash(k, ms, S = VFX.squash, fl = Infinity) {
  if (!(k > 0) || !(ms >= 0)) return { ax: 1, cr: 1 };
  const T = S.ms,
    z = 0.27 * T,
    hold = Math.min(S.hold, 0.6 * fl),
    out = Math.min(S.out, 0.3 * fl),
    win = 1 - smooth01((ms - 0.7 * T) / (0.3 * T)),
    d = ms < T ? S.flat * k * Math.cos((Math.PI / 2) * (ms / z)) * Math.exp(-ms / (0.36 * T)) * win : 0,
    sh = k > S.strFrom ? Math.pow((k - S.strFrom) / Math.max(0.01, 1 - S.strFrom), S.curve) : 0,
    env = ms <= z ? 0 : smooth01((ms - z) / 25) * (1 - smooth01((ms - Math.max(z, hold)) / Math.max(1, out))),
    st = S.smear * sh * env;
  if (st > 0 && 1 + st > 1 - d) return { ax: 1 + st, cr: Math.pow(1 + st, -S.thin), smear: st };
  const ax = 1 - d;
  return { ax, cr: 1 / Math.sqrt(ax) };
}
const smooth01 = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Hit-stop (ms) of a contact: a hard spike or jump serve only (k ≥ stopFrom); none with reduced motion or Hype off. */
function hitStopMs(kind, k, wob, S = VFX.squash) {
  if (!S.on || RM || !HYPE[G.hype].max || wob || (kind !== 'spike' && kind !== 'serve') || k < S.stopFrom) return 0;
  return S.stop0 + ((S.stop1 - S.stop0) * (k - S.stopFrom)) / Math.max(0.01, 1 - S.stopFrom);
}
/**
 * The ball is hit (playback: at the hand's contact): squash it along `dir` (court delta { x, z, h } of the new flight's start;
 * `fl` its length in ms; A.bsq, drawn by arena3d updateBall, timed on the world clock in stepEffects), and on a top hit the hit-stop (A.hitStopUntil,
 * clock.js) with a stronger camera kick and a white flash.
 */
function ballHit(kind, k, dir, wob, fl) {
  const S = VFX.squash;
  if (!S.on || !(k > 0)) return;
  A.bsq = { k, t: 0, dir, fl, kind };
  const ms = hitStopMs(kind, k, wob);
  if (!ms) return;
  A.hitStopUntil = Math.max(A.hitStopUntil || 0, performance.now() + ms);
  const top = (k - S.stopFrom) / Math.max(0.01, 1 - S.stopFrom);
  camKick(S.p0 + k * (S.p1 - S.p0), dir.x > 0 ? -1 : 1);
  if (A.kick) A.kick.amt *= S.kick;
  if (S.flash * top > 0.01) flashScreen(S.flash * top, FLASH_WHITE);
}
/** Ball hits the floor: dust and shockwave, plus a camera rumble by power (VFX.shake.floor; a kill × VFX.shake.kill). */
function impact(pow, kill) {
  const f = fx3();
  if (f) f.impact(pow);
  camRumble(pow, kill);
}
/**
 * Camera shake (owner 2026-10-07; VFX.shake; none with reduced motion or Zooms: Off — Overlay.applyView). Spike contact: a
 * short sharp kick along the shot. The ball on the floor: trauma (0–1) that rumbles as trauma² and decays (a kill hits harder).
 */
function camKick(pow, dir) {
  const S = VFX.shake;
  if (RM || pow < S.min || S.spike * Dir.shakeK() <= 0) return;
  A.kick = { t0: performance.now(), amt: Math.min(1.6, (pow - S.min + 25) / 60) * S.spike * Dir.shakeK(), dir }; // × the director's shake
}
/** A high jump's take-off (VFX.leap): a short vertical kick of the camera, `k` 0.5–1.2 by height. */
function jumpKick(k) {
  const L = VFX.leap;
  if (RM || L.shake * Dir.shakeK() <= 0) return;
  A.kick = { t0: performance.now(), amt: 0.35 * k * L.shake * Dir.shakeK(), dir: 0 };
}
function camRumble(pow, kill) {
  const S = VFX.shake;
  if (RM || pow < S.min * 0.6 || S.floor * Dir.shakeK() <= 0) return; // softer balls on the floor still rumble a little (from 60 % of the min)
  A.trauma = Math.min(1, (A.trauma || 0) + (pow / 140) * S.floor * Dir.shakeK() * (kill ? S.kill : 0.5));
}
/** Element burst at the ball (fire, water, earth, wind, flash, blast, shadow, star). */
function elemBurst(el, pow) {
  const f = fx3();
  if (f) f.elemBurst(el, pow);
}
/** Element effect on the floor where the ball lands. */
function elemImpact(el, pow) {
  const f = fx3();
  if (f) f.elemImpact(el, pow);
}
/** Per-frame element trail behind a powered ball; dt in ms. */
function elemTrail(el, pow, dt) {
  const f = fx3();
  if (f) f.trail(el, pow, dt / 1000);
}

/* ---------- screen-space pieces ---------- */

/** Add a screen-space particle (defaults: life 1, dec 0.002/ms, size 3), keeping within MAX_PARTS. */
function addPart(o) {
  if (A.parts.length >= MAX_PARTS) A.parts.splice(0, A.parts.length - MAX_PARTS + 1);
  A.parts.push(Object.assign({ life: 1, dec: 0.002, s: 3 }, o));
}
/**
 * `n` glass shards flying out of (x, y) ± (rx, ry): speed v[0]..v[1] (+ `away` × 0.12 sideways, `lift` up), size s,
 * decay dec, colour from `cols`; they fall under gravity.
 */
function spawnShards(n, { x, y, rx, ry, v: [v0, v1], lift, s: [s0, s1], dec: [d0, d1], cols, away = 0 }) {
  for (let i = 0; i < n; i++) {
    const an = FXR.r() * Math.PI * 2,
      v = FXR.rnd(v0, v1);
    addPart({
      kind: 'shard',
      x: x + FXR.rnd(-rx, rx),
      y: y + FXR.rnd(-ry, ry),
      vx: Math.cos(an) * v + away * 0.12,
      vy: Math.sin(an) * v - lift,
      g: 0.0009,
      rot: FXR.r() * 6,
      vr: FXR.rnd(-0.02, 0.02),
      s: FXR.rnd(s0, s1),
      life: 1,
      dec: FXR.rnd(d0, d1),
      c: FXR.pick(cols)
    });
  }
}
/**
 * Random crack lines radiating from (0, 0): `n` polylines of `segs` segments, start angle ± `spread`, each segment
 * turning ± `turn` and `len0`..`len1` long, y scaled by `squashY` (screen offsets).
 */
function crackLines(n, spread, segs, turn, len0, len1, squashY) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    let an = (i / n) * Math.PI * 2 + FXR.rnd(-spread, spread),
      x = 0,
      y = 0;
    const l = [[0, 0]];
    for (let k = 0; k < segs; k++) {
      an += FXR.rnd(-turn, turn);
      const st = FXR.rnd(len0, len1);
      x += Math.cos(an) * st;
      y += Math.sin(an) * st * squashY;
      l.push([x, y]);
    }
    lines.push(l);
  }
  return lines;
}
/** Advance the block-break drill (real ms): spin the ball hard, throw sparks, then shatter the wall. */
function drillStep(dt) {
  const D = A.drill;
  if (!D) return;
  D.t += dt;
  A.spin = (A.spin || 0) + dt * 0.05;
  if (!RM && FXR.r() < dt / 14) {
    const an = FXR.r() * Math.PI * 2,
      v = FXR.rnd(0.15, 0.4);
    addPart({
      kind: 'shard',
      x: D.X + Math.cos(an) * 10,
      y: D.Y + Math.sin(an) * 10,
      vx: Math.cos(an) * v,
      vy: Math.sin(an) * v,
      rot: FXR.r() * 6,
      vr: 0.02,
      s: FXR.rnd(2, 4),
      life: 1,
      dec: 0.004,
      c: FXR.pick(['#fff27a', '#ffffff', '#ffb13d'])
    });
  }
  if (D.t >= D.dur) {
    const k = D.s * VCS;
    spawnShards(46, {
      x: D.X,
      y: D.Y,
      rx: 24 * k,
      ry: 24 * k,
      v: [0.1, 0.5],
      lift: 0.08,
      s: [4, 10],
      dec: [0.0009, 0.0015],
      cols: ['#e6f7ff', '#9fe8ff', '#ffffff', D.col],
      away: D.away // shards fly out the back of the block
    });
    sfx.shatter();
    A.drill = null;
  }
}
/** Lifetimes (ms of world time) of the one-off overlay pieces faded by stepEffects. */
const FX_LIFE = { real: 750, lines: 380, wallFx: 650, ptFlash: 900, chant: 2400, link: 1100, crack: 2600, toBanner: 2600, lane: 2400 };
/** Age the screen-space effects by dt ms of world time (particles, labels, overlays, shake, flash, crowd). */
function stepEffects(dt) {
  for (const p of A.parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.g) p.vy += p.g * dt;
    if (p.grow) p.s += p.grow * dt;
    if (p.rot != null) p.rot += p.vr * dt;
    p.life -= p.dec * dt;
  }
  A.parts = A.parts.filter(p => p.life > 0);
  if (A.trailEl && A.trailPow && A.ball.vis && (A.mv ?? 1) > 0.05) elemTrail(A.trailEl, A.trailPow * (A.mv ?? 1) ** 2, dt); // dims with the ball's speed
  for (const l of A.labels) {
    l.life -= dt / (l.big ? 1300 : 1000);
    l.y -= dt * 0.02; // float up
  }
  A.labels = A.labels.filter(l => l.life > 0);
  for (const k in FX_LIFE) {
    const o = A[k];
    if (o && (o.life -= dt / FX_LIFE[k]) <= 0) A[k] = null;
  }
  if (A.link) linkSparks();
  A.zoom = (A.zoom || 0) * Math.pow(0.993, dt);
  if (A.squash) A.squash = Math.max(0, A.squash - dt / 300);
  if (A.bsq && (A.bsq.t += dt) > 2000) A.bsq = null; // the ball's squash / smear clock (ballHit, arena3d updateBall)
  if (A.netShake) A.netShake = Math.max(0, A.netShake - dt / 700);
  A.spin = (A.spin || 0) + dt * (0.006 + (A.trailPow || 0) / 2500) * (A.wob ? 0.12 : 1);
  if (A.ghost && (A.ghost.life -= playDt(dt) / 1000) <= 0) A.ghost = null;
  A.shake *= Math.pow(0.992, dt);
  A.flash *= Math.pow(0.99, dt);
  A.cheer = A.cheer.map(v => Math.max(0, v - dt / 1400));
  A.cheerAll = Math.max(0, A.cheerAll - dt / 1400);
  if (A.wave) {
    A.wave.x += dt * 0.75; // crowd wave sweeping across the stands
    if (A.wave.x > 1150) A.wave = null;
  }
}
/** Golden sparks rising off the link between two players (a pair move). */
function linkSparks() {
  const a = A.disp[A.link.p1],
    b = A.disp[A.link.p2];
  if (!a || !b || FXR.r() >= 0.5) return;
  const q1 = P(a.x, a.z, a.jy + 70),
    q2 = P(b.x, b.z, b.jy + 70);
  addPart({
    kind: 'spark',
    x: lerp(q1.X, q2.X, FXR.r()),
    y: lerp(q1.Y, q2.Y, FXR.r()) - 10,
    vx: 0,
    vy: -0.02,
    s: FXR.rnd(3, 6),
    rot: 0,
    vr: 0.02,
    life: 1,
    dec: 0.003,
    c: '#ffe38a'
  });
}

/* ---------- cards on screen (spec §2.37, T-346) ---------- */

/** The stage's overlay element `id` (made on first use, inline-styled: the render layer owns it; a new match screen = a new one). */
function stageEl(id, css) {
  const st = typeof document !== 'undefined' && document.getElementById('stage');
  if (!st) return null;
  let el = document.getElementById(id);
  if (!el || el.parentNode !== st) {
    el = document.createElement('div');
    el.id = id;
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = css;
    st.appendChild(el);
  }
  return el;
}
/**
 * A card act on screen: the banner "‹team› plays ‹card›" (a caught one: "‹trap›! ‹team›'s ‹card› caught"); `cut` (an OP card,
 * Hype on): the full-screen cut-in instead — the card's name, its holder (portrait, name, role), the team colour (VFX.op.cut ms).
 */
function cardShow(a, cut) {
  if (!A || !A.m || typeof CARDS === 'undefined' || !CARDS[a.id]) return;
  const t = A.m.t[a.side],
    name = typeof cardName === 'function' ? cardName(A.m, a.side, a.id) : CARDS[a.id].name,
    p = byId(a.by);
  if (cut) return opCutIn(a, t, name, p);
  const el = stageEl(
    'cardban',
    'position:absolute;left:50%;top:15%;z-index:6;pointer-events:none;opacity:0;white-space:nowrap;padding:8px 18px 9px;' +
      'background:var(--hud);border-left:5px solid var(--c);color:var(--white);font:800 17px/1.1 var(--disp,"Arial Black",sans-serif);' +
      'letter-spacing:.04em;transform:translateX(-50%) skewX(-8deg);box-shadow:0 0 18px rgba(0,0,0,.45)'
  );
  if (!el) return;
  el.style.setProperty('--c', t.color);
  el.innerHTML = a.caught
    ? `<span style="color:var(--warn-hi)">${esc(CARDS[a.caught].name)}!</span> ${esc(t.short)}’s ${esc(name)} caught`
    : `<span style="color:var(--c)">${esc(t.short)}</span> plays ${a.op ? '<b style="color:var(--gold-hi)">★ </b>' : ''}${esc(name)}`;
  const ms = VFX.op.ban;
  if (el.animate)
    el.animate(
      [
        { opacity: 0, transform: 'translateX(-50%) translateY(-10px) skewX(-8deg)' },
        { opacity: 1, transform: 'translateX(-50%) translateY(0) skewX(-8deg)', offset: RM ? 0.01 : 0.1 },
        { opacity: 1, transform: 'translateX(-50%) translateY(0) skewX(-8deg)', offset: 0.85 },
        { opacity: 0, transform: 'translateX(-50%) translateY(-4px) skewX(-8deg)' }
      ],
      { duration: ms, easing: 'ease-out', fill: 'forwards' }
    );
  else el.style.opacity = 1;
}
/** The OP cut-in: a slashed band in the team colour across the stage, the holder's portrait, the card's name huge. */
function opCutIn(a, t, name, p) {
  const el = stageEl('opcut', 'position:absolute;inset:0;z-index:7;pointer-events:none;overflow:hidden;opacity:0');
  if (!el) return;
  el.style.setProperty('--c', t.color);
  const face = p && typeof faceSVG === 'function' ? faceSVG(p, 1, 132) : '',
    who = p ? `${esc(p.name)} · ${esc(p.role)}` : '';
  el.innerHTML =
    '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(11,16,48,.25),rgba(11,16,48,.8))"></div>' +
    '<div data-band style="position:absolute;left:-10%;right:-10%;top:30%;height:40%;transform:skewY(-7deg);' +
    'background:linear-gradient(90deg,var(--court-ink) 0%,var(--c) 38%,var(--c) 62%,var(--court-ink) 100%);' +
    'border-top:4px solid var(--white);border-bottom:4px solid var(--white);box-shadow:0 0 60px var(--c)">' +
    '<div style="position:absolute;inset:0;opacity:.22;background:repeating-linear-gradient(100deg,var(--white) 0 2px,transparent 2px 26px)"></div></div>' +
    '<div data-txt style="position:absolute;left:0;right:0;top:30%;height:40%;display:flex;align-items:center;justify-content:center;gap:28px;transform:skewY(-7deg)">' +
    (face
      ? `<div style="width:132px;height:132px;flex:none;border:4px solid var(--white);background:var(--court-night);overflow:hidden;transform:skewX(-8deg);box-shadow:6px 6px 0 var(--court-ink)">${face}</div>`
      : '') +
    '<div style="transform:skewX(-8deg);color:var(--white);text-align:left">' +
    `<div style="font:900 14px/1 var(--disp,'Arial Black',sans-serif);letter-spacing:.3em;color:var(--court-yellow);text-shadow:2px 2px 0 var(--court-ink)">OP CARD · ${esc(t.short)}</div>` +
    `<div style="font:clamp(34px,6.4vw,84px)/1.02 var(--disp,'Arial Black',sans-serif);letter-spacing:.04em;text-transform:uppercase;margin:6px 0;text-shadow:0 0 24px var(--c),5px 5px 0 var(--court-ink)">${esc(name)}</div>` +
    `<div style="font:800 18px/1 var(--disp,'Arial Black',sans-serif);letter-spacing:.08em;text-shadow:2px 2px 0 var(--court-ink)">${who}</div>` +
    '</div></div>';
  const ms = VFX.op.cut,
    band = el.querySelector('[data-band]'),
    txt = el.querySelector('[data-txt]');
  if (typeof sfx !== 'undefined' && sfx.stinger) sfx.stinger();
  if (!el.animate) return void (el.style.opacity = 1);
  const o = { duration: ms, fill: 'forwards' },
    inn = RM ? 0.01 : 0.14,
    out = 0.84;
  el.animate([{ opacity: 0 }, { opacity: 1, offset: RM ? 0.01 : 0.08 }, { opacity: 1, offset: out }, { opacity: 0 }], o);
  if (RM) return;
  band.animate(
    [
      { transform: 'skewY(-7deg) translateX(-110%)', easing: 'cubic-bezier(.2,.9,.2,1)' },
      { transform: 'skewY(-7deg) translateX(0)', offset: inn, easing: 'linear' },
      { transform: 'skewY(-7deg) translateX(2%)', offset: out, easing: 'ease-in' },
      { transform: 'skewY(-7deg) translateX(115%)' }
    ],
    o
  );
  txt.animate(
    [
      { transform: 'skewY(-7deg) translateX(30%) scale(1.25)', opacity: 0 },
      { transform: 'skewY(-7deg) translateX(0) scale(1)', opacity: 1, offset: inn + 0.06 },
      { transform: 'skewY(-7deg) translateX(-3%) scale(1)', opacity: 1, offset: out },
      { transform: 'skewY(-7deg) translateX(-40%) scale(1)', opacity: 0 }
    ],
    o
  );
}
