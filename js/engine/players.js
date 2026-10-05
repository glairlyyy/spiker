// Player creation: random generation, appearance and overall rating.

const blank = () => ({ mp: 0, k: 0, att: 0, err: 0, blk: 0, ace: 0, dig: 0, ast: 0, top: 0, els: 0 });
let _pid = 0;
/** Random appearance (hair style, skin, eyes, accessory, height by role). */
function mkLook(role) {
  const acc = R();
  return {
    hs: Math.floor(R() * 10),
    skin: pick(SKIN),
    eyeC: pick(EYEC),
    eye: R() < 0.5 ? 'sharp' : 'round',
    acc: acc < 0.18 ? 'band' : acc < 0.3 ? 'glasses' : acc < 0.42 ? 'bandage' : 'none',
    accC: pick(ACCC),
    hgt: (role === 'MB' ? 1.07 : role === 'S' ? 0.95 : 1) * rnd(0.97, 1.03)
  };
}
/**
 * Build a player object from a full spec. The single place that defines a player's shape,
 * so random generation (mkPlayer) and a custom/created player (career mode) produce the same thing.
 * Required: name, role, stats (power/def/speed/jump), wit. Everything else has a default.
 */
function createPlayer(spec) {
  const p = Object.assign(
    {
      id: 'p' + _pid++,
      name: 'Player',
      role: 'WS',
      slot: 'W0',
      bonus: 0,
      star: false,
      op: false,
      wit: 1,
      hair: HAIR[0],
      num: 0,
      look: null,
      move: MOVES.WS[0],
      bmove: BMOVES[0],
      team: null,
      career: blank(),
      tour: blank()
    },
    spec
  );
  for (const k of STATK) p[k] = Math.round(clamp(p[k] ?? 60, STAT_FLOOR, 99));
  ensureEgo(p);
  return p;
}
/** The ego personality levels (spec §2.12), lowest first. */
const EGO_LVLS = ['normal', 'selfish', 'egoist'];
/** An old numeric ego (0–1, saves from before the levels) as a level. */
const egoFromNum = v => (v >= 0.62 ? 'egoist' : v >= 0.42 ? 'selfish' : 'normal');
/**
 * Ego personality (spec §2.12; owner, 2026-10-04): 'normal' | 'selfish' | 'egoist'. Generated players get a fixed hash of
 * their name (EGO.roll; wing spikers lean selfish) — no random drawn, so generation is unchanged. A level already set (a
 * created player, a loaded save) wins; an old numeric ego becomes its level.
 */
function ensureEgo(p) {
  if (EGO_LVLS.includes(p.ego)) return;
  if (Number.isFinite(p.ego)) return void (p.ego = egoFromNum(p.ego));
  const h = hstr('ego|' + p.name) + (p.role === 'WS' ? EGO.roll.ws : 0);
  p.ego = h >= EGO.roll.egoist ? 'egoist' : h >= EGO.roll.selfish ? 'selfish' : 'normal';
}
/** The EGO.lvl entry of a player's personality (normal when unknown; an old number is read as its level). */
const egoOf = p => EGO.lvl[EGO_LVLS.includes(p.ego) ? p.ego : Number.isFinite(p.ego) ? egoFromNum(p.ego) : 'normal'];
/** The lowest wit: negative wit is the Egoist game's (T-200) — the match's wit W() floors at 0.1, the body untouched (witBody). */
const WIT_MIN = -1;
/** The lowest a created player's stat can be. Generated players never go below 25: `rollStats` keeps its own floor; only your career player starts lower (CAREER.start). */
const STAT_FLOOR = 1;
/**
 * Repair a player's stats in place: a stat that is not a finite number becomes STAT_FLOOR, one outside [STAT_FLOOR, 99] is clamped,
 * wit not finite → 1 else clamped to [WIT_MIN, 3]. In-range values are left exactly as they are (no rounding, no draws). Returns how many were fixed.
 */
function fixStats(p) {
  let n = 0;
  for (const k of STATK) {
    const v = Number.isFinite(p[k]) ? clamp(p[k], STAT_FLOOR, 99) : STAT_FLOOR;
    if (v !== p[k]) ((p[k] = v), n++);
  }
  const w = Number.isFinite(p.wit) ? clamp(p.wit, WIT_MIN, 3) : 1;
  if (w !== p.wit) ((p.wit = w), n++);
  return n;
}
/** Random base stats for a role, then spread a talent `bonus` over them (key stat weighted double). */
function rollStats(role, bonus, bias) {
  const b = RB[role],
    st = {};
  for (const k of STATK) st[k] = rnd(50, 70) + (b[k] || 0) + (bias[k] || 0);
  const wt = { power: 0.2, def: 0.2, speed: 0.2, jump: 0.2 };
  wt[KEYSTAT[role]] = 0.4;
  let pool = bonus;
  for (let it = 0; it < 5 && pool > 0.5; it++) {
    const open = STATK.filter(k => st[k] < 99),
      tw = open.reduce((a, k) => a + wt[k], 0);
    let u = 0;
    for (const k of open) {
      const nv = Math.min(99, st[k] + (pool * wt[k]) / tw);
      u += nv - st[k];
      st[k] = nv;
    }
    pool -= u;
  }
  for (const k of STATK) st[k] = Math.round(clamp(st[k], 25, 99));
  return st;
}
/** Random wit for a role; talent pushes it toward the role's top end (OP players can exceed it). */
function rollWit(role, bonus) {
  const [lo, hi] = { S: [1.35, 2.0], MB: [0.8, 1.45], WS: [0.5, 1.3] }[role],
    base = rnd(lo, lo + (hi - lo) * 0.55);
  return +Math.min(2, base + (hi - base) * Math.min(1, bonus / 80) + (bonus >= 110 ? rnd(0.25, 0.45) : 0)).toFixed(2);
}
/** A random "Family Given" name not yet in `used` (and adds it). */
function rollName(used) {
  let name;
  do {
    name = ((f, g) => `${g} ${f}`)(pick(FAM), pick(GIV)); // nickname first (owner, 2026-10-05); same draws, same order
  } while (used.has(name));
  used.add(name);
  return name;
}
/** Random player for a team slot. (Roll order is fixed so seeded runs stay reproducible.) */
function mkPlayer(role, slot, bonus, team, used) {
  const st = rollStats(role, bonus, team.S.bias),
    wit = rollWit(role, bonus),
    name = rollName(used),
    hair = pick(HAIR),
    look = mkLook(role),
    move = pick(MOVES[role]),
    bmove = pick(BMOVES);
  return createPlayer({
    name,
    role,
    slot,
    bonus: Math.round(bonus),
    star: bonus >= 18,
    op: bonus >= 110,
    wit,
    hair,
    look,
    move,
    bmove,
    team,
    ...st
  });
}
/** Overall rating: the stats weighted by role, plus wit (a negative wit counts as 1, like witBody). */
function ovr(p) {
  const w = { S: [0.1, 0.3, 0.35, 0.25], MB: [0.2, 0.35, 0.15, 0.3], WS: [0.4, 0.2, 0.15, 0.25] }[p.role];
  return Math.round(
    p.power * w[0] + p.def * w[1] + p.speed * w[2] + p.jump * w[3] + ((p.wit < 0 ? 1 : p.wit) - 1) * (p.role === 'S' ? 12 : 6)
  );
}
