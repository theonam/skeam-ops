Propriétaire : chantier cadrage, branche `feat/cadrage`, commandes /skeam-nouveau-client, /skeam-import-transcript, /skeam-cadrage, /skeam-chiffrage, /skeam-sync-todoist et /skeam-publier.

# Commandes du chat

Skills utilisées dans le chat claude.ai, pas dans Claude Code. Chacune orchestre les scripts de skeam-ops et les connecteurs Plaud, Dougs, Todoist et Docs Claude, et demande la validation de Théo par question à choix multiples avant toute écriture hors des dépôts et avant tout commit.

| Commande | Quand | Écrit dans le dépôt | Écrit ailleurs, après validation |
|---|---|---|---|
| `/skeam-nouveau-client` | nouveau prospect | `projet/` créé, `client.yaml`, `fiche.md`, `CLAUDE.md` ; entrée `clients.yaml` de skeam-ops | dépôt GitHub si l'outil existe, section Todoist |
| `/skeam-import-transcript` | après une réunion enregistrée | `transcripts/`, `syntheses/` ; propositions arbitrées une par une pour `cadrage.md`, backlog, `decisions.md`, `actions.yaml` | rien |
| `/skeam-cadrage` | après une ou plusieurs synthèses | `cadrage.md`, backlog | rien |
| `/skeam-chiffrage` | backlog stable | `devis/`, entrée `devis` de `client.yaml` | brouillon de devis Dougs, jamais finalisé ni envoyé |
| `/skeam-sync-todoist` | après ajout d'actions, ou régulièrement | `actions.yaml` : `todoist_id`, `statut`, actions importées | tâches Todoist |
| `/skeam-publier` | pour relire ou faire relire un état du projet | URL dans `client.yaml` `liens` | doc Claude privé, jamais partagé par la commande |

Enchaînement type : `/skeam-nouveau-client`, puis pour chaque réunion `/skeam-import-transcript`, puis `/skeam-cadrage`, `/skeam-chiffrage`, et au fil de l'eau `/skeam-sync-todoist` et `/skeam-publier`.

## Contenu du dossier

| Chemin | Rôle |
|---|---|
| `commun.md` | règles communes, lues par chaque commande dans le clone de skeam-ops : préparation, validation, rédaction, commits, connecteurs |
| `<commande>/SKILL.md` | une skill par commande |
| `skeam-publier/vue.py` | vue Markdown d'un dossier projet pour une audience, par liste blanche, CONTRAT.md section 10 |
| `tests/` | scénarios de test manuels sur un client fictif, bouchon de `chiffrer.py`, test automatique de `vue.py` |
| `PROPOSITIONS-CONTRAT.md` | évolutions du contrat demandées par le chantier |

## Installer les skills dans claude.ai

Pour chaque commande, compresser son dossier en une archive dont la racine est le dossier lui-même, par exemple `skeam-import-transcript.zip` contenant `skeam-import-transcript/SKILL.md`, puis l'ajouter dans les réglages de claude.ai, rubrique des skills. `commun.md` et `vue.py` ne s'installent pas : les commandes les lisent dans le clone de skeam-ops.

Dans la conversation, attacher le dépôt `theonam/skeam-ops` et les dépôts clients concernés, et activer les connecteurs Plaud, Dougs, Todoist et Docs Claude.

## Vérifier

```sh
python scripts/validate.py projet skills/tests/fictif/projet
python -m unittest discover -s skills/tests -p "test_*.py"
```
