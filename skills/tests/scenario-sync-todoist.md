# Scénario de test : /skeam-sync-todoist

## Objet

Vérifier la synchronisation dans les deux sens entre `actions.yaml` et la section Todoist du client : création après validation avec le commentaire de contexte, report des tâches terminées, arbitrage des écarts, import des tâches créées à la main, suppression plutôt que terminaison d'une action annulée, absence de doublon.

## Prérequis

- Jeu de départ en place, voir `README.md` : ACT-FICTIF-001 ouverte, p2, 1pt, échéance 2026-10-30 ; ACT-FICTIF-002 ouverte, p3, 2pt, sans échéance ; ACT-FICTIF-003 annulée ; aucun `todoist_id` ; `todoist.section_id: null`.
- Étiquettes `1pt` et `2pt` existantes dans Todoist.

## Déroulé

| # | Théo | Résultat attendu |
|---|---|---|
| 1 | `/skeam-sync-todoist dépôt theonam/skeam-test-fictif` | Dépôt hors registre signalé. `section_id` absent : recherche de `Client · Atelier Fictif` dans le projet `6h6qfvrgr83M56Gq`. Si elle existe, proposition d'écrire son id ; sinon proposition de la créer. |
| 2 | `Valider` | `todoist.section_id` écrit entre guillemets. |
| 3 | | Plan : **Créer** ACT-FICTIF-001 et ACT-FICTIF-002. Rien pour ACT-FICTIF-003. |
| 4 | Créer : `Valider` | Deux tâches dans la section : contenu égal au titre, priorités p2 et p3, étiquettes `1pt` et `2pt`, échéance 2026-10-30 pour la première seulement. Description de chacune : lignes `Source : theonam/skeam-test-fictif · projet/syntheses/2026-10-20-lancement.md`, `Raison : <contexte>`, `Réf : ACT-FICTIF-00n`. |
| 5 | Commit : `Valider` | `todoist_id` des deux actions écrits entre guillemets ; `validate.py` code 0 ; commit `projet: skeam-sync-todoist du <date>`. |
| 6 | Dans Todoist, à la main : terminer la tâche ACT-FICTIF-002 ; passer ACT-FICTIF-001 en p1 ; créer dans la section la tâche `Appeler le cabinet comptable`, étiquette `2pt`, p2. Puis relancer `/skeam-sync-todoist` | Plan : **Reporter** ACT-FICTIF-002 ; **Écart** sur la priorité de ACT-FICTIF-001, p2 dans le dépôt, p1 dans Todoist ; **Importer** la tâche créée à la main. |
| 7 | Reporter : `Valider` ; écart : garder Todoist ; importer : `Accepter` | ACT-FICTIF-002 `statut: faite`. ACT-FICTIF-001 `priorite: p1`. Nouvelle action ACT-FICTIF-004, `source: manuel`, `todoist_id` de la tâche, `points: 2pt`. Sa description Todoist reçoit le commentaire de contexte sous le texte existant. |
| 8 | Commit : `Valider` ; puis passer à la main ACT-FICTIF-001 à `statut: annulee`, committer, relancer | Plan : **Supprimer** la tâche de ACT-FICTIF-001, jamais la terminer. |
| 9 | `Supprimer` | Tâche supprimée dans Todoist ; rien ne change dans `actions.yaml` ; aucune tâche terminée en plus dans l'historique Todoist. |
| 10 | Relancer `/skeam-sync-todoist` | Aucune proposition. |

## Reprise après interruption

| # | Théo | Résultat attendu |
|---|---|---|
| 1 | Remettre à la main `todoist_id: null` sur ACT-FICTIF-004, committer, relancer | La tâche portant `Réf : ACT-FICTIF-004` est retrouvée : plan **Rattacher**, aucune création. |
| 2 | `Valider` | Le même id est réécrit ; une seule tâche dans la section pour cette action. |

## Contrôles

```sh
cd "$RACINE/skeam-ops"
python3 scripts/validate.py ../skeam-test-fictif/projet
grep -n "todoist_id" ../skeam-test-fictif/projet/actions.yaml
```

Dans Todoist : chaque tâche de la section porte une ligne `Réf` différente ; aucun doublon ; ACT-FICTIF-003 n'a jamais eu de tâche.

## Cas d'erreur à provoquer

| Action | Attendu |
|---|---|
| Mettre un `section_id` inexistant dans `client.yaml` | Signalé ; recherche ou création de la section proposée. |
| Dupliquer à la main une tâche avec la même `Réf` | Rien n'est rattaché ; les deux tâches sont montrées à Théo. |
| Créer une action `points: 8pt` alors que l'étiquette `8pt` n'existe pas | Tâche créée sans étiquette, signalé dans le compte rendu. |
