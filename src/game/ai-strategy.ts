/**
 * Stratégie de l'IA : chaque pays gère son budget comme un joueur humain. Il garde une réserve de précaution,
 * puis dépense le reste selon son tempérament : développement (modernisations, forages), niveau de vie,
 * armée et flotte, diplomatie (communautés économiques, alliances, aide). Ses estimations sont bruitées :
 * il peut se tromper (forage stérile, niveau de vie trop coûteux, armée surdimensionnée, départ d'une communauté…).
 */
import { COMMUNITIES } from '../data/communities';
import { TIERS } from '../data/tiers';
import { disband, improveRelations, proposeAlliance, recruit, sendAid } from './actions';
import { avgRelWith, canJoinCommunity, JOIN_COST, joinCommunity, leaveCommunity } from './communities';
import { DEPOSITS, MAX_LEVEL, prospect, prospectCost, upgrade, upgradeCost } from './economy';
import { rand } from './rng';
import { alive, atWar, clamp, communitiesOf, communityMembers, devOf, hasCoast, log, neighbours, owned, power, PROJECTION_MIN, rel, sameBloc, warBetween } from './state';
import { goodOf, production } from './trade';
import type { GameState, Id, Nation, World } from './types';

type Persona = NonNullable<Nation['persona']>;

export function personaOf(s: GameState, n: Nation): Persona {
  return (n.persona ??= { build: rand(s), diplo: rand(s), prudence: rand(s), ambition: clamp(n.hawk * 0.6 + rand(s) * 0.6, 0, 1) });
}

/** Erreur d'appréciation : un facteur autour de 1. */
const noise = (s: GameState, amp = 0.35) => 1 - amp + 2 * amp * rand(s);

/** Décalage stable par pays : les décisions lourdes sont étalées sur plusieurs mois. */
function slot(id: Id, period: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % period;
}

interface Budget {
  inc: number;
  upkeep: number;
  spend: number;
  net: number;
}

function budgetOf(n: Nation): Budget {
  const inc = n.income.production + n.income.trade + n.income.tolls;
  const spend = n.income.upkeep + (n.income.admin ?? 0) + (n.income.interest ?? 0);
  return { inc, upkeep: n.income.upkeep, spend, net: inc - spend };
}

/** Menace du voisin hostile le plus fort, rapportée à sa propre puissance ; `min` écarte d'avance les voisins trop faibles pour compter. */
export function threatOf(s: GameState, w: World, n: Nation, min = 0): number {
  const own = Math.max(power(n), 1);
  let t = min * own;
  let found = 0;
  for (const o of neighbours(s, w, n.id)) {
    const p = power(s.nations[o]);
    // La puissance d'abord (bon marché), les relations ensuite (coûteuses)
    if (p <= t) continue;
    if (rel(s, n.id, o) < -30 && !sameBloc(s, n.id, o)) (t = p), (found = p);
  }
  return found / own;
}

/** Décisions d'un pays IA pour le mois. */
export function aiStrategy(s: GameState, w: World, n: Nation) {
  const p = personaOf(s, n);
  const b = budgetOf(n);
  livingStandard(s, n, b, p);
  military(s, w, n, b, p, (s.month + slot(n.id, 3)) % 3 === 0);
  if ((s.month + slot(n.id, 3)) % 3 === 1) develop(s, w, n, b, p);
  if ((s.month + slot(n.id, 6)) % 6 === 2) {
    communities(s, n, p);
    alliances(s, w, n, p);
    aid(s, w, n, b, p);
  }
}

// ————— Niveau de vie —————

/**
 * La population est satisfaite quand l'État vit selon ses moyens ; elle souffre quand il est endetté.
 * Arrivé au seuil, le gouvernement décide (avec une estimation imparfaite) s'il peut se permettre
 * le palier suivant : un État plus coûteux, une économie plus productive.
 */
