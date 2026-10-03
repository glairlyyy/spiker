// Rally phases for one side's possession, called in order by rally() (engine/rally.js).
// Each takes the possession context `c` (see rally()) and returns one of:
//   { point: side }            — the rally is over, `side` wins the point
//   { next: [atk, pas, qual, scr] } — possession passes on (atk = side now attacking, pas = passer, qual = pass 1–3; scr =
//                                 { first } for the save of a pop-up: see saveSet)
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
  // where the set is made does not depend on who sets, so it is rolled first (the reach rule needs it)
  const setX = sx(atk, qual === 3 ? 445 : qual === 2 ? rnd(415, 450) : rnd(320, 420)),
    setZ = qual === 3 ? 0.55 : clamp(0.55 + (rnd(-0.2, 0.2) * (4 - qual)) / 2, 0.15, 0.85),
    eta = p => dist(m.pos[p.id], setX, setZ) / (0.5 + p.speed / 100); // time to the set point (as `nearest`)
  let setter = Ss.length ? Ss.find(p => !front(atk, p)) || Ss[0] : null,
    why = 'free', // engine-only record (m.setBy): why this player sets, and the reach times it was judged on
    ts = null,
    tm = null;
  if (!setter) {
    const fr = atkT.P.filter(p => p !== pas && !busy(m, p, c.n));
    setter = wpick(fr.length ? fr : atkT.P.filter(p => p !== pas), p => p.wit);
    why = 'none'; // no setter is free (the passer, or busy)
  } else if (qual === 1 && Ss.length < 2) {
    // a bad pass: a free teammate sets only when the setter would be clearly late (SETTER.beat)
    const fr = atkT.P.filter(p => p !== pas && p !== setter && !busy(m, p, c.n));
    if (fr.length) {
      const mate = nearest(m, fr, setX, setZ);
      ts = eta(setter);
      tm = eta(mate);
      if (ts > SETTER.beat * tm) ((setter = mate), (why = 'reach'));
    }
  }
  (m.setBy = m.setBy || []).push({ role: setter.role, why, qual, ts, tm });
  const DMB = defT.P.filter(p => p.role !== 'S' && front(ds, p)).find(p => p.role === 'MB') || defT.mb;
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
/**
 * 2b. A scramble possession (the save of a serve / spike that popped off someone's arms): the saver is the team's 2nd touch
 * and bump-sets — no free ball, setter choice, dump or double contact; a third player hits (chooseAttack skips `scr.first`
 * and the saver). Engine-only tallies, no randoms: m.scr = { n, over (went over as a bump) }, m.scrLog = [{ first, saver, hitter }].
 */
