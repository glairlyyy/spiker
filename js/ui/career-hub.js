// Career hub (spec §10.1): top bar (labelled resources, week, sheet tabs Me · People · World · Season, ⚙), the week
// rail on the left (you, the week's days, inbox, End week), the 3D map and the place panel over it.
// Tabs open the sheets (Me, People, World, Season); ⚙ is a small pop-over (Main menu, Debug log with ?dev, Abandon run).
// Cards (events, match days, the week brief/report) open over the map.

/** The top bar's sheet tabs (key 1–4). */
const HUB_TABS = [
  ['me', 'Me'],
  ['people', 'People'],
  ['world', 'World'],
  ['season', 'Season']
];
/** Sheets (spec §10.4): open over the map with the rail and top bar visible; a tab whose sheet exists opens it. */
const HUB_SHEETS = {
  me: ['Me', run => sheetMe(run)],
  people: ['People', run => sheetPeople(run)],
  world: ['World', run => sheetWorld(run)],
  season: ['Season', run => sheetSeason(run)]
};
/** Open the World sheet on one tab (factions / clubs / rank); never toggles. */
function worldTab(k) {
  CW.wtab = k;
  if (k !== 'factions') CW.dossier = null;
  CW.sheet = 'world';
  renderCareer();
}
function hubSheet(run) {
  const [name, body] = HUB_SHEETS[CW.sheet];
  return `<section class="sheet inkwin" role="dialog" aria-label="${name}"><button class="btn x" onclick="hubOpen(null)" aria-label="Close">✕</button><span class="inkover">Sheet · ${HUB_TABS.findIndex(t => t[0] === CW.sheet) + 1}</span>${body(run)}</section>`;
}

