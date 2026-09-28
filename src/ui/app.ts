import * as A from '../game/actions';
import { aiTerms, describeTerms } from '../game/ai';
import { resolveEvent } from '../game/events';
import { createGame, SAVE_VERSION } from '../game/setup';
import {
  alive, budget, dateLabel, gdpOf, growthBreakdown, growthOf, hasTrade, inReach, neighbours, nm, ownedTerritories,
  popOf, power, powerRank, rel, sameBloc, sanctions, warBetween, warsOf,
} from '../game/state';
import { advanceMonth } from '../game/tick';
import type { GameState, Id, PeaceTerms, War, World } from '../game/types';
import type { CountryFeature } from '../game/world';
import {
  aiAcceptsPeace, applyPeace, canDeclareWar, enemyLeader, isLeader, scoreFor, termsCost,
} from '../game/war';
import { cls, esc, money, num, pct, pop, signed } from './format';
import { MapView, type MapMode } from './map';

const SAVE_KEY = 'geopolis-save';
const SPEEDS = [0, 1600, 800, 350, 120]; // ms par mois
const MODES: { id: MapMode; icon: string; name: string }[] = [
  { id: 'political', icon: '🗺️', name: 'Politique' },
  { id: 'diplomatic', icon: '🤝', name: 'Diplomatie' },
  { id: 'blocs', icon: '🛡️', name: 'Blocs' },
  { id: 'economic', icon: '💰', name: 'Économie (PIB/hab.)' },
  { id: 'military', icon: '⚔️', name: 'Puissance militaire' },
];

type Handler = (arg: string) => void;

export class App {
  private s: GameState | null = null;
  private map: MapView;
  private mode: MapMode = 'political';
  private selected: Id | null = null; // territoire sélectionné
  private tab = 'eco';
  private speed = 0;
  private lastSpeed = 2;
  private timer: number | null = null;
  private seenLog = 0;
  private picking = false;
  private handlers: Record<string, Handler> = {};
  private touching = false;
  private dirty = false;
  private el: Record<string, HTMLElement> = {};

