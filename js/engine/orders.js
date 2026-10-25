// Role orders (spec §2.29): how a player plays their part, set on the Plan board. No order = Auto = today's engine (the
// AI picker), so a match nobody touches plays exactly as before. Each hook in the engine runs only when an order is set.
// Odds are the engine's own formulas on a fixed grid — no R() draws.

const SRV_TYPES = ['float', 'jumpfloat', 'jump'];
/** Serve-order id → the serve type it plays. */
const SRV_BASE = { float: 'float', drive: 'float', jumpfloat: 'jumpfloat', jump: 'jump', killer: 'jump' };

/** A player's order of one kind ('srv' | 'tgt'), or undefined (Auto). */
const ordOf = (m, p, k) => m.ord && m.ord[p.id] && m.ord[p.id][k];
/** Set (v) or clear (v == null) one order. */
function ordSet(m, p, k, v) {
  const o = m.ord || (m.ord = {});
  if (v == null || v === 'auto') {
    if (o[p.id]) delete o[p.id][k];
    if (o[p.id] && !Object.keys(o[p.id]).length) delete o[p.id];
  } else (o[p.id] || (o[p.id] = {}))[k] = v;
}
/** The hardest serve type a player may order. */
const srvCap = p => (p.role === 'WS' ? 'jump' : p.speed >= 60 || p.jump >= 65 ? 'jumpfloat' : 'float');
/** Their passers (the receiving side's court players but the setter). */
const passersOf = T => {
  const L = T.P.filter(p => p !== T.s);
  return L.length ? L : T.P;
};
/** The seam: the two weakest passers (the weaker one ends up taking it). */
function seamOf(T) {
  const k = p => effD(p) + p.speed * 0.3;
  return [...passersOf(T)].sort((a, b) => k(a) - k(b)).slice(0, 2);
}

/** Serve options for a player: [{ v, label, lock (the gap) }]. */
function srvOpts(p) {
  const cap = SRV_TYPES.indexOf(srvCap(p)),
    gap = { jumpfloat: 'Speed 60+ or Jump 65+', jump: 'a wing spiker (WS)' };
  return [
    { v: 'auto', label: 'Auto' },
    ...SRV_TYPES.map((t, i) => ({
      v: t,
      label: { float: 'Float', jumpfloat: 'Jump float', jump: 'Jump' }[t],
      lock: i > cap ? gap[t] : null
    })),
    { v: 'drive', label: 'Drive', lock: hasTech(p, 'drive') ? null : 'learn Drive Serve' },
    { v: 'killer', label: 'Killer', lock: hasTech(p, 'killer') ? (cap < 2 ? gap.jump : null) : 'learn Killer Jump Serve' }
  ];
}
/**
 * Target options against side T (spec §2.39: free — no technique): Auto (the server's own read, tgtAI), each passer, the seam,
 * deep (a random spot by the end line), safe (a softer serve, in play).
 */
function tgtOpts(p, T) {
  return [
    { v: 'auto', label: 'Auto' },
    ...passersOf(T).map(q => ({ v: q.id, label: `#${q.num} ${firstName(q)}`, p: q })),
    { v: 'seam', label: 'Seam' },
    { v: 'deep', label: 'Deep' },
    { v: 'safe', label: 'Safe' }
  ];
}
/** The serve target the server plays: their order, else the AI's pick (tgtAI). */
const tgtOf = (m, server, s) => ordOf(m, server, 'tgt') || tgtAI(m, server, s);
/**
 * The AI server's target (spec §2.39), no draws: every option scored by its serve odds (srvOdds — settling counted), score =
 * hit × ORDERS.srv.ai − err; the best wins (the first on a tie). Cached for the serve (m.tgtAIc). Returns the option's value.
 */
