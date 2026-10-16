# E G M — reste à faire

Au 16 octobre 2026. Source : `docs/AUDIT.md` et `docs/PLAN.md` du dépôt `theonam/egm-app`.

## Avant la démo (semaine du 19 octobre)

- [ ] Redéposer en ligne les fichiers du parcours : le déploiement du 16/10 a vidé le disque de Render.
- [ ] Lancer `pnpm demo:check` avec le mot de passe de la démo, sur le site en ligne.
- [ ] Vérifier sur téléphone les écrans aux cibles de 48 px : liste des demandes, fiche demande, fiche devis.
- [ ] Poser la clé `ANTHROPIC_API_KEY` sur Render et lire une vraie commande, si l'accord RGPD est signé ; sinon, commande fictive (`pnpm demo:order-pdf`).
- [ ] Répétition chronométrée du parcours complet sur les vrais appareils (cible : 30 minutes), checklist `docs/JOUR-J.md`.

## Attend le client

| Travail | Heures | Dépend de |
| --- | --- | --- |
| Brancher ses fichiers Excel, référence logement | 2 | Fichiers du client |
| Logo, mentions légales et format de numéro sur le PDF | 2 | Logo, mentions, format |
| Logo et en-tête dans l'interface | 2 | Logo |
| Lecture de vraies commandes : premier appel réel, réglages | 3 | Clé sur Render, devis signé, PDF du client |
| Essais sur ses appareils via `/labo` : stylet, glisser depuis Outlook, installation, appareil photo | 2 | Accès à sa tablette et à un poste Outlook |

## Décisions en attente chez Théo

- Fusion de la branche de travail de la version finale dans `main`.
- Points d'interface à confronter à l'usage réel : ordre de la fiche demande, pastilles, onglet Photo de l'ouvrier (`docs/A-VALIDER-CLIENT.md`).

## À savoir

- La suite de bout en bout dure environ 8 minutes depuis l'ajout du balayage d'accessibilité.
- Les deux tests du tableau de bord échouent si on lance la suite en édition démo : l'écran y est masqué. C'était déjà le cas avant le 16/10. Les contrôles habituels tournent en édition complète, où ils passent.
