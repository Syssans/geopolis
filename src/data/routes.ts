/**
 * Tracés réels des liaisons commerciales, pour l'affichage des routes et des convois.
 * Chaque nœud a un port (ou une ville pour les nœuds continentaux) ; chaque liaison suit
 * les grandes voies maritimes (Bab-el-Mandeb, mer Rouge, Gibraltar, Malacca, détroit de Floride…).
 * Coordonnées [longitude, latitude].
 */
import LANES_JSON from './lanes.json';

export type LonLat = [number, number];

/** Tracés maritimes exacts calculés par scripts/build-lanes.mjs (réseau Marnet). */
const LANES = LANES_JSON as unknown as Record<string, LonLat[]>;

/** Liaisons maritimes utilisées par les convois en plus du réseau de valeur. */
export const EXTRA_LANES: [string, string][] = [
  ['new_york', 'manche'],
  ['caraibes', 'afrique_ouest'],
  ['golfe_mexique', 'caraibes'],
  ['australie', 'ocean_indien'],
];

export const PORTS: Record<string, LonLat> = {
  andes: [-77.2, -12.1], // Callao
  plata: [-58.2, -34.7], // Buenos Aires
  bresil: [-46.3, -24.0], // Santos
  caraibes: [-70, 14],
  panama: [-79.7, 9.2],
  golfe_mexique: [-94.8, 29.3], // Houston
  californie: [-118.3, 33.7], // Los Angeles
  grands_lacs: [-87.6, 41.9], // Chicago
  new_york: [-73.9, 40.5],
  afrique_ouest: [3.4, 6.3], // Lagos
  afrique_australe: [18.4, -33.9], // Le Cap
  afrique_est: [39.7, -4.1], // Mombasa
  ocean_indien: [72.8, 18.9], // Bombay
  aden: [45, 12.7],
  ormuz: [53, 26.5], // Dubaï
  asie_centrale: [69.2, 41.3], // Tachkent
  russie: [37.6, 55.7], // Moscou
  mer_noire: [33, 43.5],
  suez: [32.5, 29.9],
  mediterranee: [12, 38.5],
  baltique: [19, 55.5],
  manche: [1.5, 50.8],
  malacca: [103.8, 1.2], // Singapour
  australie: [115.7, -32], // Perth
  japon: [139.8, 35.3], // Tokyo
  shanghai: [122, 31],
};

/** Liaisons terrestres (rail, route, oléoduc) : dessinées différemment. */
export const LAND = new Set([
  'asie_centrale|russie',
  'asie_centrale|shanghai',
  'baltique|russie',
  'mer_noire|russie',
  'californie|new_york',
  'grands_lacs|new_york',
]);

