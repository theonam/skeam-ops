# Contrat des formats SKEAM

Ce document fixe les formats et les interfaces communs à tous les chantiers de skeam-ops et à tous les dépôts clients. Il est la référence ; les schémas de `schemas/` en sont la traduction exécutable et `scripts/validate.py` les applique. En cas d'écart entre ce texte et un schéma, le signaler à Théo dans `PROPOSITIONS-CONTRAT.md`.

Seul Théo modifie `CONTRAT.md`, `schemas/` et `scripts/`. Voir le README pour la procédure de proposition.

Les exemples marqués `<!-- exemple: ... -->` sont vérifiés par `python scripts/validate.py --contrat CONTRAT.md`. Ils sont tirés du client fictif `exemples/racine/demo-app/projet`, jeu de test complet et valide.

## 1. Principes

- Le dépôt Git est la source de vérité. Documents publiés, dashboard, Todoist et devis Dougs sont des vues ou des sorties générées depuis le dépôt.
- Tout se déclenche par une commande manuelle, sauf le relevé de consommation des agents, écrit par un crochet Git au moment des commits, section 15. Aucun script n'envoie quoi que ce soit à un client : un devis Dougs reste à l'état de brouillon tant que Théo ne l'envoie pas lui-même.
- Documents en français. Clés techniques, noms de fichiers et valeurs énumérées en français sans accents ou en anglais, exactement comme écrits ici.

## 2. Conventions générales

| Sujet | Règle |
|---|---|
| Encodage | UTF-8, fins de ligne LF, ligne finale terminée par un saut de ligne. |
| Dates | ISO 8601 `AAAA-MM-JJ`, date du calendrier de Paris. |
| Heures | `HH:MM` sur 24 heures, heure locale de Paris, relevée avec `TZ=Europe/Paris date`. |
| Montants | Euros hors taxes, nombre positif ou nul, 2 décimales au plus. |
| Slug | Minuscules et chiffres, sans tiret, 2 à 12 caractères, commence par une lettre : `egm`, `ops`. |
| Préfixe | Le slug en majuscules : `EGM`, `OPS`. |
| Id d'item | Préfixe, tiret, numéro sur 3 chiffres : `EGM-012`. Unique dans le dossier projet. |
| Id d'action | `ACT-`, préfixe, tiret, numéro sur 3 chiffres : `ACT-EGM-003`. |
| Code de module | kebab-case : `pointage`, `export-paie`. |
| Nom d'agent | kebab-case. Agent de développement d'un client : `<slug>-dev`. Théo : `theo`. Chantiers de skeam-ops : `ops-socle`, `ops-catalogue`, `ops-cadrage`, `ops-dashboard`. |
| Dépôt | `proprietaire/nom` : `theonam/egm-app`. |
| Clone | Le clone du dépôt `proprietaire/nom` se trouve dans `<racine>/nom`, et son dossier projet dans `<racine>/nom/projet`. |

### 2.1 YAML

Le YAML est lu en sous-ensemble strict par `scripts/contrat.py`, fonction `charger_yaml`. Tout script qui lit un fichier du contrat utilise cette fonction ou reproduit exactement ses règles :

- les dates écrites sans guillemets restent des chaînes `AAAA-MM-JJ` ;
- seuls `true` et `false` sont des booléens ; `yes`, `no`, `on`, `off` sont des chaînes, donc refusés là où un booléen est attendu ;
- `null`, `~` ou une valeur vide valent null ;
- un nombre s'écrit `12` ou `12.5` ; une suite de chiffres qui doit rester une chaîne s'écrit entre guillemets : siren, code postal, ids Todoist ;
- une clé en double est une erreur ;
- toutes les clés listées sont obligatoires, sauf mention contraire ; une valeur inconnue vaut `null` quand le champ l'autorise ;
- aucune clé hors contrat n'est admise.

### 2.2 Markdown

Titres ATX uniquement, `#` à `######` suivis d'une espace. Les titres situés dans un bloc de code ou dans un commentaire HTML `<!-- -->` sont ignorés. Le validateur réduit chaque document à une projection JSON, décrite dans son schéma : en-tête YAML, titre de niveau 1, liste ordonnée des titres de niveau 2 et, selon le document, quelques éléments structurés.

### 2.3 Typographie des contenus destinés au client

Dans tout contenu destiné au client : ni tiret cadratin `—`, ni parenthèse `(` `)`. Le validateur contrôle :

- `cadrage.md` et `syntheses/*.md`, hors en-tête, commentaires HTML, blocs de code, code en ligne et cibles de liens Markdown ;
- titre et critères d'acceptation des items d'audience `client` ;
- objet, titres et descriptions des lignes de chiffrage.

Le reste du dépôt peut employer des parenthèses, mais l'usage est de s'en passer aussi.

## 3. Dossier projet

Chaque dépôt client porte à sa racine un dossier `projet/`. skeam-ops porte le sien, slug `ops`. Arborescence exacte, aucun autre élément admis à la racine de `projet/` hors fichiers cachés :

```text
projet/
  client.yaml                      fiche structurée, section 4
  fiche.md                         fiche lisible, section 9.5
  transcripts/AAAA-MM-JJ-sujet.md  transcripts bruts, section 9.1
  syntheses/AAAA-MM-JJ-sujet.md    comptes rendus, section 9.2
  cadrage.md                       document de cadrage, section 9.3
  backlog/<nom>.yaml               un ou plusieurs fichiers d'items, section 5
  decisions.md                     journal des décisions, section 9.4
  actions.yaml                     actions personnelles de Théo, section 7
  temps/AAAA-MM-<agent>.jsonl      journal de temps, section 6
  devis/                           chiffrages générés, section 11
  design/                          maquettes, captures, charte ; libre
  interne/                         marges et notes ; jamais publié, jamais lu par un script
  CLAUDE-projet.md                 consignes pour les agents, section 13
```

Règles de nommage :

- `sujet` : kebab-case en minuscules sans accents, ex. `2026-10-08-lancement.md`. La date du nom est celle de la réunion et égale le champ `date` de l'en-tête.
- `backlog/<nom>.yaml` : kebab-case ; le découpage en fichiers est libre, par lot ou par chantier. Le champ `lot` fait foi, pas le nom du fichier. Au moins un fichier.
- `temps/AAAA-MM-<agent>.jsonl` : un fichier par mois et par agent ; toutes les lignes ont ce mois pour `date` et cet agent pour `agent`.
- Dossiers vides conservés par un fichier `.gitkeep`.

Le gabarit `templates/dossier-client/` est un dossier projet valide ; `scripts/nouveau_dossier.py` le copie.

