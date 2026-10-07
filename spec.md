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
- §2.1a Mistakes follow skill, like the real game (owner, 2026-10-04) **[built, T-198]**: per action, from the stats that do
  it (no overall level; `SKILL.use`): serve errors ← Power; hitting errors ← Power 0.6 + Jump 0.4; double contacts ← Speed;
  shanked passes ← Defense 0.7 + Speed 0.3; stuffs ← Jump 0.55 + Defense 0.45. Share of points — OVR 30–60: kills 30 · errors
  55 · blocks 4 · aces 11 (real amateur ~28 · 55 · 5 · 12); league start: 38 · 43 · 10 · 9; all-OP: 51 · 32 · 8 · 8 (real elite
  ~50 · 32 · 11 · 6). Low-level games are won by whoever errs less; at the top, by kills.
- §2.1b Which stat drives which action (reference; Wit scales Power and Defense in play, × 0.75 + 0.25 × wit, with mood,
  momentum and stamina; a negative wit counts as 1 there and in OVR — §2.12a):

  | Action             | Stats                                                                     | Decides                               |
  | ------------------ | ------------------------------------------------------------------------- | ------------------------------------- |
  | Serve strength     | Power (WS ×1, MB ×0.88, S ×0.8)                                           | how hard it is to receive, ace chance |
  | Serve type         | Speed ≥ 60 or Jump ≥ 65 → jump-float; WS with a strong serve → jump serve | flight, speed                         |
  | Serve error        | Power (skill) + Wit; serves over 80 miss more                             | into the net / long                   |
  | Serve receive      | Defense 0.7 + Speed 0.3; Speed cuts the cost of reaching it               | ace or pass quality                   |
  | Shanked pass       | Defense 0.7 + Speed 0.3 (skill)                                           | more aces off weak passers            |
  | Set quality        | Wit + pass quality (non-setters × 0.75)                                   | good / poor set                       |
  | Double contact     | Speed (skill) + Wit, stamina, nerves, pass quality                        | whistle, point lost                   |
  | Spike power        | Power × Jump (set quality, quick / back row, combo)                       | kill vs dig                           |
  | Contact height     | Jump                                                                      | room over the net, net errors         |
  | Hitting error      | Power 0.6 + Jump 0.4 (skill) + Wit, bad set, low contact, over-hitting    | into the net / out                    |
  | Setter dump        | Wit + Jump                                                                | dump threat                           |
  | Block strength     | Defense 0.55 + Jump 0.45                                                  | stuff, touch, block break             |
  | Stuff chance       | Jump 0.55 + Defense 0.45 (skill)                                          | kill block                            |
  | Dig                | Defense 0.6 + Speed 0.4; Speed cuts the reach cost                        | dig vs kill                           |
  | Block cover        | Defense 0.65 + Speed 0.35; Wit < 0.8 cuts it                              | saving a kill block                   |
  | Delayed Spike hang | Jump + Wit                                                                | hangs too long (§9.10)                |
  | Stamina drain      | Defense + Speed soften it                                                 | late-set power and jump               |

- §2.2 Elements: hidden per player; unlocked for OP, ~1/4 of stars, and you via the Element Trial. Gauge fills by
  element play; full gauge or captain buff → next attack is the signature element spike. Counter elements halve. Fiction: lore.md §2 (Trial = modern method; ritual forgotten).
- §2.3 Hype (Off/Normal/Max, tap to skip): attack build-up, blocker read mid-jump (only if a block is attempted; owner 2026-10-07: the blocker's
  wall / read lines only when the block gets a hand on it — kill block, touch, soft block; beaten, broken or tooled: dropped),
  block-break spike cut + ball close-up, kill-block, loose-ball slow-mo, personality chatter. No manga panels. One world
  clock (`A.ts`), eased slow-mo ramps. Target Normal ≈ 6–7 scenes/match **[open: tuning]**.
- §2.3b Rally counter (owner 2026-10-07, the Devil May Cry / Dynasty Warriors combo counter) **[built, T-251]**: every touch of the
  ball in a rally (the serve too) pops a number right of the court — "N touches", bigger with every touch; tiers by colour and a
  word: 6 Rally (gold), 10 Long rally (warn), 15 Marathon (hot), 20 Legendary (hot, pulsing). Shows from touch 3; holds on the
  point, then fades; a new rally clears it. VFX panel → Rally counter: on, shows from, size. No motion with reduced motion.
- §2.3a Air impact (owner, 2026-10-06, the Kuroko look) **[built, T-236]**: every spike (not a tip; power ≥ 58) splits the air
  at the contact — pressure rings stacked along the shot (2 / 3 / 4 by power: hard / heavy 80+ / 95+; owner 2026-10-06: a Doppler cone — the
  biggest at the hand, smaller and closer together down the shot; owner 2026-10-07: they follow the ball — lined up along its
  real flight from the hitter's hand, spread over half of it, each appearing as the ball passes), white wind lines
  thrown out sideways, a jet of air down the line; 95+ adds a pressure dome ballooning out; 100+ (with Hype on, not reduced
  motion) an **impact frame** — the court in negative and in slow motion (×0.15) for 1 s real time, then back to normal speed
  (owner, 2026-10-06; ordinary spikes get no slow-down).
  The hitter's body bends (owner, 2026-10-06): one moderate back arch for every spike (BEND, the look picked from the
  power-50 render — the deeper power-scaled bends were removed), held through the whip until contact, then a small jack-knife;
  the non-hitting arm points at the ball 45° lower than before (not at the sky). Tips unchanged.
  Display only (no beats or draws change).
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
- §2.9a Delayed Spike (owner, 2026-10-04, T-180): the blockers are coming down — no block break, no kill block, no tool;
  only a **fingertip touch** at the tape (still rolled on block power; takes ×0.7 off the spike). Trade-off: the hitter
  can **hang too long** — chance `HANG_FAIL` 0.35 − 0.008 × (jump − 60) − 0.4 × (wit − 1), clamped 3–45 %; the ball drops
  on the hitter's side by the net, the best-placed teammate tries to dig it (a poor pass, rally on), else an attack error.
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
- §2.12 Ego **[removed]** (owner, 2026-10-06): no ego personality, no ego acts (steals, demanded sets, solo blocks and
  block collisions, hero swings / serves), no ego moment, no ego memories, no Egoist game. Old saves drop the field and the memories on load.
- §2.12a Negative wit (owner, 2026-10-04) **[built, T-200]**: wit may be below 0 (`WIT_MIN` −1; fixStats clamps to
  [−1, 3]). It never lowers the body: power / defense in play (`witBody`) and OVR count it as 1. Everything else reads it
  as the lowest wit (match wit `W()` floors at 0.1). No generator makes such players today (the Egoist game went with
  ego, §2.12).

