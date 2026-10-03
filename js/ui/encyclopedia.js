// Skill encyclopedia: every technique, career skill, element, captain level and tactic — with who can use them now.

/** The page's sections, in order: [heading id, tab label]. */
const ENCY_SECS = [
  ...['Attack', 'Serve', 'Defense', 'Setter'].map(k => [`pk-${k}`, k]),
  ['pk-passive', 'Career skills'],
  ['pk-el', 'Elements'],
  ['pk-lead', 'Captain'],
  ['pk-tac', 'Tactics'],
  ['pk-gloss', 'Glossary']
];
let ENCY_IO = null, // marks the section in view; disconnected when the screen changes
  encyHold = 0; // a clicked tab wins while its smooth scroll runs
/** Mark one section tab `on` (the seg selected state). */
function encyMark(id) {
  for (const b of document.querySelectorAll('.ency-nav [data-sec]')) {
    const on = b.dataset.sec === id;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'true' : 'false');
  }
}
/** A tab: scroll its section into view and mark it. */
function encyGo(id) {
  const h = document.getElementById(id);
  if (!h) return;
  const y0 = scrollY;
  h.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => scrollY === y0 && h.getBoundingClientRect().top > 100 && h.scrollIntoView({ block: 'start' }), 400); // no smooth scroll (reduced motion, some browsers): jump
  encyHold = Date.now() + 1000;
  encyMark(id);
}
/** The section in view = the last heading that has reached the top band (under the sticky tabs). */
function encyWatch() {
  if (ENCY_IO) ENCY_IO.disconnect();
  if (typeof IntersectionObserver === 'undefined') return;
  const hs = ENCY_SECS.map(([id]) => document.getElementById(id)).filter(Boolean),
    pick = () => {
      if (!document.querySelector('.ency')) return ENCY_IO && (ENCY_IO.disconnect(), (ENCY_IO = null)); // screen changed
      if (Date.now() < encyHold) return;
      const band = (document.querySelector('.ency-nav')?.getBoundingClientRect().bottom || 0) + 24;
      let cur = hs[0];
      for (const h of hs) if (h.getBoundingClientRect().top <= band) cur = h;
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = hs[hs.length - 1]; // at the bottom: the last one
      if (cur) encyMark(cur.id);
    };
  ENCY_IO = new IntersectionObserver(pick, { threshold: [0, 1], rootMargin: '0px 0px -50% 0px' });
  hs.forEach(h => ENCY_IO.observe(h));
  pick();
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !document.querySelector('.ency') || $('#dbg') || (typeof CW !== 'undefined' && CW.peek)) return;
  navigate('menu');
});
function renderEncyclopedia() {
  A = null;
  const teams = (RUN && RUN.teams) || [],
    users = id => teams.flatMap(t => t.P.filter(p => hasTech(p, id)).map(p => ({ p, t }))),
    roleTxt = s =>
      s.role === 'any'
        ? 'Any role'
        : []
            .concat(s.role)
            .map(r => ROLE_NAME[r])
            .join(', '),
    reqTxt = s =>
      Object.entries(s.req || {})
        .map(([k, v]) => `${STATNAME[k]} ${k === 'wit' ? v.toFixed(1) : v}+`)
        .join(' · '),
    ids = Object.keys(SKILLS),
    packs = ['Attack', 'Serve', 'Defense', 'Setter'];
  const techCard = id => {
    const s = SKILLS[id],
      u = users(id);
    return `<div class="ency-card" id="sk-${id}">
      <div class="ency-hd"><b>${skillIcon(id)}${esc(s.name)}${SKILL_HOW[id] ? info(SKILL_HOW[id]) : ''}</b><span class="ency-tag">${esc(roleTxt(s))}</span></div>
      <p>${esc(s.desc)}</p>
      <p class="small"><span class="ency-req">${esc(reqTxt(s))}</span> <span class="mute">· learned in play, never bought</span></p>
      ${teams.length ? (u.length ? fold('u-' + id, `<span class="small ency-users"><b>${u.length}</b> can use it</span>`, `<p class="small ency-users">${u.map(({ p, t }) => `${chip(t)}${stag(p)}${esc(p.name)}`).join(' &nbsp;')}</p>`) : '<p class="small mute">Nobody yet</p>') : ''}
    </div>`;
  };
  const passive = ids.filter(id => !SKILLS[id].tech);
  $('#app').innerHTML = `<section class="ency">
    <div class="ency-top"><h2>Encyclopedia${info(`Techniques fire automatically for any player who meets the stat requirement (or who learned it in career). ${teams.length ? 'Players shown are from your career league.' : 'Start a career to see which players can use each one.'}`)}</h2><button class="btn" onclick="navigate('menu')">Back <kbd>Esc</kbd></button></div>
    <nav class="ency-nav seg" aria-label="Sections">${ENCY_SECS.map(([id, n]) => `<button class="btn" data-sec="${id}" onclick="encyGo('${id}')">${n}</button>`).join('')}</nav>
    ${packs
      .map(
        k =>
          `<h3 id="pk-${k}">${k} techniques</h3><div class="ency-grid">${ids
            .filter(id => SKILLS[id].tech === k)
            .map(techCard)
            .join('')}</div>`
      )
      .join('')}
    <h3 id="pk-passive">Career skills${info('Passive boosts you can only get by learning them in career mode')}</h3>
    <div class="ency-grid">${passive
      .map(id => {
        const s = SKILLS[id];
        return `<div class="ency-card"><div class="ency-hd"><b>${skillIcon(id)}${esc(s.name)}</b><span class="ency-tag">${esc(roleTxt(s))}</span></div><p>${esc(s.desc)}</p><p class="small mute">${s.cost} pts</p></div>`;
      })
      .join('')}</div>
    <h3 id="pk-el">Elements${info(`Every player carries a hidden element shaped by their standout trait. Few unlock it: OP players always, about 1 in 4 stars, and your career player only through the Element Trial (reveal at OVR ${ElTrial.revealAt}, become a ★ star, grade S in a match where your team reaches the zone).\n\nIn a match the gauge fills with plays that suit the element — or at once from a captain's buff — and the next attack becomes the signature element spike. A charged setter puts theirs into the set. A defender whose element beats the attacker's halves the effect.`)}</h3>
    <div class="ency-grid">${ELS.map(e => {
      const who = teams.flatMap(t => t.P.filter(p => p.elOn && p.el === e).map(p => ({ p, t }))),
        beats = ELS.filter(x => ECOUNTER[x] === e);
      return `<div class="ency-card elc" style="--e:${ECOL[e]}"><div class="ency-hd"><b>${ENAME[e]}${info(`Gauge: ${EFILL[e]}`)}</b><span class="ency-tag" ${tip(`${ECOUNTER[e] ? `Resisted by ${ENAME[ECOUNTER[e]]}` : 'Nothing resists it'}${beats.length ? ` · resists ${beats.map(x => ENAME[x]).join(', ')}` : ''}`)}>${ECOUNTER[e] ? `✕ ${ENAME[ECOUNTER[e]].split(' ')[0]}` : 'No counter'}</span></div>
        <p>${esc(EDESC[e])}</p>
        ${teams.length ? (who.length ? fold('e-' + e, `<span class="small ency-users"><b>${who.length}</b> unlocked</span>`, `<p class="small ency-users">${who.map(({ p, t }) => `${chip(t)}${stag(p)}${esc(p.name)} <i class="mute">${esc(p.sig.name)}</i>`).join(' &nbsp;')}</p>`) : '<p class="small mute">Nobody yet</p>') : ''}
      </div>`;
    }).join('')}
      <div class="ency-card"><div class="ency-hd"><b>Signature twists</b><span class="ency-tag">Personal</span></div><p>${Object.values(
        TWIST
      )
        .map(t => `<span class="twc" ${tip(t.desc)}>${t.name}</span>`)
        .join(' ')}</p></div>
    </div>
    <h3 id="pk-lead">Captain leadership${info('The player with the highest leadership captains the team. Their level decides how often they step in and how strong it is. More momentum per point and an easier path into the zone.')}</h3>
    <div class="ency-grid">${[
      [1, 55],
      [2, 70],
      [3, 85]
    ]
      .map(
        ([lv, min]) => `<div class="ency-card"><div class="ency-hd"><b>Level ${lv}</b><span class="ency-tag">Leadership ${min}+</span></div>
      <p><b>Buff</b> +${5 * lv}% power &amp; defense, +${(0.08 * lv).toFixed(2)} wit, ${Math.round(60 * lv)}% more sets for 4 points${info("If the buffed player's element is unlocked, its gauge fills at once.")}</p>
      <p><b>Tactic</b> switches WS / MB focus ${['', 'rarely', 'sometimes', 'often'][lv]}</p></div>`
      )
      .join('')}</div>
    <h3 id="pk-tac">Coach tactics</h3>
    <div class="ency-grid">
      <div class="ency-card"><div class="ency-hd"><b>Captain's call</b><span class="ency-tag">Default</span></div><p>The captain picks the tactic during the match (needs leadership 55+).</p></div>
      ${Object.values(TACTICS)
        .map(
          v =>
            `<div class="ency-card"><div class="ency-hd"><b>${esc(v.name)}</b></div><p>${
              v.focus
                ? `Feeds the ${v.focus}s (quick attacks ×${v.quick}). Blockers read it: +${v.read} coverage when the ${v.focus} attacks.`
                : 'The setter chooses freely and listens to back-row calls.'
            }</p></div>`
        )
        .join('')}
    </div>
    <h3 id="pk-gloss">Glossary</h3>
    <div class="gloss">${Object.keys(GLOSSARY)
      .map(
        id =>
          `<div class="grow" id="g-${id}"><span class="gn">${statI(GLOSSARY[id].icon)}<b>${esc(GLOSSARY[id].short)}</b></span><span>${esc(GLOSSARY[id].long)}</span></div>`
      )
      .join('')}</div>
  </section>`;
  encyWatch();
}
Screens.encyclopedia = renderEncyclopedia;