Hors de `projet/`, le dépôt porte `.skeam/`, relevé de consommation des agents, section 15 ; son gabarit est `templates/depot-client/`.

## 4. client.yaml

Schéma : `schemas/client.schema.json`.

| Clé | Type et valeurs |
|---|---|
| `slug` | slug |
| `nom` | texte : nom d'usage |
| `raison_sociale` | texte ou null |
| `siren` | chaîne de 9 chiffres ou null |
| `adresse` | null ou `rue`, `code_postal` sur 5 chiffres, `ville`, `pays` ; mêmes champs que l'adresse client Dougs |
| `contacts` | liste de `nom` texte, `role` texte ou null, `email` ou null, `tel` au format `+33 6 12 34 56 78` ou null |
| `statut` | `prospect`, `cadrage`, `devis_envoye`, `signe`, `en_dev`, `recette`, `run`, `clos` |
| `apporteur` | `theo`, `jonathan`, `autre` |
| `dates` | `premier_contact`, `cadrage`, `signature`, `mise_en_service` : date ou null |
| `montants_ht` | `build_signe`, `options_signees`, `run_annuel` : montant, 0 par défaut |
| `devis` | liste de `dougs_id` UUID du devis Dougs, `objet` texte, `montant_ht`, `statut` parmi `brouillon`, `envoye`, `accepte`, `refuse` ; facultatifs : `perimetre` et `factures`, voir ci-dessous |
| `liens` | `depot` dépôt ou null ; `demo`, `prod`, `docs_interne`, `docs_commercial`, `docs_client` : URL `https://` ou null |
| `todoist` | `projet_id`, `section_id` : chaîne ou null |

Correspondance des statuts de devis avec Dougs : `brouillon` DRAFT, `envoye` PENDING, `accepte` ACCEPTED, `refuse` REFUSED.

Périmètre et factures d'un devis, décision de Théo du 2026-10-16 :

| Clé | Type et valeurs |
|---|---|
| `perimetre` | `lots` : liste de numéros de lot ; `items` : liste d'ids d'items. Un item cité dans les `items` d'un devis lui appartient ; tout autre item appartient au devis dont les `lots` contiennent son lot. Lots et items existent dans le backlog ; un item ou un lot n'est cité que par un seul devis |
| `factures` | liste de `dougs_id` UUID de la facture Dougs, `numero` texte ou null, `montant_ht`, `statut` parmi `brouillon`, `envoyee`, `payee`, `annulee`, `echeance` date ou null |

Correspondance des statuts de facture avec Dougs : `brouillon` brouillon de facture, `envoyee` facture finalisée en attente de paiement, `payee` paid, `annulee` canceled. Une facture `envoyee` dont l'`echeance` est passée est en retard. `/skeam-chiffrage` tient `perimetre` à la création du devis et rafraîchit `factures` avec les statuts des devis.

<!-- exemple: client -->
```yaml
slug: demo
nom: Démo Bâtiment
raison_sociale: Démo Bâtiment SARL
siren: "123456789"
adresse:
  rue: 1 rue de l'Exemple
  code_postal: "69003"
  ville: Lyon
  pays: France
contacts:
  - nom: Claire Martin
    role: Gérante
    email: claire.martin@demo-batiment.example
    tel: "+33 6 12 34 56 78"
statut: en_dev
apporteur: jonathan
dates:
  premier_contact: 2026-09-01
  cadrage: 2026-10-08
  signature: 2026-10-14
  mise_en_service: null
montants_ht:
  build_signe: 6300
  options_signees: 0
  run_annuel: 1200
devis:
  - dougs_id: 3f2b6c1e-8a4d-4c2b-9e7f-1a2b3c4d5e6f
    objet: Application de gestion Démo Bâtiment, lots 0 et 1 et maintenance
    montant_ht: 7500
    statut: accepte
    perimetre:
      lots: [0, 1]
      items: []
    factures:
      - dougs_id: 9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d
        numero: 2026-10-FAC-1
        montant_ht: 3750
        statut: payee
        echeance: 2026-11-13
liens:
  depot: skeam-exemple/demo-app
  demo: https://demo-app.example/demo
  prod: null
  docs_interne: null
  docs_commercial: null
  docs_client: null
todoist:
  projet_id: "6Jf8VQXxpwv56VQ7"
  section_id: null
```

## 5. Item de backlog

Schéma : `schemas/backlog.schema.json`. Un fichier de backlog a pour seule clé racine `items`, liste d'items, éventuellement vide : `items: []`.

| Clé | Type et valeurs |
|---|---|
| `id` | id d'item, préfixe du projet |
| `titre` | texte |
| `module` | code du catalogue, ou `null` pour un item hors catalogue, tous les items de skeam-ops par exemple |
| `lot` | entier positif ou nul ; 0 pour la démo |
| `priorite` | `indispensable`, `souhaitable`, `optionnel` |
| `statut` | `a_faire`, `en_cours`, `a_recetter`, `fait`, `abandonne` |
| `taille` | `XS`, `S`, `M`, `L`, `XL` |
| `estimation_h` | nombre strictement positif |
| `dependances` | liste sans doublon d'ids du même projet ou de chaînes `"externe: description"` ; entre guillemets en YAML à cause des deux points |
| `criteres_acceptation` | liste d'au moins un texte ; une règle de gestion se cite `RGn` |
| `audience` | `interne`, `commercial`, `client` : niveau minimal pour voir l'item, section 10 |
| `a_valider` | booléen, toujours `false` : champ conservé pour compatibilité, sans effet depuis le 2026-10-16, décision de Théo ; un item ajouté par un agent est un item comme les autres |
| `commit` | hash Git en minuscules, 7 à 40 caractères, du dernier commit de code lié, ou null |
| `maj` | date de dernière modification de l'item |
| `notes` | facultatif : texte ou null |
| `prix_vente_ht` | facultatif : montant HT proposé au client pour cette fonctionnalité vendue à part, hors devis signé, ou null ; décision de Théo du 2026-10-16 |

Règles vérifiées par le validateur :

- ids uniques sur tous les fichiers du backlog, préfixe égal au slug en majuscules ;
- dépendances existantes, sans boucle ni dépendance à soi-même ;
- avertissement si `a_valider` vaut `true` ;
- avertissement si un item `a_recetter` ou `fait` n'a pas de `commit`, si un module est absent du catalogue, ou si un critère cite une règle absente de `cadrage.md`.

