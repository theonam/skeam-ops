---
name: nouveau-client
description: Ouvre un nouveau client SKEAM, dépôt GitHub, dossier projet, fiche, registre clients.yaml et section Todoist. À utiliser dès que Théo dit qu'il a un nouveau prospect ou client, tape /nouveau-client, ou demande de créer le dossier d'un client qui n'est pas encore dans clients.yaml.
---

# /nouveau-client

Crée tout ce qu'il faut pour suivre un nouveau client : le dépôt, le dossier `projet/` au format du contrat, l'entrée du registre et la section Todoist. Théo ne donne que ce qu'il sait ; la commande cherche le reste dans le registre public des entreprises et ne remplit rien qui n'a pas de source.

Lire d'abord `skills/commun.md` dans le clone de skeam-ops, puis CONTRAT.md sections 3, 4, 9.5, 11.2 et 12.

## Entrées

| Entrée | Obligatoire | Si absente |
|---|---|---|
| Nom d'usage du client | oui | le demander |
| Apporteur : `theo`, `jonathan`, `autre` | oui | question à choix multiples |
| Slug | non | proposé : minuscules et chiffres tirés du nom, 2 à 12 caractères, sans tiret, absent du registre |
| Dépôt | non | proposé : `theonam/<slug>-app`, sur le modèle de `theonam/egm-app` |
| SIREN | non | pas de recherche registre ; Théo peut donner une raison sociale à la place |
| Contacts : nom, rôle, courriel, téléphone | non | `contacts: []` |
| Date du premier contact | non | question : aujourd'hui, une autre date, inconnue |
| Besoin exprimé, en quelques phrases | non | `À compléter.` dans la fiche |

Toutes les entrées manquantes se demandent en une seule fois, slug et dépôt proposés compris.

## Sorties

- Dépôt client cloné dans `$RACINE/<nom du dépôt>`, avec `projet/` créé par `scripts/nouveau_dossier.py` et un `CLAUDE.md` racine qui contient la ligne `@projet/CLAUDE-projet.md`.
- `projet/client.yaml` complété : `statut: prospect`, `apporteur`, `dates.premier_contact`, `contacts`, et, si le registre a répondu, `raison_sociale`, `siren`, `adresse`. `todoist.projet_id` et `todoist.section_id` renseignés.
- `projet/fiche.md` rédigée : Entreprise, Interlocuteurs, Besoin exprimé, Historique de la relation.
- Entrée ajoutée à `clients.yaml` de skeam-ops : `slug`, `nom`, `depot`, `statut: prospect`, `actif: true`.
- Section Todoist `Client · <nom>` dans le projet SKEAM.

## Étapes

### 1. Préparer et vérifier l'existant

1. Étape 0 de `skills/commun.md`.
2. Rassembler les entrées. Vérifier le slug contre le motif du contrat.
3. Chercher le slug et le dépôt dans `clients.yaml`. S'ils y sont déjà, passer en **mode reprise**, voir Idempotence.

### 2. Rechercher l'entreprise au registre public

Seulement si Théo a donné un SIREN ou une raison sociale.

```sh
curl -sS "https://recherche-entreprises.api.gouv.fr/search?q=<siren ou raison sociale>&per_page=5"
```

- Si le shell n'a pas accès au réseau, faire la même requête avec l'outil de lecture web du chat. Si rien ne répond, continuer sans registre et l'indiquer dans le compte rendu.
- Avec un SIREN : ne retenir que le résultat dont `siren` est identique. Avec une raison sociale : présenter au plus cinq candidats, SIREN, nom, commune, et laisser Théo choisir ou refuser ; ne jamais choisir à sa place.
- Correspondance des champs :

  | Registre | client.yaml ou fiche |
  |---|---|
  | `siren` | `siren`, entre guillemets |
  | `nom_raison_sociale`, sinon `nom_complet` | `raison_sociale` |
  | `siege.numero_voie`, `siege.type_voie`, `siege.libelle_voie` | `adresse.rue` |
  | `siege.code_postal` | `adresse.code_postal`, entre guillemets |
  | `siege.libelle_commune` | `adresse.ville` |
  | France pour un siège en France | `adresse.pays` |
  | `activite_principale`, `tranche_effectif_salarie`, `date_creation` | fiche, section Entreprise |

- Un champ vide au registre reste `null`. Si le registre contredit une indication de Théo, garder l'indication de Théo et signaler l'écart.
- Noter la source dans `client.yaml` par un commentaire YAML sur la ligne de `siren` : `# registre : recherche-entreprises.api.gouv.fr, consulté le AAAA-MM-JJ`.

### 3. Dépôt GitHub

1. `git ls-remote https://github.com/<dépôt>.git` pour savoir si le dépôt existe et est accessible.
2. Dépôt accessible : le cloner, étape 0 de `skills/commun.md`.
3. Dépôt absent ou inaccessible :
   - si un outil de création de dépôt GitHub est disponible dans le chat, proposer par question la création d'un dépôt **privé** `<dépôt>` ; après `Valider`, le créer puis le cloner ;
   - sinon, demander à Théo de créer le dépôt privé et de l'attacher à la conversation, puis attendre sa réponse. Ne rien écrire ailleurs en attendant.

### 4. Créer le dossier projet

```sh
cd "$RACINE/skeam-ops"
python3 scripts/nouveau_dossier.py <slug> "<nom>" ../<nom du dépôt> --depot <dépôt>
```

