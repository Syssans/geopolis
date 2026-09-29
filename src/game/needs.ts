/** Besoins de la population : consommation mensuelle par point de développement. */
import type { Good } from '../data/trade';
import { devOf } from './state';
import type { GameState, Id } from './types';

export const NEEDS: Partial<Record<Good, number>> = { cereales: 0.003, petrole: 0.003, gaz: 0.0015, industrie: 0.0025 };

export function needsOf(s: GameState, id: Id): Partial<Record<Good, number>> {
  const dev = devOf(s, id);
  const res: Partial<Record<Good, number>> = {};
  for (const [g, k] of Object.entries(NEEDS) as [Good, number][]) res[g] = Math.round(dev * k * 100) / 100;
  return res;
}
