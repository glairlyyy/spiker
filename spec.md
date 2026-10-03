# Spite & Spike — spec

Owned by the spec chat; the build chat reads, never edits. Tasks cite section ids (`§2.3`).
Tags: **[built]** · **[locked, not built]** · **[draft]** (to confirm) · **[open]** (do not build) · **[dropped]**.

## 1. Vision

- 4v4 volleyball RPG / sports-life sandbox on a faction-ruled island: start a free agent, join factions, train, play
  watch-only 3D matches with a 2D interface. Spite-driven story (lore-first, later). Lore and voices: `lore.md`.
- Built from the Skyline Cup prototype; nothing of its career/modes/saves kept. Desktop-only; compact UI (decision numbers on
  the control; lore and edge cases in tooltips/folds — §9). Goal: win the U21 Final Cup → the major nation's national team.

## 2. Match (engine + 3D playback) [built unless tagged]

- §2.0 Sport (lore.md §4): 4v4 street game, physical. Tactics give an edge; stats decide most rallies — a big physical
  gap beats a smart setting. Keep tactic effects modest vs stat gaps.
- §2.0b Stamina: every touch drains (`RULES.stamina` { drain 1.7, hit 0.4, jumpHit 0.3 }); at 0: −40 % power /
  defense, −30 % jump. A lone carry wears out.
- §2.1 Rules: one set to 15, win by 2; court ×1.5; zone/captain buffs, timeouts, tactics, techniques, pop-ups, long
  back attack. 3 touches per side (block touch free). A pop-up off the arms saved by a teammate = touches 1 + 2
  (out-of-system bump-set; a third player hits or bumps over). Second touch: a free setter (no first touch, not busy)
  always sets if reachable; a teammate sets only if the setter took the first ball, is busy, or a bad pass lands
  where a teammate clearly gets there first.
- §2.2 Elements: hidden per player; unlocked for OP, ~1/4 of stars, and you via the Element Trial. Gauge fills by
  element play; full gauge or captain buff → next attack is the signature element spike. Counter elements halve. Fiction: lore.md §2 (Trial = modern method; ritual forgotten).
- §2.3 Hype (Off/Normal/Max, tap to skip): attack build-up, blocker read mid-jump (only if a block is attempted),
  block-break spike cut + ball close-up, kill-block, loose-ball slow-mo, personality chatter. No manga panels. One world
  clock (`A.ts`), eased slow-mo ramps. Target Normal ≈ 6–7 scenes/match **[open: tuning]**.
- §2.4 Blocks: stuff odds = full-strength block vs spike, weighted by coverage (targets §2.9).
- §2.5 Spike approach (display): hitter runs to a run-up point behind contact (skip if already there/behind), starting
  in the beat before the set, takes off before contact; broad jump carries onto the ball. Quicks: short approach; jump
  serves: none; too far → straight to take-off point. No teleport: ground moves ≤ sprint speed.
- §2.6 Ball marker: white outlined ring under the visible ball; wider and fainter the higher it is.
- §2.7 Poses (display): jump float serve — legs tucked, run-up strides, jump-serve landing crouch; standing float — dip
  after contact; setter — set-ready hand triangle while the pass travels (arms/head only).
- §2.8 Cut-scene lines: each LINES kind × personality has 5–6 variants, picked by hash, never R() (only the `matches`
  golden, which hashes beat text, may change).
- §2.9 Block tactics (2 blockers at the net):
  - Lane read: front-row MB is main blocker on every attack they can reach; else the blocker on the attack's side sets
    the edge, the other closes inside. Middle bitten by quick/decoy → far blocker swings across (late, weaker). Pipe /
    back-row → both close centre. Read quality from wit + speed: good readers arrive in time, full hands; poor ones late or split.
  - Defence setting per team (player picks; AI from team style, not saved; captain may switch on the opponent's attack
    mix): **Read** (default; good on wings, late on quicks) · **Commit** (middle jumps with the quick; kills quicks, beaten by decoys
    / high outside) · **Bunch** (both central; strong vs middle/pipe, pins open).
  - Scouting a club shows its attack habits (lane split, pipe use) and defence setting.
  - Targets: ~13–14 % of attacks stuffed, kills ~68 % (kills ÷ attacks). `BLOCK` (js/data/tactics.js), `STUFF_BIAS` 0.2.
- §2.10 Substitutions:
  - Squad `SQUAD` 6: `t.P` = 4 on court, `t.bench` = 2 subs, `squadOf(t)` = all 6; lineups restored after each match.
  - Dead ball only, max 2 subs per set per team; sub takes the rotation spot.
  - No walk-on: model swaps in place, floating "SUBBED" label, coach line as chatter: "Subbing #{out} for #{in}. Don't
    let us down." · "#{out}, sit. #{in}, you're up — earn it." · "#{in} in for #{out}. Same plan, fresher legs." ·
    "#{out}, come off. #{in} — show me why you're here."
  - Your player has the coach's trust (you grind harder than anyone).
  - Coach AI: sub at match stamina < `SUB.sta` or repeated errors; bring rested starters back; randomness scaled by
    `coachIQ`. First compares the starter's worth now (rating × stamina loss) with the fresh sub: high IQ subs only if
    the sub is better now, low IQ follows the rule blindly.
  - You are benchable (starters by rating, form, standing); your sub-out roll ×`SUB.you` 0.9; an injured you is never
    subbed on. Starting or finishing on the bench → reduced rewards.
- Box score shows each player's OVR.
- §2.11 Music: `assets/audio/the_big_fight.mp3` loops on the match screen at `BGM_GAIN` 0.5 × volume slider; follows
  sound toggle; fades in/out. Presentation only.
