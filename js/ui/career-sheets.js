// Career hub sheets (career-hub.js HUB_SHEETS): Me (you, element, skills, life, housing) and Season (calendar,
// sponsors, match history, Diary / Gazette), plus their handlers.

/** The Me sheet (spec §10.4, SheetMe): who you are, stats with caps and progress, element, skills, life. */
function sheetMe(run) {
  const you = Run.you(run),
    team = Run.myTeam(run),
    mood = MOODS[run.mood],
    rank = you.op ? 'OP red star' : you.star ? `★ Star — OP at OVR ${CAREER.op.ovr}` : `Rookie — ★ Star at OVR ${CAREER.star.ovr}`,
    statRow = k => {
      const pr = Training.progress(run, k),
        pct = Math.round((pr.have / Math.max(1, pr.need)) * 100);
      return `<div class="mrow" ${tip(`${pct}% of the way to the next point. Training stops at ${TRAIN_CAP}; matches only above.`)}><span>${statI(statKey(k), 20)}${STATNAME[k]}</span><span class="mbars"><i class="mb"><i style="width:${Math.min(100, you[k])}%"></i></i><i class="mp"><i style="width:${pct}%"></i></i></span><span class="mv"><b>${you[k]}</b> <span class="mute">/ ${TRAIN_CAP}</span></span></div>`;
    },
    ids = Skills.forRole(you.role),
    aff = ids.filter(id => !you.skills.includes(id) && Skills.canLearn(run, id)).length,
    // passive skills (§10.8): owned ones, then the 3 closest to affordable; the rest behind `+n more ›`
    skillRow = id => {
      const sk = SKILLS[id],
        own = you.skills.includes(id),
        can = Skills.canLearn(run, id);
      return `<div class="srow rowcta" ${tip(sk.desc)}><span class="nm"><b>${esc(sk.name)}</b></span>${
        own
          ? '<span class="btn on here">Owned</span>'
          : `<button class="btn ${can ? '' : 'lock'}" onclick="learnSkill('${id}')" ${can ? '' : 'disabled'}>${term('sp', String(sk.cost), 'cost')}${can ? ' → learn' : ` · need ${Math.max(0, sk.cost - run.sp)}`}</button>`
      }</div>`;
    },
    pas = ids.filter(id => !SKILLS[id].tech),
    pasOwn = pas.filter(id => you.skills.includes(id)),
    pasNext = pas.filter(id => !you.skills.includes(id)).sort((a, b) => SKILLS[a].cost - SKILLS[b].cost),
    passive = [...pasOwn, ...pasNext.slice(0, 3)].map(skillRow).join(''),
    pasMore = pasNext.slice(3),
    // techniques: yours and those within 10 of every requirement (Wit on its ×50 bar scale); the rest behind `+n ›`
    techGap = id =>
      Math.max(0, ...Object.entries(SKILLS[id].req || {}).map(([k, v]) => (k === 'wit' ? (v - you.wit) * 50 : v - (you[k] || 0)))),
    techRow = id => {
      const sk = SKILLS[id],
        own = you.skills.includes(id) || hasTech(you, id),
        req = Object.entries(sk.req || {})
          .map(([k, v]) => `${k === 'wit' ? 'Wit' : STATNAME[k]} ${v}`)
          .join(', ');
      return `<div class="srow" ${tip(`${sk.desc}\nLearned in matches: by doing it, or by facing a player who has it.`)}><b>${esc(sk.name)}</b>${own ? '<span class="ptag sel">✓ yours</span>' : `<span class="ptag">${esc(req || 'learn in matches')}</span>`}</div>`;
    },
    tch = ids.filter(id => SKILLS[id].tech),
    tchNear = tch.filter(id => you.skills.includes(id) || hasTech(you, id) || techGap(id) <= 10),
    tchMore = tch.filter(id => !tchNear.includes(id)),
    techs = tchNear.map(techRow).join(''),
    next = Math.ceil(run.week / ECON.payEvery) * ECON.payEvery,
    el = ElTrial.steps(run).seen ? '' : `Element at OVR ${ElTrial.revealAt}`;
  return `<div class="sheet-h"><span class="portrait" ${el ? `${tip(el)} tabindex="0"` : ''}>${faceSVG(you, mood.form, 56)}</span><div><h2>${stag(you)}${esc(you.name)}</h2><div class="mute">${ROLE_NAME[you.role]} · ${chip(team)}${esc(team.short)} · <span ${tip(rank)}>OVR ${ovr(you)}</span> · ${egoTag(you)}</div></div></div>
    <div class="sheet-cols mecols">
      <section class="card"><div class="lab" ${tip('Thick bar: the stat. Thin bar: progress to the next point.')}>Stats</div>${STATK.map(statRow).join('')}
        <div class="mrow"><span>${statI('wit', 20)}Wit</span><span class="mbars"><i class="mb"><i style="width:${you.wit * 50}%"></i></i></span><span class="mv"><b>${you.wit.toFixed(2)}</b></span></div>
        <div class="mrow"><span>${statI('led', 20)}Leadership</span><span class="mbars"><i class="mb lead"><i style="width:${you.lead}%"></i></i></span><span class="mv"><b>${you.lead}</b></span></div>
        ${elementLine(run)}
        ${
          run.injury
            ? `<div class="inj"><b>Injured</b> ${run.injury.weeks}w — light training only (×0.4 gains, half stamina) <button class="btn" onclick="seePhysio()" ${run.sp < TRAIN_X.physio ? 'disabled' : ''}>Physio · ${TRAIN_X.physio} pts</button></div>`
            : ''
        }</section>
      <section class="card"><div class="wh"><span class="lab" ${tip('Passive skills: buy with skill points')}>Skills</span><span class="small mute">${aff} affordable</span></div>
        ${passive}${pasMore.length ? peek('me:skills', `+${pasMore.length} more`, `<div class="lab">Skills</div>${pasMore.map(skillRow).join('')}`, 'mmore') : ''}
        <div class="lab sub" ${tip('Learned in matches: by doing it, or by facing a player who has it')}>Techniques</div>${techs || '<p class="small mute">None within reach yet.</p>'}${
          tchMore.length
            ? peek('me:techs', `+${tchMore.length}`, `<div class="lab">Techniques</div>${tchMore.map(techRow).join('')}`, 'mmore')
            : ''
        }</section>
      <section class="card"><div class="lab" ${tip(`Payday every ${ECON.payEvery} weeks: +$${ECON.allowance} allowance, −$${ECON.food} food, −rent. Run out of money and you're evicted to the abandoned gym.`)}>Life · payday W${next}</div>
        <div class="homes">${homeRow(run, run.housing)}</div>${peek('me:homes', 'Change home', `<div class="lab">Homes</div><div class="homes">${HOUSEK.map(k => homeRow(run, k)).join('')}</div>`, 'mmore')}</section>
    </div>`;
}
/** Your element: hidden (???) until OVR 70, then the three trial steps, then the signature spike. */
function elementLine(run) {
  const you = Run.you(run),
    S = ElTrial.steps(run);
  if (!S.seen) return ''; // hidden until revealed (§10.8): the portrait's hover says when
  const c = ECOL[you.el],
    how = `${EDESC[you.el]}.\nGauge: ${EFILL[you.el]} A captain's buff fills it at once.`;
  if (S.on)
    return `<div class="elline on" style="--e:${c}" ${tip(`${how}\n${TWIST[you.sig.tw].name}: ${TWIST[you.sig.tw].desc}.`)}><span class="elb">${ENAME[you.el].split(' ')[0]}</span><b>${esc(you.sig.name)}</b><i>${TWIST[you.sig.tw].name}</i></div>`;
  const st = [
    [S.star, 'Become a ★ star'],
    [S.proof, 'Grade S in a match where your team reaches the zone'],
    [false, `Pass the Element Trial${run.elNext > run.week ? ` (back in week ${run.elNext})` : ''}`]
  ];
  return `<div class="elline" style="--e:${c}" ${tip(`${how}\n\nTo unlock:\n${st.map(([ok, t]) => `${ok ? '✓' : '○'} ${t}`).join('\n')}`)}><span class="elb">${ENAME[you.el].split(' ')[0]}</span><b>${ENAME[you.el].split(' ').slice(1).join(' ')}</b><span class="elsteps">${st.map(([ok]) => `<i class="${ok ? 'ok' : ''}"></i>`).join('')}</span></div>`;
}
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
const MKIND = { eval: 'Evaluation', cup: 'Cup', challenge: 'Challenge', street: 'Street fight' };
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
function seePhysio() {
  if (Training.physio(RUN)) renderCareer();
}
function learnSkill(id) {
  if (Skills.learn(RUN, id)) renderCareer();
}
/** One housing option: rent, rest and what it does to you, then Move in (or "Home" for where you live). */
function homeRow(run, k) {
  const H = HOUSING[k],
    cur = k === run.housing,
    fx = [
      `Rest ×${H.rest}`,
      H.moodPay ? `Mood ${H.moodPay[0] > 0 ? '↑' : '↓'} on payday ${Math.round(H.moodPay[1] * 100)}%` : '',
      H.noise ? `Noise ${Math.round(H.noise * 100)}%` : '',
      H.sick ? `Sick ${Math.round(H.sick * 100)}%` : '',
      H.grit ? `Leadership +${H.grit}` : ''
    ].filter(Boolean),
    bad = t => /↓|Noise|Sick/.test(t);
  return `<div class="home rowcta ${cur ? 'sel' : ''}" ${tip(H.desc)}><div class="nm"><span class="n1">${chip(REGIONS[H.region])}<b>${esc(H.name)}</b> <span class="small">$${H.rent} / payday</span></span>
    <span class="n2 small">${fx.map(t => `<span class="${bad(t) ? 'dn' : t.includes('↑') || t.includes('+') ? 'up' : 'mute'}">${t}</span>`).join(' · ')}</span></div>
    ${cur ? '<span class="btn on here">Home</span>' : `<button class="btn" onclick="setHousing('${k}')" ${run.money < H.rent ? tip(`Rent $${H.rent} on payday · you $${run.money}`) : ''}>Move in</button>`}</div>`;
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
function setHousing(k) {
  if (World.setHousing(RUN, k)) Run.save(RUN);
  renderCareer();
}
