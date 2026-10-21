/**
 * Banc d'essai d'Otium : le vrai code du module, branché sur un faux Foundry.
 * On joue le MJ ou un joueur, on commande, on regarde la bourse, le chat et les effets.
 */

import { bench, setLanguage, users, actors, scene, addZone, moveToken, tokenOf } from "./foundry-mock.js";
import "../scripts/main.js";
import { MODULE_ID } from "../scripts/constants.js";
import { TEMPLATES } from "../scripts/presets.js";
import { openApps } from "../scripts/apps.js";
import { formatWallet } from "../scripts/currency.js";

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const api = () => game.modules.get(MODULE_ID).api;

/* -------------------------------------------- */
/*  Barre du haut : qui joue, MJ connecté,      */
/*  langue                                      */
/* -------------------------------------------- */

const ROLE_LABEL = { gm: "MJ", alice: "Alice · Thorin", bruno: "Bruno · Lyra" };

function renderTopbar() {
  $("#roles").innerHTML = users
    .map((u) => `<button type="button" class="seg ${game.user === u ? "on" : ""}" data-role="${u.id}" aria-pressed="${game.user === u}">${esc(ROLE_LABEL[u.id])}</button>`)
    .join("");
  const gmBox = $("#gm-online");
  gmBox.checked = bench.gmOnline;
  gmBox.disabled = game.user.isGM;
  $("#gm-online-wrap").classList.toggle("dim", game.user.isGM);
  for (const b of document.querySelectorAll("[data-lang]")) b.classList.toggle("on", b.dataset.lang === game.i18n.lang);
}

async function setRole(id) {
  const user = users.find((u) => u.id === id);
  if (!user || user === game.user) return;
  // Changer de rôle, c'est changer de poste : les fenêtres de l'autre se ferment
  for (const app of [...openApps]) await app.close();
  game.user = user;
  canvas.tokens.controlled = [];
  renderAll();
  toast("info", `Vous jouez maintenant ${user.isGM ? "le MJ" : `${user.name} (${user.character?.name})`}.`);
}

/* -------------------------------------------- */
/*  Contrôles de scène (le vrai hook)           */
/* -------------------------------------------- */

function renderControls() {
  const controls = {
    tokens: {
      name: "tokens",
      title: "Jetons",
      icon: "fa-solid fa-user",
      tools: { select: { name: "select", title: "Sélectionner les jetons", icon: "fa-solid fa-expand", order: 0 } }
    }
  };
  Hooks.callAll("getSceneControlButtons", controls);
  const tools = Object.values(controls.tokens.tools)
    .filter((t) => t.button)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  window.__tools = tools;
  $("#controls").innerHTML = tools.length
    ? tools
        .map(
          (tool, i) => `
      <button type="button" class="tool" data-tool="${i}">
        <i class="${tool.icon}"></i><span>${esc(game.i18n.localize(tool.title))}</span>
      </button>`
        )
        .join("")
    : `<p class="muted">Aucun bouton.</p>`;
}

/* -------------------------------------------- */
/*  Personnages                                 */
/* -------------------------------------------- */

