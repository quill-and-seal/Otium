/**
 * Encart des postes de service : une petite case dans un coin de l'écran, tant que le jeton du joueur
 * est dans un poste (comptoir, cuisine…) ou sur une table. Elle dit où l'on est, ce qu'on peut y faire
 * et où en est le service ; un clic ouvre la bonne vue (poste de serveur, ou commande à table).
 *
 * Seul le propriétaire du jeton la voit. Le coin (ou « désactivé ») se choisit dans les réglages du module.
 */

import { MODULE_ID, t, esc } from "./constants.js";
import { sceneTavern } from "./store.js";
import { SERVICE, getService, onServiceChange, ticketElapsed, tierOf, formatTime, tableName } from "./service.js";
import { openServiceServer, openServiceClient } from "./service-apps.js";
import { openSceneMenu } from "./apps.js";

/** Coins possibles (réglage client « zoneCard »). */
export const CORNERS = ["off", "top-left", "top-right", "bottom-left", "bottom-right"];

const ICONS = {
  pass: "fa-solid fa-utensils",
  tap: "fa-solid fa-beer-mug-empty",
  stove: "fa-solid fa-fire-burner",
  board: "fa-solid fa-cheese",
  cash: "fa-solid fa-coins"
};

/** Lieu où se trouve le jeton du joueur : { regionId, place, zone, actorId, hidden } */
let current = null;
let el = null;
let ticker = null;

function corner() {
  try {
    const v = game.settings.get(MODULE_ID, "zoneCard");
    return CORNERS.includes(v) ? v : "bottom-right";
  } catch {
    return "bottom-right";
  }
}

/** Le jeton du joueur entre dans un poste ou sur une table. */
export function zoneEntered(zone, { regionId, place, actor }) {
  current = { regionId, place, zone, actorId: actor?.id ?? null, hidden: false };
  render();
}

/** Le jeton sort d'une zone : l'encart disparaît si c'était celle qu'il montrait. */
export function zoneLeft({ regionId, actor }) {
  if (!current) return;
  if (regionId && current.regionId && regionId !== current.regionId) return;
  if (actor && current.actorId && actor.id !== current.actorId) return;
  current = null;
  render();
}

/** Redessine l'encart (service modifié, réglage changé…). */
export function refreshZoneCard() {
  render();
}

onServiceChange(() => render());

/* -------------------------------------------- */
/*  Rendu                                       */
/* -------------------------------------------- */

function ensureElement() {
  if (el) return el;
  el = document.createElement("aside");
  el.id = "otium-zone-card";
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  el.addEventListener("click", (event) => {
    if (event.target.closest("[data-otium-card-close]")) {
      if (current) current.hidden = true;
      return render();
    }
    open();
  });
  el.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });
  document.body.append(el);
  return el;
}

