// Tests: cinematic match lines (T-263): every MLINES kind has lines for every personality (or 'any'), placeholders are known,
// picks are by hash. Filled by its task; harness.js has the loader, runner and helpers.
const { load, test, assert } = require('./harness');

test('lines: the match line table is there', () => {
  const g = load(1);
  assert(g.MLINES && typeof g.MLINES === 'object', 'MLINES');
});
