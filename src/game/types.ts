import type { Religion } from '../data/religions';
import type { Good } from '../data/trade';
import type { MissionDef } from '../data/campaign';

export type Id = string; // identifiant de nation (nom world-atlas)
export type Pid = number; // identifiant de province

export type Policy = 'tolerance' | 'neutre' | 'proselytisme';

/** Données fixes d'une province (générées par scripts/build-provinces.mjs). */
export interface ProvinceInfo {
  id: Pid;
  name: string;
  country: string; // pays d'origine
  owner: Id; // propriétaire au 1er janvier 2026
  pop: number; // millions
  dev: number; // développement (richesse produite)
  religion: Religion; // religion initiale
  good: Good;
  node: string; // nœud commercial
  coastal: boolean;
  capital?: boolean;
  holy?: { name: string; religions: Religion[] }[];
  strait?: string;
  lon: number;
  lat: number;
  adj: Pid[]; // voisins terrestres
  sea: Pid[]; // liaisons maritimes (< 500 km)
}

/** État variable d'une province (sauvegardé). */
export interface Province {
  owner: Id;
  core: Id; // nation qui la revendique historiquement
  religion: Religion;
  occupiedBy: Id | null;
  integration: number; // 0-100
  unrest: number; // agitation 0-100
  revolt: number; // mois d'insurrection (0 = calme)
  supportedBy: Id | null; // puissance étrangère qui soutient les insurgés
  supportMonths: number;
  good?: Good; // production modifiée (événement, reconversion, prospection)
  level?: number; // niveau d'équipement 0-3 (+35 % de production par niveau)
  works?: { kind: 'upgrade' | 'convert' | 'prospect'; months: number; good?: Good };
}

export interface Merchant {
  node: string;
  mode: 'collect' | 'steer';
  /** Pour « orienter » : nœud aval visé. */
  target?: string;
}

export interface Nation {
  id: Id;
  name: string;
  color: string;
  alive: boolean;
  religion: Religion;
  policy: Policy;
  policyCooldown: number;
  treasury: number; // Md$
  influence: number;
  fervor: number;
  stability: number;
  baseStability: number;
  army: number; // corps d'armée (toujours entier)
  navy: number; // flottes (toujours entier)
  attrition?: { army: number; navy: number }; // pertes fractionnaires en attente : une unité n'est perdue qu'entière
  upkeepRate: number; // coût mensuel d'un corps d'armée (main-d'œuvre locale)
  milShare: number; // part du revenu que l'IA consacre à ses forces
  aggression: number;
  tier: number; // niveau de vie (1 à 5)
  exhaustion: number;
  nuclear: boolean;
  nukeProgram: number | null;
  hawk: number; // tempérament IA 0-1
  bloc: Id | null;
  claims: Id[]; // casus belli détenus
  holyClaims: Id[]; // casus belli de guerre sainte
  cbProgress: { target: Id; months: number } | null;
  merchants: Merchant[];
  missionary: Pid | null;
  missionProgress: number;
  closedStraits: string[];
  /** Dernier bilan mensuel (affichage). */
  income: { production: number; trade: number; tolls: number; contracts: number; upkeep: number; byNode: Record<string, number>; sanctions?: number; war?: number; admin?: number; distrust?: number; interest?: number };
  /** Confiance des partenaires commerciaux (voir trust.ts). */
  trust?: { loss: number; stability: number; relations: number; aggression: number; avgRel: number };
  /** Pression des sanctions subies (0 → 0,8) et nations qui les imposent. */
  sanctions?: { p: number; by: Id[] };
}

export interface Bloc {
  id: Id;
  name: string;
  color: string;
  leader: Id;
  members: Id[];
}

export interface War {
  id: string;
  name: string;
  attackers: Id[]; // [0] = meneur
  defenders: Id[]; // [0] = meneur
  score: number; // -100..100, point de vue des attaquants
  battle: number; // part du score due aux batailles
  months: number;
  justified: boolean;
  holy: boolean;
}

export type LogKind = 'war' | 'diplo' | 'trade' | 'religion' | 'info' | 'event';

export interface LogEntry {
  date: string;
  text: string;
  kind: LogKind;
  mine: boolean;
}

export interface EventOption {
  label: string;
  hint: string;
}

export interface PendingEvent {
  uid: number;
  kind: string;
  title: string;
  text: string;
  options: EventOption[];
  params: Record<string, string | number>;
}

export interface PeaceTerms {
  annex: Pid[];
  satellite: boolean;
  reparations: boolean;
}

/** Itinéraire maritime/terrestre entre deux nœuds commerciaux. */
export interface Route {
  nodes: string[];
  straits: string[];
  piracy: string[]; // zones à risque traversées
}

export interface ContractOffer {
  id: number;
  buyer: Id;
  good: Good;
  volume: number; // unités livrées par mois
  bonus: number; // prime sur le prix (0.25 = +25 %)
  unitPrice: number; // prix unitaire du marché à la signature (Md$)
  months: number; // durée du contrat
  expires: number; // mois restants pour répondre
  routes: Route[];
  negotiated: boolean;
}

