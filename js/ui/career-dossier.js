// Career: the faction dossier window — one faction's facilities, fronts, clubs and roster, rendered from Dossier.build.
// Opens in place on the World sheet's Factions tab (from a club HQ panel or a faction name); Esc or ← goes back to the list.
// Also the World sheet's cards: Rankings (rankCard), My club (myClubCard) and Factions (factionsCard); joinGap / joinClub
// serve the club HQ panel, the only place to sign (spec §10.9).

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
    v = d.standing;
  const fronts = d.fronts.length
    ? `<h4>Front</h4><div class="fms">${d.fronts.map(f => `<span class="fm ${f.meter > 0 ? 'up' : f.meter < 0 ? 'dn' : ''}" ${tip(GLOSSARY.seize.long)}>vs ${esc(REGIONS[f.vs].name)} ${fmtDelta(f.meter)}</span>`).join('')}</div>
      ${d.took.length ? `<div class="small">Took: ${d.took.map(id => `${esc(SPOTS[id].name)} <i class="mute">(from ${esc(REGIONS[SPOTS[id].region].name)})</i>`).join(', ')}</div>` : ''}
      ${d.lost.length ? `<div class="small">Lost: ${d.lost.map(id => `${esc(SPOTS[id].name)} <i class="mute">(to ${esc(REGIONS[RUN.own[id]].name)})</i>`).join(', ')}</div>` : ''}
      <div class="small mute">Prices ×${d.priceMul.toFixed(2)} · facilities ×${d.qMul.toFixed(2)}</div>`
    : '';
  const places = d.places.length
    ? `<h4>Facilities</h4><table class="dtab"><thead><tr><th>Place</th><th>Trains</th><th>Price</th><th>Lv</th><th>Entry</th></tr></thead><tbody>${d.places
        .map(
          p => `<tr class="dgo" onclick="CW.dossier=null;hubOpen(null);mapPick('${p.id}')">
        <td>${esc(p.name)}${p.seized ? ` <i class="mute small">seized from ${esc(REGIONS[p.from].name)}</i>` : ''}</td>
        <td>${p.train ? esc(STATNAME[p.train] || p.train) : '—'}</td><td>${p.price ? '$' + p.price : '—'}</td>
        <td>${p.level == null ? '—' : p.level}</td>
        <td>${p.access.ok ? '✓' : `<span ${tip(p.access.why)}>✕</span>`}</td></tr>`
        )
        .join('')}</tbody></table>`
    : '';
  const clubs = `<h4>Clubs</h4>${d.clubs
    .map(
      c =>
        `<div class="dclub">${chip(c)}<b><a href="#" class="dlink" onclick="CW.dossier=null;hubOpen(null);mapPick('hq${c.ti}');return false" ${tip('Their HQ on the map')}>${esc(c.name)}</a></b> <span class="small mute">rating ${c.ovr} · ${esc(c.join)}</span>${c.habits ? `<div class="small mute">${esc(Dossier.habitText(c.habits))}</div>` : ''}</div>`
    )
    .join('')}`;
  const roster = `<h4>Roster <span class="mute small">${d.roster.length} players</span></h4>${
    d.scouted || d.member ? '' : '<p class="small mute">Scout one of their clubs to see ratings.</p>'
  }<div class="dros small">${d.roster
    .map(
      p =>
        `<span><b><a class="plink" onclick="CW.dossier=null;openPerson('${esc(String(p.id))}')">${esc(p.name)}</a></b> <i class="mute">${p.role}</i> <span class="mute">${esc(p.squad)}</span> ${p.ovr == null ? '<i class="mute">unknown</i>' : `<b>${p.ovr}</b>${p.el ? ` <b class="tc" style="--c:${ECOL[p.el]}">${ENAME[p.el]}</b>` : ''}${p.techs && p.techs.length ? ` <span class="mute">· ${esc(p.techs.join(', '))}</span>` : ''}`}</span>`
    )
    .join('')}</div>`;
  return `<aside class="panel dossier" style="--tc:${d.color}">
    <button class="btn quiet back" onclick="closeDossier()">← All factions <kbd>Esc</kbd></button>
    <h3><span class="chip" style="--tc:${d.color}"></span>${esc(d.name)} <span class="mute small">${d.kind}</span> <span class="stk ${d.state === 'weakened' || d.state === 'pressed' ? 'far' : ''}">${DOSSIER_STATE[d.state]}</span></h3>
    <p class="small mute">${esc(d.desc)}</p>
    <div class="small">${term('standing', v)}${d.member ? ' · <i>you play for them</i>' : ''}</div>
    <div class="rbar" ${tip(GLOSSARY.standing.long)}><i style="${v >= 0 ? `--l:50%;--w:${v / 2}%` : `--l:${50 + v / 2}%;--w:${-v / 2}%`}"></i></div>
    ${fronts}${places}${clubs}${roster}
  </aside>`;
}

