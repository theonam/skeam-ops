# Audit d'egm-app pour l'extraction du socle

Chantier socle, agent `ops-socle`, item OPS-106. Audit réalisé le 2026-10-15 sur `theonam/egm-app`, branche `main`, commit `c030933`, en lecture seule : aucun commit, aucune branche, aucune pull request sur egm-app. Les tests ont été exécutés dans un clone local, sur une base PostgreSQL 16 locale, sans rien y écrire.

Ce document est d'audience interne. Il ne reproduit aucune donnée d'E G M.

## 1. Synthèse

- **egm-app est une bonne base de socle.** Pile moderne et cohérente, règles monétaires saines, numérotation correcte, droits contrôlés côté serveur, 300 tests environ, CI verte sur ses 11 derniers passages terminés. Environ 26 000 lignes de code applicatif, dont près de la moitié est générique ou le devient avec un paramétrage.
- **Le test de facture instable ne vient pas de la numérotation.** Il suppose une base de test réservée à un seul lancement ; deux lancements simultanés sur la même base le font échouer. Reproduit : le test attend `FA-2026-00001` et reçoit `FA-2026-00008`. Détail en section 6.
- **Trois défauts réels à corriger dans le socle et à reporter dans egm-app après la démo** : course à la génération du PDF archivé d'une facture, remise à zéro des compteurs par l'effacement et le jeu de démo, droits au champ écrits requête par requête au lieu d'être déclarés.
- **Manques pour un socle de production** : journal d'audit, sauvegardes, hébergement Render gratuit inadapté au-delà d'une démo.
- **Recommandation** : garder la pile comme standard SKEAM, avec six ajustements chiffrés en section 8. Changer de pile coûterait une réécriture sans gain.
- **Point juridique à vérifier avant extraction** : le `CLAUDE.md` d'egm-app indique que le client deviendra propriétaire du code au terme du contrat. Voir section 9.

## 2. Pile technique actuelle

| Rôle | Choix dans egm-app | Version |
|---|---|---|
| Langage | TypeScript strict | 5.9 |
| Application | Next.js, App Router, Cache Components, Server Actions | 16.4.0 |
| Interface | React, Tailwind CSS 4, Radix Popover, lucide-react | React 19.3 |
| Listes | TanStack Virtual, moteur de filtres maison | 3.14 |
| Glisser-déposer de lignes | dnd-kit | 6.3 |
| Base | PostgreSQL 16, Drizzle ORM, postgres.js | Drizzle 0.45 |
| Validation | Zod, partagé client et serveur | 4.6 |
| Authentification | module maison : identifiant et mot de passe argon2id, sessions en base | @node-rs/argon2 2.2 |
| Fichiers | disque local ou stockage compatible S3, vignettes par sharp | AWS SDK 3, sharp 0.35 |
| PDF | HTML unique rendu par Chromium sans interface, playwright-core ; pdf-lib pour Factur-X | Playwright 1.56 |
| Croquis et signature | perfect-freehand, canvas maison sur Pointer Events | 1.2.3 |
| Mails Outlook | lecture `.msg` par @kenjiuno/msgreader, `.eml` par postal-mime ; brouillon `.eml` `X-Unsent: 1` | |
| Excel | exceljs, import et export | 4.4.0 |
| Lecture de PDF | API Claude, sortie JSON revalidée par Zod | SDK 0.133 |
| Graphiques | Recharts | 3.10 |
| Installable | manifeste Next et service worker minimal, sans cache de données | |
| Tests | Vitest unitaires et sur base réelle, Playwright bout en bout et captures à 5 largeurs | Vitest 5 |
| Conteneur | Dockerfile Node 22 Debian avec Chromium ; docker compose | |
| CI | GitHub Actions : lint, types, unitaires, base réelle, bout en bout, image Docker | |
| Gestionnaire de paquets | pnpm 10, Node 22 | |

Licences : toutes permissives, MIT, Apache-2.0, BSD ou OFL pour les polices. La règle d'egm-app, vérifier la licence de toute dépendance et refuser celles qui imposent un paiement ou un filigrane, est à garder dans le socle.

