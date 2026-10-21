/**
 * Fenêtres d'Otium (ApplicationV2, rendu par chaîne HTML comme les autres modules Quill & Seal) :
 * - MenuApp      : la carte de la taverne, côté joueurs (et MJ)
 * - TavernList   : les tavernes du monde, côté MJ
 * - TavernConfig : modifier une taverne et sa carte, côté MJ
 */

import { MODULE_ID, FLAG_TAVERN, CATEGORIES, RESTS, DRUNK, t, esc } from "./constants.js";
import { getTaverns, getTavern, saveTavern, deleteTavern, sceneTavern, setSceneTavern, newItem } from "./store.js";
import { TEMPLATES, TEMPLATE_IDS } from "./presets.js";
import { DENOMS, priceToCp, walletToCp, formatCp, formatWallet, abbr } from "./currency.js";
import { buyerCandidates, defaultBuyer, placeOrder } from "./order.js";
import { drunkLevel } from "./effects.js";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

/** Fenêtres ouvertes, rafraîchies quand les tavernes changent. */
export const openApps = new Set();

/** Rafraîchit les fenêtres ouvertes (sauf celle qui vient elle-même d'enregistrer). */
export function refreshApps() {
  for (const app of openApps) {
    if (app._skipRefresh) {
      app._skipRefresh = false;
      continue;
    }
    app.onDataChanged();
  }
}

/** Classe de base : rendu par chaîne HTML et suivi des fenêtres ouvertes. */
class OtiumApp extends ApplicationV2 {
  _html() {
    return "";
  }

  async _renderHTML() {
    const div = document.createElement("div");
    div.className = "otium-body";
    div.innerHTML = this._html();
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    openApps.add(this);
  }

  _onClose(options) {
    super._onClose?.(options);
    openApps.delete(this);
  }

  onDataChanged() {
    this.render();
  }
}

function itemTags(item, effects) {
  if (!effects) return "";
  const tags = [];
  if (item.category === "drink" && item.alcohol > 0) {
    tags.push(`<span class="otium-tag" data-tooltip="${esc(t("Effects.AlcoholTip"))}">${'<i class="fa-solid fa-wine-glass"></i>'.repeat(item.alcohol)}</span>`);
  }
  if (item.category === "food" && item.tempHp > 0) {
    tags.push(`<span class="otium-tag" data-tooltip="${esc(t("Effects.TempHpTip"))}"><i class="fa-solid fa-heart"></i> ${item.tempHp}</span>`);
  }
  if (item.category === "room" && item.rest !== "none") {
    tags.push(`<span class="otium-tag" data-tooltip="${esc(t(`Rest.${item.rest}`))}"><i class="fa-solid fa-bed"></i></span>`);
  }
  return tags.join("");
}

/* ============================================ */
/*  La carte (joueurs)                          */
/* ============================================ */

export class MenuApp extends OtiumApp {
  constructor(tavernId, options = {}) {
    super({ id: `otium-menu-${tavernId}`, ...options });
    this.tavernId = tavernId;
    /** @type {Map<string, number>} */
    this.cart = new Map();
    this.buyerId = defaultBuyer()?.id ?? null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["otium", "otium-menu"],
    window: { icon: "fa-solid fa-beer-mug-empty", resizable: true },
    position: { width: 440, height: "auto" },
    actions: {
      inc: MenuApp.#onInc,
      dec: MenuApp.#onDec,
      order: MenuApp.#onOrder
    }
  };

  get title() {
    return this.tavern?.name || t("Menu.Title");
  }

  get tavern() {
    return getTavern(this.tavernId);
  }

  get buyer() {
    return game.actors.get(this.buyerId) ?? null;
  }

  /** Les tavernes ont changé : on retire du panier ce qui n'existe plus ou n'est plus en stock. */
  onDataChanged() {
    const tavern = this.tavern;
    if (!tavern) return this.close();
    for (const [id, qty] of this.cart) {
      const item = tavern.menu.find((i) => i.id === id);
      if (!item) this.cart.delete(id);
      else if (item.stock !== null && qty > item.stock) {
        if (item.stock > 0) this.cart.set(id, item.stock);
        else this.cart.delete(id);
      }
    }
    this.render();
  }

  total(tavern = this.tavern) {
    let sum = 0;
    for (const [id, qty] of this.cart) {
      const item = tavern?.menu.find((i) => i.id === id);
      if (item) sum += priceToCp(item.price) * qty;
    }
    return sum;
  }

