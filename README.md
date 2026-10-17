# skeam-ops

Système de pilotage des projets clients de SKEAM, SASU de chef de projet IT freelance. SKEAM conçoit des outils de gestion sur mesure pour des PME : applications web installables sur téléphone et tablette. Premier client : E G M, entreprise générale du bâtiment, dépôt `theonam/egm-app`.

## Principes

- Le dépôt Git est la source de vérité. Chaque dépôt client porte à sa racine un dossier `projet/` qui décrit le client, le cadrage, le backlog, les décisions, les actions et le temps passé.
- Les documents, le dashboard, Todoist et les devis Dougs sont des vues ou des sorties générées depuis ces fichiers.
- Tout se déclenche par une commande manuelle. Rien n'est envoyé à un client automatiquement.
- Les formats sont fixés par [CONTRAT.md](CONTRAT.md) et vérifiés par `scripts/validate.py`.
- skeam-ops se pilote lui-même avec un dossier `projet/` au même format, slug `ops`.

## Carte des dossiers

| Chemin | Contenu | Propriétaire |
|---|---|---|
| `CONTRAT.md` | formats, audiences et interfaces entre chantiers | Théo |
| `schemas/` | un JSON Schema par format | Théo |
| `scripts/` | `contrat.py` lecture commune, `validate.py`, `nouveau_dossier.py`, tests | Théo |
| `templates/dossier-client/` | gabarit du dossier `projet/` d'un client, avec `CLAUDE-projet.md` | Théo |
| `templates/claude-agents/` | agents types à copier dans `.claude/agents/` d'un dépôt client, chacun avec son modèle imposé | Théo |
| `exemples/` | client fictif complet, registre et catalogue d'exemple : jeu de test commun | Théo |
| `clients.yaml` | registre des clients | Théo |
| `projet/` | pilotage de skeam-ops, slug `ops` | Théo ; chaque chantier y tient son backlog et son temps |
| `socle/` | application socle et `scripts/init_app.sh` | chantier socle |
| `catalogue/` | modules, tarifs, `chiffrer.py`, `calibrer.py` | chantier catalogue |
| `skills/` | commandes /skeam-nouveau-client, /skeam-import-transcript, /skeam-cadrage, /skeam-chiffrage, /skeam-sync-todoist | chantier cadrage |
| `dashboard/` | `agreger.py`, rendu, commandes /skeam-dashboard, /skeam-publier, /skeam-calibrer | chantier dashboard |
| `CLAUDE.md`, `README.md`, `requirements.txt`, `.gitignore` | consignes et configuration communes | Théo |

## Démarrage

```sh
python3.11 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python scripts/validate.py templates/dossier-client projet
python scripts/validate.py --clients exemples/clients.yaml --racine exemples/racine --catalogue exemples/catalogue
python scripts/validate.py --contrat CONTRAT.md
python -m unittest discover -s scripts -p "test_*.py"
```

Créer le dossier projet d'un nouveau client :

```sh
python scripts/nouveau_dossier.py <slug> "<nom>" <racine du dépôt client> --depot theonam/<depot>
```

Les clones des dépôts clients se placent tous dans un même dossier racine : le dépôt `theonam/egm-app` est attendu dans `<racine>/egm-app`. Cette racine est l'argument `--racine` de `validate.py`, `calibrer.py` et `agreger.py`.

## Règles de collaboration

1. **Une conversation par chantier, sur sa branche** : `feat/socle`, `feat/catalogue`, `feat/cadrage`, `feat/dashboard`. Elle ne modifie que son dossier, son fichier `projet/backlog/<chantier>.yaml` et son fichier de temps `projet/temps/AAAA-MM-ops-<chantier>.jsonl`.
2. **CONTRAT.md et schemas/ ne sont modifiés que par Théo**, de même que `scripts/`, `templates/`, `exemples/`, `clients.yaml`, ce README et `CLAUDE.md`. Une conversation qui a besoin d'un changement l'écrit dans `<son dossier>/PROPOSITIONS-CONTRAT.md`, au format de CONTRAT.md section 14, et continue avec l'hypothèse la plus simple compatible avec le contrat actuel.
3. **Livraison par pull request vers main**, après `python scripts/validate.py projet` et les tests sans erreur.
4. **Ids sans collision** : chaque chantier crée ses items dans sa plage, OPS-101 à 199 socle, 201 à 299 catalogue, 301 à 399 cadrage, 401 à 499 dashboard ; OPS-001 à 099 sont réservés au socle commun.
5. **Items** : un chantier passe ses items `en_cours`, `a_recetter`, puis `fait` quand il a vérifié lui-même chaque critère d'acceptation ; seul Théo les passe à `abandonne`. Tout besoin découvert devient un item `a_valider: false`, `audience: interne`, dans son propre fichier de backlog.
6. **Temps** : une ligne par session, agent `ops-<chantier>`, heures de Paris.
7. **Clients** : aucune conversation de skeam-ops ne modifie un dépôt client, en particulier `theonam/egm-app`, sans instruction explicite.
8. **Données d'essai** : tester sur `exemples/`, jamais sur des données client réelles copiées dans skeam-ops.

Le détail des consignes d'agent est dans [projet/CLAUDE-projet.md](projet/CLAUDE-projet.md), importé par `CLAUDE.md`.
