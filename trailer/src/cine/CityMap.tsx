import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import MAP from '../data/map.json';
import { C, clamp, H, outBack, outCubic, Poly, Pt, W } from './lib';

export const MAPDATA = MAP as unknown as {
  size: [number, number];
  center: Pt;
  zoneR: number;
  base: Pt;
  spawns: Pt[];
  pins: Pt[];
  roads: { d: string; k: number; len: number; r: number }[];
  routes: { scatter: Pt[][]; converge: Pt[][]; toPin: Pt[][]; victim: Pt[] };
};
export const ROUTES = {
  scatter: MAPDATA.routes.scatter.map((p) => new Poly(p)),
  converge: MAPDATA.routes.converge.map((p) => new Poly(p)),
  toPin: MAPDATA.routes.toPin.map((p) => new Poly(p)),
  victim: new Poly(MAPDATA.routes.victim),
};
export const [CX, CY] = MAPDATA.center;

export interface Cam {
  x: number;
  y: number;
  zoom: number;
  tilt: number; // deg
  rot: number; // deg
  cy?: number; // screen y of the look-at point
}
const P = 1500;

export const project = (cam: Cam, px: number, py: number) => {
  const vx = (px - cam.x) * cam.zoom;
  const vy = (py - cam.y) * cam.zoom;
  const r = (cam.rot * Math.PI) / 180;
  const t = (cam.tilt * Math.PI) / 180;
  const X = vx * Math.cos(r) - vy * Math.sin(r);
  const Y = vx * Math.sin(r) + vy * Math.cos(r);
  const Z = Y * Math.sin(t);
  const k = P / Math.max(80, P - Z);
  return { x: W / 2 + X * k, y: (cam.cy ?? H / 2) + Y * Math.cos(t) * k, k };
};

/* ───────── players, pins ───────── */
export interface Dot {
  id: string;
  x: number;
  y: number;
  color: string;
  size?: number; // radius in px at k=1
  trail?: Pt[];
  trailColor?: string;
  ring?: string; // outer ring colour (imposter view etc.)
  label?: string;
  labelBelow?: boolean;
  glow?: number;
  opacity?: number;
  pulse?: number; // 0..1 ripple phase
}
export interface Pin {
  id: string;
  x: number;
  y: number;
  drop: number; // 0..1 drop-in progress
  kind?: 'task' | 'fake' | 'locked' | 'done';
  scale?: number;
}

