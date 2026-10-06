/**
 * Communautés économiques au 1er janvier 2026 (noms atlas). Distinctes des blocs militaires (OTAN, OTSC) :
 * elles rapprochent leurs membres et facilitent le commerce entre eux.
 * `market` : avantage commercial entre membres (prime de vente en plus, marge d'achat en moins).
 * `region` : pays qui peuvent y adhérer en cours de partie (en plus des membres).
 */
export interface CommunityDef {
  id: string;
  name: string;
  short: string;
  icon: string;
  market: number;
  relations: number; // rapprochement entre membres (relation « naturelle »)
  desc: string;
  members: string[];
  region: string[];
}

const AFRICA = [
  'Egypt', 'Algeria', 'Morocco', 'Tunisia', 'Libya', 'Nigeria', 'South Africa', 'Ethiopia', 'Kenya', 'Tanzania', 'Angola', "Côte d'Ivoire", 'Ghana',
  'Dem. Rep. Congo', 'Uganda', 'Cameroon', 'Sudan', 'S. Sudan', 'Senegal', 'Zambia', 'Zimbabwe', 'Mozambique', 'Mali', 'Burkina Faso', 'Niger', 'Chad',
  'Guinea', 'Benin', 'Rwanda', 'Burundi', 'Somalia', 'Madagascar', 'Malawi', 'Togo', 'Sierra Leone', 'Liberia', 'Guinea-Bissau', 'Gambia', 'Mauritania',
  'Central African Rep.', 'Congo', 'Gabon', 'Eq. Guinea', 'Namibia', 'Botswana', 'Lesotho', 'eSwatini', 'Eritrea', 'Djibouti',
];
const EUROPE_CANDIDATES = ['Serbia', 'Bosnia and Herz.', 'Albania', 'Macedonia', 'Montenegro', 'Kosovo', 'Moldova', 'Ukraine', 'Georgia', 'Norway', 'Iceland', 'Switzerland', 'United Kingdom', 'Turkey'];