function tgtAI(m, server, s) {
  const key = `${m.pts[0]}|${m.pts[1]}|${m.setScores ? m.setScores.length : 0}|${server.id}|${ordOf(m, server, 'srv') || ''}`;
  if (m.tgtAIc && m.tgtAIc.key === key) return m.tgtAIc.v;
  const S = tgtScores(m, server, s),
    v = S.reduce((a, o) => (o.score > a.score ? o : a)).v;
  m.tgtAIc = { key, v, S };
  return v;
}
/** Each serve target's AI score: [{ v, score, err, hit }] (score = hit × ORDERS.srv.ai − err, in points of 100). */
function tgtScores(m, server, s) {
  return tgtOpts(server, m.t[1 - s])
    .filter(o => o.v !== 'auto')
    .map(o => {
      const d = srvOdds(m, server, s, undefined, o.v, ORDERS.odds.aiRoll);
      return { v: o.v, score: 100 * (d.hit * ORDERS.srv.ai - d.err), err: d.err, hit: d.hit };
    });
}
/** Settling (spec §2.39): rc's receive score × (1 + step × the serves in a row at them so far, at most cap). */
function settled(m, rc, rs) {
  const n = (m.settle && m.settle[rc.id]) || 0,
    S = RULES.settle;
  return rs > 0 ? rs * (1 + Math.min(S.cap, S.step * n)) : rs;
}
/** A serve taken by rc (side RT): their count +1; each teammate's fades by RULES.settle.fade. No draws. */
function settleLog(m, RT, rc) {
  const S = m.settle || (m.settle = {});
  for (const p of RT.P) if (p !== rc && S[p.id]) S[p.id] = Math.max(0, S[p.id] - RULES.settle.fade);
  S[rc.id] = (S[rc.id] || 0) + 1;
}

/** Serve order applied to the natural type (serveWalk): { sType, sq, errK }. */
function srvApply(m, server, sType, sq) {
  const o = ordOf(m, server, 'srv');
  if (!o) return { sType, sq, errK: 1 };
  const want = SRV_BASE[o],
    soft = SRV_TYPES.indexOf(sType) - SRV_TYPES.indexOf(want);
  return soft > 0 ? { sType: want, sq: sq * ORDERS.srv.pace[soft], errK: ORDERS.srv.err[soft] } : { sType: want, sq, errK: 1 };
}
/**
 * The served-at target (serveAim) for target value o: { rc, exact, seam } (a passer or the seam: exact with Target Serve on,
 * else a lean), { zone: 'deep' | 'safe' }, or null (no target, or the player is not on court).
 */
function tgtResolve(m, server, RT, o) {
  if (!o || o === 'auto') return null;
  if (o === 'deep' || o === 'safe') return { zone: o };
  const exact = hasTech(server, 'target');
  if (o === 'seam') return { rc: seamOf(RT)[0], exact, seam: true };
  const rc = passersOf(RT).find(p => p.id === o);
  return rc ? { rc, exact, seam: false } : null;
}
/** The serve error × of a target (an aimed serve without Target Serve: × aimErr; deep × deep.err; safe × safe.err). */
const tgtErrK = tg => (!tg ? 1 : tg.zone ? ORDERS.srv[tg.zone].err : tg.exact ? 1 : ORDERS.srv.aimErr);
/** Per-server serve tallies (no randoms): serves, errors, ace rolls won, broken passes (quality 1); per serve order too. */
function srvLog(m, p, k) {
  const L = m.srvLog || (m.srvLog = {}),
    r = L[p.id] || (L[p.id] = { n: 0, err: 0, ace: 0, bad: 0 });
  if (k) r[k]++;
  else r.n++;
  const o = m.ord && m.ord[p.id];
  if (o) for (const kind of ['srv', 'tgt']) if (o[kind]) ordLog(m, p, kind, o[kind], k || 'n');
}
/** How each order went (spec §2.29, the result card): m.ordLog[pid][kind:value] = { n, … } (no randoms). */
function ordLog(m, p, kind, v, k) {
  const L = m.ordLog || (m.ordLog = {}),
    P = L[p.id] || (L[p.id] = {}),
    r = P[`${kind}:${v}`] || (P[`${kind}:${v}`] = { kind, v, n: 0, k: 0, err: 0, stf: 0, ace: 0, bad: 0 });
  r[k]++;
}
/** tallyAttack: the hitter's aim / shot, the setter's feed / fake and the blocking middles' orders, one attack's outcome. */
function ordAttack(m, side, x, kill, err, stf) {
  const tally = (p, kind, v) => {
    ordLog(m, p, kind, v, 'n');
    if (kill) ordLog(m, p, kind, v, 'k');
    if (err) ordLog(m, p, kind, v, 'err');
    if (stf) ordLog(m, p, kind, v, 'stf');
  };
  const os = m.ord[x.spiker.id];
  if (os) for (const kind of ['aim', 'shot']) if (os[kind]) tally(x.spiker, kind, os[kind]);
  const st = x.setter && m.ord[x.setter.id];
  if (st && st.feed && x.feedOrd) tally(x.setter, 'feed', st.feed);
  if (st && st.fake) tally(x.setter, 'fake', st.fake);
  const D = m.t[1 - side],
    fr = rotOrder(D, m.rot[1 - side]).filter((q, i) => i === 1 || i === 2);
  for (const q of fr) if (ordOf(m, q, 'blk')) tally(q, 'blk', ordOf(m, q, 'blk'));
}

