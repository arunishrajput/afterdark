import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Lineup, MapReveal, Reveal } from './act1';
import { Boxes, Camo, Escalate, Fake, Infect, Jam, Navigate, Scatter, Visor } from './act2';
import { Accuse, Alarm, Breath, Converge, Eject, Finale, Montage } from './act3';
import { Grain, TitleCard } from './fx';
import { Games } from './games';
import { C, f, scene, SceneId } from './lib';

const S: React.FC<{ id: SceneId; to?: SceneId; children: React.ReactNode }> = ({ id, to, children }) => {
  const a = scene(id)[0];
  const b = scene(to ?? id)[1];
  return (
    <Sequence from={f(a)} durationInFrames={f(b) - f(a)} name={id}>
      {children}
    </Sequence>
  );
};

export const Cine: React.FC<{ withAudio?: boolean }> = ({ withAudio = true }) => (
  <AbsoluteFill style={{ background: C.bg }}>
    {withAudio && <Audio src={staticFile('music.wav')} />}
    <S id="mapReveal"><MapReveal /></S>
    <S id="card1"><TitleCard dur={f(1.5)} lines={[['Eight players.'], ['One city.']]} /></S>
    <S id="lineup"><Lineup /></S>
    <S id="card2"><TitleCard dur={f(1.5)} tone="red" lines={[['Two of them'], [['are lying.', C.red]]]} /></S>
    <S id="reveal"><Reveal /></S>
    <S id="scatter"><Scatter /></S>
    <S id="navigate"><Navigate /></S>
    <S id="games"><Games /></S>
    <S id="visor"><Visor /></S>
    <S id="infect"><Infect /></S>
    <S id="boxes"><Boxes /></S>
    <S id="jam"><Jam /></S>
    <S id="fake"><Fake /></S>
    <S id="camo"><Camo /></S>
    <S id="escalate"><Escalate /></S>
    <S id="alarm"><Alarm /></S>
    <S id="converge"><Converge /></S>
    <S id="accuse"><Accuse /></S>
    <S id="eject"><Eject /></S>
    <S id="breath"><Breath /></S>
    <S id="montage"><Montage /></S>
    <S id="logo" to="cta"><Finale /></S>
    <Grain />
  </AbsoluteFill>
);
