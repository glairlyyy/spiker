// Match state, scoring, zone/captain/timeout logic, and headless simulation helpers.

/** The team's players in rotation order, starting from the server (index 0); indices 1–2 are the front row. */
function rotOrder(t, idx) {
  const o = ROT.map(k => (k === 'S' ? t.s : k === 'MB' ? t.mb : t.ws[k === 'W0' ? 0 : 1]));
  return o.map((_, i) => o[(i + idx) % 4]);
}
/**
 * Not ready: a player still finishing a move (on the floor after a dive, running back from a jump serve) is busy
 * through possession `n` of the current rally (rally() counts possessions from 1). Teammates set and call around them.
 */
const busy = (m, p, n) => ((m.busy && m.busy[p.id]) || 0) >= n;
function setBusy(m, p, until) {
  m.busy[p.id] = Math.max(m.busy[p.id] || 0, until);
}
/** Can a player at `q` run to (x, z) within `ms` and play it on their feet, or must they dive? (metres: 3D scale) */
function mustDive(p, q, x, z, ms) {
  const d = Math.hypot((x - q.x) * 0.0243, (z - q.z) * 12);
  return d - 0.6 > (3 + (3 * p.speed) / 100) * Math.max(0, ms / 1000 - 0.12);
}
/**
 * Pop-up off the arms: a defender who reaches a hard ball but can't control it may still keep it in their own court.
 * Chance grows with their defense, shrinks with the ball's power. The nearest free teammate then chases it:
 * `popRecovery` picks where it drops (in `side`'s court), who goes for it and whether they save it.
 */
const popChance = (p, pow) => clamp(0.22 + (effD(p) - 60) / 250 - Math.max(0, pow - 100) / 300, 0.08, 0.45);
function popRecovery(m, side, T, first, x, z, pow, n) {
  const own = sx(side, x),
    px = sx(side, clamp(own + rnd(-130, 40), 110, 460)),
    pz = clamp(z + rnd(-0.3, 0.3), 0.08, 0.92),
    free = T.P.filter(p => p !== first && !busy(m, p, n)),
    rec = nearest(m, free.length ? free : T.P.filter(p => p !== first), px, pz),
    from = m.pos[rec.id],
    d0 = dist(from, px, pz),
    score = effD(rec) * 0.5 + rec.speed * 0.5 - d0 * 60 - pow * 0.1,
    ok = R() < clamp(0.45 + (score - 45) / 80, 0.15, 0.85);
  return { rec, px, pz, from: { x: from.x, z: from.z }, ok };
}
/** Beat acts for the pop-up: the ball loops off the arms, the teammate runs (or dives) to it. */
function popActs(m, P, dir, V, dur) {
  const a = [],
    tx = P.px - dir * 16,
    dive = mustDive(P.rec, P.from, tx, P.pz, dur);
  mv(m, P.rec, tx, P.pz, a, V);
  a.push(
    { k: 'pose', p: P.rec.id, pose: dive ? 'dive' : 'bump' },
    P.ok ? { k: 'ball', to: { p: P.rec.id, c: dive ? 'dive' : 'bump' }, h: 170 } : { k: 'ball', to: { x: P.px, z: P.pz, h: 0 }, h: 170 }
  );
  return { acts: a, dive };
}
/** Move a player in the engine; when recording (V), also push the matching slide act onto `arr`. */
function mv(m, p, x, z, arr, V) {
  m.pos[p.id] = { x, z };
  if (V) arr.push({ k: 'slide', p: p.id, x, z });
}
/** The player in `arr` who gets to (x, z) first (distance over speed). `arr` must not be empty. */
function nearest(m, arr, x, z) {
  let b = arr[0],
    bv = 1e9;
  for (const p of arr) {
    const v = dist(m.pos[p.id], x, z) / (0.5 + p.speed / 100);
    if (v < bv) {
      bv = v;
      b = p;
    }
  }
  return b;
}
/**
 * A fresh match between teams a and b. rec = record animation beats (playRally returns them).
 * opts.court: court size multiplier (default RULES.court); opts.tac: [tactic, tactic] fixes a side's tactic;
 * opts.dset: [setting, setting] fixes a side's defence setting (DEFSETS; default: the team's style, then the captain may switch it).
 */
