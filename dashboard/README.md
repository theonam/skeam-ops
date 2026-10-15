# Dashboard

Propriétaire : chantier dashboard, branche `feat/dashboard`, agent `ops-dashboard`, ids OPS-401 à OPS-499.

Vue de pilotage de tous les projets en parallèle : ce qui bloque, ce qui dérape, ce que Théo doit faire, puis le portefeuille et le détail par projet. Trois vues, une par audience de CONTRAT.md section 10 : `interne` pour Théo, `commercial` pour l'associé commercial, `client` pour un client.

## Contenu

| Chemin | Rôle |
|---|---|
| `scripts/agreger.py` | interface CONTRAT.md section 11.5 : registre et clones vers `out/<audience>.json` |
| `scripts/rendre.py` | injecte une vue JSON dans `template.html` : une page HTML autonome |
| `template.html` | gabarit de la page, sans dépendance hors polices Google Fonts, clair et sombre, lisible sur téléphone |
| `artefacts.yaml` | URL des artefacts claude.ai publiés, une par vue, pour garder le même lien |
| `skills/dashboard/SKILL.md` | commande `/dashboard` |
| `skills/calibrer/SKILL.md` | commande `/calibrer` |
| `tests/` | tests et données fictives : clients `alpha` et `beta`, client inactif `gamma`, projet `ops` |
| `PROPOSITIONS-CONTRAT.md` | évolutions du contrat proposées à Théo |
| `out/` | sorties générées, non versionnées |

## Usage

Depuis la racine de skeam-ops, les clones des dépôts clients rangés dans `<racine>` :

```sh
python dashboard/scripts/agreger.py --clients clients.yaml --racine <racine> --audience interne --sortie dashboard/out/interne.json
python dashboard/scripts/rendre.py dashboard/out/interne.json --sortie dashboard/out/interne.html
python dashboard/scripts/rendre.py dashboard/out/client.json --sortie dashboard/out/client-egm.html --projet egm
python -m unittest discover -s dashboard/tests -p "test_*.py"
```

`agreger.py` valide le registre et chaque dossier projet avec `scripts/validate.py` avant toute lecture, liste toutes les erreurs sur la sortie d'erreur et s'arrête alors avec le code 1 sans rien écrire ; les avertissements du validateur sont ignorés. Il ne lit jamais `projet/interne/`. Avant d'écrire une vue `commercial` ou `client`, il vérifie qu'aucune clé interne n'y figure et refuse d'écrire sinon.

`rendre.py --projet` ne garde qu'un projet de la vue client, pour qu'un client ne voie jamais les autres. Il est refusé, code 2, sur les autres vues, dont les totaux portent sur tout le portefeuille.

## Périmètre lu

- Chaque client `actif: true` de `--clients`, dans `<racine>/<nom du dépôt>/projet`. Un client actif sans clone est une erreur.
- skeam-ops lui-même, projet interne slug `ops` : le dossier `projet/` du répertoire courant, sauf si le registre déclare déjà un projet `ops`. Absent ou d'un autre slug, il est ignoré avec un avertissement sur la sortie d'erreur. Il n'apparaît que dans la vue interne.

## Règles de calcul

Date de référence : date du jour à Paris. Semaine : du lundi au dimanche qui la contiennent.

| Indicateur | Règle |
|---|---|
| Avancement d'un lot | items `fait` divisés par les items du lot hors `abandonne` et hors `a_valider: true`, toutes audiences confondues, pourcentage entier arrondi à l'inférieur, CONTRAT.md section 10 ; null si le lot n'a aucun item compté |
| Heures estimées d'un lot | somme des `estimation_h` des items comptés dans l'avancement |
| Heures réelles d'un item ou d'un lot | somme des `minutes` de toutes ses lignes de temps, validées ou non, divisée par 60 |
| Dépassement | heures réelles supérieures de plus de 20 % aux heures estimées, par lot et par item hors `abandonne` |
| Item bloqué | statut `a_faire` ou `en_cours` avec au moins une dépendance `externe: ...` |
| En cours depuis plus de 7 jours | statut `en_cours` et `maj` antérieure de plus de 7 jours à la date de référence |
| Action ouverte | statut `ouverte` ; seules les priorités `p1` et `p2` sont listées |
| Prochaine échéance | la plus proche des échéances d'actions ouvertes, toutes priorités, retards compris, et de `dates.mise_en_service` si elle est à venir ; la vue commercial ne retient que la mise en service |
| Dernière synthèse | fichier de `syntheses/` au nom le plus récent : date, titre de niveau 1 et texte de la section Résumé exécutif |
| Charge de la semaine | lignes de temps datées de la semaine, par projet, séparées entre `theo` et les agents |
| Total signé | somme des `build_signe` et `options_signees` des projets lus ; run annuel : somme des `run_annuel` |

