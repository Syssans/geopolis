import { GOODS, type Good } from '../data/trade';
import { rand } from './rng';
import { alive, log, owned } from './state';
import { goodOf, output, production, unitPrice } from './trade';
import type { GameState, Id, Pid, World } from './types';

export const MAX_LEVEL = 3;
export const UPGRADE_MONTHS = 12;
export const CONVERT_MONTHS = 18;
export const PROSPECT_MONTHS = 6;

/** Marchandises vers lesquelles on peut reconvertir une province, avec le développement requis. */
export const CONVERSIONS: { good: Good; minDev: number }[] = [
  { good: 'cereales', minDev: 0 },
  { good: 'textile', minDev: 8 },
  { good: 'industrie', minDev: 15 },
  { good: 'puces', minDev: 25 },
  { good: 'finance', minDev: 30 },
];

/** Ressources du sous-sol que la prospection peut révéler. */
const DEPOSITS: Good[] = ['petrole', 'gaz', 'metaux', 'terres_rares'];

export interface Result {
  ok: boolean;
  msg: string;
}

/** Valeur de référence d'une province (hors aléas d'occupation), base des coûts. */
function baseValue(s: GameState, w: World, pid: Pid) {
  return w.provinces[pid].dev * 0.05 * (1 + 0.35 * (s.provinces[pid].level ?? 0)) * unitPrice(s, goodOf(s, w, pid));
}

export function upgradeCost(s: GameState, w: World, pid: Pid): number {
  const lvl = s.provinces[pid].level ?? 0;
  return Math.max(1, Math.round(baseValue(s, w, pid) * 10 * (lvl + 1) * 10) / 10);
}

export function convertCost(s: GameState, w: World, pid: Pid): number {
  return Math.max(1, Math.round(baseValue(s, w, pid) * 12 * 10) / 10);
}

export function prospectCost(s: GameState, w: World, pid: Pid): number {
  return Math.max(1, Math.round(baseValue(s, w, pid) * 5 * 10) / 10);
}

/** Gain mensuel attendu d'une modernisation (au cours actuel). */
export function upgradeGain(s: GameState, w: World, pid: Pid): number {
  return w.provinces[pid].dev * 0.05 * 0.35 * unitPrice(s, goodOf(s, w, pid));
}

function check(s: GameState, id: Id, pid: Pid): string | null {
  const p = s.provinces[pid];
  if (p.owner !== id) return 'Province étrangère';
  if (p.works) return 'Chantier déjà en cours';
  if (p.occupiedBy || p.revolt) return 'Province instable';
  return null;
}

export function upgrade(s: GameState, w: World, id: Id, pid: Pid): Result {
  const err = check(s, id, pid);
  if (err) return { ok: false, msg: err };
  if ((s.provinces[pid].level ?? 0) >= MAX_LEVEL) return { ok: false, msg: 'Équipement déjà au maximum' };
  const cost = upgradeCost(s, w, pid);
  if (s.nations[id].treasury < cost) return { ok: false, msg: 'Trésor insuffisant' };
  s.nations[id].treasury -= cost;
  s.provinces[pid].works = { kind: 'upgrade', months: UPGRADE_MONTHS };
  return { ok: true, msg: `Modernisation lancée : ${UPGRADE_MONTHS} mois de travaux` };
}

export function convert(s: GameState, w: World, id: Id, pid: Pid, good: Good): Result {
  const err = check(s, id, pid);
  if (err) return { ok: false, msg: err };
  const opt = CONVERSIONS.find((c) => c.good === good);
  if (!opt) return { ok: false, msg: 'Reconversion impossible' };
  if (w.provinces[pid].dev < opt.minDev) return { ok: false, msg: `Développement ${opt.minDev} requis` };
  if (goodOf(s, w, pid) === good) return { ok: false, msg: 'La province produit déjà cela' };
  const cost = convertCost(s, w, pid);
  if (s.nations[id].treasury < cost) return { ok: false, msg: 'Trésor insuffisant' };
  s.nations[id].treasury -= cost;
  s.provinces[pid].works = { kind: 'convert', months: CONVERT_MONTHS, good };
  return { ok: true, msg: `Reconversion vers ${GOODS[good].name.toLowerCase()} : ${CONVERT_MONTHS} mois (production réduite de moitié pendant les travaux)` };
}

