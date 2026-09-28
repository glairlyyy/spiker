// Main menu: the game (Spite & Spike), Legacy and the encyclopedia, plus a dev playtest entry (Monster game).

function renderMenu() {
  A = null;
  const saved = RUN || Run.load(),
    L = Legacy.load(),
    you = saved && Run.you(saved);
  $('#app').innerHTML = `<section class="menu">
    <button class="mcard hot solo" onclick="openCareer()">
      <span class="mk">New game</span><b>Spite &amp; Spike</b>
      <span class="mute">Arrive in the city with nothing. Find a club, train, survive — and make them regret it.</span>
      <span class="mgo">${you ? (saved.result ? `See ${esc(you.name)}'s result` : `Continue: ${esc(you.name)} · ${saved.week > CAREER.weeks ? 'Cup' : 'week ' + saved.week}`) : 'Start'}</span></button>
    <div class="panel mleg"><h3>Legacy</h3>
      <p>${L.pts} Legacy points · ${L.runs} run${L.runs === 1 ? '' : 's'}${L.best ? ` · best: ${esc(L.best.name)} (rank ${L.best.rank}, ${L.best.fans.toLocaleString()} fans)` : ''}</p>
      <span class="trow" style="margin:0"><button class="btn" onclick="navigate('encyclopedia')">Skill encyclopedia</button><button class="btn" onclick="navigate('legacy')">Unlocks</button></span></div>
    <div class="panel mdev"><h3>Playtest <span class="mute small">dev</span></h3>
      <span class="trow" style="margin:0"><button class="btn" onclick="startMonster()" ${tip('A one-off 3D match between two all-OP teams: elements, hype scenes and blocks fire often')}>Monster game</button>
        <label class="btn" ${tip('Load a .vrm from your computer. It stays in this browser (never uploaded); about 1 in 3 players get it.')}>+ Player model<input type="file" accept=".vrm,.glb" hidden onchange="addModelFile(this)"></label>
        ${Models.live.map(n => `<span class="chipm">${esc(n)} <button class="btn x" onclick="removeModel('${esc(n).replace(/'/g, '&#39;')}')" aria-label="Remove">✕</button></span>`).join('')}</span>
      <p class="small mute" id="mdl-note"></p></div>
  </section>`;
}
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
