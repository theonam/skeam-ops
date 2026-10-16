---
name: skeam-cadrage
description: Génère ou met à jour le document de cadrage et le backlog d'un client SKEAM à partir de toutes ses synthèses et décisions, en signalant les contradictions entre sources au lieu de les trancher, et fait valider les items en attente. À utiliser quand Théo tape /skeam-cadrage, veut rédiger ou rafraîchir le cadrage d'un client, consolider le backlog après plusieurs réunions, ou valider les items marqués a_valider.
---

# /skeam-cadrage

Consolide tout ce qui a été dit et décidé en un cadrage à jour et un backlog cohérent. La commande rédige et propose ; Théo arbitre section par section et item par item. Quand deux sources se contredisent, elle le montre et laisse Théo trancher.

Lire d'abord `skills/commun.md` dans le clone de skeam-ops, puis CONTRAT.md sections 5, 9.2 à 9.4 et 10.

## Entrées

| Entrée | Si absente |
|---|---|
| Client : slug ou nom | question à choix multiples |
| Portée : complète, ou sections et lots précis | complète |
| Statut du document visé : brouillon, en relecture, validé par le client avec sa date | brouillon |

## Sources lues

Dans cet ordre de lecture, jamais `interne/` :

1. `syntheses/*.md`, par date croissante ;
2. `decisions.md` ;
3. `cadrage.md` actuel ;
4. `backlog/*.yaml` ;
5. `client.yaml` et `fiche.md`, pour le contexte ;
6. `transcripts/*.md`, seulement pour vérifier un passage ambigu d'une synthèse à son horodatage ;
7. les documents que Théo désigne, par exemple un cadrage fonctionnel ou une fiche prospect en doc Claude, lus par le connecteur Docs. Ils sont cités par leur titre et leur date en `Sources`, leur adresse en commentaire HTML. Leurs parties internes, prix, marges, stratégie, ne passent jamais dans `cadrage.md`.

Un backlog repris d'un document sans heures : `estimation_h` provisoire déduite de la taille, XS 2, S 4, M 8, L 16, XL 32, et la mention dans `notes`. Un item que les sources disent déjà construit peut être proposé `a_recetter` ou `en_cours` ; c'est Théo qui choisit.

## Sorties

- `cadrage.md` réécrit dans ses quatorze sections, CONTRAT.md section 9.3, pour les seules sections acceptées.
- Items du backlog ajoutés ou modifiés, après acceptation.
- Items `a_valider: true` validés, laissés en attente ou abandonnés, selon le choix de Théo.
- Rapport des contradictions entre sources, dans le chat et en `Questions ouvertes`.
- Proposition éventuelle de mise à jour de `client.yaml` : `statut` de `prospect` à `cadrage`, `dates.cadrage`.

## Étapes

### 1. Préparer

Étape 0 et identification du client, `skills/commun.md` sections 1 et 2. Mode **création** si `cadrage.md` n'a encore aucun contenu sous ses titres, mode **mise à jour** sinon.

### 2. Relever l'avancement réel du développement

Les statuts du backlog doivent refléter le code, pas seulement les réunions. Si le dépôt client contient un état d'avancement tenu par l'agent de développement, `docs/AUDIT.md` ou un fichier que Théo désigne, le lire et proposer pour chaque item concerné :

| L'état dit | Statut proposé |
|---|---|
| fait, testé | `a_recetter` : le code est livré, Théo n'a pas encore recetté |
| partiel, construit mais à essayer sur les appareils du client ou en attente d'un élément du client | `a_recetter`, avec ce qui manque en `notes` |
| partiel, une partie du besoin reste à coder | `en_cours` |
| à faire, ou absent | inchangé |

