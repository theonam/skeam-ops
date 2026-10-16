"""Outils communs aux tests du chantier catalogue.

Lancement depuis la racine de skeam-ops :
    python -m unittest discover -s catalogue/tests -p "test_*.py"
"""

from __future__ import annotations

import io
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

DOSSIER_TESTS = Path(__file__).resolve().parent
sys.path.insert(0, str(DOSSIER_TESTS.parent / "scripts"))

import methode  # noqa: E402
from methode import contrat, validate  # noqa: E402

DONNEES = DOSSIER_TESTS / "donnees"
CATALOGUE_ESSAI = DONNEES / "catalogue"
PROJET_FICTIF = DONNEES / "racine" / "fictif-app" / "projet"


def executer(fonction, *args, **kwargs) -> tuple[int, str, str]:
    """Appelle main() en capturant ses sorties ; renvoie (code, sortie, erreurs)."""
    sortie, erreurs = io.StringIO(), io.StringIO()
    with redirect_stdout(sortie), redirect_stderr(erreurs):
        try:
            code = fonction(*args, **kwargs)
        except SystemExit as exc:
            code = exc.code
    return code, sortie.getvalue(), erreurs.getvalue()


class BaseTemporaire(unittest.TestCase):
    """Copie le jeu d'essai dans un dossier temporaire : les tests ne modifient jamais donnees/."""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.donnees = self.tmp / "donnees"
        shutil.copytree(DONNEES, self.donnees)
        self.projet = self.donnees / "racine" / "fictif-app" / "projet"
        self.catalogue = self.donnees / "catalogue"

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp)

    def remplacer(self, chemin: Path, avant: str, apres: str) -> None:
        texte = chemin.read_text(encoding="utf-8")
        self.assertIn(avant, texte, f"motif absent de {chemin}")
        chemin.write_text(texte.replace(avant, apres, 1), encoding="utf-8")

    def assertProjetValide(self, projet: Path) -> None:
        rapport = validate.Rapport()
        validate.valider_projet(projet, rapport)
        erreurs = [m for niveau, _, m in rapport.messages if niveau == "ERREUR"]
        self.assertEqual(erreurs, [])
