// Skyline Cup 3D renderer. It draws the match state that render/playback.js simulates (A.disp, A.ball, A.cam,
// A.zoom…) with VRM anime players in a three.js arena; engine, beats, timing, UI and sound are untouched.
// While a match is bound, P() (court → screen) projects through this camera, so every screen-space effect, label
// and camera push-in the playback layer creates lines up with the 3D scene; those are drawn on the transparent 2D
// canvas on top. The world (renderer, arena, 10 dressed VRMs) is built once and re-dressed for every match.
import * as THREE from 'three';
import { loadBase, makeVRM, dress, applyPose, smoothBones, torsoDir, bendArm, groundSnap, setFace } from './players3d.mjs';
import { poseDone, playerPose, coachPose } from './poses3d.mjs';
import { createFx } from './fx3d.mjs';
import { makeTrail } from './trails3d.mjs';

// ---------- engine units → metres ----------
// x 0..1000 along the court (net at 500), z 0..1 across (0 = near side), h = height units (net tape at 150).
const KH = 2.43 / 150,
  KX = 1.5 * KH, // the big court: 840 units between the end lines ≈ 20.4 m
  KZ = 12; // 0.08..0.92 between the side lines ≈ 10.1 m
export const W = (x, z, h = 0) => new THREE.Vector3((x - 500) * KX, h * KH, (0.5 - z) * KZ);
const CAM = { pos: [-2.59, 14.011, 33.007], look: [-0.059, 3.294, 0.012], fov: 20.357 }; // fitted to the classic framing
const ASPECT = 1000 / 440;
const MODEL_URL = new URL('../../assets/vrm/base.glb.txt', import.meta.url).href;
const N_PLAYERS = 8,
  N_COACHES = 2;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const lowEnd = matchMedia('(max-width: 720px)').matches || (navigator.hardwareConcurrency || 8) <= 4;

let world = null,
  building = null;
/** Build the world once (download + parse the model, arena, players). onProgress(0..1, text). */
export function init(onProgress = () => {}) {
  if (world) return Promise.resolve(api);
  if (!building) building = build(onProgress).then(w => ((world = w), api));
  else building.progress = onProgress;
  return building;
}

