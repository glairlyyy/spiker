// The perf overlay's Measure (owner, 2026-10-26; js/ui/map-view.js PerfHUD): the probe's sequencer (toggle / restore bookkeeping),
// its ranking and the plain-text report, the spike log. No DOM, no renderer: fake items and frames.
const fs = require('fs'),
  path = require('path');
const { load, test, assert, eq } = require('./harness');
const GAME = load();

/** PerfHUD from js/ui/map-view.js with the page stubbed. */
function perfHUD() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/ui/map-view.js'), 'utf8'),
    env = { t: 0, store: { get: () => '0', set: () => {} }, KEYS: { perf: 'sns_perf' }, esc: s => String(s), G: { gfx: 'auto' } };
  env.performance = { now: () => env.t };
  const scope = new Proxy(env, {
    has: () => true,
    get: (o, k) => (k in o ? o[k] : k === Symbol.unscopables ? undefined : k in GAME ? GAME[k] : globalThis[k])
  });
  return [new Function('scope', `with (scope) { ${src}\n; return PerfHUD; }`)(scope), env];
}

/** A fake scene: layers a / b / c (visible flags), a held setting, draw cost = what is on. */
function fakeScene() {
  const S = { a: true, b: true, c: true, res: 0.7, frames: 0, during: [] },
    cost = { a: 4, b: 1, c: 2.5 },
    items = [
      { id: 'a', label: 'layer a', group: 'layer', mask: () => ((S.a = false), () => (S.a = true)) },
      { id: 'b', label: 'layer b', group: 'layer', mask: () => ((S.b = false), () => (S.b = true)) },
      { id: 'c', label: 'layer c', group: 'layer', mask: () => ((S.c = false), () => (S.c = true)) },
      { id: 'n', label: 'not here', group: 'look', can: () => 'street level only', mask: () => null },
      {
        id: 'res1',
        label: 'scale 1',
        group: 'look',
        hold: () => {
          const r = S.res;
          S.res = 1;
          return () => (S.res = r);
        }
      }
    ];
  /** One frame: pre → draw (its cost from what is on) → mid → post. */
  const frame = D => {
    D.pre();
    const ms = 2 + (S.a ? cost.a : 0) + (S.b ? cost.b : 0) + (S.c ? cost.c : 0) + (S.res === 1 ? 3 : 0),
      calls = 10 + (S.a ? 5 : 0) + (S.b ? 2 : 0) + (S.c ? 3 : 0);
    S.during.push(`${+S.a}${+S.b}${+S.c}`);
    if (S.res === 1) S.held = (S.held || 0) + 1;
    D.mid();
    assert(S.a && S.b && S.c, 'the masks are undone right after the draw');
    D.post({ draw: ms, js: 1, calls, tris: calls * 1000 });
    S.frames++;
  };
  return { S, items, frame };
}

