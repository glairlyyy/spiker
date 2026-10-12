// Animation lab (owner, 2026-10-09; dev): menu › Dev › Animation lab = a Monster game that keeps the last 8 s of every
// player (js/render3d/anim3d.mjs). Clips (owner, 2026-10-12): pick an animation (a soft / firm / hard receive, a knockdown,
// a dive, a set, a spike, a serve, a block, a celebration) and the lab finds a real rally that has it, then plays just that
// moment again and again, the camera on the player (A.clip; clipLoop). Freeze it to scrub that recording frame by frame, play it at ¼–1×, orbit around a player
// (drag the court, wheel to zoom), see where the feet were (foot marks: a sliding foot smears), read the pose values of the
// frame and edit them live; Copy gives that frame's pose as code to bake into js/render3d/poses3d*.mjs. In the VFX panel
// (#vfxp, key V) when A.animLab is on.

/** Torso and whole-body numbers: [key, label, min, max]. */
const ANIM_NUM = [
  ['hp', 'Hips pitch', -1.5, 1.5],
  ['sp', 'Spine pitch', -1.2, 1.2],
  ['cp', 'Chest pitch', -1.2, 1.2],
  ['tw', 'Torso twist', -1.5, 1.5],
  ['sroll', 'Torso roll', -1, 1],
  ['hd', 'Head pitch', -1.2, 1.2],
  ['hy', 'Head yaw', -1.5, 1.5],
  ['hroll', 'Hips roll', -0.8, 0.8],
  ['hyaw', 'Hips yaw', -1.5, 1.5],
  ['lift', 'Lift (m)', -0.5, 1],
  ['shrug', 'Shrug', -0.5, 0.5],
  ['curlL', 'Left fingers curl', 0, 1.2],
  ['curlR', 'Right fingers curl', 0, 1.2]
];
/** Leg fields: [key, label, min, max]. */
const ANIM_LEG = [
  ['a', 'Thigh forward', -1.5, 2.5],
  ['k', 'Knee bend', 0, 2.6],
  ['f', 'Foot pitch', -1.2, 1.2],
  ['s', 'Spread', -0.5, 0.8]
];
const ANIM_SEG = ['Upper arm', 'Forearm', 'Hand'];
const animR = (v, n = 3) => +(+v).toFixed(n);

/**
 * The clips: [id, label, find(beats) → { i: the beat it happens in, p: the player } | null]. Each is looked for in real
 * engine rallies (animClipFind), so it plays exactly as in a match.
 */
const ANIM_CLIPS = [
  ['recvSoft', 'Receive · soft', b => animFindRecv(b, t => t === null)],
  ['recvFirm', 'Receive · firm (jolt)', b => animFindRecv(b, t => t === 'firm')],
  ['recvHard', 'Receive · hard (one knee)', b => animFindRecv(b, t => t === 'hard')],
  ['fall', 'Knockdown (blown off the feet)', b => animFindAct(b, a => a.k === 'pose' && a.pose === 'fall')],
  [
    'dive',
    'Dive (pancake)',
    b =>
      animFindBeat(
        b,
        x => x.acts.some(a => a.k === 'label' && a.t === 'Pancake!'),
        x => x.acts.find(a => a.k === 'pose' && a.pose === 'dive')
      )
  ],
  [
    'set',
    'Set',
    b =>
      animFindBeat(
        b,
        x => x.acts.some(a => a.k === 'ball' && a.to && a.to.c === 'spike'),
        x => x.acts.find(a => a.k === 'pose' && a.pose === 'set')
      )
  ],
  [
    'spike',
    'Spike (approach, jump, hit)',
    b =>
      animFindAct(
        b,
        a => a.k === 'ball' && a.to && a.to.c === 'spike' && !a.to.dh,
        a => a.to.p
      )
  ],
  ['serve', 'Serve', b => animFindAct(b, a => a.k === 'pose' && a.pose === 'serve')],
  ['block', 'Block', b => animFindAct(b, a => a.k === 'pose' && a.pose === 'block')],
  ['cele', 'Point celebration', b => animFindAct(b, a => a.k === 'pose' && a.pose === 'roar')]
];
/** The first beat with an act matching `f` (and its player: who(a), or a.p). */
function animFindAct(beats, f, who = a => a.p) {
  for (let i = 0; i < beats.length; i++) {
    const a = beats[i].acts.find(f);
    if (a) return { i, p: who(a) };
  }
  return null;
}
/** The first beat passing `f` that has the act `act(beat)` (its player is the clip's). */
function animFindBeat(beats, f, act) {
  for (let i = 0; i < beats.length; i++) {
    const a = f(beats[i]) && act(beats[i]);
    if (a) return { i, p: a.p };
  }
  return null;
}
/** A receive (a ball to a bump or a dive) whose tier — by the incoming ball's power, as recvHit plays it — passes `want`. */
function animFindRecv(beats, want) {
  const all = A.m.t.flatMap(t => squadOf(t));
  for (let i = 1; i < beats.length; i++) {
    const a = beats[i].acts.find(x => x.k === 'ball' && x.to && x.to.p && x.to.c === 'bump'),
      p = a && all.find(q => q.id === a.to.p);
    if (!p || beats[i].acts.some(x => x.k === 'pose' && x.pose === 'fall')) continue;
    const k = recvK({ p }, a.trail || 0),
      R = VFX.recv;
    if (want(k >= R.hard ? 'hard' : k >= R.firm ? 'firm' : null)) return { i, p: p.id };
  }
  return null;
}
/**
 * Find a clip: real rallies of a fresh lab match between the same teams (no subs: everyone on court has a body) until one
 * has it; a knockdown is made likely while looking. Returns { beats, i, p } or null.
 */
