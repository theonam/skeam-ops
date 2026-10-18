#!/bin/sh
# Script d'installation de l'environnement cloud Claude Code de SKEAM, CONTRAT.md section 15.2.
#
# À coller une seule fois dans les réglages de l'environnement cloud de claude.ai (menu de
# l'environnement dans la barre de titre d'une session, Modifier, « Setup script »). Il s'exécute
# ensuite tout seul à chaque démarrage d'une nouvelle machine.
#
# Version réduite retenue par Théo le 2026-10-18 : il active le relevé de la consommation des agents
# dans chaque dépôt cloné qui porte .skeam/conso.py, en lançant
# « python3 <dépôt>/.skeam/conso.py installer --silencieux » (core.hooksPath du clone), et rien
# d'autre : aucun réglage de l'utilisateur modifié, aucun crochet sur les messages. Un dépôt cloné
# en cours de session n'est pas activé ; /skeam-bilan rattrape sa session.
#
# Idempotent, muet, ne fait jamais échouer l'environnement : sortie toujours 0.
# Variable pour les tests : SKEAM_RACINES (défaut « /home/user », dossiers séparés par des espaces).

RACINES="${SKEAM_RACINES:-/home/user}"
command -v python3 >/dev/null 2>&1 || exit 0
for racine in $RACINES; do
  [ -d "$racine" ] && [ "$racine" != / ] || continue
  find "$racine" -maxdepth 4 \( -name node_modules -o -name .git -o -name .next -o -name .venv -o -name __pycache__ \) -prune \
    -o -type f -path '*/.skeam/conso.py' -print 2>/dev/null
done | sort -u | while IFS= read -r script; do
  python3 "$script" installer --silencieux >/dev/null 2>&1 || true
done
exit 0
