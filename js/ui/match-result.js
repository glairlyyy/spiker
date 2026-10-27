// Match screen, the end: the stars, the result card and finishMatch.
// Split from ui/match-screen.js (shares its state A); function declarations only, nothing runs at load.

/** The three best players of a finished match (a simple impact score; the winners get a bonus). */
function matchStars(m) {
  return m.t
    .flatMap(t => squadOf(t).filter(p => t.P.includes(p) || m.stat[p.id]))
    .map(p => {
      const q = m.stat[p.id] || blank();
      return {
        p,
        q,
        v: q.k + q.blk * 1.2 + q.ace * 1.2 + q.dig * 0.5 + q.ast * 0.3 - q.err * 0.5 + (p.team === m.t[m.winner] ? 1.5 : 0)
      };
    })
    .sort((x, y) => y.v - x.v)
    .slice(0, 3);
}
/** "3 kills · 1 block · 2 digs": a word per number, zeros hidden (§9 — no single-letter stat codes). `keys` = stat fields. */
const STAT_WORD = { k: ['kill', 'kills'], blk: ['block', 'blocks'], ace: ['ace', 'aces'], dig: ['dig', 'digs'], err: ['error', 'errors'] };
const statLine = (q, keys = ['k', 'blk', 'ace', 'dig']) =>
  keys
    .filter(k => q[k])
    .map(k => `${q[k]} ${STAT_WORD[k][q[k] === 1 ? 0 : 1]}`)
    .join(' · ') || 'no points';
/** The result screen (spec §10.6): headline, then for your match the grade tile with your kills / blocks / aces / errors and focus, rewards
 * chips, growth rows (with the XP each stat got) and techniques picked up; top 3; [Continue] [Box score]. Monster game: headline + top 3.
 * o: { round, back, leave (onclick), box (the Box score button), key (print Space) } — the hub's sim result card passes its own. */
function resultScreen(m, wt, hi, lo, stars, res, o = { round: A.fx.round, back: A.fx.back, leave: 'leaveMatch()', box: true }) {
  const head = `<div class="rhead"><span class="lab">${esc(o.round || 'Final')}</span><h2>${res ? (res.win ? 'You win' : 'You lose') + ` ${hi}-${lo}` : `${esc(wt.name)} win ${hi}-${lo}`}</h2>${
      res ? `<span class="small mute">${esc(wt.name)} take it</span>` : ''
    }</div>`,
    top = `<div class="rtop"><div class="lab">Top 3</div>${stars
      .map(
        (e, i) =>
          `<div class="rstar" style="--tc:${e.p.team.color}"><b class="rn">${i + 1}</b>${faceSVG(e.p, 0.9, 32)}<span><b>${esc(e.p.name)}</b><small class="mute">${esc(e.p.team.short)} · ${e.p.role}</small></span><small>${statLine(e.q)}</small></div>`
      )
      .join('')}</div>`,
    acts = `<div class="acts ${res ? 'pri' : ''}"><button class="btn hot" onclick="${o.leave}">${esc(o.back || 'Continue')}${o.key ? ' <kbd>Space</kbd>' : ''}</button>${res && o.box ? `<button class="btn" onclick="railOpen('box')">Box score <kbd>B</kbd></button>` : ''}</div>`;
  if (!res)
    return `<div class="ocard mres mono inkwin ink-hold" role="dialog" aria-label="Result">${head}${cardsRow(m)}${top}${acts}</div>`;
  const L = res.line,
    you = res.played
      ? `<div class="rgrade"><div class="gtile g${res.grade || 'X'}">${res.grade || '–'}</div><div><div class="lab">Your line</div><div class="rline">${[
          ['Kills', L.k],
          ['Blocks', L.blk],
          ['Aces', L.ace],
          ['Errors', L.err]
        ]
          .map(([n, v]) => `<span><b>${v}</b><small>${n}</small></span>`)
          .join('')}</div>${
          res.focus
            ? `<div class="small ${res.focus.met ? 'good' : 'warn'}">Focus ${esc(res.focus.label)} · ${res.focus.met ? 'met' : 'missed'}</div>`
            : ''
        }${res.held && res.held.length ? `<div class="small mute">Held back: ${res.held.map(esc).join(', ')}</div>` : ''}</div></div>`
      : '<div class="rgrade"><div class="gtile">–</div><div><div class="lab">Your line</div><p class="small mute">You watched from the bench.</p></div></div>',
    chips = res.rewards.length
      ? `<div class="rwchips">${res.rewards.map(r => `<span class="pchip ${r.v > 0 ? 'good' : 'bad'}">${esc(r.text)}</span>`).join('')}</div>`
      : '',
    grow = res.growth.length
      ? `<div class="lab">Growth</div>${res.growth
          .map(
            g =>
              `<div class="rgrow"><span>${esc(g.name)}</span><b>${g.k === 'wit' ? g.to.toFixed(2) : g.to}</b><span class="good small">${g.to !== g.from ? (g.k === 'wit' ? '+' + (g.to - g.from).toFixed(2) : '+' + (g.to - g.from)) : ''}</span><span class="small mute">${g.xp ? `+${g.xp} XP` : ''}</span><i class="bar"><i style="--w:${Math.min(100, Math.round((100 * g.have) / (g.need || 1)))}%"></i></i></div>`
          )
          .join('')}`
      : '',
    techs = res.techs.length ? `<div class="lab">Techniques picked up</div><div class="small">${res.techs.map(esc).join(' · ')}</div>` : '';
  return `<div class="ocard mres inkwin ink-hold" role="dialog" aria-label="Result">${head}<div class="rcols"><div>${you}${chips}</div><div>${grow}${techs}</div></div>${cardsRow(m)}${top}${acts}</div>`;
}
/** The match is over: count everyone's stats, run the fixture's onFinish, and show the result card after the celebration. */
function finishMatch() {
  if (A.done) return;
  A.done = true;
  const m = A.m,
    wt = m.t[m.winner];
  const sc = m.setScores[0],
    hi = Math.max(...sc),
    lo = Math.min(...sc);
  for (const t of m.t)
    for (const p of squadOf(t).filter(q => t.P.includes(q) || m.stat[q.id])) {
      p.tour.mp++;
      if (m.stat[p.id]) addStats(p.tour, m.stat[p.id]);
    }
  const snap = A.fx.onFinish && RUN ? resultSnap(RUN, m) : null,
    msg = A.fx.onFinish ? A.fx.onFinish(m) || '' : '',
    res = snap ? resultData(RUN, m, snap, msg) : null; // career: the result screen's data (spec §10.6)
  for (const b of document.querySelectorAll('.cbar .play button, .fsb button[data-s], #fspause')) b.disabled = true; // playback is over
  updTO();
  boxScore();
  A.cele = { w: m.winner, t: 0 };
  A.ball.vis = false;
  A.trail = [];
  const stars = matchStars(m);
  const o = $('#over');
  o.style.setProperty('--tc', wt.color);
  o.innerHTML = resultScreen(m, wt, hi, lo, stars, res); // the full line stays in the diary
  setTimeout(
    () => {
      if (o.isConnected) o.hidden = false;
    },
    RM ? 0 : 2600
  );
}
