// Your body (spec §4.33): Strength, Agility, Endurance, Flexibility are what you train; the court skills the engine reads
// (power / def / speed / jump) are worked out from them and written onto your player after every body change (Body.sync),
// so ovr, techniques and cards read what they read. NPCs have no body. Pure: no randoms, no DOM.

const Body = {
  /** Your body ({ str, agi, end, flex }) or null (an NPC). */
  of: p => (p && p.body) || null,
  /** Swing range 0.5–1: a full swing needs Flexibility ≥ BODY.swing × Strength (p with Rubber Joints: always full, spec §4.35). */
  swing: (b, p) => (hasGift(p, 'rubberJoints') ? 1 : b.str > 0 ? clamp(b.flex / (BODY.swing * b.str), BODY.swingMin, 1) : 1),
  /** Load depth 0.6–1: a deep jump load needs Flexibility ≥ BODY.depth × Strength. */
  depth: b => (b.str > 0 ? clamp(b.flex / (BODY.depth * b.str), BODY.depthMin, 1) : 1),
  /** The Flexibility a full swing needs now (Strength × BODY.swing, rounded up). */
  swingNeed: b => Math.ceil(BODY.swing * b.str),
  /** The court skills of a body, unrounded: a balanced body (all four at X) gives every skill X. p (optional): its owner's gifts. */
  court(b, p) {
    const W = BODY.w,
      P = W.power;
    return {
      power: P.str * b.str * (P.base + P.k * Body.swing(b, p)) + P.agi * b.agi,
      jump: W.jump.str * b.str * Body.depth(b) + W.jump.agi * b.agi,
      speed: W.speed.agi * b.agi + W.speed.end * b.end,
      def: W.def.flex * b.flex + W.def.agi * b.agi + W.def.end * b.end
    };
  },
  /**
   * Write the court skills from the body (rounded, CAREER.statMin–runCap). A court skill changed directly since the last sync is
   * kept: raised (the Hermit's +2 past the cap) → a floor the body catches up with (`p.floor`), lowered (tests) → an offset
   * (`p.edge`); `p.synced` = the values last written. `run` (optional): Endurance sets run.staMax (CAREER.staMax + ⌊end × BODY.sta⌋,
   * + a stamina sponsor's 15).
   */
  sync(p, run) {
    const b = Body.of(p);
    if (!b) return;
    const c = Body.court(b, p),
      E = p.edge || (p.edge = {}),
      F = p.floor || (p.floor = {}),
      S = p.synced || (p.synced = {});
    for (const k of STATK) {
      if (Number.isFinite(S[k]) && p[k] > S[k]) F[k] = Math.max(F[k] || 0, p[k]);
      else if (Number.isFinite(S[k]) && p[k] < S[k]) E[k] = (E[k] || 0) + (p[k] - S[k]);
      p[k] = Math.round(clamp(Math.max(c[k] + Gifts.stat(p, k) + (E[k] || 0), F[k] || 0), CAREER.statMin, CAREER.runCap)); // + body gifts (§4.35)
      S[k] = p[k];
    }
    if (run) {
      const mx = CAREER.staMax + Math.floor(b.end * BODY.sta) + (Sponsors.active(run, 'aqua') ? 15 : 0);
      if (mx !== run.staMax) {
        run.sta = Math.min(run.sta + Math.max(0, mx - run.staMax), mx);
        run.staMax = mx;
      }
    }
  },
  /** A new body at `v` in every stat. */
  make: v => Object.fromEntries(BODY.keys.map(k => [k, v])),
  isKey: k => BODY.keys.includes(k),
  /** Display name of a body stat, wit or a court skill. */
  name: k => BODY.name[k] || STATNAME[k],
  glyph: k => BODY.glyph[k] || (GLOSSARY[k] && GLOSSARY[k].glyph) || '',
  /** The body stat a court skill leans on most (its largest weight in BODY.w). */
  lead: k => BODY.keys.reduce((a, b) => ((BODY.w[k][b] || 0) > (BODY.w[k][a] || 0) ? b : a)),
  /** The body stat a change to court skill / body key `k` lands on (wit / lead: itself). */
  key: k => (BODY.of[k] ? BODY.of[k] : k)
};
