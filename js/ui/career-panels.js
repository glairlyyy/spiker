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
    trip ? ['Walk', `${trip} h there`, trip >= 4 ? 'wa' : ''] : null
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
  [id => id.startsWith('pt:'), (run, id) => pointCard(run, MapModel.ptOf(id))],
  [id => SPOTS[id] && SPOTS[id].act === 'ride', (run, id) => marketPanel(run, id)]
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
    trOk = trip && !run.event && !City.noTime(run, trip, at) && !City.outside(run, at),
    travel = trip
      ? `<button class="btn" onclick="mapTravel(${at[0]},${at[1]})" ${trOk ? '' : `disabled ${tip(City.noTime(run, trip, at) || (City.outside(run, at) ? City.fence(run) : 'answer the event first'))}`}>Walk · ${trip} h</button>${runBtn(run, at, trOk ? '' : City.noTime(run, trip, at) || City.fence(run) || 'answer the event first')}`
      : '',
    base = { region: City.region(run, sid), title: `${s.icon} ${esc(s.name)}`, after: placeDetails(sid, placeTags(run, sid, trip)) };
  if (s.kit) {
    const T = kitSpot(run, sid);
    return placeCard({ ...base, ...T, row: [travel].filter(Boolean) });
  }
  base.after = hourSeg(HOURS.stretch) + ordList(run, sid, false) + base.after; // Stretch at every place (spec §4.33, T-355)
  if (s.act === 'ramen')
    return placeCard({
      ...base,
      kind: 'Outing',
      flavour: s.desc,
      body: `<p class="small">Pick who comes · $${cost} · ${City.hoursAt(sid)} h</p><div class="pmates">${Run.mates(run)
        .map(
          m =>
            `<button class="btn" onclick="mapGo('${sid}','${m.id}')" ${City.can(run, sid, m.id).ok ? '' : 'disabled'}>${faceSVG(m, 0, 22)} ${esc(m.name)} <small class="mute">Bond ${Run.you(run).bond[m.id] || 0}</small></button>`
        )
        .join('')}</div>${c.ok || c.why === 'pick a teammate' ? '' : `<p class="small mute">${esc(c.why)}</p>`}`,
      row: [travel].filter(Boolean)
    });
  const study = studyPanel(run, sid, base, travel); // the tutor / a bookstore (T-230)
  if (study) return study;
  if (s.secret) return secretPanel(run, sid, base, travel, City.hoursAt(sid), cost);
  const label = s.act === 'rec' ? 'Relax' : 'Go';
  if (s.act === 'rest')
    return placeCard({
      ...base,
      kind: 'Sleep',
      flavour: s.desc,
      body: sleepRows(run, sid, trip, cost),
      after: base.after,
      tags:
        sid === 'home'
          ? [ptag(`${esc(HOUSING[run.housing].name)} · sleep ×${World.restMul(run)}`, 'Your home: how much a night’s sleep restores')]
          : [],
      row: [travel].filter(Boolean)
    });
  return placeCard({
    ...base,
    kind: s.act === 'street' ? 'Street' : 'Place',
    flavour: s.desc,
    after: base.after,
    tags: [], // cost and hours are on the button
    row: [
      `<button class="btn ${c.ok ? 'hot' : ''}" onclick="mapGo('${sid}')" ${c.ok ? '' : `disabled ${tip(c.why)}`}>${label} · ${City.hoursAt(sid)} h${cost ? ` · $${cost}` : ''}</button>`,
      travel
    ].filter(Boolean)
  });
}
/**
 * Sleep at home or a hotel (spec §4.41): one row per length (8 h first — the card's primary), each cost → result: the walk there,
 * the hours, the hotel's price → the stamina it brings back, when you wake; 4 h costs mood. Sleeping ends the day.
 */
