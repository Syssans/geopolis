import { religiousDistance } from '../data/religions';
import type { GameState, Id, LogKind, Nation, Pid, War, World } from './types';

export const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const pairKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function dateLabel(s: GameState): string {
  return `${MONTHS[s.month - 1]} ${s.year}`;
}

/**
 * Relations = part « naturelle » (religion, blocs, commerce, lieux saints — voir baseline)
 * + part « historique » stockée, modifiée par les actions et qui s'érode lentement.
 */
export function rel(s: GameState, a: Id, b: Id): number {
  if (a === b) return 100;
  return clamp((s.relations[pairKey(a, b)] ?? 0) + baseline(s, a, b), -100, 100);
}

export function setRel(s: GameState, a: Id, b: Id, v: number) {
  if (a === b) return;
  const k = pairKey(a, b);
  const c = Math.round(clamp(v - baseline(s, a, b), -200, 200) * 10) / 10;
  if (c === 0) delete s.relations[k];
  else s.relations[k] = c;
}

export function addRel(s: GameState, a: Id, b: Id, d: number) {
  if (a === b) return;
  const cur = rel(s, a, b);
  setRel(s, a, b, clamp(cur + d, -100, 100));
}

export function nm(s: GameState, id: Id) {
  return s.nations[id]?.name ?? id;
}

export function log(s: GameState, text: string, kind: LogKind, involved: Id[] = []) {
  s.log.unshift({ date: dateLabel(s), text, kind, mine: involved.includes(s.player) });
  if (s.log.length > 150) s.log.length = 150;
}

// ————— Index mis en cache (invalidé dès qu'un propriétaire change) —————

interface Index {
  owned: Map<Id, Pid[]>;
  dev: Map<Id, number>;
  pop: Map<Id, number>;
  neighbours: Map<Id, Id[]>;
  top3?: Set<Id>;
  desecrators?: Map<string, Set<Id>>;
}
const indexes = new WeakMap<GameState, Index>();
let worldRef: World | null = null;

/** Le monde statique est unique : on le mémorise pour les index. */
export function bindWorld(w: World) {
  worldRef = w;
}

export function invalidate(s: GameState) {
  indexes.delete(s);
}

function index(s: GameState): Index {
  let ix = indexes.get(s);
  if (!ix) {
    ix = { owned: new Map(), dev: new Map(), pop: new Map(), neighbours: new Map() };
    s.provinces.forEach((p, i) => {
      const arr = ix!.owned.get(p.owner);
      if (arr) arr.push(i);
      else ix!.owned.set(p.owner, [i]);
      const info = worldRef!.provinces[i];
      ix!.dev.set(p.owner, (ix!.dev.get(p.owner) ?? 0) + info.dev);
      ix!.pop.set(p.owner, (ix!.pop.get(p.owner) ?? 0) + info.pop);
    });
    indexes.set(s, ix);
  }
  return ix;
}

export function owned(s: GameState, id: Id): Pid[] {
  return index(s).owned.get(id) ?? [];
}

export function devOf(s: GameState, id: Id): number {
  return index(s).dev.get(id) ?? 0;
}

export function popOf(s: GameState, id: Id): number {
  return index(s).pop.get(id) ?? 0;
}

export function capitalOf(s: GameState, w: World, id: Id): Pid | undefined {
  const mine = owned(s, id);
  return mine.find((p) => w.provinces[p].capital && w.provinces[p].owner === id) ?? mine.slice().sort((a, b) => w.provinces[b].dev - w.provinces[a].dev)[0];
}

const aliveCache = new WeakMap<GameState, Nation[]>();

/** Nations en vie (liste mise en cache : appelée des milliers de fois par mois). */
export function alive(s: GameState): Nation[] {
  let a = aliveCache.get(s);
  if (!a || a.some((n) => !n.alive)) aliveCache.set(s, (a = Object.values(s.nations).filter((n) => n.alive)));
  return a.slice();
}

/** À appeler quand une nation renaît (indépendance) : la liste en cache ne la contient pas. */
export function invalidateAlive(s: GameState) {
  aliveCache.delete(s);
}

