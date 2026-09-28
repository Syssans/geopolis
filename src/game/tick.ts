import { processPeace, runAI } from './ai';
import { maybeRandomEvent } from './events';
import { generateOffers, processContracts } from './contracts';
import { monthlyConvoys } from './convoys';
import { consumeNeeds, processPurchases } from './purchases';
import { contractCrises, marketCrisis, runRival } from './crises';
import { processMissions } from './missions';
import { monthlyWorks } from './economy';
import { monthlyReligion } from './religion';
import { rand } from './rng';
import { alive, atWar, clamp, invalidate, log, nm, owned } from './state';
import { computeTrade, recordPrices, updatePrices } from './trade';
import { checkElimination, involvesNuclearClash, resolveWarMonth } from './war';
import { GOODS } from '../data/trade';
import type { GameState, World } from './types';

/** Avance la simulation d'un mois. */
export function advanceMonth(s: GameState, w: World) {
  if (s.gameOver) return;

  // Commerce et revenus
  s.prevPrices = { ...s.prices };
  updatePrices(s, w, () => rand(s));
  recordPrices(s);
  monthlyWorks(s, w);
  const report = computeTrade(s, w);
  const escortsLeft = Math.floor(s.nations[s.player].navy) - s.contracts.reduce((a, c) => a + c.escort, 0);
  const bought = processPurchases(s, w, escortsLeft);
  const contracts = processContracts(s, w);
  s.needs = consumeNeeds(s, w, contracts.delivered, bought.cost);
  for (const p of bought.news.pirated) log(s, `🏴‍☠️ Des pirates ont saisi votre cargaison de ${GOODS[p.good].name.toLowerCase()} venue de ${nm(s, p.seller)}.`, 'trade', [s.player]);
  for (const p of bought.news.blocked) if (p.blocked === 1) log(s, `⛔ Votre achat auprès de ${nm(s, p.seller)} est bloqué par un détroit fermé : changez d’itinéraire.`, 'trade', [s.player]);
  const ranked = alive(s)
    .map((n) => ({ id: n.id, v: (report.income[n.id]?.trade ?? 0) + (report.income[n.id]?.tolls ?? 0) }))
    .sort((a, b) => b.v - a.v);
  const topTraders = new Set(ranked.slice(0, 10).map((x) => x.id));

  for (const n of alive(s)) {
    const inc = report.income[n.id] ?? { production: 0, trade: 0, tolls: 0, byNode: {} };
    const upkeep = n.army * n.upkeepRate + n.navy * n.upkeepRate * 2;
    const fromContracts = n.id === s.player ? contracts.revenue : 0;
    n.income = { ...inc, contracts: fromContracts, upkeep };
    n.treasury += inc.production + inc.trade + inc.tolls + fromContracts - upkeep;
    if (n.treasury < 0) {
      // Faillite : désertions et mécontentement
      n.stability = clamp(n.stability - 0.5, 0, 100);
      n.army *= 0.98;
      n.navy *= 0.98;
    }

    n.influence = Math.min(999, n.influence + influenceGain(s, n.id, topTraders));
    n.stability = clamp(n.stability + (n.baseStability - n.stability) * 0.02, 0, 100);
    n.aggression = Math.max(0, n.aggression * 0.97 - 0.2);
    if (!atWar(s, n.id)) n.exhaustion = Math.max(0, n.exhaustion - 1.5);

    if (n.cbProgress && --n.cbProgress.months <= 0) {
      const target = n.cbProgress.target;
      n.cbProgress = null;
      if (s.nations[target]?.alive) {
        n.claims.push(target);
        if (n.id === s.player) log(s, `Casus belli obtenu contre ${nm(s, target)}.`, 'war', [n.id]);
      }
    }
    if (n.nukeProgram !== null && --n.nukeProgram <= 0) {
      n.nukeProgram = null;
      n.nuclear = true;
      s.tension = clamp(s.tension + 15, 0, 100);
      log(s, `☢ ${n.name} réalise son premier essai nucléaire !`, 'war', [n.id]);
    }
  }

  // Intégration des conquêtes
  for (const p of s.provinces)
    if (p.integration < 100 && !p.occupiedBy && !p.revolt) {
      p.integration = Math.min(100, p.integration + 1);
      if (p.integration >= 100) p.core = p.owner;
    }

  // La part « historique » des relations s'efface lentement (demi-vie ≈ 19 ans)
  for (const k of Object.keys(s.relations)) {
    const v = s.relations[k] * 0.997;
    if (Math.abs(v) < 0.5) delete s.relations[k];
    else s.relations[k] = v;
  }

  // Guerres
  for (const war of s.wars) resolveWarMonth(s, w, war);
  processPeace(s, w);

  // Religion : agitation, insurrections, conversions
  monthlyReligion(s, w);
  invalidate(s);
  for (const n of alive(s)) if (!owned(s, n.id).length) checkElimination(s, n.id);

  // Tension mondiale & risque nucléaire
  const clash = s.wars.some((war) => involvesNuclearClash(s, war));
  const closed = alive(s).reduce((a, n) => a + n.closedStraits.length, 0);
  const target = 15 + 5 * s.wars.length + 8 * closed;
  s.tension = clamp(s.tension + Math.sign(target - s.tension) * 0.4, 0, 100);
  if (clash && s.tension >= 95 && rand(s) < 0.04) {
    s.gameOver = 'Escalade nucléaire : les missiles ont été lancés. Personne ne gagne une guerre nucléaire.';
    log(s, '☢ Guerre nucléaire.', 'war', [s.player]);
    return;
  }

  runAI(s, w);
  // Le joueur : offres commerciales, rival, crises, missions
  generateOffers(s, w);
  contractCrises(s, w, contracts.news);
  runRival(s, w);
  marketCrisis(s, w);
  processMissions(s, w);
  maybeRandomEvent(s, w);

  s.month++;
  if (s.month > 12) {
    s.month = 1;
    s.year++;
  }
  monthlyConvoys(s, w);
  if (!s.campaignOver && s.year >= s.endYear) {
    s.campaignOver = true;
    log(s, 'Fin de la campagne : l’heure du bilan a sonné.', 'info', [s.player]);
  }
}

/** Influence gagnée chaque mois : 3, +1 parmi les 10 premiers commerçants, +1 meneur de bloc. */
export function influenceGain(s: GameState, id: string, top?: Set<string>): number {
  const n = s.nations[id];
  if (!top) {
    const ranked = alive(s)
      .map((x) => ({ id: x.id, v: x.income.trade + x.income.tolls }))
      .sort((a, b) => b.v - a.v);
    top = new Set(ranked.slice(0, 10).map((x) => x.id));
  }
  return 3 + (top.has(id) ? 1 : 0) + (n.bloc && s.blocs[n.bloc]?.leader === id ? 1 : 0);
}
