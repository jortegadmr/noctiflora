import { Rng, angleDiff, clamp } from './util';
import { Light, lightOut } from './light';
import type { Species } from './species';

export type FlowerKind = 'cup' | 'blossom' | 'bell' | 'spore';

export interface Flower {
  kind: FlowerKind;
  size: number;
  born: number;
  open: number;
  petals: number;
  phase: number;
}

export interface Fx {
  pollen(x: number, y: number, sp: Species): void;
}

export class Branch {
  n = 1;
  grow = 0;
  done = false;
  wander = 0;
  flower: Flower | null = null;
  bx = 0;
  by = 0;
  ba = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly a: Float32Array;
  readonly ra: Float32Array;
  readonly rel: Float32Array;
  readonly bend: Float32Array;
  readonly r: Float32Array;
  readonly mass: Float32Array;
  readonly childMass: Float32Array;
  readonly I: Float32Array;
  readonly L: Float32Array;
  readonly born: Float32Array;
  readonly leaf: Float32Array;
  readonly leafSide: Int8Array;

  constructor(
    readonly parent: Branch | null,
    readonly pIdx: number,
    readonly baseRel: number,
    readonly depth: number,
    readonly maxNodes: number,
    readonly len: number,
    readonly curl: number,
    readonly upMul: number,
    readonly blade: number,
  ) {
    const c = maxNodes + 2;
    this.x = new Float32Array(c);
    this.y = new Float32Array(c);
    this.a = new Float32Array(c);
    this.ra = new Float32Array(c);
    this.rel = new Float32Array(c);
    this.bend = new Float32Array(c);
    this.r = new Float32Array(c);
    this.mass = new Float32Array(c);
    this.childMass = new Float32Array(c);
    this.I = new Float32Array(c);
    this.L = new Float32Array(c);
    this.born = new Float32Array(c);
    this.leaf = new Float32Array(c);
    this.leafSide = new Int8Array(c);
  }
}

export type PlantState = 'seed' | 'alive' | 'fading';

export class Plant {
  branches: Branch[] = [];
  nodes = 0;
  age = 0;
  state: PlantState = 'seed';
  fade = 1;
  mature = false;
  lightAvg = 0;
  sproutT = 0;
  roots = 0;
  readonly rng: Rng;
  readonly variant: number;
  readonly phase: number;
  /** falling seed position */
  sy: number;
  svy = 0;
  grounded = false;

  constructor(
    readonly sp: Species,
    public x: number,
    public y: number,
    readonly z: number,
    readonly S: number,
    seed: number,
    public delay: number,
    startY: number,
    private light: Light,
  ) {
    this.rng = new Rng(seed);
    this.variant = this.rng.int(-1, 1) * 12;
    this.phase = this.rng.range(0, 6.28);
    this.sy = startY;
    if (startY >= y) {
      this.sy = y;
      this.grounded = true;
    }
  }

  // ---------------------------------------------------------------- creation

  germinate(): void {
    const { sp, rng, S } = this;
    this.state = 'alive';
    const len = sp.step * S;
    switch (sp.id) {
      case 'fern': {
        const R = rng.int(5, 7);
        for (let i = 0; i < R; i++) {
          const u = (i / (R - 1)) * 2 - 1;
          const nodes = Math.round((24 + rng.range(0, 16)) * (1 - 0.3 * Math.abs(u)));
          this.root(u * 0.85 + rng.range(-0.12, 0.12), nodes, len, u * 0.03 + rng.sign() * 0.012, 1, 0);
        }
        break;
      }
      case 'arbor': {
        const R = rng.chance(0.25) ? 2 : 1;
        for (let i = 0; i < R; i++) {
          const ang = R === 1 ? rng.range(-0.15, 0.15) : (i ? 1 : -1) * rng.range(0.15, 0.3);
          this.root(ang, rng.int(10, 14), len, 0, 1, 0);
        }
        break;
      }
      case 'lily': {
        const stalks = rng.int(2, 4);
        for (let i = 0; i < stalks; i++) {
          const ang = (i - (stalks - 1) / 2) * 0.3 + rng.range(-0.08, 0.08);
          this.root(ang, rng.int(20, 32), len, 0, 1, 0);
        }
        const blades = rng.int(3, 5);
        for (let i = 0; i < blades; i++) this.addBlade();
        break;
      }
      case 'vine': {
        const R = rng.int(1, 2);
        for (let i = 0; i < R; i++) this.root(rng.range(-0.3, 0.3), rng.int(70, 105), len, 0, 1, 0);
        break;
      }
    }
  }