Cycle de vie, positionné par l'agent : `a_faire` puis `en_cours`, puis `a_recetter` quand le développement est livré, puis `fait` quand l'agent a vérifié lui-même chaque critère d'acceptation, par un test automatique ou dans l'application. Théo ne recette pas chaque item ; il teste l'application de temps en temps et peut rouvrir un item `fait` en le repassant `en_cours`. `abandonne` est positionné par Théo seul.

<!-- exemple: backlog -->
```yaml
items:
  - id: DEMO-003
    titre: Saisie du pointage journalier par compagnon
    module: pointage
    lot: 1
    priorite: indispensable
    statut: en_cours
    taille: M
    estimation_h: 6
    dependances:
      - DEMO-001
      - DEMO-002
      - "externe: liste des compagnons fournie par le client"
    criteres_acceptation:
      - Un compagnon saisit ses heures du jour en moins de 30 secondes sur téléphone.
      - Une journée au-delà de 10 heures est refusée, conformément à RG2.
    audience: client
    a_valider: false
    commit: null
    maj: 2026-10-15
  - id: DEMO-006
    titre: Purge des liens de connexion expirés
    module: null
    lot: 1
    priorite: souhaitable
    statut: a_faire
    taille: XS
    estimation_h: 1
    dependances:
      - DEMO-001
    criteres_acceptation:
      - Les liens expirés depuis plus de 24 heures sont supprimés chaque nuit.
    audience: interne
    a_valider: false
    commit: null
    maj: 2026-10-15
    notes: Besoin découvert par demo-dev pendant DEMO-003.
```

## 6. Ligne de temps

Schéma : `schemas/temps.schema.json`, appliqué à chaque ligne. Fichier JSON Lines : un objet JSON compact par ligne, clés dans l'ordre ci-dessous, aucune ligne vide, ajout en fin de fichier uniquement.

| Clé | Type et valeurs |
|---|---|
| `date` | date du début de la session |
| `debut`, `fin` | heure `HH:MM` |
| `minutes` | entier de 1 à 1440, exactement `fin` moins `debut` ; si `fin` précède `debut`, la session a passé minuit et garde la date de son début |
| `item` | id d'item du projet, ou null pour du temps hors item : réunion, administratif |
| `source` | `claude-code` ou `theo` ; `theo` si et seulement si `agent` vaut `theo` |
| `agent` | nom d'agent, identique à celui du nom de fichier |
| `note` | chaîne, éventuellement vide |
| `valide` | booléen ; `false` à l'écriture, passé à `true` par Théo quand il relit la semaine |

Une seule ligne par agent, date et heure de début.

<!-- exemple: temps -->
```json
{"date":"2026-10-15","debut":"20:10","fin":"21:05","minutes":55,"item":"EGM-012","source":"claude-code","agent":"egm-dev","note":"","valide":false}
{"date":"2026-10-15","debut":"23:20","fin":"00:35","minutes":75,"item":"DEMO-003","source":"claude-code","agent":"demo-dev","note":"Session passée minuit","valide":false}
{"date":"2026-10-08","debut":"14:00","fin":"15:30","minutes":90,"item":null,"source":"theo","agent":"theo","note":"Réunion de lancement","valide":true}
```

## 7. Action

Schéma : `schemas/actions.schema.json`. `actions.yaml` contient les actions personnelles de Théo ; clé racine `items`.

| Clé | Type et valeurs |
|---|---|
| `id` | id d'action, préfixe du projet |
| `titre` | texte |
| `contexte` | texte : d'où vient l'action et pourquoi elle remonte |
| `priorite` | `p1` à `p4`, `p1` la plus urgente, comme affiché dans Todoist |
| `points` | `1pt`, `2pt`, `3pt`, `5pt`, `8pt` : étiquette d'effort Todoist |
| `echeance` | date ou null |
| `statut` | `ouverte`, `faite`, `annulee` |
| `todoist_id` | chaîne ou null ; écrit par `/skeam-sync-todoist` |
| `source` | `manuel`, un id d'item existant, ou un fichier existant relatif à `projet/` : `transcripts/...md`, `syntheses/...md`, `cadrage.md`, `decisions.md` |

<!-- exemple: actions -->
```yaml
items:
  - id: ACT-DEMO-001
    titre: Obtenir la liste des compagnons
    contexte: Dépendance externe de DEMO-003, demandée à Claire Martin en réunion de lancement.
    priorite: p2
    points: 1pt
    echeance: 2026-10-20
    statut: ouverte
    todoist_id: "6Jf8VR2xqxJ5Gm3P"
    source: syntheses/2026-10-08-lancement.md
```

## 8. Catalogue

Propriété du chantier catalogue, format fixé ici. Audience interne.

### 8.1 catalogue/modules.yaml

Schéma : `schemas/catalogue-modules.schema.json`. Clé racine `modules`.

| Clé | Type et valeurs |
|---|---|
| `code` | code de module, unique |
| `nom`, `description` | texte |
| `taille_type` | taille |
| `heures_min`, `heures_max` | nombres strictement positifs, `heures_min` inférieur ou égal à `heures_max` |
| `confiance` | `faible`, `moyenne`, `forte` |
| `mesures` | liste de `client` slug, `item` id d'item de ce client, `heures` nombre strictement positif ; un couple client et item n'apparaît qu'une fois dans tout le catalogue |
| `prix_conseille_ht` | montant du module, ou null tant qu'il n'est pas calculé |

`prix_conseille_ht` est un attribut du module, pas de la mesure.

<!-- exemple: modules -->
```yaml
modules:
  - code: authentification
    nom: Authentification et comptes
    description: Connexion sans mot de passe par lien SMS ou courriel, gestion des comptes et des profils.
    taille_type: S
    heures_min: 3
    heures_max: 6
    confiance: moyenne
    mesures:
      - client: demo
        item: DEMO-001
        heures: 3
    prix_conseille_ht: 450
```

### 8.2 catalogue/tarifs.yaml

Schéma : `schemas/catalogue-tarifs.schema.json`. Audience interne uniquement.

| Clé | Type et valeurs |
|---|---|
| `taux_horaire_cible` | euros HT par heure, strictement positif |
| `marge_securite` | `XS`, `S`, `M`, `L`, `XL`, tous présents : fraction de 0 à 1 ajoutée à l'estimation ; `0.2` signifie plus 20 % |
| `plancher_ht` | montant HT minimal d'un chiffrage complet |

<!-- exemple: tarifs -->
```yaml
taux_horaire_cible: 90
marge_securite:
  XS: 0.1
  S: 0.15
  M: 0.2
  L: 0.25
  XL: 0.3
plancher_ht: 1500
```

## 9. Documents Markdown

### 9.1 Transcript

Schéma de l'en-tête : `schemas/transcript.schema.json`. Le fichier commence par un en-tête YAML entre deux lignes `---` ; le corps est le transcript brut, libre.

