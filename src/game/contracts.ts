import { GOODS, STRAITS, TRADE_NODES, type Good } from '../data/trade';
import { EXTRA_LANES } from '../data/routes';
import { pick, rand } from './rng';
import { addRel, alive, devOf, embargoes, log, nm, owned, rel, warBetween } from './state';
import { goodOf, homeNode, NODES, output, straitClosed, straitOwner, TOLL, unitPrice } from './trade';
import type { Contract, ContractOffer, GameState, Id, Route, World } from './types';

/** Zones de piraterie : probabilité mensuelle d'attaque d'un convoi non escorté. */
export const PIRACY: Record<string, { name: string; risk: number }> = {
  aden: { name: 'Golfe d’Aden', risk: 0.08 },
  afrique_ouest: { name: 'Golfe de Guinée', risk: 0.06 },
  malacca: { name: 'Détroit de Malacca', risk: 0.05 },
  caraibes: { name: 'Caraïbes', risk: 0.02 },
};

const GRAPH: Map<string, string[]> = (() => {
  const g = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!g.has(a)) g.set(a, []);
    if (!g.has(b)) g.set(b, []);
    if (!g.get(a)!.includes(b)) g.get(a)!.push(b);
    if (!g.get(b)!.includes(a)) g.get(b)!.push(a);
  };
  for (const n of TRADE_NODES) for (const o of n.out) link(n.id, o);
  for (const [a, b] of EXTRA_LANES) link(a, b);
  return g;
})();

/** Détroit franchi par une étape a–b (dans un sens ou dans l'autre). */
function strait(a: string, b: string): string | undefined {
  return STRAITS.find((st) => (st.from === a && (st.to === b || st.to === '*')) || (st.from === b && (st.to === a || st.to === '*')))?.id;
}

function describe(nodes: string[]): Route {
  const straits: string[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const st = strait(nodes[i - 1], nodes[i]);
    if (st && !straits.includes(st)) straits.push(st);
  }
  return { nodes, straits, piracy: nodes.filter((n) => PIRACY[n]) };
}

/** Jusqu'à trois itinéraires distincts (par détroits franchis), du plus court au plus long. */
export function findRoutes(from: string, to: string): Route[] {
  if (from === to) return [{ nodes: [from], straits: [], piracy: PIRACY[from] ? [from] : [] }];
  const paths: string[][] = [];
  const walk = (path: string[]) => {
    const last = path[path.length - 1];
    if (last === to) {
      paths.push(path);
      return;
    }
    if (path.length > 9) return;
    for (const n of GRAPH.get(last) ?? []) if (!path.includes(n)) walk([...path, n]);
  };
  walk([from]);
  paths.sort((a, b) => a.length - b.length);
  const res: Route[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    const r = describe(p);
    const key = r.straits.slice().sort().join(',') + '|' + r.piracy.slice().sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    res.push(r);
    if (res.length === 3) break;
  }
  return res;
}

/** Unités produites chaque mois par une nation, par marchandise. */
export function capacity(s: GameState, w: World, id: Id): Partial<Record<Good, number>> {
  const cap: Partial<Record<Good, number>> = {};
  for (const pid of owned(s, id)) {
    const g = goodOf(s, w, pid);
    cap[g] = (cap[g] ?? 0) + output(s, w, pid);
  }
  return cap;
}

/** Ce que le joueur peut s'engager à livrer chaque mois : production, achats sous contrat et stocks (sur un an). */
export function supply(s: GameState, w: World): Partial<Record<Good, number>> {
  const cap = capacity(s, w, s.player);
  for (const p of s.purchases ?? []) cap[p.good] = (cap[p.good] ?? 0) + p.volume;
  // Les stocks peuvent aussi être revendus sous contrat, étalés sur un an
  for (const [g, q] of Object.entries(s.stock ?? {}) as [Good, number][]) if (q > 1e-3) cap[g] = (cap[g] ?? 0) + q / 12;
  return cap;
}

export function committed(s: GameState): Partial<Record<Good, number>> {
  const c: Partial<Record<Good, number>> = {};
  for (const k of s.contracts) c[k.good] = (c[k.good] ?? 0) + k.volume;
  return c;
}

