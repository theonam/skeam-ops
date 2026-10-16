"""Tests du pointage automatique du temps : dashboard/scripts/pointage.py.

Lancement depuis la racine de skeam-ops :
    python -m unittest discover -s dashboard/tests -p "test_*.py"
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ICI = Path(__file__).resolve().parent
RACINE_OPS = ICI.parents[1]
sys.path.insert(0, str(RACINE_OPS / "dashboard" / "scripts"))
sys.path.insert(0, str(RACINE_OPS / "scripts"))

import contrat  # noqa: E402
import pointage  # noqa: E402

PARIS = ZoneInfo("Europe/Paris")


def t(texte: str) -> float:
    """Horodatage d'une heure de Paris, « 2026-10-16 21:30:00 »."""
    return datetime.strptime(texte, "%Y-%m-%d %H:%M:%S").replace(tzinfo=PARIS).timestamp()


COMMIT = """git add -A && git commit -m "$(cat <<'EOF'
OPS-417: pointage automatique du temps

Co-Authored-By: Claude
EOF
)\""""


class TestSegments(unittest.TestCase):
    PAUSE = 20 * 60

    def test_attente_courte_de_theo_comptee(self):
        evenements = [(t("2026-10-16 10:00:00"), "UserPromptSubmit"), (t("2026-10-16 10:05:00"), "Stop"),
                      (t("2026-10-16 10:20:00"), "UserPromptSubmit"), (t("2026-10-16 10:30:00"), "PreToolUse")]
        self.assertEqual(pointage.segments(evenements, self.PAUSE), [(t("2026-10-16 10:00:00"), t("2026-10-16 10:30:00"))])

    def test_attente_longue_apres_stop_est_une_pause(self):
        evenements = [(t("2026-10-16 10:00:00"), "UserPromptSubmit"), (t("2026-10-16 10:05:00"), "Stop"),
                      (t("2026-10-16 11:00:00"), "UserPromptSubmit"), (t("2026-10-16 11:10:00"), "PreToolUse")]
        self.assertEqual(pointage.segments(evenements, self.PAUSE),
                         [(t("2026-10-16 10:00:00"), t("2026-10-16 10:05:00")), (t("2026-10-16 11:00:00"), t("2026-10-16 11:10:00"))])

    def test_outil_long_jamais_coupe(self):
        evenements = [(t("2026-10-16 10:00:00"), "PreToolUse"), (t("2026-10-16 10:45:00"), "PostToolUse")]
        self.assertEqual(pointage.segments(evenements, self.PAUSE), [(t("2026-10-16 10:00:00"), t("2026-10-16 10:45:00"))])

    def test_debut_de_session_en_attente(self):
        evenements = [(t("2026-10-16 09:00:00"), "SessionStart"), (t("2026-10-16 10:00:00"), "UserPromptSubmit"),
                      (t("2026-10-16 10:12:00"), "PreToolUse")]
        self.assertEqual(pointage.segments(evenements, self.PAUSE), [(t("2026-10-16 10:00:00"), t("2026-10-16 10:12:00"))])


class TestLignes(unittest.TestCase):
    def test_format_du_contrat(self):
        lignes = pointage.lignes_de_temps([(t("2026-10-16 21:29:40"), t("2026-10-16 22:04:10"))], "OPS-417", "ops-dashboard", "n")
        self.assertEqual(lignes, [{"date": "2026-10-16", "debut": "21:30", "fin": "22:04", "minutes": 34, "item": "OPS-417",
                                   "source": "claude-code", "agent": "ops-dashboard", "note": "n", "valide": False}])
        self.assertEqual(list(lignes[0]), ["date", "debut", "fin", "minutes", "item", "source", "agent", "note", "valide"])

    def test_passage_de_minuit_garde_la_date_du_debut(self):
        (ligne,) = pointage.lignes_de_temps([(t("2026-10-16 23:50:00"), t("2026-10-17 00:20:00"))], None, "ops-init", "")
        self.assertEqual((ligne["date"], ligne["debut"], ligne["fin"], ligne["minutes"]), ("2026-10-16", "23:50", "00:20", 30))
        self.assertEqual(contrat.minutes_entre(ligne["debut"], ligne["fin"]), 30)

    def test_segment_de_moins_d_une_minute_omis(self):
        self.assertEqual(pointage.lignes_de_temps([(t("2026-10-16 10:00:00"), t("2026-10-16 10:00:20"))], None, "a", ""), [])

    def test_doublon_decale_d_une_minute(self):
        ligne = {"date": "2026-10-16", "debut": "10:00", "fin": "10:30", "minutes": 30}
        self.assertEqual(pointage.decaler(ligne, {("2026-10-16", "10:00")}),
                         {"date": "2026-10-16", "debut": "10:01", "fin": "10:30", "minutes": 29})
        self.assertIsNone(pointage.decaler(dict(ligne, fin="10:01", minutes=1), {("2026-10-16", "10:00")}))


