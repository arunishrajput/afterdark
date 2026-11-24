import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { C, mono } from '../theme';
import { Flash, Scanlines, Shake, Shockwave, Slam, StripeBar, Vignette, clamp01, ease, hash } from '../kit';
import { Cam, City, Ground, Item, MapStage, Trail } from '../world';
import { Caption } from './Map';

const R = 190;
const slot = (i: number): [number, number] => [Math.cos((i / 8) * Math.PI * 2 - Math.PI / 2) * R, Math.sin((i / 8) * Math.PI * 2 - Math.PI / 2) * R];
const start = (i: number): [number, number] => {
  const a = (i / 8) * Math.PI * 2 + 0.6;
  const d = 1000 + hash(i + 3) * 300;
  return [Math.cos(a) * d, Math.sin(a) * d];
};
const posAt = (i: number, f: number): [number, number] => {
  const t = ease((f - i * 3) / 52);
  const [sx, sy] = start(i);
  const [ex, ey] = slot(i);
  // swirl in: blend angle for a curved approach
  const sw = (1 - t) * 0.9;
  const x = sx + (ex - sx) * t;
  const y = sy + (ey - sy) * t;
  return [x * Math.cos(sw) - y * Math.sin(sw) * 0.35, y * Math.cos(sw) + x * Math.sin(sw) * 0.35];
};

/** 44–50 s */
export const Meeting: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={45}><Alarm /></Sequence>
    <Sequence from={45} durationInFrames={90}><Converge /></Sequence>
    <Sequence from={135} durationInFrames={45}><Vote /></Sequence>
    <Scanlines o={0.05} />
  </AbsoluteFill>
);

const Alarm: React.FC = () => {
  const frame = useCurrentFrame();
  const strobe = Math.sin(frame * 0.9) > 0 ? 1 : 0.25;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(1100px 800px at 50% 50%, rgba(255,59,59,${0.6 * strobe}), transparent 72%)` }} />
      <StripeBar y={0} height={70} speed={14} />
      <StripeBar y={1010} height={70} speed={-14} />
      <Shake at={[0, 6, 12, 18, 24, 30, 36]} amp={14}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Slam delay={0} size={200} glow={C.red} from={1.5}>Emergency</Slam>
          <Slam delay={4} size={200} color={C.red} from={1.5}>Meeting</Slam>
        </AbsoluteFill>
      </Shake>
      <Shockwave delay={0} color={C.red} size={2400} dur={30} />
      <Shockwave delay={12} color={C.white} size={2000} dur={30} />
      <Flash at={0} dur={6} />
    </AbsoluteFill>
  );
};

const Converge: React.FC = () => {
  const frame = useCurrentFrame();
  const cam: Cam = { tilt: 38, rot: interpolate(frame, [0, 90], [-14, 8]), zoom: interpolate(frame, [0, 90], [0.8, 1.3]), x: 0, y: 0 };
  const pulse = (frame % 30) / 30;
  return (
    <AbsoluteFill>
      <MapStage
        cam={cam}
        items={Array.from({ length: 8 }, (_, i): Item => {
          const [x, y] = posAt(i, frame);
          return { kind: 'orb', x, y, color: C.blue, size: 0.95, beam: 170 };
        })}
      >
        <City />
        <Ground x={0} y={0} r={260} color="#ffffff" fill={0.06} width={4} dash />
        <Ground x={0} y={0} r={260 + pulse * 140} color="#ffffff" fill={0} width={4} opacity={(1 - pulse) * 0.7} />
        {Array.from({ length: 8 }, (_, i) => (
          <Trail key={i} pos={(f) => posAt(i, f)} frame={frame} color={C.blue} len={22} step={2.2} width={18} />
        ))}
      </MapStage>
      <Vignette />
      <Caption top bottom={90}>
        <Slam delay={4} size={118}>Face to face.</Slam>
      </Caption>
    </AbsoluteFill>
  );
};

const TARGET = 2;
const Vote: React.FC = () => {
  const frame = useCurrentFrame();
  const cam: Cam = { tilt: 38, rot: 8 + frame * 0.1, zoom: interpolate(frame, [0, 45], [1.3, 1.5]), x: 0, y: 0 };
  const n = frame < 14 ? 3 : frame < 28 ? 2 : 1;
  const l = frame % 14;
  const fade = clamp01((frame - 38) / 7);
  return (
    <AbsoluteFill>
      <MapStage
        cam={cam}
        items={Array.from({ length: 8 }, (_, i): Item => {
          const [x, y] = slot(i);
          return { kind: 'orb', x, y, color: i === TARGET && frame > 24 ? C.red : C.blue, size: i === TARGET ? 1.15 : 0.95, beam: 170, pulse: i === TARGET && frame > 24 };
        })}
      >
        <City />
        <Ground x={0} y={0} r={260} color="#ffffff" fill={0.06} width={4} dash />
        <svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          {Array.from({ length: 8 }, (_, i) => {
            if (i === TARGET) return null;
            const p = ease((frame - 4 - i * 2) / 10);
            const [x0, y0] = slot(i);
            const [x1, y1] = slot(TARGET);
            return <line key={i} x1={x0} y1={y0} x2={x0 + (x1 - x0) * p} y2={y0 + (y1 - y0) * p} stroke={C.red} strokeWidth={9} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 10px ${C.red})` }} />;
          })}
        </svg>
      </MapStage>
      <Vignette />
      <AbsoluteFill style={{ background: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
        {frame < 40 && (
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 460, color: n === 1 ? C.red : C.white, transform: `scale(${1 + (1 - ease(l / 8)) * 0.35})`, opacity: 0.95 - l * 0.03, textShadow: `0 0 90px ${n === 1 ? C.red : '#fff'}` }}>{n}</div>
        )}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#000', opacity: fade }} />
    </AbsoluteFill>
  );
};