  _html() {
    const tavern = this.tavern;
    if (!tavern) return `<p>${t("Menu.Closed")}</p>`;
    const buyer = this.buyer;
    const candidates = buyerCandidates();

    const buyerField = candidates.length
      ? `<select name="buyer">${candidates
          .map((a) => `<option value="${a.id}" ${a.id === this.buyerId ? "selected" : ""}>${esc(a.name)}</option>`)
          .join("")}${buyer ? "" : `<option value="" selected>—</option>`}</select>`
      : `<span class="hint">${t("Menu.NoCharacter")}</span>`;

    const level = buyer ? drunkLevel(buyer) : 0;
    const drunkHint =
      tavern.effects && level > 0
        ? `<p class="otium-drunk"><i class="fa-solid fa-face-dizzy"></i> ${t(level >= DRUNK.drunk ? "Effects.DrunkName" : level >= DRUNK.tipsy ? "Effects.TipsyName" : "Effects.SoberName")} (${level})</p>`
        : "";

    const sections = CATEGORIES.map((cat) => {
      const items = tavern.menu.filter((i) => i.category === cat);
      if (!items.length) return "";
      const rows = items
        .map((item) => {
          const qty = this.cart.get(item.id) ?? 0;
          const soldOut = item.stock !== null && item.stock <= 0;
          const max = item.stock === null ? Infinity : item.stock;
          const stock =
            item.stock === null ? "" : `<span class="otium-stock">${soldOut ? t("Menu.SoldOut") : t("Menu.Left", { n: item.stock })}</span>`;
          return `
          <li class="otium-item ${soldOut ? "sold-out" : ""} ${qty ? "in-cart" : ""}">
            <div class="otium-item-main">
              <span class="otium-item-name">${esc(item.name || t("Item.Unnamed"))}</span>
              ${itemTags(item, tavern.effects)} ${stock}
            </div>
            <span class="otium-price">${formatCp(priceToCp(item.price))}</span>
            <div class="otium-qty">
              <button type="button" data-action="dec" data-item-id="${item.id}" ${qty ? "" : "disabled"}><i class="fa-solid fa-minus"></i></button>
              <span>${qty}</span>
              <button type="button" data-action="inc" data-item-id="${item.id}" ${soldOut || qty >= max ? "disabled" : ""}><i class="fa-solid fa-plus"></i></button>
            </div>
          </li>`;
        })
        .join("");
      return `<h3 class="otium-cat"><i class="${CATEGORY_ICONS[cat]}"></i> ${t(`Category.${cat}`)}</h3><ul class="otium-items">${rows}</ul>`;
    }).join("");

    const total = this.total(tavern);
    const funds = buyer ? walletToCp(buyer.system?.currency) : 0;
    const enough = funds >= total;
    const canOrder = buyer && this.cart.size > 0 && enough;

    return `
      ${tavern.keeper ? `<p class="otium-keeper"><i class="fa-solid fa-user"></i> ${esc(tavern.keeper)}</p>` : ""}
      ${tavern.description ? `<p class="otium-desc">${esc(tavern.description)}</p>` : ""}
      <div class="form-group">
        <label>${t("Menu.Buyer")}</label>
        <div class="form-fields">${buyerField}</div>
      </div>
      ${buyer ? `<p class="otium-wallet"><i class="fa-solid fa-coins"></i> ${t("Menu.Wallet")} : ${formatWallet(buyer.system?.currency)}</p>` : ""}
      ${drunkHint}
      ${sections || `<p class="hint">${t("Menu.Empty")}</p>`}
      <footer class="otium-footer">
        <span class="otium-total ${enough ? "" : "too-much"}">${t("Order.Total")} : <strong>${formatCp(total)}</strong></span>
        <button type="button" data-action="order" ${canOrder ? "" : "disabled"}><i class="fa-solid fa-bell-concierge"></i> ${t("Menu.Order")}</button>
      </footer>
      ${buyer && !enough ? `<p class="otium-warning">${t("Order.NotEnough", { name: esc(buyer.name) })}</p>` : ""}`;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector("select[name=buyer]")?.addEventListener("change", (event) => {
      this.buyerId = event.target.value || null;
      this.render();
    });
  }

