// VFX lab (dev, T-238): the title's Dev tab → every 3D effect on an empty floor, with power, element, repeat, slow motion,
// a stress rate and a cost readout. The 3D side is js/render3d/vfxlab3d.mjs (its own renderer; stops when the screen goes).

const LAB = { fx: 'blast', pow: 110, el: 'fire', speed: 1, auto: false, stress: 0, trail: 'ink' };
/** [effect id, label, uses the element]. */
const LAB_FX = [
  ['blast', 'Ground blast', false],
  ['sweep', 'Hand trail: weapon sweep', false],
  ['spike', 'Spike: air → trail → floor (+ blast at 100+)', true],
  ['airImpact', 'Air impact', false],
  ['airRev', 'Air impact: classic (small → large)', false],
  ['burst', 'Contact burst', false],
  ['elemBurst', 'Element burst', true],
  ['impact', 'Floor impact', false],
  ['elemImpact', 'Element floor impact', true],
  ['trail', 'Ball trail', true],
  ['zap', 'OP sparks', false],
  ['skyBolt', 'Sky bolt', false]
];
let labMod = null,
  labTimer = 0;
/** Call into the 3D module once it is loaded. */
const labDo = (fn, ...a) => labMod && labMod[fn](...a);

/** The side panel: effects, power, element, speed, repeat, stress, the readout. */
function labSide() {
  const seg = (k, vals, fmt) =>
    `<div class="seg" aria-label="${k}">${vals.map(v => `<button class="btn ${LAB[k] === v ? 'on' : ''}" onclick="labOpt('${k}', ${JSON.stringify(v)})">${fmt(v)}</button>`).join('')}</div>`;
  return `<div class="vtop"><h3>VFX lab</h3><button class="btn" onclick="navigate('menu')">Back <kbd>Esc</kbd></button></div>
      <div class="vfx">${LAB_FX.map(
        ([id, label, el], i) =>
          `<button class="btn ${LAB.fx === id ? 'on' : ''}" onclick="labFire('${id}')">${i < 10 ? `<kbd>${(i + 1) % 10}</kbd> ` : ''}${esc(label)}${el ? ' <small>element</small>' : ''}</button>`
      ).join('')}</div>
      <label class="vrow">Power <b id="vpow">${LAB.pow}</b><input type="range" min="40" max="150" value="${LAB.pow}" oninput="labOpt('pow', +this.value, true)"></label>
      <div class="vrow">Element<div class="seg vels">${Object.keys(ECOL)
        .map(
          e =>
            `<button class="btn ${LAB.el === e ? 'on' : ''}" style="border-color:${ECOL[e]}" onclick="labOpt('el','${e}')">${esc(e)}</button>`
        )
        .join('')}</div></div>
      <div class="vrow">Trail ${seg('trail', ['light', 'ink'], v => TRAIL_STYLES[v])}</div>
      <div class="vrow">Speed ${seg('speed', [1, 0.25, 0.1, 0], v => (v ? `${v}×` : '❚❚'))}</div>
      <div class="vrow">Repeat <kbd>R</kbd> ${seg('auto', [false, true], v => (v ? 'On' : 'Off'))}</div>
      <div class="vrow">Stress ${seg('stress', [0, 2, 10, 30], v => (v ? `${v}/s` : 'Off'))}</div>
      <pre class="vstat" id="vstat">loading…</pre>
      <p class="small mute">Drag to orbit, wheel to zoom. Space fires again.</p>`;
}
function renderVfxLab() {
  A = null;
  $('#app').innerHTML =
    `<section class="vlab"><div class="vstage" id="vstage"></div><aside class="panel vside">${labSide()}</aside></section>`;
  const go = m => {
    labMod = m;
    if (!document.querySelector('.vlab')) return;
    m.mountLab($('#vstage'));
    m.labSet(LAB);
    m.labPlay(LAB.fx);
  };
  if (labMod) go(labMod);
  else
    import(new URL('js/render3d/vfxlab3d.mjs', document.baseURI).href).then(go).catch(e => DBG.log('error', 'VFX lab could not load', e));
  clearInterval(labTimer);
  labTimer = setInterval(labReadout, 500);
}
Screens.vfxlab = renderVfxLab;

/** Fire an effect (and select it for repeat / stress). */
function labFire(id) {
  LAB.fx = id;
  labRedraw();
  labDo('labPlay', id);
}
/** Set an option; `quiet`: no redraw (the slider). */
function labOpt(k, v, quiet) {
  LAB[k] = v;
  labDo('labSet', { [k]: v });
  if (!quiet) return labRedraw();
  const el = $('#vpow');
  if (el) el.textContent = v;
}
/** Redraw the side panel only (the canvas stays). */
function labRedraw() {
  const el = $('.vlab .vside');
  if (el) el.innerHTML = labSide();
}
/** The cost readout, twice a second; stops when the screen is gone. */
function labReadout() {
  const el = $('#vstat');
  if (!el) return clearInterval(labTimer);
  const s = labDo('labStats');
  if (!s) return;
  el.textContent = `${s.fps.toFixed(0)} fps · frame ${s.ms.toFixed(1)} ms (fx ${s.fxMs.toFixed(2)} ms)
draw calls ${s.calls} · triangles ${s.tris}
glow ${s.glow} · sparks ${s.spark} · streaks ${s.streak}
smoke ${s.smoke} · rocks ${s.rocks} · meshes ${s.meshes}`;
}
document.addEventListener('keydown', e => {
  if (!document.querySelector('.vlab') || e.target.closest('input,select,textarea')) return;
  const n = +e.key;
  if (/^[0-9]$/.test(e.key) && LAB_FX[(n + 9) % 10]) labFire(LAB_FX[(n + 9) % 10][0]);
  else if (e.key === ' ') {
    e.preventDefault();
    labFire(LAB.fx);
  } else if (e.key === 'r' || e.key === 'R') labOpt('auto', !LAB.auto);
  else if (e.key === 'Escape') navigate('menu');
});
