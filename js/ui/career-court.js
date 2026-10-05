// The court-match block on an official venue's card (spec §4.21a, T-229) and its action: Play it / Sim it, then one button
// per tier (fee → prize on the control; the opponents' level, the ace chance and the injury risk on its hover).

/** Extra placeCard fields for venue `id`: { opts, row } (a Play / Sim segment and the three tier buttons). */
function courtCard(run, id) {
  const v = VENUES[id];
  if (!v) return {};
  const sim = !!CW.courtSim,
    d = Court.cost(run, id),
    btn = T => {
      const why = Court.why(run, id, T.id),
        lvl = Court.target(run, T.id),
        risk = Math.round(Fight.injuryRisk(run, lvl) * COURT.injury * 100),
        info = `Opponents ~OVR ${lvl}, ace ${Math.round(T.ace * 100)}%. Win: +$${Math.round(T.fee * COURT.prize)}, +${T.fans} fans. Lose: only the fee. Injury ~${risk}%. −${COURT.sta} stamina. Match XP either way.`;
      return `<button class="btn" onclick="mapCourt('${id}','${T.id}', CW.courtSim)" ${why ? `disabled ${tip(why)}` : tip(info)}>${T.name} $${T.fee}→${Math.round(T.fee * COURT.prize)}${sim ? ' ⏭' : ''}</button>`;
    };
  return {
    opts: `<span class="lab" ${tip('Entry fee → the prize if you win; a loss costs only the fee')}>Court match · ${d}d</span><div class="seg" aria-label="Court match"><button class="btn ${sim ? '' : 'on'}" onclick="CW.courtSim=false;mapPick('venue:${id}')">Play it</button><button class="btn ${sim ? 'on' : ''}" onclick="CW.courtSim=true;mapPick('venue:${id}')" ${tip(GLOSSARY.sim.long)}>Sim it</button></div>`,
    row: COURT.tiers.map(btn)
  };
}
/** Play a court match at venue id in a tier: watch it, or sim it (the result card over the hub after the walk). */
function mapCourt(id, tier, sim) {
  const fx = Court.fixture(RUN, id, tier);
  if (!fx) return;
  CW.spot = `venue:${id}`;
  if (!sim) return watchCareer(fx);
  mapAfter(RUN, null, simCareer(fx));
}
