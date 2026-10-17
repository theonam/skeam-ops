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
| `todoist.json` | configuration de la todo Todoist de la vue interne |
| `skills/skeam-dashboard/SKILL.md` | commande `/skeam-dashboard` |
| `skills/skeam-calibrer/SKILL.md` | commande `/skeam-calibrer` |
| `skills/skeam-bilan/SKILL.md` | commande `/skeam-bilan` |
| `scripts/conso.py` | consommation des agents, vue interne : lecture de `.skeam/conso/` sur toutes les branches, dédoublonnage, coût, ventilation par projet, lot et item |
| `tarifs-modeles.yaml` | tarifs datés des modèles Claude, USD par million de jetons, prix à confirmer signalés ; CONTRAT.md section 15.3 |
| `scripts/bilan_temps.py` | temps d'une session mesuré sur son historique, réparti par item d'après les commits |
| `tests/` | tests et données fictives : clients `alpha` et `beta`, client inactif `gamma`, projet `ops` |
| `PROPOSITIONS-CONTRAT.md` | évolutions du contrat proposées à Théo |
| `out/` | sorties générées, non versionnées |

## Usage

Depuis la racine de skeam-ops, les clones des dépôts clients rangés dans `<racine>` :

```sh
python dashboard/scripts/agreger.py --clients clients.yaml --racine <racine> --audience interne --sortie dashboard/out/interne.json [--tarifs dashboard/tarifs-modeles.yaml]
python dashboard/scripts/conso.py <racine d'un dépôt>     # résumé du relevé d'un dépôt, pour contrôle
python dashboard/scripts/rendre.py dashboard/out/interne.json --sortie dashboard/out/interne.html --todoist dashboard/out/todoist.json
python dashboard/scripts/rendre.py dashboard/out/client.json --sortie dashboard/out/client-egm.html --projet egm
python -m unittest discover -s dashboard/tests -p "test_*.py"
```

`agreger.py` valide le registre et chaque dossier projet avec `scripts/validate.py` avant toute lecture, liste toutes les erreurs sur la sortie d'erreur et s'arrête alors avec le code 1 sans rien écrire ; les avertissements du validateur sont ignorés. Il ne lit jamais `projet/interne/`. Avant d'écrire une vue `commercial` ou `client`, il vérifie qu'aucune clé interne n'y figure et refuse d'écrire sinon.

`rendre.py --projet` ne garde qu'un projet de la vue client, pour qu'un client ne voie jamais les autres. Il est refusé, code 2, sur les autres vues, dont les totaux portent sur tout le portefeuille.

## Bilan de session

`/skeam-bilan` relit l'historique d'une session et met à jour le pilotage : statuts d'items, besoins découverts, lignes de temps, après validation de Théo. Le temps vient de `bilan_temps.py`, jamais d'une estimation :

```sh
python dashboard/scripts/bilan_temps.py --historique <session.jsonl> --depot <dépôt> --agent EGM=egm-dev --agent OPS=ops-dashboard [--marque-commit <session>] [--ecrire]
```

