import { describe, expect, it } from 'vitest';
import { WORLD as world } from '../src/game/world';
import { createGame } from '../src/game/setup';
import { advanceMonth } from '../src/game/tick';
import { resolveEvent } from '../src/game/events';
import { alive, devOf, owned, rel } from '../src/game/state';
import { computeTrade, straitProvince } from '../src/game/trade';
import { canDeclareWar, declareWar, applyPeace, annexable } from '../src/game/war';
import {
  proposeAlliance, improveRelations, sendMissionary, setPolicy, toggleStrait, holyWarReasons, holyWarClaim, setMerchant,
} from '../src/game/actions';
import { RELIGIONS } from '../src/data/religions';
import { STRAITS } from '../src/data/trade';

function run(years: number, seed: number, player = 'France') {
  const s = createGame(world, player, seed);
  for (let i = 0; i < years * 12; i++) {
    advanceMonth(s, world);
    for (const e of [...s.events]) resolveEvent(s, world, e.uid, 0);
    if (s.gameOver) break;
  }
  return s;
}

const pidOf = (name: string) => world.provinces.find((p) => p.name === name)!.id;

describe('carte', () => {
  it('contient environ 900 provinces cohérentes', () => {
    expect(world.provinces.length).toBeGreaterThan(700);
    expect(world.provinces.length).toBeLessThan(1100);
    for (const p of world.provinces) {
      expect(RELIGIONS[p.religion], p.name).toBeDefined();
      for (const a of p.adj) expect(world.provinces[a].adj).toContain(p.id);
    }
  });
  it('chaque détroit est contrôlé par une province', () => {
    for (const st of STRAITS) expect(straitProvince(world, st.id), st.name).toBeDefined();
  });
  it('les pays mixtes ont des minorités religieuses', () => {
    const rels = (c: string) => new Set(world.provinces.filter((p) => p.owner === c).map((p) => p.religion));
    expect(rels('Nigeria').size).toBeGreaterThan(1);
    expect(rels('Iraq')).toContain('sunnite');
    expect(rels('India').size).toBeGreaterThan(1);
  });
});

