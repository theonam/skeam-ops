# Scénario de test : /nouveau-client

## Objet

Vérifier que la commande crée le dossier projet d'un client fictif dans un dépôt vide, remplit `client.yaml` et `fiche.md` sans invention, crée la section Todoist après validation, et n'écrit rien dans le registre réel quand Théo refuse.

## Prérequis

- Dépôt privé vide `theonam/skeam-test-fictif` attaché à la conversation, sans dossier `projet/`. S'il en contient un, le supprimer d'abord.
- Aucune section `Client · Atelier Fictif` dans le projet Todoist SKEAM.
- SIREN de SKEAM connu de Théo, pour le test du registre public.

## Déroulé

| # | Théo | Résultat attendu |
|---|---|---|
| 1 | `/nouveau-client Atelier Fictif, menuiserie à Nantes, contact Léa Fictive gérante lea.fictive@atelier-fictif.example, apporté par moi, premier contact aujourd'hui, besoin : suivre les commandes en atelier. Dépôt theonam/skeam-test-fictif. SIREN 000000000` | La commande lit `skills/commun.md`, propose le slug `fictif` ou un équivalent valide, retient le dépôt donné. |
| 2 | | Recherche registre avec `000000000` : aucun résultat. La commande le dit, laisse `raison_sociale`, `siren`, `adresse` à `null` et continue. |
| 3 | Donner ensuite le SIREN de SKEAM à la place, en précisant que c'est pour le test | Un résultat unique présenté avec sa source et sa date de consultation. Théo choisit de **ne pas** le retenir : rien du registre n'est écrit. |
| 4 | | `nouveau_dossier.py` lancé avec `fictif "Atelier Fictif" ../skeam-test-fictif --depot theonam/skeam-test-fictif`, code 0. |
| 5 | | `client.yaml` : `statut: prospect`, `apporteur: theo`, `dates.premier_contact` du jour, un contact complet avec `tel: null` et `role: Gérante`. Aucune autre valeur inventée. |
| 6 | | `fiche.md` : Entreprise mentionne menuiserie et Nantes, Interlocuteurs liste Léa Fictive, Besoin exprimé reprend le suivi des commandes, Historique porte la ligne du premier contact. Aucun effectif ni chiffre inventé. |
| 7 | | `CLAUDE.md` racine créé avec `@projet/CLAUDE-projet.md`. |
| 8 | | Une validation unique en trois questions : section Todoist, commit du dépôt, ajout au registre. Le récapitulatif montre le contenu exact. |
| 9 | Section : `Valider` ; commit : `Valider` ; registre : `Annuler` | Section `Client · Atelier Fictif` créée dans le projet `6h6qfvrgr83M56Gq`. `todoist.projet_id` et `todoist.section_id` écrits entre guillemets. Commit `projet: nouveau-client fictif` poussé. `clients.yaml` inchangé. |
| 10 | Relancer `/nouveau-client Atelier Fictif` avec le même dépôt | Mode reprise : `nouveau_dossier.py` non relancé ou refusé avec `existe déjà`, section Todoist réutilisée sans doublon, aucun commit vide. La commande propose seulement l'ajout au registre, que Théo annule. |

## Contrôles

```sh
cd "$RACINE/skeam-ops"
python3 scripts/validate.py ../skeam-test-fictif/projet
git diff --exit-code clients.yaml
grep -n "section_id" ../skeam-test-fictif/projet/client.yaml
```

Dans Todoist : une seule section `Client · Atelier Fictif`.

## Cas d'erreur à provoquer

| Action | Attendu |
|---|---|
| Demander le slug `atelier-fictif` | Refusé, tiret interdit ; un autre slug proposé. |
| Demander le dépôt `theonam/depot-inexistant-skeam` | `git ls-remote` échoue ; la commande demande de créer et d'attacher le dépôt, puis s'arrête sans rien écrire ailleurs. |
| Répondre hors des options à la question de validation | Vaut refus : rien n'est créé. |
