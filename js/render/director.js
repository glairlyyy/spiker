// The director (spec §2.15, §2.18): how big each play is staged — VFX by the playing team's stage — and the cinematic lines
// between points. Presentation only: reads beats and snapshots, never the engine's randoms. Stub until T-261 / T-263.
// playback.js calls Dir.beat at every beat start, Dir.step every frame, and waits while Dir.busy() before the next rally.

const Dir = {
  /** A new match (or a restart). */
  reset() {},
  /** A beat starts. */
  beat(b) {
    return b;
  },
  /** Every frame (real time, ms). */
  step(raw) {
    return raw;
  },
  /** A stage change act { k: 'stage', side, to, from, why }. */
  stage(a) {
    return a;
  },
  /** True while a between-point exchange holds the next rally. */
  busy() {
    return false;
  },
  /** The director row for a side: the VFX scale of its plays (spec §2.15 table). */
  tier(side) {
    return { stage: 'focused', side };
  }
};
