"""Chiffre le backlog d'un projet à partir du catalogue et des tarifs.

Usage, depuis la racine de skeam-ops :
    python catalogue/scripts/chiffrer.py <chemin_projet> --sortie <chemin_projet>/devis/

Valide le projet et le catalogue, puis écrit dans le dossier de sortie, date du
jour à Paris, toujours ensemble :
- chiffrage-AAAA-MM-JJ.md : chiffrage interne lisible, heures min, probable et
  max par lot et par module, prix conseillé, points d'attention ;
- chiffrage-AAAA-MM-JJ.json : lignes de devis au format Dougs, CONTRAT.md 11.3.
Un second passage le même jour remplace les deux fichiers.

Méthode : catalogue/README.md. Code de sortie : 0 succès, 1 erreur de données,
2 usage incorrect.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import methode  # noqa: E402
from methode import ErreurDonnees, contrat, validate  # noqa: E402

RE_LOT_CADRAGE = re.compile(r"^- \*\*Lot ([0-9]+)\*\* : (\S.*)$")
# Ordre des fonctionnalités dans une ligne de devis : de la plus importante pour le client à la moins importante.
# Priorité d'abord ; à priorité égale, ordre du backlog, que /cadrage écrit selon l'importance exprimée dans le transcript.
RANG_PRIORITE = {"indispensable": 0, "souhaitable": 1, "optionnel": 2}


@dataclass
class Chiffre:
    """Chiffrage d'un item, en heures et en euros."""

    item: dict
    categorie: str  # catalogue, hors_catalogue, module_inconnu
    h_min: float
    h_prob: float
    h_max: float
    marge: float
    brut: float  # h_prob x (1 + marge) x taux, avant arrondi


@dataclass
class Ligne:
    lot: int
    options: bool
    chiffres: list[Chiffre] = field(default_factory=list)
    titre: str = ""
    description: str = ""
    prix: int = 0

    def somme(self, attribut: str) -> float:
        return sum(getattr(c, attribut) for c in self.chiffres)


# ---------------------------------------------------------------------------
# Lecture


def libelles_lots(projet: Path) -> dict[int, str]:
    """Libellés des lots lus dans cadrage.md, section Découpage en lots : - **Lot n** : texte."""
    chemin = projet / "cadrage.md"
    if not chemin.is_file():
        return {}
    corps = chemin.read_text(encoding="utf-8")
    titres = {numero: (niveau, texte) for niveau, texte, numero in contrat.titres(corps)}
    libelles: dict[int, str] = {}
    dans_section = False
    for numero, ligne, dans_code in contrat.lignes_utiles(corps):
        if dans_code:
            continue
        if numero in titres and titres[numero][0] <= 2:
            dans_section = titres[numero] == (2, "Découpage en lots")
            continue
        correspondance = RE_LOT_CADRAGE.match(ligne) if dans_section else None
        if correspondance:
            libelles.setdefault(int(correspondance.group(1)), methode.nettoyer_typo(correspondance.group(2)).rstrip(" ."))
    return libelles


# ---------------------------------------------------------------------------
# Calcul


def chiffrer_items(items: list[dict], modules: dict[str, dict], tarifs: dict) -> tuple[list[Chiffre], dict[str, dict]]:
    """Heures et prix bruts de chaque item retenu, plus un bilan par module du catalogue."""
    taux = tarifs["taux_horaire_cible"]
    par_module: dict[str, list[dict]] = {}
    for item in items:
        if item["module"] in modules:
            par_module.setdefault(item["module"], []).append(item)

    bilan_modules: dict[str, dict] = {}
    for code, items_module in par_module.items():
        module = modules[code]
        estimation = sum(i["estimation_h"] for i in items_module)
        reference = methode.heures_reference(module)
        probable = estimation if module["confiance"] == "faible" else max(estimation, reference)
        bilan_modules[code] = {"estimation": estimation, "reference": reference, "probable": probable}

    chiffres = []
    for item in items:
        marge = tarifs["marge_securite"][item["taille"]]
        estimation = item["estimation_h"]
        if item["module"] in modules:
            module = modules[item["module"]]
            bilan = bilan_modules[item["module"]]
            part = estimation / bilan["estimation"]
            h_prob = part * bilan["probable"]
            h_min = min(part * module["heures_min"], h_prob)
            h_max = max(part * module["heures_max"], h_prob)
            categorie = "catalogue"
        else:
            h_prob = estimation
            h_min = estimation * methode.FACTEUR_MIN_HORS_CATALOGUE
            h_max = estimation * methode.FACTEUR_MAX_HORS_CATALOGUE
            categorie = "hors_catalogue" if item["module"] is None else "module_inconnu"
        chiffres.append(Chiffre(item, categorie, h_min, h_prob, h_max, marge, h_prob * (1 + marge) * taux))
    return chiffres, bilan_modules