| Clé | Type et valeurs |
|---|---|
| `date` | date de la réunion, égale à celle du nom de fichier |
| `participants` | liste d'au moins un nom |
| `source` | `plaud` enregistrement Plaud, `visio` export Teams, Meet ou Zoom, `manuel` notes saisies |
| `plaud_id` | identifiant Plaud si `source` vaut `plaud`, null sinon |

<!-- exemple: transcript -->
```markdown
---
date: 2026-10-08
participants:
  - Théo Namor
  - Claire Martin
source: plaud
plaud_id: f3a9c2e1b7d4
---

Théo : Bonjour à tous, l'objectif aujourd'hui c'est de caler le périmètre de la démo.
Claire : Pour nous le plus urgent c'est le pointage.
```

### 9.2 Synthèse

Schéma de la projection : `schemas/synthese.schema.json`. Document destiné au client, section 2.3.

- En-tête : les quatre clés du transcript plus `transcript`, chemin relatif à `projet/` d'un transcript existant, ou null si la synthèse ne vient pas d'un transcript.
- Un titre de niveau 1, libre, avant tout autre titre.
- Exactement cinq titres de niveau 2, dans cet ordre : `Résumé exécutif`, `Faits établis`, `Actions`, `Détail par sujet`, `Zones d'incertitude`, apostrophe droite. Sous-titres de niveau 3 et plus libres.
- Usage recommandé dans Actions : une puce par action, `- **Porteur** : action, échéance AAAA-MM-JJ`. Les actions de Théo sont reportées dans `actions.yaml` avec cette synthèse pour `source`.

<!-- exemple: synthese -->
```markdown
---
date: 2026-10-08
participants:
  - Théo Namor
  - Claire Martin
source: plaud
plaud_id: f3a9c2e1b7d4
transcript: transcripts/2026-10-08-lancement.md
---

# Réunion de lancement Démo Bâtiment

## Résumé exécutif

Le pointage des heures est la priorité du client.

## Faits établis

- Les heures sont aujourd'hui relevées sur papier puis ressaisies.

## Actions

- **Claire Martin** : envoyer la liste des compagnons, échéance 2026-10-20.

## Détail par sujet

### Connexion

Connexion par lien reçu par SMS, sans mot de passe.

## Zones d'incertitude

- Format attendu par le cabinet de paie.
```

### 9.3 Cadrage

Schéma de la projection : `schemas/cadrage.schema.json`. Document destiné au client, section 2.3. Pas d'en-tête YAML.

- Un titre de niveau 1, libre.
- Exactement quatorze titres de niveau 2, dans cet ordre, sans numérotation : `Objet et statut`, `Objectifs`, `Profils et droits`, `Processus cible`, `Objets métier`, `Règles de gestion`, `Exigences`, `Données et reprise`, `Intégrations`, `Découpage en lots`, `Décisions`, `Questions ouvertes`, `Attendus du client`, `Sources`.
- Dans Règles de gestion, une règle par puce, au format exact `- **RGn** : énoncé`, numérotées à partir de RG1 sans trou ni doublon. Une règle n'est jamais renumérotée : une règle supprimée garde son numéro avec l'énoncé `abrogée`.

<!-- exemple: cadrage -->
```markdown
# Cadrage Démo Bâtiment

## Objet et statut

Cadrage de l'application de gestion de Démo Bâtiment. Version 1 du 2026-10-08, validée par le client le 2026-10-14.

## Objectifs

- Supprimer la ressaisie des feuilles d'heures papier.

## Profils et droits

- **Compagnon** : se connecte, voit ses chantiers, saisit son pointage du jour.

## Processus cible

Le compagnon saisit ses heures chaque soir sur son téléphone.

## Objets métier

- **Pointage** : compagnon, chantier, date, nombre d'heures.

## Règles de gestion

- **RG1** : un lien de connexion expire 15 minutes après son envoi.
- **RG2** : un pointage dépasse au plus 10 heures par compagnon et par jour.

## Exigences

- Application installable sur téléphone et tablette.

## Données et reprise

Pas de reprise d'historique.

## Intégrations

Export CSV pour le cabinet de paie.

## Découpage en lots

- **Lot 0** : démo, connexion et liste des chantiers.
- **Lot 1** : pointage et export paie.

## Décisions

- Connexion par lien SMS, sans mot de passe.

## Questions ouvertes

- Format exact attendu par le cabinet de paie.

## Attendus du client

- Liste des compagnons avec leur téléphone, pour le 2026-10-20.

## Sources

- syntheses/2026-10-08-lancement.md
```

### 9.4 Décisions

Schéma de la projection : `schemas/decisions.schema.json`. Pas d'en-tête YAML.

- Titre de niveau 1 exactement `Décisions`, suivi éventuellement d'un texte d'introduction.
- Une entrée par titre de niveau 2 `## AAAA-MM-JJ titre`, en ordre chronologique croissant : on ajoute en fin de fichier.
- Chaque entrée contient exactement quatre puces, dans cet ordre : `- **Décision** : texte`, `- **Raison** : texte`, `- **Impact** : texte`, `- **Source** : texte`. Une puce peut continuer sur des lignes indentées de deux espaces. Rien d'autre dans une entrée.
- `Source` : de préférence un chemin relatif à `projet/`, sinon une description de l'échange.

<!-- exemple: decisions -->
```markdown
# Décisions

## 2026-10-08 Connexion par lien SMS

- **Décision** : les compagnons se connectent par un lien reçu par SMS, sans mot de passe.
- **Raison** : les équipes terrain oublient leurs mots de passe.
- **Impact** : DEMO-001 en lot 0 ; coût des SMS à intégrer au run.
  Le prestataire SMS reste à choisir.
- **Source** : syntheses/2026-10-08-lancement.md
```

### 9.5 Fiche lisible

Schéma de la projection : `schemas/fiche.schema.json`. Audience commercial. Seul un titre de niveau 1 est imposé ; plan recommandé : `Entreprise`, `Interlocuteurs`, `Besoin exprimé`, `Historique de la relation`. Les données structurées font foi dans `client.yaml`.

<!-- exemple: fiche -->
```markdown
# Fiche client Démo Bâtiment

## Entreprise

Entreprise générale du bâtiment de 25 salariés à Lyon, apportée par Jonathan.
```

## 10. Audiences

Trois niveaux emboîtés : ce que voit `client`, `commercial` le voit ; ce que voit `commercial`, `interne` le voit. Tout script qui produit une vue pour une audience applique ce tableau ; ce qui n'y figure pas est interne.

