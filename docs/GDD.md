# GDD — NOZVI-GAME-06 (Ball Sort)

> Casual-game GDD. Sections marked **[REQUIRED]** must be filled (no `TBD`) before any gameplay code.
> Keep it short: a casual GDD over ~3 pages usually means scope is too big.
> Numeric targets below are **defaults** for mobile casual games, not laws. Override per game with a one-line reason in `docs/DECISIONS.md`.
> The GDD owns product intent, scope and milestones. Exact rules of a complex mechanic go in `docs/specs/mechanics/MEC-xxx.md` and are linked here, not repeated.
> **Version:** 0.3 · **Updated:** 2026-11-23 · **Owner:** NOZVI · **Status:** Approved (M1)

## 1. Pitch [REQUIRED]
- **One sentence:** Slide ball segments between tubes to fill matching color-coded tubes, trigger incoming replacement tubes, reveal mystery `?` balls, and clear every target tube without deadlocking the board.
- **Hook (why someone taps it in a store/feed in 3 seconds):** Classic Ball Sort readability with a tactile twist — you can move a **multi-color top segment** at once as long as its base ball matches the destination tube's top ball, sparking fast chain clears as new tubes slide in.
- **Reference games (2–3) and what we take / avoid from each:**
  - *Ball Sort Puzzle* — Take: instant visual clarity (glossy colored balls in tubes), one-hand portrait tap flow, zero text tutorials. Avoid: repetitive single-color-only rules with static tubes that get stale late-game.
  - *Rope Sort* — Take: multi-color segment transfer rule, target-tube collection with incoming replacement tubes, mystery `?` reveal and lock pacing. Avoid: opaque pre-baked level packs with no runtime generator.
  - *Hexa Sort* — Take: juicy chain-reaction clears and clear progress counter (`collected / total`). Avoid: 3D overhead that drains battery on mid-range Android devices.
- **Target player:** Casual mobile puzzle players (ages 18–45) playing in short 3–5 minute breaks or commutes, one-handed in portrait mode, often with sound off.

## 2. Core loop [REQUIRED]
The loop the player repeats every 5–30 seconds. If it isn't fun with grey boxes, nothing else will save it.

    Select ball segment → Move to matching/empty tube → Fill target tube & collect → New tube replaces slot (unlocks / reveals `?`) → Clear all targets (Win) or Deadlock (Retry / Undo / Extra Tube)

- **Core verb(s)** (max 2): **Select** (pick a split point in a source tube) and **Move** (transfer that segment to a valid destination tube).
- **What makes one attempt different from the last:** Spatial planning under limited tube capacity (`4–6`), deciding whether to move a single color or carry mixed-color balls stacked on top, anticipating incoming replacement tubes, and sequencing `?` reveals and tube locks.

## 2b. Mechanics index [REQUIRED once a 2nd mechanic exists]
One row per mechanic. Link a spec only when the mechanic has non-trivial rules or edge cases.
| ID | Mechanic | Player-facing purpose | Spec | Status |
|---|---|---|---|---|
| MEC-001 | Tube stack & multi-color segment transfer | Core sorting action: move balls from index `j` to top onto an empty tube or matching top ball | `docs/specs/mechanics/MEC-001-core-rules.md` | Approved |
| MEC-002 | Target collection & incoming tube replacement | Clear a full matching tube (`capacity` balls = tube target color); next queued tube replaces that slot, or slot retires when queue ends | `docs/specs/mechanics/MEC-001-core-rules.md` | Approved |
| MEC-003 | Mystery balls (`?`) | Hidden balls cannot be moved onto non-empty tubes; automatically reveal when exposed at the top of a tube | `docs/specs/mechanics/MEC-001-core-rules.md` | Approved |
| MEC-004 | Locked tubes (`collect_count` / `collect_type`) | Sealed tubes cannot be used as source or destination until `N` total targets or `N` targets of color `C` are collected | `docs/specs/mechanics/MEC-001-core-rules.md` | Approved |
| MEC-005 | Power-ups (Undo, Hint, Extra Tube) | Recovery tools: Undo up to 3 moves, Hint suggests a winning step, Extra Tube adds 1 empty holder (max 1/level, max 9 tubes) | `docs/specs/mechanics/MEC-001-core-rules.md` & `SPEC-M3` | Approved |

## 3. Controls & input [REQUIRED]
- **Input scheme (one-hand portrait):** Primary is **two-tap** — tap a ball in a source tube to lift/highlight the segment from that ball to the top, then tap the destination tube to move it. Optional drag support in M2.
- **Launch to first input:** **≤ 5 s** (boot straight into current active level). No tutorial text walls; teach by playing.

