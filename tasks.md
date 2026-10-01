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
- Growth rework ✓ (T-034 training cap 75, T-035 match XP, T-036 techniques learned in play).
- Living map A ✓ (T-039, T-040) · three-touch fix ✓ (T-043) · rankings ✓ (T-041, T-042) · team challenge ✓ (T-037).
- Rankings drawer fix ✓ (T-044).
- Challenge loss + injury ✓ (T-038).
- Roads + buildings ✓ (T-045 layout data, T-046 3D town).
- **Now**: the player walks the roads (T-047). **Next**: match history (T-052), town layout revamp (T-050 data, T-051 render). Then road travel (T-048), injured-sub fix (T-049), voice pass (T-022).
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — Roads, settlements and buildings (spec §4.18)

### [x] T-047: The player walks along the roads
Spec: §4.18, §4.9          Goldens: unchanged          Save: no change
Goal: When you travel, the avatar follows `you.route` (the road path) instead of a straight line, with the same 1.2–6 s
trip time and ×N time-lapse badge (now based on the path length).
Files: js/ui/map-view.js, js/map3d/avatar3d.mjs, js/map3d/map3d.mjs, ARCHITECTURE.md
Do not: change rules or trip costs; let the avatar leave the terrain (keep `heightAt`); call `City` from js/map3d (the
renderer reads only the model).
Steps:
1. avatar3d `setTarget(at, path)`: when `path` has 2+ points, walk the polyline at constant speed with the same
   trapezoid speed profile over the whole length; face along the current segment (smoothed); fallback straight line.
2. map-view.js (UI layer) remembers the last `you.at` it passed on; when it changes it adds
   `model.you.route = City.route(last, you.at)` before `update(model)`. map3d passes `you.route` to the avatar; the camera
   follow keeps working.
Accept: all tests + lint.
QA: career run → travel from the airport to Shu: the avatar follows the coast road then the mountain path; ×N badge
shows for a long trip; no pageerror.
Result: Done; tests 41/41, lint clean. Airport → Highland Dojo QA: the camera follows the coast road then the Shu dirt road (not the straight line), ×4 badge shown, no pageerror. `MapView.routed` adds `you.route` on mount and update (also on a remount after a move).

## Next — Match history (spec §4.20), town layout revamp (spec §4.19)

### [ ] T-052: Match history in the Season drawer, with a stat snapshot per match
Spec: §4.20          Goldens: unchanged (career / UI only)          Save: RUN_VERSION 7 → 8 (`run.mlog`) — older saves dropped
Goal: Every match you are in (eval, cup, challenge, street fight) is recorded with your stats at kick-off, your line and
the box score; the Season drawer lists them and opens one to show the snapshot.
Files: js/data/career.js, js/career/cup.js, js/career/run.js, js/ui/career-week.js, js/ui/career-hub.js, css/career.css,
tests/run.js, ARCHITECTURE.md
Do not: touch js/engine or the match screen; change any reward; draw randoms; store player objects or team refs in the
log (plain numbers and strings only — the save must stay small).
Steps:
1. career.js: `MLOG = { max: 80 }` (entries kept; oldest dropped).
2. cup.js: `Cup.record(run, m, kind, extra)` → pushes onto `run.mlog` and trims to `MLOG.max`:
   `{ week, day: Run.dayNo(run), kind: 'eval' | 'cup' | 'challenge' | 'street', vs (opponent name), short, score
   [yours, theirs] (first set as today), win, grade (null if you did not play), played, round? (cup), stake? (challenge),
   you: { ovr, power, def, speed, jump, wit } (BEFORE this match's XP), line: { k, att, err, blk, ace, dig, ast },
   box: [{ name, role, side: 0 | 1, ovr, k, att, err, blk, ace, dig, ast, you? }] (everyone in m.played, both teams) }`.
   Call it at the start of `Cup.result`, `Cup.challengeResult` and `Cup.clashResult` (before Growth.matchXp), so the
   snapshot is the kick-off state.
