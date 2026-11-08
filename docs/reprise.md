# Reprise

*Mis à jour le 2026-11-08.*

## Où on en est

Lot 1 : étapes 0 à 4 faites (socle, sécurité Firestore, schéma, coquille et semainier, tâche des agendas). Étape 5 en cours : moteur de règles. Prochaine étape : 6 (écran Planning du mois, avec la saisie des horaires du parent B).

## Contenu du dépôt

| Chemin | Rôle |
|---|---|
| `CLAUDE.md` | Consignes pour Claude (à lire en premier) |
| `docs/` | Décisions, plan, reprise |
| `tests/faisabilite.mjs` + `.github/workflows/faisabilite.yml` | Tests de faisabilité (lancement manuel) |
| `index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest` | L'app (publiée à la racine du site) |
| `js/semainier.js` | Lecteur du semainier, paramétré par la configuration |
| `tache/` | Code des tâches planifiées (exécuté depuis le dépôt privé `la-vision-tache`) |
| `tests/agendas.test.mjs` | Lecture des agendas sur données fictives |
| `tache/moteur.mjs`, `tache/planning.mjs` | Moteur de règles et calcul du planning |
| `tests/moteur.test.mjs` | Moteur sur une famille fictive |
| `tests/semainier.test.mjs`, `tests/config-fictive.json` | Tests du lecteur sur données fictives (`node tests/semainier.test.mjs`) |
| `test-ipad/` | Page de test de l'iPad, à supprimer au nettoyage |

## Secrets GitHub

Dans `la-vision-tache` (privé) : `ICS_A`, `ICS_B`, `FIREBASE_SA` ; plus tard `ANTHROPIC_API_KEY`.

Dans ce dépôt (à supprimer au nettoyage) :

| Secret | Usage |
|---|---|
| `ICS_*` (deux secrets) | Adresses iCal secrètes des deux agendas |
| `ANTHROPIC_API_KEY` | API Claude |
| `FIREBASE_SA` | Compte de service Firebase (JSON) |
| `CANTINE_COMMUNE`, `CANTINE_ECOLE`, `CANTINE_LOISIRS` | Libellés pour le test de cantine (facultatifs : le test est ignoré s'ils manquent) |

## Points ouverts

- Les messages et fichiers antérieurs au 2026-11-07 dans l'historique Git contiennent encore des données familiales (tests de faisabilité). Les retirer de l'historique demande une réécriture forcée de `main`, à décider.
- Les noms des secrets `ICS_*` contiennent des prénoms. Les renommer demande de recréer les secrets à la main.
