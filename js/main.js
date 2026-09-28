// Entry point.

requestAnimationFrame(frame);
navigate('menu');
// start building the 3D world in the background so the first match opens quickly
setTimeout(
  () =>
    load3D()
      .then(() => Models.boot())
      .then(() => G.view === 'menu' && Models.live.length && renderMenu())
      .catch(() => {}),
  400
);