3. run.js: `mlog: []` in create + repair (array check); `RUN_VERSION = 8` with the comment line extended.
4. career-week.js `matchLog(run)`: a panel "Match history" — one row per entry, newest first: `W12 · Challenge · vs
   Wu Navy Fort · 21-18 · W · A` (bench: "did not play"); each row is a `fold` (key `ml<index>`) whose body shows
   (a) your snapshot: OVR and the 5 stats, each with the change since the previous entry (+2 / −1, blank if none);
   (b) your line; (c) the box score as a compact table (`table.rk` style: your row `tr.you`, the two sides split by a
   heading row with the short tags). Empty state: "No matches yet."
5. career-hub.js: the `season` drawer appends `matchLog(run)` after the season card. css: only what the table needs.
6. tests `'career: match history'`: a sim eval, a challenge and a street fight each add one entry with the right kind,
   score and win; `you` equals the stats before the match (compare with a copy taken before); box has every played id
   once, plain JSON (JSON.parse(JSON.stringify(entry)) deep-equals it); trimming at MLOG.max; repair adds `mlog`.
7. ARCHITECTURE.md: the record and save v8 (the spec chat updates CLAUDE.md at review).
Accept: all tests + lint; goldens untouched.
QA: career run → play (⏭) an evaluation and a challenge → Season drawer lists both, newest first; open one: snapshot,
your line and box score fit the drawer (no horizontal scroll); no pageerror.
Result:

### [ ] T-050: Town layout data — districts, a wider beach, Wu town inland, the overpass
Spec: §4.19, §4.18          Goldens: unchanged (career / map only)          Save: no change
Goal: The island's layout data matches the lore: buildings fill districts (Wei downtown / Old Town / Ring, Gloria
compound, Wu town, harbor, beach strip, Outlaws under the overpass, Shu villages, Academy campus), the Wu beach is wider
(coast grown outward), Wu town moves inland behind the dunes, and the overpass and boardwalk exist as roads.
Files: js/data/city.js, js/data/world.js, js/career/mapmodel.js, tests/run.js, ARCHITECTURE.md
Do not:
- Move any region border: freeze `CITY.inner` as literal points first (today it is computed from the coast; the Wei–Wu
  line `wuWei` uses inner[6..8] = [854,199], [883,305], [850,412]).
- Change trip-day rules, `NEAR_R` / `TRIP_DAY`, saves, or anything in js/map3d (T-051 draws it).
- Draw randoms: lots stay hashes of fixed data (hstr), so the same run state gives the same model.
- Invent names: districts get ids, not place names (old-language names wait for lore §8).
Steps:
1. Map frame: `CITY.w` 1060, `CITY.h` 700 (all coordinates stay as they are; the new room is sea to the east and south).
2. Coast: push the Wu stretch outward — coast[5] → [846,68], [6] → [972,154], [7] → [1010,297], [8] → [969,441],
   [9] → [883,564], [10] → [726,637], [11] → [545,657], [12] → [360,632], [13] → [215,573]. Add `CITY.dunes` = the old
   coast points 6–12 ([930,170] … [380,592]): the beach's inner edge; the sand is between `dunes` and the coast.
   `CITY.beach` becomes the new coast points 6–12.
3. Places (SPOTS / HQ / HOME_AT / ROADS nodes move together; every one stays in its region, on land, not on a road):
   - On the sand (between dunes and coast): `sand`, `pier` (at the new waterline), `bonfire`, `dunes`, `home:studio`
     (the beach shack).
   - Wu town, inland: `hotelWu`, `hq3` (Wu Fort) at least 40 units inside the dune line, south of the Wei border.
   - Harbor district (east coast, may touch the dunes): `harbor`, `hq2`.
   - `REGIONS.wu.at` / `CITY.label.wu` follow Wu town; `airport` stays at [470,600] (it is now on the beach band).
4. Roads (ROADS): add kinds `boardwalk` (along the dune line, sand ↔ pier ↔ bonfire ↔ the old resort strip) and
   `overpass` (an elevated main road from downtown Wei (`jW2` or `weiSpeed`) to the harbor (`jWu2`), passing over the
   Outlaws patch: 2–4 edges). Reconnect the coast road through Wu town; every node still reachable from `airport`.