function newMatch(a, b, rec, opts = {}) {
  const m = {
    court: opts.court || RULES.court,
    tac: [opts.tac?.[0] || 'auto', opts.tac?.[1] || 'auto'], // tactic in use per side (see TACTICS)
    tacMode: [opts.tac?.[0] ? 'fixed' : 'cap', opts.tac?.[1] ? 'fixed' : 'cap'], // 'cap' = the captain decides
    dset: [opts.dset?.[0] || defOf(a), opts.dset?.[1] || defOf(b)], // defence setting per side (see DEFSETS): how the front row blocks
    dsetMode: [opts.dset?.[0] ? 'fixed' : 'cap', opts.dset?.[1] ? 'fixed' : 'cap'], // 'cap' = the captain may switch it
    dsetLog: [], // engine-only: every captain switch { side, from, to }
    att: [0, 1].map(() => ({
      n: 0,
      k: 0,
      q: 0,
      qk: 0,
      mid: 0,
      midk: 0,
      pin: 0,
      pink: 0,
      dbl: 0,
      late: 0,
      stf: 0,
      qs: 0,
      mids: 0,
      pins: 0
    })), // attacks per side by kind and their kills (engine-only tally, no randoms)
    buff: {}, // player id → { lv, n } captain's buff (n = points left)
    t: [a, b],
    sets: [0, 0],
    pts: [0, 0],
    setNo: 1,
    serve: R() < 0.5 ? 0 : 1,
    rot: [0, 0],
    pos: {},
    setScores: [],
    over: false,
    winner: -1,
    stat: {},
    rec: !!rec,
    to: [0, 0],
    toReq: [0, 0],
    mom: [0, 0],
    mood: {},
    sta: {},
    streak: [0, 0],
    big: 0,
    zone: [0, 0],
    zoneHit: [0, 0], // did the side reach the zone at any point (career: the Element Trial)
    eg: {}, // element gauge (0–100) per unlocked player
    elLog: [], // element spikes fired: { p, el, side, won }
    ctx: null, // the attack being played (element gauge context)
    ctx0: null, // the attack the last point ended on (chatter)
    ctxK: null, // who scored a kill this rally (→ lastK)
    lastK: null,
    // per-rally state, reset by playRally()
    busy: {}, // player id → last possession they are still busy for (see busy())
    lastPlay: null, // 'killblock' | 'fake' — for the zone breaker
    hero: null,
    errBy: null,
    hypeRally: 0,
    // staged scenes (engine/hype.js)
    hypeAt: null, // points played at the last attack scene
    readAt: null, // …and at the last defense read
    hypeDef: false, // the current scene follows the defense
    defBeats: [] // the defense's scene beats this possession (dropDefScene)
  };
  [a, b].forEach((t, side) =>
    t.P.forEach(p => {
      const h = home(p, side);
      m.pos[p.id] = { x: h[0], z: h[1] };
      m.mood[p.id] = p.form || 0;
    })
  );
  return m;
}
/** Record stat `k` for a player ('top' keeps the maximum); moves mood (MOODD) and element gauges with it. */
function st(m, p, k, v = 1) {
  const s = m.stat[p.id] || (m.stat[p.id] = blank());
  if (k === 'top') s.top = Math.max(s.top, v);
  else {
    s[k] = (s[k] || 0) + v;
    if (MOODD[k]) md(m, p, MOODD[k]);
    if (k === 'k') m.ctxK = p.id;
    if (k === 'err') m.errBy = p.id;
    if (p.elOn && m.eg) elStat(m, p, k);
  }
}
const snap = m => ({
  pts: [...m.pts],
  serve: m.serve,
  over: m.over,
  mom: [...m.mom],
  zone: [...m.zone],
  buff: Object.fromEntries(Object.entries(m.buff || {}).map(([id, b]) => [id, b.lv])),
  eg: Object.assign({}, m.eg),
  mood: Object.assign({}, m.mood),
  sta: Object.assign({}, m.sta),
  rot: [0, 1].map(i => rotOrder(m.t[i], m.rot[i]).map(p => p.id))
});
/**
 * The captain leads on court. Leadership level 1–3 (see leadLv) sets how often they act and how strong it is:
 *  - Buff: pick a teammate (the hottest hitter, or one who is rattled) — +5%/lvl power & defense,
 *    +0.08/lvl wit and more sets for 4 points.
 *  - Tactic: in "Captain's call" mode, read who is scoring this match and switch WS / MB focus / setter's call.
 *  - Defence: in "Captain's call" mode, read the opponent's attack mix (m.att) and switch Read / Commit / Bunch.
 * Returns beats to show it (empty for simulations).
 */
