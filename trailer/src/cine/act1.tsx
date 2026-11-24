import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { Crewmate, Phone } from './actors';
import { CAST, huddle } from './cast';
import { CityMap, CX, CY, Dot, MAPDATA } from './CityMap';
import { Dust, Fade, Flare, Flash, LightLeak, Shake, Shot, Vignette } from './fx';
import { C, clamp, f, grotesk, H, hash, inCubic, inOutCubic, kf, mono, outBack, outCubic, outExpo, prog, W } from './lib';

/* ───────── 0–4 s: the city draws itself ───────── */
export const MapReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const cam = {
    x: kf(frame, [[0, CX + 40], [120, CX]]),
    y: kf(frame, [[0, CY + 260], [120, CY + 40]]),
    zoom: kf(frame, [[0, 0.36], [120, 0.66]], outCubic),
    tilt: kf(frame, [[0, 62], [120, 52]], inOutCubic),
    rot: kf(frame, [[0, -32], [120, -10]], inOutCubic),
    cy: 600,
  };
  const dots: Dot[] = CAST.map((p, i) => {
    const t = prog(frame, 84 + i * 3, 12, outBack);
    const [x, y] = huddle(i, 40);
    return { id: p.name, x, y, color: p.accent, size: 9 * t, opacity: clamp(t * 2), glow: 1.2 };
  });
  const hudA = 'CONNAUGHT PLACE · NEW DELHI';
  const hudB = '21:41 · 8 PLAYERS READY';
  const ta = Math.floor(hudA.length * prog(frame, 22, 26));
  const tb = Math.floor(hudB.length * prog(frame, 58, 22));
  return (
    <AbsoluteFill>
      <CityMap
        cam={cam}
        draw={prog(frame, 0, 86, outCubic)}
        baseOpacity={prog(frame, 18, 70, inOutCubic)}
        zone={prog(frame, 46, 36, inOutCubic)}
        regions={prog(frame, 72, 26) * 0.9}
        baseMarker={prog(frame, 80, 16)}
        dots={dots}
      />
      <LightLeak strength={0.28} />
      <Vignette />
      <div style={{ position: 'absolute', left: 96, bottom: 92, fontFamily: mono, color: C.white }}>
        <div style={{ fontSize: 20, letterSpacing: '0.42em', opacity: 0.9 }}>{hudA.slice(0, ta)}</div>
        <div style={{ fontSize: 20, letterSpacing: '0.42em', color: C.blueHi, marginTop: 12 }}>{hudB.slice(0, tb)}</div>
      </div>
      <Fade inDur={24} />
    </AbsoluteFill>
  );
};

