/**
 * Génère src/data/provinces.json à partir de Natural Earth (domaine public) :
 *  - admin-1 (états / provinces / régions) regroupés en ~800 provinces de jeu
 *  - villes (populated places) pour estimer population et développement
 * Toutes les données de jeu (religion, marchandise, nœud commercial, lieux saints, détroits)
 * sont calculées ici une fois pour toutes.
 *
 * Usage : node scripts/build-provinces.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance } from 'd3-geo';
import { topology } from 'topojson-server';
import { mergeArcs, neighbors, feature, quantize } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { build } from 'esbuild';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(ROOT, 'scripts', '.cache');
const OUT = path.join(ROOT, 'src', 'data', 'provinces.json');
const KEEP = Number(process.env.KEEP ?? 0.05); // part des points de contour conservés
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const SOURCES = {
  admin1: 'ne_10m_admin_1_states_provinces.geojson',
  places: 'ne_10m_populated_places_simple.geojson',
};

// ——— Chargement des données TypeScript du jeu (via esbuild) ———
async function loadTs(file) {
  const res = await build({ entryPoints: [path.join(ROOT, file)], bundle: true, write: false, format: 'esm', platform: 'node' });
  const url = 'data:text/javascript;base64,' + Buffer.from(res.outputFiles[0].text).toString('base64');
  return import(url);
}
const { COUNTRIES, DEPENDENCIES } = await loadTs('src/data/countries.ts');
const { STATE_RELIGION, REGIONAL_RELIGION, HOLY_SITES } = await loadTs('src/data/religions.ts');
const { COUNTRY_GOODS, REGION_GOODS, PROVINCE_GOODS, TRADE_NODES, STRAITS } = await loadTs('src/data/trade.ts');

async function fetchCached(name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name);
  if (!fs.existsSync(file)) {
    console.log('Téléchargement', name, '…');
    const r = await fetch(NE + name);
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Noms Natural Earth (champ « admin ») → noms world-atlas utilisés par le jeu
const ADMIN_ALIAS = {
  'Democratic Republic of the Congo': 'Dem. Rep. Congo',
  'Republic of the Congo': 'Congo',
  'Republic of Congo': 'Congo',
  'Central African Republic': 'Central African Rep.',
  'Dominican Republic': 'Dominican Rep.',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'North Macedonia': 'Macedonia',
  'Republic of Serbia': 'Serbia',
  'United Republic of Tanzania': 'Tanzania',
  'Ivory Coast': "Côte d'Ivoire",
  "Cote d'Ivoire": "Côte d'Ivoire",
  'Equatorial Guinea': 'Eq. Guinea',
  'South Sudan': 'S. Sudan',
  'Solomon Islands': 'Solomon Is.',
  'Czech Republic': 'Czechia',
  Swaziland: 'eSwatini',
  Eswatini: 'eSwatini',
  'Guinea Bissau': 'Guinea-Bissau',
  'The Bahamas': 'Bahamas',
  'Northern Cyprus': 'N. Cyprus',
  'Western Sahara': 'W. Sahara',
  'East Timor': 'Timor-Leste',
  'Falkland Islands': 'Falkland Is.',
  'United States': 'United States of America',
  'Hong Kong S.A.R.': 'China',
  'Macao S.A.R': 'China',
  'Macau S.A.R': 'China',
  'Gaza Strip': 'Palestine',
  'West Bank': 'Palestine',
  'Republic of the Gambia': 'Gambia',
  'The Gambia': 'Gambia',
  Turkiye: 'Turkey',
  Türkiye: 'Turkey',
};

const NATIONS = new Map(COUNTRIES.map((c) => [c.atlas, c]));
const OWNER_OF = (country) => (NATIONS.has(country) ? country : DEPENDENCIES[country]?.owner);

// Nombre de provinces imposé pour les grands pays (sinon calcul automatique)
const TARGETS = {
  'United States of America': 49, China: 31, India: 28, Russia: 42, Brazil: 26, Canada: 12, Australia: 8,
  Germany: 16, France: 18, Mexico: 20, Indonesia: 20, Nigeria: 14, Japan: 10, 'United Kingdom': 8, Italy: 12,
  Spain: 12, Iran: 12, Turkey: 14, Iraq: 10, 'Saudi Arabia': 8, Egypt: 8, Pakistan: 7, Ukraine: 12, Poland: 10,
  Argentina: 12, Kazakhstan: 10, 'Dem. Rep. Congo': 12, Ethiopia: 9, 'South Africa': 9, Colombia: 10, Philippines: 10,
  Algeria: 10, Sudan: 8, Libya: 6, Afghanistan: 8, Vietnam: 8, Thailand: 8, Myanmar: 8, Malaysia: 6, Chile: 8,
  Peru: 8, Venezuela: 8, Bangladesh: 6, Kenya: 7, Tanzania: 7, Morocco: 6, Syria: 7, Yemen: 7, Lebanon: 4,
  Israel: 3, Palestine: 2, Belgium: 3, Netherlands: 4, Switzerland: 3, Sweden: 5, Norway: 5, Finland: 4, Romania: 6,
  Greece: 5, Portugal: 4, Austria: 4, 'Bosnia and Herz.': 2, Cyprus: 1, Serbia: 3, Mongolia: 5, 'Sri Lanka': 3,
  Nepal: 3, Uzbekistan: 5, Angola: 7, Mozambique: 6, Mali: 5, Niger: 5, Chad: 5, Cameroon: 5, Uganda: 4,
  'Côte d\'Ivoire': 4, Ghana: 4, Senegal: 3, 'S. Sudan': 4, Somalia: 4, 'New Zealand': 3, 'South Korea': 5, 'North Korea': 4,
  Taiwan: 3, Bolivia: 5, Ecuador: 4, Cuba: 3, Madagascar: 4, Zambia: 4, Zimbabwe: 4, Namibia: 3, Botswana: 3, Georgia: 3,
  Azerbaijan: 3, Armenia: 2, Belarus: 4, Hungary: 4, Czechia: 4, Bulgaria: 4, Denmark: 3, Ireland: 2, Oman: 4,
  'United Arab Emirates': 3, Jordan: 3, Tunisia: 3, Turkmenistan: 3, Kyrgyzstan: 3, Tajikistan: 3, Cambodia: 3, Laos: 3,
  'Papua New Guinea': 4, Paraguay: 3, Uruguay: 2, Guatemala: 3, Honduras: 2, Haiti: 2, 'Dominican Rep.': 2,
};

// ——— Données brutes ———
const admin1 = await fetchCached(SOURCES.admin1);
const places = await fetchCached(SOURCES.places);

/** d3-geo attend des anneaux extérieurs dans le sens horaire : on corrige chaque polygone inversé. */
function rewind(geometry) {
  const fix = (rings) => {
    const poly = { type: 'Polygon', coordinates: rings };
    return geoArea(poly) > 2 * Math.PI ? rings.map((r) => r.slice().reverse()) : rings;
  };
  if (geometry.type === 'Polygon') return { ...geometry, coordinates: fix(geometry.coordinates) };
  if (geometry.type === 'MultiPolygon') return { ...geometry, coordinates: geometry.coordinates.map(fix) };
  return geometry;
}

