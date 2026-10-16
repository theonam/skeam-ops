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
