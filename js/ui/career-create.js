// Career: create your player — role, name, point budget, (unlock-dependent) team pick, scout and head-start skill,
// plus challenge modes, a pure run (every Legacy unlock off) and a Hall of Fame legend to inherit from.

let CR = null;
function renderCreate() {
  A = null;
  if (!CR) {
    $('#app').innerHTML = `<div class="loading"><div class="ball-spin"></div><p>Drawing the eight Cup teams…</p></div>`;
    setTimeout(() => {
      CR = { draft: Run.draft(), role: 'WS', name: rollName(new Set()), alloc: { power: 0, def: 0, speed: 0, jump: 0 }, witSteps: 0, team: null, skill: null, pure: false, mode: {}, legend: null };
      renderCreate();
    }, 40);
    return;
  }
  const list = crList(),
    on = id => list.includes(id),
    budget = Legacy.budget(list),
    used = STATK.reduce((a, k) => a + CR.alloc[k], 0) + CR.witSteps * CAREER.witStepCost,
    left = budget - used,
    T = CR.draft.teams,
    ti = CR.team != null ? CR.team : CR.draft.team,
    team = T[ti],
    slot = CR.role === 'S' ? 'S' : CR.role === 'MB' ? 'MB' : 'W0',
    showTeam = on('pick') || on('scout'),
    cap = Legacy.createCap(list),
    L = Legacy.load();
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
      ${
        on('pick')
          ? `<label class="small">Team <select onchange="CR.team=+this.value;renderCreate()">${T.map(t => `<option value="${t.i}" ${t.i === ti ? 'selected' : ''}>${esc(t.name)} — ${t.S.name}</option>`).join('')}</select></label>`
          : `<p class="small mute">Random team${on('scout') ? '' : info(`You join a random Cup team, replacing its ${ROLE_NAME[CR.role].toLowerCase()}.`)}</p>`
      }
      ${
        showTeam
          ? `<div class="mates" style="--tc:${team.color}"><b>${chip(team)}${esc(team.name)}</b> <span class="small mute">${team.S.name} · ${team.sys}</span>
          ${team.P.map(p => (p.slot === slot ? `<div class="mate you">You replace ${esc(p.name)} (${p.role})</div>` : `<div class="mate">${faceSVG(p, 0, 28)}<span>${stag(p)}${esc(p.name)} <i>${p.role}</i></span><small>P${p.power} D${p.def} S${p.speed} J${p.jump} · wit ${p.wit}</small></div>`)).join('')}</div>`
          : ''
      }
      ${
        on('head')
          ? `<h4>Head start skill</h4><select onchange="CR.skill=this.value||null" aria-label="Starting skill"><option value="">None</option>${Skills.forRole(CR.role)
              .map(id => `<option value="${id}" ${CR.skill === id ? 'selected' : ''}>${SKILLS[id].name} — ${SKILLS[id].desc}</option>`)
              .join('')}</select>`
          : ''
      }
      <h4>Challenge${info('Tougher runs multiply the Legacy points you earn')}</h4>
      ${Object.entries(MODES)
        .map(([k, m]) => `<label class="opt" ${tip(m.desc)}><input type="checkbox" ${CR.mode[k] ? 'checked' : ''} onchange="CR.mode.${k}=this.checked;renderCreate()"> <b>${m.name}</b> <span class="small mute">×${m.legacy}</span></label>`)
        .join('')}
      ${
        L.owned.length
          ? `<label class="opt" ${tip('Every Legacy unlock and the Hall of Fame off for this career')}><input type="checkbox" ${CR.pure ? 'checked' : ''} onchange="CR.pure=this.checked;crFit();renderCreate()"> <b>Pure run</b> <span class="small mute">×${PURE_BONUS}</span></label>
             ${CR.pure ? '' : `<p class="small mute">${list.length} unlock${list.length === 1 ? '' : 's'} on${list.length ? info(list.map(id => UNLOCKS.find(u => u.id === id).name).join(', ') + ' — switch them in Unlocks') : ''}</p>`}`
          : ''
      }
      ${
        L.hof.length && !CR.pure
          ? `<h4>Inherit from a legend</h4><select onchange="CR.legend=this.value===''?null:+this.value;renderCreate()" aria-label="Legend to inherit from"><option value="">Nobody</option>${L.hof
              .map((h, i) => `<option value="${i}" ${CR.legend === i ? 'selected' : ''}>${esc(h.name)} (${h.role}, rank ${h.rank}) — +10% of their gains over 40${(h.skills || []).length ? ', one skill' : ''}${h.el ? `, element ${ENAME[h.el]} revealed` : ''}</option>`)
              .join('')}</select>`
          : ''
      }
      <button class="btn hot big" onclick="crStart()" ${left > 0 ? 'title="You still have points to spend"' : ''}>Start career</button>
      <button class="btn big" onclick="CR=null;navigate('menu')">Back</button>
    </div>
  </section>`;
}
/** Unlocks that would apply to the career being created (none for a pure run). */
const crList = () => (CR && CR.pure ? [] : Legacy.active());
/** A pure run has a smaller budget and cap: take points back until the allocation fits. */
function crFit() {
  const list = crList(),
    cap = Legacy.createCap(list);
  for (const k of STATK) CR.alloc[k] = Math.min(CR.alloc[k], cap - CAREER.statBase);
  let over = STATK.reduce((a, s) => a + CR.alloc[s], 0) + CR.witSteps * CAREER.witStepCost - Legacy.budget(list);
  while (over > 0 && CR.witSteps > 0) (CR.witSteps--, (over -= CAREER.witStepCost));
  for (const k of [...STATK].reverse())
    while (over > 0 && CR.alloc[k] > 0) (CR.alloc[k]--, over--);
  if (CR.pure) (CR.legend = null), (CR.skill = null), (CR.team = null);
}
function crAlloc(k, d) {
  const list = crList(),
    left = Legacy.budget(list) - STATK.reduce((a, s) => a + CR.alloc[s], 0) - CR.witSteps * CAREER.witStepCost;
  const nv = CR.alloc[k] + d;
  if (nv < 0 || (d > 0 && (d > left || CAREER.statBase + nv > Legacy.createCap(list)))) return;
  CR.alloc[k] = nv;
  renderCreate();
}
function crWit(d) {
  const left = Legacy.budget(crList()) - STATK.reduce((a, s) => a + CR.alloc[s], 0) - CR.witSteps * CAREER.witStepCost;
  const nv = CR.witSteps + d;
  if (nv < 0 || CAREER.witBase + nv * CAREER.witStep > CAREER.witCreateCap + 1e-9 || (d > 0 && left < CAREER.witStepCost)) return;
  CR.witSteps = nv;
  renderCreate();
}
function crRole(r) {
  CR.role = r;
  if (CR.skill && !Skills.forRole(r).includes(CR.skill)) CR.skill = null;
  renderCreate();
}
function crStart() {
  const name = (CR.name || '').trim() || rollName(new Set());
  RUN = Run.create(CR.draft, { role: CR.role, name, alloc: CR.alloc, witSteps: CR.witSteps, team: CR.team, skill: CR.skill, pure: CR.pure, mode: CR.mode, legend: CR.legend });
  CR = null;
  Run.save(RUN);
  navigate('career');
}
Screens.create = renderCreate;
