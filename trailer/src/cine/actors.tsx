import React from 'react';
import { C, inter, mono } from './lib';

let gid = 0;
export interface CrewProps {
  accent: string; // backpack light + rim
  visor?: string; // visor tint
  visorGlow?: number;
  phase?: number; // walk-cycle phase (radians); undefined = idle
  facing?: 1 | -1;
  size?: number; // px height
  lit?: number; // 0..1 rim light strength
  breathe?: number; // frame for idle breathing
}

/** A side-view crewmate (dark night-ops suit). */
export const Crewmate: React.FC<CrewProps & { style?: React.CSSProperties }> = ({ accent, visor = C.blue, visorGlow = 1, phase, facing = 1, size = 220, lit = 0.6, breathe = 0, style }) => {
  const id = React.useMemo(() => `cm${gid++}`, []);
  const walking = phase !== undefined;
  const ph = phase ?? 0;
  const back = walking ? { dx: -Math.sin(ph) * 8, dy: -Math.max(0, Math.cos(ph)) * 6 } : { dx: 0, dy: 0 };
  const front = walking ? { dx: Math.sin(ph) * 8, dy: -Math.max(0, -Math.cos(ph)) * 6 } : { dx: 0, dy: 0 };
  const bob = walking ? -Math.abs(Math.sin(ph)) * 4 : Math.sin(breathe / 18) * 1.2;
  const lean = walking ? 3 : 0;
  return (
    <svg width={size * (140 / 170)} height={size} viewBox="0 0 140 170" style={{ overflow: 'visible', transform: `scaleX(${facing})`, ...style }}>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#0b0f1a" />
          <stop offset="0.55" stopColor="#1b2438" />
          <stop offset="1" stopColor="#2a3756" />
        </linearGradient>
        <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.25" stopColor={visor} stopOpacity="1" />
          <stop offset="1" stopColor={visor} stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id={`${id}s`}>
          <stop offset="0" stopColor="#000" stopOpacity="0.7" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}g`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={`${id}a`} x="-200%" y="-100%" width="500%" height="300%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <ellipse cx="72" cy="160" rx="52" ry="9" fill={`url(#${id}s)`} />
      <g transform={`translate(0 ${bob}) rotate(${lean} 75 150)`}>
        {/* back leg */}
        <rect x={36 + back.dx} y={110 + back.dy} width="30" height="44" rx="13" fill="#0a0e18" />
        {/* backpack */}
        <rect x="8" y="58" width="32" height="64" rx="13" fill="#121a2b" stroke="#000" strokeOpacity="0.35" />
        <rect x="15" y="72" width="7" height="34" rx="3.5" fill={accent} filter={`url(#${id}a)`} opacity={0.9} />
        <rect x="16" y="74" width="5" height="30" rx="2.5" fill={accent} />
        {/* front leg */}
        <rect x={76 + front.dx} y={110 + front.dy} width="30" height="44" rx="13" fill="#141c2e" />
        {/* body */}
        <path d="M30 66 C30 28 52 10 77 10 C103 10 121 28 121 63 L121 124 C121 134 113 140 103 140 L47 140 C37 140 30 134 30 124 Z" fill={`url(#${id}b)`} />
        <path d="M117 46 C122 68 122 102 119 130" fill="none" stroke={accent} strokeWidth="3.2" strokeLinecap="round" opacity={0.25 + 0.75 * lit} />
        <path d="M60 14 C44 20 34 36 32 60" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity={0.12} />
        {/* visor glow */}
        <path d="M84 34 L118 34 C128 34 135 42 135 54 L135 56 C135 68 128 76 118 76 L84 76 C74 76 67 68 67 56 L67 54 C67 42 74 34 84 34 Z" fill={visor} filter={`url(#${id}g)`} opacity={0.75 * visorGlow} />
        {/* visor */}
        <path d="M84 34 L118 34 C128 34 135 42 135 54 L135 56 C135 68 128 76 118 76 L84 76 C74 76 67 68 67 56 L67 54 C67 42 74 34 84 34 Z" fill={`url(#${id}v)`} stroke="#05070d" strokeWidth="3" />
        <rect x="102" y="40" width="22" height="7" rx="3.5" fill="#fff" opacity="0.85" />
        <circle cx="96" cy="43.5" r="3" fill="#fff" opacity="0.6" />
      </g>
    </svg>
  );
};

