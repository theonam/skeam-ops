"""Produit la vue Markdown d'un dossier projet pour une audience, CONTRAT.md section 10.

Usage :
    python skills/skeam-publier/vue.py <chemin_projet> --audience interne|commercial|client [--sortie fichier.md]

Lancé depuis la racine de skeam-ops. Valide d'abord le dossier projet et
s'arrête avec le code 1 s'il est invalide. La vue est construite par liste
blanche : un champ n'y figure que si le tableau des audiences l'autorise.
projet/interne/ n'est jamais lu. Les commentaires HTML des documents sont
retirés. Pour l'audience client, la vue est refusée, code 1, si elle contient
un tiret cadratin ou une parenthèse.

La vue est découpée en onglets. Chaque onglet commence par une ligne
`<!-- onglet: Nom -->` ; /skeam-publier en fait un onglet du doc Claude.
Onglets, selon l'audience : Accueil, Backlog, Cadrage, Réunions, Fiche client
pour commercial et interne, Suivi interne pour interne.

Sortie : la vue sur la sortie standard, ou dans le fichier --sortie.
Code de sortie : 0 succès, 1 dossier invalide ou vue client non conforme,
2 usage incorrect.
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

import contrat  # noqa: E402
import validate  # noqa: E402

AUDIENCES = ("interne", "commercial", "client")
NIVEAU = {"client": 0, "commercial": 1, "interne": 2}

STATUTS_PROJET = {
    "prospect": "prospect",
    "cadrage": "cadrage",
    "devis_envoye": "devis envoyé",
    "signe": "signé",
    "en_dev": "en développement",
    "recette": "recette",
    "run": "en service",
    "clos": "clos",
}
STATUTS_ITEM = {
    "a_faire": "à faire",
    "en_cours": "en cours",
    "a_recetter": "à recetter",
    "fait": "fait",
    "abandonne": "abandonné",
}
STATUTS_DEVIS = {"brouillon": "brouillon", "envoye": "envoyé", "accepte": "accepté", "refuse": "refusé"}
STATUTS_ACTION = {"ouverte": "ouverte", "faite": "faite", "annulee": "annulée"}
APPORTEURS = {"theo": "Théo", "jonathan": "Jonathan", "autre": "autre"}
CONSTRUITS = ("a_recetter", "fait")

RE_COMMENTAIRE = re.compile(r"[ \t]*<!--.*?-->", re.S)
RE_TITRE = re.compile(r"^(#{1,6})([ \t]+.*)$")
RE_INTERDIT_CLIENT = re.compile(r"[—()]")
RE_LOT_CADRAGE = re.compile(r"^- \*\*Lot (\d+)\*\* : (.+)$")


def onglet(nom: str) -> str:
    return f"<!-- onglet: {nom} -->"


def voit(audience: str, niveau_minimal: str) -> bool:
    """Vrai si l'audience voit une donnée dont le niveau minimal est niveau_minimal."""
    return NIVEAU[audience] >= NIVEAU[niveau_minimal]


def montant(valeur: float) -> str:
    entier, decimales = f"{valeur:,.2f}".split(".")
    entier = entier.replace(",", " ")
    return f"{entier} euros HT" if decimales == "00" else f"{entier},{decimales} euros HT"


def heures(valeur: float) -> str:
    texte = f"{valeur:.2f}".rstrip("0").rstrip(".").replace(".", ",")
    return f"{texte} h"


def cellule(texte: str) -> str:
    return texte.replace("|", "\\|").replace("\n", " ")


def tableau(entetes: list[str], lignes: list[list[str]]) -> list[str]:
    sortie = ["| " + " | ".join(entetes) + " |", "|" + "---|" * len(entetes)]
    sortie += ["| " + " | ".join(cellule(c) for c in ligne) + " |" for ligne in lignes]
    return sortie


