/**
 * Icônes vectorielles des religions pour les lieux saints : or brillant cerné de brun, avec un halo lumineux.
 * Dessinées dans une boîte de 20 × 20 centrée sur l'origine.
 */
import type { Religion } from '../data/religions';

const star5 = (cx: number, cy: number, r: number) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    d += `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }
  return d + 'Z';
};
const poly = (n: number, r: number, rot: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return `${i ? 'L' : 'M'}${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  }).join('') + 'Z';
const circle = (r: number) => `M${r} 0A${r} ${r} 0 1 0 ${-r} 0A${r} ${r} 0 1 0 ${r} 0Z`;

/** Tracés (fill-rule evenodd). */
export const FAITH_PATHS: Record<string, string> = {
  cross: 'M-1.7 -9.5H1.7V-4.6H6.4V-1.4H1.7V9.5H-1.7V-1.4H-6.4V-4.6H-1.7Z',
  orthodox: 'M-1.4 -9.5H1.4V9.5H-1.4Z M-3.8 -7.4H3.8V-5.4H-3.8Z M-6.4 -3.4H6.4V-1H-6.4Z M-4.8 5.6L4.8 2.6V4.9L-4.8 7.9Z',
  crescent: `M2.2 -8.2A8.6 8.6 0 1 0 2.2 8.2A6.9 6.9 0 1 1 2.2 -8.2Z ${star5(5.4, -0.6, 3.6)}`,
  david: `${poly(3, 9.6, -Math.PI / 2)} ${poly(3, 9.6, Math.PI / 2)} ${poly(6, 3.6, 0)}`,
  lotus:
    'M0 -9.5C3.2 -5.5 3.2 -0.5 0 3.5C-3.2 -0.5 -3.2 -5.5 0 -9.5Z M-1.6 4.4C-6.4 3.8 -9.2 0 -9.5 -3.8C-5.4 -3 -2.2 0 -1.6 4.4Z M1.6 4.4C6.4 3.8 9.2 0 9.5 -3.8C5.4 -3 2.2 0 1.6 4.4Z M-8 6.2H8V8.6H-8Z',
  wheel: (() => {
    let d = `${circle(9.2)} ${circle(6.6)} ${circle(2.2)}`;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const c = Math.cos(a), s = Math.sin(a);
      const w = 0.8;
      const p = (r: number, o: number) => `${(r * c - o * s).toFixed(2)} ${(r * s + o * c).toFixed(2)}`;
      d += ` M${p(2.2, -w)}L${p(6.7, -w)}L${p(6.7, w)}L${p(2.2, w)}Z`;
    }
    return d;
  })(),
  leaf: 'M-7 8C-8 0 -4 -8 8 -9C8 2 2 8 -5 7L-7 9.5L-8.4 8.6Z',
};

export const FAITH_OF: Record<Religion, string> = {
  catholique: 'cross',
  protestant: 'cross',
  evangelique: 'cross',
  orthodoxe: 'orthodox',
  sunnite: 'crescent',
  chiite: 'crescent',
  juif: 'david',
  hindou: 'lotus',
  bouddhiste: 'wheel',
  traditionnel: 'leaf',
  secularise: 'leaf',
};

/** Définitions SVG : dégradé or, halo, et un symbole par icône. */
export const FAITH_DEFS = `
  <linearGradient id="faith-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fffbd1"/><stop offset=".45" stop-color="#ffd84a"/><stop offset="1" stop-color="#e09a00"/>
  </linearGradient>
  <radialGradient id="faith-glow"><stop offset="0" stop-color="#ffe066" stop-opacity=".75"/><stop offset=".55" stop-color="#ffc400" stop-opacity=".28"/><stop offset="1" stop-color="#ffc400" stop-opacity="0"/></radialGradient>
  ${Object.entries(FAITH_PATHS)
    .map(([k, d]) => `<symbol id="faith-${k}" viewBox="-11 -11 22 22" overflow="visible"><path d="${d}" fill-rule="evenodd"/></symbol>`)
    .join('')}`;