| Donnée | interne | commercial | client |
|---|---|---|---|
| `client.yaml` : `slug`, `nom`, `statut` | oui | oui | oui |
| `client.yaml` : `raison_sociale`, `siren`, `adresse`, `contacts`, `apporteur`, `dates`, `montants_ht`, `devis` | oui | oui | non |
| `liens.demo`, `liens.prod`, `liens.docs_client` | oui | oui | oui |
| `liens.docs_commercial` | oui | oui | non |
| `liens.depot`, `liens.docs_interne`, `todoist` | oui | non | non |
| `fiche.md` | oui | oui | non |
| Items d'audience `interne` | oui | non | non |
| Items d'audience `commercial` | oui | oui | non |
| Items d'audience `client` | oui | oui | oui |
| Champs d'item `id`, `titre`, `lot`, `statut`, `priorite`, `criteres_acceptation`, `maj` | oui | oui | oui |
| Champ d'item `module` | oui | oui | non |
| Champ d'item `prix_vente_ht` | oui | oui | non |
| Champs d'item `taille`, `estimation_h`, `dependances`, `commit`, `notes`, `audience`, `a_valider` | oui | non | non |
| Avancement par lot | libre | en nombre d'items | en nombre d'items |
| `cadrage.md`, `syntheses/` | oui | oui | oui, publiés sur commande de Théo |
| `transcripts/`, `decisions.md`, `actions.yaml`, `temps/`, `devis/`, `design/`, `CLAUDE-projet.md` | oui | non | non |
| Catalogue : modules, heures, tarifs | oui | non | non |
| `interne/` | jamais lu par un script, jamais publié | non | non |
| `.skeam/conso/` : temps machine, durée réelle, jetons et coût des agents | oui | non | non |
| `dashboard/tarifs-modeles.yaml` | oui | non | non |

Avancement d'un lot pour les audiences commercial et client : nombre d'items `fait` divisé par le nombre d'items du lot hors `abandonne`, toutes audiences confondues, en pourcentage entier arrondi à l'inférieur. Il ne révèle aucune estimation.

## 11. Interfaces entre chantiers

Règles communes à tous les scripts :

- lancés depuis la racine de skeam-ops, Python 3.11 ou bash ; chemins relatifs au répertoire courant ;
- code de sortie 0 en cas de succès, 1 pour une erreur de données ou de validation, 2 pour un usage incorrect ;
- messages d'erreur sur la sortie d'erreur, en français ;
- dépendances Python communes dans `requirements.txt` ; un chantier qui a besoin d'une dépendance de plus la déclare dans `<son dossier>/requirements.txt` ;
- lecture des fichiers du contrat par `scripts/contrat.py` : `charger_yaml`, `lire_client`, `lire_items`, `lire_actions`, `lire_temps`, `lire_conso`, `separer_entete`, `chemin_clone` ;
- un script qui lit un dossier projet commence par le valider et s'arrête avec le code 1 s'il est invalide ;
- jamais de lecture de `projet/interne/`, jamais d'envoi à un client.

### 11.1 Validation, chantier commun

```sh
python scripts/validate.py <chemin_projet> [<chemin_projet> ...]
python scripts/validate.py --clients clients.yaml --racine <dossier des clones>
python scripts/validate.py --catalogue catalogue/
python scripts/validate.py --contrat CONTRAT.md
python scripts/validate.py --conso <racine du dépôt> --tarifs-modeles dashboard/tarifs-modeles.yaml
python -m unittest discover -s scripts -p "test_*.py"
```

Les options se combinent. `<chemin_projet>` est le dossier `projet/` ou la racine d'un dépôt qui le contient. Avec `--racine`, chaque client du registre est validé dans son clone, et `slug`, `statut` et `liens.depot` doivent concorder avec le registre ; un client actif sans clone est une erreur. Sans `--catalogue`, les codes de module sont comparés à `catalogue/modules.yaml` s'il existe. `--conso` accepte la racine d'un dépôt, son dossier `.skeam/conso` ou un fichier, et se répète. Sortie : une ligne `ERREUR <chemin>: <message>` ou `AVERTISSEMENT <chemin>: <message>` par écart, puis une ligne `Bilan`.

### 11.2 Nouveau dossier, chantier commun

```sh
python scripts/nouveau_dossier.py <slug> <nom> <dossier_cible> [--depot proprietaire/nom]
```

Crée `<dossier_cible>` si besoin, copie `templates/dossier-client` vers `<dossier_cible>/projet`, pré-remplit `slug`, `nom` et `liens.depot`, reporte le nom dans les titres de `fiche.md` et `cadrage.md`, valide le résultat. Refuse d'écraser un `projet/` existant, code 1. Ne touche rien hors de `projet/`.

### 11.3 Chiffrage, chantier catalogue

```sh
python catalogue/scripts/chiffrer.py <chemin_projet> --sortie <chemin_projet>/devis/
```

Produit `chiffrage-AAAA-MM-JJ.md` et `chiffrage-AAAA-MM-JJ.json`, date du jour à Paris, toujours ensemble ; un second passage le même jour remplace les deux fichiers. Le contenu du `.md` est libre et d'audience interne. Le `.json` suit `schemas/chiffrage.schema.json` :

| Clé | Type et valeurs |
|---|---|
| `slug` | slug du projet |
| `date` | date du nom de fichier |
| `objet` | texte : objet du devis Dougs, champ `subject` |
| `lignes` | au moins une ligne, voir ci-dessous |
| `total_ht` | somme des `quantite` fois `prix_unitaire_ht`, arrondie au centime |

Chaque ligne se transpose une pour une en ligne de devis Dougs, avec `isPriceWithVat` à false :

| Clé du contrat | Champ Dougs | Type et valeurs |
|---|---|---|
| `titre` | `title` | texte |
| `description` | `description` | chaîne, éventuellement vide |
| `quantite` | `quantity` | nombre strictement positif |
| `unite` | `unit` | `forfait`, `jour`, `heure`, `unité`, `mois`, `an` |
| `prix_unitaire_ht` | `unitAmount` | montant, 2 décimales au plus |
| `tva` | `vatRate` | ratio décimal comme dans Dougs : `0.2`, `0.1`, `0.055`, `0.021` ou `0` ; jamais `20` |

Objet, titres et descriptions apparaissent sur le devis : règle typographique de la section 2.3.

