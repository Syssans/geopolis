import * as A from '../game/actions';
import { aiTerms, describeTerms } from '../game/ai';
import { resolveEvent } from '../game/events';
import { fervorGain, holySitesOf, missionSpeed, POLICIES, unrestTarget } from '../game/religion';
import { influenceGain } from '../game/tick';
import { createGame, SAVE_VERSION } from '../game/setup';
import {
  MONTHS, alive, dateLabel, devOf, hasTrade, embargoes, inReach, neighbours, nm, owned, popOf, power, powerRank, rel, sameBloc,
  warBetween, warsOf, desecratedHolySites,
} from '../game/state';
import { advanceMonth } from '../game/tick';
import * as C from '../game/contracts';
import * as V from '../game/convoys';
import * as P from '../game/purchases';
import * as O from '../game/orgs';
import { initOrgs } from '../game/orgs';
import { LIFT_COST, MAX_PRESSURE, liftChance, negotiateLift } from '../game/sanctions';
import { MARGIN, TIERS, tierFromGdp } from '../data/tiers';
import { COUNTRIES } from '../data/countries';
import * as E from '../game/economy';
import { progress, scoreBreakdown, monthlyIncome } from '../game/missions';
import { CAMPAIGNS } from '../data/campaign';
import { computeTrade, homeNode, NODES, output, production, straitClosed, straitOwner, TOLL, unitPrice as unitPriceOf, type TradeReport } from '../game/trade';
import type { GameState, Id, NeedLine, PeaceTerms, Pid, Policy, War, World } from '../game/types';
import {
  aiAcceptsPeace, annexable, applyPeace, canDeclareWar, enemyLeader, isLeader, scoreFor, termsCost,
} from '../game/war';
import { RELIGIONS, type Religion } from '../data/religions';
import { GOODS, STRAITS, TRADE_NODES } from '../data/trade';
import type { Topology } from 'topojson-specification';
import { cls, colorSigns, esc, iconize, money, num, partitive, pct, pop, signed } from './format';
import { MapView, type MapMode } from './map';
import { flagOf } from '../data/flags';
import { chartPointer, priceChart, sparkline, type RefLine } from './charts';
import { clock as clockOf } from '../game/convoys';

const SAVE_KEY = 'geopolis-save-v2';
const SPEEDS = [0, 4000, 2500, 1500, 800]; // ms par mois
const MODES: { id: MapMode; icon: string; name: string; legend: string }[] = [
  { id: 'political', icon: '🗺️', name: 'Politique', legend: 'Les nations et leurs frontières. Votre pays est entouré d’or.' },
  { id: 'religion', icon: '🕊️', name: 'Religions', legend: 'La confession de chaque province : repérez vos minorités et celles de vos voisins.' },
  { id: 'trade', icon: '⚓', name: 'Commerce', legend: 'Les nœuds commerciaux, les voies maritimes réelles et chaque convoi en mer. Touchez un convoi pour voir sa cargaison, son origine, sa destination, et l’intercepter. ⚓ = détroit à péage.' },
  { id: 'diplomatic', icon: '🤝', name: 'Diplomatie', legend: 'Vos relations avec chaque pays : du rouge (hostile) au vert (ami).' },
  { id: 'unrest', icon: '🔥', name: 'Agitation', legend: 'Le risque d’insurrection dans chaque province : du vert (calme) au rouge (révolte).' },
];

type Handler = (arg: string) => void;

export class App {
  private s: GameState | null = null;
  private map: MapView;
  private mode: MapMode = 'political';
  private selected: Pid | null = null;
  private tab = 'prov';
  private speed = 0;
  private lastSpeed = 2;
  private timer: number | null = null;
  private seenLog = 0;
  private picking = false;
  private handlers: Record<string, Handler> = {};
  private el: Record<string, HTMLElement> = {};
  private touching = false;
  private dirty = false;
  private report: TradeReport | null = null;
  private offerRoute: Record<number, number> = {};
  private contractsTab = 'resources';
  private selConvoy: number | null = null;
  private marketGood: string | null = null;
  private provSort = 'value';
  private renderQueued = false;
  /** Vitesse à reprendre une fois les alertes traitées (0 : rester en pause). */
  private resumeSpeed = 0;

  private pauseForEvents() {
    if (this.speed > 0) this.resumeSpeed = this.speed;
    this.setSpeed(0);
  }
  /** Menu ouvert : celui d'un pays (onglets) ou la fiche d'une province. */
  private view: 'country' | 'province' = 'province';
  private pf: { seller: Id; good: keyof typeof GOODS; volume: number; months: number; route: number } | null = null;

