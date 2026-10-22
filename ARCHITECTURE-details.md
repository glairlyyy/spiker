# Spite & Spike — architecture details

Per-feature notes split from ARCHITECTURE.md (T-231). ARCHITECTURE.md has the layers, the file map, the recipes and the
core contracts; read the section here for the code you touch.

## 3D renderer (js/render3d/)

The 3D renderer draws every match (career, Monster playtest) with VRM anime players. It is a **renderer only**:
`render/playback.js` still turns beats into display state every frame (`A.disp`, `A.ball`, `A.cam`, `A.zoom`,
particles, labels) and `draw()` hands off to `R3D.draw()`. The classic 2D court lives on as a separate legacy
artifact; its drawing code was removed here. `js/render/` now holds: `playback.js` (beats → display state; engine
beats are copied per rally so playback never marks the engine's own), `clock.js`, `camera.js`, `ball.js`,
`scenes.js`, `effects.js`, `overlay.js` (the screen-space layer behind the `Overlay` object — `applyView`, `drawChant`, `drawTrail`,
`drawFx`, `frame` — called by r3d.mjs and the clock; view transform, chant, ball trail, labels, flashes;
`FONT_ROUND` / `FONT_DISPLAY` / `INK` / `roundRectPath`), `faces.js` (`faceSVG` portraits + `shade`; `PORTRAIT.frame` wraps an S / A portrait in `.gift` — see Presence), `tags.js`
(player / coach tags over the figures), `dive.js` (the dive timeline `diveF` / `diving` / `diveShape`), `acts.js`
(one-shot act handlers in three tables — `ACTS_FX`, `ACTS_UI`, `ACTS_ROSTER`, merged as `ACTS`; `instant(a)` looks the
kind up and calls it with `(a, d, bs)`), `movement.js` (pre-dig reads, spike approach, sprint caps, dig chases, squeaks,
air momentum, body separation) and `actors.js` (per-player timers, free fall, gait / dust, the celebration).
Units are named once in `engine/court.js`: `Z_UNITS` (z 0..1 ≙ 420 x units), `UNIT_M` (metres per unit: h, x, z —
units3d's KH / KX / KZ read it), `BALL_K` / `SERVE_K` (ball flight speed factors).

- **One world, built once.** `main.js` starts `load3D()` in the background at boot: import three.js + three-vrm
  (jsDelivr, import map in `index.html`), download the model, parse 8 players + 2 coaches, build the arena. Each
  match only re-dresses it (`bind()`: kits, hair/skin/eye colours, heights, crowd colours, LED board). Play holds
  (`A.hold`) until it is ready; if WebGL or the download fails, the loading card links to the legacy 2D version.
- **`P()` is the bridge**: `P3D` projects court points through the current 3D camera, so every effect, label,
  push-in and sound pan the playback layer creates lands on the scene. The view transform (`applyView()`:
  screen = f·p + o) is applied to the projection for shake/push-in/zoom, then the screen-space layer (`drawTags`,
  `drawTrail`, `drawChant`, `drawFx`) is drawn on the transparent canvas on top. Units: x/1000 →
  20.4 m court, z → 12 m, height 150 = the 2.43 m net tape (`W()`). Cameras: courtside (default), broadcast and follow. Follow (camera3d `setFollow(id)`): 4.5 m behind the player along their side's court axis, 2.6 m up, looking ahead and toward the ball, FOV 55, ~0.25 s smoothing; career follows `p.you`, Monster picks from a select; a player off court (subbed) → Courtside. POV (`camState.w.pov`): the followed player's head bone + 0.08 m forward, FOV 70, near 0.1; looks at the ball up to 100° off their facing (fading to straight ahead by 140°), look smoothed ~0.12 s, height within ±5 cm; airborne > 0.6 m / diving / turning > 220°/s blends to the Follow pose (`pov.fb`, ~0.25 s, held 0.3 s); actors3d `setPovHidden(w, id)` hides that figure's face / hair meshes while the camera is at its eyes (`povHidden()`, called every frame; `unbind` restores). Teammates within 0.9 m (body-capsule gap) of the POV eye fade out (~0.1 s, `povFade` in actors3d, driven by `povFadeId()` from camera3d: POV active, not in a scene shot) and fade back when clear; opacity is restored on reused figures in `dressFigure`. In a spike pose the cone lean is full (`kb = 1`), so the hitter keeps the ball in frame. Modes blend through weights (`camState.w`, ~0.6 s) and the follow pose is tracked in every mode so switches never jump; scene shots still override; P3D always projects through `base`. Follow / POV never turn from the opponent's side (`faceOpponent`: look within ±40° / ±55° of the axis to the net). The ball they look toward is clamped to the playable box and its weight eases to 0 (~0.25 s, `bw`) while the ball is hidden / parked, so a ball far out of the map never drags the view; `faceOpponent` fades its pull to 0 as the target goes directly behind (no ±40° flip); a scene shot's exit turns the view through the shortest arc at an even rate (quaternion slerp, not look-point lerp). Follow also dollies back (≤ 12 m) until the ball is in view (`ZO`). Auto zoom-out: when the ball leaves the frame (last frame's `base`, not in a scene shot) the FOV widens (+28° Follow, +20° POV, +10° Courtside) over ~0.3 s and eases back over ~0.8 s once it is in view.
- Modules: `r3d.mjs` (entry: build once, bind per match, per-frame `draw`, dynamic resolution, `api` = `R3D`),
  `units3d.mjs` (court units → metres `W`/`Wto`, `canvasTex`, `lowEnd`), `arena3d.mjs` (lights, court, net, board,
  arena stands, ball + glow; `dressArena`, `updateBall/Net/PointFlash`; returns `hemi`/`sun`/`rim`/`floor`/`outer`/
  `board`/`stands` for the venues), `venue3d.mjs` (spec §9.11: `VENUE_SETS` registry;
  `js/render3d/venues/`: `looks.mjs` (`LOOK` per venue — sky, fog, light, floor colours), `floor.mjs` (`drawFloor`),
  one set builder per venue `arena|hall|beach|highland|street.mjs`, `props.mjs` (officials, benches, table, cart), `kit.mjs`
  (box, figure, light beams `BEAMS`, bleachers). `buildVenues` builds every set hidden + the cut-out crowd (4 instanced pose planes, tinted per instance), officials
  and props, big screen canvas, zone rim light, confetti; `dressVenue(w, kind, stakes, c0, c1)` per match redraws the
  floor canvas, shows one set, fills the crowd rows × stakes; `updateVenue` per frame: crowd bounce / wave, zone dim +
  rim, confetti on `A.cele`, highland flags, big screen from the shown scoreboard. The venue and stakes come from
  match-screen `matchVenue(fx)` / `matchStakes(fx)` → `A.venue` / `A.stakes`; Math.random only), `camera3d.mjs` (game
  camera, scene shots `shotPose` with hard cuts, `P3D`, view transform, camera mode, debug camera),
  `actors3d.mjs` (`posePlayer` → `motion`, `steer`, head tracking, `reachForBall`, `lightTrails`, `glow`;
  `poseCoach`; `dressActors`), `fx3d.mjs`, `trails3d.mjs`.
- Main model: your career player (`p.you`) is always `assets/vrm/main.glb.txt` (Main_v2, base64 like the base model, one
  figure with `model: 'main'`, `own: true` → no kit tint, added to the pool in the r3d build; a failed load falls back to the base model).
- Extra player models: a .vrm picked in the menu (Playtest card) is kept in the player's own browser (IndexedDB,
  `js/ui/models.js`, never uploaded) and loaded at start-up; `R3D.addModel` adds `EXTRA_FIGS` figures of it to the
  pool. They appear in non-career matches (the Monster game) only: `dressActors` gives every player a model at random with equal odds
  among the base model and every loaded one (stable per player via `hu`, while figures are free). VRM 0.x models are rotated
  (`rotateVRM0`); dressing matches VRoid material names anywhere in the name.
