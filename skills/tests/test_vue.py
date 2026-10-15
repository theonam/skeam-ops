"""Tests de skills/skeam-publier/vue.py sur le client fictif exemples/racine/demo-app.

Lancement depuis la racine de skeam-ops :
    python -m unittest discover -s skills/tests -p "test_*.py"
"""

from __future__ import annotations

import contextlib
import io
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RACINE / "skills" / "skeam-publier"))

import vue  # noqa: E402

DEMO = RACINE / "exemples" / "racine" / "demo-app" / "projet"


def lancer(projet: Path, audience: str) -> tuple[int, str, str]:
    sortie, erreurs = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(erreurs):
        code = vue.main([str(projet), "--audience", audience])
    return code, sortie.getvalue(), erreurs.getvalue()


class VueDemo(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.vues = {}
        for audience in vue.AUDIENCES:
            code, texte, erreurs = lancer(DEMO, audience)
            assert code == 0, erreurs
            cls.vues[audience] = texte

    def test_client_sans_donnee_interne_ni_commerciale(self) -> None:
        texte = self.vues["client"]
        for interdit in ("estimation", "Taille", "Notes", "Dépendances", "Commit", "Module", "euros", "SIREN",
                         "Raison sociale", "Todoist", "Dépôt", "transcripts/", "devis/", "Temps passé",
                         "Actions de Théo", "Fiche client", "Claire Martin : Gérante", "jonathan"):
            self.assertNotIn(interdit, texte, interdit)

    def test_client_items_filtres(self) -> None:
        texte = self.vues["client"]
        self.assertIn("DEMO-003", texte)
        self.assertNotIn("DEMO-004", texte, "item d'audience commercial")
        self.assertNotIn("DEMO-006", texte, "item a_valider")

    def test_client_typographie(self) -> None:
        self.assertIsNone(re.search(r"[—()]", self.vues["client"]))

    def test_commercial(self) -> None:
        texte = self.vues["commercial"]
        self.assertIn("DEMO-004", texte)
        self.assertIn("Module", texte)
        self.assertIn("Fiche client", texte)
        for interdit in ("DEMO-006", "estimation", "Notes", "Todoist", "Dépôt", "transcripts/", "Temps passé", "Actions de Théo"):
            self.assertNotIn(interdit, texte, interdit)

    def test_interne(self) -> None:
        texte = self.vues["interne"]
        for attendu in ("DEMO-006", "estimation", "Notes", "Temps passé", "Actions de Théo", "transcripts/", "## Décisions"):
            self.assertIn(attendu, texte, attendu)

    def test_avancement_selon_le_contrat(self) -> None:
        # Lot 1 : DEMO-003 et DEMO-004 comptés toutes audiences confondues, DEMO-006 exclu car a_valider.
        for audience in vue.AUDIENCES:
            self.assertIn("**Lot 1** : 0 item fait sur 2, soit 0 %", self.vues[audience])
            self.assertIn("**Lot 0** : 2 items faits sur 2, soit 100 %", self.vues[audience])


class VueCopie(unittest.TestCase):
    def setUp(self) -> None:
        self.dossier = Path(tempfile.mkdtemp())
        self.projet = self.dossier / "projet"
        shutil.copytree(DEMO, self.projet)

    def tearDown(self) -> None:
        shutil.rmtree(self.dossier)

    def test_commentaires_retires_et_interne_jamais_lu(self) -> None:
        synthese = self.projet / "syntheses" / "2026-10-08-lancement.md"
        texte = synthese.read_text(encoding="utf-8").replace(
            "- Les compagnons utilisent leur téléphone personnel.",
            "- Les compagnons utilisent leur téléphone personnel. <!-- 00:12:30 marge confidentielle -->",
        )
        synthese.write_text(texte, encoding="utf-8")
        (self.projet / "interne" / "marges.md").write_text("# Marges\n\nSECRET_INTERNE\n", encoding="utf-8")
        for audience in vue.AUDIENCES:
            code, sortie, erreurs = lancer(self.dossier, audience)
            self.assertEqual(code, 0, erreurs)
            self.assertNotIn("00:12:30", sortie)
            self.assertNotIn("marge confidentielle", sortie)
            self.assertNotIn("SECRET_INTERNE", sortie)

    def test_vue_client_refusee_si_parenthese(self) -> None:
        client = self.projet / "client.yaml"
        client.write_text(client.read_text(encoding="utf-8").replace("nom: Démo Bâtiment", "nom: Démo Bâtiment (test)"), encoding="utf-8")
        code, sortie, erreurs = lancer(self.projet, "client")
        self.assertEqual(code, 1)
        self.assertEqual(sortie, "")
        self.assertIn("parenthèse", erreurs)

    def test_dossier_invalide(self) -> None:
        (self.projet / "client.yaml").unlink()
        code, sortie, _ = lancer(self.projet, "interne")
        self.assertEqual(code, 1)
        self.assertEqual(sortie, "")


if __name__ == "__main__":
    unittest.main()