async function build(onProgress) {
  const gl = document.createElement('canvas');
  gl.id = 'cv3';
  gl.setAttribute('aria-hidden', 'true');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('WebGL is not available');
  }
  const prog = (f, t) => (building && building.progress ? building.progress(f, t) : onProgress(f, t));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lowEnd ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1030');
  scene.fog = new THREE.Fog('#0b1030', 45, 90);

  // lights
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#5a3a22', 1.25));
  const sun = new THREE.DirectionalLight('#ffffff', 2.1);
  sun.position.set(-6, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 11, bottom: -11, near: 5, far: 50 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#8fb4ff', 0.6);
  rim.position.set(8, 10, -14);
  scene.add(rim);

  // floor and court (40 m × 20 m floor centred on the net; court 20.4 m × 10.1 m)
  const floorTex = canvasTex(2048, 1024, (g, w, h) => {
    const m = w / 40,
      cx = w / 2,
      cy = h / 2,
      X = x => cx + (x - 500) * KX * m,
      Z = z => cy - (0.5 - z) * KZ * m;
    g.fillStyle = '#b98a45';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,220,160,.06)' : 'rgba(90,50,10,.07)';
      g.fillRect(0, i * (h / 120), w, h / 120);
    }
    g.fillStyle = 'rgba(255,85,60,.28)';
    g.fillRect(X(80), Z(0.08), X(920) - X(80), Z(0.92) - Z(0.08));
    g.fillStyle = 'rgba(255,85,60,.16)';
    g.fillRect(X(360), Z(0.08), X(640) - X(360), Z(0.92) - Z(0.08));
    g.strokeStyle = 'rgba(255,255,255,.95)';
    g.lineWidth = 0.06 * m;
    g.strokeRect(X(80), Z(0.08), X(920) - X(80), Z(0.92) - Z(0.08));
    g.beginPath();
    for (const x of [500, 360, 640]) {
      g.moveTo(X(x), Z(0.08));
      g.lineTo(X(x), Z(0.92));
    }
    g.stroke();
    g.font = `900 ${0.9 * m}px "Dela Gothic One","Arial Black",sans-serif`;
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.fillText('SKYLINE CUP', cx, Z(0.98) + 0.35 * m);
  });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 20),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshStandardMaterial({ color: '#141a3a', roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.01;
  scene.add(outer);
  // point flash: the scoring side's half glows in its colour
  const ptMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  const ptHalf = new THREE.Mesh(new THREE.PlaneGeometry(420 * KX, 0.84 * KZ), ptMat);
  ptHalf.rotation.x = -Math.PI / 2;
  ptHalf.position.y = 0.012;
  scene.add(ptHalf);

  // net between posts at z = −0.04 and 1.04; tape at 2.43 m, bottom at 1.49 m
  const netTex = canvasTex(1024, 128, (g, w, h) => {
    g.strokeStyle = 'rgba(235,240,255,.75)';
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 10) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y <= h; y += 10) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
  const netW = 1.08 * KZ,
    netH = (150 - 92) * KH;
  const netGeo = new THREE.PlaneGeometry(netW, netH, 24, 4);
  const net = new THREE.Mesh(
    netGeo,
    new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 })
  );
  net.rotation.y = Math.PI / 2;
  net.position.set(0, ((92 + 150) / 2) * KH, 0);
  scene.add(net);
  const netRest = netGeo.attributes.position.array.slice();
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, netW), new THREE.MeshStandardMaterial({ color: '#f4f6ff' }));
  tape.position.set(0, 150 * KH, 0);
  tape.castShadow = true;
  scene.add(tape);
  for (const z of [-0.04, 1.04]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.62, 16),
      new THREE.MeshStandardMaterial({ color: '#cfd5ee', metalness: 0.5, roughness: 0.35 })
    );
    post.position.copy(W(500, z, 0)).setY(1.31);
    post.castShadow = true;
    scene.add(post);
  }
  for (const z of [0.08, 0.92]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.8, 8), new THREE.MeshBasicMaterial({ color: '#ff3b5c' }));
    ant.position.copy(W(500, z, 150)).setY(150 * KH + 0.7);
    scene.add(ant);
  }
  // LED board (team colours, redrawn per match) and stands behind the far side line
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 2048;
  boardCanvas.height = 64;
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(34, 1.1), new THREE.MeshBasicMaterial({ map: boardTex }));
  board.position.set(0, 0.55, -8.2);
  scene.add(board);
  const standMat = new THREE.MeshStandardMaterial({ color: '#1b2352', roughness: 0.9 });
  for (let r = 0; r < 6; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(46, 0.55, 1.3), standMat);
    step.position.set(0, 0.28 + r * 0.55, -9.4 - r * 1.3);
    step.receiveShadow = true;
    scene.add(step);
  }
  // crowd: instanced fans, coloured per match
  const nFans = lowEnd ? 180 : 320;
  const fanBody = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.24, 0.36, 3, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    nFans
  );
  const fanHead = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.17, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#e9c7a4', roughness: 0.7 }),
    nFans
  );
  const fans = [];
  for (let i = 0; i < nFans; i++) {
    const r = i % 6,
      x = -22 + ((i * 0.618) % 1) * 44 + (Math.random() - 0.5) * 0.6;
    fans.push({ x, y: 0.55 + r * 0.55 + 0.5, z: -9.4 - r * 1.3, ph: Math.random() * 6.3, side: -1, sx: 500 + x / KX, roll: Math.random() });
  }
  scene.add(fanBody, fanHead);

  // floor rings: in the zone (team colour, pulsing) and captain's buff (gold, dashed, orbiting dots)
  const ringTex = canvasTex(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, w * 0.36, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(0.55, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
  const dashTex = canvasTex(256, 256, (g, w) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 10;
    g.setLineDash([22, 16]);
    g.beginPath();
    g.arc(w / 2, w / 2, w * 0.44, 0, 7);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * w * 0.44, w / 2 + Math.sin(a) * w * 0.44, 12, 0, 7);
      g.fill();
    }
  });
  const flatRing = (tex, size) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.015;
    m.visible = false;
    scene.add(m);
    return m;
  };
  const glowTex = canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,.9)');
    r.addColorStop(0.35, 'rgba(255,255,255,.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });

  // ball
  const ballTex = canvasTex(256, 128, (g, w, h) => {
    const cols = ['#ffd84d', '#2c58d6', '#ffffff'];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = cols[i % 3];
      g.fillRect(0, (i * h) / 6, w, h / 6 + 1);
    }
  });
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 32, 20),
    new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45, emissive: '#000000' })
  );
  ball.castShadow = true;
  scene.add(ball);
  // powered balls glow and light up the players around them
  const ballGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })
  );
  ballGlow.renderOrder = 3;
  scene.add(ballGlow);
  const ballLight = new THREE.PointLight('#ffffff', 0, 4.5, 2);
  scene.add(ballLight);
  const fx = createFx(scene);

  // players and coaches: one base model, parsed once per figure, dressed per match
  prog(0, 'Downloading players');
  const buf = await loadBase(MODEL_URL, f => prog(f * 0.5, 'Downloading players'));
  const people = [],
    coaches = [];
  for (let i = 0; i < N_PLAYERS + N_COACHES; i++) {
    const pl = await makeVRM(buf, 1.8);
    scene.add(pl.root);
    prog(0.5 + (0.5 * (i + 1)) / (N_PLAYERS + N_COACHES), 'Getting players ready');
    await new Promise(r => setTimeout(r, 0));
    if (i < N_PLAYERS) {
      pl.aura = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })
      );
      pl.aura.scale.set(2.2, 2.6, 1);
      scene.add(pl.aura);
      pl.zone = flatRing(ringTex, 1.5);
      pl.buff = flatRing(dashTex, 1.7);
      pl.buff.material.color.set('#ffd84d');
      pl.trails = [makeTrail(scene), makeTrail(scene)]; // left / right hand light trails (stars and OP players)
      pl.eyeTrails = [makeTrail(scene, 44), makeTrail(scene, 44)]; // Kuroko-style eye streaks (in the zone / captain's buff)
      pl.vrm.lookAt && (pl.vrm.lookAt.target = ball);
      people.push(pl);
    } else coaches.push(pl);
  }
  return {
    renderer,
    gl,
    scene,
    ball,
    ballGlow,
    ballLight,
    fx,
    people,
    coaches,
    fans,
    fanBody,
    fanHead,
    boardCanvas,
    boardTex,
    net,
    netGeo,
    netRest,
    ptHalf,
    ptMat
  };
}

// ---------- cameras and projection ----------
const base = new THREE.PerspectiveCamera(CAM.fov, ASPECT, 0.5, 200),
  cam = base.clone(),
  fwd = new THREE.Vector3();
