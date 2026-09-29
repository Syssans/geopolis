import { HOLY_SITES, RELIGIONS } from '../data/religions';
import { STRAITS, TRADE_NODES } from '../data/trade';
import { POLICIES } from './religion';
import { rand } from './rng';
import {
  addRel, alive, atWar, clamp, devOf, hasTrade, inReach, log, nm, owned, pairKey, power, rel, sameBloc, warBetween,
} from './state';
import { straitOwner, upstreamOf } from './trade';
import { canDeclareWar, declareWar, leaveBloc } from './war';
import type { GameState, Id, Pid, Policy, World } from './types';

export interface ActionResult {
  ok: boolean;
  msg: string;
}

export interface Cost {
  money?: number;
  influence?: number;
  fervor?: number;
}

const fail = (msg: string): ActionResult => ({ ok: false, msg });

export function canPay(s: GameState, id: Id, c: Cost): boolean {
  const n = s.nations[id];
  // Un trésor négatif (faillite) n'empêche que les dépenses d'argent, pas les actions payées en influence ou en ferveur
  return (!c.money || n.treasury >= c.money) && n.influence >= (c.influence ?? 0) && n.fervor >= (c.fervor ?? 0);
}

function pay(s: GameState, id: Id, c: Cost) {
  const n = s.nations[id];
  n.treasury -= c.money ?? 0;
  n.influence -= c.influence ?? 0;
  n.fervor -= c.fervor ?? 0;
}

export const COSTS = {
  recruit: (s: GameState, id: Id): Cost => ({ money: Math.round(recruitSize(s.nations[id].army) * 3 * 10) / 10 }),
  fleet: (s: GameState, id: Id): Cost => ({ money: Math.round(recruitSize(s.nations[id].navy) * 6 * 10) / 10 }),
  unity: (): Cost => ({ fervor: 40 }),
  integrate: (): Cost => ({ influence: 30 }),
  nuke: (s: GameState, id: Id): Cost => ({ influence: 100, money: Math.max(20, devOf(s, id) * 0.3) }),
  missionary: (): Cost => ({ fervor: 30 }),
  appeal: (): Cost => ({ fervor: 50 }),
  closeStrait: (): Cost => ({ influence: 30 }),
  improve: (): Cost => ({ influence: 25 }),
  trade: (): Cost => ({ influence: 30 }),
  embargo: (): Cost => ({ influence: 15 }),
  claim: (): Cost => ({ influence: 50 }),
  holyClaim: (): Cost => ({ fervor: 60 }),
  alliance: (): Cost => ({ influence: 40 }),
  aid: (s: GameState, id: Id): Cost => ({ money: Math.max(1, Math.round(s.nations[id].treasury * 0.05)) }),
  support: (): Cost => ({ fervor: 40, influence: 20 }),
};

const recruitSize = (current: number) => Math.max(1, Math.round(current * 0.1));

// ————— Armée —————

export function recruit(s: GameState, id: Id, naval = false): ActionResult {
  const n = s.nations[id];
  const c = naval ? COSTS.fleet(s, id) : COSTS.recruit(s, id);
  if (!canPay(s, id, c)) return fail('Trésor insuffisant');
  pay(s, id, c);
  const add = recruitSize(naval ? n.navy : n.army);
  if (naval) n.navy += add;
  else n.army += add;
  return { ok: true, msg: naval ? `+${add} flotte(s)` : `+${add} division(s)` };
}

export function disband(s: GameState, id: Id, naval = false): ActionResult {
  const n = s.nations[id];
  const cur = naval ? n.navy : n.army;
  if (cur < 1) return fail('Rien à démobiliser');
  const rem = Math.min(cur, recruitSize(cur));
  if (naval) n.navy -= rem;
  else n.army -= rem;
  return { ok: true, msg: naval ? `−${rem} flotte(s)` : `−${rem} division(s)` };
}

export function startNuclearProgram(s: GameState, id: Id): ActionResult {
  const n = s.nations[id];
  if (n.nuclear || n.nukeProgram !== null) return fail('Programme déjà existant');
  const c = COSTS.nuke(s, id);
  if (!canPay(s, id, c)) return fail('Ressources insuffisantes');
  pay(s, id, c);
  n.nukeProgram = 36;
  s.tension = clamp(s.tension + 15, 0, 100);
  for (const o of alive(s)) if (o.nuclear && o.id !== id) addRel(s, id, o.id, -25);
  log(s, `${n.name} lance un programme nucléaire militaire. Inquiétude internationale.`, 'war', [id]);
  return { ok: true, msg: 'Programme nucléaire lancé (36 mois)' };
}

