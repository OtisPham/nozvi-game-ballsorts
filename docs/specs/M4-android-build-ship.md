# Spec M4 — Android Build, Mobile UX & Device Verification

> **ID:** SPEC-M4 · **Status:** Approved · **Updated:** 2026-11-23
> **Relates to:** `docs/GDD.md` (§3, §10, §11, §13), `docs/DECISIONS.md`

## 1. Goal & Scope
Deliver a clean, offline-first Android `.apk` build of **NOZVI-GAME-06 — Ball Sort** that installs via USB (`adb`) and runs smoothly at 60 fps on physical Android phones.

**In scope:**
1. Android SafeArea (notch / camera cutout / navigation bar) layout padding.
2. Android hardware/gesture Back button handling (`NOTIFICATION_WM_GO_BACK_REQUEST`).
3. Godot 4.7.2 Android export configuration (`ARM64-v8a`, GL Compatibility, portrait locked, debug keystore).
4. Physical device verification checklist (FPS, touch ergonomics, audio, save persistence, APK size `≤ 50 MB`).

**Out of scope:** Google Play Console upload, signed release AAB, AdMob / IAP SDKs, Play Games cloud save.

---

## 2. Mobile UX Adaptations (`scenes/main.gd`, `scenes/main.tscn`)

### 2.1 Safe Area Support
- On `_ready()` and `NOTIFICATION_RESIZED`, read `DisplayServer.get_display_safe_area()` and `DisplayServer.screen_get_size()`.
- Convert safe-area pixel insets into viewport coordinates (`get_viewport_rect().size`) and apply them as minimum margins on `Main/Margin` (`margin_top = max(72, top_inset + 16)`, `margin_bottom = max(64, bottom_inset + 16)`, left/right `max(36, inset + 12)`).
- On desktop (where safe area equals full screen), default margins remain unchanged.

### 2.2 Android Back Button Handling
- Handle `NOTIFICATION_WM_GO_BACK_REQUEST` in `scenes/main.gd`:
  1. If `DebugOverlay` is visible → close `DebugOverlay`.
  2. Else if `HowToPlayOverlay` is visible → close `HowToPlayOverlay`.
  3. Else if `LevelSelectOverlay` is visible → close `LevelSelectOverlay`.
  4. Else if `SettingsOverlay` is visible → close `SettingsOverlay`.
  5. Else if `MetaOverlay` is visible → close `MetaOverlay`.
  6. Else if `Overlay` (Win / Deadlock / Exit Confirm) is visible and dismissible → close the overlay.
  7. Else if a source tube is currently selected → clear selection.
  8. Else if in-game (`HomeScreen` not visible) → return to `HomeScreen`.
  9. Else (on `HomeScreen`) → show a lightweight **Exit Game?** confirmation overlay (`Cancel` / `Quit`).

### 2.3 Touch Ergonomics
- Verify minimum hit targets (`≥ 100×100` logical px at `1080×1920`, equivalent to `≥ 48 dp` on standard Android density) for `Undo`, `Hint`, `Extra Tube`, `Restart`, `Settings`, `DBG`, and all `BallView` / `TubeView` controls.
- Keep `window/handheld/orientation=1` (portrait) and `input_devices/pointing/emulate_touch_from_mouse=false` (native touch events map to `InputEventMouseButton` in Godot 4 automatically via `emulate_mouse_from_touch=true`).

---

## 3. Android Export Pipeline

### 3.1 Host Prerequisites
1. **Godot 4.7.2 Export Templates:** Install official `Godot_v4.7.2-stable_export_templates.tpz` from GitHub Releases into Godot's export templates directory (`%APPDATA%\Godot\export_templates\4.7.2.stable\`).
2. **Android SDK:** Already present at `C:\Users\kn260\AppData\Local\Android\Sdk` (configure path in Godot Editor Settings → `Export / Android / Android SDK Path`).
3. **JDK Compatibility:** Host currently has JDK 22; Godot 4 Android export recommends **JDK 17** (Eclipse Temurin 17). Verify during first export and install JDK 17 if `apksigner` or Gradle reports incompatibility.
4. **Debug Keystore:** Use standard Android `debug.keystore` for USB testing. Never commit any `.keystore` or `.jks` file to git (`AGENTS.md` §6).

### 3.2 Export Preset (`export_presets.cfg`)
- **Platform:** Android
- **Architecture:** `arm64-v8a` enabled (`armeabi-v7a` disabled to keep APK small; enable only if targeting 32-bit devices).
- **Package ID:** `com.nozvi.ballsort`
- **Version Code / Name:** `1` / `0.1.0`
- **Min SDK:** `24` (Android 7.0) · **Target SDK:** `34`
- **Orientation:** Portrait
- **Renderer:** `gl_compatibility`
- **Output Path:** `builds/android/nozvi-ball-sort-debug.apk` (`builds/` excluded from git).
- **CLI Export Command:**
  ```bash
  Godot_v4.7.2-stable_win64_console.exe --headless --path . --export-debug "Android" builds/android/nozvi-ball-sort-debug.apk
  ```

---

## 4. Device Verification Checklist
Before installing on a physical phone via `adb install`, ask owner confirmation. Then verify:
1. **Build size:** `builds/android/nozvi-ball-sort-debug.apk` is `≤ 50 MB`.
2. **Cold start:** App launches straight to active level in `≤ 3 s` with no black screen or crash.
3. **SafeArea:** Top bar (`LEVEL`, `Collected`, `Sound`, `Restart`) is clear of the camera notch; bottom prop buttons are clear of gesture navigation bar.
4. **Gameplay & Juice:** Smooth 60 fps during multi-ball curved transfers, collection particles, mystery flips, and lock unlocks; SFX audible and mute toggle works.
5. **Back button:** Back gesture clears selection / closes overlay / prompts exit cleanly.
6. **Persistence (from M3):** Make 3 moves, force-close app, relaunch → exact board state and level are restored.
