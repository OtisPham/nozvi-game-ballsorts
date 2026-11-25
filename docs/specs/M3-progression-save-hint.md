# Spec M3 — Local Save, Adaptive Difficulty & A* Hint Solver

> **ID:** SPEC-M3 · **Status:** Approved · **Updated:** 2026-11-23
> **Relates to:** `docs/GDD.md` (§5, §7, §8, §11, §13), `MEC-005`

## 1. Goal & Scope
Add four self-contained capabilities to complete Milestone M3:
1. **Local Save (`scripts/save/save_store.gd`)**: Persist current level, active in-progress board, audio preference, and adaptive progression state in `user://save_v1.json`.
2. **Adaptive Difficulty (`scripts/core/progression.gd`)**: Adjust reverse-generator scramble depth and scheduled Hard / Veryhard milestones using `WinLose` tier and `Turn` window.
3. **Upgraded Hint Solver (`scripts/core/solver.gd`)**: Guarantee a fast (`≤ 150 ms`), legal hint via 1-step collection check → A* target-focused search → deterministic heuristic fallback (`score_move`).
4. **Debug Quick-Tools (`scenes/main.gd`, `OS.is_debug_build()` only)**: Compact HUD `DBG` button opening a lightweight debug overlay to jump to any level, win immediately, reset save, and inspect live progression state.

**Out of scope for M3:** Cloud sync, leaderboards, analytics SDKs, monetization.

---

## 2. Module 1 — Local Save (`scripts/save/save_store.gd`)

### 2.1 File Format (`user://save_v1.json`)
Single UTF-8 JSON file with atomic write (`user://save_v1.json.tmp` → `DirAccess.rename_absolute` to `user://save_v1.json`).

```json
{
  "schema_version": 1,
  "level_number": 12,
  "muted": false,
  "haptics_enabled": true,
  "show_symbols": true,
  "progression": {
    "win_lose_tier": 2,
    "turn": 2,
    "recent_bits": [1, 1, 0]
  },
  "meta": {
    "win_streak": 2,
    "best_streak": 4,
    "coins": 46,
    "stars": 9,
    "active_theme": "classic",
    "unlocked_themes": ["classic"],
    "daily_completed_dates": ["2026-11-23"]
  },
  "active_run": {
    "level_text": "5;6:...",
    "badge": "NORMAL",
    "cols": [[0, 1], [1, 0], []],
    "targets": [0, 1, -1],
    "caps": [4, 4, 4],
    "gone": [false, false, false],
    "locks": [null, {"kind": "count", "count": 2, "color": -1}, null],
    "done": 0,
    "collected_colors": [],
    "extra_used": false,
    "undos_used": 0,
    "moves": 4,
    "dirty": false
  }
}
```

### 2.2 Public Interface (`RefCounted`)
- `static func serialize(data: Dictionary) -> String`
- `static func deserialize(raw: String) -> Dictionary` (returns `{}` on invalid JSON, wrong `schema_version`, or missing required keys)
- `static func save_to_path(data: Dictionary, path: String = "user://save_v1.json") -> bool`
- `static func load_from_path(path: String = "user://save_v1.json") -> Dictionary`
- `static func snapshot_session(session: GameSession, level_text: String, badge: String, dirty: bool) -> Dictionary`
- `static func restore_session(active_run: Dictionary) -> GameSession` (returns `null` if `level_text` or `BoardState` fails validation)

### 2.3 Save Triggers & Error Handling
- **Triggers:** After every legal move, after `undo()`, after `add_extra_tube()`, after Settings toggles (`Sound`, `Haptics`, `Color-Blind Symbols`), and on level completion (`active_run` cleared and `level_number` incremented).
- **Corruption fallback:** If the file is missing, unreadable, invalid JSON, or `restore_session()` returns `null`, `main.gd` logs a warning, keeps `level_number` if valid (else `1`), and cleanly generates a fresh board for `level_number` without crashing.
- **Undo history note:** To keep save payloads compact, `_history` is not persisted across app restarts; resuming an in-progress run starts with an empty undo stack while preserving `undos_used`.

---

## 3. Module 2 — Adaptive Difficulty (`scripts/core/progression.gd`)

### 3.1 State Model (`ProgressionState extends RefCounted`)
- `win_lose_tier: int = 2` (clamped to `1..5`)
- `turn: int = 1` (clamped to `1..5`)
- `recent_bits: PackedInt32Array` (sliding window of max length `5`; `1` = clean win, `0` = dirty win or fail)

