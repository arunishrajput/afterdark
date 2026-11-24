import React from 'react';
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Crewmate } from './actors';
import { CAST } from './cast';
import { Cam, CityMap, CX, CY, Dot, MAPDATA, ROUTES } from './CityMap';
import { Dust, Flare, Flash, GlitchBars, LightLeak, Shake, Super, Vignette } from './fx';
import { C, clamp, f, grotesk, H, hash, inCubic, inOutCubic, kf, mono, outBack, outCubic, outExpo, prog, W } from './lib';
import { Lineup, MapReveal, mix, Reveal } from './act1';
import { Boxes, Camo, Escalate, Fake, Infect, Jam, Navigate, Scatter, Visor } from './act2';
import { Games } from './games';

/* ───────── 32–34 s: emergency meeting ───────── */
export const Alarm: React.FC = () => {
  const frame = useCurrentFrame();
  const PRESS = 10;
  const pressed = frame >= PRESS;
  const thumb = prog(frame, 0, PRESS, inCubic);
  const strobe = pressed ? (Math.floor((frame - PRESS) / 3) % 2 === 0 ? 1 : 0.35) : 0;
  const titleIn = prog(frame, PRESS + 2, 10, outExpo);
  const btnOut = prog(frame, PRESS + 2, 10, inCubic);
  return (
    <AbsoluteFill style={{ background: '#050102', overflow: 'hidden' }}>
      <Shake at={[PRESS, PRESS + 12, PRESS + 24, PRESS + 36]} amp={16}>
        {/* rotating beacon */}
        {pressed && (
          <AbsoluteFill style={{ opacity: 0.55 * strobe + 0.2, background: `conic-gradient(from ${(frame - PRESS) * 14}deg at 50% 50%, transparent 0deg, rgba(255,40,40,0.55) 20deg, transparent 50deg, transparent 180deg, rgba(255,40,40,0.55) 200deg, transparent 230deg)` }} />
        )}
        <AbsoluteFill style={{ background: `radial-gradient(900px 700px at 50% 50%, rgba(255,30,30,${0.15 + 0.4 * strobe}), transparent 70%)` }} />
        {/* the button */}
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - btnOut, transform: `scale(${1 + btnOut * 0.8})` }}>
          <div style={{ position: 'relative', width: 560, height: 560, borderRadius: 120, background: 'linear-gradient(160deg,#20242e,#0b0d12)', boxShadow: '0 40px 120px rgba(0,0,0,0.8), inset 0 2px 0 rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 26, borderRadius: 100, backgroundImage: 'repeating-linear-gradient(-45deg, #FFB020 0 26px, #111 26px 52px)', opacity: 0.85 }} />
            <div style={{ position: 'absolute', inset: 70, borderRadius: '50%', background: '#0b0d12' }} />
            <div
              style={{
                width: 360,
                height: 360,
                borderRadius: '50%',
                background: pressed ? 'radial-gradient(circle at 42% 38%, #ff6b6b, #c40d16 55%, #6a0006)' : 'radial-gradient(circle at 40% 32%, #ff9a9a, #ff2a35 45%, #8a0008)',
                boxShadow: pressed ? '0 4px 10px rgba(0,0,0,0.6), 0 0 120px rgba(255,40,40,0.9)' : '0 26px 40px rgba(0,0,0,0.6), inset 0 -18px 30px rgba(0,0,0,0.35)',
                transform: `scale(${pressed ? 0.93 : 1})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: grotesk,
                fontWeight: 700,
                fontSize: 40,
                letterSpacing: '0.2em',
                color: 'rgba(255,255,255,0.85)',
                paddingLeft: '0.2em',
              }}
            >
              MEETING
            </div>
            {/* thumb shadow */}
            {!pressed && <div style={{ position: 'absolute', left: 280 - 150, top: 280 - 150 + (1 - thumb) * -300, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,0,0,0.55), transparent 70%)', opacity: thumb }} />}
          </div>
        </AbsoluteFill>
        {/* title */}
        {pressed && (
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: titleIn, transform: `scale(${1.25 - 0.25 * titleIn})` }}>
            <div style={{ fontFamily: mono, fontSize: 26, letterSpacing: '0.5em', color: C.redHi, marginBottom: 26, paddingLeft: '0.5em' }}>NOVA CALLED A MEETING</div>
            <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 200, lineHeight: 0.92, color: C.white, textAlign: 'center', letterSpacing: '0.01em', textShadow: `0 0 70px ${C.red}` }}>
              EMERGENCY
              <br />
              <span style={{ color: C.red }}>MEETING</span>
            </div>
            <div style={{ fontFamily: mono, fontSize: 24, letterSpacing: '0.45em', color: C.white, marginTop: 34, opacity: 0.8, paddingLeft: '0.45em' }}>GO TO THE BASE</div>
          </AbsoluteFill>
        )}
      </Shake>
      <Flash at={PRESS} dur={7} peak={0.9} color="#ffdddd" />
      <Vignette strength={0.9} />
    </AbsoluteFill>
  );
};

/* ───────── 34–36 s: everyone converges ───────── */
export const Converge: React.FC = () => {
  const frame = useCurrentFrame();
  const [bx, by] = MAPDATA.base;
  const cam: Cam = { x: bx, y: by, zoom: kf(frame, [[0, 0.95], [60, 1.45]], inOutCubic), tilt: kf(frame, [[0, 50], [60, 58]]), rot: kf(frame, [[0, 30], [60, -24]], (t) => t), cy: 560 };
  const dots: Dot[] = CAST.map((p, i) => {
    const r = ROUTES.converge[i];
    const t = kf(frame, [[0, 0.25 + (i % 3) * 0.05], [54, 1]], inOutCubic);
    const s = r.length * t;
    const head = r.at(s);
    return { id: p.name, x: head.x, y: head.y, color: p.accent, size: 9, trail: r.slice(Math.max(0, s - 300), s, 7), glow: 1.3 };
  });
  const pulse = (frame % 24) / 24;
  return (
    <AbsoluteFill>
      <CityMap
        cam={cam}
        zone={1}
        regions={0.35}
        baseMarker={1}
        dots={dots}
        ground={
          <g>
            <circle cx={bx} cy={by} r={51 + pulse * 120} fill="none" stroke="#fff" strokeWidth={4} opacity={(1 - pulse) * 0.7} />
          </g>
        }
        overlay={(proj) => {
          const q = proj(bx, by);
          return (
            <g>
              <text x={q.x} y={q.y - 70 * q.k} textAnchor="middle" fill="#fff" fontFamily={mono} fontWeight={700} fontSize={22} letterSpacing={6} style={{ paintOrder: 'stroke', stroke: '#03050a', strokeWidth: 6 }}>
                BASE
              </text>
            </g>
          );
        }}
      />
      <LightLeak strength={0.25} color="#ffffff" color2={C.red} />
      <Super at={8} text="Face to face." sub="no chat. no voice app. just people." y={820} />
      <Vignette />
    </AbsoluteFill>
  );
};

/* ───────── 36–39 s: accuse and vote ───────── */
const SEAT = (i: number) => {
  const n = CAST.length;
  const t = (i - (n - 1) / 2) / ((n - 1) / 2); // -1..1
  return { x: W / 2 + t * 790, y: 800 - (1 - t * t) * 120, s: 0.74 + t * t * 0.26 };
};
const ACCUSE: [number, number, number][] = [
  [0, 1, 4], // NOVA → RAVEN
  [5, 1, 12],
  [1, 2, 20], // RAVEN deflects → KAI
  [6, 1, 28],
];
const VOTES: { from: number; to: number | 'skip'; at: number }[] = [
  { from: 0, to: 1, at: 40 },
  { from: 5, to: 1, at: 44 },
  { from: 6, to: 1, at: 48 },
  { from: 3, to: 1, at: 52 },
  { from: 1, to: 2, at: 54 },
  { from: 2, to: 1, at: 58 },
  { from: 4, to: 'skip', at: 61 },
  { from: 7, to: 'skip', at: 64 },
];
export const Accuse: React.FC = () => {
  const frame = useCurrentFrame();
  const focus = prog(frame, 72, 14, inOutCubic);
  const tally = (k: number | 'skip') => VOTES.filter((v) => v.to === k && frame >= v.at + 6).length;
  const head = (i: number) => {
    const s = SEAT(i);
    return { x: s.x + 20 * s.s, y: s.y - 175 * s.s };
  };
  const timer = Math.max(0, 15 - Math.floor(frame / 6));
  return (
    <AbsoluteFill style={{ background: '#030409', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(1200px 500px at 50% 95%, rgba(140,160,220,0.16), transparent 70%)' }} />
      {/* spotlight cone on RAVEN */}
      <div style={{ position: 'absolute', left: SEAT(1).x - 260 + 40, top: -100, width: 520, height: 1000, background: 'linear-gradient(180deg, rgba(255,240,230,0.0), rgba(255,240,230,0.14))', clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)', opacity: focus }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 70, textAlign: 'center', fontFamily: mono, fontSize: 24, letterSpacing: '0.5em', color: C.muted, paddingLeft: '0.5em' }}>
        VOTE · 00:{String(timer).padStart(2, '0')}
      </div>
      {CAST.map((p, i) => {
        const s = SEAT(i);
        const dim = i === 1 ? 1 : 1 - focus * 0.65;
        return (
          <div key={p.name} style={{ position: 'absolute', left: s.x - 156 * s.s, top: s.y - 350 * s.s, opacity: dim }}>
            <Crewmate accent={p.accent} visor={C.blueHi} lit={i === 1 ? 0.6 + focus * 0.4 : 0.4} size={380 * s.s} breathe={frame + i * 7} facing={s.x < W / 2 ? 1 : -1} />
            <div style={{ position: 'absolute', left: 0, width: 313 * s.s, top: 385 * s.s, textAlign: 'center', fontFamily: mono, fontSize: 18, letterSpacing: '0.3em', color: i === 1 && focus > 0 ? C.white : C.muted }}>{p.name}</div>
          </div>
        );
      })}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {ACCUSE.map(([a, b, at], k) => {
          const p = prog(frame, at, 6, outCubic);
          const fade = 1 - prog(frame, 38, 8);
          if (p <= 0 || fade <= 0) return null;
          const A = head(a);
          const B = head(b);
          const x = A.x + (B.x - A.x) * p;
          const y = A.y + (B.y - A.y) * p - Math.sin(p * Math.PI) * 60;
          const col = CAST[a].imp ? C.red : CAST[a].accent;
          return (
            <g key={k} opacity={fade}>
              <path d={`M${A.x} ${A.y} Q ${(A.x + B.x) / 2} ${Math.min(A.y, B.y) - 140} ${x} ${y}`} fill="none" stroke={col} strokeWidth={14} strokeOpacity={0.2} strokeLinecap="round" />
              <path d={`M${A.x} ${A.y} Q ${(A.x + B.x) / 2} ${Math.min(A.y, B.y) - 140} ${x} ${y}`} fill="none" stroke={col} strokeWidth={5} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 12px ${col})` }} />
              <circle cx={x} cy={y} r={12} fill="#fff" style={{ filter: `drop-shadow(0 0 14px ${col})` }} />
            </g>
          );
        })}
        {VOTES.map((v, k) => {
          const p = prog(frame, v.at, 7, inOutCubic);
          if (p <= 0 || p >= 1) return null;
          const A = head(v.from);
          const B = v.to === 'skip' ? { x: W / 2, y: 980 } : head(v.to);
          return <circle key={k} cx={A.x + (B.x - A.x) * p} cy={A.y + (B.y - A.y) * p - Math.sin(p * Math.PI) * 140} r={12} fill={CAST[v.from].accent} style={{ filter: `drop-shadow(0 0 12px ${CAST[v.from].accent})` }} />;
        })}
      </svg>
      {/* tallies */}
      {[1, 2].map((t) => {
        const n = tally(t);
        if (!n) return null;
        const h = head(t);
        return (
          <div key={t} style={{ position: 'absolute', left: h.x - 60, top: h.y - 150, width: 120, textAlign: 'center', fontFamily: grotesk, fontWeight: 700, fontSize: t === 1 ? 84 : 52, color: t === 1 ? C.white : C.muted, textShadow: t === 1 ? '0 0 30px rgba(255,255,255,0.5)' : undefined, transform: `scale(${1 + (frame - (VOTES.filter((v) => v.to === t).map((v) => v.at + 6).filter((a) => frame >= a).pop() ?? 0) < 5 ? 0.18 : 0)})` }}>
            {n}
          </div>
        );
      })}
      {tally('skip') > 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: 950, textAlign: 'center', fontFamily: mono, fontSize: 24, letterSpacing: '0.4em', color: C.muted }}>SKIP · {tally('skip')}</div>}
      <Dust count={26} opacity={0.35} />
      <Vignette strength={0.85} />
    </AbsoluteFill>
  );
};