export const COMMUNITIES: CommunityDef[] = [
  {
    id: 'ue', name: 'Union européenne', short: 'UE', icon: '🇪🇺', market: 0.08, relations: 15,
    desc: 'Marché unique : le commerce entre membres est le plus fluide du monde.',
    members: [
      'Germany', 'France', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Belgium', 'Luxembourg', 'Ireland', 'Austria', 'Denmark', 'Sweden', 'Finland',
      'Poland', 'Czechia', 'Slovakia', 'Hungary', 'Slovenia', 'Croatia', 'Romania', 'Bulgaria', 'Greece', 'Cyprus', 'Malta', 'Estonia', 'Latvia', 'Lithuania',
    ],
    region: EUROPE_CANDIDATES,
  },
  {
    id: 'ocs', name: 'Organisation de coopération de Shanghai', short: 'OCS', icon: '🐉', market: 0.04, relations: 10,
    desc: 'Coopération eurasiatique autour de la Chine et de la Russie : sécurité, énergie, commerce.',
    members: ['China', 'Russia', 'India', 'Pakistan', 'Kazakhstan', 'Kyrgyzstan', 'Tajikistan', 'Uzbekistan', 'Iran', 'Belarus'],
    region: ['Mongolia', 'Afghanistan', 'Turkmenistan', 'Azerbaijan', 'Armenia', 'Turkey', 'Saudi Arabia', 'Egypt', 'Qatar', 'United Arab Emirates', 'Kuwait', 'Bahrain', 'Myanmar', 'Cambodia', 'Nepal', 'Sri Lanka', 'Laos'],
  },
  {
    id: 'ua', name: 'Union africaine', short: 'UA', icon: '🌍', market: 0.04, relations: 8,
    desc: 'Les 55 nations du continent et la Zone de libre-échange continentale africaine (ZLECAf).',
    members: AFRICA,
    region: ['W. Sahara', 'Somaliland'],
  },
  {
    id: 'cw', name: 'Commonwealth', short: 'CW', icon: '👑', market: 0.03, relations: 8,
    desc: 'Héritage britannique : langue, droit et réseaux d’affaires communs.',
    members: [
      'United Kingdom', 'Canada', 'Australia', 'New Zealand', 'India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Malaysia', 'Singapore', 'Brunei',
      'South Africa', 'Nigeria', 'Kenya', 'Ghana', 'Uganda', 'Tanzania', 'Zambia', 'Malawi', 'Mozambique', 'Rwanda', 'Cameroon', 'Namibia', 'Botswana',
      'Lesotho', 'eSwatini', 'Gambia', 'Sierra Leone', 'Gabon', 'Togo', 'Jamaica', 'Trinidad and Tobago', 'Guyana', 'Belize', 'Bahamas',
      'Papua New Guinea', 'Fiji', 'Solomon Is.', 'Vanuatu', 'Cyprus', 'Malta',
    ],
    region: [],
  },
  {
    id: 'asean', name: 'ASEAN', short: 'ASEAN', icon: '🌾', market: 0.05, relations: 10,
    desc: 'Association des nations de l’Asie du Sud-Est : zone de libre-échange et usines du monde.',
    members: ['Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'Malaysia', 'Singapore', 'Myanmar', 'Cambodia', 'Laos', 'Brunei', 'Timor-Leste'],
    region: ['Papua New Guinea', 'Bangladesh', 'Sri Lanka'],
  },
  {
    id: 'mercosur', name: 'Mercosur', short: 'Mercosur', icon: '🧉', market: 0.05, relations: 10,
    desc: 'Marché commun du Sud : union douanière de l’Amérique du Sud.',
    members: ['Brazil', 'Argentina', 'Uruguay', 'Paraguay', 'Bolivia'],
    region: ['Chile', 'Peru', 'Colombia', 'Ecuador', 'Venezuela', 'Guyana', 'Suriname'],
  },
  {
    id: 'aceum', name: 'Accord Canada–États-Unis–Mexique', short: 'ACEUM', icon: '🦅', market: 0.06, relations: 10,
    desc: 'Libre-échange nord-américain : chaînes de production intégrées.',
    members: ['United States of America', 'Canada', 'Mexico'],
    region: [],
  },
  {
    id: 'uee', name: 'Union économique eurasiatique', short: 'UEE', icon: '🐻', market: 0.05, relations: 10,
    desc: 'Union douanière autour de la Russie.',
    members: ['Russia', 'Belarus', 'Kazakhstan', 'Kyrgyzstan', 'Armenia'],
    region: ['Tajikistan', 'Uzbekistan', 'Moldova', 'Azerbaijan', 'Mongolia', 'Georgia', 'Turkmenistan'],
  },
  {
    id: 'cedeao', name: 'Communauté économique des États de l’Afrique de l’Ouest', short: 'CEDEAO', icon: '🥁', market: 0.05, relations: 10,
    desc: 'Libre circulation et marché commun ouest-africain.',
    members: ['Nigeria', 'Ghana', "Côte d'Ivoire", 'Senegal', 'Benin', 'Togo', 'Guinea', 'Guinea-Bissau', 'Gambia', 'Sierra Leone', 'Liberia'],
    region: ['Mali', 'Burkina Faso', 'Niger', 'Mauritania'],
  },
  {
    id: 'ccg', name: 'Conseil de coopération du Golfe', short: 'CCG', icon: '🐪', market: 0.05, relations: 12,
    desc: 'Monarchies du Golfe : union douanière et projets communs.',
    members: ['Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Oman', 'Bahrain'],
    region: ['Yemen', 'Iraq', 'Jordan'],
  },
  {
    id: 'brics', name: 'BRICS', short: 'BRICS', icon: '🧱', market: 0.03, relations: 8,
    desc: 'Les grandes économies émergentes, alternative aux institutions occidentales.',
    members: ['Brazil', 'Russia', 'India', 'China', 'South Africa', 'Egypt', 'Ethiopia', 'Iran', 'United Arab Emirates', 'Indonesia'],
    region: ['Saudi Arabia', 'Algeria', 'Nigeria', 'Turkey', 'Mexico', 'Argentina', 'Vietnam', 'Thailand', 'Malaysia', 'Kazakhstan', 'Belarus', 'Bolivia', 'Cuba', 'Uganda', 'Uzbekistan'],
  },
];