function livingStandard(s: GameState, n: Nation, b: Budget, p: Persona) {
  // Pleinement satisfaite quand l'excédent atteint 15 % des revenus ; en souffrance quand l'État est endetté
  const sat = n.treasury < 0 ? 0.55 : 0.8 + 0.12 * clamp(b.net / Math.max(0.01, b.inc * 0.15), -1, 1);
  n.aiSat = sat;
  // Le niveau de vie progresse lentement (un palier en une dizaine d'années au mieux) et recule plus vite
  let pts = clamp((n.prosperity ?? 10 + 50 * rand(s)) + (sat - 0.8) * (sat >= 0.8 ? 4 : 8), 0, 100);
  if (pts >= 100 && n.tier < TIERS.length) {
    const cur = TIERS[n.tier - 1];
    const next = TIERS[n.tier];
    const extra = devOf(s, n.id) * (next.admin - cur.admin) - b.inc * (next.productivity / cur.productivity - 1);
    const means = b.net * noise(s, 0.5) + Math.max(0, n.treasury) / (24 + 36 * p.prudence);
    if (extra <= means) {
      n.tier++;
      pts = 25;
      n.stability = clamp(n.stability + 5, 0, 100);
      if (devOf(s, n.id) >= 250) log(s, `📈 ${n.name} : la population passe au palier « ${next.icon} ${next.name} ».`, 'info', [n.id]);
    }
  } else if (pts <= 0 && n.tier > 1) {
    n.tier--;
    pts = 70;
    n.stability = clamp(n.stability - 10, 0, 100);
    const t = TIERS[n.tier - 1];
    if (devOf(s, n.id) >= 250) log(s, `📉 ${n.name} : pénuries, la population retombe au palier « ${t.icon} ${t.name} ».`, 'info', [n.id]);
  }
  n.prosperity = pts;
}

// ————— Développement —————

/** Réserve de précaution : quelques mois de dépenses, davantage pour un gouvernement prudent. */
const reserveOf = (b: Budget, p: Persona) => b.spend * (2 + 6 * p.prudence);

function develop(s: GameState, w: World, n: Nation, b: Budget, p: Persona) {
  let surplus = n.treasury - reserveOf(b, p);
  if (surplus <= 0) return;
  // Modernisations : la plus rentable d'abord, telle que le gouvernement l'estime
  // Pas systématiquement : tous les gouvernements n'investissent pas autant.
  // Plus la trésorerie déborde, plus on accepte des projets longs à rentabiliser.
  // Chantiers menés de front : un seul d'habitude, davantage pour un grand pays ou une trésorerie débordante
  const flush = clamp(surplus / Math.max(0.1, b.inc * 12), 0, 2);
  const mine = owned(s, n.id);
  const busy = mine.filter((pid) => s.provinces[pid].works).length;
  const capacity = 1 + (flush > 1 ? 1 : 0) + (mine.length > 20 ? 1 : 0);
  for (let k = 0; k < 1 && busy < capacity && surplus > 0 && rand(s) < 0.4 + 0.6 * p.build; k++) {
    let best: { pid: number; cost: number; payback: number } | null = null;
    for (const pid of mine) {
      const pr = s.provinces[pid];
      if (pr.works || pr.occupiedBy || pr.revolt || (pr.level ?? 0) >= MAX_LEVEL) continue;
      const lvl = pr.level ?? 0;
      const gain = ((production(s, w, pid) * 0.35) / (1 + 0.35 * lvl)) * 0.6 * noise(s);
      if (gain <= 0) continue;
      const cost = upgradeCost(s, w, pid);
      const payback = cost / gain;
      if (!best || payback < best.payback) best = { pid, cost, payback };
    }
    if (!best || best.cost > surplus || best.payback > (18 + 30 * p.build) * (1 + flush) * noise(s)) break;
    if (!upgrade(s, w, n.id, best.pid).ok) break;
    surplus -= best.cost;
  }
  // Forage : un pari, plus tentant pour un bâtisseur (une fois sur trois seulement il paie)
  if (surplus > 0 && rand(s) < 0.06 * p.build) {
    const pid = owned(s, n.id).find((x) => !s.provinces[x].works && !s.provinces[x].revolt && !s.provinces[x].occupiedBy && !DEPOSITS.includes(goodOf(s, w, x)) && (s.provinces[x].level ?? 0) === 0);
    if (pid !== undefined && prospectCost(s, w, pid) < surplus * 0.5) prospect(s, w, n.id, pid);
  }
}

// ————— Armée —————

