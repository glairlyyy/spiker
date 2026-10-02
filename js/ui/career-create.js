// Career: create your player (spec §10.7) — role cards from game data, name, optional challenge toggles. You always start as a free agent.

let CR = null;
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
    return `<button class="rcard ${CR.role === r ? 'on' : ''}" onclick="crRole('${r}')" aria-pressed="${CR.role === r}"><span class="lab">${r}</span><b>${ROLE_NAME[r]}</b>
      <span class="rk"><span class="mute">Key stat</span> ${STATNAME[k]}</span>
      <span class="rk"><span class="mute">Trains at</span> ${places.slice(0, 3).map(esc).join(' · ')}</span>
      <span class="rk"><span class="mute">Techniques</span> ${techs.length ? techs.slice(0, 4).map(esc).join(' · ') : '—'}</span></button>`;
  };
  $('#app').innerHTML = `<section class="create2">
    <div class="chead"><span class="lab">New career</span><h2>Who arrives on the island?</h2><p class="mute">Every stat starts at ${CAREER.start}. Training takes you to ${TRAIN_CAP}; matches take you further. You arrive as a free agent.</p></div>
    <div class="lab">Role</div>
    <div class="rcards">${['WS', 'MB', 'S'].map(card).join('')}</div>
    <div class="crow"><div><div class="lab">Name</div><div class="namerow"><input id="crname" maxlength="24" value="${esc(CR.name)}" oninput="CR.name=this.value" aria-label="Player name"><button class="btn" onclick="CR.name=rollName(new Set());renderCreate()">Random</button></div></div>
      <div><div class="lab">Challenge</div><div class="seg">${Object.entries(MODES)
        .filter(([, m]) => !m.game)
        .map(
          ([k, m]) =>
            `<button class="btn ${CR.mode[k] ? 'on' : ''}" onclick="CR.mode.${k}=!CR.mode.${k};renderCreate()" ${tip(m.desc)}>${m.name}</button>`
        )
        .join('')}</div><p class="small mute">${
        Object.entries(MODES)
          .filter(([k, m]) => !m.game && CR.mode[k])
          .map(([, m]) => esc(m.desc))
          .join(' ') || 'Optional handicaps.'
      }</p></div></div>
    <div class="acts pri"><button class="btn hot" onclick="crStart()">Arrive on the island <kbd>Enter</kbd></button><button class="btn" onclick="CR=null;navigate('menu')">Back <kbd>Esc</kbd></button></div>
  </section>`;
}
document.addEventListener('keydown', e => {
  if (!document.querySelector('.create2') || !CR) return;
  if (e.key === 'Escape') {
    CR = null;
    navigate('menu');
  } else if (e.key === 'Enter' && !e.target.closest('button,textarea')) crStart();
});
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
