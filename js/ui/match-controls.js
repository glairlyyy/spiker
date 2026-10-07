// Match screen controls and HUD (spec §9.9): timeouts, tactic and defence pickers, the ⚙ settings pop-over, camera
// modes and follow target, fullscreen, speed / pause / skip, the scoreboard, the commentary ticker, the rail and box score; hotkeys.
// The screen itself (startMatch, A, the 3D world, leaving) is match-screen.js.

/** A side's timeout button; `both` (a Monster game: two sides) names the team on it, else just "Timeout". */
const timeoutButton = (t, i, both) =>
  `<button class="btn tob" id="to${i}" data-both="${both ? 1 : ''}" style="--tc:${t.color}" onclick="reqTO(${i})" ${tip(`Call ${t.name}'s one timeout at the next break`)}>${toLabel(t, both, '')}</button>`;
const toLabel = (t, both, state) => `Timeout${both ? ` ${esc(t.short)}` : ''}${state ? ` <small>${state}</small>` : ''}`;
/** The pause button's label (hotkey printed). */
const pauseLabel = paused => `${paused ? '▶ Resume' : '❚❚ Pause'} <kbd>Space</kbd>`;
/** Coach tactic select for side `i` (captain's call or a fixed tactic). */
const tacticPicker = (t, i) =>
  `<label class="tac" style="--tc:${t.color}" ${tip(`Coach tactic for ${t.name} — applies from the next rally`)}><span>${esc(t.short)}</span><select id="tac${i}" onchange="setTactic(${i},this.value)"><option value="cap">Captain's call${leadLv(t.cap) ? ` (Lv${leadLv(t.cap)})` : ''}</option>${Object.entries(
    TACTICS
  )
    .map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`)
    .join('')}</select><small class="tacnow" id="tacnow${i}"></small></label>`;
/** Defence setting select for side `i` (captain's call or a fixed setting). */
const defencePicker = (t, i) =>
  `<label class="tac" style="--tc:${t.color}" ${tip(`Defence setting for ${t.name} — how the front row blocks; applies from the next rally`)}><span>${esc(t.short)} def</span><select id="dset${i}" onchange="setDefence(${i},this.value)"><option value="cap">Captain's call${leadLv(t.cap) ? ` (Lv${leadLv(t.cap)})` : ''}</option>${Object.entries(
    DEFSETS
  )
    .map(([k, v]) => `<option value="${k}" title="${esc(v.desc)}">${esc(v.name)}</option>`)
    .join('')}</select><small class="tacnow" id="dsnow${i}"></small></label>`;
const CAM3 = { courtside: 'Courtside', broadcast: 'Broadcast', follow: 'Follow', pov: 'POV', bird: "Bird's-eye" };
const cam3Text = () => `Camera: ${CAM3[(R3D && R3D.camMode()) || 'courtside'] || 'Courtside'}`;
/** Set a button's label if it is on screen. */
function setLabel(sel, text) {
  const b = $(sel);
  if (b) b.textContent = text;
}
/** The ⚙ pop-over: every setting as a labelled segment showing all of its options (click = set it). */
function settingsMenu() {
  const cam = (R3D && R3D.camMode()) || 'courtside',
    seg = (label, kind, opts, cur, t) =>
      `<div class="sset" ${tip(t)}><span class="cgl">${label}</span><div class="seg">${Object.entries(opts)
        .map(([k, n]) => `<button class="btn ${k === cur ? 'on' : ''}" onclick="setOpt('${kind}','${k}')">${n}</button>`)
        .join('')}</div></div>`;
  return `${seg('Hype', 'hype', Object.fromEntries(Object.entries(HYPE).map(([k, h]) => [k, h.name])), G.hype, 'Staged shonen moments before big attacks. Normal: element spikes, match points, star face-offs. Max: also long rallies and comebacks. Tap the court to skip one.')}
    ${seg('Calls', 'calls', CALL_MODES, G.calls, 'Your decisions in a career match you play: serve and attack options with their odds. Key moments: set point, deuce, long rallies, the first ball. Off: your player decides.')}
    ${seg('Trails', 'trail', TRAIL_STYLES, G.trail, 'Hand trails of stars and OP players. Light: a streak in their hair colour. Ink: a black brush stroke burning crimson.')}
    ${seg('Cut-ins', 'cut', { full: 'Full', mini: 'Mini' }, G.cutMini ? 'mini' : 'full', 'Full cut-ins pause play; mini shows them as a corner notification')}
    ${seg('Zooms', 'zoom', { on: 'On', off: 'Off' }, G.camFixed || RM ? 'off' : 'on', 'On: gentle zoom on big plays at the net. Off: no zooms or pushes (motion-friendly).')}
    ${seg('Motion', 'motion', { full: 'Full', reduced: 'Reduced' }, Motion.pref, 'Full: panels slide and fade, numbers count. Reduced: short fades only (also follows your system setting).')}
    ${seg('Graphics', 'gfx', Object.fromEntries(Object.entries(GFX).map(([k, g]) => [k, g.name])), G.gfx, 'High: full resolution always. Auto: sharp, drops a little only if frames run slow. Fast: lower resolution for weaker devices.')}
    ${seg('Camera <kbd>C</kbd>', 'cam', CAM3, cam, "Courtside: close and low, following the ball. Broadcast: the whole court from the stands. Follow: behind one player. POV: through their eyes. Bird's-eye: from straight above, your side at the bottom.")}
    <select id="folsel" class="folsel" hidden onchange="pickFollow(this.value)" aria-label="Player to follow" title="The player the Follow camera stays behind"></select>
    <label class="vol sset"><span class="cgl">Volume</span><input type="range" min="0" max="100" value="${Math.round(SND.vol * 100)}" oninput="setVolume(this.value / 100)" aria-label="Volume"></label>
    <button class="btn quiet danger" onclick="leaveMatch()" ${tip('Leave without finishing the match')}>Leave match</button>`;
}
/** Set one ⚙ option directly (the cycle functions stay for anything that still cycles), then redraw the pop-over. */
function setOpt(kind, v) {
  if (kind === 'hype' && HYPE[v]) {
    G.hype = v;
    store.set(KEYS.hype, v);
  } else if (kind === 'calls' && CALL_MODES[v]) {
    G.calls = v;
    store.set(KEYS.calls, v);
  } else if (kind === 'trail' && TRAIL_STYLES[v]) {
    G.trail = VFX.hand.style = v; // the VFX panel shows the same choice
    store.set(KEYS.trail, v);
    if (typeof vfxSave === 'function') vfxSave();
  } else if (kind === 'cut') {
    G.cutMini = v === 'mini';
    store.set(KEYS.cutins, v);
    if (G.cutMini) hideCut();
  } else if (kind === 'zoom') {
    G.camFixed = v === 'off';
    store.set(KEYS.camera, G.camFixed ? 'fixed' : 'dynamic');
    if (G.camFixed && A && A.cam) A.cam.z = A.cam.tz = 0;
  } else if (kind === 'gfx' && GFX[v]) {
    G.gfx = v;
    store.set(KEYS.gfx, v);
  } else if (kind === 'cam' && R3D && CAM3[v]) {
    R3D.setCamMode(v);
  } else if (kind === 'motion') Motion.set(v);
  const pb = $('.setpop .popb');
  if (pb) pb.innerHTML = settingsMenu();
  cam3Label();
}
/** Follow camera: the player to stay behind (set from the select in a Monster game; your player in a career match). */
let followPick = null;
function followTarget() {
  const ds = A && A.disp ? Object.values(A.disp) : [],
    you = ds.find(d => d.p.you);
  if (you) return { id: you.p.id, ds: [] }; // career: always you
  const d = ds.find(q => q.p.id === followPick) || ds.find(q => q.side === 0);
  return { id: d ? d.p.id : null, ds };
}
function cam3Label() {
  setLabel('#cam3btn', cam3Text());
  if (!R3D) return;
  const f = ['follow', 'pov'].includes(R3D.camMode()),
    t = f ? followTarget() : { id: null, ds: [] },
    sel = $('#folsel');
  R3D.setFollow(t.id);
  if (!sel) return;
  sel.hidden = !(f && t.ds.length);
  if (!sel.hidden)
    sel.innerHTML = t.ds
      .sort((a, b) => a.side - b.side || a.p.num - b.p.num)
      .map(d => `<option value="${esc(d.p.id)}" ${d.p.id === t.id ? 'selected' : ''}>${esc(`#${d.p.num} ${d.p.name}`)}</option>`)
      .join('');
}
function pickFollow(id) {
  followPick = id;
  cam3Label();
}
function toggleCam3D() {
  if (!R3D) return;
  const next = { courtside: 'broadcast', broadcast: 'follow', follow: 'pov', pov: 'bird', bird: 'courtside' };
  R3D.setCamMode(next[R3D.camMode()] || 'courtside');
  cam3Label();
  const pb = $('.setpop .popb');
  if (pb) pb.innerHTML = settingsMenu(); // the ⚙ Camera segment follows
}
/** Fullscreen the court. Falls back to a fixed full-viewport overlay where the Fullscreen API is missing (iPhone). */
function toggleFullscreen() {
  const st = $('#match'); // the whole match screen, HUD included (spec §9.9)
  if (!st) return;
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else if (st.classList.contains('fake-fs')) st.classList.remove('fake-fs');
  else {
    const req = st.requestFullscreen || st.webkitRequestFullscreen;
    if (req) {
      const r = req.call(st);
      if (r && r.catch) r.catch(() => st.classList.add('fake-fs'));
    } else st.classList.add('fake-fs');
  }
  setTimeout(fit, 60);
}
addEventListener('keydown', e => {
  if (!A || e.target.closest('input,select,textarea,button')) return;
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 'b' || e.key === 'B') railOpen();
  else if (e.key === 't' || e.key === 'T') railOpen('tac');
  else if ((e.key === 'v' || e.key === 'V') && $('#vfxp')) vfxToggle();
  else if (e.key === 'c' || e.key === 'C')
    toggleCam3D(); // cycle the camera (its modes are in ⚙ too)
  else if (/^[1-4]$/.test(e.key) && A.ask && A.ask.shown)
    callPick(+e.key - 1); // a call of yours (spec §2.13)
  else if (/^[1-9]$/.test(e.key) && A.railTab === 'tac' && !$('#mrail').hidden) flipTech(+e.key - 1);
  else if (e.key === 'Escape') {
    $('#stage')?.classList.remove('fake-fs');
    railOpen(null);
  } else if (e.key === ' ') {
    e.preventDefault();
    togglePause();
  }
});
/** Queue side `i`'s one timeout for the next break. */
function reqTO(i) {
  if (!A || A.done || A.m.to[i] || A.m.toReq[i]) return;
  A.m.toReq[i] = 1;
  logLine(`Timeout requested for ${A.m.t[i].name} — it starts at the next break`, 'set');
  updTO();
}
/** Coach tactic change for one side; takes effect from the next set of the ball. */
function setTactic(i, v) {
  if (!A || A.done) return;
  const t = A.m.t[i];
  if (v === 'cap') {
    A.m.tacMode[i] = 'cap';
    showTac(i);
    logLine(
      `${t.name} coach: captain ${t.cap.name} calls the plays${leadLv(t.cap) ? '' : ' (leadership too low to change anything)'}`,
      'set'
    );
    return;
  }
  if (!TACTICS[v]) return;
  A.m.tacMode[i] = 'fixed';
  A.m.tac[i] = v;
  showTac(i);
  logLine(
    `${t.name} coach: ${TACTICS[v].name}${v === 'auto' ? ' — the setter reads the block' : ` — feed the ${v.toUpperCase()}s`}`,
    'set'
  );
  instant({ k: 'coachtalk', side: i, text: v === 'auto' ? 'Your call, setter!' : v === 'ws' ? 'Feed the wings!' : 'Go quick, middles!' });
}
/** Defence setting change for one side; takes effect from the next rally. */
function setDefence(i, v) {
  if (!A || A.done) return;
  const t = A.m.t[i];
  if (v === 'cap') {
    A.m.dsetMode[i] = 'cap';
    showTac(i);
    logLine(`${t.name} defence: captain ${t.cap.name} calls it${leadLv(t.cap) ? '' : ' (leadership too low to change anything)'}`, 'set');
    return;
  }
  if (!DEFSETS[v]) return;
  A.m.dsetMode[i] = 'fixed';
  A.m.dset[i] = v;
  showTac(i);
  logLine(`${t.name} defence: ${DEFSETS[v].name} — ${DEFSETS[v].desc}`, 'set');
}
/** In captain mode, show which tactic and defence setting the captain is running right now. */
function showTac(i) {
  const s = $('#tacnow' + i),
    d = $('#dsnow' + i);
  if (s && A) s.textContent = A.m.tacMode[i] === 'cap' ? `→ ${TACTICS[A.m.tac[i]].short}` : '';
  if (d && A) d.textContent = A.m.dsetMode[i] === 'cap' ? `→ ${DEFSETS[A.m.dset[i]].short}` : '';
}
/** Timeout buttons: disabled once used or queued. */
function updTO() {
  if (!A) return;
  [0, 1].forEach(i => {
    const b = $('#to' + i);
    if (!b) return;
    const used = A.m.to[i] && !A.m.toReq[i];
    b.disabled = !!(A.m.to[i] || A.m.toReq[i] || A.done);
    b.innerHTML = toLabel(A.m.t[i], !!b.dataset.both, used ? 'used' : A.m.toReq[i] ? 'next break' : '');
  });
}
function setSpeed(s) {
  if (!A) return;
  A.speed = s;
  document.querySelectorAll('.seg .btn, .fsspd').forEach(b => b.classList.toggle('on', +b.dataset.s === s));
}
function togglePause() {
  if (!A) return;
  A.paused = !A.paused;
  railOpen(A.paused ? A.railTab || 'box' : null); // the rail opens on pause and closes on resume
  const pb = $('#pause');
  if (pb) pb.innerHTML = pauseLabel(A.paused);
  setLabel('#fspause', A.paused ? '▶' : '❚❚');
}
/** Simulate the rest of the match at once and show the result. */
function skipMatch() {
  if (!A || A.done) return;
  const m = A.m;
  rallyFlush(); // a rally waiting at your call finishes with the AI's play first
  m.rec = false;
  while (!m.over) playRally(m);
  hideCut();
  board(snap(m));
  finishMatch();
}
/** Update the scoreboard from a match snapshot: points, serve, rotations, momentum and zone. */
function board(s) {
  if (!$('#p0')) return;
  updTO();
  techSync();
  for (const i of [0, 1]) {
    const el = $('#p' + i);
    if (s.pts[i] > +el.textContent) Motion.play(el, 'bump'); // the scorer's digit bumps once (spec §9.12)
    el.textContent = s.pts[i];
  }
  if ($('#fs0')) {
    $('#fs0').textContent = s.pts[0];
    $('#fs1').textContent = s.pts[1];
  }
  [0, 1].forEach(i => {
    $('#p' + i).classList.toggle('srv', s.serve === i);
    const r = $('#r' + i);
    if (r)
      r.innerHTML = s.rot[i]
        .map((id, k) => {
          const p = byId(id);
          const sv = k === 0 && s.serve === i;
          return `<i class="${sv ? 'sv' : ''} ${k === 1 || k === 2 ? 'fr' : ''}" title="${esc(p.name)}${k === 1 || k === 2 ? ' (front row)' : ' (back row)'}">${p.num}<b>${p.role}</b>${sv ? '<em>serve</em>' : ''}</i>`;
        })
        .join('');
  });
  if (s.mom) {
    $('#momf').style.width = 50 + 25 * (s.mom[0] - s.mom[1]) + '%';
    const zs = [0, 1].filter(i => s.zone[i]),
      zt = A ? A.m.t : null,
      z = $('#zone');
    if (z && zt) {
      z.classList.toggle('on', zs.length > 0);
      z.innerHTML = zs.length
        ? `In the zone: ${zs.map(i => `<b class="tc" style="--c:${zt[i].color}">${esc(zt[i].short)}</b>`).join(' ')}`
        : '';
    }
    if (A) {
      A.moodShown = s.mood;
      A.zoneShown = s.zone;
      A.buffShown = s.buff;
      A.egShown = s.eg || {};
      A.staShown = s.sta || {};
    }
  }
  const mx = Math.max(...s.pts),
    mn = Math.min(...s.pts);
  $('#setn').textContent = s.over ? 'Final' : mx >= RULES.pointsToWin - 1 && mx > mn ? 'Match point' : rulesText();
}
/** Show a commentary line in the court ticker (plain text; `c` is the line kind, unused since the log tab went): the last two, newest in ink. */
function logLine(t, c) {
  const tk = $('#ticker');
  if (!tk) return;
  const old = tk.firstElementChild;
  tk.innerHTML = `<div>${esc(t)}</div>${old ? `<div class="old">${old.innerHTML}</div>` : ''}`;
}
/** The match rail (Box score · Tactics): open on a tab, toggle (no tab), or close (null). */
const RAIL_TABS = { box: 'Box score', tac: 'Tactics' };
function railOpen(tab) {
  const r = $('#mrail');
  if (!r || !A) return;
  if (tab === null || (tab === undefined && !r.hidden)) {
    r.hidden = true;
    return;
  }
  A.railTab = tab || A.railTab || 'box';
  r.hidden = false;
  for (const el of r.querySelectorAll('[data-rt]')) {
    const on = el.dataset.rt === A.railTab;
    if (el.classList.contains('rt')) el.hidden = !on;
    else el.classList.toggle('on', on);
  }
}
/** Redraw both box-score tables. */
function boxScore() {
  const el = $('#box');
  if (!el || !A) return;
  const m = A.m,
    played = t => squadOf(t).filter(p => t.P.includes(p) || m.stat[p.id]); // on court now, or came on and played
  el.innerHTML = m.t
    .map(
      t =>
        `<table><caption>${chip(t)}${esc(t.name)}</caption><thead><tr><th>Player</th>${['OVR', 'Kills', 'Blocks', 'Aces', 'Digs', 'Errors', 'Top km/h', 'Mood', 'Stamina'].map(h => `<th class="vh"><span>${h}</span></th>`).join('')}</tr></thead><tbody>${played(
          t
        )
          .map(p => {
            const s = m.stat[p.id] || blank();
            return `<tr><td>${stag(p)}${esc(p.name)}${p.cap ? ' <span class="capb">C</span>' : ''} <i>${p.role}</i></td><td>${ovr(p)}</td><td>${s.k}</td><td>${s.blk}</td><td>${s.ace}</td><td>${s.dig}</td><td>${s.err}</td><td>${s.top || '–'}</td><td>${faceSVG(p, (A.moodShown || m.mood)[p.id] || 0, 24)}</td><td><span class="sbar"><i style="--w:${Math.round(((A.staShown || m.sta)[p.id] ?? 1) * 100)}%"></i></span></td></tr>`;
          })
          .join('')}</tbody></table>`
    )
    .join('');
}
