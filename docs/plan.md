# Plan de construction

États : ⬜ à faire · 🟡 en cours · ✅ fait

## Faisabilité — ✅ (2026-11-07)

Agendas iCal, météo, API Claude, Firestore depuis GitHub, cantine par navigateur sans écran, connexion et données protégées sur l'iPad, Raccourcis aller-retour : tout est validé.

## Lot 1 — module assistante maternelle et planning

| # | Étape | État |
|---|---|---|
| 0 | Socle du dépôt : `CLAUDE.md`, `docs/`, anonymisation des tests, workflows Node 22 / actions v5 | ✅ |
| 1a | Changer le mot de passe du compte famille ; désactiver les inscriptions | ✅ |
| 1b | Connexion au compte famille dans Chez Nounou et Diversif (règles encore ouvertes) | ✅ |
| 1c | Règles Firestore limitées à l'UID du compte famille (Chez Nounou, Diversif, La Vision, tests) | ✅ |
| 2 | Schéma Firestore de La Vision : configuration familiale, planning (couches calculé / corrigé), saisies du parent B | ✅ |
| 3 | Coquille de la PWA (connexion, navigation) et import du semainier depuis l'iPhone | ✅ |
| 4 | Tâche planifiée (dépôt privé `la-vision-tache`) : lecture des agendas, calendrier scolaire, jours fériés → Firestore | ✅ |
| 5 | Moteur de règles générique, testé sur données fictives | ✅ |
| 6 | Écran Planning du mois : grille, détail du jour modifiable, horaires du parent B, validation | ✅ |
| 7 | Module assistante maternelle : jour en cours, confirmation du soir, pointage en direct, total de la semaine, lien Chez Nounou | ✅ (validation en usage) |
| 8 | Export de la grille mensuelle (image) | ✅ |
| 9 | Recette sur le premier mois réel saisi dans l'app (sans ancien document en parallèle) | 🟡 |

## Lot 2 — accueil (iPad paysage)

| # | Étape | État |
|---|---|---|
| 1 | Squelette : disposition, écran allumé, fraîcheur des sources | ✅ |
| 2 | Barre du haut, Cette semaine, module assistante maternelle, alerte de la tâche | ✅ |
| 3 | Aujourd'hui : fil du jour, situation des parents, statut de l'enfant 2, calendriers abonnés ; barre commune | ✅ |
| 4 | Météo et conseil d'habillage (température ressentie) | ✅ |
| 5 | Compte à rebours | 🟡 |
| 6 | Rappels, À faire, Courses (Raccourci définitif) | ✅ 2026-11-10 |
| 6b | Post-it (dessin au doigt sur tous les écrans, texte) | ⬜ |
| 7 | Ce soir : cantine, plat du soir | ⬜ |
| 8 | Boutons Raccourcis, essai à distance | ⬜ |

## Lots suivants

- Lot 3 — briefing.
- Lot 4 — habillage (fonds météo, nuit, saison).

## Nettoyage final

2026-11-08 : tests de faisabilité, page de test et workflow retirés du dépôt ; secrets de ce dépôt, ancienne clé du compte de service, documents `vision_test/*` et règle associée supprimés à la main. Les Raccourcis iOS de test sont gardés comme modèle jusqu'au Raccourci définitif (lot 2).
