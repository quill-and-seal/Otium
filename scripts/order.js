/**
 * Passage d'une commande en mode Clientèle : tout est automatique.
 * Vérifie stock et bourse, paie (avec rendu de monnaie), retire du stock,
 * applique les effets si le MJ les a activés et annonce la commande dans le chat.
 */

import { MODULE_ID, SOCKET, CATEGORIES, t, esc } from "./constants.js";
import { getTavern, consumeStock } from "./store.js";
import { pay, priceToCp, formatCp } from "./currency.js";
import { applyEffects, restOf, promptRest } from "./effects.js";

/** Personnages pour lesquels l'utilisateur peut commander. */
export function buyerCandidates() {
  return game.actors.filter((a) => a.type === "character" && a.isOwner);
}

/** Personnage par défaut : jeton sélectionné, sinon personnage assigné, sinon le premier possédé. */
export function defaultBuyer() {
  const token = canvas?.tokens?.controlled?.find((tk) => tk.actor?.type === "character" && tk.actor.isOwner);
  return token?.actor ?? game.user.character ?? buyerCandidates()[0] ?? null;
}

/**
 * @param {Actor} actor  personnage qui paie
 * @param {string} tavernId
 * @param {Map<string, number>|Record<string, number>} cart  id d'article → quantité
 * @returns {Promise<boolean>} true si la commande est passée
 */
export async function placeOrder(actor, tavernId, cart) {
  const tavern = getTavern(tavernId);
  if (!tavern) return fail("Order.NoTavern");
  if (!actor?.isOwner) return fail("Order.NoBuyer");

  const entries = cart instanceof Map ? [...cart] : Object.entries(cart ?? {});
  const lines = [];
  for (const [id, rawQty] of entries) {
    const qty = Math.floor(Number(rawQty) || 0);
    const item = tavern.menu.find((i) => i.id === id);
    if (!item || qty <= 0) continue;
    if (item.stock !== null && qty > item.stock) return fail("Order.OutOfStock", { name: item.name });
    lines.push({ item, qty });
  }
  if (!lines.length) return fail("Order.Empty");
  lines.sort((a, b) => CATEGORIES.indexOf(a.item.category) - CATEGORIES.indexOf(b.item.category));

  const total = lines.reduce((sum, { item, qty }) => sum + priceToCp(item.price) * qty, 0);
  const wallet = pay(actor.system?.currency, total);
  if (!wallet) return fail("Order.NotEnough", { name: actor.name });

  // Le stock est dans un réglage monde : il faut un MJ connecté pour le mettre à jour
  const limited = lines.filter(({ item }) => item.stock !== null);
  const gm = game.users.activeGM;
  if (limited.length && !gm) return fail("Order.NoGM");

  await actor.update({ "system.currency": wallet });

  if (limited.length) {
    const payload = limited.map(({ item, qty }) => ({ id: item.id, qty }));
    if (gm.isSelf) await consumeStock(tavern.id, payload);
    else game.socket.emit(SOCKET, { action: "consume", tavernId: tavern.id, lines: payload });
  }

  const notes = tavern.effects ? await applyEffects(actor, lines) : [];

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: orderMessage(actor, tavern, lines, total, notes),
    flags: { [MODULE_ID]: { order: true } }
  });

  const rest = tavern.effects ? restOf(lines) : null;
  if (rest) await promptRest(actor, rest);

  Hooks.callAll(`${MODULE_ID}.orderPlaced`, { actor, tavern, lines, total });
  return true;
}

function fail(key, data) {
  ui.notifications.warn(t(key, data));
  return false;
}

function orderMessage(actor, tavern, lines, total, notes) {
  const rows = lines
    .map(({ item, qty }) => `<li><span class="otium-qty">${qty}×</span> ${esc(item.name)} <span class="otium-price">${formatCp(priceToCp(item.price) * qty)}</span></li>`)
    .join("");
  return `
    <div class="otium-chat">
      <p class="otium-chat-head"><i class="fa-solid fa-beer-mug-empty"></i> ${t("Order.Message", { name: esc(actor.name), tavern: esc(tavern.name || t("Tavern.Unnamed")) })}</p>
      <ul class="otium-chat-lines">${rows}</ul>
      <p class="otium-chat-total">${t("Order.Total")} : <strong>${formatCp(total)}</strong></p>
      ${notes.map((n) => `<p class="otium-chat-note">${esc(n)}</p>`).join("")}
    </div>`;
}
