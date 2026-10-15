---
name: skeam-import-transcript
description: Importe un enregistrement Plaud dans le dossier projet d'un client SKEAM, transcript brut puis synthèse en 5 sections, et propose sans les appliquer les mises à jour du cadrage, nouveaux items, décisions et actions, que Théo arbitre une par une. À utiliser après une réunion client enregistrée, quand Théo tape /skeam-import-transcript ou demande d'importer, de synthétiser ou de traiter une réunion Plaud pour un client.
---

# /skeam-import-transcript

Transforme une réunion enregistrée en matière exploitable : le transcript brut et la synthèse sont écrits dans le dépôt ; tout le reste est **proposé**, et rien n'est appliqué sans l'accord de Théo, élément par élément.

Lire d'abord `skills/commun.md` dans le clone de skeam-ops, puis CONTRAT.md sections 5, 7, 9.1 à 9.4.

## Entrées

| Entrée | Si absente |
|---|---|
| Client : slug ou nom | question à choix multiples sur les clients actifs du registre |
| Enregistrement Plaud : nom, date ou période | liste des enregistrements des 7 derniers jours |
| Sujet du fichier, kebab-case | proposé depuis le nom de l'enregistrement : `lancement`, `atelier-pointage` |

## Sorties

Écrites dans le dépôt :

- `projet/transcripts/AAAA-MM-JJ-sujet.md` : en-tête du contrat section 9.1, `source: plaud`, `plaud_id`, puis le transcript brut.
- `projet/syntheses/AAAA-MM-JJ-sujet.md` : en-tête section 9.2 avec `transcript`, titre de niveau 1, cinq sections dans l'ordre imposé.

Proposées, puis écrites seulement si Théo les accepte :

- modifications de `projet/cadrage.md`, par section ;
- nouveaux items de backlog, toujours `a_valider: true` et `audience: interne` ;
- entrées de `projet/decisions.md` ;
- actions de Théo dans `projet/actions.yaml`, avec la synthèse pour `source`.

## Étapes

### 1. Préparer

1. Étape 0 et identification du client, `skills/commun.md` sections 1 et 2.
2. Lister les `plaud_id` déjà importés : `grep -h '^plaud_id:' projet/transcripts/*.md`.

### 2. Choisir l'enregistrement

1. `list_files` avec `date_from` et `date_to` sur la période donnée, 7 derniers jours par défaut. Avec un nom, ajouter `query` ; si `complete` vaut `false`, le dire.
2. Présenter au plus quatre enregistrements par question à choix multiples : nom, date, durée ; marquer `déjà importé` ceux dont l'id figure dans la liste de l'étape 1.
3. Enregistrement déjà importé : voir Idempotence.

### 3. Récupérer le contenu

1. `get_transcript` avec `block: transaction`, puis rappeler avec `next_cursor` jusqu'à épuisement. Ne jamais s'arrêter à la première page.
2. `get_transcript` avec `block: mark_memo` : les moments marqués par Théo pendant la réunion sont à traiter en priorité dans la synthèse.
3. `get_note` : le résumé Plaud sert seulement à repérer des sujets. Il n'est jamais une source de fait ; tout fait se vérifie dans le transcript.
4. Locuteurs non nommés, `Speaker 1` par exemple : proposer à Théo une correspondance avec les contacts de `client.yaml` et lui-même, en citant pour chacun une phrase caractéristique. Sans réponse, garder le libellé Plaud.

### 4. Écrire le transcript

- Nom : `transcripts/AAAA-MM-JJ-sujet.md`, date de la réunion à Paris, sujet en kebab-case sans accents. Si le fichier existe déjà pour un autre enregistrement, suffixer le sujet : `atelier-2`.
- En-tête :

  ```yaml
  ---
  date: AAAA-MM-JJ
  participants:
    - Théo Namor
    - <autres locuteurs, noms retenus à l'étape 3>
  source: plaud
  plaud_id: <id Plaud>
  ---
  ```

- Corps : une ligne par intervention, `[HH:MM:SS] Locuteur : texte`, horodatage relatif au début de l'enregistrement. Texte brut, sans correction, sans coupe.

### 5. Écrire la synthèse

En-tête identique au transcript, plus `transcript: transcripts/AAAA-MM-JJ-sujet.md`. Titre de niveau 1 : objet de la réunion et nom du client. Puis exactement :

1. `## Résumé exécutif` : trois à cinq phrases, ce qui a changé ou a été appris.
2. `## Faits établis` : une puce par fait énoncé clairement par un participant.
3. `## Actions` : une puce par action, `- **Porteur** : action, échéance AAAA-MM-JJ`. Sans échéance dite en réunion, ne pas en écrire.
4. `## Détail par sujet` : un titre de niveau 3 par sujet, dans l'ordre de la réunion.
5. `## Zones d'incertitude` : ce qui est ambigu, inaudible, contradictoire, supposé ou laissé sans réponse. Jamais vide : à défaut, `- Aucune zone d'incertitude relevée.`

Règles :