def composer_lignes(chiffres: list[Chiffre], libelles: dict[int, str], tarifs: dict) -> tuple[list[Ligne], bool]:
    """Une ligne forfaitaire par lot, puis une ligne par option, numérotées. Applique le plancher aux lignes fermes."""
    par_lot: dict[int, Ligne] = {}
    options: list[Ligne] = []
    for chiffre in chiffres:
        if chiffre.item["priorite"] == "optionnel":
            options.append(Ligne(lot=chiffre.item["lot"], options=True, chiffres=[chiffre]))
        else:
            par_lot.setdefault(chiffre.item["lot"], Ligne(lot=chiffre.item["lot"], options=False)).chiffres.append(chiffre)
    # Options par lot, puis dans l'ordre du backlog : de la plus importante pour le client à la moins importante.
    options.sort(key=lambda ligne: ligne.lot)
    resultat = [par_lot[lot] for lot in sorted(par_lot)] + options

    for ligne in resultat[: len(par_lot)]:
        libelle = libelles.get(ligne.lot)
        ligne.titre = f"Lot {ligne.lot} : {libelle}" if libelle else f"Lot {ligne.lot}"
        ligne.chiffres.sort(key=lambda c: RANG_PRIORITE[c.item["priorite"]])
        visibles = [methode.nettoyer_typo(c.item["titre"]).rstrip(" .") for c in ligne.chiffres if c.item["audience"] == "client"]
        ligne.description = "\n".join(f"- {titre}" for titre in visibles)
    for numero, ligne in enumerate(options, start=1):
        item = ligne.chiffres[0].item
        if item["audience"] == "client":
            ligne.titre = f"Option {numero} : {methode.nettoyer_typo(item['titre']).rstrip(' .')}"
            ligne.description = "\n".join(f"- {methode.nettoyer_typo(c).rstrip(' .')}" for c in item["criteres_acceptation"])
        else:
            ligne.titre = f"Option {numero}, lot {ligne.lot}"
    for ligne in resultat:
        ligne.prix = methode.arrondi_sup(ligne.somme("brut"))

    fermes = [ligne for ligne in resultat if not ligne.options] or resultat
    total_ferme = sum(ligne.somme("brut") for ligne in fermes)
    plancher = tarifs["plancher_ht"]
    plancher_applique = sum(ligne.prix for ligne in fermes) < plancher
    if plancher_applique:
        facteur = plancher / total_ferme
        for ligne in fermes:
            ligne.prix = methode.arrondi_sup(ligne.somme("brut") * facteur)
    return resultat, plancher_applique


def objet_devis(client: dict, lignes: list[Ligne]) -> str:
    lots = sorted({ligne.lot for ligne in lignes if not ligne.options})
    if not lots:
        texte_lots = "options au choix"
    else:
        texte_lots = f"lot {lots[0]}" if len(lots) == 1 else "lots " + ", ".join(map(str, lots[:-1])) + f" et {lots[-1]}"
        if any(ligne.options for ligne in lignes):
            texte_lots += ", avec options au choix"
    return methode.nettoyer_typo(f"Application de gestion {client['nom']}, {texte_lots}")


def donnees_json(client: dict, date: str, lignes: list[Ligne]) -> dict:
    lignes_json = [
        {
            "titre": ligne.titre,
            "description": ligne.description,
            "quantite": 1,
            "unite": "forfait",
            "prix_unitaire_ht": methode.nombre(ligne.prix),
            "tva": methode.TVA,
        }
        for ligne in lignes
    ]
    total = sum(ligne["quantite"] * ligne["prix_unitaire_ht"] for ligne in lignes_json)
    return {
        "slug": client["slug"],
        "date": date,
        "objet": objet_devis(client, lignes),
        "lignes": lignes_json,
        "total_ht": methode.nombre(total),
    }


