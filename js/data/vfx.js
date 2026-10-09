// Tunable visual effects (owner 2026-10-06). VFX_DEF = the shipped defaults with their ranges; VFX = the live values the
// renderers read on every effect (fx3d, effects.js, acts.js, clock.js, actors3d). The dev VFX panel (Monster game key V,
// the VFX lab) edits VFX live, keeps the edits in this browser, and Export gives the JSON to bake in here as the new defaults.
// Display only: no engine code reads VFX, so goldens never move.

/**
 * group → { name, p: key → [default, min, max, step, label] } (a 0/1 with step 1 is an on/off; a '#rrggbb' default is a colour;
 * an array in place of min is a choice of options).
 */
const VFX_DEF = {
  dir: {
    name: 'Director (effects by stage, spec §2.15)',
    p: {
      on: [1, 0, 1, 1, 'On (off: the raw values below)'],
      force: ['off', ['off', 'loose', 'composed', 'focused', 'fever'], 0, 0, 'Force stage (both teams)']
    }
  },
  air: {
    name: 'Air impact (spike)',
    p: {
      min: [58, 0, 150, 1, 'From power'],
      doppler: [1, 0, 1, 1, 'Doppler (big at the hand)'],
      follow: [0.5, 0, 1, 0.05, 'Along the flight (0 = fixed reach)'],
      len: [2, 0.5, 4, 0.1, 'Reach (fixed)'],
      size: [1, 0.2, 3, 0.05, 'Ring size'],
      rings: [4, 1, 8, 1, 'Rings (at power 95+)'],
      life: [1, 0.3, 3, 0.05, 'Ring life'],
      wind: [1, 0, 3, 0.1, 'Wind lines'],
      jet: [1, 0, 3, 0.1, 'Air jet'],
      dome: [95, 0, 201, 1, 'Dome from power (201 = off)']
    }
  },
  frame: {
    name: 'Impact frame',
    p: {
      on: [1, 0, 1, 1, 'On'],
      min: [100, 0, 200, 1, 'From power'],
      ms: [1000, 100, 3000, 50, 'Length (ms)'],
      slow: [0.15, 0.02, 1, 0.01, 'Slow motion ×']
    }
  },
  burst: {
    name: 'Contact burst',
    p: {
      ring: [0.05, 0, 1.5, 0.05, 'Ring size'],
      parts: [1, 0, 3, 0.1, 'Particles']
    }
  },
  elem: {
    name: 'Elements',
    p: {
      parts: [0.4, 0, 3, 0.1, 'Burst + floor particles'],
      trail: [1, 0, 3, 0.1, 'Ball trail particles']
    }
  },
  blast: {
    name: 'Ground blast (a kill on the floor)',
    p: {
      on: [0, 0, 1, 1, 'On'],
      min: [100, 0, 200, 1, 'From power'],
      size: [1, 0.3, 3, 0.05, 'Size'],
      sparks: [1, 0, 3, 0.1, 'Sparks'],
      smoke: [1, 0, 3, 0.1, 'Smoke']
    }
  },
  combo: {
    name: 'Rally counter (touches)',
    p: {
      on: [1, 0, 1, 1, 'On'],
      min: [3, 1, 10, 1, 'Shows from touch'],
      size: [1, 0.5, 2, 0.05, 'Size']
    }
  },
  shake: {
    name: 'Camera shake (off with Zooms: Off)',
    p: {
      spike: [1, 0, 3, 0.1, 'Spike contact: a sharp kick'],
      floor: [1, 0, 3, 0.1, 'Ball on the floor: a rumble'],
      kill: [1.5, 0, 3, 0.1, 'A kill on the floor: rumble ×'],
      min: [70, 0, 150, 1, 'From power']
    }
  },
  bounce: {
    name: 'Kill bounce (ball flies off the court)',
    p: {
      on: [1, 0, 1, 1, 'On'],
      min: [95, 0, 200, 1, 'From power'],
      height: [1, 0.3, 3, 0.05, 'Height'],
      dist: [1, 0.3, 3, 0.05, 'Distance']
    }
  },
  found: {
    name: 'Every player (foundation)',
    p: {
      jump: [1, 0, 3, 0.1, 'Takeoff / landing dust'],
      run: [1, 0, 3, 0.1, 'Sprint dust'],
      dive: [1, 0, 3, 0.1, 'Dive skid'],
      touch: [1, 0, 3, 0.1, 'Touch pops (bump, dig, set)'],
      save: [1, 0, 3, 0.1, 'Save spark (dug off the floor)'],
      breath: [1, 0, 3, 0.1, 'Tired breath'],
      dust: ['#e9dfcf', 0, 0, 0, 'Dust colour']
    }
  },
  ring: {
    name: 'Rings (every ring effect)',
    p: {
      style: ['light', ['light', 'ink', 'partial'], 0, 0, 'Style'],
      own: [0, 0, 1, 1, 'Ink glows in the effect colour'],
      ink: ['#ff1630', 0, 0, 0, 'Ink glow colour'],
      life: [1.3, 0.5, 3, 0.05, 'Ink ring life ×']
    }
  },
  ball: {
    name: 'Ball trail',
    p: {
      style: ['ribbon', ['streak', 'ribbon', 'ink', 'off'], 0, 0, 'Style'],
      min: [0, 0, 150, 1, 'From power'],
      width: [1, 0.2, 4, 0.05, 'Width'],
      life: [1, 0.3, 3, 0.05, 'Length'],
      ink: ['#ff1630', 0, 0, 0, 'Ink glow colour (no element)']
    }
  },
  ik: {
    name: 'IK (feet planted, hands on the ball)',
    p: {
      feet: [1, 0, 1, 1, 'Foot planting'],
      slip: [0.16, 0.04, 0.5, 0.01, 'A planted foot steps after sliding (m)'],
      step: [0.12, 0.04, 0.4, 0.01, 'Step time (s)'],
      arc: [0.05, 0, 0.2, 0.01, 'Step lift (m)'],
      down: [0.035, 0.005, 0.12, 0.005, 'A foot is down below (m)'],
      run: [4, 0, 12, 0.5, 'Plant only below this speed (m/s; faster the gait keeps the feet)'],
      arms: [1, 0, 1, 1, 'Hands / forearms on the ball']
    }
  },
  slowcd: {
    name: 'Slow-motion cooldown (per team, per kind)',
    p: {
      on: [1, 0, 1, 1, 'On (off: every slow motion plays)'],
      pts: [3, 1, 12, 1, 'Points between two (per team)'],
      shared: [1, 0, 1, 1, 'One cooldown for all kinds (off: per kind)']
    }
  },
  hand: {
    name: 'Hand trails',
    p: {
      width: [0.3, 0.2, 4, 0.05, 'Width'],
      life: [1, 0.3, 3, 0.05, 'Length'],
      style: ['light', ['light', 'ink'], 0, 0, 'Style (the default for new players; ⚙ Trails)'],
      ink: ['#ff1630', 0, 0, 0, 'Ink glow colour']
    }
  },
  // the ace cut-scene camera (render/cine.js, camera3d acePose), tuned in the Cut-scene lab (lab: 'cine'); metres from the
  // server (fwd: along their facing, toward the net; side: to their side) or from the ball; glide: how fast it follows (1/s)
  cbounce: {
    name: 'Ace 1 · bounce (ball in the hands)',
    lab: 'cine',
    cut: 'ace',
    p: {
      fwd: [4.3, 0.5, 8, 0.1, 'Camera ahead (m)'],
      side: [3, -5, 5, 0.1, 'Camera to the side (m)'],
      up: [1.15, 0.1, 3, 0.05, 'Camera height (m)'],
      look: [2.25, 0, 4, 0.05, 'Look at height (m)'],
      ball: [1, 0, 1, 0.05, 'Look toward the ball'],
      fov: [15, 8, 80, 1, 'Field of view'],
      glide: [4, 1, 20, 0.5, 'Glide in']
    }
  },
  crun: {
    name: 'Ace 2 · run-up (feet)',
    lab: 'cine',
    cut: 'ace',
    p: {
      fwd: [2.5, 0.3, 6, 0.1, 'Camera ahead (m)'],
      side: [2.1, -4, 4, 0.1, 'Camera to the side (m)'],
      up: [0.5, 0.05, 2, 0.05, 'Camera height (m)'],
      look: [0.3, 0, 2, 0.05, 'Look at height (m)'],
      ahead: [1.2, -1, 4, 0.05, 'Look ahead of the feet (m)'],
      fov: [26, 15, 80, 1, 'Field of view'],
      glide: [7, 1, 20, 0.5, 'Glide in']
    }
  },
  chit: {
    name: 'Ace 3 · the hit',
    lab: 'cine',
    cut: 'ace',
    p: {
      fwd: [-1.8, -3, 3, 0.1, 'Camera ahead of the hand (m)'],
      side: [-0.5, -5, 5, 0.1, 'Camera to the side (m)'],
      up: [-0.4, -2, 2, 0.05, 'Camera above the hand (m)'],
      look: [0.2, -1.5, 1.5, 0.05, 'Look above the hand (m)'],
      ball: [0.6, 0, 1, 0.05, 'Look toward the ball'],
      fov: [33, 15, 80, 1, 'Field of view'],
      glide: [6, 1, 20, 0.5, 'Glide in'],
      far: [1.9, 0.5, 8, 0.1, 'Until the ball is this far (m)']
    }
  },
  cball: {
    name: 'Ace 4 · riding the ball',
    lab: 'cine',
    cut: 'ace',
    p: {
      back: [2.6, 0.5, 8, 0.1, 'Camera behind the ball (m)'],
      up: [0.5, -1, 3, 0.05, 'Camera above the ball (m)'],
      ahead: [3, 0.5, 8, 0.1, 'Look ahead (m)'],
      drop: [0.6, -1, 3, 0.05, 'Look below the ball (m)'],
      fov: [48, 15, 80, 1, 'Field of view'],
      glide: [14, 1, 30, 0.5, 'Glide in'],
      hold: [500, 0, 3000, 50, 'Stay on the landing (ms)']
    }
  },
  // the WS kill cut-scene camera (render/cine.js): from the hitter's feet / hitting hand, then riding the ball
  wset: {
    name: 'WS 1 · the set (over the shoulder)',
    lab: 'cine',
    cut: 'ws',
    p: {
      fwd: [-2.5, -6, 6, 0.1, 'Camera ahead (m; − = behind)'],
      side: [0.8, -5, 5, 0.1, 'Camera to the side (m)'],
      up: [1.7, 0.1, 4, 0.05, 'Camera height (m)'],
      look: [1.5, 0, 4, 0.05, 'Look at height (m)'],
      ball: [1, 0, 1, 0.05, 'Look toward the ball'],
      fov: [40, 8, 80, 1, 'Field of view'],
      glide: [4, 1, 20, 0.5, 'Glide in'],
      until: [0.15, 0, 1, 0.05, 'Share of the set before the approach shot']
    }
  },
  wrun: {
    name: 'WS 2 · the approach (feet)',
    lab: 'cine',
    cut: 'ws',
    p: {
      fwd: [1.5, -4, 6, 0.1, 'Camera ahead (m)'],
      side: [2.2, -5, 5, 0.1, 'Camera to the side (m)'],
      up: [0.35, 0.05, 2, 0.05, 'Camera height (m)'],
      look: [0.4, 0, 2, 0.05, 'Look at height (m)'],
      ahead: [0.8, -1, 4, 0.05, 'Look ahead of the feet (m)'],
      fov: [32, 8, 80, 1, 'Field of view'],
      glide: [7, 1, 20, 0.5, 'Glide in'],
      slow: [0.5, 0.1, 1, 0.05, 'Slow motion, set → swing (× speed)']
    }
  },
  whit: {
    name: 'WS 3 · the swing',
    lab: 'cine',
    cut: 'ws',
    p: {
      fwd: [0.8, -4, 4, 0.1, 'Camera ahead of the hand (m)'],
      side: [3, -5, 5, 0.1, 'Camera to the side (m)'],
      up: [-0.3, -2, 2, 0.05, 'Camera above the hand (m)'],
      look: [0, -1.5, 1.5, 0.05, 'Look above the hand (m)'],
      ball: [0.5, 0, 1, 0.05, 'Look toward the ball'],
      fov: [38, 8, 80, 1, 'Field of view'],
      glide: [6, 1, 20, 0.5, 'Glide in'],
      far: [2, 0.5, 8, 0.1, 'Until the ball is this far (m)']
    }
  },
  wball: {
    name: 'WS 4 · riding the ball',
    lab: 'cine',
    cut: 'ws',
    p: {
      back: [2.6, 0.5, 8, 0.1, 'Camera behind the ball (m)'],
      up: [0.5, -1, 3, 0.05, 'Camera above the ball (m)'],
      ahead: [3, 0.5, 8, 0.1, 'Look ahead (m)'],
      drop: [0.6, -1, 3, 0.05, 'Look below the ball (m)'],
      fov: [48, 8, 80, 1, 'Field of view'],
      glide: [14, 1, 30, 0.5, 'Glide in'],
      hold: [600, 0, 3000, 50, 'Stay on the landing (ms)']
    }
  },
  // the MB quick cut-scene camera (render/cine.js): on the setter (from their feet), then the middle's hitting hand, then the ball
  qset: {
    name: 'Quick 1 · the setter takes the pass',
    lab: 'cine',
    cut: 'quick',
    p: {
      fwd: [-1.8, -6, 6, 0.1, 'Camera ahead of the setter (m; − = behind)'],
      side: [1, -5, 5, 0.1, 'Camera to the side (m)'],
      up: [2, 0.1, 4, 0.05, 'Camera height (m)'],
      look: [2, 0, 4, 0.05, 'Look at height (m)'],
      ahead: [1.5, -2, 5, 0.05, 'Look ahead of the setter (m)'],
      ball: [0.3, 0, 1, 0.05, 'Look toward the ball'],
      fov: [42, 8, 80, 1, 'Field of view'],
      glide: [5, 1, 20, 0.5, 'Glide in']
    }
  },
  qhit: {
    name: 'Quick 2 · the middle in the air',
    lab: 'cine',
    cut: 'quick',
    p: {
      fwd: [1, -4, 4, 0.1, 'Camera ahead of the hand (m)'],
      side: [2.6, -5, 5, 0.1, 'Camera to the side (m)'],
      up: [-0.2, -2, 2, 0.05, 'Camera above the hand (m)'],
      look: [0, -1.5, 1.5, 0.05, 'Look above the hand (m)'],
      ball: [0.6, 0, 1, 0.05, 'Look toward the ball'],
      fov: [40, 8, 80, 1, 'Field of view'],
      glide: [8, 1, 20, 0.5, 'Glide in'],
      far: [1.5, 0.5, 8, 0.1, 'Until the ball is this far (m)'],
      slow: [0.4, 0.1, 1, 0.05, 'Slow motion, pass → hit (× speed)']
    }
  },
  qball: {
    name: 'Quick 3 · riding the ball',
    lab: 'cine',
    cut: 'quick',
    p: {
      back: [2.2, 0.5, 8, 0.1, 'Camera behind the ball (m)'],
      up: [0.4, -1, 3, 0.05, 'Camera above the ball (m)'],
      ahead: [2.5, 0.5, 8, 0.1, 'Look ahead (m)'],
      drop: [0.6, -1, 3, 0.05, 'Look below the ball (m)'],
      fov: [50, 8, 80, 1, 'Field of view'],
      glide: [16, 1, 30, 0.5, 'Glide in'],
      hold: [600, 0, 3000, 50, 'Stay on the landing (ms)']
    }
  }
};
/** The live values: defaults, then this browser's saved edits (dev). */
const VFX = {};
/** Defaults back (all, or one group). */
function vfxReset(g) {
  for (const k of g ? [g] : Object.keys(VFX_DEF)) VFX[k] = Object.fromEntries(Object.entries(VFX_DEF[k].p).map(([n, d]) => [n, d[0]]));
}
/** The edits as JSON: only values that differ from the defaults (`all`: every value). */
function vfxExport(all) {
  const out = {};
  for (const g in VFX_DEF)
    for (const k in VFX_DEF[g].p) if (all || VFX[g][k] !== VFX_DEF[g].p[k][0]) (out[g] || (out[g] = {}))[k] = VFX[g][k];
  return JSON.stringify(out, null, 2);
}
/** Apply a JSON export (unknown keys ignored, numbers clamped to their range). */
function vfxImport(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  for (const g in o)
    for (const k in o[g]) {
      const d = VFX_DEF[g] && VFX_DEF[g].p[k];
      if (!d) continue;
      if (Array.isArray(d[1]) && !d[1].includes(o[g][k])) continue; // a choice: only its options
      VFX[g][k] = typeof d[0] === 'string' ? String(o[g][k]) : Math.min(d[2], Math.max(d[1], +o[g][k] || 0));
    }
}
vfxReset();
try {
  const saved = store.get(KEYS.vfx);
  if (saved) vfxImport(saved);
} catch (e) {
  // a broken saved edit: defaults
}
