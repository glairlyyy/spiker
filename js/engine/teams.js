// Team generation and simulation-based balancing.

/**
 * A club's whole squad: the 4 on court (`t.P`, what the engine plays) plus the bench (`t.bench`, 2 substitutes).
 * Use this wherever "the club's players" is meant; keep `t.P` for "who is playing now".
 */
const squadOf = t => (t.bench ? [...t.P, ...t.bench] : t.P);

/** The eight tournament teams: 1–4 stars each (talent budget split over the star slots), elements assigned. */
function mkTeams() {
  const used = new Set();
  _pid = 0;
  return TEAMDEFS.map(([name, short, color, sk], i) => {
    const t = { i, name, short, color, sk, S: STYLES[sk], hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] } };
    const rr = R(),
      nS = rr < 0.3 ? 1 : rr < 0.8 ? 2 : rr < 0.95 ? 3 : 4;
    t.nStars = nS;
    t.arch = ARCH[nS];
    const slots = ['S', 'MB', 'W0', 'W1'];
    let chosen;
    if (nS === 4) chosen = slots;
    else
      do {
        chosen = [];
        const pool = [...slots];
        while (chosen.length < nS) {
          const k = wpick(pool, x => (x[0] === 'W' ? 2 : 1));
          chosen.push(k);
          pool.splice(pool.indexOf(k), 1);
        }
      } while (nS > 1 && !chosen.some(k => k[0] === 'W'));
    const budget = 150 + 25 * (nS - 1),
      ws = chosen.map(() => rnd(0.7, 1.3)),
      wsum = ws.reduce((a, b) => a + b, 0),
      bon = {};
    chosen.forEach((k, x) => (bon[k] = (budget * ws[x]) / wsum));
    fillRoster(t, bon, used);
    return t;
  });
}
/** Roll a team's four players from per-slot talent bonuses {S, MB, W0, W1}, pick the flex role, finalize. */
function fillRoster(t, bon, used) {
  t.s = mkPlayer('S', 'S', bon.S || 0, t, used);
  t.mb = mkPlayer('MB', 'MB', bon.MB || 0, t, used);
  const fr = wpick(['WS', 'MB', 'S'], r => FLEXW[t.sk][r]);
  t.flex = fr;
  t.sys = SYSN[fr];
  t.ws = [mkPlayer('WS', 'W0', bon.W0 || 0, t, used), mkPlayer(fr, 'W1', bon.W1 || 0, t, used)];
  t.ws[1].flex = true;
  t.P = [t.s, t.mb, ...t.ws];
  // the bench: one player of the flex role and a wing spiker
  t.bench = [
    mkPlayer(fr, fr === 'S' ? 'S' : fr === 'MB' ? 'MB' : 'W1', bon.bench || 0, t, used),
    mkPlayer('WS', 'W0', bon.bench || 0, t, used)
  ];
  finalizeTeam(t);
}
/** Career league: eight teams of average players (no stars yet) — everyone grinds from here. */
function mkLeagueTeams() {
  const used = new Set();
  _pid = 0;
  return TEAMDEFS.map(([name, short, color, sk], i) => {
    const t = { i, name, short, color, sk, S: STYLES[sk], hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] }, nStars: 0, arch: 'Rookie squad' };
    fillRoster(t, {}, used);
    return t;
  });
}
/** Monster game: two random teams where every player is OP (talent 110+, red star). */
function mkMonsterTeams() {
  const used = new Set();
  _pid = 0;
  const defs = [...TEAMDEFS].sort(() => R() - 0.5).slice(0, 2);
  return defs.map(([name, short, color, sk], i) => {
    const t = { i, name, short, color, sk, S: STYLES[sk], hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] }, nStars: 4, arch: 'Monster squad' };
    const bon = {};
    for (const k of ['S', 'MB', 'W0', 'W1', 'bench']) bon[k] = rnd(110, 150);
    fillRoster(t, bon, used);
    return t;
  });
}
/**
 * Egoist game (dev, T-200): two all-OP teams (as mkMonsterTeams) where everyone is a pure egoist — ego 1 and a negative wit
 * (−0.2 to −1): maturity 0, so ego acts come at their full rate and no captain reins them in. Negative wit never lowers
 * the body (witBody: power / defense count it as 1); the reads, sets and calls play like the lowest wit.
 */
