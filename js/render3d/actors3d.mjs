// Players and coaches on court: locomotion measured from court movement, facing and head tracking, reaching for the
// ball at contacts, hand / eye light trails, auras, floor rings (zone, captain's buff) and particles; coaches on the
// sideline; dressing everyone for a match.
import * as THREE from 'three';
import { applyPose, smoothBones, torsoDir, bendArm, groundSnap, setFace, updateVrm, dress, undress, mirror } from './players3d.mjs';
import { poseDone, playerPose, coachPose, gaitNow } from './poses3d.mjs';
import { celeMs } from './poses3d-cele.mjs';
import { KH, KX, KZ, W } from './units3d.mjs';
import { cam, povFadeId } from './camera3d.mjs';
import { footIK, armIK } from './ik3d.mjs';
import { turnLag, landSpring, headSteady } from './secondary3d.mjs';

const tmp = new THREE.Vector3(),
  tmp2 = new THREE.Vector3();
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

function moodOf(d) {
  const p = d.p,
    staV = (A.staShown || {})[p.id],
    m0 = A.cele ? (d.side === A.cele.w ? 1 : -0.8) : (A.moodShown || {})[p.id] || 0;
  if (d.pose === 'roar' || d.pose === 'cele') return 1;
  if (d.pose === 'slump' && !A.cele) return -0.8;
  if (staV != null && staV < 0.3 && m0 < 0.6 && !A.cele) return Math.min(m0, -0.3);
  return m0;
}
/**
 * Stride by distance left to run (m): at `near` or closer small steps, from `far` full strides. Gait cycle (m, two steps)
 * = c0 + c1 × run share, each lerped short → long; the leg swing scales the same way (poses3d locoPose, m.far).
 */
const STRIDE = { near: 1, far: 5, c0: [0.8, 1.25], c1: [0.5, 1.6] };
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
  // eased: quick to speed up, quicker to stop (a body that has stopped kept its walking legs going for a third of a second:
  // feet stepping in place); m.now: the speed right now (lightly eased), what foot planting asks for "standing"
  const inst = dist / dt,
    k = 1 - Math.exp(-dt * (inst < m.speed ? 35 : 9)),
    fx = Math.sin(face),
    fz = Math.cos(face);
  m.vx += (dx / dt - (m.vx || 0)) * k;
  m.vz += (dz / dt - (m.vz || 0)) * k;
  const vf = (dx * fx + dz * fz) / dt,
    vl = (dx * fz - dz * fx) / dt; // + = to the player's left
  m.fwd += (vf - m.fwd) * k;
  m.lat += (vl - m.lat) * k;
  m.speed = Math.hypot(m.fwd, m.lat);
  m.now = (m.now || 0) + (inst - (m.now || 0)) * (1 - Math.exp(-dt * 30));
  // how far there is still to go (owner, 2026-10-08): a long run takes long strides, the last metre or two small quick steps
  const d = pl.d,
    rem = d ? Math.hypot((d.tx - d.x) * KX, (d.tz - d.z) * KZ) : 0;
  m.far = (m.far || 0) + (clamp((rem - STRIDE.near) / (STRIDE.far - STRIDE.near), 0, 1) - (m.far || 0)) * k;
  const r = clamp((m.speed - 1.2) / 2.3, 0, 1),
    g = m.far,
    cycle = STRIDE.c0[0] + (STRIDE.c0[1] - STRIDE.c0[0]) * g + (STRIDE.c1[0] + (STRIDE.c1[1] - STRIDE.c1[0]) * g) * r; // metres per full gait cycle (two steps)
  // the gait weights, eased (poses3d gaitW): a turn swaps fwd and lat within a few frames and flicked the legs between gaits
  const gn = gaitNow(m),
    gw = m.gw || (m.gw = { ...gn }),
    kg = 1 - Math.exp(-dt * 7);
  gw.side += (gn.side - gw.side) * kg;
  gw.back += (gn.back - gw.back) * kg;
  m.phase += ((dist * (1 + 0.6 * gw.side)) / cycle) * Math.PI * 2; // a shuffle steps quicker (blended like the gait)
  return m;
}
/**
 * Point celebrations (owner, 2026-10-09; poses3d-cele.mjs). The engine's 'roar' leaves a pending d.cele (acts.js); it starts
 * only once the player is properly down (feet on the floor, the landing absorbed, the swing finished) and ends early if
 * the player is sent somewhere. The move: by personality, bigger on a big point (a dramatic kill, a 3+ streak, Fever);
 * the jump-spin at most once per 4 points. The nearest teammate high-fives, the others clap (always on a big point).
 */
