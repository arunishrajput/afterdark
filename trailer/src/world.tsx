import React, { createContext, useContext, useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C } from './theme';
import { clamp01, ease, hash } from './kit';

/* ───────────────────────── 3D map stage ───────────────────────── */
export interface Cam {
  tilt: number; // deg, 0 = top-down
  rot: number; // deg
  zoom: number;
  x: number; // plane coords the camera looks at
  y: number;
}
const CamCtx = createContext<Cam>({ tilt: 55, rot: 0, zoom: 1, x: 0, y: 0 });
export const useCam = () => useContext(CamCtx);

export const MapStage: React.FC<{ cam: Cam; tone?: 'blue' | 'red'; children?: React.ReactNode; fog?: number; items?: Item[] }> = ({ cam, tone = 'blue', children, fog = 1, items = [] }) => {
  const glow = tone === 'red' ? 'rgba(255,59,59,0.20)' : 'rgba(46,139,255,0.20)';
  return (
    <AbsoluteFill style={{ background: tone === 'red' ? '#070204' : C.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(1300px 800px at 50% 40%, ${glow}, transparent 70%)` }} />
      <AbsoluteFill
        style={{
          perspective: 1500,
          perspectiveOrigin: '50% 38%',
          WebkitMaskImage: `radial-gradient(ellipse at 50% 55%, black ${40 * fog + 20}%, transparent ${90}%)`,
          maskImage: `radial-gradient(ellipse at 50% 55%, black ${40 * fog + 20}%, transparent ${90}%)`,
        }}
      >
        <CamCtx.Provider value={cam}>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '56%',
              width: 0,
              height: 0,
              transformStyle: 'preserve-3d',
              transform: `scale(${cam.zoom}) rotateX(${cam.tilt}deg) rotateZ(${cam.rot}deg) translate(${-cam.x}px, ${-cam.y}px)`,
            }}
          >
            {children}
            {items.map((it, i) => (
              <ItemGround key={i} it={it} />
            ))}
          </div>
        </CamCtx.Provider>
      </AbsoluteFill>
      <CamCtx.Provider value={cam}>
        <StandLayer items={items} />
      </CamCtx.Provider>
    </AbsoluteFill>
  );
};

/* ───────────────────────── City ───────────────────────── */
const PITCH = 250;
const SPAN = 7;
const BLOCKS = (() => {
  const out: { x: number; y: number; w: number; h: number; tall: number; park: boolean }[] = [];
  for (let ix = -SPAN; ix <= SPAN; ix++) {
    for (let iy = -SPAN; iy <= SPAN; iy++) {
      const k = ix * 31 + iy * 17 + 100;
      const w = 150 + hash(k) * 70;
      const h = 150 + hash(k + 5) * 70;
      out.push({ x: ix * PITCH - w / 2, y: iy * PITCH - h / 2, w, h, tall: 6 + hash(k + 9) * 34, park: hash(k + 13) > 0.9 });
    }
  }
  return out;
})();

export const City: React.FC<{ tone?: 'blue' | 'red'; lit?: number }> = ({ tone = 'blue', lit = 1 }) => {
  const edge = tone === 'red' ? 'rgba(255,110,110,0.65)' : 'rgba(120,170,255,0.7)';
  const road = tone === 'red' ? 'rgba(255,70,70,0.38)' : 'rgba(60,150,255,0.42)';
  const size = (SPAN * 2 + 2) * PITCH;
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} style={{ position: 'absolute', left: -size / 2, top: -size / 2 }}>
      {Array.from({ length: SPAN * 2 + 1 }, (_, i) => {
        const p = (i - SPAN) * PITCH;
        return (
          <g key={i}>
            <line x1={-size / 2} x2={size / 2} y1={p + PITCH / 2} y2={p + PITCH / 2} stroke={road} strokeWidth={5} />
            <line y1={-size / 2} y2={size / 2} x1={p + PITCH / 2} x2={p + PITCH / 2} stroke={road} strokeWidth={5} />
          </g>
        );
      })}
      {BLOCKS.map((b, i) =>
        b.park ? (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={26} fill={tone === 'red' ? 'rgba(120,30,30,0.18)' : 'rgba(40,200,120,0.07)'} stroke="rgba(120,255,180,0.12)" strokeWidth={2} />
        ) : (
          <g key={i} opacity={lit}>
            <rect x={b.x} y={b.y - b.tall} width={b.w} height={b.h + b.tall} rx={8} fill={tone === 'red' ? '#1a080e' : '#0e1838'} />
            <rect x={b.x} y={b.y - b.tall} width={b.w} height={b.h} rx={8} fill={tone === 'red' ? '#2a0f16' : '#1a2a5c'} stroke={edge} strokeWidth={3} />
            {hash(i + 3) > 0.62 && <rect x={b.x + 18} y={b.y - b.tall + 18} width={b.w * 0.3} height={5} fill={tone === 'red' ? C.red : '#6fa8ff'} opacity={0.9} />}
          </g>
        ),
      )}
    </svg>
  );
};

/* ───────────────────────── projection ───────────────────────── */
const W = 1920;
const H = 1080;
const PERSP = 1500;
const PO = { x: 0.5, y: 0.38 }; // perspective origin
const PL = { x: 0.5, y: 0.56 }; // plane origin
export const project = (cam: Cam, x: number, y: number, z = 0) => {
  const px = x - cam.x;
  const py = y - cam.y;
  const r = (cam.rot * Math.PI) / 180;
  const t = (cam.tilt * Math.PI) / 180;
  const x1 = px * Math.cos(r) - py * Math.sin(r);
  const y1 = px * Math.sin(r) + py * Math.cos(r);
  const y2 = y1 * Math.cos(t) - z * Math.sin(t);
  const z2 = y1 * Math.sin(t) + z * Math.cos(t);
  const X = x1 * cam.zoom;
  const Y = y2 * cam.zoom;
  const Z = z2 * cam.zoom;
  const f = PERSP / (PERSP - Z);
  const sx = PO.x * W + (X + (PL.x - PO.x) * W) * f;
  const sy = PO.y * H + (Y + (PL.y - PO.y) * H) * f;
  return { sx, sy, s: f * cam.zoom, depth: Z, ok: Z < PERSP - 50 };
};

export type Item =
  | { kind: 'orb'; x: number; y: number; color?: string; size?: number; label?: string; beam?: number; pulse?: boolean; dim?: number }
  | { kind: 'pin'; x: number; y: number; color?: string; scale?: number; delay?: number; ghost?: boolean };

export const Ground: React.FC<{ x: number; y: number; r: number; color: string; fill?: number; width?: number; dash?: boolean; opacity?: number }> = ({ x, y, r, color, fill = 0.12, width = 3, dash, opacity = 1 }) => (
  <div
    style={{
      position: 'absolute',
      left: x - r,
      top: y - r,
      width: r * 2,
      height: r * 2,
      borderRadius: '50%',
      border: `${width}px ${dash ? 'dashed' : 'solid'} ${color}`,
      background: `radial-gradient(circle, ${color}${Math.round(fill * 255).toString(16).padStart(2, '0')}, transparent 70%)`,
      boxShadow: `0 0 ${r * 0.35}px ${color}66, inset 0 0 ${r * 0.3}px ${color}33`,
      opacity,
    }}
  />
);

const ItemGround: React.FC<{ it: Item }> = ({ it }) => {
  const frame = useCurrentFrame();
  if (it.kind === 'orb') {
    const { x, y, color = C.blue, size = 1, pulse, dim = 1 } = it;
    const p = pulse ? (frame % 40) / 40 : 0;
    return (
      <>
        <Ground x={x} y={y} r={64 * size} color={color} fill={0.4} width={4} opacity={dim} />
        {pulse && <Ground x={x} y={y} r={64 * size + p * 170} color={color} fill={0} width={6} opacity={(1 - p) * dim} />}
      </>
    );
  }
  const { x, y, color = C.red, scale = 1, delay = 0 } = it;
  const l = frame - delay;
  if (l < 0) return null;
  const ring = clamp01((l - 8) / 26);
  return (
    <>
      <Ground x={x} y={y} r={20 + ring * 220 * scale} color={color} fill={0} width={7} opacity={(1 - ring) * (l > 8 ? 1 : 0)} />
      <Ground x={x} y={y} r={40 * scale} color={color} fill={0.6} width={4} />
    </>
  );
};

const ItemStand: React.FC<{ it: Item; id: string }> = ({ it, id }) => {
  const frame = useCurrentFrame();
  const cam = useCam();
  const p = project(cam, it.x, it.y);
  if (!p.ok) return null;
  if (it.kind === 'orb') {
    const { color = C.blue, size = 1, label, beam = 240, dim = 1 } = it;
    return (
      <div style={{ position: 'absolute', left: p.sx, top: p.sy, width: 0, height: 0, transform: `scale(${p.s})`, transformOrigin: '0 0', opacity: dim }}>
        <svg width="400" height={beam + 200} viewBox={`-200 ${-beam - 100} 400 ${beam + 200}`} style={{ position: 'absolute', left: -200, top: -beam - 100, overflow: 'visible', filter: `drop-shadow(0 0 ${26 * size}px ${color})` }}>
          <defs>
            <linearGradient id={`bm${id}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor={color} stopOpacity="0.9" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <radialGradient id={`cr${id}`} cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.5" stopColor={color} />
              <stop offset="1" stopColor={color} stopOpacity="0.7" />
            </radialGradient>
          </defs>
          <rect x={-7} y={-beam} width={14} height={beam} fill={`url(#bm${id})`} />
          <circle cx={0} cy={-beam * 0.5} r={34 * size} fill={`url(#cr${id})`} />
          <circle cx={0} cy={-beam * 0.5} r={50 * size} fill="none" stroke={color} strokeWidth={3} opacity={0.5} />
          {label && (
            <text x={0} y={-beam * 0.5 - 70 * size} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontWeight={700} fontSize={36} letterSpacing={3} fill={color}>{label}</text>
          )}
        </svg>
      </div>
    );
  }
  const { color = C.red, scale = 1, delay = 0, ghost } = it;
  const l = frame - delay;
  if (l < 0) return null;
  const drop = interpolate(l, [0, 8, 12, 15], [-300, 0, -34, 0], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: p.sx, top: p.sy, width: 0, height: 0, transform: `scale(${p.s})`, transformOrigin: '0 0' }}>
      <svg width={116 * scale} height={156 * scale} viewBox="0 0 64 86" style={{ position: 'absolute', left: -58 * scale, top: -156 * scale + drop, overflow: 'visible', filter: `drop-shadow(0 0 18px ${color})` }}>
        <path d="M32 2 C14 2 3 15 3 31 C3 52 32 84 32 84 C32 84 61 52 61 31 C61 15 50 2 32 2Z" fill={color} />
        <circle cx="32" cy="31" r="12" fill="#07080c" />
        {ghost && <text x="32" y="37" textAnchor="middle" fontSize="18" fontWeight="700" fill={color} fontFamily="JetBrains Mono, monospace">?</text>}
      </svg>
    </div>
  );
};

