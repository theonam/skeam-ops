# Hypothèses du catalogue

Audience interne. Justification des fourchettes de `modules.yaml`, graine du 2026-10-15. Toutes les confiances sont `faible` : ces heures sont des estimations raisonnées, pas des mesures. Elles seront remplacées progressivement par les mesures de `calibrer.py` ; voir la méthode dans `README.md`.

## Hypothèses communes

- **Ce que compte une heure** : le temps des sessions de développement assisté par IA, agent Claude Code piloté par Théo, plus la recette de Théo saisie sur l'item. C'est exactement ce que mesurera `calibrer.py` : les lignes de temps `valide: true` rattachées à l'item. Les réunions, le cadrage, la gestion de projet et l'administratif sont saisis hors item ; ils ne sont dans aucun module et doivent être couverts par la marge de sécurité et le plancher. Le rapport `calibration.md` mesure leur part réelle par client.
- **Recette comprise** : chaque fourchette inclut la vérification par Théo des critères d'acceptation, les corrections qui en découlent et une démonstration au client. Elle n'inclut pas une recette utilisateur longue côté client.
- **Une fois par projet** : un module se chiffre une fois par client. S'il est découpé en plusieurs items, `chiffrer.py` répartit sa fourchette au prorata des estimations du backlog.
- **Socle disponible** : les modules du socle supposent la brique correspondante disponible dans le socle, chantier `feat/socle`. `heures_min` correspond à une réutilisation avec paramétrage ; `heures_max` à une adaptation notable ou à une première mise en œuvre si la brique du socle n'est pas encore prête. Tant que le socle n'est pas livré, viser le haut de la fourchette pour les modules du socle.
- **Pas de double compte** : un module métier utilise les modules du socle sans les recompter. Exemple : `devis` comprend son gabarit PDF et l'appel à la numérotation, mais pas le moteur PDF, compté dans `pdf`, ni la numérotation, comptée dans `numerotation-legale`.
- **Application connectée** : les écrans supposent un réseau disponible, avec reprise sur erreur. Un vrai fonctionnement hors ligne avec synchronisation et résolution de conflits n'est dans aucun module ; il se chiffre à part, au moins 15 à 30 heures.
- **Hors catalogue** : hébergement, maintenance et run, formation, achats de licences ou d'API, coût des appels IA. Ils se vendent sur des lignes à part.
- **Taille** : `taille_type` découle du milieu de la fourchette ; XS jusqu'à 3 heures, S jusqu'à 6, M jusqu'à 12, L jusqu'à 24, XL au-delà. Cette règle est vérifiée par `tests/test_catalogue.py`.
- **Ordre de grandeur** : la somme des milieux de fourchette des 26 modules fait 228 heures, environ 28 850 euros HT au taux de 100 euros avec marges. Contrôle sur l'offre E G M : les 21 modules de l'outil vendu 24 000 euros HT font 184,5 heures, que le catalogue rechiffre à 23 800 euros formation comprise. Les quatre options E G M, vendues de 2 500 à 3 500 euros, sortent du catalogue entre 900 et 2 500 euros : une option se vend à sa valeur, avec un minimum, et non à ses heures.

## Modules du socle

### Connexion et droits, `connexion-droits`

- **Périmètre** : connexion par lien envoyé par courriel ou par mot de passe, invitation, désactivation, trois à quatre profils, droits par écran et par action, journal des connexions.
- **Hors périmètre** : authentification unique Microsoft Entra ID, double facteur imposé, droits par enregistrement complexes.
- **Justification** : 3 heures pour paramétrer la brique du socle avec les profils du client ; 8 heures si la matrice de droits est fine ou si le socle doit être adapté.
- **Risques** : profils mal définis au cadrage, droits par chantier ou par équipe.

### Numérotation légale, `numerotation-legale`

- **Périmètre** : séquences continues sans trou par type de pièce et par exercice, préfixe paramétrable, numéro attribué à la validation et jamais réutilisé, résistance aux validations simultanées.
- **Justification** : logique courte mais critique ; 2 heures en réutilisant le socle, 4 heures avec reprise d'une séquence existante et tests de concurrence.
- **Risques** : reprise d'un compteur existant chez le client, plusieurs établissements.