# ---------------------------------------------------------------------------
# Markdown interne


def tableau(entetes: list[str], rangees: list[list[str]]) -> list[str]:
    sortie = ["| " + " | ".join(entetes) + " |", "|" + "|".join("---" for _ in entetes) + "|"]
    sortie += ["| " + " | ".join(rangee) + " |" for rangee in rangees]
    return sortie


def rendre_markdown(
    client: dict,
    date: str,
    donnees: dict,
    lignes: list[Ligne],
    modules: dict[str, dict],
    tarifs: dict,
    bilan_modules: dict[str, dict],
    exclus: list[tuple[dict, str]],
    plancher_applique: bool,
    avertissements: list[str],
) -> str:
    taux = tarifs["taux_horaire_cible"]
    chiffres = [c for ligne in lignes for c in ligne.chiffres]
    md = [
        f"# Chiffrage {client['nom']} du {date}",
        "",
        "Audience interne : heures, tarifs et marges ne sortent pas de SKEAM. Produit par catalogue/scripts/chiffrer.py ; méthode dans catalogue/README.md.",
        "",
        f"Paramètres : taux horaire cible {methode.euros(taux)}, marges de sécurité "
        + ", ".join(f"{t} {methode.pourcentage(tarifs['marge_securite'][t])}" for t in methode.TAILLES)
        + f", plancher {methode.euros(tarifs['plancher_ht'])}, arrondi au multiple de {methode.ARRONDI_HT} € supérieur.",
        "",
        "## Synthèse",
        "",
        "Prix min, probable et max : heures multipliées par le taux, sans marge. Prix conseillé : heures probables plus la marge de chaque item, arrondi. Couverture : part du scénario max couverte par le prix conseillé.",
        "",
    ]
    rangees = []
    for ligne in lignes:
        h_min, h_prob, h_max = ligne.somme("h_min"), ligne.somme("h_prob"), ligne.somme("h_max")
        rangees.append([
            ligne.titre, methode.heures(h_min), methode.heures(h_prob), methode.heures(h_max),
            methode.euros(h_min * taux), methode.euros(h_prob * taux), methode.euros(h_max * taux),
            f"**{methode.euros(ligne.prix)}**", methode.pourcentage(ligne.prix / (h_max * taux)),
        ])
    t_min, t_prob, t_max = (sum(c.__dict__[a] for c in chiffres) for a in ("h_min", "h_prob", "h_max"))
    total = donnees["total_ht"]
    rangees.append([
        "**Total**", methode.heures(t_min), methode.heures(t_prob), methode.heures(t_max),
        methode.euros(t_min * taux), methode.euros(t_prob * taux), methode.euros(t_max * taux),
        f"**{methode.euros(total)}**", methode.pourcentage(total / (t_max * taux)),
    ])
    md += tableau(["Ligne", "H min", "H probable", "H max", "Prix min", "Prix probable", "Prix max", "Conseillé", "Couverture"], rangees)
    options = sum(ligne.prix for ligne in lignes if ligne.options)
    if options:
        md += ["", f"Dont options : {methode.euros(options)} ; total sans options : {methode.euros(total - options)}."]
    md += ["", f"Taux horaire effectif au probable : {methode.euros(total / t_prob)} de l'heure."]

    md += ["", "## Lignes du devis", "", f"Objet : {donnees['objet']}", ""]
    md += tableau(
        ["Titre", "Description", "Quantité", "Unité", "Prix unitaire HT", "TVA"],
        [[l["titre"], l["description"].replace("\n", "<br>"), methode.texte_nombre(l["quantite"]), l["unite"],
          methode.fr(l["prix_unitaire_ht"], 2), methode.pourcentage(l["tva"])] for l in donnees["lignes"]],
    )
    md += ["", f"Total HT : {methode.fr(total, 2)} euros. Relire titres et descriptions avant de créer le brouillon Dougs.",
           "", "Dans chaque ligne, fonctionnalités listées de la plus importante pour le client à la moins importante : "
           "priorité de l'item, puis ordre du backlog. Vérifier cet ordre au regard du transcript."]

    md += ["", "## Détail par lot et par module", ""]
    for ligne in lignes:
        md += [f"### {ligne.titre}", ""]
        groupes: dict[str, list[Chiffre]] = {}
        for chiffre in ligne.chiffres:
            groupes.setdefault(chiffre.item["module"] or "hors catalogue", []).append(chiffre)
        rangees = []
        for code, groupe in groupes.items():
            module = modules.get(code)
            rangees.append([
                f"{module['nom']}, `{code}`" if module else f"`{code}`" if code != "hors catalogue" else "Hors catalogue",
                ", ".join(c.item["id"] for c in groupe),
                ", ".join(sorted({c.item["taille"] for c in groupe}, key=methode.TAILLES.index)),
                methode.heures(sum(c.item["estimation_h"] for c in groupe)),
                methode.heures(sum(c.h_min for c in groupe)),
                methode.heures(sum(c.h_prob for c in groupe)),
                methode.heures(sum(c.h_max for c in groupe)),
                module["confiance"] if module else "aucune",
                methode.euros(sum(c.brut for c in groupe)),
            ])
        md += tableau(["Module", "Items", "Tailles", "Backlog", "H min", "H probable", "H max", "Confiance", "Prix brut"], rangees)
        md += [""]

    md += ["## Points d'attention", ""]
    points = []
    hors = [c for c in chiffres if c.categorie == "hors_catalogue"]
    if hors:
        points.append(
            f"**Items hors catalogue**, chiffrés sur l'estimation du backlog, de {methode.pourcentage(methode.FACTEUR_MIN_HORS_CATALOGUE)} "
            f"à {methode.pourcentage(methode.FACTEUR_MAX_HORS_CATALOGUE)} : "
            + ", ".join(f"{c.item['id']} {c.item['titre']}, {methode.heures(c.item['estimation_h'])}" for c in hors) + "."
        )
    inconnus = [c for c in chiffres if c.categorie == "module_inconnu"]
    if inconnus:
        points.append(
            "**Modules absents du catalogue**, traités comme hors catalogue : "
            + ", ".join(f"{c.item['id']} sur `{c.item['module']}`" for c in inconnus) + ". Ajouter le module au catalogue ou corriger l'item."
        )
    faibles = [code for code in bilan_modules if modules[code]["confiance"] == "faible"]
    if faibles:
        points.append(
            "**Modules de confiance faible**, fourchette non encore calibrée, probable égal à l'estimation du backlog : "
            + ", ".join(f"`{code}`" for code in faibles) + "."
        )
    for code, bilan in bilan_modules.items():
        module = modules[code]
        if not module["heures_min"] <= bilan["estimation"] <= module["heures_max"]:
            points.append(
                f"**Écart backlog et catalogue** sur `{code}` : backlog {methode.heures(bilan['estimation'])}, "
                f"catalogue de {methode.heures(module['heures_min'])} à {methode.heures(module['heures_max'])}. "
                "Fourchette élargie à l'estimation du backlog ; vérifier le périmètre ou le catalogue."
            )
        if bilan["probable"] > bilan["estimation"]:
            points.append(
                f"**Probable relevé par les mesures** sur `{code}` : {methode.heures(bilan['probable'])} retenues "
                f"au lieu de {methode.heures(bilan['estimation'])} au backlog, confiance {module['confiance']}."
            )
    for ligne in lignes:
        prix_max = ligne.somme("h_max") * tarifs["taux_horaire_cible"]
        if ligne.prix < methode.SEUIL_COUVERTURE * prix_max:
            points.append(
                f"**Couverture faible** sur {ligne.titre} : le conseillé, {methode.euros(ligne.prix)}, couvre "
                f"{methode.pourcentage(ligne.prix / prix_max)} du scénario max, {methode.euros(prix_max)}. Fourchette large : affiner le périmètre."
            )
    if plancher_applique:
        points.append(f"**Plancher appliqué** : lignes fermes relevées pour atteindre {methode.euros(tarifs['plancher_ht'])}.")
    livres = [c.item for c in chiffres if c.item["statut"] in ("fait", "a_recetter")]
    if livres:
        points.append("**Items déjà livrés inclus** dans le chiffrage : " + ", ".join(f"{i['id']} {i['statut']}" for i in livres) + ".")
    anonymes = [ligne.titre for ligne in lignes if ligne.options and not ligne.description]
    if anonymes:
        points.append("**Options sans description**, item d'audience non client : " + ", ".join(anonymes) + ". Rédiger le titre à la main dans Dougs.")
    caches = [c.item["id"] for c in chiffres if c.item["audience"] != "client"]
    if caches:
        points.append("**Items chiffrés mais absents des descriptions**, audience non client : " + ", ".join(caches) + ".")
    for item, raison in exclus:
        points.append(f"**Exclu** : {item['id']} {item['titre']}, {raison}.")
    for message in avertissements:
        points.append(f"**Avertissement du validateur** : {message}")
    md += [f"- {p}" for p in points] if points else ["Aucun."]
    return "\n".join(md) + "\n"


