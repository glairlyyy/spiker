// Rally loop: possession after possession until a point is decided.
// Serve/receive live in engine/serve.js; the phases before the attack in engine/rally-phases.js, the attack itself
// (fake set, approach and block formation, set, spike, hitting error) below, and the block and dig in
// engine/rally-defense.js. Same return convention as engine/rally-phases.js.

/** Possessions after which everyone starts to tire (stamina drain, long-rally element gauges). */
const LONG_RALLY = 6;
/** Closest two blockers stand side by side along the net (z units: 0.06 ≈ 0.7 m, shoulder to shoulder). */
const BLOCK_GAP = 0.06;
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
 *   8. spike power, cut-ins, shot choice (around / seam / over), landing spot, hitting error
 *                                                    spikePower, spikeActs, landingSpot, hittingError
 *   9. block: block break → stuff (kill block, or block cover dig) → touch → tool
 *  10. dig or kill; a dig hands possession to the other side
 * c = the possession context (atkT / defT = attacking / defending team; V = record animation beats via B()).
 * x = the attack context: the values of phases 2–5, filled in by each attack phase and read by block() and dig().
 */
function rally(m, B, V, atk, pas, qual, scr = null) {
  const front = (side, p) => {
    const i = rotOrder(m.t[side], m.rot[side]).indexOf(p);
    return i === 1 || i === 2;
  };
  for (let n = 1; ; n++) {
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
    r = scr ? null : setterDump(c, s);
    if (r) {
      if (r.point != null) return r.point;
      [atk, pas, qual, scr = null] = r.next;
      continue;
    }
    const h = scr ? { sq2: 'bad', bumpSet: true } : setHands(c, s);
    if (h.point != null) return h.point;
    const a = chooseAttack(c, s, h);
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
    Object.assign(x, setBeat(c, x));
    if (x.collide && x.collide.net) {
      // the two blockers hit the net together: a fault, point to the attackers (no attack contact follows)
      V &&
        B({
          dur: 900,
          acts: [
            { k: 'label', t: 'Net fault', when: 'end', big: 1 },
            { k: 'log', t: 'Net fault — block collision', c: 'pt' }
          ]
        });
      return atk;
    }
    Object.assign(x, spikePower(c, x));
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
      fin = () => tallyAttack(m, atk, x, k0, bk0);
    r = hittingError(c, x);
    if (r) {
      fin();
      return r.point;
    }
    // ---- 9–10: block, then dig or kill ----
    const bl = block(c, x);
    if (x.soloLog && bl.point === ds) x.soloLog.ok = true; // the solo block stuffed it
    if (bl.point != null) {
      fin();
      return bl.point;
    }
    if (bl.next) {
      fin();
      [atk, pas, qual, scr = null] = bl.next;
      continue;
    }
    r = dig(c, x, bl);
    fin();
    if (r.point != null) return r.point;
    [atk, pas, qual, scr = null] = r.next;
  }
}

/** How well a blocker reads the attack (0–1): wit and speed. */
const readQ = b => clamp((0.5 * (W(b) - 0.4)) / 1.2 + (0.5 * (b.speed - 40)) / 55, 0, 1);
/** Engine-only tally of one attack (no randoms): by kind (quick / middle or pipe / pins) and whether the hitter scored. */
const sumBlk = (m, t) => t.P.reduce((n, p) => n + (m.stat[p.id] ? m.stat[p.id].blk : 0), 0);
function tallyAttack(m, side, x, k0, bk0) {
  const a = m.att[side],
    kind = x.quick ? 'q' : x.pipe || x.lane === 'M' ? 'mid' : 'pin',
    kill = (m.stat[x.spiker.id] || blank()).k > k0;
  if (x.heroLog) x.heroLog.ok = kill;
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
  if (
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
            { k: 'label', t: 'Fake set!', dy: 60, set: 1, big: 1 },
            {
              k: 'log',
              t: `Multi-attack! ${decoy.name} is up for the kill... but ${setter.name} sets ${spiker.name}${bitten ? ` — ${db.name} bit on the fake` : ''}`
            }
          ]
        });
    }
  }
  return { quick, spiker, bitten, fakeDecoy };
}