export const StandLayer: React.FC<{ items: Item[] }> = ({ items }) => {
  const cam = useCam();
  const order = items
    .map((it, i) => ({ it, i, d: project(cam, it.x, it.y).depth }))
    .sort((a, b) => a.d - b.d);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {order.map(({ it, i }) => (
        <ItemStand key={i} it={it} id={`i${i}`} />
      ))}
    </AbsoluteFill>
  );
};

export const Trail: React.FC<{ pos: (f: number) => [number, number]; frame: number; color: string; len?: number; step?: number; width?: number }> = ({ pos, frame, color, len = 22, step = 1.5, width = 16 }) => {
  const pts = useMemo(() => [] as [number, number][], []);
  pts.length = 0;
  for (let k = 0; k <= len; k++) pts.push(pos(Math.max(0, frame - k * step)));
  return (
    <svg width="1" height="1" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      {pts.slice(0, -1).map((p, k) => {
        const q = pts[k + 1];
        if (!q) return null;
        return <line key={k} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={color} strokeWidth={width * (1 - k / len)} strokeLinecap="round" opacity={(1 - k / len) * 0.7} />;
      })}
    </svg>
  );
};

/** Position along a polyline at fraction u in [0,1] (by length). */
export const along = (pts: [number, number][], u: number): [number, number] => {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(d);
    total += d;
  }
  let t = clamp01(u) * total;
  for (let i = 0; i < seg.length; i++) {
    const d = seg[i]!;
    if (t <= d || i === seg.length - 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const f = d === 0 ? 0 : Math.min(1, t / d);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    t -= d;
  }
  return pts[pts.length - 1]!;
};

