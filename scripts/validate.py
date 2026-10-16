"""Valide un ou plusieurs dossiers projet, le registre clients.yaml, le catalogue
et les exemples de CONTRAT.md.

Usage :
    python scripts/validate.py <chemin_projet> [<chemin_projet> ...]
    python scripts/validate.py --clients clients.yaml [--racine <dossier des clones>]
    python scripts/validate.py --catalogue catalogue/
    python scripts/validate.py --contrat CONTRAT.md

Les options se combinent. <chemin_projet> est le dossier projet/ lui-même ; la
racine d'un dépôt qui contient projet/ est aussi acceptée.

Code de sortie : 0 sans erreur, 1 si au moins une erreur, 2 pour un usage
incorrect. Les avertissements ne changent pas le code de sortie.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent))

import contrat  # noqa: E402
from contrat import ErreurLecture  # noqa: E402

FICHIERS_PROJET = ["client.yaml", "fiche.md", "cadrage.md", "decisions.md", "actions.yaml", "CLAUDE-projet.md"]
DOSSIERS_PROJET = ["transcripts", "syntheses", "backlog", "temps", "devis", "design", "interne"]
NOMS_TYPES = {
    "string": "chaîne",
    "number": "nombre",
    "integer": "entier",
    "boolean": "booléen true ou false",
    "null": "null",
    "array": "liste",
    "object": "dictionnaire",
}
TIRET_CADRATIN = "—"
RE_RG = re.compile(r"^- \*\*(RG[0-9]+)\*\* : \S")
RE_RG_APPROX = re.compile(r"^\s*[-*+]\s+\**\s*RG\s*[0-9]+")
RE_REF_RG = re.compile(r"\bRG([0-9]+)\b")
RE_CHAMP_DECISION = re.compile(r"^- \*\*([^*]+)\*\* : \S")
RE_TITRE_DECISION = re.compile(r"^([0-9]{4}-[0-9]{2}-[0-9]{2}) (\S.*)$")


# ---------------------------------------------------------------------------
# Rapport


class Rapport:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str, str]] = []

    def erreur(self, chemin: Any, message: str) -> None:
        self.messages.append(("ERREUR", afficher(chemin), message))

    def avertissement(self, chemin: Any, message: str) -> None:
        self.messages.append(("AVERTISSEMENT", afficher(chemin), message))

    @property
    def nb_erreurs(self) -> int:
        return sum(1 for niveau, _, _ in self.messages if niveau == "ERREUR")

    @property
    def nb_avertissements(self) -> int:
        return sum(1 for niveau, _, _ in self.messages if niveau == "AVERTISSEMENT")

    def imprimer(self) -> None:
        for niveau, chemin, message in self.messages:
            flux = sys.stderr if niveau == "ERREUR" else sys.stdout
            print(f"{niveau} {chemin}: {message}", file=flux)


def afficher(chemin: Any) -> str:
    if isinstance(chemin, Path):
        try:
            return str(chemin.resolve().relative_to(Path.cwd().resolve()))
        except ValueError:
            return str(chemin)
    return str(chemin)


# ---------------------------------------------------------------------------
# Messages de schéma en français


def chemin_json(parties: Iterable[Any]) -> str:
    texte = ""
    for partie in parties:
        texte += f"[{partie}]" if isinstance(partie, int) else (f".{partie}" if texte else str(partie))
    return texte or "racine"


def message_fr(erreur) -> str:
    v = erreur.validator
    instance = erreur.instance
    schema = erreur.schema if isinstance(erreur.schema, dict) else {}
    if v == "required":
        manquant = re.match(r"'(.+)' is a required property", erreur.message)
        return f"champ obligatoire manquant : {manquant.group(1) if manquant else erreur.message}"
    if v == "additionalProperties":
        prevus = set(schema.get("properties", {}))
        en_trop = sorted(k for k in instance if k not in prevus)
        return f"champ non prévu par le contrat : {', '.join(en_trop)}"
    if v == "enum":
        return f"valeur {instance!r} non autorisée ; valeurs possibles : {', '.join(map(str, erreur.validator_value))}"
    if v == "const":
        attendu = erreur.validator_value
        if isinstance(attendu, list) and isinstance(instance, list):
            manquantes = [x for x in attendu if x not in instance]
            en_trop = [x for x in instance if x not in attendu]
            details = []
            if manquantes:
                details.append(f"manquant : {', '.join(manquantes)}")
            if en_trop:
                details.append(f"non prévu : {', '.join(map(str, en_trop))}")
            if not details:
                details.append("ordre incorrect")
            return f"attendu exactement, dans cet ordre : {' | '.join(attendu)} ; {' ; '.join(details)}"
        return f"valeur attendue {attendu!r}, trouvée {instance!r}"
    if v == "type":
        attendus = erreur.validator_value if isinstance(erreur.validator_value, list) else [erreur.validator_value]
        texte = f"type attendu {' ou '.join(NOMS_TYPES.get(t, t) for t in attendus)}, trouvé {instance!r}"
        if "string" in attendus and isinstance(instance, (int, float)) and not isinstance(instance, bool):
            texte += " ; écrire la valeur entre guillemets en YAML"
        if "boolean" in attendus and isinstance(instance, str):
            texte += " ; seuls true et false sont des booléens"
        if "string" in attendus and isinstance(instance, dict):
            texte += " ; en YAML, une valeur qui contient ': ' doit être entre guillemets"
        if "plaud_id" in list(erreur.absolute_path)[-1:]:
            texte += " ; plaud_id est obligatoire si source vaut plaud, null sinon"
        return texte
    if v == "pattern":
        description = schema.get("description")
        texte = f"{instance!r} ne respecte pas le format {erreur.validator_value}"
        return f"{texte} ; {description}" if description else texte
    if v == "format":
        return f"{instance!r} n'est pas une date valide"
    if v in ("minimum", "exclusiveMinimum", "maximum", "exclusiveMaximum"):
        signe = {"minimum": ">=", "exclusiveMinimum": ">", "maximum": "<=", "exclusiveMaximum": "<"}[v]
        return f"{instance!r} doit être {signe} {erreur.validator_value}"
    if v == "minItems":
        return f"la liste doit contenir au moins {erreur.validator_value} élément"
    if v == "minLength":
        return "texte vide interdit"
    if v == "uniqueItems":
        return "doublon dans la liste"
    if v in ("anyOf", "oneOf"):
        sous = [c for c in erreur.context if not (c.validator == "type" and c.validator_value == "null")]
        if len(sous) == 1:
            return message_fr(sous[0])
        textes = []
        for c in sous:
            texte = message_fr(c)
            if texte not in textes:
                textes.append(texte)
        return f"valeur {instance!r} invalide : " + " ; ou ".join(textes)
    return erreur.message


def valider_schema(rapport: Rapport, nom_schema: str, donnees: Any, chemin: Any, contexte: str = "") -> list:
    """Signale chaque écart au schéma et renvoie la liste des erreurs, vide si conforme."""
    erreurs = sorted(contrat.validateur(nom_schema).iter_errors(donnees), key=lambda e: [str(p) for p in e.absolute_path])
    for erreur in erreurs:
        position = chemin_json(erreur.absolute_path)
        prefixe = f"{contexte} " if contexte else ""
        rapport.erreur(chemin, f"{prefixe}{position} : {message_fr(erreur)}")
    return erreurs


def entrees_valides(erreurs: list, contenu: Any) -> list[dict] | None:
    """Éléments de contenu['items'] sans erreur de schéma, ou None si la structure du fichier est fausse."""
    invalides = set()
    for erreur in erreurs:
        chemin = list(erreur.absolute_path)
        if len(chemin) < 2 or chemin[0] != "items":
            return None
        invalides.add(chemin[1])
    return [entree for index, entree in enumerate(contenu["items"]) if index not in invalides]


def pluriel(nombre: int, mot: str) -> str:
    return f"{nombre} {mot}{'s' if nombre > 1 else ''}"


ECHEC = object()


def charger(rapport: Rapport, chemin: Path, lecteur) -> Any:
    """Lit un fichier ; renvoie ECHEC après avoir signalé une erreur de lecture."""
    try:
        return lecteur(chemin)
    except ErreurLecture as exc:
        rapport.erreur(chemin, str(exc))
    except UnicodeDecodeError:
        rapport.erreur(chemin, "fichier non encodé en UTF-8")
    return ECHEC


# ---------------------------------------------------------------------------
# Typographie des documents destinés au client


def problemes_typo(texte: str) -> list[str]:
    problemes = []
    if TIRET_CADRATIN in texte:
        problemes.append("tiret cadratin interdit")
    if "(" in texte or ")" in texte:
        problemes.append("parenthèse interdite")
    return problemes


def nettoyer_ligne_markdown(ligne: str) -> str:
    ligne = re.sub(r"`[^`]*`", "", ligne)
    ligne = re.sub(r"\]\([^)\s]*\)", "]", ligne)
    ligne = re.sub(r"<https?://[^>]+>", "", ligne)
    return ligne


def verifier_typo_markdown(rapport: Rapport, chemin: Any, corps: str, premiere_ligne: int) -> None:
    for numero, ligne, dans_code in contrat.lignes_utiles(corps, premiere_ligne):
        if dans_code:
            continue
        for probleme in problemes_typo(nettoyer_ligne_markdown(ligne)):
            rapport.erreur(chemin, f"ligne {numero} : {probleme} dans un document destiné au client")


# ---------------------------------------------------------------------------
# Projections des documents Markdown


def titre_niveau_1(rapport: Rapport, chemin: Any, liste_titres: list[tuple[int, str, int]]) -> str | None:
    niveaux_1 = [t for t in liste_titres if t[0] == 1]
    if len(niveaux_1) > 1:
        rapport.erreur(chemin, f"un seul titre de niveau 1 autorisé, {len(niveaux_1)} trouvés")
    if niveaux_1 and liste_titres[0][0] != 1:
        rapport.erreur(chemin, "le titre de niveau 1 doit précéder tous les autres titres")
    return niveaux_1[0][1] if niveaux_1 else None


def lire_markdown(rapport: Rapport, chemin: Any, texte: str, entete_requise: bool):
    try:
        entete, corps, premiere = contrat.separer_entete(texte)
    except ErreurLecture as exc:
        rapport.erreur(chemin, str(exc))
        return None
    if entete_requise and entete is None:
        rapport.erreur(chemin, "en-tête YAML manquant : le fichier doit commencer par une ligne ---")
    if not entete_requise and entete is not None:
        rapport.erreur(chemin, "en-tête YAML non prévu pour ce document")
    return entete, corps, premiere


def projeter_synthese(rapport: Rapport, chemin: Any, texte: str):
    lu = lire_markdown(rapport, chemin, texte, entete_requise=True)
    if lu is None:
        return None
    entete, corps, premiere = lu
    liste = contrat.titres(corps, premiere)
    projection = {
        "entete": entete,
        "titre": titre_niveau_1(rapport, chemin, liste),
        "sections": [t[1] for t in liste if t[0] == 2],
    }
    valider_schema(rapport, "synthese", projection, chemin)
    verifier_typo_markdown(rapport, chemin, corps, premiere)
    return projection


def projeter_cadrage(rapport: Rapport, chemin: Any, texte: str):
    lu = lire_markdown(rapport, chemin, texte, entete_requise=False)
    if lu is None:
        return None
    _, corps, premiere = lu
    liste = contrat.titres(corps, premiere)
    regles: list[str] = []
    dans_regles = False
    for numero, ligne, dans_code in contrat.lignes_utiles(corps, premiere):
        if dans_code:
            continue
        titre = next((t for t in liste if t[2] == numero), None)
        if titre and titre[0] <= 2:
            dans_regles = titre[0] == 2 and titre[1] == "Règles de gestion"
            continue
        if not dans_regles:
            continue
        correspondance = RE_RG.match(ligne)
        if correspondance:
            regles.append(correspondance.group(1))
        elif RE_RG_APPROX.match(ligne):
            rapport.erreur(chemin, f"ligne {numero} : règle mal formée, format attendu - **RGn** : énoncé")
    projection = {
        "titre": titre_niveau_1(rapport, chemin, liste),
        "sections": [t[1] for t in liste if t[0] == 2],
        "regles": regles,
    }
    valider_schema(rapport, "cadrage", projection, chemin)
    attendues = [f"RG{n}" for n in range(1, len(regles) + 1)]
    if regles != attendues:
        rapport.erreur(chemin, f"règles de gestion numérotées {', '.join(regles)} ; attendu {', '.join(attendues)}, sans trou ni doublon")
    verifier_typo_markdown(rapport, chemin, corps, premiere)
    return projection


def projeter_decisions(rapport: Rapport, chemin: Any, texte: str):
    lu = lire_markdown(rapport, chemin, texte, entete_requise=False)
    if lu is None:
        return None
    _, corps, premiere = lu
    liste = contrat.titres(corps, premiere)
    entrees: list[dict] = []
    courante: dict | None = None
    dernier_champ = False
    for numero, ligne, dans_code in contrat.lignes_utiles(corps, premiere):
        titre = None if dans_code else next((t for t in liste if t[2] == numero), None)
        if titre and titre[0] == 1 and courante is None:
            continue
        if titre and titre[0] == 2:
            correspondance = RE_TITRE_DECISION.match(titre[1])
            if not correspondance:
                rapport.erreur(chemin, f"ligne {numero} : titre d'entrée attendu ## AAAA-MM-JJ titre, trouvé ## {titre[1]}")
                courante = {"date": "0000-00-00", "titre": titre[1], "champs": []}
            else:
                courante = {"date": correspondance.group(1), "titre": correspondance.group(2), "champs": []}
            entrees.append(courante)
            dernier_champ = False
            continue
        if courante is None or not ligne.strip():
            continue
        champ = None if dans_code else RE_CHAMP_DECISION.match(ligne)
        if champ:
            courante["champs"].append(champ.group(1))
            dernier_champ = True
        elif dernier_champ and (ligne.startswith("  ") or ligne.startswith("\t")):
            continue
        else:
            rapport.erreur(chemin, f"ligne {numero} : contenu hors des champs ; chaque entrée ne contient que - **Décision** : , - **Raison** : , - **Impact** : , - **Source** : et leurs lignes de suite indentées")
    projection = {"titre": titre_niveau_1(rapport, chemin, liste), "entrees": entrees}
    valider_schema(rapport, "decisions", projection, chemin)
    dates = [e["date"] for e in entrees]
    if dates != sorted(dates):
        rapport.erreur(chemin, "entrées hors ordre chronologique croissant : ajouter les nouvelles décisions en fin de fichier")
    return projection


def projeter_fiche(rapport: Rapport, chemin: Any, texte: str):
    lu = lire_markdown(rapport, chemin, texte, entete_requise=False)
    if lu is None:
        return None
    _, corps, premiere = lu
    projection = {"titre": titre_niveau_1(rapport, chemin, contrat.titres(corps, premiere))}
    valider_schema(rapport, "fiche", projection, chemin)
    return projection


def projeter_transcript(rapport: Rapport, chemin: Any, texte: str):
    lu = lire_markdown(rapport, chemin, texte, entete_requise=True)
    if lu is None:
        return None
    entete, corps, _ = lu
    if entete is not None:
        valider_schema(rapport, "transcript", entete, chemin, "en-tête")
    if not corps.strip():
        rapport.avertissement(chemin, "transcript vide")
    return entete


# ---------------------------------------------------------------------------
# Contrôles transverses


def verifier_ligne_temps(rapport: Rapport, chemin: Any, numero: int, ligne: dict) -> bool:
    if valider_schema(rapport, "temps", ligne, chemin, f"ligne {numero}"):
        return False
    attendu = contrat.minutes_entre(ligne["debut"], ligne["fin"])
    if ligne["minutes"] != attendu:
        rapport.erreur(chemin, f"ligne {numero} : minutes vaut {ligne['minutes']}, attendu {attendu} d'après debut {ligne['debut']} et fin {ligne['fin']}")
    if (ligne["source"] == "theo") != (ligne["agent"] == "theo"):
        rapport.erreur(chemin, f"ligne {numero} : source theo et agent theo vont ensemble ; un agent Claude Code a la source claude-code")
    return True


def verifier_chiffrage(rapport: Rapport, chemin: Any, donnees: Any) -> bool:
    if valider_schema(rapport, "chiffrage", donnees, chemin):
        return False
    total = 0.0
    for index, ligne in enumerate(donnees["lignes"]):
        if round(ligne["prix_unitaire_ht"], 2) != ligne["prix_unitaire_ht"]:
            rapport.erreur(chemin, f"lignes[{index}].prix_unitaire_ht : 2 décimales au plus")
        for cle in ("titre", "description"):
            for probleme in problemes_typo(ligne[cle]):
                rapport.erreur(chemin, f"lignes[{index}].{cle} : {probleme}, la ligne apparaît sur le devis client")
        total += ligne["quantite"] * ligne["prix_unitaire_ht"]
    if round(total, 2) != round(donnees["total_ht"], 2):
        rapport.erreur(chemin, f"total_ht vaut {donnees['total_ht']}, attendu {round(total, 2)}")
    for probleme in problemes_typo(donnees["objet"]):
        rapport.erreur(chemin, f"objet : {probleme}, l'objet apparaît sur le devis client")
    return True


def trouver_cycle(dependances: dict[str, list[str]]) -> list[str] | None:
    etat: dict[str, int] = {}
    pile: list[str] = []

    def visiter(noeud: str) -> list[str] | None:
        etat[noeud] = 1
        pile.append(noeud)
        for suivant in dependances.get(noeud, []):
            if etat.get(suivant) == 1:
                return pile[pile.index(suivant):] + [suivant]
            if suivant not in etat:
                cycle = visiter(suivant)
                if cycle:
                    return cycle
        pile.pop()
        etat[noeud] = 2
        return None

    for noeud in sorted(dependances):
        if noeud not in etat:
            cycle = visiter(noeud)
            if cycle:
                return cycle
    return None


def lister(rapport: Rapport, dossier: Path, motif: re.Pattern | None, description: str) -> list[Path]:
    """Fichiers d'un dossier ; tout fichier non conforme au motif est signalé."""
    fichiers = []
    for element in sorted(dossier.iterdir()):
        if element.name == ".gitkeep":
            continue
        if element.is_dir():
            rapport.erreur(element, f"sous-dossier non prévu dans {dossier.name}/")
            continue
        if motif is not None and not motif.match(element.name):
            rapport.erreur(element, f"nom de fichier non conforme, attendu {description}")
            continue
        fichiers.append(element)
    return fichiers