- §2.12 Ego: each player has **ego** 0–1 and **maturity** from wit (≈0 at wit 0.5, 1 at 2.0).
  - Acts, chance = `EGO.base[act]` × ego × (1 − maturity): **ball steal** (goes for a teammate's dig/pass: "Mine!" →
    collision — ball drops or shanked — or their touch) · **set call** (a low-maturity setter feeds them even when
    another hitter is open — worse matchup; a mature setter ignores it) · **solo block** (ignores the defence setting: gaps, or a stuff if read right) · **hero
    swing** (full power on a bad set: more kills, errors, stuffs) · **hero serve** (risky jump serve: aces, errors).
  - Success: mood up, fame for highlights; failure: mood and team momentum down. Maturity cuts each act's error side.
    A high-wit captain on court: chances × (1 − captain maturity × `EGO.captain`).
  - Memories (§4.23): stole_my_ball −6, collided −4 (both), hero_carried +8 (won the point; warm/loyal count it,
    jealous resent it), set_hogged −4 (the open hitter). Ego toward allies ×0.5, rivals ×1.5.
  - Value: NPCs from traits (proud/reckless/jealous up; steady/calculating/warm down), else hash 0.2–0.8 (WS a bit
    higher); you start 0.6. Card tag: Show-off · Team player.
  - Presentation: "MINE!" label (`plabel`), collision = both bump poses + log line, set-call chatter; no new act
    kinds. Tallies in `m.egoLog`.
  - **Block collision**: solo ego blocker + partner committing to the same spot (partner maturity decides holding off)
    → both blocks cancelled mid-jump, stagger apart, open net. Error variant: net fault, point to attackers. Label
    **BLOCK COLLISION** (warning) / **BLOCK COLLISION · NET** (red). collided −4 both.

## 3. Menu [built]

- One game + a dev Playtest card (Monster game, `startMonster()`).

## 4. Career world [built unless tagged]

- §4.1 Start: free agent (no team/faction); join via join conditions; money, housing, paydays, league transfers,
  Gazette; Sim ⏭ skips a match. 28 weeks. Unsigned → no league/cups (watch from the stands). `World.pickup` = the
  Academy squad (§4.11).
- §4.2 Island: majors Wei (city; N + E), Wu (coast; E/S + inland strip; most aggressive), Shu (highlands; W); minors
  Street Outlaws, St. Gloria (borderless). Only neutral land: region `open` = **Central Academy** at the Wei–Wu–Shu
  tri-point (540, 500), north of the airport — entry point, no team, never seized. 8 fixed teams (2 per major + 2
  minor clubs) = home squads (training, bonds, scouting, transfers); matches that matter use pool draws (§4.11).
- §4.3 Regions set prices/quality: Wei pricey (maybe overhyped), Shu cheap (maybe hidden gem), Wu sand = technique.
- §4.4 Movement: `run.pos` (start: airport); hotels away from home. Dark except near visited points (`run.fog`,
  REVEAL_R). Click any land to travel.
- §4.5 Week: 7 days. Each action (train/rest/outing/scout) = 1 day + trip (free within NEAR_R, 1 day per TRIP_DAY,
  max 3; routing §4.18). Nothing spills over; nights free; only the player ends the week. One event roll per week.
  Day session = DAY_GAIN (0.25) of the old weekly gain.
- §4.6 Street battles (CLASH, ~45 % of training weeks, popup at week start): watch (scouts both) or fight for a side
  (win +standing, lose −; other side always −). `run.rep` = standing per region. Fighting = real match (`Fight.clash`):
  your side's pool crew with you vs theirs; watch or Sim ⏭; normal XP, techniques, grade. Crews and your evaluation
  squad show their 3-letter tag ('EVL' only for the opposing evaluation squad). "Fight for X" buttons carry X's swatch (faction colours only on chips, borders, banners — §9.2).
- §4.7 Faction war (`front.js`, FRONT): each battle (joined or settled at week end) pushes its border meter; 2 net
  wins seize a border place (2 per side per border; retakes first) → owner's price/turf/colour. `FRONT.weakAt` (2)
  places lost = weakened (dearer, worse facilities, easier to join). Wu revenge bonus. Minors not in the war. Seized =
  patch in holder's colour; borders don't move **[open: moving borders]**.
  Superseded by §4.27 hex territory (built): tiles replace border meters, border places, the T-130 lines and patches.
- §4.8 Hub: full-screen 3D map, HUD, shortcut dock → drawers, cards over the map.
- §4.9 Map: rules → MapModel → MapView → three.js `js/map3d/` (`mount`, `update(model)`, `select`, `dispose`); no 2D
  fallback (WebGL missing → notice). Terrain, pins/labels/flag as HTML overlay, seized + border decals, vertex fog.
  Fixed tilted camera (Kenshi diorama; pan + zoom, no rotation); low-poly procedural terrain (Shu raised, Wu beach ring,
  CITY.mountains peaks), water, region tint. 1 map unit = 0.5 m. Your VRM walks/runs when `you.at` changes (display;
  rules instant), camera follows; trips 1.2–6 s with ×N time-lapse badge. Moving entities, hour clock, day/night later (M1 / M3).
- §4.10 Facility access: pay + standing with owner > `ACCESS.grudge` (−20) + owner's dogma condition (lore.md §5;
  values **[open: balance pass]**). Owner's members always in; Central Academy grounds and Home always open. Flips on
  seizure. Standing otherwise display-only.
