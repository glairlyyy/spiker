// Screen-space layer over the 3D scene (the transparent court canvas): view transform, chant, ball trail, arrows,
// links, walls, particles, drill wall, labels, cracks, slow-motion vignette and flashes.
// Only the fonts / ink colour (shared with tags.js) and the `Overlay` API are global. The 3D renderer (js/render3d/r3d.mjs) calls
// Overlay.applyView, drawChant, drawTrail and drawFx each frame; the clock calls Overlay.frame.

/** Canvas fonts: display (labels, banners) and rounded UI text (tags, bubbles). */
const FONT_DISPLAY = '"Dela Gothic One","Arial Black",sans-serif',
  FONT_ROUND = '"M PLUS Rounded 1c",sans-serif';
/** Outline colour for text and bubbles. */
const INK = '#10163a';

const Overlay = (() => {
  /** Closed polygon through projected points `pts` ({ X, Y }), filled and/or stroked. */
  function quad(pts, fill, stroke, lw) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 1;
      ctx.stroke();
    }
  }
  /** Line between projected points a and b. */
  function seg(a, b, c, w) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.X, a.Y);
    ctx.lineTo(b.X, b.Y);
    ctx.stroke();
  }
  /** Stroke polyline `l` ([[x, y], …]) offset by (x, y). */
  function polyline(l, x, y) {
    ctx.beginPath();
    l.forEach((q, i) => (i ? ctx.lineTo(x + q[0], y + q[1]) : ctx.moveTo(x + q[0], y + q[1])));
    ctx.stroke();
  }
  /** Text with a dark outline. */
  function outlinedText(t, x, y, fill, lw) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.strokeText(t, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(t, x, y);
  }
  /**
   * Canvas transform for the court: logical 1000-wide view, shake, camera push-in and block-contest zoom.
   * Returns the combined view as screen = f·p + (ox, oy) in logical units (the 3D renderer applies the same view).
   */
  function applyView() {
    const s = cv.width / 1000,
      V = { f: 1, ox: 0, oy: 0 },
      tr = (x, y) => ((V.ox += V.f * x), (V.oy += V.f * y)),
      sc = k => (V.f *= k);
    if (A.shake > 0.3 && !G.camFixed) {
      // a soft sway (two slow sines, half the old amplitude) instead of per-frame random jitter: far less nauseating
      const t = performance.now() / 1000,
        k = A.shake * 0.5;
      tr(k * (Math.sin(t * 11) * 0.65 + Math.sin(t * 17.3) * 0.35), k * 0.6 * (Math.sin(t * 13.7) * 0.65 + Math.sin(t * 9.1) * 0.35));
    }
    if (A.cam && A.cam.z > 0.001) {
      // smooth camera push-in (see camTo); centre kept inside the court so the edges never swing wildly
      const c = A.cam,
        zx = clamp(c.x, 260, 740),
        zy = clamp(c.y, VT + 130, VT + 320);
      tr(zx, zy);
      sc(1 + c.z);
      tr(-zx, -zy);
    }
    if (A.zoom > 0.002 && A.zc) {
      const c = A.zc,
        zx = clamp(c.X, 300, 700),
        zy = clamp(c.Y, VT + 150, VT + 300);
      tr(zx, zy);
      sc(1 + A.zoom);
      tr(-zx, -zy);
    }
    ctx.setTransform(s * V.f, 0, 0, s * V.f, s * V.ox, s * (V.oy - VT));
    return V;
  }
  /** Crowd chant text over the stands. */
  function drawChant(now) {
    const ch = A.chant;
    if (!ch) return;
    const pl = 1 + 0.08 * Math.abs(Math.sin(now * 0.012));
    ctx.save();
    ctx.globalAlpha = Math.min(1, ch.life * 3) * 0.9;
    ctx.translate(ch.side ? 740 : 300, 135);
    ctx.scale(pl, pl);
    ctx.font = `30px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    outlinedText(ch.text, 0, 0, A.m.t[ch.side].color, 6);
    ctx.restore();
  }
  /** Everything drawn over the players, back to front. */
  function drawFx(now) {
    if (A.ghost) drawGhost(A.ghost);
    if (A.real) drawRealSet(A.real);
    if (A.link) drawLink(A.link, now);
    if (A.wallFx && !A.shot) drawWall(A.wallFx); // hidden in scene close-ups: projected that near, it covers the faces
    if (A.lines) drawSpeedLines(A.lines);
    drawParts();
    if (A.drill) drawDrill(A.drill); // over smoke and sparks so the wall reads clearly
    ctx.globalAlpha = 1;
    drawLabels();
    if (A.toBanner) drawTimeoutBanner(A.toBanner);
    if (A.crack) drawCrack(A.crack);
    drawSlowVignette();
    if (A.flash > 0.02) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(${A.flashC || '255,255,255'},${A.flash})`;
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
  }
  /** "Ghost" arrow: the dashed arc of the ball the defense expected, a ghost ball along it, a cross where it would land. */
  function drawGhost(g) {
    const cx = (g.f.X + g.t.X) / 2,
      cy = Math.min(g.f.Y, g.t.Y) - 90,
      u = Math.min(1, (1 - g.life) * 2.2);
    ctx.save();
    ctx.globalAlpha = Math.min(1, g.life * 1.6);
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -u * 40;
    ctx.strokeStyle = '#9fe8ff';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#3fd9ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(g.f.X, g.f.Y);
    ctx.quadraticCurveTo(cx, cy, g.t.X, g.t.Y);
    ctx.stroke();
    ctx.setLineDash([]);
    // ghost ball along the quadratic curve
    const bx = (1 - u) * (1 - u) * g.f.X + 2 * (1 - u) * u * cx + u * u * g.t.X,
      by = (1 - u) * (1 - u) * g.f.Y + 2 * (1 - u) * u * cy + u * u * g.t.Y;
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = Math.min(1, g.life * 1.6);
    ctx.strokeStyle = '#ff3d7f';
    ctx.lineWidth = 4;
    const X = g.t.X,
      Y = g.t.Y;
    ctx.beginPath();
    ctx.moveTo(X - 9, Y - 9);
    ctx.lineTo(X + 9, Y + 9);
    ctx.moveTo(X + 9, Y - 9);
    ctx.lineTo(X - 9, Y + 9);
    ctx.stroke();
    ctx.restore();
  }
  /** "Real set" arrow: where the setter actually sends the ball. */
  function drawRealSet(r) {
    const cx = (r.f.X + r.t.X) / 2,
      cy = Math.min(r.f.Y, r.t.Y) - 50;
    ctx.save();
    ctx.globalAlpha = Math.min(1, r.life * 1.5);
    ctx.strokeStyle = '#ff3d7f';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#ff3d7f';
    ctx.shadowBlur = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r.f.X, r.f.Y);
    ctx.quadraticCurveTo(cx, cy, r.t.X, r.t.Y);
    ctx.stroke();
    const an = Math.atan2(r.t.Y - cy, r.t.X - cx);
    ctx.fillStyle = '#ff3d7f';
    ctx.beginPath();
    ctx.moveTo(r.t.X, r.t.Y);
    ctx.lineTo(r.t.X - Math.cos(an - 0.45) * 16, r.t.Y - Math.sin(an - 0.45) * 16);
    ctx.lineTo(r.t.X - Math.cos(an + 0.45) * 16, r.t.Y - Math.sin(an + 0.45) * 16);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = `16px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    outlinedText('Real set', cx, cy + 8, '#fff', 4);
    ctx.restore();
  }
  /** Glowing link between two players (pair move); its sparks are spawned by linkSparks(). */
  function drawLink(L, now) {
    const a = A.disp[L.p1],
      b = A.disp[L.p2];
    if (!a || !b) return;
    const q1 = P(a.x, a.z, a.jy + 70),
      q2 = P(b.x, b.z, b.jy + 70);
    ctx.save();
    ctx.globalAlpha = Math.min(1, L.life * 2);
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ffd84d';
    ctx.shadowBlur = 18;
    for (const [c, w] of [
      [L.c, 10],
      ['#fff6c4', 4]
    ]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(q1.X, q1.Y);
      const mx = (q1.X + q2.X) / 2,
        my = Math.min(q1.Y, q2.Y) - 30;
      ctx.quadraticCurveTo(mx + Math.sin(now * 0.02) * 6, my, q2.X, q2.Y);
      ctx.stroke();
    }
    for (const q of [q1, q2]) {
      ctx.fillStyle = '#fff6c4';
      ctx.beginPath();
      ctx.arc(q.X, q.Y, 6 + 3 * Math.sin(now * 0.03), 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }
  /** Block wall: a glowing pane over the net at the blockers' hands, in their element colour. */
  function drawWall(W) {
    const c = ECOL[W.el] || '#fff';
    ctx.save();
    ctx.globalAlpha = Math.min(1, W.life * 1.6) * 0.55;
    ctx.shadowColor = c;
    ctx.shadowBlur = 25;
    quad([P(500, W.z - 0.2, W.top), P(500, W.z + 0.2, W.top), P(500, W.z + 0.2, 90), P(500, W.z - 0.2, 90)], c, '#fff', 3);
    ctx.globalAlpha *= 0.8;
    for (let k = 1; k < 5; k++) {
      const h = 90 + ((W.top - 90) * k) / 5;
      seg(P(500, W.z - 0.2, h), P(500, W.z + 0.2, h), '#fff', 1.5);
    }
    ctx.restore();
  }
  /** Radial speed lines around a big hit. */
  function drawSpeedLines(Ln) {
    ctx.save();
    ctx.globalAlpha = Ln.life * 0.6;
    ctx.strokeStyle = '#fff';
    for (let i = 0; i < 40; i++) {
      const an = (i / 40) * Math.PI * 2 + i * 0.37,
        r0 = 40 + (i % 5) * 12,
        r1 = r0 + Ln.pow * 4;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(Ln.x + Math.cos(an) * r0, Ln.y + Math.sin(an) * r0);
      ctx.lineTo(Ln.x + Math.cos(an) * r1, Ln.y + Math.sin(an) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }
  /** Screen-space particles: dust, shards, confetti, sparks (other kinds as small squares). */
  function drawParts() {
    for (const p of A.parts) {
      const a = Math.max(0, Math.min(1, p.life));
      ctx.globalAlpha = a;
      switch (p.kind) {
        case 'dust':
          ctx.globalAlpha = a * 0.4;
          ctx.fillStyle = '#f3dcb0';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s, 0, 7);
          ctx.fill();
          break;
        case 'conf':
          ctx.save();
          ctx.translate(p.x + Math.sin(p.rot * 2) * 4, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.s / 2, -p.s / 4, p.s, (p.s / 2) * Math.abs(Math.cos(p.rot * 3)) + 1);
          ctx.restore();
          break;
        case 'shard':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          ctx.strokeStyle = 'rgba(255,255,255,.9)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -p.s);
          ctx.lineTo(p.s * 0.55, p.s * 0.4);
          ctx.lineTo(-p.s * 0.45, p.s * 0.6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          break;
        case 'spark':
          // four-point star
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const r = i % 2 ? p.s * 0.3 : p.s,
              an = (i * Math.PI) / 4;
            ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        default:
          ctx.fillStyle = p.c || '#fff';
          ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
    }
  }
  /** Floating play labels (Kill!, Ace, technique names…): size by importance, colour by kind, stamps pop in. */
  function drawLabels() {
    if (A.shot && A.shot.kind !== 'follow') return; // scene close-ups: court-anchored labels would land on the face / the subtitle
    for (const l of A.labels) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, l.life * 2);
      ctx.textAlign = 'center';
      let sz = l.big ? 12 : l.small ? 8 : l.pow ? Math.min(12, 9 + Math.max(0, l.pow - 60) / 10) : 9;
      if (l.stamp) sz *= 1.2 + Math.max(0, l.life - 0.82) * 6;
      ctx.font = `${sz}px ${FONT_DISPLAY}`;
      const fill =
        l.v === 'err'
          ? '#ff4d4d'
          : l.v === 'warn'
            ? '#ffb13d'
            : l.set
              ? '#9fe8ff'
              : l.small
                ? '#c9f7a6'
                : l.pow >= 100
                  ? '#ff3d7f'
                  : l.pow >= 80
                    ? '#ffb13d'
                    : '#fff';
      outlinedText(l.t, l.x, l.y, fill, 3);
      ctx.restore();
    }
  }
  /** TIMEOUT banner in the calling team's colours. */
  function drawTimeoutBanner(b) {
    const t = A.m.t[b.side];
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.life * 3, (1 - b.life) * 8);
    ctx.fillStyle = 'rgba(16,22,58,.85)';
    ctx.fillRect(250, VT + 18, 500, 62);
    ctx.fillStyle = t.color;
    ctx.fillRect(250, VT + 18, 10, 62);
    ctx.fillRect(740, VT + 18, 10, 62);
    ctx.textAlign = 'center';
    ctx.font = `30px ${FONT_DISPLAY}`;
    ctx.fillStyle = '#fff';
    ctx.fillText('TIMEOUT', 500, VT + 52);
    ctx.font = `700 13px ${FONT_ROUND}`;
    ctx.fillStyle = t.color;
    ctx.fillText(`${t.name}${b.manual ? ' · your call' : ''} · mentality reset`, 500, VT + 72);
    ctx.restore();
  }
  /** Glass cracks over the side that lost its zone. */
  function drawCrack(C) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, C.life * 1.4);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [col, w] of [
      ['rgba(159,232,255,.8)', 5],
      ['#ffffff', 2]
    ]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      for (const l of C.lines) polyline(l, C.x, C.y);
    }
    ctx.restore();
  }
  /** Slow motion: a vignette that deepens as time slows (A.ts eases in and out, see timeScale()). */
  function drawSlowVignette() {
    const sk = clamp((1 - (A.ts ?? 1)) / 0.7, 0, 1);
    if (sk <= 0.02) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W2 = cv.width,
      H2 = cv.height,
      vg = ctx.createRadialGradient(W2 / 2, H2 / 2, H2 * 0.3, W2 / 2, H2 / 2, W2 * 0.62);
    vg.addColorStop(0, 'rgba(8,10,34,0)');
    vg.addColorStop(1, `rgba(8,10,34,${(0.62 * sk).toFixed(3)})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W2, H2);
    ctx.restore();
  }
  /** Block-break energy wall: hexagon in the blockers' colour, cracks growing from the spinning ball. */
  function drawDrill(D) {
    const u = clamp(D.t / D.dur, 0, 1),
      k = D.s * VCS * (1 + 0.15 * u),
      R0 = 62 * k;
    ctx.save();
    ctx.translate(D.X, D.Y);
    // wall
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * Math.PI * 2 + Math.PI / 6;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(an) * R0, Math.sin(an) * R0 * 1.15);
    }
    ctx.closePath();
    const gr = ctx.createRadialGradient(0, 0, R0 * 0.1, 0, 0, R0 * 1.1);
    gr.addColorStop(0, 'rgba(255,255,255,.75)');
    gr.addColorStop(0.35, D.col);
    gr.addColorStop(1, 'rgba(20,30,80,.55)');
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(u * Math.PI);
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowColor = '#bff4ff';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = '#e6f7ff';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // cracks spread outward as the ball grinds in
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 6;
    const grow = u * 4;
    for (const l of D.lines) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let i = 1; i < l.length; i++) {
        const f = clamp(grow - (i - 1), 0, 1);
        if (f <= 0) break;
        const [x0, y0] = l[i - 1],
          [x1, y1] = l[i];
        ctx.lineTo((x0 + (x1 - x0) * f) * k, (y0 + (y1 - y0) * f) * k);
      }
      ctx.stroke();
    }
    // drill swirl around the ball
    const r = 9 * D.s * FIG;
    ctx.rotate(A.spin * 1.4);
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 1 ? '#fff27a' : D.el ? ECOL[D.el] : '#ff3d7f';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.5 + i * 0.35 + 0.2 * Math.sin(u * 12 + i)), i * 2.1, i * 2.1 + 1.6);
      ctx.stroke();
    }
    ctx.restore();
  }
  /** Trail thickness factor by hit power: ×0.8 at 60, ×1.6 at 100, ×2.2 at 130 and up (a harder spike leaves a fatter streak). */
  const trailSize = pw => Math.min(2.4, 0.8 + Math.max(0, pw - 60) / 50);
  /** The ball's power trail (screen space) at the ball's projection `q`; colour by OP, element or power. */
  function drawTrail(q) {
    const mv = A.mv ?? 1;
    if (A.trail.length < 2 || mv < 0.05) return;
    const Pw = A.trailPow,
      c = A.trailOp
        ? FXR.r() < 0.5
          ? '#fff27a'
          : '#8fe9ff'
        : A.trailEl
          ? ECOL[A.trailEl]
          : Pw >= 100
            ? '#ff3d7f'
            : Pw >= 80
              ? '#ffb13d'
              : '#9fe8ff';
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < A.trail.length; i++) {
      const a = A.trail[i - 1],
        b = A.trail[i],
        k = i / A.trail.length;
      ctx.globalAlpha = k * 0.8 * mv * mv;
      ctx.strokeStyle = c;
      ctx.lineWidth = k * (4 + Pw / 9) * q.s * trailSize(Pw) * (0.4 + 0.6 * mv);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }
  /** Frame: the 3D renderer draws the scene and then this canvas's screen-space layer (see js/render3d/). */
  function frame() {
    if (R3D && R3D.draw) return R3D.draw();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
  }
  return { applyView, drawChant, drawFx, drawTrail, frame };
})();
