# Spite & Spike — architecture

A 4v4 anime volleyball simulator drawn in 3D. Plain HTML + CSS + classic `<script>` files (no build step), plus
ES modules for the 3D renderer (`js/render3d/`, loaded with `import()`).
Scripts share one global scope and load in the order listed in `index.html`; a file may only use
earlier files **at load time** (inside functions, anything loaded is fine).

## Layers

| Layer | Folder | Rule |
|---|---|---|
| Core | `js/core/` | `debuglog.js` (loaded first: `DBG` collects errors, console errors/warnings and match stalls; the header's Debug log button shows and copies them), `rng.js` (all game randomness via `R()`, seedable with `RNG.seed(n)`; presentation — particles, confetti, trail flicker, coach looks — uses `FXR` on `Math.random`, `FXR.isolate(fn)` for code that calls `R()` inside, so frame rate never moves the engine stream; a test scans js/render, js/audio and match-screen for game-RNG calls), `storage.js` (all `localStorage` via `store`, keys in `KEYS`). |
| Data | `js/data/` | Constants only — playstyles, names, looks, moves, roles, elements, `RULES`. No logic. |
| Engine | `js/engine/` | Pure simulation. **No DOM, canvas or audio.** Runs headless (odds, preseason, tests). |
| Audio | `js/audio/` | Synthesized WebAudio effects plus the match music (`sfx.js`). |
| Game | `js/game/` | Global state `G` (settings, current screen), screen router (`Screens`, `navigate()`), bracket helpers (career Cup). |
| Career | `js/career/` | Career-mode rules (run, training, events, skills, Cup). **No DOM** — testable headlessly. |
| UI | `js/ui/` | DOM screens: menu, match screen, career create/week/result (`career-end.js`), skill encyclopedia. |
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
  `pickSetter` (T-054): the set point is rolled first, then the back-row setter sets; on a bad pass (quality 1, one setter) a free teammate takes the second
  ball only when the setter's time to the set point is over `SETTER.beat` (rules.js, 1.6) × the teammate's — a reach rule, no random in the choice. Engine-only
  record `m.setBy = [{ role, why: 'free' | 'reach' | 'none', qual, ts, tm }]` (like `m.scrLog`): `none` = no setter free (passer / busy; wit-weighted pick).
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

- `engine/stats.js` — what a player's stats are *right now*: wit × mood × momentum × stamina (`effP`, `effD`, `W`, `jumpPx`…). Stamina is tuned in `RULES.stamina` (`drain` per touch, `hit` = power/defense lost at 0, `jumpHit` = jump lost at 0): a hero who takes every touch tires first.
- `engine/formulas.js` — `Formula.*` holds the numbers that decide outcomes (serve, receive, set, spike,
  block, dig, kill chance). Balance changes and future training effects belong here.

## Screens

`menu`, `match`, `create`, `career`, `encyclopedia` — switch with `navigate(name, …args)`.
The match screen takes a fixture: `navigate('match', { a, b, round, back, onFinish(m) → message, onLeave() })`
(career Cup and league games, the Monster exhibition). There is no stand-alone tournament/betting mode.

## Career mode

- `RUN` is the active run (`career/run.js`); saved to `KEYS.career` after every week (`teamToJSON`/`teamFromJSON` in `engine/save.js`).
- Stat guard: `fixStats(p)` (`engine/players.js`) makes every stat a finite number in [`STAT_FLOOR`, 99] (wit [0.1, 3]; non-finite → floor / 1), leaves in-range values exactly as they are and returns the count fixed. It runs in `teamFromJSON` (a damaged save; logs `DBG.log('warn', …)`) and in `newMatch` for both squads, so the engine never sees a negative, NaN or huge stat. A no-op for valid players: no draws, no golden change.
- **Season:** 28 weeks: monthly evaluations (weeks 4–24), camp (26–28), then the **U21 Final Cup** (`CUPS` in
  `data/career.js`, one entry, ×1.5 rewards; see "U21 Final Cup"). Every cup close ends the run. `Run.weekType` is 'cup'
  while `run.cup` is live.
- **Training depth** (`career/training.js`, `TRAIN_X`): facility Lv 1–5 by use, Hard option, same-training streaks,
  steeper diminishing returns, the training cap `TRAIN_CAP` 75 (no Limit Break), injuries
  when a session fails while exhausted (light training until healed, or the physio).
- **Goals and sponsors** (`career/goals.js`): the coach sets a goal per block (`BLOCKS`), checked at the block's last
  week; sponsors make offers at fan milestones (a `pre` event shown before the week's choice) with a perk kept while a
  condition holds.
- **Matches** (`career/cup.js`): an S–C grade from your own line scales that match's rewards; a pre-match focus goal;
  a captain's team talk before Cup matches (applied in `Cup.prepare` and the fixture's `setup(m)` hook).
- Content is data: `data/career.js` (numbers, trainings, calendar, cups, rewards, ranks, unlocks, sponsors, modes),
  `data/events.js`, `data/skills.js`. Special events ('element', 'sponsor') are built in `Events.def`.
- Skills reach the engine only through `skillMod(p, key)` and bonds through `bondCombo(a, b)` (`engine/skills.js`);
  both are neutral for normal players and draw no random numbers.
- Skills in the shop vs in play (T-036): basic skills (no `tech`) are bought with skill points (`Skills.learn`); techniques can't be
  (`canLearn` is false for them). `Skills.tryLearn(run, m)` runs after a match you played (`Cup.result`): per technique of your role you
  don't own, one roll (`LEARN`: by doing a stat-line threshold, else by facing an opponent who played and has it; chance × wit ×
  the match gap factor, ≤ 0.5), at most one per match. Techniques still fire by stats via `hasTech`. Scouting shows them
  (`Skills.techs`; dossier roster `techs`, hidden until scouted).
- No meta progression: every career starts the same (free agent, every stat at `CAREER.start` = 1, wit `witBase`, `staMax`; no creation points — T-055); challenge modes (`MODES`) are plain options. Modes (T-067): `run.mode.story` (default true, save v9; `MODES.story` / disabled `endless`) — in Story the U21 Final Cup always holds you: `Cup.place` forces you into your faction's first squad (over its weakest same-role player), an Academy member plays the Academy entrant, and a player alone gets the `Cup.crew` entrant (a hired street crew stored as `run.reserve.street`, built on a seeded side stream so main draws don't shift); `Run.lineup(…, forceYou)` makes you start every cup match (injury still benches you); a Story champion is called up (`Cup.calledUp`).
- UI: `ui/icons.js` draws the active (bolt + type) / passive (aura) skill icons used in the shop, player card and
  encyclopedia; the result screen has a season growth chart from `run.hist`.

## 3D renderer (js/render3d/)

