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
- **Phase 4 — U21 Final Cup** (now): bracket with byes (T-019); U21 cup from drawn squads (T-020). The 8 league
  teams stay as faction home squads.
- **Block tactics** (T-026/T-027) → **Substitutions** (T-028–T-031), after Phase 4.
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — Phase 4: U21 Final Cup

### [ ] T-032: Match background music (owner track, 50 % volume)
Spec: §2.11          Goldens: unchanged          Save: no change
Goal: While the match screen is open, `assets/audio/the_big_fight.mp3` loops as background music at half the effects
volume; it obeys the 🔊/🔇 toggle and the volume slider, and fades out when you leave the match.
Files: js/audio/sfx.js, js/game/state.js, ARCHITECTURE.md (the mp3 is already in the repo and on the artifact)
Do not:
- Use `new Audio()` / `<audio>` or blob: URLs (artifact host may block them): `fetch` → `arrayBuffer` →
  `SND.ctx.decodeAudioData` → looping `AudioBufferSourceNode`.
- Route the music through `SND.master` (compressor pumping, slow-mo low-pass, reverb): give it its own gain node
  straight to `SND.ctx.destination`.
- Draw R()/rnd() or touch js/engine; play anything in headless tests (no AudioContext there → silently no-op).
- Load the file before the first match; decode it only once (cache in `SND.bgmBuf`; later matches reuse it).
Steps:
1. js/audio/sfx.js: fix the header comment (no longer "no audio files"). Add `const BGM_URL = 'assets/audio/the_big_fight.mp3',
   BGM_GAIN = 0.5;` and fields `SND.bgm` (gain node), `SND.bgmSrc`, `SND.bgmBuf`.
2. `bgmStart()`: needs `SND.ctx` (call after `audioInit()`); if already playing, return; fetch + decode once (guard
   against a second call while loading; any failure → one `console.warn`, no retry spam); new looping source →
   `SND.bgm` gain → destination; gain ramps from 0 to `BGM_GAIN * SND.vol * (SND.on ? 1 : 0)` over 1 s.
3. `bgmStop()`: ramp gain to 0 over 0.6 s, then stop and drop the source; safe to call when nothing plays.
4. `toggleSound` and `setVolume` also set the music gain (`setTargetAtTime`, same formula).
5. js/game/state.js `navigate`: after the screen renders, `name === 'match'` → `bgmStart()`, any other screen →
   `bgmStop()` (`startMatch` already calls `audioInit()`). The result overlay keeps the music until you leave.
6. ARCHITECTURE.md: audio section — music path (own gain → destination), volume rule, start/stop in `navigate`.
Accept: all tests + lint; goldens untouched.
QA: Monster game → `SND.bgmSrc` exists and `SND.bgm.gain.value` ≈ 0.5 × SND.vol after 1.5 s; 🔇 → 0; 🔊 → back;
leave to menu → gain 0 and `SND.bgmSrc` null after 1 s; start a second match → no second fetch (network log); no
pageerror. (Swiftshader has no speakers — check the numbers, not the sound.)
Result:

### [x] T-019: Brackets of any size with byes
Spec: §4.11          Goldens: unchanged          Save: no change
Goal: `js/game/bracket.js` handles 8 or 16 entrants, with byes (null entries) that resolve automatically, so the
U21 Final Cup can seat 12–13 squads.
Files: js/game/bracket.js, tests/run.js
Do not:
- Change behaviour for an 8-entry order (the current cups keep working until T-020): same entries, same rounds.
- Draw randoms.
Steps:
1. `newBracket(order)`: `order.length` is 8 or 16 (entries may be `null` = bye). Round names by size: 16 → 'Round of
   16', 8 → 'Quarterfinal', 4 → 'Semifinal', 2 → 'Final'. First round = pairs of `order`.
2. `advanceBracket(sched)`: before returning an unplayed entry, auto-resolve byes (`a` or `b` null → `w` = the other,
   `res` = null; both null → `w` = null and mark `bye: true` so it is skipped); build the next round from the
   previous round's winners in order; return null after the Final. Keep the doc comments accurate.
3. `bracketChampion(sched)`: the winner of the entry with `round === 'Final'` (null until played).
4. New helper `seedOrder(n)` (allowed new global) → standard seeding positions for n = 8 / 16 (1 plays n,
   e.g. 16: [1,16,8,9,5,12,4,13,3,14,6,11,7,10,2,15]); used by T-020.
5. tests/run.js — new test `'bracket: 8 and 16 entries, byes'`: an 8-order bracket gives 7 matches QF/SF/F as today;
   a 16-order with 3 nulls in the bottom seeds plays 12 real matches and crowns one champion; byes never reach the
   caller of `advanceBracket`.
