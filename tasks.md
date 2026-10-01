# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. Never start **Later** tasks: they are outlines, and the spec
chat details them (files, steps, accept) and moves them to Now when their phase starts.

Status: `[ ]` todo · `[~]` in progress · `[?]` blocked — see Question · `[x]` done

## Task template
```
### [ ] T-000: <imperative title>
Spec: §x.y          Goldens: unchanged | update (<why>)          Save: no change | RUN_VERSION bump (<why>)
Goal: <one or two sentences: the observable outcome>
Files: <exact paths the build chat may edit; new files marked (new) — also add to index.html + test3d.html>
Do not: <things that look tempting but are wrong for this task>
Steps:
1. <concrete step naming functions/constants/globals>
Accept:
- <checkable criterion: test, headless sim number, or visible behaviour>
QA: none | Monster game | career run → <screen and action>
Result:
```

## Roadmap
- Phase 1 — Island rules ✓ · 1b — Match feel ✓ · 1c — Cut-scene lines ✓ · 2 — Faction pools ✓
- Cleanup + info ✓ (T-016 Legacy removed, T-017/T-018 faction dossier)
- Phase 3 — Evaluations ✓ (T-008–T-011)
- **M2 — three.js map** ✓: scaffold ✓ (T-023), walking player ✓ (T-024), parity ✓ (T-025).
- **Phase 4 — U21 Final Cup** ✓: bracket with byes (T-019); U21 cup from drawn squads (T-020). The 8 league
  teams stay as faction home squads.
- Match music ✓ (T-032)
- Block tactics ✓ (T-026 lane-read block, T-027 defence setting + scouting habits).
- Substitutions ✓ (T-028 squads of 6, T-029 in-match subs, T-030 coach AI, T-031 you on the bench).
- Growth rework ✓ (T-034 training cap 75, T-035 match XP, T-036 techniques learned in play).
- Living map A ✓ (T-039, T-040) · three-touch fix ✓ (T-043) · rankings ✓ (T-041, T-042) · team challenge ✓ (T-037).
- Rankings drawer fix ✓ (T-044).
- Challenge loss + injury ✓ (T-038).
- Roads + buildings ✓ (T-045 layout data, T-046 3D town).
- Walk the roads ✓ (T-047) · town layout revamp ✓ (T-050 data, T-051 render).
- Match history ✓ (T-052).
- Free setter takes the second ball ✓ (T-054) · start from 1 ✓ (T-055).
- Stat guard ✓ (T-056) · official venues ✓ (T-053).
- Smarter coach ✓ (T-057).
- **Now**: player camera: Follow (T-058), POV (T-059), Story mode cup guarantee (T-067), ego (T-068), block collision (T-069). **Then**: relationships — the core pillar (spec §4.23, T-060…T-066), road travel (T-048), voice pass (T-022).
- **Phase 5 — Voice pass**: faction/region/Gazette strings rewritten in lore.md §7 voices.

## Now — Player camera (§4.25), Story mode (§4.26), Ego (§2.12)

### [x] T-058: Follow camera — 3rd person behind your player
Spec: §4.25          Goldens: unchanged (presentation only)          Save: no change
Goal: A third match camera, Follow: behind and above your player, turning with your side, easing toward the ball when
you touch it. Career: your player; Monster games: a "Follow" select lists every player on court.
Files: js/render3d/camera3d.mjs, js/render3d/r3d.mjs, js/ui/match-screen.js, css/style.css, ARCHITECTURE.md
Do not: touch js/engine or beats; draw randoms; break scene shots (they still cut in and ease back); change Broadcast /
Courtside framing; move the 2D overlay's projection off `base` (P3D keeps working in every mode).
Steps:
1. camera3d: `camMode` gains 'follow'; `setFollow(id)` / `getFollow()` (the player to follow; null → Courtside).
   Follow pose each frame from the followed figure (world.people, as shotPose finds them): position = the player's
   hips + back 4.5 m (away from the net, along their side's court axis — not their facing, so it doesn't swing) + up
   2.6 m + a small lateral lean toward the ball; look = a blend of a point 3 m in front of the player at head height and
   the ball (ball weight 0.35, 0.6 while the ball is on your side); FOV 55. Ease position / look with exp smoothing
   (~0.25 s) so cuts between rallies don't jump; clamp so the camera never goes below 1.2 m or inside the net plane.
   When the followed player is subbed off / not on court: fall back to Courtside until they return.
2. Blend: the existing courtside `blend` becomes a small mode blend (broadcast / courtside / follow weights) so a mode
   switch eases in ~0.6 s; scene shots keep overriding as now.
3. r3d: expose `setFollow`, `getFollow`; re-export camMode values.
4. match-screen: the camera button cycles Broadcast → Courtside → Follow (label "Camera: Follow"); in a career match
   Follow targets your player (`p.you`); in a Monster game a small select next to the button picks the player (shirt
   number + name), shown only in Follow mode. The choice of mode is remembered (`sc.cam3d`, as today; try/catch).
5. ARCHITECTURE.md: camera modes.
Accept: all tests + lint.
QA: Monster game, Follow on a WS: 1500 steps — the camera stays behind the player, the ball stays on screen ≥ 90 % of
frames (project the ball through `cam`), no jump > 3 m between frames outside scene cuts; hype scenes still cut in and
back; switch modes mid-rally smoothly; career eval: Follow targets you; no pageerror. Screenshots in the Result.
Result: Follow camera done as specified; mode weights replace the blend, follow pose tracked in every mode (no jump on switch). QA Monster WS 1500 steps: ball on screen 99.7 %, max frame move 1.06 m (no jump >3 m), cam y ≥ 2.3 m, mode switches ≤ 2.9 m/frame, scenes cut in/back; career eval follows you (select hidden); no pageerror; 48/48 tests, lint clean. Select list isn't refreshed after a sub (falls back to Courtside).

