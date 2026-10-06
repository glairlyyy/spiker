// Title screen: Continue / New career / Encyclopedia / Settings / Dev (Monster game, models, benchmark, word counter).

const TS = { settings: false, dev: /[?&]dev\b/.test(location.search) }; // title screen UI state (?dev opens the Dev tab)
/** Title screen (spec §10.7): brand, the Continue hero (name · role · week), New career, Encyclopedia, Settings (the match
 * settings defaults), Dev (T-171: playtest and measurement tools). */
function renderMenu() {
  A = null;
  const bg = document.querySelector('.title > .tbg'); // the 3D backdrop survives re-renders (Settings, Dev toggles)
  const saved = RUN || Run.load(),
    you = saved && Run.you(saved),
    club = saved && saved.team != null && saved.teams[saved.team] ? saved.teams[saved.team].name : 'Academy',
    hero = you
      ? `<button class="tcont" onclick="openCareer()"><span class="tct"><b>${saved.result ? 'Last run' : 'Continue'}</b><small>${esc(you.name)} · ${ROLE_NAME[you.role]} · ${
          saved.result ? 'Result' : saved.week > CAREER.weeks ? 'Cup' : `Week ${saved.week}`
        } · ${esc(club)}</small></span><kbd>Enter</kbd></button>`
      : '';
  $('#app').innerHTML = `<section class="title">
    <div class="tbg"></div>
    <div class="tcol">
    <div class="tbrand"><div class="lab">4v4 volleyball RPG</div><h1>Spite &amp; Spike</h1><p class="mute">Nobody believed in you. Good.</p></div>
    <div class="tmenu">${hero}
      <button class="btn ${you ? '' : 'hot'} tbig" onclick="CR=null;navigate('create')" ${you && !saved.result ? tip(`Replaces ${you.name}'s run`) : ''}>New career</button>
      <button class="btn tbig" onclick="navigate('encyclopedia')" ${tip('Every technique and who can use it')}>Encyclopedia</button>
      <button class="btn tbig ${TS.settings ? 'on' : ''}" onclick="TS.settings=!TS.settings;renderMenu()" ${tip('Match defaults: hype, cut-ins, graphics, camera, volume')}>Settings</button>
      ${TS.settings ? `<div class="tset setpop"><div class="popb">${settingsMenu()}</div></div>` : ''}
    </div>
    </div>
    <button class="btn quiet tdev ${TS.dev ? 'on' : ''}" onclick="TS.dev=!TS.dev;renderMenu()" aria-expanded="${TS.dev}" ${tip('Playtest and measurement tools')}>Dev ›</button>
    ${
      TS.dev
        ? `<div class="panel mdev"><h3>Dev</h3>
      <span class="trow m0"><button class="btn" onclick="startMonster()" ${tip('A one-off 3D match between two all-OP teams: elements, hype scenes and blocks fire often')}>Monster game</button>
        <button class="btn" onclick="startAverage()" ${tip('A one-off 3D match between two teams of ordinary players: every player rolled at overall 30–60')}>Average game</button>
        <label class="btn" ${tip('Load a .vrm from your computer. It stays in this browser (never uploaded); in the Monster game every player picks a random model among the base one and the loaded ones (career: your player is always Main_v2).')}>+ Player model<input type="file" accept=".vrm,.glb" hidden onchange="addModelFile(this)"></label>
        <button class="btn" onclick="navigate('vfxlab')" ${tip('Every 3D effect on an empty floor: power, element, slow motion, repeat, a stress rate and the cost per frame')}>VFX lab</button>
        <button class="btn" onclick="benchModels()" ${tip('Time every model on its own: draw calls, triangles, render and hair-spring cost per frame (also written to the debug log).')}>Benchmark models</button>
        ${Models.live.length ? `<button class="btn" onclick="toggleKeepColors()" ${tip('On: loaded models show their own colours. Off: they get the team kit, hair, skin and eye colours like the base model.')}>Model colors: ${Models.keep ? 'Own' : 'Team'}</button>` : ''}
        ${Models.live.map(n => `<span class="chipm">${esc(n)} <button class="btn x" onclick="removeModel('${esc(n).replace(/'/g, '&#39;')}')" aria-label="Remove">✕</button></span>`).join('')}</span>
      <span class="trow"><button class="btn ${wordsOn() ? 'on' : ''}" onclick="setWords(!wordsOn());renderMenu()" aria-pressed="${wordsOn()}" ${tip('Visible words per screen region against the §10.8 budgets (badge in each corner, red when over)')}>Word counter: ${wordsOn() ? 'On' : 'Off'}</button>
        <button class="btn" onclick="openDebug()" ${tip('Errors and stalls collected while playing')}>Debug log</button></span>
      <p class="small mute" id="mdl-note"></p></div>`
        : ''
    }
  </section>`;
  if (bg) $('.title > .tbg').replaceWith(bg);
  else titleBg($('.title > .tbg'));
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.querySelector('.title .tcont') && !e.target.closest('input,select,textarea,button')) openCareer();
});
function openCareer() {
  RUN = RUN || Run.load();
  navigate(RUN ? 'career' : 'create');
}
/** The title backdrop (spec §10.7a, T-177): the empty arena orbiting behind the menu (js/render3d/title3d.mjs), loaded after
 * the menu is drawn so it never holds it up; WebGL or load errors leave the CSS glows only. */
let titleMod = null;
function titleBg(el) {
  const go = m => el.isConnected && G.view !== 'match' && m.mountTitle3D(el);
  if (titleMod) return go(titleMod);
  import(new URL('js/render3d/title3d.mjs', document.baseURI).href)
    .then(m => go((titleMod = m)))
    .catch(e => DBG.log('warn', 'Title backdrop could not load', e));
}
/** Leaving the title: stop the backdrop's loop and free its GPU memory (navigate). */
function titleBgOff() {
  if (titleMod) titleMod.unmountTitle3D();
}
/** Monster game: a one-off match between two all-OP teams. */
function startMonster() {
  const [a, b] = mkMonsterTeams();
  for (const p of [...a.P, ...b.P]) p.form = +rnd(-0.1, 0.4).toFixed(2);
  navigate('match', { a, b, round: 'Monster game', back: 'Back to menu', onLeave: () => navigate('menu') });
}
/** Average game (dev): a one-off match between two teams of ordinary players (overall 30–60 each). */
function startAverage() {
  const [a, b] = mkAverageTeams();
  for (const p of [...a.P, ...b.P]) p.form = +rnd(-0.1, 0.4).toFixed(2);
  navigate('match', { a, b, round: 'Average game', back: 'Back to menu', onLeave: () => navigate('menu') });
}
Screens.menu = renderMenu;