  constructor(private root: HTMLElement, private world: World, features: CountryFeature[]) {
    this.map = new MapView(root, features);
    this.map.onSelect = (id) => this.onMapTap(id);
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
    this.registerHandlers();
    this.showTitle();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.s) this.save(true);
    });
  }

  // ————————————————————————————— Cycle de jeu —————————————————————————————

  private get state(): GameState {
    return this.s!;
  }

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
    const before = s.log.length ? s.log[0] : null;
    advanceMonth(s, this.world);
    // Notifications : entrées du journal apparues pendant ce mois et qui nous concernent
    const fresh = [];
    for (const l of s.log) {
      if (l === before) break;
      fresh.push(l);
    }
    for (const l of fresh.reverse())
      if (l.mine || l.kind === 'war') this.toast(l.text, l.kind === 'war' ? 'bad' : '');
    if (s.month === 1) this.save(true);
    if (s.events.length || s.gameOver) this.setSpeed(0);
    this.renderAll();
  }

  private start(s: GameState) {
    this.s = s;
    this.selected = null;
    for (const k of ['hud', 'wars', 'tension', 'bottom', 'legend']) this.el[k].style.display = '';
    this.el.title.style.display = 'none';
    this.el.picker.style.display = 'none';
    this.picking = false;
    this.renderAll();
    this.map.focus([s.player], 6);
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
      return s.version === SAVE_VERSION ? s : null;
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
      <p>Grande stratégie géopolitique · 2026</p>
      ${hasSave ? `<button class="btn primary" data-a="continue">Continuer la partie</button>` : ''}
      <button class="btn ${hasSave ? '' : 'primary'}" data-a="newgame">Nouvelle partie</button>
      <button class="btn" data-a="help">Comment jouer</button>`;
  }

  private showPicker(filter = '') {
    this.picking = true;
    this.el.title.style.display = 'none';
    const preview = this.s ?? createGame(this.world, 'France', 1);
    if (!this.s) {
      this.s = preview;
      this.map.render(preview, 'political', null);
    }
    const list = alive(preview)
      .map((n) => ({ n, g: gdpOf(preview, n.id) }))
      .filter((x) => x.n.name.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => b.g - a.g);
    const diff = (g: number) =>
      g > 1500 ? ['Facile', 'var(--good)'] : g > 150 ? ['Moyen', 'var(--warn)'] : ['Difficile', 'var(--bad)'];
    const p = this.el.picker;
    p.style.display = '';
    const listHtml = list
      .map(({ n, g }) => {
        const [d, c] = diff(g);
        return `<button class="pick" data-a="pick" data-p="${esc(n.id)}"><i class="dot" style="background:${n.color}"></i>
          <span>${esc(n.name)} ${n.nuclear ? '☢' : ''}<br><small>${money(g)} · ${pop(popOf(preview, n.id))}${n.bloc ? ' · ' + esc(preview.blocs[n.bloc].name) : ''}</small></span>
          <em class="diff" style="color:${c};border-color:${c}">${d}</em></button>`;
      })
      .join('');
    if (!p.querySelector('input')) {
      p.innerHTML = `<div class="top"><h2>Choisissez votre nation</h2>
        <input type="search" placeholder="Rechercher un pays… (ou touchez la carte)" data-i="filter"></div><div class="list"></div>`;
    }
    p.querySelector('.list')!.innerHTML = listHtml;
  }

  private confirmPick(id: Id) {
    const s = this.s!;
    const n = s.nations[id];
    this.map.focus([id], 5);
    this.modal(
      n.name,
      `<div class="stats">
        ${stat('PIB', money(gdpOf(s, id)))}${stat('Population', pop(popOf(s, id)))}
        ${stat('Stabilité', num(n.stability))}${stat('Puissance', `#${powerRank(s, id)}`)}
        ${stat('Bloc', n.bloc ? esc(s.blocs[n.bloc].name) : 'Non-aligné')}${stat('Nucléaire', n.nuclear ? 'Oui ☢' : 'Non')}
      </div>
      <p class="muted">Voisins : ${neighbours(s, this.world, id).map((x) => esc(nm(s, x))).join(', ') || 'aucun (insulaire)'}</p>`,
      [
        { label: `Diriger ${esc(n.name)}`, a: 'play', p: id, primary: true },
        { label: 'Choisir un autre pays', a: 'closeModal' },
      ],
    );
  }

  // ————————————————————————————— Actions UI —————————————————————————————

  private registerHandlers() {
    const h = this.handlers;
    h.newgame = () => {
      this.s = null;
      this.showPicker();
    };
    h.continue = () => {
      const s = this.loadSave();
      if (s) this.start(s);
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
    h.me = () => this.select(ownedTerritories(this.state, this.state.player)[0]?.id ?? null);
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
    h.ledger = (t) => this.showLedger(t || 'gdp');
    h.goto = (id) => {
      this.closeModal();
      this.select(id);
    };
    h.event = (p) => {
      const [uid, opt] = p.split(':').map(Number);
      const msg = resolveEvent(this.state, uid, opt);
      this.closeModal();
      if (msg) this.toast(msg);
      this.renderAll();
    };
    h.war = (id) => this.showWar(id);
    h.peace = (id) => this.showPeace(id);
    h.peaceToggle = () => this.updatePeaceCost();
    h.peaceSend = (warId) => this.sendPeace(warId, false);
    h.peaceWhite = (warId) => this.sendPeace(warId, true);
    h.surrender = (warId) => {
      const s = this.state;
      const war = s.wars.find((w) => w.id === warId);
      if (!war) return;
      const winner = enemyLeader(war, s.player);
      applyPeace(s, war, winner, aiTerms(s, war, winner));
      this.closeModal();
      this.renderAll();
    };
    h.declare = (id) => this.confirmWar(id);
    h.declareGo = (id) => {
      this.closeModal();
      this.run(A.warAction(this.state, this.world, this.state.player, id));
    };
    h.milBudget = (v) => {
      A.setMilitaryBudget(this.state, this.state.player, Number(v));
      const out = this.el.sheet.querySelector('#milv');
      if (out) out.textContent = pct(Number(v), 1, false);
    };

    const me = () => this.state.player;
    const target = () => this.state.territories[this.selected!]?.owner;
    const s = () => this.state;
    const acts: Record<string, () => A.ActionResult> = {
      reform: () => A.reform(s(), me()),
      stabilize: () => A.stabilize(s(), me()),
      invest: () => A.invest(s(), me()),
      modernize: () => A.modernize(s(), me()),
      mobilize: () => A.mobilize(s(), me()),
      nuke: () => A.startNuclearProgram(s(), me()),
      quitBloc: () => A.quitBloc(s(), me()),
      improve: () => A.improveRelations(s(), me(), target()),
      trade: () => A.signTrade(s(), me(), target()),
      untrade: () => A.cancelTrade(s(), me(), target()),
      sanction: () => A.toggleSanctions(s(), me(), target()),
      aid: () => A.sendAid(s(), me(), target()),
      alliance: () => A.proposeAlliance(s(), me(), target()),
      joinBloc: () => A.requestJoinBloc(s(), me(), target()),
      claim: () => A.fabricateClaim(s(), this.world, me(), target()),
      destab: () => A.destabilize(s(), me(), target()),
    };
    for (const [k, fn] of Object.entries(acts)) h[k] = () => this.run(fn());
    h.integrate = (tid) => this.run(A.integrate(s(), me(), tid));
  }

  private run(r: A.ActionResult) {
    this.toast(r.msg, r.ok ? 'good' : 'bad');
    this.renderAll();
  }

  private onMapTap(id: Id | null) {
    if (this.picking) {
      const owner = id && this.s?.territories[id]?.owner;
      if (owner) this.confirmPick(owner);
      return;
    }
    if (!this.s) return;
    this.select(id);
  }

  private select(id: Id | null) {
    const s = this.state;
    if (id && !s.territories[id]) id = null;
    const prevOwner = this.selected ? s.territories[this.selected]?.owner : null;
    this.selected = id;
    const owner = id ? s.territories[id].owner : null;
    if (owner && owner !== prevOwner) this.tab = owner === s.player ? 'eco' : 'diplo';
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
    const b = budget(s, s.player);
    if (!this.el.hud.firstChild)
      this.el.hud.innerHTML = `<button class="me chip" data-a="me"></button><div class="res"></div>
        <div class="time"><span class="date"></span><div class="speed"></div></div>`;
    const q = (sel: string) => this.el.hud.querySelector<HTMLElement>(sel)!;
    patch(q('.me'), `<i class="dot" style="background:${me.color}"></i>${esc(me.name)}`);
    patch(
      q('.res'),
      `<span class="chip ${me.treasury < 0 ? 'neg' : ''}" title="Trésor (solde mensuel)">💰 <b>${money(me.treasury)}</b> <small class="${cls(b.net)}">${b.net >= 0 ? '+' : ''}${money(b.net)}</small></span>
        <span class="chip" title="Capital politique">🏛️ <b>${Math.floor(me.points.pol)}</b></span>
        <span class="chip" title="Influence diplomatique">🕊️ <b>${Math.floor(me.points.dip)}</b></span>
        <span class="chip" title="Doctrine militaire">🎖️ <b>${Math.floor(me.points.mil)}</b></span>
        <span class="chip ${me.stability < 35 ? 'neg' : ''}" title="Stabilité">⚖️ <b>${num(me.stability)}</b></span>`,
    );
    patch(q('.date'), dateLabel(s));
    patch(
      q('.speed'),
      `<button class="${this.speed === 0 ? 'on' : ''}" data-a="toggle" aria-label="Pause">${this.speed === 0 ? '▶' : '⏸'}</button>
          ${[1, 2, 3, 4].map((v) => `<button class="${this.speed === v ? 'on' : ''}" data-a="speed" data-p="${v}">${'›'.repeat(v)}</button>`).join('')}`,
    );
    const wars = warsOf(s, s.player);
    patch(this.el.wars, wars
      .map((w) => {
        const sc = scoreFor(w, s.player);
        return `<button class="warchip" data-a="war" data-p="${w.id}">⚔️ ${esc(nm(s, enemyLeader(w, s.player)))} · <b class="${cls(sc)}">${signed(sc)}</b></button>`;
      })
      .join(''));
    const t = s.tension;
    patch(this.el.tension, `Tension mondiale ${num(t)}%<div class="bar"><i style="width:${t}%"></i></div>`);
    const unread = s.log.length - this.seenLog;
    patch(this.el.bottom, `
      <div class="modes">${MODES.map((m) => `<button class="${this.mode === m.id ? 'on' : ''}" data-a="mode" data-p="${m.id}" title="${m.name}">${m.icon}</button>`).join('')}</div>
      <span class="spacer"></span>
      <button class="fab" data-a="ledger" title="Classements">📊</button>
      <button class="fab" data-a="log" title="Journal">📰${unread > 0 ? `<span class="badge">${Math.min(unread, 99)}</span>` : ''}</button>
      <button class="fab" data-a="menu" title="Menu">☰</button>`);
    this.root.style.setProperty('--hud-h', `${this.el.hud.offsetHeight}px`);
    this.el.legend.textContent = MODES.find((m) => m.id === this.mode)!.name + (this.mode === 'diplomatic' ? ' · or = vous, bleu = bloc, rouge = guerre' : '');
  }

  private renderSheet(resetScroll = false) {
    const sheet = this.el.sheet;
    // Ne pas reconstruire la fiche pendant que le joueur manipule un curseur
    if (!resetScroll && sheet.contains(document.activeElement) && (document.activeElement as HTMLInputElement).type === 'range') return;
    const s = this.s;
    if (!s || !this.selected || this.picking) {
      sheet.classList.remove('open');
      return;
    }
    const terr = s.territories[this.selected];
    const id = terr.owner;
    const n = s.nations[id];
    const body = sheet.querySelector('.body');
    const scroll = body && !resetScroll ? body.scrollTop : 0;
    const tabs =
      id === s.player
        ? [['eco', 'Économie'], ['army', 'Armée'], ['diplo', 'Diplomatie'], ['terr', 'Territoires']]
        : [['diplo', 'Diplomatie'], ['info', 'Détails']];
    if (!tabs.some(([k]) => k === this.tab)) this.tab = tabs[0][0];
    let content = '';
    if (id === s.player) {
      content = this.tab === 'eco' ? this.ownEco() : this.tab === 'army' ? this.ownArmy() : this.tab === 'diplo' ? this.ownDiplo() : this.ownTerritories();
    } else {
      content = this.tab === 'diplo' ? this.foreignDiplo(id) : this.foreignInfo(id);
    }
    const sub = terr.id !== id ? ` <small class="muted">· ${esc(terr.name)}</small>` : '';
    if (!sheet.firstChild)
      sheet.innerHTML = `<div class="grab"></div><div class="head"><i class="dot" style="width:14px;height:14px;border-radius:50%"></i>
        <h2></h2><button class="close" data-a="close" aria-label="Fermer">✕</button></div><div class="body"></div>`;
    sheet.querySelector<HTMLElement>('.head .dot')!.style.background = n.color;
    patch(sheet.querySelector('h2')!, `${esc(n.name)}${sub}`);
    const b = sheet.querySelector<HTMLElement>('.body')!;
    patch(
      b,
      `<div class="tabs">${tabs.map(([k, l]) => `<button class="${this.tab === k ? 'on' : ''}" data-a="tab" data-p="${k}">${l}</button>`).join('')}</div>
      ${this.badges(id)}${content}`,
    );
    sheet.classList.add('open');
    b.scrollTop = scroll;
  }

  private badges(id: Id): string {
    const s = this.state;
    const n = s.nations[id];
    const b: string[] = [];
    if (id === s.player) b.push('<span class="badge-i" style="border-color:var(--gold);color:var(--gold)">Votre nation</span>');
    if (n.bloc) b.push(`<span class="badge-i ally">🛡️ ${esc(s.blocs[n.bloc].name)}${s.blocs[n.bloc].leader === id ? ' (meneur)' : ''}</span>`);
    else b.push('<span class="badge-i">Non-aligné</span>');
    if (n.nuclear) b.push('<span class="badge-i nuke">☢ Puissance nucléaire</span>');
    if (n.nukeProgram !== null) b.push(`<span class="badge-i nuke">☢ Programme (${n.nukeProgram} mois)</span>`);
    for (const w of warsOf(s, id)) b.push(`<span class="badge-i war">⚔️ ${esc(w.name)}</span>`);
    if (id !== s.player) {
      if (hasTrade(s, s.player, id)) b.push('<span class="badge-i ally">Accord commercial</span>');
      if (sanctions(s, s.player, id)) b.push('<span class="badge-i war">Sanctionné par vous</span>');
      if (sanctions(s, id, s.player)) b.push('<span class="badge-i war">Vous sanctionne</span>');
      if (s.nations[s.player].claims.includes(id)) b.push('<span class="badge-i war">Casus belli ✔</span>');
    }
    return `<div class="badges">${b.join('')}</div>`;
  }

  private coreStats(id: Id): string {
    const s = this.state;
    const n = s.nations[id];
    const g = growthOf(s, id);
    const gdp = gdpOf(s, id);
    return `<div class="stats">
      ${stat('PIB', money(gdp))}
      ${stat('Croissance', `<span class="${cls(g)}">${pct(g)}</span>`)}
      ${stat('Population', pop(popOf(s, id)))}
      ${stat('PIB / hab.', `${num((gdp * 1e3) / Math.max(popOf(s, id), 0.001))} $`)}
      ${stat('Stabilité', `<span class="${n.stability < 35 ? 'neg' : ''}">${num(n.stability)}</span>`)}
      ${stat('Puissance', `#${powerRank(s, id)} · ${num(power(n) / 100)}`)}
    </div>`;
  }

  private action(a: string, title: string, cost: A.Cost | string, extra: { p?: string; disabled?: string; danger?: boolean; wide?: boolean } = {}) {
    const s = this.state;
    const costTxt = typeof cost === 'string' ? cost : costLabel(cost);
    const affordable = typeof cost === 'string' || A.canPay(s, s.player, cost);
    const why = extra.disabled ?? (affordable ? '' : 'Ressources insuffisantes');
    return `<button class="act ${extra.danger ? 'danger' : ''} ${extra.wide ? 'wide' : ''}" data-a="${a}" ${extra.p ? `data-p="${esc(extra.p)}"` : ''} ${why ? 'disabled' : ''}>
      <span class="t">${title}</span><span class="c">${why || costTxt}</span></button>`;
  }

  private ownEco(): string {
    const s = this.state;
    const id = s.player;
    const n = s.nations[id];
    const b = budget(s, id);
    const parts = growthBreakdown(s, id);
    return `${this.coreStats(id)}
      <h3>Croissance annuelle</h3><div class="rows">${parts.map((p) => `<div class="row"><span>${esc(p.label)}</span><span class="${cls(p.value)}">${pct(p.value, 2)}</span></div>`).join('')}</div>
      <h3>Budget mensuel</h3><div class="rows">
        <div class="row"><span>Recettes discrétionnaires</span><span class="pos">+${money(b.income)}</span></div>
        <div class="row"><span>Défense (${pct(n.milPct, 1, false)} du PIB)</span><span class="neg">−${money(b.military)}</span></div>
        ${b.interest ? `<div class="row"><span>Intérêts de la dette</span><span class="neg">−${money(b.interest)}</span></div>` : ''}
        <div class="row"><span><b>Solde</b></span><span class="${cls(b.net)}"><b>${money(b.net)}</b></span></div></div>
      <h3>Politique intérieure</h3><div class="actions">
        ${this.action('reform', 'Réforme économique', A.COSTS.reform(s, id), { disabled: n.growthBonus >= 1 ? 'Maximum atteint' : undefined })}
        ${this.action('stabilize', 'Campagne de stabilité', A.COSTS.stabilize(), { disabled: n.stability >= 95 ? 'Déjà maximale' : undefined })}
        ${this.action('invest', "Plan d'investissement", A.COSTS.invest(s, id), { disabled: n.modifiers.some((m) => m.id === 'invest') ? 'En cours' : undefined, wide: true })}
      </div>
      ${n.modifiers.length ? `<h3>Effets actifs</h3><div class="rows">${n.modifiers.map((m) => `<div class="row"><span>${esc(m.label)}</span><span>${m.months} mois</span></div>`).join('')}</div>` : ''}`;
  }

  private ownArmy(): string {
    const s = this.state;
    const id = s.player;
    const n = s.nations[id];
    const wars = warsOf(s, id);
    return `${this.coreStats(id)}
      <div class="stats">${stat('Technologie', `Niv. ${n.tech}`)}${stat('Lassitude', `<span class="${n.exhaustion > 50 ? 'neg' : ''}">${num(n.exhaustion)}%</span>`)}${stat('Agressivité', `<span class="${n.aggression > 40 ? 'neg' : ''}">${num(n.aggression)}</span>`)}</div>
      <h3>Budget de défense (% du PIB)</h3>
      <div class="slider"><input type="range" min="0.3" max="15" step="0.1" value="${n.milPct}" data-i="milBudget"><b id="milv">${pct(n.milPct, 1, false)}</b></div>
      <p class="muted" style="font-size:12px">La puissance converge lentement vers le niveau financé. Coût mensuel : ${money(budget(s, id).military)}.</p>
      <h3>Doctrine</h3><div class="actions">
        ${this.action('modernize', 'Moderniser les forces', A.COSTS.tech(s, id), { disabled: n.tech >= 15 ? 'Maximum' : undefined })}
        ${this.action('mobilize', 'Mobilisation générale', A.COSTS.mobilize(), { disabled: n.modifiers.some((m) => m.id === 'mobilized') ? 'Déjà mobilisé' : undefined })}
        ${n.nuclear ? '' : this.action('nuke', 'Programme nucléaire', A.COSTS.nuke(s, id), { disabled: n.nukeProgram !== null ? `En cours (${n.nukeProgram} mois)` : undefined, danger: true, wide: true })}
      </div>
      <h3>Guerres (${wars.length})</h3>
      ${wars.length ? wars.map((w) => this.warLine(w)).join('') : '<p class="muted">Aucun conflit en cours.</p>'}
      ${n.claims.length || n.cbProgress ? `<h3>Casus belli</h3><div class="rows">${n.claims.map((c) => `<div class="row"><span>${esc(nm(s, c))}</span><span class="pos">Prêt</span></div>`).join('')}${n.cbProgress ? `<div class="row"><span>${esc(nm(s, n.cbProgress.target))}</span><span>${n.cbProgress.months} mois</span></div>` : ''}</div>` : ''}`;
  }

  private warLine(w: War): string {
    const s = this.state;
    const sc = scoreFor(w, s.player);
    return `<button class="act wide" style="width:100%;margin-bottom:6px" data-a="war" data-p="${w.id}">
      <span class="t">${esc(w.name)}</span>
      <span class="c">Score : <b class="${cls(sc)}">${signed(sc)}</b> · ${w.months} mois · ${isLeader(w, s.player) ? 'vous menez' : 'allié'}</span></button>`;
  }

  private ownDiplo(): string {
    const s = this.state;
    const id = s.player;
    const n = s.nations[id];
    const bloc = n.bloc ? s.blocs[n.bloc] : null;
    const rels = alive(s)
      .filter((o) => o.id !== id)
      .map((o) => ({ o, r: rel(s, id, o.id) }));
    const best = rels.slice().sort((a, b) => b.r - a.r).slice(0, 6);
    const worst = rels.slice().sort((a, b) => a.r - b.r).slice(0, 6);
    const line = (x: { o: { id: Id; name: string }; r: number }) =>
      `<div class="row" data-a="goto" data-p="${esc(x.o.id)}" style="cursor:pointer"><span>${esc(x.o.name)}</span><span class="${cls(x.r)}">${signed(x.r)}</span></div>`;
    const trades = s.trades.filter((k) => k.split('|').includes(id)).length;
    const sanc = s.sanctions.filter((k) => k.endsWith(`>${id}`)).map((k) => nm(s, k.split('>')[0]));
    return `
      <h3>Bloc</h3>
      ${bloc ? `<div class="rows"><div class="row"><span>${esc(bloc.name)} · meneur : ${esc(nm(s, bloc.leader))}</span><span>${bloc.members.length} membres</span></div></div>
        <p class="muted" style="font-size:12px">${bloc.members.map((m) => esc(nm(s, m))).join(', ')}</p>
        <div class="actions">${this.action('quitBloc', 'Quitter le bloc', 'Stabilité −5, relations −30 avec les membres', { danger: true, wide: true })}</div>`
        : '<p class="muted">Non-aligné. Sélectionnez un pays pour proposer une alliance ou rejoindre son bloc.</p>'}
      <h3>Échanges</h3><div class="rows">
        <div class="row"><span>Accords commerciaux</span><span>${trades}</span></div>
        <div class="row"><span>Sanctions subies</span><span class="${sanc.length ? 'neg' : ''}">${sanc.length ? esc(sanc.join(', ')) : 'aucune'}</span></div></div>
      <h3>Meilleures relations</h3><div class="rows">${best.map(line).join('')}</div>
      <h3>Pires relations</h3><div class="rows">${worst.map(line).join('')}</div>`;
  }

  private ownTerritories(): string {
    const s = this.state;
    const terrs = ownedTerritories(s, s.player).slice().sort((a, b) => b.gdp - a.gdp);
    return `<div class="rows">${terrs
      .map(
        (t) => `<div class="row"><span>${esc(t.name)}${t.occupiedBy ? ` <span class="neg">(occupé par ${esc(nm(s, t.occupiedBy))})</span>` : ''}<br>
          <small class="muted">${money(t.gdp)} · ${pop(t.pop)}${t.integration < 100 ? ` · intégration ${num(t.integration)}%` : ''}</small></span>
          <span>${t.integration < 100 ? `<button class="chip" data-a="integrate" data-p="${esc(t.id)}" ${A.canPay(s, s.player, A.COSTS.integrate()) && !t.occupiedBy ? '' : 'disabled'}>Intégrer (🏛️40)</button>` : '✔'}</span></div>`,
      )
      .join('')}</div>
      <p class="muted" style="font-size:12px">Les territoires mal intégrés freinent la croissance et peuvent se soulever si votre stabilité chute.</p>`;
  }

  private foreignDiplo(id: Id): string {
    const s = this.state;
    const me = s.player;
    const n = s.nations[id];
    const r = rel(s, me, id);
    const war = warBetween(s, me, id);
    const trade = hasTrade(s, me, id);
    const sanc = sanctions(s, me, id);
    const myNation = s.nations[me];
    const reach = inReach(s, this.world, me, id);
    const warChk = canDeclareWar(s, this.world, me, id);
    const allied = sameBloc(s, me, id);
    const blocInvite = myNation.bloc && s.blocs[myNation.bloc].leader !== me ? 'Seul le meneur peut inviter' : n.bloc ? 'Déjà dans un bloc' : undefined;
    return `
      <div class="row" style="border:0"><span>Relations avec vous</span><b class="${cls(r)}">${signed(r)}</b></div>
      <div class="relbar"><i style="left:${(r + 100) / 2}%"></i></div>
      ${this.coreStats(id)}
      ${war ? `<h3>Guerre</h3>${this.warLine(war)}` : ''}
      <h3>Diplomatie</h3><div class="actions">
        ${this.action('improve', 'Améliorer les relations', A.COSTS.improve(), { disabled: war ? 'En guerre' : r >= 100 ? 'Maximum' : undefined })}
        ${trade ? this.action('untrade', 'Rompre l’accord', 'Relations −15') : this.action('trade', 'Accord commercial', A.COSTS.trade(), { disabled: war ? 'En guerre' : sanc || sanctions(s, id, me) ? 'Sanctions en vigueur' : undefined })}
        ${this.action('aid', 'Aide financière', A.COSTS.aid(s, me), { disabled: war ? 'En guerre' : undefined })}
        ${sanc ? this.action('sanction', 'Lever les sanctions', 'Relations +10') : this.action('sanction', 'Imposer des sanctions', A.COSTS.sanction(), { disabled: allied ? 'Allié' : undefined })}
        ${allied ? '' : this.action('alliance', 'Proposer une alliance', A.COSTS.alliance(), { disabled: war ? 'En guerre' : blocInvite })}
        ${!allied && n.bloc && !myNation.bloc ? this.action('joinBloc', `Rejoindre ${esc(s.blocs[n.bloc].name)}`, A.COSTS.alliance()) : ''}
      </div>
      <h3>Opérations</h3><div class="actions">
        ${this.action('destab', 'Déstabiliser', A.COSTS.destabilize(), { disabled: allied ? 'Allié' : undefined })}
        ${this.action('claim', 'Fabriquer un casus belli', A.COSTS.claim(), { disabled: myNation.claims.includes(id) ? 'Déjà obtenu' : myNation.cbProgress ? 'Un autre est en cours' : !reach ? 'Hors de portée' : allied ? 'Allié' : undefined })}
        ${war ? '' : `<button class="act danger wide" data-a="declare" data-p="${esc(id)}" ${warChk.ok ? '' : 'disabled'}>
          <span class="t">Déclarer la guerre</span><span class="c">${warChk.ok ? (myNation.claims.includes(id) ? 'Casus belli valide' : 'Sans casus belli : stabilité −15, agressivité +25') : warChk.reason}</span></button>`}
      </div>`;
  }

  private foreignInfo(id: Id): string {
    const s = this.state;
    const n = s.nations[id];
    const b = budget(s, id);
    return `${this.coreStats(id)}
      <div class="stats">${stat('Trésor', money(n.treasury))}${stat('Défense', pct(n.milPct, 1, false) + ' PIB')}${stat('Technologie', `Niv. ${n.tech}`)}
      ${stat('Agressivité', num(n.aggression))}${stat('Lassitude', num(n.exhaustion) + '%')}${stat('Solde / mois', money(b.net))}</div>
      <h3>Territoires</h3><div class="rows">${ownedTerritories(s, id).map((t) => `<div class="row"><span>${esc(t.name)}</span><span>${money(t.gdp)}</span></div>`).join('')}</div>
      <h3>Voisins</h3><p class="muted">${neighbours(s, this.world, id).map((x) => esc(nm(s, x))).join(', ') || 'aucun (insulaire)'}</p>`;
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
      e.title,
      `<div class="event-kind">${dateLabel(s)}</div><p>${esc(e.text)}</p>`,
      e.options.map((o, i) => ({ label: esc(o.label), hint: esc(o.hint), a: 'event', p: `${e.uid}:${i}`, primary: i === 0 })),
    );
  }

  // ————————————————————————————— Modales —————————————————————————————

  private modal(title: string, html: string, buttons: { label: string; hint?: string; a: string; p?: string; primary?: boolean; disabled?: boolean }[]) {
    const o = this.el.overlay;
    o.style.display = '';
    o.innerHTML = `<div class="modal" role="dialog"><header><h2>${title}</h2></header><div class="content">${html}</div>
      <footer>${buttons
        .map((b) => `<button class="btn ${b.primary ? 'primary' : ''}" data-a="${b.a}" ${b.p ? `data-p="${esc(b.p)}"` : ''} ${b.disabled ? 'disabled' : ''}>${b.label}${b.hint ? `<small>${b.hint}</small>` : ''}</button>`)
        .join('')}</footer></div>`;
  }

  private closeModal() {
    this.el.overlay.style.display = 'none';
    this.el.overlay.innerHTML = '';
    if (this.s && !this.picking) this.renderEvents();
  }

  private showHelp() {
    this.modal(
      'Comment jouer',
      `<p>Vous dirigez une nation à partir de janvier 2026. Le temps s'écoule mois par mois : <b>▶</b> lance ou met en pause, <b>›››</b> règle la vitesse.</p>
      <p><b>Trois ressources</b> s'accumulent chaque mois :<br>🏛️ Capital politique (réformes, stabilité, intégration)<br>🕊️ Influence (relations, accords, alliances, casus belli)<br>🎖️ Doctrine (technologie, mobilisation)</p>
      <p><b>Économie</b> : le PIB croît selon votre niveau de développement, votre stabilité, vos accords commerciaux et vos réformes. Les sanctions et la guerre le freinent. Le trésor finance l'armée et les plans d'investissement.</p>
      <p><b>Diplomatie</b> : touchez un pays pour agir. Les blocs (OTAN, OTSC…) sont des pactes défensifs : attaquer un membre, c'est affronter tout le bloc.</p>
      <p><b>Guerre</b> : sans casus belli, la déclaration coûte de la stabilité et de l'agressivité. Le score de guerre (−100 à +100) détermine ce que vous pouvez exiger : annexions de territoires occupés, satellisation, réparations. Une puissance nucléaire ne peut pas être forcée à capituler.</p>
      <p><b>Tension mondiale</b> : un affrontement direct entre puissances nucléaires la fait grimper. À 100 %, l'escalade devient possible… et personne ne gagne.</p>
      <p><b>Agressivité</b> : les annexions inquiètent le monde. Au-delà de 50, attendez-vous à des sanctions.</p>`,
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
    const tabs = [['gdp', 'PIB'], ['power', 'Armée'], ['wars', 'Guerres'], ['blocs', 'Blocs']];
    let html = `<div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="ledger" data-p="${k}">${l}</button>`).join('')}</div>`;
    const row = (id: Id, i: number, v: string) =>
      `<div class="row" data-a="goto" data-p="${esc(id)}" style="cursor:pointer;${id === s.player ? 'color:var(--gold)' : ''}"><span>${i + 1}. ${esc(nm(s, id))}</span><span>${v}</span></div>`;
    if (tab === 'gdp') {
      html += `<div class="rows">${alive(s).map((n) => ({ id: n.id, g: gdpOf(s, n.id) })).sort((a, b) => b.g - a.g).slice(0, 40).map((x, i) => row(x.id, i, money(x.g))).join('')}</div>`;
    } else if (tab === 'power') {
      html += `<div class="rows">${alive(s).sort((a, b) => power(b) - power(a)).slice(0, 40).map((n, i) => row(n.id, i, num(power(n) / 100) + (n.nuclear ? ' ☢' : ''))).join('')}</div>`;
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
    const me = s.nations[s.player];
    const t = s.nations[id];
    const allies = t.bloc ? s.blocs[t.bloc].members.filter((m) => m !== id) : [];
    const theirPow = power(t) * 1.2 + allies.reduce((a, m) => a + power(s.nations[m]) * 0.6, 0);
    const nukes = [t, ...allies.map((m) => s.nations[m])].some((n) => n.nuclear);
    const justified = me.claims.includes(id);
    this.modal(
      `Déclarer la guerre à ${esc(t.name)} ?`,
      `<div class="stats">${stat('Votre puissance', num(power(me) / 100))}${stat('Camp adverse', num(theirPow / 100))}</div>
      ${allies.length ? `<p class="neg">⚠ ${esc(t.name)} est membre de ${esc(s.blocs[t.bloc!].name)} : ${allies.length} alliés entreront en guerre (${allies.slice(0, 8).map((m) => esc(nm(s, m))).join(', ')}${allies.length > 8 ? '…' : ''}).</p>` : ''}
      ${nukes ? '<p class="neg">☢ Le camp adverse dispose de l’arme nucléaire : capitulation impossible, tension mondiale en forte hausse.</p>' : ''}
      <p>${justified ? '✔ Casus belli valide : agressivité +5.' : '✖ Sans casus belli : stabilité −15, agressivité +25, relations dégradées avec le monde entier.'}</p>`,
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
    const side = (ids: Id[]) => ids.map((x, i) => `<div class="row"><span>${i === 0 ? '★ ' : ''}${esc(nm(s, x))}</span><span>${num(power(s.nations[x]) / 100)}</span></div>`).join('');
    const occ = Object.values(s.territories).filter((t) => t.occupiedBy && ([...war.attackers, ...war.defenders].includes(t.owner)));
    const leader = isLeader(war, s.player);
    this.modal(
      esc(war.name),
      `${scoreBar(sc)}<p style="text-align:center">Score de guerre : <b class="${cls(sc)}">${signed(sc)}</b> · ${war.months} mois</p>
      <h3>Votre camp</h3><div class="rows">${side(mine)}</div>
      <h3>Adversaires</h3><div class="rows">${side(theirs)}</div>
      ${occ.length ? `<h3>Occupations</h3><div class="rows">${occ.map((t) => `<div class="row"><span>${esc(t.name)}</span><span>par ${esc(nm(s, t.occupiedBy!))}</span></div>`).join('')}</div>` : ''}
      ${leader ? '' : '<p class="muted">Seul le meneur de votre camp peut négocier la paix.</p>'}`,
      [
        ...(leader ? [{ label: 'Négocier la paix', a: 'peace', p: war.id, primary: true }] : []),
        { label: 'Fermer', a: 'closeModal' },
      ],
    );
  }

  private showPeace(warId: string) {
    const s = this.state;
    const war = s.wars.find((w) => w.id === warId);
    if (!war) return;
    const enemy = enemyLeader(war, s.player);
    const mySide = war.attackers.includes(s.player) ? war.attackers : war.defenders;
    const sc = scoreFor(war, s.player);
    const occ = ownedTerritories(s, enemy).filter((t) => t.occupiedBy && mySide.includes(t.occupiedBy));
    const nuclear = s.nations[enemy].nuclear;
    const html = `${scoreBar(sc)}<p style="text-align:center">Score disponible : <b class="${cls(sc)}">${signed(sc)}</b></p>
      ${sc > 0 ? `<h3>Exigences</h3>
        ${nuclear ? '<p class="muted">☢ Puissance nucléaire : aucune annexion possible.</p>' : occ.length ? occ.map((t) => `<label class="check"><input type="checkbox" data-a="peaceToggle" data-k="annex" value="${esc(t.id)}"><span>Annexer ${esc(t.name)}<br><small class="muted">${money(t.gdp)}</small></span><em data-cost></em></label>`).join('') : '<p class="muted">Aucun territoire ennemi occupé : augmentez votre score de guerre.</p>'}
        <label class="check"><input type="checkbox" data-a="peaceToggle" data-k="satellite"><span>Satelliser (rejoint votre bloc)</span></label>
        <label class="check"><input type="checkbox" data-a="peaceToggle" data-k="reparations"><span>Réparations de guerre (10 % de leur PIB)</span></label>
        <p>Coût total : <b id="peaceCost">0</b> / ${num(Math.max(0, sc))}</p>` : `<p class="muted">Vous n'êtes pas en position d'exiger quoi que ce soit.</p>
        <p>Si vous capitulez, ${esc(nm(s, enemy))} imposera : ${esc(describeTerms(s, aiTerms(s, war, enemy)))}.</p>`}`;
    this.modal(`Paix avec ${esc(nm(s, enemy))}`, html, [
      ...(sc > 0 ? [{ label: 'Proposer ces conditions', a: 'peaceSend', p: war.id, primary: true }] : []),
      { label: 'Proposer une paix blanche', a: 'peaceWhite', p: war.id },
      ...(sc < 0 ? [{ label: 'Capituler', hint: 'Accepter leurs conditions', a: 'surrender', p: war.id }] : []),
      { label: 'Annuler', a: 'closeModal' },
    ]);
    // Les cases à cocher déclenchent le handler via l'événement click délégué
  }

  private readTerms(): PeaceTerms {
    const boxes = [...this.el.overlay.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    return {
      annex: boxes.filter((b) => b.dataset.k === 'annex' && b.checked).map((b) => b.value),
      satellite: boxes.some((b) => b.dataset.k === 'satellite' && b.checked),
      reparations: boxes.some((b) => b.dataset.k === 'reparations' && b.checked),
    };
  }

  private updatePeaceCost() {
    const s = this.state;
    const war = s.wars.find((w) => this.el.overlay.querySelector(`[data-p="${w.id}"]`));
    const out = this.el.overlay.querySelector('#peaceCost');
    if (!war || !out) return;
    const cost = termsCost(s, enemyLeader(war, s.player), this.readTerms());
    out.textContent = String(cost);
    out.className = cost > scoreFor(war, s.player) ? 'neg' : 'pos';
  }

  private sendPeace(warId: string, white: boolean) {
    const s = this.state;
    const war = s.wars.find((w) => w.id === warId);
    if (!war) return;
    const terms: PeaceTerms = white ? { annex: [], satellite: false, reparations: false } : this.readTerms();
    if (aiAcceptsPeace(s, war, s.player, terms)) {
      applyPeace(s, war, s.player, terms);
      this.closeModal();
      this.toast('Traité de paix signé !', 'good');
    } else {
      this.toast(`${nm(s, enemyLeader(war, s.player))} rejette vos conditions.`, 'bad');
    }
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
  if (c.pol) p.push(`🏛️${c.pol}`);
  if (c.dip) p.push(`🕊️${c.dip}`);
  if (c.mil) p.push(`🎖️${c.mil}`);
  if (c.money) p.push(`💰${money(c.money)}`);
  return p.join(' ') || 'Gratuit';
}

function scoreBar(sc: number) {
  const w = Math.abs(sc) / 2;
  const left = sc >= 0 ? 50 : 50 - w;
  return `<div class="scorebar"><i style="left:${left}%;width:${w}%;background:${sc >= 0 ? 'var(--good)' : 'var(--bad)'}"></i><i style="left:50%;width:2px;background:#fff"></i></div>`;
}

