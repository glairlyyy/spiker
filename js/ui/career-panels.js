// Place panels (spec §10.2–§10.3): one card anatomy (placeCard) for every kind of place on the island map — SPOTS places,
// club HQs, the street battle, venues, map points. Pure HTML builders; the actions behind the buttons live in career-map.js.

/**
 * One place-panel anatomy for every kind (spec §10.1, HubRedesign; quiet §10.8): label (region · kind), title (its
 * flavour — plain text — on hover, ⓘ), tags, the body (gains / roster / stakes), options, then ONE action row and any
 * `after` rows (e.g. a peek). The days a choice takes show as ghost slots on the week rail, not as a line here.
 */
function placeCard({ region, kind, title, tags = [], flavour = '', body = '', opts = '', row = [], split = '', after = '' }) {
  return `<div class="spot plc"><div class="lab">${region ? `${chip(REGIONS[region] || REGIONS.open)}${esc((REGIONS[region] || REGIONS.open).name)} · ` : ''}${kind}</div>
    <h3 class="ptitle" ${flavour ? `${tip(flavour)} tabindex="0"` : ''}>${title}${flavour ? ' <span class="pfi" aria-hidden="true">ⓘ</span>' : ''}</h3>${tags.length ? `<div class="ptags">${tags.join('')}</div>` : ''}
    ${body}${opts ? `<div class="popts">${opts}</div>` : ''}
    ${row.length ? `<div class="acts ${split || (row.length === 2 ? 'pri' : row.length === 3 ? 'three' : '')}">${row.join('')}</div>` : ''}${after}</div>`;
}
const ptag = (text, t, cls = '') => `<span class="ptag ${cls}" ${t ? tip(t) : ''}>${text}</span>`;
/** What every place shares, as Details-peek rows (§10.8): border / seized, trip days. */
function placeTags(run, sid, trip) {
  const s = SPOTS[sid],
    tile = s && s.region && Hex.ofSpot(sid),
    front = !!tile && Hex.frontier(run, tile.id),
    held = s && Front.seized(run, sid);
  return [
    held ? ['Seized', `from ${esc(REGIONS[s.region].name)}`, 'wa'] : front ? ['Border', 'On the front'] : null,
    trip ? ['Trip', `${trip} day${trip > 1 ? 's' : ''}, then the day there`, trip >= 2 ? 'wa' : ''] : null
  ].filter(Boolean);
}
/** The "Details ›" peek of a place (facility level, streak, border, trip …); '' with nothing to show. */
const placeDetails = (id, rows) => (rows.length ? `<div class="pdet">${peek(`pd:${id}`, 'Details', kv(rows))}</div>` : '');
/**
 * The panel for the selected place, by kind: the first entry whose test matches the id builds it (a new place kind = one
 * entry); everything else is a SPOTS place (placePanel).
 */
