// Skill and bond hooks read by Formula and the rally. A player without skills/bonds always gets 1 / false,
// and nothing here draws random numbers, so random tournaments play exactly as before.

const SKILL_WHEN = {
  clutch: () => !!CM && Math.max(CM.pts[0], CM.pts[1]) >= 12
};
/** Product of the player's skill multipliers for one hook key (1 when none apply). */
function skillMod(p, key) {
  if (!p.skills || !p.skills.length) return 1;
  let m = 1;
  for (const id of p.skills) {
    const s = SKILLS[id];
    if (s && s.key === key && (!s.when || SKILL_WHEN[s.when]())) m *= s.val;
  }
  return m;
}
/** Bond combo: a setter and spiker with bond 60+ can trigger a two-star combo even if neither is a star. */
const bondCombo = (a, b) => ((a.bond && a.bond[b.id]) || 0) >= 60 || ((b.bond && b.bond[a.id]) || 0) >= 60;
/** Can this player use a technique? Learned (career) or meets the stat requirements, and not held back this match. */
function hasTech(p, id) {
  return knowsTech(p, id) && !techHeld(p, id); // techHeld: switched off for this match (spec §9.10)
}
/** Does the player own a technique (learned, or meets its requirements), switched on or not? */
function knowsTech(p, id) {
  const t = SKILLS[id];
  if (!t || !t.tech) return false;
  if (p.skills && p.skills.includes(id)) return true;
  for (const k in t.req) if ((k === 'wit' ? p.wit : p[k]) < t.req[k]) return false;
  return true;
}
/** Held back in the running match (spec §9.10): `CM.off[playerId]` holds the technique ids switched off. */
const techHeld = (p, id) => !!(CM && !CM.over && CM.off && CM.off[p.id] && CM.off[p.id].has(id));
/** A technique fired this rally: count it for the match's `used · won · faults` (engine-only, draws no randoms). */
function techFire(m, p, id) {
  if (!m.techUse) return;
  const u = m.techUse[p.id] || (m.techUse[p.id] = {}),
    c = u[id] || (u[id] = { n: 0, won: 0, err: 0 });
  c.n++;
  m.techRally.push([p.id, id]);
}
/** Switch technique `id` off (on = false) or back on for player `pid` from the next rally. */
function setTechOff(m, pid, id, off) {
  const s = m.off[pid] || (m.off[pid] = new Set());
  if (off) s.add(id);
  else s.delete(id);
}
const skillRoleOk = (s, role) => s.role === 'any' || s.role === role || (Array.isArray(s.role) && s.role.includes(role));
/** Captain leadership level: 1 at 55+, 2 at 70+, 3 at 85+. */
const leadLv = p => (p.lead >= 85 ? 3 : p.lead >= 70 ? 2 : p.lead >= 55 ? 1 : 0);