let focal = 220 / Math.tan((CAM.fov * Math.PI) / 360); // logical px per unit at distance 1
let camMode = (() => {
  try {
    return localStorage.getItem('sc.cam3d') || 'courtside';
  } catch (e) {
    return 'courtside';
  }
})();
const camState = { x: 0, blend: camMode === 'courtside' ? 1 : 0 };
/** Broadcast = the classic full-court framing; courtside = closer and lower, following the ball along the court. */
function updateBase(dt) {
  const tgt = camMode === 'courtside' ? 1 : 0;
  camState.blend += (tgt - camState.blend) * (1 - Math.exp(-dt * 2.5));
  const bx = A && A.ball.vis ? Math.max(-6.5, Math.min(6.5, (A.ball.x - 500) * KX * 0.75)) : 0;
  camState.x += (bx - camState.x) * (1 - Math.exp(-dt * 1.6));
  const k = camState.blend,
    pos = new THREE.Vector3(...CAM.pos).lerp(new THREE.Vector3(camState.x * 0.85, 3.3, 14.5), k),
    look = new THREE.Vector3(...CAM.look).lerp(new THREE.Vector3(camState.x, 1.55, -0.8), k);
  let fov = CAM.fov + (31 - CAM.fov) * k;
  // staged scene shot (A.shot from playback): hard cuts between shots, a quick ease in and out of the game camera
  const want = A && A.shot && world ? A.shot : null,
    key = want ? `${want.kind}|${want.p}|${want.p2 || ''}` : '';
  if (key && (key !== shot.key || shot.age < 0.2)) {
    // (re)frame: on a new shot, and for its first moments while the players settle into their poses
    const sp = shotPose(want);
    if (sp) {
      if (key !== shot.key) {
        if (shot.k > 0.5) shot.k = 1; // cut
        shot.age = 0;
      }
      Object.assign(shot, sp, { key });
    }
  }
  shot.age = (shot.age || 0) + dt;
  if (!key) shot.key = '';
  shot.k += ((shot.key ? 1 : 0) - shot.k) * (1 - Math.exp(-dt * (shot.key ? 16 : 5)));
  if (shot.k > 0.001) {
    const e = shot.k * shot.k * (3 - 2 * shot.k);
    pos.lerp(shot.pos, e);
    look.lerp(shot.look, e);
    fov += (shot.fov - fov) * e;
  }
  base.position.copy(pos);
  base.lookAt(look);
  base.fov = fov;
  base.updateMatrixWorld(true);
  base.updateProjectionMatrix();
  base.getWorldDirection(fwd);
  focal = 220 / Math.tan((base.fov * Math.PI) / 360);
  cam.position.copy(base.position);
  cam.quaternion.copy(base.quaternion);
  cam.updateMatrixWorld(true);
}
/** Camera for a scene shot: face close-up, over the setter's shoulder at the hitter, or from behind the block. */
const shot = { k: 0, key: '', pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 30 };
function shotPose(s) {
  const find = id => world.people.find(pl => pl.d && pl.d.p.id === id),
    a = find(s.p);
  if (!a) return null;
  const up = new THREE.Vector3(0, 1, 0),
    H = a.bone('head').getWorldPosition(new THREE.Vector3());
  if (s.kind === 'face') {
    const f = new THREE.Vector3(Math.sin(a.root.rotation.y), 0, Math.cos(a.root.rotation.y)),
      r = new THREE.Vector3().crossVectors(f, up).normalize();
    return {
      pos: H.clone()
        .addScaledVector(f, 1.2)
        .addScaledVector(r, 0.3)
        .add(new THREE.Vector3(0, 0.05, 0)),
      look: H.clone().add(new THREE.Vector3(0, -0.07, 0)),
      fov: 30
    };
  }
  const b = s.p2 && find(s.p2),
    T = b ? b.bone('head').getWorldPosition(new THREE.Vector3()) : H.clone().add(new THREE.Vector3(0, 0, 1)),
    d = T.clone().sub(H).setY(0).normalize(),
    r = new THREE.Vector3().crossVectors(d, up).normalize();
  if (s.kind === 'spike') {
    // low and to the side of the hitter in the air, looking up past the arm at the ball
    const f = new THREE.Vector3(Math.sin(a.root.rotation.y), 0, Math.cos(a.root.rotation.y)),
      rr = new THREE.Vector3().crossVectors(f, up).normalize();
    return {
      pos: H.clone()
        .addScaledVector(rr, 2.1)
        .addScaledVector(f, 0.5)
        .add(new THREE.Vector3(0, -0.6, 0)),
      look: H.clone()
        .addScaledVector(f, 0.2)
        .add(new THREE.Vector3(0, 0.15, 0)),
      fov: 40
    };
  }
  if (s.kind === 'ball') {
    // at the ball against the blocker's hands, from the hitter's side
    const bp = world.ball.position.clone(),
      toA = (b ? T.clone() : bp.clone().add(new THREE.Vector3(1, 0, 0))).sub(bp).setY(0).normalize(),
      rr = new THREE.Vector3().crossVectors(toA, up).normalize();
    return {
      pos: bp
        .clone()
        .addScaledVector(toA, 1.9)
        .addScaledVector(rr, 0.7)
        .add(new THREE.Vector3(0, 0.3, 0)),
      look: bp.clone().addScaledVector(toA, -0.15),
      fov: 38
    };
  }
  if (s.kind === 'ots')
    return {
      pos: H.clone()
        .addScaledVector(d, -1)
        .addScaledVector(r, 0.45)
        .add(new THREE.Vector3(0, 0.22, 0)),
      look: T,
      fov: 38
    };
  return {
    pos: H.clone()
      .addScaledVector(d, -1.6)
      .addScaledVector(r, -0.4)
      .add(new THREE.Vector3(0, 0.5, 0)),
    look: T.clone().lerp(H, 0.25),
    fov: 44
  };
}
updateBase(1);
const pv = new THREE.Vector3(),
  pw = new THREE.Vector3();
