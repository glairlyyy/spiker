// Role stat biases, key stats and mood deltas per stat event.

const RB = {
  S: { power: -12, def: 4, speed: 8, jump: -4 },
  MB: { power: -3, def: 8, speed: -3, jump: 8 },
  WS: { power: 8, def: -4, speed: 2, jump: 4 }
};
const KEYSTAT = { S: 'speed', MB: 'jump', WS: 'power' };
const STATK = ['power', 'def', 'speed', 'jump'];
const MOODD = { k: 0.1, err: -0.18, blk: 0.14, ace: 0.18, dig: 0.04, ast: 0.02 };
