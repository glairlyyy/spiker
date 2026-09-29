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
- **Phase 1c — Cut-scene lines**: more variants (golden `matches` update only).
- **Phase 2 — Faction pools** (data layer, no visible change): pools generated per faction; weighted squad draw.
- **Phase 3 — Evaluations**: Academy squad (leave action); calendar → monthly evaluations; faction evaluations.
- **Phase 4 — U21 Final Cup**: 16-slot bracket; cup from drawn squads; retire the Skyline/Grand cups and the 8
  fixed teams.
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — Phase 1: Island rules

### [x] T-001: Rename Sacred Shrine Park → Central Academy
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
Result: names/comments only; 21/21 + lint; career-run visual QA not run.

### [x] T-002: Facility access gate (grudge + owner condition)
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
Result: ACCESS in world.js, City.access + gate in City.can; new test; 21/21 + lint; console QA not run.

## Now — Phase 1b: Match feel (renderer only — no engine change, goldens stay)

### [x] T-003: Ball shadow circle on the floor
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
Result: marker follows the ball exactly, hidden with it; widens + fades with height. Owner change in build chat: white outlined ring, no fill.

### [x] T-004: Spike approach — run-up point, take-off before the ball
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
Result: QA 42 non-quick attacks: take-off 0.6–1.2 m in 90.5 %, end-of-set distance max 0.054 m, 0 over-sprint moves. Added: `direct` (too far to run up → straight to take-off), `via` back attack 2nd leg ends at take-off. Fix: jump serves excluded from approachOf.

## Now — Phase 1c: Cut-scene lines

### [ ] T-005: 2–3 more line variants for every cut-scene kind
Spec: §2.8          Goldens: update — `matches` ONLY (beat text changes); `teams`, `sims`, `monster` must stay identical
Save: no change
Goal: Every staged-scene / chatter line kind has 5–6 variants per personality instead of 3, so scenes repeat less.
Files: js/data/dialogue.js, tests/golden.json (via `npm run test:update`)
Do not:
- Touch js/engine/hype.js or the picking formula (`hypeLine`: hash of number + score + kind length, no R()).
- Add or rename kinds or personalities, or placeholders other than `{sig}`, `{mate}`, `{opp}` — and use a placeholder
  only in kinds whose existing lines already use it.
- Change `CALLS` (ball calls; not cut scenes).
- Add old-language words or lore exposition (spec §6); keep each line short (≤ 40 characters), the same punctuation
  style (’ … —), in that personality's voice: hot = loud/!!, cool = terse, cocky = taunting, shy = hesitant,
  leader = team-first.
Steps:
1. In `LINES` (js/data/dialogue.js), for all 19 kinds × 5 personalities, append 2–3 new lines (never edit or reorder
   the existing 3). No duplicates within a list.
2. `npm test`: only the `matches` golden may fail. If `teams`, `sims` or `monster` fails, stop — something besides
   text changed.
3. `npm run test:update`, then `npm test` passes. `git diff tests/golden.json` must show only the `matches` line.
4. Commit message states the reason: "matches golden: new dialogue text in scene beats; no gameplay change".
Accept:
- Each `LINES[kind][pers]` has length 5 or 6 (check with a one-off node snippet; put the min/max in Result).
- golden.json diff = the `matches` line only; 21/21 + lint pass.
QA: Monster game on Max Hype: watch 2 scenes, lines render and fit the bubble; no pageerror.
Result:

## Now — Phase 2: Faction pools (data layer; nothing visible changes)