export function prospect(s: GameState, w: World, id: Id, pid: Pid): Result {
  const err = check(s, id, pid);
  if (err) return { ok: false, msg: err };
  if (DEPOSITS.includes(goodOf(s, w, pid))) return { ok: false, msg: 'Gisement déjà exploité' };
  const cost = prospectCost(s, w, pid);
  if (s.nations[id].treasury < cost) return { ok: false, msg: 'Trésor insuffisant' };
  s.nations[id].treasury -= cost;
  s.provinces[pid].works = { kind: 'prospect', months: PROSPECT_MONTHS };
  return { ok: true, msg: `Campagne de forage : ${PROSPECT_MONTHS} mois, environ une chance sur trois de trouver un gisement` };
}

export function toggleForSale(s: GameState, good: Good): Result {
  if (s.notForSale.includes(good)) {
    s.notForSale = s.notForSale.filter((g) => g !== good);
    return { ok: true, msg: `${GOODS[good].name} : de nouveau proposé à la vente` };
  }
  s.notForSale.push(good);
  s.offers = s.offers.filter((o) => o.good !== good);
  return { ok: true, msg: `${GOODS[good].name} : plus d'offres de contrat` };
}

/** Avancement des chantiers, et investissements de l'IA. */
export function monthlyWorks(s: GameState, w: World) {
  s.provinces.forEach((p, pid) => {
    if (!p.works || p.occupiedBy || p.revolt) return;
    if (--p.works.months > 0) return;
    const name = w.provinces[pid].name;
    const mine = p.owner === s.player;
    if (p.works.kind === 'upgrade') {
      p.level = Math.min(MAX_LEVEL, (p.level ?? 0) + 1);
      if (mine) log(s, `🏗️ ${name} : modernisation achevée (niveau ${p.level}).`, 'trade', [s.player]);
    } else if (p.works.kind === 'convert') {
      p.good = p.works.good;
      p.level = 0;
      if (mine) log(s, `🏗️ ${name} produit désormais : ${GOODS[p.good!].name.toLowerCase()}.`, 'trade', [s.player]);
    } else {
      const lat = Math.abs(w.provinces[pid].lat);
      if (rand(s) < 0.35) {
        const found = DEPOSITS[Math.floor(rand(s) * DEPOSITS.length)];
        p.good = lat > 55 && found === 'terres_rares' ? 'gaz' : found;
        p.level = 0;
        if (mine) log(s, `⛏️ Gisement découvert en ${name} : ${GOODS[p.good].name.toLowerCase()} !`, 'trade', [s.player]);
      } else if (mine) log(s, `⛏️ Forage infructueux en ${name}.`, 'trade', [s.player]);
    }
    p.works = undefined;
  });

  // L'IA modernise sa province la plus rentable quand elle a de la trésorerie
  for (const n of alive(s)) {
    if (n.id === s.player || rand(s) > 0.03) continue;
    const inc = n.income.production + n.income.trade + n.income.tolls;
    if (n.treasury < inc * 12) continue;
    const best = owned(s, n.id)
      .filter((pid) => !s.provinces[pid].works && (s.provinces[pid].level ?? 0) < MAX_LEVEL)
      .sort((a, b) => production(s, w, b) - production(s, w, a))[0];
    if (best !== undefined) upgrade(s, w, n.id, best);
  }
}

/** Provinces du joueur produisant une marchandise. */
export function producers(s: GameState, w: World, id: Id, good: Good): Pid[] {
  return owned(s, id)
    .filter((pid) => goodOf(s, w, pid) === good)
    .sort((a, b) => output(s, w, b) - output(s, w, a));
}