/**
 * Serve odds for one server on side s with a given serve order and target (each 'auto' or an id; undefined = the
 * current order): { err, hit } — err = a miss or a foot fault, hit = an ace or a broken pass. The engine's own formulas over a fixed grid of its rolls.
 * A serve technique counts at the share of rallies it goes on (techP: the rally's gate, techOn) — off, an ordered target
 * is only a lean (or, the seam, Auto).
 */
function srvOdds(m, server, s, srv, tgt, roll = ORDERS.odds.roll) {
  const ST = m.t[s],
    RT = m.t[1 - s],
    o0 = m.ord && m.ord[server.id],
    keep = o0 ? { ...o0 } : null;
  // evaluate with the asked orders in place, then put the real ones back
  if (srv !== undefined) ordSet(m, server, 'srv', srv);
  if (tgt !== undefined) ordSet(m, server, 'tgt', tgt);
  const so = ordOf(m, server, 'srv'),
    tg0 = tgtResolve(m, server, RT, tgtOf(m, server, s)),
    cp = defPlan(m, 1 - s),
    wp = weakPasser(RT),
    G = ORDERS.odds;
  let err = 0,
    hit = 0;
  const rsM = new Map(), // the receive score per receiver and run (the same on every roll)
    rs0 = (rc, d0) => {
      const k = `${rc.id}|${d0}`;
      if (!rsM.has(k)) rsM.set(k, Formula.receiveScore(rc, RT, d0));
      return rsM.get(k);
    };
  for (const f of roll) {
    const sq0 = Formula.serveQuality(server, ST, f),
      a = srvApply(m, server, serveType(server, sq0), sq0);
    let sq = a.sq * (tg0 && tg0.zone === 'safe' ? ORDERS.srv.safe.pace : 1);
    const jump = a.sType === 'jump',
      ff = Formula.footFaultP(server, a.sType); // the foot fault (spec §4.38) comes first: a missed serve
    if (jump) sq *= 1 + (runUpM(server, a.sType) - 3.2) * 0.05;
    // techniques, on their rallies (techP): ordered = always; Auto = their usual share (killer / drive 50 %, target 30 %)
    const kP = jump ? techP(server, 'killer') * (so === 'killer' ? 1 : so ? 0 : 0.5) : 0,
      dP = !jump ? techP(server, 'drive') * (so === 'drive' ? 1 : so ? 0 : 0.5) : 0,
      pT = techP(server, 'target'),
      // an exact target needs Target Serve on this rally; off, it is a lean
      tvs =
        tg0 && tg0.exact
          ? [
              [tg0, pT],
              [{ ...tg0, exact: false }, 1 - pT]
            ]
          : [[tg0, 1]];
    for (const [tg, pv] of tvs) {
      if (!pv) continue;
      for (const [kk, pk0] of [
        [1, kP],
        [0, 1 - kP]
      ]) {
        const pk = pk0 * pv;
        if (!pk) continue;
        const sqk = kk ? sq * 1.1 : sq,
          e = Math.min(1, (Formula.serveErrorP(server, ST, sqk) + (kk ? 0.03 : 0)) * a.errK * tgtErrK(tg));
        // who takes it, and how far they move: aimed (beside them) or a random spot (the nearest)
        const aimed = tg && tg.rc ? [[tg.rc, tg.exact ? 1 : ORDERS.srv.lean]] : [],
          rest = 1 - aimed.reduce((x, [, q]) => x + q, 0);
        const L = passersOf(RT),
          rcs = [
            ...aimed.map(([p, q]) => [p, q, tg.seam ? G.dSeam : G.dAim]),
            ...(rest > 0 ? L.map(p => [p, rest / L.length, G.dRand]) : [])
          ];
        let h = 0;
        for (const [rc, q, d0] of rcs) {
          if (!q) continue;
          for (const [dd, pd] of [
            [1, dP],
            [0, 1 - dP]
          ]) {
            if (!pd) continue;
            let rs = rs0(rc, d0) - (dd ? 14 : 0);
            if (cp.weakRs) rs += rc === wp ? cp.weakRs : cp.otherRs;
            if (tg && tg.seam && rc === tg.rc) rs -= ORDERS.srv.seam;
            if (tg && tg.zone === 'deep') rs -= ORDERS.srv.deep.rs;
            rs = settled(m, rc, rs);
            const ace = sig((sqk - rs) / 24 - 2.4),
              bad = clamp((-8 - (rs - sqk * 0.85) + 18) / 36, 0, 1);
            h += q * pd * (ace + (1 - ace) * bad);
          }
        }
        err += pk * (ff + (1 - ff) * e);
        hit += pk * (1 - ff) * (1 - e) * h;
      }
    }
  }
  // restore
  if (keep) m.ord[server.id] = keep;
  else if (m.ord) delete m.ord[server.id];
  return { err: err / roll.length, hit: hit / roll.length };
}

