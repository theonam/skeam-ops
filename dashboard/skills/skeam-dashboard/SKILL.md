---
name: skeam-dashboard
description: Produit et publie le tableau de bord SKEAM de tous les projets clients actifs, pour l'audience demandée, interne par défaut, commercial pour l'associé commercial, ou client pour un client donné. Clone skeam-ops et les dépôts actifs, lance dashboard/scripts/agreger.py, injecte la vue dans le gabarit et republie l'artefact au même lien. Invoquer avec /skeam-dashboard [interne|commercial|client <slug>|toutes], ou dès que Théo demande où en sont ses clients, ce qui bloque, ce qui dérape, ce qu'il doit faire, ou de mettre à jour le dashboard.
---

# /skeam-dashboard

Commande du chantier dashboard, CONTRAT.md section 11.7. Elle orchestre les scripts du dépôt sans rien calculer elle-même : les chiffres viennent de `agreger.py`, la page de `rendre.py`. Format des vues : `dashboard/README.md` de skeam-ops.

## Argument

| Argument | Vue produite | Clé dans `dashboard/artefacts.yaml` |
|---|---|---|
| aucun ou `interne` | vue interne, pour Théo seul | `interne` |
| `commercial` | vue de l'associé commercial | `commercial` |
| `client <slug>` | vue d'un seul client | `client-<slug>` |
| `toutes` | interne puis commercial | les deux |

La vue client sans slug est refusée : elle mélangerait les clients.

## Règles absolues

- **Vue commercial** : destinée à l'associé commercial. Jamais de temps, d'heures, d'estimation, de tarif, de taux, de marge, d'action personnelle ni de dépendance ; seule exception, décidée par Théo le 2026-10-16 : le prix de vente des fonctionnalités supplémentaires facturables, champ `prix_vente_ht`. Ne jamais y ajouter quoi que ce soit à la main, ne jamais republier une page interne à l'URL commerciale.
- **Vue client** : un seul client par page, toujours avec `--projet <slug>`.
- Ne jamais lire ni citer `projet/interne/` d'un dépôt.
- Ne jamais écrire dans un dépôt client, ne jamais commiter sur un dépôt client.
- Rien n'est envoyé à personne : publier l'artefact ne notifie personne et le lien n'est partagé que par Théo.
- **Toujours un artefact claude.ai**, republié au même lien, aperçu compris. Jamais un simple fichier HTML à télécharger ou à ouvrir.
- **Gabarit figé** : `dashboard/template.html` et `dashboard/format.json` de `main`, pris tels quels. Ne jamais modifier la page générée ni le gabarit depuis le chat ; une évolution passe par Théo et une pull request, `dashboard/README.md` section Gabarit figé.
- **Todoist** n'entre que dans la vue interne : ni instantané ni capacité `mcp` sur les vues commercial et client.
- Confirmation de Théo avant toute écriture hors du dépôt, donc avant chaque publication, et avant tout commit sur skeam-ops.

## Étapes

### 1. Préparer l'espace de travail

```sh
TRAVAIL=$(mktemp -d)
git clone --depth 1 https://github.com/theonam/skeam-ops "$TRAVAIL/skeam-ops"
cd "$TRAVAIL/skeam-ops"
python3.11 -m venv .venv && . .venv/bin/activate && pip install -q -r requirements.txt
```

Utiliser l'accès GitHub disponible dans la conversation : connecteur GitHub, `gh` authentifié ou jeton fourni par Théo. Sans accès à un dépôt, s'arrêter et nommer le dépôt manquant ; ne jamais publier une vue partielle.

### 2. Cloner les dépôts actifs

Lire `clients.yaml` ; pour chaque entrée `actif: true`, cloner `depot` dans `$TRAVAIL/clones/<nom du dépôt sans propriétaire>` :

```sh
mkdir -p "$TRAVAIL/clones"
git clone --depth 1 https://github.com/<proprietaire>/<nom> "$TRAVAIL/clones/<nom>"
```

skeam-ops lui-même n'est pas à cloner une seconde fois : `agreger.py` lit le projet `ops` dans le `projet/` du répertoire courant.

### 3. Agréger