const PANELS = [
  [id => id.startsWith('hq'), (run, id) => hqPanel(run, +id.slice(2))],
  [id => id === 'clash', run => clashPanel(run)],
  [id => id.startsWith('venue:'), (run, id) => venuePanel(run, id.slice(6))],
  [id => id.startsWith('pt:'), (run, id) => pointPanel(run, MapModel.ptOf(id))]
];
function spotPanel(run, id) {
  if (!id) return `<p class="small mute">Pick a place on the map.</p>`;
  const P = PANELS.find(([test]) => test(id));
  return P ? P[1](run, id) : placePanel(run, id);
}
/** A SPOTS place (training, home, hotel, outing …): what it does and its buttons. */
function placePanel(run, id) {
  const sid = id,
    s = SPOTS[sid],
    c = City.can(run, sid),
    cost = City.price(run, sid),
    at = City.at(run, sid),
    trip = City.trip(run, at),
    days = City.cost(run, sid),
    trOk = trip && !run.event && !City.noTime(run, trip) && !City.outside(run, at),
    travel = trip
      ? `<button class="btn" onclick="mapTravel(${at[0]},${at[1]})" ${trOk ? '' : `disabled ${tip(City.noTime(run, trip) || (City.outside(run, at) ? City.fence(run) : 'answer the event first'))}`}>Travel · ${trip}d</button>`
      : '',
    base = { region: City.region(run, sid), title: `${s.icon} ${esc(s.name)}`, after: placeDetails(sid, placeTags(run, sid, trip)) };
  if (s.train) {
    const T = trainSpot(run, sid, c);
    return placeCard({ ...base, ...T, row: [T.go, travel].filter(Boolean) });
  }
  if (s.act === 'ramen')
    return placeCard({
      ...base,
      kind: 'Outing',
      flavour: s.desc,
      body: `<p class="small">Pick who comes · $${cost} · ${days}d</p><div class="pmates">${Run.mates(run)
        .map(
          m =>
            `<button class="btn" onclick="mapGo('${sid}','${m.id}')" ${City.can(run, sid, m.id).ok ? '' : 'disabled'}>${faceSVG(m, 0, 22)} ${esc(m.name)} <small class="mute">Bond ${Run.you(run).bond[m.id] || 0}</small></button>`
        )
        .join('')}</div>${c.ok || c.why === 'pick a teammate' ? '' : `<p class="small mute">${esc(c.why)}</p>`}`,
      row: [travel].filter(Boolean)
    });
  const study = studyPanel(run, sid, base, travel); // the tutor / a bookstore (T-230)
  if (study) return study;
  const label = s.act === 'rest' ? 'Rest' : s.act === 'rec' ? 'Relax' : 'Go';
  return placeCard({
    ...base,
    kind: s.act === 'rest' ? 'Rest' : s.act === 'street' ? 'Street' : 'Place',
    flavour: s.desc,
    tags:
      sid === 'home'
        ? [ptag(`${esc(HOUSING[run.housing].name)} · rest ×${World.restMul(run)}`, 'Your home: how much a rest day restores')]
        : [], // cost and days are on the button
    row: [
      `<button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${sid}')" ${c.ok ? '' : `disabled ${tip(c.why)}`}>${label} · ${days}d${cost ? ` · $${cost}` : ''}</button>`,
      travel
    ].filter(Boolean)
  });
}
/** Any point of the island: travel there (the fog lifts around it). */
/** The hex tile under a map point (spec §4.27): holder, ground, what it takes to seize it, and any pressure on it. */
function tileBlock(run, p) {
  const id = Hex.idAt(p),
    t = Hex.tile(id);
  if (!t) return '';
  const own = Hex.owner(run, id),
    H = Hex.state(run),
    short = r => esc(REGIONS[r].name.split(' ')[0]),
    ground = `${t.kind === 'place' ? 'place' : t.kind === 'hq' ? 'club HQ' : t.terrain === 'plain' ? 'open ground' : t.terrain} · <span ${tip(GLOSSARY.value.long)}>value <b>${Hex.value(t)}</b></span>`,
    why = { hq: 'Capital — never falls', academy: 'Neutral ground — never taken', minor: 'Not in the war' }[t.kind],
    conds = MAJORS.filter(a => a !== own)
      .map(a => {
        const reach = Hex.targets(run, a, own).some(x => x.id === id);
        return `<span class="${reach ? '' : 'mute'}" ${reach ? '' : tip(`${REGIONS[a].name} can't reach it yet: no supplied tile next to it`)}>${chip(REGIONS[a])}${short(a)} needs <b>${Hex.cost(run, id, a)}</b></span>`;
      })
      .join(' · ');
  return `<div class="ptile small"><div>${chip(REGIONS[own])}<b>${esc(REGIONS[own].name)}</b> tile · ${ground}${
    t.region !== own ? ` <span class="mute">(taken from ${short(t.region)})</span>` : ''
  }</div><div ${tip(GLOSSARY.seize.long)}>${why ? `<span class="mute">${why}</span>` : `Seize: ${conds}`}</div>${
    H.p[id] ? `<div>${chip(REGIONS[H.by[id]])}${short(H.by[id])} pushing <b>${H.p[id]}/${Hex.cost(run, id, H.by[id])}</b></div>` : ''
  }</div>`;
}
function pointPanel(run, p) {
  const d = City.travelDays(run, p),
    seen = City.seen(run, p),
    r = City.regionAt(p),
    late = run.event ? 'answer the event first' : City.noTime(run, d) || (City.outside(run, p) ? City.fence(run) : '');
  return placeCard({
    region: seen ? r : null,
    kind: 'Travel',
    title: `⚑ ${seen ? esc(REGIONS[r].name) : 'Unexplored land'}`,
    tags: d >= 2 ? [ptag(`Trip ${d}d`, '', 'warn')] : [],
    flavour: seen ? REGIONS[r].desc : 'Nobody you know has been out there. Go and see what you find.',
    body: tileBlock(run, p),
    row: [
      `<button class="btn hot" onclick="mapTravel(${p[0]},${p[1]})" ${late ? `disabled ${tip(late)}` : ''}>Travel here · ${d}d</button>`
    ]
  });
}
/** The battle's border line: "{attacker} n/cost to seize" (+ the tile when it isn't the battle's own site), or that it can't reach. */
function clashBorder(run, att, def) {
  const k = Front.stakes(run, att, def),
    c = Fight.clashSite(run),
    short = r => esc(REGIONS[r].name.split(' ')[0]);
  return k.tile
    ? `${short(att)} ${k.meter - 1}/${k.cost} to seize${c && c.name === k.name ? '' : ` ${esc(k.name)}`}`
    : `${short(att)} can't reach ${short(def)}`;
}
/**
 * This week's street battle (spec §10.1a, HubBattle): the facts top-down, one card per side (cost, injury, Win and Lose
 * effects one per line), the Play it / Sim it option, then one row: Fight for A, Fight for B, Watch.
 */
