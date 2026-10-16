"""Tests du validateur sur le jeu d'exemples exemples/ et le gabarit.

Lancement depuis la racine de skeam-ops :
    python -m unittest discover -s scripts -p "test_*.py"
"""

from __future__ import annotations

import io
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import contrat  # noqa: E402
import nouveau_dossier  # noqa: E402
import validate  # noqa: E402

EXEMPLES = contrat.RACINE_OPS / "exemples"
PROJET_DEMO = EXEMPLES / "racine" / "demo-app" / "projet"


def silencieux(fonction, *args):
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        return fonction(*args)


class BaseProjet(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.projet = self.tmp / "projet"
        shutil.copytree(PROJET_DEMO, self.projet)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp)

    def remplacer(self, relatif: str, avant: str, apres: str) -> None:
        chemin = self.projet / relatif
        texte = chemin.read_text(encoding="utf-8")
        self.assertIn(avant, texte, f"motif absent de {relatif}")
        chemin.write_text(texte.replace(avant, apres, 1), encoding="utf-8")

    def valider(self) -> validate.Rapport:
        rapport = validate.Rapport()
        validate.valider_projet(self.projet, rapport)
        return rapport

    def assertErreur(self, fragment: str) -> None:
        rapport = self.valider()
        erreurs = [m for niveau, _, m in rapport.messages if niveau == "ERREUR"]
        self.assertTrue(any(fragment in m for m in erreurs), f"{fragment!r} absent de {erreurs}")

    def assertAvertissement(self, fragment: str) -> None:
        rapport = self.valider()
        avertissements = [m for niveau, _, m in rapport.messages if niveau == "AVERTISSEMENT"]
        self.assertTrue(any(fragment in m for m in avertissements), f"{fragment!r} absent de {avertissements}")


class TestReferences(unittest.TestCase):
    def test_exemples_valides(self) -> None:
        rapport = validate.Rapport()
        projets = validate.valider_registre(EXEMPLES / "clients.yaml", rapport, EXEMPLES / "racine", validate.codes_catalogue(EXEMPLES / "catalogue"))
        validate.valider_catalogue(EXEMPLES / "catalogue", rapport, projets)
        self.assertEqual(rapport.messages, [])
        self.assertEqual(set(projets), {"demo"})

    def test_gabarit_valide(self) -> None:
        rapport = validate.Rapport()
        validate.valider_projet(contrat.RACINE_OPS / "templates" / "dossier-client", rapport)
        self.assertEqual(rapport.messages, [])

    def test_projet_ops_valide(self) -> None:
        rapport = validate.Rapport()
        validate.valider_projet(contrat.RACINE_OPS / "projet", rapport)
        self.assertEqual([m for m in rapport.messages if m[0] == "ERREUR"], [])

    def test_exemples_du_contrat(self) -> None:
        rapport = validate.Rapport()
        nombre = validate.valider_exemples_contrat(contrat.RACINE_OPS / "CONTRAT.md", rapport)
        self.assertEqual(rapport.messages, [])
        self.assertGreaterEqual(nombre, 13)


class TestYaml(BaseProjet):
    def test_booleen_yes_refuse(self) -> None:
        self.remplacer("backlog/lot0.yaml", "a_valider: false", "a_valider: yes")
        self.assertErreur("seuls true et false sont des booléens")

    def test_siren_sans_guillemets(self) -> None:
        self.remplacer("client.yaml", 'siren: "123456789"', "siren: 123456789")
        self.assertErreur("entre guillemets")

    def test_cle_dupliquee(self) -> None:
        self.remplacer("client.yaml", "apporteur: jonathan", "apporteur: jonathan\napporteur: theo")
        self.assertErreur("clé dupliquée 'apporteur'")

    def test_date_impossible(self) -> None:
        self.remplacer("client.yaml", "cadrage: 2026-10-08", "cadrage: 2026-02-30")
        self.assertErreur("n'est pas une date valide")

    def test_fichier_vide(self) -> None:
        (self.projet / "backlog" / "vide.yaml").write_text("", encoding="utf-8")
        self.assertErreur("type attendu dictionnaire")


class TestStructure(BaseProjet):
    def test_element_non_prevu(self) -> None:
        (self.projet / "notes.md").write_text("# Notes\n", encoding="utf-8")
        self.assertErreur("élément non prévu")

    def test_fichier_manquant(self) -> None:
        (self.projet / "fiche.md").unlink()
        self.assertErreur("fichier obligatoire manquant")

    def test_nom_transcript(self) -> None:
        (self.projet / "transcripts" / "lancement.md").write_text("x", encoding="utf-8")
        self.assertErreur("nom de fichier non conforme")


