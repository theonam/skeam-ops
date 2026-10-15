"""Produit la vue Markdown d'un dossier projet pour une audience, CONTRAT.md section 10.

Usage :
    python skills/skeam-publier/vue.py <chemin_projet> --audience interne|commercial|client [--sortie fichier.md]

Lancé depuis la racine de skeam-ops. Valide d'abord le dossier projet et
s'arrête avec le code 1 s'il est invalide. La vue est construite par liste
blanche : un champ n'y figure que si le tableau des audiences l'autorise.
projet/interne/ n'est jamais lu. Les commentaires HTML des documents sont
retirés. Pour l'audience client, la vue est refusée, code 1, si elle contient
un tiret cadratin ou une parenthèse.

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

RE_COMMENTAIRE = re.compile(r"[ \t]*<!--.*?-->", re.S)
RE_TITRE = re.compile(r"^(#{1,6})([ \t]+.*)$")
RE_INTERDIT_CLIENT = re.compile(r"[—()]")


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


def items_visibles(items: list[dict], audience: str) -> list[dict]:
    if audience == "interne":
        return list(items)
    return [i for i in items if not i["a_valider"] and voit(audience, i["audience"])]


def avancement(items: list[dict]) -> dict[int, tuple[int, int]]:
    """Par lot : items faits et items comptés, hors abandonne et hors a_valider, toutes audiences confondues."""
    comptes: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    for item in items:
        if item["statut"] == "abandonne" or item["a_valider"]:
            continue
        comptes[item["lot"]][1] += 1
        if item["statut"] == "fait":
            comptes[item["lot"]][0] += 1
    return {lot: (faits, total) for lot, (faits, total) in comptes.items()}


def section_projet(client: dict, audience: str) -> list[str]:
    lignes = ["## Projet", "", f"- **Client** : {client['nom']}", f"- **Statut** : {STATUTS_PROJET[client['statut']]}"]
    if voit(audience, "commercial"):
        if client["raison_sociale"]:
            lignes.append(f"- **Raison sociale** : {client['raison_sociale']}")
        if client["siren"]:
            lignes.append(f"- **SIREN** : {client['siren']}")
        adresse = client["adresse"]
        if adresse:
            lignes.append(f"- **Adresse** : {adresse['rue']}, {adresse['code_postal']} {adresse['ville']}, {adresse['pays']}")
        lignes.append(f"- **Apporteur** : {client['apporteur']}")
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
            lignes += ["", "### Contacts", ""]
            for contact in client["contacts"]:
                details = [d for d in (contact["role"], contact["email"], contact["tel"]) if d]
                lignes.append(f"- **{contact['nom']}**" + (f" : {', '.join(details)}" if details else ""))
        if client["devis"]:
            lignes += ["", "### Devis", ""]
            for devis in client["devis"]:
                lignes.append(f"- {devis['objet']} : {montant(devis['montant_ht'])}, {STATUTS_DEVIS[devis['statut']]}")
    return lignes


def section_liens(client: dict, audience: str) -> list[str]:
    liens = client["liens"]
    visibles = [("demo", "Démo", "client"), ("prod", "Production", "client"), ("docs_client", "Documents client", "client"),
                ("docs_commercial", "Documents commerciaux", "commercial"),
                ("depot", "Dépôt", "interne"), ("docs_interne", "Documents internes", "interne")]
    lignes = [f"- **{libelle}** : {liens[cle]}" for cle, libelle, niveau in visibles if voit(audience, niveau) and liens[cle]]
    return ["## Liens", "", *lignes] if lignes else []


def section_avancement(items: list[dict], audience: str, temps: list[dict]) -> list[str]:
    comptes = avancement(items)
    if not comptes:
        return ["## Avancement par lot", "", "Aucun item à ce jour."]
    lignes = ["## Avancement par lot", ""]
    for lot in sorted(comptes):
        faits, total = comptes[lot]
        libelle = "item fait" if faits <= 1 else "items faits"
        lignes.append(f"- **Lot {lot}** : {faits} {libelle} sur {total}, soit {faits * 100 // total} %")
    if audience == "interne":
        minutes = defaultdict(int)
        for ligne in temps:
            minutes[ligne["item"]] += ligne["minutes"]
        lignes += ["", "### Estimations et temps passé", ""]
        for lot in sorted({i["lot"] for i in items}):
            du_lot = [i for i in items if i["lot"] == lot and i["statut"] != "abandonne"]
            estime = sum(i["estimation_h"] for i in du_lot)
            passe = sum(minutes[i["id"]] for i in du_lot) / 60
            lignes.append(f"- **Lot {lot}** : {heures(estime)} estimées, {heures(passe)} passées")
        hors_item = minutes.get(None, 0) / 60
        lignes.append(f"- **Hors item** : {heures(hors_item)} passées")
    return lignes


def section_backlog(items: list[dict], audience: str) -> list[str]:
    visibles = items_visibles(items, audience)
    lignes = ["## Backlog", ""]
    if not visibles:
        return lignes + ["Aucun item à ce jour."]
    for lot in sorted({i["lot"] for i in visibles}):
        lignes += [f"### Lot {lot}", ""]
        for item in (i for i in visibles if i["lot"] == lot):
            lignes += [f"#### {item['id']} {item['titre']}", ""]
            lignes.append(f"- **Statut** : {STATUTS_ITEM[item['statut']]}")
            lignes.append(f"- **Priorité** : {item['priorite']}")
            if voit(audience, "commercial") and item["module"]:
                lignes.append(f"- **Module** : {item['module']}")
            if audience == "interne":
                lignes.append(f"- **Taille** : {item['taille']}, estimation {heures(item['estimation_h'])}")
                lignes.append(f"- **Audience** : {item['audience']}" + (", à valider" if item["a_valider"] else ""))
                if item["dependances"]:
                    lignes.append(f"- **Dépendances** : {' ; '.join(item['dependances'])}")
                if item["commit"]:
                    lignes.append(f"- **Commit** : {item['commit']}")
                if item.get("notes"):
                    lignes.append(f"- **Notes** : {item['notes']}")
            lignes.append(f"- **Mis à jour le** : {item['maj']}")
            lignes.append("- **Critères d'acceptation** :")
            lignes += [f"  - {critere}" for critere in item["criteres_acceptation"]]
            lignes.append("")
    return lignes[:-1] if lignes[-1] == "" else lignes


def section_document(titre: str, chemin: Path) -> list[str]:
    _, corps = document(chemin, 1)
    return [f"## {titre}", "", corps] if corps.strip() else []


def section_syntheses(projet: Path) -> list[str]:
    fichiers = sorted((projet / "syntheses").glob("*.md"))
    if not fichiers:
        return []
    lignes = ["## Synthèses de réunion"]
    for fichier in fichiers:
        titre, corps = document(fichier, 2)
        lignes += ["", f"### {fichier.name[:10]} {titre or fichier.stem}", "", corps]
    return lignes


def sections_internes(projet: Path, temps: list[dict]) -> list[str]:
    lignes: list[str] = []
    actions = contrat.lire_actions(projet)
    if actions:
        lignes += ["## Actions de Théo", ""]
        for action in actions:
            echeance = f", échéance {action['echeance']}" if action["echeance"] else ""
            lignes.append(f"- **{action['id']}** {action['titre']} : {STATUTS_ACTION[action['statut']]}, {action['priorite']}, {action['points']}{echeance}")
        lignes.append("")
    _, decisions = document(projet / "decisions.md", 1)
    if decisions.strip():
        lignes += ["## Décisions", "", decisions, ""]
    if temps:
        par_agent: dict[str, int] = defaultdict(int)
        a_relire = 0
        for ligne in temps:
            par_agent[ligne["agent"]] += ligne["minutes"]
            a_relire += 0 if ligne["valide"] else ligne["minutes"]
        lignes += ["## Temps passé", ""]
        lignes += [f"- **{agent}** : {heures(minutes / 60)}" for agent, minutes in sorted(par_agent.items())]
        lignes += [f"- **À relire** : {heures(a_relire / 60)} non validées", ""]
    transcripts = sorted(p.name for p in (projet / "transcripts").glob("*.md"))
    chiffrages = sorted(p.name for p in (projet / "devis").glob("chiffrage-*.md"))
    if transcripts or chiffrages:
        lignes += ["## Fichiers internes", ""]
        lignes += [f"- transcripts/{nom}" for nom in transcripts]
        lignes += [f"- devis/{nom}" for nom in chiffrages]
        lignes.append("")
    return lignes[:-1] if lignes and lignes[-1] == "" else lignes


def construire_vue(projet: Path, audience: str, aujourd_hui: str) -> str:
    client = contrat.lire_client(projet)
    items = contrat.lire_items(projet)
    temps = contrat.lire_temps(projet) if audience == "interne" else []
    titres = {"client": "suivi du projet", "commercial": "vue commerciale", "interne": "vue interne"}
    blocs: list[list[str]] = [
        [f"# {client['nom']} : {titres[audience]}", "", f"Document mis à jour le {aujourd_hui}."],
        section_projet(client, audience),
        section_liens(client, audience),
        section_avancement(items, audience, temps),
        section_backlog(items, audience),
        section_document("Cadrage", projet / "cadrage.md"),
        section_syntheses(projet),
    ]
    if voit(audience, "commercial"):
        blocs.append(section_document("Fiche client", projet / "fiche.md"))
    if audience == "interne":
        blocs.append(sections_internes(projet, temps))
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