  static #onInc(event, target) {
    const id = target.dataset.itemId;
    this.cart.set(id, (this.cart.get(id) ?? 0) + 1);
    this.render();
  }

  static #onDec(event, target) {
    const id = target.dataset.itemId;
    const qty = (this.cart.get(id) ?? 0) - 1;
    if (qty > 0) this.cart.set(id, qty);
    else this.cart.delete(id);
    this.render();
  }

  static async #onOrder(event, target) {
    if (this._ordering) return;
    this._ordering = true;
    target.disabled = true;
    try {
      const ok = await placeOrder(this.buyer, this.tavernId, this.cart);
      if (ok) this.cart.clear();
    } finally {
      this._ordering = false;
      this.render();
    }
  }
}

const CATEGORY_ICONS = {
  drink: "fa-solid fa-beer-mug-empty",
  food: "fa-solid fa-drumstick-bite",
  room: "fa-solid fa-bed",
  other: "fa-solid fa-box"
};

/** Ouvre la carte de la taverne de la scène (ou prévient qu'aucune n'est ouverte). */
export function openSceneMenu() {
  const tavern = sceneTavern();
  if (!tavern) return ui.notifications.info(t("Menu.NoTavern"));
  return openMenu(tavern.id);
}

export function openMenu(tavernId) {
  const existing = [...openApps].find((app) => app instanceof MenuApp && app.tavernId === tavernId);
  if (existing) return existing.render({ force: true });
  return new MenuApp(tavernId).render({ force: true });
}

/* ============================================ */
/*  Liste des tavernes (MJ)                     */
/* ============================================ */

export class TavernList extends OtiumApp {
  constructor(options = {}) {
    super({ id: "otium-taverns", ...options });
    this.template = "village";
  }

  static DEFAULT_OPTIONS = {
    classes: ["otium", "otium-list"],
    window: { icon: "fa-solid fa-store", resizable: true },
    position: { width: 460, height: "auto" },
    actions: {
      create: TavernList.#onCreate,
      edit: TavernList.#onEdit,
      preview: TavernList.#onPreview,
      toggleScene: TavernList.#onToggleScene,
      delete: TavernList.#onDelete
    }
  };

  get title() {
    return t("List.Title");
  }

  _html() {
    const taverns = Object.values(getTaverns()).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const activeId = canvas?.scene?.getFlag(MODULE_ID, FLAG_TAVERN);
    const rows = taverns
      .map((tv) => {
        const active = tv.id === activeId;
        return `
        <li class="otium-tavern ${active ? "active" : ""}" data-tavern-id="${tv.id}">
          <div class="otium-tavern-main">
            <strong>${esc(tv.name || t("Tavern.Unnamed"))}</strong>
            <span class="hint">${esc(tv.keeper)}${tv.keeper ? " · " : ""}${t("List.Items", { n: tv.menu?.length ?? 0 })}</span>
          </div>
          <div class="otium-tavern-actions">
            <button type="button" class="icon ${active ? "active" : ""}" data-action="toggleScene" data-tooltip="${esc(t(active ? "List.Close" : "List.Open"))}">
              <i class="fa-solid ${active ? "fa-door-open" : "fa-door-closed"}"></i></button>
            <button type="button" class="icon" data-action="preview" data-tooltip="${esc(t("List.Preview"))}"><i class="fa-solid fa-eye"></i></button>
            <button type="button" class="icon" data-action="edit" data-tooltip="${esc(t("List.Edit"))}"><i class="fa-solid fa-pen"></i></button>
            <button type="button" class="icon" data-action="delete" data-tooltip="${esc(t("List.Delete"))}"><i class="fa-solid fa-trash"></i></button>
          </div>
        </li>`;
      })
      .join("");

    const options = TEMPLATE_IDS.map(
      (id) => `<option value="${id}" ${id === this.template ? "selected" : ""}>${t(`Template.${id}`)}</option>`
    ).join("");

    return `
      <p class="hint">${t("List.Hint")}</p>
      ${rows ? `<ul class="otium-taverns">${rows}</ul>` : `<p class="hint">${t("List.None")}</p>`}
      <footer class="otium-footer">
        <select name="template">${options}</select>
        <button type="button" data-action="create"><i class="fa-solid fa-plus"></i> ${t("List.Create")}</button>
      </footer>`;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.querySelector("select[name=template]")?.addEventListener("change", (event) => {
      this.template = event.target.value;
    });
  }