const CELE = {
  small: { hot: 'fist', cool: 'point', cocky: 'taunt', shy: 'hop', leader: 'sky' },
  big: { hot: 'siu', cool: 'sky', cocky: 'siu', shy: 'fist', leader: 'siu' }
};
function celeStep(d, dt) {
  const c = d.cele;
  if (!c) return;
  const away = Math.hypot((d.tx - d.x) * KX, (d.tz - d.z) * KZ) > 0.6; // sent somewhere: the moment is over
  if (c.t < 0) {
    c.wait = (c.wait || 0) + dt * 1000;
    if (c.wait > 2500 || away || A.cele) return void (d.cele = null);
    const down = d.jy <= 1 && !d.jmode && (d.landMs == null || d.landMs > 300) && (poseDone(d) || d.pose === 'ready' || d.pose === 'walk');
    if (down) celeStart(d);
    return;
  }
  c.t += dt * 1000;
  if (c.t >= celeMs(c.kind) || (away && c.t > 150) || A.cele) {
    d.cele = null;
    d.celeYaw = 0;
    if (d.pose === 'cele') d.pose = 'ready';
  }
}
function celeStart(d) {
  const p = d.p,
    n = A.pointN || 0,
    h = typeof mlineHash === 'function' ? mlineHash(`cele|${p.id}|${n}`) : p.num + n;
  let pt = null;
  for (let i = Math.max(0, A.bi - 3); i < Math.min(A.beats ? A.beats.length : 0, A.bi + 4) && !pt; i++)
    pt = A.beats[i].acts.find(x => x.k === 'point');
  const big = !!(pt && (pt.big || pt.streak >= 3)) || (typeof Dir !== 'undefined' && Dir.stageOf(d.side) === 'fever'),
    pers = typeof persOf === 'function' ? persOf(p) : 'hot';
  let kind = (big ? CELE.big : CELE.small)[pers] || 'fist';
  if (!big && h % 4 === 0) kind = 'fist'; // everyone's everyday "Yes!" now and then
  if (kind === 'siu' && n - (A.lastSiu ?? -99) < 4) kind = 'sky';
  if (kind === 'siu') A.lastSiu = n;
  d.cele = { kind, t: 0, alt: h % 2, mir: d.side === 0 ? -1 : 1 };
  d.pose = 'cele';
  // teammates on their feet join in: the nearest (within 3.5 m) turns and high-fives, the others clap
  const face = d.side === 0 ? Math.PI / 2 : -Math.PI / 2,
    mates = Object.values(A.disp)
      .filter(
        q => q !== d && q.side === d.side && !q.cele && q.jy <= 1 && !q.jmode && (poseDone(q) || q.pose === 'ready' || q.pose === 'walk')
      )
      .map(q => ({ q, m: Math.hypot((q.x - d.x) * KX, (q.z - d.z) * KZ) }))
      .sort((a, b) => a.m - b.m);
  mates.forEach(({ q, m }, i) => {
    if (i === 0 && m <= 3.5) {
      const yaw0 = wrap(Math.atan2((d.x - q.x) * KX, (q.z - d.z) * KZ) - face);
      q.cele = { kind: 'five', t: 0, yaw0, mir: 1 };
    } else if (big || (h >> (i + 1)) % 2) q.cele = { kind: 'clap', t: 0, mir: 1 };
    else return;
    q.pose = 'cele';
  });
}
const AURA = ['hips', 'chest', 'head', 'leftHand', 'rightHand', 'leftLowerLeg', 'rightLowerLeg', 'leftUpperArm', 'rightUpperArm'];

