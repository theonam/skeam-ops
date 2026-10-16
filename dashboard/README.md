# Dashboard

Propriétaire : chantier dashboard, branche `feat/dashboard`, agent `ops-dashboard`, ids OPS-401 à OPS-499.

Vue de pilotage de tous les projets en parallèle : ce qui bloque, ce qui dérape, ce que Théo doit faire, puis le portefeuille et le détail par projet. Trois vues, une par audience de CONTRAT.md section 10 : `interne` pour Théo, `commercial` pour l'associé commercial, `client` pour un client.

## Contenu

| Chemin | Rôle |
|---|---|
| `scripts/agreger.py` | interface CONTRAT.md section 11.5 : registre et clones vers `out/<audience>.json` |
| `scripts/pointage.py` | hook de pointage automatique du temps des sessions Claude Code, voir Pointage du temps |
| `scripts/rendre.py` | injecte une vue JSON dans `template.html` : une page HTML autonome |
| `template.html` | gabarit de la page, sans dépendance hors polices Google Fonts, clair et sombre, lisible sur téléphone |
| `artefacts.yaml` | URL des artefacts claude.ai publiés, une par vue, pour garder le même lien |
| `todoist.json` | configuration de la todo Todoist de la vue interne |
| `skills/dashboard/SKILL.md` | commande `/dashboard` |
| `skills/calibrer/SKILL.md` | commande `/calibrer` |
| `tests/` | tests et données fictives : clients `alpha` et `beta`, client inactif `gamma`, projet `ops` |
| `PROPOSITIONS-CONTRAT.md` | évolutions du contrat proposées à Théo |
| `out/` | sorties générées, non versionnées |

## Usage

Depuis la racine de skeam-ops, les clones des dépôts clients rangés dans `<racine>` :

```sh
python dashboard/scripts/agreger.py --clients clients.yaml --racine <racine> --audience interne --sortie dashboard/out/interne.json
python dashboard/scripts/rendre.py dashboard/out/interne.json --sortie dashboard/out/interne.html --todoist dashboard/out/todoist.json
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
| Avancement d'un lot, toutes les vues | en nombre d'items, CONTRAT.md section 10 : N items du lot hors `abandonne`, toutes audiences confondues ; à faire, en cours, développés, items `a_recetter` ou `fait`, et terminés, items `fait`, posés par l'agent après vérification de chaque critère, affichés « testé par l'IA », ou « terminé » en vue client ; pourcentages entiers arrondis à l'inférieur. `pourcentage`, part des terminés, est la formule du contrat |
| Heures d'un lot, vue interne | estimées et réelles en plus des comptes |
| Titre d'un lot | puce `- **Lot N** : titre. But.` de la section Découpage en lots de `cadrage.md` : première phrase pour le titre, le reste pour la description ; null sans puce pour ce lot |
| Heures estimées d'un lot | somme des `estimation_h` des N items de la vue interne |
| Heures réelles d'un item ou d'un lot | somme des `minutes` de toutes ses lignes de temps, validées ou non, divisée par 60 ; null si le temps n'est pas journalisé |
| Temps passé par lot | vue interne seulement, toujours affiché sous chaque lot : « Temps passé x h », 0 h compris, ou « temps non journalisé », sans les heures estimées, qui restent dans le bloc Heures et budget ; la date `temps.depuis` est rappelée, car le temps d'avant cette date n'est pas connu |
| Devis et lots | vues interne et commerciale : pour chaque devis, ses lots, entiers ou en partie, avec leur avancement compté comme celui des lots ; l'engagement et le paiement : le statut du devis tant qu'aucune facture non annulée n'existe, puis le statut de chaque facture, en retard si elle est envoyée et son échéance passée. Périmètre et factures viennent de `client.yaml`, CONTRAT.md section 3 ; un item cité par un devis lui appartient, sinon il suit son lot. Les items d'aucun devis sont listés à part |
| Temps non journalisé | le projet a des items `a_recetter` ou `fait` et aucune ligne de temps : la page affiche « temps non journalisé », jamais 0 h |
| Devis non saisi | montant signé nul et aucun devis dans `client.yaml` : la page affiche « devis non saisi », jamais 0 € |
| Heures et budget, vue interne | réel : toutes les lignes de temps du projet ; estimé : `estimation_h` des items hors `abandonne` ; vendu : montant signé, build et options, ou à défaut somme des devis envoyés ou acceptés, divisé par `taux_horaire_cible` de `catalogue/tarifs.yaml` ; consommé : réel sur vendu ; taux réel : vendu sur réel |
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
  nb_devis_non_saisis             clients sans montant signé ni devis saisi
projets[]
  slug, nom, type client|interne, statut, apporteur, dates, prochaine_echeance,
  montants_ht, montant_signe_ht, devis_saisi,
  devis[] : objet, montant_ht, statut,
                                  perimetre[] ou null : lot, titre, partiel, nb_items, a_faire, en_cours, developpe, termine ;
                                  factures[] : numero, montant_ht, statut, echeance, en_retard
  hors_devis[] ou null            mêmes champs que perimetre[] : items rattachés à aucun devis ; null sans aucun périmètre saisi
  liens                           les six liens de client.yaml
  lots[]                          lot, titre, description, nb_items, a_faire, en_cours, developpe, termine,
                                  pct_developpe, pourcentage, heures_estimees, heures_reelles, ecart_pct, depassement
  items_en_cours_anciens[]        id, titre, lot, maj, jours
  items_bloques[]                 id, titre, lot, statut, dependances_externes[]
  devis_a_envoyer[]               objet, montant_ht ; devis en brouillon
  compteurs                       devis_a_envoyer : nombre de la liste ci-dessus
  todoist                         projet_id, section_id de client.yaml, pour rattacher les tâches au projet
  actions[]                       id, titre, contexte, priorite, points, echeance, en_retard ; p1 et p2 ouvertes
  temps                           semaine_h, semaine_theo_h, semaine_agents_h, semaine_precedente_h, total_h, hors_item_h, a_relire_h,
                                  journalise, depuis : date de la première ligne de temps du projet, ou null
  budget                          heures_estimees, heures_reelles, montant_vendu_ht, source_vendu signe|devis_envoyes,
                                  taux_horaire_cible, heures_vendues, consomme_pct, taux_reel
  derniere_synthese               date, titre, fichier, resume ; ou null
  items[]                         id, titre, lot, statut, priorite, maj, module, taille, estimation_h,
                                  heures_reelles, audience, dependances_externes[]
```

