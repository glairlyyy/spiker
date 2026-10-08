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
      <button class="btn tbig ${TS.settings ? 'on' : ''}" onclick="TS.settings=!TS.settings;renderMenu()" ${tip('Match defaults: hype, prompts, graphics, camera, volume')}>Settings</button>
      ${TS.settings ? `<div class="tset setpop"><div class="popb">${settingsMenu()}</div></div>` : ''}
    </div>
    </div>
    <button class="btn quiet tdev ${TS.dev ? 'on' : ''}" onclick="TS.dev=!TS.dev;renderMenu()" aria-expanded="${TS.dev}" ${tip('Playtest and measurement tools')}>Dev ›</button>
    ${
      TS.dev
        ? `<div class="panel mdev"><h3>Dev</h3>
      <span class="trow m0"><button class="btn" onclick="startMonster()" ${tip('A one-off 3D match between two all-OP teams: elements, hype scenes and blocks fire often')}>Monster game</button>
        <label class="sset" ${tip('Play the Monster game as one player: their Call / Fake / Block, setter and captain prompts appear under them (spec §2.16)')}><span class="cgl">Play as</span><select onchange="TS.playAs=this.value" aria-label="Play as">${PLAY_AS.map(([v, n]) => `<option value="${v}" ${(TS.playAs || '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn" onclick="startAverage()" ${tip('A one-off 3D match between two teams of ordinary players: every player rolled at overall 30–60')}>Average game</button>
        <label class="btn" ${tip('Load a .vrm from your computer. It stays in this browser (never uploaded); in the Monster game every player picks a random model among the built-in ones (Main_v2, Rival_v2–v4, male1, male2) and the loaded ones (career: your player is always Main_v2).')}>+ Player model<input type="file" accept=".vrm,.glb" hidden onchange="addModelFile(this)"></label>
        <button class="btn" onclick="navigate('vfxlab')" ${tip('Every 3D effect on an empty floor: power, element, slow motion, repeat, a stress rate and the cost per frame')}>VFX lab</button>
        <button class="btn" onclick="benchModels()" ${tip('Time every model on its own: draw calls, triangles, render and hair-spring cost per frame (also written to the debug log).')}>Benchmark models</button>
        <button class="btn" onclick="toggleKeepColors()" ${tip('Monster game models (yours and loaded ones). Own: their own colours. Team: the team kit, hair, skin and eye colours like the base model.')}>Model colors: ${Models.keep ? 'Own' : 'Team'}</button>
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
  const pa = /^([ab]):(\d)$/.exec(TS.playAs || ''), // Play as (spec §2.16): a seat of either team → your prompts in it
    T = pa ? (pa[1] === 'a' ? a : b) : null,
    you = T ? [T.s, T.mb, T.ws[0], T.ws[1]][+pa[2]] : null;
  navigate('match', {
    a,
    b,
    round: 'Monster game',
    vfx: true,
    bundled: true, // every player is one of the owner's models (assets/vrm, players3d BUNDLED)
    human: you ? you.id : null,
    back: 'Back to menu',
    onLeave: () => navigate('menu')
  });
}
/** The Monster game's Play as choices: none, or a seat of either team (the squads are drawn when the game starts). */
const PLAY_AS = [
  ['', 'Nobody (watch)'],
  ...['a', 'b'].flatMap(t =>
    ['Setter', 'Middle', 'Wing 1', 'Wing 2'].map((n, i) => [`${t}:${i}`, `${t === 'a' ? 'Left' : 'Right'} team · ${n}`])
  )
];
/** Average game (dev): a one-off match between two teams of ordinary players (overall 30–60 each). */
function startAverage() {
  const [a, b] = mkAverageTeams();
  for (const p of [...a.P, ...b.P]) p.form = +rnd(-0.1, 0.4).toFixed(2);
  navigate('match', { a, b, round: 'Average game', vfx: true, back: 'Back to menu', onLeave: () => navigate('menu') });
}
Screens.menu = renderMenu;
