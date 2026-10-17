"""Consommation des agents pour la vue interne du dashboard, CONTRAT.md section 15.4.

Lit les fichiers .skeam/conso/AAAA-MM-JJ-<session>.jsonl de toutes les branches de chaque clone,
et du répertoire de travail, dédoublonne les lignes, les chiffre au tarif de
dashboard/tarifs-modeles.yaml et les ventile par projet, lot et item d'après les items de chaque
ligne. Importé par agreger.py pour la vue interne seulement ; jamais lu pour les vues commercial et
client.

Une ligne liée par « session » est rattachée par estimation, d'après les autres agents de son run de
workflow : sa part est comptée et aussi montrée à part, marquée estimée.

Deux mesures, jamais mélangées : le temps machine, somme des minutes actives des agents au prorata
de leurs parts, quatre agents pendant une heure font quatre heures ; la durée réelle, réunion de
leurs périodes actives, quatre agents pendant une heure font une heure. La durée réelle ne se donne
qu'au global et par projet, où une ligne compte si sa part dans le projet atteint 0,5 : une ligne
partagée n'a pas de durée propre à chaque item, et l'y compter en entier la gonflerait.

Usage en ligne de commande, pour contrôle :
    python dashboard/scripts/conso.py <racine d'un dépôt> [...] [--tarifs dashboard/tarifs-modeles.yaml]

Python 3.11. Dépendances : requirements.txt.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import contrat  # noqa: E402
import validate  # noqa: E402

TARIFS_MODELES = Path(__file__).resolve().parents[1] / "tarifs-modeles.yaml"
PARIS = ZoneInfo(contrat.FUSEAU)
DOSSIER = ".skeam/conso"
CLES_JETONS = ("entree", "sortie", "lecture_cache", "ecriture_cache")
PRIX_DE = {"entree": "entree", "sortie": "sortie", "lecture_cache": "lecture_cache", "ecriture_cache": "ecriture_cache_5m"}
RE_SESSION_DISTANTE = re.compile(r"session_[A-Za-z0-9]{8,64}")


class ErreurDonnees(Exception):
    """Table des tarifs invalide : code de sortie 1."""


def avertir(message: str) -> None:
    print(f"agreger.py: avertissement : {message}", file=sys.stderr)


def instant(texte: str) -> dt.datetime:
    return dt.datetime.fromisoformat(texte.replace("Z", "+00:00"))


# ---------------------------------------------------------------------------
# Lecture


def git(depot: Path, *args: str, entree: bytes | None = None) -> bytes | None:
    try:
        sortie = subprocess.run(["git", "-C", str(depot), *args], capture_output=True, input=entree, timeout=120, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    return sortie.stdout if sortie.returncode == 0 else None


def est_un_clone(depot: Path) -> bool:
    """Vrai si depot est la racine d'un dépôt Git ; un dossier de test rangé dans skeam-ops ne l'est pas."""
    sortie = git(depot, "rev-parse", "--show-toplevel")
    return sortie is not None and Path(sortie.decode().strip()).resolve() == depot.resolve()


def blobs_des_branches(depot: Path) -> dict[str, str]:
    """Blob vers nom de fichier, pour les fichiers de consommation de chaque branche locale et distante."""
    refs = git(depot, "for-each-ref", "--format=%(objectname) %(refname)", "refs/heads", "refs/remotes")
    resultat: dict[str, str] = {}
    for ligne in (refs or b"").decode().splitlines():
        objet, _, nom = ligne.partition(" ")
        if nom.endswith("/HEAD"):
            continue
        arbre = git(depot, "ls-tree", "-r", "--full-tree", objet, "--", DOSSIER)
        for entree in (arbre or b"").decode("utf-8", "replace").splitlines():
            meta, _, chemin = entree.partition("\t")
            parties = meta.split()
            if len(parties) == 3 and parties[1] == "blob" and contrat.RE_FICHIER_CONSO.match(Path(chemin).name):
                resultat.setdefault(parties[2], Path(chemin).name)
    return resultat


def lire_blobs(depot: Path, blobs: Iterable[str]) -> dict[str, str]:
    liste = list(blobs)
    if not liste:
        return {}
    sortie = git(depot, "cat-file", "--batch", entree=("\n".join(liste) + "\n").encode())
    resultat: dict[str, str] = {}
    position = 0
    donnees = sortie or b""
    while position < len(donnees):
        fin_entete = donnees.index(b"\n", position)
        entete = donnees[position:fin_entete].decode().split()
        position = fin_entete + 1
        if len(entete) < 3 or entete[1] == "missing":
            continue
        taille = int(entete[2])
        resultat[entete[0]] = donnees[position:position + taille].decode("utf-8", "replace")
        position += taille + 1
    return resultat


def textes_du_depot(depot: Path) -> list[tuple[str, str]]:
    """(nom de fichier, contenu) : pointe de chaque branche d'un clone, plus les fichiers du répertoire de travail."""
    textes: list[tuple[str, str]] = []
    if est_un_clone(depot):
        noms = blobs_des_branches(depot)
        for blob, contenu in lire_blobs(depot, noms).items():
            textes.append((noms[blob], contenu))
    dossier = depot / DOSSIER
    if dossier.is_dir():
        for fichier in sorted(dossier.glob("*.jsonl")):
            if contrat.RE_FICHIER_CONSO.match(fichier.name):
                try:
                    textes.append((fichier.name, fichier.read_text(encoding="utf-8")))
                except (OSError, UnicodeDecodeError):
                    avertir(f"{depot.name} {fichier.name} illisible, ignoré")
    return textes