/* ───────── phone ───────── */
export const Phone: React.FC<{ width?: number; glow?: string; children: React.ReactNode; tilt?: [number, number, number]; style?: React.CSSProperties }> = ({ width = 420, glow = C.blue, children, tilt = [0, 0, 0], style }) => {
  const s = width / 390;
  const h = 844 * s;
  return (
    <div style={{ perspective: 2000, ...style }}>
      <div style={{ width, height: h, position: 'relative', transform: `rotateX(${tilt[0]}deg) rotateY(${tilt[1]}deg) rotateZ(${tilt[2]}deg)` }}>
        <div
          style={{
            position: 'absolute',
            inset: -12 * s,
            borderRadius: 62 * s,
            background: 'linear-gradient(140deg, #3a4152 0%, #11141c 30%, #0a0c12 70%, #2c3240 100%)',
            boxShadow: `0 0 0 ${1.5 * s}px rgba(255,255,255,0.18), 0 0 120px ${glow}55, 0 50px 120px rgba(0,0,0,0.8)`,
          }}
        />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 52 * s, overflow: 'hidden', background: '#05070d' }}>
          <div style={{ width: 390, height: 844, transform: `scale(${s})`, transformOrigin: '0 0', position: 'relative', fontFamily: inter, color: C.white }}>{children}</div>
          <div style={{ position: 'absolute', left: '50%', top: 12 * s, width: 120 * s, height: 34 * s, marginLeft: -60 * s, borderRadius: 20 * s, background: '#000' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.10) 0%, transparent 28%, transparent 72%, rgba(255,255,255,0.05) 100%)', pointerEvents: 'none' }} />
        </div>
      </div>
    </div>
  );
};

/* ───────── app UI atoms (match the real AfterDark UI) ───────── */
export const UI = {
  card: { background: '#0E1424', border: '1px solid rgba(120,150,220,0.18)', borderRadius: 16 } as React.CSSProperties,
  cardRed: { background: '#1F0B0B', border: '1px solid rgba(255,90,90,0.25)', borderRadius: 16 } as React.CSSProperties,
  mono: { fontFamily: mono } as React.CSSProperties,
};

export const Hud: React.FC<{ time: string; filled: number; total?: number; line?: number; score: number; red?: boolean; flash?: number }> = ({ time, filled, total = 6, line = 5, score, red, flash = -1 }) => (
  <div style={{ ...UI.card, ...(red ? UI.cardRed : {}), position: 'absolute', left: 12, right: 12, top: 52, height: 78, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16 }}>
    <div style={{ ...UI.mono, fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>{time}</div>
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        {Array.from({ length: total }, (_, i) => (
          <React.Fragment key={i}>
            <div style={{ width: 17, height: 17, borderRadius: 4, border: `1.5px solid ${i < filled ? C.red : 'rgba(255,255,255,0.35)'}`, background: i < filled ? C.red : 'transparent', boxShadow: i === flash ? `0 0 14px ${C.red}` : undefined }} />
            {i === line - 1 && <div style={{ width: 3, height: 26, background: '#fff', borderRadius: 2 }} />}
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div style={{ width: `${(score / 130) * 100}%`, height: '100%', background: red ? C.red : C.blue }} />
      </div>
      <div style={{ ...UI.mono, fontSize: 12, color: C.muted, marginTop: 4 }}>{score} / 130</div>
    </div>
    <div style={{ width: 46, height: 46, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 20 }}>···</div>
  </div>
);
