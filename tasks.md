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
- **Phase 1b — Match feel**: ball shadow; spike run-up approach.
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

## Now — Phase 1b: Match feel (renderer only — no engine change, goldens stay)

### [ ] T-003: Ball shadow circle on the floor
Spec: §2.6          Goldens: unchanged          Save: no change
Goal: While the ball is visible, a soft dark circle sits on the floor exactly under it (also while it floats high),
so players can read where it will come down.
Files: js/render3d/arena3d.mjs, js/render3d/r3d.mjs
Do not:
- Use the shadow map / `castShadow` for this (the sun's shadow is offset by the light angle; this marker must be
  straight below).
- Touch js/render/* or js/engine/* (no playback change).
- Draw randoms, or allocate objects per frame (reuse the mesh; no `new THREE.*` inside update functions).
Steps:
1. arena3d.mjs `buildArena` (next to the ball): create `ballShadow` = `THREE.Mesh(new THREE.CircleGeometry(0.2, 32),
   new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false }))`,
   `rotation.x = -Math.PI / 2`, `renderOrder = 2`, `castShadow = receiveShadow = false`, `visible = false`; add to
   the scene; return it in the world object (`ballShadow`).
2. arena3d.mjs: export `updateBallShadow(w)`: `s.visible = w.ball.visible`; if visible: `s.position.set(w.ball.position.x,
   0.012, w.ball.position.z)`; with `h = w.ball.position.y` (metres): `s.scale.setScalar(1 + Math.min(h, 8) * 0.12)` and
   `s.material.opacity = Math.max(0.12, 0.45 - Math.min(h, 8) * 0.04)`.
3. r3d.mjs: import it and call `updateBallShadow(w)` right after `handTouch(w, now)` in the frame (the hand-touch pull
   moves the ball after `updateBall`, so the shadow must read the final position). Add it to the import line from
   './arena3d.mjs'.
Accept:
- `npm test` and `npm run lint` pass.
QA: Monster game (QA recipe): screenshots at a serve toss, a high set and a ball about to land — the circle is under
the ball each time, smaller/fainter when high; hidden when the ball is hidden (between rallies). No pageerror.
Result:

### [ ] T-004: Spike approach — run-up point, take-off before the ball
Spec: §2.5          Goldens: unchanged          Save: no change
Goal: The hitter no longer runs straight to the hitting spot and jumps there. They run to a run-up point behind it
(already during the beat before the set), approach, take off before the contact spot, and the broad jump carries
them onto the ball — without any teleporting.
Background (read first): js/render/playback.js — `startBeat` ('slide' sets d.sx/sz/tx/tz/via), `applyBeat` (per-frame
moves via `capMove`, the `d.via` waypoint branch used by the long back attack), `tweenJump` (jump 'up' from `t0`),
`preDigLook`/`preDigGo` (the look-ahead pattern to copy: acting in the current beat on what the next beat needs),
`airMomentum`, `endBeat`, constants `MX`, `MZ`, `NETX` (500, from js/engine/court.js), `sprintOf`. The whole
rally's beats are known in advance (`A.beats`, `A.bi`). In the engine, the **set beat** holds, for the hitter:
`{k:'slide', p, x, z}` (the contact spot), `{k:'pose', pose:'spike'}`, `{k:'jump', mode:'up', t0, t1:1}` and
`{k:'ball', to:{p, c:'spike'}}` (the set arrives in the hand at t = 1).
Files: js/render/playback.js, ARCHITECTURE.md
Do not:
- Touch js/engine/* (no act kinds, no new act fields, no R()/rnd()/pick()) — everything is derived in playback.
- Change where contact happens: at t = 1 of the set beat the hitter is at the slide target (x, z), as today.
- Change quick attacks (jump `t0 < 0.3`): no run-up, no take-off offset.
- Remove or change the long back attack's `via` (it is its run-up already); only the take-off part (phase C) applies to it.
- Break the dig look-ahead (`preDigLook`), cut/scene beats (skip them like `preDigLook` does), or `separate()`.
Steps:
1. Constants (with doc comments) near `AIR_KEEP`: `RUNUP_M = 3` (run-up point: metres behind the contact spot, away
   from the net along x), `TAKEOFF_M = 0.9` (take-off point: metres before the contact spot), `PREAPP_AT = 0.35`
   (share of the beat before the set at which the hitter starts for the run-up point).
2. Helper `approachOf(b)` → `null | { p, cx, cz, rx, rz, ox, oz, t0 }` for a beat: find a `ball` act with
   `to.c === 'spike'` (not `when: 'end'`), its hitter's `slide` and `jump` (mode 'up') in the same beat; null if any
   is missing, if `t0 < 0.3`, or if `b.cut || b.scene`. `dir = Math.sign(cx - NETX)` (away from the net);
   run-up `rx = clamp(cx + dir * RUNUP_M / MX, 20, 980)`, `rz = cz`; take-off `ox = cx + dir * TAKEOFF_M / MX`,
   `oz = cz`. If the slide has a `via`, set `rx/rz` to null (no extra run-up).
3. Look-ahead in the beat before the set (copy the preDig pattern, call it next to `preDigLook(b)` in `startBeat`):
   `preApproachLook(b)` stores `A.preApp = approachOf(next beat)` plus the hitter id; in `applyBeat`, once
   `t >= PREAPP_AT`, `preApproachGo()` once: skip if the hitter touches the ball in the current beat (a `ball` act
   whose `to.p` is them), is in the air (`jy > 2`), diving, or has no run-up point; else set `d.sx/sz = d.x/z`,
   `d.tx/tz = rx/rz`, `d.carry = true` (as `preDigGo` does).
4. In the set beat: in `startBeat`, after the acts are processed, `d.app = approachOf(b)` for the hitter (with
   `at = 0` when the hitter is already within 0.5 m of the run-up point or further from the net than it, else
   `at = t0 * 0.45`; `at = 0` also when `rx` is null).
5. `applyBeat`, before the `d.via` branch, for a player with `d.app` (and not `waitLand`):
   - phase A `t < app.at`: `capMove` toward the run-up point, eased by `t / at`;
   - phase B `at ≤ t < t0`: `capMove` from the run-up point (or wherever they are) toward the take-off point with
     an ease-in `k*k` (accelerating run);
   - phase C `t ≥ t0` (airborne): on the first frame store `app.fx/fz = d.x/z`; then set `d.x/z` directly (no cap) to
     `lerp(fx, cx, u)` / `lerp(fz, cz, u)` with `u = (t - t0) / (1 - t0)`, so they arrive at the contact spot at t = 1.
   - `continue` (skip the generic move for this player).
   For the long back attack (`rx` null) phase A/B are the existing `via` behaviour: only apply phase C there.
6. `endBeat`: clear `d.app`; clear `A.preApp` in `startBeat` like `A.preDig`.
7. ARCHITECTURE.md: a short "Spike approach (playback)" note under the playback section: run-up / take-off /
   look-ahead, display only.
Accept:
- `npm test` and `npm run lint` pass; `git diff --stat` shows no js/engine changes; goldens untouched.
- QA measurement (Monster game, a temporary script — do not commit it): over ≥ 30 non-quick attacks log, for the
  hitter, (a) distance to the contact spot at take-off: 0.6–1.2 m in ≥ 90 % of attacks; (b) distance to the contact
  spot at the end of the set beat ≤ 0.1 m in all; (c) max grounded per-frame move ≤ `sprintOf(d) * dt * 1.1` (no
  teleport). Put the three numbers in `Result:`.
QA: Monster game: screenshots of one normal attack at set start, take-off and contact — the hitter visibly runs in
from behind and jumps before the ball's spot. Check `DBG.text()` for warnings.
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Phase 2 — Faction pools
- T-005: `POOL` data (sizes Wei 20, Wu 14, Shu 10, Outlaws 6, St. Gloria 5) + new `js/career/pool.js`: build
  `run.pool[region]` at run creation; the current teams' players join their region's pool, the rest generated.
  Save: RUN_VERSION bump. Teams still play as today.
- T-006: `Pool.draw(run, region, n)` — weighted squad draw (rating + standing, guaranteed spot above a threshold);
  headless tests only.
- T-007: League transfers move players between pools; joining a club = joining its faction's pool (`run.fac`).

Phase 3 — Evaluations
- T-008: Academy squad: rename pickup → Academy squad in UI/log; "Leave squad" action (inline confirm); alone
  state (no mates: training partners, outings and bonds handle an empty squad).
- T-009: Calendar: evaluation weeks 4–24 replace warm-ups; camp 26–28; eligibility by status (§4.11).
- T-010: Evaluation matches: Academy (vs a drawn major squad) and major-faction (drawn squads of your pool;
  not drawn → you watch). Rewards = warm-up rewards.

Phase 4 — U21 Final Cup
- T-011: 16-slot bracket with byes in js/game/bracket.js (8-team brackets keep working until T-012).
- T-012: U21 Final Cup from drawn squads + Academy squad; replaces both cups; Legacy keeps working
  (DOUBLE_CROWN becomes unreachable — leave it, spec §5.3 open).
- T-013: Retire the 8 fixed teams: `FACTIONS` becomes per region; HQ pins per faction; scouting per faction.

Phase 5 — Voice pass
- T-014: Faction `front`/`dark`, region `desc`, Gazette and event strings in lore.md §7 voices.

## Done
