# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. **Later** items are outlines: the spec chat details them
(files, steps, accept) and moves them to Now. Next free id: **T-236** (T-088 is open below).

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

## State (2026-10-05)

Everything through T-229 is built except T-088 (LFS question), T-212 (design system status page) and T-230 (study) — 127 tests,
RUN_VERSION 18: match engine and 3D playback, career (28 weeks, pools, evaluations, U21 Cup, Story mode with Kaede, the
rival and the aces, growth, relationships, court matches), UI §9–§10, hex territory §4.27, the island × 2.25 with nature and
the Shu highlands. Done tasks: one line under **Done** here, full text in tasks-done.md.

## Now

**Balance batch (owner, 2026-10-05): two build agents at once, by file ownership — never edit a file the other owns.**
The shared seams are already in place (spec chat): index.html entries, stubs `js/career/court.js` (`Court`),
`js/career/study.js` (`Study.acts`), `js/ui/career-court.js` (`courtCard`), `js/ui/career-study.js` (`studyPanel`),
`tests/court.test.js` / `tests/study.test.js` (in tests/run.js), the hooks in `venuePanel` / `placePanel` (career-panels.js)
and `City.day` (city.js), MKIND `court` (sheet-season.js). Neither agent edits career-panels.js, index.html, tests/run.js,
ARCHITECTURE.md (put the structural note in your Result line; the spec chat merges it) or another agent's task text.
tasks.md: change only your own task's status and Result lines, each with a targeted replace; if the artifact refuses
your publish because the other agent published first, re-read the refused files from the artifact, re-apply your edit and publish again.

- **Agent A** — T-229. Owns: js/career/court.js, js/ui/career-court.js, js/data/career.js, tests/court.test.js.
- **Agent B** — T-228 then T-230. Owns: js/data/city.js, js/career/city.js, js/career/study.js, js/ui/career-study.js,
  js/career/run.js, js/career/mapmodel.js, tests/study.test.js, tests/map.test.js, tests/people.test.js.

### [x] T-228: Hops inside a faction are free — NEAR_R covers its district (Agent B)
Spec: §4.5          Goldens: unchanged          Save: no change
Goal: training in Shu or Wu no longer loses a day per facility hop.
Files: js/data/city.js (NEAR_R), tests/map.test.js / tests/people.test.js only if an assertion moves
Do not: change TRIP_DAY, TRIP_MAX, REVEAL_R or road costs; add half-days.
Steps:
1. `NEAR_R = 280 * MAP_SCALE` (was 110); fix its comment.
2. Run the full tests; if the bond calibration (people.test) moves, rebase it like T-226 did and say by how much.
Accept:
- Trip days between one faction's training places: Wei all 0, Shu all 0, Wu ≥ 4 of 6 pairs 0 (headless, seed 7).
- Crossing to another faction's far side still costs ≥ 1 day; the ghost slots and Travel buttons agree.
QA: career run → train at two Shu places on consecutive days: no trip slot between them.
Result: NEAR_R 110 → 280 × MAP_SCALE (comment fixed). Seed 7: Wei 6/6 and Shu 10/10 pairs free, Wu 3/6 (sand–dunes 911, dunes–pier, harbor–pier are 2 days: the island grew in T-225) — owner chose to keep 280 over 410 (which frees Wu 4/6 but 70 % of cross-faction hops vs 30 %); no place reaches every other faction's places free. Ghost slots and Travel use City.trip (agree by construction). Bond / league calibration unmoved. QA (headless): trail → steps in Shu = two train slots, no trip; tests 125/125.

### [x] T-229: Court matches at the official venues (Agent A)
Spec: §4.21a (+ §4.14, §4.15)          Goldens: unchanged (engine)          Save: no change (mlog kind 'court')
Goal: a venue card offers Open / Pro / Elite court matches: a real match for XP and money whose loss costs only the fee.
Files: js/data/career.js (COURT), js/career/court.js, js/ui/career-court.js, tests/court.test.js
Do not: edit fight.js / cup.js / career-map.js / career-panels.js (call Fight, Eval, Cup, City, Growth, Skills, simCareer,
watchCareer, mapAfter as they are); touch the street hustle; draw R() anywhere but the opponent draw and the ace roll.
Steps:
1. `COURT = { tiers: [{ id, name, fee, off, ace, fans }…], prize: 2.5, sta: 10, injury: 0.5, pool: 12 }` per §4.21a.
2. `Court.why(run, id)` ('' = can play): training week, not injured (Fight.ban), time (City.noTime), money ≥ fee + hired crew.
   `Court.target(run, tier)`: the league mean OVR of the week + off. `Court.fixture(run, id, tier)` → the match fixture
   (opponents per §4.21a, ace roll, your side, `Cup.prepare` as Fight.clash does; onFinish → `Court.result`, onLeave → Eval.restore).