/* ───────── 39–42 s: ejected ───────── */
export const Eject: React.FC = () => {
  const frame = useCurrentFrame();
  const LINE1 = 15;
  const DISS = 26;
  const LINE2 = 60;
  const t1 = 'RAVEN WAS AN IMPOSTER.';
  const n1 = Math.floor(t1.length * prog(frame, LINE1, 14));
  const red = prog(frame, LINE1 + 4, 8);
  const diss = prog(frame, DISS, 34, inOutCubic);
  const line2 = prog(frame, LINE2, 8, outCubic);
  const g = frame >= LINE2 ? Math.max(0, 1 - (frame - LINE2) / 10) : 0;
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: W / 2 - 300, top: 0, width: 600, height: H, background: 'linear-gradient(180deg, rgba(255,235,225,0.02), rgba(255,235,225,0.13))', clipPath: 'polygon(40% 0, 60% 0, 100% 100%, 0 100%)' }} />
      <div style={{ position: 'absolute', left: W / 2 - 600, top: 880, width: 1200, height: 120, background: 'radial-gradient(ellipse at 50% 50%, rgba(255,235,225,0.16), transparent 70%)' }} />
      <div
        style={{
          position: 'absolute',
          left: W / 2 - 185,
          top: 470,
          opacity: 1 - diss * 0.2,
          WebkitMaskImage: `linear-gradient(0deg, transparent ${diss * 110 - 10}%, black ${diss * 110 + 5}%)`,
          maskImage: `linear-gradient(0deg, transparent ${diss * 110 - 10}%, black ${diss * 110 + 5}%)`,
          transform: `translate(${Math.sin(frame * 1.7) * (frame < LINE1 ? 1.2 : 0)}px, 0)`,
        }}
      >
        <Crewmate accent={CAST[1].accent} visor={mix(C.blueHi, C.red, red)} visorGlow={1 + red} lit={0.9} size={440} breathe={frame} />
      </div>
      {/* particles */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 140 }, (_, i) => {
          const born = DISS + hash(i) * 30;
          const l = frame - born;
          if (l < 0) return null;
          const x0 = W / 2 - 150 + hash(i + 3) * 300;
          const y0 = 880 - (born - DISS) * 13 + hash(i + 9) * 30;
          const x = x0 + l * (2 + hash(i + 5) * 6);
          const y = y0 - l * (3 + hash(i + 7) * 5);
          const o = clamp(1 - l / 40);
          return <rect key={i} x={x} y={y} width={3 + hash(i) * 5} height={3 + hash(i) * 5} fill={i % 3 ? C.red : '#ffb3b3'} opacity={o} />;
        })}
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 150, textAlign: 'center', fontFamily: grotesk, fontWeight: 500, fontSize: 84, letterSpacing: '0.16em', color: C.white, paddingLeft: '0.16em' }}>
        {t1.slice(0, n1)}
        <span style={{ opacity: 0 }}>{t1.slice(n1)}</span>
      </div>
      {frame >= LINE2 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 290, textAlign: 'center', opacity: line2, transform: `translateX(${(hash(frame) - 0.5) * 30 * g}px)` }}>
          <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 40, letterSpacing: '0.42em', color: C.red, paddingLeft: '0.42em', textShadow: `0 0 30px ${C.red}` }}>1 IMPOSTER REMAINS</span>
        </div>
      )}
      {g > 0 && <GlitchBars amount={g} seed={frame} />}
      <Flash at={LINE1} dur={8} peak={0.25} />
      <Vignette strength={0.9} />
    </AbsoluteFill>
  );
};

