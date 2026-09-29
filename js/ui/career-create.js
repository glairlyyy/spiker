// Career: create your player — role, name, point budget, and optional challenge modes. You always start as a free agent.

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
        alloc: { power: 0, def: 0, speed: 0, jump: 0 },
        witSteps: 0,
        mode: {}
      };
      renderCreate();
    }, 40);
    return;
  }
  const budget = CAREER.budget,
    used = STATK.reduce((a, k) => a + CR.alloc[k], 0) + CR.witSteps * CAREER.witStepCost,
    left = budget - used,
    cap = CAREER.createCap;
  const row = k => {
    const base = CAREER.statBase + CR.alloc[k],
      v = Run.createdStat(CR.role, k, CR.alloc[k]),
      bias = RB[CR.role][k] || 0;
    return `<div class="alloc"><span>${STATNAME[k]}</span>
      <button class="btn" onclick="crAlloc('${k}',-5)" ${CR.alloc[k] < 5 ? 'disabled' : ''} aria-label="Minus 5 ${STATNAME[k]}">−5</button>
      <button class="btn" onclick="crAlloc('${k}',-1)" ${CR.alloc[k] < 1 ? 'disabled' : ''} aria-label="Minus 1 ${STATNAME[k]}">−</button>
      ${bar(v)}
      <button class="btn" onclick="crAlloc('${k}',1)" ${left < 1 || base >= cap ? 'disabled' : ''} aria-label="Plus 1 ${STATNAME[k]}">+</button>
      <button class="btn" onclick="crAlloc('${k}',5)" ${left < 5 || base + 5 > cap ? 'disabled' : ''} aria-label="Plus 5 ${STATNAME[k]}">+5</button>
      <small class="mute" ${bias ? tip(`${ROLE_NAME[CR.role]} bonus`) : ''}>${bias ? `${bias > 0 ? '+' : ''}${bias}` : ''}</small></div>`;
  };
  const wit = +(CAREER.witBase + CR.witSteps * CAREER.witStep).toFixed(1);
  $('#app').innerHTML = `<section class="create">
    <div class="panel">
      <h2>New career${info(`Every stat starts at ${CAREER.statBase}. Spend ${budget} points (max ${cap} per stat at creation); training takes you up to ${CAREER.runCap}. Your look is random for now.`)}</h2>
      <h4>Role</h4>
      <div class="seg" role="group" aria-label="Role">${['WS', 'MB', 'S'].map(r => `<button class="btn ${CR.role === r ? 'on' : ''}" onclick="crRole('${r}')" ${tip({ WS: 'Scores and serves. Key stat: power.', MB: 'Blocks and quick attacks. Key stat: jump.', S: 'Runs the offense; wit makes better sets and dumps. Key stat: speed.' }[r])}>${ROLE_NAME[r]}</button>`).join('')}</div>
      <h4>Name</h4>
      <div class="namerow"><input id="crname" maxlength="24" value="${esc(CR.name)}" oninput="CR.name=this.value" aria-label="Player name"><button class="btn" onclick="CR.name=rollName(new Set());renderCreate()">Random</button></div>
      <h4>Stats <span class="pts ${left ? '' : 'done'}">${left} points left</span></h4>
      ${STATK.map(row).join('')}
      <div class="alloc"><span>Wit</span><span></span>
        <button class="btn" onclick="crWit(-1)" ${CR.witSteps < 1 ? 'disabled' : ''} aria-label="Less wit">−</button>
        <span class="bar wit"><i style="width:${wit * 50}%"></i><b>${wit.toFixed(1)}</b></span>
        <button class="btn" onclick="crWit(1)" ${left < CAREER.witStepCost || wit >= CAREER.witCreateCap - 1e-9 ? 'disabled' : ''} aria-label="More wit">+</button><span></span>
        <small class="mute" ${tip(`${CAREER.witStepCost} points per +0.1 wit`)}>${CAREER.witStepCost}pt</small></div>
    </div>
    <div class="panel">
      <h3>Your team</h3>
      <p class="small mute">Free agent${info('You arrive with no club: play warm-ups with a pickup squad and sign with a club once you meet its conditions. Free agents miss the cups.')}</p>
      <h4>Challenge${info('Optional handicaps.')}</h4>
      ${Object.entries(MODES)
        .map(
          ([k, m]) =>
            `<label class="opt" ${tip(m.desc)}><input type="checkbox" ${CR.mode[k] ? 'checked' : ''} onchange="CR.mode.${k}=this.checked;renderCreate()"> <b>${m.name}</b></label>`
        )
        .join('')}
      <button class="btn hot big" onclick="crStart()" ${left > 0 ? 'title="You still have points to spend"' : ''}>Start career</button>
      <button class="btn big" onclick="CR=null;navigate('menu')">Back</button>
    </div>
  </section>`;
}
function crAlloc(k, d) {
  const left = CAREER.budget - STATK.reduce((a, s) => a + CR.alloc[s], 0) - CR.witSteps * CAREER.witStepCost;
  const nv = CR.alloc[k] + d;
  if (nv < 0 || (d > 0 && (d > left || CAREER.statBase + nv > CAREER.createCap))) return;
  CR.alloc[k] = nv;
  renderCreate();
}
function crWit(d) {
  const left = CAREER.budget - STATK.reduce((a, s) => a + CR.alloc[s], 0) - CR.witSteps * CAREER.witStepCost;
  const nv = CR.witSteps + d;
  if (nv < 0 || CAREER.witBase + nv * CAREER.witStep > CAREER.witCreateCap + 1e-9 || (d > 0 && left < CAREER.witStepCost)) return;
  CR.witSteps = nv;
  renderCreate();
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
    alloc: CR.alloc,
    witSteps: CR.witSteps,
    mode: CR.mode
  });
  CR = null;
  Run.save(RUN);
  navigate('career');
}
Screens.create = renderCreate;
