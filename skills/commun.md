# Règles communes des commandes SKEAM

Ce fichier complète chaque `SKILL.md` de `skills/`. Chaque commande le lit dans le clone de skeam-ops dès l'étape 0, avant toute autre action. En cas d'écart, `CONTRAT.md` fait foi, puis ce fichier, puis le `SKILL.md`.

Les commandes tournent dans le chat claude.ai, pas dans Claude Code. Elles disposent d'un shell avec git, des connecteurs Plaud, Dougs, Todoist et Docs Claude, et de la question à choix multiples `ask_user_input_v0`.

## 1. Étape 0 : préparer l'espace de travail

Toutes les commandes commencent ainsi.

```sh
export TZ=Europe/Paris
export RACINE="$HOME/skeam"
mkdir -p "$RACINE" && cd "$RACINE"
if [ -d skeam-ops/.git ]; then git -C skeam-ops pull --ff-only; else git clone https://github.com/theonam/skeam-ops.git; fi
python3 -c "import yaml, jsonschema" 2>/dev/null || pip install -q -r skeam-ops/requirements.txt
python3 --version
```

Puis lire `skeam-ops/CONTRAT.md` aux sections utiles à la commande et ce fichier.

Clone d'un dépôt client `proprietaire/nom` : toujours dans `$RACINE/nom`, conformément à CONTRAT.md section 2.

```sh
cd "$RACINE"
if [ -d nom/.git ]; then git -C nom pull --ff-only; else git clone https://github.com/proprietaire/nom.git; fi
```

Les scripts de skeam-ops se lancent depuis `$RACINE/skeam-ops`, avec des chemins relatifs : le dossier projet du dépôt `theonam/egm-app` est `../egm-app/projet`.

| Situation | Conduite |
|---|---|
| Clone refusé, dépôt introuvable ou non autorisé | Demander à Théo d'attacher le dépôt à la conversation, puis s'arrêter. Ne jamais essayer un autre dépôt. |
| `pull --ff-only` refusé, historique divergent | S'arrêter et décrire l'état à Théo. Jamais de `reset`, de `rebase` forcé ni de `push --force`. |
| Modifications locales non commitées laissées par une session précédente | Les montrer à Théo avec `git status --short` et lui demander de les garder, de les committer ou de les jeter. |
| Python inférieur à 3.11 ou `pip` indisponible | S'arrêter et le dire : les scripts du contrat ne peuvent pas tourner. |

## 2. Identifier le client

1. Lire `skeam-ops/clients.yaml`.
2. Si Théo a donné un slug ou un nom, chercher l'entrée correspondante. Une seule correspondance : la retenir. Plusieurs ou aucune : poser la question à choix multiples avec les clients actifs du registre.
3. Le dépôt est `depot` de l'entrée ; le dossier projet est `$RACINE/<nom du dépôt>/projet`.
   Si Théo désigne explicitement un dépôt absent du registre, par exemple le dépôt de test `theonam/skeam-test-fictif`, l'utiliser après confirmation, en signalant qu'il n'est pas au registre. Aucune commande ne l'y ajoute, sauf `/nouveau-client`.
4. Valider le dossier projet avant de le lire : `python3 scripts/validate.py ../<nom>/projet`. Code 1 : présenter les erreurs à Théo et s'arrêter, sauf mention contraire du `SKILL.md`.

## 3. Validation par Théo

La question à choix multiples `ask_user_input_v0` est obligatoire avant :

- toute écriture hors des dépôts : Todoist, Dougs, Docs Claude, création de dépôt GitHub ;
- tout commit et tout push, sur un dépôt client comme sur skeam-ops.

Les fichiers du clone local peuvent être modifiés avant validation, puisqu'ils ne sortent pas de la session tant qu'ils ne sont pas poussés.

Déroulé d'une validation :

1. Présenter d'abord, dans le message, le récapitulatif exact de ce qui sera écrit : cible, valeurs, fichiers.
2. Poser la question avec des options courtes, au plus quatre questions par appel. Options types : `Valider`, `Modifier`, `Annuler`. Pour un arbitrage d'éléments : `Accepter`, `Modifier`, `Rejeter`.
3. Une réponse absente, ambiguë ou hors des options vaut refus. `Modifier` : demander la correction en texte libre, l'appliquer, puis reposer la question.
4. Une validation ne vaut que pour le contenu présenté. Si le contenu change, reposer la question.

## 4. Rédaction