### 3.2 Update Rules
- **Dirty flag (per level attempt):** Becomes `true` if the player hits a deadlock, presses **Restart**, or uses **Hint**.
- **On Level Win (`record_win(level_num: int, dirty: bool)`):**
  - `win_lose_tier = clampi(win_lose_tier + 1, 1, 5)`
  - If `level_num == 4` and `turn < 2`: set `turn = 2` and clear `recent_bits`.
  - If `level_num >= 5`: append `0 if dirty else 1` to `recent_bits` (trim oldest if `size > 5`).
    - Count trailing `1`s (`win_streak`) and total `0`s (`dirty_count`) in `recent_bits`.
    - Promotion thresholds: `turn 1 -> 2` needs `win_streak >= 2`; `turn 2 -> 3` needs `>= 2`; `turn 3 -> 4` needs `>= 3`; `turn 4 -> 5` needs `>= 5`.
    - If promoted: `turn += 1` and clear `recent_bits`.
    - Else if `turn > 1` and `dirty_count * 2 > turn`: `turn -= 1` and clear `recent_bits`.
- **On Deadlock / Manual Restart (`record_fail()`):**
  - `win_lose_tier = clampi(win_lose_tier - 2, 1, 5)`

### 3.3 Milestone Badges & Parameter Mapping
- `static func milestone_badge(level_num: int) -> String`:
  - Returns `"VERY_HARD"` if `level_num >= 20 and level_num % 10 == 0`.
  - Returns `"HARD"` if `level_num >= 15 and level_num % 10 == 5`.
  - Otherwise returns `"NORMAL"`.
- `func tune_params(level_num: int, base: Generator.GenParams) -> Dictionary`:
  - For tutorial levels `1..11`: return `base` unchanged with badge `"NORMAL"`.
  - For `level_num >= 12`:
    - `tier_delta = (win_lose_tier - 2) * 0.25 + (turn - 2) * 0.15`
    - `milestone_delta = 0.0` (`+0.8` for `"HARD"`, `+1.4` for `"VERY_HARD"`)
    - `base.scramble = clampf(base.scramble + tier_delta + milestone_delta, 1.5, 4.5)`
    - If `"HARD"`: `base.locks = clampi(base.locks + 1, 1, 3)`
    - If `"VERY_HARD"`: `base.locks = clampi(base.locks + 1, 1, 3)` and `base.mystery = maxi(base.mystery, 6)`
  - Returns `{"params": base, "badge": badge}`.

### 3.4 HUD Integration
- Display a compact colored pill badge next to `LEVEL N` when `badge != "NORMAL"` (`HARD` in orange, `VERY HARD` in red).

---

## 4. Module 3 — A* Hint Solver (`scripts/core/solver.gd`)

### 4.1 Three-Tier Hint Pipeline (`find_hint(state, level, budget_ms = 150) -> Vector3i`)
1. **Tier 1 — Immediate Collection (`O(legal_moves)`):**
   - Scan `candidate_moves(state)`. If any move increases `state.done` (triggers a target collection), pick the one with highest `score_move()` immediately.
2. **Tier 2 — Time-Budgeted A\* Search (`budget_ms = 150`):**
   - Pick up to 4 candidate target tubes currently visible and unlocked (prioritizing tubes with the most matching bottom balls).
   - Run A* with `f = g + h`, where `h(s)` = minimum estimated moves to clear wrong balls off the best candidate target tube + remaining balls of that color needed.
   - Stop as soon as a state achieves `s.done > start.done` (next target collected) OR `Time.get_ticks_msec() - t0 >= budget_ms` OR `expanded >= 8000`.
   - Reconstruct first move of the path.
3. **Tier 3 — Heuristic Fallback (`score_move(state, level, mv) -> float`):**
   - If Tier 2 times out without collecting a target, score every move in `candidate_moves(state)`:
     - `+40` if move completes a target tube; `+14` if placing a ball matching the destination's target color onto a matching-bottom prefix.
     - `+6` for lifting a mismatched ball off a target tube (`+12` bonus if it completely clears mismatched balls from that tube).
     - `+8` if moving exposes a hidden mystery (`?`) ball.
     - `-8` for breaking an already-aligned bottom prefix on a target tube; `-4` for placing onto a mismatched target tube; `-2` for moving onto an empty holder.
   - Return the highest-scoring legal move (or `Vector3i(-1, -1, -1)` only when `legal_moves` is empty).

---