function captainThink(m, side) {
  const t = m.t[side],
    cap = t.cap,
    lv = leadLv(cap),
    out = [];
  if (!lv) return out;
  const say = (text, extra = []) => m.rec && out.push({ dur: 750, acts: [{ k: 'call', p: cap.id, t: text }, ...extra] });
  // buff
  if (!t.P.some(p => m.buff[p.id]) && R() < 0.03 + 0.03 * lv) {
    const mates = t.P.filter(p => p !== cap),
      low = mates.find(p => (m.mood[p.id] || 0) < -0.35),
      hot = mates.reduce((x, p) => (confidence(p, m, side) > confidence(x, m, side) ? p : x), mates[0]),
      tg = low && R() < 0.5 ? low : hot;
    m.buff[tg.id] = { lv, n: 4 };
    md(m, tg, 0.1 * lv);
    const first = tg.name.split(' ').pop(),
      charged = elBuff(m, tg); // an unlocked element: the gauge fills — the next attack is an element spike
    say(low === tg ? `${first}, shake it off — I need you!` : `${first}, it's yours — take over!`, [
      { k: 'plabel', p: tg.id, t: `BUFF Lv${lv}` },
      { k: 'log', t: `Captain ${cap.name} fires up ${tg.name} (buff Lv${lv})${charged ? ` — ${ENAME[tg.el]} gauge full!` : ''}`, c: 'set' }
    ]);
  }
  // tactic
  if (m.tacMode[side] === 'cap' && R() < 0.05 + 0.05 * lv) {
    const eff = role => {
      let k = 0,
        a = 0;
      for (const p of t.P)
        if (p.role === role && m.stat[p.id]) {
          k += m.stat[p.id].k;
          a += m.stat[p.id].att;
        }
      return (k + 1) / (a + 3); // small prior so a single kill doesn't swing it
    };
    const ws = eff('WS'),
      mb = eff('MB'),
      gap = 0.14 - 0.03 * lv; // better leaders act on smaller differences
    const pickT = t.P.some(p => p.role === 'MB') && mb > ws + gap ? 'mb' : ws > mb + gap ? 'ws' : 'auto';
    if (pickT !== m.tac[side]) {
      m.tac[side] = pickT;
      say(pickT === 'ws' ? 'Feed the wings!' : pickT === 'mb' ? 'Middles, go quick!' : 'Setter, your call!', [
        { k: 'tac', side, tac: pickT },
        { k: 'log', t: `Captain ${cap.name} switches ${t.name} to ${TACTICS[pickT].name}`, c: 'set' }
      ]);
    }
  }
  // defence setting
  if (m.dsetMode[side] === 'cap' && R() < 0.05 + 0.05 * lv) {
    const o = m.att[1 - side];
    if (o.n >= 8) {
      const pick = o.q / o.n > 0.35 ? 'commit' : o.mid / o.n > 0.45 ? 'bunch' : 'read';
      if (pick !== m.dset[side]) {
        m.dsetLog.push({ side, from: m.dset[side], to: pick });
        m.dset[side] = pick;
        say(pick === 'commit' ? 'Commit on the quick!' : pick === 'bunch' ? 'Bunch the middle!' : 'Read and react!', [
          { k: 'tac', side, tac: m.tac[side], dset: pick },
          { k: 'log', t: `Captain ${cap.name} switches ${t.name} defence to ${DEFSETS[pick].name}`, c: 'set' }
        ]);
      }
    }
  }
  return out;
}
/**
 * Score a point for side w: serve and rotation, momentum, mood, stamina recovery, element outcomes, the zone
 * (and zone breaker / captain's call), buffs wearing off, the end of the match, captain and coach decisions.
 * Pushes the point's beats onto `beats` (null in simulations). Returns { w, beats }.
 */
