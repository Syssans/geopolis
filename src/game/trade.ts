import { GOODS, STRAITS, TRADE_NODES, type Good } from '../data/trade';
import { embargoes, owned, tradeCount } from './state';
import type { GameState, Id, Pid, World } from './types';

/** Part de la production versée directement au propriétaire ; le reste entre dans le commerce. */
export const PRODUCTION_SHARE = 0.25;
/** Part d'un flux captée par le propriétaire d'un détroit au passage. */
export const TOLL = 0.05;
const TRANSFER_BONUS = 1.05;

export const NODES = new Map(TRADE_NODES.map((n) => [n.id, n]));

/** Ordre topologique : amont d'abord. */
export const NODE_ORDER: string[] = (() => {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const n of TRADE_NODES) if (n.out.includes(id)) visit(n.id);
    order.push(id);
  };
  for (const n of TRADE_NODES) visit(n.id);
  return order;
})();

export const upstreamOf = (id: string) => TRADE_NODES.filter((n) => n.out.includes(id)).map((n) => n.id);

/** Province qui contrôle chaque détroit. */
const straitCache = new WeakMap<World, Map<string, Pid>>();
export function straitProvince(w: World, strait: string): Pid | undefined {
  let m = straitCache.get(w);
  if (!m) {
    m = new Map();
    for (const p of w.provinces) if (p.strait) m.set(p.strait, p.id);
    straitCache.set(w, m);
  }
  return m.get(strait);
}

/** Détroit traversé par le lien from → to, s'il existe. */
export function straitOn(from: string, to: string) {
  return STRAITS.find((st) => st.from === from && (st.to === to || st.to === '*'));
}

export function straitOwner(s: GameState, w: World, strait: string): Id | undefined {
  const pid = straitProvince(w, strait);
  return pid === undefined ? undefined : s.provinces[pid].owner;
}

export function straitClosed(s: GameState, w: World, strait: string): boolean {
  const owner = straitOwner(s, w, strait);
  return !!owner && s.nations[owner].closedStraits.includes(strait);
}

/** Valeur produite par une province (Md$/mois). */
export function production(s: GameState, w: World, pid: Pid): number {
  const info = w.provinces[pid];
  const p = s.provinces[pid];
  const good = p.good ?? info.good;
  let v = info.dev * GOODS[good].price * (s.prices[good] ?? 1) * 0.05;
  if (p.occupiedBy) v *= 0.3;
  if (p.revolt) v = 0;
  else if (p.unrest > 60) v *= 0.7;
  return v;
}

export interface NodeReport {
  local: number;
  incoming: number;
  value: number;
  power: Record<Id, number>;
  total: number;
  collectors: Id[];
  collected: Record<Id, number>;
  out: Record<string, number>;
  tolls: Record<Id, number>;
}

export interface TradeReport {
  nodes: Record<string, NodeReport>;
  income: Record<Id, { production: number; trade: number; tolls: number; byNode: Record<string, number> }>;
}

/** Nœud « domicile » d'une nation : celui de sa capitale. */
export function homeNode(s: GameState, w: World, id: Id): string | undefined {
  const mine = owned(s, id);
  if (!mine.length) return undefined;
  const cap = mine.find((p) => w.provinces[p].capital && w.provinces[p].owner === id) ?? mine.reduce((a, b) => (w.provinces[a].dev >= w.provinces[b].dev ? a : b));
  return w.provinces[cap].node;
}

/** Pouvoir commercial de chaque nation dans chaque nœud. */
export function tradePower(s: GameState, w: World): Record<string, Record<Id, number>> {
  const res: Record<string, Record<Id, number>> = {};
  for (const n of TRADE_NODES) res[n.id] = {};
  const coastalIn = new Map<Id, Set<string>>();
  s.provinces.forEach((p, i) => {
    if (p.occupiedBy || p.revolt) return;
    const info = w.provinces[i];
    const node = res[info.node];
    node[p.owner] = (node[p.owner] ?? 0) + info.dev * (info.coastal ? 1.3 : 1);
    if (info.coastal) {
      if (!coastalIn.has(p.owner)) coastalIn.set(p.owner, new Set());
      coastalIn.get(p.owner)!.add(info.node);
    }
  });
  for (const n of Object.values(s.nations)) {
    if (!n.alive) continue;
    const mult = 1 + Math.min(0.3, 0.05 * tradeCount(s, n.id));
    for (const m of n.merchants) res[m.node][n.id] = ((res[m.node][n.id] ?? 0) + 10) * 1.2;
    // La marine protège le commerce là où l'on a des côtes ou un marchand
    const navyNodes = new Set([...(coastalIn.get(n.id) ?? []), ...n.merchants.map((m) => m.node)]);
    for (const node of navyNodes) res[node][n.id] = (res[node][n.id] ?? 0) + n.navy * 2;
    for (const node of Object.keys(res)) if (res[node][n.id]) res[node][n.id] *= mult;
  }
  // Embargo : pouvoir réduit là où l'embargoteur pèse davantage
  for (const e of s.embargoes) {
    const [from, to] = e.split('>');
    for (const node of Object.values(res)) if ((node[from] ?? 0) > (node[to] ?? 0) && node[to]) node[to] *= 0.7;
  }
  return res;
}