- La synthèse est destinée au client : ni tiret cadratin, ni parenthèse, ni prix, marge, estimation ou appréciation sur une personne. Ce qui est sensible est écarté de la synthèse et signalé à Théo dans le compte rendu, sans être écrit dans le dépôt.
- Chaque puce de Faits établis et d'Actions, et chaque paragraphe de Détail par sujet, se termine par l'horodatage de sa source en commentaire HTML : `<!-- 00:12:30 -->`. Invisible pour le client, retiré à la publication, il permet à Théo de vérifier.
- Rien qui ne soit dans le transcript. Un chiffre, une date, un nom mal entendus vont en Zones d'incertitude.

Valider : `python3 scripts/validate.py ../<nom>/projet`, code 0 exigé avant de continuer.

### 6. Préparer les propositions

Lire `cadrage.md`, tous les fichiers `backlog/*.yaml`, `decisions.md` et `actions.yaml`. Construire une liste numérotée `P1`, `P2`, et ainsi de suite, chaque proposition avec sa source dans la synthèse et son horodatage :

| Type | Contenu exact proposé |
|---|---|
| Cadrage | section visée, texte actuel, texte proposé. Une règle de gestion nouvelle prend le numéro RG suivant ; une règle n'est jamais renumérotée. Une information qui contredit le cadrage actuel est proposée en `Questions ouvertes`, jamais en remplacement silencieux. |
| Item | item YAML complet : id suivant, `a_valider: true`, `audience: interne`, `statut: a_faire`, `commit: null`, `maj` du jour ; `estimation_h` et `taille` provisoires, reprises du module du catalogue si un module correspond, et `notes: Estimation provisoire, issue de syntheses/<fichier>.` |
| Décision | entrée de quatre puces, CONTRAT.md section 9.4, `Source` égale au chemin de la synthèse. Seulement ce qui a été tranché en réunion, pas ce qui a été évoqué. |
| Action | action de Théo seulement : `titre`, `contexte` qui dit d'où elle vient et pourquoi, `priorite` et `points` proposés, `echeance` seulement si elle a été dite, `source` égale au chemin de la synthèse. Les actions des autres participants restent dans la synthèse ; celles qui attendent le client peuvent être proposées en `Attendus du client` du cadrage. |

Comparer avec l'existant : ne pas proposer un item, une action ou une décision déjà présents ; proposer plutôt une modification de l'existant, en citant son id.

### 7. Arbitrage, élément par élément

Présenter les propositions groupées par type, puis les arbitrer par questions à choix multiples, quatre par appel : `Accepter`, `Modifier`, `Rejeter`. Une proposition modifiée est représentée avant d'être acceptée. Aucun accord global : chaque proposition reçoit sa réponse.

### 8. Appliquer ce qui est accepté

1. Cadrage : modifier la section visée ; ajouter le chemin de la synthèse en `Sources` s'il n'y figure pas.
2. Items : ajouter au fichier de backlog dont les items ont le même `lot` ; à défaut, créer `backlog/lot<n>.yaml`. Un item accepté garde `a_valider: true` ; son passage à `false` se fait par `/skeam-cadrage`.
3. Décisions : ajouter en fin de `decisions.md`, ordre chronologique respecté.
4. Actions : ajouter en fin de `actions.yaml`, `todoist_id: null`.
5. Valider : code 0 exigé.

### 9. Committer

Question : committer et pousser `transcripts/`, `syntheses/` et les fichiers modifiés : `Valider`, `Annuler`. Message `projet: skeam-import-transcript AAAA-MM-JJ-sujet`.

### 10. Compte rendu

Selon `skills/commun.md` section 8 ; y lister les passages sensibles écartés de la synthèse. Suggérer `/skeam-sync-todoist` si des actions ont été ajoutées, `/skeam-cadrage` si des items ou le cadrage ont bougé.

## Garde-fous

- Le transcript et la synthèse sont les seuls fichiers écrits sans arbitrage ; ils ne quittent la session qu'après `Valider`.
- Aucune proposition appliquée sans `Accepter` explicite.
- Aucun fait sans horodatage du transcript. Le résumé Plaud n'est pas une source.
- Jamais de modification d'un item existant hors proposition acceptée ; jamais de statut `fait` ou `abandonne`.
- Jamais d'écriture dans Todoist : c'est le rôle de `/skeam-sync-todoist`.

## Idempotence

- Un enregistrement est reconnu par son `plaud_id` dans `transcripts/`. S'il est déjà importé, demander : régénérer seulement les propositions depuis la synthèse existante, ou s'arrêter. Le transcript et la synthèse existants ne sont jamais réécrits sans accord explicite, car Théo a pu les corriger.
- Les propositions déjà appliquées sont retrouvées par comparaison avec l'existant et ne sont pas reproposées.

## Cas d'erreur

| Cas | Conduite |
|---|---|
| Aucun enregistrement sur la période | Le dire et proposer d'élargir la période. |
| Transcript Plaud vide ou pas encore généré | S'arrêter ; rien n'est écrit. |
| Pagination interrompue | Reprendre au dernier `next_cursor` ; si l'erreur persiste, ne rien écrire et le signaler. |
| Date de la réunion différente de la date d'import | La date du nom de fichier et de l'en-tête est celle de la réunion. |
| Validation en échec | Corriger le fichier fautif ; jamais de commit d'un dossier invalide. |
| Réunion sans lien avec le client choisi | Le signaler et demander confirmation avant d'écrire. |
