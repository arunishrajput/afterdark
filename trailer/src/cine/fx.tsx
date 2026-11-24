import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { C, clamp, grotesk, H, hash, inCubic, kf, mono, outCubic, outExpo, prog, W } from './lib';

/* ───────── always-on film layer ───────── */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.11 }) => {
  const frame = useCurrentFrame();
  const i = frame % 8;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay', opacity }}>
      <Img src={staticFile(`fx/grain${i}.jpg`)} style={{ width: W, height: H, imageRendering: 'auto' }} />
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.75 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse 75% 75% at 50% 50%, transparent 55%, rgba(0,0,0,${strength}) 100%)` }} />
);

/** Soft coloured light drifting over the frame. */
export const LightLeak: React.FC<{ color?: string; color2?: string; strength?: number; speed?: number }> = ({ color = C.blue, color2 = C.red, strength = 0.35, speed = 1 }) => {
  const frame = useCurrentFrame() * speed;
  const x1 = 20 + Math.sin(frame / 70) * 18;
  const y1 = 30 + Math.cos(frame / 90) * 15;
  const x2 = 80 + Math.cos(frame / 80) * 15;
  const y2 = 70 + Math.sin(frame / 60) * 12;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        opacity: strength,
        background: `radial-gradient(700px 520px at ${x1}% ${y1}%, ${color}55, transparent 70%), radial-gradient(650px 480px at ${x2}% ${y2}%, ${color2}44, transparent 70%)`,
      }}
    />
  );
};

/** Anamorphic horizontal streak at (x, y). */
export const Flare: React.FC<{ at: number; x?: number; y?: number; color?: string; dur?: number; width?: number }> = ({ at, x = W / 2, y = H / 2, color = C.blueHi, dur = 22, width = 1700 }) => {
  const frame = useCurrentFrame();
  const l = frame - at;
  if (l < 0 || l > dur) return null;
  const p = l / dur;
  const a = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
  const w = width * (0.6 + 0.4 * outExpo(p));
  return (
    <div style={{ position: 'absolute', left: x - w / 2, top: y - 40, width: w, height: 80, pointerEvents: 'none', mixBlendMode: 'screen', opacity: a }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 38, height: 4, background: `linear-gradient(90deg, transparent, ${color} 35%, #fff 50%, ${color} 65%, transparent)`, filter: 'blur(1px)' }} />
      <div style={{ position: 'absolute', left: '10%', right: '10%', top: 30, height: 20, background: `linear-gradient(90deg, transparent, ${color}88 40%, ${color}cc 50%, ${color}88 60%, transparent)`, filter: 'blur(8px)' }} />
      <div style={{ position: 'absolute', left: '50%', top: 40, width: 160, height: 160, marginLeft: -80, marginTop: -80, borderRadius: '50%', background: `radial-gradient(circle, #ffffffcc, ${color}55 30%, transparent 70%)` }} />
    </div>
  );
};

export const Flash: React.FC<{ at: number; dur?: number; color?: string; peak?: number }> = ({ at, dur = 8, color = '#fff', peak = 1 }) => {
  const frame = useCurrentFrame();
  const l = frame - at;
  if (l < 0 || l > dur) return null;
  return <AbsoluteFill style={{ pointerEvents: 'none', background: color, opacity: peak * (1 - l / dur) ** 1.6 }} />;
};

export const Fade: React.FC<{ inDur?: number; outAt?: number; outDur?: number; color?: string }> = ({ inDur = 0, outAt, outDur = 8, color = '#000' }) => {
  const frame = useCurrentFrame();
  let o = 0;
  if (inDur > 0) o = Math.max(o, 1 - clamp(frame / inDur));
  if (outAt !== undefined) o = Math.max(o, clamp((frame - outAt) / outDur));
  if (o <= 0) return null;
  return <AbsoluteFill style={{ pointerEvents: 'none', background: color, opacity: o }} />;
};