/** Court → logical screen (the P() contract): X 0..1000, Y from VT, s = screen px per height unit. */
function P3D(x, z, h) {
  pw.set((x - 500) * KX, h * KH, (0.5 - z) * KZ);
  pv.copy(pw).project(base);
  const depth = Math.max(1, pw.sub(base.position).dot(fwd));
  return { X: (pv.x + 1) * 500, Y: VT + (1 - pv.y) * 220, s: (focal * KH) / depth };
}
/** Apply the 2D view transform (screen = f·p + o in logical units: shake, push-in, zoom) to the render projection. */
const M = new THREE.Matrix4();
let dbg = null;
function viewCamera(V) {
  if (dbg) {
    // test hook: free camera (the overlay no longer lines up)
    cam.position.set(...dbg.pos);
    cam.lookAt(...dbg.look);
    cam.updateMatrixWorld(true);
    const pc = new THREE.PerspectiveCamera(dbg.fov || 30, ASPECT, 0.05, 200);
    cam.projectionMatrix.copy(pc.projectionMatrix);
    cam.projectionMatrixInverse.copy(pc.projectionMatrixInverse);
    return;
  }
  const f = V.f,
    bx = f - 1 + V.ox / 500,
    by = 1 - f - (VT * (f - 1) + V.oy) / 220;
  M.set(f, 0, 0, bx, 0, f, 0, by, 0, 0, 1, 0, 0, 0, 0, 1);
  cam.projectionMatrix.copy(base.projectionMatrix).premultiply(M);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
}

// ---------- per match ----------
let bound = null;
/** Attach the world to the current match screen (#stage / #cv) and dress it for A's teams. */
function bind() {
  const w = world,
    stage = document.getElementById('stage'),
    cv2 = document.getElementById('cv');
  stage.insertBefore(w.gl, cv2);
  const t0c = A.m.t[0].color,
    t1c = A.m.t[1].color;
  // LED board
  const g = w.boardCanvas.getContext('2d'),
    bw = w.boardCanvas.width,
    bh = w.boardCanvas.height;
  g.fillStyle = '#10163a';
  g.fillRect(0, 0, bw, bh);
  g.fillStyle = t0c;
  g.fillRect(bw * 0.05, bh * 0.25, bw * 0.35, bh * 0.5);
  g.fillStyle = t1c;
  g.fillRect(bw * 0.6, bh * 0.25, bw * 0.35, bh * 0.5);
  g.fillStyle = '#fff';
  g.font = '800 34px "M PLUS Rounded 1c",sans-serif';
  g.textAlign = 'center';
  g.fillText('SKYLINE CUP', bw / 2, bh * 0.68);
  w.boardTex.needsUpdate = true;
  // crowd colours: team fans and neutrals
  const pal = ['#2a3470', '#35408a', '#3b4796', t0c, t1c, t0c, t1c, '#27306a'];
  w.fans.forEach((f, i) => {
    const c = pal[Math.floor(f.roll * pal.length)];
    f.side = c === t0c ? 0 : c === t1c ? 1 : -1;
    w.fanBody.setColorAt(i, new THREE.Color(c));
  });
  w.fanBody.instanceColor.needsUpdate = true;
  // players: dressed in their team kit and look, scaled to their height
  const disp = Object.values(A.disp);
  w.people.forEach((pl, i) => {
    const d = disp[i];
    pl.d = d;
    pl.root.visible = pl.aura.visible = !!d;
    if (!d) {
      for (const t of [...pl.trails, ...pl.eyeTrails]) t.clear();
      return;
    }
    const p = d.p,
      team = p.team || A.m.t[d.side];
    dress(pl.vrm, { shirt: team.color, shorts: '#1b2150', hair: p.hair, skin: p.look.skin, eyes: p.look.eyeC, shoes: '#ffffff' });
    pl.root.scale.setScalar((pl.scale = (1.8 * (p.look.hgt || 1)) / pl.headY));
    pl.aura.material.color.set(p.op ? '#ff2846' : team.color);
    pl.zone.material.color.set(team.color);
    // hand trails in the player's hair colour, a touch brighter
    pl.trailCol = '#' + new THREE.Color(p.hair || '#ffffff').offsetHSL(0, 0.15, 0.12).getHexString();
    pl.eyeCol = '#' + new THREE.Color(p.look.eyeC || '#4cc9f0').offsetHSL(0, 0.2, 0.18).getHexString();
    for (const t of [...pl.trails, ...pl.eyeTrails]) t.clear();
    pl.prev.clear();
    Object.assign(pl, { yawOff: 0, mot: null });
  });
  w.coaches.forEach((pl, i) => {
    const c = A.coaches[i];
    pl.c = c;
    pl.root.visible = !!c;
    if (!c) return;
    dress(pl.vrm, { shirt: '#2b2f4a', shorts: '#23263d', hair: c.p.hair, skin: c.p.look.skin, eyes: c.p.look.eyeC, shoes: '#1a1c2c' });
    pl.root.scale.setScalar((pl.scale = 1.78 / pl.headY));
    pl.prev.clear();
  });
  bound = A;
  lastT = performance.now();
}
function unbind() {
  if (world && world.gl.parentNode) world.gl.remove();
  bound = null;
}

// ---------- per frame ----------
const tmp = new THREE.Vector3(),
  tmp2 = new THREE.Vector3(),
  ballAxis = new THREE.Vector3(0, 0, 1),
  ballDir = new THREE.Vector3(1, 0, 0);
