"""Bouchon de catalogue/scripts/chiffrer.py pour les scénarios de test de skills/.

N'est pas le script du chantier catalogue : il respecte seulement son interface,
CONTRAT.md section 11.3, avec des prix fictifs. À copier dans le clone local
de skeam-ops, jamais à committer à la place du vrai script :

    cp skills/tests/bouchons/chiffrer.py catalogue/scripts/chiffrer.py
    python catalogue/scripts/chiffrer.py <chemin_projet> --sortie <chemin_projet>/devis/

Une ligne par lot, au forfait : somme des estimation_h des items du lot, hors
abandonne, multipliée par TAUX_FICTIF. Écrit
chiffrage-AAAA-MM-JJ.md et .json, date du jour à Paris, en remplaçant ceux du
jour. Code de sortie : 0 succès, 1 dossier invalide ou rien à chiffrer, 2 usage.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


def trouver_scripts() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "scripts" / "contrat.py").is_file():
            return parent / "scripts"
    raise SystemExit("chiffrer.py: erreur : scripts/contrat.py introuvable")


sys.path.insert(0, str(trouver_scripts()))

import contrat  # noqa: E402
import validate  # noqa: E402

TAUX_FICTIF = 90
RE_INTERDIT = re.compile(r"\s*[()—]\s*")


def propre(texte: str) -> str:
    """Retire tirets cadratins et parenthèses, interdits dans les lignes de devis."""
    return RE_INTERDIT.sub(" ", texte).strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bouchon de chiffrage, prix fictifs.")
    parser.add_argument("projet", type=Path)
    parser.add_argument("--sortie", type=Path, required=True)
    args = parser.parse_args(argv)

    rapport = validate.Rapport()
    validate.valider_projet(args.projet, rapport)
    if rapport.nb_erreurs:
        rapport.imprimer()
        print(f"chiffrer.py: erreur : {args.projet} invalide", file=sys.stderr)
        return 1

    client = contrat.lire_client(args.projet)
    items = [i for i in contrat.lire_items(args.projet) if i["statut"] != "abandonne"]
    if not items:
        print("chiffrer.py: erreur : aucun item à chiffrer", file=sys.stderr)
        return 1

    lignes = []
    for lot in sorted({i["lot"] for i in items}):
        du_lot = [i for i in items if i["lot"] == lot]
        lignes.append({
            "titre": f"Lot {lot}",
            "description": propre(", ".join(i["titre"] for i in du_lot)) + ".",
            "quantite": 1,
            "unite": "forfait",
            "prix_unitaire_ht": round(sum(i["estimation_h"] for i in du_lot) * TAUX_FICTIF, 2),
            "tva": 0.2,
        })
    date = datetime.now(ZoneInfo(contrat.FUSEAU)).date().isoformat()
    lots = sorted({i["lot"] for i in items})
    chiffrage = {
        "slug": client["slug"],
        "date": date,
        "objet": propre(f"Application {client['nom']}, " + (f"lot {lots[0]}" if len(lots) == 1 else f"lots {', '.join(map(str, lots[:-1]))} et {lots[-1]}")),
        "lignes": lignes,
        "total_ht": round(sum(l["quantite"] * l["prix_unitaire_ht"] for l in lignes), 2),
    }

    args.sortie.mkdir(parents=True, exist_ok=True)
    (args.sortie / f"chiffrage-{date}.json").write_text(json.dumps(chiffrage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tableau = "\n".join(f"| {l['titre']} | {l['quantite']} | {l['unite']} | {l['prix_unitaire_ht']:.2f} | {l['tva']} |" for l in lignes)
    (args.sortie / f"chiffrage-{date}.md").write_text(
        f"# Chiffrage {client['nom']} du {date}\n\nBouchon de test, prix fictifs au taux de {TAUX_FICTIF} euros par heure.\n\n"
        f"| Ligne | Quantité | Unité | Prix unitaire HT | TVA |\n|---|---|---|---|---|\n{tableau}\n\nTotal HT : {chiffrage['total_ht']:.2f} euros.\n",
        encoding="utf-8",
    )
    print(f"Chiffrage écrit : {args.sortie / f'chiffrage-{date}.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
