// Approach and block formation (phase 7a of a possession, called by rally(), engine/rally.js): where the hitter attacks
// from, who blocks and how much of the lane and height the block covers. Same conventions as engine/rally.js.

/** Closest two blockers stand side by side along the net (z units: 0.06 ≈ 0.7 m, shoulder to shoulder). */
const BLOCK_GAP = 0.06;
/** How well a blocker reads the attack (0–1): wit and speed. */
const readQ = b => clamp((0.5 * (W(b) - 0.4)) / 1.2 + (0.5 * (b.speed - 40)) / 55, 0, 1);

/**
 * 7a. Approach and block formation: where the hitter attacks from (slide, quick, wing, back row, long back attack),
 * who blocks (b0, maybe a double with b1) and how much of the attack lane and height the block covers (cov),
 * after the techniques that beat or read it. Also: seam between two blockers, hitting over the block.
 */
function formBlock(c, x) {
  // in steps (same draws, same order): the approach and the defence setting → who blocks → collisions and moves → coverage
  const f = blockApproach(c, x);
  Object.assign(f, blockPick(c, x, f));
  Object.assign(f, blockMoves(c, x, f));
  const out = blockCoverage(c, x, f);
  out.cov *= readCov(c, x, f); // your read and your committed block (spec §2.16)
  out.readWarn = f.readWarn;
  return out;
}
/** Their best blocker (Defense 0.55 + Jump 0.45) of the front row — the one who takes your lane when your read is high. */
const bestBlocker = DF => DF.reduce((a, p) => (p.def * 0.55 + p.jump * 0.45 > a.def * 0.55 + a.jump * 0.45 ? p : a), DF[0]);
/** Coverage factor from your read (spec §2.16: +10 % at READ.shift, +20 % at READ.fake) and your committed block. */
function readCov(c, x, f) {
  const rd = readOf(c.m, x.spiker),
    mine = f.mine;
  let k = rd >= READ.fake ? 1 + READ.cov[1] : rd >= READ.shift ? 1 + READ.cov[0] : 1;
  if (mine && mine.inLane) k *= 1 + READ.commit;
  if (mine && mine.late) k *= 1 + READ.late;
  return k;
}
/**
 * Your committed block (c.commit): in your lane = you are the main blocker; crossed = you jumped somewhere else, so you
 * are not in this block (your lane is open). Plain data from the positions, no draws.
 */
