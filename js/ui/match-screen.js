// Match screen: open a fixture (startMatch → A, the markup, the 3D world), size the court, venue and stakes, leave. Controls and
// HUD: match-controls.js; technique switches: match-tech.js; the result and cut-ins / toasts: match-result.js.

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
  Dir.reset();
  // your side in a career fixture (the squad that holds your player): only it gets Timeout / Tactics; Monster game: both
  const you = fx.onFinish && typeof RUN !== 'undefined' && RUN ? Run.you(RUN) : null,
    mine = you ? ([0, 1].find(i => squadOf(m.t[i]).some(p => p.id === you.id)) ?? null) : null,
    sides = mine == null ? [0, 1] : [mine];
  if (mine != null) m.human = you.id; // your calls (spec §2.13): the rally pauses at your decision points
  // the full-court screen (spec §9.9): the stage fills the screen; the panels below float over it
  $('#app').innerHTML = `<section class="match" id="match">
    <div class="mtop"><div class="board">
      ${boardTeam(a, 0)}
      <div class="bsc"><span id="p0">0</span><span class="colon">:</span><span id="p1">0</span><span class="setn" id="setn">${rulesText()}</span></div>
      ${boardTeam(b, 1)}
    </div>
    <div class="mom"><span class="ml">Momentum</span><div class="mbar" style="--a:${a.color};--b:${b.color}"><i id="momf"></i><em></em></div><span class="zone" id="zone" aria-live="polite"></span></div></div>
    <div class="stage" id="stage"><canvas id="cv" aria-label="Match court"></canvas>
      <div class="fsbar" aria-label="Fullscreen controls"><span class="fss"><i style="--tc:${a.color}"></i>${esc(a.short)} <b id="fs0">0</b> : <b id="fs1">0</b> ${esc(b.short)}<i style="--tc:${b.color}"></i></span>
        <span class="fsb"><button onclick="togglePause()" id="fspause" aria-label="Pause">❚❚</button>${SPEEDS.map(s => `<button onclick="setSpeed(${s})" data-s="${s}" class="fsspd">${s}x</button>`).join('')}<button onclick="toggleFullscreen()" aria-label="Exit fullscreen">✕</button></span></div>
      <div class="cut" id="cut"><div class="cut-band"><div class="cut-lines"></div><span class="cut-face"></span><span class="cut-face cut-face2"></span><span class="cut-num"></span><div class="cut-txt"><div class="cut-move"></div><div class="cut-name"></div><div class="cut-sub"></div></div></div></div>
      <div class="hbanner" id="hbanner" aria-live="polite"></div><div class="hsay" id="hsay" aria-live="polite"></div>
      <div class="toasts" id="toasts" aria-live="polite"></div><div class="ticker" id="ticker" aria-hidden="true"></div><div class="over" id="over" hidden></div></div>
    <div class="controls cbar" role="toolbar" aria-label="Match controls">
      <div class="cg play"><button class="btn" id="pause" onclick="togglePause()">${pauseLabel(false)}</button>
        <div class="seg" role="group" aria-label="Speed">${SPEEDS.map(s => `<button class="btn ${s === 1 ? 'on' : ''}" data-s="${s}" onclick="setSpeed(${s})">${s}×</button>`).join('')}</div>
        <button class="btn" onclick="skipMatch()" ${tip('Skip to the final result')}>Skip ⏭</button></div>
      <div class="cg team">${sides.map(i => timeoutButton(m.t[i], i, sides.length > 1)).join('')}
        <button class="btn" id="tacbtn" onclick="railOpen('tac')">Tactics <kbd>T</kbd></button></div>
      <div class="cg view"><button class="btn" id="railbtn" onclick="railOpen()" ${tip('Box score and tactics')}>Details <kbd>B</kbd></button>
        <button class="btn" onclick="toggleFullscreen()" ${tip('Fullscreen court')} aria-label="Fullscreen">⛶ <kbd>F</kbd></button>
        <button class="btn" id="snd" onclick="toggleSound()" aria-label="Sound">${SND.on ? '🔊' : '🔇'}</button>
        ${fx.vfx ? `<button class="btn" onclick="vfxToggle()" ${tip('Tune every effect live while the game plays; Export the values')}>VFX <kbd>V</kbd></button>` : ''}
        ${pop('⚙', settingsMenu(), 'setpop')}</div>
    </div>
    ${fx.vfx ? '<aside class="panel vfxpanel vfxp" id="vfxp" hidden aria-label="VFX tuning"></aside>' : ''}
    <aside class="mrail" id="mrail" hidden aria-label="Match details"><div class="rhd"><div class="tabs">${Object.entries(RAIL_TABS)
      .map(([k, n]) => `<button class="btn" data-rt="${k}" onclick="railOpen('${k}')">${n}</button>`)
      .join('')}</div><button class="btn x" onclick="railOpen(null)" aria-label="Close">✕</button></div>
      <div class="rbody"><div class="rt" data-rt="box"><div id="box"></div></div>
      <div class="rt" data-rt="tac"><div id="techsw"></div>${sides.map(i => `<div class="trow2"><span class="cgl">Tactic</span>${tacticPicker(m.t[i], i)}</div><div class="trow2"><span class="cgl">Defence</span>${defencePicker(m.t[i], i)}</div>`).join('')}</div></div></aside>
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
    ptFlash: null,
    techPs: techPlayers(m, fx, sides), // technique switches (spec §9.10): whose techniques you control
    techCareer: !!you, // career: your choice is kept on your player (p.techOff) for the next match
    techKeys: [],
    venue: matchVenue(fx), // the 3D set (spec §9.11)
    stakes: matchStakes(fx),
    mySide: mine ?? 0 // your team's side (exhibition: the left team)
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
    api.setBirdSide(myA.mySide); // bird's-eye: your side at the bottom
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
addEventListener('fullscreenchange', () => setTimeout(fit, 60));
addEventListener('webkitfullscreenchange', () => setTimeout(fit, 60));
/** Size the court canvas (the labels layer) to its CSS size × device pixels; the 3D view picks its own budget (GFX). */
const COURT_PX = 9e6;
function fit() {
  if (!cv) return;
  // the full-court screen (spec §9.9): the canvas is the viewport; the overlay's logical height follows its shape (VH)
  const w = cv.clientWidth || 800,
    h = cv.clientHeight || w * 0.44,
    d = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(COURT_PX / (w * h)));
  cv.width = Math.round(w * d);
  cv.height = Math.round(h * d);
  VH = (500 * h) / w;
}
addEventListener('resize', fit);
/* ---------- venue (spec §9.11) ---------- */
/** The venue a match is played at: fx.venue, else the career week's venue (City.venue), else the street; exhibitions: the arena. */
function matchVenue(fx) {
  if (fx.venue) return fx.venue;
  if (!(fx.onFinish && typeof RUN !== 'undefined' && RUN)) return 'arena';
  return City.venue(RUN) || 'street';
}
/** How full the stands are (0–1): the Cup final 1, other Cup rounds .85, evaluations .45, the street .35, exhibitions .9. */
function matchStakes(fx) {
  const v = matchVenue(fx);
  if (!(fx.onFinish && typeof RUN !== 'undefined' && RUN)) return 0.9;
  if (Run.weekType(RUN) === 'cup') return /final/i.test(fx.round || '') && !/semi|quarter/i.test(fx.round || '') ? 1 : 0.85;
  return v === 'street' ? 0.35 : 0.45;
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
