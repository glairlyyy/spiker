# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. **Later** items are outlines: the spec chat details them
(files, steps, accept) and moves them to Now. Next free id: **T-264** (T-088 is open below).

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

**Match revamp (owner, 2026-10-07; spec §2.14–§2.18): three build agents at once, by file ownership — never edit a file another
agent owns.** Agent A = UI; Agents B and C split the rest. Seams already in place (spec chat, T-253): index.html entries; stubs
`js/data/momentum.js` (`STAGES`, `STAGE_IDS`, `stageOfSnap`), `js/engine/fire.js` (`capReady`, `capCall`), `js/render/director.js`
(`Dir`: reset / beat / step / stage / busy / tier), `js/data/match-lines.js` (`MLINES`), `js/ui/match-exchange.js` (`exchangeShow`,
`exchangeHide`), `js/ui/match-prompts.js` (`PROMPT_KINDS`), `stageShow(a)` in match-controls.js; act `stage` → `stageShow` + `Dir.stage`
(acts.js); playback calls `Dir.beat` / `Dir.step` and waits on `Dir.busy()`; `startMatch` calls `Dir.reset()`; `board()` sets
`A.stageShown`; tests `read.test.js`, `momentum.test.js`, `lines.test.js` (in run.js); `npm run balance` (tests/balance.js).
Keep every seam's name and signature; fill the bodies. Nobody edits index.html, tests/run.js, package.json, ARCHITECTURE*.md
(put the structural note in your Result line; the spec chat merges it), spec.md, lore.md or another agent's task text.
tasks.md: change only your own task's status and Result lines, each with a targeted replace. If the artifact refuses your
publish because another agent published first, re-read the refused files from the artifact, re-apply your edit, publish again.
A task that needs a file outside your list: stop and ask (`[?]`).

