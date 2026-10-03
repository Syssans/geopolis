/**
 * Tutoriel « Comment jouer » : des chapitres courts, du plus utile au plus avancé.
 * Chaque chapitre peut proposer un bouton qui ouvre l'écran correspondant (en partie seulement).
 */
export interface TutChapter {
  icon: string;
  title: string;
  body: string;
  go?: { label: string; a: string; p?: string };
  /** Page sommaire : la liste des chapitres est générée à l'affichage. */
  toc?: boolean;
}

const tip = (t: string) => `<div class="tut-tip">💡 ${t}</div>`;
const steps = (items: string[]) => `<ol class="tut-steps">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
const keys = (rows: [string, string][]) => `<div class="tut-keys">${rows.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('')}</div>`;

export const TUTORIAL: TutChapter[] = [
  {
    icon: '👋',
    title: 'Bienvenue dans Geopolis',
    body: `<p>Vous dirigez un pays réel de <b>janvier 2026 à 2036</b>. Dix ans pour l’enrichir, élever le niveau de vie de sa population et remplir vos objectifs.</p>
      ${keys([
        ['🎯 Objectifs', 'des missions propres à votre pays, chacune rapporte des points'],
        ['🗡️ Rival', 'la plupart des pays en ont un, de puissance comparable, à dépasser ; certains (souvent les petits pays) n’en ont pas'],
        ['🏆 Bilan', 'à la fin, une note de S (exceptionnel) à D'],
      ])}
      <p>Pas de panique : les <b>24 premiers mois</b> sont un répit, personne ne vous attaquera. Profitez-en pour lancer votre économie.</p>
      ${tip('Ce tutoriel se lit dans l’ordre en 5 minutes. Vous pouvez le rouvrir à tout moment depuis ☰ Menu → Comment jouer.')}`,
  },
  {
    icon: '📑',
    title: 'Sommaire',
    body: '<p>Touchez un chapitre pour y aller directement, ou continuez page par page.</p>',
    toc: true,
  },
  {
    icon: '🖥️',
    title: 'Lire l’écran',
    body: `<p><b>En haut</b>, le bandeau résume l’état de votre pays. Touchez n’importe quelle tuile pour voir son bilan détaillé.</p>
      ${keys([
        ['💰 Trésor', 'votre argent et le solde du mois'],
        ['🤝 Influence', 'la monnaie de la diplomatie'],
        ['🔥 Ferveur', 'l’élan religieux de votre peuple'],
        ['⚖️ Stabilité', 'la cohésion du pays (sur 100)'],
        ['🏙️ Palier', 'le niveau de vie et la satisfaction 😄'],
      ])}
      <p>Dessous : la barre du <b>rival</b> si vous en avez un (rouge = votre écart) et le menu déroulant des <b>objectifs</b> avec votre score.</p>
      <p><b>En bas</b> : le mode de carte, 📦 Économie, 🎯 Objectifs, 📰 Journal et ☰ Menu.</p>
      ${tip('Partout dans le jeu, un petit <b>?</b> à côté d’un titre déplie une explication. Touchez à côté d’une fenêtre pour la fermer.')}`,
  },
  {
    icon: '⏱️',
    title: 'Le temps',
    body: `<p>Le jeu avance <b>mois par mois</b>. À droite de la date :</p>
      ${keys([
        ['⏸', 'pause (le jeu démarre en pause)'],
        ['› à ››››', 'quatre vitesses, de lente à très rapide'],
      ])}
      <p>Le jeu se met en pause tout seul quand une <b>crise</b> exige une décision, ou quand vous ouvrez un convoi.</p>
      ${tip('Jouez en pause pour vos décisions importantes, puis accélérez pour laisser travailler vos contrats.')}`,
  },
  {
    icon: '🗺️',
    title: 'La carte',
    body: `<p>Faites glisser pour vous déplacer, pincez pour zoomer. Votre pays est entouré de <b style="color:#ffd54a">jaune</b>.</p>
      <p>Le bouton <b>Carte</b> en bas à gauche change d’affichage :</p>
      ${keys([
        ['🗺️ Politique', 'nations, capitales, frontières'],
        ['⚓ Commerce', 'nœuds, routes maritimes, convois, détroits, ressources des provinces'],
        ['🤝 Diplomatie', 'vos relations, du rouge (hostile) au vert (ami)'],
        ['🕊️ Religions', 'confession de chaque province et lieux saints'],
        ['🔥 Agitation', 'le risque de révolte province par province'],
      ])}
      <p>Touchez une province pour ouvrir sa <b>fiche</b> ; glissez-la vers le bas pour la réduire ou la fermer. Le bouton « Menu du pays » ouvre les onglets de la nation entière.</p>`,
    go: { label: '⚓ Voir la carte du commerce', a: 'mode', p: 'trade' },
  },
  {
    icon: '💰',
    title: 'L’argent',
    body: `<p>Chaque mois, votre trésor évolue :</p>
      ${keys([
        ['+ Contrats', 'vos ventes directes à prix garanti (le levier n°1)'],
        ['+ Marché', 'le surplus que vos contrats et votre population n’utilisent pas, moins 30 % de commission ; une partie reste invendue'],
        ['+ Commissions', 'un petit courtage sur le commerce des nœuds où vous pesez'],
        ['+ Péages', 'si vous tenez un détroit'],
        ['− Armée et flotte', 'leur entretien'],
        ['− État', 'son coût augmente avec le niveau de vie'],
        ['− Besoins', 'achats d’urgence et contrats d’achat'],
      ])}
      <p><b class="neg">Trésor négatif = faillite</b> : 1,5 % d’intérêts par mois, désertions, stabilité en baisse, niveau de vie bloqué. Si la dette dépasse 6 mois de revenus, les créanciers exigent un plan du FMI ou un défaut.</p>
      ${tip('Touchez la tuile 💰 pour voir chaque ligne de votre budget.')}`,
    go: { label: '💰 Ouvrir mon budget', a: 'explain', p: 'treasury' },
  },
  {
    icon: '📤',
    title: 'Les contrats de vente',
    body: `<p>C’est votre <b>principale source de richesse</b> : vous livrez chaque mois une quantité fixe à un pays, à prix garanti, en vente directe (sans intermédiaire).</p>
      ${steps([
        'Ouvrez <b>📦 Économie → ✉️ Offres</b> : des pays demandent votre production.',
        '<b>✍️ Signer</b> accepte ; <b>💬 Négocier</b> tente +5 % de prime (🤝 10, peut échouer) ; <b>✖ Décliner</b> est sans effet.',
        'Pas d’offre ? Dans <b>📦 Ressources</b> ou <b>📈 Marché</b>, touchez <b>📤 Contrat de vente</b> pour démarcher un client (🤝 10).',
      ])}
      <p>Un pays n’achète que ce qui lui <b>manque</b> : plus son besoin est urgent, plus il paie. Vous ne pouvez engager qu’environ 60 % de votre production.</p>
      ${tip('Un contrat honoré rapporte aussi des points de score et de bonnes relations. Le rompre coûte 🌍 −20 avec le client.')}`,
    go: { label: '✉️ Voir mes offres', a: 'contracts', p: 'offers' },
  },
  {
    icon: '🚢',
    title: 'Convois, routes et escortes',
    body: `<p>Chaque contrat part en <b>convoi</b> par une route maritime réelle. Dans <b>📦 Économie → 🚢 Contrats</b>, pour chaque contrat :</p>
      ${keys([
        ['🚢 Itinéraire', 'choisissez la route : plus courte, ou qui évite un détroit fermé ou une zone de pirates'],
        ['⚓ Détroits', 'leur propriétaire prélève un péage sur chaque passage'],
        ['🏴‍☠️ Pirates', 'risque de pillage par mois, affiché en %'],
        ['🛡️ Escorte', 'affectez vos flottes (+ / −) pour réduire ce risque'],
      ])}
      <p>Un contrat <b>bloqué</b> 4 mois (guerre, détroit fermé) est rompu : changez d’itinéraire à temps.</p>
      <p>Sur la carte ⚓ Commerce, vos convois sont <b style="color:#ffd54a">jaunes</b>, ceux qui viennent vers vous <b class="pos">verts</b>, ceux de vos ennemis <b class="neg">rouges</b>. Touchez un convoi étranger pour l’<b>intercepter</b> : légal contre un ennemi, acte de piraterie en temps de paix.</p>`,
    go: { label: '🚢 Voir mes contrats', a: 'contracts', p: 'active' },
  },
  {
    icon: '🍞',
    title: 'Besoins et contrats d’achat',
    body: `<p>Votre population consomme des marchandises chaque mois. Dans <b>📦 Économie → 📦 Ressources</b>, chaque besoin a une barre :</p>
      ${keys([
        ['<span class="pos">■</span> vert', 'couvert par votre production'],
        ['<span class="c-blue">■</span> bleu', 'couvert par vos stocks et contrats d’achat'],
        ['<span class="neg">■</span> rouge', 'le manque, acheté en urgence au prix fort (+25 %)'],
      ])}
      ${steps([
        'Repérez un besoin rouge.',
        'Touchez <b>📥 Trouver un fournisseur</b> et choisissez un pays.',
        'Réglez la quantité (« Mes besoins » couvre exactement le manque, affiché en vert), la durée et l’itinéraire, puis signez.',
      ])}
      ${tip('Un contrat d’achat coûte bien moins cher que l’achat d’urgence, et compte en entier pour la satisfaction. Le surplus peut être stocké ou revendu.')}`,
    go: { label: '📦 Voir mes besoins', a: 'contracts', p: 'resources' },
  },
  {
    icon: '🏙️',
    title: 'Le niveau de vie',
    body: `<p>Votre population gravit cinq paliers :</p>
      <p class="tut-ladder">🛖 Subsistance → 🏭 Industrialisation → 🏘️ Classe moyenne → 🛍️ Consommation de masse → 🎓 Économie du savoir</p>
      <p>Chaque palier rend le pays <b>plus productif</b>, mais réclame de <b>nouveaux biens</b> (pétrole, gaz, puces, services…) et fait grimper le <b>coût de l’État</b>.</p>
      ${keys([
        ['😄 ≥ 80 %', 'besoins satisfaits : la population progresse vers le palier suivant'],
        ['😟 < 80 %', 'elle régresse et la stabilité baisse'],
      ])}
      <p>On ne s’enrichit pas à crédit : avec un trésor négatif ou sous plan d’austérité, impossible de monter de palier.</p>
      ${tip('La tuile du palier, en haut à droite, montre votre satisfaction avec un visage. Touchez-la pour le détail.')}`,
  },
  {
    icon: '🏭',
    title: 'Vos provinces',
    body: `<p>Chaque province a un <b>niveau de développement</b> (« dév. » dans les fiches) : sa richesse, ses villes, ses infrastructures et sa main-d’œuvre. C’est le chiffre le plus important d’une province :</p>
      ${keys([
        ['🏭 Production', 'une province produit chaque mois 5 % de son développement en marchandises (avant modernisation)'],
        ['🔄 Reconversions', 'les productions avancées exigent un minimum : textile 8, industrie 15, semi-conducteurs 25, finance 30'],
        ['⚓ Poids commercial', 'le développement fait votre poids dans le nœud de la province (+30 % si elle est côtière)'],
        ['🍞 Besoins et État', 'plus votre pays est développé, plus sa population consomme et plus l’État coûte cher'],
        ['🏆 Score', 'le développement gagné ou perdu compte dans la ligne « Territoire » du bilan'],
      ])}
      <p><b>Comment l’augmenter ?</b> Le développement d’une province est fixe : il reflète la réalité du pays. Votre développement total ne grandit qu’en gagnant des provinces — annexions à la paix, territoires qui vous rejoignent après une insurrection. Pour produire davantage <i>sans</i> conquérir, modernisez :</p>
      ${keys([
        ['⬆️ Moderniser', '12 mois de travaux, +35 % de production par niveau (★ jusqu’à ★★★)'],
        ['🔄 Reconvertir', '18 mois pour produire une marchandise plus chère (le niveau repart à zéro)'],
        ['⛏️ Prospecter', '6 mois de forage pour découvrir une ressource du sous-sol'],
      ])}
      <p>Touchez une de vos provinces pour agir. Sur la carte ⚓ Commerce, l’émoji de chaque province indique sa production, et le chiffre son niveau de modernisation.</p>
      ${tip('Modernisez d’abord les provinces les plus développées : +35 % sur une grosse province rapporte bien plus que sur une petite.')}`,
  },
  {
    icon: '⚓',
    title: 'Commerce mondial et détroits',
    body: `<p>Les exportations du monde circulent de <b>nœud</b> en nœud vers trois grands pôles : la Manche, New York et Shanghai. Ceux qui pèsent dans un nœud (ports, flotte, marchands) y prélèvent une commission de 12 % : un complément, pas une rente. Vos vraies recettes viennent de ce que vous <b>vendez</b> : contrats d’abord, marché ensuite.</p>
      <p>Les <b>détroits</b> (Ormuz, Suez, Malacca, Panama, Bosphore, Gibraltar…) rapportent un péage à leur propriétaire, qui peut les <b>fermer</b> (🤝 30) : le commerce en aval s’effondre et les prix du marché s’envolent.</p>
      <p>Vos partenaires commerciaux se détournent si votre <b>stabilité</b> tombe sous 50, si vos <b>relations</b> avec eux sont mauvaises ou si vous menez des <b>guerres d’agression</b> : vos exportations fondent.</p>
      ${tip('Le bilan 💰 détaille la « confiance des partenaires » et ce qui vous coûte.')}`,
  },
  {
    icon: '🤝',
    title: 'Diplomatie',
    body: `<p>L’<b>influence</b> se gagne chaque mois (plus si vous êtes un grand commerçant, meneur de bloc ou riche en contrats). Elle se dépense depuis la fiche d’un pays :</p>
      ${keys([
        ['🌍 Relations', 'améliorer (🤝 25)'],
        ['📜 Accord commercial', 'commercer plus librement (🤝 30)'],
        ['🛡️ Alliance', 'rejoindre un bloc ou s’allier (🤝 40)'],
        ['🚫 Embargo', 'frapper un pays (🤝 15)'],
        ['⚔️ Casus belli', 'un motif légitime de guerre (🤝 50)'],
      ])}
      <p>Certains pays démarrent <b>sous sanctions</b> : les grandes économies leur imposent un embargo. On peut les négocier une à une (bilan 🚫 Sanctions).</p>
      ${tip('De bonnes relations rendent les clients plus généreux et les fournisseurs moins chers.')}`,
  },
  {
    icon: '🕊️',
    title: 'Religion',
    body: `<p>Chaque province a sa confession. La <b>ferveur</b> 🔥 se gagne chaque mois (davantage si vous détenez des lieux saints).</p>
      ${keys([
        ['🧭 Politique', 'tolérance (calme), neutralité, ou prosélytisme (ferveur, mais minorités agitées)'],
        ['✝️ Missionnaires', 'convertir une province minoritaire (🔥 30)'],
        ['🤲 Unité nationale', '+10 stabilité (🔥 40)'],
        ['⭐ Lieux saints', 'Jérusalem, La Mecque, Rome, Qom… : ferveur pour leur détenteur, colère des fidèles sinon'],
      ])}
      <p>Les minorités agitées peuvent se <b>soulever</b>, surtout si un voisin de leur foi arme les insurgés. Surveillez la carte 🔥 Agitation.</p>`,
    go: { label: '🕊️ Voir la carte des religions', a: 'mode', p: 'religion' },
  },
  {
    icon: '⚔️',
    title: 'La guerre',
    body: `<p>La guerre est un dernier recours coûteux.</p>
      ${steps([
        'Obtenez un <b>casus belli</b> (🤝 50) : sans motif, la stabilité chute et le monde vous sanctionne.',
        'Déclarez la guerre depuis la fiche du pays.',
        'Votre <b>armée</b> prend les provinces ennemies une à une ; votre <b>flotte</b> protège vos convois et bloque les siens.',
        'Le <b>score de guerre</b> grimpe avec les provinces occupées : à la paix, annexez des provinces précises, satellisez ou exigez des réparations.',
      ])}
      <p>Une <b>puissance nucléaire</b> ne cède jamais de territoire. Si deux d’entre elles s’affrontent, la <b>tension mondiale</b> ☢️ monte… au-delà de 95 %, c’est la fin pour tout le monde.</p>`,
  },
  {
    icon: '⚡',
    title: 'Crises et rival',
    body: `<p>Des <b>crises</b> surviennent : catastrophes, ultimatums, crise de la dette, révoltes, coups de force de votre rival… Le jeu se met en pause et vous choisissez une réponse ; chaque option affiche ses conséquences.</p>
      <p>Si votre campagne vous désigne un <b>rival</b>, c’est un pays de puissance comparable. La barre sous le bandeau montre votre écart : le dépasser rapporte des points au bilan, et l’éliminer davantage encore. Sans rival, vos objectifs comptent d’autant plus.</p>
      ${tip('Une crise de la dette se gère mieux tôt : le plan du FMI coupe la dette de moitié mais impose deux ans d’austérité.')}`,
  },
  {
    icon: '🏆',
    title: 'Le score final',
    body: `<p>En 2036, votre bilan additionne :</p>
      ${keys([
        ['🎯 Missions et contrats', 'chaque objectif accompli et chaque contrat honoré'],
        ['📈 Rang et croissance', 'votre rang commercial mondial et la hausse de vos revenus'],
        ['🏙️ Niveau de vie', 'le palier atteint'],
        ['🗺️ Territoire', 'provinces gagnées, lieux saints, détroits'],
        ['💰 Finances et ⚖️ stabilité', 'un trésor sain et un pays calme'],
        ['🗡️ Rival', 'votre avance sur lui, si vous en avez un'],
      ])}
      <p class="tut-ladder">S ≥ 290 · A ≥ 220 · B ≥ 150 · C ≥ 90 · D</p>
      ${tip('Le menu 🎯 Objectifs montre votre score en direct et la progression de chaque mission.')}`,
    go: { label: '🎯 Voir mes objectifs', a: 'objectives' },
  },
  {
    icon: '🚀',
    title: 'Vos premiers pas',
    body: `<p>Une ouverture solide, quel que soit le pays :</p>
      ${steps([
        '<b>📦 Économie → ✉️ Offres</b> : signez les meilleures offres de vente.',
        '<b>📦 Ressources</b> : pour chaque besoin rouge, signez un contrat d’achat.',
        'Démarchez un client (📤) pour votre marchandise la plus chère.',
        'Modernisez une ou deux provinces clés.',
        'Lisez vos <b>🎯 Objectifs</b> et améliorez vos relations avec les pays qu’ils citent.',
        'Lancez le temps, puis revenez régulièrement escorter vos convois et renouveler vos contrats.',
      ])}
      ${tip('Gardez toujours un trésor positif : la faillite bloque tout le reste.')}
      <p style="text-align:center;margin-top:12px"><b>Bonne partie !</b></p>`,
  },
];
