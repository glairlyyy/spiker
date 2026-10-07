// The rally counter (owner 2026-10-07, a Devil May Cry / Dynasty Warriors style combo counter): every touch of the ball in a
// rally pops a number on the right of the court that grows and climbs through tiers as the rally goes on; it holds on the
// point, then fades. Display only (playback.js calls it from startBall / reset, acts.js from point). Tuning: VFX.combo.

/** Tiers: [from touches, word, class]. */
const COMBO_TIERS = [
  [0, '', 't1'],
  [6, 'Rally', 't2'],
  [10, 'Long rally', 't3'],
  [15, 'Marathon', 't4'],
  [20, 'Legendary', 't5']
];
/** One more touch in this rally: show / bump the counter (from VFX.combo.min touches). */
function comboTouch(n) {
  const C = VFX.combo,
    st = $('#stage');
  if (!C.on || n < C.min || !st) return;
  let el = $('#combo');
  if (!el) {
    el = document.createElement('div');
    el.id = 'combo';
    el.setAttribute('aria-hidden', 'true');
    st.appendChild(el);
  }
  const tier = COMBO_TIERS.reduce((t, x) => (n >= x[0] ? x : t), COMBO_TIERS[0]);
  clearTimeout(comboEnd.t);
  el.className = `combo on ${tier[2]}`;
  el.style.setProperty('--n', Math.min(n, 30));
  el.style.setProperty('--k', C.size);
  el.innerHTML = `<b>${n}</b><span>touches</span>${tier[1] ? `<em>${esc(tier[1])}</em>` : ''}`;
  void el.offsetWidth; // restart the pop
  el.classList.add('pop');
}
/** The rally is over: `now` hides it at once (a new rally), else it holds the final count, then fades. */
function comboEnd(now) {
  const el = $('#combo');
  if (!el || !el.classList.contains('on')) return;
  clearTimeout(comboEnd.t);
  if (now) return el.classList.remove('on', 'pop', 'done');
  el.classList.add('done');
  comboEnd.t = setTimeout(() => el.classList.remove('on', 'pop', 'done'), 2200);
}
