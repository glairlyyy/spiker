// Serve and serve receive: starts every rally, then hands over to rally() (engine/rally.js).

/** Extra flight speed of the hardest serves. */
const SERVE_FAST = 1.45;
/**
 * Play one rally of match m: the reset and serve, serve receive (ace, error, pop-up), then rally() until the point is
 * decided, and end() scores it. Returns { w, beats } (beats = null unless the match records animation).
 */
function playRally(m) {
  rallyStart(m);
  const V = m.rec,
    beats = V ? [] : null,
    B = b => {
      if (m.upQ.length && b.acts) b.acts.unshift(...m.upQ.splice(0)); // back on the feet (spec §2.28)
      beats.push(b);
    };
  // later phases can stage something earlier in the rally once they know the outcome (e.g. a block break)
  if (V) {
    B.len = () => beats.length;
    B.ins = (i, ...bs) => beats.splice(i, 0, ...bs);
    B.last = () => beats[beats.length - 1]; // (the fake set rides on the pass beat: fakeSet)
  }
  if (V && m.cardActs.length) B({ dur: 1100, acts: m.cardActs }); // the cards played since the last serve (spec §2.37)
  const s = m.serve,
    r = 1 - s,
    c = { m, V, B, beats, s, r, ST: m.t[s], RT: m.t[r], dR: DIR(r) };
  // the serve in steps (each draws its randoms in the same order as the one long function did — goldens unchanged)
  serveWalk(c);
  serveToss(c);
  serveContact(c);
  srvLog(m, c.server);
  // the foot fault (spec §4.38): one draw on every serve, here, before the error roll (FAULTS.foot)
  if (R() < Formula.footFaultP(c.server, c.sType) && m.dev !== 'ace') return footFault(c); // (not a srvLog error: the serve odds don't model it)
  if (R() < c.serr && m.dev !== 'ace') return (srvLog(m, c.server, 'err'), serveFault(c)); // (m.dev 'ace': the Dev cut-scene preview — same draws)
  serveAim(c);
  if (R() < sig((c.sq - c.rs) / 24 - 2.4) || m.dev === 'ace') return (srvLog(m, c.server, 'ace'), serveAce(c));
  return serveReceive(c);
}
/** Per-rally state, reset before every serve. */
function rallyStart(m) {
  CM = m;
  m.big = 0;
  m.rallyN = 0;
  m.lastPlay = null; // 'killblock' | 'fake' — used by the zone breaker in end()
  m.hero = null;
  m.busy = {};
  m.down = {};
  m.upQ = [];
  m.ctx = null; // attack context for the element gauge
  m.techRally = [];
  m.errBy = null; // who made the error that ended the rally (chatter)
  m.hypeRally = 0; // at most one staged scene per rally
  m.kbScene = 0; // a kill-block scene played this rally (chatter skips the blocker's line)
  m.defBeats = [];
  m.att0 = m.att ? [m.att[0].n, m.att[1].n] : [0, 0]; // the cards' tally (spec §2.33): who attacked this rally
  m.srv0 = m.serve;
  m.cardActs = Cards.serve(m); // the captains play (spec §2.37); each active play fits, misfits or is countered this rally
}
/** Choose the serve up front and walk everyone to their spots; the reset and the server's routine beats. */
function serveWalk(c) {
  const { m, V, B, s, r, ST, RT } = c;
  const oS = rotOrder(ST, m.rot[s]),
    oR = rotOrder(RT, m.rot[r]),
    server = oS[0];
  // the serve is chosen up front (same random draws, same order), so the server walks straight to where it starts:
  // the service spot for a standing float, the start of the run-up for a jump serve / jump float
  const sq0 = Formula.serveQuality(server, ST),
    so = srvApply(m, server, serveType(server, sq0), sq0), // role orders (spec §2.29): the ordered serve type
    { sq, sType, errK } = so,
    jumpSrv = sType === 'jump',
    runM = runUpM(server, sType),
    endX = jumpSrv ? 60 : 44,
    startX = Math.max(-120, endX - runM * UNITS_PER_M);
  let sl = [];
  oS.forEach((p, i) => mv(m, p, sx(s, i === 0 && sType !== 'float' ? startX : RSPOT[i][0]), RSPOT[i][1], sl, V));
  oR.forEach((p, i) => {
    const q = i === 0 ? RECV0 : RSPOT[i];
    mv(m, p, sx(r, q[0]), q[1], sl, V);
  });
  // breathing room after the last point: the score sinks in before everyone resets
  V && B({ dur: 750, acts: [] });
  V &&
    B({
      dur: 1250,
      acts: [{ k: 'reset' }, ...sl, { k: 'hold', p: server.id }, { k: 'rot', snap: snap(m) }]
    });
  V &&
    B({
      dur: 1100, // the server's routine (bounce it / spin and aim, see preServe): a beat before the serve
      acts: []
    });
  Object.assign(c, { oS, oR, server, sq, sType, errK, jumpSrv, runM, endX, startX });
  m.srvP0 = server;
}
/** Run-up pace and serve techniques; the toss (and run-up) beat. */
function serveToss(c) {
  const { m, V, B, s, server, jumpSrv, runM, endX, startX, sType } = c;
  let { sq } = c;
  if (jumpSrv) sq *= 1 + (runM - 3.2) * 0.05; // longer run-up = a bit more pace (±5%)
  // serve techniques
  // (an ordered Drive / Killer always fires, another ordered serve never; the same draws — spec §2.29)
  const o = ordOf(m, server, 'srv'),
    tech = (id, r) => (r ? !o || o === id : o === id),
    killer = jumpSrv && hasTech(server, 'killer') && tech('killer', R() < 0.5),
    drive = !jumpSrv && hasTech(server, 'drive') && tech('drive', R() < 0.5),
    targeted = hasTech(server, 'target') && (R() < 0.3 || !!ordOf(m, server, 'tgt'));
  if (killer) sq *= 1.1;
  if (killer || drive || targeted) techFire(m, server, killer ? 'killer' : drive ? 'drive' : 'target');
  dr(m, server, jumpSrv ? 0.03 : 0.015);
  if (jumpSrv) setBusy(m, server, 2); // lands deep behind the end line: still running in on the first return
  if (sType !== 'float') {
    const z0 = m.pos[server.id].z,
      run = [];
    mv(m, server, sx(s, endX), z0, run, V);
    const pk = jumpVis(server) * (jumpSrv ? 0.8 : 0.35);
    V &&
      B({
        dur: Math.round(260 + (endX - startX) / (0.16 + server.speed / 900)),
        acts: [
          { k: 'label', t: `Run-up ${runM} m`, small: 1, dy: 34 },
          { k: 'pose', p: server.id, pose: sType === 'jump' ? 'spike' : 'serve' },
          { k: 'spkstyle', p: server.id, st: sType === 'jump' ? 'serve' : 'jumpfloat' },
          ...run,
          { k: 'jump', p: server.id, mode: 'up', t0: sType === 'jump' ? 0.62 : 0.58, t1: 1, peak: pk },
          // real toss: the ball goes up well above the hitting hand and drops into it at the top of the jump
          { k: 'ball', to: { p: server.id, c: sType === 'jump' ? 'spike' : 'serve' }, h: sType === 'jump' ? 190 : 95 }
        ]
      });
  } else {
    V &&
      B({
        dur: 460,
        acts: [
          { k: 'pose', p: server.id, pose: 'serve' },
          { k: 'spkstyle', p: server.id, st: 'float' },
          { k: 'ball', to: { p: server.id, c: 'serve' }, h: 60 }
        ]
      });
  }
  Object.assign(c, { sq, killer, drive, targeted });
}
/** The contact: the error chance, the hit effects; the serving side goes to base. */
function serveContact(c) {
  const { m, V, s, ST, RT, server, sq, sType, errK, killer, drive, targeted } = c;
  const tg = tgtResolve(m, server, RT), // the ordered target (spec §2.29): exact with Target Serve, else a lean
    sp = m.pos[server.id],
    sArc = sType === 'jump' ? 85 : sType === 'jumpfloat' ? 110 : 130,
    wob = sType !== 'jump';
  const serr =
    (Formula.serveErrorP(server, ST, sq) + (killer ? 0.03 : 0)) *
    (atkPlan(m, s).serveErr ?? 1) * // Hunt the passer: riskier serves (spec §2.26)
    errK *
    (tg && !tg.exact ? ORDERS.srv.aimErr : 1);
  const techName = killer ? 'Killer Jump Serve' : drive ? 'Drive Serve' : targeted ? 'Target Serve' : null;
  const hitFx = [
    { k: 'jump', p: server.id, mode: 'down' },
    { k: 'burst', pow: sq * 0.8, color: ST.color, op: server.op },
    ...(powVis(server, sq, 'serve') > 70
      ? [{ k: 'label', t: `${kmh(powVis(server, sq, 'serve'))} km/h`, pow: powVis(server, sq, 'serve') }]
      : []),
    ...(techName ? [{ k: 'tech', p: server.id, t: techName }] : [])
  ];
  // serving team switches to base positions
  const sw = [];
  ST.P.forEach(p => {
    const h = playHome(m, p, s);
    mv(m, p, h[0], h[1], sw, V);
  });
  Object.assign(c, { tg, sp, sArc, wob, serr, hitFx, sw });
}
/** Service error: into the net or long. */
function serveFault(c) {
  const { m, V, B, beats, s, r, server, sq, jumpSrv, sp, hitFx, sw } = c;
  const net = R() < Formula.serveNetShare(server, sq, jumpSrv);
  st(m, server, 'err');
  V &&
    B({
      dur: 750,
      acts: [
        ...hitFx,
        ...sw,
        {
          k: 'ball',
          to: net ? { x: sx(s, 494), z: sp.z, h: 110 } : { x: sx(r, 25), z: rnd(0.2, 0.8), h: 0 },
          h: net ? 30 : 110,
          trail: sq
        },
        { k: 'label', t: net ? 'Into the net' : 'Long!', when: 'end', big: 1 }
      ]
    });
  return end(m, r, beats);
}
/** Foot fault (spec §4.38): the server stepped on the end line — a service error, called at the line where they took off. */
function footFault(c) {
  const { m, V, B, beats, s, r, server, sq, sp, hitFx, sw } = c;
  st(m, server, 'err');
  fltAdd(m, 'foot');
  V &&
    B({
      dur: 750,
      acts: [
        ...hitFx,
        ...sw,
        { k: 'ball', to: { x: sx(r, 300), z: clamp(sp.z, 0.2, 0.8), h: 0 }, h: 110, trail: sq },
        { k: 'label', t: 'Foot fault', big: 1, call: 'foot', at: { x: sx(s, COURT_LINES.end), z: sp.z } }
      ]
    });
  return end(m, r, beats);
}
/** Where the serve goes and who takes it (target serve, rolling receive); the receive score and flight time. */
function serveAim(c) {
  const { m, V, r, RT, sq, drive, targeted, tg, sw, sp } = c;
  let tx = sx(r, rnd(150, 420)),
    tz = rnd(0.12, 0.88);
  let rc = nearest(
    m,
    RT.P.filter(p => p !== RT.s),
    tx,
    tz
  );
  if (tg) {
    // an ordered target (spec §2.29): beside them (exact with Target Serve, else a lean); the seam: between the two weakest
    if (tg.exact || R() < ORDERS.srv.lean) {
      rc = tg.rc;
      const q = m.pos[rc.id],
        q2 = tg.seam ? m.pos[seamOf(RT)[1].id] : null;
      tx = clamp(q2 ? lerp(q.x, q2.x, 0.4) : q.x, Math.min(sx(r, 150), sx(r, 420)), Math.max(sx(r, 150), sx(r, 420)));
      tz = clamp(q2 ? lerp(q.z, q2.z, 0.4) : q.z + (q.z > 0.5 ? -0.16 : 0.16), 0.1, 0.9);
    }
  } else if (targeted || atkPlan(m, c.s).huntK) {
    // (Hunt the passer, spec §2.26: every serve goes at their weakest passer)
    // aim just beside the weakest passer so they have to move for it
    rc = RT.P.filter(p => p !== RT.s).reduce((a, p) => (effD(p) + p.speed * 0.3 < effD(a) + a.speed * 0.3 ? p : a));
    const q = m.pos[rc.id];
    tx = clamp(q.x, Math.min(sx(r, 150), sx(r, 420)), Math.max(sx(r, 150), sx(r, 420)));
    tz = clamp(q.z + (q.z > 0.5 ? -0.16 : 0.16), 0.1, 0.9);
  }
  const d0 = dist(m.pos[rc.id], tx, tz);
  // Rolling Receive: dive-and-roll takes most of the sting out of a long run
  const rollR = hasTech(rc, 'roll') && d0 > 0.5;
  if (rollR) techFire(m, rc, 'roll');
  let rs = Formula.receiveScore(rc, RT, d0) - (drive ? 14 : 0);
  const cp = defPlan(m, r); // Cover the weak link (spec §2.26): the weakest passer is helped, the rest a little more open
  if (cp.weakRs) rs += rc === weakPasser(RT) ? cp.weakRs : cp.otherRs;
  if (atkPlan(m, c.s).press && rc === weakPasser(RT)) rs -= atkPlan(m, c.s).press; // Hunt the passer: the pressure tells on them
  if (tg && tg.seam && rc === tg.rc) rs -= ORDERS.srv.seam;
  if (rollR) rs += Math.max(0, d0 - 0.1) * 45 * (1.3 - rc.speed / 100) * 0.5;
  if (m.wind && GROUNDS.wind[c.sType]) rs -= m.wind * GROUNDS.wind[c.sType] * rnd(0.5, 1.5); // a float wanders in the wind (spec §4.38: one draw, only with wind)
  // a hard serve gets there sooner (SERVE_FAST: up to ×1.45 from serve 55 to 110)
  const vq = powVis(c.server, sq, 'serve'), // (the serve's real speed: the card edge wins the receive, not km/h)
    sfast = 1 + clamp((vq - 55) / 55, 0, 1) * (SERVE_FAST - 1),
    sdur = clamp(Math.hypot(tx - sp.x, (tz - sp.z) * Z_UNITS) / (kmh(vq) * SERVE_K * sfast), 400, 1300) * courtScale();
  RT.P.forEach(p => {
    if (p !== rc) {
      const h = playHome(m, p, r);
      mv(m, p, h[0], h[1], sw, V);
    }
  });
  recvLog(m, rc, false); // the Reads tab: who was served at (spec §2.25)
  Object.assign(c, { tx, tz, rc, d0, rollR, rs, sdur });
}
/** The serve beats the receiver: off the arms (a teammate may save it) or a clean ace. */
function serveAce(c) {
  const { m, rc, d0, sq } = c;
  // the receiver got an arm on it: sometimes it pops up in their court and a teammate keeps it alive
  const fr = Math.min(1, (0.8 / (d0 + 0.01)) * (0.3 + rc.speed / 200)),
    p0r = m.pos[rc.id];
  if (d0 * (1 - 0.7 * fr) < 0.1 && R() < popChance(rc, sq) && m.dev !== 'ace') return servePopped(c, fr, p0r);
  return serveAceClean(c);
}
/** Off the receiver's arms: a teammate saves it (rally on) or it drops (ace). */
function servePopped(c, fr, p0r) {
  const { m, V, B, beats, s, r, RT, dR, server, sq, tx, tz, rc, sdur, hitFx, sw, sArc, wob } = c;
  const P = popRecovery(m, r, RT, rc, tx, tz, sq, 1),
    sp0 = mustDive(rc, p0r, tx, tz, sdur) ? 'dive' : 'bump';
  mv(m, rc, lerp(p0r.x, tx, fr * 0.7), lerp(p0r.z, tz, fr * 0.7), sw, V);
  setBusy(m, rc, 1);
  V &&
    B({
      dur: sdur,
      acts: [
        ...hitFx,
        ...sw,
        { k: 'pose', p: rc.id, pose: sp0 },
        { k: 'ball', to: { p: rc.id, c: sp0 }, h: sArc, wob, trail: sq, op: server.op },
        { k: 'label', t: 'Off the arms!', small: 1, when: 'end' }
      ]
    });
  const pa = popActs(m, P, dR, V, 900);
  if (P.ok) {
    V &&
      B({
        dur: 900,
        acts: [...pa.acts, { k: 'call', p: P.rec.id, t: callLine('recv', P.rec, m) }, { k: 'label', t: 'Saved!', when: 'end', set: 1 }]
      });
    return end(m, rally(m, B, V, r, P.rec, 1, { first: rc }), beats);
  }
  st(m, server, 'ace');
  st(m, server, 'k');
  recvLog(m, c.rc, true);
  V &&
    B({
      dur: 900,
      acts: [
        ...pa.acts,
        { k: 'impact', pow: 40, when: 'end', kill: 1 },
        { k: 'label', t: 'ACE!', when: 'end', big: 1 },
        { k: 'pose', p: server.id, pose: 'roar', when: 'end' }
      ]
    });
  return end(m, s, beats);
}
/** A clean ace (or a shanked pass that never stays up). */
function serveAceClean(c) {
  const { m, V, B, beats, s, r, RT, server, sq, tx, tz, rc, d0, sdur, hitFx, sw, sArc, wob } = c;
  st(m, server, 'ace');
  st(m, server, 'k');
  recvLog(m, c.rc, true);
  m.big = 1;
  md(m, rc, -0.12);
  const f = Math.min(1, (0.8 / (d0 + 0.01)) * (0.3 + rc.speed / 200)),
    p0 = m.pos[rc.id];
  mv(m, rc, lerp(p0.x, tx, f * 0.7), lerp(p0.z, tz, f * 0.7), sw, V);
  // close enough to touch it: the pass shanks off the arms instead of the ball landing clean
  // (visual only — decided from values already rolled, so it never changes the random sequence)
  const shank = V && d0 * (1 - 0.7 * f) < 0.1 && (sq * 13.7) % 1 < 0.5,
    rcPose = mustDive(rc, p0, tx, tz, sdur) ? 'dive' : 'bump';
  let bx = tx,
    bz = tz;
  if (shank) {
    B({
      dur: sdur,
      acts: [
        ...hitFx,
        ...sw,
        { k: 'pose', p: rc.id, pose: rcPose },
        { k: 'ball', to: { p: rc.id, c: rcPose }, h: sArc, wob, trail: sq, op: server.op }
      ]
    });
    sw.length = 0;
    hitFx.length = 0;
    bx = sx(r, Math.max(-60, sx(r, tx) - 170));
    bz = tz > 0.5 ? 1.22 : -0.22;
  }
  V &&
    B({
      dur: shank ? 620 : sdur,
      acts: [
        ...hitFx,
        ...sw,
        ...(shank ? [{ k: 'label', t: 'Shanked!', small: 1 }] : [{ k: 'pose', p: rc.id, pose: 'dive' }]),
        {
          k: 'ball',
          to: { x: bx, z: bz, h: 0 },
          h: shank ? 95 : sArc,
          wob: wob && !shank,
          trail: shank ? 0 : sq,
          op: server.op && !shank
        },
        ...RT.P.filter(p => p !== rc).map(p => ({ k: 'jump', p: p.id, mode: 'hop', peak: 7, t0: 0, t1: 0.2 })),
        { k: 'impact', pow: sq, when: 'end', kill: 1, op: server.op },
        { k: 'label', t: 'ACE!', when: 'end', big: 1 },
        { k: 'pose', p: server.id, pose: 'roar', when: 'end' }
      ]
    });
  return end(m, s, beats);
}
/** A served ball received: pass quality, the receive beat, then the rally. */
function serveReceive(c) {
  const { m, V, B, beats, r, RT, dR, sq, tx, tz, rc, rollR, rs, sdur, hitFx, sw, sArc, wob } = c;
  const mg = rs - sq * 0.85 + rnd(-18, 18),
    q = mg > 12 ? 3 : mg > -8 ? 2 : 1;
  const rDive = rollR || mustDive(rc, m.pos[rc.id], tx - dR * 16, tz, sdur); // run to it, or dive only when out of reach
  if (rDive) setBusy(m, rc, 1); // still on the floor while the team sets
  const ko = knock(m, rc, sq * KNOCK.srvK, mg, 2); // a hard serve barely kept up: knocked flat (spec §2.28)
  if (q === 1) (recvLog(m, rc, 'bad'), srvLog(m, c.server, 'bad'));
  mv(m, rc, tx - dR * 16, tz, sw, V);
  dr(m, rc, 0.015);
  V &&
    B({
      dur: sdur,
      acts: [
        ...hitFx,
        ...sw,
        { k: 'pose', p: rc.id, pose: ko ? 'fall' : rDive ? 'dive' : 'bump' },
        ...(rc.def >= 82 || (m.zone[r] && rc.def >= 65) ? [{ k: 'call', p: rc.id, t: callLine('recv', rc, m) }] : []),
        ...(rollR && !ko ? [{ k: 'tech', p: rc.id, t: 'Rolling Receive', when: 'end' }] : []),
        ...(ko ? [{ k: 'label', t: 'Collapsed!', small: 1, when: 'end' }] : []),
        { k: 'ball', to: { p: rc.id, c: rDive && !ko ? 'dive' : 'bump' }, h: sArc, wob, trail: sq > 60 ? sq : 0 },
        ...RT.P.filter(p => p !== rc).map(p => ({ k: 'jump', p: p.id, mode: 'hop', peak: 7, t0: 0, t1: 0.2 })),
        ...(rc.elOn ? [{ k: 'efx', el: rc.el, pow: 35, when: 'end' }] : [])
      ]
    });
  return end(m, rally(m, B, V, r, rc, q), beats);
}
