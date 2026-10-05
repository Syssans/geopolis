import { GOODS, type Good } from '../data/trade';
import { rand } from './rng';
import { alive, clamp, log, owned, provDev } from './state';
import { goodOf, output, production, unitPrice } from './trade';
import { contractFactor, marketFactor } from './contracts';
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
  return provDev(s, w, pid) * 0.05 * (1 + 0.35 * (s.provinces[pid].level ?? 0)) * unitPrice(s, goodOf(s, w, pid));
}

/** Valeur mensuelle brute de la province au niveau 0. */
function value0(s: GameState, w: World, pid: Pid) {
  return provDev(s, w, pid) * 0.05 * unitPrice(s, goodOf(s, w, pid));
}

/** Coût d'une modernisation : 3, 4,5 puis 6 mois de valeur brute (rentable en 2 à 4 ans selon le débouché). */
export function upgradeCost(s: GameState, w: World, pid: Pid): number {
  const lvl = s.provinces[pid].level ?? 0;
  return Math.max(1, Math.round(value0(s, w, pid) * 3 * (1 + 0.5 * lvl) * 10) / 10);
}

export function convertCost(s: GameState, w: World, pid: Pid): number {
  return Math.max(1, Math.round(baseValue(s, w, pid) * 8 * 10) / 10);
}

export function prospectCost(s: GameState, w: World, pid: Pid): number {
  return Math.max(1, Math.round(baseValue(s, w, pid) * 5 * 10) / 10);
}

/** Valeur brute ajoutée chaque mois par une modernisation (+35 % de la production de base, au cours actuel). */
export function upgradeValue(s: GameState, w: World, pid: Pid): number {
  return value0(s, w, pid) * 0.35;
}

/**
 * Gain réel pour le trésor : au marché (coûts de production et intermédiaires déduits) ou en vente directe sous contrat.
 * Pour une province du joueur seulement.
 */
export function upgradeGain(s: GameState, w: World, pid: Pid): { market: number; contract: number } {
  const g = goodOf(s, w, pid);
  const v = upgradeValue(s, w, pid);
  return { market: v * marketFactor(s, w, g), contract: v * contractFactor(s, w, g) };
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
  if (provDev(s, w, pid) < opt.minDev) return { ok: false, msg: `Développement ${opt.minDev} requis` };
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

/**
 * Développement des provinces : il suit le niveau de vie. Une population bien servie (palier élevé, besoins
 * satisfaits, pays stable) investit, se forme et s'urbanise : ses provinces gagnent des points de développement.
 * Pénuries, révoltes et occupation les font reculer. Croissance plafonnée à +50 % du développement de départ.
 */
export const DEV_RATE = [0, 0.015, 0.022, 0.03, 0.038, 0.046]; // progression mensuelle selon le palier (1 à 5)

export function monthlyDevelopment(s: GameState, w: World) {
  for (const n of alive(s)) {
    const player = n.id === s.player;
    const sat = player ? (s.prosperity?.satisfaction ?? 1) : 0.85;
    const blocked = player && n.treasury < 0;
    // Progression proportionnelle à la satisfaction (nulle sous 70 %) et à la stabilité (nulle sous 35)
    const fSat = clamp((sat - 0.7) / 0.2, 0, 1.25);
    const fStab = clamp(0.4 + (n.stability - 35) / 50, 0, 1.4);
    let rate = blocked || n.stability < 35 ? 0 : DEV_RATE[n.tier ?? 3] * fSat * fStab;
    if (sat < 0.6 || n.stability < 25) rate = -0.02;
    if (!rate) continue;
    for (const pid of owned(s, n.id)) {
      const p = s.provinces[pid];
      const base = w.provinces[pid].dev;
      let r = rate;
      if (p.revolt || p.occupiedBy) r = -0.03;
      else if (p.unrest > 60) r = Math.min(r, 0);
      if (!r) continue;
      p.devProgress = (p.devProgress ?? 0) + r * (0.6 + 0.4 * Math.min(1, base / 20)); // les grandes villes attirent davantage
      const gain = p.devGain ?? 0;
      if (p.devProgress >= 1) {
        p.devProgress -= 1;
        if (gain < Math.ceil(base * 0.5)) {
          p.devGain = gain + 1;
          if (player && (p.devGain === 1 || p.devGain % 3 === 0)) log(s, `🏙️ ${w.provinces[pid].name} se développe (dév. ${base + p.devGain}).`, 'info', [s.player]);
        }
      } else if (p.devProgress <= -1) {
        p.devProgress += 1;
        if (base + gain > 1) p.devGain = gain - 1;
      }
      p.devProgress = clamp(p.devProgress, -1, 1);
    }
  }
}
