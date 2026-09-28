export type Id = string;

export interface Points {
  pol: number; // Capital politique (≈ ADM)
  dip: number; // Influence diplomatique (≈ DIP)
  mil: number; // Doctrine militaire (≈ MIL)
}

export interface Modifier {
  id: string;
  label: string;
  months: number;
  growth?: number; // points de croissance annuelle
  stabilityPerMonth?: number;
}

export interface Territory {
  id: Id;
  name: string;
  owner: Id;
  /** Nation qui considère ce territoire comme sien (revendication historique). */
  core: Id;
  gdp: number; // milliards $
  pop: number; // millions
  occupiedBy: Id | null;
  /** 0-100 : 100 = pleinement intégré à son propriétaire actuel. */
  integration: number;
}

export interface Nation {
  id: Id;
  name: string;
  color: string;
  alive: boolean;
  treasury: number; // milliards $
  stability: number; // 0-100
  baseStability: number;
  milPct: number; // budget militaire en % du PIB
  baseMilPct: number;
  strength: number; // puissance militaire brute
  tech: number; // niveau technologique militaire 0-15
  points: Points;
  growthBonus: number; // bonus permanent de croissance (réformes)
  modifiers: Modifier[];
  aggression: number; // « expansion agressive » perçue
  exhaustion: number; // lassitude de guerre 0-100
  nuclear: boolean;
  nukeProgram: number | null; // mois restants
  hawk: number; // tempérament IA 0-1
  bloc: Id | null;
  claims: Id[]; // casus belli détenus
  cbProgress: { target: Id; months: number } | null;
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
  months: number;
  justified: boolean;
}

export type LogKind = 'war' | 'diplo' | 'eco' | 'info' | 'event';

export interface LogEntry {
  date: string;
  text: string;
  kind: LogKind;
  mine: boolean; // concerne directement le joueur
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
  /** Paramètres sérialisables (ids de nations, de guerre…). */
  params: Record<string, string | number>;
}

export interface PeaceTerms {
  annex: Id[]; // territoires cédés
  satellite: boolean; // le perdant rejoint le bloc du vainqueur
  reparations: boolean;
}

export interface GameState {
  version: number;
  rng: number;
  year: number;
  month: number; // 1..12
  player: Id;
  nations: Record<Id, Nation>;
  territories: Record<Id, Territory>;
  relations: Record<string, number>;
  blocs: Record<Id, Bloc>;
  wars: War[];
  trades: string[]; // paires « a|b »
  sanctions: string[]; // « sanctionneur>cible »
  tension: number; // tension mondiale 0-100
  log: LogEntry[];
  events: PendingEvent[];
  nextUid: number;
  gameOver: string | null;
}

/** Données géographiques statiques (hors sauvegarde). */
export interface World {
  /** Territoires ayant une frontière terrestre commune. */
  adjacent: Record<Id, Id[]>;
  /** Territoires « à portée » (voisins ou à moins de ~1500 km). */
  near: Record<Id, Id[]>;
}
