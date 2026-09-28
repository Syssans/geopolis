import { rand } from './rng';
import {
  addRel, atWar, clamp, gdpOf, hasTrade, inReach, log, nm, pairKey, power, rel, sameBloc, sanctions, warBetween,
} from './state';
import { canDeclareWar, declareWar, leaveBloc } from './war';
import type { GameState, Id, Points, World } from './types';

export interface ActionResult {
  ok: boolean;
  msg: string;
}

export interface Cost {
  pol?: number;
  dip?: number;
  mil?: number;
  money?: number;
}

const fail = (msg: string): ActionResult => ({ ok: false, msg });

export function canPay(s: GameState, id: Id, c: Cost): boolean {
  const n = s.nations[id];
  return (
    n.points.pol >= (c.pol ?? 0) &&
    n.points.dip >= (c.dip ?? 0) &&
    n.points.mil >= (c.mil ?? 0) &&
    (c.money ? n.treasury >= c.money : true)
  );
}

function pay(s: GameState, id: Id, c: Cost) {
  const n = s.nations[id];
  (['pol', 'dip', 'mil'] as (keyof Points)[]).forEach((k) => (n.points[k] -= c[k] ?? 0));
  n.treasury -= c.money ?? 0;
}

// ————— Politique intérieure —————

export const COSTS = {
  reform: (s: GameState, id: Id): Cost => ({ pol: 80 + Math.round(s.nations[id].growthBonus * 200) }),
  stabilize: (): Cost => ({ pol: 50 }),
  invest: (s: GameState, id: Id): Cost => ({ money: Math.round(gdpOf(s, id) * 0.03 * 10) / 10 }),
  integrate: (): Cost => ({ pol: 40 }),
  tech: (s: GameState, id: Id): Cost => ({ mil: 50 + 15 * s.nations[id].tech }),
  mobilize: (): Cost => ({ mil: 40 }),
  nuke: (s: GameState, id: Id): Cost => ({ pol: 100, mil: 150, money: Math.max(20, gdpOf(s, id) * 0.02) }),
  improve: (): Cost => ({ dip: 25 }),
  trade: (): Cost => ({ dip: 30 }),
  sanction: (): Cost => ({ dip: 15 }),
  claim: (): Cost => ({ dip: 50 }),
  alliance: (): Cost => ({ dip: 40 }),
  aid: (s: GameState, id: Id): Cost => ({ money: Math.max(0.5, Math.round(gdpOf(s, id) * 0.004 * 10) / 10) }),
  destabilize: (): Cost => ({ mil: 30, dip: 10 }),
};

export function reform(s: GameState, id: Id): ActionResult {
  const n = s.nations[id];
  if (n.growthBonus >= 1) return fail('Réformes déjà au maximum');
  const c = COSTS.reform(s, id);
  if (!canPay(s, id, c)) return fail('Capital politique insuffisant');
  pay(s, id, c);
  n.growthBonus = Math.round((n.growthBonus + 0.1) * 100) / 100;
  n.stability = clamp(n.stability - 3, 0, 100);
  return { ok: true, msg: 'Réforme adoptée : +0,1 pt de croissance' };
}

export function stabilize(s: GameState, id: Id): ActionResult {
  const n = s.nations[id];
  if (n.stability >= 95) return fail('Stabilité déjà maximale');
  const c = COSTS.stabilize();
  if (!canPay(s, id, c)) return fail('Capital politique insuffisant');
  pay(s, id, c);
  n.stability = clamp(n.stability + 10, 0, 100);
  return { ok: true, msg: 'Stabilité +10' };
}

export function invest(s: GameState, id: Id): ActionResult {
  const n = s.nations[id];
  if (n.modifiers.some((m) => m.id === 'invest')) return fail('Un plan est déjà en cours');
  const c = COSTS.invest(s, id);
  if (!canPay(s, id, c)) return fail('Trésor insuffisant');
  pay(s, id, c);
  n.modifiers.push({ id: 'invest', label: "Plan d'investissement", months: 36, growth: 0.5 });
  return { ok: true, msg: "Plan d'investissement lancé : +0,5 pt de croissance pendant 3 ans" };
}

export function integrate(s: GameState, id: Id, territory: Id): ActionResult {
  const t = s.territories[territory];
  if (!t || t.owner !== id || t.integration >= 100) return fail('Rien à intégrer');
  if (t.occupiedBy) return fail('Territoire occupé');
  const c = COSTS.integrate();
  if (!canPay(s, id, c)) return fail('Capital politique insuffisant');
  pay(s, id, c);
  t.integration = Math.min(100, t.integration + 50);
  if (t.integration >= 100) t.core = id;
  return { ok: true, msg: `${t.name} : intégration ${t.integration}%` };
}