function clashPanel(run) {
  const c = Fight.clashSite(run);
  if (!c) return `<p class="small mute">The street battle is over.</p>`;
  const d = Fight.clashCost(run),
    trip = d - 1,
    late = run.event ? 'answer the event first' : City.noTime(run, d) || City.fence(run),
    ban = Fight.ban(run),
    att = run.clash.att || c.a,
    def = att === c.a ? c.b : c.a,
    short = r => esc(REGIONS[r].name.split(' ')[0]),
    side = r => `<span ${tip(REGIONS[r].name)}>${chip(REGIONS[r])}${short(r)}</span>`,
    main = Front.stakes(run, att, def).tile,
    border = (w, l) => {
      const s = Front.stakes(run, w, l),
        other = s.tile !== main, // the facts above name the battle's tile; another tile is named on hover
        what = !s.tile
          ? `${short(w)} can't reach ${short(l)}`
          : s.seize
            ? `${short(w)} seizes${other ? ' a tile' : ''}`
            : `${short(w)} ${s.meter}/${s.cost}${other ? ' elsewhere' : ''}`;
      return s.tile && other ? `<span ${tip(s.name)}>${what}</span>` : what;
    },
    std = r => {
      const v = City.rep(run, r);
      return v ? [`Standing · ${short(r)}`, fmtDelta(v), v > 0 ? 'up' : 'dn'] : null; // hidden at 0 (§10.8)
    },
    risk = foe => Math.round(Fight.injuryRisk(run, Fight.crewOvr(run, foe)) * 100),
    card = (s, foe) =>
      `<div class="pside"><div class="lab">${chip(REGIONS[s])}${short(s)}</div>${kv([
        ['Cost', term('sta', -CLASH.sta, 'cost')],
        ['Win', `${term('standing', CLASH.win)} ${short(s)}`],
        ['', `${term('standing', CLASH.other)} ${short(foe)}`],
        ['', term('fans', CLASH.fans)],
        ['', border(s, foe)],
        ['Lose', `${term('standing', CLASH.lose)} ${short(s)}`],
        ['', border(foe, s)]
      ])}</div>`,
    sim = !!CW.clashSim,
    fight = s =>
      `<button class="btn" onclick="mapClash('${s}', CW.clashSim)" ${late || ban ? `disabled ${tip(ban || late)}` : tip(`Injury ~${risk(s === c.a ? c.b : c.a)}%. A real match with their crew: XP, techniques and a grade. A loss costs ${LOSS.sta} more stamina and mood.`)}>${chip(REGIONS[s])}Fight for ${short(s)}${sim ? ' ⏭' : ''}</button>`;
  return placeCard({
    region: null,
    kind: 'Street battle',
    title: `⚔ ${esc(c.name[0].toUpperCase() + c.name.slice(1))}`,
    flavour: "Crews from both sides are settling it on the street this week. If nobody joins, it is settled at the week's end.",
    body: `${kv([
      ['Attacker', side(att)],
      ['Defender', side(def)],
      ['Border', clashBorder(run, att, def)],
      std(c.a),
      std(c.b),
      ['Trip', trip ? `${trip} day${trip > 1 ? 's' : ''}` : 'None', trip >= 2 ? 'wa' : '']
    ])}<div class="pstakes">${card(c.a, c.b)}${card(c.b, c.a)}</div>`,
    opts:
      late || ban
        ? ''
        : `<div class="seg" aria-label="Fight"><button class="btn ${sim ? '' : 'on'}" onclick="CW.clashSim=false;mapPick('clash')">Play it</button><button class="btn ${sim ? 'on' : ''}" onclick="CW.clashSim=true;mapPick('clash')" ${tip(GLOSSARY.sim.long)}>Sim it</button></div>`,
    row: [
      fight(c.a),
      fight(c.b),
      `<button class="btn" onclick="mapClash(null)" ${late ? `disabled ${tip(late)}` : tip(`See both sides' clubs in action: scouts them. −${CLASH.watchSta} stamina`)}>Watch · ${d}d</button>`
    ]
  });
}

