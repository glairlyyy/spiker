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
      ring: [0.2, 0, 1.5, 0.05, 'Ring size'],
      parts: [1, 0, 3, 0.1, 'Particles']
    }
  },
  elem: {
    name: 'Elements',
    p: {
      parts: [1, 0, 3, 0.1, 'Burst + floor particles'],
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
      style: ['streak', ['streak', 'ribbon', 'ink', 'off'], 0, 0, 'Style'],
      min: [0, 0, 150, 1, 'From power'],
      width: [1, 0.2, 4, 0.05, 'Width'],
      life: [1, 0.3, 3, 0.05, 'Length'],
      ink: ['#ff1630', 0, 0, 0, 'Ink glow colour (no element)']
    }
  },
  hand: {
    name: 'Hand trails',
    p: {
      width: [1, 0.2, 4, 0.05, 'Width'],
      life: [1, 0.3, 3, 0.05, 'Length'],
      style: ['light', ['light', 'ink'], 0, 0, 'Style (the default for new players; ⚙ Trails)'],
      ink: ['#ff1630', 0, 0, 0, 'Ink glow colour']
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
