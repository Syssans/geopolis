import * as A from '../game/actions';
import { aiTerms, describeTerms } from '../game/ai';
import { resolveEvent } from '../game/events';
import { fervorGain, holySitesOf, missionSpeed, POLICIES, unrestTarget } from '../game/religion';
import { createGame, SAVE_VERSION } from '../game/setup';
import {
  alive, dateLabel, devOf, hasTrade, embargoes, inReach, neighbours, nm, owned, popOf, power, powerRank, rel, sameBloc,
  warBetween, warsOf, desecratedHolySites,
} from '../game/state';
import { advanceMonth } from '../game/tick';
import { computeTrade, homeNode, NODES, production, straitClosed, straitOwner, TOLL, type TradeReport } from '../game/trade';
import type { GameState, Id, PeaceTerms, Pid, Policy, War, World } from '../game/types';
import {
  aiAcceptsPeace, annexable, applyPeace, canDeclareWar, enemyLeader, isLeader, scoreFor, termsCost,
} from '../game/war';
import { RELIGIONS, type Religion } from '../data/religions';
import { GOODS, STRAITS, TRADE_NODES } from '../data/trade';
import type { Topology } from 'topojson-specification';
import { cls, esc, money, num, pct, pop, signed } from './format';
import { MapView, type MapMode } from './map';