/** Pose one player for this frame (dt on the world clock). fx: the particle system. */
export function posePlayer(pl, dt, ballPos, fx) {
  const d = pl.d,
    face = d.side === 0 ? Math.PI / 2 : -Math.PI / 2,
    root = pl.root;
  const pos = W(d.x, d.z, 0);
  // gait is measured against where the body actually faces, so a player turned to run forward runs, not backpedals
  const mot = motion(pl, pos, face + pl.yawOff, dt);
  celeStep(d, dt);
  const pose = playerPose(d, moodOf(d), mot);
  root.position.copy(pos);
  steer(pl, d, pos, face, mot, ballPos, dt);
  root.rotation.set(0, face + pl.yawOff + (d.celeYaw || 0), 0);
  if (pose.slide) root.position.add(tmp.set(Math.sin(face + pl.yawOff), 0, Math.cos(face + pl.yawOff)).multiplyScalar(pose.slide));
  // weight shift: the hips over the foot that carries the weight (the gait's sway, metres to the player's left)
  if (pose.sway && VFX.sec.on)
    root.position.add(tmp.set(Math.cos(face + pl.yawOff), 0, -Math.sin(face + pl.yawOff)).multiplyScalar(pose.sway * VFX.sec.sway));
  turnLag(pl, d, pose, mot); // secondary motion (secondary3d.mjs)
  const sink = landSpring(pl, d, pose, dt);
  // head follows the ball
  if (A.ball.vis && !pose.lying) {
    root.updateMatrixWorld(true);
    const loc = root.worldToLocal(tmp.copy(ballPos)),
      headY = (1.62 / 1.8) * pl.headY;
    const yaw = clamp(Math.atan2(loc.x, Math.max(0.2, loc.z)), -0.9, 0.9),
      pitch = clamp(-Math.atan2(loc.y - headY, Math.hypot(loc.x, loc.z)), -0.8, 0.45);
    const eye = d.pose === 'block' ? 1 : 0.7; // a blocker's eyes stay locked on the ball
    pose.hy = (pose.hy || 0) + yaw * eye;
    pose.hd = (pose.hd || 0) * (1 - eye * 0.5) + pitch * (eye * 0.85);
  }
  root.position.y = (d.jy || 0) * KH;
  applyPose(pl, pose);
  reachForBall(pl, d, pose, ballPos);
  const fast = ((d.pose === 'spike' || d.pose === 'serve') && d.spk != null) || d.pose === 'dive';
  smoothBones(pl, dt, fast ? 45 : mot.speed > 1 ? 26 : 16);
  groundSnap(pl, (d.jy || 0) * KH + (pose.lift || 0), pose.lying);
  if (sink && VFX.ik.feet) root.position.y -= sink; // landing: the hips settle, the foot IK bends the knees for it
  footIK(pl, d, pose, dt); // feet planted on the floor (ik3d.mjs)
  // hands / forearms on the ball (ik3d.mjs): one hand for spikes, serves, dives and a one-hand block, else both
  const bh = blockHand(pl, d);
  armIK(pl, d, pose, bh || (pose.hand ? pose.hand : ['spike', 'serve', 'dive'].includes(d.pose) ? 'right' : 'both'), dt);
  headSteady(pl, d, pose, ballPos, mot); // running: the head level and on the ball
  pl.lastPose = pose; // (the Animation lab and the QA hooks read it)
  if (A.animLab) {
    // the Animation lab keeps it (anim3d animCapture)
    pl.lastLift = (d.jy || 0) * KH + (pose.lift || 0);
  }
  setFace(pl, pose.face || {}, dt);
  updateVrm(pl, dt);
  lightTrails(pl, d, root, dt);
  glow(pl, d, pos, dt, fx);
  foundation(pl, d, mot, pos, dt, fx);
}

/**
 * Foundation effects for every player (VFX.found, owner 2026-10-07 — whatever their stats): dust at takeoff and landing (by the
 * jump's height), sprint dust off alternate feet, a dive's skid, a tired player's breath. Display only, Math.random only.
 */
