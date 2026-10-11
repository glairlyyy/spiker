// The coach panel's analysis (spec §2.25): what this match has shown, per side, from the engine's own tallies (m.att, m.hit,
// m.recv, m.stat). Pure data, no draws, no DOM — the match screen draws it (js/ui/match-coach.js); the AI coach may read
// the same tags later. Read it at a dead ball: the engine's state then matches what has been shown.

const Coach = {
  /** Side `i`'s numbers: attack totals, hitters, block reads, serve receive. */
  side(m, i) {
    const t = m.t[i],
      a = m.att[i],
      them = m.att[1 - i],
      squad = squadOf(t),
      hitters = squad.filter(p => m.hit[p.id]).map(p => ({ p, ...m.hit[p.id] })),
      recv = squad.filter(p => m.recv[p.id]).map(p => ({ p, ...m.recv[p.id] }));
    return {
      t,
      att: { n: a.n, k: a.k, stf: a.stf, err: hitters.reduce((s, h) => s + h.err, 0) },
      hitters: hitters.sort((x, y) => y.n - x.n),
      // their attacks against this side's block: reads made, right, right but still beaten (a kill)
      block: { n: them.rd, ok: them.rdOk, beat: them.rdBeat, stf: them.stf },
      recv: recv.sort((x, y) => y.n + y.ace - (x.n + x.ace)),
      tags: Coach.tags(m, i)
    };
  },
  /** The patterns side i has shown (true numbers, once clear — COACH). Each: { kind, p?, text, n, of }. */
  tags(m, i) {
    const t = m.t[i],
      out = [],
      num = p => `#${p.num}`;
    for (const p of squadOf(t)) {
      const h = m.hit[p.id];
      if (!h) continue;
      const ch = h.line + h.cross;
      if (ch >= COACH.min)
        for (const k of ['line', 'cross'])
          if (h[k] / ch >= COACH.share)
            out.push({ kind: 'lane', p, ch: k, text: `${num(p)} goes ${k}: ${h[k]} of ${ch}`, n: h[k], of: ch });
    }
    // serves at one receiver: this side receives — the tag belongs to the server's side
    const rec = squadOf(m.t[1 - i]).filter(p => m.recv[p.id]),
      tot = rec.reduce((s, p) => s + m.recv[p.id].n + m.recv[p.id].ace, 0);
    for (const p of rec) {
      const r = m.recv[p.id],
        n = r.n + r.ace;
      if (tot >= COACH.min && n / tot >= COACH.serve)
        out.push({
          kind: 'serve',
          p,
          text: `Serves at ${num(p)}: ${n} of ${tot}${r.ace ? ` · ${r.ace} ace${r.ace > 1 ? 's' : ''}` : ''}`,
          n,
          of: tot
        });
    }
    // this side's block against the other side's hitters
    const b = m.att[1 - i];
    if (b.rd >= COACH.min) {
      if (b.rdOk / b.rd >= COACH.read) out.push({ kind: 'read', text: `Block reads right: ${b.rdOk} of ${b.rd}`, n: b.rdOk, of: b.rd });
      else if ((b.rd - b.rdOk) / b.rd >= COACH.read)
        out.push({ kind: 'fooled', text: `Block fooled: ${b.rd - b.rdOk} of ${b.rd}`, n: b.rd - b.rdOk, of: b.rd });
    }
    return out;
  }
};
