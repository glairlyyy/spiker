// The arena: lights, floor and court lines, net and posts, LED board, stands and the instanced crowd, the ball (with
// its glow and light) and the floor-ring textures. Built once; recoloured per match; animated per frame.
import * as THREE from 'three';
import { KH, KX, KZ, W, Wto, canvasTex, lowEnd } from './units3d.mjs';

/** Build everything into `scene`; returns the handles the renderer animates. */
export function buildArena(scene) {
  // lights
  const hemi = new THREE.HemisphereLight('#dfe8ff', '#5a3a22', 1.25);
  scene.add(hemi);
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
    g.fillText('SPITE & SPIKE', cx, Z(0.98) + 0.35 * m);
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
  // the League Arena's tiered stands (venue3d shows them only there); the crowd itself lives in venue3d.mjs
  const stands = new THREE.Group(),
    standMat = new THREE.MeshStandardMaterial({ color: '#1b2352', roughness: 0.9 });
  for (let r = 0; r < 6; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(46, 0.55, 1.3), standMat);
    step.position.set(0, 0.28 + r * 0.55, -9.4 - r * 1.3);
    step.receiveShadow = true;
    stands.add(step);
  }
  scene.add(stands);

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
  // the squash / smear (updateBall: userData.sq, a world-axis scale) goes outside the spin: T · D · R · S
  ball.updateMatrix = function () {
    this.matrix.compose(ORIGIN, this.quaternion, this.scale);
    if (this.userData.sq) this.matrix.premultiply(this.userData.sq);
    this.matrix.setPosition(this.position);
    this.matrixWorldNeedsUpdate = true;
  };
  scene.add(ball);
  // a white outlined circle on the floor straight under the ball (not the sun's shadow map, which is offset by the light angle)
  const ballShadow = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.235, 48),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })
  );
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.renderOrder = 2;
  ballShadow.castShadow = ballShadow.receiveShadow = false;
  ballShadow.visible = false;
  scene.add(ballShadow);
  // powered balls glow and light up the players around them
  const ballGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })
  );
  ballGlow.renderOrder = 3;
  scene.add(ballGlow);
  const ballLight = new THREE.PointLight('#ffffff', 0, 4.5, 2);
  scene.add(ballLight);
  // laning (spec §2.24): the hitter's projected direction (an arrow) and the block's read channel (a fan), flat on the floor
  const laneMesh = n => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const me = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    me.renderOrder = 2;
    me.frustumCulled = false;
    me.visible = false;
    scene.add(me);
    return me;
  };
  const laneArrow = laneMesh(9),
    laneFan = laneMesh(3);
  // whose is whose: a sword over the attack arrow, a shield over the block's fan (white glyph, tinted by team colour)
  const glyph = draw =>
    canvasTex(128, 128, (g, w) => {
      g.lineJoin = 'round';
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(0,0,0,.75)';
      g.fillStyle = '#fff';
      g.beginPath();
      draw(g, w);
      g.stroke();
      g.fill();
    });
  const swordTex = glyph(g => {
      g.moveTo(64, 8); // blade tip
      g.lineTo(74, 22);
      g.lineTo(74, 78);
      g.lineTo(96, 78); // crossguard
      g.lineTo(96, 90);
      g.lineTo(71, 90);
      g.lineTo(71, 108); // grip
      g.arc(64, 112, 9, 0, Math.PI); // pommel
      g.lineTo(57, 90);
      g.lineTo(32, 90);
      g.lineTo(32, 78);
      g.lineTo(54, 78);
      g.lineTo(54, 22);
      g.closePath();
    }),
    shieldTex = glyph(g => {
      g.moveTo(64, 10);
      g.quadraticCurveTo(88, 22, 108, 20);
      g.quadraticCurveTo(110, 82, 64, 118);
      g.quadraticCurveTo(18, 82, 20, 20);
      g.quadraticCurveTo(40, 22, 64, 10);
      g.closePath();
    });
  const laneIcon = tex => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.scale.setScalar(0.9);
    sp.renderOrder = 4;
    sp.visible = false;
    scene.add(sp);
    return sp;
  };
  const laneSword = laneIcon(swordTex),
    laneShield = laneIcon(shieldTex);
  return {
    laneArrow,
    laneFan,
    laneSword,
    laneShield,
    hemi,
    sun,
    rim,
    floor,
    outer,
    board,
    stands,
    ball,
    ballShadow,
    ballGlow,
    ballLight,
    boardCanvas,
    boardTex,
    net,
    netGeo,
    netRest,
    ptHalf,
    ptMat,
    ringTex,
    dashTex,
    glowTex,
    flatRing
  };
}

