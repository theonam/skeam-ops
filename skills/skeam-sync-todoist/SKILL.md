---
name: skeam-sync-todoist
description: Synchronise dans les deux sens les actions de Théo entre actions.yaml d'un client SKEAM et sa section Todoist, création des nouvelles actions après validation, report dans le dépôt des tâches terminées dans Todoist, todoist_id renseigné. À utiliser quand Théo tape /skeam-sync-todoist, après un /skeam-import-transcript qui a ajouté des actions, ou quand il veut aligner ses tâches Todoist avec un ou tous ses projets clients.
---

# /skeam-sync-todoist

Garde Todoist et `actions.yaml` d'accord. Le dépôt reste la source de vérité du contenu des actions ; Todoist fait foi pour ce que Théo y a terminé. Toute écriture dans Todoist et tout commit passent par une validation.

Lire d'abord `skills/commun.md` dans le clone de skeam-ops, puis CONTRAT.md sections 4 et 7.

## Entrées

| Entrée | Si absente |
|---|---|
| Client : slug, nom, ou `tous` pour tous les clients actifs du registre | question à choix multiples |

## Sorties

- Tâches Todoist créées, mises à jour, terminées ou supprimées dans la section `Client · <nom>` du projet SKEAM.
- `actions.yaml` : `todoist_id` renseigné entre guillemets, `statut` reporté, nouvelles actions importées depuis Todoist.
- Un commit par dépôt client modifié.

## Correspondance des champs

| actions.yaml | Todoist |
|---|---|
| `titre` | `content` |
| `priorite` | `priority`, mêmes valeurs `p1` à `p4` |
| `points` | étiquette `1pt` à `8pt` ; les autres étiquettes de la tâche sont conservées |
| `echeance` | date d'échéance ; `null` : sans échéance |
| `contexte`, `source`, `id` | `description`, commentaire de contexte de `skills/commun.md` section 7 |
| `todoist_id` | `id` de la tâche |
| `statut: faite` | tâche terminée |

## Étapes

### 1. Préparer

1. Étape 0 et identification du ou des clients, `skills/commun.md` sections 1 et 2.
2. Pour chaque client, lire `todoist.projet_id` et `todoist.section_id` de `client.yaml`. Section absente : chercher la section `Client · <nom>` par `find-sections` dans le projet `6h6qfvrgr83M56Gq`. Trouvée : proposer d'écrire son id dans `client.yaml`. Pas trouvée : proposer de la créer, comme à l'étape 6 de `/skeam-nouveau-client`.

### 2. Lire l'état des deux côtés

1. Toutes les actions de `actions.yaml`.
2. Toutes les tâches actives de la section : `find-tasks` avec `sectionId` et `limit: 100`, en suivant `cursor` jusqu'au bout.
3. Pour chaque action dont le `todoist_id` n'est pas parmi les tâches actives : `fetch-object` de type `task`. Tâche terminée, ou introuvable.
4. Repérer dans chaque description la ligne `Réf : ACT-...` pour rattacher les tâches aux actions, y compris celles sans `todoist_id`.

### 3. Établir le plan de synchronisation

| Dépôt | Todoist | Proposition |
|---|---|---|
| `ouverte`, sans `todoist_id`, aucune tâche avec sa `Réf` | rien | **Créer** la tâche |
| `ouverte`, sans `todoist_id`, une tâche porte sa `Réf` | tâche active | **Rattacher** : écrire son id, sans créer |
| `ouverte`, avec `todoist_id` | tâche terminée | **Reporter** : `statut: faite` |
| `ouverte`, avec `todoist_id` | tâche active, champs différents | **Écart** : garder la valeur du dépôt ou celle de Todoist, champ par champ |
| `ouverte`, avec `todoist_id` | tâche introuvable | **Disparue** : recréer, passer à `annulee`, ou laisser |
| `faite` | tâche active | **Terminer** dans Todoist |
| `annulee` | tâche active | **Supprimer** dans Todoist, ou laisser |
| aucune action | tâche active de la section sans `Réf` | **Importer** comme nouvelle action, ou ignorer |
| `faite` ou `annulee` | terminée, ou sans `todoist_id` | rien |
| `ouverte`, avec `todoist_id` | tâche active identique | rien |

