// Debug log panel: shows everything DBG collected (errors, stalls, the match state) with a Copy button.

function openDebug() {
  closeDebug();
  const txt = DBG.text(typeof matchState === 'function' ? matchState() : null);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="dbg" id="dbg" role="dialog" aria-modal="true" aria-label="Debug log" onclick="if(event.target===this)closeDebug()">
      <div class="dbg-card">
        <div class="dbg-hd"><b>Debug log</b><span class="small mute">Copy this and paste it in the chat when something hangs or breaks.</span></div>
        <textarea id="dbgtxt" readonly spellcheck="false"></textarea>
        <div class="trow"><button class="btn hot" onclick="copyDebug()">Copy</button><button class="btn" onclick="DBG.clear();openDebug()">Clear</button><button class="btn" onclick="closeDebug()">Close</button><span class="small mute" id="dbgmsg"></span></div>
      </div></div>`
  );
  $('#dbgtxt').value = txt;
}
function closeDebug() {
  $('#dbg')?.remove();
}
/** Clipboard API first; inside a sandboxed frame fall back to selecting the text for a manual copy. */
function copyDebug() {
  const ta = $('#dbgtxt'),
    msg = $('#dbgmsg');
  const done = ok => msg && (msg.textContent = ok ? 'Copied.' : 'Selected: press Ctrl/Cmd+C to copy.');
  ta.focus();
  ta.select();
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(ta.value).then(
      () => done(true),
      () => done(document.execCommand && document.execCommand('copy'))
    );
  else done(document.execCommand && document.execCommand('copy'));
}
/** Header button shows how many problems were recorded. */
function dbgBadge() {
  const b = document.getElementById('dbgn');
  if (!b) return;
  const n = DBG.count();
  b.textContent = n ? String(n) : '';
  b.hidden = !n;
}
addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#dbg')) closeDebug();
});
dbgBadge();

/**
 * Dev tab (title screen, T-171) or ?dev: visible words per screen region (spec §10.8 budgets), a badge at each region's corner, red over budget. Only
 * what is on screen counts (closed peeks and tooltips don't). Budget 0 = count only.
 */
const WORD_REGIONS = [
  ['.hub .tbar', () => 0],
  ['.hub .wrail', () => 45],
  ['#spot.open', el => (el.querySelector('.pside') ? 70 : 30)], // battle card 70: every fact and effect stays (§10.1a)
  ['.hubmodal .hubcard', el => (el.querySelector('.brief') ? 25 : 30)],
  ['.hub .sheet', el => (el.querySelector('.mecols') ? 110 : 60)], // Me sheet 110 (T-162), others 60
  ['.create2', () => 60],
  ['section.title', () => 25] // brand, tagline and the Continue line (T-176)
];
/** Words a player reads in `el`: visible text minus printed hotkeys (<kbd> — key hints) and the ?dev playtest panel. */
const wordCount = el => {
  const words = t => (t || '').split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
  return words(el.innerText) - [...el.querySelectorAll('kbd, .mdev')].reduce((n, k) => n + words(k.innerText), 0);
};
function wordBadges() {
  let box = document.getElementById('wcnt');
  if (!box) {
    box = document.createElement('div');
    box.id = 'wcnt';
    document.body.appendChild(box);
  }
  box.innerHTML = WORD_REGIONS.flatMap(([sel, budget]) =>
    [...document.querySelectorAll(sel)].map(el => {
      const r = el.getBoundingClientRect(),
        n = wordCount(el),
        b = budget(el);
      return r.width
        ? `<span class="wcb ${b && n > b ? 'wover' : ''}" style="--x:${Math.round(r.left + 4)}px;--y:${Math.round(r.top + 4)}px">${n}${b ? `/${b}` : ''}</span>`
        : '';
    })
  ).join('');
}
/** The word counter on / off (remembered per browser; ?dev turns it on). */
let wordTimer = 0;
const wordsOn = () => !!wordTimer;
function setWords(on) {
  clearInterval(wordTimer);
  wordTimer = on ? setInterval(wordBadges, 600) : 0;
  if (!on) document.getElementById('wcnt')?.remove();
  store.set(KEYS.words, on ? '1' : '0');
}
if (typeof location !== 'undefined' && (/[?&]dev\b/.test(location.search) || store.get(KEYS.words) === '1')) setWords(true);
