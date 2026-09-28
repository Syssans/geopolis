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
