import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { Crewmate, Hud, Phone, UI } from './actors';
import { CAST } from './cast';
import { Cam, CityMap, CX, CY, Dot, MAPDATA, Pin, ROUTES } from './CityMap';
import { Flare, Flash, GlitchBars, LightLeak, Shake, Super, Vignette } from './fx';
import { C, clamp, grotesk, H, hash, inCubic, inOutCubic, kf, mono, outBack, outCubic, outExpo, Poly, prog, W } from './lib';
import { mix } from './act1';
import { Pattern } from './games';

const deg = (r: number) => (r * 180) / Math.PI;
/** Camera that rides behind a walker: heading up the screen. */
const follow = (route: Poly, s: number, base: Omit<Cam, 'x' | 'y' | 'rot'>, look = 120): Cam => {
  const p = route.at(s);
  const q = route.at(s + look);
  const a = Math.atan2(q.y - p.y, q.x - p.x);
  return { ...base, x: p.x, y: p.y, rot: -90 - deg(a) };
};

/* ───────── 12–14 s: scatter ───────── */
export const Scatter: React.FC = () => {
  const frame = useCurrentFrame();
  const cam: Cam = {
    x: MAPDATA.base[0],
    y: kf(frame, [[0, MAPDATA.base[1]], [60, MAPDATA.base[1] + 60]]),
    zoom: kf(frame, [[0, 1.9], [44, 0.78], [60, 0.74]], outExpo),
    tilt: kf(frame, [[0, 64], [44, 50]], outCubic),
    rot: kf(frame, [[0, 40], [60, -6]], outCubic),
    cy: 580,
  };
  const dots: Dot[] = CAST.map((p, i) => {
    const r = ROUTES.scatter[i];
    const t = prog(frame, 2 + (i % 3), 46, outCubic);
    const s = r.length * t;
    const head = r.at(s);
    return { id: p.name, x: head.x, y: head.y, color: p.accent, trail: r.slice(Math.max(0, s - 420), s, 8), size: 9, glow: 1.4 };
  });
  const pins: Pin[] = MAPDATA.pins.map((pt, i) => ({ id: `p${i}`, x: pt[0], y: pt[1], drop: prog(frame, 18 + i * 2.4, 14) }));
  return (
    <AbsoluteFill>
      <CityMap cam={cam} zone={1} regions={0.9} baseMarker={1} dots={dots} pins={pins} />
      <LightLeak strength={0.3} />
      <Flare at={0} y={560} />
      <Flash at={0} dur={10} peak={0.9} />
      <Vignette />
    </AbsoluteFill>
  );
};

/** The real app's map panel (from a capture of the live game), recoloured for imposters. */
export const PhoneMap: React.FC<{ red?: boolean }> = ({ red }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: 140, height: 310, overflow: 'hidden' }}>
    <Img src={staticFile('footage/host-game.png')} style={{ position: 'absolute', width: 390, left: 0, top: -120, filter: red ? 'hue-rotate(150deg) saturate(1.6) brightness(0.9)' : undefined }} />
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #05070D 0%, transparent 12%, transparent 85%, #05070D 100%)' }} />
  </div>
);