const FND_UP = 4, // jy (court h units) above which a player is airborne
  SPRINT = 3.2; // m/s
function foundation(pl, d, mot, pos, dt, fx) {
  if (!fx || !fx.dust || A.shot || dt <= 0) return;
  const F = VFX.found,
    s = pl.fnd || (pl.fnd = { air: false, peak: 0, step: 0, foot: 0, br: Math.random() }),
    jy = d.jy || 0,
    air = jy > FND_UP;
  if (air) s.peak = Math.max(s.peak, jy);
  if (air && !s.air && d.pose !== 'dive') fx.dust(pos, 0.7 * F.jump); // takeoff
  if (!air && s.air) {
    fx.dust(pos, clamp(s.peak / 90, 0.4, 1.4) * F.jump); // landing: the higher the jump, the bigger the cloud
    s.peak = 0;
  }
  s.air = air;
  if (!air && d.pose !== 'dive' && mot.speed > SPRINT && (s.step -= dt) <= 0) {
    s.step = 0.16;
    s.foot ^= 1;
    fx.dust(pl.bone(s.foot ? 'leftFoot' : 'rightFoot').getWorldPosition(tmp2), 0.3 * F.run);
  }
  if (d.pose === 'dive' && !air && mot.speed > 1 && (s.step -= dt) <= 0) {
    s.step = 0.05;
    fx.skid(pl.bone('hips').getWorldPosition(tmp2), tmp.set(mot.vx, 0, mot.vz).normalize(), F.dive);
  }
  const sta = (A.staShown || {})[d.p.id];
  if (sta != null && sta < 0.3 && !air && mot.speed < 1 && (s.br -= dt) <= 0) {
    s.br = 1.3 + Math.random() * 0.6;
    const head = pl.bone('head').getWorldPosition(tmp2),
      fwd = tmp.set(Math.sin(pl.root.rotation.y), 0, Math.cos(pl.root.rotation.y));
    fx.breath(head.addScaledVector(fwd, 0.12).setY(head.y - 0.05), fwd, F.breath);
  }
}

/**
 * Running far and fast, on the ground, not blocking or setting (left: metres still to go; along a back-row curve, what is
 * left of the curve). A hitter's short retreat to the run-up point stays a backpedal.
 */
const longRun = (d, mot, left) =>
  mot.speed > 2.2 &&
  (d.curve ? d.curve.len - d.curve.s : left) > 2 &&
  d.jy <= 2 &&
  d.pose !== 'block' &&
  d.pose !== 'set' &&
  !(d.app && !d.curve);
/** Body yaw (pl.yawOff, relative to facing the net): toward a dive, the way you run, the coach in a huddle, or the ball. */
function steer(pl, d, pos, face, mot, ballPos, dt) {
  const side = d.side,
    toward = (x, z) => wrap(Math.atan2(x, z) - face);
  const left = tmp2
      .copy(W(d.tx, d.tz, 0))
      .sub(pos)
      .setY(0)
      .length(),
    free = !d.pose || d.pose === 'ready' || d.pose === 'huddle' || d.pose === 'preserve' || poseDone(d);
  let want = 0,
    rate = 6;
  if (d.pose === 'bump' && d.bb && !poseDone(d) && (d.swing == null || d.swing < 520)) {
    // back bump (playback backBumpLook): turned away from the net — run back, bump it over the head; turns round after
    want = Math.PI;
    rate = 10;
  } else if (d.pose === 'dive' && d.dv && !poseDone(d) && Math.hypot(d.dv.dx * KX, d.dv.dz * KZ) > 0.4) {
    // dive: the whole body turns to where it launches
    want = toward(d.dv.dx * KX, -d.dv.dz * KZ);
    rate = 14;
  } else if (longRun(d, mot, left) && Math.abs(toward(mot.vx, mot.vz)) > 0.8) {
    // a long run that isn't forward (back, or across): turn and run, don't backpedal or shuffle (owner, 2026-10-08)
    want = toward(mot.vx, mot.vz);
    rate = 8;
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
    want = clamp(toward(ballPos.x - pos.x, ballPos.z - pos.z), -0.7, 0.7) * 0.8;
  }
  // a critically damped spring (not a plain ease): a turn speeds up and slows down instead of starting at full speed, which
  // kicked the body round in one frame and dragged the planted feet with it
  const w = rate * 1.6,
    h = Math.min(dt, 0.05);
  pl.yawV = (pl.yawV || 0) + (w * w * wrap(want - pl.yawOff) - 2 * w * (pl.yawV || 0)) * h;
  pl.yawOff = wrap(pl.yawOff + pl.yawV * h);
}

