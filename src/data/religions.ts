/** Confessions jouables. Deux confessions d'une même famille se tolèrent mieux. */
export type Religion =
  | 'catholique'
  | 'protestant'
  | 'evangelique'
  | 'orthodoxe'
  | 'sunnite'
  | 'chiite'
  | 'juif'
  | 'hindou'
  | 'bouddhiste'
  | 'traditionnel'
  | 'secularise';

export type Family = 'chretien' | 'musulman' | 'juif' | 'dharmique' | 'autre';

export const RELIGIONS: Record<Religion, { name: string; adj: string; family: Family; color: string; icon: string }> = {
  catholique: { name: 'Catholicisme', adj: 'catholique', family: 'chretien', color: '#d9b44a', icon: '✝️' },
  protestant: { name: 'Protestantisme', adj: 'protestante', family: 'chretien', color: '#5b8fd6', icon: '✝️' },
  evangelique: { name: 'Évangélisme', adj: 'évangélique', family: 'chretien', color: '#8fc1e8', icon: '✝️' },
  orthodoxe: { name: 'Orthodoxie', adj: 'orthodoxe', family: 'chretien', color: '#a262c9', icon: '☦️' },
  sunnite: { name: 'Islam sunnite', adj: 'sunnite', family: 'musulman', color: '#3f9b57', icon: '☪️' },
  chiite: { name: 'Islam chiite', adj: 'chiite', family: 'musulman', color: '#1f6b5a', icon: '☪️' },
  juif: { name: 'Judaïsme', adj: 'juive', family: 'juif', color: '#3a67b8', icon: '✡️' },
  hindou: { name: 'Hindouisme', adj: 'hindoue', family: 'dharmique', color: '#e07b2e', icon: '🕉️' },
  bouddhiste: { name: 'Bouddhisme', adj: 'bouddhiste', family: 'dharmique', color: '#e3c93f', icon: '☸️' },
  traditionnel: { name: 'Religions traditionnelles', adj: 'traditionnelle', family: 'autre', color: '#9a6b4a', icon: '🌿' },
  secularise: { name: 'Sécularisme', adj: 'sécularisée', family: 'autre', color: '#8a929c', icon: '⚛️' },
};

/**
 * Hostilité de base entre confessions (0 = aucune, 1 = maximale).
 * Sert au malus de relations et à l'agitation des minorités.
 */
export function religiousDistance(a: Religion, b: Religion): number {
  if (a === b) return 0;
  const fa = RELIGIONS[a].family;
  const fb = RELIGIONS[b].family;
  if (a === 'secularise' || b === 'secularise') return 0.3;
  if (fa === fb) return fa === 'musulman' ? 0.6 : 0.4; // schisme sunnite/chiite plus vif
  return 0.8;
}

