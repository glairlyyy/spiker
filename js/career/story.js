// Story runner (spec §10.10): plays SCENES (js/data/story.js) step by step. DOM-free; draws no randoms. The dialogue
// box (js/ui/dialogue.js) renders `Story.step(run)` and calls `Story.next`. State: run.story = { seen, flags, cur }
// where cur = { id, i, mode: {dark, bars}, log: [[who, text]] } while a scene plays.

/** `hub` trigger conditions (SCENES trigger.when): pure tests of the run. */
const STORY_WHEN = {
  trained: run => Object.keys(run.uses || {}).some(k => run.uses[k] > 0),
  clash: run => run.week >= 2 && !!Fight.clashSite(run), // (week 1 keeps to the campus)
  week2: run => run.week >= 2,
  week3: run => run.week >= 3 && !!Stars.get(run, 'rival'),
  settled: run => run.team != null || run.week >= 6,
  evaluated: run => run.week >= 5
};
/** Steps the box shows and waits on; every other kind is applied at once by the runner. */
const STORY_SHOWN = ['say', 'title', 'choice', 'walk', 'wait', 'cam'];
const Story = {
  /** Scenes play in Story mode only (Endless skips them). */
  on: run => !!(run && run.mode && run.mode.story !== false && run.story),
  /** The first unseen scene whose trigger matches `on` ('start', 'hub', …) and its `when` / `off` (STORY_WHEN, a flag), or null. */
  due(run, on) {
    if (!Story.on(run) || run.story.cur) return null;
    if (on === 'hub' && run.story.at === Story.clock(run)) return null; // one scene per day: a lesson never follows another at once
    return (
      Object.keys(SCENES).find(id => {
        const T = SCENES[id].trigger;
        return !run.story.seen[id] && T.on === on && (!T.off || !run.story.flags[T.off]) && (!T.when || STORY_WHEN[T.when](run));
      }) || null
    );
  },
  /** Where the run is in time (week.days spent): scenes remember when the last one ended. */
  clock: run => `${run.week}.${(run.dayLog || []).length}`,
  /** A line's text with {role} / {key} filled in. */
  text: (run, t) =>
    String(t).replace('{role}', ROLE_NAME[Run.you(run).role].toLowerCase()).replace('{key}', STATNAME[KEYSTAT[Run.you(run).role]]),
  /** Index of step `g` (an index or a step id) in scene sid. */
  idx: (sid, g) => (typeof g === 'number' ? g : SCENES[sid].steps.findIndex(s => s.id === g)),
  /** Start the first due scene for `on` (if any); true when one started. */
  fire(run, on) {
    const id = Story.due(run, on);
    if (!id) return false;
    run.story.cur = { id, i: -1, mode: {}, log: [] };
    Story.advance(run);
    return true;
  },
  /** The step on screen now (null when no scene plays). */
  step: run => (run.story && run.story.cur ? SCENES[run.story.cur.id].steps[run.story.cur.i] || null : null),
  /** The speaker of a say step: { name, kind: 'narration' | 'you' | 'voice' | 'person', person? }. */
  who(run, w) {
    if (w === 'diary') return { name: '', kind: 'narration' };
    if (w === 'you') return { name: Run.you(run).name, kind: 'you', person: Run.you(run) };
    if (w === GUIDE.id) return { name: GUIDE.short, kind: 'person', person: GUIDE };
    const star = Stars.get(run, w); // a named player ('rival', 'reina', …)
    if (star) return { name: star.name, kind: 'person', person: star };
    if (STORY_VOICES[w]) return { name: STORY_VOICES[w], kind: 'voice' };
    const p = People.find(run, w);
    return p ? { name: p.name, kind: 'person', person: p } : { name: String(w), kind: 'voice' };
  },
  /** Leave the current step (a choice index for choice steps) and move to the next shown step. */
  next(run, pick) {
    const cur = run.story && run.story.cur,
      s = Story.step(run);
    if (!cur || !s) return;
    if (s.k === 'choice') {
      const o = s.opts[pick] || s.opts[0];
      if (o.set) run.story.flags[o.set] = true;
      cur.log.push(['you', o.text]);
      if (o.goto != null) cur.i = Story.idx(cur.id, o.goto) - 1;
    } else if (s.goto != null) cur.i = Story.idx(cur.id, s.goto) - 1; // a line that jumps after it is read (a branch's end)
    Story.advance(run);
  },
  /** Skip the rest of the scene: its effects (flags, lines, where you walk) still apply. */
  skip(run) {
    let guard = 200;
    while (run.story.cur && guard--) Story.next(run, 0);
  },
  /** Apply the instant steps after the current one until a shown step or the end. */
  advance(run) {
    const cur = run.story.cur,
      steps = SCENES[cur.id].steps;
    for (let guard = 0; guard < 500; guard++) {
      const s = steps[++cur.i];
      if (!s || s.k === 'end') return Story.finish(run);
      if (s.k === 'cut') cur.mode = { dark: !!s.dark, bars: !!s.bars };
      else if (s.k === 'set') run.story.flags[s.flag] = s.v === undefined ? true : s.v;
      else if (s.k === 'diary') Run.log(run, s.text);
      else if (s.k === 'gazette') Run.log(run, s.text);
      else if (s.k === 'goto') cur.i = Story.idx(cur.id, s.step) - 1;
      else if (STORY_SHOWN.includes(s.k)) {
        if (s.k === 'say') cur.log.push([s.who, Story.text(run, s.text)]);
        if (s.k === 'title') cur.log.push(['diary', s.text]);
        if (s.k === 'walk') City.moveTo(run, s.to === 'home' ? City.at(run, 'home') : City.at(run, s.to)); // free: no days
        return;
      }
    }
    Story.finish(run);
  },
  finish(run) {
    run.story.seen[run.story.cur.id] = true;
    run.story.at = Story.clock(run);
    run.story.cur = null;
  }
};