/**
 * 7a. Approach and block formation: where the hitter attacks from (slide, quick, wing, back row, long back attack),
 * who blocks (b0, maybe a double with b1) and how much of the attack lane and height the block covers (cov),
 * after the techniques that beat or read it. Also: seam between two blockers, hitting over the block.
 */
function formBlock(c, x) {
  const { m, V, front, n, atk, ds, defT } = c,
    { setter, setZ, quick, spiker, bad, callers, slide, sync, freak, mbZ, DF, B0, bitten, readBonus } = x;
  const back = !front(atk, spiker);
  // Long back attack: a high-flying back-row wing who called for it runs back to the end line, attacks from deep
  // and broad-jumps in; the ball crosses far above the block. (No extra randomness: picked from rolled values.)
  const longB =
    back &&
    !quick &&
    !bad &&
    spiker.role === 'WS' &&
    callers.includes(spiker) &&
    jumpPx(spiker) >= 92 &&
    Math.round(spiker.jump * 7 + setZ * 1000 + n * 13) % 10 < 4;
  const spZ = slide
    ? clamp(setZ + (setZ < 0.5 ? 0.32 : -0.32), 0.1, 0.9) // slide: runs behind the setter
    : quick
      ? mbZ(spiker)
      : clamp(HOME[spiker.slot][1] + (spiker.slot === 'W0' ? -0.05 : spiker.slot === 'W1' ? 0.05 : 0) + rnd(-0.06, 0.06), 0.1, 0.9);
  const lane = spZ < BLOCK.laneL ? 'L' : spZ > BLOCK.laneR ? 'R' : 'M',
    pipe = back && !longB && lane === 'M';
  const appX = sx(atk, slide ? 455 : quick ? 466 : longB ? 215 : back ? 325 : 420);
  // how far a blocker can shift along the net before the hit (time available × speed)
  const tAv = (quick ? 0.3 : bad ? 1.05 : 0.8) + (back ? 0.15 : 0) + (longB ? 0.1 : 0),
    reach = b => ((b.speed / 100) * tAv * 0.6) / courtScale();
  // defence setting (see DEFSETS): Bunch starts both front-row defenders near the middle (they drift there while the ball is set, as far as their speed allows)
  // ego (spec §2.12): a front-row blocker who wants to be the wall ignores the defence setting and blocks alone
  const soloP = DF.find(p => egoRoll(m, p, 'solo')) || null,
    dset = soloP ? 'read' : m.dset[ds] || 'read',
    commit = dset === 'commit',
    bunch = dset === 'bunch',
    midAtk = quick || pipe || lane === 'M',
    startZ = p => {
      const z = m.pos[p.id].z;
      if (!bunch) return z;
      const t = Math.abs(z - BLOCK.bunchStartZ[0]) <= Math.abs(z - BLOCK.bunchStartZ[1]) ? BLOCK.bunchStartZ[0] : BLOCK.bunchStartZ[1];
      return z + clamp(t - z, -reach(p), reach(p));
    },
    byLane = (list, z) => list.reduce((a, p) => (Math.abs(startZ(p) - z) < Math.abs(startZ(a) - z) ? p : a), list[0]);
  // who blocks: the pin-side defender sets the edge on a wing attack; the middle takes a quick / pipe / middle ball;
  // a middle who bit on the fake is gone — the far defender swings across late
  const others = DF.filter(p => p !== B0),
    swing = bitten && others.length > 0;
  // the front-row middle is the main blocker whenever they can get to the hitter's spot (they wait at the net; the wings
  // stand deeper): the other defender only fills the gap beside them. A pin too far out for the middle falls to the pin-side defender.
  const mb = DF.find(p => p.role === 'MB'),
    mbCan = mb && Math.abs(startZ(mb) - spZ) <= reach(mb) * 1.3;
  const b0 = soloP || (swing ? byLane(others, spZ) : !DF.length ? B0 : midAtk ? mb || byLane(DF, spZ) : mbCan ? mb : byLane(DF, spZ)),
    p0z = startZ(b0),
    r0 = reach(b0) * (swing ? BLOCK.swingReach : bitten ? 0.3 : commit && quick ? BLOCK.commitReach : 1), // Commit: the blocker on a quick is already up
    bz0 = clamp(p0z + clamp(spZ - p0z, -r0, r0), 0.05, 0.95),
    late0 = Math.abs(spZ - p0z) > r0;
  let b1 = null,
    bz1 = 0,
    late1 = false;
  // the second blocker closes in beside the first on the court-inside side — if the roll passes and they can get there.
  // Sync attacks leave no time for a double; quicks only get one when the defence is set for them (Commit / Bunch).
  const cand = DF.find(p => p !== b0);
  if (cand && !sync && !swing && !soloP && (!quick || commit || bunch)) {
    const roll = R() < defT.S.dbl * (0.6 + 0.8 * readQ(cand)),
      p1z = startZ(cand),
      inward = bz0 < 0.5 ? 1 : -1,
      t1 = clamp(bz0 + inward * BLOCK_GAP, 0.05, 0.95);
    if (
      (roll || (bunch && midAtk) || (commit && quick)) &&
      Math.abs(t1 - p1z) <= reach(cand) * (commit && quick ? BLOCK.commitReach : 1.3)
    ) {
      b1 = cand;
      bz1 = t1;
      // two bodies can't take off from one spot
      if (Math.abs(bz1 - bz0) < BLOCK_GAP) bz1 = clamp(bz0 - inward * BLOCK_GAP, 0.05, 0.95);
    }
  }
  const blockers = b1 ? [b0, b1] : [b0];
  // block collision (T-069): the other front-row defender also commits to the same ball — both blocks cancel (no block touch),
  // or in `solo.net` of cases the bodies hit the net: a fault. Rolled only when a solo block happens and there is a partner.
  const partner = soloP ? DF.find(p => p !== soloP) : null;
  let collide = null;
  if (partner && EGO.solo.collide > 0 && R() < EGO.solo.collide * (1 - maturity(partner))) {
    collide = { a: soloP, b: partner, net: R() < EGO.solo.net };
  }
  // every other front-row player still goes up (late, off-position) even when they're not part of the block —
  // nobody at the net just watches. Display only: coverage and positions in the engine are unchanged.
  const lateB = V ? defT.P.filter(p => front(ds, p) && !blockers.includes(p) && p !== (collide && collide.b) && !busy(m, p, n)) : [],
    taken = b1 ? [bz0, bz1] : [bz0], // spots at the net already taken: late blockers go up beside them, not inside them
    lateA = lateB.flatMap(p => {
      const q = m.pos[p.id];
      let z = clamp(q.z + clamp(spZ - q.z, -0.16, 0.16), 0.05, 0.95);
      for (let i = 0; i < 3; i++) {
        const hit = taken.find(t => Math.abs(z - t) < BLOCK_GAP);
        if (hit == null) break;
        z = clamp(hit + (q.z >= hit ? 1 : -1) * BLOCK_GAP, 0.05, 0.95);
      }
      taken.push(z);
      return [
        { k: 'slide', p: p.id, x: sx(ds, 482), z },
        { k: 'pose', p: p.id, pose: 'block' },
        { k: 'jump', p: p.id, mode: 'up', t0: quick ? 0.45 : 0.74, t1: 1, peak: jumpPx(p) * 0.7 }
      ];
    });
  for (const b of blockers) dr(m, b, 0.025);
  const a1 = [];
  mv(m, spiker, appX, spZ, a1, V);
  if (longB && V) a1[a1.length - 1].via = { x: sx(atk, 92), z: spZ, at: 0.38 }; // back to the end line, then the run-up
  mv(m, b0, sx(ds, 484), bz0, a1, V);
  if (b1) mv(m, b1, sx(ds, 480), bz1, a1, V);
  // the collision: the partner arrives at the same spot, 0.3 m beside the solo blocker (they bounce apart)
  if (collide) mv(m, partner, sx(ds, 484), clamp(bz0 + (bz0 < 0.5 ? 1 : -1) * (0.3 / UNIT_M.z), 0.05, 0.95), a1, V);
  const pj = jumpPx(spiker),
    hS = REACH_H + pj; // the hitter's contact height
  // one blocker's coverage: lane (distance along the net) × height (hands against the contact point)
  const cvf = (b, bz) => {
    const g = Math.abs(bz - spZ),
      cl = clamp(1 - (g * courtScale()) / 0.2, 0, 1), // a block covers a smaller share of a wider net
      hB = 124 + jumpPx(b) * 0.85,
      hf = clamp(1 - (hS - hB - 10) / 55, 0.15, 1.2);
    return { c: cl * hf, raw: cl, hB };
  };
  const c0 = cvf(b0, bz0),
    c1 = b1 ? cvf(b1, bz1) : { c: 0, raw: 0, hB: 0 };
  // reading and the defence setting scale each blocker's coverage: arriving late, split hands, a bitten or swinging
  // middle, Commit's middle (up early on a quick, lost on anything else), Bunch (strong in the middle, pins open)
  const scale = (cv, b, late) => {
    if (!cv.c) return;
    if (late) cv.c *= BLOCK.lateCov;
    if (readQ(b) < 0.35) cv.c *= BLOCK.splitCov;
    if (commit && quick && (b.role === 'MB' || b === b0)) cv.c *= BLOCK.commitQuick;
    else if (commit && b.role === 'MB') cv.c *= BLOCK.commitMiss;
    if (bunch) cv.c *= midAtk ? BLOCK.bunchMid : BLOCK.bunchPin;
    cv.c = Math.min(cv.c, 1.2); // the height factor's own ceiling: a setting can't turn a wall into a block break
  };
  scale(c0, b0, late0);
  scale(c1, b1, late1);
  // the solo blocker's gamble: a good read makes a wall, a bad one leaves the lane open (maturity cuts the bad side)
  const soloLog = soloP ? { act: 'solo', p: soloP.id, ok: false, mate: (DF.find(p => p !== soloP) || {}).id } : null;
  if (soloP) {
    c0.c *= 1 + EGO.solo.gain * readQ(soloP) - EGO.solo.loss * (1 - maturity(soloP));
    m.egoLog.push(soloLog);
    if (collide) m.egoLog.push({ act: 'collide', p: soloP.id, mate: collide.b.id, net: collide.net });
  }
  if (swing) c0.c *= BLOCK.swingCov;
  else if (bitten) c0.c *= 0.5;
  let cov = Math.max(c0.c, c1.c) + (c0.c > 0.4 && c1.c > 0.4 ? 0.25 : 0) + readBonus;
  // techniques that beat (or read) the block
  const readB = quick && hasTech(b0, 'readblk') && W(b0) >= 1.1,
    pipeCombo = back && hasTech(setter, 'pipecombo') && (m.pts[0] + m.pts[1] + n) % 2 === 0; // planned play, not every time
  if (freak) cov *= readB ? 0.6 : 0.25;
  else if (readB) cov += 0.3;
  if (slide) cov *= 0.6;
  if (sync) cov *= 0.8;
  if (pipeCombo) cov *= 0.6;
  if (longB) cov *= 0.55;
  if (collide) cov = 0; // both blocks cancel: no block touch, the attack meets an empty net
  const setTech = freak
    ? 'Freak Quick'
    : slide
      ? '2nd-tempo Slide'
      : longB
        ? 'Long Back Attack'
        : sync
          ? 'Synchronized Attack'
          : pipeCombo
            ? 'Pipe Combo'
            : null;
  const seam = b1 && c0.raw > 0.2 && c1.raw > 0.2 && Math.abs(bz0 - bz1) > 0.17 && R() < 0.5;
  const over = hS - Math.max(c0.hB, c1.hB) > 38 && Math.max(c0.raw, c1.raw) > 0.3;
  return {
    back,
    longB,
    lane,
    pipe,
    late: [late0, late1],
    spZ,
    appX,
    b0,
    b1,
    bz0,
    bz1,
    blockers,
    soloP,
    soloLog,
    collide,
    lateB,
    lateA,
    a1,
    pj,
    hS,
    c0,
    c1,
    cov,
    readB,
    setTech,
    seam,
    over
  };
}