5. `DISTRICTS` (new constant in city.js): `[{ id, region, style, poly or { x, y, r }, gap, density, size, kinds, tall? }]`
   for: wei-downtown, wei-oldtown, wei-ring, gloria (compound), wu-town, wu-harbor, wu-beach (strip along the
   boardwalk: resort, kiosk), outlaws (under the overpass), shu-village ×3–4 (round HQ7 / the highland home, HQ4 / the
   steps, the shrine / dojo, the trail), academy (campus). New lot kinds (T-051 gives them meshes): rowhouse, barracks,
   workshop, market, warehouse, resort, kiosk, terrace. `tall` (0–1) lets downtown lots grow taller toward its centre.
6. MapModel.lots: fill each district with a grid (spacing `gap`, aligned to the nearest road, a hash vs `density`),
   skipping water, other regions, roads (within setback), places / HQs (NEAR_R / 3), other lots; beach districts only
   on the sand, others never on it. Keep the road-side lots outside districts but at density × 0.4 (countryside).
   Each lot gains `h` (0–1: height factor) and `district`. `maxLots` 1400. Target counts (±20 %): Wei ~600, Wu ~300,
   Shu ~150, Outlaws ~60, Academy ~40, Gloria ~30.
7. MapModel.land gains `dunes` (the dune line), `districts` ([{ id, region, style, poly }] for walls / tinting) and a
   `ritual` landmark (kind `ritual`, a sand circle by the Academy on the old ritual ground; no pin, no label).
8. tests: frozen borders (regionAt of a dozen fixed points unchanged); every place / HQ / home in its region and on
   land; beach places between dunes and coast, Wu-town places inland; all nodes reachable; lot counts per region in
   range; lots deterministic and never on water / roads / other regions; `MapModel.build` draws no R().
9. ARCHITECTURE.md: districts, the beach band, the new road kinds.
Accept: all tests + lint; goldens untouched.
QA: none needed (data only; T-051 draws it) — report the lot counts per region in the Result.
Result:

### [ ] T-051: Draw the revamped town — wide beach, boardwalk, overpass, new building kinds
Spec: §4.19, §4.18          Goldens: unchanged          Save: no change
Goal: The 3D island shows T-050's layout: a wide sand beach on the Wu coast, a boardwalk, the overpass on pillars with
the Outlaws under it, the Gloria wall, the new building kinds, taller downtown towers, and the ritual sand circle.
Files: js/map3d/map3d.mjs, js/map3d/town3d.mjs, js/map3d/kit3d.mjs, ARCHITECTURE.md
Do not: read rules or call City / MapModel from js/map3d (model only); add a new draw call per lot or per landmark;
load external models (procedural only; the KIT registry stays swappable).
Steps:
1. Terrain: sand (flat, low) between `land.dunes` and the coast on the Wu stretch; the old narrow BEACH slope elsewhere.
2. Roads: `boardwalk` = wooden planks ribbon just above the sand; `overpass` = deck ~7 m up on pillars every ~20 m
   (one merged mesh for decks + pillars), ramps at both ends down to the ground road.
3. KIT: meshes for rowhouse, barracks, workshop, market, warehouse, resort (faded, pastel), kiosk, terrace (stepped
   house on a slope); lot height × (1 + 1.5 × `h`) so downtown rises toward its centre.
4. Districts: a wall ring round the Gloria compound with the gatehouse at its road; an optional faint ground tint per
   district style (no new draw call if folded into the terrain colours).
5. LANDMARKS `ritual`: a worn sand circle with a ring of low stones.
6. Budget at default zoom vs T-046 (28 calls / ~157k tris incl. shadows): ≤ 40 draw calls, ≤ 260k tris; frame time in
   swiftshader not more than 25 % worse; fog dimming covers every new mesh.
Accept: all tests + lint.
QA: career run with the whole map revealed: zoomed out, Wei reads as a dense city with a tall downtown, the Wu coast as a
wide beach with a boardwalk and an inland town, the overpass over the Outlaws, Shu as scattered villages; zoomed in on
downtown, the walk along a road between towers; leave / return 3× without leaks; draw calls and tris in the Result;
no pageerror.
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Roads, part 2 — spec §4.18
- T-048: Road travel — trip days from the road route length (roads faster than cross-country; Shu paths slower);
  rules + tests change (career only).

