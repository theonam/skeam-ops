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
        self.assertEqual(lot0, {"lot": 0, "titre": "Démo", "description": "Connexion et catalogue des menuiseries.", "nb_items": 2,
                                "a_faire": 0, "en_cours": 0, "developpe": 2, "termine": 2, "pct_developpe": 100, "pourcentage": 100, "heures_estimees": 7, "heures_reelles": 8.5,
                                "ecart_pct": 21, "depassement": True})
        # En interne, ALPHA-006 à valider compte et se signale ; le pourcentage du contrat l'exclut toujours.
        self.assertEqual((lot1["pourcentage"], lot1["pct_developpe"], lot1["nb_items"], lot1["developpe"], lot1["termine"]), (20, 40, 5, 2, 1))
        self.assertEqual((lot1["a_faire"], lot1["en_cours"]), (2, 1))
        self.assertEqual((lot1["titre"], lot1["description"]), ("Devis de pose et commandes fournisseurs", ""))
        self.assertEqual((lot2["titre"], lot2["description"]), (None, None))
        self.assertEqual((lot1["heures_estimees"], lot1["heures_reelles"]), (14, 4.5))
        self.assertEqual((lot2["pourcentage"], lot2["nb_items"], lot2["developpe"]), (None, 0, 0))
        self.assertEqual([l["pourcentage"] for l in self.beta["lots"]], [100, 33])

    def test_a_valider_sans_effet(self):
        """Depuis le 2026-10-16, a_valider ne filtre plus rien : seule l'audience décide de ce qui est visible."""
        with tempfile.TemporaryDirectory() as tmp:
            copie = Path(tmp) / "donnees"
            shutil.copytree(DONNEES, copie)
            for fichier in (copie / "racine" / "beta-app" / "projet" / "backlog").glob("*.yaml"):
                fichier.write_text(fichier.read_text(encoding="utf-8").replace("audience: commercial", "audience: interne")
                                   .replace("audience: client", "audience: interne").replace("a_valider: false", "a_valider: true"), encoding="utf-8")
            interne = projet(vue("interne", clients=copie / "clients.yaml", racine=copie / "racine", cwd=copie), "beta")
            commercial = vue("commercial", clients=copie / "clients.yaml", racine=copie / "racine", cwd=copie)
        self.assertEqual([(l["developpe"], l["nb_items"]) for l in interne["lots"]], [(1, 1), (2, 3)])
        self.assertEqual([l["pourcentage"] for l in interne["lots"]], [100, 33])
        self.assertEqual(projet(commercial, "beta")["lots"], [])

    def test_temps_non_journalise(self):
        with tempfile.TemporaryDirectory() as tmp:
            copie = Path(tmp) / "donnees"
            shutil.copytree(DONNEES, copie)
            for fichier in (copie / "racine" / "beta-app" / "projet" / "temps").glob("*.jsonl"):
                fichier.unlink()
            donnees = vue("interne", clients=copie / "clients.yaml", racine=copie / "racine", cwd=copie)
        beta = projet(donnees, "beta")
        self.assertFalse(beta["temps"]["journalise"])
        self.assertTrue(all(l["heures_reelles"] is None and l["ecart_pct"] is None for l in beta["lots"]))
        self.assertTrue(all(i["heures_reelles"] is None for i in beta["items"]))
        charge = {c["slug"]: c["journalise"] for c in donnees["global"]["charge_semaine"]["par_projet"]}
        self.assertEqual(charge, {"alpha": True, "beta": False, "ops": True})
        self.assertTrue(projet(donnees, "alpha")["temps"]["journalise"])

    def test_devis_non_saisi(self):
        self.assertTrue(self.alpha["devis_saisi"])
        self.assertEqual(self.vue["global"]["nb_devis_non_saisis"], 0)
        with tempfile.TemporaryDirectory() as tmp:
            copie = Path(tmp) / "donnees"
            shutil.copytree(DONNEES, copie)
            client = copie / "racine" / "beta-app" / "projet" / "client.yaml"
            texte = client.read_text(encoding="utf-8")
            debut, fin = texte.index("montants_ht:"), texte.index("liens:")
            client.write_text(texte[:debut] + "montants_ht:\n  build_signe: 0\n  options_signees: 0\n  run_annuel: 0\ndevis: []\n" + texte[fin:], encoding="utf-8")
            for audience in ("interne", "commercial"):
                donnees = vue(audience, clients=copie / "clients.yaml", racine=copie / "racine", cwd=copie)
                self.assertFalse(projet(donnees, "beta")["devis_saisi"])
                self.assertEqual(donnees["global"]["nb_devis_non_saisis"], 1)

    def test_temps_et_charge(self):
        self.assertEqual(self.alpha["temps"], {"semaine_h": 4.0, "semaine_theo_h": 1.5, "semaine_agents_h": 2.5,
                                               "semaine_precedente_h": 6.0, "total_h": 15.5, "hors_item_h": 2.5, "a_relire_h": 2.5,
                                               "journalise": True, "depuis": "2026-10-01"})
        charge = self.vue["global"]["charge_semaine"]
        self.assertEqual((charge["total_h"], charge["total_theo_h"], charge["total_agents_h"]), (8.75, 1.5, 7.25))
        self.assertEqual([c["slug"] for c in charge["par_projet"]], ["alpha", "beta", "ops"])

    def test_alertes(self):
        alertes = {(a["type"], a["cible"]) for a in self.vue["global"]["alertes"]}
        self.assertEqual(alertes, {
            ("depassement_item", "ALPHA-001"),
            ("depassement_lot", "lot 0"),
            ("bloque_externe", "ALPHA-003"),
            ("en_cours_ancien", "ALPHA-003"),
        })
        self.assertEqual(self.vue["global"]["alertes"][0]["gravite"], "haute")

    def test_compteurs(self):
        self.assertNotIn("a_faire", self.vue["global"])
        self.assertEqual(self.alpha["compteurs"], {"devis_a_envoyer": 1})
        self.assertNotIn("items_a_valider", self.alpha)
        self.assertNotIn("a_valider", self.alpha["items"][0])
        self.assertEqual(self.alpha["devis_a_envoyer"], [{"objet": "Option export comptable", "montant_ht": 1200}])
        self.assertEqual(self.beta["compteurs"], {"devis_a_envoyer": 0})
        self.assertEqual(self.alpha["todoist"], {"projet_id": "7Kg9WRYyqxw67WR8", "section_id": None})

    def test_listes_du_projet(self):
        self.assertEqual([i["id"] for i in self.alpha["items_bloques"]], ["ALPHA-003"])
        self.assertEqual(self.alpha["items_bloques"][0]["dependances_externes"], ["grille tarifaire de pose fournie par le client"])
        self.assertEqual([(i["id"], i["jours"]) for i in self.alpha["items_en_cours_anciens"]], [("ALPHA-003", 13)])
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
                self.assertEqual(set(lot), {"lot", "titre", "description", "nb_items", "a_faire", "en_cours", "developpe", "termine",
                                            "pct_developpe", "pourcentage"})
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
        self.assertEqual([(l["lot"], l["pourcentage"], l["developpe"], l["nb_items"], l["titre"]) for l in projet(vue("client"), "alpha")["lots"]],
                         [(0, 100, 2, 2, "Démo"), (1, 20, 2, 5, "Devis de pose et commandes fournisseurs"), (2, None, 0, 0, None)])

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
        gabarit = rendre.GABARIT.read_text(encoding="utf-8")
        self.assertEqual(gabarit.count(rendre.MARQUEUR), 1)
        self.assertEqual(gabarit.count(rendre.MARQUEUR_TODOIST), 1)

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

    INSTANTANE = {
        "releve_le": "2026-10-15T09:00:00+02:00",
        "sections": [{"id": "s1", "name": "Client · Alpha Menuiserie"}, {"id": "s2", "name": "SKEAM · Entreprise"}],
        "taches": [
            {"id": "t1", "content": "Relancer la grille tarifaire", "priority": "p1", "dueDate": "2026-10-12", "sectionId": "s1", "checked": False, "description": "secret"},
            {"id": "t2", "content": "Tâche p3 hors liste", "priority": "p3", "sectionId": "s1", "checked": False},
            {"id": "t3", "content": "Facture fournisseur", "priority": "p1", "sectionId": "s2", "checked": False},
            {"id": "t4", "content": "Déjà faite", "priority": "p2", "sectionId": "s1", "checked": True},
        ],
    }

    def todoist_de(self, page: str):
        return json.loads(re.search(r'<script id="todoist" type="application/json">(.*?)</script>', page, re.S).group(1))

    def test_todoist_vue_interne(self):
        gabarit = rendre.GABARIT.read_text(encoding="utf-8")
        todoist = self.todoist_de(rendre.rendre(vue("interne"), gabarit, self.INSTANTANE))
        self.assertEqual(todoist["config"]["projet_id"], "6h6qfvrgr83M56Gq")
        self.assertEqual(todoist["instantane"]["sections"], [{"id": "s1", "name": "Client · Alpha Menuiserie"}])
        self.assertEqual(todoist["instantane"]["taches"], [{"id": "t1", "content": "Relancer la grille tarifaire", "priority": "p1",
                                                           "dueDate": "2026-10-12", "sectionId": "s1"}])
        self.assertIsNone(self.todoist_de(rendre.rendre(vue("interne"), gabarit))["instantane"])
        for audience in ("commercial", "client"):
            self.assertIsNone(self.todoist_de(rendre.rendre(vue(audience), gabarit)))
            with self.assertRaises(ValueError):
                rendre.rendre(vue(audience), gabarit, self.INSTANTANE)

    def test_todoist_ligne_de_commande(self):
        with tempfile.TemporaryDirectory() as tmp:
            instantane = Path(tmp) / "todoist.json"
            instantane.write_text(json.dumps(self.INSTANTANE), encoding="utf-8")
            for audience in ("interne", "commercial"):
                agreger.ecrire(vue(audience), Path(tmp) / f"{audience}.json")
            page = Path(tmp) / "interne.html"
            resultat = lancer(self.SCRIPT, str(Path(tmp) / "interne.json"), "--sortie", str(page), "--todoist", str(instantane))
            self.assertEqual(resultat.returncode, 0, resultat.stderr)
            self.assertNotIn("secret", page.read_text(encoding="utf-8"))
            self.assertEqual(lancer(self.SCRIPT, str(Path(tmp) / "commercial.json"), "--sortie", str(page), "--todoist", str(instantane)).returncode, 2)
            self.assertEqual(lancer(self.SCRIPT, str(Path(tmp) / "interne.json"), "--sortie", str(page), "--todoist", str(Path(tmp) / "absent.json")).returncode, 1)

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