export function setMilitaryBudget(s: GameState, id: Id, pct: number) {
  s.nations[id].milPct = clamp(Math.round(pct * 10) / 10, 0.3, 15);
}

export function modernize(s: GameState, id: Id): ActionResult {
  const n = s.nations[id];
  if (n.tech >= 15) return fail('Technologie maximale');
  const c = COSTS.tech(s, id);
  if (!canPay(s, id, c)) return fail('Doctrine militaire insuffisante');
  pay(s, id, c);
  n.tech++;
  return { ok: true, msg: `Technologie militaire niveau ${n.tech}` };
}

export function mobilize(s: GameState, id: Id): ActionResult {
  const n = s.nations[id];
  if (n.modifiers.some((m) => m.id === 'mobilized')) return fail('Déjà mobilisé');
  const c = COSTS.mobilize();
  if (!canPay(s, id, c)) return fail('Doctrine militaire insuffisante');
  pay(s, id, c);
  n.strength *= 1.25;
  n.stability = clamp(n.stability - 8, 0, 100);
  n.modifiers.push({ id: 'mobilized', label: 'Mobilisation générale', months: 12, growth: -1 });
  return { ok: true, msg: 'Mobilisation générale : puissance +25 %' };
}

export function startNuclearProgram(s: GameState, id: Id): ActionResult {
  const n = s.nations[id];
  if (n.nuclear || n.nukeProgram !== null) return fail('Programme déjà existant');
  const c = COSTS.nuke(s, id);
  if (!canPay(s, id, c)) return fail('Ressources insuffisantes');
  pay(s, id, c);
  n.nukeProgram = 36;
  s.tension = clamp(s.tension + 15, 0, 100);
  for (const o of Object.values(s.nations)) if (o.alive && o.nuclear && o.id !== id) addRel(s, id, o.id, -25);
  log(s, `${n.name} lance un programme nucléaire militaire. Inquiétude internationale.`, 'war', [id]);
  return { ok: true, msg: 'Programme nucléaire lancé (36 mois)' };
}

// ————— Diplomatie —————

export function improveRelations(s: GameState, id: Id, target: Id): ActionResult {
  if (rel(s, id, target) >= 100) return fail('Relations déjà au maximum');
  if (warBetween(s, id, target)) return fail('Impossible en temps de guerre');
  const c = COSTS.improve();
  if (!canPay(s, id, c)) return fail('Influence insuffisante');
  pay(s, id, c);
  addRel(s, id, target, 15);
  return { ok: true, msg: `Relations avec ${nm(s, target)} +15` };
}

export function signTrade(s: GameState, id: Id, target: Id): ActionResult {
  if (hasTrade(s, id, target)) return fail('Accord déjà en vigueur');
  if (warBetween(s, id, target)) return fail('Impossible en temps de guerre');
  if (sanctions(s, id, target) || sanctions(s, target, id)) return fail('Sanctions en vigueur');
  const c = COSTS.trade();
  if (!canPay(s, id, c)) return fail('Influence insuffisante');
  if (rel(s, id, target) < 0 && target !== s.player) {
    pay(s, id, { dip: 10 });
    return fail(`${nm(s, target)} refuse (relations trop froides)`);
  }
  pay(s, id, c);
  s.trades.push(pairKey(id, target));
  addRel(s, id, target, 5);
  log(s, `Accord commercial ${nm(s, id)} – ${nm(s, target)}.`, 'eco', [id, target]);
  return { ok: true, msg: `Accord commercial signé avec ${nm(s, target)}` };
}

export function cancelTrade(s: GameState, id: Id, target: Id): ActionResult {
  if (!hasTrade(s, id, target)) return fail('Aucun accord');
  s.trades = s.trades.filter((k) => k !== pairKey(id, target));
  addRel(s, id, target, -15);
  return { ok: true, msg: 'Accord commercial rompu' };
}

export function toggleSanctions(s: GameState, id: Id, target: Id): ActionResult {
  const k = `${id}>${target}`;
  if (s.sanctions.includes(k)) {
    s.sanctions = s.sanctions.filter((x) => x !== k);
    addRel(s, id, target, 10);
    log(s, `${nm(s, id)} lève ses sanctions contre ${nm(s, target)}.`, 'diplo', [id, target]);
    return { ok: true, msg: 'Sanctions levées' };
  }
  const c = COSTS.sanction();
  if (!canPay(s, id, c)) return fail('Influence insuffisante');
  pay(s, id, c);
  s.sanctions.push(k);
  s.trades = s.trades.filter((x) => x !== pairKey(id, target));
  addRel(s, id, target, -30);
  log(s, `${nm(s, id)} impose des sanctions à ${nm(s, target)}.`, 'diplo', [id, target]);
  return { ok: true, msg: `Sanctions imposées à ${nm(s, target)}` };
}

