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
- §2.0 The sport (lore.md §4, owner): a 4v4 street game — physical and fierce. Tactics (block settings, systems, set
  plays) give an edge but stats decide most rallies: a big physical gap should beat a smart setting. Keep this in the
  balance pass (tactic effects modest vs stat gaps).
- §2.1 Rules: one set to 15, win by 2; court ×1.5; zone/captain buffs, timeouts, tactics, techniques, pop-ups,
  long back attack.
  Three touches per side (a block touch is free). A pop-up off the arms saved by a teammate counts as touches 1 and 2:
  the save is an out-of-system bump-set and a third player hits (or bumps it over) **[built]**.
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
- §2.9 Block tactics **[built]** — 2 blockers at the net (front row stays 2 in 4v4):
  - Lane read: the front-row MB is the main blocker on every attack they can reach (owner); otherwise the blocker on
    the attack's side sets the edge; the other closes beside them on the inside. Middle bitten by a
    quick / decoy → the far-side blocker swings across (late, weaker). Pipe / back-row attack → both close to the
    centre. Read quality from wit + speed: good readers arrive in time with full hands; poor ones late or split.
  - Defence setting (per team, like attack tactics; player picks theirs, AI teams have one): **Read** (default:
    wait for the set; good on wings, late on quicks), **Commit** (middle jumps with the quick; kills quicks, beaten by
    decoys / high outside), **Bunch** (both start central; strong vs middle / pipe, pins open).
  - Scouting a club reveals its attack habits (lane split, pipe use) and its defence setting.
  - Balance: stuffs 10.8 % → ~13 % of attacks (STUFF_BIAS 0.9 → 0.2 after squads of 6; ~14.7 % measured), kills unchanged (~68 %, all-player kills ÷
    attacks). Numbers in `BLOCK` (js/data/tactics.js).
  - Settings are derived from the team style (not saved); the captain may switch on the opponent's attack mix.
- §2.10 Substitutions **[built]**:
  - Teams: 4 on court + 2 on the bench (6). Faction pools grow so every faction fields ≥ 1 squad of 6 (≈ Wei 24,
    Wu 18, Shu 12, Outlaws 6, St. Gloria 6); drawn squads are 6. Code: `t.P` = the 4 on court, `t.bench` = the 2
    subs, `squadOf(t)` = all 6; lineups are restored after every match.
  - At a dead ball, max 2 subs per set per team; the sub takes the replaced player's rotation spot.
  - Presentation: no walk-on animation. The model swaps in place, a floating "SUBBED" label shows over the incoming
    player, and the coach's line appears as chatter (shirt numbers):
    "Subbing #{out} for #{in}. Don't let us down." · "#{out}, sit. #{in}, you're up — earn it." ·
    "#{in} in for #{out}. Same plan, fresher legs." · "#{out}, come off. #{in} — show me why you're here."
  - Simple coach AI: sub when a player's match stamina is under a threshold (`SUB.sta`) or after repeated errors, and
    bring a rested starter back; a random factor scaled by `coachIQ`. Smarter coach (matchups, protecting a lead, personality hunches) = backlog.
  - Your player is benchable: the coach picks starters by rating, form and standing, and may sub you out (tired /
    erring). A match started or finished on the bench gives reduced rewards.
- Box score shows each player's OVR (owner). Loaded extra .vrm models dress your own career player only; everyone
  else (and Monster games) uses the base model (owner).
- §2.11 Match music **[built]**: `assets/audio/the_big_fight.mp3` loops as background music while the
  match screen is open, at 50 % of the effects volume (`BGM_GAIN` 0.5 × volume slider); follows the sound toggle and
  the volume slider; fades in on start and out on leaving. Presentation only (no effect on results). More tracks /
  crowd / voice clips later (backlog).
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
  neutral zone at the Wei–Wu–Shu tri-point (north of the airport), region `open` = **Central Academy** **[built]** (lore.md §4): entry point,
  fields no team, never seized. Today: 2 squads per major + 2 minor clubs = 8
  fixed teams — they stay as each faction's home squads (training, bonds, scouting, transfers); matches that
  matter (evaluations, U21 Final Cup) use squads drawn from the faction pools (§4.11).