const hLw = new THREE.Vector3(),
  hRw = new THREE.Vector3();
/** The block hand the ball is sent to ('left' | 'right'; null when not a one-hand block): the hand on the engine's hz side. */
function blockHand(pl, d) {
  const t = A.handTouch || A.handLast;
  if (d.pose !== 'block' || !t || t.c !== 'block' || !t.hz || t.p !== d.p.id) return null;
  pl.bone('leftHand').getWorldPosition(hLw);
  pl.bone('rightHand').getWorldPosition(hRw);
  return (hRw.z - hLw.z) * -t.hz > 0 ? 'right' : 'left'; // world z = (0.5 − court z) × KZ
}
/** Contacts: the hands reach for the ball (hitting arm for spike / serve / dive, both arms otherwise). */
function reachForBall(pl, d, pose, ballPos) {
  const root = pl.root;
  const w = pose.contact || 0;
  // spike take-off: the non-hitting arm points straight at the ball
  if (pose.aimL > 0.01 && A.ball.vis && w <= 0.01) {
    root.updateMatrixWorld(true);
    pose.al = bendArm(pose.al, torsoDir(pl, ballPos, 'left').dir, pose.aimL);
    applyPose(pl, pose);
  }
  if (w > 0.01 && A.ball.vis && !VFX.ik.arms) {
    // (with VFX.ik.arms the hands go to the ball by IK after the grounding instead: armIK)
    root.updateMatrixWorld(true);
    // one hand for spikes, serves and dives; a pose may say which (pose.hand: 'left' | 'right' | 'both');
    // a block the ball meets on one hand (the engine's hz, r3d handTouch): only that arm reaches, the other stays up
    const bh = blockHand(pl, d),
      both = bh ? false : pose.hand ? pose.hand === 'both' : d.pose !== 'spike' && d.pose !== 'serve' && d.pose !== 'dive',
      side = bh || (pose.hand === 'left' ? 'left' : 'right');
    const t = torsoDir(pl, ballPos, both ? 'both' : side);
    const reach = both ? (d.pose === 'bump' || d.pose === 'dive' ? 1.25 : 1.1) : 1.0;
    const k = w * clamp((reach * 1.4 - t.dist) / (reach * 0.5), 0, 1);
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
        pose.ar = bendArm(pose.ar || mirror(pose.al), dr, k * 0.85, d.pose === 'set' || d.pose === 'block');
      } else if (side === 'left') pose.al = bendArm(pose.al, t.dir, k * 0.9, true);
      else pose.ar = bendArm(pose.ar || mirror(pose.al), t.dir, k * (d.pose === 'dive' ? 0.75 : 0.9), true);
      applyPose(pl, pose);
    }
  }
}

