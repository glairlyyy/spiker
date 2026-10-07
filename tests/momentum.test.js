// Tests: momentum — fire, stages, temperament, captain calls (T-259, T-260). Filled by its tasks; harness.js has the loader, runner and helpers.
const { load, test, assert } = require('./harness');

test('momentum: stage table is ordered and the snapshot fallback reads it', () => {
  const g = load(1);
  assert(
    g.STAGE_IDS.every((id, i) => !i || g.STAGES[id].from > g.STAGES[g.STAGE_IDS[i - 1]].from),
    'stage thresholds rise'
  );
  assert(g.stageOfSnap({ mom: [-0.5, 0.5], zone: [0, 0] }, 0) === 'loose', 'loose');
  assert(g.stageOfSnap({ mom: [0, 0.9], zone: [0, 1] }, 1) === 'fever', 'fever');
});
