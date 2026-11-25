// Local Storage Persistence for game progress & settings.
// Pure TypeScript.

import { ProgressionState } from './progression';
import { MetaState } from './meta';
import { EnergyState, MAX_LIVES } from './energy';

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled?: boolean;
  colorBlindSymbols: boolean;
  userToggledSymbols?: boolean;
  hapticsEnabled: boolean;
  dailyReminders?: boolean;
  language?: 'en' | 'vi';
}

export class StorageService {
  private static readonly SAVE_KEY = 'nozvi_ballsort_save_v1';

  static load(): {
    progression: ProgressionState;
    meta: MetaState;
    settings: GameSettings;
    energy: EnergyState;
  } {
    const defaultSettings: GameSettings = {
      soundEnabled: true,
      musicEnabled: true,
      colorBlindSymbols: false,
      userToggledSymbols: false,
      hapticsEnabled: true,
      dailyReminders: true,
      language: 'en'
    };

    const prog = new ProgressionState(1, 1);
    const meta = new MetaState();
    const energy = new EnergyState(MAX_LIVES, Date.now());

    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      if (!raw) {
        return { progression: prog, meta, settings: defaultSettings, energy };
      }
      const data = JSON.parse(raw);
      if (data.progression) {
        prog.current_level = data.progression.current_level || 1;
        prog.max_unlocked_level = data.progression.max_unlocked_level || 1;
        prog.tier = data.progression.tier || 2;
        prog.streak = data.progression.streak || 0;
        prog.total_wins = data.progression.total_wins || 0;
        prog.total_fails = data.progression.total_fails || 0;
      }
      if (data.meta) {
        meta.coins = data.meta.coins || 0;
        meta.stars = data.meta.stars || 0;
        meta.winStreak = data.meta.winStreak || 0;
        meta.bestStreak = data.meta.bestStreak || 0;
        meta.activeTheme = data.meta.activeTheme || 'classic_glass';
        meta.unlockedThemes = data.meta.unlockedThemes || ['classic_glass'];
        meta.dailyCompletedDates = data.meta.dailyCompletedDates || [];
      }
      if (data.energy) {
        energy.lives = typeof data.energy.lives === 'number' ? data.energy.lives : MAX_LIVES;
        energy.lastRegenAt = data.energy.lastRegenAt || Date.now();
        energy.deadlockStrikes = data.energy.deadlockStrikes || 0;
        energy.sync();
      }
      const settings: GameSettings = {
        ...defaultSettings,
        ...(data.settings || {})
      };
      if (!settings.userToggledSymbols) {
        settings.colorBlindSymbols = false;
      }
      return { progression: prog, meta, settings, energy };
    } catch {
      return { progression: prog, meta, settings: defaultSettings, energy };
    }
  }

  static save(
    progression: ProgressionState,
    meta: MetaState,
    settings: GameSettings,
    energy?: EnergyState
  ): void {
    try {
      const payload: any = {
        progression: {
          current_level: progression.current_level,
          max_unlocked_level: progression.max_unlocked_level,
          tier: progression.tier,
          streak: progression.streak,
          total_wins: progression.total_wins,
          total_fails: progression.total_fails
        },
        meta: {
          coins: meta.coins,
          stars: meta.stars,
          winStreak: meta.winStreak,
          bestStreak: meta.bestStreak,
          activeTheme: meta.activeTheme,
          unlockedThemes: meta.unlockedThemes,
          dailyCompletedDates: meta.dailyCompletedDates
        },
        settings
      };
      if (energy) {
        payload.energy = {
          lives: energy.lives,
          lastRegenAt: energy.lastRegenAt,
          deadlockStrikes: energy.deadlockStrikes
        };
      } else {
        // Preserve existing energy if omitted by a caller
        const prevRaw = localStorage.getItem(this.SAVE_KEY);
        if (prevRaw) {
          const prev = JSON.parse(prevRaw);
          if (prev.energy) payload.energy = prev.energy;
        }
      }
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save to localStorage', e);
    }
  }

  static reset(): void {
    try {
      localStorage.removeItem(this.SAVE_KEY);
    } catch (e) {
      console.warn('Failed to reset localStorage', e);
    }
  }
}