/** The share of rallies p goes for technique `id` (techOn): 0 not owned / held, 1 a card calls it, else techRate. No draws. */
function techP(p, id) {
  return ownsTech(p, id) ? (cardCalled(p, id) ? 1 : techRate(p, id)) : 0;
}

// ---- Spike orders (T-278): aim (line / cross / a player / open court) and shot (power / cut / tip) ----

/** Aim options against side T: Auto, the two channels, each of their passers, the open court (Wit 1.2+). */
function aimOpts(p, T) {
  return [
    { v: 'auto', label: 'Auto' },
    { v: 'line', label: 'Line' },
    { v: 'cross', label: 'Cross' },
    ...passersOf(T).map(q => ({ v: q.id, label: `At #${q.num} ${firstName(q)}` })),
    { v: 'open', label: 'Open court', lock: W(p) >= ORDERS.atk.openWit ? null : `Wit ${ORDERS.atk.openWit}+` }
  ];
}
/** Shot options (Power / Tool: fight the block; spec §2.39). */
const shotOpts = () => [
  { v: 'auto', label: 'Auto' },
  { v: 'power', label: 'Power' },
  { v: 'tool', label: 'Tool' },
  { v: 'cut', label: 'Cut' },
  { v: 'tip', label: 'Tip' }
];
/** Their weakest floor defender (not blocking): Defense + 0.3 × Speed, as weakPasser. */
function weakDigger(defT, blockers) {
  const L = defT.P.filter(q => !blockers.includes(q));
  return L.length ? L.reduce((a, q) => (effD(q) + q.speed * 0.3 < effD(a) + a.speed * 0.3 ? q : a)) : null;
}
/**
 * The spike duel (spec §2.39): fight the block (Power through it, Tool it off the hands) or avoid it (their weak digger, the
 * open court) — the hitter's own read of the block they face (x.cov, x.blockers), no draws. Scores in points of 100: plain
 * 50 + ai.plain; fight 50 + ai.k × (ai.mid − cov); avoid 50 + ai.k × (cov − ai.mid) × their wit (to openWit); no choice on a
 * bad set or a quick. { v: 'fight' | 'avoid' | 'plain', S: { plain, fight, avoid }, aim, shot } (aim / shot: what it plays).
 */
