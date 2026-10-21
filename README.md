# Otium

Le temps libre de vos personnages pour **Foundry VTT v14** (système **dnd5e**).

*Otium*, c'est le loisir en latin : le moment où les personnages se posent entre deux aventures. Le module rend ces moments jouables **sans le MJ**, pour qu'il puisse souffler, préparer la suite ou s'occuper d'un autre joueur.

La première scène, c'est **la taverne**, avec deux modes :

- **Clientèle** : les joueurs ouvrent la carte et commandent eux-mêmes. Le paiement, la monnaie rendue, le stock, l'annonce dans le chat et, si le MJ le veut, les effets en jeu sont automatiques.
- **Service** : les joueurs sont le personnel. Ils tirent les bières, cuisinent, servent les tables et encaissent, en temps réel, pendant que le MJ pilote l'affluence.

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

## Mode Service : les joueurs tiennent la taverne

Pendant un service, les personnages sont le personnel. Les clients entrent, commandent et s'impatientent ; il faut préparer, servir et encaisser avant qu'ils partent.

### Côté MJ

1. Ouvre une taverne sur la scène (voir plus haut), puis l'outil **Service (MJ)** dans le groupe Jetons.
2. Choisis le nombre de tables et clique sur **Ouvrir le service**. Un message invite les joueurs à prendre leur poste.
3. Clique sur **Lancer le service** quand tout le monde est prêt.

Pendant le service : pause, vitesse ×2, affluence (calme, normale, coup de feu), patience des clients, et des événements (client pressé, grande tablée). La salle, le personnel et le journal se suivent en direct. **Terminer le service** affiche le bilan ; **Verser les pourboires** les répartit sur les fiches des serveurs.

### Côté serveurs

L'outil **Service : prendre son poste** ouvre le poste de serveur. Choisis ton personnage, puis :

- **Tireuse** : maintiens le bouton et relâche dans la zone verte. Une chope parfaite rapporte un meilleur pourboire, trop longtemps et ça déborde.
- **Cuisine** : trois feux. Un plat prêt doit être sorti vite, sinon il brûle.
- **Planche et cave** : pain, vin… ton personnage est occupé pendant la préparation.
- **Comptoir et plateau** : clique un plat pour le charger (trois places), puis **Servir** sur une table. Tu peux aussi tout faire en glisser-déposer.
- **Encaisser** : rends la monnaie juste. Trop peu, pas de pourboire ; trop, la taverne perd la différence.

### Côté clients

Pendant un service, la **chope** installe le joueur à une table : sa commande part chez les serveurs au lieu de passer toute seule. Il suit l'avancement, peut appeler un serveur, et paie quand on vient encaisser.

### Postes de service sur la scène

Pour jouer le service avec les jetons, dessine des **Régions** (outil Régions de Foundry, invisibles aux joueurs) et ajoute-leur le comportement **Otium — Poste de service** :

- **Poste de travail** sur le comptoir, la cuisine… Coche ce qu'on peut y faire : comptoir, tireuse, cuisine, planche et cave, caisse. Un serveur ne peut alors faire une action que si son jeton est dans un poste qui l'autorise, et la vue Serveur lui indique où aller. Entrer dans un poste fait prendre son poste et ouvre la vue Serveur.
- **Table**, avec son numéro : un joueur qui y pose son jeton pendant un service s'y installe, et sa vue Client s'ouvre.

Sans aucun poste de travail sur la scène, tout reste permis partout, comme avant.

### Réglages de la carte

Dans les réglages d'une taverne, la colonne **Service** indique le poste qui prépare chaque article (tireuse, cuisine, planche et cave, ou pas en salle pour les chambres) et son temps de préparation.

Le service vit chez le MJ connecté : s'il recharge sa page, le service en cours est perdu.

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
| `service.get()`, `service.open({ tables })`, `service.send(op)` | Mode Service |
| `service.openGM()`, `service.openServer()`, `service.openClient()` | Fenêtres du service |

Hook : `otium.orderPlaced` reçoit `{ actor, tavern, lines, total }` (total en pièces de cuivre).

## Feuille de route

Voir [ROADMAP.md](ROADMAP.md) : jets de compétence pendant le service, mini-jeux, puis d'autres activités de temps libre.