- §2.13 Calls — decisions in a played match (owner, 2026-10-05) **[built, T-232–T-235]**. **One engine, two pickers**: every rule, roll
  and touch is the same code for a simmed and a played match; at a **decision point** the engine asks a picker. Sim (Sim ⏭,
  headless, NPCs, the Monster game) → the AI picks at once, exactly as today (same draws: results and goldens unchanged).
  Played career match → **you** pick for your own player (5 s; then your player takes the suggested move — the option with
  the best odds: win − lose − error);
  the engine pauses there and resumes from that point with the pick.
  - Engine: the rally is pausable (`playRallyGen(m)`, a generator; `playRally(m)` = run it to the end with the AI picker).
    A decision point yields `{ kind, p, options, ai }`; options are pure data computed from the engine's own formulas (no
    draws): `{ id, label, odds: { win, lose, err } (%), stats: [stat keys it leans on], weak: the stat that limits it most }`.
  - Decision points (first set, `DECIDE` in rules.js) **[built, T-233]**: **Serve** (you serve): Safe serve (pace × 0.85,
    faults × 0.45) · Power serve (jump serve, pace × 1.12, faults × 1.6) · Target {their weakest passer} (pace × 0.95) — ace %
    / fault %. **Attack** (the set is yours): Power spike · Placed shot (the cut-shot rule; only with a block up) · Tip —
    kill % / blocked % / error %, the rest is dug. Odds are sampled (300) from the engine's formulas on a private generator,
    with measured corrections (`cal`), and stay within ±6 of what is played (test). "Tool the block" is not an option (it is
    an outcome of a power spike).
    Later: **Set** (you are the setter: which hitter, each with their kill %), **Block** (MB: read · commit · swing).
  - On screen: the world slows to ~5 % over ~0.4 s, the camera holds on you (a tracked chase shot, `A.shot` kind `follow`), a vignette darkens the
    edges, and 2–4 option chips appear beside your player (screen-projected like the name tags): label, success % and the
    stat icons it uses, your weakest of them marked ("⤒ Jump 48"); the best-odds option is marked **suggested**. Keys 1–4, click.
    A 5 s ring (real time) runs down; at 0 your player takes the suggested move by themselves (owner, 2026-10-05). Esc opens
    the pause menu as now (the ring stops while it is open).
  - How often: setting **Calls: Key moments (default) · All · Off** (remembered per browser). Key moments = set point either
    side, deuce, a rally with 6+ touches, the first ball of a set — at most ~8 a match. Off = the AI picks (as in sim).
  - After: the result card (§10.6) gains a **Calls** row: each call — what you chose, its %, made / missed — and "held back by:
    ⤒ Jump" (the weak stat that appeared most in your missed calls), so the match points at the training.
## 3. Menu [built]

- One game + a dev Playtest card: Monster game (`startMonster()`, two all-OP teams); Average game (`startAverage()`: two
  teams of ordinary players, each rolled at OVR 30–60 — owner, 2026-10-04).

## 4. Career world [built unless tagged]

- §4.1 Start: free agent (no team/faction); join via join conditions; money, housing, paydays, league transfers,
  Gazette; Sim ⏭ skips a match. 28 weeks. Unsigned → no league/cups (watch from the stands). `World.pickup` = the
  Academy squad (§4.11).
- §4.2 Island: majors Wei (city; N + E), Wu (coast; E/S + inland strip; most aggressive), Shu (highlands; W); minors
  Street Outlaws, St. Gloria (borderless). Only neutral land: region `open` = **Central Academy** at the Wei–Wu–Shu
  tri-point (540, 500), north of the airport — entry point, no team, never seized. It covers seven hex tiles: its own
  and the ring round it (owner, 2026-10-04; §4.18e). 8 fixed teams (2 per major + 2
  minor clubs) = home squads (training, bonds, scouting, transfers); matches that matter use pool draws (§4.11).
- §4.3 Regions set prices/quality: Wei pricey (maybe overhyped), Shu cheap (maybe hidden gem), Wu sand = technique.
  Quality is **never shown** (owner, 2026-10-03, T-172): no stars, gem / overhyped marks, Quality column or glossary
  term; it only scales EXP (the EXP rating reflects it). The facility **level** (Lv, grows with use) is the one visible tag.
- §4.4 Movement: `run.pos` (start: airport); hotels away from home. Dark except near visited points (`run.fog`,
  REVEAL_R). Click any land to travel. **Walking speed** (owner, 2026-10-05, T-214): a small `Walk 1× 2× 4×` selector at
  the map's top right (usable mid-walk; remembered per browser, `sns_walk`) speeds up your walk on the map — display only.
