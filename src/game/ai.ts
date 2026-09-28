import {
  fabricateClaim, improveRelations, invest, modernize, reform, signTrade, stabilize, toggleSanctions, addToBloc,
} from './actions';
import { pushEvent, termsToParams } from './events';
import { pick, rand, shuffle } from './rng';
import {
  alive, atWar, clamp, gdpOf, hasTrade, inReach, neighbours, power, rel, sameBloc, sanctions,
} from './state';
import { applyPeace, canDeclareWar, declareWar, enemyLeader, exitWar, scoreFor, termsCost } from './war';
import type { GameState, Id, Nation, PeaceTerms, War, World } from './types';

const MAX_AI_WARS = 5;

export function runAI(s: GameState, w: World) {
  for (const n of shuffle(s, alive(s))) {
    if (n.id === s.player) continue;
    economy(s, n);
    diplomacy(s, w, n);
    military(s, w, n);
  }
}

function economy(s: GameState, n: Nation) {
  if (n.stability < 45 && n.points.pol >= 50) stabilize(s, n.id);
  else if (n.points.pol >= 150 && n.growthBonus < 1) reform(s, n.id);
  if (n.treasury > gdpOf(s, n.id) * 0.12) invest(s, n.id);
  if (n.points.mil >= 80 + 15 * n.tech) modernize(s, n.id);
  for (const k of ['pol', 'dip', 'mil'] as const) n.points[k] = Math.min(n.points[k], 400);
}

function threatOf(s: GameState, w: World, n: Nation): number {
  let t = 0;
  for (const o of neighbours(s, w, n.id)) if (rel(s, n.id, o) < -30 && !sameBloc(s, n.id, o)) t = Math.max(t, power(s.nations[o]));
  return t / Math.max(power(n), 1);
}

