// Cinematic camera for a big moment (owner, 2026-10-08; display only): picked from the rally's beats before they play, framed
// by the 3D renderer as one tracked shot (A.shot kind 'ace', phase A.shot.ph — camera3d shotPose) that glides between phases.
// First moment: the serve ace — the ball in the server's hands as they bounce it, down to the feet for the run-up, a side view
// of the hit, then the camera rides the ball to the floor. Budget: one per CINE.every points a side scores (per side).

/** every: points a side scores between its cinematics; hold: ms the camera stays on the landing after the ace beat. */
const CINE = { every: 2, hold: 500, hype: 1, hitM: 3 };
const Cine = {
  /** At a beat's start (playback startBeat): count points for the budget; at a rally's reset, end the last one and pick. */
  beat(b) {
    if (!A.cineCool) A.cineCool = [CINE.every, CINE.every];
    for (const a of b.acts) if (a.k === 'point' && a.side != null) A.cineCool[a.side]++;
    if (b.acts.some(a => a.k === 'reset')) {
      Cine.stop();
      Cine.choose(b);
    }
  },
  /** A rally that ends in an ace by a side with budget: the cinematic for its server (Hype off / reduced motion / fixed camera: none). */
  choose(b) {
    if (RM || G.camFixed || HYPE[G.hype].max < CINE.hype) return;
    const hold = b.acts.find(a => a.k === 'hold'),
      d = hold && A.disp[hold.p];
    if (!d || A.cineCool[d.side] < CINE.every) return;
    let end = -1;
    for (let i = A.bi; i < (A.beats || []).length && end < 0; i++)
      if (A.beats[i].acts.some(a => a.k === 'label' && a.t === 'ACE!')) end = i;
    if (end < 0) return;
    A.cineCool[d.side] = 0;
    A.cine = { kind: 'ace', p: hold.p, end };
  },
  /** Each frame (dt: real ms): start the shot once the server begins the routine, set its phase, end it after the landing. */
  step(dt) {
    const c = A.cine;
    if (!c) return;
    if (A.bi > c.end) c.after = (c.after || 0) + dt; // the ball is down: stay on it a moment
    if (A.done || c.after > CINE.hold) return Cine.stop();
    const d = A.disp[c.p];
    if (!d) return Cine.stop();
    if (!A.shot && d.pose === 'preserve' && d.psv && d.psv.t > 0 && moveM(d) <= 0.15) A.shot = { kind: 'ace', p: c.p, track: true };
    if (!A.shot || A.shot.kind !== 'ace') return;
    camRelease(); // no push-ins on top of the cinematic
    const far = Math.hypot((A.ball.x - d.x) * MX, (A.ball.z - d.z) * MZ);
    A.shot.ph =
      d.pose === 'preserve'
        ? 'bounce'
        : A.lastP === c.p
          ? d.jy > 8 || d.spkStyle === 'float'
            ? 'hit'
            : 'run'
          : far < CINE.hitM && A.ball.h > 20
            ? 'hit'
            : 'ball';
  },
  /** Back to the game camera. */
  stop() {
    if (A.shot && A.shot.kind === 'ace') A.shot = null;
    A.cine = null;
  },
  /** A `shot` act is ignored while a cinematic runs. */
  busy: () => !!(A && A.cine && A.shot && A.shot.kind === 'ace')
};
