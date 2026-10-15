"""Tests du chantier dashboard : agreger.py et rendre.py.

Lancement depuis la racine de skeam-ops :
    python -m unittest discover -s dashboard/tests -p "test_*.py"

Données : dashboard/tests/donnees, deux clients fictifs actifs, alpha et beta,
un client inactif sans clone, gamma, et le projet interne ops dans
donnees/projet. Date de référence : jeudi 2026-10-15.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo

ICI = Path(__file__).resolve().parent
DONNEES = ICI / "donnees"
RACINE_OPS = ICI.parents[1]
SCRIPTS = RACINE_OPS / "dashboard" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import agreger  # noqa: E402
import rendre  # noqa: E402
import validate  # noqa: E402

MAINTENANT = dt.datetime(2026, 10, 15, 9, 0, tzinfo=ZoneInfo("Europe/Paris"))
CHAMPS_ITEM = {
    "commercial": {"id", "titre", "lot", "statut", "priorite", "maj", "module"},
    "client": {"id", "titre", "lot", "statut", "priorite", "maj"},
}
MOTS_INTERDITS = re.compile(r"estimation|heure|temps|minute|taux|tarif|marge|ecart|depassement", re.I)


def vue(audience: str, clients: Path = DONNEES / "clients.yaml", racine: Path = DONNEES / "racine", cwd: Path = DONNEES) -> dict:
    with contextlib.chdir(cwd), contextlib.redirect_stderr(io.StringIO()):
        return agreger.agreger(clients, racine, audience, MAINTENANT)


def projet(donnees: dict, slug: str) -> dict:
    return next(p for p in donnees["projets"] if p["slug"] == slug)


def lancer(*args: str, cwd: Path = DONNEES) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, *args], cwd=cwd, capture_output=True, text=True)


class TestDonneesDeTest(unittest.TestCase):
    def test_donnees_valides(self):
        with contextlib.chdir(DONNEES), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()) as erreurs:
            code = validate.main(["--clients", "clients.yaml", "--racine", "racine", "projet"])
        self.assertEqual(code, 0, erreurs.getvalue())


class TestVueInterne(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.vue = vue("interne")
        cls.alpha = projet(cls.vue, "alpha")
        cls.beta = projet(cls.vue, "beta")

    def test_enveloppe(self):
        self.assertEqual(self.vue["audience"], "interne")
        self.assertEqual(self.vue["genere_le"], "2026-10-15T09:00:00+02:00")
        self.assertEqual(self.vue["semaine"], {"debut": "2026-10-12", "fin": "2026-10-18"})

    def test_projets_actifs_et_ops(self):
        self.assertEqual([p["slug"] for p in self.vue["projets"]], ["alpha", "beta", "ops"])
        self.assertEqual(projet(self.vue, "ops")["type"], "interne")
        self.assertEqual(self.alpha["type"], "client")

    def test_totaux(self):
        g = self.vue["global"]
        self.assertEqual((g["total_signe_ht"], g["run_annuel_ht"], g["nb_clients"]), (14200, 2400, 2))
        self.assertEqual(g["portefeuille"], [
            {"statut": "en_dev", "nb_clients": 1, "montant_signe_ht": 9000},
            {"statut": "recette", "nb_clients": 1, "montant_signe_ht": 5200},
        ])

    def test_lots(self):
        lot0, lot1, lot2 = self.alpha["lots"]
        self.assertEqual(lot0, {"lot": 0, "pourcentage": 100, "nb_items": 2, "nb_faits": 2, "heures_estimees": 7,
                                "heures_reelles": 8.5, "ecart_pct": 21, "depassement": True})
        # ALPHA-006 à valider est exclu ; ALPHA-005 interne compte.
        self.assertEqual((lot1["pourcentage"], lot1["nb_items"], lot1["heures_estimees"], lot1["heures_reelles"]), (25, 4, 13, 4.5))
        self.assertIsNone(lot2["pourcentage"])
        self.assertEqual([l["pourcentage"] for l in self.beta["lots"]], [100, 33])

    def test_temps_et_charge(self):
        self.assertEqual(self.alpha["temps"], {"semaine_h": 4.0, "semaine_theo_h": 1.5, "semaine_agents_h": 2.5,
                                               "semaine_precedente_h": 6.0, "total_h": 15.5, "hors_item_h": 2.5, "a_relire_h": 2.5})
        charge = self.vue["global"]["charge_semaine"]
        self.assertEqual((charge["total_h"], charge["total_theo_h"], charge["total_agents_h"]), (8.75, 1.5, 7.25))
        self.assertEqual([c["slug"] for c in charge["par_projet"]], ["alpha", "beta", "ops"])

    def test_alertes(self):
        alertes = {(a["type"], a["cible"]) for a in self.vue["global"]["alertes"]}
        self.assertEqual(alertes, {
            ("action_en_retard", "ACT-ALPHA-001"),
            ("depassement_item", "ALPHA-001"),
            ("depassement_lot", "lot 0"),
            ("bloque_externe", "ALPHA-003"),
            ("en_cours_ancien", "ALPHA-003"),
        })
        self.assertEqual(self.vue["global"]["alertes"][0]["gravite"], "haute")

    def test_a_faire(self):
        a_faire = [(a["type"], a["id"] or a["titre"]) for a in self.vue["global"]["a_faire"]]
        self.assertEqual(a_faire, [
            ("action", "ACT-ALPHA-001"),
            ("action", "ACT-OPS-001"),
            ("action", "ACT-ALPHA-002"),
            ("recette", "ALPHA-004"),
            ("recette", "BETA-003"),
            ("devis", "Envoyer le devis Option export comptable"),
            ("validation", "ALPHA-006"),
        ])
        self.assertTrue(self.vue["global"]["a_faire"][0]["en_retard"])

    def test_listes_du_projet(self):
        self.assertEqual([i["id"] for i in self.alpha["items_bloques"]], ["ALPHA-003"])
        self.assertEqual(self.alpha["items_bloques"][0]["dependances_externes"], ["grille tarifaire de pose fournie par le client"])
        self.assertEqual([(i["id"], i["jours"]) for i in self.alpha["items_en_cours_anciens"]], [("ALPHA-003", 13)])
        self.assertEqual([i["id"] for i in self.alpha["items_a_valider"]], ["ALPHA-006"])
        self.assertEqual([a["id"] for a in self.alpha["actions"]], ["ACT-ALPHA-001", "ACT-ALPHA-002"])
        self.assertEqual(len(self.alpha["items"]), 8)

    def test_echeances(self):
        self.assertEqual(self.alpha["prochaine_echeance"]["source"], "ACT-ALPHA-001")
        self.assertTrue(self.alpha["prochaine_echeance"]["en_retard"])
        self.assertEqual(self.beta["prochaine_echeance"], {"date": "2026-11-02", "libelle": "Mise en service", "source": "client.yaml",
                                                           "en_retard": False, "dans_jours": 18})

    def test_derniere_synthese(self):
        synthese = self.alpha["derniere_synthese"]
        self.assertEqual((synthese["date"], synthese["fichier"]), ("2026-10-13", "syntheses/2026-10-13-point-avancement.md"))
        self.assertEqual(synthese["titre"], "Point d'avancement Alpha Menuiserie")
        self.assertEqual(synthese["resume"], "La démo est validée. Le calcul des devis de pose attend la grille tarifaire.")
        self.assertIsNone(self.beta["derniere_synthese"])

    def test_interne_jamais_lu(self):
        self.assertNotIn("SECRET-MARGE", json.dumps(self.vue, ensure_ascii=False))

    def test_registre_desynchronise(self):
        with tempfile.TemporaryDirectory() as tmp:
            registre = Path(tmp) / "clients.yaml"
            registre.write_text((DONNEES / "clients.yaml").read_text(encoding="utf-8").replace("statut: recette", "statut: en_dev"), encoding="utf-8")
            alertes = vue("interne", clients=registre)["global"]["alertes"]
        self.assertIn(("basse", "registre_desynchronise", "beta"), {(a["gravite"], a["type"], a["slug"]) for a in alertes})


class TestFiltrage(unittest.TestCase):
    """Section 10 : rien de ce que l'audience ne peut pas voir, sur les données de test et sur exemples/."""

    JEUX = {
        "donnees": dict(clients=DONNEES / "clients.yaml", racine=DONNEES / "racine", cwd=DONNEES),
        "exemples": dict(clients=RACINE_OPS / "exemples" / "clients.yaml", racine=RACINE_OPS / "exemples" / "racine", cwd=RACINE_OPS),
    }
    CACHES = {
        "commercial": {"donnees": {"ALPHA-005", "ALPHA-006"}, "exemples": {"DEMO-006"}},
        "client": {"donnees": {"ALPHA-004", "ALPHA-005", "ALPHA-006", "BETA-004"}, "exemples": {"DEMO-004", "DEMO-006"}},
    }

    def verifier(self, audience: str, jeu: str):
        donnees = vue(audience, **self.JEUX[jeu])
        agreger.verifier_filtrage(donnees)
        texte = json.dumps(donnees, ensure_ascii=False)
        self.assertNotIn('"ops"', texte)
        for ident in self.CACHES[audience][jeu]:
            self.assertNotIn(ident, texte)
        for mot in ("SECRET-MARGE", "NOTE-INTERNE", "externe", "todoist", "theonam/"):
            self.assertNotIn(mot, texte)
        for cle in agreger.cles({k: v for k, v in donnees.items() if k != "genere_le"}):
            self.assertIsNone(MOTS_INTERDITS.search(cle), cle)
        for p in donnees["projets"]:
            for item in p["items"]:
                self.assertEqual(set(item), CHAMPS_ITEM[audience])
            for lot in p["lots"]:
                self.assertEqual(set(lot), {"lot", "pourcentage"})
        return donnees

    def test_commercial(self):
        for jeu in self.JEUX:
            with self.subTest(jeu=jeu):
                donnees = self.verifier("commercial", jeu)
                self.assertNotIn("a_faire", donnees["global"])
                self.assertNotIn("actions", donnees["projets"][0])
        donnees = vue("commercial")
        self.assertEqual(set(projet(donnees, "alpha")["liens"]), {"demo", "prod", "docs_client", "docs_commercial"})
        self.assertEqual([a["type"] for a in donnees["global"]["alertes"]], ["en_cours_ancien"])
        self.assertIn("ALPHA-004", json.dumps(donnees))
        self.assertIsNone(projet(donnees, "alpha")["prochaine_echeance"])
        self.assertEqual(projet(donnees, "alpha")["devis"][0], {"objet": "Application Alpha Menuiserie, lots 0 et 1, options et maintenance",
                                                                 "montant_ht": 10440, "statut": "accepte"})

    def test_client(self):
        for jeu in self.JEUX:
            with self.subTest(jeu=jeu):
                donnees = self.verifier("client", jeu)
                self.assertEqual(set(donnees), {"audience", "genere_le", "projets"})
                for p in donnees["projets"]:
                    self.assertEqual(set(p), {"slug", "nom", "statut", "liens", "lots", "items"})
                    self.assertEqual(set(p["liens"]), {"demo", "prod", "docs_client"})
        # Avancement toutes audiences confondues, sans révéler les items cachés.
        self.assertEqual(projet(vue("client"), "alpha")["lots"], [{"lot": 0, "pourcentage": 100}, {"lot": 1, "pourcentage": 25},
                                                                  {"lot": 2, "pourcentage": None}])

    def test_controle_de_surete(self):
        fuite = {"audience": "commercial", "genere_le": "x", "projets": [{"slug": "a", "items": [{"estimation_h": 3}]}]}
        with self.assertRaises(agreger.ErreurDonnees):
            agreger.verifier_filtrage(fuite)
        with self.assertRaises(agreger.ErreurDonnees):
            agreger.verifier_filtrage({"audience": "client", "genere_le": "x", "projets": [{"slug": "a", "apporteur": "theo"}]})


