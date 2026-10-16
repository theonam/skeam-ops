# Catalogue

Propriétaire : chantier catalogue, branche `feat/catalogue`, agent `ops-catalogue`. Audience interne : rien de ce dossier ne sort de SKEAM, sauf les lignes de devis du `.json` de chiffrage, relues par Théo.

Objectif : des devis au forfait justes, rapides et rentables, appuyés sur des heures mesurées plutôt que sur des intuitions.

## Contenu

| Chemin | Rôle |
|---|---|
| `modules.yaml` | catalogue des modules, CONTRAT.md 8.1 ; `mesures` est écrit par `calibrer.py` |
| `tarifs.yaml` | taux horaire cible, marges de sécurité par taille, plancher, CONTRAT.md 8.2 ; modifiable par Théo |
| `HYPOTHESES.md` | périmètre et justification des fourchettes de chaque module |
| `PROPOSITIONS-CONTRAT.md` | évolutions du contrat demandées par le chantier |
| `scripts/chiffrer.py` | chiffrage d'un backlog, CONTRAT.md 11.3 |
| `scripts/calibrer.py` | calibrage du catalogue sur le temps validé, CONTRAT.md 11.4 |
| `scripts/temps.py` | saisie du temps et relecture hebdomadaire, CONTRAT.md 6 |
| `scripts/methode.py` | méthode commune aux trois scripts |
| `tests/` | tests et jeu d'essai fictif : deux clients, un registre, un catalogue figé |
| `out/` | sorties non versionnées : `calibration.md`, sessions de temps ouvertes |

## Commandes

Depuis la racine de skeam-ops, environnement du README racine activé :

```sh
# Chiffrer un projet : écrit devis/chiffrage-AAAA-MM-JJ.md et .json
python catalogue/scripts/chiffrer.py <racine>/egm-app/projet --sortie <racine>/egm-app/projet/devis/

# Calibrer le catalogue sur le temps validé de tous les clients actifs, puis lire catalogue/out/calibration.md
python catalogue/scripts/calibrer.py --clients clients.yaml --racine <racine>
python catalogue/scripts/calibrer.py --clients clients.yaml --racine <racine> --recalculer

# Saisir le temps d'une session
python catalogue/scripts/temps.py start <chemin_projet> --agent egm-dev --item EGM-012
python catalogue/scripts/temps.py stop --agent egm-dev --note "Écran de saisie"
python catalogue/scripts/temps.py log <chemin_projet> --agent theo --debut 14:00 --fin 15:30 --note "Réunion de lancement"

# Relire la semaine et valider, réservé à Théo
python catalogue/scripts/temps.py week <racine>/egm-app/projet projet --semaine 2026-W42

# Tests et validation
python scripts/validate.py --catalogue catalogue/
python -m unittest discover -s catalogue/tests -p "test_*.py"
```

`--recalculer` est hors contrat 11.4 : sans lui, `calibrer.py` ne touche qu'aux mesures, comme le contrat l'exige, et le rapport affiche la confiance et le prix calculés sans les écrire. Voir `PROPOSITIONS-CONTRAT.md`.

`temps.py week --oui` valide sans poser de question : réservé à Théo, un agent ne valide jamais son propre temps.

## Méthode

### Chiffrage d'un projet

Items retenus : tous sauf `abandonne`, listés comme exclus ; `a_valider` est sans effet depuis le 2026-10-16. Les items `fait` sont inclus et signalés.

Pour chaque module du catalogue utilisé par le projet :

1. **Estimation du backlog** : somme des `estimation_h` de ses items.
2. **Heures probables du module** : l'estimation du backlog si la confiance du module est `faible` ; sinon le maximum de l'estimation du backlog et des heures de référence du module, ci-dessous. Le backlog porte la complexité propre au projet, les mesures portent la réalité observée : on garde le plus prudent, et le chiffrage signale tout relèvement.
3. **Répartition** : chaque item reçoit une part des heures probables, du min et du max du module, au prorata de son estimation. Un module découpé en plusieurs items, sur plusieurs lots, n'est donc compté qu'une fois.
4. **Min et max d'un item** : sa part de `heures_min` et `heures_max`, élargie si besoin pour contenir ses heures probables. Une estimation du backlog hors de la fourchette du catalogue est signalée.

Un item hors catalogue, `module: null`, ou sur un module absent du catalogue, est chiffré sur son estimation : probable égal à l'estimation, min à 80 %, max à 150 %. Il est signalé.

**Prix conseillé d'une ligne** : somme, sur ses items, des heures probables multipliées par 1 plus la marge de sécurité de la taille de l'item, multipliées par le taux horaire cible ; arrondi au multiple de 50 euros supérieur.

**Lignes du devis** : une ligne forfaitaire par lot pour les items `indispensable` et `souhaitable` ; puis une ligne par item `optionnel`, `Option n : titre`, numérotée par lot puis dans l'ordre du backlog, que le client choisit une à une. Sa description reprend les critères d'acceptation de l'item. Une option d'audience non client garde un titre neutre, `Option n, lot m`, signalé dans le `.md`. L'objet du devis ajoute « avec options au choix ». Titre : `Lot n : ` suivi du libellé du lot lu dans `cadrage.md`, section Découpage en lots. Description : la liste des fonctionnalités, une par ligne, titres des items d'audience `client` ; les autres sont chiffrés sans être nommés. Typographie du contrat 2.3 appliquée. TVA 20 %.

