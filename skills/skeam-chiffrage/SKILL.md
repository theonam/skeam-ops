---
name: skeam-chiffrage
description: Chiffre le backlog d'un client SKEAM avec catalogue/scripts/chiffrer.py, présente le résultat à Théo puis, après sa validation, crée ou met à jour un brouillon de devis Dougs, jamais finalisé ni envoyé, et l'enregistre dans client.yaml. À utiliser quand Théo tape /skeam-chiffrage, demande un devis, un chiffrage ou un prix pour un client, ou veut rafraîchir le statut des devis Dougs d'un client.
---

# /skeam-chiffrage

Produit le chiffrage d'un client et le dépose en brouillon dans Dougs. Théo voit les chiffres avant tout appel à Dougs et reste le seul à finaliser et envoyer le devis, depuis Dougs.

Lire d'abord `skills/commun.md` dans le clone de skeam-ops, puis CONTRAT.md sections 4 et 11.3.

## Entrées

| Entrée | Si absente |
|---|---|
| Client : slug ou nom | question à choix multiples |
| Brouillon existant à mettre à jour, ou nouveau brouillon | question si `client.yaml` porte déjà un devis `brouillon` |

## Sorties

- `projet/devis/chiffrage-AAAA-MM-JJ.md` et `.json`, produits par `chiffrer.py`.
- Un brouillon de devis Dougs, statut `DRAFT`, objet et lignes repris du `.json`.
- Une entrée `devis` dans `client.yaml` : `dougs_id`, `objet`, `montant_ht` égal à `total_ht`, `statut: brouillon`.
- Facultatif : statuts des autres devis de `client.yaml` rafraîchis depuis Dougs.

## Étapes

### 1. Préparer

1. Étape 0 et identification du client, `skills/commun.md` sections 1 et 2. Un dossier invalide n'est jamais chiffré.
2. Vérifier la présence de `catalogue/scripts/chiffrer.py` dans skeam-ops. Absent : s'arrêter, le chantier catalogue n'est pas livré. La commande ne lit jamais le catalogue elle-même : le script s'en charge.
3. Vérifier qu'aucun item n'est `a_valider: true` dans les lots à chiffrer ; sinon le signaler et proposer `/skeam-cadrage` d'abord, ou de continuer en connaissance de cause.

### 2. Chiffrer

```sh
cd "$RACINE/skeam-ops"
python3 catalogue/scripts/chiffrer.py ../<nom>/projet --sortie ../<nom>/projet/devis/
```

| Code | Conduite |
|---|---|
| 0 | Continuer. |
| 1 | Erreur de données : montrer la sortie d'erreur, s'arrêter. |
| 2 | Usage incorrect : vérifier la commande contre CONTRAT.md section 11.3, s'arrêter si l'écart persiste. |

Puis `python3 scripts/validate.py ../<nom>/projet` : code 0 exigé. Contrôler aussi, par lecture du `.json` :

- `total_ht` égal à la somme des `quantite` fois `prix_unitaire_ht`, arrondie au centime ;
- objet, titres et descriptions sans tiret cadratin ni parenthèse ;
- `tva` en ratio : `0.2`, jamais `20`.

Un second passage le même jour remplace les deux fichiers : c'est voulu par le contrat.

### 3. Présenter à Théo

- Le tableau des lignes : titre, description, quantité, unité, prix unitaire HT, TVA, montant HT de la ligne ; puis le total HT.
- Le contenu du `.md`, audience interne : hypothèses, heures, marges. Il ne sort jamais du chat ni vers Dougs.
- L'écart avec le dernier chiffrage de `devis/`, s'il en existe un : lignes ajoutées, retirées, montants changés.
- Question : `Créer le brouillon Dougs`, `Ne rien envoyer à Dougs`. Une correction de prix ou de ligne ne se fait pas à la main dans le `.json` : elle se fait dans le backlog ou le catalogue, puis la commande est relancée.

### 4. Préparer le brouillon Dougs

