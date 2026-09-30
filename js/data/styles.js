// Team playstyles, team list, flex-role systems and talent archetypes.

/**
 * A playstyle with defaults: spike / block / dig / serve / jump are multipliers, serveErr multiplies the serve error
 * chance, quick = base quick-attack chance, set = set-success bonus, dbl = double-block chance, feint = setter-dump
 * chance, dset = the team's default defence setting (DEFSETS), bias = stat bias for generated players.
 */
const mkStyle = o =>
  Object.assign(
    { spike: 1, block: 1, dig: 1, serve: 1, serveErr: 1, quick: 0.25, set: 0, dbl: 0.5, jump: 1, feint: 0.05, dset: 'read', bias: {} },
    o
  );
const STYLES = {
  power: mkStyle({
    name: 'Power offense',
    desc: 'Feeds the wing spikers and swings hard on every ball.',
    spike: 1.08,
    dig: 0.97,
    quick: 0.16,
    dbl: 0.45,
    bias: { power: 5 }
  }),
  wall: mkStyle({
    name: 'Iron wall',
    desc: 'Two sets of hands at the net on almost every attack.',
    spike: 0.98,
    block: 1.14,
    dbl: 0.78,
    dset: 'bunch',
    bias: { def: 4, jump: 2 }
  }),
  tempo: mkStyle({
    name: 'Speed tempo',
    desc: 'Fires quicks through the middle before the block can form.',
    quick: 0.5,
    set: 0.02,
    dset: 'commit',
    bias: { speed: 6 }
  }),
  counter: mkStyle({
    name: 'Receive and counter',
    desc: 'Digs everything and grinds out long rallies.',
    spike: 0.98,
    dig: 1.14,
    serve: 0.97,
    serveErr: 0.8,
    bias: { def: 5, speed: 2 }
  }),
  sky: mkStyle({
    name: 'Sky jumpers',
    desc: 'Hits from above the block with a huge vertical leap.',
    spike: 1.02,
    block: 1.04,
    dig: 0.98,
    jump: 1.1,
    bias: { jump: 7 }
  }),
  bombers: mkStyle({
    name: 'Serve bombers',
    desc: 'Jump-serves at full power and lives with the errors.',
    serve: 1.2,
    serveErr: 1.45,
    bias: { power: 3 }
  }),
  mind: mkStyle({
    name: 'Mind games',
    desc: 'A high-wit setter mixes dumps and tips to wrong-foot the defense.',
    spike: 0.99,
    dig: 1.02,
    serveErr: 0.9,
    quick: 0.3,
    set: 0.06,
    feint: 0.16
  }),
  balanced: mkStyle({
    name: 'Balanced',
    desc: 'No clear weakness, no clear weapon.',
    spike: 1.03,
    block: 1.03,
    dig: 1.03,
    serve: 1.03,
    quick: 0.28,
    set: 0.02,
    dbl: 0.55
  })
};
/** The eight teams: [name, short name, colour, playstyle]. */
const TEAMDEFS = [
  ['Akatsuki Blaze', 'AKB', '#FF4D4D', 'power'],
  ['Shirogane Wall', 'SHW', '#9FB7CC', 'wall'],
  ['Raiko Sprinters', 'RKS', '#FFC93C', 'tempo'],
  ['Minato Anchors', 'MNA', '#2EC4B6', 'counter'],
  ['Tengu Skyleap', 'TGS', '#8B7BFF', 'sky'],
  ['Kurobane Cannons', 'KBC', '#FF8C42', 'bombers'],
  ['Kitsune Tricksters', 'KTT', '#FF5DA2', 'mind'],
  ['Hoshizora Unity', 'HSU', '#4EA5FF', 'balanced']
];
/** Per playstyle: weights for the fourth player's (flex) role. */
const FLEXW = {
  power: { WS: 0.75, MB: 0.15, S: 0.1 },
  wall: { MB: 0.7, WS: 0.2, S: 0.1 },
  tempo: { MB: 0.6, WS: 0.25, S: 0.15 },
  counter: { WS: 0.45, MB: 0.2, S: 0.35 },
  sky: { WS: 0.65, MB: 0.3, S: 0.05 },
  bombers: { WS: 0.7, MB: 0.2, S: 0.1 },
  mind: { S: 0.6, WS: 0.25, MB: 0.15 },
  balanced: { WS: 0.4, MB: 0.3, S: 0.3 }
};
/** Flex-role system names (the fourth player's role: a third wing, a second middle or a second setter). */
const SYSN = { WS: 'Wing overload', MB: 'Twin towers', S: 'Dual setter' };
/** Team archetype by number of stars. */
const ARCH = { 1: 'One-player army', 2: 'Twin aces', 3: 'Star trio', 4: 'Golden generation' };
