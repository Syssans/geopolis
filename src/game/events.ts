import { RELIGIONS, religiousDistance } from '../data/religions';
import { GOODS } from '../data/trade';
import { addToBloc } from './actions';
import { holySitesOf } from './religion';
import { pick, rand } from './rng';
import { addRel, alive, clamp, inReach, log, nm, owned, rel } from './state';
import { applyPeace, joinWar, leaveBloc } from './war';
import type { GameState, Nation, PeaceTerms, PendingEvent, World } from './types';

type Params = Record<string, string | number>;

interface RandomEvent {
  kind: string;
  title: string;
  /** Paramètres, ou null si l'événement ne peut pas se produire maintenant. */
  params?: (s: GameState, w: World) => Params | null;
  text: (s: GameState, w: World, p: Params) => string;
  options: { label: string; hint: string; apply: (s: GameState, w: World, n: Nation, p: Params) => void }[];
}

const monthlyIncome = (n: Nation) => Math.max(0.5, n.income.production + n.income.trade + n.income.tolls);
const stab = (n: Nation, d: number) => (n.stability = clamp(n.stability + d, 0, 100));

function minorityProvince(s: GameState, n: Nation): number | undefined {
  return pick(s, owned(s, n.id).filter((pid) => s.provinces[pid].religion !== n.religion));
}