- §4.3 Regions set prices/quality: Wei pricey (maybe overhyped), Shu cheap (maybe a hidden gem), Wu sand = technique.
- §4.4 Movement: the player stands at a map point (`run.pos`, start at the airport); hotels when away from home.
  Map is dark except around visited points (`run.fog`, REVEAL_R). Click any land to travel.
- §4.5 Week: 7 days. Every action (train/rest/outing/scout) costs 1 day + trip by distance (free within NEAR_R,
  1 day per TRIP_DAY, max 3). Nothing spills into next week; a night costs 0 days; only the player ends the week.
  One event roll per week. Day sessions give DAY_GAIN (0.25) of the old weekly gain.
- §4.6 Street battles (CLASH, ~45% of training weeks, popup at week start): watch (scouts both sides) or fight for a
  side (win +standing / lose −; the other side always −). `run.rep` = standing per region. Fighting is a real match
  (owner, `Cup.clash`): your side's crew drawn from its pool with you on court vs the other side's crew; watch or Sim ⏭;
  match XP, techniques and grade as in any match. Challenges (§4.15) reuse this flow. Crews and your faction's
  evaluation squad show their real 3-letter team tag (owner).
- §4.7 Faction war (`js/career/front.js`, FRONT): every battle (joined or settled at week end) pushes its border
  meter; 2 net wins seize a border place (2 per side per border; retakes first) → owner's price/turf/colour.
  A faction with 2 places lost is weakened (dearer, worse facilities, easier to join). Wu gets a revenge bonus.
  Minor factions are not in the war. Seized places show as a patch in the holder's colour; borders don't redraw
  **[open: moving borders]**.
- §4.8 Hub UI: full-screen 3D map with HUD overlays, shortcut dock → drawers, cards over the map.
- §4.9 Map architecture: rules → MapModel → MapView (see CLAUDE.md Layout). three.js island map **[built]**: terrain,
  camera, click-to-travel, walking player, HTML-overlay pins / labels / flag, seized + border decals, vertex fog. The SVG map is removed (owner):
  no 2D fallback — without WebGL the map area shows a notice. Contract: `mount`, `update(model)`, `select`, `dispose`.
  Look: fixed tilted camera (Kenshi-like diorama; pan + zoom, no free rotation), low-poly procedural terrain from the
  coast / region shapes (Shu raised highlands, Wu beach ring, CITY.mountains as peaks), water around, region tint.
  Scale: 1 map unit = 0.5 m. The player is the default VRM model; when `you.at` changes it walks / runs there (display
  only — rules stay instant), camera follows; trips last 1.2–6 s with a ×N time-lapse badge. Moving world entities,
  hour clock and day/night are later (M1 / M3).
- §4.10 Facility access **[built; condition values pending the balance pass]**: a place is usable if you can pay, your standing with its owner
  region isn't a grudge (standing ≤ `ACCESS.grudge`, default −20, tuned in the balance pass), and you meet the owner's condition (per faction, lore.md §5 dogma; values set in
  the balance pass). Members of the owning faction always get in. Central Academy grounds and Home are always
  open. Ownership changes on seizure, so access can flip. Today standing is display-only.
