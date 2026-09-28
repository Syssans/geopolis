/** Marchandises produites par les provinces (prix de base en Md$ par point de développement et par an). */
export type Good =
  | 'petrole'
  | 'gaz'
  | 'cereales'
  | 'tropicaux'
  | 'metaux'
  | 'terres_rares'
  | 'puces'
  | 'industrie'
  | 'textile'
  | 'finance'
  | 'peche';

export const GOODS: Record<Good, { name: string; icon: string; price: number; volatility: number }> = {
  petrole: { name: 'Pétrole', icon: '🛢️', price: 1.6, volatility: 0.12 },
  gaz: { name: 'Gaz naturel', icon: '🔥', price: 1.3, volatility: 0.12 },
  cereales: { name: 'Céréales', icon: '🌾', price: 0.8, volatility: 0.06 },
  tropicaux: { name: 'Café et cacao', icon: '☕', price: 0.9, volatility: 0.08 },
  metaux: { name: 'Métaux', icon: '⛏️', price: 1.1, volatility: 0.07 },
  terres_rares: { name: 'Terres rares', icon: '🧲', price: 1.5, volatility: 0.1 },
  puces: { name: 'Semi-conducteurs', icon: '💾', price: 1.8, volatility: 0.08 },
  industrie: { name: 'Biens industriels', icon: '🏭', price: 1.2, volatility: 0.04 },
  textile: { name: 'Textile', icon: '🧵', price: 0.8, volatility: 0.04 },
  finance: { name: 'Services financiers', icon: '🏦', price: 1.4, volatility: 0.05 },
  peche: { name: 'Pêche', icon: '🐟', price: 0.7, volatility: 0.05 },
};

/**
 * Productions typiques par pays (nom atlas). Les provinces tirent leur marchandise dans
 * cette liste (la plus développée prend la première). Les pays absents utilisent REGION_GOODS.
 */
// prettier-ignore
export const COUNTRY_GOODS: Record<string, Good[]> = {
  'United States of America': ['finance', 'puces', 'industrie', 'petrole', 'cereales', 'gaz'],
  Canada: ['petrole', 'metaux', 'cereales', 'industrie', 'finance'],
  Mexico: ['industrie', 'petrole', 'cereales', 'metaux'],
  Brazil: ['cereales', 'metaux', 'petrole', 'tropicaux', 'industrie'],
  Argentina: ['cereales', 'gaz', 'metaux'],
  Chile: ['metaux', 'peche', 'cereales'],
  Peru: ['metaux', 'peche'],
  Venezuela: ['petrole'],
  Colombia: ['petrole', 'tropicaux', 'metaux'],
  Ecuador: ['petrole', 'tropicaux', 'peche'],
  Bolivia: ['gaz', 'metaux'],
  'Trinidad and Tobago': ['gaz'],
  Guyana: ['petrole'],
  Germany: ['industrie', 'finance', 'puces'],
  'United Kingdom': ['finance', 'industrie', 'petrole'],
  France: ['industrie', 'finance', 'cereales'],
  Italy: ['industrie', 'textile', 'finance'],
  Spain: ['industrie', 'cereales', 'finance'],
  Netherlands: ['finance', 'puces', 'gaz'],
  Switzerland: ['finance'],
  Luxembourg: ['finance'],
  Ireland: ['finance', 'puces'],
  Norway: ['petrole', 'gaz', 'peche'],
  Poland: ['industrie', 'cereales'],
  Ukraine: ['cereales', 'metaux', 'industrie'],
  Russia: ['petrole', 'gaz', 'metaux', 'cereales', 'industrie'],
  Kazakhstan: ['petrole', 'metaux', 'cereales'],
  Azerbaijan: ['petrole', 'gaz'],
  Turkmenistan: ['gaz'],
  Uzbekistan: ['gaz', 'textile'],
  Turkey: ['textile', 'industrie'],
  'Saudi Arabia': ['petrole'],
  Iraq: ['petrole'],
  Iran: ['petrole', 'gaz'],
  Kuwait: ['petrole'],
  Qatar: ['gaz'],
  'United Arab Emirates': ['petrole', 'finance'],
  Oman: ['petrole'],
  Bahrain: ['finance'],
  Israel: ['puces', 'finance'],
  Algeria: ['gaz', 'petrole'],
  Libya: ['petrole'],
  Egypt: ['gaz', 'textile', 'cereales'],
  Morocco: ['metaux', 'textile'],
  Nigeria: ['petrole', 'tropicaux', 'cereales'],
  Angola: ['petrole'],
  'Eq. Guinea': ['petrole'],
  Gabon: ['petrole'],
  Congo: ['petrole'],
  'Dem. Rep. Congo': ['metaux', 'terres_rares'],
  Zambia: ['metaux'],
  'South Africa': ['metaux', 'finance', 'industrie'],
  "Côte d'Ivoire": ['tropicaux'],
  Ghana: ['tropicaux', 'metaux'],
  Ethiopia: ['tropicaux', 'cereales'],
  Kenya: ['tropicaux'],
  Mozambique: ['gaz'],
  India: ['textile', 'industrie', 'cereales', 'finance', 'puces'],
  Pakistan: ['textile', 'cereales'],
  Bangladesh: ['textile'],
  China: ['industrie', 'puces', 'terres_rares', 'textile', 'cereales', 'metaux', 'finance'],
  Japan: ['industrie', 'puces', 'finance'],
  'South Korea': ['puces', 'industrie'],
  Taiwan: ['puces'],
  Singapore: ['finance'],
  Vietnam: ['textile', 'industrie'],
  Thailand: ['industrie', 'cereales'],
  Malaysia: ['puces', 'petrole'],
  Indonesia: ['metaux', 'tropicaux', 'gaz', 'textile'],
  Philippines: ['puces', 'tropicaux'],
  Myanmar: ['terres_rares', 'gaz'],
  Mongolia: ['metaux'],
  Australia: ['metaux', 'gaz', 'cereales', 'finance'],
  'New Zealand': ['cereales', 'peche'],
};

