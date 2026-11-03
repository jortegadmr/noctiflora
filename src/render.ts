import type { Garden } from './garden';
import { lightOut } from './light';
import type { Branch, Flower, Plant } from './plant';
import { NL, hsl, ramp, type Species } from './species';
import { Rng, clamp, lerp, smooth, TAU } from './util';

const HALF_PI = Math.PI / 2;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = c.getContext('2d');
  if (!x) throw new Error('2D canvas is not available');
  return x;
}

function makeSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const c = makeCanvas(128, 128);
  const x = ctx2d(c);
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(0.12, `rgba(${r},${g},${b},0.6)`);
  gr.addColorStop(0.38, `rgba(${r},${g},${b},0.18)`);
  gr.addColorStop(0.7, `rgba(${r},${g},${b},0.04)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  return c;
}

function addLeaf(path: Path2D, x: number, y: number, ang: number, L: number, w: number, skew: number): void {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const mx = x + c * L * skew;
  const my = y + s * L * skew;
  const px = -s * w * L * 2;
  const py = c * w * L * 2;
  path.moveTo(x, y);
  path.quadraticCurveTo(mx + px, my + py, x + c * L, y + s * L);
  path.quadraticCurveTo(mx - px, my - py, x, y);
}

interface LeafStyle {
  spread: number;
  width: number;
  skew: number;
}

const LEAF: Record<string, LeafStyle> = {
  fern: { spread: 1.0, width: 0.27, skew: 0.5 },
  arbor: { spread: 0.85, width: 0.3, skew: 0.5 },
  lily: { spread: 0.7, width: 0.2, skew: 0.5 },
  vine: { spread: 1.0, width: 0.38, skew: 0.4 },
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private fg: HTMLCanvasElement;
  private fctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private grass: HTMLCanvasElement;
  private bloom: HTMLCanvasElement[] = [];
  private bctx: CanvasRenderingContext2D[] = [];
  private sprites = new Map<string, HTMLCanvasElement>();
  private cssW = 0;
  private cssH = 0;
  dpr = 1;
  private canBlur = false;
  private stem: Path2D[] = [];
  private leaf: Path2D[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = ctx2d(canvas);
    this.fg = makeCanvas(1, 1);
    this.fctx = ctx2d(this.fg);
    this.bg = makeCanvas(1, 1);
    this.grass = makeCanvas(1, 1);
    this.canBlur = 'filter' in this.ctx;
  }

  private sprite(r: number, g: number, b: number): HTMLCanvasElement {
    const k = `${r},${g},${b}`;
    let s = this.sprites.get(k);
    if (!s) {
      s = makeSprite(r, g, b);
      this.sprites.set(k, s);
    }
    return s;
  }

  private glow(ctx: CanvasRenderingContext2D, sp: HTMLCanvasElement, x: number, y: number, r: number, a: number): void {
    if (a <= 0.003 || r <= 0.2) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(sp, x - r, y - r, r * 2, r * 2);
  }

  resize(cssW: number, cssH: number, dpr: number, seed: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    const W = Math.round(cssW * dpr);
    const H = Math.round(cssH * dpr);
    for (const c of [this.canvas, this.fg, this.bg, this.grass]) {
      c.width = W;
      c.height = H;
    }
    this.bloom = [];
    this.bctx = [];
    for (const d of [4, 8, 16]) {
      const c = makeCanvas(W / d, H / d);
      this.bloom.push(c);
      this.bctx.push(ctx2d(c));
    }
    this.paintBackground(seed);
    this.paintGrass(seed);
  }

  private paintBackground(seed: number): void {
    const x = ctx2d(this.bg);
    const w = this.cssW;
    const h = this.cssH;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const rng = new Rng(seed);
    const sky = x.createLinearGradient(0, 0, 0, h * 0.74);
    sky.addColorStop(0, '#01030a');
    sky.addColorStop(0.55, '#051024');
    sky.addColorStop(1, '#0b2a3d');
    x.fillStyle = sky;
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 150; i++) {
      const sx = rng.range(0, w);
      const sy = rng.range(0, h * 0.6);
      const a = rng.range(0.1, 0.55) * (1 - sy / (h * 0.7));
      x.fillStyle = `rgba(190,225,255,${a.toFixed(3)})`;
      const r = rng.chance(0.08) ? 1.3 : 0.7;
      x.fillRect(sx, sy, r, r);
    }
    // horizon haze
    const hz = x.createRadialGradient(w * 0.5, h * 0.72, 0, w * 0.5, h * 0.72, w * 0.7);
    hz.addColorStop(0, 'rgba(40,170,160,0.22)');
    hz.addColorStop(1, 'rgba(40,170,160,0)');
    x.save();
    x.translate(0, h * 0.72);
    x.scale(1, 0.32);
    x.translate(0, -h * 0.72);
    x.fillStyle = hz;
    x.fillRect(0, -h * 4, w, h * 8);
    x.restore();
    // distant hills
    const hills = (base: number, amp: number, f1: number, f2: number, ph: number, color: string) => {
      x.beginPath();
      x.moveTo(0, h);
      for (let px = 0; px <= w + 8; px += 8) {
        const y = h * base + Math.sin(px * f1 + ph) * h * amp + Math.sin(px * f2 + ph * 2.3) * h * amp * 0.5;
        x.lineTo(px, y);
      }
      x.lineTo(w, h);
      x.closePath();
      x.fillStyle = color;
      x.fill();
    };
    hills(0.64, 0.035, 0.004, 0.011, 1.3, '#07162a');
    hills(0.69, 0.025, 0.006, 0.015, 4.1, '#050f1f');
    // ground plane
    const gp = x.createLinearGradient(0, h * 0.7, 0, h);
    gp.addColorStop(0, '#0a1c2b');
    gp.addColorStop(0.45, '#040c16');
    gp.addColorStop(1, '#010306');
    x.fillStyle = gp;
    x.fillRect(0, h * 0.72, w, h * 0.28);
    // ground specks
    for (let i = 0; i < 70; i++) {
      const sx = rng.range(0, w);
      const sy = rng.range(h * 0.74, h);
      x.fillStyle = `rgba(110,230,210,${rng.range(0.05, 0.22).toFixed(3)})`;
      x.fillRect(sx, sy, 1.2, 1.2);
    }
  }

  private paintGrass(seed: number): void {
    const x = ctx2d(this.grass);
    const w = this.cssW;
    const h = this.cssH;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const rng = new Rng(seed ^ 0x5bd1e995);
    const scale = clamp(Math.min(w, h) / 800, 0.6, 1.3);
    const count = Math.round(w / 9);
    for (let i = 0; i < count; i++) {
      const bx = rng.range(-10, w + 10);
      const hh = rng.range(18, 78) * scale * (0.6 + 0.6 * Math.abs(Math.sin(bx * 0.01)));
      const lean = rng.range(-1, 1) * hh * 0.5;
      const bw = rng.range(2, 5) * scale;
      x.beginPath();
      x.moveTo(bx - bw, h + 4);
      x.quadraticCurveTo(bx - bw * 0.4 + lean * 0.3, h - hh * 0.55, bx + lean, h - hh);
      x.quadraticCurveTo(bx + bw * 0.4 + lean * 0.4, h - hh * 0.5, bx + bw, h + 4);
      x.closePath();
      x.fillStyle = i % 5 === 0 ? '#031018' : '#010408';
      x.fill();
    }
    const fade = x.createLinearGradient(0, h - 90 * scale, 0, h);
    fade.addColorStop(0, 'rgba(1,3,6,0)');
    fade.addColorStop(1, 'rgba(1,3,6,0.9)');
    x.fillStyle = fade;
    x.fillRect(0, h - 90 * scale, w, 90 * scale);
  }

  // ------------------------------------------------------------------- frame

  render(g: Garden): void {
    const { ctx, fctx, dpr } = this;
    const w = this.cssW;
    const h = this.cssH;
    const t = g.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.bg, 0, 0, w, h);

    this.drawLightPools(g);
    this.drawMotes(g);

    // plants + effects on the transparent layer
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
    fctx.globalAlpha = 1;
    fctx.clearRect(0, 0, w, h);
    const sorted = g.plants.slice().sort((a, b) => a.z - b.z);
    for (const p of sorted) {
      if (p.state === 'seed') this.drawSeed(p, t);
      else this.drawPlant(p, t, g.wind);
    }
    this.drawFx(g, t);

    ctx.globalAlpha = 1;
    ctx.drawImage(this.fg, 0, 0, w, h);
    this.composeBloom();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.grass, 0, 0, w, h);
  }

  private composeBloom(): void {
    const [a, b, c] = this.bloom;
    const [ca, cb, cc] = this.bctx;
    ca.globalCompositeOperation = 'copy';
    ca.drawImage(this.fg, 0, 0, a.width, a.height);
    cb.globalCompositeOperation = 'copy';
    if (this.canBlur) cb.filter = 'blur(1.5px)';
    cb.drawImage(a, 0, 0, b.width, b.height);
    cc.globalCompositeOperation = 'copy';
    if (this.canBlur) cc.filter = 'blur(2px)';
    cc.drawImage(b, 0, 0, c.width, c.height);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.globalAlpha = 0.34;
    ctx.drawImage(a, 0, 0, W, H);
    ctx.globalAlpha = 0.42;
    ctx.drawImage(b, 0, 0, W, H);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(c, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawLightPools(g: Garden): void {
    const ctx = this.ctx;
    const l = g.light;
    const h = this.cssH;
    const R = Math.max(120, Math.min(this.cssW, h) * 0.19);
    ctx.globalCompositeOperation = 'lighter';
    const warm = this.sprite(255, 226, 170);
    const amber = this.sprite(255, 178, 90);
    const pool = (sp: HTMLCanvasElement, x: number, y: number, s: number, r: number) => {
      this.glow(ctx, sp, x, y, r * 1.8, 0.24 * s);
      const gy = h * 0.8;
      const prox = clamp(1 - Math.abs(y - gy) / (h * 0.9), 0.25, 1);
      ctx.save();
      ctx.translate(x, gy);
      ctx.scale(1, 0.26);
      this.glow(ctx, sp, 0, 0, r * 2.4, 0.3 * s * prox);
      ctx.restore();
    };
    if (l.pointerS > 0.02) pool(warm, l.px, l.py, l.pointerS, R);
    if (l.driftS > 0.02) pool(amber, l.dx, l.dy, l.driftS, R * 1.2);
    for (const p of l.trail) {
      const f = clamp(1 - p.t / 4.5, 0, 1);
      this.glow(ctx, warm, p.x, p.y, R * 0.8, 0.16 * f * f);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawMotes(g: Garden): void {
    const ctx = this.ctx;
    const cool = this.sprite(150, 200, 255);
    const warm = this.sprite(255, 224, 160);
    ctx.globalCompositeOperation = 'lighter';
    for (const o of g.motes) {
      g.light.sample(o.x, o.y);
      const I = lightOut.i;
      const tw = 0.6 + 0.4 * Math.sin(g.time * 1.3 + o.ph);
      const r = 1.6 + 2.6 * o.d;
      this.glow(ctx, I > 0.35 ? warm : cool, o.x, o.y, r, (0.1 + 0.8 * I) * tw * (0.4 + 0.6 * o.d));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawSeed(p: Plant, t: number): void {
    const ctx = this.fctx;
    const [r, g, b] = p.sp.halo;
    const sp = this.sprite(r, g, b);
    const pulse = 0.75 + 0.25 * Math.sin(t * 3 + p.phase);
    ctx.globalCompositeOperation = 'lighter';
    this.glow(ctx, sp, p.x, p.sy, 16 * p.S * pulse + 6, 0.8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,250,235,0.95)';
    ctx.beginPath();
    ctx.arc(p.x, p.sy, 1.8 + 1.2 * p.S, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawFx(g: Garden, t: number): void {
    const ctx = this.fctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const r of g.ripples) {
      const k = r.t / 1.4;
      const [cr, cg, cb] = r.sp.halo;
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, 6 + k * 70 * g.S, 2 + k * 18 * g.S, 0, 0, TAU);
      ctx.stroke();
    }
    for (const p of g.pollenList) {
      const [cr, cg, cb] = p.sp.halo;
      const k = p.life / p.max;
      this.glow(ctx, this.sprite(cr, cg, cb), p.x, p.y, 4 + 3 * Math.sin(t * 4 + p.max), Math.sin(k * Math.PI) * 0.9);
    }
    // the lantern beads
    const l = g.light;
    const pale = this.sprite(255, 244, 214);
    const amber = this.sprite(255, 190, 100);
    if (l.pointerS > 0.02) {
      this.glow(ctx, pale, l.px, l.py, 30, 0.85 * l.pointerS);
      this.glow(ctx, pale, l.px, l.py, 9, 1 * l.pointerS);
    }
    if (l.driftS > 0.02) {
      const pu = 1 + 0.08 * Math.sin(t * 2.1);
      this.glow(ctx, amber, l.dx, l.dy, 34 * pu, 0.8 * l.driftS);
      this.glow(ctx, pale, l.dx, l.dy, 8, 0.95 * l.driftS);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ plants

  private drawPlant(p: Plant, t: number, wind: number): void {
    const ctx = this.fctx;
    const sp = p.sp;
    const stemR = ramp(sp.id + 's', sp.stem, p.variant);
    const leafR = ramp(sp.id + 'l', sp.leaf, p.variant);
    const st = this.stem;
    const lf = this.leaf;
    for (let i = 0; i < NL; i++) {
      st[i] = new Path2D();
      lf[i] = new Path2D();
    }
    const style = LEAF[sp.id];
    for (const b of p.branches) this.addBranch(b, p, st, lf, style, t, wind);
    const alpha = clamp(p.fade, 0, 1) * (0.5 + 0.5 * p.z);
    ctx.globalAlpha = alpha;
    for (let i = 0; i < NL; i++) {
      ctx.fillStyle = stemR[i];
      ctx.fill(st[i]);
    }
    ctx.globalAlpha = alpha * 0.92;
    for (let i = 0; i < NL; i++) {
      ctx.fillStyle = leafR[i];
      ctx.fill(lf[i]);
    }
    ctx.globalAlpha = alpha;
    for (const b of p.branches) {
      if (b.flower) this.drawFlower(b.flower, b, p, t, alpha);
    }
    ctx.globalAlpha = 1;
  }

  private level(sp: Species, I: number, age: number, born: number): number {
    const fresh = Math.exp(-(age - born) / 2.8);
    const g = sp.baseGlow + 0.62 * Math.pow(I, 0.85) + 0.55 * fresh;
    return Math.floor(clamp(g, 0, 0.999) * NL);
  }

  private addBranch(b: Branch, p: Plant, st: Path2D[], lf: Path2D[], style: LeafStyle, t: number, wind: number): void {
    const n = b.n;
    const sp = p.sp;
    const arr = b.blade ? lf : st;
    let na = (b.ba + b.a[0]) / 2 + HALF_PI;
    const r0 = b.blade ? 0.2 : b.r[0] * 1.06;
    let plx = b.bx + Math.cos(na) * r0;
    let ply = b.by + Math.sin(na) * r0;
    let prx = b.bx - Math.cos(na) * r0;
    let pry = b.by - Math.sin(na) * r0;
    for (let i = 0; i < n; i++) {
      const ai = b.a[i];
      na = (i < n - 1 ? (ai + b.a[i + 1]) / 2 : ai) + HALF_PI;
      const r = b.r[i];
      const x = b.x[i];
      const y = b.y[i];
      const cx = Math.cos(na) * r;
      const cy = Math.sin(na) * r;
      const lv = this.level(sp, b.I[i], p.age, b.born[i]);
      const path = arr[lv];
      path.moveTo(plx, ply);
      path.lineTo(x + cx, y + cy);
      path.lineTo(x - cx, y - cy);
      path.lineTo(prx, pry);
      path.closePath();
      plx = x + cx;
      ply = y + cy;
      prx = x - cx;
      pry = y - cy;
      const ls = b.leaf[i];
      if (ls > 0) {
        const size = ls * smooth((p.age - b.born[i]) / 3.5);
        if (size > 0.6) {
          const side = b.leafSide[i];
          const sway = wind > 0 ? Math.sin(t * 1.2 + i + p.phase) * 0.1 * wind : 0;
          const lpath = lf[Math.min(NL - 1, lv + 1)];
          if (side === 0) {
            addLeaf(lpath, x, y, ai + style.spread + sway, size, style.width, style.skew);
            addLeaf(lpath, x, y, ai - style.spread + sway, size, style.width, style.skew);
          } else {
            addLeaf(lpath, x, y, ai + side * style.spread + sway, size, style.width, style.skew);
          }
        }
      }
    }
  }

  private drawFlower(f: Flower, b: Branch, p: Plant, t: number, alpha: number): void {
    const ctx = this.fctx;
    const sp = p.sp;
    const n = b.n;
    const x = b.x[n - 1];
    const y = b.y[n - 1];
    const ang = b.a[n - 1];
    const bloom = smooth((p.age - f.born) / 7);
    if (bloom < 0.03) return;
    const open = f.open * bloom;
    const I = b.I[n - 1];
    const size = f.size * (0.35 + 0.65 * bloom);
    const pet = sp.petal;
    const tip = sp.petalTip;

    if (f.kind === 'spore') {
      const pulse = 0.85 + 0.25 * Math.sin(t * 2.2 + f.phase);
      ctx.fillStyle = hsl(tip[0], tip[1], tip[2]);
      ctx.beginPath();
      ctx.arc(x, y, size * pulse, 0, TAU);
      ctx.fill();
    } else if (f.kind === 'blossom') {
      const rot = f.phase + Math.sin(t * 0.6 + f.phase) * 0.1;
      const pr = size * (0.28 + 0.2 * open);
      ctx.fillStyle = hsl(pet[0], pet[1], pet[2] + 6 * I);
      ctx.beginPath();
      for (let i = 0; i < f.petals; i++) {
        const a = rot + (TAU * i) / f.petals;
        const d = size * (0.3 + 0.35 * open);
        ctx.moveTo(x + Math.cos(a) * d + pr, y + Math.sin(a) * d);
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, pr, 0, TAU);
      }
      ctx.fill();
      ctx.fillStyle = hsl(tip[0], tip[1], tip[2], 0.85);
      ctx.beginPath();
      ctx.arc(x, y, size * 0.26, 0, TAU);
      ctx.fill();
    } else {
      // cup / bell: a fan of petals around the growth axis
      const bell = f.kind === 'bell';
      const half = bell ? lerp(0.15, 0.7, open) : lerp(0.2, 1.3, open);
      const N = f.petals;
      for (let ring = 0; ring < 2; ring++) {
        const front = ring === 1;
        const Lp = size * (front ? 1 : 0.85);
        const wp = Lp * (front ? 0.2 : 0.17) * (0.6 + 0.4 * open);
        ctx.fillStyle = hsl(pet[0], pet[1], pet[2] + (front ? 10 : -6) + 18 * I);
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const a = ang + lerp(-half, half, (i + 0.5) / N) + (front ? 0 : half / N);
          const c = Math.cos(a);
          const s = Math.sin(a);
          const mx = x + c * Lp * 0.55;
          const my = y + s * Lp * 0.55;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(mx - s * wp * 1.7, my + c * wp * 1.7, x + c * Lp, y + s * Lp);
          ctx.quadraticCurveTo(mx + s * wp * 1.7, my - c * wp * 1.7, x, y);
        }
        ctx.fill();
      }
      // pale inner petals
      ctx.fillStyle = hsl(tip[0], tip[1], tip[2], 0.7);
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const a = ang + lerp(-half, half, (i + 0.5) / N) * 0.8;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const Lp = size * 0.62;
        const wp = Lp * 0.13;
        const mx = x + c * Lp * 0.55;
        const my = y + s * Lp * 0.55;
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(mx - s * wp * 1.7, my + c * wp * 1.7, x + c * Lp, y + s * Lp);
        ctx.quadraticCurveTo(mx + s * wp * 1.7, my - c * wp * 1.7, x, y);
      }
      ctx.fill();
    }

    // halo
    const [hr, hg, hb] = sp.halo;
    ctx.globalCompositeOperation = 'lighter';
    const reach = f.kind === 'spore' ? 4 : 1.7 + open * 1.2;
    const soft = f.kind === 'blossom' ? 0.4 : 1;
    this.glow(ctx, this.sprite(hr, hg, hb), x, y, size * reach, (0.2 + 0.5 * open) * (0.5 + 0.5 * I) * alpha * soft);
    if (f.kind !== 'blossom') this.glow(ctx, this.sprite(255, 246, 220), x, y, size * 0.7, 0.55 * (0.4 + 0.6 * open) * alpha);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
  }
}
