// Team (de)serialization for saves. Players reference their team, so the saved form stores the
// players inside their team and the loader re-links them.

function teamToJSON(t) {
  const o = {};
  for (const k in t) if (!['S', 's', 'mb', 'ws', 'P', 'cap'].includes(k)) o[k] = t[k];
  o.P = t.P.map(p => {
    const q = {};
    for (const k in p) if (k !== 'team') q[k] = p[k];
    return q;
  });
  return o;
}
function teamFromJSON(o) {
  const t = Object.assign({}, o, { S: STYLES[o.sk] });
  t.P = o.P.map(q => Object.assign({}, q, { team: t }));
  [t.s, t.mb] = t.P;
  t.ws = [t.P[2], t.P[3]];
  t.cap = t.P.find(p => p.cap) || t.P[0];
  // keep new ids clear of loaded ones
  for (const p of t.P) _pid = Math.max(_pid, +String(p.id).slice(1) + 1 || 0);
  return t;
}
