// The coach panel (spec §2.25): the match rail's Coach tab — what each side has shown this match, from the engine's tallies
// (js/engine/coach.js): tags for clear patterns, attack totals, every hitter's channels and how often the block read them,
// the block's reads, who was served at. Redrawn at every point (the `score` act) and when the tab opens.

const coachPct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '–');
/** Side i's condition (Coach.condition): the team line, then each player's state words (states only, never advice). */
function coachCond(m, i) {
  const c = Coach.condition(m, i, A.staShown && Object.keys(A.staShown).length ? A.staShown : m.sta, A.moodShown || m.mood),
    T = c.team,
    run = T.run >= 2 ? `On a ${T.run}-point run` : T.theirRun >= 2 ? `Lost the last ${T.theirRun}` : 'Trading points',
    rows = c.players
      .map(
        ({ p, words }) =>
          `<li><span class="cnm">${stag(p)}#${p.num} ${esc(p.name.split(' ')[0])}</span>${
            words.length ? words.map(w => `<i class="cw cw-${w.tone}" ${tip(w.why)}>${esc(w.t)}</i>`).join('') : '<i class="cw">Steady</i>'
          }</li>`
      )
      .join('');
  return `<div class="lab">Condition</div><p class="cline">${run} · Passing ${T.pass.n ? `${T.pass.ok} of ${T.pass.n} clean` : '–'}${
    T.kos ? ` · Knocked down ${T.kos}×` : ''
  }</p><ul class="ccond">${rows}</ul>`;
}
/** One side's section. */
function coachSide(m, i) {
  const C = Coach.side(m, i),
    { t, att, block } = C,
    th = h => `<th>${h}</th>`,
    tags = C.tags.length
      ? `<ul class="ctags">${C.tags.map(g => `<li class="ct-${g.kind}">${esc(g.text)}</li>`).join('')}</ul>`
      : '<p class="small mute">No clear pattern yet.</p>',
    hit = C.hitters.length
      ? `<table><thead><tr>${['Hitter', 'Att', 'Kill', 'Err', 'Line', 'Cross', 'Tip', 'Read'].map(th).join('')}</tr></thead><tbody>${C.hitters
          .map(
            h =>
              `<tr><td>${stag(h.p)}#${h.p.num} ${esc(h.p.name.split(' ')[0])}</td><td>${h.n}</td><td>${h.k}</td><td>${h.err}</td><td>${h.line}</td><td>${h.cross}</td><td>${h.tip}</td><td ${tip('Times their block read this hitter right, of the times it read')}>${h.rd ? `${h.rdOk}/${h.rd}` : '–'}</td></tr>`
          )
          .join('')}</tbody></table>`
      : '',
    rec = C.recv.length
      ? `<table><thead><tr>${['Passer', 'Served at', 'Aced'].map(th).join('')}</tr></thead><tbody>${C.recv
          .map(r => `<tr><td>#${r.p.num} ${esc(r.p.name.split(' ')[0])}</td><td>${r.n + r.ace}</td><td>${r.ace}</td></tr>`)
          .join('')}</tbody></table>`
      : '';
  const shown = m.over || (A.prepS && A.prepS.who[i] === 'you') || (typeof prepMine === 'function' && prepMine(m) === i),
    plan = shown ? `${esc(PLANS.atk[planOf(m, i).atk].name)} · ${esc(PLANS.def[planOf(m, i).def].name)}` : 'hidden';
  return `<section class="cside"><h4>${chip(t)}${esc(t.name)}</h4><p class="cline">Plan: <b>${plan}</b></p>${coachCond(m, i)}${tags}
    <div class="lab">Attack</div><p class="cline">${att.n} attacks · ${att.k} kills (${coachPct(att.k, att.n)}) · ${att.err} errors · ${att.stf} stuffed</p>${hit}
    <div class="lab">Block</div><p class="cline" ${tip('Their attacks into a real block: the channel the block read, right, and right but still a kill')}>${block.n} reads · ${block.ok} right (${coachPct(block.ok, block.n)}) · ${block.beat} beaten anyway · ${block.stf} stuffs</p>
    <div class="lab">Serve receive</div>${rec || '<p class="small mute">No serves yet.</p>'}</section>`;
}
/** Redraw the Coach tab (both sides). */
function coachPanel() {
  const el = $('#coach');
  if (!el || !A || !A.m) return;
  el.innerHTML = [0, 1].map(i => coachSide(A.m, i)).join('');
}