- §4.11 Competition:
  - Pools (rosters): `POOL` { wei 24, wu 18, shu 12, outlaws 6, gloria 6 }. Squads of `SQUAD` 6 drawn per event,
    default n = floor(pool ÷ SQUAD), weighted by rating and standing; guaranteed spot above a standing threshold
    **[open: value]**. Signed players may not be drawn.
  - Monthly evaluation, weeks 4/8/12/16/20/24: Academy squad (free agent + 3 assigned teammates) → vs a random major's
    drawn squad (leave anytime; then no invites, no rejoin). Signed with a major → its drawn squads play each other.
    Minor or alone → none. Rewards: skill pts / fans / standing; results feed standing and draw weight. Major member
    not drawn → bench, Wit XP of one day-session (`EVAL.benchDays` 1).
  - Reserves train weekly; each payday a faction's best reserve replaces a clearly weaker same-role starter
    (`PROMOTE.gap` 3).
  - **U21 Final Cup** (after week 28): floor(pool ÷ SQUAD) squads per faction + Academy squad (12 by default); 16-slot
    bracket seeded by rating (1 v 16, 8 v 9…), missing seeds = byes. Camp weeks 26–28. Win → national team (§4.26).
- §4.12 Faction dossier (all 5; from HQ panel and Factions drawer), DOM-free `Dossier.build(run, r)`, `registrar` voice:
  - State: Weakened (lost ≥ weakAt) / Pressed (lost 1) / Rising (took > lost) / Stable; minors "Not in the war".
    Border meters, places taken/lost, price and quality multipliers.
  - Facilities held (seized marked): stat, price, quality (advertised until trained there), level, access
    (`City.access`).
  - Roster: name, role, squad or "reserve"; ratings and awakened elements only if scouted (any club this run) or
    member, else "unknown". Clubs: squads, join conditions, Sign. Your standing.
- §4.13 Meta progression: none (no Legacy, unlocks, Hall of Fame, inheritance). Every run starts the same (§4.22): no
  starting skill, no team pick. Challenge modes (Hard league, Short season) are plain options. Run end: result, rank,
  growth chart.
- §4.14 Growth (Kenshi rule):
  - Training gains shrink above ~60, stop at `TRAIN_CAP` 75; the fastest early route.
  - Match XP (`MATCH_XP`) is the only way above 75: every match you play (evaluation, cup, street fight, challenge),
    from your performance not the result — kills → power, blocks → jump + def, digs → def + speed, sets/assists → wit.
    × opponent strength vs your side: stronger 1.5–2, equal 1, weaker 0.3.
  - Win rewards by match type: evaluations → skill pts / fans / standing; cup → placement; street battle → side
    standing + money.
  - Basic SKILLS (no `tech`) bought with skill points. Techniques (`tech`) learned in play by chance — by doing (e.g. 3+
    blocks → chance at Read Block) and by facing a user; chance grows with wit and opponent strength; active once
    stats meet `req`. Scouting shows a team's techniques.
- §4.15 Challenges (make a no-training run possible):
  - At a club HQ: 1 day + trip; you set a money **stake** (0 ok). Street-battle flow (watch / Sim ⏭). Your side:
    Academy squad, or your club's squad (not the target); alone → hired street players (~50 rating, cost money).
  - Refusal ("not worthy"): worth = side rating + standing ÷ 10 + dogma term vs club rating − `CHALLENGE.margin`. Wei:
    Gazette rank, fans + stake. Wu: key stat / OVR, stake barely. Shu: standing + weeks on island, stake not at all.
    Outlaws: any stake ≥ their minimum; 0 laughed off. St. Gloria: only if you're Gazette Top 20. Shown before
    committing ("Accepts: likely / doubtful / refuses" + reason, numbers hidden). Refusal: trip day lost, a line in the
    faction voice, no retry this week; 3 refusals from a club in a season → −standing.
  - Win: stake back at odds from the rating gap, + standing / fans; XP per §4.14.
  - Loss: stake lost; stamina and mood crash (carry over); −standing (repeated → grudge → ban, §4.10); lost by 8+ →
    fans − and a Gazette jab. No NPC learning.
  - Injury roll after challenges and street fights (not evaluations/cup) = base + rating gap + defeat margin + fatigue
    (low stamina, few days since last fight); rest lowers it. Days to weeks out; severe also −2 permanent on a stat
    (never ends the run). Injured: no fights, light training only, never starts or comes on; physio heals time, not
    the stat. NPCs share `INJURY` rules.
  - Target: a no-training run reaches mid-70s by ~week 20 only with well-chosen fights.
- §4.16 Living map (display only, no randoms):
  - A [built]: teammates at their week's training places; faction players drilling at courts (more for bigger pools;
    coloured if scouted/member, else grey) and walking between places; street battle as a two-colour crowd with flags
    and dust; patrols stand on the hex frontier facing each other (this week's battle tile first, then the most
    pressured fronts, any pair — T-153); tile colour shows who holds a place (no seized flags). Low-poly instanced figures; VRM for you only.
  - B **[locked, not built — waits on lore]**: waves, boats, gulls, Wu beach pickup games, Shu village smoke, Wei
    lights and traffic, villagers near the Academy; individual NPC figures and approach figures (§4.23).
  - C **[locked, not built — M3]**: sun moves as the week's days are spent; dusk when none left.
- §4.17 Rankings (numbers true, criteria biased; display only):
  - **Academy Register** (`registrar`): all U21 players by true OVR; unknown players (not member/squad/scouted/met on
    court) "unrated" (faction + role).
  - **Gazette Top 20** (`wei`): fans (you) or fame points (NPCs: star/OP, team results, awakened), ×1.5 for Wei
    players; only Wei-sanctioned matches count.
  - **Street board** (`outlaw`): street battles, hustles, challenges (you); faction street-battle wins credited to its
    best players (NPCs).
  - Rankings drawer: lists + your ranks. Pre-match / challenge cards: "Register #12 · Gazette #3 · Street —". Aces /
    the rival appear here later.
