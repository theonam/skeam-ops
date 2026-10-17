#!/bin/sh
# Script d'installation de l'environnement cloud Claude Code de SKEAM, CONTRAT.md section 15.2.
#
# À coller tel quel dans les réglages de l'environnement cloud de claude.ai (menu de
# l'environnement dans la barre de titre d'une session, Modifier, « Setup script »). Ce script
# est conservé d'un conteneur à l'autre, contrairement à ~/.claude et à la configuration locale
# des clones, qui disparaissent quand le conteneur est récupéré.
#
# Il active le relevé de la consommation des agents dans tous les dépôts clonés, que la session
# s'ouvre dans /home/user ou à la racine d'un dépôt :
#   1. il installe /usr/local/bin/skeam-activer-conso, qui cherche les dépôts portant
#      .skeam/conso.py sous les dossiers de travail et lance pour chacun
#      « python3 <dépôt>/.skeam/conso.py installer --silencieux » (core.hooksPath du clone) ;
#   2. il le lance une première fois ;
#   3. il ajoute aux réglages de l'utilisateur, ~/.claude/settings.json, des crochets
#      SessionStart et UserPromptSubmit qui le relancent : un dépôt cloné en cours de session
#      est activé au message suivant.
#
# Idempotent, muet, ne fait jamais échouer l'environnement : sortie toujours 0.
# Variables pour les tests : SKEAM_BIN (défaut /usr/local/bin), SKEAM_RACINES (défaut
# « /home/user », dossiers séparés par des espaces), HOME.

BIN="${SKEAM_BIN:-/usr/local/bin}"
RACINES="${SKEAM_RACINES:-/home/user}"
ACTIVER="$BIN/skeam-activer-conso"

mkdir -p "$BIN" 2>/dev/null
cat > "$ACTIVER" <<EOF || exit 0
#!/bin/sh
# Active le relevé de consommation des agents dans chaque dépôt qui porte .skeam/conso.py.
# Installé par le script d'installation de l'environnement de SKEAM ; toujours muet, sortie 0.
racines="\$*"
[ -n "\$racines" ] || racines="\${CLAUDE_PROJECT_DIR:-} \$PWD $RACINES"
command -v python3 >/dev/null 2>&1 || exit 0
for racine in \$racines; do
  [ -d "\$racine" ] && [ "\$racine" != / ] || continue
  find "\$racine" -maxdepth 4 \\( -name node_modules -o -name .git -o -name .next -o -name .venv -o -name __pycache__ \\) -prune \\
    -o -type f -path '*/.skeam/conso.py' -print 2>/dev/null
done | sort -u | while IFS= read -r script; do
  python3 "\$script" installer --silencieux >/dev/null 2>&1 || true
done
exit 0
EOF
chmod +x "$ACTIVER" 2>/dev/null

"$ACTIVER" $RACINES >/dev/null 2>&1

REGLAGES="$HOME/.claude/settings.json"
mkdir -p "$HOME/.claude" 2>/dev/null
command -v python3 >/dev/null 2>&1 && python3 - "$REGLAGES" "$ACTIVER" <<'EOF' >/dev/null 2>&1
import json, sys
from pathlib import Path

chemin, activer = Path(sys.argv[1]), sys.argv[2]
commande = f'[ -x "{activer}" ] && "{activer}" >/dev/null 2>&1 || true'
try:
    reglages = json.loads(chemin.read_text(encoding="utf-8")) if chemin.exists() else {}
except ValueError:
    sys.exit(0)  # réglages illisibles : rien touché
if not isinstance(reglages, dict) or not isinstance(reglages.setdefault("hooks", {}), dict):
    sys.exit(0)
change = False
for evenement in ("SessionStart", "UserPromptSubmit"):
    liste = reglages["hooks"].setdefault(evenement, [])
    if not isinstance(liste, list):
        continue
    deja = any(isinstance(g, dict) and any(isinstance(c, dict) and "skeam-activer-conso" in str(c.get("command", ""))
                                           for c in g.get("hooks") or []) for g in liste)
    if not deja:
        liste.append({"hooks": [{"type": "command", "command": commande}]})
        change = True
if change:
    chemin.write_text(json.dumps(reglages, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
EOF
exit 0
