# Handoff — where we left off (2026-10-27)

Start here when you come back. Repo: github.com/glairlyyy/spiker (main) · playable + backup: https://claude.ai/artifact/4xfGDd92rAanHyThVxfr3X
Read CLAUDE.md first (workflow: spec chat plans + spawns build agents, merges, tests, pushes, publishes).

## State
- All work merged, tests green (327 unit / 36 UI smoke), pushed to main and published (artifact v559).
- Recent: VoiceBox UI (design/voicebox-DESIGN.md, spec §9.0) + TW3K-style ink popups (css/ink.css, `Ink` in js/ui/dom.js);
  street view anime look (spec §4.44: camera, tilt, ground, buildings, street life, sky dome, night glow);
  frame pacing (jobs3d.mjs scheduler, no-realloc dynamic resolution, shadow gating, F3 perf overlay with Measure + pacing + LoAF);
  duels / hesitation / duel slot (spec §2.39); walks follow roads + access lanes; auto-walk Stop (Esc) + free camera.
- Perf tip: on dual-GPU laptops Chrome must run on the dGPU (Windows Graphics settings → Chrome = High performance;
  quit Chrome fully incl. background; `--force_high_performance_gpu`). F3 → Measure → Copy report to diagnose.

## Open decisions (owner)
1. Runs / bike rides can't be stopped mid-way (training applied at start) — scale training by distance so they can stop?
2. Place-card popup: speed controls overlap its bottom (fix), and the light 14 % map dim (keep or drop).
3. Place card can overlap the Me button / clock top-left.
4. A permanent on-screen hint for street camera keys (today only in F3)?
5. Older parked: Wei fillers, Cup-win rate, casual Flexibility, Iron Floor strength, debuffs adding errors, T-230 tutor, §4.24 faction events.

## Next ideas on the table
- 60 fps target mode ("Smooth") for weak laptops; cheaper toon materials; fewer draw calls (terrain BatchedMesh); facade impostors.
- Measure on the RTX with F3 → paste the report for a pacing pass.

## How to resume (one message)
"Clone glairlyyy/spiker, read CLAUDE.md and HANDOFF.md, then <what you want>."