function saveSet(c) {
  const { m, front, ds, defT, pas, scr } = c,
    at = m.pos[pas.id],
    DMB = defT.P.filter(p => p.role !== 'S' && front(ds, p)).find(p => p.role === 'MB') || defT.mb;
  m.scr = m.scr || { n: 0, over: 0 };
  m.scrLog = m.scrLog || [];
  m.scr.n++;
  m.scrLog.push({ first: scr.first.id, saver: pas.id, hitter: null });
  return { setter: pas, dual: false, DMB, setX: at.x, setZ: at.z };
}
/** 3. Setter dump: a second-touch feint (Left-hand Dump makes it more likely and deadlier). */
function setterDump(c, s) {
  const { m, B, V, atk, ds, dd, atkT, defT, pas, qual } = c,
    { setter, DMB, setZ } = s;
  // higher wit and higher jump make the setter a bigger dump threat
  const lefty = setter.role === 'S' && hasTech(setter, 'lefty');
  if (setter.role === 'S' && qual >= 2 && R() < atkT.S.feint * 0.5 * dumpThreat(setter, W(setter)) * (lefty ? 1.4 : 1)) {
    if (lefty) techFire(m, setter, 'lefty');
    const sj = Math.max(24, jumpPx(setter) * 0.55);
    const lx = sx(ds, rnd(410, 465)),
      lz = clamp(setZ + rnd(-0.3, 0.3), 0.1, 0.9);
    const dg = nearest(m, defT.P, lx, lz),
      dd0 = dist(m.pos[dg.id], lx, lz);
    const kill = R() < 0.25 + 0.18 * (W(setter) - 1.3) + (setter.jump - 60) / 250 - (defT.S.dig - 1) + dd0 * 0.3 + (lefty ? 0.1 : 0);
    // the fake: a decoy hitter approaches, the middle blocker jumps with them
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
          { k: 'ghost', to: { x: sx(atk, 432), z: dz, h: REACH_H + jumpPx(dec) } },
          { k: 'label', t: 'Fake set!', dy: 60, set: 1, big: 1 }
        ]
      });
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
/** Court units from the net within which a middle can still hit a quick (≈ 3.6 m: a few quick steps). */
const QUICK_REACH = 150;
/** 5. Choose the attack: quick or not, who hits (tactic, back-row calls, captain's buff), setter-driven techniques. */
function chooseAttack(c, s, h) {
  const { m, front, atk, ds, atkT, defT, qual } = c,
    { setter, setZ } = s,
    { sq2 } = h;
  const free = p => !busy(m, p, c.n);
  // a quick needs a middle already near the net: not the passer (still getting up from the first touch) and not
  // someone who is deep in the back court after a dig or a cover — they can't reach a quick set in time
  const nearNet = p => p !== c.pas && Math.abs(m.pos[p.id].x - 500) <= QUICK_REACH;
  const MBs = atkT.P.filter(p => p.role === 'MB' && p !== setter && front(atk, p) && free(p) && nearNet(p)),
    mbZ = p => clamp(setZ + (MBs.indexOf(p) === 1 ? 0.16 : -0.14), 0.1, 0.9);
  // coach tactic: 'ws' / 'mb' focus shifts who gets the ball; 'auto' = setter's call (the default)
  const tac = TACTICS[(m.tac && m.tac[atk]) || 'auto'];
  let quick =
    sq2 !== 'bad' && qual >= 2 && MBs.length > 0 && R() < clamp(atkT.S.quick * (MBs.length > 1 ? 1.4 : 1) * tac.quick, 0, tac.quickCap);
  // not-ready players (still on the floor, running back in) aren't set; the free ones call for it
  const fresh = p => !c.scr || p !== c.scr.first; // a scramble: the player whose arms it popped off does not hit
  let pool = atkT.P.filter(p => p !== setter && free(p) && fresh(p));
  if (!pool.length) pool = atkT.P.filter(p => p !== setter);
  // back-row wing spikers who feel strong call for a long set to the back court; a sharp setter listens
  const callers = pool.filter(p => p.role === 'WS' && !front(atk, p) && confidence(p, m, atk) >= 80),
    trust = clamp(W(setter) / 1.4, 0.5, 1.3) * (tac.focus === 'WS' ? 1.4 : tac.focus === 'MB' ? 0.6 : 1);
  const hitW = p =>
    p.power *
    (p.star ? 1.7 : 1) *
    (front(atk, p) ? 1 : 0.25 * (callers.includes(p) ? 1 + 2.4 * trust : 1)) *
    (p.role === 'MB' ? 0.5 : p.role === 'S' ? 0.45 : 1) *
    (tac.w[p.role] || 1) *
    (1 + 0.6 * buffLv(p)) * // the captain told everyone to feed this player
    (elReady(m, p) ? 3 : 1); // a full element gauge: the setter looks for them
  // relationships (T-066): in the clutch the setter feeds an ally more and freezes out a resent / enemy hitter — the same single draw,
  // read against two weightings; without m.rel (or before the clutch) this is the plain wpick
  const clutch = !!m.rel && !quick && Math.max(m.pts[0], m.pts[1]) >= REL_E.clutch,
    relMul = p => ({ ally: 1 + REL_E.trust, resent: 1 - REL_E.freeze, enemy: 1 - REL_E.freeze })[relTag(m, setter, p)] || 1,
    // (exactly wpick, but with the draw handed in so two weightings can be read against the same one)
    at = (wf, u) => {
      let t = 0;
      const w = pool.map(p => {
        const v = Math.max(0.01, wf(p));
        t += v;
        return v;
      });
      let r = u * t;
      for (let i = 0; i < pool.length; i++) {
        r -= w[i];
        if (r <= 0) return pool[i];
      }
      return pool[pool.length - 1];
    };
  let spiker = quick ? pick(MBs) : clutch ? null : wpick(pool, hitW),
    relNote = null;
  if (clutch) {
    const u = R(),
      plain = at(hitW, u);
    spiker = at(p => hitW(p) * relMul(p), u);
    const cold = p => ['resent', 'enemy'].includes(relTag(m, setter, p));
    m.relLog.push({ act: 'clutch', p: setter.id, mate: spiker.id, tag: relTag(m, setter, spiker) });
    // said out loud only when it is plainly the relationship: a resent / enemy pick replaced by someone who is not, or an ally chosen
    if (spiker !== plain) {
      relNote =
        cold(plain) && !cold(spiker)
          ? { act: 'freeze', who: plain }
          : relTag(m, setter, spiker) === 'ally'
            ? { act: 'trust', who: spiker }
            : null;
      if (relNote) m.relLog.push({ act: relNote.act, p: setter.id, mate: relNote.who.id, tag: relTag(m, setter, relNote.who) });
    }
  }
  // ego (spec §2.12): an unpicked hitter demands the set; a low-maturity setter gives in (a mature one ignores the call)
  let egoCall = null;
  if (!quick) {
    const open = spiker,
      caller = pool.find(p => p !== spiker && p !== setter && p.role !== 'S' && egoRoll(m, p, 'call'));
    if (caller) {
      const give = 1 - maturity(setter),
        ok = give > 0 && R() < give;
      m.egoLog.push({ act: 'call', p: caller.id, ok, mate: open.id });
      if (ok) ((spiker = caller), (egoCall = caller));
    }
  }
  if (egoCall) relNote = null; // (the hitter demanded it: not the setter's choice)
  // a predictable attack is easier to read: blockers get there a little more often
  const readBonus = tac.focus && spiker.role === tac.focus ? tac.read : 0;
  // setter-driven plays (decided before the approach so the animation can show them)
  const freak = quick && hasTech(spiker, 'freak') && W(setter) >= 1.6 && R() < 0.5,
    slide = quick && !freak && hasTech(spiker, 'slide') && W(setter) >= 1.3 && R() < 0.35,
    sync = !quick && qual === 3 && setter.role === 'S' && hasTech(setter, 'sync') && R() < 0.25;
  if (freak) techFire(m, spiker, 'freak');
  if (slide) techFire(m, spiker, 'slide');
  if (sync) techFire(m, setter, 'sync');
  const DF = defT.P.filter(p => p.role !== 'S' && front(ds, p)),
    B0 = DF.find(p => p.role === 'MB') || DF[0] || defT.P.find(p => front(ds, p)) || defT.mb; // a front-row setter before anyone from the back
  const bad = sq2 === 'bad';
  if (relNote && c.V) {
    // the setter says it out loud (a talk beat before the set; no extra draw)
    const { act, who } = relNote;
    c.B({
      dur: 650,
      acts: [
        { k: 'call', p: setter.id, t: callLine(act, setter, m) },
        { k: 'log', t: act === 'trust' ? `${setter.name} trusts ${who.name}` : `${setter.name} freezes ${who.name} out`, c: 'set' }
      ]
    });
  }
  return { MBs, mbZ, tac, quick, pool, callers, trust, spiker, readBonus, freak, slide, sync, DF, B0, bad, egoCall };
}
/**
 * 5b. A bad set: most stay hittable (in place, just weaker — see setMul), but some go astray — the ball flies off
 * toward the sideline or deep, and the nearest teammate chases it down and bumps (or dives) it over as a free ball.
 */
