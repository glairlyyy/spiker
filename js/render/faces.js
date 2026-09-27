// SVG face portraits for the UI (rosters, cut-ins, toasts) and the mood → face mapping.

/** Mood (−1..1) → face key: fire, happy, calm, worried, panic. */
const moodK = v => (v >= 0.6 ? 'fire' : v >= 0.2 ? 'happy' : v > -0.2 ? 'calm' : v > -0.6 ? 'worried' : 'panic');
/** Face portrait of player `p` (look, hair, team colour) in `mood` (−1..1), as an SVG string `size` px square. */
function faceSVG(p, mood, size) {
  const L = p.look,
    h = p.hair,
    mk = moodK(mood || 0),
    dk = '#141833',
    br = shade(h, -0.4),
    sk = L.skin,
    tc = (p.team && p.team.color) || '#3a4a7a',
    hi = shade(h, 0.4),
    ln = shade(h, -0.5);
  const back =
    {
      2: `<path d="M30 9 Q40 13 36 31 Q33 22 29 17Z" fill="${shade(h, -0.12)}"/>`,
      5: `<circle cx="20" cy="15" r="15" fill="${h}"/>`,
      6: `<path d="M7 17 C5 6 35 6 33 17 L35 37 L27 37 L28 21 L12 21 L13 37 L5 37Z" fill="${shade(h, -0.12)}"/>`,
      8: `<circle cx="20" cy="4.5" r="5" fill="${h}" stroke="${ln}" stroke-width=".5"/>`
    }[L.hs] || '';
  // fringe cap (most styles) + the style's own volume on top
  const cap = L.hs === 3 || L.hs === 5 ? '' : L.hs === 4 || L.hs === 1 ? `<path d="M8 20 C6 5 34 5 32 20 Q31 13 20 12 Q9 13 8 20Z"/>` : `<path d="M7.6 21 C5.5 4 34.5 4 32.4 21 L31 15 L29.4 19.5 L27.4 13.5 L24.6 18.8 L22.6 13 L20 18.5 L17.6 13 L15.4 18.8 L12.6 13.5 L10.6 19.5 L9 15Z"/>`;
  const top = [
    `<path d="M8 17 L6 8 L12 11 L12 3 L18 9 L21 1 L24 9 L30 3 L29 11 L34 8 L32 17 Q20 9 8 17Z"/>`,
    `<path d="M7 22 C6 6 34 6 33 22 L32 16 Q20 11 8 16Z"/>`,
    `<path d="M8 16 C8 6 32 6 32 16 Q24 10 8 16Z"/>`,
    `<path d="M17 13 L15 1 L19 5 L21 -1 L23 5 L26 1 L24 13Z"/>`,
    ``,
    `<path d="M8 16 Q20 8 32 16 Q26 11 8 16Z"/>`,
    `<path d="M8 16 C8 6 32 6 32 16 Q20 11 8 16Z"/>`,
    `<path d="M7 20 C6 6 33 6 34 18 L30 14 Q22 12 11 24Z"/>`,
    ``,
    `<path d="M8 17 C9 8 31 7 33 15 L36 9 L31 8 L34 4 Q24 1 14 5 Q9 8 8 17Z"/>`
  ][L.hs] || '';
  const E = (x, o = {}) => {
    const ry = o.sharp ? 1.9 : 2.6,
      id = `e${p.id}${x}${mk}`;
    return `<clipPath id="${id}"><ellipse cx="${x}" cy="23" rx="2.9" ry="${ry}"/></clipPath><ellipse cx="${x}" cy="23" rx="2.9" ry="${ry}" fill="#fff"/><g clip-path="url(#${id})">${
      o.white
        ? `<circle cx="${x}" cy="23" r=".8" fill="${dk}"/>`
        : `<ellipse cx="${x}" cy="23.3" rx="${o.small ? 1.3 : 1.9}" ry="${o.small ? 1.8 : 2.5}" fill="${L.eyeC}"/><rect x="${x - 3}" y="${23 - ry}" width="6" height="${ry * 0.7}" fill="${shade(L.eyeC, -0.45)}"/><ellipse cx="${x}" cy="23.5" rx=".9" ry="1.2" fill="${dk}"/><circle cx="${x - 0.6}" cy="22.3" r=".75" fill="#fff"/><circle cx="${x + 0.9}" cy="24.4" r=".35" fill="#fff"/>`
    }</g><path d="M${x - 3.3} ${23 - ry * 0.4} Q${x} ${22 - ry - 0.8} ${x + 3.3} ${23 - ry * 0.4}" stroke="${dk}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  };
  const blush = `<g stroke="#ff5a6e" stroke-width=".45" opacity=".7"><path d="M10 27.6 L11 26.2 M11.4 27.6 L12.4 26.2 M12.8 27.6 L13.8 26.2 M26.2 27.6 L27.2 26.2 M27.6 27.6 L28.6 26.2 M29 27.6 L30 26.2"/></g>`;
  const face = {
    fire:
      E(15, { sharp: true }) +
      E(25, { sharp: true }) +
      `<path d="M11.8 18.6 L17.6 20 M28.2 18.6 L22.4 20" stroke="${br}" stroke-width="1.5" stroke-linecap="round"/><path d="M16.5 28 L23.5 28 Q22.8 32 20 32 Q17.2 32 16.5 28Z" fill="#6b1f2e"/><rect x="16.8" y="28" width="6.4" height="1.1" fill="#fff"/>` +
      blush,
    happy: `<path d="M12.3 23.6 Q15 20.4 17.7 23.6 M22.3 23.6 Q25 20.4 27.7 23.6" stroke="${dk}" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M12.4 18.4 Q15 17.4 17.4 18.2 M22.6 18.2 Q25 17.4 27.6 18.4" stroke="${br}" stroke-width="1.1" fill="none" stroke-linecap="round"/><path d="M17 28.2 Q20 31.8 23 28.2Z" fill="#6b1f2e"/>` + blush,
    calm:
      E(15) +
      E(25) +
      `<path d="M12.4 18.6 Q15 17.8 17.4 18.5 M22.6 18.5 Q25 17.8 27.6 18.6" stroke="${br}" stroke-width="1.1" fill="none" stroke-linecap="round"/><path d="M18.3 29.2 Q20 29.8 21.7 29.2" stroke="${shade(sk, -0.55)}" stroke-width=".8" fill="none" stroke-linecap="round"/>`,
    worried:
      E(15, { small: true }) +
      E(25, { small: true }) +
      `<path d="M12.4 18.2 L17.2 16.8 M22.8 16.8 L27.6 18.2" stroke="${br}" stroke-width="1.1" stroke-linecap="round"/><path d="M17.8 30 Q20 28.4 22.2 30" stroke="${shade(sk, -0.55)}" stroke-width=".8" fill="none" stroke-linecap="round"/><path d="M31 12 Q33.5 16 31 17.5 Q28.5 16 31 12Z" fill="#8fdcff"/>`,
    panic:
      E(15, { white: true }) +
      E(25, { white: true }) +
      `<path d="M12.4 17.8 L17.2 15.8 M22.8 15.8 L27.6 17.8" stroke="${br}" stroke-width="1.1" stroke-linecap="round"/><ellipse cx="20" cy="29.6" rx="1.7" ry="2.1" fill="#6b1f2e"/><path d="M31 11 Q33.5 15 31 16.5 Q28.5 15 31 11Z M9 14 Q11 17 9 18.5 Q7 17 9 14Z" fill="#8fdcff"/><path d="M15 11 L15 15 M20 10 L20 14 M25 11 L25 15" stroke="#4f5bd5" stroke-width=".9" opacity=".8"/>`
  }[mk];
  const acc =
    L.acc === 'band'
      ? `<path d="M7.5 15.5 Q20 11 32.5 15.5 L32.5 18 Q20 13.6 7.5 18Z" fill="${L.accC}"/>`
      : L.acc === 'glasses'
        ? `<g fill="none" stroke="${L.accC === '#ffffff' ? '#10163a' : L.accC}" stroke-width="1"><rect x="11.3" y="19.8" width="7.4" height="6" rx="1.8"/><rect x="21.3" y="19.8" width="7.4" height="6" rx="1.8"/><path d="M18.7 22.4 L21.3 22.4"/></g>`
        : L.acc === 'bandage'
          ? `<g transform="rotate(-25 28 27)"><rect x="24.5" y="25.8" width="6" height="2.3" fill="#f5e1c8"/><path d="M26.7 25.8 V28.1 M28.3 25.8 V28.1" stroke="#c9a882" stroke-width=".5"/></g>`
          : '';
  const ring = p.op ? `<circle cx="20" cy="20" r="19" fill="none" stroke="#ff2e4d" stroke-width="2"/>` : '';
  const title = { fire: 'Fired up', happy: 'Confident', calm: 'Steady', worried: 'Nervous', panic: 'Rattled' }[mk];
  const sd = shade(sk, -0.14),
    il = shade(sk, -0.5);
  const bust = `<path d="M2 41 Q4 34.5 12.5 32.6 L27.5 32.6 Q36 34.5 38 41Z" fill="${tc}" stroke="${shade(tc, -0.5)}" stroke-width=".6"/><path d="M16.2 32.4 L20 36.6 L23.8 32.4" fill="none" stroke="${shade(tc, 0.55)}" stroke-width="1.1"/>`;
  const neck = `<path d="M16.6 27 L16.4 33 Q20 36 23.6 33 L23.4 27Z" fill="${sk}" stroke="${il}" stroke-width=".5"/><path d="M16.6 29.6 Q20 32.6 23.4 29.6 L23.4 28 L16.6 28Z" fill="${sd}"/>`;
  const head = `<ellipse cx="8.6" cy="22.6" rx="1.6" ry="2.4" fill="${sk}" stroke="${il}" stroke-width=".5"/><ellipse cx="31.4" cy="22.6" rx="1.6" ry="2.4" fill="${sk}" stroke="${il}" stroke-width=".5"/><path d="M9 18 C9 7.5 31 7.5 31 18 L30.6 24.4 Q29.4 30.4 20 33.6 Q10.6 30.4 9.4 24.4Z" fill="${sk}" stroke="${il}" stroke-width=".6"/><path d="M10 19.5 Q20 16.5 30 19.5 L30 21 Q20 18.4 10 21Z" fill="${sd}" opacity=".7"/><path d="M20.4 25 L20.9 26.6 L19.9 26.8" fill="none" stroke="${shade(sk, -0.32)}" stroke-width=".55" stroke-linecap="round"/>`;
  const hair = `<g fill="${h}" stroke="${ln}" stroke-width=".5" stroke-linejoin="round">${cap}${top}</g><path d="M12 10.5 Q20 7 28 10.5" stroke="${hi}" stroke-width="1.1" fill="none" opacity=".8" stroke-linecap="round"/>`;
  return `<svg class="face" width="${size}" height="${size}" viewBox="0 0 40 40" role="img" aria-label="${title}"><title>${title}</title>${ring}${back}${bust}${neck}${head}${hair}${face}${acc}</svg>`;
}
