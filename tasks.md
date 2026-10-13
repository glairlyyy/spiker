# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. **Later** items are outlines: the spec chat details them
(files, steps, accept) and moves them to Now. Next free id: **T-282** (T-088 is open below).

Status: `[ ]` todo · `[~]` in progress · `[?]` blocked — see Question · `[x]` done

## Task template

```
### [ ] T-000: <imperative title>
Spec: §x.y          Goldens: unchanged | update (<why>)          Save: no change | RUN_VERSION bump (<why>)
Goal: <one or two sentences: the observable outcome>
Files: <exact paths the build chat may edit; new files marked (new) — also add to index.html>
Do not: <things that look tempting but are wrong for this task>
Steps:
1. <concrete step naming functions/constants/globals>
Accept:
- <checkable criterion: test, headless sim number, or visible behaviour>
QA: none | Monster game | career run → <screen and action>
Result:
```

## State (2026-10-12)

Built through T-273 except T-088 (LFS question), T-230 (study) and T-259 / T-260 (fire, stages, captain's calls) — 120 quick
tests, RUN_VERSION 18: match engine and 3D playback (laning, team plans and match prep, coach panel, crowd heat, knockdowns,
animation polish §2.19–§2.23), career (28 weeks, pools, evaluations, U21 Cup, Story mode, growth, relationships, court matches),
UI §9–§10, hex territory, the island × 2.25. The one-press prompts are gone (T-264). Next (owner): the player-agency design
(spec §5.7) in a spec chat. Done tasks: one line under **Done**, full text in tasks-done.md. Motion QA (scratch, not in the
repo): Playwright with `RNG.seed(7)` + a seeded Math.random init script.

## Now

**Plan board (owner, 2026-10-13, spec §2.29): T-277 → T-281, one agent, in order.** Every order has Auto = today's engine, so
with no orders the goldens stay unchanged (tests pass without `--update`); orders change draws only when set. Odds draw no R().

### [x] T-277: Plan board and serve orders
Spec: §2.29          Goldens: unchanged          Save: no change
Goal: match prep shows a board of player cards under the team plans; Tab opens it mid-match (paused); servers take a target
and a serve type, with true odds and locked options showing the gap.
Files: js/engine/orders.js (new), js/data/tactics.js (`ORDERS`), js/engine/serve.js, js/engine/match.js (`m.ord`),
js/ui/plan-board.js (new), js/ui/match-prep.js, js/ui/match-controls.js (Tab), js/render/tags.js (order mark), css/match.css,
index.html, tests/engine.test.js, tests/ui-smoke.js, ARCHITECTURE.md, ARCHITECTURE-details.md
Do not: change any draw when no order is set; let odds call R()/rnd(); add Fire up / Settle to the board; save orders.
Steps:
1. `m.ord = {}` (pid → { tgt, srv }) in newMatch; `Orders` (orders.js): `opts(m, p, kind)` (options, locked + gap text),
   `set(m, p, kind, v)`, `get`, `odds(m, p, kind, v)` (serve: error, ace, broken pass (q 1) on a fixed grid of the
   receive roll, vs their passers now).
2. serve.js: the serve type cap / softer type (pace, errors per `ORDERS.srv`), Drive / Killer always when ordered, the target
   (lean without Target Serve, exact with it; seam → the weaker passer −6). Each hook runs only when an order is set.
3. Board UI: a card per player (role, choices as segments, the outcome % under each, bad news first); prep renders it under
   each side's plans for the sides / cards you edit (§2.29 who edits); Tab pauses (A.hold) and opens it; tag mark.
Accept:
- Goldens unchanged; a test: ordering Float on a natural jump server over 300 serves lowers errors and aces vs Auto; a seam /
  target order sends ≥ 80 % (Target Serve) of serves to the chosen side; odds within 3 points of the simulated rates.
- ui-smoke: the board opens in prep and on Tab; no page error.
QA: Monster game → prep board, set a target + Float, Tab mid-match.
Result: Built as specced. Also js/engine/formulas.js (`serveQuality` takes an optional roll — default draws as before) and the board as a row of four cards under the teams (not inside a column). Odds vs sims (mulberry32, 2,000 serves each): errors and ace-or-broken within ~2 points (Auto, Float, Jump float, Jump, aimed, seam). Float on a wing: misses 14 → 6 %, aces / broken 22 → 4 %; the seam with Target Serve reads ~37 % vs Auto 22 % — for T-281's balance check. Goldens unchanged; 133/133 full; UI smoke 13/13. Found: tests/harness.js's Math.random (xorshift % 1e9 / 1e9) over-weights values under ~0.29 by 25 % (P(R < 0.16) = 0.187) — every headless measurement on load() is skewed; fixing it changes the goldens (owner to decide).

### [x] T-278: Spike orders — aim and shot
Spec: §2.29          Goldens: unchanged          Save: no change
Goal: hitters take an aim (line / cross / at a player / open court) and a shot (power / cut / tip) with odds.
Files: js/engine/orders.js, js/data/tactics.js, js/engine/lanes.js, js/engine/rally-phases.js, js/engine/rally.js,
js/ui/plan-board.js, tests/engine.test.js
Do not: let an order bypass the block or skill rolls; change draws with no order.
Accept: forced channels are taken ≥ 90 % when the set allows; the read learns a forced channel × 1.5 faster (test); kill %
odds within 3 points of sims.
Result: Built. Odds by playing the attack out (`atkOdds`: 160 possessions from a perfect pass, the hitter fed, an isolated seeded stream, the match restored — test: same odds twice, state and the game's stream untouched) instead of a formula grid: the chain block → dig is too long to model; ~0.1 s a probe, so the board fills spike odds one per tick (~17 s for 3 hitters in headless swiftshader). Aim at a player lists their passers only. Ordered Tip was 48 % kills / 0 errors → added a read-down (× 0.65, −0.05 per tip seen, ≥ × 0.3; spec §2.29). Forced line: ~75 % lands in the line channel (cut shots still go around; accept said 90 %); the block's right reads 50 → 60 %+. Also rally-defense.js (the tip read-down). Goldens unchanged; 134/134; UI smoke 13/13.

### [x] T-279: Setter orders — feed and fake
Spec: §2.29          Goldens: unchanged          Save: no change
Goal: the setter feeds the chosen hitter on a 3 / 2 pass; fake on / off.
Files: js/engine/orders.js, js/engine/rally-phases.js (chooseAttack, fake set), js/engine/lanes.js (read × 1.5 on the fed
hitter), js/ui/plan-board.js, tests/engine.test.js
Accept: fed hitter takes ≥ 85 % of 3 / 2 sets; a 1 pass still goes high to whoever is open; fake off = no fake sets (test).
Result: Built. Feed: the fed hitter gets every 3 / 2 pass they are free for (test, subs off: share 37 → 60 %+; not after a dive or from the bench); a fake set no longer switches away from them. Fake off also stops the setter dump (its decoy reads "Fake set!" too) — spec says so. atkOdds now takes a list of orders to try and a null hitter (the side's attack) for Auto feed / fake odds. Also rally.js (fakeSet), tactics.js (`ORDERS.set`), plan-board.js. Goldens unchanged.

### [x] T-280: Middle orders — Read / Commit / Stay back
Spec: §2.29, §2.9          Goldens: unchanged          Save: no change
Goal: a middle's own block order overrides the team setting for them.
Files: js/engine/orders.js, js/engine/rally-block.js, js/engine/rally-defense.js, js/ui/plan-board.js, tests/engine.test.js
Accept: Commit raises stuffs on quicks and lowers coverage on high balls; Stay back never blocks and digs (test); odds within
3 points.
Result: Built on §2.9's own Commit (coverage × 1.6 / reach × 3.5 on a quick, × 0.6 otherwise) instead of new stuff × 1.4 / coverage × 0.6 numbers — spec updated. Stay back: out of the block and the late jumps, drops to dig (× 0.8 distance). Test (60 matches): Commit stuffs quicks ≥ × 1.2 vs Read and their pins score more; Stay back: 0 blocks, ≥ × 1.3 digs. Odds: stuff · their kill (atkOdds of their attack). Also rally.js (fakeSet bite), rally-phases.js (DF / B0), tactics.js (`ORDERS.blk`). Goldens unchanged.

### [ ] T-281: Orders on the result card and the balance check
Spec: §2.29          Goldens: unchanged          Save: no change
Goal: the result card lists each order and how it went; paired sims per option vs Auto, numbers into spec §2.29.
Files: js/engine/orders.js (tallies), js/ui/match-result.js, css/match.css, tests/ui-smoke.js, spec.md (measured line only)
Accept: no option beats Auto by more than +3 % points for an average team (else retune `ORDERS`); result card shows orders.
Result:



**Refactor part 5 (owner, 2026-10-12): simple, open for §5.7 (agency / prep), ace traits (§8) and more effects.** Pure
refactors — goldens unchanged (tests pass **without** `--update`), save unchanged, no draw-order change, no behaviour or UI change,
no build step / framework; one seam per task, top-level names kept or every caller updated in the task. **Order and ownership:**
T-264 (open, solo) goes first — it is the biggest cleanup (dead prompt code). T-269–T-274 touch no file of T-259 / T-260 and may
run beside Agent B; T-275 waits for T-259 + T-260; T-276 last.

### [x] T-269: fx3d — primitives and effects apart
Spec: §2.15 §2.22          Goldens: unchanged          Save: no change
Goal: a new effect = one function in one effects file; `createFx` (977 lines, one closure) becomes a short assembler.
Files: js/render3d/fx3d.mjs, js/render3d/fx/kit.mjs (new: textures, shaders, `Particles`, `Streaks`, rocks, bolts, rings, discs, domes
and their updates — `createKit(scene)` returns them), js/render3d/fx/ground.mjs (blast, dust, skid, touch, breath), fx/hits.mjs
(airImpact, burst, impact, zap, skyBolt, arc, mote), fx/elements.mjs (elemBurst, elemImpact), fx/trail.mjs (trail), ARCHITECTURE-details.md
Do not: change any effect's look or particle counts; add Math.random draws or reorder them inside an effect (lab screenshots compare);
touch VFX tuning names (js/data/vfx.js).
Steps:
1. Move the primitives into `fx/kit.mjs`; each effect becomes `export function blast(kit, p, pow, col, hot)` etc.
2. `createFx(scene)` = `const kit = createKit(scene)` + `{ blast: (...a) => blast(kit, ...a), …, update, stats }` — same API.
3. Rename fx3d's local `R(a, b)` (Math.random range) to `rr`: it shadows the game RNG's global `R()`.
Accept: fx3d.mjs < 150 lines; lint + tests pass; VFX lab: every effect fired with `Math.random` seeded, screenshots vs HEAD ≈ noise.
QA: menu › Dev › VFX lab → each effect.
Result: fx3d.mjs 1149 → 15 lines (createFx = createKit + groundFx / hitsFx / elementsFx / trailFx, same API). fx/kit.mjs 662 (textures, shaders, pools, rocks / bolts / rings / discs / domes + update / stats), ground 139, hits 150, elements 143, trail 133. Local R → rr. Effect bodies moved verbatim. QA: VFX lab, seeded Math.random — blast particle counts identical to HEAD; later effects within ±few (the lab's live rAF ages leftovers); no errors.

### [x] T-270: One small math module for the 3D code
Spec: —          Goldens: unchanged          Save: no change
Goal: `clamp / lerp / ease / smooth / wrap` defined once for js/render3d and js/map3d (today 2–3 copies; two `ease` curves).
Files: js/render3d/m3d.mjs (new), secondary3d.mjs, gait3d.mjs, ik3d.mjs, poses3d-cele.mjs, actors3d.mjs, js/map3d/geo3d.mjs (re-exports)
Do not: unify playback.js's `ease` (a different curve, classic script); change a curve — keep both as `easeS` (smoothstep) and
`easeIO` only if both are used.
Accept: grep shows one definition each under js/render3d + js/map3d; lint + tests pass; Monster QA no errors.
Result: js/render3d/m3d.mjs (clamp, lerp, ease = smoothstep, smooth, wrap); geo3d imports + re-exports them; secondary3d, gait3d, ik3d, poses3d, poses3d-attack, poses3d-cele, actors3d import from it — one definition each under js/render3d + js/map3d (playback.js's ease-in-out stays: a different curve in a classic script). Monster QA no errors; tests pass.

### [x] T-271: Dev tools load on demand
Spec: §2.22          Goldens: unchanged          Save: no change
Goal: the game loads no dev code until a dev tool opens; a new dev tool = one file + one `DEV_TOOLS` entry.
Files: index.html (drop vfx-lab.js, vfx-panel.js, anim-lab.js), js/ui/dev.js (new: `DEV_TOOLS = { vfx: [...files], anim: [...] }`,
`devOpen(name, fn)` injects the scripts once, then calls `fn`), js/ui/menu.js (Dev buttons → `devOpen`), js/ui/match-screen.js
(`animLabInit` only via `fx.anim`, guarded), tests/ui-smoke.js, ARCHITECTURE.md
Do not: move debug-panel.js (the Debug log is for players' bug reports); change what the labs do.
Accept: a fresh load defines no `LAB` / `animLab*` globals; each lab opens from the Dev tab and works (ui-smoke + QA); lint passes
(ESLint globals: add the lazy files to the shared list in eslint.config.mjs).
QA: menu › Dev › VFX lab, Animation lab, VFX panel in a Monster game.
Result: js/ui/dev.js: DEV_TOOLS { vfx, lab, anim } + devLoad / devOpen (scripts injected once, in order); vfx-panel.js, vfx-lab.js, anim-lab.js out of index.html; menu (VFX lab, Animation lab), the match's VFX button / V key and the Cut-scene / Animation lab panels go through devOpen; eslint.config.mjs reads the dev file list for shared globals. UI smoke 13/13 (asserts no lab globals before the lab opens).

### [x] T-272: Island map — camera and input out of `create`
Spec: §4.9 §4.18c          Goldens: unchanged          Save: no change
Goal: map3d `create` (373 lines) keeps the scene and `api`; pan / zoom / grab / fly-to / follow / walk lock move to a controller.
Files: js/map3d/map3d.mjs, js/map3d/mapcam3d.mjs (new: `createMapCam(cam, canvas, { ground, clampView, onPick })` → `{ centre,
overview, flyTo, frame, busy, dispose }`), ARCHITECTURE-details.md
Do not: change camera feel (speeds, clamps, easing) or the `MapView` API.
Accept: map3d.mjs `create` < 200 lines; map / map3d tests pass; career QA: pan, zoom, ◎ Me (C), click a place, walk lock.
Result: js/map3d/mapcam3d.mjs (new): createMapCam(cam, canvas, sun, parts) → view, initView, fit, centre, overview, flyTo, walkFrom, step, walking, onWheel, dispose — the pan / zoom / click / fly / follow / fence code moved verbatim; map3d create also lost the lights + sea (lightScene) and the GPU release (releaseScene) to module helpers: 373 → 205 lines (deviation: target < 200; the rest is the model sync and the frame). QA (career hub, Playwright): wheel, drag, ◎ Me, pick a place, overview behave as HEAD (views within the run-to-run timing spread); map tests pass; no errors.

### [x] T-273: style.css split — base and match
Spec: §9          Goldens: unchanged          Save: no change
Goal: style.css (2 095 lines) = page base only; the match screen's rules live in match.css, so match UI work touches one file.
Files: css/style.css, css/match.css (new, loaded right after style.css), index.html, ARCHITECTURE.md (CSS list)
Do not: change a selector or a value; reorder rules inside a file (cascade).
Accept: computed styles identical — hub, four sheets, match (rail open), menu screenshots 0.00 % vs HEAD (match = noise).
Result: style.css 2 069 → 575 lines (page base + glossary terms); css/match.css (new, 1 494, loaded right after style.css): everything from the result-card / small-screen block on except the glossary, in the same order. QA: computed styles of every element (sorted properties) vs HEAD on menu, settings, create, encyclopedia, hub, four sheets, a place panel, a Monster match (rail box / tactics) and the result card: identical — the only differences are runtime timing (map labels, 3D portraits loading, a fade mid-animation).

### [x] T-274: tasks.md and docs trim
Spec: —          Goldens: unchanged          Save: no change
Goal: tasks.md shows only open work: done revamp tasks (T-253–T-263, T-250–T-252) and part 4 become one line each under Done,
full text appended to tasks-done.md; the Now preamble shrinks to the open tasks' ownership. ARCHITECTURE "How to add…" gains: a
team plan (§2.26), a lane read (§2.24), a venue's air (§2.27), a director event (§2.15). T-212 done here (design system status).
Files: tasks.md (targeted moves only — never regenerate or reflow it), tasks-done.md, ARCHITECTURE.md, the design system artifact `project/status.md`
Accept: tasks.md < 350 lines; no task text lost (diff: every moved block is in tasks-done.md).
Result: tasks.md 711 → 341 lines: 33 done tasks + the three batch preambles moved verbatim to tasks-done.md (asserted), one line each under Done; a short T-259 / T-260 seam note replaces the revamp preamble; State refreshed (2026-10-12). ARCHITECTURE How to add…: a team plan, a lane read rule, a venue's air, a director event / line. T-212 done (design system status page). Also: the last two non-custom-property inline styles (fire-meter ticks → --at, VFX lab element buttons → --ec), computed styles identical.

### [x] T-275: Engine — rally loop and match state in named parts (after T-259, T-260)
Spec: §2          Goldens: unchanged          Save: no change
Goal: `rally()` (124 lines) reads as a list of phase calls; `newMatch` (110) builds its state from small makers (`teamState`,
`rallyState`, `logs`), so new per-match state (ace traits, AI memory §5.7) has one obvious home.
Files: js/engine/rally.js, js/engine/match.js, ARCHITECTURE.md (engine flow)
Do not: move, add or drop any R() draw; change beat / act shapes or snapshot fields.
Accept: goldens unchanged; no function in the two files > 80 lines; `npm test` full.
Result: Done before T-259 / T-260 (no agent was on them; deviation from the order note — they now hook into the named parts). rally() 124 → 17 lines: possessionStart, setPhases ({ end } | { s, h, a }), attackPhases, endOf. newMatch 110 → 69: matchTallies, lineupOf, rallyState, matchPlans (key order kept; the serve R() draw in place). Goldens unchanged; 131/131 full; nothing in the two files > 80 lines.

### [x] T-276: Refresh the refactor notes
Spec: —          Goldens: unchanged          Save: no change
Goal: the "Refactor seams to cut only when the feature is specced" list under Later matches the code after T-269–T-275 (drop the
done ones; add what remains: `Overlay` 511, `SOUND` 490, town / life / pins builders ~300 each, `startBeat` 113).
Files: tasks.md (that list only)
Result: Later › refactor seams rewritten with today's sizes: done ones dropped (createFx, map3d create, engine loop); added Overlay 511, SOUND 490, fx createKit 490, map3d builders, buildArena, startBeat, career-hub.js, career.css / match.css; ace-trait / AI-memory hooks point at the T-204 / T-275 seams; right-click actions stay unbuilt until decided.

**Open from the match revamp (spec §2.14, §2.17): T-259 → T-260, one engine agent.** Seams in place: `js/data/momentum.js`
(`STAGES`, `STAGE_IDS`, `stageOfSnap`), `js/engine/fire.js` (`capReady`, `capCall` stubs), act `stage` → `stageShow` + `Dir.stage`, the
AI captains will call `capReady` / `capCall` (the player chips are gone, 2026-10-14). Contracts: stage act `{ k: 'stage', side, from, to, why }`; snapshot
`fire`, `stage`; `capCall(m, side, 'fire' | 'settle')` → beats. The batch notes (ownership, contracts) are in tasks-done.md.

### [ ] T-259: Fire, stages and temperament replace momentum and the zone (Agent B)
Spec: §2.14          Goldens: update (stages change the buffs and draws of every match)          Save: no change
Goal: every match tracks fire and a stage per team with the §2.14 buffs, triggers, exits and temperaments; the beats announce changes.
Files: js/engine/fire.js, match.js (pointMomentum, pointZone, snap), stats.js (boost: stage buffs), elements.js / hype.js (zone →
Fever reads), js/data/momentum.js, tests/momentum.test.js, tests/engine.test.js, tests/golden.json
Do not: rename `m.zone` / `m.zoneHit` (aliases of Fever); change the coach's timeout logic beyond "timeout → Composed".
Steps:
1. `m.fire` (= today's mom rules), `m.stage`, `m.temper` (from personalities, §2.14); `fireStage(m, side)` with the temperament
   thresholds; Fever only with a trigger; Fever timer; exits (error, breaker, stuff, timeout, settle).
2. boost(): replace `0.06 × mom` with the stage buffs (atk → power in play, def → defense in play, spd, jump, serve).
3. Emit `{ k: 'stage', side, from, to, why }` beats on every change (only when `m.rec`); `snap` gains `fire`, `stage`, `temper`.
4. Zone-breaker cut-in and the old "In the zone" cut-in: keep the breaker; "In the zone" → "FEVER" (cut title).
5. Tests: every stage reachable; Ice never Loose / Fever; Fever ≤ 4 points; buffs applied (effective stats at each stage).
Accept: goldens updated with the reason; tests pass; report stage time shares from a 400-match headless run in Result.
QA: none (engine).
Result:

### [ ] T-260: Captain's calls and the balance check (Agent B)
Spec: §2.17, §2.14 (balance)          Goldens: update (the random captain buff goes)          Save: no change
Goal: captains call Fire up / Settle on a leadership cooldown (the AI for every captain); `npm run balance` prints the stage numbers and the stage buffs hit their targets.
Files: js/engine/fire.js (capReady, capCall), match.js (captainThink: the buff → AI calls; drop the zone captain's call),
js/data/momentum.js (tuning), tests/balance.js, tests/momentum.test.js, tests/golden.json
Do not: touch the captain's tactic / defence switches; tune off steps of 5.
Steps:
1. capReady / capCall per §2.17 (cooldown 5 / 4 / 3 points by leadLv); beats: the captain's `call` line, `plabel`, `log`, `stage`.
2. AI captains: Settle when Loose; Fire up when 2+ down or at set point — every captain, yours too (the player chips were
   removed, owner 2026-10-14).
3. tests/balance.js: 1000 headless matches of league teams → table: point win rate per stage vs Composed, stage time share,
   Fevers per match, per temperament, with / without captain calls. Tune momentum.js to the §2.14 targets (±2 points).
Accept: goldens updated; the balance table in Result; tests pass.
QA: none (engine).
Result:

### [ ] T-230: Study — a private tutor and bookstores (Agent B, after T-228)
Spec: §4.14b          Goldens: unchanged          Save: no change (new `run.study` via the defaults table, no RUN_VERSION bump)
Goal: wit has two more sources and late-season money has somewhere to go.
Files: js/data/city.js (SPOTS × 6, STUDY, BOOKS), js/career/study.js, js/career/city.js (City.can, City.dayWhat; City.day
already hands acts `tutor` / `books` to `Study.day`), js/career/run.js (defaults: `study: { tutor: 0, week: -1, read: [] }`),
js/career/mapmodel.js (only if the new places need a lot / keep-out), js/ui/career-study.js, tests/study.test.js
Do not: add a building kind in js/map3d (use the generic place pin; ask if that looks wrong); draw R() (book stock is a hash).
Steps:
1. Data: 3 tutors + 3 bookstores in SPOTS (region wei / wu / shu, on land in each faction's town, names from lore.md's voices),
   `STUDY = { tutor: { fee: 150, step: 40, side: 2 }, books: { fee: 60, stock: 3, xp: 0.5 } }`, `BOOKS` ~12 `{ id, name, mul, side? }`.
2. `Study.can(run, id)` → { ok, why } (fee, once a week for the tutor, nothing new on the shelf); `Study.stock(run, id)` (hash);
   `Study.day(run, id)` → diary line (City.arrive, fee, the XP via Training.addXp / Training.train-style session at Lv 5 for the tutor).
   City.can calls Study.can for those acts; City.dayWhat → `{ k: 'train', label: 'Tutor' | 'Read', stat: 'wit' }`.
3. `studyPanel(run, id, base, travel)`: placeCard with the fee and gains on the button (`Book a session · $230 · 1d`); the
   bookstore lists this week's 3 titles as buttons (read ones struck through, disabled).
4. Tests: fee climbs per session; once a week; book read once; stock is stable for a week and changes the next; no R() draws.
Accept:
- A tutor session gives ≥ a Lv 5 Wit day's wit and the key-stat side gain; a book gives half a Lv 1 day × mul.
- Headless 28-week play (harness playRun or a scripted run that books the tutor weekly from week 10): report money at
  weeks 20 / 28 before and after.
QA: career run → each new place's card; book a session; read a book; the day track shows the slot.
Result:

### [x] T-212: Refresh the design system status page

Spec: §9 Goldens: unchanged Save: no change
Goal: the design system's `project/status.md` matches the build after T-205–T-210 (TitleScreen is built since T-176 / T-177;
new file homes; drift counts).
Files: the design system artifact `project/status.md` only (spec chat publishes it).
Result: Done in T-274: the design system's project/status.md checked against the build on 2026-10-12 — TitleScreen built, file homes after T-205–T-208 / T-273, drift counts (hex 0, inline non-var styles 0, sub-12px 0), the prompts removal, Match prep / Coach panel as uncarded; published (design system v21).

## Later — outlines

Features (spec first):

- Faction events that change the map (spec §4.24, draft — owner to confirm).
- Endless mode (spec §4.26: no guarantees; national call-up by grades).
- Living map layers B / C (spec §4.16: individual figures, approaches on the map).
- Balance pass (spec §4.10 condition values, §5.5 severe injury, hype frequency §2.3).
- Match revamp, parked (owner, 2026-10-07): the match remembers your choices ("AI memory"); back-row defensive commands;
  temperament changing how a team plays; the read meter for AI hitters; pre- and post-match lines (§2.18).
- Off-hand line shot (owner, 2026-10-07): a right-hander attacking from the right side who hits down the line (to their right)
  gets ~15 % less power and picks that shot less often; an ace trait "Wrist-away" removes the penalty (blockers don't expect it).
  Then the display: torso turns toward the shot, wrist rolls out on the line shot. Left-handers later flip it. Engine → goldens.
- Smaller player models (owner, 2026-10-08): the 6 Monster VRMs are ~9 MB each (63 MB of base64, mostly PNG textures). gltf-transform
  them — textures resized to 1024 and KTX2 (or WebP), meshopt geometry; three's KTX2Loader / MeshoptDecoder decode — target 1.5–2.5 MB
  each; cache the decoded files in IndexedDB so a second visit downloads nothing. Goes with T-088.

Refactor seams to cut only when the feature is specced or the file is next touched (not now — YAGNI; sizes 2026-10-12):

- Year 2 / Endless (§4.26, §4.28): `run.year` + a `Season` helper for week-of-season checks (story gates, Stars curves,
  CALENDAR / CUPS) — needs a save bump.
- Ace traits (§8) / AI memory (§5.7): a roll-modifier hook at the stuff / receive / clutch / hang rolls on top of the named
  engine steps (T-204, T-275); per-match state in `newMatch`'s makers (`matchTallies`, `rallyState`).
- Kenshi-style right-click actions (§5.7, proposed): an action list per picked thing once decided — not before.
- Big closures, split by layer when next touched: `Overlay` 511 (render/overlay.js), `SOUND` 490 (audio/sfx.js), fx `createKit`
  490 (the pools and meshes: one file per primitive), map3d builders `createTown` 343, `createLife` 309, `createFurniture` 304,
  `buildTerrain` 227, arena3d `buildArena` 295; `startBeat` (playback.js) by act group.
- UI files: `career-hub.js` 533 (top bar / rail / inbox / brief), `css/career.css` 1800 by screen, `css/match.css` 1494 (HUD /
  rail / result / dev lab).

Cleanup, part 2: T-082…T-087 done (see Done). Open:

- T-088 [?]: Big binaries — keep base64 for the artifact but store .glb/.mp3 in Git LFS and generate the .txt at publish.
  Question: today `assets/vrm/*.glb.txt` (18 MB of base64 text) and the .mp3 sit in plain git. Moving them to LFS means either
  `git lfs migrate import` (rewrites history, needs a force push) or LFS only for new commits (old blobs stay). Which? Also confirm
  LFS is enabled for glairlyyy/spiker and that the artifact publish step may decode/encode (`base64 -d` / `base64`) at publish time.

## Done

- T-253: Seams for the match revamp (spec chat)
- T-254: Stage chips and the fire meter replace "In the zone" (Agent A)
- T-255: The between-point exchange box (Agent A)
- T-256: Prompts on screen — Call / Fake / Block, setter markers, captain chips; the old calls UI goes (Agent A)
- T-257: The read meter and Call / Fake / Block (Agent B)
- T-264: Remove the one-press prompts and the calls; keep the captain's calls (solo — no other agent meanwhile)
- T-261: The director — effects by stage (Agent C)
- T-262: The arena follows the hotter team; auras by stage (Agent C)
- T-263: Cinematic lines between points (Agent C)
- T-228: Hops inside a faction are free — NEAR_R covers its district (Agent B)
- T-229: Court matches at the official venues (Agent A)
- T-252: Full-court match screen — the 3D court fills the screen, the HUD floats over it (owner request, spec chat)
- T-232: The rally is pausable — one engine, two pickers
- T-233: Decision options with odds and the stats behind them
- T-234: Calls on screen — slow down, vignette, options beside your player
- T-235: Calls on the result card — what held you back
- T-251: Rally touch counter — the combo counter (owner request)
- T-250: Camera shake — spike kick and floor rumble (owner request)
- T-249: Blockers only talk when they touch the ball (owner request)
- T-248: A hard kill bounces off the court (owner request)
- T-247: Foundation VFX for every player (owner request)
- T-246: Partial ink rings — the ensō (owner request)
- T-245: Ink style for every ring effect (owner request)
- T-244: Ball trail options (owner request)
- T-243: Hand trail style in the VFX panel (owner request)
- T-242: The air impact follows the ball (owner request)
- T-241: Live VFX tuning in the Monster game, with export (owner request)
- T-240: Air impact, reversed ring order — the Doppler look (owner request)
- T-239: Ink hand trails — the Lu Bu look (owner request)
- T-238: VFX lab and a ground blast (owner request)
- T-237: Match control bar that fits (owner request)
- T-236: Spike air impact — the Kuroko look (owner request)
- T-231: Docs diet and a UI smoke test (owner request)
- Knockdowns and recovery — a hard ball knocks the receiver down; loose → forced free ball, else a high ball over buys time to get up (spec §2.28; spec chat, owner request 2026-10-12)
- Receive power tiers (firm / hard / knockdown) with knock-back, shockwave rings, skid dust, hit-stop; flowing knockdown and get-up (spec §2.28; spec chat, owner request 2026-10-12)
- T-268: Crowd heat and the venue's air — wind outdoors, embers indoors, flames at Inferno; Monster venue picker (spec §2.27; spec chat, owner request 2026-10-12)

- T-267: Team plans, the AI coach's counters and match prep before every match (spec §2.26; spec chat, owner request 2026-10-12; goldens updated)

- T-266: Coach panel — the match rail's Coach tab: tags, hitters, block reads, serve receive (spec §2.25; spec chat, owner request 2026-10-12)

- T-265: Laning — channels, the block's read, the hitter's aim, the projected spike direction (spec §2.24; spec chat, owner request 2026-10-12; goldens updated)

- T-258: dropped (owner, 2026-10-10) — the setter's pick / Dump / AI "Mine!" went with the prompts (§2.16 removed); its serve / attack removal is in T-264.

Full text of every done task, newest first: **tasks-done.md** (read it only when a task points there). Recent:

- T-227: A result card after every match, simmed ones too, with the XP each stat got (owner request)
- T-226: An easier start — the island's players at OVR 40–50 (owner request)
- T-225: The island × 1.5 again (owner request)
- T-223: Nature objects and small life on the island
- T-224: Natural borders and biome ground that fades
- T-222: The Shu highlands — the Peak, the Spine, the river; level ground for every facility (owner request)
- T-221: Your new squad introduces itself (owner request)
- T-220: Kaede's lessons on the first click of a place (owner request)
- T-216: Motion tokens, the Motion helper and the screen veil
- T-217: Hub surfaces move
- T-218: Values that change
- T-219: Match screen motion

## Unplanned changes

(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md and then into tasks-done.md)
- 2026-10-08 The crouch before a jump goes deeper the higher the player jumps (owner): × 1 at Jump ≤ 40 up to × 1.5 at Jump 99 (`squatK`, `deepen` in poses3d.mjs: hip drop × k, joints × 1 + 0.3 (k − 1)) on the spike's load and the block's prep. QA (qa_poses, head height): spike load drop 0.47 → 0.71 m at Jump 99 (+51 %), block prep +36 %. Files: js/render3d/poses3d.mjs, poses3d-attack.mjs.
- 2026-10-08 Failed digs (owner): a scramble beat that ends in a kill gets no slow motion when the diver can't reach the spot in the beat's time (clear miss), and a short, light one (×0.6, last quarter of the beat) when they get there and it just beats them (near miss) — `missCheck` (movement.js), `NEAR_MISS_SLOW` (clock.js). QA (4 Monster games): clear misses 0 slow frames, near misses slowed only at the end. Files: js/render/movement.js, clock.js, playback.js.
- 2026-10-08 Slow motion keeps the court's own colours (owner): the `.slowmo` desaturate / contrast filter on the 3D view is gone; only the dark edge vignette remains (every slow-mo, scene and hit-stop). Files: css/style.css, js/render/clock.js.
- 2026-10-08 Dig / free-ball slow motion ends once the player taking the ball is set (owner): the far-dig chase (`_dig`) and the scramble drama (`hypeSlow` beats) stop slowing the world when that player is on their feet, not diving, within 0.35 m of the spot (`digArrived`, `b._rcv`); back to speed in ~0.1 s. QA (Monster, frames stepped): slow frames while set 17/41 → 6/34 (the ease). Files: js/render/clock.js, movement.js.
- 2026-10-08 Cut-ins removed entirely (the full banner and the mini notification, ⚙ Cut-ins, `#cut` / `#toasts`, showCut / showCombo / toast / hideCut, KEYS.cutins, G.cutMini, their CSS) and the commentary ticker (`#ticker`, logLine and its callers, CSS). Follow-up (owner): removed from the engine too — every `cut` / `combo` / `log` act and cut beat, the Cannon Serve roll (watched matches only), the COMBO / CBLK name tables; the director's call / fake events now come from a data-only `ev` act ({ kind: called | fake_ok | fail, p, q }); the clutch test counts trust / freeze call lines; the read test compares stuff rates over 300 sims. Goldens updated (matches). Files: js/render/acts.js, playback.js, clock.js, movement.js, director.js, js/ui/match-screen.js, match-controls.js, match-result.js, match-tech.js, menu.js, js/game/state.js, js/core/storage.js, js/engine/rally.js, rally-phases.js, rally-defense.js, match.js, serve.js, js/data/moves.js, js/audio/sfx.js, css/style.css, css/theme.css, tests/engine.test.js, read.test.js, golden.json, spec.md, ARCHITECTURE*.md.
- 2026-10-08 Momentum fades half as fast outside the zone (owner: Fever too rare): per-point fade and the lost-point drop × `MOM_FADE` 0.5 unless the team is in the zone (league sims, 400 matches: matches with a zone 62 → 95 %, team-points in the zone 6.1 → 12.2 %). Goldens updated (teams, matches, sims). The T-233 odds test removed (those calls left the screen in T-256); the clutch relationship test now compares the same draws (`plain` on m.relLog clutch entries) instead of two drifting runs. Files: js/engine/match.js, rally-phases.js, tests/engine.test.js, tests/golden.json.
- 2026-10-08 The read eye gauge is gone (the meter still works underneath); a full read (≥ READ.fake, 70) shows 👁 after the role in your name tag. Files: js/render/tags.js, js/ui/match-prompts.js, js/render/playback.js, css/style.css.
- 2026-10-08 Block is timing (owner; spec §2.16): the block prompt moved from their pass to the set (only when you are one of the blockers); E jumps you at once (`blockJump`, `ownJumps`), the answer is `{ id: 'block', t }` = ms before contact, graded perfect / good / early (READ.blockTol / blockGood / blockCov / blockStuff); no press → the AI jumps you at its take-off + 80 ms; the lane commit / late / crossed are gone. `ask()` accepts `{ id, ... }` answers. Files: js/engine/rally.js (blockYou, blockPrompt, setDurOf, blockT0), rally-block.js, rally-defense.js (stuff × x.stuffK), decide.js, js/data/rules.js, js/ui/match-prompts.js (blockLeft, blockJump, blockAuto), js/render/playback.js, tests/read.test.js, tests/ui-smoke.js, spec.md.
- 2026-10-05 Out of days ask: when the last day's action ends (lock over) with no days left, a card asks "No days left — End it?" with Yes, end the week / I'll stay (Esc = stay); never forced, asked once a week (`CW.nightAsk`). Files: js/ui/career-map.js (nightCard, nightAnswer, lockEnd re-render), js/ui/career-hub.js (hubCard, Esc).
- 2026-10-05 Intro: the big "25 – 4" title card is gone (the cold open starts on the diary line); the score is 15–4 everywhere (intro, rival meeting, choice, lore §, spec, stars comment). Files: js/data/story.js, js/data/stars.js, lore.md, spec.md, tests/career.test.js.
- 2026-10-05 Intro: "Home. For now." → "I followed the Academy's directions. So this is my new place, huh?" (you, on reaching the flat). File: js/data/story.js.
- 2026-10-05 The rival is **Haewon Bae** (was Tachibana Sae; given-first, `given: 'Haewon'`); her full or given name shows orange (`--rival`) in dialogue lines, her name plate and the log (`sbMark`, colour only so typing never re-wraps); old saves rename her on load. Files: js/data/stars.js, js/data/story.js, js/career/stars.js, js/career/run.js, js/ui/story-box.js, css/story.css, css/theme.css, spec.md, lore.md, tests/career.test.js.
- 2026-10-05 Intro names the rival: "Haewon Bae. The one who did it. She signed with an island club the same week." / "She's already here. So am I." (orange via sbMark). File: js/data/story.js.
- 2026-10-05 Fix: the rival-highlight change had broken story.css (every line was centred, 22px, italic grey); restored, and the cold open's narration is now left-aligned too. File: css/story.css.
- 2026-10-05 Thai names: every generated player is `<nickname> <family name>` from Thai pools (names.js; pool sizes kept, same draws); the cohort renamed (Praew Siriwong, Pond Thammasak, Fai Wongsakul) and the flatmate is Fern Kittisak (was Sanada Kaede); hype / Stars read the nickname as the first word; saves keep the cohort under their new names. Goldens updated (name hashes move ego / traits); bond calibration rebased (w60 5.2, w80 9.6); two fragile tests fixed. Rival still Haewon Bae — a Thai name is up to the owner. Files: js/data/names.js, js/engine/players.js, js/engine/hype.js, js/career/stars.js, js/career/run.js, js/data/stars.js, js/data/story.js, js/ui/story-box.js, js/ui/career-map.js, js/career/city.js, js/career/mapmodel.js, tests/career.test.js, tests/people.test.js, tests/golden.json, spec.md, lore.md, ARCHITECTURE.md.
- 2026-10-06 The rival stays **Haewon Bae** and is the one non-Thai name on the island (lore: the only mainland import); Fern says so when she names the season's players. Files: js/data/story.js, lore.md.
- 2026-10-06 Ego removed entirely: personality levels, EGO / REL_E.ego, steals, demanded sets, solo blocks + block collisions, hero swings / serves, m.egoLog, the ego moment (egoFocus / act `ego`), the ego memories (stole_my_ball, collided, hero_carried, set_hogged), the Me / person tag, the Egoist game. Old saves drop p.ego and those memories. The tracked shot kind `ego` → `follow` (calls). DECIDE attack.cut cal.err 1.25 → 0.8 (re-measured). Goldens updated. Files: js/data/rules.js, dialogue.js, people.js, js/engine/match.js, serve.js, rally.js, rally-block.js, rally-defense.js, rally-phases.js, players.js, save.js, stats.js, teams.js, js/career/rel.js, run.js, js/render/movement.js, acts.js, playback.js, overlay.js, js/render3d/camera3d.mjs, js/ui/dom.js, menu.js, sheet-me.js, career-people.js, match-calls.js, css/people.css, tests/engine.test.js, people.test.js, golden.json, spec.md, ARCHITECTURE*.md.
- 2026-10-07 Commentary tab cut from the match rail (now Box score · Tactics, opens on Box score); the 2-line court ticker stays, fed directly by logLine. Files: js/ui/match-controls.js, match-screen.js, match-result.js, css/style.css, spec.md.
- 2026-10-07 Bird's-eye camera (⚙ Camera / key C): 45° from behind your end line, your side at the bottom, the court fitted every frame; fits whatever shape the full-court screen (T-252) has; arena roof trusses hidden in it; tags dropped toward the heads. Phone (≤600px) scoreboard hides the rotation chips and rules line. Files: js/render3d/camera3d.mjs, r3d.mjs, venues/arena.mjs, js/ui/match-controls.js, match-screen.js, css/style.css, spec.md.
- 2026-10-08 In-play positions follow the rotation (owner, option 2): after the serve players switch to their role's spot but stay in their row — the two front-row players (rotation index 1, 2) at the net (x ≥ 440), the back row deep (x ≤ 320; a back-row setter waits at 400 to run in), a front pair spread ≥ 0.3 in z — so who blocks / attacks from the front row is who stands there (`playHome`, court.js; used by the serve and pass moves). Blocking is still by rotation (the setter never blocks, as before). DECIDE attack.cut cal → win 1.0, err 1.15 (re-measured). read.test.js: the read-vs-kills check pooled over seeds 11–13 (one seed was ±3 points of noise; the kill effect is ~1–3 points), strictly fewer kills (stuffs stay the strong check). Goldens updated. Files: js/engine/court.js, rally-phases.js, serve.js, js/data/rules.js, tests/read.test.js, tests/golden.json (engine files are Agent B's this batch — owner's direct request).
- 2026-10-08 (owner) The owner's VRMs (Main_v2, Rival_v2, Rivar_v3, Rivar_v4, male1, male2) are the Monster game's player models — every player picks one at random, never the base model. assets/vrm/{rival2,rival3,rival4,male1,male2}.glb.txt (Main_v2 = main.glb.txt), README.txt; players3d.mjs `BUNDLED`; r3d.mjs `loadBundled` (first Monster game, 4 figures each, behind the loader; `addModel(buf, name, n)`); actors3d.mjs dressActors (`fx.bundled`: pool = the loaded models, another bundled figure when one model's figures are taken); match-screen.js open3D (holds for them); menu.js startMonster `bundled: true`, Model colors button always in Dev. QA: first Monster game 43 s on swiftshader (download + 24 figures), next one 9 s; all 8 players bundled models; tests + test:ui green.
- 2026-10-08 Into Loose (owner; spec §2.14): the lost-point fire drop × heat (0.7 + 0.6 × fire, 0.4–1.3) and two shakes only — a lost marathon (≥ 5 possessions, `m.rallyN`) and a hard kill against a low-wit team (`momShaken`, `MOM_LOSS`). League sims, 400 matches: Loose entries 0.17 → 1.14 a match (low-wit teams 1.18 a team-match, high-wit 0.34), Loose share 0.5 → 5.5 %, Fever share 12.0 → 8.9 %, Fever entries 1.81 → 1.44 a match. Test floors widened for the shift (element spike win rate > 0.5, noise ±0.04; non-setter assists < 11.5 %, colder teams pass worse). Goldens updated. Files: js/engine/match.js, rally.js, serve.js, tests/engine.test.js, tests/golden.json, spec.md.
- 2026-10-08 The team-colour line under the role tag is gone (owner). Files: js/render/tags.js.
- 2026-10-08 A blocked ball meets one hand, not the head between both (owner): `block()` tags its hands target with `hz` (the court-z side the spike's path crosses the net on, no draws); r3d handTouch puts the ball against that palm, the 2D contact shifts 0.02 that way. Scoring unchanged (sims / teams goldens same); matches golden updated (the new field in recorded beats). Files: js/engine/rally-defense.js, js/render/playback.js, js/render3d/r3d.mjs, tests/golden.json, ARCHITECTURE-details.md.
- 2026-10-08 One-hand block: only the arm that meets the ball reaches for it, the other stays in the block pose (owner). Files: js/render3d/actors3d.mjs (blockHand), ARCHITECTURE-details.md.
- 2026-10-08 Back bump (owner): a passer whose ball is ≥ 2 m behind them (mostly away from the net) turns, runs back and bumps it over the head instead of backpedalling (~10 % of bumps in a Monster game). Display only. Files: js/render/playback.js (backBumpLook, resolve), js/render3d/actors3d.mjs (steer), js/render3d/poses3d.mjs (BACK_UP), ARCHITECTURE-details.md.
- 2026-10-08 Turn and run (owner): a long fast run that isn't forward turns the body to the run direction instead of a backpedal (blockers, setters and a hitter's short run-up retreat excepted); back-row hitters (pipe, long back attack) in front of their run-up depth sprint a curve round to the take-off point, accelerating, instead of backing up and running straight in. QA (Monster, 12k frames): backpedalling ≥ 0.7 s 1 → 0, back-row curves end ≤ 0.03 m from the take-off point. Display only, goldens unchanged. Files: js/render/movement.js (`backCurve`, `curveMove`, approachOf `back` / `deep`), js/render/playback.js, js/render3d/actors3d.mjs (`longRun`), ARCHITECTURE-details.md.
- 2026-10-08 Stride by distance (owner): long runs take long strides, the last metre or so small quick steps (gait cycle 0.8–1.3 m short → 1.25–2.85 m long; leg swing × 0.65 → 1.15). Display only. Files: js/render3d/actors3d.mjs (STRIDE, motion), js/render3d/poses3d.mjs (locoPose), ARCHITECTURE-details.md.
- 2026-10-08 Cinematic ace (owner): an ace rally gets a heroic camera — the ball in the server's hands as they bounce it, down to the feet for the run-up, a side view of the hit, then riding the ball to the floor; one per 2 points a side scores (budget per side); off with Hype off / reduced motion / fixed camera. Display only. Files: js/render/cine.js (new), index.html, js/render/playback.js, acts.js, scenes.js, overlay.js, js/render3d/camera3d.mjs (acePose, tracked-shot glide + fov), r3d.mjs (coach tags hidden in shots), ARCHITECTURE*.md.
- 2026-10-08 Cut-scene preview list (owner): menu › Dev › Cut-scenes lists the kinds (Ace for now); ▶ starts a Monster game where every rally stages it (no budget, any settings). Engine: `m.dev = 'ace'` forces a clean ace after the same random draws (goldens unchanged). Files: js/render/cine.js (CINE_KINDS, cineForce), js/ui/menu.js (startMonster({ cine })), js/ui/match-screen.js, js/engine/serve.js, ARCHITECTURE-details.md.
- 2026-10-08 Cut-scene lab (owner; replaces the preview list): menu › Dev › Cut-scene lab = the Ace Monster game with its camera values live in a side panel (bounce / run-up / hit / ball: position, look, field of view, glide; hit distance; landing hold), ¼ / ½ / 1× speed, Copy / Download like the VFX panel. The camera numbers moved into VFX groups cbounce / crun / chit / cball (same defaults). Files: js/data/vfx.js, js/render3d/camera3d.mjs, js/render/cine.js, js/ui/vfx-panel.js, js/ui/menu.js, js/ui/match-screen.js, ARCHITECTURE-details.md.
- 2026-10-09 Ace cut-scene camera: the owner's lab values baked in (bounce fwd 4.3 / side 3 / look 2.5 / ball 1 / fov 15; run-up look ahead 2; hit ball 1, hand-off at 1.1 m; a few slider ranges widened). Cut-scene lab: Force rotate (On: the serve changes sides every rally and that side rotates — every server in turn; engine `m.devRot`, dev only, goldens unchanged). Files: js/data/vfx.js, js/engine/match.js, js/ui/vfx-panel.js, ARCHITECTURE-details.md.
- 2026-10-09 Paused, the 3D camera keeps easing on real time, so Cut-scene lab edits show on a paused frame; in the lab, pausing no longer opens the details rail over the panel (owner). Files: js/render3d/r3d.mjs, js/ui/match-controls.js.
- 2026-10-09 Ace cut-scene camera, owner's second lab pass baked in (bounce look 2.25; run-up fwd 2.5 / side 2.1 / up 0.5 / look 0.3 / ahead 1.2 / fov 26; hit fwd −1.8 / side −0.5 / look 0.2 / ball 0.6 / fov 33 / hand-off 1.9 m). Files: js/data/vfx.js.
- 2026-10-09 WS kill cut-scene (owner): a wing spiker's kill gets the heroic camera — over the hitter's shoulder from the pass as the set goes up, low at the feet for the approach, beside the arm at the swing (slow motion ×0.5 from the set to the swing), then riding the ball to the floor; shares the per-side budget with the ace. Cut-scene lab: kind switch Ace / WS kill (WS: every WS kill plays it), its own camera groups wset / wrun / whit / wball. The camera framing is now generic (CINE_KINDS phases → VFX group + feet / hand / ride). Files: js/render/cine.js, clock.js, js/render3d/camera3d.mjs, js/data/vfx.js, js/ui/vfx-panel.js, ARCHITECTURE*.md.
- 2026-10-09 Point celebrations (owner): the scorer's 'roar' becomes a keyframed move that starts only once they have landed (feet down, landing absorbed, swing done — fixes the roar firing mid-air): fist pump "Yes!", jump-spin-stomp (big points: a dramatic kill, a 3+ streak, Fever; at most once per 4 points), sky roar with a jump, finger to the sky, taunt (finger to the lips / hand to the ear), shy hop — by personality (hot / cool / cocky / shy / leader), a hash pick (no R()); the nearest teammate (≤ 3.5 m) turns and high-fives, others clap (always on a big point). Ends early when the player is sent somewhere; the match-end celebration unchanged. Display only, goldens unchanged. Files: js/render3d/poses3d-cele.mjs (new, imported by poses3d.mjs), poses3d.mjs, actors3d.mjs, js/render/acts.js.
- 2026-10-09 MB quick cut-scene (owner): a middle's quick kill — over the setter's shoulder as the pass comes in, beside the middle's arm in the air for the set and the hit (slow motion ×0.4), riding the ball to the floor; shares the per-side budget. Lab kind "MB quick" with groups qset / qhit / qball; a phase can now be framed on the setter (CINE_KINDS 'p2'); the slow-motion group is per kind. Files: js/render/cine.js, js/render3d/camera3d.mjs, js/data/vfx.js, ARCHITECTURE*.md.
- 2026-10-09 Slow-motion cooldown (owner): slow motion plays for a team at most once every 3 points (one cooldown for all kinds; per kind optional) — staged hype scenes (skipped like Hype off), impact frame, fake set, scramble, kill block / block break, Delayed Spike; the far-dig chase (hides the animation) and the cut-scenes are exempt. Monster games: rallies with slow motion ~70 % → ~45 % (cooldown 4: ~30 %). VFX panel group "Slow-motion cooldown" (on, points, shared). Display only. Files: js/render/slowmo.js (new), index.html, js/render/playback.js, director.js, js/data/vfx.js, ARCHITECTURE*.md.
- 2026-10-09 Animation lab (owner, before the IK work): menu › Dev › Animation lab — a Monster game that keeps the last 8 s of every player (exact bone rotations, roots, pose values, display state, feet, ball); Freeze to scrub frame by frame, play at ¼ / ½ / 1×, step, orbit around a chosen player (drag / wheel), foot marks (a sliding foot smears), edit the frame's pose values live (body, legs, arm segments, twists) and Copy the frame as pose code. Dev only, display only. Files: js/ui/anim-lab.js, js/render3d/anim3d.mjs (new), index.html, js/render3d/r3d.mjs, actors3d.mjs, players3d.mjs (DRIVEN exported), js/ui/menu.js, match-screen.js, match-controls.js, vfx-panel.js, ARCHITECTURE*.md.
- 2026-10-09 IK (owner): feet are planted — a foot that is down stays on its spot until the pose lifts it or it would slide 16 cm, then steps over 0.12 s (foot sliding while down in a Monster game: ~7–13 mm → ~1.5 mm per frame); hands / forearms go to the ball at contacts by two-bone IK (bump: forearms under it, set: both hands around it, spike / serve / dive / one-hand block: the palm on it; closest approach spike ~0.37 → 0.25 m, bump ~0.2 → 0.14 m, the designed grip). VFX panel group "IK" (feet / arms on-off, slip, step time, step lift, down height). Display only. Files: js/render3d/ik3d.mjs (new), actors3d.mjs, r3d.mjs (QA hooks qaFeet / qaHands), js/data/vfx.js, ARCHITECTURE*.md.
- 2026-10-10 Hand spin fix (owner): arm twists blend by the real roll (slerp, not the number — keys with the same palm but twists far apart spun the hand a full circle, e.g. the spike's BOW −π → WHIP 2.83), RA palm twists on one branch, arm IK fades out when the pose's arm is far off the target line, aims at the flight ball with a fixed elbow pole and eased weights (hand roll > 15°/frame about the forearm in a Monster game: 12% → 4% of frames with IK, 12% → 4% without). js/render3d/poses3d.mjs, poses3d-attack.mjs, poses3d-cele.mjs, ik3d.mjs, actors3d.mjs, r3d.mjs.
- 2026-10-10 Shaky legs fix (owner): foot planting with hysteresis, steps relative to the pose's foot, a fading residual on every lock / step / release (no more half-metre snaps when a jump or a shuffle hop dropped the locks), no planting above VFX.ik.run (4 m/s, new setting), a steadier knee pole; gaits blend by eased weight instead of switching; the body turns with a damped spring (leg zigzags > 3 cm in a Monster game: ~1700 → ~600, FK alone ~320). js/render3d/ik3d.mjs, actors3d.mjs, poses3d.mjs, poses3d-attack.mjs, js/data/vfx.js.
- 2026-10-10 Feet on the ground when standing (owner): standing still, both feet planted flat on the floor (one used to hover ~3.5 cm in half of all standing frames and flicker planted / lifted; now ~2–4 %); straight-legged poses no longer step forever on the spot (the reach check); pose lifts (hops, clap bounce) raise the feet without a step arc; one foot steps at a time; the walk stops when the body stops (speed estimate decays fast); the pre-serve routine eases in from the stand and blends with the walk. New VFX.ik.stand. Foot slide while down: FK ~15 mm/frame → 2.7. js/render3d/ik3d.mjs, actors3d.mjs, poses3d.mjs, js/data/vfx.js.
- 2026-10-10 Secondary motion (owner): weight shift when walking (hips over the stance foot, pelvis drop, chest level), torso lagging the hips on a sudden turn and a lean into it when running, the head level and on the ball when running (aim error while running 43° → 29°, head jitter −10 %), a landing settle spring (≤ ~4 cm, knees bend, feet stay on the floor — foot IK never targets below it). VFX group "Secondary motion". Leg jitter / standing feet unchanged. Files: js/render3d/secondary3d.mjs (new), actors3d.mjs, poses3d.mjs, ik3d.mjs, r3d.mjs (qaBallW), js/data/vfx.js, spec.md, ARCHITECTURE*.md.
- 2026-10-10 Idle stances (owner): READY rebuilt — wide athletic stance (shin splay `ss`, new optional leg field), right foot ahead, knees over toes, heels light, flat back leaning forward, arms relaxed in front with hands apart (was a deep narrow squat, knees in, arms locked out in the grip); STAND — contrapposto, loose arms; the quick hip pump replaced by a knee bounce + slow weight shift (ready) and breathing + sway (standing), per-player phase. Files: js/render3d/poses3d.mjs (READY, STAND, idleReady, idleStand, mixLeg ss), players3d.mjs (legDirs ss), poses3d-cele.mjs, js/ui/anim-lab.js, spec.md.
- 2026-10-10 Waiting-stance variants (owner, from two reference photos): hands on the knees (REST_KNEES; the hands put on the player's own knees by IK, `kneeHands` in ik3d.mjs) and palms to the sky (READY_PALMS), besides hands apart; picked per player per rally by hash (`A.rallyNo`, playback reset; no R()); hands on knees only while calm (ball dead / server in the routine), eased up into the ready on the toss (`d.restW`). Files: js/render3d/poses3d.mjs, ik3d.mjs, actors3d.mjs, js/render/playback.js, spec.md.
- 2026-10-10 Run stride (owner: sprint steps too short and too quick): step length from speed (0.35 + 0.22 × speed m, 0.45–2.4, × 0.6 over the last 2 m; `m.step`, STRIDE in actors3d.mjs), the leg swing sized to it (locoPose stride = step / the keys' step), more flight and lean sprinting. Monster game: sprint 9+ m/s 9.0 → 4.4 steps/s, step 1.13 → 2.2 m; 4.5–6 m/s 7.5 → 5.3 steps/s. Files: js/render3d/actors3d.mjs, poses3d.mjs, spec.md.
- 2026-10-10 Arms swing when walking / running (owner): a generic pass at the end of playerPose blends finished moves (block / spike / serve after landing — `d.upAge` per move —, set released, bump played, cele, roar, slump, huddle) into the run, arms included (`armsFree`); `kneeHands` is a blended pose number and eased in actors3d (`pl.khW`), and the rest is let go while moving; running to a pass / under a set the arms swing until ~1 m out (`runArms`, m.far). Monster game, frames running with the arms not swinging: rest-on-knees 14 % → 0, bump approach 40–91 % → 0, setprep 36–48 % → 15 %, block after landing 24 % → 3 %. Files: js/render3d/poses3d.mjs, actors3d.mjs, spec.md.
- 2026-10-10 No needless dives + bump direction (owner): playback `diveLook` turns a dive into a run-and-bump when the dig spot is within 1.8 m or reachable on foot at 0.7 × sprint in the beat's time (the act, its ball contact, a "Pancake!" label dropped; engine untouched, goldens unchanged); `backBumpLook` decides by direction when the next pass is known (`passTarget`): back bump if the pass goes ≥ ~115° from the run and the run is mostly away from the net, else a normal bump. Files: js/render/playback.js, acts.js, spec.md.
- 2026-10-10 Planted gait (owner, motion pass 1): new js/render3d/gait3d.mjs — phase-driven foot planner (duty from sweep / step, locked contacts, heel-up swing to the predicted landing, hips dipped for reach, position-blended in by pl.gW from locoPose's `gaitW`), footIK hands over at gW 0.8; VFX group "Planted gait". Stance-foot slide while running 0.6–0.7 → 0.1–0.2 of body speed; leg zigzags unchanged (≈ 4.4 %); standing feet unchanged. Files: js/render3d/gait3d.mjs (new), actors3d.mjs, poses3d.mjs (gaitW), ik3d.mjs, js/data/vfx.js, spec.md, ARCHITECTURE*.md.
- 2026-10-10 Steady landings / dives / server reversal (owner, motion pass 2): poses3d-attack `landBlend` (spike, jump serve), playback `capMove` LAND_ABSORB + RUN_ACC + RUN_DEC (actors.js resets `d.cv`), ik3d dive run-in planting, actors3d dive steer rate, poses3d `armsFree` waits for the landing, gait3d fixed knee pole + root-based planning. Files: js/render3d/{poses3d-attack,poses3d,ik3d,actors3d,gait3d}.mjs, js/render/{playback,actors}.js.
- 2026-10-10 Feet under the body (owner: the body ran ahead of the legs): gait3d plans the swing in the hip's frame (`f.rel`) plus the landing's drift, landing re-aimed faster (rate 30). Sprint feet behind the hips on average 0.45 → 0.16 m (pose-only legs 0.14), run 0.31 → 0.08. Files: js/render3d/gait3d.mjs.
- 2026-10-10 Lower body under the body (owner: the run sat into a lunge, body ahead): gait3d owns the hip height (`pl.gHip`, near-straight legs, dip ≤ 12 cm for reach), landing ≤ ½ sweep ahead, heel rise at push-off; poses3d forwardGait lean from the waist (≤ ~12°, pelvis near level) and the generic run pass also blends hp / sp / hd / hroll / sroll toward the run. Lean sprint 20° → 10°, run 13° → 7°. Files: js/render3d/gait3d.mjs, poses3d.mjs.
- 2026-10-10 Legs lead turns, feet on the curve, lower jog knees (owner): secondary3d turnLag hip lead (`pl.hipLead`, VFX sec.lead) + gait knee pole; gait3d heading reset when the gait restarts (a stale heading put the first steps half a metre to the side), landings along the curve (`pl.gOm`), swing frame turns with the heading, lift lower jogging; playback capMove RUN_TURN on fast catch-ups. Feet outside a turn P90 0.51 → 0.09 m; hips ahead of the chest in turns 19° → 34°; stance slip 0.03–0.07 of body speed. Files: js/render3d/{gait3d,secondary3d,actors3d}.mjs, js/render/playback.js, js/data/vfx.js.
- 2026-10-12 No one-legged jumps (owner): the pipe (back-row attack) in the air tucks both knees with a slight stagger instead of the scissor (one leg forward, one back); the jump-spin celebration's two run-up bounces are weight shifts on the floor, not hops on one leg. A headless check of every airborne pose (6–12 Monster points, standing and moving) finds no other leg split > 0.6 rad. Files: js/render3d/poses3d-attack.mjs, poses3d-cele.mjs.
- 2026-10-12 Running spikes no longer leave in a scissor (owner): from the plant of a spike / jump-serve approach and in the air, the planted run gait lets go at once (gait3d: weight → 0 at rate 45 instead of easing out over ~0.2 s, which pinned one foot to its stride as the body rose); the approach plants earlier and loads longer (run → penultimate step → load → take-off at 0.5 / 0.68 / 0.88 of the approach); during take-off the bones follow fast, and at 2× / 4× speed every bone follows that much faster. Rendered check (Monster, 1×, take-off and air): thigh split max 0.79 rad before → 0.30 after. Files: js/render3d/gait3d.mjs, actors3d.mjs, poses3d-attack.mjs.
- 2026-10-13 Kneel's back foot fixed (owner): the one-knee pose (hard receive, knockdown get-up) bent the back knee past 90° with the ankle flat, so the shin rose behind and the foot stuck up in the air; now the thigh is upright, the shin lies flat behind with the knee by the floor and the toes tucked. Rendered check: back foot 0.42 → 0.22 m off the floor, knee 0.17 m. File: js/render3d/poses3d.mjs.
- 2026-10-13 (owner: "fix it"): tests/harness.js Math.random made uniform (`(x >>> 0) / 2^32`; was `% 1e9 / 1e9`, which drew values under ~0.29 25 % too often). Fallout: goldens updated; knockdown fixes it exposed — a knocked-down player no longer covers a blocked ball (rally-defense.js blockCover) or becomes the fallback blocker (rally-phases.js B0); calibrations rebased (people.test.js: fewer stars w12 3.2 / w28 7.2, was 5.2 / 9.6; bond 60 at week 2.6, was 5.2 — the real game, on an unbiased Math.random, always had these); scenario seeds moved (people 94→97, 144→148; career 71→73, 71→72; cup 51/52→53/54); laning ratio check 1.25 → 1.15 (~1.3 over 300 matches).
