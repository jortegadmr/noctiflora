import { lerp } from './util';

export type Hsl = [number, number, number];
export type SpeciesId = 'fern' | 'arbor' | 'lily' | 'vine';

export interface Stops {
  dark: Hsl;
  mid: Hsl;
  bright: Hsl;
  hot: Hsl;
}

export interface Species {
  id: SpeciesId;
  label: string;
  stem: Stops;
  leaf: Stops;
  petal: Hsl;
  petalTip: Hsl;
  core: Hsl;
  /** rgb of the halo sprite */
  halo: [number, number, number];
  step: number;
  speed: number;
  dark: number;
  photo: number;
  up: number;
  turnRate: number;
  maxTurn: number;
  noise: number;
  thick: number;
  flex: number;
  sway: number;
  maxDepth: number;
  cap: number;
  baseGlow: number;
}

export const NL = 16;

export const SPECIES: Record<SpeciesId, Species> = {
  fern: {
    id: 'fern',
    label: 'Fern',
    stem: { dark: [190, 60, 9], mid: [172, 70, 22], bright: [162, 90, 50], hot: [150, 100, 71] },
    leaf: { dark: [188, 60, 11], mid: [168, 80, 28], bright: [156, 100, 56], hot: [140, 100, 75] },
    petal: [45, 100, 62],
    petalTip: [50, 100, 82],
    core: [48, 100, 92],
    halo: [90, 255, 200],
    step: 9,
    speed: 24,
    dark: 0.3,
    photo: 1.1,
    up: 0.55,
    turnRate: 0.22,
    maxTurn: 0.08,
    noise: 0.05,
    thick: 0.085,
    flex: 0.036,
    sway: 1,
    maxDepth: 1,
    cap: 720,
    baseGlow: 0.2,
  },
  arbor: {
    id: 'arbor',
    label: 'Lumen tree',
    stem: { dark: [255, 45, 16], mid: [262, 55, 34], bright: [268, 80, 56], hot: [285, 90, 71] },
    leaf: { dark: [240, 50, 12], mid: [228, 65, 32], bright: [200, 90, 58], hot: [186, 100, 73] },
    petal: [16, 100, 62],
    petalTip: [38, 100, 80],
    core: [46, 100, 92],
    halo: [255, 150, 110],
    step: 11,
    speed: 24,
    dark: 0.3,
    photo: 1.4,
    up: 0.35,
    turnRate: 0.2,
    maxTurn: 0.09,
    noise: 0.09,
    thick: 0.095,
    flex: 0.03,
    sway: 0.6,
    maxDepth: 4,
    cap: 700,
    baseGlow: 0.2,
  },
  lily: {
    id: 'lily',
    label: 'Lily',
    stem: { dark: [150, 50, 9], mid: [150, 60, 22], bright: [145, 80, 46], hot: [140, 100, 63] },
    leaf: { dark: [170, 55, 10], mid: [165, 70, 24], bright: [158, 90, 46], hot: [152, 100, 65] },
    petal: [322, 100, 58],
    petalTip: [334, 100, 82],
    core: [52, 100, 88],
    halo: [255, 80, 190],
    step: 10,
    speed: 26,
    dark: 0.3,
    photo: 0.9,
    up: 1,
    turnRate: 0.22,
    maxTurn: 0.07,
    noise: 0.03,
    thick: 0.09,
    flex: 0.036,
    sway: 0.8,
    maxDepth: 1,
    cap: 360,
    baseGlow: 0.2,
  },
  vine: {
    id: 'vine',
    label: 'Vine',
    stem: { dark: [215, 60, 10], mid: [212, 70, 26], bright: [200, 90, 56], hot: [190, 100, 71] },
    leaf: { dark: [200, 70, 12], mid: [196, 80, 30], bright: [186, 95, 55], hot: [176, 100, 71] },
    petal: [42, 100, 58],
    petalTip: [50, 100, 84],
    core: [55, 100, 92],
    halo: [255, 210, 110],
    step: 6.5,
    speed: 28,
    dark: 0.3,
    photo: 1.7,
    up: 0.5,
    turnRate: 0.28,
    maxTurn: 0.16,
    noise: 0.16,
    thick: 0.05,
    flex: 0.05,
    sway: 1.2,
    maxDepth: 1,
    cap: 520,
    baseGlow: 0.2,
  },
};

export const SPECIES_IDS: SpeciesId[] = ['fern', 'arbor', 'lily', 'vine'];

export function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h.toFixed(0)},${s.toFixed(0)}%,${l.toFixed(1)}%,${a})`;
}

function mix(a: Hsl, b: Hsl, t: number): Hsl {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

const rampCache = new Map<string, string[]>();

/** A colour ramp of NL steps from the dim body colour up to the lit, pale glow. */
export function ramp(key: string, st: Stops, hueShift: number): string[] {
  const id = `${key}:${hueShift}`;
  const hit = rampCache.get(id);
  if (hit) return hit;
  const out: string[] = [];
  for (let i = 0; i < NL; i++) {
    const t = i / (NL - 1);
    let c: Hsl;
    if (t < 0.4) c = mix(st.dark, st.mid, t / 0.4);
    else if (t < 0.78) c = mix(st.mid, st.bright, (t - 0.4) / 0.38);
    else c = mix(st.bright, st.hot, (t - 0.78) / 0.22);
    out.push(hsl(c[0] + hueShift, c[1], c[2]));
  }
  rampCache.set(id, out);
  return out;
}
