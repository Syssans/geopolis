import { holyHolders, RELIGIONS, religiousDistance } from '../data/religions';
import { rand } from './rng';
import { addRel, alive, clamp, invalidate, invalidateAlive, log, nm, power } from './state';
import type { GameState, Id, Pid, Policy, World } from './types';

export const POLICIES: Record<Policy, { name: string; desc: string; unrest: number; fervor: number; mission: number }> = {
  tolerance: { name: 'Tolérance', desc: 'Minorités apaisées, ferveur faible, missionnaires lents.', unrest: 0.4, fervor: -0.5, mission: 0.5 },
  neutre: { name: 'Neutralité', desc: 'Équilibre entre ferveur et paix civile.', unrest: 1, fervor: 0, mission: 1 },
  proselytisme: { name: 'Prosélytisme', desc: 'Ferveur et conversions rapides, mais minorités en colère et voisins méfiants.', unrest: 1.4, fervor: 2, mission: 1.6 },
};

/** Agitation vers laquelle tend une province (0-100). */
export function unrestTarget(s: GameState, w: World, pid: Pid): { total: number; parts: { label: string; value: number }[] } {
  const p = s.provinces[pid];
  const owner = s.nations[p.owner];
  const parts: { label: string; value: number }[] = [];
  const d = religiousDistance(p.religion, owner.religion);
  if (d > 0) parts.push({ label: `Minorité ${RELIGIONS[p.religion].adj}`, value: d * 65 * POLICIES[owner.policy].unrest });
  if (p.core !== p.owner) parts.push({ label: 'Territoire conquis', value: 20 });
  if (p.integration < 100) parts.push({ label: 'Intégration incomplète', value: (100 - p.integration) * 0.15 });
  if (p.occupiedBy) parts.push({ label: 'Occupation', value: 10 });
  if (p.supportedBy) parts.push({ label: `Soutien de ${nm(s, p.supportedBy)} aux insurgés`, value: 25 });
  if (owner.missionary === pid) parts.push({ label: 'Missionnaires', value: 15 });
  if (owner.exhaustion > 0) parts.push({ label: 'Lassitude de guerre', value: owner.exhaustion * 0.15 });
  parts.push({ label: 'Stabilité', value: -(owner.stability - 50) * 0.4 });
  const total = clamp(parts.reduce((a, x) => a + x.value, 0), 0, 100);
  return { total, parts };
}

const holyCache = new WeakMap<World, World['provinces']>();
export function holyProvinces(w: World) {
  let h = holyCache.get(w);
  if (!h) holyCache.set(w, (h = w.provinces.filter((p) => p.holy)));
  return h;
}

export function holySitesOf(s: GameState, w: World, id: Id) {
  const res: { pid: Pid; name: string; ours: boolean }[] = [];
  const rel = s.nations[id].religion;
  for (const info of holyProvinces(w))
    for (const h of info.holy!)
      if (holyHolders(h.name, s.provinces[info.id].owner, (x) => !!s.nations[x]?.alive).includes(id))
        res.push({ pid: info.id, name: h.name, ours: h.religions.includes(rel) });
  return res;
}

export function fervorGain(s: GameState, w: World, id: Id): number {
  const n = s.nations[id];
  const sites = holySitesOf(s, w, id).filter((h) => h.ours).length;
  return Math.max(0, 1 + sites * 3 + POLICIES[n.policy].fervor);
}

/** Progression mensuelle des missionnaires. */
export function missionSpeed(s: GameState, w: World, id: Id, pid: Pid): number {
  const n = s.nations[id];
  return Math.max(1, (4 - w.provinces[pid].dev / 10) * POLICIES[n.policy].mission + (n.fervor > 200 ? 1 : 0));
}

