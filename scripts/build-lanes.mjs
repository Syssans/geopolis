/**
 * Calcule le tracé maritime exact de chaque liaison commerciale à partir du réseau
 * Marnet (Eurostat, distribué par le paquet npm « searoute-js », licence MIT).
 * Résultat : src/data/lanes.json — { "a|b": [[lon, lat], …] } orienté de a vers b (ordre alphabétique).
 *
 * Usage : node scripts/build-lanes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { geoDistance } from 'd3-geo';
import { build } from 'esbuild';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(ROOT, 'scripts', '.cache');
const OUT = path.join(ROOT, 'src', 'data', 'lanes.json');

async function loadTs(file) {
  const res = await build({ entryPoints: [path.join(ROOT, file)], bundle: true, write: false, format: 'esm', platform: 'node', loader: { '.json': 'json' } });
  return import('data:text/javascript;base64,' + Buffer.from(res.outputFiles[0].text).toString('base64'));
}
const { TRADE_NODES } = await loadTs('src/data/trade.ts');
const { PORTS, LAND, laneKey, EXTRA_LANES } = await loadTs('src/data/routes.ts');

// ——— Réseau Marnet ———
const marnetFile = path.join(CACHE, 'package', 'data', 'marnet_densified.json');
if (!fs.existsSync(marnetFile)) {
  fs.mkdirSync(CACHE, { recursive: true });
  execSync('npm pack searoute-js && tar xzf searoute-js-*.tgz', { cwd: CACHE, stdio: 'inherit' });
}
const marnet = JSON.parse(fs.readFileSync(marnetFile, 'utf8'));

const key = ([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`;
const coords = new Map(); // clé → [lon, lat]
const adj = new Map(); // clé → [[clé, poids]]
const link = (a, b, wgt) => {
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a).push([b, wgt]);
  adj.get(b).push([a, wgt]);
};
for (const f of marnet.features) {
  const cs = f.geometry.coordinates;
  for (let i = 0; i < cs.length; i++) {
    coords.set(key(cs[i]), cs[i]);
    if (i) link(key(cs[i - 1]), key(cs[i]), geoDistance(cs[i - 1], cs[i]));
  }
}
// Couture de l'antiméridien
for (const [k, [x, y]] of coords) if (x === 180 && coords.has(key([-180, y]))) link(k, key([-180, y]), 0);
// Composante connexe principale : les ports s'y accrochent (le réseau contient de petits fragments isolés)
const main = new Set();
{
  let best = [];
  const seen = new Set();
  for (const k of adj.keys()) {
    if (seen.has(k)) continue;
    const comp = [k];
    seen.add(k);
    for (let i = 0; i < comp.length; i++)
      for (const [v] of adj.get(comp[i]))
        if (!seen.has(v)) {
          seen.add(v);
          comp.push(v);
        }
    if (comp.length > best.length) best = comp;
  }
  for (const k of best) main.add(k);
}
console.log(`Réseau : ${coords.size} sommets, composante principale ${main.size}`);

function nearest(pt) {
  let best = null;
  let d = Infinity;
  for (const [k, c] of coords) {
    if (!main.has(k)) continue;
    const dd = geoDistance(pt, c);
    if (dd < d) {
      d = dd;
      best = k;
    }
  }
  return best;
}

/** Dijkstra avec tas binaire. */
function shortest(from, to) {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const heap = [[0, from]];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (u === to) break;
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const [v, wgt] of adj.get(u) ?? []) {
      const nd = d + wgt;
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, u);
        push([nd, v]);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path.map((k) => coords.get(k));
}

/** Ne garde qu’un point tous les ~50 km (tracé fidèle mais léger). */
function thin(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) if (geoDistance(out[out.length - 1], pts[i]) > 50 / 6371 || Math.abs(pts[i][0]) === 180) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  return out.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}

const pairs = new Set();
for (const n of TRADE_NODES) for (const o of n.out) pairs.add(laneKey(n.id, o));
for (const [a, b] of EXTRA_LANES) pairs.add(laneKey(a, b));

const lanes = {};
for (const k of pairs) {
  if (LAND.has(k)) continue;
  const [a, b] = k.split('|');
  const route = shortest(nearest(PORTS[a]), nearest(PORTS[b]));
  if (!route) {
    console.warn('Pas de route maritime :', k);
    continue;
  }
  lanes[k] = thin([PORTS[a], ...route, PORTS[b]]);
}
fs.writeFileSync(OUT, JSON.stringify(lanes));
console.log(`→ ${path.relative(ROOT, OUT)} : ${Object.keys(lanes).length} liaisons, ${Object.values(lanes).reduce((s, l) => s + l.length, 0)} points, ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko`);