export const Shake: React.FC<{ at: number[]; amp?: number; dur?: number; children: React.ReactNode }> = ({ at, amp = 18, dur = 12, children }) => {
  const frame = useCurrentFrame();
  let dx = 0;
  let dy = 0;
  let rz = 0;
  for (const a of at) {
    const l = frame - a;
    if (l >= 0 && l < dur) {
      const d = (1 - l / dur) ** 2;
      dx += (hash(frame * 3.1 + a) - 0.5) * 2 * amp * d;
      dy += (hash(frame * 5.7 + a + 9) - 0.5) * 2 * amp * d;
      rz += (hash(frame * 1.3 + a + 4) - 0.5) * 0.8 * d;
    }
  }
  return <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rz}deg) scale(${1 + (dx || dy ? 0.02 : 0)})` }}>{children}</AbsoluteFill>;
};

/** Floating dust motes (screen space). */
export const Dust: React.FC<{ count?: number; color?: string; opacity?: number }> = ({ count = 40, color = '#cfe2ff', opacity = 0.5 }) => {
  const frame = useCurrentFrame();
  return (
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity }}>
      {Array.from({ length: count }, (_, i) => {
        const sp = 0.15 + hash(i + 3) * 0.5;
        const x = (hash(i) * W + frame * sp * (hash(i + 7) > 0.5 ? 1 : -1) * 0.8 + W) % W;
        const y = (hash(i + 11) * H - frame * sp * 0.6 + H * 4) % H;
        const r = 0.8 + hash(i + 19) * 2.4;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(frame / (20 + hash(i) * 30) + i));
        return <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={tw} />;
      })}
    </svg>
  );
};

/* ───────── transitions ───────── */
let filterSeq = 0;
/**
 * Wraps a shot: whip pans (directional motion blur), zoom punches and glitch cuts on its first
 * and last frames.
 */
export const Shot: React.FC<{
  dur: number; // frames
  inT?: 'cut' | 'whipL' | 'whipR' | 'zoom' | 'fade' | 'glitch' | 'rise';
  outT?: 'cut' | 'whipL' | 'whipR' | 'zoom' | 'fade' | 'glitch';
  len?: number;
  children: React.ReactNode;
}> = ({ dur, inT = 'cut', outT = 'cut', len = 7, children }) => {
  const frame = useCurrentFrame();
  const id = React.useMemo(() => `whip${filterSeq++}`, []);
  let tx = 0;
  let sc = 1;
  let blur = 0;
  let op = 1;
  let glitch = 0;
  const pin = clamp(frame / len);
  const pout = clamp((frame - (dur - len)) / len);
  if (inT === 'whipL' || inT === 'whipR') {
    const e = 1 - outExpo(pin);
    tx += (inT === 'whipL' ? 1 : -1) * 900 * e;
    blur += 90 * e;
  } else if (inT === 'zoom') {
    sc *= 1 + 0.35 * (1 - outExpo(pin));
    op *= clamp(pin * 3);
  } else if (inT === 'fade') {
    op *= pin;
  } else if (inT === 'glitch') {
    glitch = Math.max(glitch, 1 - pin);
  } else if (inT === 'rise') {
    sc *= 1.08 - 0.08 * outCubic(pin);
    op *= clamp(pin * 2);
  }
  if (outT === 'whipL' || outT === 'whipR') {
    const e = inCubic(pout);
    tx += (outT === 'whipL' ? -1 : 1) * 900 * e;
    blur += 90 * e;
  } else if (outT === 'zoom') {
    sc *= 1 + 0.6 * inCubic(pout);
    op *= 1 - clamp((pout - 0.5) * 2);
  } else if (outT === 'fade') {
    op *= 1 - pout;
  } else if (outT === 'glitch') {
    glitch = Math.max(glitch, pout);
  }
  const g = glitch > 0.02;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {blur > 0.5 && (
        <svg width={0} height={0} style={{ position: 'absolute' }}>
          <filter id={id} x="-20%" y="-5%" width="140%" height="110%">
            <feGaussianBlur stdDeviation={`${blur.toFixed(1)} 0`} />
          </filter>
        </svg>
      )}
      <AbsoluteFill
        style={{
          transform: `translateX(${tx}px) scale(${sc})`,
          opacity: op,
          filter: blur > 0.5 ? `url(#${id})` : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
      {g && <GlitchBars amount={glitch} seed={frame} />}
    </AbsoluteFill>
  );
};

export const GlitchBars: React.FC<{ amount: number; seed: number; color?: string }> = ({ amount, seed, color = C.red }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {Array.from({ length: 10 }, (_, i) => {
      if (hash(seed * 13 + i) > amount * 0.9) return null;
      const y = hash(seed * 7 + i * 3) * H;
      const h = 4 + hash(seed + i * 5) * 60 * amount;
      const x = (hash(seed * 3 + i) - 0.5) * 300 * amount;
      const c = i % 3 === 0 ? color : i % 3 === 1 ? '#29d3ff' : '#ffffff';
      return <div key={i} style={{ position: 'absolute', left: x, top: y, width: W, height: h, background: c, opacity: 0.18 + 0.4 * amount, mixBlendMode: 'screen' }} />;
    })}
  </AbsoluteFill>
);

