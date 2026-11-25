import Phaser from 'phaser';
import { StorageService, GameSettings } from '../core/storage';
import { ProgressionState } from '../core/progression';
import { MetaState, THEMES } from '../core/meta';
import { SoundManager } from '../audio/sound';
import { CORE_UI_COLORS } from '../config/ui_colors';
import { EnergyState, MAX_LIVES, REGEN_MINUTES } from '../core/energy';

export class HomeScene extends Phaser.Scene {
  private progression!: ProgressionState;
  private meta!: MetaState;
  private settings!: GameSettings;
  private energy!: EnergyState;
  private soundMgr!: SoundManager;
  private activeModal: Phaser.GameObjects.Container | null = null;
  private coinsText!: Phaser.GameObjects.Text;
  private starsText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;

  constructor() {
    super('HomeScene');
  }

  create() {
    const data = StorageService.load();
    this.progression = data.progression;
    this.meta = data.meta;
    this.settings = data.settings;
    this.energy = data.energy;
    this.soundMgr = new SoundManager(this.settings.soundEnabled);

    this.cameras.main.setBackgroundColor(0x0c111d);

    this.buildTopBar();
    this.buildTitle();
    this.buildSideIcons();
    this.buildShowcaseCard();
    this.buildPlaySection();
    this.buildLeagueBanner();
    this.buildBottomNav('play');

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.refreshEnergyLabel()
    });
  }

  private refreshEnergyLabel() {
    if (!this.energyText) return;
    this.energy.sync();
    const label = this.energy.lives >= MAX_LIVES
      ? `⚡ ${this.energy.lives}`
      : `⚡ ${this.energy.lives} (${this.energy.formatCountdown()})`;
    this.energyText.setText(label);
  }

  private tryLaunchGame(level: number, dailyDate: string = '') {
    if (!this.energy.hasLife()) {
      this.showOutOfLivesModal();
      return;
    }
    this.scene.start('GameScene', dailyDate ? { level, dailyDate } : { level });
  }

  private buildTopBar() {
    const g = this.add.graphics();

    // Compact Circular Avatar Icon (left, no long name text)
    g.fillStyle(0x161f30, 0.98);
    g.fillCircle(56, 56, 32);
    g.lineStyle(2.5, 0x00f5d4, 1);
    g.strokeCircle(56, 56, 32);
    this.add.text(56, 54, '🐧', { fontSize: '30px' }).setOrigin(0.5);

    // Lv badge tucked at bottom of avatar
    g.fillStyle(0xf59e0b, 1);
    g.fillRoundedRect(30, 76, 52, 20, 10);
    this.add.text(56, 86, `Lv.${this.progression.current_level}`, {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#1e1b18'
    }).setOrigin(0.5);

    // Lives / Energy Pill
    g.fillStyle(0x161f30, 0.95);
    g.fillRoundedRect(108, 30, 152, 52, 26);
    g.lineStyle(1.5, 0x2a3854, 1);
    g.strokeRoundedRect(108, 30, 152, 52, 26);
    this.energyText = this.add.text(184, 56, '⚡ 5', {
      fontFamily: 'sans-serif',
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#00f5d4'
    }).setOrigin(0.5);
    this.refreshEnergyLabel();

    // Coins Pill
    g.fillStyle(0x161f30, 0.95);
    g.fillRoundedRect(276, 30, 210, 52, 26);
    g.lineStyle(1.5, 0x2a3854, 1);
    g.strokeRoundedRect(276, 30, 210, 52, 26);
    this.add.text(306, 56, '🪙', { fontSize: '22px' }).setOrigin(0.5);
    this.coinsText = this.add.text(378, 56, this.meta.coins.toLocaleString('en-US'), {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    g.fillStyle(0x00e5be, 1);
    g.fillCircle(460, 56, 15);
    this.add.text(460, 55, '+', { fontSize: '19px', fontStyle: 'bold', color: '#072a23' }).setOrigin(0.5);

    // Stars Pill
    g.fillStyle(0x161f30, 0.95);
    g.fillRoundedRect(502, 30, 198, 52, 26);
    g.lineStyle(1.5, 0x2a3854, 1);
    g.strokeRoundedRect(502, 30, 198, 52, 26);
    this.add.text(532, 56, '⭐', { fontSize: '22px' }).setOrigin(0.5);
    this.starsText = this.add.text(598, 56, `${this.meta.stars}`, {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    g.fillStyle(0x00e5be, 1);
    g.fillCircle(674, 56, 15);
    this.add.text(674, 55, '+', { fontSize: '19px', fontStyle: 'bold', color: '#072a23' }).setOrigin(0.5);
  }

  private buildTitle() {
    const g = this.add.graphics();
    g.fillStyle(0x162238, 1);
    g.fillRoundedRect(175, 114, 370, 34, 17);
    g.lineStyle(1.5, 0x2b3e5e, 1);
    g.strokeRoundedRect(175, 114, 370, 34, 17);

    this.add.text(360, 131, '❄️  FROST SEASON CHAPTER 2  ✨', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#a8dadc'
    }).setOrigin(0.5);

    this.add.text(360, 190, 'BALL SORT', {
      fontFamily: 'sans-serif',
      fontSize: '56px',
      fontStyle: 'bold',
      color: '#3ef2dc'
    }).setOrigin(0.5);

    this.add.text(360, 236, '★   Q U E S T   ★', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffd166'
    }).setOrigin(0.5);
  }

  private buildShowcaseCard() {
    const g = this.add.graphics();
    g.fillStyle(0x141d2e, 0.96);
    g.fillRoundedRect(32, 266, 656, 360, 24);
    g.lineStyle(1.5, 0x283652, 1);
    g.strokeRoundedRect(32, 266, 656, 360, 24);

    // 2 Glass showcase tubes
    const drawShowcaseTube = (tx: number, ballIndices: number[]) => {
      g.fillStyle(0x0c1320, 0.9);
      g.fillRoundedRect(tx - 42, 294, 84, 224, { tl: 6, tr: 6, bl: 42, br: 42 });
      g.lineStyle(2.5, 0x3b4d6e, 0.7);
      g.strokeRoundedRect(tx - 42, 294, 84, 224, { tl: 6, tr: 6, bl: 42, br: 42 });

      const theme = this.meta.getTheme();
      ballIndices.forEach((bIdx, i) => {
        const key = theme.useImageSkin
          ? `ball_${theme.id}_${bIdx}`
          : `ball_${theme.id}_${bIdx}`;
        const sp = this.add.sprite(tx, 480 - i * 64, key);
        sp.setDisplaySize(58, 58);
      });
    };

    drawShowcaseTube(175, [0, 0, 3]);
    drawShowcaseTube(545, [6, 6, 1]);

    // Cute Snowman centerpiece
    const sm = this.add.container(360, 420);
    const smG = this.add.graphics();
    smG.fillStyle(0xf0f8ff, 1);
    smG.fillCircle(0, 18, 28);
    smG.fillCircle(0, -18, 20);
    smG.fillStyle(0x2b59c3, 1);
    smG.fillRoundedRect(-18, -2, 36, 9, 4);
    smG.fillStyle(0x1e293b, 1);
    smG.fillRoundedRect(-14, -46, 28, 16, 4);
    smG.fillRoundedRect(-22, -34, 44, 5, 2);
    smG.fillStyle(0x0f172a, 1);
    smG.fillCircle(-6, -22, 2.5);
    smG.fillCircle(6, -22, 2.5);
    smG.fillStyle(0xff7b00, 1);
    smG.fillTriangle(0, -18, 0, -13, -11, -16);
    sm.add(smG);

    this.tweens.add({
      targets: sm,
      y: 412,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Sort & Chill pill
    g.fillStyle(0x0e1522, 1);
    g.fillRoundedRect(290, 474, 140, 30, 15);
    this.add.text(360, 489, 'Sort & Chill!', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    // Event Progress sub-bar
    g.fillStyle(0x0f1624, 1);
    g.fillRoundedRect(54, 534, 612, 72, 16);
    g.fillStyle(0x1c273b, 1);
    g.fillRoundedRect(68, 548, 44, 44, 10);
    this.add.text(90, 570, '👑', { fontSize: '22px' }).setOrigin(0.5);

    this.add.text(126, 558, 'Frost Wonderland ...', {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0, 0.5);

    // 12d pill
    g.fillStyle(0x3a242c, 1);
    g.fillRoundedRect(310, 546, 48, 22, 11);
    this.add.text(334, 557, '12d', {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#ff9aa2'
    }).setOrigin(0.5);

    // Progress bar
    g.fillStyle(0x1f2b40, 1);
    g.fillRoundedRect(126, 578, 232, 10, 5);
    g.fillStyle(0x00e5be, 1);
    g.fillRoundedRect(126, 578, 128, 10, 5);

    // Tier Claim button
    const claimBtn = this.add.container(564, 570);
    const cBg = this.add.graphics();
    cBg.fillStyle(0x00e5be, 1);
    cBg.fillRoundedRect(-82, -22, 164, 44, 12);
    const cTxt = this.add.text(0, 0, 'Tier Claim', {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#062620'
    }).setOrigin(0.5);
    claimBtn.add([cBg, cTxt]);
    claimBtn.setSize(164, 44).setInteractive({ useHandCursor: true });
    claimBtn.on('pointerdown', () => {
      this.soundMgr.playCollect();
      this.meta.coins += 25;
      StorageService.save(this.progression, this.meta, this.settings);
      this.coinsText.setText(this.meta.coins.toLocaleString('en-US'));
      cTxt.setText('✓ Claimed!');
    });
  }

  private buildPlaySection() {
    const badge = this.progression.getBadge();
    const diffStr = badge === 'VERY_HARD' ? 'Very Hard' : badge === 'HARD' ? 'Hard' : 'Normal';

    // 1. Left Main Button: PLAY LEVEL N
    const playBtn = this.add.container(192, 696);
    const pBg = this.add.graphics();
    pBg.fillStyle(0x009e82, 1);
    pBg.fillRoundedRect(-156, -44, 312, 92, 20);
    pBg.fillStyle(0x1cf2c9, 1);
    pBg.fillRoundedRect(-156, -48, 312, 86, 20);
    playBtn.add(pBg);

    const playTitle = this.add.text(-132, -16, `▶  LEVEL ${this.progression.current_level}`, {
      fontFamily: 'sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#062620'
    }).setOrigin(0, 0.5);
    const playSub = this.add.text(-132, 14, `Độ khó: ${diffStr}`, {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#0a4a3f'
    }).setOrigin(0, 0.5);

    playBtn.add([playTitle, playSub]);
    playBtn.setSize(312, 92).setInteractive({ useHandCursor: true });
    playBtn.on('pointerdown', () => {
      this.soundMgr.playSelect();
      this.tryLaunchGame(this.progression.current_level);
    });

    // 2. Right Main Button: DAILY CHALLENGE
    const today = new Date().toISOString().slice(0, 10);
    const dailyDone = this.meta.isDailyCompleted(today);

    const dailyBtn = this.add.container(528, 696);
    const dBg = this.add.graphics();
    dBg.fillStyle(dailyDone ? 0x2b3a4a : 0xc59225, 1);
    dBg.fillRoundedRect(-156, -44, 312, 92, 20);
    dBg.fillStyle(dailyDone ? 0x3b4d63 : 0xf6d365, 1);
    dBg.fillRoundedRect(-156, -48, 312, 86, 20);
    dailyBtn.add(dBg);

    const dailyTitle = this.add.text(-132, -16, dailyDone ? '📅  DAILY  ✅' : '📅  DAILY', {
      fontFamily: 'sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: dailyDone ? '#00f5d4' : '#3b2606'
    }).setOrigin(0, 0.5);
    const dailySub = this.add.text(-132, 14, dailyDone ? `Đã xong (${today})` : `Mới mỗi ngày (+50 🪙)`, {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: dailyDone ? '#cbd5e1' : '#5c3c09'
    }).setOrigin(0, 0.5);

    dailyBtn.add([dailyTitle, dailySub]);
    dailyBtn.setSize(312, 92).setInteractive({ useHandCursor: true });
    dailyBtn.on('pointerdown', () => {
      this.soundMgr.playSelect();
      this.tryLaunchGame(15, today);
    });

    // 3. Secondary Wide Button: LEVEL MAP
    const mapBtn = this.add.container(360, 788);
    const mBg = this.add.graphics();
    mBg.fillStyle(0x161f30, 1);
    mBg.fillRoundedRect(-324, -26, 648, 52, 16);
    mBg.lineStyle(1.5, 0x283652, 1);
    mBg.strokeRoundedRect(-324, -26, 648, 52, 16);
    const mTxt = this.add.text(0, 0, '🧭  XEM BẢN ĐỒ CÁC MÀN (LEVEL MAP)', {
      fontFamily: 'sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#e2e8f0'
    }).setOrigin(0.5);
    mapBtn.add([mBg, mTxt]);
    mapBtn.setSize(648, 52).setInteractive({ useHandCursor: true });
    mapBtn.on('pointerdown', () => {
      this.soundMgr.playSelect();
      this.scene.start('MapScene');
    });
  }

  private buildSideIcons() {
    // 2 compact floating side icon buttons (Left: Daily Gift, Right: Skins)
    const sideBtns = [
      { x: 68, y: 196, icon: '🎁', label: 'Gift', badgeCol: 0xe63946, action: () => this.claimDailyGift() },
      { x: 652, y: 196, icon: '🎨', label: 'Skins', badgeCol: 0x00bbf9, action: () => this.showSkinSelectorModal() }
    ];

    sideBtns.forEach(sb => {
      const cont = this.add.container(sb.x, sb.y);
      const bg = this.add.graphics();
      bg.fillStyle(0x161f30, 0.96);
      bg.fillCircle(0, 0, 30);
      bg.lineStyle(2, sb.badgeCol, 0.85);
      bg.strokeCircle(0, 0, 30);
      cont.add(bg);

      const ic = this.add.text(0, -2, sb.icon, { fontSize: '26px' }).setOrigin(0.5);
      const lb = this.add.text(0, 40, sb.label, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#a8dadc'
      }).setOrigin(0.5);
      cont.add([ic, lb]);

      // Small notification dot
      const dot = this.add.circle(21, -21, 6, sb.badgeCol, 1);
      cont.add(dot);

      cont.setSize(64, 64).setInteractive({ useHandCursor: true });
      cont.on('pointerdown', () => {
        this.soundMgr.playSelect();
        sb.action();
      });
    });
  }

  private claimDailyGift() {
    this.soundMgr.playCollect();
    this.meta.coins += 50;
    StorageService.save(this.progression, this.meta, this.settings);
    this.coinsText.setText(this.meta.coins.toLocaleString('en-US'));
  }

  private buildLeagueBanner() {
    const g = this.add.graphics();
    g.fillStyle(0x161f30, 1);
    g.fillRoundedRect(32, 876, 656, 76, 18);
    g.lineStyle(1.5, 0x283652, 1);
    g.strokeRoundedRect(32, 876, 656, 76, 18);

    this.add.text(360, 914, `🔥 Chuỗi thắng: ${this.meta.winStreak}   ·   🏆 Kỷ lục: ${this.meta.bestStreak}   ·   ⭐ Tổng sao: ${this.meta.stars}`, {
      fontFamily: 'sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#ffd166'
    }).setOrigin(0.5);
  }

  private buildBottomNav(activeTab: 'shop' | 'events' | 'play' | 'map' | 'settings') {
    const g = this.add.graphics();
    g.fillStyle(0x0f1624, 0.98);
    g.fillRoundedRect(16, 1134, 688, 120, 26);
    g.lineStyle(1.5, 0x25324d, 1);
    g.strokeRoundedRect(16, 1134, 688, 120, 26);

    const tabs: { id: string; x: number; icon: string; label: string; action: () => void }[] = [
      { id: 'shop', x: 90, icon: '🏪', label: 'Shop', action: () => this.showSkinSelectorModal() },
      { id: 'events', x: 225, icon: '🎉', label: 'Events', action: () => this.tryLaunchGame(15, new Date().toISOString().slice(0, 10)) },
      { id: 'play', x: 360, icon: '🏠', label: 'Play', action: () => {} },
      { id: 'map', x: 495, icon: '🧭', label: 'Map', action: () => this.scene.start('MapScene') },
      { id: 'settings', x: 630, icon: '⚙️', label: 'Game', action: () => this.tryLaunchGame(this.progression.current_level) }
    ];

    tabs.forEach(t => {
      const isAct = t.id === activeTab;
      const tc = this.add.container(t.x, 1194);
      if (isAct) {
        const actBg = this.add.graphics();
        actBg.fillStyle(0x1c283d, 1);
        actBg.fillRoundedRect(-50, -56, 100, 106, 20);
        actBg.fillStyle(0x00e5be, 1);
        actBg.fillCircle(0, -24, 28);
        tc.add(actBg);
      }

      const ic = this.add.text(0, isAct ? -24 : -14, t.icon, { fontSize: isAct ? '26px' : '24px' }).setOrigin(0.5);
      const lb = this.add.text(0, 28, t.label, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: isAct ? '#ffffff' : '#8b9ab0'
      }).setOrigin(0.5);
      tc.add([ic, lb]);
      tc.setSize(100, 100).setInteractive({ useHandCursor: true });
      tc.on('pointerdown', () => {
        this.soundMgr.playSelect();
        t.action();
      });
    });
  }

  private showSkinSelectorModal() {
    if (this.activeModal) {
      this.activeModal.destroy();
      this.activeModal = null;
    }
    const m = this.add.container(360, 640);
    m.setDepth(500);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.82);
    bg.fillRect(-360, -640, 720, 1280);
    bg.fillStyle(0x161b26, 0.98);
    bg.fillRoundedRect(-290, -390, 580, 780, 24);
    bg.lineStyle(3, CORE_UI_COLORS.gold, 0.8);
    bg.strokeRoundedRect(-290, -390, 580, 780, 24);
    m.add(bg);

    m.add(this.add.text(0, -335, '🎨 CHỌN SKIN BÓNG', {
      fontSize: '28px',
      fontStyle: 'bold',
      color: CORE_UI_COLORS.goldHex
    }).setOrigin(0.5));

    THEMES.forEach((t, idx) => {
      const cy = -215 + idx * 145;
      const isActive = this.meta.activeTheme === t.id;
      const card = this.add.container(0, cy);
      const cardBg = this.add.graphics();
      cardBg.fillStyle(isActive ? 0x1d3557 : 0x222938, 1);
      cardBg.fillRoundedRect(-250, -58, 500, 116, 16);
      cardBg.lineStyle(isActive ? 3 : 1, isActive ? 0x00f5d4 : 0xffffff, isActive ? 1 : 0.25);
      cardBg.strokeRoundedRect(-250, -58, 500, 116, 16);
      card.add(cardBg);

      const labelName = t.id === 'classic_glass' ? 'Classic Casual (Bóng Màu)' : t.name;
      card.add(this.add.text(-225, -36, labelName, { fontSize: '21px', fontStyle: 'bold', color: '#ffffff' }));
      card.add(this.add.text(225, -34, isActive ? '✅ ĐANG DÙNG' : 'CHỌN ➔', {
        fontSize: '16px',
        fontStyle: 'bold',
        color: isActive ? '#00f5d4' : '#ffd166'
      }).setOrigin(1, 0));

      for (let p = 0; p < 5; p++) {
        const sp = this.add.sprite(-195 + p * 60, 20, `ball_${t.id}_${p}`).setDisplaySize(46, 46);
        card.add(sp);
      }

      card.setSize(500, 116).setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => {
        this.meta.activeTheme = t.id;
        this.soundMgr.playSelect();
        StorageService.save(this.progression, this.meta, this.settings);
        m.destroy();
        this.activeModal = null;
        this.scene.restart();
      });
      m.add(card);
    });

    const closeBtn = this.add.text(0, 340, '✕ ĐÓNG', { fontSize: '22px', color: '#cccccc' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      m.destroy();
      this.activeModal = null;
    });
    m.add(closeBtn);
    this.activeModal = m;
  }

  private showOutOfLivesModal() {
    if (this.activeModal) {
      this.activeModal.destroy();
      this.activeModal = null;
    }
    const m = this.add.container(360, 640);
    m.setDepth(500);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRect(-360, -640, 720, 1280);
    bg.fillStyle(0x1b2232, 0.98);
    bg.fillRoundedRect(-260, -280, 520, 560, 26);
    bg.lineStyle(2.5, 0xff5400, 0.9);
    bg.strokeRoundedRect(-260, -280, 520, 560, 26);
    m.add(bg);

    m.add(this.add.text(0, -220, '⚡ HẾT MẠNG RỒI!', {
      fontFamily: 'sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#ff5400'
    }).setOrigin(0.5));

    m.add(this.add.text(0, -160, `Tối đa ${MAX_LIVES} mạng · Mỗi ${REGEN_MINUTES} phút tự hồi 1 mạng`, {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#a8dadc'
    }).setOrigin(0.5));

    const timerTxt = this.add.text(0, -100, `⏱️ Hồi 1 mạng sau: ${this.energy.formatCountdown()}`, {
      fontFamily: 'sans-serif',
      fontSize: '25px',
      fontStyle: 'bold',
      color: '#ffd166'
    }).setOrigin(0.5);
    m.add(timerTxt);

    const tEvt = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (!this.activeModal) {
          tEvt.destroy();
          return;
        }
        if (this.energy.hasLife()) {
          tEvt.destroy();
          m.destroy();
          this.activeModal = null;
          this.refreshEnergyLabel();
          return;
        }
        timerTxt.setText(`⏱️ Hồi 1 mạng sau: ${this.energy.formatCountdown()}`);
      }
    });

    const adBtn = this.add.container(0, 0);
    const adBg = this.add.graphics();
    adBg.fillStyle(0x3ba55d, 1);
    adBg.fillRoundedRect(-210, -32, 420, 64, 16);
    adBtn.add([adBg, this.add.text(0, 0, '▶  XEM QUẢNG CÁO (+1 MẠNG)', {
      fontFamily: 'sans-serif',
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5)]);
    adBtn.setSize(420, 64).setInteractive({ useHandCursor: true });
    adBtn.on('pointerdown', () => {
      tEvt.destroy();
      this.energy.addLives(1);
      StorageService.save(this.progression, this.meta, this.settings, this.energy);
      this.soundMgr.playCollect();
      m.destroy();
      this.activeModal = null;
      this.refreshEnergyLabel();
    });
    m.add(adBtn);

    const canBuy = this.meta.coins >= 100;
    const coinBtn = this.add.container(0, 84);
    const cBg = this.add.graphics();
    cBg.fillStyle(canBuy ? 0xf6d365 : 0x4a5568, 1);
    cBg.fillRoundedRect(-210, -32, 420, 64, 16);
    coinBtn.add([cBg, this.add.text(0, 0, '🪙  HỒI ĐẦY 5 MẠNG (100 COINS)', {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: canBuy ? '#3b2606' : '#a0aec0'
    }).setOrigin(0.5)]);
    if (canBuy) {
      coinBtn.setSize(420, 64).setInteractive({ useHandCursor: true });
      coinBtn.on('pointerdown', () => {
        tEvt.destroy();
        this.meta.coins -= 100;
        this.energy.addLives(MAX_LIVES);
        StorageService.save(this.progression, this.meta, this.settings, this.energy);
        this.soundMgr.playCollect();
        this.coinsText.setText(this.meta.coins.toLocaleString('en-US'));
        m.destroy();
        this.activeModal = null;
        this.refreshEnergyLabel();
      });
    }
    m.add(coinBtn);

    const closeBtn = this.add.text(0, 195, '✕ ĐÓNG', { fontSize: '20px', color: '#cccccc' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      tEvt.destroy();
      m.destroy();
      this.activeModal = null;
    });
    m.add(closeBtn);
    this.activeModal = m;
  }
}
