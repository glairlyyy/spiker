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
- Cleanup + info ✓ (T-016 Legacy removed, T-017/T-018 faction dossier)
- **Phase 3 — Evaluations** (now): reserves grow (T-008); Academy squad (T-009); `Eval` rules + calendar (T-010);
  evaluation match + card (T-011).
- **Phase 4 — U21 Final Cup**: 16-slot bracket; cup from drawn squads; retire the Skyline/Grand cups and the 8
  fixed teams.
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — Phase 3: Academy squad and monthly evaluations

### [ ] T-008: Reserves grow every week and get promoted on payday
Spec: §4.11          Goldens: unchanged (career only)          Save: no change
Goal: Faction reserves are not frozen: they train like everyone else, and each payday a faction's best reserve
replaces a weaker same-role player on one of its league squads (so pools stay alive for the draws).
Files: js/career/growth.js, js/career/world.js, js/data/world.js, tests/run.js
Do not:
- Touch `you`, the pickup squad or any team of another region. Break `World.transfers` (league poaching stays).
- Call `finalizeTeam` on a reserve with 0 players.
Steps:
1. `Growth.week`: after the `run.teams` loop, run the same per-player growth for every player of every
   `run.reserve[r].P` (`mate` = false, so no bond factor; same `spread` / star / OP chances; news uses `p.team.name`,
   which is "… reserves"), then `finalizeTeam(reserveTeam)` when it has players.
2. js/data/world.js: `const PROMOTE = { gap: 3 };` (allowed new global; doc: a reserve must beat the squad player's
   OVR by at least `gap`).
3. `World.promote(run)` (called in `World.payday` right after `World.transfers(run)`): for each region with a reserve,
   take its best reserve by `ovr`; find the weakest same-role player (not `you`) in that region's league teams; if
   `ovr(reserve) >= ovr(weak) + PROMOTE.gap`: swap them (swap `slot`, `num`, `team`, their places in `t.P` / `reserve.P`;
   re-set `t.s/t.mb/t.ws` like `World.join` does; `finalizeTeam` both) and `Run.news(run, `${REGIONS[r].name}:
   ${res.name} promoted to ${t.name}; ${weak.name} sent to the reserves.`)`. If you are on that team and bonded with
   the demoted player, remove their bond entry; give the new mate bond 0.
