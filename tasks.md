# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. **Later** items are outlines: the spec chat details them
(files, steps, accept) and moves them to Now. Next free id: **T-115** (T-088 is open below).

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

## State (2026-10-02)

Everything through T-094 and cleanup part 2 (T-082…T-087) is built (103 tests, RUN_VERSION 15).
Built areas: match engine (ego, block collision, subs/coach, stamina, elements, hype, 3D playback, Follow/POV cameras),
career (free agent start at 1, pools/evaluations/U21 cup, Story mode, growth & techniques, challenges & injuries,
rankings, roads/travel/town/venues, living map A, relationships T-060…T-066), voice pass, cleanup part 1,
UX batch 1 (T-090…T-094).

## Now

UI batch 2 — orientation and preview-before-commit (spec §9; design system https://claude.ai/artifact/DWxheHjahb7L4k8GAWbRGq).
UI only: no engine change, no save change, goldens unchanged. Read §9 and the design-system card each task names before coding.
Order: T-095 → T-114 → T-096 … T-101.

### [x] T-095: UI tokens, selected state, red diet

Spec: §9.2 §9.3 Goldens: unchanged Save: no change
Goal: the new colour tokens exist; a selected option no longer looks like the primary button; red only means brand/danger.
Files: css/theme.css, css/career.css, css/style.css
Do not: change layout or spacing; touch REGIONS colours (§5.6 is open); rename existing tokens; touch canvas fonts (Dela Gothic One / M PLUS Rounded 1c are used by render/overlay.js and arena3d.mjs).
Steps:

1. theme.css `:root`: add `--hud`, `--line-strong`, `--on-ink`, `--sel-bg`, `--sel-line` (values §9.2). `.btn.hot` text `var(--on-ink)` (was #0b0c10).
2. Selected state: `.btn.on`, `.seg .on`, `.prep .on`, `.rtabs .on` (whatever classes mark the current choice — grep `class="btn ${… 'on'`) → `background: var(--sel-bg); border-color: var(--sel-line); color: var(--ink)`. Only `.btn.hot` stays ink-filled.
3. Control borders `.btn`, inputs, selects: `var(--line-strong)`.
4. Red diet: grep `var(--hot)` / `--bad` uses on neutral text — recap/event kicker headings (`.evk`, recap title), skill prices (`.sk span`), encyclopedia requirement text, calendar `U21` stays hot. Neutral ones → `var(--ink)` or `var(--mute)`.
5. Type floor: every `font-size` < 12px → 12px (11px, 10px, 9px rules in all three css files).
   Accept:

- No css `font-size` below 12px; `.btn.hot` is the only ink-filled control; Create screen: selected role reads cyan-outlined, Start career ink-filled.
- Skills drawer: prices not red. npm test / lint pass.
  QA: career run → Create screen, Skills drawer, a recap card; screenshots.
  Result: done — tokens `--hud --line-strong --on-ink --sel-bg --sel-line`; `.btn.on` and the calendar's current week use the selected style; `.btn` / inputs on `line-strong`; red off `.pts`, `.evk`, skill prices (unaffordable / learn-in-matches → mute), `.ency-req`, `.mate.you` / `.br.mine` (→ cyan), `.bbar.f` (→ good), grade A (→ gold), `.ev` border; 24 sub-12px rules → 12px plus `small { max(12px, .85em) }`. QA: no rendered text < 12px on Create / hub / Skills / recap, no pageerror.

### [x] T-114: Layout grid, action rows, container sizes

Spec: §9.8 Goldens: unchanged Save: no change
Goal: every card, modal and drawer row ends in one aligned action row with its CTAs on one line; containers are larger on desktop.
Files: css/career.css, css/style.css, css/theme.css, js/ui/career-week.js, js/ui/career-hub.js, js/ui/career-map.js, js/ui/career-create.js, js/ui/menu.js
Do not: change what any button does or its label text (T-099/T-112 own copy); add new controls; touch the match screen (T-107/T-109).
Steps:

1. CSS: one `.act` class = action row (`display:grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 16px; margin-top: 16px`), modifiers `.act.two` (1fr 1fr), `.act.pri` (2fr 1fr), `.act.three`; buttons inside get height 48 (modal) / 40 (card) via the container. `.rowcta` = list row grid `1fr 120px`, button 32px, name `text-overflow: ellipsis`.
2. Sizes: `.hub .drawer` width `clamp(480px, 36vw, 600px)`; `.hubcard` 640px, `.hubcard.wide` 960px; `#spot` 480px; `--gap` (HUD inset) 16px. Drawer `.panel` inside `.dbody`: no border/background, `line` divider between sections.
3. Markup — wrap CTAs in `.act`: evalPanel / cupPanel (`Play` + `Sim` → `.act.pri`, free-agent note moved above it inside the card padding), recapCard + gazetteCard (single full-width), eventCard / clash card (`.evc` → `.act.two`, stretch heights), trainSpot (Hard toggle + teammate chips above, Train button full row), renderCreate (`Start career` + `Back` → `.act.pri` at the bottom of the right panel; `.create` columns 1fr 1fr, panels stretch).
4. Lists → `.rowcta`: clubsCard, skillShop rows that have a button, personRow (lifeCard housing rows: T-100 uses `.rowcta`). rankCard wrapped in a `.panel` so it shares the drawer content edge.
5. Menu: hero card spans the full `.wrap`; Library + Playtest two equal columns beneath.
   Accept:

- No container shows two CTAs stacked vertically; every list's buttons line up in one column.
- At 1440×900: drawer ≈518px, club names on one line, evaluation card fits without scrolling.
- npm test / lint pass.
  QA: career run → Create, a training spot, Clubs drawer, recap, evaluation card, Main menu; screenshots.
  Result: done — `.act` (+ `.pri` / `.two` / `.three`, 40px cards, 48px modals) and `.rowcta` (1fr 120px) in career.css; eval / cup / event / clash / recap / Gazette / training / Create end in one action row; free-agent note inside the eval card; clubs as rowcta; Rankings wrapped in a panel (tab selected = `.on`); drawer clamp(480px, 36vw, 600px) (518px at 1440), modal 640 / wide 960, place card 480, HUD inset 16px; drawer panels flat with dividers; menu hero full width, Library / Playtest halves. Also `.btn.hot` sentence case (§9.3). QA: menu, create, spot, clubs, eval screenshots, no pageerror.

### [ ] T-096: HUD rebuild — labels, coach's goal, next step

Spec: §9.1 §9.5 §9.7 Goldens: unchanged Save: no change
Goal: every HUD value has a word label; the coach's goal and one suggested next step are always visible under the clock.
Files: js/ui/career-hub.js (hudRes, hudClock, new `nextStep`), css/career.css
Do not: auto-act (the chip only selects/opens); add a run field (deltas compare against a CW snapshot); write advice ("you should").
Steps:

1. `hudRes`: rows `label value` (Location, Money, Fans, Skill pts, Stamina bar + number, Mood) on `var(--hud)`; keep the tips. Delta: keep `CW.hudPrev` ({money, fans, sp, sta, mood}); for one render show `+230` / `−20` in `good` / `bad` after a change.
2. Goal row under the clock (when `run.goal` and `g.done == null`): `Goals.text(run, g)` · `Goals.progress(run, g)` · `by W{g.by}`; `warn` colour when `g.by - run.week <= 1`. Click → `hubOpen('season')`.
3. `nextStep(run)` → `{ text, act }`, first match wins: (a) Gazette unread → "Gazette out" / open news; (b) training week and the next eval/cup is ≤ 3 weeks away → "{Evaluation|Cup} W{n} · {KEYSTAT name} {value}" / select the nearest known SPOTS entry whose `train` = KEYSTAT (MapModel.known); (c) free agent and some `World.canJoin(run, i).ok` → "{club} would sign you" / open clubs; (d) days left 0 → "Night — end the week" / none. Render as a `.hnext` chip under the clock; no chip when nothing applies.
4. Registrar voice: facts and numbers only.
   Accept:

- New run, week 1: HUD shows labelled rows, the goal row and a chip "Evaluation W4 · Power 1"; clicking it selects a power spot; nothing else happens.
- After training, the money/stamina deltas show for one render.
  QA: career run → week 1 hub, click the chip, train once; screenshots.
  Result:

### [ ] T-097: Map opening view and fly-to on select

Spec: §4.4 §9.1 Goldens: unchanged Save: no change
Goal: the map opens wide enough to show every known place; selecting a place (pin, list, chip, banner) moves the camera to it.
Files: js/map3d/map3d.mjs (mount first view, select), js/map3d/geo3d.mjs (new pure `fitView`), tests/map.test.js
Do not: change fog/reveal rules; move the camera when the player is dragging (`down` set); animate longer than 0.5 s.
Steps:

1. `fitView(points, aspect, minD, maxD)` in geo3d.mjs → `{ x, z, d }` that frames all points (pad 15 %), clamped. Test it (two points, one point, empty → null).
2. mount first view: points = model pins that are known (the model already filters by fog — use what pins3d receives) + you.at; fallback to today's 60 m view.
3. `select(id)`: also set a camera target = the pin's ground point (keep `view.d` unless the pin is off-screen; then `d = max(view.d, 80)`); lerp `view.x/z` over ≤0.5 s in `frame`; cancel on pointerdown.
   Accept:

- fitView tests pass; new run opens showing Airport, home and every pin in reach; `mapPick('sand')` brings Sand Courts to the centre.
  QA: career run → open hub, call `mapPick('pier')`; screenshots before/after.
  Result:

### [ ] T-098: Places drawer

Spec: §9.1 Goldens: unchanged Save: no change
Goal: a list of every known place as the non-map way to find where to go.
Files: js/ui/career-hub.js (HUB_DRAWERS, `placesCard`), css/career.css
Do not: list fogged/unknown places; duplicate spotPanel's content (the row selects; the place card does the rest).
Steps:

1. HUB_DRAWERS `places: ['📍', 'Places', placesCard]` placed after `me` in dock order.
2. `placesCard(run)`: known SPOTS (and venues/HQs the map shows) grouped by region; row = icon, name, trains {stat} (or venue/HQ), trip days (`City.trip`), owner faction chip. Click → close drawer, `mapPick(id)`.
   Accept:

- Week 1 lists the places visible on the map; clicking one closes the drawer and selects it (camera moves — T-097).
  QA: career run → open Places, click a row; screenshot.
  Result:

### [ ] T-099: Cost on the button, locked shows the gap

Spec: §9.1 §9.4 Goldens: unchanged Save: no change
Goal: action buttons state their full cost; disabled controls say what is missing.
Files: js/ui/career-map.js (trainSpot, challengeBlock, hqPanel), js/ui/career-week.js (clubsCard, skillShop), css/career.css
Do not: change World.canJoin / Skills.canLearn; remove the tooltips that add place-specific detail.
Steps:

1. trainSpot button: `Train {stat} · {days}d · −{sta} sta · ${price}` (trip days included, same numbers as today's meta line); the meta line keeps only Lv and chips. Hard toggle label shows its effect inline: `Hard ×{TRAIN_X.hard.gain} · ×{TRAIN_X.hard.sta} sta · +{fail}% fail`.
2. clubsCard: drop the repeated faction name when the club name starts with it; locked button → disabled with text from `World.canJoin(run, i).why` (e.g. `Need OVR 72 · you 1`, `$600 fee · you $200`); signable clubs sorted first.
3. skillShop: unaffordable passive → `{cost} · need {cost − run.sp}` in mute; "learn in matches" as a neutral tag.
   Accept:

- Training button shows days, stamina and money; a locked club shows its gap; signable clubs on top.
  QA: career run → a training spot and the Clubs drawer; screenshots.
  Result:

### [ ] T-100: Housing as rows with effects

Spec: §9.1 Goldens: unchanged Save: no change
Goal: choosing a home shows what each one does before you pick it.
Files: js/ui/career-week.js (lifeCard), css/career.css
Do not: change HOUSING values or setHousing.
Steps:

1. Replace the `<select>` with one row per HOUSEK: name, region chip, rent, rest (×{rest}), mood/sick/grit effects from the HOUSING fields as short chips, `desc` as the row tooltip; current home marked selected (§9.2 selected style); each row a `.rowcta` (T-114) with a `Move in` button → `setHousing(k)` (rows you can't afford: disabled with the gap).
   Accept:

- Life drawer shows 5 rows with rent and effects; picking one changes home as before.
  QA: career run → Life drawer; screenshot.
  Result:

### [ ] T-101: Street battle intro card — stakes and plain copy

Spec: §4.6 §9.1 §9.7 Goldens: unchanged Save: no change
Goal: the week-start battle card says what's at stake before "Take a look".
Files: js/ui/career-hub.js (hubCard clash branch), css/career.css
Do not: change Front / City.clashCost; reword the rumour line's voice.
Steps:

1. Title `{att} raid {def} · {site}`; one line `Seize {meter}/{FRONT.seize}` using `Front.meter` (+ the place at stake from `Front.stakes` if a win would seize).
2. Body: one sentence ("Nobody shows up? They settle it themselves at the week's end.").
3. Choice sub-text sentence case, not uppercase grey: `Take a look — {n} day{s} to join` / `Stay out — it's on the map all week`.
   Accept:

- Card ≤ 3 lines above the choices; seize meter visible; sub-text readable (≥4.5:1).
  QA: career run → force a clash week; screenshot.
  Result:

## Next

UI batch 3 — triage, match screen, short copy. Same rules as Now.

### [ ] T-102: Recap and diary — bad news first, tagged lines

Spec: §9.1 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (recapCard, endWeekUI diff), js/ui/career-hub.js (diary drawer), css/career.css
Do not: change Run.log text producers (tag by matching the line or by the diff source).
Steps: recapCard rows ordered penalties (goal missed, mood down, money < 0 delta) → your gains → new goal → world news; each row gets an icon (✕ / + / ◎ / •) and `bad`/`good`/`ink`/`mute`; card heading in `ink` ("Week 7"). Diary rows get the same tag.
Accept: a week with "Goal missed" shows it first in `bad`. QA: career run → miss a goal (set run.goal.by = run.week), End week.
Result:

### [ ] T-103: Dock groups and drawers above the dock

Spec: §9.7 Goldens: unchanged Save: no change
Files: js/ui/career-hub.js (hudBar, dockKeys, hubKey), css/career.css
Do not: drop any drawer.
Steps: groups You (Places, Skills, Life) · People (Team, People, Clubs) · World (Season, Factions, Rankings, Gazette, Diary) with a gap; Menu as a small button in the top-left HUD; digit printed on each button (1–9, 0 for the 10th); `.hub .drawer` bottom = dock top so no drawer covers the dock.
Accept: with any drawer open every dock button is clickable. QA: open Factions, click Diary.
Result:

### [ ] T-104: Drawer clean-up — headings, Player first, calendar numbers

Spec: §9.3 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (youCard, seasonCard, calendar, skillShop, lifeCard), js/ui/career-people.js, css/career.css
Steps: drop the inner `<h3>` that repeats the drawer title (Skills, Season, Life); youCard order = stamina, mood, coach's goal, then stats; cap shown as `1 / 75`; calendar pips keep the week number with the type as colour + small letter, goal week underline gets a legend; People/Team: "neutral" pill only when not neutral, bond bar inline; Leave squad as a quiet `bad` text button.
Accept: no drawer shows its title twice; week 4 pip reads "4". QA: open each drawer.
Result:

### [ ] T-105: Factions and Rankings readable

Spec: §9.1 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (factionsCard, rankCard, rankBest)
Steps: Factions — label each meter (`Your standing`, `Border vs {X} {m}/{FRONT.seize}`), one explainer line at the top (registrar voice); Rankings — hide `unrated` rows behind "Show unrated", start at you ± 5 plus the top 5; names underlined on hover only.
Accept: a new player can name each Factions meter from its label. QA: both drawers.
Result:

### [ ] T-106: Evaluation / match-day card

Spec: §9.1 §9.7 Goldens: unchanged Save: no change
Files: js/ui/career-week.js (evalPanel, cupPanel, matchPrep), css/career.css
Steps: two roster columns of 4 (you highlighted); lineup sentence `On the bench — {name} rates higher ({x} vs {y})`; focus chips use the selected style with a label "Pick one"; `Sim` button sub-text "result without watching"; rewards as one chip line (until T-110: plain text `Win +40 skill pts +500 fans · Loss +20 +100`).
Accept: the card fits without scrolling at 900px height. QA: career run → week 4.
Result:

### [ ] T-107: Match screen — court first

Spec: §9.7 Goldens: unchanged Save: no change
Files: js/ui/match-screen.js (startMatch markup, fit), css/style.css, css/theme.css
Do not: change playback, camera or render code.
Steps: hide `.top` header while G.view === 'match'; court height = viewport − score band − control row; commentary + box score in a right rail (collapsible, open by default ≥1400px wide, `fold` key `mrail`).
Accept: at 1440×900 the court, score and controls fit without page scroll. QA: Monster game screenshot.
Result:

### [ ] T-108: Match labels — sides, serve, hype, zone

Spec: §9.1 §9.2 Goldens: unchanged Save: no change
Files: js/render/tags.js, js/ui/match-screen.js (board), css/theme.css
Steps: name tag gets a 2px underline in the team colour (OP red ★ / star gold ★ unchanged, so sides are readable in all-OP games); score band: label the serve dots ("serve"), the hype bar ("Momentum"), "In the zone" pills at 12px with team colour when lit.
Accept: in a Monster game both sides are distinguishable by tag. QA: Monster game screenshot.
Result:

### [ ] T-109: Match controls grouped

Spec: §9.7 Goldens: unchanged Save: no change
Files: js/ui/match-screen.js (startMatch control row, timeoutButton, finishMatch), css/style.css
Steps: groups Playback (Pause, 1×/2×/4×, Skip) | Your team (Timeout, Tactics) | View (camera, fullscreen, sound, ⚙); in career only the player's team gets a Timeout button (Monster game keeps both); timeout buttons carry the team colour; after the final Pause/speed/Skip are disabled.
Accept: career match shows one Timeout. QA: career evaluation (watch) + Monster game.
Result:

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
