import Phaser from 'phaser';
import { Level, EngineCore, GameEvent, isHidden, trueColor } from '../core/engine';
import { GameSession } from '../core/session';
import { Generator } from '../core/generator';
import { RNG } from '../core/rng';
import { StorageService, GameSettings } from '../core/storage';
import { ProgressionState } from '../core/progression';
import { MetaState, THEMES } from '../core/meta';
import { SoundManager } from '../audio/sound';
import { CORE_UI_COLORS } from '../config/ui_colors';
import { EnergyState, MAX_LIVES, REGEN_MINUTES } from '../core/energy';

const SYMBOLS = ['●', '◆', '▲', '★', '■', '⬢', '✚', '☾', '♥'];
const DRAG_THRESHOLD_PX = 18;

interface TubeDisplay {
  colIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  ballSize: number;
  container: Phaser.GameObjects.Container;
  glassBg: Phaser.GameObjects.Graphics;
  targetRing: Phaser.GameObjects.Graphics;
  targetSprite?: Phaser.GameObjects.Sprite;
  targetSymbol?: Phaser.GameObjects.Text;
  lockBadge?: Phaser.GameObjects.Container;
  ballSprites: Phaser.GameObjects.Sprite[];
}

export class GameScene extends Phaser.Scene {
  private soundMgr!: SoundManager;
  private progression!: ProgressionState;
  private meta!: MetaState;
  private settings!: GameSettings;
  private energy!: EnergyState;
  private livesCountdownTimer?: Phaser.Time.TimerEvent;

  private session!: GameSession;
  private rng: RNG = new RNG(12345);
  private isDailyMode: boolean = false;
  private dailyDateStr: string = '';
  private levelStartTime: number = Date.now();

  private tubes: TubeDisplay[] = [];
  private selectedSrc: number = -1;
  private selectedJ: number = -1;
  private liftedSprites: Phaser.GameObjects.Sprite[] = [];

  // Drag & Drop state (GDD §3)
  private dragCandidate: { src: number; j: number; startX: number; startY: number } | null = null;
  private isDragging: boolean = false;
  private dragGhosts: Phaser.GameObjects.Sprite[] = [];

  // UI elements
  private hudContainer!: Phaser.GameObjects.Container;
  private hudBarBg!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private streakText!: Phaser.GameObjects.Text;
  private coinsText!: Phaser.GameObjects.Text;
  private undoBtnText!: Phaser.GameObjects.Text;
  private extraTubeBtn!: Phaser.GameObjects.Container;

  // Active modal
  private activeModal: Phaser.GameObjects.Container | null = null;
  private isAnimating: boolean = false;

  // Seasonal Christmas Decor
  private seasonalDecor: Phaser.GameObjects.Container | null = null;
  private snowEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor() {
    super('GameScene');
  }

  create(launchData?: { level?: number; dailyDate?: string }) {
    const data = StorageService.load();
    this.progression = data.progression;
    this.meta = data.meta;
    this.settings = data.settings;
    this.energy = data.energy;
    this.soundMgr = new SoundManager(this.settings.soundEnabled);

    this.updateBackground();
    this.buildHUD();
    this.setupDragListeners();

    const startLv = launchData?.level ?? this.progression.current_level;
    const dailyDate = launchData?.dailyDate ?? '';
    this.startLevel(startLv, dailyDate);
  }

  private setupDragListeners() {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragCandidate || this.isAnimating || this.activeModal) return;
      const dist = Phaser.Math.Distance.Between(
        this.dragCandidate.startX,
        this.dragCandidate.startY,
        pointer.x,
        pointer.y
      );
      if (!this.isDragging && dist >= DRAG_THRESHOLD_PX) {
        this.beginDrag(pointer.x, pointer.y);
      } else if (this.isDragging) {
        this.updateDragGhosts(pointer.x, pointer.y);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragCandidate) return;
      const cand = this.dragCandidate;
      this.dragCandidate = null;

