/**
 * Fenêtres du mode Service :
 * - ServiceServerApp : le poste d'un joueur employé (salle, tireuse, cuisine, planche, comptoir, plateau, caisse)
 * - ServiceGMApp     : le pilotage du service par le MJ
 * - ServiceClientApp : un joueur attablé qui commande
 *
 * Toutes lisent l'état partagé (service.js) et envoient leurs actions au MJ.
 * Les jauges sont animées localement, sans redessiner la fenêtre.
 */

import { t, esc } from "./constants.js";
import { OtiumApp, openApps } from "./apps.js";
import { sceneTavern } from "./store.js";
import { formatCp, formatWallet, cashGiven, walletToCp } from "./currency.js";
import { buyerCandidates, defaultBuyer } from "./order.js";
import {
  SERVICE, RUSH, getService, getSummary, serviceNow, onServiceChange, sendOp,
  openService, payTips, dismissSummary, menuItem, ticketTotal, isBusy
} from "./service.js";

const { DialogV2 } = foundry.applications.api;

const L = (key, data) => t(`Service.${key}`, data);
const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const STATION_ORDER = { tap: 0, board: 1, stove: 2 };

function bar(kind, id, cls = "") {
  return `<div class="otium-bar ${cls}" data-otium-bar="${kind}" data-id="${esc(id)}"><i></i></div>`;
}

function barState(s, kind, id, now) {
  switch (kind) {
    case "ticket": {
      const tk = s.tickets[id];
      if (!tk || tk.deadline === null) return { frac: 1, colored: false };
      return { frac: (tk.deadline - now) / tk.patienceMax, colored: true };
    }
    case "cook": {
      const slot = s.stove[id];
      return { frac: slot ? (now - slot.start) / (slot.readyAt - slot.start) : 0 };
    }
    case "burn": {
      const slot = s.stove[id];
      return { frac: slot ? 1 - (now - slot.readyAt) / SERVICE.burn : 0, colored: true };
    }
    case "board": {
      const slot = s.board[id];
      return { frac: slot ? (now - slot.start) / (slot.end - slot.start) : 0 };
    }
    case "busy": {
      const st = s.staff[id];
      if (!st?.busy) return { frac: 0 };
      if (st.busy.end === null) return { frac: 1 };
      return { frac: (now - st.busy.start) / (st.busy.end - st.busy.start) };
    }
  }
  return { frac: 0 };
}

/* -------------------------------------------- */
/*  Animation des jauges et rafraîchissement    */
/* -------------------------------------------- */

let liveTimer = null;
function ensureLive() {
  if (liveTimer) return;
  liveTimer = setInterval(() => {
    let any = false;
    for (const app of openApps) {
      if (!app.updateLive) continue;
      any = true;
      app.updateLive();
    }
    if (!any) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  }, 100);
}

onServiceChange(() => {
  for (const app of openApps) app.onServiceChanged?.();
});

/** Base des fenêtres du service. */
class ServiceApp extends OtiumApp {
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    ensureLive();
  }

  onServiceChanged() {
    this.render();
  }

  /** Tavernes ou scène modifiées : utile seulement avant l'ouverture (choix de la taverne). */
  onDataChanged() {
    if (!getService()) this.render();
  }

  updateLive() {
    const s = getService();
    const root = this.element;
    if (!s || !root) return;
    const now = serviceNow();
    for (const el of root.querySelectorAll("[data-otium-bar]")) {
      const { frac, colored } = barState(s, el.dataset.otiumBar, el.dataset.id, now);
      const f = Math.min(1, Math.max(0, frac || 0));
      el.firstElementChild.style.width = `${f * 100}%`;
      if (colored) {
        el.classList.toggle("mid", f <= 0.5 && f > 0.25);
        el.classList.toggle("low", f <= 0.25);
      }
    }
    const c = root.querySelector("[data-otium-clock]");
    if (c) c.textContent = clock(now);
  }
}

function ticketChips(s, ticket) {
  return ticket.items
    .map((it) => `<span class="otium-chip ${it.served ? "done" : ""} ${it.perfect ? "perfect" : ""}">${esc(menuItem(s, it.m)?.name)}</span>`)
    .join("");
}

function ownedCharacters() {
  return game.actors.filter((a) => a.type === "character" && a.isOwner);
}

/* ============================================ */
/*  Vue Serveur                                 */
/* ============================================ */

export class ServiceServerApp extends ServiceApp {
  constructor(options = {}) {
    super({ id: "otium-service-server", ...options });
    this.actorId = null;
    this.pendingActor = game.user.character?.id ?? ownedCharacters()[0]?.id ?? null;
    this.drink = null;
    this.tap = null;
    this.cash = null;
    this.drag = null;
    this.suppressClick = false;
  }

  static DEFAULT_OPTIONS = {
    classes: ["otium", "otium-service", "otium-server"],
    window: { icon: "fa-solid fa-bell-concierge", resizable: true },
    position: { width: 980, height: "auto" },
    actions: {
      join: ServiceServerApp.#onJoin,
      leave: ServiceServerApp.#onLeave,
      launch: ServiceServerApp.#op("launch", ["slot", "m"]),
      takeOut: ServiceServerApp.#op("takeOut", ["slot"]),
      trash: ServiceServerApp.#op("trash", ["slot"]),
      prep: ServiceServerApp.#op("prep", ["m"]),
      take: ServiceServerApp.#op("take", ["uid"]),
      drop: ServiceServerApp.#op("drop", ["uid"]),
      serve: ServiceServerApp.#op("serve", ["table"]),
      cash: ServiceServerApp.#onCash,
      coin: ServiceServerApp.#onCoin,
      cashConfirm: ServiceServerApp.#onCashConfirm,
      cashCancel: ServiceServerApp.#onCashCancel
    }
  };