<!-- exemple: chiffrage -->
```json
{
  "slug": "demo",
  "date": "2026-10-12",
  "objet": "Application de gestion Démo Bâtiment, lots 0 et 1 et maintenance",
  "lignes": [
    {"titre": "Lot 0 : démo", "description": "Connexion par lien SMS et liste des chantiers en cours.", "quantite": 1, "unite": "forfait", "prix_unitaire_ht": 1800, "tva": 0.2},
    {"titre": "Lot 1 : pointage et export paie", "description": "Saisie du pointage journalier et export mensuel des heures.", "quantite": 1, "unite": "forfait", "prix_unitaire_ht": 4500, "tva": 0.2},
    {"titre": "Maintenance et hébergement", "description": "", "quantite": 12, "unite": "mois", "prix_unitaire_ht": 100, "tva": 0.2}
  ],
  "total_ht": 7500
}
```

### 11.4 Calibrage, chantier catalogue

```sh
python catalogue/scripts/calibrer.py --clients clients.yaml --racine <dossier des clones>
```

Réécrit entièrement la liste `mesures` de chaque module de `catalogue/modules.yaml`, sans toucher aux autres champs. Une mesure par item `fait` dont `module` est non nul, pour chaque client `actif` du registre : `heures` est la somme des `minutes` des lignes de temps `valide: true` de cet item, divisée par 60 et arrondie au centième ; un item sans temps validé n'a pas de mesure. Idempotent : deux passages de suite donnent le même fichier.

### 11.5 Agrégation, chantier dashboard

```sh
python dashboard/scripts/agreger.py --clients clients.yaml --racine <dossier des clones> --audience interne|commercial|client --sortie dashboard/out/<audience>.json
```

Lit chaque client `actif` du registre dans son clone et écrit un seul fichier JSON UTF-8 qui ne contient que ce que l'audience peut voir, section 10. Enveloppe minimale : `audience`, `genere_le` en date et heure ISO 8601 avec décalage, `projets` liste. Le reste du format appartient au chantier dashboard et se documente dans `dashboard/README.md`. `dashboard/out/` n'est pas versionné. En vue interne seulement, il lit aussi la consommation des agents, section 15.4, chiffrée avec `dashboard/tarifs-modeles.yaml`, option `--tarifs`.

### 11.6 Initialisation d'application, chantier socle

```sh
socle/scripts/init_app.sh <dossier_cible>
```

Initialise une application client à partir du socle dans `<dossier_cible>`, qui peut déjà contenir `.git/`, un README et `projet/`. Ne crée, ne modifie ni ne supprime rien dans `<dossier_cible>/projet/`. Refuse, code 1, d'écraser un fichier d'application existant. Crée ou complète le `CLAUDE.md` racine pour qu'il contienne la ligne `@projet/CLAUDE-projet.md`.

### 11.7 Commandes du chat

Chaque commande est une skill : un dossier `<nom>/SKILL.md` portant le nom de la commande sans barre oblique. Toutes les commandes commencent par `/skeam-`, pour se retrouver parmi les autres skills. Une commande ne fait qu'orchestrer les scripts ci-dessus et les connecteurs ; elle demande confirmation à Théo avant toute écriture hors du dépôt, et ne commite jamais sur un dépôt client sans son accord.

| Commande | Chantier et emplacement | Rôle et scripts appelés |
|---|---|---|
| `/skeam-nouveau-client` | cadrage, `skills/skeam-nouveau-client/` | `nouveau_dossier.py`, entrée dans `clients.yaml`, projet et section Todoist |
| `/skeam-import-transcript` | cadrage, `skills/skeam-import-transcript/` | transcript Plaud vers `transcripts/`, synthèse vers `syntheses/`, actions de Théo vers `actions.yaml`, puis `validate.py` |
| `/skeam-cadrage` | cadrage, `skills/skeam-cadrage/` | mise à jour de `cadrage.md` et des items du backlog depuis les synthèses |
| `/skeam-chiffrage` | cadrage, `skills/skeam-chiffrage/` | `chiffrer.py`, puis brouillon de devis Dougs et entrée `devis` de statut `brouillon` dans `client.yaml` ; jamais de finalisation ni d'envoi |
| `/skeam-sync-todoist` | cadrage, `skills/skeam-sync-todoist/` | synchronise `actions.yaml` avec Todoist via `todoist.projet_id` et `todoist.section_id` ; écrit `todoist_id` et `statut` |
| `/skeam-publier` | cadrage, `skills/skeam-publier/` | met à jour les documents pointés par `liens.docs_<audience>` à partir des vues filtrées ; ne notifie personne |
| `/skeam-dashboard` | dashboard, `dashboard/skills/skeam-dashboard/` | `agreger.py` pour les trois audiences, puis rendu |
| `/skeam-calibrer` | dashboard, `dashboard/skills/skeam-calibrer/` | `calibrer.py` |
| `/skeam-bilan` | dashboard, `dashboard/skills/skeam-bilan/` | `bilan_temps.py` sur l'historique d'une session, puis statuts d'items, besoins découverts et lignes de temps proposés à Théo |

### 11.8 Installation du relevé de consommation, chantier commun

```sh
python scripts/installer_conso.py <racine du dépôt> --prefixe <PREFIXE> [--sans-crochet] [--remplacer]
```

Copie `templates/depot-client/` à la racine du dépôt sans écraser un fichier différent, code 1 avec la liste, sauf `--remplacer` qui met à jour `conso.py`, le crochet et le README ; écrit `.skeam/conso.json` avec le préfixe ; ajoute le crochet `SessionStart` à `.claude/settings.json` sans rien en retirer ; ajoute la ligne `merge=union` à `.gitattributes` ; active le crochet Git, sauf avec `--sans-crochet`. Ne touche rien dans `projet/`, ne commite rien, idempotent. L'activation dans les sessions cloud, où le crochet du dépôt ne se déclenche pas quand la session s'ouvre au-dessus des dépôts, vient du script d'installation de l'environnement, `templates/environnement/setup-cloud.sh`, à coller une fois dans les réglages de l'environnement cloud de claude.ai.

## 12. Registre clients.yaml

Schéma : `schemas/clients.schema.json`. À la racine de skeam-ops ; clé racine `clients`.

| Clé | Type et valeurs |
|---|---|
| `slug` | slug, unique |
| `nom` | texte |
| `depot` | dépôt, unique |
| `statut` | statut de projet, copie de `projet/client.yaml` qui fait foi |
| `actif` | booléen ; `false` : ignoré par `agreger.py` et `calibrer.py` |

<!-- exemple: clients -->
```yaml
clients:
  - slug: egm
    nom: E G M
    depot: theonam/egm-app
    statut: en_dev
    actif: true
```

## 13. Consignes des agents de développement

Le texte de référence est `templates/dossier-client/CLAUDE-projet.md`, copié dans chaque dossier projet. Points fixés par le contrat :

