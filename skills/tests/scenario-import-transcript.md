# Scénario de test : /skeam-import-transcript

## Objet

Vérifier l'import d'un enregistrement Plaud en transcript et synthèse conformes au contrat, l'absence d'invention, la mise à l'écart des passages sensibles, la reconnaissance de l'existant et l'arbitrage élément par élément.

## Prérequis

- Jeu de départ en place dans `theonam/skeam-test-fictif`, voir `README.md`.
- Les deux réunions de `reunions/` enregistrées sur Plaud : `Atelier Fictif lancement`, avec un marquage, puis `Atelier Fictif atelier`. Transcripts générés dans Plaud.

## Partie A : réunion de lancement

| # | Théo | Résultat attendu |
|---|---|---|
| 1 | `/skeam-import-transcript dépôt theonam/skeam-test-fictif` | Signale que le dépôt n'est pas au registre et demande confirmation. Puis liste les enregistrements des 7 derniers jours, au plus quatre par question. |
| 2 | Choisir `Atelier Fictif lancement` | Transcript lu jusqu'à la dernière page, marquages lus, résumé Plaud lu. Si les locuteurs ne sont pas nommés, correspondance proposée avec Léa Fictive, Marc Essai et Théo, avec une phrase caractéristique chacun. |
| 3 | Accepter les correspondances | `transcripts/<date de l'enregistrement>-lancement.md` : en-tête avec `source: plaud` et le `plaud_id`, puis une ligne par intervention `[HH:MM:SS] Locuteur : texte`, sans correction. |
| 4 | | `syntheses/<date>-lancement.md` : cinq sections dans l'ordre, horodatage en commentaire HTML derrière chaque fait, action de Léa avec échéance 2026-10-30, action de Théo **sans** échéance inventée. |
| 5 | | La mention d'environ 5 000 euros n'apparaît **pas** dans la synthèse ; le compte rendu la signale comme écartée. Aucun tiret cadratin ni parenthèse. Le passage marqué, export comptable, est traité. |
| 6 | | `validate.py` code 0 avant les propositions. |
| 7 | | Propositions : aucune action en double de ACT-FICTIF-002 pour la démo, aucun item en double de FICTIF-002 ou FICTIF-003, aucune décision en double de 2026-10-20. Une action nouvelle possible : envoyer le chiffrage. |
| 8 | `Rejeter` toutes les propositions | Aucune modification de `cadrage.md`, `backlog/`, `decisions.md`, `actions.yaml`. |
| 9 | Commit : `Valider` | Commit `projet: skeam-import-transcript <date>-lancement` avec seulement le transcript et la synthèse. |

## Partie B : idempotence

| # | Théo | Résultat attendu |
|---|---|---|
| 1 | `/skeam-import-transcript` sur le même enregistrement | Marqué `déjà importé` dans la liste. La commande propose de régénérer les propositions ou de s'arrêter ; elle ne réécrit ni le transcript ni la synthèse. |
| 2 | S'arrêter | Aucun fichier modifié. |

## Partie C : réunion d'atelier

| # | Théo | Résultat attendu |
|---|---|---|
| 1 | Importer `Atelier Fictif atelier` | Transcript et synthèse écrits comme en partie A. Le plafond de 12 heures figure en Zones d'incertitude ou en Détail par sujet comme demande non tranchée, jamais comme fait établi. |
| 2 | | Propositions attendues : en cadrage, une question ouverte sur le plafond qui contredit RG1, **pas** de remplacement de RG1 ; un item photos à chaque étape, `a_valider: true`, `audience: interne`, id FICTIF-005, estimation signalée provisoire ; une décision export CSV avec la synthèse pour source ; une action envoyer le chiffrage du lot 1, échéance 2026-11-05. |
| 3 | Question ouverte : `Accepter` ; item : `Modifier`, en demandant le lot 2 ; décision : `Accepter` ; action : `Accepter` | L'item modifié est représenté avant acceptation, avec `lot: 2`. |
| 4 | | `cadrage.md` : nouvelle puce en Questions ouvertes, synthèse ajoutée en Sources, RG1 intacte. `backlog/lot2.yaml` créé avec FICTIF-005. Entrée ajoutée **en fin** de `decisions.md`. ACT-FICTIF-004 ajoutée avec `source: syntheses/<date>-atelier.md` et `todoist_id: null`. |
| 5 | Commit : `Valider` | `validate.py` code 0, commit poussé. Le compte rendu suggère `/skeam-sync-todoist` et `/skeam-cadrage`. |

## Contrôles

```sh
cd "$RACINE/skeam-ops"
python3 scripts/validate.py ../skeam-test-fictif/projet
grep -c "plaud_id: " ../skeam-test-fictif/projet/transcripts/*.md
grep -nE "—|\(|\)" ../skeam-test-fictif/projet/syntheses/*.md | grep -v "<!--"
grep -n "5 000" ../skeam-test-fictif/projet/syntheses/*.md
```

Les deux derniers `grep` ne renvoient rien.

## Cas d'erreur à provoquer

| Action | Attendu |
|---|---|
| Demander une période sans enregistrement | La commande le dit et propose d'élargir. |
| Choisir un enregistrement sans transcript généré | Arrêt, rien n'est écrit. |
| Ne pas répondre à la question d'arbitrage | Aucune proposition appliquée. |