## 3. Architecture

Découpage en quatre couches, respecté dans le code :

| Dossier | Rôle | Dépendances admises |
|---|---|---|
| `src/domain/` | règles pures : montants, TVA, totaux, numérotation formatée, droits, import, dates | aucune, ni React ni base |
| `src/server/` | accès base, services, contrôle des droits, intégrations : stockage, mail, PDF, Claude | Drizzle, domaine |
| `src/app/` | routes, écrans, Server Actions, route handlers | serveur, composants |
| `src/components/` | composants d'interface réutilisables | domaine pour les types et calculs purs |

Conventions solides, reprises telles quelles dans le socle :

- montants en centimes entiers `bigint`, quantités en millièmes, taux de TVA en points de base ; aucun flottant dans un calcul monétaire ; un seul point d'arrondi dans `src/domain/money.ts` ;
- TVA calculée par taux sur la base HT cumulée de ce taux, puis arrondie ;
- identifiants techniques UUID, numéro métier distinct et unique ; un document numéroté ne se supprime jamais, il s'annule ;
- toute lecture passe par une fonction serveur qui reçoit l'utilisateur et ne sélectionne que les champs autorisés ;
- toute mutation est validée par Zod côté serveur ;
- deux éditions d'un même code, démo et finale, par `APP_EDITION`, avec blocage côté serveur ;
- secrets en variables d'environnement, `.env.example` tenu à jour, données réelles uniquement dans `data/raw/` exclu du dépôt.

Modèle de données : 43 tables en 9 migrations SQL versionnées. Les contraintes que Drizzle ne sait pas décrire, exclusion et contraintes différées, sont dans des migrations écrites à la main.

## 4. Déploiement, base de données, tests

### 4.1 Déploiement Render

`render.yaml` décrit deux services web gratuits en région Francfort, `egm-test` sur la branche `demo` et `egm-version-finale` sur `main`, et une base PostgreSQL 16 gratuite partagée par les deux.

| Constat | Conséquence |
|---|---|
| Plan gratuit : mise en veille après 15 minutes, réveil en une minute environ | acceptable pour une démo présentée par Théo, pas pour un usage réel |
| Disque effacé à chaque redémarrage, déploiement ou mise en veille, et `STORAGE_DRIVER` non défini donc stockage local | toute photo ou PDF déposé disparaît ; pas de stockage S3 configuré sur Render |
| Base gratuite : expire le 2026-11-12, aucune sauvegarde | la version finale y loge aussi sa base `egm_final` : elle disparaîtra avec |
| Chromium installé pendant la compilation, `PDF_BROWSER_INSTALL=1` | compilation longue ; mémoire du plan gratuit, 512 Mo, juste pour Chromium |
| Commande de démarrage : migrations, comptes, jeu de démo à chaque démarrage | idempotent, mais à proscrire en production |
| `DEMO_PASSWORD` en `sync: false` | aucun secret dans le fichier : bon |

Le Dockerfile, lui, est prêt pour un hébergeur standard : image Node 22 Debian, Chromium et scripts inclus, migrations au démarrage, utilisateur non root.

### 4.2 Base de données

- PostgreSQL 16, extensions `unaccent` et fonction de recherche sans accent ; migrations drizzle-kit versionnées, jamais modifiées une fois fusionnées.
- Compteurs de numérotation dans `document_counters`, clé `document_type` et `period`.
- Index unique partiel : une seule facture non annulée par commande.
- Sessions en base, empreinte SHA-256 du jeton, cookie httpOnly.
- Pas de journal d'audit : seuls `created_by`, `updated_by` et la table `outbound_emails` tracent qui a fait quoi.
- Pas de sauvegarde ni de procédure de restauration.

### 4.3 Tests

Résultats relevés dans cet audit :