- §4.18 Roads and buildings:
  - Data (plain, no randoms): road network (airport, every place, HQs, Academy, junctions; main roads, Wei grid, Shu
    dirt/mountain paths); deterministic lots per region style; landmark kind per place/HQ (gym, sand court, dojo, HQ
    tower, hotel, stall, shrine, cage, campus, home). Lots keep clear of `CITY.ritual`.
  - Render: road ribbons on terrain; instanced low-poly fillers (one draw call per kind); landmarks single meshes. One
    registry (`kit3d.mjs`) so CC0 packs (Kenney, Quaternius) in `assets/models/` can replace any kind (owner picks).
  - You walk the road route. Trip cost = cheaper of road route (main/overpass fast; Wei streets, boardwalk, dirt
    slower; Shu mountain paths slowest) or cross-country (Shu highlands rough). Airport → harbor 2 days by coast road;
    Shu mountain trail 3.
- §4.18b Island scale (owner, 2026-10-03) **[built]**: the island is drawn at `MAP_SCALE` 1.5 (1590 × 1050 map units,
  ~795 × 525 m) — more room between the same towns. Towns, minors and the Academy keep their size and building count
  (~720); travel days, the fog reveal radius, the hex tile size (still ~139 tiles) and Wei's wealth fall-off scale with it.
- §4.18c Map view (owner, 2026-10-03) **[built]**: the dark map lifts only round you and your home (explored places stay
  known — their pins show — but dark); a "◎ Me" button (key C) flies the camera to your player; the player model is drawn
  ~3.5× life size (6 m) so it reads on the island.
- §4.18a Training layout (owner, 2026-10-03) **[built]**: Wei's four gyms stand together in one training district
  round the jW1 junction (a short walk apart: little travel inside Wei); Wu's spread thin along the coast (pier by the
  airport, sand courts on the south-east beach, harbor on the east coast, dunes in the north-east); Shu's stay scattered.
  Gain per stat is shown as a rating, not a number (owner): EXP +++ / EXP ++ / EXP + / Almost no EXP (session gain vs points needed).
- §4.19 Town layout (crowded; lore.md §3–§5); buildings fill districts (area + style + density), ~700 total (owner, 2026-10-03: thinner and lower — `MapModel.thin` 0.65, tallest towers ~half as high) (Wei
  ~330, Wu ~210, Shu ~85, Outlaws ~40, Academy ~24, Gloria ~18):
  - **Wei**: _Downtown_ (Wei Gold HQ, league office; tower grid, densest); _Old Town_ (north-coast pocket by the
    abandoned gym; refugee lanes, rowhouses, homeless housing); _the Ring_ (mid-rise to the borders); _St. Gloria_
    (walled villa compound, gatehouse).
  - **Wu**: beach ~2–3× wider on E and S coasts, grown outward (borders fixed); faded beach-boom strip (dune-line
    boardwalk, old resort hotels, kiosks, public sand courts); _Wu town_ inland behind the dunes toward Wei (barracks,
    workshops, market); _harbor district_ on the east coast.
  - **Overpass**: elevated highway downtown Wei → Wu harbor along the contested line; Outlaws' shacks, containers,
    cage beneath.
  - **Shu**: 3–4 terraced hill villages (unnamed until glossary), shrines, mountain paths, few people.
  - **Central Academy**: campus quad on the old ritual ground; a weathered, unlabelled sand circle nearby.
  - **Wealth** 0–1 per lot (height, size, materials, spacing). Wei: smooth gradient downtown → shabby edges / Old Town;
    no rich pockets but St. Gloria. Wu: even, modest; separate settlements (harbor, Wu town, beach strip, inland
    village) on few mostly-dirt roads, coast road the only main road. Shu poor, scattered; Outlaws poorest; Academy
    middling, uniform.
- §4.20 Match history (Season drawer): every match you were in, newest first — week/day, kind, opponent, score, W/L,
  grade; bench matches "did not play". Snapshot: your OVR, stats, wit at kick-off (+ change since previous), your line
  (kills, attacks, errors, blocks, aces, digs, assists), full box score (name, role, OVR, line). Registrar voice.
- §4.21 Official venues (display only; pin + card: what's held, this week's match; your match's venue glows, the
  match card names it): **League Arena** (Wei downtown by the league office; biggest building, floodlit bowl): U21
  Final Cup + Wei evaluations · **Academy Hall** (campus): Academy evaluations · **Beach Stadium** (Wu sand, faded
  relic): Wu evaluations · **Highland Court** (hillside by Shu Peak HQ, stone terraces): Shu evaluations.
- §4.22 Start from 1: Power, Defense, Speed, Jump = 1, Wit 1.0; no creation points / role bias. Creation: name, role,
  look, challenge modes. XP per point grows ×1.05 per point at all levels (≈1 at 1, ≈6 at 40, 10 at 50; ~a dozen
  sessions to 50). Early benching and losses are intended (evaluations still pay the bench reward). Stats floor 1; a
  guard repairs invalid stats on load and before every match. NPCs unchanged.
