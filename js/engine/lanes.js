// Laning (spec §2.24): every spike goes down a channel — `line` (along the hitter's own side) or `cross` (to the far side).
// Before the hit the block reads one channel (what it has seen this hitter do this match, × its read quality); the hitter
// aims (habit, the block's shade if they see it, the weaker hand of a double). Read right → the block is on the ball and the
// stats decide; read wrong → the shot goes past it into the back row's channel. Same code for every match (sims, the AI).

/** One blocker's block strength (Defense 0.55 + Jump 0.45). */
const blkStr = b => b.def * 0.55 + b.jump * 0.45;
/** A hitter's habit: the share of their spikes that go down the line (a hash of the player, no draws; power leans cross). */
const habitLine = p => clamp(lerp(LANE.habit[0], LANE.habit[1], hu(p, 'habit')) - (p.power - 60) * LANE.powerCross, 0.15, 0.85);
/** The centre (court z) of a channel's landing area for a hitter attacking at spZ; a middle attack angles cross to a corner. */
const laneZ = (spZ, ch) =>
  ch === 'line' ? spZ : spZ <= 0.5 ? Math.max(1 - spZ, 0.5 + LANE.crossMin) : Math.min(1 - spZ, 0.5 - LANE.crossMin);
/** Which channel a landing spot lz is in (the nearer centre). */
const laneOf = (spZ, lz) => (Math.abs(lz - laneZ(spZ, 'line')) <= Math.abs(lz - laneZ(spZ, 'cross')) ? 'line' : 'cross');
/** The blocker whose hand meets a shot down channel ch (the ball crosses the net a fifth of the way to its landing). */
function laneHand(x, ch) {
  if (!x.b1) return x.b0;
  const zNet = x.spZ + (laneZ(x.spZ, ch) - x.spZ) * 0.2;
  return Math.abs(x.bz1 - zNet) < Math.abs(x.bz0 - zNet) ? x.b1 : x.b0;
}
/** What this match has shown of a hitter: { line, cross }. */
const laneSeen = (m, p) => (m.lanes || (m.lanes = {}))[p.id] || (m.lanes[p.id] = { line: 0, cross: 0 });

/** 7b. The block reads a channel (no real block → none). The sharper blocker calls it from what they've seen. */
function laneRead(c, x) {
  const { m } = c,
    { spiker, b0, b1, cov } = x;
  if (cov <= BLOCK_MIN_COV) return { bch: null };
  const s = laneSeen(m, spiker),
    est = (s.line + 1) / (s.line + s.cross + 2),
    q = Math.max(readQ(b0), b1 ? readQ(b1) : 0),
    pLine = clamp(0.5 + (est - 0.5) * LANE.readK * q, 0.05, 0.95);
  return { bch: R() < pLine ? 'line' : 'cross' };
}

/**
 * 7c. The hitter aims: habit, bent away from the block's shade as far as they see it (their wit against the blocker's),
 * toward the weaker hand of a double. The block's coverage follows the read. Display: the projected direction and the
 * block's read channel (act `lane`, during the set).
 */
function laneAim(c, x) {
  const { V, atk, ds, atkT, defT } = c,
    { spiker, b0, b1, bch, spZ, appX } = x;
  let p = habitLine(spiker);
  if (bch) {
    const see = clamp(LANE.see0 + LANE.seeK * (W(spiker) - W(b0)), 0, LANE.seeMax);
    p = lerp(p, bch === 'line' ? LANE.away : 1 - LANE.away, see);
    if (b1) p += (blkStr(laneHand(x, 'cross')) - blkStr(laneHand(x, 'line'))) * LANE.weakK * see;
  }
  const ch = R() < clamp(p, 0.05, 0.95) ? 'line' : 'cross';
  let cov = x.cov;
  if (bch) {
    cov *= ch === bch ? LANE.on : b1 ? LANE.offDbl : LANE.off;
    if (b1) cov *= clamp(1 + (blkStr(laneHand(x, ch)) - (blkStr(b0) + blkStr(b1)) / 2) * LANE.handK, 0.8, 1.2);
  }
  if (V)
    x.a1.push({
      k: 'lane',
      side: atk,
      p: spiker.id,
      x0: appX,
      z0: spZ,
      x1: sx(ds, 250),
      z1: laneZ(spZ, ch),
      bz: bch ? laneZ(spZ, bch) : null,
      col: atkT.color,
      bcol: defT.color
    });
  return { ch, cov, read: bch ? (ch === bch ? 'right' : 'wrong') : null };
}

/** The block's tag over its first blocker once the hit is resolved (presentation; no draws). out: stuff | touch | beaten. */
function laneTag(c, x, out) {
  if (!c.V || !x.read || x.tip || x.around || x.delayed) return;
  const t = x.read === 'wrong' ? 'Wrong way!' : out === 'beaten' ? 'Too strong!' : 'Read it!';
  x.hit.push({ k: 'plabel', p: x.b0.id, t });
}

/** After the attack: what the blockers saw (the channel it really went), and the side's read tallies (spec §2.24). */
function laneRecord(m, side, x, kill) {
  if (x.tip || x.lz == null) return;
  laneSeen(m, x.spiker)[laneOf(x.spZ, x.lz)]++;
  if (!x.read) return;
  const a = m.att[side];
  a.rd++;
  if (x.read === 'right') {
    a.rdOk++; // a cut shot around a block that read it right counts: the hitter beat the read
    if (kill) a.rdBeat++;
  } else if (kill) a.rdWk++;
}

/** The coach panel's per-hitter numbers (spec §2.25; no draws): attacks, kills, errors, stuffed, channels, the block's reads. */
function hitLog(m, x, kill, stuffed, err) {
  const H = m.hit || (m.hit = {}),
    h = H[x.spiker.id] || (H[x.spiker.id] = { n: 0, k: 0, err: 0, stf: 0, line: 0, cross: 0, tip: 0, rd: 0, rdOk: 0 });
  h.n++;
  if (kill) h.k++;
  if (err) h.err++;
  if (stuffed) h.stf++;
  if (x.tip) h.tip++;
  else if (x.lz != null) h[laneOf(x.spZ, x.lz)]++;
  if (x.read) {
    h.rd++;
    if (x.read === 'right') h.rdOk++;
  }
}
/** The coach panel: a serve taken by p (aced: it beat them). */
function recvLog(m, p, aced) {
  const V = m.recv || (m.recv = {}),
    r = V[p.id] || (V[p.id] = { n: 0, ace: 0 });
  if (aced) r.ace++;
  else r.n++;
}
