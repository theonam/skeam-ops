"""Agrège les dossiers projet des clients actifs en une vue JSON filtrée par audience.

Usage :
    python dashboard/scripts/agreger.py --clients clients.yaml --racine <dossier des clones> \\
        --audience interne|commercial|client --sortie dashboard/out/<audience>.json

Lit chaque client actif du registre dans son clone, plus le dossier projet/ du
répertoire courant, skeam-ops lui-même, slug ops, sauf si le registre le
déclare déjà. Tous les dossiers sont validés avant lecture. La sortie ne
contient que ce que l'audience peut voir, CONTRAT.md section 10 ; son format est
décrit dans dashboard/README.md.

Code de sortie : 0 en cas de succès, 1 pour une erreur de données ou de
validation, 2 pour un usage incorrect.

Python 3.11. Dépendances : requirements.txt.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import contrat  # noqa: E402
import validate  # noqa: E402

AUDIENCES = ("interne", "commercial", "client")
CHEMIN_OPS = Path("projet")
SEUIL_DEPASSEMENT = 0.20
DEVELOPPES = ("a_recetter", "fait")
JOURS_EN_COURS_MAX = 7
# Ordre d'affichage du portefeuille : ce qui est en production d'abord.
ORDRE_STATUTS = ["en_dev", "recette", "signe", "devis_envoye", "cadrage", "prospect", "run", "clos"]
ORDRE_GRAVITE = {"haute": 0, "moyenne": 1, "basse": 2}
# Clés qui ne doivent jamais apparaître hors de l'audience interne : contrôle de sûreté final.
CLES_INTERNES = {
    "actions", "a_valider", "audience", "charge_semaine", "commit", "compteurs", "devis_a_envoyer", "developpe",
    "dependances", "dependances_externes", "depot", "docs_interne", "ecart_pct", "estimation_h",
    "items_bloques", "minutes", "notes", "taille", "temps", "teste_ia", "todoist",
}


class ErreurDonnees(Exception):
    """Registre ou dossier projet invalide : code de sortie 1."""


# ---------------------------------------------------------------------------
# Chargement et validation


def charger_projets(chemin_clients: Path, racine: Path) -> list[Path]:
    """Valide le registre et chaque dossier projet à lire ; renvoie les dossiers projet."""
    rapport = validate.Rapport()
    registre = validate.charger(rapport, chemin_clients, contrat.charger_yaml)
    dossiers: list[Path] = []
    if registre is not validate.ECHEC and not validate.valider_schema(rapport, "clients", registre, chemin_clients):
        slugs = [entree["slug"] for entree in registre["clients"]]
        for slug in sorted({s for s in slugs if slugs.count(s) > 1}):
            rapport.erreur(chemin_clients, f"slug {slug} en double")
        for entree in registre["clients"]:
            if not entree["actif"]:
                continue
            dossier = contrat.chemin_clone(racine, entree["depot"]) / "projet"
            if not dossier.is_dir():
                rapport.erreur(chemin_clients, f"{entree['slug']} : clone introuvable, attendu {validate.afficher(dossier)}")
                continue
            client = validate.valider_projet(dossier, rapport)["client"]
            if client is not None and client["slug"] != entree["slug"]:
                rapport.erreur(chemin_clients, f"{entree['slug']} : slug {client['slug']} dans {validate.afficher(dossier / 'client.yaml')}")
            dossiers.append(dossier)
        if "ops" not in slugs:
            if (CHEMIN_OPS / "client.yaml").is_file():
                client = validate.valider_projet(CHEMIN_OPS, rapport)["client"]
                if client is not None and client["slug"] != "ops":
                    print(f"agreger.py: avertissement : projet/ du répertoire courant a pour slug {client['slug']}, projet ops ignoré", file=sys.stderr)
                else:
                    dossiers.append(CHEMIN_OPS)
            else:
                print("agreger.py: avertissement : projet/ absent du répertoire courant, projet ops ignoré", file=sys.stderr)
    if rapport.nb_erreurs:
        for niveau, chemin, message in rapport.messages:
            if niveau == "ERREUR":
                print(f"ERREUR {chemin}: {message}", file=sys.stderr)
        raise ErreurDonnees(f"{validate.pluriel(rapport.nb_erreurs, 'erreur')} de validation, agrégation interrompue")
    return dossiers


def statuts_registre(chemin_clients: Path) -> dict[str, str]:
    registre = contrat.charger_yaml(chemin_clients)
    return {entree["slug"]: entree["statut"] for entree in registre["clients"] if entree["actif"]}


def derniere_synthese(dossier: Path) -> dict | None:
    """Date, titre, fichier et résumé exécutif de la synthèse la plus récente."""
    fichiers = [f for f in (dossier / "syntheses").glob("*.md") if contrat.RE_FICHIER_DATE_SUJET.match(f.name)]
    if not fichiers:
        return None
    fichier = max(fichiers, key=lambda f: f.name)
    entete, corps, premiere = contrat.separer_entete(fichier.read_text(encoding="utf-8"))
    titre = next((texte for niveau, texte, _ in contrat.titres(corps, premiere) if niveau == 1), fichier.stem)
    liste_titres = contrat.titres(corps, premiere)
    debut = next((numero for niveau, texte, numero in liste_titres if niveau == 2 and texte == "Résumé exécutif"), None)
    resume: list[str] = []
    if debut is not None:
        fin = next((numero for niveau, _, numero in liste_titres if numero > debut and niveau <= 2), None)
        for numero, ligne, dans_code in contrat.lignes_utiles(corps, premiere):
            if numero <= debut or (fin is not None and numero >= fin):
                continue
            if not dans_code and ligne.strip() and not any(numero == n for _, _, n in liste_titres):
                resume.append(ligne.strip())
    return {
        "date": (entete or {}).get("date") or fichier.name[:10],
        "titre": titre,
        "fichier": f"syntheses/{fichier.name}",
        "resume": " ".join(resume),
    }


RE_LOT = re.compile(r"^- \*\*Lot ([0-9]+)\*\* : (.+)$")


def lots_du_cadrage(dossier: Path) -> dict[int, dict]:
    """Titre et but de chaque lot, lus dans la section Découpage en lots de cadrage.md.

    Une puce « - **Lot N** : titre. But et précisions. » donne le titre, première phrase,
    et la description, le reste ; les commentaires HTML sont ignorés.
    """
    chemin = dossier / "cadrage.md"
    if not chemin.is_file():
        return {}
    texte = chemin.read_text(encoding="utf-8")
    liste = contrat.titres(texte)
    debut = next((numero for niveau, titre, numero in liste if niveau == 2 and titre == "Découpage en lots"), None)
    if debut is None:
        return {}
    fin = next((numero for niveau, _, numero in liste if numero > debut and niveau <= 2), None)
    resultat: dict[int, dict] = {}
    for numero, ligne, dans_code in contrat.lignes_utiles(texte):
        if dans_code or numero <= debut or (fin is not None and numero >= fin):
            continue
        correspondance = RE_LOT.match(ligne.strip())
        if correspondance:
            titre, _, reste = correspondance.group(2).strip().partition(". ")
            titre = titre.strip().rstrip(".")
            resultat[int(correspondance.group(1))] = {"titre": titre[:1].upper() + titre[1:], "description": reste.strip()}
    return resultat


def lire_projet(dossier: Path) -> dict:
    return {
        "lots_cadrage": lots_du_cadrage(dossier),
        "client": contrat.lire_client(dossier),
        "items": contrat.lire_items(dossier),
        "actions": contrat.lire_actions(dossier),
        "temps": contrat.lire_temps(dossier),
        "synthese": derniere_synthese(dossier),
    }


# ---------------------------------------------------------------------------
# Calculs communs


def heures(minutes: float) -> float:
    return round(minutes / 60, 2)


def date(texte: str) -> dt.date:
    return dt.date.fromisoformat(texte)


def visible(item: dict, audience: str) -> bool:
    """Section 10 : niveau minimal de l'item et exclusion des items à valider."""
    if audience == "interne":
        return True
    if item["a_valider"]:
        return False
    return item["audience"] == "client" or (audience == "commercial" and item["audience"] == "commercial")


