import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, sec } from '../theme';
import { Backdrop, Scanlines, Shake, Shockwave, Slam, Sparks, clamp01, useSpring } from '../kit';

/** 6–10 s — the title drop. */
export const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const sp = useSpring(0, 11, 150, 1);
  const scale = interpolate(sp, [0, 1], [2.2, 1]);
  const exit = clamp01((frame - sec(3.55)) / sec(0.45));
  const flash = clamp01(1 - frame / 14);
  return (
    <AbsoluteFill>
      <Shake at={[0, sec(1.0)]} amp={30}>
        <Backdrop tone="mix" dots={16} speed={1.6} />
        <AbsoluteFill style={{ transform: `scale(${1 + exit * 0.6})`, opacity: 1 - exit }}>
          <AbsoluteFill style={{ alignItems: 'center' }}>
            <Img
              src={staticFile('brand/afterdark-logo.png')}
              style={{
                width: 1130,
                marginTop: -10,
                mixBlendMode: 'lighten',
                transform: `scale(${scale}) rotate(${interpolate(sp, [0, 1], [-4, 0])}deg)`,
                filter: `blur(${interpolate(sp, [0, 0.6], [16, 0], { extrapolateRight: 'clamp' })}px) drop-shadow(0 0 60px rgba(255,59,59,0.35))`,
                opacity: clamp01(frame / 3),
              }}
            />
          </AbsoluteFill>
          <Shockwave delay={0} color={C.blue} size={2400} y={420} dur={30} />
          <Shockwave delay={4} color={C.red} size={2000} y={420} dur={30} />
          <Sparks delay={0} count={60} color={C.red} y={420} power={1.2} />
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 150, gap: 22 }}>
            <Slam delay={sec(1.0)} size={80} tracking={3} from={1.3}>
              Among Us. <span style={{ color: C.red }}>Played on your feet.</span>
            </Slam>
          </AbsoluteFill>
        </AbsoluteFill>
      </Shake>
      <AbsoluteFill style={{ background: '#fff', opacity: flash * 0.9 }} />
      <Scanlines o={0.05} />
    </AbsoluteFill>
  );
};
