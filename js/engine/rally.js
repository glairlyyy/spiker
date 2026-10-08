// Rally loop: possession after possession until a point is decided.
// Serve/receive live in engine/serve.js; the phases before the attack in engine/rally-phases.js, the attack itself
// (fake set, set, spike, hitting error) below, approach and block formation in engine/rally-block.js, and the block and
// dig in engine/rally-defense.js. Same return convention as engine/rally-phases.js.

/** Possessions after which everyone starts to tire (stamina drain, long-rally element gauges). */
const LONG_RALLY = 6;
/** Extra flight speed of the hardest hits (spikes; serves use SERVE_FAST in serve.js). */
const HIT_FAST = 1.6;

/**
 * Plays the rest of a rally after serve receive, alternating sides until a point is decided.
 * Returns the side (0/1) that wins the point. Each loop iteration is one side's possession:
 *   1. free ball (bad pass floats straight over)
 *   2. choose setter (back-row setter first; scramble → someone else)
 *   3. setter dump / second-touch feint
 *   4. set quality: double contact, bump-set, perfect / good / bad
 *   5. choose attack: quick, pipe, setter-hitter; bad set → push over
 *   6. multi-attack fake set (decoys, blocker may bite)                                   fakeSet
 *   7. approach, block formation (depth + height coverage), set beat                     formBlock, setBeat
 *   8. spike power, shot choice (around / seam / over), landing spot, hitting error
 *                                                    spikePower, spikeActs, landingSpot, hittingError
 *   9. block: block break → stuff (kill block, or block cover dig) → touch → tool
 *  10. dig or kill; a dig hands possession to the other side
 * c = the possession context (atkT / defT = attacking / defending team; V = record animation beats via B()).
 * x = the attack context: the values of phases 2–5, filled in by each attack phase and read by block() and dig().
 */
function* rally(m, B, V, atk, pas, qual, scr = null) {
  const front = (side, p) => {
    const i = rotOrder(m.t[side], m.rot[side]).indexOf(p);
    return i === 1 || i === 2;
  };
  for (let n = 1; ; n++) {
    m.rallyN = n; // possessions so far (a lost marathon shakes the team: pointMomentum)
    if (n > LONG_RALLY) {
      for (const t of m.t) for (const p of t.P) dr(m, p, 0.004);
      elLong(m);
    }
    const atkT = m.t[atk],
      defT = m.t[1 - atk],
      ds = 1 - atk,
      da = DIR(atk),
      dd = DIR(ds);
    // long rallies heat up: +10% spike power for every possession past the 7th
    const fat = n > LONG_RALLY + 1 ? 1 + (n - LONG_RALLY - 1) * 0.1 : 1;
    /** possession context shared by the phases */
    const c = { m, B, V, front, n, atk, ds, da, dd, atkT, defT, pas, qual, scr };
    let r = scr ? null : freeBall(c);
    if (r) {
      [atk, pas, qual, scr = null] = r.next;
      continue;
    }
    // a pop-up save (scr) is the team's 2nd touch: the saver bump-sets, a third player hits (see saveSet)
    const s = scr ? saveSet(c) : pickSetter(c);
    // your prompts (spec §2.16): Call / Fake when you hit for this side, Block when you defend — the pass is the window
    const pr = scr ? null : yield* prompts(c, s);
    r = scr || c.callYou ? null : setterDump(c, s); // a called ball: no dump
    if (r) {
      if (r.point != null) return r.point;
      [atk, pas, qual, scr = null] = r.next;
      continue;
    }
    const h = scr ? { sq2: 'bad', bumpSet: true } : setHands(c, s);
    if (h.point != null) return h.point;
    if (pr && pr.anyway) {
      h.sq2 = 'bad'; // a failed fake (spec §2.16): the setter sets you anyway — a bad set into the block
      plays(m).anywaySet++;
    }
    const a = chooseAttack(c, s, h);
    if (!scr) readSet(c, a.spiker);
    r = badSetOver(c, s, a);
    if (scr) {
      m.scrLog[m.scrLog.length - 1].hitter = r ? null : a.spiker.id;
      if (r) m.scr.over++;
    }
    if (r) {
      [atk, pas, qual, scr = null] = r.next;
      continue;
    }
    // ---- 6–8: fake set, approach & block formation, set beat, spike, hitting error ----
    const x = { ...s, ...h, ...a, fat };
    Object.assign(x, fakeSet(c, x));
    Object.assign(x, formBlock(c, x));
    x.youBlk = blockYou(c, x); // you are in this block (spec §2.16): your jump is your press
    Object.assign(x, setBeat(c, x));
    yield* blockPrompt(c, x); // the set is up, their hitter runs in: press E to jump — the timing is yours
    x.cov0 = x.cov; // the block's coverage before the shot choice (Decide)
    Object.assign(x, spikePower(c, x));
    x.pow0 = x.tip ? 0 : x.pow / (x.elS ? x.elS.pow : 1);
    // a decision point (spec §2.13): your attack — the AI's shot is the one spikePower drew; your pick rewrites it
    const ai = x.tip ? 'tip' : x.delayed ? 'delay' : x.around ? 'cut' : 'power',
      shot = yield* decide(m, { kind: 'attack', p: x.spiker, options: () => Decide.attack(c, x), ai, n: c.n });
    if (shot !== ai) Decide.applyShot(c, x, shot);
    Object.assign(x, spikeActs(c, x));
    Object.assign(x, landingSpot(c, x));
    // the attack in play, for the element gauges (kills, digs and blocks are credited against it)
    m.ctx = {
      spiker: x.spiker,
      pow: x.pow,
      quick: x.quick,
      back: x.back,
      over: x.over && !x.around,
      around: x.around || x.delayed,
      tip: x.tip,
      fake: !!x.fakeDecoy,
      el: x.elS
    };
    elAttack(m, x.spiker, m.ctx);
    const k0 = (m.stat[x.spiker.id] || blank()).k,
      bk0 = sumBlk(m, defT),
      fin = () => {
        tallyAttack(m, atk, x, k0, bk0);
        readAttack(c, x, k0, bk0);
      };
    r = x.delayed ? hangFail(c, x) : null; // a Delayed Spike can hang too long (low jump / wit): the ball drops on your side
    if (r) {
      fin();
      Decide.out(m, 'attack', x.spiker.id, r.point != null ? 'lose' : 'on');
      if (r.point != null) return r.point;
      [atk, pas, qual, scr = null] = r.next;
      continue;
    }
    r = hittingError(c, x);
    if (r) {
      fin();
      Decide.out(m, 'attack', x.spiker.id, 'err');
      return r.point;
    }
    // ---- 9–10: block, then dig or kill ----
    const bl = block(c, x);
    if (bl.point != null) {
      fin();
      Decide.out(m, 'attack', x.spiker.id, bl.point === atk ? 'win' : 'lose');
      return bl.point;
    }
    if (bl.next) {
      fin();
      Decide.out(m, 'attack', x.spiker.id, 'on');
      [atk, pas, qual, scr = null] = bl.next;
      continue;
    }
    r = dig(c, x, bl);
    fin();
    Decide.out(m, 'attack', x.spiker.id, r.point === atk ? 'win' : r.point != null ? 'lose' : 'on');
    if (r.point != null) return r.point;
    [atk, pas, qual, scr = null] = r.next;
  }
}

