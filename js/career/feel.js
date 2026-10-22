// Drive & Pain (spec §4.30): two hidden bars on you (run.feel), filled by what happens — never shown as numbers, only as
// diary lines, the Fired up match and the hub portrait. DOM-free; no randoms (cue lines are a hash of the run's week).

const Feel = {
  /** The bars ({ drive, pain, great, awful: mood-streak weeks }); created on first use. */
  of(run) {
    if (!run.feel || typeof run.feel !== 'object') run.feel = { drive: 0, pain: 0, great: 0, awful: 0 };
    return run.feel;
  },
  /**
   * Add to a bar: k 'drive' | 'pain', v (FEEL value, may be negative). A cue line as it passes FEEL.cue; at the top Drive → Fired up,
   * Pain → a Scar. Returns '' (the diary carries the cue).
   */
  add(run, k, v) {
    if (!v || !run) return '';
    const F = Feel.of(run),
      was = F[k];
    F[k] = clamp(was + v, 0, FEEL.max);
    FEEL.cue.forEach((c, i) => {
      if (was < c && F[k] >= c) Run.log(run, Feel.line(run, k, i), k === 'pain' ? 'bad' : 'good');
    });
    if (F[k] >= FEEL.max) {
      F[k] = 0;
      Run.log(run, FEEL_LINES[k][2], k === 'pain' ? 'bad' : 'good');
      if (k === 'drive') {
        run.fired = FEEL.fired.matches;
        Feel.spark(run);
        const mate = Run.mates(run)[0];
        if (mate) Run.log(run, `${firstName(mate)}: “${hitem(FEEL_LINES.mate, `mate|${Season.wk(run)}`)}”`);
      } else Feel.scar(run);
    }
    return '';
  },
  /** One cue line for band i of bar k (a hash of the week: the same week, the same line). */
  line(run, k, i) {
    const L = FEEL_LINES[k][i];
    return hitem(L, `feel|${k}|${i}|${Season.wk(run)}`);
  },
  /** [0, 1) for roll `salt` (the run's NPC seed, the week from the start): seeded, never the run's random stream. */
  roll: (run, salt) => hstr(`${run.pseed || 0}|feel|${Season.wk(run)}|${salt}`),
  /** A Fired up: TRAIT_ODDS.spark chance of a Spark (no repeats, at most TRAIT_ODDS.max), named at once. Returns the id or null. */
  spark(run) {
    const S = run.sparks || (run.sparks = []),
      F = Feel.of(run),
      n = (F.nf = (F.nf || 0) + 1),
      left = Object.keys(SPARKS).filter(id => !S.includes(id));
    if (S.length >= TRAIT_ODDS.max || !left.length || Feel.roll(run, `spark|${n}`) >= TRAIT_ODDS.spark) return null;
    const id = left[Math.floor(Feel.roll(run, `spark|${n}|pick`) * left.length)];
    S.push(id);
    Feel.sync(run);
    Run.log(run, FEEL_LINES.traits[id], 'good');
    return id;
  },
  /** A Scar's OP chance now: TRAIT_ODDS.op + .sharp per Lighthouse sharpen + .per per Scar before. */
  opChance: run => TRAIT_ODDS.op + TRAIT_ODDS.sharp * ((run.secret && run.secret.sharp) || 0) + TRAIT_ODDS.per * Feel.scarsOf(run).length,
  /** The rolled Scars ({ id, y, w, seen }; an old save's pending entries are left out until Feel.sync rolls them). */
  scarsOf: run => (run.scars || []).filter(s => s && MC_TRAITS[s.id]),
  /**
   * Pain at the top: a Scar (no repeats, at most TRAIT_ODDS.max) — OP at Feel.opChance, else bad; hidden (`seen: false`) until
   * the first match where it acts (Feel.result). Enlightenment applies at once (body +6 past the caps, Wit +0.3). Returns the id or null.
   */
  scar(run) {
    const L = run.scars || (run.scars = []),
      have = Feel.scarsOf(run),
      ids = have.map(s => s.id);
    if (have.length >= TRAIT_ODDS.max) return null;
    const n = have.length,
      op = Feel.roll(run, `scar|${n}|op`) < Feel.opChance(run),
      pool = k => Object.keys(SCARS).filter(id => !!SCARS[id].op === k && !ids.includes(id)),
      left = pool(op).length ? pool(op) : pool(!op);
    if (!left.length) return null;
    const id = left[Math.floor(Feel.roll(run, `scar|${n}|pick`) * left.length)];
    L.push({ id, y: Season.year(run), w: run.week, seen: false });
    if (id === 'enlight') Feel.enlighten(run);
    Feel.sync(run);
    return id;
  },
  /** Enlightenment: every body stat + SCARS.enlight.k past the training caps (≤ CAREER.runCap), the court skills from it; Wit +0.3. */
  enlighten(run) {
    const you = Run.you(run),
      E = SCARS.enlight;
    if (!you) return;
    if (you.body) {
      for (const k of BODY.keys) you.body[k] = Math.min(CAREER.runCap, you.body[k] + E.k);
      Body.sync(you, run);
    } else for (const k of STATK) you[k] = Math.min(CAREER.runCap, you[k] + E.k);
    you.wit = +Math.min(CAREER.witRunCap, you.wit + E.wit).toFixed(2);
  },
  /** Your traits onto your player for the matches (`you.traits`: Sparks + Scars ids); an old save's pending Scars are rolled here. */
  sync(run) {
    const you = Run.you(run);
    if (Array.isArray(run.scars) && run.scars.some(s => !s || !MC_TRAITS[s.id])) {
      const pend = run.scars.filter(s => !s || !MC_TRAITS[s.id]).length;
      run.scars = Feel.scarsOf(run);
      for (let i = 0; i < pend; i++) Feel.scar(run);
    }
    if (!you) return;
    const ids = [...(run.sparks || []), ...Feel.scarsOf(run).map(s => s.id)].filter(id => MC_TRAITS[id]);
    if (ids.length) you.traits = ids;
    else delete you.traits;
  },
  /** Do you carry trait `id`? A hidden career-side Scar that acts is marked to be named after the next match. */
  has(run, id) {
    const you = Run.you(run);
    if (!you || !you.traits || !you.traits.includes(id)) return false;
    const s = Feel.scarsOf(run).find(x => x.id === id);
    if (s && !s.seen) s.acted = true;
    return true;
  },
  /** Fired up now (your next matches)? */
  fired: run => (run.fired || 0) > 0,
  /** Training gains × this while Fired up. */
  trainMul: run => (Feel.fired(run) ? FEEL.fired.train : 1),
  /** A match of yours begins (Cup.fixture setup): Fired up → a whole-match buff on you. */
  match(run, m) {
    const you = Run.you(run),
      riv = Stars.get(run, 'rival');
    Feel.sync(run);
    // Haewon's squad across the net (spec §4.30): Spite reads m.vsRival in the engine; Haunted starts you lower
    if (you && you.traits && riv && squadOf(m.t[1]).includes(riv)) {
      m.vsRival = true;
      if (you.traits.includes('haunted')) {
        m.mor[you.id] = clamp(morOf(m, you) + SCARS.haunted.k, -1, 1);
        m.mom[0] = fireOf(m, 0);
        trActed(m, you, 'haunted');
      }
    }
    if (!Feel.fired(run)) return;
    m.buff[you.id] = { lv: FEEL.fired.lv, n: 1e4 };
    m.fired = you.id; // presentation: who is Fired up
  },
  /** After a match of yours: each hidden Scar that acted in it (the engine's m.trAct, a career-side one since, Enlightenment) is named. */
  name(run, m, played) {
    const you = Run.you(run),
      A = (m.trAct && you && m.trAct[you.id]) || {};
    for (const s of Feel.scarsOf(run)) {
      if (s.seen || !(A[s.id] || s.acted || (played && s.id === 'enlight'))) continue;
      s.seen = true;
      delete s.acted;
      Run.log(run, FEEL_LINES.traits[s.id], SCARS[s.id].op ? 'good' : 'bad');
    }
  },
  /**
   * A match of yours is over (Cup.result; kind 'eval' | 'cup' | …): Drive for a win and a good grade, Pain for a loss (more with no
   * set won), for watching it all from the bench, and for losing to the rival's side; Fired up counts down.
   */
  result(run, m, played, grade) {
    const win = m.winner === 0,
      sc = m.setScores[0],
      riv = Stars.get(run, 'rival');
    if (m.fired && played) run.fired = Math.max(0, (run.fired || 0) - 1); // a Fired up match played
    Feel.name(run, m, played);
    if (!played) Feel.add(run, 'pain', FEEL.pain.bench);
    if (win) Feel.add(run, 'drive', FEEL.drive.win + (grade === 'S' || grade === 'A' ? FEEL.drive.grade : 0));
    else Feel.add(run, 'pain', FEEL.pain.loss + (sc[0] === 0 ? FEEL.pain.rout : 0));
    if (riv && squadOf(m.t[1]).includes(riv)) Feel.add(run, win ? 'drive' : 'pain', win ? FEEL.drive.rematch : FEEL.pain.rival);
  },
  /** Week end: mood streaks (Great × FEEL.streak.great → Drive; Awful × FEEL.streak.awful → Pain); an idle week drains Drive. */
  week(run) {
    const F = Feel.of(run),
      top = MOODS.length - 1;
    F.great = run.mood === top ? F.great + 1 : 0;
    F.awful = run.mood === 0 ? F.awful + 1 : 0;
    if (F.great >= FEEL.streak.great) {
      F.great = 0;
      Feel.add(run, 'drive', FEEL.drive.great);
    }
    if (F.awful >= FEEL.streak.awful) {
      F.awful = 0;
      Feel.add(run, 'pain', FEEL.pain.awful);
    }
    if (!run.trained && Run.weekType(run) === 'train') Feel.add(run, 'drive', FEEL.drive.idle);
  },
  /** A Story scene that hurts (FEEL.pain.scene) has played. */
  scene(run, id) {
    if (FEEL.pain.scene[id]) Feel.add(run, 'pain', FEEL.pain.scene[id]);
  }
};
