// Career: create your player (spec §10.7) — role cards from game data, name, optional challenge toggles. You always start as a free agent.

let CR = null;
/** One line per role on its card (§10.8); the rest is in the card's Details peek. */
const ROLE_PITCH = { WS: 'Hits from the wings.', MB: 'Blocks and quick attacks.', S: 'Sets up every attack.' };
function renderCreate() {
  A = null;
  if (!CR) {
    $('#app').innerHTML = `<div class="loading"><div class="ball-spin"></div><p>Drawing the eight Cup teams…</p></div>`;
    setTimeout(() => {
      CR = {
        draft: Run.draft(),
        role: 'WS',
        name: rollName(new Set()),
        mode: {}
      };
      renderCreate();
    }, 40);
    return;
  }
  const card = r => {
    const k = KEYSTAT[r],
      places = Object.values(SPOTS)
        .filter(x => x.train === k)
        .map(x => x.name),
      techs = Skills.forRole(r)
        .filter(id => SKILLS[id].tech && SKILLS[id].role !== 'any')
        .map(id => SKILLS[id].name);
    return `<div class="rcw"><button class="rcard ${CR.role === r ? 'on' : ''}" onclick="crRole('${r}')" aria-pressed="${CR.role === r}"><span class="lab">${r}</span><b>${ROLE_NAME[r]}</b>
      <span class="rk" ${tip(`Key stat: ${STATNAME[k]}`)}>${statI(statKey(k), 16)} ${STATNAME[k]}</span>
      <span class="small mute">${ROLE_PITCH[r]}</span></button>${peek(
        `cr:${r}`,
        'Details',
        `<div class="lab">${ROLE_NAME[r]}</div>${kv([
          ...places.slice(0, 3).map((x, i) => [i ? '' : 'Trains at', esc(x)]),
          ...(techs.length ? techs.slice(0, 4).map((x, i) => [i ? '' : 'Techniques', esc(x)]) : [['Techniques', '—']])
        ])}`
      )}</div>`;
  };
  $('#app').innerHTML = `<section class="create2">
    <div class="chead"><span class="lab">New career</span><h2 ${tip(`Every stat starts at ${CAREER.start}. Training takes you to ${TRAIN_CAP}; matches take you further. You arrive as a free agent.`)} tabindex="0">Who arrives on the island?</h2></div>
    <div class="lab">Role</div>
    <div class="rcards">${['WS', 'MB', 'S'].map(card).join('')}</div>
    <div class="crow"><div><div class="lab">Name</div><div class="namerow"><input id="crname" maxlength="24" value="${esc(CR.name)}" oninput="CR.name=this.value" aria-label="Player name"><button class="btn" onclick="CR.name=rollName(new Set());renderCreate()">Random</button></div></div>
      <div><div class="lab" ${tip('Optional handicaps')}>Challenge</div><div class="seg">${Object.entries(MODES)
        .filter(([, m]) => !m.game)
        .map(
          ([k, m]) =>
            `<button class="btn ${CR.mode[k] ? 'on' : ''}" onclick="CR.mode.${k}=!CR.mode.${k};renderCreate()" ${tip(m.desc)}>${m.name}</button>`
        )
        .join('')}</div></div></div>
    ${replaces()}<div class="acts pri"><button class="btn hot" onclick="crStart()">Arrive on the island <kbd>Enter</kbd></button><button class="btn" onclick="CR=null;navigate('menu')">Back <kbd>Esc</kbd></button></div>
  </section>`;
}
document.addEventListener('keydown', e => {
  if (!document.querySelector('.create2') || !CR) return;
  if (e.key === 'Escape') {
    CR = null;
    navigate('menu');
  } else if (e.key === 'Enter' && !e.target.closest('button,textarea')) crStart();
});
/** A consequence stays visible (§10.8): arriving replaces the saved run — said where you commit. */
function replaces() {
  const old = RUN || Run.load();
  return old && !old.result ? `<p class="small warn crrep">Replaces ${esc(Run.you(old).name)}'s run</p>` : '';
}
function crRole(r) {
  CR.role = r;
  renderCreate();
}
function crStart() {
  const name = (CR.name || '').trim() || rollName(new Set());
  RUN = Run.create(CR.draft, {
    role: CR.role,
    name,
    mode: { ...CR.mode, story: true }
  });
  CR = null;
  Run.save(RUN);
  navigate('career');
}
Screens.create = renderCreate;