- §4.11 Competition structure **[locked; built: pools, draw, reserves growth, Academy squad, monthly evaluations, U21 Final Cup]** — replaces the 8 fixed teams, warm-ups and both cups:
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
  - **U21 Final Cup** (after week 28; replaces the Skyline and Grand Cups): the career goal. Squads drawn from every faction pool (floor(pool ÷ 4) each)
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
- §4.14 Growth: train to a floor, fight to go higher **[built]** (Kenshi rule):
  - Training caps: gains shrink above ~60 and stop at `TRAIN_CAP` 75 per stat. Training stays the fastest early route
    (a new run is pure self-training). The Limit Break gates (80 / 90) and trial are removed.
  - Match experience is the only way above 75 (and still counts below): every match you play (evaluation, cup, street
    battle you fight in) gives stat XP from **your performance**, not the result — kills → power, blocks → jump + def,
    digs → def + speed, sets / assists → wit (exact map in the task). Scaled by the opponent's strength vs your side:
    stronger ×1.5–2, equal ×1, weaker ×0.3. Winning or losing does not change XP.
  - What winning pays is set by why the match was played (unchanged rules): evaluations → skill pts / fans / standing,
    cup → placement rewards, street battle → the side's standing and money as today.
  - Skills: basic skills (SKILLS entries without `tech`) stay buyable with skill points; techniques (`tech` entries) are
    learned in play by chance — they still switch on by themselves once stats meet `req` —
    by doing (e.g. 3+ blocks in a match → a chance at Read Block) and by facing a player who uses it; chance grows with
    wit and opponent strength. Scouting shows which techniques a team's players have.
  - Save: RUN_VERSION bump (Limit Break progress removed, match XP added). Match results unchanged (goldens stay).

- §4.15 Challenges **[built: team challenge + refusal (T-037), loss penalties + injury (T-038); open: engine coach could sub an injured you on (T-049)]** (makes a no-training run possible; see §4.14):
  - Team challenge (map action at a club HQ): your side challenges that club's squad. Costs 1 day + the trip; you name a
    money **stake** (0 allowed). The match itself is the street-battle flow (`Cup.clash`-style fixture: watch or Sim ⏭).
    You play with your side: the Academy squad, or your club's squad (your club must not be the target); alone → hire
    street players for money (weak, rating ~50).
  - **The club may refuse — "not worthy"**. Worth = your side's rating + your standing with them ÷ 10 + a faction term
    from its dogma (lore.md §5), compared with the club's rating − a margin (`CHALLENGE.margin`):
    - Wei: your Gazette rank and fans (fame) + the stake (money talks).
    - Wu: your key stat / OVR (raw strength); stake counts little.
    - Shu: standing and weeks on the island (hardship, elder approval); stake counts nothing.
    - Street Outlaws: any stake ≥ their minimum is accepted (a bet is a bet); a 0-stake challenge is laughed off.
    - St. Gloria: only if you are in the Gazette Top 20 (invitation only); otherwise always refused.
    The worth check is shown before you commit (registrar: "Accepts: likely / doubtful / refuses") with the reason; the
    exact numbers stay hidden. A refusal costs the trip day, gives a one-line refusal in that faction's voice, and that
    club will not hear you again this week. Asking a club that refused 3 times in a season → −standing (you're a pest).
  - Win: stake back at odds from the rating gap, + standing / fans; XP per §4.14 (performance × opponent strength).
  - Loss is a real deal: stake lost; stamina and mood crash (carries over); standing − with that faction (repeated
    losses → grudge → facility ban, §4.10); lost by 8+ → fans − and a Gazette jab. No NPC learning.
  - Injury risk after every challenge (win or lose) = base + rating gap + margin of defeat + **fatigue**: low stamina
    and battles close together (days since the last match / challenge) raise it, like training on low stamina. Resting
    lowers it. Injury = days to weeks without training or matches; a severe one also costs −2 permanently on a stat
    (never ends the run) [assumed — owner to confirm]. Injured: no challenges / street fights, light training only,
    never a starter; the physio heals the weeks, not the stat loss. Evaluations and the cup carry no injury roll.
  - Balance target: a no-training run reaches the mid-70s by ~week 20 only with well-chosen fights.

- §4.16 Living map **[layer A built (only the Wei–Wu border has a drawn line, so pulse / patrols show there); B/C wait for the lore]**: the map shows what is happening
  (display only, no rules, no randoms):
  - A (now): your teammates at the places they train this week; faction players drilling at their courts (more for
    bigger pools; coloured once scouted / member, grey silhouettes before) and walking between their places; the week's
    street battle as a two-colour crowd with flags and dust; border lines pulse with pressure and patrols thicken on the
    winning side; seized places fly the holder's flag. Low-poly instanced figures, VRM for your player only.
  - B (after lore): ambient life — waves, boats, gulls, beach pickup games on Wu sand, Shu village smoke, Wei city lights
    and traffic, villagers near Central Academy.
  - C (after lore, with M3): the sun moves as the week's days are spent; dusk when no days are left.

- §4.17 Rankings **[built]**: three lists, each from a biased publisher (numbers true, what
  counts is biased; lore.md §7):
  - **Academy Register** (`registrar`): every U21 player (all pools, the Academy squad, you) by true OVR. Known players
    (member / your squad / scouted club or faction / met on court) show OVR; others "unrated" (faction + role only).
  - **Gazette Top 20** (`wei`): fame = fans (you) or fame points (NPCs: star / OP, team results, element awakened), ×1.5
    for Wei players — only Wei-sanctioned matches count, so Wei players sit higher and some are overhyped.
  - **Street board** (`outlaw`): street points from street battles, hustles and challenges (you), and from their
    faction's street-battle wins (NPCs: the faction's best players get the points).
  - A Rankings drawer shows the three lists and your rank on each; pre-match and challenge cards show the opponent's
    ranks ("Register #12 · Gazette #3 · Street —"). Display only: no match effects. Aces / the rival appear here later.

