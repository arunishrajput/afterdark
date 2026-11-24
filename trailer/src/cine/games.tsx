import React from 'react';
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Flash, LightLeak, Shot, Vignette } from './fx';
import { C, clamp, grotesk, H, hash, inOutCubic, kf, mono, outBack, outCubic, outExpo, prog, W } from './lib';

/** The glass panel every minigame sits in. */
const Panel: React.FC<{ title: string; pts: number; done: number; children: React.ReactNode; tint?: string }> = ({ title, pts, done, children, tint = C.blue }) => {
  const ok = done > 0;
  const border = ok ? C.green : tint;
  return (
    <div
      style={{
        position: 'absolute',
        left: W / 2 - 400,
        top: H / 2 - 400,
        width: 800,
        height: 800,
        borderRadius: 44,
        background: 'linear-gradient(160deg, rgba(20,30,54,0.94), rgba(8,12,24,0.96))',
        border: `2px solid ${border}${ok ? 'cc' : '55'}`,
        boxShadow: `0 0 ${ok ? 120 : 70}px ${border}${ok ? '66' : '33'}, inset 0 1px 0 rgba(255,255,255,0.08), 0 60px 140px rgba(0,0,0,0.7)`,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', left: 48, top: 40, right: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 38, color: C.white, letterSpacing: '0.04em' }}>{title}</div>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 24, color: ok ? C.green : C.blueHi, padding: '8px 18px', borderRadius: 999, border: `1.5px solid ${ok ? C.green : C.blueHi}66` }}>+{pts}</div>
      </div>
      <div style={{ position: 'absolute', left: 48, right: 48, top: 104, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${Math.min(100, 30 + done * 70)}%`, height: '100%', background: ok ? C.green : C.blue, borderRadius: 2 }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 130, bottom: 0 }}>{children}</div>
    </div>
  );
};

/* ───────── Wire Connect ───────── */
const WIRES = [
  { c: '#FF4B5C', s: '▲', to: 2 },
  { c: '#3D8BFF', s: '●', to: 0 },
  { c: '#FFD23F', s: '■', to: 3 },
  { c: '#3BE8B0', s: '◆', to: 1 },
];
export const Wires: React.FC<{ frame: number }> = ({ frame }) => {
  const y = (i: number) => 120 + i * 135;
  const done = prog(frame, 21, 4);
  return (
    <Panel title="WIRE CONNECT" pts={4} done={done}>
      <svg width={800} height={670} style={{ position: 'absolute', inset: 0 }}>
        {WIRES.map((w, i) => {
          const p = prog(frame, 2 + i * 4.5, 7, inOutCubic);
          const x0 = 150;
          const x1 = 650;
          const y0 = y(i);
          const y1 = y(w.to);
          const d = `M${x0} ${y0} C ${x0 + 220} ${y0}, ${x1 - 220} ${y1}, ${x1} ${y1}`;
          const tip = { x: x0 + (x1 - x0) * p, y: y0 + (y1 - y0) * (3 * p * p - 2 * p * p * p) };
          const spark = frame - (2 + i * 4.5 + 7);
          return (
            <g key={i}>
              <path d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} fill="none" stroke={w.c} strokeWidth={30} strokeOpacity={0.18} strokeLinecap="round" />
              <path d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} fill="none" stroke={w.c} strokeWidth={13} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 ${8 + done * 10}px ${w.c})` }} />
              {p > 0 && p < 1 && <circle cx={tip.x} cy={tip.y} r={14} fill="#fff" style={{ filter: `drop-shadow(0 0 16px ${w.c})` }} />}
              {spark >= 0 && spark < 10 &&
                Array.from({ length: 10 }, (_, k) => {
                  const a = hash(k + i * 17) * Math.PI * 2;
                  const r = 10 + spark * (5 + hash(k + 5) * 7);
                  return <circle key={k} cx={x1 + Math.cos(a) * r} cy={y1 + Math.sin(a) * r} r={3.5 * (1 - spark / 10)} fill="#fff" />;
                })}
              {[x0, x1].map((x, side) => (
                <g key={side}>
                  <rect x={side ? x : x - 74} y={(side ? y(i) : y0) - 34} width={74} height={68} rx={14} fill="#0a1020" stroke={(side ? WIRES.find((q) => q.to === i)! : w).c} strokeWidth={3} />
                  <text x={side ? x + 37 : x - 37} y={(side ? y(i) : y0) + 12} textAnchor="middle" fontSize={32} fill={(side ? WIRES.find((q) => q.to === i)! : w).c}>
                    {(side ? WIRES.find((q) => q.to === i)! : w).s}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </Panel>
  );
};

/* ───────── Lock Breaker ───────── */
export const Lock: React.FC<{ frame: number }> = ({ frame }) => {
  const code = [3, 1, 4];
  const stops = [9, 13, 17];
  const open = prog(frame, 19, 6, outBack);
  const done = prog(frame, 20, 4);
  return (
    <Panel title="LOCK BREAKER" pts={5} done={done}>
      <svg width={800} height={670} style={{ position: 'absolute', inset: 0 }}>
        <g transform={`translate(400 150)`}>
          <path d={`M-62 0 V-60 A62 62 0 0 1 62 -60 V${-10 - open * 60}`} transform={`translate(0 ${-open * 30})`} fill="none" stroke={done ? C.green : '#9fb4dc'} strokeWidth={22} strokeLinecap="round" />
          <rect x={-110} y={-10} width={220} height={150} rx={30} fill={done ? '#0d2a12' : '#121b31'} stroke={done ? C.green : '#3a4b75'} strokeWidth={4} />
          <circle cx={0} cy={55} r={16} fill={done ? C.green : '#5a6b95'} />
          <rect x={-6} y={60} width={12} height={34} rx={6} fill={done ? C.green : '#5a6b95'} />
        </g>
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 360, display: 'flex', justifyContent: 'center', gap: 34 }}>
        {code.map((d, i) => {
          const spinning = frame < stops[i];
          const roll = spinning ? frame * 1.7 + i * 2.3 : d;
          const settle = spinning ? 0 : outBack(clamp((frame - stops[i]) / 5), 3);
          const offset = spinning ? (roll % 6) : d - (1 - settle) * 0.4;
          return (
            <div key={i} style={{ width: 150, height: 190, borderRadius: 26, overflow: 'hidden', position: 'relative', background: '#070b16', border: `3px solid ${spinning ? '#33456f' : done ? C.green : C.blue}`, boxShadow: spinning ? 'none' : `0 0 30px ${done ? C.green : C.blue}66` }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 95 - 90 - offset * 180 }}>
                {[0, 1, 2, 3, 4, 5, 0, 1].map((n, k) => (
                  <div key={k} style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontWeight: 700, fontSize: 110, color: C.white, filter: spinning ? 'blur(3px)' : 'none' }}>
                    {n}
                  </div>
                ))}
              </div>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #070b16 0%, transparent 30%, transparent 70%, #070b16 100%)' }} />
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

/* ───────── Pattern Memory ───────── */
const SEQ = [4, 0, 8, 2, 6];
export const Pattern: React.FC<{ frame: number; reset?: boolean; litUpTo?: number }> = ({ frame, reset = false, litUpTo }) => {
  const cell = (i: number) => ({ x: 400 + ((i % 3) - 1) * 170, y: 330 + (Math.floor(i / 3) - 1) * 170 });
  const step = litUpTo ?? SEQ.reduce((acc, _, k) => (frame >= 2 + k * 4 ? k : acc), -1);
  const done = litUpTo !== undefined ? 0 : prog(frame, 22, 4);
  const pts = SEQ.slice(0, step + 1).map(cell);
  return (
    <Panel title="PATTERN MEMORY" pts={5} done={reset ? 0 : done} tint={reset ? '#5A6278' : C.blue}>
      <svg width={800} height={670} style={{ position: 'absolute', inset: 0 }}>
        {pts.length > 1 && !reset && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={done ? C.green : C.blueHi} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} style={{ filter: `drop-shadow(0 0 12px ${C.blue})` }} />}
        {Array.from({ length: 9 }, (_, i) => {
          const k = SEQ.indexOf(i);
          const on = !reset && k >= 0 && k <= step;
          const fresh = on && litUpTo === undefined ? 1 - prog(frame, 2 + k * 4, 6) : 0;
          const { x, y } = cell(i);
          const col = done ? C.green : C.blue;
          return (
            <g key={i}>
              <rect x={x - 72} y={y - 72} width={144} height={144} rx={26} fill={on ? col : '#0c1326'} fillOpacity={on ? 0.85 : 1} stroke={on ? '#fff' : '#26365d'} strokeOpacity={on ? 0.6 : 1} strokeWidth={3} style={{ filter: on ? `drop-shadow(0 0 ${18 + fresh * 30}px ${col})` : 'none' }} transform={`translate(${x} ${y}) scale(${1 + fresh * 0.1}) translate(${-x} ${-y})`} />
              {on && (
                <text x={x} y={y + 16} textAnchor="middle" fontFamily={mono} fontWeight={700} fontSize={44} fill="#fff">
                  {k + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Panel>
  );
};

/* ───────── Sliding Puzzle ───────── */
export const Slide: React.FC<{ frame: number }> = ({ frame }) => {
  // final layout 1..8 + gap at 8; the last three moves slide 6, 7, 8 home
  const home = (n: number) => ({ c: (n - 1) % 3, r: Math.floor((n - 1) / 3) });
  const moves: { n: number; from: { c: number; r: number }; at: number }[] = [
    { n: 6, from: { c: 2, r: 2 }, at: 3 },
    { n: 8, from: { c: 2, r: 1 }, at: 9 },
    { n: 7, from: { c: 0, r: 2 }, at: 15 },
  ];
  const done = prog(frame, 21, 4);
  const size = 168;
  const x0 = 400 - size * 1.5 - 6;
  const y0 = 90;
  return (
    <Panel title="SLIDING PUZZLE" pts={7} done={done}>
      <div style={{ position: 'absolute', left: x0, top: y0, width: size * 3 + 12, height: size * 3 + 12 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
          const m = moves.find((q) => q.n === n);
          let pos = home(n);
          if (m) {
            const t = prog(frame, m.at, 6, inOutCubic);
            pos = { c: m.from.c + (home(n).c - m.from.c) * t, r: m.from.r + (home(n).r - m.from.r) * t };
          }
          if (n === 6 && frame < 3) pos = { c: 2, r: 2 };
          if (n === 8 && frame < 9) pos = { c: 2, r: 1 };
          if (n === 6 && frame >= 3 && frame < 9) pos = home(6);
          return (
            <div
              key={n}
              style={{
                position: 'absolute',
                left: pos.c * (size + 6),
                top: pos.r * (size + 6),
                width: size,
                height: size,
                borderRadius: 24,
                background: done ? 'linear-gradient(160deg,#1d5a2a,#0e2c15)' : 'linear-gradient(160deg,#1d3566,#0f1c38)',
                border: `3px solid ${done ? C.green : '#4b6db0'}`,
                boxShadow: done ? `0 0 30px ${C.green}55` : '0 10px 30px rgba(0,0,0,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: grotesk,
                fontWeight: 700,
                fontSize: 84,
                color: C.white,
              }}
            >
              {n}
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

/* ───────── the montage of four ───────── */
export const Games: React.FC = () => {
  const frame = useCurrentFrame();
  const G = 30;
  const i = Math.min(3, Math.floor(frame / G));
  const l = frame - i * G;
  const scores = [87, 91, 96, 101, 108];
  const pts = [4, 5, 5, 7];
  const doneAt = 21;
  const score = Math.round(kf(l, [[doneAt + 2, scores[i]], [doneAt + 10, scores[i + 1]]], outCubic));
  const games = [Wires, Lock, Pattern, Slide];
  const pop = prog(l, doneAt, 10, outExpo);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Img src={staticFile('map/base.png')} style={{ position: 'absolute', width: 3000, left: -540 - frame * 2, top: -960, filter: 'blur(14px) brightness(0.55) saturate(1.3)' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(1100px 900px at 50% 50%, rgba(46,139,255,0.22), rgba(3,5,10,0.85) 72%)' }} />
      <LightLeak strength={0.3} />
      {games.map((Game, k) => (
        <Sequence key={k} from={k * G} durationInFrames={G} layout="none">
          <GameShot k={k} G={G}>
            {(lf) => <Game frame={lf} />}
          </GameShot>
        </Sequence>
      ))}
      {/* points fly */}
      {l >= doneAt && (
        <div style={{ position: 'absolute', left: W / 2 + 230 + pop * 380, top: H / 2 - 300 - pop * 180, fontFamily: grotesk, fontWeight: 700, fontSize: 120 - pop * 50, color: C.green, opacity: 1 - prog(l, doneAt + 7, 3), textShadow: `0 0 40px ${C.green}` }}>
          +{pts[i]}
        </div>
      )}
      {/* team score */}
      <div style={{ position: 'absolute', right: 84, top: 70, width: 380, textAlign: 'right' }}>
        <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: '0.4em', color: C.muted }}>TEAM SCORE</div>
        <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 64, color: C.white, marginTop: 6 }}>
          {score}
          <span style={{ color: C.muted, fontSize: 34 }}> / 130</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', marginTop: 10, overflow: 'hidden' }}>
          <div style={{ width: `${(score / 130) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${C.blue}, ${C.blueHi})`, boxShadow: `0 0 16px ${C.blue}` }} />
        </div>
      </div>
      <Flash at={i * G + doneAt} dur={6} peak={0.18} color={C.green} />
      <Vignette />
    </AbsoluteFill>
  );
};

const GameShot: React.FC<{ k: number; G: number; children: (lf: number) => React.ReactNode }> = ({ k, G, children }) => {
  const lf = useCurrentFrame();
  return (
    <Shot dur={G} inT={k % 2 ? 'whipR' : 'whipL'} outT={k < 3 ? (k % 2 ? 'whipL' : 'whipR') : 'cut'} len={6}>
      <AbsoluteFill style={{ transform: `scale(${kf(lf, [[0, 0.96], [G, 1.02]], (t) => t)}) rotate(${kf(lf, [[0, k % 2 ? 1.2 : -1.2], [G, 0]], outCubic)}deg)` }}>{children(lf)}</AbsoluteFill>
    </Shot>
  );
};
