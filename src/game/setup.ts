import { initOrgs } from './orgs';
import { seedConvoys } from './convoys';
import { seedPriceHistory } from './trade';
import { COUNTRIES } from '../data/countries';
import { BLOCS, HAWKS, RELATIONS } from '../data/geopolitics';
import { STATE_RELIGION } from '../data/religions';
import { GOODS } from '../data/trade';
import { runMerchantAI } from './ai';
import { alive, clamp, dateLabel, invalidate, pairKey, setRel } from './state';
import { computeTrade } from './trade';
import { initCampaign } from './missions';
import type { GameState, Id, Nation, Policy, World } from './types';

export const SAVE_VERSION = 7;
export const ARMY_UPKEEP = 0.25;
export const NAVY_UPKEEP = 0.5;

const PALETTE = ['#c9a86a', '#8fae7a', '#b07d62', '#7f9cb0', '#b59ac4', '#d4c07a', '#86b3a8', '#c48c8c', '#a3a36b', '#9b8fbf'];

const PROSELYTES = new Set(['Iran', 'Saudi Arabia', 'Afghanistan', 'Pakistan', 'Israel', 'Russia', 'India', 'Yemen', 'Sudan']);
const TOLERANT = new Set([
  'Germany', 'France', 'United Kingdom', 'Netherlands', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Canada', 'Belgium',
  'Switzerland', 'Australia', 'New Zealand', 'Spain', 'Portugal', 'Ireland', 'Uruguay', 'Japan', 'South Korea',
  'Senegal', 'Indonesia', 'Lebanon', 'Albania', 'Bosnia and Herz.', 'Tanzania', 'Ghana', 'Oman', 'Singapore',
]);

export function createGame(world: World, player: Id, seed = Date.now()): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    endYear: 2036,
    rival: null,
    rivalHostility: 20,
    offers: [],
    contracts: [],
    convoys: [],
    purchases: [],
    stock: {},
    needs: null,
    missions: [],
    score: 0,
    passes: {},
    notForSale: [],
    storePolicy: {},
    orgs: {},
    prevPrices: {},
    priceHistory: {},
    stats: { converted: 0, contractsDone: 0, warsWon: 0, startIncome: 0, startDev: 0 },
    campaignOver: false,
    rng: seed | 0,
    year: 2026,
    month: 1,
    player,
    nations: {},
    provinces: world.provinces.map((p) => ({
      owner: p.owner,
      core: p.owner,
      religion: p.religion,
      occupiedBy: null,
      integration: 100,
      unrest: 0,
      revolt: 0,
      supportedBy: null,
      supportMonths: 0,
    })),
    relations: {},
    blocs: {},
    wars: [],
    trades: [],
    embargoes: [],
    prices: Object.fromEntries(Object.keys(GOODS).map((g) => [g, 1])),
    tension: 25,
    log: [],
    events: [],
    nextUid: 1,
    gameOver: null,
  };
  const present = new Set(world.provinces.map((p) => p.owner));

  for (const c of COUNTRIES) {
    if (!present.has(c.atlas)) continue;
    const policy: Policy = PROSELYTES.has(c.atlas) ? 'proselytisme' : TOLERANT.has(c.atlas) ? 'tolerance' : 'neutre';
    const pc = (c.gdp * 1000) / c.pop;
    const n: Nation = {
      id: c.atlas,
      name: c.name,
      color: '#999',
      alive: true,
      religion: STATE_RELIGION[c.atlas] ?? 'secularise',
      policy,
      policyCooldown: 0,
      treasury: 0,
      influence: 50,
      fervor: 30,
      stability: c.stab ?? 60,
      baseStability: c.stab ?? 60,
      army: 0,
      navy: 0,
      // Une division coûte moins cher là où la main-d'œuvre est bon marché
      upkeepRate: ARMY_UPKEEP / Math.sqrt(clamp(45000 / Math.max(pc, 1), 1, 6)),
      milShare: clamp(0.3 * ((c.mil / c.gdp) * 100) / 2, 0.08, 0.6),
      aggression: 0,
      exhaustion: 0,
      nuclear: !!c.nuclear,
      nukeProgram: null,
      hawk: HAWKS[c.atlas] ?? 0.1,
      bloc: null,
      claims: [],
      holyClaims: [],
      cbProgress: null,
      merchants: [],
      missionary: null,
      missionProgress: 0,
      closedStraits: [],
      income: { production: 0, trade: 0, tolls: 0, contracts: 0, upkeep: 0, byNode: {} },
    };
    s.nations[n.id] = n;
  }
  invalidate(s);

  for (const b of BLOCS) {
    const members = b.members.filter((m) => s.nations[m]);
    s.blocs[b.id] = { id: b.id, name: b.name, color: b.color, leader: members[0], members };
    for (const m of members) s.nations[m].bloc = b.id;
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) s.trades.push(pairKey(members[i], members[j]));
  }
  for (const [a, b, v] of RELATIONS) if (s.nations[a] && s.nations[b]) setRel(s, a, b, v);
  for (const from of ['United States of America', 'United Kingdom', 'Germany', 'France', 'Japan', 'Canada'])
    for (const to of ['Russia', 'Iran', 'North Korea', 'Syria']) s.embargoes.push(`${from}>${to}`);
  // Sanctions américaines historiques
  for (const to of ['Cuba', 'Venezuela']) if (s.nations[to]) s.embargoes.push(`United States of America>${to}`);

  // Marchands, puis forces armées calibrées sur les revenus réels
  runMerchantAI(s, world, true);
  const report = computeTrade(s, world);
  for (const n of alive(s)) {
    const inc = report.income[n.id] ?? { production: 0, trade: 0, tolls: 0 };
    const monthly = inc.production + inc.trade + inc.tolls;
    const budget = monthly * n.milShare;
    const coastal = world.provinces.some((p) => p.owner === n.id && p.coastal);
    n.army = Math.max(1, Math.round(((budget * (coastal ? 0.75 : 1)) / n.upkeepRate) * 10) / 10);
    n.navy = coastal ? Math.round(((budget * 0.25) / (n.upkeepRate * 2)) * 10) / 10 : 0;
    n.treasury = Math.round(monthly * 12 * 10) / 10;
    n.income = { production: inc.production, trade: inc.trade, tolls: inc.tolls, contracts: 0, upkeep: n.army * n.upkeepRate + n.navy * n.upkeepRate * 2, byNode: {} };
  }
  initOrgs(s);
  initCampaign(s, world);
  seedConvoys(s, world);
  seedPriceHistory(s);

  colorNations(s, world);
  s.log.unshift({ date: dateLabel(s), text: 'Bienvenue au 1er janvier 2026. Le monde vous attend.', kind: 'info', mine: true });
  return s;
}

/** Coloration gloutonne : deux nations voisines n'ont pas la même couleur. */
function colorNations(s: GameState, world: World) {
  const adj = new Map<Id, Set<Id>>();
  for (const p of world.provinces)
    for (const o of p.adj) {
      const a = p.owner;
      const b = world.provinces[o].owner;
      if (a === b) continue;
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a)!.add(b);
    }
  const ids = Object.keys(s.nations).sort((a, b) => (adj.get(b)?.size ?? 0) - (adj.get(a)?.size ?? 0));
  for (const id of ids) {
    const used = new Set([...(adj.get(id) ?? [])].map((o) => s.nations[o]?.color));
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pick = PALETTE.map((_, k) => PALETTE[(h + k) % PALETTE.length]).find((c) => !used.has(c));
    s.nations[id].color = pick ?? PALETTE[h % PALETTE.length];
  }
}
