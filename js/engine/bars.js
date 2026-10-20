// The bars (spec §2.31): HP (rally damage, partial heal, collapse = the knockdown) and per-player morale (today's fire rules
// for each player, shaped by a morale trait). The team's fire (`m.mom`) is the on-court average morale, the captain counting
// double — stages, HUD and director read it as before. No randoms: traits come from a hash of the player.

/** A player's morale trait id (MTRAITS) or null; `p.mtrait` overrides (null = none). Never your career player for now. */
function mtraitOf(p) {
  if (p.mtrait !== undefined) return p.mtrait;
  if (p.you) return null;
  const key = `${p.name}|${p.role}`,
    c = MT_CACHE.get(p);
  if (c && c[0] === key) return c[1];
  const h = hu(p, 'mtrait');
  let a = 0,
    t = null;
  for (const k in MTRAITS)
    if (h < (a += MTRAITS[k].share)) {
      t = k;
      break;
    }
  MT_CACHE.set(p, [key, t]);
  return t;
}
/** mtraitOf's cache (the hash is the slow part): player → [name|role, trait]. */
const MT_CACHE = new WeakMap();
/** In this match (m.noTraits: the tests' plain match). */
const mtr = (m, p) => (m && m.noTraits ? null : mtraitOf(p));

/* ---------- Sparks and Scars (spec §4.30): only your career player has `p.traits`; without it every hook is a no-op ---------- */

/** Does p carry Spark / Scar `id` (MC_TRAITS)? */
const hasTr = (p, id) => !!(p && p.traits && p.traits.length && p.traits.includes(id));
/** Note that p's trait `id` acted this match (`m.trAct[pid][id]`: the career names a hidden Scar after it). */
function trActed(m, p, id) {
  const A = m.trAct || (m.trAct = {});
  (A[p.id] || (A[p.id] = {}))[id] = 1;
}
/** Late in the set for Clutch / Shaky Hands: TRAIT_LATE_PTS+ points or a set point. */
const trLate = m => Math.max(m.pts[0], m.pts[1]) >= Math.min(TRAIT_LATE_PTS, RULES.pointsToWin - 1);
/**
 * The traits' stat multiplier for stat k (stageBuff's keys: atk = power in play, def, spd, jump, serve): Clutch late (atk, def),
 * Air Impact (atk), God of War on a run (atk), Spite against Haewon's squad (every stat; m.vsRival from the career). 1 without traits.
 */
function trBuff(p, k) {
  const t = p.traits,
    m = CM;
  if (!t || !t.length || !m || !m.pts) return 1;
  let x = 1;
  if ((k === 'atk' || k === 'def') && t.includes('clutch') && trLate(m)) {
    x *= 1 + SPARKS.clutch.k;
    trActed(m, p, 'clutch');
  }
  if (k === 'atk' && t.includes('airImpact')) x *= 1 + SPARKS.airImpact.k;
  if (k === 'atk' && t.includes('godOfWar') && m.gow && m.gow[p.id] && m.gow[p.id].on) x *= 1 + SPARKS.godOfWar.k;
  if (m.vsRival && t.includes('spite')) {
    x *= 1 + SCARS.spite.k;
    trActed(m, p, 'spite');
  }
  return x;
}
/** Wit in the match: Tunnel Vision's −0.1 (0 without traits). */
function trWit(p) {
  if (!hasTr(p, 'tunnel') || !CM || !CM.pts) return 0;
  trActed(CM, p, 'tunnel');
  return SCARS.tunnel.k;
}
/** Dead Calm: p's side is Loose → p plays as Composed (the stage stageBuff reads for p). */
function trStage(p, st) {
  if (st !== 'loose' || !hasTr(p, 'deadCalm')) return st;
  trActed(CM, p, 'deadCalm');
  return 'composed';
}
/** Serve errors + this for p now: Shaky Hands late in the set (0 without traits). */
function trServeErr(p) {
  if (!hasTr(p, 'shakyHands') || !CM || !CM.pts || !trLate(CM)) return 0;
  trActed(CM, p, 'shakyHands');
  return SCARS.shakyHands.k;
}
/** The squad players who carry traits, per side (found once a match: squads never change mid-match). */
const trSquad = (m, i) => (m.trP || (m.trP = m.t.map(t => squadOf(t).filter(p => p.traits && p.traits.length))))[i];
/** Side(s)' trait carriers with their morale now (morKeep compares after a change). */
function trMor(m, sides = [0, 1]) {
  const out = [];
  for (const i of sides) for (const p of trSquad(m, i)) out.push([p, morOf(m, p)]);
  return out;
}
/** After a morale change: Eye of the Storm keeps what p had (no loss); Iron Will holds the floor (SPARKS.ironWill.k). */
function morKeep(m, keep) {
  for (const [p, was] of keep) {
    let v = morOf(m, p);
    if (v < was && hasTr(p, 'eyeStorm')) {
      v = was;
      trActed(m, p, 'eyeStorm');
    }
    if (v < SPARKS.ironWill.k && v < was && hasTr(p, 'ironWill')) v = Math.min(was, SPARKS.ironWill.k);
    m.mor[p.id] = v;
  }
}
/** A point is over: God of War's run (two kills running → on; your error → off). */
function trPoint(m) {
  for (const i of [0, 1])
    for (const p of trSquad(m, i)) {
      if (!hasTr(p, 'godOfWar')) continue;
      const G = (m.gow || (m.gow = {}))[p.id] || (m.gow[p.id] = { n: 0, on: false });
      if (m.errBy === p.id) Object.assign(G, { n: 0, on: false });
      else if (m.lastK === p.id) {
        G.n++;
        if (G.n >= 2 && !G.on) {
          G.on = true;
          trActed(m, p, 'godOfWar');
        }
      } else G.n = 0;
    }
}

