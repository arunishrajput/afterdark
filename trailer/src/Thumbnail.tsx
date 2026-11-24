import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, grotesk, mono } from './theme';
import { Scanlines, Vignette } from './kit';
import { Cam, City, Item, MapStage } from './world';

/** YouTube thumbnail, logo first (render at scale 0.6667 for 1280×720). */
export const Thumbnail: React.FC = () => {
  const cam: Cam = { tilt: 60, rot: -18, zoom: 1.3, x: 0, y: -60 };
  const items: Item[] = [
    { kind: 'orb', x: -620, y: 160, color: C.blue, size: 0.9, beam: 200 },
    { kind: 'orb', x: -300, y: -260, color: C.blue, size: 0.8, beam: 200 },
    { kind: 'orb', x: 640, y: 120, color: C.red, size: 1.1, beam: 220, pulse: true },
    { kind: 'orb', x: 380, y: -300, color: C.red, size: 0.8, beam: 200 },
  ];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.32 }}>
        <MapStage cam={cam} tone="blue" items={items}>
          <City />
        </MapStage>
      </div>
      <AbsoluteFill style={{ background: 'radial-gradient(900px 700px at 20% 50%, rgba(46,139,255,0.40), transparent 70%), radial-gradient(900px 700px at 80% 50%, rgba(255,59,59,0.42), transparent 70%)' }} />
      <Vignette />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Img src={staticFile('brand/afterdark-logo.png')} style={{ width: 1560, marginTop: 30, mixBlendMode: 'lighten', filter: 'drop-shadow(0 0 70px rgba(255,59,59,0.5)) drop-shadow(0 0 50px rgba(46,139,255,0.4))' }} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 26, display: 'flex', justifyContent: 'center' }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 30, letterSpacing: 10, color: '#fff', padding: '10px 36px', border: '3px solid #fff', borderRadius: 999, background: 'rgba(0,0,0,0.5)', boxShadow: '0 0 40px rgba(255,255,255,0.35)' }}>OFFICIAL TRAILER</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 26, textAlign: 'center', fontFamily: grotesk, fontWeight: 700, fontSize: 58, letterSpacing: 6, color: '#fff', textTransform: 'uppercase', textShadow: '0 6px 30px rgba(0,0,0,0.9)' }}>
        Among Us. <span style={{ color: C.red }}>On your feet.</span>
      </div>
      <Scanlines o={0.04} />
    </AbsoluteFill>
  );
};