Depuis `$TRAVAIL/skeam-ops`, pour chaque vue demandée, `<audience>` valant `interne`, `commercial` ou `client` :

```sh
python dashboard/scripts/agreger.py --clients clients.yaml --racine "$TRAVAIL/clones" --audience <audience> --sortie dashboard/out/<audience>.json
```

- Code 0 : continuer.
- Code 1 : un registre ou un dossier projet est invalide, ou un clone manque. Montrer à Théo les lignes `ERREUR` telles quelles, avec le dépôt concerné, et s'arrêter. Ne jamais corriger un dépôt client de sa propre initiative.
- Code 2 : erreur d'usage de la commande, à corriger avant de relancer.

### 4. Relever Todoist, vue interne seulement

Lire `dashboard/todoist.json`. Avec le connecteur Todoist, appeler `find-sections` avec `projectId` puis `find-tasks` avec `projectId` et `limit: 100`, lectures seules. Écrire `dashboard/out/todoist.json` :

```json
{"releve_le": "<date et heure ISO 8601 de Paris>", "partiel": <hasMore de find-tasks>, "sections": <sections de find-sections>, "taches": <tasks de find-tasks>}
```

Sans connecteur Todoist, le dire à Théo et produire la page sans `--todoist` : la todo affichera qu'elle n'a pas pu être lue. Ne jamais créer, modifier ni cocher une tâche depuis la commande.

### 5. Produire la page

```sh
python dashboard/scripts/rendre.py dashboard/out/interne.json --sortie dashboard/out/interne.html --todoist dashboard/out/todoist.json
python dashboard/scripts/rendre.py dashboard/out/commercial.json --sortie dashboard/out/commercial.html
python dashboard/scripts/rendre.py dashboard/out/client.json --sortie dashboard/out/client-<slug>.html --projet <slug>
```

Contrôle avant publication, qui doit afficher l'audience attendue :

```sh
python -c "import json, sys; print(json.load(open(sys.argv[1]))['audience'])" dashboard/out/<audience>.json
```

### 6. Résumer et demander la publication

Présenter à Théo, depuis le JSON et sans rien inventer :

- vue interne : nombre de projets, alertes de gravité haute une par ligne, les trois premières tâches de la todo Todoist, les compteurs à tester, à valider et devis à envoyer par projet, total signé et charge de la semaine, en signalant « devis non saisi » et « temps non journalisé » là où ils s'appliquent ;
- vue commercial : nombre de clients, total signé, points d'attention ;
- vue client : nom du client et avancement par lot.

Puis indiquer l'URL qui sera mise à jour, lue dans `dashboard/artefacts.yaml` sous la clé de la vue, ou qu'un nouvel artefact sera créé si la clé est absente ou vaut null. Attendre l'accord.

### 7. Publier

Publier le fichier HTML produit, tel quel, avec l'outil d'artefact du chat. Titre de l'artefact : `Pilotage SKEAM` pour les vues interne et commercial, `Avancement <nom du client>` pour une vue client.

Vue interne : déclarer la capacité `mcp` pour que la page lise la todo en direct et que Théo coche depuis la page :

```json
{"mcp": {"servers": [{"server": "Todoist", "tools": ["find-sections", "find-tasks", "complete-tasks"]}]}}
```

Sur une mise à jour, la déclaration déjà enregistrée est conservée ; ne jamais déclarer `mcp` sur les vues commercial et client. Si l'outil d'artefact ne propose pas les capacités, publier sans : la page affiche alors l'instantané.

- URL enregistrée : la passer à l'outil pour mettre à jour cet artefact en place ; le lien ne change pas.
- Pas d'URL : créer l'artefact, puis proposer d'enregistrer son URL : modifier `dashboard/artefacts.yaml` sous la clé de la vue, et après accord de Théo commiter sur `main` de skeam-ops avec le message `OPS-403: URL de l'artefact <clé>` et pousser.
- Si l'outil ne sait pas mettre à jour l'artefact enregistré, le dire et demander à Théo avant d'en créer un second ; un nouveau lien casse celui déjà partagé.

### 8. Conclure

Donner le lien publié, la date de génération et, pour la vue interne, la première alerte et la première tâche de la todo. Rien d'autre n'est modifié.