- §4.18 Roads, settlements and buildings **[built — T-045, T-046, T-047; T-048 later]** (owner: hybrid look):
  - Data first (rules layer, plain data, no randoms): a road network (nodes at the airport, every place, club HQs,
    Central Academy + junctions; edges = main roads, Wei grid streets, Shu dirt / mountain paths); settlement lots
    generated deterministically along roads per region style — Wei dense city blocks, Wu coastal fishing villages and
    the harbor, Shu terraced hill villages and temple steps, Central Academy campus quad, Outlaws shacks under the
    overpass, St. Gloria walled compound; every place / HQ gets a landmark kind (gym, sand court, dojo, HQ tower, hotel,
    stall, shrine, cage, campus, home).
  - Render: roads as ribbons draped on the terrain; filler buildings as instanced low-poly procedural meshes (one draw
    call per kind); landmarks as single meshes. Every kind comes from one registry (`kit3d.mjs`), so a CC0 model pack
    (Kenney City / Fantasy Town, Quaternius) can replace any kind later from `assets/models/` without touching rules or
    data — owner picks the pieces.
  - Your player walks along the roads (route through the network) instead of a straight line.
  - Later (T-048, optional): trips along roads cost fewer days than cross-country; Shu mountain paths stay slow.
- §4.19 Town layout revamp **[built — T-050 data, T-051 render; T-047 the walk follows the roads]** (owner: the island should feel as crowded as
  the lore; wider beach; Wu town inland). Districts follow lore.md §3–§5:
  - **Wei** (dense, layered): *Downtown* round Wei Gold's HQ and the league office — a tower grid, the densest place on
    the island; *Old Town* in the north-coast pocket by the abandoned gym — the refugee town the settlers built over,
    tight lanes, low rowhouses (homeless housing lives there); *the Ring* — mid-rise blocks out to the borders;
    *St. Gloria* — a walled villa compound with a gatehouse.
  - **Wu**: the beach is ~2–3× wider along the east and south coast, grown **outward** (the coastline moves out; no
    border moves). On the sand: the faded beach-boom strip — a boardwalk along the dune line, old resort hotels, kiosks,
    public sand courts (where the sand game was born; Wu doesn't remember it). *Wu town* sits inland behind the dunes,
    between the beach and the Wei border (barracks, workshops, a market); the *harbor district* stays on the east coast.
  - **The overpass**: a real elevated highway from downtown Wei down to the Wu harbor along the contested line; the
    Outlaws' shacks, containers and cage sit under it.
  - **Shu**: 3–4 terraced hill villages (the native villages that keep the old language — unnamed until the lore glossary
    exists), shrines, mountain paths, few people.
  - **Central Academy**: a campus quad on the old ritual ground; a weathered sand circle nearby, never labelled.
  - **Wealth** (owner): every lot has a wealth level 0–1 that drives its look (height, size, materials, spacing).
    *Wei*: wealth piles up in the centre and thins out steadily toward the suburbs — glass towers and stone downtown,
    then mid-rise, then plain blocks, then shabby edges and Old Town (a smooth gradient from the downtown centre, no
    rich pockets outside it except the walled St. Gloria compound). *Wu*: wealth is spread evenly but modest —
    comfortable towns, none rich, none poor — and weakly connected: separate settlements (harbor, Wu town, the beach
    strip, an inland village) joined by few roads, mostly dirt, with only the coast road as a main road (with T-048 this
    makes Wu trips slower than Wei's). *Shu* poor and scattered; *Outlaws* the poorest; *Academy* middling and uniform.
  - Buildings fill districts (an area + style + density), not only rows along roads; ~1,200 buildings in all
    (Wei ~600, Wu ~300, Shu ~150, Outlaws ~60, Academy ~40, Gloria ~30). Trip days unchanged (T-048 decides road travel).
- §4.20 Match history **[locked, not built — T-052]** (owner): the Season drawer lists every match you were in this run
  (evaluations, U21 cup, team challenges, street fights; newest first): week / day, kind, opponent, score, won or lost,
  your grade. Opening one shows the **snapshot**: your OVR, stats and wit at kick-off (and the change since the match
  before), your line (kills, attacks, errors, blocks, aces, digs, assists), and the box score of everyone who played
  (name, role, OVR, line). Numbers only (registrar voice). Bench matches are listed ("did not play").

- §4.21 Official venues **[locked, not built — T-053]** (owner: show where official matches are held). Four landmark
  venues on the map, each a pin with a card (what is held there; this week's match if any):
  - **League Arena** (Wei downtown, by the league office): the U21 Final Cup and Wei's evaluations. The biggest
    building on the island — a stadium bowl with floodlights.
  - **Academy Hall** (Central Academy campus): the Academy squad's evaluations.
  - **Beach Stadium** (on the Wu sand, a beach-boom relic, faded): Wu's evaluations.
  - **Highland Court** (an open hillside court by Shu Peak's HQ, stone terraces for seats): Shu's evaluations.
  On a match week the venue of your match glows on the map and the match card says where it is played. Display only:
  no travel days, no change to where you stand.

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
- Role identity (with the balance pass): flex-role win rates are even (±3 %, 16k sims: 2 S / 2 MB / 3 WS); make
  setter value visible ("Perfect set!" call-outs, set quality in the box score, front-row setter attack / dump in
  dual-setter teams) and give MBs a back-row pass / dig weakness. Re-measure win rates by flex role after.
- Standing effects; leaving/switching clubs (needs §5.1); moving borders.
- Smarter AI coach (matchup subs, protecting a lead, personality).
- Ace traits (after block tactics §2.9; engine, goldens update). Aces = OP players + named aces/rival (lore.md §6),
  1–3 per faction pool. What makes them hard is how they play, not bigger stats. Your player never gets a trait (the
  element is enough). Each ace has:
  - one rule-bending signature trait (cut-in on first trigger): Wall (solo block covers both lanes), Minus tempo
    (quick lands before the block jumps), Reader (after ~5 rallies blocks your favourite lane more), Iron receive
    (first pass never shanks except vs element spikes / float serves), Clutch (from 12 pts and set point, rolls lean
    their way);
  - a temper: Fired up (trailing by 3+ or just stuffed → surge for a few rallies) / Rattled (2 stuffs or aces against
    them → more errors, trait off for a while);
  - one weakness revealed by scouting (e.g. float serves, left lane, short fuse), shown in the match UI.
- New-run setup + results screens. Hype scene frequency tuning (§2.3).
- Voice pass over existing strings (§6) = T-022.