## 3b. First-time user experience (first 60 s) [REQUIRED]
- **Second 0–5:** App opens directly onto Level 1 (`capacity = 3`, `4` tubes, `3` target tubes, no mystery/locks). A subtle highlight cues the first valid source ball and destination tube.
- **How the core verb is taught:** By doing — Level 1 has an obvious 1-move completion; tapping lifts the movable ball segment and gives soft invalid feedback if a blocked/mismatched tube is tapped.
- **First success moment (target ≤ 15 s):** First target tube fills, pops with particles, increments `1/3`, and clears within 2–3 taps.
- **First failure and retry invitation:** If the player hits a deadlock, a clean overlay offers **Undo**, **Extra Tube**, or **Instant Retry** (1 tap, < 1 s).
- **Hidden until later:** Mystery balls (introduced at Level 6), Locked tubes (introduced at Level 11), Hard/Veryhard badges (from Level 15+), settings tucked in a top-corner icon.

## 4. Win / lose & session [REQUIRED]
- **Win / level-complete condition:** Collect all target tubes (`collected_targets == total_targets`).
- **Fail condition (Deadlock):** Triggered when any of the following holds:
  1. No legal move remains (`no_moves`).
  2. Remaining uncollected balls of any color cannot fill the remaining targets (`doomed`).
  3. Board enters a closed reversible cycle (BFS explores ≤ 80 reachable states with no collection possible and every state can return to start) (`closed_cycle`).
- **Target session length:** 45–120 s per level; 3–6 min per sitting (2–4 levels).
- **Restart cost:** ≤ 1 tap, ≤ 1 s (instant board reset without reload screen).

## 5. Difficulty & pacing [REQUIRED]
- **Ramp structure:**
  - **Levels 1–11 (Guided curve):** Fixed progressive parameters — capacity `3 → 4 → 5`, tubes `4 → 7`, targets `3 → 14`. Level 6 introduces **Mystery (`?`)**; Level 11 introduces **Locked Tubes**.
  - **Level 12+ (Adaptive procedural curve):** Reverse-generated levels (guaranteed solvable via verified witness) scaling capacity (`4–6`), tubes (`5–7`), targets (`10–14`), scramble depth (`2.5–4.0`), mystery (`0` or `4–12`), and locks (`0–3`).
  - **Adaptive adjustment:** Track recent win/fail streaks (`WinLose` step: win `+1`, fail/retry `-2`) and player tier (`Turn 1–5`), plus scheduled **Hard** (`L%10==5`) and **Veryhard** (`L%10==0`) milestones.
- **First failure target:** First-time player should experience their first tense deadlock around **Level 5–7** (~3–5 min in) and clearly see which move blocked their tube.

## 6. Feedback & juice [REQUIRED for M2]
| Event | Visual | Sound | Haptic |
|---|---|---|---|
| Select segment | Selected balls lift toward tube rim + soft glow + valid target tubes highlight | Soft pop tick | Light tap (10 ms) |
| Move segment | Balls arc smoothly out of source rim and drop into destination tube with subtle squash/bounce | Crisp whoosh + glassy clink on land | Subtle tick on land |
| Invalid move | Tube shakes horizontally (120 ms) + brief red flash on lock/full rim | Muted dull thud | Short double-buzz |
| Collect target | Target tube seals/flashes, `GPUParticles2D` burst, counter `x/N` bounces | Ascending chime chord | Medium pulse (25 ms) |
| Incoming tube | New tube slides smoothly into the cleared slot; retired slot fades out | Soft slide | None |
| Mystery reveal (`?`) | Ball flips (`scale.x: 1 → 0 → 1`) revealing true color & symbol | Sparkle ping | Light tick |
| Tube unlock | Lock shakes, cracks, and pops off with small sparks | Metallic click + chime | Medium pulse |
| Level win | Confetti burst + celebratory card with instant "Next Level" button | Warm fanfare jingle | Celebratory pattern |
| Deadlock / Fail | Dim overlay + clear reason icon + 1-tap Undo / Extra Tube / Retry buttons | Soft descending tone | Short buzz |

## 7. Balance parameters [REQUIRED]
All numbers live in `config/balance.json`; this table is the human-readable mirror.
| Key | Value | Notes |
|---|---|---|
| `tube_capacity_range` | `4..6` (tutorial `3..5`) | Max balls per tube and balls required per target |
| `initial_tubes_range` | `4..7` (max `9` with prop) | Columns on board at level start; always ≥ 1 empty holder |
| `targets_per_level_range` | `10..14` (tutorial `3..14`) | Total targets to collect (`GroupsTotal`) |
| `color_count_max` | `9` | Distinct ball colors with distinct symbols/patterns for accessibility |
| `undo_limit_per_level` | `3` | Snapshot-based undo (restores collections, reveals, unlocks) |
| `extra_tube_limit_per_level` | `1` | Adds 1 empty holder of `capacity`; capped at 9 total tubes |
| `hint_time_budget_ms` | `150` | Solver search cap before falling back to heuristic move |
| `deadlock_cycle_max_states` | `80` | Max BFS states checked for closed-cycle deadlock |
| `scramble_depth_tutorial` | `1.2..3.2` | Reverse-generation un-moves per target for Levels 1–11 |
| `scramble_depth_standard` | `2.5..4.0` | Reverse-generation un-moves per target for Level 12+ |
| `win_lose_steps` | `+1 / -2` | Difficulty tier shift on win vs fail/restart |

