// SPEC-M3 §2: Adaptive progression and level difficulty management.
// Pure TypeScript — zero external dependencies.

export type LevelDifficultyBadge = 'NORMAL' | 'HARD' | 'VERY_HARD';

export class ProgressionState {
  current_level: number = 1;
  max_unlocked_level: number = 1;
  tier: number = 2; // 1 (easiest) .. 5 (hardest)
  streak: number = 0;
  total_wins: number = 0;
  total_fails: number = 0;

  constructor(currentLevel: number = 1, maxUnlocked: number = 1) {
    this.current_level = currentLevel;
    this.max_unlocked_level = Math.max(currentLevel, maxUnlocked);
  }

  getBadge(): LevelDifficultyBadge {
    if (this.current_level >= 15) {
      if (this.current_level % 10 === 0) return 'VERY_HARD';
      if (this.current_level % 10 === 5) return 'HARD';
    }
    return 'NORMAL';
  }

  onWin(): void {
    this.total_wins++;
    this.streak++;
    this.tier = Math.min(5, this.tier + 1);
    if (this.current_level >= this.max_unlocked_level) {
      this.max_unlocked_level = this.current_level + 1;
    }
    this.current_level++;
  }

  onFail(): void {
    this.total_fails++;
    this.streak = 0;
    this.tier = Math.max(1, this.tier - 2);
  }

  setLevel(levelNum: number): void {
    this.current_level = Math.max(1, Math.min(levelNum, this.max_unlocked_level));
  }
}
