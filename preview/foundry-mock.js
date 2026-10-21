/**
 * Faux Foundry VTT, juste assez pour faire tourner le vrai code d'Otium dans une page web.
 * Les droits sont simulés : un joueur qui écrit un réglage monde ou un flag de scène
 * déclenche une erreur visible, comme dans Foundry.
 */

import frLang from "../lang/fr.json";
import enLang from "../lang/en.json";

/* -------------------------------------------- */
/*  Petit bus d'événements du banc d'essai      */
/* -------------------------------------------- */

export const bench = {
  gmOnline: true,
  privileged: false,
  listeners: {},
  on(event, fn) {
    (this.listeners[event] ??= []).push(fn);
  },
  emit(event, data) {
    for (const fn of this.listeners[event] ?? []) fn(data);
  },
  report(err) {
    console.error(err);
    this.emit("toast", { type: "error", message: err?.message ?? String(err) });
  }
};

/* -------------------------------------------- */
/*  Utilitaires (foundry.utils)                 */
/* -------------------------------------------- */

function deepClone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function randomID(length = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function getProperty(obj, key) {
  return key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setProperty(obj, key, value) {
  const parts = key.split(".");
  const last = parts.pop();
  let target = obj;
  for (const p of parts) target = target[p] ??= {};
  target[last] = value;
}

function hasProperty(obj, key) {
  const parts = key.split(".");
  let o = obj;
  for (const p of parts) {
    if (o == null || typeof o !== "object" || !(p in o)) return false;
    o = o[p];
  }
  return true;
}

function expandObject(flat) {
  const out = {};
  for (const [k, v] of Object.entries(flat)) setProperty(out, k, v);
  return out;
}

function mergeDeep(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof v !== "function" ? mergeDeep(a?.[k] ?? {}, v) : v;
  }
  return out;
}

function permission(what) {
  const err = new Error(`Permission refusée : ${game.user.name} ne peut pas modifier ${what} (seul le MJ le peut).`);
  bench.report(err);
  return err;
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

const hooks = new Map();
globalThis.Hooks = {
  on(name, fn) {
    if (!hooks.has(name)) hooks.set(name, []);
    hooks.get(name).push(fn);
  },
  once(name, fn) {
    const wrapper = (...args) => {
      hooks.set(name, (hooks.get(name) ?? []).filter((f) => f !== wrapper));
      return fn(...args);
    };
    this.on(name, wrapper);
  },
  call(name, ...args) {
    for (const fn of [...(hooks.get(name) ?? [])]) if (fn(...args) === false) return false;
    return true;
  },
  callAll(name, ...args) {
    for (const fn of [...(hooks.get(name) ?? [])]) {
      try {
        const r = fn(...args);
        if (r instanceof Promise) r.catch((e) => bench.report(e));
      } catch (err) {
        bench.report(err);
      }
    }
    return true;
  }
};

/* -------------------------------------------- */
/*  Traductions                                 */
/* -------------------------------------------- */

const DND5E_LANG = {
  fr: { PP: "pp", GP: "po", EP: "pe", SP: "pa", CP: "pc", Yes: "Oui", No: "Non" },
  en: { PP: "pp", GP: "gp", EP: "ep", SP: "sp", CP: "cp", Yes: "Yes", No: "No" }
};

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

let dict = {};
export function setLanguage(lang) {
  const extra = DND5E_LANG[lang];
  dict = flatten(lang === "fr" ? frLang : enLang);
  for (const c of ["PP", "GP", "EP", "SP", "CP"]) dict[`DND5E.CurrencyAbbr${c}`] = extra[c];
  dict["BENCH.Yes"] = extra.Yes;
  dict["BENCH.No"] = extra.No;
  game.i18n.lang = lang;
}

/* -------------------------------------------- */
/*  Utilisateurs, personnages, scène            */
/* -------------------------------------------- */

class UserMock {
  constructor(data) {
    Object.assign(this, data);
  }
  get isSelf() {
    return game.user === this || (bench.privileged && this.isGM);
  }
  get character() {
    return game.actors.find((a) => a.type === "character" && a.ownerId === this.id) ?? null;
  }
}

export const users = [
  new UserMock({ id: "gm", name: "Maëlle (MJ)", isGM: true }),
  new UserMock({ id: "alice", name: "Alice", isGM: false }),
  new UserMock({ id: "bruno", name: "Bruno", isGM: false })
];

class EffectMock {
  constructor(parent, data) {
    this.parent = parent;
    this.id = randomID();
    Object.assign(this, deepClone(data));
  }
  getFlag(scope, key) {
    return getProperty(this.flags ?? {}, `${scope}.${key}`);
  }
  async update(data) {
    if (!this.parent.isOwner) throw permission(`l'effet de ${this.parent.name}`);
    Object.assign(this, deepClone(data));
    this.parent._changed({ effects: true });
  }
  async delete() {
    if (!this.parent.isOwner) throw permission(`l'effet de ${this.parent.name}`);
    this.parent.effects = this.parent.effects.filter((e) => e !== this);
    this.parent._changed({ effects: true });
  }
}

class ActorMock {
  constructor({ id, name, ownerId, currency, hp }) {
    this.id = id;
    this.name = name;
    this.type = "character";
    this.ownerId = ownerId;
    this.system = {
      currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0, ...currency },
      attributes: { hp: { value: hp, max: hp, temp: 0 } }
    };
    this.flags = {};
    this.effects = [];
    this.statuses = new Set();
  }
  get isOwner() {
    return game.user.isGM || bench.privileged || game.user.id === this.ownerId;
  }
  testUserPermission(user) {
    return !!user?.isGM || user?.id === this.ownerId;
  }
  async update(changes) {
    if (!this.isOwner) throw permission(this.name);
    for (const [k, v] of Object.entries(changes)) setProperty(this, k, deepClone(v));
    this._changed(changes);
    return this;
  }
  getFlag(scope, key) {
    return getProperty(this.flags, `${scope}.${key}`);
  }
  setFlag(scope, key, value) {
    return this.update({ [`flags.${scope}.${key}`]: value });
  }
  async unsetFlag(scope, key) {
    if (!this.isOwner) throw permission(this.name);
    if (this.flags[scope]) delete this.flags[scope][key];
    this._changed({ flags: true });
    return this;
  }
  async createEmbeddedDocuments(type, list) {
    if (!this.isOwner) throw permission(this.name);
    const created = list.map((d) => new EffectMock(this, d));
    this.effects.push(...created);
    this._changed({ effects: true });
    return created;
  }
  async toggleStatusEffect(id, { active } = {}) {
    if (!this.isOwner) throw permission(this.name);
    const on = active ?? !this.statuses.has(id);
    if (on) this.statuses.add(id);
    else this.statuses.delete(id);
    this._changed({ statuses: true });
    return on;
  }
  async longRest({ dialog = true } = {}) {
    return this.#rest("long", dialog);
  }
  async shortRest({ dialog = true } = {}) {
    return this.#rest("short", dialog);
  }
  async #rest(kind, dialog) {
    if (!this.isOwner) throw permission(this.name);
    if (dialog) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: kind === "long" ? "Repos long (dnd5e)" : "Repos court (dnd5e)" },
        content: `<p>${this.name} prend un ${kind === "long" ? "repos long" : "repos court"}. (Fenêtre de repos simulée.)</p>`
      });
      if (!ok) return null;
    }
    if (kind === "long") this.system.attributes.hp.value = this.system.attributes.hp.max;
    this._changed({ system: true });
    await ChatMessage.create({ speaker: { alias: this.name }, content: `<p><em>${this.name} termine un ${kind === "long" ? "repos long" : "repos court"}.</em></p>` });
    const result = { longRest: kind === "long" };
    Hooks.callAll("dnd5e.restCompleted", this, result, { type: kind });
    return result;
  }
  _changed(changes) {
    Hooks.callAll("updateActor", this, changes);
    bench.emit("actors");
  }
}