export function monthlyReligion(s: GameState, w: World) {
  // Agitation et insurrections
  s.provinces.forEach((p, pid) => {
    const t = unrestTarget(s, w, pid).total;
    p.unrest = clamp(p.unrest + (t - p.unrest) * 0.15, 0, 100);
    if (p.supportedBy && --p.supportMonths <= 0) p.supportedBy = null;
    const owner = s.nations[p.owner];
    if (!p.revolt) {
      if (p.unrest > 55 && !p.occupiedBy && rand(s) < (p.unrest - 55) / 500) {
        p.revolt = 1;
        log(s, `Insurrection ${RELIGIONS[p.religion].adj} en ${w.provinces[pid].name} (${owner.name}) !`, 'religion', [p.owner, p.supportedBy ?? '']);
      }
      return;
    }
    p.revolt++;
    owner.stability = clamp(owner.stability - 0.3, 0, 100);
    const rebels = w.provinces[pid].dev * 3 + (p.supportedBy ? 30 : 0) + 5;
    const crush = clamp((power(owner) / rebels) * 0.12, 0.04, 0.5);
    if (rand(s) < crush) {
      p.revolt = 0;
      p.unrest = Math.max(0, p.unrest - 30);
      if (p.owner === s.player || p.supportedBy === s.player)
        log(s, `L'insurrection en ${w.provinces[pid].name} est écrasée.`, 'religion', [p.owner, p.supportedBy ?? '']);
      return;
    }
    if (p.revolt >= 18) secede(s, w, pid);
  });

  for (const n of alive(s)) {
    n.fervor = Math.min(999, n.fervor + fervorGain(s, w, n.id));
    if (n.policyCooldown > 0) n.policyCooldown--;
    // Missionnaires
    if (n.missionary !== null) {
      const p = s.provinces[n.missionary];
      if (p.owner !== n.id || p.religion === n.religion) {
        n.missionary = null;
        n.missionProgress = 0;
      } else if (!p.revolt) {
        n.missionProgress += missionSpeed(s, w, n.id, n.missionary);
        if (n.missionProgress >= 100) {
          const name = w.provinces[n.missionary].name;
          p.religion = n.religion;
          p.unrest = Math.max(0, p.unrest - 20);
          n.missionary = null;
          n.missionProgress = 0;
          if (n.id === s.player) s.stats.converted++;
          log(s, `${name} se convertit à la foi ${RELIGIONS[n.religion].adj}.`, 'religion', [n.id]);
        }
      }
    }
  }
}

/**
 * Au bout de 18 mois d'insurrection : un territoire conquis retourne à son ancien maître ;
 * une province soutenue par un voisin coreligionnaire le rejoint ; sinon le pouvoir concède l'autonomie.
 */
function secede(s: GameState, w: World, pid: Pid) {
  const p = s.provinces[pid];
  const info = w.provinces[pid];
  const from = s.nations[p.owner];
  let to: Id | null = null;
  if (p.core !== p.owner) to = p.core;
  else {
    const near = new Set([...info.adj, ...info.sea].map((o) => s.provinces[o].owner).filter((o) => o !== p.owner));
    if (p.supportedBy && near.has(p.supportedBy) && s.nations[p.supportedBy].religion === p.religion) to = p.supportedBy;
  }
  p.revolt = 0;
  p.supportedBy = null;
  if (!to) {
    from.stability = clamp(from.stability - 6, 0, 100);
    p.unrest = 10;
    log(s, `${from.name} concède une large autonomie à ${info.name} pour mettre fin à l'insurrection.`, 'religion', [from.id]);
    return;
  }
  p.unrest = 30;
  const dest = s.nations[to];
  if (!dest.alive) {
    dest.alive = true;
    invalidateAlive(s);
    dest.army = Math.max(1, Math.round(info.dev / 4));
    dest.stability = 40;
    dest.treasury = 0;
  }
  p.owner = to;
  p.occupiedBy = null;
  p.integration = p.core === to ? 100 : 30;
  invalidate(s);
  addRel(s, from.id, to, -30);
  from.stability = clamp(from.stability - 8, 0, 100);
  log(s, `Sécession : ${info.name} quitte ${from.name} et rejoint ${dest.name} !`, 'religion', [from.id, to]);
}