function badSetOver(c, s, a) {
  const { m, B, V, atk, ds, dd, da, atkT, defT } = c,
    { setter, setZ } = s,
    { bad } = a;
  if (bad && R() < 0.3) {
    const tx = sx(ds, rnd(280, 420)),
      tz = rnd(0.15, 0.85),
      dg = nearest(m, defT.P, tx, tz),
      drift = rnd(-0.2, 0.2), // (kept in the random sequence) how far along the net the stray ball goes
      deep = (setZ * 97) % 1 < 0.5, // picked from values already rolled: sprayed deep or out wide
      bz = deep ? clamp(setZ + drift, 0.1, 0.9) : clamp(setZ + (setZ < 0.5 ? -0.36 : 0.36), 0.06, 0.94),
      bx = sx(atk, deep ? 250 : 372),
      mates = atkT.P.filter(p => p !== setter && !busy(m, p, c.n)),
      rec = nearest(m, mates.length ? mates : atkT.P.filter(p => p !== setter), bx, bz),
      dive = mustDive(rec, m.pos[rec.id], bx, bz, 900),
      a2 = [];
    mv(m, rec, bx - da * 10, bz, a2, V);
    if (dive) setBusy(m, rec, c.n + 1);
    V &&
      B({
        dur: 900,
        acts: [
          { k: 'pose', p: setter.id, pose: 'set' },
          { k: 'call', p: setter.id, t: deep ? 'Too far — sorry!' : 'Sorry — wide!', soft: 1 },
          ...a2,
          { k: 'pose', p: rec.id, pose: dive ? 'dive' : 'bump' },
          { k: 'call', p: rec.id, t: callLine('recv', rec, m) },
          { k: 'ball', to: { p: rec.id, c: dive ? 'dive' : 'bump' }, h: 170, wob: true },
          { k: 'label', t: 'Bad set', when: 'end' },
          {
            k: 'log',
            t: `${setter.name}'s set goes astray — ${rec.name} ${dive ? 'dives' : 'races'} after it and bumps it over`,
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
          { k: 'ball', to: { p: dg.id, c: 'bump' }, h: 200 },
          { k: 'pose', p: dg.id, pose: 'bump' },
          { k: 'label', t: 'Saved over', small: 1 }
        ]
      });
    return { next: [ds, dg, 3] };
  }
}
