"""Méthode commune du chantier catalogue.

Lecture et validation du catalogue et des tarifs, heures de référence, confiance
et prix conseillé d'un module, arrondis et formats d'affichage. Utilisé par
chiffrer.py, calibrer.py et temps.py. La méthode est décrite dans
catalogue/README.md, section Méthode.

Python 3.11. Dépendances : requirements.txt à la racine de skeam-ops.
"""

from __future__ import annotations

import math
import re
import statistics
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

RACINE_OPS = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RACINE_OPS / "scripts"))

import contrat  # noqa: E402
import validate  # noqa: E402

DOSSIER_CATALOGUE = RACINE_OPS / "catalogue"
TAILLES = ["XS", "S", "M", "L", "XL"]

# Constantes de méthode. tarifs.yaml n'a pas de clé pour elles : voir PROPOSITIONS-CONTRAT.md.
ARRONDI_HT = 50                 # prix arrondis au multiple de 50 euros supérieur
TVA = 0.2                       # taux de TVA des lignes de devis
SEUIL_COUVERTURE = 0.7           # en dessous, le chiffrage signale une couverture faible du scénario max
FACTEUR_MIN_HORS_CATALOGUE = 0.8
FACTEUR_MAX_HORS_CATALOGUE = 1.5
OBSERVATIONS_PLEINES = 3        # à partir de 3 observations, la médiane remplace le milieu de fourchette
SEUILS_CONFIANCE = [            # confiance, observations minimales, part minimale dans la fourchette
    ("forte", 3, 0.8),
    ("moyenne", 1, 0.6),
]


class ErreurDonnees(Exception):
    """Erreur de données : le script s'arrête avec le code 1."""


def maintenant_paris() -> datetime:
    return datetime.now(ZoneInfo(contrat.FUSEAU))


def aujourdhui_paris() -> str:
    return maintenant_paris().date().isoformat()


# ---------------------------------------------------------------------------
# Catalogue et tarifs


def verifier_catalogue(dossier: Path) -> validate.Rapport:
    """Valide modules.yaml et tarifs.yaml avec le validateur commun."""
    rapport = validate.Rapport()
    validate.valider_catalogue(Path(dossier), rapport, {})
    return rapport


def charger_catalogue(dossier: Path) -> tuple[dict[str, dict], dict]:
    """Renvoie les modules par code, dans l'ordre du fichier, et les tarifs. Lance ErreurDonnees si invalide."""
    rapport = verifier_catalogue(dossier)
    if rapport.nb_erreurs:
        raise ErreurDonnees(messages_erreur(rapport))
    modules = contrat.charger_yaml(Path(dossier) / "modules.yaml")["modules"]
    tarifs = contrat.charger_yaml(Path(dossier) / "tarifs.yaml")
    return {m["code"]: m for m in modules}, tarifs


def messages_erreur(rapport: validate.Rapport) -> str:
    return "\n".join(f"ERREUR {chemin}: {message}" for niveau, chemin, message in rapport.messages if niveau == "ERREUR")


def valider_projet(projet: Path, codes_modules: set[str] | None) -> validate.Rapport:
    """Valide un dossier projet ; lance ErreurDonnees s'il est invalide, sinon renvoie le rapport et ses avertissements."""
    rapport = validate.Rapport()
    validate.valider_projet(projet, rapport, codes_modules)
    if rapport.nb_erreurs:
        raise ErreurDonnees(messages_erreur(rapport) + f"\n{validate.afficher(projet)} invalide : corriger puis relancer")
    return rapport


# ---------------------------------------------------------------------------
# Méthode : observations, heures de référence, confiance, prix


def observations_par_client(module: dict) -> dict[str, float]:
    """Heures réelles du module par client, triées par client : somme des mesures de ses items."""
    par_client: dict[str, float] = {}
    for mesure in module["mesures"]:
        par_client[mesure["client"]] = par_client.get(mesure["client"], 0) + mesure["heures"]
    return {client: round(par_client[client], 2) for client in sorted(par_client)}