- §4.23 **Relationships — the core pillar.** Every NPC is a career; a relationship is two careers colliding, not a
  gauge. **Hard rules:** no gifts, dates/romance, per-character story chains, support cards, "max bond = stat bonus",
  cheerful portrait banter. Bond grows only from shared, costly acts; hanging out has fast diminishing returns. Lines
  in lore voices; numbers true.
  - **A. NPC careers.** Every pool player: `want` (1), `traits` (2, no opposites), weekly `plan`, season record,
    `status` (active · injured · benched · cut · quit · poached · national).
    - WANTS: `national` (plays every match, takes risks, picks winning squads) · `money` (hustles, paid challenges,
      open to Gloria/Outlaw offers) · `spot` (keeps role, trains key stat, hostile to same-role threats) · `grudge`
      (Wu vs Wei by default, Outlaws vs Wei; challenges, street battles) · `prove` (trains Hard, overtrains, more
      injuries; Shu-leaning) · `leave` (disloyal, best offer).
    - TRAITS: proud · loyal · jealous · warm · cynical · reckless · calculating · steady.
    - Plan (one roll per week): train a stat at an allowed place, rest, hustle, challenge, scout, recover. Growth by
      your XP rules × hidden potential (no random drift); off-screen matches raise all 4 stats (key ×2); only starters
      and hustlers pass the cap (target week 28: mean OVR ~83, top-10 ~95). Same fatigue, INJURY, Run.lineup rules.
    - Fates (permanent): **cut** (benched 3 evaluations running + under the join bar → reserves; quits if want unmet) ·
      **quit** (cynical + want unmet long) · **poached** (≤ 1 per payday; `money` → St. Gloria, still in play; `leave`
      → abroad, gone) · **national** (F). Shown in rumours and the Gazette.
  - **B. Memories.** Pairs (you ↔ NPC; NPC ↔ NPC within squad/pool, entry carries `a` = who feels it) log
    `{ week, kind, value }`. MEMORY: spot_taken −30 (scar) · spot_given +20 · carried +12 (they scored off your play / you saved their bad game) · let_down −10 (your error lost a set
    point) ·
    trained_together +3 (×0.5 per repeat in a week) · won_together +5 · lost_together +2 (−2 jealous/cynical) ·
    beat_me −8 (challenge / street fight) · covered_me +8 (dug their bad pass, sat out for them) · vouched +15 · refused_help −6 · lent_money +10 · debt_unpaid −4/week · called_out −5 ·
    shamed −12 (scar; a Gazette jab about them you caused) · ego kinds (§2.12). Fade ×DECAY/week; scars never. ≤ 24 entries (same kinds merge).
    - **Stance** = Σ value × fade × traits: proud ×2 on scars + beat_me; loyal ×0.6 negatives; jealous ×1.5 spot_taken
      and your hero plays count against you; warm ×1.3 / cynical ×0.7 positives; calculating ×1.5 payoff memories
      (won_together, carried, vouched, lent_money), ×0.5 rest. Tags: ally · respect · neutral · resent · enemy.
      **Rival** flag: same-role squadmate within 5 OVR.
    - `bond` = clamp(stance × 8, 0, 100), read-only summary (goals, form, Team drawer).
  - **C. Approaches.** ≤ 2/week, ≤ 1 per person and kind; expire; wait in the People drawer (never block the map).
    By wants + stance: invite_train (place + day → train together) · ask_sitout (before an evaluation; accept → you
    bench, spot_given; refuse → proud resents; never in a Story cup) · duo_challenge (split stake/risk) · borrow
    (repaid on payday or debt_unpaid) · call_out (rival outside your squad; refuse → fame + standing hit) · vouch
    (their club's join bar −X; only while you're a free agent) · warn (rumour) · poach_advice (your answer changes
    their fate and memory). You can approach them (Team drawer): train, ask vouch, lend, call out, ask sit-out; they
    may refuse. They approach other NPCs (heard as rumours).
  - **D. NPC ↔ NPC**: same memories; off-screen results count half. Cliques (3+ allies) and feuds form and change who
    sets whom, starts, gets cut. Team drawer shows squad chemistry. Some approaches ask you to take a side.
  - **E. On court** (gated on per-match flags; Monster/sim goldens never move): clutch sets +15 % to an ally, −15 % to
    a resent/enemy hitter (chatter/log "trusted" / "froze out"); allies cover your bad pass more; captain's buff to
    allies first; lineup score adds a teammate vouch; facing a rival → mood swing both (fired up / rattled). No raw
    stat bonuses.
  - **F. Permanence.** 4 starting spots: anyone you raise can take yours. Call-up after the cup: **Story** — you go if
    your squad wins (§4.26), plus its best by match grades; **Endless** — best 4 by grades (+ fame tie-break), bench
    winners don't go. NPCs compete for the rest. Run end "People who mattered": 5 strongest stances, fates, key
    memories (diary voice).
  - **G. Discovery.** Want revealed after enough memories (or rumour/scouting), traits after seen acting; else
    "unknown". Team drawer → **People**: name, role, OVR if known, stance, want/traits once known, season line, top 3
    memories (diary: "W8 — I took her spot. She hasn't forgotten."). Rankings and dossier link to it.
  - **H. Data.** `run.people[id] = { want, traits, plan, status, known: { want, traits } }`; `run.mem[pairKey]`
    (sorted ids). Budget: you-pairs for everyone met + in-squad NPC pairs (≤ ~1,500 entries). Tables WANTS, TRAITS,
    MEMORY, REL in js/data. RUN_VERSION 14. Rolls via `People.roll` (seed × week × player × salt), never R(); engine
    sees only per-match flags.
- §4.24 Faction events **[draft]**: one per payday, rolled by Front from state (pressure, places lost, money); lasts N
  weeks; Gazette + faction-voice rumours: border seizure (add flag change + story), price hike / sale (×1.3 / ×0.8),
  gym raid (place closed 1–2 weeks: greyed pin, rubble), recruitment drive (join bar −5, crews swarm), curfew (+1 day
  to enter a region), festival (Wu beach week: free bonfire, mood up, no street battles). Table EVENTS; no randoms
  beyond the payday roll; MapModel shows, living map animates.
- §4.25 Match camera: Broadcast / Courtside / **Follow** (behind and above you, turns with your side, eases to the
  ball on your touches) / **POV** (from your head, own arms on spikes/digs, falls back to Follow in wild jumps). Hype
  scenes cut away and return. Your player only (Monster: any). No roll, smoothed head bob, FOV 70.
  - Follow/POV face the opponent (look clamped ±40° / ±55°); ball out of frame → FOV widens (Follow also backs off up
    to 12 m, +0.3 m up per m); look target clamped to the court box, eased while the ball is hidden; hype exit turns
    smoothly. POV fades figures within arm's reach.
  - Shake: slow sway, off with Zooms: Off. Ball trails scale with hit power; all trails fade out when still.
  - Models: career player always Main_v2 (own colours); extra loaded .vrm models only in Monster (random per player;
    menu toggle "Model colors: Own / Team", localStorage `sns_keepcol`); everyone else base model. VRM springs use the figure root as center, `HAIR` { stiff 1, drag 0, gravity 1 }.
