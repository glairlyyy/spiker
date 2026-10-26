// Frame-budget jobs (Pacing A, owner 2026-10-27: "60 fps but it stutters most of the time"): the map's periodic heavy work — the
// detail ring's rebuild, street blocks prepared, the props' re-pick, the meadow's tiles — runs as cooperative jobs, a few slices a
// frame within a per-frame time budget (performance.now()), so no frame carries a whole rebuild. A job is an iterator (a generator:
// each `yield` = a slice done, a safe point to pause); its result applies at its end (the old state stays drawn until then).
// Priorities: lower first (your own block / the ring round you before the rest); among equal ones the older first. A job added
// under an id that runs already replaces it (cancel / restart on a new target). The first slice of the frame always runs (progress
// at any budget); a single slice is kept small by the job itself. Display only: no randoms.
//   createJobs({ now, budget }) → { add(id, gen, pri), cancel(id), has(id), run(budget?), drain(id?), info() }
/** The per-frame budget (ms) while walking; `boost` behind an automated action (time passes anyway). */
export const JOBS = { budget: 2.5, boost: 30 };

export function createJobs(o = {}) {
  const now = o.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now())),
    list = [], // { id, pri, it, seq, steps }
    N = { runs: 0, steps: 0, done: 0, cancels: 0, ms: 0, over: 0, last: 0 };
  let seq = 0;
  const find = id => list.findIndex(j => j.id === id);
  const stop = i => {
    const [j] = list.splice(i, 1);
    if (j.it && j.it.return) j.it.return(); // (a generator's finally blocks run)
    N.cancels++;
  };
  const order = () => list.sort((a, b) => a.pri - b.pri || a.seq - b.seq);
  /** One slice of job j; false when it has finished (removed). */
  const step = j => {
    let r;
    try {
      r = j.it.next();
    } catch (e) {
      r = { done: true };
      if (typeof console !== 'undefined') console.error('map job', j.id, e);
    }
    j.steps++;
    N.steps++;
    if (r.done) {
      list.splice(list.indexOf(j), 1);
      N.done++;
      return false;
    }
    return true;
  };
  return {
    /** Start job `id` (a generator object, or a function returning one) at priority pri; a running one of that id is replaced. */
    add(id, gen, pri = 5) {
      const i = find(id);
      if (i >= 0) stop(i);
      list.push({ id, pri, it: typeof gen === 'function' ? gen() : gen, seq: seq++, steps: 0 });
      order();
    },
    cancel(id) {
      const i = find(id);
      if (i >= 0) stop(i);
    },
    has: id => find(id) >= 0,
    /** Change a waiting job's priority (e.g. a block that became yours). */
    pri(id, p) {
      const j = list[find(id)];
      if (j && j.pri !== p) ((j.pri = p), order());
    },
    /** Each frame: slices of the jobs in priority order until `budget` ms are used (the first slice always). → ms used. */
    run(budget = JOBS.budget) {
      if (!list.length) return (N.last = 0);
      const t0 = now();
      while (list.length) {
        step(list[0]);
        if (now() - t0 >= budget) break;
      }
      const ms = now() - t0;
      N.runs++;
      N.last = ms;
      N.ms = N.ms + (ms - N.ms) * 0.1;
      if (ms > budget * 2) N.over++;
      return ms;
    },
    /** Run job id (or every job) to its end now (tests; an explicit action that may hitch). */
    drain(id) {
      for (let guard = 0; guard < 1e7; guard++) {
        const j = id === undefined ? list[0] : list[find(id)];
        if (!j) return;
        step(j);
      }
    },
    /** QA: { jobs (ids waiting, in order), runs, steps, done, cancels, ms (EMA per frame), last, over (frames over 2× budget) }. */
    info: () => ({ jobs: list.map(j => j.id), ...N, ms: +N.ms.toFixed(2), last: +N.last.toFixed(2) })
  };
}
/** Run a generator to its end at once (the synchronous path: tests, no scheduler); → its return value. */
export function drainGen(it) {
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
