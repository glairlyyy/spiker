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
/** Can this player use a technique? Learned (career) or meets the stat requirements. */
function hasTech(p, id) {
  const t = SKILLS[id];
  if (!t || !t.tech) return false;
  if (p.skills && p.skills.includes(id)) return true;
  for (const k in t.req) if ((k === 'wit' ? p.wit : p[k]) < t.req[k]) return false;
  return true;
}
const skillRoleOk = (s, role) => s.role === 'any' || s.role === role || (Array.isArray(s.role) && s.role.includes(role));
/** Captain leadership level: 1 at 55+, 2 at 70+, 3 at 85+. */
const leadLv = p => (p.lead >= 85 ? 3 : p.lead >= 70 ? 2 : p.lead >= 55 ? 1 : 0);