/** Part de la production du joueur détournée vers ses contrats (elle n'entre plus dans les nœuds). */
export function divertedShare(s: GameState, w: World): Partial<Record<Good, number>> {
  const cap = capacity(s, w, s.player);
  const com = committed(s);
  const res: Partial<Record<Good, number>> = {};
  for (const g of Object.keys(com) as Good[]) res[g] = Math.min(1, (com[g] ?? 0) / Math.max(cap[g] ?? 0, 1e-6));
  return res;
}

/** Détroits bloquant un itinéraire pour le joueur. */
export function blockedStraits(s: GameState, w: World, route: Route): string[] {
  return route.straits.filter((st) => {
    const owner = straitOwner(s, w, st);
    if (!owner || owner === s.player) return false;
    if (warBetween(s, owner, s.player) || embargoes(s, owner, s.player)) return true;
    return straitClosed(s, w, st) && !(s.passes[st] > 0);
  });
}

/** Estimation des revenus mensuels nets d'un contrat sur un itinéraire. */
export function estimate(volume: number, bonus: number, route: Route, price: number) {
  const gross = volume * price * (1 + bonus);
  const tolls = gross * TOLL * route.straits.length;
  const transport = gross * 0.015 * Math.max(0, route.nodes.length - 1);
  return { gross, tolls, transport, net: gross - tolls - transport };
}

export function piracyRisk(route: Route, escort: number, s?: GameState): number {
  let safe = 1;
  for (const z of route.piracy) if (!((s?.passes[`piracy:${z}`] ?? 0) > 0)) safe *= 1 - PIRACY[z].risk * Math.pow(0.4, escort);
  return 1 - safe;
}

export function escortsUsed(s: GameState): number {
  return s.contracts.reduce((a, c) => a + c.escort, 0) + (s.purchases ?? []).reduce((a, p) => a + p.escort, 0);
}

// ————— Offres —————

export function generateOffers(s: GameState, w: World, force = false) {
  if (!force) s.offers = s.offers.filter((o) => --o.expires > 0 && s.nations[o.buyer].alive);
  if (!force && (s.offers.length >= 3 || rand(s) > 0.25)) return;
  const me = s.player;
  const cap = supply(s, w);
  const com = committed(s);
  const goods = (Object.keys(cap) as Good[]).filter(
    (g) => !s.notForSale.includes(g) && (cap[g] ?? 0) - (com[g] ?? 0) > Math.max(0.05, (cap[g] ?? 0) * 0.15),
  );
  const good = pick(s, goods);
  if (!good) return;
  const free = (cap[good] ?? 0) - (com[good] ?? 0);
  const buyers = alive(s).filter(
    (n) =>
      n.id !== me &&
      devOf(s, n.id) > 60 &&
      rel(s, me, n.id) > -40 &&
      !warBetween(s, me, n.id) &&
      !embargoes(s, me, n.id) &&
      !embargoes(s, n.id, me) &&
      !s.offers.some((o) => o.buyer === n.id) &&
      // Les acheteurs sont ceux qui produisent peu cette marchandise
      (capacity(s, w, n.id)[good] ?? 0) < devOf(s, n.id) * 0.02,
  );
  const buyer = pick(s, buyers.sort((a, b) => devOf(s, b.id) - devOf(s, a.id)).slice(0, 25));
  const from = sourceNode(s, w, me, good);
  const to = buyer && homeNode(s, w, buyer.id);
  if (!buyer || !from || !to) return;
  const market = s.prices[good] ?? 1;
  const bonus = Math.round(Math.max(0.05, 0.12 + rand(s) * 0.25 + rel(s, me, buyer.id) / 500 + (1 - market) * 0.2) * 100) / 100;
  const volume = Math.round(free * (0.3 + rand(s) * 0.4) * 100) / 100;
  const price = Math.round(unitPrice(s, good) * 1000) / 1000;
  s.offers.push({
    id: s.nextUid++,
    buyer: buyer.id,
    good,
    volume,
    bonus,
    unitPrice: price,
    months: pick(s, [12, 18, 24, 36])!,
    expires: 3,
    routes: findRoutes(from, to),
    negotiated: false,
  });
  log(s, `📦 Nouvelle offre : ${buyer.name} veut acheter votre production (${GOODS[good].name.toLowerCase()}, +${Math.round(bonus * 100)} %).`, 'trade', [me]);
}

