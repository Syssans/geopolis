/**
 * Contrats d'achat, stocks et besoins de la population.
 * Le joueur peut acheter à l'étranger une quantité mensuelle à prix verrouillé : pour nourrir et chauffer
 * sa population, ou pour revendre (au comptant ou via ses contrats de vente) quand le cours monte.
 */
import { inDefault, tierBlocked } from './finance';
import { GOODS, type Good } from '../data/trade';
import { capacity, blockedStraits, storedUnits, findRoutes, piracyRisk, sourceNode, type Result } from './contracts';
import { rand } from './rng';
import { addRel, alive, clamp, devOf, embargoes, log, nm, marketAdvantage, rel, warBetween } from './state';
import { homeNode, straitOwner, TOLL, unitPrice } from './trade';
import type { GameState, Id, NeedLine, NeedsReport, Purchase, Route, World } from './types';

/** Consommation mensuelle par point de développement. */
export { NEEDS, needsOf } from './needs';
import { needsOf } from './needs';
import { TIERS } from '../data/tiers';
export const NEED_LABEL: Partial<Record<Good, string>> = {
  cereales: 'Nourrir la population',
  petrole: 'Carburants et transports',
  gaz: 'Chauffage et électricité',
  industrie: 'Biens de consommation',
  uranium: 'Électricité nucléaire',
};
/** Surcoût des achats d'urgence au marché. */
export const EMERGENCY = 0.25;
/** Écart achat/vente au comptant. */
export const SPOT_BUY = 0.05;
export const SPOT_SELL = 0.03;
/** Coût mensuel de stockage (part de la valeur). */
export const STORAGE = 0.01; // doublé au-delà de 6 mois de production et de besoins
/** Part de sa production qu'un pays accepte d'exporter. */
const EXPORTABLE = 0.5;

/** Unités achetées chaque mois par contrat, par marchandise. */
export function purchased(s: GameState): Partial<Record<Good, number>> {
  const r: Partial<Record<Good, number>> = {};
  for (const p of s.purchases) r[p.good] = (r[p.good] ?? 0) + p.volume;
  return r;
}

/** Ce qu'un pays peut encore vendre au joueur chaque mois. */
export function exportable(s: GameState, w: World, seller: Id, good: Good): number {
  const cap = (capacity(s, w, seller)[good] ?? 0) * EXPORTABLE;
  const taken = s.purchases.filter((p) => p.seller === seller && p.good === good).reduce((a, p) => a + p.volume, 0);
  return Math.max(0, Math.round((cap - taken) * 100) / 100);
}

export interface Quote {
  ok: boolean;
  reason?: string;
  unitPrice: number; // prix proposé par unité
  markup: number; // marge exigée sur le cours
  max: number; // quantité maximale par mois
  routes: Route[];
}

/** Conditions d'un fournisseur : marge selon les relations, quantité selon sa production. */
export function quote(s: GameState, w: World, seller: Id, good: Good): Quote {
  const r = rel(s, s.player, seller);
  const markup = Math.round(clamp(0.15 - r / 500 + (s.rival === seller ? 0.15 : 0) + (s.nations[s.player].sanctions?.p ?? 0) * 0.5 - marketAdvantage(s, s.player, seller), 0.02, 0.8) * 100) / 100;
  const price = Math.round(unitPrice(s, good) * (1 + markup) * 1000) / 1000;
  const max = exportable(s, w, seller, good);
  const from = sourceNode(s, w, seller, good);
  const to = homeNode(s, w, s.player);
  const routes = from && to && from !== to ? findRoutes(from, to) : from && to ? [{ nodes: [from], straits: [], piracy: [] }] : [];
  const base = { unitPrice: price, markup, max, routes };
  if (seller === s.player) return { ...base, ok: false, reason: 'C’est vous' };
  if (inDefault(s)) return { ...base, ok: false, reason: 'Défaut de paiement : plus personne ne vous fait crédit' };
  if (warBetween(s, s.player, seller)) return { ...base, ok: false, reason: 'En guerre' };
  if (embargoes(s, seller, s.player) || embargoes(s, s.player, seller)) return { ...base, ok: false, reason: 'Embargo' };
  if (r < -30) return { ...base, ok: false, reason: 'Relations trop mauvaises (< −30)' };
  if (s.rival === seller && r < 20) return { ...base, ok: false, reason: 'Votre rival refuse de vous vendre (relations < 20)' };
  if (max < 0.01) return { ...base, ok: false, reason: 'Aucune production disponible' };
  if (!routes.length) return { ...base, ok: false, reason: 'Aucun itinéraire' };
  return { ...base, ok: true };
}

