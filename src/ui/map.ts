import { geoArea, geoCentroid, geoDistance, geoGraticule10, geoInterpolate, geoNaturalEarth1, geoPath } from 'd3-geo';
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { feature } from 'topojson-client';
import type { Feature, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import CAPITALS from '../data/capitals.json';
import { HOLY_SITES, holyHolders, RELIGIONS } from '../data/religions';
import { GOODS, STRAITS, TRADE_NODES } from '../data/trade';
import { EXTRA_LANES, LAND, lane, laneKey, PORTS, routePath, type LonLat } from '../data/routes';
import { clock } from '../game/convoys';
import { FAITH_DEFS, FAITH_OF } from './faith-icons';
import { rel, sameBloc, warBetween } from '../game/state';
import { straitClosed } from '../game/trade';
import type { Convoy, GameState, Id, Pid, World } from '../game/types';

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

interface Track {
  pts: ([number, number] | null)[];
  cum: number[];
  total: number;
}

interface Dot {
  g: SVGGElement;
  convoy: Convoy;
  track: Track;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, parent?: Element) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

const geoCentroidOf = (f: Feature<Geometry>) => geoCentroid(f) as LonLat;

export class MapView {
  readonly svg: SVGSVGElement;
  private root: SVGGElement;
  private paths: SVGPathElement[] = [];
  private occ: SVGPathElement[] = [];
  private borders: SVGPathElement;
  private labelLayer: SVGGElement;
  private tradeLayer: SVGGElement;
  private markerLayer: SVGGElement;
  private outline: SVGPathElement;
  private outlineSig = '';
  private goodsLayer: SVGGElement;
  private goodsSig = '';
  private markerSig = '';
  private convoyLayer: SVGGElement;
  private overlay: SVGSVGElement;
  private overlayRoot: SVGGElement;
  private trackCache = new Map<string, Track>();
  private dots = new Map<number, Dot>();
  private routeLine: SVGPathElement;
  private monthMs = 0; // durée réelle d'un mois de jeu (0 = pause)
  private baseClock = 0; // début du mois en cours
  private frac = 0; // fraction écoulée du mois en cours
  private showAll = false;
  private selConvoy: number | null = null;
  private lastFrame = 0;
  private zoomer: ZoomBehavior<SVGSVGElement, unknown>;
  private k = 1;
  private projection = geoNaturalEarth1();
  private path = geoPath(this.projection);
  private feats: Feature<Geometry>[];
  private areas: number[];
  private centers: [number, number][];
  private boxes: [[number, number], [number, number]][];
  private lastOwners = '';
  private arcCache: { users: number[][]; paths: string[] } | null = null;

  /** Chaque segment de frontière du fond de carte : les provinces qu'il sépare et son tracé projeté. */
  private arcs() {
    if (this.arcCache) return this.arcCache;
    const topo = this.topo as unknown as { arcs: number[][][]; transform: { scale: [number, number]; translate: [number, number] } };
    const users: number[][] = topo.arcs.map(() => []);
    const obj = this.topo.objects.provinces as GeometryCollection;
    const add = (ring: number[], id: number) => {
      for (const idx of ring) {
        const a = idx < 0 ? ~idx : idx;
        if (!users[a].includes(id)) users[a].push(id);
      }
    };
    for (const g of obj.geometries as unknown as { type: string; id: number; arcs: number[][] | number[][][] }[]) {
      if (g.type === 'Polygon') for (const ring of g.arcs as number[][]) add(ring, g.id);
      else if (g.type === 'MultiPolygon') for (const poly of g.arcs as number[][][]) for (const ring of poly) add(ring, g.id);
    }
    // Certains voisins ne partagent pas le même arc (deux tracés identiques en double, enclaves comme Brasília) :
    // on les apparie par leurs extrémités pour ne pas les dessiner comme une côte ou une frontière
    const ends = new Map<string, number>();
    topo.arcs.forEach((arc, i) => {
      if (users[i].length !== 1 || arc.length < 4) return;
      let x = 0, y = 0;
      const pts = arc.map(([dx, dy]) => [(x += dx), (y += dy)]);
      // Clé : tous les points, dans un sens canonique (un arc partagé est parcouru à l'envers par le voisin)
      const fwd = pts.map((q) => q.join()).join(' ');
      const rev = pts.slice().reverse().map((q) => q.join()).join(' ');
      const key = fwd < rev ? fwd : rev;
      const j = ends.get(key);
      if (j === undefined) ends.set(key, i);
      else if (users[j][0] !== users[i][0]) {
        users[i].push(users[j][0]);
        users[j].push(users[i][0]);
      }
    });
    const [sx, sy] = topo.transform.scale;
    const [tx, ty] = topo.transform.translate;
    const paths = topo.arcs.map((arc) => {
      let x = 0;
      let y = 0;
      const coords = arc.map(([dx, dy]) => {
        x += dx;
        y += dy;
        return [x * sx + tx, y * sy + ty];
      });
      return this.path({ type: 'LineString', coordinates: coords }) ?? '';
    });
    return (this.arcCache = { users, paths });
  }
  private pathState: string[] = [];
  private tradeSig = '';
  private lastSel: number | null = null;
  private view: ZoomTransform = zoomIdentity;
  private resizePending = false;
  private svgWidth = 0;
  private pxPerUnit() {
    if (!this.svgWidth) {
      this.svgWidth = this.svg.clientWidth || 390;
      window.addEventListener('resize', () => (this.svgWidth = 0), { once: true });
    }
    return this.svgWidth / W;
  }
  onSelect: (pid: Pid | null) => void = () => {};
  onConvoy: (id: number) => void = () => {};

  constructor(parent: HTMLElement, private topo: Topology, private world: World) {
    this.svg = el('svg', { id: 'map', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
    this.svg.innerHTML = `<defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="2" height="4" fill="#f85149aa"/></pattern>
      <pattern id="fire" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="2.5" height="5" fill="#ff9800cc"/></pattern>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#ffffffcc"/></marker>${FAITH_DEFS}</defs>`;
    this.root = el('g', {}, this.svg);
    parent.appendChild(this.svg);

    this.projection.fitExtent([[4, 4], [W - 4, H - 4]], { type: 'Sphere' });
    el('path', { d: this.path({ type: 'Sphere' }) ?? '', class: 'sphere' }, this.root);
    el('path', { d: this.path(geoGraticule10()) ?? '', class: 'graticule' }, this.root);

    const obj = topo.objects.provinces as GeometryCollection;
    this.feats = (feature(topo, obj) as unknown as { features: Feature<Geometry>[] }).features.map(rewind);
    const provLayer = el('g', {}, this.root);
    const occLayer = el('g', {}, this.root);
    this.borders = el('path', { class: 'borders' }, this.root);
    this.outline = el('path', { class: 'nation-outline' }, this.root);
    this.goodsLayer = el('g', { class: 'prov-goods' }, this.root);
    this.tradeLayer = el('g', { class: 'trade' }, this.root);
    this.labelLayer = el('g', {}, this.root);
    this.markerLayer = el('g', { class: 'markers' }, this.root);
    // Les convois bougent à chaque image : dans un SVG à part, leur animation ne force plus à repeindre les ~900 provinces
    this.overlay = el('svg', { id: 'convoy-map', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
    parent.appendChild(this.overlay);
    // Vignettage aux couleurs du thème culturel (statique : ne coûte rien à l'animation)
    const vignette = document.createElement('div');
    vignette.className = 'map-vignette';
    parent.appendChild(vignette);
    this.overlayRoot = el('g', {}, this.overlay);
    this.convoyLayer = el('g', { class: 'convoys' }, this.overlayRoot);
    this.routeLine = el('path', { class: 'convoy-route' }, this.convoyLayer);
    requestAnimationFrame(this.animate);
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

    this.overlay.addEventListener('click', (e) => {
      const convoy = (e.target as SVGElement).closest<SVGElement>('[data-convoy]')?.dataset.convoy;
      if (convoy) this.onConvoy(Number(convoy));
    });
    this.svg.addEventListener('click', (e) => {
      const convoy = (e.target as SVGElement).closest<SVGElement>('[data-convoy]')?.dataset.convoy;
      if (convoy) return this.onConvoy(Number(convoy));
      const pid = (e.target as SVGElement).dataset?.pid;
      this.onSelect(pid === undefined ? null : Number(pid));
    });

    this.zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 60])
      .translateExtent([[-100, -60], [W + 100, H + 60]])
      .clickDistance(6)
      .on('zoom', (e: { transform: ZoomTransform }) => {
        this.root.setAttribute('transform', e.transform.toString());
        this.overlayRoot.setAttribute('transform', e.transform.toString());
        this.view = e.transform;
        // Tailles des textes et icônes : recalculées au plus une fois par image, et seulement si le zoom a vraiment changé
        if (Math.abs(e.transform.k / this.k - 1) > 0.02 && !this.resizePending) {
          this.resizePending = true;
          requestAnimationFrame(() => {
            this.resizePending = false;
            this.k = this.view.k;
            this.updateLabels();
            this.sizeDots();
            this.sizeTrade();
            this.sizeMarkers();
            this.sizeGoods();
          });
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

  /** Centre la vue sur un point géographique [lon, lat] et le signale par un halo. */
  focusPoint(ll: LonLat, k = 6) {
    const p = this.projection(ll as [number, number]);
    if (!p) return;
    const t = zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-p[0], -p[1]);
    select(this.svg).transition().duration(700).call(this.zoomer.transform, t);
    const ping = el('circle', { cx: String(p[0]), cy: String(p[1]), r: '1', class: 'ping' }, this.root);
    setTimeout(() => ping.remove(), 2600);
  }

  /** Centre sur un nœud commercial (son port). */
  focusNode(node: string) {
    if (PORTS[node]) this.focusPoint(PORTS[node]);
  }

  /** Centre sur un détroit (sa province). */
  focusStrait(id: string) {
    const info = this.world.provinces.find((p) => p.strait === id);
    if (info) this.focusPoint(geoCentroidOf(this.feats[info.id]), 7);
  }

  // ————— Étiquettes des nations —————
  private labels: { id: Id; text: SVGTextElement; area: number; len: number; hidden?: boolean }[] = [];
  private labelSig = '';

  private buildLabels(s: GameState) {
    this.labelLayer.innerHTML = '';
    this.labels = [];
    const byNation = new Map<Id, Pid[]>();
    s.provinces.forEach((p, i) => {
      if (!byNation.has(p.owner)) byNation.set(p.owner, []);
      byNation.get(p.owner)!.push(i);
    });
    for (const [id, pids] of byNation) {
      // Nom posé sur le territoire d'origine du pays, pas sur un territoire rattaché (Groenland pour le Danemark…)
      const home = pids.filter((p) => this.world.provinces[p].country === id);
      const pool = home.length ? home : pids;
      // Nom posé au centre du plus grand bloc de territoire d'un seul tenant (les 48 États plutôt que l'Alaska)
      const inPool = new Set(pool);
      const seen = new Set<Pid>();
      let best: Pid[] = [];
      let bestArea = -1;
      for (const start of pool) {
        if (seen.has(start)) continue;
        const comp: Pid[] = [];
        const stack = [start];
        seen.add(start);
        while (stack.length) {
          const p = stack.pop()!;
          comp.push(p);
          for (const q of this.world.provinces[p].adj) if (inPool.has(q) && !seen.has(q)) { seen.add(q); stack.push(q); }
        }
        const a = comp.reduce((x, p) => x + this.areas[p], 0);
        if (a > bestArea) { bestArea = a; best = comp; }
      }
      const area = bestArea;
      let sx = 0, sy = 0, sw = 0;
      for (const p of best) {
        const [x, y] = this.centers[p];
        sx += x * this.areas[p]; sy += y * this.areas[p]; sw += this.areas[p];
      }
      const [cx, cy] = this.centers[best[0]];
      const name = s.nations[id].name;
      const t = el('text', { class: 'label', x: String(sw ? sx / sw : cx), y: String(sw ? sy / sw : cy) }, this.labelLayer);
      t.textContent = name;
      this.labels.push({ id, text: t, area, len: name.length });
    }
    this.labelSig = '';
    this.updateLabels();
  }

  /** Politique : noms des pays. Diplomatie : 🌍 et relations avec vous. Autres cartes : rien. */
  private labelMode(s: GameState, mode: MapMode) {
    const show = mode === 'political' || mode === 'diplomatic';
    this.labelLayer.style.display = show ? '' : 'none';
    if (!show) return;
    const vals = mode === 'diplomatic' ? this.labels.map((l) => (l.id === s.player ? 'x' : Math.round(rel(s, s.player, l.id)))) : [];
    const sig = `${mode}|${s.player}|${vals.join(',')}`;
    if (sig === this.labelSig) return;
    this.labelSig = sig;
    this.labels.forEach((l, i) => {
      if (mode === 'political') {
        l.text.textContent = s.nations[l.id].name;
        l.text.setAttribute('class', 'label');
        l.hidden = false;
      } else {
        const v = vals[i];
        l.hidden = v === 'x';
        l.text.textContent = v === 'x' ? '' : `🌍 ${Number(v) > 0 ? '+' : Number(v) < 0 ? '−' : ''}${Math.abs(Number(v))}`;
        l.text.setAttribute('class', `label rel ${Number(v) > 0 ? 'pos' : Number(v) < 0 ? 'neg' : ''}`);
      }
      l.len = Math.max(4, l.text.textContent!.length);
    });
    this.updateLabels();
  }

  private updateLabels() {
    const k = this.k;
    for (const l of this.labels) {
      // Taille à l'écran proportionnelle à l'étendue du pays, plafonnée pour rester lisible
      const screen = Math.min(20, ((Math.sqrt(l.area) * k) / l.len) * 1.5);
      const visible = screen >= 7 && !l.hidden;
      l.text.style.display = visible ? '' : 'none';
      if (visible) {
        l.text.setAttribute('font-size', (screen / k).toFixed(3));
        l.text.setAttribute('stroke-width', ((screen / k) * 0.28).toFixed(3));
      }
    }
  }

  // ————— Surcouche commerciale —————

  /** Tracé projeté et densifié d'une suite de points ; `null` marque une coupure (antiméridien). */
  private project(line: LonLat[]): ([number, number] | null)[] {
    const out: ([number, number] | null)[] = [];
    let prev: [number, number] | null = null;
    for (let i = 0; i < line.length; i++) {
      const a = line[i];
      const b = line[i + 1];
      const steps = b ? Math.max(1, Math.ceil((geoDistance(a, b) * 180) / Math.PI / 2)) : 1;
      const interp = b ? geoInterpolate(a, b) : null;
      for (let k = 0; k < (b ? steps : 1); k++) {
        const ll = interp ? interp(k / steps) : a;
        const p = this.projection(ll as [number, number]) as [number, number];
        if (prev && Math.abs(p[0] - prev[0]) > W / 2) out.push(null);
        out.push(p);
        prev = p;
      }
    }
    return out;
  }

  private track(nodes: string[]): Track {
    const key = nodes.join('>');
    let tr = this.trackCache.get(key);
    if (!tr) {
      const pts = this.project(routePath(nodes));
      const cum: number[] = [0];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        cum.push(cum[i - 1] + (a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0));
      }
      tr = { pts, cum, total: cum[cum.length - 1] || 1 };
      this.trackCache.set(key, tr);
    }
    return tr;
  }

  /** Point d'un tracé à l'abscisse relative u (0 → 1), ou null au passage de l'antiméridien. */
  private pointAt(t: Track, u: number): [number, number] | null {
    const d = u * t.total;
    let lo = 0;
    let hi = t.cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (t.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const a = t.pts[lo];
    const b = t.pts[hi];
    if (!a || !b) return null;
    const f = t.cum[hi] > t.cum[lo] ? (d - t.cum[lo]) / (t.cum[hi] - t.cum[lo]) : 0;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }

  /** Synchronise les points avec les convois réels de la simulation. */
  private syncConvoys(s: GameState, mode: MapMode, selConvoy: number | null) {
    const t = clock(s);
    if (t !== this.baseClock) {
      // Nouveau mois : on garde l'avance déjà prise (pas de saut en arrière ni d'arrêt des convois)
      this.frac = t === this.baseClock + 1 ? Math.max(0, Math.min(0.5, this.frac - 1)) : 0;
      this.baseClock = t;
    }
    this.showAll = mode === 'trade';
    this.overlay.style.display = this.showAll ? '' : 'none';
    const keep = new Set<number>();
    for (const c of s.convoys) {
      // Les convois n'apparaissent que sur la carte du commerce
      if (!this.showAll) continue;
      keep.add(c.id);
      let d = this.dots.get(c.id);
      const cls = `convoy ${c.from === s.player ? 'mine' : c.to === s.player ? 'inbound' : warBetween(s, s.player, c.from) ? 'enemy' : ''} ${c.id === selConvoy ? 'sel' : ''}`;
      if (!d) {
        const g = el('g', { class: cls }, this.convoyLayer);
        g.dataset.convoy = String(c.id);
        const k = Math.sqrt(this.k);
        el('circle', { class: 'hit', r: (14 / k).toFixed(2) }, g);
        el('circle', { class: 'dot', r: ((c.id === selConvoy ? 4 : 2.6) / k).toFixed(2) }, g);
        d = { g, convoy: c, track: this.track(c.nodes) };
        this.dots.set(c.id, d);
      } else {
        d.convoy = c;
        d.g.setAttribute('class', cls);
      }
    }
    for (const [id, d] of this.dots)
      if (!keep.has(id)) {
        d.g.remove();
        this.dots.delete(id);
      }
    this.selConvoy = selConvoy !== null && keep.has(selConvoy) ? selConvoy : null;
    const sel = this.selConvoy !== null ? this.dots.get(this.selConvoy) : undefined;
    this.routeLine.setAttribute('d', sel ? (this.path({ type: 'LineString', coordinates: routePath(sel.convoy.nodes) }) ?? '') : '');
    if (this.selConvoy !== this.lastSel) {
      this.lastSel = this.selConvoy;
      this.sizeDots();
    }
    this.placeDots();
  }

  /** Durée réelle d'un mois de jeu en millisecondes (0 = pause) : les convois avancent en conséquence. */
  setMonthMs(ms: number) {
    this.monthMs = ms;
  }

  private sizeDots() {
    const k = Math.sqrt(this.k);
    for (const d of this.dots.values()) {
      const [hit, dot] = d.g.children;
      hit.setAttribute('r', (14 / k).toFixed(2));
      dot.setAttribute('r', ((d.convoy.id === this.selConvoy ? 4 : 2.6) / k).toFixed(2));
    }
  }

  private placeDots() {
    const now = this.baseClock + this.frac;
    // Zone visible (avec marge : l'écran portrait déborde de la viewBox) : on ne déplace pas les points hors champ
    const v = this.view;
    const m = 60 / v.k;
    const x0 = -v.x / v.k - m, x1 = (W - v.x) / v.k + m;
    const y0 = (-H * 0.6 - v.y) / v.k - m, y1 = (H * 1.6 - v.y) / v.k + m;
    for (const d of this.dots.values()) {
      const u = (now - d.convoy.depart) / d.convoy.duration;
      let p = u >= 0 && u < 1 ? this.pointAt(d.track, u) : null;
      if (p && (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1)) p = null;
      if (!p) {
        if (d.g.style.display === 'none') continue;
        d.g.style.display = 'none';
        continue;
      }
      if (d.g.style.display) d.g.style.display = '';
      d.g.setAttribute('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`);
    }
  }

  /** Instant de jeu affiché (mois absolus, fraction comprise). */
  get now() {
    return this.baseClock + this.frac;
  }

  private animate = (now: number) => {
    const dt = this.lastFrame ? Math.min(100, now - this.lastFrame) : 0;
    this.lastFrame = now;
    if (this.monthMs > 0 && this.dots.size) {
      // Si le mois suivant tarde (calcul en cours), les convois continuent un peu au lieu de se figer
      this.frac = Math.min(1.5, this.frac + dt / this.monthMs);
      this.placeDots();
    }
    requestAnimationFrame(this.animate);
  };

  /** Nœuds, noms et détroits gardent une taille lisible quel que soit le zoom. */
  private sizeTrade() {
    const f = 1 / Math.sqrt(this.k);
    for (const c of this.tradeLayer.querySelectorAll<SVGCircleElement>('circle.node')) {
      c.setAttribute('r', ((c.dataset.sel ? 5 : 3.5) * f).toFixed(2));
      const label = c.nextElementSibling as SVGTextElement;
      label.setAttribute('y', (Number(c.getAttribute('cy')) - 6 * f).toFixed(2));
      label.setAttribute('font-size', (7 * f).toFixed(2));
      label.setAttribute('stroke-width', (2 * f).toFixed(2));
    }
    for (const x of this.tradeLayer.querySelectorAll<SVGTextElement>('text.strait')) x.setAttribute('font-size', (9 * f).toFixed(2));
    for (const x of this.tradeLayer.querySelectorAll<SVGTextElement>('text.strait-name')) {
      x.setAttribute('dy', (9 * f).toFixed(2));
      x.setAttribute('font-size', (5.5 * f).toFixed(2));
      x.setAttribute('stroke-width', (1.6 * f).toFixed(2));
    }
  }

  // ————— Capitales (carte politique) et lieux saints (carte religieuse) —————

  private drawMarkers(s: GameState, mode: MapMode) {
    const g = this.markerLayer;
    const wanted = mode === 'political' || mode === 'religion';
    const owners = wanted ? this.world.provinces.filter((p) => p.capital || p.holy?.length).map((p) => s.provinces[p.id].owner).join(',') : '';
    const sig = `${mode}|${s.player}|${owners}`;
    if (sig === this.markerSig) return;
    this.markerSig = sig;
    g.innerHTML = '';
    if (!wanted) return;
    const caps = CAPITALS as Record<string, { name: string; lon: number; lat: number }>;
    const add = (x: number, y: number, icons: string[], name: string, cls: string) => {
      const m = el('g', { class: `marker ${cls}`, transform: `translate(${x.toFixed(2)},${y.toFixed(2)})` }, g);
      if (icons.length) {
        // Icônes vectorielles dorées sur un halo lumineux (côte à côte si le lieu est sacré pour plusieurs fois)
        const sym = el('g', { class: 'm-sym' }, m);
        el('circle', { class: 'm-glow', r: String(15 + 10 * (icons.length - 1)) }, sym);
        icons.forEach((k, i) => {
          const u = el('use', { href: `#faith-${k}`, x: String(-11 + (i - (icons.length - 1) / 2) * 21), y: '-11', width: '22', height: '22' }, sym);
          u.setAttribute('class', 'm-faith');
        });
      } else el('circle', { class: 'm-dot', r: '1' }, m);
      el('text', { class: 'm-name' }, m).textContent = name;
    };
    if (mode === 'political') {
      for (const p of this.world.provinces) {
        if (!p.capital) continue;
        const owner = s.provinces[p.id].owner;
        const c = caps[p.country];
        const [x, y] = c ? (this.projection([c.lon, c.lat]) ?? this.centers[p.id]) : this.centers[p.id];
        // Capitale tombée aux mains d'un autre pays : étoile grisée
        const cls = owner !== p.country ? 'lost' : owner === s.player ? 'own' : '';
        add(x, y, [], c?.name ?? p.name, `cap ${cls}`);
      }
    } else {
      for (const p of this.world.provinces) {
        for (const h of p.holy ?? []) {
          // Position réelle du site (le centre d'une province peut tomber loin, voire en mer)
          const site = HOLY_SITES.find((x) => x.name === h.name);
          const [x, y] = (site && this.projection([site.lon, site.lat])) || this.centers[p.id];
          const icons = [...new Set(h.religions.map((r) => FAITH_OF[r]))].slice(0, 4);
          add(x, y, icons, h.name, holyHolders(h.name, s.provinces[p.id].owner, (id) => !!s.nations[id]?.alive).includes(s.player) ? 'own' : '');
        }
      }
    }
    this.sizeMarkers();
  }

  /** Taille lisible à tout zoom ; les noms n'apparaissent qu'en zoomant (sauf pour son propre pays). */
  private sizeMarkers() {
    // Taille fixe à l'écran (en pixels) : les noms ne grossissent plus quand on zoome fort
    const u = 1 / (this.k * this.pxPerUnit());
    for (const m of this.markerLayer.querySelectorAll<SVGGElement>('g.marker')) {
      const [icon, name] = m.children as unknown as SVGElement[];
      const own = m.classList.contains('own');
      const cap = m.classList.contains('cap');
      // Les capitales sont nombreuses : leurs noms n'apparaissent qu'en zoomant franchement
      const names = this.k >= (cap ? 12 : 4);
      if (cap) icon.setAttribute('r', ((own ? 3.2 : 2.4) * u).toFixed(3));
      else icon.setAttribute('transform', `scale(${(((own ? 24 : 19) / 22) * u).toFixed(4)})`);
      name.style.display = names ? '' : 'none';
      name.setAttribute('font-size', ((cap ? 10 : 11) * u).toFixed(3));
      name.setAttribute('dy', ((cap ? 4 : 11) * u).toFixed(3));
      name.setAttribute('stroke-width', (2.5 * u).toFixed(3));
    }
  }

  /** Contour du pays sélectionné (blanc) ou, sans sélection, du vôtre (or). */
  private drawOutline(s: GameState, focus: Id, owners: string) {
    const sig = `${focus}|${owners}`;
    if (sig === this.outlineSig) return;
    this.outlineSig = sig;
    const arcs = this.arcs();
    let d = '';
    for (let i = 0; i < arcs.users.length; i++) {
      const u = arcs.users[i];
      const a = s.provinces[u[0]].owner;
      const b = u.length > 1 ? s.provinces[u[1]].owner : null;
      if ((a === focus) !== (b === focus)) d += arcs.paths[i];
    }
    this.outline.setAttribute('d', d);
    this.outline.setAttribute('class', `nation-outline ${focus === s.player ? 'mine' : ''}`);
  }

  /** Marchandise et niveau de modernisation sur chaque province du pays sélectionné. */
  private drawGoods(s: GameState, nation: Id | null) {
    const pids = nation ? s.provinces.map((p, i) => (p.owner === nation ? i : -1)).filter((i) => i >= 0) : [];
    const sig = pids.map((i) => `${i}:${s.provinces[i].good ?? ''}:${s.provinces[i].level ?? 0}`).join(',');
    if (sig === this.goodsSig) return;
    this.goodsSig = sig;
    this.goodsLayer.innerHTML = '';
    for (const i of pids) {
      const p = s.provinces[i];
      const [x, y] = this.centers[i];
      const g = el('g', { transform: `translate(${x.toFixed(2)},${y.toFixed(2)})` }, this.goodsLayer);
      g.dataset.size = String(Math.sqrt(this.areas[i]));
      el('text', { class: 'pg-icon' }, g).textContent = GOODS[p.good ?? this.world.provinces[i].good].icon;
      if (p.level) el('text', { class: 'pg-level' }, g).textContent = '▲'.repeat(p.level);
    }
    this.sizeGoods();
  }

  private sizeGoods() {
    // Taille à l'écran : à la mesure de la province, plafonnée à ~16 px ; masquée si elle serait illisible
    // Largeur mémorisée : la relire ici forcerait un recalcul complet de la mise en page à chaque zoom
    const pxPerUnit = this.pxPerUnit();
    for (const g of this.goodsLayer.children as HTMLCollectionOf<SVGGElement>) {
      const [icon, level] = g.children as unknown as SVGTextElement[];
      const screen = Math.min(16, Number(g.dataset.size) * 0.55 * this.k * pxPerUnit);
      g.style.display = screen < 7 ? 'none' : '';
      const size = screen / (this.k * pxPerUnit);
      icon.setAttribute('font-size', size.toFixed(2));
      if (level) {
        level.setAttribute('font-size', (size * 0.55).toFixed(2));
        level.setAttribute('dy', (size * 0.85).toFixed(2));
      }
    }
  }

  private drawTrade(s: GameState, selectedNode: string | null) {
    const g = this.tradeLayer;
    // Ne redessiner que si quelque chose de visible a changé (itinéraires, détroits fermés, nœud choisi)
    const sig = [selectedNode, s.contracts.map((c) => `${c.route.nodes.join('>')}:${c.lastStatus}`).join(','), STRAITS.map((st) => (straitClosed(s, this.world, st.id) ? 1 : 0)).join('')].join('|');
    if (sig === this.tradeSig && g.childElementCount) return;
    this.tradeSig = sig;
    g.innerHTML = '';
    // Voies commerciales (tracés réels)
    const links: [string, string][] = [...TRADE_NODES.flatMap((n) => n.out.map((o) => [n.id, o] as [string, string])), ...EXTRA_LANES];
    for (const [a, b] of links)
      el('path', { d: this.path({ type: 'LineString', coordinates: lane(a, b) }) ?? '', class: `lane ${LAND.has(laneKey(a, b)) ? 'land' : ''}` }, g);
    // Itinéraires des contrats du joueur
    for (const c of s.contracts)
      el('path', { d: this.path({ type: 'LineString', coordinates: routePath(c.route.nodes) }) ?? '', class: `route ${c.lastStatus}` }, g);
    for (const n of TRADE_NODES) {
      const [x, y] = this.projection(PORTS[n.id])!;
      const c = el('circle', { cx: String(x), cy: String(y), r: n.id === selectedNode ? '5' : '3.5', class: 'node' }, g);
      c.dataset.node = n.id;
      if (n.id === selectedNode) c.dataset.sel = '1';
      const t = el('text', { x: String(x), y: String(y - 6), class: 'node-label' }, g);
      t.textContent = n.name;
    }
    for (const st of STRAITS) {
      const info = this.world.provinces.find((p) => p.strait === st.id);
      if (!info) continue;
      const [x, y] = this.centers[info.id];
      const t = el('text', { x: String(x), y: String(y), class: `strait ${straitClosed(s, this.world, st.id) ? 'closed' : ''}` }, g);
      t.textContent = '⚓';
      const name = el('text', { x: String(x), y: String(y), class: `strait-name ${straitClosed(s, this.world, st.id) ? 'closed' : ''}` }, g);
      name.textContent = st.name;
    }
    this.sizeTrade();
  }

  render(s: GameState, mode: MapMode, selected: Pid | null, selConvoy: number | null = null, selNation: Id | null = null) {
    const me = s.player;
    const nodeIdx = new Map(TRADE_NODES.map((n, i) => [n.id, i]));
    const selOwner = selected !== null ? s.provinces[selected].owner : selNation;
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
          if (n.id === me) fill = '#ffd54a';
          else if (warBetween(s, me, n.id)) fill = '#c62828';
          else if (sameBloc(s, me, n.id)) fill = '#2f6fdb';
          else fill = ramp((rel(s, me, n.id) + 100) / 200, ['#8e2b2b', '#6b6f76', '#3c8d4f']);
          break;
      }
      // Éclaircissement calculé ici plutôt qu'en filtre CSS (un filtre par province ralentit le zoom)
      if (i === selected) fill = mix(fill, '#ffffff', 0.28);
      else if (p.owner === selOwner) fill = mix(fill, '#ffffff', 0.14);
      // N'écrire dans le DOM que ce qui change : chaque écriture force le navigateur à redessiner la carte
      const cls = `prov${p.owner === me ? ' mine' : ''}${i === selected ? ' selected' : ''}${p.owner === selOwner && i !== selected ? ' sel-nation' : ''}`;
      const occ = p.revolt ? 'fire' : p.occupiedBy ? 'hatch' : '';
      const key = `${fill}|${cls}|${occ}`;
      if (this.pathState[i] === key) return;
      this.pathState[i] = key;
      const path = this.paths[i];
      path.setAttribute('fill', fill);
      path.setAttribute('class', cls);
      const o = this.occ[i];
      o.style.display = occ ? '' : 'none';
      if (occ) o.setAttribute('fill', `url(#${occ})`);
    });
    // Frontières nationales : recalculées seulement si la carte politique a changé
    const owners = s.provinces.map((p) => p.owner).join(',');
    if (owners !== this.lastOwners) {
      this.lastOwners = owners;
      // Segments précalculés : on ne garde que les côtes et ceux qui séparent deux pays
      const arcs = this.arcs();
      let d = '';
      for (let i = 0; i < arcs.users.length; i++) {
        const u = arcs.users[i];
        if (u.length === 1 || s.provinces[u[0]].owner !== s.provinces[u[1]].owner) d += arcs.paths[i];
      }
      this.borders.setAttribute('d', d);
      this.buildLabels(s);
    }
    this.labelMode(s, mode);
    if (!this.svg.classList.contains(`mode-${mode}`)) {
      for (const c of [...this.svg.classList]) if (c.startsWith('mode-')) this.svg.classList.remove(c);
      this.svg.classList.add(`mode-${mode}`);
    }
    if (mode === 'trade') this.drawTrade(s, selected !== null ? this.world.provinces[selected].node : null);
    else if (this.tradeLayer.childElementCount) this.tradeLayer.innerHTML = '';
    this.drawMarkers(s, mode);
    this.drawOutline(s, selOwner ?? me, owners);
    this.drawGoods(s, mode === 'trade' ? (selOwner ?? me) : null);
    this.syncConvoys(s, mode, selConvoy);
  }
}
