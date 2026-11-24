import React from 'react';
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, grotesk } from '../theme';
import { Backdrop, Flash, Scanlines, Shake, Shockwave, Slam, Vignette, clamp01, ease, hash } from '../kit';
import { Cam, City, Crewmate, Ground, Item, MapStage, Trail, along } from '../world';
import { Caption, wander } from './Map';

/** 34–44 s */
export const Hunt: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={105}><Stalk /></Sequence>
    <Sequence from={105} durationInFrames={45}><Boxes /></Sequence>
    <Sequence from={150} durationInFrames={15}><Jammed /></Sequence>
    <Sequence from={165} durationInFrames={45}><Disguise /></Sequence>
    <Sequence from={210} durationInFrames={45}><Fooled /></Sequence>
    <Sequence from={255} durationInFrames={45}><Trust /></Sequence>
    <Scanlines o={0.06} />
  </AbsoluteFill>
);

const P_ALL: [number, number][] = [[-1000, 640], [-420, 260], [-150, 120], [120, 170], [380, 40]];
const U0 = 0.443;
const victim = (f: number) => along(P_ALL, Math.min(0.62, U0 + Math.max(0, f) * 0.00115));
const gap = (f: number) => interpolate(f, [0, 42], [0.2, 0.025], { extrapolateRight: 'clamp' });
const red = (f: number) => along(P_ALL, Math.max(0, Math.min(0.62, U0 + Math.max(0, f) * 0.00115) - gap(f)));

const Stalk: React.FC = () => {
  const frame = useCurrentFrame();
  const v = victim(frame);
  const r = red(frame);
  const cam: Cam = { tilt: 52, rot: interpolate(frame, [0, 105], [-8, -26]), zoom: interpolate(frame, [0, 105], [1.15, 1.7]), x: (v[0] + r[0]) / 2, y: (v[1] + r[1]) / 2 };
  const chan = clamp01((frame - 40) / 60);
  const infected = frame >= 100;
  const sick = frame >= 100 && frame < 114;
  const CIRC = 2 * Math.PI * 110;
  return (
    <AbsoluteFill>
      <Shake at={[0, 100]} amp={14}>
        <MapStage
          cam={cam}
          tone="red"
          items={[
            { kind: 'orb', x: v[0], y: v[1], color: sick ? C.green : C.blue, size: 1, beam: 170, label: undefined },
            { kind: 'orb', x: r[0], y: r[1], color: C.red, size: 1.1, pulse: true, beam: 190 },
            ...[0, 1, 2, 3].map((i): Item => {
              const [x, y] = wander(i + 4, frame + 40);
              return { kind: 'orb', x: x * 0.55 + 200, y: y * 0.55, color: C.blue, size: 0.7, beam: 130, dim: 0.55 };
            }),
          ]}
        >
          <City tone="red" />
          <Trail pos={victim} frame={frame} color={C.blue} len={24} step={2} width={16} />
          <Trail pos={red} frame={frame} color={C.red} len={26} step={2} width={16} />
          {frame >= 34 && <Ground x={r[0]} y={r[1]} r={150} color={C.red} fill={0.1} width={5} dash opacity={clamp01((frame - 34) / 6)} />}
          {frame >= 40 && frame < 114 && (
            <svg width={260} height={260} viewBox="-130 -130 260 260" style={{ position: 'absolute', left: v[0] - 130, top: v[1] - 130, overflow: 'visible' }}>
              <circle r={110} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={12} />
              <circle r={110} fill="none" stroke={infected ? C.green : C.red} strokeWidth={14} strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - chan)} transform="rotate(-90)" style={{ filter: `drop-shadow(0 0 14px ${infected ? C.green : C.red})` }} />
            </svg>
          )}
          {sick && <Ground x={v[0]} y={v[1]} r={60 + (frame - 100) * 22} color={C.green} fill={0} width={8} opacity={1 - (frame - 100) / 14} />}
        </MapStage>
        <Vignette />
        <Caption top bottom={90}>
          <Slam delay={3} size={134} glow={C.red} color={C.white}>Infect.</Slam>
        </Caption>
      </Shake>
      <Flash at={0} dur={5} peak={0.5} color={C.red} />
    </AbsoluteFill>
  );
};

