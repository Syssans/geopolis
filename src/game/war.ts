import { RELIGIONS } from '../data/religions';
import { rand, shuffle } from './rng';
import {
  addRel, alive, clamp, devOf, inReach, invalidate, log, loseForces, nm, owned, power, provDev, rel, sameBloc, warBetween, warsOf,
} from './state';
import type { GameState, Id, PeaceTerms, Pid, War, World } from './types';

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
  if (!inReach(s, w, attacker, target)) return { ok: false, reason: 'Hors de portée (pas de frontière)' };
  if (a.exhaustion > 60) return { ok: false, reason: 'Lassitude de guerre trop élevée' };
  return { ok: true };
}

export function declareWar(s: GameState, w: World, attacker: Id, target: Id): War | null {
  if (!canDeclareWar(s, w, attacker, target).ok) return null;
  const a = s.nations[attacker];
  const holy = a.holyClaims.includes(target);
  const justified = holy || a.claims.includes(target);
  a.claims = a.claims.filter((c) => c !== target);
  a.holyClaims = a.holyClaims.filter((c) => c !== target);
  if (justified) a.aggression += 5;
  else {
    a.stability = clamp(a.stability - 15, 0, 100);
    a.aggression += 25;
  }
  s.trades = s.trades.filter((k) => !(k.split('|').includes(attacker) && k.split('|').includes(target)));
  addRel(s, attacker, target, -50);
  for (const n of alive(s)) if (n.id !== attacker && n.id !== target) addRel(s, attacker, n.id, justified ? -2 : -8);

  const war: War = {
    id: `w${s.nextUid++}`,
    name: holy ? `Guerre sainte ${nm(s, attacker)}–${nm(s, target)}` : `Guerre ${nm(s, attacker)}–${nm(s, target)}`,
    attackers: [attacker],
    defenders: [target],
    score: 0,
    battle: 0,
    months: 0,
    justified,
    holy,
  };
  s.wars.push(war);
  log(s, `${nm(s, attacker)} déclare ${holy ? 'une guerre sainte' : 'la guerre'} à ${nm(s, target)}${justified ? '' : ' sans casus belli'} !`, 'war', [attacker, target]);

  // Appel aux armes du bloc défensif
  const tb = s.nations[target].bloc;
  if (tb)
    for (const m of s.blocs[tb].members) {
      if (m === target || m === attacker) continue;
      if (m === s.player) callToArms(s, war, target);
      else joinWar(s, war, m, 'def');
    }
  // Garanties informelles : les grands amis de la cible (relations ≥ 70) peuvent intervenir
  for (const g of guarantors(s, target)) {
    if (g === s.player || war.attackers.includes(g) || war.defenders.includes(g) || sameBloc(s, g, attacker)) continue;
    if (inReach(s, w, g, attacker) && rand(s) < 0.6) joinWar(s, war, g, 'def');
  }
  // Guerre sainte : les coreligionnaires fervents peuvent s'engager
  if (holy) {
    const ra = a.religion;
    const rt = s.nations[target].religion;
    for (const n of alive(s)) {
      if (n.id === s.player || war.attackers.includes(n.id) || war.defenders.includes(n.id)) continue;
      if (!inReach(s, w, n.id, n.religion === ra ? target : attacker, false)) continue;
      if (n.religion === ra && n.policy === 'proselytisme' && rand(s) < 0.4 && !sameBloc(s, n.id, target)) joinWar(s, war, n.id, 'att');
      else if (n.religion === rt && n.policy !== 'tolerance' && rand(s) < 0.3 && !sameBloc(s, n.id, attacker)) joinWar(s, war, n.id, 'def');
    }
    for (const n of alive(s)) {
      if (n.religion === ra) addRel(s, attacker, n.id, 8);
      if (n.religion === rt) addRel(s, attacker, n.id, -15);
    }
  }
  s.tension = clamp(s.tension + 4, 0, 100);
  if (involvesNuclearClash(s, war)) {
    s.tension = clamp(s.tension + 20, 0, 100);
    log(s, '⚠ Deux puissances nucléaires s’affrontent. La tension mondiale explose.', 'war', [...war.attackers, ...war.defenders]);
  }
  return war;
}

/** Nations hors bloc qui protègent de fait la cible (alliances bilatérales non formalisées). */
export function guarantors(s: GameState, target: Id): Id[] {
  return alive(s)
    .filter((n) => n.id !== target && !sameBloc(s, n.id, target) && rel(s, n.id, target) >= 70 && power(n) > power(s.nations[target]))
    .map((n) => n.id);
}

function callToArms(s: GameState, war: War, ally: Id) {
  s.events.push({
    uid: s.nextUid++,
    kind: 'callToArms',
    title: 'Appel aux armes',
    text: `${nm(s, ally)}, membre de votre bloc, est attaqué dans la ${war.name}. Honorerez-vous vos engagements ?`,
    options: [
      { label: 'Honorer l’alliance', hint: 'Entrer en guerre aux côtés de notre allié' },
      { label: 'Refuser', hint: 'Quitter le bloc, stabilité −10' },
    ],
    params: { war: war.id, ally },
  });
}

