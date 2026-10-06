/**
 * Noms des océans et des mers, écrits le long de leur axe (à la manière des globes anciens),
 * dans la langue et l'alphabet du pays joué.
 */
export type Lang = 'fr' | 'en' | 'es' | 'pt' | 'de' | 'it' | 'ru' | 'uk' | 'ar' | 'fa' | 'ur' | 'he' | 'tr' | 'zh' | 'ja' | 'ko' | 'hi' | 'vi' | 'id' | 'el';

const LANGS: Lang[] = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ru', 'uk', 'ar', 'fa', 'ur', 'he', 'tr', 'zh', 'ja', 'ko', 'hi', 'vi', 'id', 'el'];

// prettier-ignore
const NAMES: Record<string, string> = {
  atlantic: 'Océan Atlantique|Atlantic Ocean|Océano Atlántico|Oceano Atlântico|Atlantischer Ozean|Oceano Atlantico|Атлантический океан|Атлантичний океан|المحيط الأطلسي|اقیانوس اطلس|بحر اوقیانوس|האוקיינוס האטלנטי|Atlas Okyanusu|大西洋|大西洋|대서양|अटलांटिक महासागर|Đại Tây Dương|Samudra Atlantik|Ατλαντικός Ωκεανός',
  pacific: 'Océan Pacifique|Pacific Ocean|Océano Pacífico|Oceano Pacífico|Pazifischer Ozean|Oceano Pacifico|Тихий океан|Тихий океан|المحيط الهادئ|اقیانوس آرام|بحر الکاہل|האוקיינוס השקט|Büyük Okyanus|太平洋|太平洋|태평양|प्रशांत महासागर|Thái Bình Dương|Samudra Pasifik|Ειρηνικός Ωκεανός',
  indian: 'Océan Indien|Indian Ocean|Océano Índico|Oceano Índico|Indischer Ozean|Oceano Indiano|Индийский океан|Індійський океан|المحيط الهندي|اقیانوس هند|بحر ہند|האוקיינוס ההודי|Hint Okyanusu|印度洋|インド洋|인도양|हिंद महासागर|Ấn Độ Dương|Samudra Hindia|Ινδικός Ωκεανός',
  arctic: 'Océan Arctique|Arctic Ocean|Océano Ártico|Oceano Ártico|Arktischer Ozean|Oceano Artico|Северный Ледовитый океан|Північний Льодовитий океан|المحيط المتجمد الشمالي|اقیانوس منجمد شمالی|بحر منجمد شمالی|הים הארקטי|Arktik Okyanusu|北冰洋|北極海|북극해|आर्कटिक महासागर|Bắc Băng Dương|Samudra Arktik|Αρκτικός Ωκεανός',
  southern: 'Océan Austral|Southern Ocean|Océano Antártico|Oceano Antártico|Südlicher Ozean|Oceano Antartico|Южный океан|Південний океан|المحيط الجنوبي|اقیانوس منجمد جنوبی|بحر منجمد جنوبی|האוקיינוס הדרומי|Güney Okyanusu|南冰洋|南極海|남극해|दक्षिणी महासागर|Nam Đại Dương|Samudra Selatan|Νότιος Ωκεανός',
  med: 'Mer Méditerranée|Mediterranean Sea|Mar Mediterráneo|Mar Mediterrâneo|Mittelmeer|Mar Mediterraneo|Средиземное море|Середземне море|البحر الأبيض المتوسط|دریای مدیترانه|بحیرہ روم|הים התיכון|Akdeniz|地中海|地中海|지중해|भूमध्य सागर|Địa Trung Hải|Laut Tengah|Μεσόγειος Θάλασσα',
  black: 'Mer Noire|Black Sea|Mar Negro|Mar Negro|Schwarzes Meer|Mar Nero|Чёрное море|Чорне море|البحر الأسود|دریای سیاه|بحیرہ اسود|הים השחור|Karadeniz|黑海|黒海|흑해|काला सागर|Biển Đen|Laut Hitam|Μαύρη Θάλασσα',
  caspian: 'Mer Caspienne|Caspian Sea|Mar Caspio|Mar Cáspio|Kaspisches Meer|Mar Caspio|Каспийское море|Каспійське море|بحر قزوين|دریای خزر|بحیرہ قزوین|הים הכספי|Hazar Denizi|里海|カスピ海|카스피해|कैस्पियन सागर|Biển Caspi|Laut Kaspia|Κασπία Θάλασσα',
  red: 'Mer Rouge|Red Sea|Mar Rojo|Mar Vermelho|Rotes Meer|Mar Rosso|Красное море|Червоне море|البحر الأحمر|دریای سرخ|بحیرہ احمر|הים האדום|Kızıldeniz|红海|紅海|홍해|लाल सागर|Biển Đỏ|Laut Merah|Ερυθρά Θάλασσα',
  gulf: 'Golfe Persique|Persian Gulf|Golfo Pérsico|Golfo Pérsico|Persischer Golf|Golfo Persico|Персидский залив|Перська затока|الخليج العربي|خلیج فارس|خلیج فارس|המפרץ הפרסי|Basra Körfezi|波斯湾|ペルシア湾|페르시아만|फ़ारस की खाड़ी|Vịnh Ba Tư|Teluk Persia|Περσικός Κόλπος',
  arabian: 'Mer d’Arabie|Arabian Sea|Mar Arábigo|Mar Arábico|Arabisches Meer|Mar Arabico|Аравийское море|Аравійське море|بحر العرب|دریای عرب|بحیرہ عرب|הים הערבי|Umman Denizi|阿拉伯海|アラビア海|아라비아해|अरब सागर|Biển Ả Rập|Laut Arab|Αραβική Θάλασσα',
  bengal: 'Golfe du Bengale|Bay of Bengal|Golfo de Bengala|Golfo de Bengala|Golf von Bengalen|Golfo del Bengala|Бенгальский залив|Бенгальська затока|خليج البنغال|خلیج بنگال|خلیج بنگال|מפרץ בנגל|Bengal Körfezi|孟加拉湾|ベンガル湾|벵골만|बंगाल की खाड़ी|Vịnh Bengal|Teluk Benggala|Κόλπος της Βεγγάλης',
  scs: 'Mer de Chine méridionale|South China Sea|Mar de la China Meridional|Mar da China Meridional|Südchinesisches Meer|Mar Cinese Meridionale|Южно-Китайское море|Південнокитайське море|بحر الصين الجنوبي|دریای چین جنوبی|بحیرہ جنوبی چین|ים סין הדרומי|Güney Çin Denizi|南海|南シナ海|남중국해|दक्षिण चीन सागर|Biển Đông|Laut Cina Selatan|Νότια Σινική Θάλασσα',
  japan: 'Mer du Japon|Sea of Japan|Mar del Japón|Mar do Japão|Japanisches Meer|Mar del Giappone|Японское море|Японське море|بحر اليابان|دریای ژاپن|بحیرہ جاپان|ים יפן|Japon Denizi|日本海|日本海|동해|जापान सागर|Biển Nhật Bản|Laut Jepang|Θάλασσα της Ιαπωνίας',
  carib: 'Mer des Caraïbes|Caribbean Sea|Mar Caribe|Mar do Caribe|Karibisches Meer|Mar dei Caraibi|Карибское море|Карибське море|البحر الكاريبي|دریای کارائیب|بحیرہ کیریبین|הים הקריבי|Karayip Denizi|加勒比海|カリブ海|카리브해|कैरिबियन सागर|Biển Caribe|Laut Karibia|Καραϊβική Θάλασσα',
  mexico: 'Golfe du Mexique|Gulf of Mexico|Golfo de México|Golfo do México|Golf von Mexiko|Golfo del Messico|Мексиканский залив|Мексиканська затока|خليج المكسيك|خلیج مکزیک|خلیج میکسیکو|מפרץ מקסיקו|Meksika Körfezi|墨西哥湾|メキシコ湾|멕시코만|मेक्सिको की खाड़ी|Vịnh Mexico|Teluk Meksiko|Κόλπος του Μεξικού',
  north: 'Mer du Nord|North Sea|Mar del Norte|Mar do Norte|Nordsee|Mare del Nord|Северное море|Північне море|بحر الشمال|دریای شمال|بحیرہ شمال|הים הצפוני|Kuzey Denizi|北海|北海|북해|उत्तरी सागर|Biển Bắc|Laut Utara|Βόρεια Θάλασσα',
  baltic: 'Mer Baltique|Baltic Sea|Mar Báltico|Mar Báltico|Ostsee|Mar Baltico|Балтийское море|Балтійське море|بحر البلطيق|دریای بالتیک|بحیرہ بالٹک|הים הבלטי|Baltık Denizi|波罗的海|バルト海|발트해|बाल्टिक सागर|Biển Baltic|Laut Baltik|Βαλτική Θάλασσα',
  guinea: 'Golfe de Guinée|Gulf of Guinea|Golfo de Guinea|Golfo da Guiné|Golf von Guinea|Golfo di Guinea|Гвинейский залив|Гвінейська затока|خليج غينيا|خلیج گینه|خلیج گنی|מפרץ גינאה|Gine Körfezi|几内亚湾|ギニア湾|기니만|गिनी की खाड़ी|Vịnh Guinea|Teluk Guinea|Κόλπος της Γουινέας',
  bering: 'Mer de Béring|Bering Sea|Mar de Bering|Mar de Bering|Beringmeer|Mare di Bering|Берингово море|Берингове море|بحر بيرينغ|دریای برینگ|بحیرہ بیرنگ|ים ברינג|Bering Denizi|白令海|ベーリング海|베링해|बेरिंग सागर|Biển Bering|Laut Bering|Βερίγγειος Θάλασσα',
  tasman: 'Mer de Tasman|Tasman Sea|Mar de Tasmania|Mar da Tasmânia|Tasmansee|Mar di Tasman|Тасманово море|Тасманове море|بحر تسمان|دریای تاسمان|بحیرہ تسمان|ים טסמן|Tasman Denizi|塔斯曼海|タスマン海|태즈먼해|तस्मान सागर|Biển Tasman|Laut Tasman|Θάλασσα της Τασμανίας',
};