const Boxes: React.FC = () => {
  const frame = useCurrentFrame();
  const fill = [6, 14, 22, 30];
  return (
    <AbsoluteFill>
      <Backdrop tone="red" dots={9} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 70 }}>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
          {Array.from({ length: 6 }, (_, i) => {
            const at = fill[i];
            const on = at !== undefined && frame >= at;
            const l = frame - (at ?? 0);
            const pop = on ? interpolate(l, [0, 4, 10], [1.7, 0.92, 1], { extrapolateRight: 'clamp' }) : 1;
            return (
              <React.Fragment key={i}>
                <div style={{ width: 150, height: 150, borderRadius: 22, border: `6px solid ${on ? C.red : '#ffffff35'}`, background: on ? C.red : 'rgba(255,255,255,0.04)', boxShadow: on ? `0 0 ${l < 8 ? 110 : 60}px ${C.red}` : 'none', transform: `scale(${pop}) translate(${on && l < 6 ? (hash(frame + i) - 0.5) * 16 : 0}px,0)` }} />
                {i === 4 && <div style={{ width: 10, height: 210, background: '#fff', borderRadius: 5, boxShadow: '0 0 30px #fff' }} />}
              </React.Fragment>
            );
          })}
        </div>
        <Slam delay={4} size={104}>Nobody <span style={{ color: C.red }}>knows.</span></Slam>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Disguise: React.FC = () => {
  const frame = useCurrentFrame();
  const glitch = frame >= 14 && frame < 24;
  const isBlue = frame >= 24 || (glitch && frame % 2 === 1);
  const color = isBlue ? C.blue : C.red;
  return (
    <AbsoluteFill>
      <Shake at={[14, 24]} amp={20}>
        <Backdrop tone={frame >= 24 ? 'blue' : 'red'} dots={6} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', marginTop: 160 }}>
            {glitch && <div style={{ position: 'absolute', left: (hash(frame) - 0.5) * 60, top: 0, opacity: 0.6, mixBlendMode: 'screen' }}><Crewmate color={C.red} height={640} /></div>}
            <Crewmate color={color} height={640} glow={1.8} style={{ transform: glitch ? `translateX(${(hash(frame * 3) - 0.5) * 40}px)` : undefined }} />
          </div>
        </AbsoluteFill>
        <Vignette />
        <Caption top bottom={80}>
          <Slam delay={2} size={128} color={C.white} glow={C.red}>Disguise.</Slam>
        </Caption>
      </Shake>
      <Shockwave delay={14} color={C.blue} size={1700} y={620} dur={20} />
    </AbsoluteFill>
  );
};

const Ghost: React.FC<{ size?: number }> = ({ size = 240 }) => (
  <svg width={size} height={size} viewBox="0 0 80 80" style={{ filter: 'drop-shadow(0 0 26px #fff)' }}>
    <path d="M10 66 V34 a30 30 0 0 1 60 0 V66 l-10 -9 -10 9 -10 -9 -10 9 -10 -9 Z" fill="#fff" />
    <ellipse cx="30" cy="34" rx="5" ry="8" fill="#0b1020" />
    <ellipse cx="50" cy="34" rx="5" ry="8" fill="#0b1020" />
    <path d="M28 48 q12 12 24 0 q-12 3 -24 0" fill="#0b1020" />
  </svg>
);