/** Meilleurs fournisseurs d'une marchandise (les moins chers d'abord). */
export function suppliers(s: GameState, w: World, good: Good, limit = 6): { id: Id; q: Quote }[] {
  return alive(s)
    .filter((n) => n.id !== s.player && (capacity(s, w, n.id)[good] ?? 0) > 0.05)
    .map((n) => ({ id: n.id, q: quote(s, w, n.id, good) }))
    .sort((a, b) => Number(b.q.ok) - Number(a.q.ok) || a.q.unitPrice - b.q.unitPrice || b.q.max - a.q.max)
    .slice(0, limit);
}

export function proposePurchase(s: GameState, w: World, seller: Id, good: Good, volume: number, months: number, routeIdx = 0): Result {
  const q = quote(s, w, seller, good);
  if (!q.ok) return { ok: false, msg: q.reason! };
  volume = Math.round(Math.min(volume, q.max) * 100) / 100;
  if (volume <= 0) return { ok: false, msg: 'Quantité nulle' };
  const monthly = volume * q.unitPrice;
  if (s.nations[s.player].treasury < monthly) return { ok: false, msg: 'Trésor insuffisant pour le premier paiement' };
  const route = q.routes[routeIdx] ?? q.routes[0];
  s.purchases.push({
    id: s.nextUid++,
    seller,
    good,
    volume,
    unitPrice: q.unitPrice,
    monthsLeft: months,
    months,
    route,
    alternatives: q.routes,
    escort: 0,
    blocked: 0,
    lastStatus: 'ok',
    lastCost: 0,
  });
  addRel(s, s.player, seller, 5);
  log(s, `📥 Contrat d’achat signé : ${nm(s, seller)} vous livrera ${fmt(volume)} ${GOODS[good].unit} de ${GOODS[good].name.toLowerCase()} par mois pendant ${months} mois.`, 'trade', [s.player]);
  return { ok: true, msg: `${nm(s, seller)} accepte : ${fmt(volume)} ${GOODS[good].unit}/mois à ${fmt(q.unitPrice)} Md$ l’unité` };
}

export function cancelPurchase(s: GameState, id: number): Result {
  const p = s.purchases.find((x) => x.id === id);
  if (!p) return { ok: false, msg: 'Contrat introuvable' };
  s.purchases = s.purchases.filter((x) => x !== p);
  addRel(s, s.player, p.seller, -10);
  return { ok: true, msg: `Contrat d’achat rompu : relations avec ${nm(s, p.seller)} −10` };
}

export function setPurchaseRoute(s: GameState, id: number, idx: number): Result {
  const p = s.purchases.find((x) => x.id === id);
  if (!p || !p.alternatives[idx]) return { ok: false, msg: 'Itinéraire indisponible' };
  p.route = p.alternatives[idx];
  p.blocked = 0;
  return { ok: true, msg: 'Convois réacheminés' };
}

/** Achat au comptant : livraison immédiate, au cours du jour + 5 %. */
export function buySpot(s: GameState, good: Good, qty: number): Result {
  const me = s.nations[s.player];
  const cost = qty * unitPrice(s, good) * (1 + SPOT_BUY);
  if (qty <= 0) return { ok: false, msg: 'Quantité nulle' };
  if (me.treasury < cost) return { ok: false, msg: 'Trésor insuffisant' };
  me.treasury -= cost;
  s.stock[good] = (s.stock[good] ?? 0) + qty;
  return { ok: true, msg: `Achat de ${fmt(qty)} ${GOODS[good].unit} : −${fmt(cost)} Md$` };
}

/** Vente au comptant d'une partie des stocks, au prix du marché − 3 %. */
export function sellSpot(s: GameState, good: Good, qty: number): Result {
  qty = Math.min(qty, s.stock[good] ?? 0);
  if (qty <= 0) return { ok: false, msg: 'Stock vide' };
  const gain = qty * unitPrice(s, good) * (1 - SPOT_SELL);
  s.stock[good] = Math.round(((s.stock[good] ?? 0) - qty) * 1000) / 1000;
  s.nations[s.player].treasury += gain;
  return { ok: true, msg: `Vente de ${fmt(qty)} ${GOODS[good].unit} : +${fmt(gain)} Md$` };
}

const fmt = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

// ————— Exécution mensuelle —————

export interface PurchaseNews {
  blocked: Purchase[];
  pirated: Purchase[];
}