### [ ] T-006: Faction reserves — every faction becomes a roster (pool) of players
Spec: §4.11          Goldens: unchanged (career only; engine untouched)          Save: RUN_VERSION 1 → 2 (new
`run.reserve`); no migration: old saves are dropped (`load` returns null), acceptable in development
Goal: Each faction has a pool of players = its league-team players + generated **reserves**, sized Wei 20, Wu 14,
Shu 10, Outlaws 6, St. Gloria 5. Teams still play exactly as today; reserves are stored and saved but not used yet.
Background: `Run.draft()` makes the 8 league teams (`mkLeagueTeams`) and rolls each player's `pot`;
`Run.create()` inserts you, applies Hard mode (+5 stats, +0.25 pot to every non-you player of `teams`), saves via
`teamToJSON`/`teamFromJSON` (js/engine/save.js). `FACTIONS[t.i].region` gives a team's faction region.
`mkPlayer(role, slot, bonus, team, used)` needs `team.S.bias`. `finalizeTeam(t)` assigns leadership, the hidden
element (`elAssign`), captain and shirt numbers.
Files: js/data/world.js, js/career/pool.js (new — add to index.html AND test3d.html right after
`js/career/world.js`), js/career/run.js, tests/run.js, ARCHITECTURE.md
Do not:
- Touch js/engine/* (no golden change). Change `mkLeagueTeams`, the 8 teams, `FACTIONS`, cups, UI or growth.
- Put `you` or the pickup squad's players in a reserve.
- Share a player object between a team and a reserve (a player lives in exactly one place).
- Write a save migration (old saves are simply dropped).
Steps:
1. js/data/world.js, after `ACCESS`: new top-level constant (allowed new global)
   ```js
   /** Faction pool sizes (players, league-team players included): the rest are generated reserves. */
   const POOL = { wei: 20, wu: 14, shu: 10, outlaws: 6, gloria: 5 };
   ```
2. js/career/pool.js (new), top-level `const Pool = { ... }` (allowed new global):
   - `build(teams, used)` → `{ [region]: reserveTeam }` for every key of `POOL`. `n = POOL[r] − (number of players
     in teams whose FACTIONS[t.i].region === r)`, min 0. `reserveTeam = { i: -1, name: `${REGIONS[r].name} reserves`,
     short: 'RES', color: REGIONS[r].color, sk: 'balanced', S: STYLES.balanced, hist: { w: 0, l: 0, sw: 0, sl: 0,
     res: [] }, nStars: 0, arch: 'Reserves', region: r, P: [] }`. For k = 0..n−1: role = `['S','MB','WS','WS'][k % 4]`,
     slot = `['S','MB','W0','W1'][k % 4]`; `p = mkPlayer(role, slot, 0, reserveTeam, used)`;
     `p.pot = +rnd(GROWTH.pot[0], GROWTH.pot[1]).toFixed(2)`; push to `P`. Then `finalizeTeam(reserveTeam)` if `P.length`.
     Iterate regions in `Object.keys(POOL)` order (determinism).
   - `players(run, r)` → the team players of region r (all `run.teams` with `FACTIONS[t.i].region === r`, every
     `t.P` player) followed by `run.reserve[r].P` (empty if missing).
   - `size(run, r)` → `Pool.players(run, r).length`.
3. js/career/run.js:
   - `draft()`: after the `pot` loop and the faction rebrand: `const used = new Set(teams.flatMap(t => t.P.map(p => p.name)));`
     `const reserve = Pool.build(teams, used);` return `{ teams, team, reserve }`.
   - `create()`: take `reserve = draft.reserve || Pool.build(teams, new Set(...names...))`; the pickup squad's
     `used` set must also include reserve names; the Hard-mode loop also covers every reserve player (same +5 stats /
     +0.25 pot, then `finalizeTeam(reserveTeam)`); add `reserve` to the run object (next to `pickup`, comment
     `// faction pools: generated players outside the league teams (see js/career/pool.js)`).
   - `save`: also `reserve: Object.fromEntries(Object.entries(run.reserve || {}).map(([r, t]) => [r, teamToJSON(t)]))`;
     `load`: the same with `teamFromJSON`.
   - `repair`: `if (!run.reserve || typeof run.reserve !== 'object') run.reserve = {};`
   - `RUN_VERSION = 2` (leave `RUN_MIGRATIONS` empty; update its comment: "v2: faction reserves — older saves dropped").
4. tests/run.js — new test `'career: faction pools — sizes, reserves, no overlap, saved'`:
   - `Pool.size(run, r) === POOL[r]` for every region.
   - every reserve player has `team === run.reserve[r]`; `you` and pickup players are in no reserve.
   - all player ids across `run.teams`, `run.pickup`, `run.reserve` are unique.
   - save → load: same reserve ids, names and stats per region; players re-linked (`p.team === back.reserve[r]`).
   - a Hard-mode run (`mode: { hard: true }`): a reserve player's stats are ≥ those of the same seed without Hard.
5. ARCHITECTURE.md: "Faction pools" note (reserves, `Pool.players`, save field `reserve`, v2).
Accept:
- 22/22 + lint pass; goldens untouched; `git diff --stat` shows no js/engine changes.
QA: career run → start a new run: no page error; the map and HQ panels look as before.
Result:

### [ ] T-007: `Pool.draw` — weighted squad draw from a faction pool
Spec: §4.11          Goldens: unchanged          Save: no change
Goal: A tested, pure function that draws squads of 4 (setter, middle, two wings) from a faction's pool, favouring
better players, and giving you a spot by standing. Not wired into any match yet (T-011, T-013 use it).
Files: js/data/world.js, js/career/pool.js, tests/run.js
Do not:
- Mutate `run.teams`, reserves or players (no `team`/`slot` changes): return new arrays only.
- Wire it into cups, warm-ups or UI.
Steps:
1. js/data/world.js, after `POOL`: new top-level constant (allowed new global): `const DRAW = { floor: 40, span: 20, minW: 0.1, repPer: 50, sure: 60 };` with a doc comment:
   weight = max(minW, (ovr − floor) / span); your weight × (1 + max(0, standing) / repPer); standing ≥ sure → always drawn.
