import type { GameState, Id, LogKind, Nation, Territory, War, World } from './types';

export const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const pairKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function dateLabel(s: GameState): string {
  return `${MONTHS[s.month - 1]} ${s.year}`;
}

export function rel(s: GameState, a: Id, b: Id): number {
  if (a === b) return 100;
  return s.relations[pairKey(a, b)] ?? 0;
}

export function setRel(s: GameState, a: Id, b: Id, v: number) {
  if (a === b) return;
  const k = pairKey(a, b);
  const c = Math.round(clamp(v, -100, 100) * 10) / 10;
  if (c === 0) delete s.relations[k];
  else s.relations[k] = c;
}

export function addRel(s: GameState, a: Id, b: Id, d: number) {
  setRel(s, a, b, rel(s, a, b) + d);
}

/**
 * Index recalculé à la demande : territoires par propriétaire, PIB par nation.
 * Doit être invalidé (invalidate) dès qu'un PIB ou un propriétaire change.
 */
interface Index {
  terrs: Map<Id, Territory[]>;
  gdp: Map<Id, number>;
  pop: Map<Id, number>;
  world: number;
  neighbours: Map<Id, Id[]>;
  top3?: Set<Id>;
}
const indexes = new WeakMap<GameState, Index>();

export function invalidate(s: GameState) {
  indexes.delete(s);
}

function index(s: GameState): Index {
  let ix = indexes.get(s);
  if (!ix) {
    ix = { terrs: new Map(), gdp: new Map(), pop: new Map(), world: 0, neighbours: new Map() };
    for (const t of Object.values(s.territories)) {
      const arr = ix.terrs.get(t.owner);
      if (arr) arr.push(t);
      else ix.terrs.set(t.owner, [t]);
      ix.gdp.set(t.owner, (ix.gdp.get(t.owner) ?? 0) + t.gdp);
      ix.pop.set(t.owner, (ix.pop.get(t.owner) ?? 0) + t.pop);
      ix.world += t.gdp;
    }
    indexes.set(s, ix);
  }
  return ix;
}

export function ownedTerritories(s: GameState, id: Id): Territory[] {
  return index(s).terrs.get(id) ?? [];
}

export function gdpOf(s: GameState, id: Id): number {
  return index(s).gdp.get(id) ?? 0;
}

export function popOf(s: GameState, id: Id): number {
  return index(s).pop.get(id) ?? 0;
}

export function worldGdp(s: GameState): number {
  return index(s).world;
}

/** Puissance de combat effective. */
export function power(n: Nation): number {
  return n.strength * (1 + 0.08 * n.tech) * (0.6 + n.stability / 250) * (1 - n.exhaustion / 200);
}

/** Efficacité de la dépense militaire (coût local de la main-d'œuvre). */
export function milEfficiency(gdp: number, pop: number): number {
  const pc = (gdp * 1000) / Math.max(pop, 0.01); // $ par habitant
  return Math.sqrt(clamp(45000 / Math.max(pc, 1), 1, 6));
}

export function alive(s: GameState): Nation[] {
  return Object.values(s.nations).filter((n) => n.alive);
}

export function warsOf(s: GameState, id: Id): War[] {
  return s.wars.filter((w) => w.attackers.includes(id) || w.defenders.includes(id));
}

export function atWar(s: GameState, id: Id): boolean {
  return warsOf(s, id).length > 0;
}

export function warBetween(s: GameState, a: Id, b: Id): War | undefined {
  return s.wars.find(
    (w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)),
  );
}

export function sameBloc(s: GameState, a: Id, b: Id): boolean {
  const na = s.nations[a];
  return !!na.bloc && na.bloc === s.nations[b].bloc;
}

export function hasTrade(s: GameState, a: Id, b: Id) {
  return s.trades.includes(pairKey(a, b));
}

export function sanctions(s: GameState, from: Id, to: Id) {
  return s.sanctions.includes(`${from}>${to}`);
}

export function sanctionersOf(s: GameState, id: Id): Id[] {
  return s.sanctions.filter((k) => k.endsWith(`>${id}`)).map((k) => k.split('>')[0]);
}

/** Nations voisines par la terre. */
export function neighbours(s: GameState, w: World, id: Id): Id[] {
  const ix = index(s);
  let res = ix.neighbours.get(id);
  if (!res) {
    const set = new Set<Id>();
    for (const t of ownedTerritories(s, id))
      for (const o of w.adjacent[t.id] ?? []) {
        const owner = s.territories[o]?.owner;
        if (owner && owner !== id) set.add(owner);
      }
    res = [...set];
    ix.neighbours.set(id, res);
  }
  return res;
}

