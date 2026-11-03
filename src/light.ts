import { clamp } from './util';

interface Source {
  x: number;
  y: number;
  s: number;
  r2: number;
}

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

/** Result of a light query: intensity 0..1 and the direction (radians) toward the light. */
export const lightOut = { i: 0, a: 0 };

const TRAIL_LIFE = 4.5;

export class Light {
  px = 0;
  py = 0;
  pointerOn = false;
  pointerS = 0;
  lastMove = -99;
  dx = 0;
  dy = 0;
  driftS = 1;
  driftT = 0;
  time = 0;
  trail: TrailPoint[] = [];
  list: Source[] = [];
  private lastTx = -999;
  private lastTy = -999;

  constructor(public w: number, public h: number, private calm: boolean) {
    this.px = w * 0.5;
    this.py = h * 0.4;
    this.driftT = 2.2;
    this.computeDrift();
  }

  setPointer(x: number, y: number): void {
    this.px = x;
    this.py = y;
    this.pointerOn = true;
    this.lastMove = this.time;
    const ddx = x - this.lastTx;
    const ddy = y - this.lastTy;
    if (ddx * ddx + ddy * ddy > 26 * 26) {
      this.trail.push({ x, y, t: 0 });
      if (this.trail.length > 26) this.trail.shift();
      this.lastTx = x;
      this.lastTy = y;
    }
  }

  releasePointer(): void {
    this.pointerOn = false;
  }

  /** True while the visitor has recently moved the light. */
  get interacting(): boolean {
    return this.pointerOn && this.time - this.lastMove < 6;
  }

  private computeDrift(): void {
    const t = this.driftT;
    this.dx = this.w * (0.5 + 0.38 * Math.sin(t * 0.19) + 0.08 * Math.sin(t * 0.53 + 2));
    this.dy = this.h * (0.4 + 0.2 * Math.sin(t * 0.27 + 1) + 0.07 * Math.sin(t * 0.71));
  }

  update(dt: number): void {
    this.time += dt;
    this.driftT += dt * (this.calm ? 0.4 : 1);
    this.computeDrift();
    const k = (rate: number) => 1 - Math.exp(-dt * rate);
    this.driftS += ((this.interacting ? 0.1 : 1) - this.driftS) * k(1.1);
    this.pointerS += ((this.pointerOn ? 1 : 0) - this.pointerS) * k(4);
    for (const p of this.trail) p.t += dt;
    while (this.trail.length && this.trail[0].t > TRAIL_LIFE) this.trail.shift();

    const list = this.list;
    list.length = 0;
    const R = Math.min(this.w, this.h);
    const pr = Math.max(120, R * 0.19);
    if (this.pointerS > 0.02) list.push({ x: this.px, y: this.py, s: this.pointerS, r2: pr * pr });
    if (this.driftS > 0.02) {
      const dr = pr * 1.2;
      list.push({ x: this.dx, y: this.dy, s: 0.95 * this.driftS, r2: dr * dr });
    }
    const tr = pr * 0.55;
    for (const p of this.trail) {
      const f = clamp(1 - p.t / TRAIL_LIFE, 0, 1);
      list.push({ x: p.x, y: p.y, s: 0.5 * f * f, r2: tr * tr });
    }
  }

  sample(x: number, y: number): void {
    let tot = 0;
    let vx = 0;
    let vy = 0;
    const list = this.list;
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      const dx = s.x - x;
      const dy = s.y - y;
      const d2 = dx * dx + dy * dy + 1;
      const f = (s.s * s.r2) / (s.r2 + d2);
      const inv = 1 / Math.sqrt(d2);
      vx += f * dx * inv;
      vy += f * dy * inv;
      tot += f;
    }
    lightOut.i = 1 - Math.exp(-1.8 * tot);
    lightOut.a = Math.atan2(vy, vx);
  }
}