let lastT = performance.now();
function moodOf(d) {
  const p = d.p,
    staV = (A.staShown || {})[p.id],
    m0 = A.cele ? (d.side === A.cele.w ? 1 : -0.8) : (A.moodShown || {})[p.id] || 0;
  if (d.pose === 'roar') return 1;
  if (d.pose === 'slump' && !A.cele) return -0.8;
  if (staV != null && staV < 0.3 && m0 < 0.6 && !A.cele) return Math.min(m0, -0.3);
  return m0;
}
/**
 * Measured motion for locomotion: velocity (m/s) from the player's court position, split into forward / lateral
 * relative to where they face, and a gait phase advanced by distance so feet don't slide.
 */
function motion(pl, pos, face, dt) {
  const m = pl.mot || (pl.mot = { speed: 0, fwd: 0, lat: 0, vx: 0, vz: 0, phase: Math.random() * 6, last: pos.clone() });
  if (A.freezeOn || dt <= 0) return m;
  const dx = pos.x - m.last.x,
    dz = pos.z - m.last.z,
    dist = Math.hypot(dx, dz);
  m.last.copy(pos);
  if (dist > 1.5) return m; // teleport (rotation / reset)
  const k = 1 - Math.exp(-dt * 9),
    fx = Math.sin(face),
    fz = Math.cos(face);
  m.vx += (dx / dt - (m.vx || 0)) * k;
  m.vz += (dz / dt - (m.vz || 0)) * k;
  const vf = (dx * fx + dz * fz) / dt,
    vl = (dx * fz - dz * fx) / dt; // + = to the player's left
  m.fwd += (vf - m.fwd) * k;
  m.lat += (vl - m.lat) * k;
  m.speed = Math.hypot(m.fwd, m.lat);
  const r = Math.max(0, Math.min(1, (m.speed - 1.2) / 2.3)),
    cycle = 1.25 + 1.25 * r; // metres per full gait cycle (two steps)
  const side = Math.abs(m.lat) > Math.abs(m.fwd) * 1.1;
  m.phase += ((side ? dist * 1.6 : dist) / cycle) * Math.PI * 2;
  return m;
}
const AURA = ['hips', 'chest', 'head', 'leftHand', 'rightHand', 'leftLowerLeg', 'rightLowerLeg', 'leftUpperArm', 'rightUpperArm'];
function posePlayer(pl, dt, ballPos) {
  const d = pl.d,
    side = d.side,
    face = side === 0 ? Math.PI / 2 : -Math.PI / 2,
    root = pl.root;
  const pos = W(d.x, d.z, 0);
  // gait is measured against where the body actually faces, so a player turned to run forward runs, not backpedals
  const mot = motion(pl, pos, face + pl.yawOff, dt);
  const pose = playerPose(d, moodOf(d), mot);
  root.position.copy(pos);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)),
    toward = (x, z) => wrap(Math.atan2(x, z) - face);
  const left = tmp2
      .copy(W(d.tx, d.tz, 0))
      .sub(pos)
      .setY(0)
      .length(),
    free = !d.pose || d.pose === 'ready' || d.pose === 'huddle' || poseDone(d);
  let want = 0,
    rate = 6;
  if (d.pose === 'dive' && d.dv && !poseDone(d) && Math.hypot(d.dv.dx * KX, d.dv.dz * KZ) > 0.4) {
    // dive: the whole body turns to where it launches
    want = toward(d.dv.dx * KX, -d.dv.dz * KZ);
    rate = 14;
  } else if (free && mot.speed > 0.9 && left > (A.ball.vis ? 2.5 : 0.8)) {
    // going somewhere (back to position, to the bench, to the coach): face the way you run
    want = toward(mot.vx, mot.vz);
    rate = 8;
  } else if (d.pose === 'huddle' && mot.speed < 0.6) {
    const c = W(sx(side, 115), -0.035, 0);
    want = toward(c.x - pos.x, c.z - pos.z) * 0.85; // around the coach
    rate = 5;
  } else if (
    (d.pose === 'ready' || d.pose === 'bump' || (mot.speed > 0.6 && d.pose !== 'spike' && d.pose !== 'set') || !d.pose) &&
    A.ball.vis
  ) {
    // turn toward the ball while waiting, running or passing; attackers, setters and blockers face the net
    want = Math.max(-0.7, Math.min(0.7, toward(ballPos.x - pos.x, ballPos.z - pos.z))) * 0.8;
  }
  pl.yawOff = wrap(pl.yawOff + wrap(want - pl.yawOff) * (1 - Math.exp(-dt * rate)));
  root.rotation.set(0, face + pl.yawOff, 0);
  if (pose.slide) root.position.add(tmp.set(Math.sin(face + pl.yawOff), 0, Math.cos(face + pl.yawOff)).multiplyScalar(pose.slide));
  // head follows the ball
  if (A.ball.vis && !pose.lying) {
    root.updateMatrixWorld(true);
    const loc = root.worldToLocal(tmp.copy(ballPos)),
      headY = (1.62 / 1.8) * pl.headY;
    const yaw = Math.max(-0.9, Math.min(0.9, Math.atan2(loc.x, Math.max(0.2, loc.z)))),
      pitch = Math.max(-0.8, Math.min(0.45, -Math.atan2(loc.y - headY, Math.hypot(loc.x, loc.z))));
    pose.hy = (pose.hy || 0) + yaw * 0.7;
    pose.hd = (pose.hd || 0) * 0.5 + pitch * 0.6;
  }
  root.position.y = (d.jy || 0) * KH;
  applyPose(pl, pose);
  // reach for the ball at contacts: hitting arm (spike/serve), both arms (set, bump, block, dive)
  const w = pose.contact || 0;
  // spike take-off: the non-hitting arm points straight at the ball
  if (pose.aimL > 0.01 && A.ball.vis && w <= 0.01) {
    root.updateMatrixWorld(true);
    pose.al = bendArm(pose.al, torsoDir(pl, ballPos, 'left').dir, pose.aimL);
    applyPose(pl, pose);
  }
  if (w > 0.01 && A.ball.vis) {
    root.updateMatrixWorld(true);
    const both = d.pose !== 'spike' && d.pose !== 'serve' && d.pose !== 'dive'; // a dive reaches with one hand
    const t = torsoDir(pl, ballPos, both ? 'both' : 'right');
    const reach = both ? (d.pose === 'bump' || d.pose === 'dive' ? 1.25 : 1.1) : 1.0;
    const k = w * Math.max(0, Math.min(1, (reach * 1.4 - t.dist) / (reach * 0.5)));
    if (k > 0.01) {
      if (both) {
        const spread = d.pose === 'block' ? 0.28 : d.pose === 'set' ? 0.18 : 0.06;
        const dl = t.dir
            .clone()
            .add(tmp2.set(spread, 0, 0))
            .normalize(),
          dr = t.dir
            .clone()
            .add(tmp2.set(-spread, 0, 0))
            .normalize();
        pose.al = bendArm(pose.al, dl, k * 0.85, d.pose === 'set' || d.pose === 'block');
        pose.ar = bendArm(
          pose.ar || pose.al.map((v, i) => (i < 3 ? new THREE.Vector3(-v.x, v.y, v.z) : -(v || 0))),
          dr,
          k * 0.85,
          d.pose === 'set' || d.pose === 'block'
        );
      } else pose.ar = bendArm(pose.ar, t.dir, k * (d.pose === 'dive' ? 0.75 : 0.9), true);
      applyPose(pl, pose);
    }
  }
  const fast = ((d.pose === 'spike' || d.pose === 'serve') && d.spk != null) || d.pose === 'dive';
  smoothBones(pl, dt, fast ? 45 : mot.speed > 1 ? 26 : 16);
  groundSnap(pl, (d.jy || 0) * KH + (pose.lift || 0), pose.lying);
  setFace(pl, pose.face || {}, dt);
  pl.vrm.update(dt);
  // hand trails: stars a thin short streak, OP players a wide long one (a little stronger in the zone)
  {
    const tier = d.p.op ? 2 : d.p.star ? 1 : 0,
      zk = A.zoneShown && A.zoneShown[side] ? 1.25 : 1,
      tdt = dt,
      charged = !!(d.p.elOn && (A.egShown || {})[d.p.id] >= EG.full), // full element gauge: trails turn the element colour
      o =
        tier || charged
          ? {
              width: Math.max(tier === 2 ? 0.12 : tier ? 0.065 : 0, charged ? 0.1 : 0) * zk,
              life: (tier === 2 || charged ? 0.34 : 0.2) * zk,
              alpha: charged ? 0.9 : tier === 2 ? 0.8 : 0.7,
              color: charged ? ECOL[d.p.el] : pl.trailCol
            }
          : { width: 0 },
      hands = ['leftHand', 'rightHand'];
    for (let i = 0; i < 2; i++) pl.trails[i].update(pl.bone(hands[i]).getWorldPosition(tmp2), tdt, cam, o);
    // eyes (Kuroko's zone): a thin streak of light from each eye that flows back behind the head, in the eye colour —
    // only while the team is in the zone or the player has a captain's buff
    const eyesOn = zk > 1 || !!(A.buffShown && A.buffShown[d.p.id]), // in the zone, or carrying a captain's buff
      head = pl.bone('head'),
      fwd = tmp.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)),
      eo = eyesOn
        ? {
            width: tier === 2 ? 0.032 : tier ? 0.026 : 0.022,
            life: 0.42,
            alpha: 1,
            color: pl.eyeCol,
            drift: fwd
              .clone()
              .multiplyScalar(-1.1)
              .add(new THREE.Vector3(0, 0.12, 0))
          }
        : { width: 0 };
    for (let i = 0; i < 2; i++) {
      const eb = pl.bone(i ? 'rightEye' : 'leftEye'),
        ep = eb ? eb.getWorldPosition(tmp2) : head.localToWorld(tmp2.set(i ? -0.032 : 0.032, 0.065, 0.078));
      pl.eyeTrails[i].update(ep, tdt, cam, eo);
    }
  }
  // aura and floor rings
  const air = d.jy > 12 || d.pose === 'spike' || d.pose === 'block' || d.pose === 'serve';
  pl.aura.position.set(root.position.x, root.position.y + 1.1, root.position.z);
  const full = !!(d.p.elOn && (A.egShown || {})[d.p.id] >= EG.full),
    targ = full ? (air ? 0.65 : 0.4) : d.p.op ? (air ? 0.55 : 0.22) : d.p.star && air ? 0.35 : 0;
  pl.aura.material.color.set(full ? ECOL[d.p.el] : d.p.op ? '#ff2846' : d.p.team.color);
  pl.aura.material.opacity += (targ - pl.aura.material.opacity) * (1 - Math.exp(-dt * 8));
  const fx = world.fx,
    elc = d.p.elOn ? ECOL[d.p.el] : null, // unlocked element: the aura takes its colour
    col = elc || (d.p.team && d.p.team.color) || '#ff2846',
    chg = !!(elc && (A.egShown || {})[d.p.id] >= EG.full);
  if (d.p.op && air && !A.shot && Math.random() < dt * 9) {
    const a = pl.bone(AURA[(Math.random() * AURA.length) | 0]).getWorldPosition(new THREE.Vector3());
    fx.arc(
      a,
      a.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(0.3 + Math.random() * 0.3)),
      Math.random() < 0.5 ? '#6fd6ff' : '#fff27a'
    );
  }
  if (!A.shot && (chg || (air && (d.p.op || d.p.star)) || (A.zoneShown && A.zoneShown[side] && Math.random() < 0.35)))
    if (Math.random() < dt * (air || chg ? 30 : 8))
      fx.mote(
        pl.bone(AURA[(Math.random() * AURA.length) | 0]).getWorldPosition(new THREE.Vector3()),
        d.p.op && !chg ? '#ff2846' : col,
        elc ? '#ffffff' : null
      );
  const zone = A.zoneShown && A.zoneShown[side],
    bl = (A.buffShown && A.buffShown[d.p.id]) || 0,
    now = performance.now();
  pl.zone.visible = !!zone;
  if (zone) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.005 + d.p.num);
    pl.zone.position.set(pos.x, 0.015, pos.z);
    pl.zone.scale.setScalar(1 + 0.08 * pulse);
    pl.zone.material.opacity = 0.6 + 0.35 * pulse;
  }
  pl.buff.visible = !!bl;
  if (bl) {
    pl.buff.position.set(pos.x, 0.016, pos.z);
    pl.buff.rotation.z = now * 0.002;
    pl.buff.scale.setScalar(zone ? 1.28 : 1);
  }
}
function poseCoach(pl, dt, now) {
  const c = pl.c,
    s = c.side,
    hop = c.type === 'yay' ? Math.abs(Math.sin(now * 0.012)) * 14 * c.react : 0;
  pl.root.position.copy(W(sx(s, 115), -0.035, 0));
  pl.root.rotation.set(0, s === 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5, 0);
  const pose = coachPose(c, now);
  applyPose(pl, pose);
  smoothBones(pl, dt, 12);
  groundSnap(pl, hop * KH, false);
  setFace(pl, pose.face || {}, dt);
  pl.vrm.update(dt);
}
const mtx = new THREE.Matrix4();
function updateCrowd(now) {
  const w = world;
  for (let i = 0; i < w.fans.length; i++) {
    const f = w.fans[i];
    const lvl = Math.max(f.side >= 0 ? A.cheer[f.side] : 0, A.cheerAll * 0.8, A.cele && f.side === A.cele.w ? 1 : 0);
    let off = lvl > 0 ? Math.abs(Math.sin(now * 0.013 + f.ph)) * 0.35 * Math.min(1, lvl * 1.5) : 0;
    if (A.wave) off += Math.exp(-Math.pow((f.sx - A.wave.x) / 55, 2)) * 0.5;
    mtx.makeTranslation(f.x, f.y + off, f.z);
    w.fanBody.setMatrixAt(i, mtx);
    mtx.makeTranslation(f.x, f.y + off + 0.46, f.z);
    w.fanHead.setMatrixAt(i, mtx);
  }
  w.fanBody.instanceMatrix.needsUpdate = w.fanHead.instanceMatrix.needsUpdate = true;
}
/**
 * 3D resolution = the court canvas size, capped to the quality's pixel budget (GFX[G.gfx].px3d), × a dynamic factor
 * `res`: under ~45 fps it steps down (never below the quality's floor); with headroom it steps back up to 1.
 */
