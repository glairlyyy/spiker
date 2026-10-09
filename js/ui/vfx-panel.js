// The dev VFX panel (owner 2026-10-06): every tunable effect value (js/data/vfx.js) as a live control — in the Monster and
// Average games (key V, the match keeps playing) and in the VFX lab. Edits apply to the next effect at once and stay in this
// browser; Export (copy, download, or the JSON box) gives the values to bake in as the shipped defaults.

/** One control: a slider with its value, an On/Off segment, or a colour. */
function vfxRow(g, k) {
  const [def, min, max, step, label] = VFX_DEF[g].p[k],
    v = VFX[g][k],
    id = `vfx-${g}-${k}`,
    changed = v !== def ? ' changed' : '';
  if (Array.isArray(min))
    return `<div class="vrow${changed}"><span>${esc(label)}</span><div class="seg">${min
      .map(
        o =>
          `<button class="btn ${v === o ? 'on' : ''}" onclick="vfxSet('${g}','${k}','${o}',true)">${esc(VFX_OPT_NAME[`${g}.${o}`] || VFX_OPT_NAME[o] || o)}</button>`
      )
      .join('')}</div></div>`;
  if (typeof def === 'string')
    return `<label class="vrow${changed}"><span>${esc(label)}</span><input type="color" value="${esc(v)}" oninput="vfxSet('${g}','${k}',this.value)"></label>`;
  if (min === 0 && max === 1 && step === 1)
    return `<div class="vrow${changed}"><span>${esc(label)}</span><div class="seg">${[1, 0]
      .map(o => `<button class="btn ${v === o ? 'on' : ''}" onclick="vfxSet('${g}','${k}',${o},true)">${o ? 'On' : 'Off'}</button>`)
      .join('')}</div></div>`;
  return `<label class="vrow${changed}"><span>${esc(label)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" oninput="vfxSet('${g}','${k}',+this.value)"><b id="${id}">${v}</b></label>`;
}
/** The panel body: export row, the test buttons (in a match), every group. In the Cut-scene lab (A.cineForce) only the
 * cut-scene groups (VFX_DEF lab 'cine'), with the kind and a slow speed; everywhere else every other group. */
