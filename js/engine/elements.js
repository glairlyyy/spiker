// Per-player elements: assignment (deterministic, no random draws so seeded runs stay reproducible),
// unlock status, the in-match gauge and the element spike itself. Data and tuning: js/data/elements.js.

/** Stable 0..1 hash of a string (FNV-1a). */
function hstr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
const hu = (p, salt) => hstr(`${p.name}|${p.role}|${salt}`);
/** Weighted pick with a 0..1 roll (no RNG draw). */
function hpick(keys, w, u) {
  const tot = keys.reduce((a, k) => a + w[k], 0);
  let x = u * tot;
  for (const k of keys) if ((x -= w[k]) < 0) return k;
  return keys[keys.length - 1];
}
/** Element weights from who the player is: each stat against the league norm (z-score), so every element is about
 * as common overall but a player's standout trait decides theirs. */
function elWeights(p) {
  const z = {
      p: (p.power - 65) / 12,
      d: (p.def - 65) / 12,
      s: (p.speed - 65) / 12,
      j: (p.jump - 65) / 12,
      w: (p.wit - 1.15) / 0.35,
      l: ((p.lead || 50) - 52) / 14
    },
    v = {
      fire: z.p,
      blast: 0.62 * z.p + 0.62 * z.j,
      earth: z.d + (p.role === 'MB' ? 0.4 : 0),
      water: 0.62 * z.d + 0.62 * z.s,
      wind: z.j,
      flash: z.s + (p.role === 'MB' ? 0.25 : 0),
      shadow: z.w - (p.role === 'S' ? 0.3 : 0),
      star: z.l + 0.25 * z.w
    };
  for (const k in v) v[k] = Math.exp(1.4 * v[k]);
  return v;
}
/** The signature's personal twist, weighted by the player's stats (hash roll, no RNG draw). */
function elTwist(p) {
  const w = { pierce: p.jump, heavy: p.power, blur: p.speed, curve: p.wit * 55, split: p.def * 0.8 },
    mx = Math.max(...Object.values(w));
  for (const k in w) w[k] = Math.exp((w[k] - mx) / 8);
  return hpick(Object.keys(TWIST), w, hu(p, 'tw'));
}
/** Give a player their element and signature spike (once), then refresh the unlock status. */
function elAssign(p) {
  if (!p.el) p.el = hpick(ELS, elWeights(p), hu(p, 'el'));
  if (!p.sig) {
    const tw = elTwist(p),
      a = EWORD[p.el],
      b = TWORD[tw];
    p.sig = { tw, name: `${a[Math.floor(hu(p, 'w1') * a.length)]} ${b[Math.floor(hu(p, 'w2') * b.length)]}` };
  }
  elCheck(p);
}
/** Unlock: OP players always, about 1 in 4 stars. Your career player only through the Element Trial. */
function elCheck(p) {
  if (p.elOn || p.you) return;
  if (p.op || (p.star && hu(p, 'on') < EG.starUnlock)) p.elOn = true;
}

// ---- match gauge ----
/** Add v to an unlocked player's gauge (clamped 0..EG.full). */
function elCharge(m, p, v) {
  if (!p.elOn || !m.eg || !v) return;
  m.eg[p.id] = clamp((m.eg[p.id] || 0) + v, 0, EG.full);
}
/** A full gauge: this player's next attack (or set) is an element spike. */
const elReady = (m, p) => !!(p.elOn && m.eg && (m.eg[p.id] || 0) >= EG.full);
/** Fill the gauge from a recorded stat (called by st()). m.ctx describes the attack being played. */
function elStat(m, p, k) {
  const c = m.ctx || {},
    g = EG[p.el],
    mine = c.spiker === p && !c.el; // an element spike itself doesn't refill the gauge
  switch (p.el) {
    case 'fire':
      if (k === 'k' && mine) elCharge(m, p, g.k + (m.lastK === p.id ? g.kk : 0));
      else if (k === 'err') elCharge(m, p, g.err);
      break;
    case 'earth':
      if (k === 'blk') elCharge(m, p, g.blk);
      else if (k === 'dig' && (c.pow || 0) >= 70) elCharge(m, p, g.dig);
      break;
    case 'flash':
      if (k === 'ace') elCharge(m, p, g.ace);
      else if (k === 'k' && mine && c.quick) elCharge(m, p, g.qk);
      break;
    case 'water':
      if (k === 'dig') elCharge(m, p, g.dig);
      break;
    case 'wind':
      if (k === 'k' && mine && (c.back || c.over)) elCharge(m, p, c.back ? g.bk : g.over);
      break;
    case 'shadow':
      if (k === 'k' && mine && (c.tip || c.around)) elCharge(m, p, c.tip ? g.tip : g.cut);
      else if (k === 'ast' && c.fake) elCharge(m, p, g.fake);
      break;
    case 'star':
      if (k === 'ast') elCharge(m, p, g.ast);
      break;
  }
}
/** Gauge from the attack itself (after its power is known). */
function elAttack(m, p, c) {
  if (!p.elOn || c.el) return;
  if (p.el === 'flash' && c.quick) elCharge(m, p, EG.flash.quick);
  else if (p.el === 'wind' && c.back) elCharge(m, p, EG.wind.back);
  else if (p.el === 'blast') elCharge(m, p, c.pow >= 100 ? EG.blast.ult : c.pow >= 85 ? EG.blast.heavy : 0);
}
/** Long rallies: water players build, flash players lose patience. */
function elLong(m) {
  for (const t of m.t)
    for (const p of t.P)
      if (p.elOn) elCharge(m, p, p.el === 'water' ? EG.water.long : p.el === 'flash' ? EG.flash.long : 0);
}
/** Every point: a small trickle for all unlocked players; Starlight also rises when their team scores (more in the zone). */
function elPoint(m, w) {
  for (const t of m.t) for (const p of t.P) if (p.elOn) elCharge(m, p, EG.base); // the heat of the match: a trickle for everyone
  for (const p of m.t[w].P) if (p.elOn && p.el === 'star') elCharge(m, p, EG.star.pt + (m.zone[w] ? EG.star.zone : 0));
}
/** Captain's buff on an unlocked player: the gauge fills at once — their next attack is an element spike. */
function elBuff(m, p) {
  if (!p.elOn) return false;
  m.eg[p.id] = EG.full;
  return true;
}

