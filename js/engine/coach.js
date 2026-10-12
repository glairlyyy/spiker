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
  /**
   * Side i's condition (owner, 2026-10-12): how each player is doing right now, in plain words — legs, head, passing under
   * fire, the hitting hand, being read, knocked down — and the team's passing and run. States, never advice. `sta` / `mood`:
   * what the screen has shown (default the engine's own). Each word: { t, tone: 'good' | 'warn' | 'bad', why }.
   */
  condition(m, i, sta = m.sta, mood = m.mood) {
    const t = m.t[i],
      C = COND,
      served = t.P.reduce((s, p) => s + ((m.recv[p.id] && m.recv[p.id].n + m.recv[p.id].ace) || 0), 0);
    let ok = 0,
      tot = 0;
    const players = t.P.map(p => {
      const w = [],
        st = sta[p.id] ?? 1,
        md = mood[p.id] || 0,
        r = m.recv[p.id],
        h = m.hit[p.id],
        ko = (m.ko && m.ko.p[p.id]) || 0;
      if (st < C.spent) w.push({ t: 'Spent', tone: 'bad', why: `Stamina ${Math.round(st * 100)} %` });
      else if (st < C.tiring) w.push({ t: 'Tiring', tone: 'warn', why: `Stamina ${Math.round(st * 100)} %` });
      if (md >= C.up) w.push({ t: 'Fired up', tone: 'good', why: 'Mood high' });
      else if (md <= C.down) w.push({ t: 'Shaken', tone: 'bad', why: 'Mood low' });
      if (r) {
        const n = r.n + r.ace,
          broke = r.ace + (r.bad || 0) + ko;
        ok += n - broke;
        tot += n;
        if (n >= C.min && broke / n >= C.broken) w.push({ t: 'Passes breaking', tone: 'bad', why: `${broke} of ${n} serves beat them` });
        else if (n >= C.min && served && n / served >= C.served) w.push({ t: 'Served at', tone: 'warn', why: `${n} of ${served} serves` });
        else if (n >= C.min && broke / n <= C.steady) w.push({ t: 'Passing well', tone: 'good', why: `${n - broke} of ${n} passed` });
      }
      if (h && h.last && h.last.length >= 3) {
        const k = [...h.last].filter(c => c === 'k').length,
          x = [...h.last].filter(c => c === 'x').length;
        if (k >= C.hot) w.push({ t: 'Hot hand', tone: 'good', why: `${k} kills in the last ${h.last.length}` });
        else if (x >= C.cold) w.push({ t: 'Cold hand', tone: 'bad', why: `${x} errors or blocks in the last ${h.last.length}` });
      }
      if (h && h.rd >= C.min && h.rdOk / h.rd >= C.read)
        w.push({ t: 'Being read', tone: 'warn', why: `Their block read ${h.rdOk} of ${h.rd}` });
      if (ko) w.push({ t: ko > 1 ? `Knocked down ×${ko}` : 'Knocked down', tone: 'warn', why: 'Hard balls put them on the floor' });
      return { p, words: w };
    });
    return {
      players,
      team: { pass: { ok, n: tot }, run: m.streak[i] || 0, theirRun: m.streak[1 - i] || 0, kos: (m.ko && m.ko.n[i]) || 0 }
    };
  },
  /** On court: each player's strongest state word (both sides), or none — only the clear ones (COND_COURT, in that order). */
  flags(m, sta, mood) {
    const out = {};
    for (const i of [0, 1])
      for (const { p, words } of Coach.condition(m, i, sta, mood).players) {
        const w = COND_COURT.map(t => words.find(x => x.t === t)).find(Boolean);
        if (w) out[p.id] = w;
      }
    return out;
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
