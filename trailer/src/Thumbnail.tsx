import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { Crewmate } from './cine/actors';
import { CAST } from './cine/cast';
import { Cam, CityMap, Dot, MAPDATA, ROUTES } from './cine/CityMap';
import { Vignette } from './cine/fx';
import { C, mono } from './cine/lib';

/** YouTube thumbnail in the trailer's look (render at scale 0.6667 for 1280×720). */
export const Thumbnail: React.FC = () => {
  const cam: Cam = { x: MAPDATA.base[0] + 120, y: MAPDATA.base[1] + 80, zoom: 0.95, tilt: 58, rot: -14, cy: 620 };
  const dots: Dot[] = CAST.map((p, i) => {
    const r = ROUTES.scatter[i];
    const s = r.length * 0.72;
    const h = r.at(s);
    return { id: p.name, x: h.x, y: h.y, color: p.imp ? C.red : p.accent, size: 11, trail: r.slice(Math.max(0, s - 380), s, 8), glow: 1.6, ring: p.imp ? C.red : undefined };
  });
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <CityMap cam={cam} zone={1} regions={0.8} baseMarker={1} dots={dots} />
      <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(3,5,10,0.92) 0%, rgba(3,5,10,0.55) 38%, rgba(3,5,10,0.35) 100%)' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(700px 600px at 18% 60%, rgba(255,59,59,0.35), transparent 70%), radial-gradient(900px 700px at 70% 45%, rgba(46,139,255,0.25), transparent 70%)' }} />
      <div style={{ position: 'absolute', left: -60, top: 250 }}>
        <Crewmate accent={CAST[1].accent} visor={C.red} visorGlow={2.4} lit={1} size={1000} />
      </div>
      <Img src={staticFile('brand/afterdark-logo.png')} style={{ position: 'absolute', right: 20, top: 150, width: 1180, mixBlendMode: 'lighten', filter: 'drop-shadow(0 0 60px rgba(255,59,59,0.45)) drop-shadow(0 0 40px rgba(46,139,255,0.35))' }} />
      <div style={{ position: 'absolute', right: 0, width: 1180 + 20, top: 60, display: 'flex', justifyContent: 'center' }}>
        <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 34, letterSpacing: '0.32em', paddingLeft: '0.32em', color: '#fff', padding: '12px 40px', border: '3px solid #fff', borderRadius: 999, background: 'rgba(0,0,0,0.55)', boxShadow: '0 0 40px rgba(255,255,255,0.3)' }}>OFFICIAL TRAILER</div>
      </div>
      <Vignette strength={0.6} />
    </AbsoluteFill>
  );
};