/* ───────── 14–16 s: navigate ───────── */
const TaskCard: React.FC<{ title: string; sub: string; dist: string; icon: string; active?: boolean; green?: boolean; arrow?: number }> = ({ title, sub, dist, icon, active, green, arrow = 0 }) => (
  <div style={{ ...UI.card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, borderColor: active ? (green ? C.green : C.blue) : undefined, boxShadow: active ? `0 0 24px ${green ? C.green : C.blue}55` : undefined }}>
    <div style={{ width: 40, height: 40, borderRadius: 20, border: `2px solid ${green ? C.green : C.blueHi}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{icon}</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 700, fontSize: 19 }}>{title}</div>
      <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>{sub}</div>
    </div>
    <div style={{ textAlign: 'right' }}>
      <div style={{ color: C.blueHi, fontSize: 18, transform: `rotate(${arrow}deg)`, display: 'inline-block' }}>↑</div>
      <div style={{ ...UI.mono, fontSize: 15, color: C.white }}>{dist}</div>
    </div>
  </div>
);

export const Navigate: React.FC = () => {
  const frame = useCurrentFrame();
  const r = ROUTES.toPin[0];
  const s = r.length * kf(frame, [[0, 0.3], [60, 1]], (t) => t);
  const cam = follow(r, s, { zoom: 2.3, tilt: 58, cy: 720 }, 140);
  const me = r.at(s);
  const pinDrop = prog(frame, 20, 14);
  const remaining = Math.max(0, Math.round(((r.length - s) / 1.7) * 1.0));
  const stage = frame < 20 ? 0 : frame < 48 ? 1 : 2;
  const slide = prog(frame, 0, 14, outExpo);
  const press = frame >= 52 && frame < 56 ? 0.94 : 1;
  const end = r.at(r.length);
  return (
    <AbsoluteFill>
      <CityMap
        cam={cam}
        zone={1}
        regions={0.55}
        baseMarker={1}
        dots={[{ id: 'nova', x: me.x, y: me.y, color: CAST[0].accent, size: 15, trail: r.slice(Math.max(0, s - 160), s, 6), glow: 1.6, label: 'NOVA' }]}
        pins={[{ id: 'goal', x: end.x, y: end.y, drop: pinDrop, kind: stage === 2 ? 'done' : 'task', scale: 1.3 }]}
      />
      <LightLeak strength={0.25} />
      <Vignette />
      <div style={{ position: 'absolute', right: 150 - (1 - slide) * 700, top: 70 }}>
        <Phone width={400} glow={C.blue} tilt={[3, -14, 1]}>
          <div style={{ position: 'absolute', inset: 0, background: '#05070D' }}>
            <Hud time="09:41" filled={0} score={83} />
            <PhoneMap />
            <div style={{ position: 'absolute', left: 12, right: 12, top: 500, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stage === 0 && <TaskCard title="NE · Region B" sub="Head to the area" dist={`${remaining + 40} m`} icon="🧭" active arrow={20} />}
              {stage === 1 && <TaskCard title="NE · Region B" sub="Walk to the pin" dist={`${remaining} m`} icon="📍" active arrow={-8} />}
              {stage === 2 && (
                <div style={{ ...UI.card, padding: 16, borderColor: C.green, boxShadow: `0 0 24px ${C.green}55` }}>
                  <div style={{ fontWeight: 700, fontSize: 19 }}>You’re at the pin</div>
                  <div style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>Stop somewhere safe first.</div>
                  <div style={{ marginTop: 12, height: 50, borderRadius: 12, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, transform: `scale(${press})` }}>Start</div>
                </div>
              )}
              <TaskCard title="W · Region C" sub="Head to the area" dist="58 m" icon="🧭" arrow={-70} />
              <TaskCard title="SE · Region A" sub="Head to the area" dist="146 m" icon="🧭" arrow={130} />
            </div>
          </div>
        </Phone>
      </div>
      <Flash at={20} dur={5} peak={0.12} color={C.blueHi} />
    </AbsoluteFill>
  );
};

/* ───────── 20–21 s: the visor turns ───────── */
export const Visor: React.FC = () => {
  const frame = useCurrentFrame();
  const red = prog(frame, 9, 5, outCubic);
  const push = kf(frame, [[0, 1], [30, 1.12]], (t) => t);
  const glint = kf(frame, [[6, -40], [16, 140]], inOutCubic);
  return (
    <AbsoluteFill style={{ background: '#010204', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(1000px 700px at 62% 40%, ${mix('#103a7a', '#6a0a0a', red)}66, transparent 70%)` }} />
      <div style={{ position: 'absolute', left: 300, top: 90, transform: `scale(${push})`, transformOrigin: '1150px 500px' }}>
        <Crewmate accent={CAST[1].accent} visor={mix(C.blueHi, C.red, red)} visorGlow={0.8 + red * 1.6} lit={1} size={1300} />
      </div>
      {/* glint across the visor */}
      <div style={{ position: 'absolute', left: `${glint}%`, top: 0, width: 140, height: H, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)', transform: 'skewX(-18deg)', mixBlendMode: 'screen' }} />
      <Flare at={9} y={510} x={1180} color={C.redHi} width={2200} />
      <Flash at={9} dur={6} peak={0.5} color={C.red} />
      <Vignette strength={0.9} />
    </AbsoluteFill>
  );
};