  private addBlade(): void {
    const { rng, S, sp } = this;
    const side = rng.sign();
    this.root(side * rng.range(0.35, 1.0), rng.int(9, 14), sp.step * S * 0.95, side * 0.07, 0.1, rng.range(3.5, 5.5) * S);
  }

  private root(ang: number, maxNodes: number, len: number, curl: number, upMul: number, blade: number): void {
    this.roots++;
    this.spawn(null, 0, -Math.PI / 2 + ang, 0, maxNodes, len, curl, upMul, blade);
  }

  private spawn(
    parent: Branch | null,
    pIdx: number,
    baseRel: number,
    depth: number,
    maxNodes: number,
    len: number,
    curl: number,
    upMul: number,
    blade: number,
  ): Branch {
    const b = new Branch(parent, pIdx, baseRel, depth, maxNodes, len, curl, upMul, blade);
    b.born[0] = this.age;
    if (parent) {
      b.x[0] = parent.x[pIdx];
      b.y[0] = parent.y[pIdx];
      b.a[0] = parent.a[pIdx] + baseRel;
      b.ra[0] = parent.ra[pIdx] + baseRel;
    } else {
      b.x[0] = this.x;
      b.y[0] = this.y;
      b.a[0] = baseRel;
      b.ra[0] = baseRel;
    }
    this.branches.push(b);
    this.nodes++;
    this.mature = false;
    return b;
  }

  private setLeaf(b: Branch, idx: number, size: number, side: number): void {
    b.leaf[idx] = size;
    b.leafSide[idx] = side;
  }

  private addFlower(b: Branch, kind: FlowerKind, size: number, petals: number): void {
    b.flower = { kind, size, born: this.age, open: 0.1, petals, phase: this.rng.range(0, 6.28) };
  }

  // ------------------------------------------------------------------ growth

  private pushNode(b: Branch): void {
    const idx = b.n;
    const { sp, rng } = this;
    const px = b.x[idx - 1];
    const py = b.y[idx - 1];
    const A = b.ra[idx - 1];
    this.light.sample(px, py);
    const I = lightOut.i;
    const L = lightOut.a;
    const h = this.light.h;
    const ceil = clamp((h * 0.14 - py) / (h * 0.1), 0, 1);
    let vx = Math.cos(A);
    let vy = Math.sin(A);
    vy -= sp.up * b.upMul * (1 - ceil);
    vy += ceil * 0.9;
    const photo = sp.photo * Math.pow(I, 0.6);
    vx += Math.cos(L) * photo;
    vy += Math.sin(L) * photo;
    const desired = Math.atan2(vy, vx);
    const turn = clamp(angleDiff(A, desired) * sp.turnRate, -sp.maxTurn, sp.maxTurn);
    b.wander = b.wander * 0.82 + (rng.next() - 0.5) * sp.noise;
    let rel = turn + b.wander + b.curl;
    if (sp.id === 'vine' && b.depth === 0) rel += Math.sin(idx * 0.32 + this.phase) * 0.12;
    b.rel[idx] = rel;
    b.ra[idx] = A + rel;
    b.a[idx] = b.a[idx - 1];
    b.x[idx] = px;
    b.y[idx] = py;
    b.I[idx] = b.I[idx - 1];
    b.L[idx] = b.L[idx - 1];
    b.born[idx] = this.age;
    b.n++;
    this.nodes++;
    this.onNode(b, idx);
  }

  private completeNode(b: Branch): void {
    if (b.n >= b.maxNodes || this.nodes >= this.sp.cap) {
      b.done = true;
      b.grow = 1;
      this.onDone(b);
      return;
    }
    this.pushNode(b);
  }

