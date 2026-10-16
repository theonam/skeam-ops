"""Temps passé mesuré sur l'historique d'une session, réparti par item grâce aux commits.

Commande de /skeam-bilan. Lit les horodatages d'une session de travail (historique Claude Code au
format JSONL, ou une liste d'horodatages ISO 8601), en tire les périodes d'activité réelle, coupées
dès qu'une pause dépasse le seuil, puis répartit chaque période entre les items d'après les commits
faits pendant la session : le temps qui précède un commit `EGM-040: …` revient à EGM-040.

Sortie : les lignes de temps proposées, au format de CONTRAT.md section 6, par fichier de temps,
amputées du temps déjà journalisé dans ces fichiers, pour ne jamais compter deux fois.

    python dashboard/scripts/bilan_temps.py --historique <session.jsonl> --depot <chemin> \\
        --agent EGM=egm-dev --agent OPS=ops-dashboard [--depuis …] [--jusqua …] [--pause 20] \\
        [--marque-commit <texte>] [--ecrire]

Codes de sortie : 0 succès, 1 donnée illisible, 2 usage.
"""
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

PARIS = ZoneInfo("Europe/Paris")
RE_ITEM = re.compile(r"^([A-Z][A-Z0-9]*-\d{3,})\s*:")
TYPES_ACTIFS = {"user", "assistant"}


class ErreurDonnees(Exception):
    """Historique ou dépôt illisible : code de sortie 1."""


@dataclasses.dataclass(frozen=True)
class Commit:
    quand: dt.datetime
    item: str
    depot: Path


@dataclasses.dataclass
class Segment:
    debut: dt.datetime
    fin: dt.datetime
    item: str | None
    depot: Path | None


# ---------------------------------------------------------------------------
# Lecture

def lire_horodatages(chemin: Path) -> list[dt.datetime]:
    """Horodatages d'activité : messages de Théo et de l'agent, appels d'outils compris.

    Accepte l'historique JSONL de Claude Code (une ligne par évènement, champs `type` et `timestamp`)
    ou un fichier JSON contenant une liste d'horodatages ISO 8601.
    """
    try:
        texte = chemin.read_text(encoding="utf-8")
    except OSError as erreur:
        raise ErreurDonnees(f"{chemin} : {erreur}") from erreur
    horodatages: list[dt.datetime] = []
    debut = texte.lstrip()[:1]
    if debut == "[":
        try:
            valeurs = json.loads(texte)
        except json.JSONDecodeError as erreur:
            raise ErreurDonnees(f"{chemin} : JSON invalide, {erreur}") from erreur
        horodatages = [instant(v) for v in valeurs if isinstance(v, str)]
    else:
        for ligne in texte.splitlines():
            try:
                evenement = json.loads(ligne)
            except json.JSONDecodeError:
                continue
            if isinstance(evenement, dict) and evenement.get("type") in TYPES_ACTIFS and evenement.get("timestamp"):
                horodatages.append(instant(evenement["timestamp"]))
    if not horodatages:
        raise ErreurDonnees(f"{chemin} : aucun horodatage d'activité")
    return sorted(horodatages)


def instant(texte: str) -> dt.datetime:
    """Horodatage ISO 8601 ; sans fuseau, il est lu à l'heure de Paris."""
    valeur = dt.datetime.fromisoformat(texte.replace("Z", "+00:00"))
    return valeur if valeur.tzinfo else valeur.replace(tzinfo=PARIS)