def compte_avancement(item: dict) -> bool:
    """Item compté dans l'avancement : hors abandonne et hors a_valider, toutes audiences confondues."""
    return item["statut"] != "abandonne" and not item["a_valider"]


def externes(item: dict) -> list[str]:
    return [d.removeprefix("externe: ").strip() for d in item["dependances"] if d.startswith("externe: ")]


def ecart(reel: float, estime: float) -> int | None:
    """Écart du réel à l'estimé en pourcentage entier, positif en cas de dépassement."""
    return None if not estime else round((reel / estime - 1) * 100)


def depasse(reel: float, estime: float) -> bool:
    return estime > 0 and reel > estime * (1 + SEUIL_DEPASSEMENT)


class Calculs:
    """Indicateurs d'un projet, tous niveaux confondus ; le filtrage se fait à la composition."""

    def __init__(self, projet: dict, aujourd_hui: dt.date) -> None:
        self.client = projet["client"]
        self.items = projet["items"]
        self.actions = projet["actions"]
        self.temps = projet["temps"]
        self.synthese = projet["synthese"]
        self.lots_cadrage = projet.get("lots_cadrage") or {}
        self.aujourd_hui = aujourd_hui
        self.lundi = aujourd_hui - dt.timedelta(days=aujourd_hui.weekday())
        self.minutes_item: dict[str, int] = {}
        for ligne in self.temps:
            if ligne["item"] is not None:
                self.minutes_item[ligne["item"]] = self.minutes_item.get(ligne["item"], 0) + ligne["minutes"]
        # Des items développés sans aucune ligne de temps : le temps n'a pas été noté, ce n'est pas zéro.
        self.temps_journalise = bool(self.temps) or not any(i["statut"] in DEVELOPPES for i in self.items)
        # Champ proposé au contrat, absent tant que le contrat ne l'a pas adopté.
        self.suivi_ia = any("teste_ia" in i for i in self.items)

    @property
    def slug(self) -> str:
        return self.client["slug"]

    def heures_item(self, item: dict) -> float | None:
        return heures(self.minutes_item.get(item["id"], 0)) if self.temps_journalise else None

    def lots(self, audience: str) -> list[dict]:
        resultat = []
        for lot in sorted({item["lot"] for item in self.items}):
            du_lot = [item for item in self.items if item["lot"] == lot]
            if not any(visible(item, audience) for item in du_lot):
                continue
            comptes = [item for item in du_lot if compte_avancement(item)]
            faits = sum(1 for item in comptes if item["statut"] == "fait")
            cadrage = self.lots_cadrage.get(lot, {})
            entree: dict[str, Any] = {
                "lot": lot,
                "titre": cadrage.get("titre"),
                "description": cadrage.get("description"),
                "pourcentage": (faits * 100) // len(comptes) if comptes else None,
            }
            if audience == "interne":
                # En interne, tout item hors abandonne compte : à valider ne filtre plus rien, décision de Théo du 2026-10-16.
                engages = [item for item in du_lot if item["statut"] != "abandonne"]
                estime = sum(item["estimation_h"] for item in engages)
                reel = heures(sum(self.minutes_item.get(item["id"], 0) for item in du_lot)) if self.temps_journalise else None
                entree |= {
                    "nb_items": len(engages),
                    "developpe": sum(1 for item in engages if item["statut"] in DEVELOPPES),
                    "teste_ia": sum(1 for item in engages if item.get("teste_ia") or item["statut"] == "fait") if self.suivi_ia else None,
                    "heures_estimees": round(estime, 2),
                    "heures_reelles": reel,
                    "ecart_pct": None if reel is None else ecart(reel, estime),
                    "depassement": reel is not None and depasse(reel, estime),
                }
            resultat.append(entree)
        return resultat

    def items_en_cours_anciens(self, audience: str) -> list[dict]:
        resultat = []
        for item in self.items:
            if item["statut"] == "en_cours" and visible(item, audience):
                jours = (self.aujourd_hui - date(item["maj"])).days
                if jours > JOURS_EN_COURS_MAX:
                    resultat.append({"id": item["id"], "titre": item["titre"], "lot": item["lot"], "maj": item["maj"], "jours": jours})
        return sorted(resultat, key=lambda i: -i["jours"])

    def items_bloques(self) -> list[dict]:
        return [
            {"id": i["id"], "titre": i["titre"], "lot": i["lot"], "statut": i["statut"], "dependances_externes": externes(i)}
            for i in self.items
            if i["statut"] in ("a_faire", "en_cours") and externes(i)
        ]

    def actions_ouvertes(self, priorites: Iterable[str] = ("p1", "p2")) -> list[dict]:
        resultat = []
        for action in self.actions:
            if action["statut"] == "ouverte" and action["priorite"] in priorites:
                resultat.append({
                    "id": action["id"],
                    "titre": action["titre"],
                    "contexte": action["contexte"],
                    "priorite": action["priorite"],
                    "points": action["points"],
                    "echeance": action["echeance"],
                    "en_retard": action["echeance"] is not None and date(action["echeance"]) < self.aujourd_hui,
                })
        return sorted(resultat, key=lambda a: (a["priorite"], a["echeance"] or "9999-99-99", a["id"]))

    def prochaine_echeance(self, audience: str) -> dict | None:
        candidats = []
        if audience == "interne":
            for action in self.actions_ouvertes(("p1", "p2", "p3", "p4")):
                if action["echeance"]:
                    candidats.append({"date": action["echeance"], "libelle": action["titre"], "source": action["id"]})
        mise_en_service = self.client["dates"]["mise_en_service"]
        if mise_en_service and date(mise_en_service) >= self.aujourd_hui:
            candidats.append({"date": mise_en_service, "libelle": "Mise en service", "source": "client.yaml"})
        if not candidats:
            return None
        retenu = min(candidats, key=lambda c: c["date"])
        retenu["en_retard"] = date(retenu["date"]) < self.aujourd_hui
        retenu["dans_jours"] = (date(retenu["date"]) - self.aujourd_hui).days
        return retenu

    def temps_resume(self) -> dict:
        lundi_precedent = self.lundi - dt.timedelta(days=7)
        semaine = [l for l in self.temps if self.lundi <= date(l["date"]) <= self.lundi + dt.timedelta(days=6)]
        precedente = [l for l in self.temps if lundi_precedent <= date(l["date"]) < self.lundi]
        return {
            "semaine_h": heures(sum(l["minutes"] for l in semaine)),
            "semaine_theo_h": heures(sum(l["minutes"] for l in semaine if l["source"] == "theo")),
            "semaine_agents_h": heures(sum(l["minutes"] for l in semaine if l["source"] == "claude-code")),
            "semaine_precedente_h": heures(sum(l["minutes"] for l in precedente)),
            "total_h": heures(sum(l["minutes"] for l in self.temps)),
            "hors_item_h": heures(sum(l["minutes"] for l in self.temps if l["item"] is None)),
            "a_relire_h": heures(sum(l["minutes"] for l in self.temps if not l["valide"])),
            "journalise": self.temps_journalise,
        }

    def montant_signe(self) -> float:
        montants = self.client["montants_ht"]
        return round(montants["build_signe"] + montants["options_signees"], 2)


