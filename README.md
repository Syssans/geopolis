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
| **Investir** 🏗️ | Par province : **moderniser** (+35 % de production par niveau, 3 niveaux, 12 mois), **reconvertir** (industrie, textile, puces, finance selon le développement, 18 mois), **prospecter** (1 chance sur 3 de trouver pétrole, gaz, métaux ou terres rares). La carte « 🏭 Production » est en tête de la fiche de chaque province, avec la valeur estimée de chaque reconversion. Le bouton pays du HUD ouvre la liste des provinces (rendement, marchandise, niveau, chantiers), triable. |
| **Routes maritimes** ⚓ | Les liaisons suivent les tracés réels des voies maritimes, calculés sur le réseau Marnet (Manche, Gibraltar, Suez, Bab-el-Mandeb, Malacca, cap de Bonne-Espérance…). |
| **Convois** 🚢 | Chaque convoi est une entité de la simulation : expéditeur, destinataire, marchandise, quantité, valeur, itinéraire, escorte. Les exportateurs expédient selon leur production vers les pays qui en manquent ; vos contrats produisent vos propres convois. Ils avancent à la vitesse du jeu, et un appui sur un point ouvre sa fiche. |
| **Interception** 🏴‍☠️ | Avec une flotte présente dans la zone (côtes sur le nœud, ou 25 flottes), vous pouvez arraisonner un convoi pour environ 70 % de sa valeur. En guerre, c'est un blocus légitime. En paix, c'est de la piraterie d'État : l'expéditeur perd 40 de relations, décrète un embargo et obtient un casus belli (et peut déclarer la guerre) ; le destinataire perd 20, ses alliés 15 et le reste du monde 4 ; agressivité et tension montent. En cas d'échec, vous perdez une flotte. En guerre, l'ennemi peut aussi saisir vos convois. Intercepter le convoi d'un membre de votre bloc est une trahison : le bloc vous exclut (relations −25 avec chaque membre). |
| **Cours mondiaux** 📈 | Onglet Cours de l'écran Économie : courbe mensuelle de chaque marchandise (à toucher pour lire un mois), variation sur 1 et 12 mois, prix de référence et prix de vos contrats, mini-courbes de toutes les marchandises. |
| **Niveau de vie** 🏙️ | Cinq paliers à la Anno (subsistance → industrialisation → classe moyenne → consommation de masse → économie du savoir), de départ selon le PIB par habitant. Chaque palier ajoute des besoins (textile, pétrole, gaz, métaux, café, poisson, puces, services, terres rares), rend l'économie plus productive (×0,8 → ×1,2) et alourdit le coût de l'État (administration, santé, éducation). Plus de 80 % de besoins satisfaits : la population progresse ; en dessous : elle régresse et la stabilité baisse. |
| **Coûts** 💸 | Chaque marchandise a une marge (50 % pour le pétrole, 80 % pour la finance) : la valeur produite et les contrats sont nets des coûts d'extraction et de fabrication. Les contrats sont au cours du jour, avec une prime de −8 % à +20 %. |
| **Besoins** 🍞 | La population consomme chaque mois céréales, pétrole, gaz et biens industriels selon le développement. La production nationale couvre d'abord ; sinon les stocks ; sinon achat d'urgence au cours +25 % (et « vie chère » si les cours flambent : la stabilité baisse). |
| **Achats** 📥 | Proposez un contrat d'achat à n'importe quel pays producteur (fiche du pays, onglet Cours ou besoin non couvert) : quantité par mois (jusqu'à la moitié de sa production), durée, itinéraire. Prix verrouillé = cours + marge (2 à 40 % selon les relations ; le rival exige plus). Paiement à l'expédition, convois visibles, escortes, blocus et pirates comme pour les ventes. |
| **Navigation** 🧭 | Les étapes d'un itinéraire (nœuds et détroits) se touchent pour centrer la carte dessus ; l'emoji d'une marchandise ouvre son cours mondial. Besoins et stocks sont réunis : une barre par ressource (production, stocks, urgence) avec le trait du besoin mensuel. |
| **Sanctions** 🚫 | Un embargo prive sa cible d'une part du commerce mondial selon le poids économique de celui qui l'impose, et ses alliés de bloc suivent en partie : commerce, ventes et contrats amputés, achats plus chers, stabilité qui s'érode (plafond 60 %). Cuba et le Venezuela démarrent sous embargo américain. La levée se négocie (🤝25, chances selon les relations et l'agressivité). |
| **Guerre** ⚔️ | Le blocus de la flotte ennemie coupe jusqu'à la moitié du commerce, la lassitude ronge la production ; les agresseurs sont vite sanctionnés. |
| **OPEP** 🛢️ | Tous les six mois, les membres votent leurs quotas de pétrole (pondérés par leur production) : réduire fait monter le cours mondial. Le joueur producteur peut adhérer (🤝30) et voter. |
| **Stockage** 🏬 | Pour chaque marchandise, le surplus (ni vendu sous contrat, ni consommé) part au marché, à moitié ou entièrement en stock ; 1 % de la valeur par mois, 2 % au-delà de 6 mois de réserve. |
| **Drapeaux** 🏳️ | Dans les listes compactes (offres, contrats, fournisseurs, convois, guerres, blocs), les pays sont représentés par leur drapeau emoji ; toucher un drapeau affiche le nom et la relation. |
| **Stocks et revente** 🏬 | Les marchandises reçues vont en stock : elles servent vos contrats de vente (on peut revendre ce qu'on ne produit pas), nourrissent la population, ou se revendent au comptant (cours −3 %). Achat au comptant au cours +5 %, stockage 0,5 %/mois. |
| **Contrats** 📦 | Des acheteurs proposent d'acheter, à prix verrouillé avec une prime (−8 à +20 %), une quantité à la mesure de leur propre consommation : une vente pèse autant qu'un achat. Sans prime, un contrat rapporte exactement ce que la même production aurait rapporté au marché (seule la marge de production reste à l'État) ; une jauge montre la capacité restante et empêche de vendre ce que vous ne produisez pas. On peut retirer une marchandise de la vente. Vous signez, négociez ou déclinez, puis choisissez l'itinéraire des convois (jusqu'à 3 : détroits à péage, zones de piraterie), assignez des escortes, réacheminez en cas de blocus. 4 mois sans livraison = rupture. |
| **Rival** 🗡️ | Désigné au départ (Iran pour l'Arabie saoudite, Chine pour Taïwan…), il arme vos minorités, vous impose des embargos, sabote vos contrats, ferme ses détroits sur vos routes, monte vos voisins contre vous et pose des ultimatums. |
| **Crises** | Blocus, pirates, ingérence étrangère, concurrence déloyale, ultimatums, krachs : chaque crise propose 2 à 3 réponses avec leurs coûts. |
| **Temps** | Tick mensuel, pause + 4 vitesses. Le jeu se met en pause sur les événements. |
| **Ressources** | 💰 Trésor (contrats + production + commerce + péages − entretien des forces), 🤝 Influence (diplomatie), 🔥 Ferveur (religion). |
| **Provinces** | ~900 provinces (régions françaises, États américains, provinces chinoises…), chacune avec développement, population, marchandise, religion et nœud commercial. |
| **Commerce** | 26 nœuds commerciaux (Golfe Persique, Malacca, Suez, Manche, Shanghai, New York…) reliés d'amont en aval. La production des provinces y entre ; les nations collectent leur part selon leur pouvoir commercial (provinces, côtes, flotte, marchands, accords). |
| **Marchands** | Automatiques : ils attirent la richesse des zones voisines vers votre zone d'attache (même logique que l'IA). L'onglet Commerce du pays montre vos revenus et votre part dans chaque zone. |
| **Cartes** 🗺️ | Politique : capitales (points discrets, noms en italique à fort zoom). Votre pays est cerné d'or, un pays sélectionné de blanc. Diplomatie : 🌍 et relations de chaque pays avec vous (les noms des pays n'apparaissent que sur la carte politique). Religions : catholicisme en blanc. Religions : lieux saints avec l'icône des religions concernées. Commerce : nœuds, voies maritimes, noms des détroits (⚓), et sur votre pays (ou le pays sélectionné) l'emoji de la marchandise de chaque province avec ses niveaux de modernisation (▲).|
| **Confiance des partenaires** 🤝 | Les exportations (part captée dans les nœuds) fondent si le pays est instable (stabilité < 50 : jusqu'à −35 %), mal vu des autres marchands du nœud (relations moyennes < +25 : jusqu'à −35 %) ou mène des guerres d'agression (−8 % par guerre, −20 % au plus). Plafond −60 %, détail dans la fiche 💰 Trésor. |
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

Pour regénérer la carte : `node scripts/build-provinces.mjs` (puis `node scripts/build-capitals.mjs` pour les capitales) (télécharge Natural Earth, domaine public ; `KEEP=0.05` règle la finesse des contours).

## Publier sur GitHub Pages

Le workflow `.github/workflows/pages.yml` teste, construit et publie le jeu à chaque push.
Il suffit d'activer **Settings → Pages → Source : GitHub Actions** dans le dépôt.

## Feuille de route

- [ ] Routes commerciales visibles avec le volume des flux, graphiques de prix
- [ ] Ligues religieuses et conciles, schismes, réformes religieuses
- [ ] Organisations (ONU, OPEP, UE) et votes
- [ ] Objectifs par nation et écran de victoire
- [ ] Packaging natif iOS / Android (Capacitor) et sons