/* ───────── 5.5–7.5 s: the lineup ───────── */
export const Lineup: React.FC<{ dur?: number }> = ({ dur = f(2) }) => {
  const frame = useCurrentFrame();
  const gap = 300;
  const size = 340;
  const cw = (size * 140) / 170;
  const startX = W / 2 - (gap * (CAST.length - 1)) / 2;
  const dolly = kf(frame, [[0, 260], [dur, -260]], (t) => t);
  const zoom = kf(frame, [[0, 1.0], [dur, 1.07]], (t) => t);
  const beamX = kf(frame, [[0, -260], [dur, W + 260]], inOutCubic);
  return (
    <AbsoluteFill style={{ background: '#020309' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(1200px 520px at 50% 92%, rgba(46,139,255,0.20), transparent 70%)' }} />
      <AbsoluteFill style={{ transform: `translateX(${dolly * 0.35}px)` }}>
        <Skyline />
      </AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${dolly}px) scale(${zoom})`, transformOrigin: '50% 70%' }}>
        {/* floor line */}
        <div style={{ position: 'absolute', left: -200, right: -200, top: 830, height: 2, background: 'linear-gradient(90deg, transparent, rgba(140,180,255,0.35), transparent)' }} />
        {CAST.map((p, i) => {
          const x = startX + i * gap;
          const d = Math.abs(beamX - (x + dolly));
          const lit = Math.exp(-(d * d) / (2 * 150 * 150));
          const red = p.imp ? clamp((lit - 0.55) / 0.25) : 0;
          const visor = red > 0 ? mix(C.blueHi, C.red, red) : C.blueHi;
          const nameO = prog(frame, 8 + i * 3, 10);
          return (
            <div key={p.name} style={{ position: 'absolute', left: x - cw / 2, top: 830 - size * 0.94 }}>
              <Crewmate accent={p.accent} visor={visor} visorGlow={0.6 + lit * 0.9 + red} lit={0.25 + lit} size={size} breathe={frame + i * 9} />
              {/* reflection */}
              <div style={{ position: 'absolute', left: 0, top: size * 0.92, transform: 'scaleY(-1)', opacity: 0.13, WebkitMaskImage: 'linear-gradient(to top, black, transparent 45%)', maskImage: 'linear-gradient(to top, black, transparent 45%)' }}>
                <Crewmate accent={p.accent} visor={visor} lit={0.25 + lit} size={size} breathe={frame + i * 9} />
              </div>
              <div style={{ position: 'absolute', left: 0, width: cw, top: size * 0.98, textAlign: 'center', fontFamily: mono, fontSize: 21, letterSpacing: '0.38em', color: C.white, opacity: nameO * (0.45 + lit * 0.55), paddingLeft: '0.38em' }}>{p.name}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      {/* the scanning beam */}
      <div style={{ position: 'absolute', left: beamX - 160, top: 0, width: 320, height: H, background: 'linear-gradient(90deg, transparent, rgba(160,200,255,0.10) 40%, rgba(210,230,255,0.22) 50%, rgba(160,200,255,0.10) 60%, transparent)', mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, #020309 0%, transparent 30%, transparent 75%, #020309 100%)' }} />
      <Dust count={30} opacity={0.4} />
      <Vignette strength={0.85} />
    </AbsoluteFill>
  );
};

/** A procedural night skyline with a few lit windows. */
const Skyline: React.FC = () => (
  <svg width={W + 800} height={H} style={{ position: 'absolute', left: -400, top: 0 }}>
    <defs>
      <linearGradient id="sky-b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0d1526" />
        <stop offset="1" stopColor="#060a14" />
      </linearGradient>
    </defs>
    {Array.from({ length: 34 }, (_, i) => {
      const w = 70 + hash(i + 1) * 120;
      const x = i * 80 + hash(i + 2) * 30;
      const h = 120 + hash(i + 3) * 330 + (i % 5 === 2 ? 120 : 0);
      const y = 830 - h;
      return (
        <g key={i} opacity={0.55 + hash(i + 4) * 0.35}>
          <rect x={x} y={y} width={w} height={h} fill="url(#sky-b)" stroke="#1a2440" strokeWidth={1} />
          {Array.from({ length: 14 }, (_, k) => {
            if (hash(i * 31 + k) > 0.34) return null;
            const wx = x + 10 + hash(i * 7 + k) * (w - 24);
            const wy = y + 14 + hash(i * 13 + k) * (h - 40);
            return <rect key={k} x={wx} y={wy} width={6} height={9} fill={hash(k + i) > 0.6 ? '#ffcf7a' : '#7fb4ff'} opacity={0.25 + hash(k * 3 + i) * 0.45} />;
          })}
        </g>
      );
    })}
  </svg>
);

export const mix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [r1, g1, b1] = ch(pa);
  const [r2, g2, b2] = ch(pb);
  const k = clamp(t);
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r1 + (r2 - r1) * k)}${h(g1 + (g2 - g1) * k)}${h(b1 + (b2 - b1) * k)}`;
};

/* ───────── 9–12 s: press and hold ───────── */
const ShieldIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 84 }) => (
  <svg width={size} height={size * 1.1} viewBox="0 0 24 26" style={{ filter: `drop-shadow(0 0 14px ${color})` }}>
    <path d="M12 1.5 L21.5 5.2 V12.4 C21.5 18.2 17.4 22.6 12 24.5 C6.6 22.6 2.5 18.2 2.5 12.4 V5.2 Z" fill="none" stroke={color} strokeWidth="1.8" />
    <path d="M7.6 13 L10.8 16.2 L16.6 9.6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const MaskIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 90 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ filter: `drop-shadow(0 0 16px ${color})` }}>
    <path d="M3 6.5 C7 4.5 17 4.5 21 6.5 V11 C21 16.5 16.8 20.5 12 21.5 C7.2 20.5 3 16.5 3 11 Z" fill="none" stroke={color} strokeWidth="1.8" />
    <path d="M6.5 10.5 C7.5 9.6 9.3 9.6 10.3 10.6 M13.7 10.6 C14.7 9.6 16.5 9.6 17.5 10.5 M8.5 15.5 C10.6 17.2 13.4 17.2 15.5 15.5" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const HoldScreen: React.FC<{ p: number }> = ({ p }) => {
  const R = 96;
  const circ = 2 * Math.PI * R;
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(500px 500px at 50% 45%, #10172a, #05070d 70%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: mono, fontSize: 13, letterSpacing: 4, color: C.muted, marginBottom: 40 }}>YOUR ROLE IS SECRET</div>
      <svg width="240" height="240" viewBox="0 0 240 240">
        <circle cx="120" cy="120" r={R} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" strokeWidth="8" />
        <circle cx="120" cy="120" r={R} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - p)} transform="rotate(-90 120 120)" style={{ filter: 'drop-shadow(0 0 10px #8ec5ff)' }} />
        <text x="120" y="114" textAnchor="middle" fill="#fff" fontFamily={mono} fontSize="15" letterSpacing="3">PRESS AND</text>
        <text x="120" y="136" textAnchor="middle" fill="#fff" fontFamily={mono} fontSize="15" letterSpacing="3">HOLD</text>
      </svg>
      <div style={{ fontSize: 15, color: C.muted, marginTop: 40, width: 260, textAlign: 'center', lineHeight: 1.5 }}>Make sure nobody can see your screen.</div>
    </div>
  );
};