function atkPick(m, spiker, defT, x) {
  const A = ORDERS.atk,
    I = A.ai,
    cov = x.cov,
    free = !x.bad && !x.quick && !x.tip,
    S = {
      plain: 50 + I.plain,
      fight: free ? 50 + I.k * (I.mid - cov) : 0,
      avoid: free ? 50 + I.k * (cov - I.mid) * clamp(W(spiker) / A.openWit, 0.5, 1) : 0
    },
    v = S.fight > S.plain && S.fight >= S.avoid ? 'fight' : S.avoid > S.plain ? 'avoid' : 'plain';
  const r = { v, S, aim: undefined, shot: undefined };
  if (v === 'fight') r.shot = cov >= A.tool.cov[0] && cov < A.tool.cov[1] ? 'tool' : 'power';
  if (v === 'avoid') {
    const q = W(spiker) >= A.openWit ? null : weakDigger(defT, x.blockers || []);
    r.aim = q ? q.id : 'open';
  }
  return r;
}
/** The aim and shot a hitter plays: their orders, else (neither set) their own read (atkPick). { aim, shot, pick? }. */
function atkOrd(m, spiker, defT, x) {
  const aim = ordOf(m, spiker, 'aim'),
    shot = ordOf(m, spiker, 'shot');
  if (aim || shot) return { aim, shot };
  const k = atkPick(m, spiker, defT, x);
  return { aim: k.aim, shot: k.shot, pick: k };
}
/**
 * The aim and shot (ao = atkOrd) bent into laneAim's channel lean and the attack's dials: { p, powK, errK, cutK, cutMax, covK }.
 * Avoiding the block (at a player, the open court) places the ball round the hands (coverage × avoidCov) for pace (× avoidPow).
 */
function atkApply(m, spiker, defT, spZ, p, ao) {
  const { aim, shot } = ao,
    A = ORDERS.atk,
    r = { p, powK: 1, errK: 1, cutK: 0, cutMax: 0.75, covK: 1 };
  if (aim === 'line' || aim === 'cross') r.p = aim === 'line' ? A.force : 1 - A.force;
  else if (aim && aim !== 'open') {
    const q = defT.P.find(x => x.id === aim);
    if (q) {
      const z = m.pos[q.id].z;
      r.p += (Math.abs(laneZ(spZ, 'line') - z) <= Math.abs(laneZ(spZ, 'cross') - z) ? 1 : -1) * A.lean;
      Object.assign(r, { errK: r.errK * A.aimErr, powK: A.avoidPow, covK: A.avoidCov });
    }
  } else if (aim === 'open') Object.assign(r, { errK: r.errK * A.openErr, powK: A.avoidPow, covK: A.avoidCov });
  if (shot === 'power') Object.assign(r, { powK: r.powK * A.pow, errK: r.errK * A.powErr, cutK: -1 });
  if (shot === 'tool') Object.assign(r, { errK: r.errK * A.tool.err, cutK: -1 });
  if (shot === 'cut') Object.assign(r, { cutK: A.cut, cutMax: 0.9 });
  return r;
}
/** Where an aimed ball lands (landingSpot): toward the chosen player, or the biggest gap among their floor defenders. */
function atkLand(m, aim, defT, blockers, ds, lx, lz) {
  const A = ORDERS.atk;
  if (!aim || aim === 'line' || aim === 'cross') return [lx, lz];
  if (aim === 'open') {
    const D = defT.P.filter(q => !blockers.includes(q));
    let best = null,
      bd = -1;
    for (const gx of [190, 260, 330, 400])
      for (const gz of [0.15, 0.3, 0.5, 0.7, 0.85]) {
        const d = Math.min(9, ...D.map(q => dist(m.pos[q.id], sx(ds, gx), gz)));
        if (d > bd) [bd, best] = [d, [sx(ds, gx), gz]];
      }
    return best ? [lerp(lx, best[0], A.openK), lerp(lz, best[1], A.openK)] : [lx, lz];
  }
  const q = defT.P.find(x => x.id === aim);
  if (!q || blockers.includes(q)) return [lx, lz];
  return [lerp(lx, m.pos[q.id].x, A.atK), clamp(lerp(lz, m.pos[q.id].z, A.atK), 0.08, 0.92)];
}

// ---- The odds probe: the engine itself plays the attack from now, on an isolated random stream ----