const unknown = new Map();
const units = [];
for (const f of admin1.features) {
  const p = f.properties;
  const adminName = ADMIN_ALIAS[p.admin] ?? p.admin;
  const owner = OWNER_OF(adminName);
  if (!owner || !f.geometry) {
    unknown.set(p.admin, (unknown.get(p.admin) ?? 0) + 1);
    continue;
  }
  f.geometry = rewind(f.geometry);
  units.push({
    feature: f,
    country: adminName, // pays « culturel » (Groenland, Porto Rico…)
    owner,
    name: p.name_fr || p.name || p.name_en || '?',
    names: [p.name, p.name_en, p.name_fr, p.name_alt, p.gn_name, p.woe_name, p.region].filter(Boolean).flatMap((n) => String(n).split('|')),
    region: p.region || '',
    area: geoArea(f) * 6371 * 6371, // km²
    bounds: geoBounds(f),
    cityPop: 0,
    capital: false,
  });
}
console.log(`${units.length} unités admin-1 retenues ; ignorées :`, [...unknown.keys()].slice(0, 80).join(', '));

// ——— Villes → unités ———
function containing(lon, lat, country) {
  for (const u of units) {
    if (country && u.country !== country && u.owner !== country) continue;
    const [[x0, y0], [x1, y1]] = u.bounds;
    if (lat < y0 || lat > y1) continue;
    if (x0 <= x1 ? lon < x0 || lon > x1 : lon < x0 && lon > x1) continue;
    if (geoContains(u.feature, [lon, lat])) return u;
  }
  return null;
}
for (const pl of places.features) {
  const p = pl.properties;
  const [lon, lat] = pl.geometry.coordinates;
  const pop = p.pop_max ?? p.pop_min ?? 0;
  const u = containing(lon, lat, null);
  if (!u) continue;
  u.cityPop += pop / 1e6;
  if (p.featurecla === 'Admin-0 capital' || p.adm0cap === 1) u.capital = true;
}

