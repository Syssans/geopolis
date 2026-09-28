export function money(bn: number): string {
  const a = Math.abs(bn);
  const sign = bn < 0 ? '−' : '';
  if (a >= 1000) return `${sign}${(a / 1000).toFixed(a >= 10000 ? 1 : 2).replace('.', ',')} T$`;
  if (a >= 10) return `${sign}${a.toFixed(0)} Md$`;
  if (a >= 1) return `${sign}${a.toFixed(1).replace('.', ',')} Md$`;
  return `${sign}${(a * 1000).toFixed(0)} M$`;
}

export function num(v: number, digits = 0): string {
  return v.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function pct(v: number, digits = 1, signed = true): string {
  const s = num(Math.abs(v), digits);
  return `${v < 0 ? '−' : signed && v > 0 ? '+' : ''}${s} %`;
}

export function pop(m: number): string {
  if (m >= 1000) return `${num(m / 1000, 2)} Md`;
  if (m >= 1) return `${num(m, m >= 100 ? 0 : 1)} M`;
  return `${num(m * 1000, 0)} k`;
}

export function signed(v: number, digits = 0): string {
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}${num(Math.abs(v), digits)}`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function cls(v: number): string {
  return v > 0 ? 'pos' : v < 0 ? 'neg' : '';
}

const ICONS: [RegExp, string][] = [
  [/influence/i, '🤝'],
  [/trésor/i, '💰'],
  [/ferveur/i, '🔥'],
  [/stabilité/i, '⚖️'],
  [/agitation/i, '✊'],
  [/relations/i, '🌍'],
  [/marine/i, '⚓'],
  [/tension(?: mondiale)?/i, '☢️'],
  [/agressivité/i, '⚔️'],
];

/** « Influence −30, stabilité +2 » → « 🤝 −30, ⚖️ +2 » : les ressources chiffrées deviennent des emojis. */
export function iconize(text: string): string {
  let out = text;
  for (const [re, icon] of ICONS)
    out = out.replace(new RegExp(`${re.source}\\s*([+−-]\\s?\\d)`, 'gi'), `${icon} $1`);
  return out;
}

/** « du pétrole », « des céréales », « du café et du cacao ». */
export function partitive(name: string): string {
  const n = name.toLowerCase();
  if (n === 'café et cacao') return 'du café et du cacao';
  if (/(s|x)$/.test(n.split(' ')[0])) return `des ${n}`;
  return `du ${n}`;
}
