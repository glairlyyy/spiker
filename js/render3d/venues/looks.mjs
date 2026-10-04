// Per-venue look (spec §9.11): sky, fog, light, floor colours, crowd shades. A new venue starts with an entry here.

/** Per venue: sky / fog, light (hemi sky, ground, intensity; sun; rim), floor colours and finish, crowd shade. */
export const LOOK = {
  arena: {
    bg: '#05070f',
    fog: [30, 85],
    hemi: ['#cfd8ff', '#20140c', 0.6],
    sun: 1.5,
    rim: 0.7,
    inner: '#2f6fd0',
    free: '#d8743a',
    lines: '#ffffff',
    rough: 0.22,
    outer: '#0a0d1c',
    lum: 0.6,
    neutrals: ['#3a4470', '#4a5480', '#2e365e']
  },
  hall: {
    bg: '#1c232e',
    fog: [26, 70],
    hemi: ['#fff3e0', '#4a3420', 1.15],
    sun: 1.6,
    rim: 0.4,
    inner: '#d9a868',
    free: '#3e7a58',
    lines: '#ffffff',
    rough: 0.38,
    outer: '#2a2f38',
    lum: 0.95,
    neutrals: ['#59657a', '#7a6d5e', '#4f5a6d']
  },
  beach: {
    bg: '#8fc8ef',
    fog: [45, 160],
    hemi: ['#eaf6ff', '#c9a66b', 1.35],
    sun: 2.6,
    rim: 0.3,
    inner: '#e4cc96',
    free: '#e4cc96',
    lines: '#2a5fd0',
    rough: 1,
    outer: '#d8bf88',
    lum: 1,
    neutrals: ['#c2563f', '#3f8fb0', '#e0b23c', '#6a8a4a']
  },
  highland: {
    bg: '#9aa7b2',
    fog: [24, 95],
    hemi: ['#dfe6ee', '#4c5a40', 1.15],
    sun: 1.0,
    rim: 0.35,
    inner: '#3f7d8a',
    free: '#55705a',
    lines: '#f2f2f2',
    rough: 0.65,
    outer: '#47633c',
    lum: 0.85,
    neutrals: ['#5d6b52', '#7a6a55', '#4b5b6b']
  },
  street: {
    bg: '#06070b',
    fog: [16, 55],
    hemi: ['#7a80a8', '#3a2814', 0.95],
    sun: 0.8,
    rim: 0.25,
    inner: '#3b3d43',
    free: '#34363b',
    lines: '#f2e6b0',
    rough: 0.92,
    outer: '#1e2025',
    lum: 0.42,
    neutrals: ['#3d3f4a', '#4a3e36', '#2f3a44']
  }
};