function renderActors() {
  const selected = canvas.tokens.controlled[0]?.actor?.id;
  $("#actors").innerHTML = actors
    .map((a) => {
      const owner = users.find((u) => u.id === a.ownerId);
      const mine = a.isOwner;
      const level = Number(a.getFlag(MODULE_ID, "ivresse")) || 0;
      const hp = a.system.attributes.hp;
      const effects = a.effects.map((e) => `<span class="chip">${esc(e.name)}</span>`).join("");
      const statuses = [...a.statuses].map((s) => `<span class="chip danger">${s === "poisoned" ? "Empoisonné" : esc(s)}</span>`).join("");
      return `
      <article class="actor ${mine ? "" : "foreign"}" data-actor="${a.id}">
        <header>
          <label class="pick" title="Jeton sélectionné sur la scène">
            <input type="radio" name="token-pick" id="pick-${a.id}" value="${a.id}" ${selected === a.id ? "checked" : ""} ${mine ? "" : "disabled"}>
            <strong>${esc(a.name)}</strong>
          </label>
          <span class="muted">${esc(owner?.name)}</span>
        </header>
        <dl>
          <dt>Bourse</dt><dd class="num">${esc(formatWallet(a.system.currency))}</dd>
          <dt>PV</dt><dd class="num">${hp.value}/${hp.max}${hp.temp ? ` <span class="temp">+${hp.temp} temp.</span>` : ""}</dd>
          <dt>Ivresse</dt><dd class="num">${level}</dd>
        </dl>
        ${effects || statuses ? `<div class="chips">${effects}${statuses}</div>` : ""}
        <label class="where">Jeton sur la scène
          <select data-zone-actor="${a.id}" id="zone-${a.id}" ${mine ? "" : "disabled"}>
            <option value="">hors des zones</option>
            ${scene.regions.map((r) => `<option value="${r.id}" ${tokenOf(a).regions.has(r) ? "selected" : ""}>${esc(r.name)}</option>`).join("")}
          </select></label>
        <div class="actor-actions">
          <button type="button" data-bench="money" ${game.user.isGM ? "" : "disabled"} title="Réservé au MJ">+10 po</button>
          <button type="button" data-bench="short" ${mine ? "" : "disabled"}>Repos court</button>
          <button type="button" data-bench="long" ${mine ? "" : "disabled"}>Repos long</button>
        </div>
      </article>`;
    })
    .join("");
  const hasTokens = canvas.tokens.controlled.length > 0;
  $("#unpick").disabled = !hasTokens;
}

/* -------------------------------------------- */
/*  Chat et notifications                       */
/* -------------------------------------------- */

function addChat(message) {
  const li = document.createElement("li");
  li.className = "chat-message";
  const time = message.time.toLocaleTimeString(game.i18n.lang, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  li.innerHTML = `
    <header><strong>${esc(message.speaker?.alias ?? message.user.name)}</strong><span class="muted num">${time}</span></header>
    <div class="message-content">${message.content}</div>
    <footer class="muted">envoyé par ${esc(message.user.name)}</footer>`;
  $("#chat").prepend(li);
}

function addSocket({ from, message, delivered }) {
  // Les actions du service passent par le socket à chaque clic : on ne montre que les stocks
  if (message?.action !== "consume") return;
  const li = document.createElement("li");
  li.className = "chat-message socket";
  li.innerHTML = `<header><strong>Socket</strong><span class="muted">${esc(from)} → MJ</span></header>
    <div class="message-content"><code>${esc(message.action)}</code> ${esc(JSON.stringify(message.lines))}<br>
    ${delivered ? "Transmis au MJ, qui met le stock à jour." : "<strong>Perdu : aucun MJ connecté.</strong>"}</div>`;
  $("#chat").prepend(li);
}

function toast(type, message) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = `<i class="fa-solid ${type === "error" ? "fa-circle-exclamation" : type === "warn" ? "fa-triangle-exclamation" : "fa-circle-info"}"></i><span>${esc(message)}</span>`;
  $("#toasts").prepend(el);
  setTimeout(() => el.remove(), type === "error" ? 9000 : 4500);
}

function renderWindowsHint() {
  $("#windows-empty").hidden = openApps.size > 0;
}

function renderAll() {
  renderTopbar();
  renderControls();
  renderActors();
  renderWindowsHint();
}

/* -------------------------------------------- */
/*  Événements du banc                          */
/* -------------------------------------------- */

bench.on("chat", addChat);
bench.on("socket", addSocket);
bench.on("toast", ({ type, message }) => toast(type, message));
bench.on("actors", renderActors);
bench.on("windows", renderWindowsHint);
window.addEventListener("unhandledrejection", (event) => bench.report(event.reason));

