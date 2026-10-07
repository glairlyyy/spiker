// Tests: cinematic match lines (T-263): every MLINES kind has lines for every personality (or 'any'), placeholders are known,
// picks are by hash. harness.js has the loader, runner and helpers.
const { load, test, assert } = require('./harness');

test('lines: every kind covers every personality, 5–6 variants, known placeholders, a reply kind each', () => {
  const g = load(1),
    bad = [];
  for (const k of g.MLINE_KINDS) for (const kk of [k, k + '_reply']) if (!g.MLINES[kk]) bad.push('missing ' + kk);
  for (const [k, T] of Object.entries(g.MLINES))
    for (const pers of g.PERS) {
      const L = T[pers] || T.any;
      if (!L) bad.push(`${k}.${pers} missing`);
      else if (L.length < 5 || L.length > 6) bad.push(`${k}.${pers}: ${L.length} variants`);
      else
        for (const t of L)
          for (const ph of t.match(/\{[^}]*\}/g) || [])
            if (!['{me}', '{them}', '{team}', '{score}'].includes(ph)) bad.push(`${k}.${pers}: ${ph}`);
    }
  assert(!bad.length, bad.slice(0, 5).join('; '));
});

test('lines: the pick is the same for the same event, fills every placeholder, never draws', () => {
  const g = load(1),
    [a, b] = g.mkMonsterTeams(),
    p = a.P[0],
    q = b.P[0],
    next = g.RNG.next;
  let draws = 0;
  g.RNG.next = (...x) => (draws++, next.apply(g.RNG, x));
  for (const k of g.MLINE_KINDS) {
    const t1 = g.mlinePick(k, p, q, a.short, '12–10', 7, b.short),
      t2 = g.mlinePick(k, p, q, a.short, '12–10', 7, b.short);
    assert(t1 && t1 === t2, `${k}: same event, same line`);
    assert(!/\{[^}]*\}/.test(t1), `${k}: unfilled placeholder in "${t1}"`);
  }
  const seen = new Set();
  for (let n = 0; n < 40; n++) seen.add(g.mlinePick('fever', p, q, a.short, '1–0', n, b.short));
  assert(seen.size >= 3, 'different points pick different variants');
  g.RNG.next = next;
  assert(draws === 0, `no random draws (${draws})`);
});
