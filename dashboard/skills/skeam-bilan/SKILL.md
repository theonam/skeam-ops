---
name: skeam-bilan
description: Fait le bilan d'une session de travail à partir de son historique et met à jour le pilotage SKEAM. Mesure le temps réellement passé sur l'historique de la conversation, le répartit par item grâce aux commits, propose les statuts d'items, les besoins découverts et les lignes de temps au format du contrat, puis écrit, valide, commite et pousse après l'accord de Théo, avant de proposer /skeam-dashboard. Invoquer avec /skeam-bilan [session], en fin de session, ou dès que Théo demande de mettre à jour le backlog, le temps passé ou le board d'après ce qui a été fait dans une conversation.
---

# /skeam-bilan

Commande du chantier dashboard, CONTRAT.md section 11.7. Elle relit une session de travail, ce que Théo a demandé, ce qui a été commité et vérifié, et en tire la mise à jour du dossier `projet/` des dépôts touchés. Le temps est mesuré par `dashboard/scripts/bilan_temps.py`, jamais estimé ; les statuts, besoins et décisions sont proposés par la commande et validés par Théo en une fois. Formats : CONTRAT.md sections 4 et 6.

## Argument

| Argument | Session relue |
|---|---|
| aucun | la session en cours |
| chemin d'un historique `.jsonl` | cette session Claude Code |
| identifiant `session_…` | une session Claude Code distante, lue par l'outil `list_events` du serveur claude-code-remote |

## Règles absolues

- **Temps mesuré, jamais inventé** : seules les lignes produites par `bilan_temps.py` s'écrivent. Sans historique lisible, demander à Théo ses heures de début et de fin plutôt que de les estimer.
- **Jamais compté deux fois** : le temps déjà journalisé dans les fichiers de temps visés, quel qu'en soit l'agent, est retiré des lignes proposées ; le dire, et signaler une ligne existante qui paraît trop courte au regard de la mesure.
- **`fait` seulement sur preuve** : chaque critère d'acceptation vérifié dans la session, par un test automatique au vert ou dans l'application ; sinon `a_recetter`, avec dans `notes` ce qui n'a pas pu être vérifié. Jamais `abandonne`, réservé à Théo.
- Ne modifier d'un item existant que `statut`, `commit`, `maj` et `notes` ; un besoin découvert devient un nouvel item, jamais l'extension d'un item existant.
- `decisions.md`, `actions.yaml`, `cadrage.md`, `client.yaml` et `projet/interne/` : rien sans instruction explicite de Théo. Ne jamais lire `projet/interne/`.
- Ne jamais rien envoyer à un client. Ne jamais commiter sur un dépôt client sans l'accord de Théo, donné à l'étape 5.
- Lignes de temps : `source` `claude-code`, `valide` `false`, `minutes` exactement `fin` moins `debut`, heures de Paris, une session qui passe minuit garde la date de son début.

## Étapes

### 1. Retrouver l'historique

- Session en cours, dans Claude Code : le fichier le plus récent du dossier du répertoire de travail.

  ```sh
  ls -t ~/.claude/projects/*/*.jsonl | head -1
  ```

- Session distante : lire ses évènements avec `list_events`, `kinds` `["user", "assistant"]`, page après page, et écrire leurs horodatages dans une liste JSON, par exemple `$TRAVAIL/horodatages.json` : `["2026-10-16T20:10:03Z", …]`.
- Conversation du chat claude.ai, sans historique en fichier : demander à Théo début et fin de chaque plage de travail, puis les écrire dans la même liste JSON.

Si une partie de la session a été résumée, l'historique garde tous les horodatages : la mesure reste complète.

### 2. Préparer les dépôts touchés

Relever dans l'historique les dépôts où la session a commité. Pour chacun, disposer d'un clone à jour avec toutes ses branches, et de la branche qui porte `projet/`, `main` sauf indication du dépôt :

```sh
git -C <dépôt> fetch origin '+refs/heads/*:refs/remotes/origin/*'
```

Agents, d'après la consigne `projet/CLAUDE-projet.md` de chaque dépôt : `<slug>-dev` pour un client, préfixe `EGM` pour `egm-dev` par exemple ; pour skeam-ops, l'agent du chantier de l'item, `OPS-4xx` pour `ops-dashboard`. Un préfixe partagé par plusieurs chantiers, `OPS`, prend l'agent de la conversation ; les lignes d'un autre chantier se corrigent à la main à l'étape 4.