document.addEventListener("click", async (event) => {
  const role = event.target.closest("[data-role]");
  if (role) return setRole(role.dataset.role);

  const lang = event.target.closest("[data-lang]");
  if (lang) {
    setLanguage(lang.dataset.lang);
    renderAll();
    for (const app of openApps) app.render();
    return;
  }

  const tool = event.target.closest("[data-tool]");
  if (tool) {
    try {
      await window.__tools[Number(tool.dataset.tool)]?.onChange?.(event, true);
    } catch (err) {
      bench.report(err);
    }
    return;
  }

  const action = event.target.closest("[data-bench]");
  if (action) {
    const actor = actors.find((a) => a.id === action.closest("[data-actor]")?.dataset.actor);
    try {
      if (action.dataset.bench === "money") await actor.update({ "system.currency.gp": actor.system.currency.gp + 10 });
      if (action.dataset.bench === "short") await actor.shortRest({ dialog: true });
      if (action.dataset.bench === "long") await actor.longRest({ dialog: true });
    } catch (err) {
      bench.report(err);
    }
    return;
  }

  if (event.target.closest("#unpick")) {
    canvas.tokens.controlled = [];
    renderActors();
  }
  if (event.target.closest("#clear-chat")) $("#chat").replaceChildren();
});

document.addEventListener("change", (event) => {
  if (event.target.id === "gm-online") {
    bench.gmOnline = event.target.checked;
    toast("info", bench.gmOnline ? "Le MJ est connecté." : "Le MJ est déconnecté : les stocks limités ne peuvent plus être commandés.");
  }
  if (event.target.dataset?.zoneActor) {
    const actor = actors.find((a) => a.id === event.target.dataset.zoneActor);
    const region = scene.regions.find((r) => r.id === event.target.value) ?? null;
    moveToken(actor, region).catch((err) => bench.report(err));
    return;
  }
  if (event.target.name === "token-pick") {
    const actor = actors.find((a) => a.id === event.target.value);
    canvas.tokens.controlled = actor ? [{ actor }] : [];
    renderActors();
  }
});

// Les infobulles de Foundry (data-tooltip) deviennent des title
document.addEventListener("mouseover", (event) => {
  const el = event.target.closest("[data-tooltip]");
  if (el && !el.title) el.title = el.dataset.tooltip;
});

/* -------------------------------------------- */
/*  Démarrage : le monde d'exemple              */
/* -------------------------------------------- */

async function start() {
  Hooks.callAll("init");
  Hooks.callAll("ready");
  Hooks.callAll("canvasReady");

  // Postes de service posés par le MJ (Régions invisibles) : comptoir, cuisine et trois tables
  addZone("Comptoir (comptoir, tireuse, caisse)", { mode: "work", actions: new Set(["pass", "tap", "cash"]), table: 1 });
  addZone("Cuisine (cuisine, planche et cave)", { mode: "work", actions: new Set(["stove", "board"]), table: 1 });
  for (const n of [1, 2, 3]) addZone(`Table ${n}`, { mode: "table", actions: new Set(), table: n });
  // Thorin attend derrière le comptoir
  tokenOf(actors[0]).regions.add(scene.regions[0]);

  // Le MJ prépare deux tavernes et ouvre la première sur la scène
  const village = await api().saveTavern(TEMPLATES.village());
  await api().saveTavern(TEMPLATES.harbor());
  await api().setSceneTavern(scene, village.id);
  await ChatMessage.create({
    content: `<div class="otium-chat"><p class="otium-chat-head"><i class="fa-solid fa-door-open"></i> ${game.i18n.format("OTIUM.List.Announce", { tavern: esc(village.name) })}</p><p class="hint">${game.i18n.localize("OTIUM.List.AnnounceHint")}</p></div>`
  });

  // On commence côté joueur, carte ouverte
  game.user = users.find((u) => u.id === "alice");
  renderAll();
  await api().openMenu();
}

start().catch((err) => bench.report(err));