const Fooled: React.FC = () => {
  const frame = useCurrentFrame();
  const walk = ease(frame / 24);
  const pos = along([[-420, 220], [-200, 160], [60, 60]], walk);
  const cam: Cam = { tilt: 54, rot: -14, zoom: 1.9, x: -120, y: 70 };
  const hit = frame >= 26;
  return (
    <AbsoluteFill>
      <Shake at={[26]} amp={16}>
        <MapStage cam={cam} tone="blue" items={[{ kind: 'pin', x: 60, y: 60, color: C.red, scale: 0.9, delay: 0, ghost: true }, { kind: 'orb', x: pos[0], y: pos[1], color: C.blue, size: 1, beam: 170 }]}>
          <City />
          <Trail pos={(f) => along([[-420, 220], [-200, 160], [60, 60]], ease(f / 24))} frame={Math.min(frame, 26)} color={C.blue} len={14} step={2} width={14} />
        </MapStage>
        <Vignette />
        {hit && (
          <AbsoluteFill style={{ background: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ transform: `scale(${interpolate(frame - 26, [0, 5, 10], [0, 1.2, 1], { extrapolateRight: 'clamp' })}) rotate(${Math.sin(frame / 2) * 6}deg)` }}><Ghost /></div>
            <Slam delay={28} size={120}>You got <span style={{ color: C.amber }}>fooled!</span></Slam>
          </AbsoluteFill>
        )}
      </Shake>
    </AbsoluteFill>
  );
};

const Trust: React.FC = () => {
  const frame = useCurrentFrame();
  const cam: Cam = { tilt: 58, rot: -20 + frame * 0.2, zoom: 1.0 + frame * 0.006, x: 0, y: 0 };
  return (
    <AbsoluteFill>
      <MapStage
        cam={cam}
        tone="red"
        items={Array.from({ length: 8 }, (_, i): Item => {
          const [x, y] = wander(i, frame + 200);
          return { kind: 'orb', x, y, color: i === 3 ? C.red : C.blue, size: i === 3 ? 1.2 : 0.9, beam: 190, pulse: i === 3 };
        })}
      >
        <City tone="red" />
      </MapStage>
      <Vignette />
      <AbsoluteFill style={{ background: 'rgba(0,0,0,0.35)' }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Slam delay={0} size={190} glow={C.red} from={1.5}>Trust <span style={{ color: C.red }}>no one.</span></Slam>
      </AbsoluteFill>
      <Flash at={0} dur={5} peak={0.5} color={C.red} />
    </AbsoluteFill>
  );
};

/** 39.0–39.5 s: the SYSTEMS JAMMED glitch (the soundtrack cuts out here). */
export const Jammed: React.FC = () => {
  const frame = useCurrentFrame();
  const slices = Array.from({ length: 9 }, (_, i) => i);
  const flick = frame % 3 === 0;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ opacity: flick ? 0.55 : 1 }}>
        <Img src={staticFile('footage/host-jammed.png')} style={{ width: 1920 * 0.62, position: 'absolute', left: 1920 * 0.19, top: -260, filter: 'saturate(1.4)', opacity: 0.7 }} />
      </AbsoluteFill>
      {slices.map((i) => (
        <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * 120, height: 120, overflow: 'hidden', transform: `translateX(${(hash(frame * 3 + i) - 0.5) * 140 * (hash(i + frame) > 0.45 ? 1 : 0)}px)` }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: -i * 120, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 230, letterSpacing: -4, color: C.white, textShadow: `8px 0 ${C.red}, -8px 0 #29d3ff, 0 0 60px ${C.red}`, textTransform: 'uppercase' }}>Systems</div>
            <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 230, letterSpacing: -4, color: C.red, textShadow: `-8px 0 #fff, 8px 0 #29d3ff`, textTransform: 'uppercase', marginTop: -30 }}>Jammed</div>
          </div>
        </div>
      ))}
      <AbsoluteFill style={{ background: `rgba(255,59,59,${frame % 4 < 2 ? 0.18 : 0})` }} />
    </AbsoluteFill>
  );
};