/** Religion d'État (majoritaire) de chaque pays, par nom world-atlas. */
// prettier-ignore
export const STATE_RELIGION: Record<string, Religion> = {
  // Amériques
  'United States of America': 'protestant', Canada: 'catholique', Mexico: 'catholique', Cuba: 'secularise',
  Haiti: 'catholique', 'Dominican Rep.': 'catholique', Bahamas: 'protestant', Jamaica: 'protestant',
  'Trinidad and Tobago': 'catholique', Guatemala: 'evangelique', Belize: 'catholique', Honduras: 'evangelique',
  'El Salvador': 'catholique', Nicaragua: 'catholique', 'Costa Rica': 'catholique', Panama: 'catholique',
  Brazil: 'catholique', Argentina: 'catholique', Colombia: 'catholique', Chile: 'catholique', Peru: 'catholique',
  Venezuela: 'catholique', Ecuador: 'catholique', Bolivia: 'catholique', Paraguay: 'catholique', Uruguay: 'secularise',
  Guyana: 'protestant', Suriname: 'protestant', 'Puerto Rico': 'catholique',
  // Europe
  Germany: 'secularise', 'United Kingdom': 'secularise', France: 'secularise', Italy: 'catholique', Spain: 'catholique',
  Netherlands: 'secularise', Switzerland: 'catholique', Poland: 'catholique', Belgium: 'catholique', Sweden: 'secularise',
  Ireland: 'catholique', Austria: 'catholique', Norway: 'protestant', Denmark: 'protestant', Czechia: 'secularise',
  Portugal: 'catholique', Romania: 'orthodoxe', Finland: 'protestant', Greece: 'orthodoxe', Hungary: 'catholique',
  Slovakia: 'catholique', Bulgaria: 'orthodoxe', Croatia: 'catholique', Luxembourg: 'catholique', Lithuania: 'catholique',
  Slovenia: 'catholique', Latvia: 'protestant', Estonia: 'secularise', Serbia: 'orthodoxe', 'Bosnia and Herz.': 'sunnite',
  Albania: 'sunnite', Macedonia: 'orthodoxe', Montenegro: 'orthodoxe', Kosovo: 'sunnite', Moldova: 'orthodoxe',
  Belarus: 'orthodoxe', Ukraine: 'orthodoxe', Russia: 'orthodoxe', Iceland: 'protestant', Cyprus: 'orthodoxe',
  'N. Cyprus': 'sunnite', Malta: 'catholique',
  // Moyen-Orient & Afrique du Nord
  Turkey: 'sunnite', 'Saudi Arabia': 'sunnite', Israel: 'juif', 'United Arab Emirates': 'sunnite', Iran: 'chiite',
  Iraq: 'chiite', Qatar: 'sunnite', Kuwait: 'sunnite', Oman: 'sunnite', Jordan: 'sunnite', Lebanon: 'chiite',
  Syria: 'sunnite', Palestine: 'sunnite', Yemen: 'sunnite', Egypt: 'sunnite', Algeria: 'sunnite', Morocco: 'sunnite',
  Tunisia: 'sunnite', Libya: 'sunnite', 'W. Sahara': 'sunnite', Bahrain: 'chiite',
  // Afrique subsaharienne
  Nigeria: 'sunnite', 'South Africa': 'protestant', Ethiopia: 'orthodoxe', Kenya: 'protestant', Tanzania: 'catholique',
  Angola: 'catholique', "Côte d'Ivoire": 'sunnite', Ghana: 'evangelique', 'Dem. Rep. Congo': 'catholique',
  Uganda: 'catholique', Cameroon: 'catholique', Sudan: 'sunnite', 'S. Sudan': 'catholique', Senegal: 'sunnite',
  Zambia: 'protestant', Zimbabwe: 'evangelique', Mozambique: 'catholique', Mali: 'sunnite', 'Burkina Faso': 'sunnite',
  Niger: 'sunnite', Chad: 'sunnite', Guinea: 'sunnite', Benin: 'catholique', Rwanda: 'catholique', Burundi: 'catholique',
  Somalia: 'sunnite', Somaliland: 'sunnite', Madagascar: 'protestant', Malawi: 'protestant', Togo: 'catholique',
  'Sierra Leone': 'sunnite', Liberia: 'evangelique', 'Guinea-Bissau': 'sunnite', Gambia: 'sunnite', Mauritania: 'sunnite',
  'Central African Rep.': 'catholique', Congo: 'catholique', Gabon: 'catholique', 'Eq. Guinea': 'catholique',
  Namibia: 'protestant', Botswana: 'protestant', Lesotho: 'catholique', eSwatini: 'evangelique', Eritrea: 'orthodoxe',
  Djibouti: 'sunnite',
  // Asie
  India: 'hindou', Pakistan: 'sunnite', Bangladesh: 'sunnite', 'Sri Lanka': 'bouddhiste', Nepal: 'hindou',
  Bhutan: 'bouddhiste', Afghanistan: 'sunnite', Kazakhstan: 'sunnite', Uzbekistan: 'sunnite', Turkmenistan: 'sunnite',
  Kyrgyzstan: 'sunnite', Tajikistan: 'sunnite', Mongolia: 'bouddhiste', Armenia: 'orthodoxe', Azerbaijan: 'chiite',
  Georgia: 'orthodoxe', China: 'secularise', Japan: 'bouddhiste', 'South Korea': 'secularise', 'North Korea': 'secularise',
  Taiwan: 'bouddhiste', Indonesia: 'sunnite', Thailand: 'bouddhiste', Vietnam: 'secularise', Philippines: 'catholique',
  Malaysia: 'sunnite', Myanmar: 'bouddhiste', Cambodia: 'bouddhiste', Laos: 'bouddhiste', Brunei: 'sunnite',
  'Timor-Leste': 'catholique', Singapore: 'bouddhiste',
  // Océanie
  Australia: 'secularise', 'New Zealand': 'secularise', 'Papua New Guinea': 'evangelique', Fiji: 'protestant',
  'Solomon Is.': 'protestant', Vanuatu: 'protestant', 'New Caledonia': 'catholique', Greenland: 'protestant',
  'Falkland Is.': 'protestant',
};