const dyn = { res: 1, ema: 16.7, t: 0 };
function adaptRes(ms) {
  const Q = GFX[G.gfx] || GFX.auto;
  dyn.ema += (Math.min(100, ms) - dyn.ema) * 0.05;
  dyn.t += ms;
  if (dyn.res < Q.floor) dyn.res = Q.floor;
  if (dyn.t < 1000) return;
  dyn.t = 0;
  if (dyn.ema > 22 && dyn.res > Q.floor) dyn.res = Math.max(Q.floor, +(dyn.res - 0.05).toFixed(2));
  else if (dyn.ema < 15 && dyn.res < 1) dyn.res = Math.min(1, +(dyn.res + 0.05).toFixed(2));
}
function syncSize() {
  // the WebGL canvas sits exactly under the 2D canvas, at its pixel size × the dynamic resolution
  const gl = world.gl,
    w = cv.width,
    h = cv.height,
    Q = GFX[G.gfx] || GFX.auto,
    scale = Math.min(1, Math.sqrt(Q.px3d / Math.max(1, w * h))) * dyn.res;
  if (gl.width !== Math.round(w * scale) || gl.height !== Math.round(h * scale))
    world.renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
  const s = gl.style;
  s.left = cv.offsetLeft + 'px';
  s.top = cv.offsetTop + 'px';
  s.width = cv.offsetWidth + 'px';
  s.height = cv.offsetHeight + 'px';
}

