import { geoDistance } from 'd3-geo';
import { routePath } from '../data/routes';
import { GOODS, STRAITS, type Good } from '../data/trade';
import { capacity, findRoutes, sourceNode } from './contracts';
import { pick, rand } from './rng';
import { addRel, alive, clamp, devOf, embargoes, log, nm, owned, power, sameBloc, warBetween } from './state';
import { homeNode, NODES, straitClosed, straitOwner, unitPrice } from './trade';
import { declareWar, leaveBloc } from './war';
import type { Convoy, GameState, Id, Route, World } from './types';

export type { Convoy };

/** Distance parcourue par un convoi en un mois de jeu (km). */
const KM_PER_MONTH = 6000;
/** Nombre visé de convois étrangers en mer. */
const WORLD_CONVOYS = 90;


/** Temps absolu en mois depuis l'an 0 (le mois en cours commence à cet instant). */
export const clock = (s: GameState) => s.year * 12 + (s.month - 1);

const lengthCache = new Map<string, number>();
export function routeKm(nodes: string[]): number {
  const k = nodes.join('>');
  let km = lengthCache.get(k);
  if (km === undefined) {
    const pts = routePath(nodes);
    km = 0;
    for (let i = 1; i < pts.length; i++) km += geoDistance(pts[i - 1], pts[i]) * 6371;
    lengthCache.set(k, km);
  }
  return km;
}

const durationOf = (nodes: string[]) => Math.max(0.6, routeKm(nodes) / KM_PER_MONTH);

/** Un détroit est-il infranchissable pour les navires d'une nation ? */
function strandedBy(s: GameState, w: World, id: Id, st: string): boolean {
  const owner = straitOwner(s, w, st);
  if (!owner || owner === id) return false;
  return straitClosed(s, w, st) || !!warBetween(s, owner, id) || embargoes(s, owner, id);
}

function pickRoute(s: GameState, w: World, id: Id, routes: Route[]): Route | undefined {
  return routes.find((r) => !r.straits.some((st) => strandedBy(s, w, id, st)));
}

/** Avancement d'un convoi (0 → 1) à l'instant t. */
export const progressAt = (c: Convoy, t: number) => (t - c.depart) / c.duration;

