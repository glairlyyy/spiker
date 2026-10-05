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
  return `<section class="sheet" aria-label="${name}"><button class="btn x" onclick="hubOpen(null)" aria-label="Close">✕</button>${body(run)}</section>`;
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
    `<section class="career hub ${City.night(run) ? 'eve' : ''} ${CW.railMini ? 'railmini' : ''} ${scene ? 'cine' : ''}" style="--tc:${team.color}">
    ${topBar(run)}${CW.railMini ? railStrip(run, armed) : weekRail(run, armed)}
    <div class="mapwrap" id="mapwrap"></div><button class="btn mapme" onclick="MapView.centre()" aria-label="Centre the map on you (C)">◎ Me <kbd>C</kbd></button>${walkSpeed()}
    <div class="hud spotcard ${CW.spot && !card ? 'open' : ''}" id="spot">${CW.spot && !card ? spotCard(run) : ''}</div>
    ${CW.sheet ? hubSheet(run) : ''}
    ${card ? `<div class="hubmodal ${card.dim ? 'dim' : ''}"><div class="hubcard ${card.cls || ''}">${card.html}</div></div>` : ''}
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
    const e = run.eval || Eval.setup(run);
    row(
      '⚑',
      `${esc(e.kind === 'academy' ? 'Academy' : REGIONS[e.region].name)} evaluation`,
      'this week',
      [['Opponent', `${esc(REGIONS[e.region].name)} squad`], City.venue(run) ? ['Venue', esc(VENUES[City.venue(run)].name)] : null],
      '',
      'eval'
    );
  } else if (wt === 'cup') row('⚑', esc((Run.cupDef(run) || {}).name || 'Cup'), 'this week', null, 'hot');
  const c = Fight.clashSite(run);
  if (c && !run.clash.done) {
    const att = run.clash.att || c.a,
      def = att === c.a ? c.b : c.a,
      k = Front.stakes(run, att, def);
    row(
      '⚔',
      `${chip(REGIONS[att])}${esc(REGIONS[att].name.split(' ')[0])} raid ${chip(REGIONS[def])}${esc(REGIONS[def].name.split(' ')[0])}`,
      'battle',
      [
        ['Where', esc(c.name)],
        ['Border', clashBorder(run, att, def)],
        k.seize && k.place ? ['A win takes', esc(SPOTS[k.place].name)] : null,
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
  if (!match && CALENDAR[run.week + 1] === 'eval') {
    const ev = evalNext(run);
    row('⚑', 'Evaluation', 'next week', Array.isArray(ev) ? ev : [['Note', ev]], '', 'evaln');
  }
  const title = { train: 'Training week', camp: 'Training camp', eval: 'Evaluation week', cup: 'Cup week' }[wt] || 'This week',
    line = match ? 'Match weeks have no training days.' : `${WEEK_DAYS} days. Every action takes a day, plus the trip there.`;
  return `<div class="panel brief"><div class="lab">Week ${Math.min(run.week, CAREER.weeks)} / ${CAREER.weeks}</div><h2 ${tip(line)}>${title}</h2>
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
      ${cell('Week', `<span class="disp">${cup ? esc(cup.short) : `${real.week} / ${CAREER.weeks}`}</span>`, `Week ${real.week} of ${CAREER.weeks}`)}
      ${cell('Money', `${num('money', `$${run.money.toLocaleString()}`)}${d('money')}`, 'Money', 'money')}
      ${cell('Fans', `${num('fans', run.fans.toLocaleString())}${d('fans')}`, 'Fans', 'fans')}
      ${cell('Skill pts', `${num('sp', run.sp)}${d('sp')}`, 'Skill points', 'sp')}
      ${cell('Stamina', `<span class="sbar ${staPct < 50 ? 'low' : ''}"><i ${prev && prev.sta !== run.sta ? `class="mv" style="--w:${staPct}%;--w0:${Math.round((prev.sta / run.staMax) * 100)}%"` : `style="--w:${staPct}%"`}></i></span><span class="${staPct < 50 ? 'warn' : ''}">${run.sta}</span>${d('sta')}`, `Stamina ${run.sta}/${run.staMax}`, 'sta')}
      ${cell('Mood', `<span class="mood m${run.mood}">${mood.name}</span>${d('mood')}`, 'Mood', 'mood')}
    </div>
    <nav class="ttabs" aria-label="Sheets">${HUB_TABS.map(
      ([k, n], i) =>
        `<button class="btn ${CW.sheet === k ? 'on' : ''}" onclick="hubOpen('${k}')">${n} <kbd>${i + 1}</kbd>${k === 'people' && people ? `<em class="badge">${people}</em>` : ''}</button>`
    ).join(
      ''
    )}<button class="btn ${CW.gear ? 'on' : ''}" onclick="gearToggle()" aria-label="Settings">⚙</button></nav>${CW.gear ? gearPop() : ''}
  </header>`;
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
    <div class="wtop"><button class="wme" onclick="hubOpen('me')" aria-label="Your player"><span class="portrait">${faceSVG(you, MOODS[run.mood].form, 44)}</span>
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
          } <kbd>Space</kbd></button></div>`
        : ''
    }
  </aside>`;
}
const endTip = (days, eve) => tip(eve ? 'Sleep: start the next week' : `Skip the ${days} day${days > 1 ? 's' : ''} left`);
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
    cells = match
      ? '<div class="dslot match" title="Match week">⚑</div>'
      : weekCells(run)
          .map(
            ([e, cls]) =>
              `<div class="dslot ${cls} ${e ? e.k : ''}" ${e && (e.at || e.label) ? tip(e.at || e.label) : ''}>${e ? `<i>${DAY_ICON[e.k] || '•'}</i>` : ''}</div>`
          )
          .join('');
  return `<aside class="wrail mini" aria-label="This week">
    <button class="btn wfold" onclick="railToggle()" aria-label="Expand the week rail ([)">» <kbd>[</kbd></button>
    <button class="wme" onclick="hubOpen('me')" aria-label="Your player" ${tip(you.name)}><span class="portrait">${faceSVG(you, MOODS[run.mood].form, 40)}</span></button>
    <div class="wleft"><b>${match ? '⚑' : days}</b><small>${match ? 'match' : 'left'}</small></div>
    <div class="wdays">${cells}</div>
    <button class="wicon" onclick="railToggle()" aria-label="Inbox: ${n} waiting" ${tip(`Inbox · ${n} waiting`)}>✉${n ? `<em class="badge">${n}</em>` : ''}</button>
    ${
      !match && !run.event
        ? `<button class="btn ${eve ? 'hot' : ''} endw wicon" onclick="mapEndWeek()" aria-label="End week (Space)" ${endTip(days, eve)}>${armed ? 'Skip?' : '☾'}<kbd>Space</kbd></button>`
        : ''
    }
  </aside>`;
}
/** Fold / unfold the week rail (« / », key `[`); the map resizes into the space (MapView keeps its one canvas). */
/** The map's walking-speed selector (T-214): top right of the map, usable while you walk (above the walk lock). */
function walkSpeed() {
  const k = MapView.walkK();
  return `<div class="mapwalk" role="group" aria-label="Walking speed" ${tip('Walking speed on the map')}><span class="lab">Walk</span>${MapView.WALKS.map(
    n => `<button class="btn ${n === k ? 'on' : ''}" aria-pressed="${n === k}" onclick="walkSet(${n}, this)">${n}×</button>`
  ).join('')}</div>`;
}
function walkSet(k, b) {
  MapView.setWalk(k);
  for (const x of b.parentNode.querySelectorAll('.btn')) {
    const on = x === b;
    x.classList.toggle('on', on);
    x.setAttribute('aria-pressed', on);
  }
}
function railToggle() {
  CW.railMini = !CW.railMini;
  store.set(KEYS.rail, CW.railMini ? '1' : '0');
  renderCareer();
}
/** "This week · {type}", days left and the day track. */
function weekSection(run) {
  const wt = Run.weekType(run),
    days = City.days(run),
    match = wt === 'cup' || wt === 'eval',
    kind = { train: 'training', camp: 'training camp', eval: 'evaluation', cup: 'cup' }[wt] || wt;
  return `<section class="wweek"><div class="wh"><span class="lab" ${tip(`This week: ${kind}`)}>This week</span><span class="small mute">${match ? 'Match' : `${days} left`}</span></div>
      ${dayTrack(run, match)}</section>`;
}
/** Icons of the day-track entries (line icons come with T-111). */
const DAY_ICON = { train: '✸', rest: '☾', outing: '◐', trip: '↗', scout: '◉', battle: '⚔', challenge: '⚔', day: '•' };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** The day track (spec §10.2): what each spent day was, trips hatched, free days empty, the selected place's cost as ghost slots. */
function dayTrack(run, match) {
  if (match) return '<div class="wdays"><div class="dslot match">⚑ Match day</div></div>';
  const cells = weekCells(run);
  return `<div class="wdn">${WEEKDAYS.map(d => `<span ${tip(d)}>${d[0]}</span>`).join('')}</div><div class="wdays" id="wdays">${cells
    .map(([e, cls], i) =>
      e
        ? `<div class="dslot ${cls} ${e.k}" ${tip(`${WEEKDAYS[i]}: ${[e.label, e.at].filter(Boolean).join(' · ') || 'spent'}${cls === 'ghost' ? ' (if you go)' : ''}`)} aria-label="${WEEKDAYS[i]} ${esc(e.label || '')}"><i>${DAY_ICON[e.k] || '•'}</i></div>`
        : `<div class="dslot free" ${tip(`${WEEKDAYS[i]}: free`)}></div>`
    )
    .join('')}</div>`;
}
/** The week's 7 cells as [entry, 'done' | 'ghost' | 'free'] (entry null = a free day): spent days, the selected place's ghost, free. */
function weekCells(run) {
  const spent = WEEK_DAYS - City.days(run),
    log = (run.dayLog || []).slice(0, spent),
    ghost = spotGhost(run, CW.spot).slice(0, WEEK_DAYS - spent);
  return [
    ...Array.from({ length: spent }, (_, i) => [log[i] || { k: 'day', label: '' }, 'done']), // days spent before the log existed
    ...ghost.map(e => [e, 'ghost']),
    ...Array.from({ length: WEEK_DAYS - spent - ghost.length }, () => [null, 'free'])
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
      `${short(att)} raid ${short(def)} · ${d}d`,
      [
        ['Sides', `${short(c.a)} vs ${short(c.b)}`],
        ['Where', esc(c.name)],
        ['Border', clashBorder(run, att, def)],
        ['Trip', d - 1 ? `${d - 1} day${d > 2 ? 's' : ''}` : 'None']
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
  while (w <= CAREER.weeks && CALENDAR[w] !== 'eval') w++;
  const n = w - run.week,
    what = w > CAREER.weeks ? 'Cup' : 'Eval';
  return { w, text: `${what} ${n === 1 ? 'next week' : `in ${n} weeks`}` };
}
/** Next week's evaluation as facts (the squads are drawn that week): opponent and venue; no evaluation for you → a note. */
function evalNext(run) {
  const kind = Eval.kind(run);
  if (!kind) return 'Match weeks have no training days';
  const region = FACTIONS[run.team] && FACTIONS[run.team].region,
    v = kind === 'academy' ? 'hall' : Object.keys(VENUES).find(id => VENUES[id].holds.includes(`eval:${region}`));
  return [
    ['Opponent', kind === 'academy' ? 'A faction squad, drawn that week' : `Another ${esc(REGIONS[region].name)} squad`],
    v ? ['Venue', esc(VENUES[v].name)] : null
  ];
}
/** Hub keys: 1–4 open the sheet tabs, `[` folds the week rail, Space ends the week, Esc closes ⚙, the sheet, then the place card. */
function hubKey(e) {
  if (A || e.ctrlKey || e.metaKey || e.altKey || !document.querySelector('.career.hub') || $('#dbg') || (CW.dossier && e.key === 'Escape'))
    return;
  if (CW.lock) {
    // the hub waits while you walk; the training result closes with Space / Enter / Esc
    if (CW.lock.phase === 'done' && [' ', 'Enter', 'Escape'].includes(e.key)) lockEnd();
    e.preventDefault();
    return;
  }
  if (e.target.closest && e.target.closest('input,select,textarea,button,a,[contenteditable]')) return;
  if (e.key === 'Escape') {
    if (CW.gear) gearToggle();
    else if (CW.sheet) hubOpen(null);
    else if (CW.spot) {
      CW.spot = null;
      renderCareer();
    }
  } else if (e.key === ' ' && document.querySelector('.hub .endw') && !document.querySelector('.hubmodal')) {
    e.preventDefault();
    mapEndWeek();
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
  return `<div class="gearpop" role="menu"><button class="btn" onclick="CW.gear=false;navigate('menu')">Main menu</button><button class="btn" onclick="Motion.set(Motion.pref === 'reduced' ? 'full' : 'reduced');renderCareer()" ${tip('Full: panels slide and fade, numbers count. Reduced: short fades only (also follows your system setting).')}>Motion: ${Motion.pref === 'reduced' ? 'Reduced' : 'Full'}</button>${
    /[?&]dev\b/.test(location.search) ? '<button class="btn" onclick="CW.gear=false;openDebug()">Debug log</button>' : ''
  }<p class="small mute" id="abandon"><button class="btn quiet danger" onclick="abandonRun()" ${tip('Your run saves automatically')}>Abandon run</button></p></div>`;
}
Screens.career = renderCareer;
