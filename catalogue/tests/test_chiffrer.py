"""Tests de chiffrer.py sur le projet fictif et le catalogue d'essai."""

from __future__ import annotations

import unittest

from outils import BaseTemporaire, contrat, executer, methode, validate

import chiffrer

DATE = "2026-10-15"


class TestChiffrer(BaseTemporaire):
    def chiffrer(self, sortie=None):
        sortie = sortie or self.projet / "devis"
        return executer(chiffrer.main, [str(self.projet), "--sortie", str(sortie)], aujourdhui=DATE, dossier_catalogue=self.catalogue)

    def lire(self, sortie=None):
        sortie = sortie or self.projet / "devis"
        return contrat.charger_json(sortie / f"chiffrage-{DATE}.json"), (sortie / f"chiffrage-{DATE}.md").read_text(encoding="utf-8")

    def test_sorties_conformes_au_contrat(self):
        code, sortie, erreurs = self.chiffrer()
        self.assertEqual(code, 0, erreurs)
        self.assertIn("Chiffrage écrit", sortie)
        donnees, _ = self.lire()
        self.assertEqual(list(donnees), ["slug", "date", "objet", "lignes", "total_ht"])
        self.assertEqual(donnees["slug"], "fictif")
        self.assertEqual(donnees["date"], DATE)
        self.assertEqual(donnees["objet"], "Application de gestion Bâtiment Fictif, lots 0, 1 et 2")
        rapport = validate.Rapport()
        self.assertTrue(validate.verifier_chiffrage(rapport, "json", donnees))
        self.assertEqual(rapport.nb_erreurs, 0)
        self.assertProjetValide(self.projet)

    def test_lignes_par_lot_et_options(self):
        self.chiffrer()
        donnees, _ = self.lire()
        titres = [ligne["titre"] for ligne in donnees["lignes"]]
        self.assertEqual(titres, ["Lot 0 : démo, connexion", "Lot 1 : devis et facturation", "Options du lot 2"])
        for ligne in donnees["lignes"]:
            self.assertEqual((ligne["quantite"], ligne["unite"], ligne["tva"]), (1, "forfait", 0.2))
            self.assertEqual(ligne["prix_unitaire_ht"] % methode.ARRONDI_HT, 0)
        self.assertEqual(donnees["total_ht"], sum(ligne["prix_unitaire_ht"] for ligne in donnees["lignes"]))

    def test_calcul_du_lot_1(self):
        # devis, confiance moyenne, une observation de 16 h : référence (15 + 16) / 2 = 15,5 h > 12 h au backlog,
        # réparties 8/12 en L et 4/12 en M. facturation-simple, forte : médiane 12 h > 6 h au backlog, en M.
        # relances, absent du catalogue : 3 h en S.
        attendu = (15.5 * 8 / 12 * 1.3 + 15.5 * 4 / 12 * 1.2 + 12 * 1.2 + 3 * 1.15) * 70
        self.chiffrer()
        donnees, md = self.lire()
        self.assertEqual(donnees["lignes"][1]["prix_unitaire_ht"], methode.arrondi_sup(attendu))
        self.assertEqual(donnees["lignes"][1]["prix_unitaire_ht"], 2650)
        self.assertIn("**Probable relevé par les mesures** sur `devis` : 15,5 h", md)
        self.assertIn("**Écart backlog et catalogue** sur `facturation-simple`", md)

    def test_points_d_attention(self):
        self.chiffrer()
        donnees, md = self.lire()
        self.assertIn("**Items hors catalogue**", md)
        self.assertIn("FICTIF-002 Paramétrage de la démo", md)
        self.assertIn("**Modules absents du catalogue**, traités comme hors catalogue : FICTIF-006 sur `relances`", md)
        self.assertIn("**Modules de confiance faible**", md)
        self.assertIn("`connexion-droits`, `app-terrain`", md)
        self.assertIn("**Exclu** : FICTIF-008", md)
        self.assertIn("**Exclu** : FICTIF-009", md)

    def test_exclus_et_items_non_client_absents_du_devis(self):
        self.chiffrer()
        donnees, _ = self.lire()
        descriptions = " ".join(ligne["description"] for ligne in donnees["lignes"])
        for titre in ("Tableau de bord du gérant", "Export comptable", "Paramétrage de la démo", "Factures et avoirs"):
            self.assertNotIn(titre, descriptions)
        self.assertIn("Relance des impayés", descriptions)

    def test_fonctionnalites_par_importance_pour_le_client(self):
        self.chiffrer()
        donnees, md = self.lire()
        # Lot 1 : FICTIF-003 indispensable, puis FICTIF-004 et FICTIF-006 souhaitables dans l'ordre du backlog.
        self.assertEqual(
            donnees["lignes"][1]["description"],
            "- Création et envoi des devis\n- Transformation du devis en facture\n- Relance des impayés",
        )
        self.assertIn("- Création et envoi des devis<br>- Transformation du devis en facture<br>- Relance des impayés", md)
        self.assertIn("de la plus importante pour le client", md)

    def test_priorite_avant_ordre_du_backlog(self):
        backlog = self.projet / "backlog" / "backlog.yaml"
        texte = backlog.read_text(encoding="utf-8")
        debut = texte.index("  - id: FICTIF-006")
        texte = texte[:debut] + texte[debut:].replace("priorite: souhaitable", "priorite: indispensable", 1)
        backlog.write_text(texte, encoding="utf-8")
        self.chiffrer()
        donnees, _ = self.lire()
        self.assertEqual(
            donnees["lignes"][1]["description"].split("\n"),
            ["- Création et envoi des devis", "- Relance des impayés", "- Transformation du devis en facture"],
        )

    def test_ordre_du_backlog_a_priorite_egale(self):
        backlog = self.projet / "backlog" / "backlog.yaml"
        texte = backlog.read_text(encoding="utf-8")
        debut, milieu, fin = texte.index("  - id: FICTIF-004"), texte.index("  - id: FICTIF-005"), texte.index("  - id: FICTIF-006")
        suite = texte.index("  - id: FICTIF-007")
        texte = texte[:debut] + texte[fin:suite] + texte[milieu:fin] + texte[debut:milieu] + texte[suite:]
        backlog.write_text(texte, encoding="utf-8")
        self.chiffrer()
        donnees, _ = self.lire()
        self.assertEqual(
            donnees["lignes"][1]["description"].split("\n"),
            ["- Création et envoi des devis", "- Relance des impayés", "- Transformation du devis en facture"],
        )

    def test_reproductible(self):
        autre = self.tmp / "autre"
        self.chiffrer()
        self.chiffrer(autre)
        for extension in ("md", "json"):
            self.assertEqual(
                (self.projet / "devis" / f"chiffrage-{DATE}.{extension}").read_bytes(),
                (autre / f"chiffrage-{DATE}.{extension}").read_bytes(),
            )

    def test_second_passage_remplace_les_deux_fichiers(self):
        self.chiffrer()
        self.remplacer(self.projet / "backlog" / "backlog.yaml", "estimation_h: 14", "estimation_h: 18")
        self.chiffrer()
        fichiers = sorted(p.name for p in (self.projet / "devis").iterdir() if p.name != ".gitkeep")
        self.assertEqual(fichiers, [f"chiffrage-{DATE}.json", f"chiffrage-{DATE}.md"])
        donnees, _ = self.lire()
        self.assertGreater(donnees["lignes"][2]["prix_unitaire_ht"], 1300)

    def test_plancher(self):
        self.remplacer(self.projet / "backlog" / "backlog.yaml", "statut: en_cours", "statut: abandonne")
        texte = (self.projet / "backlog" / "backlog.yaml").read_text(encoding="utf-8")
        for ident in ("FICTIF-004", "FICTIF-005", "FICTIF-006", "FICTIF-007"):
            debut = texte.index(f"id: {ident}")
            texte = texte[:debut] + texte[debut:].replace("statut: a_faire", "statut: abandonne", 1)
        (self.projet / "backlog" / "backlog.yaml").write_text(texte, encoding="utf-8")
        code, _, erreurs = self.chiffrer()
        self.assertEqual(code, 0, erreurs)
        donnees, md = self.lire()
        self.assertGreaterEqual(donnees["total_ht"], 1500)
        self.assertLess(donnees["total_ht"], 1600)
        self.assertIn("**Plancher appliqué**", md)

    def test_typographie_du_devis(self):
        self.remplacer(self.projet / "client.yaml", 'nom: "Bâtiment Fictif"', 'nom: "Bâtiment Fictif (Lyon) — siège"')
        code, _, erreurs = self.chiffrer()
        self.assertEqual(code, 0, erreurs)
        donnees, _ = self.lire()
        self.assertEqual(donnees["objet"], "Application de gestion Bâtiment Fictif Lyon, siège, lots 0, 1 et 2")
        self.assertEqual(methode.nettoyer_typo("Devis (avec PDF) — envoi"), "Devis avec PDF, envoi")

    def test_projet_invalide(self):
        self.remplacer(self.projet / "client.yaml", "statut: en_dev", "statut: inconnu")
        code, _, erreurs = self.chiffrer()
        self.assertEqual(code, 1)
        self.assertIn("chiffrage non produit", erreurs)
        self.assertFalse((self.projet / "devis" / f"chiffrage-{DATE}.json").exists())

    def test_catalogue_invalide(self):
        self.remplacer(self.catalogue / "tarifs.yaml", "taux_horaire_cible: 70", "taux_horaire_cible: 0")
        code, _, erreurs = self.chiffrer()
        self.assertEqual(code, 1)
        self.assertIn("taux_horaire_cible", erreurs)

    def test_rien_a_chiffrer(self):
        texte = (self.projet / "backlog" / "backlog.yaml").read_text(encoding="utf-8")
        for statut in ("fait", "en_cours", "a_faire"):
            texte = texte.replace(f"statut: {statut}", "statut: abandonne")
        (self.projet / "backlog" / "backlog.yaml").write_text(texte, encoding="utf-8")
        code, _, erreurs = self.chiffrer()
        self.assertEqual(code, 1)
        self.assertIn("aucun item à chiffrer", erreurs)

    def test_usage(self):
        self.assertEqual(executer(chiffrer.main, [str(self.projet)])[0], 2)
        self.assertEqual(executer(chiffrer.main, [str(self.tmp / "absent"), "--sortie", str(self.tmp)])[0], 2)

    def test_racine_du_depot_acceptee(self):
        code, _, erreurs = executer(
            chiffrer.main, [str(self.projet.parent), "--sortie", str(self.tmp / "sortie")], aujourdhui=DATE, dossier_catalogue=self.catalogue
        )
        self.assertEqual(code, 0, erreurs)


if __name__ == "__main__":
    unittest.main()
