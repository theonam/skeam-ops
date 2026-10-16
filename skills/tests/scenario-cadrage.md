# Scénario de test : /skeam-cadrage

## Objet

Vérifier que la commande consolide le cadrage depuis toutes les synthèses et décisions, signale la contradiction sur le plafond d'heures sans la trancher, conserve la numérotation des règles, propose les items manquants et fait valider les items en attente.

## Prérequis

Jeu de départ en place, voir `README.md`, complété par la réunion d'atelier :

```sh
cd "$RACINE/skeam-test-fictif"
cp -r ../skeam-ops/skills/tests/complements/* projet/
git add projet && git commit -qm "test: réunion d'atelier" && git push
```

Le dossier contient alors deux synthèses : 2026-10-20, plafond de 10 heures accepté ; 2026-10-27, demande de 12 heures non tranchée et export CSV décidé en séance.

## Déroulé

| # | Théo | Résultat attendu |
|---|---|---|
| 1 | `/skeam-cadrage dépôt theonam/skeam-test-fictif` | Dépôt hors registre signalé, confirmation demandée. Mode mise à jour. Les deux synthèses, `decisions.md`, le cadrage et le backlog sont lus ; `interne/` ne l'est pas. |
| 2 | | Contradiction présentée : 10 heures, `syntheses/2026-10-20-lancement.md` 00:02:50 et RG1, contre 12 heures les jours de livraison, `syntheses/2026-10-27-atelier.md` 00:00:15. Les deux énoncés sont cités, la commande indique laquelle est la plus récente et **ne tranche pas**. |
| 3 | | Proposition de cadrage, sections changées seulement : Objet et statut en version 2 du jour ; Intégrations avec export CSV ; Questions ouvertes avec le plafond des jours de livraison et les étapes à photographier ; Sources avec les deux synthèses. RG1 et RG2 inchangées. |
| 4 | Objet et statut : `Accepter` ; Intégrations : `Accepter` ; Questions ouvertes : `Modifier`, retirer la question sur les photos ; Sources : `Accepter` | La section modifiée est représentée avant acceptation. |
| 5 | | Backlog : un item photos proposé, `a_valider: true`, `audience: interne`, FICTIF-005 ; aucune fusion, aucune suppression proposée. FICTIF-003 peut recevoir une proposition de critère précisant le format CSV. |
| 6 | Item photos : `Rejeter` ; critère CSV de FICTIF-003 : `Accepter` | FICTIF-003 garde son `statut`, son `commit` ; seule `maj` passe au jour. |
| 7 | | Validation des items en attente : FICTIF-004 présenté. |
| 8 | FICTIF-004 : `Valider`, audience `interne` | `a_valider: false`, `audience: interne`. |
| 9 | | Aucune proposition de statut client : il vaut déjà `cadrage`. |
| 10 | Commit : `Valider` | `validate.py` code 0, aucun avertissement de règle citée absente. Commit `projet: skeam-cadrage version 2`. Le compte rendu liste la contradiction encore ouverte. |
| 11 | Relancer `/skeam-cadrage` aussitôt | Aucune proposition de cadrage, sauf éventuellement l'item photos rejeté, signalé comme déjà écarté ; version inchangée. |

## Contrôles

```sh
cd "$RACINE/skeam-ops"
python3 scripts/validate.py ../skeam-test-fictif/projet
grep -n "RG1\|RG2" ../skeam-test-fictif/projet/cadrage.md
grep -n "12 heures" ../skeam-test-fictif/projet/cadrage.md
git -C ../skeam-test-fictif diff HEAD~1 -- projet/decisions.md
```

- RG1 vaut toujours 10 heures ; « 12 heures » n'apparaît qu'en Questions ouvertes.
- `decisions.md` n'a pas changé.

## Cas d'erreur à provoquer

| Action | Attendu |
|---|---|
| Renommer à la main le titre `## Exigences` en `## Exigence` avant de lancer | Validation initiale en erreur ; la commande propose de rétablir le titre, sans toucher au reste. |
| Supprimer toutes les synthèses dans une copie locale et lancer | Arrêt, `/skeam-import-transcript` suggéré. |