Accept: all tests + lint; goldens untouched.
QA: none (headless).
Result: bracket.js handles 8/16 slots with byes (BRACKET_ROUNDS/BRACKET_NEXT, seedOrder hard-coded: 8 = old Grand Cup order, 16 = the task's list); new test 'bracket: 8 and 16 entries, byes'. 25/25 + lint, goldens untouched, headless only.

### [x] T-020: U21 Final Cup — one cup of drawn squads replaces the Skyline and Grand Cups
Spec: §4.11, lore.md §3 (the U21 champion goes to the national team)          Goldens: unchanged (career only)
Save: RUN_VERSION 2 → 3 (`run.cup` gains `entrants`, `me`; `run.cups[].champ` becomes a name) — older saves dropped
Goal: After week 28 the U21 Final Cup starts: every faction's pool is drawn into squads (Wei 5, Wu 3, Shu 2, Outlaws 1,
St. Gloria 1) plus the Academy squad if you are still in it; a 16-slot bracket seeded by rating (top seeds get byes).
You play if your side is in it; otherwise you watch it from the stands. Winning ends the season as champion.
Files: js/data/career.js, js/data/world.js, js/career/cup.js, js/career/eval.js, js/career/run.js,
js/ui/career-week.js, js/ui/career-end.js, js/ui/career-hub.js, tests/run.js, ARCHITECTURE.md
Do not:
- Remove the 8 league teams (they stay as faction home squads for training, bonds, scouting and transfers).
- Touch js/engine or reward numbers other than the new 'Round of 16' entries below.
- Leave players lent after any match (yours or simulated): always `Eval.restore()`.
Steps:
1. js/data/career.js: `CUPS = [{ id: 'u21', after: 28, name: 'U21 Final Cup', short: 'U21', mul: 1.5, seeded: true }]`
   (doc comment: the season's one cup; the champion goes to the national team). `PLACES` gains
   `'Round of 16': { fans: 150, sp: 10 }`; js/data/world.js `ECON.place` gains `'Round of 16': 50`.
2. js/career/eval.js: `squad(run, ids, name, color, region)` — find players in `Pool.players(run, region)` + you +
   `run.pickup.P` (region defaults to `run.eval.region` as today). Update callers.
3. js/career/cup.js:
   - `entrants(run)` → list of `{ name, short, color, region, ids, academy }`: for each region in `POOL` order,
     every squad of `Pool.draw(run, r)` named `${REGIONS[r].name} ${roman(i+1)}` (I, II, …; colour = region colour);
     then, if `World.isFree(run) && run.academy !== false`, the Academy squad (`academy: true`, ids of `run.pickup.P`).
   - `start(run, def)`: `sta` refill as today; `E = entrants(run)`; `me` = index of the entrant containing your id
     (−1 if none); order by entrant rating (build each with `Eval.squad`, read `ovr`, no lend) → `seedOrder(16)`
     positions, empty seeds = null; `run.cup = { id, entrants: E, me, sched: newBracket(order), done: false }`.
     Log; if `me < 0`: log "You watch the U21 Final Cup from the stands." and `Cup.close(run, NO_CUP)`.
   - `team(run, i)`: the Academy entrant → `run.pickup`; else `Eval.squad(run, E[i].ids, E[i].name, E[i].color,
     E[i].region)` with `short: E[i].short`.
   - `next` / `simulate` / `fixture('cup')` / `result` use entrant indexes and `run.cup.me` instead of `run.team`;
     `simulate` and your match lend both squads (`Eval.lend`) and restore right after (finish and leave).
   - `close` records `{ id, place, champ: E[bracketChampion(...)].name }`; champion → `Cup.end`. With one cup,
     every close ends the run (`Cup.end`).
   - Remove `warmupOpponent` and the 'warmup' branches (nothing uses them after T-011).
4. js/career/run.js: `RUN_VERSION = 3` (comment: v3 — cup entrants; older saves dropped). `endWeek` already starts
   the cup from `CUPS`.
5. UI: `cupPanel` renders the bracket by rounds present in `sched` (Round of 16 → Final) using entrant names/colours;
   `mine` = `run.cup.me`; info text drops "the season goes on to the Grand Cup". `calendar` shows one U21 pip.
   `career-end.js`: headline = champion → `U21 champions — ${team name}. The national team is calling.`, else
   'Season over'; cup line "won by {champ name}"; remove the Double Crown logic.
6. tests/run.js: the full-run tests expect `cups = ['u21']` (placing may be NO_CUP when you're not in it); new test
   `'career: U21 Final Cup — entrants, seeding, byes, restore'`: a fresh academy run forced to week 29 start → 13
   entrants, 3 byes, `me` = the Academy entrant; simulate the whole bracket → one champion name, every
   `p.team` restored to its real team, pool sizes unchanged; a Shu member with standing 60 → `me` ≥ 0; alone → `me` −1
   and placing NO_CUP.
7. ARCHITECTURE.md: cup section rewritten (entrants, seeding, lend/restore).
Accept: all tests + lint; goldens untouched.
QA: career run with Short season → reach the cup (end weeks; Sim ⏭ evaluations) → bracket shows Round of 16 with byes,
your Academy squad seeded; Sim ⏭ through to the end → run-end screen names the champion. No pageerror.
Result: U21 Final Cup as specced (13 squads → 16-slot bracket, 3 byes, RUN_VERSION 3, warm-up code removed; Cup.roman added as a Cup property, no new global). 26/26 + lint, goldens untouched; QA: Academy run → W29 bracket with byes, Sim ⏭ to run-end naming the champion, no pageerror.

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