// ————— Intérieur & religion —————

export function nationalUnity(s: GameState, id: Id): ActionResult {
  const n = s.nations[id];
  if (n.stability >= 95) return fail('Stabilité déjà maximale');
  if (!canPay(s, id, COSTS.unity())) return fail('Ferveur insuffisante');
  pay(s, id, COSTS.unity());
  n.stability = clamp(n.stability + 10, 0, 100);
  return { ok: true, msg: 'Appel à l’unité nationale : stabilité +10' };
}

export function integrate(s: GameState, id: Id, pid: Pid): ActionResult {
  const p = s.provinces[pid];
  if (p.owner !== id || p.integration >= 100) return fail('Rien à intégrer');
  if (p.occupiedBy || p.revolt) return fail('Province instable');
  if (!canPay(s, id, COSTS.integrate())) return fail('Influence insuffisante');
  pay(s, id, COSTS.integrate());
  p.integration = Math.min(100, p.integration + 50);
  if (p.integration >= 100) p.core = id;
  return { ok: true, msg: `Intégration ${p.integration} %` };
}

export function setPolicy(s: GameState, w: World, id: Id, policy: Policy): ActionResult {
  const n = s.nations[id];
  if (n.policy === policy) return fail('Déjà en vigueur');
  if (n.policyCooldown > 0) return fail(`Changement possible dans ${n.policyCooldown} mois`);
  n.policy = policy;
  n.policyCooldown = 24;
  if (policy === 'proselytisme')
    for (const o of alive(s)) if (o.id !== id && o.religion !== n.religion && inReach(s, w, id, o.id, false)) addRel(s, id, o.id, -10);
  if (policy === 'tolerance') for (const o of alive(s)) if (o.religion !== n.religion && inReach(s, w, id, o.id, false)) addRel(s, id, o.id, 5);
  log(s, `${n.name} adopte une politique religieuse de ${POLICIES[policy].name.toLowerCase()}.`, 'religion', [id]);
  return { ok: true, msg: `Politique : ${POLICIES[policy].name}` };
}

export function sendMissionary(s: GameState, id: Id, pid: Pid): ActionResult {
  const n = s.nations[id];
  const p = s.provinces[pid];
  if (p.owner !== id) return fail('Province étrangère');
  if (p.religion === n.religion) return fail('Déjà convertie');
  if (p.revolt) return fail('Province en insurrection');
  if (!canPay(s, id, COSTS.missionary())) return fail('Ferveur insuffisante');
  pay(s, id, COSTS.missionary());
  n.missionary = pid;
  n.missionProgress = 0;
  return { ok: true, msg: 'Missionnaires envoyés' };
}

export function recallMissionary(s: GameState, id: Id): ActionResult {
  s.nations[id].missionary = null;
  s.nations[id].missionProgress = 0;
  return { ok: true, msg: 'Missionnaires rappelés' };
}

export function appealToFaithful(s: GameState, id: Id): ActionResult {
  const n = s.nations[id];
  if (!canPay(s, id, COSTS.appeal())) return fail('Ferveur insuffisante');
  pay(s, id, COSTS.appeal());
  let k = 0;
  for (const o of alive(s))
    if (o.id !== id && o.religion === n.religion) {
      addRel(s, id, o.id, 10);
      k++;
    }
  n.influence += 20;
  return { ok: true, msg: `Relations +10 avec ${k} nation(s) ${RELIGIONS[n.religion].adj}(s), influence +20` };
}

