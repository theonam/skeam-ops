# Socle d'application SKEAM

Propriétaire : chantier socle, branche `feat/socle`, agent `ops-socle`. Code propriété de SKEAM.

Le socle est une application modèle complète, générique et testée, qu'on copie pour démarrer chaque application client. Il est extrait d'egm-app, audité dans [AUDIT.md](AUDIT.md), et corrigé des défauts relevés ; les corrections à reporter dans egm-app sont dans [REPORTS-EGM.md](REPORTS-EGM.md).

Aucune donnée réelle, aucun secret, aucun nom de client : le jeu de démonstration est entièrement fictif.

## Démarrer un client

1. Créer le dépôt du client et son dossier projet : `python scripts/nouveau_dossier.py <slug> "<nom>" <racine du dépôt> --depot theonam/<depot>`.
2. Copier le socle dans le dépôt : `socle/scripts/init_app.sh <racine du dépôt>`. Le script lit le slug et le nom dans `projet/client.yaml`, ne touche pas à `projet/`, refuse d'écraser un fichier existant, complète `CLAUDE.md` et note la version du socle dans `SOCLE_VERSION`.
3. Dans le dépôt du client : `pnpm local:setup`, puis `pnpm dev`. Comptes `admin`, `gestion`, `terrain`, mot de passe `DEMO_PASSWORD` de `.env`.
4. Paramétrer, voir ci-dessous, puis retirer ou remplacer le métier d'exemple : clients, articles et documents à lignes.
5. Déployer : `render.yaml` décrit la démonstration, la production et la sauvegarde quotidienne, à créer depuis le tableau de bord Render en « Blueprint » ; ou l'image Docker chez tout hébergeur.

## Ce qui se paramètre, sans toucher au reste du code

| Sujet | Où |
|---|---|
| Nom, nom court, description, couleur, édition démo ou finale, nom du cookie | variables d'environnement, `app/.env.example` |
| Profils, droits, droits au champ, par exemple masquer les prix au profil terrain | `app/src/config/access.ts` |
| Numérotation légale : préfixe, motif, largeur, remise à zéro annuelle ou jamais | `app/src/config/numbering.ts` |
| Menu et onglets du téléphone | `app/src/config/navigation.ts` |
| Contenus importables depuis Excel et intitulés reconnus | `app/src/config/import.ts` |
| En-tête, mentions légales, IBAN et BIC, délais, gabarits de mail, nom des PDF | écran Paramètres de l'application |
| Icônes de l'application installée | `pnpm icons`, ou logo du client dans `public/icons/icon.svg` puis `pnpm icons --svg` |
| Base, stockage S3, sauvegardes | variables d'environnement |

## Ce que fournit l'application modèle