3. `Court.result(run, m, id, tier)`: City.go to the venue (day track `{ k: 'battle', label: 'Court' }`), fee, stamina,
   `Cup.record(run, m, 'court')`, Growth.matchXp, Skills.tryLearn, win → prize + fans; Fight.injure(run, risk × COURT.injury);
   run.lastFight; diary line; save.
4. `courtCard(run, id)` → `{ after }`: a "Court match" block with the three tiers as buttons (`Open · $20 · 1d`), Sim ⏭
   (CW.courtSim toggle or a second button), disabled with Court.why as tip; the ace line once drawn.
   `mapCourt(id, tier, sim)`: watchCareer(fx) or `mapAfter(RUN, null, simCareer(fx))`.
5. Tests: fixture sides and target band; a loss costs only the fee (mood, standing, fans unchanged); win pays 2.5 × fee;
   injury risk = half the street risk; no matches in eval / cup weeks; mlog kind 'court'.
Accept:
- Headless: Elite opponents average within ±3 of target; ace in ~15 % of 400 Elite draws; Open in ~3 %.
- Sim and watched both end on the T-227 card with XP rows.
QA: career run → a venue → Pro, Sim ⏭ → result card; then Open, watched → result card.
Result: built by the spec chat. `COURT` (career.js), `Court.why / draw / fixture / result` (court.js), `courtCard` + `mapCourt` (career-court.js): Play it / Sim it + Open $20→50 · Pro $80→200 · Elite $200→500 (level, ace %, injury on hover). Deviations: the league mean leaves the named out (they are never drawn; at week 6 an Elite target was above every drawable player); you always start (forceYou — a benched you earned nothing). Tests: draws by role, Pro mean ±3 of target, aces 6 % / 15 % / ≤ 3 %, loss = fee only, win = 2.5 × fee, risk × 0.5, no eval week / injured / short of money. QA: venue card, Pro sim → result card, Open watched → result card; no errors.

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

### [ ] T-212: Refresh the design system status page

Spec: §9 Goldens: unchanged Save: no change
Goal: the design system's `project/status.md` matches the build after T-205–T-210 (TitleScreen is built since T-176 / T-177;
new file homes; drift counts).
Files: the design system artifact `project/status.md` only (spec chat publishes it).
Result:

**Calls — decisions in a played match (owner, 2026-10-05; spec §2.13): T-232 → T-235, one at a time, in order.**

