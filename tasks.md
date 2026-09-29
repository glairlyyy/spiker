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
- **Phase 1 — Island rules** (small, independent): Central Academy rename; facility access gate.
- **Phase 2 — Faction pools** (data layer, no visible change): pools generated per faction; weighted squad draw.
- **Phase 3 — Evaluations**: Academy squad (leave action); calendar → monthly evaluations; faction evaluations.
- **Phase 4 — U21 Final Cup**: 16-slot bracket; cup from drawn squads; retire the Skyline/Grand cups and the 8
  fixed teams.
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — Phase 1: Island rules

### [ ] T-001: Rename Sacred Shrine Park → Central Academy
Spec: §4.2, lore.md §4          Goldens: unchanged          Save: no change
Goal: The neutral middle zone reads as Central Academy everywhere the player sees it. Internal ids stay the same.
Files: js/data/world.js, js/data/city.js, js/career/city.js, js/career/mapmodel.js, tests/run.js
Do not:
- Rename any id or key: region id `open`, spot id `park`, `CITY.park`, `CITY.label.open` stay as they are
  (saves, tests and the map use them).
- Touch the Shu spot `shrine` ("Shrine Library"): it is a different place and stays.
- Change what the park spot does (act `rec`: mood +1, stamina +10) or its position/radius.
- Add old-language words or lore exposition (spec §6).
Steps:
1. `REGIONS.open` in js/data/world.js: `name: 'Central Academy'`,
   `desc: 'Neutral ground by charter. Every newcomer enrols here. No faction may train, recruit or fight on campus.'`
2. `SPOTS.park` in js/data/city.js: `name: 'Academy Grounds'`, `icon: '🏛'`,
   `desc: 'Campus lawns, open to every student. Mood up, +10 stamina.'`
3. Update comments that say "shrine park" / "Sacred Shrine Park" in js/data/city.js (header line 2, the `park`
   comment above `CITY.park`), js/career/city.js (`regionAt` doc comment), js/career/mapmodel.js (land comment)
   to say "Central Academy".
4. tests/run.js: the `regionAt([500, 320])` assertion message → `'Central Academy belongs to nobody'` (value stays `'open'`).
Accept:
- `grep -rni "shrine park" js tests` returns nothing.
- `npm test` and `npm run lint` pass; goldens untouched.
QA: career run → the map label in the middle reads "Central Academy"; clicking it shows "Academy Grounds" with
the new description and a working Relax button.
Result:

### [ ] T-002: Facility access gate (grudge + owner condition)
Spec: §4.10          Goldens: unchanged          Save: no change
Goal: A place refuses you when you hold a grudge with its current owner or miss the owner's condition; the reason
shows on the disabled button. Members of the owning faction always get in.
Files: js/data/world.js, js/career/city.js, tests/run.js
Do not:
- Change `City.day`, `City.evening` or the UI: they already respect `City.can` (and the map panel shows `why` as
  the disabled button's tooltip).
- Gate Home (`act: 'rest'` without `hotel`), the Academy Grounds (region `open`) or pure travel (`City.travelTo`).
- Add conditions values beyond the empty defaults below (they come with the balance pass).
- Draw any random numbers.
Steps:
1. js/data/world.js, after `FRONT`: add a new top-level constant (allowed new global)
   ```js
   /**
    * Facility access: a place refuses you if your standing with its owner is at or below `grudge`, or you miss the
    * owner's condition (same fields as a club's `join`: ovr, key, star, fans). Members of the owner always get in.
    */
   const ACCESS = {
     grudge: -20,
     cond: { wei: {}, wu: {}, shu: {}, outlaws: {}, gloria: {} }
   };
   ```
2. js/career/city.js: add `City.access(run, id)` → `{ ok, why }`:
   - `s = SPOTS[id]`; if `s.region == null` or `s.region === 'open'` → ok. (Home has region null.)
   - `owner = City.region(run, id)` (already accounts for seized places via `run.own`).
   - member: `run.team != null && FACTIONS[run.team] && FACTIONS[run.team].region === owner` → ok.
   - `rep = City.rep(run, owner)`; if `rep <= ACCESS.grudge` →
     `{ ok: false, why: `${REGIONS[owner].name} won't let you in (standing ${rep})` }`.
   - `c = ACCESS.cond[owner] || {}`; build the missing list exactly like `World.canJoin` does for `ovr`, `key`,
     `star`, `fans` (same wording); if any missing → `{ ok: false, why: `${REGIONS[owner].name} asks for ${miss.join(', ')}` }`.
   - else ok.
3. In `City.can`, call `City.access` right after the `if (run.event)` check; return it when not ok.
4. tests/run.js: add assertions to the existing test `'career: island map — regions, prices, quality, far trips,
   outings, scouting, 7-day weeks, saved'` (or a new test right after it):
   - a Wei training spot is usable at standing 0; set `run.rep.wei = -20` → `City.can` not ok and `why` contains
     "won't let you in"; `run.rep.wei = -19` → ok.
   - at `run.rep.wei = -20`, sign the player with a Wei club (or set `run.team` to a Wei index) → ok.
   - temporarily set `ACCESS.cond.wei = { fans: 1e9 }` → not ok, `why` contains "asks for"; restore it to `{}` after.
   - Home and `park` stay usable at `run.rep` of −100 for every region.
Accept:
- New assertions pass; `npm test` and `npm run lint` pass; goldens untouched.
- A full headless run (existing test `'career: a full run reaches a result with sane values'`) still passes.
QA: career run → fight a street battle, then check a place of the side you fought against: with standing −10 it
still works; set `RUN.rep.<region> = -20` in the console and reopen the panel: the button is disabled with the
reason in its tooltip.
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Phase 2 — Faction pools
- T-003: `POOL` data (sizes Wei 20, Wu 14, Shu 10, Outlaws 6, St. Gloria 5) + new `js/career/pool.js`: build
  `run.pool[region]` at run creation; the current teams' players join their region's pool, the rest generated.
  Save: RUN_VERSION bump. Teams still play as today.
- T-004: `Pool.draw(run, region, n)` — weighted squad draw (rating + standing, guaranteed spot above a threshold);
  headless tests only.
- T-005: League transfers move players between pools; joining a club = joining its faction's pool (`run.fac`).

Phase 3 — Evaluations
- T-006: Academy squad: rename pickup → Academy squad in UI/log; "Leave squad" action (inline confirm); alone
  state (no mates: training partners, outings and bonds handle an empty squad).
- T-007: Calendar: evaluation weeks 4–24 replace warm-ups; camp 26–28; eligibility by status (§4.11).
- T-008: Evaluation matches: Academy (vs a drawn major squad) and major-faction (drawn squads of your pool;
  not drawn → you watch). Rewards = warm-up rewards.

Phase 4 — U21 Final Cup
- T-009: 16-slot bracket with byes in js/game/bracket.js (8-team brackets keep working until T-010).
- T-010: U21 Final Cup from drawn squads + Academy squad; replaces both cups; Legacy keeps working
  (DOUBLE_CROWN becomes unreachable — leave it, spec §5.3 open).
- T-011: Retire the 8 fixed teams: `FACTIONS` becomes per region; HQ pins per faction; scouting per faction.

Phase 5 — Voice pass
- T-012: Faction `front`/`dark`, region `desc`, Gazette and event strings in lore.md §7 voices.

## Done