const RANDOM_EVENTS: RandomEvent[] = [
  {
    kind: 'pilgrimage',
    title: 'Grand pèlerinage',
    params: (s, w) => {
      const site = holySitesOf(s, w, s.player)[0];
      return site ? { site: site.name } : null;
    },
    text: (s, w, p) => `Des millions de fidèles affluent vers ${p.site}. La foule dépasse toutes les prévisions.`,
    options: [
      { label: 'Accueillir les pèlerins', hint: 'Ferveur +40, trésor +2 mois de revenus', apply: (s, w, n) => { n.fervor += 40; n.treasury += monthlyIncome(n) * 2; } },
      { label: 'Limiter l’accès', hint: 'Stabilité +3, ferveur −10', apply: (s, w, n) => { stab(n, 3); n.fervor = Math.max(0, n.fervor - 10); } },
    ],
  },
  {
    kind: 'preacher',
    title: 'Un prédicateur enflamme les foules',
    text: (s) => `Un prédicateur ${RELIGIONS[s.nations[s.player].religion].adj} charismatique remplit les stades et appelle à défendre la foi.`,
    options: [
      { label: 'Le soutenir', hint: 'Ferveur +60, agitation +15 dans les provinces minoritaires', apply: (s, w, n) => {
        n.fervor += 60;
        for (const pid of owned(s, n.id)) if (s.provinces[pid].religion !== n.religion) s.provinces[pid].unrest = Math.min(100, s.provinces[pid].unrest + 15);
      } },
      { label: 'Le faire taire', hint: 'Stabilité +2, ferveur −20', apply: (s, w, n) => { stab(n, 2); n.fervor = Math.max(0, n.fervor - 20); } },
    ],
  },
  {
    kind: 'sectarian',
    title: 'Violences confessionnelles',
    params: (s) => {
      const pid = minorityProvince(s, s.nations[s.player]);
      return pid === undefined ? null : { pid };
    },
    text: (s, w, p) => {
      const pid = p.pid as number;
      return `Des affrontements éclatent entre la majorité ${RELIGIONS[s.nations[s.player].religion].adj} et la communauté ${RELIGIONS[s.provinces[pid].religion].adj} de ${w.provinces[pid].name}.`;
    },
    options: [
      { label: 'Rétablir l’ordre par la force', hint: 'Agitation −25 sur place, relations −10 avec les nations de cette religion', apply: (s, w, n, p) => {
        const pr = s.provinces[p.pid as number];
        pr.unrest = Math.max(0, pr.unrest - 25);
        for (const o of alive(s)) if (o.religion === pr.religion) addRel(s, n.id, o.id, -10);
      } },
      { label: 'Ouvrir un dialogue', hint: 'Influence −20, agitation −10', apply: (s, w, n, p) => {
        n.influence = Math.max(0, n.influence - 20);
        const pr = s.provinces[p.pid as number];
        pr.unrest = Math.max(0, pr.unrest - 10);
      } },
    ],
  },
  {
    kind: 'oilshock',
    title: 'Choc pétrolier',
    text: () => 'Les cours du pétrole et du gaz s’envolent après une série d’attaques contre des installations du Golfe.',
    params: (s) => {
      s.prices.petrole = Math.min(3, (s.prices.petrole ?? 1) + 0.6);
      s.prices.gaz = Math.min(3, (s.prices.gaz ?? 1) + 0.4);
      return {};
    },
    options: [
      { label: 'Puiser dans les réserves stratégiques', hint: 'Trésor −3 mois de revenus', apply: (s, w, n) => { n.treasury -= monthlyIncome(n) * 3; } },
      { label: 'Laisser les prix monter', hint: 'Stabilité −5', apply: (s, w, n) => stab(n, -5) },
    ],
  },
  {
    kind: 'piracy',
    title: 'Piraterie',
    params: (s) => (s.nations[s.player].navy >= 1 ? {} : null),
    text: () => 'Des pirates attaquent les porte-conteneurs au large de la Somalie et dans le détroit de Malacca.',
    options: [
      { label: 'Envoyer la marine', hint: 'Marine −1, influence +30', apply: (s, w, n) => { n.navy = Math.max(0, n.navy - 1); n.influence += 30; } },
      { label: 'Laisser les autres s’en charger', hint: 'Aucun effet', apply: () => {} },
    ],
  },
  {
    kind: 'discovery',
    title: 'Découverte d’un gisement',
    params: (s, w) => {
      const pid = pick(s, owned(s, s.player).filter((x) => !['petrole', 'gaz', 'terres_rares'].includes(s.provinces[x].good ?? w.provinces[x].good)));
      return pid === undefined ? null : { pid, good: rand(s) < 0.5 ? 'petrole' : 'terres_rares' };
    },
    text: (s, w, p) => `Des géologues découvrent un important gisement (${GOODS[p.good as keyof typeof GOODS].name.toLowerCase()}) en ${w.provinces[p.pid as number].name}.`,
    options: [
      { label: 'Exploiter le gisement', hint: 'La province produit désormais cette ressource, stabilité −2', apply: (s, w, n, p) => {
        s.provinces[p.pid as number].good = p.good as never;
        stab(n, -2);
      } },
      { label: 'Protéger l’environnement', hint: 'Stabilité +3', apply: (s, w, n) => stab(n, 3) },
    ],
  },
  {
    kind: 'interfaith',
    title: 'Dialogue interreligieux',
    text: () => 'Des chefs religieux du monde entier proposent un grand sommet pour la paix entre les confessions.',
    options: [
      { label: 'Accueillir le sommet', hint: 'Ferveur −30, relations +8 avec les voisins d’autres religions, tension −5', apply: (s, w, n) => {
        n.fervor = Math.max(0, n.fervor - 30);
        for (const o of alive(s)) if (o.religion !== n.religion && inReach(s, w, n.id, o.id, false)) addRel(s, n.id, o.id, 8);
        s.tension = clamp(s.tension - 5, 0, 100);
      } },
      { label: 'Décliner', hint: 'Ferveur +20', apply: (s, w, n) => { n.fervor += 20; } },
    ],
  },
  {
    kind: 'revival',
    title: 'Réveil religieux',
    params: (s) => {
      const pid = minorityProvince(s, s.nations[s.player]);
      return pid === undefined ? null : { pid };
    },
    text: (s, w, p) => `Une vague de conversions spontanées touche ${w.provinces[p.pid as number].name}.`,
    options: [
      { label: 'Encourager le mouvement', hint: 'La province adopte la religion d’État, ferveur +20', apply: (s, w, n, p) => {
        s.provinces[p.pid as number].religion = n.religion;
        n.fervor += 20;
      } },
      { label: 'Rester neutre', hint: 'Stabilité +2', apply: (s, w, n) => stab(n, 2) },
    ],
  },
  {
    kind: 'fair',
    title: 'Grande foire commerciale',
    text: () => 'Les chambres de commerce proposent d’accueillir une exposition universelle.',
    options: [
      { label: 'Accueillir l’exposition', hint: 'Trésor −2 mois de revenus, influence +40', apply: (s, w, n) => { n.treasury -= monthlyIncome(n) * 2; n.influence += 40; } },
      { label: 'Refuser', hint: 'Aucun effet', apply: () => {} },
    ],
  },
  {
    kind: 'corruption',
    title: 'Scandale de corruption',
    text: () => 'La presse révèle un vaste système de pots-de-vin dans les ports et les douanes.',
    options: [
      { label: 'Enquête indépendante', hint: 'Influence −30, stabilité +4', apply: (s, w, n) => { n.influence = Math.max(0, n.influence - 30); stab(n, 4); } },
      { label: 'Étouffer l’affaire', hint: 'Stabilité −10', apply: (s, w, n) => stab(n, -10) },
    ],
  },
  {
    kind: 'blasphemy',
    title: 'Caricatures blasphématoires',
    params: (s) => {
      const me = s.nations[s.player];
      const o = pick(s, alive(s).filter((x) => x.id !== me.id && religiousDistance(x.religion, me.religion) >= 0.6 && rel(s, me.id, x.id) > -50));
      return o ? { other: o.id } : null;
    },
    text: (s, w, p) => `Des caricatures publiées chez nous provoquent la colère en ${nm(s, p.other as string)} et dans tout le monde de confession ${RELIGIONS[s.nations[p.other as string].religion].adj}.`,
    options: [
      { label: 'Défendre la liberté d’expression', hint: 'Stabilité +3, relations −15 avec les nations de cette religion', apply: (s, w, n, p) => {
        stab(n, 3);
        const r = s.nations[p.other as string].religion;
        for (const o of alive(s)) if (o.religion === r) addRel(s, n.id, o.id, -15);
      } },
      { label: 'Présenter des excuses', hint: 'Stabilité −4, relations +5', apply: (s, w, n, p) => {
        stab(n, -4);
        const r = s.nations[p.other as string].religion;
        for (const o of alive(s)) if (o.religion === r) addRel(s, n.id, o.id, 5);
      } },
    ],
  },
];