/** Hand trails (stars thin, OP wide, element colour on a full gauge) and eye streaks (Fever). */
function lightTrails(pl, d, root, dt) {
  const side = d.side;
  const tier = d.p.op ? 2 : d.p.star ? 1 : 0,
    zk = Dir.aura(side) === 'full' ? 1.25 : 1, // Fever (the old zone look; spec §2.15 aura)
    charged = !!(d.p.elOn && (A.egShown || {})[d.p.id] >= EG.full), // full element gauge: trails turn the element colour
    ink = G.trail === 'ink', // ⚙ Trails: Ink — a wider, longer black brush stroke burning crimson (or the element colour)
    o =
      tier || charged
        ? {
            width: Math.max(tier === 2 ? 0.12 : tier ? 0.065 : 0, charged ? 0.1 : 0) * zk * (ink ? 1.7 : 1) * VFX.hand.width,
            life: (tier === 2 || charged ? 0.34 : 0.2) * zk * (ink ? 1.4 : 1) * VFX.hand.life,
            alpha: charged ? 0.9 : tier === 2 ? 0.8 : 0.7,
            color: charged ? ECOL[d.p.el] : ink ? VFX.hand.ink : pl.trailCol,
            style: ink ? 'ink' : ''
          }
        : { width: 0 },
    hands = ['leftHand', 'rightHand'];
  for (let i = 0; i < 2; i++) pl.trails[i].update(pl.bone(hands[i]).getWorldPosition(tmp2), dt, cam, o);
  // eyes (Kuroko's zone): a thin streak of light from each eye that flows back behind the head, in the eye colour —
  // only while the team is in Fever (spec §2.15; the director off: in the zone or with a captain's buff, as before)
  const eyesOn = zk > 1 || (!Dir.on() && !!(A.buffShown && A.buffShown[d.p.id])),
    head = pl.bone('head'),
    fwd = tmp.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)),
    eo = eyesOn
      ? {
          width: tier === 2 ? 0.032 : tier ? 0.026 : 0.022,
          life: 0.42,
          alpha: 1,
          color: pl.eyeCol,
          drift: (pl.eyeDrift || (pl.eyeDrift = new THREE.Vector3())).copy(fwd).multiplyScalar(-1.1).setY(0.12) // reused per player
        }
      : { width: 0 };
  for (let i = 0; i < 2; i++) {
    const eb = pl.bone(i ? 'rightEye' : 'leftEye'),
      ep = eb ? eb.getWorldPosition(tmp2) : head.localToWorld(tmp2.set(i ? -0.032 : 0.032, 0.065, 0.078));
    pl.eyeTrails[i].update(ep, dt, cam, eo);
  }
}