// ——— Regroupement ———
const topo = topology({ units: { type: 'FeatureCollection', features: units.map((u) => u.feature) } }, 1e5);
const geoms = topo.objects.units.geometries;
const nb = neighbors(geoms);

const byCountry = new Map();
units.forEach((u, i) => {
  u.index = i;
  const k = u.owner === u.country ? u.owner : `${u.owner}/${u.country}`;
  if (!byCountry.has(k)) byCountry.set(k, []);
  byCountry.get(k).push(u);
});

function autoTarget(owner, us) {
  if (TARGETS[owner] !== undefined) return TARGETS[owner];
  const area = us.reduce((a, u) => a + u.area, 0);
  const c = NATIONS.get(owner);
  return Math.max(1, Math.round(Math.sqrt(area / 60000) * 0.45 + Math.sqrt(c?.pop ?? 1) * 0.2));
}

const groups = [];
for (const [key, us] of byCountry) {
  const owner = us[0].owner;
  const isDependency = key.includes('/');
  const totalArea = us.reduce((a, u) => a + u.area, 0);
  const totalCity = us.reduce((a, u) => a + u.cityPop, 0) || 1;
  const score = (g) => g.area / totalArea + g.cityPop / totalCity;
  const target = isDependency ? 1 : Math.min(us.length, autoTarget(owner, us));
  // Si les régions administratives du pays correspondent à peu près à la cible, on les reprend telles quelles
  const regionNames = new Set(us.map((u) => u.region).filter(Boolean));
  const byRegion = regionNames.size > 1 && regionNames.size >= target * 0.6 && regionNames.size <= target * 1.4 && us.every((u) => u.region);
  let gs;
  if (byRegion) {
    const m = new Map();
    for (const u of us) {
      if (!m.has(u.region)) m.set(u.region, { members: [], area: 0, cityPop: 0, owner, country: us[0].country });
      const g = m.get(u.region);
      g.members.push(u);
      g.area += u.area;
      g.cityPop += u.cityPop;
    }
    gs = [...m.values()];
  } else gs = us.map((u) => ({ members: [u], area: u.area, cityPop: u.cityPop, owner, country: us[0].country }));
  const groupOf = new Map();
  gs.forEach((g) => g.members.forEach((m) => groupOf.set(m.index, g)));
  while (gs.length > target) {
    gs.sort((a, b) => score(a) - score(b));
    const g = gs[0];
    // Voisins terrestres dans le même pays, de préférence de la même région
    const cands = new Set();
    for (const m of g.members) for (const j of nb[m.index]) {
      const o = groupOf.get(j);
      if (o && o !== g && o.owner === g.owner && o.country === g.country) cands.add(o);
    }
    let best = null;
    let bestScore = Infinity;
    const region = g.members[0].region;
    for (const o of cands) {
      const s = score(o) - (region && o.members[0].region === region ? 10 : 0);
      if (s < bestScore) { bestScore = s; best = o; }
    }
    if (!best) {
      // Île : rattacher au groupe le plus proche
      const c = geoCentroid(g.members[0].feature);
      let d = Infinity;
      for (const o of gs) if (o !== g) {
        const dd = geoDistance(c, geoCentroid(o.members[0].feature));
        if (dd < d) { d = dd; best = o; }
      }
    }
    if (!best) break;
    best.members.push(...g.members);
    best.area += g.area;
    best.cityPop += g.cityPop;
    for (const m of g.members) groupOf.set(m.index, best);
    gs = gs.filter((x) => x !== g);
  }
  groups.push(...gs);
}
console.log(`${groups.length} provinces après regroupement`);

