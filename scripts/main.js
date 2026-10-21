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
import { registerStationBehavior, onZoneEvent, STATION_BEHAVIOR } from "./zones.js";

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

  // Comportement de Région « Poste de service » (comptoir, cuisine, tables)
  registerStationBehavior();

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
/*  Postes de service : entrer dans une zone    */
/* -------------------------------------------- */

onZoneEvent(
  // Entrée : derrière le comptoir on prend son poste, à une table on s'installe
  async (zone, event) => {
    const token = event.data?.token;
    const actor = token?.actor;
    const s = getService();
    if (!actor || !s || (s.sceneId && token.parent?.id !== s.sceneId)) return refreshServiceApps();
    const mover = !!event.user?.isSelf;
    const player = actor.isOwner && !game.user.isGM;
    if (zone.mode === "work") {
      if (actor.type !== "character") return refreshServiceApps();
      if (mover && !s.staff[actor.id]) await sendOp({ type: "join", actorId: actor.id });
      if (player) openServiceServer(actor.id);
    } else if (zone.mode === "table" && !s.staff[actor.id]) {
      if (mover) await sendOp({ type: "sit", actorId: actor.id, table: zone.table });
      if (player) openServiceClient(actor.id);
    }
    refreshServiceApps();
  },
  // Sortie d'une table sans commande en cours : la table se libère
  async (zone, event) => {
    const actor = event.data?.token?.actor;
    if (actor && zone.mode === "table" && event.user?.isSelf && getService()) await sendOp({ type: "standUp", actorId: actor.id });
    refreshServiceApps();
  }
);

/** Redessine les fenêtres du service (le jeton a bougé : les postes accessibles changent). */
function refreshServiceApps() {
  for (const app of openApps) if (app.onServiceChanged && app.rendered !== false) app.render();
}

Hooks.on("updateToken", (token, changes) => {
  if (!getService()) return;
  if ("x" in changes || "y" in changes || "elevation" in changes) refreshServiceApps();
});
for (const hook of ["createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior"]) {
  Hooks.on(hook, (behavior) => {
    if (behavior.type === STATION_BEHAVIOR && getService()) refreshServiceApps();
  });
}

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
