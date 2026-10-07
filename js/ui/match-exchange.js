// The between-point exchange box (spec §2.18): 1–2 lines with face cut-ins over the court, skippable. The director
// (js/render/director.js) decides when and what; this file only shows it. Stub until T-255.

/** Show lines [{ p: player id, t: text, side }]; `done` runs when they end or are skipped. */
function exchangeShow(lines, done) {
  if (done) done(lines);
}
/** Hide at once (skip, leaving the match). */
function exchangeHide() {}
