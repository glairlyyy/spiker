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
- **Substitutions** (now): squads of 6 (T-028), in-match subs (T-029), coach AI (T-030), you on the bench (T-031).
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — Substitutions (spec §2.10)

Model for all four tasks: `t.P` stays the 4 on court (engine, rotation, `t.s` / `t.mb` / `t.ws` unchanged); new
`t.bench` = the 2 substitutes (same `team` link). `squadOf(t)` = on court + bench. Everything that means "the club's
players" uses `squadOf`; everything that means "who is playing now" keeps `t.P`.

### [ ] T-028: Squads of 6 — 4 on court + 2 on the bench (data, pools, draws, saves, rosters)
Spec: §2.10          Goldens: update (team generation rolls 2 more players per team; match play itself unchanged)
Save: RUN_VERSION 3 → 4 (teams save `bench`; bigger pools) — older saves dropped
Goal: Every team (tournament, monster, league, reserves' draws, Academy squad, drawn squads) has 2 bench players.
Pools grow to Wei 24, Wu 18, Shu 12, Outlaws 6, St. Gloria 6 and squads are drawn 6 at a time. The engine still plays
only `t.P` (subs come in T-029).
Files: js/engine/teams.js, js/engine/save.js, js/data/world.js, js/career/pool.js, js/career/eval.js,
js/career/cup.js, js/career/world.js, js/career/growth.js, js/career/run.js, js/career/dossier.js, js/career/events.js,
js/career/goals.js, js/career/city.js, js/ui/career-week.js, js/ui/career-map.js, js/ui/career-dossier.js,
tests/run.js, tests/golden.json, ARCHITECTURE.md
Do not:
- Put bench players into `t.P`, or make js/engine rally/serve/match code read `t.bench` (T-029).
- Change `teamOvr` (rating stays the 4 starters) or the captain rule (captain = best leader on court).
Steps:
1. teams.js: new global `squadOf = t => (t.bench ? [...t.P, ...t.bench] : t.P)` (doc comment). `fillRoster`: after
   the 4, `t.bench = [mkPlayer(fr, <fr's slot: 'S' | 'MB' | 'W1'>, bon.bench || 0, t, used), mkPlayer('WS', 'W0',
   bon.bench || 0, t, used)]` (fr = the team's flex role). `mkMonsterTeams` passes `bon.bench = rnd(110, 150)`.
   `finalizeTeam`: leadership, elements and shirt numbers over `squadOf(t)` (numbers unique across all 6); captain
   and `ovr` from `t.P` only.
2. save.js: `teamToJSON` stores `bench` like `P` (players without `team`); `teamFromJSON` relinks `bench` (`team: t`),
   `_pid` covers bench ids; missing `bench` → `[]`.
3. world.js data: `POOL = { wei: 24, wu: 18, shu: 12, outlaws: 6, gloria: 6 }`; squad size constant `SQUAD = 6`.
4. pool.js: `build` counts `squadOf` of the league teams; `players` = league teams' `squadOf` + reserves; `draw`:
   squads of 6 = today's [S, MB, WS, WS] + 2 bench (the next best by the same weights, any role; you are never put on
   the bench by the draw — T-031); default n = floor(size / SQUAD). Returns arrays of 6 (first 4 = court order).
5. eval.js: `squad(run, ids, …)` — first 4 → `P`, the rest → `bench`; `lend` / `restore` cover the bench
   (`team` link only; bench `slot` untouched). cup.js: entrant ids of 6; the Academy entrant is `run.pickup` (6).
   Expected U21 entrants with default pools: Wei 4, Wu 3, Shu 2, Outlaws 1, Gloria 1 + Academy = 12 (4 byes).
6. Career code — grep `.P` in js/career and js/ui/career-*: switch to `squadOf` where it means the club's players:
   growth (`Growth.grow`), promotion (a reserve may replace a weaker same-role player anywhere in the squad),
   transfers, bonds / `Run.mates`, events picking a teammate, goals, scouting / club rosters, dossier roster (bench
   labelled "<squad> · bench"), `Run.you` (search `squadOf(Run.myTeam(run))`), `Cup.prepare` form (all 6). Keep `t.P`
   for "who plays". `Run.create`: you still replace the same-role player in `t.P`.
7. UI: Team drawer (career-week.js) lists the bench under a "Bench" sub-heading; the scouted club roster
   (career-map.js) and the dossier show bench players marked "bench".
8. run.js: `RUN_VERSION = 4` (comment: v4 — squads of 6; older saves dropped).
9. tests/run.js: pools 24/18/12/6/6 (reserves 12/6/0/0/0); draw → squads of 6, 4 court in [S, MB, WS, WS] order +
   2 bench, no player twice; U21 → 12 entrants, 4 byes; save → load keeps every bench player (ids, `team` link,
   numbers); new test `'teams: 4 on court + 2 bench, unique numbers, captain on court'` over mkTeams,
   mkMonsterTeams, mkLeagueTeams and the pickup squad. `npm run test:update` (reason in the commit).
10. ARCHITECTURE.md: team shape (`P` / `bench` / `squadOf`), save v4.
Accept: all tests + lint; goldens updated for this reason only.
QA: career run → Team drawer shows 4 + a 2-player bench; Wei dossier roster 24; U21 bracket (forced week 29) shows 12
squads; Monster game plays as before; no pageerror.
Result:

### [ ] T-029: Substitutions in the match — dead-ball swap, SUBBED label, coach line (stamina rule)
Spec: §2.10          Goldens: update (tired players get subbed: rallies change)          Save: no change
Goal: At a dead ball a coach swaps a tired player for a bench player (max 2 per set per team). The incoming model
takes the outgoing player's spot at once, "SUBBED" floats over them, and the coach says one of the four spec lines
with shirt numbers. After the match every team's lineup is exactly as it was before (career teams persist).
Files: js/data/rules.js, js/data/dialogue.js, js/engine/match.js, js/game/state.js, js/render/playback.js,
js/ui/match-screen.js, js/render3d/r3d.mjs, js/render3d/actors3d.mjs, tests/run.js, tests/golden.json,
ARCHITECTURE.md
Do not:
- Draw R() for this rule (T-030 adds the random part); pick lines by hash, not by R().
- Animate a walk-on; clone teams (the engine relies on `p.team === m.t[side]`).
- Leave a lineup changed after a match ends or is left mid-way.
Steps:
1. rules.js: `SUB = { max: 2, sta: 0.6, fresh: 0.9 }` (doc: per set per team; tired below `sta`; a bench player
   needs stamina ≥ `fresh`). dialogue.js: `SUBLINES` = the 4 lines of spec §2.10 with `{out}` / `{in}` placeholders.
2. match.js newMatch: `m.subs = [0, 0]`; `m.lineup0` = per side a snapshot `{ P: [...t.P], bench: [...t.bench || []],
   slots: {id → slot}, cap: t.cap }`; `m.sta` / `m.mood` also for bench players; stamina recovery in `end()` covers
   `squadOf` (bench keeps recovering). `restoreLineups(m)` puts P / bench / s / mb / ws / cap flags / slots back;
   called in `end()` when `m.over`, and by the match screen when leaving mid-match (step 5).
3. match.js `coachSubs(m, side)` (after `captainThink` in `end()`, only when `!m.over`): if `m.subs[side] < SUB.max`,
   the on-court player with the lowest stamina below `SUB.sta` goes off for the fittest bench player with stamina ≥
   `SUB.fresh` (same role first, else highest ovr). `subIn(m, side, out, inn)`: `inn` takes `out`'s index in `t.P`
   and `out`'s slot; `out` takes `inn`'s bench place; refresh `[t.s, t.mb] = t.P; t.ws = [t.P[2], t.P[3]]`; if `out`
   was captain, the best leader on court becomes captain (flags too); `m.pos[inn.id] = m.pos[out.id]`;
   `m.subs[side]++`. A player may come back later (it still counts). Beats (recording only): one beat
   `{ dur: 1500, acts: [{ k: 'sub', side, out, in }, { k: 'plabel', p: in, t: 'SUBBED' }, { k: 'coachtalk', side,
   text }, { k: 'log', t: 'Sub <team>: #<in> <name> in for #<out> <name>', c: 'set' }] }`; line index =
   (out.num + in.num + m.pts[0] + m.pts[1]) % 4.
4. Playback (new act kind `sub`, allowed by this task): `A.disp` gets entries for bench players too, flagged
   `bench: true`; every 2D draw loop and the 3D actors skip bench entries (the 3D side still loads their models at
   match start, hidden). `case 'sub'`: the incoming entry takes the outgoing one's position / pose, `bench` flags swap.
   `byId` (state.js) finds bench players. Box score / match stars include everyone who played (`m.stat`).
5. match-screen.js: `leaveMatch` and any other exit before the end call `restoreLineups(A.m)` first (safe twice).
6. tests/run.js: new test `'engine: substitutions — rule, limit, restore'`: 200 sims with `SUB.sta` as shipped → at
   least some subs, never > 2 per side per set; after each match every team's `P`, `bench`, slots, `cap` equal the
   snapshot; recorded matches: every `sub` act names a known player, and the "known players" check in the beats test
   accepts bench ids. Goldens update.
7. ARCHITECTURE.md: substitution flow, `sub` act, lineup restore.
Accept: all tests + lint; goldens updated for this reason only.
QA: Monster game with `SUB.sta = 0.95` set in the console before the match → a sub happens within a few rallies: in 3D
the new player appears in the old one's spot, SUBBED label, coach line; no model on court twice; after the match
`A.m.t[s].P` ids equal the starting ids; no pageerror.
Result:

## Next — Substitutions, part 2

### [ ] T-030: Coach AI — errors and coach IQ decide subs too
Spec: §2.10          Goldens: update (one extra roll when a sub is considered)          Save: no change
Goal: Coaches also sub a player who keeps making errors, and bring a rested starter back; a smarter coach (coachIQ)
acts at better moments, a weaker one more randomly.
Files: js/data/rules.js, js/engine/match.js, tests/run.js, tests/golden.json, ARCHITECTURE.md
Do not: add act kinds; roll R() when no candidate exists (keeps other matches' draws stable).
Steps:
1. SUB gains `errs: 3` (errors this set with fewer kills than errors), `back: 0.85` (a subbed-out starter with stamina
   ≥ back may return for the player who replaced them), `iq: [0.35, 0.9]` (chance range to act, by coachIQ 0 → 1).
2. `coachSubs`: candidates in order — tired (T-029 rule), erring, a rested starter coming back. If a candidate exists:
   one `R() < lerp(SUB.iq[0], SUB.iq[1], t.coachIQ)` → act; else wait. A low-IQ coach (< 0.5) with no candidate may
   not act at all (no roll).
3. Track errors per set per player (`m.setErr`, engine-only).
4. tests: over 200 sims, error-subs happen; high-IQ coaches sub tired players sooner on average than low-IQ ones.
Accept: all tests + lint.
QA: Monster game — log shows a sub with a reason; no pageerror.
Result:

### [ ] T-031: Your player can be benched — lineups, sub-outs, reduced rewards
Spec: §2.10          Goldens: unchanged (career only)          Save: no change
Goal: In career matches your coach picks the 4 starters from the 6 by rating, form and your standing; you may start on
the bench and may be subbed in or out like anyone. Rewards drop when you start or finish on the bench; never playing
gives a bench reward only.
Files: js/data/career.js, js/career/cup.js, js/career/eval.js, js/career/run.js, js/ui/career-week.js,
js/ui/match-screen.js, tests/run.js, ARCHITECTURE.md
Do not: change the engine sub rules (T-029/T-030) or keep lineups off the [S, MB, WS, WS] role order.
Steps:
1. career.js: `BENCH = { partMul: 0.6, standingPer: 20 }` (rewards × partMul when you started or finished on the
   bench; your selection score + standing / standingPer).
2. `Run.lineup(run, T)` before every career match you're in (eval, cup): for each court slot [S, MB, W0, W1] pick the
   best same-role player by `ovr + 6 × form` (+ standing / standingPer for you); the rest go to the bench (keeps roles
   valid; a missing role falls back to the best remaining). Your pre-match card shows "Starting" or "Bench" with the
   reason (the starter's score vs yours).
3. The engine records who played: `m.played` set of ids (on court at any point) — engine-only, no randoms (add in
   match.js only if T-029 has nothing equivalent; then add match.js to this task's files).
4. `Cup.result`: never played → no grade, no win bonus, the evaluation bench reward (`Eval.bench` wit XP) + result
   line "Watched from the bench"; started or finished on the bench → rewards × `BENCH.partMul`, grade as usual.
5. tests: a squad where you're the weakest WS → you start on the bench; a sim where you never come in → no grade,
   bench XP; a partial match → rewards scaled.
Accept: all tests + lint; goldens untouched.
QA: career run → an evaluation where you start on the bench: pre-match card says Bench; Sim ⏭ → reduced / bench result;
no pageerror.
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Phase 5 — Voice pass
- T-022: Faction `front`/`dark`, region `desc`, Gazette and event strings in lore.md §7 voices.

## Done
(one line each; full task text is in git history)
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
