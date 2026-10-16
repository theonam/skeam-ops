"""Calibre le catalogue sur le temps réellement passé chez les clients.

Usage, depuis la racine de skeam-ops :
    python catalogue/scripts/calibrer.py --clients clients.yaml --racine <dossier des clones>
        [--catalogue catalogue] [--rapport catalogue/out/calibration.md] [--recalculer]

Conforme à CONTRAT.md 11.4 : valide le registre et le clone de chaque client,
puis réécrit entièrement la liste mesures de chaque module de modules.yaml, sans
toucher aux autres champs. Une mesure par item fait dont module est non nul, pour
chaque client actif : somme des minutes des lignes de temps valide true de l'item,
divisée par 60 et arrondie au centième. Idempotent.

Écrit aussi le rapport d'écarts estimation contre réel, par module et par client,
dans catalogue/out/calibration.md.

--recalculer, hors contrat 11.4 et désactivé par défaut : met aussi à jour
confiance et prix_conseille_ht selon la méthode de catalogue/README.md. Voir
catalogue/PROPOSITIONS-CONTRAT.md.

Code de sortie : 0 succès, 1 erreur de données, 2 usage incorrect.
"""

from __future__ import annotations

import argparse
import re
import statistics
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import methode  # noqa: E402
from methode import ErreurDonnees, contrat, validate  # noqa: E402

RE_CODE = re.compile(r"^(?P<indent>[ ]*)- code: (?P<code>\S+)[ ]*$")


@dataclass
class DonneesClient:
    slug: str
    nom: str
    items: dict[str, dict]
    minutes_valides: dict[str, int] = field(default_factory=dict)
    minutes_en_attente: dict[str, int] = field(default_factory=dict)
    hors_item_valide: int = 0
    hors_item_en_attente: int = 0
    lignes_en_attente: int = 0


# ---------------------------------------------------------------------------
# Lecture


def lire_clients(chemin_clients: Path, racine: Path, codes: set[str]) -> list[DonneesClient]:
    """Valide le registre et les clones, puis lit items et temps de chaque client actif."""
    rapport = validate.Rapport()
    validate.valider_registre(chemin_clients, rapport, racine, codes)
    if rapport.nb_erreurs:
        raise ErreurDonnees(methode.messages_erreur(rapport) + "\nregistre ou projet client invalide : corriger puis relancer")
    resultat = []
    for entree in contrat.charger_yaml(chemin_clients)["clients"]:
        if not entree["actif"]:
            continue
        projet = contrat.chemin_clone(racine, entree["depot"]) / "projet"
        donnees = DonneesClient(entree["slug"], entree["nom"], {i["id"]: i for i in contrat.lire_items(projet)})
        for ligne in contrat.lire_temps(projet):
            if ligne["item"] is None:
                if ligne["valide"]:
                    donnees.hors_item_valide += ligne["minutes"]
                else:
                    donnees.hors_item_en_attente += ligne["minutes"]
            else:
                cible = donnees.minutes_valides if ligne["valide"] else donnees.minutes_en_attente
                cible[ligne["item"]] = cible.get(ligne["item"], 0) + ligne["minutes"]
            if not ligne["valide"]:
                donnees.lignes_en_attente += 1
        resultat.append(donnees)
    return resultat


def calculer_mesures(clients: list[DonneesClient], modules: dict[str, dict]) -> tuple[dict[str, list[dict]], list[str]]:
    """Nouvelles mesures par module, triées par client puis item, et anomalies relevées."""
    mesures: dict[str, list[dict]] = {code: [] for code in modules}
    anomalies = []
    for client in clients:
        for ident, item in client.items.items():
            if item["statut"] != "fait" or item["module"] is None:
                continue
            minutes = client.minutes_valides.get(ident, 0)
            if not minutes:
                attente = client.minutes_en_attente.get(ident, 0)
                suite = f", {methode.heures(attente / 60)} en attente de validation" if attente else ""
                anomalies.append(f"{client.slug} {ident} fait sans temps validé{suite} : pas de mesure.")
                continue
            if item["module"] not in modules:
                anomalies.append(f"{client.slug} {ident} fait sur le module `{item['module']}`, absent du catalogue : mesure perdue.")
                continue
            mesures[item["module"]].append({"client": client.slug, "item": ident, "heures": methode.nombre(minutes / 60)})
    for liste in mesures.values():
        liste.sort(key=lambda m: (m["client"], m["item"]))
    return mesures, anomalies


