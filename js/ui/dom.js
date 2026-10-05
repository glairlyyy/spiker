// DOM helpers and small HTML snippets.

/** First element matching a CSS selector (or null). */
const $ = s => document.querySelector(s);
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape any value for use inside HTML text or a quoted attribute. Every name or data string goes through this. */
const esc = s => String(s).replace(/[&<>"']/g, c => ESC_MAP[c]);
/** Star marker before a name: red ★ for OP players, plain ★ for stars. */
const stag = p => (p.op ? '<span class="opstar" title="OP player">★</span> ' : p.star ? '★ ' : '');
/** Small square in the team colour. */
function chip(t) {
  return `<span class="chip" style="--tc:${t.color}"></span>`;
}
/** Stat bar 0–99, coloured by tier (70+ cyan, 85+ hot). */
function bar(v) {
  return `<span class="bar"><i style="--w:${v}%;--bc:${v >= 85 ? 'var(--hot)' : v >= 70 ? 'var(--cyan)' : 'var(--mute)'}"></i><b>${v}</b></span>`;
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
/**
 * A vertical label / value list (spec §10.1a): one fact per line, label muted left, value right. rows = [label, valueHtml,
 * cls?] (both HTML — escape data first); an empty label continues the fact above on a new line; falsy rows are skipped.
 */
const kv = rows =>
  `<dl class="kv">${rows
    .filter(Boolean)
    .map(([l, v, c]) => `<dt>${l || ''}</dt><dd${c ? ` class="${c}"` : ''}>${v}</dd>`)
    .join('')}</dl>`;
/**
 * L2 peek (spec §10.8): a trigger (`label` + ›) and a pinned detail card beside its owner panel — kv() rows and an
 * optional .acts row. One open at a time (`CW.peek` = its id, so it survives re-renders); click toggles, Esc and an
 * outside click close. The open card is moved to <body> (fixed, clear of the owner's action row) by peekSync().
 * `cls` styles the trigger (e.g. 'row' for a full-width line).
 */
const peek = (id, label, body, cls = '') => {
  const open = typeof CW !== 'undefined' && CW.peek === id;
  return `<button class="peekt ${cls} ${open ? 'on' : ''}" data-peek="${esc(id)}" aria-expanded="${open}" onclick="peekToggle(this.dataset.peek)">${label}<i class="gt" aria-hidden="true">›</i></button><div class="peek" data-peek-of="${esc(id)}" role="dialog" hidden>${body}</div>`;
};
function peekToggle(id) {
  CW.peek = CW.peek === id ? null : id;
  peekSync();
  if (CW.peek) Motion.play(document.querySelector('body > .peek.ported:not([hidden])'), 'in'); // opened by you: fades in once
}
/** Show the open peek (port it to <body> and place it beside its owner panel); drop stale or closed ones. */
function peekSync() {
  if (typeof CW === 'undefined') return;
  const fresh = [...document.querySelectorAll('.peek[data-peek-of]:not(.ported)')],
    trigOf = id => [...document.querySelectorAll('[data-peek]')].find(t => t.dataset.peek === id);
  for (const p of document.querySelectorAll('body > .peek.ported')) {
    if (fresh.some(f => f.dataset.peekOf === p.dataset.peekOf) || !trigOf(p.dataset.peekOf))
      p.remove(); // re-rendered / screen gone
    else p.hidden = p.dataset.peekOf !== CW.peek;
  }
  for (const t of document.querySelectorAll('[data-peek]')) {
    const on = t.dataset.peek === CW.peek;
    t.classList.toggle('on', on);
    t.setAttribute('aria-expanded', String(on));
  }
  if (!CW.peek) return;
  const trig = trigOf(CW.peek),
    card =
      fresh.find(f => f.dataset.peekOf === CW.peek) ||
      [...document.querySelectorAll('body > .peek.ported')].find(p => p.dataset.peekOf === CW.peek);
  if (!trig || !card) return void (CW.peek = null);
  card.hidden = false;
  card.classList.add('ported');
  document.body.appendChild(card);
  const box = (trig.closest('.spotcard, .hubcard, .sheet .card, .sheet .fac, .wrail, .panel, section') || trig).getBoundingClientRect(),
    tr = trig.getBoundingClientRect(),
    own = box.width > innerWidth / 2 ? tr : box, // a wide owner (a whole sheet): sit beside the trigger instead
    w = card.offsetWidth,
    h = card.offsetHeight,
    x = own.right + 12 + w <= innerWidth - 8 ? own.right + 12 : own.left - 12 - w >= 8 ? own.left - 12 - w : Math.max(8, tr.left);
  card.style.left = `${x}px`;
  card.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, tr.top - 8))}px`;
}
(function peekEvents() {
  if (typeof document === 'undefined') return;
  let q = 0;
  const later = () => q || (q = requestAnimationFrame(() => ((q = 0), peekSync())));
  addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    if (app) new MutationObserver(later).observe(app, { childList: true, subtree: true });
  });
  addEventListener('resize', later);
  document.addEventListener('click', e => {
    if (typeof CW === 'undefined' || !CW.peek || !e.target.closest) return;
    if (e.target.closest('.peek, [data-peek]') || !e.target.isConnected) return;
    CW.peek = null;
    peekSync();
  });
  document.addEventListener(
    'keydown',
    e => {
      if (e.key !== 'Escape' || typeof CW === 'undefined' || !CW.peek) return;
      e.preventDefault();
      e.stopImmediatePropagation(); // the peek closes first; the place card stays
      CW.peek = null;
      peekSync();
    },
    true
  );
})();
/**
 * UI motion (spec §9.12): helpers that only add a class for one render or move a leaving copy — state never waits on them.
 * `reduced` = the OS setting or Settings › Motion: Reduced (`html.reduced`, css/theme.css turns moves into short fades).
 */
const Motion = (() => {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null,
    flags = new Set(),
    FAST = 140;
  let pref = 'full';
  const M = {
    get reduced() {
      return pref === 'reduced' || !!(mq && mq.matches);
    },
    get pref() {
      return pref;
    },
    /** Apply the stored setting (load) or a new one ('full' | 'reduced'). */
    set(v) {
      if (v) {
        pref = v === 'reduced' ? 'reduced' : 'full';
        store.set(KEYS.motion, pref);
      } else pref = store.get(KEYS.motion) === 'reduced' ? 'reduced' : 'full';
      if (typeof document !== 'undefined') document.documentElement.classList.toggle('reduced', M.reduced);
    },
    /** A surface just opened / changed: the next render that draws it takes the flag once. */
    mark: k => void flags.add(k),
    take: k => flags.delete(k),
    /** Add `cls` to `el` until its own animation ends (re-adding restarts it). */
    play(el, cls) {
      if (!el) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      const done = e => {
        if (e.target !== el) return;
        el.classList.remove(cls);
        el.removeEventListener('animationend', done);
      };
      el.addEventListener('animationend', done);
      setTimeout(() => el.classList.remove(cls), 1200); // safety: animations paused (hidden tab)
    },
    /**
     * `el` leaves: put a dead copy of it (no ids, no peeks, no clicks) back into `parent` with `.out`; it is removed after
     * dur-fast. The state has already changed, so the next render simply doesn't draw it.
     */
    leave(el, parent) {
      if (!el || !parent || !parent.isConnected || M.reduced) return;
      const g = el.cloneNode(true);
      g.removeAttribute('id');
      for (const n of g.querySelectorAll('[id]')) n.removeAttribute('id');
      for (const n of g.querySelectorAll('.peek')) n.remove();
      for (const n of g.querySelectorAll('[data-peek]')) n.removeAttribute('data-peek');
      g.setAttribute('aria-hidden', 'true');
      g.inert = true;
      g.classList.remove('in', 'swap', 'glide');
      g.classList.add('out', 'ghost-out');
      parent.appendChild(g);
      setTimeout(() => g.remove(), FAST + 20);
    },
    /** Count a number shown in `el` from `from` to `to` over 400 ms (`fmt` formats it). */
    tick(el, from, to, fmt = String) {
      if (!el || from === to || !isFinite(from) || !isFinite(to)) return;
      if (M.reduced) return void (el.textContent = fmt(to));
      const t0 = performance.now(),
        step = now => {
          if (!el.isConnected) return;
          const k = Math.min(1, (now - t0) / 400),
            e = 1 - Math.pow(1 - k, 3);
          el.textContent = fmt(Math.round(from + (to - from) * e));
          if (k < 1) requestAnimationFrame(step);
        };
      el.textContent = fmt(from);
      requestAnimationFrame(step);
      setTimeout(() => (el.textContent = fmt(to)), 450); // frames starved (hidden tab, slow GPU): land on the value anyway
    },
    /** Rows with `data-flip`: their offsets in the old DOM (call before a re-render). */
    flipFirst(root = document) {
      const o = new Map();
      for (const e of root.querySelectorAll('[data-flip]'))
        o.set(e.dataset.flip, { top: e.offsetTop, i: [...e.parentNode.children].indexOf(e) });
      return o;
    },
    /** …and after it: a row whose place in its list changed slides from where it was (dur-base). */
    flip(first, root = document) {
      if (!first || !first.size || M.reduced) return;
      for (const e of root.querySelectorAll('[data-flip]')) {
        const f = first.get(e.dataset.flip);
        if (!f || f.i === [...e.parentNode.children].indexOf(e)) continue;
        const dy = f.top - e.offsetTop;
        if (!dy) continue;
        e.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      }
    },
    /**
     * The screen veil: on at once (before the new screen renders), off over dur-scene / 2. With `title`, the round title on
     * black for 600 ms first (a click or Space skips it). Never blocks input except that title tap.
     */
    veil(title) {
      if (typeof document === 'undefined') return;
      let v = document.getElementById('veil');
      if (!v) {
        v = document.createElement('div');
        v.id = 'veil';
        v.setAttribute('aria-hidden', 'true');
        document.body.appendChild(v);
      }
      clearTimeout(v._t);
      v.innerHTML = title ? `<b>${esc(title)}</b>` : '';
      v.classList.toggle('title', !!title && !M.reduced);
      v.classList.add('on');
      const off = () => {
        clearTimeout(v._t);
        removeEventListener('keydown', key, true);
        v.onclick = null;
        v.classList.remove('on', 'title');
      };
      const key = e => {
        if (e.code === 'Space' || e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          off();
        }
      };
      if (title && !M.reduced) {
        v.onclick = off;
        addEventListener('keydown', key, true);
        v._t = setTimeout(off, 600);
      } else requestAnimationFrame(() => requestAnimationFrame(off)); // after the new screen's first paint
    }
  };
  if (mq && mq.addEventListener) mq.addEventListener('change', () => M.set());
  return M;
})();
/** The ego personality (spec §2.12) as a small tag with what it means on hover. */
const EGO_TAG = {
  normal: ['Normal', 'Plays for the team: never goes for an ego play. As setter, usually feeds the open hitter.'],
  selfish: ['Selfish', 'Sometimes goes for the glory: steals balls, demands sets, swings or serves big.'],
  egoist: ['Egoist', 'Plays for themselves: ego plays often and they go badly more often. A captain cannot rein them in.']
};
const egoTag = p => {
  const [n, t] = EGO_TAG[p && p.ego] || EGO_TAG.normal;
  return `<span class="egot e-${esc(p && EGO_TAG[p.ego] ? p.ego : 'normal')}" ${tip(t)}>${n}</span>`;
};
/** A small ⓘ dot carrying explanatory text as a tooltip instead of a paragraph. */
const info = t => `<span class="ii" tabindex="0" role="note" aria-label="${esc(t)}" ${tip(t)}>i</span>`;
/**
 * A glossary term (spec §9.4): its icon (StatIcons, js/ui/icons.js; the alias word if it has none) and an optional signed number, with the
 * term's one explanation as the tooltip. The number carries the colour: `good` for +, `bad` for − (`cls` overrides, e.g.
 * 'cost' keeps a cost neutral); a string `n` ('↑', '1/2', 'S') shows as is. term('sp', 3) → ◆ +3.
 */
function term(id, n, cls = '') {
  const g = GLOSSARY[id];
  if (!g) return '';
  const ic = statI(g.icon) || `<b class="tw">${esc(g.short)}</b>`,
    num =
      n == null
        ? ''
        : typeof n === 'number'
          ? fmtDelta(n, { pre: id === 'money' ? '$' : '', loc: true, zero: id === 'money' ? '$0' : '0' })
          : esc(String(n)),
    tone = cls || (typeof n === 'number' ? (n > 0 ? 'good' : n < 0 ? 'bad' : '') : '');
  return `<span class="term ${tone}" ${tip(g.long)} aria-label="${esc(g.short)}">${ic}${num ? `<span class="tn">${num}</span>` : ''}</span>`;
}
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