2. `Pool.draw(run, r, n)` → array of `n` squads (default `Math.floor(Pool.size(run, r) / 4)`), each
   `[S, MB, WS, WS]` (player objects):
   - candidates = `Pool.players(run, r)`; `you` is a candidate only if signed with region r
     (`run.team != null && FACTIONS[run.team].region === r`), else excluded.
   - if `you` is a candidate and `City.rep(run, r) >= DRAW.sure`, you are placed first in squad 1 in your role's slot.
   - fill role by role per squad: S slot from role 'S', MB from 'MB', two wings from 'WS'; each pick is weighted
     (`wpick(list, weightFn)` from js/core/rng.js); a picked player is removed from candidates.
   - a role running out: take the highest-weight remaining player of any role for that slot.
   - fewer than 4 candidates left → stop (return the squads made so far).
3. tests/run.js — new test `'career: pool draw — squads, roles, weights, your spot'`:
   - Wei default draw → 5 squads of 4, no player twice, each squad has a setter and a middle.
   - over 300 draws (fresh seed each) the 5 highest-rated Wei players are drawn more often than the 5 lowest.
   - signed with a Wei club and `run.rep.wei = 60` → you are in every draw; free agent → never.
   - `run.teams` and reserves are deep-equal before/after (compare `teamToJSON`).
Accept:
- 23/23 + lint; goldens untouched.
QA: none (headless only).
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Phase 3 — Evaluations**: Academy squad (leave action); calendar → monthly evaluations; faction evaluations.
- **Phase 4 — U21 Final Cup**: 16-slot bracket; cup from drawn squads; retire the Skyline/Grand cups and the 8
  fixed teams.
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — Phase 1: Island rules

### [x] T-001: Rename Sacred Shrine Park → Central Academy
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
Result: names/comments only; 21/21 + lint; career-run visual QA not run.

### [x] T-002: Facility access gate (grudge + owner condition)
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
Result: ACCESS in world.js, City.access + gate in City.can; new test; 21/21 + lint; console QA not run.

## Now — Phase 1b: Match feel (renderer only — no engine change, goldens stay)

### [x] T-003: Ball shadow circle on the floor
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
Result: marker follows the ball exactly, hidden with it; widens + fades with height. Owner change in build chat: white outlined ring, no fill.

### [x] T-004: Spike approach — run-up point, take-off before the ball
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
Result: QA 42 non-quick attacks: take-off 0.6–1.2 m in 90.5 %, end-of-set distance max 0.054 m, 0 over-sprint moves. Added: `direct` (too far to run up → straight to take-off), `via` back attack 2nd leg ends at take-off. Fix: jump serves excluded from approachOf.

## Now — Phase 1c: Cut-scene lines

### [ ] T-005: 2–3 more line variants for every cut-scene kind
Spec: §2.8          Goldens: update — `matches` ONLY (beat text changes); `teams`, `sims`, `monster` must stay identical
Save: no change
Goal: Every staged-scene / chatter line kind has 5–6 variants per personality instead of 3, so scenes repeat less.
Files: js/data/dialogue.js, tests/golden.json (via `npm run test:update`)
Do not:
- Touch js/engine/hype.js or the picking formula (`hypeLine`: hash of number + score + kind length, no R()).
- Add or rename kinds or personalities, or placeholders other than `{sig}`, `{mate}`, `{opp}` — and use a placeholder
  only in kinds whose existing lines already use it.
- Change `CALLS` (ball calls; not cut scenes).
- Add old-language words or lore exposition (spec §6); keep each line short (≤ 40 characters), the same punctuation
  style (’ … —), in that personality's voice: hot = loud/!!, cool = terse, cocky = taunting, shy = hesitant,
  leader = team-first.
Steps:
1. In `LINES` (js/data/dialogue.js), for all 19 kinds × 5 personalities, append 2–3 new lines (never edit or reorder
   the existing 3). No duplicates within a list.
2. `npm test`: only the `matches` golden may fail. If `teams`, `sims` or `monster` fails, stop — something besides
   text changed.
3. `npm run test:update`, then `npm test` passes. `git diff tests/golden.json` must show only the `matches` line.
4. Commit message states the reason: "matches golden: new dialogue text in scene beats; no gameplay change".
Accept:
- Each `LINES[kind][pers]` has length 5 or 6 (check with a one-off node snippet; put the min/max in Result).
- golden.json diff = the `matches` line only; 21/21 + lint pass.
QA: Monster game on Max Hype: watch 2 scenes, lines render and fit the bubble; no pageerror.
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Phase 2 — Faction pools
- T-006: `POOL` data (sizes Wei 20, Wu 14, Shu 10, Outlaws 6, St. Gloria 5) + new `js/career/pool.js`: build
  `run.pool[region]` at run creation; the current teams' players join their region's pool, the rest generated.
  Save: RUN_VERSION bump. Teams still play as today.
- T-007: `Pool.draw(run, region, n)` — weighted squad draw (rating + standing, guaranteed spot above a threshold);
  headless tests only.

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

## Unplanned changes
(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md)
- Recorded in spec §2.7: jump-float / standing-float serve poses, set-ready hands, white ring marker (T-003).
