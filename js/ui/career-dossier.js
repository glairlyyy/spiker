// Career: the faction dossier window — one faction's facilities, fronts, clubs and roster, rendered from Dossier.build.
// Opens in place on the World sheet's Factions tab (from a club HQ panel or a faction name); Esc or ← goes back to the list.

const DOSSIER_STATE = { weakened: 'Weakened', pressed: 'Pressed', rising: 'Rising', stable: 'Stable', minor: 'Not in the war' };

function openDossier(r) {
  CW.dossier = r;
  CW.wtab = 'factions';
  CW.sheet = 'world';
  renderCareer();
}
function closeDossier() {
  CW.dossier = null;
  renderCareer();
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || typeof CW === 'undefined' || !CW.dossier) return;
  e.stopImmediatePropagation(); // back to the faction list, not out of the sheet
  closeDossier();
});

function dossierCard(run, r) {
  const d = Dossier.build(run, r),
    free = World.isFree(run),
    v = d.standing,
    sgn = n => (n > 0 ? '+' : '') + n;
  const fronts = d.fronts.length
    ? `<h4>Front</h4><div class="fms">${d.fronts.map(f => `<span class="fm ${f.meter > 0 ? 'up' : f.meter < 0 ? 'dn' : ''}" ${tip(GLOSSARY.seize.long)}>vs ${esc(REGIONS[f.vs].name)} ${sgn(f.meter)}</span>`).join('')}</div>
      ${d.took.length ? `<div class="small">Took: ${d.took.map(id => `${esc(SPOTS[id].name)} <i class="mute">(from ${esc(REGIONS[SPOTS[id].region].name)})</i>`).join(', ')}</div>` : ''}
      ${d.lost.length ? `<div class="small">Lost: ${d.lost.map(id => `${esc(SPOTS[id].name)} <i class="mute">(to ${esc(REGIONS[RUN.own[id]].name)})</i>`).join(', ')}</div>` : ''}
      <div class="small mute">Prices ×${d.priceMul.toFixed(1)} · facilities ×${d.qMul.toFixed(2)}</div>`
    : '';
  const places = d.places.length
    ? `<h4>Facilities</h4><table class="dtab"><thead><tr><th>Place</th><th>Trains</th><th>Price</th><th>Quality</th><th>Lv</th><th>Entry</th></tr></thead><tbody>${d.places
        .map(
          p => `<tr class="dgo" onclick="CW.dossier=null;hubOpen(null);mapPick('${p.id}')">
        <td>${esc(p.name)}${p.seized ? ` <i class="mute small">seized from ${esc(REGIONS[p.from].name)}</i>` : ''}</td>
        <td>${p.train ? esc(STATNAME[p.train] || p.train) : '—'}</td><td>${p.price ? '$' + p.price : '—'}</td>
        <td>${p.q}${p.known ? '' : ` <span ${tip('Advertised: you have not trained here yet')}>?</span>`}</td>
        <td>${p.level == null ? '—' : p.level}</td>
        <td>${p.access.ok ? '✓' : `<span ${tip(p.access.why)}>✕</span>`}</td></tr>`
        )
        .join('')}</tbody></table>`
    : '';
  const clubs = `<h4>Clubs</h4>${d.clubs
    .map(
      c =>
        `<div class="dclub">${chip(c)}<b>${esc(c.name)}</b> <span class="small mute">rating ${c.ovr} · ${esc(c.join)}</span>${c.habits ? `<div class="small mute">${esc(Dossier.habitText(c.habits))}</div>` : ''}${
          free
            ? ` <button class="btn ${c.can.ok ? 'hot' : 'lock'}" onclick="joinClub(${c.ti})" ${c.can.ok ? '' : `disabled ${tip('Missing: ' + c.can.why.join(', '))}`}>${c.can.ok ? 'Sign' : esc(joinGap(run, c.ti))}</button>`
            : ''
        }</div>`
    )
    .join('')}`;
  const roster = `<h4>Roster <span class="mute small">${d.roster.length} players</span></h4>${
    d.scouted || d.member ? '' : '<p class="small mute">Scout one of their clubs to see ratings.</p>'
  }<div class="dros small">${d.roster
    .map(
      p =>
        `<span><b><a class="plink" onclick="CW.dossier=null;openPerson('${esc(String(p.id))}')">${esc(p.name)}</a></b> <i class="mute">${p.role}</i> <span class="mute">${esc(p.squad)}</span> ${p.ovr == null ? '<i class="mute">unknown</i>' : `<b>${p.ovr}</b>${p.el ? ` <b style="color:${ECOL[p.el]}">${ENAME[p.el]}</b>` : ''}${p.techs && p.techs.length ? ` <span class="mute">· ${esc(p.techs.join(', '))}</span>` : ''}`}</span>`
    )
    .join('')}</div>`;
  return `<aside class="panel dossier" style="--tc:${d.color}">
    <button class="btn quiet back" onclick="closeDossier()">← All factions <kbd>Esc</kbd></button>
    <h3><span class="chip" style="--tc:${d.color}"></span>${esc(d.name)} <span class="mute small">${d.kind}</span> <span class="stk ${d.state === 'weakened' || d.state === 'pressed' ? 'far' : ''}">${DOSSIER_STATE[d.state]}</span></h3>
    <p class="small mute">${esc(d.desc)}</p>
    <div class="small">${term('standing', v)}${d.member ? ' · <i>you play for them</i>' : ''}</div>
    <div class="rbar" ${tip(GLOSSARY.standing.long)}><i style="${v >= 0 ? `left:50%;width:${v / 2}%` : `left:${50 + v / 2}%;width:${-v / 2}%`}"></i></div>
    ${fronts}${places}${clubs}${roster}
  </aside>`;
}

/** The World sheet (spec §10.4, SheetWorld): tabs Factions (dossier in place) · Clubs · Rankings. */
const WORLD_TABS = { factions: 'Factions', clubs: 'Clubs', rank: 'Rankings' };
function sheetWorld(run) {
  const t = WORLD_TABS[CW.wtab] ? CW.wtab : 'factions',
    body = t === 'clubs' ? clubsCard(run) : t === 'rank' ? rankCard(run) : CW.dossier ? dossierCard(run, CW.dossier) : factionsCard(run);
  return `<div class="sheet-h"><h2>World</h2><div class="seg pfil">${Object.entries(WORLD_TABS)
    .map(([k, n]) => `<button class="btn ${k === t ? 'on' : ''}" onclick="worldTab('${k}')">${n}</button>`)
    .join('')}</div></div><div class="wsheet w-${t}">${body}</div>`;
}
