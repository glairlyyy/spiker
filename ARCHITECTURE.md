# Spite & Spike — architecture

A 4v4 anime volleyball simulator drawn in 3D. Plain HTML + CSS + classic `<script>` files (no build step), plus
ES modules for the 3D renderer (`js/render3d/`, loaded with `import()`).
Scripts share one global scope and load in the order listed in `index.html`; a file may only use
earlier files **at load time** (inside functions, anything loaded is fine).

## Layers

| Layer  | Folder                                    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core   | `js/core/`                                | `debuglog.js` (loaded first: `DBG` collects errors, console errors/warnings and match stalls; the header's Debug log button shows and copies them), `rng.js` (all game randomness via `R()`, seedable with `RNG.seed(n)`; presentation — particles, confetti, trail flicker, coach looks — uses `FXR` on `Math.random`, `FXR.isolate(fn)` for code that calls `R()` inside, so frame rate never moves the engine stream; a test scans js/render, js/audio and match-screen / match-result for game-RNG calls), `math.js` (non-random helpers: `clamp lerp sig inPoly`, `fmtDelta` for every signed change "+3" / "−2"; ES modules (js/render3d, js/map3d) use `js/render3d/m3d.mjs`: clamp, lerp, ease, smooth, wrap — geo3d re-exports them), `storage.js` (all `localStorage` via `store`, keys in `KEYS`). |
| Data   | `js/data/`                                | Constants only (`CITY` is built by an IIFE; its day / travel / fee tuning is one block in `data/city.js`). The helpers that read them live in the engine: `callLine` / `confidence` (hype.js), `epair` (elements.js), `hasTech` / `skillRoleOk` / `leadLv` (skills.js). No state, no randoms, no DOM.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Engine | `js/engine/`                              | Pure simulation. **No DOM, canvas or audio.** Runs headless (odds, preseason, tests).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Audio  | `js/audio/`                               | Synthesized WebAudio effects plus the match music (`sfx.js`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Game   | `js/game/`                                | Global state `G` (settings, current screen), screen router (`Screens`, `navigate()`), bracket helpers (career Cup).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Career | `js/career/`                              | Career-mode rules (run, training, events, skills, Cup). **No DOM** — testable headlessly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| UI     | `js/ui/`                                  | DOM screens: menu, match screen, career create / hub / map panels / week cards / dossier / end, encyclopedia; `map-view.js` (the map renderer contract). Render and call rules only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Render | `js/render/`, `js/render3d/`, `js/map3d/` | Beat playback and the screen-space layer (canvas); the 3D match scene, players and poses (three.js + VRM); the 3D island map. Presentation randomness via `FXR` only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## File map (load order)

Classic scripts, in index.html order (each group only uses earlier groups at load time):

- **core** `debuglog.js` (DBG), `math.js` (clamp, lerp, inPoly, fmtDelta…), `rng.js` (R / RNG / FXR), `storage.js` (store, KEYS).
- **data** `rules.js` (RULES, EGO…), `styles.js` (playstyles, team list, archetypes), `names.js` (name pools),
  `looks.js` (appearance palettes), `moves.js` (signature / combo names, coach lines), `roles.js` (role biases, key
  stats, mood deltas), `elements.js`, `vfx.js` (VFX_DEF / live `VFX` effect tuning, read by render code only; saved dev edits in `sns_vfx`), `tactics.js`, `dialogue.js` (lines, `callLine`), `skills.js`, `career.js`
  (CAREER, BODY, CALENDAR, ROLE_NAME, STATNAME, MLOG…), `world.js` (REGIONS, FACTIONS, ECON, HOUSING, CLASH, FRONT, HEX…, WINDOW / TENURE / TEAM_LINES — team life, spec §4.36), `war.js` (WAR: the war units, Strength deltas; WAR_STAGES — spec §4.34), `city.js`
  (CITY geometry, SPOTS, travel constants, layout data), `stars.js` (STARS), `traits.js` (SPARKS / SCARS / `MC_TRAITS`, `TRAIT_ODDS`: the
  traits only your player carries — spec §4.30; not the NPCs' `TRAITS` in people.js), `gifts.js` (GIFTS, GIFT_TIERS, GIFT_ODDS: talent
  tiers and innate gifts — spec §4.35).
- **engine** `court.js` (geometry, `Z_UNITS`, `UNIT_M`, `BALL_K` / `SERVE_K`), `players.js`, `teams.js`, `save.js`,
  `stats.js`, `skills.js`, `formulas.js`, `elements.js`, `hype.js`, `fire.js` (momentum stages, spec §2.14: `temperOf`,
  `fireStage`, `pointStage` after every point (in `end`), `stageTimeout`, `stageBuff(p, stat)` read by effD / jumpPx / the
  formulas; `m.mom` is the fire, `m.stage`, `m.temper`, `m.fever`; `m.zone` = the Fever alias; data in data/momentum.js:
  `STAGES`, `TEMPERS`, `TEMPER_OF`, `FIRE`; the captains' calls `capReady` / `capCall` — T-260), `bars.js` (spec §2.31: HP
  `m.hp` — `hpHit` in `knock` (collapse = HP 0, no roll; your Endurance `p.body.end` × (1.2 − 0.4 · end / 100), no body × 1 — spec §4.33), `hpHeal` between rallies; morale `m.mor` per player — `morPoint`
  replaces the fire update, `fireOf` = the on-court average (captain ×2) → `m.mom`, `morAdd` / `fireTo` for team-wide pushes;
  `mtraitOf(p)` by hash; data `HP`, `MTRAITS` in data/cards.js), `cards.js` (tactic cards and turns, spec §2.32–§2.33:
  `m.cards[side]` = { by, slots (SLOTS: atk0 atk1 def0 def1 flex), you, net, worn, spent, played, force, buff } or null
  (`opts.cards === false`); `cardsInit` in newMatch, `cardFill` (your cards stay, the coach's `cardScore` picks the rest, no
  draws), `cardApply` compiles into planSet / `m.tac` / `ordSet` (only its own orders: `cord`) / `cardForce(p, tech)` read at
  the technique hooks / `cardBuff(p, stat)` multiplied into `stageBuff`; `cardTally` after every point (spent at TURN.spent →
  `cardSpend`), `cardTurn` every TURN.pts points (act `turn`), act `cardspent`; `cardOn` (on-slot effects), one-shots used up
  in `cardApply`, `cardTraps` at the first serve after a turn (`m.trapNow`; act `cardspent` with `trap`), `C.over` (Overload,
  read by `dr`); data `CARDS`, `COMBOS`, `TURN`, `SLOTS`,
  `CARD_AI` in data/cards.js; `cardSlots` — a Broken war unit's side lacks FLEX, `C.off`), `match.js` (`newMatch`; `weakSet` — a side's war stage `m.weak`, spec §4.34), `serve.js`, `rally-phases.js`,
  `rally-defense.js`, `rally-block.js`, `lanes.js` (laning, spec §2.24: `laneRead`, `laneAim`, `laneTag`, `laneRecord`, coach-panel logs `hitLog` / `recvLog`; tuning `LANE` in data/tactics.js), `coach.js` (`Coach.side` / `Coach.tags`: the coach panel's analysis, spec §2.25), `plans.js` (team plans, spec §2.26: `planOf`, `atkPlan` / `defPlan`, `planPick`, `planSet`, `planCounter`, `weakPasser`, `aceOf`; data `PLANS`, `PLAN_STYLE`, `PLAN_AI`, `PLAN_LINES` in data/tactics.js; `m.plan`, `m.planBy`, `m.planLog`), `orders.js` (role orders, spec §2.29: `m.ord` player id → { srv, tgt }, none = Auto; `ordOf` / `ordSet`, `srvOpts` / `tgtOpts` (locked = the gap), `srvApply` / `tgtResolve` (the serve hooks, only with an order), `srvOdds` (the board's odds: the engine's formulas on the fixed grid `ORDERS.odds`, no draws), `srvLog` → `m.srvLog`; spike
orders `aim` / `shot`: `aimOpts` / `shotOpts`, `atkApply` (laneAim), `atkLand` (landingSpot); `atkOdds(m, side, p | null, [[player, kind, v], …])` — the engine plays the
attack from now on an isolated stream (snapshot `stCopy`, `m.probe`, `probeHit` in tallyAttack) and restores the match;
setter orders `feed` / `fake`: `feedOpts` / `fakeOpts`, read in chooseAttack (`fed`, `feedOrd`), fakeSet and setterDump; a
Rest (`rest`: `restOpts`, `restFor`, `ordSubs` at the dead ball before coachSubs; `subDo` in match.js); a middle's `blk` ('read' | 'commit' | 'back'): `blkOpts`, `stayBack`, read in blockApproach (the setting), chooseAttack (DF),
blockMoves and digSetup; tallies `ordLog` / `ordAttack` → `m.ordLog` (the result card's Orders row, `boardResult`); data `ORDERS`), `rally.js`.
- **audio** `sfx.js` (internals in the `SOUND` closure; global: `SND`, `sfx`, `audioInit`, `toggleSound`, `setVolume`, `bgmStart`, `bgmStop`, `panAt`). **game** `state.js` (G, HYPE, Screens / navigate), `bracket.js`.
- **career** `run.js` (Run, RUN_DEFAULTS), `body.js` (Body: your body → the court skills, spec §4.33), `training.js`, `growth.js`, `element.js`, `world.js`, `pool.js`, `eval.js`,
  `city.js`, `hex.js` (the war map's tile geometry), `front.js` (who raids whom, where), `war.js` (War: units, Strength, stages, `run.war`), `mapmodel.js`, `dossier.js`, `events.js`, `sponsors.js`, `skills.js`, `rank.js`, `cup.js`, `fight.js`; `circle.js` (Circle: your circle `Circle.of(run)` → ids, the friend who follows a switch — spec §4.36 B); … `gifts.js` (Gifts: tiers, the
  gift roll, `known`, growth / innate effects — spec §4.35; the engine reads `p.gifts` through `hasGift` in engine/elements.js).
- **portraits** `js/render/faces.js` `faceSVG(p, mood, size)` returns a cached 3D portrait `<img>` (PORTRAIT: look key → data URL) or the drawn face (`faceSVG2D`) as a placeholder that is swapped in place when `js/render3d/portrait3d.mjs` (lazy-loaded; one offscreen renderer, the default model re-dressed in hair / skin / team shirt, Main_v2 for you) finishes it.
- **ui** `dom.js` (esc, tip, info, fold, kv — the vertical label/value list of spec §10.1a, peek — the L2 detail card of §10.8: `CW.peek` holds the open id, `peekSync` (MutationObserver on #app) ports the open card to <body> beside its owner panel…), `icons.js`, `match-screen.js` (startMatch → `A`, 3D load / bind, fit, venue / stakes, leaveMatch), `match-controls.js` (control bar, ⚙ settings,
  camera / follow, fullscreen, timeouts, tactics, speed / pause / skip, scoreboard, commentary, rail, box score, hotkeys), `match-tech.js`
  (technique switches), `match-result.js` (result card, finishMatch), `match-coach.js` (the rail's Coach tab, `coachPanel`, spec §2.25), `match-prep.js` (match prep: the intro before every match — both teams and the hands, `prepOpen` / `prepStart`, `A.prep` holds play, spec §2.26 / §2.33), `match-cards.js` (tactic cards, spec §2.31–§2.33: the hand in prep (`cardsHand`, `cardsPick` / `cardsSlot` → cardPut + the coach's cardFill; `cardsMine`: Monster 5 on "You decide", career 1 or 5 as captain), the turn overlay `#cturn` (`cardsTurnShow` from the `turn` act, `cardsPeek` on Tab, `cardsKey`; play waits on `A.prep`), the bars rows, `cardsSpentShow`, the result card's `cardsRow`; the court tags draw HP / stamina / morale from `A.hpShown` / `A.staShown` / `A.morShown` — the snapshot's `hp`, `sta`, `mor`), `match-combo.js` (the rally touch counter: `comboTouch` from startBall, `comboEnd` on point / reset), `models.js`, `menu.js`,
  `debug-panel.js` (Debug log; `?dev` word counter per region vs the §10.8 budgets), `dev.js` (dev tools on demand, T-271: `DEV_TOOLS` lists each tool's scripts — vfx-panel.js, vfx-lab.js, anim-lab.js, not in index.html — and `devOpen(name, fn)` loads them once, then runs `fn`; ESLint reads the list for its globals), `career-create.js`, `career-week.js` (CW state, End week, Week report, events), `sheet-me.js` / `sheet-season.js` (the Me / Season sheets),
  `career-match.js` (match prep, eval / Cup cards, result data, playCareer, watchCareer), `map-view.js`, `career-panels.js` (place
  panels: `placeCard` anatomy, `PANELS` by kind → hq / clash / venue / map point, else `placePanel`), `career-map.js` (mount, pick, actions, walk lock), `career-dossier.js`,
  `career-people.js`, `career-hub.js`, `career-end.js`, `encyclopedia.js`, `vfx-lab.js` (dev: the VFX lab screen → `render3d/vfxlab3d.mjs`), `vfx-panel.js` (dev: live VFX tuning panel — Monster / Average game key V and the lab; export / import JSON).
- **render** `playback.js`, `acts.js`, `director.js`, `cine.js` (cut-scenes: the ace, a WS kill, an MB quick kill), `slowmo.js` (slow-motion cooldown per team); `js/ui/anim-lab.js` + `js/render3d/anim3d.mjs` (Animation lab: record, scrub, edit poses); `js/render3d/ik3d.mjs` (foot planting, hands on the ball), `js/render3d/secondary3d.mjs` (secondary motion: torso lag / lean on turns, landing settle, head steady), `js/render3d/gait3d.mjs` (planted gait: walking / running feet that never slide), `movement.js`, `actors.js`, `clock.js`, `camera.js`, `ball.js`, `scenes.js`,
  `effects.js`, `overlay.js`, `faces.js`, `tags.js`, `dive.js`; then `main.js`.

ES modules (loaded on demand): `js/render3d/` — `r3d.mjs` (entry), `units3d`, `arena3d`, `camera3d`, `actors3d`,
`players3d` (VRM load / dress, `MODEL_URL`), `poses3d` (+ `setMotion`; spike / swing / serve poses in `poses3d-attack`), `fx3d` (effect groups in `fx/`; `fx/gloom.mjs`: the gloom lines over a debuffed player — a sprite per figure, `gloomOf(m, p, side)` from m.weak / m.mor / m.hp), `trails3d`, `ambient3d` (the venue's air by crowd heat `Dir.heat`: wind, embers, flames — spec §2.27), `title3d` (the title backdrop: its own small renderer — `mountTitle3D(el)` / `unmountTitle3D()`, buildArena without players or ball, orbiting; menu.js `titleBg` / `titleBgOff`, navigate stops it), `vfxlab3d` (dev VFX lab: own renderer + OrbitControls + `createFx`; `mountLab` / `labPlay` / `labSet` / `labStats` / `labAdvance` (QA stepping); stops itself when its element leaves the page); `js/map3d/` — `map3d.mjs`
(entry: scene, terrain, the model sync, `api`), `mapcam3d` (camera + input: pan, zoom, click a point, fly to a pin / to you / over the island, follow the walk, the week-1 fence — T-272), `geo3d`, `avatar3d`, `pins3d`, `life3d`, `town3d`, `kit3d`, `nature3d`.

CSS (`css/`, loaded in this order): `style.css` (page base: tokens use, buttons, panels, glossary terms), `match.css` (the match screen and the dev VFX lab / panel; T-273), `career.css` (career screens layout: menu, create, cards,
sheets), `map.css` (island map frame, 3D overlay pins/labels, legend, hex tile labels), `hub.css` (hub HUD + shell: top bar, week
rail, day track, place panel; the layout grid `.acts`/`.rowcta`), `people.css` (People sheet), `theme.css` (the surface: colours, borders, shadows; the only `:root` token set). A selector may appear in several files; a property is declared
in one file only (T-084) — theme.css overrides by being last, so never repeat an earlier file's property there.

## How to add…

Each recipe names the one list to extend; keep the rest as it is (spec + task first, as always).

- **A venue** (§9.11): a `LOOK` entry (`js/render3d/venues/looks.mjs`), a case in `drawFloor` (`venues/floor.mjs`), a set builder
  `venues/<kind>.mjs` (helpers from `venues/kit.mjs`) and one line in `VENUE_SETS` + `ROWS` (venue3d.mjs). Matches pick it via
  `fx.venue` or `City.venue(run)` (`matchVenue`, match-screen.js). Presentation only: Math.random, never `R()`.
- **A place kind on the map** (§10.2): one `[test(id), build(run, id)]` entry in `PANELS` (career-panels.js), its card built with
  `placeCard`; the map side lives in MapModel / map3d. Anything else falls to `placePanel` (SPOTS places).
- **A weekly system** (§4.5): a `run => void` step appended to `WEEK_END` or `WEEK_START` (career/run.js). Append, never reorder
  (draw order → career goldens). Log what happened with `Run.log(run, text, k)`.
- **A beat act kind**: emit `{ k: 'myAct', … }` from the engine (no draws in presentation), add a method to one of the `ACTS_*`
  tables (render/acts.js) or a `startBeat` case (playback.js); the act-coverage test (engine.test.js) checks every kind has one.
- **A career match kind**: a builder in js/career returning a fixture `{ a, b, round, back, rel?, setup?, onFinish(m) → text,
onLeave }` (see Screens; `onLeave` only cleans up), opened by the UI with `watchCareer(fx)` or simmed with `simCareer(fx)` (career-match.js: Cup.simNow + the §10.6 result card for the hub's lock layer);
  log it with `Cup.record`.
- **A glossary term** (§9.4): one `GLOSSARY` entry (js/data/glossary.js: `short` alias, `glyph`, `icon` = a StatIcon key, `long` text); show it with `term(id, n)`
  (dom.js) — its long text appears once, in the tooltip and the Encyclopedia.
- **A team plan** (§2.26): one entry in `PLANS.atk` / `PLANS.def` (js/data/tactics.js: `name`, `short`, `desc`, `cost` + its
  knobs); the engine reads knobs through `atkPlan(m, side)` / `defPlan(m, side)` (plans.js) at the roll that owns them
  (serve.js, lanes.js, rally.js, rally-defense.js) — default `?? 1`, so other plans stay draw-identical. A playstyle's default: `PLAN_STYLE`.
- **A lane read rule** (§2.24): `laneRead` / `laneAim` (engine/lanes.js) with the numbers in `LANE` (tactics.js); record outcomes
  with `laneRecord` so the Coach panel (match-coach.js) shows them.
- **A venue's air** (§2.27): ambient3d.mjs `updateAmbient` by `kind` (`OUTDOOR` set: wind; else embers) and the crowd heat `Dir.heat`;
  tunables in `VFX.air` (js/data/vfx.js). Presentation only.
- **A director event / line** (§2.15, §2.18): push `{ kind, p?, q?, side? }` to `this.ev` in director.js (`beatLines` / `stageLine` /
  the point), add the kind to `MLINE_KINDS` (its priority) and `MLINES[kind]` + `MLINES[kind + '_reply']` (js/data/match-lines.js,
  5–6 lines per personality; lines.test.js checks them), and who speaks in the `switch (e.kind)` of the exchange picker.
- **A save field**: a plain default → one `RUN_DEFAULTS` entry `[make, valid]` (run.js; `Run.repair` fills old saves). A shape change
  → bump `RUN_VERSION` and add the migration from the previous version (run.js), and say so in the task (Save: bump).

## Engine flow

```
                              newMatch(a, b, record)   ◄─ in tests: mkTeams() ─► simBalance() (engine/teams.js, fixtures)
                                   │
                    playRally(m) ──┤ serve → receive (engine/serve.js) → rally(m, …) loop (engine/rally.js)
                                   │   uses Formula.* (engine/formulas.js)
                                   ▼
                              end(m, winner)  scoring, momentum, zone, captain's call, timeouts
```

- **One rally at a time**: `playRally(m)` plays a rally whole for every match; playback copies its beats (`rallyPull`). The
  in-rally decision points and one-press prompts (§2.13, §2.16) were removed (T-264); `m.human` (your player in a match you
  play, or the Monster game's Play as) marks your player; the captain's chips are gone too (owner, 2026-10-14).
- `rally()` (T-275) loops possessions: `possessionStart` (get-ups, the long-rally tire) → `setPhases(c)` (recover / free ball,
  setter or save-set, dump, set, attack choice, bad set over: `{ end }` or `{ s, h, a }`) → `attackPhases(c, …)` (fake set … dig);
  each possession ends `{ point }` or `{ next }` (`endOf`). `newMatch` builds its state from `matchTallies()`, `lineupOf(t)`,
  `rallyState()` and `matchPlans(m, opts)` — new per-match state (ace traits, AI memory §5.7) goes in the maker it belongs to.
- `rally()` runs one possession per loop turn through phases that take a possession context `c`
  (`{ m, B, V, atk, ds, pas, qual, … }`): `freeBall → pickSetter → setterDump → setHands → chooseAttack → badSetOver`
  (`engine/rally-phases.js`), then the approach / block formation (`formBlock`, `engine/rally-block.js`), the lane read and aim (`laneRead → laneAim`, `engine/lanes.js`) and the set / spike core inline in `rally.js`, then `block → dig`
  (`engine/rally-defense.js`). A phase returns `{ point: side }`, `{ next: [atk, pas, qual] }`, its values, or nothing.
  **Random rolls must stay in the same order** — the golden tests catch any change.
- Long phases read as named steps (T-204; each step takes the context `c`, the attack `x` and an accumulator, and draws in
  the original order): `playRally` = `rallyStart → serveWalk → serveToss → serveContact → serveFault | serveAim →
serveAce (servePopped | serveAceClean) | serveReceive`; `end` = `pointTally → pointMomentum → pointZone → elPoint →
pointBeats → subs / timeouts`; `formBlock` = `blockApproach → blockPick → blockMoves → blockCoverage (blockHands)`;
  `setBeat` = `setCallActs`, `setActs (blockJumpActs, blockPoseActs)`; `spikeActs` = `spikeZoom`, `spikeNote`;
  `block` = `blockBreak | blockStuff (blockCover | blockKill) | blockTouch | blockTool`; `dig` = `digSetup → digSave |
digPopped | digKill | digUp`. New rules (e.g. ace traits) hook into the step that owns the roll.
  `pickSetter` (T-054): the set point is rolled first, then the back-row setter sets; on a bad pass (quality 1, one setter) a free teammate takes the second
  ball only when the setter's time to the set point is over `SETTER.beat` (rules.js, 1.6) × the teammate's — a reach rule, no random in the choice. Engine-only
  record `m.setBy = [{ role, why: 'free' | 'reach' | 'none', qual, ts, tm }]` (like `m.scrLog`): `none` = no setter free (passer / busy; wit-weighted pick).
- `record = false` → pure simulation (fast; used for odds and preseason).
- `record = true` → `playRally` also returns **beats**: timed lists of acts such as
  `{k:'slide'}`, `{k:'jump'}`, `{k:'ball'}`, `{k:'burst'}`, `{k:'log'}`.
  The engine never draws; `render/playback.js` plays the beats.
- Adding a visual event: emit `{k:'myAct', …}` from the engine, add a handler to the right `ACTS_*` table in `render/acts.js` (or a tween in `startBeat`)
  (one-shot) or `startBeat()`/`applyBeat()` (tweened) in `render/playback.js`.

## Players and teams

- `createPlayer(spec)` — the one place that defines a player object (stats clamped 25–99).
- `mkPlayer(...)` — random player = `rollStats` + `rollWit` + `rollName` + look/moves → `createPlayer`.
- `finalizeTeam(t)` — leadership, captain, coach, shirt numbers, rating. Keeps values already set,
  so a hand-made player can be dropped into a roster and the team re-finalized.

## Effective stats and formulas

- `engine/stats.js` — what a player's stats are _right now_: wit × mood × momentum × stamina (`effP`, `effD`, `W`, `jumpPx`…). Stamina is tuned in `RULES.stamina` (`drain` per touch, `hit` = power/defense lost at 0, `jumpHit` = jump lost at 0): a hero who takes every touch tires first.
- `engine/formulas.js` — `Formula.*` holds the numbers that decide outcomes (serve, receive, set, spike,
  block, dig, kill chance). Balance changes and future training effects belong here. `Formula.level(p, act)` / `errK` /
  `bySkill` scale the error chances by the action's own stats (`SKILL.use`) (`SKILL` in data/rules.js, spec §2.1a); `blockSkill` (rally-defense.js)
  scales the stuff chance.

## Screens

**Playback state `A`** (one object per match, built by `startMatch` in match-screen.js; `null` off the match screen). Its
literal is the shape; other fields are created by the file that owns them:

| Group             | Fields                                                                                                                                                             | Owner                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Match             | `m`, `nm`, `fx`, `disp`, `bench`, `venue`, `stakes`, `done`, `hold`                                                                                                | match-screen.js, match-result.js                    |
| Beats and clock   | `beats`, `bi`, `el`, `ts`, `speed`, `paused`, `slowOn`, `slowK`, `sceneOn`, `freezeOn`, `_slowFx`, `fdt`, `rdt`, `rallyN`                                          | playback.js, clock.js, match-controls.js            |
| Ball              | `ball`, `srvId`, `bounce`, `bp`, `bv`, `mv`, `spin`, `wob`, `dribble`, `real`, `trail`, `trailPow`, `trailEl`, `trailOp`, `hand*`, `lastC`, `lastP`                | playback.js, ball.js, acts.js                       |
| Camera and scenes | `cam`, `shot`, `zc`, `zoom`, `digHero`, `preApp`, `preDig`, `sqT`, `cine`, `cineCool`                                                                              | camera.js, scenes.js, movement.js, acts.js, cine.js |
| Effects           | `parts`, `labels`, `lines`, `link`, `shake`, `flash`, `flashC`, `ptFlash`, `ghost`, `drill`, `crack`, `squash`, `netShake`, `wallFx`, `toBanner`, `cele`, `pointN` | effects.js, acts.js, match-result.js                |
| Crowd and bench   | `cheer`, `cheerAll`, `wave`, `chant`, `coaches`                                                                                                                    | effects.js, acts.js                                 |
| HUD               | `railTab`, `staShown`, `moodShown`, `buffShown`, `egShown`, `zoneShown`, `techPs`, `techCareer`, `techKeys`                                                        | match-controls.js, match-tech.js                    |

`menu`, `match`, `create`, `career`, `encyclopedia`, `vfxlab` — switch with `navigate(name, …args)`.
The match screen takes a **fixture** `{ a, b, round, court?, back, rel?, setup(m)?, onFinish(m) → message, onLeave() }`
(career Cup and league games, the Monster exhibition). There is no stand-alone tournament/betting mode.
Career fixtures (`Cup.fixture`, `Fight.clash`, `Fight.challenge`, approaches via `Asks`) fill everything but screens:
their `onLeave` only cleans up (`Eval.restore`). The UI opens them with `watchCareer(fx)` (career-match.js), which wraps
`onLeave` to return to the hub, or resolves them with `Cup.simNow(fx)`. js/career never calls `navigate`.

## Career mode

- `RUN` is the active run (`career/run.js`); saved to `KEYS.career` after every week (`teamToJSON`/`teamFromJSON` in `engine/save.js`).
- Stat guard: `fixStats(p)` (`engine/players.js`) makes every stat a finite number in [`STAT_FLOOR`, 99] (wit [0.1, 3]; non-finite → floor / 1), leaves in-range values exactly as they are and returns the count fixed. It runs in `teamFromJSON` (a damaged save; logs `DBG.log('warn', …)`) and in `newMatch` for both squads, so the engine never sees a negative, NaN or huge stat. A no-op for valid players: no draws, no golden change.
- **Season:** 28 weeks: monthly evaluations (weeks 4–24), camp (26–28), then the **U21 Final Cup** (`CUPS` in
  `data/career.js`, one entry, ×1.5 rewards; see "U21 Final Cup"). Every cup close ends the run. `Run.weekType` is 'cup'
  while `run.cup` is live.
- **Training depth** (`career/training.js`, `TRAIN_X`): facility Lv 1–5 by use, Hard option, same-training streaks,
  steeper diminishing returns, the training cap `TRAIN_CAP` 75 (no Limit Break), injuries
  when a session fails while exhausted (light training until healed, or the physio).
- **Story scenes** (spec §10.10): `career/story.js` `Story` plays `SCENES` (`data/story.js`) step by step — DOM-free, no
  randoms, state `run.story = {seen, flags, cur}`; `ui/story-box.js` draws the dialogue box (`storyBox` / `storyMounted`,
  called by `renderCareer`; hub cards and keys wait while a scene plays), `css/story.css`. Triggers: `start` (Run.create) and
  `hub` (renderCareer, with no scene / lock / event: `when` = a `STORY_WHEN` test, `off` = a cancelling flag; one scene a day via
  `run.story.at` = `Story.clock`), `result` (first hub after a match), `pick` (first click of a kind of place, `STORY_PICK`).
  Generated scenes carry their own steps on `cur.steps` (`Story.steps(cur)`): the squad introductions (`Story.joined(run, key)`
  from Run.create / World.join → `run.story.meet` → `Story.meet` at the next hub, id `meet:<key>`, lines from `MEET`). Lines fill `{role}` / `{key}` (`Story.text`); `goto` takes an index or a step `id`. The guide
  (spec §10.10a): `GUIDE` (data/story.js) is a person for the box's portrait (`Story.who('senior')`) and the map (`MapModel.guide`
  → map3d draws a second `createAvatar(scene, { kit })` — the default VRM, dressed — and pins3d its name label).
- **Named players** (spec §4.29): `career/stars.js` `Stars` seats `STARS` (`data/stars.js`: the rival, the cohort, the first
  aces) at Run.create (no randoms: fixed data + the clubs' own players), marks them `named` / `nkey` / `curve`, and
  `Stars.week` (from Growth.week) sets their stats to the authored curve each week. World.transfers / promote and
  People fates / poach skip `named`; Growth.grow skips their breakthrough roll. `MapModel.figures(run)` lists every person
  drawn as a full model (Fern + the named): map3d keeps one `createAvatar(scene, { kit })` per figure id.
- **Two seasons** (spec §4.28, `career/season.js` `Season`): Story plays year 1 and year 2 (`run.year`); `run.week` is the week of
  the season. The year-1 Cup's `Cup.close` calls `Season.rollover` instead of `Cup.end`: `Season.offseason` (the first aces age
  out, transfers, a summer of Growth.week), stored week stamps rebased by −`SEASON.shift`, week 1 again. `Season.wk(run)` (the week
  from the run's start) seeds weekly hashes and the story clock; `Season.cal` adds the year-2 rematch week (an evaluation of kind
  `rematch`, `Eval.rematch`); `Season.at` labels a rebased stamp. Year 2: `STARS.year2` curves, `PEOPLE.year2` slows the field,
  `Cup.placeRival` / `splitRival` put her squad in the other half of your bracket; `run.result.ending` 'true' | 'spite'.
- **Drive & Pain** (spec §4.30, `career/feel.js` `Feel`, data `FEEL`): two hidden bars in `run.feel` filled from Training.train,
  `Cup.record` (every match: `Feel.result`), World.join, refusals, hurtful scenes (`Story.finish` → `Feel.scene`) and mood streaks
  (WEEK_END). Drive at the top → `run.fired` matches with a whole-match `m.buff` on you (`Feel.match` in the fixture's setup) and
  training × `FEEL.fired.train`; Pain at the top → a Scar. Never shown: diary cues (`FEEL_LINES`), the portrait ring.
  **Sparks and Scars** (T-291): `Feel.spark` / `Feel.scar` roll on `hstr` (`Feel.roll`: pseed + the week), into `run.sparks` (ids) /
  `run.scars` ({ id, y, w, seen }); `Feel.sync` writes `you.traits` (the engine reads only `p.traits` — bars.js `trBuff` in
  `stageBuff`, `trWit` in W, `trServeErr`, `trHeal`, `morKeep`, `trPoint`; a hook that acts marks `m.trAct[pid][id]`); `Feel.name`
  (from Feel.result) names a hidden Scar after the first match it acts in. Special VFX: `specialFx(p, kind)` (render/effects.js).
- **Secret places** (spec §4.31, `career/secret.js` `Secret`, data `SECRET`): SPOTS with `secret` (road nodes like any place) are
  hidden (MapModel.known, City.can) until `Secret.known` (Fern's goodbye flag `secrets`, a street win, fans). City.day hands their
  acts to `Secret.day`; the night games and the Old Scout's sims run on a seeded stream (`Secret.isolated`), never the run's.
  The Tape Room's facts (`Secret.habits`: true engine numbers) show on the Plan board against her (`boardHabits`).
- **Sponsors** (`career/sponsors.js`; the coach's goal was removed in T-170, spec §10.1b): sponsors make offers at fan milestones (a `pre` event shown before the week's choice) with a perk kept while a
  condition holds.
- **Matches** (`career/cup.js`; street battles, the Raid order (`Fight.raid`, T-318), challenges, loss and injury are `Fight` in `career/fight.js`): an S–C grade from your own line scales that match's rewards; a pre-match focus goal;
  a captain's team talk before Cup matches (applied in `Cup.prepare` and the fixture's `setup(m)` hook).
- Content is data: `data/career.js` (numbers, trainings, calendar, cups, rewards, ranks, unlocks, sponsors, modes),
  `data/skills.js`. The only event cards are the Element Trial, sponsor offers and the gift chance (`Gifts.ask`, spec §4.35), built in `Events.def` (the random training events were removed, owner 2026-10-05).
- Skills reach the engine only through `skillMod(p, key)` and bonds through `bondCombo(a, b)` (`engine/skills.js`);
  both are neutral for normal players and draw no random numbers.
- Skills in the shop vs in play (T-036): basic skills (no `tech`) are bought with skill points (`Skills.learn`); techniques can't be
  (`canLearn` is false for them). `Skills.tryLearn(run, m)` runs after a match you played (`Cup.result`): per technique of your role you
  don't own, one roll (`LEARN`: by doing a stat-line threshold, else by facing an opponent who played and has it; chance × wit ×
  the match gap factor, ≤ 0.5), at most one per match. Techniques still fire by stats via `hasTech`. Scouting shows them
  (`Skills.techs`; dossier roster `techs`, hidden until scouted).
- Technique switches (spec §9.10, T-178/T-179): `knowsTech(p, id)` = owns it; `hasTech` = knows it and not `techHeld` —
  held = in `CM.off[p.id]` (a Set) while the match runs. `newMatch` seeds `m.off` from each player's `p.techOff` (your
  career choice, saved on your player; absent = none) and `setTechOff(m, pid, id, off)` flips it mid-match (from the next
  rally: every technique is checked when its play happens). Every firing site calls `techFire(m, p, id)` →
  `m.techUse[pid][id] = { n, won, err }` (won / err settled in `end()` from the rally winner and `m.errBy`). No extra
  draws; a held technique skips its own roll, so nothing off = the same match. `SKILLS[id].trade = { up, down? }` holds
  the switch row's copy. UI: match rail Tactics tab (`techSection` / `flipTech`, keys T and 1–9, `#tacbtn` badge),
  Match prep `prepTechRow` peek (`prepTech`), result screen `Held back:` (`resultData.held`).
- No meta progression: every career starts the same (free agent, every stat at `CAREER.start` = 1, wit `witBase`, `staMax`; no creation points — T-055); challenge modes (`MODES`) are plain options. Modes (T-067): `run.mode.story` (default true, save v9; `MODES.story` / disabled `endless`) — in Story the U21 Final Cup always holds you: `Cup.place` forces you into your faction's first squad (over its weakest same-role player), an Academy member plays the Academy entrant, and a player alone gets the `Cup.crew` entrant (a hired street crew stored as `run.reserve.street`, built on a seeded side stream so main draws don't shift); `Run.lineup(…, forceYou)` makes you start every cup match (injury still benches you); a Story champion is called up (`Cup.calledUp`).
- UI: `ui/icons.js` draws the active (bolt + type) / passive (aura) skill icons used in the shop, player card and
  encyclopedia; the result screen has a season growth chart from `run.hist`.

## Code layout notes

Playback is split into classic scripts loaded right after js/render/playback.js: clock.js (world clock `timeScale`,
the rAF loop `frame`, the stall watchdog), camera.js (push-ins), ball.js (net clearance, follow, bounce, trail),
scenes.js (banner, subtitle line, tap-to-skip). Tooling: `npm run lint` (ESLint flat config that collects the shared
classic-script globals from index.html), `npm run format` (Prettier, .prettierrc.json), `npm test`.

## Performance

The court canvas is sized to CSS size × device pixels within a budget (`COURT_PX`, 2.4 MP — fullscreen on a
high-DPI screen would otherwise be 6–8 MP a frame), and the 3D view renders at a dynamic fraction of it (`adaptRes`
in r3d: steps down to 0.55 when frames run under ~50 fps, back up when there's headroom). `matchState()` reports both.

## Robustness

The frame loop re-schedules itself before doing any work and catches errors from `step()`/`draw()`, so one bad frame can
no longer freeze the game; a beat that fails 20 frames in a row is skipped. `watchdog()` logs a stall when play stops
moving for 6 s (25 s while the 3D players load) or one beat lasts 20 s, with a snapshot from `matchState()`.

## Saves

Career runs carry `v` (`RUN_VERSION` = 23, `career/run.js`; key `sns_run_v1`; v23 = `run.tenure` (the absolute week you signed with
your club) and `run.ex` (id → the absolute week you left them; team life, spec §4.36 — RUN_DEFAULTS), older saves dropped; v22 = `p.gifts` on every NPC (+ `p.el2` / `p.sig2`,
`p.woke`; `run.people[id].known.gifts`; `run.gifts` / `run.giftAsk` (RUN_DEFAULTS); spec §4.35), older saves dropped; v21 = `run.war` (the war units' Strength, spec §4.34), `run.hex` dropped; v20 = your body `you.body` (+ `floor` / `edge` / `synced`) and body-key XP banks in `run.xp`; older saves dropped; v19 = `run.year`). History: v2 faction reserves, v3 cup
entrants, v4 squads of 6 (`bench`), v5 `run.lb` dropped, v6 `run.met` / `street` / `refused`, v7 `losses` / `lastFight`,
v8 `mlog`, v9 `run.mode.story`; older saves are dropped (`RUN_MIGRATIONS` is empty). Bump the version when the save shape changes and add a step to
`RUN_MIGRATIONS[oldVersion] = data => upgraded data`; `Run.load` applies the steps in order and ignores saves from a newer version.
Plain-default fields live once in `RUN_DEFAULTS` (run.js: name → `[make, valid]`): `Run.create` starts from
`Run.defaults()` and `Run.repair` refills any field a save lacks or holds broken, then repairs the run-dependent ones
(`academy`, `eval` + `Eval.setup`, `spotQ` via `City.roll`, `fog`, `clash`, `sta`, `mode`, `Feel.sync` → `you.traits` from
`run.sparks` / `run.scars`). Add a new simple field to
the table only. `run.grades` (your match grades, newest last) is capped at `MLOG.max` like `run.mlog`.

## Testing

`node tests/run.js` — no dependencies (`--quick` skips the tests marked `test.slow`; `--update` re-records the goldens,
only from a fully green, non-quick run). `tests/harness.js` loads the headless scripts (core, data, engine, career) into a
`vm` context with a seeded `Math.random` and an in-memory `localStorage`, and holds the runner, `goldenCheck` and
`playRun`. The tests live in area files: `engine.test.js`, `career.test.js`, `map.test.js`, `cup.test.js`. Tests cover:

- **golden** engine output (teams, recorded matches incl. beats, simulated matches, monster teams) → `tests/golden.json`;
- rally invariants over 300 matches and that every beat act kind has a renderer handler;
- data integrity (skills, calendar), full career runs, save round-trip, save migration.

A deliberate gameplay change updates the golden file with `node tests/run.js --update` — review the diff first.
Pure refactors must pass **without** `--update`.

### Match history (T-052)

`Cup.record(run, m, kind, extra)` (cup.js) pushes one plain entry onto `run.mlog` (save v8; trimmed to `MLOG.max` = 80, oldest dropped) for every match you are in:
it is called at the start of `Cup.result` (kind `eval` | `cup`, + `round`), `Fight.challengeResult` (`challenge`, + `stake`) and `Fight.clashResult` (`street`), i.e. before
`Growth.matchXp`, so `you` (OVR + the 5 stats) is the kick-off state. Entry: `{ week, day, kind, vs, short, score: [yours, theirs], win, grade (null if you did not play),
played, you, line: { k, att, err, blk, ace, dig, ast }, box: [{ name, role, side, ovr, k, att, err, blk, ace, dig, ast, you? }] }` — numbers and strings only, no player or team
refs. `matchLog(run)` (sheet-season.js) lists them newest first, each a `fold` (`ml<index>`) with your snapshot (change vs your previous entry), your line and the box score;
the Season sheet shows it (`sheetSeason`). `Run.repair` adds `mlog` to older saves of the same version (RUN_DEFAULTS).

### Start from 1 (T-055)

`Run.create` gives your player `CAREER.start` (1) in every stat and `CAREER.witBase` (1.0) wit; creation (career-create.js) keeps role / name / modes and shows the stats as plain numbers (no allocation, no wit stepper). `CAREER.statMin` (1) is the floor of
`Run.bump` (events, injuries). `createPlayer` clamps stats to `STAT_FLOOR` (1, players.js); generated players still never go below 25 (`rollStats`). NPC generation and every engine formula are unchanged (goldens untouched). Save shape unchanged (RUN_VERSION 8).

## Feature notes → ARCHITECTURE-details.md

The deep notes per feature live in **ARCHITECTURE-details.md**; read only the section for the code you touch, and update
that section (or add one) when you change its structure. Sections: 3D renderer (js/render3d/) · Net clearance and errors · Deflections and ball speed · Elements · Slow motion and staged scenes · Block formation · Ego (T-068, spec §2.12) · Substitutions · Blocks · Far digs (playback) · Spike approach (playback) · Pre-serve routine · Career world (P1) · Team shape (squads of 6) · Faction pools · NPC careers (T-060, spec §4.23 A) · Evaluations · U21 Final Cup · Faction dossier · Island map (training weeks) · Possession paths and touch counts · World layout (T-045) · Rankings · Team challenges · Training XP · Career hub UI · Match music · UI motion (spec §9.12, T-216–T-219) · Sparks and Scars (spec §4.30, T-291) · Gifts (spec §4.35, T-320).
