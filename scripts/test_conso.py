"""Tests du relevé de consommation des agents : templates/depot-client/.skeam/conso.py et scripts/installer_conso.py.

Lancement depuis la racine de skeam-ops :
    python -m unittest discover -s scripts -p "test_*.py"

Les historiques et les dépôts Git sont fabriqués dans des dossiers temporaires ; les historiques
portent un secret planté, des chemins absolus et du texte de conversation, qui ne doivent jamais
ressortir dans le relevé.
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import contrat  # noqa: E402
import installer_conso  # noqa: E402
import validate  # noqa: E402

SCRIPT = contrat.RACINE_OPS / "templates" / "depot-client" / ".skeam" / "conso.py"
_spec = importlib.util.spec_from_file_location("conso_releve", SCRIPT)
conso = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(conso)

SID = "0f0e0d0c-1111-2222-3333-444455556666"
SECRET = "SECRET-PLANTE-sk-ant-123456"
T0 = dt.datetime(2026, 10, 14, 8, 0, tzinfo=dt.timezone.utc)
ENV_GIT = {
    "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_AUTHOR_NAME": "Test", "GIT_AUTHOR_EMAIL": "test@example.invalid",
    "GIT_COMMITTER_NAME": "Test", "GIT_COMMITTER_EMAIL": "test@example.invalid",
}


def t(minutes: float) -> dt.datetime:
    return T0 + dt.timedelta(minutes=minutes)


def horodatage(minutes: float) -> str:
    return t(minutes).strftime("%Y-%m-%dT%H:%M:%S.123Z")


def utilisateur(minutes: float, cwd: str = "/home/secret/projet", texte: str = "Bonjour " + SECRET) -> dict:
    return {"type": "user", "timestamp": horodatage(minutes), "sessionId": SID, "cwd": cwd, "gitBranch": "wip/secret-branche",
            "message": {"role": "user", "content": texte}}


def reponse(minutes: float, ident: str, modele: str = "claude-opus-5-5", entree: int = 10, sortie: int = 100, lecture: int = 0,
            ecriture: int = 0, ecriture_1h: int = 0, web: int = 0, cwd: str = "/home/secret/projet", commande: str | None = None,
            **extra) -> dict:
    contenu = [{"type": "text", "text": "Réponse confidentielle " + SECRET}]
    if commande:
        contenu.append({"type": "tool_use", "id": "toolu_x", "name": "Bash", "input": {"command": commande}})
    ligne = {"type": "assistant", "timestamp": horodatage(minutes), "sessionId": SID, "cwd": cwd, "gitBranch": "wip/secret-branche",
             "message": {"id": ident, "model": modele, "role": "assistant", "content": contenu,
                         "usage": {"input_tokens": entree, "output_tokens": sortie, "cache_read_input_tokens": lecture,
                                   "cache_creation_input_tokens": ecriture,
                                   "cache_creation": {"ephemeral_1h_input_tokens": ecriture_1h, "ephemeral_5m_input_tokens": ecriture - ecriture_1h},
                                   "server_tool_use": {"web_search_requests": web}}}}
    ligne.update(extra)
    return ligne


def ecrire(chemin: Path, lignes: list, brut_final: str = "") -> Path:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text("".join(json.dumps(l, ensure_ascii=False) + "\n" for l in lignes) + brut_final, encoding="utf-8")
    return chemin


class Config:
    """Dossier de configuration Claude Code fictif pour une session."""

    def __init__(self, racine: Path, session: str = SID) -> None:
        self.racine = racine
        self.session = session
        self.projet = racine / "projects" / "-home-secret"
        self.dossier = self.projet / session

    def principal(self, lignes: list, brut_final: str = "") -> Path:
        return ecrire(self.projet / f"{self.session}.jsonl", lignes, brut_final)

    def sous_agent(self, agent: str, lignes: list, description: str | None = None) -> Path:
        chemin = ecrire(self.dossier / "subagents" / f"agent-{agent}.jsonl", lignes)
        if description is not None:
            chemin.with_name(f"agent-{agent}.meta.json").write_text(json.dumps({"agentType": "general-purpose", "description": description}), encoding="utf-8")
        return chemin

    def workflow(self, run: str, agent: str, lignes: list, libelle: str | None, phase: str = "Chantiers", meta: str | None = None) -> Path:
        dossier = self.dossier / "subagents" / "workflows" / run
        chemin = ecrire(dossier / f"agent-{agent}.jsonl", lignes)
        if meta is not None:
            chemin.with_name(f"agent-{agent}.meta.json").write_text(json.dumps({"description": meta, "workflowPhase": phase}), encoding="utf-8")
        if libelle is not None:
            with open(dossier / "journal.jsonl", "a", encoding="utf-8") as journal:
                journal.write(json.dumps({"type": "started", "agentId": agent, "label": libelle, "phase": phase}) + "\n")
        return chemin


def git(depot: Path, *args: str, env: dict | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(depot), *args], capture_output=True, text=True, check=check,
                          env={**os.environ, **ENV_GIT, **(env or {})})


def nouveau_depot(dossier: Path, prefixe: str = "EGM", crochet: bool = False) -> Path:
    dossier.mkdir(parents=True, exist_ok=True)
    git(dossier, "init", "-q", "-b", "main")
    (dossier / "README.md").write_text("dépôt de test\n", encoding="utf-8")
    git(dossier, "add", "README.md")
    git(dossier, "commit", "-q", "-m", f"{prefixe}-001: départ", env={"GIT_AUTHOR_DATE": horodatage(-600), "GIT_COMMITTER_DATE": horodatage(-600)})
    with redirect_stdout(io.StringIO()):
        code, messages = installer_conso.installer(dossier, prefixe, sans_crochet=not crochet, remplacer=False)
    assert code == 0, messages
    return dossier


def commit(depot: Path, sujet: str, auteur: float, committeur: float | None = None, marque: str | None = None, fichier: str = "travail.txt") -> str:
    (depot / fichier).write_text(f"{sujet} {auteur}\n", encoding="utf-8")
    git(depot, "add", fichier)
    message = sujet + (f"\n\nClaude-Session: https://claude.ai/code/{marque}" if marque else "")
    git(depot, "commit", "-q", "--no-verify", "-m", message,
        env={"GIT_AUTHOR_DATE": horodatage(auteur), "GIT_COMMITTER_DATE": horodatage(committeur if committeur is not None else auteur)})
    return git(depot, "rev-parse", "HEAD").stdout.strip()


class BaseTemp(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.config = Config(self.tmp / "claude")
        conso._RACINES.clear()
        conso._COMMUNS.clear()

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def releves(self) -> list:
        return conso.lire_session(conso.trouver_transcripts(self.config.racine, SID))

    def par_agent(self, releves) -> dict:
        return {r.agent_id: r for r in releves}


class TestLecture(BaseTemp):
    def test_doublons_du_streaming(self):
        chemin = self.config.principal([utilisateur(0), reponse(1, "msg_1", sortie=6, lecture=500),
                                        reponse(1.1, "msg_1", sortie=243, lecture=500), reponse(2, "msg_2", sortie=50)])
        releve = conso.lire_transcript(chemin)
        self.assertEqual(len(releve.reponses), 2)
        compteurs = conso.modeles(releve)["claude-opus-5-5"]
        self.assertEqual((compteurs["sortie"], compteurs["lecture_cache"], compteurs["entree"]), (293, 500, 20))

    def test_synthetique_et_erreurs_ecartes(self):
        chemin = self.config.principal([utilisateur(0), reponse(1, "msg_1"), reponse(2, "msg_2", modele="<synthetic>"),
                                        reponse(3, "msg_3", isApiErrorMessage=True)])
        releve = conso.lire_transcript(chemin)
        self.assertEqual(list(releve.reponses), ["msg_1"])
        self.assertEqual(releve.fin, conso.instant(horodatage(3)))

    def test_derniere_ligne_tronquee(self):
        chemin = self.config.principal([utilisateur(0), reponse(1, "msg_1")], brut_final='{"type":"assistant","timestamp":"2026-10-14T08:0')
        self.assertEqual(len(conso.lire_transcript(chemin).reponses), 1)

    def test_sans_reponse_pas_de_ligne(self):
        chemin = self.config.principal([utilisateur(0), utilisateur(1)])
        self.assertIsNone(conso.lire_transcript(chemin))
        self.assertEqual(self.releves(), [])

    def test_cache_une_heure_long_prompt_et_recherche(self):
        chemin = self.config.principal([utilisateur(0), reponse(1, "a", entree=5, lecture=99_000, ecriture=995, ecriture_1h=900, web=2),
                                        reponse(2, "b", entree=5, lecture=99_000, ecriture=1_000, sortie=7)])
        compteurs = conso.modeles(conso.lire_transcript(chemin))["claude-opus-5-5"]
        self.assertEqual((compteurs["ecriture_cache"], compteurs["ecriture_cache_1h"], compteurs["recherches_web"]), (1_995, 900, 2))
        # Seule la réponse b dépasse 100 000 jetons de prompt.
        self.assertEqual(compteurs["au_dela_100k"], {"entree": 5, "sortie": 7, "lecture_cache": 99_000, "ecriture_cache": 1_000})
        court = conso.modeles(conso.lire_transcript(self.config.principal([utilisateur(0), reponse(1, "c")])))["claude-opus-5-5"]
        self.assertNotIn("au_dela_100k", court)


class TestPeriodes(unittest.TestCase):
    def test_regle_des_quinze_minutes(self):
        exact = conso.periodes_actives([t(0), t(15)])
        self.assertEqual(len(exact), 1)
        coupe = conso.periodes_actives([t(0), t(5), t(20) + dt.timedelta(seconds=1)])
        self.assertEqual(coupe, [(t(0), t(5))])
        self.assertEqual(conso.minutes(coupe), 5.0)

    def test_periodes_nulles_et_arrondi(self):
        periodes = conso.periodes_actives([t(0), t(40), t(41) + dt.timedelta(seconds=20)])
        self.assertEqual(periodes, [(t(40), t(41) + dt.timedelta(seconds=20))])
        self.assertEqual(conso.minutes(periodes), 1.3)


class TestLibelles(BaseTemp):
    def test_journal_puis_meta(self):
        self.config.workflow("wf_abc-123", "a1b2c3d4e5f6", [utilisateur(0), reponse(1, "w1")], "terrain:EGM-023 et EGM-024", meta="description meta")
        self.config.workflow("wf_abc-123", "a9b8c7d6e5f4", [utilisateur(0), reponse(1, "w2")], None, phase="Relecture", meta="relecture finale")
        self.config.sous_agent("a0a0a0a0a0a0", [utilisateur(0), reponse(1, "s1")])
        agents = self.par_agent(self.releves())
        self.assertEqual((agents["a1b2c3d4e5f6"].libelle, agents["a1b2c3d4e5f6"].run, agents["a1b2c3d4e5f6"].type),
                         ("terrain:EGM-023 et EGM-024", "wf_abc-123", "workflow"))
        self.assertEqual((agents["a9b8c7d6e5f4"].libelle, agents["a9b8c7d6e5f4"].phase), ("relecture finale", "Relecture"))
        self.assertEqual((agents["a0a0a0a0a0a0"].libelle, agents["a0a0a0a0a0a0"].type), (None, "sous_agent"))
        self.assertEqual(agents["a1b2c3d4e5f6"].ids_libelle(), ["EGM-023", "EGM-024"])
        self.assertEqual(conso.ids_du_texte("facturation:R6"), [])

    def test_libelle_ecrit_liste_blanche(self):
        cas = {
            "terrain:EGM-011": "terrain:EGM-011",
            "facturation:EGM-021 et EGM-022": "facturation:EGM-021 EGM-022",
            "Intégration": "intégration",
            "collecte:docs-app": "collecte",
            "outils-skeam-ops": "outils",
            "relecture adverse de /home/theo/secret.txt par theo@example.com": "relecture",
            "Préparer le lot d'arbitrages pour Théo": None,
            "facturation:A-012 rabais négocié bailleur X": "facturation",
            "facturation:EGM-012 rabais négocié bailleur X et OPS-420": "facturation:EGM-012",
            "EGM-001 et EGM-002": "EGM-001 EGM-002",
            "jeton ghp_abcdefgh12345678": None,
            None: None,
        }
        for texte, attendu in cas.items():
            with self.subTest(texte):
                self.assertEqual(conso.libelle_ecrit(texte, "EGM"), attendu)
                if attendu is not None:
                    self.assertTrue(contrat.RE_LIBELLE_CONSO.match(attendu))
        self.assertEqual((conso.mot_connu("Chantiers"), conso.mot_connu("Phase libre")), ("chantiers", None))
        self.assertLessEqual(len(conso.libelle_ecrit("terrain:" + " ".join(f"EGM-{n:03d}" for n in range(30)), "EGM")), 80)

    def test_liste_du_contrat(self):
        self.assertEqual(sorted(conso.MOTS_LIBELLE.values()), sorted(contrat.MOTS_LIBELLE_CONSO))


class TestLien(BaseTemp):
    """Rattachement des agents aux items, CONTRAT.md section 15.2."""

    def setUp(self) -> None:
        super().setUp()
        self.depot = nouveau_depot(self.tmp / "egm-app")
        cwd = str(self.depot)
        # Conversation principale active de 0 à 120, commite EGM-078 à 100.
        self.config.principal([utilisateur(0, cwd), reponse(1, "p1", cwd=cwd), reponse(99, "p2", cwd=cwd, commande="git commit -m 'EGM-078: x'"),
                               reponse(120, "p3", cwd=cwd)])
        # Deux agents parallèles libellés, l'un commite EGM-023 à 30.
        self.config.workflow("wf_run1", "a11111111111", [utilisateur(10, cwd), reponse(29.9, "w1", cwd=cwd, commande=f"git -C {cwd} commit -m x"),
                                                         reponse(60, "w2", cwd=cwd)], "terrain:EGM-023")
        self.config.workflow("wf_run1", "a22222222222", [utilisateur(10, cwd), reponse(60, "w3", cwd=cwd)], "facturation:EGM-029")
        # Un agent sans id dans son libellé, sans commande git, actif de 70 à 80 : R6.
        self.config.workflow("wf_run1", "a33333333333", [utilisateur(70, cwd), reponse(80, "w4", cwd=cwd)], "facturation:R6")
        # Un relecteur sans id ni commit, hors de tout workflow.
        self.config.sous_agent("a44444444444", [utilisateur(85, cwd), reponse(95, "s1", cwd=cwd)], "relecture adverse")
        # Un relecteur du run, sans id, actif après les commits.
        self.config.workflow("wf_run1", "a55555555555", [utilisateur(121, cwd), reponse(125, "w5", cwd=cwd)], "relecture")
        self.marque = "session_01AbCdEfGh"
        self.c023 = commit(self.depot, "EGM-023: bon d'intervention", 30, marque=self.marque)
        self.c059 = commit(self.depot, "EGM-059: relecture R6", 75, committeur=110, marque=self.marque)
        self.c078 = commit(self.depot, "EGM-078: intégration", 100, marque=self.marque)
        commit(self.depot, "EGM-099: autre session parallèle", 76, marque="session_99ZzYyXxWw")

    def lies(self, marque=None):
        releves = self.releves()
        debut, fin = min(r.debut for r in releves), max(r.fin for r in releves)
        commits = conso.lire_commits([self.depot], debut, fin, marque or self.marque)
        conso.lier(releves, commits)
        return {r.agent_id: r for r in releves}

    def test_libelle_commits_et_session(self):
        agents = self.lies()
        self.assertEqual((agents["a11111111111"].lien, agents["a11111111111"].items), ("libelle", [{"id": "EGM-023", "part": 1.0}]))
        self.assertEqual(agents["a22222222222"].items, [{"id": "EGM-029", "part": 1.0}])
        # R6 : le commit fait pendant son activité, daté à l'auteur malgré le rebase, lui revient.
        self.assertEqual((agents["a33333333333"].lien, agents["a33333333333"].items, agents["a33333333333"].commits),
                         ("commits", [{"id": "EGM-059", "part": 1.0}], [self.c059[:7]]))
        # La conversation principale a lancé git commit juste avant EGM-078.
        self.assertEqual((agents[None].lien, agents[None].items), ("commits", [{"id": "EGM-078", "part": 1.0}]))
        # Le relecteur du run prend la répartition des agents rattachés de son run, au prorata des minutes,
        # jamais celle de la conversation principale.
        relecteur = agents["a55555555555"]
        self.assertEqual(relecteur.lien, "session")
        self.assertEqual({i["id"] for i in relecteur.items}, {"EGM-023", "EGM-029", "EGM-059"})
        self.assertAlmostEqual(sum(i["part"] for i in relecteur.items), 1.0, places=6)
        # Hors de tout workflow : aucun item, plutôt qu'une répartition de toute la session.
        self.assertEqual((agents["a44444444444"].lien, agents["a44444444444"].items), ("aucun", []))

    def test_run_de_plusieurs_projets_sans_repartition(self):
        cwd = str(self.depot)
        self.config.workflow("wf_run1", "a66666666666", [utilisateur(10, cwd), reponse(20, "w6", cwd=cwd)], "outils:OPS-420")
        agents = self.lies()
        self.assertEqual((agents["a55555555555"].lien, agents["a55555555555"].items), ("aucun", []))

    def test_commits_ponderes_par_le_temps(self):
        principal = conso.Releve(None, "principal")
        principal.horodatages = [t(m) for m in range(0, 121, 5)]
        a, b = conso.Commit("a" * 40, t(10), "EGM-001"), conso.Commit("b" * 40, t(100), "EGM-002")
        poids = conso.poids_des_commits(principal, [(a, 1.0), (b, 1.0)])
        # 10 minutes avant le premier commit, 90 entre les deux et 20 après le dernier.
        self.assertEqual({k: round(v, 1) for k, v in poids.items()}, {"EGM-001": 10.0, "EGM-002": 110.0})
        self.assertEqual(conso.parts(poids), [{"id": "EGM-001", "part": 0.0833}, {"id": "EGM-002", "part": 0.9167}])

    def test_marque_de_session(self):
        commits = conso.lire_commits([self.depot], t(0), t(120), self.marque)
        self.assertNotIn("EGM-099", {c.item for c in commits})
        tous = conso.lire_commits([self.depot], t(0), t(120), None)
        self.assertIn("EGM-099", {c.item for c in tous})

    def test_copie_reecrite_comptee_une_fois(self):
        git(self.depot, "checkout", "-q", "-b", "copie", "HEAD~3")
        git(self.depot, "cherry-pick", "--allow-empty", "--keep-redundant-commits", self.c059, env={"GIT_COMMITTER_DATE": horodatage(115)})
        commits = conso.lire_commits([self.depot], t(0), t(120), self.marque)
        self.assertEqual([c.item for c in commits].count("EGM-059"), 1)

    def test_commit_sans_auteur_ni_agent_actif(self):
        commit(self.depot, "EGM-080: commit sans commande", 115, marque=self.marque)
        agents = self.lies()
        self.assertEqual({i["id"] for i in agents[None].items}, {"EGM-078", "EGM-080"})

    def test_aucun(self):
        seul = [r for r in self.releves() if r.agent_id == "a44444444444"]
        conso.lier(seul, [])
        self.assertEqual((seul[0].lien, seul[0].items), ("aucun", []))

    def test_parts(self):
        self.assertEqual(conso.parts({"A-001": 1, "B-002": 1, "C-003": 1}), [{"id": "A-001", "part": 0.3333}, {"id": "B-002", "part": 0.3333}, {"id": "C-003", "part": 0.3334}])
        self.assertEqual(conso.parts({}), [])


class TestFiltreDepot(BaseTemp):
    def releve(self, items, cwd):
        r = conso.Releve("a12345678901", "workflow")
        r.items = items
        r.cwds[cwd] += 1
        return r

    def test_filtre(self):
        depot = nouveau_depot(self.tmp / "egm-app")
        autre = nouveau_depot(self.tmp / "autre", prefixe="ZED")
        commun = conso.repertoire_commun(depot)
        egm = self.releve([{"id": "EGM-001", "part": 1.0}], str(depot))
        beta = self.releve([{"id": "BETA-001", "part": 1.0}], str(depot))
        mixte = self.releve([{"id": "EGM-001", "part": 0.5}, {"id": "OPS-002", "part": 0.5}], "/nulle/part")
        hors = self.releve([], "/nulle/part")
        ailleurs = self.releve([], str(autre))
        ici = self.releve([], str(depot))
        gardes = conso.garder_pour_ce_depot([egm, beta, mixte, hors, ailleurs, ici], "EGM", commun)
        self.assertEqual([id(r) for r in gardes], [id(egm), id(mixte), id(hors), id(ici)])


class TestFusion(unittest.TestCase):
    MAINTENANT = dt.datetime(2026, 10, 14, 20, 0, tzinfo=dt.timezone.utc)

    def ligne(self, agent, messages, debut="2026-10-14T10:00:00+02:00", releve_le="2026-10-14T12:00:00+02:00"):
        return {"session": SID, "agent_id": agent, "debut": debut, "messages": messages, "releve_le": releve_le}

    def test_releve_le_garde_si_rien_ne_change(self):
        ancienne = [self.ligne(None, 3)]
        resultat = conso.fusionner(ancienne, [self.ligne(None, 3, releve_le="x")], self.MAINTENANT)
        self.assertEqual(resultat[0]["releve_le"], "2026-10-14T12:00:00+02:00")
        resultat = conso.fusionner(ancienne, [self.ligne(None, 4, releve_le="x")], self.MAINTENANT)
        self.assertEqual(resultat[0]["releve_le"], "2026-10-14T22:00:00+02:00")

    def test_ligne_non_recalculable_gardee_et_jamais_appauvrie(self):
        anciennes = [self.ligne("aaaaaaaaaaaa", 9), self.ligne(None, 5)]
        resultat = conso.fusionner(anciennes, [self.ligne(None, 2)], self.MAINTENANT)
        self.assertEqual({(l["agent_id"], l["messages"]) for l in resultat}, {("aaaaaaaaaaaa", 9), (None, 5)})

    def test_doublons_union(self):
        anciennes = [self.ligne(None, 5, releve_le="2026-10-14T11:00:00+02:00"), self.ligne(None, 7, releve_le="2026-10-14T10:00:00+02:00")]
        resultat = conso.fusionner(anciennes, [], self.MAINTENANT)
        self.assertEqual([l["messages"] for l in resultat], [7])


class TestCapture(BaseTemp):
    """Bout en bout sans crochet : relevé, fichier, confidentialité et idempotence."""

    def preparer(self):
        self.depot = nouveau_depot(self.tmp / "egm-app")
        cwd = str(self.depot)
        self.config.principal([utilisateur(0, "/home/secret/projet"), reponse(1, "p1", cwd="/home/secret/projet"),
                               reponse(30, "p2", cwd=cwd)])
        self.config.workflow("wf_r", "a1b2c3d4e5f6", [utilisateur(5, cwd), reponse(9, "w1", cwd=cwd, lecture=200_000)],
                             "terrain:EGM-011 /home/secret/chemin sk-ant-api03-AbCdEf123456 theo@example.com")
        self.config.workflow("wf_r", "abcdefabcdef", [utilisateur(5, cwd), reponse(9, "w2", cwd=cwd)], "client:BETA-002")
        self.config.workflow("wf_r", "a7a7a7a7a7a7", [utilisateur(5, cwd), reponse(9, "w3", cwd=cwd)], "facturation:EGM-012 rabais bailleur X et BETA-004",
                             phase="Chantiers secrets")
        self.config.sous_agent("a0a0a0a0a0a0", [utilisateur(6, cwd), reponse(7, "s1", cwd=cwd, modele="claude-haiku-5-5", web=1)], "chercheur")

    def capturer(self):
        return conso.capturer(SID, "session_01AbCdEfGh", self.config.racine, self.depot)

    def test_fichier_valide_et_confidentiel(self):
        self.preparer()
        resultat = self.capturer()
        self.assertTrue(resultat.ecrit)
        self.assertEqual(resultat.fichier.name, f"2026-10-14-{SID}.jsonl")
        texte = resultat.fichier.read_text(encoding="utf-8")
        for interdit in (SECRET, "sk-ant", "theo@", "/home", "secret/projet", "Bonjour", "confidentielle", "wip/secret-branche", "cwd", "test@example"):
            self.assertNotIn(interdit, texte)
        lignes = [json.loads(l) for l in texte.splitlines()]
        self.assertEqual([l["agent_id"] for l in lignes], [None, "a1b2c3d4e5f6", "a7a7a7a7a7a7", "a0a0a0a0a0a0"])
        # Libellé et phase réduits à la liste blanche ; items, commits et ids d'un autre projet retirés.
        mixte = lignes[2]
        self.assertEqual((mixte["libelle"], mixte["phase"], mixte["items"]), ("facturation:EGM-012", "chantiers", [{"id": "EGM-012", "part": 0.5}]))
        self.assertEqual((lignes[1]["libelle"], lignes[3]["libelle"]), ("terrain:EGM-011", None))
        for interdit in ("BETA", "rabais", "bailleur", "secrets"):
            self.assertNotIn(interdit, texte)
        self.assertEqual(list(lignes[0]), list(conso.ORDRE_CLES))
        # Une ligne liée seulement à un autre projet n'est pas écrite ici ; une ligne mixte cite les ids des deux.
        self.assertNotIn('"abcdefabcdef"', texte)
        rapport = validate.Rapport()
        self.assertEqual(validate.valider_conso(self.depot, rapport), 1)
        self.assertEqual(rapport.messages, [])

    def test_deux_releves_de_suite_identiques(self):
        self.preparer()
        premier = self.capturer().fichier.read_bytes()
        second = self.capturer()
        self.assertFalse(second.ecrit)
        self.assertEqual(second.fichier.read_bytes(), premier)

    def test_historique_disparu_ligne_conservee(self):
        self.preparer()
        fichier = self.capturer().fichier
        shutil.rmtree(self.config.dossier / "subagents" / "workflows")
        self.capturer()
        self.assertIn('"a1b2c3d4e5f6"', fichier.read_text(encoding="utf-8"))

    def test_sans_configuration_rien(self):
        self.preparer()
        (self.depot / ".skeam" / "conso.json").unlink()
        self.assertIsNone(self.capturer().fichier)
        # Rattrapage par le bilan sur une branche sans .skeam : le préfixe est donné.
        resultat = conso.capturer(SID, None, self.config.racine, self.depot, prefixe="EGM")
        self.assertTrue(resultat.ecrit)
        self.assertIsNone(conso.capturer(SID, None, self.config.racine, self.depot, prefixe="egm").fichier)


class TestCommitEnCours(BaseTemp):
    """Le commit que le crochet pre-commit est en train de créer n'est pas encore dans git log."""

    def setUp(self) -> None:
        super().setUp()
        self.depot = nouveau_depot(self.tmp / "egm-app")
        self.cwd = str(self.depot)

    def capturer(self, en_cours):
        return conso.capturer(SID, None, self.config.racine, self.depot, en_cours=en_cours)

    def test_un_seul_commit_rattache(self):
        self.config.principal([utilisateur(0, self.cwd), reponse(1, "p1", cwd=self.cwd),
                               reponse(30, "p2", cwd=self.cwd, commande=f"git -C {self.cwd} commit -q -F - <<'EOF'\nEGM-031: fiche\n\nCorps EGM-099: rien\nEOF")])
        ligne = next(l for l in conso.lire_lignes(self.capturer(t(30.2)).fichier) if l["agent_id"] is None)
        self.assertEqual((ligne["lien"], ligne["items"], ligne["commits"]), ("commits", [{"id": "EGM-031", "part": 1.0}], []))

    def test_commande_ancienne_ou_absente_ignoree(self):
        self.config.principal([utilisateur(0, self.cwd), reponse(1, "p1", cwd=self.cwd, commande='git commit -m "EGM-031: x"'),
                               reponse(30, "p2", cwd=self.cwd)])
        ligne = next(l for l in conso.lire_lignes(self.capturer(t(30)).fichier) if l["agent_id"] is None)
        self.assertEqual(ligne["lien"], "aucun")

    def test_commits_enchaines_et_dernier_commit_suivant(self):
        commande = 'git commit -m "EGM-031: a" && git commit -m "EGM-032: b"'
        self.config.principal([utilisateur(0, self.cwd), reponse(1, "p1", cwd=self.cwd), reponse(30, "p2", cwd=self.cwd, commande=commande)])
        empreinte = commit(self.depot, "EGM-031: a", 30.1)
        ligne = next(l for l in conso.lire_lignes(self.capturer(t(30.2)).fichier) if l["agent_id"] is None)
        self.assertEqual(({i["id"] for i in ligne["items"]}, ligne["commits"]), ({"EGM-031", "EGM-032"}, [empreinte[:7]]))
        # Les deux commits faits, plus rien n'est en cours.
        commit(self.depot, "EGM-032: b", 30.2)
        releves = self.releves()
        commits = conso.lire_commits([self.depot], t(0), t(31), None)
        self.assertIsNone(conso.commit_en_cours(releves, commits, t(30.3)))

    def test_lecture_des_commandes(self):
        cas = {
            'git commit -m "EGM-031: x"': ["EGM-031"],
            "git add . && git commit -m \"$(cat <<'EOF'\nEGM-032: y\nEOF\n)\"": ["EGM-032"],
            "git commit --amend --no-edit": [None],
            "git merge x && git commit -m 'OPS-420: a'": [None, "OPS-420"],
            "echo EGM-001: x": [],
        }
        for commande, attendu in cas.items():
            with self.subTest(commande):
                self.assertEqual(conso.items_des_commandes(commande), attendu)