- §4.26 Modes (`run.mode.story`; every guarantee checks it):
  - **Story** (default): at the U21 Final Cup you're always in a squad (forced into your faction's first drawn squad
    over its weakest same-role player; Academy member → Academy squad; alone → hired street crew) and always start
    (coach may still sub you tired; SUB.you applies). Squad wins → you're called up (the ending). Other matches keep
    normal lineups.
  - **Endless** **[locked, not built]**: no guarantees; call-up by grades; season rolls over after the cup (aging out,
    senior league, continuing NPC careers: **[open]**).
- §4.27 Hex territory **[locked]** (owner, 2026-10-03): the war map becomes hex tiles; each tile has its own takeover
  condition. Changes how factions move and seize; the player's travel (roads, days, trips, fog) does not change.
  Replaces the fixed border meters and border places (§4.7 `FRONT.borders`, T-130 lines, seized patches).
  - Grid: flat-top hexes, `HEX.size` 36 map units (~170 land tiles), built deterministically from CITY (land = centre or any corner on
    land, so the coast is fully tiled); id = axial `q,r`. Start owner = the region at the centre (or that land corner).
  - Kinds: `hq` (a club HQ: its faction's capital, never taken) · `academy` (Central Academy: neutral, never taken) ·
    `minor` (Outlaws, St. Gloria: not in the war) · `place` (holds a training place / venue) · terrain `city` (Wei
    districts), `beach` (sand), `highland` (mountains), `plain`.
  - Takeover condition (`HEX_COST`): net battle wins needed — plain 1, city / beach / highland / place 2; +1 on the
    defender's home terrain (Wei city, Wu beach, Shu highland); −1 (min 1) for a retake; −1 when the tile is cut off
    from every defender HQ. Hard rules: the tile touches the attacker's territory, and the attacker's touching tile
    is connected to one of its HQs (supply line).
  - Movement: each week's battle (Front.pick: the raider by FRONT.aggro; its target by FRONT.prey — owner 2026-10-03: Wei and Wu
    go for each other 85 % (Shu is deep in the mountains for poor facilities), Shu raids either — × FRONT.push where it is winning) is fought on a target tile — the defender's cheapest takeable
    tile, then the nearest to the attacker's HQ (then a hash) — owner: cheapest and nearest first. Its centre is the battle site (replaces CLASH.sites). Win: +1
    pressure on the tile; pressure ≥ cost → the tile flips (pressure 0). Loss: the tile's pressure → 0 and the defender
    gets +1 on the attacker's tile it came from. Untouched for 4 weeks: pressure −1.
  - Tile value (owner, 2026-10-03) **[built]**: every tile is worth `HEX_VALUE` (HQ 4, place 3, city 3, beach 2,
    highland 1, plain 1). A major's economy = value held − value at the start (e). It drives the world economy instead
    of the count of lost places: prices × (1 + 3% per point lost), facility quality × (1 + 1.5% × e, 0.7–1.3), street
    strength 50 + 3 × e, club joins easier by FRONT.join OVR / key and −25% fee per 3 points lost, weakened at e ≤ −6.
    Shown on the tile panel (value) and the Factions cards (value held ± and the effects).
  - Effects: a place's owner = its tile's owner (`run.own` becomes a cache rebuilt from the tiles on every flip); turf, prices, quality, access follow. Economy
    and `weak` count lost places as today. Labels stay; buildings keep their original style.
  - Map: tiles drawn in the owner's colour (fill + outline) — the only faction colour on the ground (the terrain itself is uncoloured, owner 2026-10-03); fill draped on the terrain (mountains included, owner 2026-10-03); frontier edges brighter; the target tile shows a ring
    `pressure/cost`; a click on a tile (map point) shows owner, kind, condition and pressure in the point panel.
  - Save: `run.hex = { own: { id: region } (changed tiles only), p: { id: n } }`; RUN_VERSION 16 (dev bump).
    Career goldens may change (battle sites); engine goldens unchanged.
  - Out of scope: the player sieging tiles directly; NPC homes or region names moving.

## 5. Open questions — do not build until decided

- §5.1 Lore gaps (lore.md §9): rival, aces, glossary, names, ritual in play. Blocks: story events, club switching,
  what standing unlocks beyond access.
- §5.2 Portraits: now 2D `faceSVG`. Options: VRM head snapshots; hand-made 2D anime portraits; Live2D
  (pixi-live2d-display) or WebM / animated WebP loops for special characters at big moments; unique characters
  mapped by hand (own model + portrait), so the kind varies per character. API when built: `Portrait.show(el, character,
mood)`.
- §5.3 Legacy / Hall of Fame **[dropped]**. §5.4 Character creation rework (deferred).
- §5.5 Severe injury: the permanent −2 on one stat is assumed; confirm in the balance pass.
- §5.6 Faction recolour: Shu `#4ade80` = the `good` status colour, Wu `#3fa9f5` ≈ `cyan`, Wei `#f5b82e` ≈ `gold`.
  **Approved (owner, 2026-10-03):** `wei #d08a2e` · `wu #5b8def` · `shu #2fb8a0` (design system tokens) everywhere a
  faction colour shows (map tiles, chips, borders, banners, 3D accents); club kits keep their own colours. Task T-165.

## 6. Narrative rules [locked; faction/region/Gazette/event strings built]

- Every player-facing string has one lore.md §7 speaker (`registrar`, `wei`, `wu`, `shu`, `outlaw`, `gloria`,
  `villager`, `diary`, `rumor`). No tutorial voice.
- Numbers always true; claims and history may be biased. Never state lore.md truth directly.
- Mechanics (tooltips, costs): `registrar` — terse, no "why". No old-language words until lore.md §8 has a glossary.