def lire_depot(depot: Path) -> list[dict]:
    """Lignes valides de tous les fichiers de consommation du dépôt ; une ligne invalide est signalée et ignorée."""
    lignes: list[dict] = []
    for nom, texte in textes_du_depot(depot):
        session = contrat.RE_FICHIER_CONSO.match(nom).group("session")
        for numero, brute in enumerate(texte.splitlines(), start=1):
            if not brute.strip():
                continue
            rapport = validate.Rapport()
            try:
                ligne = contrat.charger_json_texte(brute)
            except contrat.ErreurLecture as exc:
                avertir(f"{depot.name} {nom} ligne {numero} ignorée : {exc}")
                continue
            if not validate.verifier_ligne_conso(rapport, nom, numero, ligne, session):
                message = next((m for niveau, _, m in rapport.messages if niveau == "ERREUR"), "ligne invalide")
                message = message.split(" : ", 1)[1] if message.startswith(f"ligne {numero} : ") else message
                avertir(f"{depot.name} {nom} ligne {numero} ignorée : {message}")
                continue
            lignes.append(ligne)
    return lignes


class Releve:
    """Une ligne de consommation après dédoublonnage, avec les dépôts où elle a été trouvée."""

    def __init__(self, ligne: dict, depot: str) -> None:
        self.ligne = ligne
        self.depots = [depot]
        self.periodes = [(instant(a), instant(b)) for a, b in ligne["periodes"]]
        self.debut = instant(ligne["debut"])

    @property
    def cle(self) -> tuple:
        return cle(self.ligne)


def cle(ligne: dict) -> tuple:
    return (ligne["session"], ligne["agent_id"] or "", ligne["debut"])


def dedoublonner(lignes: Iterable[tuple[dict, str]]) -> list[Releve]:
    """Une ligne par clé : la plus riche en messages, puis la plus récente ; les dépôts où elle est trouvée sont gardés."""
    par_cle: dict[tuple, Releve] = {}
    for ligne, depot in lignes:
        k = cle(ligne)
        actuel = par_cle.get(k)
        if actuel is None:
            par_cle[k] = Releve(ligne, depot)
            continue
        if depot not in actuel.depots:
            actuel.depots.append(depot)
        if (ligne["messages"], ligne["releve_le"]) > (actuel.ligne["messages"], actuel.ligne["releve_le"]):
            depots = actuel.depots
            par_cle[k] = Releve(ligne, depots[0])
            par_cle[k].depots = depots
    return sorted(par_cle.values(), key=lambda r: (r.ligne["debut"], r.ligne["agent_id"] or ""))


# ---------------------------------------------------------------------------
# Tarifs et coût


