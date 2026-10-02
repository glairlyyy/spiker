# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. **Later** items are outlines: the spec chat details them
(files, steps, accept) and moves them to Now. Next free id: **T-130** (T-088 is open below).

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

Everything through T-101 + T-114 and cleanup part 2 (T-082…T-087) is built (103 tests, RUN_VERSION 15).
Built areas: match engine (ego, block collision, subs/coach, stamina, elements, hype, 3D playback, Follow/POV cameras),
career (free agent start at 1, pools/evaluations/U21 cup, Story mode, growth & techniques, challenges & injuries,
rankings, roads/travel/town/venues, living map A, relationships T-060…T-066), voice pass, cleanup part 1,
UX batch 1 (T-090…T-094).

## Now

Redesign (spec §10; design system pages _Redesign_, _UI inventory_; mockups in the _Redesign_ group). Layout and flow only:
no rule, number or engine change; goldens unchanged. Read §10, §9 and the mockup card each task names before coding.
Order: T-117 … T-129. Built on UI batch 2 (T-095…T-101, T-114 done — reuse their helpers); T-102…T-106 superseded (see Done).

### [x] T-117: Hub shell — top bar, week rail, map, place panel

Spec: §10.1 Goldens: unchanged Save: no change
Goal: the hub uses the new frame; every old drawer is still reachable while the sheets are built.
Files: js/ui/career-hub.js, js/ui/career-map.js (spotCard → panel container), css/career.css, css/theme.css, index.html (header only)
Do not: change drawer content yet (T-122…T-125); remove keyboard shortcuts; change map3d.
Steps:

1. Hide `.top` site header on `career` and `match` (body class); `.hub` becomes a grid: top bar 56px / rail 340px + map.
2. Top bar: brand, Week n/28, Money, Fans, Skill pts, Stamina (bar + number), Mood — word labels; tabs Me 1 · People 2 · World 3 · Season 4 and ⚙. Until the sheets exist, tabs open the old drawers: Me → me, People → people, World → factions, Season → season; ⚙ → menu. Keys 1–4 map to tabs.
3. Rail: you (face, name, role, team chip, OVR) + 4 stat mini bars (click → Me); placeholder sections for the day track (T-118) and inbox (T-120); action row = End week (two-click arm + Space kept).
4. Place card (`#spot`) becomes the right panel: 448px, top 16px, right 16px, same `spotPanel` content.
5. Move T-096's pieces: `hudRes` rows → top bar (keep the one-render deltas), `hudGoal` → rail goal card, `nextStep` → first inbox row (T-120); then remove `hudClock`, `hudMe`, `hudBar` and the dock. The places drawer (T-098) moves into the map's List mode (T-126).
   Accept:

