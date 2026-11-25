# Mechanic Spec — Core Ball Sort Rules & Level Format (`MEC-001`–`MEC-005`)

> **ID:** MEC-001 · **Status:** Approved · **Updated:** 2026-11-23
> **Implemented in:** `scripts/core/codec.gd`, `scripts/core/engine.gd`, `scripts/core/game_session.gd`
> **Verified by:** `tests/run_tests.gd` (39/39 passing)

## 1. Board Model & Invariants
- A board consists of `B` initial **tubes** (`3 <= B <= 8`, max `9` total when Extra Tube is used) and a shared `capacity` (`K`, typically `3..6`).
- Each tube holds:
  - `balls`: ordered array from bottom (`index 0`) to top (`index size - 1`).
  - `target_color`: integer color ID (`>= 0`, typically `0..8`), or `-1` for an empty **holder** (no target).
  - `lock`: optional `LockSpec` (`null` if unlocked).
  - `gone`: boolean (`true` after a tube retires because no incoming tube remains).
- **Mystery encoding (`HID = 1000`):** A hidden `?` ball of true color `c` is stored as `c + 1000`.
  - **Top-ball rule:** The top ball of any initial or incoming tube is **never** hidden (invalid level if violated).
- **Color conservation invariant:** Across all initial + incoming tubes, for every color `c`:
  $$\text{count}(\text{balls of color } c) = \text{count}(\text{target tubes of color } c) \times K$$
- **Queue invariant:** `total_targets >= 2` and `declared_incoming <= total_targets - 1`. Any remaining slots up to `total_targets - 1` are implicitly `"retire"` entries.

---

## 2. Level String Format (`scripts/core/codec.gd`)
All integers use base62 (`0-9a-zA-Z`):
```text
level := capacity ';' boardCount ':' tube (';' tube)*
tube  := [target [',' lock]] ['.' balls ('.' pos ',1')*]   |   '.' (empty holder)
lock  := '1' N            # collect_count: unlock when done >= N
       | '2' COLOR N      # collect_type:  unlock when collected(COLOR) >= N
```
- The first `boardCount` tokens are visible at level start; subsequent tokens form the FIFO **incoming queue**.
- Example: `4;4:.;0,12.0123.0,1.1,1;1,201.1122;2.2301;3.3300`
  - `capacity = 4`, `boardCount = 4`, tube 0 is an empty holder, tube 1 has target `0`, count-lock `2`, balls `[0, 1, 2, 3]` with indices `0` and `1` hidden (`?`).

---

## 3. Move Legality & Rejection Priority (`MEC-001`)
A move `(src, j, dst)` transfers the contiguous top segment `cols[src][j .. end]` (`count = len(cols[src]) - j`) onto `cols[dst]`.
- **Multi-color segments are legal:** Balls above `j` may be any colors (even mystery `?`), as long as `j` itself is valid.
- **Rejection check order (`EngineCore.reject_reason`):**
  1. `"invalid"` — `src == dst`, out-of-bounds tube index, or `j < 0` / `count <= 0`.
  2. `"locked"` — `src` or `dst` is locked or `gone`.
  3. `"full"` — `len(cols[dst]) + count > caps[dst]`.
  4. `"mystery"` — `dst` is non-empty AND `cols[src][j]` is hidden (`>= 1000`). *(Moving a hidden ball onto an **empty** tube is allowed.)*
  5. `"color"` — `dst` is non-empty AND `cols[dst][-1] != cols[src][j]`.
  6. `""` (valid) — move succeeds.

---

## 4. Post-Move Resolution Pipeline (`MEC-002`, `MEC-003`, `MEC-004`)
Executed synchronously inside `EngineCore.apply_move()`:
1. **Transfer:** Append `cols[src][j..end]` to `cols[dst]`, truncate `cols[src]` to length `j`, emit `{"type": "moved", src, j, dst, count}`.
2. **Chain Collection (`collect_ready`, up to 40 passes):**
   - A tube `i` is **ready** iff unlocked, not `gone`, `target >= 0`, `len(cols[i]) == caps[i]`, and every ball equals `target` (none hidden).
   - When ready:
     1. Clear `cols[i]`, increment `done += 1`, append `color` to `collected_colors`.
     2. Pop incoming tube `k = done - 1`:
        - `"retire"` (or queue exhausted): set `target = -1`, `caps[i] = 0`, `gone[i] = true`, `locks[i] = null`.
        - `"target"` or `"holder"`: set `target = inc.target_color` (or `-1`), spawn `inc.balls` into the first available unlocked non-gone tube with space (trying tube `i` first — since `len(inc.balls) <= K`, they always land in tube `i`), attach lock via `_appear_lock(inc.lock, done)`.
     3. Emit `{"type": "collected", col, color, nth, slot, new_target, spawned, lost}`.
   - **Appear-lock rule (`_appear_lock`):** If an incoming tube carries a `"count"` lock with threshold `N`, its effective threshold becomes `N + done` ("collect `N` *additional* targets"). `"type"` locks keep their original threshold.
3. **Unlock Pass (`_unlock_pass`, runs if `>= 1` target was collected):**
   - Unlock any tube whose lock is satisfied (`done >= count` for `"count"`, or `count(collected_colors == color) >= count` for `"type"`). Emit `{"type": "unlocked", col}`.
4. **Mystery Reveal Pass (`_reveal_pass`, always runs):**
   - For every tube whose top ball is hidden (`>= 1000`), subtract `1000` to reveal its true color and emit `{"type": "revealed", col, index, color}`.

---

## 5. Win, Deadlock & Power-Ups (`MEC-005`)
- **Win:** `state.done >= level.total_targets`.
- **Deadlock (`EngineCore.dead_reason`, checked when not won):**
  1. `"no_moves"` — no legal `(src, j, dst)` exists.
  2. `"doomed"` — summing balls currently on board + `level.future_tally(done)`, total completable targets `sum(have[c] // K)` is `< level.total_targets - done`.
  3. `"closed_cycle"` — if no tube is ready (and either mechanics exist or no irreversible split move exists), run DFS/BFS over moves (`deposit = false`) up to **`80` states**. If no reachable state makes any tube ready AND every reachable state can reach the initial state `0` (verified via reverse graph reachability), return `"closed_cycle"`. Exceeding 80 states is treated as not deadlocked.
- **Power-ups (`GameSession`):**
  - **Undo:** Restores full `BoardState` snapshot (including collections, unlocks, and reveals). Default limit `3` per level (`undo_limit = -1` for unlimited in tests).
  - **Extra Tube:** Appends 1 empty holder of `capacity`. Allowed **once per level**, capped at `MAX_COLUMNS = 9`.
  - **Hint:** Returns `Vector3i(src, j, dst)` from cached winning plan or solver (see `SPEC-M3` for A* upgrade).