# ---------------------------------------------------------------------------
# Dossier projet


def resoudre_projet(chemin: Path) -> Path:
    if not (chemin / "client.yaml").exists() and (chemin / "projet" / "client.yaml").exists():
        return chemin / "projet"
    return chemin


def codes_catalogue(dossier_catalogue: Path | None) -> set[str] | None:
    dossier = dossier_catalogue or (contrat.RACINE_OPS / "catalogue")
    fichier = dossier / "modules.yaml"
    if not fichier.exists():
        return None
    try:
        contenu = contrat.charger_yaml(fichier) or {}
        return {m["code"] for m in contenu.get("modules") or [] if isinstance(m, dict) and "code" in m}
    except (ErreurLecture, TypeError):
        return None


def valider_projet(chemin_projet: Path, rapport: Rapport, codes_modules: set[str] | None = None) -> dict:
    """Valide un dossier projet complet. Renvoie le client et les items lus, pour les contrôles croisés."""
    resultat: dict = {"client": None, "items": {}}
    projet = Path(chemin_projet)
    if not projet.is_dir():
        rapport.erreur(projet, "dossier projet introuvable")
        return resultat

    # Arborescence
    for nom in FICHIERS_PROJET:
        if not (projet / nom).is_file():
            rapport.erreur(projet / nom, "fichier obligatoire manquant")
    for nom in DOSSIERS_PROJET:
        if not (projet / nom).is_dir():
            rapport.erreur(projet / nom, "dossier obligatoire manquant")
    for element in sorted(projet.iterdir()):
        if element.name.startswith("."):
            continue
        if element.name not in FICHIERS_PROJET and element.name not in DOSSIERS_PROJET:
            rapport.erreur(element, "élément non prévu par le contrat à la racine de projet/")

    # client.yaml
    prefixe = None
    chemin_client = projet / "client.yaml"
    if chemin_client.is_file():
        client = charger(rapport, chemin_client, contrat.charger_yaml)
        if client is not ECHEC and not valider_schema(rapport, "client", client, chemin_client):
            resultat["client"] = client
            prefixe = contrat.prefixe(client["slug"])

    # Backlog
    items: dict[str, tuple[Path, dict]] = {}
    ids_invalides: set[str] = set()
    references_rg: list[tuple[Path, str, int]] = []
    dossier_backlog = projet / "backlog"
    if dossier_backlog.is_dir():
        fichiers = lister(rapport, dossier_backlog, contrat.RE_FICHIER_BACKLOG, "<nom-en-kebab-case>.yaml")
        if not fichiers:
            rapport.erreur(dossier_backlog, "au moins un fichier .yaml attendu")
        for fichier in fichiers:
            contenu = charger(rapport, fichier, contrat.charger_yaml)
            if contenu is ECHEC:
                continue
            valides = entrees_valides(valider_schema(rapport, "backlog", contenu, fichier), contenu)
            if valides is None:
                continue
            for item in contenu["items"]:
                # Un item invalide garde son id pour éviter des erreurs en cascade sur les dépendances.
                if isinstance(item, dict) and isinstance(item.get("id"), str) and item not in valides:
                    ids_invalides.add(item["id"])
            for item in valides:
                ident = item["id"]
                if ident in items:
                    rapport.erreur(fichier, f"id {ident} déjà utilisé dans {afficher(items[ident][0])}")
                    continue
                items[ident] = (fichier, item)
                if prefixe and not ident.startswith(f"{prefixe}-"):
                    rapport.erreur(fichier, f"{ident} : le préfixe doit être {prefixe}, slug en majuscules")
                if item["a_valider"]:
                    rapport.avertissement(fichier, f"{ident} : a_valider vaut true, champ sans effet depuis le 2026-10-16, à passer à false")
                if item["audience"] == "client":
                    for cle, textes in (("titre", [item["titre"]]), ("criteres_acceptation", item["criteres_acceptation"])):
                        for texte in textes:
                            for probleme in problemes_typo(texte):
                                rapport.erreur(fichier, f"{ident}.{cle} : {probleme}, l'item est visible du client")
                if item["statut"] in ("a_recetter", "fait") and item["commit"] is None:
                    rapport.avertissement(fichier, f"{ident} : statut {item['statut']} sans commit renseigné")
                if codes_modules is not None and item["module"] is not None and item["module"] not in codes_modules:
                    rapport.avertissement(fichier, f"{ident} : module {item['module']} absent du catalogue")
                for critere in item["criteres_acceptation"]:
                    for numero in RE_REF_RG.findall(critere):
                        references_rg.append((fichier, ident, int(numero)))
        graphe: dict[str, list[str]] = {}
        for ident, (fichier, item) in items.items():
            internes = [d for d in item["dependances"] if not d.startswith("externe: ")]
            graphe[ident] = internes
            for dependance in internes:
                if dependance == ident:
                    rapport.erreur(fichier, f"{ident} dépend de lui-même")
                elif dependance not in items and dependance not in ids_invalides:
                    rapport.erreur(fichier, f"{ident} : dépendance {dependance} introuvable dans le backlog")
        cycle = trouver_cycle({k: [d for d in v if d in items and d != k] for k, v in graphe.items()})
        if cycle:
            rapport.erreur(dossier_backlog, f"dépendances circulaires : {' -> '.join(cycle)}")
    resultat["items"] = {k: v[1] for k, v in items.items()}

    # Périmètre des devis : lots et items du backlog, chacun cité par un seul devis.
    if resultat["client"] is not None and dossier_backlog.is_dir():
        lots_backlog = {item["lot"] for _, item in items.values()}
        cites_items: dict[str, str] = {}
        cites_lots: dict[int, str] = {}
        for devis in resultat["client"]["devis"]:
            perimetre = devis.get("perimetre")
            if perimetre is None:
                continue
            nom = devis["objet"]
            for lot in perimetre["lots"]:
                if lot not in lots_backlog:
                    rapport.erreur(chemin_client, f"devis « {nom} » : lot {lot} absent du backlog")
                if lot in cites_lots:
                    rapport.erreur(chemin_client, f"devis « {nom} » : lot {lot} déjà dans le périmètre de « {cites_lots[lot]} »")
                cites_lots.setdefault(lot, nom)
            for ident in perimetre["items"]:
                if ident not in items and ident not in ids_invalides:
                    rapport.erreur(chemin_client, f"devis « {nom} » : item {ident} introuvable dans le backlog")
                if ident in cites_items:
                    rapport.erreur(chemin_client, f"devis « {nom} » : item {ident} déjà dans le périmètre de « {cites_items[ident]} »")
                cites_items.setdefault(ident, nom)

    # actions.yaml
    chemin_actions = projet / "actions.yaml"
    if chemin_actions.is_file():
        contenu = charger(rapport, chemin_actions, contrat.charger_yaml)
        valides = None if contenu is ECHEC else entrees_valides(valider_schema(rapport, "actions", contenu, chemin_actions), contenu)
        if valides is not None:
            vus: set[str] = set()
            for action in valides:
                ident = action["id"]
                if ident in vus:
                    rapport.erreur(chemin_actions, f"id {ident} en double")
                vus.add(ident)
                if prefixe and not ident.startswith(f"ACT-{prefixe}-"):
                    rapport.erreur(chemin_actions, f"{ident} : le préfixe doit être ACT-{prefixe}-")
                source = action["source"]
                if contrat.RE_ID_ITEM.match(source):
                    if source not in items and source not in ids_invalides:
                        rapport.erreur(chemin_actions, f"{ident} : source {source} introuvable dans le backlog")
                elif source != "manuel" and not (projet / source).is_file():
                    rapport.erreur(chemin_actions, f"{ident} : source {source} introuvable dans projet/")

    # temps/
    dossier_temps = projet / "temps"
    if dossier_temps.is_dir():
        sessions: Counter = Counter()
        for fichier in lister(rapport, dossier_temps, contrat.RE_FICHIER_TEMPS, "AAAA-MM-<agent>.jsonl"):
            nom = contrat.RE_FICHIER_TEMPS.match(fichier.name)
            lignes = charger(rapport, fichier, contrat.lire_jsonl)
            for numero, ligne in [] if lignes is ECHEC else lignes:
                if not verifier_ligne_temps(rapport, fichier, numero, ligne):
                    continue
                if not ligne["date"].startswith(nom.group("mois")):
                    rapport.erreur(fichier, f"ligne {numero} : date {ligne['date']} hors du mois {nom.group('mois')} du fichier")
                if ligne["agent"] != nom.group("agent"):
                    rapport.erreur(fichier, f"ligne {numero} : agent {ligne['agent']} différent de celui du nom de fichier, {nom.group('agent')}")
                if ligne["item"] is not None and ligne["item"] not in items and ligne["item"] not in ids_invalides:
                    rapport.erreur(fichier, f"ligne {numero} : item {ligne['item']} introuvable dans le backlog")
                cle = (ligne["agent"], ligne["date"], ligne["debut"])
                sessions[cle] += 1
                if sessions[cle] == 2:
                    rapport.erreur(fichier, f"ligne {numero} : session en double pour {ligne['agent']} le {ligne['date']} à {ligne['debut']}")

    # transcripts/
    dossier_transcripts = projet / "transcripts"
    if dossier_transcripts.is_dir():
        for fichier in lister(rapport, dossier_transcripts, contrat.RE_FICHIER_DATE_SUJET, "AAAA-MM-JJ-sujet.md"):
            texte = charger(rapport, fichier, lambda c: c.read_text(encoding="utf-8"))
            entete = projeter_transcript(rapport, fichier, texte) if texte is not ECHEC else None
            date_nom = contrat.RE_FICHIER_DATE_SUJET.match(fichier.name).group("date")
            if isinstance(entete, dict) and entete.get("date") not in (None, date_nom):
                rapport.erreur(fichier, f"date {entete.get('date')} différente de celle du nom de fichier, {date_nom}")

    # syntheses/
    dossier_syntheses = projet / "syntheses"
    if dossier_syntheses.is_dir():
        for fichier in lister(rapport, dossier_syntheses, contrat.RE_FICHIER_DATE_SUJET, "AAAA-MM-JJ-sujet.md"):
            texte = charger(rapport, fichier, lambda c: c.read_text(encoding="utf-8"))
            projection = projeter_synthese(rapport, fichier, texte) if texte is not ECHEC else None
            entete = projection.get("entete") if projection else None
            if isinstance(entete, dict):
                date_nom = contrat.RE_FICHIER_DATE_SUJET.match(fichier.name).group("date")
                if entete.get("date") not in (None, date_nom):
                    rapport.erreur(fichier, f"date {entete.get('date')} différente de celle du nom de fichier, {date_nom}")
                transcript = entete.get("transcript")
                if isinstance(transcript, str) and not (projet / transcript).is_file():
                    rapport.erreur(fichier, f"transcript {transcript} introuvable")

    # Documents
    max_rg = None
    for nom, projeter in (("cadrage.md", projeter_cadrage), ("decisions.md", projeter_decisions), ("fiche.md", projeter_fiche)):
        chemin = projet / nom
        if chemin.is_file():
            texte = charger(rapport, chemin, lambda c: c.read_text(encoding="utf-8"))
            projection = projeter(rapport, chemin, texte) if texte is not ECHEC else None
            if nom == "cadrage.md" and projection:
                max_rg = len(projection["regles"])
    if max_rg is not None:
        for fichier, ident, numero in references_rg:
            if numero > max_rg:
                rapport.avertissement(fichier, f"{ident} cite RG{numero}, absente de cadrage.md")

    # devis/
    dossier_devis = projet / "devis"
    if dossier_devis.is_dir():
        chiffrages: dict[str, set[str]] = {}
        for fichier in lister(rapport, dossier_devis, None, ""):
            correspondance = contrat.RE_FICHIER_CHIFFRAGE.match(fichier.name)
            if not correspondance:
                continue
            chiffrages.setdefault(correspondance.group("date"), set()).add(correspondance.group("ext"))
            if correspondance.group("ext") == "json":
                donnees = charger(rapport, fichier, contrat.charger_json)
                if donnees is not ECHEC and verifier_chiffrage(rapport, fichier, donnees):
                    if donnees["date"] != correspondance.group("date"):
                        rapport.erreur(fichier, f"date {donnees['date']} différente de celle du nom de fichier")
                    if resultat["client"] and donnees["slug"] != resultat["client"]["slug"]:
                        rapport.erreur(fichier, f"slug {donnees['slug']} différent de client.yaml")
        for date, extensions in sorted(chiffrages.items()):
            for manquante in sorted({"md", "json"} - extensions):
                rapport.erreur(dossier_devis / f"chiffrage-{date}.{manquante}", "fichier jumeau manquant : un chiffrage produit toujours un .md et un .json")

    return resultat


