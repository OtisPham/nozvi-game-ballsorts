# Technical Spec — Reverse Level Generator (`TECH-GEN`)

> **ID:** TECH-GEN · **Status:** Approved · **Updated:** 2026-11-23
> **Implemented in:** `scripts/core/generator.gd`
> **Verified by:** `tests/run_tests.gd` (30/30 levels generated & witness-verified, deterministic by seed)

## 1. Why Reverse Generation?
Forward random placement (assigning target tubes and shuffling `P * K` balls randomly) failed **150 / 150** trials under a 20,000-node solver during prototyping because cross-color deadlocks occur almost surely.

Because every collected target tube is **replaced in-place** by the next incoming tube (whose ball count `<= K` always lands in that same slot), a full game trace is invertible. Generating **backward from the won state** guarantees **100% solvability** with an explicit **witness solution** in `< 15 ms` per level on-device.

---

## 2. Algorithm (`Generator._build_reverse`)

### Inputs (`GenParams`)
- `capacity` (`K`): `3..6`
- `board` (`B`): initial tube count (`4..7`)
- `targets` (`P`): total targets to collect (`3..14`)
- `colors` (`C`): distinct colors (`<= min(9, P)`)
- `holders_init` (`Hi = 1`), `holders_inc` (`Ho in {0, 1}`)
- `mystery`: count of hidden `?` balls (`0` or `4..12`)
- `locks`: count of locked initial target tubes (`0..3`)
- `scramble`: mean extra un-moves per target (`1.2..4.5`)
- `full_bias`: probability (`0.9`) of picking the fullest column when capturing an incoming tube

### Step-by-Step Reverse Construction
1. **Queue sizing:** Number of non-retire incoming tubes is `m = P - (B - Hi) + Ho`, requiring `0 <= m <= P - 1`.
2. **Color sequence:** Build `seq[0..P-1]` containing every color `0..C-1` at least once, plus `P - C` random colors, then shuffle. `seq[n-1]` is the color collected on step `n`.
3. **End-state initialization:** Mark `Hi + Ho` random columns as `alive = true` (empty holders remaining at victory); mark all other columns `alive = false` (retired). Designate `Ho` of the alive columns as `park_cols` (replaced by the final incoming holder).
4. **Loop backward `n = P` down to `1`:**
   - **Un-collect target `n` (color `c = seq[n-1]`):**
     - If `n > m` (retire event): revive a random dead column `chosen`.
     - Else if `n == m and Ho == 1`: pick from `park_cols` with `target == -1`, store its current state as `incoming[n-1]`.
     - Else: pick an alive non-ready target column (preferring fullest with probability `full_bias`), store its `(target, balls)` as `incoming[n-1]`.
     - Set `chosen` to completed state: `target = c`, `balls = [c] * K`.
   - **Undo final completing move:** Pick another alive column `q != chosen` and segment size `s in 1..K` such that `len(cols[q]) + s <= K` and `q` does not become ready. Move `s` balls of color `c` from `chosen` to `q`, and record forward move `(q, old_len_q, chosen)`.
   - **Scramble un-moves:** Draw `r = max(0, int(randfn(scramble, max(1.0, scramble / 3))))`. Repeat `r` times:
     - Find valid inverse moves `(d, seg_len, q)` where `seg_len == len(cols[d])` (tube `d` becomes empty, matching empty-destination rule) OR `cols[d][L - seg_len - 1] == cols[d][L - seg_len]` (matching top-ball rule when reversed), `len(cols[q]) + seg_len <= K`, and neither `q` nor `d` becomes ready.
     - Execute transfer `d -> q` and record forward move `(q, old_len_q, d)`.
5. **Finalize & Remap Witness:**
   - Verify all `B` columns are `alive` and none start ready.
   - Randomly permute display order of the `B` initial tubes; remap all column indices in `reversed(rev_moves)` to form `witness`.
   - Validate via `Level.validate()`, `Level.check_invariant()`, and full replay `verify_witness(lv, witness)`.

---

## 3. Attaching Mystery (`?`) & Locks (`_add_mystery`, `_add_locks`)
Because mystery balls and locks restrict legal moves, they are attached **only where `witness` still wins**:
- **Mystery:** Enumerate all non-top ball positions across all tubes; keep positions where hiding that ball still passes `replay_ok(spec, witness)`. Sample `count` positions (up to 12 attempts) and verify the combined set passes `replay_ok()`.
- **Locks:** Only placed on initial target tubes (`0..B-1` with `target >= 0`). Candidate locks are `Lock("count", 2)` and `Lock("type", 1, c)` (`c != tube.target`). Prefer `"type"` locks ~52% of the time; verify combined set passes `replay_ok()`.

---

## 4. Parameter Curve (`Generator.params_for_level`)
- **Levels 1–11 (Guided tutorial):** Fixed progressive table (`K: 3→5`, `B: 4→7`, `P: 3→14`, `scramble = 1.0 + 0.2 * n`). Level 6 introduces 4 mystery balls; Level 11 introduces 1 lock.
- **Level 12+ (Procedural ramp, `ramp = clamp((n - 11) / 40, 0, 1)`):**
  - `K`: `[4, 5, 6]` with weights `[41, 34, 25]`
  - `B`: `[5, 6, 7]` with weights `[10, 45, 45]`
  - `P`: `[10..14]` shifting heavier with `ramp`
  - `colors`: `9` (76%) or `8` (24%), capped at `P`
  - `mystery`: probability `0.25 -> 0.55`, count `4..12`
  - `locks`: `[0, 1, 2, 3]` shifting heavier with `ramp` (Level 22 guarantees `>= 1` lock)
  - `scramble`: `2.5 -> 4.0` (further modulated by `SPEC-M3` `ProgressionState`)

---

## 5. Known Limitations & Future Tuning Ideas
1. **Initial board density:** Reverse-generated boards start slightly fuller (~80% fill vs ~69% in reference benchmarks) and have more bottom balls matching their own target color (~80% vs ~51%). Future tuning can add a "push balls back into incoming tubes" scramble pass.
2. **Mystery/Lock hardness:** Filtering strictly by the original `witness` guarantees solvability without a heavy solver, but can make mystery/lock placements slightly gentler than hand-tuned puzzles.
3. **Supported shapes:** Currently generates 1 initial holder, 0–1 incoming holder, locks only on initial target tubes, and up to 9 colors.
