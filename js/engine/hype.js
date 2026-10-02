// Shonen moments: personalities, the lines players say, when a rally deserves a staged scene, and the scene beats.
// Presentation only: nothing here changes a result, and no random numbers are drawn (lines come from a hash),
// so simulations and seeded runs are unaffected.

const persOf = p => PERS[Math.floor(hu(p, 'pers') * PERS.length)];
/** A player's given name (the last word of their name), as teammates call them. */
const firstName = p => p.name.split(' ').pop();
/** A line for `kind` in this player's voice. vars: { sig, mate, opp } (players or strings). */
function hypeLine(kind, p, m, vars = {}) {
  const L = LINES[kind][persOf(p)],
    k = (p.num + ((m && m.pts[0] + m.pts[1]) || 0) + kind.length) % L.length,
    v = x => (x && x.name ? firstName(x) : x || '');
  return L[k].replace('{sig}', v(vars.sig)).replace('{mate}', v(vars.mate)).replace('{opp}', v(vars.opp));
}
/** One point from winning (either side). */
const matchPoint = m => {
  const [a, b] = m.pts;
  return Math.max(a, b) >= RULES.pointsToWin - 1 && a !== b;
};
/** The side ahead on points, or -1 when level. */
const leadSide = m => (m.pts[0] === m.pts[1] ? -1 : m.pts[0] > m.pts[1] ? 0 : 1);
/** Match point for side `s`: one point from winning and ahead. */
const matchPointFor = (m, s) => matchPoint(m) && leadSide(m) === s;
/**
 * Should this attack be staged? 1 = always (Normal and Max Hype): element spike, a match point, a star-vs-star face-off,
 * a star blocker in the zone reading the play. 2 = Max only: a long rally, a comeback run. At most one per rally, and a
 * gap between optional ones. Also picks the side the scene follows (m.hypeDef: the defense's point of view).
 */
function hypeLevel(m, c, spiker, B0, elSrc, bad) {
  if (bad || m.hypeRally) return 0;
  const played = m.pts[0] + m.pts[1],
    since = played - (m.hypeAt == null ? -99 : m.hypeAt),
    reads = B0 && B0.star && W(B0) >= W(spiker); // the blocker is the sharper one: their scene
  let lv = 0,
    def = false;
  if (elSrc) lv = 1;
  else if (matchPoint(m) && since >= 2) {
    lv = 1;
    def = matchPointFor(m, c.ds) && !!B0;
  } else if (spiker.star && B0 && B0.star && since >= 8) {
    lv = 1;
    def = reads;
  } else if (B0 && B0.star && m.zone[c.ds] && W(B0) >= 1.3 && since >= 6) {
    lv = 1;
    def = true;
  } else if (c.n >= 6 && since >= 3) {
    lv = 2;
    def = reads;
  } else if (m.streak[c.atk] >= 3 && m.pts[c.atk] <= m.pts[c.ds] + 1 && since >= 3) lv = 2;
  if (lv) {
    m.hypeRally = 1;
    m.hypeAt = played;
    m.hypeDef = def;
  }
  return lv;
}
/**
 * The staged build-up before the set, all while the world is held still (each line holds ~1.4–1.5 s to be read).
 * Attack side: the hitter's call (close-up), over the setter's shoulder, behind the wall. The set that follows starts
 * in slow motion (sceneSlow). Defense side: nothing here — see hypeRead, which cuts in once the hitter has jumped.
 */
