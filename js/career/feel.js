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
        const mate = Run.mates(run)[0];
        if (mate)
          Run.log(
            run,
            `${mate.name.split(' ')[0]}: “${FEEL_LINES.mate[Math.floor(hstr(`mate|${Season.wk(run)}`) * FEEL_LINES.mate.length)]}”`
          );
      } else Feel.scar(run);
    }
    return '';
  },
  /** One cue line for band i of bar k (a hash of the week: the same week, the same line). */
  line(run, k, i) {
    const L = FEEL_LINES[k][i];
    return L[Math.floor(hstr(`feel|${k}|${i}|${Season.wk(run)}`) * L.length)];
  },
  /** Pain at the top: a Scar (the pools are T-291's — for now it is recorded, pending). */
  scar(run) {
    (run.scars || (run.scars = [])).push({ k: 'pending', y: Season.year(run), w: run.week });
  },
  /** Fired up now (your next matches)? */
  fired: run => (run.fired || 0) > 0,
  /** Training gains × this while Fired up. */
  trainMul: run => (Feel.fired(run) ? FEEL.fired.train : 1),
  /** A match of yours begins (Cup.fixture setup): Fired up → a whole-match buff on you. */
  match(run, m) {
    if (!Feel.fired(run)) return;
    const you = Run.you(run);
    m.buff[you.id] = { lv: FEEL.fired.lv, n: 1e4 };
    m.fired = you.id; // presentation: who is Fired up
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
