# Plan de construction

États : ⬜ à faire · 🟡 en cours · ✅ fait

## Faisabilité — ✅ (2026-11-07)

Agendas iCal, météo, API Claude, Firestore depuis GitHub, cantine par navigateur sans écran, connexion et données protégées sur l'iPad, Raccourcis aller-retour : tout est validé.

## Lot 1 — module assistante maternelle et planning

| # | Étape | État |
|---|---|---|
| 0 | Socle du dépôt : `CLAUDE.md`, `docs/`, anonymisation des tests, workflows Node 22 / actions v5 | 🟡 |
| 1a | Changer le mot de passe du compte famille ; désactiver les inscriptions | ⬜ |
| 1b | Connexion au compte famille dans Chez Nounou et Diversif (règles encore ouvertes) | ⬜ |
| 1c | Règles Firestore limitées à l'UID du compte famille (Chez Nounou, Diversif, La Vision, tests) | ⬜ |
| 2 | Schéma Firestore de La Vision : configuration familiale, planning (couches calculé / corrigé), saisies du parent B | ⬜ |
| 3 | Coquille de la PWA (connexion, navigation) et import du semainier depuis l'iPhone | ⬜ |
| 4 | Tâche planifiée : lecture des agendas, calendrier scolaire, jours fériés → Firestore | ⬜ |
| 5 | Moteur de règles générique, testé sur données fictives | ⬜ |
| 6 | Écran Planning du mois : grille, détail du jour modifiable, points à vérifier | ⬜ |
| 7 | Module assistante maternelle : jour en cours, confirmation du soir, pointage en direct, total de la semaine, lien Chez Nounou | ⬜ |
| 8 | Export de la grille mensuelle (image / PDF) | ⬜ |
| 9 | Recette sur un mois réel, en parallèle de l'ancien document | ⬜ |

## Lots suivants

- Lot 2 — accueil en lecture seule.
- Lot 3 — briefing.
- Lot 4 — habillage (fonds météo, nuit, saison).

## Nettoyage final

Documents `vision_test/*`, page `test-ipad/`, Raccourcis et automatisations de test.