class TestCommande(unittest.TestCase):
    def test_item_du_message(self):
        self.assertEqual(pointage.item_du_commit(COMMIT, "OPS"), "OPS-417")
        self.assertEqual(pointage.item_du_commit('git commit -m "EGM-012: devis"', None), "EGM-012")
        self.assertIsNone(pointage.item_du_commit('git commit -m "sans id"', "OPS"))

    def test_item_d_un_autre_projet_ignore(self):
        self.assertIsNone(pointage.item_du_commit('git commit -m "EGM-012: devis"', "OPS"))

    def test_dossier_du_commit(self):
        self.assertEqual(pointage.dossier_du_commit("cd /x/egm-app && git commit -m a", "/y"), Path("/x/egm-app"))
        self.assertEqual(pointage.dossier_du_commit("cd skeam-ops && git commit -m a", "/y"), Path("/y/skeam-ops"))
        self.assertEqual(pointage.dossier_du_commit("git -C /x/egm-app commit -m a", "/y"), Path("/x/egm-app"))
        self.assertEqual(pointage.dossier_du_commit("git commit -m a", "/y"), Path("/y"))

    def test_agent_par_plage(self):
        config = json.loads((RACINE_OPS / ".claude" / "pointage.json").read_text(encoding="utf-8"))
        self.assertEqual(pointage.agent_pour(config, "OPS-417"), "ops-dashboard")
        self.assertEqual(pointage.agent_pour(config, "OPS-105"), "ops-socle")
        self.assertEqual(pointage.agent_pour(config, None), "ops-init")