## 7. Out of scope

- Founding a club. Minors in the war. Ghost PvP. Mobile layout.

## 8. Backlog (tasks only once specced)

- Balance pass (headless season sims): week × DAY_GAIN × fees × prices × paydays; the [open] values above.
- Role identity: flex roles win evenly (2 S / 2 MB / 3 WS). Show setter value ("Perfect set!", set quality in box
  score, setter attack/dump in dual-setter teams); MB back-row pass/dig weakness; re-measure.
- Standing effects; club switching (needs §5.1); moving borders. Smarter coach (matchups, protect a lead, hunches).
- Ace traits (engine, goldens update): OP players + named aces/rival, 1–3 per pool; hard by play, not stats; never
  for you. Each: a signature trait (cut-in on first trigger) — Wall (solo block covers both lanes), Minus tempo (quick
  lands before the block jumps), Reader (after ~5 rallies blocks your favourite lane more), Iron receive (first pass
  never shanks except vs element spikes / float serves), Clutch (from 12 pts and set point, rolls lean their way); a
  temper — Fired up (trailing 3+ or just stuffed → surge) / Rattled (2 stuffs/aces against → errors, trait off a
  while); a weakness revealed by scouting, shown in the match UI.
- New-run setup + results screens. Hype scene frequency tuning (§2.3). More music, crowd, voice clips. Living map B/C. Endless mode.

## 9. UI guidelines [locked, not built unless tagged]

Source: the design system artifact https://claude.ai/artifact/DWxheHjahb7L4k8GAWbRGq — `project/README.md` (rules),
`ui-review.md` (findings per screen), `short-copy.md` (glossary + icons), `tokens.json`, component previews (Button,
ChoiceCard, HudStat, StatIcons). Goal: minimal reading load, full player control — the UI previews and explains, it never
chooses or acts for the player.

- §9.1 Principles: one suggested next step always visible (a suggestion, never an auto-action); preview before commit
  (cost **and** result on the control); a locked control shows the gap (`Need OVR 72 · you 41`), never only "Locked";
  bad news first; one colour = one meaning; selected ≠ primary; hotkeys printed on the control.
- §9.2 Colour: tokens in css/theme.css. `hot` = brand + danger only (hero card, destructive, U21, failures) — never
  neutral headings, prices, requirements. Primary button = `ink` fill + `on-ink` text; selected segment/chip =
  `sel-bg` fill + `sel-line` border. Status: `good` +, `bad` −, `warn` at risk, `gold` stars/rewards, `cyan` info/focus.
  Over the 3D map/court: the opaque `hud` surface. New tokens: `hud rgba(12,14,18,.9)`, `line-strong
rgba(255,255,255,.36)`, `on-ink #0b0c10`, `sel-bg rgba(76,201,240,.12)`, `sel-line = cyan`.
- §9.3 Type: Inter body, Rajdhani display (DOM); Dela Gothic One + M PLUS Rounded 1c are canvas-only (overlay, arena). Five styles: display 26 · title 16/600 · body 14 · small 13 · label 12
  uppercase .12em. Floor 12px. Sentence case on buttons; uppercase only for `label` headings.
- §9.4 Short copy: every repeated idea is a glossary term (`GLOSSARY`, `term(id, n)`; §9.6) with one icon and one short
  alias; its full text exists once (its tooltip + Encyclopedia › Glossary). Reward/cost/requirement lines are built
  from terms, read cost → result (`☀1 ▮−20 $8 → ⛉+1`). Mechanics = icons + numbers; flavour = one `small` muted line.
  Glossary text is `registrar` voice (§6); the next-step chip states facts, never advice ("Evaluation W4 · Power 1",
  not "You should train").
- §9.5 Icons: one line-icon SVG set (StatIcons card): Power burst, Defense shield, Speed double chevron, Jump up-arrow,
  Wit eye, Leadership C, Stamina battery, Day sun, Money $, Skill pts diamond, Fans people, Mood face, Bond link,
  Standing flag, Grade tile. Icon in `ink`; the number carries `good`/`bad`. HUD and Player drawer keep word labels
  beside icons (players learn them there). Emoji stay only for map places.
- §9.6 Glossary ids (aliases): `sp` skill pts · `fans` · `sta` stamina · `day` · `money` · `mood` · `bond` · `standing`
  (⚑, −100…+100) · `grade` (S–C, reward ×1.5/1.2/1/0.8) · `seize` (border meter n/2) · `border` · `sim` (result without
  watching) · `academy` · `cup` (U21 Cup) · `trial` (Element Trial checklist) · `quality` (★★? unrated → ★★✓) ·
  `together` (teammates here +20%, +50% at bond 80+) · `rewards` (Win/Loss chips).
- §9.7 Layout: hub HUD in four corners on `hud`; drawers 440px from the right and never over the dock; modals ≤560px,
  one title, ≤3 choices, primary first. Match: the court gets the viewport; site header hidden; log + box score in a
  collapsible side rail.
- §9.8 Alignment and sizes (design system `layout.md`, ActionRow card): 8px grid (spacing tokens only); one content
  edge per container; nested panels in drawers lose their border. Every container ends in one action row: all CTAs
  on one line, equal height (modal 48 · card 40 · list row 32), primary first at the content edge, destructive last
  (`margin-left: auto`); never stacked while each fits 112px. List rows put their CTA in a fixed 120px right column;
  names truncate to one line. Toggles/options sit above the action row. Sizes: drawer `clamp(480px, 36vw, 600px)`,
  hub modal 640px, wide 960px, place card 480px, match rail 360px; HUD corners one inset (16px). Numbers right-aligned,
  tabular-nums.
