#!/bin/sh
# Démarrage du conteneur : migrations toujours, comptes et jeu fictif si SEED_DEMO=1, puis l'application.
# Origine : egm-app `docker-entrypoint.sh`.
set -e
pnpm db:migrate
if [ "${SEED_DEMO:-0}" = "1" ]; then
  pnpm db:seed
  pnpm demo:seed
fi
exec pnpm start -p "${PORT:-3000}"
