import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, mono } from '../theme';
import { Flash, Scanlines, Shake, Slam, Vignette, clamp01, ease, hash } from '../kit';
import { Cam, City, Ground, Item, MapStage, Trail, along } from '../world';
import { Caption } from './Map';

const PINS: [number, number][] = [[-380, -220], [300, -300], [-120, 260], [420, 150], [-470, 120], [40, -70]];
const STARTS: [number, number][] = [[-1250, -800], [1150, -900], [-1000, 800], [1250, 700], [-1300, 160], [260, -1000]];
const dur = (i: number) => 52 + i * 4;
const orbPos = (i: number, f: number): [number, number] => {
  const s = STARTS[i]!;
  const p = PINS[i]!;
  const mid: [number, number] = [(s[0] + p[0]) / 2 + (i % 2 ? 160 : -160), (s[1] + p[1]) / 2 + (i % 2 ? -120 : 120)];
  return along([s, mid, p], ease(f / dur(i)));
};

/** 26–34 s */
export const Tasks: React.FC = () => {
  const frame = useCurrentFrame();
  const redP = clamp01((frame - 205) / 25);
  const holo = frame >= 75 && frame < 195;
  const cam: Cam = {
    tilt: interpolate(frame, [0, 240], [50, 58]),
    rot: interpolate(frame, [0, 240], [10, -22]),
    zoom: interpolate(frame, [0, 75, 240], [1.0, 1.28, 0.9]),
    x: interpolate(frame, [0, 240], [-40, 0]),
    y: interpolate(frame, [0, 240], [-40, 0]),
  };
  const items: Item[] = [
    ...PINS.map((p, i): Item => {
      const arrived = frame >= dur(i);
      return { kind: 'pin', x: p[0], y: p[1], color: arrived ? C.green : '#46c8ff', scale: 0.6, delay: i * 3 };
    }),
    ...PINS.map((_, i): Item => {
      const [x, y] = orbPos(i, frame);
      return { kind: 'orb', x, y, color: C.blue, size: 0.85, beam: 160 };
    }),
    ...(frame >= 215 ? [{ kind: 'orb', x: interpolate(frame, [215, 240], [1100, 700]), y: interpolate(frame, [215, 240], [-60, -20]), color: C.red, size: 1.1, pulse: true, beam: 200 } as Item] : []),
  ];
  const tone = redP > 0.5 ? 'red' : 'blue';
  return (
    <AbsoluteFill>
      <Shake at={[0, 75, 105, 135, 165]} amp={10}>
        <MapStage cam={cam} tone={tone} items={items}>
          <City tone={tone} />
          {PINS.map((_, i) => {
            const a = frame - dur(i);
            return (
              <React.Fragment key={i}>
                <Trail pos={(f) => orbPos(i, f)} frame={Math.min(frame, dur(i) + 6)} color={C.blue} len={22} step={2} width={18} />
                {a >= 0 && a < 24 && <Ground x={PINS[i]![0]} y={PINS[i]![1]} r={50 + a * 12} color={C.green} fill={0} width={7} opacity={1 - a / 24} />}
              </React.Fragment>
            );
          })}
        </MapStage>
        <AbsoluteFill style={{ background: C.red, opacity: redP * 0.14 }} />
        <AbsoluteFill style={{ background: '#000', opacity: holo ? 0.62 : 0, transition: 'none' }} />
        <Vignette />
        {frame < 75 && (
          <Caption top bottom={90}>
            <Slam delay={4} size={120} out={68}>Complete tasks.</Slam>
          </Caption>
        )}
        {holo && <Holograms f={frame - 75} />}
        <ScoreBar show={frame >= 70 && frame < 200} f={frame - 70} />
      </Shake>
      <Flash at={75} dur={5} peak={0.5} />
      <Flash at={105} dur={4} peak={0.35} />
      <Flash at={135} dur={4} peak={0.35} />
      <Flash at={165} dur={4} peak={0.35} />
      <Scanlines o={0.05} />
    </AbsoluteFill>
  );
};

