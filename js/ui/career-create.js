// Career: create your player — role, name, and optional challenge modes (every stat starts at 1). You always start as a free agent.

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
  const row = k =>
    `<div class="alloc" style="grid-template-columns: 78px 1fr 64px"><span>${STATNAME[k]}</span>${bar(CAREER.start)}<small class="mute">${KEYSTAT[CR.role] === k ? 'key stat' : ''}</small></div>`;
  $('#app').innerHTML = `<section class="create">
    <div class="panel">
      <h2>New career${info(`Every stat starts at ${CAREER.start}; training takes you to ${TRAIN_CAP}, matches up to ${CAREER.runCap}. Your look is random for now.`)}</h2>
      <h4>Role</h4>
      <div class="seg" role="group" aria-label="Role">${['WS', 'MB', 'S'].map(r => `<button class="btn ${CR.role === r ? 'on' : ''}" onclick="crRole('${r}')" ${tip({ WS: 'Scores and serves. Key stat: power.', MB: 'Blocks and quick attacks. Key stat: jump.', S: 'Runs the offense; wit makes better sets and dumps. Key stat: speed.' }[r])}>${ROLE_NAME[r]}</button>`).join('')}</div>
      <h4>Name</h4>
      <div class="namerow"><input id="crname" maxlength="24" value="${esc(CR.name)}" oninput="CR.name=this.value" aria-label="Player name"><button class="btn" onclick="CR.name=rollName(new Set());renderCreate()">Random</button></div>
      <h4>Stats</h4>
      ${STATK.map(row).join('')}
      <div class="alloc" style="grid-template-columns: 78px 1fr 64px"><span>Wit</span><span class="bar wit"><i style="width:${CAREER.witBase * 50}%"></i><b>${CAREER.witBase.toFixed(1)}</b></span><small class="mute"></small></div>
      <p class="small mute">All stats start at 1. Train to 75; matches take you further.</p>
    </div>
    <div class="panel">
      <h3>Your team</h3>
      <p class="small mute">Free agent${info('You arrive with no club: play Academy evaluations with the Academy squad and sign with a club once you meet its conditions. In Story you still play the U21 Final Cup: with your faction, the Academy squad, or a hired street crew.')}</p>
      <h4>Mode${info('Story: the U21 Final Cup always includes you. Endless comes later.')}</h4>
      <div class="seg" role="group" aria-label="Mode">${Object.entries(MODES)
        .filter(([, m]) => m.game)
        .map(
          ([k, m]) =>
            `<button class="btn ${m.disabled ? '' : 'on'}" ${m.disabled ? 'disabled' : ''} ${tip(m.desc)}>${m.name}${m.disabled ? ' <small class="mute">(later)</small>' : ''}</button>`
        )
        .join('')}</div>
      <h4>Challenge${info('Optional handicaps.')}</h4>
      ${Object.entries(MODES)
        .filter(([, m]) => !m.game)
        .map(
          ([k, m]) =>
            `<label class="opt" ${tip(m.desc)}><input type="checkbox" ${CR.mode[k] ? 'checked' : ''} onchange="CR.mode.${k}=this.checked;renderCreate()"> <b>${m.name}</b></label>`
        )
        .join('')}
      <div class="act pri"><button class="btn hot" onclick="crStart()">Start career</button><button class="btn" onclick="CR=null;navigate('menu')">Back</button></div>
    </div>
  </section>`;
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