Jamais `fait` ni `abandonne` : ce sont les décisions de Théo. Présenter un tableau item, statut actuel, statut proposé, ligne de l'état qui le justifie, puis valider par groupe. Un hash de commit cité dans l'état va dans `commit`. La note de l'item cite la source : `Statut d'après docs/AUDIT.md du AAAA-MM-JJ, ligne D5.`

### 3. Construire le registre des faits

Pour chaque source, extraire les affirmations utiles au cadrage, chacune avec sa source précise : chemin et horodatage, ou chemin et titre d'entrée de décision. Les regrouper par sujet : profil, processus, objet métier, règle, exigence, donnée, intégration, lot, attendu du client.

### 4. Détecter les contradictions

Il y a contradiction quand deux sources donnent sur un même sujet des valeurs incompatibles : un plafond, un délai, un périmètre de lot, un droit, un format. Pour chacune :

- présenter les deux énoncés, mot pour mot, avec leurs sources et leurs dates ;
- ne rien trancher, même si une source est plus récente ou est une décision ; signaler seulement que l'une est plus récente ou formalisée ;
- proposer une puce `Questions ouvertes` neutre qui pose la question au client ou à Théo.

Une évolution explicitement décidée, par exemple une décision qui dit remplacer l'ancienne règle, n'est pas une contradiction : elle se traite comme une mise à jour, en citant la décision.

### 5. Rédiger la proposition de cadrage

Pour chacune des quatorze sections, dans l'ordre imposé :

- **Objet et statut** : objet, numéro de version incrémenté, date du jour, statut visé.
- **Règles de gestion** : `- **RGn** : énoncé`. Les numéros existants sont conservés. Une nouvelle règle prend le numéro suivant. Une règle retirée garde son numéro avec l'énoncé `abrogée`. Jamais de renumérotation, car les critères d'acceptation citent ces numéros.
- **Décisions** : résumé des décisions de `decisions.md` utiles au client, sans raison interne.
- **Questions ouvertes** : contradictions de l'étape 4 et tout ce qui n'a pas de source.
- **Sources** : un chemin par ligne, toutes les synthèses utilisées.
- Autres sections : uniquement des faits du registre. Une section sans fait reste vide ou porte `À préciser.`

Rédaction pour le client : ni tiret cadratin, ni parenthèse, ni estimation, ni prix, ni nom d'outil interne. Chaque paragraphe ou puce se termine par sa source en commentaire HTML : `<!-- syntheses/2026-10-08-lancement.md 00:12:30 -->`.

### 6. Arbitrage du cadrage, section par section

Pour chaque section qui change, montrer l'avant et l'après, puis demander `Accepter`, `Modifier`, `Rejeter`, quatre sections par question. Les sections inchangées ne sont pas présentées.

### 7. Proposer le backlog

Comparer le cadrage accepté au backlog :

| Constat | Proposition |
|---|---|
| Besoin du cadrage sans item | nouvel item, `a_valider: true`, `audience: interne`, `statut: a_faire`, estimation provisoire signalée en `notes` |
| Item dont un critère cite une RG abrogée ou absente | modification du critère |
| Item dont le lot contredit le Découpage en lots | modification du lot, ou question ouverte si la source est ambiguë |
| Deux items qui se recouvrent | signalement seulement ; jamais de fusion ni de suppression proposée sans source |

Les champs `statut`, `commit` et `maj` d'un item existant ne sont jamais modifiés par cette commande, sauf `maj` qui suit toute modification acceptée.

### 8. Valider les items en attente

Lister les items `a_valider: true`, y compris ceux ajoutés à l'étape 7, avec titre, lot, critères et source. Pour chacun :

1. `Valider`, `Laisser en attente`, `Abandonner`.
2. `Valider` : demander l'audience, `client`, `commercial` ou `interne`, puis écrire `a_valider: false` et l'audience. Si l'audience est `client`, vérifier titre et critères : ni tiret cadratin ni parenthèse.
3. `Abandonner` : `statut: abandonne`, sur choix explicite de Théo uniquement.

### 9. Appliquer et valider

1. Écrire `cadrage.md` et le backlog pour les seuls éléments acceptés.
2. Proposer, si le statut client est `prospect`, le passage à `cadrage` et `dates.cadrage` du jour : `Valider`, `Annuler`. Si accepté, reporter aussi le statut dans `clients.yaml` de skeam-ops, par un commit distinct sur skeam-ops, comme à l'étape 8 de `/skeam-nouveau-client`.
3. `python3 scripts/validate.py ../<nom>/projet`, puis traiter chaque avertissement de règle citée absente.

### 10. Committer et rendre compte

Question de commit, message `projet: skeam-cadrage version <n>`. Compte rendu selon `skills/commun.md` section 8, avec la liste des contradictions restées ouvertes. Suggérer `/skeam-chiffrage` si le backlog est stable, `/skeam-publier` si le cadrage doit être relu.

## Garde-fous

- Aucune contradiction tranchée par la commande.
- Aucun fait sans source. Aucune règle renumérotée.
- Aucun item supprimé du fichier ; un abandon passe par `statut: abandonne`, choisi par Théo.
- `decisions.md` n'est jamais modifié par cette commande : une décision nouvelle passe par `/skeam-import-transcript` ou par Théo.
- Aucune écriture hors du dépôt client, sauf le statut dans `clients.yaml` après accord.

## Idempotence

Relancer la commande sans nouvelle source ne produit aucune proposition : le cadrage est comparé au registre des faits, et seules les différences sont présentées. Le numéro de version n'augmente que si au moins une section est acceptée.

## Cas d'erreur

| Cas | Conduite |
|---|---|
| Aucune synthèse | S'arrêter et suggérer `/skeam-import-transcript`. |
| Dossier projet invalide au départ | Présenter les erreurs ; proposer de ne corriger que celles qui touchent `cadrage.md` ou le backlog, sinon s'arrêter. |
| Section imposée absente ou renommée dans `cadrage.md` | La rétablir à sa place dans la proposition ; le signaler. |
| Avertissement de règle citée absente | Proposer de corriger le critère ou de rétablir la règle ; ne rien décider seul. |