function draw() {
  if (!world || !A) return;
  if (bound !== A || !world.gl.isConnected) bind();
  const now = performance.now(),
    dt = Math.min(0.05, (now - lastT) / 1000) * (A.paused ? 0 : 1) || 1e-4;
  if (!document.hidden) adaptRes(now - lastT);
  lastT = now;
  syncSize();
  updateBase(dt || 0.016);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (A.ball.vis && A.ball.follow) followBall();
  const V = applyView(); // same shake / push-in / zoom as the playback layer; also sets the overlay transform
  viewCamera(V);
  const w = world,
    B = A.ball,
    ball = w.ball;
  ball.visible = !!B.vis;
  if (B.vis) {
    const prev = ball.position.clone(),
      bp = W(B.x, B.z, B.h);
    ball.position.copy(bp).y = Math.max(0.16, bp.y);
    const mv = tmp.subVectors(ball.position, prev);
    if (mv.lengthSq() > 1e-6) ballAxis.set(mv.z, 0, -mv.x).normalize();
    ball.setRotationFromAxisAngle(ballAxis, A.spin || 0);
    const sq = A.squash || 0;
    ball.scale.set(1 + 0.35 * sq, 1 - 0.42 * sq, 1 + 0.35 * sq);
    const hot = (A.trailPow || 0) >= 100;
    ball.material.emissive.set(hot ? '#ff3d7f' : A.trailEl ? ECOL[A.trailEl] : '#000000');
    ball.material.emissiveIntensity = hot ? 0.6 : A.trailPow ? 0.35 : 0;
    if (mv.lengthSq() > 1e-6) ballDir.copy(mv).normalize();
  }
  // glow + light on powered shots, in the element's colour
  const gk = B.vis && A.trailPow ? Math.min(1, A.trailPow / 110) : 0,
    gc = A.trailOp ? '#bff4ff' : A.trailEl ? ECOL[A.trailEl] : (A.trailPow || 0) >= 100 ? '#ff3d7f' : '#9fe8ff';
  w.ballGlow.position.copy(ball.position);
  w.ballGlow.material.color.set(gc);
  w.ballGlow.material.opacity += ((A.shot ? 0.3 : 0.9) * gk - w.ballGlow.material.opacity) * 0.3; // softer in close-ups
  w.ballGlow.scale.setScalar(0.8 + 0.5 * gk + 0.08 * Math.sin(now * 0.04));
  w.ballLight.position.copy(ball.position);
  w.ballLight.color.set(gc);
  w.ballLight.intensity = 2.6 * gk * Math.min(1, Math.max(0, (ball.position.y - 0.3) / 1.2)); // fades near the floor: no hotspot
  // bodies, hair springs and trails run on the world clock (A.ts): in slow motion everything slows together
  const wdt = dt * Math.max(0.02, Math.min(1, A.ts ?? 1));
  if (!A.qaFreeze) for (const pl of w.people) if (pl.d) posePlayer(pl, wdt, ball.position); // qaFreeze: test hook
  for (const pl of w.coaches) if (pl.c) poseCoach(pl, dt, now);
  updateCrowd(now);
  // net shake
  const ns = A.netShake || 0,
    arr = w.netGeo.attributes.position.array,
    rest = w.netRest;
  for (let i = 0; i < arr.length; i += 3)
    arr[i + 2] = rest[i + 2] + (ns ? Math.sin(now * 0.05 + rest[i] * 3) * ns * 0.12 * (0.5 + 0.5 * Math.sin(rest[i + 1] * 3)) : 0);
  w.netGeo.attributes.position.needsUpdate = true;
  // point flash on the scorer's half
  if (A.ptFlash) {
    w.ptHalf.position.x = A.ptFlash.side === 0 ? -210 * KX : 210 * KX;
    w.ptMat.color.set(A.m.t[A.ptFlash.side].color);
    w.ptMat.opacity = A.ptFlash.life * 0.4;
  } else w.ptMat.opacity = 0;
  // effects run on the world clock, except in a scene close-up: there they fade out at full speed so a frozen world
  // doesn't pile lightning and sparks in front of the camera
  w.fx.update(A.shot ? dt * 1.5 : dt * Math.max(A.freezeOn ? 0.15 : 0.02, Math.min(1, A.ts ?? 1)), cam, w.gl.height, base.fov);
  w.renderer.render(w.scene, cam);
  // overlay: the playback layer's screen-space pieces, now projected through this camera
  drawChant(now);
  drawFloorFx();
  if (B.vis && !A.trailEl) drawTrail(ballScreen());
  for (const pl of w.people) {
    const d = pl.d;
    if (!d) continue;
    const pr = P(d.x, d.z, d.jy);
    if (!A.shot) drawTags(d, pr, Math.min(1.7, pr.s * FIG * (d.p.look ? d.p.look.hgt : 1)), (A.staShown || {})[d.p.id]); // capped: close-up shots
  }
  for (const pl of w.coaches) {
    if (!pl.c) continue;
    const pr = P(sx(pl.c.side, 115), -0.035, 0);
    drawCoachTags(pl.c, pr, pr.s * FIG * 1.02);
  }
  drawFx(now);
}