def retirer_commentaires(texte: str) -> str:
    texte = RE_COMMENTAIRE.sub("", texte)
    lignes = [ligne.rstrip() for ligne in texte.split("\n")]
    resultat: list[str] = []
    for ligne in lignes:
        if not ligne and resultat and not resultat[-1]:
            continue
        resultat.append(ligne)
    return "\n".join(resultat).strip("\n")


def decaler_titres(texte: str, decalage: int) -> str:
    """Retire le titre de niveau 1 et abaisse les autres titres de decalage niveaux, hors blocs de code."""
    sortie = []
    for _, ligne, dans_code in contrat.lignes_utiles(texte):
        correspondance = None if dans_code else RE_TITRE.match(ligne)
        if correspondance and len(correspondance.group(1)) == 1:
            continue
        if correspondance:
            niveau = min(6, len(correspondance.group(1)) + decalage)
            ligne = "#" * niveau + correspondance.group(2)
        sortie.append(ligne)
    return "\n".join(sortie).strip("\n")


def titre_niveau1(texte: str) -> str | None:
    for niveau, titre, _ in contrat.titres(texte):
        if niveau == 1:
            return titre
    return None


def document(chemin: Path, decalage: int) -> tuple[str | None, str]:
    """Lit un document Markdown du contrat : titre de niveau 1 et corps sans en-tête ni commentaires."""
    _, corps, _ = contrat.separer_entete(chemin.read_text(encoding="utf-8"))
    corps = retirer_commentaires(corps)
    return titre_niveau1(corps), decaler_titres(corps, decalage)


def section_cadrage(projet: Path, nom: str) -> list[str]:
    """Puces d'une section de niveau 2 de cadrage.md, sans commentaires."""
    _, corps = document(projet / "cadrage.md", 0)
    puces: list[str] = []
    dedans = False
    for ligne in corps.split("\n"):
        if ligne.startswith("## "):
            dedans = ligne[3:].strip() == nom
            continue
        if dedans and ligne.startswith("- "):
            puces.append(ligne)
    return puces


def items_visibles(items: list[dict], audience: str) -> list[dict]:
    if audience == "interne":
        return list(items)
    return [i for i in items if not i["a_valider"] and voit(audience, i["audience"])]


def avancement(items: list[dict], avec_a_valider: bool = False) -> dict[int, dict[str, int]]:
    """Par lot : items comptés, construits et recettés, hors abandonne, toutes audiences confondues.

    Recettés = fait, seul compté par CONTRAT.md section 10. Construits = a_recetter ou fait.
    Les items a_valider sont exclus, sauf pour la vue interne, libre.
    """
    comptes: dict[int, dict[str, int]] = defaultdict(lambda: {"total": 0, "construits": 0, "recettes": 0, "a_valider": 0})
    for item in items:
        if item["statut"] == "abandonne" or (item["a_valider"] and not avec_a_valider):
            continue
        lot = comptes[item["lot"]]
        lot["total"] += 1
        lot["construits"] += item["statut"] in CONSTRUITS
        lot["recettes"] += item["statut"] == "fait"
        lot["a_valider"] += bool(item["a_valider"])
    return comptes


