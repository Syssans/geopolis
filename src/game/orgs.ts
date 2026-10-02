/**
 * Organisations internationales. L'OPEP fixe tous les six mois un quota de production de pétrole pour ses membres :
 * une baisse fait monter le cours mondial (au profit de tous les producteurs), une hausse le fait baisser.
 */
import { GOODS } from '../data/trade';
import { rand } from './rng';
import { addRel, alive, log, nm, owned, rel } from './state';
import { production } from './trade';
import type { GameState, Id, Org, World } from './types';

export type { Org };


export const OPEC_FOUNDERS: Id[] = [
  'Saudi Arabia', 'Iraq', 'Iran', 'Kuwait', 'United Arab Emirates', 'Venezuela', 'Nigeria', 'Libya', 'Algeria', 'Congo', 'Gabon', 'Eq. Guinea',
];
export const QUOTA_MIN = 0.7;
export const QUOTA_MAX = 1.1;
export const JOIN_COST = 30; // influence

const now = (s: GameState) => s.year * 12 + (s.month - 1);

export function initOrgs(s: GameState) {
  s.orgs = {
    opep: { id: 'opep', name: 'OPEP', icon: '🛢️', members: OPEC_FOUNDERS.filter((m) => s.nations[m]?.alive), quota: 1, nextMeeting: now(s) + 6, last: 'Quotas inchangés' },
  };
}

/** Quota appliqué à la production de pétrole d'une nation (1 si elle n'est pas membre). */
export function oilQuota(s: GameState, id: Id): number {
  const o = s.orgs?.opep;
  return o && o.members.includes(id) ? o.quota : 1;
}

export const isMember = (s: GameState, org: string, id: Id) => !!s.orgs?.[org]?.members.includes(id);

/** Poids d'un membre dans les votes : sa production de pétrole. */
function oilWeight(s: GameState, w: World, id: Id): number {
  return owned(s, id).filter((pid) => (s.provinces[pid].good ?? w.provinces[pid].good) === 'petrole').reduce((a, pid) => a + w.provinces[pid].dev, 0) || 1;
}

/** Ce que les membres gérés par l'IA proposent selon le cours du pétrole. */
export function aiProposal(s: GameState): -1 | 0 | 1 {
  const p = s.prices.petrole ?? 1;
  if (p < 0.95) return -1; // cours bas : on réduit
  if (p > 1.35) return 1; // cours élevé : on produit davantage
  return 0;
}

const LABEL = { '-1': 'réduire la production de 10 %', '0': 'maintenir les quotas', '1': 'augmenter la production de 10 %' } as const;

/** Réunion semestrielle : vote pondéré par la production, le joueur membre vote par un événement. */
export function monthlyOrgs(s: GameState, w: World) {
  const o = s.orgs?.opep;
  if (!o) return;
  o.members = o.members.filter((m) => s.nations[m]?.alive);
  if (now(s) < o.nextMeeting) return;
  o.nextMeeting = now(s) + 6;
  if (o.members.includes(s.player)) {
    // Intentions arrêtées à l'ouverture de la séance : le joueur les voit autour de la table
    const ai = aiProposal(s);
    o.intents = Object.fromEntries(o.members.filter((m) => m !== s.player).map((m) => [m, rand(s) < 0.85 ? ai : 0]));
    if (!s.events.some((e) => e.kind === 'opec'))
      s.events.push({
        uid: s.nextUid++,
        kind: 'opec',
        title: '🛢️ Réunion de l’OPEP',
        text: `Le baril vaut ${Math.round((s.prices.petrole ?? 1) * 100)} % de son prix de référence. Les membres penchent pour : ${LABEL[aiProposal(s)]}. Votre vote compte double et les membres avec qui vos relations dépassent 40 votent comme vous.`,
        options: [
          { label: 'Réduire la production', hint: 'Quota −10 % : moins de barils, mais un prix plus élevé' },
          { label: 'Maintenir les quotas', hint: 'Aucun changement' },
          { label: 'Augmenter la production', hint: 'Quota +10 % : plus de barils, prix en baisse' },
        ],
        params: {},
      });
    return;
  }
  decide(s, w, null);
}

export type Vote = -1 | 0 | 1;
export const VOTE_LABEL = LABEL;
/** Gain ou perte de relations avec les membres selon qu'ils votent comme le joueur ou non. */
export const VOTE_REL = 3;

export interface OpecSeat {
  id: Id;
  weight: number;
  vote: Vote;
  follows: boolean; // suit le joueur (relations ≥ 40)
}

/** Table de l'OPEP si le joueur vote `playerVote` : votes de chacun, poids, résultat. */
export function opecTally(s: GameState, w: World, playerVote: Vote | null) {
  const o = s.orgs!.opep;
  const ai = aiProposal(s);
  const seats: OpecSeat[] = o.members.map((m) => {
    // Le joueur fait campagne : son vote compte double et ses amis (relations ≥ 40) le suivent
    const follows = playerVote !== null && m !== s.player && rel(s, s.player, m) >= 40;
    const vote: Vote = m === s.player && playerVote !== null ? playerVote : follows ? playerVote! : (o.intents?.[m] ?? ai);
    return { id: m, weight: oilWeight(s, w, m) * (m === s.player ? 2 : 1), vote, follows };
  });
  const votes = { '-1': 0, '0': 0, '1': 0 };
  for (const x of seats) votes[String(x.vote) as '-1' | '0' | '1'] += x.weight;
  const choice = Number((Object.entries(votes) as [string, number][]).sort((a, b) => b[1] - a[1])[0][0]) as Vote;
  const quota = Math.round(Math.min(QUOTA_MAX, Math.max(QUOTA_MIN, o.quota + choice * 0.1)) * 100) / 100;
  return { seats, votes, choice, quota };
}