- Activité : horodatages des messages de Théo et de l'agent ; une pause de plus de 20 minutes, `--pause`, arrête la période.
- Répartition : le temps avant un commit `<ID>: …` revient à cet item, la fin d'une période au dernier commit, une période sans commit au commit suivant ; le reste est signalé dans `avertissements`.
- Sortie : JSON des lignes proposées par fichier de temps ; le temps déjà journalisé dans l'un de ces fichiers, quel qu'en soit l'agent, est retiré des lignes proposées et signalé dans `deja`. `--ecrire` n'ajoute que les `nouvelles`, en fin de fichier.

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
| Prochaine étape d'un devis | déduite du statut du devis et de ses factures : finaliser et envoyer le devis, le faire signer puis envoyer la facture, émettre la facture, envoyer la facture, attendre le paiement, relancer un paiement en retard, payé |
| Couleurs des statuts | orange quand l'action est de notre côté, devis ou facture à envoyer ; bleu quand on attend le client, devis à signer, facture en attente de paiement ; vert quand c'est acquis, devis signé, facture payée ; rouge pour un refus ou un retard |
| Fonctionnalités supplémentaires facturables | vue commerciale : les items visibles, hors abandonnés, qui ne sont dans aucun devis envoyé ou signé, avec leur `prix_vente_ht`, « prix à définir » sinon, et le total ; un devis en brouillon n'apparaît pas, ses fonctionnalités sont dans cette liste |
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
| Temps machine des agents | vue interne : somme des `minutes_actives` des lignes de `.skeam/conso/`, multipliées par la part de chaque item ; quatre agents pendant une heure font quatre heures. Par projet, lot et item ; la semaine retient les lignes qui commencent dans la semaine |
| Part estimée des agents | vue interne : temps machine et coût des lignes liées par `session`, rattachées d'après les autres agents de leur run de workflow, CONTRAT.md section 15.2 ; comptés dans le temps machine et montrés à part, « dont … estimées » |
| Durée réelle des agents | vue interne : longueur de la réunion des périodes actives des lignes qui touchent le projet, le lot ou l'item ; quatre agents en parallèle pendant une heure font une heure |
| Coût des agents | vue interne : jetons de chaque modèle au tarif de `tarifs-modeles.yaml` en vigueur au début de la ligne, écriture du cache au prix 5 minutes plus le supplément 1 heure pour sa part 1 heure, prix au-delà de 100 000 jetons de prompt quand ils existent, recherches web ; coût au tarif de l'API, pas une facture d'abonnement. Un modèle sans tarif rend le coût inconnu, jamais nul ; « tarifs à confirmer » si un prix listé dans `a_confirmer` a servi |
| Rattachement des agents | items de chaque ligne, CONTRAT.md section 15.2 ; un item rejoint son lot par le backlog et son projet par son préfixe ; un id absent du backlog va dans `items_hors_backlog`, une ligne sans item ou d'un préfixe inconnu dans `hors_item` du premier dépôt où elle est trouvée. Une ligne lue dans plusieurs dépôts ou branches compte une fois. Ces chiffres ne s'ajoutent jamais au temps passé validé ni aux heures vendues |
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
  conso                           consommation des agents de tous les projets, voir plus bas
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
  conso                           null sans relevé, sinon depuis, sessions, agents, heures_machine, heures_reelles,
                                  semaine_heures_machine, semaine_heures_reelles, semaine_cout_usd,
                                  jetons : entree, sortie, lecture_cache, ecriture_cache ; cout_usd ou null,
                                  tarifs_a_confirmer, modeles_sans_tarif[], par_modele[] : modele, heures_machine, jetons_total, cout_usd,
                                  hors_item : heures_machine, cout_usd ; estime : heures_machine, cout_usd, part liée par session ;
                                  items_hors_backlog[] : id, heures_machine, cout_usd
  items[]                         id, titre, lot, statut, priorite, maj, module, taille, estimation_h,
                                  heures_reelles, audience, dependances_externes[], conso
