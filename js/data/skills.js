// Learnable skills. Each skill multiplies one formula hook (see engine/skills.js); `when` names a condition.
// role: 'any' or S/MB/WS.

const SKILLS = {
  cannon: { name: 'Cannon Serve', role: 'any', cost: 120, key: 'serve', val: 1.08, desc: 'Serve quality +8%' },
  softhands: { name: 'Soft Hands', role: 'any', cost: 100, key: 'receive', val: 1.08, desc: 'Serve receive +8%' },
  quickfeet: { name: 'Quick Feet', role: 'any', cost: 100, key: 'reach', val: 0.7, desc: 'Dig distance penalty −30%' },
  secondwind: { name: 'Second Wind', role: 'any', cost: 100, key: 'stamina', val: 0.8, desc: 'Stamina drain −20%' },
  clutch: { name: 'Clutch', role: 'any', cost: 160, key: 'spike', val: 1.1, when: 'clutch', desc: '+10% spike power from 12 points on' },
  ironwall: { name: 'Iron Wall', role: 'MB', cost: 140, key: 'block', val: 1.08, desc: 'Block power +8%' },
  thunder: { name: 'Thunder Arm', role: 'WS', cost: 160, key: 'spike', val: 1.06, desc: 'Spike power +6%' },
  pipe: { name: 'Pipe Specialist', role: 'WS', cost: 120, key: 'pipe', val: 1 / 0.88, desc: 'No back-row power penalty' },
  eye: { name: "Setter's Eye", role: 'S', cost: 140, key: 'set', val: 1.06, desc: 'Set success +6%' },
  decoy: { name: 'Decoy Master', role: 'S', cost: 120, key: 'decoy', val: 1.15, desc: 'Blockers bite on fake sets +15%' }
};
// Techniques: special plays. A player uses one automatically when they meet `req` (stats; wit in wit units),
// or always once learned in career mode. Hooks live in the engine's serve and rally phases (search for hasTech).
Object.assign(SKILLS, {
  // attack
  freak: {
    tech: 'Attack',
    name: 'Freak Quick',
    role: 'MB',
    req: { speed: 80 },
    cost: 160,
    desc: 'Minus-tempo quick: hit before the block can react (setter wit 1.6+)'
  },
  delay: {
    tech: 'Attack',
    name: 'Delayed Spike',
    role: ['WS', 'MB'],
    req: { jump: 85 },
    cost: 140,
    desc: 'Hang in the air until the blockers drop'
  },
  cutshot: { tech: 'Attack', name: 'Cut Shot', role: 'WS', req: { wit: 1.3 }, cost: 120, desc: 'Sharp angle around the block, more often' },
  sync: {
    tech: 'Setter',
    name: 'Synchronized Attack',
    role: 'S',
    req: { wit: 1.5 },
    cost: 160,
    desc: 'Every hitter approaches at once — the block has to split'
  },
  // serve
  drive: {
    tech: 'Serve',
    name: 'Drive Serve',
    role: 'any',
    req: { wit: 1.2, power: 70 },
    cost: 120,
    desc: 'Floater that dips late — passes fall apart'
  },
  killer: {
    tech: 'Serve',
    name: 'Killer Jump Serve',
    role: 'any',
    req: { power: 90 },
    cost: 160,
    desc: 'Heavy topspin jump serve (+10% pace, a bit riskier)'
  },
  target: {
    tech: 'Serve',
    name: 'Target Serve',
    role: 'any',
    req: { wit: 1.4 },
    cost: 120,
    desc: 'Serve straight at the weakest receiver'
  },
  // defense
  readblk: {
    tech: 'Defense',
    name: 'Read Block',
    role: 'MB',
    req: { wit: 1.3, def: 75 },
    cost: 140,
    desc: "Read the setter's hands — shuts down quicks"
  },
  softblk: { tech: 'Defense', name: 'Soft Block', role: ['MB', 'WS'], req: { def: 80 }, cost: 100, desc: 'Touches pop up for an easy dig' },
  roll: {
    tech: 'Defense',
    name: 'Rolling Receive',
    role: 'any',
    req: { def: 75, speed: 70 },
    cost: 120,
    desc: 'Dive-and-roll: far balls cost much less'
  },
  save: {
    tech: 'Defense',
    name: 'Desperation Save',
    role: 'any',
    req: { speed: 85 },
    cost: 140,
    desc: 'Sometimes keeps a lost ball alive'
  },
  // setter plays
  slide: {
    tech: 'Setter',
    name: '2nd-tempo Slide',
    role: 'MB',
    req: { speed: 75 },
    cost: 120,
    desc: 'Run behind the setter and hit off one foot (setter wit 1.3+)'
  },
  lefty: {
    tech: 'Setter',
    name: 'Left-hand Dump',
    role: 'S',
    req: { jump: 70, wit: 1.4 },
    cost: 120,
    desc: 'Sneakier, more frequent second-touch dumps'
  },
  pipecombo: {
    tech: 'Setter',
    name: 'Pipe Combo',
    role: 'S',
    req: { wit: 1.5 },
    cost: 140,
    desc: 'Planned back-row play — the block arrives late'
  }
});
/** Encyclopedia notes: when a technique fires and what beats it. */
const SKILL_HOW = {
  freak: 'On a quick set, 50% when the setter has 1.6+ wit. The block covers a quarter as much. Counter: Read Block.',
  delay:
    'When a solid block is up (not on quicks), 35%. The blockers come down first: no kill block, at most a fingertip touch. Low jump and wit: may hang too long — the ball drops and a teammate must dig it.',
  cutshot: '+20% chance to hit around a solid block, and the angle beats it more cleanly.',
  sync: 'On a perfect pass, 25%. All hitters jump — no double block can form and coverage drops 20%.',
  drive: 'Float and jump-float serves, 50%. Receivers lose a big chunk of passing quality.',
  killer: 'Jump serves, 50%. +10% pace but +3% error chance.',
  target: '30% of serves go just beside the weakest passer on the other side.',
  readblk: 'The front middle reads quicks: +0.3 block coverage, and Freak Quicks are much less effective.',
  softblk: 'When the block gets a touch, the ball slows more and the dig is far easier.',
  roll: 'On balls far out of reach (serve receive and digs), most of the distance penalty disappears.',
  save: 'When a spike would score, 18% the defender keeps it alive with a one-arm lunge (bad pass follows).',
  slide: 'On a quick set, 35% when the setter has 1.3+ wit: the middle runs behind the setter; block coverage −40%.',
  lefty: 'Setter dumps happen 40% more often and score 10% more.',
  pipecombo: 'Back-row attacks run as a planned play every other time: block coverage −40%.'
};
