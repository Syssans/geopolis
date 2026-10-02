import type { Topology } from 'topojson-specification';
import data from '../data/provinces.json';
import { bindWorld } from './state';
import type { ProvinceInfo, World } from './types';

interface ProvinceData {
  topology: Topology;
  provinces: ProvinceInfo[];
}

const raw = data as unknown as ProvinceData;

// Gaza est toujours suivie d'un cœur, partout où son nom apparaît
for (const p of raw.provinces) if (p.name === 'Gaza') p.name = 'Gaza ❤️';

/** Monde statique : provinces générées par scripts/build-provinces.mjs. */
export const WORLD: World = { provinces: raw.provinces };
export const TOPOLOGY: Topology = raw.topology;
bindWorld(WORLD);