## 8. Progression & meta [M3]
- **Short-term (per run):** Target counter (`x/N`), clean-win streak indicator, star/coin reward on completion.
- **Long-term (across sessions):** Sequential level counter (infinite via deterministic seed + reverse generator), Hard/Veryhard milestone levels, unlockable ball/tube themes.
- **Reason to come back tomorrow:** Daily challenge seed (same board for all players that day) + streak milestones.

## 9. Monetization [M4 — optional for prototype]
- **Model:** None during M1–M3. Optional rewarded ads (extra Undo / Extra Tube / Hint refill) and non-intrusive interstitials in M4 if shipped to Google Play.
- **Rules:** No interstitial before session 3 or Level 5; rewarded ads are strictly opt-in.

## 10. Art, audio & UI direction [REQUIRED]
- **Style in 1 line:** Clean, crisp 2D modern casual Ball Sort — translucent rounded glass tubes with colored target rings/bases, glossy shaded balls, and 9 high-contrast colors with distinct subtle icons for color-blind accessibility.
- **Screens (minimal):** Boot (auto-load) → Game (HUD + Board + 3 Prop buttons) → Win / Deadlock overlay. Settings modal accessible from a single top-corner gear icon.
- **Readability:** Designed for 5"–6.7" Android phones in `1080×1920` portrait (`canvas_items` stretch, `expand` aspect). Safe-area aware for camera notches; color-blind safe via distinct ball symbols + high-contrast palette.

## 11. Scope & milestones [REQUIRED]
Default order; changing it needs a DECISIONS.md entry approved by the human.
| Milestone | Exit criteria | In scope | Out of scope |
|---|---|---|---|
| M1 Core loop | Godot 4 core logic ported + headless tests pass + greybox playable on PC & Android APK; 5 playtest sessions complete L1–L11 | §2–5, §7, §13 | final art, particles, audio, meta, ads |
| M2 Juice | Feels tactile & responsive at 60 fps on Android; §6 feedback table complete; custom 2D ball/tube assets & SFX integrated | §6, §10 | daily meta, themes, ads |
| M3 Meta | Persistent local save (`user://`), adaptive `WinLose`/`Turn` selector, Hard/Veryhard milestones, improved A* hint solver | §8 | ads, IAP |
| M4 Ship | Signed Android AAB/APK, crash-free on target devices, store listing & optional monetization | §9, polish | new core mechanics |

## 12. Success metrics & playtest [REQUIRED]
- **Hypothesis being tested:** Multi-color segment transfer combined with incoming replacement tubes gives classic Ball Sort a richer strategic rhythm without hurting first-minute clarity.
- **Metrics:** First-session length (target ≥ 4 min), Level 1 completion rate (target ≥ 95%), Level 6 & 11 mechanic comprehension without text, retries per deadlock, average solve time per level.
- **Analytics events (names only; local log in M1–M2):** `level_start`, `move_made`, `target_collected`, `prop_used`, `deadlock_triggered`, `level_complete`, `level_restart`.
- **Playtest log:** `docs/PLAYTEST.md` (create at first playtest).

## 13. Technical constraints [REQUIRED]
- **Stack:** **Godot 4.7.2 Standard (GDScript)** targeting **Android** — see `docs/DECISIONS.md`. Core gameplay (`scripts/core/`) stays pure `RefCounted` GDScript decoupled from scene nodes so it runs headless for automated tests.
- **Target devices & minimum spec:** Android 7.0+ (API 24+), ARM64-v8a, Compatibility or Mobile renderer, portrait orientation locked.
- **Frame-rate & load-time budget:** 60 fps on mid-range Android devices; ≤ 3 s cold start to first playable input; level generation ≤ 50 ms per level.
- **Build size budget:** ≤ 50 MB release APK/AAB.
- **Offline play & save data:** 100% offline playable; local JSON/ConfigFile persistence in `user://` (current level, in-progress board state, adaptive stats, settings).

## Parking lot (ideas not in scope)
- Drag-and-drop ball toss physics.
- Cloud save / Play Games leaderboards.
- Endless zen mode with no locks.
- Custom level editor & shareable level codes.
