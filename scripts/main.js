/**
 * Otium — le temps libre des personnages pour Foundry VTT v14 (dnd5e).
 * Point d'entrée : réglages, socket, contrôles de scène, hooks et API publique.
 *
 * v0.1 : la taverne en mode Clientèle. Les joueurs ouvrent la carte et commandent seuls ;
 * le paiement, le stock, les effets (au choix du MJ) et l'annonce dans le chat sont automatiques.
 */

import { MODULE_ID, SOCKET, SETTING_TAVERNS, FLAG_TAVERN, log } from "./constants.js";
import { getTaverns, getTavern, saveTavern, deleteTavern, sceneTavern, setSceneTavern, consumeStock, newTavern, newItem } from "./store.js";
import { TEMPLATES } from "./presets.js";
import { placeOrder } from "./order.js";
import { addAlcohol, sober, drunkLevel } from "./effects.js";
import { MenuApp, refreshApps, openApps, openMenu, openSceneMenu, openTavernList } from "./apps.js";

/* -------------------------------------------- */
/*  Initialisation                              */
/* -------------------------------------------- */

Hooks.once("init", () => {
  log("Initialisation");

  game.settings.register(MODULE_ID, SETTING_TAVERNS, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => refreshApps()
  });

  // API publique : game.modules.get("otium").api
  game.modules.get(MODULE_ID).api = {
    templates: TEMPLATES,
    getTaverns,
    getTavern,
    saveTavern,
    deleteTavern,
    newTavern,
    newItem,
    sceneTavern,
    setSceneTavern,
    placeOrder,
    openMenu: (tavernId) => (tavernId ? openMenu(tavernId) : openSceneMenu()),
    openTaverns: () => openTavernList(),
    drunkLevel,
    addAlcohol,
    sober
  };
});

/* -------------------------------------------- */
/*  Socket : le MJ écrit ce que les joueurs     */
/*  n'ont pas le droit d'écrire                 */
/* -------------------------------------------- */

Hooks.once("ready", () => {
  game.socket.on(SOCKET, async (message) => {
    if (!game.users.activeGM?.isSelf) return;
    if (message?.action === "consume") await consumeStock(message.tavernId, message.lines);
  });
});

/* -------------------------------------------- */
/*  Contrôles de scène : deux boutons dans le   */
/*  groupe Jetons                               */
/* -------------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  const tokens = Array.isArray(controls) ? controls.find((c) => c.name === "token" || c.name === "tokens") : controls.tokens;
  if (!tokens) return;

  const add = (tool) => {
    if (Array.isArray(tokens.tools)) tokens.tools.push(tool);
    else tokens.tools[tool.name] = tool;
  };
  const order = Array.isArray(tokens.tools) ? tokens.tools.length : Object.keys(tokens.tools).length;

  // v13+ : onChange (onClick est déprécié)
  add({
    name: "otium-menu",
    title: "OTIUM.Controls.Menu",
    icon: "fa-solid fa-beer-mug-empty",
    button: true,
    order,
    onChange: () => openSceneMenu()
  });

  if (game.user.isGM) {
    add({
      name: "otium-taverns",
      title: "OTIUM.Controls.Taverns",
      icon: "fa-solid fa-store",
      button: true,
      order: order + 1,
      onChange: () => openTavernList()
    });
  }
});

/* -------------------------------------------- */
/*  Synchronisation                             */
/* -------------------------------------------- */

// Taverne ouverte ou fermée sur la scène : la liste du MJ suit
Hooks.on("updateScene", (scene, changes) => {
  if (scene.id !== canvas?.scene?.id) return;
  if (!foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) && !foundry.utils.hasProperty(changes, `flags.-=${MODULE_ID}`)) return;
  refreshApps();
  // Taverne fermée : les cartes ouvertes de cette scène se ferment
  const open = scene.getFlag(MODULE_ID, FLAG_TAVERN);
  for (const app of openApps) {
    if (app instanceof MenuApp && !game.user.isGM && app.tavernId !== open) app.close();
  }
});

Hooks.on("canvasReady", () => refreshApps());

// Bourse ou ivresse d'un personnage modifiée : les cartes qui l'affichent suivent
Hooks.on("updateActor", (actor) => {
  for (const app of openApps) {
    if (app instanceof MenuApp && app.buyerId === actor.id) app.render();
  }
});

// Repos long : on dessoûle (seul le client qui a lancé le repos reçoit ce hook)
Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
  const long = result?.longRest ?? config?.type === "long";
  if (long && actor?.isOwner && drunkLevel(actor) > 0) sober(actor);
});
