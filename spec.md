# Spite & Spike — spec

Owned by the spec chat. The build chat reads it, never edits it. Section ids (`§2.3`) are what tasks cite.
Status tags: **[built]** in the code now · **[locked]** decided, not built · **[open]** undecided — do not build.

## 1. Vision
- 4v4 volleyball RPG / sports-life sandbox on a faction-ruled island. The player starts as a free agent, joins
  factions, trains, and plays watch-only 3D matches with a 2D interface. Spite-driven story (later, lore-first).
- Built from the Skyline Cup prototype; old Skyline career/modes are not kept (no save compatibility).
- Desktop-only UI for now. Compact UI: details live in tooltips/folds.

## 2. Match (engine + 3D playback) [built]
- §2.1 Rules: one set to 15, win by 2; court ×1.5; zone/captain buffs, timeouts, tactics, techniques, pop-ups,
  long back attack.
- §2.2 Elements: per player, hidden; unlocked for OP, ~1/4 of star players, and the career player via the Element
  Trial. Gauge fills by element play; full gauge or captain buff → next attack is the signature element spike.
  Counter elements halve effects.
- §2.3 Hype (setting Off/Normal/Max, tap to skip): attack build-up scenes, blocker read mid-jump (only if a block is
  attempted), block-break spike cut + ball close-up, kill-block scene, loose-ball slow-mo calls, personality
  chatter. No manga panels. Slow-mo uses one world clock (A.ts) with eased ramps.
  Target: Normal ≈ 6–7 scenes per match **[open: tuning pending]**.
- §2.4 Blocks: stuff odds = full-strength block vs spike, weighted by coverage; ~14% of attacks stuffed in normal play.

## 3. Menu [built]
- One game (Spite & Spike) + a dev Playtest card (Monster game, `startMonster()`).

## 4. Career world [built unless tagged]
- §4.1 Start: free agent; join factions through join conditions; money, housing, paydays, league transfers,
  Gazette; Sim ⏭ button to skip a match before playing it. Calendar: 28 weeks (for now).
- §4.2 Island: 3 major factions — Wei (city academy; north + east), Wu (beach/coast; east/south + an inland strip;
  most aggressive), Shu (mountain highlands; west) — plus borderless minor factions. No unclaimed land except the
  neutral Sacred Shrine Park (region `open`). 2 squads per major + 2 minor clubs = 8 teams.
- §4.3 Regions set prices/quality: Wei pricey (maybe overhyped), Shu cheap (maybe a hidden gem), Wu sand = technique.
- §4.4 Movement: the player stands at a map point (`run.pos`, start at the airport); hotels when away from home.
  Map is dark except around visited points (`run.fog`, REVEAL_R). Click any land to travel.
- §4.5 Week: 7 days. Every action (train/rest/outing/scout) costs 1 day + trip by distance (free within NEAR_R,
  1 day per TRIP_DAY, max 3). Nothing spills into next week; a night costs 0 days; only the player ends the week.
  One event roll per week. Day sessions give DAY_GAIN (0.25) of the old weekly gain.
- §4.6 Street battles (CLASH, ~45% of training weeks, popup at week start): watch (scouts both sides) or fight for a
  side (win +standing / lose −; the other side always −). `run.rep` = standing per region.
- §4.7 Faction war (`js/career/front.js`, FRONT): every battle (joined or settled at week end) pushes its border
  meter; 2 net wins seize a border place (2 per side per border; retakes first) → owner's price/turf/colour.
  A faction with 2 places lost is weakened (dearer, worse facilities, easier to join). Wu gets a revenge bonus.
  Minor factions are not in the war. Seized places show as a patch in the holder's colour; borders don't redraw
  **[open: moving borders]**.
- §4.8 Hub UI: full-screen draggable map (panzoom) with HUD overlays, shortcut dock → drawers, cards over the map.
- §4.9 Map architecture: rules → MapModel → MapView (see CLAUDE.md Layout). A three.js island map **[locked, later]**
  replaces only `map-svg.js` by implementing the MapView contract.

## 5. Open questions — do not build until decided
- §5.1 Lore: owner is writing it. Waits on it: what standing unlocks, club switching, story events, faction flavour.
- §5.2 Portraits: now generated 2D (`faceSVG`). Options: 3D VRM head snapshots, or hand-made 2D anime portraits
  (unique characters mapped by hand with own model + portrait); Live2D (pixi-live2d-display) or video loops
  (WebM / animated WebP) for special characters at big moments. When built: one call,
  `Portrait.show(el, character, mood)`, so the kind can vary per character.
- §5.3 Legacy / Hall of Fame: keep or drop.
- §5.4 Character creation rework (deferred).

## 6. Out of scope for now
- Founding your own club (team building). Minor factions in the faction war. Ghost PvP. Mobile layout.

## 7. Backlog (candidates — become tasks only when specced)
- Balance pass: 7-day week × DAY_GAIN × fees × faction prices × paydays, measured with headless season sims.
- Standing effects; leaving/switching clubs (needs §5.1); scouting → match edge; moving borders.
- three.js island map (§4.9). New-run setup + results screens. Hype scene frequency tuning (§2.3).
