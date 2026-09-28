import { rand } from './rng';
import {
  addRel, alive, clamp, gdpOf, inReach, invalidate, log, nm, ownedTerritories, power, sameBloc, warBetween, warsOf,
} from './state';
import type { GameState, Id, PeaceTerms, War, World } from './types';

export interface Check {
  ok: boolean;
  reason?: string;
}

export function canDeclareWar(s: GameState, w: World, attacker: Id, target: Id): Check {
  const a = s.nations[attacker];
  const t = s.nations[target];
  if (!t?.alive || attacker === target) return { ok: false, reason: 'Cible invalide' };
  if (sameBloc(s, attacker, target)) return { ok: false, reason: 'Membre de votre bloc' };
  if (warBetween(s, attacker, target)) return { ok: false, reason: 'Déjà en guerre' };
  if (!inReach(s, w, attacker, target)) return { ok: false, reason: 'Hors de portée militaire' };
  if (a.exhaustion > 60) return { ok: false, reason: 'Lassitude de guerre trop élevée' };
  return { ok: true };
}

export function declareWar(s: GameState, w: World, attacker: Id, target: Id): War | null {
  if (!canDeclareWar(s, w, attacker, target).ok) return null;
  const a = s.nations[attacker];
  const justified = a.claims.includes(target);
  a.claims = a.claims.filter((c) => c !== target);
  if (justified) {
    a.aggression += 5;
  } else {
    a.stability = clamp(a.stability - 15, 0, 100);
    a.aggression += 25;
  }
  // Rupture des liens
  s.trades = s.trades.filter((k) => !(k.split('|').includes(attacker) && k.split('|').includes(target)));
  addRel(s, attacker, target, -50);
  for (const n of alive(s)) if (n.id !== attacker && n.id !== target) addRel(s, attacker, n.id, justified ? -3 : -10);

  const war: War = {
    id: `w${s.nextUid++}`,
    name: `Guerre ${nm(s, attacker)}–${nm(s, target)}`,
    attackers: [attacker],
    defenders: [target],
    score: 0,
    months: 0,
    justified,
  };
  s.wars.push(war);
  log(s, `${nm(s, attacker)} déclare la guerre à ${nm(s, target)}${justified ? '' : ' sans casus belli'} !`, 'war', [attacker, target]);

  // Appel aux armes du bloc défensif
  const tb = s.nations[target].bloc;
  if (tb) {
    for (const m of s.blocs[tb].members) {
      if (m === target || m === attacker || war.attackers.includes(m)) continue;
      if (m === s.player) {
        s.events.push({
          uid: s.nextUid++,
          kind: 'callToArms',
          title: "Appel aux armes",
          text: `${nm(s, target)}, membre de votre bloc « ${s.blocs[tb].name} », est attaqué par ${nm(s, attacker)}. Honorerez-vous vos engagements ?`,
          options: [
            { label: 'Honorer l’alliance', hint: 'Entrer en guerre aux côtés de notre allié' },
            { label: 'Refuser', hint: 'Quitter le bloc, stabilité −10, relations dégradées' },
          ],
          params: { war: war.id, ally: target },
        });
      } else {
        joinWar(s, war, m, 'def');
      }
    }
  }
  // Tension mondiale
  s.tension = clamp(s.tension + 4, 0, 100);
  if (involvesNuclearClash(s, war)) {
    s.tension = clamp(s.tension + 20, 0, 100);
    log(s, `⚠ Deux puissances nucléaires s'affrontent. La tension mondiale explose.`, 'war', war.attackers.concat(war.defenders));
  }
  return war;
}

export function joinWar(s: GameState, war: War, id: Id, side: 'att' | 'def') {
  if (war.attackers.includes(id) || war.defenders.includes(id)) return;
  (side === 'att' ? war.attackers : war.defenders).push(id);
  const enemies = side === 'att' ? war.defenders : war.attackers;
  for (const e of enemies) {
    addRel(s, id, e, -30);
    s.trades = s.trades.filter((k) => !(k.split('|').includes(id) && k.split('|').includes(e)));
  }
  log(s, `${nm(s, id)} rejoint la ${war.name}.`, 'war', [id]);
}

export function involvesNuclearClash(s: GameState, war: War): boolean {
  return war.attackers.some((a) => s.nations[a].nuclear) && war.defenders.some((d) => s.nations[d].nuclear);
}