/* ───────── 42–44 s: the night isn't over ───────── */
export const Breath: React.FC = () => {
  const frame = useCurrentFrame();
  const cam: Cam = { x: CX, y: CY, zoom: kf(frame, [[0, 0.7], [60, 0.62]]), tilt: 30, rot: kf(frame, [[0, -8], [60, 6]], (t) => t), cy: 540 };
  const alive = CAST.filter((p) => p.name !== 'RAVEN');
  const dots: Dot[] = alive.map((p, k) => {
    const i = CAST.indexOf(p);
    const r = ROUTES.toPin[i];
    const s = r.length * kf(frame, [[0, 0.05], [60, 0.45]], (t) => t);
    const h = r.at(s);
    const zed = p.name === 'ZED';
    const flick = zed && frame >= 30 && frame < 38 && frame % 2 === 0;
    return { id: p.name, x: h.x, y: h.y, color: flick ? C.red : p.accent, size: 9, trail: r.slice(Math.max(0, s - 120), s, 6), ring: flick ? C.red : undefined, glow: flick ? 2.4 : 1 };
  });
  const text = prog(frame, 6, 16, outCubic);
  return (
    <AbsoluteFill>
      <CityMap cam={cam} zone={1} regions={0.4} baseMarker={0.6} dots={dots} roadGlow={0.8} />
      <AbsoluteFill style={{ background: 'rgba(2,3,8,0.45)' }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: text * (1 - prog(frame, 52, 8)) }}>
        <div style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 92, letterSpacing: `${kf(frame, [[0, 0.4], [60, 0.22]], outCubic)}em`, color: C.white, textShadow: '0 0 40px rgba(0,0,0,0.9)', paddingLeft: '0.22em' }}>THE NIGHT ISN’T OVER.</div>
      </AbsoluteFill>
      <Vignette strength={0.9} />
    </AbsoluteFill>
  );
};

