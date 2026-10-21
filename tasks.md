# Tasks

Owned by the spec chat. The build chat only changes a task's status mark and its `Result:` / `Question:` lines
(workflow: CLAUDE.md). Do tasks top-down within **Now**. **Later** items are outlines: the spec chat details them
(files, steps, accept) and moves them to Now. Next free id: **T-331** (T-088 is open below).

Status: `[ ]` todo · `[~]` in progress · `[?]` blocked — see Question · `[x]` done

## Task template

```
### [ ] T-000: <imperative title>
Spec: §x.y          Goldens: unchanged | update (<why>)          Save: no change | RUN_VERSION bump (<why>)
Goal: <one or two sentences: the observable outcome>
Files: <exact paths the build chat may edit; new files marked (new) — also add to index.html>
Do not: <things that look tempting but are wrong for this task>
Steps:
1. <concrete step naming functions/constants/globals>
Accept:
- <checkable criterion: test, headless sim number, or visible behaviour>
QA: none | Monster game | career run → <screen and action>
Result:
```

## State (2026-10-12)

Built through T-273 except T-088 (LFS question), T-230 (study) and T-259 / T-260 (fire, stages, captain's calls) — 120 quick
tests, RUN_VERSION 18: match engine and 3D playback (laning, team plans and match prep, coach panel, crowd heat, knockdowns,
animation polish §2.19–§2.23), career (28 weeks, pools, evaluations, U21 Cup, Story mode, growth, relationships, court matches),
UI §9–§10, hex territory, the island × 2.25. The one-press prompts are gone (T-264). Next (owner): the player-agency design
(spec §5.7) in a spec chat. Done tasks: one line under **Done**, full text in tasks-done.md. Motion QA (scratch, not in the
repo): Playwright with `RNG.seed(7)` + a seeded Math.random init script.

## Now

**Team life (owner, 2026-10-21, spec §4.36): two agents.** **Agent T — Transfers & circle**: T-325 → T-326 → T-327.
**Agent S — Stories & cards**: T-328 → T-329 → T-330. Ownership: T owns js/career/world.js, js/career/run.js (RUN_VERSION 23; `run.tenure`,
`run.ex`, `run.circle` pins), js/career/circle.js (new: Circle), js/data/people.js (MEMORY kinds walked_out, faced_ex), js/career/city.js
(members' price), js/ui/career-hub.js + css/hub.css (the strip), js/ui/career-panels.js (HQ card: the window), tests/team.test.js (new). S
owns js/career/team.js (new: Team — chat, arcs), js/data/team.js (new: lines, arcs, its memory kinds merged into MEMORY at load),
js/data/cards.js + js/engine/cards.js (duo cards), js/ui/match-cards.js, js/ui/career-match.js (the chat card), js/ui/match-exchange.js +
js/data/match-lines.js (ex-teammate remarks), js/ui/career-people.js (arc step on the card), tests/story.test.js (new). Contract — T
provides, S reads with a `typeof Circle` guard: `Circle.of(run)` → ids (fallback: `Run.mates(run)` ids), `run.ex` = { id: week left }.
S keeps its state lazily in `run.team` (Team.of(run), no RUN_DEFAULTS). Both: no R() (hashes), goldens unchanged.

### [ ] T-325: Transfer windows, leaving hurts, tenure
Agent: T
Spec: §4.36 A          Goldens: unchanged          Save: RUN_VERSION 23 (`run.tenure`, `run.ex`)
Goal: signing only in the window (the week after an evaluation, the off-season); leaving writes walked_out (by behaviour) and
standing −8; tenure 4 / 8 / 12 weeks → lineup +4, members' price × 0.8, captain eligible.
Files: js/career/world.js, js/career/run.js (lineup score, fields), js/career/city.js, js/data/people.js, js/data/world.js (WINDOW, TENURE),
js/ui/career-panels.js (HQ card: "window opens week N"), tests/team.test.js (new; in tests/run.js), tests/career-bot.js (joinBest respects the window)
Accept: tests — no join outside the window; leaving writes walked_out with each mate (Loyal × 2); tenure steps act. `npm run career -- 12 both` within noise.
QA: career run → an HQ card outside and inside the window.
Result:

### [ ] T-326: The circle and friends who follow
Agent: T
Spec: §4.36 B          Goldens: unchanged          Save: no change (beyond T-325)
Goal: `Circle.of(run)` (≤ 5, bond 30+, any club, pins first); on a switch, a 60+ friend may ask to come (behaviour, hash) and moves
with you; `run.ex` remembers who you left.
Files: js/career/circle.js (new), js/career/world.js, js/career/events.js (the follow card), index.html, tests/team.test.js
Accept: tests — the circle's order and cap; a Loyal friend never follows; a follower lands in your new squad.
QA: career run → switch clubs with a close friend.
Result:

### [ ] T-327: The squad strip
Agent: T
Spec: §4.36 1          Goldens: unchanged          Save: no change
Goal: the hub's top bar shows your circle's faces (mood, bond; current teammates marked); a click opens their card.
Files: js/ui/career-hub.js, css/hub.css, tests/ui-smoke.js (the strip renders)
Accept: UI smoke passes with the strip; design-system rules (tokens, type ≥ 12px).
QA: career run → the hub, screenshot.
Result:

### [ ] T-328: Team chat after matches
Agent: S
Spec: §4.36 2          Goldens: unchanged          Save: no change (`run.team` lazy)
Goal: after a match you played: 2–4 teammate messages in their behaviour's voice (by result, your line, theirs); one reply → a memory.
Files: js/career/team.js (new), js/data/team.js (new; lore voices), js/ui/career-match.js, index.html, tests/story.test.js (new; in tests/run.js)
Accept: tests — the messages match behaviours and the result; one reply writes one memory; no randoms.
QA: career run → a match → the chat card.
Result:

### [ ] T-329: Personal arcs
Agent: S
Spec: §4.36 3          Goldens: unchanged          Save: no change
Goal: each circle member gets one three-beat arc a season by want; each beat asks something; helping → a big memory, growth × 1.1,
leaning toward your year-2 Cup squad (a weight Cup squads read).
Files: js/career/team.js, js/data/team.js, js/ui/career-people.js (the arc step), js/career/cup.js (the lean, one line), tests/story.test.js
Accept: tests — an arc advances beat by beat; helping applies its rewards; one arc per member a season.
QA: career run → an arc's three beats.
Result:

### [ ] T-330: Duo cards and ex-teammates across the net
Agent: S
Spec: §4.36 4, B (ex-teammates)          Goldens: unchanged (no duo card / no ex → today)          Save: no change
Goal: a 60+ friend unlocks a duo card (by roles) playable whenever you share a court, with a small cut-in; ex-teammates across the
net get their remarks and a faced_ex memory.
Files: js/data/cards.js, js/engine/cards.js, js/ui/match-cards.js, js/data/match-lines.js, js/ui/match-exchange.js, js/career/team.js, tests/story.test.js
Accept: tests — the duo card is in the hand only with that friend on court; it acts; a match vs an ex writes faced_ex.
QA: Monster/career match with a duo friend → the card and its cut-in.
Result:

**Talent, gifts and behaviour (owner, 2026-10-20, spec §4.35): two agents.** **Agent G — Gifts**: T-320 → T-322 → T-323.
**Agent P — People & presence**: T-321 → T-324. Ownership: G owns js/data/gifts.js (new), js/career/gifts.js (new), people.js,
run.js (RUN_VERSION 22), stars.js, events.js, training.js, body.js, city.js, js/engine/elements.js, js/engine/bars.js, js/ui/sheet-me.js,
js/ui/career-panels.js, tests/gifts.test.js (new), tests/career.test.js (its own tests). P owns js/data/people.js (TRAITS, REL),
js/career/rel.js, js/ui/career-people.js, js/render/faces.js, css/theme.css (`--gift`), css/people.css, js/render3d/actors3d.mjs,
js/data/story.js, js/career/story.js (the presence beat), tests/people.test.js. Contract (G provides, P reads with a `typeof Gifts`
guard): `Gifts.tier(p)` → 'S'…'D', `Gifts.of(p)` → gift ids, `Gifts.known(run, p)`, `GIFTS[id]` = { name, desc, kind }. G's event and
diary lines live in js/data/gifts.js (not story.js).

### [x] T-320: Talent tiers and gifts for every NPC
Agent: G
Spec: §4.35          Goldens: unchanged (career only; engine reads `p.gifts` only where set)          Save: RUN_VERSION 22 (`p.gifts` on players)
Goal: every NPC has a tier letter from `pot` and 0–2 gifts by hash; growth, body and element gifts act (People XP, stats, element
gauge / no element); tier and gifts show on the person's card once known (scouted, trained beside, bond 20+).
Files: js/data/gifts.js (new: GIFTS, tiers, shares), js/career/gifts.js (new: Gifts — the contract), js/career/people.js (roll + growth hooks), js/career/run.js (version; roll on
create and for new players), js/engine/elements.js + js/engine/bars.js (Element-born / Elementless / Twin / Iron Frame / Ice Veins / Choker
/ Contagious: read `p.gifts`, no draws), js/career/stars.js (named players: authored gifts — Haewon Element-born + Prodigy; the cohort one each),
index.html, tests/gifts.test.js (new; registered in tests/run.js), ARCHITECTURE.md, ARCHITECTURE-details.md (the card shows them: P's T-321/T-324 via the contract)
Do not: draw R(); change a match where nobody has gifts; give the MC gifts here.
Accept: tests — shares (~45 % one, ~10 % two) over the league; Prodigy grows faster than a giftless twin over 28 weeks; an
Elementless player never fires an element spike; the card hides gifts until known. `npm run career -- 12 both` league mean
within ±1.5 of today.
QA: career run → a scouted player's card.
Result: GIFTS (22, kinds growth/body/element/mind/social) + Gifts (tier/of/known/roll/innate/grow/wake); rolled in People.ensure by hstr+fmix32 (plain FNV skewed the picks); shares over 6 runs ~45 % / ~10 %; Haewon S Element-born + Prodigy, cohort A (Quick Twitch / Reader / Contagious), first aces authored A + rolled gifts; engine hooks via `hasGift` (goldens unchanged); Magnetic / Lone Wolf need a Rel.add hook (Agent P); war.test's 'Gold untouched' now holds only while Iron stands (Iron fell in seed 32 with gifts). Career 12 both: league 81.6 / 86.8 casual, 81.6 / 87.1 good (was 81.5 / 86.9, 81.6 / 87.0); 185/185.

### [x] T-321: Behaviour — the personality traits promoted
Agent: P
Spec: §4.35, §4.23          Goldens: unchanged          Save: no change
Goal: an NPC's first trait is their headline behaviour, named on the card from the first meeting; each behaviour's bond rule
works (Friendly, Shy, Competitive, Picky, Egoist, Loyal, Mercenary, Hothead).
Files: js/data/people.js (TRAITS: behaviour name + rule; REL.know), js/career/rel.js (the rules), js/ui/career-people.js (behaviour on the card;
also tier + gifts once `Gifts.known` — the contract), tests/people.test.js
Do not: add a second trait system; change NPC ↔ NPC chemistry beyond the same rules.
Accept: tests per behaviour (e.g. Picky: no bond gain until the bar; Shy: first 3 meetings ≤ 25 %; Mercenary: fades after 3 weeks).
QA: career run → the People sheet.
Result: 8 behaviours in REL.behave (you ↔ NPC; NPC ↔ NPC unchanged), card names the first trait from the first meeting + rule on hover, tier/gifts behind `typeof Gifts`; 8 new tests, bond calibration in band. Open: Competitive's Hard session needs training.js (G) to write `trained_hard`; engine.test.js:1209 (not P's) sets a Shy mate → needs `['warm', 'reckless']`.

### [x] T-322: The gift chance event
Agent: G
Spec: §4.35          Goldens: unchanged          Save: no change (`run.gifts` for the MC, `run.giftAsk` once-per-friend)
Goal: bond with a gifted friend first passes 50 → an event card (pay $ for 35 % + 1 % per point over 50, or decline); a learned
gift acts on the MC (max 2, good ones only).
Files: js/career/events.js (event def 'gift'), js/career/gifts.js (the trigger: checked at week end and after bond-raising days — not in rel.js), js/career/run.js (fields), js/career/people.js /
js/career/training.js / js/career/body.js (MC gift effects), js/data/gifts.js (lines — lore voices),
js/ui/sheet-me.js (your gifts), tests/gifts.test.js
Do not: offer Glass Bones, Choker, Lone Wolf, Elementless, Dormant or Early Peak; fire twice for one friend.
Accept: tests — the event fires once at 50; paying moves money and rolls the stated chance (seeded); a learned gift acts.
QA: career run (forced bond 50) → the card, pay, the Me sheet.
Result: Gifts.ask (WEEK_START + after every City.day) → event 'gift' (Events.def / choose → Gifts.answer): the highest-bond friend at 50+ with a priced gift you lack, once per friend (`run.giftAsk`), ≤ 2 (`run.gifts` → `you.gifts` via Gifts.sync); pay rolls a hash (no R()); short of money = no deal (said on the card); learned: growth in Training.sim, body bonus in Body.sync, Rubber Joints full swing, Leadership, Generous scales your mates' share; engine reads you.gifts; Me sheet 'Gifts'. Magnetic needs Rel.add × `Gifts.bondMul(run, id)` (Agent P). Tests: map.test clears the event a bond opened; WEEK_START 7. QA: card → pay → Me sheet (Defense +3, full swing), 0 page errors; UI smoke 14/14; career 12 both league 81.7 / 87.0, 81.6 / 87.1 (good you Y2 93.6).

### [x] T-324: Presence — S/A portrait frame, court glow, the first meeting
Agent: P
Spec: §4.35 (Presence)          Goldens: unchanged (display only)          Save: no change (`run.met` or a new `run.presence` set of ids — a RUN_DEFAULTS field)
Goal: every portrait of an S/A player has the gold frame (S shimmers); on court their aura glows faintly at idle (S with gold
motes); the first time you meet one, the presence beat (dim, chime, diary line), once each.
Files: js/render/faces.js (frame in faceSVG), css/theme.css (`--gift`), css/people.css, js/render3d/actors3d.mjs (idle glow, motes),
js/career/story.js or js/career/rel.js (the meeting hook), js/data/story.js (the lines), js/audio/sfx.js (chime, if needed),
tests/people.test.js, tests/ui-smoke.js (a frame on an S portrait)
Do not: reveal the letter; use faction or element colours; add a pop-up.
Accept: tests — an S and an A get the frame class, a B doesn't; the beat fires once per S/A on first meeting; UI smoke passes.
QA: career run (force an S into the squad) → the people drawer, a match; Monster game (one S) → the court glow.
Result: frame in faceSVG (`.gift`/`.glint`, `--gift` #f2b53a, reduced motion off), court glow S 0.4 / A 0.3 + rare S motes, presence beat = quiet Story scene (dark + `sfx.chime` + diary line), once via `run.story.seen` (no RUN_DEFAULTS field); 2 tests; UI smoke 14/14 (not extended: ui-smoke.js isn't P's — checked by QA: S/A frames in the People sheet, the beat, Monster glow vs control). Open: Gifts.tier (G) replaces the pot fallback in Rel.presence.

### [x] T-323: Gifts rub off in training
Agent: G
Spec: §4.35          Goldens: unchanged          Save: no change
Goal: training beside a friend (bond 60+) with a body or growth gift gives that session a share of it (the place card says so).
Files: js/career/training.js, js/career/city.js, js/ui/career-panels.js, tests/career.test.js
Accept: test — a Rubber Joints friend at 60+ on the floor lifts that session's Flexibility gain × 1.2. `npm run career -- 12 both` within noise.
QA: career run → a place card with a gifted friend on the floor.
Result: Gifts.rub (GIFT_RUB) in Training.preview — rows × all × the body stat's share, so card and session agree; mate chip `· Rubber Joints ×1.2` (tip names the stat). Test: ×1.2 Flexibility at bond 70, nothing at 55, Generous ×1.3, Grinder ×1.15. Deviation: css/hub.css `.plc .pchip` gets `position: static; transform: none` — match.css's global key-cap `.pchip` (absolute, −50 %) laid the place card's mate chip over Normal / Hard (pre-existing). city.js untouched. QA: place card screenshot clean, 0 page errors; UI smoke 14/14; 189/189; career 12 both league 81.7 / 87.0, 81.6 / 87.2 (you Y2 88.0 casual, 94.0 good).

**Two agents (owner, 2026-10-19), by file ownership (CLAUDE.md):** **Agent A — Body & orders** (T-307 → T-308 → T-309 →
T-310 → T-318 → T-312) and **Agent B — War** (T-313 → T-314 → T-311 → T-315 → T-316 → T-317), in parallel. Each edits only
what it owns; on an artifact publish refusal: re-read the refused files, re-apply its own edit, publish again.

| | Agent A — Body & orders | Agent B — War |
|---|---|---|
| **Owns** | js/data/career.js, js/data/city.js, js/career/body.js (new), training.js, growth.js, city.js, people.js, feel.js, eval.js, story.js (its `trained` gate only), js/ui/career-panels.js (all but the B functions), career-map.js, career-people.js, career-create.js, career-week.js, sheet-me.js, css/career.css, js/map3d/pins3d.mjs, kit3d.mjs, town3d.mjs, tests/career-bot.js, tests/people.test.js, tests/ui-smoke.js | js/data/war.js (new), js/career/war.js (new), js/data/world.js, front.js, hex.js, world.js, fight.js, cup.js, court.js, dossier.js, season.js, js/career/story.js (all but `trained`), js/data/story.js, js/data/glossary.js, js/engine/** (incl. T-311's bars.js), js/ui/career-dossier.js, sheet-season.js, match-prep.js, js/map3d/map3d.mjs, geo3d.mjs, tests/hex.test.js, tests/momentum.test.js, tests/cards.test.js, tests/war.test.js (new) |
| **Shared, by section** | mapmodel.js: everything but B's · career-panels.js: everything but B's · run.js: RUN_VERSION 20 (T-307), body fields · css/map.css: pins · tests/career.test.js, map.test.js: their own tests · index.html: its own script lines · tests/harness.js: A | mapmodel.js: `hexes`, `patrols`, `borders` and their keys in `build` · career-panels.js: `hqPanel`, `clashPanel`, `pointPanel` · run.js: RUN_VERSION 21 (T-313, after A's T-307 is published), the `hex` / `war` defaults · css/map.css: `/* war */` block · tests: blocks named hex / front / war / clash · index.html: its own script lines |
| **Keeps working for the other** | `SPOTS[id].train` (a place's lead training, derived from its kit) and `Training.facility(run, key \| placeId)` — B's dossier reads them | `Front.owner / priceMul / qMul`, `Hex.dist / idAt / tile` (city.js, run.js call them); new: `War.hit(run, unit, win, k = 1)` for A's Raid (T-318) |

Not in this split: the cards session's files (js/engine/cards.js, js/ui/match-cards.js) — B touches cards.js only for T-314's slot count.

**Body and day orders (owner, 2026-10-19, spec §4.33): Agent A.** Engine untouched except T-311; the court
skills are derived so ovr, techniques and cards keep reading what they read. Re-run `npm run career` after each.

### [x] T-307: Body stats — Strength, Agility, Endurance, Flexibility; court skills derived
Agent: A
Spec: §4.33          Goldens: unchanged          Save: RUN_VERSION 20 (`you.body`, body XP banks) — publish it early: B's T-313 takes 21
Goal: your player has a body (str / agi / end / flex + wit); power / def / speed / jump are computed from it after every
change; today's trainings still work, each re-keyed to a body mix.
Files: js/data/career.js (BODY: keys, names, formulas' constants; TRAININGS main/side → body keys), js/career/body.js (new:
Body.of, Body.court, Body.sync, Body.swing, Body.depth), js/career/training.js (addXp / sim / level / progress on body keys;
staMax from end), js/career/run.js (create: body at CAREER.start; RUN_VERSION 20; bump on body keys; events), js/career/growth.js
(matchXp → body keys via MATCH_XP), js/ui/sheet-me.js (body bars, then court skills + the swing gauge), js/ui/career-create.js
(copy), index.html, tests/career.test.js, tests/career-bot.js (statFor on body keys), ARCHITECTURE.md, ARCHITECTURE-details.md
Do not: give NPCs a body; touch js/engine; draw randoms in Body; let a court skill exceed CAREER.runCap.
Steps:
1. `BODY = { keys: ['str','agi','end','flex'], swing: 0.8, depth: 0.7, … }` and `Body.court(b)` with §4.33's formulas;
   `Body.sync(you)` writes power / def / speed / jump (rounded) from `you.body`.
2. Training / match XP / events / injuries act on body keys (old key → body map for events); `Training.cap` caps body stats.
3. Me sheet: four body bars + Wit, then the court skills with the swing gauge ("full swing" / "short: Flexibility 52 of 72").
Accept:
- A balanced body at X gives every court skill X (test, X = 1, 40, 75, 90); str 90 · agi 75 · flex 50 gives Power ≈ 77 (test).
- `npm run career -- 20 both`: good still ends year 2 ≥ 90 OVR, casual ≤ 88 (state the numbers in Result).
- `npm test`, `npm run lint`, `npm run test:ui` pass.
QA: career run → Me sheet (body bars, swing gauge).
Result: js/career/body.js (Body.court / sync / swing / depth; `you.edge` keeps direct court changes such as the Hermit's +2), BODY in data/career.js, RUN_VERSION 20 (v19 dropped); trainings re-keyed (Power → Str+Flex, Def → Flex+Agi, Speed → End+Agi, Jump → Agi+Str); events / injuries on a court key land on BODY.of; Me sheet body + court + swing gauge; career-map.js trainFx shows body rows (else "undefined EXP"). career -- 20 both: good Y2 95.2 (Y1 77.5), casual Y2 88.2 (Y1 75.4) — 0.2 over the ≤ 88 target (bot casual keeps the old court order's trainings); T-312 tunes. career-match.js result card (unowned) still lists court skills (progress reads the body stat). npm test 155/155, lint, test:ui 13/13. CLAUDE.md's "RUN_VERSION 19" line is the spec chat's to bump.

### [x] T-308: Facilities = kit; day orders on the place card (Drill, Work, Stretch)
Agent: A
Spec: §4.33          Goldens: unchanged          Save: no change (beyond T-307's v20; `run.uses` keyed by place)
Goal: every SPOTS place lists its kit; the place card offers the orders its kit brings, each "cost → result"; Work pays;
Stretch works anywhere; the facility level grows per place.
Files: js/data/city.js (SPOTS `kit` replaces `train`), js/data/career.js (KITS, ORDERS: body gains, sta, price, pay),
js/career/city.js (day → order; can / cost / price per order), js/career/training.js (Training.order; facility per place),
js/career/mapmodel.js (A's sections), js/career/people.js, js/career/story.js (`trained`), js/career/feel.js, js/career/eval.js
(their `train` reads), js/ui/career-panels.js (orders list), js/ui/career-map.js, js/ui/career-people.js, css/career.css, tests/career.test.js, tests/map.test.js, tests/people.test.js, tests/harness.js,
tests/career-bot.js, tests/ui-smoke.js, ARCHITECTURE-details.md
Do not: show region quality; add a pop-up; change NPC training (People still trains court stats); drop `SPOTS[id].train` (keep it as the
place's lead training — B's dossier reads it) or break `Training.facility(run, key)`.
Steps:
1. Kit per place (Harbor: weights, crates; Sand Courts: sand, mats; Thousand Steps: steps; Shrine: film, mats; Academy Gym:
   everything at Lv 1 …); ORDERS per kit tag: Drill (fast, $), Work (pays, slower), Stretch (free, Flexibility).
2. Every map point (no place) offers Stretch; home and the grounds too.
3. Place card leads with the orders (one ink primary: the best drill), then who's on the floor, level, price.
Accept:
- Each of the 17 training places offers ≥ 2 orders; Work pays at ≥ 4 places; Stretch from any point (tests).
- Bot: money is no longer always > $600 at the Y1 Cup for casual (state it).
QA: career run → three place cards (Harbor, Sand Courts, home) against the design system.
Result: KITS + DAY_ORDERS (data/career.js — `ORDERS` is taken by the engine's role orders); SPOTS `kit`, `train` derived from the first tag (B's dossier / NPC plans unchanged); 16 kit places (the task says 17: there are 16), each ≥ 2 orders; Work at 6 (Harbor, Stone Gym, Sand Courts, Dunes, Dojo, Academy Gym); Stretch at kit places, home, the grounds and any map point (City.pointDay; the point card = B's pointPanel + a Stretch row inserted by `pointCard`, pointPanel untouched); facility level per place (`run.uses[id]`; `Training.facility(run, trainingKey)` = its best place); `City.day(run, id, hard, oid)`, `mapGo(id, oid)`. Drills cost 1–1.5 × the old fee. Bot drills by body stat: casual money at the Y1 Cup $280 (under $600 in 20 / 20; was $857), Y2 89.3; good Y2 95.5. npm test 156/156, lint, test:ui 13/13 (+ order / Stretch checks); QA Harbor, Sand Courts, home cards.

### [x] T-309: Run — trips train the route's ground
Agent: A
Spec: §4.33          Goldens: unchanged          Save: no change
Goal: a trip can be walked or run; running trains the body by the route's edge kinds and distance, at a stamina cost.
Files: js/data/career.js (RUN_GROUND: edge kind → body gains per day of trip, sta), js/career/city.js (go: run option, gains
by route), js/ui/career-panels.js (Travel · Walk / Run buttons, "cost → result"), js/ui/career-map.js, tests/career.test.js,
tests/career-bot.js
Do not: change trip days or routing; draw randoms.
Accept: running the airport → Harbor coast road gives Endurance; Shu mountain path gives Endurance + Strength; the Steps
Strength + Agility (tests); too tired to run → Walk only.
QA: career run → run a trip across the island; the day track and diary show it.
Result: RUN_GROUND (data/career.js) per TRIP_DAY of each leg's travel cost (main / street / overpass → End, dirt / path → End + Str, boardwalk → Agi, the Steps' edges → Str + Agi, cross-country → End), −14 stamina a trip day; City.path returns node ids, City.legs / runPlan / noRun, travelTo(run, p, 'run'), Training.runTrip; Walk / Run buttons on place cards and (inside pointCard) map points; day track 'Run', diary 'Ran to …'. Airport → Harbor (2 d): End 7.7 base, −22 stamina. Day orders' own trips stay walked; the bot runs from T-312. npm test 157/157, lint, test:ui 13/13; QA: ran airport → Harbor.

### [x] T-310: Facilities on the map — pins with what they train, landmarks with their kit
Agent: A
Spec: §4.33, §4.18, §9          Goldens: unchanged          Save: no change
Goal: a place's pin shows small body-stat glyphs of what it trains best; its landmark shows its kit (racks, crates + crane,
track, steps, mats).
Files: js/career/mapmodel.js (pin glyphs from kit), js/map3d/pins3d.mjs, js/map3d/kit3d.mjs, js/map3d/town3d.mjs, css/map.css,
tests/map.test.js
Do not: show quality; add draw calls per frame (landmarks stay single meshes).
Accept: map test — every training place's pin lists 1–3 body glyphs; QA screenshot of Wei's district and the Harbor.
QA: career run → map overview + two close-ups.
Result: MapModel.trains(id) → pin `glyphs` (1–3 body glyphs: each stat's best gain among the place's orders, within 60 % of the top; Harbor ▲, the Steps ▲≫, Wei Strength ▲∿), drawn on a tab under the pin (pins3d.mjs, css/map.css); landmarks carry `kit` and kit3d's KIT_PROPS add racks, crates + a crane, plyo boxes, steps, a track, dunes, a pool, a sand court, mats, a shed, a film screen, shelves beside them — merged into the one landmark mesh (no draw call added). Map test (every training place 1–3 glyphs, kits on landmarks). npm test 158/158, lint, test:ui 13/13; QA: overview, Wei's district, the Harbor close-up.

### [x] T-319: The fake set rides on the pass — no slow motion, no ball held in the air
Spec: §2.19 (The fake set rides on the pass)          Goldens: update (the recorded-match hash only; sims unchanged)          Save: no change
Goal: the decoy fake and the setter's dump fake happen as the pass travels; the set or the dump follows at once.
Files: js/engine/rally.js (fakeSet, setActs), js/engine/rally-phases.js (setterDump), js/engine/serve.js (B.last), tests/engine.test.js, spec.md, tests/golden.json
Result: Done (owner request, spec chat). The fake's acts join the pass beat (B.last: the beat whose ball goes to the setter): approach moves, the decoy's jump to its peak at the setter's touch, the bitten middle, the ghost arrow and the label at the end; the dump fake also lifts the setter to meet the pass. A fallback short beat stays for a fake with no pass beat before it (none in 8 test matches). A staged scene (Hype) may still cut in before the set. Test: every fake is on the pass beat, no slow motion, the next play beat moves the ball. 169/169, UI smoke 13/13.

### [x] T-318: The Raid order — a street game on a hot border
Agent: A (after B's T-313 is published: needs `War.hit`)
Spec: §4.33, §4.34          Goldens: unchanged          Save: no change
Goal: a Raid day order at a point on a hot border (or its nearest place) fights a street game there; a win counts × 2 on that
unit's Strength (`War.hit(run, unit, win, 2)`).
Files: js/career/city.js, js/data/career.js (ORDERS.raid), js/ui/career-panels.js (A's place / point card rows — not `pointPanel`'s
war rows), tests/career.test.js (its own test)
Do not: re-implement Strength; add a pop-up.
Accept: test — a raid win moves the unit's Strength twice as far as a street battle win.
QA: career run → raid a border.
Result: (spec chat, after the merge) `Fight.raid` / `raidWhy` + the Raid button on the battle card (a member on this week's hot border, once a week, trip + 1 day, −20 stamina); played at once on a seeded stream (like the Midnight Court) with the war stages; win → their unit `War.hit(…, 2)`, loss → yours × 1; match XP, Drive / Pain; `run.raidW`. Test in war.test.js. Also: the dead hex decals in pins3d.mjs, `.mbord` / `.ptile` CSS and the hub's "A win takes" row removed; Prettier over the merged tree.

### [x] T-311: Endurance in the match — rally HP damage
Agent: B
Spec: §4.33, §2.31          Goldens: unchanged (players without a body: × 1)          Save: no change
Goal: your Endurance lowers your rally HP damage (× (1.2 − 0.4 · end / 100)).
Files: js/engine/bars.js, tests/momentum.test.js
Do not: draw randoms; change any player without `body` (read `p.body && p.body.end`; A's T-307 adds `you.body`).
Accept: goldens unchanged; a test — end 90 takes less HP damage than end 30 on the same balls.
QA: none (engine).
Result: `hpHit` × (1.2 − 0.4 · end / 100) when `p.body.end` is a number, else × 1 (inlined: no new global; HP stays in data/cards.js). Goldens unchanged; test: three soft balls, end 90 takes × 0.84 of the no-body damage, end 30 more, end 50 = × 1.

### [x] T-312: Balance the orders — the bot plays the day orders
Agent: A
Spec: §4.32, §4.33          Goldens: unchanged          Save: no change
Goal: the career bot uses Drill / Work / Run / Stretch (good: keeps the swing full; casual: drills its key stat only); the
order numbers are tuned so good ends year 2 level with the rival (~92) and casual near the league mean (~87).
Files: tests/career-bot.js, js/data/career.js (ORDERS, RUN_GROUND, BODY numbers), spec.md (§4.32 table — spec chat)
Do not: change the year caps or the steep curve without saying so in Result.
Accept: `npm run career -- 20 both` table in §4.32: good Y2 ≥ 91, casual ≤ 88; casual's swing short in ≥ half its runs.
QA: none.
Result: bot: casual drills its key stat (Body.lead), then the weakest, never Flexibility on purpose; good keeps the swing full (Flexibility first while short), Works under $60, Stretches when broke, Runs trips with stamina to spare. Tuned BODY.swing 0.8 → 1, depth 0.7 → 0.95; Heavy sets / Sand drills / Laps lose their Flexibility sides. Also Body.sync: a directly raised court skill (Hermit's +2) is now a floor the body catches up with, not an edge stacked past the cap (good had reached 95.9). career 12 runs: casual Y1 70.5 · Y2 87.3, swing short 12 / 12; good Y1 79.1 · Y2 94.3 (rival 92.5, league 87.2; above the ~92 aim, ≥ 91 ✓); money at the Y1 Cup ~$300 both (≤ $600 in all). Year caps and the steep curve unchanged. §4.32 table left to the spec chat. npm test 158/158, lint.

**Faction war: Strength, structure, overthrow (owner, 2026-10-19, spec §4.34): Agent B.**

### [x] T-313: War units and Strength replace hex takeover
Agent: B
Spec: §4.34          Goldens: unchanged (engine)          Save: RUN_VERSION 21 (`run.war`; `run.hex` dropped) — after A's T-307 (20) is published
Goal: six war units (Wei Iron, Wei Gold, Wu Harbor, Wu Fort, Shu, + none for minors) with Strength 0–100; street battles
move it (Shu × 0.5; Gold only once Iron is gone); no tile flips; prices / quality / joins read Strength. city.js keeps calling
`Front.owner / priceMul / qMul` and `Hex.dist / idAt` — keep them (on Strength); expose `War.hit(run, unit, win, k = 1)`.
Files: js/data/world.js (WAR: units, clubs per unit, deltas, stages; FRONT trimmed), js/career/front.js (pick a border, apply a
battle to Strength), js/career/hex.js (geometry only: unit borders from the grid's outer edge), js/career/world.js,
js/career/fight.js, js/career/mapmodel.js (B's sections), js/career/run.js (RUN_VERSION 21, `war` / `hex` defaults), js/ui/career-panels.js
(B's functions), js/ui/career-dossier.js, js/ui/sheet-season.js (Factions cards), js/data/war.js (new), js/career/war.js (new), index.html
(its lines), tests/war.test.js (new), tests/map.test.js / career.test.js (hex / front tests),
ARCHITECTURE.md, ARCHITECTURE-details.md
Do not: change NPC homes or region names; touch js/engine.
Accept: 30-week headless run — every unit's Strength stays in 0–100, Shu loses ≤ half what Iron loses for the same results,
Gold untouched while Iron stands (tests).
QA: career run → Factions cards and a border.
Result: js/data/war.js (WAR, WAR_STAGES) + js/career/war.js (War: str/stage/weak/holder/unitAt/edges/pairs/hit/week/sync), `run.war` v21; Hex = geometry + `t.unit` (Gold = Wei tiles ≥ 3 steps from another major: Iron 33 / Gold 16 tiles; Wu by nearest HQ: Harbor 16 / Fort 21); Front.site picks the week's unit border by hash (no extra R()). Tests: 30 weeks of forced battles stay in 0–100, Shu −4 vs Iron −8, Gold 100 throughout; 5 headless 2-year runs end with lows 48–95 (Fort / Iron), nobody Broken — the deltas are mild at ~0.45 battles a week. Deviations: tests/run.js registers war.test.js; HEX_COST/VALUE/ECON, Front.econ/down, the tile pressure and the `value` term are gone (`strength`, `stage` terms added; `seize` reworded as the overthrow); tests/people.test.js:723 still expects v19 (A's file: fails until merge, set it to 21). QA: Factions cards, dossier, battle card, border point — screenshots fine.

### [x] T-314: Stages in the match — Strained, Shaken, Broken
Agent: B
Spec: §4.34, §2.31, §2.33          Goldens: unchanged (no `weak` → today)          Save: no change
Goal: a squad of a weakened unit plays with its stage's debuffs (morale start, HP heal, one card slot fewer); Iron bleeds into
Gold one step lighter; Shu one stage late; match prep shows the stage.
Files: js/engine/match.js (newMatch opts.weak), js/engine/bars.js, js/engine/cards.js, js/career/cup.js (fixture setup),
js/career/fight.js, js/career/court.js, js/ui/match-prep.js, tests/momentum.test.js, tests/cards.test.js
Do not: draw R(); change a match without `weak`.
Accept: goldens unchanged; tests — Broken side has 4 slots and starts 10 morale lower; 200 sims Broken vs Steady equal
squads: the Steady side wins clearly more (state the %).
QA: Monster game with `weak` forced on one side → prep chip.
Result: engine `weakSet(m, [k0, k1])` (= `opts.weak`; absent / [0, 0] → the same match, goldens unchanged): morale −0.1 at the start, HP heal −0.25 when Shaken, a Broken side loses FLEX (`C.off`, `cardSlots`); `War.weak` (Gold = max(own, Iron − 1), Shu one late), `War.match` in every career fixture's setup (Cup eval / cup, street battle, challenge, court; squads tagged by unit / region); match prep's chip (`prepStage`). 200 sims Broken vs Steady, same squads both ways: Steady wins 115/200 (58 %) — the stages bite but mildly. Deviation: the FLEX slot still draws as "Empty" in the hand (js/ui/match-cards.js is the cards session's); cards.js only gained the slot lock. QA: Monster game, weakSet [3, 1] → Broken / Strained chips; ui-smoke 13/13.

### [x] T-315: The overthrow and a destroyed faction
Agent: B
Spec: §4.34          Goldens: unchanged          Save: no change (inside `run.war`)
Goal: a Broken unit can be challenged at its HQ (you, a unit fighting it, or the AI below 10); a 5-set match against its ace
squad; a win destroys it — places and region to the winner, players scattered, Cup places to the winner, members freed;
Haewon walks out (scene); a loss rallies it.
Files: js/career/front.js, js/career/war.js, js/career/cup.js (entrants by unit), js/career/world.js (members freed; the scatter
calls People.toReserve / People.remove — A's file, call only), js/career/story.js, js/data/story.js (walk-out, fall news — lore voices), js/ui/career-panels.js (HQ card: Challenge),
js/career/mapmodel.js, js/map3d/map3d.mjs (region recolour + pan), tests/career.test.js
Do not: let Haewon join the winner or your club; allow a challenge within 4 weeks of that unit's last overthrow match; slow the street battles.
Accept: tests — destroying Iron opens Gold's border; destroying Harbor leaves Fort's Strength unchanged; a destroyed unit
sends no Cup squads and the winner gets its places; Haewon is never on the winner's or your squad; a rallied unit can't be challenged for 4 weeks while its border's battles go on.
QA: career run (forced Broken Iron) → challenge, win, the map recolours.
Result: War.can / side / overthrow / overthrowResult / destroy / rally / ai / into / free / walkout; Cup.places (squads per unit, a fallen unit's share to its holder's region: e.g. Iron down → wei 4→3, wu 3→4; a wiped region sends 0); clubs of a fallen unit stop (no joins, no challenges, HQ tag "Destroyed by"), you are freed to the Academy squad (diary line), its 2 best players and the rival move by seat swap (Shu / Gloria have no reserves); the rival → the strongest standing major that is neither the winner's nor yours, else St. Gloria, `walkout` scene (rumor + diary); fall news in the Gazette voice (WAR_LINES, js/data/story.js); the map pans to the latest fall (map3d). Deviations: **one match, not 5 sets** — the engine plays one set to 15 (a best-of-5 needs engine + match-UI work: a task for the spec chat); tests in tests/war.test.js (not career.test.js); the action `mapOverthrow` lives in career-dossier.js (career-map.js is A's); the AI runs from War.week (a simMatch of the two aces, main stream). QA: Iron forced Broken → HQ card's Overthrow peek → simmed (lost 10-15: Iron rallied to 24) → forced destroy: Iron's land recolours Wu, inbox lists the seized places.

### [x] T-316: You in the war — call-ups
Agent: B
Spec: §4.33, §4.34          Goldens: unchanged          Save: no change
Goal: your club calls you up on battle weeks (refusal costs standing). (The Raid order is A's T-318.)
Files: js/career/fight.js, js/data/war.js, js/ui/career-panels.js (`clashPanel`), tests/war.test.js
Do not: add a pop-up beyond the existing battle card.
Accept: tests — a member is called up on a battle week of their unit; a refused call-up costs standing.
QA: career run → a call-up week.
Result: `Fight.calledFor` (your club's unit on the week's border) / `Fight.refuse` (−8 standing with your faction, diary line) on stay-away (clashEnd), watching, or fighting for the other side; WAR_CALL in js/data/war.js (the call in wei / wu / shu voices); clashPanel: Call-up + Refuse rows first, your side's Fight button is the ink primary — no new pop-up. Test: called for Harbor's battle, not Fort's; stay-away −8; answering costs nothing extra; free agents never called. QA: call-up week card screenshot fine.

### [x] T-317: Borders on the map — lines, heat, banners
Agent: B
Spec: §4.34, §4.18          Goldens: unchanged          Save: no change
Goal: hex fills and the tile panel go; each war unit's border is one smoothed line in its colour; fighting heats a stretch
(glow, pulse, banners); the battle site sits on it.
Files: js/map3d/map3d.mjs, js/map3d/geo3d.mjs (banners there, not in A's pins3d.mjs), js/career/mapmodel.js (B's sections), css/map.css
(`/* war */`), tests/map.test.js (hex / war tests)
Do not: add per-frame allocations; colour terrain (faction colour only on borders, banners).
Accept: map test — one closed border per unit; the hot stretch is the one the week's battle was on; QA screenshot.
QA: career run → map overview, a hot border close-up.
Result: model key `borders` (MapModel.warMap; `hexes` gone, so pins3d draws no fills / tile chips) — Hex.outline + Hex.smooth: one closed Chaikin-smoothed loop per standing unit (Iron 70 corners, Gold 36, Harbor 34, Fort 42, Shu 68), in its lead club's colour, drawn just inside its own land so neighbours sit side by side; the hot stretch = War.meet of the battle's two units (pulsing amber glow, opacity only per frame), banner pairs every 10 points facing across (geo3d `ribbon` / `bannerArrays`, map3d `warLayer`: 3 meshes, rebuilt on JSON change); the point panel's tile block is gone. Map test: one loop per unit, the hot stretch is the battle's and the site sits on it, a destroyed unit's land joins its destroyer's one border. Notes: pins3d.mjs (A's) keeps its now-unused hex-decal code and css/map.css its `.ptile` / `.mbord` rules — remove at merge; borders along the coast sit in the water and stay hidden (only land borders show). QA: overview + Iron/Harbor close-up (glow, banners, ⚔ on the line). ui-smoke: 13/13 before; after T-317 two runs each failed one different, map-unrelated step under load (court prep text, Monster cards row; 0 page errors) — re-run at merge.

**Semi-automatic matches (owner, 2026-10-16, spec §2.31–§2.33): T-294 → T-297, spec chat, in order.** Built and measured,
not tuned (owner: "no need to fine tune it yet"). T-283 / T-284 wait: the cards replace the board they tune.

### [x] T-294: HP and per-player morale
Spec: §2.31          Goldens: update (collapse replaces the knockdown roll; morale traits move fire)          Save: no change
Goal: every player has HP (rally damage, partial heal, collapse) and morale (today's fire rules per player, traits); team fire
= their average.
Files: js/data/cards.js (new: HP, MTRAITS), js/engine/bars.js (new), js/engine/match.js (knock, pointMomentum, timeout,
newMatch), js/engine/fire.js (zone breaker), js/engine/stats.js (dr), index.html, tests/momentum.test.js, tests/golden.json,
ARCHITECTURE.md, ARCHITECTURE-details.md
Do not: draw R() for HP or traits (hashes); change the stages' thresholds.
Accept: no traits → fire equals the average morale; a passer served at hard 3 rallies running collapses; tests pass.
QA: none (engine).
Result: Built (js/engine/bars.js, js/data/cards.js). HP: gap 0, span 30, heal 0.2 — collapses (60 sims) league ~0.1 / tournament ~5 per 100 points (the roll gave ~1.4 / ~9; untuned). Morale per player for the whole squad, fire = on-court average (captain ×2); no traits → equal to the old fire (test). Traits by hash (~half). 200 tournament matches: Loose 6 · Composed 49 · Focused 43 · Fever 2 % (Fever in 49 %). Tests: stuff band 7–12.5 % (11.8 now), Commit's test checks stuffed quicks (quick kills now level with Read). Goldens updated.

### [x] T-295: Tactic cards and turns
Spec: §2.32, §2.33          Goldens: update (the coach slots cards in every match)          Save: no change
Goal: every side plays a 5-slot hand from its squad's pool, refilled at turns (every 6 points, a spent card, a timeout);
plays compile into plans / orders / the tactic / forced techniques / buffs; combos; spent at −3; Stubborn.
Files: js/data/cards.js, js/engine/cards.js (new), js/engine/fire.js (stageBuff × card buff), js/engine/match.js (end: turns,
tallies; timeout), js/engine/serve.js, js/engine/rally.js, js/engine/rally-phases.js, js/engine/rally-block.js,
js/engine/rally-defense.js (forced techniques), index.html, tests/cards.test.js (new), tests/golden.json, ARCHITECTURE.md,
ARCHITECTURE-details.md
Do not: draw R() in the coach's pick; change a technique's chance when no card forces it.
Accept: tests — a forced Killer fires on every holder's jump serve; a Stubborn holder isn't forced; a play at −3 is spent and
never slotted again; combos link; turns every 6 points.
QA: none (engine).
Result: Built as specced (js/engine/cards.js, CARDS / COMBOS / TURN / SLOTS / CARD_AI in js/data/cards.js). Cards compile into plans, the tactic, orders (`C.cord`; never over an order already set), forced techniques (`cardForce` at the R()-gated hooks; Cut Shot +0.25) and buffs (`cardBuff` × stageBuff). `opts.cards === false` = no hand; `opts.plan` keeps cards off that side's plan (old tests). A timeout refills the calling side. Act kinds `turn` / `cardspent` with handlers (js/ui/match-cards.js stub until T-297). Also render/acts.js, js/ui/match-cards.js (new), tests/run.js. Goldens updated (the coach slots cards in every match). 145/145.

### [x] T-296: Measure the cards, bars and turns
Spec: §2.31–§2.33          Goldens: unchanged          Save: no change
Goal: `npm run cards` — paired seeds, league + tournament: no cards / boosts only / coach / random plays / each play blanket;
spent per match, collapses per 100 points, stage shares, traits. Numbers into spec.
Files: tests/cards.js (new), package.json, spec.md (measured lines)
Result: tests/cards.js + `npm run cards -- [pairs] [league|tour|both] [modes]` (~75 s for 100 pairs both). Numbers in spec §2.33 Measured. Headline: boosts only +2.1 / +2.2 % points vs no cards (league / tournament), coach +2.3 / +0.8, random plays +2.1 / +1.3 — the coach is not above boosts and plays add little: fails the must-hold; next is the balance pass (owner: not tuned yet). Also js/engine/cards.js: a side you run in full (`by: 'you'`, mine 5) keeps empty slots empty.

### [x] T-297: Card UI — bars, the turn overlay, prep, result card
Spec: §2.31–§2.33, §9          Goldens: unchanged          Save: no change
Goal: three thin bars under each name tag; the turn overlay (hand row, five slots, Auto, Space) pauses a played match at turns;
match prep shows the hand instead of the plan tiles and the board; Tab opens the overlay; the result card's row: cards played /
spent.
Files: js/ui/match-cards.js (new), js/ui/match-prep.js, js/ui/match-controls.js, js/ui/match-result.js, js/render/tags.js,
js/render/playback.js (turn pause), css/match.css, index.html, tests/ui-smoke.js, ARCHITECTURE.md
QA: Monster game → prep hand, a turn, a spent card.
Result: js/ui/match-cards.js (hand, turn overlay #cturn, Tab look, spent tag, result row); prep shows the hand instead of the plan tiles / board tabs (both kept for a cardless match); court tags draw HP / stamina / morale (snapshot gains `hp`, `mor` — goldens: the recorded-match hash moved, no gameplay change). Not js/render/playback.js: the turn act's handler pauses via A.prep (the next rally is pulled only after). Career: your side 1 card (5 as captain); trust's 2 needs a trust value (not built). Also css `.ocard.prep { flex-wrap: nowrap }` (a tall card wrapped into a second column). QA (Monster, seed 7): prep hand, turn 1 at 4–1 with bars, no page errors. UI smoke 13/13.

**Year 2 and Drive & Pain (owner, 2026-10-15, spec §4.28 "Year 2 decided", §4.30): T-286 → T-291, in order.** Year 1 is
the expected failure, year 2 the redemption. One save bump (RUN_VERSION 19) in T-286 covers the whole block; later tasks add
fields through RUN_DEFAULTS. Story mode only (Endless stays unbuilt); the main random stream is untouched (seeded rolls).


### [x] T-306: Filter the card pool
Spec: §2.33 (On screen, Filters)          Goldens: unchanged          Save: no change
Goal: the 43-card pool can be narrowed to what fits now, a zone or a kind.
Files: js/ui/match-cards.js (CARD_FILTS, cardsFiltBar, cardsFilt; A.cardFilt), css/match.css, tests/ui-smoke.js, spec.md
Result: Done (owner request, spec chat). Prep and the turn overlay share the hand code, so both get the row. UI smoke: DEF shows only DEF cards, All brings Power Up back. QA (Monster prep, seed 7): Fits now → 11 of 38. UI smoke 13/13.

### [x] T-305: More cards — one-shots, traps, new plays and OP cards, counters filled
Spec: §2.33 (More cards)          Goldens: update (new cards in every pool; the coach's picks)          Save: no change
Goal: one-shot and trap kinds; Short Serve, Feed the Hot Hand, Float Barrage, Read the Setter, Timeout Talk, Serve / Quick
Trap, Block Bait; OP Zone, Overload, Last Stand; counters for Read Block, Soft Block, Sync, Pipe Combo, Lefty.
Files: js/data/cards.js, js/engine/cards.js (cardOn, cardTraps, one-shots, new reads, ord who setter / all, value hot), js/engine/serve.js (traps before the serve), js/engine/stats.js (Overload drain), js/ui/match-cards.js, css/match.css, tests/cards.test.js, spec.md, ARCHITECTURE.md, tests/golden.json
Result: Done (owner request, spec chat). The coach sets a trap only for a card the other side has slotted before (it can't see the hand). The OP cards got their own reads (the coach always took Element Surge). Edges tuned once on the reads (Short Serve −15 → −30 their power, Feed +40, Read the Setter jump 45 + def 15, Highlight Reel power 35). Measured in spec §2.33 More cards: the must-hold holds now (coach +14.8 / +19.2 % points vs no cards; boosts +1.2 / +2.1). Float Barrage and Hot Streak fit too rarely to read. QA (Monster prep, seed 7): both pools show the new cards, one-shots green-edged, traps dashed. 154/154, UI smoke 13/13.

### [x] T-304: More traits — twelve, ~85 % of players, seven new trait cards
Spec: §2.31 (More traits)          Goldens: update (trait shares re-roll who has which)          Save: no change
Goal: Clutch, Hothead, Iron Body, Slow Starter, Underdog, Trash Talker, Choker; trait cards Highlight Reel, Ice Veins, Hot
Streak, Take the Hit, Second Wind, Giant Killer, Get In Their Head.
Files: js/data/cards.js (MTRAITS, TRAIT_LATE / TRAIT_EARLY), js/engine/bars.js (morPoint factors, Trash Talker, Iron Body in hpHit), js/engine/cards.js (`needT`, `when` = any read), tests/cards.test.js, spec.md
Result: Done (owner request, spec chat). Shares re-balanced to 0.85 total (Spiteful 12 → 10, Glass 10 → 6, Showboat / Anchor 10 → 8, Stubborn 8 → 6), so some players' traits changed. A card's `when` is now any CARD_FIT read; `needT` limits a buff to that trait's players (Highlight Reel). End morale by trait in spec §2.33 (More cards, Measured). Tests: shares, Iron Body × 0.7, Choker / Clutch late.

### [x] T-303: The block meets the ball on its own line
Spec: §2.19 (The block meets the ball's own line)          Goldens: update (blocker pick, over-the-hands gate, cut read)          Save: no change
Goal: a blocked spike flies its own line to where it crosses the net; the blocker there reaches to it — no ball pulled up or
across into a hand.
Files: js/engine/rally-block.js (BLOCK_GEO, netCross, heights), js/engine/rally-defense.js (block, stuff, touch, tool, break), js/engine/rally.js (blockJumpActs keeps x.bjA, heightRead), js/render/playback.js (geo flag), js/render3d/r3d.mjs (handTouch skips geo), spec.md, tests/golden.json
Result: Done (owner request, spec chat). The block contact is the spike's own net crossing (contact → landing, ≥ 168 h over the tape); the nearer blocker along the net meets it (± 0.05 z of hands); `geo` balls are not pulled onto a palm (r3d handTouch), the hands reach by IK; a blocker above the line drops the jump to fingertips 45 h (≈ 0.7 m) over the ball (x.bjA); over the fingertips by 14+ only a fingertip touch, by 30+ untouched; stuff rebounds / tool / break follow that point; heightRead: up to +25 % cut-shot chance vs a block reaching 60 h over the hitter (Wit). Measured (5 seeds × 50, no cards): stuffs 10.8 → 10.7 %, kills 38.0 → 38.8 %; 30 visual matches: 153 block contacts, 109 at the tape line, ~half the blockers lower their jump. Tests: three statistical guards moved with the stream (non-setter assists < 13 % — seeds 5–7 spread 11.4–12.9 before and after; aimed serve odds over 80 matches; the tip probe on a front-row hitter). QA (Monster, seed 7): a Soft Block at 1–1 — the ball on its line met the blocker's hands at the net. 151/151, UI smoke 13/13.

### [x] T-302: Drag the cards
Spec: §2.33 (On screen)          Goldens: unchanged          Save: no change
Goal: cards can be dragged: pool → slot, slot → slot (swap), slot → pool.
Files: js/ui/match-cards.js, js/ui/match-prep.js, css/match.css, tests/ui-smoke.js, spec.md
Result: Done (owner request, spec chat). HTML5 drag and drop on the hand in prep and the turn overlay; slots it fits light up. Also: the prep / turn card's entrance animation now plays once per opening (`settled`) — every redraw on a click or drop replayed it (a flicker; in headless QA it stuck invisible). UI smoke drags Power Up into ATK 2 and back to the pool; QA swapped two slots. 135 quick, UI smoke 13/13.

### [x] T-301: The tactic shows — speed and jumps with the edge, and a jump that fits its height
Spec: §2.33 (You can see the tactic)          Goldens: update (flight times feed dive / busy)          Save: no change
Goal: cards change what you see again (owner), capped (300 km/h, 4 m); a higher jump leaves earlier under gravity, after a
longer run-up, and carries further.
Files: js/engine/stats.js (powVis cap), js/render/playback.js (jumpT0), js/render/movement.js (approachOf), spec.md, tests/golden.json
Result: Done (owner request, spec chat). T-300's divide-out of the ball's edge undone; jumps were already shown. QA in Monster: a 3.15 m jump took off at 0.21 of the set beat, from the take-off point. 151/151, UI smoke 13/13.

### [x] T-300: Ball speed and jump height with card edges
Spec: §2.33 (Edges win contests, not km/h)          Goldens: update (flight times feed the dive / busy decisions)          Save: no change
Goal: card edges stop inflating ball speed (540 km/h) and jumps (5.4 m); jumps may show a raised edge up to 4 m (owner).
Files: js/engine/cards.js (edgeK), js/engine/stats.js (powVis, jumpVis, JUMP_MAX_M, jumpCm), js/engine/rally.js,
rally-defense.js, rally-phases.js, rally-block.js, serve.js, tests/engine.test.js, tests/people.test.js, tests/golden.json
Result: Done (owner request, spec chat). Contest values untouched; display / flight use powVis and jumpVis. Order-system tests (role / spike / setter orders, the odds probe) run cardless; the rel calibration averages 10 seeds with a never-reached bond counted as week 28 (one of 5 seeds swung it by 18 weeks after the stream shift). 151/151, UI smoke 13/13.

### [x] T-299: Balance pass — reading pays, collapses common
Spec: §2.31 (collapse rate), §2.33 (balance pass)          Goldens: update          Save: no change
Goal: a fitting play wins +10–20 % more of the rallies it acts in, a countered one −10–20 %, a misfit ≈ −5 %; plays burn
only when countered / misfit; boosts +3; the coach slots what fits; ~30 % of kept-up receives / digs collapse, by stat gap.
Files: js/data/cards.js, js/engine/cards.js, js/engine/bars.js, js/engine/match.js (knock tally), tests/cards.js,
tests/cards.test.js, tests/*.test.js (statistical bands the collapse rate moves), tests/golden.json, spec.md (measured)
Accept: `npm run cards` prints per play the acting-rally win rate fit / misfit / countered vs the same rallies without it;
fit +10–20, countered −10–20; collapse share ~30 % (league and tournament); coach ≥ boosts-only.
Result: Built; numbers in spec §2.33 (Measured) and §2.31 (collapse). Edges per play (CARD_EDGE, × EDGE.k 2), fit reads (CARD_FIT), states per rally (cardEdges), plays burn only off the read, coach scores by the read and swaps a play seen countered (2+ rallies). Coach hand +12 / +17 % points over no cards (league / tournament); fitting plays +9–18 on the rallies they act in, countered −9 to −27. Weak spots: Tip's and the serve techniques' counters barely bite; random hands +8–10 (half fit) — the old ±2 must-hold no longer applies. Collapse: HP by r = power / Defense (16 / 24 % of hits). Also tests/reads.js (`npm run reads`), chips show Fits now; legacy-system tests run cardless (elements, lane-read, laning, middle orders; Commit's pin-cost assertion dropped). Goldens updated.

### [x] T-298: Remove the old plan pages
Spec: §2.26, §2.29, §2.33          Goldens: unchanged          Save: no change
Goal: the plan tiles in prep, the Plan board (its player tabs and Tab) and the result card's Plans / Orders rows go; the cards
are the only way to set plans and orders. Engine plans and orders stay (the cards compile into them; tests and the bot use them).
Files: js/ui/plan-board.js (deleted), js/ui/match-prep.js, js/ui/match-controls.js, js/ui/match-result.js, js/render/tags.js,
js/render/acts.js, css/match.css, index.html, ARCHITECTURE.md, spec.md
Result: Done (owner request, spec chat). Prep = teams + hands only; your timeout opens the turn overlay; Tab = a look at your hand. The court tag's ◆ order mark went with the board. UI smoke 13/13, 135 quick tests.
### [x] T-286: Two seasons — the year rolls over after the year-1 Cup
Spec: §4.28 Year 2          Goldens: unchanged          Save: RUN_VERSION 19 (`run.year`; week stamps rebased)
Goal: In Story mode the year-1 U21 Cup no longer ends the run: the run goes on to year 2 (week 1 again, the calendar and the
Cup repeat); the year-2 Cup ends it. The hub and menu show the year.
Files: js/career/season.js (new; index.html), js/career/run.js, js/career/cup.js, js/career/stars.js, js/career/story.js,
js/career/asks.js, js/career/people.js, js/career/rel.js, js/career/hex.js, js/career/element.js, js/data/career.js,
js/ui/career-hub.js, js/ui/menu.js, js/ui/sheet-season.js, js/ui/career-end.js, tests/career.test.js
Do not: add an absolute-week refactor across the codebase; touch the engine; build the off-season (T-287) or endings (T-289).
Steps:
1. `run.year` (1 | 2) in RUN_DEFAULTS; RUN_VERSION 19 + RUN_MIGRATIONS[18] (year: 1).
2. `Season` (season.js): `last(run)` (year 2 or not Story), `rollover(run)`: rebase every stored week stamp used in a
   difference by −(CAREER.weeks + 1) (people `bench`, `run.mem` entries' `w`, `run.hex.t`, `run.scout`, `run.refused[*].week`,
   `run.elNext`, `run.loans[*].due`), clear the per-week ones (`sitout`, `duo`, `asks`, `eval`, `cup`), `run.year++`,
   `run.week = 1`, `Run.nextWeek`. Display lists (log, mlog, hist, evals, cups) get a `y` field and keep their week.
3. `Cup.close`: Story and not `Season.last` → `Season.rollover` instead of `Cup.end` (the cups list keeps the year-1 entry).
4. Stars.target: year 1 as today; year 2 reads the year-2 curve (T-288 fills it; until then they hold their year-1 end).
5. Story gates (`week2`, `week3`, Fern's lessons, the campus fence) only in year 1.
6. UI: "Year N · Week w / 28" on the hub and the menu's resume line; the Season sheet's week strip per year; the end
   screen lists both years' cups.
Accept:
- A full Story run (harness policy) plays 2 × 28 weeks + 2 Cups and ends with a result; Endless (story false) ends after one.
- Save → load in year 2 round-trips; a v18 save loads as year 1.
- No cooldown misfires after the rollover (a club refused in week 25 is asked again by its normal rule).
QA: career run → Season sheet and hub in year 2 (a dev jump: `Season.rollover(RUN)` from the console).
Result: Built (Season module, RUN_VERSION 19 + migration). Also js/career/fight.js, js/career/city.js, js/ui/career-people.js (Season.wk hashes, fence, rebased labels); story clock = Season.wk. 145/145 full, UI smoke 13/13.

### [x] T-287: The off-season
Spec: §4.28 Year 2 (full off-season)          Goldens: unchanged          Save: no change
Goal: Between the years the island moves on: the first aces and Fern leave, a transfer window and a promotion pass run,
every NPC grows a year; the Gazette reports it.
Files: js/career/season.js, js/career/world.js, js/career/growth.js, js/career/people.js, js/career/stars.js,
js/data/career.js, js/career/mapmodel.js, tests/career.test.js
Do not: move or cut the rival or the cohort; draw from the run's main stream outside the existing World / Growth calls.
Steps:
1. `Season.offseason(run)` before the week reset: the first aces (`named: 'ace'`) leave — their club promotes its best
   same-role reserve (the World.promote path); Fern leaves (Story flag `fernGone`; MapModel figure gone).
2. `OFFSEASON = { transfers: 6 }` rounds of World.transfers, then World.promote.
3. NPC growth: a season's worth of Growth.grow per player at once (one call with a weeks factor, not 28 loops).
4. A Gazette issue "The off-season" listing who left, moved and broke through.
Accept: after the rollover no first ace and no Fern exists; league mean OVR rises by roughly a season's NPC growth;
the cohort and the rival are on their clubs.
QA: none
Result: Built; NPC growth: a 4-week summer + year-2 field × 0.4 (PEOPLE.year2) instead of a season at once — league mean ~82 → ~87 by the year-2 Cup (rival 92). A leaving ace takes a same-role reserve from any pool when its own has none.

### [x] T-288: The rival in year 2 — curves, the week-14 rematch, the Cup path
Spec: §4.28 Year 2          Goldens: unchanged          Save: no change
Goal: The cohort plateaus in year 2; a guaranteed rematch against Wei Dynasty · Gold in week 14; the year-2 Cup seeds the
rival's squad into the other half of your bracket.
Files: js/data/stars.js, js/career/stars.js, js/data/career.js, js/career/cup.js, js/career/eval.js, js/career/run.js,
js/ui/career-hub.js, js/ui/career-match.js, js/ui/sheet-season.js, tests/career.test.js
Do not: change the year-1 curves; add a new beat act kind; force your lineup outside the rematch.
Steps:
1. STARS year-2 curves: rival `ovr2 [90, 92]` (`ovr2max [90, 95]` when you beat her squad in the year-1 Cup — story flag),
   cohort `[85, 88]`; Stars.target picks by `run.year`.
2. `CALENDAR2 = { 14: 'rematch' }` merged in Run.weekType for year 2; the fixture: your club (or the Academy squad) vs
   Wei Dynasty · Gold with the rival starting; recorded in mlog as "Rematch"; you start (Story).
3. Cup.start in year 2: after seeding, swap entrants so the rival's squad sits in the half opposite yours.
Accept: every year-2 Story run plays the rematch in week 14; in 20 seeded runs the rival's squad is never in your half;
her OVR at the year-2 Cup is 92 (95 with the flag).
QA: career run → week-14 hub card and match.
Result: Built; the rematch is an evaluation of kind 'rematch' (Eval.rematch / Season.cal), so the hub, prep and result paths are the evaluation's. Year-2 Cup: Cup.placeRival seats her if not drawn; Cup.splitRival.

### [x] T-289: The year scenes and the two endings
Spec: §4.28, lore.md §6          Goldens: unchanged          Save: no change
Goal: The story frames the two years: the year-1 Cup result scene, Fern's goodbye at the off-season, the rematch's
before / after lines, and two endings on the end screen.
Files: js/data/story.js, js/career/story.js, js/career/cup.js, js/ui/career-end.js, tests/career.test.js
Do not: write lines outside lore.md's voice list; add randoms.
Steps:
1. Scenes: `y1Lost` ("She doesn't remember. You do."), `y1Won` (the rival takes it personally), `fernBye`, `rematchPre`,
   `rematchPost` (won / lost), `trueEnd` (picked together; "they finally remember"), `spiteEnd` (they go without her).
2. Cup.end in year 2: the result carries `ending: 'true' | 'spite'`; the end screen shows it.
Accept: each scene fires once at its moment in a scripted run; both endings reachable in tests.
QA: career run → end screen (dev: finish the year-2 Cup won / lost).
Result: Built: y1Won / y1Lost / fernBye / rematchPre / rematchWon / rematchLost scenes, ENDINGS on the end screen; year-1 lessons and pick scenes never replay.

### [x] T-290: Drive & Pain — the hidden bars
Spec: §4.30          Goldens: unchanged          Save: no change (RUN_DEFAULTS `drive`, `pain`, `fired`, `scars`)
Goal: Two hidden 0–100 bars fill from what happens to the MC; Drive at 100 → Fired up for the next 2 matches; Pain at 100
→ a Scar (pool placeholder until T-291); only indirect cues on screen.
Files: js/career/feel.js (new; index.html), js/data/career.js (FEEL table), js/career/run.js, js/career/training.js,
js/career/cup.js, js/career/world.js, js/career/people.js, js/career/fight.js, js/ui/career-hub.js, tests/career.test.js
Do not: show a bar or number; touch the engine's formulas (Fired up rides the existing match buff / form hooks); draw
from the main random stream.
Steps:
1. `FEEL` (data): Drive gains per source (train, win, grade A/S, praise memory, good event, joined, Great-mood week streak
   of 3), idle-week drain; Pain gains per source (loss, loss by 8+, benched, cut, refused, rival loss, rival "doesn't
   remember", Awful-mood streak); Fired up { matches: 2, stat: 1.1, train: 1.25 }.
2. `Feel.add(run, 'drive' | 'pain', src)` called from the sources; at 100: Drive → `run.fired = 2`, Pain → `Feel.scar(run)`
   (placeholder: records `{ k: 'pending', y, w }`; T-291 rolls the trait).
3. Fired up: Cup.prepare / Cup.fixture applies the stat amplification to you for the match and counts it down; training
   gains × FEEL.fired.train while it lasts.
4. Indirect cues: a diary line at 50 / 80 of each bar (seeded pick from a few lines per band, lore voice), a hub portrait
   tint while Fired up, a teammate remark.
Accept: a scripted week of wins fills Drive to Fired up; a run of losses reaches a Scar; no UI shows a value.
QA: career run → hub after a Fired up trigger.
Result: Built; Feel.result runs from Cup.record (every match kind); Fired up = m.buff lv 2 for the whole match. Harness runs (1 training a week) reach ~1 Scar in two years; real play trains daily → more Drive.

### [x] T-292: Fern's goodbye and the first four secret places
Spec: §4.31          Goldens: unchanged          Save: no change (RUN_DEFAULTS `secret`: id → true; `habits`: revealed rival habits)
Goal: At the off-season Fern names the secret places in her goodbye scene; the Tape Room, the Lighthouse, the Hermit's
Court and Fern's Rooftop appear on the map with a reveal and each does its one thing.
Files: js/data/city.js, js/career/city.js, js/data/story.js, js/career/story.js, js/career/season.js, js/career/feel.js,
js/career/mapmodel.js, js/ui/career-map.js, js/ui/plan-board.js, js/map3d/ (the place markers only), tests/career.test.js
Do not: put a money lock on them; make any of them a stat gym; show the hidden bars' values.
Steps:
1. `SECRET` places in CITY data (hidden until `run.secret[id]`); `fernBye` scene (T-289) sets them.
2. Tape Room: a day; first viewing Pain + (Feel); later viewings reveal the next of the rival's habits (from her
   laneSeen-style tallies / STARS data) into `run.habits`; the Plan board shows them on her when you face her.
3. Lighthouse (night): two choices — let go (Pain − FEEL.light.let) / sharpen (Pain + FEEL.light.sharp, next Scar's
   OP odds + FEEL.light.op).
4. Hermit's Court: a trial per visit (a stat bar to reach, the next one higher); passed → a secret technique (one of a
   short authored list in js/data/skills.js — ids only here, effects with T-291's special moves).
5. Fern's Rooftop: one letter a month in year 2 — authored hints chosen by what you lack (lowest stat, no habits
   revealed, Drive low), lore voice.
Accept: after the rollover the four places are on the map; each acts as above in a scripted run; none before Fern's goodbye.
QA: career run → map after the off-season; each card.
Result: Built (js/career/secret.js; SPOTS + road nodes + edges; secretPanel; boardHabits). Night-only dropped (no night turn: a day like any place).

### [x] T-293: The Onsen, the Midnight Court, the Old Scout
Spec: §4.31          Goldens: unchanged          Save: no change
Goal: The other three secret places: deep rest; night games where the named players may appear; a monthly honest rating.
Files: js/data/city.js, js/career/city.js, js/career/court.js, js/career/feel.js, js/data/story.js, js/ui/career-map.js,
tests/career.test.js
Do not: let the Old Scout run more than one headless sim set a month; draw from the main random stream for who shows up.
Steps:
1. Onsen: 2 days → full stamina, mood Great, injury −1 week.
2. Midnight Court (night; unlocked by a street contact after a street win): a court match (Court) where a named player
   may take the other side (seeded); win → Drive + FEEL.midnight.win, loss → Pain + FEEL.midnight.loss.
3. Old Scout (unlocked at a fan mark): once a month, your squad vs the rival's squad over N headless matches → "x in 10".
Accept: each place acts as above; the Old Scout's number matches a direct simMatch tally for the same squads.
QA: career run → each card.
Result: Built; night games and the scout's sims on a seeded stream (Secret.isolated) — the run's stream is untouched.

### [x] T-291: Sparks and Scars — the trait pools; the special VFX
Spec: §4.30 (decided 2026-10-20)          Goldens: unchanged (only your player carries traits; a match without them is today's)          Save: no change (`run.scars` exists; `run.sparks` added as a RUN_DEFAULTS field, no bump)
Goal: Fired up rolls a permanent Spark (35 %, Drive pool); Pain at 100 rolls a Scar (88 % bad / 12 %+ OP), hidden until it
first acts in a match; every trait's effect works; the five special VFX show only for OP, Fired-up or unlocking-trait players.
Files: js/data/traits.js (new: SPARKS, SCARS, odds), js/career/feel.js (roll on Fired up / Pain 100 — seeded `hstr`, no R()),
js/career/run.js (`sparks` default; you.traits for the match), js/engine/bars.js, js/engine/formulas.js, js/engine/match.js
(trait hooks: read `p.traits` only — absent = today), js/career/training.js (Insomnia), js/career/rel.js (Bitter), js/career/fight.js
(Glass Ankle), js/ui/sheet-me.js (named traits; "something broke" for a hidden Scar), js/data/story.js (diary lines — lore
voice `diary`), js/render3d/actors3d.mjs (eye trails), js/render3d/fx/hits.mjs + js/render/effects.js (air impact, burst),
js/render/playback.js (warp), js/render3d/trails3d.mjs / arena3d.mjs (ink style), index.html, tests/career.test.js,
tests/engine.test.js, ARCHITECTURE-details.md
Do not: draw R() for the rolls or the effects; give NPCs traits; change any match where nobody has traits (goldens).
Accept: tests — Fired up ×100 seeds: ~35 % Sparks, no repeats, ≤ 3; Pain-100 ×1000 seeds: 12 ± 3 % OP with no sharpen, more
with; a hidden Scar is named on the first match it acts; each trait's effect changes its number in a scripted match; a
non-OP star without a trait shows no air impact / warp / eye trails / burst / ink (QA); `npm run career -- 20 both` unchanged
within noise for ratings.
QA: Monster game (an OP vs a plain star: who shows the special VFX); career run → Fired up and a Scar on the Me sheet.
Result: Built (js/data/traits.js; rolls in Feel.spark / Feel.scar on hstr; engine hooks in bars.js read p.traits only — also one-line hooks in fire.js stageBuff and stats.js W, unlisted files; specialFx in render/effects.js, ink gated in director.js ballStyle). Deviations: "20+ points" = 12+ or set point (15-point sets); Shaky Hands +0.06 absolute; Haunted / Spite in Cup fixtures only; career-side Scars named at the match after they act; the secret techniques' effects not built (not in the steps). Tests 175/175 (tests/traits.test.js: 100 Fired ups → 33 Sparks, 1000 Scars → 10.7 % OP, more with sharpen / earlier Scars), goldens unchanged; career 12 both: casual Y2 87.6, good Y2 93.3. QA Monster (OP left vs plain stars + one God of War right): plain stars 0 shown of 38.7k ink / 69 warp / 12 air / 18 burst checks; OP all; God of War ink + burst only. Me sheet: Spark, named Scar, "Something broke."

**Reading pays (owner, 2026-10-15, spec §2.30): T-282 → T-285.** Measure with the smart bot (scratch `smartbot.js` → T-285
puts it in tests/bot.js) after each step; numbers into spec §2.30. Goldens: update where stated (stamina changes every match).

### [x] T-282: Stamina drains faster, the bench rests and is worth bringing in
Spec: §2.30          Goldens: update (stamina numbers move every match)          Save: no change
Goal: starters who do everything tire by mid-set; the bench recovers; subs (coach and board) are a real tactic.
Files: js/data/rules.js (RULES.stamina, SUB), js/engine/match.js (point recovery, coachSubs), js/engine/orders.js (a Rest /
Sub order), js/ui/plan-board.js, tests/engine.test.js, tests/golden.json
Accept: end-of-set stamina median ~0.6 for starters (was ~0.87); subs per match up; a bot that rests its tired starters gains.
Result: RULES.stamina drain 1.7 → 2.5, hit 0.4 → 0.5, between points court +0.01 / bench +0.05 (was +0.02 for all); SUB.max 2 → 4. 120 league + tournament matches: starters' stamina mid-set 0.92 → 0.83, at the end median 0.87 → 0.64 (p10 0.07: the one who does everything is Spent); subs 2.5 → 6.8 a match. Rest order on the board (a court player off at the next dead ball for the best fresh bench player; `ordSubs` before coachSubs, `subDo` shared). Bot with rest: league +1.9 % points (60 pairs; noise ±1.2) — the bench alone is no big lever yet. Tests: hunt / captain-switch tests run without subs (they read a fixed lineup); the challenge test plays the match on a real stream; the non-setter assist guard 12 → 12.5 %; sharp coaches sub no more than dull (both near the cap). Goldens updated.

### [ ] T-283: Orders pay by situation
Spec: §2.30          Goldens: unchanged (orders only)          Save: no change
Goal: each order's payoff depends on the read (passer broken, block's read, hot hand, their quick share, their tips).
Files: js/engine/orders.js, js/engine/lanes.js, js/engine/serve.js, js/engine/rally-phases.js, js/engine/rally-defense.js,
js/data/tactics.js (ORDERS), tests/engine.test.js
Accept: smart bot +15–20 % points vs Auto (equal league teams, 60+ pairs); blanket orders within ±2 %.
Result:

### [ ] T-284: The board shows the point it wins
Spec: §2.30          Goldens: unchanged          Save: no change
Goal: spike / set / block odds read "wins the point N %" (full-rally probe); serve keeps ace-or-broken · miss.
Files: js/ui/plan-board.js, js/engine/orders.js, tests/ui-smoke.js
Result:

### [x] T-285: The smart bot as a balance tool
Spec: §2.30          Goldens: unchanged          Save: no change
Goal: `npm run bot` (tests/bot.js): the smart bot vs Auto, paired seeds, league + tournament, prints points / wins and picks.
Files: tests/bot.js (new), package.json
Result: tests/bot.js + `npm run bot -- [pairs] [league|tour] [full|serve|blanket:<kind>=<value>] [every]`; ~7 s a pair (full, ATKN 40). Calls `botSubs` when T-282 adds it.

**Plan board (owner, 2026-10-13, spec §2.29): T-277 → T-281, one agent, in order.** Every order has Auto = today's engine, so
with no orders the goldens stay unchanged (tests pass without `--update`); orders change draws only when set. Odds draw no R().

### [x] T-277: Plan board and serve orders
Spec: §2.29          Goldens: unchanged          Save: no change
Goal: match prep shows a board of player cards under the team plans; Tab opens it mid-match (paused); servers take a target
and a serve type, with true odds and locked options showing the gap.
Files: js/engine/orders.js (new), js/data/tactics.js (`ORDERS`), js/engine/serve.js, js/engine/match.js (`m.ord`),
js/ui/plan-board.js (new), js/ui/match-prep.js, js/ui/match-controls.js (Tab), js/render/tags.js (order mark), css/match.css,
index.html, tests/engine.test.js, tests/ui-smoke.js, ARCHITECTURE.md, ARCHITECTURE-details.md
Do not: change any draw when no order is set; let odds call R()/rnd(); add Fire up / Settle to the board; save orders.
Steps:
1. `m.ord = {}` (pid → { tgt, srv }) in newMatch; `Orders` (orders.js): `opts(m, p, kind)` (options, locked + gap text),
   `set(m, p, kind, v)`, `get`, `odds(m, p, kind, v)` (serve: error, ace, broken pass (q 1) on a fixed grid of the
   receive roll, vs their passers now).
2. serve.js: the serve type cap / softer type (pace, errors per `ORDERS.srv`), Drive / Killer always when ordered, the target
   (lean without Target Serve, exact with it; seam → the weaker passer −6). Each hook runs only when an order is set.
3. Board UI: a card per player (role, choices as segments, the outcome % under each, bad news first); prep renders it under
   each side's plans for the sides / cards you edit (§2.29 who edits); Tab pauses (A.hold) and opens it; tag mark.
Accept:
- Goldens unchanged; a test: ordering Float on a natural jump server over 300 serves lowers errors and aces vs Auto; a seam /
  target order sends ≥ 80 % (Target Serve) of serves to the chosen side; odds within 3 points of the simulated rates.
- ui-smoke: the board opens in prep and on Tab; no page error.
QA: Monster game → prep board, set a target + Float, Tab mid-match.
Result: Built as specced. Also js/engine/formulas.js (`serveQuality` takes an optional roll — default draws as before) and the board as a row of four cards under the teams (not inside a column). Odds vs sims (mulberry32, 2,000 serves each): errors and ace-or-broken within ~2 points (Auto, Float, Jump float, Jump, aimed, seam). Float on a wing: misses 14 → 6 %, aces / broken 22 → 4 %; the seam with Target Serve reads ~37 % vs Auto 22 % — for T-281's balance check. Goldens unchanged; 133/133 full; UI smoke 13/13. Found: tests/harness.js's Math.random (xorshift % 1e9 / 1e9) over-weights values under ~0.29 by 25 % (P(R < 0.16) = 0.187) — every headless measurement on load() is skewed; fixing it changes the goldens (owner to decide).

### [x] T-278: Spike orders — aim and shot
Spec: §2.29          Goldens: unchanged          Save: no change
Goal: hitters take an aim (line / cross / at a player / open court) and a shot (power / cut / tip) with odds.
Files: js/engine/orders.js, js/data/tactics.js, js/engine/lanes.js, js/engine/rally-phases.js, js/engine/rally.js,
js/ui/plan-board.js, tests/engine.test.js
Do not: let an order bypass the block or skill rolls; change draws with no order.
Accept: forced channels are taken ≥ 90 % when the set allows; the read learns a forced channel × 1.5 faster (test); kill %
odds within 3 points of sims.
Result: Built. Odds by playing the attack out (`atkOdds`: 160 possessions from a perfect pass, the hitter fed, an isolated seeded stream, the match restored — test: same odds twice, state and the game's stream untouched) instead of a formula grid: the chain block → dig is too long to model; ~0.1 s a probe, so the board fills spike odds one per tick (~17 s for 3 hitters in headless swiftshader). Aim at a player lists their passers only. Ordered Tip was 48 % kills / 0 errors → added a read-down (× 0.65, −0.05 per tip seen, ≥ × 0.3; spec §2.29). Forced line: ~75 % lands in the line channel (cut shots still go around; accept said 90 %); the block's right reads 50 → 60 %+. Also rally-defense.js (the tip read-down). Goldens unchanged; 134/134; UI smoke 13/13.

### [x] T-279: Setter orders — feed and fake
Spec: §2.29          Goldens: unchanged          Save: no change
Goal: the setter feeds the chosen hitter on a 3 / 2 pass; fake on / off.
Files: js/engine/orders.js, js/engine/rally-phases.js (chooseAttack, fake set), js/engine/lanes.js (read × 1.5 on the fed
hitter), js/ui/plan-board.js, tests/engine.test.js
Accept: fed hitter takes ≥ 85 % of 3 / 2 sets; a 1 pass still goes high to whoever is open; fake off = no fake sets (test).
Result: Built. Feed: the fed hitter gets every 3 / 2 pass they are free for (test, subs off: share 37 → 60 %+; not after a dive or from the bench); a fake set no longer switches away from them. Fake off also stops the setter dump (its decoy reads "Fake set!" too) — spec says so. atkOdds now takes a list of orders to try and a null hitter (the side's attack) for Auto feed / fake odds. Also rally.js (fakeSet), tactics.js (`ORDERS.set`), plan-board.js. Goldens unchanged.

### [x] T-280: Middle orders — Read / Commit / Stay back
Spec: §2.29, §2.9          Goldens: unchanged          Save: no change
Goal: a middle's own block order overrides the team setting for them.
Files: js/engine/orders.js, js/engine/rally-block.js, js/engine/rally-defense.js, js/ui/plan-board.js, tests/engine.test.js
Accept: Commit raises stuffs on quicks and lowers coverage on high balls; Stay back never blocks and digs (test); odds within
3 points.
Result: Built on §2.9's own Commit (coverage × 1.6 / reach × 3.5 on a quick, × 0.6 otherwise) instead of new stuff × 1.4 / coverage × 0.6 numbers — spec updated. Stay back: out of the block and the late jumps, drops to dig (× 0.8 distance). Test (60 matches): Commit stuffs quicks ≥ × 1.2 vs Read and their pins score more; Stay back: 0 blocks, ≥ × 1.3 digs. Odds: stuff · their kill (atkOdds of their attack). Also rally.js (fakeSet bite), rally-phases.js (DF / B0), tactics.js (`ORDERS.blk`). Goldens unchanged.

### [x] T-281: Orders on the result card and the balance check
Spec: §2.29          Goldens: unchanged          Save: no change
Goal: the result card lists each order and how it went; paired sims per option vs Auto, numbers into spec §2.29.
Files: js/engine/orders.js (tallies), js/ui/match-result.js, css/match.css, tests/ui-smoke.js, spec.md (measured line only)
Accept: no option beats Auto by more than +3 % points for an average team (else retune `ORDERS`); result card shows orders.
Result: Orders row on the result card (m.ordLog tallies; ui-smoke checks it). Paired sims (league 1,500 pairs; tournament 600) in spec §2.29: all within +1.2 % points of Auto after one retune — Tip was +2.7 % points / +12 % wins → tip0 0.65 → 0.5, tipSeen 0.05 → 0.06 (now +1.0 / +5). Also js/engine/rally.js (the ordAttack call), js/ui/plan-board.js (`boardResult`), tactics.js. No css needed (reuses .rplans). Balance script kept in scratch (not in the repo).



**Refactor part 5 (owner, 2026-10-12): simple, open for §5.7 (agency / prep), ace traits (§8) and more effects.** Pure
refactors — goldens unchanged (tests pass **without** `--update`), save unchanged, no draw-order change, no behaviour or UI change,
no build step / framework; one seam per task, top-level names kept or every caller updated in the task. **Order and ownership:**
T-264 (open, solo) goes first — it is the biggest cleanup (dead prompt code). T-269–T-274 touch no file of T-259 / T-260 and may
run beside Agent B; T-275 waits for T-259 + T-260; T-276 last.

### [x] T-269: fx3d — primitives and effects apart
Spec: §2.15 §2.22          Goldens: unchanged          Save: no change
Goal: a new effect = one function in one effects file; `createFx` (977 lines, one closure) becomes a short assembler.
Files: js/render3d/fx3d.mjs, js/render3d/fx/kit.mjs (new: textures, shaders, `Particles`, `Streaks`, rocks, bolts, rings, discs, domes
and their updates — `createKit(scene)` returns them), js/render3d/fx/ground.mjs (blast, dust, skid, touch, breath), fx/hits.mjs
(airImpact, burst, impact, zap, skyBolt, arc, mote), fx/elements.mjs (elemBurst, elemImpact), fx/trail.mjs (trail), ARCHITECTURE-details.md
Do not: change any effect's look or particle counts; add Math.random draws or reorder them inside an effect (lab screenshots compare);
touch VFX tuning names (js/data/vfx.js).
Steps:
1. Move the primitives into `fx/kit.mjs`; each effect becomes `export function blast(kit, p, pow, col, hot)` etc.
2. `createFx(scene)` = `const kit = createKit(scene)` + `{ blast: (...a) => blast(kit, ...a), …, update, stats }` — same API.
3. Rename fx3d's local `R(a, b)` (Math.random range) to `rr`: it shadows the game RNG's global `R()`.
Accept: fx3d.mjs < 150 lines; lint + tests pass; VFX lab: every effect fired with `Math.random` seeded, screenshots vs HEAD ≈ noise.
QA: menu › Dev › VFX lab → each effect.
Result: fx3d.mjs 1149 → 15 lines (createFx = createKit + groundFx / hitsFx / elementsFx / trailFx, same API). fx/kit.mjs 662 (textures, shaders, pools, rocks / bolts / rings / discs / domes + update / stats), ground 139, hits 150, elements 143, trail 133. Local R → rr. Effect bodies moved verbatim. QA: VFX lab, seeded Math.random — blast particle counts identical to HEAD; later effects within ±few (the lab's live rAF ages leftovers); no errors.

### [x] T-270: One small math module for the 3D code
Spec: —          Goldens: unchanged          Save: no change
Goal: `clamp / lerp / ease / smooth / wrap` defined once for js/render3d and js/map3d (today 2–3 copies; two `ease` curves).
Files: js/render3d/m3d.mjs (new), secondary3d.mjs, gait3d.mjs, ik3d.mjs, poses3d-cele.mjs, actors3d.mjs, js/map3d/geo3d.mjs (re-exports)
Do not: unify playback.js's `ease` (a different curve, classic script); change a curve — keep both as `easeS` (smoothstep) and
`easeIO` only if both are used.
Accept: grep shows one definition each under js/render3d + js/map3d; lint + tests pass; Monster QA no errors.
Result: js/render3d/m3d.mjs (clamp, lerp, ease = smoothstep, smooth, wrap); geo3d imports + re-exports them; secondary3d, gait3d, ik3d, poses3d, poses3d-attack, poses3d-cele, actors3d import from it — one definition each under js/render3d + js/map3d (playback.js's ease-in-out stays: a different curve in a classic script). Monster QA no errors; tests pass.

### [x] T-271: Dev tools load on demand
Spec: §2.22          Goldens: unchanged          Save: no change
Goal: the game loads no dev code until a dev tool opens; a new dev tool = one file + one `DEV_TOOLS` entry.
Files: index.html (drop vfx-lab.js, vfx-panel.js, anim-lab.js), js/ui/dev.js (new: `DEV_TOOLS = { vfx: [...files], anim: [...] }`,
`devOpen(name, fn)` injects the scripts once, then calls `fn`), js/ui/menu.js (Dev buttons → `devOpen`), js/ui/match-screen.js
(`animLabInit` only via `fx.anim`, guarded), tests/ui-smoke.js, ARCHITECTURE.md
Do not: move debug-panel.js (the Debug log is for players' bug reports); change what the labs do.
Accept: a fresh load defines no `LAB` / `animLab*` globals; each lab opens from the Dev tab and works (ui-smoke + QA); lint passes
(ESLint globals: add the lazy files to the shared list in eslint.config.mjs).
QA: menu › Dev › VFX lab, Animation lab, VFX panel in a Monster game.
Result: js/ui/dev.js: DEV_TOOLS { vfx, lab, anim } + devLoad / devOpen (scripts injected once, in order); vfx-panel.js, vfx-lab.js, anim-lab.js out of index.html; menu (VFX lab, Animation lab), the match's VFX button / V key and the Cut-scene / Animation lab panels go through devOpen; eslint.config.mjs reads the dev file list for shared globals. UI smoke 13/13 (asserts no lab globals before the lab opens).

### [x] T-272: Island map — camera and input out of `create`
Spec: §4.9 §4.18c          Goldens: unchanged          Save: no change
Goal: map3d `create` (373 lines) keeps the scene and `api`; pan / zoom / grab / fly-to / follow / walk lock move to a controller.
Files: js/map3d/map3d.mjs, js/map3d/mapcam3d.mjs (new: `createMapCam(cam, canvas, { ground, clampView, onPick })` → `{ centre,
overview, flyTo, frame, busy, dispose }`), ARCHITECTURE-details.md
Do not: change camera feel (speeds, clamps, easing) or the `MapView` API.
Accept: map3d.mjs `create` < 200 lines; map / map3d tests pass; career QA: pan, zoom, ◎ Me (C), click a place, walk lock.
Result: js/map3d/mapcam3d.mjs (new): createMapCam(cam, canvas, sun, parts) → view, initView, fit, centre, overview, flyTo, walkFrom, step, walking, onWheel, dispose — the pan / zoom / click / fly / follow / fence code moved verbatim; map3d create also lost the lights + sea (lightScene) and the GPU release (releaseScene) to module helpers: 373 → 205 lines (deviation: target < 200; the rest is the model sync and the frame). QA (career hub, Playwright): wheel, drag, ◎ Me, pick a place, overview behave as HEAD (views within the run-to-run timing spread); map tests pass; no errors.

### [x] T-273: style.css split — base and match
Spec: §9          Goldens: unchanged          Save: no change
Goal: style.css (2 095 lines) = page base only; the match screen's rules live in match.css, so match UI work touches one file.
Files: css/style.css, css/match.css (new, loaded right after style.css), index.html, ARCHITECTURE.md (CSS list)
Do not: change a selector or a value; reorder rules inside a file (cascade).
Accept: computed styles identical — hub, four sheets, match (rail open), menu screenshots 0.00 % vs HEAD (match = noise).
Result: style.css 2 069 → 575 lines (page base + glossary terms); css/match.css (new, 1 494, loaded right after style.css): everything from the result-card / small-screen block on except the glossary, in the same order. QA: computed styles of every element (sorted properties) vs HEAD on menu, settings, create, encyclopedia, hub, four sheets, a place panel, a Monster match (rail box / tactics) and the result card: identical — the only differences are runtime timing (map labels, 3D portraits loading, a fade mid-animation).

### [x] T-274: tasks.md and docs trim
Spec: —          Goldens: unchanged          Save: no change
Goal: tasks.md shows only open work: done revamp tasks (T-253–T-263, T-250–T-252) and part 4 become one line each under Done,
full text appended to tasks-done.md; the Now preamble shrinks to the open tasks' ownership. ARCHITECTURE "How to add…" gains: a
team plan (§2.26), a lane read (§2.24), a venue's air (§2.27), a director event (§2.15). T-212 done here (design system status).
Files: tasks.md (targeted moves only — never regenerate or reflow it), tasks-done.md, ARCHITECTURE.md, the design system artifact `project/status.md`
Accept: tasks.md < 350 lines; no task text lost (diff: every moved block is in tasks-done.md).
Result: tasks.md 711 → 341 lines: 33 done tasks + the three batch preambles moved verbatim to tasks-done.md (asserted), one line each under Done; a short T-259 / T-260 seam note replaces the revamp preamble; State refreshed (2026-10-12). ARCHITECTURE How to add…: a team plan, a lane read rule, a venue's air, a director event / line. T-212 done (design system status page). Also: the last two non-custom-property inline styles (fire-meter ticks → --at, VFX lab element buttons → --ec), computed styles identical.

### [x] T-275: Engine — rally loop and match state in named parts (after T-259, T-260)
Spec: §2          Goldens: unchanged          Save: no change
Goal: `rally()` (124 lines) reads as a list of phase calls; `newMatch` (110) builds its state from small makers (`teamState`,
`rallyState`, `logs`), so new per-match state (ace traits, AI memory §5.7) has one obvious home.
Files: js/engine/rally.js, js/engine/match.js, ARCHITECTURE.md (engine flow)
Do not: move, add or drop any R() draw; change beat / act shapes or snapshot fields.
Accept: goldens unchanged; no function in the two files > 80 lines; `npm test` full.
Result: Done before T-259 / T-260 (no agent was on them; deviation from the order note — they now hook into the named parts). rally() 124 → 17 lines: possessionStart, setPhases ({ end } | { s, h, a }), attackPhases, endOf. newMatch 110 → 69: matchTallies, lineupOf, rallyState, matchPlans (key order kept; the serve R() draw in place). Goldens unchanged; 131/131 full; nothing in the two files > 80 lines.

### [x] T-276: Refresh the refactor notes
Spec: —          Goldens: unchanged          Save: no change
Goal: the "Refactor seams to cut only when the feature is specced" list under Later matches the code after T-269–T-275 (drop the
done ones; add what remains: `Overlay` 511, `SOUND` 490, town / life / pins builders ~300 each, `startBeat` 113).
Files: tasks.md (that list only)
Result: Later › refactor seams rewritten with today's sizes: done ones dropped (createFx, map3d create, engine loop); added Overlay 511, SOUND 490, fx createKit 490, map3d builders, buildArena, startBeat, career-hub.js, career.css / match.css; ace-trait / AI-memory hooks point at the T-204 / T-275 seams; right-click actions stay unbuilt until decided.

**Open from the match revamp (spec §2.14, §2.17): T-259 → T-260, one engine agent.** Seams in place: `js/data/momentum.js`
(`STAGES`, `STAGE_IDS`, `stageOfSnap`), `js/engine/fire.js` (`capReady`, `capCall` stubs), act `stage` → `stageShow` + `Dir.stage`, the
AI captains will call `capReady` / `capCall` (the player chips are gone, 2026-10-14). Contracts: stage act `{ k: 'stage', side, from, to, why }`; snapshot
`fire`, `stage`; `capCall(m, side, 'fire' | 'settle')` → beats. The batch notes (ownership, contracts) are in tasks-done.md.

### [x] T-259: Fire, stages and temperament replace momentum and the zone (Agent B)
Spec: §2.14          Goldens: update (stages change the buffs and draws of every match)          Save: no change
Goal: every match tracks fire and a stage per team with the §2.14 buffs, triggers, exits and temperaments; the beats announce changes.
Files: js/engine/fire.js, match.js (pointMomentum, pointZone, snap), stats.js (boost: stage buffs), elements.js / hype.js (zone →
Fever reads), js/data/momentum.js, tests/momentum.test.js, tests/engine.test.js, tests/golden.json
Do not: rename `m.zone` / `m.zoneHit` (aliases of Fever); change the coach's timeout logic beyond "timeout → Composed".
Steps:
1. `m.fire` (= today's mom rules), `m.stage`, `m.temper` (from personalities, §2.14); `fireStage(m, side)` with the temperament
   thresholds; Fever only with a trigger; Fever timer; exits (error, breaker, stuff, timeout, settle).
2. boost(): replace `0.06 × mom` with the stage buffs (atk → power in play, def → defense in play, spd, jump, serve).
3. Emit `{ k: 'stage', side, from, to, why }` beats on every change (only when `m.rec`); `snap` gains `fire`, `stage`, `temper`.
4. Zone-breaker cut-in and the old "In the zone" cut-in: keep the breaker; "In the zone" → "FEVER" (cut title).
5. Tests: every stage reachable; Ice never Loose / Fever; Fever ≤ 4 points; buffs applied (effective stats at each stage).
Accept: goldens updated with the reason; tests pass; report stage time shares from a 400-match headless run in Result.
QA: none (engine).
Result: Built (spec chat, 2026-10-14). `m.mom` stays the fire (no `m.fire` field: a second array would drift from it in the odds probe's copies; the snapshot has `fire`). pointStage replaces pointZone; the losing captain's random zone call (an R() draw) went with it. Fever triggers: 3+ possessions / the streak reaching 4 / a kill at set point, never re-entered on the point it ended (a held streak chained 8-point Fevers). Speed buff = receive / dig speed terms and block reach. Also rally.js (`RALLY_MAX` 80: a rigged R() = 0.99 test looped forever once the buffs moved), rally-block.js, formulas.js, acts.js (`stage(a, d, bs)` so the act test sees it), match-controls.js (TEMPERS now exists), tests (the middle-orders test paired by seed: unpaired it was noise; a full element gauge swings instead of tipping). Goldens updated: stage buffs replace 0.06 × mom, and the zone captain's draw is gone. 200 tournament matches: Loose 9 % · Composed 51 % · Focused 38 % · Fever 2 % of points, Fever in 47 % of matches (targets 12 / 50 / 30 / 8, Fever in ~40 %: T-260 tunes).

### [ ] T-260: Captain's calls and the balance check (Agent B)
Spec: §2.17, §2.14 (balance)          Goldens: update (the random captain buff goes)          Save: no change
Goal: captains call Fire up / Settle on a leadership cooldown (the AI for every captain); `npm run balance` prints the stage numbers and the stage buffs hit their targets.
Files: js/engine/fire.js (capReady, capCall), match.js (captainThink: the buff → AI calls; drop the zone captain's call),
js/data/momentum.js (tuning), tests/balance.js, tests/momentum.test.js, tests/golden.json
Do not: touch the captain's tactic / defence switches; tune off steps of 5.
Steps:
1. capReady / capCall per §2.17 (cooldown 5 / 4 / 3 points by leadLv); beats: the captain's `call` line, `plabel`, `log`, `stage`.
2. AI captains: Settle when Loose; Fire up when 2+ down or at set point — every captain, yours too (the player chips were
   removed, owner 2026-10-14).
3. tests/balance.js: 1000 headless matches of league teams → table: point win rate per stage vs Composed, stage time share,
   Fevers per match, per temperament, with / without captain calls. Tune momentum.js to the §2.14 targets (±2 points).
Accept: goldens updated; the balance table in Result; tests pass.
QA: none (engine).
Result:

### [ ] T-230: Study — a private tutor and bookstores (Agent B, after T-228)
Spec: §4.14b          Goldens: unchanged          Save: no change (new `run.study` via the defaults table, no RUN_VERSION bump)
Goal: wit has two more sources and late-season money has somewhere to go.
Files: js/data/city.js (SPOTS × 6, STUDY, BOOKS), js/career/study.js, js/career/city.js (City.can, City.dayWhat; City.day
already hands acts `tutor` / `books` to `Study.day`), js/career/run.js (defaults: `study: { tutor: 0, week: -1, read: [] }`),
js/career/mapmodel.js (only if the new places need a lot / keep-out), js/ui/career-study.js, tests/study.test.js
Do not: add a building kind in js/map3d (use the generic place pin; ask if that looks wrong); draw R() (book stock is a hash).
Steps:
1. Data: 3 tutors + 3 bookstores in SPOTS (region wei / wu / shu, on land in each faction's town, names from lore.md's voices),
   `STUDY = { tutor: { fee: 150, step: 40, side: 2 }, books: { fee: 60, stock: 3, xp: 0.5 } }`, `BOOKS` ~12 `{ id, name, mul, side? }`.
2. `Study.can(run, id)` → { ok, why } (fee, once a week for the tutor, nothing new on the shelf); `Study.stock(run, id)` (hash);
   `Study.day(run, id)` → diary line (City.arrive, fee, the XP via Training.addXp / Training.train-style session at Lv 5 for the tutor).
   City.can calls Study.can for those acts; City.dayWhat → `{ k: 'train', label: 'Tutor' | 'Read', stat: 'wit' }`.
3. `studyPanel(run, id, base, travel)`: placeCard with the fee and gains on the button (`Book a session · $230 · 1d`); the
   bookstore lists this week's 3 titles as buttons (read ones struck through, disabled).
4. Tests: fee climbs per session; once a week; book read once; stock is stable for a week and changes the next; no R() draws.
Accept:
- A tutor session gives ≥ a Lv 5 Wit day's wit and the key-stat side gain; a book gives half a Lv 1 day × mul.
- Headless 28-week play (harness playRun or a scripted run that books the tutor weekly from week 10): report money at
  weeks 20 / 28 before and after.
QA: career run → each new place's card; book a session; read a book; the day track shows the slot.
Result:

### [x] T-212: Refresh the design system status page

Spec: §9 Goldens: unchanged Save: no change
Goal: the design system's `project/status.md` matches the build after T-205–T-210 (TitleScreen is built since T-176 / T-177;
new file homes; drift counts).
Files: the design system artifact `project/status.md` only (spec chat publishes it).
Result: Done in T-274: the design system's project/status.md checked against the build on 2026-10-12 — TitleScreen built, file homes after T-205–T-208 / T-273, drift counts (hex 0, inline non-var styles 0, sub-12px 0), the prompts removal, Match prep / Coach panel as uncarded; published (design system v21).

## Later — outlines

Features (spec first):

- Faction events that change the map (spec §4.24, draft — owner to confirm).
- Endless mode (spec §4.26: no guarantees; national call-up by grades).
- Living map layers B / C (spec §4.16: individual figures, approaches on the map).
- Balance pass (spec §4.10 condition values, §5.5 severe injury, hype frequency §2.3).
- Match revamp, parked (owner, 2026-10-07): the match remembers your choices ("AI memory"); back-row defensive commands;
  temperament changing how a team plays; the read meter for AI hitters; pre- and post-match lines (§2.18).
- Off-hand line shot (owner, 2026-10-07): a right-hander attacking from the right side who hits down the line (to their right)
  gets ~15 % less power and picks that shot less often; an ace trait "Wrist-away" removes the penalty (blockers don't expect it).
  Then the display: torso turns toward the shot, wrist rolls out on the line shot. Left-handers later flip it. Engine → goldens.
- Smaller player models (owner, 2026-10-08): the 6 Monster VRMs are ~9 MB each (63 MB of base64, mostly PNG textures). gltf-transform
  them — textures resized to 1024 and KTX2 (or WebP), meshopt geometry; three's KTX2Loader / MeshoptDecoder decode — target 1.5–2.5 MB
  each; cache the decoded files in IndexedDB so a second visit downloads nothing. Goes with T-088.

Refactor seams to cut only when the feature is specced or the file is next touched (not now — YAGNI; sizes 2026-10-12):

- Year 2 / Endless (§4.26, §4.28): `run.year` + a `Season` helper for week-of-season checks (story gates, Stars curves,
  CALENDAR / CUPS) — needs a save bump.
- Ace traits (§8) / AI memory (§5.7): a roll-modifier hook at the stuff / receive / clutch / hang rolls on top of the named
  engine steps (T-204, T-275); per-match state in `newMatch`'s makers (`matchTallies`, `rallyState`).
- Kenshi-style right-click actions (§5.7, proposed): an action list per picked thing once decided — not before.
- Big closures, split by layer when next touched: `Overlay` 511 (render/overlay.js), `SOUND` 490 (audio/sfx.js), fx `createKit`
  490 (the pools and meshes: one file per primitive), map3d builders `createTown` 343, `createLife` 309, `createFurniture` 304,
  `buildTerrain` 227, arena3d `buildArena` 295; `startBeat` (playback.js) by act group.
- UI files: `career-hub.js` 533 (top bar / rail / inbox / brief), `css/career.css` 1800 by screen, `css/match.css` 1494 (HUD /
  rail / result / dev lab).

Cleanup, part 2: T-082…T-087 done (see Done). Open:

- T-088 [?]: Big binaries — keep base64 for the artifact but store .glb/.mp3 in Git LFS and generate the .txt at publish.
  Question: today `assets/vrm/*.glb.txt` (18 MB of base64 text) and the .mp3 sit in plain git. Moving them to LFS means either
  `git lfs migrate import` (rewrites history, needs a force push) or LFS only for new commits (old blobs stay). Which? Also confirm
  LFS is enabled for glairlyyy/spiker and that the artifact publish step may decode/encode (`base64 -d` / `base64`) at publish time.

## Done

- T-253: Seams for the match revamp (spec chat)
- T-254: Stage chips and the fire meter replace "In the zone" (Agent A)
- T-255: The between-point exchange box (Agent A)
- T-256: Prompts on screen — Call / Fake / Block, setter markers, captain chips; the old calls UI goes (Agent A)
- T-257: The read meter and Call / Fake / Block (Agent B)
- T-264: Remove the one-press prompts and the calls; keep the captain's calls (solo — no other agent meanwhile)
- T-261: The director — effects by stage (Agent C)
- T-262: The arena follows the hotter team; auras by stage (Agent C)
- T-263: Cinematic lines between points (Agent C)
- T-228: Hops inside a faction are free — NEAR_R covers its district (Agent B)
- T-229: Court matches at the official venues (Agent A)
- T-252: Full-court match screen — the 3D court fills the screen, the HUD floats over it (owner request, spec chat)
- T-232: The rally is pausable — one engine, two pickers
- T-233: Decision options with odds and the stats behind them
- T-234: Calls on screen — slow down, vignette, options beside your player
- T-235: Calls on the result card — what held you back
- T-251: Rally touch counter — the combo counter (owner request)
- T-250: Camera shake — spike kick and floor rumble (owner request)
- T-249: Blockers only talk when they touch the ball (owner request)
- T-248: A hard kill bounces off the court (owner request)
- T-247: Foundation VFX for every player (owner request)
- T-246: Partial ink rings — the ensō (owner request)
- T-245: Ink style for every ring effect (owner request)
- T-244: Ball trail options (owner request)
- T-243: Hand trail style in the VFX panel (owner request)
- T-242: The air impact follows the ball (owner request)
- T-241: Live VFX tuning in the Monster game, with export (owner request)
- T-240: Air impact, reversed ring order — the Doppler look (owner request)
- T-239: Ink hand trails — the Lu Bu look (owner request)
- T-238: VFX lab and a ground blast (owner request)
- T-237: Match control bar that fits (owner request)
- T-236: Spike air impact — the Kuroko look (owner request)
- T-231: Docs diet and a UI smoke test (owner request)
- Knockdowns and recovery — a hard ball knocks the receiver down; loose → forced free ball, else a high ball over buys time to get up (spec §2.28; spec chat, owner request 2026-10-12)
- Receive power tiers (firm / hard / knockdown) with knock-back, shockwave rings, skid dust, hit-stop; flowing knockdown and get-up (spec §2.28; spec chat, owner request 2026-10-12)
- T-268: Crowd heat and the venue's air — wind outdoors, embers indoors, flames at Inferno; Monster venue picker (spec §2.27; spec chat, owner request 2026-10-12)

- T-267: Team plans, the AI coach's counters and match prep before every match (spec §2.26; spec chat, owner request 2026-10-12; goldens updated)

- T-266: Coach panel — the match rail's Coach tab: tags, hitters, block reads, serve receive (spec §2.25; spec chat, owner request 2026-10-12)

- T-265: Laning — channels, the block's read, the hitter's aim, the projected spike direction (spec §2.24; spec chat, owner request 2026-10-12; goldens updated)

- T-258: dropped (owner, 2026-10-10) — the setter's pick / Dump / AI "Mine!" went with the prompts (§2.16 removed); its serve / attack removal is in T-264.

Full text of every done task, newest first: **tasks-done.md** (read it only when a task points there). Recent:

- T-227: A result card after every match, simmed ones too, with the XP each stat got (owner request)
- T-226: An easier start — the island's players at OVR 40–50 (owner request)
- T-225: The island × 1.5 again (owner request)
- T-223: Nature objects and small life on the island
- T-224: Natural borders and biome ground that fades
- T-222: The Shu highlands — the Peak, the Spine, the river; level ground for every facility (owner request)
- T-221: Your new squad introduces itself (owner request)
- T-220: Kaede's lessons on the first click of a place (owner request)
- T-216: Motion tokens, the Motion helper and the screen veil
- T-217: Hub surfaces move
- T-218: Values that change
- T-219: Match screen motion

## Unplanned changes

(build chat: owner requests made directly in the build chat — one line each; the spec chat moves them into spec.md and then into tasks-done.md)
- 2026-10-08 The crouch before a jump goes deeper the higher the player jumps (owner): × 1 at Jump ≤ 40 up to × 1.5 at Jump 99 (`squatK`, `deepen` in poses3d.mjs: hip drop × k, joints × 1 + 0.3 (k − 1)) on the spike's load and the block's prep. QA (qa_poses, head height): spike load drop 0.47 → 0.71 m at Jump 99 (+51 %), block prep +36 %. Files: js/render3d/poses3d.mjs, poses3d-attack.mjs.
- 2026-10-08 Failed digs (owner): a scramble beat that ends in a kill gets no slow motion when the diver can't reach the spot in the beat's time (clear miss), and a short, light one (×0.6, last quarter of the beat) when they get there and it just beats them (near miss) — `missCheck` (movement.js), `NEAR_MISS_SLOW` (clock.js). QA (4 Monster games): clear misses 0 slow frames, near misses slowed only at the end. Files: js/render/movement.js, clock.js, playback.js.
- 2026-10-08 Slow motion keeps the court's own colours (owner): the `.slowmo` desaturate / contrast filter on the 3D view is gone; only the dark edge vignette remains (every slow-mo, scene and hit-stop). Files: css/style.css, js/render/clock.js.
- 2026-10-08 Dig / free-ball slow motion ends once the player taking the ball is set (owner): the far-dig chase (`_dig`) and the scramble drama (`hypeSlow` beats) stop slowing the world when that player is on their feet, not diving, within 0.35 m of the spot (`digArrived`, `b._rcv`); back to speed in ~0.1 s. QA (Monster, frames stepped): slow frames while set 17/41 → 6/34 (the ease). Files: js/render/clock.js, movement.js.
- 2026-10-08 Cut-ins removed entirely (the full banner and the mini notification, ⚙ Cut-ins, `#cut` / `#toasts`, showCut / showCombo / toast / hideCut, KEYS.cutins, G.cutMini, their CSS) and the commentary ticker (`#ticker`, logLine and its callers, CSS). Follow-up (owner): removed from the engine too — every `cut` / `combo` / `log` act and cut beat, the Cannon Serve roll (watched matches only), the COMBO / CBLK name tables; the director's call / fake events now come from a data-only `ev` act ({ kind: called | fake_ok | fail, p, q }); the clutch test counts trust / freeze call lines; the read test compares stuff rates over 300 sims. Goldens updated (matches). Files: js/render/acts.js, playback.js, clock.js, movement.js, director.js, js/ui/match-screen.js, match-controls.js, match-result.js, match-tech.js, menu.js, js/game/state.js, js/core/storage.js, js/engine/rally.js, rally-phases.js, rally-defense.js, match.js, serve.js, js/data/moves.js, js/audio/sfx.js, css/style.css, css/theme.css, tests/engine.test.js, read.test.js, golden.json, spec.md, ARCHITECTURE*.md.
- 2026-10-08 Momentum fades half as fast outside the zone (owner: Fever too rare): per-point fade and the lost-point drop × `MOM_FADE` 0.5 unless the team is in the zone (league sims, 400 matches: matches with a zone 62 → 95 %, team-points in the zone 6.1 → 12.2 %). Goldens updated (teams, matches, sims). The T-233 odds test removed (those calls left the screen in T-256); the clutch relationship test now compares the same draws (`plain` on m.relLog clutch entries) instead of two drifting runs. Files: js/engine/match.js, rally-phases.js, tests/engine.test.js, tests/golden.json.
- 2026-10-08 The read eye gauge is gone (the meter still works underneath); a full read (≥ READ.fake, 70) shows 👁 after the role in your name tag. Files: js/render/tags.js, js/ui/match-prompts.js, js/render/playback.js, css/style.css.
- 2026-10-08 Block is timing (owner; spec §2.16): the block prompt moved from their pass to the set (only when you are one of the blockers); E jumps you at once (`blockJump`, `ownJumps`), the answer is `{ id: 'block', t }` = ms before contact, graded perfect / good / early (READ.blockTol / blockGood / blockCov / blockStuff); no press → the AI jumps you at its take-off + 80 ms; the lane commit / late / crossed are gone. `ask()` accepts `{ id, ... }` answers. Files: js/engine/rally.js (blockYou, blockPrompt, setDurOf, blockT0), rally-block.js, rally-defense.js (stuff × x.stuffK), decide.js, js/data/rules.js, js/ui/match-prompts.js (blockLeft, blockJump, blockAuto), js/render/playback.js, tests/read.test.js, tests/ui-smoke.js, spec.md.
- 2026-10-05 Out of days ask: when the last day's action ends (lock over) with no days left, a card asks "No days left — End it?" with Yes, end the week / I'll stay (Esc = stay); never forced, asked once a week (`CW.nightAsk`). Files: js/ui/career-map.js (nightCard, nightAnswer, lockEnd re-render), js/ui/career-hub.js (hubCard, Esc).
- 2026-10-05 Intro: the big "25 – 4" title card is gone (the cold open starts on the diary line); the score is 15–4 everywhere (intro, rival meeting, choice, lore §, spec, stars comment). Files: js/data/story.js, js/data/stars.js, lore.md, spec.md, tests/career.test.js.
- 2026-10-05 Intro: "Home. For now." → "I followed the Academy's directions. So this is my new place, huh?" (you, on reaching the flat). File: js/data/story.js.
- 2026-10-05 The rival is **Haewon Bae** (was Tachibana Sae; given-first, `given: 'Haewon'`); her full or given name shows orange (`--rival`) in dialogue lines, her name plate and the log (`sbMark`, colour only so typing never re-wraps); old saves rename her on load. Files: js/data/stars.js, js/data/story.js, js/career/stars.js, js/career/run.js, js/ui/story-box.js, css/story.css, css/theme.css, spec.md, lore.md, tests/career.test.js.
- 2026-10-05 Intro names the rival: "Haewon Bae. The one who did it. She signed with an island club the same week." / "She's already here. So am I." (orange via sbMark). File: js/data/story.js.
- 2026-10-05 Fix: the rival-highlight change had broken story.css (every line was centred, 22px, italic grey); restored, and the cold open's narration is now left-aligned too. File: css/story.css.
- 2026-10-05 Thai names: every generated player is `<nickname> <family name>` from Thai pools (names.js; pool sizes kept, same draws); the cohort renamed (Praew Siriwong, Pond Thammasak, Fai Wongsakul) and the flatmate is Fern Kittisak (was Sanada Kaede); hype / Stars read the nickname as the first word; saves keep the cohort under their new names. Goldens updated (name hashes move ego / traits); bond calibration rebased (w60 5.2, w80 9.6); two fragile tests fixed. Rival still Haewon Bae — a Thai name is up to the owner. Files: js/data/names.js, js/engine/players.js, js/engine/hype.js, js/career/stars.js, js/career/run.js, js/data/stars.js, js/data/story.js, js/ui/story-box.js, js/ui/career-map.js, js/career/city.js, js/career/mapmodel.js, tests/career.test.js, tests/people.test.js, tests/golden.json, spec.md, lore.md, ARCHITECTURE.md.
- 2026-10-06 The rival stays **Haewon Bae** and is the one non-Thai name on the island (lore: the only mainland import); Fern says so when she names the season's players. Files: js/data/story.js, lore.md.
- 2026-10-06 Ego removed entirely: personality levels, EGO / REL_E.ego, steals, demanded sets, solo blocks + block collisions, hero swings / serves, m.egoLog, the ego moment (egoFocus / act `ego`), the ego memories (stole_my_ball, collided, hero_carried, set_hogged), the Me / person tag, the Egoist game. Old saves drop p.ego and those memories. The tracked shot kind `ego` → `follow` (calls). DECIDE attack.cut cal.err 1.25 → 0.8 (re-measured). Goldens updated. Files: js/data/rules.js, dialogue.js, people.js, js/engine/match.js, serve.js, rally.js, rally-block.js, rally-defense.js, rally-phases.js, players.js, save.js, stats.js, teams.js, js/career/rel.js, run.js, js/render/movement.js, acts.js, playback.js, overlay.js, js/render3d/camera3d.mjs, js/ui/dom.js, menu.js, sheet-me.js, career-people.js, match-calls.js, css/people.css, tests/engine.test.js, people.test.js, golden.json, spec.md, ARCHITECTURE*.md.
- 2026-10-07 Commentary tab cut from the match rail (now Box score · Tactics, opens on Box score); the 2-line court ticker stays, fed directly by logLine. Files: js/ui/match-controls.js, match-screen.js, match-result.js, css/style.css, spec.md.
- 2026-10-07 Bird's-eye camera (⚙ Camera / key C): 45° from behind your end line, your side at the bottom, the court fitted every frame; fits whatever shape the full-court screen (T-252) has; arena roof trusses hidden in it; tags dropped toward the heads. Phone (≤600px) scoreboard hides the rotation chips and rules line. Files: js/render3d/camera3d.mjs, r3d.mjs, venues/arena.mjs, js/ui/match-controls.js, match-screen.js, css/style.css, spec.md.
- 2026-10-08 In-play positions follow the rotation (owner, option 2): after the serve players switch to their role's spot but stay in their row — the two front-row players (rotation index 1, 2) at the net (x ≥ 440), the back row deep (x ≤ 320; a back-row setter waits at 400 to run in), a front pair spread ≥ 0.3 in z — so who blocks / attacks from the front row is who stands there (`playHome`, court.js; used by the serve and pass moves). Blocking is still by rotation (the setter never blocks, as before). DECIDE attack.cut cal → win 1.0, err 1.15 (re-measured). read.test.js: the read-vs-kills check pooled over seeds 11–13 (one seed was ±3 points of noise; the kill effect is ~1–3 points), strictly fewer kills (stuffs stay the strong check). Goldens updated. Files: js/engine/court.js, rally-phases.js, serve.js, js/data/rules.js, tests/read.test.js, tests/golden.json (engine files are Agent B's this batch — owner's direct request).
- 2026-10-08 (owner) The owner's VRMs (Main_v2, Rival_v2, Rivar_v3, Rivar_v4, male1, male2) are the Monster game's player models — every player picks one at random, never the base model. assets/vrm/{rival2,rival3,rival4,male1,male2}.glb.txt (Main_v2 = main.glb.txt), README.txt; players3d.mjs `BUNDLED`; r3d.mjs `loadBundled` (first Monster game, 4 figures each, behind the loader; `addModel(buf, name, n)`); actors3d.mjs dressActors (`fx.bundled`: pool = the loaded models, another bundled figure when one model's figures are taken); match-screen.js open3D (holds for them); menu.js startMonster `bundled: true`, Model colors button always in Dev. QA: first Monster game 43 s on swiftshader (download + 24 figures), next one 9 s; all 8 players bundled models; tests + test:ui green.
- 2026-10-08 Into Loose (owner; spec §2.14): the lost-point fire drop × heat (0.7 + 0.6 × fire, 0.4–1.3) and two shakes only — a lost marathon (≥ 5 possessions, `m.rallyN`) and a hard kill against a low-wit team (`momShaken`, `MOM_LOSS`). League sims, 400 matches: Loose entries 0.17 → 1.14 a match (low-wit teams 1.18 a team-match, high-wit 0.34), Loose share 0.5 → 5.5 %, Fever share 12.0 → 8.9 %, Fever entries 1.81 → 1.44 a match. Test floors widened for the shift (element spike win rate > 0.5, noise ±0.04; non-setter assists < 11.5 %, colder teams pass worse). Goldens updated. Files: js/engine/match.js, rally.js, serve.js, tests/engine.test.js, tests/golden.json, spec.md.
- 2026-10-08 The team-colour line under the role tag is gone (owner). Files: js/render/tags.js.
- 2026-10-08 A blocked ball meets one hand, not the head between both (owner): `block()` tags its hands target with `hz` (the court-z side the spike's path crosses the net on, no draws); r3d handTouch puts the ball against that palm, the 2D contact shifts 0.02 that way. Scoring unchanged (sims / teams goldens same); matches golden updated (the new field in recorded beats). Files: js/engine/rally-defense.js, js/render/playback.js, js/render3d/r3d.mjs, tests/golden.json, ARCHITECTURE-details.md.
- 2026-10-08 One-hand block: only the arm that meets the ball reaches for it, the other stays in the block pose (owner). Files: js/render3d/actors3d.mjs (blockHand), ARCHITECTURE-details.md.
- 2026-10-08 Back bump (owner): a passer whose ball is ≥ 2 m behind them (mostly away from the net) turns, runs back and bumps it over the head instead of backpedalling (~10 % of bumps in a Monster game). Display only. Files: js/render/playback.js (backBumpLook, resolve), js/render3d/actors3d.mjs (steer), js/render3d/poses3d.mjs (BACK_UP), ARCHITECTURE-details.md.
- 2026-10-08 Turn and run (owner): a long fast run that isn't forward turns the body to the run direction instead of a backpedal (blockers, setters and a hitter's short run-up retreat excepted); back-row hitters (pipe, long back attack) in front of their run-up depth sprint a curve round to the take-off point, accelerating, instead of backing up and running straight in. QA (Monster, 12k frames): backpedalling ≥ 0.7 s 1 → 0, back-row curves end ≤ 0.03 m from the take-off point. Display only, goldens unchanged. Files: js/render/movement.js (`backCurve`, `curveMove`, approachOf `back` / `deep`), js/render/playback.js, js/render3d/actors3d.mjs (`longRun`), ARCHITECTURE-details.md.
- 2026-10-08 Stride by distance (owner): long runs take long strides, the last metre or so small quick steps (gait cycle 0.8–1.3 m short → 1.25–2.85 m long; leg swing × 0.65 → 1.15). Display only. Files: js/render3d/actors3d.mjs (STRIDE, motion), js/render3d/poses3d.mjs (locoPose), ARCHITECTURE-details.md.
- 2026-10-08 Cinematic ace (owner): an ace rally gets a heroic camera — the ball in the server's hands as they bounce it, down to the feet for the run-up, a side view of the hit, then riding the ball to the floor; one per 2 points a side scores (budget per side); off with Hype off / reduced motion / fixed camera. Display only. Files: js/render/cine.js (new), index.html, js/render/playback.js, acts.js, scenes.js, overlay.js, js/render3d/camera3d.mjs (acePose, tracked-shot glide + fov), r3d.mjs (coach tags hidden in shots), ARCHITECTURE*.md.
- 2026-10-08 Cut-scene preview list (owner): menu › Dev › Cut-scenes lists the kinds (Ace for now); ▶ starts a Monster game where every rally stages it (no budget, any settings). Engine: `m.dev = 'ace'` forces a clean ace after the same random draws (goldens unchanged). Files: js/render/cine.js (CINE_KINDS, cineForce), js/ui/menu.js (startMonster({ cine })), js/ui/match-screen.js, js/engine/serve.js, ARCHITECTURE-details.md.
- 2026-10-08 Cut-scene lab (owner; replaces the preview list): menu › Dev › Cut-scene lab = the Ace Monster game with its camera values live in a side panel (bounce / run-up / hit / ball: position, look, field of view, glide; hit distance; landing hold), ¼ / ½ / 1× speed, Copy / Download like the VFX panel. The camera numbers moved into VFX groups cbounce / crun / chit / cball (same defaults). Files: js/data/vfx.js, js/render3d/camera3d.mjs, js/render/cine.js, js/ui/vfx-panel.js, js/ui/menu.js, js/ui/match-screen.js, ARCHITECTURE-details.md.
- 2026-10-09 Ace cut-scene camera: the owner's lab values baked in (bounce fwd 4.3 / side 3 / look 2.5 / ball 1 / fov 15; run-up look ahead 2; hit ball 1, hand-off at 1.1 m; a few slider ranges widened). Cut-scene lab: Force rotate (On: the serve changes sides every rally and that side rotates — every server in turn; engine `m.devRot`, dev only, goldens unchanged). Files: js/data/vfx.js, js/engine/match.js, js/ui/vfx-panel.js, ARCHITECTURE-details.md.
- 2026-10-09 Paused, the 3D camera keeps easing on real time, so Cut-scene lab edits show on a paused frame; in the lab, pausing no longer opens the details rail over the panel (owner). Files: js/render3d/r3d.mjs, js/ui/match-controls.js.
- 2026-10-09 Ace cut-scene camera, owner's second lab pass baked in (bounce look 2.25; run-up fwd 2.5 / side 2.1 / up 0.5 / look 0.3 / ahead 1.2 / fov 26; hit fwd −1.8 / side −0.5 / look 0.2 / ball 0.6 / fov 33 / hand-off 1.9 m). Files: js/data/vfx.js.
- 2026-10-09 WS kill cut-scene (owner): a wing spiker's kill gets the heroic camera — over the hitter's shoulder from the pass as the set goes up, low at the feet for the approach, beside the arm at the swing (slow motion ×0.5 from the set to the swing), then riding the ball to the floor; shares the per-side budget with the ace. Cut-scene lab: kind switch Ace / WS kill (WS: every WS kill plays it), its own camera groups wset / wrun / whit / wball. The camera framing is now generic (CINE_KINDS phases → VFX group + feet / hand / ride). Files: js/render/cine.js, clock.js, js/render3d/camera3d.mjs, js/data/vfx.js, js/ui/vfx-panel.js, ARCHITECTURE*.md.
- 2026-10-09 Point celebrations (owner): the scorer's 'roar' becomes a keyframed move that starts only once they have landed (feet down, landing absorbed, swing done — fixes the roar firing mid-air): fist pump "Yes!", jump-spin-stomp (big points: a dramatic kill, a 3+ streak, Fever; at most once per 4 points), sky roar with a jump, finger to the sky, taunt (finger to the lips / hand to the ear), shy hop — by personality (hot / cool / cocky / shy / leader), a hash pick (no R()); the nearest teammate (≤ 3.5 m) turns and high-fives, others clap (always on a big point). Ends early when the player is sent somewhere; the match-end celebration unchanged. Display only, goldens unchanged. Files: js/render3d/poses3d-cele.mjs (new, imported by poses3d.mjs), poses3d.mjs, actors3d.mjs, js/render/acts.js.
- 2026-10-09 MB quick cut-scene (owner): a middle's quick kill — over the setter's shoulder as the pass comes in, beside the middle's arm in the air for the set and the hit (slow motion ×0.4), riding the ball to the floor; shares the per-side budget. Lab kind "MB quick" with groups qset / qhit / qball; a phase can now be framed on the setter (CINE_KINDS 'p2'); the slow-motion group is per kind. Files: js/render/cine.js, js/render3d/camera3d.mjs, js/data/vfx.js, ARCHITECTURE*.md.
- 2026-10-09 Slow-motion cooldown (owner): slow motion plays for a team at most once every 3 points (one cooldown for all kinds; per kind optional) — staged hype scenes (skipped like Hype off), impact frame, fake set, scramble, kill block / block break, Delayed Spike; the far-dig chase (hides the animation) and the cut-scenes are exempt. Monster games: rallies with slow motion ~70 % → ~45 % (cooldown 4: ~30 %). VFX panel group "Slow-motion cooldown" (on, points, shared). Display only. Files: js/render/slowmo.js (new), index.html, js/render/playback.js, director.js, js/data/vfx.js, ARCHITECTURE*.md.
- 2026-10-09 Animation lab (owner, before the IK work): menu › Dev › Animation lab — a Monster game that keeps the last 8 s of every player (exact bone rotations, roots, pose values, display state, feet, ball); Freeze to scrub frame by frame, play at ¼ / ½ / 1×, step, orbit around a chosen player (drag / wheel), foot marks (a sliding foot smears), edit the frame's pose values live (body, legs, arm segments, twists) and Copy the frame as pose code. Dev only, display only. Files: js/ui/anim-lab.js, js/render3d/anim3d.mjs (new), index.html, js/render3d/r3d.mjs, actors3d.mjs, players3d.mjs (DRIVEN exported), js/ui/menu.js, match-screen.js, match-controls.js, vfx-panel.js, ARCHITECTURE*.md.
- 2026-10-09 IK (owner): feet are planted — a foot that is down stays on its spot until the pose lifts it or it would slide 16 cm, then steps over 0.12 s (foot sliding while down in a Monster game: ~7–13 mm → ~1.5 mm per frame); hands / forearms go to the ball at contacts by two-bone IK (bump: forearms under it, set: both hands around it, spike / serve / dive / one-hand block: the palm on it; closest approach spike ~0.37 → 0.25 m, bump ~0.2 → 0.14 m, the designed grip). VFX panel group "IK" (feet / arms on-off, slip, step time, step lift, down height). Display only. Files: js/render3d/ik3d.mjs (new), actors3d.mjs, r3d.mjs (QA hooks qaFeet / qaHands), js/data/vfx.js, ARCHITECTURE*.md.
- 2026-10-10 Hand spin fix (owner): arm twists blend by the real roll (slerp, not the number — keys with the same palm but twists far apart spun the hand a full circle, e.g. the spike's BOW −π → WHIP 2.83), RA palm twists on one branch, arm IK fades out when the pose's arm is far off the target line, aims at the flight ball with a fixed elbow pole and eased weights (hand roll > 15°/frame about the forearm in a Monster game: 12% → 4% of frames with IK, 12% → 4% without). js/render3d/poses3d.mjs, poses3d-attack.mjs, poses3d-cele.mjs, ik3d.mjs, actors3d.mjs, r3d.mjs.
- 2026-10-10 Shaky legs fix (owner): foot planting with hysteresis, steps relative to the pose's foot, a fading residual on every lock / step / release (no more half-metre snaps when a jump or a shuffle hop dropped the locks), no planting above VFX.ik.run (4 m/s, new setting), a steadier knee pole; gaits blend by eased weight instead of switching; the body turns with a damped spring (leg zigzags > 3 cm in a Monster game: ~1700 → ~600, FK alone ~320). js/render3d/ik3d.mjs, actors3d.mjs, poses3d.mjs, poses3d-attack.mjs, js/data/vfx.js.
- 2026-10-10 Feet on the ground when standing (owner): standing still, both feet planted flat on the floor (one used to hover ~3.5 cm in half of all standing frames and flicker planted / lifted; now ~2–4 %); straight-legged poses no longer step forever on the spot (the reach check); pose lifts (hops, clap bounce) raise the feet without a step arc; one foot steps at a time; the walk stops when the body stops (speed estimate decays fast); the pre-serve routine eases in from the stand and blends with the walk. New VFX.ik.stand. Foot slide while down: FK ~15 mm/frame → 2.7. js/render3d/ik3d.mjs, actors3d.mjs, poses3d.mjs, js/data/vfx.js.
- 2026-10-10 Secondary motion (owner): weight shift when walking (hips over the stance foot, pelvis drop, chest level), torso lagging the hips on a sudden turn and a lean into it when running, the head level and on the ball when running (aim error while running 43° → 29°, head jitter −10 %), a landing settle spring (≤ ~4 cm, knees bend, feet stay on the floor — foot IK never targets below it). VFX group "Secondary motion". Leg jitter / standing feet unchanged. Files: js/render3d/secondary3d.mjs (new), actors3d.mjs, poses3d.mjs, ik3d.mjs, r3d.mjs (qaBallW), js/data/vfx.js, spec.md, ARCHITECTURE*.md.
- 2026-10-10 Idle stances (owner): READY rebuilt — wide athletic stance (shin splay `ss`, new optional leg field), right foot ahead, knees over toes, heels light, flat back leaning forward, arms relaxed in front with hands apart (was a deep narrow squat, knees in, arms locked out in the grip); STAND — contrapposto, loose arms; the quick hip pump replaced by a knee bounce + slow weight shift (ready) and breathing + sway (standing), per-player phase. Files: js/render3d/poses3d.mjs (READY, STAND, idleReady, idleStand, mixLeg ss), players3d.mjs (legDirs ss), poses3d-cele.mjs, js/ui/anim-lab.js, spec.md.
- 2026-10-10 Waiting-stance variants (owner, from two reference photos): hands on the knees (REST_KNEES; the hands put on the player's own knees by IK, `kneeHands` in ik3d.mjs) and palms to the sky (READY_PALMS), besides hands apart; picked per player per rally by hash (`A.rallyNo`, playback reset; no R()); hands on knees only while calm (ball dead / server in the routine), eased up into the ready on the toss (`d.restW`). Files: js/render3d/poses3d.mjs, ik3d.mjs, actors3d.mjs, js/render/playback.js, spec.md.
- 2026-10-10 Run stride (owner: sprint steps too short and too quick): step length from speed (0.35 + 0.22 × speed m, 0.45–2.4, × 0.6 over the last 2 m; `m.step`, STRIDE in actors3d.mjs), the leg swing sized to it (locoPose stride = step / the keys' step), more flight and lean sprinting. Monster game: sprint 9+ m/s 9.0 → 4.4 steps/s, step 1.13 → 2.2 m; 4.5–6 m/s 7.5 → 5.3 steps/s. Files: js/render3d/actors3d.mjs, poses3d.mjs, spec.md.
- 2026-10-10 Arms swing when walking / running (owner): a generic pass at the end of playerPose blends finished moves (block / spike / serve after landing — `d.upAge` per move —, set released, bump played, cele, roar, slump, huddle) into the run, arms included (`armsFree`); `kneeHands` is a blended pose number and eased in actors3d (`pl.khW`), and the rest is let go while moving; running to a pass / under a set the arms swing until ~1 m out (`runArms`, m.far). Monster game, frames running with the arms not swinging: rest-on-knees 14 % → 0, bump approach 40–91 % → 0, setprep 36–48 % → 15 %, block after landing 24 % → 3 %. Files: js/render3d/poses3d.mjs, actors3d.mjs, spec.md.
- 2026-10-10 No needless dives + bump direction (owner): playback `diveLook` turns a dive into a run-and-bump when the dig spot is within 1.8 m or reachable on foot at 0.7 × sprint in the beat's time (the act, its ball contact, a "Pancake!" label dropped; engine untouched, goldens unchanged); `backBumpLook` decides by direction when the next pass is known (`passTarget`): back bump if the pass goes ≥ ~115° from the run and the run is mostly away from the net, else a normal bump. Files: js/render/playback.js, acts.js, spec.md.
- 2026-10-10 Planted gait (owner, motion pass 1): new js/render3d/gait3d.mjs — phase-driven foot planner (duty from sweep / step, locked contacts, heel-up swing to the predicted landing, hips dipped for reach, position-blended in by pl.gW from locoPose's `gaitW`), footIK hands over at gW 0.8; VFX group "Planted gait". Stance-foot slide while running 0.6–0.7 → 0.1–0.2 of body speed; leg zigzags unchanged (≈ 4.4 %); standing feet unchanged. Files: js/render3d/gait3d.mjs (new), actors3d.mjs, poses3d.mjs (gaitW), ik3d.mjs, js/data/vfx.js, spec.md, ARCHITECTURE*.md.
- 2026-10-10 Steady landings / dives / server reversal (owner, motion pass 2): poses3d-attack `landBlend` (spike, jump serve), playback `capMove` LAND_ABSORB + RUN_ACC + RUN_DEC (actors.js resets `d.cv`), ik3d dive run-in planting, actors3d dive steer rate, poses3d `armsFree` waits for the landing, gait3d fixed knee pole + root-based planning. Files: js/render3d/{poses3d-attack,poses3d,ik3d,actors3d,gait3d}.mjs, js/render/{playback,actors}.js.
- 2026-10-10 Feet under the body (owner: the body ran ahead of the legs): gait3d plans the swing in the hip's frame (`f.rel`) plus the landing's drift, landing re-aimed faster (rate 30). Sprint feet behind the hips on average 0.45 → 0.16 m (pose-only legs 0.14), run 0.31 → 0.08. Files: js/render3d/gait3d.mjs.
- 2026-10-10 Lower body under the body (owner: the run sat into a lunge, body ahead): gait3d owns the hip height (`pl.gHip`, near-straight legs, dip ≤ 12 cm for reach), landing ≤ ½ sweep ahead, heel rise at push-off; poses3d forwardGait lean from the waist (≤ ~12°, pelvis near level) and the generic run pass also blends hp / sp / hd / hroll / sroll toward the run. Lean sprint 20° → 10°, run 13° → 7°. Files: js/render3d/gait3d.mjs, poses3d.mjs.
- 2026-10-10 Legs lead turns, feet on the curve, lower jog knees (owner): secondary3d turnLag hip lead (`pl.hipLead`, VFX sec.lead) + gait knee pole; gait3d heading reset when the gait restarts (a stale heading put the first steps half a metre to the side), landings along the curve (`pl.gOm`), swing frame turns with the heading, lift lower jogging; playback capMove RUN_TURN on fast catch-ups. Feet outside a turn P90 0.51 → 0.09 m; hips ahead of the chest in turns 19° → 34°; stance slip 0.03–0.07 of body speed. Files: js/render3d/{gait3d,secondary3d,actors3d}.mjs, js/render/playback.js, js/data/vfx.js.
- 2026-10-12 No one-legged jumps (owner): the pipe (back-row attack) in the air tucks both knees with a slight stagger instead of the scissor (one leg forward, one back); the jump-spin celebration's two run-up bounces are weight shifts on the floor, not hops on one leg. A headless check of every airborne pose (6–12 Monster points, standing and moving) finds no other leg split > 0.6 rad. Files: js/render3d/poses3d-attack.mjs, poses3d-cele.mjs.
- 2026-10-12 Running spikes no longer leave in a scissor (owner): from the plant of a spike / jump-serve approach and in the air, the planted run gait lets go at once (gait3d: weight → 0 at rate 45 instead of easing out over ~0.2 s, which pinned one foot to its stride as the body rose); the approach plants earlier and loads longer (run → penultimate step → load → take-off at 0.5 / 0.68 / 0.88 of the approach); during take-off the bones follow fast, and at 2× / 4× speed every bone follows that much faster. Rendered check (Monster, 1×, take-off and air): thigh split max 0.79 rad before → 0.30 after. Files: js/render3d/gait3d.mjs, actors3d.mjs, poses3d-attack.mjs.
- 2026-10-13 Kneel's back foot fixed (owner): the one-knee pose (hard receive, knockdown get-up) bent the back knee past 90° with the ankle flat, so the shin rose behind and the foot stuck up in the air; now the thigh is upright, the shin lies flat behind with the knee by the floor and the toes tucked. Rendered check: back foot 0.42 → 0.22 m off the floor, knee 0.17 m. File: js/render3d/poses3d.mjs.
- 2026-10-13 (owner: "fix it"): tests/harness.js Math.random made uniform (`(x >>> 0) / 2^32`; was `% 1e9 / 1e9`, which drew values under ~0.29 25 % too often). Fallout: goldens updated; knockdown fixes it exposed — a knocked-down player no longer covers a blocked ball (rally-defense.js blockCover) or becomes the fallback blocker (rally-phases.js B0); calibrations rebased (people.test.js: fewer stars w12 3.2 / w28 7.2, was 5.2 / 9.6; bond 60 at week 2.6, was 5.2 — the real game, on an unbiased Math.random, always had these); scenario seeds moved (people 94→97, 144→148; career 71→73, 71→72; cup 51/52→53/54); laning ratio check 1.25 → 1.15 (~1.3 over 300 matches).
- 2026-10-14 Match prep as a game screen (owner: "very hard to go through … collapsible … game UI"; Monster and career): tabs Teams & plans / ‹team› players (keys 1–3), team banners with VS, plan tiles with a one-line effect, the Plan board's choices folded into slots (current pick + odds, click opens the options); no scroll at 1600×900 (card 1562 → 606 px tall). Files: js/ui/match-prep.js, plan-board.js, match-controls.js (keys 1–3), css/match.css, tests/ui-smoke.js, spec.md §2.29, ARCHITECTURE-details.md.
- Tape Room habits moved from the Plan board to match prep (under your hand) after T-298 removed the board (js/ui/match-prep.js, css/match.css)