function renderCareer() {
  A = null;
  RUN = RUN || Run.load();
  if (!RUN) return navigate('create');
  if (RUN.result) return renderRunEnd();
  const run = RUN,
    team = Run.myTeam(run);
  if (!CW.snap || CW.snap.run !== run || CW.snap.key !== briefKey(run)) CW.snap = weekSnap(run); // the Week report's baseline
  const armed = Date.now() - CW.endArm < 4000; // End week asked once with days left: the button asks again for 4 s
  // a place changed hands since the last render (your battle or the week's end): banner + select it on the map
  const own = run.own || {},
    chg = CW.ownOf === run ? ownChanges(CW.own, own) : [],
    note = chg[0] || null;
  CW.own = { ...own };
  CW.ownOf = run;
  if (note && MapModel.known(run, note.id, City.at(run, note.id))) CW.spot = note.id;
  for (const z of chg) (CW.seizes || (CW.seizes = [])).unshift({ ...z, week: run.week }); // an inbox item for a week
  const nextCup = Run.weekType(run) === 'cup' && !run.event ? Cup.upcoming(run) : null; // rules first, then draw
  if (!Story.step(run) && !CW.lock && !run.event && Story.hub(run)) Run.save(run); // the last match's scene, else a lesson whose moment has come (§10.10)
  const scene = !!Story.step(run), // a story scene plays: the dialogue box has the screen (spec §10.10)
    card = scene ? null : hubCard(run, nextCup);
  if (CW.railMini == null) CW.railMini = store.get(KEYS.rail) === '1'; // remembered per browser
  const was = motionBefore(); // what the last render showed: surfaces that open, close or change move once (spec §9.12)
  $('#app').innerHTML =
    `<section class="career hub ${City.night(run) ? 'eve' : ''} ${CW.railMini ? 'railmini' : ''} ${scene ? 'cine' : ''} ${CW.sheet ? 'sheeton' : ''}" style="--tc:${team.color}">
    ${topBar(run)}${CW.railMini ? railStrip(run, armed) : weekRail(run, armed)}
    <div class="mapwrap" id="mapwrap"></div><button class="btn mapme" onclick="MapView.centre()" aria-label="Centre the map on you (C)">◎ Me <kbd>C</kbd></button>${walkSpeed()}
    <div class="hud spotcard inkwin ink-thru ink-lite ${CW.spot && !card ? 'open' : ''}" id="spot" role="dialog" aria-label="Place">${CW.spot && !card ? spotCard(run) : ''}</div>
    ${CW.sheet ? hubSheet(run) : ''}
    ${card ? `<div class="hubmodal ${card.dim ? 'dim' : ''}"><div class="hubcard inkwin ink-hold ${card.dim ? '' : 'ink-thru ink-lite'} ${card.cls || ''}" role="dialog">${card.html}</div></div>` : ''}
    ${lockLayer()}${storyBox(run)}
  </section>`;
  mapMount(run);
  storyMounted(run);
  motionAfter(was, card);
}
/** The hub's motion state before a render: the surfaces it showed, their nodes (for exits), rows and slots. */
function motionBefore() {
  const hub = document.querySelector('#app > .hub'),
    q = s => hub && hub.querySelector(s);
  return hub
    ? {
        hub,
        spot: q('#spot.open'),
        sheet: q(':scope > .sheet'),
        modal: q(':scope > .hubmodal'),
        lock: q('#actlock'),
        story: q('#sbox'),
        rows: new Set([...hub.querySelectorAll('.winbox .wit')].map(e => e.textContent)),
        slots: [...hub.querySelectorAll('#wdays .dslot')].map(e =>
          e.classList.contains('done') ? 'done' : e.classList.contains('ghost') ? 'ghost' : 'free'
        ),
        flip: Motion.flipFirst(hub),
        mv: CW.mv || {}
      }
    : null;
}
/** …and after it: one class per surface that just opened (`in`), changed (`swap`) or closed (a leaving copy). */
function motionAfter(was, card) {
  const hub = document.querySelector('#app > .hub');
  if (!hub) return;
  const q = s => hub.querySelector(s),
    lk = CW.lock,
    now = {
      spot: q('#spot.open') ? CW.spot : null,
      sheet: CW.sheet || null,
      sub: CW.sheet ? [CW.sheet, CW.wtab, CW.dossier, CW.person, CW.stab, CW.rank, CW.rankAll].join('|') : null,
      card: card ? card.key || card.html.length : null,
      rail: !!CW.railMini,
      lock: lk ? lk.phase : null,
      story: !!q('#sbox')
    };
  CW.mv = now;
  if (!was) return; // (reduced motion: the css turns these classes into short fades; leave / tick / flip check it)
  const o = was.mv,
    on = (sel, cls) => q(sel) && q(sel).classList.add(cls);
  // place popup: same pin → keep its place (no jump to the corner until it is placed again); new pin → glide + cross-fade
  const sp = q('#spot.open');
  if (sp && was.spot && was.spot.classList.contains('pinned')) {
    sp.style.left = was.spot.style.left;
    sp.style.top = was.spot.style.top;
    sp.style.right = 'auto';
    sp.classList.add('pinned');
  }
  if (now.spot && !o.spot) Motion.play(sp, 'in');
  else if (now.spot && o.spot !== now.spot) spotSwap(sp);
  else if (!now.spot && o.spot && was.spot) Motion.leave(was.spot, hub);
  // sheets: open drops from the top bar, another tab / sub-view cross-fades, close leaves
  if (now.sheet && !o.sheet) on(':scope > .sheet', 'in');
  else if (now.sheet && o.sub !== now.sub) on(':scope > .sheet', 'swap');
  else if (!now.sheet && o.sheet && was.sheet) Motion.leave(was.sheet, hub);
  // cards over the map: open rises, card → card cross-fades, close leaves
  if (now.card && !o.card) on(':scope > .hubmodal', 'in');
  else if (now.card && o.card !== now.card) on(':scope > .hubmodal', 'swap');
  else if (!now.card && o.card && was.modal) Motion.leave(was.modal, hub);
  if (now.rail !== o.rail && o.rail != null) on('.wrail', now.rail ? 'fold' : 'unfold');
  if (now.lock && now.lock !== o.lock) on('#actlock', 'in');
  else if (!now.lock && o.lock && was.lock) Motion.leave(was.lock, hub);
  if (now.story && !o.story) on('#sbox', 'in');
  // values: new inbox rows slide in (max 3), a spent day fills, a new week empties the track right → left
  [...hub.querySelectorAll('.winbox .wit')]
    .filter(e => !was.rows.has(e.textContent))
    .slice(0, 3)
    .forEach(e => e.classList.add('new'));
  dayMotion(hub, was.slots);
  for (const e of hub.querySelectorAll('.tbar .tk'))
    Motion.tick(e, +e.dataset.from, +e.dataset.to, v =>
      e.dataset.k === 'money' ? `$${v.toLocaleString()}` : e.dataset.k === 'fans' ? v.toLocaleString() : String(v)
    );
  Motion.flip(was.flip, hub);
}
/** Day track: newly spent days fill, newly shown ghost days fade in, a week reset clears the 7 slots right → left. */
function dayMotion(root, old) {
  const slots = [...root.querySelectorAll('#wdays .dslot')];
  if (!old || !old.length || old.length !== slots.length || Motion.reduced) return;
  const doneNow = slots.filter(e => e.classList.contains('done')).length;
  if (!doneNow && old.includes('done')) return slots.forEach(e => e.classList.add('clear'));
  slots.forEach((e, i) => {
    if (e.classList.contains('done') && old[i] !== 'done') e.classList.add('fillin');
    else if (e.classList.contains('ghost') && old[i] !== 'ghost') e.classList.add('gin');
  });
}