/** Rang de puissance militaire (1 = plus puissant). */
const tradeCache = new WeakMap<string[], { len: number; counts: Map<Id, number> }>();

export function tradeCount(s: GameState, id: Id): number {
  let c = tradeCache.get(s.trades);
  if (!c || c.len !== s.trades.length) {
    c = { len: s.trades.length, counts: new Map() };
    for (const k of s.trades) for (const x of k.split('|')) c.counts.set(x, (c.counts.get(x) ?? 0) + 1);
    tradeCache.set(s.trades, c);
  }
  return c.counts.get(id) ?? 0;
}

/** Les 3 premières puissances militaires (recalculé à chaque invalidation). */
function topPowers(s: GameState): Set<Id> {
  const ix = index(s);
  if (!ix.top3) ix.top3 = new Set(alive(s).sort((a, b) => power(b) - power(a)).slice(0, 3).map((n) => n.id));
  return ix.top3;
}

export function powerRank(s: GameState, id: Id): number {
  const me = power(s.nations[id]);
  return alive(s).filter((n) => power(n) > me).length + 1;
}

/** Une nation peut-elle projeter sa force jusqu'à la cible ? */
export function inReach(s: GameState, w: World, from: Id, to: Id, projection = true): boolean {
  if (projection && topPowers(s).has(from)) return true; // projection mondiale
  const mine = ownedTerritories(s, from);
  const theirs = new Set(ownedTerritories(s, to).map((t) => t.id));
  return mine.some((t) => (w.near[t.id] ?? []).some((o) => theirs.has(o)));
}

export function log(s: GameState, text: string, kind: LogKind, involved: Id[] = []) {
  s.log.unshift({ date: dateLabel(s), text, kind, mine: involved.includes(s.player) });
  if (s.log.length > 150) s.log.length = 150;
}

export function nm(s: GameState, id: Id) {
  return s.nations[id]?.name ?? id;
}

/** Croissance annuelle (%) d'une nation, décomposée. */
export function growthBreakdown(s: GameState, id: Id): { label: string; value: number }[] {
  const n = s.nations[id];
  const gdp = gdpOf(s, id);
  const pc = (gdp * 1000) / Math.max(popOf(s, id), 0.01);
  const parts: { label: string; value: number }[] = [];
  parts.push({ label: 'Rattrapage économique', value: -0.2 + 3.6 * (1 - Math.min(1, pc / 60000)) });
  parts.push({ label: 'Stabilité', value: (n.stability - 50) * 0.03 });
  const trades = tradeCount(s, id);
  if (trades) parts.push({ label: `Accords commerciaux (${trades})`, value: Math.min(0.75, 0.05 * trades) });
  const world = worldGdp(s);
  const sanc = sanctionersOf(s, id).reduce((a, o) => a + gdpOf(s, o) / world, 0);
  if (sanc > 0) parts.push({ label: 'Sanctions subies', value: -Math.min(3, sanc * 4) });
  const imposed = s.sanctions.filter((k) => k.startsWith(`${id}>`)).reduce((a, k) => a + gdpOf(s, k.split('>')[1]) / world, 0);
  if (imposed > 0) parts.push({ label: 'Coût des sanctions imposées', value: -Math.min(0.75, imposed * 1.5) });
  if (atWar(s, id)) parts.push({ label: 'Économie de guerre', value: -1.5 });
  if (n.growthBonus) parts.push({ label: 'Réformes', value: n.growthBonus });
  for (const m of n.modifiers) if (m.growth) parts.push({ label: m.label, value: m.growth });
  if (n.treasury < -gdp * 0.3) parts.push({ label: 'Crise de la dette', value: -1.5 });
  return parts;
}

export function growthOf(s: GameState, id: Id): number {
  return growthBreakdown(s, id).reduce((a, p) => a + p.value, 0);
}

/** Revenus et dépenses mensuels (milliards $). */
export function budget(s: GameState, id: Id) {
  const n = s.nations[id];
  const gdp = gdpOf(s, id);
  const income = (gdp * 0.05) / 12;
  const military = (gdp * n.milPct) / 100 / 12;
  const interest = n.treasury < 0 ? -n.treasury * 0.004 : 0;
  return { income, military, interest, net: income - military - interest };
}