/* ───────── typography ───────── */
/**
 * Trailer intertitle: wide-tracked display type that breathes in from blur, with a light sweep.
 * `lines` items may be strings or [text, colour].
 */
export const TitleCard: React.FC<{
  dur: number;
  lines: (string | [string, string])[][];
  size?: number;
  tone?: 'blue' | 'red' | 'neutral';
  kicker?: string;
}> = ({ dur, lines, size = 104, tone = 'neutral', kicker }) => {
  const frame = useCurrentFrame();
  const inP = prog(frame, 0, 16, outCubic);
  const outP = prog(frame, dur - 7, 7, inCubic);
  const track = kf(frame, [[0, 0.42], [dur, 0.2]], outCubic);
  const scale = kf(frame, [[0, 1.06], [dur, 1.0]], outCubic);
  const sweep = kf(frame, [[4, -30], [dur - 4, 130]], (t) => t);
  const glow = tone === 'red' ? C.red : tone === 'blue' ? C.blue : '#8fb6ff';
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(900px 420px at 50% 52%, ${glow}22, transparent 70%)` }} />
      <Dust count={28} opacity={0.35} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: inP * (1 - outP), transform: `scale(${scale})`, filter: `blur(${(1 - inP) * 10 + outP * 6}px)` }}>
        {kicker && (
          <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: '0.6em', color: tone === 'red' ? C.redHi : C.muted, marginBottom: 34, textTransform: 'uppercase', paddingLeft: '0.6em' }}>{kicker}</div>
        )}
        {lines.map((ln, i) => (
          <div
            key={i}
            style={{
              fontFamily: grotesk,
              fontWeight: 500,
              fontSize: size,
              letterSpacing: `${track}em`,
              paddingLeft: `${track}em`,
              textTransform: 'uppercase',
              lineHeight: 1.12,
              whiteSpace: 'nowrap',
              backgroundImage: `linear-gradient(100deg, rgba(255,255,255,0.78) ${sweep - 25}%, #ffffff ${sweep - 6}%, #ffffff ${sweep}%, rgba(255,255,255,0.78) ${sweep + 25}%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: `drop-shadow(0 0 28px ${glow}55)`,
            }}
          >
            {ln.map((w, j) =>
              typeof w === 'string' ? (
                <span key={j}>{w}</span>
              ) : (
                <span key={j} style={{ color: w[1], WebkitTextFillColor: w[1], filter: `drop-shadow(0 0 22px ${w[1]})` }}>
                  {w[0]}
                </span>
              ),
            )}
          </div>
        ))}
        <div style={{ marginTop: 40, height: 2, width: 260 * inP, background: `linear-gradient(90deg, transparent, ${glow}, transparent)` }} />
      </AbsoluteFill>
      <Flare at={2} y={H / 2} color={tone === 'red' ? C.redHi : C.blueHi} dur={26} />
    </AbsoluteFill>
  );
};

/** Small lower-third super, mono, for in-shot captions. */
export const Super: React.FC<{ at: number; text: string; sub?: string; color?: string; x?: number; y?: number; align?: 'left' | 'center'; out?: number }> = ({ at, text, sub, color = C.white, x = 120, y = 880, align = 'left', out }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, at, 12, outCubic);
  const o = out !== undefined ? 1 - prog(frame, out, 6) : 1;
  if (frame < at) return null;
  const chars = Math.floor(text.length * clamp((frame - at) / 10));
  return (
    <div style={{ position: 'absolute', left: align === 'center' ? 0 : x, right: align === 'center' ? 0 : undefined, top: y, textAlign: align, opacity: p * o, transform: `translateY(${(1 - p) * 16}px)` }}>
      <div style={{ display: 'inline-block', textAlign: 'left' }}>
        <div style={{ width: 60 * p, height: 3, background: color, marginBottom: 18, boxShadow: `0 0 16px ${color}` }} />
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 64, letterSpacing: '0.06em', color, textTransform: 'uppercase', textShadow: `0 0 30px ${color}66` }}>
          {text.slice(0, chars)}
          <span style={{ opacity: 0 }}>{text.slice(chars)}</span>
        </div>
        {sub && <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: '0.32em', color: C.muted, marginTop: 10, textTransform: 'uppercase' }}>{sub}</div>}
      </div>
    </div>
  );
};
