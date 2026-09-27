// Small inline SVG icons (currentColor) for skills: active techniques vs passive skills, plus the technique type.

const ICON = {
  active: '<path d="M9.5 1 3 9.2h4.2L6.3 15 13 6.6H8.7z"/>',
  passive: '<circle cx="8" cy="8" r="2.6"/><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.2 1.6"/>',
  Attack: '<path d="M3 3h9.5v9.5l-3.2-3.2-4.6 4.6-2.1-2.1 4.6-4.6z"/>',
  Serve: '<circle cx="11" cy="4.8" r="3"/><path d="M2 14.5C3.6 9 6.4 6.6 8.6 6.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  Defense: '<path d="M8 1.2 14 3.6V8c0 3.5-2.6 6.2-6 7.3C4.6 14.2 2 11.5 2 8V3.6z"/>',
  Setter: '<path d="M8 1.5 11.2 6 8 10.5 4.8 6z"/><rect x="2" y="12" width="12" height="2.2" rx="1"/>'
};
const svgI = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">${ICON[k]}</svg>`;
/** Icon badge for a skill: bolt + type for active techniques, an aura for passive skills. */
function skillIcon(id) {
  const s = SKILLS[id];
  if (!s) return '';
  return s.tech
    ? `<span class="ski act" title="Active technique · ${s.tech}: fires during matches">${svgI('active')}${svgI(s.tech)}</span>`
    : `<span class="ski pas" title="Passive skill: always on">${svgI('passive')}</span>`;
}
/** Compact chip: icon + name, description as a tooltip. */
const skillChip = id => `<span class="skc ${SKILLS[id].tech ? 'act' : 'pas'}" title="${esc(SKILLS[id].desc)}">${skillIcon(id)}${esc(SKILLS[id].name)}</span>`;
