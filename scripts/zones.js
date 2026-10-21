/**
 * Zones de service : un comportement de Région « Otium — Poste de service ».
 *
 * Le MJ dessine une Région (invisible aux joueurs, comme toutes les Régions par défaut) sur le comptoir,
 * la cuisine ou une table, et lui ajoute ce comportement :
 * - « Poste de travail » : il coche ce qu'on peut y faire (comptoir, tireuse, cuisine, planche, caisse).
 *   Dès qu'une scène a au moins un poste, un serveur ne peut faire une action que si son jeton
 *   est dans un poste qui l'autorise. Sans aucun poste, tout reste permis partout.
 * - « Table » : un jeton de joueur qui y entre s'installe à cette table pendant un service.
 *
 * Entrer dans un poste ouvre aussi la vue Serveur du joueur (et lui fait prendre son poste).
 * Le type est déclaré dans module.json (documentTypes.RegionBehavior.station) : « otium.station ».
 */

import { MODULE_ID, ZONE_ACTIONS, t, warn } from "./constants.js";

export const STATION_BEHAVIOR = `${MODULE_ID}.station`;

/** Action du poste nécessaire pour chaque opération du service (absente : permise partout). */
export const OP_ZONE = Object.freeze({
  take: "pass",
  tap: "tap",
  launch: "stove",
  takeOut: "stove",
  trash: "stove",
  prep: "board",
  cashStart: "cash"
});

/** Fonctions appelées quand un jeton entre ou sort d'une zone (branchées par main.js). */
const handlers = { enter: null, exit: null };
export function onZoneEvent(enter, exit) {
  handlers.enter = enter;
  handlers.exit = exit;
}

/** Déclare le comportement auprès de Foundry (hook « init »). */
export function registerStationBehavior() {
  const Base = foundry.data?.regionBehaviors?.RegionBehaviorType;
  const fields = foundry.data?.fields;
  if (!Base || !fields || !CONFIG.RegionBehavior) return false;
  const EVENTS = CONST?.REGION_EVENTS ?? {};
  const ENTER = EVENTS.TOKEN_ENTER ?? "tokenEnter";
  const EXIT = EVENTS.TOKEN_EXIT ?? "tokenExit";

  try {
    class StationBehavior extends Base {
      static LOCALIZATION_PREFIXES = ["OTIUM.RegionBehavior"];

      static defineSchema() {
        return {
          mode: new fields.StringField({
            required: true,
            blank: false,
            initial: "work",
            choices: () => ({ work: t("RegionBehavior.Mode.work"), table: t("RegionBehavior.Mode.table") })
          }),
          actions: new fields.SetField(
            new fields.StringField({ choices: () => Object.fromEntries(ZONE_ACTIONS.map((a) => [a, t(`Zone.${a}`)])) }),
            { initial: ["pass", "tap", "cash"] }
          ),
          table: new fields.NumberField({ required: true, integer: true, min: 1, max: 12, initial: 1 })
        };
      }

      static async #onEnter(event) {
        await handlers.enter?.(this, event);
      }

      static async #onExit(event) {
        await handlers.exit?.(this, event);
      }

      static events = {
        [ENTER]: this.#onEnter,
        [EXIT]: this.#onExit
      };
    }
    CONFIG.RegionBehavior.dataModels[STATION_BEHAVIOR] = StationBehavior;
    if (CONFIG.RegionBehavior.typeIcons) CONFIG.RegionBehavior.typeIcons[STATION_BEHAVIOR] = "fa-solid fa-bell-concierge";
    return true;
  } catch (err) {
    warn("Comportement de Région « Poste de service » indisponible", err);
    return false;
  }
}

/* -------------------------------------------- */
/*  Lecture des zones                           */
/* -------------------------------------------- */

function behaviorsOf(region) {
  const list = region.behaviors?.contents ?? [...(region.behaviors ?? [])];
  return list.filter((b) => b.type === STATION_BEHAVIOR && !b.disabled);
}

/** Régions où se trouve un jeton. */
function regionsOfToken(token) {
  if (token.regions) return [...token.regions];
  const scene = token.parent;
  const c = token.object?.center;
  if (!scene || !c) return [];
  return (scene.regions?.contents ?? [...(scene.regions ?? [])]).filter((r) => {
    try {
      return r.testPoint?.({ x: c.x, y: c.y, elevation: token.elevation ?? 0 });
    } catch {
      return false;
    }
  });
}

/** La scène a-t-elle au moins un poste de travail ? */
export function hasWorkZones(scene) {
  for (const region of scene?.regions ?? []) {
    if (behaviorsOf(region).some((b) => b.system?.mode === "work")) return true;
  }
  return false;
}

/**
 * Ce qu'un personnage peut faire là où se trouve son jeton.
 * @returns {Set<string>|null} null : la scène n'a aucun poste, tout est permis
 */
export function zoneActions(sceneId, actorId) {
  const scene = game.scenes.get?.(sceneId) ?? [...(game.scenes ?? [])].find((s) => s.id === sceneId);
  if (!scene || !hasWorkZones(scene)) return null;
  const out = new Set();
  const tokens = scene.tokens?.contents ?? [...(scene.tokens ?? [])];
  for (const token of tokens) {
    if (token.actorId !== actorId && token.actor?.id !== actorId) continue;
    for (const region of regionsOfToken(token)) {
      for (const b of behaviorsOf(region)) {
        if (b.system?.mode !== "work") continue;
        for (const a of b.system.actions ?? []) out.add(a);
      }
    }
  }
  return out;
}

/** Une opération est-elle permise là où se trouve le jeton ? Retourne l'action manquante, ou null. */
export function missingZone(sceneId, actorId, opType) {
  const need = OP_ZONE[opType];
  if (!need) return null;
  const allowed = zoneActions(sceneId, actorId);
  if (!allowed || allowed.has(need)) return null;
  return need;
}
