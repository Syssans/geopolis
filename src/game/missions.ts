import { CAMPAIGNS, genericMissions, type Check } from '../data/campaign';
import { HOLY_SITES } from '../data/religions';
import { STRAITS } from '../data/trade';
import { alive, devOf, log, neighbours, nm, owned, power, rel } from './state';
import { holySitesOf } from './religion';
import { monthlyPower, straitOwner } from './trade';
import type { GameState, Id, MissionState, World } from './types';

export const monthlyIncome = (s: GameState, id: Id) => {
  const i = s.nations[id].income;
  return i.production + i.trade + i.tolls + (i.contracts ?? 0);
};

export function faithfulShare(s: GameState, id: Id): number {
  const mine = owned(s, id);
  if (!mine.length) return 0;
  const r = s.nations[id].religion;
  return mine.filter((p) => s.provinces[p].religion === r).length / mine.length;
}

/** Rival du joueur : celui de sa campagne, sinon le voisin le plus hostile. */
export function chooseRival(s: GameState, w: World, id: Id): Id | null {
  const c = CAMPAIGNS[id];
  if (c && s.nations[c.rival]?.alive) return c.rival;
  const nb = neighbours(s, w, id).filter((o) => s.nations[o].alive && power(s.nations[o]) > power(s.nations[id]) * 0.4);
  nb.sort((a, b) => rel(s, id, a) - rel(s, id, b));
  return nb[0] ?? null;
}

export function initCampaign(s: GameState, w: World) {
  const id = s.player;
  s.rival = chooseRival(s, w, id);
  const income0 = monthlyIncome(s, id);
  s.stats.startIncome = income0;
  s.stats.startDev = devOf(s, id);
  const defs = [...(CAMPAIGNS[id]?.missions ?? []), ...genericMissions(income0, faithfulShare(s, id))];
  s.missions = defs.map((d) => ({ ...d, done: false }));
  // Les missions déjà remplies au départ sont durcies
  for (const mi of s.missions) {
    if (!progress(s, w, mi).done) continue;
    if (mi.check.type === 'rivalIncome') mi.check = { ...mi.check, ratio: Math.round(ratioToRival(s) * 0.75 * 100) / 100 };
    else if (mi.check.type === 'faithful' && mi.check.share < 1) mi.check = { ...mi.check, share: 1 };
  }
  s.missions = s.missions.filter((mi) => !progress(s, w, mi).done);
}

function ratioToRival(s: GameState): number {
  if (!s.rival) return 0;
  return monthlyIncome(s, s.rival) / Math.max(monthlyIncome(s, s.player), 0.01);
}

/** Avancement d'une mission (0-1) et libellé chiffré. */
export function progress(s: GameState, w: World, mi: { check: Check }): { done: boolean; ratio: number; label: string } {
  const me = s.player;
  const n = s.nations[me];
  const c = mi.check;
  const frac = (v: number, target: number, fmt = (x: number) => String(Math.round(x))) => ({
    done: v >= target,
    ratio: Math.max(0, Math.min(1, v / target)),
    label: `${fmt(v)} / ${fmt(target)}`,
  });
  switch (c.type) {
    case 'income':
      return frac(monthlyIncome(s, me), c.amount, (x) => `${x.toFixed(1)} Md$`);
    case 'contracts':
      return frac(s.contracts.length, c.count);
    case 'contractWith': {
      const ok = s.contracts.some((k) => k.buyer === c.nation);
      return { done: ok, ratio: ok ? 1 : 0, label: ok ? 'Contrat actif' : `Aucun contrat avec ${nm(s, c.nation)}` };
    }
    case 'contractsDone':
      return frac(s.stats.contractsDone, c.count);
    case 'nodeShare': {
      const p = monthlyPower(s, w)[c.node] ?? {};
      const total = Object.values(p).reduce((a, b) => a + b, 0) || 1;
      return frac(((p[me] ?? 0) / total) * 100, c.share * 100, (x) => `${Math.round(x)} %`);
    }
    case 'strait': {
      const ok = straitOwner(s, w, c.strait) === me;
      const owner = straitOwner(s, w, c.strait);
      return { done: ok, ratio: ok ? 1 : 0, label: ok ? 'Contrôlé' : `Aux mains de ${owner ? nm(s, owner) : '?'}` };
    }
    case 'holy': {
      const ok = holySitesOf(s, w, me).some((h) => h.name === c.site);
      const info = w.provinces.find((p) => p.holy?.some((h) => h.name === c.site));
      return { done: ok, ratio: ok ? 1 : 0, label: ok ? 'Détenu' : `Aux mains de ${info ? nm(s, s.provinces[info.id].owner) : '?'}` };
    }
    case 'faithful':
      return frac(faithfulShare(s, me) * 100, c.share * 100, (x) => `${Math.round(x)} %`);
    case 'converted':
      return frac(s.stats.converted, c.count);
    case 'fervor':
      return frac(n.fervor, c.amount);
    case 'coreligionists':
      return frac(alive(s).filter((o) => o.id !== me && o.religion === n.religion && rel(s, me, o.id) >= 60).length, c.count);
    case 'rivalIncome': {
      if (!s.rival || !s.nations[s.rival].alive) return { done: true, ratio: 1, label: 'Rival éliminé' };
      const r = ratioToRival(s);
      return { done: r <= c.ratio, ratio: Math.max(0, Math.min(1, c.ratio / Math.max(r, 0.01))), label: `${Math.round(r * 100)} % (objectif ≤ ${Math.round(c.ratio * 100)} %)` };
    }
    case 'relations':
      return frac(rel(s, me, c.nation), c.value);
    case 'blocSize': {
      const b = n.bloc ? s.blocs[n.bloc] : null;
      return frac(b && b.leader === me ? b.members.length : 0, c.size);
    }
    case 'stability':
      return frac(n.stability, c.value);
    case 'treasury':
      return frac(n.treasury, c.amount, (x) => `${Math.round(x)} Md$`);
    case 'warsWon':
      return frac(s.stats.warsWon, c.count);
  }
}