### 3. Mesurer

Depuis la racine de skeam-ops :

```sh
python dashboard/scripts/bilan_temps.py --historique <historique> \
    --depot <dépôt 1> --depot <dépôt 2> \
    --agent EGM=egm-dev --agent OPS=ops-dashboard \
    --marque-commit "<identifiant de session de la ligne Claude-Session>"
```

- `--marque-commit` ne garde que les commits de cette session ; l'omettre quand ils ne portent pas de ligne `Claude-Session`.
- `--depuis` et `--jusqua`, ISO 8601, heure de Paris par défaut, bornent la mesure, par exemple pour ne reprendre que la soirée.
- `--pause`, 20 minutes par défaut : au-delà, l'attente ne compte pas.
- Code 1 : historique ou dépôt illisible, le dire et s'arrêter. Code 2 : usage, corriger et relancer.

Le JSON donne le temps actif, les commits retenus et, par fichier de temps, les lignes `nouvelles`, amputées du temps déjà journalisé, et dans `deja` les lignes existantes qui en recouvraient une partie. Le temps avant un commit revient à son item ; la fin d'une période, vérifications et mise en ligne, revient au dernier commit ; une période sans commit revient au commit suivant. Les `avertissements` signalent le temps sans item : à attribuer avec Théo, ou à laisser de côté.

### 4. Relire la session et préparer les propositions

Lire les messages de Théo et les conclusions de l'agent dans l'historique, et le journal Git des commits retenus. Pour chaque dépôt, lire `projet/cadrage.md` et tous les `projet/backlog/*.yaml` sur la branche qui porte `projet/`, puis préparer :

| Proposition | Source |
|---|---|
| statut de chaque item travaillé, `commit` au hash court du dernier commit de code, `maj` du jour, `notes` | commits, tests lancés et vérifications faites dans la session |
| nouveaux items pour les besoins exprimés par Théo et non couverts | ses messages ; id, `a_valider`, `audience` et champs selon la consigne `projet/CLAUDE-projet.md` du dépôt |
| décisions de Théo à journaliser dans `decisions.md` | ses réponses explicites ; proposées seulement |
| actions de Théo pour `actions.yaml` | ce qu'il a dit devoir faire ; proposées seulement |
| lignes de temps | `nouvelles` de l'étape 3, après attribution des avertissements |

Ne rien déduire que la session ne montre pas : un item dont rien n'a été commité garde son statut.

### 5. Faire valider en une fois

Présenter un seul tableau par dépôt : item, statut actuel, statut proposé, preuve en une ligne ; puis les nouveaux items, les décisions et actions proposées, et le temps, total et par item. Demander l'accord avec une seule question à choix multiples : tout valider, valider sans les décisions et actions, ou corriger. Une correction de Théo se reporte, puis la question revient.

### 6. Écrire, valider, pousser

Dans chaque dépôt, sur la branche qui porte `projet/` :

1. Backlog : appliquer les statuts et nouveaux items validés, en gardant la mise en forme du fichier.
2. Temps : relancer la commande de l'étape 3 avec `--ecrire`, ou ajouter à la main les lignes corrigées par Théo.
3. `decisions.md` et `actions.yaml` : seulement ce que Théo a validé.
4. `python <skeam-ops>/scripts/validate.py projet` : corriger toute erreur avant de continuer.
5. Commiter, message commençant par l'id de l'item principal, `EGM-040: bilan de session, statuts et temps`, et pousser sur cette branche, jamais sur une autre. Si le dépôt porte `.skeam/conso.py`, lancer avant ce commit `python3 .skeam/conso.py verifier` puis, si le crochet n'est pas actif, `python3 .skeam/conso.py capturer` : le commit du bilan emporte le dernier relevé de consommation des agents de la session, CONTRAT.md section 15. Ce relevé reste distinct des lignes de temps : ne jamais en tirer une ligne de `temps/` sans l'accord de Théo.

### 7. Conclure

Donner par dépôt le commit poussé, les items changés de statut, les nouveaux items et le temps journalisé, puis proposer `/skeam-dashboard` pour republier le tableau de bord.