class TestGabaritFige(unittest.TestCase):
    """Le format de sortie et les blocs du gabarit sont figés par dashboard/format.json : toute évolution passe par Théo."""

    FORMAT = json.loads((RACINE_OPS / "dashboard" / "format.json").read_text(encoding="utf-8"))
    JEUX = TestFiltrage.JEUX

    def test_cles_figees(self):
        for jeu, parametres in self.JEUX.items():
            for audience in agreger.AUDIENCES:
                with self.subTest(jeu=jeu, audience=audience):
                    donnees = vue(audience, **parametres)
                    attendu = self.FORMAT["audiences"][audience]
                    self.assertEqual(sorted(donnees), attendu["enveloppe"])
                    if "global" in attendu:
                        self.assertEqual(sorted(donnees["global"]), attendu["global"])
                    for alerte in donnees.get("global", {}).get("alertes", []):
                        if "alerte" in attendu:
                            self.assertEqual(sorted(alerte), attendu["alerte"])
                    for p in donnees["projets"]:
                        self.assertEqual(sorted(p), attendu["projet"], p["slug"])
                        for lot in p["lots"]:
                            self.assertEqual(sorted(lot), attendu["lot"])
                        for item in p["items"]:
                            self.assertEqual(sorted(item), attendu["item"])
                        for cle in ("budget", "temps"):
                            if cle in attendu:
                                self.assertEqual(sorted(p[cle]), attendu[cle])

    def test_gabarit_versionne_et_complet(self):
        gabarit = rendre.GABARIT.read_text(encoding="utf-8")
        version = re.search(r'<meta name="skeam:gabarit" content="([0-9]+)">', gabarit)
        self.assertIsNotNone(version, "version du gabarit absente")
        self.assertEqual(int(version.group(1)), self.FORMAT["version"])
        for bloc in sorted({b for blocs in self.FORMAT["blocs"].values() for b in blocs}):
            self.assertIn(f'data-bloc="{bloc}"', gabarit, bloc)


if __name__ == "__main__":
    unittest.main()