# ---------------------------------------------------------------------------
# Registre et catalogue


def valider_registre(chemin: Path, rapport: Rapport, racine: Path | None, codes_modules: set[str] | None) -> dict[str, dict]:
    projets: dict[str, dict] = {}
    contenu = charger(rapport, chemin, contrat.charger_yaml)
    if contenu is ECHEC or valider_schema(rapport, "clients", contenu, chemin):
        return projets
    for cle in ("slug", "depot"):
        for valeur, nombre in Counter(c[cle] for c in contenu["clients"]).items():
            if nombre > 1:
                rapport.erreur(chemin, f"{cle} {valeur} en double")
    if racine is None:
        return projets
    for entree in contenu["clients"]:
        dossier = contrat.chemin_clone(racine, entree["depot"]) / "projet"
        if not dossier.is_dir():
            if entree["actif"]:
                rapport.erreur(chemin, f"{entree['slug']} : clone introuvable, attendu {afficher(dossier)}")
            continue
        resultat = valider_projet(dossier, rapport, codes_modules)
        projets[entree["slug"]] = resultat
        client = resultat["client"]
        if client is None:
            continue
        if client["slug"] != entree["slug"]:
            rapport.erreur(chemin, f"{entree['slug']} : slug {client['slug']} dans {afficher(dossier / 'client.yaml')}")
        if client["statut"] != entree["statut"]:
            rapport.erreur(chemin, f"{entree['slug']} : statut {entree['statut']} au registre, {client['statut']} dans client.yaml qui fait foi")
        if client["liens"]["depot"] not in (None, entree["depot"]):
            rapport.erreur(chemin, f"{entree['slug']} : dépôt {entree['depot']} au registre, {client['liens']['depot']} dans client.yaml")
    return projets


