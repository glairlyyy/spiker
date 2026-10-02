// Relationships (spec §4.23 B): what each NPC remembers about you. No DOM. No R() / rnd() / pick(): everything here is
// arithmetic on `run.mem`, so it never moves the random stream. Data: MEMORY / REL in js/data/people.js.
// run.mem[key] = [{ w (week), k (kind), v (value), n (same-kind count this week), a (who feels it: an id, '*' = both) }], key = Rel.key(a, b).
// You ↔ NPC lists are the NPC's (a = the NPC); NPC ↔ NPC lists (T-065) only exist between squadmates, capped by REL.chem.pairs in all.
// The old 0–100 `you.bond[id]` is only a cache of Rel.bond (so combos at 60, friendship at 80, goals, the drawer work as before).

const Rel = {
  key: (a, b) => [a, b].sort().join('|'),
  /** The memory list for id ↔ other (you by default). */
  list: (run, id, other = run.youId) => (run.mem && run.mem[Rel.key(other, id)]) || [],
  traits: (run, id) => (run.people && run.people[id] && run.people[id].traits) || [],
  /** Remember something about you (see MEMORY); returns the change in the cached bond. */
  add(run, id, kind, v) {
    if (id === run.youId || !run.people || !run.people[id] || !MEMORY[kind]) return 0;
    const before = Rel.bondOf(run, id);
    Rel.push(run, Rel.key(run.youId, id), id, kind, v, id);
    Rel.refresh(run, id);
    Rel.reveal(run, id);
    return Rel.bondOf(run, id) - before;
  },
  /** Write one memory into a list: same kind, week and `a` merge (the repeat rule); `who` = whose traits flip it ('*': read time). */
  push(run, key, who, kind, v, a) {
    const M = MEMORY[kind],
      l = run.mem[key] || (run.mem[key] = []),
      e = l.find(x => x.k === kind && x.w === run.week && x.a === a),
      n = e ? e.n : 0;
    let val = v == null ? M.v : v;
    if (M.rep) val *= M.rep ** n;
    if (a !== '*' && M.flip && Rel.traits(run, who).some(t => M.flip.includes(t))) val = -Math.abs(val);
    if (e) {
      e.v += val;
      e.n++;
    } else l.push({ w: run.week, k: kind, v: val, n: 1, a });
    while (l.length > REL.max) {
      const i = l.findIndex(x => !(MEMORY[x.k] && MEMORY[x.k].scar));
      l.splice(i < 0 ? 0 : i, 1);
    }
  },
  /** An NPC ↔ NPC memory (squadmates only): `a` = the one who feels it, '*' = both; `v` already scaled by the caller. */
  addPair(run, x, y, kind, v, a = '*') {
    if (x === y || x === run.youId || y === run.youId || !run.people || !run.people[x] || !run.people[y] || !MEMORY[kind]) return;
    Rel.push(run, Rel.key(x, y), a === '*' ? x : a, kind, v, a);
  },
  /** Hold the pair budget: while NPC ↔ NPC memories exceed REL.chem.pairs, the oldest non-scar one goes (a scar only if nothing else is left). */
  trim(run) {
    const keys = Object.keys(run.mem || {}).filter(k => !k.split('|').includes(run.youId));
    let n = keys.reduce((s, k) => s + run.mem[k].length, 0);
    while (n > REL.chem.pairs) {
      let best = null;
      for (const k of keys)
        run.mem[k].forEach((e, i) => {
          const scar = !!(MEMORY[e.k] && MEMORY[e.k].scar);
          if (!best || scar < best.scar || (scar === best.scar && e.w < best.e.w)) best = { k, i, e, scar };
        });
      run.mem[best.k].splice(best.i, 1);
      if (!run.mem[best.k].length) {
        keys.splice(keys.indexOf(best.k), 1);
        delete run.mem[best.k];
      }
      n--;
    }
  },
  /** One memory's weight now: value × fade × the multipliers of their traits (`id` = the one who feels it; the stance is the sum). */
  weigh(run, id, e) {
    const M = MEMORY[e.k] || {},
      ts = Rel.traits(run, id);
    let v = e.v;
    if (e.a === '*' && M.flip && ts.some(t => M.flip.includes(t))) v = -Math.abs(v); // shared memories flip per reader
    let x = v * (M.scar ? 1 : REL.decay ** (run.week - e.w));
    for (const t of ts.map(n => REL.trait[n]).filter(Boolean)) {
      if (M.scar && t.scar) x *= t.scar;
      if (t[e.k]) x *= t[e.k];
      if (v > 0 && t.pos) x *= t.pos;
      if (v < 0 && t.neg) x *= t.neg;
      if (t.payoff) x *= M.payoff ? t.payoff : t.other;
    }
    return x;
  },
  /** How `id` feels about `other` (you by default): Σ of the weights of what they feel, to 0.1. */
  stance(run, id, other = run.youId) {
    let s = 0;
    for (const e of Rel.list(run, id, other)) if (e.a == null || e.a === id || e.a === '*') s += Rel.weigh(run, id, e);
    return Math.round(s * 10) / 10;
  },
  /** The n memories that weigh most (|weight|, newest first on ties): [{ w, k, v, text }]. */
  top(run, id, n = 3) {
    return Rel.list(run, id)
      .map((e, i) => ({ e, i, x: Math.abs(Rel.weigh(run, id, e)) }))
      .sort((a, b) => b.x - a.x || b.e.w - a.e.w || b.i - a.i)
      .slice(0, n)
      .map(({ e }) => ({ w: e.w, k: e.k, v: e.v, text: Rel.text(run, id, e) }));
  },
  /** The diary line for a memory: a template picked by a hash of (kind, week, id) — no R(). */
  text(run, id, e) {
    const p = People.find(run, id),
      alt = MEM_ALT[e.k] && Rel.traits(run, id).find(t => MEM_ALT[e.k][t]),
      L = alt ? MEM_ALT[e.k][alt] : MEM_TEXT[e.k] || MEM_TEXT.event,
      n = p ? p.name.split(' ')[0] : 'Someone';
    return L[Math.floor(hstr(`${e.k}|${e.w}|${id}`) * L.length)].replace(/\{n\}/g, n);
  },
  /** Their season in one line (the rumour voice): from their log. */
  season(run, id) {
    const p = People.find(run, id),
      me = run.people && run.people[id];
    if (!p || !me) return '';
    const g = me.log,
      best = ['hard', 'train', 'hustle', 'rest'].reduce((a, k) => (g[k] > g[a] ? k : a), 'train'),
      L = SEASON_TEXT[g[best] > 0 ? best : 'none'];
    return L[Math.floor(hstr(`season|${best}|${id}`) * L.length)]
      .replace(/\{n\}/g, p.name.split(' ')[0])
      .replace(/\{(hard|train|hustle|rest|hurt)\}/g, (_, k) => g[k]);
  },
  /** What you have found out after a memory: the want, then the two traits (a diary line each). */
  reveal(run, id) {
    const me = run.people[id],
      n = Rel.list(run, id).length;
    if (!me || !me.known || (me.known.want && me.known.traits.every(Boolean))) return;
    if (n < REL.know.want && n < REL.know.trait[0]) return;
    const p = People.find(run, id);
    if (!p) return;
    const first = p.name.split(' ')[0];
    if (!me.known.want && n >= REL.know.want) {
      me.known.want = true;
      Run.log(run, `Figured ${first} out: wants ${WANTS[me.want].name.toLowerCase()}.`);
    }
    REL.know.trait.forEach((need, i) => {
      if (me.known.traits[i] || n < need) return;
      me.known.traits[i] = true;
      Run.log(run, `${first} is ${TRAITS[me.traits[i]].name.toLowerCase()}. Should have seen it.`);
    });
  },
  /** A stance as a band: 'ally' | 'respect' | 'neutral' | 'resent' | 'enemy'. */
  band(s) {
    const T = REL.tags;
    return s >= T.ally ? 'ally' : s >= T.respect ? 'respect' : s <= T.enemy ? 'enemy' : s <= T.resent ? 'resent' : 'neutral';
  },
  tag: (run, id) => Rel.band(Rel.stance(run, id)),
  /** True when they play your role in your squad at about your level. */
  rival(run, id) {
    const you = Run.you(run),
      p = squadOf(Run.myTeam(run)).find(q => q.id === id);
    return !!(you && p && p !== you && p.role === you.role && Math.abs(ovr(p) - ovr(you)) <= REL.rivalOvr);
  },
  bondOf: (run, id) => clamp(Math.round(Rel.stance(run, id) * REL.bondK), 0, 100),
  /** Write the cached bond (only for ids World already tracks, or your current mates). */
  refresh(run, id) {
    const you = Run.you(run);
    if (you && (id in you.bond || Run.mates(run).some(m => m.id === id))) you.bond[id] = Rel.bondOf(run, id);
  },
  /** Fading moves the cached bonds. */
  week(run) {
    const you = Run.you(run);
    if (you) for (const id of Object.keys(you.bond)) Rel.refresh(run, id);
  },
  /** A rival's spot taken: once a week per pair. */
  spot(run, id) {
    if (!Rel.list(run, id).some(e => e.k === 'spot_taken' && e.w === run.week)) Rel.add(run, id, 'spot_taken');
  },
  /** How each feels about the other: [x → y, y → x]. With you in it, only their stance toward you counts (both entries). */
  views(run, x, y) {
    if (x === run.youId || y === run.youId) {
      const s = Rel.stance(run, x === run.youId ? y : x);
      return [s, s];
    }
    return [Rel.stance(run, x, y), Rel.stance(run, y, x)];
  },
  /**
   * A squad's chemistry (T-065): cliques = groups of 3+ joined by mutual allies (both ≥ REL.tags.ally), feuds = pairs that both feel resent or
   * worse; `ally` / `foe` = id → Set of ids. Arithmetic on run.mem only (no R()).
   */
  chem(run, T) {
    const ids = squadOf(T).map(p => p.id),
      ally = {},
      foe = {},
      feuds = [];
    for (const id of ids) ((ally[id] = new Set()), (foe[id] = new Set()));
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = Rel.views(run, ids[i], ids[j]);
        if (Math.min(a, b) >= REL.tags.ally) (ally[ids[i]].add(ids[j]), ally[ids[j]].add(ids[i]));
        else if (Math.max(a, b) <= REL.tags.resent) {
          foe[ids[i]].add(ids[j]);
          foe[ids[j]].add(ids[i]);
          feuds.push([ids[i], ids[j]]);
        }
      }
    const cliques = [],
      seen = new Set();
    for (const id of ids) {
      if (seen.has(id) || !ally[id].size) continue;
      const comp = [],
        todo = [id];
      seen.add(id);
      while (todo.length) {
        const x = todo.pop();
        comp.push(x);
        for (const y of ally[x]) if (!seen.has(y)) (seen.add(y), todo.push(y));
      }
      if (comp.length >= 3) cliques.push(comp.sort());
    }
    return { cliques, feuds, ally, foe };
  },
  /** The lineup bonus a captain's relations give p: +REL.chem.capVouch for an ally, −that for an enemy (chem from Rel.chem). */
  capBonus(run, chem, cap, p) {
    if (!cap || p === cap) return 0;
    return REL.chem.capVouch * ((chem.ally[cap.id].has(p.id) ? 1 : 0) - (chem.foe[cap.id].has(p.id) ? 1 : 0));
  },
  /** Who an NPC stands with and against (their strongest NPC ↔ NPC stances, ≥ ally / ≤ resent), others in their squad: { with, against } of ids. */
  sides(run, id) {
    const p = People.find(run, id),
      out = { with: [], against: [] };
    if (!p || !p.team) return out;
    const mates = squadOf(p.team).filter(q => q.id !== id && q.id !== run.youId && run.mem[Rel.key(id, q.id)]);
    const st = mates.map(q => ({ id: q.id, s: Rel.stance(run, id, q.id) })).sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
    out.with = st.filter(x => x.s >= REL.tags.ally).map(x => x.id);
    out.against = st
      .filter(x => x.s <= REL.tags.resent)
      .reverse()
      .map(x => x.id);
    return out;
  },
  /**
   * What the engine needs from the relationships (T-066) for a match between squads A and B: { tag: { 'idA|idB': band } (viewer first; only
   * non-neutral ones; you ↔ NPC is the NPC's stance both ways; NPC ↔ NPC only inside a squad, where pair memories exist), rival: Set of
   * 'idA|idB' (both ways: the same role within REL.rivalOvr OVR — squadmates fighting for a seat, or opponents who resent / hate each other) }.
   */
  matchFlags(run, A, B) {
    const sa = squadOf(A),
      all = [...sa, ...squadOf(B)],
      tag = {},
      rival = new Set();
    for (const x of all)
      for (const y of all) {
        if (x === y) continue;
        const you = x.id === run.youId || y.id === run.youId,
          s = you ? Rel.stance(run, x.id === run.youId ? y.id : x.id) : run.mem[Rel.key(x.id, y.id)] ? Rel.stance(run, x.id, y.id) : 0,
          t = Rel.band(s);
        if (t !== 'neutral') tag[`${x.id}|${y.id}`] = t;
        if (
          x.role === y.role &&
          Math.abs(ovr(x) - ovr(y)) <= REL.rivalOvr &&
          (sa.includes(x) === sa.includes(y) || t === 'resent' || t === 'enemy')
        )
          rival.add(`${x.id}|${y.id}`);
      }
    return { tag, rival };
  },
  /** The NPCs of `opp` who are your rivals across the net: your role, within REL.rivalOvr OVR, resent or enemy. */
  rivals(run, opp) {
    const you = Run.you(run);
    return you
      ? squadOf(opp).filter(
          p =>
            p.id !== run.youId &&
            p.role === you.role &&
            Math.abs(ovr(p) - ovr(you)) <= REL.rivalOvr &&
            ['resent', 'enemy'].includes(Rel.tag(run, p.id))
        )
      : [];
  },
  /** You won: everyone on the other side who played remembers it. */
  beatMe(run, m) {
    for (const p of squadOf(m.t[1])) if (m.played.has(p.id)) Rel.add(run, p.id, 'beat_me');
  },
  /** After a match you played in (`side` = your side): teammates who played, and what the ego log says about you. */
  afterMatch(run, m, side) {
    const you = Run.you(run);
    if (!you || !m.played.has(you.id)) return;
    const mates = squadOf(m.t[side]).filter(p => p !== you && m.played.has(p.id)),
      won = m.winner === side;
    for (const p of mates) Rel.add(run, p.id, won ? 'won_together' : 'lost_together');
    for (const e of m.egoLog) {
      const me = e.p === you.id,
        other = me ? e.mate : e.mate === you.id ? e.p : null;
      if (e.act === 'steal' && me) Rel.add(run, e.mate, 'stole_my_ball');
      if (e.act === 'steal' && e.crash && other) Rel.add(run, other, 'collided');
      if (e.act === 'collide' && other) Rel.add(run, other, 'collided');
      if (e.act === 'swing' && e.ok && me) for (const p of mates) Rel.add(run, p.id, 'hero_carried');
      if (e.act === 'call' && e.ok && me) Rel.add(run, e.mate, 'set_hogged');
    }
  }
};
