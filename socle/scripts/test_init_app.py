"""Tests de socle/scripts/init_app.sh, interface de CONTRAT.md section 11.6.

Lancer depuis la racine de skeam-ops : python -m unittest discover -s socle/scripts -p "test_*.py"
"""

import hashlib
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "init_app.sh"


def run(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", str(SCRIPT), *args], capture_output=True, text=True)


def snapshot(folder: Path) -> dict[str, str]:
    return {str(p.relative_to(folder)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.rglob("*")) if p.is_file()}


class InitAppTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.target = Path(self.tmp.name) / "demo-app"
        projet = self.target / "projet"
        projet.mkdir(parents=True)
        (projet / "client.yaml").write_text('slug: demo\nnom: Démo Bâtiment\n', encoding="utf-8")
        (projet / "CLAUDE-projet.md").write_text("# Consignes\n", encoding="utf-8")
        (self.target / "README.md").write_text("# Mon dépôt\n", encoding="utf-8")
        (self.target / ".git").mkdir()
        (self.target / ".git" / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_usage(self):
        self.assertEqual(run().returncode, 2)
        self.assertEqual(run("a", "b").returncode, 2)
        self.assertIn("Usage", run().stderr)

    def test_initialise_sans_toucher_projet_ni_readme(self):
        before_projet = snapshot(self.target / "projet")
        before_git = snapshot(self.target / ".git")
        result = run(str(self.target))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(snapshot(self.target / "projet"), before_projet)
        self.assertEqual(snapshot(self.target / ".git"), before_git)
        self.assertEqual((self.target / "README.md").read_text(encoding="utf-8"), "# Mon dépôt\n")
        for expected in ["package.json", "src/config/access.ts", "db/migrations/0000_socle.sql", "Dockerfile", "render.yaml", ".github/workflows/ci.yml", "SOCLE_VERSION"]:
            self.assertTrue((self.target / expected).is_file(), expected)
        for absent in ["node_modules", ".next", ".env"]:
            self.assertFalse((self.target / absent).exists(), absent)
        claude = (self.target / "CLAUDE.md").read_text(encoding="utf-8").splitlines()
        self.assertIn("@projet/CLAUDE-projet.md", claude)
        render = (self.target / "render.yaml").read_text(encoding="utf-8")
        self.assertIn("name: demo-prod", render)
        self.assertIn('value: "Démo Bâtiment"', render)
        self.assertNotIn("__SLUG__", render)
        env = (self.target / ".env.example").read_text(encoding="utf-8")
        self.assertIn("SESSION_COOKIE_NAME=demo_session", env)

    def test_complete_un_claude_md_existant(self):
        (self.target / "CLAUDE.md").write_text("# Mes consignes", encoding="utf-8")
        self.assertEqual(run(str(self.target)).returncode, 0)
        lines = (self.target / "CLAUDE.md").read_text(encoding="utf-8").splitlines()
        self.assertEqual(lines[0], "# Mes consignes")
        self.assertIn("@projet/CLAUDE-projet.md", lines)
        # Deuxième passage refusé, CLAUDE.md non doublé.
        self.assertEqual(run(str(self.target)).returncode, 1)
        self.assertEqual((self.target / "CLAUDE.md").read_text(encoding="utf-8").count("@projet/CLAUDE-projet.md"), 1)

    def test_refuse_d_ecraser_et_n_ecrit_rien(self):
        (self.target / "package.json").write_text("{}", encoding="utf-8")
        before = snapshot(self.target)
        result = run(str(self.target))
        self.assertEqual(result.returncode, 1)
        self.assertIn("package.json", result.stderr)
        self.assertEqual(snapshot(self.target), before)

    def test_cible_neuve_sans_projet(self):
        fresh = Path(self.tmp.name) / "nouvelle-app"
        self.assertEqual(run(str(fresh)).returncode, 0)
        self.assertTrue((fresh / "README.md").is_file())
        self.assertIn("@projet/CLAUDE-projet.md", (fresh / "CLAUDE.md").read_text(encoding="utf-8"))
        self.assertFalse((fresh / "projet").exists())
        self.assertIn("name: nouvelle-prod", (fresh / "render.yaml").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
