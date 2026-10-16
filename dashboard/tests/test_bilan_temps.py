"""Tests de bilan_temps.py, commande de /skeam-bilan.

Lancement depuis la racine de skeam-ops :
    python -m unittest discover -s dashboard/tests -p "test_*.py"

Chaque test fabrique un historique de session et un dépôt Git jetables : une session du
jeudi 2026-10-15 au soir, heure de Paris, avec des commits datés à la minute.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parents[1] / "dashboard" / "scripts"))

import bilan_temps  # noqa: E402

PARIS = ZoneInfo("Europe/Paris")
MARQUE = "Claude-Session: https://claude.ai/code/session_test"


def paris(heure: str, jour: int = 15) -> dt.datetime:
    h, m = map(int, heure.split(":"))
    return dt.datetime(2026, 10, jour, h, m, tzinfo=PARIS)


def historique(dossier: Path, heures: list[str], nom: str = "abcdef12-0000.jsonl") -> Path:
    """Historique Claude Code : un message utilisateur puis un de l'agent à chaque heure, horodatés en UTC."""
    chemin = dossier / nom
    lignes = []
    for heure in heures:
        quand = paris(heure).astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
        lignes.append(json.dumps({"type": "user", "timestamp": quand, "message": {"content": "…"}}))
        lignes.append(json.dumps({"type": "assistant", "timestamp": quand}))
    lignes.append(json.dumps({"type": "summary", "summary": "sans horodatage"}))
    chemin.write_text("\n".join(lignes) + "\n", encoding="utf-8")
    return chemin


def depot(dossier: Path, commits: list[tuple[str, str]], marque: str | None = MARQUE) -> Path:
    """Dépôt Git avec un commit par (heure, sujet), daté à l'heure de Paris."""
    chemin = dossier / "depot"
    chemin.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    subprocess.run(["git", "init", "-q", str(chemin)], check=True, env=env)
    for numero, (heure, sujet) in enumerate(commits):
        (chemin / f"f{numero}.txt").write_text(sujet, encoding="utf-8")
        quand = paris(heure).isoformat()
        subprocess.run(["git", "-C", str(chemin), "add", "."], check=True, env=env)
        message = sujet + (f"\n\n{marque}" if marque else "")
        subprocess.run(["git", "-C", str(chemin), "commit", "-q", "-m", message],
                       check=True, env={**env, "GIT_AUTHOR_DATE": quand, "GIT_COMMITTER_DATE": quand})
    return chemin


class TestPeriodes(unittest.TestCase):
    def test_une_pause_au_dela_du_seuil_coupe_la_periode(self):
        heures = [paris(h) for h in ("20:00", "20:10", "20:25", "21:10", "21:20")]
        periodes = bilan_temps.periodes_actives(heures, dt.timedelta(minutes=20))
        self.assertEqual(periodes, [(paris("20:00"), paris("20:25")), (paris("21:10"), paris("21:20"))])

    def test_un_horodatage_isole_ne_compte_pas(self):
        heures = [paris(h) for h in ("20:00", "21:00", "21:05")]
        self.assertEqual(bilan_temps.periodes_actives(heures, dt.timedelta(minutes=20)), [(paris("21:00"), paris("21:05"))])

    def test_minutes_passent_minuit(self):
        self.assertEqual(bilan_temps.minutes_entre("23:50", "00:20"), 30)
        self.assertEqual(bilan_temps.minutes_entre("20:10", "21:05"), 55)