/** Engine-only tally of one attack (no randoms): by kind (quick / middle or pipe / pins) and whether the hitter scored. */
const sumBlk = (m, t) => t.P.reduce((n, p) => n + (m.stat[p.id] ? m.stat[p.id].blk : 0), 0);
function tallyAttack(m, side, x, k0, bk0) {
  const a = m.att[side],
    kind = x.quick ? 'q' : x.pipe || x.lane === 'M' ? 'mid' : 'pin',
    kill = (m.stat[x.spiker.id] || blank()).k > k0;
  a.n++;
  a[kind]++;
  if (x.b1) a.dbl++;
  if (sumBlk(m, m.t[1 - side]) > bk0) {
    a.stf++;
    a[kind + 's']++;
  }
  if (x.late[0]) a.late++;
  if (kill) {
    a.k++;
    a[kind + 'k']++;
  }
}
/**
 * 6. Multi-attack fake set: several hitters approach, the setter shows one and sets another — the first blocker
 * may bite. May switch the attack to a quick. Returns { quick, spiker, bitten, fakeDecoy }.
 */
function fakeSet(c, x) {
  const { m, B, V, atk, ds, da, atkT, qual } = c,
    { setter, MBs, mbZ, readBonus, B0, bad } = x;
  let { quick, spiker } = x,
    bitten = false,
    fakeDecoy = null;
  if (c.fakeYou) return fakeYou(c, x); // your fake (spec §2.16)
  if (
    !c.callYou && // a called ball: no multi-attack fake
    !bad &&
    qual >= 2 &&
    setter.role === 'S' &&
    R() < clamp(0.12 * W(setter) * (atkT.sk === 'mind' ? 2 : atkT.sk === 'tempo' ? 1.5 : 1), 0, 0.55)
  ) {
    if (!quick && MBs.length && R() < 0.55) {
      quick = true;
      spiker = pick(MBs);
    }
    const others = atkT.P.filter(p => p !== setter && p !== spiker);
    if (others.length) {
      const decoy = wpick(others, p => p.power * (p.star ? 1.6 : 1)),
        db = B0;
      fakeDecoy = decoy;
      for (const q of others) dr(m, q, 0.02);
      bitten =
        R() < clamp(0.8 - (W(db) - 0.8) * 0.45 + (W(setter) - 1.5) * 0.3 + (skillMod(setter, 'decoy') - 1) - readBonus, 0.15, 0.9) ||
        (m.dset[ds] === 'commit' && db.role === 'MB'); // a Commit middle is already jumping
      const zOf = p => (p.role === 'MB' && MBs.includes(p) ? mbZ(p) : clamp(HOME[p.slot][1] + (p.slot === 'W0' ? -0.05 : 0.05), 0.1, 0.9)),
        xOf = p => sx(atk, p.role === 'MB' && MBs.includes(p) ? 466 : 420);
      const fk = [];
      for (const p of [...others, spiker]) mv(m, p, xOf(p), zOf(p), fk, V);
      const dz = zOf(decoy);
      if (bitten) mv(m, db, sx(ds, 484), dz, fk, V);
      V &&
        B({
          dur: 650,
          slow: 0.3,
          slowAt: [0.42, 0.72], // a real slow-mo on the moment of the fake only (not a whole beat at 70%: that read as lag)
          acts: [
            { k: 'pose', p: setter.id, pose: 'set' },
            { k: 'jump', p: setter.id, mode: 'up', peak: 18, t0: 0.05, t1: 0.7 },
            { k: 'ball', to: { p: setter.id, c: 'set', dh: 18 }, h: 0 },
            ...fk,
            ...others.map(p => ({ k: 'pose', p: p.id, pose: 'spike' })),
            { k: 'pose', p: spiker.id, pose: 'spike' },
            { k: 'jump', p: decoy.id, mode: 'up', peak: jumpPx(decoy), t0: 0.2, t1: 0.95 },
            ...others.filter(p => p !== decoy).map(p => ({ k: 'jump', p: p.id, mode: 'hop', peak: jumpPx(p) * 0.7, t0: 0.3, t1: 1 })),
            ...(bitten
              ? [
                  { k: 'pose', p: db.id, pose: 'block' },
                  { k: 'jump', p: db.id, mode: 'up', peak: jumpPx(db) * 0.85, t0: 0.4, t1: 1 }
                ]
              : []),
            { k: 'ghost', to: { x: xOf(decoy) + da * 12, z: dz, h: REACH_H + jumpPx(decoy) } },
            { k: 'label', t: 'Fake set!', dy: 60, set: 1, big: 1 }
          ]
        });
    }
  }
  return { quick, spiker, bitten, fakeDecoy };
}

