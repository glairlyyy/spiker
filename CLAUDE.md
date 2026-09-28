# Spite & Spike (working title) — project instructions

4v4 volleyball RPG in the browser (three.js + VRM players), built from the Skyline Cup prototype. No build step.
The game design doc (GDD) is the target; the old Skyline Cup career/modes are not kept (no save compatibility).
Published as a claude.ai artifact: https://claude.ai/artifact/4xfGDd92rAanHyThVxfr3X (republish to the same URL).

## Working style (owner preferences)
- Ultra-concise replies, no preamble or recaps; only raise real concerns.
- Targeted edits, not rewrites. Max one clarifying question; assume reasonably.
- Plan first only when asked ("plan first"); otherwise implement, verify, publish.

## Commands
- `npm test` — 18 headless tests (tests/run.js). Golden hashes guard engine output.
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
- City map (training weeks): day action at a place + one evening outing (dinner/arcade/street hustle/scout HQ/sleep);
  faction districts, home-turf training bonus. Story is skipped for now.
- Career hub UI: full-screen draggable map (panzoom, vendored in js/vendor — lint/prettier ignore it) with HUD
  overlays, shortcut dock → drawers, cards over the map. 3D map (three.js) decision deferred.
- Open work: scene frequency tuning (Normal ≈ 6–7 per match).