/* ───────── 44–49.5 s: flash montage ───────── */
const CUTS: { C: React.FC; at: number; tint?: string }[] = [
  { C: Scatter, at: f(0.9) },
  { C: Games, at: f(0.72) },
  { C: Visor, at: f(0.5) },
  { C: Infect, at: f(1.95) },
  { C: Jam, at: f(0.4) },
  { C: Navigate, at: f(1.2) },
  { C: Fake, at: f(1.3) },
  { C: Alarm, at: f(1.0) },
  { C: Converge, at: f(1.2) },
  { C: Escalate, at: f(0.4) },
  { C: Lineup, at: f(1.25) },
];
export const Montage: React.FC = () => {
  const frame = useCurrentFrame();
  const L = 15;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {CUTS.map((c, k) => (
        <Sequence key={k} from={k * L} durationInFrames={L} layout="none">
          <Punch k={k}>
            <Sequence from={-c.at} layout="none">
              <c.C />
            </Sequence>
          </Punch>
        </Sequence>
      ))}
      {CUTS.map((_, k) => (
        <Flash key={k} at={k * L} dur={3} peak={0.55} />
      ))}
      <AbsoluteFill style={{ background: '#000', opacity: prog(frame, CUTS.length * L - 4, 4) }} />
    </AbsoluteFill>
  );
};
const Punch: React.FC<{ k: number; children: React.ReactNode }> = ({ k, children }) => {
  const l = useCurrentFrame();
  const s = kf(l, [[0, 1.12], [15, 1.0]], outExpo);
  const dx = k % 2 ? 1 : -1;
  return <AbsoluteFill style={{ transform: `scale(${s}) translateX(${dx * (1 - outExpo(l / 6)) * 60}px)` }}>{children}</AbsoluteFill>;
};