`prochaine_echeance` vaut null ou `date`, `libelle`, `source` id d'action ou `client.yaml`, `en_retard`, `dans_jours`.

Types d'alerte : `depassement_lot` et `depassement_item` haute, `bloque_externe` moyenne, `en_cours_ancien` moyenne, `registre_desynchronise` basse quand le statut de `clients.yaml` diffère de celui de `client.yaml`, qui fait foi.

La todo ne vient plus du dépôt mais de Todoist, voir plus bas. Les actions de `actions.yaml` restent dans le détail du projet ; leurs retards ne font plus d'alerte, Todoist faisant foi pour la todo. Les devis à envoyer sont un compteur par projet, dépliable ; recettes et validations ne s'affichent plus.

### Vue commercial

Clients seulement, jamais de temps, d'estimation, de tarif, de marge, d'action ni de dépendance.

```text
audience, genere_le, date_ref
global
  total_signe_ht, run_annuel_ht, nb_clients, portefeuille[]
  alertes[]                       en_cours_ancien seulement, sur les items visibles
projets[]
  slug, nom, type, statut, apporteur, dates, prochaine_echeance, montants_ht, montant_signe_ht,
  devis[] : objet, montant_ht, statut,
                                  perimetre[] ou null : lot, titre, partiel, nb_items, a_faire, en_cours, developpe, termine ;
                                  factures[] : numero, montant_ht, statut, echeance, en_retard
  hors_devis[] ou null            mêmes champs que perimetre[] : items rattachés à aucun devis ; null sans aucun périmètre saisi
  liens                           demo, prod, docs_client, docs_commercial
  lots[]                          lot, titre, description, nb_items, a_faire, en_cours, developpe, termine, pct_developpe,
                                  pourcentage ; lots ayant au moins un item visible
  items_en_cours_anciens[]        sur les items visibles
  derniere_synthese
  items[]                         id, titre, lot, statut, priorite, maj, module ; audiences commercial et client
```

### Vue client

```text
audience, genere_le
projets[]
  slug, nom, statut
  liens                           demo, prod, docs_client
  lots[]                          lot, titre, description, nb_items, a_faire, en_cours, developpe, termine, pct_developpe,
                                  pourcentage
  items[]                         id, titre, lot, statut, priorite, maj ; audience client
```

La vue client agrège tous les clients : elle ne se publie jamais telle quelle, mais projet par projet avec `rendre.py --projet`.

## Gabarit figé, version 3

Décision de Théo du 2026-10-16 : le gabarit est gravé. `format.json` fixe la version, les clés exactes de chaque objet de la sortie par audience et les blocs de la page ; `template.html` porte la même version dans `<meta name="skeam:gabarit">` et un attribut `data-bloc` par bloc. Les tests de `TestGabaritFige` échouent dès qu'une clé ou un bloc change.

- Version 1, 2026-10-16 : premier gabarit gravé.
- Version 2, 2026-10-16, demande de Théo : temps passé par lot toujours affiché et libellé, clé `temps.depuis`.
- Version 3, 2026-10-16, demandes de Théo : bloc Devis et lots, clés `devis[].perimetre`, `devis[].factures`, `hors_devis` ; sous chaque lot, le temps passé seul.

