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
  return Object.assign(ctx.__api, { __mem: mem });
}
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

// tiny runner
const results = [];
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
module.exports = { load, hash, test, assert, eq, results, ROOT };