export function computeTrade(s: GameState, w: World): TradeReport {
  const nodes: Record<string, NodeReport> = {};
  const income: TradeReport['income'] = {};
  const inc = (id: Id) => (income[id] ??= { production: 0, trade: 0, tolls: 0, byNode: {} });
  const powers = tradePower(s, w);
  const home = new Map<Id, string | undefined>();
  for (const n of Object.values(s.nations)) if (n.alive) home.set(n.id, homeNode(s, w, n.id));

  const local: Record<string, number> = {};
  for (const n of TRADE_NODES) local[n.id] = 0;
  s.provinces.forEach((p, i) => {
    const v = production(s, w, i);
    inc(p.owner).production += v * PRODUCTION_SHARE;
    local[w.provinces[i].node] += v * (1 - PRODUCTION_SHARE);
  });
  const incoming: Record<string, number> = {};
  for (const id of NODE_ORDER) incoming[id] = 0;

  for (const id of NODE_ORDER) {
    const def = NODES.get(id)!;
    const power = powers[id];
    const value = local[id] + incoming[id];
    const total = Object.values(power).reduce((a, b) => a + b, 0);
    const terminal = def.out.length === 0;
    const collectors = Object.keys(power).filter(
      (nid) => terminal || home.get(nid) === id || s.nations[nid].merchants.some((m) => m.node === id && m.mode === 'collect'),
    );
    const report: NodeReport = { local: local[id], incoming: incoming[id], value, power, total, collectors, collected: {}, out: {}, tolls: {} };
    nodes[id] = report;
    if (total <= 0) {
      // Personne ne contrôle ce nœud : tout part vers l'aval
      spread(id, value, {});
      continue;
    }
    let collectedShare = 0;
    for (const c of collectors) {
      const share = power[c] / total;
      collectedShare += share;
      const got = value * share;
      report.collected[c] = got;
      inc(c).trade += got;
      inc(c).byNode[id] = (inc(c).byNode[id] ?? 0) + got;
    }
    const steered = value * (1 - collectedShare);
    if (steered <= 0 || terminal) continue;
    // Répartition de la valeur orientée selon les marchands qui visent un nœud aval précis
    const weights: Record<string, number> = {};
    for (const [nid, pw] of Object.entries(power)) {
      if (collectors.includes(nid)) continue;
      const m = s.nations[nid].merchants.find((x) => x.node === id && x.mode === 'steer' && x.target);
      if (m && def.out.includes(m.target!)) weights[m.target!] = (weights[m.target!] ?? 0) + pw;
      else for (const o of def.out) weights[o] = (weights[o] ?? 0) + pw / def.out.length;
    }
    spread(id, steered, weights);

    function spread(from: string, amount: number, w0: Record<string, number>) {
      const outs = NODES.get(from)!.out;
      if (!outs.length) return;
      const open = outs.filter((o) => {
        const st = straitOn(from, o);
        return !st || !straitClosed(s, w, st.id);
      });
      const rep = nodes[from];
      if (!open.length) {
        // Détroit fermé : la moitié de la valeur est perdue, l'autre reste aux collecteurs locaux
        const cs = rep.collectors.length ? rep.collectors : [];
        const tot = cs.reduce((a, c) => a + (rep.power[c] ?? 0), 0);
        for (const c of cs) {
          const got = (amount * 0.5 * (rep.power[c] ?? 0)) / (tot || 1);
          rep.collected[c] = (rep.collected[c] ?? 0) + got;
          inc(c).trade += got;
          inc(c).byNode[from] = (inc(c).byNode[from] ?? 0) + got;
        }
        return;
      }
      const totalW = open.reduce((a, o) => a + (w0[o] ?? 1), 0);
      for (const o of open) {
        let part = (amount * (w0[o] ?? 1)) / totalW;
        const st = straitOn(from, o);
        if (st) {
          const owner = straitOwner(s, w, st.id);
          if (owner && s.nations[owner].alive) {
            const toll = part * TOLL;
            rep.tolls[owner] = (rep.tolls[owner] ?? 0) + toll;
            inc(owner).tolls += toll;
            part -= toll;
          }
        }
        rep.out[o] = (rep.out[o] ?? 0) + part;
        incoming[o] += part * TRANSFER_BONUS;
      }
    }
  }
  return { nodes, income };
}

/** Évolution mensuelle des prix : retour vers la normale + choc des détroits fermés. */
export function updatePrices(s: GameState, w: World, rand: () => number) {
  const target: Record<string, number> = {};
  for (const g of Object.keys(GOODS)) target[g] = 1;
  const bump = (g: Good, v: number) => (target[g] += v);
  for (const st of STRAITS)
    if (straitClosed(s, w, st.id)) {
      if (st.id === 'ormuz') { bump('petrole', 0.7); bump('gaz', 0.5); }
      if (st.id === 'bab' || st.id === 'suez') { bump('petrole', 0.2); bump('industrie', 0.15); bump('textile', 0.15); }
      if (st.id === 'malacca') { bump('puces', 0.5); bump('industrie', 0.2); }
      if (st.id === 'panama') { bump('cereales', 0.2); bump('gaz', 0.1); }
      if (st.id === 'bosphore') { bump('cereales', 0.3); bump('petrole', 0.1); }
      if (st.id === 'gibraltar' || st.id === 'danois') { bump('industrie', 0.1); bump('gaz', 0.1); }
    }
  for (const [g, def] of Object.entries(GOODS)) {
    const p = s.prices[g] ?? 1;
    const next = p + (target[g] - p) * 0.15 + (rand() - 0.5) * def.volatility;
    s.prices[g] = Math.round(Math.max(0.4, Math.min(3, next)) * 1000) / 1000;
  }
}
