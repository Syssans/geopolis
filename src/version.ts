/**
 * Version du jeu : 0.<mois>.<jour> de la mise à jour (0.10.2 = 2 octobre).
 * Chaque mise à jour ajoute son entrée en tête du journal des nouveautés.
 */
export const VERSION = '0.10.2';

export const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: '0.10.2',
    date: '2 octobre 2026',
    items: [
      'Lieux saints : icônes dorées et lumineuses par religion',
      'Choix de la carte dans un menu déroulant animé',
      'Convois visibles uniquement sur la carte du commerce',
      'Carte plus fluide (moins de calculs pendant le zoom)',
      'Frontière fantôme corrigée au Brésil (enclave de Brasília)',
      'Plus de sélection de texte au toucher prolongé',
      'Tutoriel : tous les pays n’ont pas de rival',
      'Numéro de version et journal des nouveautés',
    ],
  },
  {
    version: '0.10.1',
    date: '1er octobre 2026',
    items: [
      'Tutoriel complet en 17 chapitres, animé, avec sommaire',
      'Thème irlandais, Royaume-Uni redécoupé (Écosse, pays de Galles, Irlande du Nord)',
      'Fermeture des fenêtres en touchant à côté, notifications opaques',
      'Marchandises achetées visibles dans Production, achats et stocks',
    ],
  },
];