function diplomacy(s: GameState, w: World, n: Nation) {
  const threat = threatOf(s, w, n);
  // Budget militaire : se réarmer face à la menace, revenir à la normale sinon
  const target = n.baseMilPct * (threat > 1.5 ? 1.5 : 1) + (atWar(s, n.id) ? 2 : 0);
  n.milPct = clamp(n.milPct + Math.sign(target - n.milPct) * Math.min(0.1, Math.abs(target - n.milPct)), 0.3, 15);

  if (n.points.dip >= 70 && rand(s) < 0.3) {
    // Améliorer ses relations avec un partenaire naturel
    const partners = alive(s)
      .filter((o) => o.id !== n.id && (sameBloc(s, n.id, o.id) || neighbours(s, w, n.id).includes(o.id)))
      .filter((o) => rel(s, n.id, o.id) > -20 && rel(s, n.id, o.id) < 60);
    const p = pick(s, partners);
    if (p) improveRelations(s, n.id, p.id);
  }
  if (n.points.dip >= 60 && rand(s) < 0.1) {
    const p = pick(
      s,
      alive(s).filter((o) => o.id !== n.id && o.id !== s.player && rel(s, n.id, o.id) >= 25 && !hasTrade(s, n.id, o.id)),
    );
    if (p && !sanctions(s, n.id, p.id) && !sanctions(s, p.id, n.id)) signTrade(s, n.id, p.id);
  }
  // Sanctionner les agresseurs
  if (n.points.dip >= 30 && gdpOf(s, n.id) > 200 && rand(s) < 0.05) {
    const agg = alive(s).find(
      (o) =>
        o.aggression > 50 &&
        o.id !== n.id &&
        rel(s, n.id, o.id) < 0 &&
        !sameBloc(s, n.id, o.id) &&
        !sanctions(s, n.id, o.id) &&
        (gdpOf(s, n.id) > 1000 || inReach(s, w, n.id, o.id, false)),
    );
    if (agg) toggleSanctions(s, n.id, agg.id);
  }
  // Lever les sanctions devenues inutiles
  for (const k of s.sanctions.filter((x) => x.startsWith(`${n.id}>`))) {
    const to = k.split('>')[1];
    if ((rel(s, n.id, to) > 20 || (s.nations[to].aggression < 15 && rel(s, n.id, to) > -50)) && rand(s) < 0.04) toggleSanctions(s, n.id, to);
  }
  // Chercher la protection d'un bloc
  if (!n.bloc && threat > 1.5 && rand(s) < 0.02) {
    const bloc = Object.values(s.blocs)
      .filter((b) => rel(s, n.id, b.leader) >= 40 && !b.members.some((m) => rel(s, n.id, m) < -20))
      .sort((a, b) => rel(s, n.id, b.leader) - rel(s, n.id, a.leader))[0];
    if (bloc) {
      if (bloc.leader === s.player) {
        if (!s.events.some((e) => e.kind === 'joinRequest' && e.params.from === n.id))
          pushEvent(s, {
            kind: 'joinRequest',
            title: 'Demande d’adhésion',
            text: `${n.name}, menacé par ses voisins, demande à rejoindre votre bloc « ${bloc.name} ». Vous devrez le défendre en cas d’attaque.`,
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

function blocDeterrence(s: GameState, target: Id): { power: number; nuclear: boolean } {
  const t = s.nations[target];
  let p = power(t);
  let nuclear = t.nuclear;
  if (t.bloc)
    for (const m of s.blocs[t.bloc].members)
      if (m !== target) {
        p += power(s.nations[m]) * 0.6;
        nuclear ||= s.nations[m].nuclear;
      }
  return { power: p, nuclear };
}

function military(s: GameState, w: World, n: Nation) {
  if (atWar(s, n.id) || n.stability < 35 || n.exhaustion > 30) return;
  const rivals = () =>
    alive(s).filter((o) => o.id !== n.id && (rel(s, n.id, o.id) <= -40 || n.claims.includes(o.id)) && inReach(s, w, n.id, o.id, false));
  // Préparer un casus belli contre un rival
  if (n.hawk >= 0.3 && !n.cbProgress && n.points.dip >= 60 && rand(s) < 0.05) {
    const r = pick(s, rivals().filter((o) => !n.claims.includes(o.id)));
    if (r) fabricateClaim(s, w, n.id, r.id);
  }
  if (s.wars.length >= MAX_AI_WARS) return;
  if (rand(s) > n.hawk * 0.004) return;
  const me = power(n);
  const targets = rivals().filter((o) => {
    const d = blocDeterrence(s, o.id);
    return !d.nuclear && me > 2 * d.power && canDeclareWar(s, w, n.id, o.id).ok;
  });
  const t = pick(s, targets);
  if (t) declareWar(s, w, n.id, t.id);
}

/** Conditions de paix qu'une IA victorieuse impose. */
export function aiTerms(s: GameState, war: War, winner: Id): PeaceTerms {
  const loser = enemyLeader(war, winner);
  const budget = scoreFor(war, winner);
  const winSide = war.attackers.includes(winner) ? war.attackers : war.defenders;
  const t: PeaceTerms = { annex: [], satellite: false, reparations: false };
  if (!s.nations[loser].nuclear) {
    const occ = Object.values(s.territories)
      .filter((x) => x.owner === loser && x.occupiedBy && winSide.includes(x.occupiedBy))
      .sort((a, b) => b.gdp - a.gdp);
    for (const x of occ) {
      const trial = { ...t, annex: [...t.annex, x.id] };
      if (termsCost(s, loser, trial) <= budget) t.annex = trial.annex;
    }
  }
  if (!t.annex.includes(loser) && termsCost(s, loser, { ...t, satellite: true }) <= budget && s.nations[winner].hawk > 0.3)
    t.satellite = true;
  if (termsCost(s, loser, { ...t, reparations: true }) <= budget) t.reparations = true;
  return t;
}

/** Gestion mensuelle des négociations de paix impliquant l'IA. */
export function processPeace(s: GameState) {
  for (const war of [...s.wars]) {
    if (!s.wars.includes(war)) continue;
    // Les alliés épuisés concluent une paix séparée
    for (const id of [...war.attackers.slice(1), ...war.defenders.slice(1)])
      if (id !== s.player && s.nations[id].exhaustion > 85 && rand(s) < 0.2) exitWar(s, war, id);
    if (war.months < 3) continue;
    const winner = war.score >= 0 ? war.attackers[0] : war.defenders[0];
    const loser = enemyLeader(war, winner);
    const sc = Math.abs(war.score);
    const W = s.nations[winner];
    const L = s.nations[loser];

    if (winner !== s.player && loser !== s.player) {
      if ((sc >= 40 && war.months >= 6 && rand(s) < 0.2) || sc >= 99) {
        applyPeace(s, war, winner, aiTerms(s, war, winner));
      } else if ((sc < 15 && war.months >= 12 && rand(s) < 0.1) || (W.exhaustion > 80 && L.exhaustion > 80)) {
        applyPeace(s, war, winner, { annex: [], satellite: false, reparations: false });
      }
    } else if (loser === s.player) {
      if (sc >= 99 && !L.nuclear) {
        applyPeace(s, war, winner, aiTerms(s, war, winner));
        continue;
      }
      if (sc >= 40 && war.months >= 6 && rand(s) < 0.12 && !s.events.some((e) => e.params.war === war.id)) {
        const terms = aiTerms(s, war, winner);
        pushEvent(s, {
          kind: 'peaceOffer',
          title: 'Proposition de paix',
          text: `${W.name} propose de mettre fin à la ${war.name}. Conditions : ${describeTerms(s, terms)}.`,
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

export function describeTerms(s: GameState, t: PeaceTerms): string {
  const parts: string[] = [];
  if (t.annex.length) parts.push(`cession de ${t.annex.map((id) => s.territories[id].name).join(', ')}`);
  if (t.satellite) parts.push('entrée dans leur bloc');
  if (t.reparations) parts.push('réparations de guerre');
  return parts.length ? parts.join(', ') : 'paix blanche';
}