def charger_tarifs(chemin: Path) -> list[dict]:
    rapport = validate.Rapport()
    contenu = validate.charger(rapport, chemin, contrat.charger_yaml)
    if contenu is not validate.ECHEC:
        validate.verifier_tarifs_modeles(rapport, chemin, contenu)
    if rapport.nb_erreurs:
        details = " ; ".join(m for niveau, _, m in rapport.messages if niveau == "ERREUR")
        raise ErreurDonnees(f"{chemin} invalide : {details}")
    return contenu["tarifs"]


def tarif(tarifs: list[dict], modele: str, jour: str) -> dict | None:
    """Entrée de plus grande date d'effet antérieure ou égale au jour, à défaut la plus ancienne."""
    entrees = [t for t in tarifs if t["modele"] == modele]
    if not entrees:
        return None
    anterieures = [t for t in entrees if t["depuis"] <= jour]
    return max(anterieures, key=lambda t: t["depuis"]) if anterieures else min(entrees, key=lambda t: t["depuis"])


def cout_modele(compteurs: dict, prix: dict) -> tuple[float, bool]:
    """Coût en USD des compteurs d'un modèle, et vrai si un prix à confirmer a servi."""
    long = compteurs.get("au_dela_100k") or {k: 0 for k in CLES_JETONS}
    prix_long = prix["au_dela_100k"] or prix
    a_confirmer = set(prix["a_confirmer"])
    utilises: set[str] = set()
    cout = 0.0
    for k in CLES_JETONS:
        base = compteurs[k] - long[k]
        cout += base * prix[PRIX_DE[k]] / 1e6
        cout += long[k] * prix_long[PRIX_DE[k]] / 1e6
        if base and k != "ecriture_cache":
            utilises.add(PRIX_DE[k])
        if long[k] and prix["au_dela_100k"]:
            utilises.add("au_dela_100k")
    # L'écriture du cache est comptée au prix 5 minutes ; la part 1 heure reçoit le supplément.
    cout += compteurs["ecriture_cache_1h"] * (prix["ecriture_cache_1h"] - prix["ecriture_cache_5m"]) / 1e6
    if compteurs["ecriture_cache_1h"]:
        utilises.add("ecriture_cache_1h")
    if compteurs["ecriture_cache"] > compteurs["ecriture_cache_1h"]:
        utilises.add("ecriture_cache_5m")
    cout += compteurs["recherches_web"] * prix["recherche_web_mille"] / 1000
    if compteurs["recherches_web"]:
        utilises.add("recherche_web_mille")
    return cout, bool(utilises & a_confirmer)


def cout(ligne: dict, tarifs: list[dict]) -> tuple[float | None, bool, list[str], list[str]]:
    """Coût d'une ligne : USD ou None si un modèle n'a pas de tarif, prix à confirmer, modèles sans tarif, dates d'effet."""
    jour = instant(ligne["debut"]).astimezone(PARIS).date().isoformat()
    total = 0.0
    confirmer = False
    sans: list[str] = []
    dates: list[str] = []
    for modele, compteurs in ligne["modeles"].items():
        prix = tarif(tarifs, modele, jour)
        if prix is None:
            sans.append(modele)
            continue
        valeur, flou = cout_modele(compteurs, prix)
        total += valeur
        confirmer = confirmer or flou
        dates.append(prix["depuis"])
    return (None if sans else total), confirmer, sans, dates


def union_minutes(periodes: Iterable[tuple[dt.datetime, dt.datetime]]) -> float:
    total = 0.0
    fin_courante = None
    debut_courant = None
    for a, b in sorted(periodes):
        if fin_courante is None or a > fin_courante:
            if fin_courante is not None:
                total += (fin_courante - debut_courant).total_seconds()
            debut_courant, fin_courante = a, b
        else:
            fin_courante = max(fin_courante, b)
    if fin_courante is not None:
        total += (fin_courante - debut_courant).total_seconds()
    return total / 60


def heures(minutes: float) -> float:
    return round(minutes / 60, 2)


def dollars(valeur: float | None) -> float | None:
    return None if valeur is None else round(valeur, 2)


# ---------------------------------------------------------------------------
# Ventilation