/** Puissance de combat terrestre. */
export function power(n: Nation): number {
  return n.army * (0.6 + n.stability / 250) * (1 - n.exhaustion / 200);
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

export function enemies(s: GameState, a: Id, b: Id): boolean {
  return !!warBetween(s, a, b);
}

export function sameBloc(s: GameState, a: Id, b: Id): boolean {
  const na = s.nations[a];
  return !!na.bloc && na.bloc === s.nations[b].bloc;
}

/** Index des accords commerciaux, reconstruit quand la liste change. */
const tradeCache = new WeakMap<string[], { len: number; set: Set<string>; counts: Map<Id, number> }>();
function trades(s: GameState) {
  let c = tradeCache.get(s.trades);
  if (c && c.len < s.trades.length) {
    // Ajouts en fin de liste : mise à jour incrémentale
    for (const k of s.trades.slice(c.len)) {
      c.set.add(k);
      for (const x of k.split('|')) c.counts.set(x, (c.counts.get(x) ?? 0) + 1);
    }
    c.len = s.trades.length;
  }
  if (!c || c.len !== s.trades.length) {
    c = { len: s.trades.length, set: new Set(s.trades), counts: new Map() };
    for (const k of s.trades) for (const x of k.split('|')) c.counts.set(x, (c.counts.get(x) ?? 0) + 1);
    tradeCache.set(s.trades, c);
  }
  return c;
}

export function hasTrade(s: GameState, a: Id, b: Id) {
  return trades(s).set.has(pairKey(a, b));
}

export function embargoes(s: GameState, from: Id, to: Id) {
  return s.embargoes.includes(`${from}>${to}`);
}

export function tradeCount(s: GameState, id: Id): number {
  return trades(s).counts.get(id) ?? 0;
}

/** Nations voisines (terre ou mer proche). */
export function neighbours(s: GameState, w: World, id: Id): Id[] {
  const ix = index(s);
  let res = ix.neighbours.get(id);
  if (!res) {
    const set = new Set<Id>();
    for (const p of owned(s, id)) {
      const info = w.provinces[p];
      for (const o of [...info.adj, ...info.sea]) {
        const owner = s.provinces[o].owner;
        if (owner !== id) set.add(owner);
      }
    }
    res = [...set];
    ix.neighbours.set(id, res);
  }
  return res;
}

function topPowers(s: GameState): Set<Id> {
  const ix = index(s);
  if (!ix.top3) ix.top3 = new Set(alive(s).sort((a, b) => power(b) + b.navy * 3 - power(a) - a.navy * 3).slice(0, 3).map((n) => n.id));
  return ix.top3;
}

/** Peut-on projeter sa force jusqu'à la cible (voisinage, ou superpuissance) ? */
export function inReach(s: GameState, w: World, from: Id, to: Id, projection = true): boolean {
  if (projection && topPowers(s).has(from)) return true;
  return neighbours(s, w, from).includes(to);
}

export function powerRank(s: GameState, id: Id): number {
  const me = power(s.nations[id]);
  return alive(s).filter((n) => power(n) > me).length + 1;
}

/** Nations qui détiennent un lieu saint d'une autre religion que la leur, par religion offensée. */
function desecrators(s: GameState): Map<string, Set<Id>> {
  const ix = index(s);
  if (!ix.desecrators) {
    ix.desecrators = new Map();
    for (const info of worldRef!.provinces)
      for (const h of info.holy ?? []) {
        const owner = s.provinces[info.id].owner;
        for (const r of h.religions)
          if (s.nations[owner].religion !== r) {
            if (!ix.desecrators.has(r)) ix.desecrators.set(r, new Set());
            ix.desecrators.get(r)!.add(owner);
          }
      }
  }
  return ix.desecrators;
}

/** Relation « naturelle » : religion, blocs, commerce, lieux saints. */
export function baseline(s: GameState, a: Id, b: Id): number {
  const na = s.nations[a];
  const nb = s.nations[b];
  let v = na.religion === nb.religion ? 15 : 5 - religiousDistance(na.religion, nb.religion) * 15;
  if (sameBloc(s, a, b)) v += 25;
  if (hasTrade(s, a, b)) v += 8;
  if (s.orgs?.opep?.members.includes(a) && s.orgs.opep.members.includes(b)) v += 8;
  const d = desecrators(s);
  if (d.get(na.religion)?.has(b)) v -= 20;
  if (d.get(nb.religion)?.has(a)) v -= 20;
  return v;
}

/** Lieux saints détenus par une nation d'une autre religion que celle qui les vénère. */
export function desecratedHolySites(s: GameState, w: World, religion: string): { pid: Pid; name: string; owner: Id }[] {
  const res: { pid: Pid; name: string; owner: Id }[] = [];
  for (const info of w.provinces)
    for (const h of info.holy ?? [])
      if (h.religions.includes(religion as never)) {
        const owner = s.provinces[info.id].owner;
        if (s.nations[owner].religion !== religion) res.push({ pid: info.id, name: h.name, owner });
      }
  return res;
}