// ——— Propriétés de jeu ———
/** « du Caire » → « Le Caire », « d'Arkhangelsk » → « Arkhangelsk »… */
function cleanName(n) {
  const rules = [[/^du /, 'Le '], [/^des /, 'Les '], [/^de la /, 'La '], [/^de l['’]/, 'L’'], [/^de /, ''], [/^d['’]/, ''], [/^l['’]/, 'L’'], [/^la /, 'La '], [/^le /, 'Le ']];
  for (const [re, rep] of rules)
    if (re.test(n)) {
      n = n.replace(re, rep);
      break;
    }
  return n.charAt(0).toUpperCase() + n.slice(1);
}
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const matchAny = (g, names) => {
  const want = new Set(names.map(norm));
  return g.members.find((m) => m.names.some((n) => want.has(norm(n))));
};

const nodes = TRADE_NODES.map((n) => ({ ...n, pt: [n.lon, n.lat] }));
const provinces = [];
const byOwner = new Map();
groups.forEach((g, i) => {
  const merged = mergeArcs(topo, g.members.map((m) => geoms[m.index]));
  const geo = feature(topo, merged);
  const center = geoCentroid(geo);
  // Nom : région commune, sinon membre le plus peuplé
  const biggest = g.members.slice().sort((a, b) => b.cityPop + b.area / 1e6 - (a.cityPop + a.area / 1e6))[0];
  const regions = new Set(g.members.map((m) => m.region));
  const wholeRegion = regions.size === 1 && biggest.region && byCountry.get(g.owner === g.country ? g.owner : `${g.owner}/${g.country}`).filter((u) => u.region === biggest.region).length === g.members.length;
  const name = cleanName(g.members.length > 1 && wholeRegion ? biggest.region : biggest.name);
  const c = NATIONS.get(g.owner);
  // Religion : pondérée par la population estimée de chaque membre
  const overrides = REGIONAL_RELIGION[g.country] ?? REGIONAL_RELIGION[g.owner] ?? {};
  const relW = {};
  for (const m of g.members) {
    const hit = Object.keys(overrides).find((k) => m.names.some((n) => norm(n) === norm(k)));
    const r = hit ? overrides[hit] : STATE_RELIGION[g.country] ?? STATE_RELIGION[g.owner] ?? 'secularise';
    relW[r] = (relW[r] ?? 0) + m.cityPop + m.area / 50000 + 0.01;
  }
  const religion = Object.entries(relW).sort((a, b) => b[1] - a[1])[0][0];
  // Nœud commercial le plus proche
  const node = nodes.slice().sort((a, b) => geoDistance(center, a.pt) - geoDistance(center, b.pt))[0].id;
  const p = {
    id: i,
    name,
    country: g.country,
    owner: g.owner,
    area: Math.round(g.area),
    cityPop: g.cityPop,
    capital: g.members.some((m) => m.capital),
    religion,
    node,
    lon: +center[0].toFixed(2),
    lat: +center[1].toFixed(2),
    parts: g.members.map((m) => m.name),
    _g: g,
  };
  merged.properties = { id: i };
  merged.id = i;
  p._geom = merged;
  provinces.push(p);
  if (!byOwner.has(g.owner)) byOwner.set(g.owner, []);
  byOwner.get(g.owner).push(p);
});

// Noms uniques par pays : en cas de doublon, on reprend le nom du membre le plus peuplé
for (const [, ps] of byOwner) {
  const seen = new Map();
  for (const p of ps) seen.set(p.name, (seen.get(p.name) ?? 0) + 1);
  for (const p of ps)
    if (seen.get(p.name) > 1) {
      const big = p._g.members.slice().sort((a, b) => b.cityPop - a.cityPop)[0];
      p.name = cleanName(big.name);
    }
  const again = new Map();
  for (const p of ps) {
    const k = again.get(p.name) ?? 0;
    again.set(p.name, k + 1);
    if (k) p.name = `${p.name} ${['', 'II', 'III', 'IV', 'V'][k] ?? k + 1}`;
  }
}

// Population & développement : population du pays répartie (70 % selon les villes, 30 % selon la surface)
for (const [owner, ps] of byOwner) {
  const c = NATIONS.get(owner);
  const cityTot = ps.reduce((a, p) => a + p.cityPop, 0) || 1;
  const areaTot = ps.reduce((a, p) => a + Math.sqrt(p.area), 0) || 1;
  for (const p of ps) {
    const dep = DEPENDENCIES[p.country];
    const share = 0.7 * (p.cityPop / cityTot) + 0.3 * (Math.sqrt(p.area) / areaTot);
    p.pop = +(dep ? dep.pop : c.pop * share).toFixed(3);
    // Richesse : plus concentrée dans les villes que la population
    const wShare = 0.85 * (p.cityPop / cityTot) + 0.15 * (Math.sqrt(p.area) / areaTot);
    const wealth = dep ? dep.gdp : c.gdp * wShare;
    p.dev = Math.max(1, Math.round(2 + 4 * Math.cbrt(Math.max(wealth, 0))));
  }
  // Marchandises
  const list = COUNTRY_GOODS[owner];
  const sorted = ps.slice().sort((a, b) => b.dev - a.dev);
  sorted.forEach((p, k) => {
    const hit = Object.keys(PROVINCE_GOODS).find((n) => matchAny(p._g, [n]));
    if (hit) p.good = PROVINCE_GOODS[hit];
    else if (list && p.country === owner) p.good = list[k % list.length];
    else {
      const lat = Math.abs(p.lat);
      const zone = lat < 18 ? 'tropical' : lat < 35 ? 'aride' : lat < 55 ? 'tempere' : 'froid';
      const arr = REGION_GOODS[zone];
      p.good = arr[(p.id * 7) % arr.length];
    }
  });
}

// Lieux saints & détroits
for (const h of HOLY_SITES) {
  const p = provinces.find((x) => (x.owner === h.country || x.country === h.country) && matchAny(x._g, h.province));
  if (p) (p.holy ??= []).push({ name: h.name, religions: h.religions });
  else console.warn('Lieu saint introuvable :', h.name);
}
for (const s of STRAITS) {
  const p = provinces.find((x) => (x.owner === s.country || x.country === s.country) && matchAny(x._g, s.province));
  if (p) p.strait = s.id;
  else console.warn('Détroit introuvable :', s.name);
}
for (const [country, map] of Object.entries(REGIONAL_RELIGION))
  for (const k of Object.keys(map))
    if (!provinces.some((x) => (x.country === country || x.owner === country) && matchAny(x._g, [k]))) unknown.set(`religion:${country}/${k}`, 1);

// ——— Topologie finale ———
const fc = { type: 'FeatureCollection', features: provinces.map((p) => { const f = feature(topo, p._geom); return { ...f, geometry: rewind(f.geometry), id: p.id, properties: {} }; }) };
let simple = presimplify(topology({ provinces: fc }));
const before = simple.arcs.reduce((a, arc) => a + arc.length, 0);
simple = simplify(simple, quantile(simple, KEEP));
simple.arcs = simple.arcs.map((arc) => arc.map((pt) => [pt[0], pt[1]]));
simple = quantize(simple, 1e4);
console.log(`Contours : ${before} → ${simple.arcs.reduce((a, arc) => a + arc.length, 0)} points`);

// Adjacence terrestre et côtes (un arc utilisé par une seule province = côte)
const fg = simple.objects.provinces.geometries;
const adj = neighbors(fg);
const arcUse = new Map();
const walk = (arcs, fn) => (Array.isArray(arcs) ? arcs.forEach((a) => walk(a, fn)) : fn(arcs < 0 ? ~arcs : arcs));
fg.forEach((g) => walk(g.arcs, (a) => arcUse.set(a, (arcUse.get(a) ?? 0) + 1)));
fg.forEach((g, i) => {
  let coast = false;
  walk(g.arcs, (a) => { if (arcUse.get(a) === 1) coast = true; });
  provinces[i].coastal = coast;
});

// Liaisons maritimes : provinces côtières à moins de 500 km (îles, détroits)
const sea = provinces.map(() => []);
const coastPts = provinces.map((p, i) => {
  if (!p.coastal) return [];
  const f = feature(simple, fg[i]);
  const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
  const all = rings.flat();
  const step = Math.max(1, Math.floor(all.length / 40));
  return all.filter((_, k) => k % step === 0);
});
const maxRad = 500 / 6371;
for (let i = 0; i < provinces.length; i++)
  for (let j = i + 1; j < provinces.length; j++) {
    if (!coastPts[i].length || !coastPts[j].length || adj[i].includes(j)) continue;
    if (geoDistance([provinces[i].lon, provinces[i].lat], [provinces[j].lon, provinces[j].lat]) > 30 * (Math.PI / 180)) continue;
    if (coastPts[i].some((a) => coastPts[j].some((b) => geoDistance(a, b) < maxRad))) {
      sea[i].push(j);
      sea[j].push(i);
    }
  }

const data = {
  topology: simple,
  provinces: provinces.map((p, i) => ({
    id: p.id, name: p.name, country: p.country, owner: p.owner, pop: p.pop, dev: p.dev, religion: p.religion,
    good: p.good, node: p.node, coastal: p.coastal, capital: p.capital || undefined, holy: p.holy, strait: p.strait,
    lon: p.lon, lat: p.lat, adj: adj[i], sea: sea[i],
  })),
};
fs.writeFileSync(OUT, JSON.stringify(data));
const size = fs.statSync(OUT).size;
console.log(`→ ${path.relative(ROOT, OUT)} : ${provinces.length} provinces, ${(size / 1024).toFixed(0)} Ko`);
const missingRel = [...unknown.keys()].filter((k) => k.startsWith('religion:'));
if (missingRel.length) console.log('Exceptions religieuses sans province :', missingRel.join(', '));