test('perf probe: each item off in turn, masks undone every frame, holds for their configuration, ranked report', () => {
  const [H] = perfHUD(),
    { S, items, frame } = fakeScene();
  let done = null;
  const D = H.probeRun(items, { warm: 2, frames: 3, done: d => (done = d) });
  eq(D.na.length, 1, 'the n/a item is listed, not run');
  eq(D.na[0].why, 'street level only', 'with its reason');
  eq(D.cfg.length, 6, 'base + 4 items + base again');
  for (let i = 0; i < 100 && !done; i++) {
    frame(D);
  }
  assert(done && !done.aborted, 'the probe finishes');
  eq(S.frames, 6 * 5, 'warm + frames per configuration');
  eq(S.res, 0.7, 'the held setting is back');
  eq(S.held, 5, 'the hold was on for its whole configuration (warm + frames) only');
  assert(S.a && S.b && S.c, 'every layer is back');
  assert(S.during.includes('011') && S.during.includes('101') && S.during.includes('110'), 'each layer was off for a draw');
  const R = H.probeResult(done);
  eq(R.key, 'draw', 'no GPU timer: the draw + sync ms');
  eq(R.base.draw, 9.5, 'the baseline median');
  eq(R.rows[0].id, 'a', 'the biggest cost first');
  eq(R.rows[0].save, 4, 'layer a saves 4 ms');
  eq(R.rows[0].dCalls, 5, '… and 5 calls');
  eq(R.rows[R.rows.length - 1].id, 'res1', 'scale 1 costs more: last');
  assert(R.rows[R.rows.length - 1].save < 0, 'a negative saving');
  const txt = H.probeReport({
    ctx: {
      kind: 'map',
      gpu: 'Fake GPU',
      browser: 'Chrome 130',
      css: [100, 50],
      px: [100, 50],
      dpr: 1,
      scale: 1,
      look: 'Auto',
      view: 'street'
    },
    res: R,
    js: { kind: 'map', rules: 0.1, p: { update: 2, draw: 1, labels: 0.1, secs: { life: 0.8, props: 0.3 } } },
    spikes: [{ t: 12.3, kind: 'map', ms: 80, med: 17, js: { update: 3, draw: 1, labels: 0 }, ev: ['ring rebuild', 'shader compile +2'] }],
    restored: 'everything restored',
    at: new Date(2026, 9, 26, 14, 3)
  });
  const L = txt.split('\n');
  eq(L[0], 'Spite & Spike perf report · 2026-10-26 14:03 · map', 'the header');
  assert(/^device +Fake GPU · Chrome 130/.test(L[1]), 'the device line');
  assert(/everything restored/.test(txt), 'restored is stated');
  const ranked = L.filter(l => /^ {1,2}\d+ /.test(l));
  eq(ranked.length, 4, 'one line per item run');
  assert(/^ {2}1 layer a +4\.00 ms +38% +-5 calls +-5\.0k tris$/.test(ranked[0]), `the first ranked line: "${ranked[0]}"`);
  assert(/\+3\.00 ms/.test(ranked[3]), 'a cost shows with +');
  assert(/^n\/a +not here \(street level only\)/m.test(txt), 'the n/a line');
  assert(/^hot JS +life 0\.80 · props 0\.30/m.test(txt), 'the JS hot spots');
  assert(/^ +12\.3s +80 \/ 17 · JS 4\.0 · ring rebuild · shader compile \+2$/m.test(txt), 'the spike line');
});

test('perf probe: abort mid-hold restores everything and reports once', () => {
  const [H] = perfHUD(),
    { S, items, frame } = fakeScene();
  let n = 0,
    done = null;
  const D = H.probeRun(items, { warm: 1, frames: 1, done: d => ((done = d), n++) });
  while (D.at < 4) frame(D); // (up to the held configuration)
  D.pre(); // (its hold and a mask on, as in a frame cut by an error before mid)
  eq(S.res, 1, 'the hold is on');
  D.abort('Esc');
  eq(S.res, 0.7, 'the hold is undone');
  assert(S.a && S.b && S.c, 'the layers are back');
  assert(done.aborted && done.why === 'Esc', 'aborted, with why');
  D.abort();
  D.post({ draw: 1, js: 1, calls: 1, tris: 1 });
  eq(n, 1, 'done once');
});

test('perf probe: GPU timer samples rank when every configuration has them', () => {
  const [H] = perfHUD(),
    { S, items, frame } = fakeScene();
  let id = 0,
    done = null;
  const gpuMs = new Map(),
    gpu = {
      name: 'fake timer',
      begin: () => ++id,
      end: () => {},
      read: q => (gpuMs.has(q) ? gpuMs.get(q) : undefined),
      drop: () => {}
    };
  const D = H.probeRun(items.slice(0, 3), { warm: 1, frames: 2, gpu, done: d => (done = d) });
  for (let i = 0; i < 200 && !done; i++) {
    frame(D);
    gpuMs.set(id, S.during[S.during.length - 1] === '011' ? 1 : 5); // (layer a off: cheap on the GPU)
  }
  const R = H.probeResult(done);
  eq(R.key, 'gpu', 'ranked by GPU ms');
  eq(R.rows[0].id, 'a', 'a first');
  eq(R.rows[0].save, 4, 'the GPU saving');
});

test('perf spikes: a frame > 2× the median keeps the frame before it and what ran between, the last 20', () => {
  const [H, env] = perfHUD();
  const fr = (ms, ev = [], raw = { update: 1, draw: 1, labels: 0 }) => ((env.t += ms), H.spike('map', { last: ms, raw, ev }));
  for (let i = 0; i < 40; i++) fr(16);
  eq(H.spikes.length, 0, 'steady: no spike');
  fr(16, ['ring rebuild'], { update: 30, draw: 2, labels: 0 });
  H.note('renderCareer 12.0 ms');
  fr(60);
  eq(H.spikes.length, 1, 'one spike');
  const s = H.spikes[0];
  assert(s.ev.includes('ring rebuild') && s.ev.includes('renderCareer 12.0 ms'), 'the cause: the frame before + the page');
  eq(s.js.update, 30, 'the frame before its JS');
  for (let i = 0; i < 40; i++) fr(16);
  fr(90);
  assert(/gap/.test(H.spikes[1].ev[0]), 'no JS, nothing ran: a gap');
  for (let i = 0; i < 30; i++) (fr(16), fr(16), fr(16), fr(200));
  eq(H.spikes.length, 20, 'the last 20 kept');
});