- lire `projet/cadrage.md` et `projet/backlog/` avant de travailler ;
- chaque message de commit commence par l'id de l'item : `EGM-012: ...` ;
- passer l'item `en_cours` au début, `a_recetter` à la fin, avec `commit` et `maj` ; l'agent passe l'item à `fait` après avoir vérifié lui-même chaque critère d'acceptation ; seul Théo passe un item à `abandonne` ;
- une ligne de temps par session dans `projet/temps/AAAA-MM-<agent>.jsonl` ;
- le relevé `.skeam/conso/` est écrit par le crochet Git et part avec les commits de travail ; ne jamais le modifier, le supprimer ni le commiter à part, section 15.2 ;
- tout besoin découvert devient un nouvel item, `a_valider: false`, `audience` selon ce que voit le client : `client` pour une fonction de l'application, `interne` pour un travail technique ;
- ne jamais modifier `projet/interne/` ni `decisions.md` sans instruction explicite.

## 14. Proposer une évolution du contrat

Un chantier qui a besoin d'un changement l'écrit dans `<son dossier>/PROPOSITIONS-CONTRAT.md`, puis continue avec l'hypothèse la plus simple compatible avec le contrat actuel. Format d'une entrée, ajoutée en fin de fichier :

```markdown
## 2026-10-16 Titre court

- **Besoin** : ce qui bloque ou manque.
- **Proposition** : changement précis du contrat ou d'un schéma.
- **Hypothèse retenue en attendant** : ce que le chantier fait d'ici la décision.
- **Impact** : fichiers et chantiers concernés.
```

## 15. Consommation des agents

Décision de Théo du 2026-10-17. Le temps et la consommation des agents Claude sont relevés automatiquement, pour la conversation principale et chaque agent d'une session, sous-agents et agents de workflow compris. Le relevé vit dans le dépôt de chaque projet ; le coût est calculé par skeam-ops seul. Ce relevé ne remplace pas le journal de temps de la section 6, validé par Théo, et ne s'y mélange jamais.

### 15.1 Fichier de consommation

`.skeam/conso/AAAA-MM-JJ-<session>.jsonl` à la racine du dépôt, sur toute branche de développement et, pour le relevé final de `/skeam-bilan`, sur la branche qui porte `projet/`, toujours hors du dossier `projet/`. Un fichier par session Claude Code : `<session>` est l'identifiant local de la session, la date celle, à Paris, du début le plus ancien de ses lignes lors de la première écriture. Fichier JSON Lines, une ligne par agent, clés dans l'ordre ci-dessous, lignes triées par début. Schéma : `schemas/conso.schema.json`, vérifié par `python scripts/validate.py --conso <racine du dépôt>`.

| Clé | Type et valeurs |
|---|---|
| `version` | `1` |
| `session` | identifiant de la session, celui du nom de fichier |
| `session_distante` | `session_…` de la ligne `Claude-Session` des commits de la session, ou null |
| `agent_id` | identifiant de l'agent, ou null pour la conversation principale |
| `type` | `principal`, `sous_agent`, `workflow` |
| `run`, `phase` | run du workflow ; phase du workflow réduite à un mot de la liste ci-dessous, sinon null |
| `libelle` | tiré du libellé de l'agent dans le workflow ou de sa description, jamais recopié : un mot de la liste ci-dessous, suivi le cas échéant de `:` et des ids d'items du préfixe du dépôt séparés par une espace, `terrain:EGM-023 EGM-024`, ou ces ids seuls, 80 caractères au plus, ou null ; null pour la conversation principale |
| `debut`, `fin` | premier et dernier message de l'agent, date et heure ISO 8601 avec décalage, à la seconde |
| `periodes` | liste des périodes actives `[debut, fin]` : un silence de plus de 15 minutes clôt une période |
| `minutes_actives` | somme des périodes, une décimale |
| `messages` | nombre de réponses du modèle, au moins 1 ; une réponse répétée par le streaming compte une fois |
| `modeles` | par identifiant de modèle : `entree`, `sortie`, `lecture_cache`, `ecriture_cache`, `ecriture_cache_1h` compris dans `ecriture_cache`, `recherches_web`, entiers ; facultatif `au_dela_100k` : les quatre premiers compteurs pour les réponses dont le prompt dépasse 100 000 jetons |
| `items` | liste de `id` d'item du préfixe du dépôt et `part` ; parts à quatre décimales, de somme 1 quand l'agent n'a travaillé que pour ce projet, moins sinon : la part qui manque revient aux items d'autres projets, écrits dans leurs dépôts ; ou liste vide |
| `lien` | `libelle`, `commits`, `session`, estimé d'après le run de workflow, ou `aucun`, section 15.2 ; `aucun` si et seulement si `items` est vide |
| `commits` | hash courts des commits qui fondent le lien, items du préfixe du dépôt, 50 au plus |
| `releve_le` | date et heure de la dernière modification de la ligne |

Une ligne par `session`, `agent_id` et `debut`. Une ligne n'est écrite que si l'agent a reçu au moins une réponse du modèle. Le fichier ne contient jamais de contenu de conversation, de consigne, de texte libre, de chemin, de nom de branche, de secret, de donnée personnelle, de coût ni d'id d'item d'un autre projet.

Mots admis dans `libelle` et `phase`, en minuscules avec leurs accents : analyse, bilan, cadrage, chantiers, chiffrage, collecte, conception, contrôle, correction, documentation, exploration, facturation, intégration, livraison, migration, outils, planification, préparation, réalisation, recherche, rédaction, relecture, revue, synthèse, terrain, test, tests, vérification. Le mot est le premier du texte d'origine, avant tout `:`, s'il figure dans la liste ; sinon aucun mot n'est écrit.

<!-- exemple: conso -->
```json
{"version":1,"session":"9b5538f3-98f4-55a3-9adb-0c77ee210ef8","session_distante":"session_01JwUXdWyP6WQoxX6FpKxFKQ","agent_id":"a111e266422014cf6","type":"workflow","run":"wf_4c91e173-b72","phase":"chantiers","libelle":"terrain:EGM-023 EGM-024","debut":"2026-10-17T19:13:33+02:00","fin":"2026-10-17T20:06:23+02:00","periodes":[["2026-10-17T19:13:33+02:00","2026-10-17T20:06:23+02:00"]],"minutes_actives":52.8,"messages":169,"modeles":{"claude-opus-5-5":{"entree":338,"sortie":155257,"lecture_cache":59550504,"ecriture_cache":964810,"ecriture_cache_1h":0,"recherches_web":0,"au_dela_100k":{"entree":330,"sortie":154698,"lecture_cache":59256096,"ecriture_cache":913640}}},"items":[{"id":"EGM-023","part":0.5},{"id":"EGM-024","part":0.5}],"lien":"libelle","commits":[],"releve_le":"2026-10-17T23:46:44+02:00"}
```

