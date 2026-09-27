// Career: your element. Hidden until OVR 70 (revealed at once for an heir of a Hall of Fame legend), then the
// Element Trial: be a ★ star, earn an S grade in a match where your team reached the zone, then pass the trial
// (chance from mood, stamina and wit; a failed trial comes back 3 weeks later).

const ElTrial = {
  revealAt: 70,
  retry: 3,
  /** Progress: { seen, star, proof, on } — the three steps plus the reveal. */
  steps(run) {
    const you = Run.you(run);
    return { seen: !!you.elSeen, star: !!you.star, proof: !!run.elProof, on: !!you.elOn };
  },
  /** Called each week (Growth.checkYou): reveal the element once you reach OVR 70. */
  reveal(run, you) {
    if (you.elSeen || ovr(you) < ElTrial.revealAt) return;
    you.elSeen = true;
    Run.log(run, `Something stirs inside you — your element is ${ENAME[you.el]}. Become a ★ star and prove it in the zone to unlock it.`);
  },
  /** After one of your matches: an S grade while your team reached the zone proves you're ready. */
  match(run, m, grade) {
    const you = Run.you(run);
    if (run.elProof || you.elOn || !you.elSeen || !you.star || grade !== 'S' || !(m.zoneHit && m.zoneHit[0])) return '';
    run.elProof = true;
    return 'Element Trial unlocked (S grade in the zone)';
  },
  /** Offer the trial at the start of a training week once every step is done. */
  offer(run) {
    const you = Run.you(run);
    if (run.event || you.elOn || !you.elSeen || !you.star || !run.elProof || run.week < (run.elNext || 0)) return;
    run.event = { id: 'element', pre: true };
  },
  /** Pass chance for the Element Trial (mood, stamina and wit). */
  chance: run => clamp(0.3 + 0.08 * (run.mood - 2) + run.sta / 400 + (Run.you(run).wit - 1) * 0.25, 0.12, 0.8),
  /** Take the trial. Pass → the element unlocks for good. */
  take(run) {
    const you = Run.you(run);
    if (R() < ElTrial.chance(run)) {
      you.elOn = true;
      return `ELEMENT AWAKENED! ${ENAME[you.el]} unlocked — your signature spike is ${you.sig.name} (${TWIST[you.sig.tw].name}).`;
    }
    run.elNext = run.week + ElTrial.retry;
    const out = [Run.bump(run, 'sta', -20), Run.bump(run, 'mood', -1)];
    return `Element Trial failed: ${out.filter(Boolean).join(', ')}. It returns in ${ElTrial.retry} weeks.`;
  },
  /** Put the trial off until next week. */
  wait(run) {
    run.elNext = run.week + 1;
    return 'Element Trial: not yet — it returns next week.';
  }
};
