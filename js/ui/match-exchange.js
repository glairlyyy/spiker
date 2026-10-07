// The between-point exchange box (spec §2.18): 1–2 lines with face cut-ins over the court, skippable. The director
// (js/render/director.js) decides when and what; this file only shows it. A glass panel low-centre above the control bar;
// each line: the speaker's face, name in team colour, the text typed in; team 0 on the left, team 1 on the right. A line
// holds 1.6 s + 40 ms per character of real time (not while paused); click / Space skips the current line.

const XCH = { hold: 1600, perChar: 40, cps: 60 }; // ms, ms per character, typing speed (characters per second)
let X = null; // the exchange on screen: { lines, i, t, done, el, raf, last }
/** Show lines [{ p: player id, t: text, side }]; `done` runs when they end or are skipped. */
function exchangeShow(lines, done) {
  exchangeHide(true);
  const st = $('#stage'),
    L = (lines || []).filter(l => l && l.t).slice(0, 2);
  if (!st || !L.length) {
    if (done) done(lines);
    return;
  }
  const el = document.createElement('div');
  el.className = 'xbox';
  el.id = 'xbox';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.addEventListener('click', e => {
    e.stopPropagation();
    exchangeSkip();
  });
  st.appendChild(el);
  X = { lines: L, i: -1, t: 0, done, el, last: performance.now(), raf: 0 };
  xNext();
  X.raf = requestAnimationFrame(xTick);
}
/** The next line (or the end). */
function xNext() {
  if (!X) return;
  X.i++;
  X.t = 0;
  if (X.i >= X.lines.length) return exchangeHide();
  const l = X.lines[X.i],
    p = typeof byId === 'function' ? byId(l.p) : null,
    side = l.side ?? (p && A && A.m && p.team === A.m.t[1] ? 1 : 0),
    team = A && A.m ? A.m.t[side] : null,
    mood = p && A && A.moodShown ? A.moodShown[p.id] || 0.4 : 0.4,
    row = document.createElement('div');
  row.className = `xl ${side ? 'r' : 'l'}`;
  row.style.setProperty('--tc', (team && team.color) || 'var(--line-strong)');
  row.innerHTML = `${p ? `<span class="xf">${faceSVG(p, mood, 48)}</span>` : ''}<span class="xb"><b>${esc(p ? p.name : l.who || 'Coach')}</b><span class="xt"></span></span>`;
  X.el.appendChild(row);
  X.row = row;
  X.full = String(l.t);
  if (Motion.reduced) row.querySelector('.xt').textContent = X.full; // reduced motion: no typing
}
/** Each frame: type the current line, hold it, move on. Real time; paused time does not count. */
function xTick(now) {
  if (!X) return;
  const dt = Math.min(100, now - X.last);
  X.last = now;
  if (!(A && A.paused)) X.t += dt;
  const n = Math.min(X.full.length, Math.floor((X.t / 1000) * XCH.cps)),
    tx = X.row && X.row.querySelector('.xt');
  if (tx && !Motion.reduced && tx.textContent.length !== n) tx.textContent = X.full.slice(0, n);
  if (X.t >= XCH.hold + XCH.perChar * X.full.length) xNext();
  if (X) X.raf = requestAnimationFrame(xTick);
}
/** Skip the current line (click / Space). True when an exchange was on screen. */
function exchangeSkip() {
  if (!X) return false;
  const tx = X.row && X.row.querySelector('.xt');
  if (tx) tx.textContent = X.full;
  xNext();
  return true;
}
/** Hide at once (skip, leaving the match); `done` still runs once unless `silent` (a new exchange replacing this one). */
function exchangeHide(silent) {
  if (!X) return;
  const x = X;
  X = null;
  cancelAnimationFrame(x.raf);
  x.el.remove();
  if (!silent && x.done) x.done(x.lines);
}