class Cumul:
    """Temps machine, périodes, jetons et coût d'un ensemble : projet, lot, item, modèle ou hors item."""

    def __init__(self) -> None:
        self.minutes = 0.0
        self.minutes_estimees = 0.0
        self.cout_estime = 0.0
        self.periodes: list = []
        self.jetons = {k: 0.0 for k in CLES_JETONS}
        self.cout = 0.0
        self.cout_inconnu = False
        self.cles: set = set()

    def ajouter(self, releve: Releve, part: float, valeur: float | None, jetons: dict, reel: bool = True) -> None:
        """reel : les périodes de la ligne comptent dans la durée réelle de l'ensemble."""
        self.minutes += releve.ligne["minutes_actives"] * part
        if releve.ligne["lien"] == "session":
            self.minutes_estimees += releve.ligne["minutes_actives"] * part
            self.cout_estime += (valeur or 0.0) * part
        if reel:
            self.periodes.extend(releve.periodes)
        self.cles.add(releve.cle)
        for k in CLES_JETONS:
            self.jetons[k] += jetons[k] * part
        if valeur is None:
            self.cout_inconnu = True
        else:
            self.cout += valeur * part

    @property
    def cout_usd(self) -> float | None:
        return None if self.cout_inconnu else dollars(self.cout)

    def court(self) -> dict:
        """Lot ou item : temps machine pondéré seulement, jamais de durée réelle."""
        return {
            "heures_machine": heures(self.minutes),
            "heures_machine_estimees": heures(self.minutes_estimees),
            "jetons_total": round(sum(self.jetons.values())),
            "cout_usd": self.cout_usd,
        }


def fusion(cumuls: Iterable[Cumul]) -> Cumul:
    resultat = Cumul()
    for c in cumuls:
        resultat.minutes += c.minutes
        resultat.minutes_estimees += c.minutes_estimees
        resultat.cout_estime += c.cout_estime
        resultat.periodes.extend(c.periodes)
        resultat.cles |= c.cles
        resultat.cout += c.cout
        resultat.cout_inconnu = resultat.cout_inconnu or c.cout_inconnu
        for k in CLES_JETONS:
            resultat.jetons[k] += c.jetons[k]
    return resultat


def jetons_de(ligne: dict) -> dict:
    return {k: sum(m[k] for m in ligne["modeles"].values()) for k in CLES_JETONS}


class ConsoProjet:
    def __init__(self, slug: str, items_connus: dict[str, int]) -> None:
        self.slug = slug
        self.items_connus = items_connus
        self.total = Cumul()
        self.semaine = Cumul()
        self.items: dict[str, Cumul] = {}
        self.hors_item = Cumul()
        self.modeles: dict[str, Cumul] = {}
        self.confirmer = False
        self.sans_tarif: set[str] = set()
        self.sessions: set[str] = set()
        self.agents: set[tuple] = set()
        self.depuis: str | None = None
        self.sessions_sans_releve = 0

    def item(self, ident: str) -> dict | None:
        cumul = self.items.get(ident)
        return cumul.court() if cumul else None

    def lot(self, ids: Iterable[str]) -> dict | None:
        cumuls = [self.items[i] for i in ids if i in self.items]
        return fusion(cumuls).court() if cumuls else None

    def sortie(self) -> dict:
        hors_backlog = sorted(i for i in self.items if i not in self.items_connus)
        return {
            "depuis": self.depuis,
            "sessions": len(self.sessions),
            "agents": len(self.agents),
            "heures_machine": heures(self.total.minutes),
            "heures_reelles": heures(union_minutes(self.total.periodes)),
            "semaine_heures_machine": heures(self.semaine.minutes),
            "semaine_heures_reelles": heures(union_minutes(self.semaine.periodes)),
            "semaine_cout_usd": self.semaine.cout_usd,
            "jetons": {k: round(v) for k, v in self.total.jetons.items()},
            "cout_usd": self.total.cout_usd,
            "tarifs_a_confirmer": self.confirmer,
            "modeles_sans_tarif": sorted(self.sans_tarif),
            "par_modele": [
                {"modele": m, "heures_machine": heures(c.minutes), "jetons_total": round(sum(c.jetons.values())), "cout_usd": c.cout_usd}
                for m, c in sorted(self.modeles.items(), key=lambda x: (-x[1].minutes, x[0]))
            ],
            "hors_item": {"heures_machine": heures(self.hors_item.minutes), "cout_usd": self.hors_item.cout_usd},
            "estime": {"heures_machine": heures(self.total.minutes_estimees),
                       "cout_usd": None if self.total.cout_inconnu else dollars(self.total.cout_estime)},
            "items_hors_backlog": [
                {"id": i, "heures_machine": heures(self.items[i].minutes), "cout_usd": self.items[i].cout_usd} for i in hors_backlog
            ],
        }


