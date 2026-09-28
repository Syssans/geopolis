import { addToBloc } from './actions';
import { pick, rand } from './rng';
import { addRel, alive, clamp, gdpOf, log, nm, rel } from './state';
import { applyPeace, joinWar, leaveBloc } from './war';
import type { GameState, Id, Nation, PeaceTerms, PendingEvent } from './types';

interface RandomEvent {
  kind: string;
  title: string;
  text: (s: GameState, p: Record<string, string | number>) => string;
  options: { label: string; hint: string; apply: (s: GameState, n: Nation, p: Record<string, string | number>) => void }[];
  params?: (s: GameState) => Record<string, string | number> | null;
}

const money = (s: GameState, pct: number) => Math.round(gdpOf(s, s.player) * pct * 10) / 1000;

const RANDOM_EVENTS: RandomEvent[] = [
  {
    kind: 'election',
    title: 'Élections générales',
    text: () => 'Le pays se rend aux urnes. Quelle ligne le gouvernement doit-il défendre ?',
    options: [
      { label: 'Campagne populiste', hint: 'Stabilité +8, capital politique −20', apply: (s, n) => { n.stability = clamp(n.stability + 8, 0, 100); n.points.pol = Math.max(0, n.points.pol - 20); } },
      { label: 'Programme de réformes', hint: 'Croissance +0,1 pt (permanent), stabilité −5', apply: (s, n) => { n.growthBonus = Math.min(1, Math.round((n.growthBonus + 0.1) * 100) / 100); n.stability = clamp(n.stability - 5, 0, 100); } },
    ],
  },
  {
    kind: 'corruption',
    title: 'Scandale de corruption',
    text: () => 'La presse révèle un vaste système de pots-de-vin au sommet de l’État.',
    options: [
      { label: 'Enquête indépendante', hint: 'Capital politique −30, stabilité +4', apply: (s, n) => { n.points.pol = Math.max(0, n.points.pol - 30); n.stability = clamp(n.stability + 4, 0, 100); } },
      { label: 'Étouffer l’affaire', hint: 'Stabilité −10', apply: (s, n) => { n.stability = clamp(n.stability - 10, 0, 100); } },
    ],
  },
  {
    kind: 'resource',
    title: 'Découverte d’un gisement',
    text: () => 'Un important gisement de terres rares vient d’être découvert.',
    options: [
      { label: 'Exploitation immédiate', hint: 'Trésor +1 % du PIB, stabilité −3', apply: (s, n) => { n.treasury += money(s, 1); n.stability = clamp(n.stability - 3, 0, 100); } },
      { label: 'Créer un fonds souverain', hint: 'Croissance +0,5 pt pendant 5 ans', apply: (s, n) => { n.modifiers.push({ id: 'fund', label: 'Fonds souverain', months: 60, growth: 0.5 }); } },
    ],
  },
  {
    kind: 'energy',
    title: 'Choc énergétique',
    text: () => 'Les prix du pétrole et du gaz s’envolent sur les marchés mondiaux.',
    options: [
      { label: 'Bouclier tarifaire', hint: 'Trésor −1 % du PIB', apply: (s, n) => { n.treasury -= money(s, 1); } },
      { label: 'Laisser faire le marché', hint: 'Stabilité −8, croissance −0,5 pt pendant 1 an', apply: (s, n) => { n.stability = clamp(n.stability - 8, 0, 100); n.modifiers.push({ id: 'energy', label: 'Choc énergétique', months: 12, growth: -0.5 }); } },
    ],
  },
  {
    kind: 'cyber',
    title: 'Cyberattaque majeure',
    params: (s) => {
      const rival = alive(s).filter((n) => n.id !== s.player).sort((a, b) => rel(s, s.player, a.id) - rel(s, s.player, b.id))[0];
      return rival ? { rival: rival.id } : null;
    },
    text: (s, p) => `Nos infrastructures critiques sont paralysées. Les soupçons se portent sur ${nm(s, p.rival as Id)}.`,
    options: [
      { label: 'Riposte offensive', hint: 'Doctrine −20, relations −20 avec le suspect, stabilité +3', apply: (s, n, p) => { n.points.mil = Math.max(0, n.points.mil - 20); addRel(s, n.id, p.rival as Id, -20); n.stability = clamp(n.stability + 3, 0, 100); } },
      { label: 'Renforcer nos défenses', hint: 'Trésor −0,3 % du PIB', apply: (s, n) => { n.treasury -= money(s, 0.3); } },
    ],
  },
  {
    kind: 'ai',
    title: 'Percée en intelligence artificielle',
    text: () => 'Un laboratoire national annonce une avancée majeure en IA.',
    options: [
      { label: 'Investir massivement', hint: 'Trésor −1 % du PIB, croissance +1 pt pendant 4 ans', apply: (s, n) => { n.treasury -= money(s, 1); n.modifiers.push({ id: 'ai', label: 'Boom de l’IA', months: 48, growth: 1 }); } },
      { label: 'Encadrer par la loi', hint: 'Capital politique +30', apply: (s, n) => { n.points.pol += 30; } },
    ],
  },
  {
    kind: 'protests',
    title: 'Manifestations massives',
    text: () => 'Des centaines de milliers de personnes défilent contre le coût de la vie.',
    options: [
      { label: 'Concessions sociales', hint: 'Trésor −0,5 % du PIB, stabilité +5', apply: (s, n) => { n.treasury -= money(s, 0.5); n.stability = clamp(n.stability + 5, 0, 100); } },
      { label: 'Maintien de l’ordre', hint: 'Stabilité +2, influence −20', apply: (s, n) => { n.stability = clamp(n.stability + 2, 0, 100); n.points.dip = Math.max(0, n.points.dip - 20); } },
    ],
  },
  {
    kind: 'refugees',
    title: 'Crise migratoire',
    text: () => 'Un conflit régional pousse des milliers de réfugiés vers nos frontières.',
    options: [
      { label: 'Accueillir', hint: 'Stabilité −4, influence +30', apply: (s, n) => { n.stability = clamp(n.stability - 4, 0, 100); n.points.dip += 30; } },
      { label: 'Fermer les frontières', hint: 'Stabilité +2, influence −15', apply: (s, n) => { n.stability = clamp(n.stability + 2, 0, 100); n.points.dip = Math.max(0, n.points.dip - 15); } },
    ],
  },
  {
    kind: 'pandemic',
    title: 'Épidémie',
    text: () => 'Un nouveau virus respiratoire se propage rapidement.',
    options: [
      { label: 'Confinement strict', hint: 'Croissance −2 pts pendant 6 mois, stabilité +2', apply: (s, n) => { n.modifiers.push({ id: 'lockdown', label: 'Confinement', months: 6, growth: -2 }); n.stability = clamp(n.stability + 2, 0, 100); } },
      { label: 'Rester ouvert', hint: 'Stabilité −10', apply: (s, n) => { n.stability = clamp(n.stability - 10, 0, 100); } },
    ],
  },
  {
    kind: 'summit',
    title: 'Sommet international',
    text: () => 'Nous accueillons un sommet réunissant les grandes puissances.',
    options: [
      { label: 'Proposer une médiation', hint: 'Influence +40', apply: (s, n) => { n.points.dip += 40; s.tension = clamp(s.tension - 5, 0, 100); } },
      { label: 'Défendre nos intérêts', hint: 'Capital politique +20', apply: (s, n) => { n.points.pol += 20; } },
    ],
  },
  {
    kind: 'arms',
    title: 'Contrat d’armement',
    text: () => 'Un industriel propose un contrat de modernisation accélérée de nos forces.',
    options: [
      { label: 'Signer', hint: 'Trésor −0,5 % du PIB, puissance militaire +10 %', apply: (s, n) => { n.treasury -= money(s, 0.5); n.strength *= 1.1; } },
      { label: 'Refuser', hint: 'Capital politique +10', apply: (s, n) => { n.points.pol += 10; } },
    ],
  },
];