Blocs, dans l'ordre d'affichage :

| Vue | Blocs |
|---|---|
| interne | bandeau ; todo, alertes et devis à envoyer ; chiffres clés ; portefeuille ; charge de la semaine ; détail par projet : infos, heures et budget, devis et lots, avancement par lot, listes de pilotage, dernière synthèse, items par lot |
| commercial | bandeau ; points d'attention ; chiffres clés ; portefeuille ; détail par projet : infos, devis et lots, avancement par lot, items en cours depuis plus de 7 jours, dernière synthèse, items par lot |
| client | bandeau ; détail : liens, avancement par lot, items par lot |

Pour faire évoluer le gabarit : accord de Théo, puis dans la même pull request `format.json` et `template.html` à la version suivante, ce README et les tests. Les commandes du chat ne modifient jamais le gabarit : elles le prennent tel quel sur `main`.

## Pointage du temps

Décision de Théo du 2026-10-16 : le temps passé se mesure automatiquement, sans déclaration de l'agent. Les lignes produites respectent CONTRAT.md section 6 ; `agreger.py` les lit comme les autres.

- `.claude/settings.json` appelle `scripts/pointage.py` aux événements SessionStart, UserPromptSubmit, PreToolUse, PostToolUse et Stop. Chaque événement est noté avec son heure dans `~/.claude/pointage/<session>.jsonl`, hors du dépôt.
- Le temps compte tant que Claude travaille, et pendant l'attente de la réponse de Théo jusqu'à `pause_minutes`, 20 par défaut. Une attente plus longue après la fin d'une réponse est une pause et ne compte pas. Un outil long, build ou tests, ne coupe jamais le temps.
- Juste avant chaque `git commit`, le temps depuis le commit précédent de la session devient une ligne par période d'activité, bornes arrondies à la minute, rattachée au premier id d'item du message de commit, `source` `claude-code`, `valide` `false`, note « Pointage automatique, session <8 premiers caractères> ». Le fichier de temps est ajouté au commit.
- L'agent est choisi d'après le numéro de l'item, `agents_par_plage` de `.claude/pointage.json`, sinon `agent` par défaut. Un dépôt sans `.claude/pointage.json` n'est pas pointé.
- Le temps après le dernier commit d'une session n'est pas compté, ni le temps de Théo hors session : réunion, recette, essais sur appareil. Ce dernier s'écrit à la main, `agent` `theo`.
- Deux agents en parallèle comptent chacun leur temps : la somme est du temps d'agents, pas du temps d'horloge.
- Le script n'utilise que la bibliothèque standard et ne bloque jamais la session : il se copie tel quel dans un dépôt client, sous `.claude/hooks/pointage.py`, avec son `.claude/pointage.json`.

## Todoist

La vue interne affiche « Ma todo » : les tâches ouvertes p1 et p2 des sections `Client · <nom>` du projet Todoist SKEAM, huit au plus, retards d'abord, puis par priorité et échéance, regroupées par client. Configuration : `todoist.json`, connecteur, id du projet, préfixe des sections, priorités, nombre maximal. Une section se rattache au projet dont `client.yaml` porte son `todoist.section_id`, sinon au projet de même nom ou slug, espaces et accents ignorés.

- **En direct** : publiée en artefact avec la capacité `mcp` sur le connecteur Todoist, outils `find-sections`, `find-tasks` et `complete-tasks`, la page relit Todoist toutes les minutes et Théo coche une tâche depuis la page. Les erreurs du connecteur s'affichent selon leur cause : reconnexion, accord à donner, Todoist indisponible.
- **Repli** : sans lecture directe, la page affiche l'instantané pris à la génération, passé à `rendre.py --todoist`, avec un lien vers chaque tâche ; Théo coche dans Todoist.

Format de l'instantané, écrit par `/dashboard` depuis le connecteur : `releve_le` date et heure ISO 8601, `partiel` vrai si `find-tasks` a répondu `hasMore`, `sections` la liste renvoyée par `find-sections`, `taches` la liste renvoyée par `find-tasks`. `rendre.py` n'en garde que les tâches ouvertes p1 et p2 des sections client, réduites à `id`, `content`, `priority`, `dueDate`, `sectionId`. Todoist n'entre jamais dans les vues commercial et client.

## artefacts.yaml

Clé racine `artefacts`, dictionnaire d'une clé par vue publiée vers son URL claude.ai ou null : `interne`, `commercial`, et `client-<slug>` pour la vue d'un client. Écrit par `/dashboard` après accord de Théo. Le dashboard se publie toujours en artefact, republié au même lien, aperçu compris ; jamais en simple fichier HTML.
