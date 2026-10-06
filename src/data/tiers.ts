/**
 * Niveaux de vie, à la manière d'Anno : chaque palier ajoute de nouveaux besoins à la population,
 * rend l'économie plus productive, mais alourdit le coût de fonctionnement de l'État.
 */
import type { Good } from './trade';

export interface Tier {
  name: string;
  icon: string;
  desc: string;
  /** Besoins apportés par ce palier (unités par mois et par point de développement), cumulés avec les précédents. */
  adds: Partial<Record<Good, number>>;
  /** Multiplicateur de la valeur produite (qualification, infrastructures). */
  productivity: number;
  /** Coût mensuel de l'État par point de développement (administration, santé, éducation, retraites). */
  admin: number;
}

export const TIERS: Tier[] = [
  { name: 'Subsistance', icon: '🛖', desc: 'Se nourrir et se vêtir.', adds: { cereales: 0.0025, textile: 0.001 }, productivity: 0.8, admin: 0.003 },
  { name: 'Industrialisation', icon: '🏭', desc: 'Usines, routes, premiers véhicules.', adds: { petrole: 0.002, industrie: 0.0012 }, productivity: 0.9, admin: 0.005 },
  { name: 'Classe moyenne', icon: '🏘️', desc: 'Chauffage, logement, alimentation variée.', adds: { gaz: 0.001, metaux: 0.0008, tropicaux: 0.0006, peche: 0.0006 }, productivity: 1, admin: 0.008 },
  { name: 'Consommation de masse', icon: '🛍️', desc: 'Électronique, voitures, équipements.', adds: { puces: 0.0008, industrie: 0.0008, petrole: 0.0004 }, productivity: 1.1, admin: 0.012 },
  { name: 'Économie du savoir', icon: '🎓', desc: 'Services, technologies de pointe, électricité nucléaire, épargne.', adds: { finance: 0.0008, terres_rares: 0.0004, puces: 0.0004, uranium: 0.0004 }, productivity: 1.2, admin: 0.016 },
];

/** Besoins cumulés d'un palier (1 à 5), qui grossissent aussi avec le niveau de vie. */
export function tierNeeds(tier: number): Partial<Record<Good, number>> {
  const res: Partial<Record<Good, number>> = {};
  const scale = 1 + 0.1 * (tier - 1);
  for (let t = 0; t < tier; t++) for (const [g, k] of Object.entries(TIERS[t].adds) as [Good, number][]) res[g] = (res[g] ?? 0) + k * scale;
  return res;
}

/** Palier de départ selon le PIB par habitant (en milliers de $). */
export function tierFromGdp(gdpPerCapita: number): number {
  return gdpPerCapita < 4 ? 1 : gdpPerCapita < 12 ? 2 : gdpPerCapita < 28 ? 3 : gdpPerCapita < 55 ? 4 : 5;
}

/** Part de la valeur d'une marchandise qui reste une fois payés extraction, main-d'œuvre et transport. */
export const MARGIN: Record<Good, number> = {
  petrole: 0.5,
  gaz: 0.55,
  cereales: 0.7,
  tropicaux: 0.7,
  metaux: 0.6,
  terres_rares: 0.6,
  puces: 0.6,
  industrie: 0.65,
  textile: 0.7,
  finance: 0.8,
  peche: 0.7,
  uranium: 0.55,
};
