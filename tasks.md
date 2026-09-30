# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. Never start **Later** tasks: they are outlines, and the spec
chat details them (files, steps, accept) and moves them to Now when their phase starts.

Status: `[ ]` todo · `[~]` in progress · `[?]` blocked — see Question · `[x]` done

## Task template
```
### [ ] T-000: <imperative title>
Spec: §x.y          Goldens: unchanged | update (<why>)          Save: no change | RUN_VERSION bump (<why>)
Goal: <one or two sentences: the observable outcome>
Files: <exact paths the build chat may edit; new files marked (new) — also add to index.html + test3d.html>
Do not: <things that look tempting but are wrong for this task>
Steps:
1. <concrete step naming functions/constants/globals>
Accept:
- <checkable criterion: test, headless sim number, or visible behaviour>
QA: none | Monster game | career run → <screen and action>
Result:
```

## Roadmap
- Phase 1 — Island rules ✓ · 1b — Match feel ✓ · 1c — Cut-scene lines ✓ · 2 — Faction pools ✓
- Cleanup + info ✓ (T-016 Legacy removed, T-017/T-018 faction dossier)
- Phase 3 — Evaluations ✓ (T-008–T-011)
- **M2 — three.js map** ✓: scaffold ✓ (T-023), walking player ✓ (T-024), parity ✓ (T-025).
- **Phase 4 — U21 Final Cup** ✓: bracket with byes (T-019); U21 cup from drawn squads (T-020). The 8 league
  teams stay as faction home squads.
- Match music ✓ (T-032)
- Block tactics ✓ (T-026 lane-read block, T-027 defence setting + scouting habits).
- Substitutions ✓ (T-028 squads of 6, T-029 in-match subs, T-030 coach AI, T-031 you on the bench).
- **Growth rework** (now): training cap (T-034), match XP (T-035), skills learned in play (T-036); then **Challenges** (T-037/T-038).
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — Growth rework (spec §4.14)

### [ ] T-034: Training stops at 75 — remove Limit Break
Spec: §4.14          Goldens: unchanged (career only)          Save: RUN_VERSION 4 → 5 (`run.lb` removed) — older saves dropped
Goal: Training (and event stat bumps) can raise a stat to 75 at most; there is no Limit Break any more. Above 75 only
match experience counts (T-035). Wit keeps its own cap.
Files: js/data/career.js, js/career/training.js, js/career/run.js, js/career/events.js, js/career/goals.js,
js/ui/career-week.js, js/ui/career-map.js, tests/run.js, ARCHITECTURE.md
Do not:
- Touch NPC growth (Growth.grow) or anything in js/engine.
- Change the XP curve (TRAIN_X.xp) or session gains: the exponential `need` already makes gains shrink above 60.
Steps:
1. career.js: `TRAIN_CAP = 75` (doc: training and events stop here; matches go higher, spec §4.14); remove
   `TRAIN_X.gates` and its comment.
2. training.js: remove `gate`, `trialP`, `trial` and the "limit" event hand-off in `train`; `Training.top(run, stat,
   src = 'train')` → wit: its cap; `'train'` → `TRAIN_CAP`; `'match'` → `CAREER.runCap`. `sim` / `gain` / `addXp` take
   the same `src` (default 'train'); a stat already above the top gains nothing from that source and banks nothing.
   `preview.gate` → `cap: you[main] >= TRAIN_CAP ? TRAIN_CAP : null`. Header comment updated.
3. run.js: `bump` for stats: top = `Math.max(you[key], TRAIN_CAP)` (events never lower a stat that matches raised);
   remove `lb` from create / repair; `RUN_VERSION = 5` (comment: v5 — Limit Break removed).
4. events.js: remove the 'limit' special event (def, choose, the comment in `roll`).
5. goals.js: stat goals use `TRAIN_CAP` instead of the gate (no stat goal for a stat at 73+).
6. UI: the stat tag in `youCard` shows `⌈75` with the tip "Training stops at 75. Matches only above." (registrar
   voice); the training card line reads "<Stat> at 75 — matches only" instead of "Limit Break"; drop 'limit' from the
   event card kinds.
7. tests: replace `'career: Limit Break gates…'` with `'career: training cap, facility Lv 5 and Hard training'`:
   training 200 sessions never takes a stat past 75; an event bump at 75 does nothing; a stat already at 80 is not
   lowered; full-run test asserts stats ≤ 75 unless raised in matches (until T-035: ≤ 75). Facility / Hard parts kept.