/* ───────── 21–24 s: the infection ───────── */
export const Infect: React.FC = () => {
  const frame = useCurrentFrame();
  const r = ROUTES.victim;
  const sv = r.length * (0.1 + (0.62 * frame) / 90);
  const gap = kf(frame, [[0, 150], [24, 24], [62, 24], [90, 140]], inOutCubic);
  const sr = sv - gap;
  const v = r.at(sv);
  const im = r.at(sr);
  const mid = r.length > 0 ? (sv + sr) / 2 : 0;
  const cam = follow(r, mid, { zoom: 3.1, tilt: 54, cy: 600 }, 160);
  const ch = prog(frame, 26, 34);
  const exposed = frame >= 60;
  const pulse = exposed ? ((frame - 60) % 20) / 20 : undefined;
  const beat = [6, 24, 42, 58].some((b) => frame >= b && frame < b + 5);
  const victimCol = exposed ? C.green : CAST[3].accent;
  return (
    <AbsoluteFill>
      <Shake at={[60]} amp={10}>
        <CityMap
          cam={cam}
          tone="red"
          zone={0}
          regions={0}
          baseOpacity={0.9}
          dots={[
            { id: 'mira', x: v.x, y: v.y, color: victimCol, size: 19, trail: r.slice(Math.max(0, sv - 120), sv, 5), label: exposed ? 'MIRA · EXPOSED' : 'MIRA', glow: exposed ? 2 : 1.2, pulse, ring: exposed ? C.green : undefined },
            { id: 'raven', x: im.x, y: im.y, color: C.red, size: 19, ring: C.red, label: 'YOU', labelBelow: true, glow: 1.8 },
          ]}
          ground={
            <g>
              <circle cx={im.x} cy={im.y} r={28} fill={C.red} fillOpacity={0.12} stroke={C.red} strokeWidth={1.5} strokeDasharray="4 4" />
            </g>
          }
          overlay={(proj) => {
            const q = proj(im.x, im.y);
            const R = 46 * q.k;
            const circ = 2 * Math.PI * R;
            return ch > 0 ? (
              <g>
                <circle cx={q.x} cy={q.y} r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={6} />
                <circle cx={q.x} cy={q.y} r={R} fill="none" stroke={C.red} strokeWidth={6} strokeDasharray={circ} strokeDashoffset={circ * (1 - ch)} transform={`rotate(-90 ${q.x} ${q.y})`} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 10px ${C.red})` }} />
              </g>
            ) : null;
          }}
        />
      </Shake>
      {/* imposter HUD */}
      <AbsoluteFill style={{ boxShadow: `inset 0 0 ${beat ? 220 : 160}px rgba(255,30,30,${beat ? 0.45 : 0.28})` }} />
      {[
        [60, 60, 0],
        [W - 60, 60, 90],
        [W - 60, H - 60, 180],
        [60, H - 60, 270],
      ].map(([x, y, a], i) => (
        <div key={i} style={{ position: 'absolute', left: x - 40, top: y - 40, width: 80, height: 80, transform: `rotate(${a}deg)`, borderTop: `3px solid ${C.red}`, borderLeft: `3px solid ${C.red}`, opacity: 0.8 }} />
      ))}
      <div style={{ position: 'absolute', left: 110, top: 92, fontFamily: mono, fontSize: 20, letterSpacing: '0.4em', color: C.redHi }}>IMPOSTER · RAVEN</div>
      <InfectButton ch={ch} done={exposed} />
      <Super at={8} text="8 metres. 10 seconds." sub="no touch. no warning." color={C.redHi} y={830} out={84} />
      <Flash at={60} dur={7} peak={0.35} color={C.green} />
    </AbsoluteFill>
  );
};

const InfectButton: React.FC<{ ch: number; done: boolean }> = ({ ch, done }) => {
  const R = 84;
  const circ = 2 * Math.PI * R;
  return (
    <div style={{ position: 'absolute', right: 120, bottom: 110, width: 200, height: 200 }}>
      <svg width={200} height={200}>
        <circle cx={100} cy={100} r={R} fill="rgba(40,6,6,0.85)" stroke="rgba(255,255,255,0.12)" strokeWidth={10} />
        <circle cx={100} cy={100} r={R} fill="none" stroke={done ? C.green : C.red} strokeWidth={10} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - (done ? 1 : ch))} transform="rotate(-90 100 100)" style={{ filter: `drop-shadow(0 0 12px ${done ? C.green : C.red})` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontWeight: 700, color: C.white }}>
        <div style={{ fontSize: 24, letterSpacing: 3 }}>{done ? 'DONE' : 'INFECT'}</div>
        <div style={{ fontSize: 18, color: done ? C.green : C.redHi, marginTop: 4 }}>{done ? 'exposed' : `00:${String(Math.max(0, Math.ceil(10 * (1 - ch)))).padStart(2, '0')}`}</div>
      </div>
    </div>
  );
};

/* ───────── 24–25 s: someone has been compromised ───────── */
export const Boxes: React.FC = () => {
  const frame = useCurrentFrame();
  const filled = frame >= 8 ? 1 : 0;
  const toast = prog(frame, 11, 8, outBack);
  const push = kf(frame, [[0, 1], [30, 1.06]], (t) => t);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Img src={staticFile('map/base.png')} style={{ position: 'absolute', width: 3000, left: -700, top: -1000, filter: 'blur(12px) brightness(0.5)' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(1000px 700px at 50% 45%, rgba(46,139,255,0.25), rgba(3,5,10,0.9) 72%)' }} />
      <Shake at={[8]} amp={12}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `scale(${push})` }}>
          <div style={{ width: 390, height: 140, position: 'relative', transform: 'scale(3.3)', fontFamily: 'Inter, sans-serif', color: C.white }}>
            <Hud time="08:14" filled={filled} score={101} flash={filled ? 0 : -1} />
          </div>
        </AbsoluteFill>
      </Shake>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 790, display: 'flex', justifyContent: 'center', opacity: clamp(toast), transform: `translateY(${(1 - toast) * 40}px)` }}>
        <div style={{ padding: '20px 40px', borderRadius: 22, background: 'rgba(14,20,36,0.95)', border: '1px solid rgba(255,255,255,0.15)', fontFamily: 'Inter, sans-serif', fontSize: 38, fontWeight: 600, color: C.white, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>Someone has been compromised</div>
      </div>
      {frame >= 8 && frame < 14 && <GlitchBars amount={1 - (frame - 8) / 6} seed={frame} />}
      <Flash at={8} dur={6} peak={0.4} color={C.red} />
      <Vignette />
    </AbsoluteFill>
  );
};

/* ───────── 25–27 s: SYSTEMS JAMMED ───────── */
export const Jam: React.FC = () => {
  const frame = useCurrentFrame();
  const HIT = 9;
  const jammed = frame >= HIT;
  const g = jammed ? Math.max(0.12, 1 - (frame - HIT) / 18) : 0;
  const jx = (k: number) => (hash(frame * 3 + k) - 0.5) * 40 * g;
  const cam: Cam = { x: CX, y: CY, zoom: kf(frame, [[HIT, 0.95], [60, 1.05]], (t) => t), tilt: 40, rot: kf(frame, [[0, 10], [60, 4]]), cy: 560 };
  const pins: Pin[] = MAPDATA.pins.map((p, i) => ({ id: `p${i}`, x: p[0], y: p[1], drop: 1, kind: 'locked' }));
  const secs = frame < 42 ? 30 : 29;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {!jammed ? (
        <AbsoluteFill>
          <Img src={staticFile('map/base.png')} style={{ position: 'absolute', width: 3000, left: -540, top: -960, filter: 'blur(14px) brightness(0.55)' }} />
          <AbsoluteFill style={{ background: 'radial-gradient(1100px 900px at 50% 50%, rgba(46,139,255,0.22), rgba(3,5,10,0.85) 72%)' }} />
          <Pattern frame={0} litUpTo={2} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill>
          <CityMap cam={cam} tone="red" zone={1} regions={0.4} pins={pins} baseOpacity={0.7} />
          <AbsoluteFill style={{ background: 'rgba(10,2,2,0.55)' }} />
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `translateX(${jx(1)}px)` }}>
            {[
              ['#ff2a3a', -8 * g - 2],
              ['#29d3ff', 8 * g + 2],
              ['#ffffff', 0],
            ].map(([col, dx], k) => (
              <div key={k} style={{ position: k === 2 ? 'relative' : 'absolute', transform: `translateX(${dx}px)`, mixBlendMode: k === 2 ? 'normal' : 'screen', opacity: k === 2 ? 1 : 0.75, textAlign: 'center' }}>
                <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 190, lineHeight: 0.95, color: col as string, letterSpacing: '0.02em', textShadow: k === 2 ? `0 0 60px ${C.red}` : undefined }}>SYSTEMS</div>
                <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 190, lineHeight: 0.95, color: k === 2 ? C.red : (col as string), letterSpacing: '0.02em' }}>JAMMED</div>
              </div>
            ))}
            <div style={{ position: 'absolute', top: 760, fontFamily: mono, fontWeight: 700, fontSize: 64, color: C.white, letterSpacing: 6 }}>00:{secs}</div>
            <div style={{ position: 'absolute', top: 850, fontFamily: mono, fontSize: 22, color: C.redHi, letterSpacing: '0.3em' }}>TASKS LOCKED · MINIGAMES RESET</div>
          </AbsoluteFill>
          <GlitchBars amount={g} seed={frame} />
        </AbsoluteFill>
      )}
      <Flash at={HIT} dur={5} peak={0.7} color={C.red} />
      <Vignette />
    </AbsoluteFill>
  );
};

/* ───────── 27–29 s: the fake task ───────── */
const Ghost: React.FC<{ t: number }> = ({ t }) => {
  const bounce = Math.abs(Math.sin(t / 3.2)) * 26;
  const wob = Math.sin(t / 2.2) * 7;
  return (
    <svg width={300} height={325} viewBox="0 0 120 130" style={{ transform: `translateY(${-bounce}px) rotate(${wob}deg)`, filter: 'drop-shadow(0 0 24px rgba(255,255,255,0.45))' }}>
      <path d="M60 6 C30 6 14 28 14 56 V112 L26 102 L38 114 L50 102 L60 114 L70 102 L82 114 L94 102 L106 112 V56 C106 28 90 6 60 6 Z" fill="#eef3ff" />
      <path d="M38 52 Q44 44 50 52 M70 52 Q76 44 82 52" fill="none" stroke="#0a0e18" strokeWidth={5} strokeLinecap="round" />
      <path d="M44 66 Q60 88 76 66 Z" fill="#0a0e18" />
      <path d="M50 74 Q60 82 70 74" fill="#ff5d8f" />
      <circle cx={30} cy={62} r={5} fill="#ff9fbf" opacity={0.6} />
      <circle cx={90} cy={62} r={5} fill="#ff9fbf" opacity={0.6} />
    </svg>
  );
};

export const Fake: React.FC = () => {
  const frame = useCurrentFrame();
  const CUT = 28;
  const r = ROUTES.toPin[5];
  const fakeAt = r.at(r.length);
  if (frame < CUT) {
    const s = r.length * kf(frame, [[6, 0.45], [CUT, 0.93]], (t) => t);
    const luna = r.at(s);
    const cam: Cam = { x: fakeAt.x, y: fakeAt.y + 40, zoom: kf(frame, [[0, 2.4], [CUT, 2.0]], outCubic), tilt: 38, rot: 14, cy: 540 };
    const drop = prog(frame, 6, 14);
    return (
      <AbsoluteFill>
        <CityMap cam={cam} tone="red" zone={1} regions={0.3} pins={[{ id: 'fake', x: fakeAt.x, y: fakeAt.y, drop, kind: 'fake', scale: 1.5 }]} dots={[{ id: 'luna', x: luna.x, y: luna.y, color: CAST[5].accent, size: 14, trail: r.slice(Math.max(0, s - 140), s, 5), label: 'LUNA' }]} />
        {/* placement crosshair */}
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: 1 - prog(frame, 8, 6) }}>
          <circle cx={W / 2} cy={540} r={60} fill="none" stroke={C.red} strokeWidth={3} />
          <path d={`M${W / 2 - 90} 540 H${W / 2 - 30} M${W / 2 + 30} 540 H${W / 2 + 90} M${W / 2} 450 V510 M${W / 2} 570 V630`} stroke={C.red} strokeWidth={3} />
        </svg>
        <Super at={10} text="Fake task planted" sub="phantom · zero points" color={C.redHi} y={830} />
        <Vignette />
      </AbsoluteFill>
    );
  }
  const l = frame - CUT;
  const pop = prog(l, 0, 10, outBack);
  return (
    <AbsoluteFill style={{ background: '#060a14' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(900px 700px at 50% 50%, rgba(46,139,255,0.35), transparent 70%)' }} />
      <Shake at={[0]} amp={14}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ transform: `scale(${0.85 + pop * 0.15})`, opacity: clamp(pop * 2), display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Ghost t={l} />
            <div style={{ fontFamily: grotesk, fontWeight: 700, fontSize: 96, color: C.white, textAlign: 'center', lineHeight: 1.02, marginTop: 30, textShadow: '0 0 40px rgba(46,139,255,0.6)' }}>
              You got fooled
              <br />
              by a fake task!
            </div>
            <div style={{ marginTop: 30, fontFamily: mono, fontWeight: 700, fontSize: 34, color: C.amber, padding: '10px 28px', border: `2px solid ${C.amber}`, borderRadius: 999 }}>+0 POINTS</div>
          </div>
        </AbsoluteFill>
      </Shake>
      <Flash at={0} dur={6} peak={0.6} />
      <Vignette />
    </AbsoluteFill>
  );
};

/* ───────── 29–31 s: camouflage ───────── */
export const Camo: React.FC = () => {
  const frame = useCurrentFrame();
  const TAP = 16;
  const wipe = prog(frame, TAP + 2, 16, inOutCubic);
  const visorT = prog(frame, TAP + 4, 10, inOutCubic);
  const ring = prog(frame, TAP, 12, outExpo);
  return (
    <AbsoluteFill style={{ background: '#030409' }}>
      <AbsoluteFill style={{ background: `linear-gradient(90deg, ${mix('#3a0606', '#06204a', visorT)}aa, transparent 60%)` }} />
      <div style={{ position: 'absolute', left: 150, top: 220, transform: `translateX(${kf(frame, [[0, -30], [60, 20]], (t) => t)}px)` }}>
        <Crewmate accent={CAST[1].accent} visor={mix(C.red, C.blueHi, visorT)} visorGlow={1.4} lit={0.9} size={640} breathe={frame} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 690, textAlign: 'center', fontFamily: mono, fontSize: 22, letterSpacing: '0.4em', color: mix(C.redHi, C.blueHi, visorT) }}>RAVEN</div>
      </div>
      <div style={{ position: 'absolute', right: 230, top: 80 }}>
        <Phone width={400} glow={mix(C.red, C.blue, wipe)} tilt={[3, -12, 0]}>
          {/* imposter UI */}
          <div style={{ position: 'absolute', inset: 0, background: '#0D0505' }}>
            <Hud time="06:52" filled={1} score={101} red />
            <PhoneMap red />
            <div style={{ position: 'absolute', left: 12, right: 12, top: 470, ...UI.cardRed, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 96, height: 96, borderRadius: 48, border: `6px solid ${C.red}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontWeight: 700, fontSize: 15 }}>INFECT</div>
                <div style={{ fontSize: 15, color: '#e8b0b0' }}>Recharging · 01:12</div>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 18 }}>
                {['STOP', 'FAKE', 'CAMO'].map((a) => (
                  <div key={a} style={{ width: 64, height: 64, borderRadius: 32, border: `5px solid ${C.red}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontWeight: 700, fontSize: 13, transform: a === 'CAMO' && frame >= TAP && frame < TAP + 4 ? 'scale(0.9)' : undefined, background: a === 'CAMO' && frame >= TAP ? 'rgba(255,59,59,0.25)' : undefined }}>
                    {a}
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: mono, fontSize: 13, color: C.red, letterSpacing: 2, marginTop: 16 }}>IMPOSTER · CAMOUFLAGE</div>
            </div>
          </div>
          {/* crew UI revealed by the wipe */}
          <div style={{ position: 'absolute', inset: 0, background: '#05070D', clipPath: `circle(${wipe * 1000}px at 290px 600px)` }}>
            <Hud time="06:52" filled={1} score={101} />
            <PhoneMap />
            <div style={{ position: 'absolute', left: 12, right: 12, top: 470, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <TaskCard title="Centre · Region B" sub="Head to the area" dist="173 m" icon="🧭" arrow={160} />
              <TaskCard title="W · Region C" sub="Walk to the pin" dist="28 m" icon="📍" arrow={40} />
              <TaskCard title="W · Region A" sub="Head to the area" dist="166 m" icon="🧭" arrow={-90} />
            </div>
          </div>
          {ring > 0 && ring < 1 && <div style={{ position: 'absolute', left: 290 - 40 - ring * 120, top: 600 - 40 - ring * 120, width: 80 + ring * 240, height: 80 + ring * 240, borderRadius: '50%', border: `4px solid rgba(255,255,255,${1 - ring})` }} />}
        </Phone>
      </div>
      <Super at={26} text="Camouflage" sub="look exactly like crew" color={C.blueHi} x={150} y={110} />
      <Flare at={TAP + 4} x={1500} y={600} color={C.blueHi} />
      <Vignette />
    </AbsoluteFill>
  );
};

/* ───────── 31–32 s: escalation ───────── */
export const Escalate: React.FC = () => {
  const frame = useCurrentFrame();
  const fills = [4, 11, 18];
  const n = 1 + fills.filter((x) => frame >= x).length;
  const red = prog(frame, 22, 8, inCubic);
  return (
    <AbsoluteFill style={{ background: '#050205' }}>
      <Shake at={fills} amp={22}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `scale(${kf(frame, [[0, 1], [30, 1.25]], inCubic)})` }}>
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 120, color: frame % 8 < 4 ? C.red : C.white, letterSpacing: 8, marginBottom: 60 }}>02:14</div>
          <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
            {Array.from({ length: 6 }, (_, i) => {
              const on = i < n;
              const passed = fills.filter((q) => frame >= q);
              const fresh = passed.length > 0 && i === passed.length && frame - passed[passed.length - 1] < 6;
              return (
                <React.Fragment key={i}>
                  <div style={{ width: 150, height: 150, borderRadius: 26, border: `6px solid ${on ? C.red : 'rgba(255,255,255,0.3)'}`, background: on ? C.red : 'transparent', boxShadow: on ? `0 0 ${fresh ? 120 : 50}px ${C.red}` : 'none', transform: fresh ? 'scale(1.12)' : undefined }} />
                  {i === 4 && <div style={{ width: 12, height: 210, borderRadius: 6, background: '#fff', boxShadow: '0 0 30px #fff' }} />}
                </React.Fragment>
              );
            })}
          </div>
        </AbsoluteFill>
      </Shake>
      {fills.map((x) => (
        <Flash key={x} at={x} dur={5} peak={0.35} color={C.red} />
      ))}
      <AbsoluteFill style={{ background: C.red, opacity: red * 0.85 }} />
      <Vignette strength={0.9} />
    </AbsoluteFill>
  );
};

void inOutCubic;
void outCubic;
