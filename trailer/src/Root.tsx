import { Composition } from 'remotion';
import { Cine } from './cine/Cine';
import { FPS, TOTAL } from './cine/lib';
import { Thumbnail } from './Thumbnail';

export const Root: React.FC = () => (
  <>
    <Composition id="Trailer" component={Cine} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ withAudio: true }} />
    <Composition id="Thumbnail" component={Thumbnail} durationInFrames={1} fps={FPS} width={1920} height={1080} />
  </>
);
