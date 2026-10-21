/**
 * Effets en jeu des commandes (dnd5e), appliqués seulement si le MJ les active sur la taverne.
 * - Boissons : l'alcool s'accumule jusqu'au prochain repos long (Éméché, puis Ivre = Empoisonné).
 * - Repas : points de vie temporaires (gardés seulement s'ils dépassent ceux qu'on a déjà).
 * - Chambres : propose un repos court ou long au personnage.
 */

import { MODULE_ID, DRUNK, DRUNK_ICON, t, warn } from "./constants.js";

/**
 * Applique boissons et repas d'une commande.
 * @param {Actor} actor
 * @param {{item: object, qty: number}[]} lines
 * @returns {Promise<string[]>} remarques à ajouter au message de commande
 */
export async function applyEffects(actor, lines) {
  const notes = [];

  const alcohol = lines.reduce((sum, { item, qty }) => sum + (item.category === "drink" ? item.alcohol * qty : 0), 0);
  if (alcohol > 0) {
    const note = await addAlcohol(actor, alcohol);
    if (note) notes.push(note);
  }

  const tempHp = Math.max(0, ...lines.filter(({ item }) => item.category === "food").map(({ item }) => item.tempHp));
  if (tempHp > 0) {
    const current = Number(actor.system?.attributes?.hp?.temp) || 0;
    if (tempHp > current) {
      await actor.update({ "system.attributes.hp.temp": tempHp });
      notes.push(t("Effects.TempHp", { name: actor.name, value: tempHp }));
    }
  }

  return notes;
}

/** Repos le plus long proposé par les chambres commandées ("long", "short" ou null). */
export function restOf(lines) {
  const rests = lines.filter(({ item }) => item.category === "room").map(({ item }) => item.rest);
  if (rests.includes("long")) return "long";
  if (rests.includes("short")) return "short";
  return null;
}

/** Ouvre la fenêtre de repos de dnd5e pour le personnage. */
export async function promptRest(actor, kind) {
  try {
    if (kind === "long") await actor.longRest?.({ dialog: true });
    else if (kind === "short") await actor.shortRest?.({ dialog: true });
  } catch (err) {
    warn("Repos impossible", err);
  }
}

/* -------------------------------------------- */
/*  Ivresse                                     */
/* -------------------------------------------- */

export function drunkLevel(actor) {
  return Number(actor?.getFlag(MODULE_ID, "ivresse")) || 0;
}

/**
 * Ajoute des degrés d'alcool au personnage.
 * @returns {Promise<string|null>} remarque si un palier est franchi
 */
export async function addAlcohol(actor, amount) {
  const before = drunkLevel(actor);
  const level = before + amount;
  await actor.setFlag(MODULE_ID, "ivresse", level);
  await syncDrunkEffect(actor, level);

  if (before < DRUNK.drunk && level >= DRUNK.drunk) {
    // On ne marque l'état que s'il vient de nous (pour ne pas retirer un vrai poison au repos)
    if (!actor.statuses?.has("poisoned")) {
      await actor.toggleStatusEffect("poisoned", { active: true });
      await actor.setFlag(MODULE_ID, "poisoned", true);
    }
    return t("Effects.BecomesDrunk", { name: actor.name });
  }
  if (before < DRUNK.tipsy && level >= DRUNK.tipsy) return t("Effects.BecomesTipsy", { name: actor.name });
  return null;
}

/** Crée, met à jour ou retire l'effet « Éméché / Ivre » selon le niveau. */
async function syncDrunkEffect(actor, level) {
  const existing = actor.effects.find((e) => e.getFlag(MODULE_ID, "drunk"));
  if (level < DRUNK.tipsy) {
    if (existing) await existing.delete();
    return;
  }
  const data = {
    name: t(level >= DRUNK.drunk ? "Effects.DrunkName" : "Effects.TipsyName"),
    img: DRUNK_ICON,
    description: t("Effects.DrunkDescription", { level }),
    flags: { [MODULE_ID]: { drunk: true } }
  };
  if (existing) await existing.update(data);
  else await actor.createEmbeddedDocuments("ActiveEffect", [data]);
}

/** Dessoûle le personnage : niveau à zéro, effet retiré, Empoisonné retiré s'il venait d'Otium. */
export async function sober(actor) {
  if (!actor) return;
  const hadPoison = actor.getFlag(MODULE_ID, "poisoned");
  if (drunkLevel(actor) > 0) await actor.unsetFlag(MODULE_ID, "ivresse");
  await syncDrunkEffect(actor, 0);
  if (hadPoison) {
    await actor.toggleStatusEffect("poisoned", { active: false });
    await actor.unsetFlag(MODULE_ID, "poisoned");
  }
}