Une action `annulee` n'est jamais terminée dans Todoist : une tâche terminée compterait ses points dans la vélocité de Théo.

Importer une tâche : nouvelle action d'id suivant, `titre` égal au contenu, `contexte: Tâche créée dans Todoist, importée le AAAA-MM-JJ.`, `priorite` de la tâche, `points` de son étiquette, sinon à choisir par Théo, `echeance` de la tâche, `statut: ouverte`, `todoist_id`, `source: manuel`. Sa description Todoist reçoit ensuite le commentaire de contexte, ajouté sous le texte existant.

### 4. Validation

Présenter le plan groupé par type avec, pour chaque ligne, l'id, le titre et ce qui change. Puis :

- **Reporter** et **Rattacher** : une seule question pour l'ensemble, `Valider`, `Annuler`, car ils ne font que recopier dans le dépôt un état déjà réel.
- **Créer**, **Terminer** : une question pour l'ensemble, avec la liste des tâches, `Valider`, `Choisir une par une`, `Annuler`.
- **Écart**, **Disparue**, **Supprimer**, **Importer** : une question par élément, quatre par appel.

### 5. Écrire dans Todoist

Dans cet ordre, par lots de 25 au plus :

1. **Créer** : `add-tasks` avec `content`, `description`, `priority`, `labels: [<points>]`, `dueString` égal à la date `echeance` si elle existe, `projectId: 6h6qfvrgr83M56Gq`, `sectionId`. Retenir l'id de chaque tâche créée.
2. **Écart** côté dépôt retenu : `update-tasks` sur les seuls champs qui changent ; `labels` envoyé avec les étiquettes existantes, seule l'étiquette de points remplacée. Échéance changée : `reschedule-tasks`, jamais `update-tasks`.
3. **Terminer** : `complete-tasks`.
4. **Supprimer** : `delete-object` de type tâche.
5. **Importer** : `update-tasks` sur la description pour y ajouter le commentaire de contexte.

Les échecs par élément n'annulent pas les succès : ne renvoyer que les éléments en échec dont la cause est corrigible, et seulement une fois.

### 6. Écrire dans le dépôt

1. `todoist_id` des tâches créées ou rattachées, entre guillemets.
2. `statut: faite` des actions reportées ; `annulee` des actions disparues choisies comme telles.
3. Champs des actions dont la valeur Todoist a été retenue.
4. Actions importées, en fin de fichier.
5. `python3 scripts/validate.py ../<nom>/projet` : code 0 exigé.

### 7. Committer et rendre compte

Question de commit, message `projet: skeam-sync-todoist du AAAA-MM-JJ`. Compte rendu selon `skills/commun.md` section 8 : nombre de tâches créées, terminées, supprimées, d'actions reportées et importées, et écarts laissés en l'état.

## Garde-fous

- Aucune écriture Todoist sans validation ; aucune tâche hors du projet SKEAM et de la section du client.
- Jamais de modification du projet ou de la section d'une tâche existante.
- Jamais de terminaison d'une action `annulee`.
- Toute tâche créée porte le commentaire de contexte avec sa ligne `Réf`.
- Aucune action de `actions.yaml` supprimée ; une action disparue passe au mieux à `annulee`, sur choix de Théo.

## Idempotence

- Avant toute création, la ligne `Réf` est cherchée dans la section : une tâche déjà créée par une synchronisation interrompue est rattachée, jamais dupliquée.
- Une seconde synchronisation immédiate ne propose rien.
- `todoist_id` n'est écrit qu'après succès de l'appel Todoist.

## Cas d'erreur

| Cas | Conduite |
|---|---|
| `section_id` invalide ou section supprimée | Le signaler ; proposer de rechercher ou recréer la section, étape 1. |
| Deux tâches portent la même `Réf` | Ne rien rattacher ; montrer les deux à Théo et lui laisser choisir. |
| Étiquette de points absente de Todoist | La créer n'est pas du ressort de cette commande : créer la tâche sans étiquette et le signaler. |
| Création partielle d'un lot | Écrire les ids des tâches créées, signaler les autres ; la relance les rattachera par `Réf` si elles existent. |
| Dossier projet invalide | S'arrêter pour ce client ; continuer les autres en mode `tous`. |
