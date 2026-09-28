import { processPeace, runAI } from './ai';
import { maybeRandomEvent } from './events';
import { rand } from './rng';
import {
  alive, atWar, budget, clamp, gdpOf, growthOf, invalidate, log, milEfficiency, nm, ownedTerritories, popOf, power, sanctionersOf,
} from './state';
import { involvesNuclearClash, resolveWarMonth } from './war';
import type { GameState, World } from './types';

/** Avance la simulation d'un mois. */
export function advanceMonth(s: GameState, w: World) {
  if (s.gameOver) return;
  const nations = alive(s);
  const byGdp = nations.map((n) => ({ id: n.id, g: gdpOf(s, n.id) })).sort((a, b) => b.g - a.g);
  const topGdp = new Set(byGdp.slice(0, 10).map((x) => x.id));
  const byPow = nations.slice().sort((a, b) => power(b) - power(a));
  const topPow = new Set(byPow.slice(0, 10).map((x) => x.id));

  // Croissance (calculée avant de modifier les PIB)
  const growth: Record<string, number> = {};
  for (const n of nations) growth[n.id] = growthOf(s, n.id);

  for (const t of Object.values(s.territories)) {
    let g = growth[t.owner] ?? 0;
    if (t.occupiedBy) g -= 8;
    if (t.integration < 100) g -= 1;
    t.gdp = Math.max(0.01, t.gdp * (1 + g / 100 / 12));
    t.pop *= 1 + 0.008 / 12;
    if (t.integration < 100 && !t.occupiedBy) {
      t.integration = Math.min(100, t.integration + 1);
      if (t.integration >= 100) t.core = t.owner;
    }
  }
  invalidate(s);

  for (const n of nations) {
    // Points
    n.points.pol = Math.min(999, n.points.pol + 3 + (n.stability >= 70 ? 1 : 0));
    n.points.dip = Math.min(999, n.points.dip + 3 + (topGdp.has(n.id) ? 1 : 0));
    n.points.mil = Math.min(999, n.points.mil + 3 + (topPow.has(n.id) ? 1 : 0));

    // Budget
    const b = budget(s, n.id);
    n.treasury += b.net;
    const gdp = gdpOf(s, n.id);

    // Armée : investissement mensuel moins dépréciation
    n.strength = n.strength * 0.99 + b.military * milEfficiency(gdp, popOf(s, n.id));

    // Stabilité
    let ds = (n.baseStability - n.stability) * 0.02;
    if (n.treasury < -gdp * 0.3) ds -= 0.3;
    ds -= Math.min(0.5, sanctionersOf(s, n.id).length * 0.1);
    for (const t of ownedTerritories(s, n.id)) {
      if (t.occupiedBy) ds -= 0.5;
      if (t.integration < 100) ds -= 0.1;
    }
    for (const m of n.modifiers) ds += m.stabilityPerMonth ?? 0;
    n.stability = clamp(n.stability + ds, 0, 100);

    n.aggression = Math.max(0, n.aggression * 0.97 - 0.2);
    if (!atWar(s, n.id)) n.exhaustion = Math.max(0, n.exhaustion - 1.5);

    for (const m of n.modifiers) m.months--;
    n.modifiers = n.modifiers.filter((m) => m.months > 0);

    if (n.cbProgress && --n.cbProgress.months <= 0) {
      const target = n.cbProgress.target;
      n.cbProgress = null;
      if (s.nations[target]?.alive) {
        n.claims.push(target);
        if (n.id === s.player) log(s, `Casus belli obtenu contre ${nm(s, target)}.`, 'war', [n.id]);
      }
    }
    if (n.nukeProgram !== null && --n.nukeProgram <= 0) {
      n.nukeProgram = null;
      n.nuclear = true;
      s.tension = clamp(s.tension + 15, 0, 100);
      log(s, `☢ ${n.name} réalise son premier essai nucléaire !`, 'war', [n.id]);
    }
  }

  // Les relations s'érodent lentement vers la neutralité (demi-vie ≈ 19 ans)
  for (const k of Object.keys(s.relations)) {
    const v = s.relations[k] * 0.997;
    if (Math.abs(v) < 0.5) delete s.relations[k];
    else s.relations[k] = v;
  }

  // Guerres
  for (const war of s.wars) resolveWarMonth(s, war);
  processPeace(s);

  // Révoltes dans les territoires mal intégrés
  for (const t of Object.values(s.territories)) {
    const owner = s.nations[t.owner];
    if (t.integration < 40 && t.core !== t.owner && owner.stability < 35 && !t.occupiedBy && rand(s) < 0.02) {
      const core = s.nations[t.core];
      t.owner = t.core;
      t.integration = 100;
      if (!core.alive) {
        core.alive = true;
        core.strength = power(owner) * 0.05;
        core.stability = 40;
        core.treasury = 0;
      }
      invalidate(s);
      log(s, `Soulèvement : ${t.name} proclame son indépendance vis-à-vis de ${owner.name} !`, 'war', [owner.id, core.id]);
    }
  }

  // Tension mondiale & risque nucléaire
  const clash = s.wars.some((war) => involvesNuclearClash(s, war));
  const target = 15 + 5 * s.wars.length;
  s.tension = clamp(s.tension + Math.sign(target - s.tension) * 0.4, 0, 100);
  if (clash && s.tension >= 95 && rand(s) < 0.04) {
    s.gameOver = 'Escalade nucléaire : les missiles ont été lancés. Personne ne gagne une guerre nucléaire.';
    log(s, '☢ Guerre nucléaire.', 'war', [s.player]);
    return;
  }

  runAI(s, w);
  maybeRandomEvent(s);

  s.month++;
  if (s.month > 12) {
    s.month = 1;
    s.year++;
  }
}
