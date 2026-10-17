# Relevé de la consommation des agents

Ce dossier relève automatiquement le temps et la consommation des agents Claude Code qui travaillent sur ce dépôt. Format et règles : `CONTRAT.md` section 15 du dépôt `theonam/skeam-ops`, qui installe et met à jour ces fichiers.

| Chemin | Rôle |
|---|---|
| `conso.py` | relevé : relit l'historique de la session Claude Code, une ligne par agent |
| `githooks/pre-commit` | crochet Git qui appelle `conso.py pre-commit` à chaque commit ; ne bloque jamais un commit |
| `conso.json` | version et préfixe des ids d'items de ce dépôt |
| `conso/AAAA-MM-JJ-<session>.jsonl` | un fichier par session : conversation principale, sous-agents et agents de workflow |

## Ce qui est relevé

Pour chaque agent : début, fin, périodes actives, un silence de plus de 15 minutes coupant une période, minutes actives, nombre de réponses du modèle, jetons par modèle, entrée, sortie, lecture et écriture du cache, recherches web, et les items travaillés, trouvés dans le libellé de l'agent, sinon dans les commits faits pendant son activité, pondérés par le temps passé avant chacun, sinon, par estimation, dans ceux des autres agents de son run de workflow quand ils relèvent tous du même projet.

Jamais : contenu de conversation, consigne, chemin, nom de branche, secret, donnée personnelle, coût. Le coût est calculé par le dashboard de skeam-ops, au tarif de l'API.

## Fonctionnement

- Le crochet Git est activé dans chaque clone : en session cloud, par le script d'installation de l'environnement de SKEAM, `templates/environnement/setup-cloud.sh` de skeam-ops ; sur un poste, par `.claude/settings.json`, crochet `SessionStart`, quand la session s'ouvre à la racine du dépôt ; sinon, lancer une fois `python3 .skeam/conso.py installer`. Avant le premier commit d'une session, `python3 .skeam/conso.py verifier` doit répondre « actif ».
- À chaque commit fait depuis une session Claude Code, le crochet réécrit le fichier de la session et l'ajoute au commit en cours, dont le message commence comme toujours par l'id de l'item ; ce commit est déjà rattaché, d'après l'id lu en tête du message de la commande `git commit`.
- L'activité qui suit le dernier commit de travail part avec le commit de `/skeam-bilan`, qui fait le relevé final.
- Hors d'une session Claude Code, le crochet ne fait rien.
- Les branches se fusionnent sans conflit grâce à la ligne `merge=union` de `.gitattributes`.

## Commandes

```sh
python3 .skeam/conso.py verifier                 # le relevé est-il actif ?
python3 .skeam/conso.py installer                # active le crochet Git de ce clone
python3 .skeam/conso.py capturer                 # relevé à la main, par exemple pour une session sans commit
python3 .skeam/conso.py capturer --prefixe EGM   # sur une branche sans .skeam/conso.json, relevé final du bilan
```

Ne jamais modifier, supprimer ni commiter à part un fichier de `conso/` ; seule exception, le rattrapage d'une session terminée sans commit, commité avec l'id de l'item principal de la session.
