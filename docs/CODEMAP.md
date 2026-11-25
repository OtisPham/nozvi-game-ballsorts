# Code map
Updated: 2026-11-23 · Keep under ~80 lines. One row per module, not per file.

## Entry points
| What | File |
|---|---|
| Godot project config | `project.godot` |
| Main game scene | `scenes/main.tscn` (`scenes/main.gd`) |
| Balance config | `config/balance.json` |
| Headless test runner | `tests/run_tests.gd` |

## Modules
| Module (folder) | Responsibility | Key files (max 3) | Depends on | Requirement IDs | Tests |
|---|---|---|---|---|---|
| `scripts/core` | Pure headless Ball Sort rules, codec, balance loader, DFS + 3-tier A* hint solver, session state, adaptive progression, meta state (streak/coins/daily/themes), reverse generator | `engine.gd`, `progression.gd`, `meta_state.gd` | — | MEC-001..MEC-005, GDD §5, §7, §8, SPEC-M3 | `tests/run_tests.gd` |
| `scripts/save` | Atomic local JSON save (`user://save_v1.json`) & BoardState/Session snapshot/restore | `save_store.gd` | `scripts/core` | SPEC-M3 | `tests/run_tests.gd` |
| `scripts/analytics` | Local JSONL analytics event logger (`user://analytics_events.jsonl`) + in-memory ring buffer | `event_log.gd` | — | GDD §12 | `tests/run_tests.gd` |
| `scripts/ui` | Multi-theme palette, Home screen, Level Select, How to Play, Meta hub (daily/themes), Settings, Debug quick-tools | `home_screen.gd`, `level_select_overlay.gd`, `palette.gd` | `scripts/core`, `scenes/board` | GDD §3b, §8, §10, SPEC-M3 | manual (M2/M3) |
| `scripts/audio` | Procedural in-memory WAV SFX synthesizer + mobile haptic feedback wrapper | `sfx_player.gd`, `haptics.gd` | — | GDD §6 | manual (M2/M3) |
| `scenes/board` | Styled rounded glass tube & glossy shaded ball views with reveal/land/shake/slide tweens | `tube_view.gd`, `ball_view.gd` | `scripts/core`, `scripts/ui` | MEC-001..MEC-004, GDD §3, §6 | manual (M2) |
| `scenes` | Main HUD (badge + SafeArea + Back button + DBG toggle), board layout, FX layer, prop buttons, win/deadlock/exit overlay | `main.tscn`, `main.gd` | `scripts/core`, `scripts/save`, `scripts/audio`, `scenes/board`, `scripts/ui` | GDD §2–§6, MEC-005, SPEC-M3, SPEC-M4 | manual (M2–M4) |

## Do not read (generated, vendored or binary)
`.godot/`, `exports/`, `android/`, `builds/`, `assets/` binaries (`*.png`, `*.ogg`, `*.wav`, `*.import`) — unless the task is specifically about them.

## Conventions that help navigation
- Keep `scripts/core/` pure GDScript (`RefCounted`, no SceneTree/Node dependencies) so logic runs headless.
- Communicate from core to view via command calls (`try_move`, `undo`, `add_extra_tube`, `hint`) and structured event dictionaries (`moved`, `collected`, `unlocked`, `revealed`).
- Keep source files under ~300 lines; split when larger.
- File and folder names match the domain terms in `docs/GDD.md` (`snake_case.gd`, `snake_case.tscn`).
