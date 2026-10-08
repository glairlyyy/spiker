// Staged scenes (engine/hype.js) on the match screen's DOM: the banner, the subtitle line under a close-up, and
// tap-to-skip. The scene camera itself is A.shot, framed by the 3D renderer.

/** Restart a CSS entry animation on `el` (class `on`). */
function replayOn(el) {
  el.classList.remove('on');
  void el.offsetWidth; // force a reflow so the animation starts again
  el.classList.add('on');
}
/** Big banner across the stage ({ t: text, c: colour }), with a stinger. */
function showBanner(a) {
  const el = document.getElementById('hbanner');
  if (!el) return;
  el.textContent = a.t;
  el.style.setProperty('--c', a.c || '#ff3b4e');
  replayOn(el);
  sfx.stinger();
}
/** A player's scene line ({ p: id, t: text }) as a subtitle box in their team colour. */
function showSay(a) {
  const el = document.getElementById('hsay'),
    p = byId(a.p);
  if (!el || !p) return;
  el.style.setProperty('--c', p.team.color);
  el.innerHTML = `<b>${esc(p.name)}</b><span>${esc(a.t)}</span>`;
  replayOn(el);
}
/** Leave a scene: game camera back, lines away. */
function endScene() {
  if (A && A.shot && !Cine.busy()) A.shot = null; // (the cinematic camera ends on its own: render/cine.js)
  const say = document.getElementById('hsay');
  if (say && say.classList.contains('on')) say.classList.remove('on');
}
/** Tap / click the court during a scene to skip the rest of it. Returns whether anything was skipped. */
function skipScene() {
  if (!A || !A.beats) return false;
  let hit = false;
  for (let i = A.bi; i < A.beats.length && A.beats[i].scene; i++) {
    const b = A.beats[i];
    if (b.freeze) break; // the contact hit-stop stays
    b.dur = 1;
    if (!b._s) b.acts = []; // a started beat keeps its acts (its end acts still fire)
    hit = true;
  }
  if (hit) {
    A.el = 1e9;
    endScene();
  }
  return hit;
}