function sleepRows(run, sid, trip, cost) {
  const s = SPOTS[sid],
    mul = s.hotel ? HOTEL.rest : World.restMul(run),
    miss = run.staMax - run.sta,
    ins = Feel.has(run, 'insomnia') ? SCARS.insomnia.k : 1;
  return `<div class="ords sleep">${[...DAY.sleepH]
    .reverse()
    .map((h, i) => {
      const c = City.can(run, sid, null, h),
        gain = Math.round(miss * Math.min(1, DAY.sleep[h] * mul * ins)),
        wake = City.hhmm(City.hour(run) + trip + h),
        cst = [trip ? term('day', `${trip} h`, 'cost') : '', term('day', `${h} h`, 'cost'), cost ? `$${cost}` : '']
          .filter(Boolean)
          .join(' '),
        res = [
          gain >= miss && miss > 0 ? 'stamina full' : term('sta', gain),
          DAY.sleepMood[h] ? `<span class="dn">mood down</span>` : '',
          `wake ${wake}`
        ]
          .filter(Boolean)
          .join(' · ');
      return `<button class="btn ord ${i === 0 && c.ok ? 'hot' : ''}" onclick="mapGo('${sid}',null,${h})" ${c.ok ? '' : `disabled ${tip(c.why)}`}><b class="onm">Sleep ${h} h</b><span class="oln">${cst} → ${res}</span></button>`;
    })
    .join('')}<small class="mute">Sleeping ends the day.</small></div>`;
}
/** A secret place's card (spec §4.31): what it does, its one action (the Lighthouse: two), the gap when it can't. */
function secretPanel(run, sid, base, travel, days, cost) {
  const S = Secret.of(run),
    go = (label, opt = '', hot = true) => {
      const c = City.can(run, sid, opt || undefined);
      return `<button class="btn ${c.ok && hot ? 'hot' : ''}" onclick="mapGo('${sid}'${opt ? `,'${opt}'` : ''})" ${c.ok ? '' : `disabled ${tip(c.why)}`}>${label} · ${days} h${cost ? ` · $${cost}` : ''}</button>`;
    },
    seen = Secret.seen(run),
    body =
      {
        tapes: seen.length
          ? `<ul class="small">${seen.map(h => `<li>${esc(h.text)}</li>`).join('')}</ul>`
          : `<p class="small mute">Nothing watched yet.</p>`,
        hermit:
          SECRET.hermit.bars[S.trials || 0] != null
            ? `<p class="small">Next trial: your best stat at <b>${SECRET.hermit.bars[S.trials || 0]}</b>${(run.secretMoves || []).length ? ` · learned: ${esc(run.secretMoves.join(', '))}` : ''}</p>`
            : `<p class="small mute">He has taught you everything: ${esc((run.secretMoves || []).join(', '))}.</p>`
      }[sid] || '';
  const row = {
    tapes: [go('Watch')],
    light: [go('Let it go', 'let'), go('Sharpen it', 'sharp', false)],
    hermit: [go('Take the trial')],
    roof: [go('Read the letter')],
    onsen: [go('Soak')],
    midnight: [go('Play the night game')],
    oldScout: [go('Ask for the number')]
  }[sid];
  return placeCard({ ...base, kind: 'Secret', flavour: SPOTS[sid].desc, body, row: [...row, travel].filter(Boolean) });
}
/** Any point of the island: travel there (the fog lifts around it). */
function pointPanel(run, p) {
  const d = City.travelDays(run, p),
    seen = City.seen(run, p),
    r = City.regionAt(p),
    late = run.event ? 'answer the event first' : City.noTime(run, d, p) || (City.outside(run, p) ? City.fence(run) : '');
  return placeCard({
    region: seen ? r : null,
    kind: 'Travel',
    title: `⚑ ${seen ? esc(REGIONS[r].name) : 'Unexplored land'}`,
    tags: d >= 4 ? [ptag(`Walk ${d} h`, '', 'warn')] : [],
    flavour: seen ? REGIONS[r].desc : 'Nobody you know has been out there. Go and see what you find.',
    row: [
      `<button class="btn hot" onclick="mapTravel(${p[0]},${p[1]})" ${late ? `disabled ${tip(late)}` : ''}>Walk here · ${d} h → ${City.hhmm(City.hour(run) + d)}</button>`
    ]
  });
}
/** The battle's border line: "Wu Harbor 100 · Wei Iron 84" (the two units on it, by Strength), or that they don't touch. */
function clashBorder(run, att, def) {
  const U = Front.units(run, att, def),
    short = r => esc(REGIONS[r].name.split(' ')[0]);
  return U
    ? U.map(u => `<span ${tip(GLOSSARY.strength.long)}>${esc(WAR.units[u].name)} <b>${War.str(run, u)}</b></span>`).join(' · ')
    : `${short(att)} can't reach ${short(def)}`;
}
/**
 * This week's street battle (spec §10.1a, HubBattle): the facts top-down, one card per side (cost, injury, Win and Lose
 * effects one per line), the Play it / Sim it option, then one row: Fight for A, Fight for B, Watch.
 */