test('perf pacing (owner 2026-10-27): percentiles, 1 % low, hitches > 1.5× the median and > 25 ms, the ring keeps 60 s', () => {
  const [H] = perfHUD();
  eq(H.pace([]), null, 'no frames');
  const iv = [];
  for (let i = 0; i < 990; i++) iv.push(16);
  for (let i = 0; i < 6; i++) iv.push(24); // over 1.5× the median but under 25 ms: no hitch
  iv.push(30, 40, 50, 100); // 4 hitches
  const c = H.pace(iv);
  eq(c.n, 1000, 'n');
  eq(c.p50, 16, 'p50');
  eq(c.p95, 16, 'p95');
  eq(c.p99, 16, 'p99 (the 990th of 1000)');
  eq(c.max, 100, 'max');
  eq(c.hitches, 4, 'hitches');
  assert(Math.abs(c.low1 - 1000 / ((24 * 6 + 30 + 40 + 50 + 100) / 10)) < 1e-9, `1 % low = fps of the mean of the worst 10: ${c.low1}`);
  assert(Math.abs(c.perMin - (4 * 60000) / c.ms) < 1e-9, 'hitches a minute of frames');
  assert(/^16\.0 \/ 16\.0 \/ 16\.0 \/ 100$/.test(H.paceText(c)), `overlay text: ${H.paceText(c)}`);
  // the ring: 60 s of frames at most, oldest out first
  for (let i = 0; i < 5000; i++) H.paceAdd(20);
  const v = H.paceVals();
  eq(v.length, 3000, '60 s of 20-ms frames');
  H.paceAdd(50);
  eq(H.paceVals().length, 2998, 'a long frame pushes out older ones (≤ 60 s)');
  eq(H.paceVals()[2997], 50, 'newest last');
});

test('perf report: the pacing and LoAF lines without a Measure; a spike keeps its LoAF and the page step', () => {
  const [H, env] = perfHUD();
  H.loaf = [];
  H.lo = {};
  for (let i = 0; i < 40; i++) ((env.t += 16), H.rule(0.2), H.spike('map', { last: 16, raw: { update: 1, draw: 1, labels: 0 }, ev: [] }));
  H.rule(3);
  env.t += 16;
  H.spike('map', { last: 16, raw: { update: 2, draw: 1, labels: 0 }, ev: [] });
  env.t += 70;
  H.spike('map', { last: 70, raw: { update: 1, draw: 1, labels: 0 }, ev: [] });
  eq(H.spikes.length, 1, 'one spike');
  H.loafs([
    {
      startTime: env.t - 66,
      duration: 64,
      blockingDuration: 14,
      styleAndLayoutStart: env.t - 6,
      scripts: [
        { sourceFunctionName: 'spotFollow', sourceURL: 'http://x/js/ui/career-map.js', duration: 9, forcedStyleAndLayoutDuration: 3 }
      ]
    }
  ]);
  assert(
    /^LoAF 64 ms: JS 9\.0 · style\+layout 4\.0 · forced 3\.0 · spotFollow \(career-map\.js\) 9 forced 3\.0$/.test(H.spikes[0].lf),
    H.spikes[0].lf
  );
  const pace = H.pace([16, 16, 16, 70]),
    txt = H.probeReport({ ctx: { kind: 'map' }, spikes: H.spikes, pace, loaf: H.loafSum() }),
    L = txt.split('\n');
  assert(
    L.some(l =>
      /^pacing +0 s · 4 frames · \d+ fps · frame ms p50 16\.0 \/ p95 70\.0 \/ p99 70\.0 \/ max 70\.0 · sd [\d.]+ · 1% low 14 fps · hitches 1 /.test(
        l
      )
    ),
    txt
  );
  assert(
    L.some(l =>
      /^LoAF +1 frames > 50 ms since on · last 1: 64 ms, style\+layout 4\.0 ms, forced 3\.0 ms · top spotFollow \(career-map\.js\) 9$/.test(
        l
      )
    ),
    txt
  );
  assert(
    L.some(l => /70 \/ 16 · JS 3\.0 \(ui 3\.0\) · .* · LoAF 64 ms: JS 9\.0/.test(l)),
    `the spike line: ${txt}`
  );
  assert(!/^probe/m.test(txt), 'no probe lines without a Measure');
});
