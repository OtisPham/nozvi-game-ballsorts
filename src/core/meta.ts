// SPEC-M3 / GDD §8: Meta state (Streak, Coins, Daily Challenge, Themes).
// Pure TypeScript — zero external dependencies.

import { EventThemePalette } from '../config/ui_colors';

export interface ThemeDefinition extends EventThemePalette {
  id: string;
  name: string;
  cost: number;
  unlocked: boolean;
  useImageSkin?: boolean;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'classic_glass',
    name: 'Classic Glass',
    cost: 0,
    unlocked: true,
    bg: '#171c26',
    hudBg: 0x0a0d14,
    modalBg: 0x161b26,
    accent: 0x00bbf9,
    tubeGlass: 0xffffff,
    tubeGlassAlpha: 0.08,
    tubeBorder: 0xffffff,
    tubeBorderAlpha: 0.45,
    ballColors: [
      '#e63946', // 0: Red
      '#457b9d', // 1: Steel Blue
      '#2a9d8f', // 2: Teal
      '#e76f51', // 3: Orange
      '#e9c46a', // 4: Gold
      '#a8dadc', // 5: Light Cyan
      '#9b5de5', // 6: Purple
      '#00bbf9', // 7: Vivid Sky
      '#00f5d4'  // 8: Mint
    ]
  },
  {
    id: 'neon_dark',
    name: 'Neon Dark',
    cost: 50,
    unlocked: false,
    bg: '#0a0d14',
    hudBg: 0x05070b,
    modalBg: 0x0e131f,
    accent: 0x00f5d4,
    tubeGlass: 0x00f5d4,
    tubeGlassAlpha: 0.07,
    tubeBorder: 0x00f5d4,
    tubeBorderAlpha: 0.6,
    ballColors: [
      '#ff0055', // 0
      '#00e5ff', // 1
      '#39ff14', // 2
      '#ffaa00', // 3
      '#ffff00', // 4
      '#bf00ff', // 5
      '#ff00b7', // 6
      '#0077ff', // 7
      '#00ffaa'  // 8
    ]
  },
  {
    id: 'pastel_candy',
    name: 'Pastel Candy',
    cost: 100,
    unlocked: false,
    bg: '#2b213a',
    hudBg: 0x1e162a,
    modalBg: 0x261d34,
    accent: 0xffc8dd,
    tubeGlass: 0xffc8dd,
    tubeGlassAlpha: 0.12,
    tubeBorder: 0xffc8dd,
    tubeBorderAlpha: 0.5,
    ballColors: [
      '#ff9aa2', // 0
      '#ffb7b2', // 1
      '#ffdac1', // 2
      '#e2f0cb', // 3
      '#b5ead7', // 4
      '#c7ceea', // 5
      '#f3c4fb', // 6
      '#d0f4de', // 7
      '#fcf6bd'  // 8
    ]
  },
  {
    id: 'christmas',
    name: 'Christmas Holiday',
    cost: 0,
    unlocked: true,
    useImageSkin: true,
    bg: '#102520',
    hudBg: 0x091714,
    modalBg: 0x132b24,
    accent: 0xffd166,
    tubeGlass: 0xffffff,
    tubeGlassAlpha: 0.1,
    tubeBorder: 0xffe6aa,
    tubeBorderAlpha: 0.55,
    ballColors: [
      '#e63946', // 0: Candy Cane Heart (Red)
      '#2b59c3', // 1: Blue Gift Box
      '#1b8a3a', // 2: Green Ornament
      '#f48c06', // 3: Gingerbread Man (Orange)
      '#ffd100', // 4: Gold Snowflake Coin
      '#7b2cbf', // 5: Purple Stocking
      '#00b4d8', // 6: Ice Holly Leaves (Cyan)
      '#ff70a6', // 7: Pink Lollipop
      '#2ec4b6'  // 8: Mint Candy
    ]
  }
];

export class MetaState {
  coins: number = 0;
  stars: number = 0;
  winStreak: number = 0;
  bestStreak: number = 0;
  activeTheme: string = 'classic_glass';
  unlockedThemes: string[] = ['classic_glass'];
  dailyCompletedDates: string[] = [];

  rewardWin(isPerfect: boolean = false): { coins: number; stars: number } {
    this.winStreak++;
    this.bestStreak = Math.max(this.bestStreak, this.winStreak);
    const coinsWon = 10 + Math.min(10, this.winStreak * 2);
    const starsWon = isPerfect ? 3 : 2;
    this.coins += coinsWon;
    this.stars += starsWon;
    return { coins: coinsWon, stars: starsWon };
  }

  unlockTheme(id: string): boolean {
    const t = THEMES.find(x => x.id === id);
    if (!t || this.unlockedThemes.includes(id)) return false;
    if (this.coins >= t.cost) {
      this.coins -= t.cost;
      this.unlockedThemes.push(id);
      return true;
    }
    return false;
  }

  setTheme(id: string): boolean {
    if (this.unlockedThemes.includes(id)) {
      this.activeTheme = id;
      return true;
    }
    return false;
  }

  getTheme(): ThemeDefinition {
    return THEMES.find(t => t.id === this.activeTheme) || THEMES[0];
  }

  isDailyCompleted(dateStr: string): boolean {
    return this.dailyCompletedDates.includes(dateStr);
  }

  markDailyCompleted(dateStr: string): void {
    if (!this.dailyCompletedDates.includes(dateStr)) {
      this.dailyCompletedDates.push(dateStr);
      this.coins += 50;
      this.stars += 5;
    }
  }
}