  /** Fabrique une action qui envoie l'opération avec les data-* de la cible. */
  static #op(type, keys) {
    return function (event, target) {
      if (this.suppressClick) return;
      const op = { type, actorId: this.actorId };
      for (const k of keys) op[k] = target.dataset[k];
      return sendOp(op);
    };
  }

  get title() {
    return L("Server.Title");
  }

  /** Personnage à son poste joué par cet utilisateur (ou null). */
  get staff() {
    const s = getService();
    if (!s) return null;
    if (this.actorId && s.staff[this.actorId] && game.actors.get(this.actorId)?.isOwner) return s.staff[this.actorId];
    const mine = ownedCharacters().find((a) => s.staff[a.id]);
    this.actorId = mine?.id ?? null;
    return mine ? s.staff[mine.id] : null;
  }

  _html() {
    const s = getService();
    if (!s) return `<p class="notice">${L(getSummary() ? "Ended" : "None")}</p>`;
    const st = this.staff;
    if (!st) return this._joinHtml(s);

    const now = serviceNow();
    const busy = isBusy(st, now) || !!this.tap;
    const myTicket = Object.values(s.tickets).find((tk) => tk.cashier === st.id);
    if (!myTicket) this.cash = null;
    const off = !s.running;

    return `
      ${this._statusHtml(s, st, now, busy)}
      ${this.cash && myTicket ? this._cashHtml(s, myTicket) : ""}
      <h3 class="otium-section">${L("Server.Room")}</h3>
      <div class="otium-tables">${this._tablesHtml(s, st, busy || off)}</div>
      <h3 class="otium-section">${L("Server.Stations")}</h3>
      <div class="otium-stations">
        ${this._tapHtml(s, busy || off)}
        ${this._stoveHtml(s, busy || off)}
        ${this._boardHtml(s, busy || off)}
      </div>
      ${this._counterHtml(s, st, busy || off)}`;
  }

  _joinHtml(s) {
    const mine = ownedCharacters();
    if (!mine.length) return `<p class="notice">${t("Menu.NoCharacter")}</p>`;
    const taken = (a) => (s.staff[a.id] ? ` (${L("Server.OnDuty")})` : "");
    return `
      <p class="notice">${L("Server.JoinHint", { tavern: esc(s.tavernName) })}</p>
      <div class="otium-row">
        <select name="actor">${mine.map((a) => `<option value="${a.id}" ${a.id === this.pendingActor ? "selected" : ""}>${esc(a.name)}${taken(a)}</option>`).join("")}</select>
        <button type="button" class="otium-primary" data-action="join"><i class="fa-solid fa-bell-concierge"></i> ${L("Server.Join")}</button>
      </div>`;
  }

  _statusHtml(s, st, now, busy) {
    let status;
    if (this.tap) status = `<span class="otium-busy">${L("Busy.Tap")}…</span>`;
    else if (isBusy(st, now)) status = `<span class="otium-busy">${esc(L(`Busy.${st.busy.key}`, st.busy.data))}…</span>`;
    else status = `<span class="hint">${s.running ? L("Server.Free") : L("Server.Waiting")}</span>`;
    return `
      <div class="otium-status">
        <strong>${esc(st.name)}</strong>
        ${status}
        <span class="otium-clock" data-otium-clock>${clock(now)}</span>
        <button type="button" class="icon" data-action="leave" data-tooltip="${esc(L("Server.Leave"))}" ${busy ? "disabled" : ""}><i class="fa-solid fa-right-from-bracket"></i></button>
        <div class="otium-status-bar">${bar("busy", st.id, "neutral")}</div>
      </div>`;
  }

  _cashHtml(s, ticket) {
    const due = ticketTotal(s, ticket);
    const given = cashGiven(due);
    return `
      <section class="otium-cash">
        <h3>${L("Cash.Title", { n: ticket.table })}</h3>
        <div class="otium-cash-lines">
          <span>${L("Cash.Due")}</span><strong>${formatCp(due)}</strong>
          <span>${L("Cash.Given", { name: esc(ticket.name) })}</span><strong>${formatCp(given)}</strong>
          <span>${L("Cash.Change")}</span><strong class="otium-cash-change" data-cash-change>${formatCp(this.cash.change)}</strong>
        </div>
        <div class="otium-row">
          <button type="button" data-action="coin" data-value="10">${L("Cash.AddSp")}</button>
          <button type="button" data-action="coin" data-value="1">${L("Cash.AddCp")}</button>
          <button type="button" data-action="coin" data-value="0">${L("Cash.Reset")}</button>
          <button type="button" data-action="cashCancel">${L("Cash.Cancel")}</button>
          <button type="button" class="otium-primary" data-action="cashConfirm"><i class="fa-solid fa-coins"></i> ${L("Cash.Confirm")}</button>
        </div>
      </section>`;
  }

  _tablesHtml(s, st, disabled) {
    return s.tables
      .map((tb) => {
        const ticket = tb.ticket && s.tickets[tb.ticket];
        if (!ticket) {
          const who = tb.reserved ? ` · ${L("Server.Settling", { name: esc(game.actors.get(tb.reserved)?.name ?? "") })}` : "";
          return `<article class="otium-table empty"><header><strong>${L("Table", { n: tb.n })}</strong><span class="hint">${L("Server.FreeTable")}${who}</span></header></article>`;
        }
        const needs = ticket.items.some((it) => !it.served && st.tray.some((d) => d.m === it.m));
        const bill = ticket.phase === "bill";
        const cashing = ticket.cashier && ticket.cashier !== st.id ? s.staff[ticket.cashier]?.name : null;
        let action;
        if (!bill) action = `<button type="button" data-action="serve" data-table="${tb.n}" ${disabled || !needs ? "disabled" : ""}>${L("Server.Serve")}</button>`;
        else if (cashing) action = `<span class="hint">${L("Server.CashedBy", { name: esc(cashing) })}</span>`;
        else action = `<button type="button" class="otium-primary" data-action="cash" data-table="${tb.n}" ${disabled || ticket.cashier ? "disabled" : ""}>${L("Server.Cash", { total: formatCp(ticketTotal(s, ticket)) })}</button>`;
        return `
          <article class="otium-table ${bill ? "bill" : ""} ${ticket.calling ? "calling" : ""}" ${bill ? "" : `data-drop="table:${tb.n}"`}>
            <header><strong>${L("Table", { n: tb.n })}</strong><span class="hint">${bill ? L("Server.Bill") : ticket.kind === "player" ? L("Server.Player") : ""}</span></header>
            <span class="otium-who" title="${esc(ticket.name)}">${ticket.calling ? '<i class="fa-solid fa-bell"></i> ' : ""}${esc(ticket.name)}</span>
            <div class="otium-chips">${ticketChips(s, ticket)}</div>
            ${ticket.deadline === null ? `<span class="hint">${L("Server.NoRush")}</span>` : bar("ticket", ticket.id)}
            <div class="otium-table-actions">${action}</div>
          </article>`;
      })
      .join("");
  }

  _tapHtml(s, disabled) {
    const drinks = s.menu.filter((m) => m.station === "tap");
    if (!drinks.length) return `<div class="otium-station"><h4>${L("Station.Tap")}</h4><p class="hint">${L("Station.Empty")}</p></div>`;
    if (!drinks.some((d) => d.id === this.drink)) this.drink = drinks[0].id;
    const st = this.staff;
    const last = st?.lastTap && serviceNow() - st.lastTap.at < 6 ? st.lastTap : null;
    const lastCls = last ? ({ Perfect: "done", Fine: "", Spilled: "bad", TooLittle: "bad" })[last.key] : "";
    return `
      <div class="otium-station">
        <h4>${L("Station.Tap")}</h4>
        <div class="otium-chips">
          ${drinks.map((d) => `<label class="otium-radio"><input type="radio" name="drink" value="${d.id}" ${d.id === this.drink ? "checked" : ""}> ${esc(d.name)}</label>`).join("")}
        </div>
        <div class="otium-tap">
          <div class="otium-glass" aria-hidden="true"><div class="otium-target"></div><div class="otium-beer" data-otium-beer></div></div>
          <div class="otium-tap-side">
            <button type="button" class="otium-tap-btn ${this.tap ? "holding" : ""}" data-tap ${disabled && !this.tap ? "disabled" : ""}>${L("Station.Hold")}</button>
            <span class="hint">${L("Station.HoldHint")}</span>
            ${last ? `<span class="otium-chip ${lastCls}">${L(`TapResult.${last.key}`)}</span>` : ""}
          </div>
        </div>
      </div>`;
  }

  _stoveHtml(s, disabled) {
    const dishes = s.menu.filter((m) => m.station === "stove");
    const slots = s.stove
      .map((slot, i) => {
        const n = i + 1;
        if (!slot) {
          const buttons = dishes.map((d) => `<button type="button" data-action="launch" data-slot="${i}" data-m="${d.id}" ${disabled ? "disabled" : ""}>${esc(d.name)}</button>`).join("");
          return `<div class="otium-slot"><span class="otium-label">${L("Station.Fire", { n })} · ${L("Station.Free")}</span><div class="otium-chips">${buttons || `<span class="hint">${L("Station.Empty")}</span>`}</div></div>`;
        }
        const name = esc(menuItem(s, slot.m)?.name);
        if (slot.state === "cooking") return `<div class="otium-slot"><span class="otium-label">${L("Station.Fire", { n })} · ${name}</span>${bar("cook", i, "neutral")}</div>`;
        if (slot.state === "ready") {
          return `<div class="otium-slot ready" data-drag="stove:${i}" data-label="${name}">
            <span class="otium-label">${L("Station.Fire", { n })} · ${L("Station.Ready")}</span>${bar("burn", i)}
            <button type="button" class="otium-primary" data-action="takeOut" data-slot="${i}" ${disabled ? "disabled" : ""}>${L("Station.TakeOut", { dish: name })}</button></div>`;
        }
        return `<div class="otium-slot burnt"><span class="otium-label">${L("Station.Fire", { n })} · ${L("Station.Burnt")}</span>
          <button type="button" data-action="trash" data-slot="${i}">${L("Station.Trash")}</button></div>`;
      })
      .join("");
    return `<div class="otium-station"><h4>${L("Station.Stove")}</h4>${slots}</div>`;
  }

  _boardHtml(s, disabled) {
    const dishes = s.menu.filter((m) => m.station === "board");
    const full = s.board.every(Boolean);
    const buttons = dishes.map((d) => `<button type="button" data-action="prep" data-m="${d.id}" ${disabled || full ? "disabled" : ""}>${esc(d.name)}</button>`).join("");
    const slots = s.board
      .map((slot, i) =>
        slot
          ? `<div class="otium-slot"><span class="otium-label">${esc(s.staff[slot.staff]?.name ?? "")} · ${esc(menuItem(s, slot.m)?.name)}</span>${bar("board", i, "neutral")}</div>`
          : `<div class="otium-slot"><span class="otium-label">${L("Station.Board", { n: i + 1 })} · ${L("Station.Free")}</span></div>`
      )
      .join("");
    return `<div class="otium-station"><h4>${L("Station.Cellar")}</h4><div class="otium-chips">${buttons || `<span class="hint">${L("Station.Empty")}</span>`}</div>${slots}</div>`;
  }

  _counterHtml(s, st, disabled) {
    const groups = [];
    for (const d of s.pass) {
      const g = groups.find((x) => x.m === d.m && x.perfect === d.perfect);
      if (g) g.uids.push(d.uid);
      else groups.push({ m: d.m, perfect: d.perfect, uids: [d.uid] });
    }
    groups.sort((a, b) => (STATION_ORDER[menuItem(s, a.m)?.station] ?? 3) - (STATION_ORDER[menuItem(s, b.m)?.station] ?? 3));
    const trayFull = st.tray.length >= SERVICE.tray;
    const dishTile = (m, perfect, extra = "") => {
      const item = menuItem(s, m);
      return `<span class="otium-dish-name">${esc(item?.name)}</span>${perfect ? `<span class="otium-dish-tag">${L("Perfect")}</span>` : ""}${extra}`;
    };

    const pass = groups
      .map((g) => {
        const item = menuItem(s, g.m);
        return `<button type="button" class="otium-dish st-${item?.station}" data-action="take" data-uid="${g.uids[0]}" data-drag="pass:${g.uids[0]}" data-label="${esc(item?.name)}"
          ${trayFull ? "disabled" : ""} data-tooltip="${esc(trayFull ? L("Counter.TrayFull") : L("Counter.TakeHint"))}">
          ${dishTile(g.m, g.perfect, g.uids.length > 1 ? `<span class="otium-dish-count">×${g.uids.length}</span>` : "")}</button>`;
      })
      .join("");

    const slots = Array.from({ length: SERVICE.tray }, (_, i) => {
      const d = st.tray[i];
      if (!d) return `<div class="otium-tray-slot empty">${L("Counter.FreeSlot")}</div>`;
      const item = menuItem(s, d.m);
      return `<div class="otium-dish otium-tray-slot st-${item?.station}" data-drag="tray:${d.uid}" data-label="${esc(item?.name)}" data-tooltip="${esc(L("Counter.DragHint"))}">
        ${dishTile(d.m, d.perfect)}
        <button type="button" class="otium-dish-remove" data-action="drop" data-uid="${d.uid}" aria-label="${esc(L("Counter.PutBack"))}" data-tooltip="${esc(L("Counter.PutBack"))}">×</button></div>`;
    }).join("");

    const targets = s.tables
      .map((tb) => ({ tb, ticket: tb.ticket && s.tickets[tb.ticket] }))
      .filter(({ ticket }) => ticket && ticket.phase === "order")
      .map(({ tb, ticket }) => {
        const pool = st.tray.map((d) => d.m);
        let count = 0;
        for (const it of ticket.items) {
          if (it.served) continue;
          const k = pool.indexOf(it.m);
          if (k >= 0) {
            pool.splice(k, 1);
            count++;
          }
        }
        const urgent = ticket.deadline !== null && (ticket.deadline - serviceNow()) / ticket.patienceMax < 0.35;
        return { n: tb.n, count, urgent };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.urgent - a.urgent || b.count - a.count);

    let serveBar;
    if (!st.tray.length) serveBar = `<p class="hint">${L("Counter.EmptyTray")}</p>`;
    else if (!targets.length) serveBar = `<p class="hint">${L("Counter.NoMatch")}</p>`;
    else
      serveBar = `<div class="otium-serve-to"><span class="otium-label">${L("Server.Serve")}</span>${targets
        .map((x) => `<button type="button" class="${x.urgent ? "otium-primary" : ""}" data-action="serve" data-table="${x.n}" ${disabled ? "disabled" : ""}>${L("Table", { n: x.n })} · ${x.count}</button>`)
        .join("")}</div>`;

    return `
      <div class="otium-counter">
        <section class="otium-shelf" data-drop="pass">
          <header><h3 class="otium-section">${L("Counter.Pass")}</h3><span class="hint">${L("Counter.Ready", { n: s.pass.length })}</span></header>
          <div class="otium-dish-grid">${pass || `<p class="hint">${L("Counter.PassEmpty")}</p>`}</div>
        </section>
        <section class="otium-shelf" data-drop="tray">
          <header><h3 class="otium-section">${L("Counter.Tray", { name: esc(st.name) })}</h3><span class="hint">${st.tray.length}/${SERVICE.tray}</span></header>
          <div class="otium-tray-slots">${slots}</div>
          ${serveBar}
        </section>
      </div>`;
  }

  updateLive() {
    super.updateLive();
    const beer = this.element?.querySelector("[data-otium-beer]");
    if (!beer) return;
    const level = this.tapLevel();
    beer.style.height = `${Math.min(100, level)}%`;
    beer.style.borderTopWidth = level > 3 ? "6px" : "0";
    if (this.tap && level >= 100) this.releaseTap();
  }

  /* ---- Tireuse ---- */

  tapLevel() {
    if (!this.tap) return 0;
    const speed = getService()?.speed ?? 1;
    return ((performance.now() - this.tap.start) / 1000) * SERVICE.tapSpeed * speed;
  }

  startTap() {
    const s = getService();
    const st = this.staff;
    if (!s?.running || !st || this.tap || isBusy(st)) return;
    this.tap = { m: this.drink, start: performance.now() };
    this.element.querySelector("[data-tap]")?.classList.add("holding");
  }

  releaseTap() {
    if (!this.tap) return;
    const level = this.tapLevel();
    const m = this.tap.m;
    this.tap = null;
    sendOp({ type: "tap", actorId: this.actorId, m, level: Math.round(level) });
    this.render();
  }

  /* ---- Glisser-déposer ---- */

  performDrop(src, dst) {
    const [kind, id] = src.split(":");
    const [zone, target] = (dst ?? "").split(":");
    if (!zone) return;
    const actorId = this.actorId;
    if (kind === "pass" && zone === "tray") return sendOp({ type: "take", actorId, uid: id });
    if (kind === "pass" && zone === "table") return sendOp({ type: "serve", actorId, table: target, uid: id });
    if (kind === "tray" && zone === "pass") return sendOp({ type: "drop", actorId, uid: id });
    if (kind === "tray" && zone === "table") return sendOp({ type: "serve", actorId, table: target });
    if (kind === "stove" && (zone === "pass" || zone === "tray")) return sendOp({ type: "takeOut", actorId, slot: id, toTray: zone === "tray" });
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const root = this.element;

    root.addEventListener("change", (event) => {
      if (event.target.name === "drink") this.drink = event.target.value;
      if (event.target.name === "actor") this.pendingActor = event.target.value;
    });

    root.addEventListener("pointerdown", (event) => {
      if (event.button > 0) return;
      const tapBtn = event.target.closest("[data-tap]");
      if (tapBtn && !tapBtn.disabled) {
        event.preventDefault();
        this.startTap();
        return;
      }
      const el = event.target.closest("[data-drag]");
      if (!el || el.disabled || event.target.closest(".otium-dish-remove")) return;
      this.drag = { src: el.dataset.drag, label: el.dataset.label ?? "", x: event.clientX, y: event.clientY, active: false, ghost: null };
    });

    root.addEventListener("keydown", (event) => {
      if (event.code === "Space" && event.target.closest?.("[data-tap]") && !event.repeat) {
        event.preventDefault();
        this.startTap();
      }
    });

    // Un glisser ne compte pas aussi comme un clic
    root.addEventListener(
      "click",
      (event) => {
        if (!this.suppressClick) return;
        this.suppressClick = false;
        event.stopPropagation();
        event.preventDefault();
      },
      true
    );

    this._docHandlers = {
      pointermove: (event) => this.#dragMove(event),
      pointerup: (event) => {
        this.releaseTap();
        this.#dragEnd(event, false);
      },
      pointercancel: (event) => {
        this.releaseTap();
        this.#dragEnd(event, true);
      },
      keyup: (event) => {
        if (event.code === "Space" && this.tap) {
          event.preventDefault();
          this.releaseTap();
        }
      },
      keydown: (event) => {
        if (event.key === "Escape" && this.drag?.active) this.#dragEnd(event, true);
      }
    };
    for (const [type, fn] of Object.entries(this._docHandlers)) document.addEventListener(type, fn);
  }

  _onClose(options) {
    super._onClose(options);
    for (const [type, fn] of Object.entries(this._docHandlers ?? {})) document.removeEventListener(type, fn);
    this.drag?.ghost?.remove();
    this.drag = null;
    if (this.cash) sendOp({ type: "cashCancel", actorId: this.actorId });
  }

  #dropZoneAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest("[data-drop]");
    return el && this.element?.contains(el) ? el : null;
  }

  #dragMove(event) {
    const d = this.drag;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(event.clientX - d.x, event.clientY - d.y) < 6) return;
      d.active = true;
      d.ghost = document.createElement("div");
      d.ghost.className = "otium-drag-ghost";
      d.ghost.textContent = d.label;
      document.body.append(d.ghost);
      this.element.classList.add("otium-dragging");
    }
    d.ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
    const zone = this.#dropZoneAt(event.clientX, event.clientY);
    for (const z of this.element.querySelectorAll(".drop-hover")) if (z !== zone) z.classList.remove("drop-hover");
    zone?.classList.add("drop-hover");
  }

  #dragEnd(event, cancelled) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.active) return;
    d.ghost.remove();
    this.element?.classList.remove("otium-dragging");
    for (const z of this.element?.querySelectorAll(".drop-hover") ?? []) z.classList.remove("drop-hover");
    this.suppressClick = true;
    setTimeout(() => (this.suppressClick = false), 0);
    if (!cancelled) this.performDrop(d.src, this.#dropZoneAt(event.clientX, event.clientY)?.dataset.drop);
  }

  /* ---- Actions ---- */

  static #onJoin() {
    const id = this.element.querySelector("select[name=actor]")?.value ?? this.pendingActor;
    if (!id) return;
    this.actorId = id;
    return sendOp({ type: "join", actorId: id });
  }

  static #onLeave() {
    const id = this.actorId;
    this.actorId = null;
    return sendOp({ type: "leave", actorId: id });
  }

  static #onCash(event, target) {
    this.cash = { table: Number(target.dataset.table), change: 0 };
    return sendOp({ type: "cashStart", actorId: this.actorId, table: target.dataset.table });
  }

  static #onCoin(event, target) {
    if (!this.cash) return;
    const v = Number(target.dataset.value);
    this.cash.change = v === 0 ? 0 : this.cash.change + v;
    const shown = this.element.querySelector("[data-cash-change]");
    if (shown) shown.textContent = formatCp(this.cash.change);
  }

  static #onCashConfirm() {
    if (!this.cash) return;
    const change = this.cash.change;
    this.cash = null;
    return sendOp({ type: "cashEnd", actorId: this.actorId, change });
  }

  static #onCashCancel() {
    this.cash = null;
    return sendOp({ type: "cashCancel", actorId: this.actorId });
  }
}

