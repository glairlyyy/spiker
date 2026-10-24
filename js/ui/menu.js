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
          saved.result
            ? 'Result'
            : `${(saved.year || 1) > 1 ? `Year ${saved.year} · ` : ''}${saved.week > CAREER.weeks ? 'Cup' : `Week ${saved.week}`}`
        } · ${esc(club)}</small></span><kbd>Enter</kbd></button>`
      : '';
  $('#app').innerHTML = `<section class="title">
    <div class="tbg"></div>
    <div class="tcol">
    <div class="tbrand"><div class="lab">4v4 volleyball RPG</div><h1>Spite &amp; Spike</h1><p class="mute">Nobody believed in you. Good.</p></div>
    <div class="tmenu">${hero}
      <button class="btn ${you ? '' : 'hot'} tbig" onclick="CR=null;navigate('create')" ${you && !saved.result ? tip(`Replaces ${you.name}'s run`) : ''}>New career</button>
      <button class="btn tbig" onclick="navigate('encyclopedia')" ${tip('Every technique and who can use it')}>Encyclopedia</button>
      <button class="btn tbig ${TS.settings ? 'on' : ''}" onclick="TS.settings=!TS.settings;renderMenu()" ${tip('Match defaults: hype, graphics, camera, volume')}>Settings</button>
      ${TS.settings ? `<div class="tset setpop"><div class="popb">${settingsMenu()}${islandSettings()}</div></div>` : ''}
    </div>
    </div>
    <button class="btn quiet tdev ${TS.dev ? 'on' : ''}" onclick="TS.dev=!TS.dev;renderMenu()" aria-expanded="${TS.dev}" ${tip('Playtest and measurement tools')}>Dev ›</button>
    ${
      TS.dev
        ? `<div class="panel mdev"><h3>Dev</h3>
      <span class="trow m0"><button class="btn" onclick="startMonster()" ${tip('A one-off 3D match between two all-OP teams: elements, hype scenes and blocks fire often')}>Monster game</button>
        <label class="sset" ${tip("Play the Monster game as one player: when they captain, the captain's Fire up / Settle chips appear under them between points (spec §2.17)")}><span class="cgl">Play as</span><select onchange="TS.playAs=this.value" aria-label="Play as">${PLAY_AS.map(([v, n]) => `<option value="${v}" ${(TS.playAs || '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="sset" ${tip('Where the Monster game is played: every venue has its own air as the crowd heats up — wind outdoors, embers indoors (spec §2.27)')}><span class="cgl">Venue</span><select onchange="TS.venue=this.value" aria-label="Venue">${Object.entries(
          MONSTER_VENUES
        )
          .map(([v, n]) => `<option value="${v}" ${(TS.venue || 'arena') === v ? 'selected' : ''}>${n}</option>`)
          .join('')}</select></label>
        <button class="btn" onclick="startAverage()" ${tip('A one-off 3D match between two teams of ordinary players: every player rolled at overall 30–60')}>Average game</button>
        <span class="sset" ${tip('A played match with a career-style player on a generated side (spec §2.37 Dev match): as a player — your own deck of 6, a hand of 3 and requests to the captain; as captain — the team hand of 5. Pick your deck from every card in match prep; the captain’s plays and request answers go to the Debug log.')}><span class="cgl">Deck match</span><button class="btn" onclick="startDeckMatch('player')">As a player</button><button class="btn" onclick="startDeckMatch('captain')">As captain</button><select onchange="TS.deckBond=+this.value" aria-label="Bond with the captain">${[
          0, 30, 60, 90
        ]
          .map(v => `<option value="${v}" ${(TS.deckBond ?? 30) === v ? 'selected' : ''}>Bond ${v}</option>`)
          .join('')}</select></span>
        <button class="btn" onclick="devOpen('cup', () => startCupSample())" ${tip('Two squads drawn at random from a real year-2 U21 Cup — the squads as auto-played Story runs reached it (your player and Haewon may be in them)')}>Year-2 Cup match</button>
        <label class="btn" ${tip('Load a .vrm from your computer. It stays in this browser (never uploaded); in the Monster game every player picks a random model among the built-in ones (Main_v2, Rival_v2–v4, male1, male2) and the loaded ones (career: your player is always Main_v2).')}>+ Player model<input type="file" accept=".vrm,.glb" hidden onchange="addModelFile(this)"></label>
        <button class="btn" onclick="devOpen('anim', () => startAnimLab())" ${tip('A Monster game that records every player: freeze, scrub frame by frame, orbit, foot marks, edit the pose values and Copy them')}>Animation lab</button>
        <button class="btn" onclick="startMonster({ cine: '${CINE_KINDS[0].id}' })" ${tip('A Monster game where every rally stages a cut-scene, with its camera values live beside it (Copy to bake them in)')}>Cut-scene lab</button>
        <button class="btn" onclick="devOpen('lab', () => navigate('vfxlab'))" ${tip('Every 3D effect on an empty floor: power, element, slow motion, repeat, a stress rate and the cost per frame')}>VFX lab</button>
        <button class="btn" onclick="benchModels()" ${tip('Time every model on its own: draw calls, triangles, render and hair-spring cost per frame (also written to the debug log).')}>Benchmark models</button>
        <button class="btn" onclick="toggleKeepColors()" ${tip('Monster game models (yours and loaded ones). Own: their own colours. Team: the team kit, hair, skin and eye colours like the base model.')}>Model colors: ${Models.keep ? 'Own' : 'Team'}</button>
        ${Models.live.map(n => `<span class="chipm">${esc(n)} <button class="btn x" onclick="removeModel('${esc(n).replace(/'/g, '&#39;')}')" aria-label="Remove">✕</button></span>`).join('')}</span>
      <span class="trow"><button class="btn ${wordsOn() ? 'on' : ''}" onclick="setWords(!wordsOn());renderMenu()" aria-pressed="${wordsOn()}" ${tip('Visible words per screen region against the §10.8 budgets (badge in each corner, red when over)')}>Word counter: ${wordsOn() ? 'On' : 'Off'}</button>
        <button class="btn" onclick="openDebug()" ${tip('Errors and stalls collected while playing')}>Debug log</button>
        <button class="btn ${PerfHUD.on ? 'on' : ''}" onclick="PerfHUD.toggle();renderMenu()" aria-pressed="${PerfHUD.on}" ${tip('Frame rate, frame time, JS time, draw calls, triangles and render scale in the corner, on the map and in matches')}>Perf overlay <kbd>F3</kbd>: ${PerfHUD.on ? 'On' : 'Off'}</button></span>
      <p class="small mute" id="mdl-note"></p></div>`
        : ''
    }
  </section>`;
  if (bg) $('.title > .tbg').replaceWith(bg);
  else titleBg($('.title > .tbg'));
}
/** The island's settings (spec §4.37 3–5): when the road stops you, the sound. */
function islandSettings() {
  const seg = (label, kind, opts, cur, t) =>
    `<div class="sset" ${tip(t)}><span class="cgl">${label}</span><div class="seg">${Object.entries(opts)
      .map(
        ([k, n]) =>
          `<button class="btn ${k === cur ? 'on' : ''}" aria-pressed="${k === cur}" onclick="islandOpt('${kind}','${k}')">${esc(n)}</button>`
      )
      .join('')}</div></div>`;
  return `${seg('Road stops', 'enc', ENC_STOPS, Encounter.pref(), 'When your walk stops for someone on the road. Friends: your circle and their asks. Everything: rival crews and street battles too. Never: no stops and no short cuts.')}
    ${seg('Sound', 'sound', { on: 'On', off: 'Off' }, SND.on ? 'on' : 'off', 'Every sound: match effects and music, the island’s ambience and footsteps.')}`;
}
function islandOpt(kind, v) {
  if (kind === 'enc') Encounter.setPref(v);
  else if (kind === 'sound' && (v === 'on') !== SND.on) toggleSound();
  renderMenu();
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
/** Monster game: a one-off match between two all-OP teams. `cine`: a cut-scene kind every rally stages (Dev preview). */
function startMonster({ cine = null, anim = false } = {}) {
  const [a, b] = mkMonsterTeams();
  for (const p of [...a.P, ...b.P]) p.form = +rnd(-0.1, 0.4).toFixed(2);
  const pa = /^([ab]):(\d)$/.exec(TS.playAs || ''), // Play as: a seat of either team → you (the captain's chips when that seat captains)
    T = pa ? (pa[1] === 'a' ? a : b) : null,
    you = T ? [T.s, T.mb, T.ws[0], T.ws[1]][+pa[2]] : null;
  navigate('match', {
    a,
    b,
    vfx: true,
    bundled: true, // every player is one of the owner's models (assets/vrm, players3d BUNDLED)
    human: you ? you.id : null,
    cine,
    anim,
    venue: TS.venue || 'arena', // the Monster tab's Venue (spec §2.27)
    round: cine ? `Cut-scene lab · ${CINE_KINDS.find(c => c.id === cine).name}` : anim ? 'Animation lab' : 'Monster game',
    back: 'Back to menu',
    onLeave: () => navigate('menu')
  });
}
/** The Monster tab's venues (spec §9.11 sets; §2.27 their air). */
const MONSTER_VENUES = {
  arena: 'League Arena',
  hall: 'Academy Hall',
  beach: 'Beach Stadium',
  highland: 'Highland Court',
  street: 'Street court'
};
/** The Monster game's Play as choices: none, or a seat of either team (the squads are drawn when the game starts). */
const PLAY_AS = [
  ['', 'Nobody (watch)'],
  ...['a', 'b'].flatMap(t =>
    ['Setter', 'Middle', 'Wing 1', 'Wing 2'].map((n, i) => [`${t}:${i}`, `${t === 'a' ? 'Left' : 'Right'} team · ${n}`])
  )
];
/** Average game (dev): a one-off match between two teams of ordinary players (overall 30–60 each). */
/**
 * Year-2 Cup match (dev, owner 2026-10-20): two squads at random from one sampled year-2 U21 Cup (CUP_SAMPLE — js/data/cup-sample.js,
 * generated from auto-played Story runs by tests/career-bot.js). Half the time it is your squad against another one.
 */
function startCupSample() {
  if (typeof CUP_SAMPLE === 'undefined' || !CUP_SAMPLE.length) return DBG.log('error', 'Year-2 Cup sample missing');
  const run = CUP_SAMPLE[Math.floor(Math.random() * CUP_SAMPLE.length)],
    S = run.squads,
    mine = S.findIndex(s => s.you),
    i = mine >= 0 && Math.random() < 0.5 ? mine : Math.floor(Math.random() * S.length);
  let j = Math.floor(Math.random() * (S.length - 1));
  if (j >= i) j++;
  const [a, b] = [S[i], S[j]].map(o => teamFromJSON(JSON.parse(JSON.stringify(o)))),
    tag = s => `${s.name}${s.you ? ' (you)' : ''}${s.rival ? ' (Haewon)' : ''}`;
  for (const p of [...a.P, ...b.P]) p.form = +rnd(-0.1, 0.4).toFixed(2);
  navigate('match', {
    a,
    b,
    vfx: true,
    venue: TS.venue || 'arena',
    round: `Year-2 Cup sample · run ${run.seed} · ${tag(S[i])} vs ${tag(S[j])}`,
    back: 'Back to menu',
    onLeave: () => navigate('menu')
  });
}
/**
 * Deck match (dev, spec §2.37 Dev match, T-349): two ordinary sides (overall 45–70); you are a wing spiker of the left side — as a
 * player a non-captain (your own deck, hand of 3, requests; bond with the captain from the Dev tab), as captain its captain (the hand
 * of 5). Match prep picks your deck from every card.
 */
function startDeckMatch(mode) {
  const [a, b] = mkAverageTeams(45, 70);
  for (const p of [...a.P, ...b.P]) p.form = +rnd(-0.1, 0.4).toFixed(2);
  const ws = a.P.filter(p => p.role === 'WS'),
    you = mode === 'captain' ? ws[0] : ws.find(p => !p.cap) || a.P.find(p => !p.cap);
  if (mode === 'captain') {
    for (const q of squadOf(a)) q.cap = false;
    a.cap = you;
    you.cap = true;
  }
  navigate('match', {
    a,
    b,
    vfx: true,
    human: you.id,
    deck: { side: 0, pid: you.id, mode, bond: TS.deckBond ?? 30, trusted: false },
    round: `Deck match · ${mode === 'captain' ? 'as captain' : 'as a player'} · #${you.num} ${firstName(you)}`,
    back: 'Back to menu',
    onLeave: () => navigate('menu')
  });
}
function startAverage() {
  const [a, b] = mkAverageTeams();
  for (const p of [...a.P, ...b.P]) p.form = +rnd(-0.1, 0.4).toFixed(2);
  navigate('match', { a, b, round: 'Average game', vfx: true, back: 'Back to menu', onLeave: () => navigate('menu') });
}
Screens.menu = renderMenu;