def onglet_accueil(projet: Path, client: dict, items: list[dict], audience: str, temps: list[dict]) -> list[str]:
    interne = audience == "interne"
    lignes = [onglet("Accueil"), "", f"Projet **{client['nom']}**, statut **{STATUTS_PROJET[client['statut']]}**.", ""]

    lignes += ["## Livrables", ""]
    comptes = avancement(items, avec_a_valider=interne)
    contenus = {}
    for puce in section_cadrage(projet, "Découpage en lots"):
        correspondance = RE_LOT_CADRAGE.match(puce)
        if correspondance:
            contenus[int(correspondance.group(1))] = correspondance.group(2).split(". ")[0].rstrip(".")
    if comptes:
        entetes = ["Lot", "Contenu", "Construits", "Recettés"]
        if interne:
            entetes += ["À valider", "Estimé", "Passé"]
            minutes = defaultdict(int)
            for ligne in temps:
                minutes[ligne["item"]] += ligne["minutes"]
        rangees = []
        for lot in sorted(comptes):
            c = comptes[lot]
            rangee = [f"Lot {lot}", contenus.get(lot, ""), f"{c['construits']} sur {c['total']}",
                      f"{c['recettes']} sur {c['total']}, soit {c['recettes'] * 100 // c['total']} %"]
            if interne:
                du_lot = [i for i in items if i["lot"] == lot and i["statut"] != "abandonne"]
                rangee += [str(c["a_valider"]), heures(sum(i["estimation_h"] for i in du_lot)),
                           heures(sum(minutes[i["id"]] for i in du_lot) / 60)]
            rangees.append(rangee)
        lignes += tableau(entetes, rangees)
        lignes += ["", "Construits : items livrés par le développement, à recetter ou faits. Recettés : items validés, statut fait."]
    else:
        lignes.append("Aucun item à ce jour.")

    if interne:
        ouvertes = [a for a in contrat.lire_actions(projet) if a["statut"] == "ouverte"]
        ouvertes.sort(key=lambda a: (a["echeance"] or "9999-99-99", a["priorite"]))
        lignes += ["", "## Prochaines actions", ""]
        if ouvertes:
            lignes += tableau(["Échéance", "Action", "Priorité", "Points"],
                              [[a["echeance"] or "", f"{a['id']} {a['titre']}", a["priorite"], a["points"]] for a in ouvertes[:8]])
            if len(ouvertes) > 8:
                lignes += ["", f"Et {len(ouvertes) - 8} autres dans l'onglet Suivi interne."]
        else:
            lignes.append("Aucune action ouverte.")

    attendus = section_cadrage(projet, "Attendus du client")
    if attendus:
        lignes += ["", "## Attendus du client", "", *attendus]
    questions = section_cadrage(projet, "Questions ouvertes")
    if questions:
        lignes += ["", "## Questions ouvertes", "", (f"{len(questions)} questions, détail dans l'onglet Cadrage. Les premières :" if len(questions) > 5 else f"Détail dans l'onglet Cadrage."), "", *questions[:5]]

    liens = client["liens"]
    visibles = [("demo", "Démo", "client"), ("prod", "Production", "client"), ("docs_client", "Documents client", "client"),
                ("docs_commercial", "Documents commerciaux", "commercial"),
                ("depot", "Dépôt", "interne"), ("docs_interne", "Documents internes", "interne")]
    puces = [f"- **{libelle}** : {liens[cle]}" for cle, libelle, niveau in visibles if voit(audience, niveau) and liens[cle]]
    if puces:
        lignes += ["", "## Liens", "", *puces]
    return lignes


def onglet_backlog(items: list[dict], audience: str) -> list[str]:
    visibles = items_visibles(items, audience)
    lignes = [onglet("Backlog")]
    if not visibles:
        return lignes + ["", "Aucun item à ce jour."]
    for lot in sorted({i["lot"] for i in visibles}):
        entetes = ["Id", "Titre", "Statut", "Priorité"]
        if voit(audience, "commercial"):
            entetes.append("Module")
        if audience == "interne":
            entetes += ["Taille", "Audience"]
        entetes.append("Critères d'acceptation")
        if audience == "interne":
            entetes.append("Notes et dépendances")
        rangees = []
        for item in (i for i in visibles if i["lot"] == lot):
            statut = STATUTS_ITEM[item["statut"]]
            if audience == "interne" and item["a_valider"]:
                statut += ", à valider"
            rangee = [item["id"], item["titre"], statut, item["priorite"]]
            if voit(audience, "commercial"):
                rangee.append(item["module"] or "")
            if audience == "interne":
                rangee += [f"{item['taille']}, estimation {heures(item['estimation_h'])}", item["audience"]]
            rangee.append(" ; ".join(item["criteres_acceptation"]))
            if audience == "interne":
                details = [item.get("notes") or ""]
                if item["dependances"]:
                    details.append("Dépend de " + ", ".join(item["dependances"]))
                if item["commit"]:
                    details.append(f"Commit {item['commit']}")
                rangee.append(" ".join(d for d in details if d))
            rangees.append(rangee)
        lignes += ["", f"## Lot {lot}", "", *tableau(entetes, rangees)]
    return lignes