| Suite | Volume | Résultat |
|---|---|---|
| Lint ESLint | tout le code | 0 erreur |
| Types `tsc --noEmit` | tout le code | 0 erreur |
| Unitaires Vitest | 36 fichiers, 203 tests dont 3 ignorés | verts |
| Sur base réelle Vitest | 10 fichiers, 40 tests | verts en lancement seul, 40 passages du test de facture sans échec, 25 autres sous charge processeur sans échec |
| Bout en bout Playwright | 15 fichiers, 61 tests, captures à 390, 800, 1 440, 2 560 et 3 440 px | non relancés ici ; verts en CI |
| CI GitHub | 13 passages | 11 verts, 2 annulés par un envoi plus récent, aucun échec |
| `pnpm audit --prod` | dépendances de production | 1 vulnérabilité modérée : `uuid` antérieur à 11.1.1, tiré par exceljs |

La couverture n'est pas mesurée : aucun outil de couverture n'est installé. Par lecture, le domaine est couvert presque fichier par fichier ; les services serveur sont couverts sur les chemins critiques, factures, commandes, pièces jointes, import, effacement ; les composants d'interface ne le sont que par les tests de bout en bout.

## 5. Inventaire des composants

Classement : **G** générique, repris tel quel avec renommage ; **S** semi-générique, mécanisme réutilisable et contenu à paramétrer ; **E** spécifique E G M ou BTP, hors socle. La colonne Socle dit ce que la phase 2 en fait.

### 5.1 Fondations

| Composant | Fichiers egm-app | Classe | Socle |
|---|---|---|---|
| Authentification, sessions, limitation des essais | `src/server/auth/`, `src/app/connexion/`, `src/proxy.ts` | G | repris ; nom du cookie paramétrable, limiteur derrière une interface |
| Matrice des droits par profil | `src/domain/permissions.ts`, `profiles.ts` | S | profils et droits déclarés en configuration |
| Droits au champ, prix masqués | sélection conditionnelle dans chaque requête, ex. `src/server/referentials/queries.ts` | S | **refait** en politique déclarative par ressource, section 7.3 |
| Client base, codes d'erreur PostgreSQL | `src/server/db/client.ts`, `errors.ts` | G | repris |
| Migrations, création de base | `scripts/migrate.ts`, `create-database.ts` | G | repris |
| Éditions démo et finale | `src/lib/edition.ts` | G | repris |
| Stockage local ou S3 | `src/server/storage/` | G | repris |
| Montants, arrondi, dates de Paris, recherche sans accent, formats | `src/domain/money.ts`, `dates.ts`, `text-search.ts`, `src/lib/format.ts` | G | repris |
| Numérotation sans trou ni doublon | `src/server/numbering.ts`, `src/domain/numbering.ts` | S | mécanisme repris ; préfixes, format et remise à zéro en configuration |
| Totaux et TVA par taux | `src/domain/quote-totals.ts` | S | moteur repris, sans le vocabulaire devis |
| Lignes de document : titre, note, sous-total | `src/components/quotes/editor-lines.ts` | S | repris pour un document générique |

### 5.2 Interface

| Composant | Fichiers egm-app | Classe | Socle |
|---|---|---|---|
| Liste générique : virtualisation, filtres à cases, tri, colonnes mémorisées, export xlsx | `src/components/data-list/`, `src/server/preferences/` | G | repris |
| Panneau maître et détail, vue scindée | `data-list/master-detail.tsx`, `src/components/split/`, `src/lib/split-view.ts` | G | repris |
| Coquille : menu, rail tablette, onglets téléphone, points de rupture | `src/components/shell/`, `src/lib/use-breakpoint.ts` | S | repris ; entrées de menu en configuration |
| Composants de base | `src/components/ui/` | G | repris |
| Aperçu de document dans un iframe | `src/components/documents/document-preview.tsx` | G | repris |
| Pastilles de notification, marques de lecture | `src/components/notifications/`, `src/server/notifications/` | S | phase ultérieure |
| Tableau de bord Recharts | `src/components/dashboard/` | S | hors socle minimal |
| Page de test d'appareil `/labo` | `src/app/labo/` | G | reprise derrière connexion ou drapeau, utile en avant-vente |

