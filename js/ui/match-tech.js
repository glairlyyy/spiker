// Technique switches on the match screen (spec §9.10, TechSwitch): the Tactics tab's Techniques section, keys 1–9.

/* ---------- technique switches (spec §9.10) ---------- */
const TECH_ICON = { Attack: '⚔', Serve: '◎', Defense: '⛉', Setter: '✋' };
/** Techniques the player owns (switched on or off), in SKILLS order. */
const ownTechs = p => Object.keys(SKILLS).filter(id => SKILLS[id].tech && knowsTech(p, id));
/** Career: your player; otherwise every player of the side(s) you run. */
function techPlayers(m, fx, sides) {
  const you = fx.onFinish && typeof RUN !== 'undefined' && RUN ? Run.you(RUN) : null,
    ps = sides.flatMap(i => squadOf(m.t[i]));
  return you ? ps.filter(p => p.id === you.id) : ps;
}
/**
 * One switch row: pack icon, name (the full rule on hover), gain in good / cost in bad, this match's record, the switch.
 * o = { off, use (that player's techUse), key (1–9 hint), act (onclick) }.
 */
function techRow(id, o) {
  const s = SKILLS[id],
    t = s.trade || {},
    u = o.use && o.use[id];
  return `<div class="tsw ${o.off ? 'off' : ''}"><span class="tpk" ${tip(s.tech)}>${TECH_ICON[s.tech] || '•'}</span><span class="tnm"><b ${tip(SKILL_HOW[id] || s.desc)}>${o.key != null && o.key < 9 ? `<kbd>${o.key + 1}</kbd> ` : ''}${esc(s.name)}</b><span class="small"><span class="good">${esc(t.up || s.desc)}</span>${t.down ? ` · <span class="bad">${esc(t.down)}</span>` : ''}</span>${
    u ? `<span class="small mute">used ${u.n} · won ${u.won}${s.tech === 'Serve' ? ` · faults ${u.err}` : ''}</span>` : ''
  }</span><button class="tswb ${o.off ? '' : 'on'}" role="switch" aria-checked="${!o.off}" aria-label="${esc(s.name)}" onclick="${o.act}" ${tip(o.off ? 'Use it again' : 'Hold it back')}><i></i></button></div>`;
}
/** The Techniques section of the rail's Tactics tab (rebuilds A.techKeys: the order of the 1–9 keys). */
function techSection() {
  const m = A.m,
    ps = A.techPs.filter(p => ownTechs(p).length);
  A.techKeys = [];
  if (!ps.length) return '';
  const body = ps
    .map(
      p =>
        `${ps.length > 1 ? `<div class="tswp">${esc(p.name)}</div>` : ''}${ownTechs(p)
          .map(id => {
            const i = A.techKeys.push([p, id]) - 1;
            return techRow(id, { off: !!(m.off[p.id] && m.off[p.id].has(id)), use: m.techUse[p.id], key: i, act: `flipTech(${i})` });
          })
          .join('')}`
    )
    .join('');
  return `<div class="lab" ${tip('A switch applies from the next rally')}>Techniques${ps.length === 1 ? ` · ${esc(ps[0].name)}` : ''}</div>${body}`;
}
/** Redraw the switches and the Tactics button's "n off" badge. */
function techSync() {
  if (!A || !A.techPs) return;
  const el = $('#techsw'),
    b = $('#tacbtn');
  if (el) el.innerHTML = techSection();
  const n = A.techPs.reduce((s, p) => s + ownTechs(p).filter(id => A.m.off[p.id] && A.m.off[p.id].has(id)).length, 0);
  if (b) b.innerHTML = `Tactics${n ? ` <span class="tbadge">${n} off</span>` : ''} <kbd>T</kbd>`;
}
/** Flip switch i (A.techKeys order) from the next rally; career keeps it on your player for the next match. */
function flipTech(i) {
  if (!A || A.done || !A.techKeys[i]) return;
  const [p, id] = A.techKeys[i],
    m = A.m,
    off = !(m.off[p.id] && m.off[p.id].has(id));
  setTechOff(m, p.id, id, off);
  if (A.techCareer) p.techOff = [...m.off[p.id]];
  logLine(`${p.name} ${off ? 'holds back the' : 'goes back to the'} ${SKILLS[id].name}`, 'set');
  techSync();
}
