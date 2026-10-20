// Talent tiers and gifts (spec §4.35, owner 2026-10-20): every NPC's hidden potential shown as a letter, and 0–2 innate gifts
// rolled by hash (never R()). Data only: the rules are js/career/gifts.js (Gifts), the match effects js/engine/elements.js and
// js/engine/bars.js (they read `p.gifts` only: a player without gifts plays as before). desc: the registrar's line (true numbers).

/** Tier letters from `p.pot` (0.6–1.6): the first whose bar it reaches. */
const GIFT_TIERS = [
  ['S', 1.4],
  ['A', 1.2],
  ['B', 0.95],
  ['C', 0.75],
  ['D', -Infinity]
];
/** Shares: `two` of players have two gifts, `one` one (the rest none). know: the bond that shows a person's tier and gifts. */
const GIFT_ODDS = { two: 0.1, one: 0.45, know: 20 };
/**
 * id → { name, desc, kind ('growth' | 'body' | 'element' | 'mind' | 'social'), w (roll weight), cost ($ for the gift chance;
 * none = never on offer: the bad ones), k / stat (the effect's numbers) }. Two gifts of one player are never of one kind.
 */
const GIFTS = {
  prodigy: { name: 'Prodigy', kind: 'growth', w: 3, cost: 500, k: 1.3, desc: 'All growth × 1.3.' },
  lateBloomer: { name: 'Late Bloomer', kind: 'growth', w: 5, cost: 150, k: [0.8, 1.4], desc: 'Growth × 0.8 in year 1, × 1.4 in year 2.' },
  earlyPeak: { name: 'Early Peak', kind: 'growth', w: 5, k: [1.3, 0.6], at: 75, desc: 'Growth × 1.3 up to OVR 75, × 0.6 above.' },
  grinder: { name: 'Grinder', kind: 'growth', w: 6, cost: 150, k: [1.3, 0.7], desc: 'Training × 1.3. Match XP × 0.7.' },
  gamer: { name: 'Gamer', kind: 'growth', w: 6, cost: 150, k: [0.8, 1.5], desc: 'Match XP × 1.5. Training × 0.8.' },
  springLegs: { name: 'Spring Legs', kind: 'body', w: 6, cost: 300, stat: { jump: 4 }, desc: 'Jump +4.' },
  rubberJoints: { name: 'Rubber Joints', kind: 'body', w: 5, cost: 300, stat: { def: 3 }, desc: 'Defense +3. The swing is never short.' },
  ironFrame: { name: 'Iron Frame', kind: 'body', w: 5, cost: 300, k: 0.85, desc: 'HP damage × 0.85.' },
  quickTwitch: { name: 'Quick Twitch', kind: 'body', w: 6, cost: 300, stat: { speed: 4 }, desc: 'Speed +4.' },
  glassBones: { name: 'Glass Bones', kind: 'body', w: 4, k: 1.5, desc: 'Injury chance × 1.5.' },
  elementBorn: { name: 'Element-born', kind: 'element', w: 5, cost: 300, k: 1.3, desc: 'Element gauge fills × 1.3.' },
  elementless: { name: 'Elementless', kind: 'element', w: 4, wit: 0.2, desc: 'No element at all. Wit +0.2.' },
  twinElement: { name: 'Twin Element', kind: 'element', w: 1, cost: 500, desc: 'A second element: every other element spike is it.' },
  dormant: { name: 'Dormant', kind: 'element', w: 3, desc: 'The element sleeps until their first Cup.' },
  leader: { name: 'Natural Leader', kind: 'mind', w: 4, cost: 300, lead: 15, desc: 'Leadership +15.' },
  reader: { name: 'Reader', kind: 'mind', w: 5, cost: 300, k: 1.3, desc: 'Wit growth × 1.3.' },
  iceVeins: { name: 'Ice Veins', kind: 'mind', w: 4, cost: 300, mor: -0.55, desc: 'Never Rattled from 12 points.' },
  choker: { name: 'Choker', kind: 'mind', w: 4, k: 1.5, desc: 'Morale drops × 1.5 from 12 points.' },
  magnetic: { name: 'Magnetic', kind: 'social', w: 4, cost: 150, k: 1.3, desc: 'Bonds with them grow × 1.3.' },
  loneWolf: { name: 'Lone Wolf', kind: 'social', w: 4, k: 0.7, desc: 'Bonds with them grow × 0.7.' },
  generous: { name: 'Generous', kind: 'social', w: 4, cost: 150, k: 1.5, desc: 'Training beside them: what rubs off × 1.5.' },
  contagious: { name: 'Contagious', kind: 'social', w: 4, cost: 300, k: 0.04, desc: 'Their kills lift every teammate’s morale +0.04.' }
};
/**
 * The gift chance (spec §4.35, T-322): when your bond with a gifted friend first reaches `bond`, they offer to show you one of
 * their gifts with a `cost` — pay for a chance of `base` + `per` per bond point over `bond`; once per friend; you keep at most `max`.
 */
const GIFT_ASK = { bond: 50, base: 0.35, per: 0.01, max: 2 };
/** The event's lines (voice: diary — the MC). {n} = their first name, {g} = the gift. */
const GIFT_LINES = {
  offer: [
    '{n} says {g} can be taught. Maybe. Not for free.',
    '{n} offers to show me how {g} works. Their time costs, apparently.',
    '{n} caught me after the session: "{g}. I could show you." Then named a price.'
  ],
  won: ['{n} showed me. {g} — mine now. Didn’t think it would take.', 'It took. {g}. {n} looked more surprised than I did.'],
  lost: ['{n} tried. I tried. {g} didn’t take. Money gone.', 'Nothing. {n} says some bodies just don’t listen. Mine, apparently.'],
  decline: ['Told {n} no. I’ll get there my own way.'],
  short: ['Can’t pay {n}. {g} will have to wait.']
};