  static #id(target) {
    return target.closest("[data-tavern-id]")?.dataset.tavernId;
  }

  static async #onCreate() {
    const build = TEMPLATES[this.template] ?? TEMPLATES.empty;
    const tavern = await saveTavern(build());
    new TavernConfig(tavern.id).render({ force: true });
  }

  static #onEdit(event, target) {
    const id = TavernList.#id(target);
    if (id) new TavernConfig(id).render({ force: true });
  }

  static #onPreview(event, target) {
    const id = TavernList.#id(target);
    if (id) openMenu(id);
  }

  static async #onToggleScene(event, target) {
    const id = TavernList.#id(target);
    const scene = canvas?.scene;
    if (!id || !scene) return;
    const active = scene.getFlag(MODULE_ID, FLAG_TAVERN) === id;
    await setSceneTavern(scene, active ? null : id);
    if (!active) {
      const tavern = getTavern(id);
      await ChatMessage.create({
        content: `<div class="otium-chat"><p class="otium-chat-head"><i class="fa-solid fa-door-open"></i> ${t("List.Announce", { tavern: esc(tavern?.name || t("Tavern.Unnamed")) })}</p><p class="hint">${t("List.AnnounceHint")}</p></div>`,
        flags: { [MODULE_ID]: { announce: true } }
      });
    }
  }

  static async #onDelete(event, target) {
    const id = TavernList.#id(target);
    const tavern = getTavern(id);
    if (!tavern) return;
    const ok = await DialogV2.confirm({
      window: { title: t("List.Delete") },
      content: `<p>${t("List.DeleteConfirm", { name: esc(tavern.name || t("Tavern.Unnamed")) })}</p>`
    });
    if (ok) await deleteTavern(id);
  }
}

/* ============================================ */
/*  Réglages d'une taverne (MJ)                 */
/* ============================================ */

