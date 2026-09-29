import { RELIGIONS } from '../data/religions';
import { GOODS, STRAITS } from '../data/trade';
import { toggleEmbargo, toggleStrait } from './actions';
import { blockedStraits, estimate, escortsUsed, PIRACY, type ContractNews } from './contracts';
import { pushEvent } from './events';
import { monthlyIncome } from './missions';
import { pick, rand } from './rng';
import { addRel, alive, clamp, embargoes, inReach, log, neighbours, nm, owned, power, rel, sameBloc, warBetween } from './state';
import { straitOwner } from './trade';
import { declareWar, guarantors } from './war';
import type { GameState, PendingEvent, World } from './types';

const pending = (s: GameState, kind: string, key?: string | number) =>
  s.events.some((e) => e.kind === kind && (key === undefined || e.params.key === key));

// ————— Crises liées aux contrats —————

export function contractCrises(s: GameState, w: World, news: ContractNews) {
  // Une alerte par détroit bloqué (au plus une fois par an), qui concerne tous les contrats touchés
  const byStrait = new Map<string, number>();
  for (const { contract: c, straits } of news.blocked) for (const st of straits) byStrait.set(st, (byStrait.get(st) ?? 0) + 1);
  for (const [st, count] of byStrait) {
    if (pending(s, 'blockade', st) || (s.passes[`alert:${st}`] ?? 0) > 0) continue;
    s.passes[`alert:${st}`] = 12;
    const def = STRAITS.find((x) => x.id === st)!;
    const owner = straitOwner(s, w, st)!;
    const affected = s.contracts.filter((c) => c.route.straits.includes(st));
    const reroutable = affected.filter((c) => c.alternatives.some((r) => !blockedStraits(s, w, r).length)).length;
    const cost = Math.max(1, Math.round(affected.reduce((a, c) => a + estimate(c.volume, c.bonus, c.route, c.unitPrice).gross, 0) * 3 * 10) / 10);
    pushEvent(s, {
      kind: 'blockade',
      title: `Blocus : ${def.name}`,
      text: `${nm(s, owner)} bloque le ${def.name}. ${count} de vos contrats sont à l’arrêt. Sans livraison pendant 4 mois, ils seront rompus.`,
      options: [
        { label: 'Contourner', hint: reroutable ? `${reroutable} contrat(s) peuvent emprunter un autre itinéraire (plus long)` : 'Aucun itinéraire de contournement' },
        { label: 'Acheter un droit de passage', hint: `${cost.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Md$ versés à ${nm(s, owner)} : passage libre 12 mois` },
        { label: 'Exiger la réouverture', hint: `Influence −30 ; réussit si relations ≥ 10 avec ${nm(s, owner)}, sinon relations −15` },
      ],
      params: { key: st, strait: st, owner, cost },
    });
  }
  // Piraterie : une alerte au plus par an, les autres attaques vont au journal
  for (const c of news.pirated) {
    if (pending(s, 'piracy') || (s.passes['alert:piracy'] ?? 0) > 0) {
      log(s, `🏴‍☠️ Convoi pour ${nm(s, c.buyer)} arraisonné par des pirates.`, 'trade', [s.player]);
      continue;
    }
    s.passes['alert:piracy'] = 12;
    const zone = c.route.piracy.map((z) => PIRACY[z].name).join(', ');
    const lost = Math.round(estimate(c.volume, c.bonus, c.route, c.unitPrice).gross * 10) / 10;
    pushEvent(s, {
      kind: 'piracy',
      title: 'Convoi arraisonné',
      text: `Des pirates ont saisi un convoi à destination de ${nm(s, c.buyer)} (${zone}). ${lost.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Md$ de marchandises perdues ce mois-ci.`,
      options: [
        { label: 'Renforcer l’escorte', hint: `+1 flotte d’escorte (${Math.floor(s.nations[s.player].navy) - escortsUsed(s)} disponible(s))` },
        { label: 'Opération punitive', hint: 'Influence −20, ferveur −10 : plus de piraterie dans la zone pendant un an' },
        { label: 'Accepter la perte', hint: 'Aucun coût supplémentaire' },
      ],
      params: { key: c.id },
    });
  }
}

// ————— Le rival —————

