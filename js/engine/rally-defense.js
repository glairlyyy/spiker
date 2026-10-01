// Defense phases after a spike: the block, then the dig (called by rally(), engine/rally.js).
// Same return convention as engine/rally-phases.js. `x` carries the attack's values (power, landing spot,
// block formation, the hit animation acts…); block() may change power/touch flags for dig().

/** Below this block coverage there is no real block attempt (rally.js drops the defender's scene on the same test). */
const BLOCK_MIN_COV = 0.12;
/**
 * Kill-block odds: the block at full strength against the spike (so an OP wall can stop an OP hitter), weighted by how
 * much of the lane it actually covers — a half-formed block rarely stuffs anything.
 */
const STUFF_BIAS = 0.2,
  STUFF_COV_EXP = 1.6;
const stuffChance = (bp, cov, pow) => sig((bp / Math.max(cov, 0.01) - pow) / 20 - STUFF_BIAS) * Math.pow(Math.min(1, cov), STUFF_COV_EXP);
/** Tooling it off the hands and out: only off a real but partial block (coverage in this range), at this chance. */
const TOOL_COV = [0.25, 0.6],
  TOOL_P = 0.05;

/** 9. Block: block break (drill + hit-stop) → stuff (kill block, or a block-cover dig) → touch → tool off the hands. */
function block(c, x) {
  const { m, B, V, atk, ds, da, atkT, defT } = c,
    { tip, cov, c0, c1, b0, b1, spiker, appX, bz0, spZ, hit, blockers, bdown, el, elS, mark } = x;
  let { pow } = x;
  let touched = false,
    softTouch = false,
    smashed = false;
  if (!tip && cov > BLOCK_MIN_COV) {
    const bb = c1.c > c0.c ? b1 : b0;
    const bp = Formula.blockPower(b0, b1, defT, cov);
    const hands = { p: bb.id, c: 'block' },
      bel = bb.elOn ? bb.el : null, // the blocker's own element shows on the wall (unlocked players only)
      brk = elS ? elS.brk : 0; // Earth element spike: breaks through blocks far more often
    // Block break: a solid block (coverage ≥ 0.5) can still be blasted through
    // when the spike beats the block's full strength by 10%+ (chance grows to 45% at +25%).
    const ratio = pow / Math.max(1, bp / cov);
    if (
      cov >= 0.5 - 0.2 * brk &&
      ratio > 1.1 - 0.25 * brk &&
      R() < Math.min(0.45 + 0.4 * brk, (ratio - 1.1 + 0.25 * brk) * 3 + 0.35 * brk)
    ) {
      smashed = true;
      md(m, bb, -0.1);
      md(m, spiker, 0.1);
      // the engine already knows the block breaks: stage the hitter's jump at contact (inserted right after the set)
      if (V) B.ins(mark, ...hypeSpikeCut(m, spiker, bb));
      V &&
        B({
          dur: clamp(Math.hypot(sx(ds, 484) - appX, (bz0 - spZ) * Z_UNITS) / (kmh(pow) * BALL_K), 80, 200),
          acts: [...hit, { k: 'ball', to: hands, h: 0, trail: pow, el, op: spiker.op }]
        });
      if (V && spiker.star && ratio > 1.2)
        B({
          dur: 1100,
          cut: 1,
          acts: [{ k: 'cut', p: spiker.id, title: 'Block Breaker', sub: `${kmh(pow)} km/h through ${bb.name}'s hands` }]
        });
      // hit-stop: the world pauses while the ball spins into the block like a drill and cracks the wall
      V &&
        B({
          dur: 560,
          freeze: 1,
          acts: [
            { k: 'cam', amt: 0.95, x: NETX, z: bz0, h: 150, hold: 1700 },
            { k: 'shot', kind: 'ball', p: bb.id, p2: spiker.id, hype: 1 }, // 3D: right up to the ball grinding into the hands
            { k: 'drill', p: bb.id, pow, color: defT.color, el }
          ]
        });
      V &&
        B({
          dur: 200,
          slow: 1,
          acts: [
            { k: 'netshake' },
            { k: 'burst', pow: pow + 20, color: atkT.color, el, op: spiker.op },
            { k: 'cam', amt: 0.95, x: NETX, z: bz0, h: 150, hold: 1000 }, // block break: push in closer
            { k: 'flash', a: 0.3 },
            { k: 'shake', amt: 3 },
            ...blockers.map(b => ({ k: 'plabel', p: b.id, t: 'Ugh!' })),
            { k: 'label', t: 'BLOCK BREAK!', big: 1, stamp: 1, dy: 40, pow: 120 },
            { k: 'log', t: `${spiker.name} smashes straight through ${bb.name}'s block!`, c: 'pt' }
          ]
        });
      hit.length = 0;
    } else if (R() < stuffChance(bp, cov, pow)) {
      const bx = sx(atk, rnd(425, 470)),
        bzz = clamp(spZ + rnd(-0.12, 0.12), 0.1, 0.9),
        dp = Math.round(pow * 0.55 + bp * 0.55),
        bd = clamp(Math.hypot(bx - sx(ds, 484), (bzz - bz0) * Z_UNITS, 150) / (kmh(dp) * BALL_K), 100, 260);
      // Block cover: the best-placed teammate (high defense, decent wit) may dig the kill block
      const coverScore = q => effD(q) * 0.65 + q.speed * 0.35 - dist(m.pos[q.id], bx, bzz) * 25;
      const cvr = atkT.P.filter(q => q !== spiker).reduce((best, q) => (coverScore(q) > coverScore(best) ? q : best));
      const saved = R() < sig((coverScore(cvr) - dp) / 12 - 2.7) * (W(cvr) < 0.8 ? 0.3 : 1);
      if (!saved) {
        st(m, bb, 'blk');
        st(m, bb, 'k');
        m.big = 1;
        m.lastPlay = 'killblock';
        m.hero = bb;
        md(m, spiker, -0.12);
      }
      st(m, bb, 'top', kmh(dp));
      V &&
        B({
          dur: clamp(Math.hypot(sx(ds, 484) - appX, (bz0 - spZ) * Z_UNITS) / (kmh(pow) * BALL_K), 90, 220),
          acts: [...hit, { k: 'ball', to: hands, h: 0, trail: pow, el, op: spiker.op }]
        });
      V &&
        B({
          dur: 320,
          slow: 1,
          acts: [
            { k: 'squash' },
            { k: 'netshake' },
            { k: 'burst', pow: 60, color: '#ffffff' },
            { k: 'zoom', amt: 0.09 },
            { k: 'flash', a: 0.35 },
            { k: 'shake', amt: 7 },
            ...(saved ? [] : [{ k: 'plabel', p: spiker.id, t: '!!' }]),
            { k: 'label', t: saved ? 'Blocked!' : 'DENIED', big: 1, dy: 44, set: 1 },
            { k: 'wall', p: bb.id, el: bel },
            ...(saved ? [] : [{ k: 'shot', kind: 'ball', p: bb.id, p2: spiker.id, hype: 1 }]) // the stuff, up close
          ]
        });
      if (saved) {
        st(m, cvr, 'dig');
        dr(m, cvr, 0.025);
        md(m, cvr, 0.15);
        md(m, bb, -0.05);
        const a5 = [],
          cDive = mustDive(cvr, m.pos[cvr.id], bx - da * 6, bzz, bd + 140);
        if (cDive) setBusy(m, cvr, c.n + 1);
        mv(m, cvr, bx - da * 6, bzz, a5, V);
        const mg = coverScore(cvr) - dp * 0.9 + rnd(-15, 15);
        V &&
          B({
            dur: bd + 140,
            acts: [
              ...bdown,
              { k: 'burst', pow: dp, color: defT.color, el: bel, op: bb.op },
              { k: 'label', t: `${kmh(dp)} km/h`, pow: dp, dy: -8 },
              { k: 'shake', amt: Math.max(4, (dp - 45) / 5) },
              ...a5,
              { k: 'pose', p: cvr.id, pose: cDive ? 'dive' : 'bump' },
              { k: 'ball', to: { p: cvr.id, c: cDive ? 'dive' : 'bump' }, h: 40, trail: Math.max(80, dp), el: bel, op: bb.op },
              { k: 'efx', el: cvr.elOn ? cvr.el : null, pow: 60, when: 'end' },
              { k: 'label', t: 'BLOCK COVER!', when: 'end', big: 1, stamp: 1 },
              { k: 'log', t: `${cvr.name} digs ${bb.name}'s kill block — the rally lives!`, c: 'pt' }
            ]
          });
        if (V && (cvr.star || dp >= 90))
          B({
            dur: 1100,
            cut: 1,
            acts: [{ k: 'cut', p: cvr.id, title: 'Miracle Cover', sub: `Dug a ${kmh(dp)} km/h kill block` }]
          });
        return { next: [atk, cvr, mg > 15 ? 2 : 1] };
      }
      const cblk = b1 && b0.elOn && b1.elOn && epair(b0.el, b1.el) ? `${epair(b0.el, b1.el)} Wall` : CBLK[defT.sk];
      if (V && b1 && b0.star && b1.star)
        B({
          dur: 1600,
          cut: 1,
          acts: [
            { k: 'combo', p1: b0.id, p2: b1.id, title: cblk, sub: 'Two-star combo block', el: bel },
            { k: 'log', t: `COMBO BLOCK! ${b0.name} and ${b1.name} raise ${cblk}`, c: 'set' }
          ]
        });
      else
        V &&
          bb.star &&
          B({
            dur: 1200,
            cut: 1,
            acts: [{ k: 'cut', p: bb.id, title: bb.bmove, sub: `Block reach ${Math.round(2.4 * 100 + jumpCm(bb) + 20) / 100} m` }]
          });
      V &&
        B({
          dur: bd,
          acts: [
            ...bdown,
            { k: 'burst', pow: dp, color: defT.color, el: bel, op: bb.op },
            { k: 'label', t: `${kmh(dp)} km/h`, pow: dp, dy: -8 },
            { k: 'shake', amt: Math.max(5, (dp - 45) / 4) },
            ...(dp >= 80 ? [{ k: 'lines', pow: dp }] : []),
            { k: 'ball', to: { x: bx, z: bzz, h: 0 }, h: 0, trail: Math.max(80, dp), el: bel, op: bb.op },
            { k: 'zoom', amt: 0.05 },
            { k: 'impact', pow: dp + 30, when: 'end', kill: 1, blk: 1, el: bel, op: bb.op },
            { k: 'label', t: 'KILL BLOCK!', when: 'end', big: 1, stamp: 1 },
            ...blockers.map(b => ({ k: 'pose', p: b.id, pose: 'roar', when: 'end' })),
            { k: 'pose', p: spiker.id, pose: 'slump', when: 'end' },
            { k: 'log', t: `Stuffed! ${bb.name} shuts down ${spiker.name}${b1 ? ' with a double block' : ''}`, c: 'pt' }
          ]
        });
      V && B(hypeKillBlock(m, bb, spiker));
      return { point: ds };
    }
    // touch or tool off the hands (not after a block break: that ball is already through)
    if (!smashed && R() < sig((bp - pow) / 20 + 0.2)) {
      touched = true;
      softTouch = hasTech(bb, 'softblk');
      for (const b of blockers) if (b.el === 'earth') elCharge(m, b, EG.earth.touch);
      pow *= softTouch ? 0.45 : 0.55;
      V &&
        B({
          dur: 190,
          acts: [
            ...hit,
            { k: 'ball', to: hands, h: 0, trail: pow },
            ...(softTouch ? [{ k: 'tech', p: bb.id, t: 'Soft Block' }] : []),
            { k: 'call', p: bb.id, t: hypeLine('touch', bb, m) },
            { k: 'log', t: `${bb.name} ${softTouch ? 'soft-blocks it up for the defense' : 'gets a touch on it'}` }
          ]
        });
      hit.length = 0;
    } else if (!smashed && cov >= TOOL_COV[0] && cov < TOOL_COV[1] && R() < TOOL_P) {
      st(m, spiker, 'k');
      V && B({ dur: 190, acts: [...hit, { k: 'ball', to: hands, h: 0, trail: pow }] });
      V &&
        B({
          dur: 650,
          acts: [
            ...bdown,
            { k: 'ball', to: { x: sx(ds, 15), z: bz0 > 0.5 ? 1.08 : -0.08, h: 0 }, h: 90 },
            { k: 'label', t: 'Off the block!', when: 'end', big: 1 },
            { k: 'log', t: `${spiker.name} tools the block — off the hands and out`, c: 'pt' }
          ]
        });
      return { point: atk };
    }
  }
  return { touched, softTouch, smashed, pow };
}
/** 10. Dig or kill. A dig hands possession to the other side; Desperation Save can rescue a ball that was down. */
function dig(c, x, bl) {
  const { m, B, V, atk, ds, dd, defT } = c,
    { tip, cov, spiker, setter, blockers, lx, lz, hdur, hit, bdown, tier, combo, bitten, fakeDecoy, el, elS } = x,
    { touched, softTouch, smashed, pow } = bl;
  // blockers — and every other free front-row player, who went up late (see formBlock's lateB) — are still in the
  // air or landing at the net: the dig goes to someone on the floor behind them (a front-row player only if nobody is)
  const atNet = p => blockers.includes(p) || (c.front(ds, p) && !busy(m, p, c.n)),
    floor = defT.P.filter(p => !atNet(p)),
    cands = floor.length ? floor : defT.P.filter(p => !blockers.includes(p));
  const dg = nearest(m, cands, lx, lz),
    q0 = m.pos[dg.id],
    dd0 = dist(q0, lx, lz);
  let dsc = Formula.digScore(dg, defT, dd0);
  if (touched) dsc *= softTouch ? 1.4 : 1.15;
  // Rolling Receive on defense: far balls cost much less
  const rollD = hasTech(dg, 'roll') && dd0 > 0.5;
  if (rollD) dsc += Math.max(0, dd0 - 0.1) * 55 * (1.35 - dg.speed / 100) * 0.5;
  if (smashed) dsc *= 0.85; // defenders are wrong-footed by a ball blasting through the block
  if (elS) dsc *= elS.dsc;
  const killP = Formula.killChance(pow, dsc, tip, dd0);
  const a4 = [];
  if (R() < killP && !tip && hasTech(dg, 'save') && !(elS && elS.el === 'blast') && R() < 0.18) {
    // Desperation Save: the ball was going down — a one-arm lunge keeps it alive (barely)
    st(m, dg, 'dig');
    dr(m, dg, 0.03);
    md(m, dg, 0.12);
    mv(m, dg, lerp(q0.x, lx, 0.8), lerp(q0.z, lz, 0.8), a4, V);
    const sd = V ? scramble(m, smashed ? 'brk' : 'loose', dg, callerFor(m, defT, dg, lx, lz), { x: lx, z: lz }) : null;
    V &&
      B({
        dur: hdur + (touched ? 200 : 0),
        ...sd.beat,
        acts: [
          ...hit,
          ...bdown,
          ...a4,
          ...sd.acts,
          { k: 'pose', p: dg.id, pose: 'dive', pc: 1 },
          { k: 'ball', to: { p: dg.id, c: 'dive' }, h: touched ? 60 : 0, trail: pow, el },
          { k: 'tech', p: dg.id, t: 'Desperation Save', when: 'end' },
          { k: 'log', t: `${dg.name} flings an arm out — desperation save!`, c: 'set' }
        ]
      });
    return { next: [ds, dg, 1] };
  }
  if (R() < killP) {
    // how far the defender gets toward the ball (share of the distance)
    const fReach = clamp((0.25 + dg.speed / 250) / (dd0 + 0.01), 0, 0.85);
    // the defender got there but it's too hot to control: sometimes it pops up inside the court and a teammate saves it
    if (!tip && dd0 * (1 - fReach) < 0.09 && R() < popChance(dg, pow) * (1 - (elS ? elS.noPop : 0))) {
      const P = popRecovery(m, ds, defT, dg, lx, lz, pow, c.n),
        sp0 = mustDive(dg, q0, lx, lz, hdur) ? 'dive' : 'bump';
      mv(m, dg, lerp(q0.x, lx, fReach), lerp(q0.z, lz, fReach), a4, V);
      setBusy(m, dg, c.n + 1); // off balance after the deflection
      V &&
        B({
          dur: hdur + (touched ? 200 : 0),
          acts: [
            ...hit,
            ...bdown,
            ...a4,
            { k: 'pose', p: dg.id, pose: sp0 },
            { k: 'ball', to: { p: dg.id, c: sp0 }, h: touched ? 60 : 0, trail: pow, op: spiker.op, el },
            { k: 'burst', pow: Math.min(pow, 70), color: defT.color, when: 'end' },
            { k: 'label', t: 'Off the arms!', small: 1, when: 'end' }
          ]
        });
      const pa = popActs(m, P, dd, V, 900);
      if (pa.dive) setBusy(m, P.rec, c.n + 1);
      // a loose ball: someone calls it and the chase plays in slow motion
      const sp = V ? scramble(m, 'loose', P.ok ? P.rec : null, callerFor(m, defT, P.rec, P.px, P.pz), { x: P.px, z: P.pz }) : null;
      if (P.ok) {
        st(m, P.rec, 'dig');
        V &&
          B({
            dur: 900,
            ...sp.beat,
            acts: [
              ...pa.acts,
              ...sp.acts,
              { k: 'label', t: 'Saved!', when: 'end', set: 1 },
              {
                k: 'log',
                t: `${spiker.name}'s spike blasts off ${dg.name}'s arms — ${P.rec.name} chases it down and keeps it alive!`,
                c: 'set'
              }
            ]
          });
        return { next: [ds, P.rec, 1, { first: dg }] };
      }
      st(m, spiker, 'k');
      if (setter !== spiker) st(m, setter, 'ast');
      V &&
        B({
          dur: 900,
          ...sp.beat,
          acts: [
            ...pa.acts,
            ...sp.acts,
            { k: 'impact', pow: 40, when: 'end', kill: 1 },
            { k: 'pose', p: spiker.id, pose: 'roar', when: 'end' },
            { k: 'label', t: 'Just out of reach!', when: 'end', big: 1 },
            { k: 'log', t: `${spiker.name}'s spike pops off ${dg.name}'s arms — ${P.rec.name} can't get there`, c: 'pt' }
          ]
        });
      return { point: atk };
    }
    st(m, spiker, 'k');
    if (tier === 'ult' || combo || smashed || (bitten && cov < 0.35)) m.big = 1;
    if (fakeDecoy) {
      m.lastPlay = 'fake';
      m.hero = setter;
    }
    if (setter !== spiker) st(m, setter, 'ast');
    mv(m, dg, lerp(q0.x, lx, fReach), lerp(q0.z, lz, fReach), a4, V);
    const word = tier === 'ult' ? 'KILL!!' : tier === 'heavy' ? 'Kill!' : tip ? 'Tip!' : 'Point';
    // defender gets there but the spike blows through the arms and bounces off (visual only, no extra rolls)
    const shank = V && !tip && dd0 * (1 - fReach) < 0.09 && (pow * 97.13) % 1 < 0.3,
      sp = mustDive(dg, q0, lx, lz, hdur) ? 'dive' : 'bump';
    let bx = lx,
      bz = lz;
    if (shank) {
      B({
        dur: hdur + (touched ? 200 : 0),
        acts: [
          ...hit,
          ...bdown,
          ...a4,
          { k: 'pose', p: dg.id, pose: sp },
          { k: 'ball', to: { p: dg.id, c: sp }, h: touched ? 60 : 0, trail: pow, op: spiker.op, el },
          { k: 'burst', pow: Math.min(pow, 70), color: defT.color, when: 'end' }
        ]
      });
      hit.length = 0;
      bdown.length = 0;
      a4.length = 0;
      const dl = sx(ds, lx); // distance from the defending side's end line
      bx = sx(ds, Math.max(-70, dl - 150 - pow * 0.6));
      bz = clamp(lz + (lz > 0.5 ? 0.45 : -0.45), -0.3, 1.3);
    }
    // through the block and down: "Break!!" and the despairing dive in slow motion
    const kd = V && smashed && !shank && !tip ? scramble(m, 'brk', null, callerFor(m, defT, dg, lx, lz), { x: lx, z: lz }) : null;
    V &&
      B({
        dur: shank ? 640 : hdur + (touched ? 200 : 0),
        ...(kd ? kd.beat : {}),
        acts: [
          ...hit,
          ...bdown,
          ...a4,
          ...(kd ? kd.acts : []),
          ...(shank ? [{ k: 'label', t: 'Off the arms!', small: 1 }] : [{ k: 'pose', p: dg.id, pose: 'dive', pc: dd0 > 0.22 ? 1 : 0 }]),
          {
            k: 'ball',
            to: { x: bx, z: bz, h: 0 },
            h: shank ? 110 : tip ? 70 : touched ? 60 : 0,
            trail: tip ? 0 : shank ? pow * 0.5 : pow,
            op: spiker.op && !tip && !shank,
            el: shank ? null : el
          },
          ...(el && !shank
            ? [{ k: 'label', t: ENAME[el].split(' ').pop().toUpperCase() + '!', when: 'end', big: 1, stamp: 1, dy: 40 }]
            : []),
          { k: 'impact', pow: tip ? 20 : pow, when: 'end', kill: !tip, op: spiker.op && !tip, el: tip ? null : el },
          { k: 'pose', p: spiker.id, pose: 'roar', when: 'end' },
          { k: 'label', t: word, when: 'end', big: 1 },
          {
            k: 'log',
            t: tip
              ? `${spiker.name} tips it into the open court`
              : `${spiker.name} ${tier === 'ult' ? `unleashes ${spiker.move}` : tier === 'heavy' ? 'hammers it down' : 'puts it away'} — ${kmh(pow)} km/h`,
            c: 'pt'
          }
        ]
      });
    return { point: atk };
  }
  const mg = dsc - pow * 0.9 + rnd(-15, 15),
    nq = mg > 15 ? 3 : mg > -5 ? 2 : 1;
  st(m, dg, 'dig');
  dr(m, dg, 0.02);
  // run to it and dig on the feet; dive only when it's out of reach
  const dive = rollD || mustDive(dg, q0, lx - dd * 16, lz, hdur + (touched ? 200 : 0));
  if (dive) setBusy(m, dg, c.n + 1); // on the floor: can't attack the transition ball
  mv(m, dg, lx - dd * 16, lz, a4, V);
  const dram =
    V && !tip && (smashed || (touched && dive && (m.pts[0] + m.pts[1] + c.n) % 2 === 0))
      ? scramble(m, smashed ? 'brk' : 'loose', dg, callerFor(m, defT, dg, lx, lz), { x: lx, z: lz })
      : null;
  V &&
    B({
      dur: hdur + (touched ? 200 : 0),
      ...(dram ? dram.beat : {}),
      acts: [
        ...hit,
        ...bdown,
        ...a4,
        ...(dram ? dram.acts : []),
        { k: 'pose', p: dg.id, pose: dive ? 'dive' : 'bump', pc: dive && dd0 > 0.22 ? 1 : 0 },
        ...(!dram && (dg.def >= 85 || (m.zone[ds] && dg.def >= 70)) ? [{ k: 'call', p: dg.id, t: callLine('dig', dg, m) }] : []),
        ...(rollD
          ? [{ k: 'tech', p: dg.id, t: 'Rolling Receive', when: 'end' }]
          : dive && dd0 > 0.22
            ? [{ k: 'label', t: 'Pancake!', when: 'end', set: 1 }]
            : []),
        {
          k: 'ball',
          to: { p: dg.id, c: dive ? 'dive' : 'bump' },
          h: touched ? 80 : tip ? 70 : 0,
          trail: tip ? 0 : pow,
          el
        },
        ...(dg.elOn ? [{ k: 'efx', el: dg.el, pow: pow > 85 ? 55 : 35, when: 'end' }] : []),
        ...(pow > 85 ? [{ k: 'label', t: 'Great dig!', when: 'end' }] : []),
        { k: 'log', t: `${dg.name} ${pow > 85 ? 'digs a monster spike' : 'digs it up'}` }
      ]
    });
  return { next: [ds, dg, nq] };
}
