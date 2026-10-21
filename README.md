# Otium

Le temps libre de vos personnages pour **Foundry VTT v14** (système **dnd5e**).

*Otium*, c'est le loisir en latin : le moment où les personnages se posent entre deux aventures. Le module rend ces moments jouables **sans le MJ**, pour qu'il puisse souffler, préparer la suite ou s'occuper d'un autre joueur.

La première scène, c'est **la taverne** : les joueurs ouvrent la carte et commandent eux-mêmes. Le paiement, la monnaie rendue, le stock, l'annonce dans le chat et, si le MJ le veut, les effets en jeu sont automatiques.

Un module de l'atelier [Quill & Seal](https://github.com/quill-and-seal).

## Installation

Dans Foundry, **Modules complémentaires → Installer un module**, puis colle ce lien de manifeste :

```
https://github.com/quill-and-seal/Otium/releases/latest/download/module.json
```

## Utilisation

### Côté MJ

1. Active le module dans ton monde dnd5e.
2. Dans le groupe **Jetons** de la barre de gauche, clique sur **Gérer les tavernes** (icône d'échoppe).
3. Choisis un modèle (**Auberge de village**, **Taverne de port**, **Établissement chic** ou **Taverne vide**) puis **Créer**.
4. Ajuste la taverne : nom, tenancier, description, et la carte (articles, catégorie, prix, stock, effet).
5. Clique sur la **porte** pour ouvrir la taverne sur la scène active. Un message l'annonce dans le chat.

Sur la carte, un **stock vide** veut dire illimité. L'œil permet de voir la carte comme un joueur.

### Côté joueurs

1. Dans le groupe **Jetons**, clique sur l'icône de **chope**.
2. Choisis le personnage qui paie (par défaut : le jeton sélectionné, sinon ton personnage).
3. Ajoute des articles avec **+** et **−**, puis **Commander**.

La commande passe tout de suite : la bourse est débitée (avec rendu de monnaie), le stock baisse et le chat l'annonce.

### Effets en jeu (au choix du MJ)

Une case par taverne, **Effets en jeu**, les active ou non :

- **Boissons** : chaque boisson a un degré (0 à 3). Les degrés s'additionnent jusqu'au prochain repos long. À 3, le personnage est **Éméché** (pour le roleplay) ; à 6, il est **Ivre** et reçoit l'état **Empoisonné**. Le repos long efface tout (et retire Empoisonné seulement s'il venait d'Otium).
- **Plats** : des points de vie temporaires, gardés seulement s'ils dépassent ceux que le personnage a déjà.
- **Chambres** : la fenêtre de repos court ou long de dnd5e s'ouvre après la commande.

Sans effets, une commande se contente de payer et de s'annoncer.

### Bon à savoir

- Les articles en **stock limité** demandent qu'un MJ soit connecté (c'est lui qui met le stock à jour).
- Un MJ peut commander pour n'importe quel personnage, un joueur seulement pour les siens.

## API

`game.modules.get("otium").api` :

| Fonction | Rôle |
| --- | --- |
| `openMenu(tavernId?)` | Ouvre la carte d'une taverne, ou celle de la scène |
| `openTaverns()` | Ouvre la liste des tavernes (MJ) |
| `getTaverns()`, `getTavern(id)`, `sceneTavern(scene?)` | Lecture |
| `saveTavern(tavern)`, `deleteTavern(id)`, `setSceneTavern(scene, id)` | Écriture (MJ) |
| `newTavern(data)`, `newItem(data)`, `templates` | Construire une taverne |
| `placeOrder(actor, tavernId, { [itemId]: qty })` | Passer une commande |
| `drunkLevel(actor)`, `addAlcohol(actor, n)`, `sober(actor)` | Ivresse |

Hook : `otium.orderPlaced` reçoit `{ actor, tavern, lines, total }` (total en pièces de cuivre).

## Feuille de route

Voir [ROADMAP.md](ROADMAP.md) : mode Service (les joueurs tiennent la taverne), mini-jeux, puis d'autres activités de temps libre.