/** Nœud d'où partent les convois d'une marchandise : celui de la province qui en produit le plus. */
export function sourceNode(s: GameState, w: World, id: Id, good: Good): string | undefined {
  let best: number | undefined;
  for (const pid of owned(s, id))
    if ((s.provinces[pid].good ?? w.provinces[pid].good) === good && (best === undefined || w.provinces[pid].dev > w.provinces[best].dev)) best = pid;
  return best === undefined ? homeNode(s, w, id) : w.provinces[best].node;
}

export interface Result {
  ok: boolean;
  msg: string;
}

export function acceptOffer(s: GameState, w: World, offerId: number, routeIdx: number): Result {
  const o = s.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, msg: 'Offre expirée' };
  const cap = supply(s, w)[o.good] ?? 0;
  const com = committed(s)[o.good] ?? 0;
  if (com + o.volume > cap * 1.02) return { ok: false, msg: 'Production et achats insuffisants pour honorer ce contrat' };
  const route = o.routes[routeIdx] ?? o.routes[0];
  s.offers = s.offers.filter((x) => x !== o);
  s.contracts.push({
    id: o.id,
    buyer: o.buyer,
    good: o.good,
    volume: o.volume,
    bonus: o.bonus,
    unitPrice: o.unitPrice,
    monthsLeft: o.months,
    route,
    alternatives: o.routes,
    escort: 0,
    blocked: 0,
    lastRevenue: 0,
    lastStatus: 'ok',
  });
  addRel(s, s.player, o.buyer, 8);
  log(s, `Contrat signé avec ${nm(s, o.buyer)} : ${GOODS[o.good].name} pendant ${o.months} mois.`, 'trade', [s.player]);
  return { ok: true, msg: `Contrat signé avec ${nm(s, o.buyer)}` };
}

export function declineOffer(s: GameState, offerId: number): Result {
  s.offers = s.offers.filter((x) => x.id !== offerId);
  return { ok: true, msg: 'Offre déclinée' };
}

/** Négocier une meilleure prime : coûte de l'influence, peut faire fuir l'acheteur. */
export function negotiate(s: GameState, offerId: number): Result {
  const o = s.offers.find((x) => x.id === offerId);
  const me = s.nations[s.player];
  if (!o) return { ok: false, msg: 'Offre expirée' };
  if (o.negotiated) return { ok: false, msg: 'Déjà négociée' };
  if (me.influence < 10) return { ok: false, msg: 'Influence insuffisante' };
  me.influence -= 10;
  o.negotiated = true;
  const chance = 0.45 + rel(s, s.player, o.buyer) / 250;
  if (rand(s) < chance) {
    o.bonus = Math.round((o.bonus + 0.1) * 100) / 100;
    return { ok: true, msg: `${nm(s, o.buyer)} accepte : prime portée à +${Math.round(o.bonus * 100)} %` };
  }
  if (rand(s) < 0.5) {
    s.offers = s.offers.filter((x) => x !== o);
    return { ok: false, msg: `${nm(s, o.buyer)} se retire des négociations` };
  }
  return { ok: false, msg: `${nm(s, o.buyer)} refuse de monter son prix` };
}

export function setRoute(s: GameState, contractId: number, idx: number): Result {
  const c = s.contracts.find((x) => x.id === contractId);
  if (!c || !c.alternatives[idx]) return { ok: false, msg: 'Itinéraire indisponible' };
  c.route = c.alternatives[idx];
  c.blocked = 0;
  return { ok: true, msg: 'Convois réacheminés' };
}

export function setEscort(s: GameState, contractId: number, delta: number): Result {
  const c = s.contracts.find((x) => x.id === contractId);
  if (!c) return { ok: false, msg: 'Contrat introuvable' };
  const navy = Math.floor(s.nations[s.player].navy);
  const next = Math.max(0, c.escort + delta);
  if (delta > 0 && escortsUsed(s) + delta > navy) return { ok: false, msg: 'Plus de flotte disponible' };
  c.escort = next;
  return { ok: true, msg: `Escorte : ${next} flotte(s)` };
}