/** Deep copy of match state, keeping teams and players by reference (they are not changed inside a rally). */
const isEnt = v => Array.isArray(v.P) || (typeof v.id === 'string' && 'role' in v);
function stCopy(v) {
  if (!v || typeof v !== 'object' || isEnt(v)) return v;
  if (Array.isArray(v)) return v.map(stCopy);
  if (v instanceof Set) return new Set(v);
  if (v instanceof Map) return new Map(v);
  const pr = Object.getPrototypeOf(v);
  if (pr !== Object.prototype && pr !== null) return v;
  const o = {};
  for (const k in v) o[k] = stCopy(v[k]);
  return o;
}
const PROBE_STOP = { probe: 1 };
/**
 * Side's attack odds — hitter p fed (or, p null, whoever the setter picks) — with some orders tried out (set: [[player,
 * kind, value ('auto' clears)], …]): { kill, err, stf, n } over `ORDERS.odds.atkN` possessions from a perfect pass. The
 * match is restored afterwards and the game's random stream is untouched (RNG.next swapped for a seeded one) — the same
 * numbers at the same moment.
 */
function atkOdds(m, side, p, set = [], full = false) {
  const T = m.t[side],
    pas = T.P.find(q => q !== p && q !== T.s) || T.P.find(q => q !== p),
    snap = stCopy(m),
    next0 = RNG.next,
    cm0 = CM;
  for (const [q, k, v] of set) ordSet(m, q, k, v);
  const ord = stCopy(m.ord),
    o = { kill: 0, err: 0, stf: 0, n: 0, win: 0 };
  RNG.seed(ORDERS.odds.seed + m.pts[0] * 31 + m.pts[1]);
  CM = m;
  try {
    for (let i = 0; i < ORDERS.odds.atkN; i++) {
      for (const k of Object.keys(m)) if (!(k in snap)) delete m[k];
      Object.assign(m, stCopy(snap), { ord: stCopy(ord), rec: false, probe: { p, side, out: null, full } });
      let w = null;
      try {
        w = rally(m, null, false, side, pas, 3);
      } catch (e) {
        if (e !== PROBE_STOP) throw e;
      }
      const r = m.probe.out;
      if (!r) continue;
      o.n++;
      if (w === side) o.win++; // (full: the rally played out — who won the point)
      if (r.kill) o.kill++;
      else if (r.err) o.err++;
      else if (r.stf) o.stf++;
    }
  } finally {
    for (const k of Object.keys(m)) if (!(k in snap)) delete m[k];
    Object.assign(m, snap);
    RNG.next = next0;
    CM = cm0;
  }
  const n = Math.max(1, o.n);
  return { kill: o.kill / n, err: o.err / n, stf: o.stf / n, n: o.n, win: full ? o.win / n : null };
}
/** tallyAttack's probe hook: the probed hitter's (or side's) first attack ends the probe possession. */
function probeHit(m, side, x, kill, err, stf) {
  if (!m.probe || m.probe.out || (m.probe.p ? x.spiker !== m.probe.p : side !== m.probe.side)) return;
  m.probe.out = { kill, err, stf };
  if (!m.probe.full) throw PROBE_STOP; // (full: the rally plays on to its point)
}

// ---- Setter orders (T-279): feed one hitter on a 3 or 2 pass; the fake set on / off ----

/** Feed options: Auto, each court hitter of the setter's side. */
function feedOpts(setter, T) {
  return [{ v: 'auto', label: 'Auto' }, ...T.P.filter(q => q !== setter).map(q => ({ v: q.id, label: `#${q.num} ${firstName(q)}`, p: q }))];
}
/** Fake options (a setter's decoy fake set: on by default). */
const fakeOpts = () => [
  { v: 'auto', label: 'On' },
  { v: 'off', label: 'Off' }
];

// ---- Block orders (T-280, spec §2.39): each blocker reads or commits; a middle may Stay back (no block: dig and cover) ----

/** A middle on Stay back. */
const stayBack = (m, p) => p.role === 'MB' && ordOf(m, p, 'blk') === 'back';
/**
 * Block options for blocker p against side T (Auto = their own read, blkPick, else the team's §2.9 setting): Read (wait for
 * the set: solid, late on fast sets), Commit (their quick), Commit on each hitter (guess early: a stuff if right, an open net
 * if wrong), Stay back (middles).
 */
