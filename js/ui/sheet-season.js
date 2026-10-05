// The Season sheet (career-hub.js HUB_SHEETS, spec §10.4 SheetSeason): calendar, cups and sponsors, match history,
// Diary / Gazette — and its handlers (leaveSquad is also used by the People sheet).

/** The season at a glance: cups so far, sponsors, injury. */
function seasonCard(run) {
  if (!run.cups.length && !run.sponsors.length && !run.injury) return ''; // nothing yet: hidden (§10.8)
  return `<div class="panel season"><h3>Cups and sponsors${run.sponsors.length ? '' : info(`Sponsors make offers at ${SPONSOR_AT.map(f => f.toLocaleString()).join(', ')} fans.`)}</h3>
    ${run.cups.map(c => `<div class="small">${esc(CUPS.find(x => x.id === c.id).name)}: <b>${Cup.placeText(c.place)}</b></div>`).join('')}
    ${
      run.sponsors.length
        ? `<div class="small"><b>Sponsors</b> ${run.sponsors
            .map(
              s =>
                `<span class="spn ${s.state}" title="${esc(SPONSORS[s.id].perk)} · ${esc(SPONSORS[s.id].cond)}">${esc(SPONSORS[s.id].name)} <i>${s.state === 'pending' ? 'on trial' : s.state === 'kept' ? 'signed' : 'lost'}</i></span>`
            )
            .join(' ')}</div>`
        : ''
    }
    ${
      run.injury
        ? `<div class="inj"><b>Injured</b> ${run.injury.weeks}w${info('Light training only: ×0.4 gains, half stamina')} <button class="btn" onclick="seePhysio()" ${run.sp < TRAIN_X.physio ? 'disabled' : ''}>Physio (${TRAIN_X.physio} pts)</button></div>`
        : ''
    }</div>`;
}
/** Leave the Academy squad: ask inline (confirm dialogs are blocked in the artifact frame), then withdraw. */
function leaveSquad(sure) {
  if (!sure) {
    const el = $('#leaveac');
    if (el)
      el.innerHTML = `Leave for good? The Academy won't invite you again. <button class="btn hot" onclick="leaveSquad(true)">Yes</button> <button class="btn" onclick="renderCareer()">No</button>`;
    return;
  }
  if (World.leaveAcademy(RUN)) Run.save(RUN);
  renderCareer();
}
/** Season timeline: 28 weeks with matches, camps and the U21 Final Cup. */
function calendar(run) {
  const pips = [],
    cur = Run.cupDef(run);
  for (let w = 1; w <= CAREER.weeks; w++) {
    const k = CALENDAR[w] || 'train',
      lab = k === 'camp' ? 'Camp' : k === 'eval' ? 'Eval' : '',
      skip = run.mode.short && w < 5,
      now = !cur && w === run.week;
    pips.push(
      `<span class="pip ${w < run.week || (cur && w <= run.week) ? 'past' : now ? 'now' : ''} ${k} ${skip ? 'skip' : ''}" title="Week ${w}${lab ? ': ' + lab : ''}">${now ? w : ''}${lab ? `<i>${lab[0]}</i>` : ''}</span>` // week numbers on hover, this week's shown (§10.8)
    );
    const c = CUPS.find(x => x.after === w);
    if (c) {
      const res = run.cups.find(x => x.id === c.id);
      pips.push(
        `<span class="pip cup ${cur && cur.id === c.id ? 'now' : res ? 'past' : ''}" title="${c.name}${res ? ': ' + res.place : ''}">${c.short}</span>`
      );
    }
  }
  return `<div class="cal">${pips.join('')}</div>`; // legend on the Calendar label's hover (§10.8)
}
/** Match history (T-052, Cup.record): newest first, each row a fold with the kick-off snapshot (changes vs your previous match), your line and the box score. */
const MKIND = { eval: 'Evaluation', cup: 'Cup', challenge: 'Challenge', street: 'Street fight', court: 'Court match' };
function matchLog(run) {
  const L = run.mlog || [],
    row = (e, i) => {
      const prev = L[i - 1],
        res = e.played ? `${e.win ? 'W' : 'L'} · ${e.grade}` : 'did not play',
        sum = `W${e.week} · ${MKIND[e.kind] || e.kind}${e.round ? ` (${esc(e.round)})` : ''} · vs ${esc(e.vs)} · ${e.score[0]}-${e.score[1]} · ${res}`,
        stats = [['ovr', 'OVR'], ...[...STATK, 'wit'].map(k => [k, STATNAME[k].slice(0, 3)])]
          .map(
            ([k, n]) =>
              `<span>${n} <b>${e.you[k]}</b> <i class="mute">${prev ? fmtDelta(e.you[k] - prev.you[k], { zero: '' }) : ''}</i></span>`
          )
          .join(' · '),
        ln = e.line,
        side = s =>
          `<tr class="gap"><td colspan="10">${s ? esc(e.short || e.vs) : 'Your side'}</td></tr>${e.box
            .filter(b => b.side === s)
            .map(
              b =>
                `<tr class="${b.you ? 'you' : ''}"><td>${esc(b.name)}</td><td>${b.role}</td><td>${b.ovr}</td><td>${b.k}</td><td>${b.att}</td><td>${b.err}</td><td>${b.blk}</td><td>${b.ace}</td><td>${b.dig}</td><td>${b.ast}</td></tr>`
            )
            .join('')}`,
        body = `<p class="small">${stats}</p>
          ${e.played ? `<p class="small">Line: ${ln.k} kills, ${ln.att} attacks, ${ln.err} errors, ${ln.blk} blocks, ${ln.ace} aces, ${ln.dig} digs, ${ln.ast} assists${e.stake ? ` · stake $${e.stake}` : ''}</p>` : ''}
          <table class="rk ml"><thead><tr class="gap"><td>Name</td><td>Role</td><td>OVR</td><td>Kills</td><td>Attacks</td><td>Errors</td><td>Blocks</td><td>Aces</td><td>Digs</td><td>Assists</td></tr></thead><tbody>${side(0)}${side(1)}</tbody></table>`;
      return fold(`ml${i}`, sum, body);
    };
  return L.length ? `<div class="panel"><h3>Match history</h3>${L.map(row).reverse().join('')}</div>` : ''; // nothing to show yet: hidden (§10.8)
}
/** The Season sheet (spec §10.4, SheetSeason): calendar, goal and sponsors, match history | Diary / Gazette. */
function sheetSeason(run) {
  const t = CW.stab === 'news' ? 'news' : 'diary',
    g = run.gazette;
  if (t === 'news' && g && !g.read && Run.readGazette(run)) Run.save(run);
  return `<div class="sheet-h"><h2>Season</h2></div>
    <div class="sheet-cols seacols"><div class="scol"><section class="card"><div class="lab" ${tip('E evaluation · C camp')}>Calendar</div>${calendar(run)}</section>${seasonCard(run)}${matchLog(run)}</div>
    <section class="card"><div class="seg pfil"><button class="btn ${t === 'diary' ? 'on' : ''}" onclick="CW.stab='diary';renderCareer()">Diary</button><button class="btn ${t === 'news' ? 'on' : ''}" onclick="CW.stab='news';renderCareer()">Gazette${g && !g.read ? ' <em class="badge">!</em>' : ''}</button></div>${
      t === 'news'
        ? g
          ? `<p class="small mute">Week ${g.week}</p><ul class="gzl">${g.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
          : '<p class="mute small">No Gazette yet — it comes out on payday.</p>'
        : diaryList(run)
    }</section></div>`;
}
/** The Diary: the last 5 lines, the rest behind `All ›` (§10.8). */
function diaryList(run) {
  const li = l => logLi(l, `<b>${typeof l.w === 'number' ? 'W' + l.w : esc(l.w)}</b> `);
  return `<ol class="log tagged">${run.log.slice(0, 5).map(li).join('')}</ol>${
    run.log.length > 5
      ? peek(
          'se:diary',
          `All ${run.log.length}`,
          `<div class="lab">Diary</div><ol class="log tagged plog">${run.log.map(li).join('')}</ol>`
        )
      : ''
  }`;
}