export function cancelContract(s: GameState, contractId: number): Result {
  const c = s.contracts.find((x) => x.id === contractId);
  if (!c) return { ok: false, msg: 'Contrat introuvable' };
  s.contracts = s.contracts.filter((x) => x !== c);
  addRel(s, s.player, c.buyer, -20);
  return { ok: true, msg: `Contrat rompu : relations avec ${nm(s, c.buyer)} −20` };
}

// ————— Exécution mensuelle —————

export interface ContractNews {
  blocked: { contract: Contract; straits: string[] }[];
  pirated: Contract[];
}

export function processContracts(
  s: GameState,
  w: World,
): { revenue: number; news: ContractNews; delivered: Partial<Record<Good, number>>; spareEscorts: number } {
  const me = s.nations[s.player];
  const news: ContractNews = { blocked: [], pirated: [] };
  const delivered: Partial<Record<Good, number>> = {};
  let revenue = 0;
  // Livrables : la production du mois et les stocks (achats compris)
  const cap = capacity(s, w, s.player);
  for (const [g, q] of Object.entries(s.stock ?? {}) as [Good, number][]) cap[g] = (cap[g] ?? 0) + q;
  const com = committed(s);
  // Escortes limitées par la flotte réelle
  let spare = Math.floor(me.navy);
  for (const c of s.contracts) {
    c.escort = Math.min(c.escort, spare);
    spare -= c.escort;
  }
  for (const k of Object.keys(s.passes)) if (--s.passes[k] <= 0) delete s.passes[k];
  // (les clés « alert:* » servent de délai entre deux alertes)

  for (const c of [...s.contracts]) {
    if (c.piracyAlert) c.piracyAlert--;
    const buyer = s.nations[c.buyer];
    if (!buyer.alive || warBetween(s, s.player, c.buyer) || embargoes(s, c.buyer, s.player) || embargoes(s, s.player, c.buyer)) {
      s.contracts = s.contracts.filter((x) => x !== c);
      log(s, `Contrat avec ${buyer.name} annulé (guerre ou embargo).`, 'trade', [s.player]);
      continue;
    }
    const blocked = blockedStraits(s, w, c.route);
    if (blocked.length) {
      c.blocked++;
      c.lastRevenue = 0;
      c.lastStatus = 'blocked';
      news.blocked.push({ contract: c, straits: blocked });
      if (c.blocked >= 4) {
        s.contracts = s.contracts.filter((x) => x !== c);
        addRel(s, s.player, c.buyer, -20);
        log(s, `Contrat rompu : ${buyer.name} n'a rien reçu depuis 4 mois.`, 'trade', [s.player]);
      }
    } else {
      c.blocked = 0;
      if (rand(s) < piracyRisk(c.route, c.escort, s)) {
        c.lastRevenue = 0;
        c.lastStatus = 'piracy';
        news.pirated.push(c);
      } else {
        const e = estimate(c.volume, c.bonus, c.route, c.unitPrice);
        // Production insuffisante (provinces perdues) : livraisons réduites
        const ratio = Math.min(1, (cap[c.good] ?? 0) / Math.max(com[c.good] ?? 0, 1e-6));
        c.lastRevenue = e.net * ratio;
        c.lastStatus = 'ok';
        delivered[c.good] = (delivered[c.good] ?? 0) + c.volume * ratio;
        revenue += c.lastRevenue;
        for (const st of c.route.straits) {
          const owner = straitOwner(s, w, st);
          if (owner && owner !== s.player) s.nations[owner].treasury += (e.tolls / c.route.straits.length) * ratio;
        }
      }
    }
    if (--c.monthsLeft <= 0 && s.contracts.includes(c)) {
      s.contracts = s.contracts.filter((x) => x !== c);
      s.score += 1;
      s.stats.contractsDone++;
      addRel(s, s.player, c.buyer, 5);
      log(s, `Contrat honoré avec ${buyer.name} (+1 point).`, 'trade', [s.player]);
    }
  }
  return { revenue, news, delivered, spareEscorts: spare };
}

export const nodeName = (id: string) => NODES.get(id)?.name ?? id;
export const straitName = (id: string) => STRAITS.find((x) => x.id === id)?.name ?? id;
