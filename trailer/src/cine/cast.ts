import { MAPDATA } from './CityMap';

export interface Player {
  name: string;
  accent: string;
  imp?: boolean;
}
export const CAST: Player[] = [
  { name: 'NOVA', accent: '#2E8BFF' },
  { name: 'RAVEN', accent: '#A77BFF', imp: true },
  { name: 'KAI', accent: '#3BE8B0' },
  { name: 'MIRA', accent: '#FF9F1C' },
  { name: 'ZED', accent: '#FF7A45', imp: true },
  { name: 'LUNA', accent: '#FF5D8F' },
  { name: 'ORION', accent: '#E6E8EE' },
  { name: 'PIXEL', accent: '#FFE45C' },
];

/** Positions around the Base, for a lobby huddle. */
export const huddle = (i: number, r = 34): [number, number] => {
  const a = (i / CAST.length) * Math.PI * 2 - Math.PI / 2;
  return [MAPDATA.base[0] + Math.cos(a) * r, MAPDATA.base[1] + Math.sin(a) * r];
};
