import { processPeace, runAI } from './ai';
import { maybeRandomEvent } from './events';
import { generateOffers, processContracts, setMarketCapture } from './contracts';
import { monthlyConvoys } from './convoys';
import { aiOrgs, monthlyOrgs } from './orgs';
import { sanctionsPressure } from './sanctions';
import { tradeTrust } from './trust';
import { AUSTERITY_CUT, inAusterity, monthlyFinance } from './finance';
import { adminCost } from './needs';
import { consumeNeeds, processPurchases } from './purchases';
import { contractCrises, marketCrisis, runRival } from './crises';
import { processMissions } from './missions';
import { monthlyDevelopment, monthlyWorks } from './economy';
import { monthlyReligion } from './religion';
import { rand } from './rng';
import { alive, atWar, clamp, invalidate, log, nm, owned, warsOf } from './state';
import { computeTrade, recordPrices, updatePrices } from './trade';
import { checkElimination, involvesNuclearClash, resolveWarMonth } from './war';
import { GOODS } from '../data/trade';
import type { GameState, World } from './types';

/** Avance la simulation d'un mois. */
export function advanceMonth(s: GameState, w: World) {
  const ctx = monthEconomy(s, w);
  if (ctx) monthPolitics(s, w, ctx);
}

export interface MonthContext {
  news: ReturnType<typeof processContracts>['news'];
}

/**
 * Première moitié du mois : commerce, revenus, guerres, religion. L'interface peut laisser passer une image
 * avant la seconde moitié (`monthPolitics`) pour que l'animation ne se fige pas. `null` : partie terminée.
 */
export function monthEconomy(s: GameState, w: World): MonthContext | null {
  if (s.gameOver) return null;

  // Commerce et revenus
  s.prevPrices = { ...s.prices };
  updatePrices(s, w, () => rand(s));
  recordPrices(s);
  monthlyWorks(s, w);
  const report = computeTrade(s, w);
  setMarketCapture(s, w, report);
  const escortsLeft = Math.floor(s.nations[s.player].navy) - s.contracts.reduce((a, c) => a + c.escort, 0);
  const bought = processPurchases(s, w, escortsLeft);
  const contracts = processContracts(s, w);
  s.needs = consumeNeeds(s, w, contracts.delivered, bought.cost);
  if (bought.news.pirated.length) log(s, `🏴‍☠️ Pirates : ${bought.news.pirated.length} cargaison(s) achetée(s) saisie(s) ce mois (${[...new Set(bought.news.pirated.map((p) => `${GOODS[p.good].icon} de ${nm(s, p.seller)}`))].join(', ')}).`, 'trade', [s.player]);
  for (const p of bought.news.blocked) if (p.blocked === 1) log(s, `⛔ Votre achat auprès de ${nm(s, p.seller)} est bloqué par un détroit fermé : changez d’itinéraire.`, 'trade', [s.player]);
  const ranked = alive(s)
    .map((n) => ({ id: n.id, v: (report.income[n.id]?.trade ?? 0) + (report.income[n.id]?.tolls ?? 0) }))
    .sort((a, b) => b.v - a.v);
  const topTraders = new Set(ranked.slice(0, 10).map((x) => x.id));

  const pressure = sanctionsPressure(s);
  for (const n of alive(s)) {
    const inc = { ...(report.income[n.id] ?? { production: 0, trade: 0, tolls: 0, byNode: {} }) };
    const upkeep = n.army * n.upkeepRate + n.navy * n.upkeepRate * 2;
    const fromContracts = n.id === s.player ? contracts.revenue : 0;
    // Sanctions : marchés d'exportation fermés, commerce étranglé, pénuries
    const sp = pressure.get(n.id);
    n.sanctions = sp && sp.p > 0.01 ? sp : undefined;
    let lostSanctions = 0;
    if (n.sanctions) {
      const p = n.sanctions.p;
      lostSanctions = inc.production * 0.6 * p + inc.trade * p + fromContracts * 0.3 * p;
      inc.production *= 1 - 0.6 * p;
      inc.trade *= 1 - p;
      n.stability = clamp(n.stability - 0.8 * p, 0, 100);
    }
    // Défiance des partenaires : instabilité, mauvaises relations et agressions détournent le commerce
    // Recalculée chaque mois pour le joueur, tous les six mois (en décalé) pour l'IA : c'est coûteux
    const stale = n.id === s.player || !n.trust || (s.month + n.id.length) % 6 === 0;
    const trust = stale ? tradeTrust(s, report, n.id) : n.trust!;
    n.trust = trust;
    const lostTrust = inc.trade * trust.loss;
    inc.trade -= lostTrust;
    // Guerre : blocus naval de l'ennemi et lassitude de la population
    let lostWar = 0;
    const wars = warsOf(s, n.id);
    if (wars.length) {
      const foes = new Set(wars.flatMap((wr) => (wr.attackers.includes(n.id) ? wr.defenders : wr.attackers)));
      const enemyNavy = [...foes].reduce((a, f) => a + (s.nations[f]?.navy ?? 0), 0);
      const blockade = Math.min(0.5, (enemyNavy / (enemyNavy + n.navy + 1)) * 0.6);
      const weary = Math.min(0.3, n.exhaustion / 300);
      lostWar = inc.trade * blockade + inc.tolls * blockade + inc.production * weary;
      inc.trade *= 1 - blockade;
      inc.tolls *= 1 - blockade;
      inc.production *= 1 - weary;
    }
    const admin = adminCost(s, n.id) * (n.id === s.player && inAusterity(s) ? 1 - AUSTERITY_CUT : 1);
    n.income = { ...inc, contracts: fromContracts * (1 - 0.3 * (n.sanctions?.p ?? 0)), upkeep, sanctions: lostSanctions, war: lostWar, admin, distrust: lostTrust };
    n.treasury += inc.production + inc.trade + inc.tolls + n.income.contracts - upkeep - admin;
    // Dette : intérêts, faillite, crise de la dette
    n.income.interest = monthlyFinance(s, n);

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
  // Le niveau de vie fait grandir (ou reculer) le développement des provinces
  monthlyDevelopment(s, w);
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
    return null;
  }
  return { news: contracts.news };
}

/** Seconde moitié du mois : décisions de l'IA, organisations, offres, crises, missions, convois. */
export function monthPolitics(s: GameState, w: World, ctx: MonthContext) {
  runAI(s, w);
  monthlyOrgs(s, w);
  aiOrgs(s, w);
  // Le joueur : offres commerciales, rival, crises, missions
  generateOffers(s, w);
  contractCrises(s, w, ctx.news);
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

/** Influence gagnée chaque mois : 4, +1 parmi les 10 premiers commerçants, +1 meneur de bloc, +1 par 3 contrats (joueur, +2 au plus). */
export function influenceGain(s: GameState, id: string, top?: Set<string>): number {
  const n = s.nations[id];
  if (!top) {
    const ranked = alive(s)
      .map((x) => ({ id: x.id, v: x.income.trade + x.income.tolls }))
      .sort((a, b) => b.v - a.v);
    top = new Set(ranked.slice(0, 10).map((x) => x.id));
  }
  const deals = id === s.player ? Math.min(2, Math.floor(s.contracts.length / 3)) : 0;
  return 4 + (top.has(id) ? 1 : 0) + (n.bloc && s.blocs[n.bloc]?.leader === id ? 1 : 0) + deals;
}
