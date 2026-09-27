// Player and coach tags drawn above the 3D figures, and the dive timeline shared with the 3D dive pose.

/** Coach label and timeout speech bubble (screen space) for coach `c` at projected point `pr`, scale `k`. */
function drawCoachTags(c, pr, k) {
  const side = c.side;
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(9 * k + 1)}px ${FONT_ROUND}`;
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText(A.m.to[side] ? 'Coach · TO used' : 'Coach', pr.X, pr.Y - 126 * k);
  if (c.bubble) {
    ctx.save();
    ctx.font = `700 15px ${FONT_ROUND}`;
    const tw = ctx.measureText(c.bubble).width,
      bx2 = clamp(pr.X + (side ? -tw / 2 - 10 : tw / 2 + 10), tw / 2 + 14, 1000 - tw / 2 - 14),
      by = pr.Y - 165 * k;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    roundRectPath(bx2 - tw / 2 - 12, by - 22, tw + 24, 32, 12);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pr.X + (side ? -6 : 6), by + 10);
    ctx.lineTo(pr.X + (side ? -18 : 18), by + 10);
    ctx.lineTo(pr.X, by + 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(c.bubble, bx2, by);
    ctx.restore();
  }
}
/** Add a rounded rectangle to the current path (a plain one where canvas roundRect is missing). */
function roundRectPath(x, y, w, h, r) {
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
/**
 * Dive timeline (fraction of the beat that started it): run-in, launch, belly slide, then push back up.
 * Returns the body angle, hip height/offset, how flat the body is and how far the arms reach.
 */
function diveShape(d) {
  const dv = d.dv || { t: 1e9, dur: 1 },
    f = dv.t / Math.max(1, dv.dur),
    L = clamp((f - 0.3) / 0.45, 0, 1), // launch → touchdown
    el = ease(L),
    slide = clamp((f - 0.75) / 0.6, 0, 1), // skid after touchdown
    up = clamp((f - 2.1) / 0.5, 0, 1), // get back up
    flat = el * (1 - up),
    hop = Math.sin(Math.PI * L) * 16;
  return {
    f, // dive time / beat time (the 3D dive is keyed on this)
    ang: lerp(0.32, 1.42, el) * (1 - up) + 0.1 * up,
    hipH: lerp(33, 6, flat) + hop * (1 - up),
    hipX: -34 * flat + 22 * (1 - Math.pow(1 - slide, 2)) * (1 - up),
    flat,
    reach: clamp(L * 1.6, 0, 1) * (1 - up),
    rise: up
  };
}
/** Everything drawn above a player in screen space: role tag, captain badge, call bubble, YOU marker, stamina bar. */
function drawTags(d, pr, k, staV) {
  const p = d.p;
  const srv = A.srvId === p.id && !A.done;
  ctx.textAlign = 'center';
  ctx.font = `800 ${Math.round(10 * k + 1)}px "M PLUS Rounded 1c",sans-serif`;
  ctx.fillStyle = p.op ? '#ff2e4d' : p.star ? '#ffd84d' : 'rgba(255,255,255,.75)';
  const tg = (p.star || p.op ? '★ ' : '') + p.role + (srv ? ' ●' : '');
  ctx.fillText(tg, pr.X, pr.Y - 113 * k);
  if (p.cap) {
    const w2 = ctx.measureText(tg).width,
      cx2 = pr.X + w2 / 2 + 7 * k,
      cy2 = pr.Y - 116.5 * k;
    ctx.fillStyle = '#ffd84d';
    ctx.beginPath();
    ctx.arc(cx2, cy2, 5.5 * k, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#10163a';
    ctx.font = `900 ${Math.round(8 * k + 1)}px "M PLUS Rounded 1c",sans-serif`;
    ctx.fillText('C', cx2, cy2 + 3 * k);
  }
  if (p.elOn && p.el) {
    // element gauge: a ring left of the role tag, filling in the element colour; full = glowing and pulsing
    const g = ((A.egShown || {})[p.id] || 0) / EG.full,
      w2 = ctx.measureText(tg).width,
      cx = pr.X - w2 / 2 - 8 * k,
      cy = pr.Y - 116.5 * k,
      r = 5 * k,
      col = ECOL[p.el];
    ctx.save();
    ctx.lineWidth = 2.4 * k;
    ctx.strokeStyle = 'rgba(16,22,58,.8)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.stroke();
    if (g > 0) {
      if (g >= 1) {
        ctx.shadowColor = col;
        ctx.shadowBlur = (8 + 5 * Math.sin(performance.now() * 0.012)) * k;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.55, 0, 7);
        ctx.fill();
      }
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, g));
      ctx.stroke();
    }
    ctx.restore();
  }
  if (d.call) {
    // ball call: speech bubble that pops in and fades out
    const c = d.call,
      a = Math.min(1, c.life * 4),
      pop = 1 + Math.max(0, c.life - 0.85) * 2,
      fs = Math.round((c.soft ? 10 : 11.5) * k * pop + 1);
    ctx.save();
    ctx.globalAlpha = a * (c.soft ? 0.85 : 1);
    ctx.font = `900 ${fs}px "M PLUS Rounded 1c",sans-serif`;
    const w = ctx.measureText(c.t).width + 12 * k,
      h = fs + 8 * k,
      bx = pr.X - w / 2,
      by = pr.Y - (p.you ? 163 : 145) * k - h - (d.jy || 0) * pr.s - (c.soft ? h + 6 * k : 0); // decoys shout from higher so bubbles don't stack
    ctx.fillStyle = c.soft ? 'rgba(255,255,255,.9)' : '#fff';
    ctx.strokeStyle = p.team.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, w, h, 7 * k) : ctx.rect(bx, by, w, h);
    ctx.moveTo(pr.X - 5 * k, by + h);
    ctx.lineTo(pr.X, by + h + 7 * k);
    ctx.lineTo(pr.X + 5 * k, by + h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#10163a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.t, pr.X, by + h / 2 + 1);
    ctx.restore();
  }
  if (p.you) {
    // career mode: marker over your own player
    const y = pr.Y - 127 * k;
    ctx.fillStyle = '#ff2e74';
    ctx.beginPath();
    ctx.moveTo(pr.X - 5 * k, y);
    ctx.lineTo(pr.X + 5 * k, y);
    ctx.lineTo(pr.X, y + 6 * k);
    ctx.fill();
    ctx.font = `900 ${Math.round(9 * k + 1)}px "M PLUS Rounded 1c",sans-serif`;
    ctx.fillText('YOU', pr.X, y - 3 * k);
  }
  if (staV != null && staV < 0.92 && !A.cele) {
    const w = 24 * k,
      x = pr.X - w / 2,
      y = pr.Y - 109 * k;
    ctx.fillStyle = 'rgba(16,22,58,.75)';
    ctx.fillRect(x - 1, y - 1, w + 2, 4 * k + 2);
    ctx.fillStyle = staV > 0.6 ? '#4ade80' : staV > 0.3 ? '#facc15' : '#f43f5e';
    ctx.fillRect(x, y, w * staV, 4 * k);
  }
}
