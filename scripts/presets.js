/**
 * Tavernes toutes prêtes, pour que le MJ ne parte pas d'une page blanche.
 * Prix inspirés du Manuel des joueurs (chope de bière 4 pc, repas modeste 3 pa, chambre modeste 5 pa…).
 */

import { newTavern } from "./store.js";

const drink = (name, value, denom, alcohol, extra = {}) => ({ name, category: "drink", price: { value, denom }, alcohol, ...extra });
const food = (name, value, denom, tempHp, extra = {}) => ({ name, category: "food", price: { value, denom }, tempHp, ...extra });
const room = (name, value, denom, rest, extra = {}) => ({ name, category: "room", price: { value, denom }, rest, ...extra });

/** Modèles : id → fonction qui construit la taverne (nouveaux identifiants à chaque fois). */
export const TEMPLATES = {
  village: () =>
    newTavern({
      name: "Le Sanglier Repu",
      keeper: "Berthe, la tenancière",
      description: "Une auberge de village aux poutres basses, où l'on sert la même soupe depuis trois générations.",
      menu: [
        drink("Bière brune (chope)", 4, "cp", 1),
        drink("Cidre fermier (chope)", 3, "cp", 1),
        drink("Vin de pays (pichet)", 2, "sp", 2, { station: "board", prepTime: 2.5 }),
        drink("Eau-de-vie de prune (petit verre)", 1, "sp", 3),
        drink("Lait chaud au miel", 2, "cp", 0),
        food("Soupe et pain noir", 6, "cp", 0, { prepTime: 7 }),
        food("Pain, fromage et oignons", 1, "sp", 0, { station: "board", prepTime: 4 }),
        food("Ragoût du jour", 3, "sp", 2, { prepTime: 12 }),
        food("Cochon de lait rôti (pour la table)", 2, "gp", 5, { stock: 1, prepTime: 20 }),
        room("Paillasse dans le dortoir", 1, "sp", "long"),
        room("Chambre simple", 5, "sp", "long", { stock: 4 })
      ]
    }),

  harbor: () =>
    newTavern({
      name: "La Mouette Saoule",
      keeper: "Grogan le Borgne",
      description: "Une taverne de port qui sent le sel, le goudron et le rhum bon marché. On y entend toutes les nouvelles des quais.",
      menu: [
        drink("Bière des docks (chope)", 4, "cp", 1),
        drink("Grog chaud", 5, "cp", 2),
        drink("Rhum noir (verre)", 1, "sp", 3),
        drink("Tord-boyaux du capitaine", 2, "sp", 3, { stock: 6, station: "board", prepTime: 2 }),
        drink("Eau douce (gobelet)", 1, "cp", 0),
        food("Galettes de mer et hareng", 5, "cp", 0, { station: "board", prepTime: 3 }),
        food("Poisson grillé du jour", 3, "sp", 2),
        food("Ragoût de crabe épicé", 5, "sp", 3, { stock: 8, prepTime: 12 }),
        room("Hamac dans l'arrière-salle", 5, "cp", "long"),
        room("Chambre avec vue sur le port", 8, "sp", "long", { stock: 2 })
      ]
    }),

  noble: () =>
    newTavern({
      name: "Le Lys d'Argent",
      keeper: "Dame Ilvara",
      description: "Un établissement raffiné : nappes blanches, musiciens discrets et une carte des vins qui coûte plus cher qu'une épée.",
      menu: [
        drink("Vin elfique de la Lune d'Ambre (verre)", 10, "gp", 2, { stock: 3, station: "board", prepTime: 3 }),
        drink("Hydromel nain vieilli", 5, "sp", 2),
        drink("Vin blanc des coteaux (verre)", 2, "sp", 1, { station: "board", prepTime: 2 }),
        drink("Infusion de fleurs", 1, "sp", 0),
        food("Assiette de la maison", 8, "sp", 3),
        food("Faisan aux baies et pain blanc", 1, "gp", 4),
        food("Banquet des seigneurs (pour la table)", 10, "gp", 8, { stock: 1, prepTime: 25 }),
        food("Pâtisseries fines", 3, "sp", 1, { station: "board", prepTime: 3 }),
        room("Chambre confortable", 2, "gp", "long", { stock: 3 }),
        room("Suite avec bain chaud", 4, "gp", "long", { stock: 1 }),
        room("Salon privé (une heure)", 5, "sp", "short")
      ]
    }),

  empty: () => newTavern({ name: "", menu: [] })
};

/** Ordre d'affichage des modèles. */
export const TEMPLATE_IDS = ["village", "harbor", "noble", "empty"];
