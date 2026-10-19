// Sparks and Scars (spec §4.30, owner 2026-10-20): the traits only your career player carries (`you.traits`, ids). A Fired up
// may roll a Spark (the Drive pool); Pain at 100 rolls a Scar (mostly bad, a rare OP one), hidden until it first acts.
// Data only: the rolls are js/career/feel.js (seeded, no R()), the match effects js/engine/bars.js (read `p.traits` only).
// desc: the registrar's line (true numbers); the diary lines are FEEL_LINES.traits (js/data/story.js).

/** The odds: a Spark per Fired up; a Scar's OP share (+ per Lighthouse sharpen, + per Scar before); at most `max` of each. */
const TRAIT_ODDS = { spark: 0.35, op: 0.12, sharp: 0.08, per: 0.04, max: 3 };
/** "20+ points" of a 25-point set, in this game's 15-point set (= TRAIT_LATE): Clutch and Shaky Hands act from here. */
const TRAIT_LATE_PTS = 12;

/** The Drive pool. k: the effect's number; fx: the special effects it shows always (render/effects.js specialFx). */
const SPARKS = {
  clutch: { name: 'Clutch', k: 0.06, desc: 'Attack and defence +6 % from 12 points or at set point.' },
  secondWind: { name: 'Second Wind', k: 0.1, desc: 'HP heals +0.1 more between rallies.' },
  voice: { name: "Captain's Voice", k: 0.05, desc: 'Your kills lift every teammate’s morale +0.05.' },
  ironWill: { name: 'Iron Will', k: -0.3, desc: 'Your morale never falls below −0.3.' },
  airImpact: { name: 'Air Impact', k: 0.03, fx: ['air'], desc: 'The air impact spike, always. Power +3 %.' },
  flashStep: { name: 'Flash Step', fx: ['warp'], desc: 'The warp jump, always.' },
  godOfWar: {
    name: 'God of War',
    k: 0.08,
    fx: ['burst', 'ink'],
    desc: 'The explosive burst and the ink style, always. Two kills running: power +8 % until your next error.'
  }
};
/** Pain's pools: bad (the rest of the odds) and `op`. Career-side ones: `career` (named at the next match after they act). */
const SCARS = {
  glassAnkle: { name: 'Glass Ankle', k: 1.5, career: true, desc: 'Injury chance × 1.5.' },
  shakyHands: { name: 'Shaky Hands', k: 0.06, desc: 'Serve errors +6 % from 12 points.' },
  haunted: { name: 'Haunted', k: -0.2, desc: 'Morale −0.2 at the start against Haewon’s squad.' },
  insomnia: { name: 'Insomnia', k: 0.8, career: true, desc: 'Rest −20 %.' },
  tunnel: { name: 'Tunnel Vision', k: -0.1, desc: 'Wit −0.1 in matches.' },
  bitter: { name: 'Bitter', k: 0.7, career: true, desc: 'Bonds grow 30 % slower.' },
  enlight: { name: 'Enlightenment', op: true, k: 6, wit: 0.3, desc: 'Every body stat +6, past the caps. Wit +0.3.' },
  eyeStorm: { name: 'Eye of the Storm', op: true, desc: 'No morale loss.' },
  spite: { name: 'Spite', op: true, k: 0.08, desc: 'Every stat +8 % against Haewon’s squad.' },
  deadCalm: { name: 'Dead Calm', op: true, desc: 'Never Rattled: a Loose team plays you as Composed.' }
};
/** Every Spark and Scar by id. */
const MC_TRAITS = { ...SPARKS, ...SCARS };