def lire_commits(depot: Path, depuis: dt.datetime, jusqua: dt.datetime, marque: str | None) -> list[Commit]:
    """Commits de toutes les branches du dépôt entre deux instants, dont le message commence par un id d'item.

    `marque` : texte que le message doit contenir, la ligne Claude-Session de la session par exemple,
    pour ne pas compter les commits d'une autre session parallèle.
    """
    commande = [
        "git", "-C", str(depot), "log", "--all", "--no-merges",
        f"--since={depuis.isoformat()}", f"--until={jusqua.isoformat()}",
        "--format=%H%x1f%cI%x1f%s%x1f%b%x1e",
    ]
    try:
        sortie = subprocess.run(commande, capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as erreur:
        raise ErreurDonnees(f"{depot} : lecture des commits impossible") from erreur
    commits: dict[str, Commit] = {}
    for bloc in sortie.split("\x1e"):
        champs = bloc.strip("\n").split("\x1f")
        if len(champs) < 4:
            continue
        empreinte, date, sujet, corps = champs[0], champs[1], champs[2], champs[3]
        trouve = RE_ITEM.match(sujet)
        if not trouve or (marque and marque not in sujet + "\n" + corps):
            continue
        commits.setdefault(empreinte, Commit(instant(date), trouve.group(1), depot))
    return sorted(commits.values(), key=lambda c: c.quand)


# ---------------------------------------------------------------------------
# Calcul

def periodes_actives(horodatages: list[dt.datetime], pause: dt.timedelta) -> list[tuple[dt.datetime, dt.datetime]]:
    """Regroupe les horodatages en périodes ; un écart supérieur à `pause` ouvre une nouvelle période."""
    periodes: list[tuple[dt.datetime, dt.datetime]] = []
    debut = precedent = horodatages[0]
    for moment in horodatages[1:]:
        if moment - precedent > pause:
            periodes.append((debut, precedent))
            debut = moment
        precedent = moment
    periodes.append((debut, precedent))
    return [(d, f) for d, f in periodes if f > d]


def repartir(periodes: list[tuple[dt.datetime, dt.datetime]], commits: list[Commit]) -> list[Segment]:
    """Découpe chaque période aux commits : le temps avant un commit revient à son item.

    Le temps d'une période qui suit son dernier commit, vérifications et mise en ligne le plus souvent,
    revient à l'item de ce dernier commit ; une période sans aucun commit revient au premier commit qui
    la suit dans la session, sinon reste sans item.
    """
    segments: list[Segment] = []
    for debut, fin in periodes:
        dedans = [c for c in commits if debut <= c.quand <= fin]
        curseur = debut
        for commit in dedans:
            if commit.quand > curseur:
                segments.append(Segment(curseur, commit.quand, commit.item, commit.depot))
                curseur = commit.quand
        if fin > curseur:
            if dedans:
                dernier = dedans[-1]
                segments.append(Segment(curseur, fin, dernier.item, dernier.depot))
            else:
                suivant = next((c for c in commits if c.quand > fin), None)
                segments.append(Segment(curseur, fin, suivant.item if suivant else None, suivant.depot if suivant else None))
    # Segments voisins du même item fusionnés : une ligne de temps par séquence de travail.
    fusion: list[Segment] = []
    for segment in segments:
        if fusion and fusion[-1].item == segment.item and fusion[-1].depot == segment.depot and fusion[-1].fin == segment.debut:
            fusion[-1].fin = segment.fin
        else:
            fusion.append(segment)
    return fusion


def minutes_entre(debut: str, fin: str) -> int:
    """Minutes de `fin` moins `debut`, HH:MM ; une fin plus petite passe minuit (CONTRAT.md section 6)."""
    h1, m1 = map(int, debut.split(":"))
    h2, m2 = map(int, fin.split(":"))
    ecart = (h2 * 60 + m2) - (h1 * 60 + m1)
    return ecart + 24 * 60 if ecart < 0 else ecart


def lignes_de_temps(segments: list[Segment], agents: dict[str, str], session: str) -> tuple[list[tuple[dict, Path]], list[str]]:
    """Lignes au format du contrat, à la minute, heure de Paris, chacune avec son dépôt. Renvoie aussi les avertissements."""
    lignes: list[tuple[dict, Path]] = []
    avertissements: list[str] = []
    for s in segments:
        debut, fin = s.debut.astimezone(PARIS), s.fin.astimezone(PARIS)
        hd, hf = debut.strftime("%H:%M"), fin.strftime("%H:%M")
        minutes = minutes_entre(hd, hf)
        if minutes < 1:
            continue
        prefixe = s.item.split("-")[0] if s.item else None
        agent = agents.get(prefixe) if prefixe else None
        if not agent:
            avertissements.append(f"{debut:%d/%m %H:%M}-{hf}, {minutes} min : {'sans item' if not s.item else f'préfixe {prefixe} sans agent'}, à attribuer à la main")
            continue
        lignes.append(({
            "date": debut.strftime("%Y-%m-%d"), "debut": hd, "fin": hf, "minutes": minutes, "item": s.item,
            "source": "claude-code", "agent": agent, "note": f"Mesuré sur l'historique de session {session}", "valide": False,
        }, s.depot))
    return lignes, avertissements


# ---------------------------------------------------------------------------
# Fichiers de temps

def fichier_de_temps(depot: Path, ligne: dict) -> Path:
    """projet/temps/AAAA-MM-<agent>.jsonl du dépôt, mois de la date de début."""
    return depot / "projet" / "temps" / f"{ligne['date'][:7]}-{ligne['agent']}.jsonl"


def intervalle(ligne: dict) -> tuple[dt.datetime, dt.datetime]:
    debut = dt.datetime.fromisoformat(f"{ligne['date']}T{ligne['debut']}")
    return debut, debut + dt.timedelta(minutes=ligne["minutes"])


def deja_journalisees(fichier: Path) -> list[dict]:
    if not fichier.is_file():
        return []
    lignes = []
    for texte in fichier.read_text(encoding="utf-8").splitlines():
        try:
            lignes.append(json.loads(texte))
        except json.JSONDecodeError:
            continue
    return lignes


def intervalles_libres(ligne: dict, existantes: list[dict]) -> tuple[list[tuple[dt.datetime, dt.datetime]], list[dict]]:
    """Parties de la ligne que ne couvre aucune ligne existante, et les lignes existantes qui la recouvrent."""
    libres = [intervalle(ligne)]
    recouvrantes = []
    for autre in existantes:
        if not all(k in autre for k in ("date", "debut", "minutes")):
            continue
        d2, f2 = intervalle(autre)
        if not any(d < f2 and d2 < f for d, f in libres):
            continue
        recouvrantes.append(autre)
        reste = []
        for d, f in libres:
            if d < d2:
                reste.append((d, min(f, d2)))
            if f > f2:
                reste.append((max(d, f2), f))
        libres = [(d, f) for d, f in reste if f > d]
    return libres, recouvrantes


def bilan(historiques: list[Path], depots: list[Path], agents: dict[str, str], depuis: dt.datetime | None,
          jusqua: dt.datetime | None, pause: dt.timedelta, marque: str | None) -> dict:
    horodatages = sorted(h for chemin in historiques for h in lire_horodatages(chemin))
    if depuis:
        horodatages = [h for h in horodatages if h >= depuis]
    if jusqua:
        horodatages = [h for h in horodatages if h <= jusqua]
    if len(horodatages) < 2:
        raise ErreurDonnees("moins de deux horodatages dans la période demandée")
    periodes = periodes_actives(horodatages, pause)
    marge = dt.timedelta(minutes=1)
    commits = sorted((c for depot in depots for c in lire_commits(depot, horodatages[0] - marge, horodatages[-1] + marge, marque)), key=lambda c: c.quand)
    session = historiques[0].stem[:8]
    lignes, avertissements = lignes_de_temps(repartir(periodes, commits), agents, session)
    # Une session ne travaille qu'à une chose à la fois : le temps déjà journalisé dans l'un des
    # fichiers de temps visés, quel qu'en soit l'item ou l'agent, n'est jamais repris.
    cibles = sorted({fichier_de_temps(depot, ligne) for ligne, depot in lignes})
    existantes = [l for fichier in cibles for l in deja_journalisees(fichier)]
    par_fichier: dict[str, dict] = {str(f): {"nouvelles": [], "deja": []} for f in cibles}
    for ligne, depot in lignes:
        entree = par_fichier[str(fichier_de_temps(depot, ligne))]
        libres, recouvrantes = intervalles_libres(ligne, existantes)
        if recouvrantes:
            entree["deja"].append({"proposee": ligne, "existantes": recouvrantes})
        for debut, fin in libres:
            hd, hf = debut.strftime("%H:%M"), fin.strftime("%H:%M")
            minutes = minutes_entre(hd, hf)
            if minutes >= 1:
                entree["nouvelles"].append({**ligne, "date": debut.strftime("%Y-%m-%d"), "debut": hd, "fin": hf, "minutes": minutes})
    return {
        "periode": {"debut": horodatages[0].astimezone(PARIS).isoformat(timespec="minutes"), "fin": horodatages[-1].astimezone(PARIS).isoformat(timespec="minutes")},
        "actif_minutes": sum(round((f - d).total_seconds() / 60) for d, f in periodes),
        "periodes": len(periodes),
        "commits": [{"quand": c.quand.astimezone(PARIS).isoformat(timespec="minutes"), "item": c.item, "depot": str(c.depot)} for c in commits],
        "fichiers": par_fichier,
        "avertissements": avertissements,
    }


def ecrire(resultat: dict) -> int:
    """Ajoute les lignes nouvelles en fin de chaque fichier de temps ; renvoie leur nombre."""
    total = 0
    for chemin, entree in resultat["fichiers"].items():
        if not entree["nouvelles"]:
            continue
        fichier = Path(chemin)
        fichier.parent.mkdir(parents=True, exist_ok=True)
        existant = fichier.read_text(encoding="utf-8") if fichier.is_file() else ""
        prefixe = "" if not existant or existant.endswith("\n") else "\n"
        with fichier.open("a", encoding="utf-8") as sortie:
            sortie.write(prefixe + "".join(json.dumps(l, ensure_ascii=False, separators=(",", ":")) + "\n" for l in entree["nouvelles"]))
        total += len(entree["nouvelles"])
    return total


# ---------------------------------------------------------------------------
# Ligne de commande

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Temps passé mesuré sur l'historique d'une session, par item.")
    parser.add_argument("--historique", action="append", required=True, type=Path, help="historique de session JSONL, ou liste JSON d'horodatages ; répétable")
    parser.add_argument("--depot", action="append", required=True, type=Path, help="dépôt dont les commits répartissent le temps ; répétable")
    parser.add_argument("--agent", action="append", default=[], help="PREFIXE=agent, ex. EGM=egm-dev ; répétable")
    parser.add_argument("--depuis", help="début de la période, ISO 8601, heure de Paris par défaut")
    parser.add_argument("--jusqua", help="fin de la période, ISO 8601")
    parser.add_argument("--pause", type=int, default=20, help="minutes sans activité au-delà desquelles une période s'arrête, 20 par défaut")
    parser.add_argument("--marque-commit", help="texte que les commits doivent contenir, la ligne Claude-Session par exemple")
    parser.add_argument("--ecrire", action="store_true", help="ajoute les lignes nouvelles aux fichiers de temps ; sans lui, proposition seulement")
    try:
        args = parser.parse_args(argv)
    except SystemExit as sortie:
        return 2 if sortie.code else 0
    agents: dict[str, str] = {}
    for valeur in args.agent:
        if "=" not in valeur:
            print(f"--agent {valeur} : attendu PREFIXE=agent", file=sys.stderr)
            return 2
        prefixe, agent = valeur.split("=", 1)
        agents[prefixe.strip()] = agent.strip()
    if args.pause < 1:
        print("--pause : au moins 1 minute", file=sys.stderr)
        return 2
    try:
        resultat = bilan(args.historique, args.depot, agents, instant(args.depuis) if args.depuis else None,
                         instant(args.jusqua) if args.jusqua else None, dt.timedelta(minutes=args.pause), args.marque_commit)
    except (ErreurDonnees, ValueError) as erreur:
        print(f"Erreur : {erreur}", file=sys.stderr)
        return 1
    if args.ecrire:
        resultat["ecrites"] = ecrire(resultat)
    print(json.dumps(resultat, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
