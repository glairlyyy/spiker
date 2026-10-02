// Test harness: loads the game's classic scripts (in index.html order) into an isolated VM context,
// with a seedable Math.random and an in-memory localStorage. No DOM — only core/data/engine/game/career.
const fs = require('fs'),
  path = require('path'),
  vm = require('vm'),
  crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const SCRIPTS = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const HEADLESS = /js\/(core|data|engine|career)\/|js\/game\/bracket\.js/;

/** A fresh game context. seed → deterministic Math.random (xorshift). */
function load(seed = 123456789) {
  let x = seed >>> 0 || 1;
  const rand = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1e9) / 1e9;
  };
  const mem = {};
  const ctx = {
    console,
    Math: Object.create(Math, { random: { value: rand } }),
    localStorage: {
      getItem: k => (k in mem ? mem[k] : null),
      setItem: (k, v) => (mem[k] = String(v)),
      removeItem: k => delete mem[k]
    },
    esc: s => String(s),
    navigate: () => {}
  };
  vm.createContext(ctx);
  const code = SCRIPTS.filter(f => HEADLESS.test(f))
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n');
  // classic scripts share one global scope: run as a single script, then expose top-level bindings
  const names = [...code.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  vm.runInContext(`${code}\n;globalThis.__api={${[...new Set(names)].join(',')}};`, ctx, { filename: 'game.js' });
  return Object.assign(ctx.__api, { __mem: mem, __ls: ctx.localStorage });
}
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

// tiny runner
const results = [];
// --quick (npm run test:quick) skips the tests marked test.slow
const quick = process.argv.includes('--quick');
function test(name, fn) {
  const t0 = Date.now();
  try {
    fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, err: e });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}
/** A test that takes seconds (statistics over many matches): skipped by --quick. */
test.slow = (name, fn) => (quick ? results.push({ name, ok: true, ms: 0, skipped: true }) : test(name, fn));

// golden hashes: goldenCheck records every value; --update re-records them (run.js writes them only from a green run)
const GOLDEN = path.join(__dirname, 'golden.json'),
  update = process.argv.includes('--update'),
  golden = fs.existsSync(GOLDEN) ? JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) : {},
  record = {};
const goldenCheck = (key, value) => {
  record[key] = value;
  if (!update) {
    assert(golden[key], `no golden value for ${key} — run with --update`);
    eq(value, golden[key], `${key} changed (gameplay or animation output differs; run --update if intended)`);
  }
};

/** A whole career run played headless with simple choices (rest when tired, train the key stat, sign when a club allows). */
function playRun(g, role = 'WS') {
  const d = g.Run.draft();
  const run = g.Run.create(d, { role, name: 'Test', alloc: { power: 20, def: 10, speed: 10, jump: 20 }, witSteps: 0 });
  let guard = 0;
  while (!run.result && guard++ < 400) {
    if (run.event) {
      const pre = run.event.pre; // sponsor offers come before the week's choice
      g.Run.log(run, g.Events.choose(run, 0));
      if (!pre) g.Run.endWeek(run);
      continue;
    }
    if (g.World.isFree(run)) for (const t of run.teams) if (g.World.join(run, t.i)) break; // sign as soon as a club allows
    const wt = g.Run.weekType(run);
    if (wt === 'eval') {
      if (run.eval.kind === 'faction' && !run.eval.mine) {
        g.Eval.bench(run); // not drawn: watch from the bench
        g.Run.endWeek(run);
        continue;
      }
      const region = run.eval.region,
        fx = g.Cup.fixture(run, 'eval'),
        m = g.newMatch(fx.a, fx.b, false);
      while (!m.over) g.playRally(m);
      fx.onFinish(m);
      assert(
        g.Pool.players(run, region).every(p => p.team.i !== -2),
        'nobody stays lent after an evaluation'
      );
      continue;
    }
    if (wt === 'cup') {
      run.focus = g.FOCUS[role][0][0];
      run.talk = 'fire';
      const fx = g.Cup.fixture(run, 'cup');
      const m = g.newMatch(fx.a, fx.b, false);
      if (fx.setup) fx.setup(m);
      while (!m.over) g.playRally(m);
      fx.onFinish(m);
      continue;
    }
    const c = run.sta < 45 ? 'rest' : run.mood < 2 ? 'rec' : g.KEYSTAT[role];
    g.Run.log(run, c === 'rest' ? g.Training.rest(run) : c === 'rec' ? g.Training.recreation(run) : g.Training.train(run, c, run.sta > 85));
    if (!g.Events.roll(run)) g.Run.endWeek(run);
  }
  return run;
}

module.exports = { load, hash, test, assert, eq, results, ROOT, goldenCheck, playRun, record, update, GOLDEN };