/* ============================================ */
/*  Vue MJ                                      */
/* ============================================ */

export class ServiceGMApp extends ServiceApp {
  constructor(options = {}) {
    super({ id: "otium-service-gm", ...options });
  }

  static DEFAULT_OPTIONS = {
    classes: ["otium", "otium-service", "otium-service-gm"],
    window: { icon: "fa-solid fa-clipboard-list", resizable: true },
    position: { width: 640, height: "auto" },
    actions: {
      open: ServiceGMApp.#onOpen,
      start: () => sendOp({ type: "start" }),
      pause: () => sendOp({ type: "pause" }),
      speed: (event, target) => sendOp({ type: "speed", value: Number(target.dataset.value) }),
      spawn: (event, target) => sendOp({ type: "spawn", variant: target.dataset.variant }),
      end: ServiceGMApp.#onEnd,
      openServer: () => openServiceServer(),
      openClient: () => openServiceClient(),
      payTips: () => payTips(),
      dismiss: () => dismissSummary()
    }
  };

  get title() {
    return L("GM.Title");
  }

  _html() {
    const s = getService();
    if (!s) return this._setupHtml();
    const st = s.stats;
    const sat = st.finished ? Math.round((100 * st.happy) / st.finished) : 100;

    const tables = s.tables
      .map((tb) => {
        const ticket = tb.ticket && s.tickets[tb.ticket];
        if (!ticket) {
          const who = tb.reserved ? ` (${L("Server.Settling", { name: esc(game.actors.get(tb.reserved)?.name ?? "") })})` : "";
          return `<tr><td>${tb.n}</td><td class="hint" colspan="3">${L("Server.FreeTable")}${who}</td></tr>`;
        }
        const served = ticket.items.filter((it) => it.served).length;
        const state = ticket.phase === "bill" ? L("GM.WaitingBill") : L("GM.ServedCount", { served, total: ticket.items.length });
        return `<tr><td>${tb.n}</td><td>${ticket.calling ? '<i class="fa-solid fa-bell"></i> ' : ""}${esc(ticket.name)}</td><td>${state}</td>
          <td>${ticket.deadline === null ? `<span class="hint">${L("Server.Player")}</span>` : bar("ticket", ticket.id)}</td></tr>`;
      })
      .join("");

    const now = serviceNow();
    const staff = Object.values(s.staff)
      .map((member) => `<tr><td>${esc(member.name)}</td>
        <td>${isBusy(member, now) ? esc(L(`Busy.${member.busy.key}`, member.busy.data)) : `<span class="hint">${L("Server.Free")}</span>`}</td>
        <td>${member.tray.map((d) => esc(menuItem(s, d.m)?.name)).join(", ") || `<span class="hint">${L("GM.EmptyTray")}</span>`}</td></tr>`)
      .join("");

    const log = s.log
      .map((l) => `<li class="${l.kind}"><span class="otium-clock">${clock(l.t)}</span><span>${esc(L(`Log.${l.key}`, l.data))}</span></li>`)
      .join("");

    return `
      <p class="otium-gm-tavern"><strong>${esc(s.tavernName)}</strong> · <span class="otium-clock" data-otium-clock>${clock(now)}</span>
        · ${L(s.running ? "GM.Running" : s.t > 0 ? "GM.Paused" : "GM.NotStarted")}</p>
      <div class="otium-row">
        ${s.running
          ? `<button type="button" data-action="pause"><i class="fa-solid fa-pause"></i> ${L("GM.Pause")}</button>`
          : `<button type="button" class="otium-primary" data-action="start"><i class="fa-solid fa-play"></i> ${L(s.t > 0 ? "GM.Resume" : "GM.Start")}</button>`}
        <span class="otium-seg">${[1, 2].map((v) => `<button type="button" class="${s.speed === v ? "active" : ""}" data-action="speed" data-value="${v}">×${v}</button>`).join("")}</span>
        <button type="button" data-action="end"><i class="fa-solid fa-flag-checkered"></i> ${L("GM.End")}</button>
      </div>
      <div class="otium-row">
        <label class="otium-row">${L("GM.Rush")}
          <select name="rush">${Object.keys(RUSH).map((r) => `<option value="${r}" ${s.rush === r ? "selected" : ""}>${L(`Rush.${r}`)}</option>`).join("")}</select></label>
        <label class="otium-row">${L("GM.Patience")}
          <input type="range" name="patience" min="0.5" max="2" step="0.25" value="${s.patienceMul}"><span class="otium-clock">×${s.patienceMul}</span></label>
      </div>
      <div class="otium-row">
        <span class="otium-label">${L("GM.Events")}</span>
        <button type="button" data-action="spawn" data-variant="normal">${L("GM.AddClient")}</button>
        <button type="button" data-action="spawn" data-variant="hurry">${L("GM.AddHurry")}</button>
        <button type="button" data-action="spawn" data-variant="big">${L("GM.AddBig")}</button>
      </div>
      <div class="otium-stats">
        <div><span class="otium-label">${L("Stats.Served")}</span><b>${st.served}</b></div>
        <div><span class="otium-label">${L("Stats.Left")}</span><b>${st.failed + st.unpaid}</b></div>
        <div><span class="otium-label">${L("Stats.Revenue")}</span><b>${formatCp(st.revenue)}</b></div>
        <div><span class="otium-label">${L("Stats.Tips")}</span><b>${formatCp(st.tips)}</b></div>
        <div><span class="otium-label">${L("Stats.Satisfaction")}</span><b>${sat} %</b></div>
      </div>
      <h3 class="otium-section">${L("Server.Room")}</h3>
      <div class="otium-scroll"><table class="otium-grid"><thead><tr><th>${L("GM.Table")}</th><th>${L("GM.Client")}</th><th>${L("GM.State")}</th><th>${L("GM.PatienceCol")}</th></tr></thead><tbody>${tables}</tbody></table></div>
      <h3 class="otium-section">${L("GM.Staff")}</h3>
      ${staff
        ? `<div class="otium-scroll"><table class="otium-grid"><thead><tr><th>${L("GM.Waiter")}</th><th>${L("GM.Doing")}</th><th>${L("GM.Tray")}</th></tr></thead><tbody>${staff}</tbody></table></div>`
        : `<p class="hint">${L("GM.NoStaff")}</p>`}
      <h3 class="otium-section">${L("GM.Log")}</h3>
      <ul class="otium-log">${log}</ul>
      <footer class="otium-footer">
        <button type="button" data-action="openServer"><i class="fa-solid fa-bell-concierge"></i> ${L("GM.OpenServer")}</button>
        <button type="button" data-action="openClient"><i class="fa-solid fa-beer-mug-empty"></i> ${L("GM.OpenClient")}</button>
      </footer>`;
  }

