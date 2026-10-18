"""Bibliothèque commune de lecture des formats définis dans CONTRAT.md.

Tout script de skeam-ops qui lit un dossier projet passe par ces fonctions pour
interpréter les fichiers exactement comme le validateur :

- YAML lu en sous-ensemble strict : dates gardées en chaînes AAAA-MM-JJ,
  booléens limités à true et false, entiers et décimaux en notation simple,
  clés dupliquées refusées ;
- JSON Lines avec clés dupliquées refusées ;
- Markdown réduit à sa projection : en-tête YAML, titres ATX hors blocs de code
  et hors commentaires HTML.

Usage depuis un autre dossier du dépôt :

    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
    import contrat

Python 3.11. Dépendances : requirements.txt.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

RACINE_OPS = Path(__file__).resolve().parent.parent
DOSSIER_SCHEMAS = RACINE_OPS / "schemas"
FUSEAU = "Europe/Paris"

# Noms de fichiers et de dossiers imposés dans un dossier projet.
RE_FICHIER_DATE_SUJET = re.compile(r"^(?P<date>[0-9]{4}-[0-9]{2}-[0-9]{2})-(?P<sujet>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$")
RE_FICHIER_TEMPS = re.compile(r"^(?P<mois>[0-9]{4}-[0-9]{2})-(?P<agent>[a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.jsonl$")
RE_FICHIER_BACKLOG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*\.yaml$")
RE_FICHIER_CHIFFRAGE = re.compile(r"^chiffrage-(?P<date>[0-9]{4}-[0-9]{2}-[0-9]{2})\.(?P<ext>md|json)$")
RE_ID_ITEM = re.compile(r"^(?P<prefixe>[A-Z][A-Z0-9]{1,11})-(?P<numero>[0-9]{3})$")
RE_ID_ACTION = re.compile(r"^ACT-(?P<prefixe>[A-Z][A-Z0-9]{1,11})-(?P<numero>[0-9]{3})$")
# Relevé de consommation des agents, hors de projet/ : <racine du dépôt>/.skeam/conso/, section 15.
RE_FICHIER_CONSO = re.compile(r"^(?P<date>[0-9]{4}-[0-9]{2}-[0-9]{2})-(?P<session>[A-Za-z0-9_-]{8,64})\.jsonl$")
# Seuls mots admis dans libelle et phase d'une ligne de consommation, section 15.1 ; même liste que
# MOTS_LIBELLE de templates/depot-client/.skeam/conso.py.
MOTS_LIBELLE_CONSO = (
    "analyse", "bilan", "cadrage", "chantiers", "chiffrage", "collecte", "conception", "contrôle", "correction",
    "documentation", "exploration", "facturation", "intégration", "livraison", "migration", "outils", "planification",
    "préparation", "réalisation", "recherche", "rédaction", "relecture", "revue", "synthèse", "terrain", "test", "tests",
    "vérification")
_ID_CONSO = r"[A-Z][A-Z0-9]{1,11}-[0-9]{3}"
RE_LIBELLE_CONSO = re.compile(rf"^(?:(?P<mot>[a-zàâçéèêîôû]+)(?::(?P<ids>{_ID_CONSO}(?: {_ID_CONSO})*))?|(?P<seuls>{_ID_CONSO}(?: {_ID_CONSO})*))$")


# ---------------------------------------------------------------------------
# YAML strict


class ErreurLecture(Exception):
    """Fichier illisible : syntaxe YAML ou JSON invalide, clé dupliquée."""


class _ChargeurYaml(yaml.SafeLoader):
    """SafeLoader restreint, proche du schéma core de YAML 1.2."""


_TAGS_RETIRES = {
    "tag:yaml.org,2002:bool",
    "tag:yaml.org,2002:int",
    "tag:yaml.org,2002:float",
    "tag:yaml.org,2002:timestamp",
}
_ChargeurYaml.yaml_implicit_resolvers = {
    premier: [(tag, rx) for tag, rx in resolveurs if tag not in _TAGS_RETIRES]
    for premier, resolveurs in yaml.SafeLoader.yaml_implicit_resolvers.items()
}
_ChargeurYaml.add_implicit_resolver(
    "tag:yaml.org,2002:bool", re.compile(r"^(?:true|false)$"), list("tf")
)
_ChargeurYaml.add_implicit_resolver(
    "tag:yaml.org,2002:int", re.compile(r"^[-+]?(?:0|[1-9][0-9]*)$"), list("-+0123456789")
)
_ChargeurYaml.add_implicit_resolver(
    "tag:yaml.org,2002:float", re.compile(r"^[-+]?(?:0|[1-9][0-9]*)\.[0-9]+$"), list("-+0123456789")
)


def _mapping_sans_doublon(chargeur: yaml.SafeLoader, noeud: yaml.MappingNode, deep: bool = False) -> dict:
    chargeur.flatten_mapping(noeud)
    resultat: dict = {}
    for noeud_cle, noeud_valeur in noeud.value:
        cle = chargeur.construct_object(noeud_cle, deep=deep)
        if cle in resultat:
            raise ErreurLecture(f"clé dupliquée '{cle}' ligne {noeud_cle.start_mark.line + 1}")
        resultat[cle] = chargeur.construct_object(noeud_valeur, deep=deep)
    return resultat


_ChargeurYaml.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapping_sans_doublon)


def charger_yaml_texte(texte: str) -> Any:
    try:
        return yaml.load(texte, Loader=_ChargeurYaml)  # noqa: S506, chargeur dérivé de SafeLoader
    except yaml.YAMLError as exc:
        raise ErreurLecture(f"YAML invalide : {exc}") from exc


def charger_yaml(chemin: Path | str) -> Any:
    return charger_yaml_texte(Path(chemin).read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# JSON et JSON Lines


def _objet_sans_doublon(paires: list[tuple[str, Any]]) -> dict:
    resultat: dict = {}
    for cle, valeur in paires:
        if cle in resultat:
            raise ErreurLecture(f"clé dupliquée '{cle}'")
        resultat[cle] = valeur
    return resultat


def _refuser_constante(nom: str) -> Any:
    raise ErreurLecture(f"valeur JSON non standard {nom}")


def charger_json_texte(texte: str) -> Any:
    try:
        return json.loads(texte, object_pairs_hook=_objet_sans_doublon, parse_constant=_refuser_constante)
    except json.JSONDecodeError as exc:
        raise ErreurLecture(f"JSON invalide : {exc}") from exc


def charger_json(chemin: Path | str) -> Any:
    return charger_json_texte(Path(chemin).read_text(encoding="utf-8"))


def lire_jsonl(chemin: Path | str) -> list[tuple[int, Any]]:
    """Renvoie la liste (numéro de ligne, objet). Une ligne vide est une erreur."""
    resultat = []
    for numero, ligne in enumerate(Path(chemin).read_text(encoding="utf-8").splitlines(), start=1):
        if not ligne.strip():
            raise ErreurLecture(f"ligne {numero} vide")
        try:
            resultat.append((numero, charger_json_texte(ligne)))
        except ErreurLecture as exc:
            raise ErreurLecture(f"ligne {numero} : {exc}") from exc
    return resultat


# ---------------------------------------------------------------------------
# Markdown

_RE_TITRE = re.compile(r"^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$")
_RE_COMMENTAIRE = re.compile(r"<!--.*?-->", re.S)


def separer_entete(texte: str) -> tuple[dict | None, str, int]:
    """Sépare l'en-tête YAML délimité par deux lignes --- du corps.

    Renvoie (entete ou None, corps, numéro de la première ligne du corps).
    """
    lignes = texte.split("\n")
    if not lignes or lignes[0].rstrip("\r") != "---":
        return None, texte, 1
    for index in range(1, len(lignes)):
        if lignes[index].rstrip("\r") == "---":
            entete = charger_yaml_texte("\n".join(lignes[1:index]))
            if entete is None:
                entete = {}
            if not isinstance(entete, dict):
                raise ErreurLecture("l'en-tête YAML doit être un dictionnaire")
            return entete, "\n".join(lignes[index + 1:]), index + 2
    raise ErreurLecture("en-tête YAML ouvert par --- mais jamais refermé")


def masquer_commentaires(texte: str) -> str:
    """Remplace les commentaires HTML par des blancs en conservant les sauts de ligne."""
    return _RE_COMMENTAIRE.sub(lambda m: re.sub(r"[^\n]", " ", m.group(0)), texte)


def lignes_utiles(texte: str, premiere_ligne: int = 1) -> list[tuple[int, str, bool]]:
    """Renvoie (numéro, ligne, dans_un_bloc_de_code) après masquage des commentaires HTML."""
    resultat = []
    dans_code = False
    marqueur = ""
    for decalage, ligne in enumerate(masquer_commentaires(texte).split("\n")):
        numero = premiere_ligne + decalage
        nue = ligne.strip()
        if not dans_code and (nue.startswith("```") or nue.startswith("~~~")):
            dans_code = True
            marqueur = nue[:3]
            resultat.append((numero, ligne, True))
            continue
        if dans_code:
            if nue.startswith(marqueur):
                dans_code = False
            resultat.append((numero, ligne, True))
            continue
        resultat.append((numero, ligne, False))
    return resultat


def titres(texte: str, premiere_ligne: int = 1) -> list[tuple[int, str, int]]:
    """Renvoie la liste (niveau, texte, numéro de ligne) des titres ATX."""
    resultat = []
    for numero, ligne, dans_code in lignes_utiles(texte, premiere_ligne):
        if dans_code:
            continue
        correspondance = _RE_TITRE.match(ligne)
        if correspondance:
            resultat.append((len(correspondance.group(1)), correspondance.group(2), numero))
    return resultat


# ---------------------------------------------------------------------------
# Schémas


@lru_cache(maxsize=None)
def _registre() -> Registry:
    ressources = []
    for chemin in sorted(DOSSIER_SCHEMAS.glob("*.schema.json")):
        contenu = json.loads(chemin.read_text(encoding="utf-8"))
        ressources.append((contenu["$id"], Resource.from_contents(contenu)))
    return Registry().with_resources(ressources)


@lru_cache(maxsize=None)
def charger_schema(nom: str) -> dict:
    """nom sans extension, par exemple 'client' pour schemas/client.schema.json."""
    return json.loads((DOSSIER_SCHEMAS / f"{nom}.schema.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def validateur(nom: str) -> Draft202012Validator:
    return Draft202012Validator(charger_schema(nom), registry=_registre(), format_checker=FormatChecker())


# ---------------------------------------------------------------------------
# Conventions


def prefixe(slug: str) -> str:
    """Préfixe des ids d'un projet : le slug en majuscules."""
    return slug.upper()


