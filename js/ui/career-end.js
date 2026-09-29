// Career: run result screen (both cups, rank, growth chart).

function renderRunEnd() {
  const run = RUN,
    r = run.result,
    you = Run.you(run),
    team = Run.myTeam(run),
    cups = r.cups || [],
    crown = cups.length === CUPS.length && cups.every(c => c.place === 'Champion');
  const cupLine = c => {
    const def = CUPS.find(x => x.id === c.id),
      ch = run.teams[c.champ];
    return `<li><b>${esc(def.name)}</b> — ${Cup.placeText(c.place)}${c.place !== 'Champion' && ch ? ` <span class="mute">(won by ${esc(ch.name)})</span>` : ''}</li>`;
  };
  $('#app').innerHTML = `<section class="runend" style="--tc:${team.color}">
    <div class="panel rcard">
      <span class="rank r${r.rank}">${r.rank}</span>
      <div><h2>${crown ? `Double Crown — ${esc(team.name)} win both cups` : cups.some(c => c.place === 'Champion') ? `${esc(team.name)} win the ${esc(CUPS.find(x => x.id === cups.find(c => c.place === 'Champion').id).name)}` : 'Season over'}</h2>
      <p>${esc(you.name)} · ${ROLE_NAME[you.role]} · OVR ${ovr(you)} · ${run.fans.toLocaleString()} fans</p>
      <ul class="cupres">${cups.map(cupLine).join('')}</ul>
      <p class="small mute">${run.plays.k} K · ${run.plays.blk} B · ${run.plays.ace} A${info(`Across all matches: ${run.plays.k} kills, ${run.plays.blk} blocks, ${run.plays.ace} aces. Grades: ${(run.grades || []).join(' ') || '—'}`)}</p>
      </div>
    </div>
    ${growthChart(run)}
    <div class="trow"><button class="btn hot" onclick="finishRun('create')">New career</button><button class="btn" onclick="finishRun('menu')">Main menu</button></div>
  </section>`;
}
/** Stat growth over the season: OVR and each stat, one point per week. */
function growthChart(run) {
  const H = run.hist || [];
  if (H.length < 2) return '';
  const w0 = H[0].w,
    w1 = H[H.length - 1].w,
    X = w => 30 + ((w - w0) / Math.max(1, w1 - w0)) * 560,
    Y = v => 150 - ((v - 25) / 74) * 130;
  const COL = { ovr: '#f5f7fa', power: '#ff5a6e', def: '#4cc9f0', speed: '#7ee081', jump: '#f5c451' };
  const line = k =>
    `<polyline fill="none" stroke="${COL[k]}" stroke-width="${k === 'ovr' ? 3 : 1.6}" stroke-linejoin="round" points="${H.map(h => `${X(h.w).toFixed(1)},${Y(h[k]).toFixed(1)}`).join(' ')}"/>`;
  const grid = [40, 60, 80, 99]
    .map(
      v =>
        `<line x1="30" x2="590" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" stroke-opacity=".12"/><text x="4" y="${Y(v) + 4}" font-size="10" fill="currentColor" opacity=".5">${v}</text>`
    )
    .join('');
  const cups = CUPS.filter(c => c.after >= w0 && c.after <= w1)
    .map(
      c =>
        `<line x1="${X(c.after)}" x2="${X(c.after)}" y1="16" y2="150" stroke="#ff3b4e" stroke-dasharray="3 3" stroke-opacity=".6"/><text x="${X(c.after) - 8}" y="12" font-size="10" fill="#ff3b4e">${c.short}</text>`
    )
    .join('');
  return `<div class="panel"><h3>Your season</h3>
    <svg class="growth" viewBox="0 0 600 160" role="img" aria-label="Stat growth over the season">${grid}${cups}${['power', 'def', 'speed', 'jump', 'ovr'].map(line).join('')}</svg>
    <p class="small chartkey">${Object.entries(COL)
      .map(([k, c]) => `<span><i style="background:${c}"></i>${k === 'ovr' ? 'OVR' : STATNAME[k]}</span>`)
      .join('')}</p></div>`;
}
function finishRun(to) {
  Run.clear();
  RUN = null;
  navigate(to);
}