function hypeScene(m, B, lv, { setter, spiker, B0, elSrc, atkT, defT, atk, ds, blockers }) {
  const mp = matchPoint(m),
    el = elSrc ? elSrc.el : null,
    shot = (dur, acts, def) => {
      const b = { dur, scene: lv, acts };
      if (def) m.defBeats.push(b); // the defense's part: dropped if no block is attempted (dropDefScene)
      B(b);
    };
  if (m.hypeDef) return; // the defense's scene plays mid-attack instead (hypeRead)
  const ask = el && elSrc === spiker ? hypeLine('askEl', spiker, m, { sig: spiker.sig.name }) : hypeLine('ask', spiker, m),
    set = el && elSrc === setter ? hypeLine('askEl', setter, m, { sig: setter.sig.name }) : hypeLine('setgo', setter, m, { mate: spiker });
  shot(1550, [
    { k: 'shot', kind: 'face', p: spiker.id, el },
    { k: 'heart' },
    { k: 'call', p: spiker.id, t: ask, sc: 1 },
    ...(mp ? [{ k: 'banner', t: matchPointFor(m, atk) ? 'MATCH POINT' : 'MUST SCORE', c: atkT.color }] : [])
  ]);
  if (setter !== spiker)
    shot(1350, [
      { k: 'shot', kind: 'ots', p: setter.id, p2: spiker.id, el: el && elSrc === setter ? el : null },
      { k: 'call', p: setter.id, t: set, sc: 1 }
    ]);
  if (B0)
    shot(
      1450,
      [
        { k: 'shot', kind: 'wall', p: B0.id, p2: spiker.id },
        { k: 'heart', v: 1.3 },
        { k: 'call', p: B0.id, t: hypeLine('wall', B0, m, { opp: spiker }), sc: 1 }
      ],
      true
    );
}
/** No block attempted after all (a cut shot, a seam, a fake, too wide): the defender has nothing to say — drop their shots. */
function dropDefScene(m) {
  for (const b of m.defBeats || []) {
    b.dur = 1;
    b.acts = [];
  }
  m.defBeats = [];
}
/**
 * A confident blocker, whatever the attack side is doing: a solid block is forming (coverage from the engine, not
 * fooled by a fake) around a sharp star blocker. Gives its own read scene mid-jump (1 = Normal Hype), at most one
 * every 9 points. An attack scene may play before the set in the same rally.
 */
function readLevel(m, B0, cov, bitten, hype) {
  if (!B0 || bitten) return 0;
  if (hype && m.hypeDef) return hype;
  const played = m.pts[0] + m.pts[1];
  if (cov < 0.95 || !B0.star || W(B0) < 1.1 || played - (m.readAt == null ? -99 : m.readAt) < 9) return 0;
  m.readAt = played;
  return 1;
}
/**
 * Defense read: the hitter has jumped and the world freezes at the top — cut to the blocker, in the air too, who has
 * read it ("I read you."), then a look at the hitter from behind the block; then the block plays out as usual.
 */
function hypeRead(m, B, lv, { spiker, B0, defT, ds }) {
  if (!B0) return;
  const mp = matchPoint(m),
    ours = matchPointFor(m, ds),
    b1 = {
      dur: 1550,
      scene: lv,
      acts: [
        { k: 'shot', kind: 'face', p: B0.id },
        { k: 'heart', v: 1.2 },
        { k: 'call', p: B0.id, t: hypeLine(ours ? 'stop' : 'read', B0, m, { opp: spiker }), sc: 1 },
        ...(mp ? [{ k: 'banner', t: ours ? 'MATCH POINT' : 'HOLD ON', c: defT.color }] : [])
      ]
    },
    b2 = {
      dur: 650,
      scene: lv,
      acts: [
        { k: 'shot', kind: 'wall', p: B0.id, p2: spiker.id },
        { k: 'heart', v: 1.4 }
      ]
    };
  m.defBeats.push(b1, b2);
  B(b1);
  B(b2);
}
/**
 * Block break coming: a short cut of the hitter at the top of the jump (low angle, ball above the hand) with their
 * shout, held for a moment before the hit. Returns the beats (block() inserts them right after the set).
 */
function hypeSpikeCut(m, spiker, bb) {
  return [
    {
      dur: 900,
      scene: 1,
      acts: [
        { k: 'shot', kind: 'spike', p: spiker.id, p2: bb.id },
        { k: 'heart', v: 1.4 },
        { k: 'call', p: spiker.id, t: hypeLine('kiai', spiker, m), sc: 1 }
      ]
    }
  ];
}
/**
 * Kill block: the stuffed ball in close-up during the squash (a `ball` shot, see block()), then — once it has hit the
 * floor — the blocker's face with their line while the team roars. Level 1 at match point or for a star blocker
 * (at most every 6 points); otherwise level 2 (Max Hype).
 */