# ---------------------------------------------------------------------------
# Réécriture de modules.yaml, ligne à ligne pour conserver commentaires et mise en forme


def bloc_mesures(indent: str, mesures: list[dict]) -> list[str]:
    if not mesures:
        return [f"{indent}mesures: []"]
    lignes = [f"{indent}mesures:"]
    for mesure in mesures:
        lignes += [
            f"{indent}  - client: {mesure['client']}",
            f"{indent}    item: {mesure['item']}",
            f"{indent}    heures: {methode.texte_nombre(mesure['heures'])}",
        ]
    return lignes


def reecrire_modules(texte: str, nouveaux: dict[str, dict]) -> str:
    """Remplace, pour chaque module, les champs donnés dans nouveaux[code] : mesures, confiance, prix_conseille_ht."""
    lignes = texte.split("\n")
    sortie: list[str] = []
    code = None
    indent = ""
    index = 0
    while index < len(lignes):
        ligne = lignes[index]
        index += 1
        correspondance = RE_CODE.match(ligne)
        if correspondance:
            code = correspondance.group("code")
            indent = " " * (len(correspondance.group("indent")) + 2)
            sortie.append(ligne)
            continue
        champs = nouveaux.get(code, {}) if code else {}
        if "mesures" in champs and ligne.startswith(f"{indent}mesures:"):
            while index < len(lignes) and lignes[index].strip() and (
                len(lignes[index]) - len(lignes[index].lstrip(" ")) > len(indent) or lignes[index].startswith(f"{indent}- ")
            ):
                index += 1
            sortie += bloc_mesures(indent, champs["mesures"])
            continue
        remplace = False
        for cle in ("confiance", "prix_conseille_ht"):
            if cle in champs and ligne.startswith(f"{indent}{cle}:"):
                valeur = champs[cle]
                sortie.append(f"{indent}{cle}: {'null' if valeur is None else valeur if isinstance(valeur, str) else methode.texte_nombre(valeur)}")
                remplace = True
        if not remplace:
            sortie.append(ligne)
    return "\n".join(sortie)


def verifier_reecriture(avant: list[dict], texte: str, nouveaux: dict[str, dict], chemin: Path) -> None:
    """La réécriture ne change que les champs demandés ; sinon rien n'est écrit."""
    try:
        apres = contrat.charger_yaml_texte(texte)
    except contrat.ErreurLecture as exc:
        raise ErreurDonnees(f"ERREUR {chemin}: réécriture illisible, fichier laissé intact : {exc}") from exc
    rapport = validate.Rapport()
    if validate.valider_schema(rapport, "catalogue-modules", apres, chemin):
        raise ErreurDonnees(methode.messages_erreur(rapport) + "\nréécriture non conforme, fichier laissé intact")
    modules_apres = apres["modules"]
    if [m["code"] for m in modules_apres] != [m["code"] for m in avant]:
        raise ErreurDonnees(f"ERREUR {chemin}: liste des modules modifiée par la réécriture, fichier laissé intact")
    for ancien, nouveau in zip(avant, modules_apres):
        attendu = {**ancien, **nouveaux[ancien["code"]]}
        if nouveau != attendu:
            differents = sorted(k for k in attendu if nouveau.get(k) != attendu[k])
            raise ErreurDonnees(
                f"ERREUR {chemin}: module {ancien['code']}, mise en forme non reconnue pour {', '.join(differents)} ; "
                "écrire chaque champ sur sa ligne comme dans CONTRAT.md 8.1. Fichier laissé intact."
            )


# ---------------------------------------------------------------------------
# Rapport


def ecart(reel: float, estime: float) -> str:
    if not estime:
        return ""
    valeur = round((reel - estime) / estime * 100)
    return f"{valeur:+d} %"


def tableau(entetes: list[str], rangees: list[list[str]]) -> list[str]:
    sortie = ["| " + " | ".join(entetes) + " |", "|" + "|".join("---" for _ in entetes) + "|"]
    return sortie + ["| " + " | ".join(r) + " |" for r in rangees]


