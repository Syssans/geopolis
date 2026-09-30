/** Conditions de mission (vérifiées chaque mois). */
export type Check =
  | { type: 'income'; amount: number } // revenus mensuels (Md$)
  | { type: 'contracts'; count: number } // contrats actifs simultanés
  | { type: 'contractWith'; nation: string } // contrat actif avec une nation
  | { type: 'contractsDone'; count: number } // contrats honorés jusqu'au bout
  | { type: 'nodeShare'; node: string; share: number } // part du pouvoir commercial d'un nœud
  | { type: 'strait'; strait: string } // contrôler un détroit
  | { type: 'holy'; site: string } // détenir un lieu saint
  | { type: 'faithful'; share: number } // part des provinces de la religion d'État
  | { type: 'converted'; count: number } // provinces converties par vos missionnaires
  | { type: 'fervor'; amount: number }
  | { type: 'coreligionists'; count: number } // nations de même foi avec relations ≥ 60
  | { type: 'rivalIncome'; ratio: number } // revenus du rival ≤ ratio × les vôtres
  | { type: 'relations'; nation: string; value: number }
  | { type: 'blocSize'; size: number } // mener un bloc d'au moins n membres
  | { type: 'stability'; value: number }
  | { type: 'treasury'; amount: number }
  | { type: 'warsWon'; count: number };

export interface MissionDef {
  id: string;
  title: string;
  desc: string;
  check: Check;
  reward: { money?: number; influence?: number; fervor?: number; score: number };
}

export interface NationCampaign {
  rival: string;
  intro: string;
  missions: MissionDef[];
}

const m = (id: string, title: string, desc: string, check: Check, score: number, extra: Omit<MissionDef['reward'], 'score'> = {}): MissionDef => ({
  id,
  title,
  desc,
  check,
  reward: { score, ...extra },
});

