import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { CountryFeature } from '../game/world';
import { gdpOf, popOf, power, rel, sameBloc, warBetween, alive } from '../game/state';
import type { GameState, Id } from '../game/types';

export type MapMode = 'political' | 'diplomatic' | 'economic' | 'military' | 'blocs';

const W = 1000;
const H = 520;
const NS = 'http://www.w3.org/2000/svg';

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function ramp(t: number, stops: string[]): string {
  t = Math.max(0, Math.min(1, t));
  const seg = (stops.length - 1) * t;
  const i = Math.min(stops.length - 2, Math.floor(seg));
  return mix(stops[i], stops[i + 1], seg - i);
}

interface Shape {
  id: Id;
  path: SVGPathElement;
  occ: SVGPathElement;
  label: SVGTextElement;
  area: number;
  box: [[number, number], [number, number]]; // emprise du polygone principal
}

export class MapView {
  readonly svg: SVGSVGElement;
  private root: SVGGElement;
  private shapes = new Map<Id, Shape>();
  private zoomer: ZoomBehavior<SVGSVGElement, unknown>;
  private k = 1;
  private projection = geoNaturalEarth1();
  onSelect: (territory: Id | null) => void = () => {};

  constructor(parent: HTMLElement, features: CountryFeature[]) {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.id = 'map';
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.innerHTML = `<defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="2" height="4" fill="#f85149aa"/></pattern></defs>`;
    this.root = document.createElementNS(NS, 'g');
    this.svg.appendChild(this.root);
    parent.appendChild(this.svg);

    this.projection.fitExtent([[4, 4], [W - 4, H - 4]], { type: 'Sphere' });
    const path = geoPath(this.projection);
    const sphere = document.createElementNS(NS, 'path');
    sphere.setAttribute('d', path({ type: 'Sphere' }) ?? '');
    sphere.setAttribute('fill', '#12263a');
    this.root.appendChild(sphere);
    const grat = document.createElementNS(NS, 'path');
    grat.setAttribute('d', path(geoGraticule10()) ?? '');
    grat.setAttribute('class', 'graticule');
    this.root.appendChild(grat);

    const terrLayer = document.createElementNS(NS, 'g');
    const occLayer = document.createElementNS(NS, 'g');
    const labelLayer = document.createElementNS(NS, 'g');
    this.root.append(terrLayer, occLayer, labelLayer);

    for (const f of features) {
      const id = f.properties.name;
      const d = path(f) ?? '';
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', 'terr');
      p.dataset.id = id;
      terrLayer.appendChild(p);
      const o = document.createElementNS(NS, 'path');
      o.setAttribute('d', d);
      o.setAttribute('class', 'occ');
      o.style.display = 'none';
      occLayer.appendChild(o);
      const main = this.mainPolygon(f);
      const [cx, cy] = path.centroid(main);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'label');
      t.setAttribute('x', String(cx));
      t.setAttribute('y', String(cy));
      labelLayer.appendChild(t);
      this.shapes.set(id, { id, path: p, occ: o, label: t, area: path.area(f), box: path.bounds(main) });
    }

    this.svg.addEventListener('click', (e) => {
      const id = (e.target as SVGElement).dataset?.id;
      this.onSelect(id ?? null);
    });

