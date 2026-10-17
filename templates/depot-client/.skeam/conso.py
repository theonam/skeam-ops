#!/usr/bin/env python3
"""Relevé automatique du temps et de la consommation des agents Claude Code d'une session.

Copié tel quel de templates/depot-client/.skeam/conso.py de skeam-ops dans chaque dépôt client.
Format du fichier écrit : CONTRAT.md section 15 de skeam-ops. Mode d'emploi : .skeam/README.md.

Pour la conversation principale et chaque agent de la session, sous-agents et agents de workflow
compris, une ligne de .skeam/conso/AAAA-MM-JJ-<session>.jsonl donne le début, la fin, les périodes
actives, les minutes actives, le nombre de réponses du modèle, les jetons par modèle et les items
travaillés. Le fichier ne contient jamais de contenu de conversation, de chemin, de nom de branche,
de secret, de donnée personnelle ni de coût.

    python3 .skeam/conso.py pre-commit      appelé par .skeam/githooks/pre-commit ; sort toujours en 0, muet
    python3 .skeam/conso.py capturer [--session SID] [--session-distante session_X]
                                     [--config-claude DIR] [--depot DIR] [--sans-ajout]
    python3 .skeam/conso.py installer [--silencieux]
    python3 .skeam/conso.py verifier

Python 3.9 ou plus, bibliothèque standard seulement.
"""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

VERSION = 1
PAUSE = dt.timedelta(minutes=15)
SEUIL_LONG_PROMPT = 100_000
BUDGET_SECONDES = 20.0
MAX_COMMITS = 50
CHEMIN_HOOKS = ".skeam/githooks"
GITATTRIBUTES = ".skeam/conso/*.jsonl merge=union linguist-generated=true"
RE_SESSION = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
RE_FICHIER = re.compile(r"^(?P<date>[0-9]{4}-[0-9]{2}-[0-9]{2})-(?P<session>[A-Za-z0-9_-]{8,64})\.jsonl$")
RE_ID = re.compile(r"(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,11}-[0-9]{3})(?![0-9])")
RE_SUJET = re.compile(r"^([A-Z][A-Z0-9]{1,11}-[0-9]{3})\s*:")
RE_MODELE = re.compile(r"^[a-z0-9][a-z0-9.-]{2,63}$")
RE_AGENT = re.compile(r"^[a-z0-9]{6,40}$")
RE_RUN = re.compile(r"^[A-Za-z0-9_-]{3,64}$")
# Commandes Git qui créent un commit : le commit revient à l'agent qui les a lancées.
RE_GIT_COMMIT = re.compile(r"\bgit(?:\s+-[Cc]\s+\S+|\s+--\S+)*\s+(?:commit|cherry-pick|merge|rebase|am|revert)\b")
RE_CHEMIN = re.compile(r"(?<![\w.])(?:~|[A-Za-z]:)?[/\\][^\s,;]*")
RE_COURRIEL = re.compile(r"\S+@\S+\.\S+")
# Jetons d'accès : préfixes connus, ou suite de 24 caractères ou plus mêlant lettres et chiffres.
RE_JETON = re.compile(r"\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs]|AKIA|AIza)[-_A-Za-z0-9]{8,}|\b(?=[-_A-Za-z0-9]*[0-9])(?=[-_A-Za-z0-9]*[A-Za-z])[-_A-Za-z0-9]{24,}\b")
CLES_JETONS = ("entree", "sortie", "lecture_cache", "ecriture_cache")
CLES_COMPTEURS = CLES_JETONS + ("ecriture_cache_1h", "recherches_web")
ORDRE_CLES = ("version", "session", "session_distante", "agent_id", "type", "run", "phase", "libelle", "debut", "fin",
              "periodes", "minutes_actives", "messages", "modeles", "items", "lien", "commits", "releve_le")

try:
    from zoneinfo import ZoneInfo

    PARIS = ZoneInfo("Europe/Paris")
except Exception:  # tzdata absent : heure UTC, décalage +00:00, toujours valide au contrat.
    PARIS = dt.timezone.utc


# ---------------------------------------------------------------------------
# Outils


def instant(texte: str) -> dt.datetime | None:
    """Horodatage ISO 8601 des historiques, tronqué à la seconde, en heure de Paris."""
    try:
        valeur = dt.datetime.fromisoformat(texte.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    if valeur.tzinfo is None:
        valeur = valeur.replace(tzinfo=dt.timezone.utc)
    return valeur.replace(microsecond=0).astimezone(PARIS)


def iso(valeur: dt.datetime) -> str:
    return valeur.astimezone(PARIS).replace(microsecond=0).isoformat()


def maintenant() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).astimezone(PARIS)