/** Soutenir les insurgés d'une province étrangère. */
export function supportRebels(s: GameState, w: World, id: Id, pid: Pid): ActionResult {
  const p = s.provinces[pid];
  const n = s.nations[id];
  if (p.owner === id) return fail('C’est votre province');
  if (sameBloc(s, id, p.owner)) return fail('Allié');
  if (p.religion === s.nations[p.owner].religion && p.core === p.owner) return fail('Aucune minorité à soutenir ici');
  if (p.supportedBy) return fail('Déjà soutenue');
  if (!inReach(s, w, id, p.owner)) return fail('Hors de portée');
  if (!canPay(s, id, COSTS.support())) return fail('Ressources insuffisantes');
  pay(s, id, COSTS.support());
  p.supportedBy = id;
  p.supportMonths = 24;
  if (p.religion === n.religion) n.fervor += 10;
  if (rand(s) < 0.5) {
    addRel(s, id, p.owner, -25);
    log(s, `${n.name} est accusé d’armer les insurgés de ${w.provinces[pid].name}.`, 'religion', [id, p.owner]);
    return { ok: true, msg: 'Soutien engagé… mais découvert (relations −25)' };
  }
  return { ok: true, msg: 'Soutien discret engagé pour 2 ans' };
}

/** Raisons de guerre sainte contre une nation. */
export function holyWarReasons(s: GameState, w: World, id: Id, target: Id): string[] {
  const n = s.nations[id];
  const t = s.nations[target];
  if (t.religion === n.religion) return [];
  const res: string[] = [];
  for (const h of HOLY_SITES)
    if (h.religions.includes(n.religion)) {
      const info = w.provinces.find((p) => p.holy?.some((x) => x.name === h.name));
      if (info && s.provinces[info.id].owner === target) res.push(`Détient ${h.name}`);
    }
  const persecuted = owned(s, target).some((pid) => s.provinces[pid].religion === n.religion);
  if (persecuted && t.policy === 'proselytisme') res.push(`Persécute nos coreligionnaires`);
  if (t.missionary !== null && s.provinces[t.missionary].religion === n.religion) res.push('Convertit de force nos fidèles');
  return res;
}

export function holyWarClaim(s: GameState, w: World, id: Id, target: Id): ActionResult {
  const n = s.nations[id];
  if (n.holyClaims.includes(target)) return fail('Guerre sainte déjà justifiée');
  if (!holyWarReasons(s, w, id, target).length) return fail('Aucun motif religieux');
  if (!canPay(s, id, COSTS.holyClaim())) return fail('Ferveur insuffisante');
  pay(s, id, COSTS.holyClaim());
  n.holyClaims.push(target);
  log(s, `${n.name} proclame un casus belli religieux contre ${nm(s, target)}.`, 'religion', [id, target]);
  return { ok: true, msg: 'Casus belli de guerre sainte obtenu' };
}

// ————— Commerce —————

export function merchantSlots(s: GameState, id: Id): number {
  const n = s.nations[id];
  const d = devOf(s, id);
  return 2 + (d > 300 ? 1 : 0) + (d > 900 ? 1 : 0) + (n.bloc && s.blocs[n.bloc].leader === id ? 1 : 0);
}

/** Nœuds où l'on peut envoyer un marchand : ceux où l'on a des provinces et leurs voisins amont. */
export function merchantNodes(s: GameState, w: World, id: Id): string[] {
  const set = new Set<string>();
  for (const pid of owned(s, id)) set.add(w.provinces[pid].node);
  for (const n of [...set]) for (const u of upstreamOf(n)) set.add(u);
  return TRADE_NODES.filter((n) => set.has(n.id)).map((n) => n.id);
}

export function setMerchant(s: GameState, w: World, id: Id, slot: number, node: string | null, mode: 'collect' | 'steer' = 'steer', target?: string): ActionResult {
  const n = s.nations[id];
  if (slot >= merchantSlots(s, id)) return fail('Pas de marchand disponible');
  const list = n.merchants.slice();
  if (node === null) {
    list.splice(slot, 1);
    n.merchants = list;
    return { ok: true, msg: 'Marchand rappelé' };
  }
  if (!merchantNodes(s, w, id).includes(node)) return fail('Nœud hors de portée');
  const def = TRADE_NODES.find((x) => x.id === node)!;
  if (mode === 'steer' && !def.out.length) mode = 'collect';
  if (mode === 'steer' && (!target || !def.out.includes(target))) target = def.out[0];
  const m = { node, mode, target: mode === 'steer' ? target : undefined };
  if (slot < list.length) list[slot] = m;
  else list.push(m);
  n.merchants = list;
  return { ok: true, msg: `Marchand : ${mode === 'collect' ? 'collecte' : 'oriente'} à ${def.name}` };
}

