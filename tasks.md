# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. **Later** items are outlines: the spec chat details them
(files, steps, accept) and moves them to Now. Next free id: **T-095** (T-088 is open below).

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

Everything through T-089 and cleanup part 2 (T-082…T-087) is built (103 tests, RUN_VERSION 15).
Built areas: match engine (ego, block collision, subs/coach, stamina, elements, hype, 3D playback, Follow/POV cameras),
career (free agent start at 1, pools/evaluations/U21 cup, Story mode, growth & techniques, challenges & injuries,
rankings, roads/travel/town/venues, living map A, relationships T-060…T-066), voice pass, cleanup part 1.

## Now

UX / QoL batch: make consequences visible, cut text. UI only — no engine change, no save change, goldens unchanged. Order: T-090 → T-094.

### [x] T-090: Week recap card

Spec: §4.2 Goldens: unchanged Save: no change
Goal: after End week the player sees one card: what changed (stat points, $, fans, standing per faction, places that changed hands, last diary lines).
Files: js/ui/career-week.js (CW.recap, `endWeekUI`, `recapCard`), js/ui/career-hub.js (hubCard shows it), js/ui/career-map.js (mapEndWeek), css/career.css
Do not: change Run.endWeek or add a run field; show the card when nothing changed; block cup / event / eval cards (those win).
Steps:

1. `endWeekUI()`: snapshot (stats, money, fans, City.rep per region, copy of run.own, run.log length), call Run.endWeek, store the diff in CW.recap, renderCareer(). Use it in mapEndWeek and benchEval.
2. `recapCard(run)`: rows only for non-zero deltas (+3 Power · −$40 · Wu standing −5 · "Wei seized the Fort from Wu"), max 4 new diary lines, one Continue button (clears CW.recap).
3. hubCard: recap comes after event / cup / eval / clash / gazette cards.
   Accept:

- Ending a week with a stat gain shows the card; a week with no change shows none; Continue returns to the map.
- npm test / lint pass.
  QA: career run → train once, End week, screenshot the card.
  Result: done — `endWeekUI` (career-week.js) snapshots before / after; card shows stat, $, fans, standing, place changes and up to 4 new diary lines; none when nothing changed. QA: card screenshot, no pageerror.

### [ ] T-091: Seize notice and map focus

Spec: §4.24 Goldens: unchanged Save: no change
Goal: when a place changes hands (your battle or the week's end) a banner names it and the map jumps to it.
Files: js/ui/career-hub.js (renderCareer), js/ui/career-week.js (CW.own, CW.note), css/career.css
Do not: add a run field (diff `run.own` against CW.own at render); touch Front.
Steps:

1. In renderCareer compare run.own with CW.own (null on first render = no notice). For each changed id build `{id, text}` from Front.owner / SPOTS (retook / seized wording as Front.seize).
2. Show the first as a `.hnote` banner in the winner's REGIONS colour (dismiss on click or next render); set CW.spot = id so the map selects it (MapView.select).
3. Update CW.own after every render.
   Accept:

- Winning the 2nd net battle on a border shows the banner and selects the place; reload with no change shows nothing.
  QA: career run → set `RUN.own = {…}` then renderCareer(); screenshot.
  Result:

### [ ] T-092: Stakes before a street battle, border meters

Spec: §4.24 Goldens: unchanged Save: no change
Goal: before picking a side the player sees what it does; the Factions drawer shows each border as a meter instead of text chips.
Files: js/career/front.js (`stakes`), js/ui/career-map.js (clashPanel), js/ui/career-week.js (factionsCard), css/career.css, tests/career.test.js
Do not: change Front.result / seize / pick (draw order, goldens); add randomness.
Steps:

1. `Front.stakes(run, w, l)` → `{ meter, seize, place }`: meter after a win (clamped as Front.result does), `seize` = true if that win seizes, `place` = the id Front.seize would take (null if none). Pure, no run mutation, test it.
2. clashPanel: under each fight button a line "Win → Wu 1/2 · +10 Wu, −10 Wei" and, when seize, "wins {place}". Drop the long tooltip duplicate of those numbers.
3. factionsCard: each border = a −2…+2 segmented bar (FRONT.seize) with the place at stake; remove the long footnote (keep it as an info tip).
   Accept:

- stakes() test: meter, seize flag and place match what Front.result then does.
- Battle card shows the stake line for both sides.
  QA: career run → force a clash, screenshot the battle card and Factions drawer.
  Result:

### [ ] T-093: Training card — time to the next point

Spec: §4.5 Goldens: unchanged Save: no change
Goal: the training card answers "what do I get?" at a glance and hides the rest.
Files: js/ui/career-map.js (trainSpot), css/career.css
Do not: change Training.preview / progress.
Steps:

1. Replace High / Mid / Low with "≈ N sessions to +1 {Stat}" (N = ceil((need − have) / xp), min 1) beside the bar of progress.
2. One muted meta line: stamina · $ · Lv; quality tag stays; streak / turf / sand / fail chips stay; the info text goes into one fold.
   Accept:

- Card is at most two lines before the button; N matches Training.progress.
  QA: career run → open a training spot, screenshot.
  Result:

### [ ] T-094: Hotkeys and end-week guard

Spec: §4.2 Goldens: unchanged Save: no change
Goal: 1–9 open the bottom-bar drawers, Space ends the week, Esc closes drawer / card; End week warns (inline, no confirm()) when days are unused.
Files: js/ui/career-hub.js, js/ui/career-week.js, js/ui/career-map.js, css/career.css
Do not: capture keys while typing in an input or during a match.
Accept: keys work on the hub only; unused days → button reads "End week (3 days left)" and needs a second click.
QA: career run → press keys.
Result:

## Later — outlines

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

T-001…T-089 (no T-012…T-015, T-021, T-033, T-049; T-082…T-088 open above). One line each; full text in git history.

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
- Voice: T-022 voice pass. Cleanup part 1: T-071–T-081.
- Cleanup part 2 (branch cleanup/part2): T-082 one HTML entry (inline import map: node_modules on localhost, CDN elsewhere; test3d.html gone) ·
  T-083 sfx internals in the `SOUND` closure, `Overlay` API for r3d / clock (A, cv, ctx, last stay global: used across render and UI) ·
  T-084 CSS: 89 declarations a later file already overrides removed, pixel diff 0.00 % · T-085 `Fight` (career/fight.js) split from `Cup`,
  data helpers moved to the engine, day / travel / fee tuning in one block · T-086 `run.warm` → `run.evals`, `warmup*` → `eval*`
  (RUN_VERSION 15) · T-087 tests: Goals, Sponsors, Storage, refused / repaired saves, map3d pure functions (103 tests).

## Unplanned changes

(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md)
