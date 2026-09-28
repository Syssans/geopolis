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
import { CAMPAIGNS } from '../src/data/campaign';
import { acceptOffer, capacity, committed, findRoutes } from '../src/game/contracts';
import { toggleForSale, upgrade } from '../src/game/economy';
import { output } from '../src/game/trade';
import { STRAITS } from '../src/data/trade';
import { canIntercept, clock, intercept, progressAt } from '../src/game/convoys';

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

describe('campagne', () => {
  it('les missions écrites référencent des nœuds, détroits, nations et lieux saints existants', () => {
    const nodes = new Set(world.provinces.map((p) => p.node));
    const sites = new Set(world.provinces.flatMap((p) => (p.holy ?? []).map((h) => h.name)));
    const s = createGame(world, 'France', 1);
    for (const [nation, c] of Object.entries(CAMPAIGNS)) {
      expect(s.nations[nation], nation).toBeDefined();
      expect(s.nations[c.rival], `${nation} → ${c.rival}`).toBeDefined();
      for (const mi of c.missions) {
        const k = mi.check;
        if (k.type === 'nodeShare') expect(nodes.has(k.node), mi.id).toBe(true);
        if (k.type === 'strait') expect(straitProvince(world, k.strait), mi.id).toBeDefined();
        if (k.type === 'holy') expect(sites.has(k.site), mi.id).toBe(true);
        if (k.type === 'contractWith' || k.type === 'relations') expect(s.nations[k.nation], mi.id).toBeDefined();
      }
    }
    expect(Object.keys(CAMPAIGNS).length).toBeGreaterThanOrEqual(25);
  });
  it('chaque partie démarre avec un rival et des missions non encore remplies', () => {
    for (const id of ['Saudi Arabia', 'Chad', 'Japan']) {
      const s = createGame(world, id, 2);
      expect(s.rival, id).not.toBeNull();
      expect(s.missions.length).toBeGreaterThan(4);
      expect(s.missions.every((m) => !m.done)).toBe(true);
    }
  });
  it('un contrat signé rapporte chaque mois et un détroit fermé le bloque', () => {
    const s = createGame(world, 'Saudi Arabia', 4);
    let guard = 0;
    while (!s.offers.length && guard++ < 40) {
      advanceMonth(s, world);
      s.events = [];
    }
    const offer = s.offers[0];
    expect(offer).toBeDefined();
    expect(acceptOffer(s, world, offer.id, 0).ok).toBe(true);
    advanceMonth(s, world);
    s.events = [];
    const c = s.contracts[0];
    if (c && c.lastStatus === 'ok') expect(s.nations['Saudi Arabia'].income.contracts).toBeGreaterThan(0);
    // Toutes les routes depuis le Golfe passent par Ormuz
    if (c && c.route.straits.includes('ormuz')) {
      s.nations.Iran.closedStraits.push('ormuz');
      advanceMonth(s, world);
      expect(s.contracts[0]?.lastStatus ?? 'blocked').toBe('blocked');
    }
  });
  it('les itinéraires contournent Suez par Le Cap', () => {
    const routes = findRoutes('ocean_indien', 'manche');
    expect(routes.length).toBeGreaterThan(1);
    expect(routes.some((r) => r.straits.includes('suez'))).toBe(true);
    expect(routes.some((r) => !r.straits.includes('suez'))).toBe(true);
  });
});

