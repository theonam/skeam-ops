"""Tests de calibrer.py sur le registre, les deux clients fictifs et le catalogue d'essai."""

from __future__ import annotations

import unittest

from outils import BaseTemporaire, contrat, executer

import calibrer

DATE = "2026-10-15"


class TestCalibrer(BaseTemporaire):
    def calibrer(self, *options):
        argv = ["--clients", str(self.donnees / "clients.yaml"), "--racine", str(self.donnees / "racine"), "--catalogue", str(self.catalogue), *options]
        return executer(calibrer.main, argv, aujourdhui=DATE)

    def modules(self):
        return {m["code"]: m for m in contrat.charger_yaml(self.catalogue / "modules.yaml")["modules"]}

    def test_mesures_selon_le_contrat(self):
        avant = self.modules()
        code, sortie, erreurs = self.calibrer()
        self.assertEqual(code, 0, erreurs)
        self.assertIn("3 mesures sur 2 clients actifs", sortie)
        apres = self.modules()
        self.assertEqual(apres["connexion-droits"]["mesures"], [{"client": "fictif", "item": "FICTIF-001", "heures": 3}])
        self.assertEqual(apres["devis"]["mesures"], [{"client": "essai", "item": "ESSAI-001", "heures": 14}])
        self.assertEqual(apres["facturation-simple"]["mesures"], [{"client": "essai", "item": "ESSAI-002", "heures": 9}])
        self.assertEqual(apres["planning-equipes"]["mesures"], [])
        for code_module in avant:
            sans_mesures = lambda m: {k: v for k, v in m.items() if k != "mesures"}  # noqa: E731
            self.assertEqual(sans_mesures(avant[code_module]), sans_mesures(apres[code_module]))

    def test_conserve_commentaires_et_mise_en_forme(self):
        self.calibrer()
        texte = (self.catalogue / "modules.yaml").read_text(encoding="utf-8")
        self.assertIn("  # Un commentaire au milieu du fichier doit survivre au calibrage.\n", texte)
        self.assertIn("    mesures:\n      - client: fictif\n        item: FICTIF-001\n        heures: 3\n", texte)
        self.assertIn("    prix_conseille_ht: 1400\n", texte)

    def test_idempotent(self):
        self.calibrer()
        premier = (self.catalogue / "modules.yaml").read_bytes()
        self.calibrer()
        self.assertEqual(premier, (self.catalogue / "modules.yaml").read_bytes())
        self.calibrer("--recalculer")
        premier = (self.catalogue / "modules.yaml").read_bytes()
        self.calibrer("--recalculer")
        self.assertEqual(premier, (self.catalogue / "modules.yaml").read_bytes())

    def test_seul_le_temps_valide_compte(self):
        self.calibrer()
        mesures = [m for module in self.modules().values() for m in module["mesures"]]
        self.assertNotIn("ESSAI-004", [m["item"] for m in mesures])
        self.remplacer(
            self.donnees / "racine" / "essai-app" / "projet" / "temps" / "2026-09-essai-dev.jsonl",
            '"item":"ESSAI-004","source":"claude-code","agent":"essai-dev","note":"","valide":false',
            '"item":"ESSAI-004","source":"claude-code","agent":"essai-dev","note":"","valide":true',
        )
        self.calibrer()
        self.assertEqual(self.modules()["connexion-droits"]["mesures"][0], {"client": "essai", "item": "ESSAI-004", "heures": 3.5})

    def test_recalculer_confiance_et_prix(self):
        code, _, erreurs = self.calibrer("--recalculer")
        self.assertEqual(code, 0, erreurs)
        modules = self.modules()
        # Une observation dans la fourchette : moyenne. Référence (milieu + observation) / 2.
        self.assertEqual(modules["connexion-droits"]["confiance"], "moyenne")
        self.assertEqual(modules["connexion-droits"]["prix_conseille_ht"], 350)  # (5,5 + 3) / 2 x 1,15 x 70 = 342
        self.assertEqual(modules["facturation-simple"]["confiance"], "moyenne")
        self.assertEqual(modules["app-terrain"]["confiance"], "faible")
        self.assertEqual(modules["app-terrain"]["prix_conseille_ht"], 1400)  # 15 x 1,3 x 70 = 1 365

    def test_sans_recalculer_confiance_et_prix_intacts(self):
        self.calibrer()
        modules = self.modules()
        self.assertEqual(modules["facturation-simple"]["confiance"], "forte")
        self.assertEqual(modules["facturation-simple"]["prix_conseille_ht"], 1050)
        self.assertIsNone(modules["app-terrain"]["prix_conseille_ht"])

    def test_rapport(self):
        self.calibrer()
        rapport = (self.catalogue / "out" / "calibration.md").read_text(encoding="utf-8")
        for titre in ("# Calibration du catalogue du 2026-10-15", "## Synthèse", "## Par module", "## Par client", "## Anomalies"):
            self.assertIn(titre, rapport)
        self.assertIn("| `devis` | 10 à 20 h | essai 14 h |", rapport)
        self.assertIn("| ESSAI-005 | `planning-equipes` | en_cours | 2 h | 3 h | 0 h | +50 % ⚠ |", rapport)
        self.assertIn("essai ESSAI-003 fait sur le module `pointage`, absent du catalogue", rapport)
        self.assertIn("essai ESSAI-004 fait sans temps validé, 3,5 h en attente de validation", rapport)
        self.assertIn("`devis` : ancien ANCIEN-004, 16 h", rapport)
        self.assertIn("Temps en attente de validation : 4 lignes, 8,75 h", rapport)
        self.assertIn("Temps hors item validé, réunions et gestion : 1,5 h", rapport)

    def test_client_inactif_ignore(self):
        self.remplacer(self.donnees / "clients.yaml", "depot: skeam-exemple/essai-app\n    statut: en_dev\n    actif: true",
                       "depot: skeam-exemple/essai-app\n    statut: en_dev\n    actif: false")
        self.calibrer()
        self.assertEqual(self.modules()["devis"]["mesures"], [])

    def test_projet_invalide(self):
        avant = (self.catalogue / "modules.yaml").read_bytes()
        self.remplacer(self.projet / "client.yaml", "statut: en_dev", "statut: inconnu")
        code, _, erreurs = self.calibrer()
        self.assertEqual(code, 1)
        self.assertIn("catalogue non modifié", erreurs)
        self.assertEqual(avant, (self.catalogue / "modules.yaml").read_bytes())

    def test_liste_sans_indentation_reconnue(self):
        self.remplacer(self.catalogue / "modules.yaml", "    mesures:\n      - client: ancien\n        item: ANCIEN-004\n        heures: 16\n",
                       "    mesures:\n    - client: ancien\n      item: ANCIEN-004\n      heures: 16\n")
        code, _, erreurs = self.calibrer()
        self.assertEqual(code, 0, erreurs)
        self.assertEqual(self.modules()["devis"]["mesures"], [{"client": "essai", "item": "ESSAI-001", "heures": 14}])

    def test_reecriture_refusee_si_un_autre_champ_change(self):
        texte = "modules:\n  - code: a\n    nom: A\n    mesures: []\n"
        nouveau = calibrer.reecrire_modules(texte, {"a": {"mesures": [{"client": "x", "item": "X-001", "heures": 1}]}})
        self.assertEqual(nouveau, "modules:\n  - code: a\n    nom: A\n    mesures:\n      - client: x\n        item: X-001\n        heures: 1\n")
        with self.assertRaises(calibrer.ErreurDonnees):
            calibrer.verifier_reecriture([{"code": "a", "nom": "B", "mesures": []}], nouveau, {"a": {"mesures": []}}, self.catalogue)

    def test_usage(self):
        self.assertEqual(executer(calibrer.main, ["--clients", str(self.donnees / "clients.yaml")])[0], 2)
        self.assertEqual(executer(calibrer.main, ["--clients", str(self.tmp / "absent.yaml"), "--racine", str(self.tmp)])[0], 2)


if __name__ == "__main__":
    unittest.main()