/**
 * 7b. The set: ball calls, a setter–hitter combo, the element source, the staged hype / defense-read scenes and the
 * set beat itself. `mark` = the beat index right after the set, where block() may insert a spike cut.
 */
function setBeat(c, x) {
  const { m, B, V, atk, ds, atkT, defT } = c,
    { setter, spiker, quick, bad, fakeDecoy, bitten, sq2 } = x,
    { setZ, spZ, b0, blockers, cov } = x;
  // a bad set that stays hittable still reaches the hitter's hand (it just hits weaker: setMul in attack());
  // the two draws stay so the random sequence is unchanged
  if (bad) {
    rnd(25, 50);
    rnd(18, 34);
  }
  // set direction relative to the setter: quick, front set, or back set (hitter behind the setter)
  const setDir = quick ? 'quick' : spZ > setZ + 0.08 ? 'back' : 'front';
  // ball calls (setCallActs) while the set is in the air: the hitter asks for it, other confident hitters shout as decoys
  const setCalls = setCallActs(c, x);
  const combo =
    ((setter.star && spiker.star) || bondCombo(setter, spiker)) && setter !== spiker && sq2 === 'perfect' && !fakeDecoy && R() < 0.65;
  // full element gauge: this attack is guaranteed to be an element spike (a charged setter puts theirs into the set)
  const elSrc = elReady(m, spiker) ? spiker : setter !== spiker && setter.role === 'S' && !bad && elReady(m, setter) ? setter : null;
  // shonen moment: a staged build-up before the set (presentation only — see engine/hype.js)
  m.defBeats = [];
  const hype = V ? hypeLevel(m, c, spiker, b0, elSrc, bad) : 0;
  if (hype) hypeScene(m, B, hype, { setter, spiker, B0: b0, elSrc, atkT, defT, atk, ds, blockers });
  const read = V ? readLevel(m, b0, cov, bitten, hype) : 0; // the blocker is confident: their scene mid-jump
  V &&
    B({
      dur: setDurOf(x),
      // attack scene: the set after it starts in slow motion and snaps to full speed for the hit;
      // defense read: normal set, slow motion as the hitter takes off (the scene cuts in at the top of the jump)
      ...(hype && !m.hypeDef ? { sceneSlow: hype } : read ? { slow: 1, slowAt: [0.55, 1], hypeSlow: read } : {}),
      acts: setActs(c, x, { setDir, combo, setCalls, hype })
    });
  const mark = V ? B.len() : 0; // right after the set: the hitter is in the air (block() may stage a spike cut here)
  // defense read: the hitter is in the air — cut to the blocker, who has read it
  if (read) hypeRead(m, B, read, { spiker, B0: b0, defT, ds });
  // hit-stop at contact after a staged build-up (back to the game camera)
  if (V && (hype || read))
    B({
      dur: 160,
      scene: Math.min(hype || 9, read || 9),
      freeze: 1,
      acts: [
        { k: 'shot', kind: null },
        { k: 'flash', a: 0.22 },
        { k: 'shake', amt: 4 }
      ]
    });
  return { combo, elSrc, mark };
}
/** Ball calls while the set is in the air: the hitter asks for it, other confident hitters shout as decoys. */
function setCallActs(c, x) {
  const { m, V, front, atk } = c,
    { spiker, quick, bad, back, longB, pool, callers, fakeDecoy } = x;
  const setCalls = [];
  if (V && !bad) {
    const cf = p => confidence(p, m, atk);
    if (x.readWarn) setCalls.push({ k: 'call', p: x.setter.id, t: callLine('readyou', x.setter, m) }); // your read (spec §2.16)
    if (back && callers.includes(spiker)) setCalls.push({ k: 'call', p: spiker.id, t: callLine(longB ? 'long' : 'back', spiker, m) });
    else if (!quick && cf(spiker) >= 82) setCalls.push({ k: 'call', p: spiker.id, t: callLine(m.zone[atk] ? 'zone' : 'set', spiker, m) });
    const other = pool.find(p => p !== spiker && p !== fakeDecoy && cf(p) >= 88 && (front(atk, p) || callers.includes(p)));
    if (other) setCalls.push({ k: 'call', p: other.id, t: callLine(callers.includes(other) ? 'back' : 'decoy', other, m), soft: 1 });
  }
  return setCalls;
}
/** The set beat's acts (presentation only, no draws): setter, hitter and blockers in the air, labels and the log line. */
function setActs(c, x, { setDir, combo, setCalls, hype }) {
  const { atkT, qual } = c,
    { setter, spiker, quick, bad, back, longB, freak, slide, sync, pool, fakeDecoy, bitten, sq2, bumpSet } = x,
    { spZ, b0, bz0, a1, pj, cov, readB, setTech } = x;
  return [
    ...(hype ? [{ k: 'shot', kind: null }] : []),
    { k: 'pose', p: setter.id, pose: bumpSet ? 'bump' : 'set' },
    { k: 'setdir', p: setter.id, dir: setDir },
    ...a1,
    ...(setTech ? [{ k: 'tech', p: freak || slide || longB ? spiker.id : setter.id, t: setTech }] : []),
    ...(readB ? [{ k: 'tech', p: b0.id, t: 'Read Block', dy: -14 }] : []),
    // synchronized attack: every other hitter approaches and jumps too
    ...(sync
      ? pool
          .filter(p => p !== spiker)
          .flatMap(p => [
            { k: 'pose', p: p.id, pose: 'spike' },
            { k: 'jump', p: p.id, mode: 'hop', peak: jumpPx(p) * 0.85, t0: 0.4, t1: 1 }
          ])
      : []),
    ...(combo ? [{ k: 'link', p1: setter.id, p2: spiker.id, color: atkT.color }] : []),
    ...(!fakeDecoy && setter.role === 'S' && qual === 3 && W(setter) > 1.5
      ? [{ k: 'jump', p: setter.id, mode: 'hop', peak: jumpPx(setter) * 0.45, t0: 0, t1: 0.6 }]
      : []),
    { k: 'jump', p: spiker.id, mode: 'up', t0: quick ? 0.05 : longB ? 0.64 : 0.52, t1: 1, peak: pj },
    ...(fakeDecoy
      ? [
          { k: 'jump', p: fakeDecoy.id, mode: 'down', t0: 0, t1: 0.55 },
          { k: 'jump', p: setter.id, mode: 'down', t0: 0.25, t1: 0.75 },
          ...(bitten ? [{ k: 'plabel', p: b0.id, t: '!?' }] : [])
        ]
      : []),
    ...blockJumpActs(c, x),
    { k: 'pose', p: spiker.id, pose: 'spike' },
    { k: 'spkstyle', p: spiker.id, st: quick ? 'quick' : back ? 'pipe' : 'normal' },
    // camera: slow push-in on the contest above the net when a real block is up
    ...(cov > 0.3 && !bad ? [{ k: 'cam', amt: 0.32, x: NETX, z: (spZ + bz0) / 2, h: 150, hold: 1500, t0: 0.45 }] : []),
    ...blockPoseActs(x),
    {
      k: 'ball',
      to: { p: spiker.id, c: 'spike' },
      h: freak ? 8 : quick ? 30 : bad ? 250 : longB ? 300 : back ? 245 : 190,
      wob: bad
    },
    ...(bad ? [{ k: 'call', p: setter.id, t: 'Sorry!', soft: 1 }] : []),
    ...setCalls,
    ...(fakeDecoy ? [{ k: 'real', to: { p: spiker.id, c: 'spike' } }] : []),
    ...(sq2 === 'perfect'
      ? [{ k: 'label', t: (setter.star ? '✦ ' : '') + (setDir === 'back' ? 'Perfect back set' : 'Perfect set'), when: 'end', set: 1 }]
      : bad
        ? [{ k: 'label', t: 'Bad set', when: 'end' }]
        : [])
  ];
}
/** The set beat's length (ms): the hitter's approach; contact at its end. */
const setDurOf = x => (x.freak ? 330 : x.quick ? 430 : x.bad ? 900 : x.longB ? 1150 : 800);
/** A blocker's take-off in the set beat (fraction of it; contact at its end). */
const blockT0 = (x, b) => (b === x.b0 && x.bitten ? 0.84 : x.quick ? 0.3 : 0.6);
/** The blockers' jumps. */
function blockJumpActs(c, x) {
  const { fakeDecoy, bitten, b0, blockers } = x;
  return blockers.map(b => ({
    k: 'jump',
    p: b.id,
    mode: b === b0 && bitten && fakeDecoy ? 'reup' : 'up',
    t0: blockT0(x, b),
    t1: 1,
    peak: jumpPx(b) * (b === b0 && bitten ? 0.45 : 0.85),
    ...(b === x.youBlk ? { prompt: 'block' } : {}) // yours (spec §2.16): the match screen jumps you when you press instead
  }));
}
/** The blockers' poses and the late jumpers. */
function blockPoseActs(x) {
  const { blockers, lateA } = x;
  return [...blockers.map(b => ({ k: 'pose', p: b.id, pose: 'block' })), ...lateA];
}