export function processMissions(s: GameState, w: World) {
  const n = s.nations[s.player];
  for (const mi of s.missions) {
    if (mi.done || !progress(s, w, mi).done) continue;
    mi.done = true;
    mi.doneAt = `${s.month}/${s.year}`;
    s.score += mi.reward.score;
    n.treasury += mi.reward.money ?? 0;
    n.influence += mi.reward.influence ?? 0;
    n.fervor += mi.reward.fervor ?? 0;
    log(s, `🎯 Mission accomplie : ${mi.title} (+${mi.reward.score} points).`, 'event', [s.player]);
  }
}

export interface ScoreLine {
  label: string;
  value: number;
}

/** Score de campagne : missions + position atteinte. */
export function scoreBreakdown(s: GameState, w: World): { lines: ScoreLine[]; total: number; grade: string } {
  const me = s.player;
  const lines: ScoreLine[] = [];
  lines.push({ label: 'Missions et contrats', value: s.score });
  const ranked = alive(s).map((n) => ({ id: n.id, v: monthlyIncome(s, n.id) })).sort((a, b) => b.v - a.v);
  const rank = ranked.findIndex((x) => x.id === me) + 1;
  lines.push({ label: `Rang commercial mondial (#${rank})`, value: rank === 1 ? 50 : rank <= 5 ? 30 : rank <= 10 ? 20 : rank <= 25 ? 10 : 0 });
  const growth = monthlyIncome(s, me) / Math.max(s.stats.startIncome, 0.01);
  lines.push({ label: `Croissance des revenus (×${growth.toFixed(2)})`, value: Math.round(Math.max(-30, Math.min(60, (growth - 1) * 40))) });
  const devGain = devOf(s, me) - s.stats.startDev;
  lines.push({ label: `Territoire (${devGain >= 0 ? '+' : ''}${devGain} dév.)`, value: Math.round(Math.max(-40, Math.min(40, devGain / 5))) });
  const holy = holySitesOf(s, w, me).filter((h) => h.ours).length;
  if (holy) lines.push({ label: `Lieux saints de votre foi (${holy})`, value: holy * 10 });
  const straits = STRAITS.filter((st) => straitOwner(s, w, st.id) === me).length;
  if (straits) lines.push({ label: `Détroits contrôlés (${straits})`, value: straits * 10 });
  lines.push({ label: `Stabilité (${Math.round(s.nations[me].stability)})`, value: Math.round((s.nations[me].stability - 50) / 3) });
  if (s.rival && s.nations[s.rival]) {
    const r = ratioToRival(s);
    lines.push({ label: `Face au rival ${nm(s, s.rival)}`, value: !s.nations[s.rival].alive ? 40 : r < 0.5 ? 30 : r < 1 ? 15 : r < 1.5 ? 0 : -15 });
  }
  const total = lines.reduce((a, l) => a + l.value, 0);
  const grade = total >= 270 ? 'S' : total >= 200 ? 'A' : total >= 140 ? 'B' : total >= 85 ? 'C' : 'D';
  return { lines, total, grade };
}

export const holySiteNames = HOLY_SITES.map((h) => h.name);
export type { MissionState };

