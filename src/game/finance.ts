/**
 * Finances publiques : un trésor négatif est une dette qui coûte des intérêts. Quand elle devient écrasante,
 * une crise de la dette oblige à choisir : plan du FMI (austérité), défaut de paiement ou fuite en avant.
 */
import { addRel, alive, clamp, log } from './state';
import type { GameState, Id, Nation } from './types';

/** Intérêts mensuels sur la dette (≈ 20 % par an). */
export const DEBT_RATE = 0.015;
/** Crise de la dette quand la dette dépasse ce nombre de mois de revenus. */
export const CRISIS_MONTHS = 6;
export const AUSTERITY_MONTHS = 24;
/** Réduction du coût de l'État pendant l'austérité. */
export const AUSTERITY_CUT = 0.3;

const now = (s: GameState) => s.year * 12 + (s.month - 1);

export const grossIncome = (n: Nation) => Math.max(0.1, n.income.production + n.income.trade + n.income.tolls + (n.income.contracts ?? 0));

/** Intérêts dus ce mois-ci. */
export const interestOf = (n: Nation) => (n.treasury < 0 ? -n.treasury * DEBT_RATE : 0);

/** Solde mensuel du joueur tel qu'affiché (tous revenus moins toutes dépenses du dernier mois). */
export function netBalance(s: GameState): number {
  const n = s.nations[s.player];
  const i = n.income;
  return i.production + i.trade + i.tolls + (i.contracts ?? 0) - i.upkeep - (i.admin ?? 0) - (i.interest ?? 0) - (s.needs ? s.needs.cost + s.needs.purchases : 0);
}

/** Dette exprimée en mois de revenus (0 si le trésor est positif). */
export function debtMonths(s: GameState, id: Id): number {
  const n = s.nations[id];
  return n.treasury < 0 ? -n.treasury / grossIncome(n) : 0;
}

export const inAusterity = (s: GameState) => (s.austerityUntil ?? 0) > now(s);
export const inDefault = (s: GameState) => (s.defaultUntil ?? 0) > now(s);

/**
 * Pourquoi la population ne peut pas monter de palier (ou null) : on ne s'enrichit pas à crédit.
 */
export function tierBlocked(s: GameState): string | null {
  if (s.nations[s.player].treasury < 0) return 'trésor négatif : on ne s’enrichit pas à crédit';
  if (inAusterity(s)) return 'plan d’austérité en cours';
  return null;
}

/** Chaque mois : intérêts, conséquences de la faillite, crise de la dette. */
export function monthlyFinance(s: GameState, n: Nation): number {
  const interest = interestOf(n);
  n.treasury -= interest;
  if (n.treasury < 0) {
    // Faillite : désertions, grèves, colère
    n.stability = clamp(n.stability - 0.5 - Math.min(1.5, debtMonths(s, n.id) / 12), 0, 100);
    n.army *= 0.98;
    n.navy *= 0.98;
    // L'IA finit par restructurer sa dette sans cérémonie
    if (n.id !== s.player && debtMonths(s, n.id) > 12) n.treasury *= 0.4;
  }
  if (n.id === s.player && debtMonths(s, n.id) > CRISIS_MONTHS && (s.debtCrisisAt ?? -99) + 24 <= now(s) && !s.events.some((e) => e.kind === 'debt')) {
    s.debtCrisisAt = now(s);
    s.events.push({
      uid: s.nextUid++,
      kind: 'debt',
      title: '💸 Crise de la dette',
      text: `Votre dette atteint ${Math.round(-n.treasury)} Md$, soit ${Math.round(debtMonths(s, n.id))} mois de revenus. Les intérêts vous coûtent ${Math.round(interestOf(n) * 10) / 10} Md$ par mois et les créanciers exigent une réponse.`,
      options: [
        { label: 'Accepter le plan du FMI', hint: `Dette −50 % · ${AUSTERITY_MONTHS} mois d’austérité : coût de l’État −30 %, stabilité −0,4 /mois, pas de progrès du niveau de vie · influence −20` },
        { label: 'Faire défaut', hint: 'Dette −70 % · stabilité −12 · relations −20 avec les grandes économies · plus aucune offre de contrat ni achat pendant 12 mois' },
        { label: 'Tenir bon', hint: 'Rien ne change : les intérêts continuent de courir' },
      ],
      params: {},
    });
  }
  if (n.id === s.player && inAusterity(s)) n.stability = clamp(n.stability - 0.4, 0, 100);
  return interest;
}

export function resolveDebt(s: GameState, option: number): string {
  const n = s.nations[s.player];
  if (n.treasury >= 0) return 'La dette a déjà été résorbée.';
  if (option === 0) {
    n.treasury *= 0.5;
    n.influence = Math.max(0, n.influence - 20);
    s.austerityUntil = now(s) + AUSTERITY_MONTHS;
    log(s, '💸 Plan du FMI accepté : la dette est réduite de moitié, l’austérité commence.', 'info', [s.player]);
    return 'Plan du FMI : dette réduite de moitié, austérité pour deux ans.';
  }
  if (option === 1) {
    n.treasury *= 0.3;
    n.stability = clamp(n.stability - 12, 0, 100);
    s.defaultUntil = now(s) + 12;
    const big = alive(s).filter((o) => o.id !== s.player).sort((a, b) => grossIncome(b) - grossIncome(a)).slice(0, 10);
    for (const o of big) addRel(s, s.player, o.id, -20);
    s.offers = [];
    s.purchases = [];
    log(s, '💸 Défaut de paiement : les créanciers perdent 70 %, les marchés vous tournent le dos pour un an.', 'info', [s.player]);
    return 'Défaut de paiement : la dette fond, mais plus personne ne commerce avec vous pendant un an.';
  }
  return 'Nous tenons bon. Les intérêts continuent de courir.';
}