function end(m, w, beats) {
  const oppWasInZone = !!m.zone[1 - w];
  m.pts[w]++;
  if (w !== m.serve) {
    m.serve = w;
    m.rot[w]++;
  }
  m.streak[w]++;
  m.streak[1 - w] = 0;
  // element spikes: record the outcome; Starlight lifts the team's momentum when it scores
  // won = the point ended on that element spike, for its side (dug and played on → false)
  const es = m.ctx && m.ctx.el ? m.elLog[m.elLog.length - 1] : null;
  for (const L of m.elLog) if (L.won == null) L.won = L === es && w === L.side;
  if (es && es.won && m.ctx.el.mom) m.mom[w] = clamp(m.mom[w] + m.ctx.el.mom, -1, 1);
  m.lastK = m.ctxK || null;
  m.ctxK = null;
  m.ctx0 = m.ctx; // the last attack (chatter)
  m.ctx = null;
  const LD = i => (m.t[i].cap.lead - 50) / 100;
  m.mom[w] = clamp(m.mom[w] * 0.85 + (0.1 + (m.streak[w] >= 3 ? 0.07 : 0) + m.big * 0.1) * (1 + LD(w) * 0.6), -1, 1);
  m.mom[1 - w] = clamp(m.mom[1 - w] * 0.85 - 0.09 - m.big * 0.05, -1, 1);
  for (const p of m.t[w].P) md(m, p, 0.03);
  for (const p of m.t[1 - w].P) md(m, p, -0.02);
  for (const id in m.mood) m.mood[id] *= 0.97;
  for (const t of m.t) for (const p of t.P) m.sta[p.id] = Math.min(1, (m.sta[p.id] == null ? 1 : m.sta[p.id]) + 0.02);
  let zoneIn = false,
    capCall = -1,
    breaker = false;
  // Zone breaker: a kill block or a fake set that scores against a team in the zone
  // knocks them out of it and sends the scoring team straight into the zone.
  if (oppWasInZone && (m.lastPlay === 'killblock' || m.lastPlay === 'fake')) {
    const O = 1 - w;
    breaker = true;
    m.zone[O] = 0;
    m.mom[O] = Math.min(m.mom[O], -0.2);
    m.streak[O] = 0;
    m.zone[w] = 1;
    m.mom[w] = Math.max(m.mom[w], 0.9);
    for (const q of m.t[w].P) md(m, q, 0.25);
    for (const q of m.t[O].P) md(m, q, -0.2);
  }
  for (const i of [0, 1]) {
    const thr = 0.85 - LD(i) * 0.3;
    if (!m.zone[i] && m.mom[i] >= thr) {
      m.zone[i] = 1;
      m.zoneHit[i] = 1;
      if (i === w) zoneIn = true;
    } else if (m.zone[i] && m.mom[i] < thr - 0.35) m.zone[i] = 0;
  }
  {
    const L = 1 - w,
      cap = m.t[L].cap;
    if (
      !breaker &&
      !m.zone[L] &&
      !m.over &&
      m.pts[w] - m.pts[L] >= 2 &&
      (m.streak[w] >= 2 || m.zone[w]) &&
      R() < Math.pow(cap.lead / 100, 3) * 0.09
    ) {
      capCall = L;
      m.zone[L] = 1;
      m.mom[L] = Math.max(m.mom[L], 0.8);
      m.mom[w] *= 0.5;
      if (m.zone[w] && m.mom[w] < 0.5) m.zone[w] = 0;
      for (const q of m.t[L].P) md(m, q, 0.3);
      m.streak[w] = 0;
    }
  }
  elPoint(m, w);
  for (const i of [0, 1]) if (m.zone[i]) m.zoneHit[i] = 1;
  // captain's buffs wear off after a few points
  for (const id in m.buff) if (--m.buff[id].n <= 0) delete m.buff[id];
  const [a, b] = m.pts;
  if (Math.max(a, b) >= RULES.pointsToWin && Math.abs(a - b) >= RULES.winBy) {
    m.over = true;
    m.winner = w;
    m.setScores = [[a, b]];
    m.sets[w] = 1;
  }
  const capBeats = m.over ? [] : [...captainThink(m, 0), ...captainThink(m, 1)];
  if (beats) {
    beats.push({
      dur: m.over ? 1600 : 900,
      acts: [
        { k: 'point', side: w, big: m.big, streak: m.streak[w], zone: zoneIn },
        ...hypeChatter(m, w),
        { k: 'score', snap: snap(m) },
        ...(m.over ? [{ k: 'log', t: `Game — ${m.t[w].name} win ${Math.max(a, b)}-${Math.min(a, b)}`, c: 'set' }] : [])
      ]
    });
    for (const bt of capBeats) beats.push(bt);
    if (breaker && !m.over) {
      const t = m.t[w],
        o = m.t[1 - w],
        hero = m.hero || t.cap,
        how = m.lastPlay === 'killblock' ? 'Kill block' : 'Fake set';
      beats.push({
        dur: 900,
        acts: [
          { k: 'zbreak', side: 1 - w },
          { k: 'label', t: 'ZONE BROKEN!', big: 1, stamp: 1, dy: 30 }
        ]
      });
      beats.push({
        dur: 1500,
        cut: 1,
        acts: [
          { k: 'zone', side: w },
          { k: 'cut', p: hero.id, title: 'Zone Breaker', sub: `${how} by ${hero.name} shatters ${o.name}'s zone` },
          {
            k: 'log',
            t: `ZONE BREAKER! ${hero.name}'s ${how.toLowerCase()} knocks ${o.name} out of the zone — ${t.name} take it over`,
            c: 'set'
          }
        ]
      });
    }
    if (capCall >= 0 && !m.over) {
      const t = m.t[capCall],
        c = t.cap;
      beats.push({
        dur: 1500,
        cut: 1,
        acts: [
          { k: 'zone', side: capCall },
          { k: 'cut', p: c.id, title: "Captain's call", sub: `${c.name} rallies ${t.name} — leadership ${c.lead}` },
          { k: 'log', t: `Captain's call! ${c.name} rallies ${t.name} into the zone`, c: 'set' }
        ]
      });
    }
    if (zoneIn && !m.over) {
      const t = m.t[w],
        ace = t.cap.lead >= 70 ? t.cap : t.P.reduce((x, p) => ((m.mood[p.id] || 0) > (m.mood[x.id] || 0) ? p : x), t.P[0]);
      beats.push({
        dur: 1300,
        cut: 1,
        acts: [
          { k: 'zone', side: w },
          { k: 'cut', p: ace.id, title: 'In the zone', sub: `${t.name} momentum surge: every stat boosted` },
          { k: 'log', t: `${t.name} are in the zone — ${m.streak[w]} straight points`, c: 'set' }
        ]
      });
    }
  }
  if (!m.over) {
    const L = 1 - w,
      T = m.t[L],
      avg = T.P.reduce((a, q) => a + (m.mood[q.id] || 0), 0) / T.P.length;
    const need = m.pts[w] >= 4 && (m.streak[w] >= 3 || (m.zone[w] && m.pts[w] - m.pts[L] >= 2) || avg < -0.35);
    if (m.toReq[L] && !m.to[L]) timeout(m, L, beats, true);
    else if (m.toReq[w] && !m.to[w]) timeout(m, w, beats, true);
    else if (!m.to[L] && need && R() < 0.35 + 0.6 * T.coachIQ) timeout(m, L, beats, false);
  }
  return { w, beats };
}
/** Side L takes its timeout (manual = the player asked for it): mood and stamina reset, the other side cools off. */
function timeout(m, L, beats, manual) {
  const T = m.t[L],
    O = 1 - L,
    iq = T.coachIQ;
  m.to[L] = 1;
  m.toReq[L] = 0;
  for (const q of T.P) {
    m.mood[q.id] = 0.1 + 0.15 * iq + Math.max(0, m.mood[q.id] || 0) * 0.3;
    m.sta[q.id] = Math.min(1, (m.sta[q.id] == null ? 1 : m.sta[q.id]) + 0.12);
  }
  m.mom[O] *= 0.6 - 0.3 * iq;
  m.mom[L] = Math.max(m.mom[L], 0);
  m.streak[O] = 0;
  if (m.zone[O] && m.mom[O] < 0.5) m.zone[O] = 0;
  if (!beats) return;
  const hx = (side, i) => sx(side, 80 + i * 24),
    hz = i => [0.04, 0.11, 0.02, 0.13][i];
  const s1 = [];
  for (const side of [0, 1])
    m.t[side].P.forEach((q, i) => {
      s1.push({ k: 'slide', p: q.id, x: hx(side, i), z: hz(i) });
      m.pos[q.id] = { x: hx(side, i), z: hz(i) };
    });
  const line = manual ? 'You called it — reset and refocus!' : pick(TOLINES);
  beats.push({
    dur: 700,
    acts: [
      { k: 'tobanner', side: L, manual },
      { k: 'log', t: `Timeout ${T.name}${manual ? ' (your call)' : ''} — coach calls the huddle`, c: 'set' }
    ]
  });
  beats.push({ dur: 1300, acts: [...s1] });
  beats.push({
    dur: 2200,
    acts: [
      ...T.P.map(q => ({ k: 'pose', p: q.id, pose: 'huddle' })),
      ...m.t[O].P.map(q => ({ k: 'pose', p: q.id, pose: 'ready' })),
      { k: 'coachtalk', side: L, text: line },
      { k: 'score', snap: snap(m) },
      { k: 'log', t: `Coach: “${line}”` }
    ]
  });
}
/** Rallies after which a simulated match gives up (a safety net; a set never gets close). */
const SIM_MAX_RALLIES = 500;
/** Play a whole match without animation. */
function simMatch(a, b, opts) {
  const m = newMatch(a, b, false, opts);
  let g = 0;
  while (!m.over && g++ < SIM_MAX_RALLIES) playRally(m);
  return m;
}
