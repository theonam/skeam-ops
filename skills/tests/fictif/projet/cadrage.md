# Cadrage Atelier Fictif

## Objet et statut

Cadrage de l'application de suivi d'atelier d'Atelier Fictif. Version 1 du 2026-10-20, brouillon. <!-- client fictif des tests -->

## Objectifs

- Savoir à tout moment où en est chaque commande. <!-- syntheses/2026-10-20-lancement.md 00:00:20 -->
- Supprimer la ressaisie des heures du vendredi. <!-- syntheses/2026-10-20-lancement.md 00:01:10 -->

## Profils et droits

- **Compagnon** : saisit ses heures par commande.
- **Chef d'atelier** : voit toutes les commandes et toutes les heures.

## Processus cible

Le compagnon saisit ses heures par commande sur son téléphone. Le chef d'atelier suit l'avancement des commandes.

## Objets métier

- **Commande** : client, description, statut.
- **Saisie d'heures** : compagnon, commande, date, nombre d'heures.

## Règles de gestion

- **RG1** : une journée de saisie est plafonnée à 10 heures par compagnon.
- **RG2** : une commande livrée n'accepte plus de saisie d'heures.

## Exigences

- Application installable sur téléphone.

## Données et reprise

Pas de reprise.

## Intégrations

Export des heures pour le cabinet comptable, format à recevoir.

## Découpage en lots

- **Lot 0** : démo de la connexion.
- **Lot 1** : saisie des heures, suivi des commandes, export comptable.

## Décisions

- Saisie des heures par commande, sur téléphone.

## Questions ouvertes

- Format de l'export attendu par le cabinet comptable.

## Attendus du client

- Format d'export du cabinet comptable, pour le 2026-10-30.

## Sources

- syntheses/2026-10-20-lancement.md