export function toggleStrait(s: GameState, w: World, id: Id, strait: string): ActionResult {
  const n = s.nations[id];
  if (straitOwner(s, w, strait) !== id) return fail('Vous ne contrôlez pas ce détroit');
  const def = STRAITS.find((x) => x.id === strait)!;
  if (n.closedStraits.includes(strait)) {
    n.closedStraits = n.closedStraits.filter((x) => x !== strait);
    s.tension = clamp(s.tension - 5, 0, 100);
    log(s, `${n.name} rouvre ${def.name}.`, 'trade', [id]);
    return { ok: true, msg: `${def.name} rouvert` };
  }
  if (!canPay(s, id, COSTS.closeStrait())) return fail('Influence insuffisante');
  pay(s, id, COSTS.closeStrait());
  n.closedStraits.push(strait);
  s.tension = clamp(s.tension + 10, 0, 100);
  for (const o of alive(s)) if (o.id !== id && !atWar(s, o.id) && devOf(s, o.id) > 150) addRel(s, id, o.id, -15);
  log(s, `⚓ ${n.name} ferme ${def.name} ! Les marchés s’affolent.`, 'trade', [id]);
  return { ok: true, msg: `${def.name} fermé` };
}

// ————— Diplomatie —————

export function improveRelations(s: GameState, id: Id, target: Id): ActionResult {
  if (rel(s, id, target) >= 100) return fail('Relations déjà au maximum');
  if (warBetween(s, id, target)) return fail('Impossible en temps de guerre');
  if (!canPay(s, id, COSTS.improve())) return fail('Influence insuffisante');
  pay(s, id, COSTS.improve());
  addRel(s, id, target, 15);
  return { ok: true, msg: `Relations avec ${nm(s, target)} +15` };
}

export function signTrade(s: GameState, id: Id, target: Id): ActionResult {
  if (hasTrade(s, id, target)) return fail('Accord déjà en vigueur');
  if (warBetween(s, id, target)) return fail('Impossible en temps de guerre');
  if (s.embargoes.includes(`${id}>${target}`) || s.embargoes.includes(`${target}>${id}`)) return fail('Embargo en vigueur');
  if (!canPay(s, id, COSTS.trade())) return fail('Influence insuffisante');
  if (rel(s, id, target) < 0 && target !== s.player) {
    pay(s, id, { influence: 10 });
    return fail(`${nm(s, target)} refuse (relations trop froides)`);
  }
  pay(s, id, COSTS.trade());
  s.trades.push(pairKey(id, target));
  addRel(s, id, target, 5);
  log(s, `Accord commercial ${nm(s, id)} – ${nm(s, target)}.`, 'trade', [id, target]);
  return { ok: true, msg: `Accord commercial signé avec ${nm(s, target)}` };
}

export function cancelTrade(s: GameState, id: Id, target: Id): ActionResult {
  if (!hasTrade(s, id, target)) return fail('Aucun accord');
  s.trades = s.trades.filter((k) => k !== pairKey(id, target));
  addRel(s, id, target, -15);
  return { ok: true, msg: 'Accord commercial rompu' };
}

export function toggleEmbargo(s: GameState, id: Id, target: Id): ActionResult {
  const k = `${id}>${target}`;
  if (s.embargoes.includes(k)) {
    s.embargoes = s.embargoes.filter((x) => x !== k);
    addRel(s, id, target, 10);
    log(s, `${nm(s, id)} lève son embargo contre ${nm(s, target)}.`, 'trade', [id, target]);
    return { ok: true, msg: 'Embargo levé' };
  }
  if (!canPay(s, id, COSTS.embargo())) return fail('Influence insuffisante');
  pay(s, id, COSTS.embargo());
  s.embargoes.push(k);
  s.trades = s.trades.filter((x) => x !== pairKey(id, target));
  addRel(s, id, target, -30);
  log(s, `${nm(s, id)} décrète un embargo contre ${nm(s, target)}.`, 'trade', [id, target]);
  return { ok: true, msg: `Embargo contre ${nm(s, target)}` };
}

export function fabricateClaim(s: GameState, w: World, id: Id, target: Id): ActionResult {
  const n = s.nations[id];
  if (n.claims.includes(target)) return fail('Casus belli déjà détenu');
  if (n.cbProgress) return fail('Un casus belli est déjà en préparation');
  if (!inReach(s, w, id, target)) return fail('Hors de portée');
  if (!canPay(s, id, COSTS.claim())) return fail('Influence insuffisante');
  pay(s, id, COSTS.claim());
  n.cbProgress = { target, months: 6 };
  return { ok: true, msg: `Préparation d'un casus belli contre ${nm(s, target)} (6 mois)` };
}