/**
 * 8a. Spike power and shot choice: tip on a bad set, power, the element spike, cut shot around the block,
 * delayed spike, then what is left of the block's coverage and the power tier.
 */
function spikePower(c, x) {
  const { m, V, atk, atkT, defT } = c,
    { setter, spiker, sq2, bad, quick, back, longB, combo, fat, pj, seam, elSrc, b0 } = x;
  let { cov } = x;
  st(m, spiker, 'att');
  dr(m, spiker, 0.035 + pj / 4000);
  const setMul = { perfect: 1.12, good: 1, bad: 0.72 }[sq2];
  const tip = bad && !elSrc && R() < 0.35;
  let pow = tip ? rnd(18, 30) : Formula.spikePower({ spiker, team: atkT, setMul, quick, back, longB, combo, fat });
  const elS = !tip && elSrc ? elSpike(m, elSrc, spiker, setter, defT, sq2 === 'perfect') : null;
  if (elS) {
    pow *= elS.pow;
    m.elLog.push({ p: elSrc.id, el: elS.el, side: atk, won: null });
  }
  st(m, spiker, 'top', kmh(pow));
  let around = false;
  const cutS = hasTech(spiker, 'cutshot');
  if (!tip && cov > 0.5 && R() < clamp((W(spiker) - 0.4) * 0.45 + (cutS ? 0.2 : 0), 0, 0.75)) {
    around = true;
    if (cutS) techFire(m, spiker, 'cutshot');
    // a blocker at least as sharp as the hitter reads the cut and keeps part of the block on it
    cov *= (cutS ? 0.35 : 0.45) + (W(b0) >= W(spiker) ? 0.2 : 0);
  }
  // Delayed Spike: hang in the air until the blockers come down
  const delayed = !tip && !quick && !around && cov > 0.4 && hasTech(spiker, 'delay') && R() < 0.35;
  if (delayed) {
    cov *= 0.4;
    techFire(m, spiker, 'delay');
  }
  if (seam) cov *= 0.45;
  if (elS) cov *= elS.cov;
  if (V && (tip || cov <= BLOCK_MIN_COV)) dropDefScene(m); // no block attempt: the defender's scene lines go (block() uses the same test)
  const tier = tip ? 'tip' : pow >= 100 ? 'ult' : pow >= 80 ? 'heavy' : pow >= 58 ? 'hard' : 'soft';
  return { tip, pow, elS, el: elS ? elS.el : null, around, cutS, delayed, cov, tier };
}