- §4.5 Week: 7 days. Each action (train/rest/outing/scout) = 1 day + trip (free within NEAR_R, 1 day per TRIP_DAY,
  max 3; routing §4.18). **NEAR_R covers a faction's district** (owner, 2026-10-05, T-228): 110 → 280 design units (× MAP_SCALE),
  so hopping between one faction's places is free (Wei, Shu all; Wu all but its far ends); crossing the island still costs days. Nothing spills over; nights free; only the player ends the week. No random training events (owner, 2026-10-05: every variant removed).
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
- §4.8 Hub: see §10.1 — top bar, week rail, full-screen 3D map, place panel; sheets Me / People / World / Season over the
  map; cards for the week brief, events, the week report and match prep. (The first build's dock and drawers are gone.)
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
- §4.12 Faction dossier (all 5; from the HQ panel and the World sheet's Factions tab), DOM-free `Dossier.build(run, r)`, `registrar` voice:
  - State: Weakened (lost ≥ weakAt) / Pressed (lost 1) / Rising (took > lost) / Stable; minors "Not in the war".
    Border meters, places taken/lost, price and quality multipliers.
  - Facilities held (seized marked): stat, price, level, access
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
- §4.14b Study (owner, 2026-10-05, T-230) — wit for money, a late-season money sink:
  - **Private tutor** (one per major: Wei, Wu, Shu; a SPOTS place, act `tutor`): a day (+ trip) of Wit training at facility
    Lv 5 (the region's price and quality apply as for training), plus your role's key stat (KEYSTAT) as the side gain (base 2).
    Fee `STUDY.tutor.fee` 150 + `step` 40 per session you have ever booked (`run.study.tutor`); **once a week**
    (`run.study.week`); stamina as Wit training. Training caps apply (TRAIN_CAP for the key stat, the wit cap for wit).
  - **Bookstore** (one per major, act `books`): a day (+ trip), no stamina, `STUDY.books.fee` 60 × the region's price. The
    store stocks 3 of `BOOKS` each week (picked by a hash of week + store — no random draws); you buy one, read it that day:
    wit XP = half a Wit day-session (Lv 1) × the book's `mul`, plus its `side` stat XP if it has one. Each book read once
    per run (`run.study.read`). ~12 books: scouting reports, a famous setter's memoir, a blocking manual, an old rulebook…
    (titles follow lore.md's voices). A store with nothing left you haven't read: "Nothing new this week."
  - Both are SPOTS places with pins like the others; names follow lore.md's voice list.
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
  - B: boats, buses, vans, a plane (§4.19a, T-186) and full models for Fern and the named (T-187, T-190) **[built]**;
    waves, gulls, Wu beach pickup games, Shu village smoke, Wei lights, villagers near the Academy, individual NPC and
    approach figures (§4.23) **[locked, not built]**.
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
- §4.18b Island scale (owner, 2026-10-03; × 1.5 again, owner 2026-10-05, T-225) **[built]**: the island is drawn at
  `MAP_SCALE` 2.25 (2385 × 1575 map units, ~1190 × 790 m) — more room between the same towns (they fill out a little:
  ~1,230 lots, was ~970, where roads and places had squeezed them); nature scatters on a wider grid (`NATURE.cell` 18).
  RUN_VERSION 18 (older saves are dropped); the map camera reaches 1,300 m. Towns, minors and the Academy keep their size and building count
  (~720); travel days, the fog reveal radius, the hex tile size (still ~139 tiles) and Wei's wealth fall-off scale with it.
- §4.18c Map view (owner, 2026-10-03) **[built]**: the dark map lifts only round you and your home (explored places stay
  known — their pins show — but dark); a "◎ Me" button (key C) flies the camera to your player; the player model is drawn
  ~3.5× life size (6 m) so it reads on the island.
- §4.18a Training layout (owner, 2026-10-03) **[built]**: Wei's four gyms stand together in one training district
  round the jW1 junction (a short walk apart: little travel inside Wei); Wu's spread thin along the coast (pier by the
  airport, sand courts on the south-east beach, harbor on the east coast, dunes in the north-east); Shu's stay scattered.
  Gain per stat is shown as a rating, not a number (owner): EXP +++ / EXP ++ / EXP + / Almost no EXP (session gain vs points needed).
- §4.18d Airport (owner, 2026-10-04) **[built, T-181]**: a real airport on the south coast where you arrive: a runway
  along the coast (~80 m, parallel to the shore), a terminal with a control tower at the arrival point, an apron with a
  parked plane, a cargo shed. One landmark (`airport`, fixed heading `CITY.airportRot`, no pin; the ✈ Airport label
  stays); lots and roads keep off its footprint (`AIRPORT`). Display only: travel and the start point are unchanged.
- §4.18e Central Academy grounds (owner, 2026-10-04) **[built, T-182–T-183]**: the Academy is its tile + the six round
  it (`ACADEMY.ring` 1, by hex distance; `City.regionAt`), all neutral, never in the war. Campus core (halls, Academy
  Hall, the Grounds) in the middle; a **student quarter** (student flats, cafés, laundromat) fills the ring.
  - **Student flat** (`studio`, the start home; was the Beach shack) stands in the student quarter, west-south-west of
    the core, a short walk from the airport road: rent 150, normal rest, noisy dorm parties now and then.
  - **Academy Gym** (`acaGym`, ring tile toward Shu): a fixed **Lv 1** facility (never levels up) whose session gives a
    little EXP to every stat (Power, Defense, Speed, Jump 2 each, Wit 0.025; 15 stamina) — the free-agent's all-round
    option, worse than any specialised gym for its stat. Teammates never drill there (not in TRAINK).
  - **Roads** (owner, 2026-10-04, T-191): one avenue — airport → the south gate (jAc2) → the campus → the north gate
    (jAc1) → Wei (jWp); no loop past the campus. From the airport the Wei gyms are 1 day, the dunes 2 (trail → dunes 3).
- §4.19 Town layout (crowded; lore.md §3–§5); buildings fill districts (area + style + density), ~700 total (owner, 2026-10-03: thinner and lower — `MapModel.thin` 0.65, tallest towers ~half as high) (Wei
  ~330, Wu ~210, Shu ~85, Outlaws ~40, Academy ~95 (seven tiles, §4.18e), Gloria ~18):
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
- §4.19a The living island — district plan (owner, 2026-10-04) **[built, T-184–T-186]**.
  Every district has a job (what it makes, who lives there); roads carry the flow between them, and the map shows it.
  - **What keeps the island alive** (lore §3–§5): mainland money (sponsors, scouts, tourists) lands at the airport;
    food from Wu's fishing fleet and Shu's terrace farms, sold in Wu town's and Old Town's markets; mainland goods
    unloaded at the harbor's cargo quay, stored in warehouses, trucked over the overpass to Wei; work in Wei's offices
    (league office, Gazette press, sponsor banks) and Wu's workshops and shipyard; each year's newcomers through the
    Academy; power and water from a plant and water tower on Wei's north coast and a reservoir dam in Shu's hills.
  - **Districts:** Airport zone (runway, terminal, cargo shed, bus stop) · Academy (campus core + student quarter) ·
    Wei: civic core (league office, Gazette, bank towers, League Arena), downtown towers, training district (four gyms),
    the Ring (mid-rise blocks, a corner shop and a pocket park per block), Old Town (rowhouses, night market), North works
    (power plant, water tower, bus depot), St. Gloria · Wu: harbor (fish quay and market, shipyard, cargo quay,
    warehouses), Wu town (barracks, workshops, market, family houses), beach strip (resorts, kiosks, sand courts),
    Wu village (net sheds, drying racks) · Shu: three villages ringed by rice / tea terraces, shrine, quarry, reservoir ·
    Outlaws: scrapyard and container stacks under the overpass, betting courts.
  - **Homes** where people like you would live: Student flat — student quarter (start); City dorm — the Ring by the
    training district; Luxury condo — downtown towers by the civic core (not on the Outlaws edge); Abandoned gym — Old
    Town; Highland room — the west Shu village.
  - **Ground use, not only buildings:** fields, terraces, yards, quays and parks as flat ground patches (no lots), so
    the empty land between towns reads as farmland, scrub or industry. Lots stay ≤ `MapModel.maxLots`.
  - **City life** (display only, life3d, hashes, no randoms): buses on the main roads (airport ↔ Academy ↔ downtown ↔
    harbor), vans harbor → overpass → Wei, fishing boats offshore, a plane on the runway; within the life caps.
- §4.19b The Shu highlands (owner, 2026-10-05) **[built, T-222]**: one designed mountain range instead of random bumps
  (`CITY.relief`, global `reliefAt(p)`). **The Peak** — the island's highest point (~110 m), north-west above Shu · Peak;
  Shu just call it "the Peak" (the villagers' old name: **[open]**). **The Spine** — the ridge running south from it (the
  dragon's back the Shu Dragon clubs are named for: Peak on the high side, Valley below), falling from ~55 m to ~14 m.
  **The river** off the Peak's south flank through the reservoir to the south coast, carving the valley floor.
  - **Level ground**: every Shu place, club HQ, venue, home and village stands on a flat pad cut into the slope
    (`MapModel.pads`: centre height, radius + blend), so buildings never sit on a slope; terraces and paddies step down in
    shelves; the quarry is cut in benches.
  - **Rules**: cross-country cost × (1 + height / `RELIEF_COST` 60) — over the Spine costs more than the valley road;
    highland hexes = centre higher than `HIGHLAND_M` (18 m).
  - Hidden (lore, never stated): the Peak's summit holds a weathered stone circle — the old ritual ground; Shu climb it as
    a hardship test and call it a lookout. **[not built: the stone circle, the Thousand Steps' stair line, the dam wall]**
- §4.19c Nature on the island (owner, 2026-10-05) **[built, T-223; not yet: density by zoom]**: the land between towns is alive, not bare.
  Display only (map3d), fixed hashes (no randoms), instanced, within a draw-call / triangle budget; nothing on roads, pads,
  lots, water or the hex labels' anchors.
  - **Objects per biome**: Shu — pines and cedars thick on the Peak's flanks thinning to bare rock and scree above ~60 m,
    bamboo by the villages, boulders on the Spine, tea bushes on the terraces; Wei — street trees on main roads, park trees
    (ginkgo, cherry), clipped hedges in the civic core; Wu — palms and sea-pines along the beach strip, dune grass, drift
    logs, rocks at the headlands; the Academy — lawn trees round the campus; everywhere — small stones and grass tufts.
  - **Random life** (hash-driven, looping, display only): birds circling the Peak, gulls over the harbor, a heron on the
    river, deer at the forest edge in Shu, a cat on Old Town roofs, dogs in the villages. Few, small, readable from the
    default zoom; none in the week-1 campus fence view when the camera is close (density by zoom).
  - **Look**: low-poly, two or three tones per object (no textures), the existing shadow and fog; unexplored land dims them
    with the terrain.
- §4.19d Borders and biomes (owner, 2026-10-05) **[locked, not built — T-224]**: where one region meets another the map
  shows it with nature, not only the hex colour.
  - **Natural border lines**: the Shu–Wei line is the Spine's eastern foothills — a tree line, then a dirt / gravel strip;
    the river is edged with a narrow sand / pebble bank and reeds; Wu's inland edge is the dune grass line; the Academy's
    tiles are ringed by a low hedge and its lawn; the Outlaws' patch under the overpass by fence and scrap.
  - **Biome ground that fades**: each biome has its own ground palette — Shu: moss green → rock grey with height; Wei:
    paving grey and trimmed lawn; Wu: sand → salt-grass; Academy: bright lawn; between two biomes the colours cross-fade
    over ~40–60 m (no hard seam), so the terrain reads at a glance even with the hex fill off. The hex fill stays the only
    faction colour (§4.27); biome tones are neutral nature colours.
  - **Clarity check**: with the tile fill hidden, a screenshot shows where Shu, Wei, Wu and the Academy are.
- §4.29 The named players (owner, 2026-10-04; lore §6) **[built, T-189–T-190]**: `STARS` (js/data/stars.js) and `Stars`
  (js/career/stars.js), new runs only, both modes.
  - **Seated at the start** (no randoms): the rival (Haewon Bae — owner 2026-10-05, her name orange in the dialogue box; WS, Wei · Gold) and the cohort (Praew MB St. Gloria,
    Pond S Shu · Peak, Fai WS Wu · Harbor) replace their club's weakest same-role player; the first aces = the best WS
    of Wei · Iron, MB of Wu · Fort, S of Shu · Valley (renamed if they share a first name with the cohort).
  - **Authored curves**, week 1 → week 28 (the year-1 Cup), linear: rival OVR 76 → 90 (wit 1.15 → 1.45: a star, not OP);
    cohort 70 → 85; first aces 86 → 95 (wit 1.35 → 1.65: OP at the Cup). Stats follow a role shape (key stat highest);
    star / OP by the career criteria. All want `national`.
  - **Never moved**: no league transfer, promotion swap, cut, poach or breakthrough roll touches them (Stars.week replaces it).
  - **On the map**: each drawn as a full model (the default VRM in their club shirt, their hair and skin) by their club's
    HQ, with a name label: `Name · Rival` / `Next ace` / `Ace` (`model.figures`, with Fern).
  - **Story**: Fern names them in the factions lesson; the rival meets you in week 3 (`rivalMeet`: "15 – 4." as a diary line in the box, owner 2026-10-05; "Have we
    played before?", a choice: `No.` / `Fifteen to four.` → flag `rivalTold`; she doesn't remember; flag `rivalMet`).
  - Later: year 2 (the cohort as the island's aces, the first aces aged out), the rival's cut-scene after a year-1 Cup loss.
- §4.20 Match history (Season sheet): every match you were in, newest first — week/day, kind, opponent, score, W/L,
  grade; bench matches "did not play". Snapshot: your OVR, stats, wit at kick-off (+ change since previous), your line
  (kills, attacks, errors, blocks, aces, digs, assists), full box score (name, role, OVR, line). Registrar voice.
- §4.21 Official venues (display only; pin + card: what's held, this week's match; your match's venue glows, the
  match card names it): **League Arena** (Wei downtown by the league office; biggest building, floodlit bowl): U21
  Final Cup + Wei evaluations · **Academy Hall** (campus): Academy evaluations · **Beach Stadium** (Wu sand, faded
  relic): Wu evaluations · **Highland Court** (hillside by Shu Peak HQ, stone terraces): Shu evaluations. Each also
  dresses the 3D match court (§9.11).
- §4.21a Court matches (owner, 2026-10-05, T-229): at any official venue, in a training week (not a cup / evaluation week),
  **Play a court match** — a day (+ trip) and an entry fee, three tiers on the venue card (`COURT`):
  | Tier  | Fee  | Opponents' OVR             | Ace chance | Win prize    | Win fans |
  | Open  | $20  | league mean of the week −5 | 3 %        | 2.5 × fee    | +20      |
  | Pro   | $80  | league mean                | 6 %        | 2.5 × fee    | +40      |
  | Elite | $200 | league mean +5             | 15 %       | 2.5 × fee    | +80      |
  - Opponents: 6 league players (clubs + reserves; never your side, never you) nearest the target OVR — a random pick of the
    nearest 12 — lent like a street crew (`Eval.squad` / `lend` / `restore`), named "<venue> regulars". An ace: one seat goes
    to a named ace / the rival (§4.24) not on your side; the card says so after the draw ("An ace showed up: Praew").
  - Your side: the challenge side (`Fight.challengeSide`: club squad / Academy squad / hired crew — whose cost is paid); it is
    your entry, so **you always start** in your role's seat (Run.lineup forceYou).
  - Play or Sim ⏭ (the T-227 result card either way). Every match: stamina `COURT.sta` 10, match XP (§4.14, the gap factor
    makes Elite pay), technique learning, `Cup.record(run, m, 'court')`.
  - Win: the prize and the fans. **Lose: only the fee** — no mood, no extra stamina, no standing, no Gazette jab; injury roll
    at **half** the street risk (`Fight.injuryRisk` × `COURT.injury` 0.5 — the venue has medics). Injured → no court matches (Fight.ban).
- §4.22a The island at the start (owner, 2026-10-05) **[built, T-226]**: every generated player (clubs, reserves, the Academy
  squad) starts at OVR 40–50 — the rolled OVR (~55–78) mapped linearly onto 40–50 (`CAREER.npcStart`), order and stat shape
  kept; the named keep their curves. Street hustlers 35–60. The league then grows faster from lower: mean ~65 at week 12,
  ~76 at week 28 (was 75 / 86). Join requirements (§4.10) are unchanged **[open: lower them with the league?]**.
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
    shamed −12 (scar; a Gazette jab about them you caused) Fade ×DECAY/week; scars never. ≤ 24 entries (same kinds merge).
    - **Stance** = Σ value × fade × traits: proud ×2 on scars + beat_me; loyal ×0.6 negatives; jealous ×1.5 spot_taken
      and your hero plays count against you; warm ×1.3 / cynical ×0.7 positives; calculating ×1.5 payoff memories
      (won_together, carried, vouched, lent_money), ×0.5 rest. Tags: ally · respect · neutral · resent · enemy.
      **Rival** flag: same-role squadmate within 5 OVR.
    - `bond` = clamp(stance × 8, 0, 100), read-only summary (goals, form, Team drawer).
  - **C. Approaches.** ≤ 2/week, ≤ 1 per person and kind; expire; wait in the People drawer (never block the map).
    By wants + stance: invite_train (place + day → train together; owner 2026-10-05: the People sheet closes, you walk there on the map with the hub locked, they greet you in the dialogue box — "Oh, you're here! Let's start." — then the training cut-in) · ask_sitout (before an evaluation; accept → you
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
  - Shake: slow sway, off with Zooms: Off. Ball trails scale with hit power; all trails fade out when still. Hand trails
    (stars, OP, full element gauge) have a ⚙ Trails style (owner 2026-10-06): Light (hair colour) or Ink — the Lu Bu halberd look: a wider,
    longer black brush stroke with a crimson glow inside (the element colour when charged), fraying into strands as it fades.
  - Models: career player always Main_v2 (own colours); extra loaded .vrm models only in Monster (random per player;
    menu toggle "Model colors: Own / Team", localStorage `sns_keepcol`); everyone else base model. VRM springs use the figure root as center, `HAIR` { stiff 1, drag 0, gravity 1 }.
- §4.26 Modes (`run.mode.story`; every guarantee checks it):
  - **Story** (default; two seasons, §4.28): at the U21 Final Cup you're always in a squad (forced into your faction's first drawn squad
    over its weakest same-role player; Academy member → Academy squad; alone → hired street crew) and always start
    (coach may still sub you tired; SUB.you applies). Squad wins → you're called up (the ending). Other matches keep
    normal lineups.
  - **Endless** **[locked, not built]**: no guarantees; call-up by grades; season rolls over after the cup (aging out,
    senior league, continuing NPC careers: **[open]**).
- §4.28 Aces, the rival and the two-year Story **[draft]** (owner, 2026-10-04; lore.md §6): growth curves are
  authored, not rolled. **The year-1 curves are built as §4.29, whose numbers supersede the guesses below**; two seasons,
  the year-1 cut-scene, aging out and the International pick are not built (the run ends after the year-1 Cup).
  - **Story = two seasons** (28 weeks + U21 Final Cup, twice). MC 19 → 20, U21-eligible both years.
  - **Year-1 Cup won**: no call-up yet — a special cut-scene, then the rival's growth rate goes to its maximum for
    year 2 (the rival answers). The run goes on to year 2.
  - **International pick** (owner, 2026-10-04): only by winning the **year-2** U21 Final Cup — the **true end**: you,
    the rival and the aces are picked together and the **International Cup** follows (new stage, not built). Beating the
    rival elsewhere earns no pick. **Not winning the year-2 Cup** (owner): the rival and the aces are picked without
    you; the diary closes on spite; the run can carry on into Endless (§4.26) as a hook.
  - **Year-1 aces** (generated, one per major, not unique): start ★ star, element on, ~OVR 75–80; fixed curve that
    slows toward a ceiling, OP (~95 OVR, key ≥ 95) by the year-1 Cup; age out after it. No random star / OP rolls.
  - **Rival** and the **named aces** (Praew, Pond, Fai — the MC's cohort): start far above you (~OVR 60–65 while you
    start at 1), authored fast curves; the rival matches the OP aces by the year-1 Cup. In year 2 they are the aces
    (the rival included); you have that year to catch up. Not tied to your OVR.
  - Numbers are first guesses for the balance pass; the shape (year-1 aces ≥ rival > cohort > field; you catch up in
    year 2) is the decision.
- §4.27 Hex territory **[built, T-131–T-134, T-138, T-153]** (owner, 2026-10-03): the war map becomes hex tiles; each tile has its own takeover
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
- §5.2 Portraits **[partly answered]**: 3D head portraits rendered from the player model (owner request;
  js/render3d/portrait3d.mjs via render/faces.js) are built; `faceSVG` stays the fallback. Still open: 2D anime art /
  Live2D for special characters. Original note: now 2D `faceSVG`. Options: VRM head snapshots; hand-made 2D anime portraits; Live2D
  (pixi-live2d-display) or WebM / animated WebP loops for special characters at big moments; unique characters
  mapped by hand (own model + portrait), so the kind varies per character. API when built: `Portrait.show(el, character,
mood)`.
- §5.3 Legacy / Hall of Fame **[dropped]**. §5.4 Character creation rework (deferred).
- §5.5 Severe injury: the permanent −2 on one stat is assumed; confirm in the balance pass.
- §5.6 Faction recolour **[closed — built, T-165]**: Shu `#4ade80` = the `good` status colour, Wu `#3fa9f5` ≈ `cyan`, Wei `#f5b82e` ≈ `gold`.
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

## 9. UI guidelines [locked; built]

Source: the design system artifact https://claude.ai/artifact/DWxheHjahb7L4k8GAWbRGq — `project/README.md` (rules),
`status.md` (which card is built, where it lives in the code, open drift and refactor targets — checked 2026-10-04),
`short-copy.md` (glossary + icons), `tokens.json`, component previews; `ui-review.md` / `inventory.md` / `fix-plan.md`
are the pre-redesign record. Goal: minimal reading load, full player control — the UI previews and explains, it never
chooses or acts for the player.

- §9.1 Principles: no suggested next step (owner, 2026-10-05: the game reminds, it never suggests); preview before commit
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
  watching) · `academy` · `cup` (U21 Cup) · `trial` (Element Trial checklist) ·
  `together` (teammates here +20%, +50% at bond 80+) · `rewards` (Win/Loss chips).
- §9.7 Layout **[superseded by §10.1 for the hub — no HUD corners, dock or drawers]**: modals ≤560px,
  one title, ≤3 choices, primary first. Match: the court gets the viewport; site header hidden; log + box score in a
  collapsible side rail.
- §9.8 Alignment and sizes (design system `layout.md`, ActionRow card): 8px grid (spacing tokens only); one content
  edge per container; nested panels in drawers lose their border. Every container ends in one action row: all CTAs
  on one line, equal height (modal 48 · card 40 · list row 32), primary first at the content edge, destructive last
  (`margin-left: auto`); never stacked while each fits 112px. List rows put their CTA in a fixed 120px right column;
  names truncate to one line. Toggles/options sit above the action row. Sizes: drawer `clamp(480px, 36vw, 600px)`,
  hub modal 640px, wide 960px, place card 480px, match rail 360px; HUD corners one inset (16px). Numbers right-aligned,
  tabular-nums.
- §9.9 Match screen (design system `match-ui.md`, MatchLayout card) — **full-court layout** (owner, 2026-10-07; T-252): the 3D
  court fills the viewport; every control is an HTML glass panel (`hud` ground, `line` border, 12px radius) floating over
  it, like the hub over the map. Nothing UI is drawn in three.js (name tags, ball trail, the venue's big screen stay in-world).
  - **Court**: `.match` is fixed full-screen (site header covered); the court canvas = the viewport. The camera keeps the
    old **horizontal** framing (the 1000:440 shot's width): a taller screen shows more stands above and floor below, never
    less court; a wider one shows more sides. The overlay's logical space stays 1000 wide, its height follows the screen.
  - **Top** (centred, ≤ 1120px, 16px from the top): score bar 64px — name + swatch + rotation chips each side, score and
    set line in the middle — with the momentum line (labelled; "In the zone: {team}") under it, in one panel.
  - **Bottom** (centred, 16px from the bottom): the control bar 48px, groups as before — **Play** `❚❚ Pause Space` ·
    `1× 2× 4×` · `Skip ⏭` | **Team** `Timeout` · `Tactics T` | **View** `Details B` · `⛶ F` (browser fullscreen of the
    whole match screen, HUD kept) · sound · `⚙`. ⚙ ends with `Leave match` (quiet, danger, last). Wraps rather than overflows.
  - **Left**: toasts top-left under nothing (16px); the 2-line commentary ticker bottom-left, above the control bar.
  - **Right**: the rail (Box score · Tactics — Commentary tab cut, owner 2026-10-07, the court ticker stays; key B; opens on pause and after the final) floats 400px wide
    from under the top panel to above the control bar, 16px from the edge.
  - **Over the court**: cut-ins, hype banners, calls and the result card as before (the result card centred over the court).
  - **Bird's-eye camera** (owner, 2026-10-07; ⚙ Camera / key C): 45° down from behind your end line, like watching from a nearby building — your side at the bottom, the opponent on top, the whole court fitted to the screen's shape (a phone held upright gets a tall court); the arena's roof trusses hide; tags sit just over the heads.
  - "Your side" = the team holding `Run.you(RUN)`; career shows Timeout/Tactics for it only, Monster game for both. ⚙
    settings = labelled segmented controls opening upward. Results card action row: Continue/Back + Box score.
- §9.10 Technique switches **[built, T-178–T-179]** (owner, 2026-10-04; design system TechSwitch card): you can hold back a technique you own,
  because some trade something for their gain (e.g. Killer Jump Serve: +10% pace, +3% faults; Delayed Spike §2.9a: may hang too long).
  - **Rule**: switch any time, no cost; it applies from the **next rally** (same as tactics). Career: only your player's
    techniques; exhibition / Monster game: every player on your side(s). A switched-off technique simply never fires
    (`hasTech` false for that player in that match). Nothing switched off = the match plays exactly as today (goldens).
  - **Where**: Match prep card — a `Techniques` row (`n on · m off ›`, a peek with the switches) under Focus. In the
    match — a `Techniques` section at the top of the rail's Tactics tab; the control bar's Tactics button carries an
    `n off` badge while any is off; `T` opens the Tactics tab, `1`–`9` flip the rows while it is open.
  - **Row** (fixed columns): pack icon (Attack / Serve / Defense / Setter) · name · trade line — gain in `good`, cost
    in `bad`, one short phrase each, only what the data states (`trade` field; no `−` part when there is none) · this
    match `used n · won n` (`· faults n` for serves) · switch in the right column. Off rows dim to `mute`, never hide.
    Full SKILL_HOW text on the name's hover. Exhibition: rows grouped under each player's name.
  - **Feedback**: flipping adds a commentary line (`{name} holds back the {tech}` / `goes back to the {tech}`); the
    result screen lists `Held back: …` under your line.
  - **Memory**: career keeps your off-list between matches (`you.techOff` on your player — saved with it, no version bump) and match
    prep starts from it with `Reset`; exhibition switches last one match. Passive skills (Soft Hands…) are not listed.
- §9.11 Match venues **[built, T-193–T-195]** (owner, 2026-10-04; design system MatchVenues card): the 3D court is dressed per venue so a match feels like a place.
  - **Venue of a match**: `fx.venue` if set; career → `City.venue(run)` (arena / hall / beach / highland), else `street`
    (street battles, challenges, pickup games); exhibition / Monster → `arena`. **Stakes** 0–1 set the crowd size: final 1,
    other Cup rounds .85, evaluations .45, street .35, exhibition .9.
  - **Looks**: League Arena — glossy blue court, orange free zone, dark hall, light cones on the court, tiered stands, LED
    board, a big screen behind the far stands. Academy Hall — wood floor with faded basketball lines, green free zone,
    folding bleachers, back wall with windows and light shafts, banners. Beach Stadium — sand, blue rope lines, metal
    bleachers, sea, palms, bright sun. Highland Court — outdoor teal court, grass, mountains, flags on poles, overcast
    light, fog. Street — cracked asphalt, painted lines, chain-link fence, overpass deck and pillars with graffiti, orange
    street lamps at night.
  - **Floor**: free-zone and court colours, attack lines dashed past the side lines, a centre emblem (arena / hall).
  - **Crowd**: flat cut-out fans (4 poses, team-colour tint, neutrals) instead of the capsule figures; they bounce with
    their side's cheer and ride the wave as before; count = capacity × stakes.
  - **Moments**: a side in the zone dims the venue light ~35 % and adds a rim light in its colour; the win drops
    confetti (winner colour, gold, white).
  - **Around the court**: referee on a stand by the far post, two line judges, team benches, scorer's table, ball cart
    (no judges / table in the street). Big screen (arena) and wall board (hall): team names, score, set.
  - **Readability**: backgrounds darker and less saturated than players and ball; nothing taller than the net within
    3 m of the far side line except the referee stand; low-end devices drop the light cones, shafts and props; light cones and shafts
    fade out within 6–16 m of the camera and in close-ups so no light ever covers the view (owner, 2026-10-04).
- §9.12 Motion (owner, 2026-10-05; design system `motion.md`, Motion card, motion tokens) **[built — T-216–T-219; not yet: tooltip delay, dialogue-box exit, match-rail tab fade, stat flip, bar loss flash]**:
  motion shows where a thing came from and went; never decoration, never a wait.
  - **Rules**: input is never blocked (a click during an exit commits at once); exits ≈ 70 % of enters (ease-in), enters
    ease-out; only a surface that just opened / closed / changed animates — a re-render of the same state never replays;
    one surface moves at a time (lists stagger ≤ 3 items, 30 ms); moves 4 / 8 / 12 px, scale 0.96 → 1; origin = pin,
    trigger, tab, centre or bottom edge. Reduced motion (`prefers-reduced-motion` or Settings › Motion: Reduced): fades
    ≤ 120 ms only, no number ticking or pulses, camera cuts instead of flights.
  - **Tokens**: `dur-instant` 80 · `dur-fast` 140 · `dur-base` 200 · `dur-slow` 280 · `dur-scene` 480 ms; `ease-out`
    (.2,.8,.2,1) · `ease-in` (.4,0,1,1) · `ease-move` (.2,0,0,1).
  - **Screens**: a `bg` veil between screens (fade in / out, `dur-scene`), the 3D keeps running under it; hub → match:
    the round title on black ~600 ms while the court binds (skippable); match → result: the result card rises over the
    frozen court (no veil).
  - **Hub surfaces**: place popup — fade + scale from its pin (`dur-base`), another pin = glide + content cross-fade;
    sheets — fade + 8 px from the top bar, tab change = content cross-fade; peeks — 4 px from the trigger
    (`dur-fast`); tooltips — 300 ms hover delay; cards over the map — backdrop fade + card rise 12 px (`dur-slow`),
    card → card = one cross-fade; event choice flashes `sel` before the card leaves; rail fold — width with
    `ease-move`, the map canvas resizes once at the end; dialogue box — slide up 24 px, letterbox `dur-scene`; walk pill
    and training cut-in — fade / pop 0.9 → 1.
  - **Values**: top-bar numbers count over 400 ms with the delta chip rising 8 px over 900 ms; stat numbers flip; bars
    ease (`dur-base`), a loss flashes `bad` first; day track — ghosts fade in, a spent day fills left → right, End week
    empties right → left; inbox rows slide in 8 px / collapse; moved list rows slide (FLIP); a selected pin's ring
    scales 1.15 → 1 once.
  - **Match**: the scoring digit bumps 1.15 (`dur-base`); momentum width `dur-slow`; the rail slides 12 px from the
    right; technique switch knob `dur-fast`. Cut-ins and hype scenes keep their own timing.
  - **Shape**: tokens as CSS properties in theme.css; keyframes `in-rise`, `in-pop`, `out-fade`, `xfade` on classes
    `.in` / `.out` / `.swap`; a `Motion` helper in dom.js — `mark(key)` / `take(key)` (one-render enter flags),
    `leave(el)` (exit then remove; state already changed), `tick(el, from, to)`, `flip(list)`, `reduced`.

## 10. Redesign [built, T-117–T-137, T-159–T-177, T-187–T-188, T-192, T-196]

Design system pages `redesign.md` + `inventory.md`, mockups in the _Redesign_ group (HubRedesign, SheetMe, SheetPeople,
SheetWorld, SheetSeason, WeekBrief, WeekReport, EventCard, MatchResult, TitleScreen, CreateCareer). Supersedes the
floating HUD, the dock and the 12 drawers (§9 rules still apply). No rule or number changes — layout and flow only.

- §10.1 Hub = top bar 56px (labelled resources, Week n/28, tabs Me 1 · People 2 · World 3 · Season 4, ⚙) + week rail
  340px (you + 4 stats, day track, inbox, End week action row) + map + place popup (§10.1c, beside the selected
  pin). No site header, no dock, no floating HUD corners. **No list of places** (owner, 2026-10-03:
  desktop only; places are found on the map). The rail **collapses** to 72px (« / », key `[`, remembered per browser):
  face, days-left stack (7 cells incl. ghost), inbox icon with a count, End week; the map widens.
- §10.1c Place popup (owner, 2026-10-05) **[built, T-215]**: the selected place opens as a popup beside its pin, not a
  fixed right panel. Sized by its content (min 280px, max 440px wide, max the map's height, scrolls inside); placed right
  of the pin with a 24px gap, flipped left when it would leave the map, vertically centred on the pin, kept inside the
  map area (right of the rail, under the top bar, 16px margins); it follows the pin as the map pans or zooms. A pin off
  screen → the popup waits in the map's top-right corner. Same anatomy and action row as before (§10.1, §9.8).
- §10.1a Info lists (owner, 2026-10-03): a block with more than two facts is a vertical label / value list — one fact
  per line, label `mute` left, value right — never a `·`-joined chain. Applies to the street battle card (facts, and
  per side: cost, injury, Win effects, Lose effects — one effect per line), challenge block, club HQ facts, inbox
  items, week brief rows, match prep notes. Chips stay for short tag sets; `·` only between two items. Toggles and
  options (e.g. the fight's Play it / Sim it) go above the action row (§9.8).
- §10.1b No coach's goal (owner, 2026-10-03): the per-block goal (`Goals.set/check`, `run.goal`, `GOAL_REWARD`, `BLOCKS`)
  is removed — no goal on the rail, brief, Season sheet, calendar or Week report. Skill points and fans come from matches,
  battles and sponsors only. Old saves keep a dead `run.goal` (ignored, no version bump). Sponsors stay. Task T-170.
- §10.1d Action lock (owner, 2026-10-03): while your player walks to a place the map camera holds on them and the hub takes no
  input (a "Walking to {place}" pill; 20 s failsafe). A training day then shows a cut-in — spinner, then ✓ Training complete /
  ✕ failed with what changed (click / Space / Enter / Esc, auto after 3.2 s; the top bar keeps the before-values until then);
  a simmed match shows the §10.6 card instead. The map key (Club HQ / Venue / Street battle, faction colours) lives in the
  Encyclopedia (Map key), not over the map.
- §10.2 Day track: 7 slots Mon–Sun; each spent day shows what it was (icon + label), trip days hatched, free days empty;
  a selected place's cost shows as dashed ghost slots before you commit. Match weeks (eval/cup) show one match slot.
  Needs `run.dayLog` (list of `{k, label, stat?, at?}` per spent day, cleared at week start; `run.days` is already the
  days-left number) via RUN_DEFAULTS — no version bump.
- §10.3 Inbox (rail) **[reminders only — owner, 2026-10-05, T-213]**: items until handled — street battle, `N friends
  need attention` (approaches waiting), Gazette unread, the evaluation / Cup countdown (`Eval in 4 weeks`, `Eval next
  week` with opponent and venue, `Cup in 3 weeks`), a seize. No suggestions: no "train X" step, no "club signs you", no
  "end the week". One button each (opens the place / sheet / card). Replaces
  toasts, dock badges and the seize banner (a seize becomes an inbox item for one week).
- §10.4 Sheets open over the map (rail stays): Me (stats, element, skills, life/housing rows) · People (one list with
  markers §10.9, person detail, approaches answered in place) · World (tabs Factions · My club · Rankings; dossier in place) · Season
  (calendar, sponsors, history, Diary/Gazette). ⚙ = Main menu, settings, Abandon run.
- §10.5 Cards: Week brief (every week start; lists battle, payday, match; eval/cup weeks lead to Match prep) ·
  Event (only blocking card: Element Trial or sponsor offer — the random training events are gone) · Week report (after End week; penalties first) · Match prep (eval/cup; two roster
  columns, focus segment, Play/Sim). The old battle intro, Gazette pop-up and recap cards go.
- §10.6 Match result screen replaces the podium overlay: grade tile, your K/B/A/E + focus, rewards chips (incl. stamina), growth
  (each stat with the XP it got: `+N XP`), techniques picked up, top 3, Continue / Box score. The 3D match itself follows §9.9.
  **Every** match you are in ends on it (owner, 2026-10-05, T-227): a simmed street battle / challenge / evaluation / cup tie shows the
  same card over the hub (after the walk there; Continue / Space; no Box score).
- §10.7 Title screen (Continue hero, New career, Encyclopedia, Settings, **Dev** — owner 2026-10-03: a title-screen tab, always shown, with Monster game, player models,
  Benchmark models, **VFX lab** (owner 2026-10-06: every 3D effect on an empty tiled floor — fire one (keys 1–0, Space again), power,
  element, speed 1× / 0.25× / 0.1× / pause, repeat, a stress rate, orbit camera, and the cost readout: fps, frame and fx ms, draw calls,
  live particles; Esc back; owner 2026-10-06: also the VFX tuning panel below), the §10.8 word counter (on/off, remembered per browser) and Debug log; `?dev` opens it with the counter on) and Create (role
  cards with key stat, best training places, techniques; name; challenge toggles; Arrive / Back).
- §10.7b VFX tuning (dev, owner 2026-10-06): every effect value (air impact: from power, Doppler, reach, ring size / count / life,
  wind, jet, dome; impact frame: on, from power, length, slow motion; contact burst; element particles; ground blast on a kill:
  on (off by default), from power, size, sparks, smoke; hand trails: style Light / Ink (= ⚙ Trails; the export's style is the
  default for new players), width, length, ink colour; camera shake (owner 2026-10-07: both — a sharp kick along the shot at spike
  contact, a rumble when the ball hits the floor, bigger on a kill; from power; none with reduced motion or Zooms: Off; panel tests); kill bounce (owner 2026-10-07: a kill at power 95+ rebounds high and flies off the
  court — height and distance by power, the ball is gone until the next serve; on, from power, height, distance); every player (owner 2026-10-07: foundation effects whatever the stats —
  takeoff / landing dust by jump height, sprint dust, a dive's skid, a pop on every bump / dig / set, a save spark when a ball is dug
  off the floor, a tired player's breath; each a 0–3 scale, dust colour); rings (owner 2026-10-07: every ring effect — air impact, bursts, floor
  shockwaves, element rings): style Light / Ink full (black brush ring, glow inside: the ink colour or the effect's own) / Ink
  partial (an ensō: one brush stroke round most of the circle in the glow colour, pressed then lifting into dry strands, a loose
  outer strand, splatter), ink life; ball trail (owner 2026-10-07): style Streak (the 2D line) / Ribbon /
  Ink (3D ribbons on the ball, element colour when charged) / Off, from power, width, length, ink colour; air impact also: share of the flight the rings follow) as live controls — in the Monster
  and Average games (VFX V: a panel at the right, the game keeps playing; Test at the ball: air impact, blast) and in the VFX
  lab. Edits apply to the next effect and stay in this browser; Export = Copy (all values as JSON; the JSON box when the
  clipboard is blocked), Download vfx.json, Import, Reset all. Exported values are baked into js/data/vfx.js to ship.
- §10.7a Title layout = the design system TitleScreen card **[built, T-176–T-177]** (owner, 2026-10-04). Left column at a 96px inset, top-aligned
  from 96px: kicker `4V4 VOLLEYBALL RPG` (label style), wordmark `SPITE & SPIKE` on **one line** (Rajdhani 700,
  clamp(56px, 6vw, 80px), letter-spacing .14em), tagline `Nobody believed in you. Good.` visible (body, `mute`); 56px
  below, the menu stack 440px wide, 12px gaps, buttons 52px high, label left-aligned. Continue hero = ink card, `Continue`
  (title 16 semibold) over one `small` line `{name} · {role name} · Week {n} · {club or Academy}`, `Enter` kbd at the
  right edge; no save → New career is the ink hero. Dev stays always available (§10.7) but leaves the stack: a quiet text
  button bottom-left at the 96px inset (`Dev ›`), its panel opens above it. Right of the column: a 3D backdrop — the match
  arena's empty court with a slow orbit, warm `hot` glow top-right and a `cyan` glow bottom-right over it; static frame
  under `prefers-reduced-motion`, CSS gradients only if WebGL fails. The title word budget becomes ≤ 25 (kicker and
  tagline are back, by owner choice).
- §10.8 Quiet UI **[built, T-159–T-164]** (owner, 2026-10-03; design system `quiet-ui.md`, QuietUI card): show the decision, hide the explanation.
  Four layers: L0 glance (names, numbers, icons, verbs + costs) · L1 hover (`tip` / `term`, ≤ 15 words) · L2 peek (new
  `peek()`: click a › or ⓘ → a pinned card beside it, vertical label / value rows ≤ 8, Esc / outside click closes, never
  over the card's action row) · L3 reference (Encyclopedia, Dossier). Budgets at L0: row ≤ 6 words, card ≤ 30 (street battle card ≤ 70:
  its facts and Win / Lose effects stay on the card, §10.1a — review 2026-10-03), week rail ≤ 45, sheet column ≤ 60. Cuts: say it once; no instructions for what the UI already shows (e.g. the "Uses …" line —
  the ghost slots show it); hide zero / default states (standing 0, Neutral, `free` slots, `to play`, Element ???);
  numbers over sentences (`7 left`, `W6`); flavour and rumours on the title's hover; long lists show the useful few +
  `+n ›`; details (challenge, housing effects, facility level, faction economy, border target) in a peek; inbox items
  one line each with a peek. Never hidden: costs on buttons, locked gaps, penalties, deadlines, the event card.
- §10.9 Clubs and People, one list each **[built, T-168–T-169]** (owner, 2026-10-03; design system `quiet-ui.md` § One list, cards SheetWorld,
  SheetPeople):
  - **Sign only at the club's HQ.** No Sign / join button in the World sheet, the dossier, the inbox or anywhere else;
    the HQ place panel keeps `Sign` / the locked gap (one place to commit, §9.1 rule 3). The World tab **Clubs** becomes
    **My club**: a shortcut card for your club (chip, name, OVR, your role + squad spot, `HQ ›` → map pin, `Dossier ›`).
    Free agent: the card says `Free agent` and lists clubs that would sign you now as links to their HQ (name + OVR, no
    button; none → `Nobody would sign you yet` with the nearest gap on hover). (The inbox no longer
    lists signable clubs — §10.3.)
  - **People = one list.** No Everyone / Squad / Rivals / Waiting tabs and no group headings. One list ordered: waiting
    (`!` badge) → favourites → squad → bench → others → gone. Each row carries small markers after the name instead of
    groups: team `🛡` in your club colour (outlined = bench), rival `⚔` (Rel.rival or stance resent / enemy), favourite
    `★`. Bond bar for squad mates, stance tag only when not neutral (as now). Hover of a marker names it.
  - **Favourites** (new, display only): a `☆ / ★` toggle in the person header pins them in the list. `run.fav` = list of
    person ids via RUN_DEFAULTS (no version bump); a gone person keeps their star.
  - Squad chemistry and `Leave squad` move from the Squad tab to a `Chemistry ›` peek in the list header (shown only
    with a squad).
- §10.10 Dialogue box and story scenes **[built: runner, box, intro, hub triggers, guide, week-1 campus — T-173–T-175, T-187/T-188, T-192, T-196]** (result trigger: the first hub after one of your matches, `when` won / lost, ahead of any lesson — no scene uses it yet) (owner, 2026-10-04): the classic RPG **dialogue box** (message
  window) for story and events — so any scene is data, not code.
  - Box: bottom of the screen over the live map / court, ~1/4 height, full width minus the rail; **name plate** (the
    speaker, lore.md §7 voice; faction colour only on the plate's border), **portrait** on the left (`faceSVG` now,
    VRM head snapshot later — §5.2), text **types out** (fast; click / Space / Enter completes the line, then advances);
    a ▼ marker when the line is done. **Choices** as a vertical list in the box (keys 1–4, never more than 4).
    Hotkeys printed: `Space` next · `L` log · `Esc` skip scene (inline confirm). **Log**: the scene's lines so far.
  - **Cut-scene mode**: letterbox bars, hub UI hidden, the camera may move (map fly-to, a 3D staged shot); the box
    sits inside the bars. **Narration** (the MC's diary voice) = italic, no portrait, no plate.
  - Scenes are **data** (`js/data/story.js`): steps `say` (speaker, text, mood) · `choice` (options → goto / set) ·
    `cam` (map: onto you) · `walk` (you walk to a place / home; free, no days) · `cut` (dark / letterbox mode) · `title` (a big centred line) · `wait` · `set` (a story flag) · `diary` / `gazette` (a line) · `goto` · `end`;
    each scene has a **trigger** (Story start, week, place visited, match result, flag). Runner `Story` (DOM-free,
    `js/career/story.js`) plays steps; the UI only renders the current step. Seen scenes and flags live in
    `run.story = {seen, flags}` via RUN_DEFAULTS (no version bump). No randoms; Story mode only (Endless skips).
  - Library: none needed. Ink (inkjs, MIT, on jsDelivr) was considered for branching scripts; not now — the scenes
    are short, and plain JS data keeps saves, flags and tests in our own format. Revisit if scenes grow long.
- §10.10b Squad introductions (owner, 2026-10-05) **[built, T-221]**: every time you join a squad — the Academy squad at
  the start (right after the intro) and every club you sign with — the next hub plays a short scene: a diary line ("The
  Academy squad. Five strangers…" / "{club}. New shirt, new faces."), then each teammate in turn (captain first, the bench
  last; their portrait and name) says their role (captain / on the bench) and one line in their first trait's voice (two
  lines per trait, `MEET`; hints, never the trait's name), then a closing diary line. Once per squad; Story mode only.
- §10.10a The guide: Fern (owner, 2026-10-04) **[built, T-187–T-188]**. No tutorial voice (lore §7): the first weeks are
  taught by a person — **Fern Kittisak**, your flatmate in the Student flat (lore §6). Story mode only.
  - **Meeting**: the intro ends with a normal first meeting at the flat (name, house rules, "last year of U21 for me"),
    one offer of a tour (`Please.` / `I'll figure it out myself.` → flag `noTour`: no lessons ever), and the one fact
    she says either way (week 4 is the evaluation; grades decide offers).
  - **Week 1 on campus** (owner, 2026-10-04, T-192): the intro ends with Fern pointing the camera at the Academy Gym ("stay on
    campus this week") and its card open. Until week 2 (`City.fence`, flag `campus`; Story mode only): no place, trip, scouting,
    battle or challenge off the Academy's seven tiles (locked = the reason "Week 1 — the campus first"), the camera stays over the
    campus (`model.fence`, ≤ 150 m away), and the intro's card opens on the Academy Gym. Week 2 opens with `explore`: the camera
    pulls back over the whole island and Fern says where things are and that trips cost days; then the island is open.
  - **On the map**: her model (the default VRM dressed: teal hair, Academy hoodie) stands by the Student flat's door with
    her name over her head (`model.guide`), whether or not you still live there; gone when `guideGone` is set (her
    leaving after the year-1 Cup: later).
  - **Lessons**, each once, never after `noTour`. The facility lesson stays a hub moment (`{on: 'hub', when: 'trained'}`, at
    most one scene a day): after your first session — training for what ({role} lives on {key}, gym levels, the Academy
    Gym, the stamina fail / injury lines). **Every other lesson comes the first time you click that kind of place on the
    map** (owner, 2026-10-05, T-220; trigger `{on: 'pick', when: STORY_PICK key}`, `Story.pick` from mapPick / mapPoint;
    the place's card waits behind the scene): the street battle pin — the tile war, joining vs watching; a club HQ or any
    tile — the factions, one biased line each, and the named players; your home — payday sums and moving house; a match
    venue — evaluations and her own first one on the bench.
    Numbers in her lines are true (§7); her opinions are hers.