**Ordre des fonctionnalités** : règle de Théo, le devis liste les fonctionnalités de la plus importante pour le client, telle qu'elle ressort du transcript, à la moins importante. Le contrat n'ayant pas de champ pour cette importance, l'ordre suit la priorité de l'item, `indispensable` puis `souhaitable` puis `optionnel`, puis, à priorité égale, l'ordre des items dans le backlog. C'est donc à la rédaction du backlog, `/cadrage`, d'écrire les items dans l'ordre d'importance exprimé par le client. Voir `PROPOSITIONS-CONTRAT.md` pour un champ explicite.

**Plancher** : si le total des lignes hors options est sous `plancher_ht`, ces lignes sont relevées au prorata puis arrondies.

Le `.md` donne, par ligne puis par module, les heures min, probable et max, les prix correspondants sans marge, le prix conseillé et sa **couverture**, part du scénario max couverte par le prix conseillé. Une couverture sous 70 % est signalée : la fourchette est trop large pour un forfait serein.

### Heures de référence d'un module

Une **observation** est le total des heures mesurées d'un module chez un client : somme des mesures de ses items.

- Sans observation : milieu de la fourchette.
- Une ou deux observations : moyenne du milieu de la fourchette et de la médiane des observations.
- Trois observations ou plus : médiane des observations.

### Confiance d'un module

| Confiance | Condition |
|---|---|
| `forte` | au moins 3 observations, dont au moins 80 % dans la fourchette |
| `moyenne` | au moins 1 observation, dont au moins 60 % dans la fourchette |
| `faible` | sinon, en particulier sans observation |

Une confiance qui baisse indique une fourchette fausse : `calibration.md` propose une **fourchette suggérée**, la fourchette actuelle élargie aux observations tant qu'il y en a moins de 3, puis de la plus basse à la plus haute observation arrondies à la demi-heure. Théo reporte à la main les `heures_min` et `heures_max` qu'il retient.

### Prix conseillé d'un module

`prix_conseille_ht` : heures de référence, multipliées par 1 plus la marge de la `taille_type` du module, multipliées par le taux horaire cible, arrondi au multiple de 50 euros supérieur. C'est un repère de grille tarifaire ; le chiffrage d'un projet ne l'utilise pas directement, il recalcule à partir des heures. Après une modification de `tarifs.yaml`, relancer `calibrer.py --recalculer`.

### Calibrage

Conforme à CONTRAT.md 11.4 : une mesure par item `fait` dont `module` est non nul, chez chaque client actif, égale à la somme des minutes des lignes `valide: true` de l'item divisée par 60 et arrondie au centième. Un item sans temps validé n'a pas de mesure et figure dans les anomalies. `modules.yaml` est réécrit ligne à ligne : seuls les blocs `mesures`, et avec `--recalculer` les lignes `confiance` et `prix_conseille_ht`, changent ; commentaires et mise en forme sont conservés. La réécriture est relue et comparée au fichier d'origine ; au moindre autre écart, rien n'est écrit.

Le rapport `out/calibration.md` donne :

- par module : fourchette, réel par client, médiane, part dans la fourchette, estimation du backlog contre réel, confiance et prix actuels et calculés, fourchette suggérée ;
- par client : chaque item ayant du temps, estimation, réel validé, temps en attente, écart, avec une alerte pour un item non terminé qui dépasse déjà son estimation ; écart global des items faits ; temps hors item, réunions et gestion, rapporté au temps sur les items ;
- les anomalies : items faits sans temps validé, modules absents du catalogue, mesures retirées.

### Constantes

Arrondi de 50 euros, TVA de 20 %, facteurs hors catalogue de 80 % et 150 %, seuil de couverture de 70 %, seuils de confiance : en tête de `scripts/methode.py`. `tarifs.yaml` n'a pas de clé pour eux ; voir `PROPOSITIONS-CONTRAT.md`.

## Journal de temps

`temps.py` écrit une ligne conforme à CONTRAT.md 6 dans `temps/AAAA-MM-<agent>.jsonl` du projet donné : heures de Paris, `source` `theo` pour l'agent `theo` et `claude-code` sinon, `valide: false`. Une session qui passe minuit garde la date et le mois de son début. Chaque écriture valide d'abord le projet, puis contrôle la ligne, l'item et l'absence de doublon ; si le projet devient invalide, la ligne est retirée.

`start` garde l'heure de début dans `catalogue/out/temps/en-cours-<agent>.json`, une session ouverte par agent. `stop` refuse une session de moins d'une minute ou de plus de 24 heures ; `stop --annuler` l'abandonne.

`week` affiche la semaine de chaque projet donné : lignes, totaux par agent et par item, cumul de chaque item face à son estimation. Puis il demande confirmation avant de passer à `valide: true` les lignes non validées de la semaine affichée ; seules ces lignes changent, les autres restent identiques à l'octet près.