def chemin_clone(racine: Path | str, depot: str) -> Path:
    """Emplacement du clone d'un dépôt : <racine>/<nom du dépôt sans propriétaire>."""
    return Path(racine) / depot.split("/", 1)[1]


def minutes_entre(debut: str, fin: str) -> int:
    """Durée en minutes de debut à fin, HH:MM ; une fin avant le début passe minuit."""
    h1, m1 = (int(x) for x in debut.split(":"))
    h2, m2 = (int(x) for x in fin.split(":"))
    duree = (h2 * 60 + m2) - (h1 * 60 + m1)
    return duree if duree > 0 else duree + 1440


# ---------------------------------------------------------------------------
# Lecture d'un dossier projet, sans validation : lancer validate.py avant.


def lire_client(chemin_projet: Path | str) -> dict:
    return charger_yaml(Path(chemin_projet) / "client.yaml")


def lire_items(chemin_projet: Path | str) -> list[dict]:
    """Tous les items de backlog/*.yaml, fichiers pris par ordre alphabétique."""
    items: list[dict] = []
    for fichier in sorted((Path(chemin_projet) / "backlog").glob("*.yaml")):
        contenu = charger_yaml(fichier) or {}
        items.extend(contenu.get("items") or [])
    return items


def lire_actions(chemin_projet: Path | str) -> list[dict]:
    contenu = charger_yaml(Path(chemin_projet) / "actions.yaml") or {}
    return list(contenu.get("items") or [])


def lire_temps(chemin_projet: Path | str) -> list[dict]:
    """Toutes les lignes de temps/*.jsonl, fichiers pris par ordre alphabétique."""
    lignes: list[dict] = []
    for fichier in sorted((Path(chemin_projet) / "temps").glob("*.jsonl")):
        lignes.extend(objet for _, objet in lire_jsonl(fichier))
    return lignes


def lire_conso(fichier: Path | str) -> list[dict]:
    """Lignes d'un fichier .skeam/conso/AAAA-MM-JJ-<session>.jsonl, sans validation."""
    return [objet for _, objet in lire_jsonl(fichier)]
