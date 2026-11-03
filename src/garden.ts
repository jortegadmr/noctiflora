import { Light, lightOut } from './light';
import { Plant, type Fx } from './plant';
import { SPECIES, SPECIES_IDS, type Species, type SpeciesId } from './species';
import { Rng, clamp } from './util';

export interface Mote {
  x: number;
  y: number;
  d: number;
  ph: number;
  vx: number;
  vy: number;
}

export interface Pollen {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  sp: Species;
}

export interface Ripple {
  x: number;
  y: number;
  t: number;
  sp: Species;
}

export type Choice = SpeciesId | 'mix';

const MAX_PLANTS = 15;

export class Garden implements Fx {
  w = 0;
  h = 0;
  S = 1;
  plants: Plant[] = [];
  motes: Mote[] = [];
  pollenList: Pollen[] = [];
  ripples: Ripple[] = [];
  light: Light;
  time = 0;
  wind = 1;
  timeScale = 1;
  choice: Choice = 'mix';
  readonly rng = new Rng((Math.random() * 4294967296) >>> 0);
  private seedCounter = 1;

  constructor(w: number, h: number, readonly calm: boolean, private moteCount: number) {
    this.w = w;
    this.h = h;
    this.light = new Light(w, h, calm);
    this.wind = calm ? 0 : 1;
    this.computeScale();
    this.scatterMotes();
  }

  private computeScale(): void {
    this.S = clamp(Math.min(this.w, this.h * 1.3) / 640, 0.8, 1.8);
  }

  resize(w: number, h: number): void {
    const rx = w / this.w;
    this.w = w;
    this.h = h;
    this.light.w = w;
    this.light.h = h;
    for (const p of this.plants) {
      p.x *= rx;
      p.y = this.groundY(p.z);
    }
    this.computeScale();
    this.scatterMotes();
  }

  private scatterMotes(): void {
    this.motes = [];
    for (let i = 0; i < this.moteCount; i++) {
      this.motes.push({
        x: this.rng.range(0, this.w),
        y: this.rng.range(0, this.h * 0.95),
        d: this.rng.range(0.3, 1),
        ph: this.rng.range(0, 6.28),
        vx: this.rng.range(-4, 4),
        vy: this.rng.range(-6, 1),
      });
    }
  }

  /** Where plants of depth z stand. Distant plants sit higher on the screen. */
  groundY(z: number): number {
    return this.h * (0.7 + 0.17 * z);
  }

  private pick(): SpeciesId {
    if (this.choice !== 'mix') return this.choice;
    return SPECIES_IDS[this.rng.int(0, SPECIES_IDS.length - 1)];
  }

  private addPlant(id: SpeciesId, x: number, z: number, delay: number, startY: number): Plant {
    const sp = SPECIES[id];
    const zs = 0.55 + 0.45 * z;
    const p = new Plant(sp, x, this.groundY(z), z, this.S * zs, (this.seedCounter++ * 7919 + (this.rng.next() * 1e6) | 0) >>> 0, delay, startY, this.light);
    this.plants.push(p);
    return p;
  }

  /** Initial garden. `warm` fast-forwards growth so the first frame is already lush. */
  seedInitial(warm: number): void {
    const n = clamp(Math.round(this.w / 190), 4, 8);
    const order: SpeciesId[] = ['lily', 'fern', 'arbor', 'vine', 'fern', 'lily', 'arbor', 'fern'];
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * this.w + this.rng.range(-0.3, 0.3) * (this.w / n);
      const z = i % 2 ? this.rng.range(0.55, 0.75) : this.rng.range(0.85, 1);
      const delay = warm > 0 ? (i % 3 === 1 ? warm + 1.5 + i * 0.6 : this.rng.range(0, 3)) : 0.4 + i * 0.35;
      this.addPlant(order[i % order.length], x, z, delay, 1e9);
    }
    // Warm-up steps (seeds begin on the ground).
    const step = 1 / 15;
    for (let t = 0; t < warm; t += step) this.step(step, step, true);
  }

  clearAll(): void {
    for (const p of this.plants) p.state = 'fading';
  }

  sow(x: number, y: number): void {
    const alive = this.plants.filter((p) => p.state !== 'fading');
    if (alive.length >= MAX_PLANTS) alive[0].state = 'fading';
    const z = clamp(0.55 + 0.45 * ((y / this.h - 0.2) / 0.6), 0.55, 1);
    const id = this.pick();
    this.addPlant(id, x, z, 0.5, y);
  }

  pollen(x: number, y: number, sp: Species): void {
    if (this.calm || this.pollenList.length > 90) return;
    this.pollenList.push({
      x,
      y,
      vx: this.rng.range(-6, 6),
      vy: this.rng.range(-14, -6),
      life: 0,
      max: this.rng.range(3, 6),
      sp,
    });
  }

  update(realDt: number): void {
    const dt = Math.max(0, Math.min(realDt, 0.05));
    this.time += dt;
    this.step(dt, dt * this.timeScale, false);
  }

  private step(dt: number, simDt: number, warm: boolean): void {
    this.light.update(this.timeScale > 1 && !warm ? dt * 2.2 : dt);
    const t = this.time;
    for (const p of this.plants) {
      if (p.state === 'seed') {
        if (!p.grounded) {
          p.svy += 900 * simDt;
          p.sy += p.svy * simDt;
          if (p.sy >= p.y) {
            p.sy = p.y;
            p.grounded = true;
            this.ripples.push({ x: p.x, y: p.y, t: 0, sp: p.sp });
          }
        } else {
          p.delay -= simDt;
          if (p.delay <= 0) {
            p.germinate();
            this.ripples.push({ x: p.x, y: p.y, t: 0, sp: p.sp });
          }
        }
      } else {
        if (p.state === 'fading') p.fade -= dt / 1.8;
        p.update(simDt, t, this.wind, this);
      }
    }
    if (this.plants.some((p) => p.fade <= 0)) this.plants = this.plants.filter((p) => p.fade > 0);
    if (warm) return;

    const m = this.calm ? 0.25 : 1;
    for (const o of this.motes) {
      o.x += (o.vx + Math.sin(t * 0.3 + o.ph) * 5) * dt * o.d * m;
      o.y += (o.vy + Math.cos(t * 0.23 + o.ph) * 4) * dt * o.d * m;
      if (o.x < -10) o.x = this.w + 10;
      else if (o.x > this.w + 10) o.x = -10;
      if (o.y < -10) o.y = this.h * 0.95;
      else if (o.y > this.h) o.y = -10;
    }
    const pl = this.pollenList;
    for (let i = pl.length - 1; i >= 0; i--) {
      const p = pl[i];
      p.life += dt;
      this.light.sample(p.x, p.y);
      p.vx += (Math.cos(lightOut.a) * 18 * lightOut.i + Math.sin(t + p.max * 3) * 6 - p.vx * 0.5) * dt;
      p.vy += (Math.sin(lightOut.a) * 12 * lightOut.i - 3 - p.vy * 0.5) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life > p.max) pl.splice(i, 1);
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].t += dt;
      if (this.ripples[i].t > 1.4) this.ripples.splice(i, 1);
    }
  }
}
