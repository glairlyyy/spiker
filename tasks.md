# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. **Later** items are outlines: the spec chat details them
(files, steps, accept) and moves them to Now. Next free id: **T-178** (T-088 is open below).

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

## State (2026-10-03)

Everything through T-158 is built (110 tests, RUN_VERSION 17): match engine and 3D playback, career (28 weeks, pools,
evaluations, U21 Cup, Story mode, growth, relationships), UI redesign §9–§10, hex territory and economy §4.27, island
× 1.5, cleanup parts 1–3. Done tasks are one-liners under **Done**; full text in git history.

## Now

Owner request 2026-10-04 (spec §10.7a, design system TitleScreen card): T-176 → T-177. UI only; goldens unchanged.

### [ ] T-176: Title screen layout as the TitleScreen mockup
Spec: §10.7a          Goldens: unchanged          Save: no change
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
Result:

### [ ] T-177: 3D court backdrop on the title screen
Spec: §10.7a          Goldens: unchanged          Save: no change
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
Result:

Owner request 2026-10-03 (spec §10.9): T-168 → T-169. UI only: no rule or number change; goldens unchanged.

### [ ] T-168: Sign only at the HQ; World tab My club

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
  Result:

### [ ] T-169: People as one list with markers and favourites

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
  Result:

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

### [ ] T-175: Hook scenes into the career

Spec: §10.10 §4.28 Goldens: unchanged Save: no change
Goal: scenes fire from the game's moments.
Files: js/ui/career-create.js (start), js/ui/career-hub.js (week start, place visited), js/ui/career-match.js (match result), js/career/story.js
Steps: call `Story.due` at Story start (after Create, before the first brief), at each week start (before the brief), after a place is visited, after a match result; a due scene opens the box before the hub's own cards.
Accept: the test scene can be triggered from each hook (test flag); the brief waits until the scene ends.
Result: (partial) the 'start' hook is in Run.create; week / place / result hooks still to do.

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

## Later — outlines

Features (spec first):

- Faction events that change the map (spec §4.24, draft — owner to confirm).
- Endless mode (spec §4.26: no guarantees; national call-up by grades).
- Living map layers B / C (spec §4.16: individual figures, approaches on the map).
- Balance pass (spec §4.10 condition values, §5.5 severe injury, hype frequency §2.3).

Cleanup, part 2: T-082…T-087 done (see Done). Open:

- T-088 [?]: Big binaries — keep base64 for the artifact but store .glb/.mp3 in Git LFS and generate the .txt at publish.
  Question: today `assets/vrm/*.glb.txt` (18 MB of base64 text) and the .mp3 sit in plain git. Moving them to LFS means either
  `git lfs migrate import` (rewrites history, needs a force push) or LFS only for new commits (old blobs stay). Which? Also confirm
  LFS is enabled for glairlyyy/spiker and that the artifact publish step may decode/encode (`base64 -d` / `base64`) at publish time.

## Done

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

## Unplanned changes

(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md)

- 2026-10-03 Walk lock: while your player walks to a place the map camera stays on them (flies onto them, then follows; drag / wheel / clicks ignored) and the hub takes no input — a transparent layer with a "Walking to {place}" pill, hotkeys wait; 20 s failsafe. Files: js/map3d/map3d.mjs (busy, camera hold), js/ui/map-view.js (MapView.busy), js/ui/career-map.js (actLock, lockLayer), js/ui/career-hub.js (render + hubKey), css/hub.css.
- 2026-10-03 Training cut-in: after the walk a training day shows a spinner (1.1 s, "{Training} training · {place}"), then ✓ Training complete / ✕ Training failed (— injured) with what changed (stat points, EXP toward the next point, skill pts, stamina, money, mood); click / Space / Enter / Esc closes, auto after 3.2 s; the top bar and rail keep the before-values until the card (then their deltas show). Display only: the rules run before the walk. Files: js/ui/career-map.js (trainSnap, trainFx, lockShown), js/ui/career-hub.js (topBar / weekRail read lockShown), css/hub.css.
- 2026-10-04 3D portraits: every UI portrait (faceSVG: rail, Me, People, HQ roster, mates, box score, result top 3, cut-ins, toasts) is a render of the actual model — NPCs the default model with only what the model can change (hair colour, skin colour, team shirt), you Main_v2 as modelled (default model in your colours if it fails); rendered once per look on a small offscreen renderer, cached for the session, the drawn SVG face meanwhile and without WebGL (mood still shows there only). Files: js/render3d/portrait3d.mjs (new, lazy-loaded module), js/render/faces.js (faceSVG → PORTRAIT cache / placeholders; the old face is faceSVG2D).
