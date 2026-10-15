# Cadrage SKEAM ops

## Objet et statut

Cadrage du système de pilotage des projets clients de SKEAM, porté par le dépôt theonam/skeam-ops et géré comme un projet interne, slug ops. Version 1 du 2026-10-15, brouillon à relire par Théo.

## Objectifs

- Piloter chaque projet client depuis son dépôt Git, source de vérité unique.
- Produire à la demande documents, dashboard, tâches Todoist et brouillons de devis Dougs, sans saisie en double.
- Chiffrer les devis à partir d'un catalogue de modules calibré sur le temps réellement passé.
- Permettre à plusieurs agents Claude Code de travailler en parallèle sans se gêner.

## Profils et droits

- **Théo** : chef de projet et seul décideur ; voit tout, valide les items, passe les items à fait, relit le temps, modifie le contrat.
- **Jonathan** : associé commercial ; voit l'audience commercial, sans temps, estimations, tarifs ni code.
- **Client** : voit l'audience client, publiée sur commande de Théo.
- **Agent de chantier** : conversation Claude Code de skeam-ops ; modifie son dossier, son fichier de backlog et son fichier de temps.
- **Agent de développement** : conversation Claude Code d'un dépôt client ; suit projet/CLAUDE-projet.md.

## Processus cible

Premier contact, puis /nouveau-client. Réunions enregistrées sur Plaud, puis /import-transcript. Cadrage et backlog par /cadrage. Devis par /chiffrage, envoyé par Théo depuis Dougs. Développement par les agents, recette par Théo. Suivi par /dashboard, /sync-todoist et /publier. Calibrage du catalogue par /calibrer en fin de lot.

## Objets métier

- **Client** : projet/client.yaml et entrée du registre clients.yaml.
- **Item** : besoin livrable du backlog, rattaché à un lot et à un module.
- **Action** : tâche personnelle de Théo, synchronisée avec Todoist.
- **Ligne de temps** : session de travail d'un agent ou de Théo.
- **Module** : brique du catalogue, avec fourchette d'heures et mesures réelles.
- **Chiffrage** : lignes de devis prêtes pour Dougs.

## Règles de gestion

- **RG1** : rien n'est envoyé à un client automatiquement ; chaque envoi est fait par Théo.
- **RG2** : seul Théo passe un item à fait ou à abandonne.
- **RG3** : tout item créé par un agent sans accord de Théo porte a_valider true et audience interne.
- **RG4** : projet/interne/ n'est jamais lu par un script ni publié.
- **RG5** : seul Théo modifie CONTRAT.md, schemas/ et scripts/ ; un chantier propose dans son PROPOSITIONS-CONTRAT.md.
- **RG6** : un dossier projet invalide pour scripts/validate.py n'est ni agrégé, ni chiffré, ni publié.
- **RG7** : seules les lignes de temps relues par Théo, valide true, alimentent le calibrage.

## Exigences

- Scripts en Python 3.11 ou bash, lancés à la main depuis la racine du dépôt.
- Formats stricts, vérifiés par un validateur au code de sortie non nul en cas d'erreur.
- Aucun secret dans le dépôt.

## Données et reprise

Pas de reprise. Le premier client, E G M, sera décrit dans son dépôt theonam/egm-app par sa propre conversation.

## Intégrations

- **GitHub** : dépôts clients et skeam-ops, clonés sous un même dossier racine.
- **Plaud** : enregistrements et transcripts de réunion.
- **Todoist** : actions de Théo, priorités p1 à p4 et étiquettes de points.
- **Dougs** : brouillons de devis à partir des chiffrages.

## Découpage en lots

- **Lot 1** : socle commun, puis première version des quatre chantiers socle, catalogue, cadrage et dashboard.
- **Lot 2** : modules socle réutilisables, méthode de prix conseillé, relecture hebdomadaire du temps.

## Décisions

Voir decisions.md.

## Questions ouvertes

- Faut-il inscrire skeam-ops au registre clients.yaml pour le voir dans le dashboard interne ?
- Statut réel d'E G M : en_dev retenu par défaut.
- Projet et section Todoist du projet ops.

## Attendus du client

- Relecture de la pull request feat/init et arbitrage des points tranchés.

## Sources

- Consigne de Théo du 2026-10-15, conversation feat/init.
