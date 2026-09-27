// Career: run result screen (both cups, growth chart), the Legacy unlock shop with on/off switches, the Hall of Fame.

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
    return `<li><b>${esc(def.name)}</b> — ${c.place === 'Champion' ? '🏆 Champion' : `out in the ${c.place.toLowerCase()}`}${c.place !== 'Champion' && ch ? ` <span class="mute">(won by ${esc(ch.name)})</span>` : ''}</li>`;
  };
  $('#app').innerHTML = `<section class="runend" style="--tc:${team.color}">
    <div class="panel rcard">
      <span class="rank r${r.rank}">${r.rank}</span>
      <div><h2>${crown ? `Double Crown — ${esc(team.name)} win both cups` : cups.some(c => c.place === 'Champion') ? `${esc(team.name)} win the ${esc(CUPS.find(x => x.id === cups.find(c => c.place === 'Champion').id).name)}` : 'Season over'}</h2>
      <p>${esc(you.name)} · ${ROLE_NAME[you.role]} · OVR ${ovr(you)} · ${run.fans.toLocaleString()} fans</p>
      <ul class="cupres">${cups.map(cupLine).join('')}</ul>
      <p class="small mute">${run.plays.k} K · ${run.plays.blk} B · ${run.plays.ace} A${info(`Across all matches: ${run.plays.k} kills, ${run.plays.blk} blocks, ${run.plays.ace} aces. Grades: ${(run.grades || []).join(' ') || '—'}`)}</p>
      <p><b>+${r.earned} Legacy points</b>${info(`1 per ${LEGACY_PER_FANS} fans${run.pure ? `, ×${PURE_BONUS} pure run` : ''}${Object.keys(MODES).filter(k => run.mode && run.mode[k]).map(k => `, ×${MODES[k].legacy} ${MODES[k].name.toLowerCase()}`).join('')}${crown ? `, +${DOUBLE_CROWN} Double Crown` : ''}`)}</p></div>
    </div>
    ${growthChart(run)}
    ${legacyShop()}
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
  const line = k => `<polyline fill="none" stroke="${COL[k]}" stroke-width="${k === 'ovr' ? 3 : 1.6}" stroke-linejoin="round" points="${H.map(h => `${X(h.w).toFixed(1)},${Y(h[k]).toFixed(1)}`).join(' ')}"/>`;
  const grid = [40, 60, 80, 99].map(v => `<line x1="30" x2="590" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" stroke-opacity=".12"/><text x="4" y="${Y(v) + 4}" font-size="10" fill="currentColor" opacity=".5">${v}</text>`).join('');
  const cups = CUPS.filter(c => c.after >= w0 && c.after <= w1)
    .map(c => `<line x1="${X(c.after)}" x2="${X(c.after)}" y1="16" y2="150" stroke="#ff3b4e" stroke-dasharray="3 3" stroke-opacity=".6"/><text x="${X(c.after) - 8}" y="12" font-size="10" fill="#ff3b4e">${c.short}</text>`)
    .join('');
  return `<div class="panel"><h3>Your season</h3>
    <svg class="growth" viewBox="0 0 600 160" role="img" aria-label="Stat growth over the season">${grid}${cups}${['power', 'def', 'speed', 'jump', 'ovr'].map(line).join('')}</svg>
    <p class="small legend">${Object.entries(COL).map(([k, c]) => `<span><i style="background:${c}"></i>${k === 'ovr' ? 'OVR' : STATNAME[k]}</span>`).join('')}</p></div>`;
}
function finishRun(to) {
  Run.clear();
  RUN = null;
  navigate(to);
}
function legacyShop() {
  const L = Legacy.load();
  return `<div class="panel"><h3>Legacy unlocks${info('Permanent bonuses for new careers, bought with Legacy points from fans at the end of each run. Switch owned unlocks off for a tougher run — changes apply from your next career.')} <span class="pts">${L.pts} pts</span></h3>
    <div class="skills compact lg">${UNLOCKS.map(u => {
      const own = L.owned.includes(u.id),
        off = L.off.includes(u.id),
        locked = u.need && !L.owned.includes(u.need);
      return own
        ? `<button class="sk own ${off ? 'off' : ''}" onclick="toggleUnlock('${u.id}')" role="switch" aria-checked="${!off}" ${tip(u.desc)}><b>${esc(u.name)}</b><span class="sw"><i></i>${off ? 'Off' : 'On'}</span></button>`
        : `<button class="sk" onclick="buyUnlock('${u.id}')" ${!Legacy.canBuy(L, u) ? 'aria-disabled="true"' : ''} ${tip(u.desc + (locked ? ' · needs the previous tier' : ''))}><b>${esc(u.name)}</b><span>${locked ? '🔒 ' : ''}${u.cost}</span></button>`;
    }).join('')}</div>
    ${hallOfFame(L)}
    ${L.history.length ? `${fold('runs', `<h4>Recent runs</h4>`, `<ol class="log">${L.history.map(h => `<li><b>${h.rank}</b> ${esc(h.name)} (${h.role}) — ${esc(h.place)}, ${h.fans.toLocaleString()} fans</li>`).join('')}</ol>`)}` : ''}</div>`;
}
function hallOfFame(L) {
  const hd = `<h4>Hall of Fame${info('Your best careers (top 6 by fans) enter the Hall of Fame. New players can inherit from a legend, and legends may turn up as stars on other teams.')}</h4>`;
  if (!L.hof.length) return hd + `<p class="small mute">Empty</p>`;
  return `${hd}<ol class="hof">${L.hof
    .map(
      h =>
        `<li><b>${h.rank}</b> ${esc(h.name)} <i class="mute">${ROLE_NAME[h.role]}</i> · ${h.fans.toLocaleString()} fans${h.el ? ` · <span style="color:${ECOL[h.el]}" title="${esc(h.sig ? h.sig.name : '')}">${ENAME[h.el]}${h.elOn ? '' : ' (locked)'}</span>` : ''} · ${STATK.map(k => `${STATNAME[k][0]}${h.stats[k]}`).join(' ')}${(h.cups || []).some(c => c.place === 'Champion') ? ' · 🏆' : ''}</li>`
    )
    .join('')}</ol>`;
}
function buyUnlock(id) {
  if (!Legacy.buy(id)) return;
  G.view === 'legacy' ? renderLegacy() : renderRunEnd();
}
function toggleUnlock(id) {
  if (!Legacy.toggle(id)) return;
  G.view === 'legacy' ? renderLegacy() : renderRunEnd();
}
function renderLegacy() {
  A = null;
  $('#app').innerHTML = `<section class="runend">${legacyShop()}<button class="btn" onclick="navigate('menu')">Back</button></section>`;
}
Screens.legacy = renderLegacy;
