// Decision points (spec §2.13, T-232 / T-233): where a played match asks you instead of the AI. The engine computes the AI's
// pick first (the same draws as the sim flow), then `yield* decide(m, q)`: for `m.human`'s own player the rally suspends with
// q = { kind, p, options, suggest, ai } and resumes with the pick (null → the suggested option); for everyone else, and
// whenever `m.human` is unset (sim, headless, NPCs, the Monster game), it returns q.ai at once — today's behaviour — without
// computing any option. Options are sampled from the engine's formulas on a private generator (Decide.isolate): neither the
// game stream nor Math.random is touched, and the same moment always shows the same odds.

/** Ask the picker: yields only for m.human's player. Returns the pick: an option id (asked) or q.ai (not asked). */
function* decide(m, q) {
  if (!m.human || !q.p || q.p.id !== m.human) return q.ai;
  if (typeof q.options === 'function')
    q.options = Decide.isolate(`${m.setScores}|${m.beats ? m.beats.length : 0}|${q.kind}|${q.p.id}`, q.options);
  if (!q.options.length) return q.ai;
  q.suggest = Decide.best(q.options);
  m.askAt = m.beats ? m.beats.length : 0; // what the player may have seen played: later inserts land after it
  const pick = yield q;
  CM = m; // the effective-stat helpers read the match being played (something else may have run while suspended)
  if (pick === q.ai) return q.ai; // the AI's own play (tests: the sim flow, draw for draw)
  const id = q.options.some(o => o.id === pick) ? pick : q.suggest,
    o = q.options.find(x => x.id === id);
  (m.calls || (m.calls = [])).push({
    kind: q.kind,
    p: q.p.id,
    id,
    label: o.label,
    odds: o.odds,
    weak: o.weak,
    auto: pick == null,
    out: null
  });
  return id;
}

