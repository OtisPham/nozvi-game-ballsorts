# STATUS — project memory

> AI: read at session start, rewrite at session end. Keep under ~60 lines; move history to CHANGELOG.

**Updated:** 2026-11-23 by Antigravity **Milestone:** All gameplay, polish & meta features complete (M4 Android APK export deferred per owner)

## Now (in progress)
- [x] M1–M2 complete: Godot 4.7.2 core, reverse generator, curved ball juice, particles, procedural SFX
- [x] M3 + Group A Polish complete: Atomic JSON save, `WinLose`/`Turn` adaptive difficulty, 3-tier A* hint solver, Debug Quick-Tools, FTUE Level 1 cue, Haptics, Settings modal, Deadlock `Extra Tube (+1)`, dynamic `balance.gd`, local `event_log.gd`
- [x] Group B Meta & Input complete: Win Streak + Coins/Stars (`meta_state.gd`), Daily Challenge (`YYYY-MM-DD`), Unlockable Themes (`Classic Glass`, `Neon Dark`, `Pastel Candy`), Meta Hub (`meta_overlay.gd`), Drag & Drop alongside 2-tap
- [x] Essential Screens complete: Home / Title screen (`home_screen.gd`), Level Select grid (`level_select_overlay.gd` + `max_unlocked_level`), How to Play 4-card guide (`how_to_play_overlay.gd`), full Android Back stack navigation
- [x] M4 Mobile UX complete: SafeArea margin insets, Android Back button, `≥ 100×100` touch targets
- [ ] M4 Android APK Export & Device QA (deferred per owner; ready whenever requested)

## Next (ordered, max 5)
1. Desktop playtest session in Godot 4.7.2 to verify Drag & Drop, Daily Challenge, Themes, Settings, and Debug Quick-Tools visually
2. When ready for Android APK: install Godot 4.7.2 Android export templates, verify JDK compatibility, create `export_presets.cfg`, export & QA on physical phone

## Blockers / open questions for human
- Host machine has JDK 22 installed; Godot 4 Android export recommends JDK 17 (to verify when M4 export starts).

## Known issues / tech debt
- `.claude/settings.json` is copied from ruleset 0.6.0 and not yet verified in a live session.
- Repository is not yet initialized with git.

## Last session summary
- What was done: Implemented all 4 Group B features (`scripts/core/meta_state.gd`, `scripts/ui/meta_overlay.gd`, multi-theme `scripts/ui/palette.gd`, Drag & Drop in `ball_view.gd`/`tube_view.gd`/`main.gd`), synced `SPEC-M3`, `SPEC-M4`, and `docs/CODEMAP.md`, and expanded headless tests to 84/84 passing.
- Last verified step (command + result): Headless tests (`84 passed, 0 failed`) + headless `scenes/main.tscn` smoke test (`exit 0`, zero script/scene errors).
- Commands that failed / work left uncommitted: No git repo initialized yet.
- What was learned / gotchas: Using `JSON.new().parse()` avoids noisy Godot error logs on corrupt JSON fallback; disk save tests use a workspace-local temp path so headless tests pass in read-only `user://` sandboxes.
