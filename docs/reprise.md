# Reprise

*Mis à jour le 2026-11-10.*

## Où on en est

Lot 1 : étapes 0 à 8 faites, mise à jour automatique de l'app en place, nettoyage fait le 2026-11-08. Le module assistante maternelle se valide en usage quotidien ; la recette (étape 9) se fait sur le premier mois réel saisi dans l'app.

Lot 2 (accueil) : étapes 1 à 6 faites (2026-11-10). Le Raccourci iOS (sur un iPhone, 5 passages par jour) applique les actions de `vision/raccourci/actions` puis envoie rappels, calendrier local et anniversaires dans `vision/raccourci`. Prochain : 6b, post-it.

## Contenu du dépôt

| Chemin | Rôle |
|---|---|
| `CLAUDE.md` | Consignes pour Claude (à lire en premier) |
| `docs/` | Décisions, plan, reprise |
| `index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest` | L'app (publiée à la racine du site) |
| `js/semainier.js` | Lecteur du semainier, paramétré par la configuration |
| `tache/` | Code des tâches planifiées (exécuté depuis le dépôt privé `la-vision-tache`) |
| `tests/agendas.test.mjs` | Lecture des agendas sur données fictives |
| `tache/moteur.js`, `tache/planning.mjs` | Moteur de règles (aussi chargé par l'app) et calcul du planning |
| `js/planning.js` | Écran Planning du mois et horaires du parent B |
| `js/outils.js` | Outils partagés (calcul du jour affiché, saisie d'heure) |
| `js/nounou.js`, `js/nounou-calcul.js` | Module assistante maternelle (écran ; calculs testés) |
| `tache/nounou.mjs` | Coche le jour d'école dans l'app de pointage |
| `tests/nounou.test.mjs` | Calculs du module sur créneaux fictifs |
| `js/grille.js`, `tests/grille.test.mjs` | Grille mensuelle (image) et ses tests |
| `tests/moteur.test.mjs` | Moteur sur une famille fictive |
| `js/accueil.js`, `js/texte-jour.js`, `js/meteo.js`, `js/fraicheur.js`, `tache/rebours.js` | Accueil (grand écran) et ses calculs |
| `js/raccourci.js`, `tests/raccourci.test.mjs` | Lecture des données du Raccourci iOS et actions en attente |
| `tests/semainier.test.mjs`, `tests/config-fictive.json` | Tests du lecteur sur données fictives (`node tests/semainier.test.mjs`) |

## Secrets GitHub

Uniquement dans `la-vision-tache` (privé) : `ICS_A`, `ICS_B`, `ICS_C`, `FIREBASE_SA`, `ANTHROPIC_API_KEY`. Déclenchement par un service externe (appel `workflow_dispatch`). Ce dépôt n'en a plus aucun (nettoyage du 2026-11-08).

## Points ouverts

- Les messages et fichiers antérieurs au 2026-11-07 dans l'historique Git contiennent encore des données familiales (tests de faisabilité). Les retirer de l'historique demande une réécriture forcée de `main`, à décider.
