// The director (spec §2.15, §2.18): how big each play is staged — VFX by the playing team's stage — and the cinematic lines
// between points. Presentation only: reads beats and snapshots, never the engine's randoms.
// playback.js calls Dir.beat at every beat start, Dir.step every frame, and waits while Dir.busy() before the next rally.

/**
 * The §2.15 table, one row per stage. size: every effect × · air: the air impact's power floor, rings and dome (null: none) ·
 * shake × · ball: the ball trail style · frame: the impact frame on a kill (power floor, once per `every` points; null: none) ·
 * bounce / blast: the kill bounce and ground blast · aura: the players' look ('haze' grey, 'faint', 'full').
 */
const DIR_ROWS = {
  loose: { size: 0.5, air: null, shake: 0, ball: 'streak', frame: null, bounce: 0, blast: 0, aura: 'haze' },
  composed: { size: 0.7, air: { min: 90, rings: 2, dome: 0 }, shake: 0.5, ball: 'streak', frame: null, bounce: 0, blast: 0, aura: '' },
  focused: {
    size: 1,
    air: { min: 70, rings: 3, dome: 0 },
    shake: 1,
    ball: 'ribbon',
    frame: { min: 100, every: 4 },
    bounce: 1,
    blast: 0,
    aura: 'faint'
  },
  fever: {
    size: 1.3,
    air: { min: 58, rings: 4, dome: 1 },
    shake: 1.5,
    ball: 'ink',
    frame: { min: 90, every: 1 },
    bounce: 1,
    blast: 1,
    aura: 'full'
  }
};

const Dir = {
  /** The play being staged: { side, stage (with the OP / element step), kill (the attack ends in a kill), atk }; null = none yet. */
  cur: null,
  /** The point index (A.pointN) of each side's last impact frame. */
  lastFrame: [-99, -99],
  /** fx counts per stage this match (QA readout): stage → { air, frame, bounce, blast } */
  count: {},
  /** A new match (or a restart). */
  reset() {
    this.cur = null;
    this.lastFrame = [-99, -99];
    this.count = {};
    this.resetLines();
  },
  /** Director on? (VFX panel → Director; off: the panel's raw values, as before T-261) */
  on() {
    return typeof VFX === 'undefined' || !VFX.dir || !!VFX.dir.on;
  },
  /** A side's stage as shown (the scoreboard's), or the VFX panel's forced stage. */
  stageOf(side) {
    const f = typeof VFX !== 'undefined' && VFX.dir && VFX.dir.force;
    if (f && f !== 'off' && DIR_ROWS[f]) return f;
    return (typeof A !== 'undefined' && A && A.stageShown && A.stageShown[side]) || 'composed';
  },
  /** One stage hotter (OP players and element spikes count one stage higher, for effects only). */
  up(stage) {
    return STAGE_IDS[Math.min(STAGE_IDS.length - 1, STAGE_IDS.indexOf(stage) + 1)] || stage;
  },
  /** The director row for a side: the VFX scale of its plays (spec §2.15 table); `bump` = an OP hitter or an element spike. */
  tier(side, bump) {
    const st = bump ? this.up(this.stageOf(side)) : this.stageOf(side);
    return { stage: st, side, ...DIR_ROWS[st] };
  },
  /** The row of the play on screen now (null with the director off or before the first play). */
  row() {
    if (!this.on() || !this.cur || typeof A === 'undefined' || !A) return null;
    return DIR_ROWS[this.cur.stage];
  },
  /** A beat starts: whose play it is. A spike beat (it carries `spkstyle`) looks ahead for the kill. */
  beat(b) {
    if (!b || !b.acts || typeof A === 'undefined' || !A) return b;
    this.beatLines(b);
    const sw = b.acts.find(x => x.k === 'spkstyle'),
      who = sw ? sw.p : (b.acts.find(x => x.p && A.disp[x.p]) || {}).p,
      d = who && A.disp[who];
    if (!d) return b;
    if (sw) {
      const br = b.acts.find(x => x.k === 'burst');
      let kill = false;
      for (let i = A.bi; i < Math.min(A.beats.length, A.bi + 4); i++) {
        const im = A.beats[i].acts.find(x => x.k === 'impact');
        if (im) {
          kill = !!(im.kill && !im.blk);
          break;
        }
      }
      this.cur = { side: d.side, stage: this.tier(d.side, !!(d.p.op || (br && br.el))).stage, kill, atk: true };
    } else if (!this.cur || this.cur.side !== d.side) this.cur = { side: d.side, stage: this.stageOf(d.side), kill: false, atk: false };
    return b;
  },
  /** Every effect's size × (1 with the director off). */
  k() {
    const r = this.row();
    return r ? r.size : 1;
  },
  /** The air impact's power floor (Infinity: none at this stage). */
  airMin() {
    const r = this.row();
    if (!r) return VFX.air.min;
    return r.air ? r.air.min : Infinity;
  },
  /** Rings at full power. */
  airRings() {
    const r = this.row();
    return r && r.air ? r.air.rings : VFX.air.rings;
  },
  /** The dome's power floor (201 = none). */
  airDome() {
    const r = this.row();
    return r ? (r.air && r.air.dome ? VFX.air.dome : 201) : VFX.air.dome;
  },
  /** Camera shake ×. */
  shakeK() {
    const r = this.row();
    return r ? r.shake : 1;
  },
  /** The ball trail style: the row's, or the VFX panel's ('off' there always wins). */
  ballStyle() {
    const r = this.row();
    return r && VFX.ball.style !== 'off' ? r.ball : VFX.ball.style;
  },
  /** Kill bounce allowed now. */
  bounceOn() {
    const r = this.row();
    return r ? !!r.bounce : !!VFX.bounce.on;
  },
  /** Ground blast allowed now. */
  blastOn() {
    const r = this.row();
    return r ? !!r.blast : !!VFX.blast.on;
  },
  /** The impact frame for a spike of power `pow`: the row's floor on a kill, once per `every` points per side. */
  frameOk(pow) {
    const r = this.row();
    if (!r) return !!VFX.frame.on && pow >= VFX.frame.min;
    if (!r.frame || !this.cur.kill || pow < r.frame.min || !VFX.frame.on) return false;
    const s = this.cur.side,
      n = A.pointN || 0;
    if (n - this.lastFrame[s] < r.frame.every) return false;
    this.lastFrame[s] = n;
    return true;
  },
  /** Count an effect for the QA readout (by the stage of the play). */
  tally(kind) {
    const st = this.cur ? this.cur.stage : 'none',
      c = this.count[st] || (this.count[st] = {});
    c[kind] = (c[kind] || 0) + 1;
    if (kind === 'air') Object.assign(c, { rings: this.airRings(), dome: this.airDome() < 201, size: this.k() });
  },
  /** The look of a side's players: 'haze' | '' | 'faint' | 'full' (director off: the old look, full in the zone). */
  aura(side) {
    if (!this.on()) return typeof A !== 'undefined' && A && A.zoneShown && A.zoneShown[side] ? 'full' : '';
    return DIR_ROWS[this.stageOf(side)].aura;
  },
  /** Every frame (real time, ms). */
  step(raw) {
    this.stepLines(raw);
    return raw;
  },
  /** A stage change act { k: 'stage', side, to, from, why }. */
  stage(a) {
    this.stageLine(a);
    return a;
  },
  /** True while a between-point exchange holds the next rally. */
  busy() {
    return !!this.talk;
  },
  // ---------- lines (T-263) ----------
  talk: null,
  resetLines() {
    this.talk = null;
  },
  beatLines() {},
  stepLines() {},
  stageLine() {}
};
