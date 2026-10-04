// Core match formulas in one place — the tuning surface for balance and for career/training stats.
// Each function reads effective stats (wit, mood, momentum, stamina already applied via stats.js).
// Random rolls happen inside, in a fixed order, so seeded runs stay reproducible.

const Formula = {
  /** How good a player is overall (SKILL): the mean of the four stats + wit. */
  level: p => (p.power + p.def + p.speed + p.jump) / 4 + (p.wit - 1) * SKILL.wit,
  /** How often they make mistakes vs a mid player (SKILL): 1 at SKILL.mid, more below, less above. */
  errK: p => Math.min(SKILL.max, Math.exp((SKILL.mid - Formula.level(p)) / SKILL.k)), // (a beginner tops out at SKILL.max)
  /** An error chance scaled by the player's mistake factor (keeping SKILL.keep of the base rate for everyone). */
  bySkill: (p, base) => base * (SKILL.keep + (1 - SKILL.keep) * Formula.errK(p)),
  /** Serve strength (roughly 20–110). Wing spikers serve hardest. */
  serveQuality: (server, team) =>
    effP(server) * 0.8 * { WS: 1, MB: 0.88, S: 0.8 }[server.role] * team.S.serve * rnd(0.8, 1.2) * skillMod(server, 'serve'),
  /** Chance the serve goes into the net or out. Low wit and very hard serves miss more. */
  serveErrorP: (server, team, sq) =>
    Formula.bySkill(server, 0.06 + Math.max(0, 1.2 - W(server)) * 0.05 + (sq > 80 ? 0.03 : 0)) * team.S.serveErr,
  /** Which way a missed serve goes: a flat or tired swing clips the net, too much power sails long. */
  serveNetShare: (server, sq, jump) => clamp((jump ? 0.42 : 0.56) - (sq - 60) / 350 + (1 - staOf(server)) * 0.2, 0.15, 0.8),
  /** Which way a missed spike goes: the lower the contact over the net, the likelier it's the net. */
  spikeNetShare: (hS, longB) => clamp(0.4 + (190 - hS) / 100 - (longB ? 0.2 : 0), 0.15, 0.75),
  /** Serve-receive quality; being far from the ball costs more for slow players. */
  receiveScore: (rc, team, dist0) =>
    (effD(rc) * 0.7 + rc.speed * 0.3) * team.S.dig * skillMod(rc, 'receive') -
    Math.max(0, dist0 - 0.1) * 45 * (1.3 - rc.speed / 100) -
    SKILL.pass * (Formula.errK(rc) - 1), // a weak passer shanks more (SKILL)
  /** Chance a set is at least "good" (before the double-contact check). */
  setSuccess(setter, qual, team, dual) {
    let succ = clamp(0.5 + 0.23 * W(setter) + (qual - 2) * 0.09 + team.S.set + (dual && setter.role === 'S' ? 0.03 : 0), 0.08, 0.985);
    if (setter.role !== 'S') succ *= 0.75;
    if (setter.skills) succ = Math.min(0.99, succ * skillMod(setter, 'set'));
    return succ;
  },
  /** Spike power (km/h = 40 + 0.85 × power). fat: long-rally multiplier (rally.js). */
  spikePower: ({ spiker, team, setMul, quick, back, longB, combo, fat }) =>
    effP(spiker) *
    (0.55 + (spiker.jump * team.S.jump) / 180) *
    setMul *
    team.S.spike *
    rnd(0.8, 1.2) *
    (quick ? 0.88 : 1) *
    (back ? (longB ? 0.94 : 0.88) * skillMod(spiker, 'pipe') : 1) * // long back: a full-body, broad-jump swing
    (combo ? 1.15 : 1) *
    fat *
    skillMod(spiker, 'spike'),
  /**
   * Chance the spiker hits into the net or out: a mistake, never a choice. Low wit, a bad set, over-hitting and a
   * low contact point (little room over the net: hand height hS vs the tape at 150) all make it likelier.
   */
  spikeErrorP: ({ spiker, bad, pow, around, back, longB, hS }) =>
    Formula.bySkill(spiker, 1) *
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
    ((effD(b0) * 0.55 + b0.jump * team.S.jump * 0.45) * team.S.block * skillMod(b0, 'block') * rnd(0.8, 1.2) +
      (b1 ? (b0.role === 'MB' && b1.role === 'MB' ? 18 : 10) : 0)) *
    cov,
  /** Dig quality for a defender who has to cover dist0 to reach the ball. */
  digScore: (dg, team, dist0) =>
    (effD(dg) * 0.6 + dg.speed * 0.4) * team.S.dig * rnd(0.8, 1.2) -
    Math.max(0, dist0 - 0.1) * 55 * (1.35 - dg.speed / 100) * skillMod(dg, 'reach'),
  /** Chance an attack scores against a given dig score. */
  killChance: (pow, dsc, tip, dist0) => (tip ? 0.3 + dist0 * 0.3 : sig((pow - dsc) / 34 + 0.3))
};