/** A card over the map, if the week needs one: an event, a match day, or an unread Gazette. */
function hubCard(run, nextCup) {
  const wt = Run.weekType(run);
  // key: which card it is (motion: a new key cross-fades, the same key re-renders quietly)
  if (run.event) return { html: eventCard(run), dim: true, key: `event:${run.week}:${run.event.id || run.event.k || ''}` }; // the only blocking card
  if (CW.recap) return { html: recapCard(run), dim: true, key: `recap:${run.week}` }; // last week's report first
  if (CW.briefWeek !== briefKey(run)) return { html: weekBrief(run), dim: true, key: `brief:${briefKey(run)}` };
  if (wt === 'cup') return { html: cupPanel(run, nextCup), cls: 'wide', key: `cup:${briefKey(run)}` };
  if (wt === 'eval') return { html: evalPanel(run, World.isFree(run) ? hubClubsHint() : ''), key: `eval:${run.week}` };
  if (City.night(run) && Run.canEndWeek(run) && !CW.lock && CW.nightAsk !== run.week)
    return { html: nightCard(), dim: true, key: `night:${run.week}` };
  return null;
}
/** One Week brief per week (and per cup round). */
const briefKey = run => `${run.week}:${(Run.cupDef(run) || {}).id || ''}`;
/** The Week brief (spec §10.5): what this week holds — battle, payday, match — and how to start it. Never acts. */
function weekBrief(run) {
  const wt = Run.weekType(run),
    match = wt === 'cup' || wt === 'eval',
    rows = [],
    // title + one value; the facts (§10.1a) in a peek
    row = (ico, title, tag, facts, cls = '', id = '') =>
      rows.push(
        `<div class="bi"><span class="bico ${cls}">${ico}</span><b>${title}</b><span class="btag ${cls}">${tag}</span>${facts ? peek(`br:${id}`, '', kv(facts), 'bpk') : '<span></span>'}</div>`
      );
  if (wt === 'eval') {
    const e = run.eval || Eval.setup(run),
      rt = e.kind === 'rematch' && Stars.get(run, 'rival').team;
    row(
      '⚑',
      rt ? 'The rematch' : `${esc(e.kind === 'academy' ? 'Academy' : REGIONS[e.region].name)} evaluation`,
      'this week',
      [
        ['Opponent', rt ? `${esc(rt.name)} — she starts` : `${esc(REGIONS[e.region].name)} squad`],
        City.venue(run) ? ['Venue', esc(VENUES[City.venue(run)].name)] : null
      ],
      '',
      'eval'
    );
  } else if (wt === 'cup') row('⚑', esc((Run.cupDef(run) || {}).name || 'Cup'), 'this week', null, 'hot');
  const c = Fight.clashSite(run);
  if (c && !run.clash.done) {
    const att = run.clash.att || c.a,
      def = att === c.a ? c.b : c.a;
    row(
      '⚔',
      `${chip(REGIONS[att])}${esc(REGIONS[att].name.split(' ')[0])} raid ${chip(REGIONS[def])}${esc(REGIONS[def].name.split(' ')[0])}`,
      'battle',
      [
        ['Where', esc(c.name)],
        ['Border', clashBorder(run, att, def)],
        ['If nobody joins', "Settled at the week's end"]
      ],
      'warn',
      'battle'
    );
  }
  if (run.gazette && !run.gazette.read) {
    const pay = run.log.find(l => /^Payday:/.test(l.t));
    row('☰', 'Payday', 'Gazette out', pay ? [['Paid', esc(pay.t.replace(/^Payday: /, ''))]] : null, '', 'pay');
  }
  if (!match && Season.cal(run, run.week + 1) === 'eval') {
    const ev = evalNext(run);
    row('⚑', 'Evaluation', 'next week', Array.isArray(ev) ? ev : [['Note', ev]], '', 'evaln');
  }
  const title = { train: 'Training week', camp: 'Training camp', eval: 'Evaluation week', cup: 'Cup week' }[wt] || 'This week',
    line = match
      ? `The match is at ${City.hhmm(DAY.match)} — the morning is yours; be at the venue by then.`
      : `${WEEK_DAYS} days of 24 hours. Every action takes hours, the walk there too; sleep ends the day.`;
  return `<div class="panel brief"><div class="lab">${run.mode.story ? `Year ${Season.year(run)} · ` : ''}Week ${Math.min(run.week, CAREER.weeks)} / ${CAREER.weeks}</div><h2 ${tip(line)}>${title}</h2>
    ${rows.join('') || '<p class="small mute">A quiet week.</p>'}
    <div class="acts ${run.gazette && !run.gazette.read ? 'pri' : ''}"><button class="btn hot" onclick="briefDone()">${match ? 'Go to match prep' : 'Start the week'}</button>${
      run.gazette && !run.gazette.read ? '<button class="btn" onclick="briefDone(\'news\')">Read the Gazette</button>' : ''
    }</div></div>`;
}
/** Close the brief (the battle stays on the map and in the inbox); `open` = a sheet to open next. */
function briefDone(open) {
  CW.briefWeek = briefKey(RUN);
  if (RUN.clash && !RUN.clash.seen) {
    RUN.clash.seen = true; // the old battle intro's flag: the brief told you
    Run.save(RUN);
  }
  if (open) return hubOpen(open);
  renderCareer();
}
const hubClubsHint = () =>
  `<p class="small mute">Free agent — <a href="#" onclick="worldTab('clubs');return false">find a club</a> first to play with them.</p>`;