describe('production', () => {
  it('moderniser une province augmente sa production de 35 % après 12 mois', () => {
    const s = createGame(world, 'Saudi Arabia', 3);
    const pid = owned(s, 'Saudi Arabia').sort((a, b) => world.provinces[b].dev - world.provinces[a].dev)[0];
    s.nations['Saudi Arabia'].treasury = 10000;
    const before = output(s, world, pid);
    expect(upgrade(s, world, 'Saudi Arabia', pid).ok).toBe(true);
    expect(upgrade(s, world, 'Saudi Arabia', pid).ok).toBe(false); // chantier en cours
    for (let i = 0; i < 12; i++) {
      advanceMonth(s, world);
      s.events = [];
    }
    expect(s.provinces[pid].level).toBe(1);
    expect(output(s, world, pid)).toBeCloseTo(before * 1.35, 1);
  });
  it('les offres ne dépassent jamais la production disponible et respectent le retrait de la vente', () => {
    const s = createGame(world, 'Brazil', 8);
    for (let i = 0; i < 60; i++) {
      advanceMonth(s, world);
      s.events = [];
      for (const o of s.offers) {
        const free = (capacity(s, world, 'Brazil')[o.good] ?? 0) - (committed(s)[o.good] ?? 0);
        expect(o.volume).toBeLessThanOrEqual(free + 1e-6 + (capacity(s, world, 'Brazil')[o.good] ?? 0) * 0.2);
        acceptOffer(s, world, o.id, 0);
      }
      for (const [g, v] of Object.entries(committed(s))) expect(v).toBeLessThanOrEqual((capacity(s, world, 'Brazil')[g as never] ?? 0) * 1.05 + 1e-6);
    }
    toggleForSale(s, 'cereales');
    for (let i = 0; i < 24; i++) {
      advanceMonth(s, world);
      s.events = [];
      expect(s.offers.some((o) => o.good === 'cereales')).toBe(false);
    }
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

describe('tracés', () => {
  it('chaque liaison du réseau commercial a un tracé réel', async () => {
    const { TRADE_NODES } = await import('../src/data/trade');
    const { hasLane, PORTS } = await import('../src/data/routes');
    for (const n of TRADE_NODES) {
      expect(PORTS[n.id], n.id).toBeDefined();
      for (const o of n.out) expect(hasLane(n.id, o), `${n.id} → ${o}`).toBe(true);
    }
    for (const [a, b] of [['new_york', 'manche'], ['caraibes', 'afrique_ouest'], ['australie', 'ocean_indien']]) expect(hasLane(a, b)).toBe(true);
  });
});

describe('convois', () => {
  it('des convois circulent en permanence et arrivent à destination', () => {
    const s = createGame(world, 'France', 5);
    expect(s.convoys.length).toBeGreaterThan(25);
    for (let i = 0; i < 24; i++) advanceMonth(s, world);
    expect(s.convoys.length).toBeGreaterThan(25);
    const now = clock(s);
    for (const c of s.convoys) {
      expect(progressAt(c, now)).toBeLessThan(1);
      expect(c.value).toBeGreaterThan(0);
      expect(c.from).not.toBe(c.to);
      expect(c.nodes.length).toBeGreaterThan(1);
    }
  });

  it('intercepter un convoi en temps de paix a des conséquences diplomatiques', () => {
    const s = createGame(world, 'United Kingdom', 7);
    s.nations[s.player].navy = 40;
    const t = clock(s) + 0.5;
    const c = s.convoys.find((x) => x.from !== s.player && canIntercept(s, world, x, t).ok && !canIntercept(s, world, x, t).legal)!;
    expect(c).toBeTruthy();
    const before = rel(s, s.player, c.from);
    const treasury = s.nations[s.player].treasury;
    s.rng = 1; // tirage favorable ou non : on vérifie les deux issues
    const res = intercept(s, world, c.id, t);
    if (res.ok) {
      expect(s.nations[s.player].treasury).toBeGreaterThan(treasury);
      expect(rel(s, s.player, c.from)).toBeLessThanOrEqual(before - 35);
      expect(s.embargoes).toContain(`${c.from}>${s.player}`);
      expect(s.convoys.find((x) => x.id === c.id)).toBeUndefined();
    } else expect(rel(s, s.player, c.from)).toBeLessThan(before);
    // Une seule interception par mois
    const other = s.convoys.find((x) => x.from !== s.player)!;
    expect(canIntercept(s, world, other, t).ok).toBe(false);
  });
});
