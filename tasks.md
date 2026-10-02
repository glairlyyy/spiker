# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. **Later** items are outlines: the spec chat details them
(files, steps, accept) and moves them to Now. Next free id: **T-090** (T-082…T-088 are reserved below).

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

## State (2026-10-02)
Everything through T-089 is built and reviewed (main + branch `review/t061-t066`, 97 tests, RUN_VERSION 14).
Built areas: match engine (ego, block collision, subs/coach, stamina, elements, hype, 3D playback, Follow/POV cameras),
career (free agent start at 1, pools/evaluations/U21 cup, Story mode, growth & techniques, challenges & injuries,
rankings, roads/travel/town/venues, living map A, relationships T-060…T-066), voice pass, cleanup part 1.

## Now
(empty — pick from Later; the owner decides the next feature)

## Later — outlines
Features (spec first):
- Faction events that change the map (spec §4.24, draft — owner to confirm).
- Endless mode (spec §4.26: no guarantees; national call-up by grades).
- Living map layers B / C (spec §4.16: individual figures, approaches on the map).
- Balance pass (spec §4.10 condition values, §5.5 severe injury, hype frequency §2.3).

Cleanup, part 2 (behaviour-neutral unless noted; T-085 can now go: T-048 is done)
- T-082: One HTML entry — drop test3d.html; pick the importmap (CDN vs node_modules) with an inline script before any
  module; removes the "add to BOTH" rule.
- T-083: Namespaces — sfx internals in an IIFE (expose SND, sfx, bgm*, …); the overlay API r3d calls as `Overlay`;
  match-screen's `A`/`cv`/`ctx`/`last` globals.
- T-084: Cross-file CSS — the ~74 selectors defined in 2–3 files: layout in style.css/career.css, surface in theme.css.
- T-085: cup.js split (bracket/fixtures vs fight.js: challenge, clash, lose, injure, hired); data files lose their
  logic (callLine, confidence, epair, hasTech, skillRoleOk, leadLv → engine/career); day/travel tuning grouped
  (`WEEK_DAYS`, `DAY_GAIN`, `TRIP_*`, `TRAIN_FEE`, `TURF_BONUS`, `HOTEL`).
- T-086: `run.warm` / `warmupWin|Loss` → `eval*` (RUN_VERSION bump).
- T-087: Coverage gaps — Goals, Storage with a throwing localStorage, old-save load, map3d pure functions (heightAt,
  toMap/toWorld, inside/edgeDist; needs three from T-071).
- T-088: Big binaries — keep base64 for the artifact but store .glb/.mp3 in Git LFS and generate the .txt at publish.

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

## Unplanned changes
(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md)