### [x] T-232: The rally is pausable — one engine, two pickers
Spec: §2.13          Goldens: unchanged (the AI picker draws exactly as today)          Save: no change
Goal: `playRallyGen(m)` can stop at a decision point and resume with a pick; `playRally(m)` runs it to the end with the AI.
Files: js/engine/serve.js, rally.js, rally-phases.js, rally-defense.js, rally-block.js (only the functions on the path from
the serve to the serve-type choice and to the hitter's choice), js/engine/match.js (if the driver lives there), tests/engine.test.js, ARCHITECTURE.md
Do not: change any draw, its order or count; copy engine code into a second "decision" version; touch render or UI.
Steps:
1. Convert the call path playRally → serve steps → serveReceive → rally() → … → chooseAttack / the hitter's shot choice into
   generator functions (`function*`, calls → `yield*`). Functions off that path stay plain.
2. A decision point: `const pick = yield { kind, p, options, ai }` where `ai` is what the code picks today (computed with the same
   draws, before the yield). Resume value null/undefined → `ai`. This task adds the yield sites with `options: []` placeholders
   at the serve type and the attack choice; T-233 fills them.
3. `playRally(m)` = drive `playRallyGen(m)` to the end answering every yield with `ai` (same return value as today).
4. The late insert (`B.ins` in rally-defense.js, the block-break cut) may land before a decision beat: when a decision was
   asked this rally, put it after the decision beat instead (presentation only).
5. Tests: goldens unchanged; a match driven through the generator with explicit `ai` answers equals `playRally` beat for beat;
   a yield happens at your serve and your attack when `m.human` is set (engine-only flag), never without it.
Accept: goldens unchanged; npm test + lint pass; headless match speed within 10 % of before (report ms per match).
QA: Monster game plays as before.
Result: `playRallyGen` + `decide` (engine/decide.js, new); 5 functions became generators (serveWalk, serveAce, servePopped, serveReceive, rally); yields at your serve (before the walk) and attack (after spikePower). Goldens unchanged; a human answered with the AI picks = the sim flow beat for beat (test); headless 4.7 vs 5.2 ms / match (noise). Harness now exposes `function*` names. No B.ins fix needed beyond the clamp: the only insert lands at `mark` = the attack decision point.

### [x] T-233: Decision options with odds and the stats behind them
Spec: §2.13          Goldens: unchanged (options are computed without draws; the AI pick is unchanged)          Save: no change
Goal: the serve and attack decision points offer real options whose odds come from the engine's formulas and change the outcome.
Files: js/engine/*.js (the two decision sites + a pure `Decide` helper, new file js/engine/decide.js — add to index.html),
js/data/rules.js (DECIDE: option ids, labels, stat keys), tests/engine.test.js
Do not: draw R() while computing options; change what the AI picks.
Steps:
1. `Decide.serve(c)` / `Decide.attack(c, x)` → options `{ id, label, odds: { win, lose, err }, stats, weak }` from the same
   formulas the roll uses (sig(…) terms with the current server / hitter, blockers, defenders); `weak` = the stat in `stats`
   with the lowest value relative to the opponent it is rolled against.
2. Each option maps onto the engine's existing branches (serve type / aim; spike power, placement, tip, tool) — a pick sets
   the branch the AI would otherwise choose by draw.
3. Tests: headless, 400 rallies per option: the measured rates are within ±5 points of the shown odds; picking "safe float"
   lowers faults vs "jump serve"; options never draw (RNG call count unchanged by computing them).
Accept: odds honest (±5); goldens unchanged.
QA: none (engine).
Result: `DECIDE` (rules.js) + `Decide` (decide.js): serve Safe / Power / Target {name}, attack Power / Placed (with a block up) / Tip; odds sampled 300× on a private generator keyed by the moment (Math.random and the game stream untouched — the T-232 equality test now computes options too), measured `cal` corrections; slow test: shown vs played within ±6 on all six options (seed 17, n 200), safe faults < power faults. Deviations: no 'tool the block' option (it's an outcome); suggested = best odds (win − lose − err), not the AI's pick (the AI's pick is today's behaviour, not an option); `m.calls` + `Decide.out` built here (T-235 reads them). Goldens unchanged.

### [x] T-234: Calls on screen — slow down, vignette, options beside your player
Spec: §2.13          Goldens: unchanged          Save: no change (the Calls setting is per browser: KEYS.calls)
Goal: in a played career match your decision points slow the world and show the options by your player for 5 s; then the suggested move.
Files: js/render/playback.js (drive the generator: on a yield, hold), js/render/movement.js (reuse egoFocus for the slow + chase
shot), js/render/overlay.js (chip anchor = your player's screen position), js/ui/match-screen.js / match-controls.js (chips,
keys 1–4, the Calls setting in ⚙), js/core/storage.js (KEYS.calls), css/style.css, tests/ui-smoke.js (a played match answers one call)
Do not: freeze without a timer; ask in a simmed match, for NPCs or in the Monster game; draw R() in presentation.
Steps:
1. Playback pulls beats from `playRallyGen(A.m)` (with `m.human` = your id in a career fixture, Calls not Off); on a yield it
   plays the beats so far, then: slow to ~5 % over 0.4 s, chase shot, vignette, chips and a 5 s ring (real time; stops while paused).
2. Chips: label, success %, stat icons (statI), the weak stat marked, "suggested" on the AI's pick; 1–4 / click — or the ring
   running out (→ the suggested move) — resumes the generator with the pick; the world eases back to speed.
3. Key moments filter (set point, deuce, rally 6+ touches, first ball of a set; cap 8 a match) — below the cap and outside key
   moments the generator is answered with `ai` at once.
Accept: npm run test:ui passes (incl. one call answered); QA screenshot of a call against the design system.
QA: career run → evaluation, Play → a call appears at your serve / attack; pick; play continues.
Result: js/ui/match-calls.js (new: callWanted / callStep / callShow / callPlace / callPick / callHide), playback `rallyPull` / `rallyFlush`, `m.human` in startMatch, ⚙ Calls (Key moments / All / Off, `sns_calls`), keys 1–4, Skip flushes a waiting rally. Slow = 0.1 (eases in; 0.05 snaps). Key moments = set point either side, a rally of LONG_RALLY+ possessions, the first serve / attack of the match; cap 8. Found and fixed on the way: `CALLS` already existed (dialogue.js) — a duplicate top-level name stops the page; new test in career.test catches any. test:ui gains a played court match answering a call (11 steps, 0 errors). QA: call at your serve (screenshot), pick → resumes; timeout → suggested (auto) — real-time play on the software GPU is too slow to watch, frames stepped by hand.

### [x] T-235: Calls on the result card — what held you back
Spec: §2.13, §10.6          Goldens: unchanged          Save: no change (calls kept on the match only)
Goal: the result card lists your calls and the stat that limited you most.
Files: js/ui/match-result.js, js/ui/career-match.js (resultData: `calls`), css/style.css
Steps: record each answered call on `m.calls` ({ kind, id, odds, made, weak }); the card's Calls row; "Held back by: ⤒ Jump".
Accept: the row shows after a played match with calls; nothing after a sim.
QA: career run → a played match with 2+ calls → result card.
Result: `resultData.calls` (your `m.calls`), `callsRow` on the card's right column: "Calls · N of M made", the last 6 (label, auto on a time-out, chance, ✓ made / ✕ missed / · rally on), "Held back by: <icon> <stat>" = the weak stat seen most in missed calls. Nothing after a sim (no m.human). QA: a played Pro court match with 3 calls → card (screenshot), no errors.

### [x] T-236: Spike air impact — the Kuroko look (owner request)
Spec: §2.3a          Goldens: unchanged (display only)          Save: no change
Files: js/render3d/fx3d.mjs (`airImpact`, rings facing a direction / delayed, the pressure dome), js/render3d/r3d.mjs (fx api), js/render/effects.js (`airImpact` + impact frame + hold), js/render/acts.js (burst on a spike beat → airImpact; spkPow), js/render/playback.js (spike power read ahead), js/render3d/poses3d-attack.mjs (bow × power), css/style.css (.impactf)
Result: a spike beat's burst (the beat carries the hitter's `spkstyle`, not a tip, power ≥ 58) calls airImpact toward the far court; QA Monster game: a 104 and a 138 km/h-power spike (screenshots: rings + wind lines + dome; the negative impact frame), no errors. Follow-ups (owner): impact frame 1 s (IMPACT_FRAME_MS; the slow-time hold tried first was removed); the hitter's bend scales with power (d.spkPow read ahead by playback; poses3d-attack `bend` 0 at 60 → 1 at 140, additive: bow arch spine+chest −14° → −53°, head −29° → −46°; after contact hips+spine+chest 45° → 95° — the first multiplier version was too subtle to see). QA: qa_poses renders at 60 / 140 show the difference; no errors.

### [x] T-231: Docs diet and a UI smoke test (owner request)
Spec: —          Goldens: unchanged          Save: no change
Files: tasks.md, tasks-done.md (new), ARCHITECTURE.md, ARCHITECTURE-details.md (new), CLAUDE.md, spec.md (§10.1d: the walk lock, training cut-in and map key recorded from Unplanned changes), tests/ui-smoke.js (new), package.json (test:ui), eslint.config.mjs
Result: tasks.md 102 → 12 KB (68 done tasks' full text + old one-liners + recorded unplanned changes → tasks-done.md); ARCHITECTURE.md 114 → 33 KB (28 feature sections → ARCHITECTURE-details.md, indexed); spec.md unchanged (source of truth). `npm run test:ui`: 10 steps (title, hub, 4 sheets, 39 place cards, simmed court result card, encyclopedia, Monster game result), 0 errors, ~70 s.

## Later — outlines

Features (spec first):

- Faction events that change the map (spec §4.24, draft — owner to confirm).
- Endless mode (spec §4.26: no guarantees; national call-up by grades).
- Living map layers B / C (spec §4.16: individual figures, approaches on the map).
- Balance pass (spec §4.10 condition values, §5.5 severe injury, hype frequency §2.3).

Refactor seams to cut only when the feature is specced (not now — YAGNI):

- Year 2 / Endless (§4.26, §4.28): `run.year` + a `Season` helper for week-of-season checks (story gates, Stars curves,
  CALENDAR / CUPS) — needs a save bump.
- Ace traits (§8): one roll-modifier hook at the stuff / receive / clutch / hang rolls, on top of T-204's named steps.
- Big render closures (`createFx` 540, `Overlay` 481, map3d `create` 354, `createTown` 343): split by effect / layer when next touched.

Cleanup, part 2: T-082…T-087 done (see Done). Open:

- T-088 [?]: Big binaries — keep base64 for the artifact but store .glb/.mp3 in Git LFS and generate the .txt at publish.
  Question: today `assets/vrm/*.glb.txt` (18 MB of base64 text) and the .mp3 sit in plain git. Moving them to LFS means either
  `git lfs migrate import` (rewrites history, needs a force push) or LFS only for new commits (old blobs stay). Which? Also confirm
  LFS is enabled for glairlyyy/spiker and that the artifact publish step may decode/encode (`base64 -d` / `base64`) at publish time.

## Done

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
- 2026-10-05 Out of days ask: when the last day's action ends (lock over) with no days left, a card asks "No days left — End it?" with Yes, end the week / I'll stay (Esc = stay); never forced, asked once a week (`CW.nightAsk`). Files: js/ui/career-map.js (nightCard, nightAnswer, lockEnd re-render), js/ui/career-hub.js (hubCard, Esc).
- 2026-10-05 Intro: the big "25 – 4" title card is gone (the cold open starts on the diary line); the score is 15–4 everywhere (intro, rival meeting, choice, lore §, spec, stars comment). Files: js/data/story.js, js/data/stars.js, lore.md, spec.md, tests/career.test.js.
- 2026-10-05 Intro: "Home. For now." → "I followed the Academy's directions. So this is my new place, huh?" (you, on reaching the flat). File: js/data/story.js.
- 2026-10-05 The rival is **Haewon Bae** (was Tachibana Sae; given-first, `given: 'Haewon'`); her full or given name shows orange (`--rival`) in dialogue lines, her name plate and the log (`sbMark`, colour only so typing never re-wraps); old saves rename her on load. Files: js/data/stars.js, js/data/story.js, js/career/stars.js, js/career/run.js, js/ui/story-box.js, css/story.css, css/theme.css, spec.md, lore.md, tests/career.test.js.
- 2026-10-05 Intro names the rival: "Haewon Bae. The one who did it. She signed with an island club the same week." / "She's already here. So am I." (orange via sbMark). File: js/data/story.js.
- 2026-10-05 Fix: the rival-highlight change had broken story.css (every line was centred, 22px, italic grey); restored, and the cold open's narration is now left-aligned too. File: css/story.css.
- 2026-10-05 Thai names: every generated player is `<nickname> <family name>` from Thai pools (names.js; pool sizes kept, same draws); the cohort renamed (Praew Siriwong, Pond Thammasak, Fai Wongsakul) and the flatmate is Fern Kittisak (was Sanada Kaede); hype / Stars read the nickname as the first word; saves keep the cohort under their new names. Goldens updated (name hashes move ego / traits); bond calibration rebased (w60 5.2, w80 9.6); two fragile tests fixed. Rival still Haewon Bae — a Thai name is up to the owner. Files: js/data/names.js, js/engine/players.js, js/engine/hype.js, js/career/stars.js, js/career/run.js, js/data/stars.js, js/data/story.js, js/ui/story-box.js, js/ui/career-map.js, js/career/city.js, js/career/mapmodel.js, tests/career.test.js, tests/people.test.js, tests/golden.json, spec.md, lore.md, ARCHITECTURE.md.
- 2026-10-06 The rival stays **Haewon Bae** and is the one non-Thai name on the island (lore: the only mainland import); Fern says so when she names the season's players. Files: js/data/story.js, lore.md.
