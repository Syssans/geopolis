# Geopolis

Jeu mobile de **grande stratégie géopolitique contemporaine**, inspiré d'*Europa Universalis*, qui commence le 1er janvier 2026.
Vous dirigez l'une des ~175 nations du monde réel : économie, diplomatie, blocs d'alliance, sanctions, guerres, annexions… et dissuasion nucléaire.

## Lancer le jeu

```bash
npm install
npm run dev        # serveur de dev (accessible depuis le téléphone sur le réseau local)
npm test           # tests de la simulation (30 ans simulés sur plusieurs graines)
npm run build      # build de production dans dist/ (PWA installable)
```

Sur mobile, ouvrez l'URL puis « Ajouter à l'écran d'accueil » pour jouer en plein écran.

## Boucle de jeu

| Système | Principe |
|---|---|
| **Temps** | Tick mensuel, pause + 4 vitesses. Le jeu se met en pause sur les événements. |
| **Ressources** | 🏛️ Capital politique, 🕊️ Influence, 🎖️ Doctrine (+3/mois, bonus selon stabilité / rang PIB / rang militaire) — l'équivalent des *monarch points*. 💰 Trésor : 5 % du PIB/an de recettes discrétionnaires moins le budget de défense. |
| **Économie** | Croissance = rattrapage (selon PIB/hab.) + stabilité + accords commerciaux + réformes + plans d'investissement − sanctions − guerre − occupation. |
| **Armée** | La puissance converge vers le niveau financé (budget % PIB × coût local de la main-d'œuvre), modulée par la technologie, la stabilité et la lassitude. |
| **Diplomatie** | Relations (−100…+100, érosion lente), accords commerciaux, sanctions, aide, déstabilisation, alliances. |
| **Blocs** | Pactes défensifs (OTAN, OTSC au départ, ou vos propres pactes). Attaquer un membre déclenche l'appel aux armes de tout le bloc. |
| **Guerre** | Casus belli (6 mois) ou déclaration sans justification (stabilité −15, agressivité +25). Score de guerre −100…+100 → occupation progressive → traité : annexion, satellisation, réparations. |
| **Agressivité** | Les annexions inquiètent le monde : relations dégradées, sanctions au-delà de 50. |
| **Nucléaire** | Une puissance nucléaire ne peut être forcée à capituler (score plafonné à 50). Un affrontement direct entre puissances nucléaires fait grimper la tension mondiale ; à 95 %+, risque d'escalade = fin de partie pour tous. Programme nucléaire possible (36 mois). |
| **Intégration** | Les territoires annexés freinent la croissance tant qu'ils ne sont pas intégrés et peuvent se soulever si la stabilité s'effondre. |
| **Événements** | Élections, scandales, chocs énergétiques, cyberattaques, percées en IA, épidémies… chacun avec deux choix. |
| **IA** | Chaque nation gère budget, réformes, relations, commerce, sanctions des agresseurs, recherche de protection, casus belli et guerres opportunistes contre des voisins faibles non protégés. |

## Architecture

```
src/
  data/        données de départ : pays (PIB, population, budget militaire, stabilité), blocs, relations
  game/        moteur pur TypeScript, sans DOM, sérialisable (sauvegarde = JSON.stringify de l'état)
    setup.ts     création de partie
    world.ts     frontières et portée (topojson world-atlas, Natural Earth 1:110m)
    tick.ts      avancée d'un mois
    actions.ts   actions du joueur et de l'IA
    war.ts       guerres, occupation, traités
    ai.ts        comportement des nations IA et négociations
    events.ts    événements aléatoires et décisions
    state.ts     requêtes + index mis en cache (≈ 5 ms par mois simulé)
  ui/          carte SVG (d3-geo + d3-zoom, pinch/pan), HUD, fiche pays, modales
tests/         simulation longue + scénarios (guerre, appel aux armes, alliances)
```

La simulation est déterministe (RNG à état sauvegardé), ce qui permet de tester l'équilibrage sur des décennies simulées.

## Feuille de route

- [ ] Carte plus fine (régions/provinces au lieu de pays entiers, via Natural Earth admin-1)
- [ ] Types de régime (démocratie / autocratie) et élections qui changent la politique
- [ ] Ressources stratégiques (pétrole, gaz, semi-conducteurs, terres rares) et routes commerciales
- [ ] Union économique (UE…), ONU et votes de résolutions
- [ ] Guerres par proxy, soutien à des factions, conflits gelés
- [ ] Objectifs / missions par nation et écran de victoire
- [ ] Packaging natif iOS / Android (Capacitor) et sons
- [ ] Multijoueur asynchrone
