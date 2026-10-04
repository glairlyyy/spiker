// Venue floors (spec §9.11): the court / free zone drawn per venue on the shared floor canvas.
import { KX, KZ } from '../units3d.mjs';
import { LOOK } from './looks.mjs';

/** The floor for one venue on the shared 40 m × 20 m floor plane (same mapping as the court lines). */
export function drawFloor(g, w, h, kind) {
  const L = LOOK[kind],
    m = w / 40,
    cx = w / 2,
    cy = h / 2,
    X = x => cx + (x - 500) * KX * m,
    Z = z => cy - (0.5 - z) * KZ * m,
    rnd = Math.random;
  g.fillStyle = L.free;
  g.fillRect(0, 0, w, h);
  if (kind === 'hall')
    for (let i = 0; i < 160; i++) {
      // planks
      g.fillStyle = i % 2 ? 'rgba(255,230,190,.05)' : 'rgba(70,40,10,.06)';
      g.fillRect(0, i * (h / 160), w, h / 160);
    }
  g.fillStyle = L.inner;
  g.fillRect(X(80), Z(0.08), X(920) - X(80), Z(0.92) - Z(0.08));
  if (kind === 'hall') {
    for (let i = 0; i < 160; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,235,200,.07)' : 'rgba(90,50,10,.07)';
      g.fillRect(X(80), i * (h / 160), X(920) - X(80), h / 160);
    }
    // faded basketball lines
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 0.05 * m;
    g.beginPath();
    g.arc(cx, cy, 1.8 * m, 0, 7);
    g.stroke();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(cx + s * 13 * m, cy, 6.7 * m, Math.PI / 2 + (s < 0 ? Math.PI : 0), (3 * Math.PI) / 2 + (s < 0 ? Math.PI : 0), s > 0);
      g.stroke();
    }
  }
  if (kind === 'beach' || kind === 'street') {
    // sand grains / asphalt speckle
    for (let i = 0; i < 26000; i++) {
      const v = rnd();
      g.fillStyle =
        kind === 'beach'
          ? v < 0.5
            ? 'rgba(120,90,40,.12)'
            : 'rgba(255,250,230,.16)'
          : v < 0.5
            ? 'rgba(0,0,0,.18)'
            : 'rgba(255,255,255,.06)';
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 3, 2 + rnd() * 3);
    }
  }
  if (kind === 'street') {
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.lineWidth = 3;
    for (let c = 0; c < 18; c++) {
      let x = rnd() * w,
        y = rnd() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo((x += (rnd() - 0.5) * 120), (y += (rnd() - 0.5) * 120));
      g.stroke();
    }
  }
  if (kind === 'arena' || kind === 'highland')
    for (let i = 0; i < 40; i++) {
      // scuffs
      g.fillStyle = 'rgba(0,0,0,.05)';
      g.beginPath();
      g.ellipse(X(120 + rnd() * 760), Z(0.12 + rnd() * 0.76), 0.6 * m * rnd() + 4, 0.2 * m * rnd() + 2, rnd() * 3, 0, 7);
      g.fill();
    }
  // emblem
  if (kind === 'arena' || kind === 'hall') {
    g.strokeStyle = 'rgba(255,255,255,.18)';
    g.lineWidth = 0.08 * m;
    g.beginPath();
    g.arc(cx, cy, 1.5 * m, 0, 7);
    g.stroke();
    g.font = `900 ${0.9 * m}px "Dela Gothic One","Arial Black",sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillText('SPITE & SPIKE', cx, Z(0.98) + 0.35 * m);
  }
  // lines: boundary, centre, attack lines (dashed past the side lines)
  const worn = kind === 'street' ? 0.75 : 0.95;
  g.strokeStyle = kind === 'beach' ? L.lines : `rgba(${kind === 'street' ? '242,230,176' : '255,255,255'},${worn})`;
  g.lineWidth = (kind === 'beach' ? 0.08 : 0.06) * m;
  g.strokeRect(X(80), Z(0.08), X(920) - X(80), Z(0.92) - Z(0.08));
  g.beginPath();
  for (const x of [500, 360, 640]) {
    g.moveTo(X(x), Z(0.08));
    g.lineTo(X(x), Z(0.92));
  }
  g.stroke();
  if (kind !== 'beach') {
    g.setLineDash([0.15 * m, 0.2 * m]);
    g.beginPath();
    for (const x of [360, 640])
      for (const [a, b] of [
        [0.08, 0.0],
        [0.92, 1.0]
      ]) {
        g.moveTo(X(x), Z(a));
        g.lineTo(X(x), Z(b));
      }
    g.stroke();
    g.setLineDash([]);
  }
}
