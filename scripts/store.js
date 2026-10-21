/**
 * Stockage des tavernes.
 * Toutes les tavernes vivent dans un réglage monde (seul le MJ peut l'écrire) ;
 * une scène pointe vers la taverne ouverte chez elle avec un flag.
 * Les joueurs passent par le socket pour ce qu'ils n'ont pas le droit d'écrire (les stocks).
 */

import { MODULE_ID, SETTING_TAVERNS, FLAG_TAVERN, CATEGORIES, RESTS, STATIONS, STATION_DEFAULTS } from "./constants.js";

const { deepClone, randomID } = foundry.utils;

/* -------------------------------------------- */
/*  Normalisation                               */
/* -------------------------------------------- */

function int(value, min = 0, max = Infinity) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/** Article de la carte avec toutes ses valeurs par défaut. */
export function newItem(data = {}) {
  const stock = data.stock;
  const category = CATEGORIES.includes(data.category) ? data.category : "other";
  const station = STATIONS.includes(data.station) ? data.station : STATION_DEFAULTS[category].station;
  const prepTime = Number(data.prepTime);
  return {
    id: data.id || randomID(),
    name: String(data.name ?? ""),
    category,
    price: {
      value: Math.max(0, Number(data.price?.value) || 0),
      denom: ["pp", "gp", "ep", "sp", "cp"].includes(data.price?.denom) ? data.price.denom : "gp"
    },
    // null = stock illimité
    stock: stock === null || stock === undefined || stock === "" || !Number.isFinite(Number(stock)) ? null : int(stock),
    // Effets (appliqués seulement si le MJ les active sur la taverne)
    alcohol: int(data.alcohol, 0, 3),
    tempHp: int(data.tempHp, 0, 99),
    rest: RESTS.includes(data.rest) ? data.rest : "none",
    // Mode Service : poste qui prépare l'article et temps de préparation (secondes)
    station,
    prepTime: Number.isFinite(prepTime) && prepTime > 0 ? Math.min(120, prepTime) : station === "stove" ? STATION_DEFAULTS.food.prepTime : STATION_DEFAULTS.other.prepTime
  };
}

/** Taverne avec toutes ses valeurs par défaut. */
export function newTavern(data = {}) {
  return {
    id: data.id || randomID(),
    name: String(data.name ?? ""),
    keeper: String(data.keeper ?? ""),
    description: String(data.description ?? ""),
    effects: data.effects !== false,
    menu: Array.isArray(data.menu) ? data.menu.map(newItem) : []
  };
}

/* -------------------------------------------- */
/*  Lecture                                     */
/* -------------------------------------------- */

export function getTaverns() {
  return deepClone(game.settings.get(MODULE_ID, SETTING_TAVERNS) ?? {});
}

export function getTavern(id) {
  const tavern = id ? getTaverns()[id] : null;
  return tavern ? newTavern(tavern) : null;
}

/** Taverne ouverte sur la scène (ou null). */
export function sceneTavern(scene = canvas?.scene) {
  return getTavern(scene?.getFlag(MODULE_ID, FLAG_TAVERN));
}

/* -------------------------------------------- */
/*  Écriture (MJ)                               */
/* -------------------------------------------- */

export async function saveTavern(tavern) {
  const all = getTaverns();
  const clean = newTavern(tavern);
  all[clean.id] = clean;
  await game.settings.set(MODULE_ID, SETTING_TAVERNS, all);
  return clean;
}

export async function deleteTavern(id) {
  const all = getTaverns();
  delete all[id];
  await game.settings.set(MODULE_ID, SETTING_TAVERNS, all);
  // Les scènes qui l'avaient ouverte n'ont plus de taverne
  for (const scene of game.scenes) {
    if (scene.getFlag(MODULE_ID, FLAG_TAVERN) === id) await scene.unsetFlag(MODULE_ID, FLAG_TAVERN);
  }
}

/** Ouvre une taverne sur une scène (id null : la ferme). */
export async function setSceneTavern(scene, id) {
  if (!scene) return;
  if (id) await scene.setFlag(MODULE_ID, FLAG_TAVERN, id);
  else await scene.unsetFlag(MODULE_ID, FLAG_TAVERN);
}

/**
 * Retire du stock les articles commandés. Exécuté par le MJ actif.
 * @param {string} tavernId
 * @param {{id: string, qty: number}[]} lines
 */
export async function consumeStock(tavernId, lines) {
  const all = getTaverns();
  const tavern = all[tavernId];
  if (!tavern) return;
  let changed = false;
  for (const { id, qty } of lines ?? []) {
    const item = tavern.menu?.find((i) => i.id === id);
    if (!item || item.stock === null || item.stock === undefined) continue;
    item.stock = Math.max(0, item.stock - int(qty));
    changed = true;
  }
  if (changed) await game.settings.set(MODULE_ID, SETTING_TAVERNS, all);
}
