# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. **Later** items are outlines: the spec chat details them
(files, steps, accept) and moves them to Now. Next free id: **T-159** (T-088 is open below).

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

Owner requests 2026-10-03 (spec §10.1, §10.1a): T-135 → T-136 → T-137.

### [x] T-135: Remove the places list (Map/List)

Spec: §10.1 Goldens: unchanged Save: no change
Goal: no list of places anywhere; the map is the only way to find a place (desktop only).
Files: js/ui/career-hub.js (mapBar, mapMode, placesCard, placeGo, hubKey Esc chain), js/ui/career-week.js (CW.mapList), css/career.css (.mapbar, .maplist)
Do not: touch the legend chips, MapView, the fly-to or the inbox actions that select a place.
Steps: delete the Map/List segment, `placesCard`, `placeGo`, `mapMode`, `CW.mapList` and their CSS; Esc chain = ⚙ → sheet → place.
Accept: no "List" button; grep finds no `placesCard` / `mapList`; inbox "View" still selects the battle pin. QA: hub screenshot.
Result: Map/List segment, placesCard, placeGo, CW.mapList and .mapbar/.maplist/.places/.plrow CSS removed; legend kept as mapLegend(); Esc = ⚙ → sheet → place. QA: hub 1440×900, no errors.

### [x] T-136: Collapsible week rail

Spec: §10.1 Goldens: unchanged Save: no change (UI state in localStorage, try/catch)
Goal: the player can fold the week rail to a 72px strip and back; the map takes the space.
Files: js/ui/career-hub.js (weekRail, renderCareer, hubKey), css/career.css (.wrail, map / panel / legend offsets), js/core/storage.js (only if KEYS needs a new key)
Do not: drop the End week arm (two clicks + Space) or any inbox action; remount the 3D map (resize it — MapView keeps one canvas).
Steps:

1. « button in the rail header (aria-label "Collapse the week rail ([)"), » in the strip; key `[` toggles (ignored in inputs, sheets keep working). State `CW.railMini`, saved with `store.set` (wrapped) and read on load.
2. Collapsed strip (HubBattle mockup): portrait (→ Me), "n left", 7 day cells stacked (spent / trip / ghost / free, same data as `dayTrack`), goal icon (→ Season, warn colour when due ≤ 1 week), inbox icon with the item count (→ expands the rail), End week icon button (same arm).
3. Map area, legend and the place panel follow the rail width (CSS var `--rail`); the 3D map gets a resize, not a remount.
   Accept: `[` folds / unfolds; reload keeps the state; nothing in the rail is unreachable when folded (portrait, goal, inbox, End week).
   QA: hub folded and unfolded with a place selected; screenshots.
   Result: railStrip + railToggle, KEYS.rail (sns_rail_mini), `.hub.railmini { --rail: 72px }`; dayTrack/inbox split into weekCells/inboxItems (shared); strip inbox icon unfolds the rail; armed End week shows "Skip?". Also fixed ARCHITECTURE for T-135. QA: fold/unfold with a place selected, reload keeps it, map canvas 1368px wide folded, no errors.

### [x] T-137: Vertical info lists

Spec: §10.1a §9.8 Goldens: unchanged Save: no change
Goal: no fact chains joined by `·` in the hub; every block with more than two facts reads top-down, one fact per line.
Files: js/ui/dom.js (new `kv(rows)` → `<dl class="kv">`), js/ui/career-map.js (clashPanel, challengeBlock, hqPanel, placeCard), js/ui/career-hub.js (inboxRows, weekBrief), js/ui/career-week.js (match prep notes), css/career.css (.kv)
Do not: change any number, rule or button behaviour; reword lore lines (flavour stays one line).
Steps:

1. `kv([[label, valueHtml], …])` → `<dl class="kv"><dt>label</dt><dd>value</dd>…</dl>` (grid `auto 1fr`, label `mute`, 13px; an empty label continues the previous fact on a new line).
2. clashPanel as HubBattle: facts list (Attacker, Defender, Border `{lead} n/2`, Standing · A, Standing · B, Trip, If nobody joins); one card per side: Cost (stamina), Injury, Win (standing A, standing B, fans, border — one per line), Lose (standing, border — one per line); a segment above the row `Fight: Play it | Sim it` (default Play it); row `[Fight for A] [Fight for B] [Watch · d]` — Watch stays the spectate-and-scout action; with Sim it picked, the Fight buttons sim (replaces the separate "Sim a fight" buttons).
3. challengeBlock: Accepts, Why, Street crew (if hired), Injury, Stake (−/+) as rows; row `[Challenge · d] [Sim]`.
4. hqPanel: Rating, Standing, Join (what they ask / your gap), Scouted habits (each habit its own line) as a list; the roster one player per line (name, role, OVR, element, techniques as sub-lines).
5. inboxRows: title line + its facts as a `kv` (battle: Sides, Where, Border, Trip; goal: Goal, Progress, Due; evaluation: Opponent, Venue); weekBrief rows the same; match prep notes (venue, opponent, their best, scout hint) as a `kv`.
   Accept: grep of the hub's rendered text shows no line with two or more `·` separators in the battle card, challenge, HQ, inbox and brief; the battle card matches HubBattle.
   QA: battle week (card + inbox + brief), an HQ with a challenge; screenshots.
   Result: kv() in dom.js; battle card per HubBattle (title = site, Attacker/Defender/Border/Standing×2/Trip/If nobody joins; side cards Cost/Injury/Win×4/Lose×2; Play it|Sim it segment → Fight buttons sim, old Sim buttons gone; row Fight A, Fight B, Watch); challenge, HQ (habits split from habitText, roster one per line), inbox, brief and eval/cup prep notes as kv (venue/opponent moved out of the prep headers). New helpers clashBorder (career-map), evalNext (career-hub), prepNotes/rankBestRows (career-week, replaces rankBest). Border lines drop the tile name when it is the battle site; End week made sticky so a tall inbox can't push it out. QA: brief/inbox/card/HQ/eval at 1440×900 — 0 lines with ≥2 `·`, no errors.

