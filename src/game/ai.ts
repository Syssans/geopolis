import {
  addToBloc, appealToFaithful, fabricateClaim, holyWarClaim, holyWarReasons, improveRelations, merchantNodes,
  merchantSlots, nationalUnity, recruit, disband, sendMissionary, setMerchant, signTrade, supportRebels, toggleEmbargo,
  toggleStrait,
} from './actions';
import { pushEvent, termsToParams } from './events';
import { pick, rand, shuffle } from './rng';
import { alive, atWar, embargoes, hasTrade, inReach, neighbours, owned, power, rel, sameBloc, warsOf } from './state';
import { STRAITS } from '../data/trade';
import { homeNode, straitOwner, upstreamOf } from './trade';
import { annexable, applyPeace, canDeclareWar, declareWar, enemyLeader, exitWar, guarantors, scoreFor, termsCost } from './war';
import type { GameState, Id, Nation, PeaceTerms, War, World } from './types';

const MAX_AI_WARS = 5;

export function runAI(s: GameState, w: World) {
  for (const n of shuffle(s, alive(s))) {
    if (n.id === s.player) continue;
    military(s, n);
    faith(s, w, n);
    diplomacy(s, w, n);
    straits(s, w, n);
    war(s, w, n);
  }
  if (s.month % 6 === 1) runMerchantAI(s, w, true); // les marchands du joueur sont gérés comme ceux de l'IA
}

/** Les marchands orientent le commerce amont vers le nœud domicile. */
export function runMerchantAI(s: GameState, w: World, includePlayer: boolean) {
  for (const n of alive(s)) {
    if (n.id === s.player && !includePlayer) continue;
    const home = homeNode(s, w, n.id);
    if (!home) continue;
    const slots = merchantSlots(s, n.id);
    const reachable = merchantNodes(s, w, n.id);
    // Nœuds amont (distance 1 puis 2) du domicile
    const up1 = upstreamOf(home).filter((x) => reachable.includes(x));
    const plan: { node: string; mode: 'collect' | 'steer'; target?: string }[] = [];
    for (const u of up1) plan.push({ node: u, mode: 'steer', target: home });
    for (const u of up1) for (const u2 of upstreamOf(u)) if (reachable.includes(u2)) plan.push({ node: u2, mode: 'steer', target: u });
    // Sinon, collecter là où l'on a des provinces hors domicile
    for (const node of reachable) if (node !== home && !plan.some((p) => p.node === node) && owned(s, n.id).some((pid) => w.provinces[pid].node === node)) plan.push({ node, mode: 'collect' });
    n.merchants = [];
    plan.slice(0, slots).forEach((p, i) => setMerchant(s, w, n.id, i, p.node, p.mode, p.target));
  }
}

function military(s: GameState, n: Nation) {
  const inc = n.income.production + n.income.trade + n.income.tolls;
  const upkeep = n.income.upkeep;
  const target = inc * n.milShare * (atWar(s, n.id) ? 1.5 : 1);
  if (n.treasury < 0 && n.army > 2) disband(s, n.id);
  else if (upkeep < target * 0.9 && n.treasury > inc * 3 && rand(s) < 0.3) recruit(s, n.id, n.navy > 0 && rand(s) < 0.25);
}

function faith(s: GameState, w: World, n: Nation) {
  if (n.stability < 40 && n.fervor >= 40) nationalUnity(s, n.id);
  if (n.missionary === null && n.policy !== 'tolerance' && n.fervor >= 30 && rand(s) < 0.2) {
    const cands = owned(s, n.id).filter((pid) => s.provinces[pid].religion !== n.religion && !s.provinces[pid].revolt);
    const target = cands.sort((a, b) => w.provinces[a].dev - w.provinces[b].dev)[0];
    if (target !== undefined) sendMissionary(s, n.id, target);
  }
  if (n.policy === 'proselytisme' && n.fervor >= 80 && rand(s) < 0.03) {
    // Soutenir des coreligionnaires opprimés chez un voisin hostile
    const cands: number[] = [];
    for (const o of neighbours(s, w, n.id))
      if (rel(s, n.id, o) < 0 && !sameBloc(s, n.id, o))
        for (const pid of owned(s, o))
          if (s.provinces[pid].religion === n.religion && s.nations[o].religion !== n.religion && !s.provinces[pid].supportedBy) cands.push(pid);
    const pid = pick(s, cands);
    if (pid !== undefined) supportRebels(s, w, n.id, pid);
  }
  if (n.hawk >= 0.3 && n.fervor >= 60 && rand(s) < 0.03) {
    const t = pick(s, neighbours(s, w, n.id).filter((o) => !n.holyClaims.includes(o) && holyWarReasons(s, w, n.id, o).length));
    if (t) holyWarClaim(s, w, n.id, t);
  }
  if (n.fervor > 200 && rand(s) < 0.05) appealToFaithful(s, n.id);
}