- Bundled models (owner, 2026-10-08): `players3d.mjs` `BUNDLED` = the owner's VRMs (Main_v2, Rival_v2, Rivar_v3, Rivar_v4, male1,
  male2; `assets/vrm/*.glb.txt`, ~63 MB of text). `R3D.loadBundled(onProgress)` downloads and adds them once (4 figures each,
  `w.bundled`) on the first Monster game (`fx.bundled`; match-screen `open3D` holds play behind the loader); `dressActors` then
  picks only among them (another bundled model when one's figures are taken), never the base model.
  Menu button "Model colors: Own / Team" (`Models.keep`, localStorage `sns_keepcol`; always shown) → `R3D.keepColors(on)`:
  loaded models are `undress`ed (original colours / hair + iris textures restored) instead of `dress`ed; the base model always gets the kit.
- One heavy pass per model file: `makeVRM` shares decoded textures (`imgCache`, clones share one image / GPU upload),
  geometry (`geoCache`, the first figure's meshes) and greyed hair textures across every figure of the same model.
- `players3d.mjs` — VRM loading, repeatable dressing, pose → normalized bones, smoothing, arm aiming at the ball
  (`torsoDir`/`bendArm`), feet on the floor, expressions.
- `poses3d-attack.mjs` — the spike swing / jump serve, the landing and the float serve, and `RA` (right-arm keys with a
  palm twist; the dive uses it too). Import cycle with poses3d.mjs: it is evaluated first, so its top level uses only its
  own names (own `V` / `leg`), THREE, `mirror` and `clamp`; what it imports from poses3d.mjs runs inside functions only.
- `poses3d.mjs` — one pose per engine pose, driven by the same values the playback layer keeps (swing/spike
  timers, jump arcs, `diveShape` (dive.js), `setMotion` (poses3d.mjs)) plus **measured motion** from `actors3d.mjs` (`motion()`: speed,
  forward/lateral velocity, gait phase advanced by distance so feet don't slide). Locomotion blends keyframed
  walk → run cycles (Catmull-Rom over contact / mid-stance / push-off / swing), backpedal and side shuffle. The
  spike is timed off the jump: run-in → penultimate step (arms back high) → plant/load → two-arm take-off →
  "bow and arrow" (non-hitting arm points at the ball, hitting elbow drawn back above the shoulder, chest open,
  knees bent behind) → uncoil square to the net → contact on a straight arm above the hitting shoulder, open palm
  (keys carry a palm direction, `palmTwist`) → wrist snap → arm across to the opposite hip → soft two-foot landing,
  with per-style arm tracks (normal, cut, tip, quick; power arches more, pipe splits the legs). The playback starts
  the swing `swingLead` ms before the ball arrives, so the hand meets it at the top of the jump (held through
  cut-ins). A quick (`d.spkFast`, set by acts `spkstyle` 'quick', kept on a tipped quick) uses playback `SWING_FAST`: a shorter lead
  and a wind-up keyed to the ms left before the swing (`quickWind`, from `jmode.dur`) instead of the jump height. Contact heights come from the hitter's body height (`reachH`) plus the jump the stats give
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
- `fx3d.mjs` (T-269: an assembler — `createFx` = `createKit(scene)` (fx/kit.mjs: textures, shaders, the particle / streak pools,
  rocks, bolts, rings, discs, domes, `update`, `stats`) + the effect groups fx/ground, hits, elements, trail, leap (high jumps: actors3d leapOff / leapAir, playback leapWarp), each `xxxFx(K)` →
  its methods; a new effect = one method in a group; `rr(a, b)` = Math.random range) — 3D effects: GPU particles (glow / spark / smoke / billowing puffs, per-particle spin), velocity-stretched
  streak sparks (instanced quads, floor bounce), floor glow discs, lightning tubes, shockwave rings, bouncing rocks (per-instance
  colour), one style per team element. Every tunable number is read live from `VFX` (js/data/vfx.js, `vx(group, key, default)`): `airImpact` rings run large → small down the shot (Doppler; `classic` = small → large, lab only); `blast` fires on a kill on the floor when `VFX.blast.on` (effects.js `groundBlast`); `stats()` = live counts. `render/effects.js` hands its entry points (`burst`, `impact`, `elemBurst`,
  `elemImpact`, `elemTrail`, `zap`, `bolt`) to `R3D.fx`, anchored at the ball; powered balls also glow and light
  the players; OP players crackle with arcs in the air. Labels, speed lines, the drill wall and cut-ins stay as
  the stylised screen layer.
- `trails3d.mjs` — light trails (camera-facing ribbons that taper and fade with age; every trail measures its point's speed and dims out when it stands still — `MOVE`; the ball's screen and element trails use `A.mv`, 0..1 from the ball's speed, set in ball.js `ballPhysics`): hands in the player's hair
  colour (stars a narrower, shorter streak, OP players a wide long one, stronger in the zone), and Kuroko-style eye
  streaks in the eye colour that flow back behind the head (`drift`) — anyone while their team is in the zone or they carry a captain's buff. Style `ink` (`o.style`, ⚙ Trails / `G.trail`): FS_INK (normal: black ragged stroke, value-noise strands seeded by each sample's birth time, fraying with age) + FS_BLOOD (additive crimson core + halo).
- Model: `assets/vrm/` (licence, and how to swap in VRoid characters, in its README). `qa_poses.html` (not
  published) renders single poses for visual checks.

## Net clearance and errors

Every ball the engine sends across the net clears the tape by the ball's radius plus a margin (`clearNet()` in
playback lifts the arc just enough — the long back attack gets a topspin loop). Errors never cross by accident: the
engine decides them by chance and skill (`Formula.spikeErrorP` — wit, set quality, over-hitting, contact height over
the net; `serveErrorP`) and which way they go (`spikeNetShare`: lower contact → net; `serveNetShare`: flat or tired
swing → net, too much power → long), then ends those balls at the net or out.

## Faults — net touch, foot fault, double contact (spec §4.38, T-337)

Three faults, each one draw at a fixed place, chances in `FAULTS` (rules.js) via `Formula.netTouchP(p, kind, fatigue)` /
`Formula.footFaultP(server, type)` and `doubleContactP` (stats.js). **Foot fault**: every serve, in `playRally` (serve.js)
right before the service-error roll (`footFault(c)`: a service error — `st` err, not a `srvLog` err: the serve odds don't model it;
jump serves × 5 a float). **Net touch**: the draw `x.ntU` is made at the end of `blockCoverage` (rally-block.js) on every attack;
`netTouch(c, x)` reads it in `attackPhases` (rally.js) after `block()` when the block did not end the attack (a stuff is dead
first) and before the dig: the bodies at the tape are a front-row hitter (`hit`; a tip never touches) and each blocker (`read`;
a middle on Commit `commit`), each × tired (1 − stamina), × low speed (the engine's Agility), × a Hothead (`mtr`). A blocker's
touch → the point to the attack, the hitter's → the defence. Each fault emits `{ k: 'label', t, big, call: 'net' | 'foot' |
'double', at: { x, z } }` (net: on the toucher's side of the tape, foot: the end line at the server's z, double: the set
point) — the call T-338 shows. Engine-only tally `m.flt = { net, foot, dbl }` (`fltAdd`, no draws). Rates (rate test, 200
seeded matches of mkTeams): ≈ 1.0 net touches, ≈ 0.5 foot faults, ≈ 0.65 double contacts a match. `COURT_LINES` (rules.js)
names the painted lines in engine units (end x 80 / 920, side z 0.08 / 0.92).

## The calls you see — Ref drone and the Academy's referee (spec §4.38, T-338)

Display only, no act kind of its own: a fault label carries `call` + `at` (T-337), and `ACTS.label` (render/acts.js) hands it
to `refCall(k, at, line)` → `A.call = { k, at, line, n, pt }` (`n` counts calls, `pt` = `A.pointN` when made). At the `point`
act, a rally with no fault call is checked for a close line: `lastLanding()` (the rally's last ball act ending on the floor,
back to the `reset`) → `lineCall(x, z)` → `{ k: 'in' | 'out', line: { axis: 'x' (an end line) | 'z' (a side line), v } }`
when the ball lands within `LINE_CALL.m` (0.15 m) of a `COURT_LINES` line, else null. venue3d `updateVenue` reads `A.call`
each frame: at every venue but the Academy Hall `updateDrone` (fx/drone.mjs: a low-poly drone flying 4.4 m up outside the far sideline (SIDE), level with the ball,
following the ball along the court; a new `n` → it comes down there, level with the spot (`H.call`, over the tape for a net touch), the hologram word (a
sprite, `CALLS[k].word`, verdict colour from theme tokens `--good` / `--bad`, frame `--cyan`), a projection cone and a line
trace along the end line / the tape / the judged line (a ring for a double); held `T.hold` 1.9 s, then back); at the Hall
`updateReferee` (venues/referee.mjs on the wooden stand of venues/props.mjs: the whistle — hand to the mouth, a puff — then
`SIGNALS[k]` toward the call's side, 1.9 s). The stand and the line judges show only at the Hall (the drone calls elsewhere).
Both run on the frame clock and never touch playback. The whistle / beep sound is sfx's (merged separately).

### The drone as an item: pickup games and terrain (spec §4.38, T-339)

- **Terrain in the engine** — a field match carries `m.ground = { k, home: [ids], low }` and `m.wind` (0–1), from `newMatch` opts or a
  fixture's setup (`Encounter.groundOn`); official courts carry none, so every hook is × 1 / + 0 and the draws are today's (goldens hold).
  `GROUNDS` (rules.js) per ground; the hooks read `CM.ground` through `Formula.gMul(p, key)` (agi: the speed term of receiveScore /
  digScore and mustDive's reach; jump: spikePower / blockPower; hp: knock()'s HP hit; dig: digScore) and `Formula.gOff(p, key)` (pass:
  receiveScore; set: setSuccess; serve: serveErrorP for the side `m.ground.low`). A player in `home` (their pool's region =
  `GROUNDS.home.region[k]`: Wu → sand, Shu → slope) keeps `keep` of each penalty, + `plus` on agi / jump (HP is the ground's for all).
  Draws only with a ground: one R() a dig on grass (`bounce` → − `bad`, rally-defense digSetup), one rnd() a float serve's receive with
  wind (serve.js serveAim). `m.grd.ko` (engine-only) counts knockdowns on a field. Measured (1200 seeded matches, each pair both ways; side 0
  wins 52.3 % on a court): sand HP a hit −25 %, knockdowns 4.8 → 2.8 a match, touches a rally 1.23 → 1.19 (51 %); grass loose passes
  13.4 → 14.1 % (50 %); asphalt HP +30 %, knockdowns 7.6 (52 %); slope: the low side's serve errors 15.7 vs 13.9 % (side 0 low: 50 %);
  wind 1: loose passes 14.7 %, aces 4.4 → 4.7 (51 %); born to the sand (all of side 0): 54.8 % (+2.5 on a court, +3.9 on the same sand);
  born to the slope at its low end: 50 %. Every swing ≤ the ±5 % home-court edge (noise ±1.4).
- **Career** — `City.groundAt(run, p)` (pure): `{ k, wind, name }` or `{ why }` (sea, reservoir / paddies, airport, within
  `PICKUP.road[kind]` of a road, an official venue's clear, a building lot); sand = MapModel.onSand; grass in parks; slope on terraces,
  the quarry, the fields and Shu's relief gradient > `PICKUP.slope`; asphalt in Wei, the Outlaws, yards, quays; wind by exposure. The
  drone: `City.drone(run)` ('own' / 'rent' / ''), bought at `SPOTS.cargo` (act 'cargo': `City.dayDo` → `buyDrone`, flat `DRONE.buy`),
  rented at a court (`City.rentDrone(run, C)`: the walk there, `DRONE.rent`), a rented one spent by `droneUsed` after its match.
  `City.playAt(p, fn)` sends every `City.go` inside fn to p (a road stop's challenge on the spot).
- **Pickup / Spar** (encounter.js, no R()) — `Encounter.field(run, p)` = `{ at, g, name }` or `{ why }`; `fieldNear` tries p, then
  `ENC.pickup.near` rings × `dirs`. Spar (the figure menu) takes a court, else with the drone the field near them. `Encounter.pickup(run,
  p)` (the point card): the people within `ENC.pickup.r`, nearest first, one per crew — the first whose headline behaviour agrees
  (`refuses`: `ENC.pickup.flat` = Picky / Egoist off anything but asphalt) plays; `pickupFx` → `sparFx` with the field: `fx.venue =
  'field'`, `fx.ground = { k, wind }`, setup puts `matchGround` (home ids, the low side by hash) on m. `sparResult` → `fieldAfter`: the
  rented drone back; on asphalt each knockdown of yours an injury chance (`GROUNDS.asphalt.ko`, hash) and Pain for Endurance < 50; no bad
  memory for a loss. A road stop's crew: `Encounter.spot(run, E)` (drone, open ground
  at the stop, their captain agrees) → `answer(…, 'here')` = `spotChallenge`: Fight.offer / Fight.challenge inside `City.playAt(stop)` with `at` = the stop (`Fight.cost`: the trip there + the day, not their HQ's),
  the fixture re-dressed as a field.
- **UI** (career-map.js) — `PANELS` gets the Cargo Shed (`cargoPanel`: Buy the drone, the one primary); `spotCard` appends `pickupRow`
  (map points: P, Shift + P ⏭) and `rentRow` (courts and venues: D) in the figure menu's row look (`dronePickRow`: key, name, cost →
  result or the gap; never the card's primary); `encRows` adds "Challenge here" for a crew (⏭); `mapPickup` / `mapRent`.
- **Field venue** (match-screen.js `A.ground` from `fx.ground`; stakes 0.12 → a handful of onlookers; venue3d `dressVenue('field')`):
  `LOOK.field` + `FIELD_LOOK[k]` (sky, light, ground tones), `drawField` (the ground patch and grain, the projected lines in `--cyan`
  with a glow, a scan), `setField` (the light-curtain net with its tape and light antennae, two projector pylons; props per ground:
  palms and the sea / trees / cars and bollards / trees, rocks and a bank rising behind the high side's end), `w.netKit` (the real net,
  tape, posts, antennae) hidden; the drone (T-338) hovers and calls there like any venue but the Hall.

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
> is kept in `m.dsetLog`. The match screen's Tactics popover has a Defence select per team (`setDefence`, `showTac` shows the
> captain's current pick). Scouting: `Dossier.habits(team)` (quick share from style × MB count, favoured wing by WS power, pipe =
> setter has `pipecombo`, defence setting) and `Dossier.habitText`; shown in the dossier's club rows and the HQ card once
> scouted — computed from data, never from match history.

## Ego — removed (owner, 2026-10-06)

No ego personality, ego acts, `m.egoLog` or ego moment any more; `Run.load` drops an old save's `p.ego` and memories of removed kinds. The tracked chase shot is `A.shot` kind `follow` (used by the calls, §2.13).

**Relationships on court (T-066).** `newMatch(a, b, rec, { rel })` → `m.rel = { tag: { 'idA|idB': band }, rival: Set }` (null in Monster, sims and the golden matches), built by `Rel.matchFlags(run, A, B)` for every pair in both squads (viewer first; you ↔ NPC is the NPC's stance both ways; only non-neutral bands stored) and handed over by the fixtures of `Cup.fixture` / `challenge` / `clash` (`fx.rel`, set on the match in `fx.setup`). **The gating rule:** every effect reads `relTag(m, a, b)` (match.js: 'neutral' without `m.rel`) and either multiplies by 1, adds 0, or sits behind `m.rel &&`, so a match without flags (or with empty ones) draws the same randoms and gives byte-identical beats (a test proves it); no effect adds a draw. `REL_E` (data/rules.js): **trust / freeze** in `chooseAttack` once either side has `clutch` points — the single `wpick` draw is read against the plain weights and the weights × (1 + trust) for an ally / × (1 − freeze) for a resent / enemy hitter; when the picks differ a talk beat (`CALLS.trust` / `CALLS.freeze` + a log line, no new act kind) is pushed before the set; `m.relLog` records every clutch pick `{ act: 'clutch' | 'trust' | 'freeze', p, mate, tag }` (engine-only, for tests); **cover** (`popRecovery`, block cover in `block()`): + `REL_E.cover` on the save chance of an ally of the first touch / blocked hitter; **buff** (`captainThink`): allies of the captain weigh `REL_E.buff` × when the hottest mate is picked. **Rivals across the net** (`Cup.prepare`, no engine change): `Rel.rivals(run, opp)` — NPCs of your role, close in OVR, resent / enemy — start with form + `REL_E.rival.fired` (proud / reckless) or `.rattled`, with a diary line. No relationship gives a stat bonus.

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
started or finished on the bench → rewards × `BENCH.partMul`; a bench win never counts for "win the evaluation" (`run.evals.win`).

## Blocks

`block()` (engine/rally-defense.js): a block is attempted when coverage > `BLOCK_MIN_COV`. Order: block break (spike
beats the full block by 10%+) → stuff (`stuffChance`: the block at full strength vs the spike, weighted by
coverage^`STUFF_COV_EXP`; a cover dig may save it) → touch → tool off the hands (only off a partial block,
`TOOL_COV`, at `TOOL_P`). A blocker at least as sharp (wit) as the hitter keeps part of the block on a cut shot.
Targets: ~14% of attacks stuffed in normal matches (measured 13.7 % over 600 Read-vs-Read sims, `STUFF_BIAS` 0.45); Monster games stay offence-heavy (every hitter has every
technique). Kill blocks get a scene: a `ball` close-up on the stuff, then the blocker's face and line
(`hypeKillBlock`: level 1 at match point or for a star blocker at most every 6 points).

## Far digs (playback)

`digChase` (movement.js, at a beat's start): when a dig/receive target can't be reached at a sprint in the beat's
time (including coming down from a block jump), the beat gets `_dig` = the world time scale that makes it just
reachable (≥ `DIG_SLOW_MIN`). `timeScale` drops to it at once; the digger (`A.digHero`) runs on real time — timers,
`capMove` sprint cap, straight-line chase, 3D posing — so they move and dive at normal speed while the ball and
everyone else slow down. Presentation only (no engine change). Before that, `preDigLook`/`preDigGo` let the
digger read the attack: halfway through the beat before a far dig they already start running for it.

(Ego moments used to reuse that clock; removed 2026-10-06.)

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
Back-row attacks (`spkstyle` pipe — pipe and long back attack; `ap.back`, `ap.deep` = run-up point or end-line `via`) by a
hitter in front of that depth curve instead (owner, 2026-10-08): `backCurve` builds a cubic Bezier from where they stand —
out to their side and back, round behind the depth, in to the take-off point — with an arc-length table; `curveMove` runs it
over the time to `t0` (from `PREAPP_AT` of the beat before, else the set beat) at `s = τ^e`, `e = min(2, fit)` so it
accelerates but never ends past a sprint. No curve when there isn't time (`fit` < 1.05): the straight run as above.
`d.curve` is cleared at `t0`, on `reset`, and when the approach ends.
Facing (actors3d `steer`, `longRun`): a fast (> 2.2 m/s), long (> 2 m left, or of the curve) run that isn't forward turns
the body to the run direction instead of backpedalling; blockers, setters and a hitter's short retreat to the run-up
point keep facing the net.

## Pre-serve routine

The serve type is picked before the reset, so the server walks straight to where the serve starts (the run-up start
for a jump serve / jump float). The engine's `hold` beat + a 1.1 s beat before the serve. The ball appears only when
the routine starts (`followBall` sets `A.ball.vis`). Playback gives the server pose `preserve` and `d.psv`
({ kind: 'bounce' | 'aim', t }, t runs once they stand at the service spot). `preServe` (render/ball.js) is the one
timeline: it places the ball (two bounces off the right hand → catch to the chest; or spin in both hands → held out
in the left hand at eye height toward the other court) and stores the phase in `d.psvB`, which `preservePose`
(poses3d) follows; `pose.hand` tells `reachForBall` which hand(s) meet the ball.

IK (js/render3d/ik3d.mjs, display only), after the pose, smoothing and grounding in actors3d `posePlayer`: `twoBone(upper, lower, end, target, pole, w, keepEnd)` turns a limb so its end reaches a world point, bending toward the pole (the pose's own knee / elbow offset), the end keeping its world rotation. `footIK`: on the floor (not jumping / lying / diving) and slower than `VFX.ik.run` m/s, a foot the pose has down (`VFX.ik.down`; standing still — `m.now` — `VFX.ik.stand`, with hysteresis) is locked where it touched and flat on the floor (a toe-pitched foot or a pose `lift` keeps the pose's height) (`pl.feet`); one foot steps at a time; out of reach counts only what the lock adds to the pose's own reach; when the pose lifts it, or it slides past `slip` m / out of reach, it steps over `step` s with an `arc`, closing its offset from the pose's foot (relative, so a body running on never stretches the leg back); in the air locked feet step off the same way. Any change of state keeps the jump as a residual that fades (`res`, 25/s); a lock far off (a teleport) is dropped. `armIK` (replaces the old contact bend in `reachForBall` when `VFX.ik.arms`): at a contact (`pose.contact`) the hitting hand (spike, serve, dive, the one-hand block, `pose.hand`) goes `GRIP.one` m short of the ball along the shoulder → ball line, else both wrists go around / under it by `GRIP[pose]` (bump: under it, set: around and behind, block: either side); fades out beyond 1.35 × the arm's length or when the pose's arm is more than `TURN` (40–85°) off the target line (a whole-arm turn by IK rolls the forearm); the target is the flight ball (not the drawn one), the elbow pole a fixed out / down / back direction, each arm's weight eased (`pl.ikW`), the hand follows the forearm. Arm twists blend by the real roll (poses3d `mixArm(a, b, t, side)` — side −1 for `ar`, or `mixArmR`): the two ends' rotations are slerped and the twist read back about the blended direction, nearest the plain lerp; `RA` keeps every palm twist in −π/2..3π/2. QA hooks: `R3D.qaFeet()`, `R3D.qaHands()`, `R3D.qaHandRot()` (hand rotations + forearm directions), `R3D.qaBallW()` (the flight ball in world units).

Planted gait (js/render3d/gait3d.mjs, display only, VFX `gait`), in actors3d `posePlayer` after `footIK`: `gaitIK` plans
each foot from the gait phase (`m.phase`, `m.step`): a foot is down for the duty `SWEEP` × leg / (2 × step) of the cycle
(~0.6 walking → `minDuty` sprinting; fixed at its contact; a foot as far behind as the leg sweeps, or out to the side, lifts
early; one contact per cycle), locked where its swing landed (`f.lastT`); in the swing it travels from the lift-off to where the
hip will be at the next contact plus half the next stance's travel (re-aimed less and less, kept within reach), planned in the
hip's frame (`f.rel` → half a stance ahead, plus the landing's drift `f.next − live`) so the foot travels with the body, landing `ahead` = min(step × duty, ½ SWEEP × leg) in front; a stance foot behind the hip
raises its heel (≤ 12 cm); the hip height is the gait's own (`pl.gHip`: 0.95 leg, down to what a foot down or landing next can
reach, ≤ 12 cm, eased; + pose.lift), replacing the pose's FK height; landings follow the curve (heading rate `pl.gOm`, `arc(D)`), the swing's body frame turns with
the heading (`f.relH`), the heading restarts with the gait (`pl.gDir` null when off); knees point the hips' way (`pl.hipLead`,
secondary3d turnLag: hips turn ahead by ½ the turn to come, ≤ 0.5 rad, the spine twists back); heel up
first then the knee through (lift `gait.lift` × speed). The hips come down as far as a planted foot needs (`pl.gHip`; `pl.gDrop` = how far below 0.95 leg, for QA;
eased). Targets blend from the pose's foot by the weight `pl.gW` (forward-gait share × `pose.gaitW` — 1 from locoPose, carried
by `mix` — × speed from `gait.from`; eased) and are solved fully (ik3d `twoBone`). `footIK` plants nothing new from gW 0.2 and
hands the feet over at 0.8. Heading eased (`pl.gDir`).

Landings (display only): poses3d-attack `landBlend` mixes the spike / jump-serve air pose (jy ≥ 9) into its landing pose as
jy falls from 18 to 2. playback `capMove` holds a body for `LAND_ABSORB` ms after touchdown, then catches up at ≤ `RUN_ACC`
m/s² (`d.cv`, reset at touchdown in actors.js) and slows into the spot at `RUN_DEC` m/s². A fast catch-up turns at most `RUN_TURN` (18 m/s²) sideways (`d.ch`, its heading), braking while the turn is over 1 rad; the last metre goes straight. ik3d `footIK` keeps a diver's feet planted until `diveF` > 0.36.

Secondary motion (js/render3d/secondary3d.mjs, display only, VFX `sec`), in actors3d `posePlayer`: the gait's weight shift is
part of the pose (poses3d `forwardGait`: `sway` m to the left — applied to the root like `slide` — and `hroll` with a counter
`sroll`, all × sin(phase), smaller when running; `sway` is in `NUMS`); `turnLag` (before applyPose) twists the spine against
the body's turn speed (`pl.yawV`; the head is turned back by the same amount) and, running, rolls the hips into the turn;
`landSpring` (a damped spring `pl.sett`, kicked on touchdown by the jump's peak) pitches the hips (pose.hp) and returns a
sink that lowers the root after the grounding, the foot IK keeping the feet on the floor (`footIK` never targets below it);
`headSteady` (last, after the arm IK) pulls the head's world rotation toward a level look at the ball by run speed (eased
`pl.headW`, none past ~80° off the pose's look) and low-passes it in world space (`pl.headQ`).

Animation lab (dev; js/ui/anim-lab.js + js/render3d/anim3d.mjs): menu › Dev › Animation lab → `startMonster({ anim })` → `A.animLab` (`animLabInit`: selected player, speed, foot marks, frame `i`, `replay`, edit `over`). actors3d `posePlayer` keeps each player's final pose and jump lift (`pl.lastPose`, `pl.lastLift`); r3d draw calls `animCapture` once per frame: the exact `DRIVEN` bone rotations, root, pose copy, display state (`pose`, `spk`, `jy`, `landMs`, …), feet and ball, for the last `ANIM.sec` (8) s of world time (nothing while paused). Freeze (`R3D.anim.freeze`): the game pauses and r3d draw plays the recording instead (`animReplay`: bones and roots set straight, the selected player's edited pose applied with no smoothing and grounded at the recorded lift), through the free camera hook (`setDebugCam`) orbiting the selected player (drag / wheel on #stage → `animOrbit`), with optional foot marks (Points of every recorded foot position) and the 2D overlay hidden. The panel (VFX panel mode) scrubs / plays / steps, edits the frame's pose values (body numbers, legs a / k / f / s, arm segments as azimuth / elevation + twists) and copies the frame as pose code (`animCode`). Clips (`A.clip`): `animClipFind(id)` plays real rallies of a fresh no-subs lab match until one has the wanted moment (`ANIM_CLIPS` finders over the beats; a knockdown made likely while looking); `animClip` fast-forwards the playback silently to just before it, keeps the display state (`animSnap`: every `A.disp` entry minus the player, the ball, the last touch) and the beats from there; playback `step` calls `clipLoop` at the end (state copied back into the same objects, fresh beats); r3d aims the orbit camera at the player (`animFollow`).

Slow-motion cooldown (render/slowmo.js, display only): `SlowMo.beat` runs at each beat's first frame (playback step, before the Hype check) and takes a beat's slow motion away when it doesn't end the rally (`decisive`: from this beat no bump/dive before an `impact` landing, or a scene after the kill) or its kind (`kindOf`: scene — build-up, defence read, scene beats —, scramble, fake, block, delayed) is cooling down for the rally's winner (`sideOf`: the queued point act): the slow fields go, a staged scene is skipped like Hype off. Director `frameOk` asks the same for the impact frame. `take(kind, side)` decides once per rally (`A.slowRally`) and starts the team's cooldown (`A.slowLast`, by `A.pointN`); VFX `slowcd` { on, pts (3), shared (1: one cooldown for every kind) }. Exempt: the far-dig chase (`_dig`, set later in startBeat) and the cut-scenes.

Cinematics (render/cine.js, display only): at each beat start `Cine.beat` counts points for the budget (`A.cineCool`: a side needs `CINE.every` (2) points since its last one) and, while none runs, looks at the rally's queued beats (again when more arrive, `A.cineSeen`): `Cine.ace` (an `ACE!` label after the reset → the server) or `Cine.kill` (the last set to a hitter before a killing landing, the point to the hitter's side: a WS → `ws`, an MB on a `quick` spkstyle after a pass → `quick`; `{ p2: the setter, set, start: the pass beat, end }`). `Cine.step` puts up one tracked shot `A.shot = { kind: 'cine', cut, p, ph, track }` when its moment begins (ace: the serve routine; ws: the pass to the setter) and sets the phase from the display state — ace bounce → run → hit → ball, ws set → run → hit → ball, quick set (framed on the setter, `'p2'`) → hit → ball; `Cine.slow` slows the world until the ball phase by the kind's `slow` group (ws `wrun.slow`, quick `qhit.slow`; clock.js timeScale). camera3d `cinePose` frames each phase from its VFX group (`CINE_KINDS[].ph`: feet / hand / ride framing; groups `cbounce` … `cball`, `wset` … `wball`, `qset` … `qball`, `lab: 'cine'`, `cut`) and glides between them (tracked shots ease their fov too). `shot` acts and endScene leave it alone (`Cine.busy`); it ends the ride group's `hold` ms after the landing beat. Off with Hype off, reduced motion or the fixed camera. Court labels show again in the `ball` phase; coach tags are hidden in every close-up. Cut-scene lab (menu › Dev): `startMonster({ cine })` → `fx.cine` sets `A.cineForce` (that cut-scene every time, no budget, any settings) and `m.dev` (engine, serve.js: `'ace'` makes every serve a clean ace — the same draws, so goldens never see it); the VFX panel in its cut-scene mode shows the kind switch (`cineLabKind`), Force rotate (`m.devRot`: match.js pointTally passes the serve to the other side and rotates it every rally), ¼ / ½ / 1× speed and only that cut-scene's groups; Copy / Download as for VFX. The ordinary VFX panel leaves the cut-scene groups out. Paused, the camera keeps easing on real time (r3d draw), so edits show on a paused frame.

Stride (display only): actors3d `motion` sets the step length `m.step` = clamp(0.35 + 0.22 × speed, 0.45, 2.4) m × (0.6 + 0.4 × `m.far`) (`m.far` 0..1: distance left to the target over the last 2 m, smoothed; `STRIDE`); the gait cycle is two steps and poses3d `locoPose` sizes the leg swing to it (stride = m.step / the step the walk / run keys are drawn for, 0.5–1.6). Waiting stances: poses3d `idleReady` picks READY / READY_PALMS / hands-on-knees (REST_KNEES) per player per rally (hash of number and `A.rallyNo`), the rest only while calm (eased `d.restW`, `pose.kneeHands` → ik3d `kneeHands` puts the hands on the player's own knees after the foot IK). The forward gait, backpedal and side shuffle blend by weight (poses3d `gaitW` / `gaitNow`; `m.gw` eased in `motion`, a caller may force one), and the body's turn (`steer`, `pl.yawOff`) is a critically damped spring (`pl.yawV`) — no hard switches that flick the legs.

Back bump (display only): `backBumpLook` (playback, at a beat's start) sets `d.bb` when the ball comes to a bumping player who must move ≥ 2 m mostly away from the net; then steer turns them away from the net (yaw π until the swing is done), the bump swings up to `BACK_UP` (poses3d: platform over the head, body leaning back) and resolve meets the ball in front of the turned body. The pass beat restating the bump keeps the decision.

Contacts at the hand: `A.handTouch` ({ p, c, hz, b }, playback `startBall`) → `handTouch` in r3d pulls the drawn ball
onto the real hand(s) over the last 35% of the flight (block: the hand on the engine's `hz` side — rally-defense `block()` tags the target with the court-z side the spike crosses on, no draws; actors3d `reachForBall` then bends only that arm (`blockHand`), the other stays in the block pose; spike / serve: the right hand).
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
transfers, promotion). Saves (RUN_VERSION 9 — see Saves) store `bench` next to `P`; `teamFromJSON` relinks it.

## Faction pools

Each faction (`POOL` in `js/data/world.js`: Wei 24, Wu 18, Shu 12, Outlaws 6, St. Gloria 6; `SQUAD` = 6) is a roster = its league-team
players + generated reserves. `Pool.build(teams, used)` (`js/career/pool.js`, called by `Run.draft`) makes one
reserve team per region (`run.reserve[region]`, `i: -1`, `P` may be empty); `Pool.players(run, r)` / `Pool.size(run, r)`
list a faction's team players (squadOf) then reserves (12 / 6 / 0 / 0 / 0 with the defaults). Reserves are saved (`run.reserve`; older saves are dropped)
and not used in play yet. A player lives in exactly one place; `you` and the pickup squad are never reserves.
`Pool.draw(run, r, n)` returns n squads of 6 (new arrays, nothing mutated): the first 4 in court order `[S, MB, WS, WS]`, then 2 bench players (drawn after every court slot, any role, never you): weighted by ovr (`DRAW` in world.js),
you are a candidate only while signed with r, and a standing ≥ `DRAW.sure` puts you in squad 1.

## NPC careers (T-060, spec §4.23 A)

`js/data/people.js` (WANTS, WANT_BY, TRAITS, TRAIT_OPP, TRAIT_BY_WANT, PLAN, PLAN_TRAIT, PEOPLE) and `js/career/people.js`
(`People`, no DOM). Every NPC (league squads, reserves incl. the street crew, the Academy squad; never you) has
`run.people[id] = { want, traits[2], plan, sta, inj, xp, log }` (saved; RUN_VERSION 10, plus `run.pseed`). `People.ensure` creates
missing entries (Run.create, Run.load, start of People.week). **Roll stream:** People draws no R() / rnd() / pick():
`People.roll(run, id, salt)` = `hstr(pseed|week|id|salt)`, so careers are deterministic per run and the main stream is untouched.
Weekly order (`Growth.week`): `People.week` (plan → apply: training sessions through `Training.need` up to TRAIN_CAP, hustle and a
league starter's off-screen play as match XP spread key 0.4 / others 0.2 up to `runCap`; stamina, Hard-session injuries → `inj`
and a Gazette line) → star / OP breakthrough rolls (`Growth.grow`, unchanged R() draws) → `finalizeTeam`. The old random drift
(`Growth.spread`) is gone. An injured NPC (`People.out`) is skipped by `Pool.draw` and `Run.lineup`.

### Relationships (T-061)

`js/career/rel.js` (`Rel`, no DOM, no R()); data MEMORY / REL in `js/data/people.js`. What an NPC remembers about you:
`run.mem[Rel.key(you, npc)] = [{ w, k, v, n }]` (saved; RUN_VERSION 11). `Rel.add(run, id, kind, v?)` applies MEMORY's repeat rule
(trained / hung_out ×0.5 per same-week repeat; same kind in a week merges into one entry), trait sign flips (jealous / cynical),
keeps ≤ REL.max entries (oldest non-scar dropped first), refreshes the cache and returns the bond change. `Rel.stance` = Σ value ×
fade (REL.decay^weeks, scars never) × both traits' multipliers; `Rel.tag` (ally / respect / neutral / resent / enemy) and `Rel.rival`
read it. `you.bond[id]` is only a cache: `Rel.bondOf` = clamp(round(stance × REL.bondK), 0, 100), refreshed on every add and in
`Rel.week` (called from `Growth.week`), so combos (60), friendship (80) and the People sheet read it unchanged.
Sources: `Run.bond(run, id, v, kind)` (training → trained, city outings → hung_out), `Cup.result` →
`Rel.afterMatch` (won / lost_together), `Cup.fixture` → `Rel.spot` (spot_taken for a benched rival, once a week),
challenge / clash wins → `Rel.beatMe`. Match rewards no longer carry bond.

**Behaviour (T-321, spec §4.35).** An NPC's first trait is their headline behaviour: `TRAITS[t].beh` / `.rule` (Friendly, Shy, Competitive, Picky,
Egoist, Loyal, Mercenary, Hothead), numbers in `REL.behave`; the second trait keeps `REL.trait` only. You ↔ NPC only (NPC ↔ NPC reads `REL.trait` as
before). Write time (`Rel.behaveIn`, from `Rel.add`, before Bitter): Shy — positives × low while their list with you has < 3 entries; Picky —
positives count 0 unless `Rel.picky` (your OVR ≥ theirs − 5 or 1,000 fans); a memory their traits flip negative is never gated. After Bitter, a gain × `Gifts.bondMul(run, id)` (Magnetic / Lone Wolf, T-320) when Gifts is loaded. Read time
(`Rel.cx(run, id, other)` → `Rel.weigh(..., cx)`, built once per `stance` / `top`): the first trait's `REL.trait` row overridden by its `REL.behave`
row (Friendly pos 1.5, Shy pos 1.4, Competitive beat_me × −0.75 and trained_hard × 2), then Loyal (positives × own / out by your faction vs their
home), Mercenary (× fast per week past `after` weeks; scars exempt), Hothead (× swing). `Rel.afterMatch`: Egoist mates get `outshone` (your
match line ≥ theirs + gap) or `shone` (theirs > yours); a Hothead's loss together → `blamed` on `People.roll(id, blame|week)` < feud. New MEMORY kinds
`trained_hard` (a Hard session together — written by training once wired), `shone`, `outshone`, `blamed`. `REL.know.trait[0]` = 1: the behaviour
shows after one memory, and on the card of anyone met (`personMet`) at once; the card also shows talent and gifts once `Gifts.known` (T-320 contract,
behind a `typeof Gifts` guard).

**Presence (T-324, spec §4.35).** `Rel.presence(p)` → 2 (S) / 1 (A) / 0 from `Gifts.tier` (T-320) or, until it lands, `p.pot` (S ≥ 1.4,
A ≥ 1.2); 0 for you (`p.you`). Display only, never the letter. Portraits: `faceSVG` → `PORTRAIT.frame` wraps every S / A portrait (drawn,
3D or waiting) in `<span class="gift">` (S: `gift glint`); css/people.css draws the gold edge (`::before`), the crest gem (`::after`) and S's sheen
(`gift-glint`, off under `html.reduced`); `--gift` (css/theme.css) is used only here. Court: actors3d `dressFigure` caches `pl.pres`; `glow()` gives
an idle gold aura (S 0.4 / A 0.3 opacity, the `--gift` token read once) unless the player's own aura (element full, OP, star in the air) or
Fever's team glow is up; S also spawns a gold `fx.mote` now and then (Math.random, display only). First meeting: `Story.hub` (after the
result scene, before a lesson) → `Story.presence`: the first S / A NPC met (a squadmate, `run.met`, or a memory with you) whose
`run.story.seen['presence:<id>']` is unset gets a generated quiet scene — cut dark with `sfx: 'chime'` (`sfx.chime`, js/audio/sfx.js; played by
`Story.advance` when `sfx` exists), a diary log, a 0.9 s wait, the diary line (`MEET.presence`, by `hstr(id)`); quiet = it leaves `run.story.at`
alone (the day's lesson still comes). Story mode only; no save change.

**People sheet (T-062, T-123).** `run.people[id].known = { want, traits[2] }` (added by `People.ensure`): `Rel.reveal` (called from `Rel.add`) flips
the want after REL.know.want memories and each trait at REL.know.trait[i] (one diary line each); `People.knows(run, p, 'want' | 'trait', i)`
also counts a scouted club (`City.scouted`) for the want. `Rel.top` = the n memories with the largest |`Rel.weigh`| (same weights as the
stance); `Rel.text` picks a `MEM_TEXT` / `MEM_ALT` diary line and `Rel.season` a `SEASON_TEXT` rumour line by `hstr` (no R()).
`js/ui/career-people.js` (`sheetPeople`, `personDetail`, `personCard`, `openPerson`; display only): your squad, then others who remember you or
whom you met; a card shows want / traits ("?" until known), the season line and the top 3 memories. Names in the Rankings and the
dossier roster call `openPerson` (`CW.person`).

**Approaches (T-063).** `js/career/asks.js` (`Asks`, no DOM, no R(); every roll is `People.roll`; data `APPROACH` / `REL.ask` in `js/data/people.js`).
`Asks.roll` (from `Run.nextWeek`, after `Eval.setup`): last week's unanswered asks become `ignored` memories, then per NPC and kind
chance = REL.ask.base × weight[want] × (1 + max(0, stance) / 100) against `People.roll(id, 'ask|kind')`; the rule `Asks.need[kind]`
decides who may ask (invite_train, ask_sitout, duo_challenge, borrow, call_out, vouch, warn); the best REL.ask.max by roll, one per
person and kind, are stored in `run.asks` (never `run.event`: nothing blocks). `Asks.answer(run, i, yes)` applies the effect and
memory; `Asks.moves` / `Asks.ask` are your own moves on a person (one ask a person a week, a `mine` entry in `run.asks`; acceptance =
clamp(0.5 + stance / 100 + trait mods) rolled with `People.roll`, shown as likely / maybe / unlikely). Effects live in run fields
(RUN_VERSION 12): `run.loans` (repaid or overdue in `Asks.week`, called from `World.week`), `run.vouch` (`World.joinReq` bars −REL.ask.vouch),
`run.sitout` (`Run.lineup` benches that player that week only), `run.duo` (`Fight.duoIn` seats the mate in your next challenge and halves
the stake; `Fight.challenge(..., force)` skips the club's acceptance for call-outs). UI: the Waiting section and the move buttons in
`js/ui/career-people.js`, a count badge on the People shortcut.

**Fates (T-064).** Person fields (RUN_VERSION 13): `status` 'active' | 'cut' | 'quit' | 'poached' | 'abroad' | 'national', `bench` (active: evaluations
on the bench in a row; any other status: the week it happened), `gone` = { name, role, ovr, team, week, why } once they have left play (quit, abroad).
Evaluation weeks: `People.benchTick` (from `People.week`). Paydays (`World.payday` after promote → `People.fates`, never during a cup): cut (bench ≥ REL.fate.cut and OVR under the
faction's join bar → `People.toReserve`, a seat swap with its best same-role reserve; a cut player you took the spot from gets spot_taken again), quit
(cut for REL.fate.quit.weeks, rolled; cynical ×1.5, loyal ×0.5; `People.remove`), poach (one a payday: want money / leave in the top REL.fate.poach.top of a faction;
stance ≥ respect → an Asks `poach_advice` for next week — unanswered, they go anyway; money → St. Gloria's reserves, leave → off the island). `Cup.close` → `People.national`
(the first REL.fate.national NPCs of the champion squad by OVR). `People.find` returns a snapshot `{ id, name, role, gone }` for someone who has left, so the People sheet and
`Rel` keep working; `People.mattered` feeds the run-end "People who mattered" panel (the 5 largest |stance|, fate line, top 2 memories). All rolls are `People.roll`.

**NPC ↔ NPC (T-065).** Memory entries gain `a` (RUN_VERSION 14): the id of the one who feels it, `'*'` = both (you ↔ NPC entries are the NPC's; `'*'` entries flip
per reader in `Rel.weigh`). `Rel.list/stance(run, id, other = you)` read id's side of any pair; `Rel.addPair` / `Rel.push` write them, `Rel.views` gives both sides.
Sources (`People.pairs`, end of `People.week`; squadmates of one league team / reserve / pickup only): same place trained the same week → `trained`; a league
team's starters share an off-screen result (win share by team OVR vs the league mean via `People.roll`; value × REL.chem.result) → won / lost_together;
`World.promote` and a payday cut → `spot_taken` (a = the one who lost the seat; a poach / transfer gives nothing). Budget: `Rel.trim` keeps NPC ↔ NPC entries
≤ REL.chem.pairs (1500) in all, the oldest non-scar first. `Rel.chem(run, T)` → { cliques (3+ joined by mutual allies), feuds (both ≤ resent), ally / foe Sets }:
`Run.lineup` adds ±REL.chem.capVouch to a player the sitting captain is an ally / enemy of; `People.fates` cuts a feud with the captain one evaluation sooner.
A clique / feud that appears in a squad you have met is a rumour in the Gazette (`CHEM_TEXT`, stateless: chem before vs after the week). Asks `take_side`: a mate in a
feud with another mate asks (chance weighed by your stance with both); yes = their side. The People sheet's Squad filter shows `chemBlock`; a person card shows "With X · Against Y" (`Rel.sides`).

## Evaluations

`CALENDAR` weeks marked `'eval'` (4, 8 … 24) are the monthly evaluations; `Run.weekType` returns `'eval'` only if `Eval.kind(run)` is
non-null (`'academy'`: free agent still in the Academy squad, `'faction'`: signed with a major, else none). `Eval.setup(run)`
(`js/career/eval.js`, called from `Run.nextWeek` and `Run.repair`) draws the week into `run.eval = { week, kind, region, mine, opp }`
(player id arrays, from `Pool.draw`; `mine` null = Academy squad or not drawn). `Eval.squad` builds a temporary team (first 4 → `P`, the rest → `bench`);
`Eval.lend` / `restore` point players' `team`, `cap` and `slot` (bench: `team` only) at it for the match and back (never `finalizeTeam` on it).
`Eval.bench` = not selected: wit XP worth `EVAL.benchDays` day-sessions.

## U21 Final Cup

`js/career/cup.js`. After week 28 `Cup.start` calls `Cup.entrants(run)`: every faction's `Pool.draw` squads (named
`<Region> I, II…`), then the Academy squad while you are a free agent still in it. Saved as
`run.cup = { id, entrants: [{ name, short, color, region, ids, academy }], me, sched, done }` (`me` = your
entrant index, −1 = not in it → you watch and `NO_CUP`). Entrants are ranked by `Eval.squad(...).ovr`, placed by
`seedOrder(16)` (top seeds get byes as nulls) into `newBracket`; bracket entries hold entrant indexes. `Cup.team(run, i)`
builds a squad on demand (the Academy entrant is `run.pickup`). Every match, yours (`Cup.fixture('cup')`) or simulated
(`Cup.simulate`), `Eval.lend`s both squads and `Eval.restore()`s right after. `Cup.close` records
`run.cups[{ id, place, champ: name }]` and ends the run (`run.result.champ` = winner's name).

## Faction dossier

`Dossier.build(run, r)` (`js/career/dossier.js`, DOM-free, read-only) returns one faction's window data: standing, state
(weakened / pressed / stable / fallen / minor, from its war units' stages), fronts (its war units: Strength, stage, the stage played, border, what its clubs ask less — spec §4.34), places taken / lost, price and quality multipliers,
the facilities it holds now (seized ones marked, with `City.access`), its clubs (join text, `World.canJoin`) and the pool
roster. Ratings and elements are `null` until one of its clubs is scouted or you are a member. It reuses `City`, `Front`,
`World`, `Pool` and `Training`; no rules live in it. `Dossier.summary(run, r)` is the short form the World sheet's Factions tab renders (standing +
`standingLabel`, fronts, took / lost, economy, clubs, this week's foe). Both read one block, `Dossier.front(run, r)` (major = `MAJORS.includes`, places taken /
lost, fronts, price / quality multipliers).

UI files only render and call rules: `Run.canEndWeek`,
`Run.readGazette`, `Cup.simNow(fx)` (resolve a fixture without watching: setup, rallies, finish) and
`Cup.upcoming(run)` (the cup screen's next match — other matches simulated first — called by `renderCareer` before it
draws, so no render function changes or saves the run).

The window is `ui/career-dossier.js` (`dossierCard`, `openDossier(r)` / `closeDossier()`, Esc closes; state `CW.dossier`): opened by the
HQ panel's Dossier button and the faction names on the Factions tab, rendered in place on the World sheet (← / Esc back to the list).

## Island map (training weeks)

`js/data/world.js`: REGIONS (wei = the city, north and east; wu = the beach band of the east / south coast and the land behind it; shu = the
western highlands — the three majors with clear borders; outlaws / gloria = borderless minors; open = the Central
Academy / shrine park, owned by nobody): `color`, price ×, training quality q, Wei `hype` (chance a premium place is
overhyped), Shu `gem` (chance a rough place is a hidden gem), map anchor `at`. Travel is by distance (`City.trip`). FACTIONS: one per league team — two squads per major (Wei Gold/Iron, Wu Harbor/Fort, Shu
Peak/Valley) + Street Outlaws + St. Gloria; `team` rebrands the league team in `Run.draft`. HOTEL, HOUSING by region.
`js/data/city.js`: CITY (coast, Wu's inner line, Wei and Shu polygons, minor ellipses, airport, HQs), SPOTS (several
training places per stat across regions, plus the Academy Gym (`train: 'all'`: TRAININGS.all gives every stat a little
via `more`, fixed `lv` 1, not in TRAINK); sand = technique ×SAND_SP skill points; hotels; outings per region).
`js/career/city.js` (City): `run.pos` (map point you stand on; a run starts at the airport), `regionAt` (minor patch /
Central Academy = the hex tiles within `ACADEMY.ring` of its middle (`Hex.dist`) / major polygon), `trip` (days by travel cost `City.path`, NEAR_R / TRIP_DAY / TRIP_MAX), `go`/`moveTo` (spend, stand,
`reveal` → `run.fog`), `seen` (the dark map), `travelTo` (any land point), `roll` (per-run place quality → `run.spotQ`, found out by training there),
`price` (TRAIN_FEE / HOTEL × region price), `mul` (quality × home turf, passed to `Training.train/preview` as x),
`can`/`day`/`scout`. Week = `run.days` (WEEK_DAYS 7): every action costs `City.cost` = trip + 1 day and is refused if
it would spill into next week (`noTime`); at 0 days it is night; only `mapEndWeek` (the player) calls `Run.endWeek`.
`Run.endWeek` runs `WEEK_END` (run.js: growth, sponsors, heal, world, settle the clash, the war's rally `War.week`), resets the week, then the cup
or `Run.nextWeek` = `WEEK_START` (clash roll, training floor, sponsor offers, Trial offer, eval setup, approaches). The
order is the draw order: append new weekly systems, never reorder.
No random week events (removed, owner 2026-10-05). Street battles (`Fight`, career/fight.js; City keeps places, travel and standing): `clashRoll` in `Run.nextWeek`
(`run.clash` with its aggressor, settled by `clashEnd` at week end if nobody joined), `watch(run, null)`; standing per
region in `run.rep` (`rep`/`repBump`). `js/career/front.js` (Front): who raids whom and where (`pick`, `site`: a border between two war units, §4.34), `sim`/`result`/`stakes`
on the units' Strength (`War`), places held by others `run.own` (City.region follows the holder), `priceMul`/`qMul` from Strength;
`World.joinReq` lowers a club's join bar a step per stage of its unit. Sessions × DAY_GAIN (gains and skill points).

### Island map layers

1. Rules — City / Front (DOM-free): positions, travel, fog (`City.seen`), regions (`regionAt`), ownership.
2. Model — `MapModel.build(run, sel)` (`js/career/mapmodel.js`, DOM-free, tested): `{ w, h, land: { coast, beach,
regions[{id, poly, color, mine}], minors[ellipses], park, relief, pads, labels, airport }, pins[{id, kind: spot|hq|clash, at, icon, badge, title, color?, flags: off/far/turf/gem/overhyped/hq/can/
mine/clash}], you: {at}, fog: {points, r}, flag (picked point), focus (fresh-view centre), sel, life }`. `life` (`MapModel.life`, display only, no randoms; positions from hashes of ids + place): `people` (MapModel.lifePeople — see "Map life and the day clock" below), `look` (figure sizes, hover px, the Fast cap), `crews[{region, team, at, color, n 2–6, known, walk[[x,y]…]}]` (known clubs' HQs; `known` = scouted or yours), `battle {at, a, b, colors}|null`, `patrols[{id, tile, at, face, color}]` (`MapModel.patrols`: this week's battle border — the defender's 2 on its tile, the raider's 3 on its tile across, facing; colours and points only, the renderer never names factions). Map units
   CITY.w × CITY.h, y down. Selection ids: a pin id, or `pt:x,y` (`ptId` / `ptOf`).
3. Renderer — `MapView` (`js/ui/map-view.js`): `mount(el, model, { pick(id), point([x, y]) })`, `update(model)`,
   `select(id)`, `dispose()`, `setWalk(k)` (your walking speed ×1/×2/×4, remembered as `sns_walk`; map3d ticks your avatar ×k). The only renderer is the three.js map: it lazy-imports `js/map3d/map3d.mjs` once (a notice
   shows while loading; on import / WebGL failure it logs `DBG.log('error')` and shows the failure text — there is no 2D
   fallback). `map3d.create(onIdle)` → `{ mount, update, select, dispose, info, … }` (the full list heads map3d.mjs): one renderer +
   canvas that survive `renderCareer()` (each mount re-attaches the canvas into the new `#mapwrap`); it releases itself
   (`onIdle` → `MapView.drop3D`) when its canvas has been detached for 3 s (left the career screen). Terrain: 2 m grid
   over the island box from `land.coast` / Shu region / `land.relief` (the designed highlands: global `reliefAt`, levelled under `land.pads`; terraces stepped; fixed-hash noise, no randoms), vertex colours
   from the biome ground (T-224, spec §4.19d: `land.biomes` = MapModel.biomes() — the majors' polygons, the Academy's lawn disc
   and the minors' ellipses, each with its `BIOME` palette (js/data/city.js; neutral tones, never the faction colour) — majors weighted
   by a smoothstep across their edges over `BIOME.fade` m, minors laid on top over `fadeMinor`; two tones per biome in a soft value-noise
   patchwork, Shu climbing to rock grey with height; a gravel strip along the Shu–Wei line and sand / pebble banks beside the river),
   then the beach sand, district and ground tints; `land.borders` (MapModel.borders(): the Shu–Wei line, the dune line, the river,
   each with its `BORDERS` strip / row kind) drives the border rows MapModel.nature adds (`NATURE.rows`): pines on the Shu side of the Shu–Wei line, reeds on both river banks, dune grass inland of the dune line, a hedge ring round the Academy, fence panels (turned along the ring) and scrap round the Outlaws — drawn by nature3d.mjs like the scatter (+1 draw call: fence). Fixed-yaw camera, pitch 55°, wheel zoom 25–420 m, drag pans on the ground plane, a click (< 5 px)
   raycasts to a map point (`toMap`; 1 map unit = `MAP_M` = 0.5 m). The player is `js/map3d/avatar3d.mjs`
   (`createAvatar(scene)`: the default VRM via `loadBase` / `makeVRM`, capsule until loaded): `snap` first, `setTarget` when
   `model.you.at` changes — `setTarget(at, path)` walks the road polyline `model.you.route` (added by `MapView.routed` in js/ui/map-view.js from `City.route(last you.at, you.at)`; the renderer never calls `City`; straight line without it) at 6 m/s over the whole length (trip 1.2–6 s, ramps 0.4 s; faster trips show a ×N badge), facing along the current segment, gait from
   `locoPose`, idle `STAND` + breathing, feet via `groundSnap` + `heightAt`; the camera follows until the user drags.
   Furniture is `js/map3d/pins3d.mjs` (`createFurniture(scene, heightAt)`): an HTML overlay `.maplay` over the canvas holds one
   `.mpin` button per `model.pins` item (icon, badge, flag classes, click → `pick(id)`), the region / airport labels (fade out
   below ~70 m camera distance) and the picked-point flag, all projected onto the terrain every frame after render;
   the war (`model.borders`, layers3d `warLayer`, T-317: each unit's border a draped ribbon just inside its land in its lead club's colour, the week's hot stretch a pulsing amber glow, banners along it — three meshes, rebuilt on change; pins3d's old hex-decal code gets no `model.hexes` any more) is the terrain decal layer. `sync(model, on)` rebuilds a part only when its JSON changed;
   fog is a per-vertex darkening of the terrain colours (`applyFog(model.fog)` with `fogFactor`, unexplored land dim, not hidden).
   Shared helpers live in `js/map3d/geo3d.mjs` (`MAP_M`, `FOG_DIM`, `FOG_SOFT`, `toWorld` / `toMap`, `clamp` / `lerp` /
   `smooth`, `fogFactor(fog)` → k(x, z) with squared-distance early-outs): every map3d module imports from it, never from
   map3d.mjs (no import cycles); the shape helpers (`part`, `box`, `mergeParts`, `rgb`, the lot hash `unit`, `landmarkYaw`) are kit3d's. Per frame nothing reads the DOM size (cached by the ResizeObserver) and the pin overlay
   is only re-projected when the camera, canvas size, distance or items changed. `dispose` removes its listeners and
   skips `userData.shared` objects (kit materials / shape caches). `MODEL_URL` (the base VRM) is exported once by players3d.mjs. First
   view: on the player, 60 m away. Life is `js/map3d/life3d.mjs` (`createLife(scene, heightAt)` → `{ sync(model, low), tick(dt, t, tod, cam),
count(), dispose() }`, display only, no game randoms): reads `model.life`; one `InstancedMesh` per kind
   (figure = the people3d humanoid, Fast: capsule body + head — see "Map life and the day clock" → Looks; flag poles, flag cloth, dust puffs; ≤ 300 figures), rebuilt only when that JSON changes and
   animated in `tick` (the named people first, drill hops, walkers looping round a crew's places at 1.2 m/s, the battle crowd shoving, waving flags).
   Known crews are coloured, unscouted crews grey (crews go in at night); patrols stand where `life.patrols` puts them,
   facing their `face` point (a seized place shows by its tile colour, no flag). `furn.pulse(t)` pulses the battle tile's outline.
   Traffic (spec §4.19a): `life.traffic` = `MapModel.traffic()` (static, from `TRAFFIC` in js/data/city.js): lines as closed out-and-back
   loops of road nodes `[x, y, over]`, boats `{ at, r, n }`, the plane's take-off `{ from, lift, to, every }` on `AIRPORT.runway`. life3d
   draws one `InstancedMesh` per vehicle kind (bus, van, boat, plane; caps in `VEH`): vehicles keep 1 m right of the line and ride the
   overpass deck with town3d's exported `DECK` ramp; boats circle at sea level; the plane rolls, climbs and shrinks away once per cycle.
   Nature (spec §4.19c, T-223) is `js/map3d/nature3d.mjs` (`createNature(scene, heightAt)` → `{ sync(model), tick(dt, t), count(),
dispose() }`): reads `model.land.nature` (`MapModel.nature`: [{ k, at, s, r, c }] from `NATURE` — a hashed jittered grid, the biome
   by region / sand / ground kind / Shu height (`reliefAt` vs `treeline`) / villages, kept off roads, lots, landmarks, venues, pads,
   the airport and water / fields via a bucket grid; street trees along Wei's main roads; cached with the lots) and
   `model.land.wild` (`MapModel.wild`: the animals' loop centres from NATURE.life anchors). One InstancedMesh per shape (9: pine,
   broad, blossom, palm, rock, bush + tea, tuft + dune grass, bamboo, log) + 3 animal bodies (bird, beast, heron); vertex tones ×
   instance tint × the fog's dimming; animals move in tick. ~1.9k instances, ~45k triangles.
   `sync(model, low)`: the Fast setting keeps these flat shapes (`SHAPES.flat`); the detailed look (T-343) builds `SHAPES.hi` —
   pine tiers (jittered lathes), broadleaf / blossom crowns of smooth jittered blobs on a branched trunk, arched palm fronds on a
   curved ringed stem with coconuts, lumpy bushes and rocks, 7-blade tufts — with vertex tones (dark under / inside, light on top)
   and a `leaf` attribute that the detailed material (`richMat`) reads for a 3D value-noise mottle and the wind sway (vertex shader,
   `WIND`, by height and instance position; uniform time from tick). A few extra tufts ring each plant and rock (`GRASS`, hashed
   offsets). Shadows come from the Fast shape as a shadow-only proxy (castShadow; its material writes no colour or
   depth, so the view shows only the detailed shape). Draw calls +≤ 5 proxies.
   The town layer is `js/map3d/town3d.mjs` (`createTown(scene, heightAt, { fast })` → `{ sync(model), ring, ringInfo, cut, count, dispose() }`, display only, no randoms):
   reads only `model.land.roads / lots / landmarks / districts` and `model.fog`. Ground use (`model.land.ground`, from `GROUND`: circles or
   rings in map units) is painted into the terrain's vertex colours by terrain3d.mjs `buildTerrain` (`GROUND_TINT`: two tones, straight bands at a
   hashed angle or contour bands by height for terraces; water patches are also flattened into a lake); lots stay off `GROUND_KEEP` kinds
   (`MapModel.kept`). Districts may be `tall` (lots rise with wealth: downtown, the civic core). Meshes: one vertex-coloured mesh for all roads (width and
   colour by kind, slope-following, lifted 0.15 m, polygon offset; the `boardwalk` is planks of two tones 0.3 m up); one for the
   `overpass` (its edges chained into a deck 5.4 m wide, 7 m up with rails and sides, ramped to the ground over 28 m at both ends, T-pillars
   every ~20 m; deck + pillars merged); one `InstancedMesh` per base shape for the filler lots (box, gable, stepped: kind palette + size per
   instance, height × (1 + 2.5 × `lot.h` × the kind's `rise`) so downtown towers rise toward the middle; `lot.wealth` tints the instance colour in place — rich: glass-blue / clean stone / gold, poor: grey / rust / patched wood, the middle untouched — no extra draw call); one merged mesh for all landmarks
   and the wall ring of each `compound` district (a gatehouse of two towers and a lintel where a road crosses it); each landmark faces its
   nearest road unless it has a fixed `rot` (the airport: runway, apron, terminal and tower as one landmark on `AIRPORT.yaw`; lots keep
   off `AIRPORT.box`, `MapModel.inAirport`). Rebuilt only when the layout JSON changes, dimmed by the same fog rule as the terrain (`fogFactor` in geo3d.mjs); 5 draw calls, ~+10k triangles.
   That instanced look is the Fast setting's (`G.gfx === 'fast'`, read by town3d at each sync — `createTown(scene, heightAt, { fast })`
   for tests). The default is the **detailed look** (spec §4.39, T-342; kit3d.mjs "The detailed look"): `buildLot` draws each lot from
   `facade(lot, i)` (the one window layout: per face that can be seen — world normal z ≥ −0.25, the camera never turns — rows of
   panes every 2.8 m (one row under a low eave), the door or a shop front (+ awning in the district's colours, a sign) on the face
   most toward the camera, balconies, wall AC units; each pane `lit` by a fixed hash) and `LOOK[kind]` turned by the district style
   (flat roofs with parapet, deck, roof AC units, stair houses, antennas, Wu water tanks; gable / hip / lean-to roofs, Shu clay tiles
   with ridge caps, terracotta in Old Town and Gloria, tin in Wu; Shu's stepped terrace houses; tanks and stacks as banded
   cylinders); heights and footprints are `lotFrame` (the Fast instances' numbers). Benches, bins and bus stops (`streetProp`) stand
   between the lamps of the main roads, clear of the lots. All merged into three meshes on kit3d's shared `detailMats()`: walls (vertex
   colour × the canvas wall texture's plaster / brick / plank channel picked per vertex by `wmask`; metal = planks turned upright),
   glass (the canvas window atlas `TILE`; lit panes glow by their `glow` colour × `NIGHT_U` — set by the night layer — through the
   atlas's glow mask), roofs (the canvas roof atlas). Fog dims per building (vertex ranges, recoloured in place). ~1.27k items,
   ~136k triangles, 3 draw calls in place of the Fast 4. Terrain (`buildTerrain`): on the Wu stretch the sand between `land.dunes` and the coast is
   wide, flat and low (`sideDist` = signed distance to the dune line) with a dune ridge on the line; a faint tint per district style is
   folded into the vertex colours (no draw call). Pins above a landmark float `PIN_UP` over its roof (`landmarkHeight(kind)`). The kit registry
   is `js/map3d/kit3d.mjs`: `KIT[kind] = { geo(), mat, scale, colors, rise }` (filler kinds, incl. rowhouse, barracks, workshop, market,
   warehouse, resort, kiosk, terrace) and `LANDMARKS[kind] = { h, w, d, build(accent), footing? }` (incl. `ritual`: a worn sand circle with a
   ring of low stones). Swapping a kind for a model later: make `geo()` / `build()` return the model's geometry (filler: 1 × 1 footprint,
   height 1, feet at y = 0; landmark: door on +z, feet at y = 0, vertex colours) — nothing else changes (see the header of kit3d.mjs).
   `info().life` reports the instance counts. `js/ui/career-map.js` mounts it (`mapMount`),
   turns picks into panels (`mapPick`) and land clicks into travel targets (`mapPoint`). Region colours: REGIONS.color.

### Map life and the day clock (spec §4.37 1–2, T-331–T-332)

- **People** — `MapModel.lifePeople(run, max = LIFE.max)` (js/career/mapmodel.js; also Agent E's encounter input): every NPC of
  `People.homes` with a `run.people` entry, at `People.plan(run, p, home)` (the same week plan People.week applies; no randoms):
  train / hard / wit → `plan.at` (else `LIFE.gym[home]`: the Academy squad → the Academy Gym), hustle → `LIFE.court[home]` /
  `LIFE.courtElse`, rest / out → home; a teammate on `run.floor` → the floor key's explored place nearest your home (as its pin
  badge counts). Home anchor `MapModel.homeAt`: club HQ, else the pool's region anchor, the Academy → the student flat. `at` /
  `home` = hashed rings (`LIFE.spotR` / `homeR`). Fog: a place must be `MapModel.known`, a home `City.seen`. Groups `g`: circle
  (`Circle.of`) · mate (your squad, your club colour) · grey (a club not yours and not scouted) · other; sorted circle → mates →
  bond → id, cut at `max`. life3d draws them in the shared people InstancedMesh (`other` muted half-way to
  grey; the Fast setting keeps `look.low`): idle by act (train / hard drill hops, hustle a jog round the court, wit / rest / out
  sit), by the time of day `tod`: home (hidden) at night, walking out inside `CLOCK.out` and home inside `CLOCK.home` (each at
  a hashed moment, `step` long, a straight line). `pick(cam, x, y, cw, ch, px)` = the nearest shown figure within px on screen
  (head or middle projected; no raycast); `going(id, tod)`; `at(id)`.
- **Looks (spec §4.39 People, T-341)** — `js/map3d/people3d.mjs`. Default: every figure (named, crews, battle, patrols) is the
  low-poly humanoid (`createHumanoids`: one InstancedMesh, head + hair, torso, sleeves / forearms, shorts / legs / shoes; vertex
  attribute `part` picks the colour — shirt = instanceColor, skin `iSkin`, hair `iHair`, fixed; `limb` / `pivot` + the instance's
  `iPose` [leg swing, arm swing, arm raise, leg bend] swing the limbs in the vertex shader, the same patch on its customDepthMaterial
  so shadows match). Named scale `NAMED_S` 2.9 × √(look.size / 1.4) (~4.2–4.9 m: ~2.5× life; your avatar 6 m), crowds `CROWD_S` 1.6;
  a jog's circle widens with the size; sitting drops the body and swings the legs forward; crews drill 9–14 m round their HQ (Fast: 2–6);
  others' shirts `MUTE` 0.2 to grey (Fast 0.5). Your circle stands on a soft gold
  ring (one InstancedMesh, alpha vertex colours). Hashed skin / hair (`lookOf(id)`, `LOOKS`; grey = all grey). VRMs
  (`createPeopleVRM`): every `VRM_LOD.every` s `nearestOnScreen` picks the `cap` (16) nearest shown, non-grey named people inside
  the view and `maxD` (260 m) of the camera (shown ones count × 0.8 nearer: hysteresis); a slot fades in over `fade` s (VRM grows
  0.85 → 1 while life3d shrinks that humanoid by `weight(id)`) and out the same way. Slots: the base model (`loadBase(MODEL_URL)`,
  started `delay` s after the map's first tick) parsed by `makeVRM` one slot at a time (`gap` s apart; geometry and textures
  shared by players3d's caches), springs off, shadows only for the `shadows` (6) nearest, `dress`ed on assignment (club colour shirt, dark shorts, hashed hair / skin).
  Poses: walking / jogging = `locoPose` by the measured ground speed ÷ the figure's size; drill = READY → arms-up BLOCK by the hop;
  wit / rest / out = SIT (`groundSnap` lying); else STAND breathing. Fast: capsules (`look.size`), no humanoids, rings or VRMs.
  life3d.tick takes `cam` (map3d passes it). `count()` adds `look`, `humanoids`, `circle`, `vrm` / `built` / `cap`.
- **Hover / click** — map3d listens to pointermove / pointerleave on its canvas, picks every 6 frames or after a move, sets the
  cursor and calls `on.hover(id | null, clientX, clientY, going)`; a canvas click while a figure is hovered goes to
  `on.person(id)` instead of `on.point` (mapcam gets the wrapped callbacks). MapView adds both: the tip reuses `.tipbox`
  (class `maptip`): `faceSVG`, name, club, "drilling at <place>" / "heading home"; grey = "Not scouted" + club, no face, no
  click; a click opens `openPerson(id)`.
- **Clock** — week time w = days spent + time of day (`MapModel.weekTime`; `clock` = its fraction, 0 = midnight). Waiting:
  the next day's dawn (`CLOCK.dawn`); the week spent: the last day's night. The last action (`MapModel.span`: its trip days +
  its day from `run.dayLog`) plays as walk = from the morning of its first day to the morning of its last (a 3-day trip runs
  through two nights), order = that afternoon. `MapModel.time(run)` hands the renderer `{ day, idle, walk: [a, b], order:
  [a, b], out, home, step, rate, keys }`. **Phase interface:** `MapView.phase()` → 'idle' | 'walk' | 'order' from `CW.lock`
  (walk / greet → walk; spin / done / res → order; any other lock phase → walk; none → idle), handed to map3d once as
  `setPhase(fn)` and read each frame. map3d's `clockStep`: aim = idle, or lerp(walk) by the avatar's progress along its road
  (projection onto the route, ratcheted — it holds while the avatar is stopped, e.g. an encounter), or order[1]; the shown w
  runs toward it at `rate[phase]` days / s and never back (a lower aim = a new week: w wraps forward through the night; a gap
  over 1.5 days skips whole days). Dev / QA: `setClock(w)`, `clock()`.
- **Light** — `skyAt(keys, tod, …)` interpolates `CLOCK.keys` (wrapping): sun colour / intensity, hemisphere sky / ground /
  intensity, background, `lit`; the sun's direction by the hour (east → south-high → west, blending to the moon by `lit`), set
  after the camera step (mapcam still places it; map3d overrides before render); look3d.mjs. `nightLayer` (layers3d.mjs): one Points mesh (ShaderMaterial,
  additive, size in metres clamped 2.5–40 px) of windows (lots' faces toward the camera, floors every 2.8 m, ~42 % lit by
  hash; heights from kit3d's `unit` hash and `FOOTPRINT`, as town3d's), street lamps (main / street / boardwalk
  roads, every 22 m, alternating sides) and court floodlights (`model.floods` = `MapModel.floods`: explored court landmarks +
  venues, four towers each), plus one InstancedMesh of additive ground pools (lamps, courts); fog-dimmed (to 40 %, so lit towns still show in the dark); hidden when `lit` ≈ 0;
  rebuilt when the lots, fog, floods or the setting change. Fast setting: ⅓ of the windows, no lamp pools, `LIFE.low` figures.
  Detailed look (T-342): the window glows are kit3d `facade`'s lit panes on camera-facing faces (shop fronts a glow every 1.4 m,
  signs a small coloured one) — the panes town3d draws, so they line up by construction; the lamps come from kit3d `lampSpots` (the
  same row as before) and each gets a post 0.9 m further from the road with an arm out to the head (`lampPost`); each flood glow a
  mast with a lamp bank turned to the court (`floodTower`) — one merged mesh on the shared wall material, drawn day and night
  (+1 draw call); `set(lit)` also drives `NIGHT_U`.

### The map's detailed look (spec §4.39 Land, T-343)

- `look3d.mjs` `richLook(renderer, scene, cam, sun)` → `{ terrainMat, sea, on, set(v, water), setTerrain(T), resize(w, h),
  step(dt, t, lit, tod, view, gfx), render(), info(), dispose() }`; tunables in `LOOK` (look3d.mjs). `setLow(true)` (the Fast setting,
  `G.gfx === 'fast'`) = `set(false)`: no tone mapping, PCFSoft shadows at the fixed box, the Phong sea, the flat terrain material
  (`flatMat`), `renderer.render` straight to the canvas — the look before T-343. Detailed: ACES (exposure by `lit`), an
  `EffectComposer` (RenderPass into a half-float MSAA target → GTAOPass on High, lazy-imported → UnrealBloomPass, on only while
  `lit` > 0, threshold falling with `lit` so the night layer's glows bloom → OutputPass), PCF shadows with `radius` whose box
  follows the zoom (`LOOK.shadow`, 4096 map on High), dynamic resolution (real frame-time average, steps of 0.05 down to the
  setting's floor, like r3d `adaptRes`; under ~15 fps steps of 0.15 down to `rescue` 0.45 — what keeps headless swiftshader QA
  moving). Dev / QA: `setView({ x, z, d })`, `holdClock(tod | null)`, `bench(n)` (ms a frame, waited for). `renderer.info.autoReset` is off: `draw()` resets it, so `info()` counts the whole frame.
- **Sky**: three's `Sky` (Preetham; its sun disc removed — the directional light is the sun) at the clock's real sun (`tod`,
  under the horizon at night), baked to `scene.environment` with PMREM when the sun has moved (≥ `LOOK.sky.moved`, ≤ every
  0.25 s); `environmentIntensity` by the sun's height. The map camera never sees the sky: it is the light and the reflections.
  `skyAt` still drives the sun, the hemisphere (× `LOOK.hemi`) and the night `lit`.
- **Terrain**: the same mesh; `buildTerrain` adds `gnd` (sand, rock, field rows, wet), `gdir` (rows' direction; none = contour
  rows), `gpav` (paving) per vertex, and `shore` (RGBA bytes per vertex: height −6…+2 m, distance out to sea 0…60 m). The
  terrain material (onBeforeCompile) mixes per weight: grass grain and dry patches, sand ripples, rock with cracks (plus slope
  rock), furrowed fields, wet sheen (low roughness), 3 m paving slabs; one generated tileable detail texture (`lookTextures`:
  geo3d `tileNoise`, no downloads), sampled at two scales plus a 170 m macro patch; bump by screen derivatives (`lkBump`).
  The vertex colours (with the fog) are still the base.
- **Wei's ground** (`WEI_GROUND`, owner 2026-10-21, both looks): a calm two-tone lawn replaces the Wei biome's grey / green
  patchwork; the urban districts (city / works / oldtown styles) are paved, lighter toward the core; the ring suburbs only as
  an apron round each lot (rastered once per terrain).
- **Sea**: a standard material (env reflection, sun glint, shadows) with two scrolling generated normal maps, colour from
  shallow turquoise to deep blue by depth and distance (the `shore` texture over the island box; open sea beyond), foam at the
  waterline and in bands rolling in.

### Street level (spec §4.37 6, T-336a)

- **District** — `MapView.zone()` adds `model.street = { a: SPOTS.weiPower.at, b: VENUES.arena.at, r: MapView.STREET_R (200) }`
  (map units): a capsule round the Dynasty Strength Center and the League Arena. mapcam3d `zoneOf` / `zoneDist` / `inZone` (world m).
- **Camera path** — mapcam3d `streetPose(d)` (pure, tested): above `DIST[0]` (25 m) today's view; below it s = smoothstep((25 − d) /
  (25 − `STREET.d1` 6.7)), pitch 55° → `STREET.pitch` 15°, the target rising to your head (`STREET.head` 1.45 m) and pulled onto your
  avatar (k by s), so at d1 the camera is ~6.5 m behind, ~3.2 m above the ground. Below 25 m only while your avatar is inside the
  district and the view centre within `STREET.pad` of it (`allowed`); otherwise the zoom stops at 25 m, and leaving the district eases
  the camera back up (`STREET.back`). `yaw` (× s, reset at s = 0): Q / E (`STREET.orbit` rad/s), a right-drag, or any drag at
  s > 0.5 (`STREET.drag`); a click walk swings it behind you (`STREET.behind`). A lot or landmark between your head and the
  camera (the district's lots + landmark squares; one holding you — the gym / arena — doesn't count) lifts the camera over it, up to
  `STREET.rise` m (eased), else brings it in front. Near plane 1 → 0.2 m, far 3000 → 900 m. `flyTo` / `walkFrom` keep the
  camera down at street level. A contextmenu after a right-drag orbit is not a figure click (`C.dragged()`).
- **Walking** — a click at s > 0.5: `MapView.walk(p, true)` → `mapTravel` (the point card's Walk; refused or the same point → the
  point card, which says why). WASD (window keys, `e.code`, only at s > 0.5 and `on.canWalk()`: no lock / event / figure menu / sheet
  / modal / match; keys another handler took are skipped): `avatar.drive` moves you camera-relative at `STREET.speed` × the walk
  speed, sliding along lots (kit3d `lotFrame` rectangles + 0.35 m in a 16 m grid) and kept inside the district on land; `STREET.stop`
  s after the keys rest `on.walk(point)` → `MapView.walk(p)`: a travel straight there (`MapView.free`: the route is [from, to], you
  already stand on it) when it changed point (≥ 3 map units) and the rules allow it, else `m3.home()` walks you back.
- **Scale** — `avatar.setLife(street)`: HEIGHT 6 m → `LIFE_H` 1.72 m (the stride with it; a trip's pace × `LIFE_PACE` at street
  level); life3d `tick(…, street)` scales every figure toward `LIFE_S` 1.2 (≈ 1.74 m) and hands people3d `{ street, near:
  STREET_LOD, cap }`: the VRM pick's reach shrinks 260 → `STREET_LOD.maxD` 40 m from the camera, cap 15 (Fast: 6 VRMs over its
  capsules — Fast turns VRMs on above s 0.3).
- **Detail ring** — town3d `ring(camX, camZ, street, inDistrict)` (map3d each frame): shown at s ≥ `RING.show` inside the district;
  rebuilt when the camera moved `RING.step` 30 m from its centre. Lots within `RING.r` 150 m: kit3d `buildLot(…, all = true)`
  (`facade(l, i, true)`: every face, the camera-facing ones identical) with the ground floor's windows and shop fronts drawn by
  `interiorPane` into a 4th mesh on `interiorMat()` (interior mapping: a ray from the camera into a box behind the pane — back wall,
  floor, ceiling, sides; shop shelves / a sofa and a picture by `room` seed; lit warm at night by `NIGHT_U` when the pane is lit);
  those lots are collapsed out of the map-look meshes (`det.ids` → spans; restored when the ring hides). Ground: pavements (`RING.pave`
  1.6 m, kerb 0.14 m) both sides of main / street roads, trimmed `RING.trim` at junctions; main roads' centre dashes and zebra
  crossings at junctions of 3+; pavement props (bollard, planter, hydrant — kit3d `RING_PROPS`) by hash, clear of lots. Fast: the ground
  detail only (the boxes stay). `ringInfo()` → { on, lots, tris, builds, ms }.
- **Look** — at s > 0.15 the background is the baked sky (`look.envTex()`; Fast: the clock's sky colour); a `THREE.Fog` haze in the
  sky colour closes in with s (near 160 m at street level; 1e6 on the map); the war borders (`war.show`) and the route preview
  ribbons hide at s ≥ 0.5; the story figures (`model.figures`) shrink to life size with you.
- **Contract for the interiors (T-336b)** — map3d `api.street()` (0–1), `api.youPos()` (world [x, y, z]);
  `import('./interior3d.mjs')` once at build: `createInteriors(scene, heightAt, { cut: town.cut })`
  — wired as in "Street level — interiors" (map3d hook); a street-level click at canvas px that `at` takes is not a travel
  (mapcam `consume`). town3d `town.cut(box | [box] | null)`: landmark triangles wholly
  inside a world box `{ x0, x1, z0, z1, y0?, y1? }` collapse (the gym's / arena's shell while you are inside), null restores them.
  Dev / QA: `setYaw(rad)`, `jump()` (stand at you.at, no walk), `home()`, `info().street` / `.ring`.
- **Keeping street level** — `flyTo` / `walkFrom` / `centre` don't lift the camera at street level (a day order's select and walk);
  a renderer released while a screen covers the map (`drop3D`) keeps `viewState()` ({ x, z, d, yaw, street }) in `MapView.kept`, and
  the next create `restore`s it when it was at street level (≤ 2 min).

### Street level — interiors (spec §4.37 6, T-336b)

- **Data** — `INTERIOR` (js/data/city.js), keyed by landmark id (`weiPower`, `venue:arena`): `kind`, the shell `w × d × h` (the
  kit3d landmark's box), `stations` [{ id, name, `order` (one of `City.orders(place)`) | `card`, `at` (local m, door on +z),
  `slots` (where today's people stand) }]; `INTERIOR_NEAR` 2.5 m = how close you stand for the prompt. The gym: bench + rack →
  Heavy sets, mats → Mobility class, mirror wall → Stretch, front desk → the card; the arena: centre court → the card (a venue
  has no day orders).
- **Renderer** — `js/map3d/interior3d.mjs` `createInteriors(scene, heightAt, { cut })` → { sync(model), tick(dt, { cam, you, street, low,
  size }) → { near, shown, flip }, at([x, y]), people(model), info(), stations(), dispose() }. Frames from `model.land.landmarks`
  (yaw = kit3d `landmarkYaw`, the rule town3d turns landmarks by; floor = the highest of 9 ground samples). The gym: one merged props
  mesh (rubber floor, sprint lane, two squat racks, plate tree, dumbbell rack, bench press, accent mats, mirror wall, stretch
  mats, front desk) + its own shell (4 walls with the landmark's band, the roof with its ceiling lights; one transparent material each).
  The arena: court (map scale 15 × 7.5 m), lines, net, referee stand, team benches, a scoreboard with a canvas face, on the
  landmark's pitch — an open bowl: no shell, no cut (the match venue's set needs the match world's textures: not reused). Shown
  only while `street > CUT.show` (0.6). Draw calls when shown: gym 6, arena 2.
- **Cutaway** — while shown, `opts.cut(cutBoxOf(gym))` (map3d passes `town.cut`): the landmark's triangles wholly inside the
  axis-aligned bounds of the gym's turned footprint (+0.5 m: the roof lip, the door) collapse; `cut(null)` when the insides hide
  or on dispose. The roof and the walls facing the camera fade to `cutAlpha(d)` (CUT.min 0.08 inside → 1 at CUT.near 8 m; d = you
  or the camera to the footprint, the nearer); far walls stay.
- **People** — `people(model)`: while shown, `life.people` with `spot === place` move to its slots (round-robin by id, past the
  slots a ring 0.7 m out), `act: 'train'`; map3d re-syncs life with it when shown flips — life3d's humanoids / VRMs, pick and the
  figure menu work on them unchanged.
- **map3d hook** — one `import('./interior3d.mjs')` in build (then sync + a life re-sync); `interiors.sync(m)` before
  life, `life.sync(lifeM(m))` (update, setLow, and when shown flips); `interStep` each frame after the camera (`streetLook`):
  `tick(dt, { cam, you: avatar.pos(), street: st, low, size })`; the near station (not while walking) → `on.station({ ...st, x, y }
  | null)` (client px); mapcam's street-level click → `consume(xy)`: a station under it (`at`) → `on.station(st, true)`, no travel;
  `api.interiors()` (QA) = `{ ...info(), street, stations }`.
- **Prompt** — career-map.js `mapStation(st, click)` (a mount callback; MapView passes it through): `#stprompt` (`.hud
  .stprompt`, fixed above the station) = the station's name + the place card's own `ordBtn` (numbers under `City.withInvite`,
  `Training.preview`, `City.can / cost / price`) with `<kbd>F</kbd>`; locked → the gap below; a card station → "Open the card".
  `stationAct(st)` → `mapGo(place, order)` / `mapPick(place)`; F (roadKey) or a click on the station runs it. Hidden while
  `CW.lock`, a sheet, the figure menu or the week's brief is open.

## Possession paths and touch counts

`rally(m, B, V, atk, pas, qual, scr)` runs one possession per loop; `next: [atk, pas, qual, scr]` hands it on (`scr` only for a
pop-up save, else null). Touches before the hit: normal dig / pass → set → spike **3**; setter dump **2**; overpass (free ball)
**1**; bad set over **3**; a pop-up save (a serve or spike that popped off someone's arms, `scr = { first }`) **3** —
the popper (touch 1), the saver bump-sets (touch 2, `saveSet` in `rally-phases.js`: no free ball / setter choice / dump /
double contact, `sq2 'bad'`, `bumpSet`), then a third player hits (`chooseAttack` skips `scr.first` and the saver) or the bad
set goes over as a bump; a block touch is free. Engine-only tallies (no randoms): `m.scr = { n, over }`, `m.scrLog = [{ first,
saver, hitter }]`.

Knockdowns (spec §2.28): `knock(m, p, pow, mg, until)` sets `m.down[id]` (last possession on the floor) and busy one past it;
`onFloor(m, p, n)` guards dig candidates (`digSetup`), the block (`DF`) and `nearest`. At the top of each possession `rally()`
clears expired entries and queues a `getup` act in `m.upQ`; the rally's beat recorder `B` prepends queued acts to the next
beat. `recover(c)` runs before `freeBall`: forced free ball (loose) or the high ball over (clears `m.down`, emits `getup`).
Tallies `m.ko = { n, rec, free, on }` per side. Render: pose `fall` → `d.ko = { t, dur, up }` (dive.js `downed`, `koUp`);
startPose / the pose act defer other poses to `d.afterKo`; movement holds while down (playback); poses3d `koPose`.
Receive tiers (display, `VFX.recv`): playback `startBall` → `recvHit(d, A.trailPow)` (effects.js) at the contact: `recvK`
(dive.js) → `d.rcv = { k, t, ko }`, knock-back `d.kb` (stepped in actors.js, shifts x / sx and a standing tx), `R3D.fx.recv`
(hits.mjs rings), `A.hitStopUntil` (clock.js) and `A.shake`; poses3d `recvPose` over the bump (firm / hard), `flow` keys.

## World layout (T-045)

Plain data for roads and settlements (spec §4.18), no rule uses it yet. `data/city.js`: `ROADS = { nodes: { id: [x, y] }, edges:
[[a, b, kind]] }` (kind `main` / `street` / `dirt` / `path`; nodes at `airport`, every `SPOTS` place with `at` under its own id, `hq0`…`hq7`,
`home:<housing>` for each `HOME_AT` spot, and `j…` junctions — all on land, all reachable from the airport; a test pins the coordinates to
their source), `SETTLE` (per region: style, density, gap, setback, size, kinds) and `LANDMARK` (kind per `SPOTS` id and `hq`).
`City.path(from, to)` → `{ pts: [from, …road nodes…, to], cost }` (T-048: Dijkstra over `ROADS` on length × `ROAD_COST[kind]`, ties by
node id; the legs to / from the network and the cross-country alternative cost `City.ground` = length × `GROUND_COST` of the region
sampled every `GROUND_STEP`; `cost` = the cheaper of the two, `pts` stay on the roads; a straight `[from, to]` when the ends are nearer
each other than to any node; memoised in `PATH_CACHE`, pure). `City.route` = its `pts`; `City.trip` = ceil(cost / TRIP_DAY) ≤ TRIP_MAX. `MapModel.build` adds to `land`: `roads` (`{ kind, pts }` per
edge), `lots` (`MapModel.lots`: slots every `SETTLE[region].gap` along each non-path edge, a lot on each side when `hstr(slot) < density`;
never on water, in another region, near a place, on a road or another lot — superseded by the districts below; cached per
home spot) and `landmarks` (`{ id, at, kind, region }` for every place, HQ and official venue). Layout uses fixed data + `hstr` only: no `R()` draws.

### Districts, the beach band and the overpass (T-050)

The map frame is `CITY.w` × `CITY.h` = 1060 × 700; the Wu stretch of the coast (points 6–12, plus 5, 13) grew outward, nothing else moved:
`CITY.inner` is a frozen literal (the Wei–Wu line `weiWu` = inner 6–8 + two points is unchanged), `CITY.dunes` = the old coast points 6–12
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
(`venuePanel`, career-panels.js) lists what is held there; the eval and cup cards say "at <venue>". Display only: no travel, no match rule, no save field.
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

UI (`ui/career-dossier.js`): the World sheet's Rankings tab (`rankCard`, tab in `CW.rank`, `rankTab`) renders `Rank.register / gazette / street` — top `RANK.top` rows, then "…" and your row; `rankBestRows(run, players)` adds "Their best: …" (up to 2 players, null ranks skipped) to `evalPanel` and `cupPanel` (career-match.js). The UI only reads `Rank.*`.

## Team challenges

A map action at a club HQ (not your own): `Fight.worth(run, ti, stake)` → `{ verdict: likely|doubtful|refuses, why, accepts,
need, worth }` (worth = your side's rating + standing ÷ `CHALLENGE.standPer` + the faction's dogma term, vs the club's rating −
`margin`; the card shows only verdict + why). Doubtful is decided by a fixed hash of week / club / stake (no randoms, so leaving
the match and re-asking changes nothing). `Fight.offer(run, ti, stake)`: refused → the trip + a day are spent, the diary gets
the faction's line (`CHALLENGE_LINES`), `run.refused[ti] = { week, n }` blocks that club for the week, and from `refuseMax`
refusals each further one costs `pest` standing; accepted → `{ accepted, stake }` and nothing is spent yet. `Fight.challenge`
is the fixture (same shape as `Fight.clash`; your side = Academy squad / club squad / `Fight.hired` street crew lent for the
match; the club's real squad); `Fight.challengeResult` spends the trip + day, pays the stake at odds (win) or takes it (loss),
pays the crew, then standing / fans / match XP / techniques / street points / `Rank.meet`. UI: `challengeBlock` in
`career-panels.js` (stake stepper, verdict line, Challenge, ⏭; actions `mapStake` / `mapChallenge` in career-map.js).

### Loss and injury (T-038)

After a challenge (`Fight.challengeResult`) or a street fight you fought (`Fight.clashResult`): a loss runs `Fight.lose` (`LOSS` in
`data/world.js`: extra stamina, mood, standing with the club's region — challenges only, `run.losses[region]` counts them and from the
`repeat`-th each one adds `repeatRep`; a street fight keeps `CLASH.lose` — and a loss by `heavy`+ points costs fans and pushes a
`GAZETTE_JABS` line through `Run.news`); then, win or lose, `Fight.injure(run, risk)` rolls once (`R()`) against `Fight.injuryRisk(run,
oppRating, margin)` (pure: `INJURY` — rating gap, points lost by, low stamina, days since `run.lastFight`; `Run.dayNo` is the clock),
a second roll sets the severity (`run.injury = { weeks }`, longer of the old one; severe also −`lose` on one stat, picked from that
roll). The risk is computed before the trip and the match's tiredness are counted. `Fight.ban` ("Injured — rest first") makes
`Fight.offer`, `Fight.challenge` and `Fight.clash` refuse; `Run.lineup` never starts an injured you. The physio clears `run.injury`
but not the lost stat. Evaluations and the cup carry no injury roll. Save v7 adds `run.losses` and `run.lastFight`. UI: the challenge
block and the street fight buttons show "Injury risk ~N %" and are disabled while injured.

## Body (spec §4.33, T-307)

Yours only: `you.body = { str, agi, end, flex }` (save v20; NPCs have none). Training, match XP and events act on the body; the
court skills are derived: `Body.court(b)` (js/career/body.js, numbers in `BODY`, data/career.js) — swing = clamp(flex / (BODY.swing · str),
0.5, 1) (1 since T-312), Power = 0.85 · str · (0.55 + 0.45 · swing) + 0.15 · agi, Jump = 0.55 · str · depth + 0.45 · agi (depth: flex / (BODY.depth · str),
0.6–1; 0.95), Speed = 0.75 · agi + 0.25 · end, Defense = 0.45 · flex + 0.35 · agi + 0.2 · end; a balanced body gives the same number
everywhere. `Body.sync(you, run)` writes `you.power / def / speed / jump` (rounded, `statMin`–`runCap`) after every body change
(`Training.addXp`, `Run.bump`) and sets `run.staMax` = 100 + ⌊end / 2⌋ (+15 with the Aqua sponsor). A court skill written
directly between syncs is kept: raised (the Hermit's +2) → a floor `you.floor[k]` the body catches up with; lowered (tests) → an
offset `you.edge[k]`; both against `you.synced[k]` (the values last written). `Training.key` sends a court key given for you to its body stat (`BODY.of`: power→str, jump→agi, speed→end, def→flex —
also how events and injuries land); `TRAININGS` main / side are body keys; teammates training beside you gain the court skill
the body stat stands for (`BODY.court`, Growth.shared). Me sheet: the four body bars + Wit, then the court skills and the swing
gauge ("short: Flexibility 52 of 72").

## Day orders and kit (spec §4.33, T-308)

A training place is a SPOTS entry with `kit` (KITS tags: weights, crates, plyo, steps, track, dunes, trail, water, sand, mats,
chores, film, books, gym); its `train` (the lead training: NPC plans, the floor, the dossier) is derived from the first tag at
load (data/city.js). Each tag brings `DAY_ORDERS` (data/career.js — named so because `ORDERS` is the engine's role orders): kind
`drill` (price × TRAIN_FEE × region price), `work` (free, `pay`), `stretch` (free, never fails). `City.orders(id)` = the kit's
orders + Stretch (also at home and the grounds, `City.STRETCH_AT`); `City.lead(id)` = the first drill (the card's ink primary);
`City.orderOf(id, opt)` picks the order a day runs (`City.day(run, id, hard, opt)`: opt = an order id; a kit place without one
runs its lead drill — Asks' "train together" does). `City.orderDay` → `Training.order(run, oid, at, …)` = `Training.session`
(the old `Training.train(run, key)` is the same session with no place). The facility level grows per kit place (`run.uses[id]`);
`Training.facility(run, placeId | trainingKey)` — a training key reads its own uses or its best place's; the Academy Gym is
fixed (`SPOTS.acaGym.lv`). Map points: `City.pointCan` / `City.pointDay` (Stretch: the trip + a day). UI: `ordList` / `ordBtn`
(career-panels.js; "cost → result" per body stat from `xpRate`), `kitSpot` (the kit card), `pointCard` wraps B's `pointPanel`
and adds the Stretch row inside it; `mapGo(id, oid)` / `mapStretch(x, y)` (career-map.js).

### Running a trip (T-309)

`City.path` also returns the road node ids; `City.legs(from, to)` turns the route into ground legs `{ kind, cost }` (ROADS edge kinds;
an edge at the `steps` node = 'steps'; to / from the network = 'ground'). `City.runPlan(run, p)` = `RUN_GROUND[kind]` gains per
TRIP_DAY of each leg's travel cost, stamina `RUN_GROUND.sta` per trip day; `City.noRun` (no move, injured, too tired → walk only).
`City.travelTo(run, p, 'run')` spends the walking days, logs 'Run' trip days and calls `Training.runTrip` (the gains × `Training.mul`
of the `DAY_ORDERS.run` key × DAY_GAIN; no fail roll). UI: `runBtn` (career-panels.js) beside Walk on place cards and inside
`pointCard`; `mapTravel(x, y, 'run')`.

### Kit on the map (T-310)

`MapModel.trains(id)`: a kit place's best body stats (each stat's best gain in any of its orders, Stretch aside; the top and any
within 60 %, ≤ 3) → pin field `glyphs` (BODY glyphs; pins3d draws them on a tab under the pin, `.mpin em.mgl` in css/map.css).
`MapModel.landmarks` carries `kit` (the SPOTS tags); `buildLandmark(kind, accent, kit)` (kit3d.mjs) adds each tag's `KIT_PROPS`
(racks, crates + crane, plyo boxes, steps, a track, dunes, a trail post, a pool, a sand court, mats, a shed, a film screen, a
shelf) in slots along the landmark's sides — merged into the one landmark mesh (town3d.mjs), so no draw call is added.

## Training XP

Training gives XP (`Training.xpFor`: base gain × `TRAIN_X.xp.per` × every multiplier — place quality and home turf
(x), facility level, mood, streak, teammates, camp, Hard). A stat rises a point each time its XP reaches
`Training.need(v)` = max(1, round(base × grow^(v − from))) for every v, below 50 too (≈1 XP at 1, 10 at 50; T-055), × steep[1]^(v − 75) past
`TRAIN_X.xp.steep[0]` (yours only; NPCs call `need(v, true)`); leftovers bank in `run.xp`; nothing banks past the top.
`Training.top(run, stat, src)`: 'train' (sessions, the default) → `Training.cap(run)` (`TRAIN_CAP` 75, year 2 `SEASON.cap`); 'match' → `CAREER.runCap`; wit its own cap. `sim` /
`gain` / `addXp` take the same `src`; a stat already above the top gains nothing from that source. Wit counts in 0.02 steps
(level = wit × 50); body stats are their own banks (`Training.level` reads `you.body`). Injuries and events change a body stat through `Run.bump`, stopping at the training cap (never lowering a stat that matches raised).

### Match XP (T-035)

`Growth.matchXp(run, m, mine, opp)` (career/growth.js), called from `Cup.result` when you played: your `m.stat` line × `MATCH_XP.per`
(`data/career.js`, body stats since T-307: kills → str, aces → str, blocks → str + agi, digs → flex + agi, assists → wit, attempts → end), × the gap
factor `Growth.gapFactor(ovr of your 4 starters, opponent's)` = clamp(1 + gap × `perGap`, `gap`), each stat through
`Training.addXp(…, 'match')` (so matches pass `TRAIN_CAP`). The winner is never read. A street battle you fight is a real match: `Fight.clash(run, side)`
builds the fixture (your side's crew from `Pool.draw`, you on court in your role, vs the other side's crew; both lent via
`Eval.squad` / `Eval.lend`), nothing is spent until `Fight.clashResult` (trip + a day, stamina, standing, fans ×grade, match XP,
techniques, `Front.result`); leaving early leaves the battle open. Watching is `Fight.watch(run, null)`. The result line starts
with "XP: …" and the factor note.

## Career hub UI

`js/ui/career-hub.js` renders the whole career screen (spec §10) as a fixed full-screen layer (covers the page header):
top bar (`topBar`: labelled resources with one-render deltas, sheet tabs Me · People · World · Season with keys 1–4, ⚙ →
`gearPop`), week rail (`weekRail`: you + stats, `dayTrack` from `run.dayLog` via `weekCells`, `inboxRows`
over `inboxItems`, End week; folded by «/» or `[` to `railStrip`, a 72px strip with the same reach — `.hub.railmini` sets
`--rail`, which every layer right of the rail follows; `CW.railMini` is remembered in `KEYS.rail`), the 3D island map
(`MapView`, see Island map layers; places are found only on the map, no list), the place panel (`#spot`, `placeCard` anatomy in career-panels.js) and a card over the map (`hubCard`: event → Week
report → Week brief → cup / eval card).

Sheets open over the map area (rail and top bar stay): `HUB_SHEETS` → `sheetMe` / `sheetSeason` (sheet-me.js / sheet-season.js),
`sheetPeople` (career-people.js), `sheetWorld` (career-dossier.js; the dossier renders in place on its Factions tab).
People is one list (spec §10.9: waiting → favourites → squad → bench → others → gone, markers 🛡 / ⚔ / ★ after the name;
`Chemistry ›` peek in its header); `run.fav` (RUN_DEFAULTS, ids as strings, display only) holds the stars (`toggleFav`).
World › My club (`myClubCard`) is a shortcut card; signing happens only on the club HQ panel (`hqPanel` → `joinClub`).
UI state lives in `CW` (career-week.js): `sheet`, `wtab`, `stab`, `gear`, `railMini`, `person`, `dossier`, … —
nothing of it is saved except `railMini` (a browser preference in `KEYS.rail`, not the run). There are no drawers.

Action lock (UI state only): `mapAfter` / `mapTravel` call `actLock(fx)` → `CW.lock` {phase walk → spin → done}; `lockLayer` renders in `renderCareer` (so it survives re-renders), `hubKey` returns while it is set, and `MapView.busy()` (map3d `busy`: the avatar is walking — the camera holds on it and map input is ignored) ends the walk phase. A training day's `trainFx` (before / after `trainSnap`) fills the result card; `lockShown(run)` keeps the top bar and rail on the before-values until then.

Consequence feedback (UI state only, nothing saved): `weekSnap` keeps a baseline per week (`CW.snap`); `endWeekUI`
diffs it around `Run.endWeek` into `CW.recap` → `recapCard` (the Week report). Diary entries `{ w, t, k? }`: `Run.log(run, text, k)` tags a line bad / good /
world at the producer; untagged lines fall back to the `LOG_TAGS` text match (career-week.js) — new producers pass `k`. `renderCareer` diffs `run.own` against
`CW.own` (`ownChanges`); a seize becomes an inbox row for a week (`CW.seizes`) and selects the place on the map.
`Front.stakes(run, w, l)` is a pure preview of "w beats l" (the losing unit's Strength now / after; `seize` / `place` stay
false / null) used by the street-battle panel and the brief. `run.dayLog` (RUN_DEFAULTS, cleared by `Run.endWeek`, written by `City.go` / `logDays`)
feeds the day track. `hubKey`: 1–4 sheets, Space End week, Esc closes ⚙ → list → sheet → place panel; `CW.endArm`
makes End week ask twice (4 s) while days are unused.

Short copy (spec §9.4–9.6): `js/data/glossary.js` `GLOSSARY = { id: { icon, short, long, glyph? } }` holds every repeated
idea once (its `long` is built from the data constants). `term(id, n?, cls?)` (js/ui/dom.js) renders icon + signed number with
`long` as the tooltip; `statI(k, size)` / `STAT_ICON` (js/ui/icons.js) are the stat and resource line icons; `glyph` is
the stat's text glyph for plain-text diary lines (`Training.addXp` → `✸+1`). Encyclopedia › Glossary lists every term;
a test checks every `term('id'` in js/ui exists.

Match result (spec §10.6): `finishMatch` calls `resultSnap(RUN, m)` before a career fixture's `onFinish` and
`resultData(RUN, m, snap, msg)` after it (career-match.js; diffs of the run only — no rule runs in the UI), then
`resultScreen` draws it; the Monster game (no career player) gets headline + top 3. `resultSnap` opens `Training.tally` (every
`Training.addXp` adds to it while it is set; display only, never saved) and `resultData` reads and closes it for the `+N XP` column.
Court matches (spec §4.21a, T-229): `Court` (js/career/court.js) draws a temporary `<venue> regulars` squad from the league (lent like a street crew), builds the fixture on the challenge side and settles it in `Court.result` (mlog kind `court`); `courtCard` / `mapCourt` (js/ui/career-court.js) hang off `venuePanel` through the placeCard spread. A simmed fixture goes through `simCareer(fx)` (Cup.simNow with the same snap / data around onFinish) → the card HTML → the hub's
action lock, phase `res` (`actLock(fx, greet, res)` after a map walk; `CW.lock = { phase: 'res' }` for eval / cup); closing it re-renders the hub.

Island scale (spec §4.18b): js/data/city.js writes every map point in design units (1060 × 700) and `scaleMap` multiplies them
once at load by `MAP_SCALE` (1.5); towns, minors and the Academy keep their size (see its comment). Code reads CITY.w / h and
the scaled points — never design literals; tests scale design points by `g.MAP_SCALE`.

Faction war (spec §4.34, T-313): `js/career/hex.js` `Hex` is geometry only — a flat-top axial grid built once from CITY
(tiles: id `q,r`, at, start region, kind hq/academy/minor/place/land, terrain, spots, hq, `unit` = the war unit it starts in:
`Hex.unitOf` — Wei's Gold ring = Wei tiles ≥ `WAR.ring` steps from any other major's tile, Iron outside; Wu by the nearest of
its clubs' HQs; Shu one). `js/career/war.js` `War` holds the war: `run.war = { str, fallen, last, ot }` (v21), `str` / `stage`
(own, WAR_STAGES by Strength) / `weak` (the stage its squads play with: Shu `late`, Gold Iron's − 1), `holder` / `unitAt` /
`regionAt` (a destroyed unit's land goes to its destroyer), `edges` / `pairs` (the borders between units of two regions),
`regionStr` (mean of a region's standing units: prices, quality), `hit(run, unit, win, k = 1)` (the one Strength change:
won +WAR.win × k, lost −WAR.lose × k × soak, 0–100, stamps `last`; A's Raid calls it with k = 2), `week` (WEEK_END: idle units
rally), `sync` (rebuilds the `run.own` place cache). `Front.site` picks the week's border (a hash of the week: unit pair,
then edge; `run.clash = { tile (defender's), from (raider's), at (the edge's midpoint), ua, ud, att, def }`), `Front.result`
hits both units, `Front.sim` reads their Strength. Tiles never flip; the player's travel never reads tiles.
`MapModel.warMap(run)` (model key `borders`) is what the map draws: `Hex.outline` (boundary edges chained into loops) + `Hex.straight` (Ramer–Douglas–Peucker, tol 0.9 HEX.size: straight runs) + `Hex.dense` (points ≤ HEX.size / 4 apart, for the terrain drape and banner spacing) per unit (`War.outline`, cached by the holders), the battle units' meeting stretch (`War.meet`), banners every `MapModel.bannerStep` points (each side's colour, facing across), `fall`. Hex tiles and the point panel's tile block are gone (T-317).
War stages in the match (T-314): the engine takes a per-side stage `opts.weak` / `weakSet(m, [k0, k1])` (match.js; WAR_STAGES
index, absent = nothing changes): `m.weak`, morale starts −`mor` (morAdd), `hpHeal` heals −`heal`, a Broken side's cards lose
`slots` from the end of SLOTS (`C.off` = ['flex']; `cardSlots(m, i)`, cardPut / cardFill skip it). Career fixtures call
`War.match(run, m)` in their `setup` (Cup.fixture, Fight.clash / challenge, Court): `War.weakOf(run, T)` = its club's unit
(`T.i`), a crew's unit (`T.wu`), a region's drawn squad (`T.wr`: its least-hit standing unit). Match prep shows the chip (`prepStage`).
The overthrow (T-315, war.js): `War.can(run, u, by)` (Broken, standing, `by` across its border — `foes` —, `cool` = WAR.cool weeks
after `ot[u]`), `War.side` (your club's unit, or alone a hired street crew for its strongest foe), `War.overthrow(run, u)` → a
fixture against `War.ace` at its HQ (HQ card: `overthrowBlock`, action `mapOverthrow` in career-dossier.js), `overthrowResult` →
`destroy(run, u, by)` (fallen + `sync`; its clubs stop: `War.down` → no joins, no challenges; you are freed (`War.free`);
`WAR.scatter` best players and the rival move by `War.into` (People.toReserve, else a seat swap into the region's best
club); the rival never to the winner's region nor yours → `run.war.walk` → the `walkout` scene) or `rally` (+WAR.rally).
`War.ai` (from `War.week`): a standing unit < WAR.ai off cooldown is challenged by its strongest foe (simMatch of the aces).
`Cup.places(run)` splits each major's squads over its units; a fallen unit's share counts for its holder's region. The map
pans to the latest fall once (`borders.fall`, map3d). Engine matches are one set: the "5 sets" overthrow is one match.
Call-ups (T-316): `Fight.calledFor(run)` = the region your club fights for when its unit is on this week's battle border
(`Front.clash`), else null; a battle settled without you on that side (`clashEnd`, `watch`, fighting for the other side in
`clashResult`) → `Fight.refuse` (WAR_CALL.refuse standing, diary note). clashPanel shows the call (WAR_CALL.lines, the
faction's voice) and the refusal cost first, and makes your side's Fight button the primary.

## Match music

`sfx.js`: `assets/audio/the_big_fight.mp3` is fetched and decoded once (`SND.bgmBuf`; no `<audio>`/blob URLs, which the
artifact host may block), then looped by an `AudioBufferSourceNode` → its own gain (`SND.bgm`) → `ctx.destination`, bypassing
`SND.master` (no compressor, slow-mo low-pass or reverb). Level = `BGM_GAIN` (0.5) × `SND.vol` × (sound on ? 1 : 0);
`toggleSound` / `setVolume` re-apply it (`bgmSync`). `navigate` calls `bgmStart()` for the match screen (fade in 1 s) and
`bgmStop()` for any other (fade out 0.6 s); the result overlay keeps playing. Headless there is no `AudioContext`: no-op.

## UI motion (spec §9.12, T-216–T-219)

Tokens (`--dur-*`, `--ease-*`), keyframes (`mv-*`) and every motion class live at the end of `css/theme.css`.
`Motion` (js/ui/dom.js) never delays state: `set(v?)` applies `sns_motion` + the OS setting as `html.reduced` (the css
turns moves into ≤ 120 ms fades or nothing); `play(el, cls)` adds a class until its animation ends; `leave(el, parent)`
re-attaches a dead copy (no ids / peeks, inert) with `.out` for dur-fast; `tick` counts a number; `flipFirst` / `flip`
slide `[data-flip]` rows whose index changed; `veil(title?)` covers a screen change (`navigate`, js/game/state.js; hub →
match shows the round title 600 ms, click / Space skips). The hub re-renders whole, so `renderCareer` brackets the render
with `motionBefore()` / `motionAfter()` (career-hub.js): `CW.mv` = what the last render showed (spot, sheet + sub-view,
card `key` from `hubCard`, rail, lock phase, story); a surface that opened gets `.in`, changed `.swap`, closed a `leave`
copy; new inbox rows `.new`, day slots `fillin` / `gin` / `clear` (`dayMotion`), top-bar numbers `.tk` tick. `mapPick`
does the same for the popup (`spotSwap` = glide + cross-fade) and the ghost slots; `pins3d.select` rings a newly selected
pin (`.pulse`). Match: `board` bumps the scorer's digit; `.mrail` / `.over .ocard` animate when un-hidden (css only).

## Full-court match screen (spec §9.9, T-252)

`.match` is fixed full-screen; `#stage` (court canvases, result `.over`) fills it and the HUD floats
over it: `.mtop` (board + momentum, top centre), `.cbar` (bottom centre), `.mrail` (right, between them). `fit()`
(match-screen.js) sizes `#cv` to the viewport (pixel budget `COURT_PX`) and sets `VH` (playback.js) = 500·h/w — the overlay's
logical half-height (the logical view is 1000 × 2·VH from `VT`; 220 = the classic 1000:440). r3d `syncSize` passes the
canvas's aspect to camera3d `setAspect`: a screen taller than 1000:440 widens every shot's vertical FOV (`vfov`) so its
horizontal extent stays the classic one; `focal`, `P3D` and `viewCamera` use the same half-height. Overlay pieces placed in
absolute logical Y (push-in / zoom clamps, the timeout banner) shift by `VH − 220`. F fullscreens `#match` (HUD kept).

## Plan board — role orders (spec §2.29, T-277)

- Engine (orders.js): `m.ord[pid] = { srv, tgt }`; absent = Auto, and every hook is `if order` so a match without orders
  draws exactly as before (goldens). serveWalk: `srvApply` caps / softens the natural `serveType` (pace × `ORDERS.srv.pace`,
  errors × `.err` by steps down); serveToss: an ordered Drive / Killer always fires, another ordered type never (the same
  R() draws); serveContact: `tgtResolve` (exact with Target Serve, else a lean of `.lean`, errors × `.aimErr`); serveAim:
  beside the target, or 40 % from the weaker to the other seam passer (receive − `.seam`). Tallies `m.srvLog`.
- Odds (`srvOdds(m, p, side, srv, tgt)`): temporarily sets the asked orders, evaluates `Formula.serveQuality(…, roll)` on the
  grid `ORDERS.odds.roll`, techniques at their Auto shares, the receiver mix (aimed at `dAim`, random `dRand`, seam `dSeam`),
  ace = the engine's sigmoid, broken = P(receive margin ≤ −8); restores the orders. Within ~2 points of sims (test).
- UI (plan-board.js): `boardSide(i)` renders four cards (rotation order) as a prep tab (`prepTabs` / `prepTab(k)`, keys 1–3,
  `A.prepS.tab`: 'teams' or a side); `boardRow` draws a folded slot (current pick + its odds), `boardSlot(k)` opens one
  (`A.prepS.open` = 'pid.kind'; a pick closes it). `prepOpen(null, true)`
  (Tab, `boardToggle`) shows the board alone with the plan read-only (`A.prepS.board`; prepStart then applies no plans).
  Keys: Tab / Esc close, also with a board button focused. `boardMark` draws the ◆ on the court tag (tags.js).
- Spike orders (T-278): `m.ord[pid].aim` ('line' | 'cross' | 'open' | a passer's id) and `.shot` ('power' | 'cut' | 'tip').
  laneRead reads a forced channel × `ORDERS.atk.readK`; laneAim takes `atkApply` (channel lean, pace / error / cut dials);
  spikePower: an ordered Tip always tips, another ordered shot never (the same draw); landingSpot: `atkLand` pulls the ball
  toward the player or the biggest gap; an ordered tip's kill chance falls with each one seen (`laneSeen(..).tip`, digSetup).
- Spike odds (`atkOdds`): `ORDERS.odds.atkN` possessions from a perfect pass with the hitter fed (`m.probe` in chooseAttack),
  each from a copy of the match (`stCopy`: plain state deep-copied, teams and players by reference — a rally does not change
  them), RNG.next swapped for a seed of the score; `probeHit` (tallyAttack) throws `PROBE_STOP` at the hitter's first attack.
  ~0.1 s a probe: the board queues them (`boardAtk` / `boardWork`, one per tick, cached per point) and fills each in place.
- Setter orders (T-279): `m.ord[setter].feed` (a hitter id) — chooseAttack swaps the spiker for them after its draws when the
  pass is a 3 / 2, they are in the free pool and it is no high ball (`fed`, `feedOrd` on the attack; laneRead × `ORDERS.set.readK`
  with `feedOrd`); fakeSet keeps a fed spiker (no switch to a quick). `.fake = 'off'`: fakeSet and setterDump skip (no draw).
  The probe's own feed (`m.probe.p`) uses the same swap; `atkOdds(m, side, null, …)` measures the side's attack.
- Middle orders (T-280): `m.ord[mb].blk`. blockApproach: a front-row middle's Read / Commit replaces `m.dset[ds]` for the
  attack (bunch / commit flags follow); fakeSet's bite test reads the decoy blocker's own order first. Stay back (`stayBack`):
  out of DF and the B0 fallback, no late jump, moved to `ORDERS.blk.backX` in blockMoves, a floor digger in digSetup
  (dig distance × `backDd`). Board odds: `atkOdds(m, their side, null, [[mb, 'blk', v]])` shown as stuff · their kill.
- Result card (T-281): `m.ordLog[pid]['kind:value'] = { kind, v, n, k, err, stf, ace, bad }` — srvLog adds serve orders,
  tallyAttack → `ordAttack` the hitter's aim / shot, the setter's feed (only when `feedOrd`) / fake and the front-row
  middles' blk; `boardResult(m)` (plan-board.js) prints them under the plans for the sides whose board you saw.

## Momentum stages (spec §2.14, T-259)

- Fire is `m.mom` (pointMomentum moves it as before). After every point `pointStage` (fire.js, called from `end` in place of
  the old pointZone): the zone breaker (a kill block on a Fever team: they → Composed, the scorers → Fever; a fake → Focused),
  Fever's clock (`m.fever[side]` points, `feverLen` by temperament, an Ice opponent cuts 2) and its error exit, Fever's start
  (fire ≥ the temperament's threshold and a trigger on this point: 3+ possessions, the streak reaching 4, a kill at set
  point; not on the point a Fever ended), then every other side's stage from its fire (`fireStage`, the temperament's
  thresholds, Slow burner never Loose before 8 points). Changes come back as `stage` acts on one beat after the point beat;
  `zone` acts still flash on entering Fever. A timeout: `stageTimeout` (Loose → Composed, their Fever → Focused).
- Buffs: `stageBuff(p, k)` (k: atk spike power, def in effD, spd in receive / dig speed terms and block reach, jump in
  jumpPx, serve in serveQuality) replaces the old `0.06 × mom` in boost(). The losing captain's random zone call is gone.
- `RALLY_MAX` (rally.js): a rally gives up after 80 possessions (the attacking side scores) — only a rigged stream gets there.

## Bars — HP and morale (spec §2.31, T-294)

- **HP**: `knock(m, p, pow, mg, until)` (match.js) is called on every kept-up serve receive and dig; it calls `hpHit` (bars.js),
  which takes `clamp((impact − HP.gap) / HP.span, 0, 1) × weight` off `m.hp[id]` (impact and weight as the old knockdown roll).
  HP 0 → the old knockdown path (on the floor, busy, `KNOCK.sta`, `m.ko` tallies). No R(): the roll is gone (goldens moved).
  `hpHeal` in pointMomentum: court + `HP.heal`, bench back to 1. `dr` (stats.js) × (1 + `HP.drain` × (1 − hp)).
- **Morale**: `m.mor[id]` for every squad player (bench too, so a sub brings a live value). `morPoint` (bars.js) runs the old
  pointMomentum fire update per player with `MTRAITS` shaping it; then `m.mom[side] = fireOf(m, side)`. Everything that used to
  set `m.mom` directly (element Starlight, zone breaker, timeout) goes through `morAdd` / `fireTo` (shift everyone alike).
  `subIn` refreshes the fire (who is on court). `m.noTraits` (tests) makes every player trait-less: then all morale is equal
  and the fire is exactly the old fire.

## Sparks and Scars (spec §4.30, T-291)

- **Data** `js/data/traits.js`: `SPARKS` (the Drive pool), `SCARS` (bad; `op: true` = the OP pool; `career: true` = acts outside
  matches), `MC_TRAITS` = both by id; `TRAIT_ODDS` (spark 0.35, op 0.12 + sharp 0.08 per `run.secret.sharp` + per 0.04 per Scar
  before, max 3); `TRAIT_LATE_PTS` = 12 (the spec's "20+ points" of a 25-point set, in the 15-point set; or a set point). Diary
  lines `FEEL_LINES.traits` (data/story.js).
- **Rolls** (career/feel.js, no R()): `Feel.add` → at the top `Feel.spark` (Drive) / `Feel.scar` (Pain); `Feel.roll(run, salt)` =
  `hstr(pseed|feel|week|salt)`. A Spark is named at once; a Scar is pushed `seen: false` — Enlightenment applies at once
  (`Feel.enlighten`: body + 6 → Body.sync, Wit + 0.3, ≤ runCap / witRunCap). An old save's `{ k: 'pending' }` entries are rolled
  by `Feel.sync` (Run.repair).
- **Into the match**: `Feel.sync` → `you.traits` (ids; deleted when none). `Feel.match` (Cup fixtures) sets `m.vsRival` when her
  squad is m.t[1] (Spite) and Haunted's start morale. Engine hooks (bars.js; each is skipped without `p.traits`, no draws):
  `trBuff(p, k)` × in `stageBuff` (Clutch late atk/def, Air Impact atk, God of War atk while `m.gow[pid].on`, Spite all),
  `trStage` (Dead Calm: Loose → Composed for p), `trWit` in W (Tunnel Vision), `trServeErr` in Formula.serveErrorP (Shaky Hands
  late, + 0.06), `trHeal` in hpHeal (Second Wind), `morKeep` after morPoint / a negative morAdd (Eye of the Storm, Iron Will),
  Captain's Voice in morPoint, `trPoint` in pointMomentum (God of War's run). `trSquad(m, i)` caches the carriers (`m.trP`).
- **Naming**: hooks mark `m.trAct[pid][id]`; career-side Scars (Glass Ankle in Fight.injuryRisk and the failed-training injury,
  Insomnia in Training.rest, Bitter in Rel.add) go through `Feel.has(run, id)`, which marks a hidden one `acted`. `Feel.name`
  (Feel.result, every match of yours) names each hidden Scar that acted (or Enlightenment after a played match): diary line.
  The Me sheet (`traitLines`) lists Sparks and named Scars; a hidden one shows "Something broke."
- **Special VFX** (display only): `specialFx(p | id, kind)` (render/effects.js) → 0 none, 1 as staged (p.op, `A.m.fired === p.id`,
  the dev labs), 2 always (`MC_TRAITS[id].fx`). Sites: acts.js `burst` (the 3D contact burst by the hitter — spkstyle's p or
  `A.ballBy`; the air impact pend by the spiker, an Air Impact spark ignores the stage's floor), playback.js `leapWarp` (Flash
  Step: from VFX.leap.from), actors3d.mjs (eye trails; hand-trail ink), director.js `ballStyle` (ink by `A.trailBy`, set in
  startBall from `A.ballBy`).

## Tactic cards and turns (spec §2.32–§2.33, T-295)

- **Compile, don't fork**: a card is data (`CARDS`); `cardApply` turns the slotted set into the existing levers, so the rally
  code only gained `cardForce` checks at the R()-gated technique hooks (delay, freak, slide, sync, pipe combo; Cut Shot adds
  +0.25 to its chance) and `cardBuff` inside `stageBuff`. A forced technique skips its R() draw; no card → the old draw.
- **Orders**: a card's role orders go into `m.ord` like the board's, listed in `C.cord`; the next apply clears only those, and a
  card never overwrites an order already there (a board / test order stands). Stubborn players get none.
- **Plans**: `m.planFixed[side]` (opts.plan: match prep's old plan tiles, tests) keeps the cards off that side's plan.
- **Tally**: `rallyStart` notes `m.att0` (attacks so far) and `m.srv0`, `serveWalk` the server (`m.srvP0`); `cardTally(m, w)` in
  `end` after pointMomentum reads them. A combo shares one `net` key (the combo id).
- **Turns**: `cardTurn` after the dead-ball subs: every TURN.pts points played or `m.turnNow` (a spent card); a timeout refills
  the calling side (`timeout`). `m.turnLog` keeps each turn's slots.

## Gifts (spec §4.35, T-320)

- **Data** `js/data/gifts.js`: `GIFT_TIERS` (pot bars → S A B C D), `GIFT_ODDS` (two 0.10, one 0.45; `know` = the bond that
  shows them, 20), `GIFTS[id]` = { name, desc (registrar), kind growth | body | element | mind | social, w (roll weight), cost
  ($ for the gift chance; none = never offered), k / stat / wit / lead / mor (numbers) }.
- **Roll** (career/gifts.js `Gifts`, no R()): `People.ensure` → `Gifts.roll(run, p)` once per NPC without `p.gifts` (new
  players too); `Gifts.pick(seed, id)` = `hstr(pseed|id|gift|i)` through `Gifts.mix` (fmix32: plain FNV-1a barely moves on
  `p12` vs `p13`); two gifts are never one kind. `Gifts.innate(p, ids)` applies the once-only part: an NPC's body-stat bonus
  (Spring Legs / Rubber Joints / Quick Twitch), Elementless Wit, Natural Leader's Leadership, `p.elOn` off (Elementless,
  Dormant), Twin's `p.el2` (+ `p.sig2` in elAssign). The named (career/stars.js): Haewon and the cohort carry authored
  `tier` / `gifts` (data/stars.js), the first aces an authored tier and rolled gifts; `Stars.shape` adds `Gifts.stat`, `Stars.week`
  adds `Gifts.wit` (their curve resets the stats weekly). The MC never gets a roll (People.homes skips you).
- **Contract** (Agent P's card / presence): `Gifts.tier(p)` (authored `p.tier`, else pot), `Gifts.of(p)` (ids, [] none),
  `Gifts.known(run, p)` (you; club scouted `City.scouted`; a `trained` memory; `Rel.bondOf` ≥ 20 — sticky in
  `run.people[id].known.gifts`), `GIFTS[id]`.
- **Career effects**: `Gifts.grow(run, p, src, stat)` × in People.week (training XP: Prodigy, Late Bloomer by `Season.year`,
  Early Peak by OVR < 75, Grinder / Gamer by source, Reader on wit; match XP: hustle and league play); Glass Bones × the Hard
  injury roll. Dormant: `Gifts.wake(run)` after `Cup.start` (Run.endWeek) wakes the Cup squads' sleepers (`p.woke` → elCheck).
- **Engine hooks** (read `p.gifts` only; `hasGift(p, id)` in engine/elements.js; no draws, so goldens hold): `elCheck` never
  unlocks Elementless or an unwoken Dormant; `elCharge` × Element-born; `elSpike` — Twin plays `el2` / `sig2` on every other
  spike (`m.stat[pid].els` odd); bars.js `hpHit` × Iron Frame; `gfMor` / `giftMor` (cached carriers `m.gfP`) after morPoint and a
  negative morAdd from `TRAIT_LATE_PTS`: Choker's drop × 1.5, Ice Veins' floor (−0.55, above Rattled); Contagious in morPoint.
- **Gift chance** (T-322): `Gifts.ask(run)` (WEEK_START, and `City.day` → `dayDo` then ask) opens `run.event = { id: 'gift', who,
  gift, cost, p, pre }` for the highest-bond friend at GIFT_ASK.bond+ with a priced gift you lack (once: `run.giftAsk[id]` = week;
  none in a cup, none at GIFT_ASK.max); Events.def / choose → `Gifts.answer` (pay: money, `Gifts.mix(hstr(pseed|giftask|who|gift))`
  < p → `Gifts.learn`). Lines `GIFT_LINES` (diary). Yours: `run.gifts` → `you.gifts` (`Gifts.sync`, Run.repair); growth ×
  `Gifts.grow` in `Training.sim` (preview and gain alike), body bonus `Gifts.stat` in `Body.sync`, `Body.swing(b, p)` full with
  Rubber Joints, Generous scales the `Growth.shared` pv in Training.session. Me sheet: `giftLines`.
- **Rubbing off** (T-323): `Gifts.rub(run, ids)` over `Training.matesAt` (teammates on the floor, `you.bond` ≥ GIFT_RUB.bond) →
  `{ all, keys, from }`; `Training.preview` multiplies each row's mul by `all` × `keys[bodyKey]` (so the session and the card agree)
  and returns `rub` (= from); kitSpot's mate chip names it (`· Rubber Joints ×1.2`, the body stat in its tip). A Generous
  friend's share × GIFTS.generous.k. Data `GIFT_RUB` (body gifts → their body stat, growth gifts → every gain; Late Bloomer in year 2).
- **Not here** (Agent P, rel.js): Magnetic / Lone Wolf bond growth — `Rel.add` can scale a positive memory by
  `Gifts.bondMul(run, id)` (their Magnetic / Lone Wolf × your Magnetic).

## Team life — windows, tenure, circle, strip (spec §4.36, T-325–T-327)

- **Windows** (`World.window(run)` → { open, next, why }): open in `WINDOW.open` weeks (week 1 of a season — the off-season's
  registration) and every week after a CALENDAR evaluation week (5, 9 … 25; the year-2 rematch opens none). `World.canJoin`
  adds the registrar's `why` outside it (not during a cup), and drops "already signed": signing elsewhere is a switch.
- **Leaving** (`World.leave(run, keep)`, always open; `World.join` calls it on a switch): `World.walkedOut` writes `walked_out`
  with every teammate (`MEMORY.walked_out.v` × `beh[headline trait]`: Loyal × 2, Mercenary × 0.3, Egoist × −0.2 = +2) through
  `Rel.add`, `City.repBump` WINDOW.rep with the club's region, every teammate → `run.ex[id]` = `Season.wk`; you take your role's
  seat on the Academy squad (as War.free). Signing from the Academy squad records its players in `run.ex` without the memory;
  a join clears `run.ex` for the new squad. HQ card (career-panels.js): `windowTag` / Switch (`⚑ −8`, `switchCost` tip) on other
  clubs; your club: `tenureTag` and the Leave club peek (`leaveBlock` → `leaveClub`).
- **Tenure** (`World.tenure(run)` = `Season.wk − run.tenure` at a club, 0 free; absolute weeks: no rebase at the rollover):
  TENURE.ahead → `Run.lineup` score + TENURE.lineup for you at your club; TENURE.members → `City.price` × TENURE.price at
  places of your faction's region; until TENURE.captain `Run.lineup` leaves you out of the captain pick at your club
  (finalizeTeam's pick is overwritten by the next lineup).
- **Circle** (career/circle.js; data CIRCLE / FOLLOW / TEAM_LINES): `Circle.of(run)` → up to CIRCLE.max ids from every `run.mem`
  pair with you whose `Rel.bondOf` ≥ CIRCLE.bond and who is still in play (`People.homes`), starred (`run.fav`) first, then bond,
  then id — the contract Team (Agent S) reads with `run.ex`. `Circle.mood` (hurt / out / tired / fine) and `Circle.mate` for the strip.
- **Follow**: `World.join` asks `Circle.asker(run, left)` before walking out — the closest active, non-named teammate at FOLLOW.bond+
  whose `People.roll(run, id, 'follow')` < FOLLOW.p[headline] (Loyal 0); none with an event open or in a cup. The asker is spared
  `walked_out`; `Circle.offer` opens `run.event = { id: 'follow', who, from, to, fee (Mercenary), pre: true }` (Events.def / choose →
  `Circle.answer`). Yes: pay the fee, `Circle.move` (the lowest same-role non-named player of your club drops to the Academy squad —
  via the friend's old club: two `World.swap`s), an `event` +8 memory, `run.ex` cleared. No: `walked_out` (a club only) + `refused_help`.
- **Squad strip** (career-hub.js `squadStrip`, in `topBar` between the resources and the tabs; css/hub.css `.tcircle` / `.tcm` /
  `.tmd`): one button per `Circle.of` id — `faceSVG(p, form, 28)` (the S/A frame comes with it), a 3px bond bar (`.bbar` c / f at
  60 / 80), a corner badge for `Circle.mood` (hurt ✚ `--bad`, tired z `--warn`, out –), a teammate ringed in the club colour
  (`--tc` border); the tip says name · club · bond · mood; click → `openPerson(id)`. Nothing when the circle is empty.


## Team stories (spec §4.36 2–4, T-328–T-330)

- **Files**: `js/data/team.js` (TEAM numbers, TEAM_CHAT lines by behaviour × situation, TEAM_REPLY; its memory kinds are merged into
  MEMORY / MEM_TEXT at load), `js/career/team.js` (`Team`, DOM-free, hashes only — `hstr`, never R()). State lazily in `run.tlife`
  (`Team.of`; not `run.team`, which is the club index), no RUN_DEFAULTS, no save bump. Agent T's contract is read behind guards:
  `Team.circle` = `Circle.of(run)` or your mates (≤ TEAM.circle), `Team.ex` = `run.ex` or {}.
- **Hook**: `Cup.record` (every match of yours, you = side 0) calls `Team.matched(run, m)`.
- **Chat** (T-328): `Team.chatFor` → `run.tlife.chat = { key, win, msgs: [{ id, sit, t }], done }`: 2–4 people of your side's squad
  (played first, then by hash), each one line from `TEAM_CHAT[their first trait][sit]` (`Team.sit`: win / loss + `_you` / `_them` when
  one line beats the other by REL.behave.proud.gap — `Team.line` weighs a stat line as Rel.afterMatch does). A match you only watched
  clears it. `Team.reply(run, kind)` once: `Rel.add(id, TEAM_REPLY[kind].mem, v × by[behaviour])` for each who wrote (0 → none).
  UI (career-match.js): `chatCard` in the hub's lock layer (`CW.lock = { phase: 'res', res, chat: true }`) — after a watched match
  from `watchCareer`'s onLeave (only a chat this match wrote), after a simmed one from the result card's Continue (`chatAfter`);
  `chatKey` (window, capture) takes 1 / 2 / 3 and Space / Enter / Esc (= Stay quiet) before `hubKey`.
- **Arcs** (T-329): `run.tlife.arcs[id] = { id, y, w (want), b (beat), st, at, alt? }` and `run.tlife.helped[id] = [years]`. `Team.week`
  (a WEEK_START step appended at load by team.js): lapsed beats close quietly (no memory), the next beat opens (the seat waits for an evaluation
  week, then its `alt`), circle members start one arc a season (hashed start week, ≤ TEAM.arc.max running, until TEAM.arc.last).
  `Team.beat` = ARCS data with `alt` when it can't be played as written (a match with a non-mate → a day). `Team.answer(run, id, yes)`:
  money · day (`City.day` at `Asks.place`, as an accepted invite) · match (→ 'wait', kept by `Team.arcMatch` from Team.matched when
  they played on your side) · sit (`run.sitout`, Asks.sits) · choice; each help → `arc_help`, the last → `arc_done` + `helped`;
  no → `arc_refused` (a `soft` beat: none; `back` pays back). Rewards: `Team.growMul` (× TEAM.grow the season it was seen through)
  is multiplied into `Gifts.grow` (every NPC growth path); `Team.lean(run, out)` from `Cup.entrants` (year 2, after the rival is
  placed): a helped friend of your squad's region takes the weakest same-role seat on a hash < TEAM.lean (within TEAM.leanOvr OVR).
  UI (career-people.js): `arcStep` (the card's line), `arcAsk` / `arcAnswer` (the open beat, cost on the help button), open beats
  sort with the waiting asks (the `!` badge).
- **Duo cards and ex-teammates** (T-330): six CARDS with `src: 'duo'` and `duo: [role, role]` (js/data/cards.js; `Team.duoCard` finds
  yours by your role and theirs). `Team.setup(run, m)` — called from the UI's fixture wrappers (`watchCareer` / `simCareer` setup,
  after the fixture's own; the headless Raid / Midnight Court have none) — sets `m.duo[your side] = { card: [you, friends] }` for
  squadmates whose duo is unlocked (`Team.duoOk`: bond TEAM.duo once — `Team.duoWeek` logs it in `run.tlife.duo`) and refills turn 0
  (the coach picked in newMatch before m.duo existed; `played` reset so counts stay 1); `m.exIds` = ex-teammates across the net. Engine
  (cards.js): `duoIds(m, i, id)`, `duoOn(T, ids)` (two of the pair on court); `cardInPool` holds a duo card only while both are on
  court; its buffs carry `ids` and `cardFor` gives them to the pair only while both are on court; never spent (no CARD_EDGE: always
  'fit'); the coach scores it `CARD_AI.duo`. No m.duo → nothing reads differently (goldens unchanged). UI: `cardName` ("Mint × You:
  Pin Connection", chips and the result row); `teamWatch(m)` (match-cards.js, a rAF loop from watchCareer's setup) waits until no
  prep / turn / exchange / scene holds the court, then `exRemark(m)` once (match-exchange.js: MLINES `ex` / `ex_reply` by personality,
  holds the rally through `Dir.talk`), then `cardsDuoCut` the first time each duo card is slotted with its pair on court (the hype
  banner `showBanner` "Mint × You" + `showSay` with DUO_SAY). `faced_ex` (Team.matched): each ex who played against you (Agent T owns
  the kind; data/team.js defines a stand-in only while it is missing).

## Encounters, effort, island sound (spec §4.37 3–5, T-333–T-335)

- **The trip** — `City.go` / `City.travelTo` note `City.last = { from, to, day }` (not saved; `day` = days used before it). The map's
  actions (`mapGo`, `mapStretch`, `mapTravel`, `mapScout` in career-map.js) clear it first (`roadStart`), run the rules, then
  `roadAfter`: `Encounter.on(run, { …City.last, pts }, { via })` on the road walked (City.route, or the short cut's pts), counted at once
  (`Encounter.open` → `run.enc = { w, n, met }`), and tell the walk where to halt (`WALK.stop`) and which road to take (`WALK.via`).
  Fight results and other `City.go` callers never stop: only those four read `City.last`.
- **Encounter.on** (pure, no R()): candidates from `Encounter.near` — `MapModel.lifePeople` (T-331) when it exists, else today's floor
  (`MapModel.life().mates`) and the circle's plans (`run.people[id].plan.at`, hashed offset, fogged places skipped); an open arc beat's
  person = `arc`, a circle member = `circle`, `Fight.clashSite` = `battle`, each known rival HQ that would take a challenge = `crew`.
  Kept: within `ENC.r` of the road, not within `ENC.min` of either end, the setting's kinds (`ENC.stops[Encounter.pref()]`; the short
  cut's own via under any setting but never), not met this week, `ENC.week` a week; then `hstr('enc|pseed|wk|day|key') < ENC.p[kind]`
  (`ENC.alt.p` for the via); the first by `ENC.rank`, then nearest the start. `Encounter.force` (a key; UI smoke / QA only) skips the
  hash and the distance (it halts mid-road). No stop with an event open or in a match / cup week.
- **Answers** (`Encounter.answer`): talk → `Rel.add(…, 'met_road')` (+2, Friendly × 1.5 by REL.behave) and the diary line; walk → nothing;
  challenge → `Fight.offer` at no stake → its fixture or the refusal (a day spent, as at the HQ); join → `Fight.clash(side)`; help /
  refuse → `Team.answer`. The card (`encLayer`, the dialogue box over the map: face, name · act at place, their line by headline
  behaviour / the crew's faction voice / the street; answers 1–n with cost → result, Space walks on) — talk shows the diary line, then
  Space walks on; challenge / join / an arc's answer leave the road (`encLeave`: the walk resumes, the lock ends) and play as from
  their own cards (`mapChallenge`, `mapClash`, `arcAnswer`).
- **The walk** (avatar3d.mjs `WALK`, imported by career-map.js — the same module instance map3d uses): `setTarget` splits the road at
  `WALK.stop` into two legs (each its own speed ramp), holds at the end of the first (`WALK.held`, `onHold`; `busy()` stays true) until
  `WALK.go()`; `WALK.via` replaces the road for a walk to the same point; `WALK.routes` = the preview ribbons (safe road ink, short cut
  warn; the picked one brighter), rebuilt only when they change; `WALK.onStep` fires per footfall. `lockWalk` (career-map.js) opens
  phase `enc` on the hold — or on arrival when the map can't halt (no WebGL, a short walk); `roadClear` (lockEnd) clears stop / via.
- **Short cut** — `City.alt(run, to)`: past `Encounter.vias` (the open battle while you may fight; your circle's places), the same trip
  days as the safe road (never more), cost ≤ max(safe × `ENC.alt.slack`, safe + `ENC.alt.extra`), only when the safe road doesn't pass it
  already. Display + its stop only: days, Run gains (City.runPlan) and arrival are the safe road's. `roadSync` (each card / mount) caches
  it per selection + position + days + week + setting and resets the pick to the safe road; the place card's route row (`routeRow`,
  injected into spotPanel's card) and R toggle it.
- **Island sound** (js/audio/ambience.js `Ambience`): `start()` from mapMount (idempotent: audioInit, a bus → `SND.master`, three looped
  noise layers + the insects' AM tone), a 200 ms tick mixes by `weights(run, p, d, clock)` at the camera's ground point
  (`MapView.m3.info().view`): sea (coast distance), gulls (the harbor district; a little along the coast), murmur (district style), thuds
  (courts and venues within 220), wind (relief, Shu, wide views), insects (night: `MapModel.clock` ≥ 0.78, fallback the week's last day);
  zoomed out damps the local layers. One-shots (thuds, gulls, footsteps from `WALK.onStep`, a soft click on hub buttons) free themselves.
  The tick stops it once `#mapwrap` is gone or the view isn't the career: every node stopped and disconnected, the listeners removed,
  the context suspended unless a match uses it. Follows `SND.on` (bus gain) and the volume (the master bus). Math.random only.
- **Settings** (title › Settings, menu.js `islandSettings`): Road stops (`KEYS.enc`: friends · all · never),
  Sound (`toggleSound`).
- **Career bot**: `casual` / `good` never stop on the road (the baseline).
- **The figure menu** (spec §4.37 7, T-340) — rules in encounter.js (pure, no R()): `Encounter.menu(run, id, road, stake)` = the rows
  talk · invite · spar · challenge · card, each `{ k, days, why }` (`why` = the gap, '' = open) + invite `p` / `verdict`, spar `court`,
  challenge `ti` / `verdict`; `Encounter.who` = the person's lifePeople entry + squad (null for grey / fogged / gone). State lazily in
  `run.enc` (this week): `talk` / `ask` = { id: `Encounter.today` } (once a day per person), `inv` = the id an Invite's yes brings.
  Talk = `met_road` + their `ENC_HI` line; Invite = `hstr('inv|pseed|today|id') < inviteP` (ENC.invite: bond floor, behaviour odds,
  + bond); `City.withInvite(run, place, fn)` puts them on that place's floor (`run.floor[train key]`) for the order (`City.orderDay`,
  then used up; a non-teammate gets `trained`) and for the place card's preview, then restores the floor; Spar = `Encounter.spar` →
  a fixture (your challenge side vs their squad, at `Encounter.court`: an explored court or a venue within ENC.spar.r; no stake, no
  injury roll, no standing), `sparResult` = the trip + a day, ENC.spar.xp × the match XP, `sparred` either way, `Cup.record` 'Spar'.
  Walking over: `City.walkTo(run, p)` = the trip days only (0 close by). UI (career-map.js): MapView.person (click; map3d's
  `contextmenu` = right-click) → `figOpen` → `#figmenu` (`.fmenu`, re-inserted by mapMount → `figRender`), placed by `figPlace` in
  the spot-follow loop beside `MapView.figureAt(id)` (`besideAt`, shared with the place card) and `MapView.mark(id)` = life3d's cyan
  ring (hover = an ink ring). `figDo`: Talk / Invite walk then the greet box (their line + the diary's); Spar / Challenge play as
  from the HQ card (watch, or ⏭ = simCareer); Card = openPerson. Keys (`figKey` in roadKey): 1–n, Shift + n = ⏭, − / + the stake,
  Esc. The road stop (`encLayer`) is the same card in `#actlock` (`encRows`: an arc's answers + the person's rows; a crew's Challenge;
  the battle's sides, with ⏭; Walk on = Space).
