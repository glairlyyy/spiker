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

/**
 * The arena row (spec §2.15, last line) for the hotter team's stage: house light × (dim), a warm tint (0–1), the team rim
 * light (0/1), crowd bounce × and a standing baseline (on its feet), music gain ×.
 */
const DIR_ARENA = {
  loose: { dim: 0.85, warm: 0, rim: 0, crowd: 0.4, stand: 0, music: 0.8 },
  composed: { dim: 1, warm: 0, rim: 0, crowd: 1, stand: 0, music: 1 },
  focused: { dim: 1, warm: 1, rim: 0, crowd: 1.3, stand: 0.15, music: 1.05 },
  fever: { dim: 0.65, warm: 0, rim: 1, crowd: 1.5, stand: 0.45, music: 1.15 }
};

const Dir = {
  /** The play being staged: { side, stage (with the OP / element step), kill (the attack ends in a kill), atk }; null = none yet. */
  cur: null,
  /** The point index (A.pointN) of each side's last impact frame. */
  lastFrame: [-99, -99],
  /** fx counts per stage this match (QA readout): stage → { air, frame, bounce, blast } */
  count: {},
  /**
   * Crowd heat (spec §2.27): 0–1, how fired up the venue is. Rises with long rallies, a team's Fever, big points and streaks;
   * a floor that climbs as the match goes on (the game warms the crowd); drifts back to the floor in about 20 s; held high
   * through a set / match point. Presentation only: the crowd, the music and the venue's air (wind outside, embers and
   * flames inside — js/render3d/ambient3d.mjs) follow it.
   */
  heat: 0,
  /** The highest heat this match: the venue's air keeps what it reached (owner, 2026-10-12: it stays once it has appeared). */
  heatMax: 0,
  /** The heat's floor now (it climbs with the points played: up to HEAT.floor by 30 points). */
  heatFloor() {
    const p = typeof A !== 'undefined' && A && A.m ? A.m.pts[0] + A.m.pts[1] : 0;
    return Math.max(Math.min(HEAT.floor, (p / 30) * HEAT.floor), this.hush ? HEAT.hush : 0);
  },
  /** Heat up by v (capped at 1). */
  heatAdd(v) {
    this.heat = Math.min(1, Math.max(this.heat, this.heatFloor()) + v);
    this.heatMax = Math.max(this.heatMax, this.heat);
  },
  /** A point is scored (act `point`): its rally's length, a big point, a streak. */
  heatPoint(a, touches) {
    const H = HEAT;
    this.heatAdd(
      H.point +
        (a.big ? H.big : 0) +
        (a.streak >= 3 ? H.streak : 0) +
        (touches >= 15 ? H.marathon : touches >= 12 ? H.long : touches >= 8 ? H.rally : 0)
    );
  },
  /** The heat's tier: calm · buzzing · roaring · inferno. */
  heatTier() {
    const h = this.heat;
    return h >= HEAT.inferno ? 'inferno' : h >= HEAT.roaring ? 'roaring' : h >= HEAT.buzzing ? 'buzzing' : 'calm';
  },
  /** A new match (or a restart). */
  reset() {
    this.heat = this.heatMax = 0;
    this.cur = null;
    this.lastFrame = [-99, -99];
    this.sceneOn = null;
    this.lastScene = -99;
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
    this.sceneGate(b);
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
  /**
   * Staged moments (spec §2.18): a scene (engine/hype.js — close-up + subtitle before a decisive hit) plays only when its
   * team is Focused or hotter (an OP player one stage up) and at most once per 3 points; otherwise its beats are dropped,
   * as the Hype setting drops them. Decided on a scene's first beat for the whole scene.
   */
  sceneGate(b) {
    if (!b.scene) return (this.sceneOn = null);
    if (this.sceneOn == null) {
      const a = b.acts.find(x => x.p && A.disp[x.p]),
        d = a && A.disp[a.p],
        st = d ? STAGE_IDS.indexOf(this.tier(d.side, !!d.p.op).stage) : 0,
        n = A.pointN || 0;
      this.sceneOn = !this.on() || (st >= STAGE_IDS.indexOf('focused') && n - (this.lastScene ?? -99) >= 3);
      if (this.sceneOn && this.on()) this.lastScene = n;
    }
    if (!this.sceneOn) {
      b.dur = 1;
      b.acts = [];
    }
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
    if (VFX.ball.style !== 'off' && this.inzone(this.cur && this.cur.atk ? this.cur.side : -1)) return 'ink'; // INZONE!! (spec §2.37)
    const r = this.row(),
      st = r && VFX.ball.style !== 'off' ? r.ball : VFX.ball.style,
      s = st === 'off' ? 0 : specialFx(A && A.trailBy, 'ink'); // the ink style: the hitter's if special (spec §4.30)
    return s === 2 ? 'ink' : st === 'ink' && !s ? 'ribbon' : st;
  },
  /** INZONE!! (spec §2.37, T-346) active for side: its attacks in the Ink style (VFX.op.ink), the focus vignette (r3d). */
  inzone(side) {
    return side >= 0 && typeof OpShow !== 'undefined' && !!VFX.op.ink && OpShow.on('inzone', side);
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
    if (!r) return !!VFX.frame.on && pow >= VFX.frame.min && SlowMo.take('impact', SlowMo.sideOf());
    if (!r.frame || !this.cur.kill || pow < r.frame.min || !VFX.frame.on) return false;
    if (!SlowMo.take('impact', this.cur.side)) return false; // the slow-motion cooldown per team
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
  /**
   * The arena follows the hotter team (spec §2.15): the higher stage (ties: the higher fire). → { side, stage, ...DIR_ARENA row };
   * director off: the old zone look (the zone team's rim, lights at 65 %).
   */
  arena() {
    if (!this.on()) {
      const zs = (A && A.zoneShown) || [false, false],
        zi = zs[0] ? 0 : zs[1] ? 1 : -1;
      return zi >= 0
        ? { side: zi, stage: 'fever', ...DIR_ARENA.fever, warm: 0, crowd: 1, stand: 0, music: 1 }
        : { side: -1, stage: 'composed', ...DIR_ARENA.composed };
    }
    const i = [0, 1].map(s => STAGE_IDS.indexOf(this.stageOf(s))),
      f = (A && A.m && (A.m.fire || A.m.mom)) || [0, 0],
      side = i[0] !== i[1] ? (i[0] > i[1] ? 0 : 1) : f[0] >= f[1] ? 0 : 1,
      stage = STAGE_IDS[i[side]] || 'composed';
    return { side, stage, ...DIR_ARENA[stage] };
  },
  /** Every frame (real time, ms): the music follows the arena, the lines run. */
  step(raw) {
    if (typeof musicMood === 'function') musicMood(this.hush ? 0.5 : this.arena().music * (1 + HEAT.music * this.heat));
    // the heat drifts back toward its floor (real time: about 20 s)
    const fl = this.heatFloor();
    this.heat = this.heat > fl ? fl + (this.heat - fl) * Math.exp(-(raw || 0) / HEAT.decayMs) : fl;
    this.heatMax = Math.max(this.heatMax, this.heat);
    this.stepLines(raw);
    return raw;
  },
  /** A stage change act { k: 'stage', side, to, from, why }. */
  stage(a) {
    if (a.to === 'fever') this.heatAdd(HEAT.fever); // a team catches fire: so does the crowd (spec §2.27)
    this.stageLine(a);
    return a;
  },
  /** True while a between-point exchange holds the next rally. */
  busy() {
    return !!this.talk;
  },
  // ---------- lines (T-263, spec §2.18) ----------
  /** The exchange on screen (holds the next rally): { t: ms shown } — cleared when the box ends (a safety cap of 12 s). */
  talk: null,
  /** Set / match point: the crowd and music go down until the serve (spec §2.18). */
  hush: false,
  resetLines() {
    this.talk = null;
    this.hush = false;
    this.ev = []; // this rally's events: { kind, side, p, q } (p / q player ids where the beats name them)
    this.rally = {}; // hit (the last spiker), blk (their blocker)
    this.duels = {}; // 'hitter|blocker' → times met
    this.pend = null; // the rally's point { side, streak } — the exchange comes once its beats have played
    this.snapPts = [0, 0];
    this.mpSide = -1; // who held set point at the last point (a new holder = a new hush)
    this.lastTalk = -99; // the point number of the last exchange (the budget)
    this.said = []; // QA: every exchange { n, kind, stage } this match
  },
  /** A beat starts: read its acts for the story's events (a duel, the point). */
  beatLines(b) {
    if (!this.ev) this.resetLines();
    const acts = b.acts,
      P = id => A.disp[id] && A.disp[id].p;
    for (let i = 0; i < acts.length; i++) {
      const a = acts[i];
      if (a.k === 'reset') {
        this.ev = [];
        this.rally = {};
        this.hush = false;
      } else if (a.k === 'spkstyle' && P(a.p)) {
        // the blocker who rises against this spike (this beat or the next two): the duel count
        const side = A.disp[a.p].side;
        let blk = null;
        for (let j = A.bi; j < Math.min(A.beats.length, A.bi + 3) && !blk; j++)
          blk = A.beats[j].acts.find(x => x.k === 'pose' && x.pose === 'block' && A.disp[x.p] && A.disp[x.p].side !== side);
        this.rally.hit = a.p;
        this.rally.blk = blk ? blk.p : null;
        if (blk) {
          const key = `${a.p}|${blk.p}`,
            n = (this.duels[key] = (this.duels[key] || 0) + 1);
          if (n % 3 === 0) this.ev.push({ kind: 'duel', p: a.p, q: blk.p });
        }
      } else if (a.k === 'point') this.pend = { side: a.side, streak: a.streak || 0, touches: A.rallyN || 0 };
      else if (a.k === 'score' && a.snap) this.snapPts = a.snap.pts.slice();
    }
  },
  /** A stage change: Fever / Loose, or a captain's Settle / Fire up (spec §2.14, §2.17). */
  stageLine(a) {
    if (!this.ev) this.resetLines();
    const kind =
      a.why === 'settle' ? 'settle' : a.why === 'fire' ? 'fireup' : a.to === 'fever' ? 'fever' : a.to === 'loose' ? 'loose' : null;
    if (kind) this.ev.push({ kind, side: a.side });
  },
  /** Every frame: once a point's beats have played, the between-point exchange (if the budget allows one). */
  stepLines(raw) {
    if (typeof A === 'undefined' || !A) return;
    if (!this.ev) this.resetLines();
    if (this.talk) {
      if ((this.talk.t += raw) > 12000) this.talk = null; // the box never answered: never hold the match
      return;
    }
    if (!this.pend || !A.beats || A.bi < A.beats.length) return;
    const pp = this.pend,
      s = this.snapPts,
      w = pp.side;
    this.pend = null;
    if (A.done || (A.m && A.m.over)) return (this.ev = []);
    // events the point itself makes: a long rally, a comeback, a new set point
    if (pp.touches >= 8) this.ev.push({ kind: 'long_rally', side: w });
    if (pp.streak === 3 && s[1 - w] - (s[w] - 3) >= 3) this.ev.push({ kind: 'comeback', side: w });
    const hi = Math.max(s[0], s[1]),
      mp = hi >= RULES.pointsToWin - 1 && s[0] !== s[1] ? (s[0] > s[1] ? 0 : 1) : -1;
    if (mp >= 0 && mp !== this.mpSide) this.ev.push({ kind: 'setpoint', side: mp });
    this.mpSide = mp;
    const ev = this.ev;
    this.ev = [];
    const hype = HYPE[G.hype] ? HYPE[G.hype].max : 1;
    if (!hype || !ev.length) return; // Hype Off: bubbles only
    const sp = ev.find(e => e.kind === 'setpoint'),
      stage = this.arena().stage,
      gap = hype >= 2 ? 2 : 4, // Focused: 1 per 4 points (Max: 1 per 2); Fever: every point with an event
      open = stage === 'fever' || (stage === 'focused' && A.pointN - this.lastTalk >= gap);
    let e = sp;
    if (!e && open) for (const k of MLINE_KINDS) if ((e = ev.find(x => x.kind === k))) break;
    if (!e) return;
    const lines = this.exchange(e);
    if (!lines.length) return;
    if (e.kind === 'setpoint') this.hush = true;
    this.lastTalk = A.pointN;
    this.said.push({ n: A.pointN, kind: e.kind, stage });
    this.talk = { t: 0 };
    exchangeShow(lines, () => (this.talk = null));
  },
  /** The two speakers of an event and their lines: [{ p, t, side }] (the reply only when someone has a stake). */
  exchange(e) {
    const P = id => (id && A.disp[id] ? A.disp[id].p : null),
      sideOf = p => (p && A.disp[p.id] ? A.disp[p.id].side : -1),
      on = side =>
        Object.values(A.disp)
          .filter(d => d.side === side)
          .map(d => d.p),
      mood = p => ((A.moodShown || {})[p.id] || 0) + p.num / 1000,
      hottest = (side, not) =>
        on(side)
          .filter(p => p !== not)
          .sort((a, b) => mood(b) - mood(a))[0] || null,
      coldest = side => on(side).sort((a, b) => mood(a) - mood(b))[0] || null,
      cap = (side, not) => {
        const c = A.m.t[side].cap;
        return c && A.disp[c.id] && c !== not ? c : hottest(side, not);
      },
      tag = (a, b) => (A.m.rel && A.m.rel.tag && A.m.rel.tag[`${a.id}|${b.id}`]) || 'neutral',
      // whoever on `side` has a stake in p: an ally / respect (good) or a rival / resent / enemy (bad)
      stake = (side, p, good) =>
        on(side).find(q => q !== p && (good ? ['ally', 'respect'] : ['enemy', 'resent']).includes(tag(q, p))) || null;
    let p = P(e.p),
      q = P(e.q),
      side = e.side ?? sideOf(p);
    if (side < 0) return [];
    const o = 1 - side;
    switch (e.kind) {
      case 'fever':
      case 'long_rally':
        p = (e.kind === 'long_rally' && P(this.rally.hit) && sideOf(P(this.rally.hit)) === side && P(this.rally.hit)) || hottest(side);
        q = stake(o, p, false) || cap(o);
        break;
      case 'loose':
        p = coldest(side);
        q = stake(side, p, true) || cap(side, p);
        break;
      case 'settle':
      case 'fireup':
        p = cap(side);
        q = stake(side, p, true) || hottest(side, p);
        break;
      case 'comeback':
        p = hottest(side);
        q = cap(o);
        break;
      case 'setpoint':
        p = hottest(side);
        q = stake(o, p, false) || cap(o);
        break;
    }
    if (!p) return [];
    const pts = this.snapPts,
      sc = s => `${pts[s]}–${pts[1 - s]}`,
      name = s => A.m.t[s].short || A.m.t[s].name,
      n = A.pointN,
      out = [{ p: p.id, t: mlinePick(e.kind, p, q, name(side), sc(side), n, name(o)), side }];
    if (q && q !== p) {
      const qs = sideOf(q);
      out.push({ p: q.id, t: mlinePick(e.kind + '_reply', q, p, name(qs), sc(qs), n, name(1 - qs)), side: qs });
    }
    return out.filter(l => l.t);
  }
};

/**
 * Crowd heat numbers (spec §2.27). Per point: point (every point), big (a big point: ult kill, block break, combo), streak (3+ in
 * a row), rally / long / marathon (8 / 12 / 15+ touches); fever: a team enters Fever. floor: the heat the match reaches by 30
 * points; hush: the floor through a set / match point; decayMs: the drift back to the floor; tiers buzzing / roaring / inferno;
 * music: the music gain × at full heat.
 */
const HEAT = {
  point: 0.02,
  big: 0.06,
  streak: 0.05,
  rally: 0.1,
  long: 0.16,
  marathon: 0.26,
  fever: 0.25,
  floor: 0.4,
  hush: 0.6,
  decayMs: 20000,
  buzzing: 0.3,
  roaring: 0.55,
  inferno: 0.8,
  music: 0.12
};