/**
 * Minorités régionales : religion d'une province différente de la religion d'État.
 * Clé = pays (nom atlas), valeur = { nom de province (Natural Earth admin-1, ou région regroupée) : religion }.
 * Les noms qui ne correspondent à aucune province sont ignorés (voir tests).
 */
// prettier-ignore
export const REGIONAL_RELIGION: Record<string, Record<string, Religion>> = {
  Nigeria: {
    Lagos: 'evangelique', Ogun: 'evangelique', Oyo: 'evangelique', Osun: 'evangelique', Ondo: 'evangelique', Ekiti: 'evangelique',
    Edo: 'evangelique', Delta: 'evangelique', Rivers: 'evangelique', Bayelsa: 'evangelique', 'Akwa Ibom': 'evangelique',
    'Cross River': 'evangelique', Anambra: 'catholique', Enugu: 'catholique', Imo: 'catholique', Abia: 'catholique',
    Ebonyi: 'catholique', Benue: 'catholique', Plateau: 'evangelique', Taraba: 'evangelique', Kogi: 'evangelique',
  },
  Lebanon: { 'Mount Lebanon': 'catholique', 'Mont-Liban': 'catholique', Beirut: 'sunnite', 'North Lebanon': 'sunnite', 'Akkar': 'sunnite' },
  Iraq: {
    'Al-Anbar': 'sunnite', 'Al Anbar': 'sunnite', Ninawa: 'sunnite', Nineveh: 'sunnite', 'Sala ad-Din': 'sunnite', 'Salah ad-Din': 'sunnite',
    Kirkuk: 'sunnite', Arbil: 'sunnite', Erbil: 'sunnite', Dihok: 'sunnite', Duhok: 'sunnite', 'As-Sulaymaniyah': 'sunnite', Sulaymaniyah: 'sunnite',
  },
  Syria: { Latakia: 'chiite', Tartus: 'chiite', Lattakia: 'chiite' },
  Yemen: { "Sa`dah": 'chiite', "Sa'dah": 'chiite', "Amanat Al Asimah": 'chiite', "Sana'a": 'chiite', 'Hajjah': 'chiite', 'Amran': 'chiite', 'Dhamar': 'chiite' },
  'Saudi Arabia': { 'Ash Sharqiyah': 'chiite', 'Eastern Province': 'chiite' },
  India: {
    'Jammu and Kashmir': 'sunnite', Punjab: 'hindou', Kerala: 'hindou', Nagaland: 'protestant', Mizoram: 'protestant',
    Meghalaya: 'protestant', Goa: 'catholique', Sikkim: 'bouddhiste', Ladakh: 'bouddhiste',
  },
  Pakistan: {},
  'Bosnia and Herz.': { 'Republika Srpska': 'orthodoxe', 'Serb Republic': 'orthodoxe' },
  Macedonia: {},
  Ethiopia: { Somali: 'sunnite', Afar: 'sunnite', Oromia: 'sunnite', Harari: 'sunnite' },
  Sudan: {},
  'Côte d\'Ivoire': { Abidjan: 'catholique', Lagunes: 'catholique', Lacs: 'catholique', Yamoussoukro: 'catholique' },
  Cameroon: { 'Extrême-Nord': 'sunnite', Nord: 'sunnite', Adamaoua: 'sunnite' },
  Chad: { Logone: 'catholique', 'Logone Occidental': 'catholique', 'Logone Oriental': 'catholique', 'Moyen-Chari': 'catholique', Mandoul: 'catholique', 'Mayo-Kebbi Est': 'catholique' },
  Tanzania: { Zanzibar: 'sunnite', 'Zanzibar North': 'sunnite', 'Zanzibar South and Central': 'sunnite', 'Zanzibar West': 'sunnite', Pemba: 'sunnite', 'Pemba North': 'sunnite', 'Pemba South': 'sunnite', Tanga: 'sunnite', 'Pwani': 'sunnite' },
  Kenya: { 'North Eastern': 'sunnite', Coast: 'sunnite', Mombasa: 'sunnite', Garissa: 'sunnite', Wajir: 'sunnite', Mandera: 'sunnite', Lamu: 'sunnite' },
  Mozambique: { Nampula: 'sunnite', 'Cabo Delgado': 'sunnite', Niassa: 'sunnite' },
  Philippines: { 'Autonomous Region in Muslim Mindanao': 'sunnite', 'Bangsamoro': 'sunnite', Lanao: 'sunnite', 'Lanao del Sur': 'sunnite', Maguindanao: 'sunnite', Sulu: 'sunnite', 'Tawi-Tawi': 'sunnite', Basilan: 'sunnite' },
  Thailand: { Pattani: 'sunnite', Yala: 'sunnite', Narathiwat: 'sunnite' },
  Indonesia: { Bali: 'hindou', 'Nusa Tenggara Timur': 'catholique', Papua: 'protestant', 'Papua Barat': 'protestant', 'Sulawesi Utara': 'protestant', Maluku: 'protestant' },
  Malaysia: { Sarawak: 'protestant', Sabah: 'catholique' },
  Myanmar: { Rakhine: 'bouddhiste', Kachin: 'protestant', Chin: 'protestant' },
  China: { Xinjiang: 'sunnite', Ningxia: 'sunnite', Xizang: 'bouddhiste', Tibet: 'bouddhiste', Qinghai: 'bouddhiste', 'Inner Mongol': 'bouddhiste' },
  Russia: {
    Chechnya: 'sunnite', Dagestan: 'sunnite', Ingush: 'sunnite', Ingushetia: 'sunnite', 'Kabardin-Balkar': 'sunnite',
    'Karachay-Cherkess': 'sunnite', Tatarstan: 'sunnite', Bashkortostan: 'sunnite', Buryat: 'bouddhiste', Kalmyk: 'bouddhiste', Tuva: 'bouddhiste',
  },
  Georgia: { Ajaria: 'sunnite', Adjara: 'sunnite', Abkhazia: 'orthodoxe' },
  Azerbaijan: {},
  Cyprus: {},
  Israel: { 'West Bank': 'sunnite', Gaza: 'sunnite' },
  Egypt: {},
  'United Kingdom': { 'Northern Ireland': 'catholique', Scotland: 'protestant' },
  Germany: { Bayern: 'catholique', Bavaria: 'catholique', 'Baden-Württemberg': 'catholique', 'Nordrhein-Westfalen': 'catholique', Saarland: 'catholique', 'Rheinland-Pfalz': 'catholique' },
  Netherlands: { 'Noord-Brabant': 'catholique', Limburg: 'catholique' },
  Switzerland: {},
  'United States of America': {
    Texas: 'evangelique', Oklahoma: 'evangelique', Arkansas: 'evangelique', Louisiana: 'catholique', Mississippi: 'evangelique',
    Alabama: 'evangelique', Georgia: 'evangelique', Tennessee: 'evangelique', Kentucky: 'evangelique', 'South Carolina': 'evangelique',
    'North Carolina': 'evangelique', 'West Virginia': 'evangelique', Utah: 'protestant', 'New York': 'catholique',
    Massachusetts: 'catholique', 'Rhode Island': 'catholique', 'New Jersey': 'catholique', Connecticut: 'catholique',
    California: 'catholique', 'New Mexico': 'catholique', Vermont: 'secularise', Oregon: 'secularise', Washington: 'secularise',
  },
  Canada: { Ontario: 'secularise', 'British Columbia': 'secularise', Alberta: 'protestant', Manitoba: 'protestant', Saskatchewan: 'protestant' },
  Brazil: { 'Rio de Janeiro': 'evangelique', 'Espírito Santo': 'evangelique', Rondônia: 'evangelique', Acre: 'evangelique', Roraima: 'evangelique' },
  'South Korea': { Seoul: 'protestant', 'Gyeonggi-do': 'protestant' },
  Kazakhstan: { 'North Kazakhstan': 'orthodoxe', Kostanay: 'orthodoxe', 'East Kazakhstan': 'orthodoxe', Pavlodar: 'orthodoxe', Akmola: 'orthodoxe' },
  Ukraine: { "L'viv": 'catholique', 'Lviv': 'catholique', "Ivano-Frankivs'k": 'catholique', "Ternopil'": 'catholique', Crimea: 'orthodoxe' },
  Nepal: {},
  'Sri Lanka': { Northern: 'hindou', Eastern: 'hindou' },
  Uganda: {},
  'Dem. Rep. Congo': { 'Nord-Kivu': 'evangelique', 'Sud-Kivu': 'evangelique' },
  'Central African Rep.': { Vakaga: 'sunnite', 'Bamingui-Bangoran': 'sunnite', 'Haute-Kotto': 'sunnite' },
  'Guinea-Bissau': {},
  Albania: {},
  Montenegro: {},
  Kosovo: {},
  Serbia: { Vojvodina: 'catholique' },
  Romania: { Harghita: 'catholique', Covasna: 'catholique' },
  Spain: { Cataluña: 'secularise', 'País Vasco': 'catholique' },
  France: { Alsace: 'catholique', Bretagne: 'catholique', Corse: 'catholique', Guyane: 'catholique', 'Guyane française': 'catholique', Martinique: 'catholique', Guadeloupe: 'catholique', 'La Réunion': 'catholique', Mayotte: 'sunnite' },
  Australia: {},
  Senegal: { Ziguinchor: 'catholique' },
  Ghana: { Northern: 'sunnite', 'Upper East': 'sunnite', 'Upper West': 'sunnite' },
  Togo: { Savanes: 'sunnite', Kara: 'traditionnel' },
  Benin: { Borgou: 'sunnite', Alibori: 'sunnite', Donga: 'sunnite' },
  Eritrea: { 'Northern Red Sea': 'sunnite', 'Southern Red Sea': 'sunnite', 'Gash Barka': 'sunnite', Anseba: 'sunnite' },
  'S. Sudan': {},
  Vietnam: { 'Đồng Nai': 'catholique' },
  'Papua New Guinea': {},
};

