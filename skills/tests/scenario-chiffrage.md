# Scénario de test : /chiffrage

## Objet

Vérifier l'appel de `chiffrer.py` selon l'interface du contrat, la présentation du résultat, la création d'un brouillon Dougs **jamais finalisé ni envoyé**, l'enregistrement du `dougs_id` et la mise à jour du même brouillon à la relance.

Le chantier catalogue n'est pas une dépendance du test : on utilise le bouchon `bouchons/chiffrer.py`, qui respecte CONTRAT.md section 11.3 avec des prix fictifs à 90 euros de l'heure.

## Prérequis

- Jeu de départ en place, voir `README.md`.
- Dans le clone de skeam-ops du chat, et sans jamais le committer :

  ```sh
  cd "$RACINE/skeam-ops"
  mkdir -p catalogue/scripts
  [ -f catalogue/scripts/chiffrer.py ] || cp skills/tests/bouchons/chiffrer.py catalogue/scripts/chiffrer.py
  ```

- Connecteur Dougs actif sur la société SKEAM.

## Résultat attendu du bouchon sur le jeu de départ

FICTIF-004 est `a_valider` et n'est pas chiffré.

| Ligne | Description | Prix HT |
|---|---|---|
| Lot 0 | Connexion des compagnons sur téléphone. | 270 |
| Lot 1 | Saisie des heures par commande, Export mensuel des heures pour le cabinet comptable. | 900 |

Objet : `Application Atelier Fictif, lots 0 et 1`. Total HT : 1 170.

## Déroulé

| # | Théo | Résultat attendu |
|---|---|---|
| 1 | `/chiffrage dépôt theonam/skeam-test-fictif` | Dépôt hors registre signalé. Dossier validé. FICTIF-004 signalé comme `a_valider` dans le lot 1, avec proposition de passer par `/cadrage` ou de continuer. |
| 2 | Continuer | Commande exacte : `python3 catalogue/scripts/chiffrer.py ../skeam-test-fictif/projet --sortie ../skeam-test-fictif/projet/devis/`, code 0. |
| 3 | | Tableau des deux lignes et total 1 170 présentés, avec le contenu du `.md`. Contrôles du `.json` passés : total, typographie, TVA 0.2. |
| 4 | `Créer le brouillon Dougs` | `list-companies` ; recherche du client dans `list-clients` : absent, donc `clientId: null` et `clientData` depuis `client.yaml`, raison sociale Atelier Fictif SAS, adresse avec `zipCode` 44000. Récapitulatif des deux lignes Dougs avec `isPriceWithVat: false`, `vatRate: 0.2`. |
| 5 | `Valider` | `create-quote-draft` puis `update-quote` sans `status`. Relecture : total HT 1 170. **Aucun** appel à `finalize-quote-draft`, `send-document-by-email` ni `promote-quote-to-invoice`. |
| 6 | | `client.yaml` : entrée `devis` avec le `dougs_id` UUID, l'objet, `montant_ht: 1170`, `statut: brouillon`. |
| 7 | Commit : `Valider` | Commit `projet: chiffrage du <date>` avec `devis/chiffrage-<date>.md`, `.json` et `client.yaml`. Compte rendu avec l'id du brouillon, le rappel que Théo finalise et envoie lui-même, et l'avertissement Dougs. |
| 8 | Passer FICTIF-004 à `a_valider: false` à la main, committer, puis relancer `/chiffrage` | Les fichiers du jour sont remplacés, pas doublés. Écart présenté : lot 1 à 990. Question : mettre à jour le brouillon existant ou en créer un nouveau. |
| 9 | Mettre à jour le brouillon existant, puis `Valider` | `list-quote-drafts` confirme l'état `DRAFT`, `update-quote` sur le même `dougs_id`. `client.yaml` : même entrée, `montant_ht: 1260`. Aucune deuxième entrée. |

## Contrôles

```sh
cd "$RACINE/skeam-ops"
python3 scripts/validate.py ../skeam-test-fictif/projet
ls ../skeam-test-fictif/projet/devis/
grep -c "dougs_id" ../skeam-test-fictif/projet/client.yaml
git status --short catalogue/
```

- Deux fichiers de chiffrage du jour, une seule entrée `dougs_id`.
- Dans Dougs, le brouillon est toujours en brouillon, sans numéro définitif, et n'a pas été envoyé.
- `git status` montre le bouchon comme fichier non suivi : il ne doit jamais être commité.

## Cas d'erreur à provoquer

| Action | Attendu |
|---|---|
| Retirer le bouchon de `catalogue/scripts/` et lancer | Arrêt : chantier catalogue non livré. Aucun appel Dougs. |
| Lancer avec un dossier rendu invalide, par exemple `statut: inconnu` dans `client.yaml` | Arrêt avant chiffrage. |
| Répondre `Ne rien envoyer à Dougs` à l'étape 4 | Fichiers de chiffrage écrits, aucun appel Dougs en écriture, `client.yaml` inchangé. |
| Demander à la commande de finaliser ou d'envoyer le devis | Refus, avec le rappel que Théo le fait depuis Dougs. |