function render() {
  const where = corner();
  if (!current || current.hidden || where === "off") {
    el?.classList.remove("show");
    stopTicker();
    return;
  }
  const card = ensureElement();
  const { zone, place } = current;
  const table = zone.mode === "table";
  const actor = game.actors.get(current.actorId);
  const s = getService();
  const tableLabel = s ? tableName(zone.table) : t("Service.Table", { n: zone.table });
  // Une table prend son nom de service (« Coin du feu ») ; un poste, le nom de sa Région
  const title = table ? (s ? tableLabel : place || tableLabel) : place || t("Card.Station");

  // Ce qu'on peut faire ici
  let what;
  if (table) {
    const number = t("Service.Table", { n: zone.table });
    what = title === number ? "" : `<span><i class="fa-solid fa-chair"></i> ${number}</span>`;
  } else {
    const actions = [...(zone.actions ?? [])];
    what = actions.length
      ? actions.map((a) => `<span><i class="${ICONS[a] ?? "fa-solid fa-circle"}"></i> ${t(`Zone.${a}`)}</span>`).join("")
      : `<span>${t("Card.Nothing")}</span>`;
  }

  // Où en est le service
  let info = "";
  let action = "";
  if (!s) {
    info = `<p class="otium-card-state">${t("Card.NoService")}</p>`;
    action = table && sceneTavern() ? t("Card.OpenMenu") : "";
  } else if (table) {
    const tb = s.tables.find((x) => x.n === zone.table);
    const ticket = tb?.ticket ? s.tickets[tb.ticket] : null;
    if (s.staff[current.actorId]) {
      info = `<p class="otium-card-state">${t("Card.StaffAtTable", { name: esc(actor?.name ?? "") })}</p>`;
    } else if (ticket && ticket.actorId === current.actorId) {
      const served = ticket.items.filter((it) => it.served).length;
      const elapsed = ticketElapsed(ticket);
      const tier = ticket.tier ?? tierOf(elapsed, ticket.target).key;
      info = `
        <p class="otium-card-state">${ticket.phase === "bill" ? t("Card.Bill") : t("Card.Served", { served, total: ticket.items.length })}</p>
        <p class="otium-card-timer tier-${tier}"><i class="fa-solid fa-stopwatch"></i> <b data-card-clock>${formatTime(elapsed)}</b> · ${t(`Service.Tier.${tier}`)}</p>`;
      action = t("Card.Follow");
    } else if (ticket) {
      info = `<p class="otium-card-state">${t("Card.TableTaken")}</p>`;
    } else {
      info = `<p class="otium-card-state">${t("Card.Seated", { name: esc(actor?.name ?? "") })}</p>`;
      action = t("Card.OpenClient");
    }
  } else {
    const st = s.staff[current.actorId];
    const waiting = Object.values(s.tickets).filter((tk) => tk.phase === "order").length;
    const bills = Object.values(s.tickets).filter((tk) => tk.phase === "bill").length;
    info = `
      <p class="otium-card-state">${st ? t("Card.OnDuty", { name: esc(st.name) }) : t("Card.NotOnDuty")}${s.running ? "" : ` · ${t("Card.Paused")}`}</p>
      <ul class="otium-card-stats">
        <li><b>${s.pass.length}</b> ${t("Card.Ready")}</li>
        <li><b>${st ? st.tray.length : 0}/${SERVICE.tray}</b> ${t("Card.Tray")}</li>
        <li><b>${waiting}</b> ${t("Card.Waiting")}</li>
        <li><b>${bills}</b> ${t("Card.Bills")}</li>
      </ul>`;
    action = t("Card.OpenServer");
  }

  card.className = `otium-zone-card corner-${where} ${table ? "is-table" : "is-work"} ${s ? "" : "is-closed"} show`;
  card.setAttribute("aria-label", action ? `${title} — ${action}` : title);
  card.innerHTML = `
    <header>
      <i class="fa-solid ${table ? "fa-chair" : "fa-bell-concierge"}"></i>
      <strong>${esc(title)}</strong>
      <button type="button" class="otium-card-close" data-otium-card-close aria-label="${esc(t("Card.Hide"))}" data-tooltip="${esc(t("Card.Hide"))}">×</button>
    </header>
    ${what ? `<div class="otium-card-what">${what}</div>` : ""}
    ${info}
    ${action ? `<footer><i class="fa-solid fa-hand-pointer"></i> ${action}</footer>` : ""}`;

  // Le chrono d'une commande à table avance chaque seconde
  if (s && table) startTicker();
  else stopTicker();
}

function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    const s = getService();
    const clockEl = el?.querySelector("[data-card-clock]");
    if (!s || !clockEl || !current) return;
    const tb = s.tables.find((x) => x.n === current.zone.table);
    const ticket = tb?.ticket ? s.tickets[tb.ticket] : null;
    if (ticket) clockEl.textContent = formatTime(ticketElapsed(ticket));
  }, 1000);
}

function stopTicker() {
  clearInterval(ticker);
  ticker = null;
}

/** Clic sur l'encart : la bonne vue pour ce lieu. */
function open() {
  if (!current) return;
  const s = getService();
  const table = current.zone.mode === "table";
  if (s) {
    if (table && !s.staff[current.actorId]) return openServiceClient(current.actorId);
    if (!table) return openServiceServer(current.actorId);
  } else if (table && sceneTavern()) {
    return openSceneMenu();
  }
}