```

`lots[].conso` et `items[].conso` : null, ou `heures_machine`, `heures_machine_estimees`, part de `heures_machine` liée par `session`, `heures_reelles`, `jetons_total`, `cout_usd`. `global.conso` : null, ou `heures_machine`, `heures_reelles`, `cout_usd`, `semaine_heures_machine`, `semaine_heures_reelles`, `semaine_cout_usd`, `tarifs_du`, date d'effet la plus récente utilisée, `tarifs_a_confirmer`. Coûts en USD à deux décimales.

`prochaine_echeance` vaut null ou `date`, `libelle`, `source` id d'action ou `client.yaml`, `en_retard`, `dans_jours`.

Types d'alerte : `depassement_lot` et `depassement_item` haute, `bloque_externe` moyenne, `en_cours_ancien` moyenne, `registre_desynchronise` basse quand le statut de `clients.yaml` diffère de celui de `client.yaml`, qui fait foi, `conso_tarif_manquant` basse quand un modèle relevé n'a pas de tarif, `conso_sessions_sans_releve` basse quand des commits portent la marque `Claude-Session` d'une session absente de tout relevé depuis le premier relevé du dépôt, crochet Git probablement inactif.

La todo ne vient plus du dépôt mais de Todoist, voir plus bas. Les actions de `actions.yaml` restent dans le détail du projet ; leurs retards ne font plus d'alerte, Todoist faisant foi pour la todo. Les devis à envoyer sont un compteur par projet, dépliable ; recettes et validations ne s'affichent plus.

### Vue commercial

Clients seulement, jamais de temps, d'estimation, de tarif, de marge, d'action, de dépendance ni de consommation des agents.

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

## Gabarit figé, version 6

Décision de Théo du 2026-10-16 : le gabarit est gravé. `format.json` fixe la version, les clés exactes de chaque objet de la sortie par audience et les blocs de la page ; `template.html` porte la même version dans `<meta name="skeam:gabarit">` et un attribut `data-bloc` par bloc. Les tests de `TestGabaritFige` échouent dès qu'une clé ou un bloc change.

- Version 1, 2026-10-16 : premier gabarit gravé.
- Version 2, 2026-10-16, demande de Théo : temps passé par lot toujours affiché et libellé, clé `temps.depuis`.
- Version 3, 2026-10-16, demandes de Théo : bloc Devis et lots, clés `devis[].perimetre`, `devis[].factures`, `hors_devis` ; sous chaque lot, le temps passé seul.
- Version 4, 2026-10-16, demandes de Théo : vue commerciale minimaliste, réduite à la facturation, l'avancement, la satisfaction du client et ce qui peut se vendre ; prochaine étape de chaque devis ; statuts de devis et de facture en couleur dans toutes les vues ; clé `ids` des parties de lot, pour nommer les fonctionnalités.
- Version 6, 2026-10-17, demande de Théo : temps et consommation des agents ; clés `conso` du projet, des lots, des items et du global, vue interne seulement ; bloc « Agents : temps machine et coût » après Heures et budget, ligne Agents sous chaque lot, temps machine et coût des agents dans la liste des items, tuile « Agents cette semaine ».
- Version 7, 2026-10-17, relecture du relevé : part estimée des agents montrée à part, clés `conso.estime` du projet et `heures_machine_estimees` des lots et des items.
- Version 5, 2026-10-16, demande de Théo : dans la vue commerciale, « Fonctionnalités supplémentaires facturables » remplace le devis en brouillon et la liste des fonctionnalités hors devis : chacune avec son prix de vente, champ `prix_vente_ht` du backlog, et le total ; clé `facturables` ; la date de cadrage s'affiche « onboarding ».

Blocs, dans l'ordre d'affichage :

| Vue | Blocs |
|---|---|
| interne | bandeau ; todo, alertes et devis à envoyer ; chiffres clés ; portefeuille ; charge de la semaine ; détail par projet : infos, heures et budget, agents, devis et lots, avancement par lot, listes de pilotage, dernière synthèse, items par lot |
| commercial | bandeau ; points d'attention, seulement s'il y en a ; chiffres : à faire signer, signé, facturé, encaissé, run annuel ; portefeuille ; détail par projet : infos, devis, facturation et avancement par lot avec la prochaine étape et les fonctionnalités à vendre en plus, dernier échange avec le client, toutes les fonctionnalités prévues repliées |
| client | bandeau ; détail : liens, avancement par lot, items par lot |

Pour faire évoluer le gabarit : accord de Théo, puis dans la même pull request `format.json` et `template.html` à la version suivante, ce README et les tests. Les commandes du chat ne modifient jamais le gabarit : elles le prennent tel quel sur `main`.

## Todoist

La vue interne affiche « Ma todo » : les tâches ouvertes p1 et p2 des sections `Client · <nom>` du projet Todoist SKEAM, huit au plus, retards d'abord, puis par priorité et échéance, regroupées par client. Configuration : `todoist.json`, connecteur, id du projet, préfixe des sections, priorités, nombre maximal. Une section se rattache au projet dont `client.yaml` porte son `todoist.section_id`, sinon au projet de même nom ou slug, espaces et accents ignorés.

- **En direct** : publiée en artefact avec la capacité `mcp` sur le connecteur Todoist, outils `find-sections`, `find-tasks` et `complete-tasks`, la page relit Todoist toutes les minutes et Théo coche une tâche depuis la page. Les erreurs du connecteur s'affichent selon leur cause : reconnexion, accord à donner, Todoist indisponible.
- **Repli** : sans lecture directe, la page affiche l'instantané pris à la génération, passé à `rendre.py --todoist`, avec un lien vers chaque tâche ; Théo coche dans Todoist.

Format de l'instantané, écrit par `/skeam-dashboard` depuis le connecteur : `releve_le` date et heure ISO 8601, `partiel` vrai si `find-tasks` a répondu `hasMore`, `sections` la liste renvoyée par `find-sections`, `taches` la liste renvoyée par `find-tasks`. `rendre.py` n'en garde que les tâches ouvertes p1 et p2 des sections client, réduites à `id`, `content`, `priority`, `dueDate`, `sectionId`. Todoist n'entre jamais dans les vues commercial et client.

## artefacts.yaml

Clé racine `artefacts`, dictionnaire d'une clé par vue publiée vers son URL claude.ai ou null : `interne`, `commercial`, et `client-<slug>` pour la vue d'un client. Écrit par `/skeam-dashboard` après accord de Théo. Le dashboard se publie toujours en artefact, republié au même lien, aperçu compris ; jamais en simple fichier HTML.
