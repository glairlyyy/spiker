// Career world: starting as a free agent (a pickup squad), joining a faction, money and housing, paydays with
// league transfers and the Gazette. DOM-free (runs headless in tests).

const World = {
  /** The pickup squad you play with as a free agent: three average players plus you. */
  pickup(used) {
    const t = {
      i: -1,
      name: 'Free Agents',
      short: 'FA',
      color: '#8a90b0',
      sk: 'balanced',
      S: STYLES.balanced,
      hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] },
      nStars: 0,
      arch: 'Pickup squad'
    };
    fillRoster(t, {}, used);
    return t;
  },
  isFree: run => run.team == null,
  faction: ti => FACTIONS[ti] || null,
  /** Can you sign with team ti now? { ok, why } — why lists what's missing. */
  canJoin(run, ti) {
    const f = FACTIONS[ti],
      you = Run.you(run),
      j = (f && f.join) || {},
      miss = [];
    if (!World.isFree(run)) miss.push('already signed');
    if (Run.cupDef(run)) miss.push('not during a cup');
    if (j.ovr && ovr(you) < j.ovr) miss.push(`OVR ${j.ovr}`);
    if (j.key && you[KEYSTAT[you.role]] < j.key) miss.push(`${STATNAME[KEYSTAT[you.role]]} ${j.key}`);
    if (j.star && !you.star) miss.push('★ star');
    if (j.fans && run.fans < j.fans) miss.push(`${j.fans.toLocaleString()} fans`);
    if (j.fee && run.money < j.fee) miss.push(`$${j.fee}`);
    return { ok: !miss.length, why: miss };
  },
  /** What a club asks, as text. */
  joinText(ti) {
    const j = FACTIONS[ti].join,
      p = [];
    if (j.ovr) p.push(`OVR ${j.ovr}+`);
    if (j.key) p.push(`key stat ${j.key}+`);
    if (j.star) p.push('★ star');
    if (j.fans) p.push(`${j.fans.toLocaleString()} fans`);
    if (j.fee) p.push(`$${j.fee} fee`);
    return p.join(' · ') || 'Open to anyone';
  },
  /** Sign with team ti: you take the same-role slot; that player drops to the pickup squad. */
  join(run, ti) {
    if (!World.canJoin(run, ti).ok) return false;
    const T = run.teams[ti],
      P = run.pickup,
      you = Run.you(run),
      old = T.P.find(p => p.slot === you.slot) || T.P.find(p => p.role === you.role) || T.P[3],
      iy = P.P.indexOf(you),
      io = T.P.indexOf(old);
    [you.num, old.num] = [old.num, you.num];
    old.slot = you.slot;
    you.slot = T.P[io].slot;
    T.P[io] = you;
    P.P[iy] = old;
    you.team = T;
    old.team = P;
    for (const t of [T, P]) {
      [t.s, t.mb] = t.P;
      t.ws = [t.P[2], t.P[3]];
    }
    for (const m of T.P) if (m !== you && you.bond[m.id] == null) you.bond[m.id] = 0;
    const fee = FACTIONS[ti].join.fee || 0;
    run.money -= fee;
    run.team = ti;
    finalizeTeam(T);
    Training.rollFloor(run); // this week's training partners are your new teammates
    finalizeTeam(P);
    Run.log(run, `Signed with ${T.name} (${FACTIONS[ti].name})${fee ? ` — $${fee} fee` : ''}. ${old.name} is out.`);
    Run.news(run, `${you.name} signs with ${T.name}.`);
    return true;
  },
  setHousing(run, k) {
    if (!HOUSING[k] || run.housing === k) return false;
    run.housing = k;
    Run.log(run, `Moved to: ${HOUSING[k].name} (rent $${HOUSING[k].rent} per payday).`);
    return true;
  },
  /** Stamina from a Rest week scales with where you live. */
  restMul: run => (HOUSING[run.housing] || HOUSING.studio).rest,
  isPayday: run => run.week % ECON.payEvery === 0,
  /** End of a week: housing hazards; on payday money, rent, food, league transfers and the Gazette. */
  week(run) {
    const H = HOUSING[run.housing] || HOUSING.studio,
      out = [];
    if (H.sick && R() < H.sick) out.push(`caught a cold (${Run.bump(run, 'sta', -15)})`);
    if (H.noise && R() < H.noise) out.push(`noisy night (${Run.bump(run, 'mood', -1)})`);
    if (out.length) Run.log(run, `Home: ${out.join(', ')}.`);
    if (World.isPayday(run)) World.payday(run);
  },
  payday(run) {
    const H = HOUSING[run.housing] || HOUSING.studio,
      out = [];
    run.money += ECON.allowance - ECON.food - H.rent;
    out.push(`+$${ECON.allowance} allowance, −$${ECON.food} food${H.rent ? `, −$${H.rent} rent` : ''}`);
    if (H.moodPay && R() < H.moodPay[1]) out.push(Run.bump(run, 'mood', H.moodPay[0]));
    if (H.grit) out.push(Run.bump(run, 'lead', H.grit));
    if (run.money < 0) {
      run.housing = 'homeless';
      run.money = 0;
      out.push('evicted — sleeping at the abandoned gym', Run.bump(run, 'mood', -1));
    }
    Run.log(run, `Payday: ${out.filter(Boolean).join(', ')}. Balance $${run.money}.`);
    World.transfers(run);
    World.gazette(run);
  },
  /** The league moves on its own: a stronger club poaches a better player of one role from a weaker club. */
  transfers(run) {
    const T = run.teams,
      buyer = T.reduce((a, t) => (t.ovr > a.ovr ? t : a), T[0]),
      you = Run.you(run),
      sellers = T.filter(t => t !== buyer);
    for (let tries = 0; tries < 4; tries++) {
      const s = pick(sellers),
        cand = s.P.filter(p => p !== you && !p.legend),
        star = cand.reduce((a, p) => (!a || ovr(p) > ovr(a) ? p : a), null);
      if (!star) continue;
      const mine = buyer.P.find(p => p.role === star.role && p !== you);
      if (!mine || ovr(mine) >= ovr(star)) continue;
      const i = buyer.P.indexOf(mine),
        j = s.P.indexOf(star);
      [mine.slot, star.slot] = [star.slot, mine.slot];
      [mine.num, star.num] = [star.num, mine.num];
      buyer.P[i] = star;
      s.P[j] = mine;
      star.team = buyer;
      mine.team = s;
      for (const t of [buyer, s]) {
        [t.s, t.mb] = t.P;
        t.ws = [t.P[2], t.P[3]];
        finalizeTeam(t);
      }
      if (you.bond[star.id] != null && T[run.team] !== buyer) delete you.bond[star.id];
      if (T[run.team] === buyer || T[run.team] === s) for (const m of Run.mates(run)) if (you.bond[m.id] == null) you.bond[m.id] = 0;
      Run.news(run, `Transfer: ${buyer.name} poach ${star.name} (${star.role}) from ${s.name}; ${mine.name} goes the other way.`);
      return;
    }
  },
  /** Monthly Gazette: the news collected since the last payday plus power rankings. */
  gazette(run) {
    const rank = [...run.teams]
      .sort((a, b) => b.ovr - a.ovr)
      .slice(0, 3)
      .map((t, i) => `${i + 1}. ${t.name} (${t.ovr})`);
    run.gazette = { week: run.week, items: [...(run.news || []), `Power rankings: ${rank.join(' · ')}`], read: false };
    run.news = [];
  },
  /** Prize money (warm-ups, cups). */
  prize(run, amt) {
    if (!amt) return '';
    run.money += amt;
    return `+$${amt}`;
  }
};