def onglet_document(nom: str, chemin: Path) -> list[str]:
    _, corps = document(chemin, 0)
    return [onglet(nom), "", corps] if corps.strip() else []


def onglet_reunions(projet: Path) -> list[str]:
    fichiers = sorted((projet / "syntheses").glob("*.md"), reverse=True)
    if not fichiers:
        return []
    lignes = [onglet("Réunions")]
    for fichier in fichiers:
        titre, corps = document(fichier, 1)
        lignes += ["", f"## {fichier.name[:10]} {titre or fichier.stem}", "", corps]
    return lignes


def onglet_fiche(projet: Path, client: dict, audience: str) -> list[str]:
    lignes = [onglet("Fiche client"), "", "## Données du client", ""]
    if client["raison_sociale"]:
        lignes.append(f"- **Raison sociale** : {client['raison_sociale']}")
    if client["siren"]:
        lignes.append(f"- **SIREN** : {client['siren']}")
    adresse = client["adresse"]
    if adresse:
        lignes.append(f"- **Adresse** : {adresse['rue']}, {adresse['code_postal']} {adresse['ville']}, {adresse['pays']}")
    lignes.append(f"- **Apporteur** : {APPORTEURS[client['apporteur']]}")
    for cle, libelle in (("premier_contact", "Premier contact"), ("cadrage", "Cadrage"), ("signature", "Signature"), ("mise_en_service", "Mise en service")):
        if client["dates"][cle]:
            lignes.append(f"- **{libelle}** : {client['dates'][cle]}")
    montants = client["montants_ht"]
    lignes.append(f"- **Build signé** : {montant(montants['build_signe'])}")
    lignes.append(f"- **Options signées** : {montant(montants['options_signees'])}")
    lignes.append(f"- **Run annuel** : {montant(montants['run_annuel'])}")
    if audience == "interne":
        todoist = client["todoist"]
        lignes.append(f"- **Todoist** : projet {todoist['projet_id'] or 'non renseigné'}, section {todoist['section_id'] or 'non renseignée'}")
    if client["contacts"]:
        lignes += ["", "## Contacts", ""]
        for contact in client["contacts"]:
            details = [d for d in (contact["role"], contact["email"], contact["tel"]) if d]
            lignes.append(f"- **{contact['nom']}**" + (f" : {', '.join(details)}" if details else ""))
    if client["devis"]:
        lignes += ["", "## Devis", ""]
        lignes += [f"- {d['objet']} : {montant(d['montant_ht'])}, {STATUTS_DEVIS[d['statut']]}" for d in client["devis"]]
    _, fiche = document(projet / "fiche.md", 0)
    if fiche.strip():
        lignes += ["", fiche]
    return lignes


