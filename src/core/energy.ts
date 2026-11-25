// Energy / Lives system: Max 5 lives, regenerates 1 life every 5 minutes (25 min for full 5).
// Pure TypeScript — zero external dependencies.

export const MAX_LIVES = 5;
export const MAX_DEADLOCK_STRIKES = 3;
export const REGEN_MINUTES = 5;
export const REGEN_INTERVAL_MS = REGEN_MINUTES * 60 * 1000;

export class EnergyState {
  lives: number = MAX_LIVES;
  lastRegenAt: number = Date.now();
  deadlockStrikes: number = 0;

  constructor(lives: number = MAX_LIVES, lastRegenAt: number = Date.now(), deadlockStrikes: number = 0) {
    this.lives = Math.max(0, Math.min(MAX_LIVES, lives));
    this.lastRegenAt = lastRegenAt || Date.now();
    this.deadlockStrikes = Math.max(0, Math.min(MAX_DEADLOCK_STRIKES - 1, deadlockStrikes));
  }

  // Returns true if 3rd deadlock strike was reached and 1 life was deducted
  recordDeadlock(now: number = Date.now()): boolean {
    this.sync(now);
    this.deadlockStrikes++;
    if (this.deadlockStrikes >= MAX_DEADLOCK_STRIKES) {
      this.deadlockStrikes = 0;
      this.consumeLife(now);
      return true;
    }
    return false;
  }

  resetStrikes(): void {
    this.deadlockStrikes = 0;
  }

  sync(now: number = Date.now()): boolean {
    if (this.lives >= MAX_LIVES) {
      this.lives = MAX_LIVES;
      this.lastRegenAt = now;
      return false;
    }
    const elapsed = Math.max(0, now - this.lastRegenAt);
    const gained = Math.floor(elapsed / REGEN_INTERVAL_MS);
    if (gained > 0) {
      this.lives = Math.min(MAX_LIVES, this.lives + gained);
      if (this.lives >= MAX_LIVES) {
        this.lastRegenAt = now;
      } else {
        this.lastRegenAt += gained * REGEN_INTERVAL_MS;
      }
      return true;
    }
    return false;
  }

  hasLife(now: number = Date.now()): boolean {
    this.sync(now);
    return this.lives > 0;
  }

  consumeLife(now: number = Date.now()): boolean {
    this.sync(now);
    if (this.lives <= 0) return false;
    if (this.lives === MAX_LIVES) {
      this.lastRegenAt = now;
    }
    this.lives--;
    return true;
  }

  addLives(amount: number, now: number = Date.now()): void {
    this.sync(now);
    this.lives = Math.min(MAX_LIVES, this.lives + Math.max(0, amount));
    if (this.lives >= MAX_LIVES) {
      this.lastRegenAt = now;
    }
  }

  msUntilNextLife(now: number = Date.now()): number {
    this.sync(now);
    if (this.lives >= MAX_LIVES) return 0;
    return Math.max(0, REGEN_INTERVAL_MS - (now - this.lastRegenAt));
  }

  formatCountdown(now: number = Date.now()): string {
    const ms = this.msUntilNextLife(now);
    if (ms <= 0) return 'FULL';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}