def modele_principal(ligne: dict) -> str:
    """Modèle qui a produit le plus de jetons de sortie : il porte le temps machine de l'agent."""
    return max(ligne["modeles"], key=lambda m: (ligne["modeles"][m]["sortie"], m))


class Consommation:
    """Consommation ventilée de tous les projets lus."""

    def __init__(self, projets: dict[str, ConsoProjet], releves: list[Releve], tarifs: list[dict], lundi: dt.date) -> None:
        self.projets = projets
        self.releves = releves
        self.tarifs = tarifs
        self.lundi = lundi
        self.dates_tarifs: set[str] = set()
        self.confirmer = False
        self.total = Cumul()
        self.semaine = Cumul()

    def projet(self, slug: str) -> ConsoProjet | None:
        p = self.projets.get(slug)
        return p if p is not None and p.total.cles else None

    def globale(self) -> dict | None:
        if not self.total.cles:
            return None
        return {
            "heures_machine": heures(self.total.minutes),
            "heures_reelles": heures(union_minutes(self.total.periodes)),
            "cout_usd": self.total.cout_usd,
            "semaine_heures_machine": heures(self.semaine.minutes),
            "semaine_heures_reelles": heures(union_minutes(self.semaine.periodes)),
            "semaine_cout_usd": self.semaine.cout_usd,
            "tarifs_du": max(self.dates_tarifs) if self.dates_tarifs else None,
            "tarifs_a_confirmer": self.confirmer,
        }


def ventiler(releves: list[Releve], prefixes: dict[str, str], items_par_projet: dict[str, dict[str, int]],
             tarifs: list[dict], lundi: dt.date) -> Consommation:
    """Ventile chaque ligne entre projets, items et hors item, au prorata de ses parts.

    Un item d'un préfixe inconnu, ou une ligne sans item, revient au hors item du premier dépôt où la
    ligne a été trouvée, dépôts pris dans l'ordre du registre, skeam-ops en dernier.
    """
    projets = {slug: ConsoProjet(slug, items) for slug, items in items_par_projet.items()}
    resultat = Consommation(projets, releves, tarifs, lundi)
    fin_semaine = lundi + dt.timedelta(days=7)
    for releve in releves:
        ligne = releve.ligne
        valeur, confirmer, sans, dates = cout(ligne, tarifs)
        jetons = jetons_de(ligne)
        jour = releve.debut.astimezone(PARIS).date()
        dans_semaine = lundi <= jour < fin_semaine
        resultat.total.ajouter(releve, 1.0, valeur, jetons)
        if dans_semaine:
            resultat.semaine.ajouter(releve, 1.0, valeur, jetons)
        resultat.dates_tarifs.update(dates)
        resultat.confirmer = resultat.confirmer or confirmer
        origine = releve.depots[0]
        parts: dict[tuple[str, str | None], float] = {}
        for item in ligne["items"]:
            slug = prefixes.get(item["id"].split("-")[0])
            cible = (slug, item["id"]) if slug in projets else (origine, None)
            parts[cible] = parts.get(cible, 0.0) + item["part"]
        if not parts:
            parts[(origine, None)] = 1.0
        modele = modele_principal(ligne)
        part_projet: dict[str, float] = {}
        for (slug, _), part in parts.items():
            part_projet[slug] = part_projet.get(slug, 0.0) + part
        for slug, part in part_projet.items():
            # Durée réelle d'un projet : les lignes dont il porte au moins la moitié, comptées une fois.
            if slug in projets and part >= 0.5:
                projets[slug].total.periodes.extend(releve.periodes)
                if dans_semaine:
                    projets[slug].semaine.periodes.extend(releve.periodes)
        for (slug, ident), part in parts.items():
            projet = projets.get(slug)
            if projet is None:
                continue
            projet.total.ajouter(releve, part, valeur, jetons, reel=False)
            if dans_semaine:
                projet.semaine.ajouter(releve, part, valeur, jetons, reel=False)
            if ident is None:
                projet.hors_item.ajouter(releve, part, valeur, jetons, reel=False)
            else:
                projet.items.setdefault(ident, Cumul()).ajouter(releve, part, valeur, jetons, reel=False)
            for nom, compteurs in ligne["modeles"].items():
                cumul = projet.modeles.setdefault(nom, Cumul())
                valeur_modele = None
                prix = tarif(tarifs, nom, jour.isoformat())
                if prix is not None:
                    valeur_modele = cout_modele(compteurs, prix)[0]
                cumul.minutes += ligne["minutes_actives"] * part if nom == modele else 0
                cumul.cles.add(releve.cle)
                for k in CLES_JETONS:
                    cumul.jetons[k] += compteurs[k] * part
                if valeur_modele is None:
                    cumul.cout_inconnu = True
                else:
                    cumul.cout += valeur_modele * part
            projet.confirmer = projet.confirmer or confirmer
            projet.sans_tarif.update(sans)
            projet.sessions.add(ligne["session"])
            projet.agents.add(releve.cle)
            date = jour.isoformat()
            projet.depuis = date if projet.depuis is None or date < projet.depuis else projet.depuis
    return resultat