export class TavernConfig extends OtiumApp {
  constructor(tavernId, options = {}) {
    super({ id: `otium-config-${tavernId}`, ...options });
    this.tavernId = tavernId;
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["otium", "otium-config"],
    window: { icon: "fa-solid fa-pen", resizable: true },
    position: { width: 760, height: "auto" },
    form: { handler: TavernConfig.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: {
      addItem: TavernConfig.#onAddItem,
      removeItem: TavernConfig.#onRemoveItem,
      moveItem: TavernConfig.#onMoveItem
    }
  };

  get title() {
    return t("Config.Title", { name: this.tavern?.name || t("Tavern.Unnamed") });
  }

  get tavern() {
    return getTavern(this.tavernId);
  }

  onDataChanged() {
    if (!this.tavern) return this.close();
    this.render();
  }

  _html() {
    const tv = this.tavern;
    if (!tv) return `<p>${t("Config.Missing")}</p>`;

    const opts = (values, current, label) =>
      values.map((v) => `<option value="${v}" ${v === current ? "selected" : ""}>${esc(label(v))}</option>`).join("");

    const rows = tv.menu
      .map((item, index) => {
        const p = `menu.${item.id}`;
        return `
        <tr class="otium-row" data-item-id="${item.id}" data-category="${item.category}">
          <td><input type="text" name="${p}.name" value="${esc(item.name)}" placeholder="${esc(t("Item.Unnamed"))}"></td>
          <td><select name="${p}.category" class="otium-category">${opts(CATEGORIES, item.category, (c) => t(`Category.${c}`))}</select></td>
          <td class="otium-price-cell">
            <input type="number" name="${p}.priceValue" value="${item.price.value}" min="0" step="any">
            <select name="${p}.priceDenom">${opts(DENOMS, item.price.denom, abbr)}</select>
          </td>
          <td><input type="number" name="${p}.stock" value="${item.stock ?? ""}" min="0" step="1" placeholder="∞"></td>
          <td class="otium-fx">
            <select class="fx-drink" name="${p}.alcohol" data-tooltip="${esc(t("Effects.AlcoholTip"))}">${opts([0, 1, 2, 3], item.alcohol, (n) => t(`Alcohol.${n}`))}</select>
            <input class="fx-food" type="number" name="${p}.tempHp" value="${item.tempHp}" min="0" max="99" step="1" data-tooltip="${esc(t("Effects.TempHpTip"))}">
            <select class="fx-room" name="${p}.rest">${opts(RESTS, item.rest, (r) => t(`Rest.${r}`))}</select>
            <span class="fx-other">—</span>
          </td>
          <td class="otium-row-actions">
            <button type="button" class="icon" data-action="moveItem" data-dir="-1" ${index === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
            <button type="button" class="icon" data-action="moveItem" data-dir="1" ${index === tv.menu.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
            <button type="button" class="icon" data-action="removeItem" data-tooltip="${esc(t("Config.RemoveItem"))}"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`;
      })
      .join("");

    return `
      <div class="form-group">
        <label>${t("Config.Name")}</label>
        <div class="form-fields"><input type="text" name="name" value="${esc(tv.name)}" placeholder="${esc(t("Tavern.Unnamed"))}"></div>
      </div>
      <div class="form-group">
        <label>${t("Config.Keeper")}</label>
        <div class="form-fields"><input type="text" name="keeper" value="${esc(tv.keeper)}"></div>
      </div>
      <div class="form-group stacked">
        <label>${t("Config.Description")}</label>
        <textarea name="description" rows="2">${esc(tv.description)}</textarea>
      </div>
      <div class="form-group">
        <label>${t("Config.Effects")}</label>
        <div class="form-fields"><input type="checkbox" name="effects" ${tv.effects ? "checked" : ""}></div>
        <p class="hint">${t("Config.EffectsHint")}</p>
      </div>
      <fieldset>
        <legend>${t("Config.Menu")}</legend>
        <table class="otium-menu-table ${tv.effects ? "" : "no-effects"}">
          <thead><tr>
            <th>${t("Config.ItemName")}</th><th>${t("Config.Category")}</th><th>${t("Config.Price")}</th>
            <th>${t("Config.Stock")}</th><th class="otium-fx">${t("Config.Effect")}</th><th></th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="hint">${t("Menu.Empty")}</td></tr>`}</tbody>
        </table>
        <div class="otium-add">
          ${CATEGORIES.map(
            (c) => `<button type="button" data-action="addItem" data-category="${c}"><i class="${CATEGORY_ICONS[c]}"></i> ${t(`Category.${c}`)}</button>`
          ).join("")}
        </div>
      </fieldset>`;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // Changer la catégorie d'un article montre le bon champ d'effet sans tout redessiner
    for (const select of this.element.querySelectorAll("select.otium-category")) {
      select.addEventListener("change", (event) => {
        event.target.closest(".otium-row").dataset.category = event.target.value;
      });
    }
    // Activer ou non les effets grise la colonne
    this.element.querySelector("input[name=effects]")?.addEventListener("change", (event) => {
      this.element.querySelector(".otium-menu-table")?.classList.toggle("no-effects", !event.target.checked);
    });
  }

  static async #onSubmit(event, form, formData) {
    const tavern = this.tavern;
    if (!tavern) return;
    const data = foundry.utils.expandObject(formData.object);
    tavern.name = String(data.name ?? tavern.name);
    tavern.keeper = String(data.keeper ?? tavern.keeper);
    tavern.description = String(data.description ?? tavern.description);
    tavern.effects = !!data.effects;
    const rows = data.menu ?? {};
    tavern.menu = tavern.menu.map((item) => {
      const r = rows[item.id];
      if (!r) return item;
      return newItem({
        ...item,
        name: r.name,
        category: r.category,
        price: { value: r.priceValue, denom: r.priceDenom },
        stock: r.stock,
        alcohol: r.alcohol,
        tempHp: r.tempHp,
        rest: r.rest
      });
    });
    // Pas de redessin de cette fenêtre : on garderait mal le focus en tabulant
    this._skipRefresh = true;
    try {
      await saveTavern(tavern);
    } finally {
      // Si rien n'a changé, le réglage n'a pas prévenu : on ne garde pas le drapeau pour la suite
      this._skipRefresh = false;
    }
    if (this.window?.title) this.window.title.textContent = this.title;
  }

  /** Enregistre d'abord ce qui est en cours de saisie, puis modifie la carte et redessine. */
  async #edit(fn) {
    await this.submit();
    const tavern = this.tavern;
    if (!tavern) return;
    fn(tavern);
    this._skipRefresh = true;
    try {
      await saveTavern(tavern);
    } finally {
      this._skipRefresh = false;
    }
    this.render();
  }

  static async #onAddItem(event, target) {
    const category = target.dataset.category;
    await this.#edit((tavern) => tavern.menu.push(newItem({ category, price: { value: 1, denom: "sp" } })));
  }

  static async #onRemoveItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    await this.#edit((tavern) => (tavern.menu = tavern.menu.filter((i) => i.id !== id)));
  }

  static async #onMoveItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const dir = Number(target.dataset.dir);
    await this.#edit((tavern) => {
      const i = tavern.menu.findIndex((it) => it.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= tavern.menu.length) return;
      [tavern.menu[i], tavern.menu[j]] = [tavern.menu[j], tavern.menu[i]];
    });
  }
}

export function openTavernList() {
  const existing = [...openApps].find((app) => app instanceof TavernList);
  if (existing) return existing.render({ force: true });
  return new TavernList().render({ force: true });
}
