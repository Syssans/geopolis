/**
 * Capitales des pays (nom et position), tirées des villes de Natural Earth (domaine public).
 * Résultat : src/data/capitals.json — { "nom world-atlas": { "name": "Paris", "lon": 2.35, "lat": 48.86 } }
 * Usage : node scripts/build-capitals.mjs (après build-provinces.mjs, qui télécharge les données)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const res = await build({ entryPoints: [path.join(ROOT, 'src/data/flags.ts')], bundle: true, write: false, format: 'esm', platform: 'node' });
const { ISO2 } = await import('data:text/javascript;base64,' + Buffer.from(res.outputFiles[0].text).toString('base64'));
const places = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/.cache/ne_10m_populated_places_simple.geojson'), 'utf8')).features.map((f) => f.properties);

// Noms français des capitales les plus connues
const FR = {
  London: 'Londres', Moscow: 'Moscou', Beijing: 'Pékin', 'Washington, D.C.': 'Washington', Lisbon: 'Lisbonne', Brussels: 'Bruxelles',
  Vienna: 'Vienne', Warsaw: 'Varsovie', Athens: 'Athènes', Cairo: 'Le Caire', Seoul: 'Séoul', 'Mexico City': 'Mexico', Copenhagen: 'Copenhague',
  Bucharest: 'Bucarest', Algiers: 'Alger', Tehran: 'Téhéran', Baghdad: 'Bagdad', Riyadh: 'Riyad', Damascus: 'Damas', Jerusalem: 'Jérusalem',
  Beirut: 'Beyrouth', Kiev: 'Kiev', Kyiv: 'Kiev', Singapore: 'Singapour', Manila: 'Manille', Havana: 'La Havane', Kabul: 'Kaboul',
  'Addis Ababa': 'Addis-Abeba', Nicosia: 'Nicosie', Bern: 'Berne', 'Kuwait City': 'Koweït', 'Panama City': 'Panama', 'Guatemala City': 'Guatemala',
  'New Delhi': 'New Delhi', Rome: 'Rome', 'Tbilisi': 'Tbilissi', Yerevan: 'Erevan', Baku: 'Bakou', Tashkent: 'Tachkent', Ankara: 'Ankara',
  Belgrade: 'Belgrade', 'Hanoi': 'Hanoï', Rangoon: 'Naypyidaw', Khartoum: 'Khartoum', Tunis: 'Tunis', Rabat: 'Rabat', Dakar: 'Dakar',
  'Sanaa': 'Sanaa', Muscat: 'Mascate', Doha: 'Doha', 'Abu Dhabi': 'Abou Dabi', Amman: 'Amman', Islamabad: 'Islamabad', Dhaka: 'Dacca',
  Kathmandu: 'Katmandou', Colombo: 'Colombo', Ulaanbaatar: 'Oulan-Bator', 'Kuala Lumpur': 'Kuala Lumpur', Jakarta: 'Jakarta',
  Canberra: 'Canberra', Wellington: 'Wellington', Ottawa: 'Ottawa', Brasilia: 'Brasília', 'Buenos Aires': 'Buenos Aires', Santiago: 'Santiago',
  Lima: 'Lima', Bogota: 'Bogota', Caracas: 'Caracas', Quito: 'Quito', Montevideo: 'Montevideo', Asuncion: 'Asunción', 'La Paz': 'La Paz',
  Stockholm: 'Stockholm', Oslo: 'Oslo', Helsinki: 'Helsinki', Reykjavik: 'Reykjavik', Dublin: 'Dublin', Prague: 'Prague', Budapest: 'Budapest',
  Sofia: 'Sofia', Minsk: 'Minsk', Vilnius: 'Vilnius', Riga: 'Riga', Tallinn: 'Tallinn', Pyongyang: 'Pyongyang', Tokyo: 'Tokyo', Taipei: 'Taipei', København: 'Copenhague', Valletta: 'La Valette', Luxembourg: 'Luxembourg',
  'Vatican City': 'Vatican', Nairobi: 'Nairobi', 'Cape Town': 'Le Cap', Brazzaville: 'Brazzaville', Kinshasa: 'Kinshasa', Tripoli: 'Tripoli', Mogadishu: 'Mogadiscio',
  'Nur-Sultan': 'Astana', Astana: 'Astana', Bishkek: 'Bichkek', Dushanbe: 'Douchanbé', Ashgabat: 'Achgabat', Chisinau: 'Chișinău',
};

// Capitales absentes ou ambiguës dans Natural Earth
const MANUAL = {
  'South Africa': { name: 'Pretoria', lon: 28.19, lat: -25.75 },
  Kosovo: { name: 'Pristina', lon: 21.17, lat: 42.67 },
  Palestine: { name: 'Ramallah', lon: 35.2, lat: 31.9 },
  'W. Sahara': { name: 'Laâyoune', lon: -13.2, lat: 27.15 },
  Israel: { name: 'Tel Aviv', lon: 34.78, lat: 32.08 },
  Palestine: { name: 'Jérusalem', lon: 35.23, lat: 31.78 },
};

const out = {};
const missing = [];
for (const [atlas, iso] of Object.entries(ISO2)) {
  if (MANUAL[atlas]) {
    out[atlas] = MANUAL[atlas];
    continue;
  }
  const cands = places.filter((p) => p.iso_a2 === iso && (p.featurecla === 'Admin-0 capital' || p.adm0cap === 1));
  if (!cands.length) {
    missing.push(atlas);
    continue;
  }
  // Capitale officielle d'abord, puis la plus peuplée (ex. Pays-Bas, Bolivie)
  cands.sort((a, b) => (b.adm0cap === 1) - (a.adm0cap === 1) || (b.featurecla === 'Admin-0 capital') - (a.featurecla === 'Admin-0 capital') || b.pop_max - a.pop_max);
  const c = cands[0];
  out[atlas] = { name: FR[c.name.replace(/\s+/g, ' ')] ?? c.name.replace(/\s+/g, ' '), lon: Math.round(c.longitude * 100) / 100, lat: Math.round(c.latitude * 100) / 100 };
}
fs.writeFileSync(path.join(ROOT, 'src/data/capitals.json'), JSON.stringify(out));
console.log(`${Object.keys(out).length} capitales ; sans capitale : ${missing.join(', ')}`);
