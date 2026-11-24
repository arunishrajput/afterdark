import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FPS, grotesk, mono } from './theme';

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const ease = (x: number) => 1 - (1 - clamp01(x)) ** 3;

/** Deterministic pseudo-random in [0,1) from an integer. */
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const useSpring = (delay = 0, damping = 14, stiffness = 140, mass = 0.8) => {
  const frame = useCurrentFrame();
  return spring({ frame: frame - delay, fps: FPS, config: { damping, stiffness, mass } });
};

/* ───────────────────────── Backdrop ───────────────────────── */
type Tone = 'blue' | 'red' | 'mix' | 'neutral';
const GLOWS: Record<Tone, [string, string]> = {
  blue: ['rgba(46,139,255,0.30)', 'rgba(46,139,255,0.10)'],
  red: ['rgba(255,59,59,0.32)', 'rgba(255,59,59,0.10)'],
  mix: ['rgba(46,139,255,0.30)', 'rgba(255,59,59,0.30)'],
  neutral: ['rgba(120,140,200,0.14)', 'rgba(120,140,200,0.06)'],
};

export const Backdrop: React.FC<{ tone?: Tone; dots?: number; redDot?: boolean; grid?: number; speed?: number }> = ({
  tone = 'neutral',
  dots = 12,
  redDot = false,
  grid = 1,
  speed = 1,
}) => {
  const frame = useCurrentFrame() * speed;
  const [g1, g2] = GLOWS[tone];
  const gridColor = tone === 'red' ? 'rgba(255,90,90,0.10)' : 'rgba(110,150,255,0.10)';
  const pts = Array.from({ length: dots }, (_, i) => {
    const bx = 120 + hash(i + 1) * 1680;
    const by = 90 + hash(i + 40) * 900;
    const x = bx + Math.sin(frame / (38 + hash(i) * 30) + i) * (50 + hash(i + 9) * 90);
    const y = by + Math.cos(frame / (44 + hash(i + 3) * 30) + i * 2) * (40 + hash(i + 5) * 70);
    return { x, y, i };
  });
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background:
            tone === 'mix'
              ? `radial-gradient(900px 700px at 12% 55%, ${g1}, transparent 70%), radial-gradient(900px 700px at 88% 45%, ${g2}, transparent 70%)`
              : `radial-gradient(1200px 800px at 50% 45%, ${g1}, transparent 70%), radial-gradient(900px 500px at 50% 110%, ${g2}, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: grid,
          backgroundImage: `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`,
          backgroundSize: '96px 96px',
          backgroundPosition: `${frame * 0.35}px ${frame * 0.2}px`,
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 15%, transparent 78%)',
          maskImage: 'radial-gradient(ellipse at 50% 50%, black 15%, transparent 78%)',
        }}
      />
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        {pts.map((p) => {
          const isRed = redDot && p.i === 3;
          const col = isRed ? C.red : tone === 'red' ? '#9a3b3b' : C.blue;
          return (
            <g key={p.i} opacity={isRed ? 1 : 0.8}>
              <circle cx={p.x} cy={p.y} r={26} fill={col} opacity={0.10} />
              <circle cx={p.x} cy={p.y} r={7} fill={col} />
              {isRed && (
                <circle cx={p.x} cy={p.y} r={20 + ((frame * 1.6) % 60)} fill="none" stroke={C.red} strokeWidth={2} opacity={1 - ((frame * 1.6) % 60) / 60} />
              )}
            </g>
          );
        })}
      </svg>
      <Vignette />
    </AbsoluteFill>
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.65) 100%)',
      pointerEvents: 'none',
    }}
  />
);

export const Scanlines: React.FC<{ o?: number }> = ({ o = 0.07 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,${o}) 0px, rgba(255,255,255,${o}) 1px, transparent 1px, transparent 4px)`,
      mixBlendMode: 'overlay',
    }}
  />
);