class TestCrochet(BaseTemp):
    """Le crochet Git ajoute le relevé au commit et ne fait jamais échouer un commit."""

    def setUp(self) -> None:
        super().setUp()
        self.depot = nouveau_depot(self.tmp / "egm-app", crochet=True)
        git(self.depot, "add", "-A")
        git(self.depot, "commit", "-q", "--no-verify", "-m", "EGM-002: installation du relevé")
        self.config.principal([utilisateur(0), reponse(1, "p1"), reponse(2, "p2")])
        self.env = {"CLAUDE_CODE_SESSION_ID": SID, "CLAUDE_CONFIG_DIR": str(self.config.racine), "CLAUDE_CODE_REMOTE_SESSION_ID": ""}
        self.fichier = f".skeam/conso/2026-10-14-{SID}.jsonl"

    def commiter(self, *args, env=None, fichier="a.txt"):
        (self.depot / fichier).write_text(str(len(git(self.depot, "log", "--oneline").stdout)), encoding="utf-8")
        if "-a" not in args:
            git(self.depot, "add", fichier)
        return git(self.depot, "commit", "-q", "-m", "EGM-003: travail", *args, env=env, check=False)

    def fichiers_du_dernier_commit(self):
        return set(git(self.depot, "show", "--name-only", "--format=", "HEAD").stdout.split())

    def test_installe(self):
        self.assertEqual(git(self.depot, "config", "--get", "core.hooksPath").stdout.strip(), ".skeam/githooks")

    def test_commit_dans_une_session(self):
        self.assertEqual(self.commiter(env=self.env).returncode, 0)
        self.assertIn(self.fichier, self.fichiers_du_dernier_commit())
        self.assertEqual(git(self.depot, "status", "--porcelain").stdout.strip(), "")

    def test_commit_hors_session(self):
        self.assertEqual(self.commiter(env={"CLAUDE_CODE_SESSION_ID": ""}).returncode, 0)
        self.assertEqual(self.fichiers_du_dernier_commit(), {"a.txt"})

    def test_historique_casse_commit_reussi(self):
        (self.config.projet / f"{SID}.jsonl").write_bytes(b"\xff\xfe pas du json\n")
        self.assertEqual(self.commiter(env=self.env).returncode, 0)
        self.assertEqual(self.fichiers_du_dernier_commit(), {"a.txt"})

    def test_config_illisible_commit_reussi(self):
        env = dict(self.env, CLAUDE_CONFIG_DIR=str(self.tmp / "absent"))
        self.assertEqual(self.commiter(env=env).returncode, 0)

    def test_commit_a_et_commit_chemin(self):
        (self.depot / "a.txt").write_text("x", encoding="utf-8")
        git(self.depot, "add", "a.txt")
        git(self.depot, "commit", "-q", "--no-verify", "-m", "EGM-003: base")
        (self.depot / "a.txt").write_text("y", encoding="utf-8")
        self.assertEqual(git(self.depot, "commit", "-q", "-a", "-m", "EGM-003: tout", env=self.env, check=False).returncode, 0)
        self.assertIn(self.fichier, self.fichiers_du_dernier_commit())
        self.config.principal([utilisateur(0), reponse(1, "p1"), reponse(2, "p2"), reponse(3, "p3")])
        (self.depot / "a.txt").write_text("z", encoding="utf-8")
        self.assertEqual(git(self.depot, "commit", "-q", "-m", "EGM-003: chemin", "a.txt", env=self.env, check=False).returncode, 0)
        self.assertEqual(self.fichiers_du_dernier_commit(), {"a.txt", self.fichier})

    def test_commit_en_cours_rattache_par_le_crochet(self):
        # Historique daté de maintenant : le commit lancé il y a une minute est celui que crée le crochet.
        git(self.depot, "commit", "-q", "--amend", "--no-edit", "--no-verify", "--date", horodatage(-600))
        maintenant = dt.datetime.now(dt.timezone.utc)
        heure = lambda minutes: (maintenant + dt.timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        principal = [utilisateur(0), reponse(1, "p1"), reponse(2, "p2", commande='git commit -q -m "EGM-003: travail"')]
        for ligne, minutes in zip(principal, (-3, -2, -1)):
            ligne["timestamp"] = heure(minutes)
        chemin = self.config.principal(principal)
        self.assertEqual(self.commiter(env=self.env).returncode, 0)
        fichier = next(f for f in self.fichiers_du_dernier_commit() if f.startswith(".skeam/conso/2"))
        ligne = json.loads(git(self.depot, "show", f"HEAD:{fichier}").stdout.splitlines()[0])
        self.assertEqual((ligne["lien"], ligne["items"]), ("commits", [{"id": "EGM-003", "part": 1.0}]))
        self.assertTrue(chemin.exists())

    def test_cherry_pick_sans_releve(self):
        git(self.depot, "checkout", "-q", "-b", "autre")
        (self.depot / "b.txt").write_text("b", encoding="utf-8")
        git(self.depot, "add", "b.txt")
        git(self.depot, "commit", "-q", "--no-verify", "-m", "EGM-004: b")
        git(self.depot, "checkout", "-q", "main")
        git(self.depot, "cherry-pick", "autre", env=self.env)
        self.assertEqual(self.fichiers_du_dernier_commit(), {"b.txt"})

    def test_installer_idempotent_et_respectueux(self):
        script = self.depot / ".skeam" / "conso.py"
        for _ in range(2):
            subprocess.run([sys.executable, str(script), "installer"], capture_output=True, check=True, env={**os.environ, **ENV_GIT})
        self.assertEqual(git(self.depot, "config", "--get", "core.hooksPath").stdout.strip(), ".skeam/githooks")
        git(self.depot, "config", "core.hooksPath", ".husky")
        sortie = subprocess.run([sys.executable, str(script), "installer"], capture_output=True, text=True, check=True, env={**os.environ, **ENV_GIT})
        self.assertIn(".husky", sortie.stdout)
        self.assertEqual(git(self.depot, "config", "--get", "core.hooksPath").stdout.strip(), ".husky")


class TestEnvironnementCloud(BaseTemp):
    """templates/environnement/setup-cloud.sh active le relevé quand la session s'ouvre hors des dépôts."""

    SETUP = contrat.RACINE_OPS / "templates" / "environnement" / "setup-cloud.sh"

    def lancer(self, *commande, **env):
        return subprocess.run(list(commande), capture_output=True, text=True, timeout=60,
                              env={**os.environ, **ENV_GIT, "HOME": str(self.tmp / "home"), **env})

    def test_activation_par_l_environnement(self):
        racine = self.tmp / "racine"
        depot = nouveau_depot(racine / "egm-app")
        modele = racine / "skeam-ops" / "templates" / "depot-client" / ".skeam"
        modele.mkdir(parents=True)
        shutil.copy(SCRIPT, modele / "conso.py")
        git(racine / "skeam-ops", "init", "-q")
        env = {"SKEAM_BIN": str(self.tmp / "bin"), "SKEAM_RACINES": str(racine)}
        for _ in range(2):
            sortie = self.lancer("sh", str(self.SETUP), **env)
            self.assertEqual((sortie.returncode, sortie.stdout, sortie.stderr), (0, "", ""))
        self.assertEqual(git(depot, "config", "--get", "core.hooksPath").stdout.strip(), ".skeam/githooks")
        # Le gabarit rangé ailleurs que dans <dépôt>/.skeam n'active rien.
        self.assertEqual(git(racine / "skeam-ops", "config", "--get", "core.hooksPath", check=False).stdout.strip(), "")
        reglages = json.loads((self.tmp / "home" / ".claude" / "settings.json").read_text(encoding="utf-8"))
        self.assertEqual({k: len(v) for k, v in reglages["hooks"].items()}, {"SessionStart": 1, "UserPromptSubmit": 1})
        # Un dépôt cloné en cours de session, session ouverte au-dessus des dépôts : activé par le crochet utilisateur.
        nouveau = nouveau_depot(racine / "autre-app", prefixe="ZED")
        commande = reglages["hooks"]["UserPromptSubmit"][0]["hooks"][0]["command"]
        sortie = self.lancer("sh", "-c", commande, CLAUDE_PROJECT_DIR=str(racine))
        self.assertEqual((sortie.returncode, sortie.stdout), (0, ""))
        self.assertEqual(git(nouveau, "config", "--get", "core.hooksPath").stdout.strip(), ".skeam/githooks")
        # Sans le programme d'activation, conteneur neuf sans script d'installation : la commande ne fait rien et sort en 0.
        shutil.rmtree(self.tmp / "bin")
        self.assertEqual(self.lancer("sh", "-c", commande).returncode, 0)

    def test_reglages_existants_gardes(self):
        (self.tmp / "home" / ".claude").mkdir(parents=True)
        existant = {"permissions": {"allow": ["Bash(ls)"]}, "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "x"}]}]}}
        (self.tmp / "home" / ".claude" / "settings.json").write_text(json.dumps(existant), encoding="utf-8")
        self.lancer("sh", str(self.SETUP), SKEAM_BIN=str(self.tmp / "bin"), SKEAM_RACINES=str(self.tmp / "vide"))
        reglages = json.loads((self.tmp / "home" / ".claude" / "settings.json").read_text(encoding="utf-8"))
        self.assertEqual((reglages["permissions"], reglages["hooks"]["Stop"]), (existant["permissions"], existant["hooks"]["Stop"]))
        self.assertIn("SessionStart", reglages["hooks"])


class TestFusionGit(BaseTemp):
    def test_union_sans_conflit(self):
        depot = nouveau_depot(self.tmp / "egm-app")
        fichier = depot / ".skeam" / "conso" / f"2026-10-14-{SID}.jsonl"
        fichier.write_text('{"a":1}\n', encoding="utf-8")
        git(depot, "add", "-A")
        git(depot, "commit", "-q", "-m", "EGM-002: base")
        git(depot, "checkout", "-q", "-b", "branche")
        fichier.write_text('{"a":1}\n{"b":2}\n', encoding="utf-8")
        git(depot, "commit", "-q", "-am", "EGM-002: branche")
        git(depot, "checkout", "-q", "main")
        fichier.write_text('{"a":3}\n', encoding="utf-8")
        git(depot, "commit", "-q", "-am", "EGM-002: main")
        fusion = git(depot, "merge", "-q", "--no-edit", "branche", check=False)
        self.assertEqual(fusion.returncode, 0, fusion.stdout + fusion.stderr)
        lignes = set(fichier.read_text(encoding="utf-8").splitlines())
        self.assertTrue({'{"a":3}', '{"b":2}'} <= lignes, lignes)


class TestInstallateur(BaseTemp):
    def silencieux(self, *args):
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            return installer_conso.main([str(a) for a in args])

    def test_installation(self):
        depot = self.tmp / "depot"
        depot.mkdir()
        git(depot, "init", "-q")
        (depot / ".claude").mkdir()
        (depot / ".claude" / "settings.json").write_text(json.dumps({"permissions": {"allow": ["Bash(ls)"]}, "hooks": {"Stop": []}}), encoding="utf-8")
        (depot / ".gitattributes").write_text("*.png binary", encoding="utf-8")
        (depot / "projet").mkdir()
        self.assertEqual(self.silencieux(depot, "--prefixe", "EGM", "--sans-crochet"), 0)
        self.assertEqual(self.silencieux(depot, "--prefixe", "EGM", "--sans-crochet"), 0)
        reglages = json.loads((depot / ".claude" / "settings.json").read_text(encoding="utf-8"))
        self.assertEqual(reglages["permissions"], {"allow": ["Bash(ls)"]})
        self.assertEqual(len(reglages["hooks"]["SessionStart"]), 1)
        self.assertIn("Stop", reglages["hooks"])
        self.assertEqual((depot / ".gitattributes").read_text(encoding="utf-8").count("merge=union"), 1)
        self.assertEqual(json.loads((depot / ".skeam" / "conso.json").read_text(encoding="utf-8")), {"version": 1, "prefixe": "EGM"})
        self.assertTrue(os.access(depot / ".skeam" / "githooks" / "pre-commit", os.X_OK))
        self.assertEqual(list((depot / "projet").iterdir()), [])
        self.assertEqual(git(depot, "config", "--get", "core.hooksPath", check=False).stdout.strip(), "")

    def test_refus_et_remplacement(self):
        depot = self.tmp / "depot"
        depot.mkdir()
        git(depot, "init", "-q")
        (depot / ".skeam").mkdir()
        (depot / ".skeam" / "conso.py").write_text("# autre version\n", encoding="utf-8")
        self.assertEqual(self.silencieux(depot, "--prefixe", "EGM", "--sans-crochet"), 1)
        self.assertFalse((depot / ".skeam" / "conso.json").exists())
        self.assertEqual(self.silencieux(depot, "--prefixe", "EGM", "--sans-crochet", "--remplacer"), 0)
        self.assertEqual((depot / ".skeam" / "conso.py").read_bytes(), SCRIPT.read_bytes())
        self.assertEqual(self.silencieux(depot, "--prefixe", "OPS", "--sans-crochet"), 1)
        self.assertEqual(self.silencieux(depot, "--prefixe", "egm"), 2)


class TestValidationConso(unittest.TestCase):
    EXEMPLE = {
        "version": 1, "session": SID, "session_distante": None, "agent_id": None, "type": "principal", "run": None, "phase": None,
        "libelle": None, "debut": "2026-10-14T10:00:00+02:00", "fin": "2026-10-14T11:00:00+02:00",
        "periodes": [["2026-10-14T10:00:00+02:00", "2026-10-14T11:00:00+02:00"]], "minutes_actives": 60.0, "messages": 3,
        "modeles": {"claude-opus-5-5": {"entree": 1, "sortie": 2, "lecture_cache": 3, "ecriture_cache": 4, "ecriture_cache_1h": 4, "recherches_web": 0}},
        "items": [{"id": "EGM-001", "part": 0.5}, {"id": "EGM-002", "part": 0.5}], "lien": "commits", "commits": ["abcdef1"],
        "releve_le": "2026-10-14T12:00:00+02:00",
    }

    def erreurs(self, **changements) -> list[str]:
        ligne = json.loads(json.dumps(self.EXEMPLE)) | changements
        rapport = validate.Rapport()
        validate.verifier_ligne_conso(rapport, "x", 1, ligne, SID)
        return [m for niveau, _, m in rapport.messages if niveau == "ERREUR"]

    def test_valide(self):
        self.assertEqual(self.erreurs(), [])
        # Les parts des items d'autres projets, écrits dans leurs dépôts, manquent à la somme.
        self.assertEqual(self.erreurs(items=[{"id": "EGM-001", "part": 0.25}], libelle="terrain:EGM-001", phase="chantiers"), [])

    def test_controles(self):
        cas = {
            "session": dict(session="autre-session-1234"),
            "fin antérieure": dict(fin="2026-10-14T09:00:00+02:00", periodes=[]),
            "periodes[0]": dict(periodes=[["2026-10-14T09:00:00+02:00", "2026-10-14T10:30:00+02:00"]]),
            "ecriture_cache_1h": dict(modeles={"claude-opus-5-5": {"entree": 1, "sortie": 2, "lecture_cache": 3, "ecriture_cache": 4, "ecriture_cache_1h": 5, "recherches_web": 0}}),
            "somme": dict(items=[{"id": "EGM-001", "part": 0.7}, {"id": "EGM-002", "part": 0.7}]),
            "plusieurs préfixes": dict(items=[{"id": "EGM-001", "part": 0.5}, {"id": "OPS-002", "part": 0.5}]),
            "libelle": dict(libelle="Préparer le lot pour Théo"),
            "phase": dict(phase="Chantiers"),
            "lien vaut aucun": dict(lien="aucun"),
            "champ non prévu": dict(cout_usd=3.2),
            "format": dict(debut="2026-10-14 10:00"),
        }
        for fragment, changements in cas.items():
            with self.subTest(fragment):
                self.assertTrue(any(fragment in m for m in self.erreurs(**changements)), self.erreurs(**changements))

    def test_fichier_nom_et_doublon(self):
        with tempfile.TemporaryDirectory() as tmp:
            dossier = Path(tmp) / ".skeam" / "conso"
            dossier.mkdir(parents=True)
            ligne = json.dumps(self.EXEMPLE, separators=(",", ":"))
            (dossier / f"2026-10-14-{SID}.jsonl").write_text(ligne + "\n" + ligne + "\n", encoding="utf-8")
            (dossier / "mauvais-nom.jsonl").write_text(ligne + "\n", encoding="utf-8")
            (dossier / f"2026-10-15-{SID}.jsonl").write_text(ligne + "\n", encoding="utf-8")
            rapport = validate.Rapport()
            self.assertEqual(validate.valider_conso(Path(tmp), rapport), 3)
            messages = [(n, m) for n, _, m in rapport.messages]
            self.assertIn(("ERREUR", "nom de fichier non conforme, attendu AAAA-MM-JJ-<session>.jsonl"), messages)
            self.assertTrue(any(n == "AVERTISSEMENT" and "clé en double" in m for n, m in messages))
            self.assertTrue(any(n == "AVERTISSEMENT" and "date du nom 2026-10-15" in m for n, m in messages))

    def test_tarifs(self):
        donnees = contrat.charger_yaml(contrat.RACINE_OPS / "dashboard" / "tarifs-modeles.yaml")
        rapport = validate.Rapport()
        self.assertTrue(validate.verifier_tarifs_modeles(rapport, "t", donnees))
        self.assertEqual(rapport.messages, [])
        donnees["tarifs"].append(dict(donnees["tarifs"][0]))
        donnees["tarifs"][1] = dict(donnees["tarifs"][1], a_confirmer=["inconnu"])
        validate.verifier_tarifs_modeles(rapport, "t", donnees)
        rapport2 = validate.Rapport()
        donnees["tarifs"][1]["a_confirmer"] = []
        validate.verifier_tarifs_modeles(rapport2, "t", donnees)
        self.assertTrue(any("inconnu" in m for _, _, m in rapport.messages))
        self.assertTrue(any("en double" in m for _, _, m in rapport2.messages))


if __name__ == "__main__":
    unittest.main()