function commitLane(c, f, natural) {
  const me = c.commit && c.commit.p;
  if (!me) return null;
  const inLane = natural === me || Math.abs(f.startZ(me) - f.spZ) <= f.reach(me) * 1.3;
  if (!inLane) plays(c.m).crossed++;
  return { me, inLane, late: c.commit.late };
}
/** Where the hitter attacks from (slide, quick, wing, back row, long back attack), the lane, and the defence setting. */
function blockApproach(c, x) {
  const { m, front, n, atk, ds } = c,
    { setZ, quick, spiker, bad, callers, slide, mbZ } = x;
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
  const dset = m.dset[ds] || 'read',
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
  return { back, longB, spZ, lane, pipe, appX, tAv, reach, dset, commit, bunch, midAtk, startZ, byLane };
}
/** Who blocks: b0 (the middle when they can get there, the pin-side defender, the swinging far blocker) and maybe b1. */
function blockPick(c, x, f) {
  const { defT } = c,
    { quick, sync, DF, B0, bitten } = x,
    { spZ, reach, commit, bunch, midAtk, startZ, byLane } = f;
  // who blocks: the pin-side defender sets the edge on a wing attack; the middle takes a quick / pipe / middle ball;
  // a middle who bit on the fake is gone — the far defender swings across late
  const others = DF.filter(p => p !== B0),
    swing = bitten && others.length > 0;
  // the front-row middle is the main blocker whenever they can get to the hitter's spot (they wait at the net; the wings
  // stand deeper): the other defender only fills the gap beside them. A pin too far out for the middle falls to the pin-side defender.
  const mb = DF.find(p => p.role === 'MB'),
    mbCan = mb && Math.abs(startZ(mb) - spZ) <= reach(mb) * 1.3;
  let b0 = swing ? byLane(others, spZ) : !DF.length ? B0 : midAtk ? mb || byLane(DF, spZ) : mbCan ? mb : byLane(DF, spZ);
  // your read (spec §2.16): their best blocker cheats toward your lane — always in the block, early; your committed block:
  // you in your lane, out of it if you crossed
  const rd = readOf(c.m, x.spiker),
    readShift = !swing && DF.length > 1 && rd >= READ.shift,
    best = readShift ? bestBlocker(DF) : null,
    mine = commitLane(c, f, b0);
  if (mine && mine.inLane) b0 = mine.me;
  else if (mine && b0 === mine.me) b0 = DF.find(p => p !== mine.me) || b0;
  const readWarn = readShift && !c.m.readWarn; // a teammate warns once each time your read climbs past READ.shift
  if (readOn(c.m, x.spiker)) c.m.readWarn = readOf(c.m, x.spiker) >= READ.shift;
  const p0z = startZ(b0),
    r0 =
      reach(b0) *
      (swing ? BLOCK.swingReach : bitten ? 0.3 : commit && quick ? BLOCK.commitReach : 1) * // Commit: the blocker on a quick is already up
      (best === b0 || (mine && mine.inLane && !mine.late) ? READ.reach : 1), // they read you / you committed: up early
    bz0 = clamp(p0z + clamp(spZ - p0z, -r0, r0), 0.05, 0.95),
    late0 = Math.abs(spZ - p0z) > r0;
  let b1 = null,
    bz1 = 0,
    late1 = false;
  // the second blocker closes in beside the first on the court-inside side — if the roll passes and they can get there.
  // Sync attacks leave no time for a double; quicks only get one when the defence is set for them (Commit / Bunch).
  // Your read: they key on you — the best blocker joins (or a second one, when the best is already up), reach × READ.reach.
  const cand =
    best && best !== b0 && !(mine && best === mine.me) ? best : DF.find(p => p !== b0 && !(mine && !mine.inLane && p === mine.me));
  if (cand && !sync && !swing && (!quick || commit || bunch)) {
    const roll = R() < defT.S.dbl * (0.6 + 0.8 * readQ(cand)),
      p1z = startZ(cand),
      inward = bz0 < 0.5 ? 1 : -1,
      t1 = clamp(bz0 + inward * BLOCK_GAP, 0.05, 0.95);
    if (
      (roll || (bunch && midAtk) || (commit && quick) || readShift) &&
      Math.abs(t1 - p1z) <= reach(cand) * (commit && quick ? BLOCK.commitReach : 1.3) * (readShift ? READ.reach : 1)
    ) {
      b1 = cand;
      bz1 = t1;
      // two bodies can't take off from one spot
      if (Math.abs(bz1 - bz0) < BLOCK_GAP) bz1 = clamp(bz0 - inward * BLOCK_GAP, 0.05, 0.95);
    }
  }
  const blockers = b1 ? [b0, b1] : [b0];
  return { others, swing, mb, mbCan, b0, p0z, r0, bz0, late0, b1, bz1, late1, blockers, mine, readWarn };
}
/** The late front-row jumpers (display) and the moves to the net. */
function blockMoves(c, x, f) {
  const { m, V, front, n, atk, ds, defT } = c,
    { quick, spiker } = x,
    { longB, spZ, appX, b0, bz0, b1, bz1, blockers } = f;
  // every other front-row player still goes up (late, off-position) even when they're not part of the block —
  // nobody at the net just watches. Display only: coverage and positions in the engine are unchanged.
  const lateB = V ? defT.P.filter(p => front(ds, p) && !blockers.includes(p) && !busy(m, p, n)) : [],
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
  return { lateB, taken, lateA, a1 };
}
/** Coverage: lane × height per blocker, reading and the defence setting, techniques; seam and over. */
function blockCoverage(c, x, f) {
  const { m, n } = c,
    { setter, quick, slide, sync, freak, readBonus } = x,
    { back, longB, spZ, lane, pipe, appX, b0, bz0, late0, b1, bz1, late1, blockers, lateB, lateA, a1 } = f;
  const { pj, hS, c0, c1 } = blockHands(c, x, f);
  let cov = Math.max(c0.c, c1.c) + (c0.c > 0.4 && c1.c > 0.4 ? 0.25 : 0) + readBonus;
  // techniques that beat (or read) the block
  const readB = quick && hasTech(b0, 'readblk') && W(b0) >= 1.1,
    pipeCombo = back && hasTech(setter, 'pipecombo') && (m.pts[0] + m.pts[1] + n) % 2 === 0; // planned play, not every time
  if (readB) techFire(m, b0, 'readblk');
  if (pipeCombo) techFire(m, setter, 'pipecombo');
  if (freak) cov *= readB ? 0.6 : 0.25;
  else if (readB) cov += 0.3;
  if (slide) cov *= 0.6;
  if (sync) cov *= 0.8;
  if (pipeCombo) cov *= 0.6;
  if (longB) cov *= 0.55;
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
/** Each blocker's hands: lane × height coverage, scaled by reading and the defence setting. */
function blockHands(c, x, f) {
  const { quick, spiker, bitten } = x,
    { commit, bunch, midAtk, swing, b0, bz0, late0, b1, bz1, late1, spZ } = f;
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
  if (swing) c0.c *= BLOCK.swingCov;
  else if (bitten) c0.c *= 0.5;
  return { pj, hS, c0, c1 };
}