/** Livraisons des contrats d'achat : paiement à l'expédition, marchandise en stock à l'arrivée. */
export function processPurchases(s: GameState, w: World, spareEscorts: number): { cost: number; news: PurchaseNews } {
  const me = s.nations[s.player];
  const news: PurchaseNews = { blocked: [], pirated: [] };
  let cost = 0;
  for (const p of s.purchases) {
    p.escort = Math.min(p.escort, Math.max(0, spareEscorts));
    spareEscorts -= p.escort;
  }
  for (const p of [...s.purchases]) {
    const seller = s.nations[p.seller];
    if (!seller.alive || warBetween(s, s.player, p.seller) || embargoes(s, p.seller, s.player) || embargoes(s, s.player, p.seller)) {
      s.purchases = s.purchases.filter((x) => x !== p);
      log(s, `Contrat d’achat avec ${seller.name} annulé (guerre ou embargo).`, 'trade', [s.player]);
      continue;
    }
    p.lastCost = 0;
    if (blockedStraits(s, w, p.route).length) {
      p.blocked++;
      p.lastStatus = 'blocked';
      news.blocked.push(p);
      if (p.blocked >= 4) {
        s.purchases = s.purchases.filter((x) => x !== p);
        log(s, `Contrat d’achat avec ${seller.name} caduc : rien n’a pu passer depuis 4 mois.`, 'trade', [s.player]);
      }
    } else {
      p.blocked = 0;
      // Le fournisseur livre ce qu'il produit encore
      const avail = Math.min(1, ((capacity(s, w, p.seller)[p.good] ?? 0) * EXPORTABLE) / Math.max(p.volume, 1e-6));
      const qty = p.volume * avail;
      const value = qty * p.unitPrice;
      const tolls = value * TOLL * p.route.straits.length;
      p.lastCost = value + tolls;
      cost += p.lastCost;
      me.treasury -= p.lastCost;
      seller.treasury += value;
      for (const st of p.route.straits) {
        const owner = straitOwner(s, w, st);
        if (owner && owner !== s.player) s.nations[owner].treasury += tolls / p.route.straits.length;
      }
      if (rand(s) < piracyRisk(p.route, p.escort, s)) {
        p.lastStatus = 'piracy';
        news.pirated.push(p);
      } else {
        p.lastStatus = 'ok';
        s.stock[p.good] = (s.stock[p.good] ?? 0) + qty;
      }
    }
    if (--p.monthsLeft <= 0 && s.purchases.includes(p)) {
      s.purchases = s.purchases.filter((x) => x !== p);
      addRel(s, s.player, p.seller, 3);
      log(s, `Contrat d’achat avec ${seller.name} arrivé à son terme.`, 'trade', [s.player]);
    }
  }
  return { cost, news };
}

/**
 * Consommation de la population, une fois les contrats de vente servis.
 * `delivered` = unités livrées aux clients ce mois (puisées d'abord dans la production, puis dans les stocks).
 */
export function consumeNeeds(s: GameState, w: World, delivered: Partial<Record<Good, number>>, purchaseCost: number): NeedsReport {
  const me = s.nations[s.player];
  const cap = capacity(s, w, s.player);
  // Les ventes au-delà de la production ont été prélevées sur les stocks
  for (const [g, d] of Object.entries(delivered) as [Good, number][]) {
    const fromStock = Math.max(0, d - (cap[g] ?? 0));
    if (fromStock > 0) s.stock[g] = Math.max(0, (s.stock[g] ?? 0) - fromStock);
  }
  const lines: Partial<Record<Good, NeedLine>> = {};
  let cost = 0;
  let expensive = false;
  for (const [g, need] of Object.entries(needsOf(s, s.player)) as [Good, number][]) {
    const free = Math.max(0, (cap[g] ?? 0) - (delivered[g] ?? 0));
    const own = Math.min(need, free);
    const fromStock = Math.min(need - own, s.stock[g] ?? 0);
    s.stock[g] = (s.stock[g] ?? 0) - fromStock;
    const market = Math.max(0, need - own - fromStock);
    const c = market * unitPrice(s, g) * (1 + EMERGENCY + (me.sanctions?.p ?? 0)); // contrebande sous sanctions
    cost += c;
    if (market > need * 0.2 && (s.prices[g] ?? 1) > 1.3) expensive = true;
    lines[g] = { need, own, stock: fromStock, market, cost: c };
  }
  // Surplus de production mis en réserve (politique de stockage)
  const stored = storedUnits(s, w);
  for (const [g, q] of Object.entries(stored) as [Good, number][]) s.stock[g] = (s.stock[g] ?? 0) + q;
  // Frais de stockage : plus chers quand les entrepôts débordent
  const needs = needsOf(s, s.player);
  for (const [g, q] of Object.entries(s.stock) as [Good, number][]) {
    if (q < 1e-4) delete s.stock[g];
    else cost += q * unitPrice(s, g) * storageRate(q, (cap[g] ?? 0) + (needs[g] ?? 0));
  }
  me.treasury -= cost;
  if (expensive) me.stability = clamp(me.stability - 0.4, 0, 100);
  updateProsperity(s, lines);
  return { lines, cost, purchases: purchaseCost, sales: 0, expensive, stored };
}