describe('commerce', () => {
  it('distribue des revenus à toutes les nations', () => {
    const s = createGame(world, 'France', 1);
    const r = computeTrade(s, world);
    for (const n of alive(s)) {
      const inc = r.income[n.id];
      expect(inc, n.id).toBeDefined();
      expect(inc.production + inc.trade).toBeGreaterThan(0);
    }
  });
  it('fermer Ormuz fait flamber le pétrole et rapporte des péages en amont', () => {
    const s = createGame(world, 'Iran', 1);
    s.nations.Iran.influence = 500;
    const before = computeTrade(s, world).nodes.ormuz;
    expect(toggleStrait(s, world, 'Iran', 'ormuz').ok).toBe(true);
    const after = computeTrade(s, world).nodes.ormuz;
    expect(Object.values(after.out).reduce((a, b) => a + b, 0)).toBe(0);
    expect(Object.values(before.out).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    for (let i = 0; i < 12; i++) advanceMonth(s, world);
    expect(s.prices.petrole).toBeGreaterThan(1.3);
  });
  it('un marchand qui collecte augmente les revenus du nœud', () => {
    const s = createGame(world, 'France', 1);
    s.nations.France.merchants = [];
    const base = computeTrade(s, world).income.France.byNode.mediterranee ?? 0;
    setMerchant(s, world, 'France', 0, 'mediterranee', 'collect');
    const next = computeTrade(s, world).income.France.byNode.mediterranee ?? 0;
    expect(next).toBeGreaterThan(base);
  });
});

describe('religion', () => {
  it('un missionnaire finit par convertir une province', () => {
    const s = createGame(world, 'Nigeria', 3);
    const n = s.nations.Nigeria;
    const target = owned(s, 'Nigeria').find((p) => s.provinces[p].religion !== n.religion)!;
    n.fervor = 100;
    setPolicy(s, world, 'Nigeria', 'proselytisme');
    expect(sendMissionary(s, 'Nigeria', target).ok).toBe(true);
    for (let i = 0; i < 60 && s.provinces[target].religion !== n.religion; i++) {
      advanceMonth(s, world);
      s.events = [];
    }
    expect(s.provinces[target].religion).toBe(n.religion);
  });
  it('détenir Jérusalem ouvre la guerre sainte aux autres religions', () => {
    const s = createGame(world, 'Saudi Arabia', 3);
    expect(holyWarReasons(s, world, 'Saudi Arabia', 'Israel').length).toBeGreaterThan(0);
    s.nations['Saudi Arabia'].fervor = 100;
    expect(holyWarClaim(s, world, 'Saudi Arabia', 'Israel').ok).toBe(true);
    expect(holyWarReasons(s, world, 'Saudi Arabia', 'Jordan').length).toBe(0);
  });
  it('même religion = meilleures relations naturelles', () => {
    const s = createGame(world, 'France', 1);
    expect(rel(s, 'Saudi Arabia', 'Egypt')).toBeGreaterThan(rel(s, 'Saudi Arabia', 'Brazil'));
  });
});

describe('guerre', () => {
  it('une guerre se gagne province par province', () => {
    const s = createGame(world, 'Algeria', 7);
    s.nations.Algeria.army *= 5;
    expect(canDeclareWar(s, world, 'Algeria', 'Tunisia').ok).toBe(true);
    const war = declareWar(s, world, 'Algeria', 'Tunisia')!;
    for (let i = 0; i < 18 && s.wars.includes(war); i++) {
      advanceMonth(s, world);
      s.events = [];
    }
    if (s.wars.includes(war)) {
      const occ = annexable(s, war, 'Algeria');
      expect(occ.length).toBeGreaterThan(0);
      const before = devOf(s, 'Algeria');
      applyPeace(s, world, war, 'Algeria', { annex: occ, satellite: false, reparations: false });
      expect(devOf(s, 'Algeria')).toBeGreaterThan(before);
    }
  });
  it("attaquer un membre de l'OTAN déclenche l'appel aux armes", () => {
    const s = createGame(world, 'Germany', 3);
    declareWar(s, world, 'Russia', 'Estonia');
    expect(s.wars[0].defenders).toContain('United States of America');
    expect(s.events.some((e) => e.kind === 'callToArms')).toBe(true);
  });
  it('alliance acceptée seulement avec de bonnes relations', () => {
    const s = createGame(world, 'India', 3);
    s.nations.India.influence = 500;
    expect(proposeAlliance(s, 'India', 'Bangladesh').ok).toBe(false);
    for (let i = 0; i < 5; i++) improveRelations(s, 'India', 'Bangladesh');
    expect(proposeAlliance(s, 'India', 'Bangladesh').ok).toBe(true);
  });
});

describe('simulation longue', () => {
  it('reste cohérente sur 30 ans', () => {
    for (const seed of [1, 2, 3]) {
      const t0 = performance.now();
      const s = run(30, seed);
      const ms = (performance.now() - t0) / 360;
      for (const n of Object.values(s.nations)) {
        expect(Number.isFinite(n.army), n.id).toBe(true);
        expect(Number.isFinite(n.treasury), n.id).toBe(true);
      }
      expect(alive(s).length).toBeGreaterThan(140);
      const revolts = s.log.filter((l) => l.kind === 'religion').length;
      const wars = s.log.filter((l) => l.text.includes('déclare')).length;
      const top = alive(s)
        .map((n) => [n.name, n.income.production + n.income.trade + n.income.tolls] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
      console.log(
        `seed ${seed}: ${ms.toFixed(1)} ms/mois | nations ${alive(s).length} | guerres déclarées ${wars} | événements religieux ${revolts} | tension ${s.tension.toFixed(0)} | fin: ${s.gameOver ?? '-'}\n` +
          `  revenus: ${top.map(([n, v]) => `${n} ${v.toFixed(0)}`).join(', ')}\n` +
          `  ${s.log.filter((l) => l.kind === 'war' || l.kind === 'religion').slice(0, 8).map((l) => l.date + ' ' + l.text).join(' / ')}`,
      );
    }
  });
});

void pidOf;