/** Productions par défaut selon la latitude/région du centroïde de la province. */
export const REGION_GOODS = {
  tropical: ['tropicaux', 'cereales', 'metaux'] as Good[],
  aride: ['metaux', 'cereales'] as Good[],
  tempere: ['cereales', 'industrie'] as Good[],
  froid: ['metaux', 'peche'] as Good[],
};

/** Provinces particulières (nom admin-1 → marchandise). */
// prettier-ignore
export const PROVINCE_GOODS: Record<string, Good> = {
  Texas: 'petrole', Alaska: 'petrole', 'North Dakota': 'petrole', California: 'puces', 'New York': 'finance', Iowa: 'cereales', Kansas: 'cereales',
  Alberta: 'petrole', Ontario: 'industrie', Quebec: 'metaux', 'Québec': 'metaux',
  'Ash Sharqiyah': 'petrole', 'Eastern Province': 'petrole', Riyadh: 'finance', Khuzestan: 'petrole', 'Tehran': 'industrie',
  Basrah: 'petrole', 'Al-Basrah': 'petrole', Kirkuk: 'petrole', Zulia: 'petrole', Rivers: 'petrole', Delta: 'petrole', Bayelsa: 'petrole', Lagos: 'finance',
  'Khanty-Mansiy': 'petrole', 'Yamal-Nenets': 'gaz', 'City of Moscow': 'finance', 'Moscow City': 'finance', 'City of St. Petersburg': 'industrie',
  'Île-de-France': 'finance', 'Greater London': 'finance', London: 'finance', Hessen: 'finance', 'Bayern': 'industrie', 'Baden-Württemberg': 'industrie',
  Lombardia: 'finance', Shanghai: 'finance', Guangdong: 'puces', Beijing: 'finance', Jiangsu: 'industrie', 'Nei Mongol': 'terres_rares', 'Inner Mongol': 'terres_rares',
  Tokyo: 'finance', Maharashtra: 'finance', Karnataka: 'puces', 'Tamil Nadu': 'industrie', Punjab: 'cereales',
  Katanga: 'metaux', 'Haut-Katanga': 'metaux', Lualaba: 'metaux', 'Western Australia': 'metaux', Queensland: 'gaz', 'New South Wales': 'finance',
  'São Paulo': 'finance', 'Mato Grosso': 'cereales', 'Rio de Janeiro': 'petrole', Pará: 'metaux', 'Minas Gerais': 'metaux',
  Antofagasta: 'metaux', Atyrau: 'petrole', Mangghystau: 'petrole', Cabinda: 'petrole',
};

export interface TradeNode {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** Nœuds en aval (la valeur non collectée y est dirigée). Vide = nœud terminal. */
  out: string[];
}

