// Elements: each player carries one hidden element. Only a few ever unlock it (OP players always, about 1 in 4
// stars, your career player through the Element Trial). Unlocked players charge a gauge in matches with plays
// that suit their element; a full gauge (or a captain's buff) makes their next attack an element spike.

const ELS = ['fire', 'earth', 'flash', 'water', 'wind', 'blast', 'shadow', 'star'];
const ENAME = {
  fire: '🔥 Fire',
  earth: '🪨 Earth',
  flash: '⚡ Flash',
  water: '💧 Water',
  wind: '🌪️ Wind',
  blast: '💥 Blast',
  shadow: '🌑 Shadow',
  star: '✨ Starlight'
};
const ECOL = {
  fire: '#ff7a2e',
  earth: '#c9a46a',
  flash: '#fff27a',
  water: '#58c4ff',
  wind: '#b9fff0',
  blast: '#ff4f2e',
  shadow: '#9b6cff',
  star: '#ffe38a'
};
/** What the element spike does (before counters). */
const EDESC = {
  fire: '+15% power and the dig is weaker',
  earth: 'Breaks through blocks far more often',
  flash: 'Half the block coverage, ball flies 30% faster',
  water: 'Lands far from the nearest defender',
  wind: 'Goes over the block, even from the back row',
  blast: 'Cannot pop up off the arms — no saves',
  shadow: 'Blockers misread it and digs are worse',
  star: '+10% power; a point lifts the whole team’s momentum'
};
/** How the gauge fills. */
const EFILL = {
  fire: 'Kills — back-to-back kills fill it fast. Errors drain it.',
  earth: 'Blocks, block touches and digging hard spikes.',
  flash: 'Quick attacks and aces. Long rallies drain it.',
  water: 'Digs, and every possession of a long rally.',
  wind: 'Back-row attacks and kills over the block.',
  blast: 'Spikes over 100 power.',
  shadow: 'Tips, cut shots and fake sets that score.',
  star: 'Your team scoring (more in the zone) and assists.'
};
/** Who resists whom: ECOUNTER[x] = the element that beats x (a defender with it halves x's effect). */
const ECOUNTER = {
  fire: 'water',
  water: 'flash',
  flash: 'earth',
  earth: 'wind',
  wind: 'fire',
  shadow: 'star',
  star: 'shadow',
  blast: null
};
/** Personal twist on every signature element spike (picked from the player's stats). */
const TWIST = {
  pierce: { name: 'Pierce', desc: 'Goes through the block' },
  curve: { name: 'Curve', desc: 'Bends away from the defender' },
  heavy: { name: 'Heavy', desc: 'Hard to dig cleanly' },
  blur: { name: 'Blur', desc: 'Too fast to read' },
  split: { name: 'Split', desc: 'Looks like two balls — the defense guesses' }
};
/** Signature name parts: an element word + a shape word. */
const EWORD = {
  fire: ['Crimson', 'Inferno', 'Blazing', 'Solar', 'Phoenix'],
  earth: ['Tectonic', 'Granite', 'Titan', 'Quake', 'Iron Peak'],
  flash: ['Thunder', 'Lightning', 'Raijin', 'Voltage', 'Flashpoint'],
  water: ['Tidal', 'Abyssal', 'Riptide', 'Mirror Lake', 'Tsunami'],
  wind: ['Gale', 'Tempest', 'Skyward', 'Hurricane', 'Zephyr'],
  blast: ['Nova', 'Detonation', 'Meteor', 'Big Bang', 'Cannon'],
  shadow: ['Phantom', 'Eclipse', 'Nightfall', 'Void', 'Specter'],
  star: ['Starlight', 'Galaxy', 'Aurora', 'Comet', 'Zenith']
};
const TWORD = {
  pierce: ['Lance', 'Spear', 'Drill', 'Needle'],
  curve: ['Crescent', 'Arc', 'Serpent', 'Spiral'],
  heavy: ['Hammer', 'Anvil', 'Crusher', 'Fall'],
  blur: ['Flash', 'Streak', 'Bolt', 'Rush'],
  split: ['Mirage', 'Twin Fang', 'Echo', 'Double']
};
/** Two unlocked players with different elements on one perfect set: a named pair move. */
const EPAIR = {
  'fire+wind': 'Firestorm Spike',
  'earth+fire': 'Magma Driver',
  'fire+flash': 'Plasma Lance',
  'fire+water': 'Steam Burst',
  'blast+fire': 'Supernova',
  'fire+shadow': 'Black Flame',
  'fire+star': 'Solar Flare',
  'earth+wind': 'Sandstorm',
  'flash+wind': 'Thunderstorm',
  'water+wind': 'Typhoon',
  'blast+wind': 'Cyclone Cannon',
  'shadow+wind': 'Phantom Gale',
  'star+wind': 'Stardust Gale',
  'earth+flash': 'Railgun',
  'earth+water': 'Mudslide',
  'blast+earth': 'Landslide',
  'earth+shadow': 'Abyss Quake',
  'earth+star': 'Meteorite',
  'flash+water': 'Storm Surge',
  'blast+flash': 'Thunderclap',
  'flash+shadow': 'Dark Lightning',
  'flash+star': 'Starbolt',
  'blast+water': 'Geyser',
  'shadow+water': 'Black Tide',
  'star+water': 'Moon Tide',
  'blast+shadow': 'Dark Matter',
  'blast+star': 'Big Bang',
  'shadow+star': 'Eclipse'
};
/** Gauge tuning (0–100). */
const EG = {
  full: 100,
  base: 1.5, // every point, every unlocked player
  fire: { k: 16, kk: 14, err: -20 },
  earth: { blk: 45, touch: 18, dig: 20 },
  flash: { quick: 14, qk: 30, ace: 40, long: -4 },
  water: { dig: 12, long: 5 },
  wind: { back: 18, bk: 32, over: 30 },
  blast: { ult: 20, heavy: 6 },
  shadow: { tip: 40, cut: 34, fake: 42 },
  star: { pt: 6, zone: 6, ast: 10 },
  starUnlock: 0.25 // share of stars (non-OP) with an unlocked element
};
