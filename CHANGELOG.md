# Journal des versions

## 0.1.4

L'onglet du MJ et l'encart des postes.

- Nouvel onglet **Otium** dans la barre latérale, réservé au MJ (icône de chope, juste avant les réglages)
- **Taverne de la scène** : choisir la taverne ouverte (ou la fermer) dans une liste, voir sa carte, la modifier, ouvrir la liste de toutes les tavernes ; le choix est verrouillé pendant un service
- **Service** : tout le pilotage directement dans l'onglet (ouvrir, lancer, pause, vitesse, affluence, temps visé, événements, salle avec les chronos, personnel, journal, bilan et pourboires), et un bouton pour l'ouvrir en fenêtre
- **Encart des postes** : tant que le jeton d'un joueur est dans un poste ou sur une table, une case s'affiche dans un coin de l'écran avec le nom du lieu, ce qu'on peut y faire et l'état du service (plats prêts, plateau, tables à servir, additions ; ou, à table, l'avancement et le chrono de sa commande). Un clic ouvre la bonne vue. Seul le joueur du jeton la voit ; le coin, ou « désactivé », se choisit dans les réglages du module (réglage par joueur)
- Groupe Jetons allégé côté MJ : la chope et un bouton qui affiche l'onglet Otium remplacent « Service (MJ) » et « Gérer les tavernes ». Sans onglet disponible, les anciens boutons reviennent

## 0.1.3

Le chrono remplace la patience.

- Chaque commande a un **chronomètre** qui part de 0 et s'arrête quand tout est servi ; les clients ne partent plus
- Le pourboire dépend de la rapidité, en quatre paliers : **Éclair** (gros pourboire), **Rapide**, **Correct**, **Lent** (rien). Le temps visé de chaque commande suit la préparation de ses plats ; un client pressé vise plus court mais donne plus
- Une jauge sous le chrono montre le temps restant avant le palier suivant, et le plateau propose d'abord les tables qui ont le plus attendu
- Vue MJ : « Temps visé » remplace « Patience », temps moyen de service dans les statistiques et le bilan

## 0.1.2

Les postes de service : la taverne se joue sur la scène.

- Nouveau comportement de Région **Otium — Poste de service**, invisible aux joueurs comme toutes les Régions
- **Poste de travail** : le MJ coche ce qu'on peut y faire (comptoir, tireuse, cuisine, planche et cave, caisse). Dès qu'une scène a un poste, chaque action du service se fait depuis un poste qui l'autorise, avec son jeton dedans ; sans poste, tout reste permis partout
- Entrer dans un poste fait prendre son poste au personnage et ouvre la vue Serveur du joueur
- **Table** : un joueur qui pose son jeton sur une table s'y installe pendant un service (et la vue Client s'ouvre) ; il change de table en déplaçant son jeton, et la quitte en sortant s'il n'a rien commandé
- Vue Serveur : position du jeton affichée, postes hors de portée grisés avec l'indication du poste à rejoindre

## 0.1.1

Le mode Service : les joueurs tiennent la taverne.

- Vue **MJ** : ouvrir un service dans la taverne de la scène, le lancer, le mettre en pause ou l'accélérer, régler l'affluence et la patience des clients, faire entrer un client pressé ou une grande tablée, suivre la salle, le personnel et le journal en direct
- Vue **Serveur** : prendre son poste, servir les tables, tirer les bières à la tireuse (maintenir, relâcher dans la zone verte), cuire les plats sur trois feux (à sortir avant qu'ils brûlent), préparer à la planche et à la cave, porter jusqu'à trois plats sur son plateau, encaisser en rendant la monnaie juste
- Glisser-déposer entre le feu, le comptoir, le plateau et les tables ; le comptoir regroupe les plats identiques et le plateau propose directement les tables à servir
- Vue **Client** : pendant un service, la chope installe le joueur à une table ; sa commande part chez les serveurs, il suit l'avancement et peut appeler un serveur ; sa bourse est débitée à l'encaissement et les effets en jeu s'appliquent
- Bilan en fin de service (recette, pourboires, satisfaction), pourboires versés sur les fiches des serveurs en un clic, stocks reportés sur la taverne
- Nouvelle colonne **Service** dans les réglages d'une taverne : poste qui prépare chaque article et temps de préparation
- Le MJ actif fait autorité : chaque action des joueurs passe par lui, l'état est renvoyé à tout le monde

## 0.1.0

Première version : la taverne en mode Clientèle.

- Tavernes gérées par le MJ, avec trois modèles prêts à l'emploi (auberge de village, taverne de port, établissement chic)
- Carte côté joueurs : panier, choix du personnage qui paie, bourse affichée
- Commandes automatiques : paiement avec rendu de monnaie, stock limité ou illimité, annonce dans le chat
- Effets en jeu activables par taverne : ivresse (Éméché, puis Ivre et Empoisonné, effacée au repos long), points de vie temporaires des repas, repos des chambres
- API publique et hook `otium.orderPlaced`