/** Réseau commercial mondial. La richesse circule vers trois grands pôles : Manche, New York, Shanghai. */
export const TRADE_NODES: TradeNode[] = [
  { id: 'andes', name: 'Andes', lon: -72, lat: -15, out: ['panama', 'californie'] },
  { id: 'plata', name: 'Río de la Plata', lon: -60, lat: -34, out: ['bresil'] },
  { id: 'bresil', name: 'Brésil', lon: -47, lat: -15, out: ['caraibes', 'afrique_ouest'] },
  { id: 'caraibes', name: 'Caraïbes', lon: -70, lat: 12, out: ['panama', 'golfe_mexique'] },
  { id: 'panama', name: 'Panama', lon: -80, lat: 9, out: ['golfe_mexique', 'californie'] },
  { id: 'golfe_mexique', name: 'Golfe du Mexique', lon: -95, lat: 25, out: ['new_york'] },
  { id: 'californie', name: 'Californie', lon: -118, lat: 36, out: ['new_york', 'japon'] },
  { id: 'grands_lacs', name: 'Grands Lacs', lon: -88, lat: 45, out: ['new_york'] },
  { id: 'new_york', name: 'New York', lon: -74, lat: 41, out: [] },
  { id: 'afrique_ouest', name: "Golfe de Guinée", lon: 3, lat: 5, out: ['manche'] },
  { id: 'afrique_australe', name: 'Le Cap', lon: 22, lat: -28, out: ['afrique_ouest', 'ocean_indien'] },
  { id: 'afrique_est', name: 'Afrique de l’Est', lon: 37, lat: -2, out: ['aden'] },
  { id: 'ocean_indien', name: 'Océan Indien', lon: 75, lat: 15, out: ['aden', 'malacca'] },
  { id: 'aden', name: 'Golfe d’Aden', lon: 44, lat: 13, out: ['suez'] },
  { id: 'ormuz', name: 'Golfe Persique', lon: 52, lat: 27, out: ['ocean_indien', 'aden'] },
  { id: 'asie_centrale', name: 'Asie centrale', lon: 66, lat: 42, out: ['russie', 'shanghai'] },
  { id: 'russie', name: 'Russie', lon: 50, lat: 58, out: ['baltique', 'mer_noire'] },
  { id: 'mer_noire', name: 'Mer Noire', lon: 34, lat: 44, out: ['mediterranee'] },
  { id: 'suez', name: 'Suez', lon: 32, lat: 30, out: ['mediterranee'] },
  { id: 'mediterranee', name: 'Méditerranée', lon: 12, lat: 40, out: ['manche'] },
  { id: 'baltique', name: 'Baltique', lon: 20, lat: 56, out: ['manche'] },
  { id: 'manche', name: 'Manche', lon: 2, lat: 51, out: [] },
  { id: 'malacca', name: 'Malacca', lon: 102, lat: 3, out: ['shanghai'] },
  { id: 'australie', name: 'Australie', lon: 134, lat: -25, out: ['malacca', 'japon'] },
  { id: 'japon', name: 'Japon', lon: 138, lat: 36, out: ['shanghai'] },
  { id: 'shanghai', name: 'Shanghai', lon: 121, lat: 31, out: [] },
];

/**
 * Détroits stratégiques : un lien commercial passe par une province.
 * Son propriétaire peut percevoir un péage ou le bloquer (la valeur ne passe plus).
 */
export const STRAITS: { id: string; name: string; from: string; to: string; country: string; province: string[] }[] = [
  { id: 'ormuz', name: "Détroit d'Ormuz", from: 'ormuz', to: '*', country: 'Iran', province: ['Hormozgan'] },
  { id: 'bab', name: 'Bab-el-Mandeb', from: 'aden', to: 'suez', country: 'Yemen', province: ['Ta`izz', "Ta'izz", 'Taizz', 'Lahij'] },
  { id: 'suez', name: 'Canal de Suez', from: 'suez', to: 'mediterranee', country: 'Egypt', province: ['As Suways', 'Suez', 'Al Isma`iliyah', 'Ismailia'] },
  { id: 'malacca', name: 'Détroit de Malacca', from: 'malacca', to: 'shanghai', country: 'Malaysia', province: ['Melaka', 'Johor'] },
  { id: 'panama', name: 'Canal de Panama', from: 'panama', to: '*', country: 'Panama', province: ['Panamá', 'Colón', 'Panama'] },
  { id: 'bosphore', name: 'Bosphore', from: 'mer_noire', to: 'mediterranee', country: 'Turkey', province: ['Istanbul'] },
  { id: 'gibraltar', name: 'Gibraltar', from: 'mediterranee', to: 'manche', country: 'Spain', province: ['Cádiz', 'Andalucía'] },
  { id: 'danois', name: 'Détroits danois', from: 'baltique', to: 'manche', country: 'Denmark', province: ['Hovedstaden', 'Sjælland'] },
];