/**
 * 8b. The spike's presentation (no random draws): the impact zoom and the hit acts
 * (`hit`) and blockers coming down (`bdown`) that the outcome beat plays with.
 */
function spikeActs(c, x) {
  const { B, V, da, atkT } = c,
    { spiker, tip, pow, elS, quick, back, longB, around, delayed } = x,
    { appX, spZ, blockers, lateB } = x;
  spikeZoom(c, x);
  const note = spikeNote(x);
  const hit = [
    {
      k: 'spkstyle',
      p: spiker.id,
      st: tip ? 'tip' : quick ? 'quick' : around ? 'cut' : pow >= 95 ? 'power' : back ? 'pipe' : 'normal'
    },
    // broad jump: the back-row hitter flies forward (a long back attack much further)
    ...(back ? [{ k: 'slide', p: spiker.id, x: appX + da * (longB ? 100 : 44), z: spZ, air: 1 }] : []),
    { k: 'jump', p: spiker.id, mode: 'down' },
    ...(tip
      ? []
      : [
          { k: 'burst', pow, color: elS ? ECOL[elS.el] : atkT.color, op: spiker.op, el: elS ? elS.el : null },
          ...(elS && elS.res ? [{ k: 'plabel', p: elS.res.id, t: 'Resist!' }] : []),
          { k: 'label', t: `${kmh(pow)} km/h`, pow },
          { k: 'label', t: `↑ ${jumpCm(spiker)} cm`, small: 1, dy: 26 },
          { k: 'shake', amt: Math.max(0, (pow - 65) / 5) + (elS ? (elS.el === 'blast' ? 8 : 3) : 0) }
        ]),
    ...(note ? [{ k: 'label', t: note, dy: -30, set: 1 }] : []),
    ...(pow >= 95
      ? [
          { k: 'lines', pow, color: atkT.color },
          { k: 'flash', a: Math.min(0.5, (pow - 90) / 80) }
        ]
      : [])
  ];
  const bdown = [...blockers, ...lateB].map(b => ({ k: 'jump', p: b.id, mode: 'down' }));
  if (V && delayed)
    B({
      dur: 280,
      slow: 1,
      acts: [...bdown, { k: 'tech', p: spiker.id, t: 'Delayed Spike' }, { k: 'plabel', p: spiker.id, t: 'Hang time!' }]
    });
  return { hit, bdown };
}

