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
/** One choice, folded (owner, 2026-10-14): a slot shows the current pick and its odds; clicking it opens the options, each
 * with its odds (or the gap when locked); one slot open at a time. odds(v) → text, or { txt, key } for odds still being
 * worked out (filled in place when ready) — a folded slot only works out the current pick's. */
function boardRow(p, kind, label, opts, cur, odds, can) {
  const k = `${p.id}.${kind}`,
    open = can && A.prepS.open === k,
    show = r => {
      const right = typeof r === 'string' ? r : r.txt,
        key = typeof r === 'string' ? '' : ` data-odds="${esc(r.key)}"`;
      return `<small${key}>${right}</small>`;
    },
    c = opts.find(o => String(o.v) === String(cur)) || opts[0],
    slot = `<button class="bslot ${open ? 'open' : ''} ${String(cur) !== 'auto' ? 'set' : ''}" ${can ? `onclick="boardSlot('${esc(k)}')" aria-expanded="${open}"` : 'disabled'}><span class="lab">${label}</span><b>${esc(c.label)}</b>${show(odds(c.v))}<i aria-hidden="true">${can ? (open ? '▴' : '▾') : ''}</i></button>`;
  if (!open) return `<div class="brow">${slot}</div>`;
  return `<div class="brow">${slot}<div class="bopts">${opts
    .map(o => {
      const on = String(o.v) === String(cur);
      return `<button class="bopt ${on ? 'on' : ''} ${o.lock ? 'lock' : ''}" ${o.lock ? 'disabled' : `onclick="boardPick('${p.id}','${kind}','${o.v}')"`} ${o.lock ? tip(`Locked: ${o.lock}`) : ''}><span>${esc(o.label)}</span>${o.lock ? `<small>🔒 ${esc(o.lock)}</small>` : show(odds(o.v))}</button>`;
    })
    .join('')}</div></div>`;
}
/** Open / close one slot's options. */
function boardSlot(k) {
  if (!A || !A.prepS) return;
  A.prepS.open = A.prepS.open === k ? null : k;
  prepDraw();
}
/** Spike odds text: kill · error; their attack into your block (a middle's order): stuff · their kill. */
const boardAtkTxt = o => (o.vs ? `${BOARD_PCT(o.stf)} · ${BOARD_PCT(o.kill)}` : `${BOARD_PCT(o.kill)} · ${BOARD_PCT(o.err)}`);
const BOARD_Q = [];
let boardBusy = false;
/** Attack odds (hitter p, or the side's attack when p is null) with some orders tried (set: [[player, kind, v], …]): cached
 * for this point and these orders, else queued (atkOdds plays it out: ~0.1 s each). */
