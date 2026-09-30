/**
 * Poids des sanctions : un embargo prive sa cible d'une part du commerce mondial proportionnelle au poids
 * économique de celui qui l'impose, et ses alliés de bloc suivent en partie (sanctions secondaires).
 */
import { addRel, alive, embargoes, log, nm, rel } from './state';
import { rand } from './rng';
import type { GameState, Id } from './types';

export const MAX_PRESSURE = 0.6;
/** Plafond de la pression due aux sanctions historiques (déjà en place en 2026). */
export const LEGACY_MAX = 0.3;

/** Part de chaque nation dans les revenus mondiaux (mois précédent). */
function shares(s: GameState): Map<Id, number> {
  const inc = alive(s).map((n) => [n.id, n.income.production + n.income.trade + n.income.tolls] as const);
  const total = inc.reduce((a, [, v]) => a + Math.max(0, v), 0) || 1;
  return new Map(inc.map(([id, v]) => [id, Math.max(0, v) / total]));
}

/** Pression des sanctions subies par chaque nation (0 → 0,6) et qui les impose. */
export function sanctionsPressure(s: GameState): Map<Id, { p: number; by: Id[] }> {
  const sh = shares(s);
  const res = new Map<Id, { p: number; by: Id[] }>();
  // Les sanctions historiques (en place au début de la campagne) pèsent moins : l'économie s'y est adaptée
  const legacy = new Set(s.legacyEmbargoes ?? []);
  const old = new Map<Id, number>();
  const followers = new Map<Id, Map<Id, boolean>>(); // suiveur → ne suit que des sanctions historiques
  for (const k of s.embargoes) {
    const [a, b] = k.split('>');
    if (!s.nations[a]?.alive || !s.nations[b]?.alive) continue;
    const r = res.get(b) ?? { p: 0, by: [] };
    const direct = (sh.get(a) ?? 0) * 1.6;
    if (legacy.has(k)) old.set(b, (old.get(b) ?? 0) + direct);
    else r.p += direct;
    r.by.push(a);
    // Les alliés du bloc de l'embargoteur appliquent des sanctions secondaires (une seule fois chacun, sauf embargo propre)
    const bloc = s.nations[a].bloc ? s.blocs[s.nations[a].bloc!] : null;
    const f = followers.get(b) ?? new Map<Id, boolean>();
    if (bloc && !bloc.members.includes(b))
      for (const m of bloc.members) if (m !== a && !embargoes(s, m, b)) f.set(m, (f.get(m) ?? true) && legacy.has(k));
    followers.set(b, f);
    res.set(b, r);
  }
  for (const [b, r] of res) {
    for (const [m, isOld] of followers.get(b) ?? []) {
      if (isOld) old.set(b, (old.get(b) ?? 0) + (sh.get(m) ?? 0) * 0.6);
      else r.p += (sh.get(m) ?? 0) * 0.6;
    }
    r.p += Math.min(LEGACY_MAX, old.get(b) ?? 0);
    r.p = Math.min(MAX_PRESSURE, Math.round(r.p * 100) / 100);
  }
  return res;
}

/** Négocier la levée d'un embargo : coûte de l'influence, réussit selon les relations. */
export function negotiateLift(s: GameState, id: Id, from: Id): { ok: boolean; msg: string } {
  const me = s.nations[id];
  if (!embargoes(s, from, id)) return { ok: false, msg: 'Aucun embargo de ce pays' };
  if (me.influence < LIFT_COST) return { ok: false, msg: `Influence insuffisante (${LIFT_COST})` };
  me.influence -= LIFT_COST;
  const r = rel(s, id, from);
  const chance = Math.max(0.05, Math.min(0.9, 0.35 + r / 100 - (s.rival === from ? 0.3 : 0) - me.aggression / 200));
  if (rand(s) < chance) {
    s.embargoes = s.embargoes.filter((k) => k !== `${from}>${id}`);
    addRel(s, id, from, 5);
    log(s, `🕊️ ${nm(s, from)} lève son embargo contre ${nm(s, id)}.`, 'diplo', [id, from]);
    return { ok: true, msg: `${nm(s, from)} accepte de lever ses sanctions` };
  }
  addRel(s, id, from, -5);
  return { ok: false, msg: `${nm(s, from)} refuse (chances : ${Math.round(chance * 100)} %)` };
}

export const LIFT_COST = 25;

/** Chances de succès affichées avant de négocier. */
export function liftChance(s: GameState, id: Id, from: Id): number {
  return Math.max(0.05, Math.min(0.9, 0.35 + rel(s, id, from) / 100 - (s.rival === from ? 0.3 : 0) - s.nations[id].aggression / 200));
}