/** The impact zoom on a hard spike. */
function spikeZoom(c, x) {
  const { B, V } = c,
    { tip, pow } = x;
  if (V && !tip && pow >= 90)
    B({ dur: Math.round(35 + (pow - 90) * 1.6), acts: [{ k: 'zoom', amt: Math.min(0.07, 0.02 + (pow - 90) / 900) }] });
}
/** The label over a spike: what beat the block (none on a tip). */
function spikeNote(x) {
  const { tip, elS, quick, back, longB, around, cutS, delayed, bitten, cov, over, seam } = x;
  return tip
    ? null
    : elS
      ? elS.over
        ? 'Over the block!'
        : null
      : delayed
        ? 'Delayed spike!'
        : around && cutS
          ? 'Cut shot!'
          : back
            ? longB
              ? 'Long back attack!'
              : 'Back-row attack!'
            : bitten && cov < 0.35
              ? 'Decoy worked!'
              : over
                ? 'Over the block!'
                : seam
                  ? 'Through the seam!'
                  : around
                    ? 'Around the block!'
                    : cov < 0.1 && quick
                      ? 'Beat the block!'
                      : null;
}

/** 8c. Where the spike lands (around the block → away from it; water / curve → away from the defenders) and its flight time. */
function landingSpot(c, x) {
  const { m, ds, defT } = c,
    { tip, around, b1, bz0, bz1, spZ, elS, blockers, appX, pj, pow } = x;
  const bMean = b1 ? (bz0 + bz1) / 2 : bz0;
  let lz = around
    ? bMean > 0.5
      ? rnd(0.1, 0.35)
      : rnd(0.65, 0.9)
    : R() < 0.5
      ? clamp(spZ + rnd(-0.12, 0.12), 0.1, 0.9)
      : clamp(1 - spZ + rnd(-0.12, 0.12), 0.1, 0.9);
  let lx = sx(ds, tip ? rnd(390, 460) : rnd(170, 400));
  if (elS && elS.far)
    [lx, lz] = elFar(
      m,
      ds,
      defT.P.filter(q => !blockers.includes(q)),
      lx,
      lz,
      elS.far
    );
  // flight time: harder spikes fly faster (about +17% at power 100, +29% at 130), and a hard hit gets to the floor
  // sooner still (HIT_FAST: up to ×1.6 from power 50 to 120)
  const fast = 1 + clamp((pow - 50) / 70, 0, 1) * (HIT_FAST - 1);
  let hdur = tip
    ? 520
    : clamp(
        Math.hypot(lx - appX, (lz - spZ) * Z_UNITS, REACH_H + pj) / (kmh(pow) * (BALL_K + Math.max(0, pow - 60) * 0.00005) * fast),
        95,
        560
      ) * courtScale();
  if (elS) hdur = Math.max(110, hdur * elS.fly);
  return { lx, lz, hdur };
}

/** 8d. Hitting error (never on a tip): into the net or out. Returns { point } for the defense, or nothing. */
/**
 * Delayed Spike, the trade-off (owner, 2026-10-04): hang too long and the ball drops before you swing. Fail chance
 * falls with jump and wit (HANG_FAIL); the ball drops on your side by the net and the best-placed teammate tries to
 * dig it up (a poor pass, the rally goes on) — else the point is lost and the hitter takes an error.
 */
