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
- **M2 — three.js map** (now): scaffold + terrain (T-023), walking player (T-024), parity + default (T-025).
- **Phase 4 — U21 Final Cup** (after M2): bracket with byes (T-019); U21 cup from drawn squads (T-020). The 8 league
  teams stay as faction home squads.
- **Block tactics** (T-026/T-027) → **Substitutions** (T-028–T-031), after Phase 4.
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — M2: three.js island map (before Phase 4)

### [ ] T-023: 3D map scaffold — terrain, water, camera, click-to-point (behind a toggle)
Spec: §4.9          Goldens: unchanged          Save: no change
Goal: A "3D map (preview)" toggle in the hub Menu drawer switches the career map to a three.js island: terrain from
the coastline and regions, water, light, a fixed tilted camera with pan + zoom. Clicking land reports a map point
exactly like the SVG map (travel works). No pins or avatar yet. SVG stays the default and the fallback.
Background: `MapView` (js/ui/map-svg.js) is the renderer contract: `mount(el, model, {pick, point})`,
`select(id)`, `dispose()`. `mapMount(run)` (career-map.js) calls it after every `renderCareer()`, and `#mapwrap` is
re-created each time (innerHTML). The match renderer loads three.js as ES modules via `import()` (see `load3D` in
js/ui/match-screen.js and the import maps in index.html / test3d.html). Map data: `MapModel.build(run)` → `w`
(1000), `h` (640), `land.coast` / `land.regions[].poly` / `land.minors` (ellipses) / `land.park` (circle) /
`land.mountains` (points), `fog`, `pins`, `you`, `focus`.
Files: js/map3d/map3d.mjs (new ES module), js/ui/map-svg.js, js/ui/map-view.js (new classic script — index.html AND
test3d.html right after js/ui/map-svg.js), js/ui/career-map.js, js/ui/career-hub.js, js/core/storage.js (one key),
css/career.css, index.html, test3d.html, ARCHITECTURE.md
Do not:
- Change MapModel, City or any rule. Touch js/render3d/* (import from it only if needed later; not in this task).
- Re-create the WebGL renderer on every `renderCareer()`: one renderer + canvas per career screen; re-attach the same
  canvas into the new `#mapwrap` and call `update(model)`.
- Load textures from blob: URLs or external hosts (procedural colours only).
Steps:
1. Rename the SVG object `MapView` → `MapSVG` in js/ui/map-svg.js (grep: only js/ui/*.js use it; update comments).
2. js/ui/map-view.js: new global `MapView` facade with the same contract plus `update(model)`: uses `MapSVG` unless
   `MAP3D.on` (a small settings object persisted with `store` under a new key `KEYS.map3d` = 'sns_map3d' — add it in
   js/core/storage.js: this file is allowed for that one line). When on, it lazy-imports js/map3d/map3d.mjs once
   (like `load3D`), shows the SVG meanwhile, then switches; on import or WebGL failure it logs via `DBG.log('warn',
   …)` and stays on SVG.
3. js/map3d/map3d.mjs exports `create(canvasHost)` → `{ mount(el, model, on), update(model), select(id), dispose() }`:
   - Renderer: `antialias`, pixel ratio ≤ 2, sized to `el` (ResizeObserver); one rAF loop while mounted; stops on
     `dispose()` (dispose geometries/materials/renderer).
   - Units: map (x, y) → world (x·0.5, 0, y·0.5) metres (`MAP_M = 0.5`); export `toWorld` / `toMap`.
   - Terrain: a grid plane (~2 m cells) over the island's bounding box; a vertex is land if inside `land.coast`
     (point-in-polygon); height: 0.6 m base, Shu region +4…10 m rolling (smooth noise from a fixed hash, no R()),
     each mountain point a smooth peak (~25 m, radius ~40 m), beach edge (distance to coast < 12 m) slopes to 0.
     Vertex colours: region colour mixed 35 % into a grass/rock/sand base; minors / academy tinted the same way.
     Water: a large plane at y = 0 in deep blue with light specular.
   - Light: hemisphere + one directional sun with soft shadows (shadow map ≤ 2048).
   - Camera: perspective, fixed yaw (looking north-ish, i.e. toward −z), pitch 55°; target starts at `model.focus`;
     zoom by wheel = distance 25…420 m; pan by drag (left button) moves the target on the ground plane, clamped to the
     island box. Keep the view across re-mounts.
   - Click (not a drag: < 5 px movement): raycast the terrain → map point → `on.point([x, y])`; sea → `on.point` with
     the sea point (the rules already reject sea).
4. js/ui/career-hub.js Menu drawer: a checkbox "3D map (preview)" bound to `MAP3D.on` (re-renders the career).
   js/ui/career-map.js `mapMount` calls `MapView.mount` as today (the facade decides).
5. css: `#mapwrap canvas { display:block; width:100%; height:100% }`.
Accept:
- All tests + lint (tests are headless: nothing here runs in them).
- With the toggle off, the game is exactly as before.
QA (test3d.html, career run): toggle on → island renders (screenshot); wheel zoom and drag pan work; click land in
another region → the point panel opens and "Travel" moves you (check `RUN.pos`); toggle off → SVG back; leave to the
menu and return → no WebGL context leak (`renderer.info` / one canvas); no pageerror.
Result:

### [ ] T-024: The player walks on the 3D map (default VRM model)
Spec: §4.9          Goldens: unchanged          Save: no change
Goal: Your player stands on the 3D map as the default VRM model, idle-breathing. Whenever your position changes
(travel, going to a place), the model turns and walks — or runs for longer trips — across the terrain to the new
spot while the camera follows. Rules stay instant; this is display only.
Background: js/render3d/players3d.mjs exports `loadBase(url, onProgress)` (base model, cached per URL) and
`makeVRM(buf, heightM)` → `pl` (`root`, `vrm`, `bone`); `applyPose(pl, pose)`, `smoothBones(pl, dt, k)`,
`groundSnap(pl, lift)`; js/render3d/poses3d.mjs exports `STAND`, `locoPose({ speed, fwd, lat, phase })` (walk → run
blend by speed in m/s) and `mix`. The model URL is `assets/vrm/base.glb.txt` (see `MODEL_URL` in r3d.mjs).
`pl.vrm.update(dt)` runs springs/expressions each frame.
Files: js/map3d/map3d.mjs, js/map3d/avatar3d.mjs (new ES module), css/career.css (the ×N badge), ARCHITECTURE.md
Do not:
- Change players3d.mjs / poses3d.mjs behaviour (import only). Load more than one VRM on the map.
- Move the player in the rules or delay rule updates: the view only animates from the previous displayed position.
Steps:
1. js/map3d/avatar3d.mjs: `createAvatar(scene)` → loads the base model once (`loadBase` + `makeVRM(buf, 1.65)`),
   adds `pl.root` to the scene, casts shadows; exposes `setTarget([x, y] map units)`, `snap([x, y])`, `tick(dt,
   heightAt)`, `busy()`, `dispose()`. Until loaded, show a simple capsule marker in its place.
2. Walking: on a new target, path = straight line (sampled every 2 m, y from `heightAt`). Duration = clamp(dist /
   6 m/s, 1.2 s, 6 s); ground speed = dist / duration. Gait speed passed to `locoPose` = min(ground speed, 6)
   (> 2.5 m/s blends into a run); `phase` advances with distance (one cycle per ~1.6 m at walk, ~2.4 m at run);
   the model turns toward the heading over ~0.25 s; ease-in/out on the first/last 0.4 s. When ground speed > 6 m/s,
   show a small "×N" time-lapse badge over the canvas (N = ground speed / 6, rounded).
3. Idle: `STAND` blended with a slow breathing sway; `vrm.update(dt)` every frame; `groundSnap` so feet sit on the
   terrain (`heightAt(x, z)` exported from map3d.mjs, bilinear on the terrain grid).
4. map3d.mjs: create the avatar on mount; `update(model)`: first time `snap(model.you.at)`, later if `you.at` changed
   → `setTarget`. The camera target lerps toward the avatar while it walks (follow), and stops following when the
   user drags (until the next walk).
Accept: all tests + lint.
QA (test3d.html, career run, 3D map on): the model appears at the airport; travel to a far point → it turns, runs
across the island (screenshots at start / middle / end; badge shows ×N), stops and idles on the spot; a short trip
walks. Record: frame time with the avatar (Chromium swiftshader is slow — just report it), no pageerror.
Result:

### [ ] T-025: 3D map parity — pins, selection, fog, labels (then 3D becomes the default)
Spec: §4.9          Goldens: unchanged          Save: no change
Goal: Everything the SVG map shows works on the 3D map: pins (places, HQs, battle) with icons/badges/flags, selection
highlight and pick, seized patches, region labels, the selected-point flag, and fog of war. Then the 3D map is on by
default (the toggle stays to switch back to SVG).
Files: js/map3d/map3d.mjs, js/map3d/pins3d.mjs (new ES module), js/ui/map-view.js, css/career.css, ARCHITECTURE.md
Do not:
- Put game rules in the view: read only `MapModel` fields, report only `pick(id)` / `point(p)`.
- Draw pins as WebGL text: use an HTML overlay layer positioned each frame by projecting world points (like the
  match overlay), so emoji icons, badges and CSS states (`off`, `far`, `turf`, `gem`, `overhyped`, `can`, `mine`,
  `clash`, `sel`) reuse the SVG map's meaning.
Steps:
1. pins3d.mjs: an absolutely positioned overlay `div` over the canvas; one element per `model.pins` item
   (`data-spot`, icon, badge, flag classes, `title`); each frame place it at the projected terrain point; hide when
   behind the camera; click / Enter → `on.pick(id)`; `select(id)` toggles `.sel`.
2. Labels: `land.labels` as overlay text (big for majors), fading out when zoomed in close.
3. Seized: a flat ring/disc decal on the terrain at each `seized[].at` (radius in map units), in the holder colour.
4. Fog: per terrain vertex darkening where no `fog.points` lies within `fog.r` (update on `update(model)`), plus the
   pins list already hides unknown places. Unexplored land stays visible but dim, like the SVG map.
5. `model.flag` (selected point): a small flag marker on the terrain.
6. `update(model)` diff: rebuild pins / seized / fog only when their data changed (compare JSON of those parts).
7. js/ui/map-view.js: default `MAP3D.on = true` when no stored choice; keep SVG fallback on failure.
Accept: all tests + lint.
QA (career run): side-by-side screenshots SVG vs 3D of the same state (same pins visible, same fog); click a pin →
its panel opens and the pin highlights; scout an HQ → badge updates without remounting the scene; no pageerror.
Result:

## Next — Phase 4: U21 Final Cup (after M2)

### [ ] T-019: Brackets of any size with byes
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
Result:

### [ ] T-020: U21 Final Cup — one cup of drawn squads replaces the Skyline and Grand Cups
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
Result:

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