- HubRedesign mockup's frame matches at 1440×900; every old drawer opens from a tab or ⚙; no dock, no floating corners.
  QA: career run → hub, each tab, a place; screenshots.
  Result: done — `topBar` (brand, Week n/28 or the cup, labelled Money/Fans/Skill pts/Stamina bar/Mood with one-render deltas, tabs Me 1 · People 2 (asks badge) · World 3 · Season 4 → me / people / factions / season drawers, ⚙ → menu which now lists every other drawer); `weekRail` (you + 4 stat bars → Me, "This week · {type}" + days left + 7 slots (T-118 fills them), coach's goal card with bar → Season, Inbox (nextStep until T-120), End week action row with the two-click arm + Space); map right of the rail under the bar; place card = 448px right panel; drawers / cards / notes over the map area; hudClock, hudMe, hudBar, the dock and its groups removed; keys 1–4 = tabs. The site header was already covered by the fixed hub (no index.html change). QA: 1440×900 hub, place panel, ⚙, key 3 → World; no pageerror.

### [x] T-118: Day track with ghost preview

Spec: §10.2 Goldens: unchanged Save: `run.days` via RUN_DEFAULTS (no version bump)
Goal: the rail shows the 7 days of the week — what each spent day was, trips hatched, free days empty — and a selected place's cost as ghost slots.
Files: js/career/run.js (RUN_DEFAULTS `days`, clear at week start), js/career/city.js (push to `run.days` wherever City.spend is called with a reason), js/ui/career-hub.js (`dayTrack`), js/ui/career-map.js (ghost from the selected place), css/career.css, tests/career.test.js
Do not: change how many days anything costs; draw randoms.
Steps:

1. `run.days`: `[{k: 'train'|'rest'|'outing'|'trip'|'scout'|'battle'|'challenge'|'travel', label, stat?}]`, appended in the same order days are spent; reset where the week rolls over.
2. `dayTrack(run, ghost)`: 7 slots Mon–Sun from `run.days` + ghost slots (`City.cost` / `City.trip` of `CW.spot`) as dashed `cyan`; eval/cup weeks: one "Match" slot.
3. Test: training with a 1-day trip appends `trip` then `train`; a new week starts empty.
   Accept: train at a far place → slots Trip + Train fill; selecting another place shows its ghost slots.
   QA: career run → train twice, select a place; screenshot of the rail.
   Result: done — deviation: the list is `run.dayLog` (`run.days` is already the days-left number; spec §10.2 updated) via RUN_DEFAULTS, cleared in Run.endWeek; `City.go(run, p, what)` + `City.logDays` push trip days then the day (`City.dayWhat(id)` for places; scout / refused challenge / watch in city.js; challenge and street fight in fight.js — one extra file); travel-only logs trips. `dayTrack` (Mon–Sun, spent days with icon + label, trips hatched, ghost slots dashed cyan from `spotGhost(run, CW.spot)` + "Uses Fri — shown on your week", match weeks one slot); mapPick refreshes the week section. Test: trip then train, one entry per day, empty after endWeek (105 tests). QA: 2 trainings + Pier selected → Trip · Power · Trip · Defense · ghost Jump; no pageerror.

### [x] T-119: Place panel — gains, options, one action row

Spec: §10.1 §9.1 §9.8 Goldens: unchanged Save: no change
Goal: every place kind uses the HubRedesign panel anatomy: header (region · kind, name, tags), one flavour line, gain rows, options, one action row, the "uses {days}" line.
Files: js/ui/career-map.js (spotPanel, trainSpot, hqPanel, venuePanel, pointPanel, clashPanel, challengeBlock), css/career.css
Do not: change City.can / Training.preview / Front.stakes; drop any action.
Steps: keep T-099's button text and Hard label; gain rows from `Training.preview` (main/side `+1 now` / `+1 in N sessions`, skill points); Normal/Hard as a segment with the Hard effect inline; teammates as chips; action row `[Train {stat} · days · stamina · $] [Travel only · days]`; HQ: Dossier / Sign (gap) / Scout in one row, challenge block below as its own sub-section with its own row; battle: the two Fight-for buttons as the row, stakes under each.
Accept: no place card has a CTA outside its action row; the panel never scrolls at 900px for a training spot.
QA: training spot, HQ, battle site, travel point; screenshots.
Result: done — `placeCard({region, kind, title, tags, flavour, body, opts, row, split})` (career-map.js) = one anatomy for every kind: label (region chip · kind), 20px title, pill tags (`ptag`, `placeTags`: quality, sand, Lv, streak, turf, fail %, border/seized, trip), flavour line, body, options, ONE `.acts` row, "Uses Mon + Tue · shown on your week" from the same ghost as the day track. Training: gain rows (main / side `+1 now` / `+1 in N sessions`), Normal / Hard segment with the Hard effect inline, teammate chips (+20% / +50%), row `[Train {stat} · d · −sta · $] [Travel · d]`; rest / outing / street / travel point / venue on the same card; HQ row `[Sign or gap] [Scout · d] [Dossier]` + the challenge as its own sub-section with its own row; battle row `[Watch · d] [Fight for A] [Fight for B]` with the stakes in two columns above and Sim as an option. Class `.plc` (`.pcard` was taken by People). QA: Pier (no scroll, 254px), Wu Harbor HQ, battle site, travel point at 1440×900; no pageerror.

### [x] T-120: Inbox and Week brief

Spec: §10.3 §10.5 Goldens: unchanged Save: no change (brief "seen" in CW)
Goal: one card at each week start lists what the week holds; the rail inbox keeps unhandled items with one button each.
Files: js/ui/career-hub.js (hubCard order, `weekBrief`, `inbox`), js/ui/career-week.js (gazette / clash / eval entry points), css/career.css
Do not: change when events roll or when a clash happens; make anything act on its own.
Steps:

1. `weekBrief(run)` replaces the clash intro (reuse T-101's title and seize line) and the Gazette pop-up: rows for street battle (sides, site, seize meter), payday (Gazette summary), coach's goal (progress, due), match (eval/cup). Buttons: `Start the week` + `Read the Gazette` (Season sheet / news drawer), or `Go to match prep` in eval/cup weeks. Shown once per week (`CW.briefWeek`).
2. `inbox(run)`: battle this week → select the battle pin; approaches waiting (`Asks.count`) → People; Gazette unread → Season; match next week → Season calendar; goal due ≤ 1 week → Season; a club would sign you → World/Clubs; a place changed hands (T-091 note) → select it. Max 5, newest first.
3. Remove dock badges and the toast (the day track + inbox replace them).
   Accept: week start shows the brief with every applicable row; closing it leaves the items in the inbox; nothing happens until the player clicks.
   QA: career run → a clash week and a payday week; screenshots.
   Result: done — `weekBrief` (once per week / cup round, `CW.briefWeek` = `briefKey`): title by week type, one line, rows for the match (eval / cup), street battle (sides, site, Seize n/2, the place a win takes), payday + Gazette, coach's goal (progress, due, warn ≤1 week), evaluation next week; `[Start the week]` or `[Go to match prep]` + `[Read the Gazette]` (opens the Gazette drawer, marks read). `briefDone` sets the old `clash.seen`. hubCard order: event → week report → brief → cup / eval card; the battle intro and Gazette pop-up are gone. Inbox (`inboxRows`, max 5): next step → battle (View → select pin) → approaches (People) → Gazette (Read) → evaluation next week → goal due ≤1 week → club would sign → places that changed hands (`CW.seizes`, kept a week). Toast and seize banner removed; a refused action shows as a bad inbox row for one render (`CW.flash`, career-people.js toastBlocked — one extra file). QA: week 1 brief with battle + payday + goal rows; inbox after closing; no pageerror.

### [x] T-121: Week report

Spec: §10.5 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (recapCard, endWeekUI), css/career.css
Steps: rows ordered penalties (goal missed, mood down, money below 0) in `bad` → your week as chips (stats, skill pts, money, fans, bonds) → new goal → island news (battles, seizes, stars); title "Week n report"; one `Next week` button that then shows the next Week brief.
Accept: a missed goal is the first row. QA: career run → miss a goal (set `run.goal.by = run.week`), End week.
Result: done — `recapCard` is the Week report (every week): "Week n report" + a headline (rough / good / quiet), penalty rows first in bad (✕), "Your week" chips over the whole week (stats, money, fans, skill pts, standing, bonds — baseline `weekSnap` taken at the week's first hub render, `CW.snap`), New goal, On the island (places that changed hands + world lines); `Next week` → the Week brief. QA: missed goal → first row in bad; chips Money −$8 · Defense +18 · Speed +7 · Skill pts +5 · Bond …; Next week opens the brief; no pageerror.

## Next

### [ ] T-122: Me sheet

Spec: §10.4 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (youCard, elementLine, skillShop, lifeCard → `sheetMe`), js/ui/career-hub.js (sheet host), css/career.css
Steps: sheet host = overlay over the map area (rail and top bar stay), Esc / tab closes; three columns as SheetMe: stats with `n / cap` and next-point progress + Wit + Leadership + element; skills (passive rows with price and gap in a `.rowcta` column; techniques with requirements); life (reuse T-100's `homeRow`; payday line). Physio and sponsors where youCard/seasonCard had them.
Accept: Player, Skills and Life drawers are gone; Me tab and key 1 open the sheet. QA: screenshot vs SheetMe.
Result:

### [ ] T-123: People sheet

Spec: §10.4 Goldens: unchanged Save: no change
Files: js/ui/career-people.js, js/ui/career-week.js (bondCard, chemBlock), css/career.css
Steps: filters Everyone / Squad / Rivals / Waiting n; left list (waiting first, squad with bond bar + stance, bench, others, gone); right detail = personCard content (wants, traits, season, sides, memories) + their ask with Accept / Decline / More moves (Asks.moves) as one action row; chemistry and Leave squad under the Squad filter.
Accept: Team and People drawers are gone; an approach can be answered from the detail. QA: screenshot vs SheetPeople.
Result:

### [ ] T-124: World sheet

Spec: §10.4 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (factionsCard, clubsCard, rankCard), js/ui/career-dossier.js, css/career.css
Steps: tabs Factions (5 cards: standing bar −100…+100 with the number, labelled border meters, Dossier opens in place) · Clubs (reuse `clubsCard` rows with `joinGap`, signable first) · Rankings (Register / Gazette / Street; you ± 5 + top 5, "Show unrated").
Accept: Clubs, Factions and Rankings drawers and the dossier pop-up are gone. QA: screenshots of the 3 tabs.
Result:

### [ ] T-125: Season sheet and ⚙

Spec: §10.4 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (calendar, seasonCard, matchLog), js/ui/career-hub.js (diary/news/menu), css/career.css
Steps: calendar of 28 + cup cells with week number, type word (Eval / Camp), goal week mark, current week selected; goal card; sponsors; match history; Diary / Gazette tabs. ⚙ pop-over: Main menu, Debug log (only with `?dev`), Abandon run (inline confirm).
Accept: no drawer remains; HUB_DRAWERS removed. QA: screenshot vs SheetSeason.
Result:

### [ ] T-126: Map / List toggle

Spec: §10.1 §4.4 Goldens: unchanged Save: no change
Files: js/ui/career-hub.js (places drawer → list mode), js/ui/career-map.js, css/career.css
Steps: fitView and fly-to are done (T-097). Add a Map/List segment top-left of the map: List = the T-098 places list rendered in the map area (no drawer) → click selects (panel opens, camera flies); legend chips at the bottom; remove the `places` drawer.
Accept: List selects places; no places drawer. QA: screenshots.
Result:

### [ ] T-127: Match prep card

Spec: §10.5 §9.8 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (evalPanel, cupPanel, matchPrep, rankBest), css/career.css
Steps: two roster columns (you highlighted), lineup sentence (`On the bench — {name} rates higher (x vs y)`), focus as a selected segment labelled "Pick one", captain talk the same, rewards line, bracket on top for cups; action row (`.acts.pri`) `[Play 2fr] [Sim 1fr]`.
Accept: fits 900px height without scroll. QA: week 4 evaluation; screenshot.
Result:

### [ ] T-128: Match result screen

Spec: §10.6 Goldens: unchanged Save: no change
Files: js/ui/match-screen.js (finishMatch, podium, matchStars), js/ui/career-week.js (playCareer onFinish message → data), css/style.css
Do not: change rewards or XP math; the `onFinish` message stays available for Monster game.
Steps: after the final (same delay), replace the podium overlay with a full result layout as MatchResult: headline, grade tile + your K/B/A/E + focus result, rewards chips, growth rows, techniques picked up, top 3, `[Continue] [Box score]`. Monster game: headline + top 3 + `[Back to menu]`.
Accept: career match ends on the result screen; Continue returns to the hub (report or next card). QA: career evaluation (watch); screenshot.
Result:

### [ ] T-129: Title screen and Create

Spec: §10.7 Goldens: unchanged Save: no change
Files: js/ui/menu.js, js/ui/career-create.js, css/career.css, index.html (header)
Steps: Title as TitleScreen (Continue hero with name · role · week; New career; Encyclopedia; Settings → match settings defaults; Playtest card only with `?dev`). Create as CreateCareer: role cards (key stat, best places from SPOTS by `train`, techniques from Skills.forRole), name + Random, challenge toggles, `[Arrive on the island] [Back]`.
Accept: no Playtest card without `?dev`; role card data comes from game data, not hard-coded text. QA: screenshots.
Result:

### Match screen and short copy (after T-129)

### [x] T-107: Match screen — court-first frame

Spec: §9.9 Goldens: unchanged Save: no change
Goal: the match fits the viewport with no scroll; the court is as large as the space allows.
Files: js/ui/match-screen.js (startMatch markup, fit, finishMatch), css/style.css, css/theme.css
Do not: change playback, camera, render3d or overlay drawing; change the canvas ratio (1000:440).
Steps:

1. `.match` escapes `.wrap` (full viewport width, 24px side padding); `.top` hidden while `G.view === 'match'` (body class `inmatch`).
2. Score band 64px: boardTeam = swatch + name + rotation chips; the server chip gets class `sv` (gold) and the word "serve" (board()); score in Rajdhani 48px with rulesText small beside it.
3. Momentum row 20px: label "Momentum", bar, "In the zone: {team}" (z0/z1 merged into one span, team colour when lit).
4. `.stage` width = `min(100vw - 48px, (100vh - 168px) / 0.44)`, centred; `fit()` unchanged (reads clientWidth).
5. `.feeds` leaves the page flow: keep `#log` / `#box` in the DOM inside a hidden container (T-115 moves them into the rail) so logLine / boxScore keep working.
   Accept:

- 1280×720, 1440×900, 1920×1080: no page scroll; court 1232 / 1392 / 1872 px wide.
- npm test / lint pass; no pageerror.
  QA: Monster game at the three sizes; screenshots.
  Result: done — header hidden and `.wrap` full width via `:has(.match)` (no body class needed); score band 64px (swatch + name + rotation chips, server chip gold with "serve"), Rajdhani 48px score with the rules text beside it; Momentum row 20px with a label and one "In the zone: {team}" span (`#zone`, team colour); court `min(100vw − 48px, (100vh − 168px) / 0.44)` centred; `.feeds` kept in the DOM but hidden until T-115. QA: Monster at 1280×720 / 1440×900 / 1920×1080 — no page scroll, court 1232 / 1392 / 1872 px; no pageerror.

### [x] T-108: Match labels — sides, serve, momentum

Spec: §9.1 §9.9 Goldens: unchanged Save: no change
Files: js/render/tags.js, js/ui/match-screen.js (board), css/style.css
Do not: change OP red / star gold tag colours or tag positions.
Steps: name tags get a 2px underline in the team colour (A.m.t[side].color) and 12px minimum text; serve marker reads "serve" in the score band; nothing on screen is an unlabeled dot or bar.
Accept: in a Monster game (all OP) both sides are told apart by underline. QA: Monster game screenshot.
Result: done — tags.js: a team-colour underline under every role tag (OP red / star gold text unchanged) and a 9-court-unit font floor (≈12 CSS px on a 1392 px court); score band: server chip reads "serve", momentum bar labelled, zone as "In the zone: {team}" (T-107). QA: all-OP Monster game — sides told apart by underline; no pageerror.

### [x] T-109: Match control bar

Spec: §9.8 §9.9 Goldens: unchanged Save: no change
Files: js/ui/match-screen.js (startMatch controls, timeoutButton, updTO, finishMatch, .fsbar), css/style.css
Do not: change reqTO / setTactic / setDefence behaviour.
Steps:

1. One 48px bar: `Play` (Pause, 1×/2×/4× segment with the selected style, Skip) · `Your team` (Timeout, Tactics → opens the rail's Tactics tab after T-115, the pop-over until then) · View group `margin-left:auto` (Camera, ⛶, sound, ⚙). Group labels in `label` style. All buttons 40px.
2. Your side = the team whose squad holds `Run.you(RUN)` (career); only it gets Timeout/Tactics. No side (Monster game): both, each with a 4px team-colour edge and the team short name.
3. After the final: Pause / speeds / Skip / Timeout disabled.
4. Fullscreen `.fsbar` reuses the same bar markup.
   Accept: career match shows one Timeout; Monster shows two, colour-coded; everything on one line at 1280 wide.
   QA: career evaluation (watch) + Monster game; screenshots.
   Result: done — one 48px `.cbar`: Play (Pause with `Space` printed, 1×/2×/4× segment, Skip) · Your team (Timeout + Tactics pop-over; the side holding `Run.you(RUN)` in career fixtures, both sides labelled "Teams" in the Monster game; timeouts carry a 4px team-colour edge) · View right-aligned (Camera cycle, ⛶, sound, ⚙); 40px buttons; playback buttons disabled after the final. Deviation: the fullscreen `.fsbar` keeps its compact score + playback strip (sharing the bar's markup would duplicate the timeout ids); it shares the disabled-after-final rule. QA: 1280 wide — one line (scrollWidth = clientWidth 1232), Monster 2 timeouts, career evaluation 1; no pageerror.

### [x] T-115: Match rail and commentary ticker

Spec: §9.9 Goldens: unchanged Save: no change
Files: js/ui/match-screen.js (startMatch, logLine, boxScore, togglePause, finishMatch, new `railOpen`), css/style.css
Do not: change what logLine / boxScore record; drop any log line.
Steps:

1. Ticker on the stage: the last 2 `logLine` entries, `hud` surface, bottom-left, max 520px, fades older line to `mute`.
2. Rail: 400px overlay from the right (same look as the hub drawer), tabs Commentary (the existing `#log`) · Box score (`#box`) · Tactics (tacticPicker/defencePicker as labelled rows `Tactic` / `Defence` with the current call; your side first, or both in Monster). Key B and the "Commentary · Box score (B)" chip toggle it; Esc closes.
3. Opens itself on pause and after the final; closes on resume.
   Accept: the full log and box score are reachable without scrolling the page; ticker updates every point.
   QA: Monster game — pause, B, Tactics tab; screenshots.
   Result: done — `#ticker` on the court (hud, bottom-left, max 520px): the last 2 log lines, older in mute, updated by logLine; `#mrail` 400px fixed overlay, tabs Commentary (`#log`) · Box score (`#box`) · Tactics (labelled Tactic / Defence rows; your side only in career, both in Monster) via `railOpen(tab|undefined toggle|null close)`; opens on pause (closes on resume) and on the Box score tab after the final; key B toggles, Esc closes; the bar's Tactics button and a `Commentary · Box score B` chip open it (the Tactics pop-over is gone — no duplicate select ids). QA: Monster — ticker, pause opens the rail, Tactics tab; no pageerror.

### [x] T-116: Match settings as segments

Spec: §9.8 §9.9 Goldens: unchanged Save: no change
Files: js/ui/match-screen.js (settingsMenu, cycleHype, cycleGfx, toggleCutins, toggleCamera, toggleCam3D), css/style.css
Do not: change what each setting does or its storage.
Steps:

1. settingsMenu: each setting a labelled `.seg` showing every option — Hype (HYPE keys), Cut-ins Full/Mini, Zooms On/Off, Graphics (GFX keys), Camera (CAM3 keys; the follow `<select>` shows under it for Follow/POV), Volume. Clicking an option sets it directly (keep the cycle functions for hotkeys if any use them).
2. The pop-over opens upward and right-aligned to ⚙.
3. Results: replaced by the result screen (T-128).
   Accept: every setting's options visible at once.
   QA: Monster game — ⚙ open; screenshot.
   Result: done — `settingsMenu` = labelled segments showing every option (Hype, Cut-ins, Zooms, Graphics, Camera + the follow select, Volume); `setOpt(kind, v)` sets one directly with the same storage keys and redraws the pop-over (cycle functions kept); the pop-over opens upward, right-aligned to ⚙ (380px). Results card: one `.acts.pri` row — [Continue / fx.back] + [Box score] (opens the rail tab); timeouts and playback disabled after the final. QA: Monster — ⚙ open, Graphics → Fast applied; finished match card + rail; no pageerror.

### [ ] T-110: Glossary and `term()`

Spec: §9.4 §9.6 Goldens: unchanged Save: no change
Files: js/data/glossary.js (new — add to index.html after people.js), js/ui/dom.js (`term`), js/ui/encyclopedia.js (Glossary tab), tests/career.test.js
Do not: show old-language words (§6); write "why" text (registrar voice).
Steps: `GLOSSARY = { id: { icon, short, long } }` for every §9.6 id; `term(id, n?, cls?)` → `<span class="term" data-tip="{long}">{icon}{signed n}</span>` (number coloured by sign); Encyclopedia tab "Glossary" listing icon · alias · long. Test: every id used by `term(` in js/ui exists in GLOSSARY.
Accept: test passes; Glossary tab renders all ids. QA: Encyclopedia screenshot.
Result:

### [ ] T-111: StatIcons SVG set

Spec: §9.5 Goldens: unchanged Save: no change
Files: js/ui/icons.js (ICON entries + `statI(k)`), js/data/glossary.js (icon = statI key), js/ui/career-hub.js (hudRes, hudBar)
Steps: add the 15 line icons from the StatIcons preview (16×16 viewBox, stroke currentColor, 1.6 width) to ICON; GLOSSARY icons use them; HUD rows get icon + word; Stamina and Speed never share a glyph.
Accept: no ⚡/✨/📣 left in hudRes. QA: hub screenshot.
Result:

### [ ] T-112: Reward, cost and requirement lines as terms

Spec: §9.4 Goldens: unchanged Save: no change
Files: js/ui/career-map.js, js/ui/career-week.js, js/career/training.js (addXp label only), js/ui/career-people.js
Do not: change any number or rule; change log text other than training labels.
Steps: rebuild with `term()` — training button/preview and `Training.addXp` log label (`⛉+1`), coach's goal reward, evaluation/cup reward tips, street battle stakes, club join gaps, skill costs. Cost → result order. Examples: short-copy.md "Before → after".
Accept: the coach's goal reward reads `Hit ◆+40 fans+300 mood↑ · Miss mood↓` as icons. QA: training card, Season drawer, eval card.
Result:

### [ ] T-113: Remove duplicated explanations

Spec: §9.4 Goldens: unchanged Save: no change
Files: js/ui/career-map.js, js/ui/career-week.js, js/ui/match-screen.js, js/ui/career-create.js
Steps: replace repeated sentences with the term alias — Sim (×5), Grade (×2), seize (×3), standing (×4), border place, quality (overhyped/hidden gem), together (teammate bonus); tooltips keep only numbers specific to that place/match. Grep each phrase listed in short-copy.md "Aliases" to zero repeats.
Accept: each listed phrase appears once (in GLOSSARY). QA: spot cards + eval card.
Result:

## Later — outlines

UI polish (spec §9, design system fix-plan Batch 7) — spec chat details when Now/Next are done:

- Faction recolour (§5.6 — owner approval first).
- Main menu: Continue as the hero card when a save exists; Playtest card + Debug-log badge behind `?dev`.
- Create: replace the all-1 stat bars with a role explainer; hide the Mode control until Endless exists.
- Podium and box score: spelled-out stat names. Encyclopedia: section tabs show the current section.

Features (spec first):

- Faction events that change the map (spec §4.24, draft — owner to confirm).
- Endless mode (spec §4.26: no guarantees; national call-up by grades).
- Map: draw each border's pressure as a line on the 3D map (needs map3d work; T-092 does the drawer / battle card first).
- Living map layers B / C (spec §4.16: individual figures, approaches on the map).
- Balance pass (spec §4.10 condition values, §5.5 severe injury, hype frequency §2.3).

Cleanup, part 2: T-082…T-087 done (see Done). Open:

- T-088 [?]: Big binaries — keep base64 for the artifact but store .glb/.mp3 in Git LFS and generate the .txt at publish.
  Question: today `assets/vrm/*.glb.txt` (18 MB of base64 text) and the .mp3 sit in plain git. Moving them to LFS means either
  `git lfs migrate import` (rewrites history, needs a force push) or LFS only for new commits (old blobs stay). Which? Also confirm
  LFS is enabled for glairlyyy/spiker and that the artifact publish step may decode/encode (`base64 -d` / `base64`) at publish time.

## Done

T-001…T-094 (no T-012…T-015, T-021, T-033, T-049; T-082…T-088 open above). One line each; full text in git history.

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

## Unplanned changes

(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md)