/** Top bar: brand, week, labelled resources (one-render deltas), the sheet tabs and ⚙. */
function topBar(real) {
  const run = lockShown(real), // while a training cut-in runs, the values from before it (the reveal is the card's)
    staPct = Math.round((run.sta / run.staMax) * 100),
    mood = MOODS[run.mood],
    now = { money: run.money, fans: run.fans, sp: run.sp, sta: run.sta, mood: run.mood },
    prev = CW.hudOf === real ? CW.hudPrev : null,
    d = k => {
      const v = prev ? now[k] - prev[k] : 0;
      if (!v) return '';
      const n = k === 'mood' ? (v > 0 ? '↑' : '↓') : fmtDelta(v, { pre: k === 'money' ? '$' : '', loc: true });
      return ` <em class="hd ${v > 0 ? 'up' : 'dn'}">${n}</em>`;
    },
    // a number that changed since the last render counts up to its new value (spec §9.12; motionAfter runs the tick)
    num = (k, txt) =>
      prev && prev[k] !== now[k] ? `<span class="tk" data-k="${k}" data-from="${prev[k]}" data-to="${now[k]}">${txt}</span>` : txt,
    cell = (label, val, t, id) =>
      `<div class="tres" ${tip(id ? GLOSSARY[id].long : t)}><small>${id ? statI(statKey(id), 14) : ''}${label}</small><b>${val}</b></div>`,
    cup = Run.cupDef(run),
    people = Asks.count(run);
  CW.hudPrev = now; // deltas show for one render after a change
  CW.hudOf = real;
  return `<header class="tbar">
    <span class="tbrand">Spite &amp; Spike</span>
    <div class="tres-row">
      ${cell('Week', `<span class="disp">${run.mode.story ? `Y${Season.year(run)} · ` : ''}${cup ? esc(cup.short) : `${real.week} / ${CAREER.weeks}`}</span>`, `${run.mode.story ? `Year ${Season.year(run)} of ${SEASON.years}, w` : 'W'}eek ${real.week} of ${CAREER.weeks}`)}
      ${cell('Money', `${num('money', `$${run.money.toLocaleString()}`)}${d('money')}`, 'Money', 'money')}
      ${cell('Fans', `${num('fans', run.fans.toLocaleString())}${d('fans')}`, 'Fans', 'fans')}
      ${cell('Skill pts', `${num('sp', run.sp)}${d('sp')}`, 'Skill points', 'sp')}
      ${cell('Stamina', `<span class="sbar ${staPct < 50 ? 'low' : ''}"><i ${prev && prev.sta !== run.sta ? `class="mv" style="--w:${staPct}%;--w0:${Math.round((prev.sta / run.staMax) * 100)}%"` : `style="--w:${staPct}%"`}></i></span><span class="${staPct < 50 ? 'warn' : ''}">${run.sta}</span>${d('sta')}`, `Stamina ${run.sta}/${run.staMax}`, 'sta')}
      ${cell('Mood', `<span class="mood m${run.mood}">${mood.name}</span>${d('mood')}`, 'Mood', 'mood')}
    </div>
    ${squadStrip(real)}
    <nav class="ttabs" aria-label="Sheets">${HUB_TABS.map(
      ([k, n], i) =>
        `<button class="btn ${CW.sheet === k ? 'on' : ''}" onclick="hubOpen('${k}')">${n} <kbd>${i + 1}</kbd>${k === 'people' && people ? `<em class="badge">${people}</em>` : ''}</button>`
    ).join(
      ''
    )}<button class="btn ${CW.gear ? 'on' : ''}" onclick="gearToggle()" aria-label="Settings">⚙</button></nav>${CW.gear ? gearPop() : ''}
  </header>`;
}
/**
 * The squad strip (spec §4.36 1): your circle's faces (Circle.of — starred first), each with its bond bar and how they are this
 * week; a current teammate's face is ringed in the club colour. A click opens their card on the People sheet.
 */
function squadStrip(run) {
  const ids = Circle.of(run);
  if (!ids.length) return '';
  const MOOD = { hurt: ['✚', 'Injured'], tired: ['z', 'Tired'], out: ['–', 'Out of the squad'], fine: ['', ''] };
  return `<nav class="tcircle" aria-label="Your circle">${ids
    .map(id => {
      const p = People.find(run, id),
        b = Rel.bondOf(run, id),
        mate = Circle.mate(run, id),
        [ico, mood] = MOOD[Circle.mood(run, id)],
        club = mate ? 'Teammate' : p.team ? p.team.name : 'No club',
        star = (run.fav || []).map(String).includes(id) ? '★ ' : '';
      return `<button class="tcm ${mate ? 'mate' : ''}" ${mate ? `style="--tc:${p.team.color}"` : ''} onclick="openPerson('${esc(id)}')" ${tip(`${star}${p.name} · ${club} · bond ${b}${mood ? ` · ${mood}` : ''}`)} aria-label="${esc(p.name)}">${faceSVG(p, mate ? Run.form(run, p) : 0, 28)}${star ? '<em class="tpin" aria-hidden="true">★</em>' : ''}${ico ? `<em class="tmd ${Circle.mood(run, id)}">${ico}</em>` : ''}<i class="bbar ${b >= 80 ? 'f' : b >= 60 ? 'c' : ''}"><i style="--w:${b}%"></i></i></button>`;
    })
    .join('')}</nav>`;
}
/** The week rail: you and your 4 stats, the week's days, the inbox, End week. */
function weekRail(run, armed) {
  const you = Run.you(run),
    team = Run.myTeam(run),
    wt = Run.weekType(run),
    days = City.days(run),
    match = wt === 'cup' || wt === 'eval',
    eve = !match && days <= 0;
  return `<aside class="wrail" aria-label="This week">
    <div class="wtop"><button class="wme" onclick="hubOpen('me')" aria-label="Your player"><span class="portrait ${Feel.fired(run) ? 'fired' : ''}">${faceSVG(you, MOODS[run.mood].form, 44)}</span>
      <span><b>${stag(you)}${esc(you.name)}</b><small ${tip(`${ROLE_NAME[you.role]} · ${team.name}`)}>${you.role} · OVR ${ovr(you)}</small></span></button>
      <button class="btn wfold" onclick="railToggle()" aria-label="Collapse the week rail ([)">« <kbd>[</kbd></button></div>
    <div class="wstats">${STATK.map(k => {
      const v = (lockShown(run).st || you)[k];
      return `<span ${tip(`${STATNAME[k]}: ${GLOSSARY[k].long}`)} aria-label="${STATNAME[k]} ${v}"><b>${statI(statKey(k), 16)}${v}</b><i class="mbar4"><i style="--w:${Math.min(100, v)}%"></i></i></span>`;
    }).join('')}</div>
    ${weekSection(run)}
    <section class="winbox" aria-label="Inbox">${inboxRows(run)}</section>
    ${
      !match && !run.event
        ? `<div class="acts wend"><button class="btn ${eve ? 'hot' : ''} endw" onclick="mapEndWeek()" ${endTip(days, eve)}>${
            armed ? `Skip ${days} day${days > 1 ? 's' : ''}? Click again` : `End week${days > 0 ? ` · ${days} left` : ''}`
          } <kbd>N</kbd></button></div>`
        : ''
    }
  </aside>`;
}
const endTip = (days, eve) => tip(eve ? 'Start the next week' : `Skip the ${days} day${days > 1 ? 's' : ''} left (today included)`);
/**
 * The folded rail (spec §10.1, 72px): face (→ Me), days left, the 7 day cells stacked, inbox with
 * its count (→ unfolds the rail), End week (same two-click arm and Space). Nothing in the rail is out of reach.
 */