Injuries, part 2 — spec §4.15
- T-049: The engine coach never subs an injured you on (evaluations, cup): mark the player unavailable for
  `subCandidate` (engine-only flag set by the career before the match; goldens must stay unchanged).

Phase 5 — Voice pass
- T-022: Faction `front`/`dark`, region `desc`, Gazette and event strings in lore.md §7 voices. Also fix the stale
  encyclopedia line "Or learn it in career for this many skill points" (ui/encyclopedia.js: techniques are learned in play).

## Done

- [x] T-046: Roads and buildings on the 3D map (kit registry, procedural first) — Done; tests 41/41, lint clean, goldens unchanged. kit3d.mjs (KIT + LANDMARKS registry) and town3d.mjs; +4 draw calls (28 vs 24) and +6k tris (156.7k vs 150.7k incl. shadow pass) at default zoom; 3 leave/return cycles: geos stable (24), no pageerror. Roads connect places; Wei/Wu/Shu read by style at zoom-out. Lot scale (size × MAP_M × 1.2) is a first guess.
- [x] T-045: World layout data — road network, routes, settlement lots, landmarks — Done; tests 41/41, lint clean, goldens unchanged, headless. 49 nodes / 60 edges (all on land, all reachable from the airport; `studio` home spot is `home:studio`); 163 lots on a fresh run (far under the 1200 cap; density / gap are first guesses for T-046 to tune by eye); 0 R() draws in MapModel.build. Also exported `MapModel.maxLots` and a lot cache `MapModel.lotCache` (properties, not globals).
- [x] T-038: Losing is a real deal — loss penalties, fatigue and injury — Done; tests 40/40, lint clean, goldens unchanged, RUN_VERSION 7. Deviations: street-fight losses add no `run.losses` count; new `City.crewOvr` (street foe rating = mean of the region's league clubs) and `City.fightBan`; risk computed before the trip. Open: engine coach subs could bring an injured you on (T-049). QA: risk 16 → 27 % on low stamina, loss line lists penalties + minor injury, 45 % cap, buttons disabled "Injured — rest first"; no pageerror.
(one line each; full task text is in git history)
- [x] T-044: Rankings drawer table fits the drawer — Done; tests 39/39, lint clean, goldens unchanged. Also: your row's class `me` clashed with `.hub .me` (HUD player card) and broke its layout, so it is now `tr.you` (js/ui/career-week.js, one word). QA at 1280×800: 4 columns inside the 440 px drawer on Register and Gazette, no cell overflow, no horizontal scroll, your row highlighted; screenshot checked; no pageerror.
- [x] T-039: MapModel `life` — who is where this week, as plain data — Done as specified; tests 36/36, lint clean, goldens untouched, headless only. `life.crews` also carries `team` (club index) and `mates` uses the nearest explored place of the key to home.
- [x] T-040: Living map — figures, battle crowd, border pulse, flags (renderer) — Done; tests 36/36, lint clean, goldens untouched. Only the Wei–Wu border has a line, so the pulse and patrols use it (other borders: no line yet). QA (swiftshader, forced state): battle crowd 24 + 2 flags + dust, unscouted crew grey / scouted coloured, mates at their court; draw calls +4 (≤ 6); leave → 0 canvases, return → 1; geometry count 19 → 20 after return (avatar model loads late); no pageerror. Frame time not measured.
- [x] T-043: Three touches after a pop-up — the save is the set (scramble ball) — Done; tests 39/39, lint clean, goldens updated (`teams`, `sims`: pop-up saves no longer get a full set + attack). The new phase is `saveSet` (not `scramble`: hype.js already has one); tallies `m.scr` / `m.scrLog` are created lazily (match.js untouched). 300 sims: 0.85 scramble possessions per match, 86 of them went over as a bump, hitter is never the popper or the saver. QA: Monster game ran 400 steps, no pageerror (no pop-up came up in that window; the animated path is covered by the recorded-beats tests).
- [x] T-041: `Rank` — the three rankings as plain data — Done as specified; tests 37/37, lint clean, goldens untouched, RUN_VERSION 6 (old saves dropped). Register rows hide the true OVR (only the order uses it); you get no faction-share points; Rank.settle/meet hooks also in city.js (clashEnd, watch, hustle). The Limit Break test's RUN_VERSION assert updated 5 → 6.
- [x] T-042: Rankings drawer + ranks on match and challenge cards — Done; tests 39/39, lint clean, goldens unchanged. Drawer id `rank` in `HUB_DRAWERS` (+ `CW.rank` tab key, `rankCard`/`rankTab`/`rankBest`/`RANK_TABS` in career-week.js). QA: 3 tabs, your row highlighted, 18 unrated rows before scouting, gazette 20 rows, street empty-state, opponent line renders, no pageerror (rated-after-scouting not re-driven in browser; covered by the Rank tests).
- [x] T-037: Team challenge — challenge a club, it may refuse you — Done; tests 38/38, lint clean, goldens untouched. Deviations: CHALLENGE also has `standPer` 10, `doubt` 3, `doubtP` 0.5 (and CHALLENGE_WHY for the card text); a doubtful club is decided by a hash of week/club/stake (not a roll); acceptance spends nothing until the match ends (refusal spends trip + day); Wu ignores the stake; odds = clamp(1.5 + gap/20, 1.2, 3). QA (career-map): verdict 'refuses — No stake, no game' at $0 → 'likely' at $50 for the Outlaws, ⏭ played and settled the stake, a $0 ask logged the refusal; no pageerror.
- [x] T-034: Training stops at 75 — remove Limit Break — Done as specified; tests 33/33 (full run asserts ≤ max(75, start stat) until T-035), lint clean, goldens untouched; RUN_VERSION 5.
- [x] T-035: Match experience — your performance × opponent strength — Done as specified; tests 34/34, lint clean, goldens untouched. Report (short season, 5 seeds, WS, power-only training incl. the cup): training only 75.6 avg power (ovr 67.8) vs also playing every eval 78.2 (ovr 69.0). QA: Sim ⏭ eval line shows "XP: … (×0.3 vs a weaker side)".
- [x] T-036: Techniques learned in play (basic skills stay in the shop) — Done as specified; tests 35/35, lint clean, goldens untouched. Growth.matchXp now takes (run, m) and shares `Growth.matchGap(m)` with tryLearn. Not touched (unlisted): the encyclopedia card still says "Or learn it in career for this many skill points" (ui/encyclopedia.js:26,47) — stale now. QA: shop shows 8 techniques as "learn in matches"; scouted HQ roster and dossier list techniques; no pageerror.
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
- (recorded in spec §4.6 / §2) Street battle "Fight for X" is now a real match (watch or ⏭ sim) with match XP, techniques and grade; `City.clashP` and `MATCH_XP.clash` / `CLASH.par` removed. Files: js/career/cup.js, city.js, js/data/career.js, js/data/world.js, js/ui/career-map.js, tests/run.js, ARCHITECTURE.md.
- (recorded in spec §4.6 / §2) Box score (player table in the match screen) gains an OVR column — js/ui/match-screen.js.
- (recorded in spec §4.6 / §2) Added (.vrm) player models now apply to your own career player only (everyone else keeps the base model) — js/render3d/actors3d.mjs, js/ui/models.js, js/ui/menu.js, ARCHITECTURE.md.
- (recorded in spec §4.6) Street-battle crews and your faction's evaluation squad show their real 3-letter team tag instead of 'EVL' (Eval.squad takes a `short`; 'EVL' only for the opposing evaluation squad) — js/career/eval.js, cup.js.
- (recorded in spec §4.2) Central Academy moved to the Wei–Wu–Shu border tri-point (540, 500), north of the airport: park r 72→60, label, `park` spot, `park` / `jAc1` / `jAc2` road nodes, Academy road `park→dojo` replaced by `park→stone` — js/data/city.js, tests/run.js (route / regionAt coordinates).
