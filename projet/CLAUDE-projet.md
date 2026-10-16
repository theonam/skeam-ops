# Consignes pour les agents de skeam-ops

skeam-ops est piloté comme un projet interne, slug `ops`, préfixe `OPS`. Ces consignes reprennent celles des dépôts clients, `templates/dossier-client/CLAUDE-projet.md`, adaptées au travail en parallèle de quatre chantiers. Les règles de collaboration du `README.md` s'appliquent en plus. Les formats sont fixés par `CONTRAT.md` ; ne jamais inventer de champ ni de valeur hors de ce contrat.

## Identité par chantier

| Chantier | Branche | Dossier | Fichier de backlog | Plage d'ids | Agent | Fichier de temps |
|---|---|---|---|---|---|---|
| socle commun | `feat/init` | racine, `schemas/`, `scripts/`, `templates/`, `exemples/` | `projet/backlog/init.yaml` | OPS-001 à OPS-099 | `ops-init` | `projet/temps/AAAA-MM-ops-init.jsonl` |
| socle | `feat/socle` | `socle/` | `projet/backlog/socle.yaml` | OPS-101 à OPS-199 | `ops-socle` | `projet/temps/AAAA-MM-ops-socle.jsonl` |
| catalogue | `feat/catalogue` | `catalogue/` | `projet/backlog/catalogue.yaml` | OPS-201 à OPS-299 | `ops-catalogue` | `projet/temps/AAAA-MM-ops-catalogue.jsonl` |
| cadrage | `feat/cadrage` | `skills/` | `projet/backlog/cadrage.yaml` | OPS-301 à OPS-399 | `ops-cadrage` | `projet/temps/AAAA-MM-ops-cadrage.jsonl` |
| dashboard | `feat/dashboard` | `dashboard/` | `projet/backlog/dashboard.yaml` | OPS-401 à OPS-499 | `ops-dashboard` | `projet/temps/AAAA-MM-ops-dashboard.jsonl` |

## Avant de travailler

1. Lire `README.md`, `CONTRAT.md` en entier, `projet/cadrage.md` et tous les fichiers `projet/backlog/*.yaml`.
2. Ne travailler que sur les items de son fichier de backlog, de statut `a_faire` ou `en_cours`.

## Pendant le travail

- Chaque message de commit commence par l'id de l'item : `OPS-203: chiffrage des lignes par lot`.
- Au début : passer l'item à `en_cours`, `maj` à la date du jour, au plus tard dans le premier commit de la session.
- À la fin : passer l'item à `a_recetter`, `commit` au hash court du dernier commit de code de l'item, `maj` à la date du jour, dans un commit dont le message commence aussi par l'id.
- Vérification : passer l'item à `fait`, avec `maj` à la date du jour, quand chaque critère d'acceptation a été vérifié par l'agent lui-même, par un test automatique ou dans l'application ; noter dans `notes` ce qui n'a pas pu être vérifié et laisser alors l'item `a_recetter`.
- Seul Théo passe un item à `abandonne`.
- Ne jamais modifier les autres champs d'un item existant sans instruction explicite.

## Besoin découvert

Nouvel item dans son propre fichier de backlog, avec le plus petit numéro libre de sa plage, `a_valider: false`, `audience: interne`, `statut: a_faire`, au moins un critère d'acceptation. Un besoin qui relève d'un autre chantier s'écrit aussi dans son propre fichier, avec une dépendance ou une note qui le désigne ; ne jamais écrire dans le fichier de backlog d'un autre chantier.

## Journal de temps

Une ligne par session à la fin de son fichier de temps, heures de Paris relevées avec `TZ=Europe/Paris date`, `source` `claude-code`, `valide` `false`, `minutes` exactement égal à `fin` moins `debut`.

## Interdits

- Ne jamais modifier `CONTRAT.md`, `schemas/`, `scripts/`, `templates/`, `exemples/`, `clients.yaml`, `README.md`, `CLAUDE.md` ; proposer dans `<son dossier>/PROPOSITIONS-CONTRAT.md`.
- Ne jamais modifier `projet/interne/`, `projet/decisions.md`, `projet/cadrage.md`, `projet/actions.yaml` ni `projet/client.yaml` sans instruction explicite de Théo.
- Ne jamais toucher à un dépôt client, en particulier `theonam/egm-app`, sauf instruction explicite.
- Ne jamais rien envoyer à un client.

## Avant d'ouvrir la pull request

```sh
python scripts/validate.py projet
python -m unittest discover -s scripts -p "test_*.py"
```
