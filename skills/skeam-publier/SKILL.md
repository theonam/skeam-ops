---
name: skeam-publier
description: Génère la vue interne, commerciale ou client d'un projet SKEAM selon les règles d'audience du contrat et la publie en doc Claude après validation, puis enregistre l'URL dans client.yaml. À utiliser quand Théo tape /skeam-publier, veut un document lisible de l'état d'un projet, une vue pour Jonathan, ou un document de suivi à partager lui-même avec un client.
---

# /skeam-publier

Transforme le dossier projet en un document lisible pour une audience donnée et le publie en doc Claude. Le filtrage est fait par un script à liste blanche, pas à la main : la vue client ne peut contenir ni estimation, ni temps, ni note, ni tarif, ni rien de `interne/`. Publier n'est pas envoyer : le document reste privé tant que Théo ne le partage pas lui-même.

Lire d'abord `skills/commun.md` dans le clone de skeam-ops, puis CONTRAT.md section 10.

## Entrées

| Entrée | Si absente |
|---|---|
| Client : slug ou nom | question à choix multiples |
| Audience : `interne`, `commercial`, `client` | question à choix multiples |

## Sorties

- Un doc Claude intitulé `<nom> : suivi du projet` pour l'audience client, `<nom> : vue commerciale` ou `<nom> : vue interne` sinon, créé ou mis à jour.
- Son URL dans `client.yaml`, champ `liens.docs_client`, `liens.docs_commercial` ou `liens.docs_interne`.

## Contenu de la vue

Produit par `skills/skeam-publier/vue.py`, d'après CONTRAT.md section 10 :

| Bloc | client | commercial | interne |
|---|---|---|---|
| Nom et statut du projet | oui | oui | oui |
| Raison sociale, SIREN, adresse, contacts, apporteur, dates, montants, devis | non | oui | oui |
| Liens démo, production, documents client | oui | oui | oui |
| Lien documents commerciaux | non | oui | oui |
| Dépôt, documents internes, ids Todoist | non | non | oui |
| Avancement par lot, en nombre d'items | oui | oui | oui, plus estimations et temps passé |
| Items `client` hors `a_valider` : id, titre, statut, priorité, critères, date de mise à jour | oui | oui | oui |
| Items `commercial` hors `a_valider`, champ module | non | oui | oui |
| Items `interne` et `a_valider`, taille, estimation, dépendances, commit, notes, audience | non | non | oui |
| Cadrage et synthèses, sans commentaires HTML | oui | oui | oui |
| Fiche client | non | oui | oui |
| Actions, décisions, temps, liste des transcripts et chiffrages | non | non | oui |
| `interne/` | jamais | jamais | jamais |

## Étapes

### 1. Préparer

Étape 0 et identification du client, `skills/commun.md` sections 1 et 2. RG6 : un dossier invalide n'est jamais publié.

### 2. Générer la vue

```sh
cd "$RACINE/skeam-ops"
python3 skills/skeam-publier/vue.py ../<nom>/projet --audience <audience> --sortie /tmp/skeam-vue-<slug>-<audience>.md
```

| Code | Conduite |
|---|---|
| 0 | Continuer. |
| 1 | Dossier invalide, ou vue client avec un tiret cadratin ou une parenthèse : montrer la sortie d'erreur, corriger la source dans le dépôt, jamais la vue, et relancer. |
| 2 | Usage incorrect : vérifier la commande. |

La vue n'est jamais écrite dans le dépôt.

### 3. Relire avant publication

1. Lire le fichier produit en entier.
2. Pour l'audience client, vérifier en plus qu'il ne contient : aucun montant, aucune durée en heures en dehors des textes du cadrage et des synthèses, aucun id d'item absent du backlog client, aucun nom d'outil interne. Tout doute bloque la publication et se signale à Théo.
3. Si le doc existe déjà, le lire et préparer la liste des sections qui changent.
4. Présenter à Théo : audience, titre, plan du document, nombre d'items par lot, sections modifiées depuis la dernière publication.

### 4. Validation

Une question, deux sous-questions :

1. Publier la vue `<audience>` en doc Claude : `Valider`, `Voir le texte complet`, `Annuler`. `Voir le texte complet` affiche la vue puis repose la question.
2. Enregistrer l'URL dans `client.yaml` et committer : `Valider`, `Annuler`.

### 5. Publier

1. Charger le guide du connecteur Docs Claude avant le premier appel, rubriques index et édition. Le connecteur n'importe pas de fichier texte : le contenu passe dans les appels. Découper la vue par titre de niveau 2, et le backlog par lot.
2. `liens.docs_<audience>` renseigné : mettre à jour ce document en remplaçant tout son contenu par la vue. Jamais de second document pour la même audience.
3. Sinon : créer le document avec le titre de la section Sorties, le bandeau date et auteur, une phrase qui dit d'où vient la vue, et un bloc en attente par section. L'ouvrir pour Théo, puis remplacer chaque bloc en attente par sa section, un appel par section, dans l'ordre de lecture.
4. Ne jamais partager le document, inviter quelqu'un ni changer sa visibilité.

### 6. Enregistrer l'URL

Écrire l'URL `https://` du document dans `liens.docs_<audience>` si elle est nouvelle, valider le dossier, puis commit `projet: skeam-publier vue <audience>`.

### 7. Compte rendu

Selon `skills/commun.md` section 8, avec l'URL du document. Pour l'audience client, rappeler que le partager avec le client est une décision et un geste de Théo.

## Garde-fous

- La vue vient uniquement de `vue.py`. Aucun ajout à la main, aucune donnée lue ailleurs. Une correction passe par les sources du dépôt, puis une nouvelle génération.
- Aucune publication sans `Valider`. Aucun partage, jamais.
- `interne/` n'est jamais lu.
- La vue interne contient contacts, montants et temps : son document reste privé à Théo.

## Idempotence

- Un document par audience et par client, retrouvé par `liens.docs_<audience>` : une relance met à jour le même document.
- Relancer sans changement dans le dépôt produit la même vue, à la date de mise à jour près ; la relecture le signale et la publication peut être annulée.
- L'URL n'est réécrite dans `client.yaml` que si elle change.

## Cas d'erreur

| Cas | Conduite |
|---|---|
| Document de `liens.docs_<audience>` introuvable ou inaccessible | Le dire ; proposer d'en créer un nouveau et de remplacer l'URL. |
| Vue client refusée par `vue.py` | Le texte fautif est dans une source destinée au client : le corriger dans le dépôt avec l'accord de Théo, puis relancer. |
| Connecteur Docs Claude indisponible | S'arrêter ; la vue reste dans le fichier temporaire, que Théo peut lire dans le chat. |
| Dossier projet invalide | S'arrêter, présenter les erreurs. |