/* ---------- Gifts (spec §4.35): `p.gifts` (NPCs, and what you learned); without them every hook is a no-op ---------- */

/** The morale gifts. */
const GIFT_MOR = ['choker', 'iceVeins'];
/** Side i's squad players with a morale gift (found once a match). */
const gfSquad = (m, i) =>
  (m.gfP || (m.gfP = m.t.map(t => squadOf(t).filter(p => p.gifts && p.gifts.some(id => GIFT_MOR.includes(id))))))[i];
/** Side(s)' morale-gift carriers with their morale now (giftMor compares after a change). */
function gfMor(m, sides = [0, 1]) {
  const out = [];
  for (const i of sides) for (const p of gfSquad(m, i)) out.push([p, morOf(m, p)]);
  return out;
}
/** After a morale change, from TRAIT_LATE_PTS points: Choker's drop × GIFTS.choker.k; Ice Veins never below GIFTS.iceVeins.mor (Rattled). */
function giftMor(m, keep) {
  if (!keep.length || !m.pts || Math.max(m.pts[0], m.pts[1]) < TRAIT_LATE_PTS) return;
  for (const [p, was] of keep) {
    let v = morOf(m, p);
    if (v < was && hasGift(p, 'choker')) v = was + (v - was) * GIFTS.choker.k;
    if (hasGift(p, 'iceVeins')) v = Math.max(v, GIFTS.iceVeins.mor);
    m.mor[p.id] = clamp(v, -1, 1);
  }
}

/** HP 0–1 (1 before the first hit). */
const hpOf = (m, p) => (m && m.hp && m.hp[p.id] != null ? m.hp[p.id] : 1);
/**
 * A ball kept up (serve receive or dig): HP damage by how hard it is for this receiver — r = ball power / Defense as played;
 * HP.base at a typical ball (r = HP.r0), × (r / r0)^HP.exp (spec §2.31: an average player goes down on the 2nd or 3rd hit
 * of a rally, on the 1st when the gap is big). Endurance takes the edge off (spec §4.33): × (1.2 − 0.4 × end / 100) for a
 * player with a body (yours), × 1 without. Returns true when the player collapses (HP 0). No randoms.
 */
function hpHit(m, p, pow) {
  const r = pow / Math.max(1, effD(p)),
    end = p.body && Number.isFinite(p.body.end) ? 1.2 - (0.4 * p.body.end) / 100 : 1,
    dmg =
      Math.min(HP.max, HP.base * Math.pow(r / HP.r0, HP.exp)) *
      ((MTRAITS[mtr(m, p)] || {}).hp || 1) *
      end *
      (p.gifts && hasGift(p, 'ironFrame') ? GIFTS.ironFrame.k : 1); // Iron Body, Endurance, Iron Frame (spec §4.35)
  if (m.hpLog) ((m.hpLog.n += 1), (m.hpLog.dmg += dmg));
  m.hp[p.id] = Math.max(0, hpOf(m, p) - dmg);
  return m.hp[p.id] <= 0;
}
/** Between rallies: court players heal HP.heal (less on a Shaken side: the war's stage, m.weak — spec §4.34), the bench all of it. */
function hpHeal(m) {
  m.t.forEach((t, i) => {
    const heal = HP.heal - (m.weak ? WAR_STAGES[m.weak[i]].heal || 0 : 0);
    for (const p of squadOf(t))
      m.hp[p.id] = t.P.includes(p) ? Math.min(1, Math.max(hpOf(m, p) + heal + (p.traits ? trHeal(m, p) : 0), m.down[p.id] ? HP.up : 0)) : 1;
  });
}

/** Second Wind: HP heals SPARKS.secondWind.k more (when there is HP to heal). */
function trHeal(m, p) {
  if (!hasTr(p, 'secondWind') || hpOf(m, p) >= 1) return 0;
  return SPARKS.secondWind.k;
}

