"""Tests du vrai catalogue : catalogue/modules.yaml et catalogue/tarifs.yaml."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from outils import PROJET_FICTIF, contrat, executer, methode

import chiffrer

SEUILS_TAILLE = [("XS", 3), ("S", 6), ("M", 12), ("L", 24), ("XL", float("inf"))]


class TestCatalogueReel(unittest.TestCase):
    def setUp(self) -> None:
        self.modules, self.tarifs = methode.charger_catalogue(methode.DOSSIER_CATALOGUE)

    def test_valide_pour_le_contrat(self):
        rapport = methode.verifier_catalogue(methode.DOSSIER_CATALOGUE)
        self.assertEqual(rapport.nb_erreurs, 0, methode.messages_erreur(rapport))

    def test_taille_type_coherente_avec_la_fourchette(self):
        # Règle de catalogue/HYPOTHESES.md : la taille découle du milieu de la fourchette.
        for code, module in self.modules.items():
            attendue = next(taille for taille, seuil in SEUILS_TAILLE if methode.milieu(module) <= seuil)
            self.assertEqual(module["taille_type"], attendue, code)

    def test_chaque_module_justifie(self):
        hypotheses = (methode.DOSSIER_CATALOGUE / "HYPOTHESES.md").read_text(encoding="utf-8")
        titres = {texte for _, texte, _ in contrat.titres(hypotheses)}
        for code in self.modules:
            self.assertTrue(any(f"`{code}`" in titre for titre in titres), f"{code} sans section dans HYPOTHESES.md")

    def test_chiffre_le_projet_fictif(self):
        with tempfile.TemporaryDirectory() as dossier:
            code, _, erreurs = executer(chiffrer.main, [str(PROJET_FICTIF), "--sortie", dossier], aujourdhui="2026-10-15")
            self.assertEqual(code, 0, erreurs)
            self.assertTrue((Path(dossier) / "chiffrage-2026-10-15.json").is_file())


if __name__ == "__main__":
    unittest.main()