  constructor(private root: HTMLElement, private world: World, topo: Topology) {
    this.map = new MapView(root, topo, world);
    this.map.onSelect = (pid) => this.onMapTap(pid);
    this.map.onConvoy = (id) => !this.picking && this.showConvoy(id);
    for (const k of ['hud', 'wars', 'tension', 'bottom', 'legend', 'sheet', 'toasts', 'overlay', 'picker', 'title']) {
      const d = document.createElement('div');
      d.className = k;
      if (['overlay', 'picker', 'title', 'hud', 'wars', 'tension', 'bottom', 'legend'].includes(k)) d.style.display = 'none';
      root.appendChild(d);
      this.el[k] = d;
    }
    root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!t || (t as HTMLButtonElement).disabled) return;
      e.stopPropagation();
      this.handlers[t.dataset.a!]?.(t.dataset.p ?? '');
    });
    // Pendant un contact, on ne reconstruit pas le DOM (sinon le tap serait perdu)
    root.addEventListener('pointerdown', () => (this.touching = true), true);
    const release = () =>
      setTimeout(() => {
        this.touching = false;
        if (this.dirty) {
          this.dirty = false;
          this.renderAll();
        }
      }, 60);
    root.addEventListener('pointerup', release, true);
    root.addEventListener('pointercancel', release, true);
    root.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.i) this.handlers[t.dataset.i]?.(t.value);
    });
    root.addEventListener('pointermove', chartPointer);
    root.addEventListener('pointerdown', chartPointer);
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.c) this.handlers[t.dataset.c]?.(`${t.dataset.p ?? ''}|${t.value}`);
    });
    this.registerHandlers();
    this.showTitle();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.s && !this.picking) this.save(true);
    });
  }

  private get state(): GameState {
    return this.s!;
  }

  private get me() {
    return this.state.nations[this.state.player];
  }

  // ————————————————————————————— Cycle de jeu —————————————————————————————

  private setSpeed(v: number) {
    this.speed = v;
    this.map.setMonthMs(SPEEDS[v]);
    if (v > 0) {
      this.lastSpeed = v;
      this.resumeSpeed = 0;
    }
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (v > 0 && this.s && !this.s.gameOver) this.timer = window.setInterval(() => this.tick(), SPEEDS[v]);
    this.renderHud();
  }

  private tick() {
    const s = this.state;
    if (s.events.length || s.gameOver) {
      this.pauseForEvents();
      this.renderAll();
      return;
    }
    const before = s.log[0] ?? null;
    advanceMonth(s, this.world);
    this.report = null;
    const fresh = [];
    for (const l of s.log) {
      if (l === before) break;
      fresh.push(l);
    }
    for (const l of fresh.reverse()) if (l.mine) this.notify(l);
    if (s.events.length || s.gameOver) this.pauseForEvents();
    // Affichage à l'image suivante, sauvegarde annuelle un peu plus tard : le calcul du mois,
    // le rendu et l'écriture ne s'enchaînent pas dans une seule tâche (les convois ne se figent pas)
    if (!this.renderQueued) {
      this.renderQueued = true;
      requestAnimationFrame(() => {
        this.renderQueued = false;
        this.renderAll();
      });
    }
    // Sauvegarde annuelle quand le navigateur est inactif (elle ne doit pas figer l'animation)
    if (s.month === 1) {
      const w = window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void };
      if (w.requestIdleCallback) w.requestIdleCallback(() => this.save(true), { timeout: 3000 });
      else setTimeout(() => this.save(true), 300);
    }
  }

  private trade(): TradeReport {
    return (this.report ??= computeTrade(this.state, this.world));
  }

  private start(s: GameState) {
    this.s = s;
    this.selected = null;
    this.report = null;
    for (const k of ['hud', 'wars', 'tension', 'bottom', 'legend']) this.el[k].style.display = '';
    this.el.title.style.display = 'none';
    this.el.picker.style.display = 'none';
    this.picking = false;
    this.seenLog = s.log.length;
    this.renderAll();
    this.map.focus(owned(s, s.player), 8);
    this.setSpeed(0);
  }

  private save(silent = false) {
    if (!this.s) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.s));
      if (!silent) this.toast('Partie sauvegardée', 'good');
    } catch {
      if (!silent) this.toast('Sauvegarde impossible', 'bad');
    }
  }

  private loadSave(): GameState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as GameState;
      s.storePolicy ??= {}; // champs ajoutés depuis
      if (!s.orgs || !Object.keys(s.orgs).length) initOrgs(s);
      s.prosperity ??= { points: 40, satisfaction: 1, months: 0 };
      for (const n of Object.values(s.nations)) {
        if (n.tier) continue;
        const c = COUNTRIES.find((x) => x.atlas === n.id);
        n.tier = c ? tierFromGdp(c.gdp / c.pop) : 3;
      }
      if (s.version === 4 || s.version === 5 || s.version === 6) {
        s.purchases ??= [];
        s.stock ??= {};
        s.needs ??= null;
        // Sauvegardes antérieures : convois et historique des cours reprennent au mois suivant
        s.convoys ??= [];
        s.priceHistory ??= Object.fromEntries(Object.keys(GOODS).map((g) => [g, [s.prices[g] ?? 1]]));
        s.version = SAVE_VERSION;
      }
      return s.version === SAVE_VERSION && s.provinces.length === this.world.provinces.length ? s : null;
    } catch {
      return null;
    }
  }

  // ————————————————————————————— Écrans —————————————————————————————

  private showTitle() {
    this.setSpeed(0);
    const hasSave = !!this.loadSave();
    this.el.title.style.display = '';
    this.el.title.innerHTML = `
      <h1>GEOPOLIS</h1>
      <p>Commerce, foi et puissance · 2026</p>
      ${hasSave ? `<button class="btn primary" data-a="continue">Continuer la partie</button>` : ''}
      <button class="btn ${hasSave ? '' : 'primary'}" data-a="newgame">Nouvelle partie</button>
      <button class="btn" data-a="help">Comment jouer</button>`;
  }

  private showPicker(filter = '') {
    this.picking = true;
    this.el.title.style.display = 'none';
    if (!this.s) {
      this.s = createGame(this.world, 'France', 1);
      this.map.render(this.s, 'political', null);
    }
    const preview = this.s;
    const list = alive(preview)
      .map((n) => ({ n, d: devOf(preview, n.id) }))
      .filter((x) => x.n.name.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => b.d - a.d);
    const diff = (d: number) => (d > 400 ? ['Facile', 'var(--good)'] : d > 80 ? ['Moyen', 'var(--warn)'] : ['Difficile', 'var(--bad)']);
    const p = this.el.picker;
    p.style.display = '';
    if (!p.querySelector('input'))
      p.innerHTML = `<div class="top"><h2>Choisissez votre nation</h2>
        <input type="search" placeholder="Rechercher un pays… (ou touchez la carte)" data-i="filter"></div><div class="list"></div>`;
    p.querySelector('.list')!.innerHTML = list
      .map(({ n, d }) => {
        const [label, c] = diff(d);
        return `<button class="pick" data-a="pick" data-p="${esc(n.id)}"><i class="dot" style="background:${n.color}"></i>
          <span>${flagOf(n.id)} ${esc(n.name)} ${n.nuclear ? '☢' : ''}<br><small>${RELIGIONS[n.religion].icon} ${RELIGIONS[n.religion].name} · ${owned(preview, n.id).length} prov. · dév. ${d}${n.bloc ? ' · ' + esc(preview.blocs[n.bloc].name) : ''}</small></span>
          <em class="diff" style="color:${c};border-color:${c}">${label}</em></button>`;
      })
      .join('');
  }

  private confirmPick(id: Id) {
    const s = this.s!;
    const n = s.nations[id];
    this.map.focus(owned(s, id), 6);
    const inc = computeTrade(s, this.world).income[id];
    const goods = [...new Set(owned(s, id).map((p) => this.world.provinces[p].good))].map((g) => GOODS[g].icon).join(' ');
    this.modal(
      `${flagOf(n.id)} ${esc(n.name)}`,
      `<div class="stats">
        ${stat('Religion', `${RELIGIONS[n.religion].icon} ${RELIGIONS[n.religion].name}`)}${stat('Provinces', String(owned(s, id).length))}
        ${stat('Revenus / mois', money(inc.production + inc.trade + inc.tolls))}${stat('Productions', goods)}
        ${stat('Bloc', n.bloc ? esc(s.blocs[n.bloc].name) : 'Non-aligné')}${stat('Puissance', `#${powerRank(s, id)}${n.nuclear ? ' ☢' : ''}`)}
      </div>
      <p class="muted">Voisins : ${neighbours(s, this.world, id).map((x) => this.flag(x)).join(' ') || 'aucun'}</p>`,
      [
        { label: `Diriger ${esc(n.name)}`, a: 'play', p: id, primary: true },
        { label: 'Choisir un autre pays', a: 'closeModal' },
      ],
    );
  }

  // ————————————————————————————— Actions UI —————————————————————————————

  private registerHandlers() {
    const h = this.handlers;
    const s = () => this.state;
    const me = () => this.state.player;
    const selOwner = () => this.state.provinces[this.selected!].owner;
    h.newgame = () => {
      this.s = null;
      this.showPicker();
    };
    h.continue = () => {
      const sv = this.loadSave();
      if (sv) this.start(sv);
    };
    h.help = () => this.showHelp();
    h.filter = (v) => this.showPicker(v);
    h.pick = (id) => this.confirmPick(id);
    h.play = (id) => {
      this.closeModal();
      this.start(createGame(this.world, id));
      this.showIntro();
    };
    h.closeModal = () => this.closeModal();
    h.speed = (v) => this.setSpeed(Number(v));
    h.toggle = () => this.setSpeed(this.speed ? 0 : this.lastSpeed);
    h.modes = () => this.showModes();
    h.explain = (k) => this.explain(k);
    h.mode = (m) => {
      this.mode = m as MapMode;
      this.closeModal();
      this.renderAll();
    };
    h.me = () => this.openCountry('provs');
    h.country = () => {
      if (this.selected !== null) this.openCountry(undefined, s().provinces[this.selected].owner);
    };
    h.close = () => this.select(null);
    h.tab = (t) => {
      if (this.view === 'province' && this.selected !== null) return this.openCountry(t, s().provinces[this.selected].owner);
      this.tab = t;
      this.renderSheet(true);
    };
    h.menu = () => this.showMenu();
    h.save = () => {
      this.save();
      this.closeModal();
    };
    h.quit = () => {
      this.save(true);
      this.closeModal();
      this.el.sheet.classList.remove('open');
      for (const k of ['hud', 'wars', 'tension', 'bottom', 'legend']) this.el[k].style.display = 'none';
      this.showTitle();
    };
    h.log = () => this.showLog();
    h.contracts = (t) => this.showContracts(t || (this.state.offers.length ? 'offers' : 'resources'));
    h.forSale = (g) => {
      const r = E.toggleForSale(this.state, g as keyof typeof GOODS);
      this.toast(r.msg, 'good');
      this.showContracts('resources');
      this.renderHud();
    };
    h.objectives = () => this.showObjectives();
    h.marketGood = (g) => {
      this.marketGood = g;
      this.showContracts('markets');
      this.el.overlay.querySelector('.content')?.scrollTo({ top: 0 });
    };
    h.offerRoute = (v) => {
      const [id, idx] = v.split(':').map(Number);
      this.offerRoute[id] = idx;
      this.showContracts('offers');
    };
    const refresh = (r: { ok: boolean; msg: string }) => {
      this.report = null;
      this.toast(r.msg, r.ok ? 'good' : 'bad');
      this.showContracts(this.contractsTab);
      this.renderHud();
    };
    h.sign = (id) => refresh(C.acceptOffer(this.state, this.world, Number(id), this.offerRoute[Number(id)] ?? 0));
    h.negotiate = (id) => refresh(C.negotiate(this.state, Number(id)));
    h.decline = (id) => refresh(C.declineOffer(this.state, Number(id)));
    h.reroute = (v) => {
      const [id, idx] = v.split(':').map(Number);
      refresh(C.setRoute(this.state, id, idx));
    };
    h.escort = (v) => {
      const [id, d] = v.split(':').map(Number);
      refresh(C.setEscort(this.state, id, d));
    };
    h.who = (id) => {
      const s = this.state;
      this.toast(`${flagOf(id)} ${nm(s, id)}${id === s.player ? ' (vous)' : ` · 🌍 ${signed(Math.round(rel(s, s.player, id)))}`}`);
    };
    h.gotoNode = (n) => {
      this.closeModal();
      if (this.mode !== 'trade') this.mode = 'trade';
      this.select(null);
      this.map.focusNode(n);
    };
    h.gotoStrait = (x) => {
      this.closeModal();
      if (this.mode !== 'trade') this.mode = 'trade';
      this.select(null);
      this.map.focusStrait(x);
    };
    h.storePol = (v) => {
      const [g, x] = v.split(':');
      const k = g as keyof typeof GOODS;
      if (Number(x)) this.state.storePolicy[k] = Number(x);
      else delete this.state.storePolicy[k];
      this.report = null;
      this.toast(Number(x) ? `${GOODS[k].icon} Surplus de ${GOODS[k].name.toLowerCase()} : ${Number(x) === 1 ? 'tout' : 'la moitié'} en stock chaque mois` : `${GOODS[k].icon} Surplus de ${GOODS[k].name.toLowerCase()} vendu au marché`, 'good');
      this.showContracts(this.contractsTab);
      this.renderHud();
    };
    h.provSort = (k) => {
      this.provSort = k;
      this.renderSheet();
    };
    h.market = (g) => {
      this.marketGood = g;
      this.showContracts('markets');
      this.el.overlay.querySelector('.content')?.scrollTo({ top: 0 });
    };
    h.liftSanction = (id) => {
      const r = negotiateLift(this.state, this.state.player, id);
      this.toast(r.msg, r.ok ? 'good' : 'bad');
      this.report = null;
      this.explain('sanctions');
      this.renderHud();
    };
    h.opecJoin = () => this.run(O.joinOpec(this.state, this.world, this.state.player));
    h.opecLeave = () => this.run(O.leaveOpec(this.state, this.state.player));
    h.suppliers = (g) => this.showSuppliers(g as keyof typeof GOODS);
    h.buyFrom = (id) => this.showSellerGoods(id);
    h.pForm = (v) => {
      const [seller, good] = v.split('|');
      this.pf = { seller, good: good as keyof typeof GOODS, volume: 0, months: 24, route: 0 };
      this.showPurchaseForm();
    };
    h.pSet = (v) => {
      const [k, x] = v.split(':');
      if (k === 'v') this.pf!.volume = Number(x);
      if (k === 'm') this.pf!.months = Number(x);
      if (k === 'r') this.pf!.route = Number(x);
      this.showPurchaseForm();
    };
    h.pSign = () => {
      const f = this.pf!;
      const r = P.proposePurchase(this.state, this.world, f.seller, f.good, f.volume, f.months, f.route);
      this.toast(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) this.showContracts('active');
      this.renderHud();
    };
    h.spotBuy = (g) => {
      const r = P.buySpot(this.state, g as keyof typeof GOODS, this.lot(g as keyof typeof GOODS));
      refresh(r);
    };
    h.spotSell = (v) => {
      const [g, f] = v.split(':');
      refresh(P.sellSpot(this.state, g as keyof typeof GOODS, (this.state.stock[g as keyof typeof GOODS] ?? 0) * Number(f)));
    };
    h.pEscort = (v) => {
      const [id, d] = v.split(':').map(Number);
      refresh(P.setPurchaseEscort(this.state, id, d, C.escortsUsed(this.state)));
    };
    h.pReroute = (v) => {
      const [id, idx] = v.split(':').map(Number);
      refresh(P.setPurchaseRoute(this.state, id, idx));
    };
    h.cancelPurchase = (id) => refresh(P.cancelPurchase(this.state, Number(id)));
    h.intercept = (id) => {
      const r = V.intercept(this.state, this.world, Number(id), this.map.now);
      this.selConvoy = null;
      this.closeModal();
      this.report = null;
      this.toast(r.msg, r.ok ? 'good' : 'bad');
      this.renderAll();
    };
    h.cancelContract = (id) => refresh(C.cancelContract(this.state, Number(id)));
    h.sandbox = () => {
      this.state.endYear = 9999;
      this.closeModal();
    };
    h.ledger = (t) => this.showLedger(t || 'trade');
    h.goto = (pid) => {
      this.closeModal();
      this.openProvince(Number(pid));
      this.map.focus([Number(pid)], 10, true);
    };
    h.gotoNation = (id) => {
      this.closeModal();
      if (owned(s(), id).length) {
        this.openCountry(id === s().player ? 'provs' : 'nation', id);
        this.map.focus(owned(s(), id), 6, true);
      }
    };
    h.event = (p) => {
      const [uid, opt] = p.split(':').map(Number);
      const msg = resolveEvent(s(), this.world, uid, opt);
      this.closeModal();
      if (msg) this.toast(msg);
      this.renderAll();
      // Dernière alerte traitée : la partie reprend à la vitesse d'avant
      if (!s().events.length && this.resumeSpeed && !s().gameOver && this.el.overlay.style.display === 'none') {
        const v = this.resumeSpeed;
        this.resumeSpeed = 0;
        this.setSpeed(v);
      }
    };
    h.war = (id) => this.showWar(id);
    h.peace = (id) => this.showPeace(id);
    h.peaceToggle = () => this.updatePeaceCost();
    h.peaceSend = (id) => this.sendPeace(id, false);
    h.peaceWhite = (id) => this.sendPeace(id, true);
    h.surrender = (id) => {
      const war = s().wars.find((w) => w.id === id);
      if (!war) return;
      const winner = enemyLeader(war, me());
      applyPeace(s(), this.world, war, winner, aiTerms(s(), this.world, war, winner));
      this.closeModal();
      this.renderAll();
    };
    h.declare = (id) => this.confirmWar(id);
    h.declareGo = (id) => {
      this.closeModal();
      this.run(A.warAction(s(), this.world, me(), id));
    };
    h.policy = (p) => this.run(A.setPolicy(s(), this.world, me(), p as Policy));
    const acts: Record<string, () => A.ActionResult> = {
      recruit: () => A.recruit(s(), me()),
      disband: () => A.disband(s(), me()),
      fleet: () => A.recruit(s(), me(), true),
      disbandFleet: () => A.disband(s(), me(), true),
      nuke: () => A.startNuclearProgram(s(), me()),
      unity: () => A.nationalUnity(s(), me()),
      appeal: () => A.appealToFaithful(s(), me()),
      recall: () => A.recallMissionary(s(), me()),
      quitBloc: () => A.quitBloc(s(), me()),
      missionary: () => A.sendMissionary(s(), me(), this.selected!),
      integrate: () => A.integrate(s(), me(), this.selected!),
      strait: () => A.toggleStrait(s(), this.world, me(), this.world.provinces[this.selected!].strait!),
      support: () => A.supportRebels(s(), this.world, me(), this.selected!),
      improve: () => A.improveRelations(s(), me(), selOwner()),
      trade: () => A.signTrade(s(), me(), selOwner()),
      untrade: () => A.cancelTrade(s(), me(), selOwner()),
      embargo: () => A.toggleEmbargo(s(), me(), selOwner()),
      aid: () => A.sendAid(s(), me(), selOwner()),
      alliance: () => A.proposeAlliance(s(), me(), selOwner()),
      joinBloc: () => A.requestJoinBloc(s(), me(), selOwner()),
      claim: () => A.fabricateClaim(s(), this.world, me(), selOwner()),
      holyClaim: () => A.holyWarClaim(s(), this.world, me(), selOwner()),
    };
    for (const [k, fn] of Object.entries(acts)) h[k] = () => this.run(fn());
    h.upgrade = () => this.run(E.upgrade(s(), this.world, me(), this.selected!));
    h.prospect = () => this.run(E.prospect(s(), this.world, me(), this.selected!));
    h.convert = (g) => this.run(E.convert(s(), this.world, me(), this.selected!, g as keyof typeof GOODS));
  }

  private run(r: A.ActionResult) {
    this.report = null;
    this.toast(r.msg, r.ok ? 'good' : 'bad');
    this.renderAll();
  }

  private onMapTap(pid: Pid | null) {
    if (this.picking) {
      if (pid !== null && this.s) this.confirmPick(this.s.provinces[pid].owner);
      return;
    }
    if (!this.s) return;
    if (pid === null) return this.select(null);
    // 1er toucher sur un pays : son menu ; toucher à nouveau ce pays : la fiche de la province touchée
    const owner = this.s.provinces[pid].owner;
    const current = this.selected !== null ? this.s.provinces[this.selected].owner : null;
    if (current === owner || owner === this.s.player) this.openProvince(pid);
    else this.openCountry(undefined, owner);
  }

  private select(pid: Pid | null, tab?: string) {
    const prev = this.selected;
    this.selected = pid;
    if (tab) this.tab = tab;
    else if (pid !== null && pid !== prev) this.tab = 'prov';
    this.view = this.tab === 'prov' ? 'province' : 'country';
    this.renderAll(true);
  }

  /** Menu d'un pays (par défaut le vôtre) : onglets Provinces, Commerce… ou Nation pour un pays étranger. */
  private openCountry(tab?: string, id: Id = this.state.player) {
    const s = this.state;
    const cap = owned(s, id).sort((a, b) => (this.world.provinces[b].capital ? 1 : 0) - (this.world.provinces[a].capital ? 1 : 0) || this.world.provinces[b].dev - this.world.provinces[a].dev)[0];
    if (cap === undefined) return;
    this.selected = cap; // province de référence (actions diplomatiques), non surlignée
    this.view = 'country';
    this.tab = tab ?? (id === s.player ? 'provs' : 'nation');
    this.renderAll(true);
  }

  /** Fiche d'une province. */
  private openProvince(pid: Pid) {
    this.selected = pid;
    this.view = 'province';
    this.tab = 'prov';
    this.renderAll(true);
  }

  // ————————————————————————————— Rendu —————————————————————————————

  private renderAll(resetScroll = false) {
    if (!this.s) return;
    this.map.render(this.s, this.mode, this.view === 'province' ? this.selected : null, this.selConvoy, this.view === 'country' && this.selected !== null ? this.s.provinces[this.selected].owner : null);
    if (this.touching && !resetScroll) {
      this.dirty = true;
      return;
    }
    this.renderHud();
    this.renderSheet(resetScroll);
    this.renderEvents();
  }

  private renderHud() {
    const s = this.s;
    if (!s || this.picking) return;
    const me = s.nations[s.player];
    const inc = me.income;
    const net = inc.production + inc.trade + inc.tolls + (inc.contracts ?? 0) - inc.upkeep - (inc.admin ?? 0) - (this.state.needs ? this.state.needs.cost + this.state.needs.purchases : 0);
    if (!this.el.hud.firstChild)
      this.el.hud.innerHTML = `<button class="me" data-a="me"></button>
        <div class="time"><span class="date"></span><div class="speed"></div></div><div class="res"></div>`;
    const q = (sel: string) => this.el.hud.querySelector<HTMLElement>(sel)!;
    patch(q('.me'), `<i class="flag-hud">${flagOf(me.id)}</i><span>${esc(me.name)}</span><i class="chev">›</i>`);
    const tile = (key: string, icon: string, label: string, value: string, delta: string, warn = false) =>
      `<button class="tile ${warn ? 'warn' : ''}" data-a="explain" data-p="${key}"><span class="tl">${icon} ${label}</span><b>${value}</b><small>${delta}</small></button>`;
    patch(
      q('.res'),
      tile('treasury', '💰', 'Trésor', money(me.treasury), `${net >= 0 ? '+' : '−'}${num(Math.abs(net), Math.abs(net) < 10 ? 1 : 0)} / mois`, me.treasury < 0 || net < 0) +
        tile('influence', '🤝', 'Influence', String(Math.floor(me.influence)), `+${influenceGain(s, me.id)} / mois`) +
        tile('fervor', '🔥', 'Ferveur', String(Math.floor(me.fervor)), `+${num(fervorGain(s, this.world, me.id), 1)} / mois`) +
        tile('stability', '⚖️', 'Stabilité', `${num(me.stability)}<small>/100</small>`, me.stability < 35 ? 'Danger !' : me.stability < 50 ? 'Fragile' : 'Solide', me.stability < 35),
    );
    patch(q('.date'), dateLabel(s));
    patch(
      q('.speed'),
      `<button class="toggle ${this.speed === 0 ? 'paused' : ''}" data-a="toggle" aria-label="${this.speed === 0 ? 'Reprendre' : 'Pause'}">⏸</button>
       ${[1, 2, 3, 4].map((v) => `<button class="${this.speed === v ? 'on' : ''}" data-a="speed" data-p="${v}">${'›'.repeat(v)}</button>`).join('')}`,
    );
    const wars = warsOf(s, s.player);
    patch(
      this.el.wars,
      wars
        .map((w) => {
          const sc = scoreFor(w, s.player);
          return `<button class="warchip" data-a="war" data-p="${w.id}">${w.holy ? '☪✝' : '⚔️'} ${flagOf(enemyLeader(w, s.player))} · <b class="${cls(sc)}">${signed(sc)}</b></button>`;
        })
        .join('') +
        (s.rival && s.nations[s.rival].alive
          ? `<button class="rivalchip" data-a="gotoNation" data-p="${esc(s.rival)}">🗡️ Rival : ${esc(nm(s, s.rival))}<i style="width:${s.rivalHostility}%"></i></button>`
          : '') +
        `<button class="warchip tierchip" data-a="contracts" data-p="resources">${TIERS[me.tier - 1].icon} ${esc(TIERS[me.tier - 1].name)} <b class="${s.prosperity.satisfaction >= 0.8 ? 'pos' : 'neg'}">${s.prosperity.satisfaction >= 0.8 ? '▲' : '▼'} ${Math.round(s.prosperity.points)} %</b></button>` +
        (me.sanctions ? `<button class="warchip sanctions" data-a="explain" data-p="sanctions">🚫 Sanctions <b class="neg">−${Math.round(me.sanctions.p * 100)} %</b></button>` : '') +
        (s.contracts.some((c) => c.lastStatus !== 'ok')
          ? `<button class="warchip" data-a="contracts" data-p="active">📦 ${s.contracts.filter((c) => c.lastStatus !== 'ok').length} contrat(s) en difficulté</button>`
          : ''),
    );
    const t = s.tension;
    this.el.tension.style.display = t >= 40 ? '' : 'none';
    patch(this.el.tension, `<button class="tension-btn" data-a="explain" data-p="tension">☢️ Tension mondiale <b class="${t < 33 ? 'pos' : t < 66 ? 'c-warn' : 'neg'}">${num(t)} %</b><div class="bar"><i style="width:${t}%"></i></div></button>`);
    const unread = s.log.length - this.seenLog;
    patch(
      this.el.bottom,
      `<button class="mapbtn" data-a="modes"><span>${MODES.find((m) => m.id === this.mode)!.icon}</span><span class="lbl">Carte<br><b>${MODES.find((m) => m.id === this.mode)!.name}</b></span></button>
      <span class="spacer"></span>
      <button class="fab" data-a="contracts"><span>📦</span><small>Économie</small>${s.offers.length ? `<span class="badge">${s.offers.length}</span>` : ''}</button>
      <button class="fab" data-a="objectives"><span>🎯</span><small>Objectifs</small></button>
      <button class="fab" data-a="log"><span>📰</span><small>Journal</small>${unread > 0 ? `<span class="badge">${Math.min(unread, 99)}</span>` : ''}</button>
      <button class="fab" data-a="menu"><span>☰</span><small>Menu</small></button>`,
    );
    this.root.style.setProperty('--hud-h', `${this.el.hud.offsetHeight}px`);
    patch(this.el.legend, this.legendHtml());
    this.el.legend.style.display = this.mode === 'political' ? 'none' : '';
  }

  private renderSheet(resetScroll = false) {
    const sheet = this.el.sheet;
    const s = this.s;
    if (!s || this.selected === null || this.picking) {
      sheet.classList.remove('open');
      return;
    }
    if (!resetScroll && sheet.contains(document.activeElement) && ['SELECT', 'INPUT'].includes(document.activeElement!.tagName)) return;
    const pid = this.selected;
    const info = this.world.provinces[pid];
    const owner = s.provinces[pid].owner;
    const n = s.nations[owner];
    const mine = owner === s.player;
    const country = this.view === 'country';
    const tabs = !country
      ? []
      : mine
        ? [['provs', '🏙️<span>Provinces</span>'], ['trade', '💰<span>Commerce</span>'], ['faith', '🕊️<span>Religion</span>'], ['army', '⚔️<span>Armée</span>'], ['diplo', '🤝<span>Diplo.</span>']]
        : [['nation', `${flagOf(n.id)}<span>${esc(n.name.length > 12 ? 'Nation' : n.name)}</span>`], ['provs', '🏙️<span>Provinces</span>']];
    if (!country) this.tab = 'prov';
    else if (!tabs.some(([k]) => k === this.tab)) this.tab = tabs[0][0];
    const content =
      this.tab === 'prov' ? this.provinceTab(pid)
      : this.tab === 'provs' ? this.provincesTab(owner)
      : this.tab === 'trade' ? this.tradeTab()
      : this.tab === 'faith' ? this.faithTab()
      : this.tab === 'army' ? this.armyTab()
      : this.tab === 'diplo' ? this.ownDiplo()
      : this.nationTab(owner);
    const b0 = sheet.querySelector('.body');
    const scroll = b0 && !resetScroll ? b0.scrollTop : 0;
    if (!sheet.firstChild)
      sheet.innerHTML = `<div class="grab"></div><div class="head"><i class="dot" style="width:14px;height:14px;border-radius:50%"></i>
        <h2></h2><button class="close" data-a="close" aria-label="Fermer">✕</button></div><div class="body"></div>`;
    sheet.querySelector<HTMLElement>('.head .dot')!.style.background = n.color;
    // Onglets du pays : le titre est celui du pays, pas de la province sélectionnée
    patch(sheet.querySelector('h2')!, country ? `${flagOf(n.id)} ${esc(n.name)}` : `${esc(info.name)} <small class="muted">· ${flagOf(n.id)} ${esc(n.name)}</small>`);
    const b = sheet.querySelector<HTMLElement>('.body')!;
    patch(
      b,
      (country
        ? `<div class="tabs icon-tabs sheet-tabs">${tabs.map(([k, l]) => `<button class="${this.tab === k ? 'on' : ''}" data-a="tab" data-p="${k}">${l}</button>`).join('')}</div>`
        : `<button class="backbtn" data-a="country">‹ ${flagOf(n.id)} Menu ${mine ? 'de votre pays' : `du pays : ${esc(n.name)}`}</button>`) + content,
    );
    sheet.classList.add('open');
    b.scrollTop = scroll;
  }

  private action(a: string, title: string, cost: A.Cost | string, extra: { disabled?: string; danger?: boolean; wide?: boolean; p?: string } = {}) {
    const s = this.state;
    const costTxt = typeof cost === 'string' ? iconize(cost) : costLabel(cost);
    const affordable = typeof cost === 'string' || A.canPay(s, s.player, cost);
    const why = extra.disabled ?? (affordable ? '' : 'Ressources insuffisantes');
    return `<button class="act ${extra.danger ? 'danger' : ''} ${extra.wide ? 'wide' : ''}" data-a="${a}" ${extra.p ? `data-p="${esc(extra.p)}"` : ''} ${why ? 'disabled' : ''}>
      <span class="t">${title}</span><span class="c">${why || costTxt}</span></button>`;
  }

  // ——— Onglet province ———
  private provinceTab(pid: Pid): string {
    const s = this.state;
    const info = this.world.provinces[pid];
    const p = s.provinces[pid];
    const owner = s.nations[p.owner];
    const mine = p.owner === s.player;
    const good = GOODS[p.good ?? info.good];
    const price = s.prices[p.good ?? info.good] ?? 1;
    const r = RELIGIONS[p.religion];
    const u = unrestTarget(s, this.world, pid);
    const badges: string[] = [];
    if (p.core !== p.owner) badges.push(`<span class="badge-i war">Revendiqué par ${esc(nm(s, p.core))}</span>`);
    if (p.occupiedBy) badges.push(`<span class="badge-i war">Occupé par ${esc(nm(s, p.occupiedBy))}</span>`);
    if (p.revolt) badges.push(`<span class="badge-i war">🔥 Insurrection (${p.revolt} mois)</span>`);
    if (p.supportedBy) badges.push(`<span class="badge-i war">Insurgés armés par ${esc(nm(s, p.supportedBy))}</span>`);
    for (const h of info.holy ?? []) badges.push(`<span class="badge-i nuke">⭐ Lieu saint : ${esc(h.name)} (${h.religions.map((x) => RELIGIONS[x].icon).join('')})</span>`);
    if (info.capital && info.owner === p.owner) badges.push('<span class="badge-i ally">Capitale</span>');
    if (owner.missionary === pid) badges.push(`<span class="badge-i ally">Missionnaires ${num(owner.missionProgress)} %</span>`);
    let html = `<div class="badges">${badges.join('')}</div>${mine ? this.exploitation(pid) : ''}
      <div class="stats">
        ${stat('Développement', String(info.dev))}
        ${stat('Population', pop(info.pop))}
        ${mine ? '' : `${stat('Production', `${this.gi((p.good ?? info.good) as keyof typeof GOODS)} ${good.name} ${'★'.repeat(p.level ?? 0)}`)}
        ${stat('Quantité / mois', `${num(output(s, this.world, pid), 2)} ${esc(good.unit)}`)}
        ${stat('Valeur / mois', `${money(production(s, this.world, pid))} <small class="${cls(price - 1)}">${price >= 1 ? '+' : ''}${num((price - 1) * 100)} %</small>`)}`}
        ${stat('Religion', `<span style="color:${r.color}">${r.icon} ${r.name}</span>`)}
        ${stat('Nœud commercial', esc(NODES.get(info.node)!.name))}
        ${stat('Agitation', `<span class="${p.unrest > 50 ? 'neg' : ''}">${num(p.unrest)} → ${num(u.total)}</span>`)}
        ${p.integration < 100 ? stat('Intégration', `${num(p.integration)} %`) : ''}
      </div>`;
    if (info.strait) {
      const def = STRAITS.find((x) => x.id === info.strait)!;
      const closed = straitClosed(s, this.world, info.strait);
      const tolls = this.trade().nodes[def.from]?.tolls[p.owner] ?? 0;
      html += `<h3>⚓ ${esc(def.name)}</h3><p class="muted">Détroit stratégique : ${closed ? '<b class="neg">FERMÉ</b> — le commerce en aval s’effondre et les prix montent.' : `ouvert, péage de ${TOLL * 100} % : ${money(tolls)} / mois pour ${esc(owner.name)}.`}</p>`;
      if (mine) html += `<div class="actions">${this.action('strait', closed ? 'Rouvrir le détroit' : 'Fermer le détroit', closed ? 'Tension −5' : A.COSTS.closeStrait(), { danger: !closed, wide: true })}</div>`;
    }
    if (mine) {
      html += `<h3>Agitation</h3><div class="rows">${u.parts.map((x) => `<div class="row"><span>${esc(x.label)}</span><span class="${cls(-x.value)}">${signed(x.value)}</span></div>`).join('')}</div>`;
      html += `<div class="actions" style="margin-top:8px">
        ${p.religion !== owner.religion ? this.action('missionary', `Missionnaires ${RELIGIONS[owner.religion].icon}`, A.COSTS.missionary(), { disabled: owner.missionary === pid ? `En cours (${num(owner.missionProgress)} %)` : p.revolt ? 'Insurrection' : undefined }) : ''}
        ${p.integration < 100 ? this.action('integrate', 'Intégrer', A.COSTS.integrate(), { disabled: p.occupiedBy || p.revolt ? 'Instable' : undefined }) : ''}
      </div>`;
      if (p.religion !== owner.religion && owner.missionary !== pid)
        html += `<p class="muted" style="font-size:12px">Conversion estimée : ~${Math.ceil(100 / missionSpeed(s, this.world, s.player, pid))} mois (politique : ${POLICIES[owner.policy].name}).</p>`;
    } else {
      const me = this.me;
      const minority = p.religion !== owner.religion || p.core !== p.owner;
      html += `<h3>Actions</h3><div class="actions">
        ${this.action('support', 'Armer les insurgés', A.COSTS.support(), { disabled: !minority ? 'Aucune minorité' : sameBloc(s, me.id, owner.id) ? 'Allié' : p.supportedBy ? 'Déjà soutenus' : !inReach(s, this.world, me.id, owner.id) ? 'Hors de portée' : undefined })}
        <button class="act" data-a="tab" data-p="nation"><span class="t">Diplomatie avec ${esc(owner.name)}</span><span class="c">🌍 ${signed(rel(s, me.id, owner.id))}</span></button>
      </div>`;
    }
    return html;
  }

  /** Carte de production d'une province du joueur : ce qu'elle produit et comment le changer. */
  private exploitation(pid: Pid): string {
    const s = this.state;
    const w = this.world;
    const p = s.provinces[pid];
    const info = w.provinces[pid];
    const current = (p.good ?? info.good) as keyof typeof GOODS;
    const g = GOODS[current];
    const lvl = p.level ?? 0;
    const units = output(s, w, pid);
    const value = production(s, w, pid);
    const stars = `${'★'.repeat(lvl)}${'☆'.repeat(E.MAX_LEVEL - lvl)}`;
    let html = `<div class="prod-card"><div class="prod-head">${this.gi(current, true)}<div><small class="muted">Cette province produit</small><br><b>${g.name}</b> <span class="stars" title="Niveau ${lvl}/${E.MAX_LEVEL}">${stars}</span></div>
      <div class="prod-val"><b class="pos">+${money(value)}</b><small>/mois · ${num(units, 2)} ${esc(g.unit)}</small></div></div>`;
    if (p.works) {
      const what = p.works.kind === 'upgrade' ? `Modernisation vers le niveau ${lvl + 1}` : p.works.kind === 'convert' ? `Reconversion vers ${GOODS[p.works.good!].icon} ${GOODS[p.works.good!].name}` : 'Forage de prospection ⛏️';
      return html + `<div class="verdict">🏗️ ${what} : encore <b>${p.works.months} mois</b>.</div></div>`;
    }
    const up = E.upgradeCost(s, w, pid);
    const gain = E.upgradeGain(s, w, pid);
    const conv = E.convertCost(s, w, pid);
    const targets = E.CONVERSIONS.filter((c) => c.good !== current);
    const deposit = ['petrole', 'gaz', 'metaux', 'terres_rares'].includes(current);
    const cant = p.occupiedBy || p.revolt ? 'Province instable' : undefined;
    const base = info.dev * 0.05; // unités au niveau 0 (une reconversion remet le niveau à zéro)
    html += `<div class="actions">
        ${this.action('upgrade', `⬆️ Moderniser (niveau ${Math.min(lvl + 1, E.MAX_LEVEL)})`, `+${money(gain)}/mois · 💰${money(up)} · ${E.UPGRADE_MONTHS} mois`, { disabled: cant ?? (lvl >= E.MAX_LEVEL ? 'Niveau maximal' : this.me.treasury < up ? `Trésor insuffisant (${money(up)})` : undefined) })}
        ${deposit ? '' : this.action('prospect', '⛏️ Prospecter', `1 chance sur 3 : pétrole, gaz, métaux… · 💰${money(E.prospectCost(s, w, pid))} · ${E.PROSPECT_MONTHS} mois`, { disabled: cant ?? (this.me.treasury < E.prospectCost(s, w, pid) ? 'Trésor insuffisant' : undefined) })}
      </div>
      <h3>🔄 Changer de production</h3>
      <p class="hint">Reconversion : 💰${money(conv)}, ${E.CONVERT_MONTHS} mois de travaux (production divisée par deux pendant le chantier), puis niveau remis à zéro. Valeur estimée au cours du jour :</p>
      <div class="conv-list">${targets.map((c) => {
        const locked = info.dev < c.minDev;
        const ok = !locked && !cant && this.me.treasury >= conv;
        const v = base * unitPriceOf(s, c.good);
        const delta = v - value;
        return `<button class="conv" data-a="convert" data-p="${c.good}" ${ok ? '' : 'disabled'}><span class="ic">${GOODS[c.good].icon}</span><span class="nm">${GOODS[c.good].name}${locked ? `<small>🔒 dév. ${c.minDev} requis</small>` : ''}</span><span class="vl">${money(v)}<small>/mois</small><b class="${cls(delta)}">${delta >= 0 ? '+' : '−'}${money(Math.abs(delta))}</b></span></button>`;
      }).join('')}</div></div>`;
    return html;
  }

  // ——— Onglet provinces (menu du pays) ———
  private provincesTab(id: Id = this.state.player): string {
    const s = this.state;
    const w = this.world;
    const me = s.nations[id];
    const mine = id === s.player;
    const rows = owned(s, me.id).map((pid) => {
      const p = s.provinces[pid];
      const good = (p.good ?? w.provinces[pid].good) as keyof typeof GOODS;
      return { pid, p, info: w.provinces[pid], good, units: output(s, w, pid), value: production(s, w, pid) };
    });
    const total = rows.reduce((a, r) => a + r.value, 0);
    const works = rows.filter((r) => r.p.works).length;
    const sortBy = this.provSort;
    if (sortBy === 'good') rows.sort((a, b) => a.good.localeCompare(b.good) || b.value - a.value);
    else if (sortBy === 'name') rows.sort((a, b) => a.info.name.localeCompare(b.info.name, 'fr'));
    else rows.sort((a, b) => b.value - a.value);
    const line = (r: (typeof rows)[number]) => {
      const lvl = r.p.level ?? 0;
      const tags = [
        `dév. ${r.info.dev}`,
        `<span class="stars">${'★'.repeat(lvl)}${'☆'.repeat(E.MAX_LEVEL - lvl)}</span>`,
        r.p.works ? `🏗️ ${r.p.works.months} m` : '',
        r.info.capital ? '🏛️' : '',
        r.p.religion !== me.religion ? RELIGIONS[r.p.religion].icon : '',
        r.p.revolt ? '<span class="neg">🔥 révolte</span>' : r.p.unrest > 50 ? '<span class="neg">😠</span>' : '',
        r.p.occupiedBy ? '<span class="neg">occupée</span>' : '',
      ].filter(Boolean).join(' · ');
      return `<div class="prow" data-a="goto" data-p="${r.pid}"><span class="pg">${this.gi(r.good)}</span><span class="pn">${esc(r.info.name)}<small>${tags}</small></span><span class="pv"><b class="pos">+${money(r.value)}</b><small>${num(r.units, 2)} ${esc(GOODS[r.good].unit)}</small></span></div>`;
    };
    let list = '';
    if (sortBy === 'good') {
      const groups = new Map<string, typeof rows>();
      for (const r of rows) groups.set(r.good, [...(groups.get(r.good) ?? []), r]);
      list = [...groups.entries()]
        .sort((a, b) => b[1].reduce((x, r) => x + r.value, 0) - a[1].reduce((x, r) => x + r.value, 0))
        .map(([g, rs]) => `<div class="pgroup">${this.gi(g as keyof typeof GOODS)} <b>${GOODS[g as keyof typeof GOODS].name}</b> <small>${rs.length} province(s) · <b class="pos">+${money(rs.reduce((x, r) => x + r.value, 0))}</b>/mois</small></div>${rs.map(line).join('')}`)
        .join('');
    } else list = rows.map(line).join('');
    return `<div class="stats three">${stat('Provinces', String(rows.length))}${stat('Production', `<span class="pos">+${money(total)}</span><small>/mois</small>`)}${stat('Chantiers', String(works))}</div>
      <p class="hint">${mine ? 'Touchez une province pour la <b>moderniser</b> ou <b>changer sa production</b>. ★ = niveau de modernisation.' : 'Les provinces de ce pays et ce qu’elles produisent. Touchez-en une pour voir sa fiche.'}</p>
      <div class="seg sortseg">${[['value', 'Rendement'], ['good', 'Marchandise'], ['name', 'Nom']].map(([k, l]) => `<button class="${sortBy === k ? 'on' : ''}" data-a="provSort" data-p="${k}">${l}</button>`).join('')}</div>
      <div class="plist">${list}</div>`;
  }

  // ——— Onglet commerce ———
  private tradeTab(): string {
    const s = this.state;
    const me = this.me;
    const inc = me.income;
    const net = inc.production + inc.trade + inc.tolls + (inc.contracts ?? 0) - inc.upkeep - (inc.admin ?? 0) - (this.state.needs ? this.state.needs.cost + this.state.needs.purchases : 0);
    const report = this.trade();
    const home = homeNode(s, this.world, me.id);
    const nodeName = (id: string) => NODES.get(id)!.name;
    const nodes = Object.entries(inc.byNode).sort((a, b) => b[1] - a[1]);
    const presence = TRADE_NODES.filter((n) => (report.nodes[n.id]?.power[me.id] ?? 0) > 0)
      .sort((a, b) => report.nodes[b.id].value * ((report.nodes[b.id].power[me.id] ?? 0) / (report.nodes[b.id].total || 1)) - report.nodes[a.id].value * ((report.nodes[a.id].power[me.id] ?? 0) / (report.nodes[a.id].total || 1)))
      .map((n) => {
      const r = report.nodes[n.id];
      const share = (r.power[me.id] ?? 0) / (r.total || 1);
      return `<div class="row"><span><button class="step" data-a="gotoNode" data-p="${n.id}">${esc(n.name)}</button>${n.id === home ? ' 🏠' : ''}${me.merchants.some((m) => m.node === n.id) ? ' 🧑‍💼' : ''}</span><span>${money(r.value)} · <b class="c-gold">${num(share * 100)} %</b></span></div>`;
    });
    return `<div class="stats">
        ${stat('Contrats', `<span class="pos">${money(inc.contracts ?? 0)}</span>`)}${stat('Production', money(inc.production))}${stat('Commerce (zones)', money(inc.trade))}${stat('Péages', money(inc.tolls))}
        ${stat('Entretien forces', `<span class="neg">−${money(inc.upkeep)}</span>`)}${stat('Solde / mois', `<span class="${cls(net)}">${money(net)}</span>`)}${stat('Zone d’attache', `🏠 ${esc(home ? nodeName(home) : '—')}`)}
      </div>
      <div class="actions"><button class="act wide" data-a="contracts" data-p="${s.offers.length ? 'offers' : 'active'}"><span class="t">📦 Économie : ressources, ${s.offers.length} offre(s), ${s.contracts.length} contrat(s)</span><span class="c">Production par marchandise, contrats, itinéraires, escortes</span></button></div>
      <h3>Revenus du commerce par zone</h3>
      <p class="hint">La richesse des marchandises circule de zone en zone (voir la carte ⚓ Commerce). Vous touchez une part de chaque zone où vous avez des ports, une flotte ou vos marchands, surtout dans votre zone d’attache 🏠 ${esc(home ? nodeName(home) : '—')}. Vos ${me.merchants.length} marchands 🧑‍💼 travaillent seuls : ils attirent la richesse des zones voisines vers chez vous. Touchez une zone pour la voir sur la carte.</p><div class="rows">${nodes.map(([id, v]) => `<div class="row"><span><button class="step" data-a="gotoNode" data-p="${id}">${esc(nodeName(id))}</button></span><span class="pos">+${money(v)}</span></div>`).join('') || '<p class="muted">Aucun.</p>'}</div>
      <h3>Votre poids par zone (richesse de la zone · votre part)</h3><div class="rows">${presence.join('')}</div>
      <h3>Cours mondiaux</h3><div class="goods">${Object.entries(GOODS).map(([g, d]) => {
        const p = s.prices[g] ?? 1;
        return `<span class="chip">${this.gi(g as keyof typeof GOODS)} ${d.name} <b class="${cls(p - 1)}">${p >= 1 ? '+' : ''}${num((p - 1) * 100)} %</b></span>`;
      }).join('')}</div>`;
  }

  // ——— Onglet religion ———
  private faithTab(): string {
    const s = this.state;
    const me = this.me;
    const r = RELIGIONS[me.religion];
    const mine = owned(s, me.id);
    const minorities = mine.filter((pid) => s.provinces[pid].religion !== me.religion).sort((a, b) => s.provinces[b].unrest - s.provinces[a].unrest);
    const sites = holySitesOf(s, this.world, me.id);
    const lost = desecratedHolySites(s, this.world, me.religion);
    const policies = (Object.keys(POLICIES) as Policy[]).map(
      (k) => `<button class="${me.policy === k ? 'on' : ''}" data-a="policy" data-p="${k}" ${me.policyCooldown > 0 && me.policy !== k ? 'disabled' : ''}>${POLICIES[k].name}</button>`,
    ).join('');
    return `<div class="stats">
        ${stat('Religion d’État', `<span style="color:${r.color}">${r.icon} ${r.name}</span>`)}
        ${stat('Ferveur / mois', `+${num(fervorGain(s, this.world, me.id), 1)}`)}
        ${stat('Provinces fidèles', `${mine.length - minorities.length}/${mine.length}`)}
      </div>
      <h3>Politique religieuse</h3>
      <div class="seg wide">${policies}</div>
      <p class="muted" style="font-size:12px">${POLICIES[me.policy].desc}${me.policyCooldown > 0 ? ` Changement possible dans ${me.policyCooldown} mois.` : ''}</p>
      <h3>Missionnaires</h3>
      ${me.missionary !== null
        ? `<div class="rows"><div class="row" data-a="goto" data-p="${me.missionary}" style="cursor:pointer"><span>${esc(this.world.provinces[me.missionary].name)}</span><span>${num(me.missionProgress)} %</span></div></div>
           <div class="actions">${this.action('recall', 'Rappeler les missionnaires', 'Gratuit', { wide: true })}</div>`
        : '<p class="muted">Aucune mission. Touchez une province minoritaire pour y envoyer des missionnaires.</p>'}
      <h3>Minorités (${minorities.length})</h3>
      <div class="rows">${minorities.slice(0, 12).map((pid) => {
        const p = s.provinces[pid];
        return `<div class="row" data-a="goto" data-p="${pid}" style="cursor:pointer"><span>${RELIGIONS[p.religion].icon} ${esc(this.world.provinces[pid].name)}${p.revolt ? ' 🔥' : ''}</span><span class="${p.unrest > 50 ? 'neg' : ''}">agitation ${num(p.unrest)}</span></div>`;
      }).join('') || '<p class="muted">Aucune : votre peuple partage votre foi.</p>'}</div>
      <h3>Lieux saints</h3>
      <div class="rows">
        ${sites.map((x) => `<div class="row" data-a="goto" data-p="${x.pid}" style="cursor:pointer"><span>⭐ ${esc(x.name)}</span><span class="${x.ours ? 'pos' : 'muted'}">${x.ours ? '+3 ferveur/mois' : 'autre religion'}</span></div>`).join('')}
        ${lost.map((x) => `<div class="row" data-a="goto" data-p="${x.pid}" style="cursor:pointer"><span>⭐ ${esc(x.name)}</span><span class="neg">aux mains de ${esc(nm(s, x.owner))}</span></div>`).join('')}
        ${!sites.length && !lost.length ? '<p class="muted">Aucun lieu saint pour votre foi.</p>' : ''}
      </div>
      <h3>Actions</h3><div class="actions">
        ${this.action('unity', 'Appel à l’unité nationale', A.COSTS.unity(), { disabled: me.stability >= 95 ? 'Déjà maximale' : undefined })}
        ${this.action('appeal', 'Appel aux coreligionnaires', A.COSTS.appeal())}
      </div>
      <h3>Religions du monde</h3>${this.religionShares()}`;
  }

  private religionShares(): string {
    const s = this.state;
    const byRel = new Map<Religion, number>();
    s.provinces.forEach((p, i) => byRel.set(p.religion, (byRel.get(p.religion) ?? 0) + this.world.provinces[i].pop));
    const total = [...byRel.values()].reduce((a, b) => a + b, 0);
    return `<div class="rows">${[...byRel.entries()].sort((a, b) => b[1] - a[1]).map(([r, v]) => `<div class="row"><span style="color:${RELIGIONS[r].color}">${RELIGIONS[r].icon} ${RELIGIONS[r].name}</span><span>${num((v / total) * 100, 1)} %</span></div>`).join('')}</div>`;
  }

  // ——— Onglet armée ———
  private armyTab(): string {
    const s = this.state;
    const me = this.me;
    const wars = warsOf(s, me.id);
    return `<div class="stats">
        ${stat('Divisions', num(me.army, 1))}${stat('Flottes', num(me.navy, 1))}${stat('Puissance', `#${powerRank(s, me.id)}`)}
        ${stat('Entretien', money(me.income.upkeep))}${stat('Lassitude', `<span class="${me.exhaustion > 50 ? 'neg' : ''}">${num(me.exhaustion)} %</span>`)}${stat('Agressivité', `<span class="${me.aggression > 40 ? 'neg' : ''}">${num(me.aggression)}</span>`)}
      </div>
      <p class="muted" style="font-size:12px">L’armée prend les provinces ennemies une à une ; la flotte protège votre commerce (pouvoir commercial dans les nœuds côtiers) et permet les débarquements.</p>
      <div class="actions">
        ${this.action('recruit', 'Recruter des divisions', A.COSTS.recruit(s, me.id))}
        ${this.action('disband', 'Démobiliser', 'Réduit l’entretien', { disabled: me.army < 1 ? 'Aucune' : undefined })}
        ${this.action('fleet', 'Construire des flottes', A.COSTS.fleet(s, me.id))}
        ${this.action('disbandFleet', 'Désarmer des flottes', 'Réduit l’entretien', { disabled: me.navy < 1 ? 'Aucune' : undefined })}
        ${me.nuclear ? '' : this.action('nuke', 'Programme nucléaire', A.COSTS.nuke(s, me.id), { disabled: me.nukeProgram !== null ? `En cours (${me.nukeProgram} mois)` : undefined, danger: true, wide: true })}
      </div>
      <h3>Guerres (${wars.length})</h3>
      ${wars.length ? wars.map((w) => this.warLine(w)).join('') : '<p class="muted">Aucun conflit en cours.</p>'}
      ${me.claims.length || me.holyClaims.length || me.cbProgress ? `<h3>Casus belli</h3><div class="rows">
        ${me.claims.map((c) => `<div class="row"><span>${this.flag(c)} ${esc(nm(s, c))}</span><span class="pos">Prêt</span></div>`).join('')}
        ${me.holyClaims.map((c) => `<div class="row"><span>${this.flag(c)} ${esc(nm(s, c))}</span><span class="pos">Guerre sainte</span></div>`).join('')}
        ${me.cbProgress ? `<div class="row"><span>${esc(nm(s, me.cbProgress.target))}</span><span>${me.cbProgress.months} mois</span></div>` : ''}</div>` : ''}`;
  }

  private warLine(w: War): string {
    const s = this.state;
    const sc = scoreFor(w, s.player);
    return `<button class="act wide" style="width:100%;margin-bottom:6px" data-a="war" data-p="${w.id}">
      <span class="t">${esc(w.name)}</span>
      <span class="c">Score : <b class="${cls(sc)}">${signed(sc)}</b> · ${w.months} mois · ${isLeader(w, s.player) ? 'vous menez' : 'allié'}</span></button>`;
  }

  // ——— Diplomatie (soi) ———
  /** Organisations internationales (OPEP) : membres, quotas, adhésion. */
  private orgsHtml(): string {
    const s = this.state;
    const o = s.orgs?.opep;
    if (!o) return '';
    const member = o.members.includes(s.player);
    const t = o.nextMeeting;
    const why = member ? null : O.canJoin(s, this.world, s.player);
    return `<h3>Organisations</h3><div class="card org"><div class="mh"><b>${o.icon} ${o.name}</b><small>${member ? '<b class="c-gold">vous êtes membre</b>' : `${o.members.length} membres`}</small></div>
      <div class="org-flags">${o.members.map((m) => this.flag(m)).join('')}</div>
      <div class="stats three">${stat('Quota pétrole', `<span class="${o.quota < 1 ? 'neg' : o.quota > 1 ? 'pos' : ''}">${Math.round(o.quota * 100)} %</span>`)}${stat('Cours du baril', `<span class="c-blue">${money(unitPriceOf(s, 'petrole'))}</span>`)}${stat('Prochaine réunion', `${MONTHS[t % 12]} ${Math.floor(t / 12)}`)}</div>
      <p class="hint">Tous les six mois, les membres votent leurs quotas de production (poids selon le pétrole produit). Réduire fait monter le cours mondial — tous les producteurs en profitent — mais les membres vendent moins de barils. Dernière décision : ${esc(o.last)}.</p>
      <div class="actions">${member ? this.action('opecLeave', 'Quitter l’OPEP', 'Plus de quota · 🌍 −15 avec les membres', { danger: true, wide: true }) : this.action('opecJoin', 'Adhérer à l’OPEP', `🤝${O.JOIN_COST} · voter les quotas · 🌍 +10 avec les membres`, { wide: true, disabled: why ?? undefined })}</div></div>`;
  }

  private ownDiplo(): string {
    const s = this.state;
    const me = this.me;
    const bloc = me.bloc ? s.blocs[me.bloc] : null;
    const rels = alive(s).filter((o) => o.id !== me.id).map((o) => ({ o, r: rel(s, me.id, o.id) }));
    const line = (x: { o: { id: Id; name: string }; r: number }) =>
      `<div class="row" data-a="gotoNation" data-p="${esc(x.o.id)}" style="cursor:pointer"><span>${flagOf(x.o.id)} ${esc(x.o.name)} ${RELIGIONS[s.nations[x.o.id].religion].icon}</span><span class="${cls(x.r)}">${signed(x.r)}</span></div>`;
    const emb = s.embargoes.filter((k) => k.endsWith(`>${me.id}`)).map((k) => nm(s, k.split('>')[0]));
    return `<h3>Bloc</h3>
      ${bloc ? `<div class="rows"><div class="row"><span>${esc(bloc.name)} · meneur : ${esc(nm(s, bloc.leader))}</span><span>${bloc.members.length} membres</span></div></div>
        <div class="actions" style="margin-top:6px">${this.action('quitBloc', 'Quitter le bloc', 'Stabilité −5', { danger: true, wide: true })}</div>`
        : '<p class="muted">Non-aligné. Touchez un pays pour proposer une alliance ou rejoindre son bloc.</p>'}
      <h3>Échanges</h3><div class="rows">
        <div class="row"><span>Accords commerciaux</span><span>${s.trades.filter((k) => k.split('|').includes(me.id)).length}</span></div>
        <div class="row" data-a="explain" data-p="sanctions" style="cursor:pointer"><span>Embargos subis</span><span class="${emb.length ? 'neg' : ''}">${emb.length ? `${s.embargoes.filter((k) => k.endsWith(`>${me.id}`)).map((k) => flagOf(k.split('>')[0])).join(' ')} · −${Math.round((me.sanctions?.p ?? 0) * 100)} % ›` : 'aucun'}</span></div></div>
      ${this.orgsHtml()}
      <h3>Meilleures relations</h3><div class="rows">${rels.slice().sort((a, b) => b.r - a.r).slice(0, 6).map(line).join('')}</div>
      <h3>Pires relations</h3><div class="rows">${rels.slice().sort((a, b) => a.r - b.r).slice(0, 6).map(line).join('')}</div>`;
  }

  // ——— Nation étrangère ———
  private nationTab(id: Id): string {
    const s = this.state;
    const me = this.me;
    const n = s.nations[id];
    const r = rel(s, me.id, id);
    const war = warBetween(s, me.id, id);
    const trade = hasTrade(s, me.id, id);
    const emb = embargoes(s, me.id, id);
    const allied = sameBloc(s, me.id, id);
    const warChk = canDeclareWar(s, this.world, me.id, id);
    const holy = A.holyWarReasons(s, this.world, me.id, id);
    const inc = n.income;
    const blocInvite = me.bloc && s.blocs[me.bloc].leader !== me.id ? 'Seul le meneur peut inviter' : n.bloc ? 'Déjà dans un bloc' : undefined;
    const badges: string[] = [];
    if (n.bloc) badges.push(`<span class="badge-i ally">🛡️ ${esc(s.blocs[n.bloc].name)}</span>`);
    if (n.nuclear) badges.push('<span class="badge-i nuke">☢ Nucléaire</span>');
    if (O.isMember(s, 'opep', id)) badges.push('<span class="badge-i ally">🛢️ OPEP</span>');
    if (n.sanctions) badges.push(`<span class="badge-i war">🚫 Sanctionné −${Math.round(n.sanctions.p * 100)} %</span>`);
    if (trade) badges.push('<span class="badge-i ally">Accord commercial</span>');
    if (emb) badges.push('<span class="badge-i war">Sous votre embargo</span>');
    if (embargoes(s, id, me.id)) badges.push('<span class="badge-i war">Vous impose un embargo</span>');
    for (const w of warsOf(s, id)) badges.push(`<span class="badge-i war">⚔️ ${esc(w.name)}</span>`);
    return `<div class="badges">${badges.join('')}</div>
      <div class="row" style="border:0"><span>🌍 Relations avec vous</span><b class="${cls(r)}">${signed(r)}</b></div>
      <div class="relbar"><i style="left:${(r + 100) / 2}%"></i></div>
      <div class="stats">
        ${stat('Religion', `${RELIGIONS[n.religion].icon} ${RELIGIONS[n.religion].name}`)}${stat('Politique', POLICIES[n.policy].name)}
        ${stat('Provinces', `${owned(s, id).length} · dév. ${devOf(s, id)}`)}${stat('Revenus / mois', money(inc.production + inc.trade + inc.tolls))}
        ${stat('Armée', `${num(n.army, 1)} div. · #${powerRank(s, id)}`)}${stat('Flotte', num(n.navy, 1))}
      </div>
      ${war ? `<h3>Guerre</h3>${this.warLine(war)}` : ''}
      <h3>Diplomatie</h3><div class="actions">
        ${this.action('improve', 'Améliorer les relations', A.COSTS.improve(), { disabled: war ? 'En guerre' : r >= 100 ? 'Maximum' : undefined })}
        ${trade ? this.action('untrade', 'Rompre l’accord', 'Relations −15') : this.action('trade', 'Accord commercial', A.COSTS.trade(), { disabled: war ? 'En guerre' : emb || embargoes(s, id, me.id) ? 'Embargo' : undefined })}
        ${emb ? this.action('embargo', 'Lever l’embargo', 'Relations +10') : this.action('embargo', 'Décréter un embargo', A.COSTS.embargo(), { disabled: allied ? 'Allié' : undefined })}
        ${this.action('aid', 'Aide financière', A.COSTS.aid(s, me.id), { disabled: war ? 'En guerre' : undefined })}
        <button class="act" data-a="buyFrom" data-p="${esc(id)}"><span class="t">📥 Acheter à ce pays</span><span class="c">contrat d’achat</span></button>
        ${allied ? '' : this.action('alliance', 'Proposer une alliance', A.COSTS.alliance(), { disabled: war ? 'En guerre' : blocInvite })}
        ${!allied && n.bloc && !me.bloc ? this.action('joinBloc', `Rejoindre ${esc(s.blocs[n.bloc].name)}`, A.COSTS.alliance()) : ''}
      </div>
      <h3>Guerre</h3><div class="actions">
        ${this.action('claim', 'Casus belli', A.COSTS.claim(), { disabled: me.claims.includes(id) ? 'Déjà obtenu' : me.cbProgress ? 'Un autre en cours' : !inReach(s, this.world, me.id, id) ? 'Hors de portée' : allied ? 'Allié' : undefined })}
        ${this.action('holyClaim', 'Guerre sainte', A.COSTS.holyClaim(), { disabled: me.holyClaims.includes(id) ? 'Déjà proclamée' : !holy.length ? 'Aucun motif religieux' : undefined })}
        ${war ? '' : `<button class="act danger wide" data-a="declare" data-p="${esc(id)}" ${warChk.ok ? '' : 'disabled'}>
          <span class="t">Déclarer la guerre</span><span class="c">${warChk.ok ? (me.holyClaims.includes(id) ? 'Guerre sainte justifiée' : me.claims.includes(id) ? 'Casus belli valide' : 'Sans casus belli : stabilité −15, agressivité +25') : warChk.reason}</span></button>`}
      </div>
      ${holy.length ? `<p class="muted" style="font-size:12px">Motifs religieux : ${holy.map(esc).join(', ')}.</p>` : ''}`;
  }

  private renderEvents() {
    const s = this.state;
    if (s.gameOver) {
      this.modal('Fin de partie', `<p>${esc(s.gameOver)}</p>`, [{ label: 'Retour au menu', a: 'quit', primary: true }]);
      localStorage.removeItem(SAVE_KEY);
      return;
    }
    if (s.campaignOver && s.endYear !== 9999 && this.el.overlay.style.display === 'none') {
      this.setSpeed(0);
      this.showEnd();
      return;
    }
    const e = s.events[0];
    if (!e || this.el.overlay.style.display !== 'none') return;
    this.modal(
      esc(e.title),
      `<div class="event-kind">${dateLabel(s)}</div><p>${esc(e.text)}</p>`,
      e.options.map((o, i) => ({ label: esc(o.label), hint: esc(o.hint), a: 'event', p: `${e.uid}:${i}`, primary: i === 0 })),
    );
  }

  // ————————————————————————————— Modales —————————————————————————————

  private modal(title: string, html: string, buttons: { label: string; hint?: string; a: string; p?: string; primary?: boolean; disabled?: boolean }[]) {
    const o = this.el.overlay;
    o.style.display = '';
    this.root.classList.add('modal-open');
    o.innerHTML = `<div class="modal" role="dialog"><header><h2>${title}</h2></header><div class="content">${html}</div>
      <footer>${buttons.map((b) => `<button class="btn ${b.primary ? 'primary' : ''}" data-a="${b.a}" ${b.p ? `data-p="${esc(b.p)}"` : ''} ${b.disabled ? 'disabled' : ''}>${b.label}${b.hint ? `<small>${iconize(b.hint)}</small>` : ''}</button>`).join('')}</footer></div>`;
    colorSigns(o);
  }

  private closeModal() {
    this.el.overlay.style.display = 'none';
    this.el.overlay.innerHTML = '';
    this.root.classList.remove('modal-open');
    if (this.selConvoy !== null && this.s) {
      this.selConvoy = null;
      this.map.render(this.s, this.mode, this.view === 'province' ? this.selected : null, null, this.view === 'country' && this.selected !== null ? this.s.provinces[this.selected].owner : null);
    }
    if (this.s && !this.picking) this.renderEvents();
  }

  private legendHtml(): string {
    const s = this.state;
    const sw = (c: string, l: string) => `<span class="sw"><i style="background:${c}"></i>${l}</span>`;
    switch (this.mode) {
      case 'religion': {
        const present = [...new Set(s.provinces.map((p) => p.religion))];
        return present.map((r) => sw(RELIGIONS[r].color, RELIGIONS[r].name.replace('Religions traditionnelles', 'Traditionnelles'))).join('');
      }
      case 'trade':
        return `${sw('var(--gold)', 'Vos exports')}${sw('#5ad17a', 'Vers vous')}${sw('#e6edf3', 'Étrangers')}${sw('#f85149', 'Ennemis')}<span class="sw">⚓ Détroit</span><span class="sw muted">Touchez un convoi</span>`;
      case 'diplomatic':
        return `${sw('#d4a017', 'Vous')}${sw('#2f6fdb', 'Votre bloc')}${sw('#3c8d4f', 'Ami')}${sw('#6b6f76', 'Neutre')}${sw('#8e2b2b', 'Hostile')}${sw('#c62828', 'En guerre')}`;
      case 'unrest':
        return `${sw('#2f4a3a', 'Calme')}${sw('#b8a642', 'Tendu')}${sw('#d9622b', 'Agité')}${sw('#ff3b30', 'Insurrection')}`;
      default:
        return '';
    }
  }

  private showModes() {
    this.modal(
      'Mode de carte',
      MODES.map((m) => `<button class="btn ${this.mode === m.id ? 'primary' : ''}" data-a="mode" data-p="${m.id}" style="width:100%;margin-bottom:6px">${m.icon} ${m.name}<small>${esc(m.legend)}</small></button>`).join(''),
      [{ label: 'Fermer', a: 'closeModal' }],
    );
  }

  /** Fiches explicatives des ressources du bandeau. */
  private explain(key: string) {
    const s = this.state;
    const me = this.me;
    const inc = me.income;
    const row = (l: string, v: number, unit = '') => `<div class="row"><span>${l}</span><span class="${cls(v)}">${v >= 0 ? '+' : '−'}${unit === 'Md$' ? money(Math.abs(v)) : num(Math.abs(v), 1)}</span></div>`;
    let title = '';
    let html = '';
    if (key === 'treasury') {
      const net = inc.production + inc.trade + inc.tolls + (inc.contracts ?? 0) - inc.upkeep - (inc.admin ?? 0) - (this.state.needs ? this.state.needs.cost + this.state.needs.purchases : 0);
      title = '💰 Trésor';
      html = `<p>L’argent de l’État : <b>${money(me.treasury)}</b>. S’il devient négatif, c’est la faillite : l’armée déserte et la stabilité chute.</p>
        <h3>Chaque mois</h3><div class="rows">
        ${row('Contrats commerciaux', inc.contracts ?? 0, 'Md$')}${row('Production vendue localement', inc.production, 'Md$')}${row('Commerce (nœuds)', inc.trade, 'Md$')}${row('Péages des détroits', inc.tolls, 'Md$')}${row('Entretien armée et flotte', -inc.upkeep, 'Md$')}${row('Contrats d’achat', -(s.needs?.purchases ?? 0), 'Md$')}${row('Besoins de la population (achats d’urgence, stockage)', -(s.needs?.cost ?? 0), 'Md$')}${row(`Fonctionnement de l’État (${TIERS[me.tier - 1].name.toLowerCase()})`, -(inc.admin ?? 0), 'Md$')}${inc.sanctions ? row('Pertes dues aux sanctions', -inc.sanctions, 'Md$') : ''}${inc.war ? row('Guerre : blocus et lassitude', -inc.war, 'Md$') : ''}
        <div class="row"><span><b>Solde</b></span><span class="${cls(net)}"><b>${net >= 0 ? '+' : ''}${money(net)}</b></span></div></div>
        <h3>À quoi il sert</h3><p class="muted">Moderniser, reconvertir ou prospecter vos provinces · recruter armée et flotte · acheter des droits de passage · aide aux pays amis.</p>
        <h3>Comment l’augmenter</h3><p class="muted">Signer des contrats (📦 Économie), moderniser les provinces qui produisent les marchandises chères, placer vos marchands, contrôler un détroit.</p>`;
    } else if (key === 'influence') {
      title = '🤝 Influence';
      html = `<p>Votre capital diplomatique : <b>${Math.floor(me.influence)}</b>, +${influenceGain(s, me.id)} par mois (3 de base, +1 si vous êtes parmi les 10 premiers commerçants, +1 si vous dirigez un bloc).</p>
        <h3>À quoi elle sert</h3><p class="muted">Améliorer les relations (25) · accords commerciaux (30) · embargos (15) · alliances (40) · casus belli (50) · négocier un contrat (10) · fermer un détroit (30) · intégrer une province conquise (30).</p>`;
    } else if (key === 'fervor') {
      title = '🔥 Ferveur';
      html = `<p>L’élan religieux de votre peuple : <b>${Math.floor(me.fervor)}</b>, +${num(fervorGain(s, this.world, me.id), 1)} par mois.</p>
        <div class="rows">${row('Base', 1)}${row('Lieux saints de votre foi (×3)', holySitesOf(s, this.world, me.id).filter((h) => h.ours).length * 3)}${row(`Politique : ${POLICIES[me.policy].name}`, POLICIES[me.policy].fervor)}</div>
        <h3>À quoi elle sert</h3><p class="muted">Missionnaires (30) · appel à l’unité nationale (+10 stabilité, 40) · appel aux coreligionnaires (50) · armer des insurgés à l’étranger (40) · guerre sainte (60).</p>`;
    } else if (key === 'stability') {
      title = '⚖️ Stabilité';
      html = `<p>La cohésion du pays : <b>${num(me.stability)}/100</b>. Elle revient doucement vers ${num(me.baseStability)} (son niveau naturel).</p>
        <h3>Ce qui la fait baisser</h3><p class="muted">Guerres sans casus belli, lassitude de guerre, insurrections, faillite, crises mal gérées, réformes brutales.</p>
        <h3>Ce qui la fait monter</h3><p class="muted">Appel à l’unité nationale (🔥40), victoires, concessions aux minorités, politique de tolérance.</p>
        <h3>Effets</h3><p class="muted">Sous 50, les minorités s’agitent davantage ; sous 35, l’armée perd en efficacité et les insurrections se multiplient.</p>`;
    } else if (key === 'sanctions') {
      const sp = me.sanctions;
      title = '🚫 Sanctions internationales';
      html = sp
        ? `<p>Des pays pesant lourd dans l’économie mondiale vous imposent un embargo, et leurs alliés suivent en partie. Pression actuelle : <b class="neg">${Math.round(sp.p * 100)} %</b> (plafond ${Math.round(MAX_PRESSURE * 100)} %).</p>
          <ul class="consequences"><li>Commerce (nœuds) −${Math.round(sp.p * 100)} %</li><li>Production vendue −${Math.round(sp.p * 60)} %, contrats −${Math.round(sp.p * 30)} %</li><li>Achats d’urgence et fournisseurs plus chers (<span class="neg">+${Math.round(sp.p * 100)} %</span> et <span class="neg">+${Math.round(sp.p * 50)} %</span>)</li><li>Stabilité −${num(sp.p * 0.8, 2)} par mois</li></ul>
          <p>Pertes ce mois : <b class="neg">−${money(inc.sanctions ?? 0)}</b>.</p>
          <h3>Qui vous sanctionne</h3><div class="rows">${sp.by.map((id) => `<div class="row"><span>${this.flag(id)} ${esc(nm(s, id))} <small class="muted">🌍 ${signed(Math.round(rel(s, me.id, id)))}</small></span><button class="chip" data-a="liftSanction" data-p="${esc(id)}" ${me.influence < LIFT_COST ? 'disabled' : ''}>Négocier 🤝${LIFT_COST} · ${Math.round(liftChance(s, me.id, id) * 100)} %</button></div>`).join('')}</div>
          <p class="hint">Les chances montent avec vos relations et baissent avec votre agressivité ; votre rival est le plus dur à convaincre. Améliorer d’abord les relations (fiche du pays) aide beaucoup.</p>`
        : '<p>Aucune sanction ne vous vise. Attention : une guerre sans motif, une interception de convoi ou une agressivité élevée poussent les grandes puissances à vous sanctionner.</p>';
    } else {
      title = '☢️ Tension mondiale';
      html = `<p>Le niveau de danger du monde : <b>${num(s.tension)} %</b>. Elle monte avec les guerres, les détroits fermés et surtout les affrontements entre puissances nucléaires.</p><p class="muted">Au-delà de 95 %, si deux puissances nucléaires sont en guerre, l’escalade peut mettre fin à la partie pour tout le monde.</p>`;
    }
    this.modal(title, html, [{ label: 'Compris', a: 'closeModal', primary: true }]);
  }

  private showIntro() {
    const s = this.state;
    const c = CAMPAIGNS[s.player];
    this.modal(
      `${esc(this.me.name)} · 2026-${s.endYear}`,
      `<p>${esc(c?.intro ?? 'Vingt ans pour faire de votre nation une puissance commerciale et spirituelle.')}</p>
      ${s.rival ? `<p>🗡️ <b>Votre rival : ${esc(nm(s, s.rival))}</b>. Il cherchera à vous nuire : insurgés, embargos, sabotage de vos contrats, ultimatums.</p>` : ''}
      <p>🎯 <b>${s.missions.length} missions</b> vous rapportent des points. Le bilan final tombe en janvier ${s.endYear}.</p>
      <p>📦 Des acheteurs vous proposeront des <b>contrats</b> : c'est votre principale source de richesse. Choisissez bien vos itinéraires : détroits, pirates et blocus guettent vos convois.</p>`,
      [
        { label: 'Voir mes objectifs', a: 'objectives', primary: true },
        { label: 'Commencer', a: 'closeModal' },
      ],
    );
  }

  private showObjectives() {
    const s = this.state;
    const sc = scoreBreakdown(s, this.world);
    const left = s.endYear - s.year;
    const rows = s.missions
      .map((mi) => {
        const pr = progress(s, this.world, mi);
        const rw = [`+${mi.reward.score} pts`, mi.reward.influence ? `🤝${mi.reward.influence}` : '', mi.reward.fervor ? `🔥${mi.reward.fervor}` : '', mi.reward.money ? `💰${mi.reward.money}` : ''].filter(Boolean).join(' ');
        return `<div class="mission ${mi.done ? 'done' : ''}"><div class="mh"><b>${mi.done ? '✅' : '🎯'} ${esc(mi.title)}</b><small>${rw}</small></div>
          <small class="muted">${esc(mi.desc)}</small>
          ${mi.done ? `<small class="pos">Accomplie (${mi.doneAt})</small>` : `<div class="pbar"><i style="width:${Math.round(pr.ratio * 100)}%"></i></div><small class="c-gold">${esc(pr.label)}</small>`}</div>`;
      })
      .join('');
    this.modal(
      'Objectifs',
      `<div class="stats">${stat('Score actuel', `${sc.total} <small>(${sc.grade})</small>`)}${stat('Fin de campagne', s.endYear === 9999 ? 'Bac à sable' : `${left} an(s)`)}${stat('Missions', `${s.missions.filter((m) => m.done).length}/${s.missions.length}`)}</div>
      ${s.rival ? `<p>🗡️ Rival : <b>${esc(nm(s, s.rival))}</b> — hostilité <b class="neg">${Math.round(s.rivalHostility)} %</b></p>` : ''}
      <div class="missions">${rows}</div>
      <h3>Détail du score</h3><div class="rows">${sc.lines.map((l) => `<div class="row"><span>${esc(l.label)}</span><span class="${cls(l.value)}">${signed(l.value)}</span></div>`).join('')}</div>`,
      [{ label: 'Fermer', a: 'closeModal', primary: true }],
    );
  }

  private showEnd() {
    const s = this.state;
    const sc = scoreBreakdown(s, this.world);
    this.modal(
      `Bilan ${s.endYear} · note ${sc.grade}`,
      `<p class="grade grade-${sc.grade}">${sc.grade}</p><p style="text-align:center"><b>${sc.total} points</b> · ${s.missions.filter((m) => m.done).length}/${s.missions.length} missions</p>
      <div class="rows">${sc.lines.map((l) => `<div class="row"><span>${esc(l.label)}</span><span class="${cls(l.value)}">${signed(l.value)}</span></div>`).join('')}</div>
      <p class="muted" style="font-size:12px">S ≥ 320 · A ≥ 240 · B ≥ 170 · C ≥ 100</p>`,
      [
        { label: 'Continuer en bac à sable', a: 'sandbox', primary: true },
        { label: 'Nouvelle partie', a: 'quit' },
      ],
    );
    localStorage.removeItem(SAVE_KEY);
  }

  private routeLabel(r: import('../game/types').Route): string {
    const straits = r.straits.map((x) => `⚓${esc(C.straitName(x))}`).join(' ');
    const pir = r.piracy.length ? ` · 🏴‍☠️${r.piracy.length}` : '';
    const blocked = C.blockedStraits(this.state, this.world, r);
    if (r.nodes.length <= 1) return 'livraison sur place';
    return `${r.nodes.length - 1} étape(s)${straits ? ' · ' + straits : ''}${pir}${blocked.length ? ' · <b class="neg">bloqué</b>' : ''}`;
  }

  /** Emoji d'une marchandise : le toucher ouvre son cours mondial. */
  private gi(g: keyof typeof GOODS, big = false): string {
    return `<span class="gicon ${big ? 'big' : ''}" role="button" data-a="market" data-p="${g}" title="Cours : ${esc(GOODS[g].name)}">${GOODS[g].icon}</span>`;
  }

  /** Étapes d'un itinéraire : chaque nœud et chaque détroit se touche pour y centrer la carte. */
  private routeSteps(r: import('../game/types').Route): string {
    const nodes = r.nodes.map((n) => `<button class="step" data-a="gotoNode" data-p="${n}">${esc(C.nodeName(n))}</button>`).join('<span class="sep">›</span>');
    const straits = r.straits.map((x) => `<button class="step strait" data-a="gotoStrait" data-p="${x}">⚓ ${esc(C.straitName(x))}</button>`).join('');
    return `<div class="steps">${nodes}</div>${straits ? `<div class="steps">${straits}</div>` : ''}`;
  }

  /** Jauge de capacité : engagé (plein), ajout proposé (hachuré), libre. */
  private gauge(cap: number, used: number, extra = 0): string {
    const pct = (v: number) => Math.max(0, Math.min(100, (v / Math.max(cap, 1e-6)) * 100));
    const over = used + extra > cap * 1.02;
    return `<div class="gauge ${over ? 'over' : ''}"><i class="used" style="width:${pct(used)}%"></i><i class="add" style="left:${pct(used)}%;width:${pct(Math.min(extra, Math.max(0, cap - used)))}%"></i></div>`;
  }

  private showContracts(tab: string) {
    this.contractsTab = tab;
    const s = this.state;
    const cap = C.capacity(s, this.world, s.player);
    const com = C.committed(s);
    const sup = C.supply(s, this.world);
    const qty = (v: number) => num(v, v < 10 ? 2 : 1);
    const tabDefs: [string, string][] = [
      ['resources', '📦<span>Ressources</span>'],
      ['markets', '📈<span>Cours</span>'],
      ['offers', `✉️<span>Offres${s.offers.length ? ` <i class="count">${s.offers.length}</i>` : ''}</span>`],
      ['active', `🚢<span>Contrats${s.contracts.length + s.purchases.length ? ` <i class="count dim">${s.contracts.length + s.purchases.length}</i>` : ''}</span>`],
    ];
    let html = `<div class="tabs icon-tabs">${tabDefs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="contracts" data-p="${k}">${l}</button>`).join('')}</div>`;
    const trendOf = (g: keyof typeof GOODS, months: number) => {
      const h = s.priceHistory[g] ?? [];
      const past = h[Math.max(0, h.length - 1 - months)] ?? s.prices[g] ?? 1;
      return ((s.prices[g] ?? 1) / past - 1) * 100;
    };
    if (tab === 'resources') {
      const bought = P.purchased(s);
      const storedAll = C.storedUnits(s, this.world);
      // Seules les marchandises produites ici : les achats et stocks sans production figurent dans « Besoins et stocks »
      const goods = (Object.keys(cap) as (keyof typeof GOODS)[]).filter((g) => (cap[g] ?? 0) > 1e-6);
      const worth = (g: keyof typeof GOODS) => ((cap[g] ?? 0) + (bought[g] ?? 0) + (s.stock[g] ?? 0)) * unitPriceOf(s, g);
      goods.sort((a, b) => worth(b) - worth(a));
      html += this.needsHtml();
      html += `<h3>🏭 Production</h3><p class="hint">Ce que vos provinces produisent chaque mois. La part <b class="gold">sous contrat</b> est vendue à prix garanti ; le <b>disponible</b> part sur le marché et peut être proposé aux acheteurs. Le <b>surplus</b> (ni vendu sous contrat, ni consommé par la population) part au marché, ou en stock si vous le choisissez : de quoi spéculer ou constituer des réserves, mais chaque mois de stock coûte 1 % de sa valeur (2 % au-delà de 6 mois). Touchez une province pour la moderniser. Ce que vous achetez sans le produire apparaît plus haut dans « Besoins et stocks » ; les acheteurs étrangers peuvent quand même vous le demander.</p>`;
      html += goods.map((g) => {
        const d = GOODS[g];
        const own = cap[g] ?? 0;
        const storedNow = storedAll[g] ?? 0;
        const buy = bought[g] ?? 0;
        const st = s.stock[g] ?? 0;
        const c = own + buy;
        const used = com[g] ?? 0;
        const tr = trendOf(g, 1);
        const prov = E.producers(s, this.world, s.player, g);
        const selling = !s.notForSale.includes(g);
        return `<div class="card"><div class="mh"><b>${this.gi(g)} ${d.name}</b><small class="${cls(tr)}">${tr > 0.5 ? '▲' : tr < -0.5 ? '▼' : '▬'} ${money(unitPriceOf(s, g))}/${esc(d.unit)}</small></div>
          ${c > 0 ? `<div class="stats four">${stat('Production', `${qty(own)}<small>/mois</small>`)}${stat('Achats', `${qty(buy)}<small>/mois</small>`)}${stat('Vendu', `<span class="c-gold">${qty(used)}</span><small>/mois</small>`)}${stat('Libre', `<span class="${c - used < 0 ? 'neg' : 'pos'}">${qty(c - used)}</span><small>/mois</small>`)}</div>
          ${this.gauge(c, used)}` : ''}
          <div class="stock-line"><span>🏬 Stock : <b>${qty(st)}</b> ${esc(d.unit)}${st > 1e-3 ? ` <small class="muted">≈ ${money(st * unitPriceOf(s, g))}</small>` : ''}</span>
            ${st > 1e-3 ? `<span class="seg"><button data-a="spotSell" data-p="${g}:0.5">Vendre ½</button><button data-a="spotSell" data-p="${g}:1">Vendre tout</button></span>` : ''}</div>
          ${st > 1e-3 && (s.needs?.lines[g]?.need ?? 0) > 0 ? `<small class="muted">Votre population en puise ${qty(Math.max(0, (s.needs!.lines[g]!.need) - Math.max(0, own - used)))} ${esc(d.unit)}/mois si la production ne suffit pas.</small>` : ''}
          <div class="prov-list">${prov.slice(0, 8).map((pid) => {
            const p = s.provinces[pid];
            const works = p.works ? ` 🏗️${p.works.months}m` : '';
            return `<button class="chip" data-a="goto" data-p="${pid}">${esc(this.world.provinces[pid].name)} ${'★'.repeat(p.level ?? 0)}${works} · ${qty(output(s, this.world, pid))}</button>`;
          }).join('')}${prov.length > 8 ? `<span class="muted"> +${prov.length - 8}</span>` : ''}</div>
          <div class="store-pol"><span>Surplus${storedNow > 1e-3 ? ` <b class="c-blue">+${qty(storedNow)}/mois en stock</b>` : ''}</span><span class="seg">${[[0, '🏪 Vendre'], [0.5, '½'], [1, '🏬 Stocker']].map(([v, l]) => `<button class="${(s.storePolicy[g] ?? 0) === v ? 'on' : ''}" data-a="storePol" data-p="${g}:${v}">${l}</button>`).join('')}</span></div>
          <label class="check"><input type="checkbox" data-a="forSale" data-p="${g}" ${selling ? 'checked' : ''}><span>Accepter les offres d’achat étrangères</span></label></div>`;
      }).join('');
    } else if (tab === 'markets') {
      const all = Object.keys(GOODS) as (keyof typeof GOODS)[];
      const mine = (Object.keys(cap) as (keyof typeof GOODS)[]).sort((a, b) => (cap[b] ?? 0) * unitPriceOf(s, b) - (cap[a] ?? 0) * unitPriceOf(s, a));
      const g = (this.marketGood && GOODS[this.marketGood as keyof typeof GOODS] ? this.marketGood : mine[0] ?? all[0]) as keyof typeof GOODS;
      const d = GOODS[g];
      const hist = (s.priceHistory[g] ?? [s.prices[g] ?? 1]).map((m) => m * d.price);
      const refs: RefLine[] = [{ value: d.price, label: 'prix de référence' }];
      const locked = s.contracts.filter((c) => c.good === g);
      if (locked.length) refs.push({ value: locked.reduce((a, c) => a + c.unitPrice * (1 + c.bonus), 0) / locked.length, label: 'vos contrats', color: 'var(--gold)' });
      const t1 = trendOf(g, 1);
      const t12 = trendOf(g, 12);
      html += `<p class="hint">Le cours mondial de chaque marchandise, mois par mois. Il monte quand un détroit ferme ou qu’une crise frappe, et vos contrats restent au prix fixé à la signature. Touchez la courbe pour lire un mois.</p>
        <div class="card market-main"><div class="mh"><b>${d.icon} ${d.name}</b><small>par ${esc(d.unit)}</small></div>
        <div class="stats three">${stat('Cours actuel', `<span class="c-blue">${money(unitPriceOf(s, g))}</span>`)}${stat('Sur 1 mois', `<span class="${cls(t1)}">${pct(t1)}</span>`)}${stat('Sur 12 mois', `<span class="${cls(t12)}">${pct(t12)}</span>`)}</div>
        ${priceChart(hist, clockOf(s), refs)}
        ${cap[g] ? `<small class="muted">Vous en produisez ${qty(cap[g]!)} ${esc(d.unit)}/mois, dont ${qty(com[g] ?? 0)} sous contrat.</small>` : '<small class="muted">Vous n’en produisez pas.</small>'}
        ${this.tradeButtons(g)}</div>
        <div class="market-list">${[...mine, ...all.filter((x) => !mine.includes(x))].map((x) => {
          const h = (s.priceHistory[x] ?? []).slice(-24);
          const tr = trendOf(x, 12);
          return `<button class="market-row ${x === g ? 'on' : ''}" data-a="marketGood" data-p="${x}">
            <span class="name">${GOODS[x].icon} ${GOODS[x].name}${cap[x] ? ' <i class="mine-tag">produit</i>' : ''}</span>
            ${sparkline(h)}
            <span class="val"><b class="c-blue">${money(unitPriceOf(s, x))}</b><small class="${cls(tr)}">${pct(tr, 0)} /an</small></span></button>`;
        }).join('')}</div>`;
    } else if (tab === 'offers') {
      html += `<p class="hint">Un contrat = livrer une quantité fixe <b>chaque mois</b> à prix garanti. ✅ signable · ❌ production insuffisante.</p>`;
      html += s.offers.length
        ? s.offers.map((o) => {
            const g = GOODS[o.good];
            const sel = this.offerRoute[o.id] ?? 0;
            const route = o.routes[sel] ?? o.routes[0];
            const mg = C.contractFactor(s, this.world, o.good); // part réellement encaissée par unité
            const est = route ? C.estimate(o.volume, o.bonus, route, o.unitPrice, mg) : null;
            const risk = route ? C.piracyRisk(route, 0, s) : 0;
            const c = sup[o.good] ?? 0;
            const used = com[o.good] ?? 0;
            const left = c - used - o.volume;
            const tooMuch = left < -c * 0.02;
            const blocked = route ? C.blockedStraits(s, this.world, route).length > 0 : true;
            const market = o.volume * unitPriceOf(s, o.good) * mg; // même quantité vendue au cours du jour, après coûts de production
            const vsMarket = est ? (est.net / Math.max(market, 1e-6) - 1) * 100 : 0;
            const verdict = tooMuch
              ? `<div class="verdict bad">❌ Production insuffisante : il manque <b>${qty(-left)} ${esc(g.unit)}/mois</b>. Modernisez une province, attendez la fin d’un contrat ou achetez-en à l’étranger (📈 Cours).</div>`
              : blocked
                ? `<div class="verdict warn">⛔ Cet itinéraire passe par un détroit fermé : choisissez-en un autre.</div>`
                : `<div class="verdict ok">✅ <b>+${money(est!.net)}/mois</b> pendant ${o.months} mois <small>(≈ ${money(est!.net * o.months)} au total · ${pct(vsMarket, 0)} vs vente au cours actuel · l’État encaisse ${Math.round(mg * 100)} % du cours, comme au marché)</small></div>`;
            return `<div class="card offer"><div class="offer-head">${this.gi(o.good, true)}<div>${this.flag(o.buyer, true)} achète ${esc(partitive(g.name))}<br><small class="muted">Répondre sous ${o.expires} mois</small></div></div>
              ${verdict}
              <div class="stats three">${stat('Chaque mois', `${qty(o.volume)} <small>${esc(g.unit)}</small>`)}${stat('Prix garanti', `${money(o.unitPrice * (1 + o.bonus))} <small class="${o.bonus >= 0 ? 'pos' : 'neg'}">${o.bonus >= 0 ? '+' : '−'}${Math.abs(Math.round(o.bonus * 100))} %</small>`)}${stat('Durée', `${o.months} mois`)}</div>
              <div class="cap-line"><span>Production${(P.purchased(s)[o.good] ?? 0) > 0 ? ' + achats' : ''}</span><span>${qty(c)} ${esc(g.unit)}/mois</span></div>
              ${this.gauge(c, used, o.volume)}
              <div class="cap-legend"><span><i class="k used"></i>déjà vendu <b class="c-gold">${qty(used)}</b></span><span><i class="k add"></i>ce contrat <b class="c-blue">${qty(o.volume)}</b></span><span><i class="k free"></i>reste <b class="${left < 0 ? 'neg' : 'pos'}">${qty(Math.max(0, left))}</b></span></div>
              <details class="route-pick" data-k="o${o.id}"><summary>🚢 Itinéraire : ${route ? this.routeLabel(route) : '—'}${risk > 0 ? ` · <span class="neg">pirates ${Math.round(risk * 100)} %/mois</span>` : ''}</summary>
                ${o.routes.map((r, i) => `<label class="check"><input type="radio" name="r${o.id}" data-a="offerRoute" data-p="${o.id}:${i}" ${i === sel ? 'checked' : ''}><span>${this.routeLabel(r)} · net ${money(C.estimate(o.volume, o.bonus, r, o.unitPrice, mg).net)}</span></label>`).join('')}
                ${route ? this.routeSteps(route) : ''}
                ${est ? `<small class="muted">Péages ${money(est.tolls)} · transport ${money(est.transport)} par mois. Une escorte (onglet Contrats) réduit le risque pirate.</small>` : ''}</details>
              <div class="actions three">
                <button class="act primary-act" data-a="sign" data-p="${o.id}" ${tooMuch || blocked ? 'disabled' : ''}><span class="t">✍️ Signer</span><span class="c">🌍 +8</span></button>
                <button class="act" data-a="negotiate" data-p="${o.id}" ${o.negotiated ? 'disabled' : ''}><span class="t">💬 Négocier</span><span class="c">${o.negotiated ? 'Déjà tenté' : 'prime +5 % · 🤝 −10 · risque'}</span></button>
                <button class="act" data-a="decline" data-p="${o.id}"><span class="t">✖ Décliner</span><span class="c">sans effet</span></button>
              </div></div>`;
          }).join('')
        : '<p class="muted">Aucune offre pour le moment. Les acheteurs se manifestent pour les marchandises dont il vous reste une part disponible (onglet Production).</p>';
    } else {
      const navy = Math.floor(this.me.navy);
      const used = C.escortsUsed(s);
      const total = s.contracts.reduce((a, c) => a + (c.lastStatus === 'ok' ? c.lastRevenue : 0), 0);
      const spent = s.purchases.reduce((a, p) => a + p.lastCost, 0);
      html += `<div class="stats three">${stat('Ventes ce mois', `<span class="pos">${money(total)}</span>`)}${stat('Achats ce mois', `<span class="neg">${money(spent)}</span>`)}${stat('Escortes', `${used}/${navy} flottes`)}</div><h3>📤 Ventes</h3>`;
      html += s.contracts.length
        ? s.contracts.map((c) => {
            const g = GOODS[c.good];
            const status = c.lastStatus === 'ok' ? (c.lastRevenue > 0 ? `<div class="verdict ok">✅ Livré : <b>+${money(c.lastRevenue)}</b> ce mois</div>` : '<div class="verdict">⏳ Premier convoi en route</div>') : c.lastStatus === 'blocked' ? `<div class="verdict bad">⛔ Bloqué depuis ${c.blocked} mois : changez d’itinéraire (rupture à 4 mois)</div>` : '<div class="verdict bad">🏴‍☠️ Convoi pillé ce mois : ajoutez une escorte</div>';
            const short = (com[c.good] ?? 0) > (cap[c.good] ?? 0) * 1.02;
            const risk = C.piracyRisk(c.route, c.escort, s);
            return `<div class="card"><div class="offer-head">${this.gi(c.good, true)}<div>${this.flag(c.buyer, true)} · ${esc(g.name.toLowerCase())}<br><small class="muted">${qty(c.volume)} ${esc(g.unit)}/mois à ${money(c.unitPrice * (1 + c.bonus))} · encore ${c.monthsLeft} mois</small></div></div>
              ${status}${short ? `<div class="verdict warn">⚠️ Production insuffisante : livraisons partielles.</div>` : ''}
              <div class="escort"><span>🛡️ Escorte <b>${c.escort}</b> · pirates <b class="${risk > 0.05 ? 'neg' : ''}">${Math.round(risk * 100)} %</b>/mois</span>
                <span class="seg"><button data-a="escort" data-p="${c.id}:-1" ${c.escort ? '' : 'disabled'}>−</button><button data-a="escort" data-p="${c.id}:1" ${used < navy ? '' : 'disabled'}>+</button></span></div>
              <details class="route-pick" data-k="c${c.id}"><summary>🚢 Itinéraire : ${this.routeLabel(c.route)}</summary>
                ${c.alternatives.map((r, i) => `<label class="check"><input type="radio" name="c${c.id}" data-a="reroute" data-p="${c.id}:${i}" ${r.nodes.join() === c.route.nodes.join() ? 'checked' : ''}><span>${this.routeLabel(r)}</span></label>`).join('')}${this.routeSteps(c.route)}</details>
              <button class="link danger" data-a="cancelContract" data-p="${c.id}">Rompre le contrat (🌍 −20 avec ${flagOf(c.buyer)})</button></div>`;
          }).join('')
        : '<p class="muted">Aucun contrat de vente. Signez des offres dans l’onglet ✉️ Offres.</p>';
      html += `<h3>📥 Achats</h3>`;
      html += s.purchases.length
        ? s.purchases.map((p) => {
            const g = GOODS[p.good];
            const vs = (p.unitPrice / unitPriceOf(s, p.good) - 1) * 100;
            const status = p.lastStatus === 'ok' ? (p.lastCost > 0 ? `<div class="verdict ok">✅ Reçu ce mois : ${qty(p.volume)} ${esc(g.unit)} pour ${money(p.lastCost)}</div>` : '<div class="verdict">⏳ Première livraison le mois prochain</div>') : p.lastStatus === 'blocked' ? `<div class="verdict bad">⛔ Bloqué depuis ${p.blocked} mois : changez d’itinéraire</div>` : '<div class="verdict bad">🏴‍☠️ Cargaison pillée (payée mais perdue) : ajoutez une escorte</div>';
            const risk = C.piracyRisk(p.route, p.escort, s);
            return `<div class="card"><div class="offer-head">${this.gi(p.good, true)}<div>de ${this.flag(p.seller, true)} · ${esc(g.name.toLowerCase())}<br><small class="muted">${qty(p.volume)} ${esc(g.unit)}/mois à ${money(p.unitPrice)} (<span class="${cls(-vs)}">${pct(vs, 0)} vs cours</span>) · encore ${p.monthsLeft} mois</small></div></div>
              ${status}
              <div class="escort"><span>🛡️ Escorte <b>${p.escort}</b> · pirates <b class="${risk > 0.05 ? 'neg' : ''}">${Math.round(risk * 100)} %</b>/mois</span>
                <span class="seg"><button data-a="pEscort" data-p="${p.id}:-1" ${p.escort ? '' : 'disabled'}>−</button><button data-a="pEscort" data-p="${p.id}:1" ${used < navy ? '' : 'disabled'}>+</button></span></div>
              <details class="route-pick" data-k="p${p.id}"><summary>🚢 Itinéraire : ${this.routeLabel(p.route)}</summary>
                ${p.alternatives.map((r, i) => `<label class="check"><input type="radio" name="p${p.id}" data-a="pReroute" data-p="${p.id}:${i}" ${r.nodes.join() === p.route.nodes.join() ? 'checked' : ''}><span>${this.routeLabel(r)}</span></label>`).join('')}${this.routeSteps(p.route)}</details>
              <button class="link danger" data-a="cancelPurchase" data-p="${p.id}">Rompre (🌍 −10 avec ${flagOf(p.seller)})</button></div>`;
          }).join('')
        : '<p class="muted">Aucun contrat d’achat. Achetez à l’étranger depuis l’onglet 📈 Cours, la fiche d’un pays, ou vos besoins (📦 Ressources).</p>';
    }
    const scroll = this.el.overlay.querySelector('.content')?.scrollTop ?? 0;
    const open = [...this.el.overlay.querySelectorAll<HTMLDetailsElement>('details[open][data-k]')].map((d) => d.dataset.k);
    this.modal('Économie', html, [{ label: 'Fermer', a: 'closeModal', primary: true }]);
    for (const k of open) this.el.overlay.querySelector<HTMLDetailsElement>(`details[data-k="${k}"]`)?.setAttribute('open', '');
    const content = this.el.overlay.querySelector('.content');
    if (content) content.scrollTop = scroll;
  }

  // ——— Drapeaux ———

  /** Drapeau cliquable : toucher affiche le nom du pays. */
  private flag(id: Id, big = false): string {
    return `<span class="flag ${big ? 'big' : ''}" role="button" data-a="who" data-p="${esc(id)}" title="${esc(nm(this.state, id))}">${flagOf(id)}</span>`;
  }

  // ——— Niveau de vie ———

  /** Palier de niveau de vie : progression, satisfaction, prochains besoins, coût de l'État. */
  private tierHtml(): string {
    const s = this.state;
    const me = this.me;
    const pr = s.prosperity;
    const t = TIERS[me.tier - 1];
    const next = TIERS[me.tier];
    const sat = Math.round(pr.satisfaction * 100);
    const trend = (pr.satisfaction - 0.8) * 15;
    const ladder = TIERS.map((x, i) => `<span class="rung ${i + 1 === me.tier ? 'on' : i + 1 < me.tier ? 'done' : ''}" title="${esc(x.name)}">${x.icon}</span>`).join('<i class="sep"></i>');
    return `<h3>🏙️ Niveau de vie</h3>
      <div class="card tier-card"><div class="ladder">${ladder}</div>
        <div class="mh"><b>${t.icon} ${t.name}</b><small>palier ${me.tier}/${TIERS.length}</small></div>
        <p class="hint" style="margin:0 0 6px">${esc(t.desc)} Productivité ×${num(t.productivity, 2)} · coût de l’État <b class="neg">−${money(me.income.admin ?? 0)}</b>/mois.</p>
        <div class="pbar big"><i style="width:${Math.round(pr.points)}%"></i></div>
        <div class="needtxt"><span>${me.tier < TIERS.length ? `vers « ${next.icon} ${next.name} » : <b class="c-gold">${Math.round(pr.points)} %</b>` : '<b class="c-gold">palier maximal</b>'}</span><span>satisfaction <b class="${sat >= 90 ? 'pos' : sat >= 80 ? 'c-warn' : 'neg'}">${sat} %</b> (${trend >= 0 ? '+' : '−'}${num(Math.abs(trend), 1)}/mois)</span></div>
        <p class="hint" style="margin:6px 0 0">Au-dessus de 80 % de besoins satisfaits, la population progresse ; en dessous, elle régresse et la stabilité baisse. Les achats d’urgence ne comptent qu’aux trois quarts.${next ? ` Au palier suivant, elle réclamera aussi : ${Object.keys(next.adds).map((g) => this.gi(g as keyof typeof GOODS)).join(' ')} — et l’État coûtera ${money(devOf(s, me.id) * next.admin)}/mois.` : ''}</p></div>`;
  }

  // ——— Besoins, stocks et achats ———

  private needsHtml(): string {
    const s = this.state;
    const qty = (v: number) => num(v, v < 10 ? 2 : 1);
    const needs = P.needsOf(s, s.player);
    const promisedAll = P.purchased(s);
    const cap = C.capacity(s, this.world, s.player);
    const com = C.committed(s);
    const now = clockOf(s);
    const dateAt = (m: number) => { const t = now + m; return `${MONTHS[t % 12]} ${Math.floor(t / 12)}`; };
    let html = this.tierHtml() + `<h3>🍞 Besoins de la population</h3>
      <p class="hint">Pour chaque besoin, la barre montre comment le <b>mois prochain</b> sera couvert :
      <span class="pos">■ votre production</span>, <span class="c-blue">■ vos stocks et achats</span>, <span class="neg">■ le manque</span>, acheté en urgence au cours <span class="neg">+${Math.round(P.EMERGENCY * 100)} %</span>.</p>`;
    const goods = [...new Set([...(Object.keys(needs) as (keyof typeof GOODS)[]), ...(Object.keys(s.stock) as (keyof typeof GOODS)[]).filter((g) => (s.stock[g] ?? 0) > 1e-3), ...(Object.keys(promisedAll) as (keyof typeof GOODS)[])])];
    html += goods.map((g) => {
      const d = GOODS[g];
      const u = esc(d.unit);
      const need = needs[g] ?? 0;
      const st = s.stock[g] ?? 0;
      const promised = promisedAll[g] ?? 0;
      const contracts = s.purchases.filter((p) => p.good === g);
      const until = contracts.length ? Math.min(...contracts.map((p) => p.monthsLeft)) : 0;
      const sell = st > 1e-3 ? `<span class="seg"><button data-a="spotSell" data-p="${g}:0.5">Vendre ½</button><button data-a="spotSell" data-p="${g}:1">Tout (+${money(st * unitPriceOf(s, g) * (1 - P.SPOT_SELL))})</button></span>` : '';
      if (need <= 0) {
        // Marchandise en stock sans besoin de la population : simple réserve à revendre
        return `<div class="need ok"><div class="mh"><b>${this.gi(g)} ${d.name}</b><small>en stock</small></div>
          <div class="needtxt"><span>Réserve : <b class="c-blue">${qty(st)} ${u}</b>${promised > 0 ? ` · achats <b class="c-blue">+${qty(promised)}/mois</b>` : ''}</span></div>
          <div class="needact">${sell}</div></div>`;
      }
      // Prévision du mois prochain : production libre, puis contrats d'achat, puis réserve ; le reste manque
      const free = Math.max(0, (cap[g] ?? 0) - Math.min(cap[g] ?? 0, com[g] ?? 0));
      const own = Math.min(need, free);
      const fromBuy = Math.min(need - own, promised + st);
      const gap = Math.max(0, need - own - fromBuy);
      const w = (v: number) => `${Math.max(0, Math.min(100, (v / need) * 100)).toFixed(1)}%`;
      const reserveMonths = need - own - Math.min(need - own, promised) > 1e-6 ? st / (need - own - Math.min(need - own, promised)) : Infinity;
      const status =
        gap > 1e-3
          ? `<b class="neg">⚠️ Il manque ${qty(gap)} ${u}/mois : achat d’urgence ≈ −${money(gap * unitPriceOf(s, g) * (1 + P.EMERGENCY + (this.me.sanctions?.p ?? 0)))}/mois</b>`
          : own >= need - 1e-6
            ? '<b class="pos">✅ Couvert par votre production</b>'
            : reserveMonths === Infinity
              ? `<b class="pos">✅ Couvert par vos contrats d’achat</b>`
              : `<b class="pos">✅ Couvert</b> <span class="muted">— la réserve tient encore ≈ ${num(reserveMonths, reserveMonths < 10 ? 1 : 0)} mois</span>`;
      const details = [
        st > 1e-3 ? `réserve <b class="c-blue">${qty(st)} ${u}</b>` : '',
        promised > 0 ? `contrats d’achat <b class="c-blue">${qty(promised)}/mois</b> jusqu’en ${dateAt(until)}${promised > need - own + 1e-3 ? ` (${qty(promised - (need - own))} de plus que le besoin : mis en stock)` : ''}` : '',
      ].filter(Boolean).join(' · ');
      return `<div class="need ${gap > 1e-3 ? '' : 'ok'}"><div class="mh"><b>${this.gi(g)} ${d.name}</b><small>${esc(P.NEED_LABEL[g] ?? '')}</small></div>
        <div class="needbar"><i class="own" style="width:${w(own)}"></i><i class="stock" style="width:${w(fromBuy)}"></i><i class="market" style="width:${w(gap)}"></i></div>
        <div class="needtxt"><span>Besoin : <b>${qty(need)} ${u}/mois</b></span><span>${own > 1e-3 ? `<b class="pos">${qty(own)}</b>` : ''}${own > 1e-3 && (fromBuy > 1e-3 || gap > 1e-3) ? ' + ' : ''}${fromBuy > 1e-3 ? `<b class="c-blue">${qty(fromBuy)}</b>` : ''}${fromBuy > 1e-3 && gap > 1e-3 ? ' + ' : ''}${gap > 1e-3 ? `<b class="neg">${qty(gap)}</b>` : ''}</span></div>
        <div class="needfoot">${status}</div>
        ${details ? `<div class="needfoot muted">${details}</div>` : ''}
        <div class="needact">${gap > 1e-3 ? `<button class="chip" data-a="suppliers" data-p="${g}">📥 Trouver un fournisseur</button>` : ''}${sell}</div></div>`;
    }).join('');
    if (s.needs?.expensive) html += '<div class="verdict bad">🔥 Vie chère : les pénuries se paient au prix fort, la stabilité baisse (⚖️ −0,4/mois).</div>';
    return html;
  }

  /** Lot d'achat au comptant : un mois de besoins, sinon une unité. */
  private lot(g: keyof typeof GOODS): number {
    return Math.max(0.5, Math.round((P.needsOf(this.state, this.state.player)[g] ?? 1) * 100) / 100);
  }

  private tradeButtons(g: keyof typeof GOODS): string {
    const s = this.state;
    const lot = this.lot(g);
    const q = s.stock[g] ?? 0;
    const qty = (v: number) => num(v, v < 10 ? 2 : 1);
    return `<div class="actions" style="margin-top:8px">
      <button class="act" data-a="suppliers" data-p="${g}"><span class="t">📥 Contrat d’achat</span><span class="c">prix fixe, livré chaque mois</span></button>
      <button class="act" data-a="spotBuy" data-p="${g}"><span class="t">🛒 Acheter ${qty(lot)} ${esc(GOODS[g].unit)}</span><span class="c">au comptant · −${money(lot * unitPriceOf(s, g) * (1 + P.SPOT_BUY))}</span></button>
      ${q > 1e-3 ? `<button class="act wide" data-a="spotSell" data-p="${g}:1"><span class="t">💰 Vendre mon stock (${qty(q)} ${esc(GOODS[g].unit)})</span><span class="c">+${money(q * unitPriceOf(s, g) * (1 - P.SPOT_SELL))} au cours du jour −${Math.round(P.SPOT_SELL * 100)} %</span></button>` : ''}
    </div>`;
  }

  private supplierRow(id: Id, g: keyof typeof GOODS, q: P.Quote): string {
    const s = this.state;
    const n = s.nations[id];
    const vs = q.markup * 100;
    return `<div class="supplier ${q.ok ? '' : 'off'}"><div>${this.flag(id, true)} <small class="muted">🌍 ${signed(Math.round(rel(s, s.player, id)))}</small><br>
      <small>${this.gi(g)} ${money(q.unitPrice)}/${esc(GOODS[g].unit)} <span class="neg">+${Math.round(vs)} %</span> · jusqu’à ${num(q.max, 2)}/mois</small></div>
      <button class="chip" data-a="pForm" data-p="${esc(id)}|${g}" ${q.ok ? '' : 'disabled'}>${q.ok ? 'Choisir' : esc(q.reason ?? '')}</button></div>`;
  }

  private showSuppliers(g: keyof typeof GOODS) {
    const s = this.state;
    const list = P.suppliers(s, this.world, g, 8);
    const d = GOODS[g];
    const html = `<p class="hint">Les pays qui produisent ${esc(partitive(d.name))}, du moins cher au plus cher. Leur marge sur le cours (${money(unitPriceOf(s, g))}/${esc(d.unit)}) baisse quand vos relations sont bonnes ; votre rival exige davantage.</p>
      ${list.length ? list.map((x) => this.supplierRow(x.id, g, x.q)).join('') : '<p class="muted">Personne n’en produit assez pour exporter.</p>'}`;
    this.modal(`📥 Acheter : ${this.gi(g)} ${esc(d.name)}`, html, [
      { label: 'Retour', a: 'contracts', p: 'markets' },
      { label: 'Fermer', a: 'closeModal' },
    ]);
  }

  private showSellerGoods(id: Id) {
    const s = this.state;
    const cap = C.capacity(s, this.world, id);
    const goods = (Object.keys(cap) as (keyof typeof GOODS)[]).filter((g) => (cap[g] ?? 0) > 0.05).sort((a, b) => (cap[b] ?? 0) * unitPriceOf(s, b) - (cap[a] ?? 0) * unitPriceOf(s, a));
    const html = `<p class="hint">Ce que ${esc(nm(s, id))} peut vous vendre chaque mois (la moitié de sa production au plus), au cours du jour plus sa marge.</p>
      ${goods.length ? goods.map((g) => this.supplierRow(id, g, P.quote(s, this.world, id, g))).join('') : '<p class="muted">Ce pays ne produit rien d’exportable.</p>'}`;
    this.modal(`📥 Acheter à ${flagOf(id)} ${esc(nm(s, id))}`, html, [{ label: 'Fermer', a: 'closeModal' }]);
  }

  private showPurchaseForm() {
    const s = this.state;
    const f = this.pf!;
    const g = f.good;
    const d = GOODS[g];
    const q = P.quote(s, this.world, f.seller, g);
    const qty = (v: number) => num(v, v < 10 ? 2 : 1);
    const need = s.needs?.lines[g]?.market ?? 0;
    const opts: [string, number][] = [];
    if (need > 0.01 && need < q.max) opts.push([`Mes besoins (${qty(need)})`, need]);
    for (const [l, k] of [['¼', 0.25], ['½', 0.5], ['Max', 1]] as [string, number][]) opts.push([`${l} (${qty(q.max * k)})`, Math.round(q.max * k * 100) / 100]);
    if (!f.volume || f.volume > q.max) f.volume = opts[0][1];
    const route = q.routes[f.route] ?? q.routes[0];
    const value = f.volume * q.unitPrice;
    const tolls = route ? value * TOLL * route.straits.length : 0;
    const monthly = value + tolls;
    const urgent = f.volume * unitPriceOf(s, g) * (1 + P.EMERGENCY);
    const risk = route ? C.piracyRisk(route, 0, s) : 0;
    const html = `<div class="offer-head">${this.gi(g, true)}<div>${this.flag(f.seller, true)} vous vend ${esc(partitive(d.name))}<br><small class="muted">Prix verrouillé : ${money(q.unitPrice)}/${esc(d.unit)} (cours ${money(unitPriceOf(s, g))}, marge <span class="neg">+${Math.round(q.markup * 100)} %</span>)</small></div></div>
      <div class="verdict ${q.ok ? 'ok' : 'bad'}">${q.ok ? `💸 <b>−${money(monthly)}/mois</b> pendant ${f.months} mois <small>(≈ ${money(monthly * f.months)} au total${P.NEEDS[g] ? ` · achat d’urgence équivalent : ${money(urgent)}/mois` : ''})</small>` : `❌ ${esc(q.reason ?? '')}`}</div>
      <h3>Quantité par mois</h3><div class="pick-row">${opts.map(([l, v]) => `<button class="chip ${Math.abs(v - f.volume) < 1e-6 ? 'on' : ''}" data-a="pSet" data-p="v:${v}">${l}</button>`).join('')}</div>
      <h3>Durée</h3><div class="pick-row">${[12, 24, 36].map((m) => `<button class="chip ${m === f.months ? 'on' : ''}" data-a="pSet" data-p="m:${m}">${m} mois</button>`).join('')}</div>
      <h3>Itinéraire</h3>${q.routes.map((r, i) => `<label class="check"><input type="radio" name="pf" data-a="pSet" data-p="r:${i}" ${i === f.route ? 'checked' : ''}><span>${this.routeLabel(r)}</span></label>`).join('')}
      ${route ? this.routeSteps(route) : ''}
      <p class="hint">Vous payez à l’expédition : une cargaison pillée (🏴‍☠️ ${Math.round(risk * 100)} %/mois sans escorte) est perdue. Les marchandises reçues vont dans vos stocks : elles nourrissent votre population, servent vos contrats de vente ou se revendent au comptant.</p>`;
    this.modal('📥 Contrat d’achat', html, [
      { label: '✍️ Signer', hint: '🌍 +5', a: 'pSign', primary: true, disabled: !q.ok },
      { label: 'Retour', a: 'suppliers', p: g },
    ]);
  }

  private showHelp() {
    this.modal(
      'Comment jouer',
      `<p>Vous dirigez une nation à partir de janvier 2026. Le temps s'écoule mois par mois : <b>▶</b> lance ou met en pause, <b>›››</b> règle la vitesse. Touchez une province pour agir.</p>
      <p><b>But</b> 🎯 : une campagne de 10 ans (2026-2036). Remplissez vos missions, battez votre rival et soignez votre rang : un bilan noté de S à D tombe à la fin.</p>
      <p><b>Contrats</b> 📦 : des acheteurs vous proposent d'acheter votre production à prix fixe avec une prime. Choisissez l'itinéraire de vos convois (détroits à péage, zones de piraterie), escortez-les avec votre flotte, contournez les blocus. C'est votre principale source de richesse.</p>
      <p><b>Niveau de vie</b> 🏙️ : votre population passe de la subsistance à l'économie du savoir. Chaque palier la rend plus productive mais réclame de nouveaux biens (pétrole, gaz, puces, services…) et fait grimper le coût de l'État. Satisfaites plus de 80 % de ses besoins pour progresser ; en dessous, elle régresse et la stabilité baisse. Rien n'est gratuit : chaque marchandise a un coût de production.</p>
      <p><b>Trois ressources</b> : 💰 le trésor (contrats + production + commerce − entretien des forces), 🤝 l'influence (diplomatie) et 🔥 la ferveur (religion).</p>
      <p><b>Commerce</b> : chaque province produit une marchandise dont la valeur entre dans un <b>nœud commercial</b>. La richesse coule d'amont en aval vers trois grands pôles : Manche, New York et Shanghai. Vous touchez une part de chaque zone où vous êtes présent (ports, flotte), surtout dans votre zone d'attache ; vos marchands travaillent seuls pour y attirer la richesse. Votre flotte renforce votre poids dans les nœuds côtiers.</p>
      <p><b>Détroits</b> ⚓ : Ormuz, Suez, Malacca, Panama, Bosphore… leur propriétaire touche un péage et peut les fermer — le commerce en aval s'effondre et les prix s'envolent.</p>
      <p><b>Religion</b> : chaque province a sa confession. Les minorités s'agitent, surtout sous une politique de prosélytisme, et peuvent se soulever — d'autant plus si une puissance voisine arme les insurgés. Envoyez des missionnaires pour les convertir, ou choisissez la tolérance.</p>
      <p><b>Lieux saints</b> ⭐ : Jérusalem, La Mecque, Rome, Qom… les détenir rapporte de la ferveur ; les laisser à une autre religion vous fâche avec tous ses fidèles et ouvre la <b>guerre sainte</b>.</p>
      <p><b>Guerre</b> : l'armée prend les provinces ennemies une à une. Le score de guerre dépend des provinces occupées ; il permet d'annexer des provinces précises, de satelliser ou d'exiger des réparations. Une puissance nucléaire ne capitule jamais.</p>`,
      [{ label: 'Compris', a: 'closeModal', primary: true }],
    );
  }

  private showMenu() {
    this.setSpeed(0);
    this.modal('Menu', '<p class="muted">La partie est sauvegardée automatiquement chaque année.</p>', [
      { label: 'Reprendre', a: 'closeModal', primary: true },
      { label: 'Classements', a: 'ledger' },
      { label: 'Sauvegarder', a: 'save' },
      { label: 'Comment jouer', a: 'help' },
      { label: 'Quitter vers le menu', a: 'quit' },
    ]);
  }

  /** Fiche d'un convoi : origine, destination, cargaison, itinéraire ; interception possible. */
  private showConvoy(id: number) {
    const s = this.state;
    const c = s.convoys.find((x) => x.id === id);
    if (!c) return;
    this.setSpeed(0);
    this.selConvoy = id;
    this.map.render(s, this.mode, this.view === 'province' ? this.selected : null, id, this.view === 'country' && this.selected !== null ? s.provinces[this.selected].owner : null);
    const t = this.map.now;
    const g = GOODS[c.good];
    const from = s.nations[c.from];
    const to = s.nations[c.to];
    const u = Math.max(0, Math.min(1, V.progressAt(c, t)));
    const weeks = Math.max(1, Math.round((1 - u) * c.duration * 4.3));
    const here = V.currentNode(c, t);
    const relTag = (x: Id) => (x === s.player ? '' : ` <span class="muted">(relations ${signed(Math.round(rel(s, s.player, x)))})</span>`);
    let html = `<div class="convoy-card">
      <div class="leg">${this.flag(from.id, true)}${relTag(from.id)}<br><span class="muted">depuis ${esc(C.nodeName(c.nodes[0]))}</span></div>
      <div class="arrow">→</div>
      <div class="leg">${this.flag(to.id, true)}${relTag(to.id)}<br><span class="muted">vers ${esc(C.nodeName(c.nodes[c.nodes.length - 1]))}</span></div></div>
      <div class="rows">
      <div class="row"><span>Cargaison</span><span>${this.gi(c.good)} <b>${num(c.qty, 2)} ${g.unit}</b> · <b>${money(c.value)}</b></span></div>
      <div class="row"><span>Position</span><span>${esc(C.nodeName(here))} · arrivée dans ~${weeks} sem.</span></div>
      <div class="row"><span>Escorte</span><span>${c.escort ? `${c.escort} flotte${c.escort > 1 ? 's' : ''}` : 'aucune'}</span></div></div>`;
    const details = `<details class="route-details"><summary>Itinéraire (${c.nodes.length - 1} étapes${c.straits.length ? `, ${c.straits.length} détroit${c.straits.length > 1 ? 's' : ''}` : ''})</summary>
      ${this.routeSteps({ nodes: c.nodes, straits: c.straits, piracy: [] })}</details>`;
    const buttons: Parameters<App['modal']>[2] = [];
    if (c.from === s.player) {
      html += `<p class="muted">L’un de vos convois (contrat avec ${this.flag(to.id)}). Escortez-le depuis 📦 Économie pour le protéger des pirates et des marines ennemies.</p>`;
    } else {
      const chk = V.canIntercept(s, this.world, c, t);
      if (chk.legal)
        html += `<h3>⚓ Blocus</h3><p class="muted">Vous êtes en guerre avec ${esc(warBetween(s, s.player, c.from) ? from.name : to.name)} : saisir ce convoi est un acte de guerre légitime, sans conséquence diplomatique.</p>`;
      else
        html += `<h3>🏴‍☠️ Intercepter en temps de paix</h3><p class="muted">Vous saisissez environ 70 % de la cargaison, mais c’est un acte de piraterie d’État :</p>
          <ul class="consequences">${chk.ally && this.me.bloc ? `<li>🚫 <b>Trahison d’un allié</b> : ${esc(s.blocs[this.me.bloc].name)} vous exclut, relations −25 avec chacun de ses membres</li>` : ''}<li>${this.flag(from.id)} : relations −40, <b>embargo</b> contre vous et <b>casus belli</b> (voire guerre immédiate)</li>
          <li>${this.flag(to.id)} : relations −20</li><li>Alliés de ${this.flag(from.id)} : −15 · reste du monde : −4</li><li>Agressivité +12 · tension mondiale +3</li></ul>`;
      if (chk.ok) html += `<p>Chance de succès : <b>${Math.round(chk.chance * 100)} %</b> (votre flotte ${num(s.nations[s.player].navy, 1)} contre l’escorte). En cas d’échec, vous perdez une flotte.</p>`;
      buttons.push({ label: '🏴‍☠️ Intercepter', hint: chk.ok ? `≈ +${money(c.value * 0.7)}` : chk.reason, a: 'intercept', p: String(c.id), disabled: !chk.ok });
    }
    html += details;
    buttons.push({ label: 'Fermer', a: 'closeModal', primary: c.from === s.player });
    this.modal(`${this.gi(c.good)} Convoi de ${g.name.toLowerCase()}`, html, buttons);
  }

  private showLog() {
    const s = this.state;
    this.seenLog = s.log.length;
    this.modal(
      'Journal',
      s.log.map((l) => `<div class="log-item ${l.mine ? 'mine' : ''}"><small>${l.date}</small>${esc(l.text)}</div>`).join('') || '<p class="muted">Rien à signaler.</p>',
      [{ label: 'Fermer', a: 'closeModal' }],
    );
    this.renderHud();
  }

  private showLedger(tab: string) {
    const s = this.state;
    const tabs = [['trade', 'Commerce'], ['power', 'Armées'], ['faith', 'Religions'], ['wars', 'Guerres'], ['blocs', 'Blocs']];
    let html = `<div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="ledger" data-p="${k}">${l}</button>`).join('')}</div>`;
    const row = (id: Id, i: number, v: string) =>
      `<div class="row" data-a="gotoNation" data-p="${esc(id)}" style="cursor:pointer;${id === s.player ? 'color:var(--gold)' : ''}"><span>${i + 1}. ${flagOf(id)} ${esc(nm(s, id))}</span><span>${v}</span></div>`;
    if (tab === 'trade') {
      html += `<div class="rows">${alive(s)
        .map((n) => ({ id: n.id, v: n.income.production + n.income.trade + n.income.tolls }))
        .sort((a, b) => b.v - a.v).slice(0, 40).map((x, i) => row(x.id, i, `${money(x.v)} / mois`)).join('')}</div>`;
    } else if (tab === 'power') {
      html += `<div class="rows">${alive(s).sort((a, b) => power(b) - power(a)).slice(0, 40).map((n, i) => row(n.id, i, `${num(n.army, 1)} div.${n.nuclear ? ' ☢' : ''}`)).join('')}</div>`;
    } else if (tab === 'faith') {
      html += this.religionShares();
      const holy = this.world.provinces.filter((p) => p.holy);
      html += `<h3>Lieux saints</h3><div class="rows">${holy.flatMap((p) => p.holy!.map((h) => `<div class="row" data-a="goto" data-p="${p.id}" style="cursor:pointer"><span>⭐ ${esc(h.name)} ${h.religions.map((x) => RELIGIONS[x].icon).join('')}</span><span>${esc(nm(s, s.provinces[p.id].owner))}</span></div>`)).join('')}</div>`;
    } else if (tab === 'wars') {
      html += s.wars.length
        ? s.wars.map((w) => `<div class="row"><span>${esc(w.name)}<br><small class="muted">${w.attackers.map((x) => this.flag(x)).join(' ')} ⚔ ${w.defenders.map((x) => this.flag(x)).join(' ')}</small></span><span class="${cls(w.score)}">${signed(w.score)}</span></div>`).join('')
        : '<p class="muted">Le monde est en paix… pour l’instant.</p>';
    } else {
      html += Object.values(s.blocs).map((b) => `<h3 style="color:${b.color}">${esc(b.name)} (${b.members.length})</h3><p class="muted" style="font-size:12px">Meneur : ${this.flag(b.leader)} — ${b.members.map((m) => this.flag(m)).join(' ')}</p>`).join('');
    }
    this.modal('Classements', html, [{ label: 'Fermer', a: 'closeModal' }]);
  }

  private confirmWar(id: Id) {
    const s = this.state;
    const me = this.me;
    const t = s.nations[id];
    const allies = t.bloc ? s.blocs[t.bloc].members.filter((m) => m !== id) : [];
    const theirPow = power(t) * 1.2 + allies.reduce((a, m) => a + power(s.nations[m]) * 0.6, 0);
    const nukes = [t, ...allies.map((m) => s.nations[m])].some((n) => n.nuclear);
    const holy = me.holyClaims.includes(id);
    const justified = holy || me.claims.includes(id);
    this.modal(
      `Déclarer la guerre à ${esc(t.name)} ?`,
      `<div class="stats">${stat('Votre puissance', num(power(me), 0))}${stat('Camp adverse', num(theirPow, 0))}</div>
      ${allies.length ? `<p class="neg">⚠ Membre de ${esc(s.blocs[t.bloc!].name)} : ${allies.length} alliés entreront en guerre (${allies.slice(0, 8).map((m) => esc(nm(s, m))).join(', ')}${allies.length > 8 ? '…' : ''}).</p>` : ''}
      ${nukes ? '<p class="neg">☢ Le camp adverse dispose de l’arme nucléaire : capitulation impossible, tension mondiale en forte hausse.</p>' : ''}
      ${holy ? `<p>☪✝ Guerre sainte : les nations ${RELIGIONS[me.religion].adj}s ferventes pourraient vous rejoindre, celles de foi ${RELIGIONS[t.religion].adj} défendre ${esc(t.name)}.</p>` : ''}
      <p>${justified ? '✔ Guerre justifiée : agressivité +5.' : '✖ Sans casus belli : stabilité −15, agressivité +25, relations dégradées avec le monde entier.'}</p>`,
      [
        { label: 'Déclarer la guerre', a: 'declareGo', p: id, primary: true },
        { label: 'Annuler', a: 'closeModal' },
      ],
    );
  }

  private showWar(warId: string) {
    const s = this.state;
    const war = s.wars.find((w) => w.id === warId);
    if (!war) return;
    const sc = scoreFor(war, s.player);
    const mine = war.attackers.includes(s.player) ? war.attackers : war.defenders;
    const theirs = mine === war.attackers ? war.defenders : war.attackers;
    const side = (ids: Id[]) => ids.map((x, i) => `<div class="row"><span>${i === 0 ? '★ ' : ''}${flagOf(x)} ${esc(nm(s, x))}</span><span>${num(power(s.nations[x]), 0)}</span></div>`).join('');
    const occ = s.provinces.map((p, pid) => ({ p, pid })).filter(({ p }) => p.occupiedBy && [...war.attackers, ...war.defenders].includes(p.owner) && [...war.attackers, ...war.defenders].includes(p.occupiedBy));
    const leader = isLeader(war, s.player);
    this.modal(
      esc(war.name),
      `${scoreBar(sc)}<p style="text-align:center">Score de guerre : <b class="${cls(sc)}">${signed(sc)}</b> · ${war.months} mois</p>
      <h3>Votre camp</h3><div class="rows">${side(mine)}</div>
      <h3>Adversaires</h3><div class="rows">${side(theirs)}</div>
      ${occ.length ? `<h3>Provinces occupées (${occ.length})</h3><div class="rows">${occ.slice(0, 30).map(({ p, pid }) => `<div class="row" data-a="goto" data-p="${pid}" style="cursor:pointer"><span>${esc(this.world.provinces[pid].name)} <small class="muted">(${esc(nm(s, p.owner))})</small></span><span>${esc(nm(s, p.occupiedBy!))}</span></div>`).join('')}</div>` : ''}
      ${leader ? '' : '<p class="muted">Seul le meneur de votre camp peut négocier la paix.</p>'}`,
      [...(leader ? [{ label: 'Négocier la paix', a: 'peace', p: war.id, primary: true }] : []), { label: 'Fermer', a: 'closeModal' }],
    );
  }

  private showPeace(warId: string) {
    const s = this.state;
    const war = s.wars.find((w) => w.id === warId);
    if (!war) return;
    const enemy = enemyLeader(war, s.player);
    const sc = scoreFor(war, s.player);
    const occ = annexable(s, war, s.player).sort((a, b) => this.world.provinces[b].dev - this.world.provinces[a].dev);
    const nuclear = s.nations[enemy].nuclear;
    const html = `${scoreBar(sc)}<p style="text-align:center">Score disponible : <b class="${cls(sc)}">${signed(sc)}</b></p>
      ${sc > 0 ? `<h3>Exigences</h3>
        ${nuclear ? '<p class="muted">☢ Puissance nucléaire : aucune annexion possible.</p>' : occ.length ? occ.map((pid) => {
          const info = this.world.provinces[pid];
          return `<label class="check"><input type="checkbox" data-a="peaceToggle" data-k="annex" value="${pid}"><span>Annexer ${esc(info.name)}<br><small class="muted">dév. ${info.dev} · ${RELIGIONS[s.provinces[pid].religion].icon} ${GOODS[info.good].icon} · coût ${termsCost(s, this.world, enemy, { annex: [pid], satellite: false, reparations: false })}</small></span></label>`;
        }).join('') : '<p class="muted">Aucune province ennemie occupée : poursuivez l’offensive.</p>'}
        <label class="check"><input type="checkbox" data-a="peaceToggle" data-k="satellite"><span>Satelliser (rejoint votre bloc) · 50</span></label>
        <label class="check"><input type="checkbox" data-a="peaceToggle" data-k="reparations"><span>Réparations de guerre · 15</span></label>
        <p>Coût total : <b id="peaceCost">0</b> / ${num(Math.max(0, sc))}</p>` : `<p class="muted">Vous n'êtes pas en position d'exiger quoi que ce soit.</p>
        <p>Si vous capitulez, ${esc(nm(s, enemy))} imposera : ${esc(describeTerms(s, this.world, aiTerms(s, this.world, war, enemy)))}.</p>`}`;
    this.modal(`Paix avec ${esc(nm(s, enemy))}`, html, [
      ...(sc > 0 ? [{ label: 'Proposer ces conditions', a: 'peaceSend', p: war.id, primary: true }] : []),
      { label: 'Proposer une paix blanche', a: 'peaceWhite', p: war.id },
      ...(sc < 0 ? [{ label: 'Capituler', hint: 'Accepter leurs conditions', a: 'surrender', p: war.id }] : []),
      { label: 'Annuler', a: 'closeModal' },
    ]);
  }

  private readTerms(): PeaceTerms {
    const boxes = [...this.el.overlay.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    return {
      annex: boxes.filter((b) => b.dataset.k === 'annex' && b.checked).map((b) => Number(b.value)),
      satellite: boxes.some((b) => b.dataset.k === 'satellite' && b.checked),
      reparations: boxes.some((b) => b.dataset.k === 'reparations' && b.checked),
    };
  }

  private updatePeaceCost() {
    const s = this.state;
    const war = s.wars.find((w) => this.el.overlay.querySelector(`[data-p="${w.id}"]`));
    const out = this.el.overlay.querySelector('#peaceCost');
    if (!war || !out) return;
    const cost = termsCost(s, this.world, enemyLeader(war, s.player), this.readTerms());
    out.textContent = String(cost);
    out.className = cost > scoreFor(war, s.player) ? 'neg' : 'pos';
  }

  private sendPeace(warId: string, white: boolean) {
    const s = this.state;
    const war = s.wars.find((w) => w.id === warId);
    if (!war) return;
    const terms: PeaceTerms = white ? { annex: [], satellite: false, reparations: false } : this.readTerms();
    if (aiAcceptsPeace(s, this.world, war, s.player, terms)) {
      applyPeace(s, this.world, war, s.player, terms);
      this.closeModal();
      this.toast('Traité de paix signé !', 'good');
    } else this.toast(`${nm(s, enemyLeader(war, s.player))} rejette vos conditions.`, 'bad');
    this.renderAll();
  }

  private toast(text: string, kind = '', action?: () => void) {
    const t = document.createElement('div');
    t.className = `toast ${kind} ${action ? 'clickable' : ''}`;
    const msg = document.createElement('span');
    msg.textContent = text;
    colorSigns(msg);
    t.appendChild(msg);
    if (action) {
      const go = document.createElement('span');
      go.className = 'go';
      go.textContent = '›';
      t.appendChild(go);
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        t.remove();
        this.setSpeed(0); // toucher une notification met le jeu en pause
        action();
      });
    }
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 2) this.el.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), action ? 6000 : 4000);
  }

  /** Notification tirée du journal : emoji selon le thème, et un toucher mène à l'écran concerné. */
  private notify(l: import('../game/types').LogEntry) {
    const icons: Record<string, string> = { war: '⚔️', diplo: '🤝', trade: '💼', religion: '🕊️', info: 'ℹ️', event: '📣' };
    const text = /^\p{Extended_Pictographic}/u.test(l.text) ? l.text : `${icons[l.kind] ?? '📣'} ${l.text}`;
    const low = l.text.toLowerCase();
    let action: () => void;
    if (low.includes('offre')) action = () => this.showContracts('offers');
    else if (low.includes('contrat') || low.includes('achat') || low.includes('cargaison') || low.includes('convoi')) action = () => this.showContracts('active');
    else if (low.includes('chantier') || low.includes('modernisation') || low.includes('gisement') || low.includes('produit désormais')) action = () => this.openCountry('provs');
    else if (low.includes('mission')) action = () => this.showObjectives();
    else if (l.kind === 'war') action = () => (warsOf(this.state, this.state.player).length ? this.showLedger('wars') : this.showLog());
    else if (l.kind === 'religion') action = () => this.openCountry('faith');
    else if (l.kind === 'diplo') action = () => this.openCountry('diplo');
    else action = () => this.showLog();
    this.toast(text, l.kind === 'war' ? 'bad' : '', action);
  }
}

/** Remplace le contenu uniquement s'il a changé (évite de recréer les boutons). */
const lastHtml = new WeakMap<Element, string>();
function patch(el: Element, html: string) {
  if (lastHtml.get(el) === html) return;
  lastHtml.set(el, html);
  el.innerHTML = html;
  colorSigns(el);
}

function stat(label: string, value: string) {
  return `<div class="stat"><small>${label}</small><b>${value}</b></div>`;
}

function costLabel(c: A.Cost): string {
  const p: string[] = [];
  if (c.money) p.push(`💰${money(c.money)}`);
  if (c.influence) p.push(`🤝${c.influence}`);
  if (c.fervor) p.push(`🔥${c.fervor}`);
  return p.join(' ') || 'Gratuit';
}

function scoreBar(sc: number) {
  const w = Math.abs(sc) / 2;
  const left = sc >= 0 ? 50 : 50 - w;
  return `<div class="scorebar"><i style="left:${left}%;width:${w}%;background:${sc >= 0 ? 'var(--good)' : 'var(--bad)'}"></i><i style="left:50%;width:2px;background:#fff"></i></div>`;
}

