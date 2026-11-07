// 2D renderer for Daenarys' cut-out.
//
// The art is one drawing (assets/capri/capri-full.png). Motion is whole-body: a lean when she
// tilts her head, a little sway, the squash and the teleport collapse. The rest of the show
// (echoes, glitch slices, the violet misregistration, sparkles) is drawn here too.
//
// The old Capri sprite was a WebGL shader that split the drawing into arms, legs and mane.
// Daenarys' chibi art has her arms at her sides, so the 2D canvas keeps every pixel of the
// reference and animates the whole figure instead. The exported API is the same.

const W = 440;
const H = 460;
const PAD = 30;

export const SPRITE = {
  width: W,
  height: H,
  pad: PAD,
  head: { x: 220, y: 135 },
  feet: { x: 220, y: 452 },
  hip: 335, // where she sits
  shoulder: { x: 190, y: 255 },
  hand: { x: 90, y: 330 },
  mirror: W,
  // no mirrored arm to add to the hit mask: the drawing already has both arms
  armL() {
    return false;
  },
};

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function rgb(sil) {
  return `rgb(${Math.round(sil[0] * 255)}, ${Math.round(sil[1] * 255)}, ${Math.round(sil[2] * 255)})`;
}

export class SpriteRenderer {
  constructor(canvas, image) {
    this.canvas = canvas;
    this.image = image;
    this.scale = null;
    this.dpr = 1;
    this.cssW = 0;
    this.cssH = 0;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.base = document.createElement('canvas');
    this.base.width = W;
    this.base.height = H;
    this.base.getContext('2d').drawImage(image, 0, 0);
    this.tints = new Map();
  }

  // css size of the canvas for a given sprite scale
  static cssSize(scale) {
    return {
      width: Math.round((W + PAD * 2) * scale),
      height: Math.round((H + PAD * 2) * scale),
    };
  }

  resize(scale) {
    this.scale = scale;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    const { width, height } = SpriteRenderer.cssSize(scale);
    this.cssW = width;
    this.cssH = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.tints.clear();
  }

  // The whole figure in one flat colour, for echoes and impact frames.
  tint(color) {
    let c = this.tints.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.drawImage(this.base, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    this.tints.set(color, c);
    return c;
  }

  // One drawing, sliced into bands when the signal breaks.
  figure(s) {
    const ctx = this.ctx;
    if (s.glitch <= 0.01) {
      ctx.drawImage(this.base, 0, 0);
      return;
    }
    const band = 6 + Math.floor(hash(s.glitchSeed) * 22);
    for (let y = 0; y < H; y += band) {
      const i = Math.floor(y / band);
      const on = hash(i * 13.3 + s.glitchSeed) < s.glitch * 0.7;
      const dx = on ? (hash(i * 7.1 + s.glitchSeed * 3) - 0.5) * 90 * s.glitch : 0;
      const h = Math.min(band, H - y);
      ctx.drawImage(this.base, 0, y, W, h, dx, y, W, h);
    }
  }

  draw(s) {
    const ctx = this.ctx;
    const alpha = clamp(s.alpha ?? 1, 0, 1);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    if (alpha <= 0) return;

    ctx.save();
    ctx.translate(PAD * this.scale, PAD * this.scale);
    ctx.scale(this.scale, this.scale);
    ctx.globalAlpha = alpha;

    // teleport: squeeze into a vertical line of light
    if (s.collapse > 0) {
      ctx.translate(220, 240);
      ctx.scale(Math.max(0.03, 1 - s.collapse), 1 / (1 + s.collapse * 0.4));
      ctx.translate(-220, -240);
    }

    // a little sway and lean, as if she were breathing and looking around
    const sway = (s.hair || 0) * 2.2;
    const lean = (s.head || 0) * 0.11;
    ctx.translate(sway, 0);
    if (lean) {
      ctx.translate(220, 390);
      ctx.rotate(lean);
      ctx.translate(-220, -390);
    }
    if (s.sit) {
      // sitting: a small settle instead of the old per-leg rig
      ctx.translate(0, 335);
      ctx.scale(1, 1 - 0.06 * s.sit);
      ctx.translate(0, -335);
    }

    const smear = s.smear || [0, 0];
    const echo = s.echo || [0, 0];
    const misreg = s.misreg || [0, 0];
    const split = s.split || 0;

    // behind her: the violet misregistration, the other minds, the smear
    if (misreg[0] || misreg[1]) {
      ctx.globalAlpha = alpha * 0.9;
      ctx.drawImage(this.tint('rgb(122, 61, 255)'), misreg[0], misreg[1]);
    }
    if (echo[0] || echo[1]) {
      ctx.globalAlpha = alpha * 0.5;
      ctx.drawImage(this.tint('rgb(53, 255, 122)'), -echo[0], -echo[1]);
      ctx.drawImage(this.tint('rgb(255, 33, 79)'), echo[0], echo[1]);
    }
    if (split) {
      ctx.globalAlpha = alpha * 0.35;
      ctx.drawImage(this.tint('rgb(255, 33, 79)'), split, 0);
      ctx.drawImage(this.tint('rgb(47, 123, 255)'), -split, 0);
    }
    if (smear[0] || smear[1]) {
      ctx.globalAlpha = alpha * 0.26;
      ctx.drawImage(this.base, -smear[0] * 0.5, -smear[1] * 0.5);
      ctx.globalAlpha = alpha * 0.14;
      ctx.drawImage(this.base, -smear[0], -smear[1]);
    }

    // the figure on top
    ctx.globalAlpha = alpha * (s.dissolve > 0 ? Math.max(0.12, 1 - s.dissolve * 0.75) : 1);
    this.figure(s);

    // impact frame: everything flat in one colour
    if (s.silAmount > 0) {
      ctx.globalAlpha = alpha * clamp(s.silAmount, 0, 1);
      ctx.drawImage(this.tint(rgb(s.sil || [0.08, 0.06, 0.11])), 0, 0);
    }

    // gold specks on her, the way her cape catches the light
    if (s.sparkle > 0) {
      ctx.globalAlpha = alpha * 0.7 * clamp(s.sparkle, 0, 1);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgb(244, 213, 138)';
      for (let i = 0; i < 36; i++) {
        const x = 69 + hash(i * 3.7 + s.seed) * 302;
        const y = 52 + hash(i * 9.1 + s.seed * 1.7) * 400;
        const tw = hash(i * 5.3 + s.seed * 2.1);
        if (tw < 0.45) continue;
        const r = tw > 0.9 ? 1.5 : 0.8;
        ctx.fillRect(x, y, r, r);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
  }
}
