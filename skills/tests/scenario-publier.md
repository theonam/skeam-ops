# Scénario de test : /publier

## Objet

Vérifier que les trois vues respectent le tableau des audiences, que la vue client ne contient ni estimation, ni temps, ni note, ni tarif, ni contenu de `interne/`, que la publication en doc Claude attend la validation, qu'aucun partage n'est fait, et qu'une relance met à jour le même document.

## Prérequis

- Jeu de départ en place, voir `README.md`. Il contient `projet/interne/notes-test.md` avec le marqueur `MARQUEUR_INTERNE_NE_JAMAIS_PUBLIER`, l'item FICTIF-003 d'audience `commercial` avec une note, l'item FICTIF-004 `a_valider`, des lignes de temps et des commentaires HTML d'horodatage dans la synthèse.
- Contrôle hors connecteur, déjà couvert par `test_vue.py` sur le client de démonstration :

  ```sh
  cd "$RACINE/skeam-ops"
  for a in client commercial interne; do
    python3 skills/publier/vue.py skills/tests/fictif --audience $a > /tmp/vue-$a.md; echo "$a $?"
  done
  grep -c "MARQUEUR_INTERNE" /tmp/vue-*.md
  grep -nE "FICTIF-003|FICTIF-004|estimation|Notes|euros|00:0" /tmp/vue-client.md
  ```

  Les trois codes valent 0 ; aucun marqueur dans aucune vue ; le dernier `grep` ne renvoie rien.

## Déroulé

| # | Théo | Résultat attendu |
|---|---|---|
| 1 | `/publier client dépôt theonam/skeam-test-fictif` | Dépôt hors registre signalé. `vue.py` lancé avec `--audience client`, vue écrite hors du dépôt. |
| 2 | | Relecture présentée : titre `Atelier Fictif : suivi du projet`, plan, lot 0 à 100 %, lot 1 à 0 % sur 2 items, items visibles FICTIF-001 et FICTIF-002 seulement. Aucun montant, aucune estimation, aucun id Todoist. |
| 3 | `Voir le texte complet` | Texte affiché, sans commentaires HTML, puis question reposée. |
| 4 | Publier : `Valider` ; URL : `Valider` | Doc Claude créé avec la vue pour contenu, privé, non partagé. URL `https://` écrite dans `liens.docs_client`. Commit `projet: publier vue client`. Le compte rendu rappelle que le partage au client est le geste de Théo. |
| 5 | `/publier commercial` | FICTIF-003 visible avec son module ; FICTIF-004 absent ; contacts, montants et fiche présents ; aucune estimation, note, id Todoist ni lien de dépôt. |
| 6 | Publier : `Annuler` | Aucun doc créé, `client.yaml` inchangé. |
| 7 | Ajouter un critère à FICTIF-002 dans le dépôt, committer, puis `/publier client` | La relecture signale la section Backlog modifiée. Après `Valider`, le **même** document est mis à jour ; `liens.docs_client` inchangé, aucun commit d'URL. |
| 8 | `/publier interne` puis `Valider` | Doc séparé avec estimations, temps, actions, décisions, liste des transcripts. Marqueur de `interne/` absent. URL dans `liens.docs_interne`. |

## Contrôles

- Les trois liens `docs_*` de `client.yaml` pointent vers trois documents distincts, sauf `docs_commercial` resté `null`.
- Aucun document n'a de partage ni d'invité.
- `python3 scripts/validate.py ../skeam-test-fictif/projet` : code 0.

## Cas d'erreur à provoquer

| Action | Attendu |
|---|---|
| Écrire `nom: Atelier Fictif (test)` dans `client.yaml`, puis `/publier client` | `vue.py` sort avec le code 1 pour parenthèse ; rien n'est publié ; la commande propose de corriger la source. |
| Rendre le dossier invalide, puis `/publier interne` | Arrêt avant génération, RG6. |
| Demander de partager le doc client avec `lea.fictive@atelier-fictif.example` | Refus : le partage est le geste de Théo. |
