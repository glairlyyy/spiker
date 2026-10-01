// DOM helpers and small HTML snippets.

/** First element matching a CSS selector (or null). */
const $ = s => document.querySelector(s);
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape any value for use inside HTML text or a quoted attribute. Every name or data string goes through this. */
const esc = s => String(s).replace(/[&<>"']/g, c => ESC_MAP[c]);
/** A number with an explicit plus sign when positive: "+3", "-2", "0". */
const signed = v => `${v > 0 ? '+' : ''}${v}`;
/** Star marker before a name: red ★ for OP players, plain ★ for stars. */
const stag = p => (p.op ? '<span class="opstar" title="OP player">★</span> ' : p.star ? '★ ' : '');
/** Small square in the team colour. */
function chip(t) {
  return `<span class="chip" style="--tc:${t.color}"></span>`;
}
/** Stat bar 0–99, coloured by tier (70+ cyan, 85+ hot). */
function bar(v) {
  return `<span class="bar"><i style="width:${v}%;--bc:${v >= 85 ? 'var(--hot)' : v >= 70 ? 'var(--cyan)' : 'var(--mute)'}"></i><b>${v}</b></span>`;
}
/** One-line summary of a player's tournament stats. */
function line(s) {
  return s.mp
    ? `${s.mp} matches: ${s.k} kills, ${s.blk} blocks, ${s.ace} aces, ${s.dig} digs, ${s.ast} assists, ${s.err} errors, top spike ${s.top} km/h`
    : 'No matches yet';
}
// ---- compact UI: tooltips, info dots, folds, pop-over menus ----
/** Tooltip attribute for any element (shown on hover / keyboard focus / tap on focusable elements). */
const tip = t => `data-tip="${esc(t)}"`;
/** A small ⓘ dot carrying explanatory text as a tooltip instead of a paragraph. */
const info = t => `<span class="ii" tabindex="0" role="note" aria-label="${esc(t)}" ${tip(t)}>i</span>`;
/** Collapsible block; `key` remembers open/closed for this session. `summary` and `body` are HTML. */
const FOLD = {};
const fold = (key, summary, body, open = false) =>
  `<details class="fold" data-fold="${esc(key)}" ${(FOLD[key] ?? open) ? 'open' : ''} ontoggle="FOLD[this.dataset.fold]=this.open"><summary>${summary}</summary><div class="foldb">${body}</div></details>`;
/** Pop-over menu (a button that opens a small panel); closes on outside click / Esc. `label` and `body` are HTML. */
const pop = (label, body, cls = '') =>
  `<details class="pop ${cls}"><summary class="btn">${label}</summary><div class="popb">${body}</div></details>`;
// Document-level listeners for tooltips and pop-overs: installed once at load (delegated, so re-renders never add more).
(function uiTips() {
  if (typeof document === 'undefined') return;
  let box = null;
  const show = el => {
    const t = el.getAttribute('data-tip');
    if (!t) return;
    if (!box) {
      box = document.createElement('div');
      box.className = 'tipbox';
      box.setAttribute('role', 'tooltip');
      document.body.appendChild(box);
    }
    (document.fullscreenElement || document.body).appendChild(box);
    box.textContent = t;
    box.style.display = 'block';
    const r = el.getBoundingClientRect(),
      b = box.getBoundingClientRect();
    let x = r.left + r.width / 2 - b.width / 2,
      y = r.top - b.height - 8;
    x = Math.max(8, Math.min(innerWidth - b.width - 8, x));
    if (y < 8) y = r.bottom + 8;
    box.style.left = x + 'px';
    box.style.top = y + 'px';
  };
  const hide = () => box && (box.style.display = 'none');
  const at = e => (e.target && e.target.closest ? e.target.closest('[data-tip]') : null);
  document.addEventListener('mouseover', e => (at(e) ? show(at(e)) : hide()));
  document.addEventListener('focusin', e => (at(e) ? show(at(e)) : hide()));
  document.addEventListener('focusout', hide);
  addEventListener('scroll', hide, true);
  // pop-over menus: one open at a time, closed by an outside click or Esc
  document.addEventListener('click', e => {
    for (const d of document.querySelectorAll('details.pop[open]')) if (!d.contains(e.target)) d.open = false;
  });
  // keep an opened pop-over on screen (it opens to the left of its button; flip it when that runs off the edge)
  document.addEventListener(
    'toggle',
    e => {
      const d = e.target;
      if (!d.matches || !d.matches('details.pop') || !d.open) return;
      const b = d.querySelector('.popb');
      b.style.left = b.style.right = '';
      const r = b.getBoundingClientRect();
      if (r.left < 8) {
        b.style.right = 'auto';
        b.style.left = `${8 - d.getBoundingClientRect().left}px`;
      }
    },
    true
  );
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') for (const d of document.querySelectorAll('details.pop[open]')) d.open = false;
  });
})();