function mkEgoistTeams() {
  const T = mkMonsterTeams();
  for (const t of T) {
    for (const p of squadOf(t)) Object.assign(p, { wit: -+rnd(0.2, 1).toFixed(2), ego: 1 });
    t.arch = 'Egoist squad';
    finalizeTeam(t);
  }
  return T;
}
/**
 * Average game (dev): two random teams of ordinary players — each player's overall rolled in `ovr` (default 30–60), their
 * stats shifted together to it (the rolled shape kept, 10–99). No stars, no OP.
 */
function mkAverageTeams(lo = 30, hi = 60) {
  const used = new Set();
  _pid = 0;
  const defs = [...TEAMDEFS].sort(() => R() - 0.5).slice(0, 2);
  return defs.map(([name, short, color, sk], i) => {
    const t = { i, name, short, color, sk, S: STYLES[sk], hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] }, nStars: 0, arch: 'Average squad' };
    fillRoster(t, {}, used);
    for (const p of squadOf(t)) {
      const target = Math.round(rnd(lo, hi));
      for (let it = 0; it < 4; it++) {
        const d = target - ovr(p);
        for (const k of STATK) p[k] = Math.round(clamp(p[k] + d, 10, 99));
      }
      Object.assign(p, { star: false, op: false, bonus: 0 });
    }
    finalizeTeam(t);
    return t;
  });
}
/**
 * Everything that depends on a team's final roster: leadership, captain, coach, shirt numbers, rating. Leadership,
 * elements and numbers cover the whole squad (numbers unique across all 6); the captain and rating are the 4 on court.
 * Call again after changing a roster (e.g. inserting a created player).
 */
function finalizeTeam(t) {
  const all = squadOf(t);
  // values already set (e.g. a created player's leadership or number) are kept
  for (const q of all)
    if (q.lead == null)
      q.lead = Math.round(clamp(rnd(28, 78) + (q.role === 'S' ? 8 : 0) + (q.star ? 6 : 0) + (R() < 0.15 ? rnd(10, 22) : 0), 20, 99));
  for (const q of all) elAssign(q); // hidden element + signature spike (after leadership: it shapes Starlight)
  for (const q of all) q.cap = false;
  t.cap = t.P.reduce((x, q) => (q.lead > x.lead ? q : x), t.P[0]);
  t.cap.cap = true;
  if (t.coachIQ == null) t.coachIQ = +rnd(0.4, 1).toFixed(2);
  const nums = new Set(all.map(p => p.num).filter(Boolean));
  all.forEach(p => {
    if (p.num) return;
    let n;
    do {
      n = 1 + Math.floor(R() * 19);
    } while (nums.has(n));
    nums.add(n);
    p.num = n;
  });
  t.ovr = teamOvr(t);
}
/** Team rating: the players' average overall. */
const teamOvr = t => Math.round(t.P.reduce((a, p) => a + ovr(p), 0) / t.P.length);
/**
 * Even out the eight tournament teams: play everyone against everyone (n games per pair) and nudge the stats of
 * teams outside a 36–64% win rate, up to `rounds` times.
 */
function simBalance(T, rounds = 6, n = 16) {
  for (let r = 0; r < rounds; r++) {
    const wr = T.map(() => 0);
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++)
        for (let k = 0; k < n; k++) {
          const w = simMatch(T[i], T[j]).winner;
          wr[w === 0 ? i : j]++;
        }
    if (wr.every(v => v / (7 * n) > 0.3 && v / (7 * n) < 0.7)) break;
    T.forEach((t, i) => {
      const x = wr[i] / (7 * n),
        d = x > 0.64 ? -1 : x < 0.36 ? 1 : 0;
      if (!d) return;
      const amt = Math.round(Math.abs(x - 0.5) * 22);
      {
        const tg = t.P.filter(p => !p.star);
        for (const p of tg.length ? tg : t.P)
          for (const k of ['power', 'def', 'speed', 'jump'])
            p[k] = clamp(p[k] + d * (tg.length ? amt : Math.ceil(amt / 2)), 30, tg.length ? 88 : 99);
      }
      const stars = t.P.filter(p => p.star);
      if (d < 0 && stars.length) {
        const sp = pick(stars);
        sp.def = clamp(sp.def - amt, 40, 99);
      }
    });
  }
  T.forEach(t => (t.ovr = teamOvr(t)));
}