function hypeKillBlock(m, bb, spiker) {
  const played = m.pts[0] + m.pts[1],
    lv = matchPoint(m) || (bb.star && played - (m.kbAt == null ? -99 : m.kbAt) >= 6) ? 1 : 2; // Normal: not every stuff
  if (lv === 1) m.kbAt = played;
  m.kbScene = lv;
  return {
    dur: 1400,
    scene: lv,
    acts: [
      { k: 'shot', kind: 'face', p: bb.id },
      { k: 'heart', v: 0.9 },
      { k: 'call', p: bb.id, t: hypeLine('denied', bb, m, { opp: spiker }), sc: 1 }
    ]
  };
}
/**
 * Scramble drama: the ball broke through the block, got a touch, or popped off the arms — a defender calls it
 * ("Break!!" / "Loose ball!") and the dive plays in slow motion. Returns fields to spread into that beat
 * (a slow window near the end, a camera push on the defender) plus the calls. Hype Off keeps the calls only.
 * `why`: 'brk' | 'loose' | 'touch'; `who`: the defender going for it; `caller`: a teammate (or null).
 */
function scramble(m, why, who, caller, pos) {
  const acts = [];
  if (caller) acts.push({ k: 'call', p: caller.id, t: hypeLine(why === 'touch' ? 'loose' : why, caller, m) });
  if (who) acts.push({ k: 'call', p: who.id, t: hypeLine('save', who, m), soft: 1, when: 'end' });
  if (pos) acts.push({ k: 'cam', amt: 0.3, x: pos.x, z: pos.z, h: 40, hold: 1400, t0: 0.4 });
  return { beat: { slow: 1, slowAt: [0.55, 1], hypeSlow: 1 }, acts };
}
/** The nearest free teammate of `p` to shout the call (not the one going for the ball). */
const callerFor = (m, T, p, x, z) => {
  const o = T.P.filter(q => q !== p);
  return o.length ? nearest(m, o, x, z) : null;
};
/** Chatter after a point: the scorer, a teammate, the other side (acts added to the point beat). */
function hypeChatter(m, w) {
  const WT = m.t[w],
    LT = m.t[1 - w],
    acts = [],
    say = (p, kind, vars) => p && acts.push({ k: 'call', p: p.id, t: hypeLine(kind, p, m, vars), soft: acts.length ? 1 : 0 });
  const killer = WT.P.find(p => p.id === m.lastK),
    errBy = LT.P.find(p => p.id === m.errBy),
    hero = m.lastPlay === 'killblock' ? m.hero : killer;
  if (m.lastPlay === 'killblock' && hero) {
    if (m.kbScene !== 1) say(hero, 'denied'); // the kill-block scene already gave them the line
    const sp = m.ctx0 && m.ctx0.spiker;
    if (sp && LT.P.includes(sp)) say(sp, 'stuffed');
  } else if (errBy) {
    say(errBy, 'oops');
    const mate = LT.P.find(p => p !== errBy && persOf(p) === 'leader') || LT.cap;
    if (mate !== errBy) say(mate, 'cheer');
  } else if (hero) {
    say(hero, 'scored');
    const mate = WT.P.find(p => p !== hero && (p === WT.s || p.cap));
    if (mate && (hero.star || m.big || m.streak[w] >= 2)) say(mate, 'mate', { mate: hero });
    if (m.big) say(LT.P.find(p => p.star) || LT.cap, 'stunned');
  }
  // keep it light on ordinary points
  const played = m.pts[0] + m.pts[1];
  if (!m.big && !errBy && m.lastPlay !== 'killblock' && played % 3) return acts.slice(0, 1);
  return acts.slice(0, 3);
}

// Helpers for the call-out lines (data: CALLS in data/dialogue.js)
/** Pick a line without touching the random sequence (varies by player number and rally count). */
const callLine = (kind, p, m) => CALLS[kind][(p.num + ((m && m.pts[0] + m.pts[1]) || 0)) % CALLS[kind].length];
/** How confident a player feels right now: attacking stats, mood and the team being in the zone. */
const confidence = (p, m, side) =>
  (p.power + p.jump) / 2 + ((m && m.mood[p.id]) || 0) * 15 + (m && m.zone[side] ? 12 : 0) + (p.star ? 5 : 0) + (p.op ? 8 : 0);
