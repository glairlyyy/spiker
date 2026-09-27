// Main menu: Career (create and train a player), the Monster exhibition, Legacy.

function renderMenu() {
  A = null;
  const saved = RUN || Run.load(),
    L = Legacy.load(),
    you = saved && Run.you(saved);
  $('#app').innerHTML = `<section class="menu">
    <button class="mcard hot" onclick="openCareer()">
      <span class="mk">Career</span><b>Road to the Cup</b>
      <span class="mute">Create a player, train for ${CAREER.weeks} weeks, then play the Cup with your team.</span>
      <span class="mgo">${you ? (saved.result ? `See ${esc(you.name)}'s result` : `Continue: ${esc(you.name)} · ${saved.week > CAREER.weeks ? 'Cup' : 'week ' + saved.week}`) : 'New career'}</span></button>
    <div class="mcard monster" role="group" aria-label="Monster game">
      <span class="mk">Exhibition</span><b>Monster game</b>
      <span class="mute">One match, eight OP red-star players. No bracket — just chaos.</span>
      <span class="mplay"><button class="btn hot" onclick="startMonster()">Play</button></span></div>
    <div class="panel mleg"><h3>Legacy</h3>
      <p>${L.pts} Legacy points · ${L.runs} run${L.runs === 1 ? '' : 's'}${L.best ? ` · best: ${esc(L.best.name)} (rank ${L.best.rank}, ${L.best.fans.toLocaleString()} fans)` : ''}</p>
      <span class="trow" style="margin:0"><button class="btn" onclick="navigate('encyclopedia')">Skill encyclopedia</button><button class="btn" onclick="navigate('legacy')">Unlocks</button></span></div>
    <p class="small mute mclassic">Looking for the original 2D court? <a href="https://claude.ai/artifact/YN2QrdmB61ZFYNwUiYafH7" target="_blank" rel="noopener">Play the classic 2D version</a>.</p>
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
