// Talent tiers and gifts (spec §4.35): the tier letter from the hidden potential, every NPC's 0–2 innate gifts (People.ensure
// rolls them once, by a hash of the run seed and the player: no R()), what you know about them, and their career effects
// (growth, the body stats, leadership, the element). The match effects read `p.gifts` in js/engine/elements.js and bars.js.
// DOM-free. Data: js/data/gifts.js (GIFTS, GIFT_TIERS, GIFT_ODDS).
// The person card and presence read Gifts.tier(p), Gifts.of(p), Gifts.known(run, p), GIFTS[id].

const Gifts = {
  /** 'S' | 'A' | 'B' | 'C' | 'D': an authored `p.tier` (the named), else from `p.pot` (GIFT_TIERS). */
  tier(p) {
    if (p && p.tier) return p.tier;
    const v = p && Number.isFinite(p.pot) ? p.pot : 1;
    return GIFT_TIERS.find(([, at]) => v >= at)[0];
  },
  /** p's gift ids (none: []). */
  of: p => (p && Array.isArray(p.gifts) ? p.gifts : []),
  /**
   * Do you know p's tier and gifts? Yourself; or their club is scouted, you have trained beside them (a `trained` memory) or your
   * bond is GIFT_ODDS.know+. Once known, always known (run.people[id].known.gifts).
   */
  known(run, p) {
    if (!p || !run) return false;
    if (p.id === run.youId) return true;
    const me = run.people && run.people[p.id];
    if (me && me.known && me.known.gifts) return true;
    const ti = run.teams.indexOf(p.team),
      k = (ti >= 0 && City.scouted(run, ti)) || Rel.list(run, p.id).some(e => e.k === 'trained') || Rel.bondOf(run, p.id) >= GIFT_ODDS.know;
    if (k && me && me.known) me.known.gifts = true;
    return !!k;
  },
  /** A hash's avalanche (murmur3 fmix32): FNV-1a alone barely moves its high bits on the last characters (`p12` vs `p13`). */
  mix(u) {
    let h = Math.floor(u * 4294967296);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  },
  /** The gifts a hash gives player `id` in a run with seed `seed`: 0–2 (GIFT_ODDS), weighted by GIFTS[].w, never two of one kind. */
  pick(seed, id) {
    const h = i => Gifts.mix(hstr(`${seed}|${id}|gift|${i}`)),
      u = h(0),
      n = u < GIFT_ODDS.two ? 2 : u < GIFT_ODDS.two + GIFT_ODDS.one ? 1 : 0,
      out = [];
    for (let i = 0; i < n; i++) {
      const keys = Object.keys(GIFTS).filter(k => !out.some(o => GIFTS[o].kind === GIFTS[k].kind));
      out.push(hpick(keys, Object.fromEntries(keys.map(k => [k, GIFTS[k].w])), h(i + 1)));
    }
    return out;
  },
  /** Give an NPC their gifts once (a player that has `gifts` keeps them) and apply what is innate. */
  roll(run, p) {
    if (Array.isArray(p.gifts)) return;
    p.gifts = Gifts.pick(run.pseed, p.id);
    Gifts.innate(p, p.gifts);
  },
  /**
   * The once-only part of gifts `ids` on p: body-stat bonuses (an NPC's stats; a body / a named player gets them at each sync /
   * shape instead), Wit, Leadership, no element (Elementless, Dormant until woken), a second element (Twin).
   */
  innate(p, ids) {
    for (const id of ids) {
      const G = GIFTS[id];
      if (!G) continue;
      if (G.stat && !p.body && !p.named) for (const [k, v] of Object.entries(G.stat)) p[k] = clamp(p[k] + v, STAT_FLOOR, 99);
      if (G.wit && !p.named) p.wit = +clamp(p.wit + G.wit, 0.1, 3).toFixed(2);
      if (G.lead) p.lead = Math.min(99, (p.lead || 50) + G.lead);
      if ((id === 'elementless' || id === 'dormant') && p.elOn) p.elOn = false;
      if (id === 'twinElement' && !p.el2) {
        if (!p.el) elAssign(p);
        const rest = ELS.filter(e => e !== p.el);
        p.el2 = rest[Math.floor(hu(p, 'el2') * rest.length)];
        elAssign(p); // its signature (sig2)
      }
    }
  },
  /** The body-stat bonus of p's gifts for court skill k (Spring Legs, Rubber Joints, Quick Twitch). */
  stat(p, k) {
    let s = 0;
    for (const id of Gifts.of(p)) s += (GIFTS[id] && GIFTS[id].stat && GIFTS[id].stat[k]) || 0;
    return s;
  },
  /** Wit from p's gifts (Elementless) — the named get it on their curve. */
  wit: p => Gifts.of(p).reduce((s, id) => s + ((GIFTS[id] && GIFTS[id].wit) || 0), 0),
  /** Growth × for p: src 'train' | 'match', `stat` the one it goes to (Reader: wit). 1 without growth gifts. */
  grow(run, p, src = 'train', stat = null) {
    const g = Gifts.of(p),
      arc = Team.growMul(run, p); // an arc you saw through: × 1.1 this season (spec §4.36 3)
    if (!g.length) return arc;
    let x = arc;
    for (const id of g) {
      const G = GIFTS[id];
      if (id === 'prodigy') x *= G.k;
      else if (id === 'lateBloomer') x *= G.k[Season.year(run) > 1 ? 1 : 0];
      else if (id === 'earlyPeak') x *= G.k[ovr(p) < G.at ? 0 : 1];
      else if (id === 'grinder' || id === 'gamer') x *= G.k[src === 'match' ? 1 : 0];
      else if (id === 'reader' && stat === 'wit') x *= G.k;
    }
    return x;
  },
  /** Bond growth × with NPC `id` (positive memories; for Rel.add): their Magnetic / Lone Wolf, your Magnetic. */
  bondMul(run, id) {
    const p = People.find(run, id);
    let x = 1;
    for (const g of ['magnetic', 'loneWolf']) if (hasGift(p, g)) x *= GIFTS[g].k;
    if (hasGift(Run.you(run), 'magnetic')) x *= GIFTS.magnetic.k;
    return x;
  },
  /** Your learned gifts (`run.gifts`) onto your player (`you.gifts`, read by the engine and the career like an NPC's). */
  sync(run) {
    const you = Run.you(run);
    if (!you) return;
    if (run.gifts && run.gifts.length) you.gifts = run.gifts.filter(id => GIFTS[id]);
    else delete you.gifts;
  },
  /** The gift chance for `bond`: GIFT_ASK.base + per point over GIFT_ASK.bond (≤ 0.95). */
  chance: bond => clamp(GIFT_ASK.base + GIFT_ASK.per * Math.max(0, bond - GIFT_ASK.bond), 0, 0.95),
  /** A gift of p's you could learn: one with a cost (the good ones) that you don't have. */
  offerOf: (run, p) => Gifts.of(p).find(id => GIFTS[id] && GIFTS[id].cost && !(run.gifts || []).includes(id)) || null,
  /** One of a line list by hash, {n} / {g} filled. */
  line(k, run, who, gift) {
    const L = GIFT_LINES[k],
      p = People.find(run, who),
      n = p ? p.name.split(' ')[0] : 'Someone';
    return L[Math.floor(hstr(`gline|${k}|${who}|${run.pseed}`) * L.length)]
      .replace(/\{n\}/g, () => n)
      .replace(/\{g\}/g, () => GIFTS[gift].name);
  },
  /**
   * The gift chance event (spec §4.35): the first friend (highest bond) whose bond with you has reached GIFT_ASK.bond and who has a
   * gift to offer gets run.event 'gift' — once per friend (`run.giftAsk`), not with an event open, in a cup or at GIFT_ASK.max gifts.
   * Checked at the week's start and after each day (City.day). Returns true when it opened.
   */
  ask(run) {
    if (run.event || Run.cupDef(run) || (run.gifts || []).length >= GIFT_ASK.max) return false;
    const asked = run.giftAsk || (run.giftAsk = {}),
      ids = [...new Set(Object.keys(run.mem || {}).flatMap(k => k.split('|')))].filter(id => id !== run.youId && !asked[id]);
    let best = null;
    for (const id of ids) {
      const me = run.people && run.people[id],
        p = me && me.status === 'active' ? People.find(run, id) : null,
        bond = p ? Rel.bondOf(run, id) : 0,
        gift = bond >= GIFT_ASK.bond ? Gifts.offerOf(run, p) : null;
      if (gift && (!best || bond > best.bond || (bond === best.bond && id < best.id))) best = { id, bond, gift };
    }
    if (!best) return false;
    asked[best.id] = run.week;
    run.people[best.id].known.gifts = true; // they told you
    run.event = { id: 'gift', who: best.id, gift: best.gift, cost: GIFTS[best.gift].cost, p: Gifts.chance(best.bond), pre: true };
    return true;
  },
  /** Answer the event: pay (i = 0) or decline. Paying rolls the chance on a hash (no R()). Returns the diary line. */
  answer(run, i) {
    const ev = run.event;
    run.event = null;
    if (i) return Gifts.line('decline', run, ev.who, ev.gift);
    if (run.money < ev.cost) return Gifts.line('short', run, ev.who, ev.gift);
    run.money -= ev.cost;
    const got = Gifts.mix(hstr(`${run.pseed}|giftask|${ev.who}|${ev.gift}`)) < ev.p;
    if (got) Gifts.learn(run, ev.gift);
    return `${Gifts.line(got ? 'won' : 'lost', run, ev.who, ev.gift)} (−$${ev.cost}${got ? `, ${GIFTS[ev.gift].name}: ${GIFTS[ev.gift].desc}` : ''})`;
  },
  /** You learn gift `id` (max GIFT_ASK.max): into run.gifts, onto you, its once-only part (Leadership, Twin), your body re-synced. */
  learn(run, id) {
    if (!GIFTS[id] || (run.gifts || []).includes(id) || (run.gifts || []).length >= GIFT_ASK.max) return false;
    (run.gifts || (run.gifts = [])).push(id);
    Gifts.sync(run);
    const you = Run.you(run);
    Gifts.innate(you, [id]);
    Body.sync(you, run);
    return true;
  },
  /**
   * What rubs off this session (spec §4.35, T-323) from teammates `ids` on the floor with you: each friend at GIFT_RUB.bond+ with a
   * body or growth gift (GIFT_RUB) shares it — { all: × every gain, keys: { bodyKey: × }, from: [{ id, gift, key, x }] }.
   */
  rub(run, ids) {
    const you = Run.you(run),
      mates = squadOf(Run.myTeam(run)),
      out = { all: 1, keys: {}, from: [] };
    for (const id of ids || []) {
      const p = mates.find(q => q.id === id);
      if (!p || p === you || ((you && you.bond[id]) || 0) < GIFT_RUB.bond) continue;
      const gen = hasGift(p, 'generous') ? GIFTS.generous.k : 1;
      for (const g of Gifts.of(p)) {
        const R = GIFT_RUB[g];
        if (!R || !R.k || (R.y2 && Season.year(run) < 2)) continue;
        const x = +(1 + (R.k - 1) * gen).toFixed(3);
        if (R.key) out.keys[R.key] = (out.keys[R.key] || 1) * x;
        else out.all *= x;
        out.from.push({ id, gift: g, key: R.key || null, x });
      }
    }
    return out;
  },
  /** The first Cup wakes a Dormant element: every player of the Cup's squads (Run.endWeek, after Cup.start). */
  wake(run) {
    const ids = new Set(((run.cup && run.cup.entrants) || []).flatMap(e => e.ids || []));
    for (const { p } of People.homes(run).values())
      if (hasGift(p, 'dormant') && !p.woke && ids.has(p.id)) {
        p.woke = true;
        elCheck(p);
      }
  }
};