| Code | Conduite |
|---|---|
| 0 | Continuer. |
| 1 avec `existe déjà` | Mode reprise : ne pas toucher à `projet/`, sauter à l'étape 6. |
| 1 autre | Montrer la sortie d'erreur à Théo et s'arrêter. |
| 2 | Slug, nom ou dépôt invalide : corriger l'entrée avec Théo et relancer. |

### 5. Compléter client.yaml, fiche.md et CLAUDE.md

1. `client.yaml` : remplir les champs de la section Sorties. `statut: prospect`. Rien d'autre.
2. `fiche.md`, audience commercial : quatre sections du plan recommandé, rédigées seulement à partir des indications de Théo et du registre.
   - Entreprise : raison sociale, activité, effectif, commune, avec la source registre en fin de paragraphe.
   - Interlocuteurs : une puce par contact.
   - Besoin exprimé : les mots de Théo, reformulés sans ajout. Rien de connu : `À compléter.`
   - Historique de la relation : `- AAAA-MM-JJ : premier contact, apporté par <apporteur>.`
   - Jamais de marge, de tarif, de temps ni d'estimation.
3. `CLAUDE.md` à la racine du dépôt client : le créer avec la ligne `@projet/CLAUDE-projet.md` s'il n'existe pas ; sinon ajouter cette ligne en fin de fichier si elle manque.
4. `python3 scripts/validate.py ../<nom du dépôt>/projet` : code 0 exigé.

### 6. Section Todoist

1. `find-sections` dans le projet `6h6qfvrgr83M56Gq` avec `searchText` égal au nom de section `Client · <nom>`.
2. Une section de nom exactement identique existe : la réutiliser, aucune création.
3. Sinon, la création est proposée à l'étape 7.

### 7. Validation unique

Présenter le récapitulatif complet : dépôt, contenu de `client.yaml`, texte de `fiche.md`, entrée de registre, section Todoist. Puis une seule question à choix multiples avec au plus trois questions :

1. Créer la section Todoist `Client · <nom>` : `Valider`, `Annuler`. Omise si la section existe.
2. Committer et pousser le dossier projet sur `<dépôt>` : `Valider`, `Modifier`, `Annuler`.
3. Ajouter `<slug>` au registre `clients.yaml` et pousser skeam-ops : `Valider`, `Annuler`.

### 8. Exécuter, dans cet ordre

1. Section Todoist : `add-sections` avec `name: Client · <nom>` et `projectId: 6h6qfvrgr83M56Gq`. Écrire `todoist.projet_id: "6h6qfvrgr83M56Gq"` et `todoist.section_id` entre guillemets dans `client.yaml`, puis revalider. En cas d'échec, laisser `section_id: null` et le signaler.
2. Dépôt client : commit `projet: nouveau-client <slug>` avec `projet/` et `CLAUDE.md`, puis push, selon `skills/commun.md` section 6.
3. Registre : ajouter l'entrée en fin de liste de `clients.yaml`, puis

   ```sh
   python3 scripts/validate.py --clients clients.yaml
   git add clients.yaml && git commit -m "registre: ajout du client <slug>" && git pull --rebase && git push
   ```

   Si `main` refuse le push, pousser une branche `registre-<slug>` et demander à Théo d'ouvrir la pull request.

### 9. Compte rendu

Selon `skills/commun.md` section 8. Suggérer `/import-transcript` pour la première réunion enregistrée.

## Garde-fous

- Aucun champ de `client.yaml` ou de `fiche.md` sans source : Théo ou registre. Le reste vaut `null` ou `À compléter.`
- Jamais de dépôt public. Jamais de création de dépôt, de section ou de commit sans `Valider`.
- `statut` vaut toujours `prospect` à la création, quoi qu'en dise une autre source.
- Aucune autre écriture dans skeam-ops que l'entrée de `clients.yaml`.
- Aucun message au client.

## Idempotence

Chaque étape vérifie son état avant d'agir ; relancer la commande complète ce qui manque sans rien dupliquer.

| Élément | Déjà présent si | Conduite |
|---|---|---|
| Dépôt | `git ls-remote` répond | cloner, ne pas créer |
| Dossier projet | `projet/` existe dans le clone | ne pas relancer `nouveau_dossier.py`, ne réécrire aucun champ déjà rempli sans accord |
| Section Todoist | section de même nom dans le projet SKEAM, ou `todoist.section_id` renseigné | réutiliser ; vérifier par `fetch-object` que l'id existe encore |
| Registre | slug ou dépôt présent dans `clients.yaml` | ne rien ajouter ; signaler un écart de `nom`, `depot` ou `statut` |
| `CLAUDE.md` | la ligne `@projet/CLAUDE-projet.md` y figure | ne rien ajouter |

## Cas d'erreur

| Cas | Conduite |
|---|---|
| Slug déjà pris par un autre client | Proposer un autre slug ; ne jamais réutiliser celui d'un autre client. |
| Registre injoignable ou SIREN inconnu | Continuer sans registre ; `raison_sociale`, `siren`, `adresse` restent `null` ; à signaler. |
| SIREN donné par Théo qui ne fait pas 9 chiffres | Le redemander ; ne rien écrire. |
| Dépôt non attaché à la conversation | Demander à Théo de l'attacher ; s'arrêter. |
| Validation en échec après remplissage | Corriger le champ fautif ; sinon annuler la modification et le dire. |
| Push refusé | `skills/commun.md` section 6. |
