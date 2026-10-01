// Per-frame player life on the world clock: swing / pose timers, free fall and landing, dives, call bubbles,
// measured motion for the 3D poses (speed, lean, gait) with running dust, and the end-of-match celebration.

/** Per-player timers on the world clock: swings, pose age, free fall under gravity, landing, dive, call bubbles. */
function stepPlayerTimers(wdt, raw) {
  for (const id in A.disp) {
    const d = A.disp[id],
      dt = id === A.digHero ? raw : wdt; // the digger chasing a far ball moves at normal speed while the world slows
    if (d.swing != null) d.swing += dt;
    if (d.spk != null) d.spk = d.spkHold ? Math.min(d.spk + dt, swingLead(d)) : d.spk + dt;
    d.pt = (d.pt || 0) + dt;
    d.pAge = (d.pAge || 0) + dt;
    if (d.fallMs != null) {
      // real gravity: h = h0 − ½·g·t² (court h units: 150 = 2.43 m); fallH because jmode can be cleared mid-fall
      d.fallMs += dt;
      if (d.airV) {
        // momentum from the take-off carries on until touchdown (never over the net)
        d.x = d.side === 0 ? Math.min(NETX - 8, d.x + d.airV.vx * dt) : Math.max(NETX + 8, d.x + d.airV.vx * dt);
        d.z = clamp(d.z + d.airV.vz * dt, -0.3, 1.3);
      }
      d.jy = Math.max(0, d.fallH - (0.5 * FALL_G * Math.pow(d.fallMs / 1000, 2)) / UNIT_M.h);
      if (d.jy <= 0) {
        d.fallMs = null;
        d.jmode = null;
        d.landMs = 0; // touchdown
        if (d.airV && d.airV.sn === (d.slideN || 0)) {
          // no new move ordered while in the air: where they landed is where they now stand (no walking back)
          d.sx = d.tx = d.x;
          d.sz = d.tz = d.z;
          d.carry = false;
          d.via = null;
        } else if (d.airV) {
          // a move ordered mid-air (back to base after a serve…): go there straight from the landing spot — not along
          // the path from where they took off, which would first pull them back toward the take-off point
          d.sx = d.x;
          d.sz = d.z;
          d.carry = true;
          d.via = null;
        }
      }
    }
    if (d.landMs != null) d.landMs += dt;
    if (d.psv && d.pose === 'preserve' && moveM(d) < 0.15) d.psv.t += dt; // the routine starts once at the service spot
    if (d.dv) {
      d.dv.t += dt;
      if (!d.dv.hit && d.dv.t >= d.dv.dur * 0.75) {
        d.dv.hit = 1; // chest hits the floor
        panAt(P(d.x, d.z, 0).X);
        sfx.slide();
      }
      if (d.afterDive && !diving(d)) {
        d.pose = d.afterDive === 'bump' ? 'ready' : d.afterDive; // the pass is long gone: back to ready
        d.afterDive = null;
        d.dv = null;
        d.pAge = 0;
      }
    }
    // landing thud after a real jump (peak height remembered in _air)
    if (d.jy > 20) d._air = Math.max(d._air || 0, d.jy);
    else if (d._air && d.jy < 3) {
      panAt(P(d.x, d.z, 0).X);
      sfx.land(d._air);
      d._air = 0;
    }
    if (d.gu) d.gu.t += dt;
    if (d.call && (d.call.life -= dt / 1300) <= 0) d.call = null;
  }
}
/** Measured motion for the 3D poses (speed mv, lateral share lat, facing fwd, gait phase) and running dust. */
function stepGait(dt) {
  for (const id in A.disp) {
    const d = A.disp[id];
    const dx = d.x - (d._px == null ? d.x : d._px),
      dz = (d.z - (d._pz == null ? d.z : d._pz)) * Z_TO_X,
      dist = Math.hypot(dx, dz),
      spd = dist / Math.max(dt, 1);
    d.mv = lerp(d.mv || 0, spd, 0.35);
    if (dist > 0.01) {
      d.lat = lerp(d.lat || 0, Math.abs(dz) / dist, 0.3);
      d.fwd = Math.sign(dx * DIR(d.side)) || d.fwd || 0;
    }
    d.gait = (d.gait || 0) + dist * 0.11;
    d._px = d.x;
    d._pz = d.z;
    if (d.mv > 0.14 && d.jy < 2 && FXR.r() < dt / 70) {
      const q = P(d.x, d.z, 0);
      addPart({
        x: q.X + FXR.rnd(-6, 6),
        y: q.Y,
        vx: FXR.rnd(-0.03, 0.03) - DIR(d.side) * (d.fwd || 0) * 0.04,
        vy: -FXR.rnd(0.01, 0.04),
        grow: 0.02,
        s: 3,
        life: 1,
        dec: 0.003,
        kind: 'dust'
      });
    }
    if (d.pose === 'dive' && d.mv > 0.08 && FXR.r() < dt / 30) {
      const q = P(d.x, d.z, 0);
      addPart({
        x: q.X + FXR.rnd(-10, 10),
        y: q.Y,
        vx: FXR.rnd(-0.05, 0.05),
        vy: -FXR.rnd(0.02, 0.06),
        grow: 0.03,
        s: 4,
        life: 1,
        dec: 0.0025,
        kind: 'dust'
      });
    }
  }
}
/** Match over: winners bounce, losers slump, coaches react, confetti in the winners' colours for 7 s. */
function stepCelebration(dt) {
  const C = A.cele;
  C.t += dt;
  for (const id in A.disp) {
    const d = A.disp[id];
    if (d.side === C.w) {
      d.pose = 'block';
      d.jy = Math.abs(Math.sin(C.t * 0.008 + d.x * 0.05)) * 38;
    } else {
      d.pose = 'slump';
      d.jy = 0;
    }
  }
  A.coaches[C.w].react = 1;
  A.coaches[C.w].type = 'yay';
  A.coaches[1 - C.w].react = 1;
  A.coaches[1 - C.w].type = 'ugh';
  if (C.t < 7000 && FXR.r() < dt / 18) {
    const col = FXR.pick([A.m.t[C.w].color, '#ffffff', '#ffd84d', A.m.t[C.w].color]);
    addPart({
      kind: 'conf',
      x: FXR.rnd(-20, 1020),
      y: VT - 10,
      vx: FXR.rnd(-0.03, 0.03),
      vy: FXR.rnd(0.05, 0.11),
      rot: FXR.r() * 6,
      vr: FXR.rnd(-0.012, 0.012),
      s: FXR.rnd(4, 7),
      life: 1,
      dec: 0.00022,
      c: col
    });
  }
}
