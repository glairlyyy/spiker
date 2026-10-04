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
  if (partner && EGO.solo.collide > 0 && R() < EGO.solo.collide * (1 - egoOf(partner).hold)) {
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
  // the solo blocker's gamble: a good read makes a wall, a bad one leaves the lane open (the personality's err sets the bad side)
  const soloLog = soloP ? { act: 'solo', p: soloP.id, ok: false, mate: (DF.find(p => p !== soloP) || {}).id } : null;
  if (soloP) {
    c0.c *= 1 + EGO.solo.gain * readQ(soloP) - EGO.solo.loss * egoOf(soloP).err;
    m.egoLog.push(soloLog);
    if (collide) m.egoLog.push({ act: 'collide', p: soloP.id, mate: collide.b.id, net: collide.net });
  }
  if (swing) c0.c *= BLOCK.swingCov;
  else if (bitten) c0.c *= 0.5;
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