function boardAtk(m, i, p, set, vs) {
  const key = `${vs ? 'vs' : ''}${p ? p.id : 'side' + i}|${set.map(([q, k, v]) => `${q.id}.${k}=${v}`).join(',')}|${JSON.stringify(m.ord)}|${m.pts}|${m.rot}|${m.setNo}`,
    c = (A.prepS.odds || (A.prepS.odds = {}))[key];
  if (c) return { txt: boardAtkTxt(c), key };
  if (!BOARD_Q.some(q => q.key === key)) BOARD_Q.push({ key, i, p, set, vs });
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
    const o = (A.prepS.odds[q.key] = { ...atkOdds(A.m, q.i, q.p, q.set), vs: !!q.vs });
    for (const el of document.querySelectorAll('[data-odds]')) if (el.dataset.odds === q.key) el.textContent = boardAtkTxt(o);
    setTimeout(tick, 0);
  };
  setTimeout(tick, 0);
}
/** A player's card: bad news first, the serve choices, hitters' aim and shot or the setter's feed and fake, a middle's block. */
function boardCard(m, i, p, can) {
  const K = Coach.condition(m, i).players.find(r => r.p === p),
    bad = K ? K.words.filter(w => w.tone !== 'good') : [],
    srv = ordOf(m, p, 'srv') || 'auto',
    tgt = ordOf(m, p, 'tgt') || 'auto',
    aim = ordOf(m, p, 'aim') || 'auto',
    shot = ordOf(m, p, 'shot') || 'auto',
    feed = ordOf(m, p, 'feed') || 'auto',
    fake = ordOf(m, p, 'fake') || 'auto',
    T = m.t[i],
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
        ? boardRow(
            p,
            'feed',
            'Feed',
            feedOpts(p, T),
            feed,
            v => boardAtk(m, i, v === 'auto' ? null : T.P.find(q => q.id === v), [[p, 'feed', v]]),
            can
          ) + boardRow(p, 'fake', 'Fake', fakeOpts(), fake, v => boardAtk(m, i, null, [[p, 'fake', v]]), can)
        : boardRow(p, 'aim', 'Aim', aimOpts(p, m.t[1 - i]), aim, v => boardAtk(m, i, p, [[p, 'aim', v]]), can) +
          boardRow(p, 'shot', 'Shot', shotOpts(), shot, v => boardAtk(m, i, p, [[p, 'shot', v]]), can)
    }${p.role === 'MB' ? boardRow(p, 'blk', 'Block', blkOpts(), ordOf(m, p, 'blk') || 'auto', v => boardAtk(m, 1 - i, null, [[p, 'blk', v]], true), can) : ''}${
      m.t[i].P.includes(p)
        ? boardRow(p, 'rest', 'Rest', restOpts(m, i, p), ordOf(m, p, 'rest') || 'auto', v => boardRest(m, i, p, v), can)
        : ''
    }</div>`;
}
/** The Rest row's numbers (spec §2.30): their stamina now, or who comes on and how fresh. */
function boardRest(m, i, p, v) {
  const sta = q => BOARD_PCT(m.sta[q.id] == null ? 1 : m.sta[q.id]);
  if (v !== 'now') return `stamina ${sta(p)}`;
  const q = restFor(m, i, p);
  return q ? `→ #${q.num} ${esc(q.role)} · ${sta(q)}` : '';
}
/** Side i's board (empty when you set nothing there): its four cards in a row. */
function boardSide(i) {
  const m = A.m,
    who = boardEdit(m, i),
    t = m.t[i];
  if (!who) return '';
  return `<section class="pboard" style="--tc:${t.color}"><div class="lab">${chip(t)}${esc(t.name)} · orders ${info("Odds on each pick — serve: ace or broken pass · miss; spike: kill · error; block: stuff · their kill. Auto = the player's own game.")}</div><div class="bcards">${rotOrder(
    t,
    m.rot[i]
  )
    .map(p => boardCard(m, i, p, who === 'all' || who === p.id))
    .join('')}</div>${boardHabits(m, i)}</section>`;
}
/** The rival's habits you uncovered at the Tape Room (spec §4.31), when she is across the net from side i. */
function boardHabits(m, i) {
  if (typeof RUN === 'undefined' || !RUN || !A.fx.onFinish) return '';
  const riv = Stars.get(RUN, 'rival'),
    seen = riv && squadOf(m.t[1 - i]).includes(riv) ? Secret.seen(RUN) : [];
  return seen.length ? `<div class="small bhab"><b>From her tape:</b> ${seen.map(h => esc(h.text)).join(' · ')}</div>` : '';
}
function boardPick(id, kind, v) {
  if (!A || !A.m) return;
  const p = [0, 1].flatMap(i => squadOf(A.m.t[i])).find(q => String(q.id) === id);
  if (!p) return;
  ordSet(A.m, p, kind, v === 'auto' ? null : v);
  if (A.prepS) A.prepS.open = null;
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
/** The result card's orders (spec §2.29): each order on a side whose board you saw, and how it went. */
function boardResult(m) {
  if (!m || !m.ordLog || !A.prepS) return '';
  const rows = [];
  for (const i of [0, 1]) {
    if (!boardEdit(m, i)) continue;
    for (const p of squadOf(m.t[i])) {
      const L = m.ordLog[p.id];
      if (!L) continue;
      for (const r of Object.values(L)) {
        const opts = {
            srv: () => srvOpts(p),
            tgt: () => tgtOpts(p, m.t[1 - i]),
            aim: () => aimOpts(p, m.t[1 - i]),
            shot: shotOpts,
            feed: () => feedOpts(p, m.t[i]),
            fake: fakeOpts,
            blk: blkOpts
          }[r.kind](),
          o = opts.find(x => String(x.v) === String(r.v)),
          name = { srv: 'Serve', tgt: 'Serve at', aim: 'Aim', shot: 'Shot', feed: 'Feed', fake: 'Fake', blk: 'Block' }[r.kind],
          how =
            r.kind === 'srv' || r.kind === 'tgt'
              ? `${r.n} serves · ${r.ace} aces · ${r.bad} broken passes · ${r.err} missed`
              : r.kind === 'blk'
                ? `${r.n} of their attacks · ${r.stf} stuffed · ${r.k} their kills`
                : `${r.n} attacks · ${r.k} kills · ${r.err} errors · ${r.stf} stuffed`;
        rows.push(
          `<div class="rplan"><span class="rpt">${chip(m.t[i])}#${p.num}</span><span><b>${esc(name)} ${esc(o ? o.label : String(r.v))}</b> <span class="mute">${how}</span></span></div>`
        );
      }
    }
  }
  return rows.length ? `<div class="rplans"><div class="lab">Orders</div>${rows.join('')}</div>` : '';
}
