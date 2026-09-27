// Rally phases for one side's possession, called in order by rally() (engine/rally.js).
// Each takes the possession context `c` (see rally()) and returns one of:
//   { point: side }            — the rally is over, `side` wins the point
//   { next: [atk, pas, qual] } — possession passes on (atk = side now attacking, pas = passer, qual = pass 1–3)
//   an object of values        — the phase finished normally; the rally continues with these values
//   undefined                  — the phase did not happen; carry on
// Random rolls stay in exactly the original order, so seeded matches replay identically.

/** 1. Free ball: a scrambled pass floats straight over the net. */
function freeBall(c) {
  const { m, B, V, ds, dd, defT, pas, qual } = c;
  if (qual === 1 && R() < 0.14) {
    const tx = sx(ds, rnd(260, 420)),
      tz = rnd(0.15, 0.85),
      dg = nearest(m, defT.P, tx, tz),
      sl = [];
    mv(m, dg, tx - dd * 16, tz, sl, V);
    V &&
      B({
        dur: 950,
        acts: [
          { k: 'pose', p: pas.id, pose: 'bump' },
          ...sl,
          { k: 'ball', to: { p: dg.id, c: 'bump' }, h: 230 },
          { k: 'pose', p: dg.id, pose: 'bump' },
          { k: 'log', t: `${pas.name}'s touch floats over — free ball` }
        ]
      });
    return { next: [ds, dg, 3] };
  }
}
/** 2. Choose the setter (back-row setter first; on a scramble someone else may take it) and move to the pass. */
function pickSetter(c) {
  const { m, B, V, front, atk, ds, da, atkT, defT, pas, qual } = c;
  const Ss = atkT.P.filter(p => p.role === 'S' && p !== pas && !busy(m, p, c.n)),
    dual = atkT.P.filter(p => p.role === 'S').length > 1;
  let setter = Ss.length ? Ss.find(p => !front(atk, p)) || Ss[0] : null;
  if (!setter) {
    const fr = atkT.P.filter(p => p !== pas && !busy(m, p, c.n));
    setter = wpick(fr.length ? fr : atkT.P.filter(p => p !== pas), p => p.wit);
  }
  else if (qual === 1 && Ss.length < 2 && R() < 0.45)
    setter = (fr => wpick(fr.length ? fr : atkT.P.filter(p => p !== pas && p !== setter), p => p.wit))(
      atkT.P.filter(p => p !== pas && p !== setter && !busy(m, p, c.n))
    );
  const DMB = defT.P.filter(p => p.role !== 'S' && front(ds, p)).find(p => p.role === 'MB') || defT.mb;
  const setX = sx(atk, qual === 3 ? 445 : qual === 2 ? rnd(415, 450) : rnd(320, 420)),
    setZ = qual === 3 ? 0.55 : clamp(0.55 + (rnd(-0.2, 0.2) * (4 - qual)) / 2, 0.15, 0.85);
  let sl = [];
  mv(m, setter, setX - da * 6, setZ, sl, V);
  for (const t of [atkT, defT])
    for (const p of t.P)
      if (p !== pas && p !== setter) {
        const h = home(p, t === atkT ? atk : ds);
        mv(m, p, h[0], h[1], sl, V);
      }
  V &&
    B({
      dur: qual === 1 ? 800 : 640,
      acts: [
        { k: 'pose', p: pas.id, pose: 'bump' },
        ...sl,
        { k: 'pose', p: setter.id, pose: 'ready' },
        { k: 'ball', to: { p: setter.id, c: 'set' }, h: qual === 1 ? 230 : 160 }
      ]
    });
  return { setter, dual, DMB, setX, setZ };
}
/** 3. Setter dump: a second-touch feint (Left-hand Dump makes it more likely and deadlier). */
function setterDump(c, s) {
  const { m, B, V, atk, ds, dd, atkT, defT, pas, qual } = c,
    { setter, DMB, setZ } = s;
  // setter dump
  // higher wit and higher jump make the setter a bigger dump threat
  const lefty = setter.role === 'S' && hasTech(setter, 'lefty');
  if (setter.role === 'S' && qual >= 2 && R() < atkT.S.feint * 0.5 * dumpThreat(setter, W(setter)) * (lefty ? 1.4 : 1)) {
    const sj = Math.max(24, jumpPx(setter) * 0.55);
    const lx = sx(ds, rnd(410, 465)),
      lz = clamp(setZ + rnd(-0.3, 0.3), 0.1, 0.9);
    const dg = nearest(m, defT.P, lx, lz),
      dd0 = dist(m.pos[dg.id], lx, lz);
    const kill = R() < 0.25 + 0.18 * (W(setter) - 1.3) + (setter.jump - 60) / 250 - (defT.S.dig - 1) + dd0 * 0.3 + (lefty ? 0.1 : 0);
    {
      const dec = pick(atkT.P.filter(p => p !== pas && p !== setter)),
        dz = clamp(HOME[dec.slot][1], 0.1, 0.9),
        fk = [];
      mv(m, dec, sx(atk, 420), dz, fk, V);
      mv(m, DMB, sx(ds, 484), dz, fk, V);
      V &&
        B({
          dur: 700,
          acts: [
            { k: 'pose', p: setter.id, pose: 'set' },
            { k: 'jump', p: setter.id, mode: 'up', peak: sj },
            { k: 'ball', to: { p: setter.id, c: 'set', dh: sj }, h: 0 },
            ...fk,
            { k: 'pose', p: dec.id, pose: 'spike' },
            { k: 'jump', p: dec.id, mode: 'hop', peak: jumpPx(dec), t0: 0.05 },
            { k: 'pose', p: DMB.id, pose: 'block' },
            { k: 'jump', p: DMB.id, mode: 'hop', peak: jumpPx(DMB) * 0.85, t0: 0.25 },
            { k: 'ghost', to: { x: sx(atk, 432), z: dz, h: 118 + jumpPx(dec) } },
            { k: 'label', t: 'Fake set!', dy: 60, set: 1, big: 1 }
          ]
        });
    }
    V &&
      setter.star &&
      B({ dur: 1150, cut: 1, acts: [{ k: 'cut', p: setter.id, title: setter.move, sub: 'Fake set, second-touch dump' }] });
    st(m, setter, 'att');
    const a2 = [];
    if (kill) {
      st(m, setter, 'k');
      m.big = 1;
      m.lastPlay = 'fake';
      m.hero = setter;
      const p0 = m.pos[dg.id];
      mv(m, dg, lerp(p0.x, lx, 0.6), lerp(p0.z, lz, 0.6), a2, V);
      V &&
        B({
          dur: 520,
          acts: [
            { k: 'pose', p: setter.id, pose: 'set' },
            { k: 'jump', p: setter.id, mode: 'down' },
            ...a2,
            { k: 'pose', p: dg.id, pose: 'dive' },
            { k: 'ball', to: { x: lx, z: lz, h: 0 }, h: 40 },
            { k: 'label', t: lefty ? 'Left-hand dump!' : 'Dump!', when: 'end', big: 1 },
            { k: 'log', t: `${setter.name} dumps it on the second touch!`, c: 'pt' }
          ]
        });
      return { point: atk };
    }
    const dDive = mustDive(dg, m.pos[dg.id], lx - dd * 20, lz, 520);
    if (dDive) setBusy(m, dg, c.n + 1);
    mv(m, dg, lx - dd * 20, lz, a2, V);
    V &&
      B({
        dur: 520,
        acts: [
          { k: 'pose', p: setter.id, pose: 'set' },
          { k: 'jump', p: setter.id, mode: 'down' },
          ...a2,
          { k: 'pose', p: dg.id, pose: dDive ? 'dive' : 'bump' },
          { k: 'ball', to: { p: dg.id, c: dDive ? 'dive' : 'bump' }, h: 40 },
          { k: 'log', t: `${dg.name} reads the fake and digs the dump` }
        ]
      });
    st(m, dg, 'dig');
    return { next: [ds, dg, 2] };
  }
}
/** 4. Set quality: double contact (point to the defense), bump-set, perfect / good / bad. */
function setHands(c, s) {
  const { m, B, V, ds, da, atkT, qual } = c,
    { setter, dual, setX, setZ } = s;
  let succ = Formula.setSuccess(setter, qual, atkT, dual);
  // Scrambled pass + unsure hands → bump-set instead (can't be a double, but less accurate)
  const bumpSet = qual === 1 && (setter.role !== 'S' || W(setter) < 1.3);
  if (bumpSet) succ *= 0.85;
  dr(m, setter, 0.01);
  let sq2;
  if (!bumpSet && R() < doubleContactP(setter, qual, W(setter))) sq2 = 'fault';
  else {
    const roll = R();
    sq2 = roll < succ ? (roll < succ * 0.4 ? 'perfect' : 'good') : 'bad';
  }
  if (sq2 === 'fault') {
    const why =
      qual === 1
        ? 'off a scrambled pass'
        : setter.role !== 'S'
          ? `— ${setter.role} is no setter`
          : staOf(setter) < 0.5
            ? '— tired hands'
            : (CM.mood[setter.id] || 0) < -0.3
              ? '— nerves'
              : 'on a tight ball';
    st(m, setter, 'err');
    V &&
      B({
        dur: 700,
        acts: [
          { k: 'pose', p: setter.id, pose: 'set' },
          { k: 'ball', to: { x: setX + da * 10, z: setZ, h: 0 }, h: 60 },
          { k: 'label', t: 'Double contact', big: 1 },
          { k: 'log', t: `Whistle — ${setter.name} double-contacts the set ${why}`, c: 'err' }
        ]
      });
    return { point: ds };
  }
  return { sq2, bumpSet };
}
/** 5. Choose the attack: quick or not, who hits (tactic, back-row calls, captain's buff), setter-driven techniques. */
function chooseAttack(c, s, h) {
  const { m, front, atk, ds, atkT, defT, qual } = c,
    { setter, setZ } = s,
    { sq2 } = h;
  const free = p => !busy(m, p, c.n);
  const MBs = atkT.P.filter(p => p.role === 'MB' && p !== setter && front(atk, p) && free(p)),
    mbZ = p => clamp(setZ + (MBs.indexOf(p) === 1 ? 0.16 : -0.14), 0.1, 0.9);
  // coach tactic: 'ws' / 'mb' focus shifts who gets the ball; 'auto' = setter's call (the default)
  const tac = TACTICS[(m.tac && m.tac[atk]) || 'auto'];
  let quick =
    sq2 !== 'bad' && qual >= 2 && MBs.length > 0 && R() < clamp(atkT.S.quick * (MBs.length > 1 ? 1.4 : 1) * tac.quick, 0, tac.quickCap);
  // not-ready players (still on the floor, running back in) aren't set; the free ones call for it
  let pool = atkT.P.filter(p => p !== setter && free(p));
  if (!pool.length) pool = atkT.P.filter(p => p !== setter);
  // back-row wing spikers who feel strong call for a long set to the back court; a sharp setter listens
  const callers = pool.filter(p => p.role === 'WS' && !front(atk, p) && confidence(p, m, atk) >= 80),
    trust = clamp(W(setter) / 1.4, 0.5, 1.3) * (tac.focus === 'WS' ? 1.4 : tac.focus === 'MB' ? 0.6 : 1);
  let spiker = quick
    ? pick(MBs)
    : wpick(
        pool,
        p =>
          p.power *
          (p.star ? 1.7 : 1) *
          (front(atk, p) ? 1 : 0.25 * (callers.includes(p) ? 1 + 2.4 * trust : 1)) *
          (p.role === 'MB' ? 0.5 : p.role === 'S' ? 0.45 : 1) *
          (tac.w[p.role] || 1) *
          (1 + 0.6 * buffLv(p)) * // the captain told everyone to feed this player
          (elReady(m, p) ? 3 : 1) // a full element gauge: the setter looks for them
      );
  // a predictable attack is easier to read: blockers get there a little more often
  const readBonus = tac.focus && spiker.role === tac.focus ? tac.read : 0;
  // setter-driven plays (decided before the approach so the animation can show them)
  const freak = quick && hasTech(spiker, 'freak') && W(setter) >= 1.6 && R() < 0.5,
    slide = quick && !freak && hasTech(spiker, 'slide') && W(setter) >= 1.3 && R() < 0.35,
    sync = !quick && qual === 3 && setter.role === 'S' && hasTech(setter, 'sync') && R() < 0.25;
  const DF = defT.P.filter(p => p.role !== 'S' && front(ds, p)),
    B0 = DF.find(p => p.role === 'MB') || DF[0] || defT.P.find(p => front(ds, p)) || defT.mb; // a front-row setter before anyone from the back
  const bad = sq2 === 'bad';
  return { MBs, mbZ, tac, quick, pool, callers, trust, spiker, readBonus, freak, slide, sync, DF, B0, bad };
}
/** 5b. A bad set the hitter can't attack: too tight (tipped over) or too wide (chased and bumped over). */
function badSetOver(c, s, a) {
  const { m, B, V, atk, ds, dd, defT } = c,
    { setter, setZ } = s,
    { spiker, bad } = a;
  if (bad && R() < 0.3) {
    const tx = sx(ds, rnd(280, 420)),
      tz = rnd(0.15, 0.85),
      dg = nearest(m, defT.P, tx, tz),
      a2 = [];
    // two ways a set goes wrong (picked from values already rolled, no extra randomness):
    //  tight — carried into the net, the hitter can only joust/tip it over
    //  wide  — sprayed toward the sideline, the hitter chases and bumps it over
    const drift = rnd(-0.2, 0.2),
      tight = (setZ * 97) % 1 < 0.5,
      bz = tight ? clamp(setZ + drift * 0.5, 0.1, 0.9) : clamp(setZ + (setZ < 0.5 ? -0.36 : 0.36), 0.06, 0.94);
    mv(m, spiker, sx(atk, tight ? 456 : 372), bz, a2, V);
    V &&
      B({
        dur: 1000,
        acts: [
          { k: 'pose', p: setter.id, pose: 'set' },
          { k: 'call', p: setter.id, t: tight ? 'Too tight!' : 'Sorry — wide!', soft: 1 },
          ...a2,
          { k: 'pose', p: spiker.id, pose: tight ? 'spike' : 'bump' },
          ...(tight ? [{ k: 'jump', p: spiker.id, mode: 'up', peak: jumpPx(spiker) * 0.7, t0: 0.55, t1: 1 }] : []),
          { k: 'ball', to: tight ? { x: sx(atk, 480), z: bz, h: 150 } : { x: sx(atk, 360), z: bz, h: 70 }, h: tight ? 70 : 150, wob: true },
          { k: 'label', t: 'Bad set', when: 'end' },
          {
            k: 'log',
            t: tight
              ? `${setter.name}'s set is too tight to the net — ${spiker.name} can only tip it over`
              : `${setter.name}'s set sprays wide — ${spiker.name} chases it down and bumps it over`,
            c: 'err'
          }
        ]
      });
    const a3 = [];
    mv(m, dg, tx - dd * 16, tz, a3, V);
    V &&
      B({
        dur: 900,
        acts: [
          ...a3,
          ...(tight
            ? [
                { k: 'spkstyle', p: spiker.id, st: 'tip' },
                { k: 'jump', p: spiker.id, mode: 'down' }
              ]
            : [{ k: 'pose', p: spiker.id, pose: Math.abs(bz - setZ) > 0.3 ? 'dive' : 'bump' }]),
          { k: 'ball', to: { p: dg.id, c: 'bump' }, h: tight ? 120 : 190 },
          { k: 'pose', p: dg.id, pose: 'bump' },
          { k: 'label', t: tight ? 'Tipped over' : 'Saved over', small: 1 }
        ]
      });
    return { next: [ds, dg, 3] };
  }
}
