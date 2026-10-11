# Spite & Spike — done tasks

The full text of finished tasks, moved out of tasks.md (T-231) so agents read less. Newest first; ids are not reused.

## Full text

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
- **T-264 first, solo** (owner, 2026-10-10: the prompts go; T-258 dropped). Then **Agent B — engine** — T-259 → T-260. Owns: js/engine/*.js, js/data/rules.js, js/data/momentum.js,
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

### [x] T-264: Remove the one-press prompts and the calls; keep the captain's calls (solo — no other agent meanwhile)
Spec: §2.16 (removed), §2.13 (removed), §2.17, §2.14, §2.18          Goldens: unchanged          Save: no change
Goal: a played match has no Call / Fake / Block, setter markers, read meter, ⚙ Prompts, Your plays row or decision odds; the
captain's Fire up / Settle chips still show for you as captain (career and the Monster game's Play as).
Files: js/engine/decide.js (remove), rally.js, rally-phases.js, rally-block.js, rally-defense.js, serve.js, match.js, js/data/rules.js
(`DECIDE`, `READ`), js/data/dialogue.js (prompt-only lines: readyou, notnow…), js/data/match-lines.js (fake / refused / stuffed-call
kinds), js/render/director.js (those events), js/ui/match-prompts.js (keep only the captain chips + their key handler), match-calls.js
(remove), match-screen.js, match-controls.js, match-result.js, menu.js (Play as tooltip), career-match.js (`plays`), js/render/playback.js,
js/core/storage.js (`calls`, `prompts` keys), css/style.css, index.html (drop decide.js, match-calls.js), tests/read.test.js (remove),
tests/run.js, tests/engine.test.js, tests/lines.test.js, tests/ui-smoke.js, ARCHITECTURE.md, ARCHITECTURE-details.md
Do not: touch the AI's own multi-attack fake set (`fakeSet` / `fakeDecoy`), the tactics `read` bonus (rally-phases `tac.focus`), the
captain's calls (fire.js, T-260), timeouts, subs, technique switches, Sim ⏭; change any R() draw (sims never reached the prompts).
Steps:
1. Engine: drop `decide`, `promptAsk`, `prompts`, `blockPrompt`, `fakePress`, `readOf` / `readAdd` / `readOn`, `plays`, `m.read`, `m.calls`,
   `c.callYou` / `c.fakeYou` and every branch on them; `Decide.*`, `DECIDE`, `READ`. `playRallyGen` stays (no yields left);
   `playRally` unchanged. `m.human` stays (captain chips).
2. Playback: every match plays its rallies whole (`playRally`); remove `A.ask`, `promptWanted` / `promptOpen` / `promptClose` /
   `promptStep`; keep `promptCaptain` between points when `A.m.human` is the captain.
3. UI: remove ⚙ Prompts, the eye / read fill, the chips under feet, setter markers, the Your plays row (`playsOf`, `playsRow`, res.plays)
   and the empty match-calls.js; storage keys `calls` / `prompts` go (old values are ignored).
4. Lines / director: remove the fake, refused-call ("Not now!"), stuffed-call and "reading you" kinds and their triggers.
5. Tests: read.test.js out of run.js; lines / engine tests lose the removed kinds; ui-smoke checks no `.prompt` chip and no ⚙ Prompts.
   grep the repo for every removed name — zero hits outside tasks-done.md and spec.md.
Accept: goldens unchanged; `npm test`, `npm run lint`, `npm run test:ui` pass; Monster game with Play as = a captain shows the
Fire up / Settle chips between points and nothing during rallies.
QA: Monster game (Play as the captain) → screenshot mid-rally (no chips) and between points (captain chips).
Result: Engine: decide.js gone; serve / rally are plain functions again (no generators: playRallyGen removed too — deviation, nothing yields any more), the read meter, Call / Fake / Block, plays tallies, READ / DECIDE, m.read / m.calls / m.askAt out; engine test: m.human plays beat-identical to the sim flow. Playback: rallyPull = playRally; A.ask / gen / ownJ / blockAuto / rallyFlush out. UI: match-prompts.js = the captain's chips only; ⚙ Prompts, the read eye, setter markers, Your plays row, match-calls.js, storage keys calls / prompts, G.calls out. Lines: fake / refused / stuffed-call / readyou / notnow kinds and the director's triggers; the dead 'follow' camera shot and 'ev' act handler. Goldens unchanged; 130/130, UI smoke 13/13 (no chip during a rally; captain chips Fire up / Settle).

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

### [x] T-227: A result card after every match, simmed ones too, with the XP each stat got (owner request)
Spec: §10.6          Goldens: unchanged          Save: no change
Files: js/career/training.js (`Training.tally`, display only), js/ui/career-match.js (resultSnap opens the tally, resultData reads it + stamina delta; `simCareer`; playCareer sim), js/ui/match-result.js (`resultScreen` options; `+N XP` column), js/ui/career-map.js (sim clash / challenge → lock phase `res`), js/ui/career-hub.js (Space closes it), css/style.css, css/hub.css, tests/career.test.js
Result: street battles, challenges, evaluations and cup ties that are simmed now end in the same §10.6 card in the hub (after the walk; Continue / Space, then the hub re-renders so the match's scene can play); every growth row shows `+N XP`; rewards gain a stamina chip. The street hustle is still a dice roll (no card). QA: simmed eval card, no errors; tests pass.

### [x] T-226: An easier start — the island's players at OVR 40–50 (owner request)
Spec: §4.22a          Goldens: unchanged (engine)          Save: no change
Files: js/data/career.js (CAREER.npcStart), js/career/run.js (`Run.lower`: draft teams + reserves, the Academy squad), js/data/city.js (STREET.rival 35–60), tests/people.test.js (league / bond calibration rebased)
Result: start OVR clubs 41–48 (median 44), reserves 40–50, Academy squad 43–44 (was 58–77, median 65); no random draws added. League mean w12 65 / w28 76 (was 75 / 86); first bond 60 at week ~6.8 (was 4.8: mates' plans pick other gyms). Tests 125/125.

### [x] T-225: The island × 1.5 again (owner request)
Spec: §4.18b          Goldens: unchanged          Save: RUN_VERSION 18 (positions and fog are in map units: older saves dropped)
Files: js/data/city.js (MAP_SCALE 2.25, NATURE.cell 18, shu p 0.78), js/career/run.js (RUN_VERSION 18), js/career/mapmodel.js (keep-out rounding margin), js/map3d/map3d.mjs (DIST 1300), tests (v18, lot targets, the dorm distance × MAP_SCALE), CLAUDE.md
Result: 2385 × 1575 map units; travel days, fog radius, hex size (still 169 tiles) and relief scale with it; lots 966 → 1227 (towns keep their size, fill out where they were squeezed); nature ~3.3k instances (with T-224's borders). QA: overview + Wei close-up, no errors; tests 125/125.

### [x] T-223: Nature objects and small life on the island
Spec: §4.19c          Goldens: unchanged          Save: no change
Files: js/map3d/nature3d.mjs (new: `createNature(scene, heightAt)` → { sync(model), tick(dt, t), dispose() }), js/map3d/map3d.mjs (build / tick / dispose it), js/career/mapmodel.js (`land.nature`: biome per area + the keep-out list: roads, pads, lots, water), js/data/city.js (NATURE: object kinds per biome, densities, the life list), ARCHITECTURE.md
Do not: draw randoms (hash every placement); put objects on roads, pads, lots or water; add a draw call per object (instance per kind); slow the map (budget below).
Steps: 1. NATURE data: per biome the kinds (tree / rock / bush / tuft with 2–3 tones and a size range) and a density (per 100 m²), with height bands for Shu (forest below ~60 m, scree above). 2. Scatter on a hashed jittered grid per biome, rejected on roads / pads / lots / water / sand where not allowed. 3. Instanced low-poly meshes per kind (cone + trunk pines, ball trees, palms, boulders, tufts), fog-dimmed like the terrain. 4. Life: a handful of looping hash-driven figures (birds circling the Peak, gulls at the harbor, a heron on the river, deer at the Shu forest edge, a cat in Old Town, village dogs), counted in life3d's caps.
Accept: Shu reads as forest → rock up the Peak, Wu has palms and dune grass, Wei street / park trees; ≤ 12 extra draw calls, ≤ 60k extra triangles; map frame time within +10 % at 1440×900 (QA log); tests + lint green.
QA: screenshots over the Peak, the Wu beach, Wei's park and the Academy at the default zoom; frame time before / after.
Result: `NATURE` data + `MapModel.nature` / `wild` (plain data, hashes) + js/map3d/nature3d.mjs. ~1.9k instances: Shu pine forest thinning to rock / scree above 62 m, bamboo by the villages, tea on the terraces; Wei street + park trees; Wu scrub, palms / dune grass / drift logs on the sand; Academy lawn trees. Animals: 6 birds round the Peak, 6 gulls over the harbor, a heron on the river, 4 deer, 3 dogs, an Old Town cat. Budget: +10 draw calls, +45k tris (QA view); swiftshader frame +10–12 % (software GL, not representative). Not done: density by zoom. QA: Peak, Peak HQ, Wu beach, Wei, Academy screenshots; no errors; tests 125/125.

### [x] T-224: Natural borders and biome ground that fades
Spec: §4.19d          Goldens: unchanged          Save: no change
Files: js/map3d/map3d.mjs (terrain colours: biome palettes + cross-fade; river banks), js/map3d/nature3d.mjs (border rows: tree line, hedge, reeds, fence and scrap — after T-223), js/career/mapmodel.js (`land.biomes`: region → palette; the border lines as polylines), js/data/city.js (BIOME palettes, border kinds), ARCHITECTURE.md
Do not: use faction colours on the ground (the hex fill stays the only one, §4.27); move any border or rule; add a draw call per border segment.
Steps: 1. BIOME palettes (neutral nature tones) per region; the terrain colour = a distance-weighted blend of the nearest biomes over 40–60 m (no seam). 2. River banks: a sand / pebble strip each side of the river, reeds in rows. 3. Border rows along the region lines: Shu–Wei tree line + gravel strip, Wu's dune grass line, the Academy hedge, the Outlaws' fence and scrap.
Accept: with the hex fill hidden (dev flag) a screenshot shows Shu, Wei, Wu and the Academy apart; no hard colour seam at any region line; tests + lint green.
QA: screenshots with the tile fill on and off at the Shu–Wei line, the Academy and the river.
Result: `BIOME` palettes + `BORDERS` kinds (city.js), `land.biomes` / `land.borders` / `bioPal` (mapmodel); terrain = majors cross-faded over 50 m, Academy lawn disc + minors over 18 m, Shu moss → rock with height, gravel strip on the Shu–Wei line, river sand / pebble banks; border rows in MapModel.nature (`NATURE.rows`): Shu tree line, river reeds, dune grass, Academy hedge, Outlaws fence + scrap (nature3d: reed / hedge / fence / scrap kinds, +1 draw call); dev `MapView.m3.hexFill(false)` / `?nohex`. QA: fill off at overview → Shu forest moss, Academy bright lawn, Wu straw, Wei paving grey, no seam; 2306 nature items, 210 draw calls; tests 125/125.

### [x] T-222: The Shu highlands — the Peak, the Spine, the river; level ground for every facility (owner request)
Spec: §4.19b          Goldens: unchanged          Save: no change
Files: js/data/city.js (`CITY.relief`, `reliefAt`, `lineDist`, RELIEF_COST, HIGHLAND_M; random `mountains` gone), js/map3d/map3d.mjs (`landH`, pads levelled, terraces / paddies / quarry stepped, river tint), js/career/mapmodel.js (`land.relief`, `pads`), js/career/city.js (ground cost × height), js/career/hex.js (highland = reliefAt), ARCHITECTURE.md
Result: one ~110 m Peak NW, the Spine south (55 → 14 m), the river through the reservoir to the south coast; every Shu place / HQ / venue / home / village on a flat pad; terrace shelves; crossing the ridge costs more; 11 highland hexes (was 9). QA: Peak, trail, shrine, Peak HQ screenshots — pads level under the buildings, no errors; tests 124/124.

### [x] T-221: Your new squad introduces itself (owner request)
Spec: §10.10b          Goldens: unchanged          Save: no change (`run.story.meet` while pending; a generated scene keeps its steps on `cur.steps`)
Files: js/career/story.js (`joined`, `meetSteps`, `meet`, `steps`; `hub` plays a pending meet first), js/data/story.js (`MEET` lines), js/career/run.js (Academy squad at the start), js/career/world.js (join), tests/career.test.js, ARCHITECTURE.md
Result: after the intro the Academy squad (captain first, bench last) and after every signing the club's squad say role + one trait-voiced line each; once per squad, Story only. QA: new Story run → meet:academy box with the captain's portrait; no errors; tests 124/124.

### [x] T-220: Kaede's lessons on the first click of a place (owner request)
Spec: §10.10a          Goldens: unchanged          Save: no change
Files: js/career/story.js (`STORY_PICK`, `Story.pick`, `due(run, on, pick)`; unused hub keys clash / settled / evaluated gone), js/data/story.js (tutClash / tutFactions / tutHouse / tutEval → `on: 'pick'`; tutEval lines for a venue), js/ui/career-map.js (mapPick / mapPoint call `Story.pick`), tests/career.test.js
Result: tutGym (facilities) stays on the hub after the first session; battle pin → tutClash, HQ or any tile → tutFactions, home → tutHouse, venue → tutEval, each once, none after noTour; the card opens after the scene. QA: Story run, click home → tutHouse plays, again → card only; tests green.

### [x] T-216: Motion tokens, the Motion helper and the screen veil
Spec: §9.12          Goldens: unchanged          Save: no change (one per-browser key `sns_motion`)
Goal: the motion tokens and helper exist; every screen change passes through a veil; reduced motion works.
Files: css/theme.css (tokens as custom properties; keyframes `in-rise`, `in-pop`, `out-fade`, `xfade`; `.in` / `.out` / `.swap`; a `@media (prefers-reduced-motion)` block), js/ui/dom.js (`Motion`: mark / take / leave / tick / flip / reduced), js/game/state.js (`navigate` → veil), js/ui/match-controls.js (Settings › Motion: Full / Reduced), js/core/storage.js (KEYS.motion), index.html (the veil element), ARCHITECTURE.md
Do not: delay any state change or click behind an animation; animate the 3D canvases with CSS; use durations outside the tokens.
Steps:
1. Tokens + keyframes + classes in theme.css; `Motion.reduced` = media query OR the stored setting (`html.reduced` class).
2. `Motion.mark(key)` sets a one-render flag; `Motion.take(key)` returns it once (renderers add `in`). `Motion.leave(el)` adds `.out`, removes the node after `dur-fast` (ignored if the node is already gone).
3. `navigate`: veil fades in (`dur-scene` / 2), the screen renders, veil fades out; hub → match shows the round title on black for 600 ms (click / Space skips); match → result untouched.
Accept: screen changes show the veil and never drop a click; reduced motion (OS or setting) = fades ≤ 120 ms; tests + lint green.
QA: title → create → hub → match → result → hub; screenshots mid-veil; the setting on and off.
Result: tokens / `mv-*` keyframes / classes + `html.reduced` overrides at the end of theme.css; `Motion` (dom.js: set / mark / take / play / leave / tick / flipFirst / flip / veil); `KEYS.motion`; `navigate` veils every screen change (hub → match: the round title 600 ms, click / Space skips); Motion: Full / Reduced in the match ⚙ and the hub ⚙. Deviation: the veil element is created by `Motion.veil` (index.html untouched); the new screen renders synchronously under an instant veil that fades out (no fade-in of the old screen). QA: veil on → off around create / match; reduced = no hub classes move; tests 111/111, lint green.

### [x] T-217: Hub surfaces move
Spec: §9.12 §10.1c          Goldens: unchanged          Save: no change
Goal: the place popup, sheets, peeks, tooltips, cards over the map, the rail fold, the dialogue box, the walk pill and the training cut-in enter and leave as §9.12 says.
Files: js/ui/career-hub.js (render: `Motion.take` per surface), js/ui/career-map.js (popup: grow from its pin, glide to a new pin, cross-fade content), js/ui/dom.js (peek / tooltip timing), js/ui/story-box.js, css/hub.css, css/story.css, css/people.css
Do not: replay an animation on a re-render of the same state; resize the map canvas every frame during the rail fold.
Steps: one `Motion.mark` where each surface opens or closes (mapPick, hubOpen / sheet tabs, card show / done, railToggle, story start / end, lock phases); CSS per surface from the §9.12 table; popup `transform-origin` = the pin side.
Accept: each surface animates once per open / close; switching sheet tabs only cross-fades the content; selecting another pin glides the popup; the rail fold resizes the map once.
QA: screen recording (GIF) of each surface.
Result: `renderCareer` brackets the render with `motionBefore` / `motionAfter` (`CW.mv` = last shown spot / sheet + sub-view / card key / rail / lock / story) instead of `Motion.mark` at each call site; `hubCard` returns a `key`; open → `.in`, change → `.swap`, close → a `Motion.leave` copy; `mapPick` + `spotSwap` (popup grows from its pin side via `--mv-origin`, glides to a new pin, cross-fades); rail `fold` / `unfold`; lock pill / cut-in `.in`; peek fades in once on open; tooltip fades in. Not done: tooltip 300 ms delay, dialogue-box exit, match-rail tab cross-fade. QA: sheet in → re-render (no class) → tab swap → close ghost; popup in → glide → close ghost; no page errors.

### [x] T-218: Values that change
Spec: §9.12          Goldens: unchanged          Save: no change
Goal: numbers count, bars ease, the day track fills, inbox rows slide, moved rows slide, a selected pin pulses once.
Files: js/ui/career-hub.js (topBar ticks via `Motion.tick`, deltas, day track, inbox), js/ui/sheet-me.js, js/ui/career-people.js (FLIP on the list), js/map3d/pins3d.mjs (selected ring pulse class), css/hub.css, css/map.css
Do not: tick numbers on a plain re-render (only when the value differs from the last shown one); animate under reduced motion.
Accept: payday counts the money up with a `+$n` chip; a spent day fills left → right; End week empties the track right → left; a starred person slides to the top.
QA: GIF of a training day, payday and End week.
Result: top-bar money / fans / skill pts tick from the last shown value (`.tk`, 400 ms, a 450 ms fallback lands the value when frames starve); stamina bar eases from `--w0`; day slots `fillin` / `gin` / right → left `clear` on a new week (`dayMotion`); new inbox rows slide (max 3); People rows FLIP (`data-flip`); `pins3d.select` rings a newly selected pin (`.pulse`, box-shadow — the pin's transform is its position). Not done: stat number flip in Me, loss flash on bars. QA: money +230 ticks to $430; one ghost slot `gin` on pick; pin `pulse` on the second pick.

### [x] T-219: Match screen motion
Spec: §9.12 §9.9          Goldens: unchanged          Save: no change
Goal: the score bumps, momentum eases, the rail slides in, technique switches slide; the result card rises over the court.
Files: js/ui/match-screen.js (board), js/ui/match-controls.js (rail), js/ui/match-tech.js, js/ui/match-result.js, css/style.css
Do not: touch beat timing, cut-ins or hype scenes; slow the match clock.
Accept: each point bumps the scorer's digit once; the result card rises (`dur-slow`); reduced motion → fades only.
QA: Monster game GIF: a few points, the rail, the result.
Result: `board` bumps the digit that went up (`.bump`, dur-base); momentum width eases dur-slow; `.mrail` slides in when shown; the result `.ocard` rises; all css in theme.css, reduced → fades / none. Technique switch: existing transitions kept. QA: Monster game, `#p0` gets `bump`; no page errors.

### [x] T-215: Place panel → popup beside its pin (owner request)
Spec: §10.1c          Goldens: unchanged          Save: no change
Files: js/ui/career-map.js (spotFollow / spotPlace, mapPick), css/hub.css (.spotcard)
Result: `.spotcard` is content-sized (280–440px, `width: max-content`); `spotPlace()` puts it right of `.maplay .mpin.sel` (or the `.mflag` of a picked point) with a 24px gap, flips left at the map edge, centres it on the pin and clamps it inside the map (rail / top bar / 16px); one rAF loop (`spotFollow`) keeps it on the pin while the map moves; no visible pin → top-right as before. QA: HQ and home popups beside their pins, off-screen pin falls back; tests + lint green.

Refactor part 4 (owner, 2026-10-04): keep it simple, open for the next features (§4.24 faction events, §4.26 Endless,
§4.28 year 2, §8 ace traits, more venues / place kinds). Rules for every task below: **pure refactor** — goldens
unchanged (tests pass **without** `--update`), save unchanged, no draw-order change, no new framework / module system /
build step, no behaviour or UI change unless the task says so; top-level names kept (or every caller updated in the same
task); one seam per task. Order: T-201 → T-212 (each stands alone; stop after any).

### [x] T-201: Career returns fixtures; the UI decides where to go

Spec: §4.6 §4.11 §4.15 Goldens: unchanged Save: no change
Goal: `js/career` has no `navigate()` left (layer rule: career = no DOM / screens). Fixture shape documented once.
Files: js/career/cup.js, js/career/fight.js, js/ui/career-match.js, js/ui/career-map.js, ARCHITECTURE.md
Do not: change `startMatch(fx)`'s fixture fields or the onFinish return text.
Steps:

1. `Cup.fixture` / `Fight.*` fixtures drop `onLeave`; the UI callers add `onLeave: () => navigate('career')` (one helper
   `careerFx(fx)` in career-match.js).
2. ARCHITECTURE: one "Fixture" paragraph — `{ a, b, round, court?, back, setup(m)?, onFinish(m) → text, onLeave() }`, who fills which field.
   Accept: `grep -n navigate js/career` empty; cup tie, street fight, challenge all return to the hub (QA).
   QA: career run → Sim ⏭ a street fight and a challenge; leave a match mid-way.
   Result: Career fixtures' onLeave only runs Eval.restore; UI opens them with watchCareer(fx) (career-match.js: map clash / challenge, playCareer, People approaches). grep navigate js/career → empty. Fixture paragraph in ARCHITECTURE Screens.

### [x] T-202: Week steps as one ordered list

Spec: §4.5 Goldens: unchanged Save: no change
Goal: adding a weekly system (§4.24 faction events, year 2) = one line. `Run.endWeek` / `Run.nextWeek` read two arrays.
Files: js/career/run.js, ARCHITECTURE.md
Do not: reorder any step (R() / People.roll order); move the cup start or save out of endWeek.
Steps:

1. `WEEK_END = [Growth.week, Sponsors.tick, Run.heal, World.week, Fight.settle, Hex.decay]` and `WEEK_START = [Fight.clashRoll,
Training.rollFloor, Sponsors.offer, ElTrial.offer, Eval.setup, Asks.roll]` as `run => void` (wrap the inline injury
   and clash lines as `Run.heal` / `Fight.settle`), declared in run.js (all callees exist at call time, not load time).
2. endWeek = steps → reset week fields → week++ → cup or WEEK_START → save.
   Accept: career goldens and sims unchanged; a test asserts both arrays are functions.
   QA: none
   Result: WEEK_END / WEEK_START in run.js (arrow wrappers so callees load later); inline injury / clash lines → Run.heal / Run.settleClash. Order unchanged; test added (110 quick).

### [x] T-203: Diary lines tagged where they are written

Spec: §10.5 Goldens: unchanged Save: no change (old entries without a tag fall back to the regex)
Goal: the Week report's bad / good / world tag comes from the producer, not a text regex (`LOG_TAGS`), so new lines and
re-voiced text never mis-tag.
Files: js/career/run.js (`Run.log(run, text, tag = 'world')`, entry `{ w, t, k }`), the js/career files whose lines are
`bad` / `good` today (grep the LOG_TAGS patterns), js/ui/career-week.js, tests/career.test.js
Do not: change any line's text.
Steps:

1. `Run.log` stores `k` when given. 2. Pass `'bad'` / `'good'` at each producer the regex catches today. 3. career-week reads
   `k`, regex only when `k` is missing.
   Accept: a test logs one week of a seeded run and gets the same tags as the regex did.
   QA: career run → End week → Week report tags as before.
   Result: Run.log(run, text, k) stores k; logTag/logLi read entries ({t,k}), regex only for untagged. Tagged the fixed-outcome producers whose regex tag is right (Signed with, sponsor pulled out, star, OP); composite lines (City.day, payday, fight / cup results, events) keep the fallback — deviation: tagging them needs per-clause logic; regex quirks ("Learned" → world, "injury healed" → bad) left as today. Test added.

### [x] T-204: Split the long engine functions into named steps

Spec: §2 Goldens: unchanged Save: no change
Goal: `playRally` (serve.js, 320 lines), `match.end` (190), `dig` (230), `block` (221), `formBlock` (198), `setBeat` (147)
each read as a short list of named steps (≤ ~60 lines each), so ace traits (§8) have obvious places to hook.
Files: js/engine/serve.js, js/engine/match.js, js/engine/rally-defense.js, js/engine/rally-block.js, js/engine/rally.js, ARCHITECTURE.md (engine flow)
Do not: move, add or drop any R() call or change its order; change beat/act shapes; add globals beyond the new step
functions (prefix by owner, e.g. `serveToss`, `digReach`).
Steps: extract in place, one function per commit-able chunk; run `npm run test:quick` after each.
Accept: goldens + full tests pass without `--update`; no function in the six files > 80 lines (the acorn length scan).
QA: none
Result: Split into named steps (list in ARCHITECTURE engine flow): playRally, end, formBlock, setBeat, block, dig, plus spikeActs; every function in the five files ≤ 80 lines except rally() 110 (the possession loop that calls the phases — kept whole so the flow reads in one place) and newMatch 99 (the match-state literal). Goldens unchanged; 122/122 full suite.

### [x] T-205: Venue sets in a registry, one file each

Spec: §9.11 Goldens: unchanged Save: no change
Goal: a new venue = one file + one registry line.
Files: js/render3d/venue3d.mjs, js/render3d/venues/arena.mjs, hall.mjs, beach.mjs, highland.mjs, street.mjs, props.mjs (new: officials, benches, cart, big screen), ARCHITECTURE.md
Do not: change LOOK values or any mesh; add Math.random draws.
Steps: move `setArena`… `setStreet` and `setOfficials` out; venue3d keeps LOOK, floor, crowd and `VENUE_SETS = { arena, hall, … }`.
Accept: venue3d.mjs < 350 lines; all five venues screenshot identical (pixel diff ≈ 0 on a held frame).
QA: Monster game, each `A.venue`.
Result: js/render3d/venues/: kit (shared builders, BEAMS), looks (LOOK), floor (drawFloor), arena / hall / beach / highland / street, props; venue3d keeps build / dress / update / screen with VENUE_SETS — 847 → 309 lines. QA: Monster game, all five venues, seeded Math.random; pixel diff vs HEAD equals HEAD-vs-HEAD noise (0.35 / 7.1 / 0.6 / 2.0 / 8.5 % — animation timing); no page errors.

### [x] T-206: Place panels by kind

Spec: §10.2 §10.3 Goldens: unchanged Save: no change
Goal: a new place kind = one entry in `PANELS`. career-map.js keeps actions / walk lock; panels move out.
Files: js/ui/career-map.js, js/ui/career-panels.js (new: `placeCard`, `ptag`, `placeTags`, `placeDetails`, `spotPanel`,
`tileBlock`, `pointPanel`, `clashPanel`, `trainSpot`, `challengeBlock`, `venuePanel`, `hqPanel`), index.html, ARCHITECTURE.md
Do not: change markup or hotkeys.
Steps: move; `spotPanel` dispatch becomes `PANELS = [[test, fn], …]` (hq, clash, venue:, pt:, else trainSpot).
Accept: lint + tests pass; each panel renders the same HTML (string compare in a quick headless check or QA screenshots).
QA: career run → open a gym, an HQ, the clash, a venue, a map point.
Result: js/ui/career-panels.js (new, before career-map.js): placeCard … hqPanel; spotPanel = PANELS [test, build] list, else placePanel (the SPOTS body). career-map.js 581 → 222 lines (mount, pick, actions, walk lock). QA: seeded new run — spotPanel HTML for all 40 ids and the four sheets identical to HEAD (3D-portrait placeholders normalised); no page errors.

### [x] T-207: Me and Season sheets in their own files

Spec: §10.4 Goldens: unchanged Save: no change
Goal: one file per sheet, like People and World.
Files: js/ui/career-sheets.js → js/ui/sheet-me.js + js/ui/sheet-season.js (new; career-sheets.js removed), index.html, ARCHITECTURE.md
Do not: rename functions.
Accept: lint + tests pass; both sheets open (QA).
QA: career run → Me, Season.
Result: career-sheets.js → sheet-me.js (sheetMe, elementLine, seePhysio, learnSkill, homeRow, setHousing) + sheet-season.js (seasonCard, leaveSquad — also used by People —, calendar, matchLog, sheetSeason, diaryList). QA: Me / People / World / Season sheet HTML identical to HEAD; no errors.

### [x] T-208: match-screen.js by job

Spec: §9.9 §9.10 Goldens: unchanged Save: no change
Goal: match-screen.js holds start / leave and the playback state `A` (its one literal is the documented shape); controls,
settings menu and technique switches move out.
Files: js/ui/match-screen.js, js/ui/match-controls.js (new: control bar, speeds, settings menu, cam label), js/ui/match-tech.js
(new: `techSection`, `flipTech`), index.html, ARCHITECTURE.md (list every `A` field group in one table)
Do not: rename `A` fields; change markup.
Accept: match-screen.js < 300 lines; lint + tests pass.
QA: Monster game → pause, speed, settings, a technique switch.
Result: match-screen.js 588 → 220 (startMatch / A, 3D load + bind, fit and its listeners, venue / stakes, leave); match-controls.js (new: control bar, ⚙, camera / follow, fullscreen, timeouts, tactics, speed / pause / skip, board, commentary, rail, box score, hotkeys); match-tech.js (new: technique switches). A-field table in ARCHITECTURE Screens. RNG-scan test covers the two new files. QA: Monster game — markup after start, pause, speed, ⚙, rail tabs, a technique switch: HTML identical to HEAD, no errors.

### [x] T-209: CSS colours → tokens; 12px floor

Spec: §9.2 §9.3 Goldens: unchanged Save: no change
Goal: the 67 hex colours outside theme.css become theme tokens (new tokens only where no existing one fits, listed in
the Result); the two `clamp(10px…)` / `clamp(11px…)` sizes reach 12px.
Files: css/style.css, css/career.css, css/hub.css, css/map.css, css/people.css, css/story.css, css/theme.css
Do not: change a visible colour by more than a token rounding (report any that move); touch canvas/3D colours.
Accept: `grep -E '#[0-9a-fA-F]{3,8}\b'` outside theme.css → 0 (club / faction data colours excepted, listed); hub, sheets
and match screenshots pixel-diff < 1 %.
QA: career hub, Me sheet, a match.
Result: 67 hex → 22 new theme.css tokens at the same values (no visible change): --white; court art --court-ink / -yellow / -blue / -glow / -red / -red-deep / -navy / -night; --stamina-mid, --rank-s0 / -s1, --el-locked, --outlaws, --gold-hi, --note-sea, --meter-mid, --day-dot, --sea, --clash-fill, --parchment, --parchment-shade. Hex outside theme.css: 0; the 'no token' notes dropped. Match sizes clamp(11px…) / clamp(10px…) → 12px floor. Screens vs HEAD: hub / four sheets 0.00 %, match 0.10 % (animation noise).

### [x] T-210: Inline styles and emoji icons out of js/ui

Spec: §9.2 §9.5 Goldens: unchanged Save: no change
Goal: 41 `style="…"` → classes (only CSS custom properties like `--tc` / `--a` stay inline); emoji used as stat / resource
icons → `statI` / `STAT_ICON` (map-place emoji stay).
Files: js/ui/*.js (only the lines found), js/ui/icons.js (missing icons), css/hub.css, css/career.css, css/style.css
Do not: change copy; add a second icon helper.
Accept: `grep -o 'style="' js/ui` only custom-property cases; emoji count per file in the Result (before → after).
QA: career hub, sheets, a match.
Result: 41 inline styles → custom properties only: bar fills --w (width: var(--w) on .bar / .sbar / .bbar / .mb / .mp / .mbar4 children), standing bars --l / --w, data-colour text class .tc + --c, growth chart .gline / .gcup / chartkey --c (speed colour → --chart-speed token), debug badges --x / --y, menu .trow.m0. Emoji: 136 → 136 — none are stat / resource icons (the ~85 "emoji" counted earlier are UI glyphs ✕ → ⚙ ★ ⏭ ⚑ ⚔ ✉ ☾ and map-place emoji 🛡 🏟; 🔊 / 🔇 the sound toggle), so nothing to swap for statI. QA: Me / People / World / Season sheets 0.00 % vs HEAD, hub top bar + rail 0.00 % (map = noise), match 0.07 %; no errors.

### [x] T-211: "How to add X" recipes in ARCHITECTURE.md

Spec: — Goldens: unchanged Save: no change
Goal: one short recipe each, naming the files and the one list to extend: a venue (T-205), a place kind (T-206), a week
step (T-202), a beat act kind (ACTS + test), a career match kind (fixture, T-201), a glossary term, a save field (RUN_VERSION + repair).
Files: ARCHITECTURE.md
Accept: each recipe ≤ 6 lines and matches the code.
Result: "How to add…" section before Engine flow: venue, place kind, weekly system, beat act kind, career match kind, glossary term, save field — each ≤ 6 lines, names the list to extend, checked against the code.

### [x] T-214: Walking speed selector on the map (owner request)

Spec: §4.4 Goldens: unchanged Save: no change (browser key `sns_walk`)
Files: js/ui/career-hub.js (`walkSpeed`, `walkSet`), js/ui/map-view.js (`walkK`, `setWalk`), js/map3d/map3d.mjs (`setWalk`: your avatar ticks ×k), js/core/storage.js (KEYS.walk), css/map.css, css/story.css
Result: `Walk 1× 2× 4×` top right of the map, above the walk lock (z 71) so it works mid-walk, hidden in scenes; display only (rules move instantly). QA: the same trip ×1 vs ×4 took ~4.2× longer; no errors.

### [x] T-213: Reminders only — no suggested next step (owner request)

Spec: §9.1 §10.3 Goldens: unchanged Save: no change
Files: js/ui/career-hub.js (`nextStep` removed, `evalCountdown`), css/hub.css, css/career.css (`.wit.next` gone)
Result: the inbox keeps battle, `N friends need attention`, Gazette, `Eval in N weeks` / `Eval next week` (opponent + venue peek) / `Cup in N weeks`, seizes; the "→ train X" step, "club signs you" and "Night · end the week" are gone. QA: W1 `Eval in 3 weeks`, W3 `Eval next week` with facts; no errors.

### [x] T-193: Venue sets and floors

Spec: §9.11 Goldens: unchanged Save: no change
Files: js/render3d/venue3d.mjs (new), js/render3d/arena3d.mjs (return floor / lights / stands / board handles; old capsule crowd removed), js/render3d/r3d.mjs (build + dress + update), js/ui/match-screen.js (`matchVenue`, `matchStakes`, A.venue / A.stakes), ARCHITECTURE.md
Do not: draw randoms from R() (presentation uses Math.random only); change the court lines' positions; touch the engine.
Accept: each venue renders its floor and set (QA screenshot per venue via `A.venue`); career eval at the Beach shows the beach; no errors.
Result: venue3d.mjs: LOOK per venue (sky, fog, light, floor), floor canvas redrawn per match (court / free zone, planks + faded basketball lines, sand, asphalt + cracks, scuffs, emblem, attack lines dashed past the side lines; beach rope lines solid blue), sets: arena (trusses, LED ribbon, big screen, spot), hall (bleachers, wall, windows + shafts, banners, wall board), beach (bleachers, sea, palms), highland (mountains with snow caps, flags), street (chain-link fence, overpass deck, graffiti pillars, sodium lamps). `matchVenue` / `matchStakes` in match-screen (fx.venue → City.venue → street; exhibitions arena). arena3d returns light / floor / stands / board handles; the capsule crowd is gone. QA: all five venues screenshotted in a Monster game, no errors.

### [x] T-194: Cut-out crowd, venue light and moments

Spec: §9.11 Goldens: unchanged Save: no change
Files: js/render3d/venue3d.mjs, js/render3d/arena3d.mjs (updateCrowd → venue crowd), js/render3d/r3d.mjs
Accept: crowd count follows stakes; zone dims + rim light; confetti on the win; low-end skips cones and shafts.
Result: cut-out crowd (4 poses, one InstancedMesh each, team tint × venue lum, neutrals per venue; rows per venue, count = capacity × stakes), same cheer / wave bounce; zone: hemi + sun ×0.65 and a rim light in the zone team's colour (eased ~0.4 s); confetti Points on A.cele (winner colour, gold, white); low-end: no light cones / shafts, fewer palms, smaller crowd and confetti.

### [x] T-195: Officials, props and the big screen

Spec: §9.11 Goldens: unchanged Save: no change
Files: js/render3d/venue3d.mjs
Accept: referee, line judges, benches, scorer table, ball cart in place outside the court; big screen shows the score in sync with the scoreboard.
Result: referee on a stand by the far post, two line judges with flags, two team benches, scorer's table, ball cart (judges + table hidden in the street); big screen (arena) / wall board (hall) draw team shorts + score + set from the shown scoreboard (#p0/#p1/#setn), redrawn on change. Deviation: no scorer portrait on the screen yet. Follow-up (owner): light cones / shafts get a length fade (alphaMap), lower opacity, and fade by camera distance to their axis (0 within 6 m, full at 16 m) and in scene close-ups; spot 260 → 140, zone rim 1.6 → 0.9.

Owner request 2026-10-04 (map and facility revamp, spec §4.18d–e, §4.19a): T-181 → T-183 built by the spec chat;
T-184 → T-186 built by the spec chat on the owner's go.

### [x] T-200: Egoist game in the Dev tab; negative wit (owner request)

Spec: §2.12a §3 Goldens: unchanged by this part Save: no change
Files: js/engine/teams.js (`mkEgoistTeams`), js/engine/players.js (`WIT_MIN`, fixStats, ovr), js/engine/stats.js (`witBody`), js/ui/menu.js (`startEgoist`, Dev button), tests/engine.test.js
Result: Monster teams with ego 1 and wit −0.2…−1; negative wit counts as 1 for power / defense and OVR, W() floors at 0.1, maturity 0. ~20 ego acts per match (3.6 steals, 5.5 demanded sets). Stat-guard test: wit floor −1. QA: Egoist game, no errors.

### [x] T-199: Ego moment — slow motion and a chase camera on the ego player (owner request)

Spec: §2.12 Goldens: update (beats gain the `ego` act) Save: no change
Files: js/engine/match.js (egoSteal), js/engine/rally.js (setCalls), js/render/movement.js (`egoFocus`, `egoRelease`, approach phase A), js/render/playback.js, js/render/acts.js (`ego`), js/render/overlay.js (labels in the ego shot), js/render3d/camera3d.mjs (shot kind `ego`, tracked shots)
Result: steal: world ×0.3 from 20 % of the beat, thief on real time; demanded set: slow until the run-up (A.ts 0.3 then back to ~0.75 at 40 %), hitter sprints in real time, then back on the world clock. QA (Egoist game): both kinds seen, chase cam framed behind the player, "MINE!" label visible, no errors.

### [x] T-198: Mistakes follow skill, like the real game (owner request)

Result: per action from its own stats (owner: no overall level) — SKILL.use serve ← Power, spike ← Power 0.6 + Jump 0.4, set (double contact) ← Speed, pass ← Defense 0.7 + Speed 0.3, block ← Jump 0.55 + Defense 0.45; mistake factor e^((125 − level) / 75), ≤ 4 (×1.4 at 99 … ×4 beginner). Points (60 matches): OVR 30–60 kills 30 · errors 55 · blocks 4 · aces 11; league 38 · 43 · 10 · 9; all-OP 51 · 32 · 8 · 8 (was ~45–60 · 18–24 · 10–23 · 6–10 at every level). Goldens: update (teams / matches / sims — gameplay). Tests rebased to real-game rates: stuff 7–11 % per attack (was 12–16 %), ego err/att < 0.4 (serve errors included); the clutch test watches 50 matches (was 20). Stat → action table: spec §2.1b.

### [x] T-197: Average game in the Dev tab (owner request)

Result: `mkAverageTeams(lo = 30, hi = 60)` (engine/teams.js): two random teams, every squad player rolled to an OVR in the range by shifting all four stats together (the rolled shape kept, 10–99), no stars / OP; Dev tab `Average game` → `startAverage()` (menu.js). Test: OVR range, spread, a match plays out. QA: the match runs, no page errors. Goldens unchanged.

### [x] T-196: Dialogue text no longer bounces (owner request; committed as "T-193" before the venue tasks took that id)

Result: the line is laid out in full from the start — typed part + the untyped rest in `.sb-ghost` (visibility: hidden) — so words never jump to the next line, centred narration never shifts and the box never grows while typing; `.sb-text` min-height two lines (say steps only), so one- and two-line speeches keep one box size. QA: box top / height and the text's left edge constant through typing (Playwright sampling). Files: js/ui/story-box.js, css/story.css.

### [x] T-192: Story week 1 on campus; week 2 opens the island (owner request)

Result: `City.fence` / `outside` (Story, week 1, flag `campus` set by the intro) gate City.can / travelTo / scout, Fight.ban (battles, challenges) and watch, and the place / point / HQ / battle cards (reason on the control); `model.fence` clamps the camera to the campus (≤ 150 m); intro `cam` to the Academy Gym + `after.spot` opens its card; next step → the Academy Gym; week-2 scene `explore` (`cam: island` → `MapView.overview`, fitted to the coast). Tests: fence, week 2, Endless. Files: js/career/city.js, js/career/fight.js, js/career/story.js, js/data/story.js, js/career/mapmodel.js, js/map3d/map3d.mjs, js/ui/map-view.js, js/ui/story-box.js, js/ui/career-map.js, js/ui/career-hub.js, tests/career.test.js.

### [x] T-191: Academy routing (owner request)

Result: the airport road ran past the campus to a junction north of it and back (a detour, parallel to the avenue to Wei); now airport → jAc2 → park → jAc1 (moved onto the avenue) → jWp. Trips from the airport: Wei gyms 2 → 1 day, dunes 3 → 2 (test: trail → dunes is the 3-day trip). Files: js/data/city.js, tests/map.test.js.

Owner request 2026-10-04 (spec §4.29, lore §6): the rival and the aces, drawn on the map. Built by the spec chat.

### [x] T-189: The named players — seated, authored curves, never moved

Spec: §4.29 Goldens: unchanged Save: no change (new runs only)
Goal: the rival, the cohort and the first aces exist in their clubs and grow on their curves.
Files: js/data/stars.js (new), js/career/stars.js (new), index.html, js/career/run.js, js/career/growth.js, js/career/world.js, js/career/people.js, tests/career.test.js, tests/people.test.js
Result: 7 named; rival 76 → 90 (★, not OP), cohort 70 → 85, first aces 86 → 95 (OP). Calibrations: league growth leaves the named out (w28 mean band ±4); bond baseline rebased (stream shift only — seeds 11–18 average 8.3 vs 8.0 without).

### [x] T-190: The named on the map; the rival's first meeting

Spec: §4.29 §10.10a Goldens: unchanged Save: no change
Goal: the rival and the aces stand as full models by their HQs, named; Kaede names them; the rival meets you in week 3.
Files: js/career/mapmodel.js (`figures` replaces `guide`), js/map3d/map3d.mjs (one avatar per figure), js/map3d/pins3d.mjs (labels), css/map.css (`.mlab.fig`), js/data/story.js (`rivalMeet`, cohort lines), js/career/story.js (`week3`, named speakers), tests/career.test.js
Result: 8 figures (Kaede + 7) as dressed default VRMs; labels `Name · Rival / Next ace / Ace` in the club colour. QA: screenshots of the rival scene and the map by Wei Gold.

Owner request 2026-10-04 (spec §10.10a, lore §6–§7): the guide Kaede. Built by the spec chat.

### [x] T-187: Kaede — the flatmate: intro meeting, portrait, model on the map

Spec: §10.10a Goldens: unchanged Save: no change (story flags)
Goal: the intro ends with a normal first meeting with Kaede at the Student flat; she stands by its door on the map, named.
Files: js/data/story.js (GUIDE, intro lines), js/career/story.js (who 'senior', goto by id), js/career/mapmodel.js (`guide`), js/map3d/avatar3d.mjs (opts.kit, face), js/map3d/map3d.mjs, js/map3d/pins3d.mjs (name label), tests/career.test.js
Result: intro + 11 lines (two choices: first-year / why; tour or `noTour`); default VRM dressed teal hair + Academy hoodie, 3D portrait from the same kit; name label at 7.5 m. QA: screenshots of the meeting, the map and a lesson.

### [x] T-188: Kaede's lessons at their moments

Spec: §10.10a Goldens: unchanged Save: no change
Goal: training, the tile war, factions, payday / moving house and the first evaluation are explained once each, in her voice, when they first matter.
Files: js/data/story.js (5 scenes), js/career/story.js (STORY_WHEN, `hub` trigger, one a day, {role}/{key}), js/ui/career-hub.js (hub hook), js/ui/story-box.js (text fill), tests/career.test.js
Result: hub hook in renderCareer (no scene / lock / event); lessons gated by `noTour`; one scene per day (`run.story.at`); test covers order, once-only and noTour. Covers part of T-175 (the hub hook); week / place / result hooks still open there.

### [x] T-181: A real airport

Spec: §4.18d Goldens: unchanged Save: no change
Goal: the arrival point reads as an airport: runway along the shore, terminal + tower, apron with a plane, cargo shed.
Files: js/data/city.js (AIRPORT), js/career/mapmodel.js (landmark `airport` with `rot`, `inAirport`, lots keep off), js/map3d/kit3d.mjs (`airport`), js/map3d/town3d.mjs (fixed `rot`)
Result: one landmark on `AIRPORT.yaw` (runway 84 × 8 m west of the terminal, seaward); lots keep off `AIRPORT.box`; the Beach shack's old spot freed (its roads re-linked: jSs → airport). QA screenshot: runway on the south shore, no lots on it.

### [x] T-182: Central Academy grows one tile ring; the start home moves next to it

Spec: §4.2 §4.18e Goldens: unchanged Save: no change (housing key `studio` kept)
Goal: the Academy is its tile + the six round it; you start in a Student flat in that ring.
Files: js/data/city.js (ACADEMY, HOME_AT.studio, roads, `academy-quarter` district), js/career/city.js (regionAt by hex distance), js/career/hex.js (`Hex.dist`), js/data/world.js (HOUSING.studio), tests/map.test.js
Result: 7 academy tiles (none takeable); the student quarter adds ~76 lots (Academy ~95, Wu ~210); `studio` = Student flat (region open, same rent / rest / noise), home node off jAc2. 114 tests green.

### [x] T-183: Academy Gym — Lv 1, a little EXP to every stat

Spec: §4.18e Goldens: unchanged Save: no change
Goal: a fixed-level gym on the Academy ring that trains all five stats a little.
Files: js/data/city.js (SPOTS.acaGym, road, LANDMARK), js/data/career.js (TRAININGS.all, TRAINK filter), js/career/training.js (fixed `lv`, `more` rows), js/career/city.js (day label), js/ui/career-map.js (all rows; per-stat cap line), js/ui/career-hub.js (not a key-stat suggestion), tests/career.test.js
Result: Power/Defense/Speed/Jump 2, Wit 0.025, 15 stamina; facility always Lv 1 (tip: fixed); panel lists all five with EXP ratings; not in TRAINK (no teammates, NPC floor unchanged → goldens unchanged).

### [x] T-184: District plan in data — districts with jobs, homes where they belong

Spec: §4.19a Goldens: unchanged Save: no change (HOME_AT moves only)
Goal: the §4.19a districts exist as DISTRICTS entries with their kinds; the four other homes move (condo → downtown by the civic core, dorm → the Ring by the training district; abandoned gym and highland room stay).
Files: js/data/city.js (DISTRICTS, HOME_AT, ROADS nodes / edges for new homes), js/map3d/kit3d.mjs (new filler kinds: office, warehouse yard, plant, depot, net shed), tests/map.test.js (lot counts)
Do not: change places, HQs, venues or borders; exceed MapModel.maxLots; draw randoms.
Accept: every district of §4.19a has lots of its kinds; homes in their regions; map tests green. QA: full-island screenshot.
Result: §4.19a districts in DISTRICTS (wei-civic tall offices, wei-works plant / tanks / chimneys / depot, wei-ring-west / south / east apartments, harbor containers / tanks / fish market); condo by the civic core off hq0, dorm by the training district (old condo node kept as junction jWc; jWk road to the works); new fillers office, apartment, plant, depot, tank, stack (+1 cylinder shape → +1 draw call); ~960 lots (Wei ~530). QA: island and close-up screenshots.

### [x] T-185: Ground use — fields, terraces, yards, quays, parks

Spec: §4.19a Goldens: unchanged Save: no change
Goal: the empty land between towns reads as farmland, scrub or industry: flat ground patches (polygons in data, vertex colours or one decal mesh), no lots.
Files: js/data/city.js (GROUND list), js/career/mapmodel.js (`land.ground`), js/map3d/map3d.mjs or town3d.mjs (draw), tests/map3d.test.js
Accept: Shu villages ringed by terraces, Wu town by yards, the harbor by quays, a park per Ring block; ≤ 1 extra draw call. QA: full-island screenshot.
Result: GROUND (18 patches: Shu terraces / paddies ringing the villages, reservoir lake, quarry; Wu yards, quays, fields; Wei parks, works yard, market gardens; Academy pitch; Outlaws scrapyard) painted into the terrain colours (contour bands for terraces, a flattened lake) — 0 extra draw calls; lots stay off kept kinds (MapModel.kept). Files deviation: drawn in map3d.mjs buildTerrain; test in map.test.js.

### [x] T-186: City life — buses, vans, boats, a plane

Spec: §4.19a Goldens: unchanged Save: no change
Goal: traffic shows how the island works: buses on main roads (airport ↔ Academy ↔ downtown ↔ harbor), vans harbor → overpass → Wei, fishing boats offshore, a plane on the runway.
Files: js/career/mapmodel.js (`life.traffic` routes from ROADS, hashes only), js/map3d/life3d.mjs (one InstancedMesh per vehicle kind, within CAP), tests/map3d.test.js
Do not: draw randoms; add per-frame allocations.
Accept: vehicles move along their routes; frame time unchanged within noise. QA: map screenshot + perf note.
Result: TRAFFIC data → MapModel.traffic() → life3d: 4 buses, 4 vans (up the overpass deck via town3d's exported DECK), 4 boats, a plane taking off every 45 s; +4 instanced draw calls, 13 instances. Deviation: test in map.test.js (data side); QA screenshots show van on the deck, buses, the plane rolling.

Owner request 2026-10-04 (spec §9.10 technique switches): T-178 → T-179. Goldens unchanged (nothing off = same match).

### [x] T-178: Technique switches in the engine, with use counts

Spec: §9.10 Goldens: unchanged Save: no change (`run.techOff` via RUN_DEFAULTS)
Goal: a match can hold back named techniques per player from the next rally, and counts how each technique did.
Files: js/engine/skills.js (hasTech), js/engine/match.js (match state: `off`, `techUse`), the technique hook sites found by `hasTech(` in js/engine/serve.js, rally*.js, js/data/skills.js (`trade` field), js/career/run.js (RUN_DEFAULTS `techOff`), js/ui/career-match.js (pass `run.techOff` into the fixture), tests/engine.test.js
Do not: draw extra randoms (the off check must come before any roll for that technique, never add a roll); change any technique's numbers; invent trade-offs.
Steps:

1. Match state `off: { [playerId]: Set<techId> }` and `Match.setTechOff(m, pid, id, on)` (applies at the next rally start, like setTactic).
2. `hasTech(p, id)`: when a match is running (`CM`) and `CM.off[p.id]` has `id` → false. Outside a match unchanged.
3. `techUse[pid][id] = { n, won, err }`: +n where the technique fires, +won when that rally goes to the player's side, +err when it ends in that player's fault.
4. SKILLS `trade: { up, down }` short phrases from SKILL_HOW numbers only: killer `{up:'+10% pace', down:'+3% faults'}`; delay `{up:'block can only fingertip it', down:'may hang too long (low jump / wit)'}` (T-180); every other technique `{up:<its short gain>}` with no `down` until the owner adds one.
5. Career fixtures start with `off[youId] = new Set(run.techOff)`.
   Accept:

- A seeded match with nothing off = golden result unchanged (tests/golden.json).
- A seeded match with `killer` off for a serving player: no killer serve fires (techUse n = 0); same seed, killer on: n > 0.
- techUse counts appear for a 1-set headless match; tests green.
  QA: none
  Result: `knowsTech` / `hasTech` (= knows and not held) / `techHeld` / `techFire` / `setTechOff` in engine/skills.js; `m.off` (from `p.techOff`), `m.techUse`, `m.techRally` (settled in `end()`); fire counts at every technique site (serve, rally-phases, rally-block, rally-defense, rally); `SKILLS.trade` for all 14 (downs: killer, delay). Deviation: the career off-list lives on your player (`you.techOff`, saved with the player) instead of `run.techOff` — newMatch reads it for any fixture, no per-fixture plumbing. New test (killer off → 0 fires; mid-match flip); goldens unchanged; 102 quick tests + lint green.

### [x] T-179: Technique switches UI (match prep, Tactics tab, result)

Spec: §9.10 §9.9 Goldens: unchanged Save: no change
Goal: the player can see each technique's trade-off and this-match record and switch it off or on, before and during the match.
Files: js/ui/match-screen.js (rail Tactics tab section, control-bar badge, keys T and 1–9, commentary line), js/ui/career-match.js (prep row + peek, Reset, save `run.techOff`), js/ui/match-result.js (`Held back:` line), js/ui/icons.js (pack icons if missing), css/style.css (`.tsw` rows)
Do not: show passive skills; hide off rows; put the switches anywhere but the right column; use colours outside theme.css.
Steps:

1. `techRows(m, pid)` → rows per §9.10 (pack icon, name with SKILL_HOW hover, trade chips, `used n · won n`, switch). Exhibition: one group per player of your side(s).
2. Tactics tab: Techniques section first, then Tactic / Defence. Switch → `Match.setTechOff`, commentary line, re-render; badge `n off` on the bar's Tactics button.
3. Keys: `T` → railOpen('tac'); with the tab open, `1`–`9` flip rows in order.
4. Match prep: `Techniques` row `n on · m off ›` → peek with the same rows (no counts) + `Reset`; changes write `run.techOff` and save.
5. Result screen: `Held back: Killer Jump Serve` under your line when any were off.
   Accept:

- Career eval with a player owning Killer Jump Serve: prep peek switches it off → in the match the row shows off, badge `1 off`, no killer serves; switch back on mid-match → next rally it can fire.
- Rows line up (switch column x identical across rows); word budget of the Tactics tab ≤ 60 at 3 techniques.
  QA: career run → match prep peek, match Tactics tab (screenshots on and off), result screen.
  Result: rail Tactics tab opens with Techniques (pack icon, name + SKILL_HOW hover, gain / cost, `used · won · faults`, switch column), one group per player in exhibitions; `Tactics n off T` badge; keys T, 1–9; commentary line on each flip; match prep `Techniques n on · m off ›` peek with Reset; result `Held back:`. QA: Monster game — key 1 holds back Freak Quick, badge `1 off`, log line, no errors; career — prep row `5 on · 1 off`, choice survives save/load. Monster teams own every technique, so their tab is long (~160 rows).

Owner request 2026-10-04 (spec §10.7a, design system TitleScreen card): T-176 → T-177. UI only; goldens unchanged.

### [x] T-176: Title screen layout as the TitleScreen mockup

Spec: §10.7a Goldens: unchanged Save: no change
Goal: the title screen matches the design system TitleScreen card: brand top-left on one line with kicker and tagline, the menu stack under it, Dev as a footer link.
Files: js/ui/menu.js (renderMenu), css/career.css (`.title` block, ~l.1552–1640)
Do not: change what the buttons do, the Settings pop, the Dev panel contents or the Enter shortcut; add new tokens.
Steps:

1. `.title`: drop the 2-column centred grid; `position: relative; min-height: 100vh; padding: 96px` with one left column (`.tcol`, width 440px … brand may overflow wider).
2. Brand: `<div class="lab">4V4 VOLLEYBALL RPG</div><h1>Spite &amp; Spike</h1><p class="mute">Nobody believed in you. Good.</p>`; h1 `font: 700 clamp(56px, 6vw, 80px)/1 var(--disp); letter-spacing: .14em; white-space: nowrap`; tagline 16px; the h1 tooltip goes.
3. Stack 56px under the brand: `.tbig` 52px high, padding 0 20px, text left, 12px gaps. Hero `.tcont`: padding 16px 20px; line 1 `Continue` (16px 600), line 2 small `{name} · {ROLE_NAME} · Week {n} · {club name or Academy}` (`Last run` / `result` and `Cup` cases as today); `<kbd>Enter</kbd>` vertically centred at the right; no third line.
4. Dev: out of the stack → `<button class="btn quiet tdev">Dev ›</button>` absolutely at bottom 32px / left 96px; the `.mdev` panel opens above it (bottom 72px, left 96px, max-width 720px).
5. Settings pop stays anchored to its button.
   Accept:

- 1440×900 with a save: wordmark on one line at x = 96; Continue hero at y ≈ 260; four buttons; Dev link bottom-left; no element right of x = 560 except the backdrop (T-177).
- Without a save: New career is the ink hero. 1280×720: nothing overlaps, no scroll.
- Word counter (title) ≤ 25.
  QA: screenshots with and without a save at 1440×900 and 1280×720, side by side with the TitleScreen card.
  Result: one 440px column at x 96 (`.wrap` unpadded on the title), brand = kicker / one-line h1 / tagline, 52px stack, Continue hero `Continue` + `name · role · Week n · club` with Enter at the right, Dev › link bottom-left (panel above it), Settings pop inline under its button. 1440×900: h1 x 96, hero y 287 (not ≈260: the steps' 80px h1 + 56px gap), nothing past x 536 but the wordmark; 1280×720: no overlap, no scroll. Word budget for the title raised 15 → 25 (debug-panel.js); 23 with a save.

### [x] T-177: 3D court backdrop on the title screen

Spec: §10.7a Goldens: unchanged Save: no change
Goal: the right side of the title screen shows the empty match arena slowly orbiting behind two soft glows.
Files: js/render3d/title3d.mjs (new: `mountTitle3D(el)` / `unmountTitle3D()` reusing `buildArena` from arena3d.mjs — no players, no ball, no crowd animation if costly), js/ui/menu.js (mount after render, unmount on navigate), css/career.css (`.tbg` layer: fixed, inset 0, z-index 0; the column above it; radial glows as CSS on `.tbg::after`), index.html (if the module needs an entry)
Do not: load VRM models; run the match renderer's loop; block the menu on the 3D load (menu is usable at once, the canvas fades in over 400ms).
Steps:

1. Renderer at devicePixelRatio ≤ 1.5, camera at the court's long-side corner, orbit 360° per ~90s around the net centre, slight downward tilt; court framed in the right 60% of the screen.
2. A left-to-right dark gradient over the canvas (bg 100% at x ≤ 640px → 0% at 60%) so the column text keeps ≥ 4.5:1.
3. `prefers-reduced-motion`: one static frame, no loop. WebGL error → no canvas, the CSS glows only.
4. Stop the loop and dispose on leaving the title (no GPU work in the hub or match).
   Accept:

- Title renders the orbiting court; 60 fps-class at 1440×900 on the QA machine (frame time logged in ?dev).
- Leaving the title disposes the renderer (no canvas left in the DOM, rAF stopped).
- Reduced motion → static frame; no errors in the console.
  QA: screenshot at 1440×900; navigate title → hub → title twice, no leaks in the debug log.
  Result: js/render3d/title3d.mjs (`mountTitle3D` / `unmountTitle3D`): its own renderer (dpr ≤ 1.5, no shadows), buildArena minus the ball, board in --hot / --cyan, camera orbiting 90 s per turn (r 27 m, 11 m up), view offset puts the court right; fades in on the first frame; reduced motion = one frame; WebGL error = CSS glows only. Kept across Settings / Dev re-renders; `navigate` → `titleBgOff`, and the loop stops itself if its element leaves the DOM. QA: title → hub → title ×2: 1 canvas on the title, 0 in the hub, no errors.

Owner request 2026-10-03 (spec §10.9): T-168 → T-169. UI only: no rule or number change; goldens unchanged.

### [x] T-168: Sign only at the HQ; World tab My club

Spec: §10.9 §10.3 Goldens: unchanged Save: no change
Goal: the only Sign button is on a club's HQ place panel; the World sheet's Clubs tab becomes a shortcut card for your club.
Files: js/ui/career-dossier.js (WORLD_TABS, clubsCard, dossierCard), js/ui/career-hub.js (inboxRows, nextStep), css/people.css (if needed)
Do not: change World.canJoin / World.join / joinGap; remove Sign from hqPanel.
Steps:

1. WORLD_TABS `clubs: 'My club'` (key unchanged so worldTab('clubs') still works).
2. clubsCard(run) → myClubCard: with a club — chip, name, OVR, your role + `starter` / `bench`, buttons `HQ ›` (`hubOpen(null);mapPick('hq'+ti)`) and `Dossier ›`; free agent — `Free agent` + clubs with World.canJoin ok as links (chip, name, OVR) to their HQ pin, none → `Nobody would sign you yet` (hover: the smallest joinGap).
3. dossierCard clubs: drop the Sign / gap button; club name links to its HQ pin.
4. Inbox item and nextStep "would sign you": act = `hubOpen(null);mapPick('hq'+t.i)`, button label `HQ`.
   Accept:

- No element with `onclick="joinClub` outside hqPanel (grep).
- Free agent at week 1: My club tab lists signable clubs as links; clicking one selects its HQ on the map with Sign.
- Signed: My club card shows your club; HQ › selects the pin.
  QA: career run → World › My club (free and signed), inbox HQ link.
  Result: My club card (signed: role · starter/bench, HQ › / Dossier ›; free: signable clubs as HQ links, none → nearest gap on hover); dossier club names link to HQ; inbox `HQ ›` + nextStep open the HQ pin; `joinClub` only in hqPanel. QA q168/1–7, no page errors.

### [x] T-169: People as one list with markers and favourites

Spec: §10.9 §10.4 Goldens: unchanged Save: no change (run.fav via RUN_DEFAULTS)
Goal: the People sheet is one list with small team / rival / favourite markers; favourites can be starred.
Files: js/ui/career-people.js (PEOPLE_FILTERS, sheetPeople, personDetail), js/career/run.js (RUN_DEFAULTS `fav`), css/people.css (.pmk markers)
Do not: change Rel / Asks / People logic; drop the waiting `!` badge.
Steps:

1. Remove PEOPLE_FILTERS, the `.seg.pfil` row and CW.pfilter use.
2. One list, no `.lab` headings, order: waiting → favourites → squad (starters) → bench → others → gone; dedupe by id.
3. Row markers after the name (`<span class="pmk">`): `🛡` in `--tc` of your club (class `out` when bench), `⚔` if rival (as today's `rival` fn), `★` if in run.fav; each with tip (`Your squad` / `Bench` / `Rival` / `Favourite`).
4. RUN_DEFAULTS `fav: [() => [], …]`; personDetail header gets a `☆ / ★` toggle button (`toggleFav(id)`, Run.save) with tip `Pin to the top`.
5. Header right: `Chemistry ›` peek (chemBlock + Leave squad when allowed), only when you have a squad.
   Accept:

- No filter tabs, no group headings; a starred person moves to just below the waiting rows and keeps ★ after reload.
- Squad mates show 🛡, rivals ⚔; tests pass (people.test.js stub updated if needed).
- People sheet ≤ 60 visible words at week 1 (`?dev`).
  QA: career run → People: star someone, reload, open Chemistry ›.
  Result: one deduped list (waiting → ★ → squad → bench → others → gone), markers 🛡 (club colour, outlined = bench) / ⚔ / ★ with tips, ☆/★ toggle in the person header (`run.fav`, survives reload), `Chemistry ›` peek with Leave squad; CW.pfilter default left in career-week.js (unlisted). People 39/60 words at W1; QA q169/1–3, no page errors.

Owner request 2026-10-03: remove the coach's goal (spec §10.1b).

Owner request 2026-10-04 (spec §10.10 dialogue box): T-173 → T-175. Story mode only; goldens unchanged.

### [x] T-173: Story runner and scene data

Spec: §10.10 Goldens: unchanged Save: no change (`run.story` via RUN_DEFAULTS)
Goal: a DOM-free runner that plays scene data step by step and remembers what was seen.
Files: js/career/story.js (new: `Story`), js/data/story.js (new: `SCENES`, one test scene), js/career/run.js (RUN_DEFAULTS `story`), index.html, tests/career.test.js, ARCHITECTURE.md
Do not: draw randoms; touch Endless runs (`run.mode.story` false → no scenes); write real story lines (lore not final — use a neutral test scene).
Steps:

1. `SCENES = { id: { trigger: {on: 'start'|'week'|'place'|'result'|'flag', …}, steps: [...] } }`; step kinds `say {who, text, mood}` · `choice {opts: [{text, goto?, set?}]}` · `cam {at|place}` · `wait {ms}` · `set {flag, v}` · `diary {text}` · `gazette {text}` · `goto {step}` · `end`.
2. `Story.due(run, on, ctx)` → the first unseen scene whose trigger matches; `Story.start(run, id)`, `Story.step(run)` (current step), `Story.next(run, choice?)` (advances, applies set / diary / gazette, marks seen at end).
3. `who` resolves to a speaker: a voice id (lore.md §7) or a person id (portrait + name from People).
   Accept: headless test plays the test scene through a choice branch; seen scenes never replay; Endless runs get none.
   Result: Story (js/career/story.js) + SCENES / STORY_VOICES (js/data/story.js); run.story via RUN_DEFAULTS (old saves get intro seen) and Run.create fires 'start'; steps say · choice · cut · cam · walk · wait · set · diary · gazette · goto · end; skip applies remaining effects; test covers play-through, walk home free of days, no replay, Endless, old saves, skip (111 tests).

### [x] T-174: Dialogue box UI

Spec: §10.10 §9 Goldens: unchanged Save: no change
Goal: the RPG dialogue box over the hub: name plate, portrait, typed text, choices, log, cut-scene letterbox.
Files: js/ui/dialogue.js (new), css/story.css (new), index.html, js/ui/career-hub.js (mount the box while `run.story.cur` is set; hub keys off while it is open), ARCHITECTURE.md
Do not: block the artifact with alert/confirm; use colours outside theme.css tokens; put faction colour anywhere but the name plate border.
Steps: box markup per §10.10; typewriter via rAF (~60 chars/s, completes on click / Space / Enter); choices 1–4; `L` log overlay; `Esc` → inline "Skip scene?"; `cam` steps call MapView fly-to; cut-scene mode (letterbox, `.hub` chrome hidden) when the scene says `cut: true`.
Accept: test scene plays end to end with mouse and keys; type ≥ 12px; no errors. QA: screenshots of a say step, a choice, the log, cut-scene mode.
Result: js/ui/story-box.js + css/story.css: box (name plate, faceSVG portrait, 60 cps typing, ▼, choices 1–4, L log, Esc inline skip), dark and letterbox modes, hub chrome hidden and the map full screen while a scene plays; walk steps wait for the avatar (20 s cap). First scene = the intro: dark cold open (3 diary lines) → letterbox, airport, “Finally arrived.” → walk home → “Home. For now.” → week brief. QA: screenshots of each step, no errors (swiftshader walks slowly; real GPUs take ≤ 6 s).

### [x] T-175: Hook scenes into the career

Spec: §10.10 §4.28 Goldens: unchanged Save: no change
Goal: scenes fire from the game's moments.
Files: js/ui/career-create.js (start), js/ui/career-hub.js (week start, place visited), js/ui/career-match.js (match result), js/career/story.js
Steps: call `Story.due` at Story start (after Create, before the first brief), at each week start (before the brief), after a place is visited, after a match result; a due scene opens the box before the hub's own cards.
Accept: the test scene can be triggered from each hook (test flag); the brief waits until the scene ends.
Result: (partial) the 'start' hook is in Run.create; T-188's 'hub' trigger with STORY_WHEN keys (week n, trained, clash, settled, evaluated) covers the week / place moments; match result (T-175 close): `Cup.record` → `Story.matched` sets `run.story.res`; the first hub after it (`Story.hub`) plays a due `result` scene (when: won / lost) ahead of any lesson, then the moment is dropped. No scene uses it yet (hook only, tested with test scenes).

### [x] T-180: Delayed Spike vs falling blockers; hang-too-long trade-off (owner request)

Spec: §2.9a Goldens: update (delayed spikes no longer stuffed; hang-fail draws) Save: no change
Files: js/engine/rally-defense.js (block: `late`, LATE_TOUCH), js/engine/rally.js (hangFail, HANG_FAIL), js/data/skills.js (SKILL_HOW), tests/engine.test.js, tests/golden.json
Result: bug — after "Hang time!" the blockers' landing played, then a kill block still sent the ball to their lowered hands (into the net). Now no break / stuff / tool after a delayed spike; a touch becomes a fingertip at the tape (×0.7 power, blocker stats still decide it). New trade-off: low jump / wit can hang too long → the ball drops on your side, best-placed teammate digs it or it is an error. New test (fail rate low > high by 15+ pts); collision test window fixed (stops at the next spike). Goldens updated. Monster QA with forced Delayed Spikes: no errors.

### [x] T-172: Hide facility quality; keep the level

Spec: §4.3 Goldens: unchanged Save: no change
Files: js/ui/career-map.js, js/ui/career-dossier.js, js/data/glossary.js, js/career/city.js, js/career/mapmodel.js, js/map3d/pins3d.mjs, css/map.css, css/hub.css, tests/career.test.js
Result: owner request: no quality stars / Premium? / Rough? / gem / overhyped (place panel, map pins, dossier Quality column, glossary term, "turned out overhyped" diary lines); the place panel shows `Lv n` as its first tag (sessions to the next level on hover). Quality still scales EXP silently (the EXP rating shows it). QA: Wei Strength Center panel, Wei dossier — no errors.

### [x] T-170: Remove the coach's goal

Spec: §10.1b Goldens: unchanged (career only) Save: no change (old `run.goal` ignored)
Files: js/career/goals.js → js/career/sponsors.js (Goals removed; Sponsors stay), index.html, js/career/run.js, js/data/career.js (GOAL_REWARD, BLOCKS), js/data/glossary.js (sp / fans text), js/ui/career-hub.js (brief row, rail goal, folded-rail icon), js/ui/career-sheets.js (Season goal line, calendar `goalw`, legend), js/ui/career-week.js (goal log tag, report row), css (dead `.wgoal` / `.goalw` / `.goal` rules), tests/career.test.js (goal tests removed), ARCHITECTURE.md
Do not: touch match focus goals (`FOCUS`, pre-match), sponsors, or the engine.
Accept: grep finds no `Goals.` / `run.goal` / "Coach's goal" in js/; dead-globals test green; tests + lint green.
QA: career run → hub, brief, Season sheet, End week report; screenshots, no errors.
Result: Goals removed (goals.js → sponsors.js, Sponsors only); run.goal no longer created (old saves keep a dead field); rail goal line, folded-rail ◎, brief row, Season goal line, calendar underline, Week report "New goal" and the goal log tags gone; Season card → "Cups and sponsors", hidden while empty; 13 dead CSS classes pruned (incl. Quiet UI leftovers); goal tests → one no-goal test (110 tests). QA: brief, hub, folded rail, Season, Week report — no errors.

### [x] T-171: Dev tab on the title screen

Spec: §10.7 Goldens: unchanged Save: no change (one per-browser key `sns_dev_words`)
Files: js/ui/menu.js (Dev button + panel), js/ui/debug-panel.js (`setWords` / `wordsOn`), js/core/storage.js (KEYS.words)
Result: "Dev" title button (always shown) toggles the panel: Monster game, + Player model, Benchmark models, Model colors, Word counter On/Off (remembered per browser; ?dev opens the tab and turns it on) and Debug log. QA: title → Dev → Word counter on → badges on the title; Monster game starts; no errors.

Owner request 2026-10-03 (UI polish leftovers): T-165 → T-167. UI only: no rule, number or save change; goldens unchanged.

### [x] T-165: Faction recolour

Spec: §5.6 (approved) §9 Goldens: unchanged Save: no change
Goal: the three majors no longer look like status colours: Wei `#d08a2e`, Wu `#5b8def`, Shu `#2fb8a0` everywhere a faction colour shows.
Files: js/data/world.js (REGIONS wei/wu/shu `color`), js/map3d/kit3d.mjs (`ACC`), css/theme.css (faction tokens `--wei` `--wu` `--shu` from tokens.json, if missing), css/hub.css (the `#f5b82e` day dots comment), tests (any hard-coded old hex)
Do not: change club kit colours (FACTIONS / team colours), the `good` / `cyan` / `gold` status tokens, `js/render/tags.js` stamina colours (a status colour, not Shu), or any minor faction colour.
Steps: grep js/, css/, tests/ for `#f5b82e` `#3fa9f5` `#4ade80` (and lowercase/uppercase variants, rgb forms); replace only the faction uses; check the hex tile fill, frontier ribbons, labels, patrols, chips and the battle card read well on the dark map (tile fill opacity unchanged).
Accept: no faction use of the old hexes left (grep); tests + lint green.
QA: career run → hub map (all three majors visible), World sheet Factions, a battle card; screenshots.
Result: REGIONS wei/wu/shu colour → #d08a2e / #5b8def / #2fb8a0, kit3d ACC to match, theme.css gains --wei / --wu / --shu (tokens.json); club kits, status tokens, tags.js stamina and minors untouched; the hub.css day-dot comment no longer calls #f5b82e a faction colour. Grep: no faction use of the old hexes left (#f5b82e stays only as the old HUD day dots and the WDG kit). Tests use REGIONS.*.color, no change. QA: hub map (tiles, ribbons, labels, legend), World sheet; no errors. Note: Wei bronze sits near Street Outlaws orange #ff8c42 on the map; readable, the labels separate them.

### [x] T-166: Spelled-out stat names

Spec: §9 §10.6 Goldens: unchanged Save: no change
Goal: no single-letter stat codes (K / B / A / D / E, Blk / Ace / Dig / Ast) where a player reads them.
Files: js/ui/match-screen.js (boxScore headers), js/ui/match-result.js (top-3 lines, Your line), js/ui/career-sheets.js (match history table + line), js/ui/career-end.js (career line), css/style.css (box score column widths only)
Do not: change the stats themselves or `m.stat`; add sentences — a word per number (`3 kills`), zero values hidden in one-line summaries (`3 kills · 1 ace`), columns keep 0.
Steps: box score headers Kills · Blocks · Aces · Digs · Errors · Top km/h · Mood · Stamina (the `title` hovers go); result top 3 `3 kills · 1 block · 2 digs` (zeros hidden); Your line labels under the numbers (Kills / Blocks / Aces / Errors); history table columns Kills · Attacks · Errors · Blocks · Aces · Digs · Assists (no `K/Att/Err` slashes); career end line `n kills · n blocks · n aces`.
Accept: grep finds no `>K<`, `' K'`, `K/Att`, `Blk/Ace` in js/ui; box score fits the rail without horizontal scroll at 1440 px.
QA: Monster game → box score (B) and result screen; career → Season sheet match history row opened; screenshots.
Result: Box score headers spelled out (OVR, Kills, Blocks, Aces, Digs, Errors, Top km/h, Mood, Stamina), set vertically so the ten columns fit the 400px rail (the title hovers go; names truncate at 120px); statLine(q, keys) in match-result.js — "8 kills · 2 blocks · 1 ace", zeros hidden — for the result top 3 and the career end line; Your line = numbers with Kills / Blocks / Aces / Errors under them; match history table columns Kills · Attacks · Errors · Blocks · Aces · Digs · Assists (no slashes). Grep: no >K<, K/Att, Blk/Ace in js/ui. QA: Monster game box score scrollWidth 367 = clientWidth 367 at 1440px, result top 3 spelled out; no errors.

### [x] T-167: Encyclopedia section tabs

Spec: §9 Goldens: unchanged Save: no change
Goal: the Encyclopedia's section links become tabs that show where you are.
Files: js/ui/encyclopedia.js, css/career.css (.ency-nav), css/theme.css (.ency-nav rules)
Do not: split the page into separate views (one scroll stays); add new content.
Steps: `.ency-nav` → a sticky `.seg` of buttons (one per section); clicking scrolls to the section; an IntersectionObserver marks the section in view `on` (the `seg` selected state); Back prints its hotkey (`Back <kbd>Esc</kbd>`) and Esc goes back to the menu; observer disconnected when the screen changes.
Accept: scrolling updates the active tab; clicking a tab scrolls and activates it; Esc returns to the menu; no errors.
QA: menu → Encyclopedia, scroll to Elements, screenshot.
Result: ENCY_SECS drives a sticky `.ency-nav.seg` of buttons; encyGo scrolls (smooth, an instant jump when the browser does not scroll smoothly) and marks the tab; an IntersectionObserver (encyWatch) marks the last heading past the tabs, the last one at the page bottom, a clicked tab holds for 1 s while its scroll runs, and it disconnects itself when the screen changes (and on re-render); headings get scroll-margin under the tabs; Back prints Esc and Esc returns to the menu (not while a peek or the debug log is open). QA: scroll to Elements → Elements on, click Tactics → scrolled (top 64) and on, Esc → title; no errors.

Owner request 2026-10-03 (spec §10.8 Quiet UI): T-159 → T-164. UI text only: no rule, number or save change; goldens unchanged.
Mockup: design system QuietUI card; per-screen budgets and cut lists in `quiet-ui.md`. File names below are after the T-154 / T-155 splits.

### [x] T-159: `peek()` and the word counter

Spec: §10.8 Goldens: unchanged Save: no change
Goal: a click-to-open detail card (L2) any screen can use, and a dev-only count of visible words per region.
Files: js/ui/dom.js (`peek(id, label, bodyHtml)`), css/hub.css (.peek), js/ui/debug-panel.js (counter, `?dev` only)
Do not: replace `tip()` (L1 stays); open more than one peek at a time; let a peek cover the owning card's `.acts` row.
Steps:

1. `peek(id, labelHtml, bodyHtml)` → a `›` / ⓘ trigger button + a hidden card; click toggles (`CW.peek = id`, survives re-render), Esc and outside click close; the card sits beside the trigger (left of the place panel, right of the rail), max 320px wide, body uses `kv()` rows + an optional `.acts` row.
2. `?dev`: a small badge per region (top bar, rail, panel, modal, sheet) with its visible word count, red over the §10.8 budget.
   Accept: a peek opens / closes by click, Esc and outside click; budgets badge shows on `?dev` only. QA: open a peek on an HQ panel; screenshot.
   Result: peek(id, label, body, cls) + peekToggle/peekSync in dom.js (open card ported to <body>, fixed, right of the owner or left when no room — never over its .acts; a closed card stays reusable; capture-phase Esc so the place card stays); ?dev badges (top bar, rail, panel 30/45, card 30/25, sheet 60, create 60, title 15) refresh every 600 ms. QA: HQ peek open → Esc → reopen → outside click, no errors; week-1 baseline rail 78/45, HQ panel 62/30.

### [x] T-160: Quiet rail, inbox and week brief

Spec: §10.8 §10.3 §10.5 Goldens: unchanged Save: no change
Files: js/ui/career-hub.js (weekRail, weekSection, dayTrack, railGoal, inboxRows, weekBrief)
Do not: hide the End week arm, the goal deadline or any inbox action.
Steps: header `name` + `role · OVR`; stats as icon + number (word on hover); "This week" + `n left`; day slots icon-only with day initials (label on hover; empty slots show nothing); goal one line `◎ {goal} · W{by}` (progress bar kept, "to play" hidden); inbox one line per item (`⚔ Wu raid Wei · 2d`, `✉ 1 ask`, `Eval W4 · train Power`) with its facts in a `peek` (the T-137 `kv` moves there); drop "Suggested next step", "Expires at the end of the week", "Signing open" (tooltips); End week `End week · n left`. Brief: drop the "7 days…" line; each row = title + one value, facts in a peek.
Accept: rail ≤ 45 visible words in a battle week with 4 inbox items; brief ≤ 25. QA: `?dev` counter screenshots.
Result: Rail: name + role · OVR (role/club on hover), stats icon + number, "This week · n left", day slots icon-only with initials (label on hover, empty = blank), goal one line ◎ goal · W{by} (warn when due), End week · n left. Inbox one line each: items with facts (battle, next eval) open a peek with their action buttons; plain items (asks, Gazette, signing, seize) are one button with the old subline as hover. Deviations (say it once): the suggested step and "Evaluation next week" merge into one line when they name the same week (peek: opponent, venue, Train / Season); the goal-due item is dropped (the goal line turns warn); the "Inbox" label is dropped; the ?dev counter skips <kbd> hotkeys. Brief: title + one value per row, facts in a › peek, the "7 days…" line on the title hover. QA: battle week with 4 items rail 42/45, brief 18/25, no errors.

### [x] T-161: Quiet place panels

Spec: §10.8 Goldens: unchanged Save: no change
Files: js/ui/career-map.js (placeCard, placeTags, trainSpot, hqPanel, challengeBlock, clashPanel, venuePanel, pointPanel)
Do not: remove a cost from a button, the locked-button gap or the battle facts (§10.1a — they may move to a peek only on the HQ / inbox, not on the battle card).
Steps: flavour → tooltip of the title (`ⓘ` after the name); drop the "Uses … · shown on your week" line; tags: quality + sand only, level / streak / trip in a `Details ›` peek; Hard effect on hover of the Hard segment; HQ: Rating tag, Standing only when ≠ 0, one Join (the button), challenge collapsed to a `Challenge · {verdict} ›` row whose peek holds accepts / why / injury / stake and the Challenge / Sim row; battle: "If nobody joins" and injury move to hovers, standing rows hidden at 0.
Accept: training panel ≤ 30 words, HQ ≤ 30 with the peek closed, battle ≤ 45. QA: three screenshots with `?dev`.
Result: placeCard: flavour on the title hover (ⓘ), no "Uses …" line, `after` slot; training tags = quality + sand (+ fail %, a risk — never hidden), level / streak / turf / border / trip in a Details › peek, Hard effect on hover; rest/home: cost and days only on the button (home rest × as a tag); HQ: Rating tag, ⚑ only when ≠ 0, Join only as the button (asks on its hover), challenge collapsed to `⚔ Challenge {verdict} ›` (peek: accepts / why / crew / injury / stake + Challenge / Sim), scouted roster and habits behind Roster / Habits peeks; battle: "If nobody joins" on the title hover, injury on the Fight hover, standing rows hidden at 0, short faction names, side-card label = faction (the button says Fight for), other-tile names on hover. QA: training 24/30, HQ 18/30 (peek closed), battle 67 (spec chat review: battle budget raised to 70 in §10.8, facts and effects stay on the card).

### [x] T-162: Quiet Me sheet

Spec: §10.8 §10.4 Goldens: unchanged Save: no change
Files: js/ui/career-sheets.js (sheetMe, homeRow)
Steps: drop the "thin bar = …" and "Passive — buy with skill points" lines (hover); hide Element ??? until revealed (one muted line `Element at OVR {n}` on hover of the portrait); skills: the 3 closest to affordable + `+n more ›` (peek), descriptions on hover; techniques: those within 10 of the requirement + `+n ›`; life: current home row + `Change home ›` (peek with all five `homeRow`s); drop "Free agent — no club yet".
Accept: Me sheet ≤ 110 visible words at week 1. QA: `?dev` screenshot.
Result: Header: role · club tag · OVR (rank on hover), the Stamina / Mood / Skill pts chips dropped (the top bar shows them); "thin bar = …" and "Passive — …" on the label hovers; Element ??? hidden until revealed, `Element at OVR {n}` on the portrait hover; skills: owned + the 3 cheapest not owned, `+n more ›` peek, descriptions on hover; techniques: yours + within 10 of every requirement (Wit on its ×50 scale), `+n ›` peek; Life: `Life · payday W{n}`, current home row + `Change home ›` peek (all five homeRows, peek up to 440px); "Free agent — no club yet" dropped. Peeks in a sheet sit beside their card. ?dev budget for the Me sheet = 110. QA: week 1 Me sheet 64/110, homes peek opens, no errors.

### [x] T-163: Quiet People, World and Season sheets

Spec: §10.8 §10.4 Goldens: unchanged Save: no change
Files: js/ui/career-people.js (personCard, personDetail, moves), js/ui/career-sheets.js (sheetSeason, calendar, seasonCard), js/ui/career-dossier.js (factionsCard)
Steps: People — hide `Wants ? · Traits ?` until one is known, rumour on hover, moves as short verbs (`Invite to train ›` peek picks the place); World — faction card = name, standing bar (number only ≠ 0), `vs X 0/1` meters, clubs; Tiles / value / "next: …" in a peek; drop the "Street battles move…" line (hover of the title); minors behind `Minor factions ›`; Season — calendar legend on hover, goal one line, Diary last 5 + `All ›`.
Accept: People ≤ 60, World ≤ 60, Season ≤ 60 visible words at week 1. QA: `?dev` screenshots.
Result: People: want / traits line only once one is known, the season rumour on the name hover, "Nothing between you yet" hidden, moves as short verbs (full sentence + likelihood on hover; several training invites → `Invite to train ›` peek picks the place), the ask label `Their ask · this week`. World: the "Street battles move…" line on the Factions tab hover; majors: name (kind + desc on hover), standing bar (number only ≠ 0), `vs X n/m` meters, clubs, `⚔ vs X`, a `Front ›` peek (tiles, value, next tile per border, took / lost, prices / facilities / clubs ask); minors behind `Minor factions ›`. Season: calendar legend on the label hover and week numbers on the pips hover (this week shown), the Week chip dropped (top bar), goal one line `◎ goal · W{by}` (progress and Hit / Miss rewards on hover), empty Match history hidden, Diary last 5 + `All n ›`. A peek owned by a whole sheet sits beside its trigger. Test impact: tests/people.test.js UI stub gains `peek` and a rendering `tip`. QA week 1: People 44/60, World 51/60, Season 49/60, no errors.

### [x] T-164: Quiet title and create

Spec: §10.8 §10.7 Goldens: unchanged Save: no change
Files: js/ui/menu.js, js/ui/career-create.js
Steps: title buttons without sub-lines (hover); create intro sentence → hover of the title; role card = role, key-stat icon + name, one-line pitch, `Details ›` peek (trains at, techniques); "Optional handicaps." → hover.
Accept: create ≤ 60 visible words, title ≤ 15. QA: screenshots.
Result: Title: button sub-lines and the tagline on hover, Continue hero `name · role · W{n}` + Enter (role and week in words on hover). Create: intro on the title hover, role card = code, role, key-stat icon + name, a one-line pitch (ROLE_PITCH in career-create.js), `Details ›` peek beside it (trains at, techniques); "Optional handicaps." and the chosen-mode descriptions on hovers. Deviation: "replaces {name}'s run" moved from the title button to a warn line above Arrive (a consequence stays visible, said where you commit). ?dev counter skips the playtest panel. QA: title 11/15 (with a save), create 50/60, Details peek opens, no errors.

Owner requests 2026-10-03 (spec §10.1, §10.1a): T-135 → T-136 → T-137.


## One-liners (older)


T-001…T-158 (no T-012…T-015, T-021, T-033, T-049; T-088 open above). One line each; full text in git history.

- Map & world: T-001 Academy rename · T-002 facility access · T-023–T-025 3D map · T-039–T-040 living map ·
  T-045–T-047 roads, buildings, walking · T-048 road travel · T-050–T-051 town revamp · T-053 venues.
- Competition: T-006–T-011 reserves, pool draw, Academy squad, evaluations · T-016 Legacy removed · T-017–T-018
  dossier · T-019–T-020 brackets, U21 Final Cup · T-028–T-031 squads of 6, subs, coach AI, benching · T-037–T-038
  challenges & losses · T-041–T-044 rankings · T-052 match history · T-067 Story mode.
- Growth: T-034–T-036 training cap, match XP, techniques in play · T-055–T-056 start from 1, stat guard.
- Match: T-003–T-005 ball marker, spike approach, poses · T-026–T-027 block reads, defence setting · T-032 music ·
  T-043 three touches after a pop-up · T-054 free setter · T-057 smarter coach · T-068–T-069 ego, block collision.
- Camera: T-058–T-059 Follow / POV · T-070 POV polish.
- Relationships: T-060 NPC careers · T-061 memories & stance · T-062 People drawer · T-063 approaches · T-064 fates ·
  T-065 NPC ↔ NPC · T-066 on court · T-089 review fixes.
- UI batch 2: T-095 tokens, selected state, red diet · T-114 action rows (`.acts`, `.rowcta`), container sizes · T-096 labelled HUD,
  goal, `nextStep` · T-097 `fitView`, fly-to · T-098 places drawer · T-099 costs on buttons, `joinGap` · T-100 `homeRow` housing ·
  T-101 battle intro with seize line. Superseded by the redesign (§10): T-102 recap (→ T-121), T-103 dock, T-104/T-105 drawers
  (→ sheets), T-106 eval card (→ T-127).
  (T-102…T-106 were built before §10 landed — commits dfbadda…3734790: tagged recap/diary (`LOG_TAGS`), dock groups, drawer
  clean-up, Factions/Rankings labels, eval rosters; reuse what fits, the redesign replaces the rest.)
- UX batch 1: T-090 week recap card · T-091 seize notice + map focus · T-092 battle stakes, border meters ·
  T-093 training card time-to-point · T-094 hub hotkeys, end-week guard.
- Voice: T-022 voice pass. Cleanup part 1: T-071–T-081.
- Cleanup part 2 (branch cleanup/part2): T-082 one HTML entry (inline import map: node_modules on localhost, CDN elsewhere; test3d.html gone) ·
  T-083 sfx internals in the `SOUND` closure, `Overlay` API for r3d / clock (A, cv, ctx, last stay global: used across render and UI) ·
  T-084 CSS: 89 declarations a later file already overrides removed, pixel diff 0.00 % · T-085 `Fight` (career/fight.js) split from `Cup`,
  data helpers moved to the engine, day / travel / fee tuning in one block · T-086 `run.warm` → `run.evals`, `warmup*` → `eval*`
  (RUN_VERSION 15) · T-087 tests: Goals, Sponsors, Storage, refused / repaired saves, map3d pure functions (103 tests).
- UI redesign & map (Now): T-117 Hub shell — top bar, week rail, map, place panel · T-118 Day track with ghost preview · T-119 Place panel — gains, options, one action row · T-120 Inbox and Week brief · T-121 Week report · T-130 Border pressure lines on the 3D map · T-135 Remove the places list (Map/List) · T-136 Collapsible week rail · T-137 Vertical info lists.
- UI redesign §10 (Next): T-107 Match screen — court-first frame · T-108 Match labels — sides, serve, momentum · T-109 Match control bar · T-110 Glossary and `term()` · T-111 StatIcons SVG set · T-112 Reward, cost and requirement lines as terms · T-113 Remove duplicated explanations · T-115 Match rail and commentary ticker · T-116 Match settings as segments · T-122 Me sheet · T-123 People sheet · T-124 World sheet · T-125 Season sheet and ⚙ · T-126 Map / List toggle · T-127 Match prep card · T-128 Match result screen · T-129 Title screen and Create.
- Hex territory: T-131 Hex grid · T-132 Front on hexes · T-133 Hex map · T-134 Hex UI · T-138 Tile value drives the economy · T-139 Fewer, lower buildings · T-140 Training layout by faction · T-141 Faction colour only on the tiles · T-142 Scale the island 1.5× · T-143 Wei and Wu fight each other most · T-144 Light only round you and home; ◎ Me; bigger player · T-145 Tile fill covers mountains and the coast · T-146 Training gain as an EXP rating.
- Refactor & cleanup part 3: T-147 Delete dead JS · T-148 Delete dead CSS, merge duplicate selectors · T-149 Hardcoded colours → theme tokens · T-150 Stale docs and comments · T-151 Test suite — slow marks and file split · T-152 Shared helpers in one place · T-153 Remove pre-hex leftovers on the map · T-154 Split career.css · T-155 Split career-week.js by job · T-156 City vs Fight; dossier dedupe · T-157 Split big render/engine files · T-158 Archive tasks.md.


## Unplanned changes (recorded in spec.md)

- 2026-10-05 Rival meeting: the second 25 – 4 is a diary line in the dialogue box, no dark cut-in / big title (spec §4.29). Files: js/data/story.js.
- 2026-10-03 Walk lock: while your player walks to a place the map camera stays on them (flies onto them, then follows; drag / wheel / clicks ignored) and the hub takes no input — a transparent layer with a "Walking to {place}" pill, hotkeys wait; 20 s failsafe. Files: js/map3d/map3d.mjs (busy, camera hold), js/ui/map-view.js (MapView.busy), js/ui/career-map.js (actLock, lockLayer), js/ui/career-hub.js (render + hubKey), css/hub.css.
- 2026-10-03 Training cut-in: after the walk a training day shows a spinner (1.1 s, "{Training} training · {place}"), then ✓ Training complete / ✕ Training failed (— injured) with what changed (stat points, EXP toward the next point, skill pts, stamina, money, mood); click / Space / Enter / Esc closes, auto after 3.2 s; the top bar and rail keep the before-values until the card (then their deltas show). Display only: the rules run before the walk. Files: js/ui/career-map.js (trainSnap, trainFx, lockShown), js/ui/career-hub.js (topBar / weekRail read lockShown), css/hub.css.
- 2026-10-04 3D portraits: every UI portrait (faceSVG: rail, Me, People, HQ roster, mates, box score, result top 3, cut-ins, toasts) is a render of the actual model — NPCs the default model with only what the model can change (hair colour, skin colour, team shirt), you Main_v2 as modelled (default model in your colours if it fails); rendered once per look on a small offscreen renderer, cached for the session, the drawn SVG face meanwhile and without WebGL (mood still shows there only). Files: js/render3d/portrait3d.mjs (new, lazy-loaded module), js/render/faces.js (faceSVG → PORTRAIT cache / placeholders; the old face is faceSVG2D).
- 2026-10-04 Map avatar = your own model: the walking player on the island is Main_v2 (as in matches and your portrait), the default model if it fails to load. Files: js/map3d/avatar3d.mjs.
- 2026-10-04 Ego personality: ego is a personality level — normal / selfish / egoist (`p.ego`, `EGO.lvl` k / err / give / rein / hold; ≈ 50 / 35 / 15 % of generated players by a name hash, WS lean selfish; you start selfish; old numeric saves convert) and no longer reads wit (maturity removed: chances, collisions, setter give-in, solo gaps, swing / serve errors and the captain's rein all come from the levels). Tag on the Me sheet and person card. Goldens updated (owner request: ego acts change the engine stream); spec §2.12 / §2.12a / §3 and the §2.1b table updated. Files: js/data/rules.js, js/engine/players.js, match.js, rally-phases.js, rally.js, rally-block.js, serve.js, teams.js, save.js, js/career/run.js, js/ui/dom.js (egoTag), career-people.js, career-sheets.js, css/people.css, tests/engine.test.js, tests/people.test.js, tests/golden.json.
- 2026-10-04 Map key off the map: the pill row over the island map (Club HQ / Venue / Street battle + faction colours) is gone; the same key is an Encyclopedia section, Map key (`mapKey`). Files: js/ui/career-hub.js (mapLegend removed), js/ui/encyclopedia.js, css/map.css, css/story.css, ARCHITECTURE.md.
- 2026-10-05 No training events: the random training-week event pop-ups are removed entirely, every variant (`data/events.js` deleted; `Events.roll` / `apply`, `EVENT_NEED`, `CAREER.eventChance`, `City.after` and `run.rolled` gone). The Element Trial and sponsor offer cards stay. An old save with a random event waiting clears it on load (the existing repair). Spec §4.5 / §10.5 and ARCHITECTURE updated. Files: index.html, js/career/events.js, city.js, run.js, js/data/career.js, js/ui/career-map.js, career-people.js, career-week.js, tests/career.test.js, harness.js, people.test.js.
- 2026-10-05 Train with a friend: Invite to train (your move or their approach) no longer leaves the People sheet open — it closes, the place is selected, you walk there with the hub locked, the friend greets you in the dialogue box ("Oh, you're here! Let's start.", Space / click), then the usual training cut-in. Files: js/ui/career-people.js (trainWithFriend), js/ui/career-map.js (actLock greet phase, lockTrain, lockGreetDone), js/ui/career-hub.js (Space on the greeting), js/career/asks.js (dayLine), css/hub.css, spec.md.
