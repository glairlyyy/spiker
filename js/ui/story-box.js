// The dialogue box (spec §10.10): the classic RPG message window over the hub — name plate, portrait, typed text,
// choices, a log — plus the scene's presentation mode (dark cold open, letterbox bars). Renders Story.step(run) and
// calls Story.next; the rules live in js/career/story.js. Mounted by renderCareer while a scene plays.

const SB = { typing: 0, full: '', shown: 0, log: false, skip: false, wait: null }; // box UI state
const SB_CPS = 60; // characters per second while typing

/** The box markup for the current step ('' when no scene plays). */
function storyBox(run) {
  const s = Story.step(run);
  if (!s) return '';
  const cur = run.story.cur,
    mode = cur.mode || {},
    layer = `<div class="sbox-layer ${mode.dark ? 'dark' : ''} ${mode.bars ? 'bars' : ''}" id="sbox" onclick="sbClick(event)">`;
  if (s.k === 'walk' || s.k === 'wait' || s.k === 'cam') return `${layer}</div>`; // the camera / the walk has the screen
  if (s.k === 'title')
    return `${layer}<div class="sb-title" role="status">${esc(s.text)}</div><span class="sb-keys sb-keys-t"><kbd>Space</kbd> next</span></div>`;
  const W = s.k === 'say' ? Story.who(run, s.who) : { name: Run.you(run).name, kind: 'you', person: Run.you(run) },
    face = W.person ? `<span class="sb-face">${faceSVG(W.person, 0, 72)}</span>` : '',
    text = s.k === 'say' ? Story.text(run, s.text) : '',
    opts =
      s.k === 'choice'
        ? `<ol class="sb-opts">${s.opts.map((o, i) => `<li><button class="btn" onclick="event.stopPropagation();sbPick(${i})"><kbd>${i + 1}</kbd> ${esc(o.text)}</button></li>`).join('')}</ol>`
        : '';
  return `${layer}<div class="sbox ${W.kind}" role="dialog" aria-live="polite">${face}<div class="sb-body">${
    W.name ? `<b class="sb-name">${esc(W.name)}</b>` : ''
  }<p class="sb-text" id="sbtext" data-full="${esc(text)}"></p>${opts}${
    SB.skip
      ? `<div class="sb-skip">Skip this scene? <button class="btn hot" onclick="event.stopPropagation();sbSkip(true)">Skip <kbd>Enter</kbd></button><button class="btn" onclick="event.stopPropagation();sbSkip(false)">Keep watching <kbd>Esc</kbd></button></div>`
      : ''
  }</div><span class="sb-keys"><kbd>Space</kbd> next · <kbd>L</kbd> log · <kbd>Esc</kbd> skip</span><i class="sb-more" id="sbmore" aria-hidden="true">▼</i></div>${
    SB.log ? sbLog(run) : ''
  }</div>`;
}
function sbLog(run) {
  return `<div class="sb-log" onclick="event.stopPropagation()"><div class="lab">Log</div><ol>${run.story.cur.log
    .map(([w, t]) => {
      const W = Story.who(run, w);
      return `<li class="${W.kind}">${W.name ? `<b>${esc(W.name)}</b> ` : ''}${esc(t)}</li>`;
    })
    .join('')}</ol><button class="btn" onclick="SB.log=false;renderCareer()">Close <kbd>L</kbd></button></div>`;
}
/** After renderCareer drew the box: type the line out, or run a camera / walk / wait step. */
function storyMounted(run) {
  const s = Story.step(run);
  cancelAnimationFrame(SB.typing);
  clearInterval(SB.wait);
  if (!s) return;
  if (s.k === 'cam') {
    // onto you · a place's pin (Kaede pointing) · the whole island (the fence lifts)
    if (s.to === 'island') MapView.overview();
    else if (s.to && s.to !== 'you') MapView.select(s.to);
    else MapView.centre();
    SB.wait = setTimeout(() => sbAdvance(), s.to === 'island' ? 1500 : 1100);
    return;
  }
  if (s.k === 'wait') {
    SB.wait = setTimeout(() => sbAdvance(), s.ms || 800);
    return;
  }
  if (s.k === 'walk') {
    const t0 = Date.now(); // the map walks you there (MapView.update gave it the new position); go on when you arrive
    SB.wait = setInterval(() => {
      const t = Date.now() - t0;
      if (t > 400 && (!MapView.busy() || t > 20000)) {
        clearInterval(SB.wait);
        sbAdvance();
      }
    }, 120);
    return;
  }
  const el = $('#sbtext');
  if (!el) return;
  SB.full = el.dataset.full || '';
  SB.shown = 0;
  const t0 = performance.now(),
    more = $('#sbmore'),
    tick = now => {
      SB.shown = Math.min(SB.full.length, Math.floor(((now - t0) / 1000) * SB_CPS));
      el.textContent = SB.full.slice(0, SB.shown);
      if (SB.shown < SB.full.length) SB.typing = requestAnimationFrame(tick);
      else if (more) more.classList.add('on');
    };
  if (more) more.classList.remove('on');
  SB.typing = requestAnimationFrame(tick);
}
/** Finish the line if it is still typing; otherwise go on. */
function sbNext() {
  const s = Story.step(RUN);
  if (!s || s.k === 'choice' || SB.skip || SB.log) return;
  if (s.k === 'say' && SB.shown < SB.full.length) {
    cancelAnimationFrame(SB.typing);
    SB.shown = SB.full.length;
    const el = $('#sbtext');
    if (el) el.textContent = SB.full;
    $('#sbmore')?.classList.add('on');
    return;
  }
  if (s.k === 'say' || s.k === 'title') sbAdvance();
}
function sbClick(e) {
  if (e.target.closest('button')) return;
  sbNext();
}
function sbPick(i) {
  sbAdvance(i);
}
function sbAdvance(pick) {
  const id = RUN.story.cur && RUN.story.cur.id;
  Story.next(RUN, pick);
  sbAfter(id);
  Run.save(RUN);
  renderCareer();
}
/** When scene `id` has just ended: open the place it points at (`after.spot`), if any. */
function sbAfter(id) {
  const A = id && !RUN.story.cur && SCENES[id] && SCENES[id].after;
  if (A && A.spot) CW.spot = A.spot;
}
function sbSkip(yes) {
  SB.skip = false;
  if (yes) {
    const id = RUN.story.cur && RUN.story.cur.id;
    Story.skip(RUN);
    sbAfter(id);
    Run.save(RUN);
  }
  renderCareer();
}
/** Keys while a scene plays (the hub's own keys are off): Space / Enter next, 1–4 choices, L log, Esc skip. */
document.addEventListener(
  'keydown',
  e => {
    if (typeof RUN === 'undefined' || !RUN || !Story.step(RUN) || !document.getElementById('sbox')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const s = Story.step(RUN);
    if (SB.skip) return e.key === 'Enter' ? sbSkip(true) : e.key === 'Escape' ? sbSkip(false) : null;
    if (e.key === 'l' || e.key === 'L') {
      SB.log = !SB.log;
      return renderCareer();
    }
    if (SB.log) return e.key === 'Escape' && ((SB.log = false), renderCareer());
    if (e.key === 'Escape') {
      SB.skip = true;
      return renderCareer();
    }
    if (s.k === 'choice' && /^[1-4]$/.test(e.key) && s.opts[+e.key - 1]) return sbPick(+e.key - 1);
    if (e.key === ' ' || e.key === 'Enter') sbNext();
  },
  true
);
