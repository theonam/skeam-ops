"""Journal de temps : saisie d'une session et relecture hebdomadaire.

Usage, depuis la racine de skeam-ops :
    python catalogue/scripts/temps.py start <chemin_projet> --agent <agent> [--item <id>] [--note <texte>]
    python catalogue/scripts/temps.py stop --agent <agent> [--note <texte>] [--annuler]
    python catalogue/scripts/temps.py log <chemin_projet> --agent <agent> --debut HH:MM --fin HH:MM
        [--date AAAA-MM-JJ] [--item <id>] [--note <texte>]
    python catalogue/scripts/temps.py week <chemin_projet> [<chemin_projet> ...]
        [--semaine AAAA-Wss | --semaine AAAA-MM-JJ] [--agent <agent>] [--sortie <fichier.md>] [--oui]

start note l'heure de début, à Paris, dans catalogue/out/temps/, qui n'est pas
versionné ; stop écrit la ligne de la session ; log écrit directement une ligne
dont on connaît début et fin. La ligne suit CONTRAT.md section 6 : fichier
temps/AAAA-MM-<agent>.jsonl, clés dans l'ordre du contrat, source theo si et
seulement si l'agent est theo, valide false.

week affiche la synthèse d'une semaine, la semaine en cours par défaut, puis
demande confirmation avant de passer valide à true sur les lignes listées. Sans
terminal et sans --oui, rien n'est validé. --oui est réservé à Théo : un agent ne
valide jamais son propre temps.

Code de sortie : 0 succès, 1 erreur de données, 2 usage incorrect.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date as Date, datetime, timedelta
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))

import methode  # noqa: E402
from methode import ErreurDonnees, contrat, validate  # noqa: E402

DOSSIER_ETAT = methode.DOSSIER_CATALOGUE / "out" / "temps"
CLES = ["date", "debut", "fin", "minutes", "item", "source", "agent", "note", "valide"]
RE_SEMAINE = re.compile(r"^([0-9]{4})-W([0-9]{2})$")


# ---------------------------------------------------------------------------
# Écriture d'une ligne


def preparer_projet(chemin: Path) -> Path:
    projet = validate.resoudre_projet(chemin)
    methode.valider_projet(projet, validate.codes_catalogue(None))
    return projet


def construire_ligne(date: str, debut: str, fin: str, item: str | None, agent: str, note: str) -> dict:
    valeurs = {
        "date": date,
        "debut": debut,
        "fin": fin,
        "minutes": contrat.minutes_entre(debut, fin),
        "item": item,
        "source": "theo" if agent == "theo" else "claude-code",
        "agent": agent,
        "note": note,
        "valide": False,
    }
    return {cle: valeurs[cle] for cle in CLES}


def texte_ligne(ligne: dict) -> str:
    return json.dumps({cle: ligne[cle] for cle in CLES}, ensure_ascii=False, separators=(",", ":"))


def verifier_item(projet: Path, item: str | None) -> None:
    if item is not None and item not in {i["id"] for i in contrat.lire_items(projet)}:
        raise ErreurDonnees(f"item {item} introuvable dans {validate.afficher(projet / 'backlog')}")


def ecrire_ligne(projet: Path, ligne: dict) -> Path:
    """Ajoute la ligne en fin de son fichier après contrôle ; annule l'ajout si le projet devient invalide."""
    if ligne["debut"] == ligne["fin"]:
        raise ErreurDonnees("début et fin identiques : une session dure au moins une minute")
    controle = validate.Rapport()
    validate.verifier_ligne_temps(controle, "ligne", 1, ligne)
    if controle.nb_erreurs:
        raise ErreurDonnees(methode.messages_erreur(controle))
    verifier_item(projet, ligne["item"])
    for existante in contrat.lire_temps(projet):
        if (existante["agent"], existante["date"], existante["debut"]) == (ligne["agent"], ligne["date"], ligne["debut"]):
            raise ErreurDonnees(f"session déjà saisie pour {ligne['agent']} le {ligne['date']} à {ligne['debut']}")

    fichier = projet / "temps" / f"{ligne['date'][:7]}-{ligne['agent']}.jsonl"
    avant = fichier.read_text(encoding="utf-8") if fichier.exists() else None
    prefixe = avant if avant is None or avant == "" or avant.endswith("\n") else avant + "\n"
    fichier.write_text((prefixe or "") + texte_ligne(ligne) + "\n", encoding="utf-8")
    rapport = validate.Rapport()
    validate.valider_projet(projet, rapport, validate.codes_catalogue(None))
    if rapport.nb_erreurs:
        if avant is None:
            fichier.unlink()
        else:
            fichier.write_text(avant, encoding="utf-8")
        raise ErreurDonnees(methode.messages_erreur(rapport) + "\nligne retirée : le projet serait devenu invalide")
    return fichier