- **Agent A — UI** — T-254 → T-255 → T-256 (T-256 after B's T-258 is published; build it against a hand-made yield first).
  Owns: js/ui/match-screen.js, match-controls.js, match-calls.js, match-prompts.js, match-exchange.js, match-result.js,
  match-combo.js, menu.js, career-match.js, js/render/playback.js, js/core/storage.js, css/style.css, tests/ui-smoke.js.
- **Agent B — engine** — T-257 → T-258 → T-259 → T-260. Owns: js/engine/*.js, js/data/rules.js, js/data/momentum.js,
  js/data/dialogue.js, js/career/rel.js, tests/engine.test.js, read.test.js, momentum.test.js, balance.js, golden.json
  (B is the only agent that may change goldens).
- **Agent C — director and lines** — T-261 → T-262 → T-263. Owns: js/render/director.js, acts.js, effects.js, clock.js,
  ball.js, scenes.js, overlay.js, js/render3d/** (incl. venues), js/audio/sfx.js, js/data/vfx.js, js/ui/vfx-panel.js,
  js/data/match-lines.js, tests/lines.test.js. C has no UI-smoke file: QA by a Monster-game Playwright script, numbers in Result.

Contracts (spec): stage act `{ k: 'stage', side, from, to, why }`; snapshot `fire`, `stage` (B, T-259; until then `stageOfSnap`
reads mom / zone); decision yield `{ kind: 'call' | 'block' | 'setter', p, options: [{ id, key, label, ... }], ai }` answered with
an option id or null (B, T-257 / T-258; A, T-256); `capReady(m, side)` / `capCall(m, side, 'fire' | 'settle')` → beats (B, T-260;
A wires the chips); `Dir.tier(side)` → the §2.15 row (C); `exchangeShow([{ p, t, side }], done)` (A, T-255; C calls it).

### [x] T-253: Seams for the match revamp (spec chat)
Result: the stubs, hooks, tests and script listed above; goldens unchanged; 130 tests, UI smoke 12/12.

### [x] T-254: Stage chips and the fire meter replace "In the zone" (Agent A)
Spec: §2.14 (HUD), §9.9          Goldens: unchanged          Save: no change
Goal: the momentum line shows each team's stage as a chip at its end and its fire filling from its end; Fever / Loose are announced.
Files: js/ui/match-screen.js, match-controls.js (board, stageShow), css/style.css, tests/ui-smoke.js
Do not: put buff numbers on the chip (tooltip only); draw it in three.js; read `m` — only the snapshot (`stageOfSnap`).
Steps:
1. match-screen: the `.mom` row → `[chip A] [fire meter] [chip B]`; drop `#zone` ("In the zone").
2. board(s): fill each team's half from its own end (`s.fire` when present, else `s.mom`), ticks at `STAGES[*].from`; chip =
   `STAGES[id].name` in the team's side colour border; tooltip (§9 `tip`) = buff lines ("+5 % attack"), the temperament line
   when `s.temper` exists, and `STAGES[id].tip`.
3. stageShow(a): `to === 'fever'` → "FEVER" banner over the court (team colour, 1.2 s, no motion with reduced motion);
   `to === 'loose'` → "Rattled" tag on that team's chip for 3 s; the chip updates.
4. ui-smoke: the Monster step checks both chips exist and their text is a stage name.
Accept: npm test, lint, test:ui pass; QA screenshot of the top panel with a Focused and a Loose chip (force with a hand-made
`stageShow` / snapshot in the page) against the design system.
QA: Monster game → top panel.
Result: `fireRow` (match-screen.js) = `[chip] [fire halves with ticks at STAGES.from] [chip]`, `#zone` and the Momentum label gone; board fills each half from its own end (`s.fire` else `s.mom`, −1..1 → 0–100 %) and sets the chips via `stageChip` (name on the chip; buffs, temperament — `TEMPERS[id]` once T-259 adds it, else the id — and `STAGES.tip` in the tooltip); `stageShow`: Fever → `#fevb` banner in the team colour 1.2 s (opacity-only under reduced motion), Loose → `Rattled` on the chip 3 s; `A.temperShown`. Chip styles: Loose dashed / mute, Focused tinted, Fever filled + glow (team colour only). ui-smoke checks both chips, Rattled and FEVER. QA: Focused vs Loose and Fever vs Composed screenshots at 1440×900, no errors; tests + lint + test:ui 12/12 green.

### [x] T-255: The between-point exchange box (Agent A)
Spec: §2.18          Goldens: unchanged          Save: no change
Goal: `exchangeShow(lines, done)` shows 1–2 lines with the speaker's face cut-in over the court and calls `done` when they end or are skipped.
Files: js/ui/match-exchange.js, js/ui/match-controls.js (Space / click skips while it shows), css/style.css, tests/ui-smoke.js
Do not: choose lines or timing (the director's job); pause the world (the director holds the next rally via `Dir.busy()`).
Steps:
1. A glass panel low-centre above the control bar: per line the face (the existing cut-in face / portrait helper used by
   `cut`), name in team colour, the text typed in (§9.12 motion tokens); left side for team 0, right for team 1.
2. Each line holds 1.6 s + 40 ms per character (real time, stops while paused); click / Space skips the current line; Skip ⏭
   and leaving call exchangeHide().
3. ui-smoke: call exchangeShow with two lines in the Monster step, assert it shows and `done` fires after a skip.
Accept: tests pass; QA screenshot against the design system.
QA: Monster game → `exchangeShow([...])` from the console.
Result: `exchangeShow(lines, done)` builds `#xbox` in the stage (glass, 720px, 96px above the bottom): per line the face (`faceSVG`, 48px, team-colour frame), name in team colour, text typed at 60 cps (reduced motion: at once); team 0 left, team 1 right (row-reverse); max 2 lines, each holds 1.6 s + 40 ms/char of real time, paused time not counted; `exchangeSkip()` (click on the box, Space — before pause) skips a line; `exchangeHide(silent?)` runs `done` once; Skip ⏭ and leaveMatch hide it; the ticker hides while it shows. Structural note: match-exchange.js adds `XCH` (timings) and `exchangeSkip`. ui-smoke: two lines, Space ×2 → done, not paused. QA screenshot 1440×900, no errors; tests + lint + test:ui 12/12 green.

### [x] T-256: Prompts on screen — Call / Fake / Block, setter markers, captain chips; the old calls UI goes (Agent A)
Spec: §2.16, §2.17          Goldens: unchanged          Save: no change (⚙ Prompts per browser: `KEYS.prompts`)
Goal: in a played career match (and Monster **Play as**) your prompts appear under your player's feet while they can be used, one key press answers the engine.
Files: js/ui/match-prompts.js, match-calls.js (delete its body; keep the file empty with a header until the spec chat removes
it from index.html), match-screen.js, match-controls.js, match-result.js, career-match.js (resultData `plays`), menu.js (Play as),
js/render/playback.js (rallyPull), js/core/storage.js, css/style.css, tests/ui-smoke.js
Do not: slow the world or pause the rally; show odds; answer kinds outside `PROMPT_KINDS` (answer them with `ai` at once).
Steps:
1. rallyPull: on a yield of a kind in PROMPT_KINDS (for `m.human`, Prompts On), keep playing the beats already queued while the
   prompt shows; when they run out, resume the generator with the press (option id) or null. Other kinds → `ai` at once (the old
   serve / attack yields until B removes them).
2. Prompt button: key cap + label anchored under your player's feet (project like the name tags), `E` / `R` / `1`–`3`; pressed →
   lit and locked; gone when the window ends. Setter: markers over each hitter with block icons and "Mine!" from the option data.
3. Captain: when you are captain and `capReady(m, side) === 0`, between points show `E Fire up` / `R Settle` for 3 s;
   a press → `capCall(A.m, side, kind)` beats appended to the queue.
4. Read eye over your player when `m.read[you] >= 20` (fill = read / 100).
5. ⚙ Prompts On / Off (replaces ⚙ Calls; `KEYS.prompts`); remove the call chips, the vignette and the 5 s ring (match-calls.js),
   and the Calls row; the result card's **Your plays** row from `resultData.plays` (spec §2.16).
6. Monster tab: **Play as** (none / a player of either team) → `m.human`.
7. ui-smoke: a Monster game with Play as a WS shows a Call prompt and answers it; Prompts Off shows none.
Accept: tests pass; QA screenshots: a Call prompt, the setter markers, the captain chips — against the design system.
QA: career run → evaluation, Play; Monster Play as.
Result: wired to B's T-257 (call / fake / block live; T-258's setter yield and m.plays.sets / dump read when they arrive; serve / attack yields answered with `ai` at once). Prompts On sets `m.read = {}` (T-257 contract); a Block pressed in the window's last quarter (`promptLeft()` < 25 % of the window at open) answers the hidden `'late'`, the chip still lights Block. rallyPull: a yield of `PROMPT_KINDS` for `m.human` with Prompts On → `promptOpen(q)` (A.ask = { q, pressed }); the queued beats keep playing; when they run out step() resumes with `promptClose()` = the press or null — no pause, no slow-down. match-prompts.js: `G.prompts` (`KEYS.prompts`, ⚙ Prompts On / Off replaces ⚙ Calls), `PROMPT`, `promptWanted / promptOpen / promptClose / promptDraw / promptStep / promptPress / promptCaptain / promptKey`; chips (key cap + word) under your feet, kept on screen, pressed → lit, the rest dimmed and locked; setter: a marker over each hitter (`o.p ?? o.id`) with the key, label, block bars and Mine!, Dump under your feet; captain: when you captain and `capReady === 0`, `E Fire up` / `R Settle` for 3 s at each point start (Fire up dimmed in Fever), a press appends `capCall` beats; read eye over you at read ≥ 20 (fill = read / 100). match-calls.js emptied (header only; spec chat: drop it from index.html); its CSS gone. Result card: Calls row → **Your plays** (`playsOf(m, id)` from the engine's `m.plays` tallies: calls / kills, fakes worked, blocks / stuffs, sets per hitter, dumps; `resultData.plays`). Monster tab: **Play as** (none / a seat of either team → `fx.human` → `m.human`, `A.mySide`). ui-smoke: a played court match runs frames to a real prompt, E lights it, the window ends, `m.plays` counts it and the result card shows Your plays; Monster Play as WS: Prompts Off → none, On → Call / Fake chips, E lights Call, the next step resumes the generator with 'call'. QA screenshots (Call + read eye, setter markers + Dump, captain chips) at 1440×900, no errors; tests 130/130, lint, test:ui 12/12 green. Note for B (T-258): setter options need `key` ('1'–'3', Dump 'R'), `p` (hitter id; else `id` is used), `blocks`, `mine`. index.html: a stray duplicate `</body></html>` tail (from an earlier publish) removed.

### [x] T-257: The read meter and Call / Fake / Block (Agent B)
Spec: §2.16          Goldens: unchanged (everything gated on `m.human`)          Save: no change
Goal: the engine asks your WS / MB for Call (and Fake at read ≥ 70) before the setter's choice, and Block before the
opponent's set when you are front row; each answer changes the play as specced.
Files: js/engine/rally.js, rally-phases.js, rally-block.js, rally-defense.js, decide.js, match.js (init `m.read`), js/data/rules.js
(`READ`: gains, thresholds, coverage, fake chances — steps of 5), js/data/dialogue.js ("Not now!" / "He's reading you!" call lines),
tests/read.test.js, tests/engine.test.js
Do not: change a draw when `m.human` is unset; add new act kinds (use `call`, `plabel`, `log`); compute any odds for display.
Steps:
1. `m.read = {}` (player id → 0–100), gains / decay per §2.16 (decay in the point end), only for `m.human`.
2. Yield `call` at the setter's decision when your player can be set (options: call, and fake when read ≥ 70; ai null). Call →
   the setter's target is you unless pass quality ≤ 1 or you are busy / out of position (then a "Not now!" call act); no quick
   or dump; stamina × 1.5 on the swing. Fake → §2.16 rules; a failed fake is the worst set quality to you.
3. Read ≥ 40 / 70: the opponent's best blocker (Defense 0.55 + Jump 0.45) takes your lane, coverage +10 / +20 %.
4. Yield `block` when the opponent's pass is up and you are front row: commit = +10 % block in your lane, your lane open if it
   goes elsewhere; a press after their setter's touch (the late window — answer `late`) = −10 %.
5. Tests: no yields and identical beats without `m.human`; with it, called rallies set you ≥ 90 % on good passes; a failed
   fake is always a poor set; read ≥ 70 raises the stuff rate on you (headless, 2000 rallies).
Accept: goldens unchanged; npm test, lint pass.
QA: none (engine).
Result: Prompts are opt-in: `m.read` = null by default (sims, goldens, Prompts Off); the match screen sets `m.read = {}` for Prompts On (A, T-256) — contract change from the task: `m.human` alone no longer prompts. Yields from `ask()` (decide.js; no odds, no draws) in rally() after pickSetter, before the setter's dump: `call` (WS / MB; options call `E`, fake `R` at read ≥ 70; `q.read`) and `block` (front row, defending; option block `E`, hidden answer `'late'` — A sends it for a press in the window's last quarter). Read meter `m.read[you]` + tallies `m.plays` (call, refused, callSet, callK, fake, fakeOk, fakeBad, anywaySet, block, late, crossed, stuff, att, attK, stuffed; `sets` / `dump` for T-258) for the result card. Deviation: "best blocker takes your lane" = they key on you — the best blocker (or a second, when the best is already b0) always joins the block, reach × 1.5 (`READ.reach`), coverage +10 / +20 %; swapping b0 measured worse for the block (late). A committed in-lane block also leaves early (reach × 1.5). New: READ (rules.js), CALLS notnow / readyou, prompts / callPress / fakePress / fakeYou / readSet / readAttack (rally.js), readCov / commitLane / bestBlocker (rally-block.js), ask / readOf / readAdd / readOn / plays / readPoint (decide.js). Measured (headless, 120 matches): your WS at read 0 / 50 / 80 → kills 62.7 / 60.8 / 56.9 %, stuffed 9.8 / 11.9 / 13.0 %; always calling → 29 % turned down ("Not now!"), set you on 98 % of the rest; MB always committing → your stuffs 0.72 → 1.07 a match. Goldens unchanged; 133/133.

### [ ] T-258: The setter's pick and Dump; AI "Mine!"; the serve / attack choices go (Agent B)
Spec: §2.16, §2.13          Goldens: unchanged          Save: no change
Goal: as setter you pick the hitter (or dump); AI hitters call when hot; the old serve / attack decision points are removed.
Files: js/engine/rally.js, rally-phases.js, serve.js, decide.js, js/data/rules.js (`DECIDE` trimmed), js/data/dialogue.js,
js/career/rel.js (the snub), tests/read.test.js, tests/engine.test.js
Do not: change the AI setter's choice or its draws; keep `Decide.serve` / `Decide.attack` (remove them and their test).
Steps:
1. Yield `setter` at the setter's choice when your player is the setter: options = each hitter `{ id, key: '1'…'3', blocks: 0–2,
   mine }` + `dump` when the pass is tight (quality 3); `ai` = today's choice.
2. AI hitters' "Mine!" (`mine` on the option and a `call` act) when confidence ≥ 70 — no draws.
3. Ignoring a calling hitter: mood −0.1, and record `m.snub` (once a set per teammate) for the career relationship dip (rel.js).
4. Remove the serve and attack yields, `Decide.serve` / `Decide.attack`, their `DECIDE` entries and the T-233 odds test.
5. Tests: the setter yield's options match the hitters on court; dump repeated raises your read.
Accept: goldens unchanged; tests pass.
QA: none (engine).
Result:

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
Goal: captains call Fire up / Settle on a leadership cooldown (AI and you); `npm run balance` prints the stage numbers and the stage buffs hit their targets.
Files: js/engine/fire.js (capReady, capCall), match.js (captainThink: the buff → AI calls; drop the zone captain's call),
js/data/momentum.js (tuning), tests/balance.js, tests/momentum.test.js, tests/golden.json
Do not: touch the captain's tactic / defence switches; tune off steps of 5.
Steps:
1. capReady / capCall per §2.17 (cooldown 5 / 4 / 3 points by leadLv); beats: the captain's `call` line, `plabel`, `log`, `stage`.
2. AI captains: Settle when Loose; Fire up when 2+ down or at set point; skip when `m.human` is the captain (the UI calls).
3. tests/balance.js: 1000 headless matches of league teams → table: point win rate per stage vs Composed, stage time share,
   Fevers per match, per temperament, with / without captain calls. Tune momentum.js to the §2.14 targets (±2 points).
Accept: goldens updated; the balance table in Result; tests pass.
QA: none (engine).
Result:

### [x] T-261: The director — effects by stage (Agent C)
Spec: §2.15, §10.7b          Goldens: unchanged (display only)          Save: no change
Goal: a play's effects follow its team's stage per the §2.15 table; OP players and element spikes count one stage higher.
Files: js/render/director.js, effects.js, acts.js, clock.js, ball.js, overlay.js, js/render3d/fx3d.mjs, r3d.mjs, actors3d.mjs,
js/data/vfx.js (a `dir` group: on, force), js/ui/vfx-panel.js
Do not: change engine code or draw randoms; drop the VFX panel values (they are the Focused row; the director multiplies).
Steps:
1. `Dir.tier(side)`: the §2.15 row from `A.stageShown[side]` (VFX.dir.force overrides for dev), +1 stage for an OP hitter or an
   element spike (Dir.beat sees the attack beat).
2. Apply: size multiplier to every fx3d call; air impact power floor and ring count; shake ×; ball trail style override;
   impact frame gate (power floor + once per N points); kill bounce / blast gates; aura look (actors3d).
3. VFX panel → Director: On / Off, Force stage (Off · Loose · Composed · Focused · Fever).
Accept: tests, lint pass; QA (Monster, Force stage each value): screenshots of one spike per stage; Loose shows no air
impact, Fever shows 4 rings + dome; fx count readout per stage in Result.
QA: Monster game → V → Director → Force stage.
Result: `DIR_ROWS` (the §2.15 table) + `Dir` in director.js: `Dir.beat` marks the play (the spiker's side, +1 stage for OP / element, looks ahead for the kill); `Dir.k()` scales every fx3d particle / streak / ring / dome; `airMin / airRings / airDome`, `shakeK`, `ballStyle`, `bounceOn`, `blastOn`, `frameOk` (kill, floor, once per N points per side) replace the raw VFX reads in acts / effects / overlay / r3d; `Dir.aura(side)` drives actors3d (Loose grey haze, Focused faint, Fever = the old zone look: rings, eye streaks, motes). VFX group `dir` (On, Force stage) first in the panel; Off = the raw panel values as before. QA (Monster, Force stage, 12 points; every Monster player is OP so each row shows one stage up): forced Loose → Composed row: 9 air impacts, 2 rings, no frame / bounce / blast; Composed → Focused: 24 air, 3 rings, 4 frames, 6 bounces; Focused / Fever → Fever: ~20 air, 4 rings + dome, 5 frames, 4 bounces, 3–4 blasts. Average game (no OP, 15 points): Loose / Composed / Focused 0 air impacts (powers < 70), Fever 2 (4 rings + dome). Per air impact ~7 meshes / ~130 particles at Composed vs ~10 / ~150 at Fever (sizes × 0.7 / × 1.3). Structural note for ARCHITECTURE: director.js sits between playback and every effect (renderers ask `Dir` for floors / sizes; VFX values stay the Focused row). `R3D.fxStats()` added (QA).

### [x] T-262: The arena follows the hotter team; auras by stage (Agent C)
Spec: §2.15 (arena row), §9.11 Moments, §2.11          Goldens: unchanged          Save: no change
Goal: lights, crowd and music follow the hotter team's stage; the old zone look becomes Fever's.
Files: js/render/director.js, js/render3d/venue3d.mjs, venues/*.mjs, actors3d.mjs (zone rings / eye streaks → Fever), js/audio/sfx.js (music gain)
Do not: change venue geometry or the crowd count by stakes; add new audio files.
Steps:
1. Hotter team = the higher stage (ties: higher fire); venue light / rim / crowd cheer per §2.15; music gain × 0.8 Loose
   … × 1.15 Fever (eased over 1 s).
2. Eye streaks and zone rings: Fever only; Focused: the faint aura.
Accept: QA screenshots in each venue at Composed and Fever (Force stage); tests pass.
QA: Monster game; career court match (hall).
Result: `DIR_ARENA` + `Dir.arena()` (hotter team = higher stage, ties: higher fire — `m.fire`, else `m.mom` until T-259): house light × 0.85 Loose / × 0.65 Fever, Focused warms the sun (35 % toward #ffc58a), Fever brings up the hot team's rim light; crowd bounce × 0.4 / 1 / 1.3 / 1.5 and a standing baseline for the hot team's (and neutral) fans at Focused 0.15 / Fever 0.45; music via new `musicMood(k)` in sfx.js (× 0.8 / 1 / 1.05 / 1.15, eased ~1 s; `Dir.hush` → × 0.5 for T-263). Eye streaks: Fever only (the captain's-buff eyes only with the director off); zone rings / motes Fever, faint aura Focused, grey haze Loose (T-261's `Dir.aura`). Director off = the old zone look. QA (Force stage, Monster teams, broadcast camera): arena, hall, street, beach, highland at Composed and Fever — Fever dims the house light, rings under every player, crowd up, music 1.15; no errors. Structural note: venue3d reads `Dir.arena()` each frame; sfx exports `musicMood`.

### [x] T-263: Cinematic lines between points (Agent C)
Spec: §2.18          Goldens: unchanged (presentation; lines by hash)          Save: no change
Goal: the director speaks 1–2 line exchanges between points on story events, within the budget, and a hush with a line each side at set / match point.
Files: js/render/director.js, js/data/match-lines.js, js/render/scenes.js (the staged moment), tests/lines.test.js
Do not: draw R() or Math.random; speak on a timer; write lines outside lore.md's voice; edit the exchange box (Agent A, T-255).
Steps:
1. MLINES kinds: fever, loose, settle, fireup, fake_ok, fake_fail, refused, stuffed_call, duel, long_rally, comeback, setpoint
   (+ the reply kinds `_reply`) × personality (5–6 variants; 'any' allowed), placeholders {me} {them} {team} {score}.
2. Dir: collect events from beats (stage acts, call acts, plabels, point acts), pick at most one exchange per point by priority
   (stage change > captain's call > fake > duel > rally > comeback), speakers per §2.18 (relationship tags from `A.m.rel`), budget by
   the hotter team's stage and the Hype setting; `busy()` true while exchangeShow runs.
3. Set / match point: hush (music and crowd down 50 %) + one line each side.
4. tests/lines.test.js: every kind covers every personality; no unknown placeholder; the pick is the same for the same event.
Accept: tests pass; QA: a Monster game at Hype Max played to the end — exchanges counted per stage in Result (target: 0 at
Composed, ~1 per 4 points Focused).
QA: Monster game, Hype Max.
Result: `MLINES` — 12 kinds (+ `_reply` each) × 5 personalities × 5 variants, players' voice; `MLINE_KINDS` (priority order), `mlinePick(kind, p, q, team, score, n, other)` (FNV hash of kind | speaker | point — no R()). `Dir` reads the beats for events (refused call = a `notnow` line; fake ok / failed from the fake beat; your call then a kill block = stuffed_call; the same hitter vs the same blocker every 3rd time = duel; the point act; the score snapshot) and stage acts (Fever, Loose, Settle, Fire up); after the point's beats it adds long_rally (8+ touches), comeback (streak 3 from 3+ down) and setpoint (a new holder), picks one by priority, speakers per §2.18 (the player it happened to; reply: an ally / rival by `m.rel` tags, else the captain), within the budget (hotter team Composed 0 · Focused 1 per 4 points, Max 1 per 2 · Fever every point; Hype Off none; set point always with Hype on) and calls `exchangeShow`; `busy()` holds the next rally until its `done` (12 s safety cap). Set / match point: `Dir.hush` (music × 0.5 via musicMood, crowd × 0.5) until the serve. Staged moments: `Dir.sceneGate` drops a scene unless its team is Focused+ (OP one up) and none in the last 3 points. tests/lines.test.js: coverage, variants, placeholders, same pick for the same event, no draws. QA (fast-forwarded full matches; stages from the snapshot until T-259): Monster, Hype Max — 28 points (15 Composed / 14 Focused): 5 exchanges, 0 at Composed, 4 at Focused (duels) + 1 set point; Monster, Normal — 26 points (18 / 9): 1 at Focused (long rally) + 1 set point; Average, Max — 24 points (20 / 3 / 2 Fever): 1 (set point). No errors. Structural note: match-lines.js holds the words and the picker; director.js the events, speakers and budget.

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

### [x] T-252: Full-court match screen — the 3D court fills the screen, the HUD floats over it (owner request, spec chat)
Spec: §9.9          Goldens: unchanged          Save: no change
Goal: the match is one full-screen 3D court with glass panels over it (score + momentum top, controls bottom, rail right).
Files: js/ui/match-screen.js (markup: `.mtop` wraps board + momentum; `fit` = the viewport), js/ui/match-controls.js
(fullscreen = the `.match` section; ⚙ `Leave match`), js/ui/match-calls.js (chips: the overlay's VT offset),
js/render/playback.js (`VH`, the overlay's logical half-height), js/render/overlay.js (zoom clamps / timeout banner follow VH),
js/render3d/camera3d.mjs (aspect from the canvas; vertical FOV widened to keep the horizontal framing; P3D / viewCamera use VH),
js/render3d/r3d.mjs (syncSize passes the aspect), css/style.css, ARCHITECTURE-details.md
Do not: draw UI in three.js; change beat timing or the engine; change the camera modes' positions / look targets.
Accept: at 1440×900 and 1280×720 the court spans the screen width as before, no page scroll, HUD panels clear of each
other; name tags and calls sit on their players; F fullscreens with the HUD; tests + test:ui green.
QA: Monster game screenshots at 1440×900 and 1280×720 (rally, rail open, result card).
Result: `.match` fixed full-screen; `.mtop` (board + momentum, ≤ 1120px) and `.cbar` float top / bottom on `hud` glass, the rail floats right between them, ticker above the bar; `fit` = the viewport + `VH`; camera3d `setAspect` / `vfov` keep the classic horizontal framing (P3D, focal, viewCamera on the same half-height); overlay zoom clamps + timeout banner shift by VH − 220; call chips fixed for the VT offset (were 80 logical px low); F fullscreens `#match`; ⚙ `Leave match` (the site header with Menu is covered now). QA: 1440×900 and 1280×720 — court full width, no scroll, panels clear (top 16–110, bar 648/828–), tags on players, rail and result card fine; tests 115/115, test:ui 12/12, lint green.

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

### [x] T-251: Rally touch counter — the combo counter (owner request)
Spec: §2.3b          Goldens: unchanged (display only)          Save: no change
Files: js/ui/match-combo.js (new: `comboTouch`, `comboEnd`, COMBO_TIERS), index.html, js/render/playback.js (startBall → comboTouch(A.rallyN); reset → comboEnd(true)), js/render/acts.js (point → comboEnd), js/data/vfx.js (`combo` group), css/style.css (.combo), tests/ui-smoke.js, ARCHITECTURE.md
Result: a big tilted number right of the court counts the rally's touches (from 3), popping and growing each touch (34 px + 2.4 px per touch, to 30); tiers 6 Rally (gold) · 10 Long rally (warn) · 15 Marathon (hot) · 20 Legendary (hot, pulsing glow); on the point it holds 1.3 s then fades over 0.9 s; a new rally clears it. QA: Monster game rally to 7 ("7 touches · Rally"); tier frames 12 and 22; UI smoke checks it; no errors. Fix (owner): the server's toss counted as a touch (the counter showed 3 at the receive) — startBall skips a held ball; now serve 1, receive 2, set 3 (first shown), spike 4.

### [x] T-250: Camera shake — spike kick and floor rumble (owner request)
Spec: §10.7b          Goldens: unchanged (display only)          Save: no change
Files: js/render/effects.js (`camKick`, `camRumble`, impact(pow, kill)), js/render/acts.js (a spike beat's shake → kick; impact passes kill), js/render/overlay.js (`camShake` in applyView), js/data/vfx.js (`shake` group), js/ui/vfx-panel.js (Spike kick / Kill rumble tests)
Result: the owner couldn't pick, so both, with different feel: spike contact = a short sharp kick along the shot (~0.16 s, up to ~19 logical px by power); the ball on the floor = trauma rumble (trauma² × 16 px, fast, decays ~1.6/s; a kill × 1.5, other balls × 0.5). VFX panel → Camera shake: spike, floor, kill ×, from power (70); 0 = off; none with reduced motion or Zooms: Off (camera follows the same view transform, so the 3D and labels shake together). The old soft sway stays for blocks and the glass flash. QA: kick (−15, 9) at contact → 0 by 0.16 s; rumble 14 px → ~1 px over 0.5 s; Monster play: 7 kicks, 5 rumbles in 6000 steps; no errors.

### [x] T-249: Blockers only talk when they touch the ball (owner request)
Spec: §2.3          Goldens: update (`matches` only — animation beats; teams / sims / monster unchanged: no gameplay change)          Save: no change
Files: js/engine/rally-defense.js (block(): dropDefScene unless a stuff / touch / soft block; also on a tool)
Result: the defense's scene beats (the "wall" shot and the mid-jump read with the blocker's line) are emptied when the block is beaten, broken through or tooled; a kill block, touch or soft block keeps them. No random draws (dropDefScene), so outcomes are identical; with Calls on, a scene already shown before the decision can't be taken back.

### [x] T-248: A hard kill bounces off the court (owner request)
Spec: §10.7b          Goldens: unchanged (display only)          Save: no change
Files: js/render/acts.js (impact → far bounce), js/render/ball.js (`far`: no court-side walls, 2.6 s, then the ball is hidden), js/data/vfx.js (`bounce` group)
Result: a kill (not a block) at power ≥ VFX.bounce.min (95) rebounds high (vh 0.6–1.05 → ~2.7–7 m) and keeps going along its line (≤ ~11 m/s, sideways ≤ ~7 m/s, more with power) over the end line into the stands, hops twice, then disappears until the next serve; softer kills keep the old small bounce. VFX panel → Kill bounce: on, from power, height, distance. QA: Monster game kill at 157 km/h: x 798 → 1168+ (end line → beyond), peak h ≈ 400 (6.5 m); camera stays; no errors.

### [x] T-247: Foundation VFX for every player (owner request)
Spec: §10.7b          Goldens: unchanged (display only)          Save: no change
Files: js/render3d/actors3d.mjs (`foundation` per frame: jump / sprint / dive / breath), js/render3d/fx3d.mjs (`dust`, `skid`, `touch`, `breath`), js/render/playback.js (startBall → touchFx on bump / dive / set), js/render/effects.js (`touchFx`), js/render3d/r3d.mjs (fx `touch`), js/data/vfx.js (`found` group), js/render3d/vfxlab3d.mjs + js/ui/vfx-lab.js ("Every player" preview)
Result: every player, any stats: dust at takeoff and landing (landing cloud by jump height), dust off alternate feet when sprinting (> 3.2 m/s), a skid trail while diving, a small pop on every bump / dig (forearm ring + glints) and set (fingertip twinkle), a save spark (floor ring, sparks, dust) when the ball is dug below ~0.65 m, a breath puff every ~1.5 s for a tired player standing still. VFX panel → Every player: a 0–3 scale each (0 = off) and the dust colour. QA: lab preview; Average game (ordinary players) 2500 steps — touch pops fired (3 bumps, 3 sets), no errors.

### [x] T-246: Partial ink rings — the ensō (owner request)
Spec: §10.7b          Goldens: unchanged (display only)          Save: no change
Files: js/render3d/fx3d.mjs (RING_ENSO, ENSO_FS / ENSO_FS_GLOW, `inkRing(glow, partial)`), js/data/vfx.js (ring style `partial`), js/ui/vfx-panel.js (option names per group: Ink full / Ink partial)
Result: VFX panel → Rings → Style: Light / Ink full (T-245, unchanged) / Ink partial = the owner's reference: one red brush stroke from a random start round ~84–96 % of the circle, pressed in then lifting into dry-brush strands, a thin loose outer strand, splatter drops outside (they dry first), a faint glow along the stroke. QA: close-up lab frames 0.06–0.34 s, no shader errors.

### [x] T-245: Ink style for every ring effect (owner request)
Spec: §10.7b          Goldens: unchanged (display only)          Save: no change
Files: js/render3d/fx3d.mjs (`inkRing`, RING_INK, ring shaders), js/render3d/trails3d.mjs (exports NOISE), js/data/vfx.js (`ring` group)
Result: VFX panel → Rings: Style Light / Ink, glow in the ink colour or the effect's own, ink ring life ×1.3; Ink = a ragged black brush ring (strands round it, fraying as it fades) with the glow burning inside, on every ring (air impact, contact burst, floor and element rings, the blast's ring, sky bolt). QA: lab frames (air impact ×2, element floor impact, blast), no shader errors.

### [x] T-244: Ball trail options (owner request)
Spec: §10.7b          Goldens: unchanged (display only)          Save: no change
Files: js/data/vfx.js (`ball` group), js/render3d/r3d.mjs (`ballRibbon`: a makeTrail on the ball), js/render3d/trails3d.mjs (`o.jump`), js/render/overlay.js + ball.js (Streak honours style / min / width / length), js/render3d/vfxlab3d.mjs + js/ui/vfx-lab.js (ball ribbon, "Ball trail: power"), js/ui/vfx-panel.js (option names), css/style.css (hidden VFX panel fix)
Result: VFX panel → Ball trail: Style Streak (the old 2D line) / Ribbon / Ink / Off, from power, width, length, ink colour (no element); element particle trails unchanged (Elements group). Also fixed: the closed VFX panel showed as an empty blurred box (display: flex beat [hidden]). QA: lab frames (ribbon / ink, plain and fire), Monster game with Ink, no errors.

### [x] T-243: Hand trail style in the VFX panel (owner request)
Spec: §10.7b          Goldens: unchanged          Save: no change
Files: js/data/vfx.js (`hand.style`, choice params), js/ui/vfx-panel.js, js/game/state.js (G.trail default = VFX.hand.style, kept in sync), js/ui/match-controls.js (⚙ Trails sets both), js/render3d/vfxlab3d.mjs + js/ui/vfx-lab.js (the sweep reads VFX.hand; the lab's own Trail switch removed)
Result: VFX panel → Hand trails → Style Light / Ink (live; same setting as ⚙ Trails; exported, so a baked style becomes the default for new players). QA: switch in the panel → G.trail, saved, export, ⚙ in sync; Reset all; no errors.

### [x] T-242: The air impact follows the ball (owner request)
Spec: §2.3a          Goldens: unchanged (display only)          Save: no change
Files: js/render/acts.js (burst → A.airPend), js/render/playback.js (startBeat → airFlush), js/render/effects.js (`airFlush`, `airImpact(pow, color, path)`), js/render3d/r3d.mjs (path → direction, speed, span), js/render3d/fx3d.mjs (`o.speed`, `o.lag`, `o.span`), js/data/vfx.js (`air.follow`)
Result: the rings line up along the ball's real flight (contact → landing point, from the drawn ball at the hand), spread over VFX.air.follow (0.5) of it, each appearing as the ball reaches it (ring delay = distance / ball speed + the hand's lag); follow 0 = the old fixed reach. QA: Monster game spike (path logged, frames: rings from the hitter's hand down to the digger), no errors.

### [x] T-241: Live VFX tuning in the Monster game, with export (owner request)
Spec: §10.7b          Goldens: unchanged (display only)          Save: no change (browser key sns_vfx)
Files: js/data/vfx.js (new: VFX_DEF, VFX, vfxReset / vfxExport / vfxImport), js/ui/vfx-panel.js (new), js/render3d/fx3d.mjs (`vx` reads), js/render/effects.js (frame values, `groundBlast`), js/render/acts.js (air min, blast on a kill), js/render/clock.js (frame slow), js/render3d/r3d.mjs (fx `blast`), js/render3d/actors3d.mjs (hand width / life / ink), js/ui/match-screen.js + match-controls.js (VFX V in dev games), js/ui/menu.js (vfx: true), js/ui/vfx-lab.js, js/core/storage.js, index.html, css/style.css, tests/ui-smoke.js
Result: 26 live controls in 6 groups (air impact, impact frame, contact burst, elements, ground blast, hand trails); Monster / Average game: VFX V opens the panel at the right while the game plays, Test at the ball (air impact, blast); the lab shows the same panel. Export: Copy (all values; the JSON box when the clipboard is blocked), Download vfx.json (data: link), Import, Reset all; edits persist per browser. Ground blast on a floor kill now exists in matches but is Off by default. QA: Monster game panel (21 sliders), edit → export JSON → saved → reset; lab ring size 2 / 7 rings live; UI smoke step; no errors.

### [x] T-240: Air impact, reversed ring order — the Doppler look (owner request)
Spec: §2.3a          Goldens: unchanged (display only)          Save: no change
Files: js/render3d/fx3d.mjs (`airImpact(…, rev)`), js/render3d/vfxlab3d.mjs, js/ui/vfx-lab.js
Result: `airImpact` (default now): the biggest ring at the hand, smaller and closer together down the shot (a Doppler cone); same timing, wind lines, jet and dome. Owner then adopted it, at twice the reach (`AIR_LEN` 2: ring spacing and the jet): matches use the Doppler order; the first order stays in the lab as `classic` ("Air impact: classic"). (A first misread — an implosion, `airImplode` — was dropped.) QA: lab frames side by side at 0.18 s, no errors.

### [x] T-239: Ink hand trails — the Lu Bu look (owner request)
Spec: §6 (trails), §9.9 (⚙)          Goldens: unchanged (display only)          Save: no change (new browser key sns_trail)
Files: js/render3d/trails3d.mjs (style 'ink': FS_INK + FS_BLOOD, `seed` attribute), js/render3d/actors3d.mjs (G.trail → o.style, ×1.7 width, ×1.4 life, crimson), js/game/state.js (TRAIL_STYLES, G.trail), js/core/storage.js (KEYS.trail), js/ui/match-controls.js (⚙ Trails), js/render3d/vfxlab3d.mjs + js/ui/vfx-lab.js (weapon-sweep preview, Trail Light / Ink)
Result: ⚙ Trails: Light (default) / Ink. Ink = black ragged brush stroke, crimson core and halo, strands fray as it fades; charged players burn their element colour. QA: VFX lab sweep frames (zoomed), Monster game with Ink, no errors.

### [x] T-238: VFX lab and a ground blast (owner request)
Spec: §10.7 (Dev tab)          Goldens: unchanged (display only)          Save: no change
Files: js/ui/vfx-lab.js (new), js/render3d/vfxlab3d.mjs (new), js/render3d/fx3d.mjs (streaks, puffs, discs, `blast`, `stats`), js/ui/menu.js (Dev → VFX lab), index.html, css/style.css, tests/ui-smoke.js
Result: Dev → VFX lab: 10 effects (keys 1–0), power, element, speed 1 / 0.25 / 0.1 / pause, repeat, stress 2–30/s, orbit camera, readout (fps, frame / fx ms, draw calls, live particles). New `fx.blast` (the owner's Niagara reference: hot core, streak sparks that skip off the floor, embers, billowing smoke lit red inside, debris, floor glow) — lab only, not in matches yet; the lab's "Spike" previews air impact → trail → floor (+ blast at 100+). QA: stepped frames 0.1–1.6 s, ~700 particles at 2 extra draw calls, fx 0.3 ms; UI smoke + a lab step.

### [x] T-237: Match control bar that fits (owner request)
Spec: §9.9          Goldens: unchanged          Save: no change
Files: js/ui/match-screen.js (bar markup), js/ui/match-controls.js (timeout / pause labels, key C, ⚙ Camera C), css/style.css
Result: group labels gone, hairline separators, Camera moved into ⚙ (key C), "Commentary · Box score" → "Details B", ⛶ gets F, timeout state as a small suffix (used / next break), bar wraps instead of overflowing. QA Monster game (two teams' timeouts, the widest bar): one row at 1440 and 1280 (no button past the edge), two clean rows at 1024; no errors.

### [x] T-236: Spike air impact — the Kuroko look (owner request)
Spec: §2.3a          Goldens: unchanged (display only)          Save: no change
Files: js/render3d/fx3d.mjs (`airImpact`, rings facing a direction / delayed, the pressure dome), js/render3d/r3d.mjs (fx api), js/render/effects.js (`airImpact` + impact frame + hold), js/render/acts.js (burst on a spike beat → airImpact), js/render3d/poses3d-attack.mjs (BEND, UP_L), css/style.css (.impactf)
Result: a spike beat's burst (the beat carries the hitter's `spkstyle`, not a tip, power ≥ 58) calls airImpact toward the far court; QA Monster game: a 104 and a 138 km/h-power spike (screenshots: rings + wind lines + dome; the negative impact frame), no errors. Follow-ups (owner): impact frame 1 s in slow motion ×0.15 (IMPACT_FRAME_MS, A.impactUntil → clock IMPACT_SLOW), then normal speed; no slow-down on other spikes; the hitter's bend: one fixed back arch for every spike (BEND 0.15 — the owner picked the power-50 look; the power-scaled deeper bends were removed), held through the whip until contact; the pointing arm 45° lower. QA: qa_poses renders at 60 / 140 show the difference; no errors.

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
- Match revamp, parked (owner, 2026-10-07): the match remembers your choices ("AI memory"); back-row defensive commands;
  temperament changing how a team plays; the read meter for AI hitters; pre- and post-match lines (§2.18).
- Off-hand line shot (owner, 2026-10-07): a right-hander attacking from the right side who hits down the line (to their right)
  gets ~15 % less power and picks that shot less often; an ace trait "Wrist-away" removes the penalty (blockers don't expect it).
  Then the display: torso turns toward the shot, wrist rolls out on the line shot. Left-handers later flip it. Engine → goldens.
- Smaller player models (owner, 2026-10-08): the 6 Monster VRMs are ~9 MB each (63 MB of base64, mostly PNG textures). gltf-transform
  them — textures resized to 1024 and KTX2 (or WebP), meshopt geometry; three's KTX2Loader / MeshoptDecoder decode — target 1.5–2.5 MB
  each; cache the decoded files in IndexedDB so a second visit downloads nothing. Goes with T-088.

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
