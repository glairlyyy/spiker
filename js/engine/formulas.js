// Core match formulas in one place — the tuning surface for balance and for career/training stats.
// Each function reads effective stats (wit, mood, momentum, stamina already applied via stats.js).
// Random rolls happen inside, in a fixed order, so seeded runs stay reproducible.

const Formula = {
  /** The ground of the match being played (spec §4.38: GROUNDS[CM.ground.k]), null on an official court. */
  ground: () => (CM && CM.ground ? GROUNDS[CM.ground.k] || null : null),
  /** Is p born to this ground (CM.ground.home)? */
  gHome: p => !!(CM && CM.ground && CM.ground.home && CM.ground.home.includes(p.id)),
  /** A ground multiplier for p (GROUNDS key 'agi' | 'jump' | 'hp' | 'dig'): 1 off a field; born to it: keeps part of the penalty, + a little on agi / jump. */
  gMul(p, key) {
    const G = Formula.ground();
    if (!G || G[key] == null) return 1;
    if (key === 'hp' || !Formula.gHome(p)) return G[key]; // (HP is the ground's, born to it or not)
    return 1 - (1 - G[key]) * GROUNDS.home.keep + (key === 'agi' || key === 'jump' ? GROUNDS.home.plus : 0);
  },
  /** A ground penalty for p (GROUNDS key 'pass' | 'set' | 'serve'): 0 off a field; born to it: only part of it. */
  gOff(p, key) {
    const G = Formula.ground();
    return G && G[key] ? G[key] * (Formula.gHome(p) ? GROUNDS.home.keep : 1) : 0;
  },
  /** How good a player is at an action (SKILL.use: 'serve' | 'spike' | 'set' | 'pass' | 'block'): its stats, weighted. */
  level: (p, act) => Object.entries(SKILL.use[act]).reduce((a, [k, w]) => a + p[k] * w, 0),
  /** How often they make mistakes at it (SKILL): 1 at SKILL.mid, more below (at most SKILL.max), less above. */
  errK: (p, act) => Math.min(SKILL.max, Math.exp((SKILL.mid - Formula.level(p, act)) / SKILL.k)),
  /** An error chance at an action, scaled by the player's mistake factor for it. */
  bySkill: (p, act, base) => base * Formula.errK(p, act),
  /** Serve strength (roughly 20–110). Wing spikers serve hardest. */
  serveQuality: (server, team, roll = rnd(0.8, 1.2)) =>
    effP(server) *
    0.8 *
    { WS: 1, MB: 0.88, S: 0.8 }[server.role] *
    team.S.serve *
    roll *
    skillMod(server, 'serve') *
    stageBuff(server, 'serve'),
  /** Chance the serve goes into the net or out. Low wit and very hard serves miss more. */
  serveErrorP: (server, team, sq) =>
    Formula.bySkill(server, 'serve', 0.06 + Math.max(0, 1.2 - W(server)) * 0.05 + (sq > 80 ? 0.03 : 0)) * team.S.serveErr +
    (server.traits ? trServeErr(server) : 0) + // Shaky Hands (spec §4.30)
    (CM && CM.ground && CM.ground.low === CM.t.indexOf(team) ? Formula.gOff(server, 'serve') : 0), // the low end serves into the rise (§4.38)
  /** Chance a body at the tape touches the net (FAULTS.net): kind 'hit' | 'tip' | 'read' | 'commit'; fatigue = 1 − stamina. */
  netTouchP: (p, kind, fatigue) => {
    const F = FAULTS.net;
    return (
      F[kind] *
      (1 + F.tired * fatigue) *
      (1 + (F.agi * clamp(F.agiFrom - p.speed, 0, F.agiFrom)) / F.agiFrom) *
      (mtr(CM, p) === 'hothead' ? F.reckless : 1)
    );
  },
  /** Chance the server steps on the end line (FAULTS.foot): by serve type ('jump' | 'jumpfloat' | 'float'), tired feet more. */
  footFaultP: (server, type) => FAULTS.foot[type] * (1 + FAULTS.foot.tired * (1 - staOf(server))),
  /** Which way a missed serve goes: a flat or tired swing clips the net, too much power sails long. */
  serveNetShare: (server, sq, jump) => clamp((jump ? 0.42 : 0.56) - (sq - 60) / 350 + (1 - staOf(server)) * 0.2, 0.15, 0.8),
  /** Which way a missed spike goes: the lower the contact over the net, the likelier it's the net. */
  spikeNetShare: (hS, longB) => clamp(0.4 + (190 - hS) / 100 - (longB ? 0.2 : 0), 0.15, 0.75),
  /** Serve-receive quality; being far from the ball costs more for slow players. */
  receiveScore: (rc, team, dist0) =>
    (effD(rc) * 0.7 + rc.speed * stageBuff(rc, 'spd') * Formula.gMul(rc, 'agi') * 0.3) * team.S.dig * skillMod(rc, 'receive') -
    Math.max(0, dist0 - 0.1) * 45 * (1.3 - rc.speed / 100) -
    SKILL.pass * (Formula.errK(rc, 'pass') - 1) - // a weak passer shanks more (SKILL)
    Formula.gOff(rc, 'pass'), // uneven ground (§4.38)
  /** Chance a set is at least "good" (before the double-contact check). */
  setSuccess(setter, qual, team, dual) {
    let succ = clamp(
      0.5 +
        0.23 * W(setter) +
        (qual - 2) * 0.09 +
        team.S.set +
        (dual && setter.role === 'S' ? 0.03 : 0) -
        Formula.gOff(setter, 'set') +
        (cardBuff(setter, 'set') - 1), // Improve Set (spec §2.37): + its % to a good set
      0.08,
      0.985
    );
    if (setter.role !== 'S') succ *= 0.75;
    if (setter.skills) succ = Math.min(0.99, succ * skillMod(setter, 'set'));
    return succ;
  },
  /** Spike power (km/h = 40 + 0.85 × power). fat: long-rally multiplier (rally.js). */
  spikePower: ({ spiker, team, setMul, quick, back, longB, combo, fat }) =>
    effP(spiker) *
    (0.55 + (spiker.jump * Formula.gMul(spiker, 'jump') * team.S.jump) / 180) *
    setMul *
    team.S.spike *
    rnd(0.8, 1.2) *
    (quick ? 0.88 : 1) *
    (back ? (longB ? 0.94 : 0.88) * skillMod(spiker, 'pipe') : 1) * // long back: a full-body, broad-jump swing
    (combo ? 1.15 : 1) *
    fat *
    skillMod(spiker, 'spike') *
    stageBuff(spiker, 'atk'), // the momentum stage (spec §2.14)
  /**
   * Chance the spiker hits into the net or out: a mistake, never a choice. Low wit, a bad set, over-hitting and a
   * low contact point (little room over the net: hand height hS vs the tape at 150) all make it likelier.
   */
  spikeErrorP: ({ spiker, bad, pow, around, back, longB, hS }) =>
    Formula.bySkill(spiker, 'spike', 1) *
    (0.045 +
      clamp((190 - (hS || 190)) / 400, 0, 0.08) +
      (bad ? 0.07 : 0) +
      Math.max(0, 1 - W(spiker)) * 0.07 +
      (pow > 110 ? 0.03 : 0) +
      (around ? 0.03 : 0) +
      (back ? 0.02 : 0) +
      (longB ? 0.05 : 0)), // hit from 7 m out: easy to sail it long
  /** Block strength, scaled by how much of the attack lane the block covers (cov 0..~1.25). */
  blockPower: (b0, b1, team, cov) =>
    ((effD(b0) * 0.55 + b0.jump * Formula.gMul(b0, 'jump') * team.S.jump * 0.45) * team.S.block * skillMod(b0, 'block') * rnd(0.8, 1.2) +
      (b1 ? (b0.role === 'MB' && b1.role === 'MB' ? 18 : 10) : 0)) *
    cov,
  /** Dig quality for a defender who has to cover dist0 to reach the ball. */
  digScore: (dg, team, dist0) =>
    (effD(dg) * 0.6 + dg.speed * stageBuff(dg, 'spd') * Formula.gMul(dg, 'agi') * 0.4) *
      team.S.dig *
      rnd(0.8, 1.2) *
      Formula.gMul(dg, 'dig') -
    Math.max(0, dist0 - 0.1) * 55 * (1.35 - dg.speed / 100) * skillMod(dg, 'reach'),
  /** Chance an attack scores against a given dig score. */
  killChance: (pow, dsc, tip, dist0) => (tip ? 0.3 + dist0 * 0.3 : sig((pow - dsc) / 34 + 0.3))
};