/** The World sheet (spec §10.4, SheetWorld): tabs Factions (dossier in place) · My club · Rankings. */
const WORLD_TABS = { factions: 'Factions', clubs: 'My club', rank: 'Rankings' }; // key `clubs` kept: worldTab('clubs')
function sheetWorld(run) {
  const t = WORLD_TABS[CW.wtab] ? CW.wtab : 'factions',
    body = t === 'clubs' ? myClubCard(run) : t === 'rank' ? rankCard(run) : CW.dossier ? dossierCard(run, CW.dossier) : factionsCard(run);
  return `<div class="sheet-h"><h2>World</h2><div class="seg pfil">${Object.entries(WORLD_TABS)
    .map(
      ([k, n]) =>
        `<button class="btn ${k === t ? 'on' : ''}" onclick="worldTab('${k}')" ${k === 'factions' ? tip(`Street battles move your standing and the seize count on border tiles.`) : ''}>${n}</button>`
    )
    .join('')}</div></div><div class="wsheet w-${t}">${body}</div>`;
}
/** Rankings (World sheet): tabs for the three lists (Rank.*, js/career/rank.js), top rows then a gap and your own row. */
const RANK_TABS = {
  register: ['Register', 'Academy Register — U21, by rating'],
  gazette: ['Gazette', "The Gazette's Top 20 — the island's finest"],
  street: ['Street', "Who's hot under the overpass"]
};
function rankTab(k) {
  CW.rank = k;
  renderCareer();
}
function rankCard(run) {
  const you = Run.you(run),
    tab = RANK_TABS[CW.rank] ? CW.rank : 'register',
    all = Rank[tab](run),
    rated = r => tab !== 'register' || r.ovr != null,
    list = CW.rankAll ? all : all.filter((r, i) => rated(r) || r.id === you.id),
    n = 5, // the top 5, then you ± 5
    at = list.findIndex(r => r.id === you.id),
    hidden = all.length - list.length,
    row = r => {
      const i = all.indexOf(r);
      return `<tr class="${r.id === you.id ? 'you' : ''}"><td>${i + 1}</td><td>${r.id === you.id ? esc(r.name) : `<a class="plink" onclick="openPerson('${esc(String(r.id))}')">${esc(r.name)}</a>`}</td><td>${r.region ? esc(REGIONS[r.region].name) : 'Academy'} · ${r.role}</td><td>${
        tab === 'register' ? (r.ovr == null ? '<i class="mute">unrated</i>' : r.ovr) : tab === 'gazette' ? Math.round(r.fame) : r.pts
      }</td></tr>`;
    },
    gap = '<tr class="gap"><td colspan="4">…</td></tr>',
    near = at < 0 ? [] : list.slice(Math.max(n, at - 5), at + 6),
    rows = list.slice(0, n).map(row).join('') + (near.length ? (at - 5 > n ? gap : '') + near.map(row).join('') : '');
  return `<div class="panel"><div class="tabs rk">${Object.entries(RANK_TABS)
    .map(([k, [name]]) => `<button class="btn ${k === tab ? 'on' : ''}" onclick="rankTab('${k}')">${name}</button>`)
    .join('')}</div>
    <p class="small mute">${RANK_TABS[tab][1]}</p>
    ${list.length ? `<table class="rk"><tbody>${rows}</tbody></table>` : '<p class="small mute">Nobody on the board yet.</p>'}
    ${hidden || CW.rankAll ? `<button class="btn quiet" onclick="CW.rankAll=!CW.rankAll;renderCareer()">${CW.rankAll ? 'Hide unrated' : `Show unrated (${hidden})`}</button>` : ''}
    ${at < 0 ? `<p class="small mute">You are not on this list${tab === 'street' ? ' — fight, hustle, or take a challenge.' : '.'}</p>` : ''}</div>`;
}
/** The first thing a club still asks of you, as your gap: "OVR 72 · you 41", "$600 · you $200". '' when you can sign. */
function joinGap(run, ti) {
  const you = Run.you(run),
    j = World.joinReq(run, ti),
    key = KEYSTAT[you.role],
    c = World.canJoin(run, ti);
  if (c.ok) return '';
  if (!World.isFree(run)) return 'Already signed';
  if (Run.cupDef(run)) return 'Not during a cup';
  if (j.ovr && ovr(you) < j.ovr) return `OVR ${j.ovr} · you ${ovr(you)}`;
  if (j.key && you[key] < j.key) return `${STATNAME[key]} ${j.key} · you ${you[key]}`;
  if (j.star && !you.star) return 'Needs ★ star';
  if (j.fans && run.fans < j.fans) return `${j.fans.toLocaleString()} fans · you ${run.fans.toLocaleString()}`;
  if (j.fee && run.money < j.fee) return `$${j.fee} · you $${run.money}`;
  return c.why.join(', ');
}
/**
 * World › My club (spec §10.9): a shortcut card. Signed — your club, your role and squad spot, `HQ ›` (its map pin) and
 * `Dossier ›`. Free agent — the clubs that would sign you now as links to their HQ (signing happens only there); none →
 * one line with the nearest gap on hover.
 */