  _setupHtml() {
    const summary = getSummary();
    let summaryHtml = "";
    if (summary) {
      const st = summary.stats;
      const sat = st.finished ? Math.round((100 * st.happy) / st.finished) : 100;
      summaryHtml = `
        <section class="otium-summary">
          <h3>${L("Summary.Title", { tavern: esc(summary.tavernName) })}</h3>
          <div class="otium-stats">
            <div><span class="otium-label">${L("Stats.Revenue")}</span><b>${formatCp(st.revenue)}</b></div>
            <div><span class="otium-label">${L("Stats.Tips")}</span><b>${formatCp(st.tips)}</b></div>
            <div><span class="otium-label">${L("Stats.Satisfaction")}</span><b>${sat} %</b></div>
          </div>
          <p>${L("Summary.Line", { served: st.served, failed: st.failed, unpaid: st.unpaid })} ${L("Summary.Extra", { perfect: st.perfect, burnt: st.burnt })}</p>
          ${summary.staff.length
            ? `<p>${L("Summary.Share", { names: summary.staff.map((x) => esc(x.name)).join(", "), share: formatCp(summary.share) })}</p>`
            : `<p class="hint">${L("Summary.NoStaff")}</p>`}
          <div class="otium-row">
            ${summary.staff.length && summary.share
              ? `<button type="button" class="otium-primary" data-action="payTips" ${summary.paid ? "disabled" : ""}><i class="fa-solid fa-coins"></i> ${L(summary.paid ? "Summary.PaidButton" : "Summary.Pay")}</button>`
              : ""}
            <button type="button" data-action="dismiss">${L("Summary.Dismiss")}</button>
          </div>
        </section>`;
    }
    const tavern = sceneTavern();
    const setup = tavern
      ? `<p>${L("GM.SetupHint", { tavern: esc(tavern.name || t("Tavern.Unnamed")) })}</p>
        <div class="otium-row">
          <label class="otium-row">${L("GM.Tables")} <input type="number" name="tables" value="6" min="1" max="12" step="1" style="width:4rem"></label>
          <button type="button" class="otium-primary" data-action="open"><i class="fa-solid fa-door-open"></i> ${L("GM.Open")}</button>
        </div>`
      : `<p class="hint">${t("Menu.NoTavern")}</p>`;
    return `${summaryHtml}${setup}`;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("select[name=rush]")?.addEventListener("change", (event) => sendOp({ type: "rush", value: event.target.value }));
    this.element.querySelector("input[name=patience]")?.addEventListener("change", (event) => sendOp({ type: "patience", value: Number(event.target.value) }));
  }

