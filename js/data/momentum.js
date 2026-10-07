// Match momentum (spec §2.14): team fire, the four stages and their buffs, temperaments, the read meter and the captain's
// calls. Data only — the engine (js/engine/fire.js, match.js, stats.js) applies it; the HUD (match-controls.js) and the
// director (js/render/director.js) read the stage names. Numbers in steps of 5 (owner, 2026-10-07); tuned by the balance check.

/** Stage order, coldest first. */
const STAGE_IDS = ['loose', 'composed', 'focused', 'fever'];
/**
 * id → { name, from (team fire at which it starts; Fever also needs a trigger), buff: stat → % (atk = power in play,
 * def = defense in play, spd = speed, jump, serve), tip: the tooltip's how-to-leave line }.
 */
const STAGES = {
  loose: {
    name: 'Loose',
    from: -1,
    buff: { atk: -5, def: -5, serve: -5 },
    tip: 'Win a rally, call a timeout, or have the captain settle the team.'
  },
  composed: { name: 'Composed', from: -0.25, buff: { def: 5 }, tip: 'The team plays its own game.' },
  focused: { name: 'Focused', from: 0.35, buff: { atk: 5, spd: 5 }, tip: 'Keep scoring to reach Fever.' },
  fever: {
    name: 'Fever',
    from: 0.8,
    buff: { atk: 10, def: -10, spd: 5, jump: 5 },
    tip: 'Up to 4 points; an error ends it. A zone breaker drops it to Composed, a stuff to Focused.'
  }
};
/** The stage a scoreboard snapshot shows for a side (until the engine sends `stage`, read it from the old mom / zone). */
function stageOfSnap(s, side) {
  if (s.stage) return s.stage[side];
  if (s.zone && s.zone[side]) return 'fever';
  const f = s.mom ? s.mom[side] : 0;
  return f < STAGES.composed.from ? 'loose' : f < STAGES.focused.from ? 'composed' : 'focused';
}