/** Aura sprite, OP lightning arcs, element motes, and the zone / captain's-buff floor rings. */
function glow(pl, d, pos, dt, fx) {
  const root = pl.root,
    side = d.side;
  const air = d.jy > 12 || d.pose === 'spike' || d.pose === 'block' || d.pose === 'serve';
  pl.aura.position.set(root.position.x, root.position.y + 1.1, root.position.z);
  const full = !!(d.p.elOn && (A.egShown || {})[d.p.id] >= EG.full),
    look = Dir.aura(side), // the team's stage (spec §2.15): Loose a grey haze, Focused faint, Fever full
    own = full ? (air ? 0.65 : 0.4) : d.p.op ? (air ? 0.55 : 0.22) : d.p.star && air ? 0.35 : 0,
    targ = Math.max(own, look === 'full' ? 0.3 : look === 'faint' ? 0.14 : look === 'haze' ? 0.18 : 0);
  pl.aura.material.color.set(full ? ECOL[d.p.el] : d.p.op ? '#ff2846' : look === 'haze' && !own ? '#8b9099' : d.p.team.color);
  pl.aura.material.opacity += (targ - pl.aura.material.opacity) * (1 - Math.exp(-dt * 8));
  const elc = d.p.elOn ? ECOL[d.p.el] : null, // unlocked element: the aura takes its colour
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
  if (!A.shot && (chg || (air && (d.p.op || d.p.star)) || (look === 'full' && Math.random() < 0.35)))
    if (Math.random() < dt * (air || chg ? 30 : 8))
      fx.mote(
        pl.bone(AURA[(Math.random() * AURA.length) | 0]).getWorldPosition(new THREE.Vector3()),
        d.p.op && !chg ? '#ff2846' : col,
        elc ? '#ffffff' : null
      );
  const zone = look === 'full',
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

/** A coach on the sideline: pose from their reaction; hops when celebrating. */
export function poseCoach(pl, dt, now) {
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
  updateVrm(pl, dt);
}

/** Loaded .vrm models keep their own colours (no kit / hair / skin / eye tint) when on. */
let keepColors = false;
export const setKeepColors = on => (keepColors = !!on);

/** Dress one figure as display entry d: team kit, look, height, aura and trail colours; reset its per-player state. */
function dressFigure(pl, d) {
  const p = d.p,
    team = p.team || A.m.t[d.side];
  // (Main_v2 keeps its own colours: no kit / hair / skin / eye tint)
  if (pl.own) {
    // kept as modelled
  } else if (keepColors && pl.model) undress(pl.vrm);
  else dress(pl.vrm, { shirt: team.color, shorts: '#1b2150', hair: p.hair, skin: p.look.skin, eyes: p.look.eyeC, shoes: '#ffffff' });
  // height: the model's own, not the role's (look.hgt) — base / Main_v2 are normalised to 1.8 m, a loaded .vrm keeps its exported size.
  // Jump height (root.position.y = jy × KH, metres) does not depend on the scale, so jumps and blocks reach the same height.
  pl.root.scale.setScalar((pl.scale = pl.model && pl.model !== 'main' ? 1 : 1.8 / pl.headY));
  pl.aura.material.color.set(p.op ? '#ff2846' : team.color);
  pl.zone.material.color.set(team.color);
  // hand trails in the player's hair colour, a touch brighter
  pl.trailCol = '#' + new THREE.Color(p.hair || '#ffffff').offsetHSL(0, 0.15, 0.12).getHexString();
  pl.eyeCol = '#' + new THREE.Color(p.look.eyeC || '#4cc9f0').offsetHSL(0, 0.2, 0.18).getHexString();
  for (const t of [...pl.trails, ...pl.eyeTrails]) t.clear();
  pl.prev.clear();
  Object.assign(pl, { yawOff: 0, yawV: 0, mot: null });
  if (pl.fadeMats) {
    // a figure reused for the next match starts fully visible
    pl.fade = 1;
    pl.fadeVis = true;
    for (const m of pl.fadeMats) m.opacity = m.userData.op0;
    for (const o of pl.fadeMeshes) o.visible = true;
  }
}
/**
 * POV: hide the head of the figure playing `id` (the camera sits at its eyes): face, eyes, hair and anything on the head. The arms
 * and body stay. `null` shows every head again. Cheap enough to call every frame (it only touches a figure whose state changed).
 */
const HEAD = /^(Face|Hair)|FACE|HAIR|EYE|Accessor|Hat|Glass|Ear/;
export function setPovHidden(w, id) {
  for (const pl of w.people) {
    const hide = id != null && !!pl.d && pl.root.visible && pl.d.p.id === id;
    if (pl.povHidden === hide) continue;
    pl.povHidden = hide;
    if (!pl.headMeshes) {
      pl.headMeshes = [];
      pl.vrm.scene.traverse(o => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (HEAD.test(o.name) || (o.parent && /^Face/.test(o.parent.name)) || mats.every(m => HEAD.test(m.name || '')))
          pl.headMeshes.push(o);
      });
    }
    for (const o of pl.headMeshes) o.visible = !hide;
  }
  povFade(w, id != null ? id : povFadeId());
}
/**
 * POV: any other figure whose body (a capsule from hips to head, radius `rad`) is within `dist` of the camera fades out
 * (opacity → 0 over ~`tau` s, then not drawn at all) and comes back when the camera moves away or POV ends. Called every
 * frame from setPovHidden: it caches the figure's materials once and allocates nothing per frame.
 */
const FADE = { dist: 0.9, rad: 0.35, tau: 0.1 },
  fa = new THREE.Vector3(),
  fb = new THREE.Vector3();