/**
 * 7b. The set: ball calls, a setter–hitter combo, the element source, the staged hype / defense-read scenes and the
 * set beat itself. `mark` = the beat index right after the set, where block() may insert a spike cut.
 */
function setBeat(c, x) {
  const { m, B, V, front, atk, ds, atkT, defT, qual } = c,
    { setter, spiker, quick, bad, back, longB, freak, slide, sync, pool, callers, fakeDecoy, bitten, sq2, bumpSet } = x,
    { setZ, spZ, b0, bz0, blockers, lateA, a1, pj, cov, readB, setTech, egoCall, soloP, collide } = x;
  // a bad set that stays hittable still reaches the hitter's hand (it just hits weaker: setMul in attack());
  // the two draws stay so the random sequence is unchanged
  if (bad) {
    rnd(25, 50);
    rnd(18, 34);
  }
  // set direction relative to the setter: quick, front set, or back set (hitter behind the setter)
  const setDir = quick ? 'quick' : spZ > setZ + 0.08 ? 'back' : 'front';
  // a collision cuts both jumps short: a hop that comes down at ~40% of the normal hang
  const colJump = b => {
    const t0 = quick ? 0.3 : 0.6;
    return { k: 'jump', p: b.id, mode: 'hop', t0, t1: t0 + 0.4 * (1 - t0), peak: jumpPx(b) * 0.5 };
  };
  // ball calls while the set is in the air: the hitter asks for it, other confident hitters shout as decoys
  const setCalls = [];
  if (V && !bad) {
    const cf = p => confidence(p, m, atk);
    if (back && callers.includes(spiker)) setCalls.push({ k: 'call', p: spiker.id, t: callLine(longB ? 'long' : 'back', spiker, m) });
    else if (!quick && cf(spiker) >= 82) setCalls.push({ k: 'call', p: spiker.id, t: callLine(m.zone[atk] ? 'zone' : 'set', spiker, m) });
    const other = pool.find(p => p !== spiker && p !== fakeDecoy && cf(p) >= 88 && (front(atk, p) || callers.includes(p)));
    if (other) setCalls.push({ k: 'call', p: other.id, t: callLine(callers.includes(other) ? 'back' : 'decoy', other, m), soft: 1 });
  }
  if (V && egoCall)
    setCalls.push(
      { k: 'call', p: egoCall.id, t: callLine('ego', egoCall, m) },
      { k: 'log', t: `${egoCall.name} demands the set — ${setter.name} gives in`, c: 'set' }
    );
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
      dur: freak ? 330 : quick ? 430 : bad ? 900 : longB ? 1150 : 800,
      // attack scene: the set after it starts in slow motion and snaps to full speed for the hit;
      // defense read: normal set, slow motion as the hitter takes off (the scene cuts in at the top of the jump)
      ...(hype && !m.hypeDef ? { sceneSlow: hype } : read ? { slow: 1, slowAt: [0.55, 1], hypeSlow: read } : {}),
      acts: [
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
        ...blockers.map(b =>
          collide
            ? colJump(b) // the collision: up together, down early
            : {
                k: 'jump',
                p: b.id,
                mode: b === b0 && bitten && fakeDecoy ? 'reup' : 'up',
                t0: b === b0 && bitten ? 0.84 : quick ? 0.3 : 0.6,
                t1: 1,
                peak: jumpPx(b) * (b === b0 && bitten ? 0.45 : 0.85)
              }
        ),
        ...(collide ? [colJump(collide.b)] : []),
        { k: 'pose', p: spiker.id, pose: 'spike' },
        { k: 'spkstyle', p: spiker.id, st: quick ? 'quick' : back ? 'pipe' : 'normal' },
        // camera: slow push-in on the contest above the net when a real block is up
        ...(cov > 0.3 && !bad ? [{ k: 'cam', amt: 0.32, x: NETX, z: (spZ + bz0) / 2, h: 150, hold: 1500, t0: 0.45 }] : []),
        ...blockers.map(b => ({ k: 'pose', p: b.id, pose: collide ? 'bump' : 'block' })), // a collision staggers them
        ...(collide
          ? [
              { k: 'pose', p: collide.b.id, pose: 'bump' },
              {
                k: 'plabel',
                p: collide.a.id,
                p2: collide.b.id,
                t: collide.net ? 'BLOCK COLLISION · NET' : 'BLOCK COLLISION',
                v: collide.net ? 'err' : 'warn'
              },
              { k: 'log', t: `${collide.a.name} and ${collide.b.name} both go up for the block — they collide!`, c: 'err' }
            ]
          : []),
        ...(soloP && !collide ? [{ k: 'plabel', p: soloP.id, t: 'SOLO!' }] : []),
        ...lateA,
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
            : []),
        {
          k: 'log',
          t: quick
            ? `${setter.name} fires a quick to ${spiker.name}`
            : `${setter.name} ${bumpSet ? 'bump-sets' : setDir === 'back' ? 'back-sets' : 'sets'} ${spiker.name}${spiker.role === 'S' ? ' — setter-hitter attack!' : ''}${longB ? ' deep for a long back-row attack from the end line' : back ? ' for a back-row attack' : ''}${bad ? ' — but it is off target' : ''}`
        }
      ]
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
  // ego (spec §2.12): on a bad set an ego hitter swings full power instead of rolling or tipping it
  const hero = bad && egoRoll(m, spiker, 'swing'),
    heroLog = hero ? { act: 'swing', p: spiker.id, ok: false } : null;
  if (hero) m.egoLog.push(heroLog);
  const setMul = { perfect: 1.12, good: 1, bad: hero ? EGO.swing.pow : 0.72 }[sq2];
  const tip = bad && !elSrc && R() < 0.35 && !hero;
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
    // a blocker at least as sharp as the hitter reads the cut and keeps part of the block on it
    cov *= (cutS ? 0.35 : 0.45) + (W(b0) >= W(spiker) ? 0.2 : 0);
  }
  // Delayed Spike: hang in the air until the blockers come down
  const delayed = !tip && !quick && !around && cov > 0.4 && hasTech(spiker, 'delay') && R() < 0.35;
  if (delayed) cov *= 0.4;
  if (seam) cov *= 0.45;
  if (elS) cov *= elS.cov;
  if (V && (tip || cov <= BLOCK_MIN_COV)) dropDefScene(m); // no block attempt: the defender's scene lines go (block() uses the same test)
  const tier = tip ? 'tip' : pow >= 100 ? 'ult' : pow >= 80 ? 'heavy' : pow >= 58 ? 'hard' : 'soft';
  return { tip, pow, elS, el: elS ? elS.el : null, around, cutS, delayed, cov, tier, hero, heroLog };
}