### 15.2 Relevé et rattachement

- Le relevé est écrit par `.skeam/conso.py`, copié de `templates/depot-client/`, appelé par le crochet Git `.skeam/githooks/pre-commit` à chaque commit fait depuis une session Claude Code, variable `CLAUDE_CODE_SESSION_ID` présente : il relit tout l'historique de la session, réécrit le fichier et l'ajoute au commit en cours. Ce commit, absent de `git log` pendant le crochet, est rattaché d'après la dernière commande `git commit` de la session lancée moins de 15 minutes plus tôt, dont seul l'id en tête du message est lu. Il ne bloque jamais un commit et ne fait rien pendant un rebase ou un cherry-pick. Le crochet Git est activé dans chaque clone, `core.hooksPath`, réglage local perdu avec le conteneur : dans l'environnement cloud, par le script d'installation `templates/environnement/setup-cloud.sh`, conservé d'un conteneur à l'autre, qui l'active dans tous les dépôts clonés et ajoute aux réglages de l'utilisateur des crochets `SessionStart` et `UserPromptSubmit` qui le réactivent, pour une session ouverte au-dessus des dépôts comme à leur racine ; sur un poste, par le crochet `SessionStart` de `.claude/settings.json` du dépôt quand la session s'ouvre à sa racine ; à défaut, à la main par `python3 .skeam/conso.py installer`, que tout agent lance si `python3 .skeam/conso.py verifier` le dit inactif avant son premier commit.
- Le fichier part avec les commits de travail, dont le message commence par l'id de l'item comme d'habitude. Il ne se modifie, ne se supprime ni ne se commite jamais à part, sauf le relevé final : `/skeam-bilan` lance `templates/depot-client/.skeam/conso.py capturer --prefixe <PREFIXE>` de skeam-ops dans le dépôt, sur la branche qui porte `projet/`, et le fichier part avec le commit du bilan ; il couvre l'activité qui suit le dernier commit de travail.
- Réécriture idempotente : une réponse du modèle compte une fois ; une ligne déjà écrite qu'on ne peut plus recalculer est conservée ; une ligne ne perd jamais de messages ; `releve_le` ne change que si la ligne change. Les branches se fusionnent sans conflit par `merge=union` déclaré dans `.gitattributes` ; une clé en double se résout à la lecture en gardant la ligne qui a le plus de messages, puis la plus récente.
- Rattachement d'un agent aux items, dans l'ordre : les ids cités dans son libellé, `lien` `libelle` ; sinon les ids des commits de la session faits pendant son activité, datés à l'auteur, chacun pesant le temps actif de l'agent depuis son commit précédent, le temps d'avant le premier commit allant au premier et celui d'après le dernier au dernier, `lien` `commits` ; sinon, estimation, les items des autres agents rattachés du même run de workflow, au prorata de leurs minutes, s'ils sont tous du même préfixe, `lien` `session` ; sinon aucun item. Jamais de répartition hors du run ni entre préfixes de projets différents. Un commit revient d'abord à l'agent qui a lancé la commande `git` juste avant lui, puis à l'agent actif dont le libellé cite son item, puis à parts égales aux agents actifs sans id dans leur libellé, sinon à la conversation principale. Seuls comptent les commits dont la ligne `Claude-Session` cite la session, quand elle est connue.
- Un dépôt ne reçoit que les lignes qui citent un item de son préfixe, lu dans `.skeam/conso.json`, ou sans item et actives dans ce dépôt ou hors de tout dépôt ; il n'y écrit que les items, les commits et les ids du libellé de son préfixe.

### 15.3 Tarifs des modèles

`dashboard/tarifs-modeles.yaml`, schéma `schemas/tarifs-modeles.schema.json`. Clé `devise` : `USD`. Clé `tarifs` : liste d'entrées `modele`, `depuis` date d'effet, prix en USD par million de jetons `entree`, `sortie`, `lecture_cache`, `ecriture_cache_5m`, `ecriture_cache_1h`, `recherche_web_mille` en USD pour 1 000 recherches, `au_dela_100k` null ou les cinq prix de jetons applicables au-delà de 100 000 jetons de prompt, `a_confirmer` liste des champs non vérifiés, `source` texte. Un couple `modele` et `depuis` est unique. Une ligne de consommation prend, pour chaque modèle, l'entrée de plus grande `depuis` antérieure ou égale à son début, à défaut la plus ancienne. Un modèle sans tarif donne un coût inconnu, jamais nul. Le coût est un coût au tarif de l'API : il ne vaut pas facture d'abonnement.

<!-- exemple: tarifs-modeles -->
```yaml
devise: USD
tarifs:
  - modele: claude-opus-5-5
    depuis: 2026-10-06
    entree: 4.00
    sortie: 20.00
    lecture_cache: 0.20
    ecriture_cache_5m: 5.00
    ecriture_cache_1h: 8.00
    recherche_web_mille: 10.00
    au_dela_100k: null
    a_confirmer:
      - ecriture_cache_1h
    source: Documentation de l'API Claude du 2026-10-06, recoupée avec le coût calculé par Claude Code.
```

Coût d'une ligne pour un modèle : écriture du cache au prix 5 minutes, plus la part 1 heure au supplément du prix 1 heure ; jetons des réponses au-delà de 100 000 jetons de prompt aux prix `au_dela_100k` s'ils existent, sinon aux prix de base ; recherches web au prix pour mille.

### 15.4 Agrégation

`agreger.py` lit les fichiers de consommation de toutes les branches de chaque clone et de skeam-ops, pour la vue interne seulement, et rattache chaque item à son lot par le backlog et à son projet par son préfixe. Il distingue le temps machine, somme des minutes actives des agents au prorata de leurs parts, par projet, lot et item, et la durée réelle, réunion de leurs périodes actives, au global et par projet seulement, une ligne comptant dans un projet si sa part dans ce projet atteint 0,5. La part liée par `session` est comptée et aussi montrée à part, marquée estimée. Une ligne invalide est ignorée avec un avertissement. Une même ligne lue dans plusieurs dépôts réunit leurs items, chaque préfixe pris dans la copie la plus riche qui le porte ; la part qui manque encore, items d'un dépôt non lu, ne compte qu'au total global. Ces chiffres s'affichent à côté du temps passé validé et des heures vendues, sans jamais s'y ajouter. Format : `dashboard/README.md`.