/**
 * Production pétrolière d'une nation (valeur par mois) : actuelle, et estimée à terme si le quota passait à `quota`
 * (moins de barils, mais un cours qui dérive de 2,5 × l'écart de quota).
 */
export function oilOutlook(s: GameState, w: World, id: Id, quota: number): { now: number; later: number; price: number } {
  const o = s.orgs!.opep;
  const member = o.members.includes(id);
  const nowV = owned(s, id).filter((pid) => (s.provinces[pid].good ?? w.provinces[pid].good) === 'petrole').reduce((a, pid) => a + production(s, w, pid), 0);
  const p = s.prices.petrole ?? 1;
  const price = Math.max(0.4, p + (o.quota - quota) * 2.5);
  const later = nowV * (member && o.quota ? quota / o.quota : 1) * (price / p);
  return { now: nowV, later, price };
}

/** Décision de l'OPEP ; `playerVote` : −1, 0 ou 1 si le joueur est membre. */
export function decide(s: GameState, w: World, playerVote: Vote | null): string {
  const o = s.orgs!.opep;
  const t = opecTally(s, w, playerVote);
  const lobby = t.seats.filter((x) => x.follows).map((x) => x.id);
  const choice = t.choice;
  const before = o.quota;
  o.quota = t.quota;
  o.intents = undefined;
  o.last = o.quota === before ? 'Quotas inchangés' : o.quota < before ? `Production réduite (quota ${Math.round(o.quota * 100)} %)` : `Production relevée (quota ${Math.round(o.quota * 100)} %)`;
  if (playerVote !== null)
    for (const x of t.seats) if (x.id !== s.player) addRel(s, s.player, x.id, x.vote === playerVote ? VOTE_REL : -VOTE_REL);
  const mine = o.members.includes(s.player) || owned(s, s.player).length > 0;
  if (o.quota !== before) log(s, `🛢️ OPEP : ${LABEL[String(choice) as '-1' | '0' | '1']} — le ${GOODS.petrole.name.toLowerCase()} va ${choice < 0 ? 'grimper' : 'baisser'}.`, 'trade', mine ? [s.player] : []);
  const allies = lobby.length ? ` (${lobby.map((m) => nm(s, m)).join(', ')} vous ont suivi)` : '';
  if (playerVote !== null && playerVote !== choice) return `Votre vote a été mis en minorité${allies} : l’OPEP décide de ${LABEL[String(choice) as '-1' | '0' | '1']}.`;
  if (playerVote !== null) return `Votre ligne l’emporte${allies} : l’OPEP décide de ${LABEL[String(choice) as '-1' | '0' | '1']}.`;
  return `L’OPEP décide de ${LABEL[String(choice) as '-1' | '0' | '1']}.`;
}

/** Hausse du cours cible du pétrole due aux quotas. */
export const oilPricePush = (s: GameState) => (1 - (s.orgs?.opep?.quota ?? 1)) * 2.5;

export function canJoin(s: GameState, w: World, id: Id): string | null {
  const o = s.orgs?.opep;
  if (!o) return 'Organisation dissoute';
  if (o.members.includes(id)) return 'Déjà membre';
  if (oilWeight(s, w, id) <= 1 && !owned(s, id).some((pid) => (s.provinces[pid].good ?? w.provinces[pid].good) === 'petrole')) return 'Il faut produire du pétrole';
  if (s.nations[id].influence < JOIN_COST) return `Influence insuffisante (${JOIN_COST})`;
  const hostile = o.members.filter((m) => rel(s, id, m) < -20);
  if (hostile.length > o.members.length / 3) return 'Trop de membres vous sont hostiles';
  return null;
}

export function joinOpec(s: GameState, w: World, id: Id): { ok: boolean; msg: string } {
  const why = canJoin(s, w, id);
  if (why) return { ok: false, msg: why };
  const o = s.orgs!.opep;
  s.nations[id].influence -= JOIN_COST;
  o.members.push(id);
  for (const m of o.members) if (m !== id) addRel(s, id, m, 10);
  log(s, `🛢️ ${nm(s, id)} rejoint l’OPEP.`, 'diplo', [id]);
  return { ok: true, msg: 'Vous êtes membre de l’OPEP : vous voterez les quotas tous les six mois.' };
}

export function leaveOpec(s: GameState, id: Id): { ok: boolean; msg: string } {
  const o = s.orgs?.opep;
  if (!o || !o.members.includes(id)) return { ok: false, msg: 'Vous n’êtes pas membre' };
  o.members = o.members.filter((m) => m !== id);
  for (const m of o.members) addRel(s, id, m, -15);
  log(s, `🛢️ ${nm(s, id)} quitte l’OPEP.`, 'diplo', [id]);
  return { ok: true, msg: 'Vous quittez l’OPEP : relations −15 avec ses membres, mais plus aucun quota.' };
}

/** IA : un gros producteur de pétrole hors OPEP peut y adhérer, rarement. */
export function aiOrgs(s: GameState, w: World) {
  if (rand(s) > 0.02) return;
  const cand = alive(s).find((n) => n.id !== s.player && !isMember(s, 'opep', n.id) && oilWeight(s, w, n.id) > 60 && !['United States of America', 'Russia', 'Canada', 'Norway', 'China', 'United Kingdom', 'Brazil'].includes(n.id));
  if (cand && !canJoin(s, w, cand.id)) joinOpec(s, w, cand.id);
}
