import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { C, sec } from './theme';
import { Title } from './scenes/Intro';
import { Hook, Arena } from './scenes/Map';
import { Lineup } from './scenes/Lineup';
import { Tasks } from './scenes/Tasks';
import { Hunt } from './scenes/Hunt';
import { Meeting } from './scenes/Meet';
import { Ending } from './scenes/Ending';
import { EndCard } from './scenes/Finale';
import { Flash } from './kit';

// Scene boundaries sit on the 2 s bar lines of the 120 BPM soundtrack (audio/make-music.mjs).
const S = (from: number, to: number, c: React.ReactNode) => (
  <Sequence from={sec(from)} durationInFrames={sec(to - from)}>{c}</Sequence>
);

export const Trailer: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Audio src={staticFile('music.mp3')} volume={1} />
    {S(0, 6, <Hook />)}
    {S(6, 10, <Title />)}
    {S(10, 18, <Arena />)}
    {S(18, 26, <Lineup />)}
    {S(26, 34, <Tasks />)}
    {S(34, 44, <Hunt />)}
    {S(44, 50, <Meeting />)}
    {S(50, 56, <Ending />)}
    {S(56, 60, <EndCard />)}
    {[10, 18, 26, 34, 50].map((t) => (
      <Sequence key={t} from={sec(t)} durationInFrames={8}><Flash at={0} dur={7} peak={0.5} color={t === 34 ? C.red : '#fff'} /></Sequence>
    ))}
  </AbsoluteFill>
);
