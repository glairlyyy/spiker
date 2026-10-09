// Animation lab (owner, 2026-10-09; dev): menu › Dev › Animation lab = a Monster game that keeps the last 8 s of every
// player (js/render3d/anim3d.mjs). Freeze it to scrub that recording frame by frame, play it at ¼–1×, orbit around a player
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
    <div class="vexp">${
      L.replay
        ? `<button class="btn hot" onclick="animFreezeUI(false)">Back to the game</button>`
        : `<button class="btn hot" onclick="animFreezeUI(true)" ${tip('Pause and play back the last 8 s of every player')}>Freeze · scrub the last 8 s</button>`
    }</div>
    ${L.replay && inf ? animScrubber(L, inf) + animEditor(L, inf) : `<p class="small mute">The game records every player while it plays. Freeze to scrub it; drag the court to orbit, wheel to zoom.</p>`}`;
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
  if (!L || !L.replay) return;
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