export const actors = [
  new ActorMock({ id: "thorin", name: "Thorin", ownerId: "alice", currency: { gp: 12, sp: 7, cp: 23 }, hp: 34 }),
  new ActorMock({ id: "lyra", name: "Lyra", ownerId: "bruno", currency: { gp: 3, sp: 2, cp: 4 }, hp: 22 })
];

class SceneMock {
  constructor(data) {
    Object.assign(this, data);
    this.flags = {};
  }
  getFlag(scope, key) {
    return getProperty(this.flags, `${scope}.${key}`);
  }
  async setFlag(scope, key, value) {
    if (!game.user.isGM && !bench.privileged) throw permission(`la scène « ${this.name} »`);
    setProperty(this.flags, `${scope}.${key}`, value);
    Hooks.callAll("updateScene", this, { flags: { [scope]: { [key]: value } } });
  }
  async unsetFlag(scope, key) {
    if (!game.user.isGM && !bench.privileged) throw permission(`la scène « ${this.name} »`);
    if (this.flags[scope]) delete this.flags[scope][key];
    Hooks.callAll("updateScene", this, { flags: { [scope]: { [`-=${key}`]: null } } });
  }
}

export const scene = new SceneMock({ id: "scene1", name: "Salle commune" });

/* -------------------------------------------- */
/*  game, canvas, ui, CONFIG, ChatMessage       */
/* -------------------------------------------- */

const settingsRegistry = new Map();
const settingsValues = new Map();
const socketHandlers = [];

