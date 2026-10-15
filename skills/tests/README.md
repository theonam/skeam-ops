# Tests des commandes du chantier cadrage

Un scénario de test manuel par commande, joué dans le chat claude.ai sur le client fictif **Atelier Fictif**, slug `fictif`. Aucune donnée réelle, aucun client réel touché.

| Fichier | Rôle |
|---|---|
| `scenario-nouveau-client.md` | /nouveau-client |
| `scenario-import-transcript.md` | /import-transcript |
| `scenario-cadrage.md` | /cadrage |
| `scenario-chiffrage.md` | /chiffrage |
| `scenario-sync-todoist.md` | /sync-todoist |
| `scenario-publier.md` | /publier |
| `fictif/projet/` | dossier projet fictif, valide, état de départ des scénarios 2 à 6 |
| `reunions/` | textes de réunions fictives à enregistrer sur Plaud |
| `bouchons/chiffrer.py` | bouchon de `catalogue/scripts/chiffrer.py`, prix fictifs, interface de CONTRAT.md section 11.3 |
| `test_vue.py` | test automatique de `skills/publier/vue.py` |

## Tests automatiques

Depuis la racine de skeam-ops, sans connecteur :

```sh
python scripts/validate.py skills/tests/fictif/projet
python -m unittest discover -s skills/tests -p "test_*.py"
```

## Préparer les scénarios

Une seule fois :

1. Créer sur GitHub le dépôt **privé** vide `theonam/skeam-test-fictif` et l'attacher à la conversation de test.
2. Dans le chat, étape 0 de `skills/commun.md`.

Le scénario 1 part du dépôt vide. Les scénarios 2 à 6 partent du **jeu de départ**, remis en place par ces commandes, à lancer dans le chat avant chacun d'eux :

```sh
cd "$RACINE"
[ -d skeam-test-fictif/.git ] || git clone https://github.com/theonam/skeam-test-fictif.git
cd skeam-test-fictif
git rm -rq --ignore-unmatch projet && rm -rf projet
cp -r ../skeam-ops/skills/tests/fictif/projet projet
printf '@projet/CLAUDE-projet.md\n' > CLAUDE.md
git add projet CLAUDE.md && git commit -qm "test: jeu de départ" && git push
```

Le client fictif n'est pas au registre `clients.yaml` : à chaque commande, désigner explicitement le dépôt `theonam/skeam-test-fictif`. La commande doit signaler qu'il n'est pas au registre, puis continuer après confirmation.

## Règles communes à tous les scénarios

- Chaque étape donne ce que Théo dit ou choisit, puis le résultat attendu. Un écart est un échec du scénario.
- À chaque validation demandée, vérifier que le récapitulatif présenté correspond exactement à ce qui est ensuite écrit.
- Contrôle de fin commun : `python3 scripts/validate.py ../skeam-test-fictif/projet` sort avec le code 0 et `git -C ../skeam-test-fictif status --short` est vide après un commit validé.
- Jamais de réponse à la place de Théo : une question sans réponse doit bloquer la commande.

## Nettoyage

Après la campagne :

- supprimer la section Todoist `Client · Atelier Fictif` et ses tâches ;
- supprimer dans Dougs les brouillons de devis créés pour Atelier Fictif ;
- supprimer les docs Claude publiés pour Atelier Fictif ;
- supprimer le dépôt `theonam/skeam-test-fictif` ou le garder pour la prochaine campagne ;
- vérifier que `clients.yaml` de skeam-ops ne contient pas `fictif`.
