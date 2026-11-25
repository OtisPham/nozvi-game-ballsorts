import Phaser from 'phaser';
import { StorageService, GameSettings } from '../core/storage';
import { ProgressionState } from '../core/progression';
import { MetaState } from '../core/meta';
import { SoundManager } from '../audio/sound';
import { EnergyState, MAX_LIVES } from '../core/energy';

export class MapScene extends Phaser.Scene {
  private progression!: ProgressionState;
  private meta!: MetaState;
  private settings!: GameSettings;
  private energy!: EnergyState;
  private soundMgr!: SoundManager;

  private mapContainer!: Phaser.GameObjects.Container;
  private selectedStage: number = 1;
  private stageTitleTxt!: Phaser.GameObjects.Text;
  private stageSubTxt!: Phaser.GameObjects.Text;
  private scrollY: number = 0;
  private minScrollY: number = 0;
  private maxScrollY: number = 0;

  constructor() {
    super('MapScene');
  }

  create() {
    const data = StorageService.load();
    this.progression = data.progression;
    this.meta = data.meta;
    this.settings = data.settings;
    this.energy = data.energy;
    this.soundMgr = new SoundManager(this.settings.soundEnabled);

    this.selectedStage = this.progression.current_level;
    this.cameras.main.setBackgroundColor(0x0b111c);

    this.buildScrollableMap();
    this.buildTopOverlayBar();
    this.buildStagePreviewBar();
    this.buildBottomNav();
    this.setupScrollControls();
  }

  private buildScrollableMap() {
    this.mapContainer = this.add.container(0, 0);

    const totalNodes = Math.max(20, this.progression.max_unlocked_level + 6);
    const stepY = 175;
    const baseY = 980;

    // Compute S-curve coordinates (Level 1 at bottom -> Level N at top)
    const points: { lv: number; x: number; y: number }[] = [];
    for (let i = 0; i < totalNodes; i++) {
      const lv = i + 1;
      const x = 360 + Math.sin(i * 0.85) * 185;
      const y = baseY - i * stepY;
      points.push({ lv, x, y });
    }

    // Background ambient stars/dots
    const bgG = this.add.graphics();
    for (let i = 0; i < totalNodes * 3; i++) {
      const rx = 40 + ((i * 197) % 640);
      const ry = baseY + 120 - i * 62;
      const col = i % 3 === 0 ? 0x00f5d4 : i % 3 === 1 ? 0xffd166 : 0xff758f;
      bgG.fillStyle(col, 0.35);
      bgG.fillCircle(rx, ry, (i % 3) + 2);
    }
    this.mapContainer.add(bgG);

    // Draw winding S-curve path segments
    const pathG = this.add.graphics();
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const isUnlockedSeg = p2.lv <= this.progression.max_unlocked_level;

      // Outer glow for unlocked path
      if (isUnlockedSeg) {
        pathG.lineStyle(18, 0x00f5d4, 0.2);
        this.drawSmoothSegment(pathG, p1.x, p1.y, p2.x, p2.y);
        pathG.lineStyle(8, 0x00f5d4, 0.92);
        this.drawSmoothSegment(pathG, p1.x, p1.y, p2.x, p2.y);
      } else {
        pathG.lineStyle(8, 0x3b2d3c, 0.75);
        this.drawSmoothSegment(pathG, p1.x, p1.y, p2.x, p2.y);
      }
    }
    this.mapContainer.add(pathG);