# ---------------------------------------------------------------------------
# Composition par audience : listes blanches explicites, section 10


def items_vus(calculs: Calculs, audience: str) -> list[dict]:
    resultat = []
    for item in calculs.items:
        if not visible(item, audience):
            continue
        entree = {k: item[k] for k in ("id", "titre", "lot", "statut", "priorite", "maj")}
        if audience in ("interne", "commercial"):
            entree["module"] = item["module"]
        if audience == "interne":
            entree |= {
                "taille": item["taille"],
                "estimation_h": item["estimation_h"],
                "heures_reelles": calculs.heures_item(item),
                "audience": item["audience"],
                "dependances_externes": externes(item),
            }
        resultat.append(entree)
    return sorted(resultat, key=lambda i: (i["lot"], i["id"]))


def projet_client(calculs: Calculs) -> dict:
    liens = calculs.client["liens"]
    return {
        "slug": calculs.slug,
        "nom": calculs.client["nom"],
        "statut": calculs.client["statut"],
        "liens": {k: liens[k] for k in ("demo", "prod", "docs_client")},
        "lots": calculs.lots("client"),
        "items": items_vus(calculs, "client"),
    }


def projet_commercial(calculs: Calculs) -> dict:
    client = calculs.client
    liens = client["liens"]
    return {
        "slug": calculs.slug,
        "nom": client["nom"],
        "type": "client",
        "statut": client["statut"],
        "apporteur": client["apporteur"],
        "dates": dict(client["dates"]),
        "prochaine_echeance": calculs.prochaine_echeance("commercial"),
        "montants_ht": dict(client["montants_ht"]),
        "montant_signe_ht": calculs.montant_signe(),
        "devis_saisi": bool(client["devis"]),
        "devis": [{k: d[k] for k in ("objet", "montant_ht", "statut")} for d in client["devis"]],
        "liens": {k: liens[k] for k in ("demo", "prod", "docs_client", "docs_commercial")},
        "lots": calculs.lots("commercial"),
        "items_en_cours_anciens": calculs.items_en_cours_anciens("commercial"),
        "derniere_synthese": calculs.synthese,
        "items": items_vus(calculs, "commercial"),
    }


