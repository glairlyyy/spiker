# Spite & Spike (working title) — project instructions

4v4 volleyball RPG in the browser (three.js + VRM players), built from the Skyline Cup prototype. No build step.
Published as a claude.ai artifact: https://claude.ai/artifact/4xfGDd92rAanHyThVxfr3X (republish to the same URL).
Code home: https://github.com/glairlyyy/spiker (branch main). Containers are temporary: clone, work, push.

## Docs — read in this order
- `CLAUDE.md` (this file) — how to work: workflow, commands, rules that bite, QA, publishing. Stable.
- `spec.md` — WHAT the game is: current feature state, locked decisions, open questions, out of scope. Source of truth.
- `tasks.md` — the work queue: small tasks with files, acceptance criteria, test impact.
- `lore.md` — the hidden truth (setting, history, factions) and the voice list every in-game string must use.
- `ARCHITECTURE.md` — HOW the code is built: layers, engine flow, renderer, saves, testing.

## Workflow (spec-driven, two chats)
- **Spec chat** (owner + planner model) writes `spec.md`, `lore.md` and `tasks.md`. It does not write game code.
- **Build chat** (implementer model) writes code, keeps `ARCHITECTURE.md` current, and ticks tasks. It does not
  edit `spec.md`, `lore.md` or add/reword tasks; it may only change a task's status line and its `Result:` / `Question:` lines.

Exactly one build chat works at a time (no parallel implementers, so no merge conflicts).

**Sync (the build chat has no GitHub access):** the artifact is the hand-off. The build chat starts from the artifact
(or its own container if it has the latest), works, and publishes every changed file to the artifact. It never
pushes. The spec chat pulls the changed files from the artifact, reviews them, runs tests, commits and pushes to
GitHub, then publishes its doc changes (spec.md, tasks.md, lore.md, CLAUDE.md) back to the artifact. So before each
task the build chat re-reads `tasks.md` and `spec.md` **from the artifact** (Artifact read, `paths`), not from git.

**Owner requests made directly in the build chat** (not in tasks.md) are fine: do them, then list them under
"## Unplanned changes" at the end of tasks.md (one line each: what, which files) so the spec chat records them.

Build chat loop, one task at a time:
1. Read `tasks.md` from the artifact; take the first `[ ]` task under **Now**, then under **Next** (unless the owner
   names one). Mark it `[~]`.
2. Read the spec sections it cites. Touch only the files it lists. Follow its **Do not** list.
3. Stop and ask (mark `[?]`, write `Question:` in the task, tell the owner) instead of guessing when:
   the task needs an unlisted file, a new top-level global, a new beat act kind, a save-shape change, a golden-hash
   change the task doesn't state, or the spec is ambiguous/contradicts the code.
4. `npm test` and `npm run lint` must pass. Golden hashes change only if the task says **Goldens: update** (then
   `npm run test:update` and give the reason in the commit). Run the QA recipe when the task touches render/UI.
5. Update `ARCHITECTURE.md` for structural changes (new file, new layer contract, new save field).
6. Mark `[x]` and fill the task's own `Result:` line (only that line — never rewrite or re-insert other text; edit
   tasks.md with a targeted replace, never by regenerating the file): one line, deviations and QA numbers. One local commit per task: `T-012: <title>`.
7. Publish the changed files to the artifact (see Publishing). Reply to the owner in one or two lines.

## Working style (owner preferences)
- Ultra-concise replies, no preamble or recaps; only raise real concerns.
- Targeted edits, not rewrites. Max one clarifying question; assume reasonably — except the stop-and-ask cases above.

## Commands
- `npm install` once after cloning.
- `npm test` — headless tests (tests/run.js). Golden hashes guard engine output.
- `npm run test:update` — only when the task says Goldens: update.
- `npm run lint` / `npm run format` — ESLint (flat config collects shared globals from index.html) / Prettier.
- `npm run serve` — http://localhost:8765 (index.html = CDN three; test3d.html = local node_modules, for QA).

## Layout
- `js/core` storage, rng, debuglog (DBG, copyable debug log). `js/data` constants (rules, skills, elements, dialogue, career, city, world).
- `js/engine` pure simulation, no DOM: match/serve/rally(-phases/-defense) emit **beats** (timed act lists);
  formulas, elements (per-player element gauge + element spikes), hype (staged scenes, chatter; presentation only).
- `js/render` playback of beats (playback, clock = world time scale / rAF loop, camera, ball, scenes, overlay drawing).
- `js/render3d` ES modules: r3d (entry, per-frame draw, dynamic resolution), units3d, arena3d, camera3d (game camera,
  scene shots, P3D), actors3d (posing players/coaches, trails, auras), players3d (VRM load/dress), poses3d, fx3d, trails3d.
- `js/career` career run (28 weeks, training, events, Element Trial, city/front/world, map model, saves).
- `js/ui` screens (menu, create, career hub/map/week/dossier/end, match, encyclopedia), dom helpers (esc, tip/info/fold/pop).
- Island map = 3 layers: rules (`js/career/city.js` City, `front.js` Front) → `js/career/mapmodel.js`
  MapModel.build(run, sel) (plain data) → `js/ui/map-view.js` MapView → three.js renderer `js/map3d/` (mount(el, model,
  {pick, point}) / update(model) / select(id) / dispose(); avatar3d.mjs = the walking player). Panels (`js/ui/career-map.js`) only talk to City/MapModel/MapView.

## Rules that bite
- Classic scripts share one global scope (index.html order). Grep repo before renaming/removing a top-level name.
  New script files go in BOTH index.html and test3d.html.
- Seeded randomness: never change the order/count of R()/rnd()/pick() draws in engine unless the task says so
  (golden changes). Presentation code (hype, element assignment hash, chatter) must draw no randoms.
- Beat act kinds/flags are the engine↔renderer interface; every act kind needs a `case` in playback.js (tested).
- Saves: RUN_VERSION 3 (v3: U21 cup entrants), key sns_run_v1. In development, breaking changes just bump the version (task will say).
- Artifact host quirks: confirm()/alert() blocked (use inline confirms); localStorage may throw; blob: URLs may be
  blocked (textures are decoded in memory — keep it that way).
- Escape all user/data strings in innerHTML with esc().
- Desktop-only UI for now; don't spend effort on mobile layouts.

## QA recipe (Playwright, Chromium preinstalled — never `playwright install`)
Launch with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, open test3d.html, `startMonster()`,
wait for `typeof R3D !== 'undefined' && R3D && A && !A.hold` (R3D is a `let`, not on window), set `A.hold=true`,
loop `step(16); R3D.poseAll(0.016)`; check pageerror + `DBG.text()`; screenshot the page (element screenshots of
`#stage` time out: it never settles). A STALL line after long synchronous loops is a test artifact.
For career/UI tasks: start a new run from the menu instead of `startMonster()` and exercise the changed screen.

## Publishing (artifact = backup + playable copy)
The artifact holds the full project as published files (index.html, js/, css/, tests/, docs, package.json, assets/audio,
lint/format configs, test3d.html, qa_poses.html; VRM base in assets/vrm). Publish every changed file each time so
it stays complete. Dotfiles are published renamed: `.prettierrc.json` → `prettierrc.json`, `.prettierignore` →
`prettierignore.txt`. Restore without GitHub: Artifact "list" (scope "files", url above) → "read" with all `paths`.
