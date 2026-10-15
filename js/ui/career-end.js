// Career: run result screen (the U21 Final Cup, rank, growth chart).

function renderRunEnd() {
  const run = RUN,
    r = run.result,
    you = Run.you(run),
    team = Run.myTeam(run),
    cups = r.cups || [],
    won = cups.length && cups[cups.length - 1].place === 'Champion' ? cups[cups.length - 1] : null; // the last season's Cup decides
  const cupLine = c => {
    const def = CUPS.find(x => x.id === c.id);
    return `<li><b>${cups.length > 1 ? `Year ${c.y || 1} ` : ''}${esc(def.name)}</b> — ${Cup.placeText(c.place)}${c.place !== 'Champion' && c.champ ? ` <span class="mute">(won by ${esc(c.champ)})</span>` : ''}</li>`;
  };
  $('#app').innerHTML = `<section class="runend" style="--tc:${team.color}">
    <div class="panel rcard">
      <span class="rank r${r.rank}">${r.rank}</span>
      <div><h2>${won ? (Cup.calledUp(run) ? `Called up to the national team — U21 champions, ${esc(won.champ)}.` : `U21 champions — ${esc(won.champ)}. The national team is calling.`) : run.mode.story && cups.length > 1 ? 'Two seasons over' : 'Season over'}</h2>
      <p>${esc(you.name)} · ${ROLE_NAME[you.role]} · OVR ${ovr(you)} · ${run.fans.toLocaleString()} fans</p>
      <ul class="cupres">${cups.map(cupLine).join('')}</ul>
      <p class="small mute">${statLine(run.plays, ['k', 'blk', 'ace'])}${info(`Across all matches. Grades: ${run.grades.join(' ') || '—'}`)}</p>
      </div>
    </div>
    ${endingCard(run)}
    ${matteredCard(run)}
    ${growthChart(run)}
    <div class="trow"><button class="btn hot" onclick="finishRun('create')">New career</button><button class="btn" onclick="finishRun('menu')">Main menu</button></div>
  </section>`;
}
/** A Story run's ending (spec §4.28): picked together (the true end) or left behind (spite) — the diary's last lines. */
function endingCard(run) {
  const k = run.result.ending;
  if (!k) return '';
  const L = [...ENDINGS[k], ...(k === 'true' && run.story.flags.cupBeatRival ? [ENDINGS.remember] : [])];
  return `<div class="panel ending ${k}"><h3>${k === 'true' ? 'Picked' : 'Not this time'}</h3>${L.map(t => `<p class="diaryl">${esc(t)}</p>`).join('')}</div>`;
}
/** The 5 people who mattered most (largest |stance|): tag, fate and the two memories that weigh most, in your diary voice. */
function matteredCard(run) {
  const L = People.mattered(run, 5);
  return L.length
    ? `<div class="panel"><h3>People who mattered</h3>${L.map(
        x => `<div class="mat"><b>${esc(x.name)}</b> <i class="mute small">${x.role}</i> <span class="stc ${x.tag}">${esc(x.tag)}</span> <span class="small mute">${esc(x.fate)}</span>
        ${x.mem.length ? `<ul class="pmem small">${x.mem.map(m => `<li><b>${Season.at(run, m.w)}</b> ${esc(m.text)}</li>`).join('')}</ul>` : ''}</div>`
      ).join('')}</div>`
    : '';
}
/** Stat growth over the season: OVR and each stat, one point per week. */
function growthChart(run) {
  const H = run.hist || [];
  if (H.length < 2) return '';
  const at = h => h.w + ((h.y || 1) - 1) * SEASON.shift, // weeks from the run's start (two seasons in Story)
    w0 = at(H[0]),
    w1 = at(H[H.length - 1]),
    X = w => 30 + ((w - w0) / Math.max(1, w1 - w0)) * 560,
    Y = v => 150 - ((v - 25) / 74) * 130;
  // theme tokens (speed: --chart-speed; good is visibly darker)
  const COL = { ovr: 'var(--ink)', power: 'var(--bad-soft)', def: 'var(--cyan)', speed: 'var(--chart-speed)', jump: 'var(--gold)' };
  const line = k =>
    `<polyline class="gline" fill="none" style="--c:${COL[k]}" stroke-width="${k === 'ovr' ? 3 : 1.6}" stroke-linejoin="round" points="${H.map(h => `${X(at(h)).toFixed(1)},${Y(h[k]).toFixed(1)}`).join(' ')}"/>`;
  const grid = [40, 60, 80, 99]
    .map(
      v =>
        `<line x1="30" x2="590" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" stroke-opacity=".12"/><text x="4" y="${Y(v) + 4}" font-size="10" fill="currentColor" opacity=".5">${v}</text>`
    )
    .join('');
  const cups = CUPS.flatMap(c => [0, 1].map(y => ({ ...c, after: c.after + y * SEASON.shift })))
    .filter(c => c.after >= w0 && c.after <= w1)
    .map(
      c =>
        `<line x1="${X(c.after)}" x2="${X(c.after)}" y1="16" y2="150" class="gcup" stroke-dasharray="3 3" stroke-opacity=".6"/><text x="${X(c.after) - 8}" y="12" font-size="10" class="gcup">${c.short}</text>`
    )
    .join('');
  return `<div class="panel"><h3>Your season</h3>
    <svg class="growth" viewBox="0 0 600 160" role="img" aria-label="Stat growth over the season">${grid}${cups}${['power', 'def', 'speed', 'jump', 'ovr'].map(line).join('')}</svg>
    <p class="small chartkey">${Object.entries(COL)
      .map(([k, c]) => `<span><i style="--c:${c}"></i>${k === 'ovr' ? 'OVR' : STATNAME[k]}</span>`)
      .join('')}</p></div>`;
}
function finishRun(to) {
  Run.clear();
  RUN = null;
  navigate(to);
}
