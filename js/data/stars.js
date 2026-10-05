// The named players (lore §6, spec §4.29): the rival and the MC's cohort (the next aces, 19, authored) and the first aces
// (20, generated per run: each major's best player at a fixed club). Their stats follow authored curves (Stars.week), not
// the NPC growth; nobody transfers, poaches or cuts them. Data only; the rules are js/career/stars.js.

const STARS = {
  /** The cohort: seated on `club` (FACTIONS index) in place of its weakest same-role player. ovr / wit: week 1 → the year-1 Cup. */
  cohort: [
    {
      key: 'rival',
      kind: 'rival',
      name: 'Tachibana Sae',
      role: 'WS',
      club: 0, // Wei Dynasty · Gold: Wei bought the mainland's best (the 15–4 tournament)
      ovr: [76, 90],
      wit: [1.15, 1.45],
      lead: 72,
      move: 'Crimson Lance',
      hair: '#101010',
      look: { hs: 2, skin: '#f3d2b3', eyeC: '#b91c1c', eye: 'sharp', acc: 'none', accC: '#ffffff', hgt: 1.02 }
    },
    {
      key: 'reina',
      kind: 'cohort',
      name: 'Kisaragi Reina',
      role: 'MB',
      club: 6, // St. Gloria International
      ovr: [70, 85],
      wit: [1.15, 1.4],
      lead: 55,
      move: 'Flash Step Quick',
      hair: '#eef0f5',
      look: { hs: 6, skin: '#f6d7b8', eyeC: '#2563eb', eye: 'round', acc: 'none', accC: '#ffffff', hgt: 1.06 }
    },
    {
      key: 'ren',
      kind: 'cohort',
      name: 'Kamiya Ren',
      role: 'S',
      club: 4, // Shu Dragon · Peak
      ovr: [70, 85],
      wit: [1.2, 1.5],
      lead: 80,
      move: 'Zero-Gravity Toss',
      hair: '#2b2d42',
      look: { hs: 3, skin: '#d9a877', eyeC: '#16a34a', eye: 'sharp', acc: 'glasses', accC: '#10163a', hgt: 0.96 }
    },
    {
      key: 'taiga',
      kind: 'cohort',
      name: 'Oboro Taiga',
      role: 'WS',
      club: 2, // Wu Navy · Harbor
      ovr: [70, 85],
      wit: [1.05, 1.3],
      lead: 66,
      move: 'Thunder Fang',
      hair: '#e4572e',
      look: { hs: 0, skin: '#eec39a', eyeC: '#d97706', eye: 'sharp', acc: 'band', accC: '#ff3d7f', hgt: 1.03 }
    }
  ],
  /** The first aces: the best player of `role` at each of these clubs (one per major) is lifted onto this curve; they peak OP at the Cup. */
  aces: {
    clubs: [
      [1, 'WS'],
      [3, 'MB'],
      [7, 'S']
    ],
    ovr: [86, 95],
    wit: [1.35, 1.65]
  },
  /** Stat shape round the target OVR by role (key stat highest); Stars.shape shifts them all until the OVR matches. */
  profile: {
    WS: { power: 9, jump: 3, speed: -3, def: -7 },
    MB: { jump: 9, def: 4, power: -2, speed: -8 },
    S: { speed: 11, def: 3, jump: -3, power: -11 }
  }
};