  static async #onOpen() {
    const tables = Number(this.element.querySelector("input[name=tables]")?.value) || 6;
    await openService({ tables });
  }

  static async #onEnd() {
    const ok = await DialogV2.confirm({
      window: { title: L("GM.End") },
      content: `<p>${L("GM.EndConfirm")}</p>`
    });
    if (ok) await sendOp({ type: "end" });
  }
}

/* ============================================ */
/*  Vue Client                                  */
/* ============================================ */

export class ServiceClientApp extends ServiceApp {
  constructor(options = {}) {
    super({ id: "otium-service-client", ...options });
    this.actorId = defaultBuyer()?.id ?? null;
    /** @type {Map<string, number>} */
    this.cart = new Map();
  }

  static DEFAULT_OPTIONS = {
    classes: ["otium", "otium-service", "otium-menu", "otium-service-client"],
    window: { icon: "fa-solid fa-beer-mug-empty", resizable: true },
    position: { width: 440, height: "auto" },
    actions: {
      sit: ServiceClientApp.#onSit,
      standUp: ServiceClientApp.#onStandUp,
      inc: ServiceClientApp.#onInc,
      dec: ServiceClientApp.#onDec,
      order: ServiceClientApp.#onOrder,
      call: ServiceClientApp.#onCall
    }
  };

