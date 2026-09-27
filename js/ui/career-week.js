// Career hub: your player, the season (goal, sponsors, injury), the week's choices (or event / warm-up / Cup match),
// skills and the diary.

let CW = { hard: false }; // hub UI state: the Hard training toggle

function renderCareer() {
  A = null;
  RUN = RUN || Run.load();
  if (!RUN) return navigate('create');
  if (RUN.result) return renderRunEnd();
  const run = RUN,
    team = Run.myTeam(run),
    wt = Run.weekType(run);
  let main;
  if (run.event) main = eventCard(run);
  else if (wt === 'cup') main = cupPanel(run);
  else if (wt === 'warmup' || wt === 'warmup2') main = warmupPanel(run);
  else main = trainingPanel(run);
  $('#app').innerHTML = `<section class="career" style="--tc:${team.color}">
    <aside>${youCard(run)}${seasonCard(run)}${bondCard(run)}</aside>
    <div class="cmain">
      ${calendar(run)}
      ${main}
      ${skillShop(run)}
      <div class="panel">${fold('diary', `<h3>Diary <span class="mute small">${run.log.length}</span></h3>`, `<ol class="log">${run.log.map(l => `<li><b>${typeof l.w === 'number' ? 'W' + l.w : l.w}</b> ${esc(l.t)}</li>`).join('')}</ol>`)}
        ${run.log[0] ? `<p class="small mute lastlog">${esc(run.log[0].t)}</p>` : ''}</div>
      <p class="small mute" id="abandon"><button class="btn" onclick="abandonRun()" ${tip('Your run saves automatically')}>Abandon run</button></p>
    </div>
  </section>`;
}
function youCard(run) {
  const you = Run.you(run),
    team = Run.myTeam(run),
    mood = MOODS[run.mood],
    staPct = Math.round((run.sta / run.staMax) * 100);
  const gateTag = k => {
    const g = Training.gate(run, k);
    return g < CAREER.runCap ? `<small class="gate ${you[k] >= g ? 'at' : ''}" title="Stops at ${g} until its Limit Break">⌈${g}</small>` : '';
  };
  return `<div class="panel ycard">
    <div class="phd"><span class="portrait">${faceSVG(you, mood.form, 64)}<b>${you.num}</b></span>
      <div><div class="pn">${stag(you)}${esc(you.name)}${you.cap ? ' <span class="capb" title="Team captain">C</span>' : ''}</div>
      <div class="small mute">${you.role} · ${chip(team)}${esc(team.short)} · OVR ${ovr(you)}</div>
      <div class="small ${you.op ? 'opline' : 'mute'}">${
        you.op
          ? 'OP red star'
          : you.star
            ? `★ Star${info(`OP at OVR ${CAREER.op.ovr}, ${STATNAME[KEYSTAT[you.role]]} ${CAREER.op.key}, wit ${CAREER.op.wit}`)}`
            : `Rookie${info(`★ Star at OVR ${CAREER.star.ovr}`)}`
      }</div></div></div>
    <div class="stats">${STATK.map(k => `<span>${STATNAME[k]}${gateTag(k)}</span>${bar(you[k])}`).join('')}
      <span>Wit</span><span class="bar wit"><i style="width:${you.wit * 50}%"></i><b>${you.wit.toFixed(2)}</b></span>
      <span>Leadership</span>${bar(you.lead)}</div>
    <div class="vitals">
      <div><span>Stamina</span><span class="sbar big ${staPct < 50 ? 'low' : ''}"><i style="width:${staPct}%"></i></span><b>${run.sta}/${run.staMax}</b></div>
      <div><span>Mood</span><span class="mood m${run.mood}">${mood.name}</span></div>
      <div><span>Skill points</span><b>${run.sp}</b></div>
      <div><span>Fans</span><b>${run.fans.toLocaleString()}</b></div>
    </div>
    ${elementLine(run)}
    ${you.skills.length ? `<div class="skchips">${you.skills.map(skillChip).join('')}</div>` : ''}
    ${run.pure || run.mode.hard || run.mode.short || run.legend ? `<div class="small mute runtags">${[run.pure ? 'Pure run' : '', run.mode.hard ? 'Hard league' : '', run.mode.short ? 'Short season' : '', run.legend ? `Heir of ${esc(run.legend)}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
  </div>`;
}
/** Your element: hidden (???) until OVR 70, then the three trial steps, then the signature spike. */
function elementLine(run) {
  const you = Run.you(run),
    S = ElTrial.steps(run);
  if (!S.seen) return `<div class="elline locked" ${tip(`Your element reveals itself at OVR ${ElTrial.revealAt}`)}><span class="elb">?</span><b>Element ???</b></div>`;
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
/** The season at a glance: coach's goal, cups so far, sponsors, injury. */
function seasonCard(run) {
  const g = run.goal,
    you = Run.you(run);
  const prog =
    g && g.done == null
      ? g.kind === 'stat'
        ? `${you[g.stat]} / ${g.target}`
        : g.kind === 'fans'
          ? `${run.fans.toLocaleString()} / ${g.target.toLocaleString()}`
          : g.kind === 'bond'
            ? `${you.bond[g.mate] || 0} / ${g.target}`
            : run.warm.some(w => w.week === g.week && w.win)
              ? 'won'
              : 'to play'
      : '';
  return `<div class="panel season"><h3>Season${run.sponsors.length ? '' : info(`Sponsors make offers at ${SPONSOR_AT.map(f => f.toLocaleString()).join(', ')} fans.`)}</h3>
    ${g ? `<div class="goal ${g.done === true ? 'ok' : g.done === false ? 'miss' : ''}"><b>Coach's goal${info(`Reward: +${GOAL_REWARD.sp} skill pts, +${GOAL_REWARD.fans} fans, mood up. Missing it: mood down.`)}</b> ${esc(Goals.text(run, g))} <span class="mute small">by W${g.by}${prog ? ' · ' + prog : ''}${g.done === true ? ' · reached' : g.done === false ? ' · missed' : ''}</span></div>` : ''}
    ${run.cups.map(c => `<div class="small">${esc(CUPS.find(x => x.id === c.id).name)}: <b>${c.place === 'Champion' ? '🏆 Champion' : 'out in the ' + c.place.toLowerCase()}</b></div>`).join('')}
    ${
      run.sponsors.length
        ? `<div class="small"><b>Sponsors</b> ${run.sponsors
            .map(s => `<span class="spn ${s.state}" title="${esc(SPONSORS[s.id].perk)} · ${esc(SPONSORS[s.id].cond)}">${esc(SPONSORS[s.id].name)} <i>${s.state === 'pending' ? 'on trial' : s.state === 'kept' ? 'signed' : 'lost'}</i></span>`)
            .join(' ')}</div>`
        : ''
    }
    ${
      run.injury
        ? `<div class="inj"><b>Injured</b> ${run.injury.weeks}w${info('Light training only: ×0.4 gains, half stamina')} <button class="btn" onclick="seePhysio()" ${run.sp < TRAIN_X.physio ? 'disabled' : ''}>Physio (${TRAIN_X.physio} pts)</button></div>`
        : ''
    }</div>`;
}
function bondCard(run) {
  const you = Run.you(run);
  return `<div class="panel"><h3>Teammates${info('Training together shares your gains and raises their odds of breaking through to ★ star or OP. 60+ bond: two-player combos. 80+: friendship training (+50%).')}</h3>${Run.mates(run)
    .map(m => {
      const b = you.bond[m.id] || 0;
      return `<div class="bond">${faceSVG(m, 0, 30)}<div><b>${stag(m)}${esc(m.name)}</b>${m.cap ? ' <span class="capb">C</span>' : ''} <i class="mute small">${m.role} · OVR ${ovr(m)}</i>
        <span class="bbar ${b >= 80 ? 'f' : b >= 60 ? 'c' : ''}"><i style="width:${b}%"></i></span><small class="mute">Bond ${b}${b >= 80 ? ' · friends' : b >= 60 ? ' · combos' : ''}</small></div></div>`;
    })
    .join('')}</div>`;
}
/** Season timeline: 28 weeks with matches, camps, the coach's goal, and both cups. */
function calendar(run) {
  const pips = [],
    cur = Run.cupDef(run),
    g = run.goal;
  for (let w = 1; w <= CAREER.weeks; w++) {
    const k = CALENDAR[w] || 'train',
      lab = k === 'camp' ? 'Camp' : k.startsWith('warmup') ? 'Match' : '',
      skip = run.mode.short && w < 5,
      now = !cur && w === run.week;
    pips.push(
      `<span class="pip ${w < run.week || (cur && w <= run.week) ? 'past' : now ? 'now' : ''} ${k} ${skip ? 'skip' : ''} ${g && g.by === w && g.done == null ? 'goalw' : ''}" title="Week ${w}${lab ? ': ' + lab : ''}${g && g.by === w ? ' · goal due' : ''}">${lab ? lab[0] : w}</span>`
    );
    const c = CUPS.find(x => x.after === w);
    if (c) {
      const res = run.cups.find(x => x.id === c.id);
      pips.push(`<span class="pip cup ${cur && cur.id === c.id ? 'now' : res ? 'past' : ''}" title="${c.name}${res ? ': ' + res.place : ''}">${c.short}</span>`);
    }
  }
  return `<div class="cal">${pips.join('')}</div>`;
}
function trainingPanel(run) {
  const wt = Run.weekType(run),
    T = Run.myTeam(run),
    hard = CW.hard && !run.injury;
  const btn = key => {
    const pv = Training.preview(run, key, hard),
      fmt = ([k, v]) => (v ? `+${k === 'wit' ? v.toFixed(2) : v} ${STATNAME[k]}` : pv.gate && k === pv.main[0] ? `${STATNAME[k]} at ${pv.gate} — Limit Break` : `${STATNAME[k]} maxed`);
    return `<button class="tbtn ${hard ? 'hard' : ''}" onclick="doWeek('${key}')" ${tip(`Facility Lv ${pv.lvl}${pv.next != null ? ` — ${pv.next} more sessions to Lv ${pv.lvl + 1}` : ' (max)'}. Costs ${pv.sta} stamina${pv.fail ? `, ${Math.round(pv.fail * 100)}% chance to fail` : ''}.`)}>
      <b>${TRAININGS[key].name}</b><small>Lv ${pv.lvl} · −${pv.sta} sta</small>
      <span class="g">${fmt(pv.main)}</span><span class="g2">${fmt(pv.side)}</span>
      ${pv.fail ? `<span class="f ${pv.fail > 0.25 ? 'hi' : 'md'}">${Math.round(pv.fail * 100)}% fail</span>` : ''}
      ${pv.streak ? `<span class="stk" title="Same training in a row">Streak +${Math.round(pv.streak * 100)}%</span>` : ''}
      <span class="fl">${pv.mates.map(id => faceSVG(T.P.find(p => p.id === id), 0.3, 22)).join('')}</span></button>`;
  };
  return `<div class="panel"><div class="thd"><h3>Week ${run.week}/${CAREER.weeks}${wt === 'camp' ? ` · Camp${info('Training camp: gains and stamina cost ×1.5')}` : ''}${run.injury ? ' · injured' : ''}${info(`Facility levels rise with use (Lv 5 max, +10% each). The same training in a row builds a streak (+5% a week, up to +20%; rest and matches don't break it). Stats stop at 80 and 90 until you pass a Limit Break trial. Faces: teammates at that training (+20% each, +50% at bond 80+). Below 50 stamina training can fail — below ${TRAIN_X.injuryAt} it can injure you.`)}</h3>
    <label class="hardt ${run.injury ? 'dis' : ''}" ${tip(`×${TRAIN_X.hard.gain} gains, skill pts ×1.5, ×${TRAIN_X.hard.sta} stamina, +${Math.round(TRAIN_X.hard.fail * 100)}% fail`)}><input type="checkbox" ${hard ? 'checked' : ''} ${run.injury ? 'disabled' : ''} onchange="CW.hard=this.checked;renderCareer()"> <b>Hard</b></label></div>
    <div class="tgrid5">${TRAINK.map(btn).join('')}</div>
    <div class="trow">
      <button class="btn" onclick="doWeek('rest')" ${tip(`+30–60 stamina${run.injury ? ', may heal faster' : ''}`)}>Rest</button>
      <button class="btn" onclick="doWeek('rec')" ${tip('Mood up, +10 stamina')}>Recreation</button>
    </div></div>`;
}
/** Pre-match choices: a focus goal (everyone) and, for Cup matches, the captain's team talk. */
function matchPrep(run, cup) {
  const you = Run.you(run);
  const focus = `<div class="prep"><b>Your focus</b> ${FOCUS[you.role]
    .map(([id, label]) => `<button class="btn ${run.focus === id ? 'on' : ''}" onclick="setFocus('${id}')">${label}</button>`)
    .join('')}${info(`Hit it: +${FOCUS_REWARD.sp} skill pts, +${FOCUS_REWARD.fans} fans`)}</div>`;
  const talk =
    cup && you.cap
      ? `<div class="prep"><b>Captain's team talk</b> ${Object.entries(TALKS)
          .map(([id, t]) => `<button class="btn ${run.talk === id ? 'on' : ''}" onclick="setTalk('${id}')" title="${esc(t.desc)}">${t.name}</button>`)
          .join('')}${info('You are captain — pick one before the match')}</div>`
      : '';
  return focus + talk;
}
function warmupPanel(run) {
  const opp = run.teams[Cup.warmupOpponent(run)];
  return `<div class="panel"><h3>Week ${run.week}: warm-up${info(`Win: +${REWARDS.warmupWin.sp} skill pts, +${REWARDS.warmupWin.fans} fans, +${REWARDS.warmupWin.bond} bond. Loss: +${REWARDS.warmupLoss.sp} skill pts, +${REWARDS.warmupLoss.fans} fans. Each of your kills, blocks and aces adds more.\nGrade (S–C) from your own line: S ×1.5 rewards and mood up, A ×1.2, B ×1, C ×0.8.`)}</h3>
    <p>${chip(Run.myTeam(run))}${esc(Run.myTeam(run).name)} vs ${chip(opp)}<b>${esc(opp.name)}</b> <span class="mute small">${opp.S.name} · rating ${opp.ovr}</span></p>
    ${matchPrep(run, false)}
    <button class="btn hot big" onclick="playCareer('warmup')">Play warm-up</button></div>`;
}
function cupPanel(run) {
  const S = run.cup.sched,
    T = run.teams,
    def = Run.cupDef(run),
    nm = Cup.next(run),
    last = CUPS.indexOf(def) === CUPS.length - 1;
  Run.save(run);
  const slot = x => {
    if (!x) return `<div class="bm empty"><div class="br">—</div><div class="br">—</div></div>`;
    const row = ti =>
      `<div class="br ${x.w === ti ? 'won' : x.w !== null ? 'lost' : ''} ${ti === run.team ? 'mine' : ''}">${chip(T[ti])}<span>${esc(T[ti].name)}</span><b>${x.res ? x.res[ti === x.a ? 0 : 1] : ''}</b></div>`;
    return `<div class="bm ${x === nm ? 'next' : ''}">${row(x.a)}${row(x.b)}</div>`;
  };
  const P = PLACES;
  return `<div class="bracket"><h3 class="bt3">${def.name}${def.seeded ? ' <span class="small mute">seeded</span>' : ''}</h3>
      <div class="bcol"><h4>Quarterfinals</h4>${S.slice(0, 4).map(slot).join('')}</div>
      <div class="bcol"><h4>Semifinals</h4>${slot(S[4])}${slot(S[5])}</div>
      <div class="bcol"><h4>Final</h4>${slot(S[6])}</div></div>
    <div class="panel"><h3>${nm.round}${info(`Win: +${Math.round(REWARDS.cupWin.sp * def.mul)} skill pts, +${Math.round(REWARDS.cupWin.fans * def.mul).toLocaleString()} fans. ${last ? 'A loss ends the season.' : `A loss ends your ${def.name} — the season goes on to the Grand Cup.`}\nPlacement: quarterfinal +${Math.round(P.Quarterfinal.fans * def.mul)} fans · semifinal +${Math.round(P.Semifinal.fans * def.mul)} · runner-up +${Math.round(P.Final.fans * def.mul).toLocaleString()} · champion +${Math.round(P.Champion.fans * def.mul).toLocaleString()}${last ? ` · both cups: +${DOUBLE_CROWN} Legacy points` : ''}.\nGrade (S–C) from your own line: S ×1.5 rewards and mood up, A ×1.2, B ×1, C ×0.8.`)}</h3><p>vs <b>${esc(T[nm.a === run.team ? nm.b : nm.a].name)}</b></p>
      ${matchPrep(run, true)}
    <button class="btn hot big" onclick="playCareer('cup')">Play ${nm.round.toLowerCase()}</button></div>`;
}
function eventCard(run) {
  const e = Events.def(run.event, run),
    fxText = fx =>
      typeof fx === 'string'
        ? fx
        : fx
            .map(([k, v, sub]) =>
              k === 'chance'
                ? `${Math.round(v * 100)}% chance: ${fxText(sub)}`
                : k === 'main'
                  ? `${v > 0 ? '+' : ''}${v} ${STATNAME[run.lastMain]}`
                  : k.startsWith('bond')
                    ? `${v > 0 ? '+' : ''}${v} bond${k === 'bondAll' ? ' with everyone' : ''}`
                    : k === 'mood'
                      ? `mood ${v > 0 ? 'up' : 'down'}`
                      : `${v > 0 ? '+' : ''}${v} ${k === 'sta' ? 'stamina' : k === 'sp' ? 'skill pts' : STATNAME[k] || k}`
            )
            .join(', ');
  const kind = { limit: 'Limit Break', sponsor: 'Sponsor', element: 'Element Trial' }[run.event.id] || 'Event',
    you = Run.you(run);
  return `<div class="panel ev ${run.event.id === 'limit' || run.event.id === 'element' ? 'lbk' : ''}"${run.event.id === 'element' ? ` style="--lbk:${ECOL[you.el]}"` : ''}><span class="evk">${kind}</span><h3>${esc(e.title)}</h3><p>${esc(Events.text(run, run.event, e.text))}</p>
    <div class="evc">${[e.a, e.b].map(([label, fx], i) => `<button class="btn" onclick="chooseEvent(${i})"><b>${esc(label)}</b><small>${esc(fxText(fx))}</small></button>`).join('')}</div></div>`;
}
/** Skills shop in two groups: active techniques (fire in matches) and passive skills (always on). */
function skillShop(run) {
  const you = Run.you(run),
    ids = Skills.forRole(you.role);
  const card = id => {
    const s = SKILLS[id],
      own = you.skills.includes(id),
      byStats = !own && s.tech && hasTech(you, id);
    return `<button class="sk ${own || byStats ? 'own' : ''} ${s.tech ? 'act' : 'pas'}" onclick="learnSkill('${id}')" ${own || byStats || !Skills.canLearn(run, id) ? 'aria-disabled="true"' : ''} ${tip(s.desc)}>${skillIcon(id)}<b>${esc(s.name)}</b><span>${own ? '✓' : byStats ? '✓ stats' : s.cost}</span></button>`;
  };
  const aff = ids.filter(id => !you.skills.includes(id) && Skills.canLearn(run, id)).length;
  return `<div class="panel">${fold(
    'skills',
    `<h3>Skills <span class="pts">${run.sp} pts</span>${aff ? ` <span class="skaff">${aff} affordable</span>` : ''}</h3>`,
    `<p class="small mute">${svgI('active')} Active — fire in matches ${svgI('passive')} Passive — always on${info('Active techniques also switch on by themselves once your stats meet the requirement.')} <a href="#" onclick="navigate('encyclopedia');return false">Encyclopedia</a></p>
    <div class="skills compact">${ids.filter(id => SKILLS[id].tech).map(card).join('')}${ids.filter(id => !SKILLS[id].tech).map(card).join('')}</div>`,
    aff > 0
  )}</div>`;
}
/** A week's choice: training key, 'rest' or 'rec'. Then maybe an event, then the next week. */
function doWeek(choice) {
  const run = RUN;
  if (run.event) return;
  const line = choice === 'rest' ? Training.rest(run) : choice === 'rec' ? Training.recreation(run) : Training.train(run, choice, CW.hard);
  Run.log(run, line);
  if (!Events.roll(run)) Run.endWeek(run);
  else Run.save(run);
  renderCareer();
}
function chooseEvent(i) {
  if (!RUN.event) return;
  const pre = RUN.event.pre; // offers shown before the week's choice don't end the week
  Run.log(RUN, Events.choose(RUN, i));
  if (pre) Run.save(RUN);
  else Run.endWeek(RUN);
  renderCareer();
}
function setFocus(id) {
  RUN.focus = RUN.focus === id ? null : id;
  Run.save(RUN);
  renderCareer();
}
function setTalk(id) {
  RUN.talk = RUN.talk === id ? null : id;
  Run.save(RUN);
  renderCareer();
}
function seePhysio() {
  if (Training.physio(RUN)) renderCareer();
}
function learnSkill(id) {
  if (Skills.learn(RUN, id)) renderCareer();
}
function playCareer(kind) {
  navigate('match', Cup.fixture(RUN, kind));
}
/** Abandon: ask inline (browser confirm dialogs are blocked inside the artifact frame), then clear the run. */
function abandonRun(sure) {
  if (!sure) {
    const el = $('#abandon');
    if (el)
      el.innerHTML = `Abandon this run? It will not count for Legacy points. <button class="btn hot" onclick="abandonRun(true)">Yes, abandon</button> <button class="btn" onclick="renderCareer()">Keep playing</button>`;
    return;
  }
  Run.clear();
  RUN = null;
  navigate('menu');
}
Screens.career = renderCareer;
