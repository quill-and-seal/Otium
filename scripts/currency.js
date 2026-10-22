import { ownText } from "./constants.js";

/**
 * Monnaie dnd5e : conversions, paiement avec rendu de monnaie, affichage.
 * Tout est calculé en pièces de cuivre (pc) pour éviter les arrondis.
 */

/** Valeur en pc si le système ne donne pas ses conversions. */
const FALLBACK = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };

/** Pièces dnd5e, de la plus grosse à la plus petite. */
export const DENOMS = ["pp", "gp", "ep", "sp", "cp"];

/** Pièces utilisées pour afficher un prix ou rendre la monnaie (pas d'électrum ni de platine). */
const DISPLAY = ["gp", "sp", "cp"];

/** Valeur d'une pièce en pc (dnd5e donne le nombre de pièces pour 1 po). */
export function cpValue(denom) {
  const conv = globalThis.CONFIG?.DND5E?.currencies?.[denom]?.conversion;
  return conv ? Math.round(100 / conv) : FALLBACK[denom] ?? 1;
}

/** Prix d'un article { value, denom } en pc. */
export function priceToCp(price) {
  return Math.max(0, Math.round((Number(price?.value) || 0) * cpValue(price?.denom ?? "gp")));
}

/** Contenu d'une bourse en pc. */
export function walletToCp(wallet) {
  return DENOMS.reduce((sum, d) => sum + Math.max(0, Math.floor(Number(wallet?.[d]) || 0)) * cpValue(d), 0);
}

/**
 * Paie `cost` pc avec la bourse et rend la monnaie.
 * On donne d'abord les petites pièces, puis la plus petite grosse pièce nécessaire ;
 * la monnaie revient en po, pa et pc. Retourne la nouvelle bourse, ou null si elle ne suffit pas.
 */
export function pay(wallet, cost) {
  const w = {};
  for (const d of DENOMS) w[d] = Math.max(0, Math.floor(Number(wallet?.[d]) || 0));
  if (cost <= 0) return w;
  if (walletToCp(w) < cost) return null;

  const ascending = [...DENOMS].sort((a, b) => cpValue(a) - cpValue(b));
  let paid = 0;
  for (const d of ascending) {
    if (paid >= cost) break;
    const v = cpValue(d);
    const n = Math.min(w[d], Math.ceil((cost - paid) / v));
    w[d] -= n;
    paid += n * v;
  }

  let change = paid - cost;
  for (const d of DISPLAY) {
    const v = cpValue(d);
    const n = Math.floor(change / v);
    w[d] += n;
    change -= n * v;
  }
  return w;
}

/** Ajoute `cp` pièces de cuivre à une bourse, en po, pa et pc. */
export function receive(wallet, cp) {
  const w = {};
  for (const d of DENOMS) w[d] = Math.max(0, Math.floor(Number(wallet?.[d]) || 0));
  let rest = Math.max(0, Math.floor(cp));
  for (const d of DISPLAY) {
    const v = cpValue(d);
    const n = Math.floor(rest / v);
    w[d] += n;
    rest -= n * v;
  }
  return w;
}

/** Somme tendue par un client pour régler `due` pc : la pièce d'or au-dessus. */
export function cashGiven(due) {
  return due < 100 ? 100 : Math.ceil((due + 1) / 100) * 100;
}

/** Abréviation localisée d'une pièce (po, pa, pc… en français). */
export function abbr(denom) {
  const own = ownText(`Currency.${denom}`);
  if (own) return own;
  const key = globalThis.CONFIG?.DND5E?.currencies?.[denom]?.abbreviation;
  return key ? game.i18n.localize(key) : denom;
}

/** Affiche une somme en pc : « 1 po 5 pa ». */
export function formatCp(cp) {
  if (cp <= 0) return `0 ${abbr("cp")}`;
  const parts = [];
  let rest = cp;
  for (const d of DISPLAY) {
    const v = cpValue(d);
    const n = Math.floor(rest / v);
    if (n) parts.push(`${n} ${abbr(d)}`);
    rest -= n * v;
  }
  return parts.join(" ");
}

/** Affiche une bourse telle quelle : « 12 po, 3 pa ». */
export function formatWallet(wallet) {
  const parts = DENOMS.filter((d) => Number(wallet?.[d]) > 0).map((d) => `${wallet[d]} ${abbr(d)}`);
  return parts.length ? parts.join(", ") : `0 ${abbr("cp")}`;
}
