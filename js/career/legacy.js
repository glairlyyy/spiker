// Meta progression: Legacy points earned per run, permanent unlocks (each can be switched off), the Hall of Fame.
// Saved separately from runs. A run keeps the unlocks that were on when it started (run.legacy).

const Legacy = {
  load() {
    const d = store.getJSON(KEYS.legacy, null) || {};
    return { pts: d.pts || 0, owned: d.owned || [], off: d.off || [], runs: d.runs || 0, best: d.best || null, history: d.history || [], hof: d.hof || [] };
  },
  save(L) {
    store.setJSON(KEYS.legacy, L);
  },
  /** Unlocks owned and switched on right now (what a new run gets). */
  active() {
    const L = Legacy.load();
    return L.owned.filter(id => !L.off.includes(id));
  },
  has: id => Legacy.active().includes(id),
  /** Inside a run: was this unlock on when the run started? */
  on: (run, id) => (run && run.legacy ? run.legacy.includes(id) : Legacy.has(id)),
  /** Switch an owned unlock on or off (applies from the next run). */
  toggle(id) {
    const L = Legacy.load();
    if (!L.owned.includes(id)) return false;
    L.off = L.off.includes(id) ? L.off.filter(x => x !== id) : [...L.off, id];
    Legacy.save(L);
    return true;
  },
  /** Creation points available (base + Extra budget unlocks). `list` = the unlocks in force. */
  budget: (list = Legacy.active()) => CAREER.budget + ['budget1', 'budget2', 'budget3'].filter(id => list.includes(id)).length * 5,
  staMax: (list = Legacy.active()) => (list.includes('fresh') ? 120 : CAREER.staMax),
  createCap: (list = Legacy.active()) => (list.includes('spurt') ? 75 : CAREER.createCap),
  /** Apply start-of-run unlocks to a freshly created run. */
  applyStart(run) {
    const you = Run.you(run),
      mates = Run.mates(run),
      h = id => Legacy.on(run, id);
    if (h('vibes')) run.mood = MOODS.length - 1;
    if (h('fans')) run.fans += 1000;
    if (h('fund')) run.sp += 100;
    if (h('leader')) you.lead = Math.min(99, you.lead + 20);
    if (h('gym')) for (const k of TRAINK) run.uses[k] = TRAIN_X.lvUses[1];
    if (h('bonded')) for (const m of mates) you.bond[m.id] = Math.max(you.bond[m.id] || 0, 30);
    if (h('eye')) for (const m of mates) m.pot = +((m.pot || 1) + 0.35).toFixed(2);
    // teammates: best by overall get the upgrade (OP first, then stars)
    const order = [...mates].sort((a, b) => ovr(b) - ovr(a));
    let i = 0;
    if (h('opmate')) {
      const p = order[i++];
      Growth.awaken(run, p, true, false);
      Growth.awaken(run, p, true, true);
    }
    for (let n = h('starmate2') ? 2 : h('starmate') ? 1 : 0; n > 0 && i < order.length; n--) Growth.awaken(run, order[i++], true, false);
    finalizeTeam(Run.myTeam(run));
  },
  canBuy(L, u) {
    return !L.owned.includes(u.id) && L.pts >= u.cost && (!u.need || L.owned.includes(u.need));
  },
  buy(id) {
    const L = Legacy.load(),
      u = UNLOCKS.find(x => x.id === id);
    if (!u || !Legacy.canBuy(L, u)) return false;
    L.pts -= u.cost;
    L.owned.push(id);
    Legacy.save(L);
    return true;
  },
  /** Legacy points for a finished run: fans, × challenge modes and pure-run bonus, + Double Crown. */
  earned(res) {
    let mul = res.pure ? PURE_BONUS : 1;
    for (const k in MODES) if (res.mode && res.mode[k]) mul *= MODES[k].legacy;
    const crown = res.cups && res.cups.length === CUPS.length && res.cups.every(c => c.place === 'Champion') ? DOUBLE_CROWN : 0;
    return Math.floor((res.fans / LEGACY_PER_FANS) * mul) + crown;
  },
  /** Record a finished run; returns the Legacy points earned. Great runs enter the Hall of Fame (top 6 by fans). */
  record(res) {
    const L = Legacy.load(),
      earned = Legacy.earned(res);
    L.pts += earned;
    L.runs++;
    if (!L.best || res.fans > L.best.fans) L.best = { fans: res.fans, rank: res.rank, name: res.name };
    L.history = [{ name: res.name, role: res.role, fans: res.fans, rank: res.rank, place: res.place }, ...L.history].slice(0, 10);
    if (res.stats)
      L.hof = [...L.hof, { name: res.name, role: res.role, fans: res.fans, rank: res.rank, stats: res.stats, skills: res.skills || [], cups: res.cups || [], el: res.el || null, sig: res.sig || null, elOn: !!res.elOn }]
        .sort((a, b) => b.fans - a.fans)
        .slice(0, 6);
    Legacy.save(L);
    return earned;
  }
};
const rankOf = fans => RANKS.find(([, min]) => fans >= min)[0];