export interface SeaLabel {
  key: string;
  /** Axe du nom, d'ouest en est (lon, lat). */
  path: [number, number][];
  /** Taille du texte en unités de carte (la carte fait 1000 de large). */
  size: number;
  ocean?: boolean;
}

export const SEA_LABELS: SeaLabel[] = [
  { key: 'atlantic', path: [[-58, 26], [-42, 33], [-26, 42]], size: 13, ocean: true },
  { key: 'atlantic', path: [[-34, -12], [-22, -24], [-8, -34]], size: 13, ocean: true },
  { key: 'pacific', path: [[-168, 20], [-145, 12], [-122, 6]], size: 15, ocean: true },
  { key: 'pacific', path: [[-160, -22], [-130, -30], [-100, -32]], size: 13, ocean: true },
  { key: 'pacific', path: [[146, 28], [160, 22], [176, 16]], size: 11, ocean: true },
  { key: 'indian', path: [[58, -12], [78, -20], [100, -24]], size: 14, ocean: true },
  { key: 'arctic', path: [[-30, 80], [10, 83], [55, 82]], size: 11, ocean: true },
  { key: 'southern', path: [[-80, -60], [0, -61], [80, -60]], size: 12, ocean: true },
  { key: 'med', path: [[2, 38.5], [10, 37.2], [18, 34.5]], size: 4.2 },
  { key: 'black', path: [[30.2, 43.3], [35, 43.6], [39.5, 43]], size: 2.6 },
  { key: 'caspian', path: [[49.5, 45.5], [50.8, 42], [51.8, 38.8]], size: 2.1 },
  { key: 'red', path: [[34.5, 26], [37.5, 21], [40.8, 16.5]], size: 2.6 },
  { key: 'gulf', path: [[48.8, 28.6], [51.5, 27.4], [54.5, 26]], size: 1.9 },
  { key: 'arabian', path: [[57, 18], [63, 16], [69, 13]], size: 4.2 },
  { key: 'bengal', path: [[82.5, 16.5], [87.5, 15], [92.5, 13]], size: 3.6 },
  { key: 'scs', path: [[108.5, 15.5], [113, 12.5], [117.5, 9.5]], size: 3.2 },
  { key: 'japan', path: [[131, 38.5], [134.5, 40.5], [138, 42.5]], size: 2.6 },
  { key: 'carib', path: [[-83, 15.5], [-75, 14.6], [-66, 15]], size: 3.8 },
  { key: 'mexico', path: [[-96, 25.6], [-90.5, 25.8], [-84.5, 25]], size: 3.2 },
  { key: 'north', path: [[0.3, 58], [3, 56], [5.2, 54.5]], size: 1.9 },
  { key: 'baltic', path: [[15.2, 55.6], [18, 57.2], [19.4, 59.5]], size: 1.8 },
  { key: 'guinea', path: [[-4, 2.5], [2.5, 1.5], [8, 1.2]], size: 3.4 },
  { key: 'bering', path: [[-179, 58.5], [-174, 58], [-168.5, 57]], size: 2.4 },
  { key: 'tasman', path: [[152.5, -36.5], [158.5, -39], [165, -40.5]], size: 3 },
];