const HANG_FAIL = { base: 0.35, jumpFrom: 60, perJump: 0.008, perWit: 0.4, min: 0.03, max: 0.45 };
function hangFail(c, x) {
  const { m, B, V, atk, ds, da, atkT } = c,
    { spiker, spZ, bdown } = x,
    H = HANG_FAIL,
    p = clamp(H.base - (spiker.jump - H.jumpFrom) * H.perJump - (W(spiker) - 1) * H.perWit, H.min, H.max);
  if (R() >= p) return null;
  const bx = sx(atk, 478),
    bz = clamp(spZ, 0.1, 0.9),
    coverScore = q => effD(q) * 0.65 + q.speed * 0.35 - dist(m.pos[q.id], bx, bz) * 25,
    cvr = atkT.P.filter(q => q !== spiker).reduce((best, q) => (coverScore(q) > coverScore(best) ? q : best)),
    saved = R() < sig(coverScore(cvr) / 14 - 3.2);
  V &&
    B({
      dur: 420,
      acts: [
        ...bdown,
        { k: 'jump', p: spiker.id, mode: 'down' },
        { k: 'ball', to: { x: bx, z: bz, h: saved ? 30 : 0 }, h: 20 },
        { k: 'plabel', p: spiker.id, t: 'Hung too long!' }
      ]
    });
  if (!saved) {
    st(m, spiker, 'err');
    md(m, spiker, -0.08);
    V && B({ dur: 500, acts: [{ k: 'label', t: 'Dropped!', when: 'end', big: 1 }] });
    return { point: ds };
  }
  st(m, cvr, 'dig');
  const a5 = [],
    dv = mustDive(cvr, m.pos[cvr.id], bx - da * 6, bz, 360);
  if (dv) setBusy(m, cvr, c.n + 1);
  mv(m, cvr, bx - da * 6, bz, a5, V);
  V &&
    B({
      dur: 360,
      acts: [
        ...a5,
        { k: 'pose', p: cvr.id, pose: dv ? 'dive' : 'bump' },
        { k: 'ball', to: { p: cvr.id, c: dv ? 'dive' : 'bump' }, h: 40 },
        { k: 'label', t: 'Covered!', when: 'end', big: 1 }
      ]
    });
  return { next: [atk, cvr, 1] };
}
function hittingError(c, x) {
  const { m, B, V, atk, ds } = c,
    { spiker, tip, bad, pow, around, back, longB, hS, elS, hit, bdown, spZ, lz, hdur } = x;
  const errP = Formula.spikeErrorP({ spiker, bad, pow, around, back, longB, hS }) * (elS ? 0.5 : 1);
  if (tip || R() >= errP) return;
  st(m, spiker, 'err');
  const net = R() < Formula.spikeNetShare(hS, longB);
  V &&
    B({
      dur: hdur + 150,
      acts: [
        ...hit,
        ...bdown,
        {
          k: 'ball',
          to: net ? { x: sx(atk, 492), z: spZ, h: 100 } : { x: sx(ds, 18), z: clamp(lz + rnd(-0.3, 0.3), -0.1, 1.1), h: 0 },
          h: net ? 0 : 40,
          trail: pow,
          el: elS ? elS.el : null
        },
        { k: 'label', t: net ? 'Net!' : 'Out!', when: 'end', big: 1 }
      ]
    });
  return { point: ds };
}

/* ---------- your prompts (spec §2.16, T-257): only for m.human's player; the AI flow never reaches a draw here ---------- */

/**
 * 2c. Your prompt while the pass flies to the setter: Call (and Fake at read ≥ READ.fake) when you are a wing / middle of the
 * attacking side. Sets c.callYou / c.fakeYou for the phases after; returns { call, anyway } or null. (Block: blockPrompt.)
 */
function* prompts(c, s) {
  const { m, atkT } = c;
  if (!m.human || !m.read) return null;
  const me = atkT.P.find(p => p.id === m.human);
  if (!me || me === s.setter || (me.role !== 'WS' && me.role !== 'MB')) return null;
  const rd = readOf(m, me),
    options = [{ id: 'call', key: 'E', label: 'Call' }, ...(rd >= READ.fake ? [{ id: 'fake', key: 'R', label: 'Fake' }] : [])],
    pick = yield* ask(m, { kind: 'call', p: me, options, ai: null, read: rd });
  if (pick === 'call') return callPress(c, s, me);
  if (pick === 'fake') return fakePress(c, s, me);
  return null;
}
/** You (m.human, prompts on) when you are one of this attack's blockers, else null. */
const blockYou = (c, x) => (c.m.human && c.m.read ? x.blockers.find(b => b.id === c.m.human) || null : null);
/**
 * 7c. Your block (spec §2.16): the set is up and their hitter runs in. Press = you jump at that moment; the answer is
 * { id: 'block', t } with t = ms of beat time before their contact (the end of the set beat) when you left the floor. Graded
 * against the AI blocker's own take-off lead (x.blkIdeal), the window wider with Jump and Wit: perfect (± READ.blockTol) /
 * good (earlier, up to × READ.blockGood) / early (already coming down). Each grade scales the block (READ.blockCov /
 * blockStuff). No press = the AI's jump (no change). Draws nothing.
 */
