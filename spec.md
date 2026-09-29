# Spite & Spike — spec

Owned by the spec chat. The build chat reads it, never edits it. Section ids (`§2.3`) are what tasks cite.
Status tags: **[built]** in the code now · **[locked]** decided, not built · **[open]** undecided — do not build.

## 1. Vision
- 4v4 volleyball RPG / sports-life sandbox on a faction-ruled island. The player starts as a free agent, joins
  factions, trains, and plays watch-only 3D matches with a 2D interface. Spite-driven story (later, lore-first).
- Built from the Skyline Cup prototype; old Skyline career/modes are not kept (no save compatibility).
- Desktop-only UI for now. Compact UI: details live in tooltips/folds.
- Setting, history, factions and narrative voices: `lore.md` (hidden truth). Goal: win the U21 league → the major
  nation's national team (international career).

## 2. Match (engine + 3D playback) [built]
- §2.1 Rules: one set to 15, win by 2; court ×1.5; zone/captain buffs, timeouts, tactics, techniques, pop-ups,
  long back attack.
- §2.2 Elements: per player, hidden; unlocked for OP, ~1/4 of star players, and the career player via the Element
  Trial. Gauge fills by element play; full gauge or captain buff → next attack is the signature element spike.
  Counter elements halve effects. Fiction: lore.md §2 (the Trial is the modern method; the ritual is forgotten).
- §2.3 Hype (setting Off/Normal/Max, tap to skip): attack build-up scenes, blocker read mid-jump (only if a block is
  attempted), block-break spike cut + ball close-up, kill-block scene, loose-ball slow-mo calls, personality
  chatter. No manga panels. Slow-mo uses one world clock (A.ts) with eased ramps.
  Target: Normal ≈ 6–7 scenes per match **[open: tuning pending]**.
- §2.5 Spike approach **[built]** (display only, renderer): the hitter runs to a run-up point behind
  the contact spot (skipped if already there or further back), starts heading there already in the beat before the
  set, approaches, and takes off before the contact spot; the broad jump carries them onto the ball. Quick attacks
  keep their short approach; jump serves have no run-up. A hitter too far to run up goes straight to the take-off
  point. No teleporting: grounded movement stays within sprint speed.
- §2.6 Ball marker **[built]**: a white outlined ring (no fill) on the floor always directly under the ball, while the
  ball is visible; wider and fainter the higher the ball.
- §2.7 Poses **[built]** (display only): jump float serve — legs tucked together in the air, run-up strides, landing
  crouch like the jump serve; standing float serve — small dip after contact; setter — hands up in the set-ready
  triangle while the pass travels to them (arms/head only, position unchanged).
- §2.8 Cut-scene lines **[built]**: every LINES kind × personality has 5–6 variants. Lines are
  picked by hash, never by R(), so results never change; only the `matches` golden (it hashes beat text) may.
- §2.4 Blocks: stuff odds = full-strength block vs spike, weighted by coverage; ~14% of attacks stuffed in normal play.

## 3. Menu [built]
- One game (Spite & Spike) + a dev Playtest card (Monster game, `startMonster()`).

## 4. Career world [built unless tagged]
- §4.1 Start: free agent (lore.md §4: no team, no faction); join factions through join conditions; money, housing, paydays, league transfers,
  Gazette; Sim ⏭ button to skip a match before playing it. Calendar: 28 weeks (for now).
  A free agent can't enter the league or cups until signed [built: watches from the stands].
  The pickup squad (`World.pickup`) stays, reframed as the Academy squad (§4.11).
- §4.2 Island: 3 major factions — Wei (city; north + east), Wu (beach/coast; east/south + an inland strip;
  most aggressive), Shu (mountain highlands; west) — plus borderless minor factions. No unclaimed land except the
  neutral middle zone, region `open`. **[locked, not built]** it becomes **Central Academy** (lore.md §4): entry point,
  fields no team, never seized. Code still says "Sacred Shrine Park". Today: 2 squads per major + 2 minor clubs = 8
  fixed teams; **[locked, not built]** replaced by faction pools (§4.11).
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
- §4.10 Facility access **[locked, not built]**: a place is usable if you can pay, your standing with its owner
  region isn't a grudge (standing ≤ `ACCESS.grudge`, default −20, tuned in the balance pass), and you meet the owner's condition (per faction, lore.md §5 dogma; values set in
  the balance pass). Members of the owning faction always get in. Central Academy grounds and Home are always
  open. Ownership changes on seizure, so access can flip. Today standing is display-only.