/* ───────────────────────── Crewmate (front view) ───────────────────────── */
export const Crewmate: React.FC<{ color?: string; height?: number; run?: boolean; flip?: boolean; phase?: number; body?: string; glow?: number; style?: React.CSSProperties; tilt?: number }> = ({
  color = C.blue,
  height = 300,
  run = false,
  flip = false,
  phase = 0,
  body = '#0b1020',
  glow = 1,
  style,
  tilt = 0,
}) => {
  const frame = useCurrentFrame();
  const w = height * (100 / 120);
  const s = Math.sin(frame * 0.55 + phase);
  const bob = run ? Math.abs(s) * -6 : Math.sin(frame / 18 + phase) * -2;
  const legA = run ? s * 6 : 0;
  const legB = run ? -s * 6 : 0;
  return (
    <div style={{ width: w, height, transform: `scaleX(${flip ? -1 : 1}) rotate(${tilt}deg)`, filter: `drop-shadow(0 0 ${28 * glow}px ${color}aa)`, ...style }}>
      <svg width={w} height={height} viewBox="0 0 100 120" overflow="visible">
        <g transform={`translate(0 ${bob})`}>
          <rect x="29" y={92 + legA} width="17" height="21" rx="7" fill={body} stroke={color} strokeWidth="2.4" />
          <rect x="54" y={92 + legB} width="17" height="21" rx="7" fill={body} stroke={color} strokeWidth="2.4" />
          <rect x="10" y="46" width="15" height="38" rx="7" fill={body} stroke={color} strokeWidth="2.4" />
          <path d="M26 44 a24 28 0 0 1 48 0 V86 a10 10 0 0 1 -10 10 H36 a10 10 0 0 1 -10 -10 Z" fill={body} stroke={color} strokeWidth="2.8" strokeLinejoin="round" />
          <defs>
            <linearGradient id={`vis${color.slice(1)}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.35" stopColor={color} />
              <stop offset="1" stopColor={color} stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <ellipse cx="58" cy="46" rx="20" ry="13" fill={`url(#vis${color.slice(1)})`} stroke={color} strokeWidth="1.5" />
          <ellipse cx="52" cy="41" rx="8" ry="3.6" fill="#fff" opacity="0.8" />
        </g>
      </svg>
    </div>
  );
};

export { ease };