    // Bonus Chest along path near current level
    const chestIdx = Math.min(points.length - 2, Math.max(1, this.progression.current_level - 2));
    const cp1 = points[chestIdx];
    const cp2 = points[chestIdx + 1];
    const chestX = (cp1.x + cp2.x) / 2 - 48;
    const chestY = (cp1.y + cp2.y) / 2;
    const chestCont = this.add.container(chestX, chestY);
    const chBg = this.add.graphics();
    chBg.fillStyle(0xf6d365, 0.16);
    chBg.fillRoundedRect(-38, -38, 76, 76, 20);
    chBg.fillStyle(0x161f30, 1);
    chBg.fillRoundedRect(-32, -32, 64, 64, 16);
    chBg.lineStyle(2.5, 0xffd166, 1);
    chBg.strokeRoundedRect(-32, -32, 64, 64, 16);
    const chIcon = this.add.text(0, -2, '🎁', { fontSize: '28px' }).setOrigin(0.5);
    const chBadgeBg = this.add.graphics();
    chBadgeBg.fillStyle(0xe63946, 1);
    chBadgeBg.fillRoundedRect(-26, 22, 52, 18, 9);
    const chBadgeTxt = this.add.text(0, 31, 'CLAIM', {
      fontFamily: 'sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    chestCont.add([chBg, chIcon, chBadgeBg, chBadgeTxt]);
    chestCont.setSize(64, 64).setInteractive({ useHandCursor: true });
    chestCont.on('pointerdown', () => {
      this.soundMgr.playCollect();
      this.meta.coins += 30;
      StorageService.save(this.progression, this.meta, this.settings);
      chBadgeTxt.setText('✓ DONE');
    });
    this.mapContainer.add(chestCont);

    // Draw level nodes
    points.forEach(pt => {
      const isCurrent = pt.lv === this.progression.current_level;
      const isUnlocked = pt.lv <= this.progression.max_unlocked_level;
      const isDone = pt.lv < this.progression.max_unlocked_level;
      const isBoss = pt.lv >= 10 && pt.lv % 10 === 0;

      const node = this.add.container(pt.x, pt.y);
      const ng = this.add.graphics();

      if (isCurrent) {
        // Large Glowing Cyan Current Node
        ng.fillStyle(0x00f5d4, 0.22);
        ng.fillCircle(0, 0, 54);
        ng.fillStyle(0x0d262b, 1);
        ng.fillCircle(0, 0, 42);
        ng.lineStyle(3.5, 0x00f5d4, 1);
        ng.strokeCircle(0, 0, 42);
        node.add(ng);

        node.add(this.add.text(0, -6, `${pt.lv}`, {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          fontStyle: 'bold',
          color: '#ffffff'
        }).setOrigin(0.5));
        node.add(this.add.text(0, 20, '▶', { fontSize: '14px', color: '#00f5d4' }).setOrigin(0.5));

        // Avatar + Ready! ⚡ pill above current node
        const avBg = this.add.graphics();
        avBg.fillStyle(0x0f172a, 1);
        avBg.fillCircle(0, -68, 22);
        avBg.lineStyle(2.5, 0x00f5d4, 1);
        avBg.strokeCircle(0, -68, 22);
        avBg.fillStyle(0xffffff, 1);
        avBg.fillRoundedRect(-44, -110, 88, 24, 12);
        node.add(avBg);
        node.add(this.add.text(0, -68, '🐧', { fontSize: '22px' }).setOrigin(0.5));
        node.add(this.add.text(0, -98, 'Ready! ⚡', {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#062620'
        }).setOrigin(0.5));

        const tapLbl = this.add.text(0, 58, '● TAP TO PLAY', {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#00f5d4'
        }).setOrigin(0.5);
        node.add(tapLbl);

        this.tweens.add({
          targets: node,
          scale: 1.05,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      } else if (isBoss) {
        // Boss Milestone Node
        ng.fillStyle(0xe63946, 0.22);
        ng.fillCircle(0, 0, 46);
        ng.fillStyle(0x2a1218, 1);
        ng.fillCircle(0, 0, 36);
        ng.lineStyle(3, 0xff5400, 1);
        ng.strokeCircle(0, 0, 36);
        ng.fillStyle(0xb81424, 1);
        ng.fillRoundedRect(-28, 24, 56, 18, 9);
        node.add(ng);

        node.add(this.add.text(0, -10, '🔥', { fontSize: '18px' }).setOrigin(0.5));
        node.add(this.add.text(0, 10, `${pt.lv}`, {
          fontFamily: 'sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: '#ffffff'
        }).setOrigin(0.5));
        node.add(this.add.text(0, 33, 'BOSS', {
          fontFamily: 'sans-serif',
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#ffffff'
        }).setOrigin(0.5));
      } else if (isUnlocked) {
        // Completed / Unlocked Node
        ng.fillStyle(0x10282e, 1);
        ng.fillCircle(0, 0, 34);
        ng.lineStyle(2.5, 0x00f5d4, 0.85);
        ng.strokeCircle(0, 0, 34);
        node.add(ng);
        node.add(this.add.text(0, 0, `${pt.lv}`, {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#ffffff'
        }).setOrigin(0.5));
        if (isDone) {
          node.add(this.add.text(0, 44, '★★★', { fontSize: '13px', color: '#ffd166' }).setOrigin(0.5));
        }
      } else {
        // Locked Future Node
        ng.fillStyle(0x141a26, 0.95);
        ng.fillCircle(0, 0, 32);
        ng.lineStyle(2, 0x2a344a, 1);
        ng.strokeCircle(0, 0, 32);
        node.add(ng);
        node.add(this.add.text(0, -6, '🔒', { fontSize: '14px' }).setOrigin(0.5));
        node.add(this.add.text(0, 12, `${pt.lv}`, {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: '#7b889e'
        }).setOrigin(0.5));
        node.add(this.add.text(0, 42, 'Locked', {
          fontFamily: 'sans-serif',
          fontSize: '11px',
          color: '#5a657a'
        }).setOrigin(0.5));
      }

      if (isUnlocked) {
        node.setSize(84, 84).setInteractive({ useHandCursor: true });
        node.on('pointerdown', () => {
          this.soundMgr.playSelect();
          if (this.selectedStage === pt.lv) {
            this.scene.start('GameScene', { level: pt.lv });
          } else {
            this.selectedStage = pt.lv;
            this.updateStagePreview();
          }
        });
      }

      this.mapContainer.add(node);
    });

    // Center scroll on current level
    const curPt = points[Math.max(0, Math.min(points.length - 1, this.progression.current_level - 1))];
    this.minScrollY = -120;
    this.maxScrollY = Math.max(0, (totalNodes - 4) * stepY);
    this.scrollY = Phaser.Math.Clamp(620 - curPt.y, this.minScrollY, this.maxScrollY);
    this.mapContainer.y = this.scrollY;
  }

  private drawSmoothSegment(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number) {
    const steps = 14;
    g.beginPath();
    g.moveTo(x1, y1);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const ease = t * t * (3 - 2 * t);
      const px = x1 + (x2 - x1) * ease;
      const py = y1 + (y2 - y1) * t;
      g.lineTo(px, py);
    }
    g.strokePath();
  }

  private setupScrollControls() {
    let lastY = 0;
    let dragging = false;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y > 120 && p.y < 1030) {
        dragging = true;
        lastY = p.y;
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!dragging) return;
      const dy = p.y - lastY;
      lastY = p.y;
      this.scrollY = Phaser.Math.Clamp(this.scrollY + dy, this.minScrollY, this.maxScrollY);
      this.mapContainer.y = this.scrollY;
    });