class TestBacklog(BaseProjet):
    def test_champ_inconnu(self) -> None:
        self.remplacer("backlog/lot0.yaml", "    maj: 2026-10-12\n", "    maj: 2026-10-12\n    responsable: theo\n")
        self.assertErreur("champ non prévu par le contrat : responsable")

    def test_statut_inconnu(self) -> None:
        self.remplacer("backlog/lot1.yaml", "statut: en_cours", "statut: en_test")
        self.assertErreur("valeur 'en_test' non autorisée")

    def test_id_en_double(self) -> None:
        self.remplacer("backlog/lot1.yaml", "id: DEMO-003", "id: DEMO-001")
        self.assertErreur("id DEMO-001 déjà utilisé")

    def test_mauvais_prefixe(self) -> None:
        self.remplacer("backlog/lot1.yaml", "id: DEMO-005", "id: EGM-005")
        self.assertErreur("le préfixe doit être DEMO")

    def test_dependance_introuvable(self) -> None:
        self.remplacer("backlog/lot1.yaml", "      - DEMO-003\n", "      - DEMO-099\n")
        self.assertErreur("dépendance DEMO-099 introuvable")

    def test_cycle(self) -> None:
        self.remplacer("backlog/lot0.yaml", "    dependances: []\n", "    dependances:\n      - DEMO-002\n")
        self.assertErreur("dépendances circulaires")

    def test_item_a_valider_sans_effet(self) -> None:
        # Depuis le 2026-10-16, a_valider ne filtre plus rien : true n'est qu'un avertissement, quelle que soit l'audience.
        self.remplacer("backlog/lot1.yaml", "    audience: interne\n    a_valider: false", "    audience: client\n    a_valider: true")
        self.assertAvertissement("a_valider vaut true, champ sans effet")
        self.assertEqual([m for niveau, _, m in self.valider().messages if niveau == "ERREUR"], [])

    def test_parenthese_item_client(self) -> None:
        self.remplacer("backlog/lot1.yaml", "Planning hebdomadaire des équipes", "Planning hebdomadaire (équipes)")
        self.assertErreur("parenthèse interdite")

    def test_item_invalide_sans_cascade(self) -> None:
        self.remplacer("backlog/lot0.yaml", "    taille: S\n    estimation_h: 4", "    taille: S\n    estimation_h: 0")
        rapport = self.valider()
        messages = [m for _, _, m in rapport.messages]
        self.assertTrue(any("estimation_h" in m for m in messages))
        self.assertFalse(any("DEMO-001 introuvable" in m for m in messages), messages)

    def test_module_hors_catalogue(self) -> None:
        self.remplacer("backlog/lot1.yaml", "module: planning", "module: gestion-stock")
        rapport = validate.Rapport()
        validate.valider_projet(self.projet, rapport, validate.codes_catalogue(EXEMPLES / "catalogue"))
        self.assertTrue(any("absent du catalogue" in m for _, _, m in rapport.messages))
        self.assertEqual(rapport.nb_erreurs, 0)


class TestTemps(BaseProjet):
    fichier = "temps/2026-10-demo-dev.jsonl"

    def test_minutes_incoherentes(self) -> None:
        self.remplacer(self.fichier, '"minutes":135', '"minutes":130')
        self.assertErreur("minutes vaut 130, attendu 135")

    def test_agent_different_du_fichier(self) -> None:
        self.remplacer(self.fichier, '"agent":"demo-dev","note":""', '"agent":"egm-dev","note":""')
        self.assertErreur("différent de celui du nom de fichier")

    def test_mois_different_du_fichier(self) -> None:
        self.remplacer(self.fichier, '"date":"2026-10-10"', '"date":"2026-11-10"')
        self.assertErreur("hors du mois 2026-10")

    def test_item_inconnu(self) -> None:
        self.remplacer(self.fichier, '"item":"DEMO-002"', '"item":"DEMO-042"')
        self.assertErreur("item DEMO-042 introuvable")

    def test_ligne_vide(self) -> None:
        self.remplacer(self.fichier, "\n", "\n\n")
        self.assertErreur("vide")

    def test_source_theo_agent_claude(self) -> None:
        self.remplacer(self.fichier, '"source":"claude-code"', '"source":"theo"')
        self.assertErreur("source theo et agent theo vont ensemble")


