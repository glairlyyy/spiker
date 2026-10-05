// Serve and serve receive: starts every rally, then hands over to rally() (engine/rally.js).

/** Extra flight speed of the hardest serves. */
const SERVE_FAST = 1.45;
/**
 * Play one rally of match m to the end with the AI picking at every decision point (spec §2.13: the sim flow — the same
 * draws as before the rally became pausable). Returns { w, beats } (beats = null unless the match records animation).
 */
function playRally(m) {
  const g = playRallyGen(m);
  let r = g.next();
  while (!r.done) r = g.next(r.value.ai);
  return r.value;
}
/**
 * The rally as a generator (spec §2.13, T-232): the reset and serve, serve receive (ace, error, pop-up), then rally() until
 * the point is decided, and end() scores it. At a decision point of `m.human`'s player it yields `{ kind, p, options, ai }`
 * (see decide()) and resumes with the pick; everyone else's choices never stop. Returns { w, beats }. While it is
 * suspended, `beats` holds the rally so far (the caller may play it): later inserts never land before that point.
 */
function* playRallyGen(m) {
  rallyStart(m);
  const V = m.rec,
    beats = V ? [] : null,
    B = b => beats.push(b);
  // later phases can stage something earlier in the rally once they know the outcome (e.g. a block break) — never
  // before a decision point that was already shown (m.askAt: what the player may have seen played)
  if (V) {
    B.len = () => beats.length;
    B.ins = (i, ...bs) => beats.splice(Math.max(i, m.askAt), 0, ...bs);
  }
  m.beats = beats; // the rally so far, for a caller holding a suspended rally (decide)
  const s = m.serve,
    r = 1 - s,
    c = { m, V, B, beats, s, r, ST: m.t[s], RT: m.t[r], dR: DIR(r) };
  // the serve in steps (each draws its randoms in the same order as the one long function did — goldens unchanged)
  yield* serveWalk(c);
  serveToss(c);
  serveContact(c);
  if (R() < c.serr) return serveFault(c);
  serveAim(c);
  if (R() < sig((c.sq - c.rs) / 24 - 2.4)) {
    const res = yield* serveAce(c);
    Decide.out(m, 'serve', c.server.id, 'on'); // (an ace already said 'win')
    return res;
  }
  Decide.out(m, 'serve', c.server.id, 'on');
  return yield* serveReceive(c);
}
/** Per-rally state, reset before every serve. */
function rallyStart(m) {
  CM = m;
  m.big = 0;
  m.lastPlay = null; // 'killblock' | 'fake' — used by the zone breaker in end()
  m.hero = null;
  m.busy = {};
  m.ctx = null; // attack context for the element gauge
  m.techRally = [];
  m.errBy = null; // who made the error that ended the rally (chatter)
  m.hypeRally = 0; // at most one staged scene per rally
  m.kbScene = 0; // a kill-block scene played this rally (chatter skips the blocker's line)
  m.defBeats = [];
  m.askAt = 0; // beats index of the last decision point shown this rally (B.ins never inserts before it)
}
/** Choose the serve up front and walk everyone to their spots; the reset and the server's routine beats. */
function* serveWalk(c) {
  const { m, V, B, s, r, ST, RT } = c;
  const oS = rotOrder(ST, m.rot[s]),
    oR = rotOrder(RT, m.rot[r]),
    server = oS[0];
  // the serve is chosen up front (same random draws, same order), so the server walks straight to where it starts:
  // the service spot for a standing float, the start of the run-up for a jump serve / jump float
  let sq = Formula.serveQuality(server, ST);
  // ego (spec §2.12): an ego server goes for the risky jump serve
  const nat = serveType(server, sq),
    egoHero = nat !== 'jump' && egoRoll(m, server, 'serve'),
    ai = egoHero ? 'jump' : nat,
    // a decision point (spec §2.13): your serve — the AI's pick is the one drawn above; your call sets type, pace, risk, aim
    pick = yield* decide(m, { kind: 'serve', p: server, options: () => Decide.serve(c, server, sq), ai }),
    call = DECIDE.serve[pick] ? pick : null,
    sType = call ? DECIDE.serve[call].type || nat : ai,
    hero = egoHero && !call,
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
      acts: [
        { k: 'reset' },
        ...sl,
        { k: 'hold', p: server.id },
        { k: 'rot', snap: snap(m) },
        { k: 'log', t: `Rotation ${(m.rot[s] % 4) + 1}: ${server.name} (${server.role}) to serve` }
      ]
    });
  V &&
    B({
      dur: 1100, // the server's routine (bounce it / spin and aim, see preServe): a beat before the serve
      acts:
        sType !== 'float'
          ? [{ k: 'log', t: `${server.name} paces out a ${runM} m run-up for a ${jumpSrv ? 'jump serve' : 'jump float'}` }]
          : []
    });
  Object.assign(c, { oS, oR, server, sq, hero, sType, jumpSrv, runM, endX, startX, call });
}
/** Run-up pace, ego and serve techniques; the toss (and run-up) beat. */
function serveToss(c) {
  const { m, V, B, s, server, hero, jumpSrv, runM, endX, startX, sType } = c;
  let { sq } = c;
  if (jumpSrv) sq *= 1 + (runM - 3.2) * 0.05; // longer run-up = a bit more pace (±5%)
  if (c.call) sq *= DECIDE.serve[c.call].sq; // your call (spec §2.13)
  if (hero) {
    sq *= EGO.serve.sq;
    m.egoLog.push({ act: 'serve', p: server.id, ok: false, open: (m.stat[server.id] || blank()).ace });
  }
  // serve techniques
  const killer = jumpSrv && hasTech(server, 'killer') && R() < 0.5,
    drive = !jumpSrv && hasTech(server, 'drive') && R() < 0.5,
    targeted = hasTech(server, 'target') && R() < 0.3;
  if (killer) sq *= 1.1;
  if (killer || drive || targeted) techFire(m, server, killer ? 'killer' : drive ? 'drive' : 'target');
  dr(m, server, jumpSrv ? 0.03 : 0.015);
  if (jumpSrv) setBusy(m, server, 2); // lands deep behind the end line: still running in on the first return
  if (sType !== 'float') {
    const z0 = m.pos[server.id].z,
      run = [];
    mv(m, server, sx(s, endX), z0, run, V);
    const pk = jumpPx(server) * (jumpSrv ? 0.8 : 0.35);
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
/** The contact: the cannon cut-in, the error chance, the hit effects; the serving side goes to base. */
function serveContact(c) {
  const { m, V, B, s, ST, server, sq, sType, killer, drive, targeted, hero } = c;
  const sp = m.pos[server.id],
    sArc = sType === 'jump' ? 85 : sType === 'jumpfloat' ? 110 : 130,
    wob = sType !== 'jump';
  if (V && server.star && sq > 74 && R() < 0.7)
    B({ dur: 1250, cut: 1, acts: [{ k: 'cut', p: server.id, title: 'Cannon Serve', sub: `Serve ${kmh(sq)} km/h` }] });
  const serr =
    (Formula.serveErrorP(server, ST, sq) + (killer ? 0.03 : 0) + (hero ? EGO.serve.err * egoOf(server).err : 0)) *
    (c.call ? DECIDE.serve[c.call].err : 1);
  const techName = killer ? 'Killer Jump Serve' : drive ? 'Drive Serve' : targeted ? 'Target Serve' : null;
  const hitFx = [
    { k: 'jump', p: server.id, mode: 'down' },
    { k: 'burst', pow: sq * 0.8, color: ST.color, op: server.op },
    ...(sq > 70 ? [{ k: 'label', t: `${kmh(sq)} km/h`, pow: sq }] : []),
    ...(techName ? [{ k: 'tech', p: server.id, t: techName }] : [])
  ];
  // serving team switches to base positions
  const sw = [];
  ST.P.forEach(p => {
    const h = home(p, s);
    mv(m, p, h[0], h[1], sw, V);
  });
  Object.assign(c, { sp, sArc, wob, serr, hitFx, sw });
}
/** Service error: into the net or long. */
function serveFault(c) {
  const { m, V, B, beats, s, r, server, sq, jumpSrv, sp, hitFx, sw } = c;
  const net = R() < Formula.serveNetShare(server, sq, jumpSrv);
  st(m, server, 'err');
  Decide.out(m, 'serve', server.id, 'err');
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
        { k: 'label', t: net ? 'Into the net' : 'Long!', when: 'end', big: 1 },
        { k: 'log', t: `Service error by ${server.name}`, c: 'err' }
      ]
    });
  return end(m, r, beats);
}
/** Where the serve goes and who takes it (target serve, ego steal, rolling receive); the receive score and flight time. */
function serveAim(c) {
  const { m, V, r, RT, sq, drive, targeted, sw, sp } = c;
  let tx = sx(r, rnd(150, 420)),
    tz = rnd(0.12, 0.88);
  let rc = nearest(
    m,
    RT.P.filter(p => p !== RT.s),
    tx,
    tz
  );
  if (targeted || (c.call && DECIDE.serve[c.call].aim)) {
    // aim just beside the weakest passer so they have to move for it
    rc = RT.P.filter(p => p !== RT.s).reduce((a, p) => (effD(p) + p.speed * 0.3 < effD(a) + a.speed * 0.3 ? p : a));
    const q = m.pos[rc.id];
    tx = clamp(q.x, Math.min(sx(r, 150), sx(r, 420)), Math.max(sx(r, 150), sx(r, 420)));
    tz = clamp(q.z + (q.z > 0.5 ? -0.16 : 0.16), 0.1, 0.9);
  }
  // ego (spec §2.12): a teammate may steal the pass — a collision wrecks it, else they take it
  const steal = egoSteal(
    m,
    RT.P.filter(p => p !== RT.s),
    rc,
    tx,
    tz,
    sw,
    V
  );
  if (steal) {
    if (steal.crash) {
      setBusy(m, rc, 1);
      setBusy(m, steal.thief, 1);
    } else rc = steal.p;
  }
  const d0 = dist(m.pos[rc.id], tx, tz);
  // Rolling Receive: dive-and-roll takes most of the sting out of a long run
  const rollR = hasTech(rc, 'roll') && d0 > 0.5;
  if (rollR) techFire(m, rc, 'roll');
  let rs = Formula.receiveScore(rc, RT, d0) - (drive ? 14 : 0);
  if (steal && steal.crash) rs *= EGO.crash;
  if (rollR) rs += Math.max(0, d0 - 0.1) * 45 * (1.3 - rc.speed / 100) * 0.5;
  // a hard serve gets there sooner (SERVE_FAST: up to ×1.45 from serve 55 to 110)
  const sfast = 1 + clamp((sq - 55) / 55, 0, 1) * (SERVE_FAST - 1),
    sdur = clamp(Math.hypot(tx - sp.x, (tz - sp.z) * Z_UNITS) / (kmh(sq) * SERVE_K * sfast), 400, 1300) * courtScale();
  RT.P.forEach(p => {
    if (p !== rc) {
      const h = home(p, r);
      mv(m, p, h[0], h[1], sw, V);
    }
  });
  Object.assign(c, { tx, tz, rc, steal, d0, rollR, rs, sdur });
}
/** The serve beats the receiver: off the arms (a teammate may save it) or a clean ace. */
function* serveAce(c) {
  const { m, rc, d0, sq } = c;
  // the receiver got an arm on it: sometimes it pops up in their court and a teammate keeps it alive
  const fr = Math.min(1, (0.8 / (d0 + 0.01)) * (0.3 + rc.speed / 200)),
    p0r = m.pos[rc.id];
  if (d0 * (1 - 0.7 * fr) < 0.1 && R() < popChance(rc, sq)) return yield* servePopped(c, fr, p0r);
  return serveAceClean(c);
}
/** Off the receiver's arms: a teammate saves it (rally on) or it drops (ace). */
function* servePopped(c, fr, p0r) {
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
        acts: [
          ...pa.acts,
          { k: 'call', p: P.rec.id, t: callLine('recv', P.rec, m) },
          { k: 'label', t: 'Saved!', when: 'end', set: 1 },
          { k: 'log', t: `${server.name}'s serve pops off ${rc.name}'s arms — ${P.rec.name} saves it!`, c: 'set' }
        ]
      });
    return end(m, yield* rally(m, B, V, r, P.rec, 1, { first: rc }), beats);
  }
  st(m, server, 'ace');
  st(m, server, 'k');
  Decide.out(m, 'serve', server.id, 'win');
  V &&
    B({
      dur: 900,
      acts: [
        ...pa.acts,
        { k: 'impact', pow: 40, when: 'end', kill: 1 },
        { k: 'label', t: 'ACE!', when: 'end', big: 1 },
        { k: 'pose', p: server.id, pose: 'roar', when: 'end' },
        { k: 'log', t: `Ace! ${server.name}'s serve pops off ${rc.name}'s arms and drops`, c: 'pt' }
      ]
    });
  return end(m, s, beats);
}
/** A clean ace (or a shanked pass that never stays up). */
function serveAceClean(c) {
  const { m, V, B, beats, s, r, RT, server, sq, tx, tz, rc, d0, sdur, hitFx, sw, sArc, wob } = c;
  st(m, server, 'ace');
  st(m, server, 'k');
  Decide.out(m, 'serve', server.id, 'win');
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
        { k: 'ball', to: { p: rc.id, c: rcPose }, h: sArc, wob, trail: sq, op: server.op },
        { k: 'log', t: `${rc.name} gets an arm on it…` }
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
        { k: 'pose', p: server.id, pose: 'roar', when: 'end' },
        { k: 'log', t: `Ace! ${server.name} blasts it past ${rc.name}`, c: 'pt' }
      ]
    });
  return end(m, s, beats);
}
/** A served ball received: pass quality, the receive beat, then the rally. */
function* serveReceive(c) {
  const { m, V, B, beats, r, RT, dR, sq, tx, tz, rc, rollR, rs, sdur, hitFx, sw, sArc, wob } = c;
  const mg = rs - sq * 0.85 + rnd(-18, 18),
    q = mg > 12 ? 3 : mg > -8 ? 2 : 1;
  const rDive = rollR || mustDive(rc, m.pos[rc.id], tx - dR * 16, tz, sdur); // run to it, or dive only when out of reach
  if (rDive) setBusy(m, rc, 1); // still on the floor while the team sets
  mv(m, rc, tx - dR * 16, tz, sw, V);
  dr(m, rc, 0.015);
  V &&
    B({
      dur: sdur,
      acts: [
        ...hitFx,
        ...sw,
        { k: 'pose', p: rc.id, pose: rDive ? 'dive' : 'bump' },
        ...(rc.def >= 82 || (m.zone[r] && rc.def >= 65) ? [{ k: 'call', p: rc.id, t: callLine('recv', rc, m) }] : []),
        ...(rollR ? [{ k: 'tech', p: rc.id, t: 'Rolling Receive', when: 'end' }] : []),
        { k: 'ball', to: { p: rc.id, c: rDive ? 'dive' : 'bump' }, h: sArc, wob, trail: sq > 60 ? sq : 0 },
        ...RT.P.filter(p => p !== rc).map(p => ({ k: 'jump', p: p.id, mode: 'hop', peak: 7, t0: 0, t1: 0.2 })),
        ...(rc.elOn ? [{ k: 'efx', el: rc.el, pow: 35, when: 'end' }] : []),
        { k: 'log', t: `${rc.name} ${q === 3 ? 'receives perfectly' : q === 2 ? 'receives' : 'barely digs out the serve'}` }
      ]
    });
  return end(m, yield* rally(m, B, V, r, rc, q), beats);
}