/** Per match: the LED board in the two teams' colours (the crowd is dressed by venue3d.mjs). */
export function dressArena(w, t0c, t1c) {
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
  g.fillText('SPITE & SPIKE', bw / 2, bh * 0.68);
  w.boardTex.needsUpdate = true;
}

/** The net ripples after a hard hit into it (A.netShake). */
export function updateNet(w, now) {
  const ns = A.netShake || 0,
    arr = w.netGeo.attributes.position.array,
    rest = w.netRest;
  for (let i = 0; i < arr.length; i += 3)
    arr[i + 2] = rest[i + 2] + (ns ? Math.sin(now * 0.05 + rest[i] * 3) * ns * 0.12 * (0.5 + 0.5 * Math.sin(rest[i + 1] * 3)) : 0);
  w.netGeo.attributes.position.needsUpdate = true;
}

/** Point flash: the scorer's half glows in their colour. */
export function updatePointFlash(w) {
  if (A.ptFlash) {
    w.ptHalf.position.x = A.ptFlash.side === 0 ? -210 * KX : 210 * KX;
    w.ptMat.color.set(A.m.t[A.ptFlash.side].color);
    w.ptMat.opacity = A.ptFlash.life * 0.4;
  } else w.ptMat.opacity = 0;
}

const prevBall = new THREE.Vector3(),
  mv = new THREE.Vector3(),
  ballAxis = new THREE.Vector3(0, 0, 1),
  ORIGIN = new THREE.Vector3(),
  sqAx = new THREE.Vector3(),
  sqM = new THREE.Matrix4(),
  WHITE = new THREE.Color('#ffffff');
/**
 * The ball's squash / smear (A.bsq, set by effects.js ballHit; shape from ballSquash): a scale of ax along the axis and cr
 * across it, in world space — along the hit while it is flattened, then along the ball's own motion this frame (ballDir).
 * Returns the smear (0 = none) so the stripes can wash out with it.
 */