export function runRival(s: GameState, w: World) {
  const rid = s.rival;
  if (!rid) return;
  const R = s.nations[rid];
  const me = s.nations[s.player];
  // Rival éliminé : il ne nuit plus, mais on le garde en mémoire pour le bilan (+40 au score)
  if (!R.alive) return;
  s.rivalHostility = clamp(s.rivalHostility + 0.6, 0, 100);
  if (rand(s) > 0.05 + s.rivalHostility / 900) return;
  const reach = inReach(s, w, rid, s.player);
  const actions: (() => boolean)[] = [];

  // Armer les minorités du joueur
  actions.push(() => {
    const cands = owned(s, s.player).filter((pid) => {
      const p = s.provinces[pid];
      return !p.supportedBy && !p.revolt && (p.religion !== me.religion || p.core !== p.owner);
    });
    const pid = pick(s, cands.sort((a, b) => Number(s.provinces[b].religion === R.religion) - Number(s.provinces[a].religion === R.religion)).slice(0, 4));
    if (pid === undefined || (!reach && s.provinces[pid].religion !== R.religion)) return false;
    const p = s.provinces[pid];
    p.supportedBy = rid;
    p.supportMonths = 24;
    p.unrest = Math.min(100, p.unrest + 15);
    pushEvent(s, {
      kind: 'rebels',
      title: 'Ingérence étrangère',
      text: `${R.name} arme les insurgés ${RELIGIONS[p.religion].adj}s de ${w.provinces[pid].name}. L’agitation monte dangereusement.`,
      options: [
        { label: 'Réprimer', hint: 'Agitation −30, stabilité −3, relations −15 avec les nations de cette religion' },
        { label: 'Faire des concessions', hint: 'Agitation −20, ferveur −30, soutien étranger coupé' },
        { label: 'Dénoncer à l’ONU', hint: `Influence −25 : ${R.name} perd des relations avec tout le monde, 50 % de chances de couper le soutien` },
      ],
      params: { pid, by: rid },
    });
    return true;
  });
  // Embargo
  actions.push(() => {
    if (embargoes(s, rid, s.player) || rel(s, rid, s.player) > 0) return false;
    toggleEmbargo(s, rid, s.player);
    R.influence += 15;
    return true;
  });
  // Sabotage d'un contrat
  actions.push(() => {
    const c = pick(s, s.contracts.filter((k) => k.buyer !== rid && !pending(s, 'sabotage', k.id)));
    if (!c) return false;
    pushEvent(s, {
      kind: 'sabotage',
      title: 'Concurrence déloyale',
      text: `${R.name} propose à ${nm(s, c.buyer)} de lui livrer du ${GOODS[c.good].name.toLowerCase()} moins cher que vous.`,
      options: [
        { label: 'Aligner nos prix', hint: `Prime réduite de ${Math.round(c.bonus * 100)} % à ${Math.round(Math.max(0, c.bonus - 0.12) * 100)} %` },
        { label: 'Faire pression', hint: `Influence −25 : conserver le contrat (réussite selon vos relations avec ${nm(s, c.buyer)})` },
        { label: 'Laisser faire', hint: '60 % de risque de perdre le contrat' },
      ],
      params: { key: c.id, by: rid },
    });
    return true;
  });
  // Fermer un détroit sur nos routes
  actions.push(() => {
    const st = STRAITS.find((x) => straitOwner(s, w, x.id) === rid && !R.closedStraits.includes(x.id) && s.contracts.some((c) => c.route.straits.includes(x.id)));
    if (!st) return false;
    toggleStrait(s, w, rid, st.id);
    return true;
  });
  // Coalition : monter nos voisins contre nous
  actions.push(() => {
    const nb = neighbours(s, w, s.player).filter((o) => o !== rid && !sameBloc(s, o, s.player));
    if (!nb.length) return false;
    for (const o of nb) {
      addRel(s, rid, o, 8);
      addRel(s, s.player, o, -6);
    }
    log(s, `${R.name} mène une campagne diplomatique contre vous auprès de vos voisins.`, 'diplo', [s.player]);
    return true;
  });
  // Ultimatum ou guerre si le rapport de force le permet
  actions.push(() => {
    if (!reach || warBetween(s, rid, s.player) || pending(s, 'ultimatum') || s.rivalHostility < 50) return false;
    const allies = guarantors(s, s.player).length + (me.bloc ? s.blocs[me.bloc].members.length - 1 : 0);
    if (me.nuclear || power(R) < power(me) * 1.3) return false;
    const amount = Math.max(2, Math.round(monthlyIncome(s, s.player) * 4));
    pushEvent(s, {
      kind: 'ultimatum',
      title: `Ultimatum de ${R.name}`,
      text: `${R.name} masse ses troupes à la frontière et exige un « dédommagement » de ${amount} Md$. Faute de quoi, ce sera la guerre.`,
      options: [
        { label: 'Payer', hint: `Trésor −${amount} Md$, stabilité −5` },
        { label: 'Appeler nos alliés', hint: allies ? `Influence −40 : ${allies} allié(s) potentiel(s) peuvent dissuader ${R.name}` : 'Influence −40 : vous n’avez guère d’alliés…' },
        { label: 'Refuser', hint: 'Stabilité +5 si vous tenez, mais la guerre est probable' },
      ],
      params: { by: rid, amount, allies },
    });
    return true;
  });

  // On tente les actions dans un ordre aléatoire jusqu'à ce que l'une réussisse
  const order = actions.map((a, i) => ({ a, r: rand(s) + (i === 5 ? -0.1 : 0) })).sort((x, y) => x.r - y.r);
  for (const { a } of order)
    if (a()) {
      s.rivalHostility = Math.max(0, s.rivalHostility - 15);
      return;
    }
}