def projet_interne(calculs: Calculs, interne: bool) -> dict:
    client = calculs.client
    resultat = projet_commercial(calculs)
    resultat |= {
        "type": "interne" if interne else "client",
        "prochaine_echeance": calculs.prochaine_echeance("interne"),
        "liens": dict(client["liens"]),
        "lots": calculs.lots("interne"),
        "items_en_cours_anciens": calculs.items_en_cours_anciens("interne"),
        "items_bloques": calculs.items_bloques(),
        "devis_a_envoyer": [{k: d[k] for k in ("objet", "montant_ht")} for d in client["devis"] if d["statut"] == "brouillon"],
        "actions": calculs.actions_ouvertes(),
        "temps": calculs.temps_resume(),
        "todoist": dict(client["todoist"]),
        "items": items_vus(calculs, "interne"),
    }
    resultat["compteurs"] = {"devis_a_envoyer": len(resultat["devis_a_envoyer"])}
    return resultat


def cle_tri(projet: dict) -> tuple:
    statut = projet["statut"]
    return (projet.get("type") == "interne", ORDRE_STATUTS.index(statut), projet["nom"].lower())


# ---------------------------------------------------------------------------
# Vues globales


def portefeuille(projets: list[dict]) -> list[dict]:
    resultat = []
    for statut in ORDRE_STATUTS:
        du_statut = [p for p in projets if p["statut"] == statut and p["type"] == "client"]
        if du_statut:
            resultat.append({
                "statut": statut,
                "nb_clients": len(du_statut),
                "montant_signe_ht": round(sum(p["montant_signe_ht"] for p in du_statut), 2),
            })
    return resultat