## 5. Polish, Settings, Balance & Analytics (GDD §3b, §6, §7, §10, §12)
- **FTUE Level 1 Cue:** On a fresh Level 1 (`moves == 0`), auto-highlight the first suggested move via `Solver.find_hint()` without setting `_dirty`.
- **Haptics (`scripts/audio/haptics.gd`):** Mobile vibration cues on select, land, invalid, collect, reveal, unlock, win, and deadlock (safe no-op on desktop/headless; toggleable in Settings).
- **Settings Modal (`scripts/ui/settings_overlay.gd`):** TopBar `Settings` button opens a modal with `Sound`, `Haptics`, `Color-Blind Symbols`, and 2-step `Reset Progress` (replaces standalone `Sound` button on TopBar).
- **Deadlock Recovery:** Deadlock overlay offers `Retry Level`, `Undo` (or `Close`), and a direct `Extra Tube (+1)` button when still available.
- **Dynamic Balance (`scripts/core/balance.gd`):** Loads tunable gameplay constants from `config/balance.json` (`undo_limit_per_level`, `hint_time_budget_ms`, `deadlock_cycle_max_states`, `win_lose_steps`, `max_total_tubes`).
- **Local Analytics (`scripts/analytics/event_log.gd`):** Logs the 7 GDD §12 events (`level_start`, `move_made`, `target_collected`, `prop_used`, `deadlock_triggered`, `level_complete`, `level_restart`) to `user://analytics_events.jsonl` plus an in-memory ring buffer.
- **Meta Progression (`scripts/core/meta_state.gd`, `scripts/ui/meta_overlay.gd`, `scripts/ui/palette.gd`):**
  - **Win Streak, Coins & Stars:** Clean wins increment `win_streak` (deadlock/restart/dirty resets streak); rewards `10/20/35/50` coins (`NORMAL`/`HARD`/`VERY_HARD`/`DAILY`) + `min(streak, 5) * 2` bonus and `3` stars (clean/daily) or `2` stars (dirty).
  - **Daily Challenge:** Deterministic board seeded by `YYYY-MM-DD`, playable from `Daily & Themes` without overwriting the player's main level `active_run`; marks completed dates.
  - **Unlockable Themes:** `Classic Glass` (default), `Neon Dark` (`60` coins or Level `10`), `Pastel Candy` (`120` coins or Level `20`), dynamically restyling board background, glass tubes, and ball palettes.
- **Drag & Drop Input (GDD §3):** Seamless drag-and-drop (`≥ 18 px` threshold with floating ghost segment on `FxLayer` and snap-drop onto destination tubes) coexisting alongside two-tap selection.
- **Core Game Screens (`scripts/ui/`):**
  - **Home Screen (`home_screen.gd`):** Title, active-theme ball preview, stats pill (`Coins`/`Stars`/`Best Streak`), 1-tap `PLAY / CONTINUE LEVEL N`, `Daily Challenge`, `Levels`, `Themes`, `How to Play`, and `Settings`.
  - **Level Select (`level_select_overlay.gd`):** Scrollable 4-column grid of unlocked levels (`1..max_unlocked_level`, persisted in `meta`) with `HARD` / `V.HARD` milestone tags.
  - **How to Play (`how_to_play_overlay.gd`):** Concise 4-card visual guide covering `MEC-001`–`MEC-005` (accessible from Home and Settings).

---

## 6. Debug Quick-Tools (`scenes/main.gd`)
Visible **only when `OS.is_debug_build()` is `true`** (automatically hidden in release exports).

- **Entry point:** Compact `DBG` button in the top HUD bar. Tapping toggles a lightweight modal overlay (also dismissible via Android Back button in M4).
- **Live Status Line:** Displays `Level`, `Badge`, `WinLose Tier`, `Turn`, `recent_bits`, and `dirty` flag for quick QA inspection.
- **Quick Actions:**
  1. **Win Now:** Immediately triggers the normal win flow (`record_win`, save update, win celebration SFX/particles, and Win overlay).
  2. **Jump to Level:** Step buttons (`-1`, `+1`, `+5`, `+10`), milestone shortcuts (`Lv 1`, `Lv 12`, `Lv 15`, `Lv 20`), and a direct level number input (`SpinBox` + `Go`) that cleanly loads and saves the target level.
  3. **Reset Save:** Deletes `user://save_v1.json`, resets `ProgressionState` to defaults, and reloads Level 1.
  4. **Close:** Dismisses the debug overlay without modifying the board.

---

## 7. Verification Plan (Headless Tests)
Extend `tests/run_tests.gd` with deterministic assertions:
1. `SaveStore` round-trip (`serialize` -> `deserialize` -> `restore_session`) preserves exact `BoardState`, locks, mystery balls, `done`, and `extra_used`.
2. `SaveStore` safely rejects corrupt JSON and mismatched `schema_version`.
3. `ProgressionState` verifies `WinLose` `+1 / -2` clamping (`1..5`), Level 4 forced `Turn = 2`, `Turn` promotion/demotion thresholds, and `HARD` / `VERY_HARD` badge schedule.
4. `Solver.find_hint()` returns a legal move in `< 150 ms` across 20 generated levels (including mystery & locks) and never returns invalid moves when `legal_moves` is non-empty.