function vfxPanel() {
  if (typeof A !== 'undefined' && A && A.animLab) return animPanel(); // the Animation lab (anim-lab.js)
  const inMatch = typeof A !== 'undefined' && A && A.m,
    cine = !!(inMatch && A.cineForce),
    groups = Object.entries(VFX_DEF).filter(([, d]) => (d.lab === 'cine') === cine && (!cine || d.cut === A.cineForce));
  return `<div class="vfxh"><h3>${cine ? 'Cut-scene lab' : 'VFX tuning'}</h3>${inMatch ? '<button class="btn" onclick="vfxToggle()">Close <kbd>V</kbd></button>' : ''}</div>
    ${cine ? cineLabRow() : ''}
    <div class="vexp"><button class="btn" onclick="vfxCopy()">Copy</button><button class="btn" onclick="vfxDownload()">Download</button>
      <label class="btn">Import<input type="file" accept=".json,application/json" hidden onchange="vfxImportFile(this)"></label>
      <button class="btn" onclick="vfxResetAll()">Reset all</button></div>
    <p class="small mute" id="vfxnote">Changed values below (saved in this browser).</p>
    <textarea class="vjson" id="vfxjson" readonly aria-label="Changed values (JSON)" onclick="this.select()">${esc(vfxExport())}</textarea>
    ${
      inMatch && !cine
        ? `<div class="vexp"><span>Test at the ball</span><button class="btn" onclick="vfxTest('air')">Air impact</button><button class="btn" onclick="vfxTest('blast')">Blast</button><button class="btn" onclick="vfxTest('kick')">Spike kick</button><button class="btn" onclick="vfxTest('rumble')">Kill rumble</button></div>`
        : ''
    }
    ${groups
      .map(
        ([g, d]) =>
          `<section class="vgrp"><h4>${esc(d.name)}</h4>${Object.keys(d.p)
            .map(k => vfxRow(g, k))
            .join('')}</section>`
      )
      .join('')}`;
}
/** Cut-scene lab: which cut-scene every rally stages, and the game speed to watch it at. */
function cineLabRow() {
  return `<div class="vexp"><span>Cut-scene</span><div class="seg">${CINE_KINDS.map(c => `<button class="btn ${A.cineForce === c.id ? 'on' : ''}" onclick="cineLabKind('${c.id}')" ${tip(c.tip)}>${esc(c.name)}</button>`).join('')}</div></div>
    <div class="vexp"><span ${tip('Every rally the serve goes to the other team and it rotates: each server in turn, from both ends')}>Force rotate</span><div class="seg">${[1, 0].map(o => `<button class="btn ${!!A.m.devRot === !!o ? 'on' : ''}" onclick="A.m.devRot=${o};vfxRedraw()">${o ? 'On' : 'Off'}</button>`).join('')}</div></div>
    <div class="vexp"><span>Speed</span><div class="seg">${[0.25, 0.5, 1].map(s => `<button class="btn ${A.speed === s ? 'on' : ''}" data-s="${s}" onclick="setSpeed(${s})">${s === 1 ? '1' : s === 0.5 ? '½' : '¼'}×</button>`).join('')}</div></div>`;
}
/** Cut-scene lab: switch the cut-scene (from the next rally). Ace forces every serve to be an ace (m.dev); WS kill plays on every WS kill. */
function cineLabKind(id) {
  A.cineForce = id;
  A.m.dev = id === 'ace' ? 'ace' : null;
  vfxRedraw();
}
/** Display names of choice options. */
const VFX_OPT_NAME = {
  light: 'Light',
  ink: 'Ink',
  streak: 'Streak',
  ribbon: 'Ribbon',
  off: 'Off',
  loose: 'Loose',
  composed: 'Composed',
  focused: 'Focused',
  fever: 'Fever',
  'ring.ink': 'Ink full',
  'ring.partial': 'Ink partial'
};
/** Set one value (live); `redraw`: re-render the panel (segments). Saved to this browser. */
function vfxSet(g, k, v, redraw) {
  VFX[g][k] = v;
  if (g === 'hand' && k === 'style' && TRAIL_STYLES[v]) {
    G.trail = v; // the hand trail style is also the ⚙ Trails setting
    store.set(KEYS.trail, v);
  }
  const out = $(`#vfx-${g}-${k}`);
  if (out) out.textContent = v;
  vfxSave();
  if (redraw) vfxRedraw();
}
function vfxSave() {
  store.set(KEYS.vfx, vfxExport());
  const j = $('#vfxjson');
  if (j) j.value = vfxExport();
}
/** Re-render every open panel (match and lab). */
function vfxRedraw() {
  for (const el of document.querySelectorAll('.vfxpanel')) el.innerHTML = vfxPanel();
}
/** Copy every value as JSON (falls back to selecting the JSON box when the clipboard is blocked). */
function vfxCopy() {
  const txt = vfxExport(true),
    box = $('#vfxjson'),
    done = ok => {
      if (box) {
        box.value = txt;
        if (!ok) box.select();
      }
      const n = $('#vfxnote');
      if (n)
        n.textContent = ok
          ? 'Copied — paste it to bake these in as the defaults.'
          : 'Clipboard blocked: the box below is selected, copy it.';
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
/** Download every value as vfx.json (a data: link — blob URLs can be blocked on the host). */
function vfxDownload() {
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(vfxExport(true));
  a.download = 'vfx.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
/** Load a vfx.json. */
function vfxImportFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  f.text().then(t => {
    try {
      vfxImport(t);
      vfxSave();
      vfxRedraw();
    } catch (e) {
      DBG.log('warn', 'VFX import: not a vfx.json', e);
    }
  });
}
function vfxResetAll() {
  vfxReset();
  G.trail = VFX.hand.style;
  store.set(KEYS.trail, G.trail);
  vfxSave();
  vfxRedraw();
}
/** Fire an effect at the ball now (match), at power 110. */
function vfxTest(kind) {
  const f = R3D && R3D.fx;
  if (!f) return;
  if (kind === 'air') airImpact(110, '#ff7a2e', A.ball.x < 500 ? 1 : -1);
  else if (kind === 'blast') f.blast(110, ECOL.fire);
  else if (kind === 'kick') camKick(110, A.ball.x < 500 ? 1 : -1);
  else if (kind === 'rumble') camRumble(110, true);
}
/** Open / close the panel in a dev match. */
function vfxToggle() {
  const el = $('#vfxp');
  if (!el) return;
  el.hidden = !el.hidden;
  if (!el.hidden) el.innerHTML = vfxPanel();
}
