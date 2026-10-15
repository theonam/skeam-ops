# Propositions d'évolution du contrat, chantier cadrage

Format : CONTRAT.md section 14. Entrées ajoutées en fin de fichier.

## 2026-10-15 /publier rattachée au chantier cadrage

- **Besoin** : la consigne du chantier cadrage demande d'écrire /publier dans `skills/publier/`, alors que CONTRAT.md section 11.7, le README et `dashboard/README.md` la rangent au chantier dashboard, dans `dashboard/skills/publier/`.
- **Proposition** : section 11.7, passer /publier au chantier cadrage, emplacement `skills/publier/`, rôle inchangé ; mettre à jour la carte du README et `dashboard/README.md`.
- **Hypothèse retenue en attendant** : `skills/publier/` est livrée par le chantier cadrage, item OPS-306. Le chantier dashboard n'a pas à écrire une seconde /publier.
- **Impact** : CONTRAT.md 11.7, README.md, dashboard/README.md, chantier dashboard.

## 2026-10-15 Script de vue par audience

- **Besoin** : la vue client ne doit jamais laisser passer une estimation, un temps, une note ou un tarif. Un filtrage rédigé par le modèle n'offre pas cette garantie ; il faut un script à liste blanche. La section 11.7 dit qu'une commande n'orchestre que les scripts listés en section 11.
- **Proposition** : ajouter une section 11.8 « Vue par audience, chantier cadrage » : `python skills/publier/vue.py <chemin_projet> --audience interne|commercial|client [--sortie fichier.md]`, Markdown, codes 0, 1, 2, refus de la vue client si tiret cadratin ou parenthèse. À terme, `vue.py` peut lire la sortie de `agreger.py` au lieu du dossier projet, pour qu'un seul code applique la section 10.
- **Hypothèse retenue en attendant** : `skills/publier/vue.py` lit le dossier projet par `scripts/contrat.py` et applique la section 10 ; testé par `skills/tests/test_vue.py`.
- **Impact** : CONTRAT.md 11, chantier dashboard pour la convergence avec `agreger.py`, item OPS-307.

## 2026-10-15 Commentaire de contexte des tâches Todoist

- **Besoin** : /sync-todoist doit retrouver l'action d'une tâche Todoist même sans `todoist_id`, après une synchronisation interrompue, et chaque tâche doit porter sa source et sa raison. Le format n'est pas fixé, et d'autres outils de Théo créent aussi des tâches dans le projet SKEAM.
- **Proposition** : section 7, fixer la description des tâches créées depuis `actions.yaml` à trois lignes, `Source : <dépôt> · projet/<source>`, `Raison : <contexte>`, `Réf : <id de l'action>` ; fixer le nom de section `Client · <nom>` dans le projet Todoist SKEAM.
- **Hypothèse retenue en attendant** : ce format, décrit dans `skills/commun.md` section 7.
- **Impact** : CONTRAT.md 4 et 7, skills nouveau-client et sync-todoist, tout autre outil qui crée des tâches pour un client.

## 2026-10-15 Horodatage des sources en commentaire HTML

- **Besoin** : chaque fait d'une synthèse ou du cadrage doit citer sa source, mais ces documents vont au client, qui n'a pas à lire des horodatages.
- **Proposition** : section 9.2 et 9.3, documenter l'usage `<!-- chemin HH:MM:SS -->` en fin de puce ou de paragraphe, ignoré par le validateur et retiré à la publication.
- **Hypothèse retenue en attendant** : usage appliqué par /import-transcript et /cadrage, commentaires retirés par `vue.py`.
- **Impact** : CONTRAT.md 9.2 et 9.3, `templates/dossier-client/`.

## 2026-10-15 Écritures des commandes du chat dans clients.yaml et messages de commit

- **Besoin** : le README réserve `clients.yaml` à Théo, alors que /nouveau-client doit y ajouter une entrée et /cadrage peut y reporter un statut. Les commits des commandes ne portent pas de code et n'ont pas d'id d'item, alors que les consignes d'agent imposent l'id en tête de message.
- **Proposition** : README, préciser que `clients.yaml` est aussi modifié par les commandes du chat sur validation explicite de Théo. Section 11.7, fixer le préfixe `projet: <commande> <résumé>` pour les commits des commandes sur un dépôt client, et `registre: ...` sur skeam-ops.
- **Hypothèse retenue en attendant** : ces deux règles, appliquées après validation de Théo, `skills/commun.md` section 6.
- **Impact** : README.md, CONTRAT.md 11.7, `templates/dossier-client/CLAUDE-projet.md`.

## 2026-10-15 Passages sensibles d'une réunion

- **Besoin** : une réunion peut évoquer un budget, un prix ou une appréciation qui n'ont pas leur place dans une synthèse destinée au client. Aucun fichier du contrat ne peut les recevoir : `interne/` n'est écrit par aucun agent sans instruction explicite.
- **Proposition** : autoriser /import-transcript à écrire, sur choix explicite de Théo dans l'arbitrage, une note `interne/reunions/AAAA-MM-JJ-sujet.md`, jamais lue par un script.
- **Hypothèse retenue en attendant** : les passages sensibles sont écartés de la synthèse et signalés à Théo dans le compte rendu, sans écriture dans le dépôt. Le transcript brut les conserve.
- **Impact** : CONTRAT.md 3 et 10, skill import-transcript.
