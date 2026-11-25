// Centralized Core UI Color Tokens (Hệ thống màu UI chính).
// Semantic & functional colors stay consistent across all events.

export const CORE_UI_COLORS = {
  // Text
  textPrimary: '#ffffff',
  textSecondary: '#dbe4f0',
  textMuted: '#888888',

  // Semantic / Status
  success: 0x00f5d4,
  successHex: '#00f5d4',
  gold: 0xffd166,
  goldHex: '#ffd166',
  info: 0x00bbf9,
  infoHex: '#00bbf9',
  warning: 0xff5400,
  warningHex: '#ff5400',
  danger: 0xe63946,
  dangerHex: '#e63946',

  // Functional Action Buttons (Undo, Hint, +Tube)
  btnUndoBg: 0x212529,
  btnHintBg: 0x0077b6,
  btnHintBorder: 0x00b4d8,
  btnExtraTubeBg: 0x2b9348,
  btnExtraTubeBorder: 0x55a630,

  // Overlays & Cards
  backdropAlpha: 0.8,
  cardBg: 0x222938,
  lockBadgeBg: 0x1b202c
} as const;

// Per-Event Theme Palette (Mỗi sự kiện ghi đè các màu trang trí này)
export interface EventThemePalette {
  bg: string;          // Nền bàn chơi
  hudBg: number;       // Nền thanh HUD trên
  modalBg: number;     // Nền khung popup/modal
  accent: number;      // Màu viền/nhấn chủ đạo của sự kiện
  tubeGlass: number;   // Màu kính ống nghiệm
  tubeGlassAlpha: number;
  tubeBorder: number;  // Màu viền ống nghiệm
  tubeBorderAlpha: number;
  ballColors: string[]; // 9 màu đại diện (0..8)
}