function sidePower(s: GameState, ids: Id[]): number {
  return ids.reduce((acc, id, i) => acc + power(s.nations[id]) * (i === 0 ? 1 : 0.6), 0);
}

/** Plafond du score : on ne fait pas capituler une puissance nucléaire. */
function scoreCap(s: GameState, war: War): [number, number] {
  const hi = s.nations[war.defenders[0]].nuclear ? 50 : 100;
  const lo = s.nations[war.attackers[0]].nuclear ? -50 : -100;
  return [lo, hi];
}

export function resolveWarMonth(s: GameState, war: War) {
  war.months++;
  const pA = sidePower(s, war.attackers);
  const pB = sidePower(s, war.defenders) * 1.2; // avantage défensif
  const r = pA / Math.max(pA + pB, 1e-6);
  const swing = (r - 0.5) * 24 * (0.6 + rand(s) * 0.8);
  const [lo, hi] = scoreCap(s, war);
  war.score = clamp(war.score + swing, lo, hi);

  const lossA = 0.05 * (1 - r);
  const lossB = 0.05 * r;
  war.attackers.forEach((id, i) => bleed(s, id, i === 0 ? lossA : lossA / 2));
  war.defenders.forEach((id, i) => bleed(s, id, i === 0 ? lossB : lossB / 2));
  updateOccupation(s, war);
  if (involvesNuclearClash(s, war)) s.tension = clamp(s.tension + 2, 0, 100);
}

function bleed(s: GameState, id: Id, rate: number) {
  const n = s.nations[id];
  n.strength *= 1 - rate;
  n.exhaustion = clamp(n.exhaustion + 0.8 + rate * 25, 0, 100);
  if (n.exhaustion > 50) n.stability = clamp(n.stability - 0.3, 0, 100);
}

/** L'occupation suit le score de guerre : plus il est élevé, plus le territoire ennemi est contrôlé. */
export function updateOccupation(s: GameState, war: War) {
  const occupy = (victim: Id, occupier: Id, score: number) => {
    const terrs = ownedTerritories(s, victim);
    const total = terrs.reduce((a, t) => a + t.gdp, 0) || 1;
    // Le territoire historique (capitale) tombe en dernier
    terrs.sort((a, b) => (a.id === victim ? 1 : b.id === victim ? -1 : a.gdp - b.gdp));
    let acc = 0;
    for (const t of terrs) {
      const isCapital = t.id === victim;
      acc += t.gdp / total;
      const take = isCapital ? score >= 75 : score > 0 && acc <= score / 100 + 0.001;
      if (take) t.occupiedBy = occupier;
      else if (t.occupiedBy === occupier) t.occupiedBy = null;
    }
  };
  occupy(war.defenders[0], war.attackers[0], war.score);
  occupy(war.attackers[0], war.defenders[0], -war.score);
}

/** Score dont dispose un camp (point de vue du camp). */
export function scoreFor(war: War, id: Id): number {
  return war.attackers.includes(id) ? war.score : -war.score;
}

export function isLeader(war: War, id: Id) {
  return war.attackers[0] === id || war.defenders[0] === id;
}

export function enemyLeader(war: War, id: Id): Id {
  return war.attackers.includes(id) ? war.defenders[0] : war.attackers[0];
}

/** Coût en score de guerre des conditions de paix. */
export function termsCost(s: GameState, loser: Id, t: PeaceTerms): number {
  const g = gdpOf(s, loser) || 1;
  let c = 0;
  for (const id of t.annex) {
    const terr = s.territories[id];
    c += terr.id === loser ? 60 : 10 + (terr.gdp / g) * 60;
  }
  if (t.satellite) c += 50;
  if (t.reparations) c += 15;
  return Math.round(c);
}

/** Le perdant (IA) accepte-t-il ? */
export function aiAcceptsPeace(s: GameState, war: War, winner: Id, t: PeaceTerms): boolean {
  const loser = enemyLeader(war, winner);
  const cost = termsCost(s, loser, t);
  const score = scoreFor(war, winner);
  if (cost === 0) {
    // Paix blanche : acceptée si le perdant n'est pas en train de gagner nettement
    return score > -15 || s.nations[loser].exhaustion > 70;
  }
  return score + s.nations[loser].exhaustion / 5 >= cost;
}

