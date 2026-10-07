// One-press prompts in a played match (spec §2.16, §2.17): Call / Fake / Block under your player's feet, the setter's
// hitter markers and Dump, the captain's Fire up / Settle. Answers the engine's decision points (playRallyGen). Filled by T-256.

/** Decision kinds the prompts answer (the rest are answered with the AI's pick at once). */
const PROMPT_KINDS = new Set(['call', 'block', 'setter']);
