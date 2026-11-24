import { Composition } from 'remotion';
import { Trailer } from './Trailer';
import { FPS, TOTAL } from './theme';

export const Root: React.FC = () => (
  <Composition id="Trailer" component={Trailer} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