### [x] T-130: Border pressure lines on the 3D map

Spec: §4.7 (Border lines) §4.16 A Goldens: unchanged Save: no change
Files: js/data/city.js (CITY.borders), js/career/mapmodel.js (land.borders), js/map3d/pins3d.mjs, js/map3d/map3d.mjs (pulse), css/career.css, tests/map.test.js
Do not: change Front rules or meters; move borders; make lines pickable; change life3d patrols.
Steps: `CITY.borders = { 'wei-wu': wuWei, 'wei-shu': shuWei, 'wu-shu': [tri-point, [430, 540], coast[12]] }`; MapModel.land.borders =
`[{ id, a, b, line, meter, lead, color, pressure, brink, text }]`; pins3d draws one dashed line per border (grey / lead colour)
and a label chip at the line's middle; `pulse(t)` animates each by its own pressure.
Accept: three lines; a border's colour and label follow Front.meter; test: model borders = FRONT.borders keys, meter from Front.meter.
QA: hub map screenshot with one border at 1/2.
Result: `CITY.borders` (3 lines), `MapModel.borders(run)` → land.borders { id, a, b, line, meter, lead, color, pressure, brink, text, title }; pins3d draws each as a dashed ribbon (1.4 m wide, 1px lines were invisible over the terrain) in the leader's colour (grey when even) + a `.mbord` label chip at its midpoint (`Shu 1/2` / `Even 0/2`, ring at the brink, fades like labels); `pulse(t)` per border; seized-patch rebuilds no longer wipe the border decals (old bug). life3d patrols unchanged (Wei–Wu). Test: borders = FRONT keys, lines from CITY, meter/lead/colour/label follow Front. QA: Shu 1/2 on Wei–Shu after a win — green line + chip; no errors.

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

### [x] T-122: Me sheet

