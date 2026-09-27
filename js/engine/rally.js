// Rally loop: possession after possession until a point is decided.
// Serve/receive live in engine/serve.js; the phases in engine/rally-phases.js and engine/rally-defense.js.

/**
 * Plays the rest of a rally after serve receive, alternating sides until a point is decided.
 * Returns the side (0/1) that wins the point. Each loop iteration is one side's possession:
 *   1. free ball (bad pass floats straight over)
 *   2. choose setter (back-row setter first; scramble → someone else)
 *   3. setter dump / second-touch feint
 *   4. set quality: double contact, bump-set, perfect / good / bad
 *   5. choose attack: quick, pipe, setter-hitter; bad set → push over
 *   6. multi-attack fake set (decoys, blocker may bite)
 *   7. approach, block formation (depth + height coverage), set beat
 *   8. spike power, cut-ins, shot choice (around / seam / over), landing spot, hitting error
 *   9. block: block break → stuff (kill block, or block cover dig) → touch → tool
 *  10. dig or kill; a dig hands possession to the other side
 * atkT / defT = attacking / defending team; V = record animation beats via B().
 */
function rally(m, B, V, atk, pas, qual) {
  const front = (side, p) => {
    const i = rotOrder(m.t[side], m.rot[side]).indexOf(p);
    return i === 1 || i === 2;
  };
  for (let n = 1; ; n++) {
    if (n > 6) {
      for (const t of m.t) for (const p of t.P) dr(m, p, 0.004);
      elLong(m);
    }
    const atkT = m.t[atk],
      defT = m.t[1 - atk],
      ds = 1 - atk,
      da = DIR(atk),
      dd = DIR(ds);
    const fat = n > 7 ? 1 + (n - 7) * 0.1 : 1;
    /** possession context shared by the phases */
    const c = { m, B, V, front, n, atk, ds, da, dd, atkT, defT, pas, qual };
    let r = freeBall(c);
    if (r) {
      [atk, pas, qual] = r.next;
      continue;
    }
    const s = pickSetter(c),
      { setter, setZ } = s;
    r = setterDump(c, s);
    if (r) {
      if (r.point != null) return r.point;
      [atk, pas, qual] = r.next;
      continue;
    }
    const h = setHands(c, s);
    if (h.point != null) return h.point;
    const { sq2, bumpSet } = h;
    const a = chooseAttack(c, s, h),
      { MBs, mbZ, pool, callers, readBonus, freak, slide, sync, DF, B0, bad } = a;
    let { quick, spiker } = a;
    r = badSetOver(c, s, a);
    if (r) {
      [atk, pas, qual] = r.next;
      continue;
    }
    // ---- 6–8: fake set, approach & block formation, set beat, spike, hitting error ----
    // multi-attack fake set: several hitters approach, setter shows one and sets another
    let bitten = false,
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
        bitten = R() < clamp(0.8 - (W(db) - 0.8) * 0.45 + (W(setter) - 1.5) * 0.3 + (skillMod(setter, 'decoy') - 1) - readBonus, 0.15, 0.9);
        const zOf = p =>
            p.role === 'MB' && MBs.includes(p) ? mbZ(p) : clamp(HOME[p.slot][1] + (p.slot === 'W0' ? -0.05 : 0.05), 0.1, 0.9),
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
              ...others
                .filter(p => p !== decoy)
                .map(p => ({ k: 'jump', p: p.id, mode: 'hop', peak: jumpPx(p) * 0.7, t0: 0.3, t1: 1 })),
              ...(bitten
                ? [
                    { k: 'pose', p: db.id, pose: 'block' },
                    { k: 'jump', p: db.id, mode: 'up', peak: jumpPx(db) * 0.85, t0: 0.4, t1: 1 }
                  ]
                : []),
              { k: 'ghost', to: { x: xOf(decoy) + da * 12, z: dz, h: 118 + jumpPx(decoy) } },
              { k: 'label', t: 'Fake set!', dy: 60, set: 1, big: 1 },
              {
                k: 'log',
                t: `Multi-attack! ${decoy.name} is up for the kill... but ${setter.name} sets ${spiker.name}${bitten ? ` — ${db.name} bit on the fake` : ''}`
              }
            ]
          });
      }
    }
    // approach & block positioning (depth)
    const back = !front(atk, spiker);
    // Long back attack: a high-flying back-row wing who called for it runs back to the end line, attacks from deep
    // and broad-jumps in; the ball crosses far above the block. (No extra randomness: picked from rolled values.)
    const longB =
      back && !quick && !bad && spiker.role === 'WS' && callers.includes(spiker) && jumpPx(spiker) >= 92 &&
      Math.round(spiker.jump * 7 + setZ * 1000 + n * 13) % 10 < 4;
    const spZ = slide
      ? clamp(setZ + (setZ < 0.5 ? 0.32 : -0.32), 0.1, 0.9) // slide: runs behind the setter
      : quick
      ? mbZ(spiker)
      : clamp(
          HOME[spiker.slot][1] + (spiker.slot === 'W0' ? -0.05 : spiker.slot === 'W1' ? 0.05 : 0) + rnd(-0.06, 0.06),
          0.1,
          0.9
        );
    const appX = sx(atk, slide ? 455 : quick ? 466 : longB ? 215 : back ? 325 : 420);
    const tAv = (quick ? 0.3 : bad ? 1.05 : 0.8) + (back ? 0.15 : 0) + (longB ? 0.1 : 0),
      reach = b => ((b.speed / 100) * tAv * 0.6) / courtScale();
    const b0 = B0,
      p0 = m.pos[b0.id],
      r0 = reach(b0) * (bitten ? 0.3 : 1);
    const bz0 = clamp(p0.z + clamp(spZ - p0.z, -r0, r0), 0.05, 0.95);
    let b1 = null,
      bz1 = 0;
    if (!quick && !sync && R() < defT.S.dbl && DF.some(p => p !== b0)) { // sync attack: no time to form a double
      b1 = DF.find(p => p !== b0);
      const p1 = m.pos[b1.id],
        side = bz0 <= spZ ? 1 : -1,
        t1 = spZ + side * 0.1;
      bz1 = clamp(p1.z + clamp(t1 - p1.z, -reach(b1) * 1.3, reach(b1) * 1.3), 0.05, 0.95);
    }
    const blockers = b1 ? [b0, b1] : [b0];
    // every other front-row player still goes up (late, off-position) even when they're not part of the block —
    // nobody at the net just watches. Display only: coverage and positions in the engine are unchanged.
    const lateB = V ? defT.P.filter(p => front(ds, p) && !blockers.includes(p) && !busy(m, p, n)) : [],
      lateA = lateB.flatMap(p => {
        const q = m.pos[p.id];
        return [
          { k: 'slide', p: p.id, x: sx(ds, 482), z: clamp(q.z + clamp(spZ - q.z, -0.16, 0.16), 0.05, 0.95) },
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
    const pj = jumpPx(spiker),
      hS = 118 + pj;
    const cvf = (b, bz) => {
      const g = Math.abs(bz - spZ),
        c = clamp(1 - (g * courtScale()) / 0.2, 0, 1), // a block covers a smaller share of a wider net
        hB = 124 + jumpPx(b) * 0.85,
        hf = clamp(1 - (hS - hB - 10) / 55, 0.15, 1.2);
      return { c: c * hf, raw: c, hB };
    };
    const c0 = cvf(b0, bz0),
      c1 = b1 ? cvf(b1, bz1) : { c: 0, raw: 0, hB: 0 };
    if (bitten) c0.c *= 0.5;
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
    const setTech = freak ? 'Freak Quick' : slide ? '2nd-tempo Slide' : longB ? 'Long Back Attack' : sync ? 'Synchronized Attack' : pipeCombo ? 'Pipe Combo' : null;
    const seam = b1 && c0.raw > 0.2 && c1.raw > 0.2 && Math.abs(bz0 - bz1) > 0.17 && R() < 0.5;
    const over = hS - Math.max(c0.hB, c1.hB) > 38 && Math.max(c0.raw, c1.raw) > 0.3;
    const dx = bad ? -da * rnd(25, 50) : 0,
      dy = bad ? -rnd(18, 34) : 0;
    // set direction relative to the setter: quick, front set, or back set (hitter behind the setter)
    const setDir = quick ? 'quick' : spZ > setZ + 0.08 ? 'back' : 'front';
    // ball calls while the set is in the air: the hitter asks for it, other confident hitters shout as decoys
    const setCalls = [];
    if (V && !bad) {
      const cf = p => confidence(p, m, atk);
      if (back && callers.includes(spiker)) setCalls.push({ k: 'call', p: spiker.id, t: callLine(longB ? 'long' : 'back', spiker, m) });
      else if (!quick && cf(spiker) >= 82)
        setCalls.push({ k: 'call', p: spiker.id, t: callLine(m.zone[atk] ? 'zone' : 'set', spiker, m) });
      const other = pool.find(p => p !== spiker && p !== fakeDecoy && cf(p) >= 88 && (front(atk, p) || callers.includes(p)));
      if (other) setCalls.push({ k: 'call', p: other.id, t: callLine(callers.includes(other) ? 'back' : 'decoy', other, m), soft: 1 });
    }
    const combo = ((setter.star && spiker.star) || bondCombo(setter, spiker)) && setter !== spiker && sq2 === 'perfect' && !fakeDecoy && R() < 0.65;
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
          ...blockers.map(b => ({
            k: 'jump',
            p: b.id,
            mode: b === b0 && bitten && fakeDecoy ? 'reup' : 'up',
            t0: b === b0 && bitten ? 0.84 : quick ? 0.3 : 0.6,
            t1: 1,
            peak: jumpPx(b) * (b === b0 && bitten ? 0.45 : 0.85)
          })),
          { k: 'pose', p: spiker.id, pose: 'spike' },
          { k: 'spkstyle', p: spiker.id, st: quick ? 'quick' : back ? 'pipe' : 'normal' },
          // camera: slow push-in on the contest above the net when a real block is up
          ...(cov > 0.3 && !bad ? [{ k: 'cam', amt: 0.32, x: NETX, z: (spZ + bz0) / 2, h: 150, hold: 1500, t0: 0.45 }] : []),
          ...blockers.map(b => ({ k: 'pose', p: b.id, pose: 'block' })),
          ...lateA,
          { k: 'ball', to: { p: spiker.id, c: 'spike', dx, dh: dy }, h: freak ? 8 : quick ? 30 : bad ? 250 : longB ? 300 : back ? 245 : 190, wob: bad },
          ...(bad ? [{ k: 'call', p: setter.id, t: 'Sorry!', soft: 1 }] : []),
          ...setCalls,
          ...(fakeDecoy ? [{ k: 'real', to: { p: spiker.id, c: 'spike' } }] : []),
          ...(sq2 === 'perfect'
            ? [
                {
                  k: 'label',
                  t: (setter.star ? '✦ ' : '') + (setDir === 'back' ? 'Perfect back set' : 'Perfect set'),
                  when: 'end',
                  set: 1
                }
              ]
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
    if (hype || read) B({ dur: 160, scene: Math.min(hype || 9, read || 9), freeze: 1, acts: [{ k: 'shot', kind: null }, { k: 'flash', a: 0.22 }, { k: 'shake', amt: 4 }] });
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
      cov *= cutS ? 0.35 : 0.45;
    }
    // Delayed Spike: hang in the air until the blockers come down
    const delayed = !tip && !quick && !around && cov > 0.4 && hasTech(spiker, 'delay') && R() < 0.35;
    if (delayed) cov *= 0.4;
    if (seam) cov *= 0.45;
    if (elS) cov *= elS.cov;
    if (V && (tip || cov <= 0.12)) dropDefScene(m); // no block attempt: the defender's scene lines go (block() uses the same test)
    const tier = tip ? 'tip' : pow >= 100 ? 'ult' : pow >= 80 ? 'heavy' : pow >= 58 ? 'hard' : 'soft';
    if (V && elS)
      B({
        dur: 1600,
        cut: 1,
        acts: elS.pair
          ? [
              { k: 'combo', p1: setter.id, p2: spiker.id, title: elS.pair, sub: `${ENAME[setter.el]} × ${ENAME[elS.el]}  ·  Power ${Math.round(pow)}`, el: elS.el },
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
        ? elS.over ? 'Over the block!' : null
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
    let hdur = 420;
    const bMean = b1 ? (bz0 + bz1) / 2 : bz0;
    let lz = around
      ? bMean > 0.5
        ? rnd(0.1, 0.35)
        : rnd(0.65, 0.9)
      : R() < 0.5
        ? clamp(spZ + rnd(-0.12, 0.12), 0.1, 0.9)
        : clamp(1 - spZ + rnd(-0.12, 0.12), 0.1, 0.9);
    let lx = sx(ds, tip ? rnd(390, 460) : rnd(170, 400));
    if (elS && elS.far) [lx, lz] = elFar(m, ds, defT.P.filter(q => !blockers.includes(q)), lx, lz, elS.far);
    // flight time: harder spikes fly faster (about +17% at power 100, +29% at 130)
    hdur = tip ? 520 : clamp(Math.hypot(lx - appX, (lz - spZ) * 420, 118 + pj) / (kmh(pow) * (0.012 + Math.max(0, pow - 60) * 0.00005)), 120, 560) * courtScale();
    if (elS) hdur = Math.max(110, hdur * elS.fly);
    // the attack in play, for the element gauges (kills, digs and blocks are credited against it)
    m.ctx = { spiker, pow, quick, back, over: over && !around, around: around || delayed, tip, fake: !!fakeDecoy, el: elS };
    elAttack(m, spiker, m.ctx);
    const errP = Formula.spikeErrorP({ spiker, bad, pow, around, back, longB, hS }) * (elS ? 0.5 : 1);
    if (!tip && R() < errP) {
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
      return ds;
    }
    // ---- 9–10: block, then dig or kill ----
    const x = { tip, cov, c0, c1, b0, b1, pow, spiker, setter, appX, bz0, spZ, hit, blockers, bdown, lx, lz, hdur, tier, combo, bitten, fakeDecoy, elS, el: elS ? elS.el : null, mark };
    const bl = block(c, x);
    if (bl.point != null) return bl.point;
    if (bl.next) {
      [atk, pas, qual] = bl.next;
      continue;
    }
    r = dig(c, x, bl);
    if (r.point != null) return r.point;
    [atk, pas, qual] = r.next;
  }
}
