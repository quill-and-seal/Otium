# Otium

Le temps libre de vos personnages pour **Foundry VTT v14** (système **dnd5e**).

*Otium*, c'est le loisir en latin : le moment où les personnages se posent entre deux aventures. Le module rend ces moments jouables **sans le MJ**, pour qu'il puisse souffler, préparer la suite ou s'occuper d'un autre joueur.

La première scène, c'est **la taverne**, avec deux façons de la jouer :

- **Clientèle** : les joueurs ouvrent la carte et commandent eux-mêmes. Paiement, monnaie rendue, stock, annonce dans le chat et, si le MJ le veut, effets en jeu : tout est automatique.
- **Service** : les joueurs sont le personnel. Ils tirent les bières, cuisinent, servent les tables et encaissent, en temps réel et chrono en main, pendant que le MJ règle l'affluence.

Un module de l'atelier [Quill & Seal](https://github.com/quill-and-seal).

## Installation

Dans Foundry, **Modules complémentaires → Installer un module**, puis colle ce lien de manifeste :

```
https://github.com/quill-and-seal/Otium/releases/latest/download/module.json
```

Active ensuite le module dans ton monde **dnd5e**.

## Démarrage rapide

1. **MJ** : dans la barre de gauche, groupe **Jetons**, clique sur **Gérer les tavernes** (icône d'échoppe).
2. Choisis un modèle (**Auberge de village**, **Taverne de port** ou **Établissement chic**) et clique sur **Créer**.
3. Clique sur la **porte** à côté de la taverne pour l'ouvrir sur la scène active.
4. **Joueurs** : dans le groupe Jetons, l'icône de **chope** ouvre la carte. Ils commandent seuls.

Pour que les joueurs tiennent la taverne à la place, voir [Mode Service](#mode-service--les-joueurs-tiennent-la-taverne).

## Les outils

Tout se trouve dans le groupe **Jetons** de la barre de gauche :

| Outil | Pour qui | Rôle |
| --- | --- | --- |
| Chope — *Carte de la taverne* | Tous | Commander. Pendant un service : s'attabler et commander aux serveurs |
| Clochette — *Service : prendre son poste* | Joueurs | Ouvrir son poste de serveur |
| Presse-papiers — *Service (MJ)* | MJ | Ouvrir, piloter et terminer un service |
| Échoppe — *Gérer les tavernes* | MJ | Créer, modifier, ouvrir et fermer les tavernes |

## Mode Clientèle : les joueurs commandent seuls

### Préparer une taverne (MJ)

Dans **Gérer les tavernes** :

- **Créer** à partir d'un modèle, ou d'une taverne vide.
- **Crayon** : modifier le nom, le tenancier, la description et la carte. Pour chaque article : catégorie (boissons, plats, chambres, divers), prix, stock (vide = illimité), effet, et poste de service.
- **Porte** : ouvrir ou fermer la taverne sur la scène active. L'ouverture est annoncée dans le chat.
- **Œil** : voir la carte comme un joueur.

### Commander (joueurs)

1. Clique sur la **chope**.
2. Choisis le personnage qui paie : par défaut le jeton sélectionné, sinon ton personnage.
3. Ajoute des articles avec **+** et **−**, puis **Commander**.

La bourse est débitée avec rendu de monnaie, le stock baisse et le chat annonce la commande.

### Effets en jeu (au choix du MJ)

Une case par taverne, **Effets en jeu**, les active ou non :

- **Boissons** : chaque boisson a un degré (0 à 3). Les degrés s'additionnent jusqu'au prochain repos long. À 3, le personnage est **Éméché** (pour le roleplay) ; à 6, il est **Ivre** et reçoit l'état **Empoisonné**. Le repos long efface tout, et ne retire Empoisonné que s'il venait d'Otium.
- **Plats** : des points de vie temporaires, gardés seulement s'ils dépassent ceux que le personnage a déjà.
- **Chambres** : la fenêtre de repos court ou long de dnd5e s'ouvre après la commande.

Sans effets, une commande se contente de payer et de s'annoncer.

## Mode Service : les joueurs tiennent la taverne

Pendant un service, les personnages sont le personnel. Les clients entrent et commandent : il faut préparer, servir et encaisser, le plus vite possible.

Chaque commande a un **chronomètre** qui part de 0 et s'arrête quand tout est servi. Plus c'est rapide, plus le pourboire est gros :

| Palier | Pourboire |
| --- | --- |
| **Éclair** | gros |
| **Rapide** | bon |
| **Correct** | petit |
| **Lent** | aucun |

Le temps visé dépend des plats commandés (un ragoût prend plus de temps qu'une bière). Une jauge sous le chrono montre le temps restant avant de descendre au palier suivant. Un client pressé vise plus court, mais donne plus s'il est servi à temps.

### Lancer un service (MJ)

1. Ouvre une taverne sur la scène (voir plus haut).
2. Ouvre l'outil **Service (MJ)**, choisis le nombre de tables et clique sur **Ouvrir le service**. Le chat invite les joueurs à prendre leur poste.
3. Quand tout le monde est prêt, clique sur **Lancer le service**.

Pendant le service, le MJ peut :

- mettre en **pause** ou accélérer (**×2**) ;
- régler l'**affluence** (calme, normale, coup de feu) et le **temps visé** (plus long pour des joueurs débutants, plus court pour corser) ;
- faire entrer un client, un **client pressé** ou une **grande tablée** ;
- suivre la salle, le personnel et le journal en direct.

**Terminer le service** affiche le bilan (recette, pourboires, temps moyen, satisfaction). **Verser les pourboires** les répartit sur les fiches des serveurs, et les stocks consommés sont retirés de la taverne.

### Servir (joueurs)

Ouvre l'outil **Service : prendre son poste**, choisis ton personnage, puis :

- **Tireuse** : maintiens le bouton et relâche dans la zone verte. Une chope parfaite rapporte un meilleur pourboire ; trop longtemps et ça déborde.
- **Cuisine** : trois feux. Un plat prêt doit être sorti vite, sinon il brûle.
- **Planche et cave** : pain, vin… Ton personnage est occupé pendant la préparation.
- **Comptoir et plateau** : clique un plat pour le charger (trois places), puis **Servir** sur une table. Le plateau propose directement les tables qui attendent ce que tu portes, celles qui attendent depuis le plus longtemps en premier. Tout se fait aussi en glisser-déposer.
- **Encaisser** : rends la monnaie juste. Trop peu, pas de pourboire ; trop, la taverne perd la différence.

### S'attabler (joueurs clients)

Pendant un service, la **chope** installe le joueur à une table : sa commande part chez les serveurs au lieu de passer toute seule. Il suit l'avancement et le chrono, peut **appeler un serveur**, et paie quand on vient encaisser.

### Préparer les articles pour le service (MJ)

Dans les réglages d'une taverne, la colonne **Service** indique pour chaque article :

- le **poste** qui le prépare : tireuse, cuisine, planche et cave, ou *pas en salle* (pour les chambres) ;
- son **temps de préparation**, en secondes, pour la cuisine et la planche.

Les trois modèles sont déjà réglés.

## Postes de service : jouer avec les jetons

C'est facultatif. Sans postes, tout se fait depuis les fenêtres. Avec, il faut amener son jeton au bon endroit : derrière le bar pour tirer une bière, en cuisine pour sortir le ragoût.

Les postes sont des **Régions** de Foundry, invisibles aux joueurs, auxquelles on ajoute le comportement d'Otium :

1. Dans la barre de gauche, ouvre l'outil **Régions** (avec les Jetons, les Murs, les Lumières…).
2. Dessine une zone sur le comptoir (rectangle ou polygone).
3. Ouvre sa configuration (double-clic sur la zone), onglet **Comportements**, bouton **+**, puis **Otium — Poste de service**.
4. Choisis le **type de zone** :
   - **Poste de travail** : coche ce qu'on peut y faire parmi *comptoir, tireuse, cuisine, planche et cave, caisse*. Par exemple « comptoir + tireuse + caisse » sur le bar, « cuisine + planche et cave » derrière.
   - **Table** : indique son numéro.
5. Recommence pour chaque poste et chaque table.

En jeu :

- Dès que la scène a **au moins un poste de travail**, un serveur ne peut faire une action que si son jeton est dans un poste qui l'autorise. La vue Serveur montre où il se trouve, grise les postes hors de portée et indique où aller. Le MJ revérifie chaque action.
- Amener son jeton dans un poste **fait prendre son poste** et ouvre la vue Serveur.
- Poser son jeton sur une **table** pendant un service y installe le joueur et ouvre sa vue Client. Il change de table en déplaçant son jeton, et la libère en sortant s'il n'a rien commandé.

## Bon à savoir

- **Un MJ doit être connecté** pour le service et pour les articles en stock limité : c'est lui qui valide les actions et met le stock à jour.
- Le service vit chez le **MJ actif** (le premier MJ connecté). S'il recharge sa page, le service en cours est perdu.
- Un MJ peut commander ou servir pour n'importe quel personnage ; un joueur seulement pour les siens.
- Système **dnd5e** uniquement pour l'instant.

## Banc d'essai

`docs/preview.html` fait tourner le vrai code du module dans un faux Foundry, sans rien installer : on joue le MJ ou un joueur, on commande, on lance un service, on déplace les jetons entre les postes. Pour le régénérer : `npm install && npm run build:preview`.

## API

`game.modules.get("otium").api` :

| Fonction | Rôle |
| --- | --- |
| `openMenu(tavernId?)` | Ouvre la carte d'une taverne, ou celle de la scène |
| `openTaverns()` | Ouvre la liste des tavernes (MJ) |
| `getTaverns()`, `getTavern(id)`, `sceneTavern(scene?)` | Lecture |
| `saveTavern(tavern)`, `deleteTavern(id)`, `setSceneTavern(scene, id)` | Écriture (MJ) |
| `newTavern(data)`, `newItem(data)`, `templates` | Construire une taverne |
| `placeOrder(actor, tavernId, { [itemId]: qty })` | Passer une commande (mode Clientèle) |
| `drunkLevel(actor)`, `addAlcohol(actor, n)`, `sober(actor)` | Ivresse |
| `service.get()`, `service.open({ tables })`, `service.send(op)` | Mode Service |
| `service.openGM()`, `service.openServer(actorId?)`, `service.openClient(actorId?)` | Fenêtres du service |

Hook : `otium.orderPlaced` reçoit `{ actor, tavern, lines, total }` (total en pièces de cuivre).

## Feuille de route

Voir [ROADMAP.md](ROADMAP.md) : jets de compétence pendant le service, ardoise et tournées, puis les mini-jeux de dés et de cartes.