export interface Contract {
  id: number;
  buyer: Id;
  good: Good;
  volume: number; // unités livrées par mois
  bonus: number;
  unitPrice: number; // prix verrouillé à la signature
  monthsLeft: number;
  route: Route;
  alternatives: Route[];
  escort: number; // flottes d'escorte
  blocked: number; // mois consécutifs sans livraison
  lastRevenue: number;
  lastStatus: 'ok' | 'blocked' | 'piracy';
  piracyAlert?: number; // mois avant une nouvelle alerte piraterie
}

/** Convoi de marchandises en mer ou sur rail, visible sur la carte. */
export interface Convoy {
  id: number;
  from: Id;
  to: Id;
  good: Good;
  qty: number;
  value: number; // Md$
  nodes: string[];
  straits: string[];
  depart: number; // temps absolu (mois)
  duration: number; // mois
  escort: number;
  contract?: number; // contrat de vente du joueur
  purchase?: number; // contrat d'achat du joueur
}

/** Contrat d'achat : un fournisseur livre chaque mois une quantité à prix verrouillé. */
export interface Purchase {
  id: number;
  seller: Id;
  good: Good;
  volume: number; // unités par mois
  unitPrice: number; // prix payé par unité (verrouillé)
  monthsLeft: number;
  months: number;
  route: Route;
  alternatives: Route[];
  escort: number;
  blocked: number;
  lastStatus: 'ok' | 'blocked' | 'piracy';
  lastCost: number;
}

export interface NeedLine {
  need: number; // unités consommées par mois
  own: number; // couvertes par la production nationale
  stock: number; // puisées dans les stocks
  market: number; // achetées en urgence au marché
  cost: number; // coût des achats d'urgence (Md$)
}

export interface NeedsReport {
  lines: Partial<Record<Good, NeedLine>>;
  cost: number; // achats d'urgence + stockage
  purchases: number; // paiements des contrats d'achat
  sales: number; // reventes au comptant du mois
  expensive: boolean; // vie chère : pénurie couverte à prix fort
  stored?: Partial<Record<Good, number>>; // surplus de production mis en stock ce mois
}

/** Organisation internationale (OPEP…). */
export interface Org {
  id: string;
  name: string;
  icon: string;
  members: Id[];
  quota: number; // multiplicateur de production de pétrole des membres (1 = normal)
  nextMeeting: number; // temps absolu (mois) de la prochaine réunion
  last: string; // dernière décision
  intents?: Record<Id, -1 | 0 | 1>; // intentions de vote des membres pour la réunion en cours
}

export interface MissionState extends MissionDef {
  done: boolean;
  doneAt?: string;
}

export interface GameState {
  version: number;
  endYear: number;
  rival: Id | null;
  rivalHostility: number; // 0-100 : intensité des actions du rival
  offers: ContractOffer[];
  contracts: Contract[];
  convoys: Convoy[];
  purchases: Purchase[]; // contrats d'achat du joueur
  stock: Partial<Record<Good, number>>; // stocks du joueur (unités)
  needs: NeedsReport | null; // bilan du dernier mois : besoins de la population
  missions: MissionState[];
  score: number; // points de missions et d'événements
  passes: Record<string, number>; // droits de passage achetés : détroit → mois restants
  notForSale: Good[]; // marchandises retirées de la vente (pas d'offres)
  orgs: Record<string, Org>; // organisations internationales
  prosperity: { points: number; satisfaction: number; months: number }; // progression vers le palier suivant (0-100)
  storePolicy: Partial<Record<Good, number>>; // part du surplus de production mise en stock (0, 0,5 ou 1)
  prevPrices: Record<string, number>; // cours du mois précédent (tendance)
  priceHistory: Record<string, number[]>; // cours mensuels (multiplicateur), le plus récent en dernier
  stats: { converted: number; contractsDone: number; warsWon: number; startIncome: number; startDev: number };
  campaignOver: boolean;
  legacyEmbargoes?: string[]; // embargos en place au début de la campagne (pèsent moins)
  ultimatums?: Record<Id, number>; // dernier ultimatum posé au joueur par chaque nation (mois absolu)
  debtCrisisAt?: number; // dernière crise de la dette (mois absolu)
  austerityUntil?: number; // plan d'austérité du FMI en cours jusqu'à
  defaultUntil?: number; // défaut de paiement : marchés fermés jusqu'à
  rng: number;
  year: number;
  month: number;
  player: Id;
  nations: Record<Id, Nation>;
  provinces: Province[];
  relations: Record<string, number>;
  blocs: Record<Id, Bloc>;
  wars: War[];
  trades: string[]; // accords commerciaux « a|b »
  embargoes: string[]; // « a>b »
  prices: Record<string, number>; // multiplicateur de prix par marchandise (1 = normal)
  tension: number;
  log: LogEntry[];
  events: PendingEvent[];
  nextUid: number;
  gameOver: string | null;
}

export interface World {
  provinces: ProvinceInfo[];
}