| Exigence | Réalisation | Tests |
|---|---|---|
| Connexion et profils | identifiant et mot de passe argon2id, sessions en base, cookie httpOnly, limitation des essais, connexion tracée | `src/server/auth/*.test.ts` |
| Droits jusqu'au champ, y compris par l'API | `FIELD_POLICY` ; chaque `select` construit par `visibleColumns`, chaque réponse filtrée par `redact` ; PDF refusé sans droit sur les prix | `src/domain/access.test.ts`, `src/app/api/api-access.db.test.ts` appelle chaque route GET avec chaque profil, `e2e/droits.spec.ts` |
| Numérotation légale sans trou ni doublon, sûre en concurrence | compteur verrouillé dans la transaction d'émission, numéro attribué à l'émission, documents émis figés par déclencheurs | `src/server/numbering.db.test.ts` : 50 émissions simultanées, annulations au milieu, changement d'année ; `src/server/documents/service.db.test.ts` : émission concurrente du même document |
| Montants au centime, TVA par taux | centimes entiers, millièmes, points de base, arrondi commercial unique, TVA sur la base cumulée de chaque taux | `src/domain/money.test.ts`, `src/domain/totals.test.ts` |
| PDF avec en-tête, mentions, IBAN, annexes | même HTML pour l'aperçu et le PDF, Chromium sans interface, IBAN figé à l'émission, photos et croquis en annexe, PDF archivé une fois et resservi à l'identique | `src/lib/documents/documents.test.ts`, `src/server/documents/output.db.test.ts`, `e2e/documents.spec.ts` |
| Import Excel avec rapport des rejets, export Excel | onglets et colonnes reconnus, simulation puis import, rapport Résumé et Rejets ; export de toute liste avec ses filtres, sans champ interdit | `src/domain/import.test.ts`, `src/server/import/run.db.test.ts`, `e2e/listes.spec.ts` |
| Listes de plusieurs milliers de lignes | défilement virtualisé, recherche, filtres à cases sur toutes les colonnes, tri, colonnes mémorisées | `src/components/data-list/query.test.ts`, `e2e/listes.spec.ts` sur 5 000 articles |
| Glisser-déposer de photos, PDF, mails Outlook | dépôt n'importe où sur la fiche, `.msg` et `.eml` lus avec leurs pièces jointes, vignettes | `src/server/attachments/service.db.test.ts`, `e2e/fichiers.spec.ts` |
| Croquis au stylet, modifiable | sur photo ou page blanche, pression du stylet, formes vectorielles conservées et rééditables | `src/domain/sketch.test.ts`, `e2e/fichiers.spec.ts` |
| Installable, du téléphone au grand écran | manifeste, service worker, page hors connexion ; onglets, rail, barre latérale | `e2e/listes.spec.ts` aux 4 largeurs, `e2e/fichiers.spec.ts` pour le manifeste |
| Brouillon Outlook avec pièce jointe | `.eml` `X-Unsent: 1`, PDF archivé joint, envoi tracé | `src/server/mail/eml.test.ts`, `src/server/documents/output.db.test.ts`, `e2e/documents.spec.ts` |
| Journal d'audit | table en ajout seul garantie par déclencheur, une ligne par écriture dans la même transaction, écran Journal | `service.db.test.ts`, `maintenance.db.test.ts` |
| Sauvegardes | `pnpm db:backup` vers le stockage avec rotation, `pnpm db:restore`, tâche planifiée Render | `src/server/maintenance/maintenance.db.test.ts` restaure dans une base neuve |
| Configuration par variables d'environnement, déploiement Render | `.env.example`, `render.yaml`, `Dockerfile`, CI GitHub | `init_app` vérifie la substitution |
| Données fictives et effacement | `pnpm demo:seed [--reset]`, `pnpm data:purge [--yes]` avec attestation ; effacement refusé hors démo dès qu'un document est émis | `maintenance.db.test.ts` |

## Structure

```text
socle/
  AUDIT.md               audit d'egm-app, phase 1
  REPORTS-EGM.md         corrections à reporter dans egm-app après la démo
  scripts/init_app.sh    copie du socle dans un dépôt client, CONTRAT.md section 11.6
  scripts/test_init_app.py
  app/                   application modèle, copiée telle quelle par init_app.sh
    src/config/          tout ce qui se paramètre par client
    src/domain/          règles pures : montants, totaux, droits, numérotation, import, croquis
    src/server/          base, services, droits, PDF, mail, stockage, import, maintenance
    src/app/             écrans et routes d'API
    src/components/      liste générique, pièces jointes, croquis, documents, navigation
    db/migrations/       schéma et garanties d'intégrité
    scripts/             migrations, comptes, jeu fictif, import, effacement, sauvegarde, icônes
    e2e/                 tests de bout en bout
    docs/                conventions et démarrage, copiés dans l'application client
```

## Vérifications

Depuis `socle/app`, avec PostgreSQL 16 et `DATABASE_URL_TEST` pointant sur une base où le compte peut créer des bases :

```bash
pnpm install
pnpm check                  # lint, types, tests unitaires, tests sur une base créée pour le lancement
pnpm build && pnpm test:e2e # bout en bout, captures aux 4 largeurs dans e2e/screenshots/
```

Depuis la racine de skeam-ops : `python -m unittest discover -s socle/scripts -p "test_*.py"`.

## Origine des composants

Chaque fichier repris d'egm-app porte en tête la mention `Origine : egm-app <chemin>` ; un fichier sans mention est nouveau dans le socle. Synthèse :

