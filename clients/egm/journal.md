# Journal E G M

Ce qui a été fait, jour par jour. Le détail de chaque décision est dans `docs/DECISIONS.md` du dépôt `theonam/egm-app`.

## 13 octobre 2026 — Cadrage

- Réponses de Théo aux questions de cadrage, apports du transcript de la réunion client.
- Socle, données et listes, demandes de devis avec pièces jointes (étapes 1 à 3 du plan).

## 14 octobre 2026 — Étapes 4 à 8, deux versions

- **Devis** (étape 4) : prestations par catégorie et par code, prix de marché et rabais, titres, notes, sous-totaux, saisie rapide, duplication.
- **Croquis** (étape 5) : sur photo ou page blanche, stylet avec pression, flèche, cote, texte, gomme, réédition.
- **PDF et Outlook** (étape 6) : aperçu en direct, annexe photos et croquis, PDF par Chromium, brouillon Outlook avec le PDF joint.
- **Lecture de commandes PDF** (étape 7) : extraction par l'API Claude, champs douteux signalés, rapprochement avec le devis, devis « accepté » à l'enregistrement.
- **Facture simple** (étape 8) : depuis la commande ou depuis le devis, numéro à l'émission, facture figée.
- Addendum de Théo : périmètre de référence de la démo, liste des commandes, menu « Données » et saisie à la main, tableau de bord.
- **Deux versions** : la démo (branche `demo`) et la version finale.
- Import des fichiers Excel du client et effacement après la démo, préparés sans les fichiers.
- Version finale : image Docker et contrôles automatiques GitHub, facture électronique Factur-X, brique de signature du gardien.

## 15 octobre 2026 — Version finale, puis nuit de vérifications

Journée, à la demande de Théo :

- Design de la version finale, piste C « Banque ».
- Fiche demande et photos réorganisées.
- Pastilles de notification dans le menu (version finale).
- Onglet Photo au téléphone, aussi dans la démo.
- Bouton « Ouvrir dans Outlook ».

Nuit, quatre chantiers lancés par Théo (« fais tout »), sur la version finale :

| Chantier | Résultat |
| --- | --- |
| Droits | Balayage automatique de toutes les pages, routes et actions serveur, appelées directement par l'ouvrier et par un conducteur de travaux. **Aucune faille.** Le test sait échouer : deux failles introduites exprès ont été détectées. |
| Tests manquants | Validation serveur des devis et des commandes, cellules Excel, périodes de validité des prix. Glisser-déposer des lignes testé à la souris et au clavier. |
| Tests instables | 13 passages de la suite complète. 63 tests sur 65 toujours verts ; les deux autres échouaient seulement sur une base déjà utilisée. Causes reproduites et corrigées. |
| Accessibilité | Balayage de tous les écrans aux cinq largeurs : 207 problèmes au départ, 0 à l'arrivée. Listes et lignes de devis mieux décrites aux lecteurs d'écran, infobulle lisible, annonces du glisser-déposer en français. Boutons, champs et liens à 48 px sur téléphone. |

Commits sur la branche de travail : `408db7e`, `dc94035`, `172dd47`, `9b6a3c0`. Nouvelle dépendance de test : @axe-core/playwright 4.13.0, licence MPL-2.0, non livrée au client.

## 16 octobre 2026 — Accessibilité reportée dans la démo

- Décision de Théo : reporter dans la démo les corrections d'accessibilité et de cibles tactiles.
- Report refait sur le code de la démo, qui garde son design. Le balayage y a trouvé en plus quelques textes gris trop pâles sur fond bleu, et des liens de contact trop petits au doigt sur la fiche demande.
- Vérifié avant l'envoi : `pnpm check` vert, 61 tests de bout en bout verts, balayage vert en édition démo et en édition complète.
- Envoyé sur `demo` (commit `7a44126`) avec l'accord de Théo. Render a redéployé ; nouvelle version constatée en ligne à 06:06. Les fichiers déposés en ligne ont été effacés par le déploiement.
- Retour dans la version finale (commit `1158708`) : liens de contact et étiquette « Rejeté » corrigés, balayage fiabilisé. Les aperçus de devis et de facture sont exclus de l'analyse d'accessibilité, car ils bloquaient l'outil par moments. 71 tests verts.
