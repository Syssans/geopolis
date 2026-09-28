# Geopolis

Jeu mobile de **grande stratégie géopolitique contemporaine**, inspiré d'*Europa Universalis*, qui commence le 1er janvier 2026.
Il est centré sur le **commerce** et les **conflits religieux**, sur une carte de **~900 provinces réelles**.

**Jouer en ligne :** https://syssans.github.io/geopolis/ (une fois GitHub Pages activé, voir plus bas).

## Lancer le jeu en local

```bash
npm install
npm run dev        # serveur de dev (accessible depuis le téléphone sur le même Wi-Fi)
npm test           # tests de la simulation
npm run build      # build de production dans dist/ (PWA installable)
```

## Boucle de jeu

| Système | Principe |
|---|---|
| **Campagne** | 10 ans (2026 → 2036), bilan final noté de S à D : missions, rang commercial, croissance, territoire, lieux saints, détroits, stabilité, duel avec le rival. |
| **Missions** 🎯 | ~25 nations ont leurs missions écrites (Arabie saoudite : « Le Golfe est arabe », Taïwan : « Bouclier de silicium »…), toutes ont des missions génériques adaptées à leur taille. Récompenses en points, trésor, influence ou ferveur. |
| **Ressources** 📦 | Chaque marchandise se compte en unités physiques (Mbl de pétrole, Mt de céréales…) distinctes de son cours. L'écran Économie montre production, part sous contrat, disponible, cours et tendance, et les provinces productrices. |
| **Investir** 🏗️ | Par province : **moderniser** (+35 % de production par niveau, 3 niveaux, 12 mois), **reconvertir** (industrie, textile, puces, finance selon le développement, 18 mois), **prospecter** (1 chance sur 3 de trouver pétrole, gaz, métaux ou terres rares). |
| **Routes maritimes** ⚓ | Les liaisons suivent les tracés réels des voies maritimes, calculés sur le réseau Marnet (Manche, Gibraltar, Suez, Bab-el-Mandeb, Malacca, cap de Bonne-Espérance…). |
| **Convois** 🚢 | Chaque convoi est une entité de la simulation : expéditeur, destinataire, marchandise, quantité, valeur, itinéraire, escorte. Les exportateurs expédient selon leur production vers les pays qui en manquent ; vos contrats produisent vos propres convois. Ils avancent à la vitesse du jeu, et un appui sur un point ouvre sa fiche. |
| **Interception** 🏴‍☠️ | Avec une flotte présente dans la zone (côtes sur le nœud, ou 25 flottes), vous pouvez arraisonner un convoi pour environ 70 % de sa valeur. En guerre, c'est un blocus légitime. En paix, c'est de la piraterie d'État : l'expéditeur perd 40 de relations, décrète un embargo et obtient un casus belli (et peut déclarer la guerre) ; le destinataire perd 20, ses alliés 15 et le reste du monde 4 ; agressivité et tension montent. En cas d'échec, vous perdez une flotte. En guerre, l'ennemi peut aussi saisir vos convois. |
| **Cours mondiaux** 📈 | Onglet Cours de l'écran Économie : courbe mensuelle de chaque marchandise (à toucher pour lire un mois), variation sur 1 et 12 mois, prix de référence et prix de vos contrats, mini-courbes de toutes les marchandises. |
| **Besoins** 🍞 | La population consomme chaque mois céréales, pétrole, gaz et biens industriels selon le développement. La production nationale couvre d'abord ; sinon les stocks ; sinon achat d'urgence au cours +25 % (et « vie chère » si les cours flambent : la stabilité baisse). |
| **Achats** 📥 | Proposez un contrat d'achat à n'importe quel pays producteur (fiche du pays, onglet Cours ou besoin non couvert) : quantité par mois (jusqu'à la moitié de sa production), durée, itinéraire. Prix verrouillé = cours + marge (2 à 40 % selon les relations ; le rival exige plus). Paiement à l'expédition, convois visibles, escortes, blocus et pirates comme pour les ventes. |
| **Drapeaux** 🏳️ | Dans les listes compactes (offres, contrats, fournisseurs, convois, guerres, blocs), les pays sont représentés par leur drapeau emoji ; toucher un drapeau affiche le nom et la relation. |
| **Stocks et revente** 🏬 | Les marchandises reçues vont en stock : elles servent vos contrats de vente (on peut revendre ce qu'on ne produit pas), nourrissent la population, ou se revendent au comptant (cours −3 %). Achat au comptant au cours +5 %, stockage 0,5 %/mois. |
| **Contrats** 📦 | Des acheteurs proposent d'acheter une quantité de votre production à prix verrouillé avec une prime ; une jauge montre la capacité restante et empêche de vendre ce que vous ne produisez pas. On peut retirer une marchandise de la vente. Vous signez, négociez ou déclinez, puis choisissez l'itinéraire des convois (jusqu'à 3 : détroits à péage, zones de piraterie), assignez des escortes, réacheminez en cas de blocus. 4 mois sans livraison = rupture. |
| **Rival** 🗡️ | Désigné au départ (Iran pour l'Arabie saoudite, Chine pour Taïwan…), il arme vos minorités, vous impose des embargos, sabote vos contrats, ferme ses détroits sur vos routes, monte vos voisins contre vous et pose des ultimatums. |
| **Crises** | Blocus, pirates, ingérence étrangère, concurrence déloyale, ultimatums, krachs : chaque crise propose 2 à 3 réponses avec leurs coûts. |
| **Temps** | Tick mensuel, pause + 4 vitesses. Le jeu se met en pause sur les événements. |
| **Ressources** | 💰 Trésor (contrats + production + commerce + péages − entretien des forces), 🤝 Influence (diplomatie), 🔥 Ferveur (religion). |
| **Provinces** | ~900 provinces (régions françaises, États américains, provinces chinoises…), chacune avec développement, population, marchandise, religion et nœud commercial. |
| **Commerce** | 26 nœuds commerciaux (Golfe Persique, Malacca, Suez, Manche, Shanghai, New York…) reliés d'amont en aval. La production des provinces y entre ; les nations collectent leur part selon leur pouvoir commercial (provinces, côtes, flotte, marchands, accords). |
| **Marchands** | 2 à 5 marchands à placer : **collecter** dans un nœud, ou **orienter** la richesse vers l'aval jusqu'à votre nœud domicile. |
| **Détroits** | Ormuz, Bab-el-Mandeb, Suez, Malacca, Panama, Bosphore, Gibraltar, détroits danois : péage de 5 % pour le propriétaire, qui peut les fermer (commerce aval effondré, prix mondiaux en hausse). |
| **Marchés** | 11 marchandises (pétrole, gaz, céréales, café-cacao, métaux, terres rares, semi-conducteurs…) dont les prix fluctuent. |
| **Religion** | 11 confessions (catholique, protestante, évangélique, orthodoxe, sunnite, chiite, juive, hindoue, bouddhiste, traditionnelle, sécularisée), réparties par province avec les minorités réelles (Nigeria, Liban, Irak, Inde, Xinjiang…). |
| **Politique religieuse** | Tolérance, neutralité ou prosélytisme : agitation des minorités, gain de ferveur, vitesse des missionnaires. |
| **Insurrections** | Les minorités agitées se soulèvent ; au bout de 18 mois, un territoire conquis retourne à son ancien maître, une province armée par un voisin coreligionnaire le rejoint, sinon le pouvoir concède l'autonomie. |
| **Lieux saints** | Jérusalem, La Mecque, Médine, Najaf, Qom, Rome, Constantinople, Varanasi, Bodh-Gaya, Lhassa… : ferveur pour le détenteur de même foi, colère des fidèles sinon, et **guerre sainte** possible. |
| **Diplomatie** | Relations (religion, blocs, commerce, lieux saints + historique), accords commerciaux, embargos, alliances et blocs (OTAN, OTSC…), garanties informelles des grandes puissances. |
| **Guerre** | Sièges province par province, score de guerre selon le développement occupé, traités à la carte (annexion de provinces précises, satellisation, réparations). Dissuasion et tension nucléaires. |
| **IA** | Chaque nation place ses marchands, gère armée et flotte, envoie des missionnaires, arme des insurgés coreligionnaires, ferme ses détroits en guerre, proclame des guerres saintes et attaque les voisins faibles. |

## Architecture

```
scripts/build-provinces.mjs   génère src/data/provinces.json depuis Natural Earth (admin-1 + villes)
scripts/build-lanes.mjs       génère src/data/lanes.json : tracés maritimes réels (réseau Marnet, via searoute-js)
src/data/                     pays, blocs, religions, marchandises, nœuds, détroits, campagnes
src/game/                     moteur pur TypeScript, sans DOM, sérialisable
  trade.ts                      production, nœuds, collecte/orientation, péages, prix
  contracts.ts                  offres, contrats, itinéraires, piraterie, blocus
  convoys.ts                    convois en mer, interception et conséquences
  purchases.ts                  contrats d'achat, stocks, besoins de la population
  economy.ts                    modernisation, reconversion, prospection, chantiers
src/data/routes.ts            ports et tracés réels des voies commerciales
  missions.ts, crises.ts        campagne, missions, score, rival et crises
  religion.ts                   agitation, insurrections, missionnaires, ferveur
  war.ts                        guerres, sièges, traités
  ai.ts, events.ts, tick.ts     IA, événements, boucle mensuelle
src/ui/                       carte SVG (d3-geo + d3-zoom), HUD, fiches, modales
tests/                        commerce, religion, guerre, simulation de 30 ans
```

Pour regénérer la carte : `node scripts/build-provinces.mjs` (télécharge Natural Earth, domaine public ; `KEEP=0.05` règle la finesse des contours).

## Publier sur GitHub Pages

Le workflow `.github/workflows/pages.yml` teste, construit et publie le jeu à chaque push.
Il suffit d'activer **Settings → Pages → Source : GitHub Actions** dans le dépôt.

## Feuille de route

- [ ] Routes commerciales visibles avec le volume des flux, graphiques de prix
- [ ] Ligues religieuses et conciles, schismes, réformes religieuses
- [ ] Organisations (ONU, OPEP, UE) et votes
- [ ] Objectifs par nation et écran de victoire
- [ ] Packaging natif iOS / Android (Capacitor) et sons
