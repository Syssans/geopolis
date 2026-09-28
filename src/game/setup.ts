import { COUNTRIES, DEPENDENCIES } from '../data/countries';
import { BLOCS, HAWKS, RELATIONS } from '../data/geopolitics';
import { clamp, dateLabel, milEfficiency, pairKey, setRel } from './state';
import type { GameState, Id, Nation, World } from './types';

export const SAVE_VERSION = 1;

// Palette douce pour la coloration « politique » (voisins de couleurs différentes).
const PALETTE = ['#c9a86a', '#8fae7a', '#b07d62', '#7f9cb0', '#b59ac4', '#d4c07a', '#86b3a8', '#c48c8c', '#a3a36b', '#9b8fbf'];

export function createGame(world: World, player: Id, seed = Date.now()): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    rng: seed | 0,
    year: 2026,
    month: 1,
    player,
    nations: {},
    territories: {},
    relations: {},
    blocs: {},
    wars: [],
    trades: [],
    sanctions: [],
    tension: 25,
    log: [],
    events: [],
    nextUid: 1,
    gameOver: null,
  };

  for (const c of COUNTRIES) {
    const eff = milEfficiency(c.gdp, c.pop);
    const pc = (c.gdp * 1000) / c.pop;
    const milPct = clamp((c.mil / c.gdp) * 100, 0.3, 30);
    const n: Nation = {
      id: c.atlas,
      name: c.name,
      color: '#999',
      alive: true,
      treasury: c.gdp * 0.05,
      stability: c.stab ?? 60,
      baseStability: c.stab ?? 60,
      milPct,
      baseMilPct: milPct,
      // Stock à l'équilibre : dépense mensuelle × efficacité / dépréciation (1 %/mois)
      strength: ((c.mil / 12) * eff) / 0.01,
      tech: Math.round(clamp(Math.log2(pc / 1500) * 2, 0, 10)),
      points: { pol: 50, dip: 50, mil: 50 },
      growthBonus: 0,
      modifiers: [],
      aggression: 0,
      exhaustion: 0,
      nuclear: !!c.nuclear,
      nukeProgram: null,
      hawk: HAWKS[c.atlas] ?? 0.1,
      bloc: null,
      claims: [],
      cbProgress: null,
    };
    s.nations[n.id] = n;
    s.territories[n.id] = {
      id: n.id,
      name: c.name,
      owner: n.id,
      core: n.id,
      gdp: c.gdp,
      pop: c.pop,
      occupiedBy: null,
      integration: 100,
    };
  }
  for (const [id, d] of Object.entries(DEPENDENCIES)) {
    s.territories[id] = { id, name: d.name, owner: d.owner, core: d.owner, gdp: d.gdp, pop: d.pop, occupiedBy: null, integration: 100 };
  }

  for (const b of BLOCS) {
    s.blocs[b.id] = { id: b.id, name: b.name, color: b.color, leader: b.members[0], members: [...b.members] };
    for (const m of b.members) s.nations[m].bloc = b.id;
    for (let i = 0; i < b.members.length; i++)
      for (let j = i + 1; j < b.members.length; j++) setRel(s, b.members[i], b.members[j], 45);
  }
  for (const [a, b, v] of RELATIONS) setRel(s, a, b, v);
  // Commerce : les grandes économies d'un même bloc ont des accords entre elles
  for (const b of Object.values(s.blocs))
    for (let i = 0; i < b.members.length; i++)
      for (let j = i + 1; j < b.members.length; j++) s.trades.push(pairKey(b.members[i], b.members[j]));
  // Sanctions en vigueur
  for (const from of ['United States of America', 'United Kingdom', 'Germany', 'France', 'Japan', 'Canada'])
    for (const to of ['Russia', 'Iran', 'North Korea']) s.sanctions.push(`${from}>${to}`);

  colorNations(s, world);
  s.log.unshift({ date: dateLabel(s), text: 'Bienvenue au 1er janvier 2026. Le monde vous attend.', kind: 'info', mine: true });
  return s;
}

/** Coloration gloutonne : deux nations voisines n'ont pas la même couleur. */
function colorNations(s: GameState, world: World) {
  const ids = Object.keys(s.nations).sort((a, b) => (world.adjacent[b]?.length ?? 0) - (world.adjacent[a]?.length ?? 0));
  for (const id of ids) {
    const used = new Set((world.adjacent[id] ?? []).map((o) => s.nations[s.territories[o]?.owner]?.color));
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    for (let k = 0; k < PALETTE.length; k++) {
      const c = PALETTE[(h + k) % PALETTE.length];
      if (!used.has(c)) {
        s.nations[id].color = c;
        break;
      }
    }
    if (s.nations[id].color === '#999') s.nations[id].color = PALETTE[h % PALETTE.length];
  }
}