/** Campagnes écrites pour ~25 nations. Les autres reçoivent des missions génériques. */
export const CAMPAIGNS: Record<string, NationCampaign> = {
  'United States of America': {
    rival: 'China',
    intro: 'Première puissance mondiale, vous devez contenir l’ascension chinoise sans ruiner le commerce dont vous vivez.',
    missions: [
      m('usa-atl', 'Maîtres de l’Atlantique', 'Détenir 60 % du pouvoir commercial à New York.', { type: 'nodeShare', node: 'new_york', share: 0.6 }, 20, { influence: 50 }),
      m('usa-pac', 'Pivot vers le Pacifique', 'Contrat actif avec le Japon.', { type: 'contractWith', nation: 'Japan' }, 15),
      m('usa-tw', 'Bouclier de Taïwan', 'Relations ≥ 90 avec Taïwan.', { type: 'relations', nation: 'Taiwan', value: 90 }, 15),
      m('usa-panama', 'Le canal de Monroe', 'Contrôler le canal de Panama.', { type: 'strait', strait: 'panama' }, 25),
    ],
  },
  China: {
    rival: 'United States of America',
    intro: 'Atelier du monde, vous devez sécuriser vos routes maritimes et dépasser les États-Unis.',
    missions: [
      m('chn-malacca', 'Le dilemme de Malacca', 'Détenir 40 % du pouvoir commercial à Malacca.', { type: 'nodeShare', node: 'malacca', share: 0.4 }, 20),
      m('chn-silk', 'Nouvelles routes de la soie', 'Honorer 4 contrats commerciaux.', { type: 'contractsDone', count: 4 }, 20, { influence: 60 }),
      m('chn-gulf', 'Pétrole du Golfe', 'Contrat actif avec l’Arabie saoudite.', { type: 'contractWith', nation: 'Saudi Arabia' }, 10),
      m('chn-xj', 'Harmonie intérieure', '90 % de vos provinces partagent la ligne officielle.', { type: 'faithful', share: 0.9 }, 15),
    ],
  },
  Russia: {
    rival: 'Ukraine',
    intro: 'Sous embargo occidental, vous devez trouver de nouveaux clients pour votre énergie et défendre l’orthodoxie.',
    missions: [
      m('rus-asia', 'Pivot vers l’Asie', 'Contrat actif avec la Chine.', { type: 'contractWith', nation: 'China' }, 15),
      m('rus-india', 'Le client indien', 'Contrat actif avec l’Inde.', { type: 'contractWith', nation: 'India' }, 10),
      m('rus-bosph', 'Accès aux mers chaudes', 'Détenir 40 % du pouvoir commercial en mer Noire.', { type: 'nodeShare', node: 'mer_noire', share: 0.4 }, 15),
      m('rus-ortho', 'Troisième Rome', 'Relations ≥ 60 avec 4 nations orthodoxes.', { type: 'coreligionists', count: 4 }, 20, { fervor: 80 }),
    ],
  },
  India: {
    rival: 'Pakistan',
    intro: 'Géant démographique, vous devez devenir une puissance commerciale de l’océan Indien.',
    missions: [
      m('ind-ocean', 'Mare nostrum indien', 'Détenir 50 % du pouvoir commercial de l’océan Indien.', { type: 'nodeShare', node: 'ocean_indien', share: 0.5 }, 20),
      m('ind-oil', 'Sécurité énergétique', 'Contrat actif avec l’Arabie saoudite.', { type: 'contractWith', nation: 'Saudi Arabia' }, 10),
      m('ind-hindutva', 'Unité hindoue', '85 % de provinces hindoues.', { type: 'faithful', share: 0.85 }, 15, { fervor: 60 }),
      m('ind-cont', '5 contrats simultanés', 'Faire tourner 5 contrats en même temps.', { type: 'contracts', count: 5 }, 20),
    ],
  },
  'Saudi Arabia': {
    rival: 'Iran',
    intro: 'Gardien des lieux saints de l’islam, vous vendez le pétrole du monde tout en contenant l’Iran chiite.',
    missions: [
      m('sau-gulf', 'Le Golfe est arabe', 'Détenir 50 % du pouvoir commercial du Golfe Persique.', { type: 'nodeShare', node: 'ormuz', share: 0.5 }, 20),
      m('sau-asia', 'Le pétrole vers l’Asie', 'Contrat actif avec la Chine.', { type: 'contractWith', nation: 'China' }, 10),
      m('sau-umma', 'Leader de l’oumma', 'Relations ≥ 60 avec 6 nations sunnites.', { type: 'coreligionists', count: 6 }, 20, { fervor: 100 }),
      m('sau-bab', 'Verrou de Bab-el-Mandeb', 'Contrôler Bab-el-Mandeb.', { type: 'strait', strait: 'bab' }, 25),
    ],
  },
  Iran: {
    rival: 'Saudi Arabia',
    intro: 'Sous sanctions, vous tenez Ormuz et l’axe chiite : à vous de briser l’isolement.',
    missions: [
      m('irn-axis', 'L’axe de la résistance', 'Relations ≥ 60 avec 3 nations chiites.', { type: 'coreligionists', count: 3 }, 20, { fervor: 80 }),
      m('irn-najaf', 'Najaf et Karbala', 'Détenir Najaf et Karbala.', { type: 'holy', site: 'Najaf et Karbala' }, 30),
      m('irn-china', 'Contourner les sanctions', 'Contrat actif avec la Chine.', { type: 'contractWith', nation: 'China' }, 15),
      m('irn-rich', 'Économie de résistance', 'Atteindre 9 Md$ de revenus mensuels.', { type: 'income', amount: 9 }, 15),
    ],
  },
  Turkey: {
    rival: 'Greece',
    intro: 'Maître du Bosphore entre Europe et Asie, vous pouvez devenir l’arbitre des mers.',
    missions: [
      m('tur-bosph', 'Péages du Bosphore', 'Détenir 50 % du pouvoir commercial en mer Noire.', { type: 'nodeShare', node: 'mer_noire', share: 0.5 }, 20),
      m('tur-med', 'Patrie bleue', 'Détenir 25 % du pouvoir commercial en Méditerranée.', { type: 'nodeShare', node: 'mediterranee', share: 0.25 }, 20),
      m('tur-turk', 'Monde turcique', 'Relations ≥ 60 avec 5 nations sunnites.', { type: 'coreligionists', count: 5 }, 15),
      m('tur-suez', 'Au-delà de Suez', 'Contrôler le canal de Suez.', { type: 'strait', strait: 'suez' }, 30),
    ],
  },
  Israel: {
    rival: 'Iran',
    intro: 'Îlot technologique entouré d’hostilité, vous devez normaliser vos relations et exporter votre savoir-faire.',
    missions: [
      m('isr-abraham', 'Accords d’Abraham', 'Relations ≥ 50 avec l’Arabie saoudite.', { type: 'relations', nation: 'Saudi Arabia', value: 50 }, 25),
      m('isr-tech', 'Start-up nation', 'Contrat actif avec l’Inde.', { type: 'contractWith', nation: 'India' }, 10),
      m('isr-rich', 'Silicon Wadi', 'Atteindre 8 Md$ de revenus mensuels.', { type: 'income', amount: 8 }, 15),
      m('isr-stab', 'Union nationale', 'Stabilité ≥ 70.', { type: 'stability', value: 70 }, 15),
    ],
  },
  Egypt: {
    rival: 'Ethiopia',
    intro: 'Le canal de Suez fait votre richesse, le barrage éthiopien menace votre Nil.',
    missions: [
      m('egy-suez', 'Péages de Suez', 'Détenir 50 % du pouvoir commercial à Suez.', { type: 'nodeShare', node: 'suez', share: 0.5 }, 20),
      m('egy-bab', 'La porte sud', 'Contrôler Bab-el-Mandeb.', { type: 'strait', strait: 'bab' }, 25),
      m('egy-azhar', 'Al-Azhar', 'Relations ≥ 60 avec 5 nations sunnites.', { type: 'coreligionists', count: 5 }, 15),
      m('egy-gas', 'Hub gazier', 'Contrat actif avec l’Allemagne.', { type: 'contractWith', nation: 'Germany' }, 10),
    ],
  },
  France: {
    rival: 'Russia',
    intro: 'Puissance nucléaire aux territoires sur tous les océans, vous voulez peser face à la Russie.',
    missions: [
      m('fra-manche', 'Porte de l’Europe', 'Détenir 25 % du pouvoir commercial de la Manche.', { type: 'nodeShare', node: 'manche', share: 0.25 }, 15),
      m('fra-med', 'Mare nostrum', 'Détenir 30 % du pouvoir commercial en Méditerranée.', { type: 'nodeShare', node: 'mediterranee', share: 0.3 }, 20),
      m('fra-afr', 'Retour en Afrique', 'Contrat actif avec le Nigeria.', { type: 'contractWith', nation: 'Nigeria' }, 10),
      m('fra-eu', 'Europe puissance', 'Relations ≥ 90 avec l’Allemagne.', { type: 'relations', nation: 'Germany', value: 90 }, 10),
    ],
  },
  'United Kingdom': {
    rival: 'Russia',
    intro: 'Hors de l’Union, vous rêvez d’un « Global Britain » maître des flux financiers.',
    missions: [
      m('gbr-manche', 'Rule, Britannia', 'Détenir 40 % du pouvoir commercial de la Manche.', { type: 'nodeShare', node: 'manche', share: 0.4 }, 20),
      m('gbr-global', 'Global Britain', 'Faire tourner 4 contrats en même temps.', { type: 'contracts', count: 4 }, 15),
      m('gbr-india', 'Le Commonwealth', 'Contrat actif avec l’Inde.', { type: 'contractWith', nation: 'India' }, 10),
      m('gbr-gib', 'Le Rocher', 'Contrôler Gibraltar.', { type: 'strait', strait: 'gibraltar' }, 30),
    ],
  },
  Germany: {
    rival: 'Russia',
    intro: 'Champion industriel privé du gaz russe, vous devez trouver d’autres fournisseurs et clients.',
    missions: [
      m('deu-china', 'Made in Germany', 'Contrat actif avec la Chine.', { type: 'contractWith', nation: 'China' }, 10),
      m('deu-usa', 'Partenariat transatlantique', 'Contrat actif avec les États-Unis.', { type: 'contractWith', nation: 'United States of America' }, 10),
      m('deu-balt', 'La Hanse', 'Détenir 30 % du pouvoir commercial de la Baltique.', { type: 'nodeShare', node: 'baltique', share: 0.3 }, 20),
      m('deu-exp', 'Champion de l’export', 'Honorer 5 contrats.', { type: 'contractsDone', count: 5 }, 25),
    ],
  },
  Japan: {
    rival: 'China',
    intro: 'Archipel dépendant des mers, vous devez sécuriser vos routes face à la Chine.',
    missions: [
      m('jpn-node', 'Soleil levant', 'Détenir 50 % du pouvoir commercial du nœud Japon.', { type: 'nodeShare', node: 'japon', share: 0.5 }, 15),
      m('jpn-oil', 'Sécurité énergétique', 'Contrat actif avec les Émirats arabes unis.', { type: 'contractWith', nation: 'United Arab Emirates' }, 10),
      m('jpn-quad', 'Le Quad', 'Relations ≥ 80 avec l’Inde.', { type: 'relations', nation: 'India', value: 80 }, 15),
      m('jpn-malacca', 'Escorter Malacca', 'Détenir 15 % du pouvoir commercial à Malacca.', { type: 'nodeShare', node: 'malacca', share: 0.15 }, 20),
    ],
  },
  'South Korea': {
    rival: 'North Korea',
    intro: 'Géant des puces sous la menace nucléaire du Nord.',
    missions: [
      m('kor-chips', 'Empire des puces', 'Faire tourner 3 contrats en même temps.', { type: 'contracts', count: 3 }, 15),
      m('kor-usa', 'Alliance indéfectible', 'Relations ≥ 90 avec les États-Unis.', { type: 'relations', nation: 'United States of America', value: 90 }, 10),
      m('kor-jpn', 'Réconciliation', 'Relations ≥ 60 avec le Japon.', { type: 'relations', nation: 'Japan', value: 60 }, 15),
      m('kor-rich', 'Miracle du fleuve Han', 'Atteindre 30 Md$ de revenus mensuels.', { type: 'income', amount: 30 }, 20),
    ],
  },
  Taiwan: {
    rival: 'China',
    intro: 'Vous fabriquez les puces du monde entier. Rendez-vous indispensable avant que Pékin ne frappe.',
    missions: [
      m('twn-shield', 'Bouclier de silicium', 'Faire tourner 4 contrats en même temps.', { type: 'contracts', count: 4 }, 25),
      m('twn-usa', 'Garantie américaine', 'Relations ≥ 95 avec les États-Unis.', { type: 'relations', nation: 'United States of America', value: 95 }, 15),
      m('twn-jpn', 'Voisin fidèle', 'Relations ≥ 80 avec le Japon.', { type: 'relations', nation: 'Japan', value: 80 }, 10),
      m('twn-cash', 'Trésor de guerre', 'Accumuler 400 Md$.', { type: 'treasury', amount: 400 }, 15),
    ],
  },
  Brazil: {
    rival: 'Argentina',
    intro: 'Grenier du monde, vous devez vendre votre soja et votre fer à l’Asie.',
    missions: [
      m('bra-china', 'Soja pour la Chine', 'Contrat actif avec la Chine.', { type: 'contractWith', nation: 'China' }, 10),
      m('bra-node', 'Géant sud-américain', 'Détenir 60 % du pouvoir commercial du nœud Brésil.', { type: 'nodeShare', node: 'bresil', share: 0.6 }, 15),
      m('bra-plata', 'Río de la Plata', 'Détenir 40 % du pouvoir commercial du Río de la Plata.', { type: 'nodeShare', node: 'plata', share: 0.4 }, 20),
      m('bra-3', 'Puissance agricole', 'Faire tourner 3 contrats en même temps.', { type: 'contracts', count: 3 }, 15),
    ],
  },
  Nigeria: {
    rival: 'Cameroon',
    intro: 'Premier pays d’Afrique, fracturé entre Nord musulman et Sud chrétien, assis sur le pétrole.',
    missions: [
      m('nga-guinea', 'Seigneur du golfe de Guinée', 'Détenir 50 % du pouvoir commercial du golfe de Guinée.', { type: 'nodeShare', node: 'afrique_ouest', share: 0.5 }, 20),
      m('nga-stab', 'Une nation, deux fois', 'Stabilité ≥ 60.', { type: 'stability', value: 60 }, 20),
      m('nga-oil', 'Pétrole vers l’Europe', 'Contrat actif avec la France.', { type: 'contractWith', nation: 'France' }, 10),
      m('nga-conv', 'Missionnaires', 'Convertir 2 provinces.', { type: 'converted', count: 2 }, 15),
    ],
  },
  Pakistan: {
    rival: 'India',
    intro: 'Puissance nucléaire musulmane coincée entre l’Inde et l’Afghanistan, alliée de Pékin.',
    missions: [
      m('pak-china', 'Corridor sino-pakistanais', 'Relations ≥ 90 avec la Chine.', { type: 'relations', nation: 'China', value: 90 }, 15),
      m('pak-umma', 'Bouclier de l’oumma', 'Relations ≥ 60 avec 5 nations sunnites.', { type: 'coreligionists', count: 5 }, 15),
      m('pak-kash', 'La cause du Cachemire', 'Mobiliser la ferveur du pays (ferveur ≥ 250).', { type: 'fervor', amount: 250 }, 15),
      m('pak-rich', 'Décollage', 'Atteindre 6 Md$ de revenus mensuels.', { type: 'income', amount: 6 }, 20),
    ],
  },
  Indonesia: {
    rival: 'China',
    intro: 'Plus grand pays musulman, archipel posé sur Malacca.',
    missions: [
      m('idn-malacca', 'Gardien de Malacca', 'Détenir 30 % du pouvoir commercial à Malacca.', { type: 'nodeShare', node: 'malacca', share: 0.3 }, 20),
      m('idn-nickel', 'Roi du nickel', 'Faire tourner 3 contrats en même temps.', { type: 'contracts', count: 3 }, 15),
      m('idn-faith', 'Islam de l’archipel', '90 % de provinces sunnites.', { type: 'faithful', share: 0.9 }, 15),
      m('idn-jpn', 'Partenaire japonais', 'Contrat actif avec le Japon.', { type: 'contractWith', nation: 'Japan' }, 10),
    ],
  },
  Ukraine: {
    rival: 'Russia',
    intro: 'Grenier de l’Europe, vous devez survivre, exporter votre blé et arrimer le pays à l’Occident.',
    missions: [
      m('ukr-grain', 'Corridor céréalier', 'Contrat actif avec l’Égypte.', { type: 'contractWith', nation: 'Egypt' }, 15),
      m('ukr-west', 'Arrimage à l’Ouest', 'Relations ≥ 80 avec la Pologne.', { type: 'relations', nation: 'Poland', value: 80 }, 10),
      m('ukr-stab', 'Résilience', 'Stabilité ≥ 60.', { type: 'stability', value: 60 }, 20),
      m('ukr-3', 'Reconstruire', 'Faire tourner 3 contrats en même temps.', { type: 'contracts', count: 3 }, 15),
    ],
  },
  Poland: {
    rival: 'Russia',
    intro: 'Rempart oriental de l’OTAN, vous voulez devenir la puissance centrale de l’Europe.',
    missions: [
      m('pol-balt', 'Intermarium', 'Détenir 25 % du pouvoir commercial de la Baltique.', { type: 'nodeShare', node: 'baltique', share: 0.25 }, 20),
      m('pol-ukr', 'Frères ukrainiens', 'Relations ≥ 80 avec l’Ukraine.', { type: 'relations', nation: 'Ukraine', value: 80 }, 10),
      m('pol-cath', 'Foi polonaise', 'Relations ≥ 60 avec 5 nations catholiques.', { type: 'coreligionists', count: 5 }, 15),
      m('pol-rich', 'Tigre européen', 'Atteindre 15 Md$ de revenus mensuels.', { type: 'income', amount: 15 }, 20),
    ],
  },
  'United Arab Emirates': {
    rival: 'Iran',
    intro: 'Plateforme logistique et financière du Golfe, vous vivez des flux mondiaux.',
    missions: [
      m('are-hub', 'Hub mondial', 'Faire tourner 4 contrats en même temps.', { type: 'contracts', count: 4 }, 20),
      m('are-gulf', 'Dubaï, capitale du Golfe', 'Détenir 30 % du pouvoir commercial du Golfe Persique.', { type: 'nodeShare', node: 'ormuz', share: 0.3 }, 20),
      m('are-india', 'Couloir indien', 'Contrat actif avec l’Inde.', { type: 'contractWith', nation: 'India' }, 10),
      m('are-cash', 'Fonds souverain', 'Accumuler 300 Md$.', { type: 'treasury', amount: 300 }, 15),
    ],
  },
  Ethiopia: {
    rival: 'Egypt',
    intro: 'Géant enclavé, orthodoxe et musulman, vous cherchez un accès à la mer.',
    missions: [
      m('eth-sea', 'Accès à la mer', 'Détenir 20 % du pouvoir commercial du golfe d’Aden.', { type: 'nodeShare', node: 'aden', share: 0.2 }, 25),
      m('eth-stab', 'Fédération apaisée', 'Stabilité ≥ 55.', { type: 'stability', value: 55 }, 20),
      m('eth-coffee', 'Berceau du café', 'Contrat actif avec l’Allemagne.', { type: 'contractWith', nation: 'Germany' }, 10),
      m('eth-faith', 'Église de Tewahedo', 'Ferveur ≥ 200.', { type: 'fervor', amount: 200 }, 10),
    ],
  },
  Mexico: {
    rival: 'United States of America',
    intro: 'Usine de l’Amérique du Nord, vous voulez peser face à votre puissant voisin.',
    missions: [
      m('mex-gulf', 'Golfe du Mexique', 'Détenir 30 % du pouvoir commercial du golfe du Mexique.', { type: 'nodeShare', node: 'golfe_mexique', share: 0.3 }, 20),
      m('mex-asia', 'Diversifier les clients', 'Contrat actif avec le Japon.', { type: 'contractWith', nation: 'Japan' }, 10),
      m('mex-latam', 'Leader latino', 'Relations ≥ 60 avec 6 nations catholiques.', { type: 'coreligionists', count: 6 }, 15),
      m('mex-3', 'Nearshoring', 'Faire tourner 3 contrats en même temps.', { type: 'contracts', count: 3 }, 15),
    ],
  },
  Singapore: {
    rival: 'Malaysia',
    intro: 'Cité-État au bout de Malacca, vous vivez du passage des navires du monde entier.',
    missions: [
      m('sgp-malacca', 'Port du monde', 'Détenir 30 % du pouvoir commercial à Malacca.', { type: 'nodeShare', node: 'malacca', share: 0.3 }, 25),
      m('sgp-strait', 'Le détroit', 'Contrôler le détroit de Malacca.', { type: 'strait', strait: 'malacca' }, 30),
      m('sgp-hub', 'Plaque tournante', 'Faire tourner 3 contrats en même temps.', { type: 'contracts', count: 3 }, 15),
      m('sgp-cash', 'Réserves', 'Accumuler 250 Md$.', { type: 'treasury', amount: 250 }, 10),
    ],
  },
};