function military(s: GameState, w: World, n: Nation, b: Budget, p: Persona, think: boolean) {
  const war = atWar(s, n.id);
  // Trésor vide : on démobilise (la flotte d'abord si elle pèse plus que l'armée)
  if (n.treasury < 0) {
    if (n.army > 2 || n.navy > 1) disband(s, n.id, n.navy * 2 > n.army && n.navy > 0);
    return;
  }
  if (!think) return;
  const threat = Math.min(1.5, threatOf(s, w, n, 0.5));
  const target = b.inc * n.milShare * (1 + (war ? 0.3 : 0) + threat * 0.4) * (0.8 + 0.4 * p.ambition) * noise(s, 0.2);
  const coastal = hasCoast(s, w, n.id);
  // Ambition maritime : une flotte capable de projection (débarquements, rivaux d'outre-mer)
  const wantsNavy = coastal && n.navy < PROJECTION_MIN + (p.ambition > 0.8 ? 2 : 0) && (p.ambition > 0.6 || n.claims.some((c) => !neighbours(s, w, n.id).includes(c)));
  if (b.upkeep < target) {
    const naval = coastal && (wantsNavy ? rand(s) < 0.6 : n.navy > 0 && rand(s) < 0.2);
    const cost = (naval ? 6 : 3) * Math.max(1, Math.round((naval ? n.navy : n.army) * 0.1));
    if (n.treasury - cost > reserveOf(b, p) * (war ? 0.3 : 0.7)) recruit(s, n.id, naval);
  } else if (!war && threat < 0.5 && b.upkeep > target * 1.6 && rand(s) < 0.25) disband(s, n.id, n.navy * 2 > n.army && n.navy > 0);
}

// ————— Diplomatie —————

/** Communautés économiques : adhérer quand c'est possible, s'en donner les moyens, ou claquer la porte. */
function communities(s: GameState, n: Nation, p: Persona) {
  const mine = communitiesOf(s, n.id);
  for (const c of COMMUNITIES) {
    if (mine.includes(c.id)) {
      // Départ : relations dégradées, ou coup de tête populiste d'un gouvernement instable
      // (la relation moyenne avec tous les membres est coûteuse : on ne la calcule qu'une fois sur quatre)
      const sour = rand(s) < 0.25 && avgRelWith(s, n.id, c.id) < -15 && rand(s) < 0.6 * (1.3 - p.diplo);
      if (sour || (n.stability < 30 && p.ambition > 0.6 && rand(s) < 0.02)) leaveCommunity(s, n.id, c.id);
      continue;
    }
    if (!c.region.includes(n.id) && !c.members.includes(n.id)) continue;
    const why = canJoinCommunity(s, n.id, c.id);
    if (!why) {
      if (rand(s) < 0.2 + 0.5 * p.diplo) joinCommunity(s, n.id, c.id);
    } else if (n.influence >= 25 + JOIN_COST && rand(s) < 0.5 * p.diplo) {
      // Se rapprocher du membre le plus distant pour remplir les conditions
      let worst: Id | null = null;
      for (const m of communityMembers(s, c.id)) {
        if (m === n.id || !s.nations[m]?.alive || warBetween(s, n.id, m)) continue;
        if (!worst || rel(s, n.id, m) < rel(s, n.id, worst)) worst = m;
      }
      if (worst && rel(s, n.id, worst) < 60) improveRelations(s, n.id, worst);
    }
  }
}

/** Alliances : un pays influent invite un voisin ou un coreligionnaire ami dans son bloc. */
function alliances(s: GameState, w: World, n: Nation, p: Persona) {
  if (n.influence < 90 || atWar(s, n.id) || rand(s) > 0.15 * p.diplo) return;
  if (n.bloc && s.blocs[n.bloc].leader !== n.id) return;
  const nb = neighbours(s, w, n.id);
  const cand = alive(s).find(
    (o) =>
      o.id !== n.id && o.id !== s.player && !o.bloc && !atWar(s, o.id) &&
      (nb.includes(o.id) || o.religion === n.religion) &&
      power(n) >= power(o) * 0.6 && rel(s, n.id, o.id) >= (o.religion === n.religion ? 40 : 55),
  );
  if (cand) proposeAlliance(s, n.id, cand.id);
}

/** Aide financière : un pays riche et généreux soutient un allié ou un voisin ami en difficulté. */
function aid(s: GameState, w: World, n: Nation, b: Budget, p: Persona) {
  if (n.treasury - reserveOf(b, p) < 20 || p.diplo < 0.45 || rand(s) > 0.3 * p.diplo) return;
  const nb = neighbours(s, w, n.id);
  const cand = alive(s).find((o) => o.id !== n.id && o.id !== s.player && o.treasury < 0 && (sameBloc(s, n.id, o.id) || nb.includes(o.id)) && rel(s, n.id, o.id) >= 20);
  if (cand) sendAid(s, n.id, cand.id);
}

