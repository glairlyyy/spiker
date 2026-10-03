// 3D portraits for the UI (owner, 2026-10-04): a head-and-shoulders shot of the actual player model, rendered once per look
// and handed back as an image URL. One small offscreen renderer and one figure per model: every NPC is the default model
// re-coloured per portrait (hair, skin, team shirt — owner, 2026-10-04: only what the model itself can change); your own
// player is Main_v2 as modelled.
//   create() → { shot(req) → Promise<dataURL> }   req = { main, kit: { shirt, hair, skin } }
// Display only: no rules, no randoms. Shots run one at a time (a queue); a failed model load rejects every request.
import * as THREE from 'three';
import { loadBase, makeVRM, dress, undress, MODEL_URL, MAIN_URL } from './players3d.mjs';

const PX = 160, // rendered size (px): the UI scales it down (18–120 px)
  FOV = 22,
  DIST = 0.85, // camera distance from the face (m, figure 1.8 m tall): the whole head in frame, the face in the middle
  ARM = 1.25; // arms lowered from the T-pose (rad) so they stay out of the frame

export function create() {
  const canvas = document.createElement('canvas'),
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true }),
    scene = new THREE.Scene(),
    cam = new THREE.PerspectiveCamera(FOV, 1, 0.05, 10),
    figs = {}, // 'base' | 'main' → Promise<figure>
    head = new THREE.Vector3(),
    eyeL = new THREE.Vector3(),
    eyeR = new THREE.Vector3(),
    UP = new THREE.Vector3(0, 0.08, 0);
  renderer.setPixelRatio(1);
  renderer.setSize(PX, PX, false);
  renderer.setClearColor(0x000000, 0);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x3a3f55, 1.6));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.2);
  key.position.set(0.6, 2.4, 1.6);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 1.2);
  rim.position.set(-1.2, 2, -1.4);
  scene.add(key, rim);

  /** Load a model once and set it up for portraits: arms down, upright, at the origin. */
  const figure = which =>
    figs[which] ||
    (figs[which] = loadBase(which === 'main' ? MAIN_URL : MODEL_URL)
      .then(buf => makeVRM(buf, 1.8))
      .then(pl => {
        const b = pl.bone;
        if (b('leftUpperArm')) b('leftUpperArm').rotation.z = -ARM;
        if (b('rightUpperArm')) b('rightUpperArm').rotation.z = ARM;
        if (b('neck')) b('neck').rotation.x = 0.04;
        pl.root.visible = false;
        pl.root.userData.fig = true;
        scene.add(pl.root);
        return pl;
      }));

  let queue = Promise.resolve();
  const shoot = async ({ main, kit }) => {
    let pl = null;
    if (main) pl = await figure('main').catch(() => ((main = false), null)); // Main_v2 missing: the default model in your colours
    if (!pl) pl = await figure('base');
    scene.traverse(o => o.userData.fig && (o.visible = o === pl.root)); // one figure in the shot (synchronously, before the render)
    if (main) undress(pl.vrm);
    else dress(pl.vrm, { shirt: kit.shirt, hair: kit.hair, skin: kit.skin }); // only what the model can change
    pl.vrm.update(0);
    pl.root.updateMatrixWorld(true);
    // aim at the face: between the eyes (VRM eye bones), else a little above the head bone (which sits at the neck)
    const le = pl.bone('leftEye'),
      re = pl.bone('rightEye');
    if (le && re) head.copy(le.getWorldPosition(eyeL)).add(re.getWorldPosition(eyeR)).multiplyScalar(0.5);
    else pl.bone('head').getWorldPosition(head).add(UP);
    head.y -= 0.015; // eyes sit just above the centre of a face
    cam.position.set(head.x, head.y + 0.02, head.z + DIST);
    cam.lookAt(head);
    renderer.render(scene, cam);
    return canvas.toDataURL('image/png');
  };
  return {
    /** One portrait; requests queue so the shared figure is dressed for one shot at a time. */
    shot(req) {
      const p = queue.then(() => shoot(req));
      queue = p.catch(() => {});
      return p;
    }
  };
}
