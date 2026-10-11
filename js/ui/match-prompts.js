// The captain's chips in a played match (spec §2.17): between points, when you are your team's captain and the call is ready,
// Fire up (E) / Settle (R) under your feet for a few seconds. (The one-press rally prompts of §2.16 were removed, T-264.)

/** How long the captain's chips stay (ms). */
const PROMPT = { cap: 3000 };
/** The chips layer in the stage (made on first use). */
function promptLayer() {
  let el = $('#prompts');
  if (!el && $('#stage')) {
    el = document.createElement('div');
    el.className = 'prompts';
    el.id = 'prompts';
    $('#stage').appendChild(el);
  }
  return el;
}
/** One key-cap chip. `act` = the onclick call. */
const pchip = (key, label, act, cls = '') =>
  `<button class="pchip ${cls}" onclick="${act}" tabindex="-1"><kbd>${esc(key)}</kbd>${esc(label)}</button>`;
/** Rebuild the chips layer (its position follows in promptStep). */
function promptDraw() {
  const el = promptLayer();
  if (!el) return;
  const cap = A && A.capChip;
  el.innerHTML = cap
    ? `<div class="pgrp" data-at="${esc(String(A.m.human))}">${pchip('E', 'Fire up', "promptPress('E')", cap.stage === 'fever' ? 'off' : '')}${pchip('R', 'Settle', "promptPress('R')")}</div>`
    : '';
  promptStep();
}
/** Screen position (CSS px in the stage) of a court point under a player. */
function promptAt(id, h) {
  const d = A.disp && A.disp[id],
    c = $('#cv');
  if (!d || !c) return null;
  const k = c.clientWidth / 1000,
    q = P(d.x, d.z, h + (d.jy || 0));
  return { x: q.X * k, y: (q.Y - VT) * k };
}
/** Each frame: keep the chips under your player's feet; they go after PROMPT.cap. */
function promptStep() {
  if (!A || !A.m) return;
  if (A.capChip && performance.now() > A.capChip.until) {
    A.capChip = null;
    return promptDraw();
  }
  const el = $('#prompts');
  if (!el) return;
  const W = el.clientWidth,
    H = el.clientHeight;
  for (const g of el.querySelectorAll('[data-at]')) {
    const at = promptAt(g.dataset.at, -8);
    if (!at) continue;
    const hw = g.offsetWidth / 2; // kept on screen: a player at the edge still shows the whole group
    g.style.left = `${Math.round(clamp(at.x, hw + 8, Math.max(hw + 8, W - hw - 8)))}px`;
    g.style.top = `${Math.round(clamp(at.y + 6, 8, Math.max(8, H - g.offsetHeight - 96)))}px`;
  }
}
/** E / R or a chip click: the captain's call. True when used. */
function promptPress(key) {
  if (!A || !A.m || A.done || !A.capChip) return false;
  const K = String(key).toUpperCase();
  if (K !== 'E' && K !== 'R') return false;
  const c = A.capChip,
    kind = K === 'E' ? 'fire' : 'settle';
  if (kind === 'fire' && c.stage === 'fever') return true; // Fire up: any stage but Fever (spec §2.17)
  A.capChip = null;
  const bs = capCall(A.m, c.side, kind) || [];
  if (A.beats) for (const b of bs) A.beats.push({ ...b });
  promptDraw();
  return true;
}
/** Between points: when you are the captain and the call is ready, the two chips for PROMPT.cap (spec §2.17). */
function promptCaptain() {
  const m = A && A.m;
  if (!m || m.human == null || m.over) return;
  const side = [0, 1].find(i => m.t[i].cap && m.t[i].cap.id === m.human);
  if (side == null || capReady(m, side) !== 0) return;
  A.capChip = { side, until: performance.now() + PROMPT.cap, stage: (A.stageShown || [])[side] };
  promptDraw();
}
/** The keyboard: E / R while the captain's chips show. True when the key was used. */
function promptKey(e) {
  if (!A || !A.capChip || e.ctrlKey || e.metaKey || e.altKey) return false;
  return /^[erER]$/.test(e.key) && promptPress(e.key);
}
