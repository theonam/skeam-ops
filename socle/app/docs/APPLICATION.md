# Démarrer l'application

Prérequis : Node 22, pnpm 10, Docker.

```bash
pnpm local:setup   # dépendances, PostgreSQL dans Docker, migrations, comptes et jeu de démonstration
pnpm dev           # http://localhost:3000
```

Comptes de démonstration : `admin`, `gestion` et `terrain`, mot de passe `DEMO_PASSWORD` du fichier `.env`. Le profil `terrain` ne voit aucun prix.

Variables d'environnement : voir `.env.example`. Déploiement : `render.yaml`, ou l'image Docker chez tout hébergeur avec PostgreSQL 16 et un stockage compatible S3.

Conventions de développement : `docs/CONVENTIONS.md`.
