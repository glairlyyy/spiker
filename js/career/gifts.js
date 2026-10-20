// Talent tiers and gifts (spec §4.35): the tier letter from the hidden potential, every NPC's 0–2 innate gifts (People.ensure
// rolls them once, by a hash of the run seed and the player: no R()), what you know about them, and their career effects
// (growth, the body stats, leadership, the element). The match effects read `p.gifts` in js/engine/elements.js and bars.js.
// DOM-free. Data: js/data/gifts.js (GIFTS, GIFT_TIERS, GIFT_ODDS).
// Contract (Agent P's card and presence read these): Gifts.tier(p), Gifts.of(p), Gifts.known(run, p), GIFTS[id].

const Gifts = {
  /** 'S' | 'A' | 'B' | 'C' | 'D': an authored `p.tier` (the named), else from `p.pot` (GIFT_TIERS). */
  tier(p) {
    if (p && p.tier) return p.tier;
    const v = p && Number.isFinite(p.pot) ? p.pot : 1;
    return GIFT_TIERS.find(([, at]) => v >= at)[0];
  },
  /** p's gift ids (none: []). */
  of: p => (p && Array.isArray(p.gifts) ? p.gifts : []),
  has: (p, id) => hasGift(p, id),
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
    const g = Gifts.of(p);
    if (!g.length) return 1;
    let x = 1;
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
