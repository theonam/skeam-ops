"""Injecte une vue JSON produite par agreger.py dans dashboard/template.html.

Usage :
    python dashboard/scripts/rendre.py dashboard/out/<audience>.json --sortie dashboard/out/<audience>.html \\
        [--projet <slug>] [--todoist <instantane.json>]

--projet ne garde qu'un projet ; il n'est admis que pour la vue client, la seule
qui n'a pas de synthèse globale, pour qu'un client ne voie jamais les autres.

La vue interne reçoit aussi la configuration Todoist de dashboard/todoist.json :
la page lit Todoist en direct quand l'artefact a la capacité mcp. --todoist y
ajoute l'instantané pris à la génération, affiché quand la lecture directe est
impossible ; il n'est admis que pour la vue interne. Format : dashboard/README.md.

La page produite est autonome : un seul fichier HTML, données comprises.

Code de sortie : 0 en cas de succès, 1 pour une erreur de données, 2 pour un
usage incorrect.

Python 3.11, bibliothèque standard seulement.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

GABARIT = Path(__file__).resolve().parents[1] / "template.html"
CONFIG_TODOIST = Path(__file__).resolve().parents[1] / "todoist.json"
MARQUEUR = '<script id="donnees" type="application/json">null</script>'
MARQUEUR_TODOIST = '<script id="todoist" type="application/json">null</script>'
CHAMPS_TACHE = ("id", "content", "priority", "dueDate", "sectionId")


def serialiser(donnees: dict) -> str:
    """JSON sûr dans un élément script : aucun < littéral, donc aucune balise fermante possible."""
    return json.dumps(donnees, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def injecter(gabarit: str, marqueur: str, donnees: dict) -> str:
    if gabarit.count(marqueur) != 1:
        raise ValueError(f"marqueur {marqueur} absent ou en double dans le gabarit")
    return gabarit.replace(marqueur, marqueur.replace(">null<", f">{serialiser(donnees)}<"))


def instantane_todoist(brut: dict, config: dict) -> dict:
    """Ne garde que les tâches ouvertes p1 et p2 des sections Client, et leurs champs utiles."""
    sections = [{"id": s["id"], "name": s["name"]} for s in brut["sections"] if s["name"].startswith(config["prefixe_section"])]
    ids = {s["id"] for s in sections}
    taches = [
        {k: t.get(k) for k in CHAMPS_TACHE}
        for t in brut["taches"]
        if t.get("sectionId") in ids and t.get("priority") in config["priorites"] and not t.get("checked")
    ]
    return {"releve_le": brut["releve_le"], "partiel": bool(brut.get("partiel")), "sections": sections, "taches": taches}


def rendre(donnees: dict, gabarit: str, todoist: dict | None = None) -> str:
    page = injecter(gabarit, MARQUEUR, donnees)
    if donnees["audience"] == "interne":
        config = json.loads(CONFIG_TODOIST.read_text(encoding="utf-8"))
        page = injecter(page, MARQUEUR_TODOIST, {"config": config, "instantane": instantane_todoist(todoist, config) if todoist else None})
    elif todoist is not None:
        raise ValueError("Todoist n'est affiché que dans la vue interne")
    return page


def garder_projet(donnees: dict, slug: str) -> dict:
    projets = [p for p in donnees["projets"] if p["slug"] == slug]
    if not projets:
        raise ValueError(f"projet {slug} absent de la vue {donnees['audience']}")
    return {**donnees, "projets": projets}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Produit la page HTML autonome d'une vue du dashboard.")
    parser.add_argument("vue", type=Path, help="fichier JSON produit par agreger.py")
    parser.add_argument("--sortie", type=Path, required=True, help="page HTML à écrire")
    parser.add_argument("--projet", help="slug du seul projet à garder, vue client uniquement")
    parser.add_argument("--todoist", type=Path, help="instantané Todoist releve_le, sections, taches ; vue interne uniquement")
    args = parser.parse_args(argv)
    if not args.vue.is_file():
        print(f"rendre.py: erreur : {args.vue} introuvable", file=sys.stderr)
        return 2
    try:
        donnees = json.loads(args.vue.read_text(encoding="utf-8"))
        if not isinstance(donnees, dict) or not {"audience", "genere_le", "projets"} <= donnees.keys():
            raise ValueError("enveloppe audience, genere_le, projets attendue")
        if args.projet is not None:
            if donnees["audience"] != "client":
                print("rendre.py: erreur : --projet ne s'utilise qu'avec la vue client", file=sys.stderr)
                return 2
            donnees = garder_projet(donnees, args.projet)
        if args.todoist is not None and donnees["audience"] != "interne":
            print("rendre.py: erreur : --todoist ne s'utilise qu'avec la vue interne", file=sys.stderr)
            return 2
        todoist = json.loads(args.todoist.read_text(encoding="utf-8")) if args.todoist else None
        page = rendre(donnees, GABARIT.read_text(encoding="utf-8"), todoist)
    except (ValueError, KeyError, OSError) as exc:
        print(f"rendre.py: erreur : {exc}", file=sys.stderr)
        return 1
    args.sortie.parent.mkdir(parents=True, exist_ok=True)
    args.sortie.write_text(page, encoding="utf-8")
    print(f"Page {donnees['audience']} : {args.sortie}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
