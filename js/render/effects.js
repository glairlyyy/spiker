// Transient effects. Contact, impact and element effects are handed to the 3D renderer (R3D.fx, js/render3d/fx3d.mjs),
// anchored at the ball. The screen-space pieces the overlay draws (particles, labels, cracks, speed lines, banners…) are
// spawned by the playback and aged here every frame (stepEffects, drillStep); overlay.js draws them.

/** Screen-space particle budget: beyond it the oldest go first. */
const MAX_PARTS = 900;
/** Block-break drill: how long the ball grinds into the wall before it shatters (ms, real time). */
const DRILL_MS = 560;

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
 * A spike splits the air (spec §2.3a): pressure rings, wind lines, a dome on a heavy hit — and on an ult hit (power 100+) an
 * impact frame: two frames of the court in negative, the anime cut. `dx` = the attack's direction along the court.
 */
function airImpact(pow, color, dx) {
  const f = fx3();
  if (f && f.airImpact) f.airImpact(pow, color, dx);
  if (pow >= 100 && !RM && HYPE[G.hype].max >= 1) {
    const st = document.getElementById('stage');
    if (st) {
      st.classList.add('impactf');
      setTimeout(() => st.classList.remove('impactf'), 70);
    }
  }
}
/** Ball hits the floor: dust and shockwave, plus a screen shake by power. */
function impact(pow) {
  const f = fx3();
  if (f) f.impact(pow);
  if (!RM) A.shake = Math.max(A.shake, pow / 12);
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
const FX_LIFE = { real: 750, lines: 380, wallFx: 650, ptFlash: 900, chant: 2400, link: 1100, crack: 2600, toBanner: 2600 };
/** Age the screen-space effects by dt ms of world time (particles, labels, overlays, shake, flash, crowd, coaches). */
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
