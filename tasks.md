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
- Phase 1 — Island rules ✓ · 1b — Match feel ✓ · 1c — Cut-scene lines ✓ · 2 — Faction pools (T-006/T-007 ✓, T-008 left)
- **Now — Cleanup + info**: remove Legacy (T-016); faction dossier model + window (T-017, T-018).
- **Phase 3 — Evaluations**: Academy squad (leave action); calendar → monthly evaluations; faction evaluations.
- **Phase 4 — U21 Final Cup**: 16-slot bracket; cup from drawn squads; retire the Skyline/Grand cups and the 8
  fixed teams.
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now

### [ ] T-016: Remove Legacy (unlocks, points, pure runs, Hall of Fame, legends) for good
Spec: §4.13, §5.3          Goldens: unchanged (career only)          Save: no change (old saves just carry unused
`legacy` / `pure` / `legend` fields; nothing reads them after this task)
Goal: No meta progression anywhere. Every career starts the same way (free agent, base budget and caps). Menu,
creation and run-end screens show nothing about Legacy.
Files: js/career/legacy.js (delete), js/ui/career-legacy.js → rename to js/ui/career-end.js (git mv; keep only the
run-end screen), index.html, test3d.html, js/career/run.js, js/career/cup.js, js/career/world.js, js/career/element.js
(comment), js/data/career.js, js/core/storage.js, js/ui/career-create.js, js/ui/career-week.js, js/ui/menu.js,
css/career.css, tests/run.js, ARCHITECTURE.md
Do not:
- Touch js/engine/* or the match. Remove challenge modes (Hard league, Short season stay, without multipliers).
- Remove the run-end screen, `rankOf` / `RANKS`, the growth chart or `finishRun`.
- Change `CAREER.budget`, `CAREER.createCap`, `CAREER.staMax` values.
Steps:
1. Delete js/career/legacy.js; move `rankOf` (and its doc comment) to the end of js/career/run.js.
2. `git mv js/ui/career-legacy.js js/ui/career-end.js`; keep `renderRunEnd`, `growthChart`, `finishRun`; delete
   `legacyShop`, `hallOfFame`, `buyUnlock`, `toggleUnlock`, `renderLegacy` and `Screens.legacy`. In `renderRunEnd`
   remove the "+N Legacy points" paragraph and `${legacyShop()}`; the "Double Crown" headline may stay (it only reads
   cups). Update both script tags (index.html, test3d.html) to `js/ui/career-end.js`; remove the legacy.js tags.
3. js/career/run.js `create`: drop `legacy`, `legend`, `inherit`, `spec.pure`, `spec.legend`, `spec.team`,
   `spec.skill` (always free agent: `free = true`, no starting skill → `skills: []`), the Hall-of-Fame block and
   `Run.addLegend` (delete the function), `Legacy.applyStart(run)`; `staMax = CAREER.staMax`. Remove run fields
   `legacy`, `pure`, `legend` and the "Inherited from…" log. `repair`: `run.staMax = CAREER.staMax` fallback.
   Update the `create` doc comment (spec = { role, name, alloc, witSteps, mode? }).
4. js/career/cup.js: `prepare` — remove the Home-crowd bonus (`home` = 0 → delete it); `end` — remove
   `Legacy.record`; `run.result = { place, rank, cups, champ }` (no `earned`). Fix the doc comment.
5. js/career/world.js transfers: `!p.legend` filter → remove the condition.
6. js/data/career.js: delete `DOUBLE_CROWN`, `PURE_BONUS`, `LEGACY_PER_FANS`, `UNLOCKS`; `MODES` loses the `legacy`
   field and its comment becomes "Challenge modes chosen at creation (optional handicaps)".
   js/core/storage.js: delete the `legacy` key from `KEYS`.
7. js/ui/career-create.js: remove `crList`, `crFit`, pure/legend/skill/team state and every Legacy call; budget =
   `CAREER.budget`, cap = `CAREER.createCap`. "Your team" panel → only the free-agent line. Challenge checkboxes stay
   without "×n" and with info text "Optional handicaps." `crStart` passes `{ role, name, alloc, witSteps, mode }`.
   Update the header comment.
8. js/ui/menu.js: remove the Legacy panel's points/runs line and the Unlocks button; keep the Skill encyclopedia
   button (panel title "Library"). js/ui/career-week.js: runtags without Pure run / Heir; cup info text without the
   "both cups: +N Legacy points" part.
9. css/career.css: delete rules used only by the shop / Hall of Fame (`.sk.own`, `.sk.own.off`, `.sk.own span`,
   `.hof`, `.hof li`, `.mleg` if unused afterwards). Grep each selector in js/ before deleting.
10. tests/run.js: delete the two Legacy tests; fix any test passing `pure`, `legend`, `team` or `skill` to
    `Run.create`. Add to an existing career test: `run.staMax === CAREER.staMax` and the run has no `legacy` key.
11. ARCHITECTURE.md: remove Legacy sections; mention career-end.js.
Accept:
- `grep -rn "Legacy\|UNLOCKS\|PURE_BONUS\|DOUBLE_CROWN\|hof\|legend" js tests index.html test3d.html` → only
  the run-end headline "Double Crown" (if kept) and nothing else.
- All tests + lint pass; goldens untouched; no js/engine change.
QA: menu (no Unlocks), new career screen (no pure/legend/skill/team), play a run to the end with Sim ⏭ → run-end
screen shows rank + chart, "New career" works. No pageerror.
Result:

### [ ] T-017: `Dossier.build(run, r)` — DOM-free faction dossier model
Spec: §4.12          Goldens: unchanged          Save: no change
Goal: One function returns everything the faction window shows, as plain data, with the scouting gate applied.
Files: js/career/dossier.js (new — index.html AND test3d.html right after js/career/mapmodel.js), tests/run.js,
ARCHITECTURE.md
Do not:
- Put any HTML in it, draw randoms, or mutate the run.
- Re-implement rules that exist: use `City.region/price/quality/access/rep/scouted`, `Front.*`, `World.canJoin`,
  `World.joinText`, `Pool.players`, `Training.facility(run, key) + 1` for the facility level (the Lv the map panel shows).
Steps:
1. New top-level `const Dossier = { build(run, r) { … } }` (allowed new global) returning:
   ```
   { id: r, name, color, kind: 'major'|'minor', desc,
     standing: City.rep(run, r),
     state: 'weakened'|'pressed'|'rising'|'stable'|'minor',
     fronts: [{ vs, meter }] (majors only), took: [spotId], lost: [spotId],
     priceMul, qMul,
     places: [{ id, name, train, price, q, known, level, seized, from, access: {ok, why} }],  // owned now, incl. seized
     clubs: [{ ti, name, color, ovr, join: World.joinText(ti, run), can: World.canJoin(run, ti) }],
     scouted, member,
     roster: [{ id, name, role, squad: team name | 'Reserve', ovr: number|null, el: key|null }] }
   ```
   - state: minors → 'minor'; `Front.weak` → 'weakened'; lost 1 → 'pressed'; gained > lost → 'rising'; else 'stable'.
   - places: every `SPOTS` id except `home` whose `City.region(run, id) === r` (so seized places count for the
     holder); `level` only for training places (`s.train`), else null; `seized = Front.seized(run, id)`, `from = SPOTS[id].region` when seized.
     `q`/`known` from `City.quality` (unknown → `q` = the region's advertised `REGIONS[..].q`, `known: false`).
   - scouted = any club of r scouted (`City.scouted`); member = `run.team != null && FACTIONS[run.team].region === r`.
   - roster: `Pool.players(run, r)`; `ovr`/`el` only when scouted or member (el only if `p.elOn`), else null.
2. tests/run.js — new test `'career: faction dossier — state, places, roster gate'`:
   - fresh run: Wei state 'stable', 4+ places, roster length = POOL.wei, all ovr null.
   - scout one Wei club (`City.scout`) → all Wei roster ovr are numbers.
   - seize a Wei place for Wu via `Front.seize` (or set `run.own`): it leaves Wei's places, appears in Wu's with
     `seized: true, from: 'wei'`; after a second loss Wei state is 'weakened'.
   - St. Gloria state 'minor', no fronts.
Accept:
- New test + all tests + lint pass; goldens untouched.
QA: none (headless).
Result:

### [ ] T-018: Faction dossier window
Spec: §4.12          Goldens: unchanged          Save: no change
Goal: A large card over the map shows one faction's dossier (from `Dossier.build`), opened from every HQ panel and
by clicking a faction's name in the Factions drawer.
Files: js/ui/career-dossier.js (new — index.html AND test3d.html right after js/ui/career-map.js), js/ui/career-map.js
(button in `hqPanel`), js/ui/career-week.js (`factionsCard`: name becomes a link), js/ui/career-hub.js (render the
window when open), css/career.css, ARCHITECTURE.md
Do not:
- Compute game data in the UI: render only `Dossier.build` output (plus existing actions: `joinClub`, `mapPick`).
- Add mobile layout work; no `confirm()`/`alert()`; escape every string with `esc()`.
Steps:
1. `CW.dossier` (region id or null). `openDossier(r)` / `closeDossier()` set it and `renderCareer()`.
2. js/ui/career-dossier.js `dossierCard(run, r)`: `<aside class="dossier">` with a close ✕ and sections:
   header (colour chip, name, kind, state badge, standing bar reusing `.rbar` markup from `factionsCard`);
   "Front" (majors: meters, took/lost lists, price ×, facilities ×); "Facilities" table (name, trains, $price,
   quality with "?" when not known, Lv, access ✓ or the `why` in a tooltip; seized rows tagged "seized from X",
   click a row → `closeDossier(); mapPick(id)`); "Clubs" (name, OVR, join text, Sign button when `can.ok` and you're
   a free agent — same `joinClub(ti)`); "Roster" (compact grid: name, role, squad; OVR / element or "unknown";
   a one-line note "Scout one of their clubs to see ratings" when not scouted).
3. `hqPanel`: add a `Dossier` button (opens the faction of that HQ). `factionsCard`: faction name →
   `<a href="#" onclick="hubOpen(null);openDossier('${r}');return false">`.
4. career-hub.js `renderCareer`: when `CW.dossier`, render `dossierCard(RUN, CW.dossier)` above the map layer
   (same layer as event cards). Esc closes it: extend the existing `keydown` listener in js/ui/dom.js only if that
   file is in this task — it isn't, so add a small listener in career-dossier.js (`if (e.key === 'Escape' && CW &&
   CW.dossier) closeDossier()`).
5. css/career.css: `.dossier` wide card (max-width ~760px, max-height 80vh, scroll inside), table rows compact;
   reuse theme tokens.
Accept:
- All tests + lint pass.
QA: career run → open Wei's HQ → Dossier: sections render, facilities list matches the map, roster shows "unknown";
scout a Wei club → reopen: ratings shown; Factions drawer → click "Shu Highlands" → Shu dossier. No pageerror;
screenshot in Result.
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Phase 2 (rest)
- T-008: League transfers move players between pools (reserves ↔ teams); reserves grow like team players.

Phase 3 — Evaluations
- T-009: Academy squad: rename pickup → Academy squad in UI/log; "Leave squad" action (inline confirm); alone
  state (no mates: training partners, outings and bonds handle an empty squad).
- T-010: Calendar: evaluation weeks 4–24 replace warm-ups; camp 26–28; eligibility by status (§4.11).
- T-011: Evaluation matches: Academy (vs a drawn major squad) and major-faction (drawn squads of your pool;
  not drawn → you watch). Rewards = warm-up rewards.

Phase 4 — U21 Final Cup
- T-012: 16-slot bracket with byes in js/game/bracket.js (8-team brackets keep working until T-013).
- T-013: U21 Final Cup from drawn squads + Academy squad; replaces both cups; Legacy keeps working
  (DOUBLE_CROWN becomes unreachable — leave it, spec §5.3 open).
- T-014: Retire the 8 fixed teams: `FACTIONS` becomes per region; HQ pins per faction; scouting per faction.

Phase 5 — Voice pass
- T-015: Faction `front`/`dark`, region `desc`, Gazette and event strings in lore.md §7 voices.

## Done
(one line each; full task text is in git history)
- [x] T-001: Rename Sacred Shrine Park → Central Academy — names/comments only; 21/21 + lint; career-run visual QA not run.
- [x] T-002: Facility access gate (grudge + owner condition) — ACCESS in world.js, City.access + gate in City.can; new test; 21/21 + lint; console QA not run.
- [x] T-003: Ball shadow circle on the floor — marker follows the ball exactly, hidden with it; widens + fades with height. Owner change in build chat: white outlined ring, no fill.
- [x] T-004: Spike approach — run-up point, take-off before the ball — QA 42 non-quick attacks: take-off 0.6–1.2 m in 90.5 %, end-of-set distance max 0.054 m, 0 over-sprint moves. Added: `direct` (too far to run up → straight to take-off), `via` back attack 2nd leg ends at take-off. Fix: jump serves excluded from approachOf.
- [x] T-005: 2–3 more line variants for every cut-scene kind — e282653 — 20 kinds × 5 personalities, 5–6 lines each (min 5, max 6), 245 added, all ≤ 40 chars; golden diff = `matches` only; 21/21 + lint; Max Hype scenes show new lines, no pageerror (bubble fit not visually confirmed).
- [x] T-006: Faction reserves — every faction becomes a roster (pool) of players — pools Wei 20 / Wu 14 / Shu 10 / Outlaws 6 / Gloria 5 (reserves 12/6/2/2/1 after league players); RUN_VERSION 2; Hard also boosts reserves; 22/22 + lint; goldens and js/engine untouched; QA: new run loads, map/HQ fine, no pageerror
- [x] T-007: `Pool.draw` — weighted squad draw from a faction pool — DRAW in world.js, Pool.draw in pool.js (you placed first in your role slot at standing ≥ 60; a free agent is never a candidate; role shortage → best remaining); new test; 23/23 + lint; goldens and js/engine untouched; headless only

## Unplanned changes
(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md)