function railStrip(run, armed) {
  const you = Run.you(run),
    wt = Run.weekType(run),
    days = City.days(run),
    match = wt === 'cup' || wt === 'eval',
    eve = !match && days <= 0,
    n = inboxItems(run).length,
    cells = weekCells(run)
      .map(
        ([e, cls]) =>
          `<div class="dslot ${cls} ${e ? e.k : ''}" ${e && (e.at || e.label) ? tip(e.at || e.label) : ''}>${e ? `<i>${DAY_ICON[e.k] || '•'}</i>` : ''}</div>`
      )
      .join('');
  return `<aside class="wrail mini" aria-label="This week">
    <button class="btn wfold" onclick="railToggle()" aria-label="Expand the week rail ([)">» <kbd>[</kbd></button>
    <button class="wme" onclick="hubOpen('me')" aria-label="Your player" ${tip(you.name)}><span class="portrait ${Feel.fired(run) ? 'fired' : ''}">${faceSVG(you, MOODS[run.mood].form, 40)}</span></button>
    <div class="wleft" ${tip(`${WEEKDAYS[Math.min(WEEK_DAYS, City.clock(run).day) - 1]} ${City.hhmm(City.hour(run))} · ${days} day${days === 1 ? '' : 's'} left`)}><b>${City.hhmm(City.hour(run))}</b><small>${match ? '⚑ match' : `${days} left`}</small></div>
    <div class="wdays">${cells}</div>
    <button class="wicon" onclick="railToggle()" aria-label="Inbox: ${n} waiting" ${tip(`Inbox · ${n} waiting`)}>✉${n ? `<em class="badge">${n}</em>` : ''}</button>
    ${
      !match && !run.event
        ? `<button class="btn ${eve ? 'hot' : ''} endw wicon" onclick="mapEndWeek()" aria-label="End week (N)" ${endTip(days, eve)}>${armed ? 'Skip?' : '☾'}<kbd>N</kbd></button>`
        : ''
    }
  </aside>`;
}
/** Fold / unfold the week rail (« / », key `[`); the map resizes into the space (MapView keeps its one canvas). */
/**
 * The map's clock (spec §4.43): the island's time, and the time speed top right (usable while you walk, above the walk lock) —
 * Pause / Play (Space) and ×1 / ×2 / ×4 (the old walk speeds) — with the match's quiet chip an hour before you must leave for it.
 */
function walkSpeed() {
  const k = MapView.walkK(),
    P = MapView.CLK.paused;
  return `<div class="mapclock" id="mapclock" role="timer" ${tip('The time on the island: it runs while you are on the map — walking takes its time; a session or a sleep fast-forwards')}>${WEEKDAYS[Math.min(WEEK_DAYS, City.clock(RUN).day) - 1]} ${City.hhmm(City.hour(RUN))}</div><div class="mapwalk" role="group" aria-label="Time speed">${matchChip(RUN)}<button class="btn tpause ${P ? 'on' : ''}" id="tpause" aria-pressed="${P}" onclick="MapView.pause()" aria-label="${P ? 'Run the clock' : 'Pause the clock'} (Space)">${P ? 'Play' : 'Pause'}<kbd>Space</kbd></button>${MapView.WALKS.map(
    n => `<button class="btn tsp ${n === k ? 'on' : ''}" aria-pressed="${n === k}" onclick="walkSet(${n}, this)">×${n}</button>`
  ).join('')}</div>`;
}
function walkSet(k, b) {
  MapView.setWalk(k);
  for (const x of b.parentNode.querySelectorAll('.btn.tsp')) {
    const on = x === b;
    x.classList.toggle('on', on);
    x.setAttribute('aria-pressed', on);
  }
  clockShow();
}
/** The pause button follows the clock (Space, a speed pick). */
function clockShow() {
  const b = document.getElementById('tpause'),
    P = MapView.CLK.paused;
  if (!b) return;
  b.classList.toggle('on', P);
  b.setAttribute('aria-pressed', P);
  b.setAttribute('aria-label', `${P ? 'Run the clock' : 'Pause the clock'} (Space)`);
  b.firstChild.textContent = P ? 'Play' : 'Pause';
}
/**
 * The match you are made to play (spec §4.43): a quiet chip from CLOCK.warn hours before you must set off (City.leaveBy) — "Match
 * 13:00 · leave by 12:10"; at that hour the clock waits for you ("· the clock waits"). Never a suggestion. '' before then / none.
 */
