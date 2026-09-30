/**
 * Thèmes culturels : palette, police des titres, motif du bandeau et teinte de la carte selon le pays joué.
 * On doit deviner quelle nation on dirige rien qu'en regardant l'écran.
 */
import type { Id } from '../game/types';

export interface Theme {
  id: string;
  name: string;
  font: string; // police des titres (embarquée, voir fonts.ts)
  fontUi?: string; // police des petits textes (tuiles, noms sur la carte) si celle des titres y est illisible
  accent: string; // remplace l'or de l'interface (boutons, onglets, bandeau)
  highlight?: string; // valeurs mises en avant si l'accent est rouge (le rouge se lit comme une alerte)
  onAccent: string; // texte sur l'accent
  bg: string;
  hud: string; // fond du bandeau (avec transparence)
  panel: string; // fonds des fenêtres
  btn: string;
  line: string;
  muted: string;
  sea: string;
  seaDeep: string;
  graticule: string;
  label: string; // noms de pays sur la carte
  labelStroke: string;
  pattern: string; // tuile SVG, « C » remplacé par l'accent
}

const svg = (w: number, h: number, body: string) => `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`;

export const THEMES: Record<string, Theme> = {
  default: {
    id: 'default', name: 'Neutre', font: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", accent: '#d4a017', onAccent: '#000',
    bg: '#0d1117', hud: '#0d1117f5', panel: '#161b22', btn: '#21262d', line: '#30363d', muted: '#8b949e',
    sea: '#0f1c2b', seaDeep: '#12263a', graticule: '#ffffff10', label: '#ffffff', labelStroke: '#0d1117', pattern: '',
  },
  // France, Italie, Espagne… : bleu nuit, or, Garamond, treillis à la française
  latin: {
    id: 'latin', name: 'Europe latine', font: "'Cormorant Garamond', Georgia, serif", accent: '#d8b45a', onAccent: '#14110a',
    bg: '#0c1226', hud: '#0c1226f2', panel: '#131b35', btn: '#1c2646', line: '#2e3a60', muted: '#9aa3bf',
    sea: '#0d1a33', seaDeep: '#11244a', graticule: '#d8b45a14', label: '#f6ecd2', labelStroke: '#0c1226',
    pattern: svg(22, 22, "<path d='M11 0L22 11L11 22L0 11Z' fill='none' stroke='C' stroke-opacity='.13'/><circle cx='11' cy='11' r='1.4' fill='C' fill-opacity='.22'/>"),
  },
  // États-Unis, Royaume-Uni, Canada, Australie : marine, rouge, Baskerville, fines rayures
  anglo: {
    id: 'anglo', name: 'Monde anglo-saxon', font: "'Libre Baskerville', Georgia, serif", accent: '#d9474f', onAccent: '#fff', highlight: '#e6c877',
    bg: '#0b1020', hud: '#0b1020f2', panel: '#121a30', btn: '#1a2440', line: '#2b3658', muted: '#9ba6c2',
    sea: '#0c1730', seaDeep: '#0f2043', graticule: '#ffffff12', label: '#ffffff', labelStroke: '#0b1020',
    pattern: svg(8, 8, "<path d='M0 8L8 0' stroke='#ffffff' stroke-opacity='.06'/><path d='M-1 1L1 -1M7 9L9 7' stroke='#ffffff' stroke-opacity='.06'/>"),
  },
  // Irlande : vert émeraude, or, écriture onciale, entrelacs celtiques
  irish: {
    id: 'irish', name: 'Irlande', font: "'Uncial Antiqua', Georgia, serif", fontUi: "'Libre Baskerville', Georgia, serif", accent: '#3ecf6e', onAccent: '#04160b', highlight: '#e8c56a',
    bg: '#07170f', hud: '#07170ff2', panel: '#0d2418', btn: '#143321', line: '#245239', muted: '#9dbfa8',
    sea: '#0a1f1c', seaDeep: '#0c2a26', graticule: '#3ecf6e14', label: '#f1f7ea', labelStroke: '#07170f',
    pattern: svg(24, 24, "<g fill='none' stroke='C' stroke-opacity='.16' stroke-width='1.2'><circle cx='12' cy='8' r='5'/><circle cx='8.5' cy='14' r='5'/><circle cx='15.5' cy='14' r='5'/></g><circle cx='0' cy='0' r='1.2' fill='C' fill-opacity='.25'/><circle cx='24' cy='24' r='1.2' fill='C' fill-opacity='.25'/>"),
  },
  // Allemagne, Scandinavie, Pays-Bas : acier, bleu glacier, géométrie sobre
  nordic: {
    id: 'nordic', name: 'Europe du Nord', font: "'Josefin Sans', system-ui, sans-serif", accent: '#8cc8e8', onAccent: '#08131a',
    bg: '#0a1216', hud: '#0a1216f2', panel: '#101b21', btn: '#17262e', line: '#29404b', muted: '#8fa6b2',
    sea: '#0b1c24', seaDeep: '#0e2630', graticule: '#8cc8e814', label: '#e9f6ff', labelStroke: '#0a1216',
    pattern: svg(10, 6, "<path d='M0 5.5H10' stroke='C' stroke-opacity='.12'/>"),
  },
  // Russie, Ukraine, Balkans, Europe centrale : pourpre, or, broderie en losanges
  slavic: {
    id: 'slavic', name: 'Monde slave', font: "'Ruslan Display', 'Times New Roman', serif", fontUi: "'Marcellus SC', Georgia, serif", accent: '#e0a73e', onAccent: '#1a0c05',
    bg: '#140a0c', hud: '#140a0cf2', panel: '#1f1014', btn: '#2b161b', line: '#4a2530', muted: '#b3949a',
    sea: '#121423', seaDeep: '#171b30', graticule: '#e0a73e12', label: '#fbe9d0', labelStroke: '#140a0c',
    pattern: svg(16, 16, "<path d='M8 1L15 8L8 15L1 8Z' fill='none' stroke='#c8323c' stroke-opacity='.28'/><path d='M8 5L11 8L8 11L5 8Z' fill='C' fill-opacity='.16'/>"),
  },
  // Péninsule arabique, Levant, Maghreb : émeraude, or, étoile à huit branches
  arab: {
    id: 'arab', name: 'Monde arabe', font: "'Reem Kufi', system-ui, sans-serif", accent: '#d9b25b', onAccent: '#0b140f',
    bg: '#07130f', hud: '#07130ff2', panel: '#0d1f18', btn: '#132b22', line: '#23463a', muted: '#93ad9f',
    sea: '#0a1d1f', seaDeep: '#0d2828', graticule: '#d9b25b12', label: '#fff4d8', labelStroke: '#07130f',
    pattern: svg(28, 28, "<g fill='none' stroke='C' stroke-opacity='.17'><rect x='8' y='8' width='12' height='12'/><rect x='8' y='8' width='12' height='12' transform='rotate(45 14 14)'/></g>"),
  },
  // Iran, Afghanistan, Tadjikistan : lapis-lazuli, turquoise, arabesques
  persian: {
    id: 'persian', name: 'Monde persan', font: "'Lalezar', Georgia, serif", accent: '#3cc8c0', onAccent: '#061418',
    bg: '#0a1024', hud: '#0a1024f2', panel: '#101a38', btn: '#172449', line: '#27386a', muted: '#98a4c8',
    sea: '#0b1a33', seaDeep: '#0f2246', graticule: '#3cc8c014', label: '#e8fbff', labelStroke: '#0a1024',
    pattern: svg(24, 24, "<g fill='none' stroke='C' stroke-opacity='.14'><circle cx='0' cy='12' r='12'/><circle cx='24' cy='12' r='12'/><circle cx='12' cy='0' r='12'/><circle cx='12' cy='24' r='12'/></g>"),
  },
  // Turquie, Caucase turcophone, Asie centrale : rouge ottoman, croissants
  turkic: {
    id: 'turkic', name: 'Monde turc', font: "'Marcellus SC', Georgia, serif", accent: '#e5484d', onAccent: '#fff', highlight: '#e8c27a',
    bg: '#120b0e', hud: '#120b0ef2', panel: '#1c1116', btn: '#28171e', line: '#46252f', muted: '#b39aa1',
    sea: '#0e1a28', seaDeep: '#122235', graticule: '#e5484d12', label: '#fff1f1', labelStroke: '#120b0e',
    pattern: svg(26, 26, "<path d='M11 7a6 6 0 1 0 0 12a4.8 4.8 0 1 1 0-12z' fill='C' fill-opacity='.14'/>"),
  },
  // Chine, Taïwan : laque rouge, or impérial, méandre
  sinic: {
    id: 'sinic', name: 'Monde chinois', font: "'Noto Serif SC', 'Songti SC', serif", accent: '#f0c040', onAccent: '#2a0606',
    bg: '#1a0707', hud: '#1a0707f2', panel: '#260c0c', btn: '#351212', line: '#5a2020', muted: '#c49a8e',
    sea: '#0f1624', seaDeep: '#141d30', graticule: '#f0c04012', label: '#ffe9a8', labelStroke: '#1a0707',
    pattern: svg(20, 20, "<path d='M2 18V2H18V14H6V6H14V10H10' fill='none' stroke='C' stroke-opacity='.16'/>"),
  },
  // Japon : encre sumi, vermillon, vagues seigaiha
  japan: {
    id: 'japan', name: 'Japon', font: "'Shippori Mincho', 'Hiragino Mincho ProN', serif", accent: '#e0453a', onAccent: '#fff', highlight: '#e8c27a',
    bg: '#0e0e12', hud: '#0e0e12f2', panel: '#17171d', btn: '#212129', line: '#35353f', muted: '#a3a3ad',
    sea: '#0f1826', seaDeep: '#131f33', graticule: '#ffffff0e', label: '#f7f3ea', labelStroke: '#0e0e12',
    pattern: svg(24, 12, "<g fill='none' stroke='C' stroke-opacity='.15'><circle cx='12' cy='12' r='10'/><circle cx='12' cy='12' r='6'/><circle cx='0' cy='0' r='10'/><circle cx='24' cy='0' r='10'/><circle cx='0' cy='0' r='6'/><circle cx='24' cy='0' r='6'/></g>"),
  },
  // Corée : bleu et rouge du taegeuk, papier hanji
  korea: {
    id: 'korea', name: 'Corée', font: "'Gowun Batang', Georgia, serif", accent: '#e0485a', onAccent: '#fff', highlight: '#e6c98a',
    bg: '#0a0f1c', hud: '#0a0f1cf2', panel: '#111a2e', btn: '#18233d', line: '#2a3a5e', muted: '#9ba8c6',
    sea: '#0c1830', seaDeep: '#10213f', graticule: '#ffffff10', label: '#ffffff', labelStroke: '#0a0f1c',
    pattern: svg(14, 14, "<circle cx='7' cy='7' r='1.1' fill='#4a78d8' fill-opacity='.35'/><circle cx='0' cy='0' r='1.1' fill='C' fill-opacity='.3'/><circle cx='14' cy='14' r='1.1' fill='C' fill-opacity='.3'/>"),
  },
  // Inde, Pakistan, Bangladesh, Népal : safran, mandalas
  southasia: {
    id: 'southasia', name: 'Sous-continent indien', font: "'Rozha One', Georgia, serif", accent: '#ff9f2e', onAccent: '#1a0c00',
    bg: '#150c06', hud: '#150c06f2', panel: '#21140a', btn: '#2e1c0e', line: '#4d3018', muted: '#bea78e',
    sea: '#0c1a26', seaDeep: '#102433', graticule: '#ff9f2e12', label: '#fff1dd', labelStroke: '#150c06',
    pattern: svg(20, 20, "<circle cx='10' cy='10' r='6' fill='none' stroke='C' stroke-opacity='.16'/><circle cx='10' cy='10' r='1.6' fill='C' fill-opacity='.24'/><circle cx='0' cy='0' r='2' fill='#2ea36b' fill-opacity='.2'/><circle cx='20' cy='20' r='2' fill='#2ea36b' fill-opacity='.2'/>"),
  },
  // Asie du Sud-Est : laque brun-rouge, or, bambou
  seasia: {
    id: 'seasia', name: 'Asie du Sud-Est', font: "'Chakra Petch', system-ui, sans-serif", accent: '#f4c430', onAccent: '#1a1000',
    bg: '#130b07', hud: '#130b07f2', panel: '#1e120b', btn: '#2a1a10', line: '#48301f', muted: '#b9a390',
    sea: '#0a1c22', seaDeep: '#0d272d', graticule: '#f4c43012', label: '#fff4cf', labelStroke: '#130b07',
    pattern: svg(12, 24, "<path d='M6 0V24M3 12H9' stroke='#3fa35c' stroke-opacity='.22' fill='none'/>"),
  },
  // Afrique subsaharienne : ocre, terre, tissage kente
  africa: {
    id: 'africa', name: 'Afrique', font: "'Baloo 2', system-ui, sans-serif", accent: '#eaa53b', onAccent: '#1a0d00',
    bg: '#140d07', hud: '#140d07f2', panel: '#20150c', btn: '#2c1d11', line: '#4c331d', muted: '#bfa88f',
    sea: '#0b1b24', seaDeep: '#0f2530', graticule: '#eaa53b12', label: '#fff0d6', labelStroke: '#140d07',
    pattern: svg(24, 24, "<rect width='12' height='6' fill='#eaa53b' opacity='.08'/><rect x='12' y='12' width='12' height='6' fill='#2f9e55' opacity='.08'/><rect x='12' width='6' height='12' fill='#c43d2f' opacity='.08'/><rect y='12' width='6' height='12' fill='#eaa53b' opacity='.08'/>"),
  },
  // Amérique latine : soleil, magenta, zigzags andins
  latam: {
    id: 'latam', name: 'Amérique latine', font: "'Fraunces', Georgia, serif", accent: '#f5b83d', onAccent: '#1a0f00',
    bg: '#0c1212', hud: '#0c1212f2', panel: '#131d1d', btn: '#1a2828', line: '#2b4444', muted: '#9db3b0',
    sea: '#0a1c26', seaDeep: '#0d2632', graticule: '#f5b83d12', label: '#fff4dc', labelStroke: '#0c1212',
    pattern: svg(20, 10, "<path d='M0 8L5 2L10 8L15 2L20 8' fill='none' stroke='#e2458c' stroke-opacity='.26'/>"),
  },
  // Israël : bleu et blanc, étoile
  israel: {
    id: 'israel', name: 'Israël', font: "'Frank Ruhl Libre', Georgia, serif", accent: '#5aa9ff', onAccent: '#04101f',
    bg: '#0a1020', hud: '#0a1020f2', panel: '#101a33', btn: '#172444', line: '#28406a', muted: '#9fb0cc',
    sea: '#0b1a33', seaDeep: '#0f2347', graticule: '#5aa9ff12', label: '#ffffff', labelStroke: '#0a1020',
    pattern: svg(28, 28, "<g fill='none' stroke='C' stroke-opacity='.14'><path d='M14 5L22 19H6Z'/><path d='M14 23L6 9H22Z'/></g>"),
  },
};

