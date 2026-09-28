/** Courbes des cours mondiaux : SVG en chaîne de caractères, sans dépendance. */
import { MONTHS } from '../game/state';
import { money } from './format';

const LINE = '#58a6ff';

/** Petite courbe de tendance (sans axes). */
export function sparkline(values: number[], w = 96, h = 28): string {
  if (values.length < 2) return '';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - lo) / span) * (h - 6)).toFixed(1)}`);
  const last = pts[pts.length - 1].split(',');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <polyline points="${pts.join(' ')}" fill="none" stroke="${LINE}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${LINE}"/></svg>`;
}

export interface RefLine {
  value: number;
  label: string;
  color?: string; // la ligne et son libellé partagent la même couleur
}

const W = 340;
const H = 170;
const PAD = { l: 44, r: 10, t: 10, b: 22 };

/**
 * Grande courbe d'un cours : prix unitaires mois par mois.
 * `end` = temps absolu (mois) du dernier point ; `refs` = lignes horizontales annotées.
 */
export function priceChart(values: number[], end: number, refs: RefLine[] = []): string {
  if (!values.length) return '';
  const all = [...values, ...refs.map((r) => r.value)];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const margin = (hi - lo) * 0.12 || hi * 0.1;
  lo = Math.max(0, lo - margin);
  hi += margin;
  const n = values.length;
  const x = (i: number) => PAD.l + (n > 1 ? (i / (n - 1)) * (W - PAD.l - PAD.r) : 0);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const start = end - (n - 1);
  let svg = '';
  // Grille horizontale et graduations arrondies
  const raw = (hi - lo) / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw) ?? raw;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  for (let v = lo; v <= hi + step / 2; v += step) {
    svg += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grid"/>
      <text x="${PAD.l - 5}" y="${(y(v) + 3).toFixed(1)}" class="tick" text-anchor="end">${money(v)}</text>`;
  }
  // Années (janvier)
  for (let i = 0; i < n; i++) {
    const t = start + i;
    if (t % 12 !== 0) continue;
    svg += `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${H - PAD.b}" y2="${H - PAD.b + 4}" class="axis"/>
      <text x="${x(i).toFixed(1)}" y="${H - 6}" class="tick" text-anchor="middle">${Math.floor(t / 12)}</text>`;
  }
  svg += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${H - PAD.b}" y2="${H - PAD.b}" class="axis"/>`;
  for (const r of refs)
    svg += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(r.value).toFixed(1)}" y2="${y(r.value).toFixed(1)}" class="ref"${r.color ? ` style="stroke:${r.color}"` : ''}/>
      <text x="${PAD.l + 4}" y="${(y(r.value) - 4).toFixed(1)}" class="ref-label"${r.color ? ` style="fill:${r.color}"` : ''}>${r.label}</text>`;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  svg += `<polygon points="${PAD.l},${H - PAD.b} ${pts} ${x(n - 1).toFixed(1)},${H - PAD.b}" class="area"/>
    <polyline points="${pts}" class="line"/>
    <circle cx="${x(n - 1).toFixed(1)}" cy="${y(values[n - 1]).toFixed(1)}" r="4" class="last"/>
    <g class="cross" style="display:none"><line y1="${PAD.t}" y2="${H - PAD.b}"/><circle r="4"/></g>`;
  const data = values.map((v) => v.toFixed(4)).join(',');
  return `<div class="pchart" data-v="${data}" data-start="${start}" data-lo="${lo}" data-hi="${hi}">
    <svg viewBox="0 0 ${W} ${H}" role="img">${svg}</svg><div class="tip" style="display:none"></div></div>`;
}

/** Réticule et info-bulle au survol ou au toucher d'une courbe. */
export function chartPointer(e: PointerEvent) {
  const box = (e.target as Element).closest<HTMLElement>('.pchart');
  if (!box) return;
  const svg = box.querySelector('svg')!;
  const values = box.dataset.v!.split(',').map(Number);
  const start = Number(box.dataset.start);
  const lo = Number(box.dataset.lo);
  const hi = Number(box.dataset.hi);
  const r = svg.getBoundingClientRect();
  const sx = ((e.clientX - r.left) / r.width) * W;
  const n = values.length;
  const i = Math.max(0, Math.min(n - 1, Math.round(((sx - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1))));
  const cx = PAD.l + (n > 1 ? (i / (n - 1)) * (W - PAD.l - PAD.r) : 0);
  const cy = PAD.t + (1 - (values[i] - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const cross = svg.querySelector<SVGGElement>('.cross')!;
  cross.style.display = '';
  const [line, dot] = cross.children;
  line.setAttribute('x1', cx.toFixed(1));
  line.setAttribute('x2', cx.toFixed(1));
  dot.setAttribute('cx', cx.toFixed(1));
  dot.setAttribute('cy', cy.toFixed(1));
  const tip = box.querySelector<HTMLElement>('.tip')!;
  const t = start + i;
  tip.style.display = '';
  tip.innerHTML = `<small>${MONTHS[t % 12]} ${Math.floor(t / 12)}</small><b class="c-blue">${money(values[i])}</b>`;
  const left = (cx / W) * r.width;
  tip.style.left = `${Math.max(4, Math.min(r.width - tip.offsetWidth - 4, left - tip.offsetWidth / 2))}px`;
}