def observations(module: dict) -> list[float]:
    """Une observation par client : le total de ses heures mesurées sur le module."""
    return list(observations_par_client(module).values())


def milieu(module: dict) -> float:
    return (module["heures_min"] + module["heures_max"]) / 2


def heures_reference(module: dict) -> float:
    """Heures probables du module complet pour un projet.

    Sans observation : milieu de la fourchette. De 1 à 2 observations : moyenne du
    milieu de fourchette et de la médiane des observations. À partir de 3 : médiane
    des observations.
    """
    obs = observations(module)
    if not obs:
        return milieu(module)
    mediane = statistics.median(obs)
    if len(obs) < OBSERVATIONS_PLEINES:
        return (milieu(module) + mediane) / 2
    return mediane


def part_dans_fourchette(module: dict) -> float | None:
    obs = observations(module)
    if not obs:
        return None
    dedans = sum(1 for h in obs if module["heures_min"] <= h <= module["heures_max"])
    return dedans / len(obs)


def confiance_calculee(module: dict) -> str:
    obs = observations(module)
    part = part_dans_fourchette(module)
    for niveau, minimum, part_minimale in SEUILS_CONFIANCE:
        if len(obs) >= minimum and part is not None and part >= part_minimale:
            return niveau
    return "faible"


def arrondi_sup(montant: float, pas: int = ARRONDI_HT) -> int:
    """Multiple de pas supérieur ou égal, insensible aux erreurs d'arrondi flottant."""
    return int(math.ceil(round(montant / pas, 6)) * pas)


def prix_conseille(module: dict, tarifs: dict) -> int:
    marge = tarifs["marge_securite"][module["taille_type"]]
    return arrondi_sup(heures_reference(module) * (1 + marge) * tarifs["taux_horaire_cible"])


def fourchette_suggeree(module: dict) -> tuple[float, float] | None:
    """Fourchette proposée à Théo au vu des observations, ou None sans observation.

    À partir de 3 observations : de la plus basse à la plus haute, arrondies à la
    demi-heure. Avant : la fourchette actuelle élargie aux observations.
    """
    obs = observations(module)
    if not obs:
        return None
    if len(obs) >= OBSERVATIONS_PLEINES:
        bas, haut = min(obs), max(obs)
    else:
        bas, haut = min(module["heures_min"], *obs), max(module["heures_max"], *obs)
    return max(0.5, math.floor(bas * 2) / 2), math.ceil(haut * 2) / 2


# ---------------------------------------------------------------------------
# Formats


def nombre(valeur: float) -> int | float:
    """Arrondi au centième, entier quand il n'y a pas de décimale : 3 et non 3.0."""
    arrondi = round(valeur + 0.0, 2)
    return int(arrondi) if arrondi == int(arrondi) else arrondi


def texte_nombre(valeur: float) -> str:
    """Écriture YAML ou JSON d'un nombre : 3, 2.25."""
    return str(nombre(valeur))


def fr(valeur: float, decimales: int = 0) -> str:
    """1 800,00 : séparateur de milliers espace insécable fine, virgule décimale."""
    texte = f"{valeur:,.{decimales}f}"
    return texte.replace(",", " ").replace(".", ",")


def euros(valeur: float) -> str:
    return f"{fr(valeur, 0)} €"


def court(valeur: float) -> str:
    """Nombre à deux décimales au plus, sans zéro final : 12, 12,5, 2,25."""
    texte = fr(round(valeur, 2), 2)
    return texte.rstrip("0").rstrip(",")


def heures(valeur: float) -> str:
    return f"{court(valeur)} h"


def plage(bas: float, haut: float) -> str:
    return f"{court(bas)} à {court(haut)} h"


def pourcentage(valeur: float) -> str:
    return f"{round(valeur * 100):d} %"


def nettoyer_typo(texte: str) -> str:
    """Retire ce que la règle typographique du contrat, section 2.3, interdit sur un devis."""
    texte = re.sub(r"\s*—\s*", ", ", texte).replace("(", "").replace(")", "")
    return " ".join(texte.split()).replace(" ,", ",")
