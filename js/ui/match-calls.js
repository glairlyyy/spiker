// Calls on screen (spec §2.13, T-234): at a decision point of your player in a career match you play, the world slows to
// a crawl, the camera holds on you, the edges darken and your options appear beside your player — each with its chance,
// the stats it leans on and the one holding you back. 5 s of real time (paused time does not count), then your player takes
// the suggested move. Keys 1–4 or a click. Display only: the pick goes back to the engine through rallyPull(pick).

const CALL = { ms: 5000, slow: 0.1, cap: 8 }; // (slow ≥ 0.1 eases in; lower snaps)
/** Which of your decision points to show (G.calls): Off never; All always; Key moments = set point, deuce, a long rally, the first ball of the match for each kind — at most CALL.cap a match. */
function callWanted(q) {
  if (G.calls === 'off' || !q.options || !q.options.length) return false;
  if (G.calls === 'all') return true;
  const shown = A.callsShown || (A.callsShown = { n: 0 }),
    [a, b] = A.m.pts,
    to = RULES.pointsToWin - 1,
    key = Math.max(a, b) >= to || q.n >= LONG_RALLY || !shown[q.kind];
  return key && shown.n < CALL.cap;
}
/** Each frame while a call is pending: show it once its moment is on screen, slow the beat, place the chips, run the ring. */
function callStep(cb) {
  const C = A.ask;
  if (!C.shown && A.bi < A.beats.length - 1) return; // not yet: the call opens on the last beat before the decision
  if (!C.shown) callShow(C);
  if (cb && cb._s && !cb._call) {
    cb._call = { slow: cb.slow, slowAt: cb.slowAt };
    cb.slow = CALL.slow;
    cb.slowAt = null;
  }
  const now = performance.now();
  C.left -= Math.min(100, now - (C.last || now));
  C.last = now;
  const el = $('#calls');
  if (el) {
    el.style.setProperty('--left', `${Math.max(0, C.left / CALL.ms)}`);
    const sec = el.querySelector('.cring b');
    if (sec) sec.textContent = Math.max(0, Math.ceil(C.left / 1000));
    callPlace(el, C.q.p.id);
  }
  if (C.left <= 0) callPick(null); // time's up: your player takes the suggested move
}
/** Open the call: vignette, chase camera, the option chips. */
function callShow(C) {
  C.shown = true;
  const s = A.callsShown || (A.callsShown = { n: 0 });
  s.n++;
  s[C.q.kind] = 1;
  const st = $('#stage');
  if (!st) return;
  st.classList.add('calling');
  if (!A.shot) A.shot = C.shot = { kind: 'follow', p: C.q.p.id, track: true };
  const q = C.q,
    head = q.kind === 'serve' ? 'Your serve' : 'Your attack',
    odds = o =>
      q.kind === 'serve'
        ? `Ace ${o.odds.win}% · fault ${o.odds.err}%`
        : `Kill ${o.odds.win}% · blocked ${o.odds.lose}% · error ${o.odds.err}%`,
    wk = o => `${statI(statKey(o.weak.k), 14)} ${esc(STATNAME[o.weak.k])} ${o.weak.v}`;
  const el = document.createElement('div');
  el.className = 'calls';
  el.id = 'calls';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', head);
  el.innerHTML = `<div class="chd"><b>${head}</b><span class="cring" aria-hidden="true"><b>5</b></span></div>${q.options
    .map(
      (o, i) =>
        `<button class="btn callo ${o.id === q.suggest ? 'sug' : ''}" onclick="callPick(${i})"><kbd>${i + 1}</kbd><span class="cl"><b>${esc(o.label)}</b>${o.id === q.suggest ? '<em>suggested</em>' : ''}<small>${odds(o)}</small></span><span class="cpct">${o.odds.win}%</span><span class="cst">${o.stats.map(k => statI(statKey(k), 14)).join('')}<small class="cwk" ${tip('The stat that holds this option back most — train it to raise the odds')}>${wk(o)}</small></span></button>`
    )
    .join('')}`;
  st.appendChild(el);
  callPlace(el, q.p.id);
}
/** Keep the chips beside your player (their screen position), inside the stage. */
function callPlace(el, id) {
  const d = A.disp && A.disp[id],
    cv = $('#cv');
  if (!d || !cv) return;
  const k = cv.clientWidth / 1000,
    q = P(d.x, d.z, 170 + (d.jy || 0)),
    W = el.offsetWidth,
    H = el.offsetHeight,
    sw = cv.clientWidth,
    sh = cv.clientHeight;
  let x = q.X * k + 28,
    y = (q.Y - VT) * k - H / 2; // logical Y starts at VT
  if (x + W > sw - 8) x = q.X * k - 28 - W; // no room on the right: the other side of the player
  el.style.left = `${Math.round(clamp(x, 8, Math.max(8, sw - W - 8)))}px`;
  el.style.top = `${Math.round(clamp(y, 8, Math.max(8, sh - H - 8)))}px`;
}
/** Answer the call: option index i (null = the suggested move). The world speeds back up; the rally resumes with the pick. */
function callPick(i) {
  const C = A && A.ask;
  if (!C) return;
  const o = i == null ? null : C.q.options[i];
  if (i != null && !o) return;
  const cb = A.beats[A.bi];
  if (cb && cb._call) {
    cb.slow = cb._call.slow;
    cb.slowAt = cb._call.slowAt;
  }
  if (C.shot && A.shot === C.shot) A.shot = null;
  callHide();
  rallyPull(o ? o.id : null);
}
/** Take the call off the screen. */
function callHide() {
  const el = $('#calls');
  if (el) el.remove();
  const st = $('#stage');
  if (st) st.classList.remove('calling');
}
