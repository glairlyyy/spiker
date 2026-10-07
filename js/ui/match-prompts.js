// One-press prompts in a played match (spec §2.16, §2.17): Call / Fake / Block under your player's feet, the setter's
// hitter markers and Dump, the captain's Fire up / Settle. Answers the engine's decision points (playRallyGen): the beats
// queued before a decision keep playing while its prompt shows (the window); when they run out the rally resumes with the
// press (an option id) or null (no press = the AI's play). No pause, no slow-down, no odds. ⚙ Prompts: On / Off.

/** Decision kinds the prompts answer (the rest are answered with the AI's pick at once). */
const PROMPT_KINDS = new Set(['call', 'block', 'setter']);
/** Prompt timings and thresholds (ms; read meter 0–100). */
const PROMPT = { cap: 3000, auto: 80 }; // auto: no Block press by the AI's take-off + this (ms): the AI jumps you
G.prompts = store.get(KEYS.prompts) === 'off' ? 'off' : 'on';
/** Should this decision point be shown? (yours, a prompt kind, Prompts On) */
function promptWanted(q) {
  return !!(q && G.prompts !== 'off' && PROMPT_KINDS.has(q.kind) && q.p && A && q.p.id === A.m.human && (q.options || []).length);
}
/** Open a prompt for decision `q` (rallyPull). */
function promptOpen(q) {
  A.ask = { q, pressed: undefined, win: promptLeft() };
  promptDraw();
}
/** Playback time left in the queued beats (ms of beat time): the prompt's window. */
function promptLeft() {
  let t = 0;
  for (let i = A.bi; i < (A.beats || []).length; i++) t += Math.max(0, (A.beats[i].dur || 0) - (i === A.bi && A.beats[i]._s ? A.el : 0));
  return t;
}
/** The window ended (the queued beats ran out): the press or null for the engine; the prompt goes. */
function promptClose() {
  const pk = A && A.ask ? (A.ask.pressed ?? null) : null;
  if (A) A.ask = null;
  promptDraw();
  return pk;
}
/** The prompts layer in the stage (made on first use). */
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
const pchip = (key, label, act, cls = '', extra = '') =>
  `<button class="pchip ${cls}" onclick="${act}" tabindex="-1"><kbd>${esc(key)}</kbd>${esc(label)}${extra}</button>`;
