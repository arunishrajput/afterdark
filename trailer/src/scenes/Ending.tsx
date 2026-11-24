import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { Backdrop, Flash, Phone, Scanlines, Shake, Shockwave, Slam, Sparks, Vignette, clamp01, ease, useSpring } from '../kit';
import { Crewmate } from '../world';
import { Caption } from './Map';

/** 50–56 s — the ejection, then a glimpse of the real app. */
export const Ending: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={0} durationInFrames={75}><Eject /></Sequence>
    <Sequence from={75} durationInFrames={105}><Reel /></Sequence>
    <Scanlines o={0.05} />
  </AbsoluteFill>
);

const Eject: React.FC = () => {
  const frame = useCurrentFrame();
  const flip = frame >= 6;
  const glitch = frame >= 6 && frame < 14;
  const color = flip && !(glitch && frame % 2 === 0) ? C.red : C.blue;
  const go = ease((frame - 34) / 36);
  const x = go * 900;
  const y = -go * 520;
  const rot = go * 1080;
  const sc = 1 - go * 0.9;
  return (
    <AbsoluteFill>
      <Shake at={[0, 6]} amp={26}>
        <Backdrop tone={flip ? 'red' : 'blue'} dots={0} grid={0.4} />
        {/* spotlight cone */}
        <div style={{ position: 'absolute', left: 560, top: 0, width: 800, height: 1080, background: `linear-gradient(180deg, ${flip ? 'rgba(255,59,59,0.35)' : 'rgba(120,180,255,0.35)'}, transparent 85%)`, clipPath: 'polygon(38% 0, 62% 0, 100% 100%, 0 100%)', opacity: 1 - go }} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ marginTop: 190, transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${sc})` }}>
            <Crewmate color={color} height={560} glow={2} />
          </div>
        </AbsoluteFill>
        <Vignette />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: 120 }}>
          <Slam delay={8} size={190} color={C.red} glow={C.red} from={1.7}>Imposter.</Slam>
        </AbsoluteFill>
      </Shake>
      <Shockwave delay={0} color={C.white} size={2400} dur={26} />
      <Shockwave delay={6} color={C.red} size={2000} dur={26} y={640} />
      {go > 0 && <Sparks delay={34} count={30} color={C.red} x={960 + x * 0.3} y={640 + y * 0.3} power={0.7} />}
    </AbsoluteFill>
  );
};

const Reel: React.FC = () => {

  const items: { src: string; x: number; w: number; rot: number; glow: string; d: number; top: number }[] = [
    { src: 'footage/guest-infect-channel.png', x: 420, w: 470, rot: 16, glow: C.red, d: 10, top: 150 },
    { src: 'footage/host-game.png', x: 960, w: 540, rot: 0, glow: C.blue, d: 0, top: 120 },
    { src: 'footage/host-results.png', x: 1500, w: 470, rot: -16, glow: C.red, d: 20, top: 150 },
  ];
  return (
    <AbsoluteFill>
      <Backdrop tone="mix" dots={10} speed={1.4} />
      {items.map((it, i) => {
        const sp = useSpring(it.d, 14, 120, 0.9);
        return (
          <div key={i} style={{ position: 'absolute', left: it.x - it.w / 2, top: it.top + (1 - sp) * 900, opacity: clamp01(sp * 2) }}>
            <Phone src={it.src} width={it.w} glow={it.glow} rotateY={it.rot} rotateX={4} bob={7} />
          </div>
        );
      })}
      <Vignette />
      <Caption top bottom={50}>
        <Slam delay={6} size={92} tracking={0}>Your city. <span style={{ color: C.red }}>Your arena.</span></Slam>
      </Caption>
      <Flash at={0} dur={6} peak={0.6} />
    </AbsoluteFill>
  );
};
