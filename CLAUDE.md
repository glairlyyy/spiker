# Spite & Spike (working title) — project instructions

4v4 volleyball RPG in the browser (three.js + VRM players), built from the Skyline Cup prototype. No build step.
The game design doc (GDD) is the target; the old Skyline Cup career/modes are not kept (no save compatibility).
Published as a claude.ai artifact: https://claude.ai/artifact/4xfGDd92rAanHyThVxfr3X (republish to the same URL).

## Where the code lives
- Backup / playable copy: the artifact above holds the full project as published files (index.html, js/, css/, tests/,
  CLAUDE.md, ARCHITECTURE.md, package.json, lint/format configs, test3d.html, qa_poses.html; VRM base in assets/vrm).
  List: Artifact action "list", scope "files", url above. Restore: Artifact action "read" with `paths` (all listed
  paths), copy into a folder, `npm install`. Dotfiles are published renamed: `prettierrc.json` → `.prettierrc.json`,
  `prettierignore.txt` → `.prettierignore`. Publish every changed file each time so the artifact stays complete.
- GitHub: https://github.com/glairlyyy/spiker (branch main) — the code's home once pushed; clone it to start a session.
- Working copy in cloud sessions: /home/claude/work/sc3d (git, remote origin = the repo above; the container is temporary).

## Working style (owner preferences)
- Ultra-concise replies, no preamble or recaps; only raise real concerns.
- Targeted edits, not rewrites. Max one clarifying question; assume reasonably.
- Plan first only when asked ("plan first"); otherwise implement, verify, publish.

## Commands
- `npm test` — 20 headless tests (tests/run.js). Golden hashes guard engine output.
- `npm run test:update` — only for intentional gameplay changes; say why.
- `npm run lint` / `npm run format` — ESLint (flat config collects shared globals from index.html) / Prettier.
- `npm run serve` — http://localhost:8765 (index.html = CDN three; test3d.html = local node_modules, for QA).

## Layout
- `js/core` storage, rng, debuglog (DBG, copyable debug log). `js/data` constants (rules, skills, elements, dialogue, career).
- `js/engine` pure simulation, no DOM: match/serve/rally(-phases/-defense) emit **beats** (timed act lists);
  formulas, elements (per-player element gauge + element spikes), hype (staged scenes, chatter; presentation only).
- `js/render` playback of beats (playback, clock = world time scale / rAF loop, camera, ball, scenes, overlay drawing).
- `js/render3d` ES modules: r3d (entry, per-frame draw, dynamic resolution), units3d, arena3d, camera3d (game camera,
  scene shots, P3D), actors3d (posing players/coaches, trails, auras), players3d (VRM load/dress), poses3d, fx3d, trails3d.
- `js/career` career run (28 weeks, two cups, training, events, Element Trial, goals/sponsors, Legacy/Hall of Fame, saves).
- `js/ui` screens (menu, create, career, match, encyclopedia, legacy), dom helpers (esc, tip/info/fold/pop).
- Island map = 3 layers, kept apart for a future three.js map: rules (`js/career/city.js` City, `front.js` Front) →
  `js/career/mapmodel.js` MapModel.build(run, sel) (plain data: land, pins + flags, seized, fog, you, flag) →
  renderer `js/ui/map-svg.js` MapView (contract: mount(el, model, {pick, point}) / select(id) / dispose()). Panels and
  actions (`js/ui/career-map.js`) only talk to City/MapModel/MapView. A new renderer replaces map-svg.js only.
- ARCHITECTURE.md — detailed design notes; keep it updated with structural changes.

## Rules that bite
- Classic scripts share one global scope (index.html order). Grep repo before renaming/removing a top-level name.
  New script files go in BOTH index.html and test3d.html.
- Seeded randomness: never change the order/count of R()/rnd()/pick() draws in engine unless intended (golden changes).
  Presentation code (hype, element assignment hash, chatter) must draw no randoms.
- Beat act kinds/flags are the engine↔renderer interface; every act kind needs a `case` in playback.js (tested).
- Saves: fresh format (RUN_VERSION 1, key sns_run_v1). While in development, breaking changes may just bump the version.
- Artifact host quirks: confirm()/alert() blocked (use inline confirms); localStorage may throw; blob: URLs may be
  blocked (textures are decoded in memory — keep it that way).
- Escape all user/data strings in innerHTML with esc().

