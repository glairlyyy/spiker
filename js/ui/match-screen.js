// Match screen DOM: scoreboard, controls, commentary, box score (the result and the cut-ins / toasts: ui/match-result.js).

let A = null,
  cv,
  ctx,
  last = 0;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Playback speeds offered in the controls. */
const SPEEDS = [1, 2, 4];
/** Scoreboard block for one side: name and the rotation (filled in by board()). */
const boardTeam = (t, i) =>
  `<div class="bt${i ? ' r' : ''}" style="--tc:${t.color}"><span class="bsw"></span><span class="bn">${esc(t.name)}</span><span class="rot" id="r${i}"></span></div>`;
const timeoutButton = (t, i) =>
  `<button class="btn tob" id="to${i}" style="--tc:${t.color}" onclick="reqTO(${i})" ${tip(`Call ${t.name}'s one timeout at the next break`)}>Timeout ${esc(t.short)}</button>`;
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
const CAM3 = { courtside: 'Courtside', broadcast: 'Broadcast', follow: 'Follow', pov: 'POV' };
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
    ${seg('Cut-ins', 'cut', { full: 'Full', mini: 'Mini' }, G.cutMini ? 'mini' : 'full', 'Full cut-ins pause play; mini shows them as a corner notification')}
    ${seg('Zooms', 'zoom', { on: 'On', off: 'Off' }, G.camFixed || RM ? 'off' : 'on', 'On: gentle zoom on big plays at the net. Off: no zooms or pushes (motion-friendly).')}
    ${seg('Graphics', 'gfx', Object.fromEntries(Object.entries(GFX).map(([k, g]) => [k, g.name])), G.gfx, 'High: full resolution always. Auto: sharp, drops a little only if frames run slow. Fast: lower resolution for weaker devices.')}
    ${seg('Camera', 'cam', CAM3, cam, 'Courtside: close and low, following the ball. Broadcast: the whole court from the stands. Follow: behind one player. POV: through their eyes.')}
    <select id="folsel" class="folsel" hidden onchange="pickFollow(this.value)" aria-label="Player to follow" title="The player the Follow camera stays behind"></select>
    <label class="vol sset"><span class="cgl">Volume</span><input type="range" min="0" max="100" value="${Math.round(SND.vol * 100)}" oninput="setVolume(this.value / 100)" aria-label="Volume"></label>`;
}
/** Set one ⚙ option directly (the cycle functions stay for anything that still cycles), then redraw the pop-over. */
function setOpt(kind, v) {
  if (kind === 'hype' && HYPE[v]) {
    G.hype = v;
    store.set(KEYS.hype, v);
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
  } else if (kind === 'cam' && R3D && CAM3[v]) R3D.setCamMode(v);
  const pb = $('.setpop .popb');
  if (pb) pb.innerHTML = settingsMenu();
  cam3Label();
}
/**
 * Open the match screen for a fixture: { a, b, round, court?, back, setup(m)?, onFinish(m) → plain-text message, onLeave() }.
 */
function startMatch(fx) {
  const { a, b } = fx,
    nm = { round: fx.round };
  const m = newMatch(a, b, true, { court: fx.court });
  if (fx.setup) fx.setup(m); // e.g. a career captain's pre-match buff
  VCS = m.court;
  G.view = 'match';
  // your side in a career fixture (the squad that holds your player): only it gets Timeout / Tactics; Monster game: both
  const you = fx.onFinish && typeof RUN !== 'undefined' && RUN ? Run.you(RUN) : null,
    mine = you ? ([0, 1].find(i => squadOf(m.t[i]).some(p => p.id === you.id)) ?? null) : null,
    sides = mine == null ? [0, 1] : [mine];
  $('#app').innerHTML = `<section class="match">
    <div class="board">
      ${boardTeam(a, 0)}
      <div class="bsc"><span id="p0">0</span><span class="colon">:</span><span id="p1">0</span><span class="setn" id="setn">${rulesText()}</span></div>
      ${boardTeam(b, 1)}
    </div>
    <div class="mom"><span class="ml">Momentum</span><div class="mbar" style="--a:${a.color};--b:${b.color}"><i id="momf"></i><em></em></div><span class="zone" id="zone" aria-live="polite"></span></div>
    <div class="stage" id="stage"><canvas id="cv" aria-label="Match court"></canvas>
      <div class="fsbar" aria-label="Fullscreen controls"><span class="fss"><i style="--tc:${a.color}"></i>${esc(a.short)} <b id="fs0">0</b> : <b id="fs1">0</b> ${esc(b.short)}<i style="--tc:${b.color}"></i></span>
        <span class="fsb"><button onclick="togglePause()" id="fspause" aria-label="Pause">❚❚</button>${SPEEDS.map(s => `<button onclick="setSpeed(${s})" data-s="${s}" class="fsspd">${s}x</button>`).join('')}<button onclick="toggleFullscreen()" aria-label="Exit fullscreen">✕</button></span></div>
      <div class="cut" id="cut"><div class="cut-band"><div class="cut-lines"></div><span class="cut-face"></span><span class="cut-face cut-face2"></span><span class="cut-num"></span><div class="cut-txt"><div class="cut-move"></div><div class="cut-name"></div><div class="cut-sub"></div></div></div></div>
      <div class="hbanner" id="hbanner" aria-live="polite"></div><div class="hsay" id="hsay" aria-live="polite"></div>
      <div class="toasts" id="toasts" aria-live="polite"></div><div class="ticker" id="ticker" aria-hidden="true"></div><div class="over" id="over" hidden></div></div>
    <div class="controls cbar">
      <div class="cg play"><span class="cgl">Play</span><button class="btn" id="pause" onclick="togglePause()">Pause <kbd>Space</kbd></button>
        <div class="seg" role="group" aria-label="Speed">${SPEEDS.map(s => `<button class="btn ${s === 1 ? 'on' : ''}" data-s="${s}" onclick="setSpeed(${s})">${s}×</button>`).join('')}</div>
        <button class="btn" onclick="skipMatch()" ${tip('Skip to the final result')}>Skip ⏭</button></div>
      <div class="cg team"><span class="cgl">${mine == null ? 'Teams' : 'Your team'}</span>${sides.map(i => timeoutButton(m.t[i], i)).join('')}
        <button class="btn" onclick="railOpen('tac')">Tactics</button></div>
      <div class="cg view"><span class="cgl">View</span><button class="btn" id="cam3bar" onclick="toggleCam3D()" ${tip('Courtside · Broadcast · Follow · POV')}>${cam3Text()}</button>
        <button class="btn" onclick="toggleFullscreen()" ${tip('Fullscreen court (F)')} aria-label="Fullscreen">⛶</button>
        <button class="btn" id="railbtn" onclick="railOpen()">Commentary · Box score <kbd>B</kbd></button>
        <button class="btn" id="snd" onclick="toggleSound()" aria-label="Sound">${SND.on ? '🔊' : '🔇'}</button>
        ${pop('⚙ ▾', settingsMenu(), 'setpop')}</div>
    </div>
    <aside class="mrail" id="mrail" hidden aria-label="Match details"><div class="rhd"><div class="tabs">${Object.entries(RAIL_TABS)
      .map(([k, n]) => `<button class="btn" data-rt="${k}" onclick="railOpen('${k}')">${n}</button>`)
      .join('')}</div><button class="btn x" onclick="railOpen(null)" aria-label="Close">✕</button></div>
      <div class="rbody"><div class="rt" data-rt="log"><ol class="log" id="log"></ol></div><div class="rt" data-rt="box"><div id="box"></div></div>
      <div class="rt" data-rt="tac">${sides.map(i => `<div class="trow2"><span class="cgl">Tactic</span>${tacticPicker(m.t[i], i)}</div><div class="trow2"><span class="cgl">Defence</span>${defencePicker(m.t[i], i)}</div>`).join('')}</div></div></aside>
  </section>`;
  audioInit();
  if (R3D) R3D.unbind();
  cv = $('#cv');
  $('#stage').addEventListener('click', e => {
    if (A && A.sceneOn && !e.target.closest('button,.fsbar,.over')) skipScene(); // tap to skip a staged scene
  });
  ctx = cv.getContext('2d');
  fit();
  const disp = {},
    bench = {}; // the bench: display entries kept out of A.disp (nothing draws or animates them) until a 'sub' act swaps one in
  m.t.forEach((t, side) =>
    squadOf(t).forEach(p => {
      const h = home(p, side);
      (t.P.includes(p) ? disp : bench)[p.id] = {
        p,
        side,
        x: h[0],
        z: h[1],
        sx: h[0],
        sz: h[1],
        tx: h[0],
        tz: h[1],
        jy: 0,
        jmode: null,
        pose: 'ready'
      };
    })
  );
  A = {
    m,
    nm,
    fx,
    disp,
    bench,
    beats: null,
    bi: 0,
    el: 0,
    ball: { x: 500, z: 0.5, h: 100, vis: false, follow: null },
    srvId: null,
    ghost: null,
    cheer: [0, 0],
    cheerAll: 0,
    wave: null,
    chant: null,
    pointN: 0,
    link: null,
    cele: null,
    staShown: {},
    coaches: [0, 1].map(side => ({
      side,
      p: FXR.isolate(() => ({ look: mkLook('S'), hair: pick(HAIR), op: false, team: m.t[side] })),
      react: 0,
      type: null
    })),
    trail: [],
    trailPow: 0,
    parts: [],
    labels: [],
    lines: null,
    shake: 0,
    flash: 0,
    flashC: '#fff',
    speed: 1,
    paused: false,
    done: false,
    ptFlash: null
  };
  board(snap(m));
  boxScore();
  showTac(0);
  showTac(1);
  logLine(
    `${a.name} vs ${b.name} — ${nm.round}. One set to ${RULES.pointsToWin}, win by ${RULES.winBy}. Everyone rotates through serve.`,
    'set'
  );
  open3D();
}
/** Load the 3D renderer module and build its world once (the menu starts this in the background). */
let load3DP = null;
function load3D(prog) {
  if (!load3DP)
    load3DP = import(new URL('js/render3d/r3d.mjs', document.baseURI).href).then(mod =>
      mod.init((f, t) => load3D.prog && load3D.prog(f, t))
    );
  load3D.prog = prog || load3D.prog;
  return load3DP;
}
/** Every match is drawn in 3D. Play holds (A.hold) until the players are ready; the world binds on its first frame. */
function open3D() {
  const st = $('#stage'),
    myA = A;
  const ready = api => {
    R3D = api;
    P3D = api.P3D;
    st.classList.add('r3d-on');
    cam3Label();
  };
  if (R3D) return ready(R3D);
  A.hold = true;
  st.insertAdjacentHTML(
    'beforeend',
    `<div class="ld3" id="ld3" role="status"><b>Loading 3D players</b><i><span id="ld3bar"></span></i><small id="ld3txt">Starting</small></div>`
  );
  load3D((f, t) => {
    const b = $('#ld3bar'),
      tx = $('#ld3txt');
    if (b) b.style.width = Math.round(f * 100) + '%';
    if (tx && t) tx.textContent = t;
  })
    .then(api => {
      ready(api);
      if (A === myA) A.hold = false;
      $('#ld3')?.remove();
    })
    .catch(e => {
      console.error(e);
      load3DP = null;
      const l = $('#ld3');
      if (l)
        l.innerHTML = `<b>3D can't run here</b><small>This device or browser has no WebGL, or the players failed to download.</small><span class="trow"><button class="btn" onclick="leaveMatch()">Back</button><a class="btn hot" href="https://claude.ai/artifact/YN2QrdmB61ZFYNwUiYafH7" target="_blank" rel="noopener">Play the classic 2D version</a></span>`;
    });
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
  setLabel('#cam3bar', cam3Text());
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
  const next = { courtside: 'broadcast', broadcast: 'follow', follow: 'pov', pov: 'courtside' };
  R3D.setCamMode(next[R3D.camMode()] || 'courtside');
  cam3Label();
}
/** Fullscreen the court. Falls back to a fixed full-viewport overlay where the Fullscreen API is missing (iPhone). */
function toggleFullscreen() {
  const st = $('#stage');
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
addEventListener('fullscreenchange', () => setTimeout(fit, 60));
addEventListener('webkitfullscreenchange', () => setTimeout(fit, 60));
addEventListener('keydown', e => {
  if (!A || e.target.closest('input,select,textarea,button')) return;
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 'b' || e.key === 'B') railOpen();
  else if (e.key === 'Escape') {
    $('#stage')?.classList.remove('fake-fs');
    railOpen(null);
  } else if (e.key === ' ') {
    e.preventDefault();
    togglePause();
  }
});
/** Size the court canvas (the labels layer) to its CSS size × device pixels; the 3D view picks its own budget (GFX). */
const COURT_PX = 9e6;
function fit() {
  if (!cv) return;
  const w = cv.clientWidth || 800,
    d = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(COURT_PX / (w * w * 0.44)));
  cv.width = Math.round(w * d);
  cv.height = Math.round(w * d * 0.44);
}
addEventListener('resize', fit);
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
    b.textContent = `Timeout ${A.m.t[i].short}${used ? ' (used)' : A.m.toReq[i] ? ' (queued)' : ''}`;
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
  railOpen(A.paused ? A.railTab || 'log' : null); // the rail opens on pause and closes on resume
  setLabel('#pause', A.paused ? 'Resume' : 'Pause');
  setLabel('#fspause', A.paused ? '▶' : '❚❚');
}
/** Simulate the rest of the match at once and show the result. */
function skipMatch() {
  if (!A || A.done) return;
  const m = A.m;
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
  $('#p0').textContent = s.pts[0];
  $('#p1').textContent = s.pts[1];
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
      z.innerHTML = zs.length ? `In the zone: ${zs.map(i => `<b style="color:${zt[i].color}">${esc(zt[i].short)}</b>`).join(' ')}` : '';
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
/** Add a commentary line (plain text; class `c` = 'pt' | 'err' | 'set'). Keeps the newest 80. */
function logLine(t, c) {
  const l = $('#log');
  if (!l) return;
  const li = document.createElement('li');
  li.textContent = t;
  if (c) li.className = c;
  l.prepend(li);
  while (l.children.length > 80) l.lastChild.remove();
  const tk = $('#ticker'); // the last two lines on the court (the newest in ink)
  if (tk)
    tk.innerHTML = [...l.children]
      .slice(0, 2)
      .map((x, i) => `<div class="${i ? 'old' : ''}">${esc(x.textContent)}</div>`)
      .join('');
}
/** The match rail (Commentary · Box score · Tactics): open on a tab, toggle (no tab), or close (null). */
const RAIL_TABS = { log: 'Commentary', box: 'Box score', tac: 'Tactics' };
function railOpen(tab) {
  const r = $('#mrail');
  if (!r || !A) return;
  if (tab === null || (tab === undefined && !r.hidden)) {
    r.hidden = true;
    return;
  }
  A.railTab = tab || A.railTab || 'log';
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
            return `<tr><td>${stag(p)}${esc(p.name)}${p.cap ? ' <span class="capb">C</span>' : ''} <i>${p.role}</i></td><td>${ovr(p)}</td><td>${s.k}</td><td>${s.blk}</td><td>${s.ace}</td><td>${s.dig}</td><td>${s.err}</td><td>${s.top || '–'}</td><td>${faceSVG(p, (A.moodShown || m.mood)[p.id] || 0, 24)}</td><td><span class="sbar"><i style="width:${Math.round(((A.staShown || m.sta)[p.id] ?? 1) * 100)}%"></i></span></td></tr>`;
          })
          .join('')}</tbody></table>`
    )
    .join('');
}
/** Leave the match screen: back to wherever the fixture came from. */
function leaveMatch() {
  const fx = A && A.fx;
  if (A && A.m && !A.m.over) restoreLineups(A.m); // left mid-match: the lineups go back (safe twice)
  if (document.fullscreenElement) document.exitFullscreen?.();
  if (R3D) R3D.unbind();
  A = null;
  fx && fx.onLeave ? fx.onLeave() : navigate('menu');
}
Screens.match = startMatch;
