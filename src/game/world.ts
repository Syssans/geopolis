import { geoCentroid } from 'd3-geo';
import { feature, neighbors } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { COUNTRIES, DEPENDENCIES } from '../data/countries';
import type { World } from './types';

export type CountryFeature = Feature<Geometry, { name: string }>;

const KNOWN = new Set([...COUNTRIES.map((c) => c.atlas), ...Object.keys(DEPENDENCIES)]);
const NEAR_KM = 800;
const EARTH_KM = 6371;

export function countryFeatures(topo: Topology): CountryFeature[] {
  const fc = feature(topo, topo.objects.countries as GeometryCollection<{ name: string }>) as FeatureCollection<
    Geometry,
    { name: string }
  >;
  return fc.features.filter((f) => KNOWN.has(f.properties.name));
}

type Vec = [number, number, number];

const toVec = ([lon, lat]: number[]): Vec => {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
};
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angle = (a: Vec, b: Vec) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** Échantillonne le contour (≤ 80 points) pour estimer la distance entre deux pays. */
function samplePoints(f: CountryFeature): Vec[] {
  const g = f.geometry;
  const rings =
    g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : ([] as number[][][]);
  const all = rings.flat();
  const step = Math.max(1, Math.floor(all.length / 80));
  const pts: Vec[] = [];
  for (let i = 0; i < all.length; i += step) pts.push(toVec(all[i]));
  return pts;
}

export function buildWorld(topo: Topology): World {
  const geoms = (topo.objects.countries as GeometryCollection<{ name: string }>).geometries;
  const nameOf = (i: number) => (geoms[i].properties as { name: string }).name;
  const nb = neighbors(geoms as never);
  const adjacent: World['adjacent'] = {};
  geoms.forEach((_, i) => {
    const name = nameOf(i);
    if (!KNOWN.has(name)) return;
    adjacent[name] = nb[i].map(nameOf).filter((n) => KNOWN.has(n));
  });

  const feats = countryFeatures(topo);
  const samples = feats.map(samplePoints);
  const centers = feats.map((f) => toVec(geoCentroid(f)));
  const radius = samples.map((pts, i) => Math.max(0, ...pts.map((p) => angle(p, centers[i]))));
  const near: World['near'] = {};
  for (const f of feats) near[f.properties.name] = [...(adjacent[f.properties.name] ?? [])];
  const maxRad = NEAR_KM / EARTH_KM;
  const cosMax = Math.cos(maxRad);
  for (let i = 0; i < feats.length; i++)
    for (let j = i + 1; j < feats.length; j++) {
      const a = feats[i].properties.name;
      const b = feats[j].properties.name;
      if (near[a].includes(b)) continue;
      if (angle(centers[i], centers[j]) > radius[i] + radius[j] + maxRad) continue;
      const close = samples[i].some((p) => samples[j].some((q) => dot(p, q) > cosMax));
      if (close) {
        near[a].push(b);
        near[b].push(a);
      }
    }
  return { adjacent, near };
}
