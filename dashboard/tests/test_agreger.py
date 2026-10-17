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
import conso  # noqa: E402
import rendre  # noqa: E402
import validate  # noqa: E402

MAINTENANT = dt.datetime(2026, 10, 15, 9, 0, tzinfo=ZoneInfo("Europe/Paris"))
CHAMPS_ITEM = {
    "commercial": {"id", "titre", "lot", "statut", "priorite", "maj", "module"},
    "client": {"id", "titre", "lot", "statut", "priorite", "maj"},
}
MOTS_INTERDITS = re.compile(r"estimation|heure|temps|minute|taux|tarif|marge|ecart|depassement", re.I)


TARIFS_TEST = DONNEES / "tarifs-modeles.yaml"


def vue(audience: str, clients: Path = DONNEES / "clients.yaml", racine: Path = DONNEES / "racine", cwd: Path = DONNEES,
        tarifs: Path | None = TARIFS_TEST) -> dict:
    with contextlib.chdir(cwd), contextlib.redirect_stderr(io.StringIO()):
        return agreger.agreger(clients, racine, audience, MAINTENANT, tarifs_modeles=tarifs)


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
                                "ecart_pct": 21, "depassement": True,
                                "conso": {"heures_machine": 2.0, "heures_machine_estimees": 1.0, "jetons_total": 121_000, "cout_usd": 0.23}})
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
            ("conso_tarif_manquant", "dashboard/tarifs-modeles.yaml"),
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


class TestDevisEtLots(unittest.TestCase):
    """Chaque devis avec ses lots et items, leur avancement, et ses factures : vues interne et commerciale."""

    def alpha(self, audience):
        return next(p for p in vue(audience)["projets"] if p["slug"] == "alpha")

    def test_perimetre_par_lot_et_par_item(self):
        complet, option = self.alpha("interne")["devis"]
        self.assertEqual([(l["lot"], l["partiel"], l["nb_items"]) for l in complet["perimetre"]], [(0, False, 2), (1, True, 4)])
        # L'item cité par l'option lui appartient, même si son lot est dans le périmètre du premier devis.
        self.assertEqual([(l["lot"], l["partiel"], l["nb_items"], l["termine"]) for l in option["perimetre"]], [(1, True, 1, 1)])
        self.assertEqual(self.alpha("interne")["hors_devis"], [])

    def test_ids_visibles_seulement(self):
        # Les fonctionnalités nommées dans une partie de lot sont celles que l'audience a le droit de voir.
        audiences = {i["id"]: i["audience"] for i in self.alpha("interne")["items"]}
        for d in self.alpha("commercial")["devis"]:
            for partie in d["perimetre"] or []:
                self.assertTrue(all(audiences[i] in ("client", "commercial") for i in partie["ids"]), partie["ids"])
        interne = [i for d in self.alpha("interne")["devis"] for partie in d["perimetre"] or [] for i in partie["ids"]]
        self.assertTrue(any(audiences[i] == "interne" for i in interne) or not any(a == "interne" for a in audiences.values()))

    def test_facturables(self):
        # À vendre en plus : ce qui n'est dans aucun devis envoyé ou signé, ici l'item du devis en brouillon, avec son prix.
        facturables = {f["id"]: f for f in self.alpha("commercial")["facturables"]}
        self.assertIn("ALPHA-008", facturables)
        self.assertEqual(facturables["ALPHA-008"]["prix_vente_ht"], 1200)
        self.assertNotIn("ALPHA-001", facturables)
        self.assertNotIn("facturables", vue("client")["projets"][0])

    def test_factures_et_retard(self):
        factures = self.alpha("commercial")["devis"][0]["factures"]
        self.assertEqual([(f["statut"], f["en_retard"]) for f in factures], [("payee", False), ("envoyee", True)])

    def test_sans_perimetre(self):
        beta = next(p for p in vue("interne")["projets"] if p["slug"] == "beta")
        self.assertTrue(all(d["perimetre"] is None for d in beta["devis"]))
        self.assertIsNone(beta["hors_devis"])

    def test_absent_de_la_vue_client(self):
        projet = vue("client")["projets"][0]
        self.assertNotIn("devis", projet)
        self.assertNotIn("hors_devis", projet)


