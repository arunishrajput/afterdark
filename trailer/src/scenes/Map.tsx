import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, sec } from '../theme';
import { Scanlines, Shake, Slam, Vignette, clamp01, ease, hash } from '../kit';
import { Cam, City, Ground, Item, MapStage, Trail } from '../world';

export const Caption: React.FC<{ children: React.ReactNode; bottom?: number; top?: boolean }> = ({ children, bottom = 110, top }) => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: top ? 'flex-start' : 'flex-end', paddingBottom: top ? 0 : bottom, paddingTop: top ? bottom : 0 }}>{children}</AbsoluteFill>
);

const dotBase = (i: number): [number, number] => [(hash(i + 1) - 0.5) * 1100, (hash(i + 20) - 0.5) * 800];
export const wander = (i: number, f: number): [number, number] => {
  const [bx, by] = dotBase(i);
  return [bx + Math.sin(f / (36 + i * 3) + i) * 110, by + Math.cos(f / (44 + i * 2) + i * 2) * 85];
};

/** 0–6 s */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const redAt = sec(3.5);
  const snap = ease((frame - redAt) / 12);
  const target = wander(3, frame);
  const cam: Cam = {
    tilt: interpolate(frame, [0, 100], [64, 56], { extrapolateRight: 'clamp' }) - snap * 14,
    rot: interpolate(frame, [0, 180], [8, -14]),
    zoom: interpolate(frame, [0, 100], [0.9, 1.15], { extrapolateRight: 'clamp' }) + snap * 1.0,
    x: target[0] * snap,
    y: target[1] * snap,
  };
  const whiteOut = clamp01((frame - sec(5.55)) / sec(0.45));
  const fadeIn = clamp01(frame / 12);
  const isRed = frame >= redAt;
  const redP = clamp01((frame - redAt) / 6);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <Shake at={[sec(0.5), sec(2.0), redAt]} amp={16}>
        <MapStage
          cam={cam}
          tone={isRed ? 'red' : 'blue'}
          items={Array.from({ length: 8 }, (_, i): Item => {
            const red = isRed && i === 3;
            const appear = clamp01((frame - 8 - i * 4) / 10);
            const [x, y] = wander(i, frame);
            return { kind: 'orb', x, y, color: red ? C.red : C.blue, size: Math.max(0.01, appear) * (red ? 1.25 : 1), pulse: red, dim: appear };
          })}
        >
          <City tone={isRed ? 'red' : 'blue'} />
          {Array.from({ length: 8 }, (_, i) => (
            <Trail key={i} pos={(f) => wander(i, f)} frame={frame} color={isRed && i === 3 ? C.red : C.blue} len={18} step={2} width={18} />
          ))}
        </MapStage>
        <AbsoluteFill style={{ background: C.red, opacity: redP * 0.12 }} />
        <Vignette />
        <Caption bottom={140}>
          <Slam delay={sec(0.5)} out={sec(1.85)} size={150}>They look like you.</Slam>
          <Slam delay={sec(2.0)} out={sec(3.35)} size={150} style={{ position: 'absolute', bottom: 140 }}>They move like you.</Slam>
          <Slam delay={sec(3.5)} size={170} glow={C.red} style={{ position: 'absolute', bottom: 140 }}>
            One of them <span style={{ color: C.red }}>isn't.</span>
          </Slam>
        </Caption>
      </Shake>
      <Scanlines />
      <AbsoluteFill style={{ background: '#fff', opacity: whiteOut ** 2 }} />
    </AbsoluteFill>
  );
};

export const REGION = ['#46c8ff', '#ff4d9d', '#9dff4f'];
const ARENA_R = 430;
const PINS = Array.from({ length: 13 }, (_, i) => {
  const a = hash(i + 50) * Math.PI * 2;
  const r = 90 + hash(i + 70) * (ARENA_R - 140);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, region: Math.floor(((a / (Math.PI * 2)) * 3 + 3) % 3) };
});
const SPAWNS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + 0.3;
  return { x: Math.cos(a) * (ARENA_R - 70), y: Math.sin(a) * (ARENA_R - 70) };
});

/** 10–18 s */
export const Arena: React.FC = () => {
  const frame = useCurrentFrame();
  const draw = ease(frame / 60);
  const regionsOn = clamp01((frame - 50) / 24);
  const circ = 2 * Math.PI * ARENA_R;
  const cam: Cam = {
    tilt: interpolate(frame, [0, 90, 240], [48, 58, 52]),
    rot: interpolate(frame, [0, 240], [-24, 26]),
    zoom: interpolate(frame, [0, 120, 240], [0.95, 1.2, 1.35]),
    x: 0,
    y: interpolate(frame, [0, 240], [-60, -100]),
  };
  const dropAt = 150;
  const caption2 = frame >= dropAt - 6;
  return (
    <AbsoluteFill>
      <Shake at={[0, dropAt + 6, dropAt + 18, dropAt + 30]} amp={10}>
        <MapStage
          cam={cam}
          items={[
            ...PINS.map((p, i): Item => ({ kind: 'pin', x: p.x, y: p.y, color: REGION[p.region], scale: 0.55, delay: 80 + i * 4 })),
            ...SPAWNS.flatMap((s, i): Item[] => {
              const l = frame - (dropAt + i * 4);
              return l < 0 ? [] : [{ kind: 'orb', x: s.x, y: s.y, color: C.blue, size: 0.85, beam: interpolate(l, [0, 6, 14], [900, 160, 140], { extrapolateRight: 'clamp' }) }];
            }),
          ]}
        >
          <City lit={0.9} />
          <svg width={1200} height={1200} viewBox="-600 -600 1200 1200" style={{ position: 'absolute', left: -600, top: -600 }}>
            {[0, 1, 2].map((k) => {
              const a0 = (k / 3) * Math.PI * 2 - Math.PI / 2;
              const a1 = ((k + 1) / 3) * Math.PI * 2 - Math.PI / 2;
              const d = `M0 0 L${Math.cos(a0) * ARENA_R} ${Math.sin(a0) * ARENA_R} A${ARENA_R} ${ARENA_R} 0 0 1 ${Math.cos(a1) * ARENA_R} ${Math.sin(a1) * ARENA_R} Z`;
              return <path key={k} d={d} fill={REGION[k]} opacity={0.16 * regionsOn} stroke={REGION[k]} strokeWidth={4} strokeOpacity={regionsOn} />;
            })}
            <circle cx={0} cy={0} r={ARENA_R} fill="none" stroke="#fff" strokeWidth={8} strokeDasharray={circ} strokeDashoffset={circ * (1 - draw)} transform="rotate(-90)" style={{ filter: 'drop-shadow(0 0 18px #fff)' }} />
          </svg>
          {SPAWNS.map((s, i) => {
            const l = frame - (dropAt + i * 4);
            if (l < 0) return null;
            const ring = clamp01(l / 20);
            return <Ground key={i} x={s.x} y={s.y} r={30 + ring * 170} color={C.blue} fill={0} width={5} opacity={1 - ring} />;
          })}
        </MapStage>
        <Vignette />
        <Caption top bottom={90}>
          {!caption2 && <Slam delay={6} out={dropAt - 12} size={118}>Draw the arena.</Slam>}
          {caption2 && (
            <Slam delay={dropAt - 6} size={104} style={{ maxWidth: 1500 }}>
              The real world <span style={{ color: C.blue }}>is the map.</span>
            </Slam>
          )}
        </Caption>
      </Shake>
      <Scanlines o={0.05} />
    </AbsoluteFill>
  );
};