8. ARCHITECTURE.md: training section (cap, sources).
Accept: all tests + lint; goldens untouched.
QA: career run → train a stat near the cap (set `Run.you(RUN).power = 74` in the console) → it stops at 75, the card
says "matches only"; no Limit Break event; no pageerror.
Result:

### [ ] T-035: Match experience — your performance × opponent strength
Spec: §4.14          Goldens: unchanged          Save: no change (uses `run.xp`)
Goal: Every match you play gives stat XP from your own line (not the result), scaled by how strong the opponent was.
It is the only way past 75. Street-battle fights give a flat amount by the same scaling.
Files: js/data/career.js, js/career/growth.js, js/career/cup.js, js/career/city.js, js/ui/career-week.js,
tests/run.js, ARCHITECTURE.md
Do not:
- Look at the winner for XP (win / loss rewards stay as they are, set by the kind of match).
- Give XP when you never came on (the bench reward stays).
Steps:
1. career.js: `MATCH_XP = { per: { k: { power: 12 }, ace: { power: 8 }, blk: { jump: 8, def: 8 }, dig: { def: 6,
   speed: 6 }, ast: { wit: 2 }, att: { jump: 1 } }, gap: [0.3, 2], perGap: 0.1, clash: { win: 30, loss: 20 } }`
   (doc: XP per stat-line unit; factor = clamp(1 + (opponent ovr − your side's ovr) × perGap, gap); wit counts in
   0.02 steps like training).
2. growth.js: `Growth.matchXp(run, m, mine, opp)` → labels: your `m.stat` line × `MATCH_XP.per`, × the gap factor
   (`opp.ovr` vs `mine.ovr` — the 4 who started), each stat through `Training.addXp(run, stat, xp, 'match')`.
   Returns e.g. ["+2 Power", "Defense progress"] plus "×1.6 vs a stronger side" / "×0.4 vs a weaker side" when ≠ 1.
3. cup.js `result`: when you played, add the labels to the result line (before rewards). city.js `clash` (you fought):
   XP to your role's key stat = `MATCH_XP.clash[win ? 'win' : 'loss']` × the gap factor (your ovr vs `CLASH.par`),
   source 'match'.
4. Result card (career-week.js, wherever the match result line is shown): nothing new beyond the line; keep it short.
5. tests: new `'career: match XP — performance, opponent strength, past the cap'`: the same stat line gives more XP
   vs a stronger side than vs an equal one, and 0.3× vs a much weaker one; winner flag flipped → same XP; a stat at 75
   rises from match XP; never-played → no XP. Report (not assert) in Result: a Short-season headless run with only
   training vs one that also plays every eval — final key stat both ways.
6. ARCHITECTURE.md: match XP.
Accept: all tests + lint; goldens untouched.
QA: career run → Sim ⏭ an evaluation → the result line shows the XP labels and the gap factor; no pageerror.
Result:

### [ ] T-036: Techniques learned in play (basic skills stay in the shop)
Spec: §4.14          Goldens: unchanged          Save: no change
Goal: The skill shop sells only basic skills (entries without `tech`). Techniques (`tech` entries) can't be bought:
you learn one by chance after a match — by doing the related thing, or by facing a player who has it. They still
switch on by themselves once your stats meet their `req` (as for everyone).
Files: js/data/career.js, js/career/skills.js, js/career/cup.js, js/career/dossier.js, js/ui/career-week.js,
js/ui/career-map.js, js/ui/career-dossier.js, tests/run.js, ARCHITECTURE.md
Do not:
- Change how techniques work in the engine (`hasTech`, `req`).
- Learn more than one technique per match.
Steps:
1. career.js: `LEARN = { do: { Attack: ['k', 3], Setter: ['ast', 6], Serve: ['ace', 1], Defense: ['blk+dig', 4] },
   doP: 0.08, faceP: 0.05 }` (doc: "by doing" needs that many of the stat in the match; "by facing" = an opponent on
   court has it; chance × (0.5 + wit / 2) × the MATCH_XP gap factor, clamped to [0, 0.5]).
2. skills.js: `canLearn` → false for `tech` entries; `Skills.tryLearn(run, m, mine, opp)` after a match you played:
   candidates = techniques for your role you don't own; for each (in SKILLS order) the do-chance if you reached its
   threshold, else the face-chance if an opponent who played has it (`hasTech`); first success → push to
   `you.skills`, log "Learned <name> in play (by doing | from <player>)"; one R() per candidate considered.
3. cup.js `result`: call it when you played; add the line to the result.
4. UI (skills shop, career-week.js): techniques show "learn in matches" instead of a price and can't be clicked;
   owned / "✓ stats" stay as today. Scouting: the scouted club roster (career-map.js) and the dossier roster show each
   player's techniques by name (`Dossier` model gains `techs` per roster entry when ratings are visible).
5. tests: a technique can't be bought; forcing R() low after a match with 3+ kills learns an Attack technique for a
   WS; facing a player with a technique can teach it; never two in one match; dossier `techs` hidden until scouted.
6. ARCHITECTURE.md: skills section.
Accept: all tests + lint; goldens untouched.
QA: career run → skills drawer shows techniques as "learn in matches"; scout a club → roster lists techniques; no
pageerror.
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Challenges — spec §4.15 (after the growth rework)
- T-037: Challenge action — map action at a club / street court, stake, acceptance rule, hired street players when
  alone, win payout by rating gap; XP via T-035.
- T-038: Loss and injury — stake lost, stamina / mood crash, standing loss → grudge, heavy-loss fans / Gazette;
  injury risk from gap, margin and fatigue (stamina + days since last battle); severe injury −2 permanent.

Phase 5 — Voice pass
- T-022: Faction `front`/`dark`, region `desc`, Gazette and event strings in lore.md §7 voices.

## Done
(one line each; full task text is in git history)
- [x] T-028: Squads of 6 — 4 on court + 2 on the bench (data, pools, draws, saves, rosters) — squadOf + t.bench (teams.js), bench in fillRoster/finalizeTeam/save (RUN_VERSION 4), POOL 24/18/12/6/6 + SQUAD 6, Pool.draw squads of 6 (benches drawn after all court slots, never you), Eval.squad/lend bench, Cup entrants of 6 (12 entrants, 4 byes), .P → squadOf across career code, new `World.swap` (join / transfers / promotion move players between court and bench seats), Teammates card 'Bench' heading, bench marks in the scouted roster and dossier ('<squad> · bench'). Tests: pools/draw/eval/U21 updated, new 'teams: 4 on court + 2 bench…' (30/30, lint clean); goldens updated (2 more rolls per team). Deviations: (1) STUFF_BIAS 0.45 → 0.2 in rally-defense.js — the new team rolls plus the MB-first blocker change (unplanned, earlier) left the 5-set test at 11.4 %; 10 team sets now average 13.1 % (spec ~13 %, per-set 9.6–16.8), kills 42 % unchanged; (2) elAll (engine/elements.js, unlisted) still loops t.P — only for pre-v4 saves, which are dropped; (3) eval card lists the 4 starters only. QA: career run — Teammates card shows 4 + 'Bench' (2), Wei dossier roster 24 (4 bench-marked), forced week-28 cup: 12 entrants / 4 byes; Monster game 600 steps 4+2 per side; no pageerror.
- [x] T-029: Substitutions in the match — dead-ball swap, SUBBED label, coach line (stamina rule) — SUB + SUBLINES, `m.subs` / `m.lineup0`, `coachSubs` / `subIn` / `restoreLineups` in match.js (subs after the point's beats, before a timeout; restore when the match is over, on leaveMatch and in navigate() for a running match), new act kind `sub` (+ existing `rot`, `plabel`, `coachtalk`, `log` in the same beat), `case 'sub'` in playback, `R3D.swapActor` (actors3d `dressFigure`), byId/box score/stars/mp cover players who came on. Goldens updated. Tests: new 'engine: substitutions — rule, limit, restore' (200 sims: 244 subs in 136 matches at shipped SUB.sta 0.6, never > 2 per side, lineups restored; recorded sub acts name known players), scene/beat tests accept bench ids (31/31, lint clean). Deviations: (1) bench display entries live in `A.bench`, not flagged inside `A.disp` — every draw / animation loop already iterates A.disp, so nothing had to learn to skip them; (2) the 3D figure of the outgoing player is re-dressed as the incoming one (same body model) rather than loading a separate hidden model per bench player; (3) a setter goes off only for a setter (the engine reads `t.s`). QA: Monster game with SUB.sta 0.95 — 2 subs per side, SUBBED label + '#14, sit. #5, you're up — earn it.' + log line, 8 figures / 8 unique players, `P` ids equal the starting lineup after the match, box score lists the players who came on; no pageerror.
- [x] T-030: Coach AI — errors and coach IQ decide subs too — SUB gains errs 3 / back 0.85 / iq [0.35, 0.9]; `subCandidate` (tired → erring → rested starter returns) + `coachSubs` with one `R() < lerp(SUB.iq…, coachIQ)` roll only when a candidate exists; engine-only `m.setErr`, `m.subbed`, `m.subLog`; the log line names the reason (tired / too many errors / fresh legs back). No new act kind. Goldens updated. Test 'engine: coach AI — errors, returns, coach IQ' (32/32, lint clean): 200 sims → tired 304, errors 21, back 38 subs; coachIQ 1 subs earlier than 0 (pooled over 4 seeds × 150 matches, e.g. 21.4 vs 21.7 points at first sub on seed 7 — small, direction held on every seed). Notes: with the shipped SUB numbers error-subs are rare (~10 % of subs); the IQ effect is modest because a candidate usually shows up late. QA: Monster game with SUB.sta 0.95 — log 'Sub …: #8 … in for #11 … (tired)', 8 unique figures, lineups restored after the match; no pageerror.
- [x] T-031: Your player can be benched — lineups, sub-outs, reduced rewards — Done; match.js also edited (`m.played`, `m.finished`), match-screen.js unchanged; a bench win doesn't count for the "win the evaluation" goal; goldens untouched; tests 33/33, QA: weak WS → card "On the bench", Sim ⏭ → grade C (bench: rewards ×0.6), no pageerror.
- [x] T-026: Lane-read block — who blocks where, reads, swings, doubles; three defence settings in the engine — formBlock reads lane/pipe/bitten/late/split, 2nd blocker on the inside, DEFSETS + BLOCK in tactics.js, `m.dset`; new test; goldens updated (block choice changes every hash). Stuff rate 11.3 % → 13.7 % (600 Read-vs-Read sims, 10 team sets; per-set 11.4–16.6). formBlock alone gave ~11.3 %, so STUFF_BIAS 0.9 → 0.45 in rally-defense.js (only lever with real effect) and BLOCK lateCov 0.8 / splitCov 0.85 (softer: the gap falloff already punishes lateness). Final BLOCK: laneL .38 laneR .62 lateCov .8 splitCov .85 swingReach .8 swingCov .75 commitQuick 1.6 commitReach 3.5 (NEW constant: Commit's blocker on a quick is already up) commitMiss .6 bunchMid 1.25 bunchStartZ [.42,.58] bunchPin .65. Deviations: (1) 'today's 67.7 % kills' isn't reproducible — my tally (hitter kills / attacks, `m.att`, engine-only) is ~42 % before and after; the test guards [36, 48] %. (2) Commit/Bunch tested on stuff rates (quick stuffed 27 → 33 % vs Commit, pins stuffed 9.5 → 5 % vs Bunch), not quick kill %: block breaks offset it (quick kill −1 pt only). (3) Scaled coverage capped at 1.2 so a setting can't trigger block breaks; Commit always counts the middle as bitten on a fake; Bunch drifts to bunchStartZ only as far as speed allows. Blocker slide speed max 595 → 646 units/s (same envelope). QA: 60 sims — pin attacks: blocker at the edge (<0.1) 68 % (rest late), inside double 91 %, every swing by the far blocker; Monster game 1500 steps, no pageerror. Not eyeballed 10 rallies in 3D.
- [x] T-027: Defence setting — your pick, AI teams' pick, scouting shows attack habits — styles.js `dset` (wall bunch, tempo commit, rest read), `defOf` in tactics.js, `m.dsetMode` + `m.dsetLog` (engine-only, not saved), captain switch in captainThink (one extra R() only in 'cap' mode, after 8 opp attacks; reuses the `tac` act with a `dset` field, no new act kind), Defence select per team in the Tactics popover (`setDefence`, `#dsnow`), `Dossier.habits`/`habitText` shown in the dossier club rows and the HQ card once scouted. Goldens updated (style defaults + the extra draw). Deviations: (1) pipe = the setter has `pipecombo` (it is a setter technique, not any player's); (2) css/style.css untouched (reused `.tac`); (3) T-026 stuff-rate test still passes unchanged (12–16 %) with style defaults, no retune. Tests: new 'defence settings' + 'scouting shows attack habits' (29/29, lint clean). QA: Monster game — both Defence selects present, picking Commit sets fixed:commit and `#dsnow` reads '→ Read' for the captain side; career — after scouting the dossier shows 'Quicks ~16 % · favours the left · pipe · Defence: Read'; no pageerror. HQ card habits line not eyeballed (same helper as the dossier).
- [x] T-032: Match background music (owner track, 50 % volume) — bgmStart/bgmStop/bgmSync in sfx.js (own gain → destination, decoded once, want/loading guards so a late decode after leaving stays silent), hooked in navigate; ARCHITECTURE 'Match music'. 26/26 + lint, goldens untouched. QA (test3d): 0.4 = 0.5 × 0.8 playing, 🔇 → 0, 🔊 → 0.4, leave → gain gone + bgmSrc null, second match 1 fetch total, no pageerror. Swiftshader is slow: decode took ~10 s wall before the music started. mp3 was not in my clone — fetched it from the artifact and committed it.
- [x] T-019: Brackets of any size with byes — bracket.js handles 8/16 slots with byes (BRACKET_ROUNDS/BRACKET_NEXT, seedOrder hard-coded: 8 = old Grand Cup order, 16 = the task's list); new test 'bracket: 8 and 16 entries, byes'. 25/25 + lint, goldens untouched, headless only.
- [x] T-020: U21 Final Cup — one cup of drawn squads replaces the Skyline and Grand Cups — U21 Final Cup as specced (13 squads → 16-slot bracket, 3 byes, RUN_VERSION 3, warm-up code removed; Cup.roman added as a Cup property, no new global). 26/26 + lint, goldens untouched; QA: Academy run → W29 bracket with byes, Sim ⏭ to run-end naming the champion, no pageerror.
- [x] T-025: 3D map parity — pins, selection, fog, labels — pins3d.mjs (overlay pins/labels/flag, seized + border decals), fog via vertex colours in map3d.mjs, `update` diffs by JSON, dead SVG CSS deleted, default view 60 m. 24/24 + lint. QA (test3d): 4 model pins = 4 DOM pins, labels + red border visible, pin click → panel + `.sel`; revealed HQ appears and scout updates its badge with the same renderer/16 geometries/1 canvas; land click → flag; no pageerror. Deviations: first view centres on you.at (not focus); border line drawn (in model); airport label offset below the player. Seized patch built (model count 1) but only checked headlessly.
- [x] T-023: 3D map scaffold — terrain, water, camera, click-to-point (behind a toggle) — MapView facade (map-view.js) + MapSVG rename, map3d.mjs terrain/water/sun/camera/pan/zoom/click, Menu toggle `MAP3D`. 24/24 + lint, goldens untouched. QA (test3d, swiftshader): toggle on → island renders, wheel zoom + drag pan move the view, click Shu land → panel → Travel moved RUN.pos [470,600]→[478,487]; off → SVG back, 0 canvases; leave to menu → renderer released, return → 1 canvas; no pageerror.
- [x] T-024: The player walks on the 3D map (default VRM model) — avatar3d.mjs (VRM + capsule fallback), map3d.update snap/walk + camera follow, ×N badge (avg speed > 6 m/s). 24/24 + lint. QA (test3d, swiftshader 800×500): model at the airport; 20 m trip walks, far trip runs with ×8 badge and follow cam, ends idle on the spot, badge hides; frame ≈ 205–360 ms in swiftshader (no GPU); no pageerror.
- [x] T-008: Reserves grow every week and get promoted on payday — Growth.grow extracted (teams + reserves); PROMOTE {gap 3} + World.promote on payday; new test (8 weeks growth, forced promotion, 4-player teams, pool sizes); 23/23 + lint; goldens untouched
- [x] T-009: Academy squad — rename, leave, and the "alone" state — Academy squad rename, World.leaveAcademy, run.academy (create + repair), Run.mates → [] when alone, Team drawer Leave squad + inline confirm + alone line; 23/23 + lint; goldens untouched; QA: leave → alone line, 28 weeks alone without error, no pageerror. Deviation: one-line guard in js/career/events.js (unlisted file: Events.roll picked a mate from an empty list → crash; also skips {mate} events while alone); goals.js needed no change (already guarded)
- [x] T-010: `Eval` — monthly evaluation rules and calendar (headless) — js/career/eval.js (kind, setup, squad, lend/restore, bench); CALENDAR eval weeks 4–24 + camp 26–28; weekType, nextWeek, repair, goals (academy-only win goal) wired; tests switched to eval/bench + new 'evaluation rules' test; 24/24 + lint; goldens untouched. Added to lend/restore: `cap` flag and court `slot` (engine positions by p.slot; drawn wings could share W0/W1)
- [x] T-011: Evaluation week — match, bench, and the eval card — evalPanel + `Cup.fixture(run,'eval')` (Academy/faction squads lent via Eval.lend, restored on finish/leave); not selected → bench button. 24/24 + lint, goldens untouched. QA: wk4 Academy card → Sim → wk5; Wei wk8 faction card → match view, no pageerror.
- [x] T-016: Remove Legacy (unlocks, points, pure runs, Hall of Fame, legends) for good — legacy.js deleted, career-legacy.js → career-end.js; Run.create always free agent; 21/21 + lint; grep clean (renamed chart-legend class to chartkey); goldens/engine untouched; QA: menu/create/run-end via Sim ⏭ (rank C + chart), no pageerror. Note: CLAUDE.md line 62 still lists “legacy” among ui screens
- [x] T-017: `Dossier.build(run, r)` — DOM-free faction dossier model — Dossier.build in js/career/dossier.js; new test (state, places incl. seized, roster gate, minor); 22/22 + lint; goldens untouched; headless only. Unscouted place quality = the region's advertised q (no qMul)
- [x] T-018: Faction dossier window — ui/career-dossier.js, HQ Dossier button, Factions-drawer name links, modal in hub, Esc closes; 22/22 + lint; QA: Wei dossier — 7 facilities = map, roster “unknown” until scouted then ratings; Shu opened from the Factions drawer; row click → map spot; no pageerror (screenshots taken, not committed)
- [x] T-001: Rename Sacred Shrine Park → Central Academy — names/comments only; 21/21 + lint; career-run visual QA not run.
- [x] T-002: Facility access gate (grudge + owner condition) — ACCESS in world.js, City.access + gate in City.can; new test; 21/21 + lint; console QA not run.
- [x] T-003: Ball shadow circle on the floor — marker follows the ball exactly, hidden with it; widens + fades with height. Owner change in build chat: white outlined ring, no fill.
- [x] T-004: Spike approach — run-up point, take-off before the ball — QA 42 non-quick attacks: take-off 0.6–1.2 m in 90.5 %, end-of-set distance max 0.054 m, 0 over-sprint moves. Added: `direct` (too far to run up → straight to take-off), `via` back attack 2nd leg ends at take-off. Fix: jump serves excluded from approachOf.
- [x] T-005: 2–3 more line variants for every cut-scene kind — e282653 — 20 kinds × 5 personalities, 5–6 lines each (min 5, max 6), 245 added, all ≤ 40 chars; golden diff = `matches` only; 21/21 + lint; Max Hype scenes show new lines, no pageerror (bubble fit not visually confirmed).
- [x] T-006: Faction reserves — every faction becomes a roster (pool) of players — pools Wei 20 / Wu 14 / Shu 10 / Outlaws 6 / Gloria 5 (reserves 12/6/2/2/1 after league players); RUN_VERSION 2; Hard also boosts reserves; 22/22 + lint; goldens and js/engine untouched; QA: new run loads, map/HQ fine, no pageerror
- [x] T-007: `Pool.draw` — weighted squad draw from a faction pool — DRAW in world.js, Pool.draw in pool.js (you placed first in your role slot at standing ≥ 60; a free agent is never a candidate; role shortage → best remaining); new test; 23/23 + lint; goldens and js/engine untouched; headless only

## Unplanned changes
(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md)
- (recorded in spec §4.9) 2026-09-30: Owner: keep only the 3D map — removed the SVG renderer (`js/ui/map-svg.js`), panzoom, the 3D toggle and `KEYS.map3d`; `MapView` loads map3d.mjs directly (notice if WebGL fails). MapModel and the rules are unchanged. Pins, labels, fog, selection and seized patches are not drawn until T-025; until then places cannot be picked (travel by clicking land works). Dead SVG map CSS (`.city`, `.pin`…) left in css/career.css.
- (recorded in spec §2.9) Blocker choice: the front-row MB is main blocker on every attack they can reach (was: only quick/pipe/middle); the wing fills the gap — js/engine/rally.js (formBlock), ARCHITECTURE.md, tests/golden.json (updated).