const RoleScreen: React.FC<{ imp: boolean; t: number }> = ({ imp, t }) => {
  const col = imp ? C.red : C.blue;
  const o = (d: number) => clamp((t - d) / 6);
  return (
    <div style={{ position: 'absolute', inset: 0, background: imp ? 'radial-gradient(520px 600px at 50% 18%, #5a0d10, #160404 70%)' : 'radial-gradient(520px 600px at 50% 18%, #0b2a5a, #050a16 70%)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 140 }}>
      <div style={{ opacity: o(0) }}>{imp ? <MaskIcon color={col} /> : <ShieldIcon color={col} />}</div>
      <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: imp ? 58 : 66, color: imp ? '#ff5050' : '#5aa8ff', marginTop: 18, letterSpacing: 1, opacity: o(2), textShadow: `0 0 30px ${col}` }}>{imp ? 'IMPOSTER' : 'CREW'}</div>
      <div style={{ fontSize: 17, color: imp ? '#ffd0d0' : '#cfe0ff', width: 300, textAlign: 'center', lineHeight: 1.5, marginTop: 10, opacity: o(4) }}>
        {imp ? 'Infect the crew without being caught. Never say this aloud.' : 'Finish tasks and find the imposters. Trust your eyes.'}
      </div>
      <div style={{ marginTop: 26, padding: '12px 26px', borderRadius: 14, border: `1px solid ${col}66`, background: imp ? '#2a0909' : '#0c1730', textAlign: 'center', opacity: o(6) }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 3, color: C.muted }}>YOUR TAG</div>
        <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 700, letterSpacing: 2, marginTop: 4 }}>{imp ? 'VIPER-07' : 'ONYX-43'}</div>
      </div>
      {imp && (
        <div style={{ marginTop: 22, width: 330, display: 'flex', flexDirection: 'column', gap: 8, opacity: o(8) }}>
          {[
            ['Saboteur', 'Task Stop: jam every task for a while.'],
            ['Phantom', 'Fake Task: send crew to a worthless point.'],
          ].map(([a, b]) => (
            <div key={a} style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,90,90,0.3)', background: '#1f0b0b' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{a}</div>
              <div style={{ fontSize: 12.5, color: '#d8a0a0', marginTop: 2 }}>{b}</div>
            </div>
          ))}
          <div style={{ fontFamily: mono, fontSize: 12, color: '#d8a0a0', letterSpacing: 1.5, marginTop: 4 }}>YOUR ALLY · ZED · EMBER-21</div>
        </div>
      )}
    </div>
  );
};

export const Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const A = 30; // crew card at 10.0 s
  const B = 52; // whip to imposter at ~10.73 s
  const holdP = prog(frame, 4, 24, inOutCubic);
  const imp = frame >= B;
  const flip = imp ? prog(frame, B, 8, outCubic) : prog(frame, A, 8, outCubic);
  const tone = imp ? C.red : frame >= A ? C.blue : '#7d93c9';
  const push = imp ? kf(frame, [[B, 1], [75, 1.08], [90, 2.6]], inCubic) : kf(frame, [[0, 0.96], [A, 1.0]], outCubic);
  const whip = imp ? 1 - outExpo(prog(frame, B, 8)) : 0;
  const thumbO = frame < A ? clamp(frame / 6) * (1 - prog(frame, A - 4, 4)) : 0;
  const white = prog(frame, 80, 10, inCubic);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Shake at={[A, B]} amp={14}>
        <AbsoluteFill>
          <Img src={staticFile('map/base.png')} style={{ position: 'absolute', width: 2600, left: -340, top: -900, filter: 'blur(10px) brightness(0.7)', transform: `scale(${1 + frame * 0.002})` }} />
          <AbsoluteFill style={{ background: `radial-gradient(900px 700px at 50% 50%, ${tone}44, rgba(3,5,10,0.92) 70%)` }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `translateX(${whip * -700}px) scale(${push})` }}>
          <Phone width={430} glow={tone} tilt={[6, imp ? 8 : -8, 0]}>
            {frame < A ? <HoldScreen p={holdP} /> : <div style={{ position: 'absolute', inset: 0, transform: `perspective(900px) rotateY(${(1 - flip) * 80}deg)`, opacity: clamp(flip * 2) }}><RoleScreen imp={imp} t={frame - (imp ? B : A)} /></div>}
          </Phone>
          {/* thumb */}
          <div style={{ position: 'absolute', left: W / 2 - 70, top: H / 2 - 40, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.35), rgba(255,255,255,0.05) 60%, transparent 70%)', opacity: thumbO, transform: `scale(${1 - holdP * 0.08})` }} />
        </AbsoluteFill>
      </Shake>
      <Flare at={A} y={H * 0.36} color={C.blueHi} />
      <Flare at={B} y={H * 0.36} color={C.redHi} />
      <Flash at={A} dur={6} peak={0.35} color={C.blueHi} />
      <Flash at={B} dur={6} peak={0.45} color={C.red} />
      <Vignette />
      <AbsoluteFill style={{ background: '#fff', opacity: white }} />
    </AbsoluteFill>
  );
};

export { Shot };
void hash;