/* ───────── 50–60 s: title + call to action ───────── */
export const Finale: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = prog(frame, 0, 34, outExpo);
  const settle = prog(frame, 150, 26, inOutCubic);
  const logoY = 430 - settle * 120;
  const logoS = (1.16 - 0.16 * outExpo(frame / 40)) * (1 - settle * 0.42);
  const sweep = kf(frame, [[18, -40], [56, 140]], inOutCubic);
  const tag = prog(frame, 44, 18, outCubic) * (1 - prog(frame, 148, 10));
  const cta = (d: number) => prog(frame, 166 + d, 14, outCubic);
  const end = prog(frame, 272, 28, inCubic);
  const cam: Cam = { x: CX, y: CY, zoom: 0.56, tilt: 0, rot: frame * 0.08, cy: 540 };
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ opacity: 0.22 * reveal }}>
        <CityMap cam={cam} zone={1} regions={0.4} baseMarker={1} roadGlow={0.6} fog={false} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(800px 600px at 30% 50%, rgba(46,139,255,0.22), transparent 70%), radial-gradient(800px 600px at 70% 50%, rgba(255,59,59,0.22), transparent 70%)', opacity: reveal }} />
      {/* rings */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: reveal * (1 - settle * 0.6) }}>
        <circle cx={W / 2} cy={logoY} r={440 * logoS} fill="none" stroke={C.blue} strokeWidth={2} strokeDasharray="300 1400" transform={`rotate(${frame * 1.2} ${W / 2} ${logoY})`} opacity={0.7} />
        <circle cx={W / 2} cy={logoY} r={470 * logoS} fill="none" stroke={C.red} strokeWidth={2} strokeDasharray="260 1500" transform={`rotate(${-frame * 0.9 + 180} ${W / 2} ${logoY})`} opacity={0.7} />
      </svg>
      <Embers />
      <div style={{ position: 'absolute', left: W / 2 - 600, top: logoY - 400, width: 1200, height: 800, transform: `scale(${logoS})`, WebkitMaskImage: `radial-gradient(circle at 50% 50%, black ${reveal * 70}%, transparent ${reveal * 70 + 18}%)`, maskImage: `radial-gradient(circle at 50% 50%, black ${reveal * 70}%, transparent ${reveal * 70 + 18}%)` }}>
        <Img src={staticFile('brand/afterdark-logo.png')} style={{ width: 1200, mixBlendMode: 'lighten', filter: `brightness(${1 + (1 - reveal) * 1.5}) drop-shadow(0 0 40px rgba(255,59,59,0.35))` }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(105deg, transparent ${sweep - 12}%, rgba(255,255,255,0.75) ${sweep}%, transparent ${sweep + 12}%)`, mixBlendMode: 'overlay' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 880, textAlign: 'center', opacity: tag, fontFamily: grotesk, fontWeight: 500, fontSize: 46, letterSpacing: `${kf(frame, [[44, 0.5], [140, 0.3]], outCubic)}em`, color: C.white, paddingLeft: '0.3em' }}>
        AMONG US, <span style={{ color: C.red }}>PLAYED ON YOUR FEET.</span>
      </div>
      {/* call to action */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 640, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ opacity: cta(0), transform: `translateY(${(1 - cta(0)) * 20}px)`, fontFamily: grotesk, fontWeight: 500, fontSize: 50, letterSpacing: '0.26em', color: C.white, paddingLeft: '0.26em' }}>PLAY FREE IN YOUR BROWSER</div>
        <div style={{ opacity: cta(8), transform: `translateY(${(1 - cta(8)) * 20}px)`, marginTop: 38, fontFamily: mono, fontWeight: 700, fontSize: 50, color: C.white, padding: '18px 48px', borderRadius: 20, border: '2px solid rgba(255,255,255,0.85)', boxShadow: `0 0 60px ${C.blue}66, inset 0 0 40px ${C.red}22`, letterSpacing: '0.04em' }}>afterdark-24gx.onrender.com</div>
        <div style={{ opacity: cta(16), marginTop: 40, fontFamily: mono, fontSize: 24, letterSpacing: '0.42em', color: '#b4bdd6', paddingLeft: '0.42em' }}>4–12 PLAYERS · NO APP · NO ACCOUNTS</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 52, textAlign: 'center', opacity: cta(26) * 0.75, fontFamily: mono, fontSize: 17, letterSpacing: '0.34em', color: C.muted, paddingLeft: '0.34em' }}>
        WALK, NEVER RUN · BUILT WITH CLAUDE CODE · CODENMODE @ SIT
      </div>
      <Flare at={0} y={430} width={2400} color={C.blueHi} dur={30} />
      <Flare at={2} y={430} width={1800} color={C.redHi} dur={26} />
      <Flash at={0} dur={14} peak={1} />
      <Vignette />
      <AbsoluteFill style={{ background: '#000', opacity: end }} />
    </AbsoluteFill>
  );
};

const Embers: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: 60 }, (_, i) => {
        const sp = 0.6 + hash(i) * 1.6;
        const x = hash(i + 1) * W + Math.sin(frame / 30 + i) * 20;
        const y = H + 40 - ((frame * sp + hash(i + 2) * H * 1.2) % (H + 80));
        const r = 1 + hash(i + 4) * 2.6;
        return <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? C.red : C.blueHi} opacity={0.25 + 0.5 * hash(i + 6)} />;
      })}
    </svg>
  );
};

export { MapReveal, Reveal };
void outBack;