export function setPurchaseEscort(s: GameState, id: number, delta: number, used: number): Result {
  const p = s.purchases.find((x) => x.id === id);
  if (!p) return { ok: false, msg: 'Contrat introuvable' };
  if (delta > 0 && used + delta > Math.floor(s.nations[s.player].navy)) return { ok: false, msg: 'Plus de flotte disponible' };
  p.escort = Math.max(0, p.escort + delta);
  return { ok: true, msg: `Escorte : ${p.escort} flotte(s)` };
}

/** Taux mensuel de stockage : 1 % de la valeur, 2 % au-delà de 6 mois de production et de besoins. */
export function storageRate(q: number, monthly: number): number {
  return q > 6 * Math.max(monthly, 0.5) ? STORAGE * 2 : STORAGE;
}

/**
 * Satisfaction de la population : part (en valeur) des besoins couverts, les achats d'urgence ne comptant qu'à 60 %
 * (files d'attente, rationnement), et à 20 % seulement quand l'État les paie à crédit (trésor négatif : pénuries).
 * Elle fait monter ou descendre le niveau de vie.
 */
/** Poids des achats d'urgence dans la satisfaction : 0,6 (files d'attente, rationnement), 0,2 quand ils sont payés à crédit. */
export const emergencyWeight = (s: GameState) => (s.nations[s.player].treasury < 0 ? 0.2 : 0.6);

export function satisfactionOf(s: GameState, lines: Partial<Record<Good, NeedLine>>): number {
  const urgent = emergencyWeight(s);
  let want = 0;
  let got = 0;
  for (const [g, l] of Object.entries(lines) as [Good, NeedLine][]) {
    const v = unitPrice(s, g);
    want += l.need * v;
    got += (l.own + l.stock + urgent * l.market) * v;
  }
  return want > 0 ? Math.min(1, got / want) : 1;
}

function updateProsperity(s: GameState, lines: Partial<Record<Good, NeedLine>>) {
  const me = s.nations[s.player];
  const pr = (s.prosperity ??= { points: 40, satisfaction: 1, months: 0 });
  const sat = satisfactionOf(s, lines);
  pr.satisfaction = Math.round(sat * 100) / 100;
  pr.months++;
  // On progresse vite quand tout va bien, on recule plus lentement : un pays négligé décline, il ne s'effondre pas
  pr.points = clamp(pr.points + (sat - 0.8) * (sat >= 0.8 ? 15 : 8), 0, 100);
  // On ne s'enrichit pas à crédit : pas de nouveau palier avec un trésor négatif ou sous plan d'austérité
  if (tierBlocked(s)) pr.points = Math.min(pr.points, 95);
  if (sat < 0.8) me.stability = clamp(me.stability - (0.8 - sat) * 3, 0, 100);
  if (pr.points >= 100 && me.tier < TIERS.length) {
    me.tier++;
    pr.points = 25;
    me.stability = clamp(me.stability + 5, 0, 100);
    s.score += 5;
    const t = TIERS[me.tier - 1];
    log(s, `📈 Niveau de vie : votre population passe au palier « ${t.icon} ${t.name} » (+5 points). Nouveaux besoins : ${Object.keys(t.adds).map((g) => GOODS[g as Good].icon).join(' ')} — et l'État coûte plus cher.`, 'info', [s.player]);
  } else if (pr.points <= 0 && me.tier > 1) {
    me.tier--;
    pr.points = 70;
    me.stability = clamp(me.stability - 10, 0, 100);
    const t = TIERS[me.tier - 1];
    log(s, `📉 Pénuries : votre population retombe au palier « ${t.icon} ${t.name} ». Stabilité −10.`, 'war', [s.player]);
  }
}
