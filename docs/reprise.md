# Reprise

*Mis à jour le 2026-11-07.*

## Où on en est

Lot 1 : étapes 0 à 2 faites (socle, sécurité Firestore, schéma). Étape 3 en cours : coquille de l'app et import du semainier. Prochaine étape : 4 (tâche planifiée, lecture des agendas).

## Contenu du dépôt

| Chemin | Rôle |
|---|---|
| `CLAUDE.md` | Consignes pour Claude (à lire en premier) |
| `docs/` | Décisions, plan, reprise |
| `tests/faisabilite.mjs` + `.github/workflows/faisabilite.yml` | Tests de faisabilité (lancement manuel) |
| `index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest` | L'app (publiée à la racine du site) |
| `js/semainier.js` | Lecteur du semainier, paramétré par la configuration |
| `tests/semainier.test.mjs`, `tests/config-fictive.json` | Tests du lecteur sur données fictives (`node tests/semainier.test.mjs`) |
| `test-ipad/` | Page de test de l'iPad, à supprimer au nettoyage |

## Secrets GitHub

| Secret | Usage |
|---|---|
| `ICS_*` (deux secrets) | Adresses iCal secrètes des deux agendas |
| `ANTHROPIC_API_KEY` | API Claude |
| `FIREBASE_SA` | Compte de service Firebase (JSON) |
| `CANTINE_COMMUNE`, `CANTINE_ECOLE`, `CANTINE_LOISIRS` | Libellés pour le test de cantine (facultatifs : le test est ignoré s'ils manquent) |

## Points ouverts

- Les messages et fichiers antérieurs au 2026-11-07 dans l'historique Git contiennent encore des données familiales (tests de faisabilité). Les retirer de l'historique demande une réécriture forcée de `main`, à décider.
- Les noms des secrets `ICS_*` contiennent des prénoms. Les renommer demande de recréer les secrets à la main.
