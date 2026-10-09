// Cinematic camera for a big moment (owner, 2026-10-08; display only): picked from the rally's beats before they play, framed
// by the 3D renderer as one tracked shot (A.shot kind 'cine', its cut-scene `cut` and phase `ph` — camera3d cinePose) that
// glides between phases. Budget: one per CINE.every points a side scores (per side), whichever cut-scene it is.
//   ace — the ball in the server's hands as they bounce it, down to the feet for the run-up, a side view of the hit, then the
//         camera rides the ball to the floor;
//   ws  — a wing spiker's kill: over the hitter's shoulder as the set goes up, low at the feet for the approach, beside the
//         arm at the swing, then riding the ball to the floor;
//   quick — a middle's quick kill: on the setter as the pass comes in (the middle already going up behind), beside the
//         middle's arm in the air for the set and the hit, then riding the ball to the floor.

/** every: points a side scores between its cinematics; hype: the Hype setting it needs. Camera numbers: VFX groups by `cut`. */
const CINE = { every: 2, hype: 1 };
/**
 * The cut-scenes (the Cut-scene lab lists them; menu › Dev). For each: its phases → the VFX group with the camera numbers
 * (js/data/vfx.js, `lab: 'cine'`, `cut`) and how that group frames (feet: from the player's feet; hand: from the hitting
 * hand; ride: behind the ball; a third entry 'p2' frames the setter instead of the hitter), and `slow`: the group whose
 * `slow` is the world's time scale until the ball phase.
 */
