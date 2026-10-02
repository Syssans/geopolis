/**
 * Version du jeu : 0.<mois>.<jour> de la mise à jour (0.10.2 = 2 octobre).
 * Seules les mises à jour importantes sont notées ici (usage interne, non affiché dans le jeu).
 */
export const VERSION = '0.10.2';

export const CHANGELOG: { version: string; date: string; items: string[] }[] = [
  {
    version: '0.10.2',
    date: '2 octobre 2026',
    items: [
      'Lieux saints en icônes dorées ; Jérusalem partagée entre Israël et la Palestine',
      'Capitales : Tel Aviv (Israël), Jérusalem (Palestine)',
      'Menu déroulant des cartes ; convois sur la seule carte du commerce',
    ],
  },
  { version: '0.10.1', date: '1er octobre 2026', items: ['Tutoriel complet', 'Thème irlandais, Royaume-Uni redécoupé'] },
];