  private onNode(b: Branch, idx: number): void {
    const { sp, rng, S } = this;
    switch (sp.id) {
      case 'fern':
        if (b.depth === 0) {
          if (idx >= 3 && idx % 2 === 1) {
            const side = idx % 4 === 1 ? 1 : -1;
            const frac = idx / b.maxNodes;
            const prof = Math.pow(Math.sin(Math.PI * clamp(0.14 + frac * 0.86, 0, 1)), 0.8);
            const pn = Math.max(3, Math.round(2 + (b.maxNodes / 40) * 8 * prof));
            this.spawn(b, idx - 1, side * rng.range(0.95, 1.2), 1, pn, b.len * 0.5, -side * 0.07, 0.5, 0);
          }
        } else {
          const rem = 1 - idx / b.maxNodes;
          this.setLeaf(b, idx, (4 + 3.4 * rem) * S, idx % 2 ? 1 : -1);
        }
        break;
      case 'arbor':
        if (b.depth < sp.maxDepth - 1 && idx >= b.maxNodes * 0.35 && idx <= b.maxNodes * 0.85 && rng.chance(0.15)) {
          this.spawn(b, idx - 1, rng.sign() * rng.range(0.6, 1.0), b.depth + 1, Math.max(3, Math.round(b.maxNodes * 0.55)), b.len * 0.85, 0, 1, 0);
        }
        if (b.depth >= 2) this.setLeaf(b, idx, rng.range(4.5, 7) * S, 0);
        break;
      case 'lily':
        if (b.depth === 0 && !b.blade) {
          if (idx === Math.round(b.maxNodes * 0.7) && rng.chance(0.55)) {
            this.spawn(b, idx - 1, rng.sign() * 0.75, 1, Math.max(4, Math.round(b.maxNodes * 0.22)), b.len * 0.85, rng.range(-0.02, 0.02), 1, 0);
          }
          if (idx % 3 === 0 && idx < b.maxNodes - 3) this.setLeaf(b, idx, rng.range(5, 8) * S, idx % 2 ? 1 : -1);
        }
        break;
      case 'vine':
        if (b.depth === 0) {
          if (idx >= 5 && idx % 7 === 0) {
            const side = (idx / 7) % 2 ? 1 : -1;
            this.spawn(b, idx - 1, side * rng.range(1.0, 1.4), 1, rng.int(10, 17), b.len * 0.6, side * 0.2, 0.3, 0);
          }
          if (idx % 3 === 0) this.setLeaf(b, idx, rng.range(6, 9) * S, (idx / 3) % 2 ? 1 : -1);
        }
        break;
    }
  }

  private onDone(b: Branch): void {
    const { sp, rng, S } = this;
    if (b.blade) return;
    switch (sp.id) {
      case 'fern':
        if (b.depth === 0) this.addFlower(b, 'spore', 3.4 * S, 1);
        break;
      case 'arbor': {
        if (b.depth >= sp.maxDepth) {
          this.addFlower(b, 'blossom', rng.range(6, 9) * S, 5);
          break;
        }
        const count = b.depth === 0 && rng.chance(0.3) ? 3 : 2;
        const spread = rng.range(0.4, 0.7);
        for (let k = 0; k < count; k++) {
          const rel = (count === 2 ? (k ? spread : -spread) : (k - 1) * spread * 1.1) + rng.range(-0.12, 0.12);
          this.spawn(b, b.n - 1, rel, b.depth + 1, Math.max(3, Math.round(b.maxNodes * rng.range(0.7, 0.82))), b.len * 0.9, 0, 1, 0);
        }
        break;
      }
      case 'lily':
        this.addFlower(b, 'cup', (b.depth === 0 ? 24 : 14) * S, 7);
        break;
      case 'vine':
        if (b.depth === 0) this.addFlower(b, 'blossom', 11 * S, 5);
        else this.addFlower(b, 'bell', 7 * S, 4);
        break;
    }
  }