/** A training place's parts for placeCard: kind, tags, flavour, gain rows, options (Normal / Hard, teammates), the Train button. */
function trainSpot(run, id, c) {
  const s = SPOTS[id],
    key = s.train,
    T = Run.myTeam(run),
    hard = CW.hard && !run.injury,
    Q = City.quality(run, id),
    x = (Q.known ? Q.q : (REGIONS[s.region] || REGIONS.open).q) * (1 + City.turf(run, id)) * DAY_GAIN, // one day's session at the advertised quality (City.day trains × DAY_GAIN)
    pv = Training.preview(run, key, hard, x),
    turf = City.turf(run, id),
    gain = ([k, , xp], role) => {
      if (STATK.includes(k) && Run.you(run)[k] >= TRAIN_CAP)
        return `<div class="pgain"><span class="pi">${statI(statKey(k), 20)}</span><span>${STATNAME[k]}${role}</span><b class="mute">at ${TRAIN_CAP} — matches only</b></div>`;
      // the session's XP ÷ what a point of this stat costs now ≈ points this session (owner, 2026-10-03: a rating, not "+1 in n"); the count on hover
      const pr = Training.progress(run, k),
        n = Math.max(1, Math.ceil((pr.need - pr.have) / Math.max(0.01, xp))),
        r = xp / Math.max(1, pr.need),
        [label, cls] = r >= 3 ? ['EXP +++', 'up'] : r >= 1 ? ['EXP ++', 'up'] : r >= 0.25 ? ['EXP +', ''] : ['Almost no EXP', 'mute']; // ≈ points this session: 3+ · 1+ · ¼+ · less
      return `<div class="pgain"><span class="pi">${statI(statKey(k), 20)}</span><span>${STATNAME[k]}${role}</span><b class="${cls}" ${tip(n <= 1 ? 'Next point this session' : `Next point in ${n} sessions here`)}>${label}</b></div>`;
    },
    mates = pv.mates.filter(pid => squadOf(T).some(p => p.id === pid)), // a teammate who has since left
    seg = `<div class="seg"><button class="btn ${hard ? '' : 'on'}" onclick="CW.hard=false;mapPick(CW.spot)">Normal</button><button class="btn ${hard ? 'on' : ''}" ${
      run.injury
        ? `disabled ${tip('Injured: light training only')}`
        : tip(`Hard: EXP ×${TRAIN_X.hard.gain}, stamina ×${TRAIN_X.hard.sta}, ${Math.round(TRAIN_X.hard.fail * 100)}% fail`)
    } onclick="CW.hard=true;mapPick(CW.spot)">Hard</button></div>`,
    chips = mates.length
      ? `<div class="pmates" ${tip('Teammates training here: more EXP together')}>${mates
          .map(pid => {
            const m = squadOf(T).find(p => p.id === pid);
            return `<span class="pchip">${faceSVG(m, 0.3, 18)}${esc(m.name.split(' ')[0])} +${(Run.you(run).bond[pid] || 0) >= 80 ? 50 : 20}%</span>`;
          })
          .join('')}</div>`
      : '';
  return {
    kind: 'Training',
    tags: [
      ptag(
        `Lv ${pv.lvl}`,
        pv.fixed
          ? 'Facility level: fixed — the Academy keeps this gym basic.'
          : `Facility level: grows with use${pv.next != null ? ` — ${pv.next} more sessions to Lv ${pv.lvl + 1}` : ' — top level'}.`
      ),
      s.sand ? ptag(`Sand ×${SAND_SP} pts`, `Sand training builds technique: skill points ×${SAND_SP}`) : '',
      pv.fail // a risk: stays visible (§10.8 never hides penalties)
        ? ptag(
            `${Math.round(pv.fail * 100)}% fail`,
            `Below 50 stamina training can fail — below ${TRAIN_X.injuryAt} it can injure you.`,
            pv.fail > 0.25 ? 'bad' : 'warn'
          )
        : ''
    ].filter(Boolean),
    after: placeDetails(
      id,
      [
        pv.streak ? ['Streak', `+${Math.round(pv.streak * 100)}%`, 'up'] : null,
        turf ? ['Turf', `+${Math.round(turf * 100)}%`, 'up'] : null,
        ...placeTags(run, id, City.trip(run, City.at(run, id)))
      ].filter(Boolean)
    ),
    flavour: s.desc || '',
    // a little of every stat (the Academy Gym) lists them all with no main / side
    body: pv.more.length
      ? [pv.main, pv.side, ...pv.more].map(r => gain(r, '')).join('')
      : gain(pv.main, ' <i class="mute">· main</i>') + gain(pv.side, ' <i class="mute">· side</i>'),
    opts: seg + chips,
    go: `<button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${id}')" ${c.ok ? '' : `disabled ${tip(c.why)}`}>Train ${TRAININGS[key].name} · ${term('day', String(City.cost(run, id)), 'cost')} ${term('sta', -pv.sta, 'cost')} $${City.price(run, id)}</button>`
  };
}