globalThis.game = {
  user: users[0],
  users: {
    contents: users,
    get: (id) => users.find((u) => u.id === id),
    find: (fn) => users.find(fn),
    get activeGM() {
      return bench.gmOnline || game.user.isGM ? users[0] : null;
    }
  },
  actors: {
    contents: actors,
    get: (id) => actors.find((a) => a.id === id),
    find: (fn) => actors.find(fn),
    filter: (fn) => actors.filter(fn),
    [Symbol.iterator]: () => actors[Symbol.iterator]()
  },
  scenes: [scene],
  modules: new Map([["otium", { id: "otium" }]]),
  i18n: {
    lang: "fr",
    localize: (key) => dict[key] ?? key,
    format: (key, data = {}) => (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, p) => (p in data ? data[p] : m)),
    has: (key) => key in dict
  },
  settings: {
    register(ns, key, config) {
      settingsRegistry.set(`${ns}.${key}`, config);
      settingsValues.set(`${ns}.${key}`, deepClone(config.default));
    },
    get(ns, key) {
      return deepClone(settingsValues.get(`${ns}.${key}`));
    },
    async set(ns, key, value) {
      const id = `${ns}.${key}`;
      const config = settingsRegistry.get(id);
      if (config?.scope === "world" && !game.user.isGM && !bench.privileged) throw permission(`le réglage monde « ${id} »`);
      const changed = JSON.stringify(settingsValues.get(id)) !== JSON.stringify(value);
      settingsValues.set(id, deepClone(value));
      if (changed) config?.onChange?.(deepClone(value));
      return value;
    }
  },
  socket: {
    on(channel, fn) {
      socketHandlers.push(fn);
    },
    // Le message d'un joueur arrive « chez le MJ » un peu plus tard ; s'il n'est pas connecté, il se perd.
    // Ce qu'envoie le MJ ne va nulle part : tous les postes partagent déjà la même page.
    emit(channel, message) {
      if (game.user.isGM || bench.privileged) return;
      bench.emit("socket", { from: game.user.name, message, delivered: !!game.users.activeGM });
      if (!game.users.activeGM) return;
      setTimeout(async () => {
        bench.privileged = true;
        try {
          for (const fn of socketHandlers) await fn(deepClone(message));
        } catch (err) {
          bench.report(err);
        } finally {
          bench.privileged = false;
        }
      }, 120);
    }
  }
};

globalThis.canvas = { scene, tokens: { controlled: [] } };

globalThis.ui = {
  notifications: {
    info: (message) => bench.emit("toast", { type: "info", message }),
    warn: (message) => bench.emit("toast", { type: "warn", message }),
    error: (message) => bench.emit("toast", { type: "error", message })
  }
};

globalThis.CONFIG = {
  DND5E: {
    currencies: {
      pp: { conversion: 0.1, abbreviation: "DND5E.CurrencyAbbrPP" },
      gp: { conversion: 1, abbreviation: "DND5E.CurrencyAbbrGP" },
      ep: { conversion: 2, abbreviation: "DND5E.CurrencyAbbrEP" },
      sp: { conversion: 10, abbreviation: "DND5E.CurrencyAbbrSP" },
      cp: { conversion: 100, abbreviation: "DND5E.CurrencyAbbrCP" }
    }
  }
};

globalThis.ChatMessage = {
  getSpeaker: ({ actor } = {}) => ({ alias: actor?.name ?? game.user.name, actor: actor?.id }),
  async create(data) {
    const message = { ...data, user: game.user, time: new Date() };
    bench.emit("chat", message);
    return message;
  }
};

/* -------------------------------------------- */
/*  Minuteries : elles tournent « chez le MJ »  */
/* -------------------------------------------- */

// La boucle du service ne tourne que chez le MJ actif. Dans le banc, le poste du MJ
// est toujours là en arrière-plan, quel que soit le rôle joué.
const nativeSetInterval = globalThis.setInterval.bind(globalThis);
globalThis.setInterval = (fn, ms, ...args) =>
  nativeSetInterval(() => {
    const prev = bench.privileged;
    bench.privileged = true;
    try {
      fn(...args);
    } catch (err) {
      bench.report(err);
    } finally {
      bench.privileged = prev;
    }
  }, ms);

/* -------------------------------------------- */
/*  ApplicationV2 et DialogV2                   */
/* -------------------------------------------- */

function readForm(form) {
  const object = {};
  for (const el of form.querySelectorAll("[name]")) {
    if (el.disabled) continue;
    if (el.type === "checkbox") object[el.name] = el.checked;
    else if (el.type === "number" || el.type === "range") object[el.name] = el.value === "" ? null : Number(el.value);
    else object[el.name] = el.value;
  }
  return object;
}