  private sprout(): void {
    const { sp, rng, S } = this;
    if (this.nodes > sp.cap - 40) return;
    switch (sp.id) {
      case 'fern':
        if (this.roots < 11) this.root(rng.range(-0.9, 0.9), rng.int(18, 30), sp.step * S, rng.range(-0.012, 0.012), 1, 0);
        break;
      case 'lily':
        if (this.roots < 9) {
          if (rng.chance(0.5)) this.addBlade();
          else this.root(rng.range(-0.5, 0.5), rng.int(14, 22), sp.step * S, 0, 1, 0);
        }
        break;
      case 'arbor': {
        for (let tries = 0; tries < 6; tries++) {
          const b = this.branches[rng.int(0, this.branches.length - 1)];
          if (b.depth >= sp.maxDepth || b.n < 6) continue;
          const idx = rng.int(2, b.n - 2);
          if (b.I[idx] < 0.3) continue;
          this.spawn(b, idx, rng.sign() * rng.range(0.6, 1.1), sp.maxDepth, rng.int(4, 7), b.len * 0.8, 0, 1, 0);
          break;
        }
        break;
      }
      case 'vine': {
        for (let tries = 0; tries < 6; tries++) {
          const b = this.branches[rng.int(0, this.branches.length - 1)];
          if (b.depth !== 0 || b.n < 8) continue;
          const idx = rng.int(5, b.n - 2);
          const side = rng.sign();
          this.spawn(b, idx, side * rng.range(0.8, 1.3), 1, rng.int(18, 30), b.len * 0.8, side * 0.05, 0.6, 0);
          break;
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ update

  update(dt: number, t: number, wind: number, fx: Fx): void {
    this.age += dt;
    const { sp } = this;
    const count = this.branches.length;
    let allDone = true;
    for (let k = 0; k < count; k++) {
      const b = this.branches[k];
      if (b.done) continue;
      allDone = false;
      const tipx = b.x[b.n - 1];
      const tipy = b.y[b.n - 1];
      this.light.sample(tipx, tipy);
      const sMul = sp.dark + (1 - sp.dark) * lightOut.i;
      b.grow += (sp.speed * this.S * sMul * dt) / (b.len * (1 + 0.1 * b.depth));
      let guard = 0;
      while (b.grow >= 1 && !b.done && guard++ < 40) {
        b.grow -= 1;
        this.completeNode(b);
      }
    }
    this.mature = allDone && this.branches.length === count;

    this.kinematics(dt, t, wind);
    this.thickness();

    for (const b of this.branches) {
      const f = b.flower;
      if (!f) continue;
      const tipI = b.I[b.n - 1];
      const target = clamp(0.15 + 1.1 * Math.pow(tipI, 0.7), 0, 1);
      f.open += (target - f.open) * (1 - Math.exp(-dt * 1.6));
      if (f.kind !== 'spore' && f.open > 0.7 && this.age - f.born > 5 && Math.random() < dt * 0.35) {
        fx.pollen(b.x[b.n - 1], b.y[b.n - 1], sp);
      }
    }

    if (this.mature && this.lightAvg > 0.22) {
      this.sproutT += dt * this.lightAvg;
      if (this.sproutT > 4.5) {
        this.sproutT = 0;
        this.sprout();
      }
    }
  }

  private kinematics(dt: number, t: number, wind: number): void {
    const { sp, light } = this;
    const kb = 1 - Math.exp(-Math.min(dt, 0.2) * 2.5);
    let sumI = 0;
    let cnt = 0;
    for (const b of this.branches) {
      let x: number;
      let y: number;
      let ra: number;
      let a: number;
      if (b.parent) {
        const p = b.parent;
        x = p.x[b.pIdx];
        y = p.y[b.pIdx];
        ra = p.ra[b.pIdx] + b.baseRel;
        a = p.a[b.pIdx] + b.baseRel;
      } else {
        x = this.x;
        y = this.y;
        ra = b.baseRel;
        a = ra;
      }
      b.bx = x;
      b.by = y;
      b.ba = a;
      const n = b.n;
      const inv = 1 / n;
      for (let i = 0; i < n; i++) {
        const frac = (i + 1) * inv;
        const I = b.I[i];
        let target = 0;
        if (I > 0.02) {
          const fs = clamp(1.7 - b.r[i] * 0.22, 0.35, 1.6) * (0.3 + 0.7 * frac);
          target = sp.flex * fs * Math.sin(angleDiff(b.a[i], b.L[i])) * Math.pow(I, 0.7);
        }
        if (wind > 0) target += wind * sp.sway * 0.011 * Math.sin(t * 0.9 + this.phase + i * 0.25 + b.depth * 1.7) * (0.3 + 0.7 * frac);
        const nb = clamp(b.bend[i] + (target - b.bend[i]) * kb, -0.14, 0.14);
        b.bend[i] = nb;
        a += b.rel[i] + nb;
        ra += b.rel[i];
        const seg = i === n - 1 && !b.done ? b.len * b.grow : b.len;
        x += Math.cos(a) * seg;
        y += Math.sin(a) * seg;
        b.x[i] = x;
        b.y[i] = y;
        b.a[i] = a;
        b.ra[i] = ra;
        light.sample(x, y);
        b.I[i] = lightOut.i;
        b.L[i] = lightOut.a;
        sumI += lightOut.i;
        cnt++;
      }
    }
    if (cnt) this.lightAvg += (sumI / cnt - this.lightAvg) * (1 - Math.exp(-dt * 0.8));
  }

  private thickness(): void {
    const bs = this.branches;
    const sp = this.sp;
    const rmin = 0.4 * this.S;
    for (const b of bs) b.childMass.fill(0, 0, b.n);
    for (let k = bs.length - 1; k >= 0; k--) {
      const b = bs[k];
      const n = b.n;
      let m = 0;
      for (let i = n - 1; i >= 0; i--) {
        const seg = i === n - 1 && !b.done ? b.len * b.grow : b.len;
        m += seg + b.childMass[i];
        b.mass[i] = m;
        if (b.blade) {
          const tt = (i + 1) / b.maxNodes;
          b.r[i] = Math.max(0.2, b.blade * Math.pow(Math.sin(Math.PI * Math.min(tt, 1)), 0.7) * (i === n - 1 && !b.done ? 0.6 : 1));
        } else {
          b.r[i] = Math.max(rmin, sp.thick * Math.sqrt(m));
        }
      }
      if (b.parent && n > 0) b.parent.childMass[b.pIdx] += b.mass[0];
    }
  }
}