### 5.3 Fichiers, terrain, mails, documents

| Composant | Fichiers egm-app | Classe | Socle |
|---|---|---|---|
| Glisser-déposer de photos, PDF, `.msg`, `.eml` ; appareil photo ; visionneuse | `src/components/attachments/`, `src/server/attachments/`, `src/lib/mail-files.ts`, `src/domain/attachments.ts` | G | repris ; cibles de rattachement génériques |
| Croquis au stylet sur photo ou page blanche, vectoriel, rééditable | `src/components/sketch/`, `src/domain/sketch.ts`, `src/server/attachments/sketches.ts` | G | repris |
| Signature | `src/components/signature/`, `src/domain/signature.ts`, `src/server/signatures/` | G | repris en option |
| Brouillon Outlook `.eml` avec pièce jointe, interface `MailSender`, trace des envois | `src/server/mail/`, `src/domain/outbound-email.ts`, `email-dialog.tsx` | G | repris |
| PDF par Chromium, polices embarquées | `src/server/documents/pdf.ts` | G | repris |
| Gabarit HTML de document, en-tête, mentions, IBAN, annexes photos et croquis | `src/lib/documents/`, `src/server/documents/quote-document.ts`, `src/server/quotes/annex.ts` | S | gabarit générique ; société, mentions et IBAN en paramètres |
| Facture électronique Factur-X EN 16931 | `src/domain/facturx.ts`, `src/server/invoices/facturx*.ts` | S | candidat pour une version ultérieure du socle, utile à tout client français |
| Installable : manifeste, service worker, page hors ligne, icônes | `src/app/manifest.ts`, `public/sw.js`, `public/hors-ligne.html`, `scripts/generate-icons.ts` | G | repris ; nom, couleurs et icône en paramètres |

### 5.4 Données et exploitation

