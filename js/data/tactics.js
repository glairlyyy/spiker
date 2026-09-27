// Coach tactics: how the setter distributes the ball.
// quick = multiplier on the quick-attack chance (quickCap caps it), w = weight multiplier by role
// when picking the spiker, read = block/fake-read bonus the defense gets when the focused role attacks.

const TACTICS = {
  auto: { name: "Setter's call", short: 'Setter', quick: 1, quickCap: 0.7, w: {}, focus: null, read: 0 },
  ws: { name: 'WS focus', short: 'WS', quick: 0.35, quickCap: 0.7, w: { WS: 1.7, MB: 0.6 }, focus: 'WS', read: 0.08 },
  mb: { name: 'MB focus', short: 'MB', quick: 1.9, quickCap: 0.85, w: { MB: 2.2, WS: 0.8 }, focus: 'MB', read: 0.08 }
};
