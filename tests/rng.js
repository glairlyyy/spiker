#!/usr/bin/env node
// Where the dice decide (owner, 2026-10-24: "a ×2 player still fails"): a measurement, no game changes. Loads the engine like
// tests/harness.js, with no-op hooks spliced into the sources (they draw nothing: the seeded stream is unchanged — checked at
// start), then plays paired-seed matches (league / tournament teams) and prints:
//   1. how points end (ace, serve error, kill, stuff, …) and per attack P(kill / blocked / dug / error);
//   2. sensitivity: one hitter / a whole side at a stat × 1 … 3 (atk, def, jump, serve: the card multiplier, stageBuff);
//   3. the variance budget of one spike duel (a model of the duel fed with the captured attack contexts);
//   4. what-ifs: (A) a card that narrows its holder's failure rolls, (B) steeper duels — buff gain and what a 10-OVR gap decides.
// npm run rng -- [pairs=150] [teams=league|tour|both] [parts=1234] [families=<name filter, part 4>]
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const ROOT = path.join(__dirname, '..');
const [N = 150, TEAMS = 'both', PARTS = '1234', FAM = ''] = process.argv.slice(2).map((v, i) => (i === 0 ? +v : v));
const SCRIPTS = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const HEADLESS = /js\/(core|data|engine|career)\/|js\/game\/bracket\.js/;

// ---- hooks (node side; read live by the patched sources) ----
const H = {
  K: null, // (p, k) → × on stageBuff (k: atk | def | spd | jump | serve), like a card's buff
  roll: null, // (tag, v, p) → the roll used (tag: spk | blk | dig | srv | rcv)
  stuff: null, // (bp, cov, pow) → stuff chance (replaces stuffChance)
  touch: null, // (bp, pow) → block-touch chance
  kill: null, // (pow, dsc, tip, dist0) → kill chance (replaces Formula.killChance)
  errK: null, // spiker → × on Formula.spikeErrorP
  ev: null // event sink (pre / post of wrapped engine functions)
};
/** Source splices: [file, old, new]. Each hook is a no-op until H sets it. */
const PATCH = [
  [
    'js/engine/fire.js',
    'return (S && S.buff[k] ? 1 + S.buff[k] / 100 : 1) * cardBuff(p, k)',
    'return (__H.K ? __H.K(p, k) : 1) * (S && S.buff[k] ? 1 + S.buff[k] / 100 : 1) * cardBuff(p, k)'
  ],
  [
    'js/engine/formulas.js',
    'serveQuality: (server, team, roll = rnd(0.8, 1.2))',
    "serveQuality: (server, team, roll = __R('srv', rnd(0.8, 1.2), server))"
  ],
  ['js/engine/formulas.js', 'team.S.spike *\n    rnd(0.8, 1.2) *', "team.S.spike *\n    __R('spk', rnd(0.8, 1.2), spiker) *"],
  ['js/engine/formulas.js', "skillMod(b0, 'block') * rnd(0.8, 1.2) +", "skillMod(b0, 'block') * __R('blk', rnd(0.8, 1.2), b0) +"],
  ['js/engine/formulas.js', 'team.S.dig *\n      rnd(0.8, 1.2) *', "team.S.dig *\n      __R('dig', rnd(0.8, 1.2), dg) *"],
  ['js/engine/serve.js', 'const mg = rs - sq * 0.85 + rnd(-18, 18),', "const mg = rs - sq * 0.85 + __R('rcv', rnd(-18, 18), rc),"],
  [
    'js/engine/rally-defense.js',
    'const stuffChance = (bp, cov, pow) => sig(',
    'const stuffChance = (bp, cov, pow) => (__H.seen && __H.seen(), __H.stuff) ? __H.stuff(bp, cov, pow) : __stuff0(bp, cov, pow);\nconst __stuff0 = (bp, cov, pow) => sig('
  ],
  ['js/engine/rally-defense.js', 'R() < sig((bp - pow) / 20 + 0.2)', 'R() < (__H.touch ? __H.touch(bp, pow) : sig((bp - pow) / 20 + 0.2))']
];
/** Engine functions wrapped for the event log (all are function declarations: globals the engine calls by name). */
const WRAP = [
  'end',
  'attackPhases',
  'footFault',
  'serveFault',
  'serveAceClean',
  'servePopped',
  'serveReceive',
  'freeBall',
  'badSetOver',
  'setterDump',
  'setHands',
  'hangFail',
  'hittingError',
  'block',
  'blockBreak',
  'blockTouch',
  'blockKill',
  'blockCover',
  'blockTool',
  'netTouch',
  'digSave',
  'digPopped',
  'digKill',
  'digUp'
];

