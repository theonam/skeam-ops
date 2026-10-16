#!/usr/bin/env bash
# Installation locale en une commande : `pnpm local:setup`. Prérequis : Node 22, pnpm, Docker.
# Origine : egm-app `scripts/local-setup.sh`.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Fichier .env créé à partir de .env.example : pensez à changer DEMO_PASSWORD."
fi

pnpm install
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm demo:seed
echo
echo "Prêt. Lancez « pnpm dev » puis ouvrez http://localhost:3000"