/**
 * 8b. The spike's presentation (no random draws): element / combo / star cut-ins, the impact zoom, and the hit acts
 * (`hit`) and blockers coming down (`bdown`) that the outcome beat plays with.
 */
function spikeActs(c, x) {
  const { B, V, da, atkT } = c,
    { setter, spiker, tip, pow, elS, elSrc, combo, quick, back, longB, around, cutS, delayed, bitten, cov, over, seam } = x,
    { appX, spZ, blockers, lateB } = x;
  if (V && elS)
    B({
      dur: 1600,
      cut: 1,
      acts: elS.pair
        ? [
            {
              k: 'combo',
              p1: setter.id,
              p2: spiker.id,
              title: elS.pair,
              sub: `${ENAME[setter.el]} × ${ENAME[elS.el]}  ·  Power ${Math.round(pow)}`,
              el: elS.el
            },
            { k: 'log', t: `ELEMENT COMBO! ${setter.name} and ${spiker.name} unleash ${elS.pair}`, c: 'set' }
          ]
        : [
            {
              k: 'cut',
              p: elSrc.id,
              el: elS.el,
              title: elS.name,
              sub: `${ENAME[elS.el]} · ${TWIST[elS.tw].name}${elS.viaSet ? ` set for ${spiker.name}` : ''}  ·  Power ${Math.round(pow)}${elS.res ? `  ·  resisted by ${elS.res.name}` : ''}`
            },
            {
              k: 'log',
              t: elS.viaSet
                ? `ELEMENT SET! ${setter.name} pours ${elS.name} (${ENAME[elS.el]}) into the set for ${spiker.name}${elS.res ? ` — ${elS.res.name}'s ${ENAME[elS.res.el]} resists it` : ''}`
                : `ELEMENT SPIKE! ${spiker.name} unleashes ${elS.name} (${ENAME[elS.el]})${elS.res ? ` — ${elS.res.name}'s ${ENAME[elS.res.el]} resists it` : ''}`,
              c: 'set'
            }
          ]
    });
  else if (V && !tip && combo)
    B({
      dur: 1700,
      cut: 1,
      acts: [
        { k: 'combo', p1: setter.id, p2: spiker.id, title: COMBO[atkT.sk], sub: `Two-star combo  ·  Power ${Math.round(pow)}` },
        { k: 'log', t: `COMBO! ${setter.name} and ${spiker.name} unleash ${COMBO[atkT.sk]}`, c: 'set' }
      ]
    });
  else if (V && !tip && pow >= 100 && (spiker.star || pow >= 118))
    B({
      dur: 1300,
      cut: 1,
      acts: [{ k: 'cut', p: spiker.id, title: spiker.move, sub: `Power ${Math.round(pow)}  ·  Vertical ${jumpCm(spiker)} cm` }]
    });
  if (V && !tip && pow >= 90)
    B({ dur: Math.round(35 + (pow - 90) * 1.6), acts: [{ k: 'zoom', amt: Math.min(0.07, 0.02 + (pow - 90) / 900) }] });
  const note = tip
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
    ...(x.hero ? [{ k: 'plabel', p: spiker.id, t: 'ALL ME!' }] : []),
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
function hittingError(c, x) {
  const { m, B, V, atk, ds } = c,
    { spiker, tip, bad, pow, around, back, longB, hS, elS, hit, bdown, spZ, lz, hdur } = x;
  const errP =
    Formula.spikeErrorP({ spiker, bad, pow, around, back, longB, hS }) *
    (elS ? 0.5 : 1) *
    (x.hero ? 1 + EGO.swing.err * (1 - maturity(spiker)) : 1);
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
        { k: 'label', t: net ? 'Net!' : 'Out!', when: 'end', big: 1 },
        { k: 'log', t: `${spiker.name} ${net ? 'hits it into the net' : 'sends it out'}`, c: 'err' }
      ]
    });
  return { point: ds };
}