function setCamMode(m) {
  camMode = m;
  try {
    localStorage.setItem('sc.cam3d', m);
  } catch (e) {
    // storage blocked (private mode / sandboxed frame): the choice just isn't remembered
  }
}
/** Effect entry points for render/effects.js: anchored at the ball (or the floor under it). */
const ballW = () => (A && A.ball ? W(A.ball.x, A.ball.z, Math.max(10, A.ball.h)) : new THREE.Vector3());
const fxApi = {
  burst: (pow, color) => world && world.fx.burst(ballW(), pow, color),
  elemBurst: (el, pow) => world && world.fx.elemBurst(el, ballW(), pow, A.ball.h > 60 ? ballDir.clone() : null),
  impact: pow => world && world.fx.impact(ballW(), pow),
  elemImpact: (el, pow) => world && world.fx.elemImpact(el, ballW(), pow),
  trail: (el, pow, dt) => world && world.fx.trail(el, ballW(), ballDir.clone(), pow, dt),
  zap: pow => world && world.fx.zap(ballW(), pow),
  skyBolt: w => world && world.fx.skyBolt(W(A.ball.x, A.ball.z, 0), w)
};
export const api = {
  draw,
  fx: fxApi,
  P3D,
  bind,
  unbind,
  setCamMode,
  camMode: () => camMode,
  debugCam: c => (dbg = c),
  fxAge: dt => world && world.fx.update(dt, cam, world.gl.height, base.fov), // test hook: age effects while fast-forwarding
  get res() {
    return world ? +(world.gl.width / Math.max(1, cv.width)).toFixed(2) : null; // 3D render scale vs the court canvas (debug)
  },
  poseAll: dt => world && world.people.forEach(pl => pl.d && posePlayer(pl, dt, W(A.ball.x, A.ball.z, A.ball.h))), // test hook: fast-forward posing
  get people() {
    return world ? world.people : [];
  }
};