## QA recipe (Playwright, Chromium preinstalled — never `playwright install`)
Launch with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, open test3d.html, `startMonster()`,
wait for `typeof R3D !== 'undefined' && R3D && A && !A.hold` (R3D is a `let`, not on window), set `A.hold=true`, loop `step(16); R3D.poseAll(0.016)`; check pageerror + `DBG.text()`;
screenshot the page (element screenshots of `#stage` time out: it never settles). A STALL line after long synchronous loops is a test artifact.

## Feature state (decisions so far)
- Match: one set to 15 (win by 2), court ×1.5, zone/captain buffs/timeouts, tactics, techniques, pop-ups, long back attack.
- Elements: per player, hidden; unlocked for OP, ~1/4 stars, career player via Element Trial. Gauge fills by element
  play; full gauge or captain buff → next attack is the signature element spike. Counters halve effects.
- Hype (setting Off/Normal/Max, tap to skip): attack build-up scenes, blocker read mid-jump (only if a block is
  attempted), block-break spike cut + ball close-up, kill-block scene, loose-ball slow-mo calls, personality chatter.
  No manga panels. Slow-mo uses one world clock (A.ts) with eased ramps.
- Blocks: stuff odds = full-strength block vs spike, weighted by coverage; ~14% of attacks stuffed in normal play.
- Menu: one game (Spite & Spike) + a dev Playtest card (Monster game, startMonster()). UI is compact: details in tooltips/folds.
- Career world (P1): free-agent start, faction join conditions, money/housing/paydays, league transfers, Gazette,
  Sim ⏭ button to skip a match before playing. Calendar stays 28 weeks; character creation rework later.
- Island (training weeks): 3 majors (Wei city north+east, Wu = east/south beach + a strip inland, Shu highlands west; no unclaimed land except the neutral Sacred Shrine Park = region `open`) + borderless minors; 2 squads per major + 2
  minor clubs = 8 teams. Regions set prices/quality (Wei pricey, maybe overhyped; Shu cheap, maybe a gem; Wu sand =
  technique). You stand at a map point (`run.pos`, start at the airport); hotels away from home. The map is dark except
  around points you've stood on (`run.fog`, REVEAL_R); click any land to travel there. A week = 7 days: every action
  (train/rest/outing/scout) takes a day + the trip by distance (free within NEAR_R, 1 day / TRIP_DAY, max 3); nothing may spill over; night at 0 days; only the player ends the week;
  one event roll per week. Street battles (CLASH, ~45% of training weeks, popup at week start): watch (scouts both
  sides) or fight for a side (win +standing / lose −; the other side always −). `run.rep` = standing per region.
  Faction dynamics (js/career/front.js, FRONT): Wu most aggressive (+revenge); every battle (joined or settled at
  week end) pushes its border meter; 2 net wins seize a border place (2 per side per border; retakes first) → owner's
  price/turf/colour; a faction with 2 lost is weakened (dearer, worse facilities, easier to join). Minors not in it. Day sessions give DAY_GAIN (0.25) of the old weekly gain. Story skipped for now.
- Career hub UI: full-screen draggable map (panzoom, vendored in js/vendor — lint/prettier ignore it) with HUD
  overlays, shortcut dock → drawers, cards over the map. 3D map (three.js) later: implement the MapView contract.
- Seized border places show as a patch in the holder's colour; border polygons don't redraw yet.

## Direction & pending decisions (owner)
- Lore first: the owner is mapping out the game lore; lore-driven mechanics (what standing unlocks, club switching,
  story events, faction flavour) wait for it. Until then work on fundamentals.
- Portraits: career faces are still generated 2D (faceSVG). Undecided: 3D VRM head snapshots vs hand-made 2D anime
  portraits (every unique character mapped by hand, with its own model + portrait); Live2D (pixi-live2d-display) or
  video loops (WebM / animated WebP) possible for special characters at big moments. Build nothing until decided;
  when built, keep portraits behind one call (e.g. Portrait.show(el, character, mood)) so the kind can vary per character.
- Skipped for now: founding your own club (team building); minor factions in the faction war.
- Candidate next work: balance pass (7-day week × DAY_GAIN × fees × faction prices × paydays, via headless season
  sims), standing effects, leaving/switching clubs, scouting → match edge, moving borders, three.js map (MapView
  contract), new-run setup + results screens, Legacy/Hall of Fame keep-or-drop.
- Open work: scene frequency tuning (Normal ≈ 6–7 per match).