export function maybeRandomEvent(s: GameState, w: World) {
  if (s.events.some((e) => RANDOM_EVENTS.some((r) => r.kind === e.kind))) return;
  if (rand(s) > 0.07) return;
  const def = pick(s, RANDOM_EVENTS)!;
  const params = def.params ? def.params(s, w) : {};
  if (params === null) return;
  pushEvent(s, { kind: def.kind, title: def.title, text: def.text(s, w, params), options: def.options.map((o) => ({ label: o.label, hint: o.hint })), params });
}

export function pushEvent(s: GameState, e: Omit<PendingEvent, 'uid'>) {
  s.events.push({ ...e, uid: s.nextUid++ });
}

export function termsToParams(t: PeaceTerms) {
  return { annex: t.annex.join(';'), satellite: t.satellite ? 1 : 0, reparations: t.reparations ? 1 : 0 };
}

export function paramsToTerms(p: Params): PeaceTerms {
  return {
    annex: String(p.annex ?? '').split(';').filter(Boolean).map(Number),
    satellite: p.satellite === 1,
    reparations: p.reparations === 1,
  };
}

/** Applique le choix du joueur ; renvoie un message de confirmation. */
export function resolveEvent(s: GameState, w: World, uid: number, option: number): string {
  const e = s.events.find((x) => x.uid === uid);
  if (!e) return '';
  s.events = s.events.filter((x) => x !== e);
  const me = s.nations[s.player];
  const p = e.params;
  switch (e.kind) {
    case 'callToArms': {
      const war = s.wars.find((x) => x.id === p.war);
      if (!war) return 'La guerre est déjà terminée.';
      if (option === 0) {
        joinWar(s, war, s.player, war.defenders.includes(p.ally as string) ? 'def' : 'att');
        return 'Nous entrons en guerre.';
      }
      leaveBloc(s, s.player);
      stab(me, -10);
      return 'Nous avons trahi notre alliance.';
    }
    case 'peaceOffer': {
      const war = s.wars.find((x) => x.id === p.war);
      if (!war) return 'La guerre est déjà terminée.';
      if (option === 0) {
        applyPeace(s, w, war, p.winner as string, paramsToTerms(p));
        return 'Traité de paix signé.';
      }
      stab(me, -2);
      return 'Nous poursuivons le combat.';
    }
    case 'whitePeace': {
      const war = s.wars.find((x) => x.id === p.war);
      if (!war) return 'La guerre est déjà terminée.';
      if (option === 0) {
        applyPeace(s, w, war, p.from as string, { annex: [], satellite: false, reparations: false });
        return 'Paix blanche conclue.';
      }
      return 'Offre rejetée.';
    }
    case 'joinRequest': {
      const from = p.from as string;
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
      def?.options[option]?.apply(s, w, me, p);
      log(s, `${e.title} : ${e.options[option]?.label}.`, 'event', [s.player]);
      return e.options[option]?.label ?? '';
    }
  }
}