function ballShape(ball) {
  const q = A.bsq,
    s = q && VFX.squash.on ? ballSquash(q.k, q.t, VFX.squash, q.fl) : null;
  if (!s || (Math.abs(s.ax - 1) < 0.004 && Math.abs(s.cr - 1) < 0.004)) {
    ball.userData.sq = null;
    return 0;
  }
  if (s.ax < 1 && q.dir) sqAx.set(q.dir.x * KX, q.dir.h * KH, -q.dir.z * KZ);
  else sqAx.copy(ballDir);
  if (sqAx.lengthSq() < 1e-9) sqAx.copy(ballDir);
  sqAx.normalize();
  const a = s.ax - s.cr,
    { x, y, z } = sqAx;
  // D = cr·I + (ax − cr)·a·aᵀ
  sqM.set(
    s.cr + a * x * x,
    a * x * y,
    a * x * z,
    0,
    a * y * x,
    s.cr + a * y * y,
    a * y * z,
    0,
    a * z * x,
    a * z * y,
    s.cr + a * z * z,
    0,
    0,
    0,
    0,
    1
  );
  ball.userData.sq = sqM;
  return s.smear || 0;
}
/** Direction the ball last moved in (world space; for directional effects). */
export const ballDir = new THREE.Vector3(1, 0, 0);
/** The floor marker under the ball: follows it, widens and fades as it rises (uses the ball's final position). */
export function updateBallShadow(w) {
  const s = w.ballShadow;
  s.visible = w.ball.visible;
  if (!s.visible) return;
  const h = Math.min(w.ball.position.y, 8);
  s.position.set(w.ball.position.x, 0.012, w.ball.position.z);
  s.scale.setScalar(1 + h * 0.12);
  s.material.opacity = Math.max(0.35, 0.95 - h * 0.07);
}
/** Ball: position, spin, squash, element / power emissive; glow sprite and point light on powered shots. */
export function updateBall(w, now) {
  const B = A.ball,
    ball = w.ball;
  ball.visible = !!B.vis;
  if (B.vis) {
    prevBall.copy(ball.position);
    Wto(ball.position, B.x, B.z, B.h);
    ball.position.y = Math.max(0.16, ball.position.y);
    mv.subVectors(ball.position, prevBall);
    if (mv.lengthSq() > 1e-6) {
      ballAxis.set(mv.z, 0, -mv.x).normalize();
      ballDir.copy(mv).normalize();
    }
    ball.setRotationFromAxisAngle(ballAxis, A.spin || 0);
    const sq = A.squash || 0;
    ball.scale.set(1 + 0.35 * sq, 1 - 0.42 * sq, 1 + 0.35 * sq);
    const hot = (A.trailPow || 0) >= 100,
      sm = ballShape(ball),
      wash = Math.min(1, sm / 1.6) * VFX.squash.fade; // a smeared ball: the stripes wash out, a bright streak (no broken seams)
    ball.material.emissive.set(hot ? '#ff3d7f' : A.trailEl ? ECOL[A.trailEl] : '#000000');
    ball.material.emissiveIntensity = hot ? 0.6 : A.trailPow ? 0.35 : 0;
    if (wash > 0.01) {
      ball.material.emissive.lerp(WHITE, wash);
      ball.material.emissiveIntensity = Math.max(ball.material.emissiveIntensity, 0.9 * wash);
    }
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
}

const lp0 = new THREE.Vector3(),
  lp1 = new THREE.Vector3(),
  ld = new THREE.Vector3(),
  ln = new THREE.Vector3(),
  lh = new THREE.Vector3();
/** Laning (spec §2.24): A.lane (act `lane`) → the attack arrow (hitter → aimed channel) and the block's read fan, fading with its life. */
export function updateLane(w) {
  const L = A.lane,
    ar = w.laneArrow,
    fan = w.laneFan,
    sw = w.laneSword,
    sh = w.laneShield;
  ar.visible = fan.visible = sw.visible = sh.visible = !!L;
  if (!L) return;
  const op = Math.min(1, (1 - L.life) * 8) * Math.min(1, L.life * 3),
    y = 0.02;
  // the arrow: a shaft and a head, from the hitter's take-off spot to the channel's landing area
  Wto(lp0, L.x0, L.z0, 0);
  Wto(lp1, L.x1, L.z1, 0);
  ld.subVectors(lp1, lp0).setY(0).normalize();
  ln.set(-ld.z, 0, ld.x);
  const hw = 0.12,
    hhw = 0.4,
    hl = 0.8;
  lh.copy(lp1).addScaledVector(ld, -hl);
  const a = ar.geometry.attributes.position,
    put = (i, v, n, k) => a.setXYZ(i, v.x + n.x * k, y, v.z + n.z * k);
  put(0, lp0, ln, hw);
  put(1, lp0, ln, -hw);
  put(2, lh, ln, -hw);
  put(3, lp0, ln, hw);
  put(4, lh, ln, -hw);
  put(5, lh, ln, hw);
  put(6, lh, ln, hhw);
  put(7, lh, ln, -hhw);
  put(8, lp1, ln, 0);
  a.needsUpdate = true;
  ar.material.color.set(L.col || '#ffffff');
  ar.material.opacity = 0.8 * op;
  // the sword hovers over the arrow, 60 % of the way to its head
  sw.position.copy(lp0).lerp(lp1, 0.6).setY(0.45);
  sw.material.color.set(L.col || '#ffffff');
  sw.material.opacity = op;
  // the fan: from the block at the net to the channel it read (none when there was no real block)
  fan.visible = sh.visible = L.bz != null;
  if (!fan.visible) return;
  const f = fan.geometry.attributes.position,
    zNet = L.z0 + (L.bz - L.z0) * 0.2,
    set = (i, x, z) => {
      Wto(lp0, x, z, 0);
      f.setXYZ(i, lp0.x, y - 0.004, lp0.z);
    };
  set(0, 500, zNet);
  set(1, L.x1, Math.max(0, L.bz - 0.14));
  set(2, L.x1, Math.min(1, L.bz + 0.14));
  f.needsUpdate = true;
  fan.material.color.set(L.bcol || '#ffffff');
  fan.material.opacity = 0.28 * op;
  // the shield hovers over the fan's middle (the centroid of its three corners)
  sh.position.set((f.getX(0) + f.getX(1) + f.getX(2)) / 3, 0.45, (f.getZ(0) + f.getZ(1) + f.getZ(2)) / 3);
  sh.material.color.set(L.bcol || '#ffffff');
  sh.material.opacity = op;
}