export function joinWar(s: GameState, war: War, id: Id, side: 'att' | 'def') {
  if (war.attackers.includes(id) || war.defenders.includes(id)) return;
  const foes = side === 'att' ? war.defenders : war.attackers;
  // On ne prend jamais les armes contre un membre de son propre bloc
  if (foes.some((e) => sameBloc(s, id, e))) return;
  (side === 'att' ? war.attackers : war.defenders).push(id);
  for (const e of foes) {
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

function sideNavy(s: GameState, ids: Id[]): number {
  return ids.reduce((acc, id) => acc + s.nations[id].navy, 0);
}

/** Qui contrôle militairement une province (propriétaire ou occupant). */
const controller = (s: GameState, pid: Pid) => s.provinces[pid].occupiedBy ?? s.provinces[pid].owner;

/** Provinces ennemies atteignables depuis ce que contrôle un camp. */
function frontline(s: GameState, w: World, side: Id[], foes: Id[], naval: boolean): Pid[] {
  const res = new Set<Pid>();
  s.provinces.forEach((p, pid) => {
    if (!foes.includes(p.owner) || (p.occupiedBy && side.includes(p.occupiedBy))) return;
    const info = w.provinces[pid];
    const links = naval ? [...info.adj, ...info.sea] : info.adj;
    if (links.some((o) => side.includes(controller(s, o)))) res.add(pid);
  });
  return [...res];
}

/** Provinces du camp occupées par l'ennemi (à libérer). */
function occupiedOwn(s: GameState, side: Id[], foes: Id[]): Pid[] {
  const res: Pid[] = [];
  s.provinces.forEach((p, pid) => {
    if (side.includes(p.owner) && p.occupiedBy && foes.includes(p.occupiedBy)) res.push(pid);
  });
  return res;
}

export function resolveWarMonth(s: GameState, w: World, war: War) {
  war.months++;
  const pA = sidePower(s, war.attackers);
  const pB = sidePower(s, war.defenders) * 1.2;
  const r = pA / Math.max(pA + pB, 1e-6);
  war.battle = clamp(war.battle + (r - 0.5) * 8 * (0.6 + rand(s) * 0.8), -40, 40);

  // Sièges : le camp dominant prend des provinces, l'autre en libère
  const siege = (side: Id[], foes: Id[], ratio: number) => {
    const naval = sideNavy(s, side) >= sideNavy(s, foes) * 0.8;
    const taken = Math.floor(ratio * 3 + rand(s));
    const lib = shuffle(s, occupiedOwn(s, side, foes));
    let n = taken;
    for (const pid of lib) {
      if (n <= 0) break;
      s.provinces[pid].occupiedBy = null;
      n--;
    }
    const front = shuffle(s, frontline(s, w, side, foes, naval));
    for (const pid of front) {
      if (n <= 0) break;
      // Les grosses provinces résistent plus longtemps
      if (rand(s) < 8 / (8 + provDev(s, w, pid))) {
        s.provinces[pid].occupiedBy = side[0];
        if (side.includes(s.player) || s.provinces[pid].owner === s.player)
          log(s, `${w.provinces[pid].name} tombe aux mains de ${nm(s, side[0])}.`, 'war', [side[0], s.provinces[pid].owner]);
      }
      n--;
    }
  };
  if (r >= 0.5) siege(war.attackers, war.defenders, (r - 0.5) * 2 + 0.3);
  else siege(war.defenders, war.attackers, (0.5 - r) * 2 + 0.3);
  // Le camp dominé tient parfois une province
  if (rand(s) < 0.3) {
    if (r >= 0.5) siege(war.defenders, war.attackers, 0);
    else siege(war.attackers, war.defenders, 0);
  }

  const lossA = 0.04 * (1 - r);
  const lossB = 0.04 * r;
  war.attackers.forEach((id, i) => bleed(s, id, i === 0 ? lossA : lossA / 2));
  war.defenders.forEach((id, i) => bleed(s, id, i === 0 ? lossB : lossB / 2));
  updateScore(s, w, war);
  if (involvesNuclearClash(s, war)) s.tension = clamp(s.tension + 2, 0, 100);
}

function bleed(s: GameState, id: Id, rate: number) {
  const n = s.nations[id];
  loseForces(n, 'army', n.army * rate);
  n.exhaustion = clamp(n.exhaustion + 0.8 + rate * 25, 0, 100);
  if (n.exhaustion > 50) n.stability = clamp(n.stability - 0.3, 0, 100);
}

/** Part du développement d'un camp occupée par l'autre. */
function occupiedShare(s: GameState, w: World, victims: Id[], occupiers: Id[]): number {
  let tot = 0;
  let occ = 0;
  victims.forEach((v, i) => {
    const weight = i === 0 ? 1 : 0.3;
    for (const pid of owned(s, v)) {
      const d = provDev(s, w, pid) * weight;
      tot += d;
      const o = s.provinces[pid].occupiedBy;
      if (o && occupiers.includes(o)) occ += d;
    }
  });
  return tot ? occ / tot : 0;
}

export function updateScore(s: GameState, w: World, war: War) {
  const a = occupiedShare(s, w, war.defenders, war.attackers);
  const d = occupiedShare(s, w, war.attackers, war.defenders);
  const hi = s.nations[war.defenders[0]].nuclear ? 50 : 100;
  const lo = s.nations[war.attackers[0]].nuclear ? -50 : -100;
  war.score = Math.round(clamp((a - d) * 90 + war.battle, lo, hi));
}

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
export function termsCost(s: GameState, w: World, loser: Id, t: PeaceTerms): number {
  const total = devOf(s, loser) || 1;
  let c = 0;
  for (const pid of t.annex) c += 3 + (provDev(s, w, pid) / total) * 80;
  if (t.satellite) c += 50;
  if (t.reparations) c += 15;
  return Math.round(c);
}

/** Provinces du perdant que le vainqueur peut exiger (occupées par son camp). */
export function annexable(s: GameState, war: War, winner: Id): Pid[] {
  const loser = enemyLeader(war, winner);
  const side = war.attackers.includes(winner) ? war.attackers : war.defenders;
  const res: Pid[] = [];
  s.provinces.forEach((p, pid) => {
    if (p.owner === loser && p.occupiedBy && side.includes(p.occupiedBy)) res.push(pid);
  });
  return res;
}

export function aiAcceptsPeace(s: GameState, w: World, war: War, winner: Id, t: PeaceTerms): boolean {
  const loser = enemyLeader(war, winner);
  const cost = termsCost(s, w, loser, t);
  const score = scoreFor(war, winner);
  if (cost === 0) return score > -15 || s.nations[loser].exhaustion > 70;
  return score + s.nations[loser].exhaustion / 5 >= cost;
}

export function applyPeace(s: GameState, w: World, war: War, winner: Id, t: PeaceTerms) {
  const loser = enemyLeader(war, winner);
  const W = s.nations[winner];
  const L = s.nations[loser];
  const loserDev = devOf(s, loser) || 1;
  const participants = [...war.attackers, ...war.defenders];
  s.wars = s.wars.filter((x) => x !== war);
  // Libérer les occupations qui ne sont plus justifiées par une autre guerre
  for (const p of s.provinces) if (p.occupiedBy && participants.includes(p.occupiedBy) && !warBetween(s, p.occupiedBy, p.owner)) p.occupiedBy = null;

  const parts: string[] = [];
  let share = 0;
  for (const pid of t.annex) {
    const p = s.provinces[pid];
    if (p.owner !== loser) continue;
    share += provDev(s, w, pid) / loserDev;
    p.owner = winner;
    p.occupiedBy = null;
    p.integration = p.core === winner ? 100 : 0;
    parts.push(w.provinces[pid].name);
  }
  invalidate(s);
  if (parts.length) {
    W.aggression += 8 + share * 50;
    for (const n of alive(s)) if (n.id !== winner) addRel(s, n.id, winner, -(3 + share * 20));
  }
  if (t.reparations) {
    const amount = Math.max(1, L.treasury * 0.3 + 2);
    L.treasury -= amount;
    W.treasury += amount;
    parts.push(`${amount.toFixed(0)} Md$ de réparations`);
  }
  if (t.satellite && owned(s, loser).length) {
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
  if (war.holy) W.fervor += 50;
  if (winner === s.player && (parts.length || t.satellite)) s.stats.warsWon++;
  addRel(s, winner, loser, -20);
  checkElimination(s, loser, winner);
  log(s, `Paix : ${war.name} se termine (${parts.length ? parts.join(', ') : 'paix blanche'}).`, 'war', participants);
}

export function checkElimination(s: GameState, id: Id, by?: Id) {
  const n = s.nations[id];
  if (!n.alive || owned(s, id).length) return;
  n.alive = false;
  leaveBloc(s, id, true);
  s.trades = s.trades.filter((k) => !k.split('|').includes(id));
  s.embargoes = s.embargoes.filter((k) => !k.split('>').includes(id));
  for (const w of warsOf(s, id)) {
    w.attackers = w.attackers.filter((x) => x !== id);
    w.defenders = w.defenders.filter((x) => x !== id);
  }
  s.wars = s.wars.filter((w) => w.attackers.length && w.defenders.length);
  for (const o of alive(s)) {
    o.claims = o.claims.filter((c) => c !== id);
    o.holyClaims = o.holyClaims.filter((c) => c !== id);
  }
  for (const p of s.provinces) if (p.occupiedBy === id) p.occupiedBy = null;
  log(s, `${n.name} disparaît de la carte${by ? `, annexé par ${nm(s, by)}` : ''}.`, 'war', [id]);
  if (id === s.player) s.gameOver = `Votre nation a disparu${by ? `, annexée par ${nm(s, by)}` : ''}.`;
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

export function exitWar(s: GameState, war: War, id: Id) {
  war.attackers = war.attackers.filter((x) => x !== id);
  war.defenders = war.defenders.filter((x) => x !== id);
  for (const p of s.provinces) if (p.occupiedBy === id && !warBetween(s, id, p.owner)) p.occupiedBy = null;
}

export const religionLabel = (r: keyof typeof RELIGIONS) => RELIGIONS[r].name;
