# Match Score, Stars & Rewards Formula

> **Status:** Approved · **Applies to:** `nozvi-game-ballsorts` (Phaser 3 Web)
> **Source of truth:** `src/core/meta.ts`, `src/scenes/GameScene.ts`

---

## 1. Star Rating (`stars`)

Stars are awarded based on clean completion without recovery power-ups (no time pressure):

```ts
isPerfect = (undos_used === 0 && !extra_used)
```

| Condition | Stars Earned | Label on Victory |
|---|---|---|
| `isPerfect === true` (no Undo, no Extra Tube used) | **3 Stars** | `PERFECT` |
| `isPerfect === false` (used Undo or Extra Tube) | **2 Stars** | `CLEARED` |
| Deadlock / Level Failed | **0 Stars** | `FAILED` |

* **Daily Challenge Bonus:** Completing a Daily Challenge date for the first time grants an extra **`+5` Stars** and **`+50` Coins**.
* **Design Note:** Stars intentionally do **not** depend on completion time so casual players can plan moves without time pressure.

---

## 2. Total Match Score (`TOTAL SCORE`)

Displayed on the **VICTORY!** screen and calculated as:

```ts
parMoves = Math.max(5, total_targets * 3)

totalScore = Math.max(
  1000,
  clearedLevel * 350 +
  stars * 500 +
  Math.max(0, parMoves - moves) * 120 +
  Math.max(0, 120 - elapsedSec) * 15
)
```

### Breakdown
* **Minimum Floor:** `1,000` points.
* **Level Bonus:** `clearedLevel × 350`.
* **Star Bonus:** `stars × 500` (`1,000` for 2★, `1,500` for 3★).
* **Move Efficiency Bonus:** `120` points per move saved under `parMoves`.
* **Speed Bonus:** `15` points per second saved under `120s`.

---

## 3. Coins & Win Streak

* **Win Streak (`winStreak`):** Increments by `+1` on each win; resets to `0` on deadlock/fail.
* **Base Win Coins (`MetaState.rewardWin`):**
  $$\text{baseCoins} = 10 + \min(10,\ \text{winStreak} \times 2)$$
* **Victory Screen Coins (`earnedCoins`):**
  $$\text{earnedCoins} = \text{baseCoins} \times 5$$
* **2X Reward Multiplier:** Clicking **`CLAIM 2X REWARD (WATCH AD)`** doubles `earnedCoins` for that match.
