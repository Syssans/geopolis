/**
 * Confiance des partenaires : le commerce d'un nœud ne passe par vos ports que si les autres marchands y trouvent
 * leur compte. Un pays instable, mal vu de ses voisins commerçants ou qui attaque les autres voit ses recettes
 * commerciales fondre : les navires se détournent, les assureurs relèvent leurs primes, les investisseurs partent.
 */
import { rel, warsOf } from './state';
import type { TradeReport } from './trade';
import type { GameState, Id } from './types';

export const MAX_DISTRUST = 0.6;

export interface Trust {
  /** Part des recettes commerciales perdue (0 → 0,6). */
  loss: number;
  stability: number;
  relations: number;
  aggression: number;
  /** Relations moyennes avec les partenaires des nœuds où l'on commerce (pondérées par leur poids). */
  avgRel: number;
}

/** Relations moyennes avec les autres nations qui pèsent dans les nœuds d'où l'on tire ses recettes. */
export function partnerRelations(s: GameState, report: TradeReport, id: Id): number {
  const byNode = report.income[id]?.byNode ?? {};
  let sum = 0;
  let weight = 0;
  for (const [node, got] of Object.entries(byNode)) {
    const power = report.nodes[node]?.power ?? {};
    const others = Object.entries(power).filter(([o]) => o !== id && s.nations[o]?.alive);
    const tot = others.reduce((a, [, p]) => a + p, 0);
    if (tot <= 0) continue;
    for (const [o, p] of others) {
      const k = got * (p / tot);
      sum += rel(s, id, o) * k;
      weight += k;
    }
  }
  return weight > 0 ? sum / weight : 0;
}

export function tradeTrust(s: GameState, report: TradeReport, id: Id): Trust {
  const n = s.nations[id];
  const stability = Math.max(0, (50 - n.stability) / 50) * 0.35;
  const avgRel = partnerRelations(s, report, id);
  const relations = Math.min(1, Math.max(0, (25 - avgRel) / 125)) * 0.35;
  const offensive = warsOf(s, id).filter((w) => w.attackers.includes(id)).length;
  const aggression = Math.min(0.2, offensive * 0.08);
  const loss = Math.min(MAX_DISTRUST, stability + relations + aggression);
  return { loss, stability, relations, aggression, avgRel };
}
