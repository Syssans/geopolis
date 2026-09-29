/** Besoins de la population : consommation mensuelle par point de développement. */
import type { Good } from '../data/trade';
import { devOf } from './state';
import { TIERS, tierNeeds } from '../data/tiers';
import type { GameState, Id } from './types';

/** Besoins de base (niveau 3), gardés pour l'affichage des libellés. */
export const NEEDS: Partial<Record<Good, number>> = tierNeeds(3);

/** Besoins mensuels de la population selon son développement et son niveau de vie. */
export function needsOf(s: GameState, id: Id): Partial<Record<Good, number>> {
  const dev = devOf(s, id);
  const res: Partial<Record<Good, number>> = {};
  for (const [g, k] of Object.entries(tierNeeds(s.nations[id].tier ?? 3)) as [Good, number][]) res[g] = Math.round(dev * k * 100) / 100;
  return res;
}

/** Coût mensuel de fonctionnement de l'État : il croît avec le développement et le niveau de vie. */
export function adminCost(s: GameState, id: Id): number {
  return devOf(s, id) * TIERS[(s.nations[id].tier ?? 3) - 1].admin;
}
