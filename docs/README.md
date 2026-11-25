# Docs map (read this instead of scanning docs/)
Updated: 2026-11-23

## 1. Document index
Only files listed here exist. Status: Draft / Approved / Deprecated.
| ID | File | Owns (source of truth for) | Status |
|---|---|---|---|
| GDD | `docs/GDD.md` | Product intent, scope, milestones, mechanics index | Approved |
| STATUS | `docs/STATUS.md` | Current state, next steps, blockers | — |
| CODEMAP | `docs/CODEMAP.md` | Where code lives, module boundaries, entry points | — |
| DEC | `docs/DECISIONS.md` | Technical/design trade-offs (ADR-lite) | — |
| MEC-001 | `docs/specs/mechanics/MEC-001-core-rules.md` | Exact Ball Sort rules (`MEC-001`–`MEC-005`), codec format, deadlock checks | Approved |
| TECH-GEN | `docs/specs/TECH-level-generator.md` | Reverse level generator algorithm, witness verification, parameter curve | Approved |
| SPEC-M3 | `docs/specs/M3-progression-save-hint.md` | M3 local save, adaptive difficulty (`WinLose`/`Turn`), A* hint solver, debug quick-tools | Approved |
| SPEC-M4 | `docs/specs/M4-android-build-ship.md` | M4 Android SafeArea, Back button, APK export pipeline & device QA | Approved |
| — | `CHANGELOG.md` | History | — |
<!-- Add rows as specs are created, e.g.:
| MEC-001 | `docs/specs/mechanics/MEC-001-jump.md` | Exact jump rules | Approved |
| ARCH | `docs/ARCHITECTURE.md` | Module contracts, lifecycle | Draft |
| INT-001 | `docs/integrations/INT-001-analytics.md` | Analytics events, consent | Draft |
| PLAYTEST | `docs/PLAYTEST.md` | Playtest evidence | — |
-->

## 2. Routing: what to read per task
Read the "First" column; open "Then" only if the task needs it. Never read every file.
| Task | First | Then (only if needed) |
|---|---|---|
| New gameplay feature | GDD (relevant § only), STATUS | MEC spec, CODEMAP module row, related tests |
| Gameplay bug | MEC spec (or GDD §) for that behavior | CODEMAP module row → that module's files + tests |
| Balance / tuning | GDD §7, balance config | MEC spec §9 |
| Refactor | CODEMAP, ARCHITECTURE | DECISIONS (grep topic), module tests |
| UI / juice | GDD §6, §10 | CODEMAP ui row |
| Analytics / ads / SDK | INT spec | GDD §9, §12; CODEMAP integrations row |
| Playtest follow-up | PLAYTEST (latest entry only) | GDD §12 |
| Release | STATUS, CHANGELOG [Unreleased] | Test results, INT specs |

## 3. Requirement IDs
IDs (GDD-§n, MEC-xxx, INT-xxx) appear in specs, in test names and in a one-line comment at the main implementing function, so `grep -r "MEC-001"` finds spec, code and tests without scanning.
