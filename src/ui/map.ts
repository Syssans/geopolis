import { geoArea, geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { feature, mesh } from 'topojson-client';
import type { Feature, Geometry, MultiLineString } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { RELIGIONS } from '../data/religions';
import { STRAITS, TRADE_NODES } from '../data/trade';
import { rel, sameBloc, warBetween } from '../game/state';
import { straitClosed } from '../game/trade';
import type { GameState, Id, Pid, World } from '../game/types';

export type MapMode = 'political' | 'religion' | 'trade' | 'diplomatic' | 'unrest';

const W = 1000;
const H = 520;
const NS = 'http://www.w3.org/2000/svg';

const NODE_COLORS = ['#e6a23c', '#67c23a', '#409eff', '#f56c6c', '#b37feb', '#36cfc9', '#ffc53d', '#ff85c0', '#95de64', '#69c0ff', '#ff9c6e', '#d3adf7', '#5cdbd3'];

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

/** d3-geo attend des anneaux extérieurs dans le sens horaire : un polygone inversé couvrirait tout le globe. */
function rewind(f: Feature<Geometry>): Feature<Geometry> {
  const fix = (rings: number[][][]) =>
    geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI ? rings.map((r) => r.slice().reverse()) : rings;
  const g = f.geometry;
  if (g.type === 'Polygon') return { ...f, geometry: { ...g, coordinates: fix(g.coordinates) } };
  if (g.type === 'MultiPolygon') return { ...f, geometry: { ...g, coordinates: g.coordinates.map(fix) } };
  return f;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, parent?: Element) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

export class MapView {
  readonly svg: SVGSVGElement;
  private root: SVGGElement;
  private paths: SVGPathElement[] = [];
  private occ: SVGPathElement[] = [];
  private borders: SVGPathElement;
  private labelLayer: SVGGElement;
  private tradeLayer: SVGGElement;
  private zoomer: ZoomBehavior<SVGSVGElement, unknown>;
  private k = 1;
  private projection = geoNaturalEarth1();
  private path = geoPath(this.projection);
  private feats: Feature<Geometry>[];
  private areas: number[];
  private centers: [number, number][];
  private boxes: [[number, number], [number, number]][];
  private lastOwners = '';
  onSelect: (pid: Pid | null) => void = () => {};

  constructor(parent: HTMLElement, private topo: Topology, private world: World) {
    this.svg = el('svg', { id: 'map', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
    this.svg.innerHTML = `<defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="2" height="4" fill="#f85149aa"/></pattern>
      <pattern id="fire" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="2.5" height="5" fill="#ff9800cc"/></pattern>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#ffffffcc"/></marker></defs>`;
    this.root = el('g', {}, this.svg);
    parent.appendChild(this.svg);

    this.projection.fitExtent([[4, 4], [W - 4, H - 4]], { type: 'Sphere' });
    el('path', { d: this.path({ type: 'Sphere' }) ?? '', fill: '#12263a' }, this.root);
    el('path', { d: this.path(geoGraticule10()) ?? '', class: 'graticule' }, this.root);

    const obj = topo.objects.provinces as GeometryCollection;
    this.feats = (feature(topo, obj) as unknown as { features: Feature<Geometry>[] }).features.map(rewind);
    const provLayer = el('g', {}, this.root);
    const occLayer = el('g', {}, this.root);
    this.borders = el('path', { class: 'borders' }, this.root);
    this.tradeLayer = el('g', { class: 'trade' }, this.root);
    this.labelLayer = el('g', {}, this.root);
    this.areas = [];
    this.centers = [];
    this.boxes = [];
    this.feats.forEach((f, i) => {
      const d = this.path(f) ?? '';
      const p = el('path', { d, class: 'prov' }, provLayer);
      p.dataset.pid = String(i);
      this.paths.push(p);
      const o = el('path', { d, class: 'occ' }, occLayer);
      o.style.display = 'none';
      this.occ.push(o);
      this.areas.push(this.path.area(f));
      this.centers.push(this.path.centroid(f));
      this.boxes.push(this.path.bounds(f));
    });

    this.svg.addEventListener('click', (e) => {
      const pid = (e.target as SVGElement).dataset?.pid;
      this.onSelect(pid === undefined ? null : Number(pid));
    });

    this.zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 60])
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

  /** Centre la vue sur des provinces ; `raise` remonte la cible (panneau ouvert en bas de l'écran). */
  focus(pids: Pid[], maxK = 8, raise = false) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    // Ignorer les territoires lointains (Guyane, Alaska…) : on garde ceux proches de la plus grosse province
    const main = pids.slice().sort((a, b) => this.areas[b] - this.areas[a])[0];
    if (main === undefined) return;
    const [mx, my] = this.centers[main];
    for (const pid of pids) {
      const [cx, cy] = this.centers[pid];
      if (Math.hypot(cx - mx, cy - my) > 120) continue;
      const [[bx0, by0], [bx1, by1]] = this.boxes[pid];
      x0 = Math.min(x0, bx0); y0 = Math.min(y0, by0);
      x1 = Math.max(x1, bx1); y1 = Math.max(y1, by1);
    }
    const k = Math.max(1.5, Math.min(maxK, 0.35 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
    // Hauteur visible réelle en unités de la viewBox (écran portrait : plus haute que H)
    const rect = this.svg.getBoundingClientRect();
    const unit = rect.width ? Math.max(W / rect.width, H / rect.height) : 1;
    const dy = raise && rect.width < 820 ? rect.height * 0.28 * unit : 0;
    const t = zoomIdentity.translate(W / 2, H / 2 - dy).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    select(this.svg).transition().duration(600).call(this.zoomer.transform, t);
  }

  // ————— Étiquettes des nations —————
  private labels: { text: SVGTextElement; area: number; len: number }[] = [];

  private buildLabels(s: GameState) {
    this.labelLayer.innerHTML = '';
    this.labels = [];
    const byNation = new Map<Id, Pid[]>();
    s.provinces.forEach((p, i) => {
      if (!byNation.has(p.owner)) byNation.set(p.owner, []);
      byNation.get(p.owner)!.push(i);
    });
    for (const [id, pids] of byNation) {
      const main = pids.reduce((a, b) => (this.areas[a] >= this.areas[b] ? a : b));
      const [cx, cy] = this.centers[main];
      // Aire de la « masse principale » : provinces proches de la plus grande
      const area = pids.filter((p) => Math.hypot(this.centers[p][0] - cx, this.centers[p][1] - cy) < 80).reduce((a, p) => a + this.areas[p], 0);
      // Barycentre pondéré de cette masse
      let sx = 0, sy = 0, sw = 0;
      for (const p of pids) {
        const [x, y] = this.centers[p];
        if (Math.hypot(x - cx, y - cy) >= 80) continue;
        sx += x * this.areas[p]; sy += y * this.areas[p]; sw += this.areas[p];
      }
      const name = s.nations[id].name;
      const t = el('text', { class: 'label', x: String(sw ? sx / sw : cx), y: String(sw ? sy / sw : cy) }, this.labelLayer);
      t.textContent = name;
      this.labels.push({ text: t, area, len: name.length });
    }
    this.updateLabels();
  }

  private updateLabels() {
    const k = this.k;
    for (const l of this.labels) {
      // Taille à l'écran proportionnelle à l'étendue du pays, plafonnée pour rester lisible
      const screen = Math.min(20, ((Math.sqrt(l.area) * k) / l.len) * 1.5);
      const visible = screen >= 7;
      l.text.style.display = visible ? '' : 'none';
      if (visible) l.text.setAttribute('font-size', (screen / k).toFixed(3));
    }
  }

  // ————— Surcouche commerciale —————
  private drawTrade(s: GameState, selectedNode: string | null) {
    const g = this.tradeLayer;
    g.innerHTML = '';
    const pos = new Map(TRADE_NODES.map((n) => [n.id, this.projection([n.lon, n.lat])!]));
    for (const n of TRADE_NODES)
      for (const o of n.out) {
        const [x0, y0] = pos.get(n.id)!;
        const [x1, y1] = pos.get(o)!;
        if (Math.abs(x1 - x0) > W / 2) continue; // liaison transpacifique : ne pas traverser la carte
        el('line', { x1: String(x0), y1: String(y0), x2: String(x1), y2: String(y1), class: 'flow', 'marker-end': 'url(#arrow)' }, g);
      }
    // Routes des contrats du joueur
    for (const c of s.contracts) {
      const pts = c.route.nodes.map((id) => pos.get(id)!).filter(Boolean);
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        if (Math.abs(x1 - x0) > W / 2) continue;
        el('line', { x1: String(x0), y1: String(y0), x2: String(x1), y2: String(y1), class: `route ${c.lastStatus}` }, g);
      }
    }
    for (const n of TRADE_NODES) {
      const [x, y] = pos.get(n.id)!;
      const c = el('circle', { cx: String(x), cy: String(y), r: n.id === selectedNode ? '6' : '4', class: 'node' }, g);
      c.dataset.node = n.id;
      const t = el('text', { x: String(x), y: String(y - 7), class: 'node-label' }, g);
      t.textContent = n.name;
    }
    for (const st of STRAITS) {
      const info = this.world.provinces.find((p) => p.strait === st.id);
      if (!info) continue;
      const [x, y] = this.centers[info.id];
      const t = el('text', { x: String(x), y: String(y), class: `strait ${straitClosed(s, this.world, st.id) ? 'closed' : ''}` }, g);
      t.textContent = '⚓';
    }
  }

  render(s: GameState, mode: MapMode, selected: Pid | null) {
    const me = s.player;
    const nodeIdx = new Map(TRADE_NODES.map((n, i) => [n.id, i]));
    const selOwner = selected !== null ? s.provinces[selected].owner : null;
    s.provinces.forEach((p, i) => {
      const info = this.world.provinces[i];
      const n = s.nations[p.owner];
      let fill = n.color;
      switch (mode) {
        case 'religion':
          fill = RELIGIONS[p.religion].color;
          break;
        case 'trade':
          fill = mix(NODE_COLORS[nodeIdx.get(info.node)! % NODE_COLORS.length], '#1b2533', 0.45);
          break;
        case 'unrest':
          fill = p.revolt ? '#ff3b30' : ramp(p.unrest / 80, ['#2f4a3a', '#b8a642', '#d9622b', '#b3261e']);
          break;
        case 'diplomatic':
          if (n.id === me) fill = '#d4a017';
          else if (warBetween(s, me, n.id)) fill = '#c62828';
          else if (sameBloc(s, me, n.id)) fill = '#2f6fdb';
          else fill = ramp((rel(s, me, n.id) + 100) / 200, ['#8e2b2b', '#6b6f76', '#3c8d4f']);
          break;
      }
      const path = this.paths[i];
      path.setAttribute('fill', fill);
      path.classList.toggle('mine', p.owner === me);
      path.classList.toggle('selected', i === selected);
      path.classList.toggle('sel-nation', p.owner === selOwner && i !== selected);
      const o = this.occ[i];
      o.style.display = p.occupiedBy || p.revolt ? '' : 'none';
      o.setAttribute('fill', p.revolt ? 'url(#fire)' : 'url(#hatch)');
    });
    // Frontières nationales : recalculées seulement si la carte politique a changé
    const owners = s.provinces.map((p) => p.owner).join(',');
    if (owners !== this.lastOwners) {
      this.lastOwners = owners;
      const obj = this.topo.objects.provinces as GeometryCollection;
      const m = mesh(this.topo, obj, (a, b) => {
        const ia = (a as { id?: number }).id!;
        const ib = (b as { id?: number }).id!;
        return a === b || s.provinces[ia].owner !== s.provinces[ib].owner;
      }) as MultiLineString;
      this.borders.setAttribute('d', this.path(m) ?? '');
      this.buildLabels(s);
    }
    this.labelLayer.style.display = mode === 'trade' ? 'none' : '';
    if (mode === 'trade') this.drawTrade(s, selected !== null ? this.world.provinces[selected].node : null);
    else this.tradeLayer.innerHTML = '';
  }
}
