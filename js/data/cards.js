// Semi-automatic matches (spec §2.31–§2.33): the bars (HP, morale traits), turns and the tactic cards. Data only — the
// engine is js/engine/bars.js and js/engine/cards.js. First numbers, measured (npm run cards), not tuned yet.

/**
 * HP (spec §2.31): every kept-up serve receive / dig takes damage = (impact − gap) / span × the ball's weight (impact = the
 * knockdown's: ball power − Defense as played × KNOCK.defK; weight from KNOCK.from → KNOCK.full). At 0: collapse (the
 * knockdown). After every rally court players heal `heal`, the bench all of it. Low HP drains stamina × 1 + drain × (1 − hp).
 */
const HP = { gap: 0, span: 30, heal: 0.2, drain: 0.5 };

/**
 * Morale traits (spec §2.31), by hash of the player (`share` of all players each; the rest have none). up: their own error /
 * being stuffed (Spiteful); lost: × on a lost point; shake: × on marathons and hard kills; kill: + on their own kill; mates:
 * × on a point a teammate's kill won; lift: the lowest teammate's morale on a lost point (Anchor).
 */
const MTRAITS = {
  spiteful: { name: 'Spiteful', share: 0.12, up: 0.15, lost: 0.5, tip: 'errors and stuffs fire them up' },
  glass: { name: 'Glass', share: 0.1, shake: 2, tip: 'marathons and hard kills shake them twice as hard' },
  showboat: { name: 'Showboat', share: 0.1, kill: 0.15, mates: 0.5, tip: 'lives for their own kills' },
  anchor: { name: 'Anchor', share: 0.1, lost: 0.7, lift: 0.08, tip: 'holds steady and lifts the lowest teammate' },
  stubborn: { name: 'Stubborn', share: 0.08, tip: 'plays their own game: ignores what a card forces' }
};
