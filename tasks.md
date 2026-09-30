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
- **Block tactics** (T-026/T-027) → **Substitutions** (T-028–T-031), after Phase 4.
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Block tactics (after Phase 4) — spec §2.9
- T-026: Lane-read block in the engine (edge / close / swing / bunch-for-pipe; read quality from wit + speed);
  rebalance to ~14 % stuffs with headless sims. Goldens: update.
- T-027: Defence setting (Read / Commit / Bunch) for every team + match UI control; scouting reveals attack habits
  and defence setting (dossier + HQ panel).

Substitutions — spec §2.10
- T-028: Teams of 6 (4 + 2 bench): rosters, pools, draws, saves (RUN_VERSION bump), UI lists. Engine still plays 4.
- T-029: Engine substitution at a dead ball (new beat act kind `sub` + playback case: model swap, SUBBED label,
  coach chatter from the 4 lines); max 2 per set. Goldens: update.
- T-030: Simple coach AI (stamina / errors / coachIQ randomness) for every team.
- T-031: Your player benchable: starters by rating, form, standing; reduced rewards when benched.

Phase 5 — Voice pass
- T-022: Faction `front`/`dark`, region `desc`, Gazette and event strings in lore.md §7 voices.

## Done
(one line each; full task text is in git history)
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
