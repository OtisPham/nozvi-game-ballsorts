import Phaser from 'phaser';
import { THEMES } from '../core/meta';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Load image-based skins
    THEMES.forEach(theme => {
      if (theme.useImageSkin) {
        for (let i = 0; i < 9; i++) {
          this.load.image(`ball_${theme.id}_${i}`, `assets/skins/${theme.id}/${i}.png`);
        }
        this.load.image(`ball_${theme.id}_mystery`, `assets/skins/${theme.id}/mystery.png`);
      }
    });

    // Generate dynamic canvas textures for sphere themes
    this.createBallTextures();
    this.createParticleTexture();
    this.createTubeTextures();
  }

  create() {
    this.scene.start('HomeScene');
  }

  private createBallTextures() {
    const size = 120;
    const r = size / 2;

    // Symbols for 9 accessible colors
    const symbols = [
      '●', // 0: Dot / Circle
      '◆', // 1: Diamond
      '▲', // 2: Triangle
      '★', // 3: Star
      '■', // 4: Square
      '⬢', // 5: Hexagon
      '✚', // 6: Cross
      '☾', // 7: Crescent
      '♥'  // 8: Heart
    ];

    THEMES.forEach(theme => {
      if (theme.useImageSkin) return;
      theme.ballColors.forEach((colorHex, idx) => {
        // 1. Clean casual glossy ball (no symbol inside)
        const cleanKey = `ball_${theme.id}_${idx}`;
        if (!this.textures.exists(cleanKey)) {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d')!;
          this.drawGlossySphere(ctx, size, r, colorHex);
          this.textures.addCanvas(cleanKey, canvas);
        }

        // 2. Accessibility ball with symbol inside (optional in Settings)
        const symKey = `ball_sym_${theme.id}_${idx}`;
        if (!this.textures.exists(symKey)) {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d')!;
          this.drawGlossySphere(ctx, size, r, colorHex);

          ctx.font = 'bold 36px sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
          ctx.shadowBlur = 4;
          ctx.fillText(symbols[idx % symbols.length], r, r + 2);

          this.textures.addCanvas(symKey, canvas);
        }
      });
    });

    // Mystery Ball Texture (?)
    const mystKey = 'ball_mystery';
    if (!this.textures.exists(mystKey)) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      const grad = ctx.createRadialGradient(r * 0.7, r * 0.65, r * 0.15, r, r, r);
      grad.addColorStop(0, '#e0aaff');
      grad.addColorStop(0.3, '#7b2cbf');
      grad.addColorStop(0.85, '#3c096c');
      grad.addColorStop(1, '#10002b');

      ctx.beginPath();
      ctx.arc(r, r, r - 4, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(123, 44, 191, 0.6)';
      ctx.shadowBlur = 10;
      ctx.fill();

      // Specular shine
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.ellipse(r * 0.68, r * 0.45, r * 0.32, r * 0.16, -Math.PI / 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fill();

      // Question mark '?'
      ctx.font = '900 50px sans-serif';
      ctx.fillStyle = '#ffea00';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText('?', r, r + 2);

      this.textures.addCanvas(mystKey, canvas);
    }
  }

  private createTubeTextures() {
    // Generate particle dot
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 16;
    pCanvas.height = 16;
    const pCtx = pCanvas.getContext('2d')!;
    pCtx.beginPath();
    pCtx.arc(8, 8, 7, 0, Math.PI * 2);
    pCtx.fillStyle = '#ffffff';
    pCtx.fill();
    this.textures.addCanvas('particle_star', pCanvas);
  }

  private createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fill();
    this.textures.addCanvas('sparkle', canvas);

    // Soft snowflake texture
    const sCanvas = document.createElement('canvas');
    sCanvas.width = 24;
    sCanvas.height = 24;
    const sCtx = sCanvas.getContext('2d')!;
    const sGrad = sCtx.createRadialGradient(12, 12, 1, 12, 12, 11);
    sGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    sGrad.addColorStop(0.5, 'rgba(235, 248, 255, 0.85)');
    sGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 24, 24);
    this.textures.addCanvas('snow_flake', sCanvas);
  }

  private drawGlossySphere(ctx: CanvasRenderingContext2D, size: number, r: number, colorHex: string) {
    const grad = ctx.createRadialGradient(r * 0.7, r * 0.65, r * 0.15, r, r, r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.25, colorHex);
    grad.addColorStop(0.85, colorHex);
    grad.addColorStop(1, this.darkenColor(colorHex, 0.45));

    ctx.beginPath();
    ctx.arc(r, r, r - 4, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fill();

    // Subtle specular highlight arc
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.ellipse(r * 0.68, r * 0.45, r * 0.32, r * 0.16, -Math.PI / 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();
  }

  private darkenColor(hex: string, amount: number): string {
    let col = hex.replace('#', '');
    if (col.length === 3) {
      col = col.split('').map(c => c + c).join('');
    }
    const num = parseInt(col, 16);
    const r = Math.max(0, Math.floor(((num >> 16) & 255) * (1 - amount)));
    const g = Math.max(0, Math.floor(((num >> 8) & 255) * (1 - amount)));
    const b = Math.max(0, Math.floor((num & 255) * (1 - amount)));
    return `rgb(${r},${g},${b})`;
  }
}