### [ ] T-059: POV camera — 1st person from your player's eyes
Spec: §4.25          Goldens: unchanged (presentation only)          Save: no change
Goal: A fourth mode, POV: the view from your player's head — the ball, the net, the block in your face — with your own
head hidden, and a safe fallback to Follow during wild moments.
Files: js/render3d/camera3d.mjs, js/render3d/r3d.mjs, js/render3d/actors3d.mjs, js/ui/match-screen.js, ARCHITECTURE.md
Do not: touch js/engine or beats; roll the camera; let the camera clip into the followed body; break scene shots.
Steps:
1. camera3d 'pov': position = the followed figure's head bone + 0.08 m forward; look = toward the ball when it is in
   front of you (within 100° of your facing), else straight ahead along your facing at head height; FOV 70; no roll;
   position smoothed lightly (head bob ≤ 5 cm), look smoothed (~0.12 s).
2. Fallback: while the followed player is airborne above 0.6 m (spike / block jump) or diving, or the look direction
   turns faster than 220°/s, blend to the Follow pose (0.25 s) and back after landing — no motion sickness.
3. actors3d: the followed player's head (and hair / accessories) hidden in POV via a per-figure flag (`setPovHidden(id)`);
   arms stay visible so your own hands show on digs and spikes.
4. match-screen: the camera cycle adds POV after Follow; same player rule as Follow.
5. ARCHITECTURE.md: POV.
Accept: all tests + lint.
QA: Monster game POV on a setter and on a WS: 1500 steps each — no frame shows the inside of the own head (head hidden),
the fallback kicks in on every jump (log the switches), ball on screen ≥ 70 % of frames when it's on your side; leaving
POV restores the head; no pageerror. Screenshots in the Result.
Result:

### [ ] T-067: Story mode — you always play the U21 Final Cup (Endless kept for later)
Spec: §4.26          Goldens: unchanged (career only)          Save: RUN_VERSION 8 → 9 (`run.mode.story`) — older saves dropped
Goal: A run has `run.mode.story` (default true; creation offers Story, with Endless shown disabled "coming later").
In Story, the U21 Final Cup always includes you as a starter, and winning it always calls you up.
Files: js/data/career.js, js/career/run.js, js/career/cup.js, js/career/pool.js, js/ui/career-create.js,
js/ui/career-end.js, tests/run.js, ARCHITECTURE.md
Do not: change evaluations, challenges, street fights or Run.lineup outside the cup; touch js/engine; change the cup's
bracket or seeding rules.
Steps:
1. career.js MODES gains `story` (name 'Story', desc in registrar voice) and `endless` (disabled, "later");
   run.js: `run.mode.story` (create + repair: missing → true); RUN_VERSION 9.
2. Cup.entrants (Story): if you are signed with a pool faction and no drawn squad holds you, put you into that
   faction's first squad in place of its weakest same-role player (fallback: weakest player); Academy member → the
   Academy entrant as today; alone → add an entrant "Street crew" of you + hired players (rating CHALLENGE.hire.ovr,
   generated without R() draws that shift other draws — use a fixed hash for names / stats).
3. Cup lineup (Story): before each of your cup matches you start in your role (`Run.lineup` gains an optional
   `forceYou` used only by the cup path; injured you still sits — injury beats Story).
4. Cup end (Story): champion → the run-end screen states the call-up ("Called up to the national team"), whatever your
   grades; otherwise unchanged. Endless isn't playable yet: no other change.
5. tests `'career: story mode cup'`: an undrawn signed player is forced into the first squad; an alone player gets
   the street-crew entrant; you start every cup match even with the lowest OVR; injured → benched; champion →
   called up; `mode.story = false` keeps today's behaviour (not drawn → watch from the stands).
6. ARCHITECTURE.md: modes and save v9.
Accept: all tests + lint; goldens untouched.
QA: new run (Story) → force week 28 end with a weak player → you are in a cup squad and start; ⏭ to the end; no
pageerror.
Result:

### [ ] T-068: Ego — show-offs steal balls, call sets, block alone (wit = maturity)
Spec: §2.12, §2.0          Goldens: update (new decisions in every rally)          Save: no change
Goal: Every player gets an ego (0–1); low-wit players act on it — ball steals, set calls, solo blocks, hero swings,
hero serves — with maturity from wit cutting both how often and how badly. Logged for the relationship memories later.
Files: js/data/rules.js, js/engine/players.js, js/engine/match.js, js/engine/rally.js, js/engine/rally-phases.js,
js/engine/rally-defense.js, js/engine/serve.js, js/data/dialogue.js, js/career/run.js, tests/run.js, ARCHITECTURE.md
Do not: add an act kind (use `plabel`, `pose`, `log`, `chat` / existing chatter); add randoms to presentation; change
saves beyond the player field `ego` (teams save it; old saves get the hash value on load); let one ego act decide a
rally on its own more than its EGO table says.
Steps:
1. rules.js `EGO = { base: { steal, call, solo, swing, serve }, captain, err: { … } }` (doc comment; start values small:
   aim for ~1–3 ego acts per side per set among average-wit players, ~0 with wit ≥ 1.8). `maturity(p) = clamp((p.wit −
   0.5) / 1.5, 0, 1)`.
2. players.js: `p.ego` in createPlayer (spec value wins; else a hash of the player's id/name → 0.2–0.8, WS +0.1, no R()
   draw so generation stays identical); your player: 0.6 (run.js create).
