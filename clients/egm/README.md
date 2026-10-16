# E G M — application métier

Fiche du projet. Le détail technique et les décisions vivent dans le dépôt du code, `theonam/egm-app` (dossier `docs/`) ; ici, la vue d'ensemble et le suivi.

## En bref

- **Client** : E G M, entreprise générale du bâtiment. Clients : bailleurs sociaux, offices HLM, communes.
- **Lot en cours** : lot 0, démo payée. Le code est réutilisé tel quel pour le MVP.
- **Chaîne métier** : demande de devis → devis → commande client → bon d'intervention → réception → facture ou situation → paiement.
- **Démo** : semaine du 19 octobre 2026, présentée par Théo seul. Critère d'acceptation : le parcours de démo en 8 points (`docs/PLAN.md` du dépôt).
- **Ce qui compte le plus pour le client** : croquis sur tablette, glisser-déposer (« AirDrop »), envoi par Outlook, lecture de PDF de commande.

## Deux versions

| Version | Branche | Rôle |
| --- | --- | --- |
| Démo | `demo` | Strictement le périmètre vendu, badge « Démo ». Déployée automatiquement sur Render à chaque envoi sur la branche. |
| Version finale | branche de travail `claude/laughing-heisenberg-w6w51x`, puis `main` | Celle sur laquelle on avance : design « piste C », pastilles, Factur-X, etc. |

Règle : un correctif de démo se fait dans `demo` puis se reporte dans la version finale ; rien de la version finale n'entre dans la démo sans décision de Théo.

## Hébergement

- Démo : Render gratuit, Francfort, `https://egm-test.onrender.com`. Le service s'endort après 15 minutes ; chaque déploiement efface les fichiers déposés en ligne.
- Version 1 : hébergeur France ou UE, à choisir avec le client. Image Docker standard prête.

## Où trouver quoi

| Sujet | Fichier dans `theonam/egm-app` |
| --- | --- |
| Règles permanentes du projet | `CLAUDE.md` |
| Plan et parcours de démo | `docs/PLAN.md` |
| Statut ligne par ligne du périmètre vendu | `docs/AUDIT.md` |
| Toutes les décisions de Théo, datées | `docs/DECISIONS.md` |
| Checklist du jour J | `docs/JOUR-J.md` |
| Points d'interface à valider avec le client | `docs/A-VALIDER-CLIENT.md` |
| Modèle de données | `docs/DATA_MODEL.md` |

Dans ce dossier : [`journal.md`](journal.md) (ce qui a été fait, jour par jour) et [`a-faire.md`](a-faire.md) (ce qui reste et ce qui attend Théo ou le client).