class TestRepartition(unittest.TestCase):
    D = Path("/depot")

    def commit(self, heure: str, item: str) -> bilan_temps.Commit:
        return bilan_temps.Commit(paris(heure), item, self.D)

    def test_le_temps_avant_un_commit_revient_a_son_item_et_la_fin_au_dernier(self):
        segments = bilan_temps.repartir([(paris("20:00"), paris("21:00"))],
                                        [self.commit("20:20", "EGM-040"), self.commit("20:40", "EGM-064")])
        self.assertEqual([(s.debut, s.fin, s.item) for s in segments], [
            (paris("20:00"), paris("20:20"), "EGM-040"),
            (paris("20:20"), paris("21:00"), "EGM-064"),
        ])

    def test_une_periode_sans_commit_revient_au_commit_suivant(self):
        segments = bilan_temps.repartir([(paris("20:00"), paris("20:30")), (paris("21:00"), paris("21:30"))],
                                        [self.commit("21:15", "OPS-419")])
        self.assertEqual([(s.debut, s.fin, s.item) for s in segments], [
            (paris("20:00"), paris("20:30"), "OPS-419"),
            (paris("21:00"), paris("21:30"), "OPS-419"),
        ])

    def test_sans_aucun_commit_le_temps_reste_sans_item(self):
        segments = bilan_temps.repartir([(paris("20:00"), paris("20:30"))], [])
        self.assertEqual([s.item for s in segments], [None])

    def test_les_commits_successifs_du_meme_item_se_fusionnent(self):
        segments = bilan_temps.repartir([(paris("20:00"), paris("21:00"))],
                                        [self.commit("20:10", "EGM-040"), self.commit("20:30", "EGM-040")])
        self.assertEqual([(s.debut, s.fin, s.item) for s in segments], [(paris("20:00"), paris("21:00"), "EGM-040")])