def valider_catalogue(dossier: Path, rapport: Rapport, projets: dict[str, dict]) -> None:
    chemin_modules = dossier / "modules.yaml"
    chemin_tarifs = dossier / "tarifs.yaml"
    for chemin in (chemin_modules, chemin_tarifs):
        if not chemin.is_file():
            rapport.erreur(chemin, "fichier obligatoire manquant")
    if chemin_tarifs.is_file():
        contenu = charger(rapport, chemin_tarifs, contrat.charger_yaml)
        if contenu is not ECHEC:
            valider_schema(rapport, "catalogue-tarifs", contenu, chemin_tarifs)
    if not chemin_modules.is_file():
        return
    contenu = charger(rapport, chemin_modules, contrat.charger_yaml)
    if contenu is ECHEC or valider_schema(rapport, "catalogue-modules", contenu, chemin_modules):
        return
    mesures_vues: dict[tuple[str, str], str] = {}
    for valeur, nombre in Counter(m["code"] for m in contenu["modules"]).items():
        if nombre > 1:
            rapport.erreur(chemin_modules, f"code {valeur} en double")
    for module in contenu["modules"]:
        code = module["code"]
        if module["heures_min"] > module["heures_max"]:
            rapport.erreur(chemin_modules, f"{code} : heures_min supérieur à heures_max")
        for mesure in module["mesures"]:
            cle = (mesure["client"], mesure["item"])
            if not mesure["item"].startswith(f"{contrat.prefixe(mesure['client'])}-"):
                rapport.erreur(chemin_modules, f"{code} : l'item {mesure['item']} n'a pas le préfixe du client {mesure['client']}")
            if cle in mesures_vues:
                rapport.erreur(chemin_modules, f"{code} : mesure {mesure['client']} {mesure['item']} déjà présente dans {mesures_vues[cle]}")
            mesures_vues[cle] = code
            projet = projets.get(mesure["client"])
            if projet is None:
                continue
            item = projet["items"].get(mesure["item"])
            if item is None:
                rapport.avertissement(chemin_modules, f"{code} : item {mesure['item']} introuvable chez {mesure['client']}")
            elif item["module"] != code or item["statut"] != "fait":
                rapport.avertissement(chemin_modules, f"{code} : {mesure['item']} est {item['statut']} sur le module {item['module']} ; relancer calibrer.py")