def sessions_sans_releve(depot: Path, depuis: str, connues: set[str]) -> int:
    """Sessions qui ont commité depuis la date sans laisser de relevé : la marque Claude-Session n'est dans aucune ligne."""
    if not est_un_clone(depot):
        return 0
    sortie = git(depot, "log", "--all", f"--since={depuis}T00:00:00", "--format=%(trailers:key=Claude-Session,valueonly,separator=%x2c)")
    trouvees = set(RE_SESSION_DISTANTE.findall((sortie or b"").decode("utf-8", "replace")))
    return len(trouvees - connues)


def charger(depots: list[tuple[str, Path]], prefixes: dict[str, str], items_par_projet: dict[str, dict[str, int]],
            chemin_tarifs: Path, lundi: dt.date) -> Consommation:
    """Point d'entrée d'agreger.py : depots dans l'ordre du registre, skeam-ops en dernier."""
    tarifs = charger_tarifs(chemin_tarifs)
    lignes: list[tuple[dict, str]] = []
    par_depot: dict[str, list[dict]] = {}
    for slug, depot in depots:
        lues = lire_depot(depot)
        par_depot[slug] = lues
        lignes.extend((ligne, slug) for ligne in lues)
    releves = dedoublonner(lignes)
    resultat = ventiler(releves, prefixes, items_par_projet, tarifs, lundi)
    connues = {r.ligne["session_distante"] for r in releves if r.ligne["session_distante"]}
    for slug, depot in depots:
        lues = par_depot.get(slug) or []
        projet = resultat.projets.get(slug)
        if lues and projet is not None:
            depuis = min(instant(l["debut"]).astimezone(PARIS).date().isoformat() for l in lues)
            projet.sessions_sans_releve = sessions_sans_releve(depot, depuis, connues)
    return resultat


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Résumé de la consommation des agents relevée dans des dépôts.")
    parser.add_argument("depots", nargs="+", type=Path, help="racines des dépôts")
    parser.add_argument("--tarifs", type=Path, default=TARIFS_MODELES)
    args = parser.parse_args(argv)
    try:
        tarifs = charger_tarifs(args.tarifs)
    except ErreurDonnees as exc:
        print(f"conso.py: erreur : {exc}", file=sys.stderr)
        return 1
    releves = dedoublonner((l, d.name) for d in args.depots for l in lire_depot(d))
    total = Cumul()
    for r in releves:
        total.ajouter(r, 1.0, cout(r.ligne, tarifs)[0], jetons_de(r.ligne))
    resume = total.court()
    print(f"{len(releves)} lignes, {len({r.ligne['session'] for r in releves})} sessions, {resume['heures_machine']} h machine, "
          f"{resume['heures_reelles']} h réelles, {resume['jetons_total']} jetons, coût au tarif API {resume['cout_usd']} USD")
    return 0


if __name__ == "__main__":
    sys.exit(main())