class TestFiltrage(unittest.TestCase):
    """Section 10 : rien de ce que l'audience ne peut pas voir, sur les données de test et sur exemples/."""

    JEUX = {
        "donnees": dict(clients=DONNEES / "clients.yaml", racine=DONNEES / "racine", cwd=DONNEES),
        "exemples": dict(clients=RACINE_OPS / "exemples" / "clients.yaml", racine=RACINE_OPS / "exemples" / "racine", cwd=RACINE_OPS, tarifs=None),
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
        for mot in ("SECRET-MARGE", "NOTE-INTERNE", "externe", "todoist", "theonam/", "conso", "cout_usd", "jetons", "claude-opus", "session_01"):
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
        devis = projet(donnees, "alpha")["devis"][0]
        self.assertEqual({k: devis[k] for k in ("objet", "montant_ht", "statut")},
                         {"objet": "Application Alpha Menuiserie, lots 0 et 1, options et maintenance", "montant_ht": 10440, "statut": "accepte"})

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
        for cle in ("conso", "cout_usd", "jetons_total"):
            with self.subTest(cle=cle), self.assertRaises(agreger.ErreurDonnees):
                agreger.verifier_filtrage({"audience": "commercial", "genere_le": "x", "projets": [{"slug": "a", "lots": [{cle: 1}]}]})


class TestConso(unittest.TestCase):
    """Temps machine, durée réelle et coût des agents, vue interne : CONTRAT.md section 15.4.

    Données : racine/alpha-app/.skeam/conso et racine/beta-app/.skeam/conso, une session partagée
    entre alpha et beta, une ligne en double moins riche, une ligne invalide, un modèle sans tarif.
    """

    @classmethod
    def setUpClass(cls):
        cls.vue = vue("interne")
        cls.alpha = projet(cls.vue, "alpha")
        cls.beta = projet(cls.vue, "beta")

    def test_projet(self):
        c = self.alpha["conso"]
        self.assertEqual((c["depuis"], c["sessions"], c["agents"]), ("2026-10-07", 2, 5))
        # 60 + 60 + 30 + 10 + 60 minutes ; réunion : 90 + 30 + 10 le 14, 60 le 7.
        self.assertEqual((c["heures_machine"], c["heures_reelles"]), (3.67, 3.17))
        self.assertEqual((c["semaine_heures_machine"], c["semaine_heures_reelles"], c["semaine_cout_usd"]), (2.67, 2.17, 0.98))
        self.assertEqual(c["cout_usd"], 1.18)
        self.assertTrue(c["tarifs_a_confirmer"])
        self.assertEqual(c["modeles_sans_tarif"], [])
        self.assertEqual(c["hors_item"], {"heures_machine": 0.5, "cout_usd": 0.03})
        # La ligne du 7 liée par session est comptée et montrée à part, estimée.
        self.assertEqual(c["estime"]["heures_machine"], 1.0)
        self.assertEqual(c["items_hors_backlog"], [{"id": "ALPHA-099", "heures_machine": 0.17, "cout_usd": 0.0}])
        self.assertEqual([(m["modele"], m["heures_machine"]) for m in c["par_modele"]], [("claude-opus-5-5", 2.5), ("claude-haiku-5-5", 1.17)])
        self.assertEqual(c["jetons"], {"entree": 53_100, "sortie": 14_600, "lecture_cache": 1_060_000, "ecriture_cache": 100_000})

    def test_lots_et_items(self):
        lots = {l["lot"]: l["conso"] for l in self.alpha["lots"]}
        self.assertEqual(lots[1], {"heures_machine": 1.0, "heures_machine_estimees": 0.0, "jetons_total": 1_103_000, "cout_usd": 0.91})
        self.assertEqual(lots[0]["heures_machine"], 2.0)
        self.assertEqual(lots[0]["cout_usd"], 0.23)
        self.assertIsNone(lots[2])
        items = {i["id"]: i["conso"] for i in self.alpha["items"]}
        self.assertEqual(items["ALPHA-003"], {"heures_machine": 0.5, "heures_machine_estimees": 0.0, "jetons_total": 551_500, "cout_usd": 0.46})
        self.assertIsNone(items["ALPHA-005"])
        # À côté du temps passé validé, jamais ajouté : les heures réelles des items restent celles du journal.
        self.assertEqual(self.alpha["lots"][1]["heures_reelles"], 4.5)

    def test_partage_entre_projets_et_tarif_manquant(self):
        b = self.beta["conso"]
        self.assertEqual(b["heures_machine"], 0.83)
        self.assertIsNone(b["cout_usd"])
        self.assertEqual(b["modeles_sans_tarif"], ["claude-mystere-1"])
        self.assertEqual({i["id"]: i["conso"]["cout_usd"] for i in self.beta["items"] if i["conso"]}, {"BETA-002": 0.01, "BETA-003": None})
        self.assertIsNone(projet(self.vue, "ops")["conso"])
        g = self.vue["global"]["conso"]
        # La ligne de la session partagée, lue dans alpha et beta, compte une fois.
        self.assertEqual((g["heures_machine"], g["heures_reelles"], g["cout_usd"], g["tarifs_du"]), (4.5, 3.67, None, "2026-10-01"))
        alertes = [a for a in self.vue["global"]["alertes"] if a["type"].startswith("conso")]
        self.assertEqual([(a["slug"], a["gravite"]) for a in alertes], [("beta", "basse")])

    def test_formule_de_cout(self):
        prix = conso.charger_tarifs(TARIFS_TEST)
        compteurs = {"entree": 1000, "sortie": 2000, "lecture_cache": 1_000_000, "ecriture_cache": 100_000, "ecriture_cache_1h": 50_000, "recherches_web": 2}
        valeur, confirmer = conso.cout_modele(compteurs, conso.tarif(prix, "claude-opus-5-5", "2026-10-14"))
        self.assertAlmostEqual(valeur, 0.004 + 0.04 + 0.2 + 0.5 + 0.15 + 0.02)
        self.assertTrue(confirmer)
        long = {"entree": 50_000, "sortie": 1000, "lecture_cache": 60_000, "ecriture_cache": 0, "ecriture_cache_1h": 0, "recherches_web": 0,
                "au_dela_100k": {"entree": 50_000, "sortie": 1000, "lecture_cache": 60_000, "ecriture_cache": 0}}
        valeur, confirmer = conso.cout_modele(long, conso.tarif(prix, "claude-haiku-5-5", "2026-10-14"))
        self.assertAlmostEqual(valeur, 0.025 + 0.0025 + 0.003)
        self.assertFalse(confirmer)
        # Tarif daté : l'entrée en vigueur au début de la ligne, à défaut la plus ancienne.
        self.assertEqual(conso.tarif(prix, "claude-opus-5-5", "2026-12-15")["entree"], 400)
        self.assertEqual(conso.tarif(prix, "claude-opus-5-5", "2026-09-01")["depuis"], "2026-10-01")
        self.assertIsNone(conso.tarif(prix, "claude-mystere-1", "2026-10-14"))

    def test_ligne_invalide_signalee(self):
        erreurs = io.StringIO()
        with contextlib.redirect_stderr(erreurs):
            lignes = conso.lire_depot(DONNEES / "racine" / "alpha-app")
        self.assertIn("ligne 7 ignorée", erreurs.getvalue())
        self.assertEqual(len(lignes), 7)
        self.assertEqual(len(conso.dedoublonner((l, "alpha") for l in lignes)), 6)

    def test_ligne_partagee_sans_duree_reelle_doublee(self):
        """Une ligne d'une heure répartie sur deux items et deux projets ne donne jamais plus d'une heure réelle."""
        ligne = {"version": 1, "session": "s-partagee-01", "session_distante": None, "agent_id": None, "type": "principal",
                 "run": None, "phase": None, "libelle": None, "debut": "2026-10-14T10:00:00+02:00", "fin": "2026-10-14T11:00:00+02:00",
                 "periodes": [["2026-10-14T10:00:00+02:00", "2026-10-14T11:00:00+02:00"]], "minutes_actives": 60.0, "messages": 4,
                 "modeles": {"claude-opus-5-5": {"entree": 10, "sortie": 10, "lecture_cache": 0, "ecriture_cache": 0, "ecriture_cache_1h": 0, "recherches_web": 0}},
                 "items": [{"id": "ALPHA-001", "part": 0.3}, {"id": "ALPHA-002", "part": 0.3}, {"id": "BETA-001", "part": 0.4}],
                 "lien": "commits", "commits": [], "releve_le": "2026-10-14T12:00:00+02:00"}
        resultat = conso.ventiler([conso.Releve(ligne, "alpha")], {"ALPHA": "alpha", "BETA": "beta"},
                                  {"alpha": {"ALPHA-001": 0, "ALPHA-002": 0}, "beta": {"BETA-001": 0}},
                                  conso.charger_tarifs(TARIFS_TEST), dt.date(2026, 10, 12))
        alpha, beta = resultat.projets["alpha"], resultat.projets["beta"]
        self.assertEqual(alpha.item("ALPHA-001"), {"heures_machine": 0.3, "heures_machine_estimees": 0.0, "jetons_total": 6, "cout_usd": 0.0})
        self.assertNotIn("heures_reelles", alpha.lot(["ALPHA-001", "ALPHA-002"]))
        self.assertEqual(alpha.lot(["ALPHA-001", "ALPHA-002"])["heures_machine"], 0.6)
        # Le projet qui porte 0,6 de la ligne en compte la durée réelle, celui qui en porte 0,4 non ; le global une fois.
        self.assertEqual((alpha.sortie()["heures_machine"], alpha.sortie()["heures_reelles"]), (0.6, 1.0))
        self.assertEqual((beta.sortie()["heures_machine"], beta.sortie()["heures_reelles"]), (0.4, 0.0))
        self.assertEqual(resultat.globale()["heures_reelles"], 1.0)

    def test_union(self):
        t = lambda h, m: dt.datetime(2026, 10, 14, h, m, tzinfo=ZoneInfo("Europe/Paris"))
        self.assertEqual(conso.union_minutes([(t(9, 0), t(10, 0)), (t(9, 30), t(10, 30)), (t(11, 0), t(11, 15))]), 105)

    def test_tarifs_invalides(self):
        with tempfile.TemporaryDirectory() as tmp:
            faux = Path(tmp) / "tarifs.yaml"
            faux.write_text("devise: EUR\ntarifs: []\n", encoding="utf-8")
            with self.assertRaises(agreger.ErreurDonnees):
                vue("interne", tarifs=faux)
            # Les vues commercial et client ne lisent ni les relevés ni les tarifs.
            self.assertNotIn("conso", json.dumps(vue("commercial", tarifs=faux)))


class TestConsoGit(unittest.TestCase):
    """Lecture dans un vrai clone : toutes les branches, la ligne la plus riche gardée ; sessions sans relevé."""

    ENV = {"GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1", "GIT_AUTHOR_NAME": "T", "GIT_AUTHOR_EMAIL": "t@example.invalid",
           "GIT_COMMITTER_NAME": "T", "GIT_COMMITTER_EMAIL": "t@example.invalid"}

    def git(self, depot, *args):
        import os
        return subprocess.run(["git", "-C", str(depot), *args], capture_output=True, text=True, check=True, env={**os.environ, **self.ENV})

    def test_branches(self):
        source = DONNEES / "racine" / "alpha-app" / ".skeam" / "conso" / "2026-10-07-11111111-aaaa-4bbb-8ccc-000000000002.jsonl"
        ligne = json.loads(source.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            depot = Path(tmp) / "depot"
            fichier = depot / ".skeam" / "conso" / source.name
            fichier.parent.mkdir(parents=True)
            self.git(depot.parent, "init", "-q", "-b", "main", str(depot))
            fichier.write_text(json.dumps(ligne) + "\n", encoding="utf-8")
            self.git(depot, "add", "-A")
            self.git(depot, "commit", "-q", "-m", "ALPHA-002: v1", "-m", "Claude-Session: https://claude.ai/code/session_01Connue0001")
            self.git(depot, "checkout", "-q", "-b", "wip")
            fichier.write_text(json.dumps(dict(ligne, messages=9, releve_le="2026-10-08T10:00:00+02:00")) + "\n", encoding="utf-8")
            self.git(depot, "commit", "-q", "-am", "ALPHA-002: v2", "-m", "Claude-Session: https://claude.ai/code/session_01Inconnue01")
            self.git(depot, "checkout", "-q", "main")
            fichier.unlink()
            lignes = conso.lire_depot(depot)
            self.assertEqual(sorted(l["messages"] for l in lignes), [6, 9])
            self.assertEqual([r.ligne["messages"] for r in conso.dedoublonner((l, "alpha") for l in lignes)], [9])
            self.assertEqual(conso.sessions_sans_releve(depot, "2026-01-01", {"session_01Connue0001"}), 1)
            self.assertEqual(conso.sessions_sans_releve(DONNEES / "racine" / "alpha-app", "2026-01-01", set()), 0)


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
                texte = page.read_text(encoding="utf-8")
                self.assertIn('"audience":"' + audience + '"', texte)
                donnees_page = json.loads(re.search(r'<script id="donnees" type="application/json">(.*?)</script>', texte, re.S).group(1))
                # Le bloc des agents n'a de données que dans la vue interne.
                self.assertEqual("conso" in json.dumps(donnees_page), audience == "interne")

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
                        if p.get("conso"):
                            self.assertEqual(sorted(p["conso"]), attendu["conso_projet"])
                            for modele in p["conso"]["par_modele"]:
                                self.assertEqual(sorted(modele), attendu["conso_modele"])
                        for element in [*p["lots"], *p["items"]]:
                            if element.get("conso"):
                                self.assertEqual(sorted(element["conso"]), attendu["conso_lot"])
                    if donnees.get("global", {}).get("conso"):
                        self.assertEqual(sorted(donnees["global"]["conso"]), attendu["conso_global"])
                        for devis in p.get("devis", []):
                            self.assertEqual(sorted(devis), attendu["devis"])
                            for partie in devis["perimetre"] or []:
                                self.assertEqual(sorted(partie), attendu["devis_lot"])
                            for facture in devis["factures"]:
                                self.assertEqual(sorted(facture), attendu["facture"])

    def test_gabarit_versionne_et_complet(self):
        gabarit = rendre.GABARIT.read_text(encoding="utf-8")
        version = re.search(r'<meta name="skeam:gabarit" content="([0-9]+)">', gabarit)
        self.assertIsNotNone(version, "version du gabarit absente")
        self.assertEqual(int(version.group(1)), self.FORMAT["version"])
        for bloc in sorted({b for blocs in self.FORMAT["blocs"].values() for b in blocs}):
            self.assertIn(f'data-bloc="{bloc}"', gabarit, bloc)


if __name__ == "__main__":
    unittest.main()