/** Départs du mois : convois des contrats du joueur et échanges mondiaux ; arrivée des anciens. */
export function monthlyConvoys(s: GameState, w: World) {
  const now = clock(s);
  s.convoys = s.convoys.filter((c) => progressAt(c, now) < 1);

  // Convois des contrats du joueur (le revenu est encaissé par processContracts)
  for (const c of s.contracts) {
    if (c.lastStatus !== 'ok' || c.lastRevenue <= 0) continue;
    s.convoys.push({
      id: s.nextUid++,
      from: s.player,
      to: c.buyer,
      good: c.good,
      qty: c.volume,
      value: c.lastRevenue,
      nodes: c.route.nodes,
      straits: c.route.straits,
      depart: now + rand(s) * 0.5,
      duration: durationOf(c.route.nodes),
      escort: c.escort,
      contract: c.id,
    });
  }

  // Convois de vos achats (payés et mis en stock par processPurchases)
  for (const p of s.purchases ?? []) {
    if (p.lastStatus !== 'ok' || p.lastCost <= 0) continue;
    s.convoys.push({
      id: s.nextUid++,
      from: p.seller,
      to: s.player,
      good: p.good,
      qty: p.volume,
      value: p.lastCost,
      nodes: p.route.nodes,
      straits: p.route.straits,
      depart: now + rand(s) * 0.5,
      duration: durationOf(p.route.nodes),
      escort: p.escort,
      purchase: p.id,
    });
  }

  // Échanges mondiaux : exportateurs tirés selon leur production, importateurs selon leurs besoins
  const foreign = s.convoys.filter((c) => c.contract === undefined && c.purchase === undefined).length;
  const exporters = alive(s)
    .filter((n) => n.id !== s.player)
    .map((n) => ({ n, v: n.income.production }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 60);
  const total = exporters.reduce((a, x) => a + x.v, 0);
  const toSpawn = Math.max(0, Math.round((WORLD_CONVOYS - foreign) / 1.5));
  const caps = new Map<Id, Partial<Record<Good, number>>>();
  const capOf = (id: Id) => {
    let c = caps.get(id);
    if (!c) caps.set(id, (c = capacity(s, w, id)));
    return c;
  };
  const buyers = alive(s).filter((b) => devOf(s, b.id) > 40);
  for (let k = 0; k < toSpawn && total > 0; k++) {
    let r = rand(s) * total;
    const ex = exporters.find((x) => (r -= x.v) <= 0)?.n ?? exporters[0].n;
    const cap = capOf(ex.id);
    const goods = Object.entries(cap) as [Good, number][];
    const gTotal = goods.reduce((a, [g, q]) => a + q * unitPrice(s, g), 0);
    if (!gTotal) continue;
    let rg = rand(s) * gTotal;
    const good = (goods.find(([g, q]) => (rg -= q * unitPrice(s, g)) <= 0) ?? goods[0])[0];
    const buyer = pick(
      s,
      buyers.filter(
        (b) =>
          b.id !== ex.id &&
          !warBetween(s, ex.id, b.id) &&
          !embargoes(s, b.id, ex.id) &&
          !embargoes(s, ex.id, b.id) &&
          (capOf(b.id)[good] ?? 0) < devOf(s, b.id) * 0.02,
      ),
    );
    const from = sourceNode(s, w, ex.id, good);
    const to = buyer && homeNode(s, w, buyer.id);
    if (!buyer || !from || !to || from === to) continue;
    const route = pickRoute(s, w, ex.id, findRoutes(from, to));
    if (!route) continue;
    const qty = Math.round((cap[good] ?? 0) * (0.1 + rand(s) * 0.15) * 100) / 100;
    s.convoys.push({
      id: s.nextUid++,
      from: ex.id,
      to: buyer.id,
      good,
      qty,
      value: Math.round(qty * unitPrice(s, good) * 100) / 100,
      nodes: route.nodes,
      straits: route.straits,
      depart: now + rand(s),
      duration: durationOf(route.nodes),
      escort: Math.min(3, Math.floor(ex.navy / 10)),
    });
  }

  // En guerre, les marines ennemies arraisonnent les convois du joueur qui passent près de leurs côtes
  for (const c of [...s.convoys]) {
    if (c.contract === undefined) continue;
    const node = currentNode(c, now + 0.5);
    for (const e of alive(s)) {
      if (!warBetween(s, e.id, s.player) || e.navy < 1) continue;
      const coastal = owned(s, e.id).some((pid) => w.provinces[pid].coastal && w.provinces[pid].node === node);
      if (!coastal) continue;
      const risk = 0.25 * (e.navy / (e.navy + c.escort * 4 + s.nations[s.player].navy * 0.2));
      if (rand(s) < risk) {
        s.convoys = s.convoys.filter((x) => x !== c);
        s.nations[s.player].treasury -= c.value;
        e.treasury += c.value * 0.7;
        log(s, `🚢 ${e.name} arraisonne votre convoi de ${GOODS[c.good].name.toLowerCase()} pour ${nm(s, c.to)}.`, 'war', [s.player]);
        break;
      }
    }
  }
}

/** Nœud commercial où se trouve un convoi à l'instant t. */
export function currentNode(c: Convoy, t: number): string {
  const p = clamp(progressAt(c, t), 0, 0.999);
  return c.nodes[Math.min(c.nodes.length - 1, Math.floor(p * c.nodes.length))];
}

export interface InterceptCheck {
  ok: boolean;
  reason?: string;
  chance: number;
  legal: boolean; // en guerre avec l'expéditeur ou le destinataire : blocus légitime
  ally: boolean; // l'expéditeur est de votre bloc : trahison, exclusion du bloc
}

export function canIntercept(s: GameState, w: World, c: Convoy, t: number): InterceptCheck {
  const me = s.nations[s.player];
  const legal = !!warBetween(s, s.player, c.from) || !!warBetween(s, s.player, c.to);
  const ally = !legal && sameBloc(s, s.player, c.from);
  const fail = (reason: string): InterceptCheck => ({ ok: false, reason, chance: 0, legal, ally });
  if (c.from === s.player) return fail('C’est l’un de vos convois');
  if (c.to === s.player) return fail('Cette cargaison vous est destinée');
  if (me.navy < 1) return fail('Il vous faut au moins une flotte');
  if ((s.passes['intercept'] ?? 0) > 0) return fail('Vos navires se réarment (une interception par mois)');
  const node = currentNode(c, t);
  const presence = owned(s, s.player).some((pid) => w.provinces[pid].coastal && w.provinces[pid].node === node) || me.navy >= 25;
  if (!presence) return fail(`Hors de portée : il faut des côtes dans la zone « ${NODES.get(node)?.name ?? node} » ou une marine de haute mer (25 flottes)`);
  const defense = c.escort * 3 + s.nations[c.from].navy * 0.05;
  return { ok: true, chance: clamp(me.navy / (me.navy + defense + 1), 0.15, 0.95), legal, ally };
}

/** Intercepter un convoi étranger : butin, mais lourdes conséquences diplomatiques hors temps de guerre. */
export function intercept(s: GameState, w: World, id: number, t: number): { ok: boolean; msg: string } {
  const c = s.convoys.find((x) => x.id === id);
  if (!c) return { ok: false, msg: 'Le convoi est arrivé à destination' };
  const chk = canIntercept(s, w, c, t);
  if (!chk.ok) return { ok: false, msg: chk.reason! };
  const me = s.nations[s.player];
  const from = s.nations[c.from];
  s.passes['intercept'] = 1;
  const cargo = `${GOODS[c.good].name.toLowerCase()}`;
  if (rand(s) > chk.chance) {
    me.navy = Math.max(0, me.navy - 1);
    if (!chk.legal) {
      addRel(s, s.player, c.from, -20);
      me.aggression += 5;
    }
    log(s, `Échec de l’interception du convoi de ${from.name} : une flotte perdue.`, 'war', [s.player, c.from]);
    return { ok: false, msg: 'Interception repoussée par l’escorte : une flotte perdue' };
  }
  s.convoys = s.convoys.filter((x) => x !== c);
  const loot = Math.round(c.value * 0.7 * 10) / 10;
  me.treasury += loot;
  from.treasury -= c.value;
  if (chk.legal) {
    me.stability = clamp(me.stability + 1, 0, 100);
    log(s, `⚓ Blocus : vous saisissez un convoi de ${cargo} de ${from.name} (${loot} Md$).`, 'war', [s.player, c.from]);
    return { ok: true, msg: `Prise de guerre : +${loot} Md$` };
  }
  // Piraterie d'État en temps de paix ; contre un allié, c'est une trahison : le bloc vous exclut
  let msg = '';
  if (chk.ally && me.bloc) {
    const bloc = s.blocs[me.bloc];
    const others = bloc.members.filter((m) => m !== s.player);
    leaveBloc(s, s.player, true);
    for (const m of others) addRel(s, s.player, m, -25);
    addRel(s, s.player, c.from, -20);
    log(s, `🚫 Trahison : ${bloc.name} vous exclut après l’attaque d’un convoi de ${from.name}.`, 'diplo', [s.player, c.from]);
    msg = `Trahison : ${bloc.name} vous exclut. `;
  }
  addRel(s, s.player, c.from, -40);
  addRel(s, s.player, c.to, -20);
  for (const n of alive(s)) if (n.id !== c.from && n.id !== c.to && n.id !== s.player) addRel(s, s.player, n.id, sameBloc(s, n.id, c.from) ? -15 : -4);
  me.aggression += 12;
  s.tension = clamp(s.tension + 3, 0, 100);
  if (!from.claims.includes(s.player)) from.claims.push(s.player);
  if (!s.embargoes.includes(`${c.from}>${s.player}`)) s.embargoes.push(`${c.from}>${s.player}`);
  log(s, `🏴‍☠️ Vous arraisonnez un convoi de ${cargo} de ${from.name} à destination de ${nm(s, c.to)}. Scandale international !`, 'war', [s.player, c.from, c.to]);
  msg += `Cargaison saisie : +${loot} Md$. ${from.name} décrète un embargo et obtient un casus belli contre vous.`;
  if ((from.hawk >= 0.3 || chk.ally) && power(from) > power(me) * 0.8 && rand(s) < (chk.ally ? 0.5 : 0.35)) {
    if (declareWar(s, w, c.from, s.player)) {
      log(s, `⚔ ${from.name} ne laisse pas l’affront impuni et vous déclare la guerre !`, 'war', [s.player, c.from]);
      msg += ' Il vous déclare la guerre !';
    }
  }
  return { ok: true, msg };
}

export const straitNames = (ids: string[]) => ids.map((id) => STRAITS.find((x) => x.id === id)?.name ?? id);

/** Début de partie : des convois déjà en route, répartis le long de leur trajet. */
export function seedConvoys(s: GameState, w: World) {
  monthlyConvoys(s, w);
  const now = clock(s);
  for (const c of s.convoys) c.depart = now - rand(s) * c.duration * 0.9;
  monthlyConvoys(s, w);
}