### Génération PDF, `pdf`

- **Périmètre** : moteur de génération, charte commune, en-tête, pied de page, mentions légales, pagination, logo, aperçu et téléchargement. Les gabarits propres à chaque document sont comptés dans le module métier.
- **Justification** : 3 heures pour appliquer la charte du client au moteur du socle ; 8 heures pour une mise en page exigeante ou des tableaux longs sur plusieurs pages.
- **Risques** : exigences graphiques fortes, PDF/A demandé, qui relève alors de `facturation-electronique`.

### Import et export Excel, `import-export-excel`

- **Périmètre** : export Excel de toute liste filtrée ; import avec correspondance des colonnes, contrôle ligne à ligne, rapport d'erreurs téléchargeable et import partiel refusé.
- **Justification** : l'export est quasi gratuit avec le socle ; l'import propre, avec contrôles et rapport, fait l'essentiel des heures. 4 heures pour un objet importé, 10 heures pour plusieurs objets liés.
- **Risques** : fichiers clients hétérogènes. La reprise initiale de données relève de `reprise-donnees`.

### Listes et filtres, `listes-filtres`

- **Périmètre** : composant de liste du socle appliqué aux objets du client, tri, recherche, filtres combinés, pagination, vues enregistrées, affichage en cartes sur téléphone.
- **Justification** : 3 heures de paramétrage ; 6 heures si de nombreuses listes ou des filtres calculés sont demandés.
- **Risques** : volumes importants qui imposent une recherche côté serveur optimisée.

### Actions groupées et relance, `actions-groupees` (hypothèse, à chiffrer)