function load(seed = 17, raw = false) {
  let x = seed >>> 0 || 1;
  const rand = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const ctx = {
    console,
    Math: Object.create(Math, { random: { value: rand } }),
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    esc: s => String(s),
    navigate: () => {},
    __H: H,
    __R: (tag, v, p) => (H.roll ? H.roll(tag, v, p) : v),
    __ev: (when, n, a, r) => H.ev && H.ev(when, n, a, r)
  };
  vm.createContext(ctx);
  const code = SCRIPTS.filter(f => HEADLESS.test(f))
    .map(f => {
      let s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (!raw)
        for (const [pf, a, b] of PATCH)
          if (pf === f) {
            if (!s.includes(a)) throw new Error(`rng: patch not found in ${f}: ${a}`);
            s = s.replace(a, b);
          }
      return s;
    })
    .join('\n;\n');
  const names = [...code.matchAll(/^(?:const|let|var|class|function\s*\*?)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  const wrap = raw
    ? ''
    : WRAP.map(
        n => `{const o=${n};${n}=function(...a){__ev('pre','${n}',a);const r=o.apply(this,a);__ev('post','${n}',a,r);return r;};}`
      ).join('\n');
  vm.runInContext(`${code}\n;${wrap}\n;globalThis.__api={${[...new Set(names)].join(',')}};`, ctx, { filename: 'game.js' });
  const g = ctx.__api;
  if (!raw) {
    const F = g.Formula,
      kc = F.killChance,
      se = F.spikeErrorP,
      bp = F.blockPower,
      ds = F.digScore;
    F.killChance = (pow, dsc, tip, d0) => {
      const v = H.kill ? H.kill(pow, dsc, tip, d0) : kc(pow, dsc, tip, d0);
      if (A) A.kc = { pow, dsc, tip, v };
      return v;
    };
    F.spikeErrorP = o => {
      const v = se(o) * (H.errK ? H.errK(o.spiker) : 1);
      if (A) A.err = { v, pow: o.pow, k: g.Formula.bySkill(o.spiker, 'spike', 1) * (H.errK ? H.errK(o.spiker) : 1) };
      return v;
    };
    F.blockPower = (b0, b1, team, cov) => {
      const v = bp(b0, b1, team, cov);
      if (A) A.bp = { v, cov, br: A.br, dbl: b1 ? (b0.role === 'MB' && b1.role === 'MB' ? 18 : 10) : 0, sk: g.blockSkill(b0) };
      return v;
    };
    F.digScore = (dg, team, d0) => {
      const v = ds(dg, team, d0);
      if (A) A.dg = { v, dr: A.dr, pen: Math.max(0, d0 - 0.1) * 55 * (1.35 - dg.speed / 100) * g.skillMod(dg, 'reach') };
      return v;
    };
  }
  return g;
}

// ---- the event log: how each point ends, each attack's outcome ----
let curHolder = false; // family A3: is the attack in progress the holder's
let A = null; // the attack in progress (its captured context)
let last = null; // the last point-deciding event of the rally
let REC = null; // the sink of the match being played
function onEv(when, n, a, r) {
  const pt = r && r.point != null;
  if (when === 'pre')
    switch (n) {
      case 'attackPhases':
        A = { side: a[0].atk, m: a[0].m, out: null, f: {} };
        curHolder = false;
        return;
      case 'block':
        A.f.blk = 1;
        return;
      case 'footFault':
        last = 'foot fault';
        return;
      case 'serveFault':
        last = 'serve error';
        return;
      case 'serveAceClean':
      case 'servePopped':
        last = 'ace';
        return;
      case 'blockBreak':
        A.f.brk = 1;
        return;
      case 'blockTouch':
        A.f.touch = 1;
        return;
      case 'blockKill':
        last = 'stuff block';
        A.out = 'blocked';
        return;
      case 'blockCover':
        A.out = 'blocked';
        A.f.cover = 1;
        return;
      case 'blockTool':
        last = 'block-out (tool)';
        A.out = 'kill';
        return;
      case 'digSave':
      case 'digUp':
        A.out = 'dug';
        return;
      case 'digKill':
        last = a[1].tip ? 'tip kill' : A.f.brk ? 'kill (block break)' : A.f.touch ? 'kill (off a touch)' : 'spike kill';
        A.out = 'kill';
        return;
      case 'end':
        if (REC) REC.end(a[1], last || 'other');
        last = null;
        return;
    }
  else
    switch (n) {
      case 'attackPhases': {
        const m = a[0].m;
        if (!A.out) A.out = 'other';
        Object.assign(A, { spiker: m.ctx.spiker, tip: m.ctx.tip, el: !!m.ctx.el, pow: m.ctx.pow });
        if (REC) REC.att(A);
        A = null;
        return;
      }
      case 'serveReceive':
        return;
      case 'freeBall':
        if (r && REC) REC.ev('free ball (shanked pass floats over)');
        return;
      case 'badSetOver':
        if (r && REC) REC.ev('bad set pushed over');
        return;
      case 'setterDump':
        if (pt) last = 'setter dump';
        return;
      case 'setHands':
        if (pt) last = 'double contact';
        return;
      case 'hangFail':
        if (pt) last = 'hang fail (delayed spike)';
        if (r) A.out = pt ? 'error' : 'other';
        return;
      case 'hittingError':
        if (pt) ((last = 'spike error'), (A.out = 'error'));
        return;
      case 'netTouch':
        if (pt) {
          const blk = r.point === a[0].atk;
          last = blk ? 'net touch (blocker)' : 'net touch (hitter)';
          A.out = blk ? 'net (blocker)' : 'error';
        }
        return;
      case 'digPopped':
        if (pt) ((last = 'off the arms (pop not saved)'), (A.out = 'kill'));
        else A.out = 'dug';
        return;
    }
}
H.ev = onEv;
H.seen = () => A && (A.stuffSeen = 1);

// rolls: remember this attack's rolls (and pass them through H.roll for the what-ifs)
const roll0 = (tag, v) => {
  if (A) {
    if (tag === 'spk') A.sr = v;
    else if (tag === 'blk') A.br = v;
    else if (tag === 'dig') A.dr = v;
  }
  return v;
};
let rollFx = null; // a what-if's roll mapping (tag, v, p) → v
H.roll = (tag, v, p) => roll0(tag, rollFx ? rollFx(tag, v, p) : v);

const g = load(17);
const MID0 = g.SKILL.mid;

// ---- the hooks change nothing: a patched engine replays the raw one exactly ----
{
  const raw = load(17, true),
    run = G => {
      G.RNG.seed(4242);
      const L = G.mkLeagueTeams(),
        m = G.newMatch(L[2], L[5], false);
      while (!m.over) G.playRally(m);
      return m.pts.join('-') + ':' + G.R();
    };
  const s0 = run(raw),
    s1 = run(g);
  if (s0 !== s1) throw new Error(`rng: the hooks changed the stream (${s0} vs ${s1})`);
}

// ---- matches ----
/** A paired match: seed → the same two teams; cfg sets up the what-if for side 0 (or both) before play. */
function play(seed, teams, cfg = {}) {
  g.RNG.seed(seed);
  const L = teams === 'tour' ? g.mkTeams() : g.mkLeagueTeams();
  const a = L[seed % L.length],
    b = L[(seed * 3 + 1) % L.length === seed % L.length ? (seed * 3 + 2) % L.length : (seed * 3 + 1) % L.length];
  const hitter = a.P.filter(p => p.role === 'WS').sort((p, q) => q.power - p.power)[0] || a.P[0];
  const side = new Set(g.squadOf(a).map(p => p.id));
  if (cfg.ovr) for (const p of g.squadOf(a)) for (const k of g.STATK) p[k] += cfg.ovr; // (beyond 99 is fine for a what-if)
  if (cfg.ovr) g.finalizeTeam(a);
  const ctxp = { hitter, side, holder: cfg.who === 'hitter' ? p => p.id === hitter.id : p => side.has(p.id) };
  H.K = cfg.k ? (p, k) => (k === cfg.k && ctxp.holder(p) ? cfg.x : 1) : null;
  const eK = L => Math.min(g.SKILL.max, Math.exp((g.SKILL.mid - L) / g.SKILL.k)),
    lv = p => g.Formula.level(p, 'spike');
  g.SKILL.mid = cfg.mid || MID0; // (C2: everyone's mistake factor, every action)
  H.errK =
    cfg.errK || cfg.errBuff
      ? p => (ctxp.holder(p) ? (cfg.errK || 1) * (cfg.errBuff && cfg.k === 'atk' ? eK(lv(p) * cfg.x) / eK(lv(p)) : 1) : 1)
      : null;
  rollFx = cfg.roll ? (tag, v, p) => cfg.roll(tag, v, p, ctxp) : null;
  H.kill = cfg.kill || null;
  H.stuff = cfg.stuff || null;
  H.touch = cfg.touch || null;
  const m = g.newMatch(a, b, false);
  const S = (REC = mkRec(m, ctxp));
  while (!m.over) g.playRally(m);
  REC = null;
  S.pts = m.pts.slice();
  S.win = m.winner === 0 ? 1 : 0;
  S.ovr = [a.ovr, b.ovr];
  return S;
}
function mkRec(m, cp) {
  const S = { ends: {}, endsW: {}, evs: {}, rallies: 0, list: [] };
  S.end = (w, k) => {
    S.rallies++;
    S.ends[k] = (S.ends[k] || 0) + 1;
    if (w === 0) S.endsW[k] = (S.endsW[k] || 0) + 1;
  };
  S.ev = k => (S.evs[k] = (S.evs[k] || 0) + 1);
  S.att = x => S.list.push({ side: x.side, hit: x.spiker.id === cp.hitter.id, tip: x.tip, el: x.el, out: x.out, A: x });
  return S;
}
const seeds = n => Array.from({ length: n }, (x, j) => 9000 + j);
const pct = (v, d = 1) => (v == null || isNaN(v) ? '  —' : (100 * v).toFixed(d));
const sgn = (v, d = 1) => (v >= 0 ? '+' : '') + (100 * v).toFixed(d);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
function run(teams, cfg) {
  return seeds(N).map(s => play(s, teams, cfg));
}
/** Point share and match wins of side 0; per attack outcome rates for a filter. */
function sumUp(R, f = () => true) {
  let p0 = 0,
    pa = 0,
    w = 0;
  const o = { kill: 0, blocked: 0, dug: 0, error: 0, n: 0 };
  for (const S of R) {
    p0 += S.pts[0];
    pa += S.pts[0] + S.pts[1];
    w += S.win;
    for (const t of S.list)
      if (f(t)) {
        o.n++;
        if (o[t.out] != null) o[t.out]++;
      }
  }
  return { share: p0 / pa, win: w / R.length, k: o.kill / o.n, b: o.blocked / o.n, d: o.dug / o.n, e: o.error / o.n, n: o.n };
}
const T = TEAMS === 'both' ? ['league', 'tour'] : [TEAMS];
const BASE = {};
const t0 = Date.now();
for (const teams of T) BASE[teams] = run(teams, {});

// ---- 1. where points are decided ----
if (PARTS.includes('1'))
  for (const teams of T) {
    const R = BASE[teams],
      ends = {},
      evs = {};
    let rallies = 0,
      pts = 0,
      atks = 0;
    for (const S of R) {
      rallies += S.rallies;
      for (const k in S.ends) ends[k] = (ends[k] || 0) + S.ends[k];
      for (const k in S.evs) evs[k] = (evs[k] || 0) + S.evs[k];
      atks += S.list.length;
      pts += S.pts[0] + S.pts[1];
    }
    console.log(`\n== 1. Where points are decided — ${teams} (${N} matches, ${pts} points, ${(atks / pts).toFixed(2)} attacks a point) ==`);
    for (const [k, v] of Object.entries(ends).sort((p, q) => q[1] - p[1])) console.log(`  ${pad(k, 34)} ${lpad(pct(v / rallies), 5)} %`);
    for (const [k, v] of Object.entries(evs)) console.log(`  (event) ${pad(k, 34)} ${(v / rallies).toFixed(3)} a rally`);
    const hitA = R.reduce((a, S) => a + S.list.filter(t => t.hit).length, 0),
      sideA = R.reduce((a, S) => a + S.list.filter(t => t.side === 0).length, 0),
      byAtk = Object.entries(ends)
        .filter(([k]) => /kill|stuff|tool|spike error|net touch|hang|off the arms/.test(k))
        .reduce((a, [, v]) => a + v, 0);
    console.log(
      `  points ended by an attack: ${pct(byAtk / rallies)} %; attacks a point: side 0 ${(sideA / pts).toFixed(2)}, its best WS ${(hitA / pts).toFixed(2)}`
    );
    const all = sumUp(R, t => !t.tip),
      tips = sumUp(R, t => t.tip);
    console.log('  per attack            kill  blocked  dug  error   (n)');
    console.log(
      `  spikes (no tip)      ${lpad(pct(all.k), 5)} ${lpad(pct(all.b), 7)} ${lpad(pct(all.d), 5)} ${lpad(pct(all.e), 5)}  ${all.n}`
    );
    console.log(
      `  tips                 ${lpad(pct(tips.k), 5)} ${lpad(pct(tips.b), 7)} ${lpad(pct(tips.d), 5)} ${lpad(pct(tips.e), 5)}  ${tips.n}`
    );
  }

// ---- 2. sensitivity ----
const MULS = [1, 1.15, 1.5, 2, 3];
function sens(teams, label, who, k, f) {
  const B = sumUp(BASE[teams], f);
  console.log(`  ${label}`);
  console.log('     ×     kill  blocked  dug   error  | pts share  Δ      match win');
  for (const x of MULS) {
    const R = x === 1 ? BASE[teams] : run(teams, { who, k, x }),
      s = sumUp(R, f);
    console.log(
      `   ${lpad(x, 4)}  ${lpad(pct(s.k), 6)} ${lpad(pct(s.b), 7)} ${lpad(pct(s.d), 6)} ${lpad(pct(s.e), 6)}  |  ${pct(s.share)}  ${lpad(sgn(s.share - B.share), 6)}   ${pct(s.win, 0)} %`
    );
  }
}
if (PARTS.includes('2'))
  for (const teams of T) {
    const np = BASE[teams].reduce((a, S) => a + S.pts[0] + S.pts[1], 0);
    console.log(
      `\n== 2. Sensitivity — ${teams} (side 0 vs its paired opponent; per attack: side 0's, or the hitter's; Δ pts share ± ${pct(Math.sqrt(0.5 / np))} 1 s.e.) ==`
    );
    sens(teams, 'one hitter (best-power WS), atk × (spike power)', 'hitter', 'atk', t => t.hit && !t.tip);
    sens(teams, 'whole side, atk ×', 'side', 'atk', t => t.side === 0 && !t.tip);
    sens(
      teams,
      "whole side, def × (receive, dig, block power, cover) — rows are the OPPONENT's attacks",
      'side',
      'def',
      t => t.side === 1 && !t.tip
    );
    sens(
      teams,
      "whole side, jump × (block height / coverage, hitter contact height) — opponent's attacks",
      'side',
      'jump',
      t => t.side === 1 && !t.tip
    );
    sens(teams, 'whole side, serve × (serve quality) — rows: opponent attacks', 'side', 'serve', t => t.side === 1 && !t.tip);
  }

// ---- 3. variance budget of one spike duel (a model of rally-defense.js block() + dig(), fed with real contexts) ----
const sig = v => 1 / (1 + Math.exp(-v));
/**
 * P(outcome) of one captured attack given its three continuous rolls (spike sr, block br, dig dr), the Bernoulli coins
 * integrated out: error (spikeErrorP, with its pow > 110 step) → block break / stuff / touch / tool → dig (killChance).
 * powX: × the hitter's pre-roll power (the stat gap). o: what-if overrides { kill(pow, dsc), stuff(bp, cov, pow), errK, srLo }.
 */
function duel(c, sr, br, dr, powX = 1, o = {}) {
  const pow = c.pow0 * powX * sr;
  let errP = (c.errP - (c.powE > 110 ? 0.03 * c.errK : 0) + (pow > 110 ? 0.03 * c.errK : 0)) * (o.errK ?? 1);
  errP = Math.min(1, errP);
  const kc = o.kill || ((pw, dsc) => sig((pw - dsc) / 34 + 0.3));
  const dscOf = (mul, d) => (c.dA * d - c.dPen) * mul;
  const kp = (pw, mul) => Math.min(0.98, kc(pw, dscOf(mul, dr)));
  let Pk = 0,
    Pb = 0,
    Pd = 0;
  if (!c.block) {
    const k = kp(pow, c.dM0);
    Pk = k;
    Pd = 1 - k;
  } else {
    const bp = (c.bBase * br + c.dbl) * c.cov,
      cov = c.cov,
      ratio = pow / Math.max(1, bp / cov),
      pBrk = !c.late && cov >= 0.5 && ratio > 1.1 ? Math.min(0.45, (ratio - 1.1) * 3) : 0,
      stuff = o.stuff || ((b, cv, pw) => sig((b / Math.max(cv, 0.01) - pw) / 20 - 0.2) * Math.pow(Math.min(1, cv), 1.6)),
      pSt = c.late ? 0 : stuff(bp, cov, pow) * c.bSk,
      pTo = sig((bp - pow) / 20 + 0.2),
      pTool = !c.late && cov >= 0.25 && cov < 0.6 ? 0.05 : 0;
    const kBrk = kp(pow, 0.85),
      kTo = kp(pow * (c.late ? 0.7 : 0.55), 1.15),
      kCl = kp(pow, 1);
    Pk = pBrk * kBrk + (1 - pBrk) * (1 - pSt) * (pTo * kTo + (1 - pTo) * (pTool + (1 - pTool) * kCl));
    Pb = (1 - pBrk) * pSt;
    Pd = 1 - Pk - Pb;
  }
  return { k: (1 - errP) * Pk, b: (1 - errP) * Pb, d: (1 - errP) * Pd, e: errP };
}
/**
 * The captured spikes (no tips, no element spikes). An attack that ended before the block (an error) or before the dig (an error,
 * a stuff) borrows that part from another attack of the same side in the same match (round-robin): the model needs all three.
 */
function contexts(R) {
  const out = [];
  for (const S of R)
    for (const side of [0, 1]) {
      const L = S.list.filter(
        t => t.side === side && !t.tip && !t.el && t.A.sr && t.A.err && t.out !== 'other' && t.out !== 'net (blocker)'
      );
      const blk = L.filter(t => t.A.f.blk).map(t => t.A),
        dig = L.filter(t => t.A.dg && t.A.kc).map(t => t.A);
      if (!blk.length || !dig.length) continue;
      L.forEach((t, i) => {
        const a = t.A,
          bA = a.f.blk ? a : blk[i % blk.length],
          dA = a.dg && a.kc ? a : dig[i % dig.length];
        const c = { pow0: a.pow / a.sr, errP: a.err.v, errK: a.err.k, powE: a.err.pow, out: t.out, hit: t.hit };
        c.block = !!bA.bp;
        if (bA.bp) {
          c.cov = bA.bp.cov;
          c.dbl = bA.bp.dbl;
          c.bBase = (bA.bp.v / bA.bp.cov - bA.bp.dbl) / bA.bp.br;
          c.bSk = bA.bp.sk;
          c.late = !bA.f.brk && !bA.stuffSeen;
        }
        c.dA = (dA.dg.v + dA.dg.pen) / dA.dg.dr;
        c.dPen = dA.dg.pen;
        const mul0 = dA.kc.dsc / dA.dg.v;
        c.dM0 = isFinite(mul0) && mul0 > 0 && !dA.f.touch && !dA.f.brk ? mul0 : 1;
        out.push(c);
      });
    }
  return out;
}
const U = (lo, hi, u) => lo + (hi - lo) * u;
/** Variance budget over contexts: coins (the yes/no draws), the three rolls, the context (stat gap, coverage, distance). */
function budget(C, powX, o = {}) {
  let mean = 0,
    coin = 0,
    between = 0;
  const means = [],
    part = { sr: 0, br: 0, dr: 0 },
    fail = { e: 0, b: 0, d: 0 };
  // a coarser grid for the triple loop (8³ per context)
  const g8 = Array.from({ length: 8 }, (x, i) => U(0.8, 1.2, (i + 0.5) / 8)),
    s8 = o.srG ? Array.from({ length: 8 }, (x, i) => U(o.srLo, 1.2, (i + 0.5) / 8)) : g8,
    d8 = o.drG ? Array.from({ length: 8 }, (x, i) => U(0.8, o.drHi, (i + 0.5) / 8)) : g8;
  let vr = 0;
  for (const c of C) {
    const P = []; // p_kill[sr][br][dr]
    let m = 0,
      cc = 0;
    for (let i = 0; i < 8; i++) {
      P.push([]);
      for (let j = 0; j < 8; j++) {
        P[i].push([]);
        for (let l = 0; l < 8; l++) {
          const r = duel(c, s8[i], g8[j], d8[l], powX, o);
          P[i][j].push(r.k);
          m += r.k;
          cc += r.k * (1 - r.k);
          fail.e += r.e / 512;
          fail.b += r.b / 512;
          fail.d += r.d / 512;
        }
      }
    }
    m /= 512;
    cc /= 512;
    let v = 0;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) for (let l = 0; l < 8; l++) v += (P[i][j][l] - m) ** 2;
    v /= 512;
    // first-order share of each roll: the variance of the mean over the other two
    const avg = (fx, i) => {
      let s = 0;
      for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) s += fx === 0 ? P[i][a][b] : fx === 1 ? P[a][i][b] : P[a][b][i];
      return s / 64;
    };
    ['sr', 'br', 'dr'].forEach((k, fx) => {
      let s = 0;
      for (let i = 0; i < 8; i++) s += (avg(fx, i) - m) ** 2;
      part[k] += s / 8;
    });
    means.push(m);
    mean += m;
    coin += cc;
    vr += v;
  }
  const n = C.length;
  mean /= n;
  for (const m of means) between += (m - mean) ** 2;
  between /= n;
  coin /= n;
  vr /= n;
  for (const k in part) part[k] /= n;
  const tot = mean * (1 - mean);
  return {
    mean,
    tot,
    coin: coin / tot,
    rolls: vr / tot,
    ctx: between / tot,
    sr: part.sr / tot,
    br: part.br / tot,
    dr: part.dr / tot,
    fail: { e: fail.e / n, b: fail.b / n, d: fail.d / n }
  };
}
if (PARTS.includes('3'))
  for (const teams of T) {
    const C = contexts(BASE[teams]),
      eng = sumUp(BASE[teams], t => !t.tip && !t.el);
    console.log(
      `\n== 3. Variance budget of one spike duel — ${teams} (${C.length} captured spikes; model check: P(kill) ${pct(budget(C, 1).mean)}) ==`
    );
    console.log(`  (engine, all non-tip spikes: kill ${pct(eng.k)}  blocked ${pct(eng.b)}  dug ${pct(eng.d)}  error ${pct(eng.e)})`);
    console.log('  pow ×   P(kill) | share of Var(kill): coins  rolls (spike / block / dig)    context | fails: error  blocked  dug');
    for (const x of [1, 1.15, 1.5, 2, 3]) {
      const b = budget(C, x);
      console.log(
        `   ${lpad(x, 4)}   ${lpad(pct(b.mean), 5)}  |  ${lpad(pct(b.coin, 0), 3)} %   ${lpad(pct(b.rolls, 0), 3)} % (${pct(b.sr, 0)} / ${pct(b.br, 0)} / ${pct(b.dr, 0)})     ${lpad(pct(b.ctx, 0), 3)} %  |   ${lpad(pct(b.fail.e), 5)}  ${lpad(pct(b.fail.b), 6)}  ${lpad(pct(b.fail.d), 5)}`
      );
    }
    // the roll ranges at ×2: favourable rolls only
    const b2 = budget(C, 2),
      b2s = budget(C, 2, { srG: 1, srLo: 1.0 }),
      b2d = budget(C, 2, { drG: 1, drHi: 1.0 }),
      b2e = budget(C, 2, { errK: 0 });
    console.log(
      `  at ×2: P(kill) ${pct(b2.mean)} → spike roll 1.0–1.2: ${pct(b2s.mean)}; dig roll capped at 1.0: ${pct(b2d.mean)}; no hitting error: ${pct(b2e.mean)}`
    );
    const cK = (pw, dsc) => sig((pw - dsc) / 20 + 0.3);
    console.log(
      `  at ×2 with killChance /20: ${pct(budget(C, 2, { kill: cK }).mean)}  (×1 with /20: ${pct(budget(C, 1, { kill: cK }).mean)})`
    );
  }