export function maybeRandomEvent(s: GameState) {
  if (s.events.some((e) => RANDOM_EVENTS.some((r) => r.kind === e.kind))) return;
  if (rand(s) > 0.07) return;
  const def = pick(s, RANDOM_EVENTS)!;
  const params = def.params ? def.params(s) : {};
  if (params === null) return;
  pushEvent(s, {
    kind: def.kind,
    title: def.title,
    text: def.text(s, params),
    options: def.options.map((o) => ({ label: o.label, hint: o.hint })),
    params,
  });
}

export function pushEvent(s: GameState, e: Omit<PendingEvent, 'uid'>) {
  s.events.push({ ...e, uid: s.nextUid++ });
}

export function termsToParams(t: PeaceTerms) {
  return { annex: t.annex.join(';'), satellite: t.satellite ? 1 : 0, reparations: t.reparations ? 1 : 0 };
}

export function paramsToTerms(p: Record<string, string | number>): PeaceTerms {
  return {
    annex: String(p.annex ?? '').split(';').filter(Boolean),
    satellite: p.satellite === 1,
    reparations: p.reparations === 1,
  };
}

/** Applique le choix du joueur. Retourne un message de confirmation. */
export function resolveEvent(s: GameState, uid: number, option: number): string {
  const e = s.events.find((x) => x.uid === uid);
  if (!e) return '';
  s.events = s.events.filter((x) => x !== e);
  const me = s.nations[s.player];
  const p = e.params;
  switch (e.kind) {
    case 'callToArms': {
      const war = s.wars.find((w) => w.id === p.war);
      if (!war) return 'La guerre est déjà terminée.';
      if (option === 0) {
        joinWar(s, war, s.player, war.defenders.includes(p.ally as Id) ? 'def' : 'att');
        return 'Nous entrons en guerre.';
      }
      leaveBloc(s, s.player);
      me.stability = clamp(me.stability - 10, 0, 100);
      return 'Nous avons trahi notre alliance.';
    }
    case 'peaceOffer': {
      const war = s.wars.find((w) => w.id === p.war);
      if (!war) return 'La guerre est déjà terminée.';
      if (option === 0) {
        applyPeace(s, war, p.winner as Id, paramsToTerms(p));
        return 'Traité de paix signé.';
      }
      me.stability = clamp(me.stability - 2, 0, 100);
      return 'Nous poursuivons le combat.';
    }
    case 'whitePeace': {
      const war = s.wars.find((w) => w.id === p.war);
      if (!war) return 'La guerre est déjà terminée.';
      if (option === 0) {
        applyPeace(s, war, p.from as Id, { annex: [], satellite: false, reparations: false });
        return 'Paix blanche conclue.';
      }
      return 'Offre rejetée.';
    }
    case 'joinRequest': {
      const from = p.from as Id;
      if (!s.nations[from].alive || s.nations[from].bloc) return 'La demande n’est plus valable.';
      if (option === 0) {
        addToBloc(s, s.player, from);
        return `${nm(s, from)} rejoint notre bloc.`;
      }
      addRel(s, s.player, from, -10);
      return 'Demande rejetée.';
    }
    default: {
      const def = RANDOM_EVENTS.find((r) => r.kind === e.kind);
      def?.options[option]?.apply(s, me, p);
      log(s, `${e.title} : ${e.options[option]?.label}.`, 'event', [s.player]);
      return e.options[option]?.label ?? '';
    }
  }
}