def totaux(projets: list[dict]) -> dict:
    return {
        "total_signe_ht": round(sum(p["montant_signe_ht"] for p in projets), 2),
        "run_annuel_ht": round(sum(p["montants_ht"]["run_annuel"] for p in projets), 2),
        "nb_clients": sum(1 for p in projets if p["type"] == "client"),
        "nb_devis_non_saisis": sum(1 for p in projets if p["type"] == "client" and not p["devis_saisi"] and not p["montant_signe_ht"]),
    }


def alerte(gravite: str, type_: str, projet: dict, cible: str | None, message: str) -> dict:
    return {"gravite": gravite, "type": type_, "slug": projet["slug"], "nom": projet["nom"], "cible": cible, "message": message}


def alertes_en_cours(projet: dict) -> list[dict]:
    return [
        alerte("moyenne", "en_cours_ancien", projet, i["id"], f"{i['id']} {i['titre']} : en cours depuis {i['jours']} jours, dernière mise à jour le {i['maj']}")
        for i in projet["items_en_cours_anciens"]
    ]


def alertes_internes(projet: dict, statut_registre: str | None) -> list[dict]:
    resultat = []
    for lot in projet["lots"]:
        if lot["depassement"]:
            resultat.append(alerte(
                "haute", "depassement_lot", projet, f"lot {lot['lot']}",
                f"Lot {lot['lot']} : {lot['heures_reelles']} h réelles pour {lot['heures_estimees']} h estimées, +{lot['ecart_pct']} %",
            ))
    for item in projet["items"]:
        if item["statut"] != "abandonne" and item["heures_reelles"] is not None and depasse(item["heures_reelles"], item["estimation_h"]):
            resultat.append(alerte(
                "haute", "depassement_item", projet, item["id"],
                f"{item['id']} {item['titre']} : {item['heures_reelles']} h pour {item['estimation_h']} h estimées, "
                f"+{ecart(item['heures_reelles'], item['estimation_h'])} %",
            ))
    for item in projet["items_bloques"]:
        resultat.append(alerte(
            "moyenne", "bloque_externe", projet, item["id"],
            f"{item['id']} {item['titre']} : attend {' ; '.join(item['dependances_externes'])}",
        ))
    resultat.extend(alertes_en_cours(projet))
    if statut_registre is not None and statut_registre != projet["statut"]:
        resultat.append(alerte(
            "basse", "registre_desynchronise", projet, "clients.yaml",
            f"statut {statut_registre} au registre, {projet['statut']} dans client.yaml qui fait foi",
        ))
    return resultat


