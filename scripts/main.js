/**
 * Otium — le temps libre des personnages pour Foundry VTT v14 (dnd5e).
 * Point d'entrée : réglages, socket, contrôles de scène, hooks et API publique.
 *
 * Mode Clientèle : les joueurs ouvrent la carte et commandent seuls ; paiement, stock,
 * effets (au choix du MJ) et annonce dans le chat sont automatiques.
 * Mode Service : les joueurs tiennent la taverne (salle, tireuse, cuisine, caisse) ;
 * le MJ pilote le service, et un joueur attablé passe commande aux serveurs.
 */

import { MODULE_ID, SOCKET, SETTING_TAVERNS, FLAG_TAVERN, log } from "./constants.js";
import { getTaverns, getTavern, saveTavern, deleteTavern, sceneTavern, setSceneTavern, consumeStock, newTavern, newItem } from "./store.js";
import { TEMPLATES } from "./presets.js";
import { placeOrder } from "./order.js";
import { addAlcohol, sober, drunkLevel } from "./effects.js";
import { MenuApp, refreshApps, openApps, openMenu, openSceneMenu, openTavernList } from "./apps.js";
import { getService, getSummary, openService, sendOp, handleServiceSocket, requestSync, payTips } from "./service.js";
import { ServiceClientApp, openServiceServer, openServiceGM, openServiceClient } from "./service-apps.js";

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
    sober,
    service: {
      get: getService,
      summary: getSummary,
      open: openService,
      send: sendOp,
      payTips,
      openServer: () => openServiceServer(),
      openGM: () => openServiceGM(),
      openClient: () => openServiceClient()
    }
  };
});

/* -------------------------------------------- */
/*  Socket : le MJ écrit ce que les joueurs     */
/*  n'ont pas le droit d'écrire                 */
/* -------------------------------------------- */

Hooks.once("ready", () => {
  game.socket.on(SOCKET, async (message) => {
    if (await handleServiceSocket(message)) return;
    if (!game.users.activeGM?.isSelf) return;
    if (message?.action === "consume") await consumeStock(message.tavernId, message.lines);
  });
  // Un joueur qui arrive en plein service récupère l'état chez le MJ
  requestSync();
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
    // Pendant un service, la chope installe le joueur à une table : ce sont les serveurs qui préparent
    onChange: () => (getService() ? openServiceClient() : openSceneMenu())
  });

  add({
    name: "otium-service",
    title: game.user.isGM ? "OTIUM.Controls.ServiceGM" : "OTIUM.Controls.Service",
    icon: game.user.isGM ? "fa-solid fa-clipboard-list" : "fa-solid fa-bell-concierge",
    button: true,
    order: order + 1,
    onChange: () => (game.user.isGM ? openServiceGM() : openServiceServer())
  });

  if (game.user.isGM) {
    add({
      name: "otium-taverns",
      title: "OTIUM.Controls.Taverns",
      icon: "fa-solid fa-store",
      button: true,
      order: order + 2,
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
    if (app instanceof ServiceClientApp && app.actorId === actor.id) app.render();
  }
});

// Repos long : on dessoûle (seul le client qui a lancé le repos reçoit ce hook)
Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
  const long = result?.longRest ?? config?.type === "long";
  if (long && actor?.isOwner && drunkLevel(actor) > 0) sober(actor);
});