class TestLigneDeCommande(unittest.TestCase):
    SCRIPT = str(SCRIPTS / "agreger.py")

    def test_trois_audiences(self):
        with tempfile.TemporaryDirectory() as tmp:
            for audience in agreger.AUDIENCES:
                sortie = Path(tmp) / "out" / f"{audience}.json"
                resultat = lancer(self.SCRIPT, "--clients", "clients.yaml", "--racine", "racine", "--audience", audience, "--sortie", str(sortie))
                self.assertEqual(resultat.returncode, 0, resultat.stderr)
                donnees = json.loads(sortie.read_text(encoding="utf-8"))
                self.assertEqual(donnees["audience"], audience)
                self.assertIsNotNone(dt.datetime.fromisoformat(donnees["genere_le"]).utcoffset())
                self.assertIsInstance(donnees["projets"], list)
                self.assertTrue(sortie.read_text(encoding="utf-8").endswith("}\n"))

    def test_usage_incorrect(self):
        sortie = "/dev/null"
        self.assertEqual(lancer(self.SCRIPT, "--clients", "clients.yaml", "--racine", "racine", "--audience", "public", "--sortie", sortie).returncode, 2)
        self.assertEqual(lancer(self.SCRIPT, "--clients", "absent.yaml", "--racine", "racine", "--audience", "interne", "--sortie", sortie).returncode, 2)
        self.assertEqual(lancer(self.SCRIPT, "--clients", "clients.yaml", "--audience", "interne").returncode, 2)

    def test_donnees_invalides(self):
        with tempfile.TemporaryDirectory() as tmp:
            copie = Path(tmp) / "donnees"
            shutil.copytree(DONNEES, copie)
            client = copie / "racine" / "alpha-app" / "projet" / "client.yaml"
            client.write_text(client.read_text(encoding="utf-8").replace("statut: en_dev", "statut: inconnu"), encoding="utf-8")
            resultat = lancer(self.SCRIPT, "--clients", "clients.yaml", "--racine", "racine", "--audience", "interne", "--sortie", "out.json", cwd=copie)
            self.assertEqual(resultat.returncode, 1)
            self.assertIn("ERREUR", resultat.stderr)
            self.assertFalse((copie / "out.json").exists())

    def test_clone_manquant(self):
        with tempfile.TemporaryDirectory() as tmp:
            copie = Path(tmp) / "donnees"
            shutil.copytree(DONNEES, copie)
            shutil.rmtree(copie / "racine" / "beta-app")
            resultat = lancer(self.SCRIPT, "--clients", "clients.yaml", "--racine", "racine", "--audience", "client", "--sortie", "out.json", cwd=copie)
            self.assertEqual(resultat.returncode, 1)
            self.assertIn("clone introuvable", resultat.stderr)

    def test_sans_projet_ops(self):
        with tempfile.TemporaryDirectory() as tmp:
            sortie = Path(tmp) / "interne.json"
            resultat = lancer(self.SCRIPT, "--clients", str(DONNEES / "clients.yaml"), "--racine", str(DONNEES / "racine"),
                              "--audience", "interne", "--sortie", str(sortie), cwd=Path(tmp))
            self.assertEqual(resultat.returncode, 0, resultat.stderr)
            self.assertIn("projet ops ignoré", resultat.stderr)
            self.assertEqual([p["slug"] for p in json.loads(sortie.read_text(encoding="utf-8"))["projets"]], ["alpha", "beta"])


