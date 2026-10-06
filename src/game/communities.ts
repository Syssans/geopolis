/**
 * Communautés économiques (UE, OCS, Union africaine, Commonwealth…) : adhésion et départ du joueur.
 * Effets (voir state.ts) : relations rapprochées entre membres, commerce facilité (prime de vente, marge d'achat réduite).
 */
import { COMMUNITIES, type CommunityDef } from '../data/communities';
import { addRel, alive, clamp, communityMembers, invalidate, log, rel } from './state';
import type { GameState, Id } from './types';

export const JOIN_COST = 40; // influence

export function initCommunities(s: GameState) {
  s.communities = Object.fromEntries(COMMUNITIES.map((c) => [c.id, c.members.filter((m) => s.nations[m]?.alive)]));
}

export const communityDef = (cid: string): CommunityDef => COMMUNITIES.find((c) => c.id === cid)!;

/** Relation moyenne d'une nation avec les membres d'une communauté. */
export function avgRelWith(s: GameState, id: Id, cid: string): number {
  const ms = communityMembers(s, cid).filter((m) => m !== id && s.nations[m]?.alive);
  return ms.length ? ms.reduce((a, m) => a + rel(s, id, m), 0) / ms.length : 0;
}

/** Pourquoi une nation ne peut pas adhérer (ou null). */
export function canJoinCommunity(s: GameState, id: Id, cid: string): string | null {
  const c = communityDef(cid);
  if (communityMembers(s, cid).includes(id)) return 'Déjà membre';
  if (!c.region.includes(id) && !c.members.includes(id)) return 'Hors de la zone de la communauté';
  if (s.nations[id].influence < JOIN_COST) return `Influence insuffisante (${JOIN_COST})`;
  const need = cid === 'ue' ? 40 : 15;
  const avg = avgRelWith(s, id, cid);
  if (avg < need) return `Relations moyennes avec les membres : ${Math.round(avg)} (il faut ${need})`;
  if (cid === 'ue' && s.nations[id].stability < 50) return 'Stabilité insuffisante (50)';
  return null;
}

export function joinCommunity(s: GameState, id: Id, cid: string): { ok: boolean; msg: string } {
  const why = canJoinCommunity(s, id, cid);
  if (why) return { ok: false, msg: why };
  const c = communityDef(cid);
  s.nations[id].influence -= JOIN_COST;
  for (const m of communityMembers(s, cid)) addRel(s, id, m, 5);
  s.communities = { ...(s.communities ?? {}), [cid]: [...communityMembers(s, cid), id] };
  invalidate(s);
  log(s, `${c.icon} ${s.nations[id].name} rejoint ${c.name}.`, 'diplo', [id, ...communityMembers(s, cid)]);
  return { ok: true, msg: `Vous êtes membre de ${c.name} : commerce facilité avec ses membres.` };
}

export function leaveCommunity(s: GameState, id: Id, cid: string): { ok: boolean; msg: string } {
  const c = communityDef(cid);
  const ms = communityMembers(s, cid);
  if (!ms.includes(id)) return { ok: false, msg: 'Vous n’êtes pas membre' };
  s.communities = { ...(s.communities ?? {}), [cid]: ms.filter((m) => m !== id) };
  for (const m of ms) if (m !== id) addRel(s, id, m, -15);
  s.nations[id].stability = clamp(s.nations[id].stability - 5, 0, 100);
  invalidate(s);
  log(s, `${c.icon} ${s.nations[id].name} quitte ${c.name}.`, 'diplo', [id, ...ms]);
  return { ok: true, msg: `Vous quittez ${c.name} : relations −15 avec ses membres, stabilité −5.` };
}

/** Nettoie les membres disparus. */
export function monthlyCommunities(s: GameState) {
  if (!s.communities) return;
  const living = new Set(alive(s).map((n) => n.id));
  for (const [cid, ms] of Object.entries(s.communities)) if (ms.some((m) => !living.has(m))) s.communities[cid] = ms.filter((m) => living.has(m));
}