| Socle | Origine dans egm-app | Changement |
|---|---|---|
| `src/server/auth/`, `src/app/connexion/`, `src/proxy.ts` | mêmes chemins | cookie paramétrable, lecture de session depuis la requête pour l'API, connexion tracée |
| `src/config/access.ts`, `src/domain/access.ts` | `src/domain/permissions.ts`, `profiles.ts` | profils génériques, droits au champ déclaratifs |
| `src/config/numbering.ts`, `src/domain/numbering.ts`, `src/server/numbering.ts` | `src/domain/numbering.ts`, `src/server/numbering.ts` | format et remise à zéro paramétrables |
| `src/domain/money.ts`, `dates.ts`, `text-search.ts` | mêmes chemins | aucun |
| `src/domain/totals.ts` | `src/domain/quote-totals.ts` | vocabulaire générique |
| `src/lib/documents/` | mêmes chemins | un seul constructeur, sans vocabulaire BTP, en-tête et mentions paramétrables |
| `src/server/documents/service.ts`, `output.ts` | `src/server/quotes/`, `src/server/invoices/service.ts` | document générique, PDF archivé sous verrou |
| `src/server/documents/pdf.ts` | même chemin | aucun |
| `src/server/mail/`, `src/components/documents/email-dialog.tsx` | mêmes chemins | aucun sur le fond |
| `src/server/storage/` | même chemin | listage des clés pour la rotation des sauvegardes |
| `src/server/attachments/`, `src/components/attachments/` | mêmes chemins | propriétaires génériques, ajouts tracés |
| `src/components/sketch/`, `src/domain/sketch.ts` | mêmes chemins | aucun |
| `src/components/data-list/`, `src/server/preferences/` | mêmes chemins | aucun sur le fond |
| `src/domain/import.ts`, `src/server/import/`, `src/config/import.ts` | `src/domain/import.ts`, `src/server/import/` | moteur générique, schémas en configuration, import depuis l'application |
| `src/server/maintenance/purge.ts` | même chemin | compteurs protégés, refus hors démo |
| `src/components/shell/`, `src/config/navigation.ts` | `src/components/shell/` | menu en configuration, sans pastilles |
| `src/app/manifest.ts`, `public/sw.js`, `public/hors-ligne.html` | mêmes chemins | identité par variables d'environnement |
| `Dockerfile`, `docker-compose.yml`, `render.yaml`, `.github/workflows/ci.yml` | mêmes chemins | client PostgreSQL, Docker sur Render, sauvegarde planifiée, audit des dépendances |
| `src/server/audit.ts`, `src/server/maintenance/backup.ts`, `src/server/api.ts`, `db/migrations/0001_integrite.sql`, `src/test/db-global-setup.ts` | nouveaux | journal, sauvegardes, contrôle d'origine, intégrité en base, base de test isolée |

Non repris, car propres à E G M ou au BTP : demandes de devis, prix de marché et rabais, référentiels de bailleurs et d'adresses, lecture de bons de commande PDF, commandes, tableau de bord, Factur-X, signature, fenêtre scindée, onglet Photo, page `/labo`. Factur-X et la lecture de PDF par extraction structurée sont des candidats pour une prochaine version du socle, rattachée au catalogue.

## Points tranchés

- **Cache Components désactivé** : chaque page qui lit la session est rendue à la demande. Plus simple pour les applications clients ; à réactiver si une version majeure de Next.js l'impose.
- **Document générique à lignes** au lieu des devis et factures BTP d'egm-app : il sert de modèle à la numérotation, aux totaux, au PDF et au mail, et se renomme ou se duplique par client.
- **Numéro attribué à l'émission**, pas à la création : un brouillon supprimé ne consomme aucun numéro.
- **Effacement refusé hors édition démo** dès qu'un document a été émis, au nom de la conservation légale.
- **Copie plutôt que paquet partagé** : `init_app.sh` copie le socle et écrit `SOCLE_VERSION`.
- **Render en plans payants** dans `render.yaml`, Docker comme mode de déploiement, région Francfort ; aucun service n'a été créé.
