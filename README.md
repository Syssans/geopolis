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
| **Temps** | Tick mensuel, pause + 4 vitesses. Le jeu se met en pause sur les événements. |
| **Ressources** | 💰 Trésor (production + commerce + péages − entretien des forces), 🤝 Influence (diplomatie), 🔥 Ferveur (religion). |
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
src/data/                     pays, blocs, religions, marchandises, nœuds commerciaux, détroits
src/game/                     moteur pur TypeScript, sans DOM, sérialisable
  trade.ts                      production, nœuds, collecte/orientation, péages, prix
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
