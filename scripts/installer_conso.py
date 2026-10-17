"""Installe le relevé de la consommation des agents dans un dépôt, CONTRAT.md section 11.8.

Usage :
    python scripts/installer_conso.py <racine du dépôt> --prefixe EGM [--sans-crochet] [--remplacer]

Copie templates/depot-client/ à la racine du dépôt : .skeam/conso.py, .skeam/githooks/pre-commit,
.skeam/README.md, .skeam/conso/.gitkeep ; écrit .skeam/conso.json avec le préfixe ; ajoute le crochet
SessionStart à .claude/settings.json sans perdre ce qu'il contient ; ajoute la ligne merge=union à
.gitattributes ; active le crochet Git, sauf avec --sans-crochet. Ne touche à rien dans projet/,
ne commite rien. Idempotent.

Un fichier existant différent du gabarit est refusé, code 1, sauf avec --remplacer, qui met à jour
conso.py, le crochet et le README vers la version du gabarit.

Code de sortie : 0 succès, 1 refus ou erreur de données, 2 usage incorrect.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

RACINE_OPS = Path(__file__).resolve().parent.parent
GABARIT = RACINE_OPS / "templates" / "depot-client"
COPIES = [".skeam/conso.py", ".skeam/githooks/pre-commit", ".skeam/README.md", ".skeam/conso/.gitkeep"]
EXECUTABLES = {".skeam/conso.py", ".skeam/githooks/pre-commit"}
RE_PREFIXE = re.compile(r"^[A-Z][A-Z0-9]{1,11}$")


def commande_session_start() -> dict:
    reglages = json.loads((GABARIT / ".claude" / "settings.json").read_text(encoding="utf-8"))
    return reglages["hooks"]["SessionStart"][0]


def fusionner_reglages(existant: dict) -> tuple[dict, bool]:
    """Ajoute le crochet SessionStart du relevé s'il n'y est pas ; ne retire ni ne modifie rien d'autre."""
    entree = commande_session_start()
    commande = entree["hooks"][0]["command"]
    hooks = existant.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        raise ValueError(".claude/settings.json : la clé hooks n'est pas un dictionnaire")
    liste = hooks.setdefault("SessionStart", [])
    if not isinstance(liste, list):
        raise ValueError(".claude/settings.json : hooks.SessionStart n'est pas une liste")
    for groupe in liste:
        for crochet in (groupe.get("hooks") or []) if isinstance(groupe, dict) else []:
            if isinstance(crochet, dict) and ".skeam/conso.py" in str(crochet.get("command", "")):
                return existant, False
    liste.append(entree)
    return existant, True


def installer(depot: Path, prefixe: str, sans_crochet: bool, remplacer: bool) -> tuple[int, list[str]]:
    messages: list[str] = []
    refus: list[str] = []
    a_copier: list[str] = []
    for relatif in COPIES:
        cible = depot / relatif
        source = GABARIT / relatif
        if cible.exists() and cible.read_bytes() != source.read_bytes():
            if remplacer and relatif != ".skeam/conso/.gitkeep":
                a_copier.append(relatif)
            else:
                refus.append(relatif)
        elif not cible.exists():
            a_copier.append(relatif)
    config = depot / ".skeam" / "conso.json"
    if config.exists():
        try:
            actuel = json.loads(config.read_text(encoding="utf-8"))
        except ValueError:
            actuel = None
        if not isinstance(actuel, dict) or actuel.get("prefixe") != prefixe:
            refus.append(".skeam/conso.json, préfixe différent")
    if refus:
        return 1, ["fichiers existants différents du gabarit, rien installé : " + ", ".join(refus)
                   + " ; relancer avec --remplacer pour mettre à jour le relevé"]

    reglages_chemin = depot / ".claude" / "settings.json"
    reglages: dict = {}
    if reglages_chemin.exists():
        try:
            reglages = json.loads(reglages_chemin.read_text(encoding="utf-8"))
        except ValueError:
            return 1, [".claude/settings.json illisible, rien installé"]
        if not isinstance(reglages, dict):
            return 1, [".claude/settings.json n'est pas un objet JSON, rien installé"]
    try:
        reglages, ajoute = fusionner_reglages(reglages)
    except ValueError as exc:
        return 1, [f"{exc}, rien installé"]

    for relatif in a_copier:
        cible = depot / relatif
        cible.parent.mkdir(parents=True, exist_ok=True)
        cible.write_bytes((GABARIT / relatif).read_bytes())
        messages.append(f"copié {relatif}")
    for relatif in EXECUTABLES:
        cible = depot / relatif
        os.chmod(cible, cible.stat().st_mode | 0o111)
    if not config.exists():
        config.write_text(json.dumps({"version": 1, "prefixe": prefixe}) + "\n", encoding="utf-8")
        messages.append("écrit .skeam/conso.json")
    if ajoute:
        reglages_chemin.parent.mkdir(parents=True, exist_ok=True)
        reglages_chemin.write_text(json.dumps(reglages, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        messages.append("crochet SessionStart ajouté à .claude/settings.json")
    ligne = (GABARIT / "gitattributes.txt").read_text(encoding="utf-8").strip()
    attributs = depot / ".gitattributes"
    texte = attributs.read_text(encoding="utf-8") if attributs.exists() else ""
    if ligne not in texte.splitlines():
        attributs.write_text(texte + ("" if not texte or texte.endswith("\n") else "\n") + ligne + "\n", encoding="utf-8")
        messages.append("ligne merge=union ajoutée à .gitattributes")
    if sans_crochet:
        messages.append("crochet Git non activé, --sans-crochet : lancer python3 .skeam/conso.py installer dans le clone pour l'activer")
    else:
        sortie = subprocess.run([sys.executable, str(depot / ".skeam" / "conso.py"), "installer"], cwd=depot,
                                capture_output=True, text=True, check=False)
        messages.append(sortie.stdout.strip() or "crochet Git : aucune sortie")
    if not (depot / "projet" / "CLAUDE-projet.md").exists():
        messages.append("ajouter à CLAUDE.md la consigne de templates/depot-client/CLAUDE-section-conso.md")
    return 0, messages


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Installe le relevé de la consommation des agents dans un dépôt.")
    parser.add_argument("depot", type=Path, help="racine du dépôt client")
    parser.add_argument("--prefixe", required=True, help="préfixe des ids d'items du dépôt, par exemple EGM")
    parser.add_argument("--sans-crochet", action="store_true", help="ne pas activer core.hooksPath")
    parser.add_argument("--remplacer", action="store_true", help="mettre à jour conso.py, le crochet et le README")
    args = parser.parse_args(argv)
    if not RE_PREFIXE.match(args.prefixe):
        print("installer_conso.py: erreur : préfixe attendu en majuscules, par exemple EGM", file=sys.stderr)
        return 2
    depot = args.depot.resolve()
    if not (depot / ".git").exists():
        print(f"installer_conso.py: erreur : {args.depot} n'est pas la racine d'un dépôt Git", file=sys.stderr)
        return 2
    code, messages = installer(depot, args.prefixe, args.sans_crochet, args.remplacer)
    for message in messages:
        print(message if code == 0 else f"installer_conso.py: erreur : {message}", file=sys.stdout if code == 0 else sys.stderr)
    return code


if __name__ == "__main__":
    sys.exit(main())
