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
- Walk the roads ✓ (T-047) · town layout revamp ✓ (T-050 data, T-051 render).
- Match history ✓ (T-052).
- Free setter takes the second ball ✓ (T-054) · start from 1 ✓ (T-055).
- Stat guard ✓ (T-056) · official venues ✓ (T-053).
- Smarter coach ✓ (T-057).
- Player camera ✓ (T-058 Follow, T-059 POV).
- **Now**: ego (T-068), block collision (T-069), POV polish (T-070). **Next**: cleanup pass (T-071…T-081, behaviour-neutral). **Then**: relationships — the core pillar (spec §4.23, T-060…T-066), road travel (T-048), voice pass (T-022).
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — Ego + block collision (§2.12), POV polish (§4.25)

### [ ] T-068: Ego — show-offs steal balls, call sets, block alone (wit = maturity)
Spec: §2.12, §2.0          Goldens: update (new decisions in every rally)          Save: no change
Goal: Every player gets an ego (0–1); low-wit players act on it — ball steals, set calls, solo blocks, hero swings,
hero serves — with maturity from wit cutting both how often and how badly. Logged for the relationship memories later.
Files: js/data/rules.js, js/engine/players.js, js/engine/match.js, js/engine/rally.js, js/engine/rally-phases.js,
js/engine/rally-defense.js, js/engine/serve.js, js/data/dialogue.js, js/career/run.js, tests/run.js, ARCHITECTURE.md
(T-067 follow-up, do first, same commit: js/ui/career-week.js — the pre-match Lineup line uses
`Run.lineup(run, side.T, side.region, true, cup && run.mode.story)` so a Story cup match never reads "On the bench".)
Do not: add an act kind (use `plabel`, `pose`, `log`, `chat` / existing chatter); add randoms to presentation; change
saves beyond the player field `ego` (teams save it; old saves get the hash value on load); let one ego act decide a
rally on its own more than its EGO table says.
Steps:
1. rules.js `EGO = { base: { steal, call, solo, swing, serve }, captain, err: { … } }` (doc comment; start values small:
   aim for ~1–3 ego acts per side per set among average-wit players, ~0 with wit ≥ 1.8). `maturity(p) = clamp((p.wit −
   0.5) / 1.5, 0, 1)`.
2. players.js: `p.ego` in createPlayer (spec value wins; else a hash of the player's id/name → 0.2–0.8, WS +0.1, no R()
   draw so generation stays identical); your player: 0.6 (run.js create).
