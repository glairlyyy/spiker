// Story runner (spec §10.10): plays SCENES (js/data/story.js) step by step. DOM-free; draws no randoms. The dialogue
// box (js/ui/dialogue.js) renders `Story.step(run)` and calls `Story.next`. State: run.story = { seen, flags, cur }
// where cur = { id, i, mode: {dark, bars}, log: [[who, text]] } while a scene plays.

/** Steps the box shows and waits on; every other kind is applied at once by the runner. */
const STORY_SHOWN = ['say', 'choice', 'walk', 'wait', 'cam'];
const Story = {
  /** Scenes play in Story mode only (Endless skips them). */
  on: run => !!(run && run.mode && run.mode.story !== false && run.story),
  /** The first unseen scene whose trigger matches `on` ('start', 'week', …), or null. */
  due(run, on) {
    if (!Story.on(run) || run.story.cur) return null;
    return Object.keys(SCENES).find(id => !run.story.seen[id] && SCENES[id].trigger.on === on) || null;
  },
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
      if (o.goto != null) cur.i = o.goto - 1;
    }
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
      else if (s.k === 'goto') cur.i = s.step - 1;
      else if (STORY_SHOWN.includes(s.k)) {
        if (s.k === 'say') cur.log.push([s.who, s.text]);
        if (s.k === 'walk') City.moveTo(run, s.to === 'home' ? City.at(run, 'home') : City.at(run, s.to)); // free: no days
        return;
      }
    }
    Story.finish(run);
  },
  finish(run) {
    run.story.seen[run.story.cur.id] = true;
    run.story.cur = null;
  }
};
