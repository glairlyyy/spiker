#!/usr/bin/env node
// Run: node tests/run.js            (all tests)
//      node tests/run.js --quick    (skip the slow statistical tests: test.slow)
//      node tests/run.js --update   (re-record the engine golden hashes after an intended gameplay change)
// The tests live in the area files below (engine, career, map, cup); harness.js has the loader, runner and helpers.
const fs = require('fs');
const { results, record, update, GOLDEN } = require('./harness');
require('./engine.test');
require('./career.test');
require('./map.test');
require('./cup.test');

// ---------- report ----------
let fail = 0,
  skipped = 0;
for (const r of results) {
  if (r.skipped) {
    skipped++;
    console.log(`- ${r.name} (skipped: --quick)`);
    continue;
  }
  console.log(`${r.ok ? '✓' : '✗'} ${r.name} (${r.ms} ms)`);
  if (!r.ok) {
    fail++;
    console.log('   ' + (r.err && r.err.stack ? r.err.stack.split('\n').slice(0, 3).join('\n   ') : r.err));
  }
}
console.log(`\n${results.length - fail - skipped}/${results.length - skipped} passed${skipped ? ` (${skipped} slow skipped)` : ''}`);
// goldens are re-recorded only from a fully green run (a failing test may have left the engine half-way)
if (update && !fail && !skipped) {
  fs.writeFileSync(GOLDEN, JSON.stringify(record, null, 2) + '\n');
  console.log('golden values written to tests/golden.json');
} else if (update) console.log('golden values NOT written: fix the failing tests first (and do not combine with --quick)');
process.exit(fail ? 1 : 0);