/** Distance from the camera to the figure's hips–head segment (m); the capsule surface is this minus FADE.rad. */
function bodyDist(pl) {
  pl.bone('hips').getWorldPosition(fa);
  pl.bone('head').getWorldPosition(fb);
  const c = cam.position,
    abx = fb.x - fa.x,
    aby = fb.y - fa.y,
    abz = fb.z - fa.z,
    t = clamp(((c.x - fa.x) * abx + (c.y - fa.y) * aby + (c.z - fa.z) * abz) / (abx * abx + aby * aby + abz * abz || 1), 0, 1);
  return Math.hypot(c.x - (fa.x + abx * t), c.y - (fa.y + aby * t), c.z - (fa.z + abz * t));
}
function povFade(w, id) {
  const dt = clamp(((A && A.rdt) || 16) / 1000, 0.004, 0.1), // this frame's real time (set by step())
    k1 = 1 - Math.exp(-dt / FADE.tau);
  for (const pl of w.people) {
    if (!pl.d || !pl.root.visible) continue;
    const near = id != null && pl.d.p.id !== id && bodyDist(pl) - FADE.rad < FADE.dist,
      f = pl.fade ?? 1;
    if (!near && f === 1) continue;
    const nf = near ? Math.max(0, f - k1 * 1.6) : Math.min(1, f + k1 * 1.6);
    if (nf === f && pl.fadeVis === nf > 0.02) continue;
    if (!pl.fadeMats) {
      pl.fadeMats = [];
      pl.fadeMeshes = [];
      pl.vrm.scene.traverse(o => {
        if (!o.isMesh) return;
        pl.fadeMeshes.push(o);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!pl.fadeMats.includes(m)) pl.fadeMats.push(m);
      });
      pl.fadeMats.forEach(m => (m.userData.op0 = m.opacity));
    }
    pl.fade = nf;
    const vis = nf > 0.02,
      crossing = (f === 1) !== (nf === 1);
    for (const m of pl.fadeMats) {
      m.opacity = m.userData.op0 * nf;
      if (crossing) {
        m.userData.tr0 ??= m.transparent;
        m.transparent = nf < 1 || m.userData.tr0;
        m.needsUpdate = true;
      }
    }
    if (pl.fadeVis !== vis) {
      pl.fadeVis = vis;
      for (const o of pl.fadeMeshes) o.visible = vis && !(pl.povHidden && pl.headMeshes && pl.headMeshes.includes(o));
    }
  }
}
/** A substitution: the figure that played as `outId` now plays display entry d (same spot; re-dressed as the incoming player). */
export function swapActor(w, outId, d) {
  const pl = w.people.find(q => q.d && q.d.p.id === outId);
  if (!pl) return;
  pl.d = d;
  dressFigure(pl, d);
}

/** Per match: dress the players (team kit, look, height, trail colours) and coaches; reset per-player state. */
export function dressActors(w) {
  if (!A || !A.disp) return; // no match on screen
  const disp = Object.values(A.disp),
    career = disp.some(d => d.p.you),
    models = career ? [] : w.models || [], // loaded extra models: Monster game / playtest only
    // the Monster game: every player is one of the owner's models (players3d BUNDLED), never the base one
    own = !career && A.fx && A.fx.bundled && (w.bundled || []).length > 0,
    free = w.people.slice(),
    take = model => {
      const i = free.findIndex(pl => (pl.model || null) === model);
      return i < 0 ? null : free.splice(i, 1)[0];
    },
    takeAny = () => {
      const i = free.findIndex(pl => pl.model && pl.model !== 'main' && models.includes(pl.model)); // all figures of one model in use: another
      return i < 0 ? null : free.splice(i, 1)[0];
    };
  for (const pl of w.people) pl.d = null;
  // career: your own player (p.you) is always Main_v2, everyone else the base model. Monster game: each player picks one
  // model at random with equal odds among the base model and every loaded one (stable per player, while figures are free)
  for (const d of disp) {
    const all = own ? models : [null, ...models],
      want = d.p.you ? 'main' : all[Math.min(all.length - 1, Math.floor(hu(d.p, 'model') * all.length))],
      pl = (want && take(want)) || (own && takeAny()) || take(null) || free.shift();
    if (pl) pl.d = d;
  }
  w.people.forEach(pl => {
    const d = pl.d;
    pl.root.visible = pl.aura.visible = !!d;
    if (!d) {
      for (const t of [...pl.trails, ...pl.eyeTrails]) t.clear();
      pl.zone.visible = pl.buff.visible = false;
      return;
    }
    dressFigure(pl, d);
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
}