# ---------------------------------------------------------------------------


def chiffrer(projet: Path, sortie: Path, date: str, dossier_catalogue: Path) -> tuple[Path, Path, dict]:
    modules, tarifs = methode.charger_catalogue(dossier_catalogue)
    rapport = methode.valider_projet(projet, set(modules))
    avertissements = [message for niveau, _, message in rapport.messages if niveau == "AVERTISSEMENT"]
    client = contrat.lire_client(projet)

    retenus, exclus = [], []
    for item in contrat.lire_items(projet):
        if item["statut"] == "abandonne":
            exclus.append((item, "abandonné"))
        else:
            retenus.append(item)
    if not retenus:
        raise ErreurDonnees("aucun item à chiffrer : tous les items sont abandonnés ou à valider")

    chiffres, bilan_modules = chiffrer_items(retenus, modules, tarifs)
    lignes, plancher_applique = composer_lignes(chiffres, libelles_lots(projet), tarifs)
    donnees = donnees_json(client, date, lignes)

    controle = validate.Rapport()
    validate.verifier_chiffrage(controle, "chiffrage", donnees)
    if controle.nb_erreurs:
        raise ErreurDonnees("chiffrage produit non conforme au contrat :\n" + methode.messages_erreur(controle))

    texte_md = rendre_markdown(client, date, donnees, lignes, modules, tarifs, bilan_modules, exclus, plancher_applique, avertissements)
    sortie.mkdir(parents=True, exist_ok=True)
    chemin_md = sortie / f"chiffrage-{date}.md"
    chemin_json = sortie / f"chiffrage-{date}.json"
    chemin_json.write_text(json.dumps(donnees, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    chemin_md.write_text(texte_md, encoding="utf-8")
    return chemin_md, chemin_json, donnees


def main(argv: list[str] | None = None, aujourdhui: str | None = None, dossier_catalogue: Path | None = None) -> int:
    parser = argparse.ArgumentParser(description="Chiffre le backlog d'un projet à partir du catalogue et des tarifs.")
    parser.add_argument("projet", type=Path, help="dossier projet/ ou racine du dépôt qui le contient")
    parser.add_argument("--sortie", type=Path, required=True, help="dossier de sortie, en général <chemin_projet>/devis/")
    args = parser.parse_args(argv)

    if not args.projet.is_dir():
        print(f"chiffrer.py: erreur : {args.projet} introuvable", file=sys.stderr)
        return 2
    projet = validate.resoudre_projet(args.projet)
    try:
        chemin_md, chemin_json, donnees = chiffrer(
            projet, args.sortie, aujourdhui or methode.aujourdhui_paris(), dossier_catalogue or methode.DOSSIER_CATALOGUE
        )
    except ErreurDonnees as exc:
        print(f"{exc}\nchiffrer.py: erreur : chiffrage non produit", file=sys.stderr)
        return 1
    print(f"Chiffrage écrit : {validate.afficher(chemin_md)} et {validate.afficher(chemin_json)}")
    print(f"{donnees['objet']} : {methode.fr(donnees['total_ht'], 2)} euros HT, {len(donnees['lignes'])} lignes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