/** A player's morale (−1..1). */
const morOf = (m, p) => (m.mor && m.mor[p.id]) || 0;
/** Side i's fire: the on-court players' average morale, the captain counting double. */
function fireOf(m, i) {
  const T = m.t[i];
  let s = 0,
    n = 0;
  for (const p of T.P) {
    const k = p === T.cap ? 2 : 1;
    s += k * morOf(m, p);
    n += k;
  }
  return n ? clamp(s / n, -1, 1) : 0;
}
/** Shift every squad player of side i by v (a team-wide push: element spikes, the zone breaker, timeouts). */
function morAdd(m, i, v) {
  const keep = v < 0 ? trMor(m, [i]) : null,
    gk = v < 0 ? gfMor(m, [i]) : null;
  for (const p of squadOf(m.t[i])) m.mor[p.id] = clamp(morOf(m, p) + v, -1, 1);
  if (gk && gk.length) giftMor(m, gk); // Choker, Ice Veins (spec §4.35)
  if (keep && keep.length) morKeep(m, keep); // Eye of the Storm, Iron Will (spec §4.30)
  m.mom[i] = fireOf(m, i);
}
/** Move side i's fire to v by shifting everyone alike (the old `m.mom[i] = v`). */
const fireTo = (m, i, v) => morAdd(m, i, v - m.mom[i]);

/**
 * After a point won by w (spec §2.31): every squad player's morale by the old fire rules (gain on a won point, the heat of a
 * lost one, the shakes), shaped by their trait; then each side's fire from it. fade(i) = Fever's full rate or the slower one.
 */
function morPoint(m, w, fade, LD) {
  const L = 1 - w,
    K = MOM_LOSS,
    shake = momShaken(m, L),
    gain = (0.1 + (m.streak[w] >= 3 ? 0.07 : 0) + m.big * 0.1) * (1 + LD(w) * 0.6),
    killer = m.lastK,
    stuffed = m.lastPlay === 'killblock' && m.ctx0 && m.ctx0.spiker ? m.ctx0.spiker.id : null,
    late = Math.max(m.pts[0], m.pts[1]) >= TRAIT_LATE,
    early = m.pts[0] + m.pts[1] <= TRAIT_EARLY;
  // the T-304 traits' gain / loss factors (late in the set, early, every swing, the weaker side)
  const gainK = (T, i) =>
    (T.swing || 1) *
    (T.late && late ? T.late[0] : 1) *
    (T.early ? T.early[early ? 0 : 1] : 1) *
    (T.under && ovrSide(m, i) < ovrSide(m, 1 - i) - 1 ? T.under : 1);
  const lossK = T => (T.swing || 1) * (T.late && late ? T.late[1] : 1);
  const keep = trMor(m), // the Sparks and Scars (spec §4.30): morale before this point, for Eye of the Storm / Iron Will
    gk = gfMor(m); // the morale gifts (spec §4.35)
  for (const p of squadOf(m.t[w])) {
    const T = MTRAITS[mtr(m, p)] || {},
      own = killer === p.id;
    let g = gain;
    if (killer && !own && T.mates) g *= T.mates;
    if (own && T.kill) g += T.kill;
    g *= gainK(T, w);
    m.mor[p.id] = clamp(morOf(m, p) * (1 - 0.15 * fade(w)) + g, -1, 1);
  }
  let low = null;
  for (const p of squadOf(m.t[L])) {
    const T = MTRAITS[mtr(m, p)] || {},
      mo = morOf(m, p),
      heat = clamp(K.heat + K.hot * mo, K.min, K.max);
    let loss = (0.09 + m.big * 0.05) * fade(L) * heat;
    if (T.lost) loss *= T.lost;
    loss += shake * (T.shake || 1);
    loss *= lossK(T);
    if (T.up && (m.errBy === p.id || stuffed === p.id)) loss = -T.up; // Spiteful: their own error / being stuffed fires them up
    m.mor[p.id] = clamp(mo * (1 - 0.15 * fade(L)) - loss, -1, 1);
    if (m.t[L].P.includes(p) && (!low || morOf(m, p) < morOf(m, low))) low = p;
  }
  for (const p of m.t[L].P) {
    const T = MTRAITS[mtr(m, p)];
    if (T && T.lift && low && low !== p) m.mor[low.id] = clamp(morOf(m, low) + T.lift, -1, 1);
  }
  // Trash Talker: the error that lost the point stings its maker more (each talker on court)
  const errP = m.errBy && squadOf(m.t[L]).find(p => p.id === m.errBy);
  if (errP)
    for (const p of m.t[w].P) {
      const T = MTRAITS[mtr(m, p)];
      if (T && T.taunt) m.mor[errP.id] = clamp(morOf(m, errP) - T.taunt, -1, 1);
    }
  // Captain's Voice: your kill lifts every teammate
  const kp = killer && trSquad(m, w).find(p => p.id === killer);
  if (kp && hasTr(kp, 'voice')) for (const p of squadOf(m.t[w])) if (p !== kp) m.mor[p.id] = clamp(morOf(m, p) + SPARKS.voice.k, -1, 1);
  // Contagious (spec §4.35): their kill lifts every teammate
  const cp = killer && squadOf(m.t[w]).find(p => p.id === killer && p.gifts && hasGift(p, 'contagious'));
  if (cp) for (const p of squadOf(m.t[w])) if (p !== cp) m.mor[p.id] = clamp(morOf(m, p) + GIFTS.contagious.k, -1, 1);
  if (gk.length) giftMor(m, gk);
  if (keep.length) morKeep(m, keep);
  m.mom[w] = fireOf(m, w);
  m.mom[L] = fireOf(m, L);
}