    this.input.on('pointerup', () => {
      dragging = false;
    });

    this.input.on('wheel', (_p: any, _gx: any, _gy: any, deltaY: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY - deltaY * 0.6, this.minScrollY, this.maxScrollY);
      this.mapContainer.y = this.scrollY;
    });
  }

  private buildTopOverlayBar() {
    const g = this.add.graphics();
    g.fillStyle(0x0b111c, 0.92);
    g.fillRect(0, 0, 720, 118);

    // Compact circular avatar icon (left)
    g.fillStyle(0x161f30, 1);
    g.fillCircle(48, 38, 24);
    g.lineStyle(2, 0x00f5d4, 1);
    g.strokeCircle(48, 38, 24);
    this.add.text(48, 38, '🐧', { fontSize: '22px' }).setOrigin(0.5);

    // Spacious top stats bar (right)
    g.fillStyle(0x161f30, 1);
    g.fillRoundedRect(88, 14, 612, 48, 24);
    g.lineStyle(1.5, 0x2b3e5e, 1);
    g.strokeRoundedRect(88, 14, 612, 48, 24);
    this.add.text(394, 38, `⚡ ${this.energy.lives}      🪙 ${this.meta.coins.toLocaleString('en-US')}      ⭐ ${this.meta.stars}`, {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffd166'
    }).setOrigin(0.5);

    this.add.text(360, 88, 'LEVEL PROGRESSION MAP (Kéo để cuộn)', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#00f5d4'
    }).setOrigin(0.5);
  }

  private buildStagePreviewBar() {
    const g = this.add.graphics();
    g.fillStyle(0x151e2e, 0.96);
    g.fillRoundedRect(24, 1036, 672, 86, 20);
    g.lineStyle(1.5, 0x2a3854, 1);
    g.strokeRoundedRect(24, 1036, 672, 86, 20);

    this.add.text(62, 1079, '🧪', { fontSize: '30px' }).setOrigin(0.5);

    this.stageTitleTxt = this.add.text(104, 1064, '', {
      fontFamily: 'sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0, 0.5);

    this.stageSubTxt = this.add.text(104, 1094, '', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: '#a8dadc'
    }).setOrigin(0, 0.5);

    const playBtn = this.add.container(586, 1079);
    const pBg = this.add.graphics();
    pBg.fillStyle(0x00e5be, 1);
    pBg.fillRoundedRect(-86, -28, 172, 56, 16);
    const pTxt = this.add.text(0, 0, '▶  PLAY', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#062620'
    }).setOrigin(0.5);
    playBtn.add([pBg, pTxt]);
    playBtn.setSize(172, 56).setInteractive({ useHandCursor: true });
    playBtn.on('pointerdown', () => {
      this.soundMgr.playSelect();
      this.scene.start('GameScene', { level: this.selectedStage });
    });

    this.updateStagePreview();
  }

  private updateStagePreview() {
    const isHard = this.selectedStage >= 15 && this.selectedStage % 10 === 5;
    const isBoss = this.selectedStage >= 20 && this.selectedStage % 10 === 0;
    const tag = isBoss ? 'Very Hard (Boss)' : isHard ? 'Hard' : 'Normal';
    this.stageTitleTxt.setText(`Stage ${this.selectedStage}  ·  ${tag}`);
    this.stageSubTxt.setText(
      this.energy.hasLife()
        ? `⚡ ${this.energy.lives} Mạng · Bấm Play để bắt đầu`
        : `⚡ Hết mạng! Hồi 1 mạng sau ${this.energy.formatCountdown()}`
    );
  }

  private buildBottomNav() {
    const g = this.add.graphics();
    g.fillStyle(0x0f1624, 0.98);
    g.fillRoundedRect(16, 1134, 688, 120, 26);
    g.lineStyle(1.5, 0x25324d, 1);
    g.strokeRoundedRect(16, 1134, 688, 120, 26);

    const tabs = [
      { id: 'home', x: 90, icon: '🏠', label: 'Home', action: () => this.scene.start('HomeScene') },
      { id: 'events', x: 225, icon: '🎉', label: 'Daily', action: () => this.scene.start('GameScene', { level: 15, dailyDate: new Date().toISOString().slice(0, 10) }) },
      { id: 'map', x: 360, icon: '🧭', label: 'Map', action: () => {} },
      { id: 'play', x: 495, icon: '🎮', label: 'Play', action: () => this.scene.start('GameScene', { level: this.selectedStage }) },
      { id: 'back', x: 630, icon: '📊', label: 'Rank', action: () => this.scene.start('HomeScene') }
    ];

    tabs.forEach(t => {
      const isAct = t.id === 'map';
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
}
