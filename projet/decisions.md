# Décisions

Décisions prises pendant la pose du socle commun, branche feat/init, à confirmer par Théo à la relecture de la pull request.

## 2026-10-15 Un fichier de temps par agent

- **Décision** : le journal de temps est projet/temps/AAAA-MM-<agent>.jsonl, agent égal au champ agent ; dans un dépôt client l'agent s'appelle <slug>-dev.
- **Raison** : la consigne des agents citait AAAA-MM-claude-code.jsonl, la spécification du dossier AAAA-MM-agent.jsonl ; un fichier par agent évite les conflits entre conversations parallèles.
- **Impact** : CONTRAT.md section 6, CLAUDE-projet.md, validate.py.
- **Source** : Consigne de Théo du 2026-10-15

## 2026-10-15 Plages d'ids par chantier

- **Décision** : dans projet/backlog de skeam-ops, OPS-001 à 099 pour le socle commun, 101 à 199 socle, 201 à 299 catalogue, 301 à 399 cadrage, 401 à 499 dashboard.
- **Raison** : quatre conversations créent des items en parallèle ; des plages disjointes évitent les collisions d'ids.
- **Impact** : README, projet/CLAUDE-projet.md.
- **Source** : Consigne de Théo du 2026-10-15

## 2026-10-15 Slug sans tiret

- **Décision** : un slug ne contient que des minuscules et des chiffres, sans tiret.
- **Raison** : le préfixe des ids est le slug en majuscules ; un tiret rendrait EGM-012 ambigu.
- **Impact** : schemas/commun.schema.json.
- **Source** : Consigne de Théo du 2026-10-15

## 2026-10-15 YAML strict et formats calqués sur Dougs

- **Décision** : YAML lu en sous-ensemble strict par scripts/contrat.py ; TVA des chiffrages en ratio décimal, adresse client en rue, code postal, ville et pays, dougs_id en UUID, comme dans l'API Dougs.
- **Raison** : éviter les pièges du YAML, dates et yes ou no convertis, et transposer les chiffrages sans conversion.
- **Impact** : CONTRAT.md sections 2.1, 4 et 11.3.
- **Source** : Consigne de Théo du 2026-10-15

## 2026-10-15 Commandes réparties entre cadrage et dashboard

- **Décision** : cadrage écrit /nouveau-client, /import-transcript, /cadrage, /chiffrage et /sync-todoist dans skills/ ; dashboard écrit /dashboard, /publier et /calibrer dans dashboard/skills/.
- **Raison** : chaque chantier ne modifie que son dossier.
- **Impact** : CONTRAT.md section 11.7.
- **Source** : Consigne de Théo du 2026-10-15

## 2026-10-16 Temps passé mesuré automatiquement, chiffrage automatique mis de côté

- **Décision** : le temps passé par tâche et par lot, Claude et Théo ensemble, est mesuré automatiquement par un hook Claude Code à chaque commit, dans skeam-ops et egm-app. Le chiffrage automatique, prix conseillé, chiffrer.py, calibrer.py et /skeam-chiffrage, est mis de côté : rien n'est supprimé ni abandonné, on n'y travaille plus.
- **Raison** : seule l'estimation du temps de développement compte pour le pilotage interne ; le temps déclaré par les agents n'était pas fiable, une seule tâche par session, aucun temps de Théo, 31 tâches développées sur 48 sans aucune minute.
- **Impact** : OPS-417, consigne Journal de temps de projet/CLAUDE-projet.md, .claude/ dans skeam-ops et sur les branches main, demo et projet/skeam-ops d'egm-app ; OPS-205 et OPS-105 en attente.
- **Source** : Consigne de Théo du 2026-10-16