const blkOpts = (p, T) => [
  { v: 'auto', label: 'Auto' },
  { v: 'read', label: 'Read' },
  { v: 'commit', label: 'Commit: the quick' },
  ...(T ? T.P.filter(q => q !== T.s && q.role !== 'S').map(q => ({ v: q.id, label: `Commit on #${q.num} ${firstName(q)}`, p: q })) : []),
  ...(!p || p.role === 'MB' ? [{ v: 'back', label: 'Stay back' }] : [])
];
/**
 * The blocker's own read (spec §2.39), no draws: commit on the hitter the other side has fed most this match (their share of
 * its court hitters' attacks, m.hit) when that share beats ORDERS.blk.commitAt — once ORDERS.blk.seen attacks are in; else
 * none (the team's setting). Scores in points of 100: read 50, commit 50 + 100 × (share − commitAt). { v: hitter id | null, S }.
 */
function blkPick(m, ds, b) {
  const A = m.t[1 - ds],
    H = m.hit || {},
    L = A.P.filter(q => q !== A.s && q.role !== 'S'),
    n = L.map(q => (H[q.id] ? H[q.id].n : 0)),
    tot = n.reduce((a, v) => a + v, 0),
    S = { read: 50, commit: 0, on: null };
  if (tot < ORDERS.blk.seen) return { v: null, S };
  const i = n.indexOf(Math.max(...n));
  S.on = L[i].id;
  S.commit = 50 + 100 * (n[i] / tot - ORDERS.blk.commitAt);
  return { v: S.commit > S.read ? L[i].id : null, S };
}
/**
 * Whom blocker b (side ds) commits to (spec §2.39): their block order (Read / Stay back → nobody; Commit → 'quick': whoever
 * goes quick; a hitter's id → that hitter), else their own read (blkPick), else the team's Commit (teamC: the team setting,
 * or a front-row middle's Commit order for this attack — 'quick'). The hitter, 'quick', or null (reading).
 */
function blkCommit(m, ds, b, teamC = m.dset[ds] === 'commit') {
  const o = ordOf(m, b, 'blk') || blkPick(m, ds, b).v,
    A = m.t[1 - ds];
  if (o === 'read' || o === 'back') return null;
  if (o === 'commit' || (!o && teamC)) return 'quick';
  return (o && A.P.find(q => q.id === o)) || null;
}

// ---- Rest (T-282, spec §2.30): take a court player off at the next dead ball for the best fresh bench player ----

/** The bench player who would come on for p (same setter / non-setter kind, fresh enough, the best now), or null. */
function restFor(m, side, p) {
  const t = m.t[side],
    sta = q => (m.sta[q.id] == null ? 1 : m.sta[q.id]),
    worth = q => ovr(q) * (1 - RULES.stamina.hit * (1 - sta(q))),
    L = (t.bench || []).filter(q => !q.noSub && (q.role === 'S') === (p.role === 'S') && sta(q) >= SUB.fresh - 0.15);
  return L.length ? L.reduce((a, q) => (worth(q) > worth(a) ? q : a)) : null;
}
/** Rest options for a court player (locked: no subs left / no fresh bench player). */
function restOpts(m, side, p) {
  const gap = m.subs[side] >= SUB.max ? 'no substitutions left this set' : !restFor(m, side, p) ? 'no fresh bench player' : null;
  return [
    { v: 'auto', label: 'Auto' },
    { v: 'now', label: 'Rest now', lock: gap }
  ];
}
/** At the dead ball: every court player ordered to rest goes off (spec §2.30); the order is used up. Returns the beats. */
function ordSubs(m, side) {
  const out = [];
  for (const p of [...m.t[side].P]) {
    if (ordOf(m, p, 'rest') !== 'now') continue;
    ordSet(m, p, 'rest', null);
    const inn = m.subs[side] < SUB.max ? restFor(m, side, p) : null;
    if (!inn) continue;
    out.push(...subDo(m, side, p, inn, 'rest'));
  }
  return out;
}
