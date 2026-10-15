# Propositions d'évolution du contrat, chantier catalogue

Format : CONTRAT.md section 14. Décisions réservées à Théo.

## 2026-10-15 Calibrage de la confiance et du prix conseillé

- **Besoin** : Théo demande que le calibrage mette à jour `confiance` à partir des mesures. CONTRAT.md 11.4 impose à `calibrer.py` de réécrire `mesures` « sans toucher aux autres champs ». `prix_conseille_ht` n'a pas non plus de producteur désigné et devient faux dès que `tarifs.yaml` change.
- **Proposition** : en 11.4, ajouter : « Avec `--recalculer`, met aussi à jour `confiance` et `prix_conseille_ht` selon la méthode décrite dans `catalogue/README.md` ; `heures_min`, `heures_max` et les autres champs restent sous la main de Théo. » La commande `/calibrer` du chantier dashboard passerait alors `--recalculer`.
- **Hypothèse retenue en attendant** : `calibrer.py` respecte 11.4 par défaut. L'option `--recalculer`, désactivée par défaut, écrit confiance et prix ; sans elle, `catalogue/out/calibration.md` affiche les valeurs calculées sans les écrire.
- **Impact** : CONTRAT.md 11.4 ; `dashboard/skills/calibrer/`, chantier dashboard.

## 2026-10-15 Mesures des clients devenus inactifs

- **Besoin** : 11.4 réécrit entièrement `mesures` à partir des seuls clients `actif`. Un client passé à `actif: false` en fin de projet, statut `clos`, perd toutes ses mesures au calibrage suivant. Le catalogue oublie donc ses projets terminés, qui sont justement les mieux mesurés.
- **Proposition** : en 11.4, remplacer « pour chaque client `actif` du registre » par « pour chaque client du registre dont le clone est présent sous `--racine` ; les mesures d'un client du registre sans clone sont conservées telles quelles ». Option plus simple : distinguer dans `clients.yaml` `actif` pour le dashboard et `calibrable` pour le calibrage.
- **Hypothèse retenue en attendant** : application littérale de 11.4. Les mesures retirées sont listées dans les anomalies de `calibration.md` pour que Théo le voie avant de commiter.
- **Impact** : CONTRAT.md 11.4 et 12, éventuellement `schemas/clients.schema.json` ; `calibrer.py`.

## 2026-10-15 Paramètres de méthode dans tarifs.yaml

- **Besoin** : Théo veut pouvoir modifier lui-même les réglages du chiffrage. Plusieurs n'ont pas de clé dans `tarifs.yaml`, qui refuse toute clé hors contrat : pas d'arrondi des prix, taux de TVA des lignes, facteurs min et max des items hors catalogue, seuil de couverture du scénario max.
- **Proposition** : ajouter à 8.2 et à `schemas/catalogue-tarifs.schema.json` des clés facultatives : `arrondi_ht` montant strictement positif, défaut 50 ; `tva` parmi les valeurs de 11.3, défaut 0.2 ; `hors_catalogue` avec `min` et `max` fractions positives, défaut 0.8 et 1.5 ; `seuil_couverture` fraction de 0 à 1, défaut 0.7.
- **Hypothèse retenue en attendant** : constantes en tête de `catalogue/scripts/methode.py`, aux valeurs par défaut ci-dessus, documentées dans `catalogue/README.md`.
- **Impact** : CONTRAT.md 8.2, `schemas/catalogue-tarifs.schema.json`, `exemples/catalogue/tarifs.yaml` ; `methode.py`.

## 2026-10-15 Saisie du temps par temps.py

