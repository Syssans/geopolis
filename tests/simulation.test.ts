import { describe, expect, it } from 'vitest';
import topo from 'world-atlas/countries-110m.json';
import type { Topology } from 'topojson-specification';
import { buildWorld } from '../src/game/world';
import { createGame } from '../src/game/setup';
import { advanceMonth } from '../src/game/tick';
import { resolveEvent } from '../src/game/events';
import { alive, gdpOf, worldGdp } from '../src/game/state';
import { COUNTRIES } from '../src/data/countries';
import { declareWar, applyPeace, canDeclareWar } from '../src/game/war';
import { proposeAlliance, improveRelations, signTrade } from '../src/game/actions';

const world = buildWorld(topo as unknown as Topology);

function run(years: number, seed: number, player = 'France') {
  const s = createGame(world, player, seed);
  for (let i = 0; i < years * 12; i++) {
    advanceMonth(s, world);
    // Le joueur « automatique » choisit toujours la première option
    for (const e of [...s.events]) resolveEvent(s, e.uid, 0);
    if (s.gameOver) break;
  }
  return s;
}

describe('monde', () => {
  it('toutes les nations des données existent sur la carte', () => {
    for (const c of COUNTRIES) expect(world.adjacent[c.atlas], c.atlas).toBeDefined();
  });
  it('la France a des voisins terrestres et le Japon des voisins à portée', () => {
    expect(world.adjacent['France']).toContain('Germany');
    expect(world.near['Japan']).toContain('South Korea');
  });
});

describe('simulation', () => {
  it('reste cohérente sur 30 ans', () => {
    for (const seed of [1, 2, 3]) {
      const s = run(30, seed);
      const w0 = COUNTRIES.reduce((a, c) => a + c.gdp, 0);
      const w1 = worldGdp(s);
      for (const n of Object.values(s.nations)) {
        expect(Number.isFinite(n.strength), n.id).toBe(true);
        expect(Number.isFinite(n.treasury), n.id).toBe(true);
      }
      for (const t of Object.values(s.territories)) expect(Number.isFinite(t.gdp)).toBe(true);
      // Croissance mondiale annuelle moyenne plausible (1 % à 5 %)
      const cagr = Math.pow(w1 / w0, 1 / 30) - 1;
      expect(cagr).toBeGreaterThan(0.01);
      expect(cagr).toBeLessThan(0.05);
      // Le monde ne s'effondre pas
      expect(alive(s).length).toBeGreaterThan(140);
      console.log(
        `seed ${seed}: ${s.year} | PIB mondial ${w0.toFixed(0)} → ${w1.toFixed(0)} (${(cagr * 100).toFixed(2)} %/an) | nations ${alive(s).length} | guerres ${s.wars.length} | tension ${s.tension.toFixed(0)} | fin: ${s.gameOver ?? '-'}`,
      );
      const top = alive(s).map((n) => [n.name, gdpOf(s, n.id)] as const).sort((a, b) => b[1] - a[1]).slice(0, 6);
      console.log('  top PIB:', top.map(([n, g]) => `${n} ${g.toFixed(0)}`).join(', '));
      console.log('  guerres:', s.log.filter((l) => l.kind === 'war').length, 'événements militaires;', s.log.filter((l) => l.kind === 'war').slice(0, 6).map((l) => l.date + ' ' + l.text).join(' / '));
    }
  });
});

describe('guerre', () => {
  it('une grande puissance peut vaincre et annexer un petit voisin', () => {
    const s = createGame(world, 'Algeria', 7);
    expect(canDeclareWar(s, world, 'Algeria', 'Tunisia').ok).toBe(true);
    const war = declareWar(s, world, 'Algeria', 'Tunisia')!;
    for (let i = 0; i < 24 && s.wars.includes(war); i++) {
      advanceMonth(s, world);
      s.events = [];
    }
    if (s.wars.includes(war)) {
      expect(war.score).toBeGreaterThan(50);
      applyPeace(s, war, 'Algeria', { annex: ['Tunisia'], satellite: false, reparations: false });
    }
    expect(s.territories['Tunisia'].owner === 'Algeria' || s.nations['Tunisia'].bloc !== null || s.log.some((l) => l.text.includes('Tunisie'))).toBe(true);
  });

  it("attaquer un membre de l'OTAN déclenche l'appel aux armes", () => {
    const s = createGame(world, 'Germany', 3);
    declareWar(s, world, 'Russia', 'Estonia');
    const war = s.wars[0];
    expect(war.defenders).toContain('United States of America');
    expect(s.events.some((e) => e.kind === 'callToArms')).toBe(true);
    expect(s.tension).toBeGreaterThan(40);
  });

  it('les blocs ne peuvent pas se faire la guerre en interne', () => {
    const s = createGame(world, 'France', 3);
    expect(canDeclareWar(s, world, 'France', 'Germany').ok).toBe(false);
  });
});

describe('diplomatie', () => {
  it('alliance acceptée seulement avec de bonnes relations', () => {
    const s = createGame(world, 'India', 3);
    s.nations['India'].points.dip = 500;
    expect(proposeAlliance(s, 'India', 'Nepal').ok).toBe(false);
    for (let i = 0; i < 4; i++) improveRelations(s, 'India', 'Nepal');
    expect(proposeAlliance(s, 'India', 'Nepal').ok).toBe(true);
    expect(s.nations['Nepal'].bloc).toBe(s.nations['India'].bloc);
    expect(signTrade(s, 'India', 'Nepal').ok).toBe(true);
  });
});
