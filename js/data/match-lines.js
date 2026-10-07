// Cinematic match lines (spec §2.18): event kind × personality → variants, picked by hash (never R()). Filled by T-263.
// Voice: lore.md. Placeholders: {me} the speaker's first name, {them} the other's, {team}, {score}.

/** kind → { pers → [lines] } ('any' = every personality). */
const MLINES = {};