def onglet_suivi_interne(projet: Path, temps: list[dict]) -> list[str]:
    lignes = [onglet("Suivi interne")]
    actions = contrat.lire_actions(projet)
    if actions:
        lignes += ["", "## Actions de Théo", ""]
        lignes += tableau(["Id", "Action", "Statut", "Priorité", "Points", "Échéance", "Todoist"],
                          [[a["id"], a["titre"], STATUTS_ACTION[a["statut"]], a["priorite"], a["points"], a["echeance"] or "",
                            "oui" if a["todoist_id"] else "non"] for a in actions])
    _, decisions = document(projet / "decisions.md", 1)
    if decisions.strip():
        lignes += ["", "## Décisions", "", decisions]
    if temps:
        par_agent: dict[str, int] = defaultdict(int)
        a_relire = 0
        for ligne in temps:
            par_agent[ligne["agent"]] += ligne["minutes"]
            a_relire += 0 if ligne["valide"] else ligne["minutes"]
        lignes += ["", "## Temps passé", ""]
        lignes += [f"- **{agent}** : {heures(minutes / 60)}" for agent, minutes in sorted(par_agent.items())]
        lignes.append(f"- **À relire** : {heures(a_relire / 60)} non validées")
    transcripts = sorted(p.name for p in (projet / "transcripts").glob("*.md"))
    chiffrages = sorted(p.name for p in (projet / "devis").glob("chiffrage-*.md"))
    if transcripts or chiffrages:
        lignes += ["", "## Fichiers internes", ""]
        lignes += [f"- transcripts/{nom}" for nom in transcripts]
        lignes += [f"- devis/{nom}" for nom in chiffrages]
    return lignes


def construire_vue(projet: Path, audience: str, aujourd_hui: str) -> str:
    client = contrat.lire_client(projet)
    items = contrat.lire_items(projet)
    temps = contrat.lire_temps(projet) if audience == "interne" else []
    titres = {"client": "suivi du projet", "commercial": "vue commerciale", "interne": "vue interne"}
    blocs: list[list[str]] = [
        [f"# {client['nom']} : {titres[audience]}", "", f"Document mis à jour le {aujourd_hui}."],
        onglet_accueil(projet, client, items, audience, temps),
        onglet_backlog(items, audience),
        onglet_document("Cadrage", projet / "cadrage.md"),
        onglet_reunions(projet),
    ]
    if voit(audience, "commercial"):
        blocs.append(onglet_fiche(projet, client, audience))
    if audience == "interne":
        blocs.append(onglet_suivi_interne(projet, temps))
    return "\n\n".join("\n".join(bloc) for bloc in blocs if bloc) + "\n"


def controler_client(vue: str) -> list[str]:
    return [f"ligne {numero} : {ligne.strip()}" for numero, ligne in enumerate(vue.split("\n"), start=1) if RE_INTERDIT_CLIENT.search(ligne)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Vue Markdown d'un dossier projet pour une audience.")
    parser.add_argument("projet", type=Path, help="dossier projet/ ou racine du dépôt qui le contient")
    parser.add_argument("--audience", required=True, choices=AUDIENCES)
    parser.add_argument("--sortie", type=Path, help="fichier Markdown à écrire ; sortie standard par défaut")
    args = parser.parse_args(argv)

    projet = args.projet
    if not (projet / "client.yaml").is_file() and (projet / "projet" / "client.yaml").is_file():
        projet = projet / "projet"

    rapport = validate.Rapport()
    validate.valider_projet(projet, rapport)
    if rapport.nb_erreurs:
        for niveau, chemin, message in rapport.messages:
            if niveau == "ERREUR":
                print(f"ERREUR {chemin}: {message}", file=sys.stderr)
        print(f"vue.py: erreur : {projet} invalide, aucune vue produite", file=sys.stderr)
        return 1

    aujourd_hui = datetime.now(ZoneInfo(contrat.FUSEAU)).date().isoformat()
    vue = construire_vue(projet, args.audience, aujourd_hui)

    if args.audience == "client":
        ecarts = controler_client(vue)
        if ecarts:
            for ecart in ecarts:
                print(f"vue.py: erreur : tiret cadratin ou parenthèse en vue client, {ecart}", file=sys.stderr)
            return 1

    if args.sortie:
        args.sortie.parent.mkdir(parents=True, exist_ok=True)
        args.sortie.write_text(vue, encoding="utf-8")
    else:
        sys.stdout.write(vue)
    return 0


if __name__ == "__main__":
    sys.exit(main())