| Composant | Fichiers egm-app | Classe | Socle |
|---|---|---|---|
| Import Excel : reconnaissance des onglets, correspondances, rapport des rejets, simulation puis application | `src/domain/import.ts`, `src/server/import/`, `scripts/import-*.ts` | S | moteur repris ; schémas d'onglets en configuration |
| Effacement avec attestation | `src/server/maintenance/purge.ts`, `scripts/purge-client-data.ts` | S | repris ; liste des tables déclarée ; compteurs protégés |
| Comptes et jeu de démonstration | `scripts/seed.ts`, `scripts/seed-demo-data.ts`, `scripts/demo-data/` | S | mécanisme repris, données fictives neutres |
| Docker, compose, CI, installation locale, réveil de démo, recette en ligne | `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `scripts/local-setup.sh`, `scripts/demo-wake.ts`, `e2e-live/` | G | repris |
| Outils de test : bases de test, largeurs d'écran, absence de défilement horizontal | `src/test/`, `e2e/helpers.ts` | G | repris, base de test isolée par lancement |

### 5.5 Métier E G M, hors socle

| Composant | Fichiers egm-app | Classe | Remarque |
|---|---|---|---|
| Demandes de devis : logement, loge, gardien, locataire, urgence | `src/domain/quote-request.ts`, `src/server/quote-requests/`, écrans `demandes` | E | |
| Devis BTP : BPU, prix de marché, rabais, catalogue de prestations | `src/domain/pricing.ts`, `src/server/quotes/`, `src/components/quotes/` | E | l'éditeur de lignes est un modèle pour un futur module devis paramétrable |
| Référentiels bailleurs, agences, adresses | `src/server/referentials/`, `src/components/referentials/` | E | |
| Lecture de bons de commande PDF par Claude, rapprochement avec le devis | `src/server/pdf-orders/`, `src/domain/order-*.ts`, `src/domain/customer-order.ts` | E | la brique extraction structurée et confiance par champ est réutilisable ; à proposer comme module de catalogue |
| Commandes et facture simple depuis la commande | `src/server/orders/`, `src/server/invoices/`, `src/domain/invoice.ts` | E | le figement d'un document émis est générique et repris |
| Onglet Photo vers demandes et devis | `src/components/photo/`, `src/server/photos/targets.ts` | E | |

## 6. Le test de facture qui échoue au hasard

### 6.1 Ce qui a été vérifié

- La numérotation de production est correcte. `nextDocumentNumber` fait un `insert ... on conflict do update ... returning` sur la ligne `document_type`, `period` de `document_counters`, **dans la transaction qui insère le document**. La ligne du compteur reste verrouillée jusqu'au commit : deux émissions simultanées obtiennent deux numéros successifs, et une émission annulée annule aussi l'incrément. Ni trou ni doublon ; une séquence PostgreSQL native, elle, laisserait un trou à chaque annulation.
- L'émission d'une facture verrouille la commande puis le devis, `select ... for update`, toujours dans cet ordre : pas d'interblocage. Les contrôles sont refaits sur l'état verrouillé ; une tentative refusée ne consomme pas de numéro ; l'index unique partiel interdit une seconde facture pour la même commande.
- `src/server/invoices/service.db.test.ts` lancé seul : 40 passages sans échec, puis 25 sous forte charge processeur sans échec. L'historique CI ne montre aucun échec.

### 6.2 Cause probable, reproduite

Le premier test du fichier affirme une valeur absolue : la facture émise porte `FA-<année>-00001`. Cette affirmation n'est vraie que si personne d'autre n'utilise la base de test au même moment. Or :

- tous les lancements utilisent la même base, `DATABASE_URL_TEST` ;
- `src/test/db-global-setup.ts` supprime et recrée tout le schéma au début de chaque lancement ;
- chaque fichier vide les tables qu'il utilise, `truncate`, au début de ses tests.

Dès que deux lancements se chevauchent, deux `pnpm check` dans deux terminaux, deux sessions d'agent sur le même poste, un `vitest` en mode surveillance pendant un `pnpm check`, ils se vident et se recréent mutuellement les tables et partagent le compteur des factures.

Reproduction dans cet audit, deux `pnpm test:db` lancés à 4 secondes d'écart sur la même base :

```text
FAIL  src/server/invoices/service.db.test.ts > émission d'une facture depuis la commande
      > fige les lignes du devis, attribue FA-AAAA-00001 et passe la commande à « facturée »