/** Rebuild the prompts layer for the current state (positions follow in promptStep). */
function promptDraw() {
  const el = promptLayer();
  if (!el) return;
  const a = A && A.ask,
    cap = A && A.capChip,
    out = [];
  if (a) {
    const q = a.q,
      locked = a.pressed !== undefined;
    for (const o of q.options) {
      const on = (a.lit ?? a.pressed) === o.id,
        cls = `${on ? 'on' : locked ? 'off' : ''}`,
        act = `promptPress('${esc(String(o.key))}')`;
      if (q.kind === 'setter' && o.id !== 'dump')
        out.push(
          pchip(
            o.key,
            o.label || '',
            act,
            `mark ${cls}`,
            `<span class="pblk">${'▮'.repeat(o.blocks || 0) || '—'}</span>${o.mine ? '<span class="pmine">Mine!</span>' : ''}`
          ).replace('class="pchip', `data-at="${esc(String(o.p ?? o.id))}" class="pchip`)
        );
    }
    const feet = q.options.filter(o => q.kind !== 'setter' || o.id === 'dump');
    if (feet.length)
      out.push(
        `<div class="pgrp" data-at="${esc(String(q.p.id))}">${feet.map(o => pchip(o.key, o.label, `promptPress('${esc(String(o.key))}')`, (a.lit ?? a.pressed) === o.id ? 'on' : locked ? 'off' : '')).join('')}</div>`
      );
  } else if (cap)
    out.push(
      `<div class="pgrp" data-at="${esc(String(A.m.human))}">${pchip('E', 'Fire up', "promptPress('E')", cap.stage === 'fever' ? 'off' : '')}${pchip('R', 'Settle', "promptPress('R')")}</div>`
    );
  el.innerHTML = out.join('');
  promptStep();
}
/** Screen position (CSS px in the stage) of a court point under / over a player. */
function promptAt(id, h) {
  const d = A.disp && A.disp[id],
    c = $('#cv');
  if (!d || !c) return null;
  const k = c.clientWidth / 1000,
    q = P(d.x, d.z, h + (d.jy || 0));
  return { x: q.X * k, y: (q.Y - VT) * k };
}
/** Each frame: keep the chips under your player's feet (markers over the hitters), time the captain's chips. */
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
    const mark = g.classList.contains('mark'),
      at = promptAt(g.dataset.at, mark ? 150 : -8);
    if (!at) continue;
    const hw = g.offsetWidth / 2; // kept on screen: a player at the edge still shows the whole prompt
    g.style.left = `${Math.round(clamp(at.x, hw + 8, Math.max(hw + 8, W - hw - 8)))}px`;
    g.style.top = `${Math.round(clamp(at.y + (mark ? 0 : 6), 8, Math.max(8, H - g.offsetHeight - 96)))}px`;
  }
}
/** A key (E / R / 1–3) or a chip click: answer the open prompt once (lit and locked), or make the captain's call. */
function promptPress(key) {
  if (!A || !A.m || A.done) return false;
  const K = String(key).toUpperCase();
  if (A.ask) {
    const o = A.ask.q.options.find(x => String(x.key).toUpperCase() === K);
    if (!o) return false;
    if (A.ask.pressed === undefined && !A.ask.auto) {
      // Block is timing (spec §2.16): you jump now; the engine grades how long before their contact you left the floor
      A.ask.pressed = o.id === 'block' && A.ask.q.kind === 'block' ? { id: 'block', t: blockLeft() } : o.id;
      A.ask.lit = o.id;
      if (A.ask.q.kind === 'block') blockJump(A.ask.q);
      promptDraw();
    }
    return true;
  }
  if (A.capChip && (K === 'E' || K === 'R')) {
    const c = A.capChip,
      kind = K === 'E' ? 'fire' : 'settle';
    if (kind === 'fire' && c.stage === 'fever') return true; // Fire up: any stage but Fever (spec §2.17)
    A.capChip = null;
    const bs = capCall(A.m, c.side, kind) || [];
    if (A.beats) for (const b of bs) A.beats.push({ ...b });
    promptDraw();
    return true;
  }
  return false;
}
/** Between points: when you are the captain and the call is ready, the two chips for 3 s (spec §2.17). */
function promptCaptain() {
  const m = A && A.m;
  if (!m || m.human == null || G.prompts === 'off' || m.over) return;
  const side = [0, 1].find(i => m.t[i].cap && m.t[i].cap.id === m.human);
  if (side == null || capReady(m, side) !== 0) return;
  A.capChip = { side, until: performance.now() + PROMPT.cap, stage: (A.stageShown || [])[side] };
  promptDraw();
}
/** The keyboard: E / R / 1–3 while a prompt or the captain's chips show. True when the key was used. */
function promptKey(e) {
  if (!A || !(A.ask || A.capChip) || e.ctrlKey || e.metaKey || e.altKey) return false;
  return /^[erER1-3]$/.test(e.key) && promptPress(e.key);
}

/** Beat time (ms) from now to their hitter's contact: the end of the set beat that carries your prompted jump act. */
function blockLeft() {
  let t = 0;
  for (let i = A.bi; i < (A.beats || []).length; i++) {
    const b = A.beats[i];
    t += Math.max(0, (b.dur || 0) - (i === A.bi && b._s ? A.el : 0));
    if (b.acts.some(a => a.k === 'jump' && a.prompt === 'block')) return t;
  }
  return promptLeft();
}
/**
 * Your block jump, now (a press, or the AI's when you let it pass): you rise over the AI blocker's own take-off time
 * (q.ideal) and fall from the top — press on time and your hands are highest at their contact. Playback drives it (ownJumps).
 */
function blockJump(q) {
  const d = A.disp[q.p.id];
  if (!d) return;
  startPose(d, 'block', false, 600);
  d.jmode = null;
  d.fallMs = null;
  d.landMs = null;
  d.ownJ = { t: 0, up: Math.max(120, q.ideal || 320), peak: jumpPx(q.p) * 0.85 };
}
/** The AI's jump for you when the press didn't come (its take-off + PROMPT.auto): you go up, the engine plays its own block. */
function blockAuto(b, t) {
  const a = A.ask;
  if (!a || a.q.kind !== 'block' || a.pressed !== undefined || a.auto) return;
  const act = b.acts.find(x => x.k === 'jump' && x.prompt === 'block');
  if (!act || t * b.dur < (act.t0 || 0) * b.dur + PROMPT.auto) return;
  a.auto = true; // a press now is too late: the AI's block stands
  blockJump(a.q);
  promptDraw();
}
