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
/** Target options against side T: Auto, each passer, the seam (needs Target Serve). */
function tgtOpts(p, T) {
  return [
    { v: 'auto', label: 'Auto' },
    ...passersOf(T).map(q => ({ v: q.id, label: `#${q.num} ${q.name.split(' ')[0]}`, p: q })),
    { v: 'seam', label: 'Seam', lock: hasTech(p, 'target') ? null : 'learn Target Serve' }
  ];
}

/** Serve order applied to the natural type (serveWalk): { sType, sq, errK }. */
function srvApply(m, server, sType, sq) {
  const o = ordOf(m, server, 'srv');
  if (!o) return { sType, sq, errK: 1 };
  const want = SRV_BASE[o],
    soft = SRV_TYPES.indexOf(sType) - SRV_TYPES.indexOf(want);
  return soft > 0 ? { sType: want, sq: sq * ORDERS.srv.pace[soft], errK: ORDERS.srv.err[soft] } : { sType: want, sq, errK: 1 };
}
/** The served-at target (serveAim): { rc, exact, seam } or null (Auto, or the player is not on court). */
function tgtResolve(m, server, RT) {
  const o = ordOf(m, server, 'tgt');
  if (!o) return null;
  const exact = hasTech(server, 'target');
  if (o === 'seam') return exact ? { rc: seamOf(RT)[0], exact, seam: true } : null;
  const rc = passersOf(RT).find(p => p.id === o);
  return rc ? { rc, exact, seam: false } : null;
}
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
  for (const q of fr) if (q.role === 'MB' && ordOf(m, q, 'blk')) tally(q, 'blk', ordOf(m, q, 'blk'));
}

/**
 * Serve odds for one server on side s with a given serve order and target (each 'auto' or an id; undefined = the
 * current order): { err, hit } — hit = an ace or a broken pass. The engine's own formulas over a fixed grid of its rolls.
 */
function srvOdds(m, server, s, srv, tgt) {
  const ST = m.t[s],
    RT = m.t[1 - s],
    o0 = m.ord && m.ord[server.id],
    keep = o0 ? { ...o0 } : null;
  // evaluate with the asked orders in place, then put the real ones back
  if (srv !== undefined) ordSet(m, server, 'srv', srv);
  if (tgt !== undefined) ordSet(m, server, 'tgt', tgt);
  const so = ordOf(m, server, 'srv'),
    tg = tgtResolve(m, server, RT),
    ap = atkPlan(m, s),
    cp = defPlan(m, 1 - s),
    wp = weakPasser(RT),
    G = ORDERS.odds;
  let err = 0,
    hit = 0;
  for (const f of G.roll) {
    const sq0 = Formula.serveQuality(server, ST, f),
      a = srvApply(m, server, serveType(server, sq0), sq0);
    let sq = a.sq;
    const jump = a.sType === 'jump';
    if (jump) sq *= 1 + (runUpM(server, a.sType) - 3.2) * 0.05;
    // techniques: ordered = always; Auto = their usual share (killer / drive 50 %, target 30 %)
    const kP = jump && hasTech(server, 'killer') ? (so === 'killer' ? 1 : so ? 0 : 0.5) : 0,
      dP = !jump && hasTech(server, 'drive') ? (so === 'drive' ? 1 : so ? 0 : 0.5) : 0,
      tP = tg ? 0 : hasTech(server, 'target') ? 0.3 : 0;
    for (const [kk, pk] of [
      [1, kP],
      [0, 1 - kP]
    ]) {
      if (!pk) continue;
      const sqk = kk ? sq * 1.1 : sq,
        e = Math.min(
          1,
          (Formula.serveErrorP(server, ST, sqk) + (kk ? 0.03 : 0)) * (ap.serveErr ?? 1) * a.errK * (tg && !tg.exact ? ORDERS.srv.aimErr : 1)
        );
      // who takes it, and how far they move: aimed (beside them) or a random spot (the nearest)
      const aimed = tg && tg.exact ? [[tg.rc, 1]] : tg ? [[tg.rc, ORDERS.srv.lean]] : [];
      const huntW = tg ? 0 : ap.huntK ? 1 : tP,
        rest = 1 - aimed.reduce((x, [, q]) => x + q, 0);
      const L = passersOf(RT),
        rcs = [
          ...aimed.map(([p, q]) => [p, q, tg.seam ? G.dSeam : G.dAim]),
          ...(rest > 0 ? [[wp, rest * huntW, G.dAim], ...L.map(p => [p, (rest * (1 - huntW)) / L.length, G.dRand])] : [])
        ];
      let h = 0;
      for (const [rc, q, d0] of rcs) {
        if (!q) continue;
        for (const [dd, pd] of [
          [1, dP],
          [0, 1 - dP]
        ]) {
          if (!pd) continue;
          let rs = Formula.receiveScore(rc, RT, d0) - (dd ? 14 : 0);
          if (cp.weakRs) rs += rc === wp ? cp.weakRs : cp.otherRs;
          if (ap.press && rc === wp) rs -= ap.press;
          if (tg && tg.seam) rs -= ORDERS.srv.seam;
          const ace = sig((sqk - rs) / 24 - 2.4),
            bad = clamp((-8 - (rs - sqk * 0.85) + 18) / 36, 0, 1);
          h += q * pd * (ace + (1 - ace) * bad);
        }
      }
      err += pk * e;
      hit += pk * (1 - e) * h;
    }
  }
  // restore
  if (keep) m.ord[server.id] = keep;
  else if (m.ord) delete m.ord[server.id];
  return { err: err / G.roll.length, hit: hit / G.roll.length };
}

