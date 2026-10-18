# Consignes pour les agents de développement

Ce dépôt contient l'application d'un client de SKEAM et, dans `projet/`, son dossier de pilotage. Le dépôt Git est la source de vérité. Le format de chaque fichier de `projet/` est fixé par `CONTRAT.md` du dépôt `theonam/skeam-ops` ; ne jamais inventer de champ ni de valeur hors de ce contrat.

Le `CLAUDE.md` à la racine du dépôt importe ce fichier avec la ligne `@projet/CLAUDE-projet.md`.

## Identité

- Préfixe des ids : la valeur de `slug` dans `projet/client.yaml`, en majuscules. Exemple pour le slug `egm` : `EGM-012`, `ACT-EGM-003`.
- Nom d'agent : `<slug>-dev`, par exemple `egm-dev`. Il sert dans le journal de temps.

## Avant de travailler

1. Lire `projet/cadrage.md` en entier, en particulier Règles de gestion, Exigences et Découpage en lots.
2. Lire tous les fichiers `projet/backlog/*.yaml`.
3. Ne travailler que sur un item existant, de statut `a_faire` ou `en_cours`. Si la demande ne correspond à aucun item, créer l'item, voir plus bas, et le signaler.

## Pendant le travail

- Chaque message de commit commence par l'id de l'item suivi de deux points : `EGM-012: saisie du pointage journalier`.
- Au début : passer l'item de `a_faire` à `en_cours`, mettre `maj` à la date du jour, au plus tard dans le premier commit de la session.
- À la fin : passer l'item à `a_recetter`, renseigner `commit` avec le hash court du dernier commit de code de l'item, mettre `maj` à la date du jour, puis committer ce changement de backlog avec un message qui commence aussi par l'id.
- Vérification : passer l'item à `fait`, avec `maj` à la date du jour, quand chaque critère d'acceptation a été vérifié par l'agent lui-même, par un test automatique ou dans l'application ; noter dans `notes` ce qui n'a pas pu être vérifié et laisser alors l'item `a_recetter`. Théo ne recette pas chaque item ; il peut rouvrir un item `fait`.
- Seul Théo passe un item à `abandonne`. Ne jamais le faire.
- Ne jamais modifier les autres champs d'un item existant sans instruction explicite : titre, module, lot, priorite, taille, estimation_h, criteres_acceptation, audience, a_valider.

## Besoin découvert

Tout besoin découvert en cours de route devient un nouvel item, jamais une extension silencieuse d'un item existant :

- `id` : le plus grand numéro existant dans tout `projet/backlog/` plus un ;
- `a_valider: false`, `audience` selon ce que voit le client : `client` pour une fonction de l'application, `interne` pour un travail technique, `statut: a_faire`, `commit: null`, `maj` à la date du jour ;
- tous les autres champs obligatoires renseignés au mieux, avec au moins un critère d'acceptation ;
- à mentionner dans le compte rendu de fin de session.

## Journal de temps

Une ligne par session, ajoutée en fin de fichier `projet/temps/AAAA-MM-<agent>.jsonl`, mois de la date de début, par exemple `projet/temps/2026-10-egm-dev.jsonl`. Heures locales de Paris, relevées avec `TZ=Europe/Paris date` au début et à la fin de la session :

```json
{"date":"2026-10-15","debut":"20:10","fin":"21:05","minutes":55,"item":"EGM-012","source":"claude-code","agent":"egm-dev","note":"","valide":false}
```

- `minutes` est exactement la différence entre `fin` et `debut` ; une session qui passe minuit garde la date de son début.
- `item` est l'item principal de la session.
- `valide` vaut toujours `false` : Théo le passe à `true` quand il relit la semaine.

## Consommation des agents

- **Consommation des agents** : `.skeam/conso/AAAA-MM-JJ-<session>.jsonl` relève automatiquement, pour la conversation et chaque agent de la session, le temps actif, les jetons par modèle et les items travaillés. Le crochet Git `.skeam/githooks/pre-commit` le réécrit à chaque commit et l'ajoute au commit de travail : ne jamais le modifier, le supprimer ni le commiter à part. Le crochet est activé par l'environnement cloud de SKEAM ou, sur un poste, à l'ouverture de la session à la racine du dépôt ; avant le premier commit de la session, lancer `python3 .skeam/conso.py verifier` et, s'il répond « inactif », `python3 .skeam/conso.py installer`. Le fichier ne contient ni contenu de conversation, ni chemin, ni secret, ni coût.

## Dosage des modèles et consignes

Chaque agent lancé, sous-agent, étape de workflow ou session parallèle, reçoit le modèle le moins cher qui fait le travail sans risque. Celui qui lance l'agent choisit ; Théo n'a rien à trancher.

| Modèle | Usage | Exemples |
| --- | --- | --- |
| Léger, `haiku` | tâche mécanique, sans jugement, résultat facile à vérifier | chercher des fichiers ou des occurrences, résumer un rapport, mettre en forme un document, relever un état : contrôles, statuts, journal de temps |
| Intermédiaire, `sonnet` | code et vérifications courantes | écran ou formulaire simple, tests de bout en bout, documentation, relecture des écrans, vérification d'un constat important |
| Le plus puissant, `opus` | une erreur coûte cher ou se rattrape mal | modèle de données et migrations, argent, TVA, facture électronique, droits et sécurité, fusion de branches, conception d'un module, vérification d'un constat bloquant |

- En cas de doute entre deux niveaux : le plus haut pour ce qui touche à l'argent, aux droits ou aux données, le plus bas sinon.
- Les agents types du dépôt, dans `.claude/agents/`, imposent leur modèle : `chercheur` en haiku, `relecteur-ecrans` en sonnet, `relecteur-critique` en opus. Leurs modèles sont dans `templates/claude-agents/` de skeam-ops.
- Dans un workflow, chaque appel d'agent porte son `model` selon ce tableau.

Toute demande à un agent est serrée :

1. elle nomme les fichiers ou dossiers à lire, au lieu de laisser l'agent explorer le dépôt ;
2. elle fixe le périmètre : un diff, un module, une liste d'items ;
3. elle impose un format de réponse court et plafonné, par exemple quinze constats au plus dans un schéma structuré ;
4. elle transmet ce qui est déjà établi, résultat d'un agent précédent, décision ou chemin d'un rapport, au lieu de le faire redécouvrir ;
5. elle interdit ce qui ne sert pas la tâche : ni compilation ni tests de bout en bout pour un relecteur, aucune écriture pour un chercheur.

Après chaque grosse session, relever `/usage` et noter dans le compte rendu la part de chaque modèle.

## Interdits

- Ne jamais modifier `projet/interne/` ni `projet/decisions.md` sans instruction explicite de Théo.
- Ne jamais modifier `projet/client.yaml`, `projet/actions.yaml`, `projet/cadrage.md` ni les dossiers `transcripts/` et `syntheses/` sans instruction explicite.
- Ne jamais envoyer quoi que ce soit au client : ni courriel, ni devis, ni publication.
- Dans tout texte visible du client, titres et critères des items d'audience `client` compris : ni tiret cadratin ni parenthèse.

## Avant de pousser

Lancer le validateur de skeam-ops sur le dossier projet et corriger toute erreur :

```sh
python <chemin de skeam-ops>/scripts/validate.py projet
```