- **Périmètre** : sélection de plusieurs lignes d'une liste filtrée (une à une ou tout le filtre), barre d'actions groupées, écran de confirmation avant exécution, rapport ligne par ligne. Première action : relance groupée par mail des factures en retard, un mail par facture, depuis un modèle de message.
- **Justification** : à chiffrer. Le mécanisme de sélection et de rapport est partagé par toutes les actions ; chaque action supplémentaire (relancer des devis sans réponse, changer le statut de plusieurs lignes) est un paramétrage court. Demandé par Théo le 22/10/2026, item de développement OPS-117.
- **Risques** : envoi en masse (garde-fou de confirmation obligatoire, pas d'envoi sans validation), doublons de relance, adresses manquantes, canal d'envoi (brouillon Outlook ou envoi direct, à décider).

### Glisser-déposer, `glisser-deposer`

- **Périmètre** : réordonnancement de lignes et affectation d'un élément à une colonne ou une case, à la souris et au doigt, enregistrement immédiat et annulation.
- **Justification** : 2 heures pour un usage simple, comme l'ordre des lignes de devis ; 5 heures pour une affectation sur tablette avec retour visuel soigné. Le planning complet est compté dans `planning-equipes`.
- **Risques** : comportement tactile sur tablettes anciennes.

### Croquis, `croquis`

- **Périmètre** : dessin à main levée au doigt ou au stylet, sur fond vierge ou sur photo, formes simples, cotes et texte, gomme et annulation, enregistrement en image rattachée à un objet.
- **Justification** : 4 heures en réutilisant la brique du socle ; 10 heures pour un premier développement ou des outils de cotation précis.
- **Risques** : attentes proches d'un logiciel de DAO, à recadrer dès la démo.

### Application installable, `app-installable`

- **Périmètre** : application web installable, manifeste, icônes aux couleurs du client, écran de démarrage, mise à jour sans réinstallation, consultation sans réseau des écrans déjà ouverts.
- **Justification** : configuration du socle, 2 heures ; 5 heures avec tests sur les appareils réels du client, iPhone et Android.
- **Risques** : particularités d'iOS ; le hors ligne complet est hors catalogue.

### Mails Outlook, `mails-outlook`

- **Périmètre** : envoi depuis la messagerie Microsoft 365 du client via Microsoft Graph, pièces jointes PDF, modèles de message, historique des envois sur la fiche concernée.
- **Justification** : 4 heures si l'application est déjà enregistrée dans l'annuaire Microsoft du client ; 10 heures avec la mise en place des autorisations chez le client et les échanges avec son informaticien.
- **Risques** : délai d'obtention des droits d'administration Microsoft 365, qui ne dépend pas de SKEAM. La lecture d'une boîte de réception est hors périmètre.

### Données de démo, `donnees-demo`

- **Périmètre** : jeu de données fictives réalistes couvrant tous les objets livrés, rechargeable par une commande pour la démo et la recette.
- **Justification** : un agent IA génère vite des données cohérentes ; 2 à 4 heures selon le nombre d'objets et la cohérence demandée entre eux.
- **Risques** : faible. À reprendre à chaque lot.

## Modules métier vus chez E G M

### Référentiels clients et prestations, `referentiels`

- **Périmètre** : fiches clients, contacts, adresses de facturation et de chantier ; bibliothèque de prestations avec unité, prix unitaire, taux de TVA et familles.
- **Justification** : objets simples mais nombreux champs et écrans ; 5 heures avec le socle, 10 heures avec tarifs par client ou prestations composées.
- **Risques** : prix spécifiques par client, ouvrages composés de plusieurs prestations.

### Demandes de devis, `demandes-devis`

- **Périmètre** : saisie ou réception d'une demande, qualification, affectation, statut, relance et transformation en devis.
- **Justification** : flux court ; 3 à 7 heures selon le nombre de statuts et de relances automatiques.
- **Risques** : demandes reçues par courriel à analyser automatiquement, qui relève d'un module de lecture par IA.

### Devis, `devis`

- **Périmètre** : lignes et sections, quantités, remises, TVA multi-taux, totaux, versions, statuts, gabarit PDF, envoi et transformation en commande.
- **Justification** : cœur de l'outil et module le plus exigeant en recette, calculs et mise en page ; 10 heures avec le socle, 20 heures avec sections imbriquées, ouvrages et variantes.
- **Risques** : métrés, ouvrages composés, révision de prix. Arrondis de TVA à valider tôt avec le comptable.

### Commandes clients, `commandes-clients`

- **Périmètre** : commande issue d'un devis accepté ou d'un bon de commande client, référence client, statut, avancement et rattachement aux bons d'intervention.
- **Justification** : réutilise la structure du devis ; 5 à 10 heures selon la gestion des commandes partielles et des avenants.
- **Risques** : avenants et commandes multi-chantiers.

### Lecture de commandes PDF par IA, `lecture-commandes-ia`

- **Périmètre** : dépôt d'un bon de commande PDF, extraction structurée par un modèle d'IA, rapprochement avec le client et les prestations, écran de vérification et de correction avant création de la commande.
- **Justification** : l'appel au modèle est court ; l'essentiel est le rapprochement et l'écran de vérification, plus la mise au point sur de vrais documents. 8 heures pour un ou deux formats de bons ; 18 heures pour des formats variés ou des PDF scannés.
- **Risques** : PDF scannés de mauvaise qualité, formats très variés. Le coût des appels IA est hors catalogue.

### Bons d'intervention, `bons-intervention`

- **Périmètre** : bon créé depuis une commande, affectation à une équipe, statut, compte rendu, gabarit PDF signé. La saisie mobile est comptée dans `app-terrain`.
- **Justification** : 6 à 12 heures selon le nombre de statuts et la richesse du compte rendu.
- **Risques** : interventions multi-jours ou multi-équipes.

### Planning des équipes, `planning-equipes`

- **Périmètre** : vue jour et semaine par équipe, affectation des interventions par glisser-déposer, absences, conflits signalés, consultation sur téléphone.
- **Justification** : interface riche, nombreux cas limites et recette longue ; 12 heures avec la brique de glisser-déposer du socle, 24 heures avec vue mensuelle, ressources matérielles ou récurrences.
- **Risques** : attentes calquées sur un logiciel de planning du marché ; cadrer les vues dès la démo.

### App terrain avec photos, croquis et signature, `app-terrain`

- **Périmètre** : écrans mobiles du technicien, interventions du jour, compte rendu, photos compressées avant envoi, croquis via la brique du socle, signature du client sur l'écran, envoi du bon signé.
- **Justification** : assemblage de briques du socle mais forte exigence d'ergonomie et tests sur appareils réels ; 10 à 20 heures.
- **Risques** : réseau faible sur chantier ; le vrai hors ligne est hors catalogue.

### Facturation simple, `facturation-simple`

- **Périmètre** : factures et avoirs depuis une commande ou un bon d'intervention, acomptes, mentions légales obligatoires, gabarit PDF, envoi, export comptable en fichier.
- **Justification** : règles légales et calculs à recetter avec soin ; 8 heures avec le socle, 14 heures avec acomptes multiples et format d'export imposé par le cabinet comptable.
- **Risques** : format d'import du logiciel comptable, autoliquidation de la TVA en sous-traitance du bâtiment.

### Facturation électronique, `facturation-electronique`

- **Périmètre** : production des factures au format Factur-X, PDF/A-3 avec XML conforme EN 16931 ; transmission par l'API d'une plateforme agréée choisie par le client ; dépôt sur Chorus Pro pour les clients publics avec code service et engagement juridique ; suivi des statuts du cycle de vie ; réception des factures fournisseurs mises à disposition par la plateforme.
- **Contexte** : la réception des factures électroniques est obligatoire pour toutes les entreprises depuis le 1er septembre 2026, et l'émission le sera pour les PME et microentreprises au 1er septembre 2027. Chorus Pro est déjà obligatoire pour facturer le secteur public.
- **Justification** : module le plus incertain du catalogue, XL. Format, conformité, deux interfaces externes, environnements de qualification et délais d'habilitation. 16 heures pour une seule plateforme avec un format simple ; 36 heures avec Chorus Pro, réception et cas d'erreur.
- **Risques** : choix de la plateforme par le client, qualité de sa documentation d'API, évolutions réglementaires, e-reporting non compris. Confiance faible tant qu'aucune intégration n'a été mesurée.

### Situations de travaux, `situations-travaux`

- **Périmètre** : situations mensuelles par avancement en pourcentage ou en quantité des lignes du marché, cumul, déduction des situations précédentes et des acomptes, gabarit PDF de situation, facture de situation.
- **Justification** : calculs cumulés délicats et recette chiffrée ligne à ligne ; 10 à 20 heures.
- **Risques** : avenants en cours de marché, révision de prix, compte prorata.

### Retenue de garantie, `retenue-garantie`

- **Périmètre** : retenue de 5 % sur situations et factures, remplacement par une caution bancaire, échéance de libération un an après la réception des travaux, relance et facture de libération.
- **Justification** : règle bien définie qui se greffe sur la facturation ; 3 à 6 heures.
- **Risques** : réserves non levées qui prolongent la retenue.

### Suivi des paiements, `suivi-paiements`

- **Périmètre** : échéances, encaissements partiels ou complets saisis à la main, retards, relances et état des impayés par client.
- **Justification** : 5 heures en saisie manuelle ; 10 heures avec relances automatiques et import d'un relevé bancaire.
- **Risques** : rapprochement bancaire automatique par API, hors périmètre.

### Commandes fournisseurs, `commandes-fournisseurs`

- **Périmètre** : fiches fournisseurs, commandes rattachées à un chantier ou à une commande client, gabarit PDF, envoi, réception totale ou partielle.
- **Justification** : structure proche des commandes clients mais flux distinct ; 6 à 12 heures.
- **Risques** : gestion de stock, hors périmètre.

### Tableau de bord, `tableau-de-bord`

- **Périmètre** : chiffre d'affaires, carnet de commandes, devis en cours et taux de transformation, impayés, graphiques simples et filtres de période.
- **Justification** : 5 heures pour quatre à six indicateurs sur des données propres ; 10 heures avec indicateurs par chantier ou par équipe et exports.
- **Risques** : indicateurs mal définis ; les fixer au cadrage avec leur formule.

### Reprise de données, `reprise-donnees`

- **Périmètre** : reprise d'une source de données existante, fichiers Excel ou export d'un ancien logiciel : analyse, nettoyage, script d'import rejouable, contrôle des volumes et recette avec le client.
- **Justification** : la plus variable des fourchettes, 4 à 12 heures pour une source. Avec plusieurs sources, la somme des estimations du backlog dépasse la fourchette : `chiffrer.py` l'élargit alors à cette somme et le signale.
- **Risques** : qualité des données du client, doublons, historique de factures à reprendre avec leur numérotation.