/** Missions communes à toutes les nations (les seuils sont adaptés à la taille du pays au départ). */
const round1 = (v: number) => Math.max(0.5, Math.round(v * 10) / 10);
const fmt1 = (v: number) => String(round1(v)).replace('.', ',');

export function genericMissions(income0: number, faithful0: number): MissionDef[] {
  return [
    m('gen-c2', 'Premiers contrats', 'Faire tourner 2 contrats en même temps.', { type: 'contracts', count: 2 }, 10, { influence: 30 }),
    m('gen-done3', 'Partenaire fiable', 'Honorer 3 contrats jusqu’au bout.', { type: 'contractsDone', count: 3 }, 15),
    m('gen-inc', 'Prospérité', `Atteindre ${fmt1(income0 * 1.5)} Md$ de revenus mensuels.`, { type: 'income', amount: round1(income0 * 1.5) }, 20),
    m('gen-inc2', 'Âge d’or', `Atteindre ${fmt1(income0 * 1.9)} Md$ de revenus mensuels.`, { type: 'income', amount: round1(income0 * 1.9) }, 25),
    m('gen-faith', 'Unité de la foi', `${Math.round(Math.min(1, faithful0 + 0.1) * 100)} % de provinces de la religion d’État.`, { type: 'faithful', share: Math.min(1, faithful0 + 0.1) }, 15, { fervor: 50 }),
    m('gen-rival', 'Humilier le rival', 'Revenus du rival inférieurs à 70 % des vôtres.', { type: 'rivalIncome', ratio: 0.7 }, 25),
    m('gen-stab', 'Paix civile', 'Stabilité ≥ 75.', { type: 'stability', value: 75 }, 10),
  ];
}
