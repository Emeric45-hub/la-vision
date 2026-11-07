# Reprise

*Mis à jour le 2026-11-07.*

## Où on en est

Faisabilité terminée. Lot 1, étape 0 (socle du dépôt) en cours. Prochaine étape : 1a (mot de passe, inscriptions désactivées).

## Contenu du dépôt

| Chemin | Rôle |
|---|---|
| `CLAUDE.md` | Consignes pour Claude (à lire en premier) |
| `docs/` | Décisions, plan, reprise |
| `tests/faisabilite.mjs` + `.github/workflows/faisabilite.yml` | Tests de faisabilité (lancement manuel) |
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
