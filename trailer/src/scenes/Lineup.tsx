import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, mono } from '../theme';
import { Backdrop, Flash, Scanlines, Shake, Shockwave, Slam, Vignette, clamp01, ease, hash } from '../kit';
import { Crewmate } from '../world';

const TAGS = ['ONYX-43', 'RAVEN-07', 'NOVA-69', 'AMBER-66', 'RADAR-50', 'SIGMA-50', 'SPIDER-81', 'GHOST-76'];
const LIAR = 5;
const H = 300;
const GAP = 232;
const X0 = 960 - (GAP * 7) / 2;

/** 18–26 s — eight players walk in; the beam finds the liar. */
export const Lineup: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = 120; // 22.0 s
  const push = ease((frame - reveal) / 14);
  const beamX = interpolate(frame, [58, 118], [X0 - 160, X0 + GAP * LIAR], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const beamOn = frame >= 58 && frame < reveal + 30;
  const zoom = 1 + frame / 240 * 0.1 + push * 0.22;
  const liarX = X0 + GAP * LIAR;
  return (
    <AbsoluteFill>
      <Shake at={[reveal, reveal + 8]} amp={20}>
        <Backdrop tone="neutral" dots={0} grid={0.5} />
        <AbsoluteFill style={{ transform: `scale(${zoom}) translate(${(960 - liarX) * push * 0.6}px, ${push * -30}px)`, transformOrigin: '50% 70%' }}>
          {/* floor */}
          <div style={{ position: 'absolute', left: 120, right: 120, top: 760, height: 260, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(46,139,255,0.35), transparent 70%)' }} />
          <div style={{ position: 'absolute', left: 200, right: 200, top: 820, height: 2, background: 'linear-gradient(90deg, transparent, rgba(110,160,255,0.7), transparent)' }} />
          {TAGS.map((tag, i) => {
            const enterF = i * 6;
            const u = ease((frame - enterF) / 30);
            const finalX = X0 + GAP * i;
            const x = interpolate(u, [0, 1], [-340, finalX]);
            const walking = frame >= enterF && frame < enterF + 32;
            const isLiar = i === LIAR;
            const flipped = frame >= reveal;
            const lean = flipped && !isLiar ? (i < LIAR ? -1 : 1) * 38 * push : 0;
            const glitch = isLiar && frame >= reveal && frame < reveal + 12;
            const color = isLiar && flipped && !(glitch && frame % 2 === 0) ? C.red : C.blue;
            const dim = flipped && !isLiar ? 1 - push * 0.55 : 1;
            const near = Math.abs(beamX - finalX) < 90 && beamOn && frame < reveal ? 1 : 0;
            return (
              <div key={i} style={{ position: 'absolute', left: x - (H * 100) / 120 / 2 + lean, top: 820 - H - 4, opacity: clamp01((frame - enterF) / 6) * dim, transform: `translate(${glitch ? (hash(frame + i) - 0.5) * 24 : 0}px, 0) scale(${isLiar && flipped ? 1 + push * 0.12 : 1})`, transformOrigin: '50% 100%' }}>
                <Crewmate color={color} height={H} run={walking} phase={i * 1.7} glow={near ? 2.2 : isLiar && flipped ? 2.4 : 0.8} flip={walking ? false : i % 2 === 0 ? false : false} />
                <div style={{ position: 'absolute', top: -48, left: 0, right: 0, textAlign: 'center', fontFamily: mono, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: isLiar && flipped ? C.red : '#8fb4ff', opacity: frame > enterF + 30 ? 0.85 : 0 }}>{tag}</div>
              </div>
            );
          })}
          {/* scanning beam */}
          {beamOn && (
            <div style={{ position: 'absolute', left: beamX - 60, top: 200, width: 130, height: 640, background: `linear-gradient(90deg, transparent, ${frame >= reveal ? 'rgba(255,59,59,0.45)' : 'rgba(120,180,255,0.45)'}, transparent)`, filter: 'blur(4px)', opacity: frame >= reveal ? 1 - (frame - reveal) / 30 : 1 }} />
          )}
        </AbsoluteFill>
        <AbsoluteFill style={{ background: C.red, opacity: frame >= reveal ? Math.max(0, 0.22 - (frame - reveal) / 80) + push * 0.05 : 0 }} />
        <Vignette />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 110 }}>
          {frame >= reveal - 4 && (
            <Slam delay={reveal - 4} size={118} glow={C.red}>
              One of you is <span style={{ color: C.red }}>lying.</span>
            </Slam>
          )}
        </AbsoluteFill>
      </Shake>
      <Shockwave delay={reveal} color={C.red} size={1800} x={liarX} y={650} dur={26} />
      <Flash at={reveal} dur={5} peak={0.6} color={C.red} />
      <Scanlines o={0.05} />
    </AbsoluteFill>
  );
};