## Format de sortie

Enveloppe du contrat : `audience`, `genere_le` en ISO 8601 avec décalage, `projets`. Montants en euros HT, heures en heures décimales arrondies au centième, dates `AAAA-MM-JJ`.

### Vue interne

```text
audience, genere_le
date_ref                          date de référence
semaine                           debut, fin
global
  total_signe_ht, run_annuel_ht, nb_clients
  portefeuille[]                  statut, nb_clients, montant_signe_ht ; clients seuls, ops exclu
  charge_semaine                  total_h, total_theo_h, total_agents_h,
                                  par_projet[] : slug, nom, heures, heures_theo, heures_agents, heures_semaine_precedente
  alertes[]                       gravite haute|moyenne|basse, type, slug, nom, cible, message
  a_faire[]                       type action|recette|devis|validation, slug, nom, id, titre, priorite, echeance, en_retard
projets[]
  slug, nom, type client|interne, statut, apporteur, dates, prochaine_echeance,
  montants_ht, montant_signe_ht, devis[] : objet, montant_ht, statut,
  liens                           les six liens de client.yaml
  lots[]                          lot, pourcentage, nb_items, nb_faits, heures_estimees, heures_reelles, ecart_pct, depassement
  items_en_cours_anciens[]        id, titre, lot, maj, jours
  items_bloques[]                 id, titre, lot, statut, dependances_externes[]
  items_a_valider[], items_a_recetter[]   id, titre, lot, statut
  actions[]                       id, titre, contexte, priorite, points, echeance, en_retard ; p1 et p2 ouvertes
  temps                           semaine_h, semaine_theo_h, semaine_agents_h, semaine_precedente_h, total_h, hors_item_h, a_relire_h
  derniere_synthese               date, titre, fichier, resume ; ou null
  items[]                         id, titre, lot, statut, priorite, maj, module, taille, estimation_h,
                                  heures_reelles, audience, a_valider, dependances_externes[]
```

`prochaine_echeance` vaut null ou `date`, `libelle`, `source` id d'action ou `client.yaml`, `en_retard`, `dans_jours`.

Types d'alerte : `depassement_lot` et `depassement_item` haute, `action_en_retard` haute, `bloque_externe` moyenne, `en_cours_ancien` moyenne, `registre_desynchronise` basse quand le statut de `clients.yaml` diffère de celui de `client.yaml`, qui fait foi.

`a_faire` liste dans cet ordre les actions p1 et p2, retards d'abord, les items `a_recetter` que Théo seul passe à `fait`, les devis en `brouillon` à envoyer, les items `a_valider`.

### Vue commercial

Clients seulement, jamais de temps, d'estimation, de tarif, de marge, d'action ni de dépendance.

```text
audience, genere_le, date_ref
global
  total_signe_ht, run_annuel_ht, nb_clients, portefeuille[]
  alertes[]                       en_cours_ancien seulement, sur les items visibles
projets[]
  slug, nom, type, statut, apporteur, dates, prochaine_echeance, montants_ht, montant_signe_ht,
  devis[] : objet, montant_ht, statut
  liens                           demo, prod, docs_client, docs_commercial
  lots[]                          lot, pourcentage ; lots ayant au moins un item visible
  items_en_cours_anciens[]        sur les items visibles
  derniere_synthese
  items[]                         id, titre, lot, statut, priorite, maj, module ; audiences commercial et client, hors a_valider
```

### Vue client

```text
audience, genere_le
projets[]
  slug, nom, statut
  liens                           demo, prod, docs_client
  lots[]                          lot, pourcentage
  items[]                         id, titre, lot, statut, priorite, maj ; audience client, hors a_valider
```

La vue client agrège tous les clients : elle ne se publie jamais telle quelle, mais projet par projet avec `rendre.py --projet`.

## artefacts.yaml

Clé racine `artefacts`, dictionnaire d'une clé par vue publiée vers son URL claude.ai ou null : `interne`, `commercial`, et `client-<slug>` pour la vue d'un client. Écrit par `/dashboard` après accord de Théo.