1. `list-companies` : retenir la société SKEAM ; s'il y en a plusieurs, demander.
2. Client de facturation : `list-clients` avec `isBtoB: true`. Chercher le client par `siren` de `client.yaml`, sinon par raison sociale exacte. Trouvé : retenir son `clientId` UUID. Pas trouvé : `clientId: null` et `clientData` rempli depuis `client.yaml` ; Dougs créera le client à la finalisation par Théo. Ne jamais passer l'id numérique de `list-customers`.
3. Lignes : une ligne Dougs par ligne du `.json`, sans regroupement ni arrondi :

   | `.json` | Dougs |
   |---|---|
   | `titre` | `title` |
   | `description` | `description` |
   | `quantite` | `quantity` |
   | `unite` | `unit` |
   | `prix_unitaire_ht` | `unitAmount` |
   | `tva` | `vatRate` |
   | | `isPriceWithVat: false` |

4. `subject` égal à `objet`. `clientData` : `clientId`, `isBToB: true`, `legalName` égal à `raison_sociale`, sinon `nom`, `siren`, `address` depuis `adresse` avec `zipCode` pour `code_postal`.

Récapitulatif complet de l'appel, puis question `Valider`, `Annuler`.

### 5. Créer ou mettre à jour le brouillon

- **Nouveau** : `create-quote-draft` avec `companyId`, retenir l'`id` du devis, puis `update-quote` avec `subject`, `lines` et `clientData`, sans `status`.
- **Mise à jour** d'un brouillon existant : `list-quote-drafts` pour vérifier qu'il est toujours en `DRAFT`, puis `update-quote` sur son `dougs_id`. S'il n'est plus brouillon, ne pas le toucher et proposer un nouveau brouillon.
- Relire le brouillon et comparer son total HT au `total_ht` du `.json`. Écart : le signaler, ne rien corriger seul.

### 6. Enregistrer dans client.yaml

- Nouveau brouillon : ajouter en fin de liste `devis` l'entrée `dougs_id`, `objet`, `montant_ht`, `statut: brouillon`.
- Mise à jour : modifier `objet` et `montant_ht` de l'entrée existante.
- Si `create-quote-draft` a réussi mais `update-quote` a échoué : enregistrer quand même l'entrée avec le `dougs_id`, pour qu'une relance mette à jour ce brouillon au lieu d'en créer un second, et le signaler.
- Valider le dossier, puis question de commit `projet: skeam-chiffrage du AAAA-MM-JJ`, avec `devis/` et `client.yaml`.

### 7. Rafraîchir les statuts, facultatif

Sur demande de Théo, ou si `client.yaml` porte des devis `envoye` : lire leur statut dans Dougs et proposer la correspondance du contrat, `DRAFT` brouillon, `PENDING` envoye, `ACCEPTED` accepte, `REFUSED` refuse. Écrire après `Valider`. Un devis accepté peut justifier de proposer le statut client `signe` et `dates.signature` : proposition seulement.

### 8. Compte rendu

Selon `skills/commun.md` section 8, avec le total HT, l'id du brouillon et le rappel que Théo le finalise et l'envoie lui-même depuis Dougs. Terminer par l'avertissement imposé par le connecteur Dougs.

## Garde-fous

- Jamais `finalize-quote-draft`, `send-document-by-email`, `promote-quote-to-invoice`, ni `update-quote` avec un `status` autre que `DRAFT`.
- Aucun appel Dougs en écriture avant `Valider`.
- Aucune ligne Dougs qui ne vienne pas une pour une du `.json`. Aucun prix inventé ou ajusté par la commande.
- Le `.md` de chiffrage, les heures, les marges et le catalogue ne sortent jamais vers Dougs.
- `projet/interne/` n'est pas lu, même pour les marges.

## Idempotence

- `chiffrer.py` remplace les fichiers du jour : relancer ne crée pas de doublon.
- Un devis `brouillon` déjà enregistré dans `client.yaml` est mis à jour plutôt que recréé, sauf choix contraire de Théo.
- Une entrée `devis` n'est jamais ajoutée deux fois pour un même `dougs_id`.

## Cas d'erreur

| Cas | Conduite |
|---|---|
| `chiffrer.py` absent | S'arrêter : chantier catalogue non livré. |
| `.json` invalide pour le schéma | S'arrêter ; ne rien envoyer à Dougs. |
| Société Dougs absente de `list-companies` | Le connecteur Dougs n'est sans doute pas activé sur la société ; Théo l'active dans Dougs. S'arrêter. |
| Client sans `raison_sociale` ni `adresse` | Créer le brouillon avec le seul `nom` et le signaler : Théo complètera avant finalisation. |
| Échec de `update-quote` | Garder le `dougs_id`, voir étape 6, et proposer de relancer. |
