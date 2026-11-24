import { loadFont as loadGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';

export const FPS = 30;
export const TOTAL = 60 * FPS;
export const sec = (s: number) => Math.round(s * FPS);

export const C = {
  bg: '#04060C',
  blue: '#2E8BFF',
  blueSoft: '#7DB8FF',
  red: '#FF3B3B',
  redSoft: '#FF8A8A',
  green: '#7CFF4F',
  white: '#F4F6FB',
  muted: '#8A94B3',
  amber: '#FFB020',
};

export const grotesk = loadGrotesk('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily;
export const mono = loadMono('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily;
export const inter = loadInter('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily;