/* ───────────────────────── Text ───────────────────────── */
export const Slam: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: number;
  color?: string;
  glow?: string;
  style?: React.CSSProperties;
  out?: number; // local frame at which to start fading out (optional)
  from?: number; // initial scale
  weight?: number;
  font?: string;
  tracking?: number;
}> = ({ children, delay = 0, size = 140, color = C.white, glow, style, out, from = 1.6, weight = 700, font = grotesk, tracking = -2 }) => {
  const frame = useCurrentFrame();
  const l = frame - delay;
  if (l < 0) return null;
  const sp = spring({ frame: l, fps: FPS, config: { damping: 12, stiffness: 190, mass: 0.7 } });
  const scale = interpolate(sp, [0, 1], [from, 1]);
  const blur = interpolate(l, [0, 6], [14, 0], { extrapolateRight: 'clamp' });
  const split = Math.max(0, 12 - l) * 1.1;
  const jitter = l < 8 ? (hash(l * 7 + delay) - 0.5) * 14 : 0;
  let opacity = clamp01(l / 3);
  let outShift = 0;
  if (out !== undefined && frame >= out) {
    const p = (frame - out) / 5;
    opacity *= 1 - clamp01(p);
    outShift = (hash(frame) - 0.5) * 60 * clamp01(p);
  }
  return (
    <div
      style={{
        fontFamily: font,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 0.98,
        letterSpacing: tracking,
        color,
        textTransform: 'uppercase',
        transform: `translate(${jitter + outShift}px, 0) scale(${scale})`,
        filter: `blur(${blur}px)`,
        opacity,
        textShadow: `${split}px 0 rgba(255,40,60,0.85), ${-split}px 0 rgba(40,200,255,0.85)${glow ? `, 0 0 40px ${glow}, 0 0 90px ${glow}` : ''}`,
        textAlign: 'center',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const MonoLabel: React.FC<{ children: React.ReactNode; delay?: number; color?: string; size?: number; style?: React.CSSProperties }> = ({
  children,
  delay = 0,
  color = C.muted,
  size = 26,
  style,
}) => {
  const frame = useCurrentFrame();
  const l = frame - delay;
  if (l < 0) return null;
  const p = ease(l / 10);
  return (
    <div
      style={{
        fontFamily: mono,
        fontWeight: 500,
        fontSize: size,
        letterSpacing: 6,
        textTransform: 'uppercase',
        color,
        opacity: p,
        transform: `translateY(${(1 - p) * 14}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Pill: React.FC<{ children: React.ReactNode; delay?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  delay = 0,
  color = C.blue,
  style,
}) => {
  const sp = useSpring(delay, 13, 170);
  const frame = useCurrentFrame();
  if (frame < delay) return null;
  return (
    <div
      style={{
        fontFamily: mono,
        fontWeight: 700,
        fontSize: 26,
        letterSpacing: 4,
        padding: '12px 26px',
        borderRadius: 999,
        border: `2px solid ${color}`,
        color,
        background: 'rgba(0,0,0,0.45)',
        boxShadow: `0 0 24px ${color}55, inset 0 0 18px ${color}22`,
        transform: `scale(${interpolate(sp, [0, 1], [0.6, 1])})`,
        opacity: clamp01(sp * 1.4),
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/* ───────────────────────── Phone ───────────────────────── */
export const PHONE_RATIO = 844 / 390;

export const Phone: React.FC<{
  src?: string;
  video?: React.ReactNode;
  width?: number;
  glow?: string;
  rotateY?: number;
  rotateX?: number;
  rotateZ?: number;
  bob?: number;
  scrollY?: number; // 0..1 for tall images
  tall?: boolean;
  style?: React.CSSProperties;
}> = ({ src, video, width = 400, glow = C.blue, rotateY = 0, rotateX = 0, rotateZ = 0, bob = 8, scrollY = 0, tall = false, style }) => {
  const frame = useCurrentFrame();
  const h = width * PHONE_RATIO;
  const radius = width * 0.14;
  const bezel = Math.max(7, width * 0.022);
  return (
    <div style={{ perspective: 1800, ...style }}>
      <div
        style={{
          width,
          height: h,
          transform: `translateY(${Math.sin(frame / 22) * bob}px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg)`,
          transformStyle: 'preserve-3d',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: -bezel,
            borderRadius: radius + bezel,
            background: 'linear-gradient(145deg,#2a2f3d,#0b0d14 55%,#1b1f2b)',
            boxShadow: `0 0 0 2px rgba(255,255,255,0.10), 0 0 80px ${glow}66, 0 40px 120px rgba(0,0,0,0.7)`,
          }}
        />
        <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', background: '#05070d' }}>
          {video ??
            (tall ? (
              <Img
                src={staticFile(src ?? '')}
                style={{ width: '100%', display: 'block', transform: `translateY(${-scrollY * 100}%)` , willChange: 'transform' }}
              />
            ) : (
              <Img src={staticFile(src ?? '')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
            ))}
          {/* glass sheen */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(115deg, rgba(255,255,255,0.10) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.04) 100%)',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
};

/* ───────────────────────── FX ───────────────────────── */
export const Shockwave: React.FC<{ delay?: number; color?: string; size?: number; x?: number; y?: number; dur?: number }> = ({
  delay = 0,
  color = C.white,
  size = 1800,
  x = 960,
  y = 540,
  dur = 26,
}) => {
  const frame = useCurrentFrame();
  const l = frame - delay;
  if (l < 0 || l > dur) return null;
  const p = ease(l / dur);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - (size * p) / 2,
        top: y - (size * p) / 2,
        width: size * p,
        height: size * p,
        borderRadius: '50%',
        border: `${Math.max(2, 14 * (1 - p))}px solid ${color}`,
        opacity: 1 - p,
        boxShadow: `0 0 60px ${color}, inset 0 0 60px ${color}`,
        pointerEvents: 'none',
      }}
    />
  );
};

export const Flash: React.FC<{ at: number; color?: string; dur?: number; peak?: number }> = ({ at, color = '#fff', dur = 8, peak = 1 }) => {
  const frame = useCurrentFrame();
  const l = frame - at;
  if (l < 0 || l > dur) return null;
  return <AbsoluteFill style={{ background: color, opacity: peak * (1 - l / dur), pointerEvents: 'none' }} />;
};

/** Decaying screen shake at the given local frames. */
export const Shake: React.FC<{ at: number[]; amp?: number; children: React.ReactNode }> = ({ at, amp = 22, children }) => {
  const frame = useCurrentFrame();
  let dx = 0;
  let dy = 0;
  for (const a of at) {
    const l = frame - a;
    if (l >= 0 && l < 14) {
      const d = (1 - l / 14) ** 2;
      dx += (hash(frame * 3 + a) - 0.5) * 2 * amp * d;
      dy += (hash(frame * 5 + a + 9) - 0.5) * 2 * amp * d;
    }
  }
  return <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px)` }}>{children}</AbsoluteFill>;
};

export const Sparks: React.FC<{ delay?: number; count?: number; color?: string; x?: number; y?: number; power?: number }> = ({
  delay = 0,
  count = 40,
  color = C.white,
  x = 960,
  y = 540,
  power = 1,
}) => {
  const frame = useCurrentFrame();
  const l = frame - delay;
  if (l < 0 || l > 40) return null;
  return (
    <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {Array.from({ length: count }, (_, i) => {
        const ang = hash(i + 1) * Math.PI * 2;
        const spd = (180 + hash(i + 77) * 900) * power;
        const t = l / FPS;
        const px = x + Math.cos(ang) * spd * t * (1 - t * 0.6);
        const py = y + Math.sin(ang) * spd * t * (1 - t * 0.6) + 300 * t * t;
        const a = 1 - l / 40;
        return <circle key={i} cx={px} cy={py} r={2 + hash(i + 3) * 4} fill={i % 2 ? color : C.blueSoft} opacity={a} />;
      })}
    </svg>
  );
};

export const StripeBar: React.FC<{ color?: string; y?: number; height?: number; speed?: number }> = ({ color = C.red, y = 0, height = 60, speed = 10 }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: y,
        height,
        backgroundImage: `repeating-linear-gradient(-45deg, ${color} 0 40px, #000 40px 80px)`,
        backgroundPosition: `${frame * speed}px 0`,
        opacity: 0.9,
      }}
    />
  );
};

export const Counter: React.FC<{ to: number; delay: number; dur?: number; suffix?: string; format?: boolean }> = ({ to, delay, dur = 30, suffix = '', format }) => {
  const frame = useCurrentFrame();
  const p = ease((frame - delay) / dur);
  const v = Math.round(to * p);
  return <>{(format ? v.toLocaleString('en-US') : v) + suffix}</>;
};

export const useFit = () => useVideoConfig();