def trier_alertes(alertes: list[dict]) -> list[dict]:
    return sorted(alertes, key=lambda a: (ORDRE_GRAVITE[a["gravite"]], a["type"], a["slug"], a["cible"] or ""))


# ---------------------------------------------------------------------------
# Agrégation


def maintenant_paris() -> dt.datetime:
    return dt.datetime.now(ZoneInfo(contrat.FUSEAU)).replace(microsecond=0)


def agreger(chemin_clients: Path, racine: Path, audience: str, maintenant: dt.datetime | None = None) -> dict:
    if audience not in AUDIENCES:
        raise ValueError(f"audience inconnue : {audience}")
    maintenant = maintenant or maintenant_paris()
    aujourd_hui = maintenant.date()
    dossiers = charger_projets(chemin_clients, racine)
    registre = statuts_registre(chemin_clients)
    tous = [Calculs(lire_projet(dossier), aujourd_hui) for dossier in dossiers]
    # skeam-ops est un projet interne : il n'apparaît que dans la vue interne.
    calculs = [c for c in tous if audience == "interne" or c.slug != "ops"]

    resultat: dict[str, Any] = {"audience": audience, "genere_le": maintenant.isoformat()}
    if audience == "client":
        resultat["projets"] = sorted((projet_client(c) for c in calculs), key=lambda p: p["nom"].lower())
        return resultat

    lundi = aujourd_hui - dt.timedelta(days=aujourd_hui.weekday())
    resultat |= {"date_ref": aujourd_hui.isoformat()}
    if audience == "commercial":
        projets = sorted((projet_commercial(c) for c in calculs), key=cle_tri)
        resultat["global"] = totaux(projets) | {
            "portefeuille": portefeuille(projets),
            "alertes": trier_alertes([a for p in projets for a in alertes_en_cours(p)]),
        }
        resultat["projets"] = projets
        return resultat

    projets = sorted((projet_interne(c, c.slug == "ops") for c in calculs), key=cle_tri)
    charge = sorted(
        ({"slug": p["slug"], "nom": p["nom"], "heures": p["temps"]["semaine_h"], "heures_theo": p["temps"]["semaine_theo_h"],
          "heures_agents": p["temps"]["semaine_agents_h"], "heures_semaine_precedente": p["temps"]["semaine_precedente_h"],
          "journalise": p["temps"]["journalise"]}
         for p in projets),
        key=lambda c: (-c["heures"], c["nom"].lower()),
    )
    resultat |= {
        "semaine": {"debut": lundi.isoformat(), "fin": (lundi + dt.timedelta(days=6)).isoformat()},
        "global": totaux(projets) | {
            "portefeuille": portefeuille(projets),
            "charge_semaine": {
                "total_h": round(sum(c["heures"] for c in charge), 2),
                "total_theo_h": round(sum(c["heures_theo"] for c in charge), 2),
                "total_agents_h": round(sum(c["heures_agents"] for c in charge), 2),
                "par_projet": charge,
            },
            "alertes": trier_alertes([a for p in projets for a in alertes_internes(p, registre.get(p["slug"]))]),
        },
        "projets": projets,
    }
    return resultat