/** The Raid order on the battle card (T-318): cost → result; disabled with the reason (only shown to a member on this border). */
function raidBtn(run, d) {
  const why = Fight.raidWhy(run);
  if (why === "your club isn't on this border" || why === 'no hot border this week') return '';
  return `<button class="btn" onclick="mapRaid()" ${why ? `disabled ${tip(why)}` : tip(`A street game against their crew, played at once. Win: their Strength −${WAR.lose * DAY_ORDERS.raid.k} (× 2). Lose: yours −${WAR.lose}.`)}>Raid · ${d} h · ${term('sta', -DAY_ORDERS.raid.sta, 'cost')} → Strength ×${DAY_ORDERS.raid.k}</button>`;
}
function clashPanel(run) {
  const c = Fight.clashSite(run);
  if (!c) return `<p class="small mute">The street battle is over.</p>`;
  const d = Fight.clashCost(run),
    trip = d - DAY.act,
    late = run.event ? 'answer the event first' : City.noTime(run, d) || City.fence(run),
    ban = Fight.ban(run),
    att = run.clash.att || c.a,
    def = att === c.a ? c.b : c.a,
    short = r => esc(REGIONS[r].name.split(' ')[0]),
    side = r => `<span ${tip(REGIONS[r].name)}>${chip(REGIONS[r])}${short(r)}</span>`,
    border = (w, l) => {
      const s = Front.stakes(run, w, l);
      return s.unit
        ? `<span ${tip(`${WAR.units[s.unit].name} Strength. ${GLOSSARY.strength.long}`)}>${esc(WAR.units[s.unit].name.split(' ').slice(-1)[0])} ${s.str} → <b>${s.after}</b></span>`
        : `${short(w)} can't reach ${short(l)}`;
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
    call = Fight.calledFor(run), // your club calls you up (spec §4.34): its side's button is the primary
    fight = s =>
      `<button class="btn ${s === call && !late && !ban ? 'hot' : ''}" onclick="mapClash('${s}', CW.clashSim)" ${late || ban ? `disabled ${tip(ban || late)}` : tip(`Injury ~${risk(s === c.a ? c.b : c.a)}%. A real match with their crew: XP, techniques and a grade. A loss costs ${LOSS.sta} more stamina and mood.`)}>${chip(REGIONS[s])}Fight for ${short(s)}${sim ? ' ⏭' : ''}</button>`;
  return placeCard({
    region: null,
    kind: 'Street battle',
    title: `⚔ ${esc(c.name[0].toUpperCase() + c.name.slice(1))}`,
    flavour: "Crews from both sides are settling it on the street this week. If nobody joins, it is settled at the week's end.",
    body: `${kv([
      call ? ['Call-up', `<span ${tip(WAR_CALL.lines[call])}>${esc(WAR_CALL.lines[call])}</span>`, 'wa'] : null,
      call
        ? [
            'Refuse',
            `${term('standing', WAR_CALL.refuse)} ${short(call)} <span class="mute">— stay away, watch, or fight for ${short(call === c.a ? c.b : c.a)}</span>`,
            'dn'
          ]
        : null,
      ['Attacker', side(att)],
      ['Defender', side(def)],
      ['Border', clashBorder(run, att, def)],
      std(c.a),
      std(c.b),
      ['Walk', trip ? `${trip} h` : 'None', trip >= 4 ? 'wa' : '']
    ])}<div class="pstakes">${card(c.a, c.b)}${card(c.b, c.a)}</div>`,
    opts:
      late || ban
        ? ''
        : `<div class="seg" aria-label="Fight"><button class="btn ${sim ? '' : 'on'}" onclick="CW.clashSim=false;mapPick('clash')">Play it</button><button class="btn ${sim ? 'on' : ''}" onclick="CW.clashSim=true;mapPick('clash')" ${tip(GLOSSARY.sim.long)}>Sim it</button></div>`,
    row: [
      fight(c.a),
      fight(c.b),
      `<button class="btn" onclick="mapClash(null)" ${late ? `disabled ${tip(late)}` : tip(`See both sides' clubs in action: scouts them. −${CLASH.watchSta} stamina`)}>Watch · ${d} h</button>`,
      raidBtn(run, d)
    ]
  });
}

/** The session's XP ÷ what a point costs now ≈ points this session (owner, 2026-10-03: a rating, not "+1 in n"): '+++' 3+ · '++' 1+ · '+' ¼+ · '·' less. */
function xpRate(run, k, xp) {
  if (k !== 'wit' && Training.level(Run.you(run), k) >= Training.cap(run)) return { t: 'at cap', cls: 'mute', n: Infinity };
  const pr = Training.progress(run, k),
    r = xp / Math.max(1, pr.need);
  return {
    t: r >= 3 ? '+++' : r >= 1 ? '++' : r >= 0.25 ? '+' : '·',
    cls: r >= 1 ? 'up' : r >= 0.25 ? '' : 'mute',
    n: Math.max(1, Math.ceil((pr.need - pr.have) / Math.max(0.01, xp)))
  };
}
/** One day's gain multiplier at a place as the card shows it: the advertised quality × home turf × DAY_GAIN (quality stays hidden, §4.3). */
function dayX(run, id) {
  const s = SPOTS[id];
  if (!s.kit) return DAY_GAIN;
  const Q = City.quality(run, id);
  return (Q.known ? Q.q : (REGIONS[s.region] || REGIONS.open).q) * (1 + City.turf(run, id)) * DAY_GAIN;
}
const ORD_KIND = { work: 'Work', stretch: 'Free' };
/** The hours an order runs for the card's picker (CW.hrs, spec §4.41): the longest of its options not over the pick, else its first. */
function ordHours(oid) {
  const O = City.hourOpts(oid),
    h = CW.hrs || 2;
  return O.filter(v => v <= h).pop() || O[0];
}
/** The hour picker (spec §4.41): `opts` hours as a segmented control; the pick re-renders the card (CW.hrs). Selected ≠ primary (§9). */
function hourSeg(opts = HOURS.opts) {
  const on = opts.filter(v => v <= (CW.hrs || 2)).pop() || opts[0];
  return `<div class="seg hrs" role="group" aria-label="Hours" ${tip('How long: longer gains more, but each hour costs more stamina than the last and the injury risk climbs')}>${opts
    .map(
      h => `<button class="btn ${h === on ? 'on' : ''}" aria-pressed="${h === on}" onclick="CW.hrs=${h};mapPick(CW.spot)">${h} h</button>`
    )
    .join('')}</div>`;
}
/**
 * A place's day orders (spec §4.33), each one button: name, then cost → result for the picked hours ("3 h · −52 · $12 → ▲ Str +++ ·
 * ∿ Flex +", §4.41). The lead drill is the card's one ink primary (`lead`); an order it can't do now shows why (the gap) on hover.
 */
function ordList(run, id, lead = true) {
  const hard = CW.hard && !run.injury,
    first = lead ? City.lead(id) : null;
  return `<div class="ords">${City.orders(id)
    .map(oid => {
      const O = DAY_ORDERS[oid],
        h = ordHours(oid),
        pv = Training.preview(run, oid, hard, dayX(run, id) * Training.units(h), id, h),
        c = City.can(run, id, oid, h),
        price = City.price(run, id, oid, h);
      return ordBtn(run, O, pv, c, `mapGo('${id}','${oid}',${h})`, h, price, oid === first && c.ok);
    })
    .join('')}</div>`;
}
/** One order's button (cost → result on the control): its hours (the walk there shows on the Walk button and today's strip). */
function ordBtn(run, O, pv, c, onclick, days, price, hot) {
  const res = [pv.main, pv.side, ...pv.more]
      .map(([k, , xp]) => {
        const r = xpRate(run, k, xp);
        return `<span class="${hot ? '' : r.cls}" ${tip(r.n === Infinity ? `${Body.name(k)}: at the cap this season — matches only` : r.n <= 1 ? `${Body.name(k)}: next point this session` : `${Body.name(k)}: next point in ${r.n} sessions`)}>${Body.glyph(k)} ${BODY.short[k] || 'Wit'} ${r.t}</span>`;
      })
      .join(' · '),
    cost = [term('day', `${days} h`, 'cost'), term('sta', -pv.sta, 'cost'), price ? `$${price}` : 'free'].join(' ');
  return `<button class="btn ord ${hot ? 'hot' : ''}" onclick="${onclick}" ${c.ok ? '' : `disabled ${tip(c.why)}`}><b class="onm">${esc(O.name)}${ORD_KIND[O.kind] ? ` <small>${ORD_KIND[O.kind]}</small>` : ''}</b><span class="oln">${cost} → ${res}${pv.pay ? ` · <b>+$${pv.pay}</b>` : ''}</span></button>`;
}
/** A kit place's parts for placeCard (spec §4.33): kind, tags, the orders first, then options (Normal / Hard), who's on the floor, level. */
function kitSpot(run, id) {
  const s = SPOTS[id],
    T = Run.myTeam(run),
    hard = CW.hard && !run.injury,
    lh = ordHours(City.lead(id)),
    pv = Training.preview(run, City.lead(id), hard, dayX(run, id) * Training.units(lh), id, lh),
    turf = City.turf(run, id),
    mates = pv.mates.filter(pid => squadOf(T).some(p => p.id === pid)), // a teammate who has since left
    seg = `<div class="seg"><button class="btn ${hard ? '' : 'on'}" onclick="CW.hard=false;mapPick(CW.spot)">Normal</button><button class="btn ${hard ? 'on' : ''}" ${
      run.injury
        ? `disabled ${tip('Injured: light training only')}`
        : tip(`Hard: EXP ×${TRAIN_X.hard.gain}, stamina ×${TRAIN_X.hard.sta}, ${Math.round(TRAIN_X.hard.fail * 100)}% fail`)
    } onclick="CW.hard=true;mapPick(CW.spot)">Hard</button></div>`,
    chips = mates.length
      ? `<div class="pmates" ${tip(`Teammates training here: more EXP together. A friend (bond ${GIFT_RUB.bond}+) shares a body or growth gift.`)}>${mates
          .map(pid => {
            const m = squadOf(T).find(p => p.id === pid),
              rubs = (pv.rub || []).filter(r => r.id === pid), // what rubs off (spec §4.35, T-323)
              note = rubs.map(r => `${GIFTS[r.gift].name} rubs off: ${r.key ? Body.name(r.key) : 'every gain'} ×${r.x}`).join('\n');
            return `<span class="pchip" ${note ? tip(note) : ''}>${faceSVG(m, 0.3, 18)}${esc(firstName(m))} +${(Run.you(run).bond[pid] || 0) >= 80 ? 50 : 20}%${rubs.map(r => ` · ${esc(GIFTS[r.gift].name)} ×${r.x}`).join('')}</span>`;
          })
          .join('')}</div>`
      : '';
  return {
    kind: 'Facility',
    tags: [
      ptag(
        `Lv ${pv.lvl}`,
        pv.fixed
          ? 'Facility level: fixed — the Academy keeps this gym basic.'
          : `Facility level: grows with every session here${pv.next != null ? ` — ${pv.next} more 2 h sessions to Lv ${pv.lvl + 1}` : ' — top level'}.`
      ),
      ptag(esc(s.kit.map(t => KITS[t].name).join(' · ')), 'The kit: what you can do here'),
      s.sand ? ptag(`Sand ×${SAND_SP} pts`, `Sand training builds technique: skill points ×${SAND_SP}`) : '',
      pv.fail // a risk: stays visible (§10.8 never hides penalties)
        ? ptag(
            `${Math.round(pv.fail * 100)}% fail`,
            `Below 50 stamina training can fail — below ${TRAIN_X.injuryAt} it can injure you. Long sessions (3–4 h) can fail and injure even rested.`,
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
    body: ordList(run, id),
    opts: hourSeg() + seg + chips
  };
}
/** Run there (spec §4.33, T-309): faster than walking (§4.41), the route's ground trains you — "Run · 2 h · −22 → ◆ End ++". `late`: why the trip can't happen now. */
function runBtn(run, p, late = '') {
  const P = City.runPlan(run, p),
    why = late || City.noRun(run, p),
    mul = Training.mul(run, 'run', false, DAY_GAIN),
    res = BODY.keys
      .filter(k => P.gains[k])
      .map(k => {
        const r = xpRate(run, k, Training.xpFor(k, P.gains[k], mul));
        return `<span class="${r.cls}">${BODY.glyph[k]} ${BODY.short[k]} ${r.t}</span>`;
      })
      .join(' · ');
  if (!P.sta) return '';
  return `<button class="btn run" onclick="mapTravel(${p[0]},${p[1]},'run')" ${why ? `disabled ${tip(why)}` : tip('Run the route: its ground trains you (roads: Endurance; dirt and mountain paths: + Strength; boardwalk: Agility; the Steps: Strength + Agility)')}>Run · ${P.days} h ${term('sta', -P.sta, 'cost')} → ${res}</button>`;
}
/** Stretch at map point p (spec §4.33: the island is the gym): the hour picker + its order button (cost → result); `pre`: rows before it. */
function stretchAt(run, p, pre = '') {
  const h = ordHours('stretch'),
    pv = Training.preview(run, 'stretch', false, DAY_GAIN * Training.units(h), null, h);
  return `<div class="ords">${pre}${hourSeg(HOURS.stretch)}${ordBtn(run, DAY_ORDERS.stretch, pv, City.pointCan(run, p, 'stretch', h), `mapStretch(${p[0]},${p[1]},${h})`, h, 0, false)}</div>`;
}
/** A map point's card (B's pointPanel) + Run and Stretch there: the order block goes inside the card. */
function pointCard(run, p) {
  const html = pointPanel(run, p),
    late = run.event
      ? 'answer the event first'
      : City.noTime(run, City.travelDays(run, p), p) || (City.outside(run, p) ? City.fence(run) : ''),
    blk = stretchAt(run, p, runBtn(run, p, late)),
    i = html.lastIndexOf('</div>');
  return i < 0 ? html : html.slice(0, i) + blk + html.slice(i);
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
    <div class="acts pri"><button class="btn ${hot}" onclick="CW.peek=null;mapChallenge(${ti})" ${late ? `disabled ${tip(late)}` : ''}>Challenge · ${cost} h</button><button class="btn" onclick="CW.peek=null;mapChallenge(${ti}, true)" ${late ? 'disabled' : ''} ${tip(GLOSSARY.sim.long)}>Sim ⏭</button></div>`;
  // collapsed to one row (§10.8): verdict at a glance, the rest in the peek
  return `<section class="pchal">${peek(`ch:${ti}`, `⚔ Challenge <span class="${W.verdict === 'likely' ? 'up' : 'mute'}">${W.verdict}</span>`, body, 'row')}</section>`;
}
/** An official venue's card (spec §4.21): what is held there, and whether your match is there this week. */
function venuePanel(run, id) {
  const v = VENUES[id];
  if (!v) return '';
  const C = courtCard(run, id); // court matches (T-229)
  return placeCard({
    region: v.region,
    kind: 'Venue',
    title: `🏟 ${esc(v.name)}`,
    tags: City.venue(run) === id ? [ptag('This week: your match', '', 'sel')] : [],
    body: kv(v.held.map((h, i) => [i ? '' : 'Held here', esc(h)])),
    ...C,
    after: stretchAt(run, v.at) + (C.after || '') // Stretch at every place (T-355)
  });
}
/**
 * The overthrow row of a war unit's HQ card (spec §4.34): shown once the unit is Broken (or rallied and waiting); its peek holds
 * who you fight for, the ace squad, what a win / loss does, the cost, and Overthrow / Sim ⏭ — or the gap when you can't.
 */
function overthrowBlock(run, ti) {
  const u = War.ofClub(ti);
  if (!u || !War.alive(run, u) || (War.stage(run, u) < WAR_STAGES.length - 1 && !War.cool(run, u))) return '';
  const S = War.side(run, u),
    c = War.can(run, u, S && S.by),
    ace = War.ace(run, u),
    d = War.cost(run, u),
    late = !S
      ? 'your club has no border with it'
      : !c.ok
        ? c.why
        : run.event
          ? 'answer the event first'
          : Fight.ban(run) || City.noTime(run, d) || (run.money < S.cost ? `needs $${S.cost} for a street crew` : ''),
    name = esc(WAR.units[u].name),
    risk = Math.round(Fight.injuryRisk(run, ace.ovr) * 100);
  const body = `<div class="lab" ${tip(GLOSSARY.seize.long)}>Overthrow</div>${kv([
    late ? ['Locked', esc(late), 'mute'] : null,
    S
      ? [
          'For',
          `${chip(REGIONS[WAR.units[S.by].region])}${esc(WAR.units[S.by].name)}${S.kind === 'crew' ? ` · your street crew $${S.cost}` : ''}`
        ]
      : null,
    ['Against', `${esc(ace.name)} · rating ${ace.ovr}`],
    ['Lose', `${name} rallies +${WAR.rally}`, 'dn'],
    ['Win', `${name} destroyed: its land and places to ${S ? esc(WAR.units[S.by].name) : 'the winner'}`],
    ['Injury', `~${risk}%`]
  ])}
    <div class="acts pri"><button class="btn" onclick="CW.peek=null;mapOverthrow('${u}')" ${late ? `disabled ${tip(late)}` : ''}>Overthrow · ${d} h</button><button class="btn" onclick="CW.peek=null;mapOverthrow('${u}', true)" ${late ? 'disabled' : ''} ${tip(GLOSSARY.sim.long)}>Sim ⏭</button></div>`;
  return `<section class="pchal">${peek(`ot:${ti}`, `⚔ Overthrow <span class="${late ? 'mute' : 'dn'}">${esc(WAR_STAGES[War.stage(run, u)].name)} · ${War.str(run, u)}</span>`, body, 'row')}</section>`;
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
    mine = ti === run.team,
    win = World.window(run),
    wu = War.ofClub(ti),
    fall = wu && War.state(run).fallen[wu],
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
      fall ? ptag(`Destroyed by ${esc(WAR.units[fall.by].name)}`, GLOSSARY.seize.long, 'bad') : '',
      ptag(`Rating ${t.ovr}`),
      rep ? ptag(`⚑ ${fmtDelta(rep)}`, GLOSSARY.standing.long, rep < 0 ? 'bad' : '') : '', // hidden at 0 (§10.8)
      j.ok ? ptag('Would sign you', esc(World.joinText(ti, run)), 'sel') : '',
      mine ? tenureTag(run) : fall ? '' : windowTag(win)
    ].filter(Boolean),
    row: [
      !mine
        ? `<button class="btn ${j.ok ? 'hot' : 'lock'}" onclick="joinClub(${ti})" ${j.ok ? (free ? '' : tip(switchCost(run))) : `disabled ${tip(`They ask: ${World.joinText(ti, run)}. Missing: ${j.why.join(', ')}`)}`}>${j.ok ? (free ? 'Sign' : `Switch · ⚑ ${WINDOW.rep}`) : esc(win.open || Run.cupDef(run) ? (free ? joinGap(run, ti) : j.why[0]) : win.next ? `Window · W${win.next}` : 'Window shut')}</button>`
        : '',
      ti !== run.team
        ? `<button class="btn" onclick="mapScout(${ti})" ${late ? `disabled ${tip(late)}` : tip(`A day at their HQ${sc > 1 ? ' (+ the trip)' : ''}: see their roster and elements, hear a rumour. −${SCOUT_STA} stamina`)}>${seen ? 'Scout again' : 'Scout'} · ${sc} h</button>`
        : '',
      `<button class="btn" onclick="openDossier('${f.region}')" ${tip(`Everything you know about ${REGIONS[f.region].name}`)}>Dossier</button>`
    ].filter(Boolean),
    split: mine ? 'two' : 'three',
    after: stretchAt(run, CITY.hq[ti]) + overthrowBlock(run, ti) + challengeBlock(run, ti) + scouted + (mine ? leaveBlock(run, t) : '')
  });
}
/** The transfer window on another club's HQ card (spec §4.36 A): open now, or the week it opens. */
const windowTag = win =>
  win.open
    ? ptag('Window open', 'Registrations open this week (the week after an evaluation, or week 1)', 'sel')
    : ptag(win.next ? `Window opens W${win.next}` : 'Window shut', esc(win.why));
/** Weeks at your club and the next tenure step (spec §4.36 A). */
function tenureTag(run) {
  const n = World.tenure(run),
    steps = [
      [TENURE.ahead, `lineup +${TENURE.lineup}`],
      [TENURE.members, `members' price × ${TENURE.price}`],
      [TENURE.captain, 'captain eligible']
    ],
    nx = steps.find(([w]) => n < w);
  return ptag(
    `Tenure ${n}w`,
    `${steps.map(([w, t]) => `${w}+ weeks: ${t}${n >= w ? ' ✓' : ''}`).join(' · ')}${nx ? `. Next in ${nx[0] - n}w` : ''}`,
    nx ? '' : 'sel'
  );
}
/** What walking out costs (the Switch / Walk out controls): each teammate's memory, standing. */
function switchCost(run) {
  const T = Run.myTeam(run),
    n = squadOf(T).filter(p => p.id !== run.youId).length;
  return `Walk out of ${T.name}: ${n} teammates remember it (Loyal ones twice as hard), ${WINDOW.rep} standing with ${REGIONS[FACTIONS[run.team].region].name}. Tenure starts again.`;
}
/** Your club's HQ: walk out to go free (always open), behind a peek — the inline confirm. */
function leaveBlock(run, t) {
  if (Run.cupDef(run)) return '';
  const n = squadOf(t).filter(p => p.id !== run.youId).length,
    body = `<div class="lab">Walk out</div>${kv([
      ['Teammates', `${n} remember it`, 'dn'],
      ['Standing', `${WINDOW.rep} with ${esc(REGIONS[FACTIONS[run.team].region].name)}`, 'dn'],
      ['Tenure', `${World.tenure(run)}w → 0`, 'dn'],
      ['Then', 'free agent on the Academy squad']
    ])}<div class="acts pri"><button class="btn danger" onclick="CW.peek=null;leaveClub()">Walk out · ⚑ ${WINDOW.rep}</button></div>`;
  return `<section class="pchal">${peek(`lv:${t.i}`, 'Leave club', body, 'row')}</section>`;
}
function leaveClub() {
  if (World.leave(RUN)) Run.save(RUN);
  renderCareer();
}

// ---- transport (spec §4.42): the ways a trip can go, the Harbor Market ----------------------------------------------------
/** Where a selected place's trip goes (a map point), or null: a place, a club HQ, a venue, the street battle, a map point. */
function rideDest(run, id) {
  if (!id) return null;
  if (id.startsWith('pt:')) return MapModel.ptOf(id);
  if (id.startsWith('hq')) return CITY.hq[+id.slice(2)] || null;
  if (id.startsWith('venue:')) return VENUES[id.slice(6)] ? VENUES[id.slice(6)].at : null;
  if (id === 'clash') {
    const c = Fight.clashSite(run);
    return c ? c.at : null;
  }
  return SPOTS[id] ? City.at(run, id) : null;
}
/** One way's line on its button: what it costs → when you arrive (the bus / ferry: where you get on and off; the bike: what it trains). */
function rideLine(run, W) {
  const rides = W.legs.filter(l => l.from),
    via = rides.map(l => `${l.from} → ${l.to}`).join(', then '),
    mul = Training.mul(run, 'run', false, DAY_GAIN),
    gain =
      W.gains && W.gains.end
        ? (r => ` · <span class="${r.cls}">${BODY.glyph.end} ${BODY.short.end} ${r.t}</span>`)(
            xpRate(run, 'end', Training.xpFor('end', W.gains.end, mul))
          )
        : '',
    cost = [
      term('day', `${W.h} h`, 'cost'),
      W.sta ? term('sta', -W.sta, 'cost') : '',
      W.cost ? `$${W.cost}${W.dbl ? ' <span class="dn">fare ×2: standing</span>' : ''}` : 'free'
    ]
      .filter(Boolean)
      .join(' ');
  return `${cost} → arrive ${City.hhmm(W.arrive)}${gain}${TRANSPORT.skip.includes(W.k) ? ' · no road stops' : ''}${via ? ` · ${esc(via)}` : ''}`;
}
/** The ways to ride to the selected place (spec §4.42): one button each, cost → result; the gap printed when it can't go. Never pre-picked. */
function rideRow(run, id) {
  const p = rideDest(run, id);
  if (!p || CW.lock || !City.trip(run, p)) return '';
  const W = City.ways(run, p);
  if (!W.length) return '';
  return `<div class="popts pride"><span class="lab" ${tip('Faster than walking, each at a cost. A bus, the ferry or a taxi passes the road stops by; the bike trains a little.')}>Ride</span><div class="ords">${W.map(
    w =>
      `<button class="btn ord" onclick="mapTravel(${p[0]},${p[1]},'${w.k}')" ${w.why ? `disabled ${tip(w.why)}` : ''}><b class="onm">${esc(w.name)}</b><span class="oln">${w.why ? `<span class="dn">${esc(w.why)}</span>` : rideLine(run, w)}</span></button>`
  ).join('')}</div></div>`;
}
/** The Harbor Market (spec §4.42): buy the bike or the scooter — an hour there, its price → how it rides. */
function marketPanel(run, id) {
  const s = SPOTS[id],
    at = City.at(run, id),
    trip = City.trip(run, at),
    late = run.event ? 'answer the event first' : City.noTime(run, trip, at) || (City.outside(run, at) ? City.fence(run) : ''),
    res = {
      bike: `${TRANSPORT.bike.pace}× walking on roads · trains ${BODY.short.end}`,
      scooter: `${TRANSPORT.scooter.pace}× walking on roads · $${TRANSPORT.scooter.fuel} fuel an hour`
    };
  let hot = false;
  const rows = ['bike', 'scooter'].map(k => {
    const T = TRANSPORT[k],
      c = City.can(run, id, k),
      own = City.owns(run, k),
      h = !hot && c.ok ? (hot = true) : false;
    return `<button class="btn ord ${h ? 'hot' : ''}" onclick="mapGo('${id}','${k}')" ${c.ok ? '' : `disabled ${tip(c.why)}`}><b class="onm">${own ? `${esc(T.name)} <small>yours</small>` : `Buy the ${k}`}</b><span class="oln">${own ? esc(res[k]) : c.ok ? `${term('day', `${City.cost(run, id, k)} h`, 'cost')} $${T.price} → ${esc(res[k])}` : `<span class="dn">${esc(c.why)}</span>`}</span></button>`;
  });
  return placeCard({
    region: City.region(run, id),
    kind: 'Market',
    title: `${s.icon} ${esc(s.name)}`,
    flavour: s.desc,
    body: `<div class="ords">${rows.join('')}</div><small class="mute">Bought once. Not on mountain paths: Shu's highlands stay on foot.</small>`,
    row: trip
      ? [
          `<button class="btn" onclick="mapTravel(${at[0]},${at[1]})" ${late ? `disabled ${tip(late)}` : ''}>Walk · ${trip} h</button>${runBtn(run, at, late)}`
        ]
      : [],
    after: hourSeg(HOURS.stretch) + ordList(run, id, false) + placeDetails(id, placeTags(run, id, trip))
  });
}
