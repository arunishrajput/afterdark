import { loadFont as loadGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import TL from './timeline.json';

export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const TOTAL = TL.duration * FPS;
export const f = (s: number) => Math.round(s * FPS);
export type SceneId = keyof typeof TL.scenes;
export const scene = (id: SceneId) => TL.scenes[id] as [number, number];

export const grotesk = loadGrotesk('normal', { weights: ['400', '500', '700'], subsets: ['latin'] }).fontFamily;
export const mono = loadMono('normal', { weights: ['400', '500', '700'], subsets: ['latin'] }).fontFamily;
export const inter = loadInter('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] }).fontFamily;

export const C = {
  bg: '#03050A',
  ink: '#05070D',
  surface: '#0E1424',
  blue: '#2E8BFF',
  blueHi: '#8EC5FF',
  red: '#FF3B3B',
  redHi: '#FF9A9A',
  green: '#7CFF4F',
  amber: '#FFB020',
  white: '#F2F5FB',
  muted: '#8A94B3',
  regionA: '#4FB3FF',
  regionB: '#FF4F9A',
  regionC: '#B6F24A',
};

/* ── easing ── */
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const outCubic = (t: number) => 1 - (1 - clamp(t)) ** 3;
export const inCubic = (t: number) => clamp(t) ** 3;
export const inOutCubic = (t: number) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const outExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * clamp(t)));
export const inExpo = (t: number) => (t <= 0 ? 0 : 2 ** (10 * clamp(t) - 10));
export const inOutExpo = (t: number) => {
  const x = clamp(t);
  if (x === 0 || x === 1) return x;
  return x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2;
};
export const outBack = (t: number, s = 1.70158) => {
  const x = clamp(t) - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
};
export const outQuint = (t: number) => 1 - (1 - clamp(t)) ** 5;

/** Progress of [start, start+dur] (in frames) with an easing. */
export const prog = (frame: number, start: number, dur: number, ease: (t: number) => number = (t) => clamp(t)) =>
  ease((frame - start) / Math.max(1, dur));

/** Piecewise keyframes: keys are [frame, value]; each segment uses `ease`. */
export const kf = (frame: number, keys: [number, number][], ease: (t: number) => number = inOutCubic) => {
  if (frame <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, v0] = keys[i];
    const [f1, v1] = keys[i + 1];
    if (frame <= f1) return lerp(v0, v1, ease((frame - f0) / Math.max(1e-6, f1 - f0)));
  }
  return keys[keys.length - 1][1];
};

export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ── polylines ── */
export type Pt = [number, number];
export class Poly {
  readonly pts: Pt[];
  readonly cum: number[];
  readonly length: number;
  constructor(pts: Pt[]) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    this.length = this.cum[this.cum.length - 1] || 0;
  }
  at(s: number): { x: number; y: number; a: number } {
    const d = clamp(s, 0, this.length);
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const [x0, y0] = this.pts[i - 1] ?? this.pts[0];
    const [x1, y1] = this.pts[i] ?? this.pts[0];
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const t = (d - this.cum[i - 1]) / seg;
    return { x: lerp(x0, x1, t), y: lerp(y0, y1, t), a: Math.atan2(y1 - y0, x1 - x0) };
  }
  /** Points between s0 and s1 (for trails). */
  slice(s0: number, s1: number, step = 6): Pt[] {
    const a = clamp(Math.min(s0, s1), 0, this.length);
    const b = clamp(Math.max(s0, s1), 0, this.length);
    const out: Pt[] = [];
    for (let s = a; s < b; s += step) {
      const p = this.at(s);
      out.push([p.x, p.y]);
    }
    const e = this.at(b);
    out.push([e.x, e.y]);
    return out;
  }
}