def cles(donnees: Any) -> Iterable[str]:
    if isinstance(donnees, dict):
        for cle, valeur in donnees.items():
            yield cle
            yield from cles(valeur)
    elif isinstance(donnees, list):
        for valeur in donnees:
            yield from cles(valeur)


def verifier_filtrage(donnees: dict) -> None:
    """Contrôle de sûreté : aucune clé interne dans une vue commercial ou client."""
    if donnees["audience"] == "interne":
        return
    contenu = {k: v for k, v in donnees.items() if k not in ("audience", "genere_le")}
    fuites = sorted({c for c in cles(contenu) if c in CLES_INTERNES or c.startswith("heures")})
    if fuites:
        raise ErreurDonnees(f"clés internes dans la vue {donnees['audience']} : {', '.join(fuites)}")
    if any(p.get("slug") == "ops" for p in donnees["projets"]):
        raise ErreurDonnees(f"projet interne ops dans la vue {donnees['audience']}")
    if donnees["audience"] == "client" and any(c in ("apporteur", "montants_ht", "devis", "dates", "global") for c in cles(contenu)):
        raise ErreurDonnees("données commerciales dans la vue client")


def ecrire(donnees: dict, sortie: Path) -> None:
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(json.dumps(donnees, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Agrège les projets actifs en une vue JSON filtrée par audience.")
    parser.add_argument("--clients", type=Path, required=True, help="registre clients.yaml")
    parser.add_argument("--racine", type=Path, required=True, help="dossier des clones des dépôts clients")
    parser.add_argument("--audience", required=True, choices=AUDIENCES, help="niveau de la vue, CONTRAT.md section 10")
    parser.add_argument("--sortie", type=Path, required=True, help="fichier JSON à écrire, en principe dashboard/out/<audience>.json")
    args = parser.parse_args(argv)
    for chemin in (args.clients, args.racine):
        if not chemin.exists():
            print(f"agreger.py: erreur : {chemin} introuvable", file=sys.stderr)
            return 2
    try:
        donnees = agreger(args.clients, args.racine, args.audience)
        verifier_filtrage(donnees)
    except (ErreurDonnees, contrat.ErreurLecture) as exc:
        print(f"agreger.py: erreur : {exc}", file=sys.stderr)
        return 1
    ecrire(donnees, args.sortie)
    print(f"Vue {args.audience} : {validate.pluriel(len(donnees['projets']), 'projet')}, écrite dans {args.sortie}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