// ---- Spike orders (T-278): aim (line / cross / a player / open court) and shot (power / cut / tip) ----

/** Aim options against side T: Auto, the two channels, each of their passers, the open court (Wit 1.2+). */
function aimOpts(p, T) {
  return [
    { v: 'auto', label: 'Auto' },
    { v: 'line', label: 'Line' },
    { v: 'cross', label: 'Cross' },
    ...passersOf(T).map(q => ({ v: q.id, label: `At #${q.num} ${q.name.split(' ')[0]}` })),
    { v: 'open', label: 'Open court', lock: W(p) >= ORDERS.atk.openWit ? null : `Wit ${ORDERS.atk.openWit}+` }
  ];
}
/** Shot options. */
const shotOpts = () => [
  { v: 'auto', label: 'Auto' },
  { v: 'power', label: 'Power' },
  { v: 'cut', label: 'Cut' },
  { v: 'tip', label: 'Tip' }
];
/** The aim and shot orders bent into laneAim's channel lean and the attack's dials: { p, powK, errK, cutK, cutMax }. */
function atkApply(m, spiker, defT, spZ, p) {
  const aim = ordOf(m, spiker, 'aim'),
    shot = ordOf(m, spiker, 'shot'),
    A = ORDERS.atk,
    r = { p, powK: 1, errK: 1, cutK: 0, cutMax: 0.75 };
  if (aim === 'line' || aim === 'cross') r.p = aim === 'line' ? A.force : 1 - A.force;
  else if (aim && aim !== 'open') {
    const q = defT.P.find(x => x.id === aim);
    if (q) {
      const z = m.pos[q.id].z;
      r.p += (Math.abs(laneZ(spZ, 'line') - z) <= Math.abs(laneZ(spZ, 'cross') - z) ? 1 : -1) * A.lean;
      r.errK *= A.aimErr;
    }
  } else if (aim === 'open') r.errK *= A.openErr;
  if (shot === 'power') Object.assign(r, { powK: A.pow, errK: r.errK * A.powErr, cutK: -1 });
  if (shot === 'cut') Object.assign(r, { cutK: A.cut, cutMax: 0.9 });
  return r;
}
/** Where an aimed ball lands (landingSpot): toward the chosen player, or the biggest gap among their floor defenders. */
function atkLand(m, spiker, defT, blockers, ds, lx, lz) {
  const aim = ordOf(m, spiker, 'aim'),
    A = ORDERS.atk;
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
  return [
    { v: 'auto', label: 'Auto' },
    ...T.P.filter(q => q !== setter).map(q => ({ v: q.id, label: `#${q.num} ${q.name.split(' ')[0]}`, p: q }))
  ];
}
/** Fake options (a setter's decoy fake set: on by default). */
const fakeOpts = () => [
  { v: 'auto', label: 'On' },
  { v: 'off', label: 'Off' }
];

// ---- Middle orders (T-280): Read / Commit (their own §2.9 setting) / Stay back (no block: dig and cover) ----

/** A middle on Stay back. */
const stayBack = (m, p) => p.role === 'MB' && ordOf(m, p, 'blk') === 'back';
/** Block options for a middle (Auto = the team's §2.9 setting). */
const blkOpts = () => [
  { v: 'auto', label: 'Auto' },
  { v: 'read', label: 'Read' },
  { v: 'commit', label: 'Commit' },
  { v: 'back', label: 'Stay back' }
];
