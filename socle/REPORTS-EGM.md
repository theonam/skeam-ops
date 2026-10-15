# Corrections du socle à reporter dans egm-app

À faire **après la démo**, sur la branche `main` d'egm-app, par sa propre conversation et avec l'accord de Théo. Rien de cette liste n'a été appliqué à egm-app : le dépôt n'a été que lu.

Chaque entrée renvoie au fichier d'egm-app concerné, au fichier du socle qui montre la correction, et donne un ordre de grandeur.

| N° | Priorité | Correction | egm-app | Socle | Effort |
|---|---|---|---|---|---|
| R1 | haute | PDF archivé unique : produire le PDF d'une facture émise sous le verrou de sa ligne et n'enregistrer la clé que si elle est vide ; toujours resservir le fichier archivé | `src/server/invoices/service.ts`, `invoicePdf` | `src/server/documents/output.ts`, `documentPdf` ; test `output.db.test.ts` | 2 h |
| R2 | haute | Compteurs de numérotation protégés : ne plus vider `document_counters` dans `data:purge` et `db:seed:demo --reset` hors édition démo ; refuser l'effacement dès qu'une facture a été émise | `scripts/demo-data/tables.ts`, `src/server/maintenance/purge.ts` | `src/server/maintenance/purge.ts` | 1 h |
| R3 | haute | Base de test propre à chaque lancement, créée puis supprimée : supprime l'échec aléatoire du test de facture quand deux lancements se chevauchent | `src/test/db-global-setup.ts`, `src/test/db.ts`, `vitest.db.config.mts` | `src/test/db-global-setup.ts`, `src/test/db-setup.ts` | 2 h |
| R4 | moyenne | Test de facture : année attendue calculée en heure de Paris par `numberingYear`, pas par `new Date().getFullYear()` | `src/server/invoices/service.db.test.ts`, ligne du premier test | `src/server/numbering.db.test.ts` | 15 min |
| R5 | haute | Retirer l'identité d'entreprise réelle du test Factur-X et la remplacer par des valeurs fictives | `src/server/invoices/facturx.db.test.ts` | `src/lib/documents/documents.test.ts`, entreprise fictive | 15 min |
| R6 | haute | Documents émis figés par la base : déclencheurs qui refusent la modification des montants, des lignes et du numéro d'une facture émise, et sa suppression | `db/migrations/` nouvelle migration | `db/migrations/0001_integrite.sql` | 3 h |
| R7 | haute | Journal d'audit en ajout seul, alimenté dans la même transaction que chaque écriture métier | nouveau `src/server/audit.ts` et appels dans les services | `src/server/audit.ts` | 1 à 2 j |
| R8 | haute | Sauvegardes : `pg_dump` vers le stockage S3 avec rotation, restauration testée, tâche planifiée Render ; client PostgreSQL dans l'image Docker | nouveau `scripts/backup.ts`, `Dockerfile`, `render.yaml` | `src/server/maintenance/backup.ts`, `scripts/backup.ts`, `scripts/restore.ts` | 3 h |
| R9 | haute | Hébergement de la version finale : quitter la base gratuite partagée avec la démo, qui expire le 2026-11-12 ; stockage S3 configuré | `render.yaml` | `render.yaml` | 1 h et coût mensuel |
| R10 | moyenne | Droits au champ déclarés : table des champs protégés par droit, `visibleColumns` pour chaque `select`, `redact` sur chaque réponse, et test qui appelle chaque route GET avec chaque profil | `src/domain/permissions.ts`, requêtes de `src/server/*/queries.ts` | `src/config/access.ts`, `src/domain/access.ts`, `src/app/api/api-access.db.test.ts` | 1 j |
| R11 | moyenne | `/labo` et `/labo/brouillon` derrière la connexion ou désactivés en version finale | `src/app/labo/` | sans objet : page non reprise | 30 min |
| R12 | moyenne | Contrôle de l'en-tête Origin sur toutes les routes d'écriture, pas seulement les envois de fichiers | `src/app/api/**` | `src/server/api.ts`, `assertSameOrigin` | 1 h |
| R13 | basse | En-têtes de sécurité par défaut : `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP minimale | `next.config.ts` | `next.config.ts` | 30 min |
| R14 | basse | Versions exactes de toutes les dépendances ; `uuid` forcé en 11.1.1 sous exceljs, vulnérabilité modérée | `package.json` | `package.json`, `pnpm.overrides` | 30 min |
| R15 | basse | Nom du cookie de session paramétrable par variable d'environnement | `src/server/auth/session.ts`, `src/proxy.ts` | `src/config/app.ts` | 15 min |
| R16 | basse | Le `CLAUDE.md` d'egm-app dit que le client deviendra propriétaire du code ; Théo a confirmé le 2026-10-15 que ce n'est pas le cas : corriger la phrase pour qu'aucun agent ne s'y fie | `CLAUDE.md`, section 1 | sans objet | 5 min |

Ordre conseillé : R5 et R16 tout de suite après la démo ; R1, R2, R3, R4 ensemble ; puis R6 à R9 avant toute mise en service réelle ; le reste au fil des lots.
