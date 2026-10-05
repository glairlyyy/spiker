// Story runner (spec §10.10): plays SCENES (js/data/story.js) step by step. DOM-free; draws no randoms. The dialogue
// box (js/ui/dialogue.js) renders `Story.step(run)` and calls `Story.next`. State: run.story = { seen, flags, cur }
// where cur = { id, i, mode: {dark, bars}, log: [[who, text]] } while a scene plays; res = { kind, win, played, week }: your
// last match until the hub has shown its moment (the `result` trigger, T-175).

/** `hub` trigger conditions (SCENES trigger.when): pure tests of the run. */
const STORY_WHEN = {
  trained: run => Object.keys(run.uses || {}).some(k => run.uses[k] > 0),
  week2: run => run.week >= 2,
  week3: run => run.week >= 3 && !!Stars.get(run, 'rival'),
  // `result` trigger (T-175): the match you just played (run.story.res, set by Cup.record, cleared by the first hub after it)
  won: run => !!(run.story.res && run.story.res.win),
  lost: run => !!(run.story.res && !run.story.res.win)
};
/** `pick` trigger conditions (owner, 2026-10-05): what the place you just clicked on the map is (MapModel pick ids). */
const STORY_PICK = {
  faction: id => /^hq\d/.test(id) || id.startsWith('pt:'), // a club HQ or any tile of the island
  clash: id => id === 'clash',
  home: id => id === 'home' || id.startsWith('home:'),
  venue: id => id.startsWith('venue:')
};
/** Steps the box shows and waits on; every other kind is applied at once by the runner. */
const STORY_SHOWN = ['say', 'title', 'choice', 'walk', 'wait', 'cam'];
const Story = {
  /** Scenes play in Story mode only (Endless skips them). */
  on: run => !!(run && run.mode && run.mode.story !== false && run.story),
  /**
   * The first unseen scene whose trigger matches `on` ('start', 'hub', 'result', 'pick') and its `when` / `off` (STORY_WHEN, or
   * STORY_PICK for a pick of map id `pick`; `off` = a flag), or null.
   */
  due(run, on, pick) {
    if (!Story.on(run) || run.story.cur) return null;
    if (on === 'result' && !run.story.res) return null; // no match since the last hub
    if (on === 'hub' && run.story.at === Story.clock(run)) return null; // one scene per day: a lesson never follows another at once
    return (
      Object.keys(SCENES).find(id => {
        const T = SCENES[id].trigger;
        return (
          !run.story.seen[id] &&
          T.on === on &&
          (!T.off || !run.story.flags[T.off]) &&
          (!T.when || (on === 'pick' ? !!pick && STORY_PICK[T.when](pick) : STORY_WHEN[T.when](run)))
        );
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
  /** The steps of the scene playing: its own (a generated scene, e.g. meeting a squad) or its SCENES entry. */
  steps: cur => cur.steps || SCENES[cur.id].steps,
  /** You joined a squad (Run.create: the Academy squad; World.join: a club): its players introduce themselves at the next hub. */
  joined(run, key) {
    if (Story.on(run)) run.story.meet = key;
  },
  /**
   * The squad's introductions (owner, 2026-10-05): a generated scene — a diary line, then every teammate (captain first, the
   * bench last) says who they are and one line in their first trait's voice (MEET), then a closing line. Hash-free, no randoms.
   */
  meetSteps(run) {
    const T = Run.myTeam(run),
      you = Run.you(run),
      mates = squadOf(T).filter(p => p !== you),
      order = [
        ...mates.filter(p => p === T.cap),
        ...mates.filter(p => p !== T.cap && !T.bench.includes(p)),
        ...mates.filter(p => T.bench.includes(p))
      ],
      used = {},
      line = p => {
        const tr = Rel.traits(run, p.id)[0],
          L = MEET.trait[tr] || MEET.plain,
          n = (used[tr] = (used[tr] || 0) + 1) - 1;
        return L[n % L.length];
      },
      who = p => `${ROLE_NAME[p.role]}${p === T.cap ? ', captain' : ''}${T.bench.includes(p) ? ', on the bench for now' : ''}.`;
    return [
      { k: 'cut', bars: true },
      { k: 'say', who: 'diary', text: run.team == null ? MEET.academy : MEET.club.replace('{club}', T.name) },
      ...order.map(p => ({ k: 'say', who: p.id, text: `${who(p)} ${line(p)}` })),
      { k: 'say', who: 'diary', text: MEET.close },
      { k: 'end' }
    ];
  },
  /** Start the squad's introductions if you joined one since the last hub (once per squad). True when it started. */
  meet(run) {
    const key = run.story.meet;
    delete run.story.meet;
    const id = `meet:${key}`;
    if (key == null || run.story.cur || run.story.seen[id]) return false;
    run.story.cur = { id, i: -1, mode: {}, log: [], steps: Story.meetSteps(run) };
    Story.advance(run);
    return true;
  },
  /** A match of yours just ended (Cup.record): its moment for the `result` trigger. */
  matched(run, kind, win, played) {
    if (Story.on(run)) run.story.res = { kind, win: !!win, played: !!played, week: run.week };
  },
  /**
   * The hub opens with no scene, lock or event (career-hub.js): the last match's scene first (`result`), else a lesson whose
   * moment has come (`hub`, one per day). The match's moment passes with this first hub after it. True when one started.
   */
  hub(run) {
    if (!Story.on(run)) return false;
    if (run.story.meet != null && Story.meet(run)) return true; // a new squad first: its players introduce themselves
    const r = !!run.story.res && Story.fire(run, 'result');
    delete run.story.res;
    return r || Story.fire(run, 'hub');
  },
  /** You clicked map id `pick` (career-map.js): a lesson about that kind of place, the first time only. True when one started. */
  pick: (run, pick) => Story.fire(run, 'pick', pick),
  /** Start the first due scene for `on` (if any; `pick` = the clicked map id for a pick); true when one started. */
  fire(run, on, pick) {
    const id = Story.due(run, on, pick);
    if (!id) return false;
    run.story.cur = { id, i: -1, mode: {}, log: [] };
    Story.advance(run);
    return true;
  },
  /** The step on screen now (null when no scene plays). */
  step: run => (run.story && run.story.cur ? Story.steps(run.story.cur)[run.story.cur.i] || null : null),
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
      steps = Story.steps(cur);
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
