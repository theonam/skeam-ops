"""Crée le dossier projet d'un client à partir de templates/dossier-client.

Usage :
    python scripts/nouveau_dossier.py <slug> <nom> <dossier_cible> [--depot proprietaire/nom]

Copie templates/dossier-client vers <dossier_cible>/projet, pré-remplit slug,
nom et liens.depot dans client.yaml, reporte le nom dans les titres de fiche.md
et cadrage.md, puis valide le résultat. Refuse d'écraser un projet/ existant.
<dossier_cible> est créé s'il n'existe pas. Aucun fichier hors de projet/ n'est
touché.

Code de sortie : 0 si le dossier est créé et valide, 1 en cas d'erreur, 2 pour
un usage incorrect.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import contrat  # noqa: E402
import validate  # noqa: E402

GABARIT = contrat.RACINE_OPS / "templates" / "dossier-client"
RE_SLUG = re.compile(contrat.charger_schema("commun")["$defs"]["slug"]["pattern"])
RE_DEPOT = re.compile(contrat.charger_schema("commun")["$defs"]["depot"]["pattern"])


def remplacer_ligne(texte: str, motif: str, remplacement: str, fichier: str) -> str:
    nouveau, nombre = re.subn(motif, lambda _: remplacement, texte, count=1, flags=re.M)
    if nombre != 1:
        raise SystemExit(f"nouveau_dossier.py: erreur : gabarit {fichier} inattendu, motif {motif} absent")
    return nouveau


def yaml_chaine(valeur: str) -> str:
    """Chaîne YAML toujours entre guillemets : une chaîne JSON est du YAML valide."""
    return json.dumps(valeur, ensure_ascii=False)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Crée <dossier_cible>/projet depuis templates/dossier-client.")
    parser.add_argument("slug", help="minuscules et chiffres, sans tiret, 2 à 12 caractères, ex. egm")
    parser.add_argument("nom", help="nom d'usage du client, ex. \"E G M\"")
    parser.add_argument("dossier_cible", type=Path, help="racine du dépôt client")
    parser.add_argument("--depot", help="dépôt GitHub proprietaire/nom, écrit dans liens.depot")
    args = parser.parse_args(argv)

    if not RE_SLUG.match(args.slug):
        print(f"nouveau_dossier.py: erreur : slug {args.slug!r} invalide, attendu {RE_SLUG.pattern}", file=sys.stderr)
        return 2
    if not args.nom.strip():
        print("nouveau_dossier.py: erreur : nom vide", file=sys.stderr)
        return 2
    if args.depot is not None and not RE_DEPOT.match(args.depot):
        print(f"nouveau_dossier.py: erreur : dépôt {args.depot!r} invalide, attendu proprietaire/nom", file=sys.stderr)
        return 2
    if args.dossier_cible.exists() and not args.dossier_cible.is_dir():
        print(f"nouveau_dossier.py: erreur : {args.dossier_cible} n'est pas un dossier", file=sys.stderr)
        return 1

    cible = args.dossier_cible / "projet"
    if cible.exists():
        print(f"nouveau_dossier.py: erreur : {cible} existe déjà, rien n'est écrasé", file=sys.stderr)
        return 1

    args.dossier_cible.mkdir(parents=True, exist_ok=True)
    shutil.copytree(GABARIT, cible)

    nom = args.nom.strip()
    chemin_client = cible / "client.yaml"
    texte = chemin_client.read_text(encoding="utf-8")
    texte = remplacer_ligne(texte, r"^slug: .*$", f"slug: {args.slug}", "client.yaml")
    texte = remplacer_ligne(texte, r"^nom: .*$", f"nom: {yaml_chaine(nom)}", "client.yaml")
    if args.depot:
        texte = remplacer_ligne(texte, r"^  depot: .*$", f"  depot: {args.depot}", "client.yaml")
    chemin_client.write_text(texte, encoding="utf-8")

    for fichier, titre in (("fiche.md", f"# Fiche client {nom}"), ("cadrage.md", f"# Cadrage {nom}")):
        chemin = cible / fichier
        chemin.write_text(remplacer_ligne(chemin.read_text(encoding="utf-8"), r"^# .*$", titre, fichier), encoding="utf-8")

    rapport = validate.Rapport()
    validate.valider_projet(cible, rapport)
    rapport.imprimer()
    if rapport.nb_erreurs:
        print(f"nouveau_dossier.py: erreur : {cible} créé mais invalide, voir ci-dessus", file=sys.stderr)
        return 1

    print(f"Dossier créé : {cible}")
    print("Étapes suivantes, à faire à la main :")
    print("  1. ajouter la ligne @projet/CLAUDE-projet.md au CLAUDE.md racine du dépôt client ;")
    print(f"  2. ajouter l'entrée {args.slug} à clients.yaml dans skeam-ops ;")
    print("  3. compléter client.yaml puis lancer scripts/validate.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