/**
 * Fire an element spike (p = whose gauge fires: the hitter, or a charged setter setting them): resets the gauge and returns its effect multipliers. A defender on court whose element
 * beats the attacker's (ECOUNTER) resists it: every element effect is halved (the personal twist still works).
 *   pow ×, cov × (block coverage), dsc × (dig score), fly × (flight time), brk (block break boost 0..1),
 *   far (landing away from defenders 0..1), noPop (0..1 chance it can't pop up), mom (team momentum on a point)
 */
function elSpike(m, p, hitter, setter, defT, perfect) {
  m.eg[p.id] = 0;
  const el = p.el,
    res = ECOUNTER[el] ? defT.P.find(q => q.elOn && q.el === ECOUNTER[el]) : null,
    k = res ? 0.5 : 1,
    K = v => 1 + (v - 1) * k,
    e = { el, tw: p.sig.tw, name: p.sig.name, res, k, pow: 1, cov: 1, dsc: 1, fly: 1, brk: 0, far: 0, noPop: 0, mom: 0, over: false, pair: null };
  switch (el) {
    case 'fire':
      e.pow = K(1.15);
      e.dsc = K(0.9);
      break;
    case 'earth':
      e.brk = k;
      e.pow = K(1.08);
      e.dsc = K(0.85);
      break;
    case 'flash':
      e.cov = K(0.45);
      e.fly = K(0.7);
      e.dsc = K(0.88); // too fast to react
      break;
    case 'water':
      e.far = k;
      e.dsc = K(0.9);
      break;
    case 'wind':
      e.cov = K(0.35);
      e.dsc = K(0.85);
      e.over = true;
      break;
    case 'blast':
      e.noPop = k;
      e.pow = K(1.04);
      break;
    case 'shadow':
      e.cov = K(0.4);
      e.dsc = K(0.7);
      break;
    case 'star':
      e.pow = K(1.1);
      e.mom = 0.3 * k;
      break;
  }
  // the personal twist
  switch (e.tw) {
    case 'pierce':
      e.cov *= 0.6;
      break;
    case 'curve':
      e.far = Math.max(e.far, 0.5);
      break;
    case 'heavy':
      e.dsc *= 0.9;
      break;
    case 'blur':
      e.fly *= 0.85;
      e.cov *= 0.85;
      break;
    case 'split':
      e.dsc *= R() < 0.4 ? 0.6 : 0.97;
      break;
  }
  // a charged setter puts their element into the set (p = setter, hitter = the spiker)
  e.viaSet = p !== hitter;
  // setter and hitter both unlocked, different elements, perfect set: the pair move
  if (perfect && setter && setter !== hitter && setter.elOn && hitter.elOn) {
    e.pair = epair(setter.el, hitter.el);
    if (e.pair) e.pow *= 1.08;
  }
  st(m, p, 'els');
  return e;
}
/** Landing spot far from the defenders (water / curve): best of a few candidates. */
function elFar(m, ds, defs, lx, lz, far) {
  const n = far >= 1 ? 3 : 1,
    score = (x, z) => Math.min(...defs.map(q => dist(m.pos[q.id], x, z)));
  let bx = lx,
    bz = lz,
    bs = score(lx, lz);
  for (let i = 0; i < n; i++) {
    const x = sx(ds, rnd(170, 420)),
      z = rnd(0.1, 0.9),
      s = score(x, z);
    if (s > bs) {
      bs = s;
      bx = x;
      bz = z;
    }
  }
  return [bx, bz];
}
/** Everyone in the league gets an element (and unlocks follow star / OP status). */
function elAll(teams) {
  for (const t of teams) for (const p of t.P) elAssign(p);
}
