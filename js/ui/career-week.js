// Career week: the hub UI state (CW), End week and the Week report, the event card, Abandon run. Sheets live in
// career-sheets.js, match cards in career-match.js, the World sheet's cards in career-dossier.js.

/** Hub UI state: Hard toggle, selected place, open sheet and its tabs, cards, the Week report baseline. */
let CW = {
  hard: false,
  spot: null,
  flash: null,
  briefWeek: null,
  seizes: null,
  snap: null,
  sheet: null,
  wtab: 'factions',
  stab: 'diary',
  gear: false,
  dossier: null,
  rank: 'register',
  rankAll: false,
  person: null,
  recap: null,
  own: null,
  ownOf: null,
  endArm: 0,
  hudPrev: null,
  hudOf: null
};

/** End the week and remember what changed for the recap card (nothing changed = no card). */
/** What the Week report compares against: your values when the week began (taken at the week's first hub render). */
function weekSnap(run) {
  const you = Run.you(run);
  return {
    key: `${run.week}:${(Run.cupDef(run) || {}).id || ''}`,
    run,
    stat: Object.fromEntries(STATK.map(k => [k, you[k]])),
    money: run.money,
    fans: run.fans,
    rep: Object.fromEntries(Object.keys(REGIONS).map(r => [r, City.rep(run, r)])),
    own: { ...(run.own || {}) },
    top: run.log[0],
    week: run.week,
    sp: run.sp,
    bond: { ...you.bond }
  };
}
function endWeekUI() {
  const run = RUN,
    regs = Object.keys(REGIONS).filter(r => REGIONS[r].kind !== 'none'),
    before = CW.snap && CW.snap.run === run && CW.snap.week === run.week ? CW.snap : weekSnap(run);
  Run.endWeek(run);
  const now = Run.you(run),
    rows = [],
    d = (n, txt) => n && rows.push([n > 0 ? 'up' : 'dn', txt]);
  for (const k of STATK) d(now[k] - before.stat[k], `${STATNAME[k]} ${fmtDelta(now[k] - before.stat[k])}`);
  d(run.money - before.money, `Money ${fmtDelta(run.money - before.money, { pre: '$', loc: true })}`);
  d(run.fans - before.fans, `Fans ${fmtDelta(run.fans - before.fans)}`);
  d(run.sp - before.sp, `Skill pts ${fmtDelta(run.sp - before.sp)}`);
  for (const m of Run.mates(run))
    d(
      (now.bond[m.id] || 0) - (before.bond[m.id] || 0),
      `Bond ${m.name.split(' ')[0]} ${fmtDelta((now.bond[m.id] || 0) - (before.bond[m.id] || 0))}`
    );
  for (const r of regs) d(City.rep(run, r) - before.rep[r], `⚑ ${REGIONS[r].name} ${fmtDelta(City.rep(run, r) - before.rep[r])}`);
  for (const t of ownChanges(before.own, run.own || {})) rows.push(['ch', t.text]);
  const at = before.top ? run.log.indexOf(before.top) : run.log.length,
    lines = run.log.slice(0, at < 0 ? run.log.length : at).slice(0, 6);
  rows.sort((a, b) => ['dn', 'up', 'ch'].indexOf(a[0]) - ['dn', 'up', 'ch'].indexOf(b[0])); // bad news first, then your gains, then the world
  CW.recap = { week: before.week, rows, lines }; // the Week report, every week (spec §10.5)
  renderCareer();
}
/** A diary entry's tag: its producer's `k` (Run.log), else by text for untagged producers — [class, icon]. */
const LOG_ICON = { bad: '✕', good: '+', world: '•' };
const LOG_TAGS = [
  ['bad', '✕', /mood down|evicted|caught a cold|injur|noisy night|\blost\b|Lost|stolen|refused/i],
  ['good', '+', /broke through|Awakening|Signed with|learned|won\b|\+\d/],
  ['world', '•', /./]
];
function logTag(l) {
  const c = l.k || LOG_TAGS.find(([, , re]) => re.test(l.t))[0];
  return [c, LOG_ICON[c]];
}
const logLi = (l, pre = '') => {
  const [c, i] = logTag(l);
  return `<li class="lt ${c}"><i aria-hidden="true">${i}</i><span>${pre}${esc(l.t)}</span></li>`;
};
/** Places whose holder differs between two `run.own` maps: [{ id, to, text }]. */
function ownChanges(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(id => SPOTS[id] && (a[id] || SPOTS[id].region) !== (b[id] || SPOTS[id].region))
    .map(id => {
      const to = b[id] || SPOTS[id].region,
        from = a[id] || SPOTS[id].region;
      return { id, to, text: `${REGIONS[to].name} ${b[id] ? 'seized' : 'retook'} the ${SPOTS[id].name} from ${REGIONS[from].name}` };
    });
}
/** The card after End week (hubCard shows it last, so events / cups / matches win). */
/** The Week report (spec §10.5): penalties first, your week as chips, island news; Next week → the brief. */
function recapCard() {
  const R2 = CW.recap,
    tagged = R2.lines.map(l => [logTag(l)[0], l.t]),
    of = k => tagged.filter(([c]) => c === k).map(([, t]) => t),
    bad = of('bad'),
    good = of('good'),
    world = of('world'),
    chips = R2.rows.filter(([c]) => c !== 'ch'),
    places = R2.rows.filter(([c]) => c === 'ch').map(([, t]) => t),
    it = (ico, cls, title, body) =>
      `<div class="bi"><span class="bico ${cls}">${ico}</span><div><b class="${cls}">${title}</b>${body ? `<div class="small mute">${body}</div>` : ''}</div><span></span></div>`;
  return `<div class="panel brief report recap"><div class="lab">Week ${typeof R2.week === 'number' ? R2.week : esc(R2.week)} report</div><h2>${bad.length ? 'A rough week' : chips.some(([c]) => c === 'up') ? 'A good week' : 'A quiet week'}</h2>
    ${bad.map(t => it('✕', 'dn', esc(t), '')).join('')}
    ${chips.length || good.length ? `<div class="bi"><span class="bico">✸</span><div><b>Your week</b><div class="rrows">${chips.map(([c, t]) => `<span class="rr ${c}">${esc(t)}</span>`).join('')}</div>${good.length && !chips.length ? `<div class="small mute">${good.map(esc).join(' · ')}</div>` : ''}</div><span></span></div>` : ''}
    ${world.length || places.length ? it('⚔', '', 'On the island', [...places, ...world].map(esc).join(' · ')) : ''}
    <div class="acts"><button class="btn hot" onclick="recapDone()">Next week</button></div></div>`;
}
function recapDone() {
  CW.recap = null;
  renderCareer();
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
                  ? `${fmtDelta(v)} ${STATNAME[run.lastMain]}`
                  : k.startsWith('bond')
                    ? `${fmtDelta(v)} bond${k === 'bondAll' ? ' with everyone' : ''}`
                    : k === 'mood'
                      ? `mood ${v > 0 ? 'up' : 'down'}`
                      : `${fmtDelta(v)} ${k === 'sta' ? 'stamina' : k === 'sp' ? 'skill pts' : STATNAME[k] || k}`
            )
            .join(', ');
  const kind = { sponsor: 'Sponsor', element: 'Element Trial' }[run.event.id] || 'Event',
    you = Run.you(run);
  return `<div class="panel ev ${run.event.id === 'element' ? 'lbk' : ''}"${run.event.id === 'element' ? ` style="--lbk:${ECOL[you.el]}"` : ''}><span class="evk">${kind}</span><h3>${esc(e.title)}</h3><p>${esc(Events.text(run, run.event, e.text))}</p>
    <div class="evc acts two">${[e.a, e.b].map(([label, fx], i) => `<button class="btn" onclick="chooseEvent(${i})"><b>${esc(label)}</b><small>${esc(fxText(fx))}</small></button>`).join('')}</div></div>`;
}
function chooseEvent(i) {
  if (!RUN.event) return;
  Run.log(RUN, Events.choose(RUN, i));
  Run.save(RUN); // the week goes on: only the player ends it
  renderCareer();
}
/** Abandon: ask inline (browser confirm dialogs are blocked inside the artifact frame), then clear the run. */
function abandonRun(sure) {
  if (!sure) {
    const el = $('#abandon');
    if (el)
      el.innerHTML = `Abandon this run? <button class="btn hot" onclick="abandonRun(true)">Yes, abandon</button> <button class="btn" onclick="renderCareer()">Keep playing</button>`;
    return;
  }
  Run.clear();
  RUN = null;
  navigate('menu');
}