export function fabricateClaim(s: GameState, w: World, id: Id, target: Id): ActionResult {
  const n = s.nations[id];
  if (n.claims.includes(target)) return fail('Casus belli déjà détenu');
  if (n.cbProgress) return fail('Un casus belli est déjà en préparation');
  if (!inReach(s, w, id, target)) return fail('Hors de portée');
  const c = COSTS.claim();
  if (!canPay(s, id, c)) return fail('Influence insuffisante');
  pay(s, id, c);
  n.cbProgress = { target, months: 6 };
  return { ok: true, msg: `Préparation d'un casus belli contre ${nm(s, target)} (6 mois)` };
}

/** Invite la cible dans son bloc (ou crée un bloc à deux). */
export function proposeAlliance(s: GameState, id: Id, target: Id): ActionResult {
  const me = s.nations[id];
  const t = s.nations[target];
  if (sameBloc(s, id, target)) return fail('Déjà alliés');
  if (me.bloc && s.blocs[me.bloc].leader !== id) return fail('Seul le meneur du bloc peut inviter');
  if (warBetween(s, id, target)) return fail('Vous êtes en guerre');
  const c = COSTS.alliance();
  if (!canPay(s, id, c)) return fail('Influence insuffisante');
  pay(s, id, c);
  const accept =
    !t.bloc &&
    rel(s, id, target) >= 50 &&
    power(me) >= power(t) * 0.4 &&
    !atWarWithBlocOf(s, target, id);
  if (!accept) {
    return fail(
      t.bloc ? `${t.name} appartient déjà au bloc ${s.blocs[t.bloc].name}` : `${t.name} décline (relations ≥ 50 requises)`,
    );
  }
  addToBloc(s, id, target);
  return { ok: true, msg: `${t.name} rejoint votre alliance` };
}

/** Demande à rejoindre le bloc de la cible. */
export function requestJoinBloc(s: GameState, id: Id, target: Id): ActionResult {
  const me = s.nations[id];
  const t = s.nations[target];
  if (!t.bloc) return fail(`${t.name} n'a pas de bloc`);
  const b = s.blocs[t.bloc];
  if (me.bloc === b.id) return fail('Déjà membre');
  if (me.bloc) return fail('Quittez d’abord votre bloc actuel');
  const c = COSTS.alliance();
  if (!canPay(s, id, c)) return fail('Influence insuffisante');
  pay(s, id, c);
  const hostile = b.members.some((m) => warBetween(s, id, m) || rel(s, id, m) < -20);
  const ok = rel(s, id, b.leader) >= 40 && me.aggression < 30 && !hostile && !atWar(s, id);
  if (!ok) return fail(`${nm(s, b.leader)} refuse votre adhésion (relations ≥ 40 avec le meneur, pas de guerre ni d'agressivité)`);
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

function atWarWithBlocOf(s: GameState, target: Id, id: Id) {
  const b = s.nations[id].bloc;
  return !!b && s.blocs[b].members.some((m) => warBetween(s, m, target));
}

export function sendAid(s: GameState, id: Id, target: Id): ActionResult {
  const c = COSTS.aid(s, id);
  if (!canPay(s, id, c)) return fail('Trésor insuffisant');
  pay(s, id, c);
  s.nations[target].treasury += c.money!;
  addRel(s, id, target, 12);
  s.nations[target].stability = clamp(s.nations[target].stability + 2, 0, 100);
  return { ok: true, msg: `Aide de ${c.money} Md$ envoyée : relations +12` };
}

export function destabilize(s: GameState, id: Id, target: Id): ActionResult {
  const c = COSTS.destabilize();
  if (!canPay(s, id, c)) return fail('Ressources insuffisantes');
  pay(s, id, c);
  const t = s.nations[target];
  t.stability = clamp(t.stability - 10, 0, 100);
  if (rand(s) < 0.35) {
    addRel(s, id, target, -35);
    log(s, `Scandale : une opération de ${nm(s, id)} contre ${t.name} est révélée.`, 'diplo', [id, target]);
    return { ok: true, msg: `Opération réussie mais découverte ! Relations −35` };
  }
  return { ok: true, msg: `Opération discrète réussie : stabilité de ${t.name} −10` };
}

export function warAction(s: GameState, w: World, id: Id, target: Id): ActionResult {
  const chk = canDeclareWar(s, w, id, target);
  if (!chk.ok) return fail(chk.reason!);
  const war = declareWar(s, w, id, target);
  return war ? { ok: true, msg: `Guerre déclarée à ${nm(s, target)}` } : fail('Impossible');
}
