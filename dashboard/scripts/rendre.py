"""Injecte une vue JSON produite par agreger.py dans dashboard/template.html.

Usage :
    python dashboard/scripts/rendre.py dashboard/out/<audience>.json --sortie dashboard/out/<audience>.html \\
        [--projet <slug>]

--projet ne garde qu'un projet ; il n'est admis que pour la vue client, la seule
qui n'a pas de synthèse globale, pour qu'un client ne voie jamais les autres.
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
MARQUEUR = '<script id="donnees" type="application/json">null</script>'


def serialiser(donnees: dict) -> str:
    """JSON sûr dans un élément script : aucun < littéral, donc aucune balise fermante possible."""
    return json.dumps(donnees, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def rendre(donnees: dict, gabarit: str) -> str:
    if gabarit.count(MARQUEUR) != 1:
        raise ValueError("marqueur des données absent ou en double dans le gabarit")
    return gabarit.replace(MARQUEUR, MARQUEUR.replace(">null<", f">{serialiser(donnees)}<"))


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
        page = rendre(donnees, GABARIT.read_text(encoding="utf-8"))
    except (ValueError, KeyError) as exc:
        print(f"rendre.py: erreur : {exc}", file=sys.stderr)
        return 1
    args.sortie.parent.mkdir(parents=True, exist_ok=True)
    args.sortie.write_text(page, encoding="utf-8")
    print(f"Page {donnees['audience']} : {args.sortie}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
