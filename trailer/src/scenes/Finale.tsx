import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, mono, sec } from '../theme';
import { Backdrop, Flash, MonoLabel, Scanlines, Shake, Shockwave, Slam, Sparks, clamp01, ease, useSpring } from '../kit';

/** 56–60 s — end card */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const sp = useSpring(0, 12, 150, 1);
  const fade = clamp01((frame - sec(3.5)) / sec(0.5));
  const glowPulse = 0.6 + Math.sin(frame / 7) * 0.2;
  return (
    <AbsoluteFill style={{ opacity: 1 - fade }}>
      <Shake at={[0]} amp={26}>
        <Backdrop tone="mix" dots={12} speed={0.8} />
        <AbsoluteFill style={{ alignItems: 'center' }}>
          <Img
            src={staticFile('brand/afterdark-logo.png')}
            style={{
              width: 920, marginTop: -30, mixBlendMode: 'lighten',
              transform: `scale(${interpolate(sp, [0, 1], [1.7, 1])})`,
              filter: `blur(${interpolate(sp, [0, 0.6], [12, 0], { extrapolateRight: 'clamp' })}px) drop-shadow(0 0 ${60 * glowPulse}px rgba(255,59,59,0.45))`,
            }}
          />
        </AbsoluteFill>
        <Shockwave delay={0} color={C.blue} size={2400} y={380} />
        <Shockwave delay={4} color={C.red} size={2000} y={380} />
        <Sparks delay={0} count={50} color={C.red} y={380} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 96, gap: 24 }}>
          <Slam delay={sec(0.7)} size={72} tracking={2} from={1.25}>Play free. In your browser.</Slam>
          <div style={{ opacity: clamp01((frame - sec(1.1)) / 8), transform: `translateY(${(1 - ease((frame - sec(1.1)) / 10)) * 24}px)`, fontFamily: mono, fontWeight: 700, fontSize: 52, color: C.white, padding: '16px 44px', borderRadius: 18, border: `3px solid ${C.white}`, boxShadow: `0 0 50px ${C.blue}77, inset 0 0 30px ${C.red}33`, letterSpacing: 2 }}>
            afterdark-24gx.onrender.com
          </div>
          <MonoLabel delay={sec(1.6)} color={C.muted} size={22} style={{ letterSpacing: 5 }}>Walk, never run  ·  Built with Claude Code</MonoLabel>
        </AbsoluteFill>
      </Shake>
      <Flash at={0} dur={8} />
      <Scanlines o={0.05} />
    </AbsoluteFill>
  );
};