function* blockPrompt(c, x) {
  const { m } = c,
    me = x.youBlk;
  if (!me) return;
  x.blkIdeal = (1 - blockT0(x, me)) * setDurOf(x); // the AI blocker leaves the floor this long before contact
  x.blk0 = (m.stat[me.id] || blank()).blk;
  const pick = yield* ask(m, {
    kind: 'block',
    p: me,
    options: [{ id: 'block', key: 'E', label: 'Block' }],
    ai: null,
    ideal: x.blkIdeal
  });
  if (!pick) return;
  const left = pick && typeof pick === 'object' && Number.isFinite(+pick.t) ? +pick.t : x.blkIdeal,
    k = clamp(1 + (me.jump - 50) / 200 + (me.wit - 1) * 0.2, 0.8, 1.4),
    tol = READ.blockTol * k,
    err = left - x.blkIdeal, // > 0: you went up before the ideal moment
    grade = Math.abs(err) <= tol ? 'perfect' : err > 0 && err > tol * READ.blockGood ? 'early' : 'good';
  x.blkGrade = grade;
  x.cov *= READ.blockCov[grade];
  x.stuffK = READ.blockStuff[grade];
  const P = plays(m);
  P.block++;
  P[grade]++;
}
/** You call for the ball: the setter sets you — unless the pass is poor or you are out of position ("Not now!"). */
function callPress(c, s, me) {
  const { m, B, V, qual } = c,
    { setter } = s,
    no = qual <= 1 || busy(m, me, c.n);
  readAdd(m, me, READ.call);
  plays(m).call++;
  if (no) plays(m).refused++;
  else c.callYou = me;
  V &&
    B({
      dur: no ? 520 : 300,
      acts: [
        { k: 'call', p: me.id, t: callLine('set', me, m) },
        ...(no ? [{ k: 'call', p: setter.id, t: callLine('notnow', setter, m) }] : [{ k: 'ev', kind: 'called', p: me.id }])
      ]
    });
  return { call: !no, refused: no };
}
/** You sell a fake: a low-wit setter may set you anyway (a bad set); else the set goes elsewhere and the blocker may bite. */
function fakePress(c, s, me) {
  const { m } = c,
    { setter } = s;
  plays(m).fake++;
  if (setter.wit < READ.anywayWit && R() < READ.anyway[0] - READ.anyway[1] * (setter.wit - 0.5)) {
    plays(m).fakeBad++;
    c.callYou = me;
    return { call: true, anyway: true };
  }
  c.fakeYou = me;
  return { fake: true };
}
/** 6b. Your fake approach: their reading blocker bites (read vs their wit) — a single block on the real hitter. */
function fakeYou(c, x) {
  const { m, B, V, atk, ds, da } = c,
    { B0, MBs, mbZ, quick, spiker } = x,
    me = c.fakeYou,
    rd = readOf(m, me),
    bitten = R() < clamp(READ.bite + READ.biteRead * (rd - READ.fake) - READ.biteWit * (W(B0) - 1), 0.15, 0.85);
  if (bitten) {
    readAdd(m, me, READ.fakeOk);
    plays(m).fakeOk++;
  }
  dr(m, me, 0.02);
  const mid = me.role === 'MB' && MBs.includes(me),
    dz = mid ? mbZ(me) : clamp(HOME[me.slot][1] + (me.slot === 'W0' ? -0.05 : 0.05), 0.1, 0.9),
    fk = [];
  mv(m, me, sx(atk, mid ? 466 : 420), dz, fk, V);
  if (bitten) mv(m, B0, sx(ds, 484), dz, fk, V);
  V &&
    B({
      dur: 600,
      slow: 0.3,
      slowAt: [0.4, 0.7],
      acts: [
        ...fk,
        { k: 'pose', p: me.id, pose: 'spike' },
        { k: 'jump', p: me.id, mode: 'up', peak: jumpPx(me), t0: 0.15, t1: 0.95 },
        ...(bitten
          ? [
              { k: 'pose', p: B0.id, pose: 'block' },
              { k: 'jump', p: B0.id, mode: 'up', peak: jumpPx(B0) * 0.85, t0: 0.35, t1: 1 }
            ]
          : []),
        { k: 'ghost', to: { x: sx(atk, mid ? 466 : 420) + da * 12, z: dz, h: REACH_H + jumpPx(me) } },
        { k: 'label', t: 'Fake!', dy: 60, set: 1, big: 1 },
        { k: 'ev', kind: bitten ? 'fake_ok' : 'fake_fail', p: me.id, q: B0.id } // the story's event (director, spec §2.18)
      ]
    });
  return { quick, spiker, bitten, fakeDecoy: me };
}
/** A set to you raises your read (the second in a row more); the setter's sets per hitter when you set (T-258). */
function readSet(c, spiker) {
  const { m, atk } = c;
  if (!readOn(m, spiker)) return;
  const last = m.readLast && m.readLast[atk];
  readAdd(m, spiker, last === spiker.id ? READ.set2 : READ.set);
  if (c.callYou === spiker) plays(m).callSet++;
  (m.readLast || (m.readLast = {}))[atk] = spiker.id;
}
/** After your attack / your committed block: kills raise the read; tallies for the result card; a fake that scored = 'fake'. */
function readAttack(c, x, k0, bk0) {
  const { m } = c,
    me = x.spiker;
  if (readOn(m, me)) {
    plays(m).att++;
    if (sumBlk(m, c.defT) > bk0) plays(m).stuffed++;
    const kill = (m.stat[me.id] || blank()).k > k0;
    if (kill) {
      readAdd(m, me, READ.kill);
      plays(m).attK++;
    }
    if (kill && c.callYou === me) plays(m).callK++;
  }
  if (c.fakeYou && x.bitten && (m.stat[me.id] || blank()).k > k0) m.lastPlay = 'fake'; // the zone breaker reads it
  if (x.blkGrade && (m.stat[x.youBlk.id] || blank()).blk > x.blk0) plays(m).stuff++;
}
