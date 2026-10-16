#!/usr/bin/env python3
"""Pointage automatique du temps passé en session Claude Code.

Appelé par les hooks de `.claude/settings.json` à chaque événement de session :
UserPromptSubmit, PreToolUse, PostToolUse, Stop et SessionStart. L'événement
arrive en JSON sur l'entrée standard.

Principe :

- chaque événement est noté, avec son heure, dans un fichier d'état propre à la
  session, hors du dépôt : `~/.claude/pointage/<session_id>.jsonl` ;
- le temps compte tant que Claude travaille, et pendant l'attente de la réponse
  de Théo si elle dure au plus `pause_minutes` (20 par défaut) ; une attente plus
  longue est une pause, qui ne compte pas ;
- à chaque `git commit`, juste avant qu'il parte, le temps écoulé depuis le
  commit précédent de la session est écrit en lignes de temps au format de
  CONTRAT.md section 6, rattachées à l'item cité dans le message du commit, et
  le fichier de temps est ajouté au commit ;
- sur une branche sans dossier `projet/`, celle du code d'egm-app par exemple,
  les lignes attendent hors du dépôt, `attente-<session>-<prefixe>.jsonl`, et
  partent avec le prochain commit de la session sur une branche qui a `projet/`.

Changement de branche : Claude Code relit `.claude/settings.json` quand le
fichier change ; une branche qui ne l'a pas coupe donc les hooks. Chaque branche
où l'agent travaille doit porter `.claude/`. Par sécurité, le script se copie
dans le dossier d'état et la configuration y est gardée par dépôt, et la
commande du hook appelle la copie quand le script du dépôt manque.

Configuration, dans le dépôt où part le commit : `.claude/pointage.json`.

    {"prefixe": "OPS", "agent": "ops-init", "pause_minutes": 20,
     "agents_par_plage": [[101, 199, "ops-socle"], [401, 499, "ops-dashboard"]]}

`agent` est l'agent par défaut ; `agents_par_plage` choisit l'agent d'après le
numéro de l'item. Un dépôt sans ce fichier n'est pas pointé.

Le hook ne bloque jamais Claude Code : toute erreur est ignorée, code de sortie 0.
Dépendances : bibliothèque standard seulement, pour être copié tel quel dans un
dépôt client sous `.claude/hooks/pointage.py`.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    from zoneinfo import ZoneInfo

    PARIS = ZoneInfo("Europe/Paris")
except Exception:  # pragma: no cover, Windows sans tzdata : heure locale
    PARIS = None

try:
    import fcntl
except ImportError:  # pragma: no cover, Windows : pas de verrou
    fcntl = None

# Après ces événements, Claude attend Théo : un silence plus long que la pause ne compte pas.
ATTENTE = {"Stop", "SessionStart"}
EVENEMENTS = {"UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SessionStart"}
PAUSE_MINUTES = 20
RE_COMMIT = re.compile(r"\bgit\b(?:\s+-[cC]\s+\S+)*\s+commit\b")
RE_CD = re.compile(r"^\s*cd\s+(\"[^\"]+\"|'[^']+'|[^\s;&|]+)\s*(?:&&|;)")
RE_ITEM = r"\b{prefixe}-[0-9]{{3}}\b"
RE_ITEM_GENERIQUE = re.compile(r"\b[A-Z][A-Z0-9]{1,11}-[0-9]{3}\b")


def dossier_etat() -> Path:
    return Path(os.environ.get("POINTAGE_ETAT") or Path.home() / ".claude" / "pointage")


def cle_depot(racine: Path) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", str(racine.resolve()).strip("/\\")) or "racine"


def configuration(racine: Path) -> dict | None:
    """`.claude/pointage.json` du dépôt, gardé dans le dossier d'état pour les branches qui ne l'ont pas."""
    cache = dossier_etat() / "config" / f"{cle_depot(racine)}.json"
    fichier = racine / ".claude" / "pointage.json"
    if fichier.is_file():
        texte = fichier.read_text(encoding="utf-8")
        config = json.loads(texte)
        cache.parent.mkdir(parents=True, exist_ok=True)
        if not cache.is_file() or cache.read_text(encoding="utf-8") != texte:
            cache.write_text(texte, encoding="utf-8")
        return config
    return json.loads(cache.read_text(encoding="utf-8")) if cache.is_file() else None


def garder_copie() -> None:
    """Copie ce script dans le dossier d'état, appelée par le hook quand le dépôt n'a pas le script."""
    source = Path(__file__).resolve()
    copie = dossier_etat() / "pointage.py"
    if source == copie.resolve():
        return
    contenu = source.read_bytes()
    if not copie.is_file() or copie.read_bytes() != contenu:
        copie.parent.mkdir(parents=True, exist_ok=True)
        copie.write_bytes(contenu)


def heure_locale(horodatage: float) -> datetime:
    return datetime.fromtimestamp(horodatage, PARIS) if PARIS else datetime.fromtimestamp(horodatage)


def segments(evenements: list[tuple[float, str]], pause_s: float) -> list[tuple[float, float]]:
    """Périodes d'activité continue, coupées par les attentes de plus de pause_s après un Stop."""
    evenements = sorted(evenements)
    resultat: list[tuple[float, float]] = []
    if not evenements:
        return resultat
    debut, precedent = evenements[0]
    fin = debut
    for horodatage, genre in evenements[1:]:
        if precedent in ATTENTE and horodatage - fin > pause_s:
            resultat.append((debut, fin))
            debut = horodatage
        fin, precedent = horodatage, genre
    resultat.append((debut, fin))
    return [(d, f) for d, f in resultat if f > d]