class TestDocuments(BaseProjet):
    def test_synthese_section_manquante(self) -> None:
        self.remplacer("syntheses/2026-10-08-lancement.md", "## Zones d'incertitude", "## Risques")
        self.assertErreur("manquant : Zones d'incertitude")

    def test_synthese_tiret_cadratin(self) -> None:
        self.remplacer("syntheses/2026-10-08-lancement.md", "est la priorité", "— la priorité")
        self.assertErreur("tiret cadratin interdit")

    def test_lien_markdown_autorise(self) -> None:
        self.remplacer("syntheses/2026-10-08-lancement.md", "- Format attendu", "- [Format](https://exemple.fr/a) attendu")
        self.assertEqual(self.valider().nb_erreurs, 0)

    def test_synthese_transcript_introuvable(self) -> None:
        self.remplacer("syntheses/2026-10-08-lancement.md", "transcript: transcripts/2026-10-08-lancement.md", "transcript: transcripts/2026-10-09-autre.md")
        self.assertErreur("introuvable")

    def test_transcript_plaud_sans_id(self) -> None:
        self.remplacer("transcripts/2026-10-08-lancement.md", "plaud_id: f3a9c2e1b7d4", "plaud_id: null")
        self.assertErreur("plaud_id est obligatoire si source vaut plaud")

    def test_transcript_date_differente(self) -> None:
        self.remplacer("transcripts/2026-10-08-lancement.md", "date: 2026-10-08", "date: 2026-10-07")
        self.assertErreur("différente de celle du nom de fichier")

    def test_cadrage_regle_manquante(self) -> None:
        self.remplacer("cadrage.md", "- **RG2** :", "- **RG4** :")
        self.assertErreur("sans trou ni doublon")

    def test_cadrage_regle_mal_formee(self) -> None:
        self.remplacer("cadrage.md", "- **RG3** :", "- RG3 :")
        self.assertErreur("règle mal formée")

    def test_cadrage_section_renommee(self) -> None:
        self.remplacer("cadrage.md", "## Sources", "## Références")
        self.assertErreur("manquant : Sources")

    def test_reference_rg_absente(self) -> None:
        self.remplacer("backlog/lot0.yaml", "conformément à RG1", "conformément à RG9")
        self.assertAvertissement("cite RG9")

    def test_decisions_ordre(self) -> None:
        self.remplacer("decisions.md", "## 2026-10-14 Planning", "## 2026-10-01 Planning")
        self.assertErreur("ordre chronologique")

    def test_decisions_champ_manquant(self) -> None:
        self.remplacer("decisions.md", "- **Raison** : budget", "- **Motif** : budget")
        self.assertErreur("Décision | Raison | Impact | Source")

    def test_decisions_contenu_libre(self) -> None:
        self.remplacer("decisions.md", "- **Source** : échange", "Texte libre.\n- **Source** : échange")
        self.assertErreur("contenu hors des champs")

    def test_actions_source_introuvable(self) -> None:
        self.remplacer("actions.yaml", "source: DEMO-004", "source: DEMO-077")
        self.assertErreur("source DEMO-077 introuvable")

    def test_chiffrage_total(self) -> None:
        self.remplacer("devis/chiffrage-2026-10-12.json", '"total_ht": 7500', '"total_ht": 7400')
        self.assertErreur("attendu 7500")

    def test_chiffrage_tva_en_pourcentage(self) -> None:
        self.remplacer("devis/chiffrage-2026-10-12.json", '"tva": 0.2', '"tva": 20')
        self.assertErreur("valeur 20 non autorisée")

    def test_chiffrage_jumeau_manquant(self) -> None:
        (self.projet / "devis" / "chiffrage-2026-10-12.md").unlink()
        self.assertErreur("fichier jumeau manquant")


class TestRegistre(unittest.TestCase):
    def test_statut_divergent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            registre = Path(tmp) / "clients.yaml"
            registre.write_text((EXEMPLES / "clients.yaml").read_text(encoding="utf-8").replace("statut: en_dev", "statut: recette"), encoding="utf-8")
            rapport = validate.Rapport()
            validate.valider_registre(registre, rapport, EXEMPLES / "racine", None)
            self.assertTrue(any("client.yaml qui fait foi" in m for _, _, m in rapport.messages))


class TestLigneDeCommande(unittest.TestCase):
    def test_codes_de_sortie(self) -> None:
        self.assertEqual(silencieux(validate.main, [str(PROJET_DEMO)]), 0)
        self.assertEqual(silencieux(validate.main, [str(contrat.RACINE_OPS / "inexistant")]), 2)
        self.assertEqual(silencieux(validate.main, []), 2)
        with tempfile.TemporaryDirectory() as tmp:
            copie = Path(tmp) / "projet"
            shutil.copytree(PROJET_DEMO, copie)
            (copie / "cadrage.md").unlink()
            self.assertEqual(silencieux(validate.main, [str(copie)]), 1)

    def test_racine_de_depot_acceptee(self) -> None:
        self.assertEqual(silencieux(validate.main, [str(PROJET_DEMO.parent)]), 0)

    def test_nouveau_dossier(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cible = Path(tmp) / "dupont-app"
            self.assertEqual(silencieux(nouveau_dossier.main, ["dupont", "Dupont & Fils: BTP", str(cible), "--depot", "theonam/dupont-app"]), 0)
            client = contrat.lire_client(cible / "projet")
            self.assertEqual((client["slug"], client["nom"], client["liens"]["depot"]), ("dupont", "Dupont & Fils: BTP", "theonam/dupont-app"))
            self.assertEqual(silencieux(nouveau_dossier.main, ["dupont", "Dupont", str(cible)]), 1)
            self.assertEqual(silencieux(nouveau_dossier.main, ["du-pont", "Dupont", str(Path(tmp) / "autre")]), 2)


if __name__ == "__main__":
    unittest.main()
