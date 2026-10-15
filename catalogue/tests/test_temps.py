"""Tests de temps.py sur le projet fictif."""

from __future__ import annotations

import json
import unittest
from datetime import datetime
from unittest import mock
from zoneinfo import ZoneInfo

from outils import BaseTemporaire, contrat, executer

import temps

PARIS = ZoneInfo("Europe/Paris")


def a(jour: str, heure: str) -> datetime:
    return datetime.fromisoformat(f"{jour}T{heure}").replace(tzinfo=PARIS)


class TestTemps(BaseTemporaire):
    def setUp(self) -> None:
        super().setUp()
        self.etat = self.tmp / "etat"
        self.fichier_dev = self.projet / "temps" / "2026-10-fictif-dev.jsonl"

    def lancer(self, argv, maintenant=None, entree=None):
        return executer(temps.main, argv, maintenant=maintenant or a("2026-10-15", "20:00"), dossier_etat=self.etat, entree=entree)

    def derniere_ligne(self, fichier):
        return fichier.read_text(encoding="utf-8").splitlines()[-1]

    def test_start_stop(self):
        code, sortie, erreurs = self.lancer(["start", str(self.projet), "--agent", "fictif-dev", "--item", "FICTIF-003", "--note", "Envoi PDF"])
        self.assertEqual(code, 0, erreurs)
        self.assertIn("Session ouverte", sortie)
        code, _, erreurs = self.lancer(["stop", "--agent", "fictif-dev"], a("2026-10-15", "21:05"))
        self.assertEqual(code, 0, erreurs)
        self.assertEqual(
            self.derniere_ligne(self.fichier_dev),
            '{"date":"2026-10-15","debut":"20:00","fin":"21:05","minutes":65,"item":"FICTIF-003","source":"claude-code","agent":"fictif-dev","note":"Envoi PDF","valide":false}',
        )
        self.assertFalse(list(self.etat.iterdir()))
        self.assertProjetValide(self.projet)

    def test_stop_apres_minuit_garde_la_date_et_le_mois_du_debut(self):
        self.lancer(["start", str(self.projet), "--agent", "fictif-dev", "--item", "FICTIF-003"], a("2026-10-31", "23:50"))
        code, _, erreurs = self.lancer(["stop", "--agent", "fictif-dev", "--note", "Passage de minuit"], a("2026-11-01", "00:20"))
        self.assertEqual(code, 0, erreurs)
        ligne = json.loads(self.derniere_ligne(self.fichier_dev))
        self.assertEqual((ligne["date"], ligne["minutes"], ligne["note"]), ("2026-10-31", 30, "Passage de minuit"))
        self.assertProjetValide(self.projet)

    def test_start_refuse_une_seconde_session(self):
        self.lancer(["start", str(self.projet), "--agent", "fictif-dev"])
        code, _, erreurs = self.lancer(["start", str(self.projet), "--agent", "fictif-dev"])
        self.assertEqual(code, 1)
        self.assertIn("session déjà ouverte", erreurs)

    def test_start_item_inconnu(self):
        code, _, erreurs = self.lancer(["start", str(self.projet), "--agent", "fictif-dev", "--item", "FICTIF-099"])
        self.assertEqual(code, 1)
        self.assertIn("FICTIF-099 introuvable", erreurs)

    def test_stop_sans_session(self):
        code, _, erreurs = self.lancer(["stop", "--agent", "fictif-dev"])
        self.assertEqual(code, 1)
        self.assertIn("aucune session ouverte", erreurs)

    def test_stop_annuler(self):
        avant = self.fichier_dev.read_bytes()
        self.lancer(["start", str(self.projet), "--agent", "fictif-dev"])
        code, _, _ = self.lancer(["stop", "--agent", "fictif-dev", "--annuler"], a("2026-10-15", "21:00"))
        self.assertEqual(code, 0)
        self.assertEqual(avant, self.fichier_dev.read_bytes())

    def test_stop_moins_d_une_minute(self):
        self.lancer(["start", str(self.projet), "--agent", "fictif-dev"], a("2026-10-15", "20:00"))
        code, _, erreurs = self.lancer(["stop", "--agent", "fictif-dev"], a("2026-10-15", "20:00").replace(second=40))
        self.assertEqual(code, 1)
        self.assertIn("moins d'une minute", erreurs)
        self.assertTrue(list(self.etat.iterdir()))

    def test_stop_apres_24_heures(self):
        self.lancer(["start", str(self.projet), "--agent", "fictif-dev"], a("2026-10-15", "20:00"))
        code, _, erreurs = self.lancer(["stop", "--agent", "fictif-dev"], a("2026-10-16", "20:30"))
        self.assertEqual(code, 1)
        self.assertIn("plus de 24 heures", erreurs)

    def test_log_theo(self):
        fichier = self.projet / "temps" / "2026-10-theo.jsonl"
        avant = fichier.read_text(encoding="utf-8")
        code, _, erreurs = self.lancer(["log", str(self.projet), "--agent", "theo", "--date", "2026-10-15", "--debut", "09:00", "--fin", "09:45", "--note", "Relecture"])
        self.assertEqual(code, 0, erreurs)
        texte = fichier.read_text(encoding="utf-8")
        self.assertTrue(texte.startswith(avant))
        self.assertEqual(
            texte[len(avant):],
            '{"date":"2026-10-15","debut":"09:00","fin":"09:45","minutes":45,"item":null,"source":"theo","agent":"theo","note":"Relecture","valide":false}\n',
        )

    def test_log_nouveau_fichier_du_mois(self):
        code, _, erreurs = self.lancer(["log", str(self.projet), "--agent", "fictif-dev", "--date", "2026-11-02", "--debut", "08:00", "--fin", "09:00", "--item", "FICTIF-004"])
        self.assertEqual(code, 0, erreurs)
        self.assertTrue((self.projet / "temps" / "2026-11-fictif-dev.jsonl").is_file())
        self.assertProjetValide(self.projet)

    def test_log_refus(self):
        avant = self.fichier_dev.read_bytes()
        cas = [
            (["--debut", "20:00", "--fin", "21:30", "--date", "2026-10-05"], 1, "session déjà saisie"),
            (["--debut", "20:00", "--fin", "21:00", "--item", "FICTIF-099"], 1, "introuvable"),
            (["--debut", "20:00", "--fin", "20:00"], 1, "au moins une minute"),
            (["--debut", "25:00", "--fin", "21:00"], 2, "--debut"),
            (["--debut", "20:00", "--fin", "21:00", "--date", "15/10/2026"], 2, "--date"),
            (["--debut", "20:00", "--fin", "21:00", "--date", "2026-02-30"], 1, "date valide"),
        ]
        for options, code_attendu, fragment in cas:
            with self.subTest(options=options):
                code, _, erreurs = self.lancer(["log", str(self.projet), "--agent", "fictif-dev", *options])
                self.assertEqual(code, code_attendu)
                self.assertIn(fragment, erreurs)
        self.assertEqual(avant, self.fichier_dev.read_bytes())

    def test_projet_invalide(self):
        self.remplacer(self.projet / "client.yaml", "statut: en_dev", "statut: inconnu")
        code, _, erreurs = self.lancer(["log", str(self.projet), "--agent", "fictif-dev", "--debut", "20:00", "--fin", "21:00"])
        self.assertEqual(code, 1)
        self.assertIn("rien n'est écrit", erreurs)

    def test_week_synthese_sans_confirmation(self):
        avant = self.fichier_dev.read_bytes()
        code, sortie, erreurs = self.lancer(["week", str(self.projet), "--semaine", "2026-W42"], entree=lambda _: "n")
        self.assertEqual(code, 0, erreurs)
        self.assertIn("# Temps de la semaine 2026-W42, du 2026-10-12 au 2026-10-18", sortie)
        self.assertIn("| 2026-10-13 | 23:30 | 00:45 | 1,25 h | fictif-dev | FICTIF-003 Création et envoi des devis | Session passée minuit | **non** |", sortie)
        self.assertIn("À valider : 3 lignes, 5,25 h.", sortie)
        self.assertIn("Rien n'est validé.", sortie)
        self.assertEqual(avant, self.fichier_dev.read_bytes())

    def test_week_validation_apres_confirmation(self):
        lignes_avant = self.fichier_dev.read_text(encoding="utf-8").splitlines()
        code, sortie, erreurs = self.lancer(["week", str(self.projet), "--semaine", "2026-10-14"], entree=lambda _: "o")
        self.assertEqual(code, 0, erreurs)
        self.assertIn("3 lignes passées à valide true.", sortie)
        lignes_apres = self.fichier_dev.read_text(encoding="utf-8").splitlines()
        self.assertEqual(lignes_avant[:3], lignes_apres[:3])
        self.assertTrue(all(json.loads(ligne)["valide"] for ligne in lignes_apres[3:]))
        theo = [json.loads(ligne) for ligne in (self.projet / "temps" / "2026-10-theo.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertTrue(all(ligne["valide"] for ligne in theo))
        self.assertProjetValide(self.projet)

    def test_week_filtre_agent_et_sortie(self):
        sortie_md = self.tmp / "semaine.md"
        code, _, _ = self.lancer(["week", str(self.projet), "--semaine", "2026-W42", "--agent", "theo", "--sortie", str(sortie_md), "--oui"])
        self.assertEqual(code, 0)
        self.assertIn("À valider : 1 ligne, 1 h.", sortie_md.read_text(encoding="utf-8"))
        self.assertFalse(any(json.loads(l)["valide"] for l in self.fichier_dev.read_text(encoding="utf-8").splitlines()[3:]))

    def test_week_sans_terminal_ne_valide_rien(self):
        avant = self.fichier_dev.read_bytes()
        with mock.patch("sys.stdin") as stdin:
            stdin.isatty.return_value = False
            code, sortie, _ = self.lancer(["week", str(self.projet), "--semaine", "2026-W42"])
        self.assertEqual(code, 0)
        self.assertIn("confirmation de Théo requise", sortie)
        self.assertEqual(avant, self.fichier_dev.read_bytes())

    def test_week_semaine_invalide(self):
        self.assertEqual(self.lancer(["week", str(self.projet), "--semaine", "2026-W60"])[0], 2)

    def test_lignes_ecrites_relues_par_contrat(self):
        self.lancer(["log", str(self.projet), "--agent", "fictif-dev", "--debut", "07:00", "--fin", "07:30", "--note", "Accents éèà"])
        lignes = contrat.lire_jsonl(self.fichier_dev)
        self.assertEqual(lignes[-1][1]["note"], "Accents éèà")


if __name__ == "__main__":
    unittest.main()