4. tests/run.js — new test `'career: reserves grow and get promoted'`: after 8 `Run.endWeek` calls a reserve player's
   stat sum rose; force a promotion (set a Wei reserve's stats to 95) and call `World.promote` → that player is now in
   a Wei league team, the demoted one in `run.reserve.wei.P`, every team still has 4 players, pool sizes unchanged.
Accept: all tests + lint; goldens untouched.
QA: none (headless).
Result:

### [ ] T-009: Academy squad — rename, leave, and the "alone" state
Spec: §4.1, §4.11, lore.md §4          Goldens: unchanged          Save: new field `run.academy` (default via repair; no
version bump)
Goal: The free agent's pickup squad is the Academy squad (three teammates Central Academy assigned). The player can
leave it at any time (inline confirm); afterwards they are alone: no teammates, no Academy evaluations, no rejoining.
Files: js/career/world.js, js/career/run.js, js/career/goals.js (step 3 guard only), js/ui/career-week.js,
js/ui/career-hub.js, js/ui/career-create.js, tests/run.js
Do not:
- Delete `run.pickup` or move `you` out of it while alone (many functions find `you` through `Run.myTeam`); being
  alone is only `run.academy === false` + no mates.
- Use `confirm()`; follow the inline-confirm pattern of `abandonRun()` in career-hub.js.
- Change what happens on signing (`World.join` still swaps you into the club; the replaced player drops into the
  pickup squad — fine).
Steps:
1. `World.pickup`: `name: 'Academy squad'`, `short: 'ACA'`, `arch: 'Assigned by Central Academy'`; doc comment says so.
2. `Run.create`: `academy: true` in the run object (comment: Academy squad member; false after leaving — no way
   back). `Run.repair`: `if (typeof run.academy !== 'boolean') run.academy = World.isFree(run);`
3. `Run.mates(run)`: return `[]` when `World.isFree(run) && run.academy === false`. Check every `Run.mates` caller
   still works with `[]` (training partners `Training.rollFloor`, `ramen` outing needs a mate → it simply can't be
   picked, bonds, goals' `low` teammate — guard `Run.mates(run)[0]` being undefined in js/career/goals.js: this file
   is allowed for that guard only).
4. `World.leaveAcademy(run)` → false if not a free agent or already left; else `run.academy = false`, log (registrar
   voice): `Academy squad: withdrawn at your request. Evaluation invitations cancelled.`
5. UI: in the Team drawer (`bondCard`), for a free agent still in the squad, a small "Leave squad" button with an
   inline confirm ("Leave for good? The Academy won't invite you again." Yes / No). While alone, the Team drawer
   shows one line: "No squad. The Academy no longer lists you." Texts that say "pickup squad" / "warm-ups" in
   career-create.js and `clubsCard` become "Academy squad" / "Academy evaluations".
6. tests/run.js: add to the free-agent test: `run.pickup.name === 'Academy squad'`; `World.leaveAcademy` → true,
   then `Run.mates(run).length === 0`, a second call → false; save → load keeps `academy: false`.
Accept: all tests + lint; goldens untouched.
QA: career run → Team drawer → Leave squad → confirm → drawer shows the alone line; outings that need a teammate are
disabled; no pageerror.
Result:

### [ ] T-010: `Eval` — monthly evaluation rules and calendar (headless)
Spec: §4.11          Goldens: unchanged          Save: new field `run.eval` (null by default; repair)
Goal: Weeks 4, 8, 12, 16, 20, 24 are evaluation weeks (warm-ups are gone). A DOM-free `Eval` module decides who
evaluates you and draws the squads; the match flow comes in T-011.
Files: js/career/eval.js (new — index.html AND test3d.html right after js/career/pool.js), js/data/career.js,
js/career/run.js, js/career/goals.js, tests/run.js, ARCHITECTURE.md
Do not:
- Touch the cups (Skyline / Grand stay until Phase 4) or `REWARDS` / `ECON` values.
- Call `finalizeTeam` on a temporary squad (it rewrites captains and numbers and draws randoms).
Steps:
1. js/data/career.js: `CALENDAR = { 4: 'eval', 8: 'eval', 12: 'eval', 16: 'eval', 20: 'eval', 24: 'eval', 26: 'camp',
   27: 'camp', 28: 'camp' }` (weeks 22–24 are no longer camp). New `const EVAL = { benchDays: 1 };` (allowed new
   global; doc: not selected → wit XP worth `benchDays` day-sessions of Wit training).
2. js/career/eval.js, top-level `const Eval = { … }` (allowed new global):
   - `kind(run)` → `'academy'` (free agent, `run.academy !== false`), `'faction'` (signed with a club whose
     `FACTIONS[..].region` is in `MAJORS`), else `null` (minor club, or alone).
   - `setup(run)` (idempotent per week; only when `CALENDAR[run.week] === 'eval'` and `kind` non-null) sets
     `run.eval = { week, kind, region, mine, opp }` with player **id** arrays:
     academy → `region = pick(MAJORS)`, `mine = null` (your side is the Academy squad), `opp` = ids of
     `Pool.draw(run, region, 1)[0]`;
     faction → `region` = your club's region; `squads = Pool.draw(run, region)`; `mine` = the squad containing you
     (null if you weren't drawn); `opp` = the next squad after yours (or the previous one if yours is last; null if
     there is only one squad or you weren't drawn).
   - `squad(run, ids, name, color)` → a temporary team `{ i: -2, name, short: 'EVL', color, sk: 'balanced',
     S: STYLES.balanced, hist: { w: 0, l: 0, sw: 0, sl: 0, res: [] }, nStars: 0, arch: 'Evaluation squad',
     coachIQ: 0.7, P }` with `P` = those players in [S, MB, WS, WS] order, `s/mb/ws` set, `cap` = highest `lead`,
     `ovr = teamOvr(T)`. Players are found by id in the region's pool (+ `you`).
   - `lend(run, T)` stores `[player, oldTeam]` pairs in a module variable and sets `p.team = T` (the engine reads
     `p.team`); `restore()` puts every player back. Both safe to call twice.
   - `bench(run)` → not selected: `Training.addXp(run, 'wit', Training.xpFor('wit', TRAININGS.wit.main[1], DAY_GAIN *
     EVAL.benchDays))`; returns the diary line `Not selected for the ${REGIONS[region].name} evaluation. Watched from
     the bench: ${label}.`
3. js/career/run.js: `weekType` → `'eval'` when `CALENDAR[run.week] === 'eval' && Eval.kind(run)`, else the old logic
   with 'eval' treated as `'train'`. Update its doc comment. `nextWeek`: call `Eval.setup(run)`. `create`: `eval:
   null`; `repair`: `if (run.eval && run.eval.week !== run.week) run.eval = null;` and call `Eval.setup(run)`.
4. js/career/goals.js: the "win" goal targets an `'eval'` week (was `'warmup'`), and only when `Eval.kind(run)` is
   `'academy'` (a faction member may not be drawn).
5. tests/run.js: the calendar test and every place that plays `'warmup'` weeks (the full-run test and the free-agent
   test) switch to `'eval'` weeks — for now they call `Eval.bench(run)` + `Run.endWeek(run)` on eval weeks (T-011 adds
   the match). New test `'career: evaluation rules'`: academy kind at start; `setup` on week 4 → `opp` has 4 ids of one
   major's pool, `mine` null; after `leaveAcademy` → kind null and week 4 is `'train'`; signed with a Wei club + rep 60 →
   `mine` contains you and `opp` is a different 4-id squad; St. Gloria member → kind null; `bench` raises wit XP;
   `lend`/`restore` round-trip leaves every `p.team` as before.
Accept: all tests + lint; goldens untouched.
QA: none (headless; the UI still shows the old warm-up card until T-011 — acceptable in between).
Result:

### [ ] T-011: Evaluation week — match, bench, and the eval card
Spec: §4.11          Goldens: unchanged          Save: no change
Goal: On an evaluation week the hub shows the evaluation card instead of the warm-up card: play or Sim ⏭ your
evaluation match (Academy squad vs a major's drawn squad, or your drawn faction squad vs another), or — not selected —
"Watch from the bench" (wit XP). Rewards = today's warm-up rewards.
Files: js/career/cup.js, js/ui/career-week.js, js/ui/career-hub.js, js/ui/career-map.js, tests/run.js
Do not:
- Change reward numbers. Add a new beat act kind or touch js/engine.
- Leave players lent: `Eval.restore()` must run on finish AND on leaving the match screen.
Steps:
1. `Cup.fixture(run, 'eval')`: `Eval.setup(run)`; mine = academy ? `Run.myTeam(run)` : `Eval.squad(run, run.eval.mine,
   `${club name} · Eval`, club colour)`; opp = `Eval.squad(run, run.eval.opp, `${REGIONS[region].name} · Eval`,
   REGIONS[region].color)`; `Eval.lend` both (not the Academy squad — it is a real team); round label `${Academy |
   REGIONS[region].name} evaluation (week N)`; `onFinish: m => { Eval.restore(); Cup.result(run, m, 'eval') }`;
   `onLeave: () => { Eval.restore(); navigate('career') }`.
2. `Cup.result`: treat `'eval'` exactly like `'warmup'` (rewards, prize money, `run.warm` entry, `Run.endWeek`).
   `Cup.warmupOpponent` stays but is unused by the hub.
3. js/ui/career-week.js: `evalPanel(run)` replaces `warmupPanel` in the hub: header "Week N: {Academy | Wei Dynasty}
   evaluation" with the reward info tooltip (same numbers); both squads listed (names, roles; ratings only if the
   dossier would show them — `Dossier.build(run, region).scouted || member`); buttons `Play evaluation` / `Sim ⏭`
   (`playCareer('eval')`); not selected → text "Not selected this month." and a `Watch from the bench` button →
   `Run.log(run, Eval.bench(run)); Run.endWeek(run); renderCareer()`. Calendar pips: 'eval' → label "Eval".
4. js/ui/career-hub.js / career-map.js: every `'warmup'` / `startsWith('warmup')` check becomes `'eval'`.
5. tests/run.js: the full-run and free-agent tests now play eval weeks through `Cup.fixture(run, 'eval')` (sim like
   the old warm-up code) or `Eval.bench` when `run.eval.mine` is null for a faction member; assert every `p.team`
   points back at its real team after each eval match.
Accept: all tests + lint; goldens untouched.
QA: career run → week 4 (use the week-end button) → evaluation card: Academy squad vs a major squad → Sim ⏭ → rewards
logged, week 5 starts; sign with a Wei club (set `RUN.money` high in the console), reach week 8 → faction evaluation
or "Not selected" + bench (wit progress in the log). No pageerror.
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Phase 4 — U21 Final Cup
- T-019: 16-slot bracket with byes in js/game/bracket.js (8-team brackets keep working until T-020).
- T-020: U21 Final Cup from drawn squads + Academy squad; replaces both cups.
- T-021: Retire the 8 fixed teams: `FACTIONS` becomes per region; HQ pins per faction; scouting per faction.

Phase 5 — Voice pass
- T-022: Faction `front`/`dark`, region `desc`, Gazette and event strings in lore.md §7 voices.

## Done
(one line each; full task text is in git history)
- [x] T-016: Remove Legacy (unlocks, points, pure runs, Hall of Fame, legends) for good — legacy.js deleted, career-legacy.js → career-end.js; Run.create always free agent; 21/21 + lint; grep clean (renamed chart-legend class to chartkey); goldens/engine untouched; QA: menu/create/run-end via Sim ⏭ (rank C + chart), no pageerror. Note: CLAUDE.md line 62 still lists “legacy” among ui screens
- [x] T-017: `Dossier.build(run, r)` — DOM-free faction dossier model — Dossier.build in js/career/dossier.js; new test (state, places incl. seized, roster gate, minor); 22/22 + lint; goldens untouched; headless only. Unscouted place quality = the region's advertised q (no qMul)
- [x] T-018: Faction dossier window — ui/career-dossier.js, HQ Dossier button, Factions-drawer name links, modal in hub, Esc closes; 22/22 + lint; QA: Wei dossier — 7 facilities = map, roster “unknown” until scouted then ratings; Shu opened from the Factions drawer; row click → map spot; no pageerror (screenshots taken, not committed)
- [x] T-001: Rename Sacred Shrine Park → Central Academy — names/comments only; 21/21 + lint; career-run visual QA not run.
- [x] T-002: Facility access gate (grudge + owner condition) — ACCESS in world.js, City.access + gate in City.can; new test; 21/21 + lint; console QA not run.
- [x] T-003: Ball shadow circle on the floor — marker follows the ball exactly, hidden with it; widens + fades with height. Owner change in build chat: white outlined ring, no fill.
- [x] T-004: Spike approach — run-up point, take-off before the ball — QA 42 non-quick attacks: take-off 0.6–1.2 m in 90.5 %, end-of-set distance max 0.054 m, 0 over-sprint moves. Added: `direct` (too far to run up → straight to take-off), `via` back attack 2nd leg ends at take-off. Fix: jump serves excluded from approachOf.
- [x] T-005: 2–3 more line variants for every cut-scene kind — e282653 — 20 kinds × 5 personalities, 5–6 lines each (min 5, max 6), 245 added, all ≤ 40 chars; golden diff = `matches` only; 21/21 + lint; Max Hype scenes show new lines, no pageerror (bubble fit not visually confirmed).
- [x] T-006: Faction reserves — every faction becomes a roster (pool) of players — pools Wei 20 / Wu 14 / Shu 10 / Outlaws 6 / Gloria 5 (reserves 12/6/2/2/1 after league players); RUN_VERSION 2; Hard also boosts reserves; 22/22 + lint; goldens and js/engine untouched; QA: new run loads, map/HQ fine, no pageerror
- [x] T-007: `Pool.draw` — weighted squad draw from a faction pool — DRAW in world.js, Pool.draw in pool.js (you placed first in your role slot at standing ≥ 60; a free agent is never a candidate; role shortage → best remaining); new test; 23/23 + lint; goldens and js/engine untouched; headless only

## Unplanned changes
(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md)
