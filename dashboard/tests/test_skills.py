"""Les skills du chantier dashboard s'installent dans claude.ai : nom en skeam-, description sans balise.

Lancement depuis la racine de skeam-ops :
    python -m unittest discover -s dashboard/tests -p "test_*.py"
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[1] / "skills"


def entete(chemin: Path) -> dict[str, str]:
    texte = chemin.read_text(encoding="utf-8")
    bloc = re.match(r"^---\n(.*?)\n---\n", texte, re.S)
    assert bloc, f"{chemin} : en-tête absent"
    return dict(ligne.split(": ", 1) for ligne in bloc.group(1).splitlines() if ": " in ligne)


class TestSkills(unittest.TestCase):
    def test_nom_du_dossier_en_skeam_et_description_sans_balise(self):
        dossiers = sorted(p for p in SKILLS.iterdir() if p.is_dir())
        self.assertTrue(dossiers)
        for dossier in dossiers:
            with self.subTest(dossier.name):
                champs = entete(dossier / "SKILL.md")
                self.assertTrue(dossier.name.startswith("skeam-"))
                self.assertEqual(champs.get("name"), dossier.name)
                self.assertNotRegex(champs.get("description", ""), r"[<>]", "claude.ai refuse les balises dans la description")
                self.assertLessEqual(len(champs["description"]), 1024)


if __name__ == "__main__":
    unittest.main()
