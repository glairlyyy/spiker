# Skyline Cup 3D — architecture

A 4v4 anime volleyball simulator drawn in 3D. Plain HTML + CSS + classic `<script>` files (no build step), plus
ES modules for the 3D renderer (`js/render3d/`, loaded with `import()`).
Scripts share one global scope and load in the order listed in `index.html`; a file may only use
earlier files **at load time** (inside functions, anything loaded is fine).

## Layers

| Layer | Folder | Rule |
|---|---|---|
| Core | `js/core/` | `debuglog.js` (loaded first: `DBG` collects errors, console errors/warnings and match stalls; the header's Debug log button shows and copies them), `rng.js` (all randomness via `R()`, seedable with `RNG.seed(n)`), `storage.js` (all `localStorage` via `store`, keys in `KEYS`). |
| Data | `js/data/` | Constants only — playstyles, names, looks, moves, roles, elements, `RULES`. No logic. |
| Engine | `js/engine/` | Pure simulation. **No DOM, canvas or audio.** Runs headless (odds, preseason, tests). |
| Audio | `js/audio/` | Synthesized WebAudio effects (`sfx.*`). |
| Game | `js/game/` | Global state `G` (settings, current screen), screen router (`Screens`, `navigate()`), bracket helpers (career Cup). |
| Career | `js/career/` | Career-mode rules (run, training, events, skills, Cup, Legacy). **No DOM** — testable headlessly. |
| UI | `js/ui/` | DOM screens: menu, match screen, career create/week/result, Legacy, skill encyclopedia. |
| Render | `js/render/`, `js/render3d/` | Beat playback and the screen-space layer (canvas); the 3D scene, players and poses (three.js + VRM). |

## Engine flow

```
mkTeams() ─► simBalance() ─► newMatch(a, b, record)
                                   │
                    playRally(m) ──┤ serve → receive (engine/serve.js) → rally(m, …) loop (engine/rally.js)
                                   │   uses Formula.* (engine/formulas.js)
                                   ▼
                              end(m, winner)  scoring, momentum, zone, captain's call, timeouts
```

- `rally()` runs one possession per loop turn through phases that take a possession context `c`
  (`{ m, B, V, atk, ds, pas, qual, … }`): `freeBall → pickSetter → setterDump → setHands → chooseAttack → badSetOver`
  (`engine/rally-phases.js`), then the approach/spike core inline in `rally.js`, then `block → dig`
  (`engine/rally-defense.js`). A phase returns `{ point: side }`, `{ next: [atk, pas, qual] }`, its values, or nothing.
  **Random rolls must stay in the same order** — the golden tests catch any change.
- `record = false` → pure simulation (fast; used for odds and preseason).
- `record = true` → `playRally` also returns **beats**: timed lists of acts such as
  `{k:'slide'}`, `{k:'jump'}`, `{k:'ball'}`, `{k:'burst'}`, `{k:'log'}`.
  The engine never draws; `render/playback.js` plays the beats.
- Adding a visual event: emit `{k:'myAct', …}` from the engine, handle it in `instant()`
  (one-shot) or `startBeat()`/`applyBeat()` (tweened) in `render/playback.js`.

## Players and teams

- `createPlayer(spec)` — the one place that defines a player object (stats clamped 25–99).
- `mkPlayer(...)` — random player = `rollStats` + `rollWit` + `rollName` + look/moves → `createPlayer`.
- `finalizeTeam(t)` — leadership, captain, coach, shirt numbers, rating. Keeps values already set,
  so a hand-made player can be dropped into a roster and the team re-finalized.

## Effective stats and formulas

- `engine/stats.js` — what a player's stats are *right now*: wit × mood × momentum × stamina (`effP`, `effD`, `W`, `jumpPx`…).
- `engine/formulas.js` — `Formula.*` holds the numbers that decide outcomes (serve, receive, set, spike,
  block, dig, kill chance). Balance changes and future training effects belong here.

## Screens

`menu`, `match`, `create`, `career`, `legacy`, `encyclopedia` — switch with `navigate(name, …args)`.
The match screen takes a fixture: `navigate('match', { a, b, round, back, onFinish(m) → message, onLeave() })`
(career Cup and league games, the Monster exhibition). There is no stand-alone tournament/betting mode.

## Career mode

- `RUN` is the active run (`career/run.js`); saved to `KEYS.career` after every week (`teamToJSON`/`teamFromJSON` in `engine/save.js`).
- **Season:** 28 weeks in two blocks — weeks 1–24 then the **Skyline Cup**, weeks 25–28 then the seeded **Grand Cup**
  (`CUPS` in `data/career.js`; ×1.5 rewards). Losing the Skyline Cup no longer ends the run; each cup pays placement
  rewards (`PLACES`) and winning both is a Double Crown. `Run.weekType` is 'cup' while `run.cup` is live.
- **Training depth** (`career/training.js`, `TRAIN_X`): facility Lv 1–5 by use, Hard option, same-training streaks,
  steeper diminishing returns, Limit Break gates at 80 and 90 (a trial event when a stat reaches its gate), injuries
  when a session fails while exhausted (light training until healed, or the physio).
- **Goals and sponsors** (`career/goals.js`): the coach sets a goal per block (`BLOCKS`), checked at the block's last
  week; sponsors make offers at fan milestones (a `pre` event shown before the week's choice) with a perk kept while a
  condition holds.
- **Matches** (`career/cup.js`): an S–C grade from your own line scales that match's rewards; a pre-match focus goal;
  a captain's team talk before Cup matches (applied in `Cup.prepare` and the fixture's `setup(m)` hook).
- Content is data: `data/career.js` (numbers, trainings, calendar, cups, rewards, ranks, unlocks, sponsors, modes),
  `data/events.js`, `data/skills.js`. Special events ('limit', 'sponsor') are built in `Events.def`.
- Skills reach the engine only through `skillMod(p, key)` and bonds through `bondCombo(a, b)` (`engine/skills.js`);
  both are neutral for normal players and draw no random numbers.
- **Legacy** (`career/legacy.js`, `KEYS.legacy`): points per run (× challenge modes `MODES` and the pure-run bonus),
  unlocks that can each be switched off (`off`), a run keeps the set that was on when it started (`run.legacy`,
  `Legacy.on`). The **Hall of Fame** keeps the 6 best careers: a new player can inherit from one, and legends may
  appear as stars on other teams.
- UI: `ui/icons.js` draws the active (bolt + type) / passive (aura) skill icons used in the shop, player card and
  encyclopedia; the result screen has a season growth chart from `run.hist`.

## 3D renderer (js/render3d/)

Skyline Cup 3D draws every match (career, Monster) with VRM anime players. It is a **renderer only**:
`render/playback.js` still turns beats into display state every frame (`A.disp`, `A.ball`, `A.cam`, `A.zoom`,
particles, labels) and `draw()` hands off to `R3D.draw()`. The classic 2D court lives on as a separate legacy
artifact; its drawing code was removed here (only the screen-space layer in `render/court.js` remains, plus
`faceSVG` portraits for the UI).

- **One world, built once.** `main.js` starts `load3D()` in the background at boot: import three.js + three-vrm
  (jsDelivr, import map in `index.html`), download the model, parse 8 players + 2 coaches, build the arena. Each
  match only re-dresses it (`bind()`: kits, hair/skin/eye colours, heights, crowd colours, LED board). Play holds
  (`A.hold`) until it is ready; if WebGL or the download fails, the loading card links to the legacy 2D version.
- **`P()` is the bridge**: `P3D` projects court points through the current 3D camera, so every effect, label,
  push-in and sound pan the playback layer creates lands on the scene. The view transform (`applyView()`:
  screen = f·p + o) is applied to the projection for shake/push-in/zoom, then the screen-space layer (`drawTags`,
  `drawTrail`, `drawFloorFx`, `drawChant`, `drawFx`) is drawn on the transparent canvas on top. Units: x/1000 →
  20.4 m court, z → 12 m, height 150 = the 2.43 m net tape (`W()`). Cameras: courtside (default) and broadcast.
- `players3d.mjs` — VRM loading, repeatable dressing, pose → normalized bones, smoothing, arm aiming at the ball
  (`torsoDir`/`bendArm`), feet on the floor, expressions.
- `poses3d.mjs` — one pose per engine pose, driven by the same values the playback layer keeps (swing/spike
  timers, jump arcs, `diveShape`, `setMotion`) plus **measured motion** from `r3d.mjs` (`motion()`: speed,
  forward/lateral velocity, gait phase advanced by distance so feet don't slide). Locomotion blends keyframed
  walk → run cycles (Catmull-Rom over contact / mid-stance / push-off / swing), backpedal and side shuffle. The
  spike is timed off the jump: run-in → penultimate step (arms back high) → plant/load → two-arm take-off →
  "bow and arrow" (non-hitting arm points at the ball, hitting elbow drawn back above the shoulder, chest open,
  knees bent behind) → uncoil square to the net → contact on a straight arm above the hitting shoulder, open palm
  (keys carry a palm direction, `palmTwist`) → wrist snap → arm across to the opposite hip → soft two-foot landing,
  with per-style arm tracks (normal, cut, tip, quick; power arches more, pipe splits the legs). The playback starts
  the swing `swingLead` ms before the ball arrives, so the hand meets it at the top of the jump (held through
  cut-ins). Contact heights come from the hitter's body height (`reachH`) plus the jump the stats give
  (`jumpPx`); in the air `groundSnap` carries the jump on the hips, so tucked legs don't eat it. Serve tosses go
  up well above the hand and drop into it. A test checks every engine pose has a 3D version.
- Moving: players face where they run on long moves (back to position, to the bench for a timeout) and turn back
  to the ball when close; in a huddle they face the coach. A dive turns the whole body to its launch direction.
  The engine decides dig/receive on reachability (`mustDive`, engine/match.js): a ball the player can run to in the
  beat's time is played on the feet (bump), otherwise they dive; pancakes and technique saves always dive.
  Moves never go faster than a sprint (`capMove`, playback): a move the beat is too short for carries into the next.
- Not ready: a player who dove (or is running back in from a jump serve) is `busy` through the next possession
  (`m.busy`, reset each rally). The setter choice and the attack pool skip busy players, so free teammates are set
  and call for the ball. A player who is still in
  the air when a move starts waits to land, then runs (`waitLand`, carried into the next beat if needed).
- Jumps come down under real gravity (h = h0 − ½·g·t², `fallMs` in playback), carried across beats until touchdown;
  landing poses are timed from touchdown (`landMs`). A slide act may carry `via` (run through a waypoint first) and
  `air` (a broad jump's flight, allowed in the air).
- Dive (`divePose`, keyed on time / beat time, the ball arriving at 1): low base and lunge on the dominant leg →
  drive forward and low → one reaching hand under the ball (pancake flat, else a fist pop) → land on chest/stomach,
  chin up, back arched, the other hand cushioning like a push-up → momentum slide, legs slightly bent → squat → ready.
- `fx3d.mjs` — 3D effects: GPU particles (glow / spark / smoke), lightning tubes, shockwave rings, bouncing rocks,
  one style per team element. `render/effects.js` hands its entry points (`burst`, `impact`, `elemBurst`,
  `elemImpact`, `elemTrail`, `zap`, `bolt`) to `R3D.fx`, anchored at the ball; powered balls also glow and light
  the players; OP players crackle with arcs in the air. Labels, speed lines, the drill wall and cut-ins stay as
  the stylised screen layer.
- `trails3d.mjs` — light trails (camera-facing ribbons that taper and fade with age): hands in the player's hair
  colour (stars a narrower, shorter streak, OP players a wide long one, stronger in the zone), and Kuroko-style eye
  streaks in the eye colour that flow back behind the head (`drift`) — anyone while their team is in the zone or they carry a captain's buff.
- Model: `assets/vrm/` (licence, and how to swap in VRoid characters, in its README). `qa_poses.html` (not
  published) renders single poses for visual checks.

## Net clearance and errors

Every ball the engine sends across the net clears the tape by the ball's radius plus a margin (`clearNet()` in
playback lifts the arc just enough — the long back attack gets a topspin loop). Errors never cross by accident: the
engine decides them by chance and skill (`Formula.spikeErrorP` — wit, set quality, over-hitting, contact height over
the net; `serveErrorP`) and which way they go (`spikeNetShare`: lower contact → net; `serveNetShare`: flat or tired
swing → net, too much power → long), then ends those balls at the net or out.

## Deflections and ball speed

A defender who reaches a hard spike or serve but can't control it may pop it up inside their own court (`popChance`,
engine/match.js: better defense → more often, harder balls → less). The nearest free teammate chases it
(`popRecovery` / `popActs`): saved → the rally goes on with a scrambled pass; missed → the point stands. Spikes fly
faster the harder they're hit (`hdur` in rally.js), and in playback a hard hit accelerates along its path
(`a._acc`: slower off the hand, faster into the floor).

## Elements

Per player, not per team (data: `js/data/elements.js`, logic: `js/engine/elements.js`). `elAssign` (called from
`finalizeTeam`) gives every player an element from their standout trait (stats as z-scores, wit, leadership) and a
signature spike (name + personal twist: pierce / curve / heavy / blur / split) using a string hash — no random draws,
so seeded runs are unchanged. `elOn` = unlocked: OP always, ~1 in 4 stars (`EG.starUnlock`), your career player only
through the Element Trial (`career/element.js`: reveal at OVR 70 → ★ star → S grade in a match where your team hit the
zone (`m.zoneHit`) → trial event, retry after 3 weeks).

In a match, `m.eg[id]` (0–100) fills from `st()` (`elStat`: kills, blocks, digs, aces, assists by element, read against
`m.ctx`, the attack in play), `elAttack`, `elLong` (long rallies) and `elPoint` (a small trickle + Starlight). A
captain's buff fills it at once (`elBuff`). A full gauge makes that player's next attack an element spike
(`elSpike` in rally.js; a charged setter puts theirs into the set): power / block coverage / dig / flight-time
multipliers, Earth block-break boost, Water/curve landing away from defenders (`elFar`), Blast no pop-ups, Starlight
momentum. A defender whose element beats the attacker's (`ECOUNTER`) halves the element part. Unlocked setter + hitter
with different elements on a perfect set: a named pair move (`EPAIR`). `m.elLog` records each one and whether it won
the point. Tuning targets: ~1.7 per normal match, ~5 in Monster games, ~70% of them win the point.

Visuals use the player's element only: element acts (`el`) are null on ordinary hits, so only element spikes, and
unlocked players' blocks/digs, show element effects. The gauge ring sits beside the role tag (`drawTags`); a full gauge
turns that player's aura, motes and hand trails the element colour.

## Slow motion and staged scenes

One world clock: `timeScale()` in playback sets `A.ts` (1 = normal) from the current beat — `slow` (×0.3, or a
factor; `slowAt: [t0, t1]` limits it to part of the beat), `freeze` (hit-stop, 0.04) and `scene` (0.03). It eases down
over ~90 ms and back over ~160 ms; freezes and scenes drop at once. Game time, poses, spring bones, trails and particles
all run on it (r3d scales its frame dt by `A.ts`), so everything slows together instead of limbs racing ahead of the
body. Crossing ×0.75 toggles the audio muffle (`sfx.slowmo`, a low-pass on the mix) and the desaturated `.slowmo`
stage; the overlay vignette deepens with `1 − A.ts`.

Shonen moments (`js/engine/hype.js`, presentation only, no random draws): `hypeLevel` marks an attack for a staged
build-up — level 1 for an element spike, a match point, a star-vs-star face-off (≥ 8 points apart); level 2 for a long
rally or a comeback run. `hypeScene` adds `scene` beats before the set: a face close-up with the hitter's call, over the
setter's shoulder, behind the block (`shot`, `call` with `sc`, `heart`, `banner` acts; each shot holds ~1.4–1.5 s);
the set that follows carries `sceneSlow` (slow build-up, full speed into contact) and a short hit-stop. r3d frames each
`shot` by moving the base camera (so the overlay stays aligned), with hard cuts between shots. Players have a
personality (`persOf`, from a name hash) that picks their lines (`LINES` in data/dialogue.js); `hypeChatter` adds
point reactions (scorer, teammate, the stuffed hitter, the one who erred). Defense scenes (`m.hypeDef`: the blocker is the sharper player,
the defending side has match point, or a star blocker is in the zone) skip the build-up: the set plays normally, slows
as the hitter takes off, and at the top of the jump `hypeRead` freezes and cuts to the blocker ("I read you."), then
behind the block; the hit-stop returns to the game camera and the block plays out as usual. A confident blocker also gets that read on its own (`readLevel`: a
solid block forming — coverage ≥ 0.95, not fooled by a fake — around a sharp star blocker, at most every 9 points),
with or without an attack scene before the set. Block breaks are known before they play: `block()` inserts
`hypeSpikeCut` (a low-angle shot of the hitter at the top of the jump with a shout) at the `mark` right after the set
(`B.ins`), and the drill hit-stop gets a `ball` close-up against the blocker's hands. In close-ups, effects fade at
full speed and no new OP arcs or motes spawn. The defense's scene beats (the wall line, the read) are kept in
`m.defBeats` and dropped by `dropDefScene` when the final attack has no block attempt (a tip, or coverage ≤ 0.12 after
cut shots, seams and fakes — the same test block() uses). Front-row players who aren't in the block still go up late
(`lateB` in rally.js, display only), and the first blocker never comes from the back row while a front-row player is
there. Scramble drama (`scramble()`): a block break, a
pop-up off the arms, a desperation save or (sometimes) a touched ball dug on the dive gets a "Break!!" / "Loose ball!"
call, a camera push and a slow window at the end of the beat (`hypeSlow`: off when Hype is Off); block touches call
"One touch!". The Hype setting (`G.hype`: off / normal /
max) skips scene beats above its level; tapping the court skips the rest of a scene.

## Performance

The court canvas is sized to CSS size × device pixels within a budget (`COURT_PX`, 2.4 MP — fullscreen on a
high-DPI screen would otherwise be 6–8 MP a frame), and the 3D view renders at a dynamic fraction of it (`adaptRes`
in r3d: steps down to 0.55 when frames run under ~50 fps, back up when there's headroom). `matchState()` reports both.

## Robustness

The frame loop re-schedules itself before doing any work and catches errors from `step()`/`draw()`, so one bad frame can
no longer freeze the game; a beat that fails 20 frames in a row is skipped. `watchdog()` logs a stall when play stops
moving for 6 s (25 s while the 3D players load) or one beat lasts 20 s, with a snapshot from `matchState()`.

## Saves

Career runs carry `v` (`RUN_VERSION`, `career/run.js`). Bump the version when the save shape changes and add a step to
`RUN_MIGRATIONS[oldVersion] = data => upgraded data`; `Run.load` applies the steps in order and ignores saves from a newer version.

## Testing

`node tests/run.js` — no dependencies. `tests/harness.js` loads the headless scripts (core, data, engine, career) into a
`vm` context with a seeded `Math.random` and an in-memory `localStorage`. Tests cover:

- **golden** engine output (teams, recorded matches incl. beats, simulated matches, monster teams) → `tests/golden.json`;
- rally invariants over 300 matches and that every beat act kind has a renderer handler;
- data integrity (events, skills, unlocks, calendar), full career runs, save round-trip, save migration, every Legacy unlock.

A deliberate gameplay change updates the golden file with `node tests/run.js --update` — review the diff first.
Pure refactors must pass **without** `--update`.