/** The challenge row of a club's card: `⚔ Challenge {verdict} ›`; its peek holds accepts / why / crew / injury / stake and Challenge / Sim ⏭. */
function challengeBlock(run, ti) {
  const W = Fight.worth(run, ti, (CW.stake || {})[ti] || 0);
  if (!W) return '';
  const side = Fight.challengeSide(run),
    st = Math.min((CW.stake || {})[ti] || 0, Fight.stakeMax(run)),
    cost = City.scoutCost(run, ti),
    late = run.event
      ? 'answer the event first'
      : Fight.ban(run) || City.noTime(run, cost) || (run.money < side.cost ? `needs $${side.cost} for a street crew` : ''),
    risk = Math.round(Fight.injuryRisk(run, run.teams[ti].ovr) * 100),
    hot = W.verdict === 'likely' ? 'hot' : '';
  const body = `<div class="lab" ${tip('Challenge their squad for a stake: they may refuse. Win and the stake pays at odds; lose and it is gone.')}>Challenge</div>${kv(
    [
      ['Accepts', `<b>${W.verdict}</b>`, W.verdict === 'refuses' ? 'mute' : ''],
      ['Why', esc(W.why)],
      side.kind === 'hired' ? ['Street crew', `$${side.cost}`] : null,
      [
        'Injury',
        `<span ${tip('Before the match: grows with their rating above yours, how badly you lose, low stamina and fighting again soon. Win or lose.')}>~${risk}%</span>`
      ],
      [
        'Stake',
        `<span class="pstep"><button class="btn" onclick="mapStake(${ti},-1)" ${st <= 0 ? 'disabled' : ''} aria-label="Lower the stake">−</button><b>$${st}</b><button class="btn" onclick="mapStake(${ti},1)" ${st + CHALLENGE.stakeStep > Fight.stakeMax(run) ? 'disabled' : ''} aria-label="Raise the stake">+</button></span>`
      ]
    ]
  )}
    <div class="acts pri"><button class="btn ${hot}" onclick="CW.peek=null;mapChallenge(${ti})" ${late ? `disabled ${tip(late)}` : ''}>Challenge · ${cost}d</button><button class="btn" onclick="CW.peek=null;mapChallenge(${ti}, true)" ${late ? 'disabled' : ''} ${tip(GLOSSARY.sim.long)}>Sim ⏭</button></div>`;
  // collapsed to one row (§10.8): verdict at a glance, the rest in the peek
  return `<section class="pchal">${peek(`ch:${ti}`, `⚔ Challenge <span class="${W.verdict === 'likely' ? 'up' : 'mute'}">${W.verdict}</span>`, body, 'row')}</section>`;
}
/** An official venue's card (spec §4.21): what is held there, and whether your match is there this week. */
function venuePanel(run, id) {
  const v = VENUES[id];
  if (!v) return '';
  return placeCard({
    region: v.region,
    kind: 'Venue',
    title: `🏟 ${esc(v.name)}`,
    tags: City.venue(run) === id ? [ptag('This week: your match', '', 'sel')] : [],
    body: kv(v.held.map((h, i) => [i ? '' : 'Held here', esc(h)])),
    ...courtCard(run, id) // court matches (T-229)
  });
}
function hqPanel(run, ti) {
  const t = run.teams[ti],
    f = FACTIONS[ti],
    free = World.isFree(run),
    j = World.canJoin(run, ti),
    sc = City.scoutCost(run, ti),
    late = run.event ? 'answer the event first' : City.noTime(run, sc) || City.fence(run),
    seen = City.scouted(run, ti);
  const H = seen ? Dossier.habits(t) : null,
    habits = H
      ? Dossier.habitText(H)
          .split(' · ')
          .map((h, i) => [i ? '' : 'Habits', esc(h[0].toUpperCase() + h.slice(1))])
      : [],
    rep = City.rep(run, f.region),
    scouted = seen
      ? `<div class="pdet">${peek(
          `ro:${ti}`,
          `Roster · ${squadOf(t).length}`,
          `<div class="lab">Roster</div><div class="roster">${squadOf(t)
            .map(p => {
              const techs = Skills.techs(p),
                more = [p.elOn ? ENAME[p.el] : '', techs.join(', ')].filter(Boolean).join(' — ');
              return `<div class="prow" ${more ? tip(more) : ''}>${faceSVG(p, 0, 22)}<span class="prn"><b>${stag(p)}${esc(p.name)}</b></span><span class="prr"><span class="mute">${p.role}${t.bench && t.bench.includes(p) ? ' bench' : ''}</span> <b>${ovr(p)}</b></span></div>`;
            })
            .join('')}</div>`
        )}${peek(`hb:${ti}`, 'Habits', kv(habits))}</div>`
      : '';
  return placeCard({
    region: f.region,
    kind: ti === run.team ? 'Your club' : 'Club HQ',
    title: `${chip(t)}${esc(t.name)}`,
    flavour: `${f.front}.${seen ? ` Word is: ${f.dark}.` : ''}`,
    tags: [
      ptag(`Rating ${t.ovr}`),
      rep ? ptag(`⚑ ${fmtDelta(rep)}`, GLOSSARY.standing.long, rep < 0 ? 'bad' : '') : '', // hidden at 0 (§10.8)
      free && j.ok ? ptag('Would sign you', esc(World.joinText(ti, run)), 'sel') : ''
    ].filter(Boolean),
    row: [
      free
        ? `<button class="btn ${j.ok ? 'hot' : 'lock'}" onclick="joinClub(${ti})" ${j.ok ? '' : `disabled ${tip(`They ask: ${World.joinText(ti, run)}. Missing: ${j.why.join(', ')}`)}`}>${j.ok ? 'Sign' : esc(joinGap(run, ti))}</button>`
        : '',
      ti !== run.team
        ? `<button class="btn" onclick="mapScout(${ti})" ${late ? `disabled ${tip(late)}` : tip(`A day at their HQ${sc > 1 ? ' (+ the trip)' : ''}: see their roster and elements, hear a rumour. −${SCOUT_STA} stamina`)}>${seen ? 'Scout again' : 'Scout'} · ${sc}d</button>`
        : '',
      `<button class="btn" onclick="openDossier('${f.region}')" ${tip(`Everything you know about ${REGIONS[f.region].name}`)}>Dossier</button>`
    ].filter(Boolean),
    split: free ? 'three' : 'two',
    after: challengeBlock(run, ti) + scouted
  });
}