export function applyPeace(s: GameState, war: War, winner: Id, t: PeaceTerms) {
  const loser = enemyLeader(war, winner);
  const W = s.nations[winner];
  const L = s.nations[loser];
  const loserGdp = gdpOf(s, loser) || 1;
  // Retirer la guerre et libérer les occupations
  s.wars = s.wars.filter((x) => x !== war);
  for (const terr of Object.values(s.territories))
    if (terr.occupiedBy && [...war.attackers, ...war.defenders].includes(terr.occupiedBy) && !stillOccupying(s, terr.occupiedBy, terr.owner))
      terr.occupiedBy = null;

  const parts: string[] = [];
  let annexedShare = 0;
  for (const id of t.annex) {
    const terr = s.territories[id];
    if (!terr || terr.owner !== loser) continue;
    annexedShare += terr.gdp / loserGdp;
    terr.owner = winner;
    terr.occupiedBy = null;
    terr.integration = terr.core === winner ? 100 : 0;
    parts.push(terr.name);
  }
  invalidate(s);
  if (parts.length) {
    W.aggression += 10 + annexedShare * 50;
    for (const n of alive(s)) if (n.id !== winner) addRel(s, n.id, winner, -(5 + annexedShare * 25));
  }
  if (t.reparations) {
    const amount = loserGdp * 0.1;
    L.treasury -= amount;
    W.treasury += amount;
    parts.push(`${amount.toFixed(0)} Md$ de réparations`);
  }
  if (t.satellite && L.alive && ownedTerritories(s, loser).length) {
    leaveBloc(s, loser, true);
    let bloc = W.bloc;
    if (!bloc) {
      bloc = `bloc-${winner}`;
      s.blocs[bloc] = { id: bloc, name: `Sphère ${W.name}`, color: '#d4a017', leader: winner, members: [winner] };
      W.bloc = bloc;
    }
    s.blocs[bloc].members.push(loser);
    L.bloc = bloc;
    addRel(s, winner, loser, 60);
    parts.push('satellisation');
  }
  L.stability = clamp(L.stability - 10, 0, 100);
  W.stability = clamp(W.stability + 5, 0, 100);
  addRel(s, winner, loser, -20);
  checkElimination(s, loser, winner);

  const desc = parts.length ? parts.join(', ') : 'paix blanche';
  log(s, `Paix : ${war.name} se termine (${desc}).`, 'war', [...war.attackers, ...war.defenders]);
}

function stillOccupying(s: GameState, occupier: Id, owner: Id) {
  return !!warBetween(s, occupier, owner);
}

export function checkElimination(s: GameState, id: Id, by?: Id) {
  const n = s.nations[id];
  if (!n.alive || ownedTerritories(s, id).length) return;
  n.alive = false;
  leaveBloc(s, id, true);
  s.trades = s.trades.filter((k) => !k.split('|').includes(id));
  s.sanctions = s.sanctions.filter((k) => !k.split('>').includes(id));
  for (const w of warsOf(s, id)) {
    w.attackers = w.attackers.filter((x) => x !== id);
    w.defenders = w.defenders.filter((x) => x !== id);
  }
  s.wars = s.wars.filter((w) => w.attackers.length && w.defenders.length);
  for (const o of alive(s)) o.claims = o.claims.filter((c) => c !== id);
  log(s, `${n.name} a été annexé${by ? ` par ${nm(s, by)}` : ''} et disparaît de la carte.`, 'war', [id]);
  if (id === s.player) s.gameOver = `Votre nation a été annexée${by ? ` par ${nm(s, by)}` : ''}.`;
}

export function leaveBloc(s: GameState, id: Id, silent = false) {
  const n = s.nations[id];
  if (!n.bloc) return;
  const b = s.blocs[n.bloc];
  b.members = b.members.filter((m) => m !== id);
  n.bloc = null;
  if (!silent) {
    for (const m of b.members) addRel(s, id, m, -30);
    log(s, `${n.name} quitte le bloc ${b.name}.`, 'diplo', [id]);
  }
  if (b.members.length < 2) {
    for (const m of b.members) s.nations[m].bloc = null;
    delete s.blocs[b.id];
    log(s, `Le bloc ${b.name} est dissous.`, 'diplo', b.members);
  } else if (b.leader === id) {
    b.leader = b.members.slice().sort((x, y) => power(s.nations[y]) - power(s.nations[x]))[0];
  }
}

/** Un participant non-meneur quitte une guerre (paix séparée). */
export function exitWar(s: GameState, war: War, id: Id) {
  war.attackers = war.attackers.filter((x) => x !== id);
  war.defenders = war.defenders.filter((x) => x !== id);
}