function myClubCard(run) {
  const you = Run.you(run),
    hq = ti => `hubOpen(null);mapPick('hq${ti}')`;
  if (!World.isFree(run)) {
    const t = Run.myTeam(run),
      spot = t.bench && t.bench.includes(you) ? 'bench' : 'starter';
    return `<div class="panel myclub" style="--tc:${t.color}"><h3 class="mct">${chip(t)}${esc(t.name)}<span class="mute small">OVR ${t.ovr}</span></h3>
      <div class="small">${ROLE_NAME[you.role]} · ${spot}</div>
      <div class="acts two"><button class="btn hot" onclick="${hq(run.team)}">HQ ›</button><button class="btn" onclick="openDossier('${FACTIONS[run.team].region}')">Dossier ›</button></div></div>`;
  }
  const open = run.teams.filter(t => World.canJoin(run, t.i).ok);
  if (!open.length) {
    // the nearest club: fewest things missing, then the lowest OVR bar
    const near = [...run.teams].sort(
      (a, b) =>
        World.canJoin(run, a.i).why.length - World.canJoin(run, b.i).why.length ||
        (World.joinReq(run, a.i).ovr || 0) - (World.joinReq(run, b.i).ovr || 0)
    )[0];
    return `<div class="panel myclub"><h3>Free agent</h3><p class="small mute" tabindex="0" ${tip(`${near.name}: ${joinGap(run, near.i)}`)}>Nobody would sign you yet</p></div>`;
  }
  return `<div class="panel myclub"><h3>Free agent</h3><div class="mclist">${open
    .map(
      t =>
        `<a href="#" class="mclub" style="--tc:${t.color}" onclick="${hq(t.i)};return false" ${tip('Their HQ on the map')}>${chip(t)}<b>${esc(t.name)}</b><span class="mute small">OVR ${t.ovr}</span></a>`
    )
    .join('')}</div></div>`;
}
/** Your standing with each faction (region), its clubs, and this week's street battle. */
function factionsCard(run) {
  /** The faction's front in detail (spec §4.27, a peek — §10.8): tiles and value vs the start, the next tile per border, places taken / lost, economy. */
  const front = (r, F) => {
    const T = Hex.grid().tiles,
      held = T.filter(t => Hex.owner(run, t.id) === r).length,
      d = held - T.filter(t => t.region === r).length,
      e = Front.econ(run, r),
      sg = n => (n ? ` <b class="${n > 0 ? 'up' : 'dn'}">${fmtDelta(n)}</b>` : ''),
      E = F.econ;
    return kv([
      ['Tiles', `${held}${sg(d)}`],
      ['Value', `<span ${tip(GLOSSARY.value.long)}>${Hex.worth(run, r)}${sg(e)}</span>`],
      ...F.fronts.map(({ vs }) => {
        const k = Front.stakes(run, r, vs);
        return [
          `Next vs ${esc(REGIONS[vs].name.split(' ')[0])}`,
          k.tile ? `${esc(k.name)}${k.seize && k.place ? `, a win takes ${esc(SPOTS[k.place].name)}` : ''}` : 'no reach'
        ];
      }),
      F.took.length
        ? ['Took', F.took.map(p => `${esc(p.name)} <i class="mute">(${esc(REGIONS[p.from].name.split(' ')[0])})</i>`).join(', ')]
        : null,
      F.lost.length
        ? ['Lost', F.lost.map(p => `${esc(p.name)} <i class="mute">(${esc(REGIONS[p.to].name.split(' ')[0])})</i>`).join(', ')]
        : null,
      E ? ['Prices', `×${E.priceMul.toFixed(2)}`] : null,
      E ? ['Facilities', `×${E.qMul.toFixed(2)}`] : null,
      E && E.joinCut ? ['Clubs ask', `−${E.joinCut} OVR/key, fees −${E.feeCut}%`] : null
    ]);
  };
  const stBar = v =>
    `<div class="rbar" ${tip(`Standing ${fmtDelta(v)}. ${GLOSSARY.standing.long}`)}><i style="${v >= 0 ? `--l:50%;--w:${v / 2}%` : `--l:${50 + v / 2}%;--w:${-v / 2}%`}"></i></div>`;
  const row = r => {
    const F = Dossier.summary(run, r),
      v = F.standing,
      major = MAJORS.includes(r),
      fronts = F.fronts
        .map(({ vs }) => {
          const k = Front.stakes(run, r, vs),
            cur = k.tile ? k.meter - 1 : 0;
          return `<span class="fm2" ${tip(GLOSSARY.seize.long)}>vs ${esc(REGIONS[vs].name.split(' ')[0])} ${k.tile ? `<b class="${cur ? 'up' : ''}">${cur}/${k.cost}</b>` : '<span class="mute">—</span>'}</span>`;
        })
        .join(''),
      clubs = F.clubs.map(ti => run.teams[ti]);
    return `<div class="fac ${v > 0 ? 'up' : v < 0 ? 'dn' : ''}"><div class="fh"><b><a href="#" class="dlink" onclick="openDossier('${r}');return false" ${tip(`${F.kind}. ${F.desc}`)}>${esc(F.name)}</a></b>${F.weak ? ' <span class="stk far">Weakened</span>' : ''}${
      v ? `<span class="fv">${fmtDelta(v)}</span>` : ''
    }</div>
        ${stBar(v)}${fronts ? `<div class="fms">${fronts}</div>` : ''}
        <div class="small fclubs">${clubs.map(t => `<span>${chip(t)}${esc(t.name)}${t.i === run.team ? ' <i class="mute">(yours)</i>' : ''}</span>`).join('')}${
          F.foe
            ? ` <a href="#" class="clashk" onclick="hubOpen(null);mapPick('clash');return false">⚔ vs ${esc(REGIONS[F.foe].name.split(' ')[0])}</a>`
            : ''
        }</div>${major ? `<div class="fdet">${peek(`fx:${r}`, 'Front', front(r, F))}</div>` : ''}</div>`;
  };
  const regs = Object.keys(REGIONS).filter(r => REGIONS[r].kind !== 'none'),
    minors = regs.filter(r => !MAJORS.includes(r));
  return `<div class="panel facs">${regs
    .filter(r => MAJORS.includes(r))
    .map(row)
    .join('')}${
    minors.length
      ? `<div class="fminor">${peek(
          'fx:minor',
          'Minor factions',
          `<div class="lab">Minor factions</div>${kv(
            minors.map(r => {
              const v = Dossier.summary(run, r).standing;
              return [
                `<a href="#" class="dlink" onclick="CW.peek=null;openDossier('${r}');return false">${esc(REGIONS[r].name)}</a>`,
                v ? fmtDelta(v) : '<span class="mute">—</span>',
                v > 0 ? 'up' : v < 0 ? 'dn' : ''
              ];
            })
          )}`
        )}</div>`
      : ''
  }</div>`;
}
function joinClub(ti) {
  if (World.join(RUN, ti)) Run.save(RUN);
  renderCareer();
}