function threatOf(s: GameState, w: World, n: Nation): number {
  let t = 0;
  for (const o of neighbours(s, w, n.id)) if (rel(s, n.id, o) < -30 && !sameBloc(s, n.id, o)) t = Math.max(t, power(s.nations[o]));
  return t / Math.max(power(n), 1);
}

function diplomacy(s: GameState, w: World, n: Nation) {
  if (n.influence >= 70 && rand(s) < 0.3) {
    const partners = alive(s)
      .filter((o) => o.id !== n.id && (sameBloc(s, n.id, o.id) || o.religion === n.religion || neighbours(s, w, n.id).includes(o.id)))
      .filter((o) => rel(s, n.id, o.id) > -20 && rel(s, n.id, o.id) < 60);
    const p = pick(s, partners);
    if (p) improveRelations(s, n.id, p.id);
  }
  if (n.influence >= 60 && rand(s) < 0.1) {
    const p = pick(s, alive(s).filter((o) => o.id !== n.id && o.id !== s.player && rel(s, n.id, o.id) >= 25 && !hasTrade(s, n.id, o.id)));
    if (p && !embargoes(s, n.id, p.id) && !embargoes(s, p.id, n.id)) signTrade(s, n.id, p.id);
  }
  // Embargo contre les agresseurs
  if (n.influence >= 30 && rand(s) < 0.04) {
    const agg = alive(s).find((o) => o.aggression > 50 && o.id !== n.id && rel(s, n.id, o.id) < 0 && !sameBloc(s, n.id, o.id) && !embargoes(s, n.id, o.id) && inReach(s, w, n.id, o.id));
    if (agg) toggleEmbargo(s, n.id, agg.id);
  }
  for (const k of s.embargoes.filter((x) => x.startsWith(`${n.id}>`))) {
    const to = k.split('>')[1];
    if ((rel(s, n.id, to) > 20 || (s.nations[to].aggression < 15 && rel(s, n.id, to) > -50)) && rand(s) < 0.04) toggleEmbargo(s, n.id, to);
  }
  // Chercher la protection d'un bloc
  if (!n.bloc && threatOf(s, w, n) > 1.5 && rand(s) < 0.02) {
    const bloc = Object.values(s.blocs)
      .filter((b) => rel(s, n.id, b.leader) >= 40 && !b.members.some((m) => rel(s, n.id, m) < -20))
      .sort((a, b) => rel(s, n.id, b.leader) - rel(s, n.id, a.leader))[0];
    if (bloc) {
      if (bloc.leader === s.player) {
        if (!s.events.some((e) => e.kind === 'joinRequest' && e.params.from === n.id))
          pushEvent(s, {
            kind: 'joinRequest',
            title: 'Demande d’adhésion',
            text: `${n.name}, menacé par ses voisins, demande à rejoindre votre bloc « ${bloc.name} ». Vous devrez le défendre.`,
            options: [
              { label: 'Accepter', hint: 'Nouveau membre, relations +10' },
              { label: 'Refuser', hint: 'Relations −10' },
            ],
            params: { from: n.id },
          });
      } else if (!atWar(s, n.id)) addToBloc(s, bloc.leader, n.id);
    }
  }
}

/** En guerre, un propriétaire de détroit le ferme si l'ennemi en dépend. */
function straits(s: GameState, w: World, n: Nation) {
  const mine = STRAITS.filter((st) => straitOwner(s, w, st.id) === n.id).map((st) => st.id);
  if (!mine.length) return;
  for (const st of mine) {
    const closed = n.closedStraits.includes(st);
    const foes = warsOf(s, n.id).flatMap((war) => (war.attackers.includes(n.id) ? war.defenders : war.attackers));
    const bigFoe = foes.some((f) => owned(s, f).length > 20);
    if (!closed && bigFoe && n.hawk >= 0.3 && n.influence >= 30 && rand(s) < 0.2) toggleStrait(s, w, n.id, st);
    if (closed && !foes.length && rand(s) < 0.2) toggleStrait(s, w, n.id, st);
  }
}

function blocDeterrence(s: GameState, target: Id): { power: number; nuclear: boolean } {
  const t = s.nations[target];
  let p = power(t) * 1.2;
  let nuclear = t.nuclear;
  const allies = new Set(guarantors(s, target));
  if (t.bloc) for (const m of s.blocs[t.bloc].members) if (m !== target) allies.add(m);
  for (const m of allies) {
    p += power(s.nations[m]) * 0.6;
    nuclear ||= s.nations[m].nuclear;
  }
  return { power: p, nuclear };
}

