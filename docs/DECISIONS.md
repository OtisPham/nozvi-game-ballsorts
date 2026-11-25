# Decision log
Append-only. Format: `## YYYY-MM-DD — <decision>` then Context / Choice / Alternatives / Consequence (1 line each).

## 2026-11-23 — Web stack: TypeScript + Vite + Phaser
Context: Owner selected the target stack at setup; no Game Brief yet.
Choice: TypeScript + Vite + Phaser for the web build.
Alternatives: Unity (C#).
Consequence: Tooling (package.json, test runner, balance config) is added when gameplay work starts.

## 2026-11-23 — Switch target stack to Godot 4 (GDScript) for Android
Context: Owner decided to build an Android mobile app and learn a full game engine instead of shipping a web-only build.
Choice: Godot 4.7.2 Standard (GDScript) targeting Android (ARM64, portrait `1080x1920`), keeping core logic in pure `RefCounted` scripts for headless testing.
Alternatives: Phaser 3 + TypeScript (web/Capacitor), Godot 4 .NET (C#), Unity.
Consequence: Supersedes the initial Phaser web decision; Android export template + JDK setup are required for M1/M4 device builds.

## 2026-11-23 — Level generation: Reverse generation with verified witness
Context: Pure random puzzle placement produced 0/150 solvable boards in prior prototyping due to color deadlocks.
Choice: Generate levels backward from the won state (un-collect pots, un-move valid segments, assign incoming vines, then attach mystery/locks only where the reversed witness still wins).
Alternatives: Pre-baked static level packs (high authoring cost), random + heavy solver filtering (too slow and unreliable).
Consequence: Every generated level is 100% guaranteed solvable in < 50 ms on-device, with a built-in witness solution; initial board density and start-flower variety will be tuned during M1–M3.

## 2026-11-23 — Theme pivot: Ball Sort presentation over the same core rules
Context: Owner prefers a classic Ball Sort theme (colored balls in tubes) instead of flowers/ropes while keeping the exact multi-color segment and incoming-column mechanics.
Choice: Rename domain entities to Balls, Tubes, and Target Colors across docs, code, and UI.
Alternatives: Keep floral/rope theme.
Consequence: Simpler, cleaner 2D procedural visuals for M1/M2 (circles + rounded tubes) with identical core puzzle rules.