def git(depot: Path | str, *args: str, entree: str | None = None) -> str | None:
    try:
        sortie = subprocess.run(["git", "-C", str(depot), *args], capture_output=True, text=True,
                                input=entree, timeout=15, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    return sortie.stdout if sortie.returncode == 0 else None


_RACINES: dict[str, Path | None] = {}
_COMMUNS: dict[str, Path | None] = {}


def racine_depot(chemin: Path | str) -> Path | None:
    cle = str(chemin)
    if cle not in _RACINES:
        sortie = git(chemin, "rev-parse", "--show-toplevel") if Path(chemin).is_dir() else None
        _RACINES[cle] = Path(sortie.strip()) if sortie and sortie.strip() else None
    return _RACINES[cle]


def repertoire_commun(chemin: Path | str) -> Path | None:
    """Dossier Git commun d'un dépôt, le même pour tous ses worktrees."""
    cle = str(chemin)
    if cle not in _COMMUNS:
        sortie = git(chemin, "rev-parse", "--path-format=absolute", "--git-common-dir") if Path(chemin).is_dir() else None
        _COMMUNS[cle] = Path(sortie.strip()).resolve() if sortie and sortie.strip() else None
    return _COMMUNS[cle]


def nettoyer(texte, longueur: int) -> str | None:
    """Libellé sans caractère de contrôle, sans chemin ni courriel, espaces réduits, longueur plafonnée."""
    if not isinstance(texte, str):
        return None
    texte = "".join(c if c.isprintable() else " " for c in texte)
    texte = RE_COURRIEL.sub("…", texte)
    texte = RE_JETON.sub("…", texte)
    texte = RE_CHEMIN.sub("…", texte)
    texte = " ".join(texte.split())
    if len(texte) > longueur:
        texte = texte[: longueur - 1].rstrip() + "…"
    return texte or None


def ids_du_texte(texte: str | None) -> list[str]:
    vus: list[str] = []
    for ident in RE_ID.findall(texte or ""):
        if ident not in vus:
            vus.append(ident)
    return vus


def parts(poids: dict[str, float]) -> list[dict]:
    """Parts de somme 1 à 4 décimales, la dernière ajustée ; ids par part décroissante puis par nom."""
    poids = {k: v for k, v in poids.items() if v > 0}
    total = sum(poids.values())
    if not total:
        return []
    ordre = sorted(poids, key=lambda k: (-poids[k], k))
    arrondies = [(k, round(poids[k] / total, 4)) for k in ordre]
    arrondies = [(k, p) for k, p in arrondies if p > 0]
    if not arrondies:
        return []
    reste = float(round(1 - sum(p for _, p in arrondies[:-1]), 4))
    arrondies[-1] = (arrondies[-1][0], reste)
    return [{"id": k, "part": p} for k, p in sorted(arrondies, key=lambda x: x[0]) if p > 0]


# ---------------------------------------------------------------------------
# Lecture des historiques


class Transcripts:
    def __init__(self, principal: Path | None, agents: list[Path], journaux: list[Path]) -> None:
        self.principal = principal
        self.agents = agents
        self.journaux = journaux

    def __bool__(self) -> bool:
        return self.principal is not None or bool(self.agents)


def trouver_transcripts(config: Path, session: str) -> Transcripts:
    projets = Path(config) / "projects"
    principaux = [Path(p) for p in glob.glob(str(projets / "*" / f"{glob.escape(session)}.jsonl"))]
    principal = max(principaux, key=lambda p: p.stat().st_mtime) if principaux else None
    agents: list[Path] = []
    journaux: list[Path] = []
    for dossier in glob.glob(str(projets / "*" / glob.escape(session))):
        agents.extend(Path(p) for p in glob.glob(str(Path(dossier) / "subagents" / "**" / "agent-*.jsonl"), recursive=True))
        journaux.extend(Path(p) for p in glob.glob(str(Path(dossier) / "subagents" / "workflows" / "*" / "journal.jsonl")))
    return Transcripts(principal, sorted(set(agents)), sorted(set(journaux)))


def lire_libelles(journaux: list[Path], metas: list[Path] = ()) -> dict[str, tuple]:
    """agent_id vers (libelle, phase, run) : journal du workflow d'abord, description de l'agent ensuite."""
    resultat: dict[str, tuple] = {}
    for chemin in metas:
        try:
            meta = json.loads(chemin.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(meta, dict):
            continue
        agent = chemin.name[len("agent-"):-len(".meta.json")]
        resultat[agent] = (meta.get("description"), meta.get("workflowPhase"), None)
    for chemin in journaux:
        run = chemin.parent.name
        try:
            lignes = chemin.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for ligne in lignes:
            try:
                objet = json.loads(ligne)
            except ValueError:
                continue
            if isinstance(objet, dict) and objet.get("type") == "started" and isinstance(objet.get("agentId"), str):
                resultat[objet["agentId"]] = (objet.get("label"), objet.get("phase"), run)
    return resultat


class Releve:
    """Activité d'un historique : jamais écrite telle quelle, seuls les compteurs sortent."""

    def __init__(self, agent_id: str | None, type_: str) -> None:
        self.agent_id = agent_id
        self.type = type_
        self.run: str | None = None
        self.phase: str | None = None
        self.libelle: str | None = None
        self.horodatages: list[dt.datetime] = []
        self.cwds: Counter = Counter()
        self.reponses: dict[str, tuple[str, dict]] = {}
        self.commandes_commit: list[dt.datetime] = []
        # Rempli par lier().
        self.items: list[dict] = []
        self.lien = "aucun"
        self.commits: list[str] = []

    @property
    def debut(self) -> dt.datetime:
        return self.horodatages[0]

    @property
    def fin(self) -> dt.datetime:
        return self.horodatages[-1]

    def ids_libelle(self) -> list[str]:
        return ids_du_texte(self.libelle) if self.type != "principal" else []

    def actif_a(self, t: dt.datetime) -> bool:
        return self.debut - dt.timedelta(minutes=1) <= t <= self.fin + dt.timedelta(minutes=2)


def compteurs_usage(usage: dict) -> dict:
    def entier(v) -> int:
        return v if isinstance(v, int) and not isinstance(v, bool) and v > 0 else 0

    creation = usage.get("cache_creation") if isinstance(usage.get("cache_creation"), dict) else {}
    serveur = usage.get("server_tool_use") if isinstance(usage.get("server_tool_use"), dict) else {}
    return {
        "entree": entier(usage.get("input_tokens")),
        "sortie": entier(usage.get("output_tokens")),
        "lecture_cache": entier(usage.get("cache_read_input_tokens")),
        "ecriture_cache": entier(usage.get("cache_creation_input_tokens")),
        "ecriture_cache_1h": entier(creation.get("ephemeral_1h_input_tokens")),
        "recherches_web": entier(serveur.get("web_search_requests")),
    }


def lire_transcript(chemin: Path, agent_id: str | None = None, type_: str = "principal") -> Releve | None:
    """Une passe sur l'historique ; None s'il est illisible ou sans aucune réponse du modèle."""
    releve = Releve(agent_id, type_)
    try:
        fichier = open(chemin, encoding="utf-8", errors="replace")
    except OSError:
        return None
    with fichier:
        for numero, ligne in enumerate(fichier):
            if '"timestamp"' not in ligne:
                continue
            try:
                objet = json.loads(ligne)
            except ValueError:
                continue  # dernière ligne tronquée, ligne corrompue
            if not isinstance(objet, dict) or objet.get("type") not in ("user", "assistant"):
                continue
            quand = instant(objet.get("timestamp")) if isinstance(objet.get("timestamp"), str) else None
            if quand is None:
                continue
            releve.horodatages.append(quand)
            if isinstance(objet.get("cwd"), str):
                releve.cwds[objet["cwd"]] += 1
            if objet["type"] != "assistant":
                continue
            message = objet.get("message") if isinstance(objet.get("message"), dict) else {}
            contenu = message.get("content")
            if isinstance(contenu, list):
                for bloc in contenu:
                    if (isinstance(bloc, dict) and bloc.get("type") == "tool_use" and bloc.get("name") == "Bash"
                            and isinstance(bloc.get("input"), dict) and RE_GIT_COMMIT.search(str(bloc["input"].get("command") or ""))):
                        releve.commandes_commit.append(quand)
            modele = message.get("model")
            usage = message.get("usage")
            if (not isinstance(modele, str) or not RE_MODELE.match(modele) or objet.get("isApiErrorMessage")
                    or not isinstance(usage, dict)):
                continue
            cle = message.get("id") or objet.get("requestId") or objet.get("uuid") or f"ligne-{numero}"
            nouveaux = compteurs_usage(usage)
            if cle in releve.reponses:
                ancien_modele, anciens = releve.reponses[cle]
                nouveaux = {k: max(anciens[k], nouveaux[k]) for k in CLES_COMPTEURS}
            releve.reponses[cle] = (modele, nouveaux)
    if not releve.reponses or not releve.horodatages:
        return None
    releve.horodatages.sort()
    releve.commandes_commit.sort()
    return releve


def periodes_actives(horodatages: list[dt.datetime], pause: dt.timedelta = PAUSE) -> list[tuple[dt.datetime, dt.datetime]]:
    """Périodes d'activité : un silence de plus de `pause` clôt une période ; les périodes de durée nulle sont écartées."""
    resultat = []
    if not horodatages:
        return resultat
    tries = sorted(horodatages)
    debut = precedent = tries[0]
    for t in tries[1:]:
        if t - precedent > pause:
            resultat.append((debut, precedent))
            debut = t
        precedent = t
    resultat.append((debut, precedent))
    return [(a, b) for a, b in resultat if b > a]


def minutes(periodes) -> float:
    return round(sum((b - a).total_seconds() for a, b in periodes) / 60, 1)


def modeles(releve: Releve) -> dict:
    resultat: dict[str, dict] = {}
    for modele, compteurs in releve.reponses.values():
        cumul = resultat.setdefault(modele, {k: 0 for k in CLES_COMPTEURS})
        for k in CLES_COMPTEURS:
            cumul[k] += compteurs[k]
        prompt = compteurs["entree"] + compteurs["lecture_cache"] + compteurs["ecriture_cache"]
        if prompt > SEUIL_LONG_PROMPT:
            long = cumul.setdefault("au_dela_100k", {k: 0 for k in CLES_JETONS})
            for k in CLES_JETONS:
                long[k] += compteurs[k]
    for cumul in resultat.values():
        cumul["ecriture_cache_1h"] = min(cumul["ecriture_cache_1h"], cumul["ecriture_cache"])
    return {k: resultat[k] for k in sorted(resultat)}


def lire_session(transcripts: Transcripts) -> list[Releve]:
    metas = [p.with_name(p.name[: -len(".jsonl")] + ".meta.json") for p in transcripts.agents]
    libelles = lire_libelles(transcripts.journaux, [m for m in metas if m.is_file()])
    releves: list[Releve] = []
    if transcripts.principal is not None:
        releve = lire_transcript(transcripts.principal)
        if releve:
            releves.append(releve)
    for chemin in transcripts.agents:
        brut = chemin.name[len("agent-"):-len(".jsonl")]
        agent = re.sub(r"[^a-z0-9]", "", brut.lower())[:40]
        if not RE_AGENT.match(agent):
            continue
        type_ = "workflow" if "workflows" in chemin.parts else "sous_agent"
        releve = lire_transcript(chemin, agent, type_)
        if releve is None:
            continue
        libelle, phase, run = libelles.get(brut, (None, None, None))
        if run is None and type_ == "workflow":
            run = chemin.parent.name
        releve.libelle = nettoyer(libelle, 80)
        releve.phase = nettoyer(phase, 40)
        releve.run = run if isinstance(run, str) and RE_RUN.match(run) else None
        releves.append(releve)
    return releves


# ---------------------------------------------------------------------------
# Commits et rattachement aux items


class Commit:
    def __init__(self, empreinte: str, quand: dt.datetime, item: str) -> None:
        self.empreinte = empreinte
        self.quand = quand
        self.item = item


def lire_commits(depots: list[Path], debut: dt.datetime, fin: dt.datetime, marque: str | None) -> list[Commit]:
    """Commits de toutes les branches dont le sujet commence par un id d'item, datés à l'auteur.

    La date d'auteur survit au rebase et au cherry-pick ; un même sujet à la même date d'auteur
    est une copie réécrite et ne compte qu'une fois. `marque` : session_… de la ligne Claude-Session.
    """
    depuis = (debut - dt.timedelta(minutes=2)).isoformat()
    jusqua = (fin + dt.timedelta(minutes=2)).isoformat()
    vus: dict[tuple, Commit] = {}
    for depot in depots:
        sortie = git(depot, "log", "--all", "--no-merges", f"--since={depuis}", f"--until={jusqua}",
                     "--format=%H%x1f%aI%x1f%s%x1f%(trailers:key=Claude-Session,valueonly,separator=%x2c)%x1e")
        if not sortie:
            continue
        for bloc in sortie.split("\x1e"):
            champs = bloc.strip("\n").split("\x1f")
            if len(champs) < 4:
                continue
            empreinte, date, sujet, remorque = champs[0].strip(), champs[1], champs[2], champs[3]
            trouve = RE_SUJET.match(sujet)
            quand = instant(date)
            if not trouve or quand is None or not (debut - dt.timedelta(minutes=2) <= quand <= fin + dt.timedelta(minutes=2)):
                continue
            if marque and marque not in remorque:
                continue
            cle = (sujet, quand)
            if cle not in vus or empreinte < vus[cle].empreinte:
                vus[cle] = Commit(empreinte, quand, trouve.group(1))
    return sorted(vus.values(), key=lambda c: (c.quand, c.empreinte))


def depots_de_la_session(releves: list[Releve], depot_courant: Path) -> list[Path]:
    """Le dépôt courant et les autres dépôts où la session a travaillé, d'après les cwd ; en mémoire seulement."""
    depots: list[Path] = []
    communs: set = set()
    candidats = [depot_courant] + [Path(c) for r in releves for c, _ in r.cwds.most_common()]
    for chemin in candidats:
        if not chemin.is_dir():
            continue
        commun = repertoire_commun(chemin)
        if commun is None or commun in communs:
            continue
        communs.add(commun)
        depots.append(chemin)
    return depots


def lier(releves: list[Releve], commits: list[Commit]) -> None:
    """Items de chaque relevé : libellé, sinon commits de son activité, sinon répartition de la session."""
    principal = next((r for r in releves if r.type == "principal"), None)
    attribues: dict[int, list[tuple[Commit, float]]] = {id(r): [] for r in releves}
    for commit in commits:
        t = commit.quand
        # 1. L'agent qui a lancé la commande git juste avant le commit.
        auteurs = []
        for r in releves:
            avant = [u for u in r.commandes_commit if u - dt.timedelta(seconds=30) <= t <= u + dt.timedelta(minutes=15)]
            if avant:
                auteurs.append((max(avant), r))
        if auteurs:
            attribues[id(max(auteurs, key=lambda x: x[0])[1])].append((commit, 1.0))
            continue
        # 2. Un agent dont le libellé cite l'item, actif à cette heure : déjà rattaché par son libellé.
        if any(r.type != "principal" and r.actif_a(t) and commit.item in r.ids_libelle() for r in releves):
            continue
        # 3. Les agents sans id dans leur libellé, actifs à cette heure, à parts égales.
        sans_id = [r for r in releves if r.type != "principal" and r.actif_a(t) and not r.ids_libelle()]
        if sans_id:
            for r in sans_id:
                attribues[id(r)].append((commit, 1.0 / len(sans_id)))
            continue
        # 4. Sinon la conversation principale.
        if principal is not None:
            attribues[id(principal)].append((commit, 1.0))

    session: dict[str, float] = {}
    for r in releves:
        r.items, r.lien, r.commits = [], "aucun", []
        ids = r.ids_libelle()
        if ids:
            r.items, r.lien = parts({i: 1.0 for i in ids}), "libelle"
        elif attribues[id(r)]:
            poids: dict[str, float] = {}
            for commit, poids_commit in attribues[id(r)]:
                poids[commit.item] = poids.get(commit.item, 0) + poids_commit
            r.items, r.lien = parts(poids), "commits"
            r.commits = [c.empreinte[:7] for c, _ in sorted(attribues[id(r)], key=lambda x: x[0].quand)][:MAX_COMMITS]
        if r.items:
            duree = minutes(periodes_actives(r.horodatages)) or 0.1
            for item in r.items:
                session[item["id"]] = session.get(item["id"], 0) + duree * item["part"]
    repartition = parts(session)
    for r in releves:
        if not r.items and repartition:
            r.items, r.lien = [dict(i) for i in repartition], "session"


def garder_pour_ce_depot(releves: list[Releve], prefixe: str, commun_courant: Path | None) -> list[Releve]:
    """Lignes de ce dépôt : un item de son préfixe, ou aucun item et une activité dans ce dépôt ou hors de tout dépôt."""
    gardes = []
    for r in releves:
        if any(i["id"].split("-")[0] == prefixe for i in r.items):
            gardes.append(r)
            continue
        if r.items:
            continue
        cwd = r.cwds.most_common(1)[0][0] if r.cwds else None
        commun = repertoire_commun(cwd) if cwd and Path(cwd).is_dir() else None
        if commun is None or commun == commun_courant:
            gardes.append(r)
    return gardes


# ---------------------------------------------------------------------------
# Lignes du fichier et fusion


def ligne(releve: Releve, session: str, session_distante: str | None, horodatage: dt.datetime) -> dict:
    periodes = periodes_actives(releve.horodatages)
    valeurs = {
        "version": VERSION,
        "session": session,
        "session_distante": session_distante,
        "agent_id": releve.agent_id,
        "type": releve.type,
        "run": releve.run,
        "phase": releve.phase,
        "libelle": releve.libelle,
        "debut": iso(releve.debut),
        "fin": iso(releve.fin),
        "periodes": [[iso(a), iso(b)] for a, b in periodes],
        "minutes_actives": minutes(periodes),
        "messages": len(releve.reponses),
        "modeles": modeles(releve),
        "items": releve.items,
        "lien": releve.lien,
        "commits": releve.commits,
        "releve_le": iso(horodatage),
    }
    return {k: valeurs[k] for k in ORDRE_CLES}


def cle(ligne_: dict) -> tuple:
    return (ligne_.get("session"), ligne_.get("agent_id") or "", ligne_.get("debut"))


def tri(ligne_: dict) -> tuple:
    return (ligne_.get("debut") or "", ligne_.get("agent_id") is not None, ligne_.get("agent_id") or "")


def lire_lignes(fichier: Path) -> list[dict]:
    try:
        texte = fichier.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []
    lignes = []
    for brute in texte.splitlines():
        try:
            objet = json.loads(brute)
        except ValueError:
            continue
        if isinstance(objet, dict) and isinstance(objet.get("debut"), str):
            lignes.append(objet)
    return lignes


def fusionner(existantes: list[dict], nouvelles: list[dict], horodatage: dt.datetime) -> list[dict]:
    """Réécriture idempotente : une ligne ne perd jamais de messages, une ligne qu'on ne peut plus recalculer est gardée."""
    par_cle: dict[tuple, dict] = {}
    for ancienne in existantes:  # doublons d'une fusion union : la plus riche, puis la plus récente
        k = cle(ancienne)
        actuelle = par_cle.get(k)
        if actuelle is None or (ancienne.get("messages", 0), ancienne.get("releve_le", "")) > (actuelle.get("messages", 0), actuelle.get("releve_le", "")):
            par_cle[k] = ancienne
    for nouvelle in nouvelles:
        k = cle(nouvelle)
        ancienne = par_cle.get(k)
        if ancienne is None:
            nouvelle["releve_le"] = iso(horodatage)
            par_cle[k] = nouvelle
            continue
        if nouvelle["messages"] < ancienne.get("messages", 0):
            continue  # historique partiel après une restauration : la ligne déjà écrite fait foi
        sans_date = {c: v for c, v in nouvelle.items() if c != "releve_le"}
        if sans_date == {c: v for c, v in ancienne.items() if c != "releve_le"} and isinstance(ancienne.get("releve_le"), str):
            nouvelle["releve_le"] = ancienne["releve_le"]
        else:
            nouvelle["releve_le"] = iso(horodatage)
        par_cle[k] = nouvelle
    return sorted(par_cle.values(), key=tri)


def serialiser(lignes: list[dict]) -> str:
    return "".join(json.dumps(l, ensure_ascii=False, separators=(",", ":")) + "\n" for l in lignes)


def ecrire_si_change(fichier: Path, lignes: list[dict]) -> bool:
    texte = serialiser(lignes)
    try:
        if fichier.read_text(encoding="utf-8") == texte:
            return False
    except (OSError, UnicodeDecodeError):
        pass
    fichier.parent.mkdir(parents=True, exist_ok=True)
    provisoire = fichier.with_name(fichier.name + ".tmp")
    provisoire.write_text(texte, encoding="utf-8")
    os.replace(provisoire, fichier)
    return True


def fichier_de_session(depot: Path, session: str, releves: list[Releve]) -> Path:
    """Le fichier déjà ouvert pour cette session s'il existe, sinon celui du début le plus ancien, date de Paris."""
    dossier = depot / ".skeam" / "conso"
    existants = sorted(p for p in dossier.glob(f"*-{glob.escape(session)}.jsonl") if (m := RE_FICHIER.match(p.name)) and m.group("session") == session)
    if existants:
        return existants[0]
    debut = min(r.debut for r in releves)
    return dossier / f"{debut.astimezone(PARIS).date().isoformat()}-{session}.jsonl"


def lire_config(depot: Path) -> dict | None:
    try:
        config = json.loads((depot / ".skeam" / "conso.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(config, dict) or not isinstance(config.get("prefixe"), str) or not re.match(r"^[A-Z][A-Z0-9]{1,11}$", config["prefixe"]):
        return None
    return config


# ---------------------------------------------------------------------------
# Commandes


def session_distante_de_env() -> str | None:
    brut = os.environ.get("CLAUDE_CODE_REMOTE_SESSION_ID") or ""
    valeur = brut[len("cse_"):] if brut.startswith("cse_") else brut
    valeur = valeur[len("session_"):] if valeur.startswith("session_") else valeur
    return f"session_{valeur}" if re.match(r"^[A-Za-z0-9]{8,64}$", valeur) else None


def config_claude_par_defaut() -> Path:
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")


class Resultat:
    def __init__(self) -> None:
        self.fichier: Path | None = None
        self.ecrit = False
        self.lignes: list[dict] = []
        self.raison = ""


def capturer(session: str, session_distante: str | None, config: Path, depot: Path, debut_chrono: float | None = None) -> Resultat:
    """Relit toute la session, rattache, filtre pour ce dépôt et réécrit son fichier si le contenu change."""
    resultat = Resultat()
    debut_chrono = debut_chrono if debut_chrono is not None else time.monotonic()
    if not RE_SESSION.match(session or ""):
        resultat.raison = "identifiant de session absent ou invalide"
        return resultat
    reglages = lire_config(depot)
    if reglages is None:
        resultat.raison = ".skeam/conso.json absent ou invalide"
        return resultat
    transcripts = trouver_transcripts(config, session)
    if not transcripts:
        resultat.raison = "aucun historique de la session"
        return resultat
    releves = lire_session(transcripts)
    if not releves:
        resultat.raison = "aucune réponse du modèle dans l'historique"
        return resultat
    debut = min(r.debut for r in releves)
    fin = max(r.fin for r in releves)
    commits = lire_commits(depots_de_la_session(releves, depot), debut, fin, session_distante)
    lier(releves, commits)
    gardes = garder_pour_ce_depot(releves, reglages["prefixe"], repertoire_commun(depot))
    if time.monotonic() - debut_chrono > BUDGET_SECONDES:
        resultat.raison = "budget de temps dépassé, rien écrit"
        return resultat
    fichier = fichier_de_session(depot, session, releves)
    horodatage = maintenant()
    nouvelles = [ligne(r, session, session_distante, horodatage) for r in gardes]
    resultat.fichier = fichier
    resultat.lignes = fusionner(lire_lignes(fichier), nouvelles, horodatage)
    if not resultat.lignes:
        resultat.raison = "aucune ligne pour ce dépôt"
        return resultat
    resultat.ecrit = ecrire_si_change(fichier, resultat.lignes)
    return resultat


def operation_en_cours(depot: Path) -> bool:
    """Rebase ou cherry-pick : les commits rejoués ne réécrivent pas le relevé."""
    sortie = git(depot, "rev-parse", "--absolute-git-dir")
    if not sortie:
        return False
    dossier = Path(sortie.strip())
    return any((dossier / nom).exists() for nom in ("rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD"))


def pre_commit() -> int:
    chrono = time.monotonic()
    try:
        session = os.environ.get("CLAUDE_CODE_SESSION_ID")
        if not session:
            return 0  # commit fait hors d'une session Claude Code
        depot = racine_depot(Path.cwd())
        if depot is None or operation_en_cours(depot):
            return 0
        resultat = capturer(session, session_distante_de_env(), config_claude_par_defaut(), depot, chrono)
        if resultat.ecrit and resultat.fichier is not None:
            subprocess.run(["git", "add", "--", str(resultat.fichier.relative_to(depot))], cwd=depot,
                           capture_output=True, timeout=15, check=False)
        elif resultat.fichier is not None and resultat.fichier.is_file():
            # Fichier inchangé mais pas encore suivi, ou modifié à la main : il part avec le commit.
            suivi = git(depot, "diff", "--quiet", "--", str(resultat.fichier.relative_to(depot)))
            nouveau = git(depot, "ls-files", "--error-unmatch", "--", str(resultat.fichier.relative_to(depot)))
            if suivi is None or nouveau is None:
                subprocess.run(["git", "add", "--", str(resultat.fichier.relative_to(depot))], cwd=depot,
                               capture_output=True, timeout=15, check=False)
    except BaseException as exc:  # noqa: BLE001 : le relevé ne bloque jamais un commit
        try:
            print(f"conso.py : relevé ignoré ({type(exc).__name__})", file=sys.stderr)
        except Exception:
            pass
    return 0


def commande_capturer(args) -> int:
    depot = Path(args.depot).resolve() if args.depot else racine_depot(Path.cwd())
    if depot is None:
        print("conso.py : erreur : pas dans un dépôt Git, préciser --depot", file=sys.stderr)
        return 1
    session = args.session or os.environ.get("CLAUDE_CODE_SESSION_ID") or ""
    distante = args.session_distante or session_distante_de_env()
    if distante is not None and not re.match(r"^session_[A-Za-z0-9]{8,64}$", distante):
        print("conso.py : erreur : --session-distante attendue au format session_…", file=sys.stderr)
        return 2
    config = Path(args.config_claude) if args.config_claude else config_claude_par_defaut()
    resultat = capturer(session, distante, config, depot)
    if resultat.fichier is None or not resultat.lignes:
        print(f"conso.py : rien à écrire : {resultat.raison}", file=sys.stderr)
        return 1
    if resultat.ecrit and not args.sans_ajout:
        git(depot, "add", "--", str(resultat.fichier.relative_to(depot)))
    total_messages = sum(l["messages"] for l in resultat.lignes)
    total_minutes = round(sum(l["minutes_actives"] for l in resultat.lignes), 1)
    liens = Counter(l["lien"] for l in resultat.lignes)
    print(f"{resultat.fichier.relative_to(depot)} : {len(resultat.lignes)} lignes, {total_messages} réponses, "
          f"{total_minutes} minutes actives, liens {dict(sorted(liens.items()))}, "
          f"{'écrit' if resultat.ecrit else 'inchangé'}")
    return 0


def depot_du_script() -> Path | None:
    return racine_depot(Path(__file__).resolve().parent)


def crochets_existants(depot: Path) -> list[str]:
    commun = repertoire_commun(depot)
    dossier = commun / "hooks" if commun else None
    if not dossier or not dossier.is_dir():
        return []
    return sorted(p.name for p in dossier.iterdir() if p.is_file() and not p.name.endswith(".sample"))


def installer(silencieux: bool) -> int:
    def dire(texte: str) -> None:
        if not silencieux:
            print(texte)

    try:
        depot = depot_du_script()
        if depot is None:
            dire("conso.py : pas dans un dépôt Git, rien installé")
            return 0
        if (depot / ".skeam" / "conso.py").resolve() != Path(__file__).resolve():
            dire("conso.py : script hors de <dépôt>/.skeam, gabarit par exemple, rien installé")
            return 0
        crochet = depot / CHEMIN_HOOKS / "pre-commit"
        if crochet.is_file() and not os.access(crochet, os.X_OK):
            os.chmod(crochet, crochet.stat().st_mode | 0o111)
        actuel = (git(depot, "config", "--get", "core.hooksPath") or "").strip()
        if actuel == CHEMIN_HOOKS:
            dire("Relevé de consommation déjà actif : core.hooksPath vaut .skeam/githooks")
        elif actuel:
            dire(f"core.hooksPath vaut déjà {actuel} : relevé non activé, ajouter l'appel de .skeam/githooks/pre-commit à ce crochet")
        elif crochets_existants(depot):
            dire("Crochets Git déjà présents dans .git/hooks (" + ", ".join(crochets_existants(depot)) + ") : relevé non activé pour ne pas les désactiver")
        else:
            git(depot, "config", "core.hooksPath", CHEMIN_HOOKS)
            dire("Relevé de consommation activé : core.hooksPath = .skeam/githooks")
    except Exception as exc:  # noqa: BLE001
        dire(f"conso.py : installation ignorée ({type(exc).__name__})")
    return 0


def verifier() -> int:
    depot = racine_depot(Path.cwd()) or depot_du_script()
    if depot is None:
        print("Pas dans un dépôt Git.")
        return 0
    actuel = (git(depot, "config", "--get", "core.hooksPath") or "").strip()
    reglages = lire_config(depot)
    session = os.environ.get("CLAUDE_CODE_SESSION_ID") or ""
    print(f"Crochet : {'actif' if actuel == CHEMIN_HOOKS else 'inactif, lancer python3 .skeam/conso.py installer'}")
    print(f"Préfixe des items : {reglages['prefixe'] if reglages else 'absent, .skeam/conso.json manquant'}")
    if not session:
        print("Session : CLAUDE_CODE_SESSION_ID absent, aucun relevé hors d'une session Claude Code")
        return 0
    transcripts = trouver_transcripts(config_claude_par_defaut(), session)
    print(f"Session : {session}, historique principal {'trouvé' if transcripts.principal else 'absent'}, "
          f"{len(transcripts.agents)} historiques d'agents")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Relevé du temps et de la consommation des agents Claude Code.")
    sous = parser.add_subparsers(dest="commande", required=True)
    sous.add_parser("pre-commit", help="appelé par le crochet Git ; ne bloque jamais")
    capture = sous.add_parser("capturer", help="relevé à la main, rattrapage d'une session")
    capture.add_argument("--session", help="identifiant local de la session ; défaut CLAUDE_CODE_SESSION_ID")
    capture.add_argument("--session-distante", help="session_… de la ligne Claude-Session des commits")
    capture.add_argument("--config-claude", help="dossier de configuration de Claude Code ; défaut ~/.claude")
    capture.add_argument("--depot", help="racine du dépôt ; défaut le dépôt du répertoire courant")
    capture.add_argument("--sans-ajout", action="store_true", help="ne pas passer le fichier à git add")
    install = sous.add_parser("installer", help="active le crochet Git du dépôt")
    install.add_argument("--silencieux", action="store_true")
    sous.add_parser("verifier", help="dit si le relevé est actif")
    if argv is None and len(sys.argv) > 1 and sys.argv[1] == "pre-commit":
        return pre_commit()  # aucun argparse sur le chemin du crochet
    args = parser.parse_args(argv)
    if args.commande == "pre-commit":
        return pre_commit()
    if args.commande == "capturer":
        return commande_capturer(args)
    if args.commande == "installer":
        return installer(args.silencieux)
    return verifier()


if __name__ == "__main__":
    sys.exit(main())
