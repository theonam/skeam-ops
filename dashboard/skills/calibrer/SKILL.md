---
name: calibrer
description: Recalibre le catalogue de modules SKEAM à partir du temps réellement passé sur les items faits de tous les clients actifs. Clone skeam-ops et les dépôts actifs, lance catalogue/scripts/calibrer.py selon CONTRAT.md section 11.4, présente catalogue/out/calibration.md et propose les mises à jour du catalogue à valider une par une. Invoquer avec /calibrer, ou dès que Théo demande de recalibrer le catalogue, de comparer estimations et temps réels, ou de mettre à jour les fourchettes d'heures ou les prix conseillés.
---

# /calibrer

Commande du chantier dashboard, CONTRAT.md section 11.7. Elle orchestre `calibrer.py`, propriété du chantier catalogue, sans rien calculer elle-même. Tout ce qu'elle manipule est d'audience interne : rien n'en sort de la conversation avec Théo.

## Règles absolues

- Ne jamais écrire dans un dépôt client ni lire `projet/interne/`.
- Ne jamais modifier `heures_min`, `heures_max`, `confiance`, `prix_conseille_ht`, `catalogue/tarifs.yaml` ni ajouter un module sans l'accord explicite de Théo, proposition par proposition.
- Ne jamais pousser sur `main` : les mises à jour passent par une branche et une pull request.
- Ne jamais publier le calibrage dans un artefact partagé ni dans une vue commercial ou client : heures, tarifs et marges sont internes.

## Étapes

### 1. Préparer et cloner

```sh
TRAVAIL=$(mktemp -d)
git clone https://github.com/theonam/skeam-ops "$TRAVAIL/skeam-ops"
cd "$TRAVAIL/skeam-ops"
python3.11 -m venv .venv && . .venv/bin/activate && pip install -q -r requirements.txt
[ -f catalogue/requirements.txt ] && pip install -q -r catalogue/requirements.txt
mkdir -p "$TRAVAIL/clones"
```

Pour chaque entrée `actif: true` de `clients.yaml`, cloner `depot` dans `$TRAVAIL/clones/<nom du dépôt sans propriétaire>` avec l'accès GitHub disponible. Un dépôt inaccessible arrête la commande : un calibrage sur une partie des clients fausserait les mesures.

Si `catalogue/scripts/calibrer.py` n'existe pas encore sur `main`, le dire à Théo et s'arrêter : le script relève du chantier catalogue, item OPS-204.

### 2. Calibrer

```sh
python catalogue/scripts/calibrer.py --clients clients.yaml --racine "$TRAVAIL/clones"
```

- Code 1 : montrer les erreurs telles quelles, avec le dépôt concerné, et s'arrêter.
- Code 2 : erreur d'usage, à corriger avant de relancer.

Le script réécrit seulement la liste `mesures` de chaque module de `catalogue/modules.yaml` : une mesure par item `fait` à module non nul, heures validées seulement. Il est idempotent.

### 3. Présenter le calibrage

1. Afficher le contenu de `catalogue/out/calibration.md`. S'il n'existe pas, le signaler et s'appuyer sur la suite seule.
2. Résumer `git diff --stat catalogue/modules.yaml` puis, module par module, les mesures ajoutées, retirées ou modifiées : client, item, heures.
3. Pour chaque module qui a des mesures, comparer leurs heures à `heures_min` et `heures_max` et lister les écarts : mesures hors fourchette, nombre de mesures au regard de `confiance`.

Si rien ne change, le dire et s'arrêter sans branche ni commit.

### 4. Proposer les mises à jour

Dresser un tableau des propositions, une ligne par champ à modifier : module, champ, valeur actuelle, valeur proposée, justification tirée des mesures ou de `calibration.md`. Les nouvelles `mesures` écrites par le script sont la première ligne, toujours proposée. Demander à Théo de valider, refuser ou ajuster chaque ligne ; ne rien supposer accepté.

### 5. Appliquer ce qui est validé

1. Créer la branche `calibrage-AAAA-MM-JJ`, date du jour à Paris.
2. Appliquer seulement les lignes validées dans `catalogue/modules.yaml` ; ne pas versionner `catalogue/out/`.
3. Valider :

   ```sh
   python scripts/validate.py --catalogue catalogue/ --clients clients.yaml --racine "$TRAVAIL/clones"
   ```

   Toute erreur arrête la commande ; la montrer à Théo.
4. Commiter avec un message qui commence par l'id d'item que Théo indique, à défaut `OPS-204`, par exemple `OPS-204: calibrage du 2026-11-02`, pousser la branche et ouvrir une pull request vers `main` qui reprend le tableau des lignes validées.
5. Donner le lien de la pull request. La fusion reste à Théo.
