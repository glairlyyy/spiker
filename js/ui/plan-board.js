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
/** One choice: a list of its options, each with its odds on the right (or the gap when locked). odds(v) → text, or
 * { txt, key } for odds still being worked out (filled in place when ready). */
function boardRow(p, kind, label, opts, cur, odds, can) {
  return `<div class="brow"><span class="lab">${label}</span>${opts
    .map(o => {
      const on = String(o.v) === String(cur),
        r = o.lock ? `🔒 ${esc(o.lock)}` : odds(o.v),
        right = typeof r === 'string' ? r : r.txt,
        key = typeof r === 'string' ? '' : ` data-odds="${esc(r.key)}"`;
      return `<button class="bopt ${on ? 'on' : ''} ${o.lock ? 'lock' : ''}" ${o.lock || !can ? 'disabled' : `onclick="boardPick('${p.id}','${kind}','${o.v}')"`} ${o.lock ? tip(`Locked: ${o.lock}`) : ''}><span>${esc(o.label)}</span><small${key}>${right}</small></button>`;
    })
    .join('')}</div>`;
}
/** Spike odds text: kill · error. */
const boardAtkTxt = o => `${BOARD_PCT(o.kill)} · ${BOARD_PCT(o.err)}`;
const BOARD_Q = [];
let boardBusy = false;
/** The spike odds for p with aim / shot: cached for this point, else queued (atkOdds plays it out: ~0.1 s each). */
function boardAtk(m, i, p, aim, shot) {
  const key = `${p.id}|${aim}|${shot}|${m.pts}|${m.rot}|${m.setNo}`,
    c = (A.prepS.odds || (A.prepS.odds = {}))[key];
  if (c) return { txt: boardAtkTxt(c), key };
  if (!BOARD_Q.some(q => q.key === key)) BOARD_Q.push({ key, i, p, aim, shot });
  boardWork();
  return { txt: '…', key };
}
/** Work through the queued odds one per tick while the board is open, filling each number in place. */
function boardWork() {
  if (boardBusy) return;
  boardBusy = true;
  const tick = () => {
    const q = BOARD_Q.shift();
    if (!q || !A || !A.m || !A.prep || !A.prepS) {
      boardBusy = false;
      BOARD_Q.length = 0;
      return;
    }
    const o = (A.prepS.odds[q.key] = atkOdds(A.m, q.i, q.p, q.aim, q.shot));
    for (const el of document.querySelectorAll('[data-odds]')) if (el.dataset.odds === q.key) el.textContent = boardAtkTxt(o);
    setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
}
/** A player's card: bad news first, then the serve choices, then (hitters) aim and shot; set / block rows come with T-279–T-280. */
function boardCard(m, i, p, can) {
  const K = Coach.condition(m, i).players.find(r => r.p === p),
    bad = K ? K.words.filter(w => w.tone !== 'good') : [],
    srv = ordOf(m, p, 'srv') || 'auto',
    tgt = ordOf(m, p, 'tgt') || 'auto',
    aim = ordOf(m, p, 'aim') || 'auto',
    shot = ordOf(m, p, 'shot') || 'auto',
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
    ${boardRow(p, 'tgt', 'Target', tgtOpts(p, m.t[1 - i]), tgt, to, can)}${
      p.role === 'S'
        ? ''
        : boardRow(p, 'aim', 'Aim', aimOpts(p, m.t[1 - i]), aim, v => boardAtk(m, i, p, v, shot), can) +
          boardRow(p, 'shot', 'Shot', shotOpts(), shot, v => boardAtk(m, i, p, aim, v), can)
    }</div>`;
}
/** Side i's board (empty when you set nothing there): its four cards in a row. */
function boardSide(i) {
  const m = A.m,
    who = boardEdit(m, i),
    t = m.t[i];
  if (!who) return '';
  return `<section class="pboard" style="--tc:${t.color}"><div class="lab">${chip(t)}${esc(t.short)} · players <span class="mute">— serve: ace or broken pass · miss; spike: kill · error</span></div><div class="bcards">${rotOrder(
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