The 3D renderer draws every match (career, Monster playtest) with VRM anime players. It is a **renderer only**:
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
  `drawTrail`, `drawChant`, `drawFx`) is drawn on the transparent canvas on top. Units: x/1000 →
  20.4 m court, z → 12 m, height 150 = the 2.43 m net tape (`W()`). Cameras: courtside (default), broadcast and follow. Follow (camera3d `setFollow(id)`): 4.5 m behind the player along their side's court axis, 2.6 m up, looking ahead and toward the ball, FOV 55, ~0.25 s smoothing; career follows `p.you`, Monster picks from a select; a player off court (subbed) → Courtside. POV (`camState.w.pov`): the followed player's head bone + 0.08 m forward, FOV 70, near 0.1; looks at the ball up to 100° off their facing (fading to straight ahead by 140°), look smoothed ~0.12 s, height within ±5 cm; airborne > 0.6 m / diving / turning > 220°/s blends to the Follow pose (`pov.fb`, ~0.25 s, held 0.3 s); actors3d `setPovHidden(w, id)` hides that figure's face / hair meshes while the camera is at its eyes (`povHidden()`, called every frame; `unbind` restores). Modes blend through weights (`camState.w`, ~0.6 s) and the follow pose is tracked in every mode so switches never jump; scene shots still override; P3D always projects through `base`. Follow / POV never turn from the opponent's side (`faceOpponent`: look within ±40° / ±55° of the axis to the net). The ball they look toward is clamped to the playable box and its weight eases to 0 (~0.25 s, `bw`) while the ball is hidden / parked, so a ball far out of the map never drags the view; `faceOpponent` fades its pull to 0 as the target goes directly behind (no ±40° flip); a scene shot's exit turns the view through the shortest arc at an even rate (quaternion slerp, not look-point lerp). Follow also dollies back (≤ 12 m) until the ball is in view (`ZO`). Auto zoom-out: when the ball leaves the frame (last frame's `base`, not in a scene shot) the FOV widens (+28° Follow, +20° POV, +10° Courtside) over ~0.3 s and eases back over ~0.8 s once it is in view.
- Modules: `r3d.mjs` (entry: build once, bind per match, per-frame `draw`, dynamic resolution, `api` = `R3D`),
  `units3d.mjs` (court units → metres `W`/`Wto`, `canvasTex`, `lowEnd`), `arena3d.mjs` (lights, court, net, board,
  stands, instanced crowd, ball + glow; `dressArena`, `updateBall/Crowd/Net/PointFlash`), `camera3d.mjs` (game
  camera, scene shots `shotPose` with hard cuts, `P3D`, view transform, camera mode, debug camera),
  `actors3d.mjs` (`posePlayer` → `motion`, `steer`, head tracking, `reachForBall`, `lightTrails`, `glow`;
  `poseCoach`; `dressActors`), `fx3d.mjs`, `trails3d.mjs`.
- Extra player models: a .vrm picked in the menu (Playtest card) is kept in the player's own browser (IndexedDB,
  `js/ui/models.js`, never uploaded) and loaded at start-up; `R3D.addModel` adds `EXTRA_FIGS` figures of it to the
  pool and `dressActors` gives a loaded model to your own player only (`p.you`, career; with several loaded, picked by hash, stable per
  player via `hu`); everyone else keeps the base model. VRM 0.x models are rotated
  (`rotateVRM0`); dressing matches VRoid material names anywhere in the name.