# ---------------------------------------------------------------------------
# start, stop, log


def chemin_etat(dossier_etat: Path, agent: str) -> Path:
    return dossier_etat / f"en-cours-{agent}.json"


def commande_start(args, maintenant: datetime, dossier_etat: Path) -> int:
    projet = preparer_projet(args.projet)
    verifier_item(projet, args.item)
    etat = chemin_etat(dossier_etat, args.agent)
    if etat.exists():
        ouvert = json.loads(etat.read_text(encoding="utf-8"))
        raise ErreurDonnees(f"session déjà ouverte pour {args.agent} depuis le {ouvert['debut'][:16].replace('T', ' à ')} : lancer stop d'abord, ou stop --annuler")
    dossier_etat.mkdir(parents=True, exist_ok=True)
    contenu = {"projet": str(projet.resolve()), "agent": args.agent, "item": args.item, "note": args.note or "", "debut": maintenant.isoformat(timespec="seconds")}
    etat.write_text(json.dumps(contenu, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Session ouverte pour {args.agent} à {maintenant:%H:%M}, item {args.item or 'aucun'}.")
    return 0


def commande_stop(args, maintenant: datetime, dossier_etat: Path) -> int:
    etat = chemin_etat(dossier_etat, args.agent)
    if not etat.exists():
        raise ErreurDonnees(f"aucune session ouverte pour {args.agent} : lancer start, ou log pour une session passée")
    ouvert = json.loads(etat.read_text(encoding="utf-8"))
    if args.annuler:
        etat.unlink()
        print(f"Session de {args.agent} annulée, rien n'est écrit.")
        return 0
    debut = datetime.fromisoformat(ouvert["debut"])
    duree = (maintenant - debut).total_seconds() / 60
    if duree >= 1440:
        raise ErreurDonnees("session ouverte depuis plus de 24 heures : stop --annuler puis saisir la session avec log")
    if f"{maintenant:%H:%M}" == f"{debut:%H:%M}":
        raise ErreurDonnees("session de moins d'une minute : relancer stop plus tard, ou stop --annuler")
    projet = preparer_projet(Path(ouvert["projet"]))
    ligne = construire_ligne(f"{debut:%Y-%m-%d}", f"{debut:%H:%M}", f"{maintenant:%H:%M}", ouvert["item"], args.agent, args.note if args.note is not None else ouvert["note"])
    fichier = ecrire_ligne(projet, ligne)
    etat.unlink()
    print(f"Ligne écrite dans {validate.afficher(fichier)} : {texte_ligne(ligne)}")
    return 0


def commande_log(args, maintenant: datetime, _dossier_etat: Path) -> int:
    projet = preparer_projet(args.projet)
    ligne = construire_ligne(args.date or f"{maintenant:%Y-%m-%d}", args.debut, args.fin, args.item, args.agent, args.note or "")
    fichier = ecrire_ligne(projet, ligne)
    print(f"Ligne écrite dans {validate.afficher(fichier)} : {texte_ligne(ligne)}")
    return 0


# ---------------------------------------------------------------------------
# week


def bornes_semaine(texte: str | None, maintenant: datetime) -> tuple[Date, Date, str]:
    """Lundi, dimanche et libellé AAAA-Wss de la semaine demandée."""
    if texte is None:
        jour = maintenant.date()
    elif RE_SEMAINE.match(texte):
        annee, numero = map(int, RE_SEMAINE.match(texte).groups())
        try:
            jour = Date.fromisocalendar(annee, numero, 1)
        except ValueError as exc:
            raise ValueError(f"semaine {texte} inexistante") from exc
    else:
        jour = Date.fromisoformat(texte)
    lundi = jour - timedelta(days=jour.weekday())
    annee, numero, _ = lundi.isocalendar()
    return lundi, lundi + timedelta(days=6), f"{annee}-W{numero:02d}"


def lignes_semaine(projet: Path, lundi: Date, dimanche: Date, agent: str | None) -> list[tuple[Path, dict]]:
    resultat = []
    for fichier in sorted((projet / "temps").glob("*.jsonl")):
        for _, ligne in contrat.lire_jsonl(fichier):
            if lundi.isoformat() <= ligne["date"] <= dimanche.isoformat() and agent in (None, ligne["agent"]):
                resultat.append((fichier, ligne))
    resultat.sort(key=lambda fl: (fl[1]["date"], fl[1]["debut"], fl[1]["agent"]))
    return resultat


def synthese(projets: list[Path], lundi: Date, dimanche: Date, libelle: str, agent: str | None) -> tuple[str, list[tuple[Path, dict]]]:
    md = [f"# Temps de la semaine {libelle}, du {lundi.isoformat()} au {dimanche.isoformat()}", ""]
    if agent:
        md += [f"Agent : {agent}.", ""]
    a_valider: list[tuple[Path, dict]] = []
    total_semaine = 0
    for projet in projets:
        client = contrat.lire_client(projet)
        items = {i["id"]: i for i in contrat.lire_items(projet)}
        cumul: dict[str, int] = {}
        for ligne in contrat.lire_temps(projet):
            if ligne["item"]:
                cumul[ligne["item"]] = cumul.get(ligne["item"], 0) + ligne["minutes"]
        lignes = lignes_semaine(projet, lundi, dimanche, agent)
        md += [f"## {client['nom']}, {client['slug']}", ""]
        if not lignes:
            md += ["Aucune ligne cette semaine.", ""]
            continue
        md += ["| Date | Début | Fin | Durée | Agent | Item | Note | Validé |", "|---|---|---|---|---|---|---|---|"]
        par_agent: dict[str, int] = {}
        par_item: dict[str | None, int] = {}
        for fichier, ligne in lignes:
            titre = f"{ligne['item']} {items[ligne['item']]['titre']}" if ligne["item"] in items else "hors item"
            md.append(
                f"| {ligne['date']} | {ligne['debut']} | {ligne['fin']} | {methode.heures(ligne['minutes'] / 60)} | {ligne['agent']} "
                f"| {titre} | {ligne['note']} | {'oui' if ligne['valide'] else '**non**'} |"
            )
            par_agent[ligne["agent"]] = par_agent.get(ligne["agent"], 0) + ligne["minutes"]
            par_item[ligne["item"]] = par_item.get(ligne["item"], 0) + ligne["minutes"]
            if not ligne["valide"]:
                a_valider.append((fichier, ligne))
        sous_total = sum(par_agent.values())
        total_semaine += sous_total
        md += ["", f"Total : {methode.heures(sous_total / 60)}, dont " + ", ".join(f"{a} {methode.heures(m / 60)}" for a, m in sorted(par_agent.items())) + ".", ""]
        md += ["| Item | Semaine | Cumul | Estimation | Statut |", "|---|---|---|---|---|"]
        for ident, minutes in sorted(par_item.items(), key=lambda im: (im[0] is None, im[0] or "")):
            if ident is None:
                md.append(f"| hors item | {methode.heures(minutes / 60)} | | | |")
                continue
            item = items[ident]
            depasse = " ⚠" if cumul[ident] / 60 > item["estimation_h"] else ""
            md.append(f"| {ident} | {methode.heures(minutes / 60)} | {methode.heures(cumul[ident] / 60)}{depasse} | {methode.heures(item['estimation_h'])} | {item['statut']} |")
        md += [""]
    attente = sum(ligne["minutes"] for _, ligne in a_valider)
    md += [f"Total de la semaine : {methode.heures(total_semaine / 60)}. À valider : {validate.pluriel(len(a_valider), 'ligne')}, {methode.heures(attente / 60)}."]
    if any("⚠" in ligne for ligne in md):
        md += ["", "⚠ : cumul de l'item supérieur à son estimation."]
    return "\n".join(md) + "\n", a_valider


def valider_lignes(a_valider: list[tuple[Path, dict]]) -> None:
    """Passe valide à true sur les lignes données ; les autres lignes restent identiques à l'octet près."""
    par_fichier: dict[Path, set[tuple[str, str, str]]] = {}
    for fichier, ligne in a_valider:
        par_fichier.setdefault(fichier, set()).add((ligne["agent"], ligne["date"], ligne["debut"]))
    for fichier, cles in par_fichier.items():
        sortie = []
        for brute in fichier.read_text(encoding="utf-8").splitlines():
            ligne = contrat.charger_json_texte(brute)
            if (ligne["agent"], ligne["date"], ligne["debut"]) in cles and not ligne["valide"]:
                brute = texte_ligne({**ligne, "valide": True})
            sortie.append(brute)
        temporaire = fichier.with_name(fichier.name + ".tmp")
        temporaire.write_text("\n".join(sortie) + "\n", encoding="utf-8")
        os.replace(temporaire, fichier)


def commande_week(args, maintenant: datetime, _dossier_etat: Path, entree: Callable[[str], str] | None = None) -> int:
    try:
        lundi, dimanche, libelle = bornes_semaine(args.semaine, maintenant)
    except ValueError as exc:
        print(f"temps.py: erreur : {exc} ; attendu AAAA-Wss ou AAAA-MM-JJ", file=sys.stderr)
        return 2
    projets = [preparer_projet(chemin) for chemin in args.projets]
    texte, a_valider = synthese(projets, lundi, dimanche, libelle, args.agent)
    print(texte, end="")
    if args.sortie:
        args.sortie.parent.mkdir(parents=True, exist_ok=True)
        args.sortie.write_text(texte, encoding="utf-8")
    if not a_valider:
        return 0
    if args.oui:
        accord = True
    elif entree is not None or sys.stdin.isatty():
        reponse = (entree or input)(f"Passer valide à true pour les {validate.pluriel(len(a_valider), 'ligne')} non validées ci-dessus ? [o/N] ")
        accord = reponse.strip().lower() in ("o", "oui")
    else:
        print("Rien n'est validé : confirmation de Théo requise, en terminal ou avec --oui.")
        return 0
    if not accord:
        print("Rien n'est validé.")
        return 0
    valider_lignes(a_valider)
    for projet in projets:
        methode.valider_projet(projet, validate.codes_catalogue(None))
    print(f"{validate.pluriel(len(a_valider), 'ligne')} passée{'s' if len(a_valider) > 1 else ''} à valide true.")
    return 0


# ---------------------------------------------------------------------------


def analyseur() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Journal de temps conforme à CONTRAT.md section 6.")
    sous = parser.add_subparsers(dest="commande", required=True)

    start = sous.add_parser("start", help="ouvre une session à l'heure de Paris")
    start.add_argument("projet", type=Path)
    start.add_argument("--agent", required=True)
    start.add_argument("--item")
    start.add_argument("--note")

    stop = sous.add_parser("stop", help="ferme la session ouverte et écrit sa ligne")
    stop.add_argument("--agent", required=True)
    stop.add_argument("--note", help="remplace la note donnée à start")
    stop.add_argument("--annuler", action="store_true", help="abandonne la session sans rien écrire")

    log = sous.add_parser("log", help="écrit une session dont on connaît début et fin")
    log.add_argument("projet", type=Path)
    log.add_argument("--agent", required=True)
    log.add_argument("--debut", required=True, help="HH:MM, heure de Paris")
    log.add_argument("--fin", required=True, help="HH:MM ; avant le début si la session passe minuit")
    log.add_argument("--date", help="date du début, AAAA-MM-JJ ; aujourd'hui par défaut")
    log.add_argument("--item")
    log.add_argument("--note")

    week = sous.add_parser("week", help="synthèse d'une semaine et validation après confirmation")
    week.add_argument("projets", type=Path, nargs="+")
    week.add_argument("--semaine", help="AAAA-Wss ou une date de la semaine ; semaine en cours par défaut")
    week.add_argument("--agent", help="ne retient que cet agent")
    week.add_argument("--sortie", type=Path, help="écrit aussi la synthèse dans ce fichier")
    week.add_argument("--oui", action="store_true", help="valide sans demander ; réservé à Théo")
    return parser


def main(
    argv: list[str] | None = None,
    maintenant: datetime | None = None,
    dossier_etat: Path | None = None,
    entree: Callable[[str], str] | None = None,
) -> int:
    args = analyseur().parse_args(argv)
    for chemin in [getattr(args, "projet", None), *getattr(args, "projets", [])]:
        if chemin is not None and not chemin.is_dir():
            print(f"temps.py: erreur : {chemin} introuvable", file=sys.stderr)
            return 2
    for cle in ("debut", "fin", "date"):
        valeur = getattr(args, cle, None)
        motif = r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$" if cle == "date" else r"^([01][0-9]|2[0-3]):[0-5][0-9]$"
        if valeur is not None and not re.match(motif, valeur):
            print(f"temps.py: erreur : --{cle} {valeur!r} invalide, attendu {'AAAA-MM-JJ' if cle == 'date' else 'HH:MM'}", file=sys.stderr)
            return 2
    maintenant = maintenant or methode.maintenant_paris()
    dossier_etat = dossier_etat or DOSSIER_ETAT
    try:
        if args.commande == "week":
            return commande_week(args, maintenant, dossier_etat, entree)
        return {"start": commande_start, "stop": commande_stop, "log": commande_log}[args.commande](args, maintenant, dossier_etat)
    except ErreurDonnees as exc:
        print(f"{exc}\ntemps.py: erreur : rien n'est écrit", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
