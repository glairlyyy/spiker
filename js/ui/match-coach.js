// The coach panel (spec §2.25): the match rail's Coach tab — how each side is doing, simplest first (owner, 2026-10-12):
// a status line (run, passing, plan), the players who stand out with their state words (bad news first; Coach.condition),
// the clear patterns in plain words (Coach.tags), and the numbers folded away (attack, hitters, block, serve receive).
// States, never advice. Redrawn at every point (the `score` act) and when the tab opens.

const coachPct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '–');
const COACH_TONE = { bad: 0, warn: 1, good: 2 };
/** A player's short name: #num First. */
const coachName = p => `${stag(p)}#${p.num} ${esc(p.name.split(' ')[0])}`;
/** A pattern in plain words (tags belong to the side that shows them). */
function coachTag(g) {
  const n = ` <span class="mute">${g.n} of ${g.of}</span>`;
  if (g.kind === 'lane') return `#${g.p.num} hits ${g.ch === 'line' ? 'down the line' : 'cross-court'}${n}`;
  if (g.kind === 'serve') return `Serving at their #${g.p.num}${n}`;
  if (g.kind === 'read') return `Block reading them${n}`;
  return `Block guessing wrong${n}`;
}
/** One side's section. */
function coachSide(m, i) {
  const C = Coach.side(m, i),
    { t, att, block } = C,
    K = Coach.condition(m, i, A.staShown && Object.keys(A.staShown).length ? A.staShown : m.sta, A.moodShown || m.mood),
    T = K.team,
    shown = m.over || (A.prepS && A.prepS.who[i] === 'you') || prepMine(m) === i,
    plan = shown ? `${esc(PLANS.atk[planOf(m, i).atk].short)} · ${esc(PLANS.def[planOf(m, i).def].short)}` : 'hidden',
    run = T.run >= 2 ? `On a ${T.run}-point run` : T.theirRun >= 2 ? `Lost the last ${T.theirRun}` : 'Trading points',
    // the players who stand out: the most bad news first, each with up to 3 words (bad first); the rest are steady
    out = K.players
      .filter(r => r.words.length)
      .map(r => ({ ...r, words: [...r.words].sort((a, b) => COACH_TONE[a.tone] - COACH_TONE[b.tone]).slice(0, 3) }))
      .sort((a, b) => COACH_TONE[a.words[0].tone] - COACH_TONE[b.words[0].tone]),
    steady = K.players.filter(r => !r.words.length),
    th = h => `<th>${h}</th>`;
  const cond = out.length
      ? `<ul class="ccond">${out
          .map(
            ({ p, words }) =>
              `<li><span class="cnm">${coachName(p)}</span>${words.map(w => `<i class="cw cw-${w.tone}" ${tip(w.why)}>${esc(w.t)}</i>`).join('')}</li>`
          )
          .join('')}</ul>`
      : '',
    calm = steady.length
      ? `<p class="csteady">${out.length ? 'Steady: ' : 'Everyone steady: '}${steady.map(r => coachName(r.p)).join(' · ')}</p>`
      : '',
    tags = C.tags.length
      ? `<div class="lab">Patterns</div><ul class="ctags">${C.tags.map(g => `<li class="ct-${g.kind}">${coachTag(g)}</li>`).join('')}</ul>`
      : '';
  const hit = C.hitters.length
      ? `<table><thead><tr>${['Hitter', 'Att', 'Kill', 'Err', 'Line', 'Cross', 'Tip', 'Read'].map(th).join('')}</tr></thead><tbody>${C.hitters
          .map(
            h =>
              `<tr><td>${coachName(h.p)}</td><td>${h.n}</td><td>${h.k}</td><td>${h.err}</td><td>${h.line}</td><td>${h.cross}</td><td>${h.tip}</td><td ${tip('Times their block read this hitter right, of the times it read')}>${h.rd ? `${h.rdOk}/${h.rd}` : '–'}</td></tr>`
          )
          .join('')}</tbody></table>`
      : '',
    rec = C.recv.length
      ? `<table><thead><tr>${['Passer', 'Served at', 'Aced'].map(th).join('')}</tr></thead><tbody>${C.recv
          .map(r => `<tr><td>${coachName(r.p)}</td><td>${r.n + r.ace}</td><td>${r.ace}</td></tr>`)
          .join('')}</tbody></table>`
      : '<p class="small mute">No serves yet.</p>',
    nums = fold(
      `coachn${i}`,
      'Numbers',
      `<div class="lab">Attack</div><p class="cline">${att.n} attacks · ${att.k} kills (${coachPct(att.k, att.n)}) · ${att.err} errors · ${att.stf} stuffed</p>${hit}
      <div class="lab">Block</div><p class="cline" ${tip('Their attacks into a real block: the channel the block read, right, and right but still a kill')}>${block.n} reads · ${block.ok} right (${coachPct(block.ok, block.n)}) · ${block.beat} beaten anyway · ${block.stf} stuffs</p>
      <div class="lab">Serve receive</div>${rec}`
    );
  return `<section class="cside"><h4>${chip(t)}${esc(t.name)}</h4>
    <p class="cstat"><b>${run}</b> · Passing ${T.pass.n ? `${T.pass.ok} of ${T.pass.n} clean` : '–'}${T.kos ? ` · Knocked down ${T.kos}×` : ''} · Plan: ${plan}</p>
    ${cond}${calm}${tags}${nums}</section>`;
}
/** Redraw the Coach tab (both sides; yours first in a career match). */
function coachPanel() {
  const el = $('#coach');
  if (!el || !A || !A.m) return;
  const mine = prepMine(A.m);
  el.innerHTML = (mine === 1 ? [1, 0] : [0, 1]).map(i => coachSide(A.m, i)).join('');
}