  get title() {
    return getService()?.tavernName ?? L("Client.Title");
  }

  get actor() {
    return game.actors.get(this.actorId) ?? null;
  }

  _html() {
    const s = getService();
    if (!s) return `<p class="notice">${L("None")}</p>`;
    const candidates = buyerCandidates();
    if (!candidates.length) return `<p class="notice">${t("Menu.NoCharacter")}</p>`;
    if (!candidates.some((a) => a.id === this.actorId)) this.actorId = candidates[0].id;
    const actor = this.actor;

    const head = `
      <div class="form-group">
        <label>${t("Menu.Buyer")}</label>
        <div class="form-fields"><select name="buyer">${candidates.map((a) => `<option value="${a.id}" ${a.id === this.actorId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></div>
      </div>
      <p class="otium-wallet"><i class="fa-solid fa-coins"></i> ${t("Menu.Wallet")} : ${formatWallet(actor.system?.currency)}</p>`;

    const table = s.tables.find((tb) => tb.reserved === actor.id);
    const ticket = table?.ticket ? s.tickets[table.ticket] : null;

    if (!table) {
      const free = s.tables.filter((tb) => !tb.ticket && !tb.reserved);
      return `${head}
        <p class="notice">${L("Client.ChooseTable")}</p>
        <div class="otium-row">${free.map((tb) => `<button type="button" data-action="sit" data-table="${tb.n}">${L("Table", { n: tb.n })}</button>`).join("") || `<span class="hint">${L("Notice.Full")}</span>`}</div>`;
    }

    if (!ticket) {
      const rows = s.menu
        .map((m) => {
          const left = m.stock === null ? Infinity : m.stock - (s.consumed[m.id] ?? 0);
          const q = this.cart.get(m.id) ?? 0;
          if (left <= 0) return "";
          return `<li class="otium-item ${q ? "in-cart" : ""}">
            <div class="otium-item-main"><span class="otium-item-name">${esc(m.name)}</span>${left !== Infinity ? `<span class="otium-stock">${t("Menu.Left", { n: left })}</span>` : ""}</div>
            <span class="otium-price">${formatCp(m.price)}</span>
            <div class="otium-qty">
              <button type="button" data-action="dec" data-m="${m.id}" ${q ? "" : "disabled"}><i class="fa-solid fa-minus"></i></button>
              <span>${q}</span>
              <button type="button" data-action="inc" data-m="${m.id}" ${q >= left ? "disabled" : ""}><i class="fa-solid fa-plus"></i></button>
            </div></li>`;
        })
        .join("");
      const total = [...this.cart].reduce((sum, [m, q]) => sum + (menuItem(s, m)?.price ?? 0) * q, 0);
      const enough = walletToCp(actor.system?.currency) >= total;
      return `${head}
        ${table.paidNote ? `<p class="notice">${esc(t(table.paidNote.key, table.paidNote.data))} ${L("Client.Thanks")}</p>` : ""}
        <p class="otium-label">${L("Table", { n: table.n })} · ${L("Client.Menu")}</p>
        <ul class="otium-items">${rows}</ul>
        <footer class="otium-footer">
          <span class="otium-total ${enough ? "" : "too-much"}">${t("Order.Total")} : <strong>${formatCp(total)}</strong></span>
          <span class="otium-row">
            <button type="button" data-action="standUp">${L("Client.StandUp")}</button>
            <button type="button" class="otium-primary" data-action="order" ${total && enough ? "" : "disabled"}><i class="fa-solid fa-bell-concierge"></i> ${t("Menu.Order")}</button>
          </span>
        </footer>
        <p class="hint">${L("Client.Hint")}</p>`;
    }

    const served = ticket.items.filter((it) => it.served).length;
    const steps = [
      [L("Client.StepTaken"), true, false],
      [L("Client.StepServing", { served, total: ticket.items.length }), ticket.phase === "bill", ticket.phase === "order"],
      [L("Client.StepBill", { total: formatCp(ticketTotal(s, ticket)) }), false, ticket.phase === "bill"]
    ];
    return `${head}
      <p class="otium-label">${L("Table", { n: table.n })} · ${L("Client.YourOrder")}</p>
      <div class="otium-chips">${ticketChips(s, ticket)}</div>
      <ul class="otium-steps">${steps.map(([label, done, on]) => `<li class="${done ? "done" : on ? "on" : ""}"><span class="otium-dot"></span>${esc(label)}</li>`).join("")}</ul>
      ${ticket.phase === "bill" ? `<p class="notice">${L("Client.BillHint", { total: formatCp(ticketTotal(s, ticket)) })}</p>` : ""}
      <div class="otium-row"><button type="button" data-action="call" ${ticket.calling ? "disabled" : ""}><i class="fa-solid fa-bell"></i> ${L(ticket.calling ? "Client.Called" : "Client.Call")}</button></div>`;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("select[name=buyer]")?.addEventListener("change", (event) => {
      this.actorId = event.target.value;
      this.cart.clear();
      this.render();
    });
  }

  static #onSit(event, target) {
    return sendOp({ type: "sit", actorId: this.actorId, table: target.dataset.table });
  }

  static #onStandUp() {
    return sendOp({ type: "standUp", actorId: this.actorId });
  }

  static #onInc(event, target) {
    const m = target.dataset.m;
    this.cart.set(m, (this.cart.get(m) ?? 0) + 1);
    this.render();
  }

  static #onDec(event, target) {
    const m = target.dataset.m;
    const q = (this.cart.get(m) ?? 0) - 1;
    if (q > 0) this.cart.set(m, q);
    else this.cart.delete(m);
    this.render();
  }

  static async #onOrder() {
    const items = [...this.cart].flatMap(([m, q]) => Array(q).fill(m));
    if (!items.length) return;
    this.cart.clear();
    await sendOp({ type: "order", actorId: this.actorId, items });
    this.render();
  }

  static #onCall() {
    return sendOp({ type: "call", actorId: this.actorId });
  }
}

/* -------------------------------------------- */
/*  Ouvrir les fenêtres                         */
/* -------------------------------------------- */

function openSingle(Cls) {
  const existing = [...openApps].find((app) => app instanceof Cls);
  if (existing) return existing.render({ force: true });
  return new Cls().render({ force: true });
}

export const openServiceServer = () => openSingle(ServiceServerApp);
export const openServiceGM = () => openSingle(ServiceGMApp);
export const openServiceClient = () => openSingle(ServiceClientApp);