function matchChip(run) {
  const by = run && !City.night(run) ? City.leaveBy(run) : null;
  if (by === null || City.hour(run) < by - CLOCK.warn) return '';
  const held = City.hour(run) >= by - 1e-6;
  return `<span class="tchip ${held ? 'held' : ''}" id="tchip" ${tip(`A match you are made to play starts at ${City.hhmm(DAY.match)}; the walk there counts`)}>⚑ Match ${City.hhmm(DAY.match)} · ${held ? 'the clock waits' : `leave by ${City.hhmm(by)}`}</span>`;
}
/**
 * The running clock moved on (MapView.tick, every CLOCK.save game hours; a WASD stop): the rail's today, the open card's hours, the
 * match chip — when the page is idle, each patched in place (only the text / attributes that changed: no rebuild, spec §4.39 pacing).
 */
function clockRefresh() {
  idleDo('clock:week', () => {
    const run = RUN,
      wk = run && document.querySelector('.career.hub .wweek');
    if (wk) patchOuter(wk, weekSection(run));
    const g = run && document.querySelector('.hub .mapwalk');
    if (g) {
      const c = document.getElementById('tchip'),
        html = matchChip(run);
      if (c && !html) c.remove();
      else if (c && c.outerHTML !== html) patchOuter(c, html);
      else if (!c && html) g.insertAdjacentHTML('afterbegin', html);
    }
  });
  idleDo('clock:spot', () => {
    const el = RUN && document.querySelector('.career.hub #spot');
    if (el && CW.spot && el.classList.contains('open') && !el.matches(':hover') && !CW.lock) {
      patchHTML(el, spotCard(RUN));
      spotPlace(true);
    }
  });
}
function railToggle() {
  CW.railMini = !CW.railMini;
  store.set(KEYS.rail, CW.railMini ? '1' : '0');
  renderCareer();
}
/** "Today · Tue 14:00", days left, today's 24 h strip and the week's 7 days (spec §4.41, §10.2). */
function weekSection(run) {
  const wt = Run.weekType(run),
    days = City.days(run),
    match = wt === 'cup' || wt === 'eval',
    kind = { train: 'training', camp: 'training camp', eval: 'evaluation', cup: 'cup' }[wt] || wt,
    d = Math.min(WEEK_DAYS, City.clock(run).day) - 1;
  return `<section class="wweek"><div class="wh"><span class="lab" ${tip(`This week: ${kind}`)}>${City.night(run) ? 'This week' : `Today · ${WEEKDAYS[d]}`}</span><span class="small mute">${
    City.night(run) ? 'spent' : `<b class="wnow">${City.hhmm(City.hour(run))}</b> · ${days} day${days === 1 ? '' : 's'} left`
  }</span></div>
      ${City.night(run) ? '' : dayStrip(run, match)}${dayTrack(run)}</section>`;
}
/** Icons of the day-track entries (line icons come with T-111). */
const DAY_ICON = { train: '✸', rest: '☾', sleep: '☾', outing: '◐', trip: '↗', scout: '◉', battle: '⚔', challenge: '⚔', day: '•' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Today's strip spans 02:00 → 02:00 (DAY.late: the day's last hour); hour marks every 6 h. */
const STRIP = { from: DAY.late - 24, to: DAY.late, marks: [6, 12, 18, 24] };
/**
 * Today's 24 h strip (spec §4.41): what you did hour by hour (today's log: walks hatched, the sleep dim), the hour now, the
 * selected place's walk and hours as dashed ghost blocks from now, a match week's 13:00 match, and the 02:00 edge.
 */
function dayStrip(run, match) {
  const S = STRIP,
    pct = h => `${(((clamp(h, S.from, S.to) - S.from) / (S.to - S.from)) * 100).toFixed(2)}%`,
    wid = (a, h) => `${(((clamp(a + h, S.from, S.to) - clamp(a, S.from, S.to)) / (S.to - S.from)) * 100).toFixed(2)}%`,
    now = City.hour(run),
    blk = (b, cls) => {
      const t = `${City.hhmm(b.from)}–${City.hhmm(b.from + b.h)} · ${[b.label, b.at].filter(Boolean).join(' · ')}${cls === 'ghost' ? ' (if you go)' : ''}`;
      return `<i class="db ${cls} ${esc(b.k)}" style="left:${pct(b.from)};width:${wid(b.from, b.h)}" ${tip(t)} aria-label="${esc(t)}"></i>`;
    },
    log = City.clock(run).log.filter(b => b.from + b.h > S.from),
    ghost = [];
  let at = now;
  for (const g of spotGhost(run, CW.spot)) {
    ghost.push({ ...g, from: at });
    at += g.h;
  }
  const late = ghost.length && at > S.to && ghost[ghost.length - 1].k !== 'sleep', // (a sleep is never a nod-off)
    mt = match ? City.matchAt(run) : null;
  return `<div class="dstrip" id="dstrip" role="img" aria-label="Today, ${City.hhmm(now)}">${S.marks
    .map(h => `<span class="dmk" style="left:${pct(h)}">${String(h % 24).padStart(2, '0')}</span>`)
    .join(
      ''
    )}${mt ? `<i class="db match" style="left:${pct(DAY.match)};width:${wid(DAY.match, DAY.matchH)}" ${tip(`${City.hhmm(DAY.match)} · ${esc(mt.name)}: the match`)}></i>` : ''}${log
    .map(b => blk(b, 'done'))
    .join('')}${ghost.map(b => blk(b, 'ghost')).join('')}<i class="dnow" style="left:${pct(now)}" aria-hidden="true"></i></div>${
    late ? `<p class="small dlate">Past 02:00 — you nod off where you are (4 h, mood down)</p>` : ''
  }`;
}
/** The day track (spec §10.2): what each slept-through day was, today, the days to come. */
function dayTrack(run) {
  const cells = weekCells(run);
  return `<div class="wdn">${WEEKDAYS.map(d => `<span ${tip(d)}>${d[0]}</span>`).join('')}</div><div class="wdays" id="wdays">${cells
    .map(([e, cls], i) =>
      e
        ? `<div class="dslot ${cls} ${e.k}" ${tip(`${WEEKDAYS[i]}: ${[e.label, e.at].filter(Boolean).join(' · ') || 'spent'}${cls === 'now' ? ' (today)' : ''}`)} aria-label="${WEEKDAYS[i]} ${esc(e.label || '')}"><i>${DAY_ICON[e.k] || '•'}</i></div>`
        : `<div class="dslot free" ${tip(`${WEEKDAYS[i]}: to come`)}></div>`
    )
    .join('')}</div>`;
}
/** The week's 7 cells as [entry, 'done' | 'now' | 'free'] (entry null = a day to come): the slept-through days, today, the rest. */
function weekCells(run) {
  const spent = Math.min(WEEK_DAYS, City.clock(run).day - 1),
    log = (run.dayLog || []).slice(0, spent),
    today = City.night(run) ? [] : [[City.clock(run).log.length ? City.daySum(City.clock(run).log) : { k: 'day', label: 'Today' }, 'now']];
  return [
    ...Array.from({ length: spent }, (_, i) => [log[i] || { k: 'day', label: '' }, 'done']), // days spent before the log existed
    ...today,
    ...Array.from({ length: WEEK_DAYS - spent - today.length }, () => [null, 'free'])
  ];
}
/** The rail inbox (spec §10.3): reminders only — what waits for you, one button each, until handled. Max 5. */
function inboxRows(run) {
  return inboxItems(run).slice(0, 5).join('') || '<p class="small mute">Nothing waiting.</p>';
}
/**
 * The inbox items, one line each (spec §10.8): an item with facts opens them in a peek with its action; a plain item is
 * one button doing its action. All of them (the rail shows 5, the folded rail counts them).
 */