/** Lieux saints : province (nom admin-1) → confessions qui la vénèrent. */
export const HOLY_SITES: { country: string; province: string[]; name: string; religions: Religion[] }[] = [
  { country: 'Israel', province: ['Jerusalem', 'Jerusalem District'], name: 'Jérusalem', religions: ['juif', 'catholique', 'orthodoxe', 'protestant', 'evangelique', 'sunnite'] },
  { country: 'Saudi Arabia', province: ['Makkah', 'Mecca'], name: 'La Mecque', religions: ['sunnite', 'chiite'] },
  { country: 'Saudi Arabia', province: ['Al Madinah', 'Medina'], name: 'Médine', religions: ['sunnite'] },
  { country: 'Iraq', province: ['An-Najaf', 'Najaf', 'Karbala\''], name: 'Najaf et Karbala', religions: ['chiite'] },
  { country: 'Iran', province: ['Qom', 'Razavi Khorasan'], name: 'Qom et Mashhad', religions: ['chiite'] },
  { country: 'Italy', province: ['Lazio'], name: 'Rome', religions: ['catholique'] },
  { country: 'Turkey', province: ['Istanbul'], name: 'Constantinople', religions: ['orthodoxe'] },
  { country: 'Russia', province: ['City of Moscow', 'Moscow City', 'Moskva'], name: 'Moscou, « troisième Rome »', religions: ['orthodoxe'] },
  { country: 'Ukraine', province: ['Kiev City', 'Kyiv City', 'Kiev'], name: 'Kiev', religions: ['orthodoxe'] },
  { country: 'Germany', province: ['Sachsen-Anhalt'], name: 'Wittenberg', religions: ['protestant', 'evangelique'] },
  { country: 'United States of America', province: ['Texas'], name: 'La « Bible Belt »', religions: ['evangelique'] },
  { country: 'India', province: ['Uttar Pradesh'], name: 'Varanasi et Ayodhya', religions: ['hindou'] },
  { country: 'India', province: ['Bihar'], name: 'Bodh-Gaya', religions: ['bouddhiste'] },
  { country: 'China', province: ['Xizang', 'Tibet'], name: 'Lhassa', religions: ['bouddhiste'] },
  { country: 'Japan', province: ['Kyoto', 'Kyōto'], name: 'Kyoto', religions: ['bouddhiste'] },
  { country: 'Nepal', province: ['Lumbini', 'Western'], name: 'Lumbini', religions: ['bouddhiste'] },
];