# ---------------------------------------------------------------------------
# Exemples de CONTRAT.md

RE_MARQUEUR_EXEMPLE = re.compile(r"^<!-- exemple: ([a-z-]+) -->\s*$")


def extraire_exemples(texte: str) -> list[tuple[str, int, str]]:
    lignes = texte.split("\n")
    exemples = []
    index = 0
    while index < len(lignes):
        marqueur = RE_MARQUEUR_EXEMPLE.match(lignes[index])
        index += 1
        if not marqueur:
            continue
        while index < len(lignes) and not lignes[index].strip():
            index += 1
        ouverture = re.match(r"^(`{3,})", lignes[index]) if index < len(lignes) else None
        if not ouverture:
            exemples.append((marqueur.group(1), index + 1, None))
            continue
        cloture = ouverture.group(1)
        debut = index + 1
        index = debut
        while index < len(lignes) and lignes[index].rstrip() != cloture:
            index += 1
        exemples.append((marqueur.group(1), debut + 1, "\n".join(lignes[debut:index]) + "\n"))
        index += 1
    return exemples


def valider_exemples_contrat(chemin: Path, rapport: Rapport) -> int:
    exemples = extraire_exemples(chemin.read_text(encoding="utf-8"))
    schemas_yaml = {
        "client": "client", "backlog": "backlog", "actions": "actions", "clients": "clients",
        "modules": "catalogue-modules", "tarifs": "catalogue-tarifs",
    }
    for genre, ligne, contenu in exemples:
        position = f"{afficher(chemin)}:{ligne}"
        if contenu is None:
            rapport.erreur(position, f"marqueur exemple: {genre} sans bloc de code juste après")
            continue
        try:
            if genre in schemas_yaml:
                valider_schema(rapport, schemas_yaml[genre], contrat.charger_yaml_texte(contenu), position, f"exemple {genre}")
            elif genre == "temps":
                for numero, ligne_json in enumerate(contenu.strip().split("\n"), start=1):
                    verifier_ligne_temps(rapport, position, numero, contrat.charger_json_texte(ligne_json))
            elif genre == "chiffrage":
                verifier_chiffrage(rapport, position, contrat.charger_json_texte(contenu))
            elif genre == "transcript":
                projeter_transcript(rapport, position, contenu)
            elif genre == "synthese":
                projeter_synthese(rapport, position, contenu)
            elif genre == "cadrage":
                projeter_cadrage(rapport, position, contenu)
            elif genre == "decisions":
                projeter_decisions(rapport, position, contenu)
            elif genre == "fiche":
                projeter_fiche(rapport, position, contenu)
            else:
                rapport.erreur(position, f"type d'exemple inconnu : {genre}")
        except ErreurLecture as exc:
            rapport.erreur(position, f"exemple {genre} : {exc}")
    return len(exemples)


# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Valide les formats définis dans CONTRAT.md.")
    parser.add_argument("projets", nargs="*", type=Path, help="dossiers projet à valider")
    parser.add_argument("--clients", type=Path, help="registre clients.yaml à valider")
    parser.add_argument("--racine", type=Path, help="dossier des clones ; avec --clients, valide aussi chaque projet du registre")
    parser.add_argument("--catalogue", type=Path, help="dossier du catalogue, qui contient modules.yaml et tarifs.yaml")
    parser.add_argument("--contrat", type=Path, help="CONTRAT.md dont les exemples sont à valider")
    args = parser.parse_args(argv)

    if not (args.projets or args.clients or args.catalogue or args.contrat):
        parser.print_usage(sys.stderr)
        print("validate.py: erreur : rien à valider", file=sys.stderr)
        return 2
    if args.racine and not args.clients:
        print("validate.py: erreur : --racine s'utilise avec --clients", file=sys.stderr)
        return 2
    for chemin in [*args.projets, args.clients, args.racine, args.catalogue, args.contrat]:
        if chemin is not None and not chemin.exists():
            print(f"validate.py: erreur : {chemin} introuvable", file=sys.stderr)
            return 2

    rapport = Rapport()
    codes_modules = codes_catalogue(args.catalogue)
    bilan = []
    for chemin in args.projets:
        valider_projet(resoudre_projet(chemin), rapport, codes_modules)
    if args.projets:
        bilan.append(pluriel(len(args.projets), "dossier") + " projet")
    projets: dict[str, dict] = {}
    if args.clients:
        projets = valider_registre(args.clients, rapport, args.racine, codes_modules)
        bilan.append("registre" + (f" et {pluriel(len(projets), 'clone')}" if args.racine else ""))
    if args.catalogue:
        valider_catalogue(args.catalogue, rapport, projets)
        bilan.append("catalogue")
    if args.contrat:
        bilan.append(pluriel(valider_exemples_contrat(args.contrat, rapport), "exemple") + " du contrat")

    rapport.imprimer()
    print(f"Bilan : {', '.join(bilan)} ; {pluriel(rapport.nb_erreurs, 'erreur')}, {pluriel(rapport.nb_avertissements, 'avertissement')}.")
    return 1 if rapport.nb_erreurs else 0


if __name__ == "__main__":
    sys.exit(main())