const GROUPS: Record<string, Id[]> = {
  latin: ['France', 'Italy', 'Spain', 'Portugal', 'Belgium', 'Luxembourg', 'Switzerland', 'Malta', 'Romania', 'Greece', 'Cyprus', 'Albania'],
  anglo: ['United States of America', 'United Kingdom', 'Canada', 'Australia', 'New Zealand', 'Bahamas', 'Jamaica', 'Trinidad and Tobago', 'Guyana', 'Belize', 'Papua New Guinea', 'Fiji', 'Solomon Is.', 'Vanuatu'],
  nordic: ['Germany', 'Austria', 'Netherlands', 'Denmark', 'Sweden', 'Norway', 'Finland', 'Iceland', 'Estonia', 'Latvia', 'Hungary'],
  slavic: ['Russia', 'Ukraine', 'Belarus', 'Poland', 'Czechia', 'Slovakia', 'Serbia', 'Bulgaria', 'Croatia', 'Slovenia', 'Bosnia and Herz.', 'Montenegro', 'Macedonia', 'Moldova', 'Lithuania', 'Georgia', 'Armenia', 'Kosovo', 'Mongolia'],
  arab: ['Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Yemen', 'Iraq', 'Syria', 'Jordan', 'Lebanon', 'Palestine', 'Egypt', 'Libya', 'Tunisia', 'Algeria', 'Morocco', 'W. Sahara', 'Mauritania', 'Sudan', 'Djibouti', 'Somalia', 'Somaliland'],
  persian: ['Iran', 'Afghanistan', 'Tajikistan'],
  turkic: ['Turkey', 'N. Cyprus', 'Azerbaijan', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan'],
  sinic: ['China', 'Taiwan', 'Singapore'],
  japan: ['Japan'],
  korea: ['South Korea', 'North Korea'],
  southasia: ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Bhutan'],
  seasia: ['Vietnam', 'Thailand', 'Laos', 'Cambodia', 'Myanmar', 'Malaysia', 'Indonesia', 'Philippines', 'Brunei', 'Timor-Leste'],
  latam: ['Mexico', 'Cuba', 'Haiti', 'Dominican Rep.', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama', 'Brazil', 'Argentina', 'Colombia', 'Chile', 'Peru', 'Venezuela', 'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay', 'Suriname', 'Puerto Rico'],
  israel: ['Israel'],
  irish: ['Ireland'],
};

const BY_COUNTRY = new Map<Id, string>(Object.entries(GROUPS).flatMap(([t, ids]) => ids.map((id) => [id, t] as [Id, string])));

/** Thème d'un pays : sa culture, l'Afrique subsaharienne par défaut pour les pays africains non listés. */
export function themeOf(id: Id | null): Theme {
  if (!id) return THEMES.default;
  return THEMES[BY_COUNTRY.get(id) ?? 'africa'];
}

let current = '';

/** Applique le thème au document (variables CSS, couleur de la barre du navigateur). */
export function applyTheme(t: Theme) {
  if (current === t.id) return;
  current = t.id;
  const r = document.documentElement.style;
  const set = (k: string, v: string) => r.setProperty(k, v);
  set('--gold', t.accent);
  set('--on-gold', t.onAccent);
  set('--hl', t.highlight ?? t.accent);
  set('--bg', t.bg);
  set('--hud-bg', t.hud);
  set('--panel-solid', t.panel);
  set('--panel', `${t.panel}ee`);
  set('--tile', t.panel);
  set('--btn', t.btn);
  set('--line', t.line);
  set('--muted', t.muted);
  set('--sea', t.sea);
  set('--sea-deep', t.seaDeep);
  set('--graticule', t.graticule);
  set('--label', t.label);
  set('--label-stroke', t.labelStroke);
  set('--font-display', t.font);
  set('--font-ui', t.fontUi ?? t.font);
  set('--vignette', t.id === 'default' ? 'transparent' : `${t.accent}38`);
  set('--pattern', t.pattern ? `url("data:image/svg+xml,${encodeURIComponent(t.pattern.replaceAll('C', t.accent))}")` : 'none');
  document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
}
