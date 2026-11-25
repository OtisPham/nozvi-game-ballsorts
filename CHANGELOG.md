# Changelog
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer (0.x until first public release).

## [Unreleased]
### Added
- Filled and approved `docs/GDD.md` (v0.3, Ball Sort theme, mechanics `MEC-001`–`MEC-005`, M1–M4 milestones).
- Scaffolded Godot 4.7.2 project (`project.godot`, `config/balance.json`).
- Implemented pure GDScript core (`scripts/core/codec.gd`, `engine.gd`, `solver.gd`, `game_session.gd`, `generator.gd`) and headless unit test suite (`tests/run_tests.gd`, 39/39 passing).
- Built M1 playable greybox UI (`scenes/main.tscn`, `scenes/main.gd`, `scenes/board/tube_view.gd`, `scenes/board/ball_view.gd`, `scripts/ui/palette.gd`).
- Added M2 juice & audio: procedural SFX (`scripts/audio/sfx_player.gd`), curved ball arc tweens, landing bounce, mystery flip, invalid shake, rounded glass tube styling, `CPUParticles2D` bursts, and HUD Sound toggle.
- Drafted specs for remaining milestones: `docs/specs/M3-progression-save-hint.md` (local save, adaptive difficulty, A* hint solver) and `docs/specs/M4-android-build-ship.md` (Android SafeArea, Back button, APK export & QA).
- Added core & generator technical specs (`docs/specs/mechanics/MEC-001-core-rules.md`, `docs/specs/TECH-level-generator.md`) and linked them in `docs/README.md` and `docs/GDD.md`.
- Approved `SPEC-M3` (including Debug Quick-Tools) and `SPEC-M4`.
- Implemented M3: `scripts/save/save_store.gd` (atomic JSON save/restore), `scripts/core/progression.gd` (`WinLose`/`Turn` adaptive difficulty + `HARD`/`VERY_HARD` badges), 3-tier A* hint solver in `scripts/core/solver.gd` (`≤ 150 ms`), and `scripts/ui/debug_overlay.gd` (`DBG` quick-tools: Win Now, level jump, reset save, live state).
- Implemented M4 Mobile UX in `scenes/main.gd` and `scenes/main.tscn`: SafeArea margin insets, Android Back button handler (DebugOverlay → Overlay → Selection → Exit Confirm), and `≥ 100×100` HUD touch targets.
- Expanded headless test suite (`tests/run_tests.gd`) to 73/73 passing assertions covering SaveStore, ProgressionState, A* hint budget/legality, `Balance` config loader, and `EventLog`.
- Added Group A GDD Polish: FTUE Level 1 first-move cue, mobile `scripts/audio/haptics.gd`, `scripts/ui/settings_overlay.gd` (Sound, Haptics, Color-Blind Symbols toggle, 2-step Reset Progress), direct `Extra Tube (+1)` recovery button on Deadlock overlay, dynamic `scripts/core/balance.gd` (`config/balance.json`), and `scripts/analytics/event_log.gd` (GDD §12 local JSONL logger). Synced `SPEC-M3` and `SPEC-M4`.
- Added Group B Meta & Input: `scripts/core/meta_state.gd` (Win Streak, Coins/Stars rewards, deterministic `YYYY-MM-DD` Daily Challenge, Unlockable Themes), `scripts/ui/meta_overlay.gd` (`Daily & Themes` hub), multi-theme `scripts/ui/palette.gd` (`Classic Glass`, `Neon Dark`, `Pastel Candy`), and Drag & Drop ball transfer alongside two-tap in `scenes/main.gd`.
- Added core game screens: Home / Title screen (`scripts/ui/home_screen.gd`), scrollable Level Select (`scripts/ui/level_select_overlay.gd` with `max_unlocked_level` persistence), and 4-card How to Play guide (`scripts/ui/how_to_play_overlay.gd`), wired into Top/Meta HUD and Android Back navigation.
- Expanded headless test suite (`tests/run_tests.gd`) to 84/84 passing assertions covering `MetaState` rewards, theme unlocks, `max_unlocked_level`, and Daily Challenge solvability/determinism.

### Changed
- Pivoted stack to Godot 4.7.2 (Android) and theme to Ball Sort; recorded in `docs/DECISIONS.md`.
- Updated `README.md`, `docs/CODEMAP.md`, `docs/README.md`, and `docs/STATUS.md`.

### Fixed
### Removed

## [0.0.1] - 2026-11-23
### Added
- Project scaffold.