def rendre_rapport(
    date: str,
    clients: list[DonneesClient],
    anciens: dict[str, dict],
    nouveaux_modules: dict[str, dict],
    tarifs: dict,
    anomalies: list[str],
    recalcule: bool,
) -> str:
    nb_avant = sum(len(m["mesures"]) for m in anciens.values())
    nb_apres = sum(len(m["mesures"]) for m in nouveaux_modules.values())
    modifies = [code for code in anciens if anciens[code]["mesures"] != nouveaux_modules[code]["mesures"]]
    attente_min = sum(sum(c.minutes_en_attente.values()) + c.hors_item_en_attente for c in clients)
    attente_lignes = sum(c.lignes_en_attente for c in clients)
    md = [
        f"# Calibration du catalogue du {date}",
        "",
        "Audience interne. Produit par catalogue/scripts/calibrer.py ; méthode dans catalogue/README.md. "
        "Seules les lignes de temps relues par Théo, valide true, alimentent les mesures.",
        "",
        "## Synthèse",
        "",
        f"- Clients actifs lus : {', '.join(c.slug for c in clients) or 'aucun'}.",
        f"- Mesures : {nb_avant} avant, {nb_apres} après ; modules modifiés : {', '.join(f'`{c}`' for c in modifies) or 'aucun'}.",
        f"- Temps en attente de validation : {validate.pluriel(attente_lignes, 'ligne')}, {methode.heures(attente_min / 60)} ; "
        "à relire avec catalogue/scripts/temps.py week avant de calibrer." if attente_lignes else "- Aucune ligne de temps en attente de validation.",
        "- Confiance et prix conseillé : recalculés et écrits dans modules.yaml." if recalcule
        else "- Confiance et prix conseillé : calculés ci-dessous, non écrits ; relancer avec --recalculer pour les appliquer.",
    ]

    md += ["", "## Par module", "",
           "Une observation est le total des heures mesurées d'un module chez un client. "
           "Estimation : somme des estimation_h des items mesurés.", ""]
    rangees = []
    sans_mesure = []
    for code, module in nouveaux_modules.items():
        obs = methode.observations(module)
        if not obs:
            sans_mesure.append(code)
            continue
        estime = reel = 0.0
        for mesure in module["mesures"]:
            client = next(c for c in clients if c.slug == mesure["client"])
            estime += client.items[mesure["item"]]["estimation_h"]
            reel += mesure["heures"]
        suggestion = methode.fourchette_suggeree(module)
        ancien = anciens[code]
        rangees.append([
            f"`{code}`",
            methode.plage(module["heures_min"], module["heures_max"]),
            ", ".join(f"{slug} {methode.heures(h)}" for slug, h in methode.observations_par_client(module).items()),
            methode.heures(statistics.median(obs)),
            methode.pourcentage(methode.part_dans_fourchette(module)),
            f"{methode.heures(estime)} → {methode.heures(reel)}",
            ecart(reel, estime),
            f"{ancien['confiance']} → {methode.confiance_calculee(module)}",
            f"{methode.euros(ancien['prix_conseille_ht']) if ancien['prix_conseille_ht'] is not None else 'aucun'} → "
            f"{methode.euros(methode.prix_conseille(module, tarifs))}",
            methode.plage(*suggestion),
        ])
    if rangees:
        md += tableau(["Module", "Fourchette", "Réel par client", "Médiane", "Dans la fourchette", "Estimation → réel",
                       "Écart", "Confiance", "Prix conseillé", "Fourchette suggérée"], rangees)
    else:
        md += ["Aucune mesure pour l'instant."]
    if sans_mesure:
        md += ["", "Modules sans mesure : " + ", ".join(f"`{c}`" for c in sans_mesure) + "."]

    md += ["", "## Par client"]
    for client in clients:
        md += ["", f"### {client.nom}, {client.slug}", ""]
        rangees = []
        alertes = False
        estime_fait = reel_fait = 0.0
        for ident in sorted(set(client.minutes_valides) | set(client.minutes_en_attente)):
            item = client.items.get(ident)
            if item is None:
                continue
            valide = client.minutes_valides.get(ident, 0) / 60
            attente = client.minutes_en_attente.get(ident, 0) / 60
            total = valide + attente
            alerte = " ⚠" if item["statut"] not in ("fait", "abandonne") and total > item["estimation_h"] else ""
            alertes = alertes or bool(alerte)
            if item["statut"] == "fait" and valide:
                estime_fait += item["estimation_h"]
                reel_fait += valide
            rangees.append([
                ident, f"`{item['module']}`" if item["module"] else "hors catalogue", item["statut"],
                methode.heures(item["estimation_h"]), methode.heures(valide), methode.heures(attente),
                ecart(total, item["estimation_h"]) + alerte,
            ])
        if rangees:
            md += tableau(["Item", "Module", "Statut", "Estimation", "Réel validé", "En attente", "Écart"], rangees)
            if alertes:
                md += ["", "⚠ : item non terminé qui dépasse déjà son estimation."]
        else:
            md += ["Aucun temps saisi sur un item."]
        temps_items = sum(client.minutes_valides.values()) / 60
        md += [""]
        if estime_fait:
            md += [f"- Items faits avec temps validé : estimés {methode.heures(estime_fait)}, réels {methode.heures(reel_fait)}, écart {ecart(reel_fait, estime_fait)}."]
        hors = client.hors_item_valide / 60
        part = f", soit {methode.pourcentage(hors / temps_items)} du temps validé sur les items" if temps_items else ""
        md += [f"- Temps hors item validé, réunions et gestion : {methode.heures(hors)}{part}. Il n'entre dans aucune mesure ; la marge et le plancher doivent le couvrir."]

    retirees = [
        f"`{code}` : {m['client']} {m['item']}, {methode.heures(m['heures'])}"
        for code, module in anciens.items() for m in module["mesures"] if m not in nouveaux_modules[code]["mesures"]
    ]
    if retirees:
        anomalies = anomalies + [
            "Mesures retirées, client inactif, absent du registre ou item qui n'est plus fait : " + " ; ".join(retirees) + "."
        ]
    md += ["", "## Anomalies", ""]
    md += [f"- {a}" for a in anomalies] if anomalies else ["Aucune."]
    return "\n".join(md) + "\n"