    this.zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 40])
      .translateExtent([[-100, -60], [W + 100, H + 60]])
      .clickDistance(6)
      .on('zoom', (e: { transform: ZoomTransform }) => {
        this.root.setAttribute('transform', e.transform.toString());
        if (Math.abs(e.transform.k - this.k) > 0.01) {
          this.k = e.transform.k;
          this.updateLabels();
        }
      });
    select(this.svg).call(this.zoomer);
  }

  /** Plus grand polygone (ignore l'Alaska, la Guyane, les îles…). */
  private mainPolygon(f: CountryFeature): GeoJSON.Polygon | CountryFeature {
    const path = geoPath(this.projection);
    const g = f.geometry;
    if (g.type !== 'MultiPolygon') return f;
    let best: GeoJSON.Polygon = { type: 'Polygon', coordinates: g.coordinates[0] };
    let bestA = -1;
    for (const coordinates of g.coordinates) {
      const poly: GeoJSON.Polygon = { type: 'Polygon', coordinates };
      const a = path.area(poly);
      if (a > bestA) {
        bestA = a;
        best = poly;
      }
    }
    return best;
  }

  focus(ids: Id[], maxK = 6) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of ids) {
      const s = this.shapes.get(id);
      if (!s) continue;
      const [[bx0, by0], [bx1, by1]] = s.box;
      x0 = Math.min(x0, bx0); y0 = Math.min(y0, by0);
      x1 = Math.max(x1, bx1); y1 = Math.max(y1, by1);
    }
    if (!Number.isFinite(x0)) return;
    const k = Math.max(1.5, Math.min(maxK, 0.35 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
    const t = zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    select(this.svg).transition().duration(600).call(this.zoomer.transform, t);
  }

  private labels = new Map<Id, string>();

  private updateLabels() {
    const k = this.k;
    const fs = 11 / Math.sqrt(k);
    for (const s of this.shapes.values()) {
      const txt = this.labels.get(s.id) ?? '';
      const visible = !!txt && s.area * k * k > txt.length * 90 * fs;
      s.label.style.display = visible ? '' : 'none';
      if (visible) s.label.setAttribute('font-size', (fs * (s.area > 4000 ? 1.4 : 1)).toFixed(2));
    }
  }

  render(s: GameState, mode: MapMode, selected: Id | null) {
    const me = s.player;
    const maxPow = Math.max(...alive(s).map((n) => power(n)));
    this.labels.clear();
    const labelled = new Set<Id>();
    for (const sh of this.shapes.values()) {
      const t = s.territories[sh.id];
      if (!t) {
        sh.path.setAttribute('fill', '#2b3440');
        continue;
      }
      const n = s.nations[t.owner];
      let fill = n.color;
      switch (mode) {
        case 'diplomatic': {
          if (n.id === me) fill = '#d4a017';
          else if (warBetween(s, me, n.id)) fill = '#c62828';
          else if (sameBloc(s, me, n.id)) fill = '#2f6fdb';
          else fill = ramp((rel(s, me, n.id) + 100) / 200, ['#8e2b2b', '#6b6f76', '#3c8d4f']);
          break;
        }
        case 'economic': {
          const pc = (gdpOf(s, n.id) * 1000) / Math.max(popOf(s, n.id), 0.01);
          fill = ramp(Math.log10(Math.max(pc, 300) / 300) / Math.log10(100000 / 300), ['#3b1d4a', '#2f6f8f', '#4fbf7a', '#e8e36a']);
          break;
        }
        case 'military': {
          fill = ramp(Math.log10(1 + (power(n) / maxPow) * 999) / 3, ['#2b2f36', '#7a4a2a', '#c0392b', '#ff6b4a']);
          break;
        }
        case 'blocs': {
          fill = n.bloc ? s.blocs[n.bloc].color : '#4a5059';
          break;
        }
      }
      sh.path.setAttribute('fill', fill);
      sh.path.classList.toggle('player', t.owner === me);
      sh.path.classList.toggle('selected', !!selected && t.owner === s.territories[selected]?.owner && t.owner !== me);
      sh.occ.style.display = t.occupiedBy ? '' : 'none';
      // Une étiquette par nation, sur son territoire d'origine s'il le possède encore
      if (!labelled.has(n.id) && (t.id === n.id || !s.territories[n.id] || s.territories[n.id].owner !== n.id)) {
        labelled.add(n.id);
        this.labels.set(sh.id, n.name);
      }
    }
    for (const sh of this.shapes.values()) {
      const txt = this.labels.get(sh.id) ?? '';
      if (sh.label.textContent !== txt) sh.label.textContent = txt;
    }
    this.updateLabels();
  }
}
