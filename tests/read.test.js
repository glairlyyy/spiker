// Tests: participation — the read meter, Call / Fake / Block, the setter's pick and dump (T-257, T-258). Filled by its tasks;
// harness.js has the loader, runner and helpers.
const { load, test, assert } = require('./harness');

test('read: the pausable rally is there to ask the prompts', () => {
  const g = load(1);
  assert(typeof g.playRallyGen === 'function' && typeof g.capCall === 'function', 'playRallyGen and capCall');
});

test('read: the revamp seams the three agents build against are declared (spec §2.14–§2.18)', () => {
  const fs = require('fs'),
    path = require('path'),
    src = ['js/ui/match-prompts.js', 'js/ui/match-exchange.js', 'js/data/match-lines.js', 'js/engine/fire.js', 'js/render/director.js']
      .map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))
      .join('\n');
  for (const n of ['PROMPT_KINDS', 'exchangeShow', 'exchangeHide', 'MLINES', 'capReady', 'capCall', 'Dir'])
    assert(new RegExp(`(const|function) ${n}\\b`).test(src), n);
});
