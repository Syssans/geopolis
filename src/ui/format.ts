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

/** Nombre signé : « +12 », « −3,5 % », « −1,4 Md$ » (le signe doit ouvrir le mot). */
const SIGNED = /(^|[\s(«:·,/≈])([+−-] ?\d+(?:[  ]\d{3})*(?:[,.]\d+)?(?: ?(?:%|Md\$|M\$|T\$))?)/g;
/** Zones où l'on ne touche pas aux couleurs (déjà colorées, fonds dorés, graphiques…). */
const SKIP = '.pos,.neg,.nosign,.c-gold,.c-blue,.c-warn,.btn.primary,.act.primary-act,svg,script,style,textarea,input';

/** Colore en vert les nombres positifs et en rouge les négatifs, dans tout le texte d'un élément. */
export function colorSigns(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (!/[+−-] ?\d/.test(t.data)) continue;
    const p = t.parentElement;
    if (!p || p.closest(SKIP)) continue;
    hits.push(t);
  }
  for (const t of hits) {
    const s = t.data;
    const frag = document.createDocumentFragment();
    let last = 0;
    SIGNED.lastIndex = 0;
    for (let m = SIGNED.exec(s); m; m = SIGNED.exec(s)) {
      const start = m.index + m[1].length;
      frag.append(s.slice(last, start));
      const span = document.createElement('span');
      span.className = m[2][0] === '+' ? 'pos' : 'neg';
      span.textContent = m[2];
      frag.append(span);
      last = start + m[2].length;
    }
    if (!last) continue;
    frag.append(s.slice(last));
    t.replaceWith(frag);
  }
}

/** Textes explicatifs dépliés par le joueur (conservés d'un rendu à l'autre). */
const openHints = new Set<string>();

/**
 * Replie les textes explicatifs (`.hint`) derrière un petit « ? » : posé à côté du titre qui les précède,
 * ou seul sur sa ligne s'il n'y a pas de titre. Un toucher les déplie, un second les replie.
 */
export function hintify(root: Element) {
  for (const h of root.querySelectorAll<HTMLElement>('.hint:not([data-hk])')) {
    const key = (h.textContent ?? '').replace(/[\d\s.,+−-]+/g, '').slice(0, 60);
    h.dataset.hk = key;
    const open = openHints.has(key);
    h.classList.toggle('shut', !open);
    const q = document.createElement('button');
    q.type = 'button';
    q.className = `qm ${open ? 'on' : ''}`;
    q.textContent = '?';
    q.setAttribute('aria-label', 'Explications');
    q.addEventListener('click', (e) => {
      e.stopPropagation();
      const now = !openHints.has(key);
      if (now) openHints.add(key);
      else openHints.delete(key);
      h.classList.toggle('shut', !now);
      q.classList.toggle('on', now);
    });
    const prev = h.previousElementSibling;
    if (prev && /^H[1-4]$/.test(prev.tagName) && !prev.querySelector('.qm')) prev.append(q);
    else {
      const row = document.createElement('div');
      row.className = 'qm-row';
      row.append(q, Object.assign(document.createElement('small'), { textContent: 'Explications' }));
      row.addEventListener('click', () => q.click());
      h.before(row);
    }
  }
}