/** Nom d'une mer dans une langue. */
export function seaName(key: string, lang: Lang): string {
  return NAMES[key].split('|')[LANGS.indexOf(lang)] ?? NAMES[key].split('|')[1];
}

/** Langue principale de chaque pays (l'anglais pour les langues non couvertes, faute de mieux). */
// prettier-ignore
const LANG_OF: Record<Lang, string[]> = {
  fr: ['France', 'Belgium', 'Luxembourg', 'Switzerland', 'Haiti', "Côte d'Ivoire", 'Senegal', 'Mali', 'Burkina Faso', 'Niger', 'Guinea', 'Benin', 'Togo', 'Cameroon', 'Gabon', 'Congo', 'Dem. Rep. Congo', 'Central African Rep.', 'Chad', 'Madagascar', 'Burundi', 'Rwanda', 'Djibouti'],
  es: ['Spain', 'Mexico', 'Cuba', 'Dominican Rep.', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela', 'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay', 'Eq. Guinea'],
  pt: ['Portugal', 'Brazil', 'Angola', 'Mozambique', 'Guinea-Bissau', 'Timor-Leste'],
  de: ['Germany', 'Austria'],
  it: ['Italy'],
  ru: ['Russia', 'Belarus', 'Kazakhstan', 'Kyrgyzstan', 'Tajikistan', 'Serbia', 'Bulgaria', 'Macedonia', 'Montenegro', 'Mongolia', 'Bosnia and Herz.'],
  uk: ['Ukraine'],
  ar: ['Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Oman', 'Bahrain', 'Yemen', 'Iraq', 'Syria', 'Jordan', 'Lebanon', 'Palestine', 'Egypt', 'Libya', 'Tunisia', 'Algeria', 'Morocco', 'W. Sahara', 'Mauritania', 'Sudan', 'Somalia', 'Somaliland'],
  fa: ['Iran', 'Afghanistan'],
  ur: ['Pakistan'],
  he: ['Israel'],
  tr: ['Turkey', 'N. Cyprus', 'Azerbaijan', 'Turkmenistan'],
  zh: ['China', 'Taiwan'],
  ja: ['Japan'],
  ko: ['South Korea', 'North Korea'],
  hi: ['India', 'Nepal'],
  vi: ['Vietnam'],
  id: ['Indonesia', 'Malaysia', 'Brunei'],
  el: ['Greece', 'Cyprus'],
  en: [],
};
const BY_COUNTRY = new Map(Object.entries(LANG_OF).flatMap(([l, cs]) => cs.map((c) => [c, l as Lang])));
export const langOf = (country: string | null | undefined): Lang => (country ? BY_COUNTRY.get(country) : undefined) ?? (country ? 'en' : 'fr');

/** Écriture : police calligraphique de l'alphabet, sens de lecture, espacement des lettres. */
export function seaScript(lang: Lang): { font: string; rtl: boolean; spacing: string } {
  switch (lang) {
    case 'ru':
    case 'uk':
      return { font: "'Marck Script', 'Pinyon Script', cursive", rtl: false, spacing: '.12em' };
    case 'ar':
    case 'fa':
    case 'ur':
      return { font: "'Aref Ruqaa', 'Noto Naskh Arabic', serif", rtl: true, spacing: '0' };
    case 'he':
      return { font: "'Frank Ruhl Libre', serif", rtl: true, spacing: '.15em' };
    case 'hi':
      return { font: "'Kalam', 'Noto Serif Devanagari', serif", rtl: false, spacing: '.05em' };
    case 'zh':
      return { font: "'Kaiti SC', 'STKaiti', 'KaiTi', 'BiauKai', 'Noto Serif SC', serif", rtl: false, spacing: '.6em' };
    case 'ja':
      return { font: "'Yu Mincho', 'Hiragino Mincho ProN', 'Shippori Mincho', 'Noto Serif JP', serif", rtl: false, spacing: '.5em' };
    case 'ko':
      return { font: "'Nanum Myeongjo', 'Batang', 'Gowun Batang', 'Noto Serif KR', serif", rtl: false, spacing: '.45em' };
    case 'el':
      return { font: "'Palatino Linotype', 'Georgia', 'Noto Serif', serif", rtl: false, spacing: '.18em' };
    default:
      return { font: "'Pinyon Script', 'Great Vibes', cursive", rtl: false, spacing: '.08em' };
  }
}
