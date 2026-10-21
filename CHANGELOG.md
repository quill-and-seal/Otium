# Journal des versions

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