const trailSegments = (pts: [number, number][], n = 14) => {
  const out: { d: string; o: number }[] = [];
  if (pts.length < 2) return out;
  const per = Math.max(1, Math.ceil(pts.length / n));
  for (let i = 0; i < pts.length - 1; i += per) {
    const seg = pts.slice(i, Math.min(pts.length, i + per + 1));
    out.push({ d: 'M' + seg.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L'), o: (i + per) / pts.length });
  }
  return out;
};

const PinShape: React.FC<{ x: number; y: number; k: number; p: Pin; tilt: number }> = ({ x, y, k, p, tilt }) => {
  const s = (p.scale ?? 1) * k * 1.0;
  const fall = 1 - outBack(p.drop, 2.2);
  const op = clamp(p.drop * 3);
  const col = p.kind === 'fake' ? C.red : p.kind === 'locked' ? '#5A6278' : p.kind === 'done' ? C.green : C.white;
  const inner = p.kind === 'fake' ? '#2a0606' : '#0a1222';
  const ripple = clamp((p.drop - 0.35) / 0.65);
  const cos = Math.cos((tilt * Math.PI) / 180);
  return (
    <g opacity={op}>
      {ripple > 0 && ripple < 1 && (
        <ellipse cx={x} cy={y} rx={70 * s * ripple} ry={70 * s * ripple * cos} fill="none" stroke={col} strokeWidth={3 * (1 - ripple)} opacity={1 - ripple} />
      )}
      <ellipse cx={x} cy={y} rx={13 * s} ry={13 * s * cos} fill={col} opacity={0.25} />
      <g transform={`translate(${x} ${y - fall * 220 * s}) scale(${s})`} style={{ filter: `drop-shadow(0 0 ${10}px ${col})` }}>
        <path d="M0 0 C -6 -12 -20 -22 -20 -38 A 20 20 0 1 1 20 -38 C 20 -22 6 -12 0 0 Z" fill={col} />
        <circle cx={0} cy={-38} r={8.5} fill={inner} />
        {p.kind === 'locked' && <path d="M-5 -36 h10 v8 h-10 z M-3.5 -36 v-4 a3.5 3.5 0 0 1 7 0 v4" fill="none" stroke="#cfd6e6" strokeWidth={1.8} />}
        {p.kind === 'fake' && <text x={0} y={-33} fontSize={13} fontWeight={700} fill={C.red} textAnchor="middle" fontFamily="sans-serif">?</text>}
      </g>
    </g>
  );
};

/* ───────── the map ───────── */
export const CityMap: React.FC<{
  cam: Cam;
  draw?: number; // street draw-on 0..1
  baseOpacity?: number;
  zone?: number; // zone circle 0..1
  regions?: number; // region tint 0..1
  baseMarker?: number; // Base marker 0..1
  tone?: 'blue' | 'red';
  dots?: Dot[];
  pins?: Pin[];
  ground?: React.ReactNode; // extra world-space SVG on the ground
  overlay?: (proj: (x: number, y: number) => { x: number; y: number; k: number }) => React.ReactNode;
  roadGlow?: number;
  fog?: boolean;
}> = ({ cam, draw = 1, baseOpacity = 1, zone = 0, regions = 0, baseMarker = 0, tone = 'blue', dots = [], pins = [], ground, overlay, roadGlow = 1, fog = true }) => {
  const [MW, MH] = MAPDATA.size;
  const cy = cam.cy ?? H / 2;
  const roadCol = tone === 'red' ? '#FF4B4B' : '#3F95FF';
  const roadCore = tone === 'red' ? '#FF9A9A' : '#9CCBFF';
  const proj = (x: number, y: number) => project(cam, x, y);
  const R = MAPDATA.zoneR;
  const wedge = (a0: number, a1: number) => {
    const r0 = (a0 * Math.PI) / 180;
    const r1 = (a1 * Math.PI) / 180;
    return `M${CX} ${CY} L${CX + R * Math.cos(r0)} ${CY + R * Math.sin(r0)} A${R} ${R} 0 0 1 ${CX + R * Math.cos(r1)} ${CY + R * Math.sin(r1)} Z`;
  };
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, perspective: P, perspectiveOrigin: `${W / 2}px ${cy}px` }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: MW,
            height: MH,
            transformOrigin: '0 0',
            transform: `translate(${W / 2}px, ${cy}px) rotateX(${cam.tilt}deg) rotateZ(${cam.rot}deg) scale(${cam.zoom}) translate(${-cam.x}px, ${-cam.y}px)`,
          }}
        >
          <Img src={staticFile('map/base.png')} style={{ position: 'absolute', inset: 0, width: MW, height: MH, opacity: baseOpacity, filter: tone === 'red' ? 'hue-rotate(150deg) saturate(1.3)' : undefined }} />
          <svg width={MW} height={MH} viewBox={`0 0 ${MW} ${MH}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            {regions > 0 && (
              <g opacity={regions}>
                <path d={wedge(-90, 30)} fill={C.regionA} fillOpacity={0.1} stroke={C.regionA} strokeOpacity={0.55} strokeWidth={3} />
                <path d={wedge(30, 150)} fill={C.regionB} fillOpacity={0.1} stroke={C.regionB} strokeOpacity={0.55} strokeWidth={3} />
                <path d={wedge(150, 270)} fill={C.regionC} fillOpacity={0.08} stroke={C.regionC} strokeOpacity={0.5} strokeWidth={3} />
              </g>
            )}
            {MAPDATA.roads.map((r, i) => {
              const p = clamp((draw * 1.5 - (r.r / 2100) * 0.5 - (i % 7) * 0.012) / 0.5);
              if (p <= 0) return null;
              return (
                <g key={i}>
                  <path d={r.d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} fill="none" stroke={roadCol} strokeOpacity={0.16 * roadGlow} strokeWidth={r.k === 1 ? 22 : 14} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={r.d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} fill="none" stroke={r.k === 1 ? roadCore : roadCol} strokeOpacity={r.k === 1 ? 0.95 : 0.7} strokeWidth={r.k === 1 ? 3.2 : 2} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              );
            })}
            {zone > 0 && (
              <g>
                <circle cx={CX} cy={CY} r={R} fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={26} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - zone} transform={`rotate(-90 ${CX} ${CY})`} />
                <circle cx={CX} cy={CY} r={R} fill="none" stroke="#fff" strokeWidth={4} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - zone} transform={`rotate(-90 ${CX} ${CY})`} />
              </g>
            )}
            {baseMarker > 0 && (
              <g opacity={baseMarker}>
                <circle cx={MAPDATA.base[0]} cy={MAPDATA.base[1]} r={51} fill="#fff" fillOpacity={0.06} stroke="#fff" strokeOpacity={0.7} strokeWidth={3} strokeDasharray="10 8" />
              </g>
            )}
            {ground}
          </svg>
        </div>
      </div>
      {fog && (
        <AbsoluteFill
          style={{
            background:
              cam.tilt > 20
                ? `linear-gradient(180deg, ${C.bg} 0%, ${C.bg}EE ${Math.max(4, 30 - cam.tilt * 0.25)}%, transparent ${Math.max(20, 62 - cam.tilt * 0.4)}%)`
                : 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(3,5,10,0.85) 100%)',
          }}
        />
      )}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {dots.map((d) => {
          if (!d.trail || d.trail.length < 2) return null;
          const pts = d.trail.map(([x, y]) => {
            const q = proj(x, y);
            return [q.x, q.y] as [number, number];
          });
          const q = proj(d.x, d.y);
          return (
            <g key={`t-${d.id}`} opacity={d.opacity ?? 1}>
              {trailSegments(pts).map((s, i) => (
                <g key={i}>
                  <path d={s.d} fill="none" stroke={d.trailColor ?? d.color} strokeOpacity={0.22 * s.o} strokeWidth={16 * q.k} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={s.d} fill="none" stroke={d.trailColor ?? d.color} strokeOpacity={0.95 * s.o} strokeWidth={4.5 * q.k} strokeLinecap="round" strokeLinejoin="round" />
                </g>
              ))}
            </g>
          );
        })}
        {pins.map((p) => {
          const q = proj(p.x, p.y);
          return <PinShape key={p.id} x={q.x} y={q.y} k={q.k} p={p} tilt={cam.tilt} />;
        })}
        {dots.map((d) => {
          const q = proj(d.x, d.y);
          const r = (d.size ?? 11) * q.k;
          const cos = Math.cos((cam.tilt * Math.PI) / 180);
          return (
            <g key={d.id} opacity={d.opacity ?? 1}>
              <ellipse cx={q.x} cy={q.y} rx={r * 3.4} ry={r * 3.4 * cos} fill={d.color} opacity={0.13 * (d.glow ?? 1)} />
              {d.pulse !== undefined && d.pulse > 0 && d.pulse < 1 && (
                <ellipse cx={q.x} cy={q.y} rx={r * (1.5 + 6 * d.pulse)} ry={r * (1.5 + 6 * d.pulse) * cos} fill="none" stroke={d.ring ?? d.color} strokeWidth={2.5} opacity={1 - d.pulse} />
              )}
              {d.ring && <circle cx={q.x} cy={q.y - r * 0.2} r={r * 1.75} fill="none" stroke={d.ring} strokeWidth={Math.max(2, r * 0.28)} />}
              <circle cx={q.x} cy={q.y - r * 0.2} r={r * 1.18} fill="#04060c" />
              <circle cx={q.x} cy={q.y - r * 0.2} r={r} fill={d.color} style={{ filter: `drop-shadow(0 0 ${8 * (d.glow ?? 1)}px ${d.color})` }} />
              <circle cx={q.x - r * 0.3} cy={q.y - r * 0.55} r={r * 0.32} fill="#fff" opacity={0.55} />
              {d.label && (
                <text x={q.x} y={d.labelBelow ? q.y + r * 2.2 + 14 : q.y - r * 2.6} fill="#fff" fontSize={Math.max(18, 20 * q.k)} fontFamily="JetBrains Mono, monospace" fontWeight={700} textAnchor="middle" letterSpacing={2} style={{ paintOrder: 'stroke', stroke: '#03050a', strokeWidth: 5 }}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        {overlay?.(proj)}
      </svg>
    </AbsoluteFill>
  );
};

/** Position along a route with a timed walk. */
export const walk = (route: Poly, frame: number, start: number, dur: number, ease: (t: number) => number = outCubic, from = 0, to = 1) => {
  const p = clamp((frame - start) / dur);
  const s = route.length * (from + (to - from) * ease(p));
  return { ...route.at(s), s };
};