      if (this.isDragging) {
        this.finishDrag(pointer.x, pointer.y, cand.src, cand.j);
      }
    });
  }

  private getBallTextureKey(ballVal: number): string {
    const theme = this.meta.getTheme();
    if (theme.useImageSkin) {
      if (isHidden(ballVal)) return `ball_${theme.id}_mystery`;
      return `ball_${theme.id}_${trueColor(ballVal)}`;
    }
    if (isHidden(ballVal)) return 'ball_mystery';
    const prefix = this.settings.colorBlindSymbols ? 'ball_sym' : 'ball';
    return `${prefix}_${theme.id}_${trueColor(ballVal)}`;
  }

  private beginDrag(px: number, py: number) {
    if (!this.dragCandidate) return;
    const { src, j } = this.dragCandidate;
    if (EngineCore.isLocked(this.session.state, src) || this.session.state.gone[src]) {
      this.dragCandidate = null;
      return;
    }

    this.isDragging = true;
    this.deselectSegment();
    this.selectedSrc = src;
    this.selectedJ = j;
    this.soundMgr.playSelect();

    const tube = this.tubes[src];
    const theme = this.meta.getTheme();
    const cols = this.session.state.cols[src];

    // Hide original sprites during drag & create floating ghosts
    this.clearDragGhosts();
    for (let idx = j; idx < cols.length; idx++) {
      if (tube.ballSprites[idx]) {
        tube.ballSprites[idx].setAlpha(0.25);
      }
      const ballVal = cols[idx];
      const key = this.getBallTextureKey(ballVal);
      const ghost = this.add.sprite(px, py, key);
      ghost.setDisplaySize(tube.ballSize * 1.08, tube.ballSize * 1.08);
      ghost.setDepth(500 + idx);
      this.dragGhosts.push(ghost);
    }
    this.updateDragGhosts(px, py);
    this.highlightValidDestinations(src, j);
  }

  private highlightValidDestinations(src: number, j: number) {
    // Only pulse valid destination tubes in Tutorial Level 1; let players think on normal levels
    if (this.isDailyMode || this.progression.current_level !== 1) return;
    this.tubes.forEach(t => {
      if (t.colIndex !== src && EngineCore.moveInfo(this.session.state, src, j, t.colIndex) > 0) {
        this.tweens.add({
          targets: t.container,
          scale: 1.05,
          duration: 160,
          yoyo: true,
          repeat: -1
        });
      }
    });
  }

  private updateDragGhosts(px: number, py: number) {
    const ballSize = this.tubes[0]?.ballSize || 60;
    this.dragGhosts.forEach((g, idx) => {
      g.setPosition(px, py - idx * (ballSize * 0.85));
    });
  }

  private clearDragGhosts() {
    this.dragGhosts.forEach(g => g.destroy());
    this.dragGhosts = [];
  }

  private finishDrag(px: number, py: number, src: number, j: number) {
    this.isDragging = false;
    this.clearDragGhosts();

    if (this.tubes[src]) {
      this.tubes[src].ballSprites.forEach(s => s.setAlpha(1.0));
    }
    this.tubes.forEach(t => {
      this.tweens.killTweensOf(t.container);
      t.container.setScale(1.0);
    });

    const dst = this.findTubeAt(px, py);
    if (dst >= 0 && dst !== src) {
      const res = this.session.tryMove(src, j, dst);
      if (res.ok) {
        this.selectedSrc = -1;
        this.selectedJ = -1;
        this.liftedSprites = [];
        this.soundMgr.playLand();
        this.processEvents(res.events);
        return;
      } else {
        this.shakeTube(dst);
        this.soundMgr.playInvalid();
      }
    }

    this.selectedSrc = -1;
    this.selectedJ = -1;
    this.liftedSprites = [];
  }

  private findTubeAt(px: number, py: number): number {
    for (const t of this.tubes) {
      const halfW = t.width / 2 + 20;
      const halfH = t.height / 2 + 25;
      if (px >= t.x - halfW && px <= t.x + halfW && py >= t.y - halfH && py <= t.y + halfH) {
        return t.colIndex;
      }
    }
    return -1;
  }

  private updateBackground() {
    const theme = this.meta.getTheme();
    const hex = parseInt(theme.bg.replace('#', ''), 16);
    this.cameras.main.setBackgroundColor(hex);
    if (this.hudBarBg) {
      this.hudBarBg.clear();
      this.hudBarBg.fillStyle(theme.hudBg, 0.96);
      this.hudBarBg.fillRoundedRect(16, 16, 688, 84, 18);
      this.hudBarBg.lineStyle(2.5, theme.accent, 0.72);
      this.hudBarBg.strokeRoundedRect(16, 16, 688, 84, 18);
    }
    this.updateSeasonalDecor(theme.id);
  }

  private updateSeasonalDecor(themeId: string) {
    if (this.seasonalDecor) {
      this.seasonalDecor.destroy();
      this.seasonalDecor = null;
    }
    if (this.snowEmitter) {
      this.snowEmitter.destroy();
      this.snowEmitter = null;
    }

    if (themeId !== 'christmas') return;

    // 1. Full-screen continuous falling snow (fast-forwarded so snow covers the whole screen immediately)
    this.snowEmitter = this.add.particles(0, -20, 'snow_flake', {
      x: { min: 0, max: 720 },
      speedY: { min: 48, max: 135 },
      speedX: { min: -28, max: 22 },
      scale: { min: 0.22, max: 0.78 },
      alpha: { start: 0.9, end: 0.2 },
      lifespan: 14000,
      frequency: 85,
      quantity: 1
    });
    this.snowEmitter.setDepth(-5);
    this.snowEmitter.fastForward(10000);

    // 2. Asymmetric Storybook Christmas Composition (Rule of Thirds + Diagonal Balance)
    const decor = this.add.container(0, 0);
    decor.setDepth(-3);

    const landscape = this.add.graphics();
    // Upper-left quiet winter crescent moon + distant stars (balances upper-right tree)
    landscape.fillStyle(0xfff3b0, 0.22);
    landscape.fillCircle(56, 150, 22);
    landscape.fillStyle(0x102520, 1);
    landscape.fillCircle(65, 144, 19);
    landscape.fillStyle(0xfff3b0, 0.45);
    landscape.fillCircle(104, 134, 2.5);
    landscape.fillCircle(122, 162, 1.8);
    landscape.fillCircle(28, 184, 2.0);

    // Upper-right snow ledge for Distant Tree #3 + Chibi Snowman
    landscape.fillStyle(0xd8f3dc, 0.14);
    landscape.fillEllipse(650, 196, 130, 22);

    // Layered asymmetric rolling snow hills at the bottom (higher on left, sloping right)
    // Back ridge (cool misty pine-blue)
    landscape.fillStyle(0x1b4332, 0.55);
    landscape.fillEllipse(520, 1230, 620, 240);
    // Mid snowbank (soft icy mint)
    landscape.fillStyle(0xd8f3dc, 0.14);
    landscape.fillEllipse(170, 1215, 560, 230);
    // Foreground snowbank (crisp snow white-mint)
    landscape.fillStyle(0xf0fdf4, 0.16);
    landscape.fillEllipse(130, 1255, 480, 210);
    landscape.fillEllipse(580, 1272, 460, 175);
    decor.add(landscape);

    // Diagonal Composition (all edges tucked clear of top action buttons & 4..9 tube board area):
    // A. Upper-Right Cluster: Distant Mini Tree + Chibi Snowman
    const distantTree = this.createChibiTree(620, 160, 0.48);
    distantTree.setAlpha(0.88);
    decor.add(distantTree);

    const snowman = this.createChibiSnowman(678, 176, 0.72);
    snowman.setAngle(-4);
    decor.add(snowman);

    // B. Bottom-Left Hero Tree + Gift Box (tucked cleanly in bottom-left corner)
    const heroTree = this.createChibiTree(76, 1088, 1.04);
    heroTree.setAngle(-2);
    decor.add(heroTree);

    const gift = this.add.graphics();
    gift.fillStyle(0xe63946, 1);
    gift.fillRoundedRect(22, 1118, 24, 20, 4);
    gift.fillStyle(0xffd166, 1);
    gift.fillRect(31, 1118, 5, 20);
    gift.fillRect(22, 1126, 24, 4);
    decor.add(gift);

    // C. Bottom-Right Midground Companion Tree (lower, smaller, slight lean)
    const rightTree = this.createChibiTree(648, 1112, 0.76);
    rightTree.setAngle(3);
    decor.add(rightTree);

    this.seasonalDecor = decor;
  }

  private createChibiSnowman(x: number, y: number, scale: number): Phaser.GameObjects.Container {
    const sm = this.add.container(x, y);
    sm.setScale(scale);
    const g = this.add.graphics();

    // Body & Head
    g.fillStyle(0xf0f8ff, 1);
    g.fillCircle(0, 18, 22);
    g.fillCircle(0, -10, 17);
    // Red scarf
    g.fillStyle(0xe63946, 1);
    g.fillRoundedRect(-15, 2, 30, 8, 4);
    g.fillRoundedRect(-10, 6, 8, 16, 3);
    // Red Santa hat
    g.fillStyle(0xe63946, 1);
    g.fillTriangle(-15, -20, 15, -20, 0, -40);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(-17, -23, 34, 7, 4);
    g.fillCircle(0, -41, 5);
    // Eyes & carrot nose
    g.fillStyle(0x1b2232, 1);
    g.fillCircle(-6, -13, 2.2);
    g.fillCircle(6, -13, 2.2);
    g.fillStyle(0xff7b00, 1);
    g.fillTriangle(0, -10, 0, -6, -9, -8);

    sm.add(g);
    this.tweens.add({
      targets: sm,
      angle: 4,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    return sm;
  }

  private createChibiTree(x: number, y: number, scale: number): Phaser.GameObjects.Container {
    const tree = this.add.container(x, y);
    tree.setScale(scale);

    const g = this.add.graphics();

    // Soft ground shadow
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(0, 46, 76, 16);

    // Chibi brown trunk
    g.fillStyle(0x6f4e37, 1);
    g.fillRoundedRect(-10, 22, 20, 22, 5);

    // 3 plump Chibi foliage tiers (rounded scalloped silhouette)
    // Bottom tier
    g.fillStyle(0x14532d, 1);
    g.fillRoundedRect(-44, 6, 88, 22, 11);
    g.fillStyle(0x16803c, 1);
    g.fillTriangle(-42, 18, 42, 18, 0, -24);

    // Middle tier
    g.fillStyle(0x16803c, 1);
    g.fillRoundedRect(-35, -18, 70, 20, 10);
    g.fillStyle(0x22c55e, 1);
    g.fillTriangle(-33, -8, 33, -8, 0, -48);

    // Top tier
    g.fillStyle(0x22c55e, 1);
    g.fillRoundedRect(-25, -40, 50, 18, 9);
    g.fillStyle(0x4ade80, 1);
    g.fillTriangle(-23, -30, 23, -30, 0, -68);

    // Subtle snow frosting on tips
    g.fillStyle(0xffffff, 0.72);
    g.fillEllipse(-26, 22, 16, 6);
    g.fillEllipse(26, 22, 16, 6);
    g.fillEllipse(-18, -3, 14, 5);
    g.fillEllipse(18, -3, 14, 5);

    // Cute Chibi Face (eyes + rosy cheeks)
    g.fillStyle(0x0f172a, 1);
    g.fillCircle(-8, -28, 2.5);
    g.fillCircle(8, -28, 2.5);
    g.fillStyle(0xff8fa3, 0.85);
    g.fillCircle(-13, -24, 3);
    g.fillCircle(13, -24, 3);

    // Garland lines
    g.lineStyle(2, 0xffd166, 0.5);
    g.lineBetween(-22, -20, 22, -10);
    g.lineBetween(-32, 4, 32, 16);

    tree.add(g);

    // Glowing Golden Star Topper
    const starGlow = this.add.circle(0, -72, 14, 0xffd166, 0.28);
    const star = this.add.text(0, -72, '★', {
      fontSize: '26px',
      color: '#ffd166'
    }).setOrigin(0.5);
    tree.add([starGlow, star]);
    this.tweens.add({
      targets: [star, starGlow],
      scale: 1.24,
      alpha: 0.7,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Twinkling fairy lights around the tree
    const lightPositions = [
      { lx: -12, ly: -44, color: 0xff0055, delay: 0 },
      { lx: 10, ly: -36, color: 0x00e5ff, delay: 220 },
      { lx: -20, ly: -14, color: 0xffd166, delay: 440 },
      { lx: 4, ly: -10, color: 0xff70a6, delay: 140 },
      { lx: 22, ly: -4, color: 0xffffff, delay: 560 },
      { lx: -28, ly: 14, color: 0x00f5d4, delay: 320 },
      { lx: -2, ly: 18, color: 0xff0055, delay: 680 },
      { lx: 26, ly: 14, color: 0xffd166, delay: 100 }
    ];

    lightPositions.forEach(lp => {
      const glow = this.add.circle(lp.lx, lp.ly, 7, lp.color, 0.35);
      const bulb = this.add.circle(lp.lx, lp.ly, 3.5, lp.color, 1);
      tree.add([glow, bulb]);

      this.tweens.add({
        targets: [glow, bulb],
        alpha: 0.15,
        scale: 0.65,
        duration: 480,
        delay: lp.delay,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    });

    return tree;
  }

  private startLevel(levelNum: number, dailyDate: string = '') {
    this.closeModal();
    this.selectedSrc = -1;
    this.selectedJ = -1;
    this.liftedSprites = [];
    this.dragCandidate = null;
    this.isDragging = false;
    this.clearDragGhosts();
    this.isAnimating = false;

    this.isDailyMode = dailyDate !== '';
    this.dailyDateStr = dailyDate;

    if (this.isDailyMode) {
      let hash = 0;
      for (let i = 0; i < dailyDate.length; i++) {
        hash = (hash * 31 + dailyDate.charCodeAt(i)) >>> 0;
      }
      this.rng.seed(hash);
    } else {
      this.rng.seed(levelNum * 997 + 13);
    }

    const params = Generator.paramsForLevel(this.isDailyMode ? 15 : levelNum, this.rng);
    const gen = Generator.generate(params, this.rng, 100);
    let level: Level;

    if (gen) {
      level = new Level(gen.spec);
    } else {
      const fallbackStr = levelNum === 1
        ? "3;4:0.001;1.110;2.222;."
        : `4;4:0.012;1.100;.;2.222`;
      level = Level.fromString(fallbackStr)!;
    }

    this.session = new GameSession(level);
    this.levelStartTime = Date.now();
    if (!this.isDailyMode) {
      this.progression.current_level = levelNum;
      StorageService.save(this.progression, this.meta, this.settings);
    }

    this.updateHUD();
    this.renderBoard();

    // FTUE Level 1 Cue (GDD §3b): Highlight first suggested move
    if (!this.isDailyMode && levelNum === 1 && this.session.moves === 0) {
      this.time.delayedCall(350, () => {
        if (this.session && this.session.moves === 0 && !this.activeModal) {
          this.showFtueCue();
        }
      });
    }
  }

  private showFtueCue() {
    const mv = this.session.hint();
    if (!mv) return;
    const srcT = this.tubes[mv.src];
    const dstT = this.tubes[mv.dst];
    if (!srcT || !dstT) return;

    this.tweens.add({
      targets: [srcT.container, dstT.container],
      scale: 1.06,
      duration: 300,
      yoyo: true,
      repeat: 2
    });
  }

  private renderBoard() {
    this.tubes.forEach(t => t.container.destroy());
    this.tubes = [];

    const numCols = this.session.state.cols.length;
    const isTwoRows = numCols > 4;

    const row1Cols = isTwoRows ? Math.ceil(numCols / 2) : numCols;
    const row2Cols = isTwoRows ? numCols - row1Cols : 0;

    const W = 720;
    const boardTop = 196;
    const boardBottom = 1130;
    const availH = boardBottom - boardTop;

    const tubeW = Math.min(100, Math.floor((W - 80) / Math.max(row1Cols, row2Cols)));
    const cap = this.session.level.capacity;
    const rowGap = 72;
    const maxBallByHeight = isTwoRows
      ? Math.floor((availH - 88 - rowGap - 46) / (2 * cap))
      : Math.floor((availH - 44 - 46) / cap);
    const ballDiameter = Math.min(tubeW - 12, 70, maxBallByHeight);
    const tubeH = ballDiameter * cap + 44;

    const totalTwoRowH = tubeH * 2 + rowGap + 44;
    const startY2 = boardTop + Math.max(0, Math.floor((availH - totalTwoRowH) / 2));
    const yRow1 = isTwoRows ? startY2 + tubeH / 2 : boardTop + availH / 2 - 15;
    const yRow2 = isTwoRows ? yRow1 + tubeH + rowGap : 0;

    for (let c = 0; c < numCols; c++) {
      let x = 0;
      let y = 0;

      if (!isTwoRows) {
        const spacing = (W - 80) / (numCols + 1);
        x = 40 + spacing * (c + 1);
        y = yRow1;
      } else {
        if (c < row1Cols) {
          const spacing = (W - 60) / (row1Cols + 1);
          x = 30 + spacing * (c + 1);
          y = yRow1;
        } else {
          const c2 = c - row1Cols;
          const spacing = (W - 60) / (row2Cols + 1);
          x = 30 + spacing * (c2 + 1);
          y = yRow2;
        }
      }

      this.createTubeView(c, x, y, tubeW, tubeH, ballDiameter);
    }
  }

  private createTubeView(
    colIdx: number,
    x: number,
    y: number,
    w: number,
    h: number,
    ballSize: number
  ) {
    const container = this.add.container(x, y);
    const theme = this.meta.getTheme();

    const glass = this.add.graphics();
    container.add(glass);

    const ring = this.add.graphics();
    container.add(ring);

    const tubeDisplay: TubeDisplay = {
      colIndex: colIdx,
      x,
      y,
      width: w,
      height: h,
      ballSize,
      container,
      glassBg: glass,
      targetRing: ring,
      ballSprites: []
    };

    const hitZone = this.add.zone(0, 0, w + 16, h + 30).setInteractive({ useHandCursor: true });
    container.add(hitZone);
    hitZone.on('pointerdown', () => {
      this.handleTubeClick(colIdx);
    });

    this.drawTubeSkin(tubeDisplay, w, h, theme);
    this.redrawBallsInTube(tubeDisplay, ballSize);

    this.tubes.push(tubeDisplay);
  }

  private drawTubeSkin(t: TubeDisplay, w: number, h: number, theme: any) {
    const g = t.glassBg;
    g.clear();

    const targetColor = this.session.state.targets[t.colIndex];
    const lockSpec = this.session.state.locks[t.colIndex];
    const isGone = this.session.state.gone[t.colIndex];

    if (isGone) {
      t.container.setAlpha(0.18);
      if (t.lockBadge) t.lockBadge.setVisible(false);
      if (t.targetSprite) t.targetSprite.setVisible(false);
      if (t.targetSymbol) t.targetSymbol.setVisible(false);
      return;
    }
    t.container.setAlpha(1.0);

    const r = w / 2;

    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(-r + 4, -h / 2 + 4, w, h, { tl: 0, tr: 0, bl: r, br: r });

    g.fillStyle(theme.tubeGlass, theme.tubeGlassAlpha);
    g.fillRoundedRect(-r, -h / 2, w, h, { tl: 0, tr: 0, bl: r, br: r });

    g.lineStyle(3, theme.tubeBorder, theme.tubeBorderAlpha);
    g.strokeRoundedRect(-r, -h / 2, w, h, { tl: 0, tr: 0, bl: r, br: r });

    g.lineStyle(2, 0xffffff, 0.3);
    g.lineBetween(-r + 6, -h / 2 + 10, -r + 6, h / 2 - r);

    const rg = t.targetRing;
    rg.clear();
    if (targetColor >= 0 && targetColor < theme.ballColors.length) {
      const pedY = h / 2 + 24;
      rg.fillStyle(0xffffff, 0.12);
      rg.fillCircle(0, pedY, 21);
      rg.lineStyle(2, 0xffffff, 0.45);
      rg.strokeCircle(0, pedY, 21);

      const targetKey = this.getBallTextureKey(targetColor);
      if (!t.targetSprite) {
        t.targetSprite = this.add.sprite(0, pedY, targetKey);
        t.container.add(t.targetSprite);
      } else {
        t.targetSprite.setTexture(targetKey);
        t.targetSprite.setPosition(0, pedY);
      }
      t.targetSprite.setDisplaySize(34, 34);
      t.targetSprite.setVisible(true);

      if (t.targetSymbol) {
        t.targetSymbol.setVisible(false);
      }
    } else {
      if (t.targetSprite) t.targetSprite.setVisible(false);
      if (t.targetSymbol) t.targetSymbol.setVisible(false);
    }

    if (lockSpec) {
      if (!t.lockBadge) {
        t.lockBadge = this.add.container(0, 0);
        t.container.add(t.lockBadge);
      }
      t.lockBadge.removeAll(true);
      t.lockBadge.setDepth(50);

      const bgRect = this.add.graphics();
      bgRect.fillStyle(0x1b202c, 0.95);
      bgRect.fillRoundedRect(-48, -20, 96, 40, 10);
      bgRect.lineStyle(2, 0xffd166, 0.9);
      bgRect.strokeRoundedRect(-48, -20, 96, 40, 10);
      t.lockBadge.add(bgRect);

      if (lockSpec.kind === 'type' && lockSpec.color >= 0) {
        const lockTxt = this.add.text(-36, 0, '🔒', { fontSize: '15px' }).setOrigin(0, 0.5);
        const iconSp = this.add.sprite(4, 0, this.getBallTextureKey(lockSpec.color)).setDisplaySize(24, 24);
        const cntTxt = this.add.text(22, 0, `x${lockSpec.count}`, {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#ffffff'
        }).setOrigin(0, 0.5);
        t.lockBadge.add([lockTxt, iconSp, cntTxt]);
      } else {
        const txt = this.add.text(0, 0, `🔒 x${lockSpec.count}`, {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#ffffff'
        }).setOrigin(0.5);
        t.lockBadge.add(txt);
      }
      t.lockBadge.setVisible(true);
    } else if (t.lockBadge) {
      t.lockBadge.setVisible(false);
    }
  }

  private redrawBallsInTube(t: TubeDisplay, ballSize: number) {
    t.ballSprites.forEach(s => s.destroy());
    t.ballSprites = [];

    const balls = this.session.state.cols[t.colIndex];
    if (!balls) return;

    const r = t.width / 2;
    const baseY = t.height / 2 - r / 2 - 8;
    const theme = this.meta.getTheme();

    balls.forEach((ballVal, idx) => {
      const cy = baseY - idx * ballSize;
      const key = this.getBallTextureKey(ballVal);

      const sprite = this.add.sprite(0, cy, key);
      sprite.setDisplaySize(ballSize, ballSize);
      sprite.setInteractive({ useHandCursor: true });

      sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (this.isAnimating || this.activeModal) return;

        if (this.selectedSrc < 0) {
          this.dragCandidate = {
            src: t.colIndex,
            j: idx,
            startX: pointer.x,
            startY: pointer.y
          };
        }

        this.handleBallClick(t.colIndex, idx);
      });

      t.container.add(sprite);
      t.ballSprites.push(sprite);
    });

    if (t.lockBadge) {
      t.container.bringToTop(t.lockBadge);
    }
  }

  private handleBallClick(colIdx: number, ballIdx: number) {
    if (this.isAnimating || this.isDragging) return;

    if (EngineCore.isLocked(this.session.state, colIdx) || this.session.state.gone[colIdx]) {
      this.shakeTube(colIdx);
      this.soundMgr.playInvalid();
      return;
    }

    if (this.selectedSrc < 0) {
      this.selectSegment(colIdx, ballIdx);
      return;
    }

    if (this.selectedSrc === colIdx) {
      if (this.selectedJ === ballIdx) {
        this.deselectSegment();
      } else {
        this.deselectSegment();
        this.selectSegment(colIdx, ballIdx);
      }
      return;
    }

    this.attemptMoveTo(colIdx);
  }

  private handleTubeClick(colIdx: number) {
    if (this.isAnimating || this.isDragging) return;

    if (this.selectedSrc < 0) {
      const col = this.session.state.cols[colIdx];
      if (!col || col.length === 0) return;
      if (EngineCore.isLocked(this.session.state, colIdx)) {
        this.shakeTube(colIdx);
        this.soundMgr.playInvalid();
        return;
      }
      const j = this.session.topRunStart(colIdx);
      this.selectSegment(colIdx, j);
      return;
    }

    if (this.selectedSrc === colIdx) {
      this.deselectSegment();
      return;
    }

    this.attemptMoveTo(colIdx);
  }

  private attemptMoveTo(dst: number) {
    const src = this.selectedSrc;
    const j = this.selectedJ;
    const res = this.session.tryMove(src, j, dst);
    if (!res.ok) {
      this.shakeTube(dst);
      this.soundMgr.playInvalid();
      this.deselectSegment();
      return;
    }
    this.animateMove(src, j, dst, res.events);
  }

  private selectSegment(src: number, j: number) {
    this.selectedSrc = src;
    this.selectedJ = j;
    this.soundMgr.playSelect();

    const tube = this.tubes[src];
    const sprites = tube.ballSprites.slice(j);
    this.liftedSprites = sprites;

    sprites.forEach((sp, i) => {
      this.tweens.add({
        targets: sp,
        y: sp.y - 45 - i * 4,
        duration: 140,
        ease: 'Quad.easeOut'
      });
    });

    this.highlightValidDestinations(src, j);
  }

  private deselectSegment() {
    this.tubes.forEach(t => {
      this.tweens.killTweensOf(t.container);
      t.container.setScale(1.0);
    });

    if (this.selectedSrc >= 0 && this.tubes[this.selectedSrc]) {
      const tube = this.tubes[this.selectedSrc];
      const r = tube.width / 2;
      const baseY = tube.height / 2 - r / 2 - 8;
      const ballSize = tube.ballSize;

      this.liftedSprites.forEach((sp, i) => {
        const origY = baseY - (this.selectedJ + i) * ballSize;
        this.tweens.add({
          targets: sp,
          y: origY,
          duration: 140,
          ease: 'Bounce.easeOut'
        });
      });
    }

    this.selectedSrc = -1;
    this.selectedJ = -1;
    this.liftedSprites = [];
  }

  private animateMove(src: number, j: number, dst: number, events: GameEvent[]) {
    this.isAnimating = true;
    this.dragCandidate = null;

    this.tubes.forEach(t => {
      this.tweens.killTweensOf(t.container);
      t.container.setScale(1.0);
    });

    const srcTube = this.tubes[src];
    const dstTube = this.tubes[dst];
    const movingSprites = srcTube.ballSprites.slice(j);

    const ballSize = dstTube.ballSize;
    const r = dstTube.width / 2;
    const destBaseY = dstTube.height / 2 - r / 2 - 8;
    const destStartIdx = dstTube.ballSprites.length;

    let completed = 0;
    const totalMoving = movingSprites.length;

    movingSprites.forEach((sp, i) => {
      const worldStart = srcTube.container.getWorldTransformMatrix().transformPoint(sp.x, sp.y);
      srcTube.container.remove(sp);
      this.add.existing(sp);
      sp.setPosition(worldStart.x, worldStart.y);

      const targetColIdx = destStartIdx + i;
      const worldTargetY = dstTube.y + destBaseY - targetColIdx * ballSize;
      const worldTargetX = dstTube.x;

      this.tweens.add({
        targets: sp,
        x: worldTargetX,
        y: worldTargetY,
        duration: 240,
        delay: i * 30,
        ease: 'Quad.easeInOut',
        onComplete: () => {
          sp.destroy();
          this.soundMgr.playLand();
          completed++;
          if (completed === totalMoving) {
            this.selectedSrc = -1;
            this.selectedJ = -1;
            this.liftedSprites = [];
            this.processEvents(events);
          }
        }
      });
    });
  }

  private processEvents(events: GameEvent[]) {
    this.updateHUD();

    events.forEach(ev => {
      if (ev.type === 'collected') {
        this.soundMgr.playCollect();
        if (this.tubes[ev.col]) {
          this.burstParticles(this.tubes[ev.col].x, this.tubes[ev.col].y);
        }
      } else if (ev.type === 'unlocked') {
        this.soundMgr.playUnlock();
      } else if (ev.type === 'revealed') {
        this.soundMgr.playReveal();
      }
    });

    const theme = this.meta.getTheme();
    this.tubes.forEach(t => {
      this.drawTubeSkin(t, t.width, t.height, theme);
      this.redrawBallsInTube(t, t.ballSize);
    });

    this.isAnimating = false;

    if (this.session.isWon()) {
      this.soundMgr.playWin();
      this.showWinModal();
      return;
    }

    const dead = this.session.deadReason();
    if (dead !== '') {
      this.soundMgr.playDeadlock();
      this.showDeadlockModal(dead);
    }
  }

  private shakeTube(colIdx: number) {
    const t = this.tubes[colIdx];
    if (!t) return;
    this.tweens.add({
      targets: t.container,
      x: t.x + 8,
      duration: 35,
      yoyo: true,
      repeat: 3,
      onComplete: () => t.container.setX(t.x)
    });
  }

  private burstParticles(x: number, y: number) {
    const emitter = this.add.particles(x, y, 'sparkle', {
      speed: { min: 80, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      blendMode: 'ADD',
      lifespan: 600,
      quantity: 24,
      stopAfter: 24
    });
    this.time.delayedCall(800, () => emitter.destroy());
  }

  // ==========================
  // HUD & Modals
  // ==========================

  private buildHUD() {
    this.hudContainer = this.add.container(0, 0);

    const theme = this.meta.getTheme();
    this.hudBarBg = this.add.graphics();
    this.hudBarBg.fillStyle(theme.hudBg, 0.96);
    this.hudBarBg.fillRoundedRect(16, 16, 688, 84, 18);
    this.hudBarBg.lineStyle(2.5, theme.accent, 0.72);
    this.hudBarBg.strokeRoundedRect(16, 16, 688, 84, 18);
    this.hudContainer.add(this.hudBarBg);

    this.levelText = this.add.text(36, 42, 'LEVEL 1', {
      fontFamily: 'sans-serif',
      fontSize: '25px',
      fontStyle: 'bold',
      color: '#ffffff'
    });
    this.hudContainer.add(this.levelText);

    // Progress counter
    this.progressText = this.add.text(215, 43, '🎯 0/3', {
      fontFamily: 'sans-serif',
      fontSize: '22px',
      color: '#00f5d4'
    });
    this.hudContainer.add(this.progressText);

    // Streak & Coins
    this.streakText = this.add.text(340, 43, '🔥0', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      color: '#ffaa00'
    });
    this.hudContainer.add(this.streakText);

    this.coinsText = this.add.text(405, 43, '💰0', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      color: '#ffd166'
    });
    this.hudContainer.add(this.coinsText);

    // Direct Skin Selector Button (🎨)
    const skinBtn = this.add.text(490, 42, '🎨', { fontSize: '24px' })
      .setInteractive({ useHandCursor: true });
    skinBtn.on('pointerdown', () => this.showSkinSelectorModal());
    this.hudContainer.add(skinBtn);

    const helpBtn = this.add.text(542, 42, '❓', { fontSize: '24px' })
      .setInteractive({ useHandCursor: true });
    helpBtn.on('pointerdown', () => this.showHowToPlayModal());
    this.hudContainer.add(helpBtn);

    const dbgBtn = this.add.text(596, 42, '🛠️', { fontSize: '24px' })
      .setInteractive({ useHandCursor: true });
    dbgBtn.on('pointerdown', () => this.showDebugModal());
    this.hudContainer.add(dbgBtn);

    const setBtn = this.add.text(650, 42, '⚙️', { fontSize: '24px' })
      .setInteractive({ useHandCursor: true });
    setBtn.on('pointerdown', () => this.showSettingsModal());
    this.hudContainer.add(setBtn);

    this.buildBottomBar();
  }

  private buildBottomBar() {
    // Placed right below Top Header Bar (y = 136) so tall 6-ball tubes never cover these 3 buttons
    const actionY = 136;

    const undoCont = this.add.container(205, actionY);
    undoCont.setDepth(20);
    const bg1 = this.add.graphics();
    bg1.fillStyle(CORE_UI_COLORS.btnUndoBg, 0.92);
    bg1.fillRoundedRect(-70, -24, 140, 48, 14);
    bg1.lineStyle(2, 0xffffff, 0.3);
    bg1.strokeRoundedRect(-70, -24, 140, 48, 14);
    this.undoBtnText = this.add.text(0, 0, '↩ Undo (3)', {
      fontFamily: 'sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: CORE_UI_COLORS.textPrimary
    }).setOrigin(0.5);
    undoCont.add([bg1, this.undoBtnText]);
    undoCont.setSize(140, 48).setInteractive({ useHandCursor: true });
    undoCont.on('pointerdown', () => this.handleUndo());

    const hintCont = this.add.container(360, actionY);
    hintCont.setDepth(20);
    const bg2 = this.add.graphics();
    bg2.fillStyle(CORE_UI_COLORS.btnHintBg, 0.92);
    bg2.fillRoundedRect(-70, -24, 140, 48, 14);
    bg2.lineStyle(2, CORE_UI_COLORS.btnHintBorder, 0.8);
    bg2.strokeRoundedRect(-70, -24, 140, 48, 14);
    const hintTxt = this.add.text(0, 0, '💡 Hint', {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: CORE_UI_COLORS.textPrimary
    }).setOrigin(0.5);
    hintCont.add([bg2, hintTxt]);
    hintCont.setSize(140, 48).setInteractive({ useHandCursor: true });
    hintCont.on('pointerdown', () => this.handleHint());

    this.extraTubeBtn = this.add.container(515, actionY);
    this.extraTubeBtn.setDepth(20);
    const bg3 = this.add.graphics();
    bg3.fillStyle(CORE_UI_COLORS.btnExtraTubeBg, 0.92);
    bg3.fillRoundedRect(-70, -24, 140, 48, 14);
    bg3.lineStyle(2, CORE_UI_COLORS.btnExtraTubeBorder, 0.8);
    bg3.strokeRoundedRect(-70, -24, 140, 48, 14);
    const tubeTxt = this.add.text(0, 0, '🧪 +Tube', {
      fontFamily: 'sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: CORE_UI_COLORS.textPrimary
    }).setOrigin(0.5);
    this.extraTubeBtn.add([bg3, tubeTxt]);
    this.extraTubeBtn.setSize(140, 48).setInteractive({ useHandCursor: true });
    this.extraTubeBtn.on('pointerdown', () => this.handleExtraTube());
  }

  private updateHUD() {
    if (this.isDailyMode) {
      this.levelText.setText('📅 DAILY');
    } else {
      const badge = this.progression.getBadge();
      const badgeTag = badge === 'VERY_HARD' ? ' 🔥' : badge === 'HARD' ? ' ⚡' : '';
      this.levelText.setText(`LEVEL ${this.progression.current_level}${badgeTag}`);
    }

    const prog = this.session.progress();
    this.progressText.setText(`🎯 ${prog.done}/${prog.total}`);
    this.streakText.setText(`🔥${this.meta.winStreak}`);
    this.coinsText.setText(`💰${this.meta.coins}`);

    const remainingUndo = Math.max(0, 3 - this.session.undos_used);
    this.undoBtnText.setText(`↩ Undo (${remainingUndo})`);
  }

  private handleUndo() {
    if (this.session.undo()) {
      this.soundMgr.playSelect();
      this.renderBoard();
      this.updateHUD();
    } else {
      this.soundMgr.playInvalid();
    }
  }

  private handleHint() {
    const hintMove = this.session.hint();
    if (!hintMove) {
      this.soundMgr.playInvalid();
      return;
    }
    this.soundMgr.playSelect();
    this.deselectSegment();

    const srcT = this.tubes[hintMove.src];
    const dstT = this.tubes[hintMove.dst];
    if (srcT && dstT) {
      this.tweens.add({
        targets: [srcT.container, dstT.container],
        scale: 1.1,
        duration: 180,
        yoyo: true,
        repeat: 2
      });
    }
  }

  private handleExtraTube() {
    const col = this.session.addExtraTube();
    if (col >= 0) {
      this.soundMgr.playUnlock();
      this.renderBoard();
      this.updateHUD();
    } else {
      this.soundMgr.playInvalid();
    }
  }

  private showHowToPlayModal() {
    this.closeModal();
    const m = this.add.container(360, 640);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.82);
    bg.fillRect(-360, -640, 720, 1280);
    bg.fillStyle(0x161b26, 0.98);
    bg.fillRoundedRect(-300, -450, 600, 900, 24);
    bg.lineStyle(3, 0x00bbf9, 0.8);
    bg.strokeRoundedRect(-300, -450, 600, 900, 24);
    m.add(bg);

    const title = this.add.text(0, -390, '📖 LUẬT CHƠI (HOW TO PLAY)', {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    m.add(title);

    const cards = [
      {
        h: '1. Chuyển đoạn nhiều bóng (Multi-Color)',
        b: 'Chạm hoặc kéo từ BẤT KỲ quả bóng nào trong ống để nhấc nó cùng toàn bộ bóng bên trên. Chỉ cần bóng đáy cụm trùng màu với bóng đỉnh ống đích (hoặc thả vào ống trống).'
      },
      {
        h: '2. Lấp đầy ống mục tiêu & Thay thế',
        b: 'Mỗi ống có màu mục tiêu ở chân đế. Khi ống chứa đầy bóng cùng màu mục tiêu, ống sẽ được thu thập và ống mới từ hàng đợi sẽ trượt vào thay thế.'
      },
      {
        h: '3. Bóng bí ẩn (?) & Ống khóa (🔒)',
        b: 'Bóng (?) không thể đặt lên ống đã có bóng, nó tự lật mở màu khi lên đỉnh. Ống khóa (🔒 xN hoặc 🔒 màu) sẽ tự mở khi bạn thu thập đủ số mục tiêu yêu cầu.'
      },
      {
        h: '4. Trợ thủ (Undo, Hint, +Tube)',
        b: 'Dùng Undo đi lại (tối đa 3 lần), Hint gợi ý nước đi tốt nhất, hoặc +Tube thêm 1 ống trống khi bị kẹt.'
      }
    ];

    cards.forEach((c, idx) => {
      const cy = -260 + idx * 165;
      const cardBg = this.add.graphics();
      cardBg.fillStyle(0x222938, 1);
      cardBg.fillRoundedRect(-270, cy - 65, 540, 145, 14);
      m.add(cardBg);

      const hTxt = this.add.text(-250, cy - 50, c.h, {
        fontSize: '19px',
        fontStyle: 'bold',
        color: '#ffd166'
      });
      const bTxt = this.add.text(-250, cy - 20, c.b, {
        fontSize: '16px',
        color: '#dbe4f0',
        wordWrap: { width: 500 }
      });
      m.add([hTxt, bTxt]);
    });

    const closeBtn = this.add.container(0, 380);
    const cbg = this.add.graphics();
    cbg.fillStyle(0x00bbf9, 1);
    cbg.fillRoundedRect(-120, -28, 240, 56, 14);
    const ctxt = this.add.text(0, 0, 'ĐÃ HIỂU!', {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    closeBtn.add([cbg, ctxt]);
    closeBtn.setSize(240, 56).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeModal());
    m.add(closeBtn);

    this.activeModal = m;
  }

  private showLevelSelectModal() {
    this.closeModal();
    const m = this.add.container(360, 640);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.82);
    bg.fillRect(-360, -640, 720, 1280);
    bg.fillStyle(0x161b26, 0.98);
    bg.fillRoundedRect(-290, -400, 580, 800, 24);
    bg.lineStyle(2, 0x00f5d4, 0.7);
    bg.strokeRoundedRect(-290, -400, 580, 800, 24);
    m.add(bg);

    const title = this.add.text(0, -345, 'CHỌN MÀN CHƠI', {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    m.add(title);

    const today = new Date().toISOString().slice(0, 10);
    const dailyDone = this.meta.isDailyCompleted(today);
    const dailyBtn = this.add.text(0, -285, dailyDone ? `📅 Daily (${today}) ✅` : `📅 Chơi Thử Thách Ngày (${today})`, {
      fontSize: '20px',
      fontStyle: 'bold',
      color: dailyDone ? '#00f5d4' : '#ffd166'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    dailyBtn.on('pointerdown', () => this.startLevel(15, today));
    m.add(dailyBtn);

    const maxShow = Math.max(20, this.progression.max_unlocked_level + 4);
    const cols = 4;
    for (let i = 0; i < Math.min(20, maxShow); i++) {
      const lvNum = i + 1;
      const unlocked = lvNum <= this.progression.max_unlocked_level;
      const gx = -195 + (i % cols) * 130;
      const gy = -200 + Math.floor(i / cols) * 100;

      const cell = this.add.container(gx, gy);
      const cellBg = this.add.graphics();
      cellBg.fillStyle(unlocked ? 0x264653 : 0x1b1f29, 1);
      cellBg.fillRoundedRect(-50, -35, 100, 70, 12);
      if (lvNum === this.progression.current_level) {
        cellBg.lineStyle(3, 0x00f5d4, 1);
        cellBg.strokeRoundedRect(-50, -35, 100, 70, 12);
      }

      const txt = this.add.text(0, 0, unlocked ? `${lvNum}` : `🔒`, {
        fontSize: '22px',
        fontStyle: 'bold',
        color: unlocked ? '#ffffff' : '#666666'
      }).setOrigin(0.5);

      cell.add([cellBg, txt]);
      if (unlocked) {
        cell.setSize(100, 70).setInteractive({ useHandCursor: true });
        cell.on('pointerdown', () => this.startLevel(lvNum));
      }
      m.add(cell);
    }

    const closeBtn = this.add.text(0, 340, '✕ ĐÓNG', {
      fontSize: '22px',
      color: '#cccccc'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeModal());
    m.add(closeBtn);

    this.activeModal = m;
  }

  private showWinModal() {
    this.closeModal();
    const clearedLevel = this.progression.current_level;
    const elapsedSec = Math.max(1, Math.floor((Date.now() - this.levelStartTime) / 1000));
    const mins = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
    const secs = (elapsedSec % 60).toString().padStart(2, '0');
    const timeStr = `${mins}:${secs}`;

    const parMoves = Math.max(5, this.session.level.total_targets * 3);
    const isPerfect = this.session.undos_used === 0 && !this.session.state.extra_used;
    const reward = this.meta.rewardWin(isPerfect);
    const earnedCoins = reward.coins * 5; // richer Victory coin reward
    this.meta.coins += earnedCoins - reward.coins;

    const totalScore = Math.max(
      1000,
      clearedLevel * 350 + reward.stars * 500 + Math.max(0, parMoves - this.session.moves) * 120 + Math.max(0, 120 - elapsedSec) * 15
    );

    if (this.isDailyMode) {
      this.meta.markDailyCompleted(this.dailyDateStr);
    } else {
      this.progression.onWin();
    }
    this.energy.resetStrikes();
    StorageService.save(this.progression, this.meta, this.settings, this.energy);
    this.updateHUD();

    const m = this.add.container(360, 640);
    m.setDepth(1000);

    // Backdrop
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.82);
    bg.fillRect(-360, -640, 720, 1280);

    // Main Card Panel
    bg.fillStyle(0x1b2232, 0.98);
    bg.fillRoundedRect(-275, -415, 550, 845, 28);
    bg.lineStyle(2, 0x323e57, 0.9);
    bg.strokeRoundedRect(-275, -415, 550, 845, 28);
    m.add(bg);

    // 1. Overlapping Gold VICTORY! Banner
    const banner = this.add.container(0, -415);
    const bGraphics = this.add.graphics();
    bGraphics.fillStyle(0xc59225, 1);
    bGraphics.fillRoundedRect(-195, -36, 390, 76, 38);
    bGraphics.fillStyle(0xf2c94c, 1);
    bGraphics.fillRoundedRect(-195, -40, 390, 72, 36);
    bGraphics.lineStyle(2, 0xfff0a5, 0.8);
    bGraphics.strokeRoundedRect(-195, -40, 390, 72, 36);
    const bTxt = this.add.text(0, -4, '🏆  VICTORY!  🏅', {
      fontFamily: 'sans-serif',
      fontSize: '34px',
      fontStyle: 'bold',
      color: '#3b2606'
    }).setOrigin(0.5);
    banner.add([bGraphics, bTxt]);
    m.add(banner);

    // 2. Subtitle Pill: ● LEVEL N · PERFECT
    const subBg = this.add.graphics();
    subBg.fillStyle(0x111722, 0.95);
    subBg.fillRoundedRect(-145, -365, 290, 30, 15);
    m.add(subBg);

    const subLabel = this.isDailyMode
      ? `● DAILY CHALLENGE · ${isPerfect ? 'PERFECT' : 'CLEARED'}`
      : `● LEVEL ${clearedLevel} · ${isPerfect ? 'PERFECT' : 'CLEARED'}`;
    const subTxt = this.add.text(0, -350, subLabel, {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#00f5d4'
    }).setOrigin(0.5);
    m.add(subTxt);

    // 3. Three Tilted Star Cards
    const starConfigs = [
      { x: -125, y: -242, size: 96, angle: -10, delay: 120, active: reward.stars >= 1 },
      { x: 0, y: -260, size: 118, angle: 0, delay: 240, active: reward.stars >= 2 },
      { x: 125, y: -242, size: 96, angle: 10, delay: 360, active: reward.stars >= 3 }
    ];
    starConfigs.forEach((sc, idx) => {
      const sCard = this.add.container(sc.x, sc.y);
      sCard.setAngle(sc.angle);
      const sg = this.add.graphics();
      const half = sc.size / 2;
      if (idx === 1 && sc.active) {
        sg.fillStyle(0xffd166, 0.14);
        sg.fillRoundedRect(-half - 8, -half - 8, sc.size + 16, sc.size + 16, 26);
      }
      sg.fillStyle(0x131926, 1);
      sg.fillRoundedRect(-half, -half, sc.size, sc.size, 22);
      sg.lineStyle(2, sc.active ? 0x3b4863 : 0x222938, 1);
      sg.strokeRoundedRect(-half, -half, sc.size, sc.size, 22);

      const starChar = this.add.text(0, 0, sc.active ? '★' : '☆', {
        fontSize: idx === 1 ? '66px' : '50px',
        color: sc.active ? '#f6d365' : '#3a455d'
      }).setOrigin(0.5);
      sCard.add([sg, starChar]);

      if (idx === 1) {
        const spark = this.add.text(-46, -54, '✨', { fontSize: '20px' }).setOrigin(0.5);
        sCard.add(spark);
      }

      sCard.setScale(0);
      this.tweens.add({
        targets: sCard,
        scale: 1,
        duration: 280,
        delay: sc.delay,
        ease: 'Back.easeOut'
      });
      m.add(sCard);
    });

    // 4. Score & Stats Panel
    const scorePanel = this.add.graphics();
    scorePanel.fillStyle(0x121824, 1);
    scorePanel.fillRoundedRect(-240, -172, 480, 148, 18);
    scorePanel.lineStyle(1.5, 0x2a344a, 1);
    scorePanel.strokeRoundedRect(-240, -172, 480, 148, 18);
    m.add(scorePanel);

    const scoreLbl = this.add.text(-216, -154, 'TOTAL SCORE', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#8b9ab0'
    });
    const scoreVal = this.add.text(-216, -132, totalScore.toLocaleString('en-US'), {
      fontFamily: 'sans-serif',
      fontSize: '40px',
      fontStyle: 'bold',
      color: '#ffffff'
    });
    m.add([scoreLbl, scoreVal]);

    // NEW RECORD Pill
    const recBg = this.add.graphics();
    recBg.fillStyle(0x00e5be, 1);
    recBg.fillRoundedRect(54, -142, 164, 34, 17);
    const recTxt = this.add.text(136, -125, '🏅 NEW RECORD', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#072a23'
    }).setOrigin(0.5);
    m.add([recBg, recTxt]);

    // Moves & Time Pills
    const statBg = this.add.graphics();
    statBg.fillStyle(0x182132, 1);
    statBg.fillRoundedRect(-220, -78, 212, 40, 12);
    statBg.fillRoundedRect(8, -78, 212, 40, 12);
    m.add(statBg);

    const movesTxt = this.add.text(-114, -58, `👆 Moves: ${this.session.moves}/${parMoves}`, {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#dce4f0'
    }).setOrigin(0.5);
    const timeTxt = this.add.text(114, -58, `⏱️ Time: ${timeStr}`, {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#dce4f0'
    }).setOrigin(0.5);
    m.add([movesTxt, timeTxt]);

    // 5. REWARDS EARNED Divider
    const rewDivBg = this.add.graphics();
    rewDivBg.fillStyle(0x252f45, 1);
    rewDivBg.fillRoundedRect(-90, -14, 180, 26, 13);
    const rewDivTxt = this.add.text(0, -1, 'REWARDS EARNED', {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#a3b3c9'
    }).setOrigin(0.5);
    m.add([rewDivBg, rewDivTxt]);

    // 6. Three Reward Cards
    const rewardCards = [
      { x: -165, icon: '💲', iconBg: 0xf6d365, iconBgAlpha: 0.2, val: `+${earnedCoins}`, valColor: '#ffd166', sub: 'Coins' },
      { x: 0, icon: '🧪', iconBg: 0x00f5d4, iconBgAlpha: 0.18, val: '+1 Tube', valColor: '#00f5d4', sub: 'Extra' },
      { x: 165, icon: '💡', iconBg: 0x00bbf9, iconBgAlpha: 0.18, val: '+1 Hint', valColor: '#56ccf2', sub: 'Tip' }
    ];
    let coinCardValTxt!: Phaser.GameObjects.Text;
    rewardCards.forEach((rc, idx) => {
      const rCard = this.add.graphics();
      rCard.fillStyle(0x131926, 1);
      rCard.fillRoundedRect(rc.x - 75, 24, 150, 122, 16);
      rCard.lineStyle(1.5, 0x29344b, 1);
      rCard.strokeRoundedRect(rc.x - 75, 24, 150, 122, 16);
      rCard.fillStyle(rc.iconBg, rc.iconBgAlpha);
      rCard.fillCircle(rc.x, 60, 22);
      m.add(rCard);

      const icTxt = this.add.text(rc.x, 60, rc.icon, { fontSize: '20px' }).setOrigin(0.5);
      const valTxt = this.add.text(rc.x, 102, rc.val, {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: rc.valColor
      }).setOrigin(0.5);
      const subLbl = this.add.text(rc.x, 126, rc.sub, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#8b9ab0'
      }).setOrigin(0.5);

      if (idx === 0) coinCardValTxt = valTxt;
      m.add([icTxt, valTxt, subLbl]);
    });

    // 7. CLAIM 2X REWARD (WATCH AD) Gold Button
    let claimed2x = false;
    const claimBtn = this.add.container(0, 192);
    const claimBg = this.add.graphics();
    claimBg.fillStyle(0xf6d365, 1);
    claimBg.fillRoundedRect(-240, -30, 480, 60, 16);
    const claimTxt = this.add.text(0, 0, '▶  CLAIM 2X REWARD (WATCH AD)', {
      fontFamily: 'sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#3b2606'
    }).setOrigin(0.5);
    claimBtn.add([claimBg, claimTxt]);
    claimBtn.setSize(480, 60).setInteractive({ useHandCursor: true });
    claimBtn.on('pointerdown', () => {
      if (claimed2x) return;
      claimed2x = true;
      this.meta.coins += earnedCoins;
      StorageService.save(this.progression, this.meta, this.settings);
      this.updateHUD();
      this.soundMgr.playCollect();
      coinCardValTxt.setText(`+${earnedCoins * 2}`);
      claimBg.clear();
      claimBg.fillStyle(0x4a5568, 1);
      claimBg.fillRoundedRect(-240, -30, 480, 60, 16);
      claimTxt.setText('✓ 2X REWARD CLAIMED!').setColor('#00f5d4');
    });
    m.add(claimBtn);

    // 8. NEXT LEVEL Green Primary Button
    const nextBtn = this.add.container(0, 266);
    const nextBg = this.add.graphics();
    nextBg.fillStyle(0x3ba55d, 1);
    nextBg.fillRoundedRect(-240, -32, 480, 64, 16);
    const nextTxt = this.add.text(0, 0, 'NEXT LEVEL  ➔', {
      fontFamily: 'sans-serif',
      fontSize: '21px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    nextBtn.add([nextBg, nextTxt]);
    nextBtn.setSize(480, 64).setInteractive({ useHandCursor: true });
    nextBtn.on('pointerdown', () => {
      this.soundMgr.playSelect();
      this.startLevel(this.progression.current_level);
    });
    m.add(nextBtn);

    // 9. Bottom 3 Utility Icon Buttons (Replay, Home/Levels, Share)
    const utilBtns = [
      { x: -90, icon: '↺', action: () => this.startLevel(clearedLevel, this.dailyDateStr) },
      { x: 0, icon: '🏠', action: () => this.showLevelSelectModal() },
      {
        x: 90,
        icon: '🔗',
        action: () => {
          const shareMsg = `NOZVI Ball Sort - Level ${clearedLevel} Cleared! Score: ${totalScore}`;
          navigator.clipboard?.writeText(shareMsg).catch(() => {});
          this.soundMgr.playSelect();
        }
      }
    ];
    utilBtns.forEach(ub => {
      const uCont = this.add.container(ub.x, 355);
      const uBg = this.add.graphics();
      uBg.fillStyle(0x232d42, 1);
      uBg.fillRoundedRect(-34, -34, 68, 68, 16);
      uBg.lineStyle(1.5, 0x364463, 1);
      uBg.strokeRoundedRect(-34, -34, 68, 68, 16);
      const uTxt = this.add.text(0, 0, ub.icon, {
        fontSize: '26px',
        color: '#dbe4f0'
      }).setOrigin(0.5);
      uCont.add([uBg, uTxt]);
      uCont.setSize(68, 68).setInteractive({ useHandCursor: true });
      uCont.on('pointerdown', ub.action);
      m.add(uCont);
    });

    this.activeModal = m;
  }

  private showDeadlockModal(reason: string) {
    this.closeModal();
    const failedLevel = this.progression.current_level;
    const elapsedSec = Math.max(1, Math.floor((Date.now() - this.levelStartTime) / 1000));
    const mins = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
    const secs = (elapsedSec % 60).toString().padStart(2, '0');
    const timeStr = `${mins}:${secs}`;

    const prog = this.session.progress();
    const pct = prog.total > 0 ? Math.min(99, Math.round((prog.done / prog.total) * 100)) : 0;
    const parMoves = Math.max(5, this.session.level.total_targets * 3);

    this.progression.onFail();
    this.meta.winStreak = 0;
    const lostLife = this.energy.recordDeadlock();
    StorageService.save(this.progression, this.meta, this.settings, this.energy);
    this.updateHUD();

    const m = this.add.container(360, 640);
    m.setDepth(1000);

    // Backdrop & Main Card
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.82);
    bg.fillRect(-360, -640, 720, 1280);
    bg.fillStyle(0x1b2232, 0.98);
    bg.fillRoundedRect(-275, -395, 550, 795, 28);
    bg.lineStyle(2, 0x323e57, 0.9);
    bg.strokeRoundedRect(-275, -395, 550, 795, 28);
    m.add(bg);

    // 1. Overlapping Banner (Orange Warning for Strike 1-2, Red LEVEL FAILED for Strike 3)
    const banner = this.add.container(0, -395);
    const bGraphics = this.add.graphics();
    const bannerDark = lostLife ? 0xa81d2b : 0xb45309;
    const bannerMain = lostLife ? 0xe63946 : 0xf59e0b;
    const bannerStroke = lostLife ? 0xff758f : 0xfde68a;
    bGraphics.fillStyle(bannerDark, 1);
    bGraphics.fillRoundedRect(-205, -34, 410, 72, 36);
    bGraphics.fillStyle(bannerMain, 1);
    bGraphics.fillRoundedRect(-205, -38, 410, 68, 34);
    bGraphics.lineStyle(2, bannerStroke, 0.7);
    bGraphics.strokeRoundedRect(-205, -38, 410, 68, 34);
    const bannerText = lostLife
      ? '💔  LEVEL FAILED! (-1 ⚡)'
      : `⚠️  BẾ TẮC (${this.energy.deadlockStrikes}/3)  ⚠️`;
    const bTxt = this.add.text(0, -4, bannerText, {
      fontFamily: 'sans-serif',
      fontSize: lostLife ? '27px' : '26px',
      fontStyle: 'bold',
      color: lostLife ? '#ffffff' : '#2b1900'
    }).setOrigin(0.5);
    banner.add([bGraphics, bTxt]);
    m.add(banner);

    // Top-right Red X Close Button
    const xBtn = this.add.container(255, -385);
    const xBg = this.add.graphics();
    xBg.fillStyle(0xe63946, 1);
    xBg.fillCircle(0, 0, 24);
    xBg.lineStyle(2, 0xff8fa3, 0.8);
    xBg.strokeCircle(0, 0, 24);
    const xTxt = this.add.text(0, -1, '✕', {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    xBtn.add([xBg, xTxt]);
    xBtn.setSize(48, 48).setInteractive({ useHandCursor: true });
    xBtn.on('pointerdown', () => this.closeModal());
    m.add(xBtn);

    // 2. Subtitle Pill: ● LEVEL N · OUT OF MOVES
    const reasonLabel = reason === 'doomed' ? 'DOOMED BOARD' : reason === 'closed_cycle' ? 'CLOSED LOOP' : 'OUT OF MOVES';
    const subBg = this.add.graphics();
    subBg.fillStyle(0x111722, 0.95);
    subBg.fillRoundedRect(-155, -338, 310, 30, 15);
    const subTxt = this.add.text(0, -323, `● LEVEL ${failedLevel} · ${reasonLabel}`, {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffd166'
    }).setOrigin(0.5);
    m.add([subBg, subTxt]);

    // 3. Cracked Test Tube Illustration
    const tubeIllust = this.add.graphics();
    // Subtle red/orange glow behind tube
    tubeIllust.fillStyle(0xff5400, 0.14);
    tubeIllust.fillCircle(0, -210, 62);
    // Tube outline
    tubeIllust.lineStyle(4, 0x4b5c78, 1);
    tubeIllust.strokeRoundedRect(-24, -270, 48, 110, { tl: 4, tr: 4, bl: 24, br: 24 });
    // Tube rim
    tubeIllust.fillStyle(0x5c6e8c, 1);
    tubeIllust.fillRoundedRect(-30, -276, 60, 10, 5);
    // Orange/Red liquid at bottom
    tubeIllust.fillStyle(0xff4d29, 0.92);
    tubeIllust.fillRoundedRect(-20, -196, 40, 32, { tl: 0, tr: 0, bl: 20, br: 20 });
    // Lightning crack
    tubeIllust.lineStyle(3, 0xff9f1c, 1);
    tubeIllust.lineBetween(-6, -245, 8, -225);
    tubeIllust.lineBetween(8, -225, -4, -212);
    tubeIllust.lineBetween(-4, -212, 6, -195);
    m.add(tubeIllust);

    // 4. Progress Panel
    const progPanel = this.add.graphics();
    progPanel.fillStyle(0x121824, 1);
    progPanel.fillRoundedRect(-235, -125, 470, 138, 18);
    progPanel.lineStyle(1.5, 0x2a344a, 1);
    progPanel.strokeRoundedRect(-235, -125, 470, 138, 18);
    m.add(progPanel);

    const progLbl = this.add.text(-210, -104, 'PROGRESS', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#8b9ab0'
    });
    const pctTxt = this.add.text(210, -110, `${pct}%`, {
      fontFamily: 'sans-serif',
      fontSize: '30px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(1, 0);
    m.add([progLbl, pctTxt]);

    // Progress Bar Track & Fill
    const barW = 420;
    const fillW = Math.max(24, Math.round((barW * pct) / 100));
    const barG = this.add.graphics();
    barG.fillStyle(0x0b0f17, 1);
    barG.fillRoundedRect(-210, -64, barW, 14, 7);
    barG.fillStyle(0xff7b00, 1);
    barG.fillRoundedRect(-210, -64, fillW, 14, 7);
    m.add(barG);

    const movesTxt = this.add.text(-210, -24, `⇄ Moves: ${this.session.moves}/${parMoves}`, {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#dce4f0'
    });
    const timeTxt = this.add.text(210, -24, `⏱️ Time: ${timeStr}`, {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#dce4f0'
    }).setOrigin(1, 0);
    m.add([movesTxt, timeTxt]);

    // 5. Three Stacked Action Buttons
    // Green Button: GET +MOVES / UNDO (WATCH AD)
    const undoBtn = this.add.container(0, 62);
    const uBg = this.add.graphics();
    uBg.fillStyle(0x3ba55d, 1);
    uBg.fillRoundedRect(-235, -30, 470, 60, 16);
    const uTxt = this.add.text(0, 0, '▶  UNDO & CONTINUE (WATCH AD)', {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    undoBtn.add([uBg, uTxt]);
    undoBtn.setSize(470, 60).setInteractive({ useHandCursor: true });
    undoBtn.on('pointerdown', () => {
      this.closeModal();
      this.handleUndo();
    });
    m.add(undoBtn);

    // Gold Button: +1 EXTRA TUBE (100 Coins)
    const canExtra = !this.session.state.extra_used;
    const extraBtn = this.add.container(0, 136);
    const eBg = this.add.graphics();
    eBg.fillStyle(canExtra ? 0xf6d365 : 0x4a5568, 1);
    eBg.fillRoundedRect(-235, -30, 470, 60, 16);
    const eTxt = this.add.text(0, 0, canExtra ? '🧪  +1 EXTRA TUBE (FREE / RESCUE)' : '🧪  EXTRA TUBE ALREADY USED', {
      fontFamily: 'sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: canExtra ? '#3b2606' : '#a0aec0'
    }).setOrigin(0.5);
    extraBtn.add([eBg, eTxt]);
    if (canExtra) {
      extraBtn.setSize(470, 60).setInteractive({ useHandCursor: true });
      extraBtn.on('pointerdown', () => {
        this.closeModal();
        this.handleExtraTube();
      });
    }
    m.add(extraBtn);

    // Red Button: TRY AGAIN
    const retryBtn = this.add.container(0, 210);
    const rBg = this.add.graphics();
    rBg.fillStyle(0xe63946, 1);
    rBg.fillRoundedRect(-235, -30, 470, 60, 16);
    const rTxt = this.add.text(0, 0, '↺  TRY AGAIN', {
      fontFamily: 'sans-serif',
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    retryBtn.add([rBg, rTxt]);
    retryBtn.setSize(470, 60).setInteractive({ useHandCursor: true });
    retryBtn.on('pointerdown', () => {
      if (!this.energy.hasLife()) {
        this.showOutOfLivesModal();
      } else {
        this.startLevel(failedLevel, this.dailyDateStr);
      }
    });
    m.add(retryBtn);

    // 6. Bottom 2 Utility Buttons (Home/Levels & Settings)
    const botBtns = [
      { x: -50, icon: '🏠', action: () => this.showLevelSelectModal() },
      { x: 50, icon: '⚙️', action: () => this.showSettingsModal() }
    ];
    botBtns.forEach(bb => {
      const bCont = this.add.container(bb.x, 305);
      const bBg = this.add.graphics();
      bBg.fillStyle(0x232d42, 1);
      bBg.fillRoundedRect(-34, -34, 68, 68, 16);
      bBg.lineStyle(1.5, 0x364463, 1);
      bBg.strokeRoundedRect(-34, -34, 68, 68, 16);
      const bTxt = this.add.text(0, 0, bb.icon, {
        fontSize: '26px',
        color: '#dbe4f0'
      }).setOrigin(0.5);
      bCont.add([bBg, bTxt]);
      bCont.setSize(68, 68).setInteractive({ useHandCursor: true });
      bCont.on('pointerdown', bb.action);
      m.add(bCont);
    });

    this.activeModal = m;
  }

  private showSkinSelectorModal() {
    this.closeModal();
    const m = this.add.container(360, 640);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.82);
    bg.fillRect(-360, -640, 720, 1280);
    bg.fillStyle(0x161b26, 0.98);
    bg.fillRoundedRect(-290, -390, 580, 780, 24);
    bg.lineStyle(3, 0xffd166, 0.8);
    bg.strokeRoundedRect(-290, -390, 580, 780, 24);
    m.add(bg);

    const title = this.add.text(0, -335, '🎨 CHỌN SKIN BÓNG', {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#ffd166'
    }).setOrigin(0.5);
    m.add(title);

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
      const nameTxt = this.add.text(-225, -36, labelName, {
        fontSize: '21px',
        fontStyle: 'bold',
        color: '#ffffff'
      });
      card.add(nameTxt);

      const statusTxt = this.add.text(225, -34, isActive ? '✅ ĐANG DÙNG' : 'CHỌN ➔', {
        fontSize: '16px',
        fontStyle: 'bold',
        color: isActive ? '#00f5d4' : '#ffd166'
      }).setOrigin(1, 0);
      card.add(statusTxt);

      // Preview 5 sample items from this skin
      for (let p = 0; p < 5; p++) {
        const key = t.useImageSkin ? `ball_${t.id}_${p}` : `ball_${t.id}_${p}`;
        const px = -195 + p * 60;
        const sp = this.add.sprite(px, 20, key);
        sp.setDisplaySize(46, 46);
        card.add(sp);
      }

      card.setSize(500, 116).setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => {
        this.meta.activeTheme = t.id;
        this.soundMgr.playSelect();
        this.updateBackground();
        this.renderBoard();
        StorageService.save(this.progression, this.meta, this.settings);
        this.closeModal();
      });

      m.add(card);
    });

    const closeBtn = this.add.text(0, 340, '✕ ĐÓNG', {
      fontSize: '22px',
      color: '#cccccc'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeModal());
    m.add(closeBtn);

    this.activeModal = m;
  }

  private showSettingsModal() {
    this.closeModal();
    const m = this.add.container(360, 640);
    m.setDepth(1000);

    // Backdrop & Compact Main Card
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.82);
    bg.fillRect(-360, -640, 720, 1280);
    bg.fillStyle(0x1b2232, 0.98);
    bg.fillRoundedRect(-255, -310, 510, 620, 26);
    bg.lineStyle(2, 0x323e57, 0.9);
    bg.strokeRoundedRect(-255, -310, 510, 620, 26);
    m.add(bg);

    // 1. Overlapping Crimson SETTINGS Banner
    const banner = this.add.container(0, -310);
    const bGraphics = this.add.graphics();
    bGraphics.fillStyle(0x8c0c19, 1);
    bGraphics.fillRoundedRect(-160, -30, 320, 64, 32);
    bGraphics.fillStyle(0xb81424, 1);
    bGraphics.fillRoundedRect(-160, -34, 320, 60, 30);
    bGraphics.lineStyle(2, 0xff758f, 0.5);
    bGraphics.strokeRoundedRect(-160, -34, 320, 60, 30);
    const bTxt = this.add.text(0, -4, '★  SETTINGS  ★', {
      fontFamily: 'sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    banner.add([bGraphics, bTxt]);
    m.add(banner);

    // Top-right Coral X Close Button
    const xBtn = this.add.container(238, -300);
    const xBg = this.add.graphics();
    xBg.fillStyle(0xff758f, 1);
    xBg.fillCircle(0, 0, 22);
    const xTxt = this.add.text(0, -1, '✕', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    xBtn.add([xBg, xTxt]);
    xBtn.setSize(44, 44).setInteractive({ useHandCursor: true });
    xBtn.on('pointerdown', () => this.closeModal());
    m.add(xBtn);

    // 2. Compact Status Row (Coins & Lives)
    const statusPills = this.add.graphics();
    statusPills.fillStyle(0x111722, 1);
    statusPills.fillRoundedRect(-220, -252, 212, 36, 18);
    statusPills.fillRoundedRect(8, -252, 212, 36, 18);
    m.add(statusPills);

    m.add(this.add.text(-114, -234, `🪙  ${this.meta.coins.toLocaleString('en-US')}`, {
      fontFamily: 'sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#ffd166'
    }).setOrigin(0.5));
    m.add(this.add.text(114, -234, `⚡ ${this.energy.lives} Mạng`, {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#00f5d4'
    }).setOrigin(0.5));

    // 3. Essential 3 Toggles (Sound, Haptics, Ball Symbols)
    const drawToggleSwitch = (g: Phaser.GameObjects.Graphics, on: boolean) => {
      g.clear();
      g.fillStyle(on ? 0x00e5be : 0x2c364a, 1);
      g.fillRoundedRect(-34, -17, 68, 34, 17);
      g.fillStyle(on ? 0xffffff : 0x7b889e, 1);
      g.fillCircle(on ? 17 : -17, 0, 13);
    };

    const toggleItems = [
      {
        y: -162,
        icon: '🔊',
        iconBg: 0x00bbf9,
        title: 'Âm thanh (Sound)',
        get: () => this.settings.soundEnabled,
        toggle: () => {
          this.settings.soundEnabled = !this.settings.soundEnabled;
          this.soundMgr.enabled = this.settings.soundEnabled;
        }
      },
      {
        y: -82,
        icon: '📳',
        iconBg: 0x3b4459,
        title: 'Rung (Haptics)',
        get: () => this.settings.hapticsEnabled,
        toggle: () => {
          this.settings.hapticsEnabled = !this.settings.hapticsEnabled;
        }
      },
      {
        y: -2,
        icon: '🔣',
        iconBg: 0xf6d365,
        title: 'Ký hiệu trên bóng',
        get: () => this.settings.colorBlindSymbols,
        toggle: () => {
          this.settings.colorBlindSymbols = !this.settings.colorBlindSymbols;
          this.settings.userToggledSymbols = true;
          this.renderBoard();
        }
      }
    ];

    toggleItems.forEach(item => {
      const row = this.add.container(0, item.y);
      const rBg = this.add.graphics();
      rBg.fillStyle(0x131926, 1);
      rBg.fillRoundedRect(-220, -32, 440, 64, 14);
      rBg.lineStyle(1, 0x263147, 1);
      rBg.strokeRoundedRect(-220, -32, 440, 64, 14);
      rBg.fillStyle(item.iconBg, 0.9);
      rBg.fillRoundedRect(-204, -20, 40, 40, 10);
      row.add(rBg);

      const ic = this.add.text(-184, 0, item.icon, { fontSize: '19px' }).setOrigin(0.5);
      const tLbl = this.add.text(-148, 0, item.title, {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff'
      }).setOrigin(0, 0.5);

      const swG = this.add.graphics();
      swG.setPosition(168, 0);
      drawToggleSwitch(swG, item.get());

      row.add([ic, tLbl, swG]);
      row.setSize(440, 64).setInteractive({ useHandCursor: true });
      row.on('pointerdown', () => {
        item.toggle();
        drawToggleSwitch(swG, item.get());
        this.soundMgr.playSelect();
        StorageService.save(this.progression, this.meta, this.settings, this.energy);
      });
      m.add(row);
    });

    // 4. Two Clean Navigation Buttons (Về Home & Xem Các Màn)
    const navBtns = [
      { x: -112, icon: '🏠  Về Home', color: 0x0077b6, action: () => this.scene.start('HomeScene') },
      { x: 112, icon: '🗺️  Xem Các Màn', color: 0x264653, action: () => this.scene.start('MapScene') }
    ];
    navBtns.forEach(nb => {
      const nCont = this.add.container(nb.x, 86);
      const nBg = this.add.graphics();
      nBg.fillStyle(nb.color, 1);
      nBg.fillRoundedRect(-104, -28, 208, 56, 14);
      nBg.lineStyle(1.5, 0x3b4d6e, 1);
      nBg.strokeRoundedRect(-104, -28, 208, 56, 14);
      const nTxt = this.add.text(0, 0, nb.icon, {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#ffffff'
      }).setOrigin(0.5);
      nCont.add([nBg, nTxt]);
      nCont.setSize(208, 56).setInteractive({ useHandCursor: true });
      nCont.on('pointerdown', () => {
        this.soundMgr.playSelect();
        nb.action();
      });
      m.add(nCont);
    });

    // 5. Green SAVE & CONTINUE Button
    const saveBtn = this.add.container(0, 174);
    const saveBg = this.add.graphics();
    saveBg.fillStyle(0x3ba55d, 1);
    saveBg.fillRoundedRect(-220, -30, 440, 60, 16);
    const saveTxt = this.add.text(0, 0, '✓  LƯU & TIẾP TỤC', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    saveBtn.add([saveBg, saveTxt]);
    saveBtn.setSize(440, 60).setInteractive({ useHandCursor: true });
    saveBtn.on('pointerdown', () => {
      StorageService.save(this.progression, this.meta, this.settings, this.energy);
      this.soundMgr.playSelect();
      this.closeModal();
    });
    m.add(saveBtn);

    // 6. Subtle Reset Link at bottom
    const resetTxt = this.add.text(0, 250, '⚠️ Xóa toàn bộ dữ liệu chơi', {
      fontFamily: 'sans-serif',
      fontSize: '15px',
      color: '#e63946'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    resetTxt.on('pointerdown', () => {
      StorageService.reset();
      this.progression = new ProgressionState(1, 1);
      this.meta = new MetaState();
      this.energy = new EnergyState(MAX_LIVES, Date.now());
      this.startLevel(1);
    });
    m.add(resetTxt);

    this.activeModal = m;
  }

  private showDebugModal() {
    this.closeModal();
    const m = this.add.container(360, 640);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRect(-360, -640, 720, 1280);
    bg.fillStyle(0x111620, 0.98);
    bg.fillRoundedRect(-260, -280, 520, 560, 24);
    bg.lineStyle(2, 0x00bbf9, 0.8);
    bg.strokeRoundedRect(-260, -280, 520, 560, 24);
    m.add(bg);

    const title = this.add.text(0, -230, '🛠️ DEBUG QUICK-TOOLS', {
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#00bbf9'
    }).setOrigin(0.5);

    const winNowBtn = this.add.text(0, -165, '⚡ THẮNG NGAY (XEM VICTORY)', {
      fontSize: '20px',
      color: '#00f5d4'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    winNowBtn.on('pointerdown', () => {
      this.closeModal();
      this.showWinModal();
    });

    const failNowBtn = this.add.text(0, -120, '💔 THUA NGAY (XEM LEVEL FAILED)', {
      fontSize: '20px',
      color: '#ff5400'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    failNowBtn.on('pointerdown', () => {
      this.closeModal();
      this.showDeadlockModal('no_moves');
    });

    const outOfLivesBtn = this.add.text(0, 145, '⚡ TEST HẾT 0 MẠNG (ĐẾM NGƯỢC)', {
      fontSize: '18px',
      color: '#ffd166'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    outOfLivesBtn.on('pointerdown', () => {
      this.energy.lives = 0;
      this.energy.lastRegenAt = Date.now();
      StorageService.save(this.progression, this.meta, this.settings, this.energy);
      this.closeModal();
      this.showOutOfLivesModal();
    });

    const l1Btn = this.add.text(0, -80, 'Level 1 (Hướng dẫn cơ bản)', { fontSize: '20px', color: '#ffffff' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    l1Btn.on('pointerdown', () => this.startLevel(1));

    const l6Btn = this.add.text(0, -20, 'Level 6 (Mở khóa Bóng bí ẩn ?)', { fontSize: '20px', color: '#ffea00' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    l6Btn.on('pointerdown', () => this.startLevel(6));

    const l11Btn = this.add.text(0, 40, 'Level 11 (Mở khóa Ống khóa 🔒)', { fontSize: '20px', color: '#ff9e00' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    l11Btn.on('pointerdown', () => this.startLevel(11));

    const l15Btn = this.add.text(0, 100, 'Level 15 (Mốc độ khó HARD)', { fontSize: '20px', color: '#ff0055' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    l15Btn.on('pointerdown', () => this.startLevel(15));

    const closeBtn = this.add.text(0, 180, '✕ ĐÓNG', { fontSize: '22px', color: '#888888' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.closeModal());

    m.add([title, winNowBtn, l1Btn, l6Btn, l11Btn, l15Btn, closeBtn]);
    this.activeModal = m;
  }

  private showOutOfLivesModal() {
    this.closeModal();
    const m = this.add.container(360, 640);
    m.setDepth(1000);

    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRect(-360, -640, 720, 1280);
    bg.fillStyle(0x1b2232, 0.98);
    bg.fillRoundedRect(-260, -300, 520, 600, 26);
    bg.lineStyle(2.5, 0xff5400, 0.9);
    bg.strokeRoundedRect(-260, -300, 520, 600, 26);
    m.add(bg);

    m.add(this.add.text(0, -240, '⚡ HẾT MẠNG RỒI!', {
      fontFamily: 'sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#ff5400'
    }).setOrigin(0.5));

    m.add(this.add.text(0, -175, `Tối đa ${MAX_LIVES} mạng · Mỗi ${REGEN_MINUTES} phút tự hồi 1 mạng`, {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#a8dadc'
    }).setOrigin(0.5));

    const timerTxt = this.add.text(0, -110, `⏱️ Hồi 1 mạng sau: ${this.energy.formatCountdown()}`, {
      fontFamily: 'sans-serif',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#ffd166'
    }).setOrigin(0.5);
    m.add(timerTxt);

    this.livesCountdownTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.energy.hasLife()) {
          this.closeModal();
          this.startLevel(this.progression.current_level, this.dailyDateStr);
          return;
        }
        timerTxt.setText(`⏱️ Hồi 1 mạng sau: ${this.energy.formatCountdown()}`);
      }
    });

    // Watch Ad (+1 Life)
    const adBtn = this.add.container(0, -10);
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
      this.energy.addLives(1);
      StorageService.save(this.progression, this.meta, this.settings, this.energy);
      this.soundMgr.playCollect();
      this.closeModal();
      this.startLevel(this.progression.current_level, this.dailyDateStr);
    });
    m.add(adBtn);

    // Refill 5 Lives (100 Coins)
    const canBuy = this.meta.coins >= 100;
    const coinBtn = this.add.container(0, 74);
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
        this.meta.coins -= 100;
        this.energy.addLives(MAX_LIVES);
        StorageService.save(this.progression, this.meta, this.settings, this.energy);
        this.soundMgr.playCollect();
        this.closeModal();
        this.startLevel(this.progression.current_level, this.dailyDateStr);
      });
    }
    m.add(coinBtn);

    // Home Button
    const homeBtn = this.add.text(0, 190, '🏠 VỀ TRANG CHỦ', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#dbe4f0'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    homeBtn.on('pointerdown', () => this.scene.start('HomeScene'));
    m.add(homeBtn);

    this.activeModal = m;
  }

  private closeModal() {
    if (this.livesCountdownTimer) {
      this.livesCountdownTimer.destroy();
      this.livesCountdownTimer = undefined;
    }
    if (this.activeModal) {
      this.activeModal.destroy();
      this.activeModal = null;
    }
  }
}