const Decide = {
  /** Run fn with R() (and so rnd / Formula draws) on a private mulberry32 seeded from `key`; the game stream is restored after. */
  isolate(key, fn) {
    let a = Math.floor(hstr(key) * 4294967296) >>> 0;
    const next = RNG.next,
      own = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    RNG.next = own;
    try {
      return fn();
    } finally {
      RNG.next = next;
    }
  },
  /** The suggested option: the best chance to win the point outright, less the chance to lose it. */
  best: opts => opts.reduce((a, o) => (o.odds.win - o.odds.lose - o.odds.err > a.odds.win - a.odds.lose - a.odds.err ? o : a)).id,
  /** The stat of `keys` that holds p back most (wit counts × 50, like its XP level). */
  weak(p, keys) {
    const k = keys.reduce((a, b) => ((b === 'wit' ? p.wit * 50 : p[b]) < (a === 'wit' ? p.wit * 50 : p[a]) ? b : a));
    return { k, v: k === 'wit' ? +p.wit.toFixed(2) : Math.round(p[k]) };
  },
  /** One option's display data. odds in whole percent. */
  opt(id, D, p, n, tally, name) {
    return {
      id,
      label: D.label.replace('{name}', name || ''),
      odds: Object.fromEntries(
        ['win', 'lose', 'err'].map(k => [k, Math.min(99, Math.round((100 * tally[k] * ((D.cal && D.cal[k]) || 1)) / n))])
      ),
      stats: D.stats,
      weak: Decide.weak(p, D.stats)
    };
  },
  /** The receivers a serve can go to (not the setter). */
  receivers: RT => RT.P.filter(p => p !== RT.s),
  /** The weakest passer (the Target serve's aim — the same rule as the Target Serve technique). */
  weakest: RT => Decide.receivers(RT).reduce((a, p) => (effD(p) + p.speed * 0.3 < effD(a) + a.speed * 0.3 ? p : a)),
  /** Serve options for context c (after serveWalk drew the serve quality): win = ace, err = fault. */
  serve(c, server, sq) {
    const { RT, ST } = c,
      n = DECIDE.odds,
      wk = Decide.weakest(RT);
    return Object.entries(DECIDE.serve).map(([id, D]) => {
      const t = { win: 0, lose: 0, err: 0 },
        type = D.type || serveType(server, sq),
        q = sq * D.sq * (type === 'jump' ? 1 + (runUpM(server, 'jump') - 3.2) * 0.05 : 1),
        errP = clamp(Formula.serveErrorP(server, ST, q) * D.err, 0, 0.9);
      for (let i = 0; i < n; i++) {
        if (R() < errP) {
          t.err++;
          continue;
        }
        const rc = D.aim ? wk : pick(Decide.receivers(RT)),
          d0 = D.aim ? 0.25 : rnd(0.1, 0.8),
          rs = Formula.receiveScore(rc, RT, d0);
        if (R() < sig((q - rs) / 24 - 2.4)) t.win++;
      }
      return Decide.opt(id, D, server, n, t, wk.name.split(' ')[0]);
    });
  },
  /**
   * Attack options for the possession c and attack x (after spikePower; x.cov0 / x.pow0 = the block's coverage and the power
   * before the AI's shot choice): win = a kill or a tool, lose = blocked, err = a hitting error; the rest is dug (the rally goes on).
   */
  attack(c, x) {
    const { defT, atkT } = c,
      n = DECIDE.odds,
      { spiker, b0, b1, blockers } = x,
      defs = defT.P.filter(p => !(blockers || []).includes(p));
    return Object.entries(DECIDE.attack)
      .filter(([, D]) => D.need !== 'block' || x.cov0 > 0.3)
      .map(([id, D]) => {
        const t = { win: 0, lose: 0, err: 0 },
          cov = Decide.cov(x, D);
        for (let i = 0; i < n; i++) {
          let pow = D.tip ? rnd(18, 30) : Decide.pow(c, x) * D.pow;
          if (!D.tip && R() < Formula.spikeErrorP({ ...x, spiker, pow, around: !!D.cut })) {
            t.err++;
            continue;
          }
          let touched = false;
          if (!D.tip && cov > BLOCK_MIN_COV && b0) {
            const bp = Formula.blockPower(b0, b1, defT, cov);
            if (R() < stuffChance(bp, cov, pow) * blockSkill(b0)) {
              t.lose++;
              continue;
            }
            if (R() < sig((bp - pow) / 20 + 0.2)) {
              touched = true;
              pow *= 0.7;
            } else if (cov >= TOOL_COV[0] && cov < TOOL_COV[1] && R() < TOOL_P) {
              t.win++;
              continue;
            }
          }
          const dg = pick(defs.length ? defs : defT.P),
            d0 = D.tip ? rnd(0.3, 0.8) : D.cut ? rnd(0.05, 0.4) : rnd(0.05, 0.6), // (measured: a cut lands nearer a defender)
            dsc = Formula.digScore(dg, defT, d0) * (touched ? 1.15 : 1);
          if (R() < Formula.killChance(pow, dsc, !!D.tip, d0)) t.win++;
        }
        return Decide.opt(id, D, spiker, n, t, atkT.name);
      });
  },
  /** The block's coverage left for an attack option: the cut shot reads like the engine's around-the-block rule. */
  cov(x, D) {
    let cov = x.cov0;
    if (D.tip) return 0;
    if (D.cut) cov *= 0.45 + (x.b0 && W(x.b0) >= W(x.spiker) ? 0.2 : 0);
    if (x.seam) cov *= 0.45;
    return cov;
  },
  /** Full spike power for this attack (the AI's if it swung; recomputed when it had tipped). */
  pow: (c, x) =>
    x.pow0 ||
    Formula.spikePower({
      spiker: x.spiker,
      team: c.atkT,
      setMul: { perfect: 1.12, good: 1, bad: 0.72 }[x.sq2],
      quick: x.quick,
      back: x.back,
      longB: x.longB,
      combo: x.combo,
      fat: x.fat
    }),
  /** Your shot (spec §2.13): rewrite the attack x for the option you picked (only when it differs from the AI's shot). */
  applyShot(c, x, id) {
    const D = DECIDE.attack[id];
    if (!D) return;
    const pow = Decide.pow(c, x);
    x.tip = !!D.tip;
    x.around = !!D.cut;
    x.delayed = false;
    x.elS = D.tip ? null : x.elS;
    x.el = x.elS ? x.elS.el : null;
    x.pow = D.tip ? rnd(18, 30) : pow * D.pow * (x.elS ? x.elS.pow : 1);
    x.cov = Decide.cov(x, D) * (x.elS ? x.elS.cov : 1);
    x.tier = x.tip ? 'tip' : x.pow >= 100 ? 'ult' : x.pow >= 80 ? 'heavy' : x.pow >= 58 ? 'hard' : 'soft';
    if (c.V && (x.tip || x.cov <= BLOCK_MIN_COV)) dropDefScene(c.m);
  },
  /** Record what came of your last call of `kind` (win / lose / err / on — the rally went on). */
  out(m, kind, pid, out) {
    const L = m.calls,
      e = L && L[L.length - 1];
    if (e && e.kind === kind && e.p === pid && e.out == null) e.out = out;
  }
};