class TestBoutEnBout(unittest.TestCase):
    """Une session simulée dans un dépôt git jetable, du premier message au commit."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.depot = Path(self.tmp.name) / "depot"
        (self.depot / ".claude").mkdir(parents=True)
        (self.depot / ".claude" / "pointage.json").write_text(
            json.dumps({"prefixe": "OPS", "agent": "ops-init", "agents_par_plage": [[401, 499, "ops-dashboard"]]}), encoding="utf-8")
        subprocess.run(["git", "init", "-q", str(self.depot)], check=True)
        self.ancien = os.environ.get("POINTAGE_ETAT")
        os.environ["POINTAGE_ETAT"] = str(Path(self.tmp.name) / "etat")

    def tearDown(self):
        if self.ancien is None:
            os.environ.pop("POINTAGE_ETAT", None)
        else:
            os.environ["POINTAGE_ETAT"] = self.ancien
        self.tmp.cleanup()

    def evenement(self, genre: str, quand: str, commande: str = "") -> list[dict]:
        evenement = {"hook_event_name": genre, "session_id": "abcdef1234567890", "cwd": str(self.depot)}
        if genre == "PreToolUse":
            evenement.update(tool_name="Bash", tool_input={"command": commande or "ls"})
        return pointage.traiter(evenement, t(quand))

    def projet_suivi(self):
        (self.depot / "projet").mkdir(exist_ok=True)
        (self.depot / "projet" / "client.yaml").write_text("slug: ops\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(self.depot), "add", "projet/client.yaml"], check=True)

    def test_session_avec_pause_et_deux_commits(self):
        self.projet_suivi()
        self.evenement("SessionStart", "2026-10-16 09:00:00")
        self.evenement("UserPromptSubmit", "2026-10-16 10:00:00")
        self.evenement("PreToolUse", "2026-10-16 10:10:00")
        self.evenement("PostToolUse", "2026-10-16 10:11:00")
        self.evenement("Stop", "2026-10-16 10:15:00")
        # Théo revient après une heure : pause.
        self.evenement("UserPromptSubmit", "2026-10-16 11:15:00")
        premiers = self.evenement("PreToolUse", "2026-10-16 11:30:00", COMMIT)
        self.assertEqual([(l["debut"], l["fin"], l["minutes"], l["item"], l["agent"]) for l in premiers],
                         [("10:00", "10:15", 15, "OPS-417", "ops-dashboard"), ("11:15", "11:30", 15, "OPS-417", "ops-dashboard")])
        self.evenement("PostToolUse", "2026-10-16 11:30:05")
        self.evenement("Stop", "2026-10-16 11:32:00")
        self.evenement("UserPromptSubmit", "2026-10-16 11:40:00")
        seconds = self.evenement("PreToolUse", "2026-10-16 11:50:00", 'git commit -m "OPS-105: modules"')
        # L'attente de 8 minutes après le Stop compte ; OPS-105 hors des plages configurées : agent par défaut.
        self.assertEqual([(l["debut"], l["fin"], l["minutes"], l["agent"]) for l in seconds], [("11:30", "11:50", 20, "ops-init")])

        fichier = self.depot / "projet" / "temps" / "2026-10-ops-dashboard.jsonl"
        lignes = [json.loads(l) for l in fichier.read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(lignes), 2)
        for ligne in lignes:
            self.assertEqual(ligne["minutes"], contrat.minutes_entre(ligne["debut"], ligne["fin"]))
            self.assertEqual(ligne["note"], "Pointage automatique, session abcdef12")
        indexes = subprocess.run(["git", "-C", str(self.depot), "diff", "--cached", "--name-only"],
                                 capture_output=True, text=True, check=True).stdout.split()
        self.assertEqual(sorted(indexes), ["projet/client.yaml", "projet/temps/2026-10-ops-dashboard.jsonl", "projet/temps/2026-10-ops-init.jsonl"])

    def test_branche_de_code_sans_projet_puis_commit_de_pilotage(self):
        """Comme egm-app : code sur main sans projet/, pilotage sur projet/skeam-ops, configuration absente de demo."""
        self.evenement("UserPromptSubmit", "2026-10-16 10:00:00")
        code = self.evenement("PreToolUse", "2026-10-16 10:40:00", 'git commit -m "OPS-417: code"')
        self.assertEqual([(l["debut"], l["minutes"]) for l in code], [("10:00", 40)])
        self.assertFalse((self.depot / "projet").exists())
        # Branche demo : ni configuration ni projet/ ; la configuration gardée prend le relais.
        (self.depot / ".claude" / "pointage.json").unlink()
        demo = self.evenement("PreToolUse", "2026-10-16 10:55:00", 'git commit -m "OPS-417: report dans la démo"')
        self.assertEqual([(l["debut"], l["minutes"]) for l in demo], [("10:40", 15)])
        # Un dossier projet/ resté vide après un changement de branche ne compte pas.
        (self.depot / "projet" / "temps").mkdir(parents=True)
        reste = self.evenement("PreToolUse", "2026-10-16 10:57:00", 'git commit -m "OPS-417: report"')
        self.assertEqual([(l["debut"], l["minutes"]) for l in reste], [("10:55", 2)])
        self.assertFalse((self.depot / "projet" / "temps" / "2026-10-ops-dashboard.jsonl").exists())
        # Branche de pilotage : projet/ suivi, les lignes en attente partent avec ce commit.
        self.projet_suivi()
        pilotage = self.evenement("PreToolUse", "2026-10-16 11:00:00", 'git commit -m "OPS-417: a_recetter"')
        self.assertEqual([(l["debut"], l["minutes"]) for l in pilotage], [("10:00", 40), ("10:40", 15), ("10:55", 2), ("10:57", 3)])
        fichier = self.depot / "projet" / "temps" / "2026-10-ops-dashboard.jsonl"
        self.assertEqual(len(fichier.read_text(encoding="utf-8").splitlines()), 4)
        self.assertEqual(list((Path(self.tmp.name) / "etat").glob("attente-*")), [])

    def test_copie_du_script_pour_les_branches_qui_ne_l_ont_pas(self):
        self.evenement("SessionStart", "2026-10-16 10:00:00")
        copie = Path(self.tmp.name) / "etat" / "pointage.py"
        self.assertEqual(copie.read_bytes(), (RACINE_OPS / "dashboard" / "scripts" / "pointage.py").read_bytes())

    def test_depot_sans_configuration_non_pointe(self):
        (self.depot / ".claude" / "pointage.json").unlink()
        self.evenement("UserPromptSubmit", "2026-10-16 10:00:00")
        self.assertEqual(self.evenement("PreToolUse", "2026-10-16 10:30:00", COMMIT), [])
        self.assertFalse((self.depot / "projet").exists())

    def test_hook_ne_bloque_jamais(self):
        sortie = subprocess.run([sys.executable, str(RACINE_OPS / "dashboard" / "scripts" / "pointage.py")],
                                input="pas du json", capture_output=True, text=True,
                                env=dict(os.environ, POINTAGE_ETAT=os.environ["POINTAGE_ETAT"]))
        self.assertEqual(sortie.returncode, 0)


if __name__ == "__main__":
    unittest.main()