- §4.11 Competition structure **[locked; pools + draw built (Pool, js/career/pool.js), rest not built]** — replaces the 8 fixed teams, warm-ups and both cups:
  - Faction pools: each faction holds a roster instead of fixed teams. Sizes: Wei 20, Wu 14, Shu 10, Street
    Outlaws 6, St. Gloria 5 (tunable). Squads of 4 are drawn per event.
  - Draw: weighted by rating and standing with that faction; a guaranteed spot above a high-standing threshold
    (value set in the balance pass). A signed player may not be drawn — the price of a big pool.
  - Monthly evaluation (weeks 4, 8, 12, 16, 20, 24 — replaces warm-ups), a benefit of your status:
    - Free agent in the **Academy squad** (the pickup squad: 3 teammates assigned by Central Academy) → Central
      Academy evaluation vs a squad drawn from a random major's pool. Leaving the squad is allowed anytime;
      afterwards no evaluation invites, no rejoining.
    - Signed with a major (Wei/Wu/Shu) → that faction's own evaluation: squads drawn from its pool
      (floor(pool ÷ 4) squads) play each other.
    - Signed with a minor, or alone → no evaluation matches.
    - Rewards = today's warm-up rewards. Results feed standing and the draw weight.
    - Signed with a major but not drawn → you watch from the bench: a little Wit XP (one day-session of Wit
      training, `EVAL.benchDays`).
  - Reserves train weekly like everyone; each payday a faction's best reserve replaces a clearly weaker same-role
    squad player (`PROMOTE.gap`).
  - **U21 Final Cup** (week 28): the career goal. Squads drawn from every faction pool (floor(pool ÷ 4) each)
    plus the Academy squad (13 squads with default sizes); 16-slot bracket seeded by rating, top seeds get byes.
    Camp weeks 26–28 before it. Winning → national team (lore.md §3).
  - Street battles (§4.6) and the faction war (§4.7) are unchanged.

- §4.12 Faction dossier **[built]**: a window per faction (all 5; opened from its HQ panel and from the
  Factions drawer) with everything the player can know about it:
  - State: Weakened (lost ≥ FRONT.weakAt places) / Pressed (lost 1) / Rising (took more than lost) / Stable;
    minors: "Not in the war". Border meters vs the other majors; places taken / lost; price and quality multipliers.
  - Facilities: every place the faction holds now (incl. seized ones, marked), with stat trained, price, quality
    (the advertised value until you've trained there), facility level, and whether it lets you in (`City.access`).
  - Roster: every pool player (league squads + reserves) — name, role, which squad or "reserve". Ratings and awakened
    elements only once scouted (any of its clubs scouted this run) or if you're a member. Unscouted = "unknown".
  - Clubs: its league squads, join conditions, Sign when possible (same rules as the HQ panel).
  - Your standing with it.
  Text follows spec §6 (numbers true; `registrar` voice for labels). Data comes from a DOM-free model
  (`Dossier.build(run, r)`), the window only renders it.
- §4.13 Meta progression **[built — removed]**: none. No Legacy points, unlocks, pure runs, Hall of Fame or
  legend inheritance. Every career starts the same: free agent, base budget and caps (CAREER), no starting skill,
  no team pick. Challenge modes (Hard league, Short season) stay as plain options. The run-end screen keeps the
  result, rank and growth chart.

## 5. Open questions — do not build until decided
- §5.1 Lore gaps (lore.md §9): rival, aces, old-language glossary, names, ritual in play. Waits on them: story
  events, club switching, what standing unlocks beyond access.
- §5.2 Portraits: now generated 2D (`faceSVG`). Options: 3D VRM head snapshots, or hand-made 2D anime portraits
  (unique characters mapped by hand with own model + portrait); Live2D (pixi-live2d-display) or video loops
  (WebM / animated WebP) for special characters at big moments. When built: one call,
  `Portrait.show(el, character, mood)`, so the kind can vary per character.
- §5.3 Legacy / Hall of Fame: **dropped** (owner, to cut complexity) — see §4.13.
- §5.4 Character creation rework (deferred).

## 6. Narrative rules **[locked, not built for existing strings]**
- Every player-facing string has one speaker from lore.md §7 (`registrar`, `wei`, `wu`, `shu`, `outlaw`, `gloria`,
  `villager`, `diary`, `rumor`). No tutorial voice.
- Numbers are always true; claims, reasons and history may be biased or wrong. Never state lore.md truth directly.
- Mechanics explanations (tooltips, costs) use `registrar`: terse, factual, no "why".
- No old-language words until lore.md §8 has a glossary.

## 7. Out of scope for now
- Founding your own club (team building). Minor factions in the faction war. Ghost PvP. Mobile layout.

## 8. Backlog (candidates — become tasks only when specced)
- Balance pass: 7-day week × DAY_GAIN × fees × faction prices × paydays, measured with headless season sims.
- Standing effects; leaving/switching clubs (needs §5.1); scouting → match edge; moving borders.
- three.js island map (§4.9). New-run setup + results screens. Hype scene frequency tuning (§2.3).
- Competition structure (§4.11) — needs staging: pools → draw → evaluations → U21 Final Cup; big career/test impact.
- Shrine Park → Central Academy (§4.2). Facility access gating (§4.10). Voice pass over existing strings (§6).
