// Title screen: Continue / New career / Encyclopedia / Settings / Dev (Monster game, models, benchmark, word counter).

const TS = { settings: false, dev: /[?&]dev\b/.test(location.search) }; // title screen UI state (?dev opens the Dev tab)
/** Title screen (spec §10.7): brand, the Continue hero (name · role · week), New career, Encyclopedia, Settings (the match
 * settings defaults), Dev (T-171: playtest and measurement tools). */
function renderMenu() {
  A = null;
  const saved = RUN || Run.load(),
    you = saved && Run.you(saved),
    hero = you
      ? `<button class="tcont" onclick="openCareer()" ${tip(`${ROLE_NAME[you.role]}, ${saved.result ? 'run over: see the result' : saved.week > CAREER.weeks ? 'in the Cup' : `week ${saved.week} of ${CAREER.weeks}`}`)}><span class="lab">${saved.result ? 'Last run' : 'Continue'}</span><b>${esc(you.name)}</b><span class="mute">${you.role} · ${
          saved.result ? 'result' : saved.week > CAREER.weeks ? 'Cup' : `W${saved.week}`
        }</span><span class="tgo"><kbd>Enter</kbd></span></button>`
      : '';
  $('#app').innerHTML = `<section class="title">
    <div class="tbrand"><h1 ${tip('4v4 volleyball RPG. Nobody believed in you. Good.')} tabindex="0">Spite &amp; Spike</h1></div>
    <div class="tmenu">${hero}
      <button class="btn ${you ? '' : 'hot'} tbig" onclick="CR=null;navigate('create')" ${you && !saved.result ? tip(`Replaces ${you.name}'s run`) : ''}>New career</button>
      <button class="btn tbig" onclick="navigate('encyclopedia')" ${tip('Every technique and who can use it')}>Encyclopedia</button>
      <button class="btn tbig ${TS.settings ? 'on' : ''}" onclick="TS.settings=!TS.settings;renderMenu()" ${tip('Match defaults: hype, cut-ins, graphics, camera, volume')}>Settings</button>
      ${TS.settings ? `<div class="tset setpop"><div class="popb">${settingsMenu()}</div></div>` : ''}
      <button class="btn tbig ${TS.dev ? 'on' : ''}" onclick="TS.dev=!TS.dev;renderMenu()" aria-expanded="${TS.dev}" ${tip('Playtest and measurement tools')}>Dev</button>
    </div>
    ${
      TS.dev
        ? `<div class="panel mdev"><h3>Dev</h3>
      <span class="trow" style="margin:0"><button class="btn" onclick="startMonster()" ${tip('A one-off 3D match between two all-OP teams: elements, hype scenes and blocks fire often')}>Monster game</button>
        <label class="btn" ${tip('Load a .vrm from your computer. It stays in this browser (never uploaded); in the Monster game every player picks a random model among the base one and the loaded ones (career: your player is always Main_v2).')}>+ Player model<input type="file" accept=".vrm,.glb" hidden onchange="addModelFile(this)"></label>
        <button class="btn" onclick="benchModels()" ${tip('Time every model on its own: draw calls, triangles, render and hair-spring cost per frame (also written to the debug log).')}>Benchmark models</button>
        ${Models.live.length ? `<button class="btn" onclick="toggleKeepColors()" ${tip('On: loaded models show their own colours. Off: they get the team kit, hair, skin and eye colours like the base model.')}>Model colors: ${Models.keep ? 'Own' : 'Team'}</button>` : ''}
        ${Models.live.map(n => `<span class="chipm">${esc(n)} <button class="btn x" onclick="removeModel('${esc(n).replace(/'/g, '&#39;')}')" aria-label="Remove">✕</button></span>`).join('')}</span>
      <span class="trow"><button class="btn ${wordsOn() ? 'on' : ''}" onclick="setWords(!wordsOn());renderMenu()" aria-pressed="${wordsOn()}" ${tip('Visible words per screen region against the §10.8 budgets (badge in each corner, red when over)')}>Word counter: ${wordsOn() ? 'On' : 'Off'}</button>
        <button class="btn" onclick="openDebug()" ${tip('Errors and stalls collected while playing')}>Debug log</button></span>
      <p class="small mute" id="mdl-note"></p></div>`
        : ''
    }
  </section>`;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.querySelector('.title .tcont') && !e.target.closest('input,select,textarea,button')) openCareer();
});
function openCareer() {
  RUN = RUN || Run.load();
  navigate(RUN ? 'career' : 'create');
}
/** Monster game: a one-off match between two all-OP teams. */
function startMonster() {
  const [a, b] = mkMonsterTeams();
  for (const p of [...a.P, ...b.P]) p.form = +rnd(-0.1, 0.4).toFixed(2);
  navigate('match', { a, b, round: 'Monster game', back: 'Back to menu', onLeave: () => navigate('menu') });
}
Screens.menu = renderMenu;
