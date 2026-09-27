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
/** Keep a held ball at the holder's hand (bouncing it before a serve while A.dribble). */
function followBall() {
  const f = A.disp[A.ball.follow];
  if (!f) {
    A.ball.follow = null; // the holder left the court: let the ball go instead of failing every frame
    return;
  }
  A.ball.x = f.x + (DIR(f.side) * 16) / VCS;
  A.ball.z = f.z;
  if (A.dribble && f.pose !== 'serve') {
    const c = Math.abs(Math.cos(performance.now() * 0.0075));
    A.ball.h = 6 + 58 * c;
    if (c < 0.08 && !A.bnc) {
      A.bnc = 1;
      sfx.bounce();
    } else if (c > 0.3) A.bnc = 0;
  } else A.ball.h = 72 + f.jy;
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
}
/** Power-trail samples: longer for harder balls; the tail shrinks away once the ball is unpowered. */
function stepTrail() {
  if (A.trailPow) {
    const q = ballScreen();
    A.trail.push({ x: q.X, y: q.Y });
    const max = Math.round(8 + A.trailPow / 5);
    if (A.trail.length > max) A.trail.splice(0, A.trail.length - max);
  } else if (A.trail.length) A.trail.shift();
}
