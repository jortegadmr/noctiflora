import './style.css';
import { Garden, type Choice } from './garden';
import { Renderer } from './render';

const canvas = document.getElementById('garden') as HTMLCanvasElement;
const hint = document.getElementById('hint') as HTMLElement;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;

const maxDpr = coarse ? 1.5 : 1.75;
let quality = Math.min(window.devicePixelRatio || 1, maxDpr);
const bgSeed = (Math.random() * 1e9) | 0;

let w = window.innerWidth;
let h = window.innerHeight;
const garden = new Garden(w, h, reduce, coarse || w < 640 ? 40 : 80);
const renderer = new Renderer(canvas);
renderer.resize(w, h, quality, bgSeed);
garden.seedInitial(reduce ? 60 : 28);

// ------------------------------------------------------------------ resize
let resizeTimer = 0;
function applySize(): void {
  w = window.innerWidth;
  h = window.innerHeight;
  garden.resize(w, h);
  renderer.resize(w, h, quality, bgSeed);
}
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(applySize, 120);
});

// ------------------------------------------------------------------- input
let interacted = false;
let movedFor = 0;
function touched(): void {
  if (interacted) return;
  interacted = true;
  hint.classList.add('gone');
}

let down: { x: number; y: number; t: number; id: number } | null = null;

window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && !down) return;
  garden.light.setPointer(e.clientX, e.clientY);
  movedFor += 1;
  if (movedFor > 90) touched();
});

canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  garden.light.setPointer(e.clientX, e.clientY);
});

canvas.addEventListener('pointerup', (e) => {
  if (down && down.id === e.pointerId) {
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (dx * dx + dy * dy < 144 && performance.now() - down.t < 450) {
      garden.sow(e.clientX, e.clientY);
      touched();
    }
  }
  down = null;
  if (e.pointerType === 'touch') garden.light.releasePointer();
});

canvas.addEventListener('pointercancel', () => {
  down = null;
  garden.light.releasePointer();
});

document.documentElement.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') garden.light.releasePointer();
});

canvas.addEventListener('keydown', (e) => {
  const l = garden.light;
  const step = 44;
  let handled = true;
  const x = l.pointerOn ? l.px : l.dx;
  const y = l.pointerOn ? l.py : l.dy;
  switch (e.key) {
    case 'ArrowLeft':
      l.setPointer(Math.max(0, x - step), y);
      break;
    case 'ArrowRight':
      l.setPointer(Math.min(w, x + step), y);
      break;
    case 'ArrowUp':
      l.setPointer(x, Math.max(0, y - step));
      break;
    case 'ArrowDown':
      l.setPointer(x, Math.min(h, y + step));
      break;
    case 'Enter':
    case ' ':
      garden.sow(x, y);
      break;
    default:
      handled = false;
  }
  if (handled) {
    e.preventDefault();
    touched();
  }
});

// ---------------------------------------------------------------------- UI
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-species]'));
for (const chip of chips) {
  chip.addEventListener('click', () => {
    garden.choice = chip.dataset.species as Choice;
    for (const c of chips) c.setAttribute('aria-pressed', String(c === chip));
  });
}

const lapse = document.getElementById('lapse') as HTMLButtonElement;
lapse.addEventListener('click', () => {
  const on = garden.timeScale === 1;
  garden.timeScale = on ? 7 : 1;
  lapse.setAttribute('aria-pressed', String(on));
});

(document.getElementById('reset') as HTMLButtonElement).addEventListener('click', () => {
  garden.clearAll();
  garden.seedInitial(0);
  touched();
});

// -------------------------------------------------------------------- loop
const capture = new URLSearchParams(window.location.search).has('capture');
if (capture) {
  // Deterministic stepping for automated screenshots.
  (window as unknown as { __capture: unknown }).__capture = {
    garden,
    step(dt: number): void {
      garden.update(dt);
      renderer.render(garden);
    },
    snap: () => canvas.toDataURL('image/jpeg', 0.92),
  };
}
let last = performance.now();
let slow = 0;
let fast = 0;
function frame(now: number): void {
  if (capture) return;
  const dt = (now - last) / 1000;
  last = now;
  garden.update(dt);
  renderer.render(garden);

  // adapt the render resolution to the device
  if (dt > 0.034) {
    slow += dt;
    fast = 0;
  } else if (dt < 0.02) {
    fast += dt;
    slow = Math.max(0, slow - dt);
  }
  if (slow > 1.5 && quality > 1) {
    quality = Math.max(1, quality - 0.25);
    slow = 0;
    renderer.resize(w, h, quality, bgSeed);
  } else if (fast > 8 && quality < Math.min(window.devicePixelRatio || 1, maxDpr)) {
    quality = Math.min(Math.min(window.devicePixelRatio || 1, maxDpr), quality + 0.25);
    fast = 0;
    renderer.resize(w, h, quality, bgSeed);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
