/**
 * Version du jeu : 0.<mois>.<jour> de la mise à jour (0.10.2 = 2 octobre).
 * Seules les mises à jour importantes sont notées ici (usage interne, non affiché dans le jeu).
 */
export const VERSION = '0.10.6';

export const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  { version: '0.10.6', date: '6 octobre 2026', items: ['Nouvelle ressource : l’uranium ☢️ (Niger, Kazakhstan, Namibie, Ouzbékistan, Canada, Australie), besoin du palier « Économie du savoir »', 'Avertissement en vendant une marchandise que l’on ne produit pas'] },
  { version: '0.10.5', date: '5 octobre 2026', items: ['Le développement des provinces suit le niveau de vie (croissance ou recul)', 'Fiche pays : niveau de vie au lieu du développement total'] },
  { version: '0.10.3', date: '3 octobre 2026', items: ['Bandeau « jouer en plein écran » sur navigateur mobile (ajout à l’écran d’accueil)', 'Tutoriel : sommaire en page 2, développement des provinces expliqué'] },
  {
    version: '0.10.2',
    date: '2 octobre 2026',
    items: [
      'Lieux saints en icônes dorées ; Jérusalem partagée entre Israël et la Palestine',
      'Capitales : Tel Aviv (Israël), Jérusalem (Palestine)',
      'Menu déroulant des cartes ; convois sur la seule carte du commerce',
      'Réunion de l’OPEP en table ronde avec prévision des votes et des conséquences',
      'Corps d’armée et flottes en nombres entiers',
      'Refonte de l’économie : marchandises physiques, marché avec commission et invendus, nœuds à commission, satisfaction plus exigeante',
    ],
  },
  { version: '0.10.1', date: '1er octobre 2026', items: ['Tutoriel complet', 'Thème irlandais, Royaume-Uni redécoupé'] },
];