Spec: §10.4 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (youCard, elementLine, skillShop, lifeCard → `sheetMe`), js/ui/career-hub.js (sheet host), css/career.css
Steps: sheet host = overlay over the map area (rail and top bar stay), Esc / tab closes; three columns as SheetMe: stats with `n / cap` and next-point progress + Wit + Leadership + element; skills (passive rows with price and gap in a `.rowcta` column; techniques with requirements); life (reuse T-100's `homeRow`; payday line). Physio and sponsors where youCard/seasonCard had them.
Accept: Player, Skills and Life drawers are gone; Me tab and key 1 open the sheet. QA: screenshot vs SheetMe.
Result: done — sheet host (`HUB_SHEETS`, `CW.sheet`, `hubSheet`: over the map area under the top bar, rail stays; the tab / key toggles, Esc and ✕ close); `sheetMe` (career-week.js) = header (face, name, role · team · OVR · rank line, Stamina / Mood / Skill pts chips) + three cards: stats rows (bar + thin next-point bar, `n / 75`), Wit, Leadership, element line, injury + Physio; skills (passive `.rowcta` rows with `cost · learn` or dashed `cost · need n`, techniques with their stat requirements or ✓ yours); life (payday line, T-100 home rows). Player, Skills and Life drawers and youCard / skillShop / lifeCard removed. QA: key 1 opens the sheet at 1440×900; no pageerror.

### [x] T-123: People sheet

Spec: §10.4 Goldens: unchanged Save: no change
Files: js/ui/career-people.js, js/ui/career-week.js (bondCard, chemBlock), css/career.css
Steps: filters Everyone / Squad / Rivals / Waiting n; left list (waiting first, squad with bond bar + stance, bench, others, gone); right detail = personCard content (wants, traits, season, sides, memories) + their ask with Accept / Decline / More moves (Asks.moves) as one action row; chemistry and Leave squad under the Squad filter.
Accept: Team and People drawers are gone; an approach can be answered from the detail. QA: screenshot vs SheetPeople.
Result: sheetPeople (career-people.js): filters Everyone/Squad/Rivals/Waiting n (CW.pfilter), list (waiting, squad + bond bar, bench, others, gone) + detail (personCard, ask as one Accept/Decline row, Your moves); Chemistry + Leave squad under Squad; Team/People drawers, bondCard, peopleCard, personRow, waitingCard removed; openPerson opens the sheet. QA 1440×900: no errors.

### [x] T-124: World sheet

Spec: §10.4 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (factionsCard, clubsCard, rankCard), js/ui/career-dossier.js, css/career.css
Steps: tabs Factions (5 cards: standing bar −100…+100 with the number, labelled border meters, Dossier opens in place) · Clubs (reuse `clubsCard` rows with `joinGap`, signable first) · Rankings (Register / Gazette / Street; you ± 5 + top 5, "Show unrated").
Accept: Clubs, Factions and Rankings drawers and the dossier pop-up are gone. QA: screenshots of the 3 tabs.
Result: sheetWorld (career-dossier.js), tabs via worldTab(k) / CW.wtab; Factions = 5-card grid, faction name opens the dossier in place (← All factions / Esc back, stopImmediatePropagation so Esc does not also close the sheet); Clubs = clubsCard unfolded, first signable is the one ink primary, no buttons once signed; Rankings bigger tabs/rows. Clubs/Factions/Rankings drawers + dossier modal removed; inbox Clubs → worldTab. QA: 4 screenshots, no errors.

### [x] T-125: Season sheet and ⚙

Spec: §10.4 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (calendar, seasonCard, matchLog), js/ui/career-hub.js (diary/news/menu), css/career.css
Steps: calendar of 28 + cup cells with week number, type word (Eval / Camp), goal week mark, current week selected; goal card; sponsors; match history; Diary / Gazette tabs. ⚙ pop-over: Main menu, Debug log (only with `?dev`), Abandon run (inline confirm).
Accept: no drawer remains; HUB_DRAWERS removed. QA: screenshot vs SheetSeason.
Result: sheetSeason (career-week.js): calendar (current week = selected style, cup pips ink not hot), goal + sponsors, match history | Diary / Gazette tabs (CW.stab; Gazette tab marks it read; hubOpen('news'/'diary') opens that tab). ⚙ = gearPop (Main menu, Debug log only with ?dev, Abandon run inline); Esc closes it. Season/news/diary/menu drawers removed; the last drawer (places) and HUB_DRAWERS go in T-126. QA: 3 screenshots, no errors.

### [x] T-126: Map / List toggle

Spec: §10.1 §4.4 Goldens: unchanged Save: no change
Files: js/ui/career-hub.js (places drawer → list mode), js/ui/career-map.js, css/career.css
Steps: fitView and fly-to are done (T-097). Add a Map/List segment top-left of the map: List = the T-098 places list rendered in the map area (no drawer) → click selects (panel opens, camera flies); legend chips at the bottom; remove the `places` drawer.
Accept: List selects places; no places drawer. QA: screenshots.
Result: mapBar (career-hub.js): Map/List segment top-left, List = placesCard over the map area (CW.mapList), a row selects the place and returns to the map (panel opens, camera flies); legend chips bottom-left (HQ, venue, battle, faction chips). HUB_DRAWERS, hubDrawer and CW.drawer removed (no drawer remains); Esc closes ⚙ → list → sheet → place. QA: 3 screenshots, no errors.

### [x] T-127: Match prep card

Spec: §10.5 §9.8 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (evalPanel, cupPanel, matchPrep, rankBest), css/career.css
Steps: two roster columns (you highlighted), lineup sentence (`On the bench — {name} rates higher (x vs y)`), focus as a selected segment labelled "Pick one", captain talk the same, rewards line, bracket on top for cups; action row (`.acts.pri`) `[Play 2fr] [Sim 1fr]`.
Accept: fits 900px height without scroll. QA: week 4 evaluation; screenshot.
Result: Match prep (career-week.js): header (Week n · Match day, title, venue/opponent), two roster columns with OVR right-aligned ('?' until scouted/met; new `matchRosters` for cups), `matchPrep` rows Lineup sentence (Starting / On the bench — X rates higher (a vs b)) · Focus segment "Pick one · hit it: +sp +fans" · Team talk (captain, cup) the same; rewards as chips; notes line (scout hint + their best); `.acts.pri` Play 2fr / Sim 1fr. Cup bracket shows only the round you play next (4-column grid) so the card fits. QA 1440×900: eval card 564px, cup card 741px — no scroll; no errors.

### [x] T-128: Match result screen

Spec: §10.6 Goldens: unchanged Save: no change
Files: js/ui/match-screen.js (finishMatch, podium, matchStars), js/ui/career-week.js (playCareer onFinish message → data), css/style.css
Do not: change rewards or XP math; the `onFinish` message stays available for Monster game.
Steps: after the final (same delay), replace the podium overlay with a full result layout as MatchResult: `resultScreen` (match-screen.js) replaces the podium (podium() removed): headline (You win/lose a-b, round label), grade tile + K/B/A/E + focus met/missed, rewards chips, growth rows (value, +n, XP bar), techniques picked up, top 3 rows, `.acts.pri` [Continue][Box score B]; Monster = headline + top 3 + [Back to menu]. Data: `resultSnap` before the fixture's onFinish and `resultData` after (career-week.js; diffs the run, no rule runs; Cup/Fight results unchanged, the onFinish line still goes to the diary). The rail no longer opens itself after the final; the ticker hides under the result. QA: week-4 evaluation (Skip) and Monster at 1440×900 — card fits the court; Continue → hub (Week 5 brief); no errors.
Accept: career match ends on the result screen; Continue returns to the hub (report or next card). QA: career evaluation (watch); screenshot.
Result:

### [x] T-129: Title screen and Create

Spec: §10.7 Goldens: unchanged Save: no change
Files: js/ui/menu.js, js/ui/career-create.js, css/career.css, index.html (header)
Steps: Title as TitleScreen (Continue hero with name · role · week; New career; Encyclopedia; Settings → match settings defaults; Playtest card only with `?dev`). Create as CreateCareer: role cards (key stat, best places from SPOTS by `train`, techniques from Skills.forRole), name + Random, challenge toggles, `[Arrive on the island] [Back]`.
Accept: no Playtest card without `?dev`; role card data comes from game data, not hard-coded text. QA: screenshots.
Result: Title (menu.js): brand left; Continue hero (ink, name · role · week n of 28, Enter), New career ("replaces X's run" when one exists), Encyclopedia, Settings → inline match-settings segments (`settingsMenu`, same storage); Playtest card only with `?dev`. Create (career-create.js, `.create2`): role cards built from KEYSTAT/STATNAME, SPOTS by `train`, Skills.forRole techniques; name + Random; challenge toggles as a segment with the picked ones' descriptions; `[Arrive on the island Enter] [Back Esc]`. Site header hidden on both (CSS `:has`); index.html unchanged. QA: screenshots, no Playtest without ?dev, Graphics set from the title; no errors.

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

### [x] T-110: Glossary and `term()`

Spec: §9.4 §9.6 Goldens: unchanged Save: no change
Files: js/data/glossary.js (new — add to index.html after people.js), js/ui/dom.js (`term`), js/ui/encyclopedia.js (Glossary tab), tests/career.test.js
Do not: show old-language words (§6); write "why" text (registrar voice).
Steps: `GLOSSARY = { id: { icon, short, long } }` for every §9.6 id; `term(id, n?, cls?)` → `<span class="term" data-tip="{long}">{icon}{signed n}</span>` (number coloured by sign); Encyclopedia tab "Glossary" listing icon · alias · long. Test: every id used by `term(` in js/ui exists in GLOSSARY.
Accept: test passes; Glossary tab renders all ids. QA: Encyclopedia screenshot.
Result: js/data/glossary.js (after people.js): 24 terms (the §9.6 ids + the 6 stats), `long` built from data constants (GRADES, CLASH, FRONT, CUPS, REWARDS, MOODS, WEEK_DAYS); `term(id, n?, cls?)` in dom.js (alias word until T-111's icons; number signed, good/bad by sign, money as ±$n; tooltip = long); Encyclopedia › Glossary section + nav link. Test: §9.6 ids present and complete, every `term('x'` in js/ui defined. QA: Glossary renders 24 rows; no errors.

### [x] T-111: StatIcons SVG set

Spec: §9.5 Goldens: unchanged Save: no change
Files: js/ui/icons.js (ICON entries + `statI(k)`), js/data/glossary.js (icon = statI key), js/ui/career-hub.js (hudRes, hudBar)
Steps: add the 15 line icons from the StatIcons preview (16×16 viewBox, stroke currentColor, 1.6 width) to ICON; GLOSSARY icons use them; HUD rows get icon + word; Stamina and Speed never share a glyph.
Accept: no ⚡/✨/📣 left in hudRes. QA: hub screenshot.
Result: `STAT_ICON` (15 line icons from the StatIcons card, 20×20, stroke currentColor 1.6) + `statI(k, size)` + `statKey(id)` in icons.js; GLOSSARY icons point at them (ideas like Sim/Seize/U21 Cup use `'text'` = their alias word); `term()` renders the icon. hudRes/hudBar no longer exist after the redesign, so the top bar resources (Money, Fans, Skill pts, Stamina, Mood), the rail's 4 stats and the Me sheet stat rows get icon + word, tooltips = glossary text. Stamina = battery, Speed = double chevron. No ⚡/✨/📣 in the hub. QA: hub + Me sheet + Glossary screenshots; no errors.

### [x] T-112: Reward, cost and requirement lines as terms

Spec: §9.4 Goldens: unchanged Save: no change
Files: js/ui/career-map.js, js/ui/career-week.js, js/career/training.js (addXp label only), js/ui/career-people.js
Do not: change any number or rule; change log text other than training labels.
Steps: rebuild with `term()` — training button/preview and `Training.addXp` log label (`⛉+1`), coach's goal reward, evaluation/cup reward tips, street battle stakes, club join gaps, skill costs. Cost → result order. Examples: short-copy.md "Before → after".
Accept: the coach's goal reward reads `Hit ◆+40 fans+300 mood↑ · Miss mood↓` as icons. QA: training card, Season drawer, eval card.
Result: built with `term()`: training button `Train Power · ☀3 ▮−20 $16`, gain rows with the stat icon and `+1 now` / `+1 in n`; `Training.addXp` label `✸+18` / `✸…` (GLOSSARY `glyph` for the 5 stats; the match-XP test regex follows); coach's goal (Season sheet) `Hit ◆+40 👥+300 ☺↑ · Miss ☹↓` (its ⓘ removed); focus `hit it ◆+25 👥+250`; eval/cup reward chips `Win ◆+40 👥+500 · Loss ◆+20 👥+100`; street battle stakes `▮−15 · Win ⚑+10 Wei ⚑−10 Shu 👥+60`; skill buttons `◆120 → learn`. Club join gaps already read `OVR 72 · you 41` (T-095) — unchanged; career-people.js had no cost lines to convert. QA: training card, Season sheet, eval card; no errors.

### [x] T-113: Remove duplicated explanations

Spec: §9.4 Goldens: unchanged Save: no change
Files: js/ui/career-map.js, js/ui/career-week.js, js/ui/match-screen.js, js/ui/career-create.js
Steps: replace repeated sentences with the term alias — Sim (×5), Grade (×2), seize (×3), standing (×4), border place, quality (overhyped/hidden gem), together (teammate bonus); tooltips keep only numbers specific to that place/match. Grep each phrase listed in short-copy.md "Aliases" to zero repeats.
Accept: each listed phrase appears once (in GLOSSARY). QA: spot cards + eval card.
Result: repeated explanations replaced by the glossary text or a term: Sim tips (eval, cup, challenge) → GLOSSARY.sim, the "result without watching" sub-labels dropped; the two full Grade copies → "× Grade" (eval tip keeps its per-play numbers); seize tips (Factions tab, dossier) → GLOSSARY.seize; standing labels/bars (street battle, Factions, dossier, HQ tag) → `term('standing', v)` + GLOSSARY.standing; Border tag and quality (Premium?/Rough?) tips → GLOSSARY; quality tag tip keeps only ×q. Grep in js/ui: each listed phrase 0 ("overhyped" stays once as the tag word). Deviation: career-dossier.js (not listed) also edited — it held 3 of the copies. match-screen Skip keeps its own tip (it is not Sim); career-create had none. QA: Factions tab, training card, eval card; no errors.

## Hex territory (spec §4.27, confirmed 2026-10-03: targets = cheapest, then nearest)

### [x] T-131: Hex grid

Spec: §4.27 Goldens: unchanged Save: no change
Files: js/career/hex.js (new, before front.js), js/data/world.js (HEX, HEX_COST, HEX_HOME), index.html, tests/map.test.js
Result: `Hex` — flat-top axial grid (size 36 → 139 land tiles: Wei 42, Wu 30, Shu 60, minors 6, Academy 1) built once from CITY; a tile holding a place or HQ takes that region (so no place changes owner at the start; `pier` sits on the water's edge → nearest land tile); kinds hq / academy / minor / place / land, terrain city (Wei downtown + old town only — all-Wei "city" made Wei cost 3 everywhere) / beach / highland / plain; `supply`, `cost`, `targets` (cheapest, then nearest an attacker HQ, then hash), `frontier`, `name`, `flip`, `sync` (rebuilds `run.own`), `decay`. Test: grid deterministic, places/HQs on their region's tile, centre ↔ id.

### [x] T-132: Front on hexes

Spec: §4.27 Goldens: unchanged (engine) Save: RUN_VERSION 16 (`run.front` → `run.hex`)
Files: js/career/front.js, city.js (clashRoll / clashSite), run.js (v16, RUN_DEFAULTS hex, repair, Hex.decay at week end), js/data/world.js (CLASH.sites, FRONT.borders/seize removed), glossary, tests
Result: a battle is fought on the raider's first target tile (`run.clash = { tile, from, att, def }`, site = tile centre, name = "open ground near X" or the place); `Front.result` pushes the battle tile (a defender's win clears the raid and pushes the tile it came from), flips at `Hex.cost`; `meter` = strongest push either way; `stakes` → { tile, name, meter, cost, seize, place }; `run.own` stays as the place-owner cache so prices/turf/access/dossier are unchanged. Tests rewritten (faction dynamics, dossier, contest, street fights); rel bond calibration rebased (w80 12.6 → 8.8): Front.pick's tie draw fires more often now, which shifts the random stream (checked: disabling the war changes nothing). Note: cheapest-first means plain tiles fall first; in 26-week sims ~5 tiles move and no place falls — tune HEX_COST if the war should bite sooner.

### [x] T-133: Hex map

Spec: §4.27 Goldens: unchanged Save: no change
Files: js/career/mapmodel.js (hexes; T-130 borders removed), js/map3d/pins3d.mjs, js/map3d/map3d.mjs, js/data/city.js (CITY.borders removed), css/career.css, tests/map.test.js
Result: `MapModel.hexes(run)` = { size, tiles [{ id, at, own, color, kind, frontier, p, by, cost, text }], target { id, color, text } }; pins3d draws one draped vertex-colour fill (0.2) for every major tile, inset two-colour ribbons on every edge where holders differ, a faint grid inside territories, and a pulsing outline on the battle tile; `.mbord` chips on pressured tiles and the battle tile (`Shu 0/1`, under the ⚔ pin). Seized patches and the T-130 lines are gone (life3d still flags seized places). QA: screenshot — hex borders in both colours, battle tile ring + chip; no errors.

### [x] T-134: Hex UI

Spec: §4.27 Goldens: unchanged Save: no change
Files: js/ui/career-map.js (tileBlock in the point panel, battle stakes, Border tag), js/ui/career-week.js (Factions: tiles held ±, next target per rival), js/ui/career-hub.js (brief row), js/data/glossary.js (seize, border)
Result: clicking land shows the tile: holder (and who it was taken from), ground, "Seize: Wu needs 1 · Shu needs 2" (greyed when out of reach) or "Capital — never falls", and any push; Factions cards show `Tiles 41 −1` and `vs Wu · next: open ground near … 0/1`; street battle stakes and the week brief read `Seize n/cost on {tile}`; glossary `seize` spells out the tile costs. QA: point panel + Factions tab screenshots; no errors.

### [x] T-138: Tile value drives the economy (owner request, spec §4.27 Tile value)

Spec: §4.27 Goldens: unchanged Save: no change
Files: js/data/world.js (HEX_VALUE, HEX_ECON; FRONT.weakAt / price / q removed), js/career/hex.js (value, worth, worth0), js/career/front.js (econ, down, weak, priceMul, qMul, strength), js/career/world.js (joinReq), js/career/dossier.js (state, econ), js/ui/career-map.js (tile value), js/ui/career-week.js (Factions value line), js/data/glossary.js (`value`), tests/map.test.js
Result: every tile has a value (HQ 4, place 3, city 3, beach 2, highland / plain 1); a major's economy e = value held − start value replaces the lost-place count: prices +3% per point lost, facilities ±1.5% per point (0.7–1.3), street strength 50 + 3e, one step down per 3 lost (club joins −3 OVR / key, fee −25%), weakened at −6; dossier state pressed / rising follows e. Tile panel shows value; Factions cards `Tiles 41 −1 · value 69 −1` and the prices / facilities line (2 decimals). Test added. 27-week sims: e ends between −5 and +4 per faction (prices up to ×1.15, facilities 0.93–1.06) — every flip now moves the economy.

### [x] T-139: Fewer, lower buildings (owner request)

Spec: §4.19 Goldens: unchanged Save: no change
Files: js/career/mapmodel.js (MapModel.thin), js/map3d/kit3d.mjs (block / tower base heights), js/map3d/town3d.mjs (height stretch), spec.md §4.19, tests/map.test.js (lot targets)
Result: every density × 0.65 (`MapModel.thin`): 1145 → 704 lots (Wei 329, Wu 211, Shu 83, Outlaws 40, Academy 23, Gloria 18; test targets ±20 % follow); towers 15 → 9 and blocks 7 → 5 base height, wealth stretch 2.5 → 1.2 (tallest tower ~52 → ~20 units). QA: hub screenshot.

### [x] T-140: Training layout by faction (owner request, spec §4.18a)

Spec: §4.18a Goldens: unchanged Save: no change
Files: js/data/city.js (SPOTS at, ROADS nodes / edges, Wei label), tests/map.test.js, tests/career.test.js
Result: Wei gyms moved into a training district round jW1 ([655–705, 315–350]), each a street off jW1; their old road nodes kept as junctions (jWp / jWs / jWw / jWj) so every avenue still runs; Wu sand courts → south-east beach [790, 600], pier → by the airport [535, 645], boardwalk reordered (airport → pier → bonfire → sand → resort); Shu unchanged; Wei label moved off the district. Trips from the airport: pier 0, Wei gyms 2 each, sand / harbor 2, dunes 3. Side effect: the district spans 3 hex tiles, so one flip can take two Wei gyms (test updated). QA: hub with places revealed.

### [x] T-141: Faction colour only on the tiles (owner request, spec §4.27 Map)

Spec: §4.27 Goldens: unchanged Save: no change
Files: js/map3d/map3d.mjs (terrain colours), js/map3d/pins3d.mjs (tile fill)
Result: the terrain no longer mixes in the region colour (grass / rock / sand / district tints only); every land tile — minors and the Academy too — gets its holder's fill (opacity 0.2 → 0.3), so faction colour on the ground comes only from the tiles. QA: hub with places revealed.

### [x] T-142: Scale the island 1.5× (owner request, spec §4.18b)

Spec: §4.18b Goldens: unchanged Save: RUN_VERSION 17 (positions and fog are in the scaled units)
Files: js/data/city.js (MAP_SCALE, scaleMap, CITY.strip, NEAR_R / TRIP_DAY / REVEAL_R / GROUND_STEP), js/career/mapmodel.js (thinMajor, road rows ÷ MAP_SCALE, onSand strip), js/map3d/map3d.mjs (camera reach 420 → 630, fit 340 → 510), tests/map.test.js
Result: design coordinates stay as written; `scaleMap` multiplies every map point once at load (shared points once); circle districts move but keep their radius, point districts move by their centroid, the beach / Wei ring districts thin by 1/S², points inside the park or a minor move with it; HEX.size, travel, reveal and WEALTH.weiEdge × S. Buildings 704 → 724 (majors × `thinMajor` 0.8, road rows ÷ S); tiles still 139; trip days unchanged (pier 0, Wei gyms 2, dunes 3). Terrain ~46k → ~105k vertices (built once at mount). Tests: design points × MAP_SCALE, lot targets rebased. QA: hub screenshot.

### [x] T-143: Wei and Wu fight each other most (owner request, spec §4.27 Movement)

Spec: §4.27 Goldens: unchanged Save: no change
Files: js/data/world.js (FRONT.prey, FRONT.push), js/career/front.js (pick), tests/map.test.js
Result: Front.pick chooses the target with FRONT.prey (Wei → Wu 0.85 / Shu 0.15, Wu → Wei 0.85 / Shu 0.15, Shu → either 0.5) × 1.5 where the raider is already winning; always one R() draw for the target (was 0–1). 3,000 picks: Wei–Wu 70 %, Shu–Wei 15 %, Shu–Wu 15 %. Test added; full suite and calibrations pass.

### [x] T-144: Light only round you and home; ◎ Me; bigger player (owner request, spec §4.18c)

Spec: §4.18c Goldens: unchanged Save: no change
Files: js/career/mapmodel.js (model.fog = your position + home), js/map3d/map3d.mjs (centre), js/ui/map-view.js (centre), js/ui/career-hub.js (◎ Me button, key C), js/map3d/avatar3d.mjs (HEIGHT 1.65 → 6 m, stride × size, bigger marker), css/career.css (.mapme)
Result: the renderer's fog points are now [you, home] (run.fog still decides what you know: pins, scouting); ◎ Me (top-left of the map, key C) flies to the avatar at ≤ 70 m and re-enables follow; the avatar is 6 m tall with its stride scaled so the walk cycle still matches the ground speed. QA: hub, then C — the player centred and readable.

### [x] T-145: Tile fill covers mountains and the coast (owner request, spec §4.27)

Spec: §4.27 Map Goldens: unchanged Save: no change (run.hex keys tiles by id; new coastal tiles start neutral/by region)
Files: js/career/hex.js (land = centre or any corner on land), js/map3d/pins3d.mjs (SUB 8, polygonOffset, lift 0.6)
Result: tiles 139 → 169 (coast fully tiled); fill draped on ~3 m facets with polygon offset so slopes no longer cut through it. Slightly more tiles → war pace and value totals shift a little.

### [x] T-146: Training gain as an EXP rating (owner request, spec §4.18a)

Spec: §4.18a Goldens: unchanged Save: no change
Files: js/ui/career-map.js (trainSpot gain row)
Result: per-stat row shows EXP +++ (≥ 3 points of need per session) / EXP ++ (≥ 1) / EXP + (≥ ¼) / Almost no EXP; tip says sessions to next point. Preview now includes DAY_GAIN (was 4× too high). QA: Wei Strength Center shows Power EXP ++, Jump EXP +++.

## Refactor & cleanup part 3 (planned 2026-10-03, owner request)

Audit at c44a718. Order = value ÷ risk. All: Goldens unchanged, Save: no change, no gameplay change; `npm test` + lint
green after each. Splits are pure moves (same functions, same draw order). New files are listed, so no stop-and-ask
for those; add them to index.html (and tests/run.js for test files).

### [x] T-147: Delete dead JS

Spec: — Goldens: unchanged Save: no change
Files: js/ui/match-screen.js, js/ui/career-week.js, js/ui/career-map.js, js/ui/icons.js, js/map3d/kit3d.mjs, js/career/city.js, js/career/front.js, eslint.config.mjs
Steps: remove `toggleCamera` `cycleHype` `cycleGfx` `toggleCutins` (match-screen, replaced by settingsMenu), `gazetteCard`

- global `readGazette` (keep `Run.readGazette`), `dayTag`, `clashSeen`, `skillChip`, `landmarkDepth` export,
  `City.homeRegion`, `Front.lost`/`Front.gained`; drop the stale `shared.R3D` line in eslint config.
  Do not: touch `mkTeams`/`simBalance` (test fixtures feeding goldens) or spread-used `ACTS_*`, `TORSO`, `PLAN`.
  Accept: grep shows 0 refs for each removed name; tests + lint green.
  QA: career run → hub, Season sheet (gazette), settings menu in a match.
  Result: removed all listed names (64 lines, 8 files) plus the 4 setting-label helpers (`hypeLabel cutLabel zoomLabel gfxLabel`) only the removed toggles used; 0 refs left; tests 109/109 + lint green; QA screens identical to baseline (match canvas noise only).

### [x] T-148: Delete dead CSS, merge duplicate selectors

Spec: §9 Goldens: unchanged Save: no change
Files: css/career.css, css/style.css, css/theme.css
Steps: remove rules whose classes appear in no js/ or index.html string (~35 classes in career.css incl. the legacy hub
block `hgoal hnext hl htoast hmenu dial trk prg tline g2`; style.css podium `podium pod pface pod1-3`, `resline rmsg`;
theme.css `mcard mgo alloc`; `.skc`, `.dt`, `.seizeline` after T-147). Keep dynamically built classes
(`m1 rS rB gS gA w-rank w-clubs`) and `.gazette`. Merge the ~41 selectors defined twice in career.css. Fix the
"Border pressure labels (T-130)" comment (now the hex target label).
Accept: ~600 lines gone; a scripted class scan finds no unused selector; QA screenshots unchanged.
QA: menu, create, hub, map + point panel, people, Season/World/Me sheets, match prep, result.
Result: −839 lines (career.css −656, style.css −131, theme.css −52): 62 dead classes gone (scripted scan: 0 unused; dynamic `m0–4 rS/rA/rB gS/gA w-*` kept, `.gazette` live), 7 duplicate rules folded into their first copy (`.cal .pip .hub .hub .spotcard`(z-index) `.hub .mapwrap .plink .rosters .rp .hub .winbox .wit`); `.hub .spotcard`/`.hub .hubmodal` second copies kept (a max-width @media override sits between, merging would change the cascade); T-130 comment fixed; QA 14/16 screens pixel-identical, match/result differ in the 3D canvas only.

### [x] T-149: Hardcoded colours → theme tokens

Spec: §9 Goldens: unchanged Save: no change
Files: css/theme.css, css/career.css, css/style.css, js/ui/career-end.js
Steps: replace literal copies of tokens (`#8b919c`→`--mute`, `#ff3b4e`→`--hot`, `#fff`→the white token); for colours
with no token (`#0c1016`, `#040b13`, `#ff8c42`, `#ffd166`, `#9fb0c4`, `#555b66`, canvas `#10163a`) map to the nearest
design-system token, or add one to theme.css only if tokens.json has it. career-end.js `COL` reads tokens.
Do not: change js/render/overlay.js canvas colours (canvas, not CSS).
Accept: career.css/style.css have no hex literals outside theme.css except commented exceptions; QA screens unchanged.
QA: as T-148.
Result: exact copies → tokens (#8b919c→mute, #ff3b4e→hot, #888 fallback→mute); ΔE00 ≤ 2.8 → token (#0c1016→surf 1.1, #000→on-ink/bg ≤ 2.8; career-end COL ovr→ink 1.4, power→bad-soft 1.1, def→cyan, jump→gold, cup line→hot, via style= since SVG attrs); everything else stays literal with `/* no token: … */` (tokens.json has no white token: #fff vs ink ΔE 3.5; #ffd166 gold 3.2; #f5b82e = wei-today but a faction colour on clock dots; #040b13 matches the sea fog; style.css court art #10163a/#ffe066…; speed #7ee081 vs good 4.5). No theme.css token added. QA: 16 screens vs base2 — hub/sheets px>24 = 0, match/result only confetti/3D noise (same as base2↔t148); growth chart checked separately.

### [x] T-150: Stale docs and comments

Spec: — Goldens: unchanged Save: no change
Files: ARCHITECTURE.md, js/ui/career-people.js, js/career/dossier.js, js/career/asks.js, js/career/people.js, js/career/rel.js, js/ui/career-week.js
Steps: ARCHITECTURE.md — drop "border meters `run.front`"/`Front.seize` (now hex §4.27), fix `peopleCard`/`personRow`/
`rankBest`/`PointFlash` names, mark `mkTeams`/`simBalance` as test fixtures in the engine flow; code comments still
naming the hub dock / drawers; UI copy "seize meters" (career-week.js) → tile wording from short-copy.md.
Accept: grep for `border meter`, `drawer`, `dock`, `seize meter` finds no stale hits.
Result: ARCHITECTURE — Front = hex tile pressure (`push/meter/battleTile/stakes`, `run.hex`), dossier fronts, `sheetPeople/personDetail`, `rankBestRows`, `mkTeams/simBalance` shown as test fixtures (PointFlash = `updatePointFlash`, already right); drawer/dock comments → sheet/top bar (+ css/career.css People sheet comment); Factions copy → "Street battles move your ⚑ standing and the Seize count on Border tiles." Grep hits left: ARCHITECTURE "There are no drawers." (true), other css/career.css drawer comments + map3d.mjs "dock" (files not listed). QA: only 08_2_world differs (the copy line).

### [x] T-151: Test suite — slow marks and file split

Spec: — Goldens: unchanged Save: no change
Files: tests/engine.test.js, tests/career.test.js, tests/map.test.js, tests/cup.test.js, tests/run.js, tests/people.test.js (new), tests/hex.test.js (new), tests/map3d.test.js (new), CLAUDE.md (test:quick timing line only)
Steps: mark `engine: ego` (9 s) and `rel on court: the clutch` (3 s) `test.slow`; move career.test.js people/rel/asks/
fates/pairs (~940 lines) → people.test.js; map.test.js hex/front/economy → hex.test.js, pure map3d helpers →
map3d.test.js; both "rel on court" tests together. Add a test that flags any top-level classic-script name defined
but referenced nowhere else (allow-list for onclick handlers and fixtures).
Accept: same test count + 1; `test:quick` ≤ 25 s; full run green.
Result: ego + clutch → test.slow; career → people.test.js (people/rel/asks/fates/pairs/fixes, 38 tests), map → hex.test.js (4) + map3d.test.js (3); cup's rel-on-court test joins the engine three; new `code:` no-dead-globals test (comments stripped, empty ALLOW, finds none). 109 → 110 tests, full green; test:quick 40 s → 28–31 s on this 2-core box (over the 25 s target: the 7 s golden tournament test stays in quick).

### [ ] T-152: Shared helpers in one place

Spec: — Goldens: unchanged Save: no change
Files: js/core/rng.js, js/core/math.js (new), index.html, js/map3d/geo3d.mjs, js/map3d/map3d.mjs, js/map3d/life3d.mjs, js/map3d/pins3d.mjs, js/render3d/poses3d.mjs, js/render3d/actors3d.mjs, js/render3d/camera3d.mjs, js/map3d/avatar3d.mjs, js/ui/dom.js, js/ui/career-dossier.js, js/ui/career-hub.js, js/ui/career-week.js, js/career/city.js, js/career/run.js, js/career/front.js, js/data/world.js, js/career/mapmodel.js
Steps: core/math.js takes the non-random helpers from rng.js (`clamp lerp sig inPoly`) — load order before rng.js
users; map3d keeps pure maths in geo3d.mjs (`clamp lerp smooth wrap inside edgeDist sideDist hstr`; tested .mjs can't
read globals) and imports them; render3d uses globals (`cl`→`clamp`, inline Math.max/min clamps). One `fmtDelta` in
core/math.js replaces the ~9 signed-delta formatters (always `−`). pins3d uses an imported escape, no faction names.
`MAJORS` moves to data/world.js; hardcoded faction lists use it.
Do not: change `wpick`/RNG or any engine call order.
Accept: goldens unchanged; one definition each of clamp/lerp/hash/inPoly per world (classic, map3d).
Result:

### [ ] T-153: Remove pre-hex leftovers on the map

Spec: §4.27 Goldens: unchanged Save: no change
Files: js/data/city.js, js/career/mapmodel.js, js/map3d/life3d.mjs, tests/map.test.js
Steps: `CITY.contest/contestPair` + `MapModel.contest` → derive "hot frontier" from `Hex.frontier` + pressure (patrols
walk the actual hex front, any pair, not a fixed Wei–Wu line); drop `MapModel.seized` poles (tile colour already shows
a seized place). Rewrite the T-079 test against the hex frontier.
Accept: patrols spawn only on frontier tiles; no `contest`/`seized` names left.
QA: career run → map, a battle week: patrols on the target front.
Result:

### [ ] T-154: Split career.css

Spec: §9 Goldens: unchanged Save: no change
Files: css/career.css, css/map.css (new), css/hub.css (new), css/people.css (new), index.html
Steps: after T-148/T-149, move the island-map/3D-overlay section → map.css, hub shell + layout grid → hub.css, people
sections → people.css; career.css keeps menu/create/cards/sheets. Link order keeps cascade (same relative order).
Accept: QA screenshots pixel-identical to before the split.
Result:

### [ ] T-155: Split career-week.js by job

Spec: — Goldens: unchanged Save: no change
Files: js/ui/career-week.js, js/ui/career-sheets.js (new), js/ui/career-match.js (new), js/ui/career-dossier.js, index.html, ARCHITECTURE.md
Steps: sheets (`sheetMe sheetSeason calendar seasonCard`) → career-sheets.js; match cards (`matchPrep evalPanel
cupPanel matchRosters prepNotes rankBestRows resultSnap resultData playCareer`) → career-match.js; career-week.js keeps
week end/recap; world cards (`rankCard clubsCard factionsCard`) → career-dossier.js next to `sheetWorld`.
Accept: no name changes; tests + lint green; QA every sheet + one evaluation.
Result:

### [ ] T-156: City vs Fight; dossier dedupe

Spec: §4.23, §4.27 Goldens: unchanged Save: no change
Files: js/career/city.js, js/career/fight.js, js/career/dossier.js, js/career/front.js, and every caller found by grep (list them in Result)
Steps: move City fight helpers (`worth challenge clashSite clash injuryRisk crewOvr`) into fight.js (rename `City.clash` →
`Fight.street` or merge with `Fight.clash` if identical); `City.region` calls `Front.owner`; dossier `summary` reuses
`build`'s front/price/quality block, "major" = `MAJORS.includes` everywhere.
Do not: change fight odds or any random draw.
Accept: tests + goldens green; city.js ≤ 360 lines.
Result:

### [ ] T-157: Split big render/engine files

Spec: — Goldens: unchanged Save: no change
Files: js/engine/rally.js, js/engine/rally-block.js (new), js/render3d/poses3d.mjs, js/render3d/poses3d-attack.mjs (new), js/ui/match-screen.js, js/ui/match-result.js (new), index.html, ARCHITECTURE.md
Steps: `formBlock` (~200 lines) → rally-block.js (loaded before rally.js); spike/swing/serve poses (~280 lines) →
poses3d-attack.mjs; match-screen result + cut-ins/toasts → match-result.js.
Do not: reorder any R()/rnd() call.
Accept: goldens byte-identical; Monster game QA looks unchanged.
Result:

### [ ] T-158: Archive tasks.md (spec chat)

Spec: — Files: tasks.md
Steps: collapse every `[x]` task into the Done one-liners; keep only open tasks in full.
Accept: tasks.md ≤ 200 lines.
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
