import type { Religion } from '../data/religions';
import type { Good } from '../data/trade';

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
  good?: Good; // production modifiée par un événement
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
  army: number; // divisions
  navy: number; // flottes
  upkeepRate: number; // coût mensuel d'une division (main-d'œuvre locale)
  milShare: number; // part du revenu que l'IA consacre à ses forces
  aggression: number;
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
  income: { production: number; trade: number; tolls: number; upkeep: number; byNode: Record<string, number> };
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

export interface GameState {
  version: number;
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