class TestRendu(unittest.TestCase):
    SCRIPT = str(SCRIPTS / "rendre.py")

    def test_gabarit(self):
        self.assertEqual(rendre.GABARIT.read_text(encoding="utf-8").count(rendre.MARQUEUR), 1)

    def test_injection_sure(self):
        donnees = {"audience": "client", "genere_le": "x", "projets": [{"nom": "</script><script>alert(1)</script>"}]}
        page = rendre.rendre(donnees, rendre.GABARIT.read_text(encoding="utf-8"))
        self.assertNotIn("<script>alert", page)
        contenu = re.search(r'<script id="donnees" type="application/json">(.*?)</script>', page, re.S).group(1)
        self.assertEqual(json.loads(contenu), donnees)

    def test_page_par_audience(self):
        with tempfile.TemporaryDirectory() as tmp:
            for audience in agreger.AUDIENCES:
                vue_json = Path(tmp) / f"{audience}.json"
                agreger.ecrire(vue(audience), vue_json)
                page = Path(tmp) / f"{audience}.html"
                resultat = lancer(self.SCRIPT, str(vue_json), "--sortie", str(page))
                self.assertEqual(resultat.returncode, 0, resultat.stderr)
                self.assertIn('"audience":"' + audience + '"', page.read_text(encoding="utf-8"))

    def test_projet_unique_pour_la_vue_client(self):
        with tempfile.TemporaryDirectory() as tmp:
            for audience in ("client", "commercial"):
                agreger.ecrire(vue(audience), Path(tmp) / f"{audience}.json")
            page = Path(tmp) / "alpha.html"
            resultat = lancer(self.SCRIPT, str(Path(tmp) / "client.json"), "--sortie", str(page), "--projet", "alpha")
            self.assertEqual(resultat.returncode, 0, resultat.stderr)
            texte = page.read_text(encoding="utf-8")
            self.assertIn("Alpha Menuiserie", texte)
            self.assertNotIn("Bêta Plomberie", texte)
            self.assertEqual(lancer(self.SCRIPT, str(Path(tmp) / "client.json"), "--sortie", str(page), "--projet", "zeta").returncode, 1)
            self.assertEqual(lancer(self.SCRIPT, str(Path(tmp) / "commercial.json"), "--sortie", str(page), "--projet", "alpha").returncode, 2)


if __name__ == "__main__":
    unittest.main()
