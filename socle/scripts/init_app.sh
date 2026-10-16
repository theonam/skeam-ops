#!/usr/bin/env bash
# Initialise une application client à partir du socle SKEAM. Interface : CONTRAT.md section 11.6.
#
#   socle/scripts/init_app.sh <dossier_cible>
#
# - <dossier_cible> peut déjà contenir .git/, un README.md et projet/ : rien n'est créé, modifié ni
#   supprimé dans projet/, qui est seulement lu pour le slug et le nom du client ;
# - refuse, code 1, d'écraser un fichier d'application existant, et dans ce cas n'écrit rien ;
# - crée ou complète le CLAUDE.md racine pour qu'il contienne la ligne @projet/CLAUDE-projet.md ;
# - crée README.md seulement s'il n'existe pas ;
# - écrit SOCLE_VERSION : version du socle copiée, pour savoir plus tard quelles corrections reporter.
#
# Codes de sortie : 0 succès, 1 erreur de données, 2 usage incorrect. Messages d'erreur en français
# sur la sortie d'erreur.
set -euo pipefail

usage() {
  echo "Usage : socle/scripts/init_app.sh <dossier_cible>" >&2
  exit 2
}

[ "$#" -eq 1 ] || usage
[ -n "$1" ] || usage

SOCLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$SOCLE_DIR/app"
TARGET="$1"

if [ ! -d "$SOURCE" ]; then
  echo "Socle introuvable : $SOURCE" >&2
  exit 1
fi
if [ -e "$TARGET" ] && [ ! -d "$TARGET" ]; then
  echo "La cible existe et n'est pas un dossier : $TARGET" >&2
  exit 1
fi
mkdir -p "$TARGET"
TARGET="$(cd "$TARGET" && pwd)"
case "$TARGET/" in
  "$SOURCE/"*) echo "La cible ne peut pas être dans le socle lui-même." >&2; exit 1 ;;
esac

# Fichiers de l'application : ceux suivis par Git quand le socle est un dépôt, sinon tout sauf les
# fichiers produits localement. Jamais de dossier projet/, de secret ni de dépendance installée.
list_files() {
  if git -C "$SOURCE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$SOURCE" ls-files --cached --others --exclude-standard -- .
  else
    (cd "$SOURCE" && find . -type f \
      -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./test-results/*" \
      -not -path "./playwright-report/*" -not -path "./e2e/screenshots/*" -not -path "./.storage/*" \
      -not -path "./data/*" -not -name ".env" -not -name "*.tsbuildinfo" -not -name "next-env.d.ts" \
      | sed 's|^\./||')
  fi
}

FILES=()
while IFS= read -r file; do
  case "$file" in
    projet/*|.env|CLAUDE.md|README.md|"") continue ;;
  esac
  [ -f "$SOURCE/$file" ] || continue
  FILES+=("$file")
done < <(list_files | sort -u)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "Aucun fichier d'application trouvé dans le socle." >&2
  exit 1
fi

# Contrôle avant toute écriture : aucun fichier d'application ne doit déjà exister.
CONFLICTS=()
for file in "${FILES[@]}" SOCLE_VERSION; do
  [ -e "$TARGET/$file" ] && CONFLICTS+=("$file")
done
if [ "${#CONFLICTS[@]}" -gt 0 ]; then
  echo "Refus : ${#CONFLICTS[@]} fichier(s) d'application existent déjà dans $TARGET, rien n'a été écrit :" >&2
  printf '  %s\n' "${CONFLICTS[@]:0:20}" >&2
  [ "${#CONFLICTS[@]}" -gt 20 ] && echo "  …" >&2
  exit 1
fi

# Identité du client, lue dans projet/client.yaml s'il existe ; sinon tirée du nom du dossier.
SLUG=""
NOM=""
if [ -f "$TARGET/projet/client.yaml" ]; then
  SLUG="$(sed -n 's/^slug:[[:space:]]*"\{0,1\}\([a-z][a-z0-9]*\)"\{0,1\}[[:space:]]*$/\1/p' "$TARGET/projet/client.yaml" | head -n 1)"
  NOM="$(sed -n 's/^nom:[[:space:]]*//p' "$TARGET/projet/client.yaml" | head -n 1 | sed 's/^"\(.*\)"$/\1/')"
fi
if [ -z "$SLUG" ]; then
  SLUG="$(basename "$TARGET" | tr '[:upper:]' '[:lower:]' | sed 's/-app$//; s/[^a-z0-9]//g')"
  [ -n "$SLUG" ] || SLUG="app"
  case "$SLUG" in [a-z]*) ;; *) SLUG="app$SLUG" ;; esac
fi
[ -n "$NOM" ] || NOM="$SLUG"
# Le nom passe dans du YAML et un fichier .env entre guillemets : guillemets et barres obliques inverses retirés.
NOM="$(printf '%s' "$NOM" | tr -d '"\\')"

for file in "${FILES[@]}"; do
  mkdir -p "$(dirname "$TARGET/$file")"
  cp -p "$SOURCE/$file" "$TARGET/$file"
done

# Identité reportée là où elle sert : déploiement et exemple de configuration.
escape_sed() { printf '%s' "$1" | sed 's/[&|]/\\&/g'; }
for file in render.yaml .env.example; do
  [ -f "$TARGET/$file" ] || continue
  sed -i.bak -e "s|__SLUG__|$(escape_sed "$SLUG")|g" -e "s|__NOM__|$(escape_sed "$NOM")|g" "$TARGET/$file"
  rm -f "$TARGET/$file.bak"
done
if [ -f "$TARGET/.env.example" ]; then
  sed -i.bak -e "s|^APP_NAME=.*|APP_NAME=$(escape_sed "$NOM")|" -e "s|^SESSION_COOKIE_NAME=.*|SESSION_COOKIE_NAME=${SLUG}_session|" "$TARGET/.env.example"
  rm -f "$TARGET/.env.example.bak"
fi

# CLAUDE.md : créé depuis le socle, ou complété des lignes qui manquent.
if [ -f "$TARGET/CLAUDE.md" ]; then
  for line in "@docs/CONVENTIONS.md" "@projet/CLAUDE-projet.md"; do
    if ! grep -qxF "$line" "$TARGET/CLAUDE.md"; then
      [ -n "$(tail -c 1 "$TARGET/CLAUDE.md")" ] && printf '\n' >> "$TARGET/CLAUDE.md"
      printf '%s\n' "$line" >> "$TARGET/CLAUDE.md"
    fi
  done
else
  cp "$SOURCE/CLAUDE.md" "$TARGET/CLAUDE.md"
fi

if [ ! -e "$TARGET/README.md" ]; then
  printf '# %s\n\nApplication construite sur le socle SKEAM. Démarrage : [docs/APPLICATION.md](docs/APPLICATION.md). Conventions : [docs/CONVENTIONS.md](docs/CONVENTIONS.md).\n' "$NOM" > "$TARGET/README.md"
fi

VERSION="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$SOURCE/package.json" | head -n 1)"
COMMIT="$(git -C "$SOURCE" rev-parse --short HEAD 2>/dev/null || echo inconnu)"
printf 'socle %s, commit %s, copié le %s\n' "${VERSION:-inconnue}" "$COMMIT" "$(TZ=Europe/Paris date +%F)" > "$TARGET/SOCLE_VERSION"

echo "Application initialisée dans $TARGET : ${#FILES[@]} fichiers, slug $SLUG."
echo "Suite : cd $TARGET && pnpm local:setup"