# ---------------------------------------------------------------------------


def calibrer(chemin_clients: Path, racine: Path, dossier: Path, chemin_rapport: Path, recalculer: bool, date: str) -> tuple[int, int]:
    modules, tarifs = methode.charger_catalogue(dossier)
    clients = lire_clients(chemin_clients, racine, set(modules))
    mesures, anomalies = calculer_mesures(clients, modules)

    nouveaux: dict[str, dict] = {}
    nouveaux_modules: dict[str, dict] = {}
    for code, module in modules.items():
        champs = {"mesures": mesures[code]}
        calibre = {**module, **champs}
        if recalculer:
            champs["confiance"] = methode.confiance_calculee(calibre)
            champs["prix_conseille_ht"] = methode.prix_conseille(calibre, tarifs)
        nouveaux[code] = champs
        nouveaux_modules[code] = {**module, **champs}

    chemin_modules = dossier / "modules.yaml"
    texte = chemin_modules.read_text(encoding="utf-8")
    nouveau_texte = reecrire_modules(texte, nouveaux)
    verifier_reecriture(list(modules.values()), nouveau_texte, nouveaux, chemin_modules)
    if nouveau_texte != texte:
        chemin_modules.write_text(nouveau_texte, encoding="utf-8")

    chemin_rapport.parent.mkdir(parents=True, exist_ok=True)
    chemin_rapport.write_text(rendre_rapport(date, clients, modules, nouveaux_modules, tarifs, anomalies, recalculer), encoding="utf-8")
    return sum(len(m) for m in mesures.values()), len(clients)


def main(argv: list[str] | None = None, aujourdhui: str | None = None) -> int:
    parser = argparse.ArgumentParser(description="Calibre catalogue/modules.yaml sur le temps validé des clients actifs.")
    parser.add_argument("--clients", type=Path, required=True, help="registre clients.yaml")
    parser.add_argument("--racine", type=Path, required=True, help="dossier des clones des dépôts clients")
    parser.add_argument("--catalogue", type=Path, default=methode.DOSSIER_CATALOGUE, help="dossier du catalogue, catalogue/ par défaut")
    parser.add_argument("--rapport", type=Path, help="rapport d'écarts, <catalogue>/out/calibration.md par défaut")
    parser.add_argument("--recalculer", action="store_true", help="met aussi à jour confiance et prix_conseille_ht, hors contrat 11.4")
    args = parser.parse_args(argv)

    for chemin in (args.clients, args.racine, args.catalogue):
        if not chemin.exists():
            print(f"calibrer.py: erreur : {chemin} introuvable", file=sys.stderr)
            return 2
    rapport = args.rapport or args.catalogue / "out" / "calibration.md"
    try:
        nb_mesures, nb_clients = calibrer(args.clients, args.racine, args.catalogue, rapport, args.recalculer, aujourdhui or methode.aujourdhui_paris())
    except ErreurDonnees as exc:
        print(f"{exc}\ncalibrer.py: erreur : catalogue non modifié", file=sys.stderr)
        return 1
    print(f"Catalogue calibré : {nb_mesures} mesures sur {nb_clients} clients actifs. Rapport : {validate.afficher(rapport)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