class TestBilan(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dossier = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def lancer(self, *args: str) -> tuple[int, dict | None, str]:
        sortie, erreur = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(erreur):
            code = bilan_temps.main(list(args))
        return code, json.loads(sortie.getvalue()) if code == 0 else None, erreur.getvalue()

    def preparer(self, marque: str | None = MARQUE) -> tuple[Path, Path]:
        session = historique(self.dossier, ["20:00", "20:05", "20:15", "20:30", "20:40", "21:30", "21:45"])
        chemin = depot(self.dossier, [("20:20", "EGM-040: espace client"), ("20:35", "OPS-419: skill bilan"),
                                      ("21:40", "Merge sans id"), ("21:42", "EGM-064: onglet Utilisateurs")], marque)
        return session, chemin

    def test_propose_une_ligne_par_sequence_au_format_du_contrat(self):
        session, chemin = self.preparer()
        code, resultat, _ = self.lancer("--historique", str(session), "--depot", str(chemin),
                                        "--agent", "EGM=egm-dev", "--agent", "OPS=ops-dashboard")
        self.assertEqual(code, 0)
        self.assertEqual(resultat["actif_minutes"], 40 + 15)
        self.assertEqual(resultat["periodes"], 2)
        self.assertEqual([c["item"] for c in resultat["commits"]], ["EGM-040", "OPS-419", "EGM-064"])
        egm = resultat["fichiers"][str(chemin / "projet" / "temps" / "2026-10-egm-dev.jsonl")]["nouvelles"]
        ops = resultat["fichiers"][str(chemin / "projet" / "temps" / "2026-10-ops-dashboard.jsonl")]["nouvelles"]
        self.assertEqual([(l["debut"], l["fin"], l["minutes"], l["item"]) for l in egm],
                         [("20:00", "20:20", 20, "EGM-040"), ("21:30", "21:45", 15, "EGM-064")])
        self.assertEqual([(l["debut"], l["fin"], l["minutes"], l["item"]) for l in ops], [("20:20", "20:40", 20, "OPS-419")])
        ligne = egm[0]
        self.assertEqual(set(ligne), {"date", "debut", "fin", "minutes", "item", "source", "agent", "note", "valide"})
        self.assertEqual((ligne["date"], ligne["source"], ligne["agent"], ligne["valide"]), ("2026-10-15", "claude-code", "egm-dev", False))
        self.assertIn("abcdef12", ligne["note"])
        self.assertFalse((chemin / "projet").exists(), "sans --ecrire, rien n'est écrit")

    def test_un_prefixe_sans_agent_est_signale_et_non_attribue(self):
        session, chemin = self.preparer()
        code, resultat, _ = self.lancer("--historique", str(session), "--depot", str(chemin), "--agent", "EGM=egm-dev")
        self.assertEqual(code, 0)
        self.assertEqual(len(resultat["avertissements"]), 1)
        self.assertIn("OPS sans agent", resultat["avertissements"][0])
        self.assertEqual(len(resultat["fichiers"]), 1)

    def test_la_marque_ecarte_les_commits_d_une_autre_session(self):
        session, chemin = self.preparer(marque=None)
        code, resultat, _ = self.lancer("--historique", str(session), "--depot", str(chemin), "--agent", "EGM=egm-dev",
                                        "--marque-commit", "session_test")
        self.assertEqual(code, 0)
        self.assertEqual(resultat["commits"], [])
        self.assertEqual(len(resultat["avertissements"]), 2, "deux périodes sans item")

    def test_ecrire_ajoute_en_fin_de_fichier_et_ne_compte_jamais_deux_fois(self):
        session, chemin = self.preparer()
        fichier = chemin / "projet" / "temps" / "2026-10-egm-dev.jsonl"
        fichier.parent.mkdir(parents=True)
        existante = {"date": "2026-10-15", "debut": "21:30", "fin": "21:50", "minutes": 20, "item": "EGM-064",
                     "source": "claude-code", "agent": "egm-dev", "note": "", "valide": False}
        fichier.write_text(json.dumps(existante), encoding="utf-8")
        arguments = ["--historique", str(session), "--depot", str(chemin), "--agent", "EGM=egm-dev", "--agent", "OPS=ops-dashboard", "--ecrire"]
        code, resultat, _ = self.lancer(*arguments)
        self.assertEqual(code, 0)
        self.assertEqual(resultat["ecrites"], 2)
        self.assertEqual(len(resultat["fichiers"][str(fichier)]["deja"]), 1)
        lignes = [json.loads(l) for l in fichier.read_text(encoding="utf-8").splitlines()]
        self.assertEqual([l["item"] for l in lignes], ["EGM-064", "EGM-040"])
        code, resultat, _ = self.lancer(*arguments)
        self.assertEqual(resultat["ecrites"], 0, "relancer n'ajoute rien")
        self.assertEqual(len(fichier.read_text(encoding="utf-8").splitlines()), 2)

    def test_liste_d_horodatages_et_bornes_de_periode(self):
        _, chemin = self.preparer()
        liste = self.dossier / "horodatages.json"
        liste.write_text(json.dumps(["2026-10-15T20:00", "2026-10-15T20:15", "2026-10-15T20:30"]), encoding="utf-8")
        code, resultat, _ = self.lancer("--historique", str(liste), "--depot", str(chemin), "--agent", "EGM=egm-dev",
                                        "--agent", "OPS=ops-dashboard", "--jusqua", "2026-10-15T20:15")
        self.assertEqual(code, 0)
        self.assertEqual(resultat["actif_minutes"], 15)
        self.assertEqual(resultat["periode"]["fin"], "2026-10-15T20:15+02:00")

    def test_codes_de_sortie(self):
        session, chemin = self.preparer()
        vide = self.dossier / "vide.jsonl"
        vide.write_text("{}\n", encoding="utf-8")
        self.assertEqual(self.lancer("--historique", str(vide), "--depot", str(chemin))[0], 1)
        self.assertEqual(self.lancer("--historique", str(session), "--depot", str(self.dossier / "absent"))[0], 1)
        self.assertEqual(self.lancer("--historique", str(session), "--depot", str(chemin), "--agent", "EGM")[0], 2)
        self.assertEqual(self.lancer("--historique", str(session))[0], 2)


if __name__ == "__main__":
    unittest.main()
