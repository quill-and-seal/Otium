/** Identifiant du module, utilisé pour les flags, les réglages, le socket et l'API. */
export const MODULE_ID = "otium";

/** Canal de socket du module (le GM y écrit ce que les joueurs n'ont pas le droit d'écrire). */
export const SOCKET = `module.${MODULE_ID}`;

/** Réglage monde qui contient toutes les tavernes { [id]: taverne }. */
export const SETTING_TAVERNS = "taverns";

/** Flag de scène : id de la taverne ouverte sur cette scène. */
export const FLAG_TAVERN = "tavern";

/** Catégories d'un article de la carte, dans l'ordre d'affichage. */
export const CATEGORIES = ["drink", "food", "room", "other"];

/**
 * Poste du mode Service qui prépare un article.
 * tap : tireuse (mini-jeu), stove : cuisine (feux), board : planche et cave, none : pas servi en salle
 */
export const STATIONS = ["tap", "stove", "board", "none"];

/** Poste et temps de préparation par défaut, selon la catégorie. */
export const STATION_DEFAULTS = Object.freeze({
  drink: { station: "tap", prepTime: 0 },
  food: { station: "stove", prepTime: 8 },
  other: { station: "board", prepTime: 3 },
  room: { station: "none", prepTime: 0 }
});

/** Ce qu'un poste de service (zone de Région) peut autoriser, dans l'ordre d'affichage. */
export const ZONE_ACTIONS = ["pass", "tap", "stove", "board", "cash"];

/** Repos proposé par une chambre. */
export const RESTS = ["none", "short", "long"];

/**
 * Paliers d'ivresse (somme des degrés d'alcool bus depuis le dernier repos long).
 * tipsy : effet « Éméché » (sans règle, pour le roleplay)
 * drunk : effet « Ivre » + état Empoisonné de dnd5e
 */
export const DRUNK = Object.freeze({ tipsy: 3, drunk: 6 });

/** Icône de l'effet d'ivresse (icône fournie avec Foundry). */
export const DRUNK_ICON = "icons/svg/daze.svg";

export function log(...args) {
  console.log("Otium |", ...args);
}

export function warn(...args) {
  console.warn("Otium |", ...args);
}

/** Traduction raccourcie. */
export function t(key, data) {
  const full = `OTIUM.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

/** Échappe une valeur pour l'insérer dans du HTML. */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
