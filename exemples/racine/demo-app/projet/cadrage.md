# Cadrage Démo Bâtiment

## Objet et statut

Cadrage de l'application de gestion de Démo Bâtiment. Version 1 du 2026-10-08, validée par le client le 2026-10-14.

## Objectifs

- Supprimer la ressaisie des feuilles d'heures papier.
- Donner au conducteur de travaux une vue à jour des heures par chantier.

## Profils et droits

- **Compagnon** : se connecte, voit ses chantiers, saisit son pointage du jour.
- **Conducteur de travaux** : voit tous les chantiers et tous les pointages, exporte les heures.
- **Gérante** : mêmes droits que le conducteur de travaux, plus la gestion des comptes.

## Processus cible

Le compagnon saisit ses heures chaque soir sur son téléphone. Le conducteur de travaux contrôle la semaine le lundi et exporte le mois pour la paie.

## Objets métier

- **Chantier** : nom, adresse, date de début, date de fin prévue.
- **Compagnon** : nom, téléphone, chantiers affectés.
- **Pointage** : compagnon, chantier, date, nombre d'heures.

## Règles de gestion

- **RG1** : un lien de connexion expire 15 minutes après son envoi.
- **RG2** : un pointage dépasse au plus 10 heures par compagnon et par jour.
- **RG3** : un compagnon ne modifie plus un pointage après le jour concerné ; seul le conducteur de travaux le peut.

## Exigences

- Application installable sur téléphone et tablette.
- Saisie possible avec une connexion faible.

## Données et reprise

Pas de reprise d'historique. La liste des compagnons et des chantiers est fournie par le client.

## Intégrations

Export CSV pour le cabinet de paie. Envoi des SMS par un prestataire à choisir.

## Découpage en lots

- **Lot 0** : démo, connexion et liste des chantiers.
- **Lot 1** : pointage et export paie.
- **Lot 2** : planning des équipes, optionnel.

## Décisions

- Connexion par lien SMS, sans mot de passe.

## Questions ouvertes

- Format exact attendu par le cabinet de paie.

## Attendus du client

- Liste des compagnons avec leur téléphone, pour le 2026-10-20.

## Sources

- syntheses/2026-10-08-lancement.md
