/**
 * Bandeau des postes de service : quand un joueur amène son jeton dans un poste (comptoir, cuisine…)
 * ou sur une table, un bandeau apparaît en haut de l'écran avec le nom du lieu et ce qu'on peut y faire.
 * Seul le propriétaire du jeton le voit. Il disparaît tout seul après quelques secondes.
 */

import { MODULE_ID, t, esc } from "./constants.js";

const DURATION = 4500;

/** Icône de chaque action d'un poste. */
const ICONS = {
  pass: "fa-solid fa-utensils",
  tap: "fa-solid fa-beer-mug-empty",
  stove: "fa-solid fa-fire-burner",
  board: "fa-solid fa-cheese",
  cash: "fa-solid fa-coins"
};

let el = null;
let timer = null;

export function bannerEnabled() {
  try {
    return game.settings.get(MODULE_ID, "zoneBanner") !== false;
  } catch {
    return true;
  }
}

/**
 * Affiche le bandeau d'un poste.
 * @param {object} zone   données du comportement (mode, actions, table)
 * @param {object} info   { place: nom de la Région, actor, service: bool, staff: bool }
 */
export function showZoneBanner(zone, { place, actor, service, staff } = {}) {
  if (!bannerEnabled()) return;
  const table = zone.mode === "table";
  const title = place || (table ? t("Service.Table", { n: zone.table }) : t("Banner.Station"));

  let detail;
  if (table) {
    // Le numéro de table n'est répété que si la Région porte un autre nom (« Coin du feu »…)
    const label = t("Service.Table", { n: zone.table });
    detail = title === label ? "" : `<span><i class="fa-solid fa-chair"></i> ${label}</span>`;
  } else {
    const actions = [...(zone.actions ?? [])];
    detail = actions.length
      ? actions.map((a) => `<span><i class="${ICONS[a] ?? "fa-solid fa-circle"}"></i> ${t(`Zone.${a}`)}</span>`).join("")
      : `<span>${t("Banner.Nothing")}</span>`;
  }

  let status;
  if (!service) status = t("Banner.NoService");
  else if (table) status = staff ? t("Banner.StaffAtTable", { name: esc(actor?.name ?? "") }) : t("Banner.Seated", { name: esc(actor?.name ?? "") });
  else status = t("Banner.OnDuty", { name: esc(actor?.name ?? "") });

  if (!el) {
    el = document.createElement("div");
    el.id = "otium-banner";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.addEventListener("click", hideZoneBanner);
    document.body.append(el);
  }
  el.className = `otium-banner ${table ? "is-table" : "is-work"} ${service ? "" : "is-closed"}`;
  el.innerHTML = `
    <div class="otium-banner-title"><i class="fa-solid ${table ? "fa-chair" : "fa-bell-concierge"}"></i> ${esc(title)}</div>
    <div class="otium-banner-detail">${detail}</div>
    <div class="otium-banner-status">${status}</div>`;

  // Relance l'animation à chaque entrée
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(hideZoneBanner, DURATION);
}

export function hideZoneBanner() {
  clearTimeout(timer);
  el?.classList.remove("show");
}