// ---- 4. what would make a buff felt ----
/** Family A — the holder's failure rolls narrowed (only while they are the hitter / their side attacks). */
const famA = {
  'A1 own spike roll 1.0–1.2': { roll: (tag, v, p, cp) => (tag === 'spk' && cp.holder(p) ? 1 + (v - 0.8) / 2 : v) },
  'A2 own error × 0.5': { errK: 0.5 },
  'A3 defender dig roll ≤ 1.0 vs holder': {
    roll: (tag, v, p, cp) => (tag === 'dig' && curHolder ? 0.8 + (v - 0.8) / 2 : tag === 'spk' ? ((curHolder = cp.holder(p)), v) : v)
  },
  'A1+A2+A3': {
    errK: 0.5,
    roll: (tag, v, p, cp) =>
      tag === 'spk'
        ? ((curHolder = cp.holder(p)), cp.holder(p) ? 1 + (v - 0.8) / 2 : v)
        : tag === 'dig' && curHolder
          ? 0.8 + (v - 0.8) / 2
          : v
  }
};
/** Family B — steeper duels for everyone. */
const famB = {
  'B1 killChance slope /34 → /20': { kill: (pow, dsc, tip, d0) => (tip ? 0.3 + d0 * 0.3 : sig((pow - dsc) / 20 + 0.3)) },
  'B2 block contest on the ratio': {
    // stuff and touch on the log power ratio (×2 the block's power ≈ the old +20 gap at power 60): the gap scales with the stats
    stuff: (bp, cov, pow) => sig(Math.log(bp / Math.max(cov, 0.01) / Math.max(1, pow)) / 0.3 - 0.2) * Math.pow(Math.min(1, cov), 1.6),
    touch: (bp, pow) => sig(Math.log(Math.max(1, bp) / Math.max(1, pow)) / 0.3 + 0.2)
  },
  'B3 killChance on the ratio (ln/0.35)': {
    kill: (pow, dsc, tip, d0) => (tip ? 0.3 + d0 * 0.3 : sig(Math.log(Math.max(1, pow) / Math.max(1, dsc)) / 0.35 + 0.3))
  },
  'B1+B2': {}
};
famB['B1+B2'] = { ...famB['B1 killChance slope /34 → /20'], ...famB['B2 block contest on the ratio'] };
// C — the buff reaches the error roll: the attack edge also counts in the hitter's spike skill level (errK, formulas.js:25)
famA['C1 atk buff lowers own errK (level × buff)'] = { errBuff: 1 };
famA['C1 + A3'] = { errBuff: 1, roll: famA['A3 defender dig roll ≤ 1.0 vs holder'].roll };
famB['C2 SKILL.mid 125 → 100 (all errors × 0.72)'] = { mid: 100 };
famB['C1 + C2'] = { errBuff: 1, mid: 100 };
if (PARTS.includes('4'))
  for (const teams of T) {
    console.log(`\n== 4. What would make a buff felt — ${teams}: side 0's point share gain (Δ vs no buff, same family) ==`);
    console.log(
      '  family                                   | hitter atk: +15%   +50%    ×2   | side atk: +15%   +50%    ×2   | match win at ×2 side'
    );
    const fams = { 'now (no change)': {}, ...famA, ...famB };
    const isA = f => Object.values(famA).includes(f);
    const ovrRows = [];
    for (const [name, f] of Object.entries(fams).filter(([n]) => !FAM || FAM.split(',').some(q => n.startsWith(q)))) {
      // family A: the narrowing comes with the buff (a card's holder); its baseline is the game as now
      const base = sumUp(isA(f) ? BASE[teams] : name === 'now (no change)' ? BASE[teams] : run(teams, { ...f, errK: undefined }));
      const cells = [];
      let win2 = 0;
      for (const who of ['hitter', 'side'])
        for (const x of [1.15, 1.5, 2]) {
          const cfg = { ...f, who, k: 'atk', x };
          const s = sumUp(run(teams, cfg));
          cells.push(lpad(sgn(s.share - base.share), 6));
          if (who === 'side' && x === 2) win2 = s.win - base.win;
        }
      // what does family A alone (no stat buff) give its holder side?
      let extra = '';
      if (isA(f)) {
        const s = sumUp(run(teams, { ...f, who: 'side' }));
        extra = `  (the narrowing alone, side: ${sgn(s.share - base.share)})`;
      }
      console.log(`  ${pad(name, 40)} |  ${cells.slice(0, 3).join(' ')}  |  ${cells.slice(3).join(' ')}  |  ${sgn(win2, 0)} %${extra}`);
      if (!isA(f)) {
        const o = sumUp(run(teams, { ...f, ovr: 10 }));
        ovrRows.push(
          `  ${pad(name, 40)} | +10 stats (≈ +10 OVR): pts ${pct(o.share)} %  (Δ ${sgn(o.share - base.share)})  match win ${pct(o.win, 0)} % (base ${pct(base.win, 0)} %)`
        );
      }
    }
    console.log(`  -- a 10-point gap (every stat of side 0's squad +10) under each global family --`);
    for (const r of ovrRows) console.log(r);
  }
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