function collectOptions(cls) {
  const chain = [];
  for (let C = cls; C && C !== Function.prototype; C = Object.getPrototypeOf(C)) {
    if (Object.hasOwn(C, "DEFAULT_OPTIONS")) chain.unshift(C.DEFAULT_OPTIONS);
  }
  const classes = chain.flatMap((o) => o.classes ?? []);
  return { ...chain.reduce((acc, o) => mergeDeep(acc, o), {}), classes };
}

class ApplicationV2 {
  static DEFAULT_OPTIONS = { tag: "div", classes: [], window: { title: "", icon: "" }, position: {}, actions: {} };

  constructor(options = {}) {
    const defaults = collectOptions(this.constructor);
    this.options = { ...mergeDeep(defaults, options), classes: [...defaults.classes, ...(options.classes ?? [])] };
    this.id = this.options.id ?? `app-${randomID(6)}`;
    this.element = null;
    this.window = {};
  }

  get title() {
    return this.options.window?.title ?? "";
  }

  get rendered() {
    return !!this.element?.isConnected;
  }

  #build() {
    const el = document.createElement(this.options.tag ?? "div");
    el.className = ["application", ...this.options.classes].join(" ");
    el.id = this.id;
    const width = this.options.position?.width;
    if (typeof width === "number") el.style.width = `min(${width}px, 100%)`;
    el.innerHTML = `
      <header class="window-header">
        <i class="window-icon ${this.options.window?.icon ?? ""}"></i>
        <h1 class="window-title"></h1>
        <button type="button" class="header-control" data-bench-close aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <section class="window-content"></section>`;
    this.window = {
      header: el.querySelector(".window-header"),
      title: el.querySelector(".window-title"),
      content: el.querySelector(".window-content")
    };

    el.addEventListener("click", async (event) => {
      if (event.target.closest("[data-bench-close]")) return this.close();
      const target = event.target.closest("[data-action]");
      if (!target || !el.contains(target) || target.disabled) return;
      const fn = this.options.actions?.[target.dataset.action];
      if (!fn) return;
      event.preventDefault();
      try {
        await fn.call(this, event, target);
      } catch (err) {
        bench.report(err);
      }
    });

    if (this.options.tag === "form") {
      el.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submit(event).catch((e) => bench.report(e));
      });
      el.addEventListener("change", (event) => {
        if (!event.target.name || !this.options.form?.submitOnChange) return;
        this.submit(event).catch((e) => bench.report(e));
      });
    }

    document.getElementById("windows").prepend(el);
    this.element = el;
  }

  async render(options = {}) {
    const first = !this.element;
    if (first) this.#build();
    const result = await this._renderHTML({}, options);
    if (!this.element) return this;
    this._replaceHTML(result, this.window.content, options);
    this.window.title.textContent = this.title;
    if (first) this._onFirstRender({}, options);
    this._onRender({}, options);
    if (options.force && !first) {
      this.element.parentElement?.prepend(this.element);
      this.element.classList.remove("bench-flash");
      void this.element.offsetWidth;
      this.element.classList.add("bench-flash");
    }
    bench.emit("windows");
    return this;
  }

  async _renderHTML() {
    return null;
  }
  _replaceHTML() {}
  _onFirstRender() {}
  _onRender() {}
  _onClose() {}

  async close() {
    if (!this.element) return this;
    this.element.remove();
    this.element = null;
    this._onClose({});
    bench.emit("windows");
    return this;
  }

  async submit(event) {
    const handler = this.options.form?.handler;
    if (!handler || !this.element) return;
    await handler.call(this, event ?? new Event("submit"), this.element, { object: readForm(this.element) });
  }
}

const DialogV2 = {
  confirm({ window: win = {}, content = "" } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "bench-modal";
      overlay.innerHTML = `
        <div class="application dialog" role="dialog" aria-modal="true">
          <header class="window-header"><h1 class="window-title"></h1></header>
          <section class="window-content">${content}
            <footer class="bench-dialog-buttons">
              <button type="button" data-answer="yes"><i class="fa-solid fa-check"></i> ${game.i18n.localize("BENCH.Yes")}</button>
              <button type="button" data-answer="no"><i class="fa-solid fa-xmark"></i> ${game.i18n.localize("BENCH.No")}</button>
            </footer>
          </section>
        </div>`;
      overlay.querySelector(".window-title").textContent = win.title ?? "";
      overlay.addEventListener("click", (event) => {
        const answer = event.target.closest("[data-answer]")?.dataset.answer;
        if (!answer && event.target !== overlay) return;
        overlay.remove();
        resolve(answer === "yes");
      });
      document.body.append(overlay);
      overlay.querySelector("[data-answer=yes]").focus();
    });
  }
};

globalThis.foundry = {
  utils: { deepClone, randomID, getProperty, setProperty, hasProperty, expandObject, mergeObject: mergeDeep },
  applications: { api: { ApplicationV2, DialogV2 } }
};

setLanguage("fr");
