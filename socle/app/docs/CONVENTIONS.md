# Conventions de l'application

Application construite sur le socle SKEAM. Ces règles valent pour tout agent qui développe ici ; le dossier `projet/` décrit le client, son cadrage et son backlog.

## Pile

Next.js 16 et TypeScript strict, PostgreSQL 16 et Drizzle, Tailwind CSS, Zod, Vitest et Playwright, image Docker standard. Versions figées : une montée de version se fait par décision, pas au fil de l'eau. La documentation de Next.js à jour est dans `node_modules/next/dist/docs/` : cette version diffère de ce que l'on connaît.

## Où se règle quoi

| Sujet | Fichier |
|---|---|
| Profils, droits, droits au champ | `src/config/access.ts` |
| Numérotation légale | `src/config/numbering.ts` |
| Menu | `src/config/navigation.ts` |
| Contenus importables depuis Excel | `src/config/import.ts` |
| Nom, couleur, édition, cookie | variables d'environnement, `.env.example` |
| En-tête, mentions, IBAN, gabarits de mail | écran Paramètres, table `company_settings` |

## Règles

- `src/domain/` : règles pures, sans React, Next ni base, testées unitairement. `src/server/` : base, services, droits. `src/app/` : écrans et routes, aucun calcul. `src/components/` : interface réutilisable.
- Montants en centimes entiers, quantités en millièmes, taux en points de base ; un seul point d'arrondi, `src/domain/money.ts`.
- Toute lecture passe par un service qui reçoit l'utilisateur et construit son `select` avec `visibleColumns` : un champ interdit n'est jamais lu en base. Toute réponse d'API repasse par `redact`. Le test `src/app/api/api-access.db.test.ts` appelle chaque route GET avec chaque profil : il doit rester vert.
- Toute écriture métier ajoute une ligne au journal d'audit, `audit()`, dans la même transaction.
- Un numéro légal s'attribue par `nextDocumentNumber` dans la transaction d'émission. Jamais de séquence PostgreSQL. Un document émis ne se modifie ni ne se supprime : il s'annule. La base le garantit.
- Mutations validées par Zod côté serveur. Routes d'API enveloppées par `route()` et `authorize()`.
- Secrets dans les variables d'environnement. Données réelles du client dans `data/raw/` seulement, exclu du dépôt ; jamais dans un test, une capture ou un journal.
- Code en anglais, interface et documentation en français, URL en français.
- Toute liste passe par `src/components/data-list/`.
- Écrans pensés pour le téléphone, la tablette, l'écran et le grand écran, sans défilement horizontal.
- Avant chaque commit : `pnpm check`, puis `pnpm build && pnpm test:e2e`.

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm local:setup` | installation locale, Docker requis |
| `pnpm dev` | serveur de développement |
| `pnpm check` | lint, types, tests unitaires, tests sur une base créée pour le lancement |
| `pnpm build && pnpm test:e2e` | bout en bout et captures dans `e2e/screenshots/` |
| `pnpm db:generate` / `pnpm db:migrate` | migration après changement de `src/server/db/schema.ts` / application |
| `pnpm db:seed` / `pnpm demo:seed [--reset]` | comptes de démonstration / jeu fictif, édition démo seulement |
| `pnpm data:import fichier.xlsx [--apply]` | import Excel, simulation par défaut, rapport des rejets |
| `pnpm data:purge [--yes]` | effacement des données métier, protégé hors démo |
| `pnpm db:backup` / `pnpm db:restore` | sauvegarde dans le stockage / restauration |
| `pnpm icons` | icônes de l'application installable |