3. Engine hooks, one R() each only where an opportunity exists and its chance is > 0 (no draw at chance 0): dig / pass (rally-phases / rally-defense: an ego mate
   other than `nearest` within reach → steal: collision chance by both players' maturity, else they take it);
   pickSetter/chooseAttack (set call: the setter's maturity resists); formBlock (solo block: the ego blocker ignores
   `dset`); attack on quality-1 sets (hero swing instead of the safe shot); serve (hero serve → jump serve).
   Captain call-off per §2.12. Record `m.egoLog.push({ act, p, ok, mate? })` (engine-only).
4. Presentation: "MINE!" `plabel`, bump poses on a collision, a log line; set-call chatter lines in dialogue.js (street
   voice, 5 lines). Hype scenes unchanged.
5. tests `'engine: ego'`: 400 sims — ego acts per side per set in range for average wit, near zero for wit ≥ 1.8;
   success rate rises with maturity; collisions only on steals; with ego 0 everywhere the match is identical to an
   ego-free reference run of the same seed (no extra draws when no opportunity); T-026 stuff / kill tests still
   pass (retune EGO, not those tests, if they don't); report kill % and error % before / after.
6. `npm run test:update` with the reason. ARCHITECTURE.md: ego.
Accept: all tests + lint; goldens updated for this reason only.
QA: Monster game with all wit set to 0.6: 2000 steps — "MINE!" labels, a collision, a solo block seen; with wit 1.9:
almost none; no pageerror.
Result:

### [ ] T-069: Block collision — cancelled blocks and the net-fault variant
Spec: §2.12 (Block collision)          Goldens: update (a new outcome on solo blocks)          Save: no change
Goal: When T-068's solo block meets a partner who also commits, the two blockers collide: both blocks cancel early (an
open net for the attack) or, in the error variant, a net fault ends the rally; a floating "BLOCK COLLISION" label in a
warning or error style marks it.
Files: js/data/rules.js, js/engine/rally.js, js/engine/rally-defense.js, js/render/playback.js, js/render/court.js,
js/render3d/actors3d.mjs (only if the stagger needs it), tests/run.js, ARCHITECTURE.md
Do not: add an act kind (extend `plabel` with an optional style flag, and use `jump` / `slide` / `pose` / `log`);
make collisions happen without a solo block; touch the scene shots.
Steps:
1. rules.js EGO gains `collide` (chance the partner also commits = collide × (1 − partner maturity)) and `net` (share
   of collisions that become a net fault). Start values: collisions ≈ 10–20 % of solo blocks, net faults ≈ 30 % of
   collisions.
2. Engine (where the solo block is decided, T-068): on a collision — no block touch this attack (the attack resolves
   vs an empty net: today's no-block path); both blockers' jump acts end early (`jump` mode 'down' at ~40 % of the
   normal hang), they `slide` 0.3 m apart and take a stagger pose (reuse an existing pose, e.g. 'bump' / landing);
   net-fault variant: the rally ends at once, point to the attacking side, a log line "Net fault — block collision".
   Record `m.egoLog.push({ act: 'collide', p, mate, net })`. One R() for the partner, one for the net share, only when a
   solo block happens.
3. `plabel` gains an optional `v` ('warn' | 'err'): playback passes it to the label; court.js drawLabels colours warn
   orange (#ffb13d) and err red (#ff4d4d), stamped (pop-in) like big labels. Text: "BLOCK COLLISION" / "BLOCK
   COLLISION · NET", anchored between the two blockers at net height. The act-kind test still passes (no new kind).
4. tests `'engine: block collision'`: 400 sims with ego forced high and wit low — collisions happen only after a solo
   block; no block touch on a collision; net-fault rallies end with the point to the attackers and no attack contact
   after it; label acts carry `v`; with EGO.collide 0 the stream equals T-068's; T-026 stuff / kill tests still pass.
5. `npm run test:update` with the reason. ARCHITECTURE.md: the collision outcome and the plabel style flag.
Accept: all tests + lint; goldens updated for this reason only.
QA: Monster game with ego 0.9 / wit 0.6 for every player: watch until a collision — both blockers come down early and
stagger, the label shows in orange; a net-fault one in red and the point ends at once; screenshot both; no pageerror.
Result:

## Later — outlines (not ready: the spec chat details each before it moves to Now)

Relationships — the core pillar (spec §4.23; detailed one by one after T-059)
- T-060: NPC careers — wants, traits, status, weekly plans, activity-based growth (data + headless sim).
- T-061: Memory log + stance + bond as a read-only summary (all bond sources become memory kinds; ego acts from `m.egoLog`).
- T-062: People tab — person cards, discovery of wants / traits, top memories.
- T-063: Approaches — NPCs come to you (and to each other); you approach them.
- T-064: Fates — cut / quit / poached / national; end-of-run "People who mattered".
- T-065: NPC ↔ NPC memories, cliques, squad chemistry.
- T-066: On-court effects — trust / freeze-out set distribution, cover, rival mood (engine, goldens update).

Roads, part 2 — spec §4.18
- T-048: Road travel — trip days from the road route length (roads faster than cross-country; Shu paths slower);
  rules + tests change (career only).

Injuries, part 2 — spec §4.15
- (T-049 merged into T-057.)

Phase 5 — Voice pass
- T-022: Faction `front`/`dark`, region `desc`, Gazette and event strings in lore.md §7 voices. Also fix the stale
  encyclopedia line "Or learn it in career for this many skill points" (ui/encyclopedia.js: techniques are learned in play).

## Done

- [x] T-057: Smarter coach subs, trust in your player, never sub an injured you on — worth test (`SUB.worth` [0.85, 1.05] by coachIQ), `SUB.you` 0.9, `noSub` (set in `Cup.prepare` when injured, cleared by `restoreLineups`); 48/48, lint clean. Goldens updated (teams, matches, sims): coaches now skip subs that make the side worse. Subs per match (both sides, 300 sims): default coach 3.04 → 1.97; coachIQ 0 2.94 → 2.57, coachIQ 1 3.10 → 1.76; tired 831 → 543, errors 15 → 7, back 67 → 40. The 'coachIQ 1 subs sooner' test now zeroes `SUB.worth` (the roll's effect only). `m.subLog` also records `out`, `inn`, `sta`. QA: Monster game (SUB.sta raised to 0.95 so subs show; 9000 steps) 4 subs, log lines 'Sub <team>: #13 … in for #17 … (tired)'; career eval with `run.injury`: `noSub` set, you stayed on the bench the whole match (4 subs, none for you), flag gone afterwards; no pageerror.
- [x] T-053: Official venues on the map — League Arena, Academy Hall, Beach Stadium, Highland Court — four venues as specced (`VENUES`, nodes, landmarks, pins, `City.venue`, cards, `today` pulse); 47/47, lint clean, goldens untouched. Spots: arena [720,160] (clear 52), hall [580,510] (clear 20, ~18 × 11 m so the Academy keeps 33 lots), beach [925,450] on the widest sand by the resort strip (edge `resort`–venue), highland [400,180]. Venue clearance is per venue (`VENUES[id].clear`), not `placeClear`. QA: draw calls 29–30 (baseline 29), tris ~198k, no pageerror; hall pin pulses on an Academy eval week, card + 'Played at Academy Hall' shown; cup-week card checked in tests only (a browser cup start failed in my QA script on the baseline too).
- [x] T-056: Stat guard — repair invalid stats on load and before every match — `fixStats` in players.js, called in `teamFromJSON` (warn log) and `newMatch`; new test (−40/NaN/300/−1 → 1/1/99/0.1, match runs, damaged save repaired); 46/46, lint clean, goldens untouched.
- [x] T-055: Start from 1 — every stat of your new player is 1 — Done; tests 45/45, lint clean, goldens untouched. `CAREER.start` / `statMin`, `STAT_FLOOR` 1, Run.create ignores alloc, creation shows 1s with no buttons, `need` = max(1, round(…)) at every level. Notes for the spec: (1) one Power session takes Power 1 → ~36 (session XP is ~70+ × mul vs ~180 XP to reach 50), not "about a dozen sessions"; (2) a lone WS still starts: the pickup squad has only 2 WS (the coach picks the best per role), so the all-1 bench test uses an MB; (3) cup.js hired crew floor left at 25 (that squad never contains you when clamped). Tests with `alloc` still pass it (ignored); the street-battle and full-run tests assume a normal player (70 / statMin). QA: creation, 1 Power day, week-4 eval played: no pageerror.
- [x] T-054: A free setter takes the second ball (no random "someone else sets") — Done; tests 44/44, lint clean. Goldens updated (matches, sims: one R() per bad pass removed, setX/setZ rolled before the choice) — teams hash unchanged. Reach rule `SETTER.beat` 1.6; `m.setBy` records why. Assists by non-setters 12.3 % → 8.7 % over 400 mkTeams sims. The staged-scenes test (10 matches, ≤ 8/match) tripped on the moved stream (9.1; 40-match mean 6.3–7.8 before and after): widened to 30 matches, thresholds unchanged. Monster QA 5000 steps: 9 sets, all by the free setter, no pageerror.
- [x] T-052: Match history in the Season drawer, with a stat snapshot per match — Done; tests 43/43, lint clean, goldens untouched. RUN_VERSION 8 (`run.mlog`, `MLOG.max` 80); `Cup.record` at the start of result / challengeResult / clashResult; Season drawer lists them with an expandable snapshot, line and box score (fits the 440 px drawer, no horizontal scroll; QA: 2 evals + a challenge, no pageerror). Challenge / street `day` is the day before the trip is spent.
- [x] T-051: Draw the revamped town — wide beach, boardwalk, overpass, new building kinds — Done; tests 42/42, lint clean, goldens untouched. Default zoom 29 draw calls / 188k tris, zoomed out 30 / 195k (limits 40 / 260k); software-GL fps unchanged (2.75); 3 leave / return cycles: geometries stable (25), no pageerror. Height × (1 + 2.5·h·rise); wealth tint per instance (glass-blue / stone / gold vs grey / rust / patched wood); fog dims every new mesh. Extra: resort scale [1.9, 5.5, 1.2].
- [x] T-050: Town layout data — districts, a wider beach, Wu town inland, the overpass — Done; tests 42/42, lint clean, goldens untouched. Frozen `CITY.inner`; frame 1060×700; coast pushed out; `CITY.dunes`; `WEALTH` + `wu-village` (`wuVillage` [905,225]) added; Wu links: only the coast road `main`, `hotelWu–jBw3` / `hq2–wuVillage` dirt (dropped `resort–harbor`, `jBw2–hq3`; ≤ 2 links into each settlement). Lots ~1190 (Wei 572, Wu 341, Shu 158, Outlaws 65, Academy 33, Gloria 25), wealth Wei 0.07–1.0 falling outward, Wu 0.4–0.6. Deviations: `MapModel.placeClear` = 20 (spec's NEAR_R/3 cannot reach Gloria ~30 / Outlaws ~60); `arcade` → [620,262], `resort` → [908,488] (kept on land); `tall` dropped from DISTRICTS (h comes from wealth); lot size ×(0.7+0.6·wealth), grid density × (1.15−0.45·wealth); `CITY.ritual` joins the places lots keep clear of.
- [x] T-047: The player walks along the roads — Done; tests 41/41, lint clean. Airport → Highland Dojo QA: the camera follows the coast road then the Shu dirt road (not the straight line), ×4 badge shown, no pageerror. `MapView.routed` adds `you.route` on mount and update (also on a remount after a move).
- [x] T-046: Roads and buildings on the 3D map (kit registry, procedural first) — Done; tests 41/41, lint clean, goldens unchanged. kit3d.mjs (KIT + LANDMARKS registry) and town3d.mjs; +4 draw calls (28 vs 24) and +6k tris (156.7k vs 150.7k incl. shadow pass) at default zoom; 3 leave/return cycles: geos stable (24), no pageerror. Roads connect places; Wei/Wu/Shu read by style at zoom-out. Lot scale (size × MAP_M × 1.2) is a first guess.
- [x] T-045: World layout data — road network, routes, settlement lots, landmarks — Done; tests 41/41, lint clean, goldens unchanged, headless. 49 nodes / 60 edges (all on land, all reachable from the airport; `studio` home spot is `home:studio`); 163 lots on a fresh run (far under the 1200 cap; density / gap are first guesses for T-046 to tune by eye); 0 R() draws in MapModel.build. Also exported `MapModel.maxLots` and a lot cache `MapModel.lotCache` (properties, not globals).
- [x] T-038: Losing is a real deal — loss penalties, fatigue and injury — Done; tests 40/40, lint clean, goldens unchanged, RUN_VERSION 7. Deviations: street-fight losses add no `run.losses` count; new `City.crewOvr` (street foe rating = mean of the region's league clubs) and `City.fightBan`; risk computed before the trip. Open: engine coach subs could bring an injured you on (T-049). QA: risk 16 → 27 % on low stamina, loss line lists penalties + minor injury, 45 % cap, buttons disabled "Injured — rest first"; no pageerror.
(one line each; full task text is in git history)
- [x] T-044: Rankings drawer table fits the drawer — Done; tests 39/39, lint clean, goldens unchanged. Also: your row's class `me` clashed with `.hub .me` (HUD player card) and broke its layout, so it is now `tr.you` (js/ui/career-week.js, one word). QA at 1280×800: 4 columns inside the 440 px drawer on Register and Gazette, no cell overflow, no horizontal scroll, your row highlighted; screenshot checked; no pageerror.
- [x] T-039: MapModel `life` — who is where this week, as plain data — Done as specified; tests 36/36, lint clean, goldens untouched, headless only. `life.crews` also carries `team` (club index) and `mates` uses the nearest explored place of the key to home.
- [x] T-040: Living map — figures, battle crowd, border pulse, flags (renderer) — Done; tests 36/36, lint clean, goldens untouched. Only the Wei–Wu border has a line, so the pulse and patrols use it (other borders: no line yet). QA (swiftshader, forced state): battle crowd 24 + 2 flags + dust, unscouted crew grey / scouted coloured, mates at their court; draw calls +4 (≤ 6); leave → 0 canvases, return → 1; geometry count 19 → 20 after return (avatar model loads late); no pageerror. Frame time not measured.
- [x] T-043: Three touches after a pop-up — the save is the set (scramble ball) — Done; tests 39/39, lint clean, goldens updated (`teams`, `sims`: pop-up saves no longer get a full set + attack). The new phase is `saveSet` (not `scramble`: hype.js already has one); tallies `m.scr` / `m.scrLog` are created lazily (match.js untouched). 300 sims: 0.85 scramble possessions per match, 86 of them went over as a bump, hitter is never the popper or the saver. QA: Monster game ran 400 steps, no pageerror (no pop-up came up in that window; the animated path is covered by the recorded-beats tests).
- [x] T-041: `Rank` — the three rankings as plain data — Done as specified; tests 37/37, lint clean, goldens untouched, RUN_VERSION 6 (old saves dropped). Register rows hide the true OVR (only the order uses it); you get no faction-share points; Rank.settle/meet hooks also in city.js (clashEnd, watch, hustle). The Limit Break test's RUN_VERSION assert updated 5 → 6.
- [x] T-042: Rankings drawer + ranks on match and challenge cards — Done; tests 39/39, lint clean, goldens unchanged. Drawer id `rank` in `HUB_DRAWERS` (+ `CW.rank` tab key, `rankCard`/`rankTab`/`rankBest`/`RANK_TABS` in career-week.js). QA: 3 tabs, your row highlighted, 18 unrated rows before scouting, gazette 20 rows, street empty-state, opponent line renders, no pageerror (rated-after-scouting not re-driven in browser; covered by the Rank tests).
- [x] T-037: Team challenge — challenge a club, it may refuse you — Done; tests 38/38, lint clean, goldens untouched. Deviations: CHALLENGE also has `standPer` 10, `doubt` 3, `doubtP` 0.5 (and CHALLENGE_WHY for the card text); a doubtful club is decided by a hash of week/club/stake (not a roll); acceptance spends nothing until the match ends (refusal spends trip + day); Wu ignores the stake; odds = clamp(1.5 + gap/20, 1.2, 3). QA (career-map): verdict 'refuses — No stake, no game' at $0 → 'likely' at $50 for the Outlaws, ⏭ played and settled the stake, a $0 ask logged the refusal; no pageerror.
- [x] T-034: Training stops at 75 — remove Limit Break — Done as specified; tests 33/33 (full run asserts ≤ max(75, start stat) until T-035), lint clean, goldens untouched; RUN_VERSION 5.
- [x] T-035: Match experience — your performance × opponent strength — Done as specified; tests 34/34, lint clean, goldens untouched. Report (short season, 5 seeds, WS, power-only training incl. the cup): training only 75.6 avg power (ovr 67.8) vs also playing every eval 78.2 (ovr 69.0). QA: Sim ⏭ eval line shows "XP: … (×0.3 vs a weaker side)".
- [x] T-036: Techniques learned in play (basic skills stay in the shop) — Done as specified; tests 35/35, lint clean, goldens untouched. Growth.matchXp now takes (run, m) and shares `Growth.matchGap(m)` with tryLearn. Not touched (unlisted): the encyclopedia card still says "Or learn it in career for this many skill points" (ui/encyclopedia.js:26,47) — stale now. QA: shop shows 8 techniques as "learn in matches"; scouted HQ roster and dossier list techniques; no pageerror.
- [x] T-028: Squads of 6 — 4 on court + 2 on the bench (data, pools, draws, saves, rosters) — squadOf + t.bench (teams.js), bench in fillRoster/finalizeTeam/save (RUN_VERSION 4), POOL 24/18/12/6/6 + SQUAD 6, Pool.draw squads of 6 (benches drawn after all court slots, never you), Eval.squad/lend bench, Cup entrants of 6 (12 entrants, 4 byes), .P → squadOf across career code, new `World.swap` (join / transfers / promotion move players between court and bench seats), Teammates card 'Bench' heading, bench marks in the scouted roster and dossier ('<squad> · bench'). Tests: pools/draw/eval/U21 updated, new 'teams: 4 on court + 2 bench…' (30/30, lint clean); goldens updated (2 more rolls per team). Deviations: (1) STUFF_BIAS 0.45 → 0.2 in rally-defense.js — the new team rolls plus the MB-first blocker change (unplanned, earlier) left the 5-set test at 11.4 %; 10 team sets now average 13.1 % (spec ~13 %, per-set 9.6–16.8), kills 42 % unchanged; (2) elAll (engine/elements.js, unlisted) still loops t.P — only for pre-v4 saves, which are dropped; (3) eval card lists the 4 starters only. QA: career run — Teammates card shows 4 + 'Bench' (2), Wei dossier roster 24 (4 bench-marked), forced week-28 cup: 12 entrants / 4 byes; Monster game 600 steps 4+2 per side; no pageerror.
- [x] T-029: Substitutions in the match — dead-ball swap, SUBBED label, coach line (stamina rule) — SUB + SUBLINES, `m.subs` / `m.lineup0`, `coachSubs` / `subIn` / `restoreLineups` in match.js (subs after the point's beats, before a timeout; restore when the match is over, on leaveMatch and in navigate() for a running match), new act kind `sub` (+ existing `rot`, `plabel`, `coachtalk`, `log` in the same beat), `case 'sub'` in playback, `R3D.swapActor` (actors3d `dressFigure`), byId/box score/stars/mp cover players who came on. Goldens updated. Tests: new 'engine: substitutions — rule, limit, restore' (200 sims: 244 subs in 136 matches at shipped SUB.sta 0.6, never > 2 per side, lineups restored; recorded sub acts name known players), scene/beat tests accept bench ids (31/31, lint clean). Deviations: (1) bench display entries live in `A.bench`, not flagged inside `A.disp` — every draw / animation loop already iterates A.disp, so nothing had to learn to skip them; (2) the 3D figure of the outgoing player is re-dressed as the incoming one (same body model) rather than loading a separate hidden model per bench player; (3) a setter goes off only for a setter (the engine reads `t.s`). QA: Monster game with SUB.sta 0.95 — 2 subs per side, SUBBED label + '#14, sit. #5, you're up — earn it.' + log line, 8 figures / 8 unique players, `P` ids equal the starting lineup after the match, box score lists the players who came on; no pageerror.
- [x] T-030: Coach AI — errors and coach IQ decide subs too — SUB gains errs 3 / back 0.85 / iq [0.35, 0.9]; `subCandidate` (tired → erring → rested starter returns) + `coachSubs` with one `R() < lerp(SUB.iq…, coachIQ)` roll only when a candidate exists; engine-only `m.setErr`, `m.subbed`, `m.subLog`; the log line names the reason (tired / too many errors / fresh legs back). No new act kind. Goldens updated. Test 'engine: coach AI — errors, returns, coach IQ' (32/32, lint clean): 200 sims → tired 304, errors 21, back 38 subs; coachIQ 1 subs earlier than 0 (pooled over 4 seeds × 150 matches, e.g. 21.4 vs 21.7 points at first sub on seed 7 — small, direction held on every seed). Notes: with the shipped SUB numbers error-subs are rare (~10 % of subs); the IQ effect is modest because a candidate usually shows up late. QA: Monster game with SUB.sta 0.95 — log 'Sub …: #8 … in for #11 … (tired)', 8 unique figures, lineups restored after the match; no pageerror.
- [x] T-031: Your player can be benched — lineups, sub-outs, reduced rewards — Done; match.js also edited (`m.played`, `m.finished`), match-screen.js unchanged; a bench win doesn't count for the "win the evaluation" goal; goldens untouched; tests 33/33, QA: weak WS → card "On the bench", Sim ⏭ → grade C (bench: rewards ×0.6), no pageerror.
- [x] T-026: Lane-read block — who blocks where, reads, swings, doubles; three defence settings in the engine — formBlock reads lane/pipe/bitten/late/split, 2nd blocker on the inside, DEFSETS + BLOCK in tactics.js, `m.dset`; new test; goldens updated (block choice changes every hash). Stuff rate 11.3 % → 13.7 % (600 Read-vs-Read sims, 10 team sets; per-set 11.4–16.6). formBlock alone gave ~11.3 %, so STUFF_BIAS 0.9 → 0.45 in rally-defense.js (only lever with real effect) and BLOCK lateCov 0.8 / splitCov 0.85 (softer: the gap falloff already punishes lateness). Final BLOCK: laneL .38 laneR .62 lateCov .8 splitCov .85 swingReach .8 swingCov .75 commitQuick 1.6 commitReach 3.5 (NEW constant: Commit's blocker on a quick is already up) commitMiss .6 bunchMid 1.25 bunchStartZ [.42,.58] bunchPin .65. Deviations: (1) 'today's 67.7 % kills' isn't reproducible — my tally (hitter kills / attacks, `m.att`, engine-only) is ~42 % before and after; the test guards [36, 48] %. (2) Commit/Bunch tested on stuff rates (quick stuffed 27 → 33 % vs Commit, pins stuffed 9.5 → 5 % vs Bunch), not quick kill %: block breaks offset it (quick kill −1 pt only). (3) Scaled coverage capped at 1.2 so a setting can't trigger block breaks; Commit always counts the middle as bitten on a fake; Bunch drifts to bunchStartZ only as far as speed allows. Blocker slide speed max 595 → 646 units/s (same envelope). QA: 60 sims — pin attacks: blocker at the edge (<0.1) 68 % (rest late), inside double 91 %, every swing by the far blocker; Monster game 1500 steps, no pageerror. Not eyeballed 10 rallies in 3D.
- [x] T-027: Defence setting — your pick, AI teams' pick, scouting shows attack habits — styles.js `dset` (wall bunch, tempo commit, rest read), `defOf` in tactics.js, `m.dsetMode` + `m.dsetLog` (engine-only, not saved), captain switch in captainThink (one extra R() only in 'cap' mode, after 8 opp attacks; reuses the `tac` act with a `dset` field, no new act kind), Defence select per team in the Tactics popover (`setDefence`, `#dsnow`), `Dossier.habits`/`habitText` shown in the dossier club rows and the HQ card once scouted. Goldens updated (style defaults + the extra draw). Deviations: (1) pipe = the setter has `pipecombo` (it is a setter technique, not any player's); (2) css/style.css untouched (reused `.tac`); (3) T-026 stuff-rate test still passes unchanged (12–16 %) with style defaults, no retune. Tests: new 'defence settings' + 'scouting shows attack habits' (29/29, lint clean). QA: Monster game — both Defence selects present, picking Commit sets fixed:commit and `#dsnow` reads '→ Read' for the captain side; career — after scouting the dossier shows 'Quicks ~16 % · favours the left · pipe · Defence: Read'; no pageerror. HQ card habits line not eyeballed (same helper as the dossier).
- [x] T-032: Match background music (owner track, 50 % volume) — bgmStart/bgmStop/bgmSync in sfx.js (own gain → destination, decoded once, want/loading guards so a late decode after leaving stays silent), hooked in navigate; ARCHITECTURE 'Match music'. 26/26 + lint, goldens untouched. QA (test3d): 0.4 = 0.5 × 0.8 playing, 🔇 → 0, 🔊 → 0.4, leave → gain gone + bgmSrc null, second match 1 fetch total, no pageerror. Swiftshader is slow: decode took ~10 s wall before the music started. mp3 was not in my clone — fetched it from the artifact and committed it.
- [x] T-019: Brackets of any size with byes — bracket.js handles 8/16 slots with byes (BRACKET_ROUNDS/BRACKET_NEXT, seedOrder hard-coded: 8 = old Grand Cup order, 16 = the task's list); new test 'bracket: 8 and 16 entries, byes'. 25/25 + lint, goldens untouched, headless only.
- [x] T-020: U21 Final Cup — one cup of drawn squads replaces the Skyline and Grand Cups — U21 Final Cup as specced (13 squads → 16-slot bracket, 3 byes, RUN_VERSION 3, warm-up code removed; Cup.roman added as a Cup property, no new global). 26/26 + lint, goldens untouched; QA: Academy run → W29 bracket with byes, Sim ⏭ to run-end naming the champion, no pageerror.
- [x] T-025: 3D map parity — pins, selection, fog, labels — pins3d.mjs (overlay pins/labels/flag, seized + border decals), fog via vertex colours in map3d.mjs, `update` diffs by JSON, dead SVG CSS deleted, default view 60 m. 24/24 + lint. QA (test3d): 4 model pins = 4 DOM pins, labels + red border visible, pin click → panel + `.sel`; revealed HQ appears and scout updates its badge with the same renderer/16 geometries/1 canvas; land click → flag; no pageerror. Deviations: first view centres on you.at (not focus); border line drawn (in model); airport label offset below the player. Seized patch built (model count 1) but only checked headlessly.
- [x] T-023: 3D map scaffold — terrain, water, camera, click-to-point (behind a toggle) — MapView facade (map-view.js) + MapSVG rename, map3d.mjs terrain/water/sun/camera/pan/zoom/click, Menu toggle `MAP3D`. 24/24 + lint, goldens untouched. QA (test3d, swiftshader): toggle on → island renders, wheel zoom + drag pan move the view, click Shu land → panel → Travel moved RUN.pos [470,600]→[478,487]; off → SVG back, 0 canvases; leave to menu → renderer released, return → 1 canvas; no pageerror.
- [x] T-024: The player walks on the 3D map (default VRM model) — avatar3d.mjs (VRM + capsule fallback), map3d.update snap/walk + camera follow, ×N badge (avg speed > 6 m/s). 24/24 + lint. QA (test3d, swiftshader 800×500): model at the airport; 20 m trip walks, far trip runs with ×8 badge and follow cam, ends idle on the spot, badge hides; frame ≈ 205–360 ms in swiftshader (no GPU); no pageerror.
- [x] T-008: Reserves grow every week and get promoted on payday — Growth.grow extracted (teams + reserves); PROMOTE {gap 3} + World.promote on payday; new test (8 weeks growth, forced promotion, 4-player teams, pool sizes); 23/23 + lint; goldens untouched
- [x] T-009: Academy squad — rename, leave, and the "alone" state — Academy squad rename, World.leaveAcademy, run.academy (create + repair), Run.mates → [] when alone, Team drawer Leave squad + inline confirm + alone line; 23/23 + lint; goldens untouched; QA: leave → alone line, 28 weeks alone without error, no pageerror. Deviation: one-line guard in js/career/events.js (unlisted file: Events.roll picked a mate from an empty list → crash; also skips {mate} events while alone); goals.js needed no change (already guarded)
- [x] T-010: `Eval` — monthly evaluation rules and calendar (headless) — js/career/eval.js (kind, setup, squad, lend/restore, bench); CALENDAR eval weeks 4–24 + camp 26–28; weekType, nextWeek, repair, goals (academy-only win goal) wired; tests switched to eval/bench + new 'evaluation rules' test; 24/24 + lint; goldens untouched. Added to lend/restore: `cap` flag and court `slot` (engine positions by p.slot; drawn wings could share W0/W1)
- [x] T-011: Evaluation week — match, bench, and the eval card — evalPanel + `Cup.fixture(run,'eval')` (Academy/faction squads lent via Eval.lend, restored on finish/leave); not selected → bench button. 24/24 + lint, goldens untouched. QA: wk4 Academy card → Sim → wk5; Wei wk8 faction card → match view, no pageerror.
- [x] T-016: Remove Legacy (unlocks, points, pure runs, Hall of Fame, legends) for good — legacy.js deleted, career-legacy.js → career-end.js; Run.create always free agent; 21/21 + lint; grep clean (renamed chart-legend class to chartkey); goldens/engine untouched; QA: menu/create/run-end via Sim ⏭ (rank C + chart), no pageerror. Note: CLAUDE.md line 62 still lists “legacy” among ui screens
- [x] T-017: `Dossier.build(run, r)` — DOM-free faction dossier model — Dossier.build in js/career/dossier.js; new test (state, places incl. seized, roster gate, minor); 22/22 + lint; goldens untouched; headless only. Unscouted place quality = the region's advertised q (no qMul)
- [x] T-018: Faction dossier window — ui/career-dossier.js, HQ Dossier button, Factions-drawer name links, modal in hub, Esc closes; 22/22 + lint; QA: Wei dossier — 7 facilities = map, roster “unknown” until scouted then ratings; Shu opened from the Factions drawer; row click → map spot; no pageerror (screenshots taken, not committed)
- [x] T-001: Rename Sacred Shrine Park → Central Academy — names/comments only; 21/21 + lint; career-run visual QA not run.
- [x] T-002: Facility access gate (grudge + owner condition) — ACCESS in world.js, City.access + gate in City.can; new test; 21/21 + lint; console QA not run.
- [x] T-003: Ball shadow circle on the floor — marker follows the ball exactly, hidden with it; widens + fades with height. Owner change in build chat: white outlined ring, no fill.
- [x] T-004: Spike approach — run-up point, take-off before the ball — QA 42 non-quick attacks: take-off 0.6–1.2 m in 90.5 %, end-of-set distance max 0.054 m, 0 over-sprint moves. Added: `direct` (too far to run up → straight to take-off), `via` back attack 2nd leg ends at take-off. Fix: jump serves excluded from approachOf.
- [x] T-005: 2–3 more line variants for every cut-scene kind — e282653 — 20 kinds × 5 personalities, 5–6 lines each (min 5, max 6), 245 added, all ≤ 40 chars; golden diff = `matches` only; 21/21 + lint; Max Hype scenes show new lines, no pageerror (bubble fit not visually confirmed).
- [x] T-006: Faction reserves — every faction becomes a roster (pool) of players — pools Wei 20 / Wu 14 / Shu 10 / Outlaws 6 / Gloria 5 (reserves 12/6/2/2/1 after league players); RUN_VERSION 2; Hard also boosts reserves; 22/22 + lint; goldens and js/engine untouched; QA: new run loads, map/HQ fine, no pageerror
- [x] T-007: `Pool.draw` — weighted squad draw from a faction pool — DRAW in world.js, Pool.draw in pool.js (you placed first in your role slot at standing ≥ 60; a free agent is never a candidate; role shortage → best remaining); new test; 23/23 + lint; goldens and js/engine untouched; headless only

## Unplanned changes
(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md)
- (recorded in spec §4.9) 2026-09-30: Owner: keep only the 3D map — removed the SVG renderer (`js/ui/map-svg.js`), panzoom, the 3D toggle and `KEYS.map3d`; `MapView` loads map3d.mjs directly (notice if WebGL fails). MapModel and the rules are unchanged. Pins, labels, fog, selection and seized patches are not drawn until T-025; until then places cannot be picked (travel by clicking land works). Dead SVG map CSS (`.city`, `.pin`…) left in css/career.css.
- (recorded in spec §2.9) Blocker choice: the front-row MB is main blocker on every attack they can reach (was: only quick/pipe/middle); the wing fills the gap — js/engine/rally.js (formBlock), ARCHITECTURE.md, tests/golden.json (updated).
- (recorded in spec §4.6 / §2) Street battle "Fight for X" is now a real match (watch or ⏭ sim) with match XP, techniques and grade; `City.clashP` and `MATCH_XP.clash` / `CLASH.par` removed. Files: js/career/cup.js, city.js, js/data/career.js, js/data/world.js, js/ui/career-map.js, tests/run.js, ARCHITECTURE.md.
- (recorded in spec §4.6 / §2) Box score (player table in the match screen) gains an OVR column — js/ui/match-screen.js.
- (recorded in spec §4.6 / §2) Added (.vrm) player models now apply to your own career player only (everyone else keeps the base model) — js/render3d/actors3d.mjs, js/ui/models.js, js/ui/menu.js, ARCHITECTURE.md.
- (recorded in spec §4.6) Street-battle crews and your faction's evaluation squad show their real 3-letter team tag instead of 'EVL' (Eval.squad takes a `short`; 'EVL' only for the opposing evaluation squad) — js/career/eval.js, cup.js.
- (recorded in spec §4.2) Central Academy moved to the Wei–Wu–Shu border tri-point (540, 500), north of the airport: park r 72→60, label, `park` spot, `park` / `jAc1` / `jAc2` road nodes, Academy road `park→dojo` replaced by `park→stone` — js/data/city.js, tests/run.js (route / regionAt coordinates).
- (recorded) T-050 follow-up: `CITY.ritual` joins the places MapModel.lots keeps `placeClear` from (lots no longer cover the sand circle) — js/career/mapmodel.js.
- (recorded in spec §2.0b) 2026-10-01: Owner: stamina matters more in matches — `RULES.stamina` { drain 1.7 (was 1.3), hit 0.4 (was 0.15), jumpHit 0.3 (was 0.15) }, so a lone carry tires and weakens; coach subs (`SUB.sta`) unchanged. Goldens updated (teams, matches, sims). Files: js/data/rules.js, js/engine/stats.js, tests/golden.json, ARCHITECTURE.md.