const SAVE_KEY = 'geopolis-save-v2';
const SPEEDS = [0, 1600, 800, 350, 150]; // ms par mois
const MODES: { id: MapMode; icon: string; name: string; legend: string }[] = [
  { id: 'political', icon: '🗺️', name: 'Politique', legend: 'Nations' },
  { id: 'religion', icon: '🕊️', name: 'Religions', legend: 'Religion de chaque province' },
  { id: 'trade', icon: '⚓', name: 'Commerce', legend: 'Nœuds commerciaux, flux et détroits (⚓ rouge = fermé)' },
  { id: 'diplomatic', icon: '🤝', name: 'Diplomatie', legend: 'Or = vous · bleu = bloc · rouge = guerre' },
  { id: 'unrest', icon: '🔥', name: 'Agitation', legend: 'Agitation religieuse et insurrections' },
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

  constructor(private root: HTMLElement, private world: World, topo: Topology) {
    this.map = new MapView(root, topo, world);
    this.map.onSelect = (pid) => this.onMapTap(pid);
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
    if (v > 0) this.lastSpeed = v;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (v > 0 && this.s && !this.s.gameOver) this.timer = window.setInterval(() => this.tick(), SPEEDS[v]);
    this.renderHud();
  }

  private tick() {
    const s = this.state;
    if (s.events.length || s.gameOver) {
      this.setSpeed(0);
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
    for (const l of fresh.reverse()) if (l.mine) this.toast(l.text, l.kind === 'war' ? 'bad' : '');
    if (s.month === 1) this.save(true);
    if (s.events.length || s.gameOver) this.setSpeed(0);
    this.renderAll();
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
          <span>${esc(n.name)} ${n.nuclear ? '☢' : ''}<br><small>${RELIGIONS[n.religion].icon} ${RELIGIONS[n.religion].name} · ${owned(preview, n.id).length} prov. · dév. ${d}${n.bloc ? ' · ' + esc(preview.blocs[n.bloc].name) : ''}</small></span>
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
      esc(n.name),
      `<div class="stats">
        ${stat('Religion', `${RELIGIONS[n.religion].icon} ${RELIGIONS[n.religion].name}`)}${stat('Provinces', String(owned(s, id).length))}
        ${stat('Revenus / mois', money(inc.production + inc.trade + inc.tolls))}${stat('Productions', goods)}
        ${stat('Bloc', n.bloc ? esc(s.blocs[n.bloc].name) : 'Non-aligné')}${stat('Puissance', `#${powerRank(s, id)}${n.nuclear ? ' ☢' : ''}`)}
      </div>
      <p class="muted">Voisins : ${neighbours(s, this.world, id).map((x) => esc(nm(s, x))).join(', ') || 'aucun'}</p>`,
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
      this.toast(`Vous dirigez ${this.state.nations[id].name}. Appuyez sur ▶ pour lancer le temps.`, 'good');
    };
    h.closeModal = () => this.closeModal();
    h.speed = (v) => this.setSpeed(Number(v));
    h.toggle = () => this.setSpeed(this.speed ? 0 : this.lastSpeed);
    h.mode = (m) => {
      this.mode = m as MapMode;
      this.renderAll();
    };
    h.me = () => {
      const cap = owned(s(), me()).sort((a, b) => this.world.provinces[b].dev - this.world.provinces[a].dev)[0];
      this.select(cap ?? null, 'trade');
    };
    h.close = () => this.select(null);
    h.tab = (t) => {
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
    h.ledger = (t) => this.showLedger(t || 'trade');
    h.goto = (pid) => {
      this.closeModal();
      this.select(Number(pid));
      this.map.focus([Number(pid)], 10, true);
    };
    h.gotoNation = (id) => {
      this.closeModal();
      const p = owned(s(), id).sort((a, b) => this.world.provinces[b].dev - this.world.provinces[a].dev)[0];
      if (p !== undefined) {
        this.select(p, 'nation');
        this.map.focus(owned(s(), id), 6, true);
      }
    };
    h.event = (p) => {
      const [uid, opt] = p.split(':').map(Number);
      const msg = resolveEvent(s(), this.world, uid, opt);
      this.closeModal();
      if (msg) this.toast(msg);
      this.renderAll();
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
    h.merchantNode = (v) => {
      const [slot, node] = v.split('|');
      this.run(A.setMerchant(s(), this.world, me(), Number(slot), node === '' ? null : node, 'steer'));
    };
    h.merchantMode = (v) => {
      const [slot, mode] = v.split(':');
      const m = this.me.merchants[Number(slot)];
      if (m) this.run(A.setMerchant(s(), this.world, me(), Number(slot), m.node, mode as 'collect' | 'steer', m.target));
    };
    h.merchantTarget = (v) => {
      const [slot, target] = v.split('|');
      const m = this.me.merchants[Number(slot)];
      if (m) this.run(A.setMerchant(s(), this.world, me(), Number(slot), m.node, 'steer', target));
    };
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
    if (this.s) this.select(pid);
  }

  private select(pid: Pid | null, tab?: string) {
    const prev = this.selected;
    this.selected = pid;
    if (tab) this.tab = tab;
    else if (pid !== null && pid !== prev) this.tab = 'prov';
    this.renderAll(true);
  }

  // ————————————————————————————— Rendu —————————————————————————————

  private renderAll(resetScroll = false) {
    if (!this.s) return;
    this.map.render(this.s, this.mode, this.selected);
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
    const net = inc.production + inc.trade + inc.tolls - inc.upkeep;
    if (!this.el.hud.firstChild)
      this.el.hud.innerHTML = `<button class="me chip" data-a="me"></button><div class="res"></div>
        <div class="time"><span class="date"></span><div class="speed"></div></div>`;
    const q = (sel: string) => this.el.hud.querySelector<HTMLElement>(sel)!;
    patch(q('.me'), `<i class="dot" style="background:${me.color}"></i>${esc(me.name)}`);
    patch(
      q('.res'),
      `<span class="chip ${me.treasury < 0 ? 'neg' : ''}" title="Trésor (solde mensuel)">💰 <b>${money(me.treasury)}</b> <small class="${cls(net)}">${net >= 0 ? '+' : ''}${money(net)}</small></span>
        <span class="chip" title="Influence">🤝 <b>${Math.floor(me.influence)}</b></span>
        <span class="chip" title="Ferveur">🔥 <b>${Math.floor(me.fervor)}</b></span>
        <span class="chip ${me.stability < 35 ? 'neg' : ''}" title="Stabilité">⚖️ <b>${num(me.stability)}</b></span>`,
    );
    patch(q('.date'), dateLabel(s));
    patch(
      q('.speed'),
      `<button class="${this.speed === 0 ? 'on' : ''}" data-a="toggle" aria-label="Pause">${this.speed === 0 ? '▶' : '⏸'}</button>
       ${[1, 2, 3, 4].map((v) => `<button class="${this.speed === v ? 'on' : ''}" data-a="speed" data-p="${v}">${'›'.repeat(v)}</button>`).join('')}`,
    );
    const wars = warsOf(s, s.player);
    patch(
      this.el.wars,
      wars
        .map((w) => {
          const sc = scoreFor(w, s.player);
          return `<button class="warchip" data-a="war" data-p="${w.id}">${w.holy ? '☪✝' : '⚔️'} ${esc(nm(s, enemyLeader(w, s.player)))} · <b class="${cls(sc)}">${signed(sc)}</b></button>`;
        })
        .join(''),
    );
    const t = s.tension;
    patch(this.el.tension, `Tension mondiale ${num(t)}%<div class="bar"><i style="width:${t}%"></i></div>`);
    const unread = s.log.length - this.seenLog;
    patch(
      this.el.bottom,
      `<div class="modes">${MODES.map((m) => `<button class="${this.mode === m.id ? 'on' : ''}" data-a="mode" data-p="${m.id}" title="${m.name}">${m.icon}</button>`).join('')}</div>
      <span class="spacer"></span>
      <button class="fab" data-a="ledger" title="Classements">📊</button>
      <button class="fab" data-a="log" title="Journal">📰${unread > 0 ? `<span class="badge">${Math.min(unread, 99)}</span>` : ''}</button>
      <button class="fab" data-a="menu" title="Menu">☰</button>`,
    );
    this.root.style.setProperty('--hud-h', `${this.el.hud.offsetHeight}px`);
    patch(this.el.legend, `<b>${MODES.find((m) => m.id === this.mode)!.name}</b> · ${MODES.find((m) => m.id === this.mode)!.legend}`);
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
    const tabs = mine
      ? [['prov', 'Province'], ['trade', 'Commerce'], ['faith', 'Religion'], ['army', 'Armée'], ['diplo', 'Diplo.']]
      : [['prov', 'Province'], ['nation', n.name.length > 12 ? 'Nation' : n.name]];
    if (!tabs.some(([k]) => k === this.tab)) this.tab = 'prov';
    const content =
      this.tab === 'prov' ? this.provinceTab(pid)
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
    patch(sheet.querySelector('h2')!, `${esc(info.name)} <small class="muted">· ${esc(n.name)}</small>`);
    const b = sheet.querySelector<HTMLElement>('.body')!;
    patch(
      b,
      `<div class="tabs">${tabs.map(([k, l]) => `<button class="${this.tab === k ? 'on' : ''}" data-a="tab" data-p="${k}">${esc(l)}</button>`).join('')}</div>${content}`,
    );
    sheet.classList.add('open');
    b.scrollTop = scroll;
  }

  private action(a: string, title: string, cost: A.Cost | string, extra: { disabled?: string; danger?: boolean; wide?: boolean; p?: string } = {}) {
    const s = this.state;
    const costTxt = typeof cost === 'string' ? cost : costLabel(cost);
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
    let html = `<div class="badges">${badges.join('')}</div>
      <div class="stats">
        ${stat('Développement', String(info.dev))}
        ${stat('Population', pop(info.pop))}
        ${stat('Production', `${good.icon} ${good.name}`)}
        ${stat('Valeur / mois', `${money(production(s, this.world, pid))} <small class="${cls(price - 1)}">${price >= 1 ? '+' : ''}${num((price - 1) * 100)} %</small>`)}
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
        <button class="act" data-a="tab" data-p="nation"><span class="t">Diplomatie avec ${esc(owner.name)}</span><span class="c">Relations ${signed(rel(s, me.id, owner.id))}</span></button>
      </div>`;
    }
    return html;
  }

  // ——— Onglet commerce ———
  private tradeTab(): string {
    const s = this.state;
    const me = this.me;
    const inc = me.income;
    const net = inc.production + inc.trade + inc.tolls - inc.upkeep;
    const report = this.trade();
    const home = homeNode(s, this.world, me.id);
    const slots = A.merchantSlots(s, me.id);
    const reach = A.merchantNodes(s, this.world, me.id);
    const nodeName = (id: string) => NODES.get(id)!.name;
    const merchants = Array.from({ length: slots }, (_, i) => {
      const m = me.merchants[i];
      const opts = `<option value="">— Disponible —</option>${reach.map((n) => `<option value="${n}" ${m?.node === n ? 'selected' : ''}>${esc(nodeName(n))}</option>`).join('')}`;
      let extra = '';
      if (m) {
        const def = NODES.get(m.node)!;
        extra = `<div class="seg">
          <button class="${m.mode === 'collect' ? 'on' : ''}" data-a="merchantMode" data-p="${i}:collect">Collecter</button>
          ${def.out.length ? `<button class="${m.mode === 'steer' ? 'on' : ''}" data-a="merchantMode" data-p="${i}:steer">Orienter</button>` : ''}
        </div>
        ${m.mode === 'steer' && def.out.length > 1 ? `<select data-c="merchantTarget" data-p="${i}">${def.out.map((o) => `<option value="${o}" ${m.target === o ? 'selected' : ''}>vers ${esc(nodeName(o))}</option>`).join('')}</select>` : m.mode === 'steer' ? `<small class="muted">vers ${esc(nodeName(def.out[0]))}</small>` : ''}`;
      }
      return `<div class="merchant"><span>🧑‍💼 ${i + 1}</span><select data-c="merchantNode" data-p="${i}">${opts}</select>${extra}</div>`;
    }).join('');
    const nodes = Object.entries(inc.byNode).sort((a, b) => b[1] - a[1]);
    const presence = TRADE_NODES.filter((n) => (report.nodes[n.id]?.power[me.id] ?? 0) > 0).map((n) => {
      const r = report.nodes[n.id];
      const share = (r.power[me.id] ?? 0) / (r.total || 1);
      return `<div class="row"><span>${esc(n.name)}${n.id === home ? ' 🏠' : ''}${r.collectors.includes(me.id) ? ' <small class="pos">collecte</small>' : ' <small class="muted">oriente</small>'}</span><span>${money(r.value)} · ${num(share * 100)} %</span></div>`;
    });
    return `<div class="stats">
        ${stat('Production', money(inc.production))}${stat('Commerce', money(inc.trade))}${stat('Péages', money(inc.tolls))}
        ${stat('Entretien forces', `<span class="neg">−${money(inc.upkeep)}</span>`)}${stat('Solde / mois', `<span class="${cls(net)}">${money(net)}</span>`)}${stat('Nœud domicile', esc(home ? nodeName(home) : '—'))}
      </div>
      <h3>Marchands (${me.merchants.length}/${slots})</h3>
      <p class="muted" style="font-size:12px">Collecter : prendre sa part de la richesse d’un nœud. Orienter : pousser la richesse vers l’aval, jusqu’à votre nœud domicile où vous collectez automatiquement.</p>
      <div class="merchants">${merchants}</div>
      <h3>Revenus commerciaux par nœud</h3><div class="rows">${nodes.map(([id, v]) => `<div class="row"><span>${esc(nodeName(id))}</span><span class="pos">+${money(v)}</span></div>`).join('') || '<p class="muted">Aucun.</p>'}</div>
      <h3>Présence commerciale (valeur · votre part)</h3><div class="rows">${presence.join('')}</div>
      <h3>Cours mondiaux</h3><div class="goods">${Object.entries(GOODS).map(([g, d]) => {
        const p = s.prices[g] ?? 1;
        return `<span class="chip">${d.icon} ${d.name} <b class="${cls(p - 1)}">${p >= 1 ? '+' : ''}${num((p - 1) * 100)} %</b></span>`;
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
        ${me.claims.map((c) => `<div class="row"><span>${esc(nm(s, c))}</span><span class="pos">Prêt</span></div>`).join('')}
        ${me.holyClaims.map((c) => `<div class="row"><span>${esc(nm(s, c))}</span><span class="pos">Guerre sainte</span></div>`).join('')}
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
  private ownDiplo(): string {
    const s = this.state;
    const me = this.me;
    const bloc = me.bloc ? s.blocs[me.bloc] : null;
    const rels = alive(s).filter((o) => o.id !== me.id).map((o) => ({ o, r: rel(s, me.id, o.id) }));
    const line = (x: { o: { id: Id; name: string }; r: number }) =>
      `<div class="row" data-a="gotoNation" data-p="${esc(x.o.id)}" style="cursor:pointer"><span>${RELIGIONS[s.nations[x.o.id].religion].icon} ${esc(x.o.name)}</span><span class="${cls(x.r)}">${signed(x.r)}</span></div>`;
    const emb = s.embargoes.filter((k) => k.endsWith(`>${me.id}`)).map((k) => nm(s, k.split('>')[0]));
    return `<h3>Bloc</h3>
      ${bloc ? `<div class="rows"><div class="row"><span>${esc(bloc.name)} · meneur : ${esc(nm(s, bloc.leader))}</span><span>${bloc.members.length} membres</span></div></div>
        <div class="actions" style="margin-top:6px">${this.action('quitBloc', 'Quitter le bloc', 'Stabilité −5', { danger: true, wide: true })}</div>`
        : '<p class="muted">Non-aligné. Touchez un pays pour proposer une alliance ou rejoindre son bloc.</p>'}
      <h3>Échanges</h3><div class="rows">
        <div class="row"><span>Accords commerciaux</span><span>${s.trades.filter((k) => k.split('|').includes(me.id)).length}</span></div>
        <div class="row"><span>Embargos subis</span><span class="${emb.length ? 'neg' : ''}">${emb.length ? esc(emb.join(', ')) : 'aucun'}</span></div></div>
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
    if (trade) badges.push('<span class="badge-i ally">Accord commercial</span>');
    if (emb) badges.push('<span class="badge-i war">Sous votre embargo</span>');
    if (embargoes(s, id, me.id)) badges.push('<span class="badge-i war">Vous impose un embargo</span>');
    for (const w of warsOf(s, id)) badges.push(`<span class="badge-i war">⚔️ ${esc(w.name)}</span>`);
    return `<div class="badges">${badges.join('')}</div>
      <div class="row" style="border:0"><span>Relations avec vous</span><b class="${cls(r)}">${signed(r)}</b></div>
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
    o.innerHTML = `<div class="modal" role="dialog"><header><h2>${title}</h2></header><div class="content">${html}</div>
      <footer>${buttons.map((b) => `<button class="btn ${b.primary ? 'primary' : ''}" data-a="${b.a}" ${b.p ? `data-p="${esc(b.p)}"` : ''} ${b.disabled ? 'disabled' : ''}>${b.label}${b.hint ? `<small>${b.hint}</small>` : ''}</button>`).join('')}</footer></div>`;
  }

  private closeModal() {
    this.el.overlay.style.display = 'none';
    this.el.overlay.innerHTML = '';
    if (this.s && !this.picking) this.renderEvents();
  }

  private showHelp() {
    this.modal(
      'Comment jouer',
      `<p>Vous dirigez une nation à partir de janvier 2026. Le temps s'écoule mois par mois : <b>▶</b> lance ou met en pause, <b>›››</b> règle la vitesse. Touchez une province pour agir.</p>
      <p><b>Trois ressources</b> : 💰 le trésor (production + commerce − entretien des forces), 🤝 l'influence (diplomatie) et 🔥 la ferveur (religion).</p>
      <p><b>Commerce</b> : chaque province produit une marchandise dont la valeur entre dans un <b>nœud commercial</b>. La richesse coule d'amont en aval vers trois grands pôles : Manche, New York et Shanghai. Vous collectez automatiquement dans votre nœud domicile ; envoyez vos <b>marchands</b> orienter les flux vers lui ou collecter ailleurs. Votre flotte renforce votre poids dans les nœuds côtiers.</p>
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
      { label: 'Sauvegarder', a: 'save' },
      { label: 'Comment jouer', a: 'help' },
      { label: 'Quitter vers le menu', a: 'quit' },
    ]);
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
      `<div class="row" data-a="gotoNation" data-p="${esc(id)}" style="cursor:pointer;${id === s.player ? 'color:var(--gold)' : ''}"><span>${i + 1}. ${esc(nm(s, id))}</span><span>${v}</span></div>`;
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
        ? s.wars.map((w) => `<div class="row"><span>${esc(w.name)}<br><small class="muted">${w.attackers.map((x) => esc(nm(s, x))).join(', ')} ⚔ ${w.defenders.map((x) => esc(nm(s, x))).join(', ')}</small></span><span class="${cls(w.score)}">${signed(w.score)}</span></div>`).join('')
        : '<p class="muted">Le monde est en paix… pour l’instant.</p>';
    } else {
      html += Object.values(s.blocs).map((b) => `<h3 style="color:${b.color}">${esc(b.name)} (${b.members.length})</h3><p class="muted" style="font-size:12px">Meneur : ${esc(nm(s, b.leader))} — ${b.members.map((m) => esc(nm(s, m))).join(', ')}</p>`).join('');
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
    const side = (ids: Id[]) => ids.map((x, i) => `<div class="row"><span>${i === 0 ? '★ ' : ''}${esc(nm(s, x))}</span><span>${num(power(s.nations[x]), 0)}</span></div>`).join('');
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

  private toast(text: string, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), 4000);
  }
}

/** Remplace le contenu uniquement s'il a changé (évite de recréer les boutons). */
const lastHtml = new WeakMap<Element, string>();
function patch(el: Element, html: string) {
  if (lastHtml.get(el) === html) return;
  lastHtml.set(el, html);
  el.innerHTML = html;
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