const ScoreBar: React.FC<{ show: boolean; f: number }> = ({ show, f }) => {
  if (!show) return null;
  const p = clamp01(f / 120);
  return (
    <div style={{ position: 'absolute', left: 360, right: 360, top: 62, height: 26, borderRadius: 13, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', boxShadow: `0 0 40px ${C.blue}66`, opacity: clamp01(f / 6) }}>
      <div style={{ width: `${ease(p) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${C.blue}, #9bd0ff)`, boxShadow: `0 0 30px ${C.blue}` }} />
    </div>
  );
};

/* ───────── animated minigame holograms ───────── */
const CARD = 760;
const Holograms: React.FC<{ f: number }> = ({ f }) => {
  const k = Math.min(3, Math.floor(f / 30));
  const l = f - k * 30;
  const names = ['Wire Connect', 'Lock Breaker', 'Pattern Memory', 'Sliding Puzzle'];
  const pts = [4, 5, 5, 7];
  const pop = interpolate(l, [0, 5, 9], [0.82, 1.04, 1], { extrapolateRight: 'clamp' });
  const done = l >= 24;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', top: 50 }}>
      <div style={{ width: CARD, height: CARD, borderRadius: 44, background: 'linear-gradient(160deg, rgba(14,24,50,0.92), rgba(6,10,24,0.94))', border: `3px solid ${done ? C.green : C.blue}`, boxShadow: `0 0 90px ${done ? C.green : C.blue}66, inset 0 0 60px ${C.blue}22`, transform: `scale(${pop * 1.22})`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 36, top: 28, fontFamily: mono, fontWeight: 700, fontSize: 28, letterSpacing: 5, color: '#9bc4ff', textTransform: 'uppercase' }}>{names[k]}</div>
        <div style={{ position: 'absolute', right: 36, top: 24, fontFamily: mono, fontWeight: 700, fontSize: 34, color: done ? C.green : '#5b7bb8' }}>+{pts[k]}</div>
        {k === 0 && <Wires l={l} />}
        {k === 1 && <Lock l={l} />}
        {k === 2 && <Pattern l={l} />}
        {k === 3 && <Slide l={l} />}
        {done && <Check l={l - 24} />}
      </div>
    </AbsoluteFill>
  );
};

const Check: React.FC<{ l: number }> = ({ l }) => {
  const s = interpolate(l, [0, 4, 8], [0, 1.25, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center', transform: `scale(${s})` }}>
      <div style={{ width: 96, height: 96, borderRadius: 48, background: C.green, boxShadow: `0 0 50px ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="56" height="56" viewBox="0 0 24 24"><path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="#04110a" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
    </div>
  );
};

const WCOL = ['#ff4d4d', '#46c8ff', '#ffd24a', '#7cff4f'];
const PERM = [2, 0, 3, 1];
const Wires: React.FC<{ l: number }> = ({ l }) => (
  <svg width={CARD} height={CARD} style={{ position: 'absolute', inset: 0 }}>
    {WCOL.map((c, k) => {
      const y0 = 200 + k * 105;
      const j = PERM.indexOf(k);
      const y1 = 200 + j * 105;
      const p = ease((l - 3 - k * 4) / 9);
      return (
        <g key={k}>
          <line x1={150} y1={y0} x2={150 + (CARD - 300) * p} y2={y0 + (y1 - y0) * p} stroke={c} strokeWidth={14} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 12px ${c})` }} />
          <circle cx={150} cy={y0} r={26} fill={c} />
          <circle cx={CARD - 150} cy={y1} r={26} fill={c} opacity={0.35 + 0.65 * p} />
        </g>
      );
    })}
  </svg>
);

const Lock: React.FC<{ l: number }> = ({ l }) => {
  const final = [4, 2, 7];
  const lockAt = [12, 17, 22];
  const closed = l >= 23;
  return (
    <>
      <svg width={CARD} height={200} style={{ position: 'absolute', left: 0, top: 80 }}>
        <path d={`M${CARD / 2 - 70} 180 V110 a70 70 0 0 1 140 0 V${closed ? 180 : 130}`} fill="none" stroke={closed ? C.green : '#9bc4ff'} strokeWidth="16" strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 290, display: 'flex', justifyContent: 'center', gap: 30 }}>
        {final.map((d, i) => {
          const locked = l >= lockAt[i]!;
          const digit = locked ? d : Math.floor(l * 1.9 + i * 3 + hash(l + i) * 4) % 10;
          return (
            <div key={i} style={{ width: 170, height: 230, borderRadius: 24, border: `4px solid ${locked ? C.green : '#4b6aa8'}`, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontWeight: 700, fontSize: 150, color: locked ? C.green : C.white, boxShadow: locked ? `0 0 40px ${C.green}66` : 'none' }}>{digit}</div>
          );
        })}
      </div>
    </>
  );
};

const SEQ = [0, 4, 8, 5, 2];
const Pattern: React.FC<{ l: number }> = ({ l }) => {
  const idx = Math.floor((l - 3) / 4);
  const lit = l >= 3 && idx < SEQ.length ? SEQ[idx] : -1;
  const done = l >= 24;
  const S = 168;
  return (
    <div style={{ position: 'absolute', left: (CARD - (S * 3 + 36)) / 2, top: 130, display: 'grid', gridTemplateColumns: `repeat(3, ${S}px)`, gap: 18 }}>
      {Array.from({ length: 9 }, (_, i) => {
        const on = lit === i || (done && SEQ.includes(i));
        const c = done ? C.green : C.blue;
        return <div key={i} style={{ height: S, borderRadius: 22, border: `3px solid ${on ? c : '#2c3d66'}`, background: on ? `${c}` : 'rgba(255,255,255,0.04)', boxShadow: on ? `0 0 50px ${c}` : 'none', opacity: on ? 1 : 0.9 }} />;
      })}
    </div>
  );
};

const STATES = [
  [1, 0, 3, 4, 2, 6, 7, 5, 8],
  [1, 2, 3, 4, 0, 6, 7, 5, 8],
  [1, 2, 3, 4, 5, 6, 7, 0, 8],
  [1, 2, 3, 4, 5, 6, 7, 8, 0],
];
const Slide: React.FC<{ l: number }> = ({ l }) => {
  const S = 168;
  const G = 14;
  const posOf = (state: number[], tile: number) => {
    const i = state.indexOf(tile);
    return { x: (i % 3) * (S + G), y: Math.floor(i / 3) * (S + G) };
  };
  const seg = l < 10 ? 0 : l < 17 ? 1 : 2;
  const t = ease((l - (3 + 7 * seg)) / 7);
  const a = seg;
  const done = l >= 24;
  return (
    <div style={{ position: 'absolute', left: (CARD - (S * 3 + G * 2)) / 2, top: 130, width: S * 3 + G * 2, height: S * 3 + G * 2 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((tile) => {
        const p0 = posOf(STATES[a]!, tile);
        const p1 = posOf(STATES[Math.min(3, a + 1)]!, tile);
        const x = p0.x + (p1.x - p0.x) * t;
        const y = p0.y + (p1.y - p0.y) * t;
        const c = done ? C.green : C.blue;
        return (
          <div key={tile} style={{ position: 'absolute', left: x, top: y, width: S, height: S, borderRadius: 20, background: `${c}22`, border: `3px solid ${c}`, color: C.white, fontFamily: mono, fontWeight: 700, fontSize: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 26px ${c}55` }}>{tile}</div>
        );
      })}
    </div>
  );
};