function inboxItems(run) {
  const rows = [],
    line = (ico, text) => `<span class="wico">${ico}</span><span class="wtx">${text}</span>`,
    act = (ico, text, t, go, cls = '', lab = '') =>
      rows.push(
        `<button class="peekt row wit ${cls}" onclick="${go}" ${t ? tip(t) : ''}>${line(ico, text)}<i class="gt" aria-hidden="true">${lab ? `${lab} ` : ''}›</i></button>`
      ),
    // btns = [[label, onclick], …]: the item's actions, in the peek's action row
    facts = (id, ico, text, list, btns, cls = '') =>
      rows.push(
        peek(
          `ib:${id}`,
          line(ico, text),
          `${kv(list)}<div class="acts ${btns.length === 2 ? 'pri' : ''}">${btns.map(([b, go]) => `<button class="btn" onclick="CW.peek=null;${go}">${b}</button>`).join('')}</div>`,
          `row wit ${cls}`
        )
      ),
    ev = evalCountdown(run);
  if (CW.flash) rows.push(`<div class="wit bad"><span class="wico">✕</span><span class="wtx">${esc(CW.flash)}</span><span></span></div>`); // a refused action, one render
  CW.flash = null;
  const c = Fight.clashSite(run);
  if (c && !run.clash.done) {
    const att = run.clash.att || c.a,
      def = att === c.a ? c.b : c.a,
      d = Fight.clashCost(run),
      short = r => esc(REGIONS[r].name.split(' ')[0]);
    facts(
      'battle',
      '⚔',
      `${short(att)} raid ${short(def)} · ${City.hrs(d)}`,
      [
        ['Sides', `${short(c.a)} vs ${short(c.b)}`],
        ['Where', esc(c.name)],
        ['Border', clashBorder(run, att, def)],
        ['Walk', d - DAY.act ? `${City.hrs(d - DAY.act)}` : 'None']
      ],
      [['View', "mapPick('clash')"]]
    );
  }
  const asks = Asks.count(run);
  if (asks)
    act(
      '✉',
      `${asks} friend${asks > 1 ? 's' : ''} need${asks > 1 ? '' : 's'} attention`,
      'Approaches waiting: they expire at the end of the week',
      "hubOpen('people')"
    );
  if (run.gazette && !run.gazette.read) act('☰', 'Gazette out', `The Gazette, week ${run.gazette.week}`, "hubOpen('news')");
  if (ev) {
    const f1 = ev.w === run.week + 1 ? evalNext(run) : null;
    if (Array.isArray(f1)) facts('evaln', '⚑', ev.text, f1, [['Season', "hubOpen('season')"]]);
    else act('⚑', ev.text, f1 || `Week ${ev.w}`, "hubOpen('season')");
  }
  for (const z of (CW.seizes || []).filter(x => run.week - x.week <= 1))
    act('⚑', esc(z.text), 'A place changed hands', `mapPick('${z.id}')`);
  return rows;
}
/** The next evaluation (or the Cup) from a training week, as a countdown: { w, text } — 'Eval in 4 weeks', 'Eval next week', 'Cup in 3 weeks'; null in match weeks. */
function evalCountdown(run) {
  const wt = Run.weekType(run);
  if (wt !== 'train' && wt !== 'camp') return null;
  let w = run.week + 1;
  while (w <= CAREER.weeks && Season.cal(run, w) !== 'eval') w++;
  const n = w - run.week,
    what = w > CAREER.weeks ? 'Cup' : 'Eval';
  return { w, text: `${what} ${n === 1 ? 'next week' : `in ${n} weeks`}` };
}
/** Next week's evaluation as facts (the squads are drawn that week): opponent and venue; no evaluation for you → a note. */
function evalNext(run) {
  if (Season.year(run) > 1 && run.mode.story && run.week + 1 === SEASON.rematch && Stars.get(run, 'rival'))
    return [['Opponent', `${esc(Stars.get(run, 'rival').team.name)} — the rematch`]];
  const kind = Eval.kind(run);
  if (!kind) return 'Match weeks have no training days';
  const region = FACTIONS[run.team] && FACTIONS[run.team].region,
    v = kind === 'academy' ? 'hall' : Object.keys(VENUES).find(id => VENUES[id].holds.includes(`eval:${region}`));
  return [
    ['Opponent', kind === 'academy' ? 'A faction squad, drawn that week' : `Another ${esc(REGIONS[region].name)} squad`],
    v ? ['Venue', esc(VENUES[v].name)] : null
  ];
}
/** Hub keys: 1–4 open the sheet tabs, `[` folds the week rail, Space pauses the clock (§4.43), N ends the week, Esc closes ⚙, the sheet, then the place card. */
function hubKey(e) {
  if (A || e.ctrlKey || e.metaKey || e.altKey || !document.querySelector('.career.hub') || $('#dbg') || (CW.dossier && e.key === 'Escape'))
    return;
  if (CW.lock) {
    // the hub waits while you walk; the training / sim match result closes with Space / Enter / Esc
    if ((CW.lock.phase === 'done' || CW.lock.phase === 'res') && [' ', 'Enter', 'Escape'].includes(e.key)) lockEnd();
    else if (CW.lock.phase === 'greet' && [' ', 'Enter', 'Escape'].includes(e.key)) lockGreetDone();
    else if (CW.lock.phase === 'ff' && e.key === 'Escape')
      ffStop(); // a session / a sleep cut short (spec §4.43)
    else if ((CW.lock.phase === 'ff' || CW.lock.phase === 'walk') && e.key === ' ') MapView.pause(); // the clock pauses mid-walk too
    e.preventDefault();
    return;
  }
  if (e.target.closest && e.target.closest('input,select,textarea,button,a,[contenteditable]')) return;
  if (e.key === 'Escape') {
    if (document.querySelector('.hubmodal .night'))
      nightAnswer(false); // the out-of-days ask: Esc = I'll stay
    else if (CW.gear) gearToggle();
    else if (CW.sheet) hubOpen(null);
    else if (CW.spot) {
      CW.spot = null;
      renderCareer();
    }
  } else if (
    (e.key === 'n' || e.key === 'N' || (e.key === ' ' && City.night(RUN))) &&
    document.querySelector('.hub .endw') &&
    !document.querySelector('.hubmodal')
  ) {
    e.preventDefault();
    mapEndWeek(); // N (spec §4.43: Space is the clock's pause; once the week is spent it ends the week as before)
  } else if (e.key === ' ') {
    e.preventDefault();
    MapView.pause();
  } else if (e.key === '[') railToggle();
  else if (e.key === 'c' || e.key === 'C') MapView.centre();
  else if (/^[1-4]$/.test(e.key) && !document.querySelector('.hubmodal')) hubOpen(HUB_TABS[+e.key - 1][0]);
}
document.addEventListener('keydown', hubKey);