const CINE_KINDS = [
  {
    id: 'ace',
    name: 'Ace',
    tip: 'Every serve is an ace: bounce, run-up, the hit, riding the ball to the floor',
    ph: { bounce: ['cbounce', 'feet'], run: ['crun', 'feet'], hit: ['chit', 'hand'], ball: ['cball', 'ride'] }
  },
  {
    id: 'ws',
    name: 'WS kill',
    tip: "Every wing spiker's kill: the set over the hitter's shoulder, the approach, the swing, riding the ball to the floor",
    ph: { set: ['wset', 'feet'], run: ['wrun', 'feet'], hit: ['whit', 'hand'], ball: ['wball', 'ride'] },
    slow: 'wrun'
  },
  {
    id: 'quick',
    name: 'MB quick',
    tip: "Every middle's quick kill: the setter taking the pass, the middle in the air for the set and the hit, riding the ball down",
    ph: { set: ['qset', 'feet', 'p2'], hit: ['qhit', 'hand'], ball: ['qball', 'ride'] },
    slow: 'qhit'
  }
];
const cineKind = id => CINE_KINDS.find(k => k.id === id);
const Cine = {
  /** At a beat's start (playback startBeat): count points for the budget; at a rally's reset end the last one; look for one. */
  beat(b) {
    if (!A.cineCool) A.cineCool = [CINE.every, CINE.every];
    for (const a of b.acts) if (a.k === 'point' && a.side != null) A.cineCool[a.side]++;
    if (b.acts.some(a => a.k === 'reset')) {
      Cine.stop();
      A.cineSeen = 0; // beats of this rally already looked at
    }
    // the rally's beats so far (a played match with prompts gets them in parts): look again when there are new ones
    if (!A.cine && (A.beats || []).length > (A.cineSeen || 0)) {
      Cine.choose();
      A.cineSeen = A.beats.length;
    }
  },
  /** A rally that ends in an ace, a WS kill or an MB quick kill, by a side with budget (Hype off / reduced motion / fixed camera: none). */
  choose() {
    const dev = A.cineForce; // the Cut-scene lab: that cut-scene every time, whatever the settings
    if (!dev && (RM || G.camFixed || HYPE[G.hype].max < CINE.hype)) return;
    const c = Cine.ace() || Cine.kill();
    if (!c || (dev && c.kind !== dev)) return;
    const d = A.disp[c.p];
    if (!d || (!dev && A.cineCool[d.side] < CINE.every)) return;
    A.cineCool[d.side] = 0;
    A.cine = c;
  },
  /** From this rally's reset: an ace → { kind, p: the server, end: the ace beat }. */
  ace() {
    const B = A.beats || [],
      r = B.findIndex((b, i) => i >= A.bi && b.acts.some(a => a.k === 'reset'));
    if (r < 0) return null;
    const hold = B[r].acts.find(a => a.k === 'hold');
    for (let i = r; i < B.length && hold; i++)
      if (B[i].acts.some(a => a.k === 'label' && a.t === 'ACE!')) return { kind: 'ace', p: hold.p, end: i };
    return null;
  },
  /**
   * From the current beat: a wing spiker's kill (ws) or a middle's quick kill (quick) → { kind, p: the hitter, p2: the setter,
   * set: the set beat, start, end: the kill beat } — the last set to a hitter before a killing landing, and the point goes to
   * the hitter's side (not a stuff).
   */
  kill() {
    const B = A.beats || [];
    let set = null;
    for (let i = A.bi; i < B.length; i++) {
      const acts = B[i].acts,
        s = acts.find(a => a.k === 'ball' && a.to && a.to.c === 'spike' && a.to.p && a.when !== 'end');
      if (s) set = { p: s.to.p, i };
      if (set && i > set.i && acts.some(a => a.k === 'impact' && a.kill)) {
        const pt = B.slice(i).find(b => b.acts.some(a => a.k === 'point')),
          side = pt && pt.acts.find(a => a.k === 'point').side,
          d = A.disp[set.p];
        // the shot starts with the pass to the setter when there is one (the set seen coming), else with the set
        const pass = set.i > 0 && B[set.i - 1].acts.find(a => a.k === 'ball' && a.to && a.to.c === 'set' && a.to.p),
          start = pass && set.i - 1 >= A.bi ? set.i - 1 : set.i,
          quick = B[set.i].acts.some(a => a.k === 'spkstyle' && a.p === set.p && a.st === 'quick'),
          kind = !d || side !== d.side ? null : d.p.role === 'WS' ? 'ws' : d.p.role === 'MB' && quick && pass ? 'quick' : null;
        return kind ? { kind, p: set.p, p2: pass ? pass.to.p : null, set: set.i, start, end: i } : null;
      }
      if (acts.some(a => a.k === 'point')) return null;
    }
    return null;
  },
  /** Each frame (dt: real ms): start the shot when its moment begins, set its phase, end it after the landing. */
  step(dt) {
    const c = A.cine;
    if (!c) return;
    const K = cineKind(c.kind),
      ride = VFX[K.ph.ball[0]];
    if (A.bi > c.end) c.after = (c.after || 0) + dt; // the ball is down: stay on it a moment
    if (A.done || c.after > ride.hold) return Cine.stop();
    const d = A.disp[c.p];
    if (!d) return Cine.stop();
    if (!A.shot) {
      const go = c.kind === 'ace' ? d.pose === 'preserve' && d.psv && d.psv.t > 0 && moveM(d) <= 0.15 : A.bi >= c.start;
      if (go) A.shot = { kind: 'cine', cut: c.kind, p: c.p, p2: c.p2 || null, track: true };
    }
    if (!Cine.busy()) return;
    camRelease(); // no push-ins on top of the cinematic
    const far = Math.hypot((A.ball.x - d.x) * MX, (A.ball.z - d.z) * MZ),
      handOff = VFX[K.ph.hit[0]].far,
      after = far < handOff && A.ball.h > 20 ? 'hit' : 'ball'; // the ball has left the hand
    if (c.kind === 'ace')
      A.shot.ph = d.pose === 'preserve' ? 'bounce' : A.lastP === c.p ? (d.jy > 8 || d.spkStyle === 'float' ? 'hit' : 'run') : after;
    else if (c.kind === 'quick') A.shot.ph = A.bi < c.set ? 'set' : A.lastP === c.p ? 'hit' : after;
    else {
      const b = A.beats[A.bi],
        early = A.bi === c.set && b && A.el < b.dur * VFX.wset.until; // the set is still going up
      A.shot.ph = A.bi < c.set ? 'set' : A.lastP === c.p ? (d.jy > 8 ? 'hit' : early ? 'set' : 'run') : A.bi <= c.set ? 'set' : after;
    }
  },
  /** World time scale for the cinematic (clock.js timeScale): slow motion until the ball phase (the kind's `slow` group). */
  slow() {
    const K = Cine.busy() && cineKind(A.shot.cut),
      s = K && K.slow && A.shot.ph !== 'ball' ? VFX[K.slow].slow : 1;
    return s > 0 ? s : 1;
  },
  /** Back to the game camera. */
  stop() {
    if (Cine.busy()) A.shot = null;
    A.cine = null;
  },
  /** The cinematic has the camera (a `shot` act and endScene leave it alone). */
  busy: () => !!(A && A.cine && A.shot && A.shot.kind === 'cine')
};