- "number": "FA-2026-00001",
+ "number": "FA-2026-00008",
```

Le même chevauchement fait aussi échouer, selon le moment, le test de 30 numérotations simultanées, deux tests de commandes, le test d'effacement et la mise en place des tests Factur-X. Le symptôme visible, le plus souvent le test de facture, change d'un essai à l'autre : d'où l'impression d'un échec aléatoire. En CI, chaque passage a sa propre base : jamais d'échec.

Ce n'est pas un défaut de la numérotation : le compteur partagé a donné 8 parce que 7 factures avaient été émises avant dans la même base. Aucun trou, aucun doublon.

### 6.3 Causes secondaires, latentes

1. **Année du numéro attendu** : le test calcule l'année avec `new Date().getFullYear()`, dans le fuseau du processus, alors que le numéro prend l'année de Paris. En CI, réglée en UTC, le test échoue chaque 31 décembre à partir de 23 h, heure de Paris. Correction : utiliser `numberingYear` du domaine.
2. **Tests de bout en bout** : ils choisissent leur devis par position, `order by number offset n`, dans la base de développement partagée, et chaque test en consomme un. Le résultat dépend des tests passés avant et, en local, des lancements précédents et des manipulations faites dans l'application.

### 6.4 Défauts réels trouvés au voisinage

1. **Course au PDF archivé d'une facture.** `invoicePdf` lit `pdf_storage_key` ; si elle est vide, il génère le PDF, l'écrit puis note la clé. Deux demandes simultanées, clic sur PDF et sur Préparer le mail, génèrent deux fichiers, en général différents puisque la date de création y figure, et le dernier écrit gagne : le PDF joint au mail peut différer du PDF archivé. Pour une facture, le PDF émis doit être unique et immuable. Correction : générer le PDF dans l'émission, ou verrouiller la facture pendant la génération et n'écrire que si la clé est encore vide, `update ... where pdf_storage_key is null`, puis toujours renvoyer le fichier archivé.
2. **Compteurs remis à zéro.** `document_counters` fait partie des tables vidées par `pnpm data:purge --yes` et par `pnpm db:seed:demo --reset`. Sans gravité pour la démo ; en production, après une seule facture réelle émise, cela recréerait des numéros déjà attribués à des factures envoyées. Correction : exclure les compteurs de l'effacement dès qu'un document légal existe, et refuser ces commandes hors édition démo.
3. **Année de numérotation des demandes** : elle suit la date de réception saisie, qui peut être antérieure ; pour les factures elle suit la date d'émission, ce qui est le bon choix légal.

### 6.5 Ce que fait le socle

- une base de test créée par lancement, au nom unique, supprimée à la fin ; plus jamais de base partagée ;
- des assertions relatives : numéros consécutifs, sans trou ni doublon, plutôt qu'une valeur absolue ;
- tests de concurrence : N créations simultanées, créations annulées au milieu, changement d'année, émission concurrente d'un même document, génération concurrente du PDF archivé ;
- compteurs protégés contre l'effacement.

## 7. Qualité : dette et sécurité

### 7.1 Points forts

- Règles métier isolées et testées, conventions écrites et suivies.
- Montants entiers, TVA par taux, numérotation transactionnelle.
- Mots de passe argon2id, jetons de session de 160 bits stockés hachés, cookie httpOnly, `secure` en production, SameSite Lax ; limitation des essais de connexion ; comparaison à temps constant simulée pour un identifiant inconnu.
- Fichiers servis par l'application après contrôle des droits, jamais en accès direct.
- Un test de bout en bout vérifie qu'un ouvrier n'obtient aucun prix, y compris en appelant les routes directement.
- Aucun secret dans le dépôt ; les PDF envoyés à l'API Claude font l'objet d'une mention RGPD.

### 7.2 Dette

| Sujet | Constat | Gravité |
|---|---|---|
| Gros composants | `quote-editor.tsx` 1 110 lignes, `quote-request-form.tsx` 650, `sketch-editor.tsx` 622, `data-list.tsx` 608 | moyenne : à découper en extrayant vers le socle |
| Droits au champ | chaque requête choisit ses colonnes selon `can(...)` ; un champ oublié dans une nouvelle requête fuit, seul le test de bout en bout le rattrape | haute pour un socle multi-clients |
| Limiteur de connexion en mémoire | perdu au redémarrage, faux dès deux instances | basse aujourd'hui |
| Journal d'audit absent | impossible de dire qui a modifié un prix ou annulé un document | haute pour la production |
| Sauvegardes absentes | base Render gratuite sans sauvegarde, expiration le 2026-11-12 | haute pour la version finale |
| Isolation des tests | base de test partagée, tests de bout en bout dépendants de l'ordre | moyenne : cause du test instable |
| Couverture non mesurée | pas d'outil de couverture | basse |
| Versions | mélange de versions figées et de plages `^` ; Next.js 16 très récent, dont la doc embarquée avertit qu'il diffère des versions connues | moyenne |
| exceljs | maintenance ralentie, une vulnérabilité modérée transitive | basse : isoler derrière un adaptateur |
| Noms en dur | cookie `egm_session`, textes et préfixes de numérotation dans le code | basse, mais bloquant pour un socle |

### 7.3 Sécurité

| Sujet | Constat | Recommandation |
|---|---|---|
| Droits au champ | contrôlés côté serveur, mais au cas par cas | socle : politique déclarative `ressource → champ → droit`, appliquée par la couche d'accès aux données et par la sérialisation des réponses, plus un test qui appelle chaque route API avec chaque profil et cherche les champs interdits |
| `/labo` et `/labo/brouillon` | accessibles sans connexion ; la seconde fabrique un `.eml` avec destinataire, objet et texte passés dans l'adresse, servi depuis le domaine de l'application | socle : derrière connexion ou désactivé en production |
| Donnée réelle dans un test | `src/server/invoices/facturx.db.test.ts` contient une identité d'entreprise, raison sociale, SIRET, adresse, qui semble celle d'E G M, contrairement à la règle du projet | remplacer par des valeurs fictives, à reporter |
| Routes POST et CSRF | Server Actions protégées par Next ; routes `api/` protégées par SameSite Lax seulement | socle : vérification de l'en-tête `Origin` sur toute méthode d'écriture |
| En-têtes HTTP | pas de politique de sécurité de contenu ni d'en-têtes de durcissement déclarés | socle : en-têtes par défaut dans la configuration Next |
| Dépendances | 1 vulnérabilité modérée transitive | surveiller par `pnpm audit` en CI |

## 8. Recommandation sur la pile

### 8.1 Garder la pile comme standard

| Avantages | Limites |
|---|---|
| Une seule langue, TypeScript, du navigateur à la base ; types partagés de bout en bout | Next.js évolue vite et casse : version 16 avec Cache Components, mise en garde explicite dans egm-app |
| PostgreSQL et Drizzle : SQL lisible, migrations versionnées, verrous et contraintes avancées accessibles | Chromium pour les PDF : image lourde et plusieurs centaines de Mo de mémoire pendant une génération, à mesurer |
| Tout ce que le brief exige existe déjà, testé, dans egm-app | Hébergement Next hors Vercel : à maîtriser soi-même, ce que le Dockerfile fait déjà |
| Conteneur Docker standard : changement d'hébergeur sans réécriture | Projet récent, un seul client : peu de recul en production |
| Écosystème large, agents de développement efficaces sur cette pile | |

### 8.2 Ajustements proposés

| N° | Ajustement | Raison | Coût dans le socle |
|---|---|---|---|
| A1 | Versions exactes figées, Next.js compris ; montée de version planifiée par trimestre, pas au fil de l'eau | stabilité des applications clients | 1 h |
| A2 | Politique de droits au champ déclarative et test automatique de toutes les routes | sécurité multi-clients | inclus dans OPS-102 |
| A3 | Base de test isolée par lancement, assertions relatives | supprime l'instabilité | inclus dans OPS-107 |
| A4 | Journal d'audit en base, ajout seul, et sauvegardes `pg_dump` vers le stockage S3 avec procédure de restauration testée | exigences de production | inclus dans OPS-114 |
| A5 | Hébergement standard : Render payant, Francfort, pour démo durable et production ; base PostgreSQL payante avec sauvegardes ; stockage S3 européen ; Docker gardé pour la portabilité | le gratuit perd fichiers et base | configuration seule ; coût mensuel à vérifier sur la grille Render, de l'ordre de 7 à 25 dollars pour le service selon la mémoire nécessaire à Chromium, plus la base et le stockage |
| A6 | exceljs, Chromium et l'API Claude derrière des adaptateurs | remplacement possible sans toucher aux écrans | faible, déjà presque le cas |

### 8.3 Alternatives écartées

- **Autre framework JavaScript**, React Router 7, SvelteKit : gain marginal, réécriture de l'interface.
- **Pile serveur classique**, Django ou Rails avec rendu serveur : très stable, mais croquis, glisser-déposer et listes virtualisées restent du JavaScript lourd côté client ; deux langages à maintenir.
- **Plateforme sans code** : incompatible avec la propriété du code et les exigences de droits au champ.

### 8.4 Coût de migration

- Garder la pile : aucun coût de migration ; le socle se construit par extraction et nettoyage. Report des corrections du socle dans egm-app, après la démo : 1 à 2 jours selon la liste de `REPORTS-EGM.md`.
- Changer de pile : réécriture de l'équivalent de 26 000 lignes et de 300 tests, soit plusieurs semaines, pour un bénéfice nul sur les besoins du brief.

### 8.5 Forme du socle

Le contrat, section 11.6, prévoit `init_app.sh` qui copie le socle dans le dépôt du client. Chaque application diverge ensuite de son socle : une correction faite dans le socle se reporte à la main, comme le fera `REPORTS-EGM.md`. L'alternative, des paquets versionnés partagés entre applications, évite les reports mais coûte une chaîne de publication privée et complique les adaptations. Proposition : copie, avec un fichier `SOCLE_VERSION` dans chaque application et un journal des changements du socle, pour savoir quoi reporter.

## 9. Propriété du code

Le brief pose que SKEAM reste propriétaire du code du socle. Le `CLAUDE.md` d'egm-app indique au contraire que « le client en deviendra propriétaire au terme prévu par le contrat ». Si le contrat cède à E G M les droits sur l'ensemble du code livré, la réutilisation des parties génériques pour d'autres clients pourrait être contestée.

À vérifier dans le contrat signé avant toute extraction : une clause qui réserve à SKEAM ses outils et composants génériques, préexistants ou non spécifiques, et n'accorde au client qu'une licence d'usage sur ces parties. À défaut, prévoir un avenant. Ce point relève d'un conseil juridique ; l'audit se limite à le signaler.

En attendant, le socle sera réécrit comme du code générique SKEAM, sans nom de client ni règle propre à E G M ; la mention d'origine demandée pour chaque composant documente la provenance.

## 10. Plan de la phase 2

Après validation, dans `socle/`. Estimations en heures de développement, tests compris.

| Item | Contenu | Estimation |
|---|---|---|
| OPS-101 | application modèle installable, coquille adaptée du téléphone au grand écran, configuration par variables d'environnement | 12 h |
| OPS-102 | connexion, profils et droits déclarés, droits au champ y compris par l'API, test de toutes les routes | 8 h |
| OPS-107 | numérotation légale configurable, tests de concurrence, base de test isolée | 5 h |
| OPS-108 | montants au centime, TVA par taux, document générique à lignes | 4 h |
| OPS-109 | PDF : en-tête, mentions, IBAN paramétrables, annexes photos et croquis, archive unique | 6 h |
| OPS-110 | import Excel avec rapport des rejets, export Excel | 5 h |
| OPS-111 | listes de plusieurs milliers de lignes, filtres et tris sur toutes les colonnes | 4 h |
| OPS-112 | glisser-déposer de photos, PDF et mails Outlook ; croquis au stylet modifiable | 6 h |
| OPS-113 | brouillon de mail Outlook avec pièce jointe | 2 h |
| OPS-114 | journal d'audit, sauvegardes et restauration, effacement protégé | 5 h |
| OPS-115 | données de démonstration fictives et script d'effacement | 3 h |
| OPS-103 | `init_app.sh` conforme au contrat | 4 h |
| OPS-104 | `render.yaml` démo et production, procédure | 5 h |
| OPS-116 | `README.md` du socle et `REPORTS-EGM.md` | 2 h |

Total : environ 71 heures. OPS-105, alignement sur le catalogue, dépend du chantier catalogue et reste en lot 2.

## 11. Questions pour Théo

Chaque question a une proposition par défaut, appliquée si tu valides sans commentaire.

1. **Pile** : garder la pile d'egm-app avec les ajustements A1 à A6. Défaut : oui.
2. **Propriété** : vérifier la clause du contrat E G M, section 9. Défaut : je construis le socle en code générique réécrit, la décision juridique reste de ton ressort.
3. **Profils du modèle** : trois profils de démonstration, `admin`, `gestion` qui voit les prix, `terrain` qui ne les voit pas. Défaut : oui.
4. **Hébergement** : `render.yaml` du socle décrit une démo et une production en plan payant, Francfort ; je ne crée aucun service Render moi-même. Défaut : oui.
5. **Forme du socle** : copie par `init_app.sh` avec `SOCLE_VERSION`, section 8.5. Défaut : oui.
6. **Branche** : `feat/socle` part de `feat/init`, dont la pull request n'est pas encore fusionnée ; ma pull request cible `feat/init` et sera reciblée sur `main` après sa fusion. Défaut : oui.