export function proposeAlliance(s: GameState, id: Id, target: Id): ActionResult {
  const me = s.nations[id];
  const t = s.nations[target];
  if (sameBloc(s, id, target)) return fail('Déjà alliés');
  if (me.bloc && s.blocs[me.bloc].leader !== id) return fail('Seul le meneur du bloc peut inviter');
  if (warBetween(s, id, target)) return fail('Vous êtes en guerre');
  if (!canPay(s, id, COSTS.alliance())) return fail('Influence insuffisante');
  pay(s, id, COSTS.alliance());
  const needed = me.religion === t.religion ? 35 : 50;
  const accept = !t.bloc && rel(s, id, target) >= needed && power(me) >= power(t) * 0.4;
  if (!accept)
    return fail(t.bloc ? `${t.name} appartient déjà au bloc ${s.blocs[t.bloc].name}` : `${t.name} décline (relations ≥ ${needed} requises)`);
  addToBloc(s, id, target);
  return { ok: true, msg: `${t.name} rejoint votre alliance` };
}

export function requestJoinBloc(s: GameState, id: Id, target: Id): ActionResult {
  const me = s.nations[id];
  const t = s.nations[target];
  if (!t.bloc) return fail(`${t.name} n'a pas de bloc`);
  const b = s.blocs[t.bloc];
  if (me.bloc === b.id) return fail('Déjà membre');
  if (me.bloc) return fail('Quittez d’abord votre bloc actuel');
  if (!canPay(s, id, COSTS.alliance())) return fail('Influence insuffisante');
  pay(s, id, COSTS.alliance());
  const hostile = b.members.some((m) => warBetween(s, id, m) || rel(s, id, m) < -20);
  const ok = rel(s, id, b.leader) >= 40 && me.aggression < 30 && !hostile && !atWar(s, id);
  if (!ok) return fail(`${nm(s, b.leader)} refuse (relations ≥ 40 avec le meneur, pas de guerre ni d'agressivité)`);
  b.members.push(id);
  me.bloc = b.id;
  for (const m of b.members) if (m !== id) addRel(s, id, m, 10);
  log(s, `${me.name} rejoint le bloc ${b.name}.`, 'diplo', [id, ...b.members]);
  return { ok: true, msg: `Vous rejoignez le bloc ${b.name}` };
}

export function quitBloc(s: GameState, id: Id): ActionResult {
  if (!s.nations[id].bloc) return fail('Aucun bloc');
  leaveBloc(s, id);
  s.nations[id].stability = clamp(s.nations[id].stability - 5, 0, 100);
  return { ok: true, msg: 'Vous avez quitté votre bloc' };
}

export function addToBloc(s: GameState, leader: Id, target: Id) {
  const me = s.nations[leader];
  let bloc = me.bloc;
  if (!bloc) {
    bloc = `bloc-${leader}`;
    s.blocs[bloc] = { id: bloc, name: `Pacte de ${me.name}`, color: '#d4a017', leader, members: [leader] };
    me.bloc = bloc;
  }
  s.blocs[bloc].members.push(target);
  s.nations[target].bloc = bloc;
  addRel(s, leader, target, 10);
  log(s, `${s.nations[target].name} rejoint le bloc ${s.blocs[bloc].name}.`, 'diplo', [leader, target]);
}

export function sendAid(s: GameState, id: Id, target: Id): ActionResult {
  const c = COSTS.aid(s, id);
  if (!canPay(s, id, c)) return fail('Trésor insuffisant');
  pay(s, id, c);
  s.nations[target].treasury += c.money!;
  addRel(s, id, target, 12);
  return { ok: true, msg: `Aide de ${c.money} Md$ envoyée : relations +12` };
}

export function warAction(s: GameState, w: World, id: Id, target: Id): ActionResult {
  const chk = canDeclareWar(s, w, id, target);
  if (!chk.ok) return fail(chk.reason!);
  return declareWar(s, w, id, target) ? { ok: true, msg: `Guerre déclarée à ${nm(s, target)}` } : fail('Impossible');
}
