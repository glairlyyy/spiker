// Screen-space layer over the 3D scene: view transform, labels, particles, drill wall, ball trail, flashes.

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
function seg(a, b, c, w) {
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a.X, a.Y);
  ctx.lineTo(b.X, b.Y);
  ctx.stroke();
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
  if (A.shake > 0.3) tr(rnd(-A.shake, A.shake), rnd(-A.shake, A.shake) * 0.6);
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
  if (A.chant) {
    const ch = A.chant,
      t = A.m.t[ch.side],
      pl = 1 + 0.08 * Math.abs(Math.sin(now * 0.012));
    ctx.save();
    ctx.globalAlpha = Math.min(1, ch.life * 3) * 0.9;
    ctx.translate(ch.side ? 740 : 300, 135);
    ctx.scale(pl, pl);
    ctx.font = '30px "Dela Gothic One","Arial Black",sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#10163a';
    ctx.strokeText(ch.text, 0, 0);
    ctx.fillStyle = t.color;
    ctx.fillText(ch.text, 0, 0);
    ctx.restore();
  }
}
/** Floor-level effects in screen space: flat shockwave rings and ball marks. */
function drawFloorFx() {
  // rings on floor
  for (const r of A.rings)
    if (r.flat) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, r.life);
      ctx.strokeStyle = r.c;
      ctx.lineWidth = r.w * r.life + 1;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
  if (A.decals)
    for (const d of A.decals) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, d.life * 1.5);
      ctx.strokeStyle = '#4a3b2c';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (const l of d.lines) {
        ctx.beginPath();
        l.forEach((q, i) => (i ? ctx.lineTo(d.x + q[0], d.y + q[1]) : ctx.moveTo(d.x + q[0], d.y + q[1])));
        ctx.stroke();
      }
      ctx.restore();
    }
}
/** Everything drawn over the players: arrows, links, walls, particles, drill, labels, bolts, banners, slow-mo, flash. */
function drawFx(now) {
  if (A.ghost) {
    const G2 = A.ghost,
      cx = (G2.f.X + G2.t.X) / 2,
      cy = Math.min(G2.f.Y, G2.t.Y) - 90,
      prog = Math.min(1, (1 - G2.life) * 2.2);
    ctx.save();
    ctx.globalAlpha = Math.min(1, G2.life * 1.6);
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -prog * 40;
    ctx.strokeStyle = '#9fe8ff';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#3fd9ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(G2.f.X, G2.f.Y);
    ctx.quadraticCurveTo(cx, cy, G2.t.X, G2.t.Y);
    ctx.stroke();
    ctx.setLineDash([]);
    const u = prog,
      bx = (1 - u) * (1 - u) * G2.f.X + 2 * (1 - u) * u * cx + u * u * G2.t.X,
      by = (1 - u) * (1 - u) * G2.f.Y + 2 * (1 - u) * u * cy + u * u * G2.t.Y;
    ctx.globalAlpha *= 0.55;
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = Math.min(1, G2.life * 1.6);
    ctx.strokeStyle = '#ff3d7f';
    ctx.lineWidth = 4;
    const X = G2.t.X,
      Y = G2.t.Y;
    ctx.beginPath();
    ctx.moveTo(X - 9, Y - 9);
    ctx.lineTo(X + 9, Y + 9);
    ctx.moveTo(X + 9, Y - 9);
    ctx.lineTo(X - 9, Y + 9);
    ctx.stroke();
    ctx.restore();
  }
  if (A.real) {
    const G2 = A.real,
      cx = (G2.f.X + G2.t.X) / 2,
      cy = Math.min(G2.f.Y, G2.t.Y) - 50;
    ctx.save();
    ctx.globalAlpha = Math.min(1, G2.life * 1.5);
    ctx.strokeStyle = '#ff3d7f';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#ff3d7f';
    ctx.shadowBlur = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(G2.f.X, G2.f.Y);
    ctx.quadraticCurveTo(cx, cy, G2.t.X, G2.t.Y);
    ctx.stroke();
    const an = Math.atan2(G2.t.Y - cy, G2.t.X - cx);
    ctx.fillStyle = '#ff3d7f';
    ctx.beginPath();
    ctx.moveTo(G2.t.X, G2.t.Y);
    ctx.lineTo(G2.t.X - Math.cos(an - 0.45) * 16, G2.t.Y - Math.sin(an - 0.45) * 16);
    ctx.lineTo(G2.t.X - Math.cos(an + 0.45) * 16, G2.t.Y - Math.sin(an + 0.45) * 16);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = '16px "Dela Gothic One","Arial Black",sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#10163a';
    ctx.strokeText('Real set', cx, cy + 8);
    ctx.fillStyle = '#fff';
    ctx.fillText('Real set', cx, cy + 8);
    ctx.restore();
  }
  if (A.link) {
    const a = A.disp[A.link.p1],
      b = A.disp[A.link.p2];
    if (a && b) {
      const q1 = P(a.x, a.z, a.jy + 70),
        q2 = P(b.x, b.z, b.jy + 70);
      ctx.save();
      ctx.globalAlpha = Math.min(1, A.link.life * 2);
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ffd84d';
      ctx.shadowBlur = 18;
      for (const [c, w] of [
        [A.link.c, 10],
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
      if (R() < 0.5)
        A.parts.push({
          kind: 'spark',
          x: lerp(q1.X, q2.X, R()),
          y: lerp(q1.Y, q2.Y, R()) - 10,
          vx: 0,
          vy: -0.02,
          s: rnd(3, 6),
          rot: 0,
          vr: 0.02,
          life: 1,
          dec: 0.003,
          c: '#ffe38a'
        });
    }
  }
  if (A.wallFx) {
    const W = A.wallFx,
      c = ECOL[W.el] || '#fff';
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
  // fx
  if (A.lines) {
    const Ln = A.lines;
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
  for (const r of A.rings)
    if (!r.flat) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, r.life);
      ctx.strokeStyle = r.c;
      ctx.lineWidth = r.w * r.life + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
  drawParts();
  if (A.drill) {
    // over smoke and sparks so the wall reads clearly; the ball stays on top of the wall it drills through
    drawDrill();
  }
  ctx.globalAlpha = 1;
  for (const l of A.labels) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, l.life * 2);
    ctx.textAlign = 'center';
    let sz = l.big ? 12 : l.small ? 8 : l.pow ? Math.min(12, 9 + Math.max(0, l.pow - 60) / 10) : 9;
    if (l.stamp) sz *= 1.2 + Math.max(0, l.life - 0.82) * 6;
    ctx.font = `${sz}px "Dela Gothic One","Arial Black",sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#10163a';
    ctx.strokeText(l.t, l.x, l.y);
    ctx.fillStyle = l.set ? '#9fe8ff' : l.small ? '#c9f7a6' : l.pow >= 100 ? '#ff3d7f' : l.pow >= 80 ? '#ffb13d' : '#fff';
    ctx.fillText(l.t, l.x, l.y);
    ctx.restore();
  }
  if (A.bolts)
    for (const b of A.bolts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.life * 1.6) * (R() < 0.2 ? 0.4 : 1);
      ctx.shadowColor = '#6fd6ff';
      ctx.shadowBlur = 18;
      ctx.lineJoin = 'round';
      for (const [c, w] of [
        ['#6fd6ff', 7 * b.w],
        ['#ffffff', 2.5 * b.w]
      ]) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        b.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.stroke();
        ctx.lineWidth = w * 0.5;
        for (const br of b.br) {
          ctx.beginPath();
          br.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  if (A.toBanner) {
    const b = A.toBanner,
      t = A.m.t[b.side],
      al = Math.min(1, b.life * 3, (1 - b.life) * 8);
    ctx.save();
    ctx.globalAlpha = al;
    ctx.fillStyle = 'rgba(16,22,58,.85)';
    ctx.fillRect(250, VT + 18, 500, 62);
    ctx.fillStyle = t.color;
    ctx.fillRect(250, VT + 18, 10, 62);
    ctx.fillRect(740, VT + 18, 10, 62);
    ctx.textAlign = 'center';
    ctx.font = '30px "Dela Gothic One","Arial Black",sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('TIMEOUT', 500, VT + 52);
    ctx.font = '700 13px "M PLUS Rounded 1c",sans-serif';
    ctx.fillStyle = t.color;
    ctx.fillText(`${t.name}${b.manual ? ' · your call' : ''} · mentality reset`, 500, VT + 72);
    ctx.restore();
  }
  if (A.crack) {
    const C = A.crack;
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
      for (const l of C.lines) {
        ctx.beginPath();
        l.forEach((q, i) => (i ? ctx.lineTo(C.x + q[0], C.y + q[1]) : ctx.moveTo(C.x + q[0], C.y + q[1])));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // slow motion: a vignette that deepens as time slows (A.ts eases in/out, see step())
  const sk = clamp((1 - (A.ts ?? 1)) / 0.7, 0, 1);
  if (sk > 0.02) {
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
  if (A.flash > 0.02) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(${A.flashC || '255,255,255'},${A.flash})`;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
}
/** Block-break energy wall: hexagon in the blockers' colour, cracks growing from the spinning ball. */
function drawDrill() {
  const D = A.drill;
  if (!D) return;
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
  ctx.globalAlpha = 1;
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
/** The ball's power trail (screen space). */
function drawTrail(q) {
  if (A.trail.length > 1) {
    const Pw = A.trailPow,
      c = A.trailOp
        ? R() < 0.5
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
      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = c;
      ctx.lineWidth = k * (4 + Pw / 9) * q.s;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}
/** Frame: the 3D renderer draws the scene and then this canvas's screen-space layer (see js/render3d/). */
function draw() {
  if (R3D && R3D.draw) return R3D.draw();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
}