/** The legend chips at the bottom of the map (places are found on the map only — spec §10.1). */

function hubOpen(k) {
  CW.gear = false;
  if (k === 'news' || k === 'diary') {
    CW.stab = k; // the Season sheet's Diary / Gazette tab
    k = 'season';
    CW.sheet = null;
  }
  CW.sheet = k && HUB_SHEETS[k] && CW.sheet !== k ? k : null; // a tab toggles its sheet; null closes
  renderCareer();
}
/** ⚙: a small pop-over under the top bar — Main menu, Debug log (only with ?dev), Abandon run (inline confirm). */
function gearToggle() {
  CW.gear = !CW.gear;
  renderCareer();
}
function gearPop() {
  return `<div class="gearpop inkwin" role="menu" aria-label="Settings"><button class="btn x" onclick="gearToggle()" aria-label="Close">✕</button><header class="inkhead"><span class="inkover">Career</span><b class="inktitle">Settings</b></header><button class="btn" onclick="CW.gear=false;navigate('menu')">Main menu</button><button class="btn" onclick="Motion.set(Motion.pref === 'reduced' ? 'full' : 'reduced');renderCareer()" ${tip('Full: panels slide and fade, numbers count. Reduced: short fades only (also follows your system setting).')}>Motion: ${Motion.pref === 'reduced' ? 'Reduced' : 'Full'}</button>${
    /[?&]dev\b/.test(location.search) ? '<button class="btn" onclick="CW.gear=false;openDebug()">Debug log</button>' : ''
  }<button class="btn ${PerfHUD.on ? 'on' : ''}" onclick="PerfHUD.toggle();renderCareer()" aria-pressed="${PerfHUD.on}" ${tip('Frame rate, frame time, draw calls and render scale in the corner — for reporting slow frames')}>Perf overlay <kbd>F3</kbd>: ${PerfHUD.on ? 'On' : 'Off'}</button><p class="small mute" id="abandon"><button class="btn quiet danger" onclick="abandonRun()" ${tip('Your run saves automatically')}>Abandon run</button></p></div>`;
}
Screens.career = renderCareer;