/** Krach sur la principale marchandise du joueur. */
export function marketCrisis(s: GameState, w: World) {
  if (pending(s, 'crash') || rand(s) > 0.015) return;
  const counts: Record<string, number> = {};
  for (const pid of owned(s, s.player)) {
    const g = s.provinces[pid].good ?? w.provinces[pid].good;
    counts[g] = (counts[g] ?? 0) + w.provinces[pid].dev;
  }
  const good = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!good) return;
  s.prices[good] = Math.max(0.4, (s.prices[good] ?? 1) - 0.4);
  pushEvent(s, {
    kind: 'crash',
    title: `Krach : ${GOODS[good as keyof typeof GOODS].name}`,
    text: `Les cours de votre principale exportation s’effondrent (${Math.round((s.prices[good] - 1) * 100)} %). Vos revenus vont chuter.`,
    options: [
      { label: 'Soutenir les producteurs', hint: 'Trésor −3 mois de revenus, stabilité +5' },
      { label: 'Chercher de nouveaux clients', hint: 'Influence −20 : deux offres de contrat arrivent aussitôt' },
      { label: 'Laisser le marché se corriger', hint: 'Stabilité −6' },
    ],
    params: { good },
  });
}

// ————— Résolution des choix —————

export function resolveCrisis(s: GameState, w: World, e: PendingEvent, option: number, extraOffers: () => void): string | null {
  const me = s.nations[s.player];
  const p = e.params;
  switch (e.kind) {
    case 'blockade': {
      const st = p.strait as string;
      const owner = p.owner as string;
      if (option === 0) {
        let n = 0;
        for (const c of s.contracts)
          if (c.route.straits.includes(st)) {
            const alt = c.alternatives.find((r) => !blockedStraits(s, w, r).length);
            if (alt) {
              c.route = alt;
              c.blocked = 0;
              n++;
            }
          }
        return n ? `${n} contrat(s) réacheminé(s).` : 'Aucun contournement possible : nous attendons.';
      }
      if (option === 1) {
        const cost = Number(p.cost);
        if (me.treasury < cost) return 'Trésor insuffisant : les convois attendent.';
        me.treasury -= cost;
        s.nations[owner].treasury += cost;
        s.passes[st] = 12;
        addRel(s, s.player, owner, 5);
        return 'Droit de passage acheté pour 12 mois.';
      }
      if (me.influence < 30) return 'Influence insuffisante.';
      me.influence -= 30;
      if (rel(s, s.player, owner) >= 10 && !warBetween(s, s.player, owner)) {
        s.passes[st] = 12;
        return `${nm(s, owner)} laisse passer nos navires.`;
      }
      addRel(s, s.player, owner, -15);
      return `${nm(s, owner)} refuse sèchement.`;
    }
    case 'piracy': {
      const c = s.contracts.find((x) => x.id === p.key);
      if (!c) return 'Le contrat n’existe plus.';
      if (option === 0) {
        if (escortsUsed(s) + 1 > Math.floor(me.navy)) return 'Aucune flotte disponible : construisez des navires (onglet Armée).';
        c.escort++;
        return `Escorte portée à ${c.escort} flotte(s).`;
      }
      if (option === 1) {
        if (me.influence < 20 || me.fervor < 10) return 'Ressources insuffisantes.';
        me.influence -= 20;
        me.fervor -= 10;
        for (const z of c.route.piracy) s.passes[`piracy:${z}`] = 12;
        return 'Opération menée : les pirates se font discrets pour un an.';
      }
      return 'Nous encaissons la perte.';
    }
    case 'rebels': {
      const pr = s.provinces[Number(p.pid)];
      if (option === 0) {
        pr.unrest = Math.max(0, pr.unrest - 30);
        me.stability = clamp(me.stability - 3, 0, 100);
        for (const o of alive(s)) if (o.religion === pr.religion && o.id !== s.player) addRel(s, s.player, o.id, -15);
        return 'La répression rétablit un calme précaire.';
      }
      if (option === 1) {
        pr.unrest = Math.max(0, pr.unrest - 20);
        me.fervor = Math.max(0, me.fervor - 30);
        pr.supportedBy = null;
        return 'Des concessions apaisent la province.';
      }
      if (me.influence < 25) return 'Influence insuffisante.';
      me.influence -= 25;
      for (const o of alive(s)) if (o.id !== p.by) addRel(s, p.by as string, o.id, -5);
      if (rand(s) < 0.5) pr.supportedBy = null;
      return `${nm(s, p.by as string)} est mis au ban des nations.`;
    }
    case 'sabotage': {
      const c = s.contracts.find((x) => x.id === p.key);
      if (!c) return 'Le contrat n’existe plus.';
      if (option === 0) {
        c.bonus = Math.max(0, Math.round((c.bonus - 0.12) * 100) / 100);
        return 'Nous gardons le client, à moindre prix.';
      }
      if (option === 1) {
        if (me.influence < 25) return 'Influence insuffisante.';
        me.influence -= 25;
        if (rand(s) < 0.5 + rel(s, s.player, c.buyer) / 200) return `${nm(s, c.buyer)} nous reste fidèle.`;
      } else if (rand(s) > 0.6) return `${nm(s, c.buyer)} n’a pas donné suite à l’offre concurrente.`;
      s.contracts = s.contracts.filter((x) => x !== c);
      addRel(s, s.player, p.by as string, -10);
      return `${nm(s, c.buyer)} rompt le contrat au profit de ${nm(s, p.by as string)}.`;
    }
    case 'ultimatum': {
      const by = p.by as string;
      const amount = Number(p.amount);
      if (option === 0) {
        me.treasury -= amount;
        s.nations[by].treasury += amount;
        me.stability = clamp(me.stability - 5, 0, 100);
        s.rivalHostility = Math.max(0, s.rivalHostility - 60);
        return 'Nous avons payé. L’humiliation est amère.';
      }
      if (option === 1) {
        if (me.influence < 40) return declare(s, w, by);
        me.influence -= 40;
        if (Number(p.allies) > 0 && rand(s) < 0.75) {
          s.rivalHostility = Math.max(0, s.rivalHostility - 40);
          addRel(s, by, s.player, -10);
          return `Nos alliés font front : ${nm(s, by)} recule.`;
        }
        return declare(s, w, by);
      }
      if (rand(s) < 0.3) {
        me.stability = clamp(me.stability + 5, 0, 100);
        return `${nm(s, by)} bluffait. Le pays est fier de sa fermeté.`;
      }
      return declare(s, w, by);
    }
    case 'crash': {
      if (option === 0) {
        me.treasury -= monthlyIncome(s, s.player) * 3;
        me.stability = clamp(me.stability + 5, 0, 100);
        return 'Les producteurs sont soutenus.';
      }
      if (option === 1) {
        if (me.influence < 20) return 'Influence insuffisante.';
        me.influence -= 20;
        extraOffers();
        extraOffers();
        return 'Nos diplomates démarchent de nouveaux clients.';
      }
      me.stability = clamp(me.stability - 6, 0, 100);
      return 'Le marché finira par se redresser.';
    }
  }
  return null;
}

function declare(s: GameState, w: World, by: string): string {
  s.nations[by].claims.push(s.player);
  declareWar(s, w, by, s.player);
  return `${nm(s, by)} nous déclare la guerre !`;
}

