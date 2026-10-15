# Propositions d'évolution du contrat, chantier cadrage

Format : CONTRAT.md section 14. Entrées ajoutées en fin de fichier.

## 2026-10-15 /publier rattachée au chantier cadrage

- **Besoin** : la consigne du chantier cadrage demande d'écrire /publier dans `skills/publier/`, alors que CONTRAT.md section 11.7, le README et `dashboard/README.md` la rangent au chantier dashboard, dans `dashboard/skills/publier/`.
- **Proposition** : section 11.7, passer /publier au chantier cadrage, emplacement `skills/skeam-publier/`, rôle inchangé ; mettre à jour la carte du README et `dashboard/README.md`.
- **Hypothèse retenue en attendant** : `skills/skeam-publier/` est livrée par le chantier cadrage, item OPS-306. Le chantier dashboard n'a pas à écrire une seconde commande de publication.
- **Impact** : CONTRAT.md 11.7, README.md, dashboard/README.md, chantier dashboard.

## 2026-10-15 Script de vue par audience

- **Besoin** : la vue client ne doit jamais laisser passer une estimation, un temps, une note ou un tarif. Un filtrage rédigé par le modèle n'offre pas cette garantie ; il faut un script à liste blanche. La section 11.7 dit qu'une commande n'orchestre que les scripts listés en section 11.
- **Proposition** : ajouter une section 11.8 « Vue par audience, chantier cadrage » : `python skills/skeam-publier/vue.py <chemin_projet> --audience interne|commercial|client [--sortie fichier.md]`, Markdown, codes 0, 1, 2, refus de la vue client si tiret cadratin ou parenthèse. À terme, `vue.py` peut lire la sortie de `agreger.py` au lieu du dossier projet, pour qu'un seul code applique la section 10.
- **Hypothèse retenue en attendant** : `skills/skeam-publier/vue.py` lit le dossier projet par `scripts/contrat.py` et applique la section 10 ; testé par `skills/tests/test_vue.py`.
- **Impact** : CONTRAT.md 11, chantier dashboard pour la convergence avec `agreger.py`, item OPS-307.

## 2026-10-15 Commentaire de contexte des tâches Todoist

- **Besoin** : /skeam-sync-todoist doit retrouver l'action d'une tâche Todoist même sans `todoist_id`, après une synchronisation interrompue, et chaque tâche doit porter sa source et sa raison. Le format n'est pas fixé, et d'autres outils de Théo créent aussi des tâches dans le projet SKEAM.
- **Proposition** : section 7, fixer la description des tâches créées depuis `actions.yaml` à trois lignes, `Source : <dépôt> · projet/<source>`, `Raison : <contexte>`, `Réf : <id de l'action>` ; fixer le nom de section `Client · <nom>` dans le projet Todoist SKEAM.
- **Hypothèse retenue en attendant** : ce format, décrit dans `skills/commun.md` section 7.
- **Impact** : CONTRAT.md 4 et 7, skills skeam-nouveau-client et skeam-sync-todoist, tout autre outil qui crée des tâches pour un client.

## 2026-10-15 Horodatage des sources en commentaire HTML

- **Besoin** : chaque fait d'une synthèse ou du cadrage doit citer sa source, mais ces documents vont au client, qui n'a pas à lire des horodatages.
- **Proposition** : section 9.2 et 9.3, documenter l'usage `<!-- chemin HH:MM:SS -->` en fin de puce ou de paragraphe, ignoré par le validateur et retiré à la publication.
- **Hypothèse retenue en attendant** : usage appliqué par /skeam-import-transcript et /skeam-cadrage, commentaires retirés par `vue.py`.
- **Impact** : CONTRAT.md 9.2 et 9.3, `templates/dossier-client/`.

## 2026-10-15 Écritures des commandes du chat dans clients.yaml et messages de commit

- **Besoin** : le README réserve `clients.yaml` à Théo, alors que /skeam-nouveau-client doit y ajouter une entrée et /skeam-cadrage peut y reporter un statut. Les commits des commandes ne portent pas de code et n'ont pas d'id d'item, alors que les consignes d'agent imposent l'id en tête de message.
- **Proposition** : README, préciser que `clients.yaml` est aussi modifié par les commandes du chat sur validation explicite de Théo. Section 11.7, fixer le préfixe `projet: <commande> <résumé>` pour les commits des commandes sur un dépôt client, et `registre: ...` sur skeam-ops.
- **Hypothèse retenue en attendant** : ces deux règles, appliquées après validation de Théo, `skills/commun.md` section 6.
- **Impact** : README.md, CONTRAT.md 11.7, `templates/dossier-client/CLAUDE-projet.md`.

## 2026-10-15 Passages sensibles d'une réunion

- **Besoin** : une réunion peut évoquer un budget, un prix ou une appréciation qui n'ont pas leur place dans une synthèse destinée au client. Aucun fichier du contrat ne peut les recevoir : `interne/` n'est écrit par aucun agent sans instruction explicite.
- **Proposition** : autoriser /skeam-import-transcript à écrire, sur choix explicite de Théo dans l'arbitrage, une note `interne/reunions/AAAA-MM-JJ-sujet.md`, jamais lue par un script.
- **Hypothèse retenue en attendant** : les passages sensibles sont écartés de la synthèse et signalés à Théo dans le compte rendu, sans écriture dans le dépôt. Le transcript brut les conserve.
- **Impact** : CONTRAT.md 3 et 10, skill skeam-import-transcript.

## 2026-10-15 Commandes du chat préfixées par skeam

- **Besoin** : Théo veut retrouver facilement ses commandes parmi toutes ses skills claude.ai. CONTRAT.md section 11.7 impose un dossier `<nom>/SKILL.md` au nom de la commande, et nomme /nouveau-client, /import-transcript, /cadrage, /chiffrage, /sync-todoist et /publier.
- **Proposition** : section 11.7, préfixer toutes les commandes du chat par `skeam-` : /skeam-nouveau-client, /skeam-import-transcript, /skeam-cadrage, /skeam-chiffrage, /skeam-sync-todoist, /skeam-publier, et de même /skeam-dashboard et /skeam-calibrer pour le chantier dashboard. Section 7 : `todoist_id` écrit par /skeam-sync-todoist. Mettre à jour la carte du README et `projet/cadrage.md`.
- **Hypothèse retenue en attendant** : dossiers `skills/skeam-<commande>/` et champ `name` des skills préfixés, sur demande de Théo du 2026-10-15.
- **Impact** : CONTRAT.md 7 et 11.7, README.md, projet/cadrage.md, chantier dashboard.
