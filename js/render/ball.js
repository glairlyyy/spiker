// The ball on screen: net clearance of a flight, following the hand that holds it, velocity and free bounces after it
// lands, and the power trail samples (drawn by court.js drawTrail).

/**
 * Net clearance: a ball that the engine sends across the net (a legal serve / attack / free ball) must pass over the
 * tape with room to spare — ball radius plus a margin — instead of cutting through the mesh. Errors never cross:
 * the engine ends those at the net or out, decided by chance and the player's skill (engine/formulas.js).
 */
const NET_CLEAR = 150 + 18; // tape (2.43 m) + ~0.29 m: the ball's radius and a margin, in court h units
/** Lift the arc of `ball` act `a` (from a._f to a._t, extra height a.h at the middle) just enough to clear the net. */
function clearNet(a) {
  const f = a._f,
    t = a._t;
  if ((f.x - NETX) * (t.x - NETX) >= 0) return; // doesn't cross
  const u = (NETX - f.x) / (t.x - f.x),
    k = 4 * u * (1 - u),
    at = lerp(f.h, t.h, u) + (a.h || 0) * k,
    need = NET_CLEAR + (a.wob ? 6 : 0); // a floater's wobble needs a little more room
  if (at < need && k > 0.05) a.h = (a.h || 0) + (need - at) / k; // lift the arc (topspin loop) just enough
}
/** The ball's projected screen point { X, Y, s }. */
function ballScreen() {
  return P(A.ball.x, A.ball.z, A.ball.h);
}
/** Keep a held ball at the holder's hand (the server's routine before a serve: see preServe). Called while A.ball.follow. */
function followBall() {
  const f = A.disp[A.ball.follow];
  if (!f) {
    A.ball.follow = null; // the holder left the court: let the ball go instead of failing every frame
    return;
  }
  if (f.pose === 'preserve' && f.psv) {
    const b = (f.psvB = preServe(f)); // the 3D pose reads the phase (psvB) so the hands move with the ball
    A.ball.vis = b.ph !== 'carry'; // no ball until the server is at their spot and starts the routine
    A.ball.x = b.x;
    A.ball.z = b.z;
    A.ball.h = b.h;
    return;
  }
  A.ball.vis = true;
  A.ball.x = f.x + (DIR(f.side) * 16) / VCS;
  A.ball.z = f.z;
  A.ball.h = 72 + f.jy;
}
/** Bounce cycle (ms) and bounces in the pre-serve routine; hand height of the ball (court h units, 150 = 2.43 m). */
const PSV_CYC = 400,
  PSV_N = 2,
  PSV_HAND = 56;
/**
 * The server's routine before the serve, on f.psv.t (ms at the service spot): 'bounce' — two bounces off the right
 * hand, catch, bring it up and look at the target; 'aim' — spin it in both hands, then hold it out in the left hand
 * at eye height toward the other court. Returns the ball { x, z, h } and the phase the 3D pose follows
 * ({ ph: 'carry' | 'bounce' | 'chest' | 'spin' | 'aim', k: 0..1 blend }). Walking in: carried at the right hip.
 */
function preServe(f) {
  const S = f.psv,
    fw = DIR(f.side),
    rz = f.side === 0 ? -1 : 1, // the player's right, in court z
    at = (fwd, right, h, ph, k = 1) => ({ x: f.x + (fw * fwd) / MX, z: f.z + (rz * right) / MZ, h, ph, k }),
    t = S.t,
    ease = u => u * u * (3 - 2 * u);
  if (t <= 0 || moveM(f) > 0.15) return at(0.18, 0.24, 50, 'carry'); // walking in / pacing out a run-up
  if (S.kind === 'bounce') {
    if (t < PSV_CYC * PSV_N) {
      const c = (t % PSV_CYC) / PSV_CYC,
        h = PSV_HAND * Math.abs(Math.cos(Math.PI * c)); // hand → floor (c = 0.5) → hand
      if (Math.abs(c - 0.5) < 0.04 && !S.bnc) {
        S.bnc = 1;
        sfx.bounce();
      } else if (Math.abs(c - 0.5) > 0.1) S.bnc = 0;
      return at(0.36, 0.2, Math.max(8, h), 'bounce', c);
    }
    const u = ease(Math.min(1, (t - PSV_CYC * PSV_N) / 300)); // catch, up to the chest, eyes on the target
    return at(0.36 - 0.08 * u, 0.2 - 0.18 * u, PSV_HAND + 30 * u, 'chest', u);
  }
  if (t < 500) {
    A.spin = (A.spin || 0) + 0.25; // spinning it between the hands
    return at(0.28, 0.02, 78, 'spin', Math.min(1, t / 200));
  }
  const u = ease(Math.min(1, (t - 500) / 350)); // left arm out, ball at eye height toward the other court
  return at(0.28 + 0.27 * u, 0.02 - 0.14 * u, 78 + 24 * u, 'aim', u);
}
/** Free-bounce physics after the ball lands (court units per ms): gravity, energy lost per hop, ends after 1.6 s. */
const BOUNCE_G = 0.0011,
  BOUNCE_MS = 1600;
/** Ball velocity from the tween (for bounces) and free bounces after the ball hits the floor. */
function ballPhysics(dt) {
  const B = A.ball,
    q = A.bounce;
  if (q && B.vis) {
    q.t += dt;
    B.x = clamp(B.x + q.vx * dt, -90, 1090);
    B.z = clamp(B.z + q.vz * dt, -0.4, 1.4);
    q.vh -= BOUNCE_G * dt;
    B.h += q.vh * dt;
    if (B.h <= 0) {
      B.h = 0;
      if (q.vh < -0.05) {
        q.vh = -q.vh * 0.5;
        q.vx *= 0.65;
        q.vz *= 0.65;
        sfx.bounce();
      } else {
        q.vh = 0;
        q.vx *= 0.9;
        q.vz *= 0.9;
      }
    }
    if (q.t > BOUNCE_MS) A.bounce = null;
  }
  const p = A.bp;
  if (p && dt > 0) A.bv = { x: (B.x - p.x) / dt, z: (B.z - p.z) / dt, h: (B.h - p.h) / dt };
  A.bp = { x: B.x, z: B.z, h: B.h };
  // ball speed in m/s (court units per ms × ms → m: 1 unit = 0.0243 m along the court, 12 m per z, 0.0162 m per height unit), smoothed
  // into A.mv 0..1 (invisible ≤ 1.5 m/s, full ≥ 5.5 m/s): the ball's trails dim out while it rests
  if (A.bv) {
    const mps = Math.hypot(A.bv.x * 0.0243, A.bv.z * 12, A.bv.h * 0.0162) * 1000;
    A.mv = (A.mv || 0) + (clamp((mps - 1.5) / 4, 0, 1) - (A.mv || 0)) * (1 - Math.exp(-dt / (mps > 1.5 ? 60 : 150)));
  }
}
/** Power-trail samples: longer for harder balls; the tail shrinks away once the ball is unpowered. */
function stepTrail() {
  if (A.trailPow) {
    const q = ballScreen();
    A.trail.push({ x: q.X, y: q.Y });
    const max = Math.round(8 + A.trailPow / 4); // a harder hit leaves a longer streak too
    if (A.trail.length > max) A.trail.splice(0, A.trail.length - max);
  } else if (A.trail.length) A.trail.shift();
}
