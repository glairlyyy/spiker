// Slow-motion cooldown (owner, 2026-10-09; display only): slow motion plays for a team at most once every VFX.slowcd.pts
// points — per kind, or (shared) one cooldown for all kinds — the rest of the time that moment runs at normal speed. Kinds: staged hype scenes (their build-up,
// the defence read and the scene beats; skipped like Hype off), the impact frame, the fake set, the scramble, the kill block /
// block break, the Delayed Spike hang, the near-miss dig. Exempt: slow motion that hides the animation — the far-dig chase
// (the world slows so the digger can get there) — and the cut-scenes. The team is the rally's winner (its point act), else
// the side the moment belongs to; a kind is decided once per rally (a scene spans several beats).

const SlowMo = {
  /** A rally's reset: forget this rally's decisions. */
  reset() {
    A.slowRally = {};
  },
  /** The side whose cooldown counts: the winner of the rally being played (from its queued beats), else `fallback`. */
  sideOf(fallback) {
    for (let i = A.bi; i < (A.beats || []).length; i++) {
      const pt = A.beats[i].acts.find(a => a.k === 'point');
      if (pt) return pt.side;
    }
    return fallback ?? 0;
  },
  /**
   * May a slow motion of `kind` play for `side` now? Decided once per rally (later beats of the same kind follow); a yes
   * starts that team's cooldown for the kind. Off (VFX.slowcd.on 0): always.
   */
  take(kind, side) {
    if (!VFX.slowcd.on) return true;
    if (VFX.slowcd.shared) kind = 'any'; // one cooldown for every kind: a team's slow-motion rally, then N points of none
    const R = A.slowRally || (A.slowRally = {});
    if (kind in R) return R[kind];
    const last = A.slowLast || (A.slowLast = {}),
      L = last[kind] || (last[kind] = [-99, -99]),
      n = A.pointN || 0,
      ok = n - L[side] >= VFX.slowcd.pts;
    if (ok) L[side] = n;
    R[kind] = ok;
    return ok;
  },
  /** The slow-motion kind of an engine beat (null: none, or exempt). */
  kindOf(b) {
    if (b.scene || b.sceneSlow) return 'scene';
    if (b.hypeSlow) return b.acts.some(a => a.k === 'ball' && a.to && a.to.c === 'spike') ? 'scene' : 'scramble'; // the read, or a scramble
    if (b.slow === 0.3) return 'fake';
    if (b.slow || b.freeze) {
      if (b.acts.some(a => a.k === 'tech' && /Delayed/.test(a.t || ''))) return 'delayed';
      if (b.acts.some(a => a.k === 'squash' || a.k === 'netshake' || a.k === 'drill')) return 'block';
    }
    return null;
  },
  /**
   * At a beat's first frame, before it starts (playback step): a beat whose kind is cooling down for its team loses its slow
   * motion — a staged scene is skipped (as with Hype off), any other beat just plays at normal speed.
   */
  beat(b) {
    if (b.acts.some(a => a.k === 'reset')) SlowMo.reset();
    const k = SlowMo.kindOf(b);
    if (!k || SlowMo.take(k, SlowMo.sideOf())) return;
    if (b.scene) {
      b.dur = 1;
      b.acts = [];
    }
    b.slow = 0;
    b.slowAt = null;
    b.hypeSlow = 0;
    b.sceneSlow = 0;
    b.freeze = 0;
  }
};