function animClipFind(id) {
  const c = ANIM_CLIPS.find(x => x[0] === id);
  if (!c) return null;
  const K0 = { ...KNOCK };
  if (id === 'fall') Object.assign(KNOCK, { gap: -200, max: 1, from: 0 });
  let m = null,
    found = null;
  try {
    for (let n = 0; n < 300 && !found; n++) {
      if (!m || m.over) {
        if (m) restoreLineups(m);
        m = newMatch(A.m.t[0], A.m.t[1], true, { plan: A.m.plan });
        m.subs = [SUB.max, SUB.max];
      }
      const beats = playRally(m).beats,
        f = c[2](beats);
      if (f) found = { beats, ...f };
    }
  } finally {
    Object.assign(KNOCK, K0);
    if (m) restoreLineups(m);
  }
  return found;
}
/** Play a clip (id), or back to the live game (null). */
function animClip(id) {
  const L = A.animLab;
  if (!id) return animClipOff();
  const f = animClipFind(id);
  if (!f) {
    L.clipMsg = 'Not found in 300 rallies — try again.';
    return vfxRedraw();
  }
  const start = Math.max(0, f.i - (id === 'spike' ? 2 : 1));
  let end = Math.min(f.beats.length, f.i + 4);
  if (id !== 'cele') for (let j = f.i; j < end; j++) if (f.beats[j].acts.some(a => a.k === 'point')) end = j; // stop before the point
  if (id === 'fall') {
    // to the get-up (the engine's getup act, a few beats on), still before the point
    const up = f.beats.findIndex((b, j) => j > f.i && b.acts.some(a => a.k === 'getup' && a.p === f.p));
    if (up > 0 && up < f.i + 12 && !f.beats.slice(f.i, up + 1).some(b => b.acts.some(a => a.k === 'point'))) end = up + 1;
  }
  if (id === 'cele') end = f.i + 1; // the point itself: the celebration plays out in the hold
  end = Math.max(end, f.i + 1);
  // play the rally up to the clip at once (silent, nothing drawn), then keep that moment's state to come back to
  A.clip = null;
  A.beats = f.beats.map(b => ({ ...b, acts: b.acts.map(a => ({ ...a })) }));
  A.bi = 0;
  const on = SND.on;
  SND.on = false;
  try {
    for (let g = 0; g < 4000 && A.bi < start; g++) step(32);
  } finally {
    SND.on = on;
  }
  A.clip = {
    id,
    // a beat to hold the end (a celebration, getting up: longer), then again
    beats: JSON.stringify(
      f.beats
        .slice(start, end)
        .concat([{ dur: id === 'cele' || id === 'fall' ? 2600 : 700, acts: id === 'fall' ? [{ k: 'getup', p: f.p }] : [] }])
    ),
    snap: animSnap()
  };
  L.sel = f.p;
  L.clipMsg = null;
  L.over = null;
  if (R3D && R3D.anim) R3D.anim.clear();
  const cv = document.getElementById('cv');
  if (cv) cv.style.visibility = 'hidden'; // the 2D overlay is drawn for the game camera
  clipLoop();
  vfxRedraw();
}
/** The display state at the clip's start: every player (not the body link), the ball, the last touch. */
function animSnap() {
  const disp = {};
  for (const id in A.disp) {
    const rest = { ...A.disp[id] };
    delete rest.p; // (the player: kept on the live object)
    disp[id] = JSON.parse(JSON.stringify(rest));
  }
  return {
    disp,
    ball: JSON.parse(JSON.stringify(A.ball)),
    misc: { lastP: A.lastP, lastC: A.lastC, trailPow: A.trailPow, inFrom: A.inFrom, dribble: A.dribble, wob: A.wob, trailEl: A.trailEl }
  };
}
/** The clip from the top: the state back as it was (the same objects — the 3D bodies hold them), fresh beats. */
function clipLoop() {
  const C = A.clip,
    S = C.snap;
  for (const id in S.disp) {
    const d = A.disp[id];
    if (!d) continue;
    for (const k of Object.keys(d)) if (k !== 'p') delete d[k];
    Object.assign(d, JSON.parse(JSON.stringify(S.disp[id])));
  }
  Object.assign(A.ball, JSON.parse(JSON.stringify(S.ball)));
  Object.assign(A, S.misc);
  A.handTouch = null;
  A.labels = [];
  A.parts = [];
  A.beats = JSON.parse(C.beats);
  A.bi = 0;
  A.el = 0;
}
/** Back to the live game (the next rally of the lab match). */
function animClipOff() {
  A.clip = null;
  A.beats = [];
  A.bi = 0;
  const cv = document.getElementById('cv');
  if (cv) cv.style.visibility = '';
  if (R3D && R3D.anim && R3D.anim.unfollow) R3D.anim.unfollow();
  vfxRedraw();
}
/** Start the lab: a Monster game with recording on (menu › Dev). */
function startAnimLab() {
  startMonster({ anim: true });
}
/** The lab's state on the match (match-screen startMatch): the selected player, speed, foot marks. */
function animLabInit(m) {
  return { sel: m.t[0].P[0].id, speed: 0.5, marks: true, i: 0, replay: false, over: null, playing: false };
}
const animApi = () => (typeof R3D !== 'undefined' && R3D && R3D.anim) || null;
/** The panel body (vfxPanel hands over when A.animLab is on). */
function animPanel() {
  const L = A.animLab,
    api = animApi(),
    players = A.m.t.flatMap((t, s) => t.P.map(p => ({ p, s }))),
    inf = api && L.replay ? api.info(L.i) : null;
  return `<div class="vfxh"><h3>Animation lab</h3><button class="btn" onclick="vfxToggle()">Close <kbd>V</kbd></button></div>
    <label class="vrow"><span>Player</span><select onchange="animSel(this.value)" aria-label="Player">${players
      .map(
        ({ p, s }) =>
          `<option value="${esc(p.id)}" ${p.id === L.sel ? 'selected' : ''}>${s ? 'Right' : 'Left'} · ${esc(p.role)} · ${esc(p.name)}</option>`
      )
      .join('')}</select></label>
    <label class="vrow"><span>Clip</span><select onchange="animClip(this.value)" aria-label="Clip"><option value="">Live game</option>${ANIM_CLIPS.map(
      ([id, label]) => `<option value="${id}" ${A.clip && A.clip.id === id ? 'selected' : ''}>${esc(label)}</option>`
    ).join('')}</select></label>
    ${
      A.clip
        ? `<div class="vexp"><button class="btn" onclick="animClip(A.clip.id)">Another one</button><div class="seg">${[0.25, 0.5, 1]
            .map(
              s =>
                `<button class="btn ${A.speed === s ? 'on' : ''}" onclick="A.speed=${s};vfxRedraw()">${s === 1 ? '1' : s === 0.5 ? '½' : '¼'}×</button>`
            )
            .join('')}</div></div>`
        : ''
    }
    ${L.clipMsg ? `<p class="small mute">${esc(L.clipMsg)}</p>` : ''}
    <div class="vexp">${
      L.replay
        ? `<button class="btn hot" onclick="animFreezeUI(false)">Back to the game</button>`
        : `<button class="btn hot" onclick="animFreezeUI(true)" ${tip('Pause and play back the last 8 s of every player')}>Freeze · scrub the last 8 s</button>`
    }</div>
    ${L.replay && inf ? animScrubber(L, inf) + animEditor(L, inf) : `<p class="small mute">${A.clip ? 'The clip plays again and again, the camera on the player: drag the court to orbit, wheel to zoom. Freeze to scrub it.' : 'The game records every player while it plays. Freeze to scrub it; drag the court to orbit, wheel to zoom.'}</p>`}`;
}
/** Timeline, play / step, speed, foot marks, and the frame's display state. */
function animScrubber(L, inf) {
  const i = Math.min(L.i, inf.n - 1),
    st = inf.info || {},
    show = Object.entries(st)
      .filter(([, v]) => v != null && v !== false)
      .map(([k, v]) => `${k} ${typeof v === 'number' ? Math.round(v) : esc(String(v))}`)
      .join(' · ');
  return `<label class="vrow"><span>Frame</span><input id="animT" type="range" min="0" max="${Math.max(0, inf.n - 1)}" value="${i}" oninput="animSeek(+this.value)"><b id="animMs">${inf.ms} ms</b></label>
    <div class="vexp"><button class="btn" onclick="animStep(-1)" aria-label="Previous frame">◀</button><button class="btn" id="animPlay" onclick="animPlayUI()">${L.playing ? '❚❚ Pause' : '▶ Play'}</button><button class="btn" onclick="animStep(1)" aria-label="Next frame">▶</button>
      <div class="seg">${[0.25, 0.5, 1].map(s => `<button class="btn ${L.speed === s ? 'on' : ''}" onclick="A.animLab.speed=${s};vfxRedraw()">${s === 1 ? '1' : s === 0.5 ? '½' : '¼'}×</button>`).join('')}</div>
      <button class="btn ${L.marks ? 'on' : ''}" onclick="A.animLab.marks=!A.animLab.marks;vfxRedraw()" ${tip('Every recorded foot position (left blue, right pink): a planted foot is one dot, a sliding one a smear')}>Foot marks</button></div>
    <p class="small mute" id="animInfo">${show || '—'}</p>`;
}
/** The pose values of the frame (or the edit), as sliders; Copy / Reset. */
function animEditor(L, inf) {
  const p = L.over || inf.pose;
  if (!p) return '<p class="small mute">No pose recorded for this player in this frame.</p>';
  const row = (path, label, v, min, max, step = 0.01) =>
    `<label class="vrow${L.over && animChanged(path, inf.pose) ? ' changed' : ''}"><span>${esc(label)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" oninput="animEdit('${path}', +this.value)"><b data-ap="${path}">${animR(v, 2)}</b></label>`;
  const legs = ['L', 'R']
    .map(
      s =>
        `<h4>${s === 'L' ? 'Left' : 'Right'} leg</h4>${ANIM_LEG.map(([k, n, a, b]) => row(`${s}.${k}`, n, (p[s] || {})[k] ?? 0, a, b)).join('')}`
    )
    .join('');
  const arms = ['al', 'ar']
    .map(s => {
      const arm = p[s] || (s === 'ar' && p.al ? animMirror(p.al) : null);
      if (!arm) return '';
      return `<h4>${s === 'al' ? 'Left' : 'Right'} arm</h4>${ANIM_SEG.map((n, i) => {
        const [az, el] = animAngles(arm[i] || arm[1]);
        return row(`${s}.${i}.az`, `${n} ↔`, az, -3.14, 3.14) + row(`${s}.${i}.el`, `${n} ↕`, el, -1.57, 1.57);
      }).join('')}${row(`${s}.3`, 'Upper twist', arm[3] || 0, -3.14, 3.14)}${row(`${s}.4`, 'Forearm twist', arm[4] || 0, -3.14, 3.14)}`;
    })
    .join('');
  return `<div class="vexp"><button class="btn" onclick="animCopy()">Copy pose</button><button class="btn" onclick="animResetFrame()">Reset frame</button></div>
    <p class="small mute" id="animNote">${L.over ? 'Edited (shown on this frame only). Copy it to bake it in.' : 'Drag a value to edit this frame.'}</p>
    <section class="vgrp"><h4>Body</h4>${ANIM_NUM.map(([k, n, a, b]) => row(k, n, p[k] ?? (k.startsWith('curl') ? (p.curl ?? 0.35) : 0), a, b)).join('')}</section>
    <section class="vgrp">${legs}</section>
    <section class="vgrp">${arms}</section>`;
}
/** A direction vector (torso space: +x the player's left, +y up, +z forward) → [azimuth, elevation]. */
function animAngles(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return [Math.atan2(v.x, v.z), Math.asin(Math.max(-1, Math.min(1, v.y / l)))];
}
const animMirror = arm => arm.map((v, i) => (i < 3 ? new v.constructor(-v.x, v.y, v.z) : -(v || 0)));
/** Was this value changed from the recorded frame? */
function animChanged(path, base) {
  return Math.abs(animGet(path, L0(base)) - animGet(path, A.animLab.over)) > 1e-4;
}
const L0 = p => p || {};
function animGet(path, p) {
  const [a, b, c] = path.split('.');
  if (!b) return p[a] ?? 0;
  if (a === 'L' || a === 'R') return (p[a] || {})[b] ?? 0;
  const arm = p[a] || (a === 'ar' && p.al ? animMirror(p.al) : null);
  if (!arm) return 0;
  if (!c) return arm[+b] || 0;
  const [az, el] = animAngles(arm[+b] || arm[1]);
  return c === 'az' ? az : el;
}
/** One edit: copy the frame's pose on the first one, set the value, show it. */
function animEdit(path, v) {
  const L = A.animLab,
    api = animApi();
  if (!L.over) {
    const base = api.info(L.i).pose;
    if (!base) return;
    L.over = base;
    if (!L.over.ar && L.over.al) L.over.ar = animMirror(L.over.al);
  }
  const p = L.over,
    [a, b, c] = path.split('.');
  if (!b) p[a] = v;
  else if (a === 'L' || a === 'R') p[a] = { ...p[a], [b]: v };
  else if (!c) p[a][+b] = v;
  else {
    const seg = p[a][+b] || p[a][1],
      [az, el] = animAngles(seg),
      AZ = c === 'az' ? v : az,
      EL = c === 'el' ? v : el;
    p[a][+b] = new seg.constructor(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
  }
  const out = document.querySelector(`[data-ap="${path}"]`);
  if (out) out.textContent = animR(v, 2);
  const n = $('#animNote');
  if (n) n.textContent = 'Edited (shown on this frame only). Copy it to bake it in.';
}
function animResetFrame() {
  A.animLab.over = null;
  vfxRedraw();
}
function animSel(id) {
  A.animLab.sel = id;
  A.animLab.over = null;
  vfxRedraw();
}
function animFreezeUI(on) {
  const api = animApi();
  if (!api) return;
  if (on && !A.paused) togglePause();
  api.freeze(on);
  A.animLab.onFrame = animTick;
  if (!on && A.paused) togglePause();
  vfxRedraw();
}
function animSeek(i) {
  const L = A.animLab;
  L.i = i;
  L.ms = null;
  L.over = null;
  vfxRedraw();
}
function animStep(d) {
  const api = animApi(),
    n = api ? api.info(0).n : 0;
  animSeek(Math.max(0, Math.min(n - 1, A.animLab.i + d)));
}
function animPlayUI() {
  const L = A.animLab;
  L.playing = !L.playing;
  L.over = null;
  L.ms = null;
  vfxRedraw();
}
/** While playing: move the timeline and the readout (the editor redraws when it stops). */
function animTick() {
  const L = A.animLab,
    inf = animApi().info(L.i),
    t = $('#animT'),
    ms = $('#animMs'),
    info = $('#animInfo');
  if (t) t.value = L.i;
  if (ms) ms.textContent = `${inf.ms} ms`;
  if (info && inf.info)
    info.textContent = Object.entries(inf.info)
      .filter(([, v]) => v != null && v !== false)
      .map(([k, v]) => `${k} ${typeof v === 'number' ? Math.round(v) : v}`)
      .join(' · ');
}
/** The frame's pose (or the edit) as code, for js/render3d/poses3d*.mjs. */
function animCode() {
  const L = A.animLab,
    inf = animApi().info(L.i),
    p = L.over || inf.pose;
  if (!p) return '';
  const n = v => animR(v),
    V3 = v => `V(${n(v.x)}, ${n(v.y)}, ${n(v.z)})`,
    leg = l => `leg(${n(l.a)}, ${n(l.k)}, ${n(l.f || 0)}, ${n(l.s ?? 0.08)}${l.ss != null ? `, ${n(l.ss)}` : ''})`,
    arm = a => `[${a.slice(0, 3).map(V3).join(', ')}${a[3] || a[4] ? `, ${n(a[3] || 0)}, ${n(a[4] || 0)}` : ''}]`,
    parts = [];
  for (const [k] of ANIM_NUM) if (p[k] != null && typeof p[k] === 'number') parts.push(`${k}: ${n(p[k])}`);
  for (const k of ['curl', 'fsplit', 'contact']) if (typeof p[k] === 'number') parts.push(`${k}: ${n(p[k])}`);
  if (p.L) parts.push(`L: ${leg(p.L)}`);
  if (p.R) parts.push(`R: ${leg(p.R)}`);
  if (p.al) parts.push(`al: ${arm(p.al)}`);
  if (p.ar) parts.push(`ar: ${arm(p.ar)}`);
  const pl = A.m.t.flatMap(t => t.P).find(q => q.id === L.sel),
    st = inf.info || {};
  return `// ${st.pose || '?'} · ${pl ? `${pl.role} ${pl.name}` : L.sel} · frame ${L.i} (${inf.ms} ms) · ${Object.entries(st)
    .filter(([k, v]) => k !== 'pose' && v != null && v !== false)
    .map(([k, v]) => `${k} ${typeof v === 'number' ? Math.round(v) : v}`)
    .join(', ')}${L.over ? ' · edited' : ''}\n{ ${parts.join(', ')} }`;
}
/** Copy the pose code (falls back to a selected box when the clipboard is blocked). */
function animCopy() {
  const txt = animCode(),
    n = $('#animNote'),
    done = ok => {
      if (n) n.textContent = ok ? 'Copied — paste it to bake this frame in.' : 'Clipboard blocked: copy it from the box below.';
      if (!ok && n) n.insertAdjacentHTML('afterend', `<textarea class="vjson" readonly onclick="this.select()">${esc(txt)}</textarea>`);
    };
  try {
    navigator.clipboard.writeText(txt).then(
      () => done(true),
      () => done(false)
    );
  } catch (e) {
    done(false);
  }
}
/** Orbit while frozen: drag the court, wheel to zoom (match-screen wires these to #stage). */
function animPointer(e) {
  const L = A && A.animLab;
  if (!L || !(L.replay || A.clip)) return; // (orbit while frozen, or while a clip plays)
  const api = animApi();
  if (e.type === 'pointerdown') {
    L.drag = { x: e.clientX, y: e.clientY };
    e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId);
  } else if (e.type === 'pointermove' && L.drag) {
    api.orbit(e.clientX - L.drag.x, e.clientY - L.drag.y, 0);
    L.drag = { x: e.clientX, y: e.clientY };
  } else if (e.type === 'pointerup' || e.type === 'pointercancel') L.drag = null;
  else if (e.type === 'wheel') {
    api.orbit(0, 0, e.deltaY);
    e.preventDefault();
  }
}