- Français, phrases nettes et courtes, une idée par phrase.
- Aucune invention. Tout fait vient d'une source citée : transcript avec son horodatage, synthèse ou décision par son chemin relatif à `projet/`, `client.yaml`, consigne de Théo donnée dans le chat avec sa date, registre public avec son adresse et la date de consultation. Ce qui n'a pas de source va en `Zones d'incertitude` ou en `Questions ouvertes`.
- Une estimation n'est pas un fait. Elle est toujours présentée comme provisoire et ne sort jamais vers le client.
- Contenus destinés au client, CONTRAT.md section 2.3 : `cadrage.md`, `syntheses/`, titre et critères des items d'audience `client`, objet et lignes de chiffrage, vue client publiée. Ni tiret cadratin, ni parenthèse : remplacer par une virgule, deux points ou une nouvelle phrase. Les commentaires HTML sont exclus du contrôle et retirés à la publication.
- Rien n'est jamais envoyé à un client : ni courriel, ni partage de document, ni devis finalisé ou envoyé.
- `projet/interne/` n'est jamais lu, jamais écrit, jamais publié.

## 5. Écrire dans un dossier projet

- Relire la section du contrat du fichier touché avant d'écrire. Aucune clé hors contrat.
- YAML : deux espaces d'indentation, dates sans guillemets, chaînes faites de chiffres entre guillemets : siren, code postal, ids Todoist. Modifier au plus près, sans réordonner ni supprimer les commentaires existants.
- Date du jour : `date +%F` avec `TZ=Europe/Paris`.
- Nouvel item : `id` égal au plus grand numéro existant dans tout `backlog/` plus un ; `a_valider: true`, `audience: interne`, `statut: a_faire`, `commit: null`, `maj` du jour. Dans skeam-ops, plus petit numéro libre de la plage du chantier.
- Nouvelle action : `ACT-<PRÉFIXE>-nnn`, plus grand numéro existant plus un, `todoist_id: null`, `statut: ouverte`.
- `decisions.md` : ajout en fin de fichier uniquement, et seulement pour une entrée acceptée par Théo, ce qui vaut instruction explicite.
- Statuts d'item `fait` et `abandonne` : jamais posés par une commande, sauf choix explicite de Théo dans une question.
- Après écriture : `python3 scripts/validate.py ../<nom>/projet` doit sortir avec le code 0. Sinon corriger ; si la correction n'est pas évidente, annuler la modification avec `git -C ../<nom> checkout -- <fichier>` et le signaler. Jamais de commit d'un dossier invalide.

## 6. Committer et pousser

Après validation de Théo seulement, sur la branche par défaut du dépôt :

```sh
cd "$RACINE/<nom>"
git add projet/<fichiers touchés>
git commit -m "projet: <commande> <résumé court>"
git pull --rebase --autostash && git push
```

- Message : `projet: import-transcript 2026-10-08-lancement`, `projet: chiffrage du 2026-10-12`. Pas d'id d'item : ces commits ne portent pas de code.
- `git add` nomme les fichiers ; jamais `git add -A`.
- Push refusé : réessayer une fois après `git pull --rebase` ; en cas de conflit ou de branche protégée, s'arrêter, laisser le commit local et décrire la situation à Théo. Jamais de `--force`.
- Si Théo refuse le commit, laisser les fichiers modifiés dans le clone et le dire dans le compte rendu : ils seront perdus à la fin de la session.

## 7. Connecteurs

### Todoist

- Projet SKEAM : id `6h6qfvrgr83M56Gq`. Une section par client, nommée `Client · <nom>` avec un point médian, `nom` étant celui de `client.yaml`.
- Étiquettes de points : `1pt`, `2pt`, `3pt`, `5pt`, `8pt`. Priorités : `p1` à `p4`, comme le champ `priorite` d'une action.
- Toute tâche créée porte dans sa description ce commentaire de contexte, sur trois lignes :

  ```text
  Source : <dépôt> · projet/<source de l'action, ou "manuel">
  Raison : <contexte de l'action>
  Réf : <id de l'action>
  ```

  La ligne `Réf` permet de retrouver l'action depuis Todoist ; elle n'est jamais retirée.

### Dougs

- `companyId` par `list-companies` ; s'il y a plusieurs sociétés, demander laquelle.
- Autorisés : lectures, `create-quote-draft`, `update-quote` sans changer `status`.
- Interdits, en toutes circonstances : `finalize-quote-draft`, `send-document-by-email`, `promote-quote-to-invoice`, `update-quote` avec un `status` autre que `DRAFT`, tout outil de facture, d'avoir ou de paiement.
- Toute réponse qui s'appuie sur un résultat Dougs reproduit l'avertissement imposé par le connecteur.

### Plaud

Lecture seule : `list_files`, `get_note`, `get_transcript`.

### Docs Claude

Création et mise à jour de documents uniquement. Jamais de partage ni d'invitation : Théo partage lui-même.

## 8. Compte rendu de fin

Chaque commande se termine par un compte rendu court :

- ce qui a été écrit : fichiers, commit, ids externes créés ;
- ce qui a été refusé ou laissé de côté ;
- les décisions qui restent à Théo ;
- la commande suivante utile.