function war(s: GameState, w: World, n: Nation) {
  if (atWar(s, n.id) || n.stability < 35 || n.exhaustion > 30) return;
  const rivals = () =>
    alive(s).filter(
      (o) => o.id !== n.id && (rel(s, n.id, o.id) <= -40 || n.claims.includes(o.id) || n.holyClaims.includes(o.id)) && inReach(s, w, n.id, o.id, false),
    );
  if (n.hawk >= 0.3 && !n.cbProgress && n.influence >= 60 && rand(s) < 0.05) {
    const r = pick(s, rivals().filter((o) => !n.claims.includes(o.id)));
    if (r) fabricateClaim(s, w, n.id, r.id);
  }
  if (s.wars.length >= MAX_AI_WARS) return;
  if (rand(s) > n.hawk * 0.008 * (n.policy === 'proselytisme' ? 1.5 : 1)) return;
  const me = power(n);
  const targets = rivals().filter((o) => {
    const d = blocDeterrence(s, o.id);
    return !d.nuclear && me > (n.holyClaims.includes(o.id) ? 1.3 : 1.7) * d.power && canDeclareWar(s, w, n.id, o.id).ok;
  });
  const t = pick(s, targets);
  if (t) declareWar(s, w, n.id, t.id);
}

/** Conditions de paix imposées par une IA victorieuse. */
export function aiTerms(s: GameState, w: World, war: War, winner: Id): PeaceTerms {
  const loser = enemyLeader(war, winner);
  const budget = scoreFor(war, winner);
  const t: PeaceTerms = { annex: [], satellite: false, reparations: false };
  if (!s.nations[loser].nuclear) {
    // Priorité aux provinces de même religion que le vainqueur, puis aux plus riches
    const W = s.nations[winner];
    const cands = annexable(s, war, winner).sort(
      (a, b) => Number(s.provinces[b].religion === W.religion) - Number(s.provinces[a].religion === W.religion) || w.provinces[b].dev - w.provinces[a].dev,
    );
    for (const pid of cands) {
      const trial = { ...t, annex: [...t.annex, pid] };
      if (termsCost(s, w, loser, trial) <= budget) t.annex = trial.annex;
    }
  }
  if (termsCost(s, w, loser, { ...t, satellite: true }) <= budget && s.nations[winner].hawk > 0.3 && owned(s, loser).length > t.annex.length) t.satellite = true;
  if (termsCost(s, w, loser, { ...t, reparations: true }) <= budget) t.reparations = true;
  return t;
}

export function processPeace(s: GameState, w: World) {
  for (const war of [...s.wars]) {
    if (!s.wars.includes(war)) continue;
    for (const id of [...war.attackers.slice(1), ...war.defenders.slice(1)])
      if (id !== s.player && s.nations[id].exhaustion > 85 && rand(s) < 0.2) exitWar(s, war, id);
    if (war.months < 3) continue;
    const winner = war.score >= 0 ? war.attackers[0] : war.defenders[0];
    const loser = enemyLeader(war, winner);
    const sc = Math.abs(war.score);
    const W = s.nations[winner];
    const L = s.nations[loser];
    if (winner !== s.player && loser !== s.player) {
      if ((sc >= 35 && war.months >= 6 && rand(s) < 0.2) || sc >= 99) applyPeace(s, w, war, winner, aiTerms(s, w, war, winner));
      else if ((sc < 15 && war.months >= 12 && rand(s) < 0.1) || (W.exhaustion > 80 && L.exhaustion > 80))
        applyPeace(s, w, war, winner, { annex: [], satellite: false, reparations: false });
    } else if (loser === s.player) {
      if (sc >= 99 && !L.nuclear) {
        applyPeace(s, w, war, winner, aiTerms(s, w, war, winner));
        continue;
      }
      if (sc >= 35 && war.months >= 6 && rand(s) < 0.12 && !s.events.some((e) => e.params.war === war.id)) {
        const terms = aiTerms(s, w, war, winner);
        pushEvent(s, {
          kind: 'peaceOffer',
          title: 'Proposition de paix',
          text: `${W.name} propose de mettre fin à la ${war.name}. Conditions : ${describeTerms(s, w, terms)}.`,
          options: [
            { label: 'Accepter', hint: 'Signer le traité' },
            { label: 'Refuser', hint: 'Poursuivre la guerre, stabilité −2' },
          ],
          params: { war: war.id, winner, ...termsToParams(terms) },
        });
      }
    } else if (sc < 15 && war.months >= 12 && rand(s) < 0.08 && !s.events.some((e) => e.params.war === war.id)) {
      pushEvent(s, {
        kind: 'whitePeace',
        title: 'Offre de paix blanche',
        text: `${L.name} propose une paix blanche pour mettre fin à la ${war.name}.`,
        options: [
          { label: 'Accepter', hint: 'Fin de la guerre sans conditions' },
          { label: 'Refuser', hint: 'Continuer' },
        ],
        params: { war: war.id, from: winner },
      });
    }
  }
}

export function describeTerms(s: GameState, w: World, t: PeaceTerms): string {
  const parts: string[] = [];
  if (t.annex.length) parts.push(`cession de ${t.annex.map((pid) => w.provinces[pid].name).join(', ')}`);
  if (t.satellite) parts.push('entrée dans leur bloc');
  if (t.reparations) parts.push('réparations de guerre');
  return parts.length ? parts.join(', ') : 'paix blanche';
}