3. Engine hooks, one R() each only where an opportunity exists and its chance is > 0 (no draw at chance 0): dig / pass (rally-phases / rally-defense: an ego mate
   other than `nearest` within reach → steal: collision chance by both players' maturity, else they take it);
   pickSetter/chooseAttack (set call: the setter's maturity resists); formBlock (solo block: the ego blocker ignores
   `dset`); attack on quality-1 sets (hero swing instead of the safe shot); serve (hero serve → jump serve).
   Captain call-off per §2.12. Record `m.egoLog.push({ act, p, ok, mate? })` (engine-only).
4. Presentation: "MINE!" `plabel`, bump poses on a collision, a log line; set-call chatter lines in dialogue.js (street
   voice, 5 lines). Hype scenes unchanged.
5. tests `'engine: ego'`: 400 sims — ego acts per side per set in range for average wit, near zero for wit ≥ 1.8;
   success rate rises with maturity; collisions only on steals; with ego 0 everywhere the match is identical to an
   ego-free reference run of the same seed (no extra draws when no opportunity); T-026 stuff / kill tests still
   pass (retune EGO, not those tests, if they don't); report kill % and error % before / after.
6. `npm run test:update` with the reason. ARCHITECTURE.md: ego.
Accept: all tests + lint; goldens updated for this reason only.
QA: Monster game with all wit set to 0.6: 2000 steps — "MINE!" labels, a collision, a solo block seen; with wit 1.9:
almost none; no pageerror.
Result:

### [ ] T-069: Block collision — cancelled blocks and the net-fault variant
Spec: §2.12 (Block collision)          Goldens: update (a new outcome on solo blocks)          Save: no change
Goal: When T-068's solo block meets a partner who also commits, the two blockers collide: both blocks cancel early (an
open net for the attack) or, in the error variant, a net fault ends the rally; a floating "BLOCK COLLISION" label in a
warning or error style marks it.
Files: js/data/rules.js, js/engine/rally.js, js/engine/rally-defense.js, js/render/playback.js, js/render/court.js,
js/render3d/actors3d.mjs (only if the stagger needs it), tests/run.js, ARCHITECTURE.md
Do not: add an act kind (extend `plabel` with an optional style flag, and use `jump` / `slide` / `pose` / `log`);
make collisions happen without a solo block; touch the scene shots.
Steps:
1. rules.js EGO gains `collide` (chance the partner also commits = collide × (1 − partner maturity)) and `net` (share
   of collisions that become a net fault). Start values: collisions ≈ 10–20 % of solo blocks, net faults ≈ 30 % of
   collisions.
2. Engine (where the solo block is decided, T-068): on a collision — no block touch this attack (the attack resolves
   vs an empty net: today's no-block path); both blockers' jump acts end early (`jump` mode 'down' at ~40 % of the
   normal hang), they `slide` 0.3 m apart and take a stagger pose (reuse an existing pose, e.g. 'bump' / landing);
   net-fault variant: the rally ends at once, point to the attacking side, a log line "Net fault — block collision".
   Record `m.egoLog.push({ act: 'collide', p, mate, net })`. One R() for the partner, one for the net share, only when a
   solo block happens.
3. `plabel` gains an optional `v` ('warn' | 'err'): playback passes it to the label; court.js drawLabels colours warn
   orange (#ffb13d) and err red (#ff4d4d), stamped (pop-in) like big labels. Text: "BLOCK COLLISION" / "BLOCK
   COLLISION · NET", anchored between the two blockers at net height. The act-kind test still passes (no new kind).
4. tests `'engine: block collision'`: 400 sims with ego forced high and wit low — collisions happen only after a solo
   block; no block touch on a collision; net-fault rallies end with the point to the attackers and no attack contact
   after it; label acts carry `v`; with EGO.collide 0 the stream equals T-068's; T-026 stuff / kill tests still pass.
5. `npm run test:update` with the reason. ARCHITECTURE.md: the collision outcome and the plabel style flag.
Accept: all tests + lint; goldens updated for this reason only.
QA: Monster game with ego 0.9 / wit 0.6 for every player: watch until a collision — both blockers come down early and
stagger, the label shows in orange; a net-fault one in red and the point ends at once; screenshot both; no pageerror.
Result:

### [ ] T-070: POV polish — no teammate in your face, ball on screen for hitters
Spec: §4.25          Goldens: unchanged (presentation only)          Save: no change
Goal: Review QA of T-059 found POV frames where the camera sits inside a teammate's body / hair (near plane 0.1 m,
players pass within arm's reach), and the ball was on screen only 61 % of a wing spiker's frames (bar 70 %).
Files: js/render3d/camera3d.mjs, js/render3d/actors3d.mjs, ARCHITECTURE.md
Do not: touch js/engine; hide the followed player's arms; change Follow / Broadcast / Courtside.
Steps:
1. actors3d: any other figure whose body (hips–head capsule, radius ~0.35 m) comes within 0.9 m of the POV camera fades
   out (material opacity → 0 over ~0.1 s; restore after), via a per-frame hook like `setPovHidden` (no new draw calls,
   no per-frame allocations).
2. camera3d: while the followed player is a hitter on approach / in the air the POV look target leans toward the ball
   (the set) instead of straight ahead (within the ±55° clamp), so the set is in view before the fallback kicks in;
   keep the 220°/s turn limit.
3. QA numbers as in T-059, plus: 0 frames where the camera is inside another figure's capsule; WS ball-on-screen ≥ 70 %.
Accept: all tests + lint.
QA: Monster game POV on the WS and on the setter, 1500 steps each: the numbers above; screenshots; no pageerror.
Result:

## Next — Cleanup pass (no gameplay change; after Now, before relationships)
Audit of main @ 414892f (2026-10-01). Every task here is behaviour-neutral: tests stay green, goldens unchanged unless
a task says otherwise, no save bump. If a golden moves, stop and ask — it means behaviour changed. Order = lowest risk
first; T-071 first because a fresh `npm install` breaks lint and QA today.

### [x] T-071: Tooling — declare every dependency, drop stale config, safer test update
Spec: — (tooling)          Goldens: unchanged          Save: no change
Goal: A fresh clone + `npm install` gives working lint, tests and test3d.html QA; no stale config or files.
Files: package.json, package-lock.json (new, committed), .gitignore, eslint.config.mjs, .prettierignore, files.json
(delete), tests/run.js (update gate only), tests/harness.js, index.html / test3d.html / qa_poses.html (formatting only)
Do not: change three / three-vrm versions vs the CDN importmap; reformat js (already clean).
Steps:
1. package.json: name `spite-and-spike`; devDependencies add `espree` ^10 (eslint.config.mjs imports it directly),
   `three` 0.169.0 and `@pixiv/three-vrm` 3.5.5 exact (test3d.html / qa_poses.html load them from /node_modules).
   Add `"format:check"`. Commit a lockfile generated from the registry (no `../tools` / `../vrm` link paths).
2. Delete files.json (unreferenced; lists removed files, misses ~30 current ones).
3. Remove `js/vendor` references (eslint.config.mjs, .prettierignore, harness filters): the folder is gone.
4. tests/run.js: `--update` writes golden.json only when every other test passed.
5. harness.js name collection also catches `var` and `class` declarations (same rule eslint uses).
6. Prettier: format the three .html files (or exclude them in .prettierignore — pick one, keep `npm run format` and
   `format:check` consistent). .gitignore: QA screenshot/output dirs.
Accept: rm -rf node_modules && npm install && npm test && npm run lint && npm run format:check all pass; test3d.html
loads three from node_modules (QA recipe runs).
QA: Monster game smoke (no pageerror).
Result: package.json renamed spite-and-spike + espree / three 0.169.0 / three-vrm 3.5.5 declared, clean registry lockfile committed, format:check; files.json + js/vendor refs gone; --update writes only when all pass; harness catches var/class; html formatted (prettier). Fresh rm -rf node_modules && npm install → 49/49, lint, format:check clean; Monster 1500 steps via node_modules three, no pageerror.

### [x] T-072: Dead code sweep — removed features and unused helpers
Spec: — (cleanup)          Goldens: unchanged          Save: no change (old saves may keep the dropped fields)
Goal: Delete code that nothing reaches; rename leftovers whose names describe removed systems.
Files: js/audio/sfx.js, js/ui/match-screen.js, js/render/court.js, js/render3d/r3d.mjs, css/style.css,
js/data/city.js, js/career/city.js, js/career/run.js, js/career/world.js, js/ui/career-week.js, js/ui/career-map.js,
js/ui/dom.js, js/data/career.js, tests/run.js (only call sites renamed here), ARCHITECTURE.md
Do not: touch the engine; remove `Rank.of` (tests use it) or `MODES.endless` (spec shows it disabled); rename
`run.warm` (save field — see Later).
Steps:
1. Audio: crowd subsystem is off (`CROWD_ON = false`): remove crowdStart / crowdLevel / crowdVoice, sfx.ooh / aww /
   clap / stomp / cheer / chant and their call sites (match-screen.js ~483–485, 594).
2. Match screen: `A.banners`, `A.rings` (never read). court.js `drawFloorFx` empty stub + its call in r3d.mjs.
3. Betting leftovers: delete `.bet`, `.bet input` (style.css); rename `.betline` → `.resline` (match-screen + css).
4. Career: `SPOTS[*].slot` field + its doc comment (never read) and `City.evening` → `City.outing`; drop the
   write-only `run.loc` (City.loc derives it from `pos`) and its fallbacks (city.js, run.js); `delete run.slot` in
   repair; `CW.view`; `plural` (dom.js) — use `signed()` where career-week/map inline `${v>0?'+':''}${v}`;
   `World.faction` (no callers).
5. Stale comments: data/career.js "Skyline Cup … Grand Cup", run.js "two cups", career-week.js "both cups",
   misplaced "Quality of a training place" comment (career-week.js ~424).
6. Before deleting each name: grep the whole repo (js, html, tests, template strings).
Accept: tests + lint pass; goldens untouched; grep finds none of the removed names.
QA: career run → hub, map, a match (watch) and the end screen; Monster game; no pageerror.
Result: crowd audio (crowdStart/Level/Voice, cheer/ooh/aww/clap/stomp/chant) + call sites, A.banners/A.rings, drawFloorFx, .bet CSS gone; .betline → .resline; SPOTS slot field (25), run.loc + fallbacks, delete run.slot, CW.view, plural, World.faction removed; City.evening → City.outing; signed() for inline +/- (7 sites); stale cup comments fixed. 49/49 (one test now reads City.loc(back) instead of back.loc), goldens untouched, lint clean; QA career run (create → hub, 8 drawers, rest, end week) + Monster, no pageerror. −191 lines.

### [ ] T-073: Presentation randomness off the game RNG
Spec: CLAUDE.md "Rules that bite" (presentation draws no randoms)          Goldens: unchanged          Save: no change
Goal: Display code never draws from R()/rnd()/pick(): playback calls `playRally` lazily inside `step()`, so today the
engine stream depends on frame rate whenever a match is seeded.
Files: js/core/rng.js, js/render/court.js, js/render/effects.js, js/render/playback.js, js/ui/match-screen.js,
tests/run.js, ARCHITECTURE.md
Do not: change any engine draw; touch js/render3d (fx3d/actors3d already use Math.random).
Steps:
1. rng.js: a presentation-only source (new global `FXR` = { r, rnd, pick } on Math.random). Allowed by this task.
2. Switch: court.js drawTrail OP colour (every frame!); effects.js spawnShards / crackLines / drillStep / linkSparks;
   playback.js stepGait dust, stepCelebration confetti; match-screen.js startMatch (banners go in T-072; coach hair
   from a hash of the coach id, not pick).
3. Test 'render: no game RNG in presentation': source scan of js/render, js/audio, js/ui/match-screen.js finds no
   `R(`, `rnd(`, `pick(` calls; and a seeded match played through playback steps at two different dt sequences ends
   with the same score sequence (if feasible headless; else the scan only).
Accept: tests + lint; goldens untouched.
QA: Monster game, Max hype: shards, sparks, confetti and OP trails still vary; no pageerror.
Result:

### [ ] T-074: CSS — dead selectors, duplicates, colour tokens
Spec: — (cleanup)          Goldens: unchanged          Save: no change
Goal: Smaller, consistent stylesheets with no visible change.
Files: css/style.css, css/theme.css, css/career.css
Do not: change layout or any colour value as rendered; remove font families (all are used by canvas text);
merge rules across files (Later).
Steps:
1. style.css: the light palette, `prefers-color-scheme` and `[data-theme]` blocks are dead (theme.css `:root:root:root`
   overrides every token; nothing sets data-theme) — keep one token set in theme.css.
2. Dead selectors (grep html + js template strings first): style.css `.wallet`, `.vs*`, `.codds/.co`, `.tgrid/.tcard/
   .tname/.tstyle/.trec/.tstars`, `.modal`; theme.css `.wallet .tcard .modal .tname .vsside .vsp .tbtn .mplay .b3d
   .mclassic`; career.css `.pip.warmup*`, `.tgrid5`, `.tbtn`, `.rS`, `.rB`, `.sk-tag`, `.skh`, `.thd`, `.lastlog`, and
   the SVG-map rules (`.city`, `.pin`, `.reg`, `.fog`, `.flag`…) left after the 3D map (Unplanned changes 2026-09-30).
3. Same selector twice in one file: merge (career.css `.hub .mapwrap`, `.hub .dial .trk/.prg`, `.hub .dock button.on`,
   `.hub table.rk.ml td:last-child`; style.css `.over`, `#box`, `.stage.fake-fs`).
4. Tokens `--good` (#4ade80/#16a34a), `--bad` (#ff2e4d/#f43f5e/#ff5d6c), `--warn` (#ffb020/#ffd84d) replace the
   literals in career.css; rename the "legacy switches" section header.
Accept: lint + tests; before/after screenshots identical by eye (menu, create, hub + every drawer, map card, match
screen, end screen); css line count reported in Result.
QA: career run through every hub drawer and a watched match; screenshots before/after.
Result:

### [ ] T-075: Move game rules out of the UI
Spec: — (cleanup)          Goldens: unchanged          Save: no change
Goal: UI files only render and call rules; each rule lives once in js/career and gets a headless test.
Files: js/career/city.js, js/career/cup.js, js/career/goals.js, js/career/dossier.js, js/career/run.js,
js/data/career.js, js/ui/career-map.js, js/ui/career-week.js, js/ui/career-hub.js, js/ui/career-dossier.js,
js/ui/match-screen.js, tests/run.js, ARCHITECTURE.md
Do not: change any rule's outcome or its R() order (move code verbatim, then call it).
Steps:
1. `City.after(run)` ← career-map `mapAfter` (event rolled once after the week's first action).
2. `Cup.simNow(fx)` ← the four "sim now" copies (career-map ×2, career-week, match-screen); always runs `fx.setup`
   when present (the map copies skip it today — note it in Result if any test number moves).
3. `Goals.progress(run, g)` ← seasonCard's re-implementation of Goals.met.
4. factionsCard renders from `Dossier` (+ the standing label ladder moves into dossier.js).
5. `Run.canEndWeek(run)` ← mapEndWeek; `Run.readGazette(run)` ← the inline onclick + hubOpen copy; no `Run.save` inside
   render functions (cupPanel).
6. `ROLE_NAME` → data/career.js; career-dossier `STAT_OF` → `STATNAME`.
7. One test per new function.
Accept: tests + lint; goldens untouched.
QA: career run: week actions, event once per week, sim a match from map and from the week card, Gazette read once,
factions drawer, end week.
Result:

### [ ] T-076: Save model — one defaults table for new runs and repair
Spec: — (cleanup)          Goldens: unchanged          Save: no change (repair defaults the new field)
Goal: A field can't be added to `Run.new` and forgotten in `repair` again (how `run.grades` slipped through).
Files: js/career/run.js, js/career/cup.js, js/ui/career-end.js, tests/run.js, ARCHITECTURE.md
Do not: change the order of `City.roll` / `Eval.setup` draws inside repair; bump RUN_VERSION.
Steps:
1. `RUN_DEFAULTS` (plain values / factories) used by both `Run.new` and `repair` for the ~30 defaulted fields.
2. `run.grades`: declared in defaults, capped like the match log (MLOG.max), documented.
3. Test: `repair({...minimal})` yields every defaults key; a new run passes repair unchanged (deep equal).
Accept: tests + lint; goldens untouched.
QA: none (headless) + load an existing save in the browser once.
Result:

### [ ] T-077: Render files match what they do; one source for court units
Spec: — (cleanup)          Goldens: unchanged (constants keep their values)          Save: no change
Goal: No 2D court/character drawing is left, but files still carry those names; unit maths is copied in 3+ places.
Files: js/render/body.js (delete), js/render/characters.js → js/render/tags.js, js/render/court.js →
js/render/overlay.js, js/render/dive.js (new), js/render/playback.js, js/render/faces.js, js/core/*, js/engine/court.js,
js/engine/stats.js, js/engine/rally.js, js/engine/rally-defense.js, js/engine/serve.js, js/render3d/units3d.mjs,
js/render3d/players3d.mjs, js/render3d/poses3d.mjs, js/render3d/r3d.mjs, index.html, test3d.html, qa_poses.html,
tests/run.js, ARCHITECTURE.md, CLAUDE.md (Layout line only)
Do not: change any numeric value; reorder any R() call.
Steps:
1. body.js: `shade` → core (colour util), `setMotion` → poses3d / playback; drop the script tag everywhere.
2. Dive timeline (`diveShape`, `diveF`, `diving`, `DIVE_POST_MS`) → dive.js; characters.js → tags.js; court.js →
   overlay.js; tags use `FONT_ROUND`, `INK`, `roundRectPath` instead of literals.
3. Units: name `Z_UNITS = 420` and the court→metre factors once (engine/court.js) and reuse in stats.js
   (`UNITS_PER_M`), rally*.js, serve.js, playback.js (`MX/MZ`, `2.43/150`) and units3d (re-derive, keep exports);
   name the ball speed factors 0.012 / 0.011.
4. Playback no longer writes onto engine beats (`b._s`, `b.dur`, `b.acts`): keep that state on `A`.
Accept: tests + lint; goldens untouched (proves the constants are identical).
QA: Monster game 3000 steps: tags, dives, overlay labels as before; no pageerror.
Result:

### [ ] T-078: Split playback.js (1090 lines) by concern
Spec: — (cleanup)          Goldens: unchanged          Save: no change
Goal: The 265-line `instant()` switch becomes a dispatch table split by concern; movement and actor timers get
their own files.
Files: js/render/playback.js, js/render/acts.js (new), js/render/movement.js (new), js/render/actors.js (new),
index.html, test3d.html, qa_poses.html, tests/run.js (act-kind test reads the table), ARCHITECTURE.md
Do not: change any act's behaviour or timing; add act kinds.
Steps:
1. `ACTS = { kind(a, ctx) }` grouped fx / ui / roster in acts.js; playback dispatches through it.
2. Approach / dig-chase / pre-look → movement.js; player timers, gait, celebration → actors.js.
3. The act-kind test checks every engine kind has an `ACTS` key (data, not a `case` regex).
Accept: tests + lint; goldens untouched; playback.js under ~450 lines.
QA: Monster game Max hype 3000 steps + a career watched match: subs, timeouts, scenes, cut-ins as before.
Result:

### [ ] T-079: map3d hygiene — shared helpers, no hard-coded factions, clean dispose
Spec: §4.9 (map)          Goldens: unchanged          Save: no change
Goal: Break the circular imports, keep faction rules in MapModel, stop per-frame allocations and layout reads.
Files: js/map3d/*.mjs, js/map3d/geo3d.mjs (new), js/career/mapmodel.js, js/ui/map-view.js,
js/render3d/players3d.mjs (export MODEL_URL), js/render3d/r3d.mjs, tests/run.js, ARCHITECTURE.md
Do not: change the look (fog, lights, camera feel) beyond float noise.
Steps:
1. geo3d.mjs: `MAP_M`, `FOG_*`, `toWorld`, `toMap`, `clamp`, `lerp`, `smooth` (smooth copied ×3, avatar3d `cl`);
   sub-modules import from it, not from map3d.mjs.
2. MapModel emits `contest` (meter, pressure) for borders; map3d.mjs ~426 / life3d.mjs ~132 stop matching
   'wei'/'wu' and the hard-coded `/2` (FRONT.seize). Test on MapModel.
3. dispose: skip `userData.shared` (kit MAT, SHAPES) like town3d; named pointer listeners removed in dispose.
4. Per frame: cache canvas size in the ResizeObserver; pins3d reuse one Vector3 and skip transform writes when the
   camera didn't move; life3d `along()` without per-walker allocations.
5. One fog function for terrain + town with squared-distance early-outs (parity screenshot before/after).
6. map-view: `failed` resets on drop3D; drop3D nulls el / model / on. Name the shadow-map size and frustum.
   MODEL_URL exported once from players3d.
Accept: tests + lint; heap stable over 10 hub re-mounts (Chrome memory snapshot or renderer.info counts).
QA: career run: walk, travel, fog reveal, seized patch, pins, 10 drawer open/close cycles; renderer.info geometries/
textures before = after; screenshots before/after.
Result:

### [ ] T-080: Tests — split by area, shared factories, quick mode
Spec: — (tests)          Goldens: unchanged          Save: no change
Goal: tests/run.js (2338 lines, 49 tests, ~30 s) becomes area files with shared helpers and a fast loop.
Files: tests/run.js, tests/harness.js, tests/engine.test.js, tests/career.test.js, tests/map.test.js,
tests/cup.test.js (new), package.json (scripts)
Do not: weaken a statistical assert; change golden keys.
Steps:
1. run.js = loader + reporter; area files register tests. `playRun` and the three `mk(seed…)` run factories →
   harness.js.
2. Tag the 5 slowest (coach AI, lane-read block, smarter subs, setter, start-from-1) `slow`; `npm run test:quick`
   skips them; `npm test` runs all.
3. Where a test asserts UI copy ('Watched from the bench', 'asks for', 'awakening', 'seized'/'retook'), assert on a
   returned code or data field instead when one exists (do not add new return codes just for this).
Accept: same 49 tests pass in both layouts; test:quick < 10 s.
QA: none.
Result:

### [ ] T-081: ARCHITECTURE.md matches the code
Spec: —          Goldens: unchanged          Save: no change
Goal: The build doc is correct and navigable.
Files: ARCHITECTURE.md
Steps:
1. Save section: RUN_VERSION 9 (v9 `run.mode.story`), every save field incl. `grades` (after T-076); drop the stale
   "RUN_VERSION 8 / 4", warm-up and travel `zone` mentions.
2. Layers table: current file lists (career-hub, career-map, map-view, career-dossier, map3d, new render files); the
   Data row says "constants + small pure helpers" (CITY IIFE, callLine, epair… stay — moving them is Later).
3. Shorten 1 KB+ bullets; one section per layer.
Accept: every file in index.html appears once in the doc; no version / field the code doesn't have.
QA: none.
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Cleanup, part 2 (after T-071…T-081)
- T-082: One HTML entry — drop test3d.html; pick the importmap (CDN vs node_modules) with an inline script before any
  module; removes the "add to BOTH" rule.
- T-083: Namespaces — sfx internals in an IIFE (expose SND, sfx, bgm*, …); the overlay API r3d calls as `Overlay`;
  match-screen's `A`/`cv`/`ctx`/`last` globals.
- T-084: Cross-file CSS — the ~74 selectors defined in 2–3 files: layout in style.css/career.css, surface in theme.css.
- T-085: cup.js split (bracket/fixtures vs fight.js: challenge, clash, lose, injure, hired); data files lose their
  logic (callLine, confidence, epair, hasTech, skillRoleOk, leadLv → engine/career); day/travel tuning grouped
  (`WEEK_DAYS`, `DAY_GAIN`, `TRIP_*`, `TRAIN_FEE`, `TURF_BONUS`, `HOTEL`) — after T-048 road travel.
- T-086: `run.warm` / `warmupWin|Loss` → `eval*` (RUN_VERSION bump).
- T-087: Coverage gaps — Goals, Storage with a throwing localStorage, old-save load, map3d pure functions (heightAt,
  toMap/toWorld, inside/edgeDist; needs three from T-071).
- T-088: Big binaries — keep base64 for the artifact but store .glb/.mp3 in Git LFS and generate the .txt at publish.

Relationships — the core pillar (spec §4.23; detailed one by one after T-059)
- T-060: NPC careers — wants, traits, status, weekly plans, activity-based growth (data + headless sim).
- T-061: Memory log + stance + bond as a read-only summary (all bond sources become memory kinds; ego acts from `m.egoLog`).
- T-062: People tab — person cards, discovery of wants / traits, top memories.
- T-063: Approaches — NPCs come to you (and to each other); you approach them.
- T-064: Fates — cut / quit / poached / national; end-of-run "People who mattered".
- T-065: NPC ↔ NPC memories, cliques, squad chemistry.
- T-066: On-court effects — trust / freeze-out set distribution, cover, rival mood (engine, goldens update).

Roads, part 2 — spec §4.18
- T-048: Road travel — trip days from the road route length (roads faster than cross-country; Shu paths slower);
  rules + tests change (career only).

Injuries, part 2 — spec §4.15
- (T-049 merged into T-057.)

Phase 5 — Voice pass
- T-022: Faction `front`/`dark`, region `desc`, Gazette and event strings in lore.md §7 voices. Also fix the stale
  encyclopedia line "Or learn it in career for this many skill points" (ui/encyclopedia.js: techniques are learned in play).

## Done

- [x] T-067: Story mode — you always play the U21 Final Cup — Story default (`run.mode.story`, RUN_VERSION 9); forced into the first faction squad / Academy entrant / seeded street crew (`run.reserve.street`, side RNG stream); `forceYou` lineup; `Cup.calledUp`; Endless shown disabled; 49/49, lint clean, goldens untouched. Spec-chat QA: create shows Story / Endless (later), new run mode story v9, no pageerror. Lineup-line fix moved to T-068.
- [x] T-059: POV camera — 1st person from your player's eyes — POV done as specified (+ ball look fades out 100°→140° instead of a hard edge, no flip; base near 0.1 in POV). QA Monster, 1500 steps each: head hidden every POV frame, 0 frames with the camera within 0.35 m of a visible head, restored on leaving; every air episode reached the Follow fallback (10–13 switches logged per run); max frame move ≤ 1.5 m; ball on screen when in play on your side: setter 79 %, WS 61 % (WS misses are mostly fallback jump frames; 86 % outside them) — below the 70 % bar for the WS; no pageerror; screenshot /tmp/p1.png. Earlier Follow ball-on-screen re-measured with the real ball: 96 %.
- [x] T-058: Follow camera — 3rd person behind your player — Follow camera done as specified; mode weights replace the blend, follow pose tracked in every mode (no jump on switch). QA Monster WS 1500 steps: ball on screen 99.7 %, max frame move 1.06 m (no jump >3 m), cam y ≥ 2.3 m, mode switches ≤ 2.9 m/frame, scenes cut in/back; career eval follows you (select hidden); no pageerror; 48/48 tests, lint clean. Select list isn't refreshed after a sub (falls back to Courtside).
- [x] T-057: Smarter coach subs, trust in your player, never sub an injured you on — worth test (`SUB.worth` [0.85, 1.05] by coachIQ), `SUB.you` 0.9, `noSub` (set in `Cup.prepare` when injured, cleared by `restoreLineups`); 48/48, lint clean. Goldens updated (teams, matches, sims): coaches now skip subs that make the side worse. Subs per match (both sides, 300 sims): default coach 3.04 → 1.97; coachIQ 0 2.94 → 2.57, coachIQ 1 3.10 → 1.76; tired 831 → 543, errors 15 → 7, back 67 → 40. The 'coachIQ 1 subs sooner' test now zeroes `SUB.worth` (the roll's effect only). `m.subLog` also records `out`, `inn`, `sta`. QA: Monster game (SUB.sta raised to 0.95 so subs show; 9000 steps) 4 subs, log lines 'Sub <team>: #13 … in for #17 … (tired)'; career eval with `run.injury`: `noSub` set, you stayed on the bench the whole match (4 subs, none for you), flag gone afterwards; no pageerror.
- [x] T-053: Official venues on the map — League Arena, Academy Hall, Beach Stadium, Highland Court — four venues as specced (`VENUES`, nodes, landmarks, pins, `City.venue`, cards, `today` pulse); 47/47, lint clean, goldens untouched. Spots: arena [720,160] (clear 52), hall [580,510] (clear 20, ~18 × 11 m so the Academy keeps 33 lots), beach [925,450] on the widest sand by the resort strip (edge `resort`–venue), highland [400,180]. Venue clearance is per venue (`VENUES[id].clear`), not `placeClear`. QA: draw calls 29–30 (baseline 29), tris ~198k, no pageerror; hall pin pulses on an Academy eval week, card + 'Played at Academy Hall' shown; cup-week card checked in tests only (a browser cup start failed in my QA script on the baseline too).
- [x] T-056: Stat guard — repair invalid stats on load and before every match — `fixStats` in players.js, called in `teamFromJSON` (warn log) and `newMatch`; new test (−40/NaN/300/−1 → 1/1/99/0.1, match runs, damaged save repaired); 46/46, lint clean, goldens untouched.
- [x] T-055: Start from 1 — every stat of your new player is 1 — Done; tests 45/45, lint clean, goldens untouched. `CAREER.start` / `statMin`, `STAT_FLOOR` 1, Run.create ignores alloc, creation shows 1s with no buttons, `need` = max(1, round(…)) at every level. Notes for the spec: (1) one Power session takes Power 1 → ~36 (session XP is ~70+ × mul vs ~180 XP to reach 50), not "about a dozen sessions"; (2) a lone WS still starts: the pickup squad has only 2 WS (the coach picks the best per role), so the all-1 bench test uses an MB; (3) cup.js hired crew floor left at 25 (that squad never contains you when clamped). Tests with `alloc` still pass it (ignored); the street-battle and full-run tests assume a normal player (70 / statMin). QA: creation, 1 Power day, week-4 eval played: no pageerror.
- [x] T-054: A free setter takes the second ball (no random "someone else sets") — Done; tests 44/44, lint clean. Goldens updated (matches, sims: one R() per bad pass removed, setX/setZ rolled before the choice) — teams hash unchanged. Reach rule `SETTER.beat` 1.6; `m.setBy` records why. Assists by non-setters 12.3 % → 8.7 % over 400 mkTeams sims. The staged-scenes test (10 matches, ≤ 8/match) tripped on the moved stream (9.1; 40-match mean 6.3–7.8 before and after): widened to 30 matches, thresholds unchanged. Monster QA 5000 steps: 9 sets, all by the free setter, no pageerror.
- [x] T-052: Match history in the Season drawer, with a stat snapshot per match — Done; tests 43/43, lint clean, goldens untouched. RUN_VERSION 8 (`run.mlog`, `MLOG.max` 80); `Cup.record` at the start of result / challengeResult / clashResult; Season drawer lists them with an expandable snapshot, line and box score (fits the 440 px drawer, no horizontal scroll; QA: 2 evals + a challenge, no pageerror). Challenge / street `day` is the day before the trip is spent.
- [x] T-051: Draw the revamped town — wide beach, boardwalk, overpass, new building kinds — Done; tests 42/42, lint clean, goldens untouched. Default zoom 29 draw calls / 188k tris, zoomed out 30 / 195k (limits 40 / 260k); software-GL fps unchanged (2.75); 3 leave / return cycles: geometries stable (25), no pageerror. Height × (1 + 2.5·h·rise); wealth tint per instance (glass-blue / stone / gold vs grey / rust / patched wood); fog dims every new mesh. Extra: resort scale [1.9, 5.5, 1.2].
- [x] T-050: Town layout data — districts, a wider beach, Wu town inland, the overpass — Done; tests 42/42, lint clean, goldens untouched. Frozen `CITY.inner`; frame 1060×700; coast pushed out; `CITY.dunes`; `WEALTH` + `wu-village` (`wuVillage` [905,225]) added; Wu links: only the coast road `main`, `hotelWu–jBw3` / `hq2–wuVillage` dirt (dropped `resort–harbor`, `jBw2–hq3`; ≤ 2 links into each settlement). Lots ~1190 (Wei 572, Wu 341, Shu 158, Outlaws 65, Academy 33, Gloria 25), wealth Wei 0.07–1.0 falling outward, Wu 0.4–0.6. Deviations: `MapModel.placeClear` = 20 (spec's NEAR_R/3 cannot reach Gloria ~30 / Outlaws ~60); `arcade` → [620,262], `resort` → [908,488] (kept on land); `tall` dropped from DISTRICTS (h comes from wealth); lot size ×(0.7+0.6·wealth), grid density × (1.15−0.45·wealth); `CITY.ritual` joins the places lots keep clear of.
- [x] T-047: The player walks along the roads — Done; tests 41/41, lint clean. Airport → Highland Dojo QA: the camera follows the coast road then the Shu dirt road (not the straight line), ×4 badge shown, no pageerror. `MapView.routed` adds `you.route` on mount and update (also on a remount after a move).
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
- (recorded) T-050 follow-up: `CITY.ritual` joins the places MapModel.lots keeps `placeClear` from (lots no longer cover the sand circle) — js/career/mapmodel.js.
- (recorded in spec §2.0b) 2026-10-01: Owner: stamina matters more in matches — `RULES.stamina` { drain 1.7 (was 1.3), hit 0.4 (was 0.15), jumpHit 0.3 (was 0.15) }, so a lone carry tires and weakens; coach subs (`SUB.sta`) unchanged. Goldens updated (teams, matches, sims). Files: js/data/rules.js, js/engine/stats.js, tests/golden.json, ARCHITECTURE.md.
- (recorded in spec §4.25) Softer screen shake: per-frame random jitter → slow two-sine sway at half amplitude, off with Zooms: Off (js/render/court.js).
- (recorded in spec §4.25) Camera auto zoom-out: when the ball is out of frame (Courtside / Follow / POV) the FOV widens until it is back in view — js/render3d/camera3d.mjs, ARCHITECTURE.md.
- (recorded in spec §4.25) Ball trail grows with hit power: screen trail width ×0.8 (power 60) → ×1.9 (114), longer streak (power/4 points), 3D element trail strength up to 1.8× — js/render/court.js, ball.js, js/render3d/fx3d.mjs.
- (recorded in spec §4.25) Follow / POV always face the opponent's side: the look point is clamped to ±40° (Follow) / ±55° (POV) of the court axis toward the net; the ball only pulls the view within that, auto zoom-out covers the rest — js/render3d/camera3d.mjs.
- (recorded in spec §4.25) Follow camera backs away from the net (up to 12 m, +0.3 m up per m) while the ball is out of view, then returns once it is well inside the frame — js/render3d/camera3d.mjs.
- (recorded in spec §4.25) Every trail dims out while its object is still: ribbons measure their point's speed (full ≥ 1.6 m/s, off ≤ 0.25 m/s); the ball's screen / element trails use a smoothed ball speed `A.mv` — js/render3d/trails3d.mjs, js/render/ball.js, court.js, effects.js, ARCHITECTURE.md.
- (recorded in spec §4.25) Trails now fade fully out when still (follow-up to the line above): ribbons invisible ≤ 0.6 m/s (full ≥ 2 m/s), ball trails invisible ≤ 1.5 m/s (full ≥ 5.5 m/s), alpha squared — js/render3d/trails3d.mjs, js/render/ball.js, court.js, effects.js.
- (recorded, presentation only) Idle (ready) / platform stance arm twist: pose field `fsplit` 0.45 moves part of the forearm twist to the wrist so the elbow no longer wraps — js/render3d/players3d.mjs, poses3d.mjs.
- (recorded in spec §4.25) Camera jitter when the ball is far out of the map: Follow / POV look target clamped to the playable box and eased out while the ball is hidden; `faceOpponent` continuous behind the camera; scene-shot exit turns the view by slerp (72° → 12° per frame) — js/render3d/camera3d.mjs, ARCHITECTURE.md.