- **Besoin** : les consignes d'agent, `templates/dossier-client/CLAUDE-projet.md` et `projet/CLAUDE-projet.md`, demandent d'écrire la ligne de temps à la main, avec `TZ=Europe/Paris date` et le calcul des minutes. C'est la source d'erreur la plus probable du calibrage. `catalogue/scripts/temps.py` écrit des lignes conformes et validées.
- **Proposition** : dans les deux fichiers de consignes, section Journal de temps, ajouter : « Depuis skeam-ops : `python catalogue/scripts/temps.py start <chemin_projet> --agent <agent> --item <id>` en début de session, `stop --agent <agent>` en fin ; ou `log` pour une session passée. » Et en section 6 du contrat : « La relecture hebdomadaire se fait avec `temps.py week` ; seul Théo confirme. »
- **Hypothèse retenue en attendant** : `temps.py` est livré et documenté dans `catalogue/README.md` ; les consignes restent inchangées.
- **Impact** : `templates/dossier-client/CLAUDE-projet.md`, `projet/CLAUDE-projet.md`, CONTRAT.md 6 ; tous les agents.

## 2026-10-15 Écriture du temps dans un projet invalide

- **Besoin** : 11 impose à tout script qui lit un dossier projet de le valider d'abord et de s'arrêter s'il est invalide. Appliqué à `temps.py`, une erreur sans rapport, une parenthèse dans une synthèse par exemple, empêche de saisir son temps ; la session risque alors d'être oubliée.
- **Proposition** : en 11, ajouter : « Exception : `temps.py` écrit une ligne dès que `client.yaml`, `backlog/` et `temps/` sont valides ; il signale les autres erreurs sans s'arrêter. »
- **Hypothèse retenue en attendant** : application stricte. `temps.py` refuse d'écrire dans un projet invalide, code 1, avec la liste des erreurs à corriger.
- **Impact** : CONTRAT.md 11 ; `temps.py`.

## 2026-10-15 Importance des fonctionnalités pour le client

- **Besoin** : règle de rédaction de Théo : le devis liste les fonctionnalités souhaitées par le client de la plus importante à la moins importante pour lui, telle que l'importance ressort du transcript. `priorite` n'a que trois valeurs et aucun champ d'item ne porte ce classement ; `chiffrer.py` ne lit pas les transcripts et n'a pas à les interpréter.
- **Proposition** : en 5, ajouter un champ facultatif `rang_client`, entier strictement positif ou null : rang de la fonctionnalité dans les attentes du client, 1 la plus importante, fixé par `/cadrage` à partir des transcripts et des synthèses. Audience interne. `chiffrer.py` trie alors chaque ligne de devis par `rang_client`, puis par priorité. Dans `skills/cadrage/`, demander d'attribuer ce rang en citant le transcript source.
- **Hypothèse retenue en attendant** : `chiffrer.py` trie par priorité, puis par ordre des items dans le backlog. `/cadrage` et Théo écrivent les items dans l'ordre d'importance pour le client ; le chiffrage `.md` rappelle de vérifier cet ordre au regard du transcript.
- **Impact** : CONTRAT.md 5 et 10, `schemas/backlog.schema.json` ; `skills/cadrage/`, chantier cadrage ; `chiffrer.py`.

## 2026-10-15 Plancher par option

- **Besoin** : dans l'offre E G M, chaque option se vend seule, sur sa propre ligne, au moins 2 500 euros HT, alors que ses heures de catalogue n'en justifient que 900 à 2 500. `plancher_ht` ne s'applique qu'au total d'un chiffrage complet ; rien ne fixe un minimum par option.
- **Proposition** : ajouter à 8.2 et à `schemas/catalogue-tarifs.schema.json` une clé facultative `plancher_option_ht`, montant HT minimal d'une ligne d'option. `chiffrer.py` relève toute ligne d'option à ce montant.
- **Hypothèse retenue en attendant** : pas de plancher par option. Une option chiffrée seule tombe sous `plancher_ht`, fixé à 2 500 euros, ce qui donne le même résultat ; une option chiffrée avec le reste du projet sort à son prix calculé, et le `.md` de chiffrage le montre.
- **Impact** : CONTRAT.md 8.2, `schemas/catalogue-tarifs.schema.json` ; `chiffrer.py`.
