// Career world: starting as a free agent (a pickup squad), joining a faction, money and housing, paydays with
// league transfers and the Gazette. DOM-free (runs headless in tests).

const World = {
  /** The Academy squad (the pickup squad): the three teammates Central Academy assigns to a free agent, plus you. */
  pickup(used) {
    const t = {
      i: -1,
      name: 'Academy squad',
      short: 'ACA',
      color: '#8a90b0',
      sk: 'balanced',
      S: STYLES.balanced,
      hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] },
      nStars: 0,
      arch: 'Assigned by Central Academy'
    };
    fillRoster(t, {}, used);
    return t;
  },
  /** Two players trade places: seats (court or bench), slots, shirt numbers and team links; the teams' s / mb / ws follow. */
  swap(x, y) {
    const tx = x.team,
      ty = y.team,
      put = (t, o, n) => {
        const a = t.P.includes(o) ? t.P : t.bench;
        a[a.indexOf(o)] = n;
      };
    put(tx, x, y);
    put(ty, y, x);
    [x.slot, y.slot] = [y.slot, x.slot];
    [x.num, y.num] = [y.num, x.num];
    [x.team, y.team] = [ty, tx];
    for (const t of [tx, ty]) {
      [t.s, t.mb] = t.P;
      t.ws = [t.P[2], t.P[3]];
    }
  },
  isFree: run => run.team == null,
  /** Leave the Academy squad for good (you are alone afterwards: no teammates, no Academy evaluations). False if you can't. */
  leaveAcademy(run) {
    if (!World.isFree(run) || run.academy === false) return false;
    run.academy = false;
    Run.log(run, 'Academy squad: withdrawn at your request. Evaluation invitations cancelled.');
    return true;
  },
  /** Can you sign with team ti now? { ok, why } — why lists what's missing. */
  canJoin(run, ti) {
    const you = Run.you(run),
      j = World.joinReq(run, ti),
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
  /** What a club asks now: a weakened faction (places lost, Front) lowers its bar. */
  joinReq(run, ti) {
    const j = Object.assign({}, (FACTIONS[ti] && FACTIONS[ti].join) || {}),
      n = run && FACTIONS[ti] ? Front.lost(run, FACTIONS[ti].region) : 0;
    if (run && run.vouch && run.vouch[ti]) {
      // an ally vouched for you (T-063): the OVR and key-stat bars drop
      if (j.ovr) j.ovr = Math.max(1, j.ovr - REL.ask.vouch);
      if (j.key) j.key = Math.max(1, j.key - REL.ask.vouch);
    }
    if (!n) return j;
    if (j.ovr) j.ovr -= FRONT.join * n;
    if (j.key) j.key -= FRONT.join * n;
    if (j.fee) j.fee = Math.round(j.fee * Math.max(0, 1 - FRONT.fee * n));
    return j;
  },
  /** What a club asks, as text. */
  joinText(ti, run) {
    const j = World.joinReq(run, ti),
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
      old = T.P.find(p => p.slot === you.slot) || T.P.find(p => p.role === you.role) || T.P[3];
    World.swap(you, old);
    for (const m of squadOf(T)) if (m !== you && you.bond[m.id] == null) you.bond[m.id] = 0;
    const fee = World.joinReq(run, ti).fee || 0;
    run.money -= fee;
    run.team = ti;
    finalizeTeam(T);
    Training.rollFloor(run); // this week's training partners are your new teammates
    finalizeTeam(P);
    Run.log(run, `Signed with ${T.name} (${FACTIONS[ti].name})${fee ? ` — $${fee} fee` : ''}. ${old.name} is out.`);
    Run.news(run, `${you.name} signs with ${T.name}. The office takes note.`);
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
    Asks.week(run); // loans: repaid on payday, or an overdue memory
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
    World.promote(run);
    People.fates(run); // cuts, quits, poaching (T-064)
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
        cand = squadOf(s).filter(p => p !== you),
        star = cand.reduce((a, p) => (!a || ovr(p) > ovr(a) ? p : a), null);
      if (!star) continue;
      const mine = squadOf(buyer).find(p => p.role === star.role && p !== you);
      if (!mine || ovr(mine) >= ovr(star)) continue;
      World.swap(mine, star);
      finalizeTeam(buyer);
      finalizeTeam(s);
      if (you.bond[star.id] != null && T[run.team] !== buyer) delete you.bond[star.id];
      if (T[run.team] === buyer || T[run.team] === s) for (const m of Run.mates(run)) if (you.bond[m.id] == null) you.bond[m.id] = 0;
      Run.news(
        run,
        `Transfer, in good order: ${buyer.name} secure ${star.name} (${star.role}) from ${s.name}; ${mine.name} goes the other way.`
      );
      return;
    }
  },
  /** Payday: each faction's best reserve takes the place of its weakest same-role squad player if clearly better (PROMOTE.gap). */
  promote(run) {
    const you = Run.you(run);
    for (const r of Object.keys(run.reserve || {})) {
      const rt = run.reserve[r];
      if (!rt || !rt.P.length) continue;
      const res = rt.P.reduce((a, p) => (ovr(p) > ovr(a) ? p : a));
      let weak = null,
        wt = null;
      for (const t of run.teams) {
        if (!FACTIONS[t.i] || FACTIONS[t.i].region !== r) continue;
        for (const p of squadOf(t)) if (p !== you && p.role === res.role && (!weak || ovr(p) < ovr(weak))) ((weak = p), (wt = t));
      }
      if (!weak || ovr(res) < ovr(weak) + PROMOTE.gap) continue;
      World.swap(res, weak);
      Rel.addPair(run, weak.id, res.id, 'spot_taken', null, weak.id); // (ids only: they are in different squads now, one memory)
      finalizeTeam(wt);
      finalizeTeam(rt);
      if (Run.myTeam(run) === wt) {
        delete you.bond[weak.id];
        if (you.bond[res.id] == null) you.bond[res.id] = 0;
      }
      Run.news(run, `${REGIONS[r].name}: ${res.name} rises to ${wt.name}; ${weak.name} returns to the reserves to reflect.`);
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
