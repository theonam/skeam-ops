# Propositions d'évolution du contrat, chantier dashboard

Format : CONTRAT.md section 14. Décision réservée à Théo.

## 2026-10-15 Projet ops dans l'agrégation

- **Besoin** : la section 11.5 fait lire à `agreger.py` les seuls clients actifs du registre, alors que skeam-ops doit apparaître comme projet interne, slug `ops`, et que `clients.yaml` ne le déclare pas. La section 10 ne dit pas non plus quelles audiences voient un projet interne.
- **Proposition** : ajouter à la section 11.5 « Lit aussi le dossier `projet/` du répertoire courant, projet `ops`, sauf si le registre déclare déjà ce slug ; ce projet n'apparaît que dans la vue interne. »
- **Hypothèse retenue en attendant** : exactement ce comportement, documenté dans `dashboard/README.md` ; `projet/` absent ou d'un autre slug est ignoré avec un avertissement.
- **Impact** : CONTRAT.md sections 10 et 11.5 ; aucun autre chantier.

## 2026-10-15 Rapport de calibrage

- **Besoin** : `/skeam-calibrer` présente `catalogue/out/calibration.md`, que la section 11.4 ne mentionne pas ; la commande ne sait donc pas si ce fichier existera ni ce qu'il contient.
- **Proposition** : ajouter à la section 11.4 « Écrit aussi `catalogue/out/calibration.md`, non versionné, d'audience interne, au contenu libre : par module, mesures, écart à la fourchette `heures_min` et `heures_max` et propositions de mise à jour. »
- **Hypothèse retenue en attendant** : `/skeam-calibrer` affiche le fichier s'il existe, sinon s'appuie sur le diff de `catalogue/modules.yaml`.
- **Impact** : CONTRAT.md section 11.4, chantier catalogue, `calibrer.py`, et `.gitignore` pour `catalogue/out/`.