def lignes_de_temps(segs: list[tuple[float, float]], item: str | None, agent: str, note: str) -> list[dict]:
    """Une ligne par segment, bornes arrondies à la minute la plus proche ; un segment de 0 minute est omis."""
    lignes = []
    for debut, fin in segs:
        d = round(debut / 60) * 60
        f = round(fin / 60) * 60
        minutes = int((f - d) // 60)
        if minutes < 1:
            continue
        minutes = min(minutes, 1440)
        h_debut = heure_locale(d)
        h_fin = heure_locale(d + minutes * 60)
        lignes.append({
            "date": h_debut.strftime("%Y-%m-%d"),
            "debut": h_debut.strftime("%H:%M"),
            "fin": h_fin.strftime("%H:%M"),
            "minutes": minutes,
            "item": item,
            "source": "claude-code",
            "agent": agent,
            "note": note,
            "valide": False,
        })
    return lignes


def minutes_entre(debut: str, fin: str) -> int:
    h1, m1 = map(int, debut.split(":"))
    h2, m2 = map(int, fin.split(":"))
    return (h2 * 60 + m2 - h1 * 60 - m1) % 1440


def decaler(ligne: dict, existants: set[tuple[str, str]]) -> dict | None:
    """Évite une ligne en double pour le même agent, la même date et la même heure de début."""
    while (ligne["date"], ligne["debut"]) in existants:
        if ligne["minutes"] <= 1:
            return None
        h, m = map(int, ligne["debut"].split(":"))
        total = (h * 60 + m + 1) % 1440
        ligne = dict(ligne, debut=f"{total // 60:02d}:{total % 60:02d}")
        ligne["minutes"] = minutes_entre(ligne["debut"], ligne["fin"])
    return ligne


def item_du_commit(commande: str, prefixe: str | None) -> str | None:
    """Premier id d'item cité après `git commit` dans la commande."""
    position = RE_COMMIT.search(commande)
    texte = commande[position.end():] if position else commande
    motif = re.compile(RE_ITEM.format(prefixe=re.escape(prefixe))) if prefixe else RE_ITEM_GENERIQUE
    trouve = motif.search(texte)
    return trouve.group(0) if trouve else None


def dossier_du_commit(commande: str, cwd: str) -> Path:
    """Dossier où part le commit : `cd <dossier> &&` en tête de commande, `git -C <dossier>`, sinon cwd."""
    base = Path(cwd or os.getcwd())
    cd = RE_CD.match(commande)
    if cd:
        base = base / os.path.expanduser(cd.group(1).strip("\"'"))
    try:
        mots = shlex.split(commande[cd.end():] if cd else commande)
    except ValueError:
        mots = []
    for i, mot in enumerate(mots[:-1]):
        if mot == "git" and mots[i + 1] == "-C" and i + 2 < len(mots):
            base = base / os.path.expanduser(mots[i + 2])
            break
    return base


def racine_git(dossier: Path) -> Path | None:
    try:
        sortie = subprocess.run(["git", "-C", str(dossier), "rev-parse", "--show-toplevel"],
                                capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    return Path(sortie.stdout.strip()) if sortie.returncode == 0 and sortie.stdout.strip() else None


def projet_suivi(racine: Path) -> bool:
    """Vrai si la branche courante suit des fichiers dans projet/ ; un dossier resté après un changement de branche ne compte pas."""
    try:
        sortie = subprocess.run(["git", "-C", str(racine), "ls-files", "--", "projet"],
                                capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return False
    return sortie.returncode == 0 and bool(sortie.stdout.strip())


def agent_pour(config: dict, item: str | None) -> str:
    if item:
        numero = int(item.rsplit("-", 1)[1])
        for de, a, agent in config.get("agents_par_plage", []):
            if de <= numero <= a:
                return agent
    return config["agent"]


def ecrire_lignes(racine: Path, lignes: list[dict]) -> list[Path]:
    """Ajoute les lignes en fin de projet/temps/AAAA-MM-<agent>.jsonl ; renvoie les fichiers touchés."""
    touches: list[Path] = []
    for ligne in lignes:
        fichier = racine / "projet" / "temps" / f"{ligne['date'][:7]}-{ligne['agent']}.jsonl"
        fichier.parent.mkdir(parents=True, exist_ok=True)
        texte = fichier.read_text(encoding="utf-8") if fichier.exists() else ""
        existants = set()
        for brute in texte.splitlines():
            try:
                objet = json.loads(brute)
                existants.add((objet["date"], objet["debut"]))
            except (ValueError, KeyError, TypeError):
                continue
        ligne = decaler(ligne, existants)
        if ligne is None:
            continue
        if texte and not texte.endswith("\n"):
            texte += "\n"
        texte += json.dumps(ligne, ensure_ascii=False, separators=(",", ":")) + "\n"
        fichier.write_text(texte, encoding="utf-8")
        if fichier not in touches:
            touches.append(fichier)
    return touches


class Etat:
    """Événements de la session depuis le dernier commit, un par ligne : horodatage et genre."""

    def __init__(self, session: str):
        nom = re.sub(r"[^A-Za-z0-9_.-]", "_", session or "inconnue")
        self.chemin = dossier_etat() / f"{nom}.jsonl"

    def __enter__(self) -> "Etat":
        self.chemin.parent.mkdir(parents=True, exist_ok=True)
        self.fichier = open(self.chemin, "a+", encoding="utf-8")
        if fcntl:
            fcntl.flock(self.fichier, fcntl.LOCK_EX)
        return self

    def __exit__(self, *_: object) -> None:
        if fcntl:
            fcntl.flock(self.fichier, fcntl.LOCK_UN)
        self.fichier.close()

    def ajouter(self, horodatage: float, genre: str) -> None:
        self.fichier.write(json.dumps([horodatage, genre]) + "\n")
        self.fichier.flush()

    def lire(self) -> list[tuple[float, str]]:
        self.fichier.seek(0)
        evenements = []
        for brute in self.fichier.read().splitlines():
            try:
                horodatage, genre = json.loads(brute)
                evenements.append((float(horodatage), str(genre)))
            except (ValueError, TypeError):
                continue
        return evenements

    def repartir_de(self, horodatage: float) -> None:
        """Après un commit : le temps suivant part de ce commit."""
        self.fichier.seek(0)
        self.fichier.truncate()
        self.ajouter(horodatage, "commit")


def traiter(evenement: dict, maintenant: float) -> list[dict]:
    """Note l'événement ; au commit, écrit et renvoie les lignes de temps produites."""
    genre = evenement.get("hook_event_name")
    if genre not in EVENEMENTS:
        return []
    commande = ""
    if genre == "PreToolUse" and evenement.get("tool_name") == "Bash":
        commande = str((evenement.get("tool_input") or {}).get("command") or "")
    if genre in ("SessionStart", "UserPromptSubmit"):
        garder_copie()
    session_id = str(evenement.get("session_id") or "")
    with Etat(session_id) as etat:
        etat.ajouter(maintenant, genre)
        if not RE_COMMIT.search(commande):
            return []
        evenements = etat.lire()
        etat.repartir_de(maintenant)
    racine = racine_git(dossier_du_commit(commande, str(evenement.get("cwd") or "")))
    config = configuration(racine) if racine else None
    if racine is None or config is None:
        return []
    item = item_du_commit(commande, config.get("prefixe"))
    session = session_id[:8]
    note = f"Pointage automatique, session {session}" if session else "Pointage automatique"
    pause_s = 60 * float(config.get("pause_minutes", PAUSE_MINUTES))
    lignes = lignes_de_temps(segments(evenements, pause_s), item, agent_pour(config, item), note)
    nom = re.sub(r"[^A-Za-z0-9_.-]", "_", f"{session_id or 'inconnue'}-{config.get('prefixe') or 'sans'}")
    attente = dossier_etat() / f"attente-{nom}.jsonl"
    if not projet_suivi(racine):
        # Branche de code sans dossier projet : les lignes attendent le prochain commit de pilotage.
        if lignes:
            attente.parent.mkdir(parents=True, exist_ok=True)
            with open(attente, "a", encoding="utf-8") as fichier:
                for ligne in lignes:
                    fichier.write(json.dumps(ligne, ensure_ascii=False, separators=(",", ":")) + "\n")
        return lignes
    en_attente = []
    if attente.is_file():
        for brute in attente.read_text(encoding="utf-8").splitlines():
            try:
                en_attente.append(json.loads(brute))
            except ValueError:
                continue
    for fichier in ecrire_lignes(racine, en_attente + lignes):
        subprocess.run(["git", "-C", str(racine), "add", "--", str(fichier.relative_to(racine))],
                       capture_output=True, timeout=10)
    if attente.is_file():
        attente.unlink()
    return en_attente + lignes


def main() -> int:
    try:
        traiter(json.loads(sys.stdin.read() or "{}"), time.time())
    except Exception as erreur:  # le pointage ne doit jamais gêner la session
        print(f"pointage : {erreur}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
