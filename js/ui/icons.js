// Small inline SVG icons (currentColor) for skills: active techniques vs passive skills, plus the technique type.

const ICON = {
  active: '<path d="M9.5 1 3 9.2h4.2L6.3 15 13 6.6H8.7z"/>',
  passive:
    '<circle cx="8" cy="8" r="2.6"/><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.2 1.6"/>',
  Attack: '<path d="M3 3h9.5v9.5l-3.2-3.2-4.6 4.6-2.1-2.1 4.6-4.6z"/>',
  Serve:
    '<circle cx="11" cy="4.8" r="3"/><path d="M2 14.5C3.6 9 6.4 6.6 8.6 6.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  Defense: '<path d="M8 1.2 14 3.6V8c0 3.5-2.6 6.2-6 7.3C4.6 14.2 2 11.5 2 8V3.6z"/>',
  Setter: '<path d="M8 1.5 11.2 6 8 10.5 4.8 6z"/><rect x="2" y="12" width="12" height="2.2" rx="1"/>'
};
/** StatIcons (spec §9.5): line icons for stats and resources, 20×20 viewBox, stroke currentColor. Keys = GLOSSARY icons. */
const STAT_ICON = {
  pow: '<path d="M10 2l1.8 4.6L16.5 5l-2 4.5L18 12l-4.7.6L13 18l-3-3.6L7 18l-.3-5.4L2 12l3.5-2.5-2-4.5 4.7 1.6z"/>',
  def: '<path d="M10 2l7 2.5v5c0 4.2-3 7.2-7 8.5-4-1.3-7-4.3-7-8.5v-5z"/>',
  spd: '<path d="M4 5l5 5-5 5M11 5l5 5-5 5"/>',
  jmp: '<path d="M10 15V3M5.5 7.5L10 3l4.5 4.5M4 18h12"/>',
  wit: '<path d="M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.5"/>',
  led: '<circle cx="10" cy="10" r="8"/><path d="M13 7.2a4 4 0 1 0 0 5.6"/>',
  sta: '<rect x="2.5" y="6" width="13" height="8" rx="1.5"/><path d="M17.5 9v2M5 8.5v3M8 8.5v3"/>',
  day: '<circle cx="10" cy="10" r="3.5"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/>',
  sp: '<path d="M10 2l6 8-6 8-6-8z"/><path d="M4 10h12"/>',
  fan: '<circle cx="7" cy="7" r="2.6"/><circle cx="14" cy="8" r="2.1"/><path d="M2.5 16c.6-3 2.3-4.5 4.5-4.5s3.9 1.5 4.5 4.5M12 12.2c2.6-.4 4.5 1 5.2 3.8"/>',
  mood: '<circle cx="10" cy="10" r="8"/><path d="M6.5 12c1 1.5 2.1 2.2 3.5 2.2s2.5-.7 3.5-2.2"/><path d="M7.5 7.5v.5M12.5 7.5v.5"/>',
  bond: '<path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1-1"/>',
  std: '<path d="M5 18V3M5 3.5h9.5l-2 3.5 2 3.5H5"/>',
  mon: '<path d="M13.5 6.5c-.6-1.2-1.9-1.8-3.5-1.8-2 0-3.4 1-3.4 2.5 0 3.5 7 1.8 7 5.3 0 1.5-1.5 2.6-3.6 2.6-1.8 0-3.2-.7-3.8-2M10 3v14"/>',
  grd: '<rect x="3" y="3" width="14" height="14" rx="3"/><path d="M12.5 7.5c-.5-.8-1.4-1.2-2.4-1.2-1.4 0-2.3.7-2.3 1.7 0 2.4 4.9 1.2 4.9 3.7 0 1-1 1.8-2.5 1.8-1.2 0-2.2-.5-2.6-1.4"/>'
};
/** A stat/resource icon ('' for an unknown key); `size` 16 inline, 20 in the HUD. */
const statI = (k, size = 16) =>
  STAT_ICON[k]
    ? `<svg class="si" viewBox="0 0 20 20" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STAT_ICON[k]}</svg>`
    : '';
/** Icon key of a stat or resource glossary id (STATK, wit, lead, sta, money, …). */
const statKey = id => (GLOSSARY[id] ? GLOSSARY[id].icon : id);
const svgI = (k, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">${ICON[k]}</svg>`;
/** Icon badge for a skill: bolt + type for active techniques, an aura for passive skills. */
function skillIcon(id) {
  const s = SKILLS[id];
  if (!s) return '';
  return s.tech
    ? `<span class="ski act" title="Active technique · ${s.tech}: fires during matches">${svgI('active')}${svgI(s.tech)}</span>`
    : `<span class="ski pas" title="Passive skill: always on">${svgI('passive')}</span>`;
}
/** Compact chip: icon + name, description as a tooltip. */
const skillChip = id =>
  `<span class="skc ${SKILLS[id].tech ? 'act' : 'pas'}" title="${esc(SKILLS[id].desc)}">${skillIcon(id)}${esc(SKILLS[id].name)}</span>`;