- §9.9 Match screen (design system `match-ui.md`, MatchLayout card): no page scroll at ≥1280×720; site header hidden.
  Court = `min(100vw − 48px, (100vh − 168px) / 0.44)`, centred, 1000:440 kept (1440×900 → 1392×612). Bands: score
  64px (name + swatch + rotation chips, server chip labelled "serve") · momentum 20px (labelled; "In the zone: {team}") ·
  court (tags underlined in team colour; 2-line commentary ticker on `hud` bottom-left) · control bar 48px (Play |
  Your team | View right-aligned). "Your side" = the team holding `Run.you(RUN)`; career shows Timeout/Tactics for it
  only, Monster game for both. Overlay rail 400px (key B; opens on pause and after the final): Commentary · Box score ·
  Tactics. ⚙ settings = labelled segmented controls (every option visible), opening upward from the bar. Results card
  action row: Continue/Back + Box score; playback disabled.

## 10. Redesign [built through T-129; §10.1a, rail collapse and no-list locked, not built]

Design system pages `redesign.md` + `inventory.md`, mockups in the _Redesign_ group (HubRedesign, SheetMe, SheetPeople,
SheetWorld, SheetSeason, WeekBrief, WeekReport, EventCard, MatchResult, TitleScreen, CreateCareer). Supersedes the
floating HUD, the dock and the 12 drawers (§9 rules still apply). No rule or number changes — layout and flow only.

- §10.1 Hub = top bar 56px (labelled resources, Week n/28, tabs Me 1 · People 2 · World 3 · Season 4, ⚙) + week rail
  340px (you + 4 stats, day track, inbox, End week action row) + map (legend) + place panel 448px
  (right, over the map). No site header, no dock, no floating HUD corners. **No list of places** (owner, 2026-10-03:
  desktop only; places are found on the map). The rail **collapses** to 72px (« / », key `[`, remembered per browser):
  face, days-left stack (7 cells incl. ghost), inbox icon with a count, End week; the map widens.
- §10.1a Info lists (owner, 2026-10-03): a block with more than two facts is a vertical label / value list — one fact
  per line, label `mute` left, value right — never a `·`-joined chain. Applies to the street battle card (facts, and
  per side: cost, injury, Win effects, Lose effects — one effect per line), challenge block, club HQ facts, inbox
  items, week brief rows, match prep notes. Chips stay for short tag sets; `·` only between two items. Toggles and
  options (e.g. the fight's Play it / Sim it) go above the action row (§9.8).
- §10.1b No coach's goal (owner, 2026-10-03): the per-block goal (`Goals.set/check`, `run.goal`, `GOAL_REWARD`, `BLOCKS`)
  is removed — no goal on the rail, brief, Season sheet, calendar or Week report. Skill points and fans come from matches,
  battles and sponsors only. Old saves keep a dead `run.goal` (ignored, no version bump). Sponsors stay. Task T-170.
- §10.2 Day track: 7 slots Mon–Sun; each spent day shows what it was (icon + label), trip days hatched, free days empty;
  a selected place's cost shows as dashed ghost slots before you commit. Match weeks (eval/cup) show one match slot.
  Needs `run.dayLog` (list of `{k, label, stat?, at?}` per spent day, cleared at week start; `run.days` is already the
  days-left number) via RUN_DEFAULTS — no version bump.
- §10.3 Inbox (rail): items until handled — street battle, approaches waiting, Gazette unread, match next week,
  club would sign you. One button each (opens the place / sheet / card). Replaces
  toasts, dock badges and the seize banner (a seize becomes an inbox item for one week).
- §10.4 Sheets open over the map (rail stays): Me (stats, element, skills, life/housing rows) · People (filters, list,
  person detail, approaches answered in place) · World (tabs Factions · Clubs · Rankings; dossier in place) · Season
  (calendar, sponsors, history, Diary/Gazette). ⚙ = Main menu, settings, Abandon run.
- §10.5 Cards: Week brief (every week start; lists battle, payday, match; eval/cup weeks lead to Match prep) ·
  Event (only blocking card) · Week report (after End week; penalties first) · Match prep (eval/cup; two roster
  columns, focus segment, Play/Sim). The old battle intro, Gazette pop-up and recap cards go.
- §10.6 Match result screen replaces the podium overlay: grade tile, your K/B/A/E + focus, rewards chips, growth,
  techniques picked up, top 3, Continue / Box score. The 3D match itself follows §9.9.
- §10.7 Title screen (Continue hero, New career, Encyclopedia, Settings, **Dev** — owner 2026-10-03: a title-screen tab, always shown, with Monster game, player models,
  Benchmark models, the §10.8 word counter (on/off, remembered per browser) and Debug log; `?dev` opens it with the counter on) and Create (role
  cards with key stat, best training places, techniques; name; challenge toggles; Arrive / Back).
- §10.8 Quiet UI (owner, 2026-10-03; design system `quiet-ui.md`, QuietUI card): show the decision, hide the explanation.
  Four layers: L0 glance (names, numbers, icons, verbs + costs) · L1 hover (`tip` / `term`, ≤ 15 words) · L2 peek (new
  `peek()`: click a › or ⓘ → a pinned card beside it, vertical label / value rows ≤ 8, Esc / outside click closes, never
  over the card's action row) · L3 reference (Encyclopedia, Dossier). Budgets at L0: row ≤ 6 words, card ≤ 30 (street battle card ≤ 70:
  its facts and Win / Lose effects stay on the card, §10.1a — review 2026-10-03), week rail ≤ 45, sheet column ≤ 60. Cuts: say it once; no instructions for what the UI already shows (e.g. the "Uses …" line —
  the ghost slots show it); hide zero / default states (standing 0, Neutral, `free` slots, `to play`, Element ???);
  numbers over sentences (`7 left`, `W6`); flavour and rumours on the title's hover; long lists show the useful few +
  `+n ›`; details (challenge, housing effects, facility level, faction economy, border target) in a peek; inbox items
  one line each with a peek. Never hidden: costs on buttons, locked gaps, penalties, deadlines, the event card.