/** Points de passage intermédiaires (sans les ports d'extrémité), dans le sens a → b de la clé. */
const RAW_WAYPOINTS: Record<string, LonLat[]> = {
  'andes|panama': [[-81, -5], [-80.5, 2]],
  'andes|californie': [[-85, 0], [-100, 12], [-112, 22]],
  'bresil|plata': [[-48, -28], [-54, -35.5]],
  'bresil|caraibes': [[-39, -15], [-34.5, -7], [-40, 0], [-52, 7], [-60, 12]],
  'afrique_ouest|bresil': [[-5, 2], [-20, -3], [-35, -12]],
  'caraibes|panama': [[-76, 12]],
  'caraibes|golfe_mexique': [[-78, 18], [-85, 21.5], [-90, 25]],
  'golfe_mexique|panama': [[-90, 25], [-85, 21.5], [-81, 13]],
  'californie|panama': [[-112, 24], [-105, 18], [-90, 11], [-80, 7]],
  'golfe_mexique|new_york': [[-88, 28.5], [-84, 24.3], [-80, 25], [-79.5, 30], [-75, 35]],
  'californie|new_york': [[-105, 38], [-90, 40]],
  'californie|japon': [[-140, 40], [-170, 44], [165, 42], [145, 36]],
  'grands_lacs|new_york': [],
  'manche|new_york': [[-6, 49], [-20, 49], [-40, 47], [-60, 43]],
  'afrique_ouest|manche': [[-5, 4], [-17, 14], [-18, 27], [-10, 37], [-10, 44], [-5, 48.5]],
  'afrique_ouest|caraibes': [[-10, 4], [-30, 8], [-50, 12]],
  'afrique_australe|afrique_ouest': [[14, -25], [10, -10], [7, 0]],
  'afrique_australe|ocean_indien': [[22, -36], [32, -32], [40, -22], [42, -12], [52, 0], [65, 12]],
  'afrique_est|aden': [[45, 2], [51.5, 11]],
  'aden|ocean_indien': [[52, 13], [60, 15]],
  'malacca|ocean_indien': [[100, 3.5], [97, 5.5], [92, 6], [82, 5.5], [77, 6], [72, 10]],
  'aden|suez': [[43.4, 12.6], [41, 15.5], [38, 20], [35, 26], [33.5, 28]],
  'ocean_indien|ormuz': [[62, 22], [58, 24], [56.4, 26.5]],
  'aden|ormuz': [[50, 13], [55, 16], [59, 21], [58, 24], [56.4, 26.5]],
  'asie_centrale|russie': [[55, 51]],
  'asie_centrale|shanghai': [[87, 43], [104, 36]],
  'baltique|russie': [[24, 59.5], [30.3, 59.9]],
  'mer_noire|russie': [[37.8, 44.7], [39.7, 47.2]],
  'mediterranee|mer_noire': [[15, 36.5], [20, 35.5], [25, 37.5], [26.5, 40.2], [29, 41.3]],
  'mediterranee|suez': [[15, 36.5], [20, 34.5], [28, 33], [32.3, 31.3]],
  'manche|mediterranee': [[-5, 48.5], [-10, 43], [-9.5, 37], [-5.6, 36], [0, 37], [8, 38]],
  'baltique|manche': [[12.6, 55.9], [11, 57.5], [8, 57.5], [4, 54]],
  'malacca|shanghai': [[106, 5], [110, 11], [116, 20], [121, 25]],
  'australie|malacca': [[112, -22], [108, -10], [105.5, -6], [106, -3], [104.5, 0]],
  'australie|japon': [[113.5, -22], [118, -12], [115.8, -8.8], [118.5, -4], [120.5, 3], [127, 10], [132, 25]],
  'australie|ocean_indien': [[95, -15], [80, 0], [74, 10]],
  'japon|shanghai': [[135, 33], [130, 32], [125, 31.5]],
};

export const laneKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Clés normalisées (ordre alphabétique) : les points sont retournés si besoin. */
const WAYPOINTS: Record<string, LonLat[]> = Object.fromEntries(
  Object.entries(RAW_WAYPOINTS).map(([k, pts]) => {
    const [a, b] = k.split('|');
    return a < b ? [k, pts] : [laneKey(a, b), pts.slice().reverse()];
  }),
);

/** Tracé complet d'une liaison, orienté de a vers b (ports compris). */
export function lane(a: string, b: string): LonLat[] {
  const key = laneKey(a, b);
  const exact = LANES[key];
  if (exact) return key === `${a}|${b}` ? exact : exact.slice().reverse();
  const mid = WAYPOINTS[key] ?? [];
  const forward = key === `${a}|${b}`;
  const pts = [PORTS[a], ...(forward ? mid : mid.slice().reverse()), PORTS[b]];
  return pts;
}

/** Tracé d'un itinéraire complet (suite de nœuds). */
export function routePath(nodes: string[]): LonLat[] {
  if (nodes.length === 1) return [PORTS[nodes[0]]];
  const pts: LonLat[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const seg = lane(nodes[i - 1], nodes[i]);
    pts.push(...(i === 1 ? seg : seg.slice(1)));
  }
  return pts;
}

export const hasLane = (a: string, b: string) => laneKey(a, b) in WAYPOINTS || laneKey(a, b) in LANES;