- One heavy pass per model file: `makeVRM` shares decoded textures (`imgCache`, clones share one image / GPU upload),
  geometry (`geoCache`, the first figure's meshes) and greyed hair textures across every figure of the same model.
- `players3d.mjs` — VRM loading, repeatable dressing, pose → normalized bones, smoothing, arm aiming at the ball
  (`torsoDir`/`bendArm`), feet on the floor, expressions.
- `poses3d.mjs` — one pose per engine pose, driven by the same values the playback layer keeps (swing/spike
  timers, jump arcs, `diveShape`, `setMotion`) plus **measured motion** from `actors3d.mjs` (`motion()`: speed,
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
- `trails3d.mjs` — light trails (camera-facing ribbons that taper and fade with age; every trail measures its point's speed and dims out when it stands still — `MOVE`; the ball's screen and element trails use `A.mv`, 0..1 from the ball's speed, set in ball.js `ballPhysics`): hands in the player's hair
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
there (see "Block formation"). Scramble drama (`scramble()`): a block break, a
pop-up off the arms, a desperation save or (sometimes) a touched ball dug on the dive gets a "Break!!" / "Loose ball!"
call, a camera push and a slow window at the end of the beat (`hypeSlow`: off when Hype is Off); block touches call
"One touch!". The Hype setting (`G.hype`: off / normal /
max) skips scene beats above its level; tapping the court skips the rest of a scene.

## Block formation

`formBlock()` (engine/rally.js) reads the attack instead of always sending the middle. `lane` = L / M / R from the hitter's net
position (`BLOCK.laneL` / `laneR`, data/tactics.js); `pipe` = a back-row attack in lane M. Primary blocker `b0`: the front-row MB on any attack they can reach in time (`reach × 1.3`; they wait at the net, the wings stand deeper),
else the defender closest to the hitter lane, the defender nearest the lane on a wing attack (the
pin blocker sets the edge); if the middle bit on the fake (`bitten`) the far defender swings across (reach × `swingReach`,
coverage × `swingCov`, no double). Second blocker `b1` closes beside `b0` on the court-inside side when one roll
(`defT.S.dbl` × 0.6–1.4 by `readQ`, wit + speed) passes and they can reach the spot; sync attacks never get one. A blocker who
cannot reach the spot in time is late (coverage × `lateCov`); `readQ` < 0.35 splits the hands (× `splitCov`). Everything
returns `lane`, `pipe`, `late` for block() / hype. `m.dset[side]` is the defence setting (`DEFSETS`: read = no change;
commit = the blocker on a quick is already up — reach × `commitReach`, coverage × `commitQuick`, a double forms — but the middle
counts as bitten on any fake and covers little else (× `commitMiss`); bunch = both defenders start near the middle
(`bunchStartZ`, as far as their speed allows), middle attacks × `bunchMid` with the double always forming, pins × `bunchPin`).
Scaled coverage is capped at 1.2 so a setting cannot turn a wall into block-break territory. `m.att[side]` is an engine-only
tally (attacks / kills / stuffs by kind quick, mid, pin; doubles; late) used by tests — it draws no randoms.

Defence settings: each style carries `dset` (wall = bunch, tempo = commit, the rest read; `defOf(team)` in data/tactics.js);
`newMatch` starts every side on it unless `opts.dset` fixes one (`m.dsetMode[side]` = 'cap' | 'fixed', like `tacMode`; not
saved). In 'cap' mode `captainThink` (one draw per call, only then) counts the opponent's `m.att` after 8 attacks: quick share
> 35 % → commit, middle share > 45 % → bunch, else read; a switch is chatter + log + the existing `tac` act (`dset` field) and
is kept in `m.dsetLog`. The match screen's Tactics popover has a Defence select per team (`setDefence`, `showTac` shows the
captain's current pick). Scouting: `Dossier.habits(team)` (quick share from style × MB count, favoured wing by WS power, pipe =
setter has `pipecombo`, defence setting) and `Dossier.habitText`; shown in the dossier's club rows and the HQ card once
scouted — computed from data, never from match history.

## Substitutions

`SUB = { max, sta, fresh }` (`js/data/rules.js`). At every dead ball `end()` (engine/match.js) calls `coachSubs(m, side)` after the
point's beats: with subs left (`m.subs[side] < SUB.max`, per set), `subCandidate` finds who to swap — the tiredest player under `SUB.sta`, then one with
`SUB.errs` errors (`m.setErr`) and more errors than kills, then a rested starter (≥ `SUB.back`, better rated) returning for whoever replaced them
(`m.subbed`); the replacement is the fittest bench player at stamina ≥ `SUB.fresh` (same role first, else highest rating; a setter only for a
setter). A tired / erring sub must pay off (the coach's worth test): bench ovr ≥ `lerp(SUB.worth[0], SUB.worth[1], coachIQ)` × the starter's current worth
(ovr × (1 − `RULES.stamina.hit` × (1 − stamina))) — a dull coach subs almost anyone in, a sharp one only when it helps; a pair that fails is skipped (the next
candidate is tried). A bench player flagged `noSub` never comes on (`rested`, and the 'back' rule): `Cup.prepare` sets it on your player while `run.injury`
is set (engine-only, never saved; `restoreLineups` deletes it). One roll `R() < lerp(SUB.iq[0], SUB.iq[1], coachIQ)` decides whether the coach acts now — × `SUB.you`
(0.9) when the player coming off is your career player (`p.you`); no candidate → no roll. `m.subLog` (engine-only: `{ side, pts, why, out, inn, sta }`) records
each sub with its reason, shown in the log line.
`subIn` gives the incoming player the seat (`t.P` index), slot and — if the captain went off — the captaincy goes to the best
leader on court; `m.pos` is copied. Recording adds one beat `sub` (+ `rot` snapshot, `plabel` 'SUBBED', `coachtalk` from
`SUBLINES` picked by hash, `log`). `m.lineup0` is the starting lineup per side; `restoreLineups(m)` puts `P`, `bench`, slots, `s` /
`mb` / `ws` and the captain back — called in `end()` when the match is over, by `leaveMatch` and by `navigate()` when a running match is
left (safe twice; never after a finished match). Match-time stats: `m.stat` (box score / stars / `tour.mp` list players on court or with stats).
Playback: `A.disp` holds the 4+4 on court, `A.bench` the display entries of the bench (nothing draws or animates them); `case 'sub'`
swaps them (fresh entry at the outgoing player's spot) and calls `R3D.swapActor`, which re-dresses the same 3D figure as the
incoming player (`dressFigure`), so no figure is ever on court twice. `byId` searches `squadOf`.

### Your player and the bench (T-031)

`Run.lineup(run, T, region, dry)` (career/run.js) is your coach's pick for your side before every career match (`Cup.fixture`, after
`Cup.prepare`): per slot [S, MB, WS, WS] the best same-role player by `ovr + 6 × Run.form` (+ your standing in that region ÷
`BENCH.standingPer`, `data/career.js`); a missing role falls back to the best remaining player. It reorders `T.P` / `T.bench`, slots,
`s`/`mb`/`ws`, captain and `ovr`, and returns `{ starts, you, rival }`; `dry` only scores (the pre-match Lineup row). `Cup.mine(run, kind)`
gives the side and region (cup entrant / faction-eval squad / pickup or club). The engine records `m.played` (ids who were on court at
any time) and `m.finished` (ids on court at the end). `Cup.result`: never played → no grade, no win bonus, only `Eval.benchXp`;
started or finished on the bench → rewards × `BENCH.partMul`; a bench win never counts for "win the evaluation" (`run.warm.win`).

## Blocks

`block()` (engine/rally-defense.js): a block is attempted when coverage > `BLOCK_MIN_COV`. Order: block break (spike
beats the full block by 10%+) → stuff (`stuffChance`: the block at full strength vs the spike, weighted by
coverage^`STUFF_COV_EXP`; a cover dig may save it) → touch → tool off the hands (only off a partial block,
`TOOL_COV`, at `TOOL_P`). A blocker at least as sharp (wit) as the hitter keeps part of the block on a cut shot.
Targets: ~14% of attacks stuffed in normal matches (measured 13.7 % over 600 Read-vs-Read sims, `STUFF_BIAS` 0.45); Monster games stay offence-heavy (every hitter has every
technique). Kill blocks get a scene: a `ball` close-up on the stuff, then the blocker's face and line
(`hypeKillBlock`: level 1 at match point or for a star blocker at most every 6 points).

## Far digs (playback)

`digChase` (playback.js, at a beat's start): when a dig/receive target can't be reached at a sprint in the beat's
time (including coming down from a block jump), the beat gets `_dig` = the world time scale that makes it just
reachable (≥ `DIG_SLOW_MIN`). `timeScale` drops to it at once; the digger (`A.digHero`) runs on real time — timers,
`capMove` sprint cap, straight-line chase, 3D posing — so they move and dive at normal speed while the ball and
everyone else slow down. Presentation only (no engine change). Before that, `preDigLook`/`preDigGo` let the
digger read the attack: halfway through the beat before a far dig they already start running for it.

Dives: after the contact the dive runs on fixed time (`diveF`, `DIVE_POST_MS`: on the floor, then back up) and
passive poses (`DIVE_KEEP`: ready / bump / huddle) wait for it (`afterDive`); a player on the floor doesn't move
until back up. Collision (`separate`, playback): teammates' feet stay ≥ `BODY_GAP` apart (display only). In the
engine a double block's second blocker and the late blockers take spots ≥ `BLOCK_GAP` from the others.

## Spike approach (playback)

Display only; derived from the set beat's acts (`approachOf`: hitter, contact spot = the slide target, jump `t0` ≥ 0.3;
quick attacks and cut / scene beats have none). Constants `RUNUP_M`, `TAKEOFF_M`, `PREAPP_AT`. In the beat before the
set, `preApproachLook` / `preApproachGo` (at `PREAPP_AT`) send the hitter toward the run-up point (behind the contact
spot, away from the net). In the set beat `d.app` drives `approachMove`: run-up → accelerating run to the take-off
point (a hitter too far to do both goes straight to it: `direct`; a `via` back attack runs its second leg to it) →
from `t0` a broad jump onto the contact spot, arriving at t = 1. Cleared in `endBeat`.

## Pre-serve routine

The serve type is picked before the reset, so the server walks straight to where the serve starts (the run-up start
for a jump serve / jump float). The engine's `hold` beat + a 1.1 s beat before the serve. The ball appears only when
the routine starts (`followBall` sets `A.ball.vis`). Playback gives the server pose `preserve` and `d.psv`
({ kind: 'bounce' | 'aim', t }, t runs once they stand at the service spot). `preServe` (render/ball.js) is the one
timeline: it places the ball (two bounces off the right hand → catch to the chest; or spin in both hands → held out
in the left hand at eye height toward the other court) and stores the phase in `d.psvB`, which `preservePose`
(poses3d) follows; `pose.hand` tells `reachForBall` which hand(s) meet the ball.

Contacts at the hand: `A.handTouch` ({ p, c, b }, playback `startBall`) → `handTouch` in r3d pulls the drawn ball
onto the real hand(s) over the last 35% of the flight (block: between both palms; spike / serve: the right hand).
Jumps keep momentum (`airMomentum`, playback): a share of the take-off ground speed (`AIR_KEEP`, ≤ `AIR_MAX` m/s)
carries a player while they fall (never over the net); they run back afterwards. Bad sets: most stay hittable
(weaker, `setMul`); a stray one (`badSetOver`) is chased by the nearest teammate and bumped / dived over.

Finished moves settle: when `poseDone` and not moving, a player returns to the ready stance (except `HELD` poses:
celebrations, huddle, the serve routine).

## Career world (P1)

`js/data/world.js` (FACTIONS per league team with join conditions, ECON, HOUSING) + `js/career/world.js` (World).
A run starts as a free agent on a pickup squad (`run.pickup`, `run.team` null; `Run.myTeam` returns it) unless the
Team pick unlock chose a club. `World.join` swaps you into a club's same-role slot (the replaced player drops to the
pickup squad). Free agents in the Academy squad play its evaluations and enter the cup with it; alone (`NO_CUP` placing) they watch it. Every
`ECON.payEvery` weeks: allowance − food − rent (eviction to the abandoned gym when broke), housing effects, one
league transfer (`World.transfers`) and a Gazette (`run.gazette`, news collected via `Run.news`).

## Team shape (squads of 6)

`t.P` = the 4 on court (what the engine plays: `t.s`, `t.mb`, `t.ws` are views of it), `t.bench` = the 2 substitutes (same
`team` link, own slot). `squadOf(t)` (`js/engine/teams.js`) = all 6; use it wherever "the club's players" is meant (growth,
bonds, scouting, pools, promotion, transfers) and keep `t.P` for "who plays". `fillRoster` rolls the bench after the 4 (flex
role + a wing spiker); `finalizeTeam` gives leadership, elements and shirt numbers to all 6 (numbers unique) but the captain and
`ovr` come from `t.P`. `World.swap(x, y)` trades two players' seats (court or bench), slots, numbers and team links (join,
transfers, promotion). Saves (RUN_VERSION 8; v5 dropped `run.lb`, v6 added `run.met` / `run.street` / `run.refused`, v7 `run.losses` / `run.lastFight`, v8 `run.mlog`) store `bench` next to `P`; `teamFromJSON` relinks it.

## Faction pools

Each faction (`POOL` in `js/data/world.js`: Wei 24, Wu 18, Shu 12, Outlaws 6, St. Gloria 6; `SQUAD` = 6) is a roster = its league-team
players + generated reserves. `Pool.build(teams, used)` (`js/career/pool.js`, called by `Run.draft`) makes one
reserve team per region (`run.reserve[region]`, `i: -1`, `P` may be empty); `Pool.players(run, r)` / `Pool.size(run, r)`
list a faction's team players (squadOf) then reserves (12 / 6 / 0 / 0 / 0 with the defaults). Reserves are saved (`run.reserve`; older saves are dropped)
and not used in play yet. A player lives in exactly one place; `you` and the pickup squad are never reserves.
`Pool.draw(run, r, n)` returns n squads of 6 (new arrays, nothing mutated): the first 4 in court order `[S, MB, WS, WS]`, then 2 bench players (drawn after every court slot, any role, never you): weighted by ovr (`DRAW` in world.js),
you are a candidate only while signed with r, and a standing ≥ `DRAW.sure` puts you in squad 1.

## Evaluations

`CALENDAR` weeks marked `'eval'` (4, 8 … 24) replace the old warm-ups; `Run.weekType` returns `'eval'` only if `Eval.kind(run)` is
non-null (`'academy'`: free agent still in the Academy squad, `'faction'`: signed with a major, else none). `Eval.setup(run)`
(`js/career/eval.js`, called from `Run.nextWeek` and `Run.repair`) draws the week into `run.eval = { week, kind, region, mine, opp }`
(player id arrays, from `Pool.draw`; `mine` null = Academy squad or not drawn). `Eval.squad` builds a temporary team (first 4 → `P`, the rest → `bench`);
`Eval.lend` / `restore` point players' `team`, `cap` and `slot` (bench: `team` only) at it for the match and back (never `finalizeTeam` on it).
`Eval.bench` = not selected: wit XP worth `EVAL.benchDays` day-sessions.

## U21 Final Cup

`js/career/cup.js`. After week 28 `Cup.start` calls `Cup.entrants(run)`: every faction's `Pool.draw` squads (named
`<Region> I, II…`), then the Academy squad while you are a free agent still in it. Saved as
`run.cup = { id, entrants: [{ name, short, color, region, ids, academy }], me, sched, done }` (RUN_VERSION 4; `me` = your
entrant index, −1 = not in it → you watch and `NO_CUP`). Entrants are ranked by `Eval.squad(...).ovr`, placed by
`seedOrder(16)` (top seeds get byes as nulls) into `newBracket`; bracket entries hold entrant indexes. `Cup.team(run, i)`
builds a squad on demand (the Academy entrant is `run.pickup`). Every match, yours (`Cup.fixture('cup')`) or simulated
(`Cup.simulate`), `Eval.lend`s both squads and `Eval.restore()`s right after. `Cup.close` records
`run.cups[{ id, place, champ: name }]` and ends the run (`run.result.champ` = winner's name).

## Faction dossier

`Dossier.build(run, r)` (`js/career/dossier.js`, DOM-free, read-only) returns one faction's window data: standing, state
(weakened / pressed / rising / stable / minor), border meters, places taken / lost, price and quality multipliers,
the facilities it holds now (seized ones marked, with `City.access`), its clubs (join text, `World.canJoin`) and the pool
roster. Ratings and elements are `null` until one of its clubs is scouted or you are a member. It reuses `City`, `Front`,
`World`, `Pool` and `Training`; no rules live in it. `Dossier.summary(run, r)` is the short form the Factions drawer renders (standing +
`standingLabel`, fronts, took / lost, economy, clubs, this week's foe).

UI files only render and call rules: `City.after` (the week's event, once after its first action), `Run.canEndWeek`,
`Run.readGazette`, `Goals.progress`, `Cup.simNow(fx)` (resolve a fixture without watching: setup, rallies, finish) and
`Cup.upcoming(run)` (the cup screen's next match — other matches simulated first — called by `renderCareer` before it
draws, so no render function changes or saves the run).

The window is `ui/career-dossier.js` (`dossierCard`, `openDossier(r)` / `closeDossier()`, Esc closes; state `CW.dossier`): opened by the
HQ panel's Dossier button and the faction names in the Factions drawer, rendered in the hub's modal layer when no event card is up.

## Island map (training weeks)

`js/data/world.js`: REGIONS (wei = the city, wu = the whole coastline band, shu = the inland highlands — the three
majors with clear borders; outlaws / gloria = borderless minors; open = no-man's land): price ×, training quality q,
Wei `hype` (chance a premium place is overhyped), Shu `gem` (chance a rough place is a hidden gem), travel `zone`,
map anchor `at`. FACTIONS: one per league team — two squads per major (Wei Gold/Iron, Wu Harbor/Fort, Shu
Peak/Valley) + Street Outlaws + St. Gloria; `team` rebrands the league team in `Run.draft`. HOTEL, HOUSING by region.
`js/data/city.js`: CITY (coast, Wu's inner line, Wei and Shu polygons, minor ellipses, airport, HQs), SPOTS (several
training places per stat across regions; sand = technique ×SAND_SP skill points; hotels; outings per region).
`js/career/city.js` (City): `run.pos` (map point you stand on; a run starts at the airport), `regionAt` (minor patch /
shrine park / major polygon), `trip` (days by distance, NEAR_R / TRIP_DAY / TRIP_MAX), `go`/`moveTo` (spend, stand,
`reveal` → `run.fog`), `seen` (the dark map), `travelTo` (any land point), `roll` (per-run place quality → `run.spotQ`, found out by training there),
`price` (TRAIN_FEE / HOTEL × region price), `mul` (quality × home turf, passed to `Training.train/preview` as x),
`can`/`day`/`scout`. Week = `run.days` (WEEK_DAYS 7): every action costs `City.cost` = trip + 1 day and is refused if
it would spill into next week (`noTime`); at 0 days it is night; only `mapEndWeek` (the player) calls `Run.endWeek`.
Events roll once per week after the first action (`run.rolled`). Street battles: `clashRoll` in `Run.nextWeek`
(`run.clash` with its aggressor, settled by `clashEnd` at week end if nobody joined), `clash(run, side)`; standing per
region in `run.rep` (`rep`/`repBump`). `js/career/front.js` (Front): border meters `run.front`, seized places `run.own`
(City.region follows the holder), `priceMul`/`qMul`/`weak`, `pick` (aggressor + target), `sim`/`result`/`seize`;
`World.joinReq` lowers a weakened faction's join bar. Sessions × DAY_GAIN (gains and skill points).

### Island map layers
1. Rules — City / Front (DOM-free): positions, travel, fog (`City.seen`), regions (`regionAt`), ownership.
2. Model — `MapModel.build(run, sel)` (`js/career/mapmodel.js`, DOM-free, tested): `{ w, h, land: { coast, beach,
   regions[{id, poly, color, mine}], contest, minors[ellipses], park, mountains, labels, airport }, seized[{at, r,
   color}], pins[{id, kind: spot|hq|clash, at, icon, badge, title, color?, flags: off/far/turf/gem/overhyped/hq/can/
   mine/clash}], you: {at}, fog: {points, r}, flag (picked point), focus (fresh-view centre), sel, life }`. `life` (`MapModel.life`, display only, no randoms; positions from hashes of ids + place): `mates[{id, name, at, color, spot}]` (your floor mates at the explored place of their key nearest home), `crews[{region, team, at, color, n 2–6, known, walk[[x,y]…]}]` (known clubs' HQs; `known` = scouted or yours), `battle {at, a, b, colors}|null`, `borders[{a, b, meter}]`. Map units
   CITY.w × CITY.h, y down. Selection ids: a pin id, or `pt:x,y` (`ptId` / `ptOf`).
3. Renderer — `MapView` (`js/ui/map-view.js`): `mount(el, model, { pick(id), point([x, y]) })`, `update(model)`,
   `select(id)`, `dispose()`. The only renderer is the three.js map: it lazy-imports `js/map3d/map3d.mjs` once (a notice
   shows while loading; on import / WebGL failure it logs `DBG.log('error')` and shows the failure text — there is no 2D
   fallback). `map3d.create(host, onIdle)` → `{ mount, update, select, dispose, heightAt, info }`: one renderer +
   canvas that survive `renderCareer()` (each mount re-attaches the canvas into the new `#mapwrap`); it releases itself
   (`onIdle` → `MapView.drop3D`) when its canvas has been detached for 3 s (left the career screen). Terrain: 2 m grid
   over the island box from `land.coast` / Shu region / `land.mountains` (fixed-hash noise, no randoms), vertex colours
   from region tints; fixed-yaw camera, pitch 55°, wheel zoom 25–420 m, drag pans on the ground plane, a click (< 5 px)
   raycasts to a map point (`toMap`; 1 map unit = `MAP_M` = 0.5 m). The player is `js/map3d/avatar3d.mjs`
   (`createAvatar(scene)`: the default VRM via `loadBase` / `makeVRM`, capsule until loaded): `snap` first, `setTarget` when
   `model.you.at` changes — `setTarget(at, path)` walks the road polyline `model.you.route` (added by `MapView.routed` in js/ui/map-view.js from `City.route(last you.at, you.at)`; the renderer never calls `City`; straight line without it) at 6 m/s over the whole length (trip 1.2–6 s, ramps 0.4 s; faster trips show a ×N badge), facing along the current segment, gait from
   `locoPose`, idle `STAND` + breathing, feet via `groundSnap` + `heightAt`; the camera follows until the user drags.
   Furniture is `js/map3d/pins3d.mjs` (`createFurniture(scene, heightAt)`): an HTML overlay `.maplay` over the canvas holds one
   `.mpin` button per `model.pins` item (icon, badge, flag classes, click → `pick(id)`), the region / airport labels (fade out
   below ~70 m camera distance) and the picked-point flag, all projected onto the terrain every frame after render; seized
   patches and the contested-border line are terrain decals. `sync(model, on)` rebuilds a part only when its JSON changed;
   fog is a per-vertex darkening of the terrain colours (`applyFog(model.fog)`, unexplored land dim, not hidden). First
   view: on the player, 60 m away. Life is `js/map3d/life3d.mjs` (`createLife(scene, heightAt)` → `{ sync(model), tick(dt, t),
   count(), dispose() }`, display only, no game randoms): reads `model.life` + `model.seized`; one `InstancedMesh` per kind
   (figure = capsule body + head, flag poles, flag cloth, dust puffs; ≤ 300 figures), rebuilt only when that JSON changes and
   animated in `tick` (drill hops, walkers looping round a crew's places at 1.2 m/s, the battle crowd shoving, waving flags).
   Mates and known crews are coloured, unscouted crews grey; patrols (2–4) stand on the stronger side of the contested Wei–Wu
   line; every seized place flies the holder's flag. `furn.pulse(strength, t)` pulses the contested line with |meter| / 2.
   The town layer is `js/map3d/town3d.mjs` (`createTown(scene, heightAt)` → `{ sync(model), dispose() }`, display only, no randoms):
   reads only `model.land.roads / lots / landmarks / districts` and `model.fog`. Meshes: one vertex-coloured mesh for all roads (width and
   colour by kind, slope-following, lifted 0.15 m, polygon offset; the `boardwalk` is planks of two tones 0.3 m up); one for the
   `overpass` (its edges chained into a deck 5.4 m wide, 7 m up with rails and sides, ramped to the ground over 28 m at both ends, T-pillars
   every ~20 m; deck + pillars merged); one `InstancedMesh` per base shape for the filler lots (box, gable, stepped: kind palette + size per
   instance, height × (1 + 2.5 × `lot.h` × the kind's `rise`) so downtown towers rise toward the middle; `lot.wealth` tints the instance colour in place — rich: glass-blue / clean stone / gold, poor: grey / rust / patched wood, the middle untouched — no extra draw call); one merged mesh for all landmarks
   and the wall ring of each `compound` district (a gatehouse of two towers and a lintel where a road crosses it); each landmark faces its
   nearest road. Rebuilt only when the layout JSON changes, dimmed by the same fog rule as the terrain (`FOG_DIM` / `FOG_SOFT` exported
   from map3d.mjs); 5 draw calls, ~+10k triangles. Terrain (`buildTerrain`): on the Wu stretch the sand between `land.dunes` and the coast is
   wide, flat and low (`sideDist` = signed distance to the dune line) with a dune ridge on the line; a faint tint per district style is
   folded into the vertex colours (no draw call). Pins above a landmark float `PIN_UP` over its roof (`landmarkHeight(kind)`). The kit registry
   is `js/map3d/kit3d.mjs`: `KIT[kind] = { geo(), mat, scale, colors, rise }` (filler kinds, incl. rowhouse, barracks, workshop, market,
   warehouse, resort, kiosk, terrace) and `LANDMARKS[kind] = { h, w, d, build(accent), footing? }` (incl. `ritual`: a worn sand circle with a
   ring of low stones). Swapping a kind for a model later: make `geo()` / `build()` return the model's geometry (filler: 1 × 1 footprint,
   height 1, feet at y = 0; landmark: door on +z, feet at y = 0, vertex colours) — nothing else changes (see the header of kit3d.mjs).
   `info().life` reports the instance counts. `js/ui/career-map.js` mounts it (`mapMount`),
   turns picks into panels (`mapPick`) and land clicks into travel targets (`mapPoint`). Region colours: REGIONS.color.

## Possession paths and touch counts

`rally(m, B, V, atk, pas, qual, scr)` runs one possession per loop; `next: [atk, pas, qual, scr]` hands it on (`scr` only for a
pop-up save, else null). Touches before the hit: normal dig / pass → set → spike **3**; setter dump **2**; overpass (free ball)
**1**; bad set over **3**; a pop-up save (a serve or spike that popped off someone's arms, `scr = { first }`) **3** —
the popper (touch 1), the saver bump-sets (touch 2, `saveSet` in `rally-phases.js`: no free ball / setter choice / dump /
double contact, `sq2 'bad'`, `bumpSet`), then a third player hits (`chooseAttack` skips `scr.first` and the saver) or the bad
set goes over as a bump; a block touch is free. Engine-only tallies (no randoms): `m.scr = { n, over }`, `m.scrLog = [{ first,
saver, hitter }]`.

## World layout (T-045)

Plain data for roads and settlements (spec §4.18), no rule uses it yet. `data/city.js`: `ROADS = { nodes: { id: [x, y] }, edges:
[[a, b, kind]] }` (kind `main` / `street` / `dirt` / `path`; nodes at `airport`, every `SPOTS` place with `at` under its own id, `hq0`…`hq7`,
`home:<housing>` for each `HOME_AT` spot, and `j…` junctions — all on land, all reachable from the airport; a test pins the coordinates to
their source), `SETTLE` (per region: style, density, gap, setback, size, kinds) and `LANDMARK` (kind per `SPOTS` id and `hq`).
`City.route(from, to)` → `[from, …road nodes…, to]` (Dijkstra over `ROADS`, ties by node id; a straight `[from, to]` when the ends are
nearer each other than to any node); trips, days and prices are untouched. `MapModel.build` adds to `land`: `roads` (`{ kind, pts }` per
edge), `lots` (`MapModel.lots`: slots every `SETTLE[region].gap` along each non-path edge, a lot on each side when `hstr(slot) < density`;
never on water, in another region, near a place, on a road or another lot — superseded by the districts below; cached per
home spot) and `landmarks` (`{ id, at, kind, region }` for every place, HQ and official venue). Layout uses fixed data + `hstr` only: no `R()` draws.

### Districts, the beach band and the overpass (T-050)

The map frame is `CITY.w` × `CITY.h` = 1060 × 700; the Wu stretch of the coast (points 6–12, plus 5, 13) grew outward, nothing else moved:
`CITY.inner` is a frozen literal (the Wei–Wu line `contest` = inner 6–8 + two points is unchanged), `CITY.dunes` = the old coast points 6–12
(the beach's inner edge) and `CITY.beach` the new coast points 6–12. The sand is the band between them: `MapModel.onSand(p)` (Wu land
that is not inside the old Wu polygon). Beach places (`sand`, `pier`, `bonfire`, `dunes`, `home:studio`) stand on it, Wu town (`hotelWu`,
`hq3`) is 40+ units inland, the harbor (`harbor`, `hq2`) is on the east coast; `REGIONS.wu.at` / `CITY.label.wu` follow Wu town.
New road kinds: `boardwalk` (airport → sand → pier / bonfire → along the dune line → `resort`) and `overpass` (`jW2` → `jO1` → `jO2` → `jWu2`,
elevated, over the Outlaws patch). `DISTRICTS` (city.js): `{ id, region, style, poly, gap, density, size, kinds, beach? }` — `poly` is a
polygon, a circle `{ x, y, r }`, or `'beach'` / `'wei'`. `MapModel.lots` fills each district with a grid (spacing `gap`, rotated to the road
nearest its middle, `hstr(slot) < density`), earlier districts first, then adds a road-side row at 0.4 × `SETTLE` density outside the districts.
A lot is never in the water, in another region, on the sand (the beach district: only on it), within `size / 2 + 4` of a road (the overpass is
elevated: lots may stand under it), within `MapModel.placeClear` (20 units: a landmark's footprint) of a place, or on another lot; lots are
`{ at, rot, size, style, kind, wealth, h, district }`. `wealth` (0–1, `MapModel.wealth`, numbers in `WEALTH`, city.js; fixed data + hashes):
Wei falls smoothly from the downtown core (`weiCore`, `weiEdge`) to the suburbs, Old Town capped, Gloria rich, Wu even ~0.5, Shu poor,
the Outlaws poorest, the Academy middling; it scales a lot's side (× 0.7–1.3) and thins the grid (rich = sparser). `h` = wealth in downtown, wealth × 0.4
elsewhere. Wu is weakly connected: harbor, Wu town, the beach strip and the inland `wu-village` (`wuVillage`) are joined by few links
(≤ 2 into each; only the coast road is `main`, the rest `dirt`). `maxLots` 1400
(~1190 on a fresh run: Wei ~570, Wu ~340, Shu ~160, Outlaws ~65, Academy ~33, Gloria ~25). `land` also carries `dunes`, `districts`
(`{ id, region, style, poly }`) and a `ritual` landmark (kind `ritual`, no pin, no label). New lot kinds (rowhouse, barracks, workshop,
market, warehouse, resort, kiosk, terrace) and the `ritual` landmark are drawn by T-051 (the renderer skips a lot kind the kit does not know).

Official venues (spec §4.21, `VENUES` in `data/city.js`): League Arena (Wei downtown, `cup` + `eval:wei`), Academy Hall (the campus, `eval:academy`),
Beach Stadium (the sand by the old resort strip, `eval:wu`), Highland Court (by Shu Peak's HQ, `eval:shu`). Each is a road node `venue:<id>` joined
to the nearest road by one edge, a landmark of kind `arena` / `hall` / `stadium` / `hillcourt` in `MapModel.landmarks` (id `venue:<id>`) and a pin
(`kind: 'venue'`, 🏟, always known — no fog gate); lots keep `VENUES[id].clear` map units away (the arena's is 52: it is ~40 × 32 m). `City.venue(run)`
(pure) is the venue of this week's match: a cup week → the arena, an evaluation → the Academy Hall for the Academy's, else the venue that holds
`eval:<your faction's region>`; null otherwise. Its pin gets the flag `today` (class `today`, a CSS-only pulsing ring). The spot card
(`venuePanel`, career-map.js) lists what is held there; the eval and cup cards say "at <venue>". Display only: no travel, no match rule, no save field.
The four meshes (kit3d `LANDMARKS`, an elliptical-ring helper for the stands) join the one merged landmark mesh: draw calls unchanged.

## Rankings

`Rank` (`js/career/rank.js`, DOM-free, no randoms, ties by id; display only — no match effect) builds three lists from three
biased publishers: `register(run)` (Academy Register: every pool player + the Academy squad + you by true OVR; `ovr` is shown
only for players you know — you / your squad / your faction / a scouted faction / `run.met` — the true OVR orders the list
but is not exposed), `gazette(run)` (Top `RANK.top` by fame: you = fans ÷ 100, others star / OP / awakened element / team
wins, × `RANK.weiFame` for Wei), `street(run)` (players with street points), and `of(run, id)` (1-based places; gazette /
street null when off the list). State: `run.met` (player id → faced on court: `Rank.meet` after every match you played),
`run.street` (points: `Rank.points`; a fought street battle `RANK.street.fight` + `win`, a hustle won `hustle`; a settled
battle — fought, watched or simulated — gives the winner faction's `share` best players `faction`: `Rank.settle`),
`run.refused` (club index → `{ week, n }`, used by team challenges). Constants: `RANK` in `data/world.js`.

UI (`ui/career-week.js`): the hub's Rankings drawer (`HUB_DRAWERS.rank`, `rankCard`, tab in `CW.rank`, `rankTab`) renders `Rank.register / gazette / street` — top `RANK.top` rows, then "…" and your row; `rankBest(run, players)` adds "Their best: …" (up to 2 players, null ranks skipped) to `evalPanel` and `cupPanel`. The UI only reads `Rank.*`.

## Team challenges

A map action at a club HQ (not your own): `City.worth(run, ti, stake)` → `{ verdict: likely|doubtful|refuses, why, accepts,
need, worth }` (worth = your side's rating + standing ÷ `CHALLENGE.standPer` + the faction's dogma term, vs the club's rating −
`margin`; the card shows only verdict + why). Doubtful is decided by a fixed hash of week / club / stake (no randoms, so leaving
the match and re-asking changes nothing). `City.challenge(run, ti, stake)`: refused → the trip + a day are spent, the diary gets
the faction's line (`CHALLENGE_LINES`), `run.refused[ti] = { week, n }` blocks that club for the week, and from `refuseMax`
refusals each further one costs `pest` standing; accepted → `{ accepted, stake }` and nothing is spent yet. `Cup.challenge`
is the fixture (same shape as `Cup.clash`; your side = Academy squad / club squad / `Cup.hired` street crew lent for the
match; the club's real squad); `Cup.challengeResult` spends the trip + day, pays the stake at odds (win) or takes it (loss),
pays the crew, then standing / fans / match XP / techniques / street points / `Rank.meet`. UI: `challengeBlock` in
`career-map.js` (stake stepper, verdict line, Challenge, ⏭).

### Loss and injury (T-038)

After a challenge (`Cup.challengeResult`) or a street fight you fought (`Cup.clashResult`): a loss runs `Cup.lose` (`LOSS` in
`data/world.js`: extra stamina, mood, standing with the club's region — challenges only, `run.losses[region]` counts them and from the
`repeat`-th each one adds `repeatRep`; a street fight keeps `CLASH.lose` — and a loss by `heavy`+ points costs fans and pushes a
`GAZETTE_JABS` line through `Run.news`); then, win or lose, `Cup.injure(run, risk)` rolls once (`R()`) against `City.injuryRisk(run,
oppRating, margin)` (pure: `INJURY` — rating gap, points lost by, low stamina, days since `run.lastFight`; `Run.dayNo` is the clock),
a second roll sets the severity (`run.injury = { weeks }`, longer of the old one; severe also −`lose` on one stat, picked from that
roll). The risk is computed before the trip and the match's tiredness are counted. `City.fightBan` ("Injured — rest first") makes
`City.challenge`, `Cup.challenge` and `Cup.clash` refuse; `Run.lineup` never starts an injured you. The physio clears `run.injury`
but not the lost stat. Evaluations and the cup carry no injury roll. Save v7 adds `run.losses` and `run.lastFight`. UI: the challenge
block and the street fight buttons show "Injury risk ~N %" and are disabled while injured.

## Training XP

Training gives XP (`Training.xpFor`: base gain × `TRAIN_X.xp.per` × every multiplier — place quality and home turf
(x), facility level, mood, streak, teammates, camp, Hard). A stat rises a point each time its XP reaches
`Training.need(v)` = max(1, round(base × grow^(v − from))) for every v, below 50 too (≈1 XP at 1, 10 at 50; T-055); leftovers bank in `run.xp`; nothing banks past the top.
`Training.top(run, stat, src)`: 'train' (sessions, the default) → `TRAIN_CAP` 75; 'match' → `CAREER.runCap`; wit its own cap. `sim` /
`gain` / `addXp` take the same `src`; a stat already above the top gains nothing from that source. Wit counts in 0.02 steps
(level = wit × 50). Events still change stats directly, but stop at `TRAIN_CAP` (`Run.bump` never lowers a stat that matches raised).

### Match XP (T-035)

`Growth.matchXp(run, m, mine, opp)` (career/growth.js), called from `Cup.result` when you played: your `m.stat` line × `MATCH_XP.per`
(`data/career.js`: kills → power, aces → power, blocks → jump + def, digs → def + speed, assists → wit, attempts → jump), × the gap
factor `Growth.gapFactor(ovr of your 4 starters, opponent's)` = clamp(1 + gap × `perGap`, `gap`), each stat through
`Training.addXp(…, 'match')` (so matches pass `TRAIN_CAP`). The winner is never read. A street battle you fight is a real match: `Cup.clash(run, side)`
builds the fixture (your side's crew from `Pool.draw`, you on court in your role, vs the other side's crew; both lent via
`Eval.squad` / `Eval.lend`), nothing is spent until `Cup.clashResult` (trip + a day, stamina, standing, fans ×grade, match XP,
techniques, `Front.result`); leaving early leaves the battle open. Watching stays `City.clash(run, null)`. The result line starts
with "XP: …" and the factor note.

## Career hub UI

`js/ui/career-hub.js` renders the whole career screen as a fixed full-screen layer (covers the page header): the
3D island map (`MapView`, see Island map layers; it keeps its own view across re-renders) and a HUD: resources (top left), day clock + End week (top right), your player (bottom left →
Player drawer), shortcut dock (bottom → drawers built from the panel functions in career-week.js), the selected-place
card (`#spot`), a card over the map for events / match days / an unread Gazette (`hubCard`), and a toast with the
newest diary line.

## Code layout notes

Playback is split into classic scripts loaded right after js/render/playback.js: clock.js (world clock `timeScale`,
the rAF loop `frame`, the stall watchdog), camera.js (push-ins), ball.js (net clearance, follow, bounce, trail),
scenes.js (banner, subtitle line, tap-to-skip). Tooling: `npm run lint` (ESLint flat config that collects the shared
classic-script globals from index.html), `npm run format` (Prettier, .prettierrc.json), `npm test`.

## Performance

The court canvas is sized to CSS size × device pixels within a budget (`COURT_PX`, 2.4 MP — fullscreen on a
high-DPI screen would otherwise be 6–8 MP a frame), and the 3D view renders at a dynamic fraction of it (`adaptRes`
in r3d: steps down to 0.55 when frames run under ~50 fps, back up when there's headroom). `matchState()` reports both.

## Match music

`sfx.js`: `assets/audio/the_big_fight.mp3` is fetched and decoded once (`SND.bgmBuf`; no `<audio>`/blob URLs, which the
artifact host may block), then looped by an `AudioBufferSourceNode` → its own gain (`SND.bgm`) → `ctx.destination`, bypassing
`SND.master` (no compressor, slow-mo low-pass or reverb). Level = `BGM_GAIN` (0.5) × `SND.vol` × (sound on ? 1 : 0);
`toggleSound` / `setVolume` re-apply it (`bgmSync`). `navigate` calls `bgmStart()` for the match screen (fade in 1 s) and
`bgmStop()` for any other (fade out 0.6 s); the result overlay keeps playing. Headless there is no `AudioContext`: no-op.

## Robustness

The frame loop re-schedules itself before doing any work and catches errors from `step()`/`draw()`, so one bad frame can
no longer freeze the game; a beat that fails 20 frames in a row is skipped. `watchdog()` logs a stall when play stops
moving for 6 s (25 s while the 3D players load) or one beat lasts 20 s, with a snapshot from `matchState()`.

## Saves

Career runs carry `v` (`RUN_VERSION`, `career/run.js`). Bump the version when the save shape changes and add a step to
`RUN_MIGRATIONS[oldVersion] = data => upgraded data`; `Run.load` applies the steps in order and ignores saves from a newer version.
Plain-default fields live once in `RUN_DEFAULTS` (run.js: name → `[make, valid]`): `Run.create` starts from
`Run.defaults()` and `Run.repair` refills any field a save lacks or holds broken, then repairs the run-dependent ones
(`academy`, `eval` + `Eval.setup`, `spotQ` via `City.roll`, `fog`, `clash`, `sta`, `mode`). Add a new simple field to
the table only. `run.grades` (your match grades, newest last) is capped at `MLOG.max` like `run.mlog`.

## Testing

`node tests/run.js` — no dependencies. `tests/harness.js` loads the headless scripts (core, data, engine, career) into a
`vm` context with a seeded `Math.random` and an in-memory `localStorage`. Tests cover:

- **golden** engine output (teams, recorded matches incl. beats, simulated matches, monster teams) → `tests/golden.json`;
- rally invariants over 300 matches and that every beat act kind has a renderer handler;
- data integrity (events, skills, calendar), full career runs, save round-trip, save migration.

A deliberate gameplay change updates the golden file with `node tests/run.js --update` — review the diff first.
Pure refactors must pass **without** `--update`.

### Match history (T-052)
`Cup.record(run, m, kind, extra)` (cup.js) pushes one plain entry onto `run.mlog` (save v8; trimmed to `MLOG.max` = 80, oldest dropped) for every match you are in:
it is called at the start of `Cup.result` (kind `eval` | `cup`, + `round`), `Cup.challengeResult` (`challenge`, + `stake`) and `Cup.clashResult` (`street`), i.e. before
`Growth.matchXp`, so `you` (OVR + the 5 stats) is the kick-off state. Entry: `{ week, day, kind, vs, short, score: [yours, theirs], win, grade (null if you did not play),
played, you, line: { k, att, err, blk, ace, dig, ast }, box: [{ name, role, side, ovr, k, att, err, blk, ace, dig, ast, you? }] }` — numbers and strings only, no player or team
refs. `matchLog(run)` (career-week.js) lists them newest first, each a `fold` (`ml<index>`) with your snapshot (change vs your previous entry), your line and the box score;
the `season` drawer appends it (career-hub.js). `Run.repair` adds `mlog` to older saves of the same version (RUN_DEFAULTS).

### Start from 1 (T-055)
`Run.create` gives your player `CAREER.start` (1) in every stat and `CAREER.witBase` (1.0) wit; creation (career-create.js) keeps role / name / modes and shows the stats as plain numbers (no allocation, no wit stepper). `CAREER.statMin` (1) is the floor of
`Run.bump` (events, injuries). `createPlayer` clamps stats to `STAT_FLOOR` (1, players.js); generated players still never go below 25 (`rollStats`). NPC generation and every engine formula are unchanged (goldens untouched). Save shape unchanged (RUN_VERSION 8).
