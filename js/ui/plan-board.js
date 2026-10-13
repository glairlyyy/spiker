// The Plan board (spec §2.29): a card per player under the team plans in match prep, and on Tab mid-match (play waits).
// Each choice shows its outcome odds (srvOdds: the engine's formulas, no draws); locked options show the gap. Orders go
// straight into m.ord and stand for the match; an order made mid-rally plays from the next rally.

const BOARD_PCT = x => `${Math.round(100 * x)} %`;
/** Who you set orders for on side i: 'all' (Monster "You decide"; career captain), your own id (career), or null. */
function boardEdit(m, i) {
  if (!(A.fx.onFinish && typeof RUN !== 'undefined' && RUN)) return A.prepS && A.prepS.who[i] === 'you' ? 'all' : null;
  const you = Run.you(RUN);
  if (!squadOf(m.t[i]).some(p => p.id === you.id)) return null;
  return you.cap ? 'all' : you.id;
}
/** A standing order shows on the court tag (only on a side whose board you see). */
const boardMark = (m, p) => !!(m.ord && m.ord[p.id] && A.prepS && [0, 1].some(i => m.t[i].P.includes(p) && boardEdit(m, i)));
/** One choice: a list of its options, each with its odds on the right (or the gap when locked). */
function boardRow(p, kind, label, opts, cur, odds, can) {
  return `<div class="brow"><span class="lab">${label}</span>${opts
    .map(o => {
      const on = String(o.v) === String(cur),
        right = o.lock ? `🔒 ${esc(o.lock)}` : odds(o.v);
      return `<button class="bopt ${on ? 'on' : ''} ${o.lock ? 'lock' : ''}" ${o.lock || !can ? 'disabled' : `onclick="boardPick('${p.id}','${kind}','${o.v}')"`} ${tip(o.lock ? `Locked: ${o.lock}` : right)}><span>${esc(o.label)}</span><small>${right}</small></button>`;
    })
    .join('')}</div>`;
}
/** A player's card: bad news first, then the serve choices (spike / set / block rows come with T-278–T-280). */
function boardCard(m, i, p, can) {
  const K = Coach.condition(m, i).players.find(r => r.p === p),
    bad = K ? K.words.filter(w => w.tone !== 'good') : [],
    srv = ordOf(m, p, 'srv') || 'auto',
    tgt = ordOf(m, p, 'tgt') || 'auto',
    so = v => {
      const o = srvOdds(m, p, i, v, undefined);
      return `${BOARD_PCT(o.hit)} · ${BOARD_PCT(o.err)}`;
    },
    to = v => {
      const o = srvOdds(m, p, i, undefined, v);
      return `${BOARD_PCT(o.hit)} · ${BOARD_PCT(o.err)}`;
    };
  return `<div class="bcard ${can ? '' : 'ro'}"><div class="bhead"><b>${stag(p)}#${p.num} ${esc(p.name.split(' ')[0])}</b> <span class="mute">${p.role}</span>${bad
    .map(w => `<i class="cw cw-${w.tone}" ${tip(w.why)}>${esc(w.t)}</i>`)
    .join('')}</div>
    ${boardRow(p, 'srv', 'Serve', srvOpts(p), srv, so, can)}
    ${boardRow(p, 'tgt', 'Target', tgtOpts(p, m.t[1 - i]), tgt, to, can)}</div>`;
}
/** Side i's board (empty when you set nothing there): its four cards in a row. */
function boardSide(i) {
  const m = A.m,
    who = boardEdit(m, i),
    t = m.t[i];
  if (!who) return '';
  return `<section class="pboard" style="--tc:${t.color}"><div class="lab">${chip(t)}${esc(t.short)} · players <span class="mute">— serve odds: ace or broken pass · miss</span></div><div class="bcards">${rotOrder(
    t,
    m.rot[i]
  )
    .map(p => boardCard(m, i, p, who === 'all' || who === p.id))
    .join('')}</div></section>`;
}
function boardPick(id, kind, v) {
  if (!A || !A.m) return;
  const p = [0, 1].flatMap(i => squadOf(A.m.t[i])).find(q => String(q.id) === id);
  if (!p) return;
  ordSet(A.m, p, kind, v === 'auto' ? null : v);
  prepDraw();
}
/** Tab mid-match: open the board (play waits) — or close it. */
function boardToggle() {
  if (!A || !A.m || A.done) return;
  if (A.prep) {
    if (A.prepS && A.prepS.board) prepStart();
    return;
  }
  if ([0, 1].some(i => boardEdit(A.m, i))) prepOpen(null, true);
}
